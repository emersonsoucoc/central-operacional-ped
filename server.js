/**
 * Central Operacional - Grupo PED
 * Backend Railway v2 - e-Rede + PostgreSQL
 */

const express  = require('express');
const fetch    = require('node-fetch');
const cors     = require('cors');
const path     = require('path');
const { Pool } = require('pg');

const app = express();

/* ── CORS: restringe origens em produção ── */
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin(origin, cb) {
    // Permite requests sem origin (curl, mobile, mesmo domínio)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));

/* ── Rate-limiter simples (sem dependência externa) ── */
const _rateMap = new Map();
function rateLimit(maxReqs = 60, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = _rateMap.get(ip) || { count: 0, start: now };
    if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
    entry.count++;
    _rateMap.set(ip, entry);
    if (entry.count > maxReqs) {
      return res.status(429).json({ error: 'Muitas requisicoes. Tente novamente em breve.' });
    }
    next();
  };
}
app.use('/api/', rateLimit(120, 60000));   // 120 req/min global para /api
// Limpar mapa de rate a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of _rateMap) {
    if (now - entry.start > 120000) _rateMap.delete(ip);
  }
}, 300000);

// Serve o frontend (index.html, app.js, app.css estao na mesma pasta)
app.use(express.static(__dirname));

const PORT    = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Verifica credenciais do banco
if (!process.env.PGHOST && !process.env.DATABASE_URL) {
  console.error('[FATAL] Credenciais do PostgreSQL nao definidas! (PGHOST ou DATABASE_URL)');
  process.exit(1);
}

// Pool PostgreSQL - usa variaveis PG* individuais (mais confiavel no Railway)
const pool = new Pool(process.env.PGHOST ? {
  host:     process.env.PGHOST,
  port:     parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE || 'railway',
  user:     process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  ssl:      { rejectUnauthorized: false },
  max:      10,
  idleTimeoutMillis: 30000,
} : {
  connectionString: process.env.DATABASE_URL,
  ssl:  { rejectUnauthorized: false },
  max:  10,
  idleTimeoutMillis: 30000,
});

console.log('[DB] Conectando a:', process.env.PGHOST || '(via DATABASE_URL)', 'db:', process.env.PGDATABASE || 'railway');

pool.on('error', (err) => {
  console.error('[DB] Erro:', err.message);
});

// Init DB: cria tabela se nao existir
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cards (
      id               TEXT        PRIMARY KEY,
      modulo           TEXT        NOT NULL,
      fase             TEXT        NOT NULL,
      position         INTEGER     NOT NULL DEFAULT 0,
      titulo           TEXT        NOT NULL DEFAULT '',
      descricao        TEXT                 DEFAULT '',
      escola           TEXT        NOT NULL DEFAULT '',
      categoria        TEXT                 DEFAULT '',
      prioridade       TEXT                 DEFAULT 'media',
      responsavel      TEXT                 DEFAULT '',
      prazo            TEXT                 DEFAULT '',
      criado_em        TEXT                 DEFAULT '',
      valor            TEXT                 DEFAULT '0',
      fornecedor       TEXT                 DEFAULT '',
      num_doc          TEXT                 DEFAULT '',
      vencimento       TEXT                 DEFAULT '',
      tipo_pagamento   TEXT                 DEFAULT 'pix',
      link_pagamento   TEXT                 DEFAULT '',
      codigo_transacao TEXT                 DEFAULT '',
      link_status      TEXT                 DEFAULT 'pendente',
      comentarios      JSONB       NOT NULL DEFAULT '[]',
      historico        JSONB       NOT NULL DEFAULT '[]',
      anexos           JSONB       NOT NULL DEFAULT '[]',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_cards_modulo_fase ON cards (modulo, fase, position);
    CREATE INDEX IF NOT EXISTS idx_cards_escola      ON cards (escola);

    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_cards_updated_at ON cards;
    CREATE TRIGGER trg_cards_updated_at
      BEFORE UPDATE ON cards FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
  `);
  console.log('[DB] Tabela cards pronta.');

  /* ── Tabela settings: key-value para configurações ── */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT        PRIMARY KEY,
      value       JSONB       NOT NULL DEFAULT '{}',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    DROP TRIGGER IF EXISTS trg_settings_updated_at ON settings;
    CREATE TRIGGER trg_settings_updated_at
      BEFORE UPDATE ON settings FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
  `);
  console.log('[DB] Tabela settings pronta.');
}

