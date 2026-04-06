/**
 * Central Operacional — Grupo PED
 * Backend Railway v3 — Auth JWT + Settings + Cards + e-Rede
 *
 * Variáveis de ambiente obrigatórias no Railway:
 *   DATABASE_URL       → gerado automaticamente pelo plugin PostgreSQL do Railway
 *   JWT_SECRET         → string longa e aleatória para assinar tokens
 *   REDE_CLIENT_ID     → client_id OAuth 2.0 e-Rede
 *   REDE_CLIENT_SECRET → client_secret OAuth 2.0 e-Rede
 *   REDE_PV            → número do PV do estabelecimento
 *   NODE_ENV           → "production" para usar URLs de produção
 */

const express = require('express');
const fetch   = require('node-fetch');
const cors    = require('cors');
const path    = require('path');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

// ─── Serve frontend estático do Railway ───────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'solicitacoes-admin')));

// ─── Config ───────────────────────────────────────────────────────────────
const PORT       = process.env.PORT || 3000;
const IS_PROD    = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'ped_secret_dev_only_change_in_prod';

// ─── Pool PostgreSQL ──────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL não definida!');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});
pool.on('error', err => console.error('[DB] Pool error:', err.message));

// ─── Módulos built-in (sempre presentes) ─────────────────────────────────
const BUILTIN_MODULES = {
  solicitacoes: {
    label:'Solicitações Administrativas', shortLabel:'Solicitações Admin.', btnLabel:'Nova Solicitação',
    hasFinancial:false,
    categorias:['Infraestrutura','Manutenção','TI','RH','Financeiro','Pedagógico','Compras','Segurança','Outros'],
    fases:{
      pendente:             { label:'Pendente',          color:'#F59E0B', bg:'#FFFBEB' },
      em_andamento:         { label:'Em Andamento',      color:'#3B82F6', bg:'#EFF6FF' },
      aguardando_validacao: { label:'Aguard. Validação', color:'#8B5CF6', bg:'#F5F3FF' },
      concluido:            { label:'Concluído',         color:'#10B981', bg:'#ECFDF5' },
    },
    lastPhase:'concluido',
  },
  contas_pagar: {
    label:'Contas a Pagar', shortLabel:'Contas a Pagar', btnLabel:'Nova Conta',
    hasFinancial:true, fornecedorLabel:'Fornecedor', numDocLabel:'Nº NF / Pedido',
    categorias:['Fornecedores','Serviços','Utilidades','Aluguel','Folha de Pagamento','Impostos','Manutenção','TI','Outros'],
    fases:{
      solicitacao_criada:   { label:'Solicitação Criada', color:'#94A3B8', bg:'#F1F5F9' },
      aguardando_aprovacao: { label:'Aguard. Aprovação',  color:'#F59E0B', bg:'#FFFBEB' },
      aprovado:             { label:'Aprovado',           color:'#3B82F6', bg:'#EFF6FF' },
      aguardando_pagamento: { label:'Aguard. Pagamento',  color:'#8B5CF6', bg:'#F5F3FF' },
      pago:                 { label:'Pago',               color:'#10B981', bg:'#ECFDF5' },
    },
    lastPhase:'pago',
  },
  contas_receber: {
    label:'Contas a Receber', shortLabel:'Contas a Receber', btnLabel:'Nova Cobrança',
    hasFinancial:true, hasPaymentLink:true,
    paymentGenPhase:'aguardando_pagamento', paymentConfirmPhase:'pagamento_efetuado',
    fornecedorLabel:'Cliente / Aluno', numDocLabel:'Nº Fatura / Referência',
    categorias:['Mensalidades','Matrículas','Material Didático','Eventos','Cursos','Taxa de Serviços','Outros'],
    fases:{
      criar_link:           { label:'Criar Link',        color:'#6366F1', bg:'#EEF2FF' },
      aguardando_pagamento: { label:'Aguard. Pagamento', color:'#F59E0B', bg:'#FFFBEB' },
      pagamento_efetuado:   { label:'Pag. Efetuado',     color:'#3B82F6', bg:'#EFF6FF' },
      processando:          { label:'Processando CR',    color:'#8B5CF6', bg:'#F5F3FF' },
      concluido:            { label:'Concluído',         color:'#10B981', bg:'#ECFDF5' },
    },
    lastPhase:'concluido',
  },
  compras: {
    label:'Compras', shortLabel:'Compras', btnLabel:'Nova Compra',
    hasFinancial:true, fornecedorLabel:'Fornecedor', numDocLabel:'Nº Pedido / Cotação',
    categorias:['Material de Escritório','Material Didático','Equipamentos TI','Móveis','Alimentação','Limpeza','Serviços','Infraestrutura','Outros'],
    fases:{
      solicitacao:      { label:'Solicitação',     color:'#94A3B8', bg:'#F1F5F9' },
      cotacao:          { label:'Cotação',         color:'#F59E0B', bg:'#FFFBEB' },
      aprovacao:        { label:'Aprovação',       color:'#8B5CF6', bg:'#F5F3FF' },
      pedido_realizado: { label:'Pedido Realizado',color:'#3B82F6', bg:'#EFF6FF' },
      entregue:         { label:'Entregue',        color:'#10B981', bg:'#ECFDF5' },
    },
    lastPhase:'entregue',
  },
  processos: {
    label:'Cumprimento de Processos', shortLabel:'Processos', btnLabel:'Novo Processo',
    hasFinancial:false,
    categorias:['Pedagógico','Administrativo','RH','Financeiro','Qualidade','Segurança','Legal','Outros'],
    fases:{
      pendente:             { label:'Pendente',          color:'#F59E0B', bg:'#FFFBEB' },
      em_andamento:         { label:'Em Andamento',      color:'#3B82F6', bg:'#EFF6FF' },
      aguardando_validacao: { label:'Aguard. Validação', color:'#8B5CF6', bg:'#F5F3FF' },
      concluido:            { label:'Concluído',         color:'#10B981', bg:'#ECFDF5' },
    },
    lastPhase:'concluido',
  },
  ti: {
    label:'Suporte de T.I', shortLabel:'T.I', btnLabel:'Novo Chamado',
    hasFinancial:false,
    categorias:['Hardware','Software','Rede / Conectividade','Segurança da Informação','Sistemas','Infraestrutura TI','Suporte ao Usuário','Outros'],
    fases:{
      aberto:               { label:'Aberto',            color:'#94A3B8', bg:'#F1F5F9' },
      diagnostico:          { label:'Diagnóstico',       color:'#F59E0B', bg:'#FFFBEB' },
      em_atendimento:       { label:'Em Atendimento',    color:'#3B82F6', bg:'#EFF6FF' },
      aguardando_aprovacao: { label:'Aguard. Aprovação', color:'#8B5CF6', bg:'#F5F3FF' },
      resolvido:            { label:'Resolvido',         color:'#10B981', bg:'#ECFDF5' },
    },
    lastPhase:'resolvido',
  },
  recursos_humanos: {
    label:'Recursos Humanos', shortLabel:'RH', btnLabel:'Nova Solicitação RH',
    hasFinancial:false,
    categorias:['Admissão','Desligamento','Férias','Afastamento','Treinamento','Ponto / Jornada','Benefícios','Folha de Pagamento','Outros'],
    fases:{
      recebido:    { label:'Recebido',    color:'#94A3B8', bg:'#F1F5F9', slaDias:2 },
      em_analise:  { label:'Em análise', color:'#F59E0B', bg:'#FFFBEB', slaDias:3 },
      aprovado:    { label:'Aprovado',   color:'#3B82F6', bg:'#EFF6FF', slaDias:5 },
      em_execucao: { label:'Em execução',color:'#8B5CF6', bg:'#F5F3FF', slaDias:7 },
      concluido:   { label:'Concluído',  color:'#10B981', bg:'#ECFDF5' },
      cancelado:   { label:'Cancelado',  color:'#EF4444', bg:'#FEF2F2' },
    },
    lastPhase:'concluido',
  },
  comercial: {
    label:'Comercial — CRM de Leads', shortLabel:'Comercial', btnLabel:'Novo Lead',
    hasFinancial:false, hasLead:true,
    categorias:['Indicação','Site / SEO','Redes Sociais','Instagram','Facebook','Evento','Captação Ativa','Parceria','WhatsApp','Outros'],
    fases:{
      novo_lead:         { label:'Novo Lead',         color:'#6366F1', bg:'#EEF2FF' },
      contato_realizado: { label:'Contato Realizado', color:'#F59E0B', bg:'#FFFBEB', slaDias:2 },
      visita_agendada:   { label:'Visita Agendada',   color:'#3B82F6', bg:'#EFF6FF', slaDias:3 },
      proposta_enviada:  { label:'Proposta Enviada',  color:'#8B5CF6', bg:'#F5F3FF', slaDias:5 },
      matricula_fechada: { label:'Matrícula Fechada', color:'#10B981', bg:'#ECFDF5' },
      perdido:           { label:'Perdido',           color:'#EF4444', bg:'#FEF2F2' },
    },
    lastPhase:'matricula_fechada',
  },
  central_pagamentos: {
    label:'Central de Pagamentos', shortLabel:'Central Pgto.', btnLabel:'Nova Cobrança',
    hasFinancial:true, hasPaymentLink:true,
    paymentGenPhase:'aguardando_pagamento', paymentConfirmPhase:'pago',
    fornecedorLabel:'Cliente / Responsável', numDocLabel:'CPF / CNPJ',
    categorias:['Mensalidade','Matrícula','Material Didático','Uniforme','Evento','Taxa Administrativa','Outros'],
    fases:{
      nova_cobranca:        { label:'Nova Cobrança',     color:'#6366F1', bg:'#EEF2FF' },
      aguardando_pagamento: { label:'Aguard. Pagamento', color:'#F59E0B', bg:'#FFFBEB' },
      pago:                 { label:'Pago ✓',            color:'#10B981', bg:'#ECFDF5' },
      vencido:              { label:'Vencido',           color:'#EF4444', bg:'#FEF2F2' },
      cancelado:            { label:'Cancelado',         color:'#64748B', bg:'#F1F5F9' },
    },
    lastPhase:'pago',
  },
};

