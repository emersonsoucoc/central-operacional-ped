/**
 * Central Operacional - Grupo PED
 * Backend Railway v3 - Autenticação JWT + bcrypt + Automações Server-Side
 */

'use strict';

const express   = require('express');
const fetch     = require('node-fetch');
const cors      = require('cors');
const path      = require('path');
const { Pool }  = require('pg');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');

const app = express();

/* ══════════════════════════════════════════════════════════
   CONFIGURAÇÃO
══════════════════════════════════════════════════════════ */
const PORT      = process.env.PORT || 3000;
const IS_PROD   = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const BCRYPT_ROUNDS = 10;

if (!IS_PROD && !process.env.JWT_SECRET) {
  console.warn('[WARN] JWT_SECRET nao definido — usando chave aleatoria (sessoes perdem-se ao reiniciar).');
}

/* ── CORS ── */
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));

/* ── Rate-limiter simples ── */
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
app.use('/api/', rateLimit(120, 60000));
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of _rateMap) {
    if (now - entry.start > 120000) _rateMap.delete(ip);
  }
}, 300000);

/* ── Arquivos estáticos (frontend) ── */
app.use(express.static(__dirname));

/* ══════════════════════════════════════════════════════════
   POSTGRESQL
══════════════════════════════════════════════════════════ */
if (!process.env.PGHOST && !process.env.DATABASE_URL) {
  console.error('[FATAL] Credenciais do PostgreSQL nao definidas!');
  process.exit(1);
}

const pool = new Pool(process.env.PGHOST ? {
  host:     process.env.PGHOST,
  port:     parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE || 'railway',
  user:     process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  ssl:      { rejectUnauthorized: false },
  max: 10, idleTimeoutMillis: 30000,
} : {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10, idleTimeoutMillis: 30000,
});

console.log('[DB] Conectando a:', process.env.PGHOST || '(via DATABASE_URL)');
pool.on('error', (err) => console.error('[DB] Erro:', err.message));