function rowToCard(r) {
  return {
    id: r.id, modulo: r.modulo, fase: r.fase, position: r.position,
    titulo: r.titulo, descricao: r.descricao, escola: r.escola,
    categoria: r.categoria, prioridade: r.prioridade,
    responsavel: r.responsavel, prazo: r.prazo, criadoEm: r.criado_em,
    valor: r.valor, fornecedor: r.fornecedor, numDoc: r.num_doc,
    vencimento: r.vencimento, tipoPagamento: r.tipo_pagamento,
    linkPagamento: r.link_pagamento, codigoTransacao: r.codigo_transacao,
    linkStatus: r.link_status,
    comentarios: r.comentarios || [], historico: r.historico || [], anexos: r.anexos || [],
  };
}

/* ── Validação de card ── */
const VALID_PRIORIDADES = ['baixa', 'media', 'alta', 'urgente'];
const VALID_LINK_STATUS = ['pendente', 'ativo', 'pago', 'expirado'];

function validateCardBody(c) {
  if (!c || typeof c !== 'object') return 'Body invalido.';
  if (!c.id || typeof c.id !== 'string') return 'Campo "id" obrigatorio (string).';
  if (!c.modulo || typeof c.modulo !== 'string') return 'Campo "modulo" obrigatorio (string).';
  if (!c.fase || typeof c.fase !== 'string') return 'Campo "fase" obrigatorio (string).';
  if (c.prioridade && !VALID_PRIORIDADES.includes(c.prioridade)) return 'Prioridade invalida.';
  if (c.linkStatus && !VALID_LINK_STATUS.includes(c.linkStatus)) return 'linkStatus invalido.';
  return null;
}

/* ── Rotas CRUD de cards ── */