// Garante que módulos built-in nunca somem do objeto salvo
function patchBuiltinModules(saved) {
  const result = saved && typeof saved === 'object' ? { ...saved } : {};
  let patched = false;
  Object.entries(BUILTIN_MODULES).forEach(([key, mod]) => {
    if (!result[key]) { result[key] = mod; patched = true; }
  });
  return { modules: result, patched };
}

// Perfis de permissão padrão
function getPermissoesByPerfil(perfil) {
  const all = ['ver','criar','editar','aprovar'];
  const maps = {
    admin:        { solicitacoes:all, contas_pagar:all, contas_receber:all, compras:all, processos:all, ti:all, recursos_humanos:all, comercial:all, central_pagamentos:all },
    gestor:       { solicitacoes:all, contas_pagar:['ver','aprovar'], contas_receber:['ver','aprovar'], compras:['ver','criar','aprovar'], processos:all, ti:['ver','criar'], recursos_humanos:['ver','criar'], comercial:all, central_pagamentos:['ver'] },
    operador:     { solicitacoes:['ver','criar','editar'], contas_pagar:['ver','criar'], contas_receber:['ver','criar'], compras:['ver','criar','editar'], processos:['ver','criar','editar'], ti:['ver','criar'], recursos_humanos:['ver'], comercial:['ver','criar','editar'], central_pagamentos:[] },
    visualizador: { solicitacoes:['ver'], contas_pagar:['ver'], contas_receber:['ver'], compras:['ver'], processos:['ver'], ti:['ver'], recursos_humanos:['ver'], comercial:['ver'], central_pagamentos:[] },
  };
  return maps[perfil] || maps.visualizador;
}

