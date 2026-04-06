-- ══════════════════════════════════════════════════════════════
--  Central Operacional — Grupo PED
--  Schema SQL — Equipe e Permissões
--  Banco: PostgreSQL 15+ (compatível com Railway)
-- ══════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- 1. TABELA: papeis
--    Define os papéis/roles disponíveis no sistema.
--    Relação 1:N com usuarios (um usuário tem um papel).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS papeis (
  id          SERIAL        PRIMARY KEY,
  chave       VARCHAR(50)   NOT NULL UNIQUE,   -- ex: 'admin', 'gestor', 'financeiro'
  nome        VARCHAR(100)  NOT NULL,           -- ex: 'Administrador'
  descricao   TEXT,                             -- ex: 'Acesso total ao sistema'
  cor         VARCHAR(7)    NOT NULL DEFAULT '#64748B',  -- hex color
  nivel       SMALLINT      NOT NULL DEFAULT 1, -- 1=visualizador ... 10=admin
  criado_em   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed de papéis padrão
INSERT INTO papeis (chave, nome, descricao, cor, nivel) VALUES
  ('admin',        'Administrador',  'Acesso total ao sistema',                            '#8B5CF6', 10),
  ('gestor',       'Gestor',         'Cria, edita e aprova em todos os módulos',           '#3B82F6',  7),
  ('financeiro',   'Financeiro',     'Acesso aos módulos financeiros',                     '#10B981',  5),
  ('pedagogico',   'Pedagógico',     'Acesso aos módulos de processos e RH',               '#F59E0B',  5),
  ('ti',           'T.I.',           'Acesso ao módulo de T.I. e suporte',                 '#06B6D4',  5),
  ('operador',     'Operador',       'Cria e edita tarefas nos módulos liberados',         '#64748B',  3),
  ('visualizador', 'Visualizador',   'Somente leitura — não pode criar ou editar',         '#94A3B8',  1)
ON CONFLICT (chave) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 2. TABELA: escolas
--    Multiempresa: cada escola é uma unidade isolada.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escolas (
  id          VARCHAR(20)   PRIMARY KEY,        -- ex: 'ped1', 'ped2'
  nome        VARCHAR(150)  NOT NULL,
  sigla       VARCHAR(10)   NOT NULL,
  cor         VARCHAR(7)    NOT NULL DEFAULT '#3B82F6',
  ativa       BOOLEAN       NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────
-- 3. TABELA: usuarios
--    Um usuário pertence a um papel e pode ter acesso
--    a múltiplas escolas (relação N:N via usuario_escolas).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id              VARCHAR(50)   PRIMARY KEY,           -- ex: 'usr1', uuid
  nome            VARCHAR(150)  NOT NULL,
  email           VARCHAR(200)  NOT NULL UNIQUE,
  senha_hash      TEXT          NOT NULL,              -- bcrypt hash — NUNCA armazene plain text
  papel_chave     VARCHAR(50)   NOT NULL REFERENCES papeis(chave) ON UPDATE CASCADE,
  ativo           BOOLEAN       NOT NULL DEFAULT TRUE,
  avatar_url      TEXT,                                -- URL opcional de avatar
  ultimo_login    TIMESTAMPTZ,
  criado_em       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_usuarios_email     ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_papel     ON usuarios(papel_chave);
CREATE INDEX IF NOT EXISTS idx_usuarios_ativo     ON usuarios(ativo);


-- ────────────────────────────────────────────────────────────
-- 4. TABELA: usuario_escolas  (N:N — usuário × escola)
--    Controla quais escolas cada usuário pode acessar.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuario_escolas (
  usuario_id  VARCHAR(50) NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  escola_id   VARCHAR(20) NOT NULL REFERENCES escolas(id)  ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, escola_id)
);


-- ────────────────────────────────────────────────────────────
-- 5. TABELA: permissoes
--    Catálogo de permissões granulares disponíveis.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissoes (
  id          SERIAL        PRIMARY KEY,
  chave       VARCHAR(100)  NOT NULL UNIQUE,  -- ex: 'pode_excluir_tarefas'
  nome        VARCHAR(150)  NOT NULL,          -- ex: 'Pode excluir tarefas'
  descricao   TEXT,
  categoria   VARCHAR(50)   NOT NULL DEFAULT 'geral',  -- 'geral' | 'financeiro' | 'equipe'
  criado_em   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed de permissões granulares
INSERT INTO permissoes (chave, nome, descricao, categoria) VALUES
  ('pode_excluir_tarefas',  'Pode excluir tarefas',               'Permite deletar cards de qualquer fase',           'geral'),
  ('pode_convidar',         'Pode convidar outros usuários',       'Permite enviar convites para novos membros',       'equipe'),
  ('pode_ver_financeiro',   'Pode ver relatórios financeiros',     'Acesso a dashboards e relatórios com valores',     'financeiro'),
  ('pode_exportar',         'Pode exportar dados',                 'Permite baixar listas e relatórios em CSV/PDF',    'geral'),
  ('pode_editar_fluxos',    'Pode editar configurações de fluxos', 'Alterar fases, categorias e campos dos módulos',   'geral'),
  ('pode_gerenciar_equipe', 'Pode gerenciar equipe',               'Adicionar, editar e remover usuários',             'equipe')
ON CONFLICT (chave) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 6. TABELA: usuario_permissoes  (N:N — usuário × permissão)
--    Relação Many-to-Many entre usuários e permissões.
--
--    COMO FUNCIONA:
--    Cada usuário herda as permissões padrão do seu papel,
--    mas pode ter permissões extras (concedidas = TRUE) ou
--    removidas (concedidas = FALSE — override).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuario_permissoes (
  usuario_id     VARCHAR(50) NOT NULL REFERENCES usuarios(id)     ON DELETE CASCADE,
  permissao_id   INT         NOT NULL REFERENCES permissoes(id)   ON DELETE CASCADE,
  concedida      BOOLEAN     NOT NULL DEFAULT TRUE,   -- TRUE = tem a perm / FALSE = bloqueada
  concedida_por  VARCHAR(50) REFERENCES usuarios(id), -- quem atribuiu
  concedida_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, permissao_id)
);

-- Índice para lookup rápido por usuário
CREATE INDEX IF NOT EXISTS idx_usuario_permissoes_uid ON usuario_permissoes(usuario_id);


-- ────────────────────────────────────────────────────────────
-- 7. TABELA: papel_permissoes  (N:N — papel × permissão)
--    Define quais permissões cada papel tem por padrão.
--    Usado para herança automática ao criar um usuário.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS papel_permissoes (
  papel_chave    VARCHAR(50) NOT NULL REFERENCES papeis(chave) ON DELETE CASCADE ON UPDATE CASCADE,
  permissao_id   INT         NOT NULL REFERENCES permissoes(id) ON DELETE CASCADE,
  PRIMARY KEY (papel_chave, permissao_id)
);

-- Seed: permissões padrão por papel
-- (usa subquery para resolver id da permissão pelo chave)
INSERT INTO papel_permissoes (papel_chave, permissao_id)
SELECT 'admin', id FROM permissoes  -- admin tem tudo
ON CONFLICT DO NOTHING;

INSERT INTO papel_permissoes (papel_chave, permissao_id)
SELECT 'gestor', id FROM permissoes WHERE chave IN
  ('pode_excluir_tarefas','pode_convidar','pode_ver_financeiro','pode_exportar')
ON CONFLICT DO NOTHING;

INSERT INTO papel_permissoes (papel_chave, permissao_id)
SELECT 'financeiro', id FROM permissoes WHERE chave IN
  ('pode_ver_financeiro','pode_exportar')
ON CONFLICT DO NOTHING;

INSERT INTO papel_permissoes (papel_chave, permissao_id)
SELECT 'ti', id FROM permissoes WHERE chave IN
  ('pode_excluir_tarefas','pode_editar_fluxos')
ON CONFLICT DO NOTHING;

INSERT INTO papel_permissoes (papel_chave, permissao_id)
SELECT 'pedagogico', id FROM permissoes WHERE chave IN ('pode_exportar')
ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 8. VIEW: v_usuario_permissoes_efetivas
--    Resolve as permissões efetivas de um usuário:
--    papel padrão + overrides individuais.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_usuario_permissoes_efetivas AS
SELECT
  u.id           AS usuario_id,
  u.nome         AS usuario_nome,
  u.email,
  u.papel_chave,
  p.chave        AS permissao_chave,
  p.nome         AS permissao_nome,
  -- Se houver override individual, usa ele; senão usa a herança do papel
  COALESCE(up.concedida, TRUE) AS concedida
FROM usuarios u
JOIN papeis pa         ON pa.chave = u.papel_chave
JOIN papel_permissoes pp ON pp.papel_chave = pa.chave
JOIN permissoes p       ON p.id = pp.permissao_id
LEFT JOIN usuario_permissoes up
       ON up.usuario_id = u.id
      AND up.permissao_id = p.id

UNION

-- Permissões extras concedidas diretamente (não herdadas do papel)
SELECT
  u.id, u.nome, u.email, u.papel_chave,
  p.chave, p.nome, up.concedida
FROM usuarios u
JOIN usuario_permissoes up ON up.usuario_id = u.id
JOIN permissoes p          ON p.id = up.permissao_id
WHERE NOT EXISTS (
  SELECT 1 FROM papel_permissoes pp
  WHERE pp.papel_chave = u.papel_chave
    AND pp.permissao_id = up.permissao_id
);


-- ────────────────────────────────────────────────────────────
-- 9. FUNÇÃO: verificar_permissao(usuario_id, permissao_chave)
--    Retorna TRUE se o usuário tem a permissão ativa.
--    Uso: SELECT verificar_permissao('usr1', 'pode_ver_financeiro');
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION verificar_permissao(
  p_usuario_id    VARCHAR(50),
  p_perm_chave    VARCHAR(100)
) RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT concedida
       FROM v_usuario_permissoes_efetivas
      WHERE usuario_id = p_usuario_id
        AND permissao_chave = p_perm_chave
      LIMIT 1),
    FALSE
  );