app.get('/api/cards', async (req, res) => {
  try {
    const { modulo, escola } = req.query;
    let q = 'SELECT * FROM cards'; const v = []; const c = [];
    if (modulo && typeof modulo === 'string') { c.push('modulo = $' + (v.length + 1)); v.push(modulo); }
    if (escola && typeof escola === 'string') { c.push('escola = $'  + (v.length + 1)); v.push(escola);  }
    if (c.length) q += ' WHERE ' + c.join(' AND ');
    q += ' ORDER BY modulo, fase, position, created_at DESC';
    const { rows } = await pool.query(q, v);
    res.json(rows.map(rowToCard));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/cards', async (req, res) => {
  try {
    const c = req.body;
    const err = validateCardBody(c);
    if (err) return res.status(400).json({ error: err });

    const { rows: pr } = await pool.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM cards WHERE modulo = $1 AND fase = $2',
      [c.modulo, c.fase]);
    const pos = pr[0].next_pos;
    const { rows } = await pool.query(
      'INSERT INTO cards (id,modulo,fase,position,titulo,descricao,escola,categoria,prioridade,responsavel,prazo,criado_em,valor,fornecedor,num_doc,vencimento,tipo_pagamento,link_pagamento,codigo_transacao,link_status,comentarios,historico,anexos) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *',
      [c.id, c.modulo, c.fase, pos, c.titulo||'', c.descricao||'', c.escola||'', c.categoria||'', c.prioridade||'media',
       c.responsavel||'', c.prazo||'', c.criadoEm||'', c.valor||'0', c.fornecedor||'', c.numDoc||'',
       c.vencimento||'', c.tipoPagamento||'pix', c.linkPagamento||'', c.codigoTransacao||'', c.linkStatus||'pendente',
       JSON.stringify(c.comentarios||[]), JSON.stringify(c.historico||[]), JSON.stringify(c.anexos||[])]);
    res.status(201).json(rowToCard(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/cards/:id', async (req, res) => {
  try {
    const { id } = req.params; const c = req.body;
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id invalido.' });

    const { rows } = await pool.query(
      'UPDATE cards SET modulo=$1,fase=$2,titulo=$3,descricao=$4,escola=$5,categoria=$6,prioridade=$7,responsavel=$8,prazo=$9,criado_em=$10,valor=$11,fornecedor=$12,num_doc=$13,vencimento=$14,tipo_pagamento=$15,link_pagamento=$16,codigo_transacao=$17,link_status=$18,comentarios=$19,historico=$20,anexos=$21 WHERE id=$22 RETURNING *',
      [c.modulo||'', c.fase||'', c.titulo||'', c.descricao||'', c.escola||'', c.categoria||'', c.prioridade||'media',
       c.responsavel||'', c.prazo||'', c.criadoEm||'', c.valor||'0', c.fornecedor||'', c.numDoc||'',
       c.vencimento||'', c.tipoPagamento||'pix', c.linkPagamento||'', c.codigoTransacao||'', c.linkStatus||'pendente',
       JSON.stringify(c.comentarios||[]), JSON.stringify(c.historico||[]), JSON.stringify(c.anexos||[]), id]);
    if (!rows.length) return res.status(404).json({ error: 'Card nao encontrado.' });
    res.json(rowToCard(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/cards/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id invalido.' });
    const result = await pool.query('DELETE FROM cards WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Card nao encontrado.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/cards/move', async (req, res) => {
  const client = await pool.connect();
  try {
    const { cardId, newFase, newPosition = 0 } = req.body;
    if (!cardId || typeof cardId !== 'string') return res.status(400).json({ error: 'cardId obrigatorio (string).' });
    if (!newFase || typeof newFase !== 'string') return res.status(400).json({ error: 'newFase obrigatorio (string).' });
    if (typeof newPosition !== 'number' || newPosition < 0) return res.status(400).json({ error: 'newPosition invalido.' });

    await client.query('BEGIN');
    const { rows: cr } = await client.query('SELECT * FROM cards WHERE id = $1', [cardId]);
    if (!cr.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Card nao encontrado.' }); }
    const card = cr[0];
    await client.query('UPDATE cards SET position = position + 1 WHERE modulo = $1 AND fase = $2 AND position >= $3 AND id != $4',
      [card.modulo, newFase, newPosition, cardId]);
    await client.query('UPDATE cards SET fase = $1, position = $2 WHERE id = $3', [newFase, newPosition, cardId]);
    if (card.fase !== newFase) {
      await client.query('WITH ranked AS (SELECT id, ROW_NUMBER() OVER (ORDER BY position, created_at) - 1 AS rn FROM cards WHERE modulo = $1 AND fase = $2) UPDATE cards SET position = ranked.rn FROM ranked WHERE cards.id = ranked.id',
        [card.modulo, card.fase]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

/* ── Rotas CRUD de settings ── */

// GET /api/settings — retorna todas as configurações
app.get('/api/settings', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const result = {};
    for (const r of rows) result[r.key] = r.value;
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/settings/:key — retorna uma seção específica
app.get('/api/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key invalida.' });
    const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (!rows.length) return res.status(404).json({ error: 'Configuracao nao encontrada.' });
    res.json(rows[0].value);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/settings/:key — cria ou atualiza uma seção
app.put('/api/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const value = req.body;
    if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key invalida.' });
    if (key.length > 100) return res.status(400).json({ error: 'key muito longa (max 100).' });
    if (value === undefined || value === null) return res.status(400).json({ error: 'Body (value) obrigatorio.' });

    const { rows } = await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
       RETURNING *`,
      [key, JSON.stringify(value)]
    );
    res.json(rows[0].value);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/settings — salva múltiplas seções de uma vez
app.put('/api/settings', async (req, res) => {
  const client = await pool.connect();
  try {
    const data = req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data))
      return res.status(400).json({ error: 'Body deve ser um objeto { key: value, ... }.' });

    await client.query('BEGIN');
    for (const [key, value] of Object.entries(data)) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(value)]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

// DELETE /api/settings/:key — remove uma chave de settings
app.delete('/api/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key invalida.' });
    const result = await pool.query('DELETE FROM settings WHERE key = $1', [key]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Configuracao nao encontrada.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── Integração e-Rede — Link de Pagamento ── */

const CLIENT_ID     = process.env.REDE_CLIENT_ID;
const CLIENT_SECRET = process.env.REDE_CLIENT_SECRET;
const PV            = process.env.REDE_PV;
const TOKEN_URL = IS_PROD
  ? 'https://api.userede.com.br/redelabs/oauth2/token'
  : 'https://rl7-sandbox-api.useredecloud.com.br/oauth2/token';
const BASE_URL = IS_PROD
  ? 'https://payments-api.useredecloud.com.br/payment-link'
  : 'https://payments-apisandbox.useredecloud.com.br/payment-link';

let _cachedToken = null, _tokenExpiry = 0;
async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Credenciais e-Rede nao configuradas.');
  const cred = Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + cred },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) { const t = await res.text(); throw new Error('OAuth2 falhou (' + res.status + '): ' + t); }
  const json = await res.json();
  _cachedToken = json.access_token;
  _tokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
  return _cachedToken;
}

function defaultExpirationDate(d = 7) {
  const dt = new Date(); dt.setDate(dt.getDate() + d);
  return String(dt.getMonth() + 1).padStart(2, '0') + '/' + String(dt.getDate()).padStart(2, '0') + '/' + dt.getFullYear();
}

app.post('/api/gerar-link', rateLimit(10, 60000), async (req, res) => {
  try {
    const { amount, description, installments = 1, paymentOptions = ['credit'], expirationDate } = req.body;

    // Validação de entrada
    if (amount == null || typeof amount !== 'number' || amount <= 0)
      return res.status(400).json({ error: '"amount" deve ser um numero positivo.' });
    if (!description?.trim())
      return res.status(400).json({ error: '"description" obrigatorio.' });
    if (description.length > 50)
      return res.status(400).json({ error: '"description" max 50 chars.' });
    if (!Number.isInteger(installments) || installments < 1 || installments > 12)
      return res.status(400).json({ error: '"installments" deve ser entre 1 e 12.' });
    if (!Array.isArray(paymentOptions) || !paymentOptions.length)
      return res.status(400).json({ error: '"paymentOptions" deve ser um array nao vazio.' });
    if (!PV)
      return res.status(500).json({ error: 'REDE_PV nao configurado.' });

    const token = await getAccessToken();
    const apiRes = await fetch(BASE_URL + '/v1/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'Company-number': String(PV) },
      body: JSON.stringify({ amount, expirationDate: expirationDate || defaultExpirationDate(), installments, paymentOptions, description: description.trim() })
    });
    const data = await apiRes.json();
    if (!apiRes.ok) return res.status(apiRes.status).json({ error: data });
    res.json({ url: data.url, paymentLinkId: data.paymentLinkId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/status-link/:paymentLinkId', async (req, res) => {
  try {
    if (!PV) return res.status(500).json({ error: 'REDE_PV nao configurado.' });
    const linkId = encodeURIComponent(req.params.paymentLinkId);
    const token = await getAccessToken();
    const apiRes = await fetch(BASE_URL + '/v1/' + linkId, {
      headers: { 'Authorization': 'Bearer ' + token, 'Company-number': String(PV) }
    });
    const data = await apiRes.json();
    if (!apiRes.ok) return res.status(apiRes.status).json({ error: data });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── Health / Diagnóstico ── */

app.get('/health', async (_, res) => {
  let dbOk = false;
  try { await pool.query('SELECT 1'); dbOk = true; } catch (_) {}
  res.json({ ok: true, env: IS_PROD ? 'production' : 'sandbox', db: dbOk });
});

app.get('/api/diagnostico', async (_, res) => {
  const info = {
    env: IS_PROD ? 'production' : 'sandbox',
    tokenUrl: TOKEN_URL, baseUrl: BASE_URL,
    clientId: CLIENT_ID ? CLIENT_ID.substring(0, 8) + '...' : 'NAO CONFIGURADO',
    pv: PV || 'NAO CONFIGURADO',
    pgHost: process.env.PGHOST || 'nao definido',
    pgDb:   process.env.PGDATABASE || 'nao definido',
  };
  try {
    const cred = Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64');
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + cred },
      body: 'grant_type=client_credentials'
    });
    info.oauthTest = { statusCode: r.status, body: await r.text() };
  } catch (e) { info.oauthTest = { error: e.message }; }
  res.json(info);
});

/* ── Tratamento global de erros não capturados ── */
process.on('unhandledRejection', (err) => {
  console.error('[ERROR] Unhandled rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[ERROR] Uncaught exception:', err);
  process.exit(1);
});

/* ── Inicialização ── */
initDB()
  .then(() => {
    app.listen(PORT, () => { console.log('[Central PED] Servidor na porta ' + PORT); });
  })
  .catch(err => {
    console.error('[FATAL] Falha ao iniciar DB:', err.message);
    process.exit(1);
  });
