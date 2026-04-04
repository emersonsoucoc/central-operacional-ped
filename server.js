const express = require('express');
const fetch   = require('node-fetch');
const cors    = require('cors');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

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

let _cachedToken = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Credenciais não configuradas.');

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
  _tokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
  return _cachedToken;
}

function defaultExpirationDate(daysAhead = 7) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

app.post('/api/gerar-link', async (req, res) => {
  try {
    const { amount, description, installments = 1, paymentOptions = ['credit'], expirationDate } = req.body;

    if (amount === undefined || amount === null) return res.status(400).json({ error: 'O campo "amount" é obrigatório.' });
    if (!description || !description.trim()) return res.status(400).json({ error: 'O campo "description" é obrigatório.' });
    if (description.length > 50) return res.status(400).json({ error: '"description" deve ter no máximo 50 caracteres.' });
    if (!PV) return res.status(500).json({ error: 'Variável REDE_PV não configurada.' });

    const token = await getAccessToken();
    const payload = {
      amount,
      expirationDate: expirationDate || defaultExpirationDate(),
      installments,
      paymentOptions,
      description: description.trim(),
    };

    const apiRes = await fetch(`${BASE_URL}/v1/create`, {
      method: 'POST',
      headers: {
        'Content-Type'  : 'application/json',
        'Authorization' : `Bearer ${token}`,
        'Company-number': String(PV),
      },
      body: JSON.stringify(payload),
    });

    const data = await apiRes.json();
    if (!apiRes.ok) { console.error('Erro e-Rede:', data); return res.status(apiRes.status).json({ error: data }); }
    return res.json({ url: data.url, paymentLinkId: data.paymentLinkId });

  } catch (err) {
    console.error('Erro interno:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_, res) => res.json({ ok: true, env: IS_PROD ? 'production' : 'sandbox' }));

app.get('/api/diagnostico', async (_, res) => {
  const info = {
    env: IS_PROD ? 'production' : 'sandbox',
    tokenUrl: TOKEN_URL,
    baseUrl: BASE_URL,
    clientId: CLIENT_ID ? `${CLIENT_ID.substring(0, 8)}...` : 'NÃO CONFIGURADO',
    clientSecret: CLIENT_SECRET ? `${CLIENT_SECRET.substring(0, 3)}... (${CLIENT_SECRET.length} chars)` : 'NÃO CONFIGURADO',
    pv: PV || 'NÃO CONFIGURADO',
  };
  try {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${credentials}` },
      body: 'grant_type=client_credentials',
    });
    info.oauthTest = { statusCode: r.status, body: await r.text() };
  } catch (e) {
    info.oauthTest = { error: e.message };
  }
  res.json(info);
});

app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`[e-Rede] Porta ${PORT} (${IS_PROD ? 'PRODUÇÃO' : 'SANDBOX'})`));