// ─── Init DB ──────────────────────────────────────────────────────────────
async function initDB() {
  // Tabela de usuários
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      nome        TEXT NOT NULL DEFAULT '',
      email       TEXT NOT NULL UNIQUE,
      password    TEXT NOT NULL,
      perfil      TEXT NOT NULL DEFAULT 'operador',
      escolas     JSONB NOT NULL DEFAULT '[]',
      ativo       BOOLEAN NOT NULL DEFAULT true,
      criado_em   TEXT NOT NULL DEFAULT ''
    );
  `);

  // Usuário admin padrão (só cria se não existir nenhum)
  const { rows: existingUsers } = await pool.query('SELECT id FROM users LIMIT 1');
  if (existingUsers.length === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await pool.query(`
      INSERT INTO users (id, nome, email, password, perfil, escolas, ativo, criado_em)
      VALUES ('usr1','Emerson Santos','emerson.santos@grupoped.com.br',$1,'admin','["ped1","ped2","ped3","ped4"]',true,'2026-01-10')
      ON CONFLICT (email) DO NOTHING
    `, [hash]);
    console.log('[DB] Usuário admin padrão criado.');
  }

  // Tabela de settings (key/value genérico)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'
    );
  `);

  // Tabela de cards
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
  `);

  // Adiciona colunas de lead se não existirem (ALTER TABLE seguro)
  await pool.query(`ALTER TABLE cards ADD COLUMN IF NOT EXISTS telefone   TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE cards ADD COLUMN IF NOT EXISTS email_lead TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE cards ADD COLUMN IF NOT EXISTS origem     TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE cards ADD COLUMN IF NOT EXISTS interesse  TEXT DEFAULT ''`);

  // Índices
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cards_modulo_fase ON cards (modulo, fase, position)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cards_escola      ON cards (escola)`);

  // ── Tabela de convites ──────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invites (
      token        TEXT PRIMARY KEY,
      email        TEXT NOT NULL,
      nome         TEXT NOT NULL DEFAULT '',
      perfil       TEXT NOT NULL DEFAULT 'operador',
      modulos      JSONB NOT NULL DEFAULT '[]',
      escolas      JSONB NOT NULL DEFAULT '[]',
      criado_por   TEXT NOT NULL DEFAULT '',
      criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expira_em    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
      usado        BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  // Trigger updated_at
  await pool.query(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$ LANGUAGE plpgsql;
  `);
  await pool.query(`DROP TRIGGER IF EXISTS trg_cards_updated_at ON cards`);
  await pool.query(`
    CREATE TRIGGER trg_cards_updated_at
      BEFORE UPDATE ON cards
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  console.log('[DB] Tabelas prontas.');
}

// ─── Middleware JWT ───────────────────────────────────────────────────────
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

// ─── Mapeia row do banco → objeto card do frontend ────────────────────────
function rowToCard(row) {
  return {
    id              : row.id,
    modulo          : row.modulo,
    fase            : row.fase,
    position        : row.position,
    titulo          : row.titulo,
    descricao       : row.descricao,
    escola          : row.escola,
    categoria       : row.categoria,
    prioridade      : row.prioridade,
    responsavel     : row.responsavel,
    prazo           : row.prazo,
    criadoEm        : row.criado_em,
    valor           : row.valor,
    fornecedor      : row.fornecedor,
    numDoc          : row.num_doc,
    vencimento      : row.vencimento,
    tipoPagamento   : row.tipo_pagamento,
    linkPagamento   : row.link_pagamento,
    codigoTransacao : row.codigo_transacao,
    linkStatus      : row.link_status,
    telefone        : row.telefone   || '',
    emailLead       : row.email_lead || '',
    origem          : row.origem     || '',
    interesse       : row.interesse  || '',
    comentarios     : row.comentarios || [],
    historico       : row.historico   || [],
    anexos          : row.anexos      || [],
  };
}

