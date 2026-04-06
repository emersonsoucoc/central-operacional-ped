/**
 * ══════════════════════════════════════════════════════════════
 *  Central Operacional — Grupo PED
 *  api-teams.js — API REST de Equipe & Permissões
 *  Stack: Node.js 20 + Express 4 + PostgreSQL (pg) + bcrypt + JWT
 *
 *  Para usar:
 *    npm install express pg bcryptjs jsonwebtoken cors dotenv
 *    node api-teams.js
 *
 *  Variáveis de ambiente (.env):
 *    DATABASE_URL=postgres://user:pass@host:5432/db
 *    JWT_SECRET=sua_chave_jwt_muito_secreta
 *    PORT=3001
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

require('dotenv').config();
const express  = require('express');
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');

const app  = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const PORT       = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());


/* ────────────────────────────────────────────────────────────
   MIDDLEWARE: verificar JWT
   Adicione em rotas que exigem autenticação.
──────────────────────────────────────────────────────────── */
function autenticar(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Token não fornecido.' });
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

/* Verifica se o usuário autenticado tem uma permissão granular */
async function requerPermissao(permChave) {
  return async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        'SELECT verificar_permissao($1, $2) AS ok',
        [req.usuario.id, permChave]
      );
      if (!rows[0]?.ok) {
        return res.status(403).json({ erro: `Permissão negada: ${permChave}` });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}


/* ════════════════════════════════════════════════════════════
   AUTH — Login e emissão de JWT
════════════════════════════════════════════════════════════ */

/**
 * POST /api/login
 * Body: { email, senha }
 * Retorna: { token, usuario }
 */
app.post('/api/login', async (req, res, next) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'email e senha são obrigatórios.' });

    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.senha_hash, u.papel_chave, u.ativo,
              p.nome AS papel_nome, p.cor AS papel_cor
         FROM usuarios u
         JOIN papeis p ON p.chave = u.papel_chave
        WHERE u.email = $1`,
      [email]
    );

    const user = rows[0];
    if (!user)               return res.status(401).json({ erro: 'Credenciais inválidas.' });
    if (!user.ativo)         return res.status(403).json({ erro: 'Conta desativada.' });

    const senhaOk = await bcrypt.compare(senha, user.senha_hash);
    if (!senhaOk)            return res.status(401).json({ erro: 'Credenciais inválidas.' });

    /* Carrega permissões granulares efetivas */
    const { rows: permsRows } = await pool.query(
      `SELECT permissao_chave, concedida
         FROM v_usuario_permissoes_efetivas
        WHERE usuario_id = $1`,
      [user.id]
    );
    const permissoes = permsRows
      .filter(p => p.concedida)
      .map(p => p.permissao_chave);

    /* Carrega escolas acessíveis */
    const { rows: escolasRows } = await pool.query(
      `SELECT ue.escola_id AS id, e.nome, e.sigla, e.cor
         FROM usuario_escolas ue
         JOIN escolas e ON e.id = ue.escola_id
        WHERE ue.usuario_id = $1`,
      [user.id]
    );

    const payload = {
      id:         user.id,
      nome:       user.nome,
      email:      user.email,
      papel:      user.papel_chave,
      papelNome:  user.papel_nome,
      papelCor:   user.papel_cor,
      permissoes,
      escolas:    escolasRows.map(e => e.id),
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

    // Registra último login
    await pool.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [user.id]);

    res.json({ token, usuario: payload });
  } catch (err) {
    next(err);
  }
});


/* ════════════════════════════════════════════════════════════
   USUÁRIOS — CRUD completo
════════════════════════════════════════════════════════════ */

/**
 * GET /api/usuarios
 * Lista todos os usuários com papel e escolas.
 * Requer: autenticação + pode_gerenciar_equipe
 */
app.get('/api/usuarios', autenticar, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id, u.nome, u.email, u.ativo, u.papel_chave,
        u.ultimo_login, u.criado_em,
        p.nome AS papel_nome, p.cor AS papel_cor,
        COALESCE(
          JSON_AGG(e.id ORDER BY e.sigla) FILTER (WHERE e.id IS NOT NULL),
          '[]'
        ) AS escolas
      FROM usuarios u
      JOIN papeis p ON p.chave = u.papel_chave
      LEFT JOIN usuario_escolas ue ON ue.usuario_id = u.id
      LEFT JOIN escolas e ON e.id = ue.escola_id
      GROUP BY u.id, u.nome, u.email, u.ativo, u.papel_chave,
               u.ultimo_login, u.criado_em, p.nome, p.cor
      ORDER BY u.nome
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/usuarios/:id
 * Retorna um usuário com suas permissões granulares.
 */
app.get('/api/usuarios/:id', autenticar, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.ativo, u.papel_chave,
              u.avatar_url, u.ultimo_login, u.criado_em,
              p.nome AS papel_nome, p.cor AS papel_cor
         FROM usuarios u JOIN papeis p ON p.chave = u.papel_chave
        WHERE u.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    /* Permissões efetivas */
    const { rows: perms } = await pool.query(
      `SELECT permissao_chave, concedida
         FROM v_usuario_permissoes_efetivas WHERE usuario_id = $1`,
      [req.params.id]
    );

    /* Escolas */
    const { rows: escolas } = await pool.query(
      `SELECT e.id, e.nome, e.sigla FROM usuario_escolas ue
         JOIN escolas e ON e.id = ue.escola_id WHERE ue.usuario_id = $1`,
      [req.params.id]
    );

    res.json({
      ...rows[0],
      permissoes: perms.filter(p => p.concedida).map(p => p.permissao_chave),
      escolas: escolas.map(e => e.id),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/usuarios
 * Cria um novo usuário (convite).
 * Body: { nome, email, senha, papel_chave, escolas[], permissoesGranulares[] }
 */
app.post('/api/usuarios', autenticar, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      nome, email, senha, papel_chave,
      escolas = [], permissoesGranulares = [],
    } = req.body;

    if (!nome || !email || !senha || !papel_chave)
      return res.status(400).json({ erro: 'nome, email, senha e papel_chave são obrigatórios.' });

    /* Verifica duplicidade */
    const { rows: dup } = await client.query(
      'SELECT id FROM usuarios WHERE email = $1', [email]
    );
    if (dup.length) return res.status(409).json({ erro: 'E-mail já cadastrado.' });

    const senhaHash = await bcrypt.hash(senha, 12);
    const novoId    = `usr_${Date.now()}`;

    await client.query('BEGIN');

    /* Insere usuário */
    await client.query(
      `INSERT INTO usuarios (id, nome, email, senha_hash, papel_chave)
       VALUES ($1, $2, $3, $4, $5)`,
      [novoId, nome, email, senhaHash, papel_chave]
    );

    /* Associa escolas */
    for (const escolaId of escolas) {
      await client.query(
        'INSERT INTO usuario_escolas (usuario_id, escola_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [novoId, escolaId]
      );
    }

    /* Salva permissões granulares (somente as que diferem do default do papel) */
    if (permissoesGranulares.length > 0) {
      for (const permChave of permissoesGranulares) {
        await client.query(`
          INSERT INTO usuario_permissoes (usuario_id, permissao_id, concedida, concedida_por)
          SELECT $1, id, TRUE, $2 FROM permissoes WHERE chave = $3
          ON CONFLICT (usuario_id, permissao_id) DO UPDATE SET concedida = TRUE
        `, [novoId, req.usuario.id, permChave]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ id: novoId, mensagem: 'Usuário criado com sucesso.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

/**
 * PUT /api/usuarios/:id
 * Atualiza dados de um usuário.
 * Body: { nome?, email?, senha?, papel_chave?, escolas[]?, permissoesGranulares[]?, ativo? }
 */
app.put('/api/usuarios/:id', autenticar, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      nome, email, senha, papel_chave,
      escolas, permissoesGranulares, ativo,
    } = req.body;
    const { id } = req.params;

    await client.query('BEGIN');

    /* Atualiza campos básicos */
    const updates = [];
    const vals    = [];
    let   idx     = 1;
    if (nome        !== undefined) { updates.push(`nome = $${idx++}`);       vals.push(nome); }
    if (email       !== undefined) { updates.push(`email = $${idx++}`);      vals.push(email); }
    if (papel_chave !== undefined) { updates.push(`papel_chave = $${idx++}`);vals.push(papel_chave); }
    if (ativo       !== undefined) { updates.push(`ativo = $${idx++}`);      vals.push(ativo); }
    if (senha) {
      const hash = await bcrypt.hash(senha, 12);
      updates.push(`senha_hash = $${idx++}`);
      vals.push(hash);
    }
    if (updates.length) {
      vals.push(id);
      await client.query(
        `UPDATE usuarios SET ${updates.join(', ')} WHERE id = $${idx}`,
        vals
      );
    }

    /* Atualiza escolas */
    if (Array.isArray(escolas)) {
      await client.query('DELETE FROM usuario_escolas WHERE usuario_id = $1', [id]);
      for (const eid of escolas) {
        await client.query(
          'INSERT INTO usuario_escolas (usuario_id, escola_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, eid]
        );
      }
    }

    /* Atualiza permissões granulares */
    if (Array.isArray(permissoesGranulares)) {
      /* Remove overrides anteriores */
      await client.query('DELETE FROM usuario_permissoes WHERE usuario_id = $1', [id]);
      for (const permChave of permissoesGranulares) {
        await client.query(`
          INSERT INTO usuario_permissoes (usuario_id, permissao_id, concedida, concedida_por)
          SELECT $1, id, TRUE, $2 FROM permissoes WHERE chave = $3
          ON CONFLICT (usuario_id, permissao_id) DO UPDATE SET concedida = TRUE
        `, [id, req.usuario.id, permChave]);
      }
    }

    await client.query('COMMIT');
    res.json({ mensagem: 'Usuário atualizado.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/usuarios/:id
 * Remove um usuário. O CASCADE no schema remove registros filhos.
 */
app.delete('/api/usuarios/:id', autenticar, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.json({ mensagem: 'Usuário removido.' });
  } catch (err) {
    next(err);
  }
});


/* ════════════════════════════════════════════════════════════
   PAPÉIS — Listagem e permissões padrão
════════════════════════════════════════════════════════════ */

/** GET /api/papeis — Lista todos os papéis */
app.get('/api/papeis', autenticar, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM papeis ORDER BY nivel DESC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** GET /api/papeis/:chave/permissoes — Permissões padrão de um papel */
app.get('/api/papeis/:chave/permissoes', autenticar, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.chave, p.nome, p.descricao, p.categoria
        FROM papel_permissoes pp
        JOIN permissoes p ON p.id = pp.permissao_id
       WHERE pp.papel_chave = $1
       ORDER BY p.categoria, p.nome
    `, [req.params.chave]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});