/* ── initDB: cria todas as tabelas ── */
async function initDB() {
  /* Tabela cards */
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

  /* Tabela settings (key-value) */
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

  /* Tabela usuarios (autenticação) */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id           TEXT        PRIMARY KEY,
      nome         TEXT        NOT NULL,
      email        TEXT        UNIQUE NOT NULL,
      senha_hash   TEXT        NOT NULL,
      role         TEXT        NOT NULL DEFAULT 'Operacional',
      initials     TEXT        DEFAULT '',
      school       TEXT        DEFAULT 'all',
      active       BOOLEAN     NOT NULL DEFAULT true,
      permissoes   JSONB       NOT NULL DEFAULT '{}',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);

    DROP TRIGGER IF EXISTS trg_usuarios_updated_at ON usuarios;
    CREATE TRIGGER trg_usuarios_updated_at
      BEFORE UPDATE ON usuarios FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
  `);
  console.log('[DB] Tabela usuarios pronta.');

  /* Tabela automacoes (workflow server-side) */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automacoes (
      id           TEXT        PRIMARY KEY,
      nome         TEXT        NOT NULL,
      ativo        BOOLEAN     NOT NULL DEFAULT true,
      trigger_tipo TEXT        NOT NULL,
      trigger_config JSONB     NOT NULL DEFAULT '{}',
      acao_tipo    TEXT        NOT NULL,
      acao_config  JSONB       NOT NULL DEFAULT '{}',
      modulo       TEXT        DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    DROP TRIGGER IF EXISTS trg_automacoes_updated_at ON automacoes;
    CREATE TRIGGER trg_automacoes_updated_at
      BEFORE UPDATE ON automacoes FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
  `);
  console.log('[DB] Tabela automacoes pronta.');

  /* Tabela tickets (atendimento interno) */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id           TEXT        PRIMARY KEY,
      escola       TEXT        NOT NULL DEFAULT '',
      assunto      TEXT        NOT NULL DEFAULT '',
      descricao    TEXT                 DEFAULT '',
      solicitante  TEXT        NOT NULL DEFAULT '',
      atendente    TEXT                 DEFAULT '',
      status       TEXT        NOT NULL DEFAULT 'waiting',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_escola ON tickets (escola);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);

    DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
    CREATE TRIGGER trg_tickets_updated_at
      BEFORE UPDATE ON tickets FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();

    CREATE TABLE IF NOT EXISTS ticket_mensagens (
      id         TEXT        PRIMARY KEY,
      ticket_id  TEXT        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      autor      TEXT        NOT NULL DEFAULT '',
      texto      TEXT        NOT NULL DEFAULT '',
      tipo       TEXT        NOT NULL DEFAULT 'message',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_msgs_ticket ON ticket_mensagens (ticket_id, created_at);
  `);
  console.log('[DB] Tabelas tickets e ticket_mensagens prontas.');

  /* Seed: admin default (se nao existir nenhum) */
  const { rowCount } = await pool.query('SELECT 1 FROM usuarios LIMIT 1');
  if (rowCount === 0) {
    const hash = await bcrypt.hash('admin123', BCRYPT_ROUNDS);
    const perms = {
      solicitacoes: ['ver','criar','editar','aprovar'],
      contas_pagar: ['ver','criar','editar','aprovar'],
      contas_receber: ['ver','criar','editar','aprovar'],
      compras: ['ver','criar','editar','aprovar'],
      processos: ['ver','criar','editar','aprovar'],
      ti: ['ver','criar','editar','aprovar'],
      central_pagamentos: ['ver','criar','editar','aprovar'],
    };
    await pool.query(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, initials, school, active, permissoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      ['u1', 'Emerson Santos', 'emerson@grupoped.com.br', hash, 'Super Admin', 'ES', 'all', true, JSON.stringify(perms)]
    );
    console.log('[DB] Usuario admin criado: emerson@grupoped.com.br / admin123');
  }
}

/* ══════════════════════════════════════════════════════════
   AUTENTICAÇÃO — JWT + bcrypt
══════════════════════════════════════════════════════════ */

function gerarToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, nome: user.nome },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/* Middleware: verifica token JWT */
function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token nao fornecido.' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado. Faca login novamente.' });
    }
    return res.status(401).json({ error: 'Token invalido.' });
  }
}

/* Middleware: exige role específico */
function exigirRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado. Permissao insuficiente.' });
    }
    next();
  };
}

/* ── POST /api/login ── */
app.post('/api/login', rateLimit(10, 60000), async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha sao obrigatorios.' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM usuarios WHERE LOWER(email) = LOWER($1) AND active = true',
      [email.trim()]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const user = rows[0];
    const senhaOk = await bcrypt.compare(password, user.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const token = gerarToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        initials: user.initials,
        school: user.school,
        permissoes: user.permissoes,
      },
    });
  } catch (err) {
    console.error('[LOGIN] Erro:', err.message);
    res.status(500).json({ error: 'Erro interno no login.' });
  }
});

/* ── POST /api/register (protegido, só Super Admin) ── */
app.post('/api/register', verificarToken, exigirRole('Super Admin'), async (req, res) => {
  try {
    const { nome, email, password, role, initials, school, permissoes } = req.body;
    if (!nome || !email || !password) {
      return res.status(400).json({ error: 'nome, email e password obrigatorios.' });
    }

    const { rowCount } = await pool.query('SELECT 1 FROM usuarios WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (rowCount > 0) return res.status(409).json({ error: 'Email ja cadastrado.' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const id = 'u' + Date.now().toString(36);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, initials, school, permissoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, nome, email, role, initials, school, active, permissoes`,
      [id, nome, email.trim().toLowerCase(), hash, role || 'Operacional', initials || nome.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase(), school || 'all', JSON.stringify(permissoes || {})]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── GET /api/usuarios (protegido) ── */
app.get('/api/usuarios', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nome, email, role, initials, school, active, permissoes, created_at FROM usuarios ORDER BY nome'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── PUT /api/usuarios/:id (protegido, Super Admin) ── */
app.put('/api/usuarios/:id', verificarToken, exigirRole('Super Admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, email, password, role, initials, school, active, permissoes } = req.body;

    let setClauses = [];
    let values = [];
    let idx = 1;

    if (nome !== undefined) { setClauses.push(`nome = $${idx++}`); values.push(nome); }
    if (email !== undefined) { setClauses.push(`email = $${idx++}`); values.push(email.trim().toLowerCase()); }
    if (password) {
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      setClauses.push(`senha_hash = $${idx++}`); values.push(hash);
    }
    if (role !== undefined) { setClauses.push(`role = $${idx++}`); values.push(role); }
    if (initials !== undefined) { setClauses.push(`initials = $${idx++}`); values.push(initials); }
    if (school !== undefined) { setClauses.push(`school = $${idx++}`); values.push(school); }
    if (active !== undefined) { setClauses.push(`active = $${idx++}`); values.push(active); }
    if (permissoes !== undefined) { setClauses.push(`permissoes = $${idx++}`); values.push(JSON.stringify(permissoes)); }

    if (!setClauses.length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE usuarios SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, nome, email, role, initials, school, active, permissoes`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario nao encontrado.' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── DELETE /api/usuarios/:id (protegido, Super Admin) ── */
app.delete('/api/usuarios/:id', verificarToken, exigirRole('Super Admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ error: 'Nao pode excluir a si mesmo.' });
    const result = await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Usuario nao encontrado.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── POST /api/change-password (usuário autenticado) ── */
app.post('/api/change-password', verificarToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Senhas obrigatorias.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Nova senha deve ter no minimo 6 caracteres.' });

    const { rows } = await pool.query('SELECT senha_hash FROM usuarios WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario nao encontrado.' });

    const ok = await bcrypt.compare(currentPassword, rows[0].senha_hash);
    if (!ok) return res.status(401).json({ error: 'Senha atual incorreta.' });

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true, message: 'Senha alterada com sucesso.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── GET /api/me (dados do usuario logado) ── */
app.get('/api/me', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nome, email, role, initials, school, active, permissoes FROM usuarios WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario nao encontrado.' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   ROTAS CRUD DE CARDS (protegidas por JWT)
══════════════════════════════════════════════════════════ */

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

app.get('/api/cards', verificarToken, async (req, res) => {
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

app.post('/api/cards', verificarToken, async (req, res) => {
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

    const newCard = rowToCard(rows[0]);

    // Motor de automações server-side: verifica triggers após criar card
    executeAutomacoes('card_created', newCard).catch(e => console.error('[AUTO]', e.message));

    res.status(201).json(newCard);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/cards/:id', verificarToken, async (req, res) => {
  try {
    const { id } = req.params; const c = req.body;
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id invalido.' });

    // Busca fase anterior para detectar mudança
    const { rows: prev } = await pool.query('SELECT fase FROM cards WHERE id = $1', [id]);
    const faseAnterior = prev.length ? prev[0].fase : null;

    const { rows } = await pool.query(
      'UPDATE cards SET modulo=$1,fase=$2,titulo=$3,descricao=$4,escola=$5,categoria=$6,prioridade=$7,responsavel=$8,prazo=$9,criado_em=$10,valor=$11,fornecedor=$12,num_doc=$13,vencimento=$14,tipo_pagamento=$15,link_pagamento=$16,codigo_transacao=$17,link_status=$18,comentarios=$19,historico=$20,anexos=$21 WHERE id=$22 RETURNING *',
      [c.modulo||'', c.fase||'', c.titulo||'', c.descricao||'', c.escola||'', c.categoria||'', c.prioridade||'media',
       c.responsavel||'', c.prazo||'', c.criadoEm||'', c.valor||'0', c.fornecedor||'', c.numDoc||'',
       c.vencimento||'', c.tipoPagamento||'pix', c.linkPagamento||'', c.codigoTransacao||'', c.linkStatus||'pendente',
       JSON.stringify(c.comentarios||[]), JSON.stringify(c.historico||[]), JSON.stringify(c.anexos||[]), id]);
    if (!rows.length) return res.status(404).json({ error: 'Card nao encontrado.' });

    const updatedCard = rowToCard(rows[0]);

    // Motor de automações: verifica se houve mudança de fase
    if (faseAnterior && faseAnterior !== updatedCard.fase) {
      executeAutomacoes('card_enter_phase', updatedCard, { faseAnterior }).catch(e => console.error('[AUTO]', e.message));
    }

    res.json(updatedCard);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/cards/:id', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id invalido.' });
    const result = await pool.query('DELETE FROM cards WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Card nao encontrado.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/cards/move', verificarToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { cardId, newFase, newPosition = 0 } = req.body;
    if (!cardId || typeof cardId !== 'string') return res.status(400).json({ error: 'cardId obrigatorio.' });
    if (!newFase || typeof newFase !== 'string') return res.status(400).json({ error: 'newFase obrigatorio.' });
    if (typeof newPosition !== 'number' || newPosition < 0) return res.status(400).json({ error: 'newPosition invalido.' });

    await client.query('BEGIN');
    const { rows: cr } = await client.query('SELECT * FROM cards WHERE id = $1', [cardId]);
    if (!cr.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Card nao encontrado.' }); }
    const card = cr[0];
    const faseAnterior = card.fase;

    await client.query('UPDATE cards SET position = position + 1 WHERE modulo = $1 AND fase = $2 AND position >= $3 AND id != $4',
      [card.modulo, newFase, newPosition, cardId]);
    await client.query('UPDATE cards SET fase = $1, position = $2 WHERE id = $3', [newFase, newPosition, cardId]);
    if (card.fase !== newFase) {
      await client.query('WITH ranked AS (SELECT id, ROW_NUMBER() OVER (ORDER BY position, created_at) - 1 AS rn FROM cards WHERE modulo = $1 AND fase = $2) UPDATE cards SET position = ranked.rn FROM ranked WHERE cards.id = ranked.id',
        [card.modulo, card.fase]);
    }
    await client.query('COMMIT');

    // Motor de automações: mudança de fase via drag
    if (faseAnterior !== newFase) {
      const { rows: updated } = await pool.query('SELECT * FROM cards WHERE id = $1', [cardId]);
      if (updated.length) {
        executeAutomacoes('card_enter_phase', rowToCard(updated[0]), { faseAnterior }).catch(e => console.error('[AUTO]', e.message));
      }
    }

    res.json({ ok: true });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

/* ══════════════════════════════════════════════════════════
   ROTAS CRUD DE SETTINGS (protegidas por JWT)
══════════════════════════════════════════════════════════ */

app.get('/api/settings', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const result = {};
    for (const r of rows) result[r.key] = r.value;
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/settings/:key', verificarToken, async (req, res) => {
  try {
    const { key } = req.params;
    if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key invalida.' });
    const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (!rows.length) return res.status(404).json({ error: 'Configuracao nao encontrada.' });
    res.json(rows[0].value);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/settings/:key', verificarToken, async (req, res) => {
  try {
    const { key } = req.params;
    const value = req.body;
    if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key invalida.' });
    if (key.length > 100) return res.status(400).json({ error: 'key muito longa.' });
    if (value === undefined || value === null) return res.status(400).json({ error: 'Body obrigatorio.' });
    const { rows } = await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value RETURNING *`,
      [key, JSON.stringify(value)]
    );
    res.json(rows[0].value);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/settings', verificarToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const data = req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data))
      return res.status(400).json({ error: 'Body deve ser um objeto.' });
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(data)) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(value)]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

app.delete('/api/settings/:key', verificarToken, async (req, res) => {
  try {
    const { key } = req.params;
    if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key invalida.' });
    const result = await pool.query('DELETE FROM settings WHERE key = $1', [key]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Configuracao nao encontrada.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   MOTOR DE AUTOMAÇÕES SERVER-SIDE
══════════════════════════════════════════════════════════ */

async function executeAutomacoes(eventType, card, extra = {}) {
  try {
    const { rows: rules } = await pool.query(
      'SELECT * FROM automacoes WHERE ativo = true AND trigger_tipo = $1',
      [eventType]
    );

    for (const rule of rules) {
      const tc = rule.trigger_config || {};
      const ac = rule.acao_config || {};

      // Verifica se o módulo da automação bate com o card
      if (rule.modulo && rule.modulo !== card.modulo) continue;

      // Verifica condições do trigger
      if (eventType === 'card_enter_phase') {
        if (tc.fase && tc.fase !== card.fase) continue;
        if (tc.faseOrigem && tc.faseOrigem !== extra.faseAnterior) continue;
      }

      // Executa a ação
      console.log(`[AUTO] Executando "${rule.nome}" para card ${card.id}`);

      switch (rule.acao_tipo) {
        case 'gerar_link_pagamento': {
          // Gera link de pagamento automaticamente via e-Rede
          if (!card.valor || parseFloat(card.valor) <= 0) break;
          try {
            const token = await getAccessToken();
            const desc = (card.titulo || 'Pagamento').substring(0, 50);
            const apiRes = await fetch(BASE_URL + '/v1/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'Company-number': String(PV) },
              body: JSON.stringify({
                amount: parseFloat(card.valor),
                description: desc,
                installments: ac.installments || 1,
                paymentOptions: ac.paymentOptions || ['credit'],
                expirationDate: defaultExpirationDate(ac.diasExpiracao || 7),
              }),
            });
            if (apiRes.ok) {
              const data = await apiRes.json();
              await pool.query(
                'UPDATE cards SET link_pagamento = $1, link_status = $2 WHERE id = $3',
                [data.url || '', 'ativo', card.id]
              );
              console.log(`[AUTO] Link gerado para card ${card.id}: ${data.url}`);
            }
          } catch (e) { console.error('[AUTO] Erro ao gerar link:', e.message); }
          break;
        }
        case 'mover_fase': {
          if (ac.faseDestino) {
            await pool.query('UPDATE cards SET fase = $1 WHERE id = $2', [ac.faseDestino, card.id]);
            console.log(`[AUTO] Card ${card.id} movido para fase ${ac.faseDestino}`);
          }
          break;
        }
        case 'copiar_modulo': {
          if (ac.moduloDestino && ac.faseDestino) {
            const novoId = 'auto_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
            await pool.query(
              'INSERT INTO cards (id,modulo,fase,position,titulo,descricao,escola,categoria,prioridade,responsavel,prazo,criado_em,valor,fornecedor,num_doc,vencimento,comentarios,historico,anexos) VALUES ($1,$2,$3,0,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)',
              [novoId, ac.moduloDestino, ac.faseDestino, card.titulo, card.descricao, card.escola, card.categoria, card.prioridade,
               card.responsavel, card.prazo, card.criadoEm, card.valor, card.fornecedor, card.numDoc, card.vencimento,
               JSON.stringify(card.comentarios || []),
               JSON.stringify([...(card.historico || []), { texto: `Copiado automaticamente de ${card.modulo}`, data: new Date().toLocaleString('pt-BR'), usuario: 'Sistema' }]),
               JSON.stringify(card.anexos || [])]
            );
            console.log(`[AUTO] Card ${card.id} copiado para ${ac.moduloDestino}/${ac.faseDestino} como ${novoId}`);
          }
          break;
        }
        default:
          console.log(`[AUTO] Acao desconhecida: ${rule.acao_tipo}`);
      }
    }
  } catch (err) {
    console.error('[AUTO] Erro no motor:', err.message);
  }
}

/* ══════════════════════════════════════════════════════════
   INTEGRAÇÃO E-REDE (protegida)
══════════════════════════════════════════════════════════ */

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

app.post('/api/gerar-link', verificarToken, rateLimit(10, 60000), async (req, res) => {
  try {
    const { amount, description, installments = 1, paymentOptions = ['credit'], expirationDate } = req.body;
    if (amount == null || typeof amount !== 'number' || amount <= 0) return res.status(400).json({ error: '"amount" deve ser positivo.' });
    if (!description?.trim()) return res.status(400).json({ error: '"description" obrigatorio.' });
    if (description.length > 50) return res.status(400).json({ error: '"description" max 50 chars.' });
    if (!Number.isInteger(installments) || installments < 1 || installments > 12) return res.status(400).json({ error: '"installments" 1-12.' });
    if (!Array.isArray(paymentOptions) || !paymentOptions.length) return res.status(400).json({ error: '"paymentOptions" array obrigatorio.' });
    if (!PV) return res.status(500).json({ error: 'REDE_PV nao configurado.' });

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

app.get('/api/status-link/:paymentLinkId', verificarToken, async (req, res) => {
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

/* ══════════════════════════════════════════════════════════
   HEALTH / DIAGNÓSTICO
══════════════════════════════════════════════════════════ */

app.get('/health', async (_, res) => {
  let dbOk = false;
  try { await pool.query('SELECT 1'); dbOk = true; } catch (_) {}
  res.json({ ok: true, env: IS_PROD ? 'production' : 'sandbox', db: dbOk });
});

// Diagnóstico: APENAS Super Admin
app.get('/api/diagnostico', verificarToken, exigirRole('Super Admin'), async (_, res) => {
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


// ════════════════════════════════════════════════════════════════════════════
// AGENDAEDU — Gestão de Atendimento (proxy seguro via backend)
// Variáveis de ambiente necessárias no Railway:
//   AGENDAEDU_CLIENT_ID      → uid gerado no AgendaEdu (OAuth2 client_id)
//   AGENDAEDU_CLIENT_SECRET  → secret key gerado no AgendaEdu
//   AGENDAEDU_SCHOOL_TOKEN   → x-school-token da escola (header obrigatório)
//   AGENDAEDU_USER_TOKEN     → (opcional) token de usuário gerado via /auth/agendaedu
// ════════════════════════════════════════════════════════════════════════════
const AGENDAEDU_BASE          = 'https://api.agendaedu.com/v2';
const AGENDAEDU_CLIENT_ID     = process.env.AGENDAEDU_CLIENT_ID     || '';
const AGENDAEDU_CLIENT_SECRET = process.env.AGENDAEDU_CLIENT_SECRET || '';
const AGENDAEDU_SCHOOL_TOKEN  = process.env.AGENDAEDU_SCHOOL_TOKEN  || '';
const AGENDAEDU_OAUTH_URL     = process.env.AGENDAEDU_OAUTH_URL     || 'https://api.agendaedu.com/oauth/v2/token';
const AGENDAEDU_AUTH_URL      = 'https://escola.agendaedu.com/oauth/v2/authorize';
const AGENDAEDU_REDIRECT_URI  = process.env.AGENDAEDU_REDIRECT_URI  || 'https://central-operacional-ped-production.up.railway.app/auth/agendaedu/callback';

// Token de app (client_credentials) — escopo school_data
let _agendaAccessToken = null;
let _agendaTokenExpiry = 0;

// Token de usuário (authorization_code) — permissão completa do usuário logado
let _agendaUserToken   = process.env.AGENDAEDU_USER_TOKEN || null;
let _agendaUserExpiry  = _agendaUserToken ? Date.now() + 7 * 24 * 3600 * 1000 : 0; // assume 7d se veio de env

async function getAgendaEduToken() {
  // Prefere token de usuário (authorization_code) se disponível
  if (_agendaUserToken && Date.now() < _agendaUserExpiry) return _agendaUserToken;
  // Fallback: token de app (client_credentials)
  if (_agendaAccessToken && Date.now() < _agendaTokenExpiry) return _agendaAccessToken;
  if (!AGENDAEDU_CLIENT_ID || !AGENDAEDU_CLIENT_SECRET) {
    throw new Error('AGENDAEDU_CLIENT_ID / AGENDAEDU_CLIENT_SECRET não configurados no Railway.');
  }
  const res = await fetch(AGENDAEDU_OAUTH_URL, {
    method : 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body   : new URLSearchParams({
      grant_type   : 'client_credentials',
      client_id    : AGENDAEDU_CLIENT_ID,
      client_secret: AGENDAEDU_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AgendaEdu OAuth2 error ${res.status}: ${txt}`);
  }
  const json = await res.json();
  _agendaAccessToken = json.access_token;
  _agendaTokenExpiry = Date.now() + ((json.expires_in || 3600) - 60) * 1000;
  return _agendaAccessToken;
}

async function agendaProxy(method, path, body = null) {
  const token = await getAgendaEduToken();
  const opts  = {
    method,
    headers: {
      'Authorization' : `Bearer ${token}`,
      'x-school-token': AGENDAEDU_SCHOOL_TOKEN,
      'Content-Type'  : 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${AGENDAEDU_BASE}${path}`, opts);
}

// ── OAuth2 authorization_code flow ──────────────────────────────────────────
// Passo 1: redireciona o usuário para login no AgendaEdu
app.get('/auth/agendaedu', (req, res) => {
  if (!AGENDAEDU_CLIENT_ID) return res.status(503).send('AGENDAEDU_CLIENT_ID não configurado.');
  const params = new URLSearchParams({
    client_id    : AGENDAEDU_CLIENT_ID,
    redirect_uri : AGENDAEDU_REDIRECT_URI,
    response_type: 'code',
  });
  res.redirect(`${AGENDAEDU_AUTH_URL}?${params}`);
});

// Passo 2: AgendaEdu redireciona de volta com o code; troca por access_token
app.get('/auth/agendaedu/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.status(400).send(`Erro do AgendaEdu: ${error}`);
  if (!code)  return res.status(400).send('Código de autorização não recebido.');
  try {
    const r = await fetch(AGENDAEDU_OAUTH_URL, {
      method : 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body   : new URLSearchParams({
        grant_type   : 'authorization_code',
        client_id    : AGENDAEDU_CLIENT_ID,
        client_secret: AGENDAEDU_CLIENT_SECRET,
        code,
        redirect_uri : AGENDAEDU_REDIRECT_URI,
      }),
    });
    const json = await r.json();
    if (!r.ok) return res.status(400).json({ error: 'Erro ao obter token', details: json });
    _agendaUserToken  = json.access_token;
    _agendaUserExpiry = Date.now() + ((json.expires_in || 7200) - 60) * 1000;
    console.log(`[AgendaEdu] Token de usuário obtido via authorization_code. Expira em ${json.expires_in}s.`);
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>AgendaEdu — Autenticado</title>
      <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0fdf4}
      .box{text-align:center;padding:2rem;background:#fff;border-radius:1rem;box-shadow:0 4px 24px #0001;max-width:420px}
      h2{color:#16a34a;margin:0 0 .5rem}p{color:#374151;margin:.5rem 0}</style></head>
      <body><div class="box">
        <h2>✅ Autenticação concluída!</h2>
        <p>Token de atendimento ativo por <strong>${Math.round((json.expires_in||7200)/3600)}h</strong>.</p>
        <p>Pode fechar esta janela e voltar à Central Operacional.</p>
      </div></body></html>`);
  } catch (e) {
    res.status(500).send(`Erro interno: ${e.message}`);
  }
});

// Status do token de usuário (para diagnóstico)
app.get('/auth/agendaedu/status', (req, res) => {
  const hasUserToken = !!(_agendaUserToken && Date.now() < _agendaUserExpiry);
  res.json({
    userTokenActive: hasUserToken,
    expiresIn      : hasUserToken ? Math.round((_agendaUserExpiry - Date.now()) / 1000) + 's' : 'N/A',
    authUrl        : `${req.protocol}://${req.get('host')}/auth/agendaedu`,
  });
});

function agendaNotConfigured(res) {
  if (!AGENDAEDU_CLIENT_ID || !AGENDAEDU_CLIENT_SECRET) {
    res.status(503).json({ error: 'Integração AgendaEdu não configurada. Adicione AGENDAEDU_CLIENT_ID e AGENDAEDU_CLIENT_SECRET no Railway.' });
    return true;
  }
  return false;
}

// GET /api/agendaedu/debug — diagnóstico sem autenticação JWT (somente em não-produção)
app.get('/api/agendaedu/debug', async (req, res) => {
  const result = { env: {}, tests: {} };
  result.env = {
    hasClientId    : !!AGENDAEDU_CLIENT_ID,
    hasClientSecret: !!AGENDAEDU_CLIENT_SECRET,
    hasSchoolToken : !!AGENDAEDU_SCHOOL_TOKEN,
    schoolTokenLen : AGENDAEDU_SCHOOL_TOKEN.length,
    oauthUrl       : AGENDAEDU_OAUTH_URL,
    baseUrl        : AGENDAEDU_BASE,
  };

  // Teste 1: obter OAuth token
  try {
    const oauthRes = await fetch(AGENDAEDU_OAUTH_URL, {
      method : 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body   : new URLSearchParams({
        grant_type   : 'client_credentials',
        client_id    : AGENDAEDU_CLIENT_ID,
        client_secret: AGENDAEDU_CLIENT_SECRET,
      }),
    });
    const oauthBody = await oauthRes.json();
    result.tests.oauth = { status: oauthRes.status, body: oauthBody };
    const bearerToken = oauthBody.access_token || null;

    // Teste 2: tickets com Bearer + x-school-token
    if (bearerToken) {
      const r2 = await fetch(`${AGENDAEDU_BASE}/tickets?channelId=85662`, {
        headers: {
          'Authorization' : `Bearer ${bearerToken}`,
          'x-school-token': AGENDAEDU_SCHOOL_TOKEN,
          'Content-Type'  : 'application/json',
        },
      });
      const b2 = await r2.json().catch(() => r2.text());
      result.tests.ticketsWithBearer = { status: r2.status, body: b2 };
    }
  } catch (e) {
    result.tests.oauthError = e.message;
  }

  // Teste 3: tickets com x-school-token como Bearer (sem OAuth)
  try {
    const r3 = await fetch(`${AGENDAEDU_BASE}/tickets?channelId=85662`, {
      headers: {
        'Authorization' : `Bearer ${AGENDAEDU_SCHOOL_TOKEN}`,
        'Content-Type'  : 'application/json',
      },
    });
    const b3 = await r3.json().catch(() => r3.text());
    result.tests.ticketsSchoolTokenAsBearer = { status: r3.status, body: b3 };
  } catch (e) {
    result.tests.ticketsSchoolTokenAsBearerError = e.message;
  }

  // Teste 4: tickets com x-school-token somente no header customizado
  try {
    const r4 = await fetch(`${AGENDAEDU_BASE}/tickets?channelId=85662`, {
      headers: {
        'x-school-token': AGENDAEDU_SCHOOL_TOKEN,
        'Content-Type'  : 'application/json',
      },
    });
    const b4 = await r4.json().catch(() => r4.text());
    result.tests.ticketsOnlySchoolToken = { status: r4.status, body: b4 };
  } catch (e) {
    result.tests.ticketsOnlySchoolTokenError = e.message;
  }

  res.json(result);
});

// GET /api/agendaedu/channels — lista canais de atendimento
app.get('/api/agendaedu/channels', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('GET', '/channels');
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] channels:', err.message); res.status(500).json({ error: err.message }); }
});

// GET /api/agendaedu/tickets — lista tickets de um canal
app.get('/api/agendaedu/tickets', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const qs = new URLSearchParams(req.query).toString();
    const r  = await agendaProxy('GET', `/tickets${qs ? '?' + qs : ''}`);
    const d  = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] tickets:', err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/agendaedu/tickets — criar novo ticket
app.post('/api/agendaedu/tickets', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', '/tickets', req.body);
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] create ticket:', err.message); res.status(500).json({ error: err.message }); }
});

// GET /api/agendaedu/tickets/:id — detalhe do ticket
app.get('/api/agendaedu/tickets/:id', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('GET', `/tickets/${req.params.id}?include=requester,currentAttendant`);
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] ticket detail:', err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/agendaedu/tickets/:id/start — iniciar atendimento
app.post('/api/agendaedu/tickets/:id/start', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', `/tickets/${req.params.id}/start`, req.body);
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] start:', err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/agendaedu/tickets/:id/close — encerrar atendimento
app.post('/api/agendaedu/tickets/:id/close', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', `/tickets/${req.params.id}/close`, req.body);
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] close:', err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/agendaedu/tickets/:id/transfer — transferir atendimento
app.post('/api/agendaedu/tickets/:id/transfer', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', `/tickets/${req.params.id}/transfer`, req.body);
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] transfer:', err.message); res.status(500).json({ error: err.message }); }
});

// GET /api/agendaedu/channels/:channelId/chats/:chatId/messages
app.get('/api/agendaedu/channels/:channelId/chats/:chatId/messages', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const { channelId, chatId } = req.params;
    const qs = new URLSearchParams(req.query).toString();
    const r  = await agendaProxy('GET', `/channels/${channelId}/chats/${chatId}/messages${qs ? '?' + qs : ''}`);
    const d  = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] messages:', err.message); res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   ESTRUTURA ESCOLAR — Proxy AgendaEdu v2
══════════════════════════════════════════════════════════ */

app.get('/api/agendaedu/estrutura/headquarters', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const qs = new URLSearchParams(req.query).toString();
    const r  = await agendaProxy('GET', `/headquarters${qs ? '?' + qs : ''}`);
    const d  = await r.json(); if (!r.ok) return res.status(r.status).json(d); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/agendaedu/estrutura/headquarters', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', '/headquarters', req.body);
    const d = await r.json(); if (!r.ok) return res.status(r.status).json(d); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/agendaedu/estrutura/school-terms', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const qs = new URLSearchParams(req.query).toString();
    const r  = await agendaProxy('GET', `/school_terms${qs ? '?' + qs : ''}`);
    const d  = await r.json(); if (!r.ok) return res.status(r.status).json(d); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/agendaedu/estrutura/school-terms', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', '/school_terms', req.body);
    const d = await r.json(); if (!r.ok) return res.status(r.status).json(d); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/agendaedu/estrutura/school-terms/:id/activate', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', `/school_terms/${req.params.id}/activate`, {});
    const d = await r.json(); if (!r.ok) return res.status(r.status).json(d); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/agendaedu/estrutura/disciplines', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const qs = new URLSearchParams(req.query).toString();
    const r  = await agendaProxy('GET', `/disciplines${qs ? '?' + qs : ''}`);
    const d  = await r.json(); if (!r.ok) return res.status(r.status).json(d); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/agendaedu/estrutura/disciplines', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', '/disciplines', req.body);
    const d = await r.json(); if (!r.ok) return res.status(r.status).json(d); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/agendaedu/estrutura/classrooms', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const qs = new URLSearchParams(req.query).toString();
    const r  = await agendaProxy('GET', `/classrooms${qs ? '?' + qs : ''}`);
    const d  = await r.json(); if (!r.ok) return res.status(r.status).json(d); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/agendaedu/estrutura/classrooms', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', '/classrooms', req.body);
    const d = await r.json(); if (!r.ok) return res.status(r.status).json(d); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/agendaedu/estrutura/school-users', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const qs = new URLSearchParams(req.query).toString();
    const r  = await agendaProxy('GET', `/school_users${qs ? '?' + qs : ''}`);
    const d  = await r.json(); if (!r.ok) return res.status(r.status).json(d); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/agendaedu/estrutura/school-users', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', '/school_users', req.body);
    const d = await r.json(); if (!r.ok) return res.status(r.status).json(d); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/agendaedu/estrutura/responsible-profiles', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const qs = new URLSearchParams(req.query).toString();
    const r  = await agendaProxy('GET', `/responsible_profiles${qs ? '?' + qs : ''}`);
    const d  = await r.json(); if (!r.ok) return res.status(r.status).json(d); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/agendaedu/estrutura/responsible-profiles', verificarToken, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', '/responsible_profiles', req.body);
    const d = await r.json(); if (!r.ok) return res.status(r.status).json(d); res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   TICKETS — Sistema interno de atendimento (substitui AgendaEdu)
══════════════════════════════════════════════════════════ */

// GET /api/tickets — lista tickets com filtros opcionais
app.get('/api/tickets', verificarToken, async (req, res) => {
  try {
    const { escola, status } = req.query;
    const params = [];
    let q = 'SELECT * FROM tickets WHERE 1=1';
    if (escola) { params.push(escola); q += ` AND escola = $${params.length}`; }
    if (status) { params.push(status); q += ` AND status = $${params.length}`; }
    q += ' ORDER BY updated_at DESC';
    const { rows } = await pool.query(q, params);
    res.json({ data: rows });
  } catch (err) { console.error('[Tickets] list:', err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/tickets — criar novo ticket
app.post('/api/tickets', verificarToken, async (req, res) => {
  try {
    const { assunto, descricao, escola, solicitante } = req.body;
    if (!assunto?.trim()) return res.status(400).json({ error: 'Assunto é obrigatório.' });
    const id = uid();
    const autor = solicitante?.trim() || req.user.nome || 'Usuário';
    const { rows: [ticket] } = await pool.query(
      `INSERT INTO tickets (id, escola, assunto, descricao, solicitante, status)
       VALUES ($1,$2,$3,$4,$5,'waiting') RETURNING *`,
      [id, escola || '', assunto.trim(), (descricao || '').trim(), autor]
    );
    if (descricao?.trim()) {
      await pool.query(
        `INSERT INTO ticket_mensagens (id, ticket_id, autor, texto, tipo)
         VALUES ($1,$2,$3,$4,'message')`,
        [uid(), id, autor, descricao.trim()]
      );
    }
    res.status(201).json({ data: ticket });
  } catch (err) { console.error('[Tickets] create:', err.message); res.status(500).json({ error: err.message }); }
});

// GET /api/tickets/:id — detalhe do ticket com mensagens
app.get('/api/tickets/:id', verificarToken, async (req, res) => {
  try {
    const { rows: [ticket] } = await pool.query('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado.' });
    const { rows: mensagens } = await pool.query(
      'SELECT * FROM ticket_mensagens WHERE ticket_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    res.json({ data: { ...ticket, mensagens } });
  } catch (err) { console.error('[Tickets] get:', err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/tickets/:id/mensagens — adicionar mensagem ao ticket
app.post('/api/tickets/:id/mensagens', verificarToken, async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto?.trim()) return res.status(400).json({ error: 'Texto é obrigatório.' });
    const { rowCount } = await pool.query('SELECT 1 FROM tickets WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Ticket não encontrado.' });
    const msgId = uid();
    await pool.query(
      `INSERT INTO ticket_mensagens (id, ticket_id, autor, texto, tipo)
       VALUES ($1,$2,$3,$4,'message')`,
      [msgId, req.params.id, req.user.nome || 'Atendente', texto.trim()]
    );
    await pool.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [req.params.id]);
    const { rows: [msg] } = await pool.query('SELECT * FROM ticket_mensagens WHERE id = $1', [msgId]);
    res.json({ data: msg });
  } catch (err) { console.error('[Tickets] msg:', err.message); res.status(500).json({ error: err.message }); }
});

// PATCH /api/tickets/:id/status — mudar status do ticket
app.patch('/api/tickets/:id/status', verificarToken, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['waiting', 'in_attendance', 'done'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }
    const nome = req.user.nome || 'Atendente';
    let updRow;
    if (status === 'in_attendance') {
      const { rows: [t] } = await pool.query(
        `UPDATE tickets SET status=$1, atendente=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
        [status, nome, req.params.id]
      );
      updRow = t;
    } else {
      const { rows: [t] } = await pool.query(
        `UPDATE tickets SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
        [status, req.params.id]
      );
      updRow = t;
    }
    if (!updRow) return res.status(404).json({ error: 'Ticket não encontrado.' });
    const sysMsg = status === 'in_attendance'
      ? `Atendimento iniciado por ${nome}`
      : status === 'done' ? 'Atendimento encerrado' : `Status alterado para ${status}`;
    await pool.query(
      `INSERT INTO ticket_mensagens (id, ticket_id, autor, texto, tipo)
       VALUES ($1,$2,'Sistema',$3,'system')`,
      [uid(), req.params.id, sysMsg]
    );
    res.json({ data: updRow });
  } catch (err) { console.error('[Tickets] status:', err.message); res.status(500).json({ error: err.message }); }
});

// DELETE /api/tickets/:id — remover ticket (Super Admin only)
app.delete('/api/tickets/:id', verificarToken, exigirRole('Super Admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM tickets WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Ticket não encontrado.' });
    res.json({ ok: true });
  } catch (err) { console.error('[Tickets] delete:', err.message); res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   TRATAMENTO DE ERROS + INICIALIZAÇÃO
══════════════════════════════════════════════════════════ */

process.on('unhandledRejection', (err) => console.error('[ERROR] Unhandled rejection:', err));
process.on('uncaughtException', (err) => { console.error('[ERROR] Uncaught exception:', err); process.exit(1); });

initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`[Central PED] Servidor v3 na porta ${PORT} (${IS_PROD ? 'PROD' : 'DEV'})`));
  })
  .catch(err => { console.error('[FATAL]', err.message); process.exit(1); });
