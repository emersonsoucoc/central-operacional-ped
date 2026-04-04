/**
 * Backend Railway — Link de Pagamento e-Rede
 *
 * Variáveis de ambiente obrigatórias no Railway:
 *   REDE_CLIENT_ID     → client_id OAuth 2.0 fornecido pela Rede
 *   REDE_CLIENT_SECRET → client_secret OAuth 2.0 fornecido pela Rede
 *   REDE_PV            → número do PV (ponto de venda) do estabelecimento
 *   NODE_ENV           → "production" para usar a URL de produção
 *                        (qualquer outro valor usa o Sandbox)
 *
 * Endpoint exposto:
 *   POST /api/gerar-link
 */

const express = require('express');
const fetch   = require('node-fetch');
const cors    = require('cors');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Serve frontend SPA (arquivos estáticos) ───────────────────────────────
const STATIC_DIR = path.join(__dirname, 'dist');
app.use(express.static(STATIC_DIR));
// Fallback: qualquer rota não-API devolve o index.html (hash routing)
app.get('/', (_, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));

// ─── Configuração ──────────────────────────────────────────────────────────
const PORT          = process.env.PORT || 3000;
const CLIENT_ID     = process.env.REDE_CLIENT_ID;
const CLIENT_SECRET = process.env.REDE_CLIENT_SECRET;
const PV            = process.env.REDE_PV;
const IS_PROD       = process.env.NODE_ENV === 'production';

const TOKEN_URL = IS_PROD
  ? 'https://api.userede.com.br/redelabs/oauth2/token'
  : 'https://rl7-sandbox-api.useredecloud.com.br/oauth2/token';
const BASE_URL  = IS_PROD
  ? 'https://payments-api.useredecloud.com.br/payment-link'
  : 'https://payments-apisandbox.useredecloud.com.br/payment-link';

// ─── Cache de token (válido por 24 min; renovamos 60 s antes) ──────────────
let _cachedToken = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('REDE_CLIENT_ID e REDE_CLIENT_SECRET não configurados.');
  }

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type' : 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha ao obter token OAuth2 (${res.status}): ${txt}`);
  }

  const json = await res.json();
  _cachedToken = json.access_token;
  // expires_in vem em segundos (1440 = 24 min); subtraímos 60 s de margem
  _tokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
  return _cachedToken;
}

// ─── Utilidade: data de expiração padrão (+7 dias, formato MM/DD/YYYY) ─────
function defaultExpirationDate(daysAhead = 7) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// ─── POST /api/gerar-link ──────────────────────────────────────────────────
/**
 * Body esperado (JSON):
 * {
 *   "amount"        : 350.00,          // valor em reais (aceita decimal)
 *   "description"   : "Mensalidade Jan/2025 – Escola Alfa",
 *   "installments"  : 1,               // parcelas (1–12), opcional
 *   "paymentOptions": ["credit"],      // ["credit"] e/ou ["pix"], opcional
 *   "expirationDate": "12/31/2025"     // MM/DD/YYYY, opcional (padrão: +7 dias)
 * }
 *
 * Resposta de sucesso (200):
 * {
 *   "url"           : "https://...userede.com.br/pagamentos/pt/XXXXX",
 *   "paymentLinkId" : "XXXXX"
 * }
 */
app.post('/api/gerar-link', async (req, res) => {
  try {
    const {
      amount,
      description,
      installments  = 1,
      paymentOptions = ['credit'],
      expirationDate,
    } = req.body;

    // Validações básicas
    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: 'O campo "amount" é obrigatório.' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'O campo "description" é obrigatório.' });
    }
    if (description.length > 50) {
      return res.status(400).json({ error: '"description" deve ter no máximo 50 caracteres.' });
    }
    if (!PV) {
      return res.status(500).json({ error: 'Variável REDE_PV não configurada no servidor.' });
    }

    const token = await getAccessToken();

    const payload = {
      amount,
      expirationDate : expirationDate || defaultExpirationDate(),
      installments,
      paymentOptions,
      description    : description.trim(),
    };

    const apiRes = await fetch(`${BASE_URL}/v1/create`, {
      method : 'POST',
      headers: {
        'Content-Type'  : 'application/json',
        'Authorization' : `Bearer ${token}`,
        'Company-number': String(PV),
      },
      body: JSON.stringify(payload),
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      console.error('Erro e-Rede:', data);
      return res.status(apiRes.status).json({ error: data });
    }

    return res.json({ url: data.url, paymentLinkId: data.paymentLinkId });

  } catch (err) {
    console.error('Erro interno:', err.message);
    return res.status(500).json({ error: err.message || 'Erro interno ao gerar link.' });
  }
});

// ─── GET /api/status-link/:paymentLinkId — consulta status na e-Rede ──────
/**
 * Retorna os dados do link de pagamento (status, transações, etc.)
 * Usado pelo frontend para gerar o comprovante ao confirmar pagamento.
 */
app.get('/api/status-link/:paymentLinkId', async (req, res) => {
  try {
    const { paymentLinkId } = req.params;

    if (!PV) {
      return res.status(500).json({ error: 'Variável REDE_PV não configurada.' });
    }

    const token = await getAccessToken();

    const apiRes = await fetch(`${BASE_URL}/v1/${paymentLinkId}`, {
      method : 'GET',
      headers: {
        'Authorization' : `Bearer ${token}`,
        'Company-number': String(PV),
      },
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      console.error('Erro status e-Rede:', data);
      return res.status(apiRes.status).json({ error: data });
    }

    return res.json(data);

  } catch (err) {
    console.error('Erro ao consultar status do link:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, env: IS_PROD ? 'production' : 'sandbox' }));

// ─── Diagnóstico OAuth2 ────────────────────────────────────────────────────
app.get('/api/diagnostico', async (_, res) => {
  const clientIdOk = !!CLIENT_ID;
  const clientSecretOk = !!CLIENT_SECRET;
  const pvOk = !!PV;

  const info = {
    env: IS_PROD ? 'production' : 'sandbox',
    tokenUrl: TOKEN_URL,
    baseUrl: BASE_URL,
    clientId: CLIENT_ID ? `${CLIENT_ID.substring(0, 8)}...` : 'NÃO CONFIGURADO',
    clientSecret: CLIENT_SECRET ? `${CLIENT_SECRET.substring(0, 3)}... (${CLIENT_SECRET.length} chars)` : 'NÃO CONFIGURADO',
    pv: PV || 'NÃO CONFIGURADO',
    config: { clientIdOk, clientSecretOk, pvOk },
  };

  // Tenta obter o token e reporta o resultado completo
  try {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type' : 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: 'grant_type=client_credentials',
    });
    const statusCode = r.status;
    const body = await r.text();
    info.oauthTest = { statusCode, body };
  } catch (e) {
    info.oauthTest = { error: e.message };
  }

  res.json(info);
});

// ─── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[e-Rede] Server rodando na porta ${PORT} (${IS_PROD ? 'PRODUÇÃO' : 'SANDBOX'})`);
});