// ══════════════════════════════════════════════════════════
//  ROTAS — AUTENTICAÇÃO
// ══════════════════════════════════════════════════════════

// POST /api/login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha obrigatórios.' });

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    if (!user.ativo) return res.status(403).json({ error: 'Usuário inativo.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });

    const initials = user.nome.split(' ').slice(0,2).map(n => n[0]||'').join('').toUpperCase();
    const perms    = getPermissoesByPerfil(user.perfil);
    const roleMap  = { admin:'Super Admin', gestor:'Gestor', operador:'Operador', visualizador:'Visualizador' };

    const payload = { id: user.id, email: user.email, perfil: user.perfil };
    const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    res.json({
      token,
      user: {
        id       : user.id,
        nome     : user.nome,
        email    : user.email,
        perfil   : user.perfil,
        initials,
        role     : roleMap[user.perfil] || user.perfil,
        permissoes: perms,
        escola   : (user.escolas || []).length >= 4 ? 'all' : (user.escolas[0] || 'all'),
      },
    });
  } catch (err) {
    console.error('[POST /api/login]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/verify — verifica se o token ainda é válido
app.get('/api/verify', authRequired, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// ══════════════════════════════════════════════════════════
//  ROTAS — USUÁRIOS
// ══════════════════════════════════════════════════════════

// GET /api/usuarios
app.get('/api/usuarios', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id,nome,email,perfil,escolas,ativo,criado_em FROM users ORDER BY nome');
    res.json(rows.map(r => ({ id:r.id, nome:r.nome, email:r.email, perfil:r.perfil, escolas:r.escolas||[], ativo:r.ativo, criadoEm:r.criado_em })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/usuarios — cria usuário
app.post('/api/usuarios', authRequired, async (req, res) => {
  try {
    const { id, nome, email, password, perfil, escolas, ativo, criadoEm } = req.body;
    const hash = await bcrypt.hash(password || 'mudar123', 10);
    const { rows } = await pool.query(
      `INSERT INTO users (id,nome,email,password,perfil,escolas,ativo,criado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (email) DO UPDATE SET nome=$2,perfil=$5,escolas=$6,ativo=$7
       RETURNING id,nome,email,perfil,escolas,ativo,criado_em`,
      [id, nome, email.toLowerCase(), hash, perfil||'operador', JSON.stringify(escolas||[]), ativo!==false, criadoEm||new Date().toISOString().split('T')[0]]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/usuarios/:id — atualiza usuário
app.put('/api/usuarios/:id', authRequired, async (req, res) => {
  try {
    const { nome, email, perfil, escolas, ativo } = req.body;
    const { rows } = await pool.query(
      `UPDATE users SET nome=$1,email=$2,perfil=$3,escolas=$4,ativo=$5 WHERE id=$6
       RETURNING id,nome,email,perfil,escolas,ativo,criado_em`,
      [nome, email.toLowerCase(), perfil, JSON.stringify(escolas||[]), ativo!==false, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/usuarios/:id/senha — troca senha
app.put('/api/usuarios/:id/senha', authRequired, async (req, res) => {
  try {
    const hash = await bcrypt.hash(req.body.password, 10);
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hash, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/usuarios/:id
app.delete('/api/usuarios/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════
//  ROTAS — SETTINGS (modules, escolas, etiquetas, etc.)
// ══════════════════════════════════════════════════════════

// GET /api/settings — retorna todos os settings
app.get('/api/settings', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const result = {};
    rows.forEach(r => { result[r.key] = r.value; });

    // Garante módulos built-in sempre presentes
    const { modules } = patchBuiltinModules(result.modules);
    result.modules = modules;

    // Salva de volta se houve patch
    await pool.query(
      `INSERT INTO settings (key,value) VALUES ('modules',$1)
       ON CONFLICT (key) DO UPDATE SET value=$1`,
      [JSON.stringify(modules)]
    );

    res.json(result);
  } catch (err) {
    console.error('[GET /api/settings]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings — salva múltiplas seções
app.put('/api/settings', authRequired, async (req, res) => {
  try {
    const data = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of Object.entries(data)) {
        let val = value;
        // Garante módulos built-in ao salvar
        if (key === 'modules') {
          const { modules } = patchBuiltinModules(value);
          val = modules;
        }
        await client.query(
          `INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`,
          [key, JSON.stringify(val)]
        );
      }
      await client.query('COMMIT');
    } finally { client.release(); }
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/settings]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/:section — salva seção específica
app.put('/api/settings/:section', authRequired, async (req, res) => {
  try {
    const { section } = req.params;
    let value = req.body;
    // Garante módulos built-in
    if (section === 'modules') {
      const { modules } = patchBuiltinModules(value);
      value = modules;
    }
    await pool.query(
      `INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`,
      [section, JSON.stringify(value)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/settings/:section]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════
//  ROTAS — CARDS
// ══════════════════════════════════════════════════════════

// GET /api/cards
app.get('/api/cards', authRequired, async (req, res) => {
  try {
    const { modulo, escola } = req.query;
    let query = 'SELECT * FROM cards';
    const vals = [], conds = [];
    if (modulo) { conds.push(`modulo = $${vals.length+1}`); vals.push(modulo); }
    if (escola) { conds.push(`escola = $${vals.length+1}`); vals.push(escola); }
    if (conds.length) query += ' WHERE ' + conds.join(' AND ');
    query += ' ORDER BY modulo, fase, position, created_at DESC';
    const { rows } = await pool.query(query, vals);
    res.json(rows.map(rowToCard));
  } catch (err) {
    console.error('[GET /api/cards]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── ENDPOINTS PÚBLICOS (sem auth) ───────────────────────────────────────────

// GET /api/public/config — retorna módulos e escolas para o formulário público
app.get('/api/public/config', async (req, res) => {
  try {
    // Módulos
    let modules = BUILTIN_MODULES;
    try {
      const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'modules' LIMIT 1");
      if (rows.length && rows[0].value) modules = { ...modules, ...rows[0].value };
    } catch(_) {}

    // Escolas
    let escolas = [
      { id:'ped1', nome:'PED Pituba',   sigla:'PIT', cor:'#8B5CF6', ativa:true },
      { id:'ped2', nome:'PED Barra',    sigla:'BAR', cor:'#10B981', ativa:true },
      { id:'ped3', nome:'PED Paralela', sigla:'PAR', cor:'#F59E0B', ativa:true },
      { id:'ped4', nome:'PED Imbuí',    sigla:'IMB', cor:'#EF4444', ativa:true },
    ];
    try {
      const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'escolas' LIMIT 1");
      if (rows.length && Array.isArray(rows[0].value)) escolas = rows[0].value;
    } catch(_) {}

    res.json({ modules, escolas: escolas.filter(e => e.ativa !== false) });
  } catch (err) {
    console.error('[GET /api/public/config]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/public/form — recebe submissão do formulário público (sem auth)
app.post('/api/public/form', async (req, res) => {
  try {
    const c = req.body;
    if (!c.modulo || !c.titulo) return res.status(400).json({ error: 'Módulo e título são obrigatórios.' });

    // Gera ID único e timestamps
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const criadoEm = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

    // Descobre a primeira fase do módulo
    let primeiraFase = c.fase || 'pendente';
    let modules = BUILTIN_MODULES;
    try {
      const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'modules' LIMIT 1");
      if (rows.length && rows[0].value) modules = { ...modules, ...rows[0].value };
    } catch(_) {}
    const mod = modules[c.modulo];
    if (mod && mod.fases) {
      primeiraFase = Object.keys(mod.fases)[0];
    }

    const historico = JSON.stringify([{
      texto: `Solicitação criada via formulário público por ${c.solicitante || 'Externo'}`,
      data: criadoEm,
      usuario: c.solicitante || 'Formulário Público'
    }]);

    const { rows: posRows } = await pool.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM cards WHERE modulo = $1 AND fase = $2',
      [c.modulo, primeiraFase]
    );
    const position = posRows[0].next_pos;

    const { rows } = await pool.query(`
      INSERT INTO cards (
        id, modulo, fase, position,
        titulo, descricao, escola, categoria, prioridade, responsavel, prazo, criado_em,
        valor, fornecedor, num_doc, vencimento,
        tipo_pagamento, link_pagamento, codigo_transacao, link_status,
        telefone, email_lead, origem, interesse,
        comentarios, historico, anexos
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,
        $25,$26,$27
      ) RETURNING id`,
      [
        id, c.modulo, primeiraFase, position,
        c.titulo||'', c.descricao||'', c.escola||'', c.categoria||'',
        c.prioridade||'media', '', c.prazo||'', criadoEm,
        c.valor||'0', c.fornecedor||'', c.numDoc||'', c.vencimento||'',
        'pix', '', '', 'pendente',
        c.telefone||'', c.emailLead||'', c.origem||'', c.interesse||'',
        '[]', historico, '[]',
      ]
    );
    res.status(201).json({ success: true, id: rows[0].id, fase: primeiraFase });
  } catch (err) {
    console.error('[POST /api/public/form]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── ENDPOINTS DE CONVITE ────────────────────────────────────────────────────

// POST /api/invite — admin cria convite (requer auth)
app.post('/api/invite', authRequired, async (req, res) => {
  try {
    if (req.user.perfil !== 'admin' && req.user.perfil !== 'gestor') {
      return res.status(403).json({ error: 'Apenas admin/gestor pode convidar.' });
    }
    const { email, nome, perfil, modulos, escolas } = req.body;
    if (!email) return res.status(400).json({ error: 'E-mail é obrigatório.' });

    // Verifica se já existe usuário com esse email
    const { rows: existing } = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", [email]
    );
    if (existing.length) return res.status(400).json({ error: 'Usuário já cadastrado com esse e-mail.' });

    // Gera token único
    const token = Date.now().toString(36) + Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,10);

    await pool.query(`
      INSERT INTO invites (token, email, nome, perfil, modulos, escolas, criado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (token) DO NOTHING`,
      [token, email.toLowerCase(), nome||'', perfil||'operador',
       JSON.stringify(modulos||[]), JSON.stringify(escolas||[]),
       req.user.email]
    );

    // URL de aceite (base URL do backend = mesmo domínio do frontend)
    const baseUrl = req.headers.origin || req.headers.referer?.replace(/\/[^\/]*$/, '') || 'https://central-operacional-ped-production.up.railway.app';
    const inviteUrl = `${baseUrl}/invite.html?token=${token}`;

    res.json({ success: true, token, url: inviteUrl });
  } catch (err) {
    console.error('[POST /api/invite]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invite/:token — valida convite (sem auth)
app.get('/api/invite/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM invites WHERE token = $1 LIMIT 1', [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Convite não encontrado.' });
    const inv = rows[0];
    if (inv.usado) return res.status(410).json({ error: 'Este convite já foi utilizado.' });
    if (new Date(inv.expira_em) < new Date()) return res.status(410).json({ error: 'Este convite expirou.' });

    // Retorna dados sem informações sensíveis
    res.json({
      email   : inv.email,
      nome    : inv.nome,
      perfil  : inv.perfil,
      modulos : inv.modulos,
      escolas : inv.escolas,
    });
  } catch (err) {
    console.error('[GET /api/invite/:token]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invite/:token/accept — aceita convite e cria conta (sem auth)
app.post('/api/invite/:token/accept', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM invites WHERE token = $1 LIMIT 1', [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Convite não encontrado.' });
    const inv = rows[0];
    if (inv.usado) return res.status(410).json({ error: 'Este convite já foi utilizado.' });
    if (new Date(inv.expira_em) < new Date()) return res.status(410).json({ error: 'Convite expirado.' });

    const { nome, password } = req.body;
    if (!nome || !password) return res.status(400).json({ error: 'Nome e senha são obrigatórios.' });
    if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });

    // Verifica duplicata
    const { rows: dup } = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", [inv.email]
    );
    if (dup.length) return res.status(400).json({ error: 'E-mail já cadastrado.' });

    // Monta permissões
    const modulos = Array.isArray(inv.modulos) ? inv.modulos : [];
    const perms = {};
    modulos.forEach(m => {
      if (inv.perfil === 'admin') perms[m] = ['ver','criar','editar','excluir'];
      else if (inv.perfil === 'gestor') perms[m] = ['ver','criar','editar'];
      else if (inv.perfil === 'operador') perms[m] = ['ver','criar'];
      else perms[m] = ['ver'];
    });
    // Se nenhum módulo específico, acesso geral
    if (!modulos.length) {
      ['solicitacoes','contas_pagar','contas_receber','compras','processos','ti','recursos_humanos','comercial','central_pagamentos'].forEach(m => {
        perms[m] = inv.perfil === 'admin' ? ['ver','criar','editar','excluir'] :
                   inv.perfil === 'gestor' ? ['ver','criar','editar'] :
                   inv.perfil === 'operador' ? ['ver','criar'] : ['ver'];
      });
    }

    const hashed = await bcrypt.hash(password, 10);
    const userId = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    const escolas = Array.isArray(inv.escolas) && inv.escolas.length ? inv.escolas : ['ped1','ped2','ped3','ped4'];

    await pool.query(`
      INSERT INTO users (id, nome, email, password_hash, perfil, escolas, permissoes, ativo, criado_em)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)`,
      [userId, nome, inv.email.toLowerCase(), hashed, inv.perfil,
       JSON.stringify(escolas), JSON.stringify(perms),
       new Date().toLocaleDateString('pt-BR')]
    );

    // Marca convite como usado
    await pool.query('UPDATE invites SET usado = true WHERE token = $1', [req.params.token]);

    // Faz login automático
    const payload = { id: userId, email: inv.email.toLowerCase(), perfil: inv.perfil };
    const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    res.json({ success: true, token, user: { id:userId, nome, email:inv.email, perfil:inv.perfil, permissoes:perms, escolas } });
  } catch (err) {
    console.error('[POST /api/invite/:token/accept]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invites — lista convites pendentes (admin)
app.get('/api/invites', authRequired, async (req, res) => {
  try {
    if (req.user.perfil !== 'admin' && req.user.perfil !== 'gestor') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    const { rows } = await pool.query(
      `SELECT token, email, nome, perfil, modulos, escolas, criado_por, criado_em, expira_em, usado
       FROM invites ORDER BY criado_em DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── FIM ENDPOINTS PÚBLICOS ───────────────────────────────────────────────────

// POST /api/cards
app.post('/api/cards', authRequired, async (req, res) => {
  try {
    const c = req.body;
    const { rows: posRows } = await pool.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM cards WHERE modulo = $1 AND fase = $2',
      [c.modulo, c.fase]
    );
    const position = posRows[0].next_pos;
    const { rows } = await pool.query(`
      INSERT INTO cards (
        id, modulo, fase, position,
        titulo, descricao, escola, categoria, prioridade, responsavel, prazo, criado_em,
        valor, fornecedor, num_doc, vencimento,
        tipo_pagamento, link_pagamento, codigo_transacao, link_status,
        telefone, email_lead, origem, interesse,
        comentarios, historico, anexos
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,
        $25,$26,$27
      ) RETURNING *`,
      [
        c.id, c.modulo, c.fase, position,
        c.titulo||'', c.descricao||'', c.escola||'', c.categoria||'',
        c.prioridade||'media', c.responsavel||'', c.prazo||'', c.criadoEm||'',
        c.valor||'0', c.fornecedor||'', c.numDoc||'', c.vencimento||'',
        c.tipoPagamento||'pix', c.linkPagamento||'', c.codigoTransacao||'', c.linkStatus||'pendente',
        c.telefone||'', c.emailLead||'', c.origem||'', c.interesse||'',
        JSON.stringify(c.comentarios||[]),
        JSON.stringify(c.historico||[]),
        JSON.stringify(c.anexos||[]),
      ]
    );
    res.status(201).json(rowToCard(rows[0]));
  } catch (err) {
    console.error('[POST /api/cards]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cards/:id
app.put('/api/cards/:id', authRequired, async (req, res) => {
  try {
    const c = req.body;
    const { rows } = await pool.query(`
      UPDATE cards SET
        modulo=$1, fase=$2,
        titulo=$3, descricao=$4, escola=$5, categoria=$6, prioridade=$7,
        responsavel=$8, prazo=$9, criado_em=$10,
        valor=$11, fornecedor=$12, num_doc=$13, vencimento=$14,
        tipo_pagamento=$15, link_pagamento=$16, codigo_transacao=$17, link_status=$18,
        telefone=$19, email_lead=$20, origem=$21, interesse=$22,
        comentarios=$23, historico=$24, anexos=$25
      WHERE id=$26 RETURNING *`,
      [
        c.modulo||'', c.fase||'',
        c.titulo||'', c.descricao||'', c.escola||'', c.categoria||'', c.prioridade||'media',
        c.responsavel||'', c.prazo||'', c.criadoEm||'',
        c.valor||'0', c.fornecedor||'', c.numDoc||'', c.vencimento||'',
        c.tipoPagamento||'pix', c.linkPagamento||'', c.codigoTransacao||'', c.linkStatus||'pendente',
        c.telefone||'', c.emailLead||'', c.origem||'', c.interesse||'',
        JSON.stringify(c.comentarios||[]),
        JSON.stringify(c.historico||[]),
        JSON.stringify(c.anexos||[]),
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Card não encontrado.' });
    res.json(rowToCard(rows[0]));
  } catch (err) {
    console.error('[PUT /api/cards/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cards/:id
app.delete('/api/cards/:id', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM cards WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/cards/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/cards/move — drag & drop
app.patch('/api/cards/move', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const { cardId, newFase, newPosition = 0 } = req.body;
    if (!cardId || !newFase) return res.status(400).json({ error: 'cardId e newFase obrigatórios.' });

    await client.query('BEGIN');
    const { rows: cardRows } = await client.query('SELECT * FROM cards WHERE id = $1', [cardId]);
    if (!cardRows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Card não encontrado.' }); }

    const card = cardRows[0];
    await client.query(
      `UPDATE cards SET position = position + 1 WHERE modulo=$1 AND fase=$2 AND position >= $3 AND id != $4`,
      [card.modulo, newFase, newPosition, cardId]
    );
    await client.query('UPDATE cards SET fase=$1, position=$2 WHERE id=$3', [newFase, newPosition, cardId]);

    if (card.fase !== newFase) {
      await client.query(`
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY position, created_at) - 1 AS rn
          FROM cards WHERE modulo=$1 AND fase=$2
        )
        UPDATE cards SET position=ranked.rn FROM ranked WHERE cards.id=ranked.id`,
        [card.modulo, card.fase]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PATCH /api/cards/move]', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ══════════════════════════════════════════════════════════
//  ROTAS — e-REDE (Link de Pagamento)
// ══════════════════════════════════════════════════════════

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
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Credenciais e-Rede não configuradas.');
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type':'application/x-www-form-urlencoded', 'Authorization':`Basic ${credentials}` },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`OAuth2 falhou (${res.status}): ${await res.text()}`);
  const json = await res.json();
  _cachedToken = json.access_token;
  _tokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
  return _cachedToken;
}

function defaultExpirationDate(daysAhead = 7) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
}

app.post('/api/gerar-link', async (req, res) => {
  try {
    const { amount, description, installments=1, paymentOptions=['credit'], expirationDate } = req.body;
    if (amount == null)         return res.status(400).json({ error: '"amount" obrigatório.' });
    if (!description?.trim())   return res.status(400).json({ error: '"description" obrigatório.' });
    if (description.length > 50)return res.status(400).json({ error: '"description" máximo 50 chars.' });
    if (!PV)                    return res.status(500).json({ error: 'REDE_PV não configurado.' });

    const token  = await getAccessToken();
    const apiRes = await fetch(`${BASE_URL}/v1/create`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}`, 'Company-number':String(PV) },
      body: JSON.stringify({ amount, expirationDate: expirationDate||defaultExpirationDate(), installments, paymentOptions, description:description.trim() }),
    });
    const data = await apiRes.json();
    if (!apiRes.ok) { console.error('Erro e-Rede:', data); return res.status(apiRes.status).json({ error: data }); }
    res.json({ url: data.url, paymentLinkId: data.paymentLinkId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/status-link/:paymentLinkId', async (req, res) => {
  try {
    if (!PV) return res.status(500).json({ error: 'REDE_PV não configurado.' });
    const token  = await getAccessToken();
    const apiRes = await fetch(`${BASE_URL}/v1/${req.params.paymentLinkId}`, {
      headers: { 'Authorization':`Bearer ${token}`, 'Company-number':String(PV) },
    });
    const data = await apiRes.json();
    if (!apiRes.ok) return res.status(apiRes.status).json({ error: data });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// AGENDAEDU — Gestão de Atendimento (proxy seguro via backend)
// Variáveis de ambiente necessárias no Railway:
//   AGENDAEDU_CLIENT_ID      → client_id OAuth2 da AgendaEdu
//   AGENDAEDU_CLIENT_SECRET  → client_secret OAuth2 da AgendaEdu
//   AGENDAEDU_SCHOOL_TOKEN   → x-school-token da escola (header obrigatório)
//   AGENDAEDU_OAUTH_URL      → URL do token OAuth2 (padrão: https://api.agendaedu.com/oauth/v2/token)
// ════════════════════════════════════════════════════════════════════════════
const AGENDAEDU_BASE         = 'https://api.agendaedu.com/v2';
const AGENDAEDU_CLIENT_ID    = process.env.AGENDAEDU_CLIENT_ID    || '';
const AGENDAEDU_CLIENT_SECRET= process.env.AGENDAEDU_CLIENT_SECRET|| '';
const AGENDAEDU_SCHOOL_TOKEN = process.env.AGENDAEDU_SCHOOL_TOKEN || '';
const AGENDAEDU_OAUTH_URL    = process.env.AGENDAEDU_OAUTH_URL    || 'https://api.agendaedu.com/oauth/v2/token';

let _agendaAccessToken = null;
let _agendaTokenExpiry = 0;

async function getAgendaEduToken() {
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

function agendaNotConfigured(res) {
  if (!AGENDAEDU_CLIENT_ID || !AGENDAEDU_CLIENT_SECRET) {
    res.status(503).json({ error: 'Integração AgendaEdu não configurada. Adicione AGENDAEDU_CLIENT_ID e AGENDAEDU_CLIENT_SECRET no Railway.' });
    return true;
  }
  return false;
}

// GET /api/agendaedu/channels — lista canais de atendimento
app.get('/api/agendaedu/channels', authRequired, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('GET', '/channels');
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] channels:', err.message); res.status(500).json({ error: err.message }); }
});

// GET /api/agendaedu/tickets — lista tickets de um canal
app.get('/api/agendaedu/tickets', authRequired, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const qs = new URLSearchParams(req.query).toString();
    const r  = await agendaProxy('GET', `/tickets${qs ? '?' + qs : ''}`);
    const d  = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] tickets:', err.message); res.status(500).json({ error: err.message }); }
});

// GET /api/agendaedu/tickets/:id — detalhe do ticket
app.get('/api/agendaedu/tickets/:id', authRequired, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('GET', `/tickets/${req.params.id}?include=requester,currentAttendant`);
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] ticket detail:', err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/agendaedu/tickets/:id/start — iniciar atendimento
app.post('/api/agendaedu/tickets/:id/start', authRequired, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', `/tickets/${req.params.id}/start`, req.body);
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] start:', err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/agendaedu/tickets/:id/close — encerrar atendimento
app.post('/api/agendaedu/tickets/:id/close', authRequired, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', `/tickets/${req.params.id}/close`, req.body);
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] close:', err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/agendaedu/tickets — criar novo ticket
app.post('/api/agendaedu/tickets', authRequired, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', '/tickets', req.body);
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] create ticket:', err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/agendaedu/tickets/:id/transfer — transferir atendimento
app.post('/api/agendaedu/tickets/:id/transfer', authRequired, async (req, res) => {
  try {
    if (agendaNotConfigured(res)) return;
    const r = await agendaProxy('POST', `/tickets/${req.params.id}/transfer`, req.body);
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    res.json(d);
  } catch (err) { console.error('[AgendaEdu] transfer:', err.message); res.status(500).json({ error: err.message }); }
});

// GET /api/agendaedu/channels/:channelId/chats/:chatId/messages — mensagens de um chat
app.get('/api/agendaedu/channels/:channelId/chats/:chatId/messages', authRequired, async (req, res) => {
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

// ─── Health ───────────────────────────────────────────────────────────────
app.get('/health', async (_, res) => {
  let dbOk = false;
  try { await pool.query('SELECT 1'); dbOk = true; } catch (_) {}
  res.json({ ok: true, env: IS_PROD ? 'production' : 'sandbox', db: dbOk });
});

// ─── Start ────────────────────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[Central PED v3] Porta ${PORT} — ${IS_PROD ? 'PRODUÇÃO' : 'SANDBOX'}`);
    });
  })
  .catch(err => {
    console.error('[FATAL]', err.message);
    process.exit(1);
  });
