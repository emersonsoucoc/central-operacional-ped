/**
 * server.js - Central Operacional Grupo PED
 * Serve o Kanban estatico + API e-Rede (Link de Pagamento)
 *
 * Variaveis de ambiente no Railway:
 *   REDE_CLIENT_ID     - client_id OAuth 2.0
 *   REDE_CLIENT_SECRET - client_secret OAuth 2.0
 *   REDE_PV            - numero do PV (ponto de venda)
 *   NODE_ENV           - "production" para producao
 */

const express = require('express');
const fetch   = require('node-fetch');
const cors    = require('cors');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve arquivos estaticos do Kanban
app.use(express.static(path.join(__dirname, 'dist')));

// Configuracao e-Rede
const PORT          = process.env.PORT || 3000;
const CLIENT_ID     = process.env.REDE_CLIENT_ID;
const CLIENT_SECRET = process.env.REDE_CLIENT_SECRET;
const PV            = process.env.REDE_PV;
const IS_PROD       = process.env.NODE_ENV === 'production';

const TOKEN_URL = 'https://api.userede.com.br/redelabs/oauth2/token';
const BASE_URL  = IS_PROD
  ? 'https://payments-api.useredecloud.com.br/payment-link'
  : 'https://payments-apisandbox.useredecloud.com.br/payment-link';

let _cachedToken = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('REDE_CLIENT_ID e REDE_CLIENT_SECRET nao configurados.');
  }
  const credentials = Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type' : 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + credentials,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Falha ao obter token OAuth2 (' + res.status + '): ' + txt);
  }
  const json = await res.json();
  _cachedToken = json.access_token;
  _tokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
  return _cachedToken;
}

function defaultExpirationDate(daysAhead) {
  daysAhead = daysAhead || 7;
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return mm + '/' + dd + '/' + yyyy;
}

// POST /api/gerar-link
app.post('/api/gerar-link', async (req, res) => {
  try {
    const { amount, description, installments, paymentOptions, expirationDate } = req.body;
    const inst = installments || 1;
    const opts = paymentOptions || ['credit'];

    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: 'O campo amount e obrigatorio.' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'O campo description e obrigatorio.' });
    }
    if (description.length > 50) {
      return res.status(400).json({ error: 'description deve ter no maximo 50 caracteres.' });
    }
    if (!PV) {
      return res.status(500).json({ error: 'Variavel REDE_PV nao configurada.' });
    }

    const token = await getAccessToken();

    const payload = {
      amount,
      expirationDate : expirationDate || defaultExpirationDate(),
      installments   : inst,
      paymentOptions : opts,
      description    : description.trim(),
    };

    const apiRes = await fetch(BASE_URL + '/v1/create', {
      method : 'POST',
      headers: {
        'Content-Type'  : 'application/json',
        'Authorization' : 'Bearer ' + token,
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
    return res.status(500).json({ error: err.message || 'Erro interno.' });
  }
});

// Health check
app.get('/health', function(req, res) {
  res.json({ ok: true, env: IS_PROD ? 'production' : 'sandbox' });
});

// Fallback SPA
app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, function() {
  console.log('[e-Rede] Servidor na porta ' + PORT + ' (' + (IS_PROD ? 'PRODUCAO' : 'SANDBOX') + ')');
});