$$ LANGUAGE SQL STABLE;


-- ────────────────────────────────────────────────────────────
-- 10. TRIGGER: atualizado_em automático
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_usuarios_atualizado
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

CREATE TRIGGER trg_papeis_atualizado
  BEFORE UPDATE ON papeis
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();


-- ════════════════════════════════════════════════════════════
-- EXEMPLOS DE QUERIES ÚTEIS
-- ════════════════════════════════════════════════════════════

-- Listar todos os usuários com seu papel e escolas:
/*
SELECT
  u.id, u.nome, u.email, u.ativo,
  pa.nome AS papel,
  STRING_AGG(e.sigla, ', ' ORDER BY e.sigla) AS escolas
FROM usuarios u
JOIN papeis pa ON pa.chave = u.papel_chave
LEFT JOIN usuario_escolas ue ON ue.usuario_id = u.id
LEFT JOIN escolas e ON e.id = ue.escola_id
GROUP BY u.id, u.nome, u.email, u.ativo, pa.nome
ORDER BY u.nome;
*/

-- Verificar se usr1 pode ver relatórios financeiros:
/*
SELECT verificar_permissao('usr1', 'pode_ver_financeiro');
*/

-- Listar permissões efetivas de um usuário:
/*
SELECT permissao_chave, permissao_nome, concedida
FROM v_usuario_permissoes_efetivas
WHERE usuario_id = 'usr1'
ORDER BY permissao_chave;
*/

-- Conceder permissão extra a um usuário (override):
/*
INSERT INTO usuario_permissoes (usuario_id, permissao_id, concedida, concedida_por)
SELECT 'usr3', id, TRUE, 'usr1'
FROM permissoes WHERE chave = 'pode_ver_financeiro'
ON CONFLICT (usuario_id, permissao_id)
DO UPDATE SET concedida = TRUE, concedida_em = NOW();
*/

-- Revogar permissão (mesmo que o papel a conceda):
/*
INSERT INTO usuario_permissoes (usuario_id, permissao_id, concedida, concedida_por)
SELECT 'usr3', id, FALSE, 'usr1'
FROM permissoes WHERE chave = 'pode_exportar'
ON CONFLICT (usuario_id, permissao_id)
DO UPDATE SET concedida = FALSE, concedida_em = NOW();
*/