/* ════════════════════════════════════════════════════════════
   PERMISSÕES — Catálogo e verificação individual
════════════════════════════════════════════════════════════ */

/** GET /api/permissoes — Catálogo completo de permissões */
app.get('/api/permissoes', autenticar, async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM permissoes ORDER BY categoria, nome');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/permissoes/verificar
 * Query: ?usuario_id=xxx&permissao=pode_ver_financeiro
 * Retorna: { tem: true/false }
 */
app.get('/api/permissoes/verificar', autenticar, async (req, res, next) => {
  try {
    const { usuario_id, permissao } = req.query;
    if (!usuario_id || !permissao)
      return res.status(400).json({ erro: 'usuario_id e permissao são obrigatórios.' });

    const { rows } = await pool.query(
      'SELECT verificar_permissao($1, $2) AS tem',
      [usuario_id, permissao]
    );
    res.json({ tem: rows[0]?.tem ?? false });
  } catch (err) {
    next(err);
  }
});


/* ════════════════════════════════════════════════════════════
   MIDDLEWARE DE ERRO GLOBAL
════════════════════════════════════════════════════════════ */
app.use((err, _req, res, _next) => {
  console.error('[API Error]', err.message);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});


/* ════════════════════════════════════════════════════════════
   INICIALIZAÇÃO
════════════════════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`✅  API Teams rodando em http://localhost:${PORT}`);
  console.log(`    Banco: ${process.env.DATABASE_URL?.split('@')[1] || 'configurar DATABASE_URL'}`);
});

module.exports = app; // Para testes com Jest/Supertest
