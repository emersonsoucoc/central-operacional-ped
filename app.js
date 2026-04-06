/* ═══════════════════════════════════════════════════════════
   CENTRAL OPERACIONAL — Grupo PED
   script.js — 5 módulos, Kanban dinâmico, Drag & Drop, Anexos
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════════════════════
   INTEGRAÇÃO E-REDE — Link de Pagamento
   Altere a URL abaixo após o deploy no Railway.
══════════════════════════════════════════════════════════ */
const PAYMENT_BACKEND_URL = 'https://central-operacional-ped-production.up.railway.app';

/* ══════════════════════════════════════════════════════════
   SISTEMA DE AUTENTICAÇÃO — JWT (Backend-First)
   Senhas NUNCA ficam no frontend. Login via POST /api/login.
══════════════════════════════════════════════════════════ */

const AUTH_TOKEN_KEY = 'ped_jwt_token';
const AUTH_USER_KEY  = 'ped_auth_user';

/* ─── Reset de emergência via URL (?reset=1) ──────────── */
(function () {
  if (new URLSearchParams(window.location.search).get('reset') === '1') {
    sessionStorage.clear();
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    const clean = window.location.pathname + (window.location.hash || '');
    window.location.replace(clean);
  }
})();

/* Token JWT e dados do usuário */
let _authToken  = sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY) || null;
let currentUser = null;

/* Recupera dados do user salvos */
function loadSession() {
  if (!_authToken) return null;
  try {
    const saved = sessionStorage.getItem(AUTH_USER_KEY) || localStorage.getItem(AUTH_USER_KEY);
    if (saved) {
      const user = JSON.parse(saved);
      if (user && user.id && user.email) return user;
    }
  } catch(_) {}
  return null;
}

function saveSession(token, user) {
  _authToken = token;
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  // Backup no localStorage para persistir entre abas
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } catch(_) {}
}

function clearSession() {
  _authToken = null;
  currentUser = null;
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

/* Retorna o token para usar nos headers */
function getAuthToken() { return _authToken; }

/* Resolve permissions for current user + module using the matrix */
function resolvePerms(moduleKey) {
  if (!currentUser) return [];

  /* 1. Check explicit user-level permissoes (from JWT/API) */
  const explicit = currentUser.permissoes?.[moduleKey] || currentUser.permissions?.[moduleKey];
  if (explicit && explicit.length > 0) return explicit;

  /* 2. Use profile matrix (custom saved > defaults) */
  const perfil = currentUser.perfil || currentUser.role || 'visualizador';
  const customMatrix = settingsData.permissoes || {};
  const profileMatrix = customMatrix[perfil] || DEFAULT_PERM_MATRIX[perfil] || DEFAULT_PERM_MATRIX.visualizador;

  /* Module-specific entry takes priority over wildcard */
  if (profileMatrix[moduleKey]) return profileMatrix[moduleKey];
  if (profileMatrix['*']) return profileMatrix['*'];
  return [];
}

function canAccess(moduleKey) {
  if (!currentUser) return false;
  if (currentUser.perfil === 'admin') return true;
  return resolvePerms(moduleKey).includes('ver');
}

function canCreate(moduleKey) {
  if (!currentUser) return false;
  if (currentUser.perfil === 'admin') return true;
  return resolvePerms(moduleKey).includes('criar');
}

function canEdit(moduleKey) {
  if (!currentUser) return false;
  if (currentUser.perfil === 'admin') return true;
  return resolvePerms(moduleKey).includes('editar');
}

function canMove(moduleKey) {
  if (!currentUser) return false;
  if (currentUser.perfil === 'admin') return true;
  return resolvePerms(moduleKey).includes('mover');
}

function canDelete(moduleKey) {
  if (!currentUser) return false;
  if (currentUser.perfil === 'admin') return true;
  return resolvePerms(moduleKey).includes('excluir');
}

/* Atualiza sidebar com dados do usuário logado */
function updateSidebarUser() {
  if (!currentUser) return;
  const avatarEl = document.getElementById('sidebarUserAvatar');
  const nameEl   = document.getElementById('sidebarUserName');
  const roleEl   = document.getElementById('sidebarUserRole');
  if (avatarEl) avatarEl.textContent = currentUser.initials || currentUser.nome?.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() || '??';
  if (nameEl)   nameEl.textContent   = currentUser.nome || currentUser.name || '';
  if (roleEl)   roleEl.textContent   = currentUser.role || '';
}

/* Filtra itens de nav conforme permissões */
function applyNavPermissions() {
  document.querySelectorAll('.nav-item[data-module]').forEach(el => {
    const mod = el.dataset.module;
    if (!MODULES[mod]) return;
    el.style.display = canAccess(mod) ? '' : 'none';
  });
  const newBtn = document.getElementById('newCardBtn');
  if (newBtn) newBtn.style.display = canCreate(state.currentModule) ? '' : 'none';

  /* Hide nav-groups where ALL sub-items are hidden */
  document.querySelectorAll('.nav-group').forEach(group => {
    const items = group.querySelectorAll('.nav-item[data-module]');
    const anyVisible = Array.from(items).some(el => el.style.display !== 'none');
    group.style.display = anyVisible ? '' : 'none';
  });
}

/* Aggregate badges for nav groups */
function renderNavGroupBadges() {
  document.querySelectorAll('.nav-group').forEach(group => {
    const badge = group.querySelector('.nav-group-badge');
    if (!badge) return;
    const total = Array.from(group.querySelectorAll('.nav-item[data-module]')).reduce((sum, el) => {
      const modBadge = document.getElementById(`badge-${el.dataset.module}`);
      return sum + (parseInt(modBadge?.textContent || '0', 10) || 0);
    }, 0);
    badge.textContent = total;
    badge.style.display = total > 0 ? '' : 'none';
  });
}

/* Sidebar collapsible groups */
function initSidebarGroups() {
  const STORAGE_KEY = 'ped_nav_groups';
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

  document.querySelectorAll('.nav-group').forEach(group => {
    const groupName = group.dataset.group;
    /* Default: all open. Use saved state if present. */
    const isOpen = saved[groupName] !== false;
    group.classList.toggle('nav-group--open', isOpen);
    const toggle = group.querySelector('.nav-group-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', isOpen);

    toggle?.addEventListener('click', () => {
      const nowOpen = group.classList.toggle('nav-group--open');
      toggle.setAttribute('aria-expanded', nowOpen);
      const states = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      states[groupName] = nowOpen;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
    });
  });
}

/* ──── FUNÇÕES DE LOGIN/LOGOUT ──── */
function showLoginScreen() {
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('appWrapper').style.display   = 'none';
  setTimeout(() => document.getElementById('loginEmail')?.focus(), 100);
}

function hideLoginScreen() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('appWrapper').style.display   = '';
}

async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const errorEl  = document.getElementById('loginError');
  const submitBtn = document.getElementById('loginSubmitBtn');

  if (!email || !password) {
    errorEl.textContent = 'Preencha e-mail e senha.';
    return;
  }

  errorEl.textContent = '';
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${PAYMENT_BACKEND_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;

    if (!res.ok) {
      errorEl.textContent = data.error || 'E-mail ou senha incorretos.';
      document.getElementById('loginPassword').value = '';
      document.getElementById('loginPassword').focus();
      document.getElementById('loginCard')?.classList.add('shake');
      setTimeout(() => document.getElementById('loginCard')?.classList.remove('shake'), 500);
      return;
    }

    // Login OK — salva token + dados do user
    saveSession(data.token, data.user);
    currentUser = data.user;
    hideLoginScreen();
    updateSidebarUser();
    applyNavPermissions();

    // Carrega dados do sistema
    await loadSettingsFromAPI();
    refreshEscolasSelects();
    await loadCardsFromAPI();
    renderKanban();
    renderNavBadges();

    const firstName = (currentUser.nome || '').split(' ')[0];
    showToast(`Bem-vindo, ${firstName}!`, 'success');
  } catch (err) {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
    errorEl.textContent = 'Erro de conexao. Verifique sua internet.';
    console.error('[LOGIN]', err);
  }
}

function handleLogout() {
  if (!confirm('Deseja sair do sistema?')) return;
  clearSession();
  showLoginScreen();
  document.getElementById('loginEmail').value    = '';
  document.getElementById('loginPassword').value = '';
}

function showForgotModal() {
  // Remove modal anterior se existir
  const existing = document.getElementById('forgotModal');
  if (existing) existing.remove();

  const resetUrl = window.location.pathname + '?reset=1';

  const overlay = document.createElement('div');
  overlay.id = 'forgotModal';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;
    display:flex;align-items:center;justify-content:center;padding:1rem;
  `;
  overlay.innerHTML = `
    <div style="
      background:#fff;border-radius:16px;padding:2rem;max-width:420px;width:100%;
      box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:inherit;
    ">
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
        <div style="
          width:40px;height:40px;border-radius:50%;background:#FEF3C7;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;
        ">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div>
          <h3 style="margin:0;font-size:1.1rem;font-weight:700;color:#1E293B;">Recuperar Acesso</h3>
          <p style="margin:0;font-size:.8rem;color:#64748B;">Central Operacional — Grupo PED</p>
        </div>
      </div>

      <div style="background:#F8FAFC;border-radius:10px;padding:1rem;margin-bottom:1rem;border:1px solid #E2E8F0;">
        <p style="margin:0 0 .5rem;font-size:.85rem;font-weight:600;color:#475569;">Credenciais padrão do Administrador:</p>
        <div style="display:flex;flex-direction:column;gap:.25rem;">
          <div style="display:flex;justify-content:space-between;font-size:.85rem;">
            <span style="color:#64748B;">E-mail</span>
            <span style="font-weight:600;color:#1E293B;font-family:monospace;">emerson@grupoped.com.br</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:.85rem;">
            <span style="color:#64748B;">Senha</span>
            <span style="font-weight:600;color:#1E293B;font-family:monospace;">admin123</span>
          </div>
        </div>
      </div>

      <div style="background:#FEF2F2;border-radius:10px;padding:1rem;margin-bottom:1.25rem;border:1px solid #FECACA;">
        <p style="margin:0 0 .5rem;font-size:.82rem;font-weight:600;color:#DC2626;">Reset de Emergência</p>
        <p style="margin:0 0 .75rem;font-size:.8rem;color:#7F1D1D;line-height:1.5;">
          Se a senha padrão não funcionar, clique abaixo para restaurar todos os usuários
          ao estado original. <strong>Esta ação não pode ser desfeita.</strong>
        </p>
        <button id="forgotResetBtn" style="
          width:100%;padding:.6rem 1rem;background:#DC2626;color:#fff;
          border:none;border-radius:8px;font-size:.85rem;font-weight:600;
          cursor:pointer;transition:background .15s;
        " onmouseover="this.style.background='#B91C1C'" onmouseout="this.style.background='#DC2626'">
          🔄 Restaurar Usuários Padrão
        </button>
      </div>

      <button id="forgotCloseBtn" style="
        width:100%;padding:.65rem;background:#F1F5F9;color:#475569;
        border:none;border-radius:8px;font-size:.9rem;font-weight:500;cursor:pointer;
      ">Fechar</button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('forgotCloseBtn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('forgotResetBtn').addEventListener('click', () => {
    if (!confirm('Confirma o reset? Todos os usuários serão restaurados para o padrão e você será desconectado.')) return;
    localStorage.removeItem('ped_users');
    localStorage.removeItem('ped_auth_user');
    localStorage.removeItem('ped_usuarios');
    overlay.remove();
    // Recarrega a página para recarregar o array USERS padrão
    window.location.reload();
  });
}

function initLogin() {
  // Tenta restaurar sessão
  currentUser = loadSession();

  if (currentUser) {
    hideLoginScreen();
    updateSidebarUser();
    applyNavPermissions();
  } else {
    showLoginScreen();
  }

  // Eventos do formulário
  document.getElementById('loginForm').addEventListener('submit', handleLogin);

  // Toggle senha
  document.getElementById('loginEyeBtn').addEventListener('click', () => {
    const inp = document.getElementById('loginPassword');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // Esqueceu a senha
  document.getElementById('loginForgotBtn').addEventListener('click', showForgotModal);
}

/* ══════════════════════════════════════════════════════════
   CONFIG: MÓDULOS E FASES
══════════════════════════════════════════════════════════ */
let MODULES = {
  solicitacoes: {
    label: 'Solicitações Administrativas',
    shortLabel: 'Solicitações Admin.',
    btnLabel: 'Nova Solicitação',
    hasFinancial: false,
    categorias: ['Infraestrutura','Manutenção','TI','RH','Financeiro','Pedagógico','Compras','Segurança','Outros'],
    fases: {
      pendente:              { label:'Pendente',            color:'#F59E0B', bg:'#FFFBEB' },
      em_andamento:          { label:'Em Andamento',        color:'#3B82F6', bg:'#EFF6FF' },
      aguardando_validacao:  { label:'Aguard. Validação',   color:'#8B5CF6', bg:'#F5F3FF' },
      concluido:             { label:'Concluído',           color:'#10B981', bg:'#ECFDF5' },
    },
    lastPhase: 'concluido',
  },
  contas_pagar: {
    label: 'Contas a Pagar',
    shortLabel: 'Contas a Pagar',
    btnLabel: 'Nova Conta',
    hasFinancial: true,
    fornecedorLabel: 'Fornecedor',
    numDocLabel: 'Nº NF / Pedido',
    categorias: ['Fornecedores','Serviços','Utilidades','Aluguel','Folha de Pagamento','Impostos','Manutenção','TI','Outros'],
    fases: {
      solicitacao_criada:    { label:'Solicitação Criada',  color:'#94A3B8', bg:'#F1F5F9' },
      aguardando_aprovacao:  { label:'Aguard. Aprovação',   color:'#F59E0B', bg:'#FFFBEB' },
      aprovado:              { label:'Aprovado',            color:'#3B82F6', bg:'#EFF6FF' },
      aguardando_pagamento:  { label:'Aguard. Pagamento',   color:'#8B5CF6', bg:'#F5F3FF' },
      pago:                  { label:'Pago',                color:'#10B981', bg:'#ECFDF5' },
    },
    lastPhase: 'pago',
  },
  contas_receber: {
    label: 'Contas a Receber',
    shortLabel: 'Contas a Receber',
    btnLabel: 'Nova Cobrança',
    hasFinancial: true,
    hasPaymentLink: true,          // habilita fluxo de link de pagamento
    paymentGenPhase: 'aguardando_pagamento',
    paymentConfirmPhase: 'pagamento_efetuado',
    fornecedorLabel: 'Cliente / Aluno',
    numDocLabel: 'Nº Fatura / Referência',
    categorias: ['Mensalidades','Matrículas','Material Didático','Eventos','Cursos','Taxa de Serviços','Outros'],
    fases: {
      criar_link:           { label:'Criar Link',        color:'#6366F1', bg:'#EEF2FF' },
      aguardando_pagamento: { label:'Aguard. Pagamento', color:'#F59E0B', bg:'#FFFBEB' },
      pagamento_efetuado:   { label:'Pag. Efetuado',    color:'#3B82F6', bg:'#EFF6FF' },
      processando:          { label:'Processando CR',   color:'#8B5CF6', bg:'#F5F3FF' },
      concluido:            { label:'Concluído',         color:'#10B981', bg:'#ECFDF5' },
    },
    lastPhase: 'concluido',
  },
  compras: {
    label: 'Compras',
    shortLabel: 'Compras',
    btnLabel: 'Nova Compra',
    hasFinancial: true,
    fornecedorLabel: 'Fornecedor',
    numDocLabel: 'Nº Pedido / Cotação',
    categorias: ['Material de Escritório','Material Didático','Equipamentos TI','Móveis','Alimentação','Limpeza','Serviços','Infraestrutura','Outros'],
    fases: {
      solicitacao:     { label:'Solicitação',    color:'#94A3B8', bg:'#F1F5F9' },
      cotacao:         { label:'Cotação',        color:'#F59E0B', bg:'#FFFBEB' },
      aprovacao:       { label:'Aprovação',      color:'#8B5CF6', bg:'#F5F3FF' },
      pedido_realizado:{ label:'Pedido Realizado',color:'#3B82F6', bg:'#EFF6FF' },
      entregue:        { label:'Entregue',       color:'#10B981', bg:'#ECFDF5' },
    },
    lastPhase: 'entregue',
  },
  processos: {
    label: 'Cumprimento de Processos',
    shortLabel: 'Processos',
    btnLabel: 'Novo Processo',
    hasFinancial: false,
    categorias: ['Pedagógico','Administrativo','RH','Financeiro','Qualidade','Segurança','Legal','Outros'],
    fases: {
      pendente:             { label:'Pendente',          color:'#F59E0B', bg:'#FFFBEB' },
      em_andamento:         { label:'Em Andamento',      color:'#3B82F6', bg:'#EFF6FF' },
      aguardando_validacao: { label:'Aguard. Validação', color:'#8B5CF6', bg:'#F5F3FF' },
      concluido:            { label:'Concluído',         color:'#10B981', bg:'#ECFDF5' },
    },
    lastPhase: 'concluido',
  },
  ti: {
    label: 'Suporte de T.I',
    shortLabel: 'T.I',
    btnLabel: 'Novo Chamado',
    hasFinancial: false,
    categorias: ['Hardware','Software','Rede / Conectividade','Segurança da Informação','Sistemas','Infraestrutura TI','Suporte ao Usuário','Outros'],
    fases: {
      aberto:               { label:'Aberto',            color:'#94A3B8', bg:'#F1F5F9' },
      diagnostico:          { label:'Diagnóstico',       color:'#F59E0B', bg:'#FFFBEB' },
      em_atendimento:       { label:'Em Atendimento',    color:'#3B82F6', bg:'#EFF6FF' },
      aguardando_aprovacao: { label:'Aguard. Aprovação', color:'#8B5CF6', bg:'#F5F3FF' },
      resolvido:            { label:'Resolvido',         color:'#10B981', bg:'#ECFDF5' },
    },
    lastPhase: 'resolvido',
  },
  recursos_humanos: {
    label     : 'Recursos Humanos',
    shortLabel: 'RH',
    btnLabel  : 'Nova Solicitação RH',
    hasFinancial: false,
    categorias: ['Admissão','Desligamento','Férias','Afastamento','Treinamento','Ponto / Jornada','Benefícios','Folha de Pagamento','Outros'],
    fases: {
      recebido    : { label:'Recebido',        color:'#94A3B8', bg:'#F1F5F9', slaDias:2  },
      em_analise  : { label:'Em análise',      color:'#F59E0B', bg:'#FFFBEB', slaDias:3  },
      aprovado    : { label:'Aprovado',        color:'#3B82F6', bg:'#EFF6FF', slaDias:5  },
      em_execucao : { label:'Em execução',     color:'#8B5CF6', bg:'#F5F3FF', slaDias:7  },
      concluido   : { label:'Concluído',       color:'#10B981', bg:'#ECFDF5'             },
      cancelado   : { label:'Cancelado',       color:'#EF4444', bg:'#FEF2F2'             },
    },
    lastPhase: 'concluido',
  },

  comercial: {
    label     : 'Comercial — CRM de Leads',
    shortLabel: 'Comercial',
    btnLabel  : 'Novo Lead',
    hasFinancial: false,
    hasLead   : true,
    categorias: ['Indicação','Site / SEO','Redes Sociais','Instagram','Facebook','Evento','Captação Ativa','Parceria','WhatsApp','Outros'],
    fases: {
      novo_lead        : { label:'Novo Lead',         color:'#6366F1', bg:'#EEF2FF' },
      contato_realizado: { label:'Contato Realizado',  color:'#F59E0B', bg:'#FFFBEB', slaDias:2 },
      visita_agendada  : { label:'Visita Agendada',    color:'#3B82F6', bg:'#EFF6FF', slaDias:3 },
      proposta_enviada : { label:'Proposta Enviada',   color:'#8B5CF6', bg:'#F5F3FF', slaDias:5 },
      matricula_fechada: { label:'Matrícula Fechada',  color:'#10B981', bg:'#ECFDF5' },
      perdido          : { label:'Perdido',            color:'#EF4444', bg:'#FEF2F2' },
    },
    lastPhase: 'matricula_fechada',
  },

  central_pagamentos: {
    label: 'Central de Pagamentos',
    shortLabel: 'Central Pgto.',
    btnLabel: 'Nova Cobrança',
    hasFinancial: true,
    hasPaymentLink: true,
    paymentGenPhase: 'aguardando_pagamento',
    paymentConfirmPhase: 'pago',
    fornecedorLabel: 'Cliente / Responsável',
    numDocLabel: 'CPF / CNPJ',
    categorias: ['Mensalidade','Matrícula','Material Didático','Uniforme','Evento','Taxa Administrativa','Outros'],
    fases: {
      nova_cobranca:        { label:'Nova Cobrança',     color:'#6366F1', bg:'#EEF2FF' },
      aguardando_pagamento: { label:'Aguard. Pagamento', color:'#F59E0B', bg:'#FFFBEB' },
      pago:                 { label:'Pago ✓',            color:'#10B981', bg:'#ECFDF5' },
      vencido:              { label:'Vencido',           color:'#EF4444', bg:'#FEF2F2' },
      cancelado:            { label:'Cancelado',         color:'#64748B', bg:'#F1F5F9' },
    },
    lastPhase: 'pago',
  },
};

/* Defaults para comparar — não alterar */
const _DEFAULT_MODULE_KEYS = Object.keys(MODULES);

/* ── Garante que módulos built-in sempre existam após qualquer override ── */
const _BUILTIN_MODULES_SNAPSHOT = JSON.parse(JSON.stringify(MODULES));

function patchBuiltinModules(saveAfter) {
  let patched = false;
  Object.entries(_BUILTIN_MODULES_SNAPSHOT).forEach(([key, mod]) => {
    if (!MODULES[key]) {
      MODULES[key] = mod;
      patched = true;
      console.log('[Modules] Módulo restaurado:', key);
    }
  });
  // Só salva no banco quando chamado pós-login (evita chamada sem token)
  if (patched && saveAfter) saveModulesData();
}

/* Persiste MODULES no localStorage + PostgreSQL */
function saveModulesData() {
  try { localStorage.setItem('ped_modules', JSON.stringify(MODULES)); } catch(_) {}
  apiRequest('PUT', '/api/settings/modules', MODULES).catch(err => {
    console.warn('[Settings API] Falha ao salvar modules:', err.message);
  });
}

/* Carrega MODULES do localStorage (síncrono) */
(function() {
  try {
    const saved = localStorage.getItem('ped_modules');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        MODULES = parsed;
      }
    }
  } catch(_) {}
  // Garante que módulos built-in não foram perdidos no override do localStorage
  patchBuiltinModules(false); // false = não salva na API (sem token ainda)
})();

const SCHOOLS = {
  all:  { nome:'Todas as Escolas',  sigla:'ALL', cor:'#3B82F6' },
  ped1: { nome:'PED Pituba',        sigla:'PIT', cor:'#8B5CF6' },
  ped2: { nome:'PED Barra',         sigla:'BAR', cor:'#10B981' },
  ped3: { nome:'PED Paralela',      sigla:'PAR', cor:'#F59E0B' },
  ped4: { nome:'PED Imbuí',         sigla:'IMB', cor:'#EF4444' },
};

const PRIORITIES = {
  baixa:   { label:'Baixa',   icon:'●', cls:'badge--prio-baixa'   },
  media:   { label:'Média',   icon:'●', cls:'badge--prio-media'   },
  alta:    { label:'Alta',    icon:'▲', cls:'badge--prio-alta'    },
  urgente: { label:'Urgente', icon:'⚡', cls:'badge--prio-urgente' },
};

/* ══════════════════════════════════════════════════════════
   SETTINGS DATA — Editável via interface
══════════════════════════════════════════════════════════ */
const settingsData = {
  escolas: [
    { id:'ped1', nome:'PED Pituba',    sigla:'PIT', cor:'#8B5CF6', ativa:true  },
    { id:'ped2', nome:'PED Barra',     sigla:'BAR', cor:'#10B981', ativa:true  },
    { id:'ped3', nome:'PED Paralela',  sigla:'PAR', cor:'#F59E0B', ativa:true  },
    { id:'ped4', nome:'PED Imbuí',     sigla:'IMB', cor:'#EF4444', ativa:true  },
  ],
  etiquetas: [
    { id:'et1', nome:'Urgente',     cor:'#EF4444' },
    { id:'et2', nome:'Pendente',    cor:'#F59E0B' },
    { id:'et3', nome:'Revisão',     cor:'#8B5CF6' },
    { id:'et4', nome:'Aprovado',    cor:'#10B981' },
    { id:'et5', nome:'Bloqueado',   cor:'#64748B' },
  ],
  aparencia: {
    corPrimaria: '#3B82F6',
    nomeExibicao: 'Central Ops',
    logo: null,
  },
  permissoes: {}, /* Custom permission overrides per profile — populated by settings UI */
  usuarios: [
    { id:'usr1', nome:'Emerson Santos',  email:'emerson.santos@grupoped.com.br', perfil:'admin',        escolas:['ped1','ped2','ped3','ped4'], ativo:true,  criadoEm:'2026-01-10' },
    { id:'usr2', nome:'Maria Silva',     email:'maria.silva@grupoped.com.br',    perfil:'gestor',       escolas:['ped1','ped2'],              ativo:true,  criadoEm:'2026-01-15' },
    { id:'usr3', nome:'João Oliveira',   email:'joao.oliveira@grupoped.com.br',  perfil:'financeiro',   escolas:['ped3'],                     ativo:true,  criadoEm:'2026-02-01' },
    { id:'usr4', nome:'Ana Costa',       email:'ana.costa@grupoped.com.br',      perfil:'pedagogico',   escolas:['ped1','ped4'],              ativo:true,  criadoEm:'2026-02-10' },
    { id:'usr5', nome:'Carlos Mendes',   email:'carlos.mendes@grupoped.com.br',  perfil:'ti',           escolas:['ped2'],                     ativo:false, criadoEm:'2026-03-05' },
  ],
};

/* ── Persistência completa do settingsData ────────────────────
   Cada seção salva em chave separada para evitar conflitos.
   Carrega do localStorage ao iniciar; sobrescreve os defaults. */
const SETTINGS_KEYS = {
  escolas:    'ped_escolas',
  etiquetas:  'ped_etiquetas',
  aparencia:  'ped_aparencia',
  permissoes: 'ped_permissoes',
  usuarios:   'ped_usuarios',
};

function saveSettingsData(section) {
  // 1. Salva backup local (sempre)
  if (section) {
    try { localStorage.setItem(SETTINGS_KEYS[section], JSON.stringify(settingsData[section])); } catch(_) {}
  } else {
    Object.keys(SETTINGS_KEYS).forEach(k => {
      try { localStorage.setItem(SETTINGS_KEYS[k], JSON.stringify(settingsData[k])); } catch(_) {}
    });
  }
  // 2. Persiste no PostgreSQL via API (fire-and-forget)
  if (section) {
    apiRequest('PUT', `/api/settings/${section}`, settingsData[section]).catch(err => {
      console.warn('[Settings API] Falha ao salvar', section, ':', err.message);
    });
  } else {
    const payload = {};
    Object.keys(SETTINGS_KEYS).forEach(k => { payload[k] = settingsData[k]; });
    apiRequest('PUT', '/api/settings', payload).catch(err => {
      console.warn('[Settings API] Falha ao salvar settings:', err.message);
    });
  }
  // Atualiza selects de escola se a seção mudou
  if (!section || section === 'escolas') {
    try { refreshEscolasSelects(); } catch(_) {}
  }
}

/* ── Atualiza todos os selects de escola no sistema ── */
function refreshEscolasSelects() {
  const escolas = (settingsData.escolas || []).filter(e => e.ativa !== false);

  // 1. Filtro do topbar
  const filterSel = document.getElementById('schoolFilterSelect');
  if (filterSel) {
    const curVal = filterSel.value;
    filterSel.innerHTML = '<option value="all">Todas as escolas</option>';
    escolas.forEach(e => {
      filterSel.innerHTML += `<option value="${escHtml(e.id)}">${escHtml(e.nome)}</option>`;
    });
    filterSel.value = curVal; // restaura seleção
  }

  // 2. Select do modal de card
  const formSel = document.getElementById('formEscola');
  if (formSel) {
    const curVal = formSel.value;
    formSel.innerHTML = '<option value="">Selecionar escola</option>';
    escolas.forEach(e => {
      formSel.innerHTML += `<option value="${escHtml(e.id)}">${escHtml(e.nome)}</option>`;
    });
    formSel.innerHTML += '<option value="all">Todas as unidades</option>';
    formSel.value = curVal;
  }
}

/* Carrega settings do localStorage (síncrono, para não bloquear render) */
(function() {
  Object.entries(SETTINGS_KEYS).forEach(([section, key]) => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') settingsData[section] = parsed;
      }
    } catch(_) {}
  });
})();

/* Carrega settings do PostgreSQL (async, sobrescreve localStorage se encontrar) */
async function loadSettingsFromAPI() {
  try {
    const data = await apiRequest('GET', '/api/settings');
    if (data && typeof data === 'object') {
      let changed = false;
      Object.keys(SETTINGS_KEYS).forEach(section => {
        if (data[section] && typeof data[section] === 'object') {
          settingsData[section] = data[section];
          try { localStorage.setItem(SETTINGS_KEYS[section], JSON.stringify(data[section])); } catch(_) {}
          changed = true;
        }
      });
      // Carrega automações do settings (AUTOMACOES array)
      if (data.automacoes_settings && Array.isArray(data.automacoes_settings)) {
        AUTOMACOES.length = 0;
        data.automacoes_settings.forEach(a => AUTOMACOES.push(a));
        try { localStorage.setItem('ped_automacoes_settings', JSON.stringify(AUTOMACOES)); } catch(_) {}
      }
      // Carrega automações do topbar (state.automations)
      if (data.automations && Array.isArray(data.automations)) {
        state.automations = data.automations;
        try { localStorage.setItem('ped_automations', JSON.stringify(state.automations)); } catch(_) {}
      }
      // Carrega MODULES (fluxos customizados)
      if (data.modules && typeof data.modules === 'object' && Object.keys(data.modules).length > 0) {
        MODULES = data.modules;
        // Garante que módulos built-in não foram apagados pelo banco de dados
        patchBuiltinModules(true); // true = salva no banco se restaurou algo
        try { localStorage.setItem('ped_modules', JSON.stringify(MODULES)); } catch(_) {}
        changed = true;
      }
      // (USERS agora está no backend — autenticação via JWT)
      // Carrega tema (dark/light)
      if (data.theme && typeof data.theme === 'string') {
        document.documentElement.dataset.theme = data.theme;
        try { localStorage.setItem('ped_theme', data.theme); } catch(_) {}
      }
      if (changed) {
        // Re-aplica cor principal se mudou
        const { corPrimaria } = settingsData.aparencia;
        if (corPrimaria && corPrimaria !== '#3B82F6') {
          document.documentElement.style.setProperty('--accent',       corPrimaria);
          document.documentElement.style.setProperty('--accent-hover', shadeColor(corPrimaria, -15));
          document.documentElement.style.setProperty('--accent-light', shadeColor(corPrimaria, 85));
        }
        console.log('[Settings] Carregado do PostgreSQL.');
      }
    }
  } catch (err) {
    console.warn('[Settings API] Falha ao carregar — usando backup local:', err.message);
  }
}

/* Restaura cor principal e nome salvo ao carregar a página */
(function() {
  const { corPrimaria } = settingsData.aparencia;
  if (corPrimaria && corPrimaria !== '#3B82F6') {
    document.documentElement.style.setProperty('--accent',       corPrimaria);
    document.documentElement.style.setProperty('--accent-hover', shadeColorEarly(corPrimaria, -15));
    document.documentElement.style.setProperty('--accent-light', shadeColorEarly(corPrimaria, 85));
  }
  function shadeColorEarly(hex, pct) {
    const n = parseInt(hex.replace('#',''),16);
    const r = Math.min(255, Math.max(0, (n >> 16) + Math.round(pct * 2.55)));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + Math.round(pct * 2.55)));
    const b = Math.min(255, Math.max(0, (n & 0xff) + Math.round(pct * 2.55)));
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
  }
})();

const CORES_PALETTE = [
  '#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444',
  '#EC4899','#06B6D4','#F97316','#84CC16','#6366F1',
];

/* ══════════════════════════════════════════════════════════
   CARDS — persistidos via API PostgreSQL (Railway)
   Fallback: localStorage para modo offline
══════════════════════════════════════════════════════════ */
const CARDS_KEY = 'ped_cards_v1';           // fallback local
const API_URL   = PAYMENT_BACKEND_URL;       // mesmo backend e-Rede

// ── Helper de fetch para a API ────────────────────────────
async function apiRequest(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  // Adiciona token JWT se disponível
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_URL}${path}`, opts);

  // Se token expirou, força logout
  if (res.status === 401) {
    clearSession();
    showLoginScreen();
    throw new Error('Sessao expirada. Faca login novamente.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Erro ${res.status}`);
  }
  return res.json();
}

// ── Carrega cards da API (chamado no init) ────────────────
async function loadCardsFromAPI() {
  try {
    const data = await apiRequest('GET', '/api/cards');
    if (Array.isArray(data)) {
      allCards = data;
      // Atualiza backup local
      try { localStorage.setItem(CARDS_KEY, JSON.stringify(allCards)); } catch(_) {}
      return;
    }
  } catch (err) {
    console.warn('[API] Falha ao carregar cards — usando backup local:', err.message);
  }
  // Fallback: localStorage
  try {
    const raw = localStorage.getItem(CARDS_KEY);
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) { allCards = p; return; } }
  } catch(_) {}
  allCards = [];
}

// ── persistCards: salva backup local (não é a fonte principal) ────────────
function persistCards() {
  try { localStorage.setItem(CARDS_KEY, JSON.stringify(allCards)); } catch(_) {}
}

// ── API: criar card ───────────────────────────────────────
function apiCreateCard(card) {
  apiRequest('POST', '/api/cards', card).catch(err => {
    console.error('[API] Erro ao criar card:', err.message);
    showToast('Aviso: card salvo localmente — verifique conexão.', 'warn');
  });
}

// ── API: atualizar card ───────────────────────────────────
function apiUpdateCard(card) {
  apiRequest('PUT', `/api/cards/${card.id}`, card).catch(err => {
    console.error('[API] Erro ao atualizar card:', err.message);
  });
}

// ── API: excluir card ─────────────────────────────────────
function apiDeleteCard(cardId) {
  apiRequest('DELETE', `/api/cards/${cardId}`).catch(err => {
    console.error('[API] Erro ao excluir card:', err.message);
  });
}

// ── API: mover card (drag & drop) ────────────────────────
function apiMoveCard(cardId, newFase, newPosition) {
  apiRequest('PATCH', '/api/cards/move', { cardId, newFase, newPosition }).catch(err => {
    console.error('[API] Erro ao mover card:', err.message);
  });
}

let allCards = [];  // preenchido em init() via loadCardsFromAPI()

/* ══════════════════════════════════════════════════════════
   FILE STORE — armazena objetos File em memória (por sessão)
══════════════════════════════════════════════════════════ */
const fileStore = new Map(); // cardId → [{ id, file, nome, tamanho, tipo }]

function getCardFiles(cardId) {
  return fileStore.get(cardId) || [];
}

function addCardFile(cardId, file) {
  if (!fileStore.has(cardId)) fileStore.set(cardId, []);
  const entry = { id: uid(), file, nome: file.name, tamanho: file.size, tipo: file.type };
  fileStore.get(cardId).push(entry);
  // Sync to card.anexos
  const card = allCards.find(c => c.id === cardId);
  if (card) {
    card.anexos = fileStore.get(cardId).map(f => ({ id:f.id, nome:f.nome, tamanho:f.tamanho, tipo:f.tipo }));
  }
  return entry;
}

function removeCardFile(cardId, fileId) {
  const files = fileStore.get(cardId);
  if (!files) return;
  const idx = files.findIndex(f => f.id === fileId);
  if (idx >= 0) files.splice(idx, 1);
  const card = allCards.find(c => c.id === cardId);
  if (card) {
    card.anexos = files.map(f => ({ id:f.id, nome:f.nome, tamanho:f.tamanho, tipo:f.tipo }));
  }
}

/* ══════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════ */
let state = {
  currentModule: 'solicitacoes',
  filterSchool:  'all',
  filterSearch:  '',
  viewMode:      'kanban',
  sidebarCollapsed: false,
  editingCardId: null,
  draggingCardId: null,
  settingsTab:   'escolas',
  smartSort:     false,
  filterMyTasks: false,
};

/* ══════════════════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════════════════ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function formatDate(d) { if (!d) return ''; return new Date(d+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}); }
function formatCurrency(v) { if (!v) return ''; const n = parseFloat(v); if (isNaN(n)) return ''; return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function formatBytes(b) { if (b < 1024) return b+'B'; if (b < 1048576) return (b/1024).toFixed(1)+'KB'; return (b/1048576).toFixed(1)+'MB'; }
function isOverdue(p) { if (!p) return false; return new Date(p+'T23:59:59') < new Date(); }
function daysUntil(p) { if (!p) return null; return Math.ceil((new Date(p+'T23:59:59') - new Date()) / 86400000); }
function initials(n) { if (!n) return '?'; return n.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function getFileIconClass(tipo, nome) {
  const ext = (nome.split('.').pop() || '').toLowerCase();
  if (tipo.includes('pdf') || ext === 'pdf') return 'attach-file-icon--pdf';
  if (tipo.includes('word') || ['doc','docx'].includes(ext)) return 'attach-file-icon--doc';
  if (tipo.includes('sheet') || tipo.includes('excel') || ['xls','xlsx','csv'].includes(ext)) return 'attach-file-icon--xls';
  if (tipo.includes('image') || ['jpg','jpeg','png','gif','svg','webp'].includes(ext)) return 'attach-file-icon--img';
  return 'attach-file-icon--other';
}

function getFileIconLabel(tipo, nome) {
  const ext = (nome.split('.').pop() || '').toLowerCase().slice(0,3).toUpperCase();
  if (tipo.includes('pdf') || ext === 'PDF') return 'PDF';
  if (tipo.includes('word') || ['DOC','DOC'].includes(ext)) return 'DOC';
  if (tipo.includes('sheet') || ['XLS','CSV'].includes(ext)) return 'XLS';
  if (tipo.includes('image')) return 'IMG';
  return ext || 'ARQ';
}

function getPhaseStyle(modulo, faseKey) {
  return MODULES[modulo]?.fases[faseKey] || { label:faseKey, color:'#64748B', bg:'#F1F5F9' };
}

/* ══════════════════════════════════════════════════════════
   DATA GETTERS
══════════════════════════════════════════════════════════ */
function getCurrentModuleCards() {
  return allCards.filter(c => c.modulo === state.currentModule);
}

function getFilteredCards() {
  const term = state.filterSearch.toLowerCase();
  let filtered = getCurrentModuleCards().filter(c => {
    const schoolOk = state.filterSchool === 'all' || c.escola === state.filterSchool || c.escola === 'all';
    const searchOk = !term ||
      c.titulo.toLowerCase().includes(term) ||
      c.categoria.toLowerCase().includes(term) ||
      (c.responsavel||'').toLowerCase().includes(term) ||
      (c.fornecedor||'').toLowerCase().includes(term) ||
      (c.telefone||'').toLowerCase().includes(term) ||
      (c.emailLead||'').toLowerCase().includes(term) ||
      (c.origem||'').toLowerCase().includes(term) ||
      (c.interesse||'').toLowerCase().includes(term);
    return schoolOk && searchOk;
  });

  // Filtro "Minhas Tarefas"
  if (state.filterMyTasks && currentUser) {
    const myName = currentUser.nome || currentUser.name || '';
    filtered = filtered.filter(c => c.responsavel && c.responsavel.toLowerCase().includes(myName.split(' ')[0].toLowerCase()));
  }

  // Aplicar smart sort se ativo
  const sorted = state.smartSort ? sortCardsBySmart(filtered) : filtered;
  return sorted;
}

function getCurrentModule() { return MODULES[state.currentModule]; }
function getCurrentPhases() { return getCurrentModule().fases; }
function getPhaseKeys()     { return Object.keys(getCurrentPhases()); }

/* ══════════════════════════════════════════════════════════
   MODULE SWITCH
══════════════════════════════════════════════════════════ */
function switchModule(modulo) {
  if (!MODULES[modulo]) return;
  state.currentModule = modulo;
  state.filterSearch  = '';
  document.getElementById('searchInput').value = '';

  // Sai do modo configurações, dashboard, agenda ou chat se estava ativo
  exitSettings();
  closeDashboard();
  closeAgenda();
  closeChatFinanceiro();
  closeEstruturaEscolar();

  // Update URL hash without creating a browser history entry
  if (location.hash.slice(1) !== modulo) {
    history.replaceState(null, '', '#' + modulo);
  }

  // Update nav active state
  document.querySelectorAll('.nav-item[data-module]').forEach(el => {
    el.classList.toggle('active', el.dataset.module === modulo);
  });

  // Update page title + topbar
  const mod = MODULES[modulo];
  document.getElementById('pageTitle').textContent        = mod.label;
  document.getElementById('breadcrumbActive').textContent = mod.shortLabel;
  document.getElementById('newCardBtnLabel').textContent  = mod.btnLabel;

  renderAll();
  if (currentUser) applyNavPermissions();
}

/* ══════════════════════════════════════════════════════════
   SMART PRIORITY — Semáforo automático de status
══════════════════════════════════════════════════════════ */
function getCardSmartStatus(card) {
  const mod = MODULES[card.modulo] || getCurrentModule();
  if (card.fase === mod.lastPhase) return null; // Concluído — sem alerta

  const days = daysUntil(card.prazo);
  const overdue = isOverdue(card.prazo);

  if (card.prioridade === 'urgente') return { icon: '🔴', label: 'Urgente', cls: 'smart-red' };
  if (overdue) return { icon: '🔴', label: 'Precisa de ação hoje', cls: 'smart-red' };
  if (card.prioridade === 'alta') return { icon: '🔴', label: 'Alta prioridade', cls: 'smart-red' };
  if (days !== null && days <= 2) return { icon: '🟡', label: 'Atrasando', cls: 'smart-yellow' };
  if (days !== null && days <= 5) return { icon: '🟡', label: 'Atenção', cls: 'smart-yellow' };
  return { icon: '🟢', label: 'Ok', cls: 'smart-green' };
}

function sortCardsBySmart(cards) {
  const priority = { 'smart-red': 0, 'smart-yellow': 1, 'smart-green': 2, null: 3 };
  return [...cards].sort((a, b) => {
    const sa = getCardSmartStatus(a);
    const sb = getCardSmartStatus(b);
    const pa = priority[sa?.cls ?? null] ?? 3;
    const pb = priority[sb?.cls ?? null] ?? 3;
    if (pa !== pb) return pa - pb;
    // Dentro da mesma prioridade, mais antigo primeiro
    const da = daysUntil(a.prazo) ?? 999;
    const db = daysUntil(b.prazo) ?? 999;
    return da - db;
  });
}

/* ══════════════════════════════════════════════════════════
   RENDER: ALL
══════════════════════════════════════════════════════════ */
function renderAll() {
  renderStats();
  renderNavBadges();
  if (state.viewMode === 'kanban') renderKanban();
  else renderList();
}

function renderNavBadges() {
  Object.keys(MODULES).forEach(mod => {
    const open = allCards.filter(c => c.modulo === mod && c.fase !== MODULES[mod].lastPhase).length;
    const el = document.getElementById('badge-' + mod);
    if (el) { el.textContent = open; el.style.display = open > 0 ? '' : 'none'; }
  });
  renderNavGroupBadges();
}

function renderStats() {
  const filtered = getFilteredCards();
  const mod = getCurrentModule();
  const lastPhase = mod.lastPhase;

  document.getElementById('statTotal').textContent    = filtered.length;
  document.getElementById('statAbertas').textContent  = filtered.filter(c => c.fase !== lastPhase).length;
  document.getElementById('statUrgente').textContent  = filtered.filter(c => c.prioridade === 'urgente').length;
  document.getElementById('statConcluidos').textContent = filtered.filter(c => c.fase === lastPhase).length;
  document.getElementById('statSLA').textContent      = filtered.filter(c => isOverdue(c.prazo) && c.fase !== lastPhase).length;
}

/* ══════════════════════════════════════════════════════════
   RENDER: KANBAN (dinâmico por módulo)
══════════════════════════════════════════════════════════ */
function renderKanban() {
  const board = document.getElementById('kanbanBoard');
  const phases = getCurrentPhases();
  const keys   = getPhaseKeys();
  const filtered = getFilteredCards();

  // Adjust grid columns class
  board.className = 'kanban-board'
    + (keys.length === 6 ? ' cols-6'
    : keys.length === 5 ? ' cols-5'
    : keys.length === 3 ? ' cols-3' : '');

  board.innerHTML = keys.map(phaseKey => {
    const phase = phases[phaseKey];
    const phaseCards = filtered.filter(c => c.fase === phaseKey);
    return buildColumnHTML(phaseKey, phase, phaseCards);
  }).join('');

  // Attach card click events
  board.querySelectorAll('.kanban-card').forEach(el => {
    el.addEventListener('click', () => openModal(el.dataset.id));
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('dragend',   onDragEnd);
  });

  // Attach payment link quick-action buttons
  board.querySelectorAll('.btn-card-gen-link').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openModal(btn.dataset.id);
    });
  });
  board.querySelectorAll('.btn-card-confirm-pay').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Confirmar o recebimento do pagamento?')) confirmPayment(btn.dataset.id);
    });
  });

  // Attach add-card button events
  board.querySelectorAll('.column-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openModal(null);
      setTimeout(() => { document.getElementById('formFase').value = btn.dataset.phase; }, 50);
    });
  });

  // Attach phase config (gear) button events
  board.querySelectorAll('.column-cfg-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openPhaseEditor(btn.dataset.phase);
    });
  });

  setupDropZones();
}

function buildColumnHTML(phaseKey, phase, phaseCards) {
  const cardsHTML = phaseCards.length === 0
    ? `<div class="empty-column">
        <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
          <rect x="5" y="3" width="20" height="24" rx="3" stroke="currentColor" stroke-width="1.5"/>
          <path d="M9 10h12M9 15h8M9 20h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span class="empty-column-text">Nenhum item</span>
      </div>`
    : phaseCards.map(card => buildCardHTML(card)).join('');

  const isLast = MODULES[state.currentModule]?.lastPhase === phaseKey;

  return `
    <div class="kanban-column" data-phase="${phaseKey}">
      <div class="column-header" style="border-top-color:${phase.color}">
        <div class="column-header-left">
          <span class="phase-dot" style="background:${phase.color}"></span>
          <h3 class="column-title">${escHtml(phase.label)}</h3>
          <span class="column-count">${phaseCards.length}</span>
          ${isLast ? '<span class="phase-final-badge">Fase Final</span>' : ''}
        </div>
        <div class="column-header-actions">
          <button class="column-cfg-btn" data-phase="${phaseKey}" title="Editar fase">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="2" stroke="currentColor" stroke-width="1.4"/>
              <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="column-add-btn" data-phase="${phaseKey}" title="Adicionar card">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="column-body" id="col-${phaseKey}" data-phase="${phaseKey}">
        ${cardsHTML}
      </div>
    </div>`;
}

function buildCardHTML(card) {
  const prio    = PRIORITIES[card.prioridade] || PRIORITIES.media;
  const school  = SCHOOLS[card.escola] || SCHOOLS.all;
  const mod     = MODULES[card.modulo] || getCurrentModule();
  const overdue = isOverdue(card.prazo) && card.fase !== mod.lastPhase;
  const anexos  = (card.anexos  || []).length;
  const comments = (card.comentarios || []).length;
  const days    = daysUntil(card.prazo);
  const smartStatus = getCardSmartStatus(card);

  // Badge de categoria (pill colorida como Pipefy)
  const catBadge = card.categoria
    ? `<span class="pf-card-badge pf-card-badge--cat">${escHtml(card.categoria)}</span>` : '';

  // Badge de prioridade (só mostra alta/urgente no card)
  const prioBadge = (card.prioridade === 'alta' || card.prioridade === 'urgente')
    ? `<span class="pf-card-badge pf-card-badge--prio-${card.prioridade}">${prio.label}</span>` : '';

  // Escola
  const schoolBadge = `<span class="pf-card-school" style="color:${school.cor || '#64748B'}">${school.sigla || school.nome}</span>`;

  // Título (negrito, destaque)
  const titulo = `<div class="pf-card-title">${escHtml(card.titulo)}</div>`;

  // Campos visíveis no card (estilo Pipefy: ícone + label + valor)
  let fields = '';

  if (mod.hasFinancial && card.fornecedor) {
    fields += `<div class="pf-card-field">
      <svg class="pf-card-field-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <span class="pf-card-field-val">${escHtml(card.fornecedor)}</span>
    </div>`;
  }

  if (card.responsavel) {
    fields += `<div class="pf-card-field">
      <svg class="pf-card-field-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      <span class="pf-card-field-val">${escHtml(card.responsavel)}</span>
    </div>`;
  }

  if (mod.hasFinancial && card.valor && card.valor !== '0') {
    fields += `<div class="pf-card-field">
      <svg class="pf-card-field-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      <span class="pf-card-field-val" style="font-weight:600;color:#10B981">${formatCurrency(card.valor)}</span>
    </div>`;
  }

  // Lead: telefone
  if (mod.hasLead && card.telefone) {
    fields += `<div class="pf-card-field">
      <svg class="pf-card-field-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 012.05 5.18 2 2 0 014.11 3h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 10.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
      <span class="pf-card-field-val">${escHtml(card.telefone)}</span>
    </div>`;
  }

  // Footer: meta info
  let metaItems = '';

  if (card.prazo) {
    const cls = overdue ? 'pf-meta-item pf-meta-item--overdue' : 'pf-meta-item';
    const txt  = overdue
      ? 'Atrasado'
      : (days === 0 ? 'Hoje' : days === 1 ? 'Amanhã' : `${days}d`);
    metaItems += `<span class="${cls}">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      ${txt}
    </span>`;
  }

  if (comments > 0) {
    metaItems += `<span class="pf-meta-item">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      ${comments}
    </span>`;
  }

  if (anexos > 0) {
    metaItems += `<span class="pf-meta-item">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      ${anexos}
    </span>`;
  }

  const assigneeHtml = card.responsavel
    ? `<div class="pf-assignee" title="${escHtml(card.responsavel)}">${initials(card.responsavel)}</div>` : '';

  // Link de pagamento inline
  let paymentBlockHtml = '';
  if (mod.hasPaymentLink) {
    if (!card.linkPagamento && card.fase === mod.paymentGenPhase) {
      paymentBlockHtml = `<button class="btn-card-gen-link pf-action-btn" data-id="${card.id}">
        <svg width="10" height="10" viewBox="0 0 13 13" fill="none"><path d="M7 1h4a1 1 0 011 1v4M6 12H2a1 1 0 01-1-1V7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M11.5 1.5L5.5 7.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        Gerar Link
      </button>`;
    } else if (card.linkPagamento && card.linkStatus !== 'pago') {
      paymentBlockHtml = `<button class="btn-card-confirm-pay pf-action-btn pf-action-btn--success" data-id="${card.id}">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        Confirmar Pago
      </button>`;
    } else if (card.linkStatus === 'pago') {
      paymentBlockHtml = `<span class="pf-paid-badge">✓ Pago — ${escHtml(card.codigoTransacao || '')}</span>`;
    }
  }

  return `
    <div class="kanban-card pf-card" draggable="true" data-id="${card.id}" data-prio="${card.prioridade}">
      <div class="pf-card-head">
        ${schoolBadge}
        <div class="pf-card-badges">${catBadge}${prioBadge}${smartStatus ? `<span class="pf-smart-badge pf-smart-badge--${smartStatus.cls}" title="${smartStatus.label}">${smartStatus.icon}</span>` : ''}</div>
      </div>
      ${titulo}
      ${fields ? `<div class="pf-card-fields">${fields}</div>` : ''}
      ${paymentBlockHtml}
      <div class="pf-card-footer">
        <div class="pf-card-meta">${metaItems}</div>
        ${assigneeHtml}
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   RENDER: LIST VIEW
══════════════════════════════════════════════════════════ */
function renderList() {
  const filtered = getFilteredCards();
  const tbody = document.getElementById('listTableBody');
  tbody.innerHTML = '';

  filtered.forEach(card => {
    const school = SCHOOLS[card.escola] || SCHOOLS.all;
    const prio   = PRIORITIES[card.prioridade] || PRIORITIES.media;
    const phase  = getPhaseStyle(state.currentModule, card.fase);
    const overdue = isOverdue(card.prazo) && card.fase !== getCurrentModule().lastPhase;
    const anexos  = (card.anexos || []).length;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600">${escHtml(card.titulo)}</td>
      <td><span class="badge badge--escola">${escHtml(school.nome)}</span></td>
      <td><span class="badge badge--cat">${escHtml(card.categoria)}</span></td>
      <td><span class="badge ${prio.cls}">${prio.icon} ${prio.label}</span></td>
      <td>
        <span class="phase-pill" style="background:${phase.bg};color:${phase.color}">
          <span style="width:6px;height:6px;border-radius:50%;background:${phase.color};display:inline-block"></span>
          ${escHtml(phase.label)}
        </span>
      </td>
      <td>${escHtml(card.responsavel || '—')}</td>
      <td ${overdue ? 'style="color:var(--prio-alta);font-weight:600"' : ''}>${card.prazo ? formatDate(card.prazo) : '—'}${overdue ? ' ⚠' : ''}</td>
      <td>${anexos > 0 ? `<span style="font-size:11px;color:var(--accent)">📎 ${anexos}</span>` : '—'}</td>
      <td><button class="list-action-btn" data-id="${card.id}">Editar</button></td>`;
    tr.querySelector('.list-action-btn').addEventListener('click', () => openModal(card.id));
    tbody.appendChild(tr);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--quadro-faint)">Nenhum item encontrado</td></tr>`;
  }
}

/* ══════════════════════════════════════════════════════════
   DRAG & DROP
══════════════════════════════════════════════════════════ */
let dragSrcId  = null;
let dragSrcPhase = null;
let placeholder = null;

function onDragStart(e) {
  dragSrcId    = this.dataset.id;
  dragSrcPhase = this.closest('[data-phase]').dataset.phase;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcId);
  placeholder = document.createElement('div');
  placeholder.className = 'drop-placeholder';
  setTimeout(() => this.style.opacity = '0.4', 0);
}

function onDragEnd() {
  this.classList.remove('dragging');
  this.style.opacity = '';
  if (placeholder?.parentNode) placeholder.parentNode.removeChild(placeholder);
  placeholder = null;
  document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
}

function setupDropZones() {
  document.querySelectorAll('.column-body').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.closest('.kanban-column').classList.add('drag-over');
      document.querySelectorAll('.kanban-column').forEach(c => {
        if (c !== col.closest('.kanban-column')) c.classList.remove('drag-over');
      });
      if (placeholder) {
        const after = getDragAfter(col, e.clientY);
        after ? col.insertBefore(placeholder, after) : col.appendChild(placeholder);
      }
    });
    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) col.closest('.kanban-column')?.classList.remove('drag-over');
    });
    col.addEventListener('drop', e => {
      e.preventDefault();
      const targetPhase = col.dataset.phase;
      const cardId = e.dataTransfer.getData('text/plain');
      if (!cardId) return;

      const card = allCards.find(c => c.id === cardId);
      if (card && card.fase !== targetPhase) {
        const oldPhase = card.fase;
        const oldLabel = getPhaseStyle(state.currentModule, oldPhase).label;
        const newLabel = getPhaseStyle(state.currentModule, targetPhase).label;
        // Calcula posição dentro da nova fase
        const newPos = allCards.filter(c => c.modulo === state.currentModule && c.fase === targetPhase).length;
        card.fase = targetPhase;
        persistCards();
        apiMoveCard(card.id, targetPhase, newPos);
        card.historico.push({
          texto:`Movido de <strong>${oldLabel}</strong> para <strong>${newLabel}</strong>`,
          data: now(), usuario:'Emerson Santos',
        });
        AutomationEngine.execute('card_enter_phase', card, { fase: targetPhase });
        AutomationEngine.execute('card_moved',       card, {});
        showToast(`Card movido para "${newLabel}"`, 'success');
        renderAll();
      }
      document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
    });
  });
}

function getDragAfter(container, y) {
  const els = [...container.querySelectorAll('.kanban-card:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element || null;
}

function now() { return new Date().toLocaleString('pt-BR'); }

/* ══════════════════════════════════════════════════════════
   MODAL
══════════════════════════════════════════════════════════ */
function openModal(cardId) {
  const mod = getCurrentModule();
  state.editingCardId = cardId || null;

  // ── Tabs do drawer ──
  document.querySelectorAll('.pf-drawer-tab').forEach(tab => {
    tab.classList.remove('active');
    const contentId = 'pf-tab-' + tab.dataset.tab;
    const content = document.getElementById(contentId);
    if (content) content.classList.add('hidden');
  });
  const firstTab = document.querySelector('.pf-drawer-tab[data-tab="form"]');
  if (firstTab) {
    firstTab.classList.add('active');
    const formContent = document.getElementById('pf-tab-form');
    if (formContent) formContent.classList.remove('hidden');
  }

  // ── Painel de mover fase ──
  const phases = getCurrentPhases();
  const moveList = document.getElementById('pf-move-list');
  if (moveList) {
    moveList.innerHTML = Object.entries(phases).map(([key, phase]) => {
      const isActive = cardId ? (allCards.find(c => c.id === cardId)?.fase === key) : false;
      return `<button type="button" class="pf-move-btn ${isActive ? 'active-phase' : ''}" data-phase="${key}" style="${isActive ? `background:${phase.bg};border-color:${phase.color};color:${phase.color}` : ''}">
        <span style="${isActive ? `color:${phase.color}` : ''}">${escHtml(phase.label)}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>`;
    }).join('');

    moveList.querySelectorAll('.pf-move-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newPhase = btn.dataset.phase;
        const cardIdEdit = document.getElementById('formCardId').value;
        if (!cardIdEdit) return;
        const card = allCards.find(c => c.id === cardIdEdit);
        if (!card || card.fase === newPhase) return;
        const oldLabel = getPhaseStyle(state.currentModule, card.fase).label;
        const newLabel = getPhaseStyle(state.currentModule, newPhase).label;
        card.fase = newPhase;
        persistCards();
        apiMoveCard(card.id, newPhase, 0);
        card.historico.push({ texto:`Movido para <strong>${newLabel}</strong> (via painel de fases)`, data:now(), usuario: currentUser?.nome || 'Usuário' });
        AutomationEngine.execute('card_enter_phase', card, { fase: newPhase });
        showToast(`Card movido para "${newLabel}"`, 'success');
        closeModal();
        renderAll();
      });
    });

    // ── Configurar movimentações ──
    const configBtn = document.getElementById('pf-config-move-btn');
    const configPanel = document.getElementById('pf-move-config-panel');
    const configPhasesList = document.getElementById('pf-config-phases-list');

    if (configBtn && configPanel) {
      configBtn.onclick = () => {
        configPanel.classList.toggle('hidden');
        if (!configPanel.classList.contains('hidden') && configPhasesList) {
          // Renderiza checkboxes das fases
          const modKey = state.currentModule;
          const cardAllowedPhases = JSON.parse(localStorage.getItem('ped_allowed_phases_' + modKey) || 'null');
          configPhasesList.innerHTML = Object.entries(phases).map(([key, phase]) => {
            const checked = !cardAllowedPhases || cardAllowedPhases.includes(key) ? 'checked' : '';
            return `<label class="pf-config-phase-item">
              <input type="checkbox" value="${key}" ${checked}>
              <span style="width:8px;height:8px;border-radius:50%;background:${phase.color};flex-shrink:0;display:inline-block"></span>
              ${escHtml(phase.label)}
            </label>`;
          }).join('');
        }
      };

      document.getElementById('pf-config-save-btn').onclick = () => {
        const modKey = state.currentModule;
        const checked = [...configPhasesList.querySelectorAll('input:checked')].map(i => i.value);
        localStorage.setItem('ped_allowed_phases_' + modKey, JSON.stringify(checked));
        configPanel.classList.add('hidden');
        showToast('Configuração de movimentação salva!', 'success');
        // Refiltrar botões visíveis
        moveList.querySelectorAll('.pf-move-btn').forEach(btn => {
          btn.style.display = checked.includes(btn.dataset.phase) ? '' : 'none';
        });
      };

      // Aplica filtro de fases permitidas ao renderizar
      const modKey = state.currentModule;
      const allowedPhases = JSON.parse(localStorage.getItem('ped_allowed_phases_' + modKey) || 'null');
      if (allowedPhases) {
        moveList.querySelectorAll('.pf-move-btn').forEach(btn => {
          btn.style.display = allowedPhases.includes(btn.dataset.phase) ? '' : 'none';
        });
      }
    }
  }

  // ── Fase atual badge ──
  if (cardId) {
    const card = allCards.find(c => c.id === cardId);
    if (card) {
      const phaseStyle = getPhaseStyle(state.currentModule, card.fase);
      const badge = document.getElementById('pf-phase-badge');
      if (badge) {
        badge.textContent = phaseStyle.label;
        badge.style.background = phaseStyle.bg;
        badge.style.color = phaseStyle.color;
      }
    }
  }

  // Update module badge
  document.getElementById('modalModuleBadge').textContent = mod.shortLabel;

  // Populate fase select
  const faseSelect = document.getElementById('formFase');
  faseSelect.innerHTML = Object.entries(mod.fases)
    .map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('');

  // Populate categoria select
  const catSelect = document.getElementById('formCategoria');
  catSelect.innerHTML = '<option value="">Selecionar categoria</option>' +
    mod.categorias.map(c => `<option value="${c}">${c}</option>`).join('');

  // Show/hide financial fields
  const showFin = mod.hasFinancial;
  document.getElementById('financialFields').style.display = showFin ? '' : 'none';
  document.getElementById('documentFields').style.display  = showFin ? '' : 'none';
  if (showFin) {
    document.getElementById('fornecedorLabel').textContent = mod.fornecedorLabel || 'Fornecedor / Cliente';
    document.getElementById('numDocLabel').textContent     = mod.numDocLabel     || 'Nº Documento';
  }

  // Show/hide lead fields (módulo Comercial)
  const showLead = !!mod.hasLead;
  const leadContactEl = document.getElementById('leadContactFields');
  const leadOriginEl  = document.getElementById('leadOriginFields');
  if (leadContactEl) leadContactEl.style.display = showLead ? '' : 'none';
  if (leadOriginEl)  leadOriginEl.style.display  = showLead ? '' : 'none';
  // Adapta label do título para lead
  const labelTitulo = document.getElementById('label-titulo');
  if (labelTitulo) {
    labelTitulo.innerHTML = showLead
      ? 'Nome do Lead <span class="required">*</span>'
      : 'Título <span class="required">*</span>';
  }

  // Show/hide payment link section
  document.getElementById('paymentLinkSection').style.display = mod.hasPaymentLink ? '' : 'none';

  if (cardId) {
    const card = allCards.find(c => c.id === cardId);
    if (!card) return;

    document.getElementById('modalTitle').textContent    = 'Editar Card';
    document.getElementById('modalSubtitle').textContent = `ID: ${card.id} · Criado em ${formatDate(card.criadoEm)}`;

    document.getElementById('formCardId').value      = card.id;
    document.getElementById('formTitulo').value       = card.titulo;
    document.getElementById('formDescricao').value    = card.descricao || '';
    document.getElementById('formEscola').value       = card.escola;
    document.getElementById('formCategoria').value    = card.categoria;
    document.getElementById('formPrioridade').value   = card.prioridade;
    document.getElementById('formFase').value         = card.fase;
    document.getElementById('formResponsavel').value  = card.responsavel || '';
    document.getElementById('formPrazo').value        = card.prazo || '';
    if (showFin) {
      document.getElementById('formValor').value      = card.valor || '';
      document.getElementById('formFornecedor').value = card.fornecedor || '';
      document.getElementById('formNumeroDoc').value  = card.numDoc || '';
      document.getElementById('formVencimento').value = card.vencimento || '';
    }

    // Preenche campos de lead
    if (showLead) {
      const telEl  = document.getElementById('formTelefone');
      const emlEl  = document.getElementById('formEmailLead');
      const oriEl  = document.getElementById('formOrigem');
      const intEl  = document.getElementById('formInteresse');
      if (telEl) telEl.value  = card.telefone   || '';
      if (emlEl) emlEl.value  = card.emailLead  || '';
      if (oriEl) oriEl.value  = card.origem     || '';
      if (intEl) intEl.value  = card.interesse  || '';
    }

    document.getElementById('deleteCardArea').style.display = '';
    const legacyCommentSection = document.getElementById('commentSectionLegacy');
    if (legacyCommentSection) legacyCommentSection.style.display = '';

    // Populate payment link section
    if (mod.hasPaymentLink) {
      if (card.tipoPagamento) document.getElementById('formTipoPagamento').value = card.tipoPagamento;
      const hasLink = !!card.linkPagamento;
      document.getElementById('genLinkRow').style.display        = hasLink ? 'none' : '';
      document.getElementById('linkDisplayBox').style.display    = hasLink ? '' : 'none';
      if (hasLink) {
        document.getElementById('linkCode').textContent = card.codigoTransacao || '—';
        document.getElementById('linkUrl').textContent  = card.linkPagamento;
        // tipo badge
        const tipoLabels = { pix:'PIX', boleto:'BOLETO', credito:'CRÉDITO', debito:'DÉBITO' };
        document.getElementById('linkTipoBadge').textContent = tipoLabels[card.tipoPagamento] || (card.tipoPagamento||'').toUpperCase();
        // status badge
        const statusLabels = { pendente:'Pendente', ativo:'Ativo', pago:'Pago', expirado:'Expirado' };
        const statusEl = document.getElementById('linkStatusBadge');
        statusEl.textContent = statusLabels[card.linkStatus] || (card.linkStatus||'ativo');
        statusEl.className   = 'link-status-badge link-status-badge--' + (card.linkStatus || 'ativo');
        // confirm / paid rows
        const isPaid = card.linkStatus === 'pago';
        document.getElementById('confirmPaymentRow').style.display = (!isPaid && card.fase === 'aguardando_pagamento') ? '' : 'none';
        document.getElementById('paidBadgeRow').style.display      = isPaid ? '' : 'none';
      }
    }

    renderChat(card);
    renderAtividades(card);
    renderChecklists(card);
    renderAttachments(cardId);
  } else {
    document.getElementById('modalTitle').textContent    = mod.btnLabel;
    document.getElementById('modalSubtitle').textContent = 'Preencha os campos abaixo';
    document.getElementById('cardForm').reset();
    document.getElementById('formCardId').value   = '';
    document.getElementById('formPrioridade').value = 'media';
    document.getElementById('formFase').value = Object.keys(mod.fases)[0];
    if (state.filterSchool !== 'all') document.getElementById('formEscola').value = state.filterSchool;

    document.getElementById('deleteCardArea').style.display = 'none';
    const legacyCommentSectionNew = document.getElementById('commentSectionLegacy');
    if (legacyCommentSectionNew) legacyCommentSectionNew.style.display = 'none';

    // Reset payment link section for new card
    if (mod.hasPaymentLink) {
      document.getElementById('genLinkRow').style.display     = '';
      document.getElementById('linkDisplayBox').style.display = 'none';
    }

    // Clear attachment list for new card (temp id)
    document.getElementById('attachmentsList').innerHTML = '';

    // Clear chat and atividades for new card
    const chatFeed = document.getElementById('chatFeed');
    if (chatFeed) chatFeed.innerHTML = '<div class="chat-empty">Salve o card primeiro para adicionar comentários.</div>';
    const atividadeFeed = document.getElementById('atividadeFeed');
    if (atividadeFeed) atividadeFeed.innerHTML = '<div class="ativ-empty">Nenhuma atividade ainda. As movimentações aparecerão aqui.</div>';
    document.getElementById('attachCountBadge').style.display = 'none';
  }

  document.getElementById('modalOverlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('formTitulo').focus(), 50);
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  document.body.style.overflow = '';
  state.editingCardId = null;
}

function saveCard(e) {
  e.preventDefault();

  const titulo      = document.getElementById('formTitulo').value.trim();
  const escola      = document.getElementById('formEscola').value;
  const categoria   = document.getElementById('formCategoria').value;
  const prioridade  = document.getElementById('formPrioridade').value;
  const fase        = document.getElementById('formFase').value;
  const responsavel = document.getElementById('formResponsavel').value;
  const prazo       = document.getElementById('formPrazo').value;
  const descricao   = document.getElementById('formDescricao').value.trim();
  const mod         = getCurrentModule();
  const valor         = mod.hasFinancial ? document.getElementById('formValor').value : '';
  const fornecedor    = mod.hasFinancial ? document.getElementById('formFornecedor').value.trim() : '';
  const numDoc        = mod.hasFinancial ? document.getElementById('formNumeroDoc').value.trim() : '';
  const vencimento    = mod.hasFinancial ? document.getElementById('formVencimento').value : '';
  const tipoPagamento = mod.hasPaymentLink ? (document.getElementById('formTipoPagamento')?.value || 'pix') : '';
  // Campos específicos de lead (Comercial)
  const telefone  = mod.hasLead ? (document.getElementById('formTelefone')?.value.trim()  || '') : '';
  const emailLead = mod.hasLead ? (document.getElementById('formEmailLead')?.value.trim() || '') : '';
  const origem    = mod.hasLead ? (document.getElementById('formOrigem')?.value            || '') : '';
  const interesse = mod.hasLead ? (document.getElementById('formInteresse')?.value.trim() || '') : '';

  if (!titulo || !escola || !categoria) {
    showToast('Preencha os campos obrigatórios', 'error'); return;
  }

  const cardId = document.getElementById('formCardId').value;

  if (cardId) {
    const card = allCards.find(c => c.id === cardId);
    if (!card) return;
    const oldFase = card.fase;
    Object.assign(card, { titulo, descricao, escola, categoria, prioridade, responsavel, prazo, valor, fornecedor, numDoc, vencimento,
      ...(mod.hasPaymentLink ? { tipoPagamento } : {}),
      ...(mod.hasLead ? { telefone, emailLead, origem, interesse } : {}) });
    if (fase !== oldFase) {
      card.fase = fase;
      card.historico.push({ texto:`Movido de <strong>${getPhaseStyle(state.currentModule, oldFase).label}</strong> para <strong>${getPhaseStyle(state.currentModule, fase).label}</strong>`, data:now(), usuario:'Emerson Santos' });
      AutomationEngine.execute('card_enter_phase', card, { fase });
    }
    card.historico.push({ texto:'Card atualizado', data:now(), usuario:'Emerson Santos' });
    AutomationEngine.execute('field_updated', card, { campo: 'responsavel' });
    persistCards();
    apiUpdateCard(card);
    showToast('Card atualizado!', 'success');
  } else {
    const newCard = {
      id: uid(), modulo: state.currentModule,
      titulo, descricao, escola, categoria, prioridade, fase, responsavel, prazo,
      valor, fornecedor, numDoc, vencimento,
      ...(mod.hasPaymentLink ? { tipoPagamento, linkPagamento:'', codigoTransacao:'', linkStatus:'pendente' } : {}),
      ...(mod.hasLead ? { telefone, emailLead, origem, interesse } : {}),
      criadoEm: new Date().toISOString().split('T')[0],
      comentarios:[], historico:[{ texto:'Card criado', data:now(), usuario:'Emerson Santos', timestamp:Date.now() }],
      checklists:[], anexos:[],
    };
    allCards.unshift(newCard);
    persistCards();
    apiCreateCard(newCard);
    AutomationEngine.execute('card_created',     newCard, {});
    AutomationEngine.execute('card_enter_phase', newCard, { fase });

    if (mod.hasPaymentLink) {
      // Lê parcelas antes de fechar o modal
      const parcelasEl   = document.getElementById('formParcelas');
      const installments = (tipoPagamento === 'credito' && parcelasEl) ? parseInt(parcelasEl.value, 10) : 1;
      showToast('Card criado! Gerando link de pagamento...', 'success');
      autoGeneratePaymentLink(newCard, installments);
    } else {
      showToast('Card criado!', 'success');
    }
  }

  closeModal();
  renderAll();
}

function deleteCard() {
  if (!state.editingCardId) return;
  if (!confirm('Excluir este card? Esta ação não pode ser desfeita.')) return;
  const deletingId = state.editingCardId;
  allCards = allCards.filter(c => c.id !== deletingId);
  persistCards();
  apiDeleteCard(deletingId);
  fileStore.delete(deletingId);
  closeModal();
  renderAll();
  showToast('Card excluído', 'error');
}

/* ══════════════════════════════════════════════════════════
   ATTACHMENTS
══════════════════════════════════════════════════════════ */
function renderAttachments(cardId) {
  const files = getCardFiles(cardId);
  const list  = document.getElementById('attachmentsList');
  const badge = document.getElementById('attachCountBadge');

  list.innerHTML = '';
  badge.textContent = files.length;
  badge.style.display = files.length > 0 ? '' : 'none';

  files.forEach(f => {
    const iconCls   = getFileIconClass(f.tipo, f.nome);
    const iconLabel = getFileIconLabel(f.tipo, f.nome);
    const item = document.createElement('div');
    item.className = 'attachment-item';
    item.dataset.fileid = f.id;
    item.innerHTML = `
      <div class="attach-file-icon ${iconCls}">${iconLabel}</div>
      <div class="attach-file-info">
        <div class="attach-file-name" title="${escHtml(f.nome)}">${escHtml(f.nome)}</div>
        <div class="attach-file-meta">${formatBytes(f.tamanho)} · ${f.tipo || 'arquivo'}</div>
      </div>
      <button class="attach-action-btn" data-fid="${f.id}" data-cid="${cardId}" title="Baixar">↓ Baixar</button>
      <button class="attach-remove-btn" data-fid="${f.id}" data-cid="${cardId}" title="Remover">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>`;

    item.querySelector('.attach-action-btn').addEventListener('click', () => downloadFile(cardId, f.id));
    item.querySelector('.attach-remove-btn').addEventListener('click', () => {
      removeCardFile(cardId, f.id);
      renderAttachments(cardId);
      showToast('Anexo removido', 'warn');
    });
    list.appendChild(item);
  });
}

function downloadFile(cardId, fileId) {
  const fileEntry = (fileStore.get(cardId) || []).find(f => f.id === fileId);
  if (!fileEntry || !fileEntry.file) { showToast('Arquivo não disponível nesta sessão', 'warn'); return; }
  const url = URL.createObjectURL(fileEntry.file);
  const a = document.createElement('a');
  a.href = url; a.download = fileEntry.nome;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function handleFileSelection(files, cardId) {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  let added = 0;
  Array.from(files).forEach(file => {
    if (file.size > MAX_SIZE) {
      showToast(`"${file.name}" excede 10MB`, 'error'); return;
    }
    addCardFile(cardId, file);
    added++;
  });
  if (added > 0) {
    renderAttachments(cardId);
    showToast(`${added} arquivo(s) adicionado(s)`, 'success');
  }
}

function setupAttachmentZone() {
  const zone  = document.getElementById('attachDropZone');
  const input = document.getElementById('fileInput');

  // File input change
  input.addEventListener('change', () => {
    const cid = state.editingCardId || '__new__';
    handleFileSelection(input.files, cid);
    input.value = '';
  });

  // Drag over drop zone label
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-active'); });
  zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-active'); });
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-active');
    const cid = state.editingCardId || '__new__';
    handleFileSelection(e.dataTransfer.files, cid);
  });
}

/* ══════════════════════════════════════════════════════════
   CHAT / COMMENTS SYSTEM — Slack/Notion style
══════════════════════════════════════════════════════════ */

/* Render @mentions as highlighted spans (escHtml already applied to text) */
function renderMentions(safeText) {
  return safeText.replace(/@([\w][\w .]*)/g, '<span class="chat-mention">@$1</span>');
}

/* Extract user IDs from raw text where @Name matches a known user */
function extractMentions(rawText) {
  const matches = rawText.match(/@([\w][\w .]*)/g) || [];
  const ids = [];
  matches.forEach(m => {
    const name = m.slice(1).trim();
    const user = (settingsData.usuarios || []).find(u =>
      u.nome.toLowerCase() === name.toLowerCase()
    );
    if (user && !ids.includes(user.id)) ids.push(user.id);
  });
  return ids;
}

/* Add a system log entry to a card's comentarios array */
function addSystemLog(card, texto) {
  if (!card) return;
  card.comentarios = card.comentarios || [];
  card.comentarios.push({
    id        : uid(),
    tipo      : 'sistema',
    autor     : 'Sistema',
    autorId   : 'sistema',
    texto     : texto,
    mencoes   : [],
    editado   : false,
    excluido  : false,
    data      : now(),
    timestamp : Date.now(),
  });
}

/* Main render function — replaces renderComments() */
function renderChat(card) {
  const feed = document.getElementById('chatFeed');
  if (!feed) return;

  const entries = [...(card.comentarios || [])].sort((a, b) =>
    (a.timestamp || 0) - (b.timestamp || 0)
  );

  if (!entries.length) {
    feed.innerHTML = '<div class="chat-empty">Nenhuma mensagem ainda. Seja o primeiro a comentar.</div>';
    return;
  }

  const meId   = currentUser?.id   || 'usr1';
  const meName = currentUser?.nome || 'Emerson Santos';

  feed.innerHTML = entries.map(entry => {
    if (entry.tipo === 'sistema') {
      return `<div class="chat-system">
        <span>${escHtml(entry.texto)}</span>
        <time class="chat-system-time">${escHtml(entry.data || '')}</time>
      </div>`;
    }

    const isMe    = entry.autorId === meId;
    const avt     = initials(entry.autor || '');
    const txt     = entry.excluido
      ? '<em class="chat-deleted">Mensagem excluída</em>'
      : renderMentions(escHtml(entry.texto || ''));
    const editedMark = entry.editado && !entry.excluido
      ? '<span class="chat-edited">(editado)</span>'
      : '';
    const actions = isMe && !entry.excluido
      ? `<button class="chat-action-btn" onclick="editChatMsg('${entry.id}')">Editar</button>
         <button class="chat-action-btn chat-action-btn--del" onclick="deleteChatMsg('${entry.id}')">Excluir</button>`
      : '';

    return `<div class="chat-msg ${isMe ? 'chat-msg--mine' : ''}" data-msg-id="${entry.id}">
      ${!isMe ? `<div class="chat-avatar" title="${escHtml(entry.autor || '')}">${avt}</div>` : ''}
      <div class="chat-msg-body">
        ${!isMe ? `<div class="chat-msg-name">${escHtml(entry.autor || '')}</div>` : ''}
        <div class="chat-bubble" data-msg-id="${entry.id}">${txt}</div>
        <div class="chat-msg-meta">
          <time>${escHtml(entry.data || '')}</time>
          ${editedMark}
          ${actions}
        </div>
      </div>
      ${isMe ? `<div class="chat-avatar chat-avatar--me" title="${escHtml(meName)}">${avt}</div>` : ''}
    </div>`;
  }).join('');

  feed.scrollTop = feed.scrollHeight;
}

/* Also keep renderComments as alias for backward compat */
function renderComments(card) { renderChat(card); }

/* Send a new chat message */
function sendChatMessage() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const text = (input.innerText || '').trim();
  if (!text || !state.editingCardId) return;

  const card = allCards.find(c => c.id === state.editingCardId);
  if (!card) return;

  const meId   = currentUser?.id   || 'usr1';
  const meName = currentUser?.nome || 'Emerson Santos';
  const mentions = extractMentions(text);

  card.comentarios = card.comentarios || [];
  card.comentarios.push({
    id        : uid(),
    tipo      : 'comentario',
    autorId   : meId,
    autor     : meName,
    texto     : text,
    mencoes   : mentions,
    editado   : false,
    excluido  : false,
    data      : now(),
    timestamp : Date.now(),
  });

  input.innerText = '';
  closeMentionPicker();
  renderChat(card);

  /* Fire mention notifications */
  mentions.forEach(uid_ => {
    const u = (settingsData.usuarios || []).find(x => x.id === uid_);
    if (u) {
      addNotification(
        `${escHtml(meName)} mencionou você em "${escHtml(card.titulo)}"`,
        'mention', card.id, card.modulo
      );
    }
  });

  showToast('Comentário enviado', 'success');
}

/* Legacy addComment — now delegates to sendChatMessage */
function addComment() { sendChatMessage(); }

/* ── Inline edit ── */
function editChatMsg(msgId) {
  const card = allCards.find(c => c.id === state.editingCardId);
  if (!card) return;
  const msg = (card.comentarios || []).find(c => c.id === msgId);
  if (!msg || msg.excluido) return;

  const bubble = document.querySelector(`.chat-bubble[data-msg-id="${msgId}"]`);
  if (!bubble) return;

  const original = msg.texto;
  bubble.setAttribute('contenteditable', 'true');
  bubble.innerText = original;   /* strip any HTML */
  bubble.focus();

  /* Move cursor to end */
  const range = document.createRange();
  range.selectNodeContents(bubble);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const newText = (bubble.innerText || '').trim();
      bubble.removeEventListener('keydown', onKey);
      bubble.removeAttribute('contenteditable');
      if (newText && newText !== original) {
        msg.texto    = newText;
        msg.editado  = true;
        msg.editadoEm = now();
        card.historico = card.historico || [];
        card.historico.push({
          texto   : `Comentário editado`,
          data    : now(),
          usuario : currentUser?.nome || 'Emerson Santos',
        });
      }
      renderChat(card);
    } else if (e.key === 'Escape') {
      bubble.removeEventListener('keydown', onKey);
      renderChat(card);
    }
  }
  bubble.addEventListener('keydown', onKey);
}

/* ── Delete (soft) ── */
function deleteChatMsg(msgId) {
  const card = allCards.find(c => c.id === state.editingCardId);
  if (!card) return;
  const msg = (card.comentarios || []).find(c => c.id === msgId);
  if (!msg) return;
  msg.excluido = true;
  msg.texto    = '';
  card.historico = card.historico || [];
  card.historico.push({
    texto   : 'Comentário excluído',
    data    : now(),
    usuario : currentUser?.nome || 'Emerson Santos',
  });
  renderChat(card);
  showToast('Comentário removido', 'warn');
}

/* ── @mention picker ── */
let _mentionActive = false;

function openMentionPicker(query) {
  const picker = document.getElementById('chatMentionPicker');
  const list   = document.getElementById('chatMentionList');
  if (!picker || !list) return;

  const users = (settingsData.usuarios || [])
    .filter(u => u.ativo !== false && u.nome.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6);

  if (!users.length) { closeMentionPicker(); return; }

  list.innerHTML = users.map(u => `
    <div class="chat-mention-item"
         onclick="insertMention('${escHtml(u.nome)}')"
         tabindex="0"
         role="option">
      <div class="chat-mention-avatar">${initials(u.nome)}</div>
      <div>
        <div class="chat-mention-name">${escHtml(u.nome)}</div>
        <div class="chat-mention-role">${escHtml(u.perfil || '')}</div>
      </div>
    </div>`).join('');

  picker.style.display = 'block';
  _mentionActive = true;
}

function closeMentionPicker() {
  const picker = document.getElementById('chatMentionPicker');
  if (picker) picker.style.display = 'none';
  _mentionActive = false;
}

function insertMention(userName) {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const text   = input.innerText || '';
  const atPos  = text.lastIndexOf('@');
  if (atPos === -1) return;
  const before = text.substring(0, atPos);
  input.innerText = before + '@' + userName + ' ';
  /* Move cursor to end */
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  closeMentionPicker();
  input.focus();
}

/* ── Init chat events ── */
function initChat() {
  const input   = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  if (!input || !sendBtn) return;

  /* Sync avatar */
  const avatar = document.getElementById('chatInputAvatar');
  if (avatar && currentUser) {
    avatar.textContent = currentUser.initials ||
      initials(currentUser.nome || currentUser.name || '');
  }

  sendBtn.addEventListener('click', sendChatMessage);

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); return; }
    if (e.key === 'Escape') { closeMentionPicker(); return; }
  });

  input.addEventListener('input', () => {
    const text   = input.innerText || '';
    const atPos  = text.lastIndexOf('@');
    if (atPos !== -1) {
      const after = text.substring(atPos + 1);
      /* Only trigger if the query has no space yet (still typing) */
      if (!after.includes(' ') || after.length === 0) {
        openMentionPicker(after);
        return;
      }
    }
    closeMentionPicker();
  });

  /* Close picker on outside click */
  document.addEventListener('click', e => {
    if (!e.target.closest('#chatMentionPicker') && !e.target.closest('#chatInput')) {
      closeMentionPicker();
    }
  });
}

/* ══════════════════════════════════════════════════════════
   HISTORY
══════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════
   ATIVIDADES — Feed unificado (histórico + comentários)
══════════════════════════════════════════════════════════ */
function renderAtividades(card) {
  const feed = document.getElementById('atividadeFeed');
  if (!feed) return;

  /* Build unified timeline: history entries + comment events */
  const items = [];

  (card.historico || []).forEach(h => {
    items.push({
      tipo      : 'historico',
      texto     : h.texto,
      data      : h.data,
      usuario   : h.usuario || 'Sistema',
      timestamp : h.timestamp || 0,
    });
  });

  (card.comentarios || []).forEach(c => {
    if (c.tipo === 'sistema') {
      items.push({
        tipo      : 'sistema',
        texto     : c.texto,
        data      : c.data,
        usuario   : c.autor || 'Sistema',
        timestamp : c.timestamp || 0,
      });
    }
  });

  items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (!items.length) {
    feed.innerHTML = '<div class="ativ-empty">Nenhuma atividade registrada.</div>';
    return;
  }

  const iconMap = {
    historico : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    sistema   : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  };

  feed.innerHTML = items.map(item => `
    <div class="ativ-item ativ-item--${item.tipo}">
      <div class="ativ-icon">${iconMap[item.tipo] || iconMap.historico}</div>
      <div class="ativ-body">
        <div class="ativ-texto">${item.texto}</div>
        <div class="ativ-meta">${escHtml(item.data)} · ${escHtml(item.usuario)}</div>
      </div>
    </div>`).join('');
}

/* Keep renderHistory as alias for any legacy call-sites */
function renderHistory(card) { renderAtividades(card); }

/* ══════════════════════════════════════════════════════════
   CHECKLISTS — Pipefy-style
══════════════════════════════════════════════════════════ */

function renderChecklists(card) {
  const container = document.getElementById('clLists');
  if (!container) return;

  const lists = card.checklists || [];

  if (!lists.length) {
    container.innerHTML = '<div class="cl-empty">Nenhum checklist ainda. Clique em "Adicionar checklist".</div>';
    return;
  }

  container.innerHTML = lists.map(cl => {
    const total  = (cl.itens || []).length;
    const done   = (cl.itens || []).filter(i => i.concluido).length;
    const pct    = total > 0 ? Math.round((done / total) * 100) : 0;

    const itensHtml = (cl.itens || []).map(item => `
      <div class="cl-item ${item.concluido ? 'cl-item--done' : ''}" data-item-id="${item.id}" data-cl-id="${cl.id}">
        <label class="cl-item-check">
          <input type="checkbox" class="cl-checkbox" ${item.concluido ? 'checked' : ''}
                 onchange="toggleChecklistItem('${cl.id}','${item.id}', this.checked)"
                 aria-label="${escHtml(item.texto)}" />
          <span class="cl-checkmark">
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2.5"><polyline points="2 6 5 9 10 3"/></svg>
          </span>
        </label>
        <span class="cl-item-text">${escHtml(item.texto)}</span>
        <button class="cl-item-del" onclick="deleteChecklistItem('${cl.id}','${item.id}')" title="Remover item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`).join('');

    return `
      <div class="cl-block" data-cl-id="${cl.id}">
        <div class="cl-block-header">
          <div class="cl-block-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            <span class="cl-title-text"
                  contenteditable="true"
                  spellcheck="false"
                  onblur="renameChecklist('${cl.id}', this.innerText)"
                  data-original="${escHtml(cl.titulo)}">${escHtml(cl.titulo)}</span>
          </div>
          <div class="cl-block-actions">
            <span class="cl-count">${done}/${total}</span>
            <button class="cl-del-list" onclick="deleteChecklist('${cl.id}')" title="Excluir checklist">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>

        <div class="cl-progress-wrap">
          <div class="cl-progress-bar">
            <div class="cl-progress-fill" style="width:${pct}%" data-pct="${pct}"></div>
          </div>
          <span class="cl-progress-pct">${pct}%</span>
        </div>

        <div class="cl-items">${itensHtml}</div>

        <div class="cl-add-item-row" data-cl-id="${cl.id}">
          <input type="text" class="cl-add-item-input" placeholder="Adicionar item..."
                 id="clInput-${cl.id}"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();addChecklistItem('${cl.id}')}" />
          <button class="cl-add-item-btn" onclick="addChecklistItem('${cl.id}')">Adicionar</button>
        </div>
      </div>`;
  }).join('');
}

function toggleChecklistItem(clId, itemId, checked) {
  const card = allCards.find(c => c.id === state.editingCardId);
  if (!card) return;
  const cl = (card.checklists || []).find(c => c.id === clId);
  if (!cl) return;
  const item = (cl.itens || []).find(i => i.id === itemId);
  if (!item) return;
  item.concluido    = checked;
  item.concluidoEm  = checked ? now() : '';
  card.historico    = card.historico || [];
  card.historico.push({
    texto     : `Item "${item.texto}" ${checked ? 'marcado como concluído' : 'desmarcado'} no checklist "${cl.titulo}"`,
    data      : now(),
    usuario   : currentUser?.nome || 'Emerson Santos',
    timestamp : Date.now(),
  });
  renderChecklists(card);
}

function addChecklistItem(clId) {
  const input = document.getElementById(`clInput-${clId}`);
  if (!input) return;
  const text = (input.value || '').trim();
  if (!text) return;
  const card = allCards.find(c => c.id === state.editingCardId);
  if (!card) return;
  const cl = (card.checklists || []).find(c => c.id === clId);
  if (!cl) return;
  cl.itens = cl.itens || [];
  cl.itens.push({ id: uid(), texto: text, concluido: false, criadoEm: now(), concluidoEm: '' });
  card.historico = card.historico || [];
  card.historico.push({ texto: `Item adicionado ao checklist "${cl.titulo}"`, data: now(), usuario: currentUser?.nome || 'Emerson Santos', timestamp: Date.now() });
  renderChecklists(card);
}

function deleteChecklistItem(clId, itemId) {
  const card = allCards.find(c => c.id === state.editingCardId);
  if (!card) return;
  const cl = (card.checklists || []).find(c => c.id === clId);
  if (!cl) return;
  const item = (cl.itens || []).find(i => i.id === itemId);
  const nome = item?.texto || '';
  cl.itens = (cl.itens || []).filter(i => i.id !== itemId);
  card.historico = card.historico || [];
  card.historico.push({ texto: `Item "${nome}" removido do checklist "${cl.titulo}"`, data: now(), usuario: currentUser?.nome || 'Emerson Santos', timestamp: Date.now() });
  renderChecklists(card);
}

function deleteChecklist(clId) {
  const card = allCards.find(c => c.id === state.editingCardId);
  if (!card) return;
  const cl = (card.checklists || []).find(c => c.id === clId);
  const nome = cl?.titulo || '';
  card.checklists = (card.checklists || []).filter(c => c.id !== clId);
  card.historico = card.historico || [];
  card.historico.push({ texto: `Checklist "${nome}" excluído`, data: now(), usuario: currentUser?.nome || 'Emerson Santos', timestamp: Date.now() });
  renderChecklists(card);
  showToast('Checklist excluído', 'warn');
}

function renameChecklist(clId, newTitle) {
  const card = allCards.find(c => c.id === state.editingCardId);
  if (!card) return;
  const cl = (card.checklists || []).find(c => c.id === clId);
  if (!cl) return;
  const trimmed = (newTitle || '').trim();
  if (!trimmed || trimmed === cl.titulo) return;
  const old = cl.titulo;
  cl.titulo = trimmed;
  card.historico = card.historico || [];
  card.historico.push({ texto: `Checklist renomeado de "${old}" para "${trimmed}"`, data: now(), usuario: currentUser?.nome || 'Emerson Santos', timestamp: Date.now() });
}

function addNewChecklist() {
  const card = allCards.find(c => c.id === state.editingCardId);
  if (!card) { showToast('Salve o card primeiro', 'warn'); return; }
  card.checklists = card.checklists || [];
  const num = card.checklists.length + 1;
  card.checklists.push({ id: uid(), titulo: `Checklist ${num}`, itens: [] });
  card.historico = card.historico || [];
  card.historico.push({ texto: `Checklist ${num} adicionado`, data: now(), usuario: currentUser?.nome || 'Emerson Santos', timestamp: Date.now() });
  renderChecklists(card);
}

function initChecklists() {
  const btn = document.getElementById('clAddListBtn');
  if (btn) btn.addEventListener('click', addNewChecklist);
}

/* ══════════════════════════════════════════════════════════
   PAYMENT LINK — Contas a Receber (integração e-Rede)
══════════════════════════════════════════════════════════ */

/** Mapeia o tipo de pagamento interno para paymentOptions da API e-Rede. */
function redePaymentOptions(tipo) {
  if (tipo === 'pix')     return ['pix'];
  if (tipo === 'credito') return ['credit'];
  // boleto e débito não são suportados diretamente no link e-Rede; usa crédito
  return ['credit'];
}

/** Retorna uma data no formato MM/DD/YYYY com N dias a partir de hoje. */
function expirationDateInDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// Gera link de pagamento automaticamente ao criar o card (sem depender do modal aberto)
async function autoGeneratePaymentLink(card, installments) {
  const tipo = card.tipoPagamento || 'pix';

  try {
    const rawDesc   = (card.titulo || 'Cobrança').trim();
    const description = rawDesc.length > 50 ? rawDesc.slice(0, 47) + '...' : rawDesc;
    const amount    = parseFloat(card.valor) || 0;

    if (amount <= 0) {
      showToast('⚠️ Card criado, mas sem valor — link não gerado.', 'warn');
      renderAll();
      return;
    }

    const body = {
      amount,
      description,
      installments: installments || 1,
      paymentOptions: redePaymentOptions(tipo),
      expirationDate: expirationDateInDays(7),
    };

    const res = await fetch(`${PAYMENT_BACKEND_URL}/api/gerar-link`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = (errData.error && typeof errData.error === 'string')
        ? errData.error
        : `Erro ${res.status} ao gerar link.`;
      throw new Error(msg);
    }

    const { url, paymentLinkId } = await res.json();
    const txCode = paymentLinkId || uid().toUpperCase().slice(0, 8);

    card.tipoPagamento   = tipo;
    card.linkPagamento   = url;
    card.codigoTransacao = txCode;
    card.linkStatus      = 'ativo';

    const modCfg   = MODULES[card.modulo] || {};
    const oldFase  = card.fase;
    const oldLabel = getPhaseStyle(card.modulo, oldFase).label;
    const genPhase = modCfg.paymentGenPhase || 'aguardando_pagamento';
    card.fase      = genPhase;
    persistCards();
    apiUpdateCard(card);
    const newLabel = getPhaseStyle(card.modulo, genPhase).label;

    card.historico.push({
      texto:   `Link gerado automaticamente via e-Rede: <strong>${txCode}</strong> (${tipo.toUpperCase()})`,
      data:    now(),
      usuario: 'Sistema',
    });
    card.historico.push({
      texto:   `Movido de <strong>${oldLabel}</strong> para <strong>${newLabel}</strong>`,
      data:    now(),
      usuario: 'Sistema',
    });

    try { await navigator.clipboard.writeText(url); } catch (_) { /* sem permissão */ }

    showToast(`✅ Link gerado e card movido para "${newLabel}"! (${txCode})`, 'success');
    renderAll();

  } catch (err) {
    card.historico.push({
      texto:   `Falha ao gerar link automático: ${err.message}`,
      data:    now(),
      usuario: 'Sistema',
    });
    showToast(`⚠️ Card criado, mas erro ao gerar link: ${err.message}`, 'warn');
    renderAll();
  }
}

async function generatePaymentLink(cardId) {
  const card = allCards.find(c => c.id === cardId);
  if (!card) return;

  // Captura tipo do select no modal
  const tipoEl = document.getElementById('formTipoPagamento');
  const tipo   = (tipoEl ? tipoEl.value : card.tipoPagamento) || 'pix';

  // Feedback visual no botão do modal
  const btn = document.getElementById('genLinkBtn');
  const originalLabel = btn ? btn.textContent : '';
  if (btn) { btn.textContent = 'Gerando...'; btn.disabled = true; }

  try {
    // Descrição limitada a 50 chars (limite da API e-Rede)
    const rawDesc = (card.titulo || 'Cobrança').trim();
    const description = rawDesc.length > 50 ? rawDesc.slice(0, 47) + '...' : rawDesc;

    const amount = parseFloat(card.valor) || 0;
    if (amount <= 0) throw new Error('O valor do card deve ser maior que zero.');

    const parcelasEl   = document.getElementById('formParcelas');
    const installments = (tipo === 'credito' && parcelasEl) ? parseInt(parcelasEl.value, 10) : 1;

    const body = {
      amount,
      description,
      installments,
      paymentOptions: redePaymentOptions(tipo),
      expirationDate: expirationDateInDays(7),   // link válido por 7 dias
    };

    const res = await fetch(`${PAYMENT_BACKEND_URL}/api/gerar-link`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = (errData.error && typeof errData.error === 'string')
        ? errData.error
        : `Erro ${res.status} ao gerar link.`;
      throw new Error(msg);
    }

    const { url, paymentLinkId } = await res.json();

    // Atualiza o card com os dados reais retornados pela e-Rede
    const txCode = paymentLinkId || uid().toUpperCase().slice(0, 8);

    card.tipoPagamento   = tipo;
    card.linkPagamento   = url;
    card.codigoTransacao = txCode;
    card.linkStatus      = 'ativo';

    const modCfg   = MODULES[card.modulo] || {};
    const oldFase  = card.fase;
    const oldLabel = getPhaseStyle(card.modulo, oldFase).label;
    const genPhase = modCfg.paymentGenPhase || 'aguardando_pagamento';
    card.fase = genPhase;
    const newGenLabel = getPhaseStyle(card.modulo, genPhase).label;

    card.historico.push({
      texto:   `Link de pagamento gerado via e-Rede: <strong>${txCode}</strong> (${tipo.toUpperCase()})`,
      data:    now(),
      usuario: 'Emerson Santos',
    });
    card.historico.push({
      texto:   `Movido de <strong>${oldLabel}</strong> para <strong>${newGenLabel}</strong>`,
      data:    now(),
      usuario: 'Emerson Santos',
    });

    // Copia o link para a área de transferência automaticamente
    try { await navigator.clipboard.writeText(url); } catch (_) { /* sem permissão */ }

    showToast(`✅ Link gerado e copiado! (${txCode})`, 'success');
    closeModal();
    renderAll();

  } catch (err) {
    console.error('[e-Rede] Falha ao gerar link:', err);
    showToast(`❌ ${err.message || 'Erro ao gerar link de pagamento.'}`, 'error');
    // Restaura botão
    if (btn) { btn.textContent = originalLabel; btn.disabled = false; }
  }
}

// Gera PDF com dados reais da e-Rede (transactionId, NSU, bandeira, etc.)
async function generateReceiptPdf(card, txData) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // ── Extrai campos reais da e-Rede ─────────────────────────────────────────
  const tx       = (txData && Array.isArray(txData.transactions) && txData.transactions[0]) || null;
  const valorFmt = formatCurrency(card.valor) || 'N/A';
  const txCode   = card.codigoTransacao || card.id;
  const dataHora = now();

  // Valor: prioriza transação > link > card
  const txAmount = tx && tx.amount != null
    ? 'R$ ' + Number(tx.amount).toFixed(2).replace('.', ',')
    : txData && txData.amount != null
      ? 'R$ ' + Number(txData.amount).toFixed(2).replace('.', ',')
      : valorFmt;

  // Status real
  const txStatus = tx ? (tx.status || 'APPROVED') : (txData && txData.status ? txData.status : 'PAGO');

  // Data/hora real da transação
  let txDateTime = dataHora;
  if (tx && tx.dateTime) {
    try { txDateTime = new Date(tx.dateTime).toLocaleString('pt-BR', { timeZone: 'America/Bahia' }); }
    catch (_) { txDateTime = tx.dateTime; }
  }

  // Campos extras da e-Rede
  const txId       = tx && tx.transactionId     ? tx.transactionId     : null;
  const nsu        = tx && tx.nsu               ? tx.nsu               : null;
  const authCode   = tx && tx.authorizationCode ? tx.authorizationCode : null;
  const brand      = tx && tx.brand             ? tx.brand             : null;
  const last4      = tx && tx.last4Digits       ? tx.last4Digits       : null;
  const cardHolder = tx && tx.cardHolder        ? tx.cardHolder        : null;
  const parcelas   = tx && tx.installments      ? tx.installments      : null;

  // Forma de pagamento enriquecida com bandeira real
  let tipoPgto = (card.tipoPagamento || 'link').toUpperCase();
  if (brand)  tipoPgto = brand + (last4 ? '  ****' + last4 : '');
  if (parcelas && parcelas > 1) tipoPgto += '  —  ' + parcelas + 'x';

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const cx    = pageW / 2;
  const lx    = 20;
  const vx    = pageW - 20;

  // ── Cabeçalho verde ──────────────────────────────────────────────────────
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, pageW, 48, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text('Comprovante de Pagamento', cx, 18, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Grupo PED — Central Operacional', cx, 28, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(209, 250, 229);
  doc.text('Dados gerados com informações oficiais da Rede Adquirente', cx, 38, { align: 'center' });

  // ── Caixa do valor ────────────────────────────────────────────────────────
  doc.setFillColor(240, 253, 244);
  doc.rect(0, 48, pageW, 26, 'F');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128);
  doc.text('VALOR PAGO', cx, 57, { align: 'center' });
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(6, 95, 70);
  doc.text(txAmount, cx, 69, { align: 'center' });

  // ── Helpers ───────────────────────────────────────────────────────────────
  let y = 84;

  const sectionHeader = (label) => {
    doc.setFillColor(239, 246, 255);
    doc.rect(lx, y, pageW - 40, 7, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 130, 246);
    doc.text(label, lx + 2, y + 5);
    y += 10;
    doc.setFontSize(9.5);
  };

  const addRow = (label, value) => {
    doc.setDrawColor(229, 231, 235);
    doc.line(lx, y, pageW - lx, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(label, lx, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    const lines = doc.splitTextToSize(String(value), 95);
    doc.text(lines, vx, y + 5, { align: 'right' });
    y += 12 + (lines.length - 1) * 4.5;
  };

  // ── Seção 1: Identificação da cobrança ───────────────────────────────────
  sectionHeader('IDENTIFICAÇÃO DA COBRANÇA');
  addRow('Descrição',           card.titulo || 'Cobrança');
  if (card.fornecedor) addRow('Cliente / Aluno', card.fornecedor);
  if (card.numDoc)     addRow('Referência',      card.numDoc);
  addRow('ID do Link (e-Rede)', txCode);
  y += 4;

  // ── Seção 2: Dados oficiais Rede (só exibe se vieram da API) ─────────────
  if (txId || nsu || authCode) {
    sectionHeader('DADOS OFICIAIS REDE ADQUIRENTE');
    if (txId)     addRow('ID da Transação',     txId);
    if (nsu)      addRow('NSU',                 nsu);
    if (authCode) addRow('Cód. de Autorização', authCode);
    y += 4;
  }

  // ── Seção 3: Detalhes do pagamento ───────────────────────────────────────
  sectionHeader('DETALHES DO PAGAMENTO');
  addRow('Forma de Pagamento', tipoPgto);
  if (cardHolder) addRow('Nome no Cartão', cardHolder);
  addRow('Status',             txStatus);
  addRow('Data / Hora Pgto.',  txDateTime);
  addRow('Gerado em',          dataHora);

  // ── Rodapé ────────────────────────────────────────────────────────────────
  doc.setFillColor(249, 250, 251);
  doc.rect(0, pageH - 16, pageW, 16, 'F');
  doc.setDrawColor(229, 231, 235);
  doc.line(0, pageH - 16, pageW, pageH - 16);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(156, 163, 175);
  doc.text('Central Operacional — Grupo PED  |  Documento não substitui nota fiscal', cx, pageH - 7, { align: 'center' });

  const pdfBlob = doc.output('blob');
  const fileName = 'comprovante_' + txCode + '.pdf';
  return new File([pdfBlob], fileName, { type: 'application/pdf' });
}

async function confirmPayment(cardId) {
  const card = allCards.find(c => c.id === cardId);
  if (!card) return;

  const btn = document.getElementById('confirmPaymentBtn');
  if (btn) { btn.textContent = 'Confirmando...'; btn.disabled = true; }

  try {
    // 1. Tenta buscar dados da transação na e-Rede
    let txData = null;
    if (card.codigoTransacao) {
      try {
        const r = await fetch(`${PAYMENT_BACKEND_URL}/api/status-link/${encodeURIComponent(card.codigoTransacao)}`);
        if (r.ok) txData = await r.json();
      } catch (_) { /* usa dados locais como fallback */ }
    }

    // 2. Gera PDF do comprovante e anexa ao card
    const pdfFile = await generateReceiptPdf(card, txData);
    addCardFile(cardId, pdfFile);

    // 3. Atualiza estado do card
    const modCfgC      = MODULES[card.modulo] || {};
    card.linkStatus    = 'pago';
    const oldFaseC     = card.fase;
    const oldLabelC    = getPhaseStyle(card.modulo, oldFaseC).label;
    const confirmPhase = modCfgC.paymentConfirmPhase || 'pagamento_efetuado';
    card.fase          = confirmPhase;
    persistCards();
    apiUpdateCard(card);
    const newConfLabel = getPhaseStyle(card.modulo, confirmPhase).label;

    card.historico.push({
      texto:   `<strong>Pagamento confirmado</strong> — ${formatCurrency(card.valor) || 'valor não informado'} via ${(card.tipoPagamento || 'link').toUpperCase()}`,
      data:    now(),
      usuario: 'Emerson Santos',
    });
    card.historico.push({
      texto:   `Comprovante PDF gerado e anexado: <strong>${pdfFile.name}</strong>`,
      data:    now(),
      usuario: 'Sistema',
    });
    card.historico.push({
      texto:   `Movido de <strong>${oldLabelC}</strong> para <strong>${newConfLabel}</strong>`,
      data:    now(),
      usuario: 'Emerson Santos',
    });

    showToast('Pagamento confirmado! Comprovante PDF anexado ao card ✅', 'success');
    closeModal();
    renderAll();

  } catch (err) {
    if (btn) { btn.textContent = 'Confirmar Recebimento'; btn.disabled = false; }
    showToast(`Erro ao confirmar: ${err.message}`, 'error');
  }
}

/* ══════════════════════════════════════════════════════════
   TOASTS
══════════════════════════════════════════════════════════ */
function showToast(msg, type = 'default') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  const icon = { success:'✓', error:'✕', warn:'!' }[type] || 'ℹ';
  toast.innerHTML = `<span style="font-weight:800;font-size:14px">${icon}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

/* ══════════════════════════════════════════════════════════
   VIEW TOGGLE
══════════════════════════════════════════════════════════ */
function setViewMode(mode) {
  state.viewMode = mode;
  document.getElementById('kanbanView').classList.toggle('hidden', mode !== 'kanban');
  document.getElementById('listView').classList.toggle('hidden', mode !== 'list');
  document.getElementById('viewKanban').classList.toggle('active', mode === 'kanban');
  document.getElementById('viewList').classList.toggle('active', mode === 'list');
  renderAll();
}

/* ══════════════════════════════════════════════════════════
   CONFIGURAÇÕES — Roteamento
══════════════════════════════════════════════════════════ */
function openSettings() {
  state.currentModule = 'configuracoes';
  if (location.hash.slice(1) !== 'configuracoes') {
    history.replaceState(null, '', '#configuracoes');
  }

  // Atualiza estado ativo no menu lateral
  document.querySelectorAll('.nav-item[data-module]').forEach(el => {
    el.classList.toggle('active', el.dataset.module === 'configuracoes');
  });

  // Atualiza título e breadcrumb
  document.getElementById('pageTitle').textContent        = 'Configurações';
  document.getElementById('breadcrumbActive').textContent = 'Configurações';

  // Oculta controles da topbar específicos de módulos
  document.getElementById('newCardBtn').classList.add('hidden');
  document.querySelector('.view-toggle').classList.add('hidden');
  document.querySelector('.topbar-search').classList.add('hidden');

  // Oculta kanban/list/stats/dashboard/agenda e exibe settings
  closeDashboard();
  closeAgenda();
  document.getElementById('statsBar').classList.add('hidden');
  document.getElementById('kanbanView').classList.add('hidden');
  document.getElementById('listView').classList.add('hidden');
  document.getElementById('settingsView').classList.remove('hidden');

  // Renderiza o painel ativo (padrão: escolas)
  renderSettingsPanel(state.settingsTab || 'escolas');
}

function exitSettings() {
  // Restaura controles da topbar
  document.getElementById('newCardBtn').classList.remove('hidden');
  document.querySelector('.view-toggle').classList.remove('hidden');
  document.querySelector('.topbar-search').classList.remove('hidden');

  // Oculta settings e restaura stats + visões de conteúdo
  document.getElementById('settingsView').classList.add('hidden');
  document.getElementById('statsBar').classList.remove('hidden');

  // Restaura a view correta (kanban ou lista) que foi ocultada ao abrir settings
  document.getElementById('kanbanView').classList.toggle('hidden', state.viewMode !== 'kanban');
  document.getElementById('listView').classList.toggle('hidden',   state.viewMode !== 'list');
}

function switchSettingsTab(tab) {
  state.settingsTab = tab;

  // Atualiza botões do sub-menu
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  renderSettingsPanel(tab);
}

/* ══════════════════════════════════════════════════════════
   CONFIGURAÇÕES — Render dos painéis
══════════════════════════════════════════════════════════ */
function renderSettingsPanel(tab) {
  const container = document.getElementById('settingsContent');
  if (!container) return;
  switch (tab) {
    case 'escolas':    container.innerHTML = buildPanelEscolas();   bindEscolasEvents();   break;
    case 'fluxos':     container.innerHTML = buildPanelFluxos();    bindFluxosEvents();    break;
    case 'etiquetas':  container.innerHTML = buildPanelEtiquetas(); bindEtiquetasEvents(); break;
    case 'aparencia':   container.innerHTML = buildPanelAparencia();  bindAparenciaEvents();  break;
    case 'automacoes':  container.innerHTML = buildPanelAutomacoes(); bindAutomacoesEvents(); break;
    case 'usuarios':    container.innerHTML = buildPanelUsuarios();   bindUsuariosEvents();   break;
    case 'permissoes':  buildPanelPermissoes(); break;
  }
}

/* ──────────────────────────────────────────────────────────
   PAINEL: ESCOLAS
────────────────────────────────────────────────────────── */
function buildPanelEscolas() {
  const rows = settingsData.escolas.map(e => `
    <div class="escola-item" data-id="${e.id}">
      <div class="escola-avatar" style="background:${e.cor}">${e.sigla}</div>
      <div class="escola-info">
        <div class="escola-info-nome">${e.nome}</div>
        <div class="escola-info-id">ID: ${e.id} &middot; Sigla: ${e.sigla}</div>
      </div>
      <div class="escola-status-toggle">
        <label class="toggle-switch" title="${e.ativa ? 'Ativa' : 'Inativa'}">
          <input type="checkbox" data-action="toggle-escola" data-id="${e.id}" ${e.ativa ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <span style="font-size:11px">${e.ativa ? 'Ativa' : 'Inativa'}</span>
      </div>
      <div class="escola-actions">
        <button class="btn-icon-sm" data-action="edit-escola" data-id="${e.id}" title="Editar">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M9.5 1.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="btn-icon-sm btn-icon-danger" data-action="del-escola" data-id="${e.id}" title="Remover">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 3.5h9M5 3.5V2h3v1.5M3 3.5l.8 7h5.4l.8-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>`).join('');

  return `
    <div class="settings-panel-header">
      <div>
        <h2>Escolas</h2>
        <p>Gerencie as unidades cadastradas no sistema (${settingsData.escolas.length} unidades)</p>
      </div>
      <button class="btn-primary" id="addEscolaBtn">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 1.5v10M1.5 6.5h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Adicionar Escola
      </button>
    </div>
    <div class="settings-card">${rows || '<p style="padding:24px;color:var(--quadro-muted);text-align:center">Nenhuma escola cadastrada.</p>'}</div>

    <!-- Modal inline para adicionar/editar escola -->
    <div class="escola-modal-overlay" id="escolaModalOverlay">
      <div class="escola-modal">
        <div class="escola-modal-header">
          <h3 id="escolaModalTitle">Nova Escola</h3>
          <button class="btn-icon-sm" id="escolaModalClose">&#x2715;</button>
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">Nome da Escola *</label>
          <input type="text" class="form-input" id="escolaInputNome" placeholder="Ex: PED Pituba" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Sigla (3-4 letras) *</label>
            <input type="text" class="form-input" id="escolaInputSigla" placeholder="PIT" maxlength="4" style="text-transform:uppercase"/>
          </div>
          <div class="form-group">
            <label class="form-label">ID interno *</label>
            <input type="text" class="form-input" id="escolaInputId" placeholder="ped5" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Cor de identificacao</label>
          <div class="escola-color-picker-grid" id="escolaColorGrid">
            ${CORES_PALETTE.map(c => `<div class="color-swatch" data-cor="${c}" style="background:${c}" title="${c}"></div>`).join('')}
          </div>
          <input type="hidden" id="escolaInputCor" value="${CORES_PALETTE[0]}" />
        </div>
        <div class="escola-modal-footer">
          <button class="btn-secondary" id="escolaModalCancel">Cancelar</button>
          <button class="btn-primary" id="escolaModalSave">Salvar Escola</button>
        </div>
      </div>
    </div>`;
}

function bindEscolasEvents() {
  document.getElementById('addEscolaBtn').addEventListener('click', () => openEscolaModal());

  document.getElementById('escolaModalClose').addEventListener('click', closeEscolaModal);
  document.getElementById('escolaModalCancel').addEventListener('click', closeEscolaModal);
  document.getElementById('escolaModalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('escolaModalOverlay')) closeEscolaModal();
  });

  document.getElementById('escolaModalSave').addEventListener('click', saveEscola);

  document.getElementById('escolaInputSigla').addEventListener('input', function() {
    this.value = this.value.toUpperCase();
  });

  document.getElementById('escolaColorGrid').addEventListener('click', e => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    document.querySelectorAll('#escolaColorGrid .color-swatch').forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
    document.getElementById('escolaInputCor').value = swatch.dataset.cor;
  });
  const firstSwatch = document.querySelector('#escolaColorGrid .color-swatch');
  if (firstSwatch) firstSwatch.classList.add('selected');

  document.querySelector('.settings-card').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action } = btn.dataset;
    const { id } = btn.dataset;

    if (action === 'toggle-escola') {
      const escola = settingsData.escolas.find(s => s.id === id);
      if (escola) {
        escola.ativa = btn.checked;
        saveSettingsData('escolas');
        const label = btn.closest('.escola-status-toggle').querySelector('span');
        if (label) label.textContent = escola.ativa ? 'Ativa' : 'Inativa';
      }
    }
    if (action === 'edit-escola') openEscolaModal(id);
    if (action === 'del-escola') {
      if (confirm('Remover esta escola do sistema?')) {
        settingsData.escolas = settingsData.escolas.filter(s => s.id !== id);
        saveSettingsData('escolas');
        renderSettingsPanel('escolas');
        showToast('Escola removida', 'success');
      }
    }
  });
}

let _editingEscolaId = null;
function openEscolaModal(id) {
  _editingEscolaId = id || null;
  const overlay = document.getElementById('escolaModalOverlay');
  document.getElementById('escolaModalTitle').textContent = id ? 'Editar Escola' : 'Nova Escola';
  document.getElementById('escolaInputNome').value  = '';
  document.getElementById('escolaInputSigla').value = '';
  document.getElementById('escolaInputId').value    = '';
  document.getElementById('escolaInputCor').value   = CORES_PALETTE[0];
  document.querySelectorAll('#escolaColorGrid .color-swatch').forEach(s => s.classList.remove('selected'));
  const firstSwatch = document.querySelector('#escolaColorGrid .color-swatch');
  if (firstSwatch) firstSwatch.classList.add('selected');

  if (id) {
    const escola = settingsData.escolas.find(s => s.id === id);
    if (escola) {
      document.getElementById('escolaInputNome').value  = escola.nome;
      document.getElementById('escolaInputSigla').value = escola.sigla;
      document.getElementById('escolaInputId').value    = escola.id;
      document.getElementById('escolaInputCor').value   = escola.cor;
      document.querySelectorAll('#escolaColorGrid .color-swatch').forEach(s => {
        s.classList.toggle('selected', s.dataset.cor === escola.cor);
      });
    }
  }
  overlay.classList.add('open');
  setTimeout(() => document.getElementById('escolaInputNome').focus(), 50);
}

function closeEscolaModal() {
  document.getElementById('escolaModalOverlay').classList.remove('open');
  _editingEscolaId = null;
}

function saveEscola() {
  const nome  = document.getElementById('escolaInputNome').value.trim();
  const sigla = document.getElementById('escolaInputSigla').value.trim().toUpperCase();
  const idVal = document.getElementById('escolaInputId').value.trim().toLowerCase().replace(/\s+/g,'_');
  const cor   = document.getElementById('escolaInputCor').value;

  if (!nome || !sigla || !idVal) {
    showToast('Preencha todos os campos obrigatorios', 'warn'); return;
  }

  if (_editingEscolaId) {
    const escola = settingsData.escolas.find(s => s.id === _editingEscolaId);
    if (escola) { escola.nome = nome; escola.sigla = sigla; escola.cor = cor; }
    showToast('Escola atualizada com sucesso', 'success');
  } else {
    if (settingsData.escolas.find(s => s.id === idVal)) {
      showToast('Ja existe uma escola com esse ID', 'warn'); return;
    }
    settingsData.escolas.push({ id:idVal, nome, sigla, cor, ativa:true });
    showToast('Escola adicionada com sucesso', 'success');
  }

  saveSettingsData('escolas');
  closeEscolaModal();
  renderSettingsPanel('escolas');
}

/* ──────────────────────────────────────────────────────────
   PAINEL: FLUXOS
────────────────────────────────────────────────────────── */
function buildPanelFluxos() {
  const totalFluxos = Object.keys(MODULES).length;

  const cards = Object.entries(MODULES).map(([key, mod]) => {
    const phaseCount = Object.keys(mod.fases).length;
    const phases = Object.entries(mod.fases).map(([pkey, phase]) => `
      <div class="fluxo-phase-item">
        <div class="fluxo-phase-dot" style="background:${phase.color}"></div>
        <span class="fluxo-phase-label">${phase.label}</span>
        ${pkey === mod.lastPhase ? '<span class="fluxo-last-badge">Fase Final</span>' : ''}
        <input type="color" class="fluxo-phase-color-input"
          value="${phase.color}"
          data-module="${key}" data-phase="${pkey}"
          title="Alterar cor da fase" />
      </div>`).join('');

    return `
      <div class="fluxo-module-card" data-key="${key}">
        <div class="fluxo-module-header">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="fluxo-module-name">${mod.label}</span>
            <span class="fluxo-module-count">${phaseCount} fase${phaseCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="fluxo-module-actions">
            <button class="btn-fluxo-action" data-action="edit-fluxo" data-key="${key}" title="Editar fluxo">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M9.5 1.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Editar
            </button>
            <button class="btn-fluxo-action btn-fluxo-danger" data-action="del-fluxo" data-key="${key}" title="Excluir fluxo">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M2 3.5h9M5 3.5V2h3v1.5M3 3.5l.8 7h5.4l.8-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              </svg>
              Excluir
            </button>
          </div>
        </div>
        <div class="fluxo-phases-list">${phases}</div>
      </div>`;
  }).join('');

  return `
    <div class="settings-panel-header">
      <div>
        <h2>Fluxos</h2>
        <p>Crie e gerencie os pipelines do sistema — ${totalFluxos} fluxo${totalFluxos !== 1 ? 's' : ''} ativo${totalFluxos !== 1 ? 's' : ''}</p>
      </div>
      <button class="btn-primary" id="addFluxoBtn">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 1.5v10M1.5 6.5h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Novo Fluxo
      </button>
    </div>
    ${cards}

    <!-- Modal Criar/Editar Fluxo -->
    <div class="escola-modal-overlay" id="fluxoModalOverlay">
      <div class="escola-modal" style="width:580px;max-width:calc(100vw - 32px)">
        <div class="escola-modal-header">
          <h3 id="fluxoModalTitle">Novo Fluxo</h3>
          <button class="btn-icon-sm" id="fluxoModalClose">&#x2715;</button>
        </div>

        <!-- Identificação do fluxo -->
        <div class="form-row" style="margin-bottom:12px">
          <div class="form-group">
            <label class="form-label">Nome completo *</label>
            <input type="text" class="form-input" id="fluxoInputNome"
              placeholder="Ex: Recursos Humanos"/>
          </div>
          <div class="form-group">
            <label class="form-label">Rotulo curto *</label>
            <input type="text" class="form-input" id="fluxoInputShort"
              placeholder="Ex: RH" maxlength="24"/>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:20px">
          <label class="form-label">Label do botao "Novo"</label>
          <input type="text" class="form-input" id="fluxoInputBtn"
            placeholder="Ex: Nova Solicitacao RH" maxlength="30"/>
        </div>

        <!-- Editor de fases -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <label class="form-label" style="margin:0;font-weight:600">Fases do Pipeline</label>
          <button class="btn-secondary" style="font-size:12px;padding:5px 10px" id="addPhaseRowBtn">
            + Adicionar Fase
          </button>
        </div>

        <div class="phase-editor-header">
          <span style="width:32px"></span>
          <span style="flex:1">Nome da fase</span>
          <span style="width:80px;text-align:center">Fase final</span>
          <span style="width:28px"></span>
        </div>

        <div id="phasesEditorList" class="phases-editor-list"></div>

        <p class="phase-editor-hint">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style="flex-shrink:0">
            <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M6.5 5.5v4M6.5 4h.01" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          Marque a ultima fase como "Fase Final" — sera usada como criterio de conclusao dos cards.
        </p>

        <div class="escola-modal-footer">
          <button class="btn-secondary" id="fluxoModalCancel">Cancelar</button>
          <button class="btn-primary" id="fluxoModalSave">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 6.5l3.5 3.5 5.5-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Salvar Fluxo
          </button>
        </div>
      </div>
    </div>`;
}

function bindFluxosEvents() {
  const content = document.getElementById('settingsContent');

  // Color pickers inline (ao lado de cada fase no card)
  content.addEventListener('change', e => {
    const input = e.target.closest('.fluxo-phase-color-input');
    if (!input || input.closest('#fluxoModalOverlay')) return;
    const modKey   = input.dataset.module;
    const phaseKey = input.dataset.phase;
    if (MODULES[modKey] && MODULES[modKey].fases[phaseKey]) {
      MODULES[modKey].fases[phaseKey].color = input.value;
      const dot = input.closest('.fluxo-phase-item').querySelector('.fluxo-phase-dot');
      if (dot) dot.style.background = input.value;
      showToast('Cor da fase atualizada', 'success');
    }
  });

  // Botões nos cards (editar / excluir fluxo)
  content.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, key } = btn.dataset;
    if (action === 'edit-fluxo') openFluxoModal(key);
    if (action === 'del-fluxo') confirmDeleteFluxo(key);
  });

  // Botão "Novo Fluxo"
  document.getElementById('addFluxoBtn').addEventListener('click', () => openFluxoModal(null));

  // Modal: fechar
  document.getElementById('fluxoModalClose').addEventListener('click', closeFluxoModal);
  document.getElementById('fluxoModalCancel').addEventListener('click', closeFluxoModal);
  document.getElementById('fluxoModalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('fluxoModalOverlay')) closeFluxoModal();
  });

  // Modal: adicionar linha de fase
  document.getElementById('addPhaseRowBtn').addEventListener('click', () => addPhaseEditorRow());

  // Modal: remover linha de fase (delegado)
  document.getElementById('phasesEditorList').addEventListener('click', e => {
    const del = e.target.closest('.phase-del-btn');
    if (!del) return;
    const row = del.closest('.phase-editor-row');
    const list = document.getElementById('phasesEditorList');
    if (list.querySelectorAll('.phase-editor-row').length <= 1) {
      showToast('O fluxo precisa ter ao menos uma fase', 'warn'); return;
    }
    // Se a fase removida era a "final", marca a ultima restante como final
    const wasLast = row.querySelector('input[type="radio"]').checked;
    row.remove();
    if (wasLast) {
      const rows = list.querySelectorAll('.phase-editor-row');
      if (rows.length) rows[rows.length - 1].querySelector('input[type="radio"]').checked = true;
    }
  });

  // Modal: salvar
  document.getElementById('fluxoModalSave').addEventListener('click', saveFluxo);

  // Keyboard
  document.addEventListener('keydown', function escFluxo(e) {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('fluxoModalOverlay');
      if (overlay && overlay.classList.contains('open')) { closeFluxoModal(); e.stopPropagation(); }
    }
  });
}

/* ──────────────────────────────────────────────────────────
   FLUXOS — Modal CRUD
────────────────────────────────────────────────────────── */
let _editingFluxoKey = null;

function openFluxoModal(key) {
  _editingFluxoKey = key || null;
  const overlay = document.getElementById('fluxoModalOverlay');
  document.getElementById('fluxoModalTitle').textContent = key ? 'Editar Fluxo' : 'Novo Fluxo';
  document.getElementById('fluxoInputNome').value  = '';
  document.getElementById('fluxoInputShort').value = '';
  document.getElementById('fluxoInputBtn').value   = '';
  document.getElementById('phasesEditorList').innerHTML = '';

  if (key && MODULES[key]) {
    const mod = MODULES[key];
    document.getElementById('fluxoInputNome').value  = mod.label;
    document.getElementById('fluxoInputShort').value = mod.shortLabel;
    document.getElementById('fluxoInputBtn').value   = mod.btnLabel;
    Object.entries(mod.fases).forEach(([pkey, phase]) => {
      addPhaseEditorRow(pkey, phase.label, phase.color, pkey === mod.lastPhase);
    });
  } else {
    // Fluxo novo: começa com 3 fases de exemplo
    addPhaseEditorRow('pendente',    'Pendente',    '#F59E0B', false);
    addPhaseEditorRow('em_andamento','Em Andamento','#3B82F6', false);
    addPhaseEditorRow('concluido',   'Concluido',   '#10B981', true);
  }

  overlay.classList.add('open');
  setTimeout(() => document.getElementById('fluxoInputNome').focus(), 60);
}

function closeFluxoModal() {
  const overlay = document.getElementById('fluxoModalOverlay');
  if (overlay) overlay.classList.remove('open');
  _editingFluxoKey = null;
}

function addPhaseEditorRow(phaseKey, phaseLabel, phaseColor, isLast) {
  phaseKey   = phaseKey   || ('fase_' + Date.now().toString(36));
  phaseLabel = phaseLabel || '';
  phaseColor = phaseColor || '#3B82F6';
  isLast     = !!isLast;

  const list = document.getElementById('phasesEditorList');
  const row  = document.createElement('div');
  row.className = 'phase-editor-row';
  row.dataset.phaseKey = phaseKey;
  row.innerHTML = `
    <input type="color" class="phase-color-pick" value="${phaseColor}" title="Cor da fase" />
    <input type="text" class="form-input phase-name-input"
      placeholder="Nome da fase..." value="${phaseLabel}" />
    <label class="phase-last-label" title="Marcar como fase final">
      <input type="radio" name="fluxoLastPhase" value="${phaseKey}" ${isLast ? 'checked' : ''} />
      <span class="phase-last-check ${isLast ? 'checked' : ''}">Final</span>
    </label>
    <button class="btn-icon-sm btn-icon-danger phase-del-btn" type="button" title="Remover fase">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>`;

  // Atualiza visual do radio ao clicar
  row.querySelector('input[type="radio"]').addEventListener('change', function() {
    document.querySelectorAll('#phasesEditorList .phase-last-check').forEach(s => s.classList.remove('checked'));
    if (this.checked) this.closest('label').querySelector('.phase-last-check').classList.add('checked');
  });

  // Sincroniza phaseKey com radio quando nome muda (para fluxos novos)
  row.querySelector('.phase-name-input').addEventListener('input', function() {
    if (!_editingFluxoKey) {
      const newKey = this.value.toLowerCase().trim()
        .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || phaseKey;
      row.dataset.phaseKey = newKey;
      row.querySelector('input[type="radio"]').value = newKey;
    }
  });

  list.appendChild(row);
}

function saveFluxo() {
  const nome  = document.getElementById('fluxoInputNome').value.trim();
  const short = document.getElementById('fluxoInputShort').value.trim();
  const btn   = document.getElementById('fluxoInputBtn').value.trim();

  if (!nome || !short) {
    showToast('Preencha o nome completo e o rotulo curto', 'warn'); return;
  }

  // Coleta as fases do editor
  const rows = document.querySelectorAll('#phasesEditorList .phase-editor-row');
  if (!rows.length) { showToast('Adicione ao menos uma fase ao fluxo', 'warn'); return; }

  const fases = {};
  let lastPhase = '';
  const checkedRadio = document.querySelector('#phasesEditorList input[type="radio"]:checked');

  rows.forEach(row => {
    const key   = row.dataset.phaseKey;
    const label = row.querySelector('.phase-name-input').value.trim();
    const color = row.querySelector('.phase-color-pick').value;
    if (!label) return;
    const safeKey = key || label.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    fases[safeKey] = { label, color, bg: shadeColor(color, 90) };
    const radio = row.querySelector('input[type="radio"]');
    if (radio && radio.checked) lastPhase = safeKey;
  });

  if (!Object.keys(fases).length) { showToast('Adicione ao menos uma fase com nome', 'warn'); return; }
  if (!lastPhase) lastPhase = Object.keys(fases).at(-1);

  if (_editingFluxoKey) {
    // Editar fluxo existente
    MODULES[_editingFluxoKey].label      = nome;
    MODULES[_editingFluxoKey].shortLabel = short;
    MODULES[_editingFluxoKey].btnLabel   = btn || 'Novo Item';
    MODULES[_editingFluxoKey].fases      = fases;
    MODULES[_editingFluxoKey].lastPhase  = lastPhase;
    showToast(`Fluxo "${nome}" atualizado com sucesso`, 'success');
    refreshSidebarNav();
  } else {
    // Criar novo fluxo
    const newKey = nome.toLowerCase().trim()
      .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')
      .substring(0, 24) || ('fluxo_' + Date.now().toString(36));
    if (MODULES[newKey]) {
      showToast('Ja existe um fluxo com esse nome. Tente um nome diferente.', 'warn'); return;
    }
    MODULES[newKey] = {
      label: nome, shortLabel: short,
      btnLabel: btn || 'Novo Item',
      hasFinancial: false,
      categorias: ['Geral', 'Outros'],
      fases, lastPhase,
    };
    showToast(`Fluxo "${nome}" criado com sucesso!`, 'success');
    refreshSidebarNav();
  }

  closeFluxoModal();
  renderSettingsPanel('fluxos');
  saveModulesData(); // Persiste no PostgreSQL
}

function confirmDeleteFluxo(key) {
  const mod = MODULES[key];
  if (!mod) return;
  const cardsInModule = allCards.filter(c => c.modulo === key).length;
  const msg = cardsInModule > 0
    ? `Excluir o fluxo "${mod.label}"?\n\nAVISO: ${cardsInModule} card(s) serao removidos junto com o fluxo.`
    : `Excluir o fluxo "${mod.label}"? Esta acao nao pode ser desfeita.`;

  if (!confirm(msg)) return;
  delete MODULES[key];
  allCards = allCards.filter(c => c.modulo !== key);
  persistCards();
  saveModulesData(); // Persiste no PostgreSQL
  refreshSidebarNav();
  renderSettingsPanel('fluxos');
  showToast(`Fluxo "${mod.label}" removido`, 'success');
}

function refreshSidebarNav() {
  // Recria os itens de nav do sidebar baseado no MODULES atual
  // A seção de fluxos é a segunda .nav-section (a primeira é FINANCEIRO/highlight)
  const navSections = document.querySelectorAll('.sidebar-nav .nav-section');
  const navSection = navSections[1] || navSections[0]; // Seção "FLUXOS"
  if (!navSection) return;

  // Remove itens antigos de fluxos (data-module que esteja em MODULES ou orphan)
  navSection.querySelectorAll('.nav-item[data-module]').forEach(el => el.remove());

  // Reconstrói na ordem atual de MODULES
  Object.entries(MODULES).forEach(([key, mod]) => {
    const a = document.createElement('a');
    a.href = '#' + key;
    a.className = 'nav-item' + (state.currentModule === key ? ' active' : '');
    a.dataset.module = key;
    a.innerHTML = `
      <span class="nav-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="2" width="3" height="12" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="6" y="2" width="3" height="12" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="11" y="2" width="3" height="12" rx="1" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </span>
      <span class="nav-text">${mod.shortLabel}</span>
      <span class="nav-badge" id="badge-${key}">0</span>`;
    a.addEventListener('click', e => {
      e.preventDefault();
      history.pushState(null, '', '#' + key);
      switchModule(key);
    });
    navSection.appendChild(a);
  });

  renderNavBadges();
}

/* ──────────────────────────────────────────────────────────
   PAINEL: ETIQUETAS
────────────────────────────────────────────────────────── */
function buildPanelEtiquetas() {
  const chips = settingsData.etiquetas.map(et => `
    <div class="etiqueta-chip" style="background:${et.cor}">
      ${et.nome}
      <span class="etiqueta-chip-del" data-action="del-etiqueta" data-id="${et.id}" title="Remover">&#x2715;</span>
    </div>`).join('');

  return `
    <div class="settings-panel-header">
      <div>
        <h2>Etiquetas</h2>
        <p>Crie tags coloridas para categorizar e filtrar cards rapidamente</p>
      </div>
    </div>
    <div class="settings-card">
      <div class="etiquetas-grid" id="etiquetasGrid">
        ${chips || '<span style="color:var(--quadro-muted);font-size:13px">Nenhuma etiqueta criada.</span>'}
      </div>
      <div class="etiqueta-form-row">
        <input type="text" class="form-input" id="etiquetaInputNome"
          placeholder="Nome da etiqueta..." maxlength="24"
          style="max-width:220px"/>
        <input type="color" class="etiqueta-color-picker" id="etiquetaInputCor"
          value="#3B82F6" title="Escolher cor" />
        <button class="btn-primary" id="addEtiquetaBtn">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Adicionar
        </button>
      </div>
    </div>`;
}

function bindEtiquetasEvents() {
  document.getElementById('addEtiquetaBtn').addEventListener('click', addEtiqueta);
  document.getElementById('etiquetaInputNome').addEventListener('keydown', e => {
    if (e.key === 'Enter') addEtiqueta();
  });
  document.getElementById('etiquetasGrid').addEventListener('click', e => {
    const del = e.target.closest('[data-action="del-etiqueta"]');
    if (!del) return;
    const { id } = del.dataset;
    settingsData.etiquetas = settingsData.etiquetas.filter(et => et.id !== id);
    saveSettingsData('etiquetas');
    renderSettingsPanel('etiquetas');
    showToast('Etiqueta removida', 'success');
  });
}

function addEtiqueta() {
  const nome = document.getElementById('etiquetaInputNome').value.trim();
  const cor  = document.getElementById('etiquetaInputCor').value;
  if (!nome) { showToast('Digite um nome para a etiqueta', 'warn'); return; }
  const id = 'et' + Date.now();
  settingsData.etiquetas.push({ id, nome, cor });
  saveSettingsData('etiquetas');
  renderSettingsPanel('etiquetas');
  showToast(`Etiqueta "${nome}" criada`, 'success');
}

/* ──────────────────────────────────────────────────────────
   PAINEL: APARENCIA
────────────────────────────────────────────────────────── */
function buildPanelAparencia() {
  const { corPrimaria, nomeExibicao, logo } = settingsData.aparencia;
  const swatches = CORES_PALETTE.map(c => `
    <div class="color-swatch ${c === corPrimaria ? 'selected' : ''}"
      data-cor="${c}" style="background:${c}" title="${c}"></div>`).join('');

  const logoContent = logo
    ? `<img src="${logo}" alt="Logo" style="width:100%;height:100%;object-fit:contain" />`
    : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.5"/>
        <path d="M3 9h18M9 21V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span style="font-size:10px;color:var(--quadro-faint);margin-top:4px">Logo</span>`;

  return `
    <div class="settings-panel-header">
      <div>
        <h2>Aparencia</h2>
        <p>Personalize a identidade visual do sistema</p>
      </div>
    </div>

    <div class="aparencia-section">
      <p class="aparencia-section-title">Logo do Sistema</p>
      <div class="logo-upload-area">
        <label class="logo-preview-box" for="logoFileInput" title="Clique para trocar a logo">
          ${logoContent}
        </label>
        <div>
          <p style="font-size:13px;font-weight:600;margin-bottom:4px">Imagem da logo</p>
          <p class="logo-upload-hint">PNG ou SVG recomendado &middot; Proporcao quadrada &middot; Max. 2 MB</p>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn-secondary" style="font-size:12px" onclick="document.getElementById('logoFileInput').click()">
              Escolher arquivo
            </button>
            ${logo ? `<button class="btn-secondary" style="font-size:12px;color:var(--danger)" id="removeLogoBtn">Remover</button>` : ''}
          </div>
        </div>
      </div>
      <input type="file" id="logoFileInput" accept="image/*" style="display:none" />
    </div>

    <div class="aparencia-section">
      <p class="aparencia-section-title">Nome do Sistema</p>
      <div class="aparencia-input-row">
        <input type="text" class="form-input" id="nomeExibicaoInput"
          value="${nomeExibicao}" placeholder="Ex: Central Ops" maxlength="30" />
        <div class="aparencia-preview-badge" id="nomePreviewBadge"
          style="background:${corPrimaria}22;color:${corPrimaria};border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:6px">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect width="14" height="14" rx="4" fill="${corPrimaria}"/>
            <path d="M3 7h4M9 5h2M3 9h6" stroke="white" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          ${nomeExibicao}
        </div>
        <button class="btn-primary" id="saveNomeBtn">Salvar</button>
      </div>
    </div>

    <div class="aparencia-section">
      <p class="aparencia-section-title">Cor Principal</p>
      <div class="color-picker-row">
        <div class="color-swatch-options" id="colorSwatchGrid">${swatches}</div>
        <input type="color" class="fluxo-phase-color-input" id="customColorInput"
          value="${corPrimaria}" title="Cor personalizada" style="margin-left:8px;width:36px;height:36px" />
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;align-items:center">
        <div id="colorPreviewBadge"
          style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;background:${corPrimaria};color:white;font-size:12px;font-weight:600">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="white" stroke-width="1.5"/>
          </svg>
          Cor selecionada
        </div>
        <button class="btn-primary" id="saveCorBtn">Aplicar Cor</button>
      </div>
    </div>

    <div class="aparencia-section">
      <p class="aparencia-section-title">Tema da Interface</p>
      <div class="theme-toggle-row" id="themeToggleRow">
        <button class="theme-btn ${document.documentElement.dataset.theme !== 'dark' ? 'theme-btn--active' : ''}" data-theme="light">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="4" stroke="currentColor" stroke-width="1.5"/>
            <path d="M9 1.5v1.5M9 15v1.5M1.5 9H3M15 9h1.5M3.7 3.7l1.1 1.1M13.2 13.2l1.1 1.1M14.3 3.7l-1.1 1.1M4.8 13.2l-1.1 1.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Modo Claro
        </button>
        <button class="theme-btn ${document.documentElement.dataset.theme === 'dark' ? 'theme-btn--active' : ''}" data-theme="dark">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M15.5 10.5A7 7 0 1 1 7.5 2.5a5.5 5.5 0 0 0 8 8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Modo Escuro
        </button>
      </div>
    </div>`;
}

function bindAparenciaEvents() {
  document.getElementById('logoFileInput').addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Arquivo muito grande (max. 2 MB)', 'warn'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      settingsData.aparencia.logo = ev.target.result;
      saveSettingsData('aparencia');
      renderSettingsPanel('aparencia');
      showToast('Logo atualizada com sucesso', 'success');
    };
    reader.readAsDataURL(file);
  });

  const removeLogoBtn = document.getElementById('removeLogoBtn');
  if (removeLogoBtn) {
    removeLogoBtn.addEventListener('click', () => {
      settingsData.aparencia.logo = null;
      saveSettingsData('aparencia');
      renderSettingsPanel('aparencia');
      showToast('Logo removida', 'success');
    });
  }

  document.getElementById('saveNomeBtn').addEventListener('click', () => {
    const val = document.getElementById('nomeExibicaoInput').value.trim();
    if (!val) { showToast('Digite um nome valido', 'warn'); return; }
    settingsData.aparencia.nomeExibicao = val;
    saveSettingsData('aparencia');
    const logoNameEl = document.querySelector('.logo-name');
    if (logoNameEl) logoNameEl.textContent = val;
    renderSettingsPanel('aparencia');
    showToast('Nome atualizado com sucesso', 'success');
  });

  document.getElementById('nomeExibicaoInput').addEventListener('input', function() {
    const badge = document.getElementById('nomePreviewBadge');
    if (badge) {
      const svgFill = settingsData.aparencia.corPrimaria;
      badge.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect width="14" height="14" rx="4" fill="${svgFill}"/>
          <path d="M3 7h4M9 5h2M3 9h6" stroke="white" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        ${this.value || 'Previa'}`;
    }
  });

  document.getElementById('colorSwatchGrid').addEventListener('click', e => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    document.querySelectorAll('#colorSwatchGrid .color-swatch').forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
    const cor = swatch.dataset.cor;
    document.getElementById('customColorInput').value = cor;
    updateColorPreview(cor);
  });

  document.getElementById('customColorInput').addEventListener('input', function() {
    document.querySelectorAll('#colorSwatchGrid .color-swatch').forEach(s => s.classList.remove('selected'));
    updateColorPreview(this.value);
  });

  document.getElementById('saveCorBtn').addEventListener('click', () => {
    const cor = document.getElementById('customColorInput').value;
    settingsData.aparencia.corPrimaria = cor;
    document.documentElement.style.setProperty('--accent',       cor);
    document.documentElement.style.setProperty('--accent-hover', shadeColor(cor, -15));
    document.documentElement.style.setProperty('--accent-light', shadeColor(cor, 85));
    saveSettingsData('aparencia');
    showToast('Cor principal aplicada ao sistema', 'success');
    renderSettingsPanel('aparencia');
  });

  /* ── Tema claro / escuro ── */
  document.getElementById('themeToggleRow').addEventListener('click', e => {
    const btn = e.target.closest('.theme-btn');
    if (!btn) return;
    applyTheme(btn.dataset.theme);
    renderSettingsPanel('aparencia');
    showToast(btn.dataset.theme === 'dark' ? 'Modo escuro ativado' : 'Modo claro ativado', 'success');
  });
}

function updateColorPreview(cor) {
  const badge = document.getElementById('colorPreviewBadge');
  if (badge) badge.style.background = cor;
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + Math.round(percent * 2.55)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(percent * 2.55)));
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(percent * 2.55)));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/* ── Tema claro / escuro ── */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('ped_theme', theme); } catch(_) {}
  // Persiste no PostgreSQL
  apiRequest('PUT', '/api/settings/theme', theme).catch(err => {
    console.warn('[Settings API] Falha ao salvar theme:', err.message);
  });
}
/* Aplica tema salvo ao carregar (localStorage como fallback rápido) */
(function() {
  const saved = localStorage.getItem('ped_theme');
  if (saved) document.documentElement.dataset.theme = saved;
})();

/* ══════════════════════════════════════════════════════════
   PAINEL: USUÁRIOS
══════════════════════════════════════════════════════════ */

const PERFIS = {
  admin:        { label:'Administrador', cor:'#3B82F6', desc:'Acesso total ao sistema e às configurações' },
  gestor:       { label:'Gestor',        cor:'#8B5CF6', desc:'Acesso total aos módulos, sem configurações' },
  financeiro:   { label:'Financeiro',    cor:'#F59E0B', desc:'Acesso aos módulos financeiros: Contas a Pagar/Receber, Compras, Pagamentos' },
  pedagogico:   { label:'Pedagógico',    cor:'#EC4899', desc:'Acesso a Processos, RH e Solicitações Administrativas' },
  ti:           { label:'T.I.',          cor:'#6366F1', desc:'Acesso ao módulo de T.I. e suporte técnico' },
  operador:     { label:'Operador',      cor:'#10B981', desc:'Cria, edita e move cards em módulos permitidos' },
  visualizador: { label:'Visualizador',  cor:'#94A3B8', desc:'Somente leitura em módulos liberados' },
};

/* ── Matriz de permissões padrão por perfil ─────────────────
   Formato: { modulo: ['ver','criar','editar','mover','excluir'] }
   '*' = todos os módulos
   Carregado de settingsData.permissoes se customizado. ────── */
const DEFAULT_PERM_MATRIX = {
  admin: {
    '*': ['ver','criar','editar','mover','excluir'],
  },
  gestor: {
    '*': ['ver','criar','editar','mover'],
  },
  financeiro: {
    contas_pagar:       ['ver','criar','editar','mover'],
    contas_receber:     ['ver','criar','editar','mover'],
    compras:            ['ver','criar','editar','mover'],
    central_pagamentos: ['ver','criar'],
    chat_financeiro:    ['ver','criar'],
    dashboard:          ['ver'],
    relatorios:         ['ver'],
  },
  pedagogico: {
    processos:         ['ver','criar','editar','mover'],
    recursos_humanos:  ['ver','criar','editar','mover'],
    solicitacoes:      ['ver','criar','editar'],
    dashboard:         ['ver'],
  },
  ti: {
    ti:          ['ver','criar','editar','mover','excluir'],
    solicitacoes:['ver'],
    dashboard:   ['ver'],
  },
  operador: {
    '*': ['ver','criar','editar','mover'],
  },
  visualizador: {
    '*': ['ver'],
  },
};

let _editingUserId = null;

/* ══════════════════════════════════════════════════════════
   PERMISSÕES GRANULARES — catálogo e defaults por papel
══════════════════════════════════════════════════════════ */
const GRANULAR_PERMS = [
  { key:'pode_excluir_tarefas',  label:'Pode excluir tarefas',               desc:'Permite deletar cards de qualquer fase' },
  { key:'pode_convidar',         label:'Pode convidar outros usuários',       desc:'Permite enviar convites para novos membros' },
  { key:'pode_ver_financeiro',   label:'Pode ver relatórios financeiros',     desc:'Acesso aos dashboards e relatórios com valores' },
  { key:'pode_exportar',         label:'Pode exportar dados',                 desc:'Permite baixar listas e relatórios em CSV/PDF' },
  { key:'pode_editar_fluxos',    label:'Pode editar configurações de fluxos', desc:'Alterar fases, categorias e campos dos módulos' },
  { key:'pode_gerenciar_equipe', label:'Pode gerenciar equipe',               desc:'Adicionar, editar e remover usuários' },
];

const GRANULAR_DEFAULTS = {
  admin:        ['pode_excluir_tarefas','pode_convidar','pode_ver_financeiro','pode_exportar','pode_editar_fluxos','pode_gerenciar_equipe'],
  gestor:       ['pode_excluir_tarefas','pode_convidar','pode_ver_financeiro','pode_exportar'],
  financeiro:   ['pode_ver_financeiro','pode_exportar'],
  pedagogico:   ['pode_exportar'],
  ti:           ['pode_excluir_tarefas','pode_editar_fluxos'],
  operador:     [],
  visualizador: [],
};

function applyGranularDefaults(perfil) {
  const defaults = GRANULAR_DEFAULTS[perfil] || [];
  document.querySelectorAll('.granular-cb').forEach(cb => {
    cb.checked = defaults.includes(cb.value);
  });
}

function buildPanelUsuarios() {
  const total  = settingsData.usuarios.length;
  const ativos = settingsData.usuarios.filter(u => u.ativo).length;

  /* ── Linhas da tabela ── */
  const rows = settingsData.usuarios.map(u => {
    const perfil   = PERFIS[u.perfil] || PERFIS.visualizador;
    const initials = u.nome.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase();
    const escolasNome = (u.escolas || [])
      .map(id => { const e = settingsData.escolas.find(s => s.id === id); return e ? e.sigla : id; })
      .join(', ') || '—';
    const statusClass = u.ativo ? 'team-status-badge--active' : 'team-status-badge--inactive';
    const statusLabel = u.ativo ? 'Ativo' : 'Inativo';

    return `
    <tr class="team-tr ${u.ativo ? '' : 'team-tr--inactive'}" data-id="${escHtml(u.id)}">
      <td class="team-td">
        <div class="team-user-cell">
          <div class="team-avatar" style="background:${escHtml(perfil.cor)}">${escHtml(initials)}</div>
          <div class="team-user-info">
            <span class="team-user-nome">${escHtml(u.nome)}</span>
            <span class="team-user-email">${escHtml(u.email)}</span>
          </div>
        </div>
      </td>
      <td class="team-td">
        <span class="team-role-badge" style="background:${escHtml(perfil.cor)}18;color:${escHtml(perfil.cor)};border:1px solid ${escHtml(perfil.cor)}35">${escHtml(perfil.label)}</span>
      </td>
      <td class="team-td">
        <span class="team-status-badge ${statusClass}">
          <span class="team-status-dot"></span>${statusLabel}
        </span>
      </td>
      <td class="team-td">
        <span class="team-schools-chip">${escHtml(escolasNome)}</span>
      </td>
      <td class="team-td team-td--actions">
        <div class="team-actions">
          <button class="team-action-btn" data-action="edit-usuario" data-id="${escHtml(u.id)}" title="Editar">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9.5 1.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Editar
          </button>
          <button class="team-action-btn team-action-btn--danger" data-action="del-usuario" data-id="${escHtml(u.id)}" title="Excluir">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3.5h9M5 3.5V2h3v1.5M3 3.5l.8 7h5.4l.8-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            Excluir
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  /* ── Checkboxes de escolas ── */
  const escolaCheckboxes = settingsData.escolas.map(e => `
    <label class="user-escola-check">
      <input type="checkbox" name="usr-escola" value="${escHtml(e.id)}">
      <span class="user-escola-check-dot" style="background:${e.cor}"></span>
      ${escHtml(e.nome)}
    </label>`).join('');

  /* ── Options do select de perfil ── */
  const perfilOptions = Object.entries(PERFIS).map(([key, p]) =>
    `<option value="${key}">${p.label} — ${p.desc}</option>`
  ).join('');

  /* ── Checkboxes granulares ── */
  const granularCheckboxes = GRANULAR_PERMS.map(gp => `
    <label class="granular-perm-item">
      <div class="granular-perm-check-wrap">
        <input type="checkbox" class="granular-cb" name="granular-perm" value="${escHtml(gp.key)}">
        <span class="granular-cb-custom"></span>
      </div>
      <div class="granular-perm-text">
        <span class="granular-perm-label">${escHtml(gp.label)}</span>
        <span class="granular-perm-desc">${escHtml(gp.desc)}</span>
      </div>
    </label>`).join('');

  return `
    <div class="settings-panel-header">
      <div>
        <h2>Equipe &amp; Permissões</h2>
        <p>Gerencie membros e níveis de acesso — ${ativos} ativo${ativos !== 1 ? 's' : ''} de ${total}</p>
      </div>
      <button class="btn-primary" id="addUsuarioBtn">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 1.5v10M1.5 6.5h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Convidar Usuário
      </button>
    </div>

    <!-- Filtros -->
    <div class="team-filter-row">
      <div class="team-search-wrap">
        <svg class="team-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.4"/>
          <path d="M10 10l2.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <input type="text" id="userSearchInput" class="team-search-input" placeholder="Buscar por nome ou e-mail…" autocomplete="new-password" name="ped-user-search">
      </div>
      <select id="userPerfilFilter" class="team-perfil-filter">
        <option value="">Todos os papéis</option>
        ${Object.entries(PERFIS).map(([k,p]) => `<option value="${k}">${p.label}</option>`).join('')}
      </select>
    </div>

    <!-- Tabela de usuários -->
    <div class="settings-card team-table-wrap">
      <table class="team-table">
        <thead>
          <tr>
            <th class="team-th">Usuário</th>
            <th class="team-th">Papel</th>
            <th class="team-th">Status</th>
            <th class="team-th">Escolas</th>
            <th class="team-th" style="text-align:right">Ações</th>
          </tr>
        </thead>
        <tbody id="teamTableBody">
          ${rows || `<tr><td colspan="5" class="team-empty-row">Nenhum usuário cadastrado.</td></tr>`}
        </tbody>
      </table>
    </div>

    <!-- ── Modal: Convidar / Editar Usuário ── -->
    <div class="escola-modal-overlay" id="userModalOverlay">
      <div class="invite-modal">

        <div class="invite-modal-header">
          <div>
            <h3 id="userModalTitle">Convidar Usuário</h3>
            <p class="invite-modal-subtitle" id="userModalSubtitle">Preencha os dados e escolha o nível de acesso</p>
          </div>
          <button class="escola-modal-close" id="userModalClose">&times;</button>
        </div>

        <div class="invite-modal-body">

          <!-- Dados pessoais -->
          <div class="invite-section">
            <h4 class="invite-section-title">Dados do usuário</h4>
            <div class="invite-fields-grid">
              <div class="form-group">
                <label class="form-label">Nome completo *</label>
                <input type="text" id="userNomeInput" class="form-input" placeholder="Ex: Maria Silva" autocomplete="off">
              </div>
              <div class="form-group">
                <label class="form-label">E-mail corporativo *</label>
                <input type="text" id="userEmailInput" class="form-input" placeholder="maria@grupoped.com.br" autocomplete="off">
              </div>
            </div>
          </div>

          <!-- Papel / Role -->
          <div class="invite-section">
            <h4 class="invite-section-title">Nível de acesso</h4>
            <div class="form-group">
              <label class="form-label">Papel no sistema *</label>
              <select id="userPerfilInput" class="form-input">${perfilOptions}</select>
              <p class="invite-role-hint" id="userPerfilHint"></p>
            </div>
            <!-- Role cards visuais -->
            <div class="role-cards-row">
              <div class="role-card" data-role="admin">
                <div class="role-card-icon" style="background:#8B5CF620">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="2.5" stroke="#8B5CF6" stroke-width="1.4"/><path d="M3 13c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="#8B5CF6" stroke-width="1.4" stroke-linecap="round"/><path d="M11 8l1.5 1.5M11 11l1.5-1.5" stroke="#8B5CF6" stroke-width="1.2" stroke-linecap="round"/></svg>
                </div>
                <div class="role-card-label">Administrador</div>
                <div class="role-card-desc">Acesso total ao sistema</div>
              </div>
              <div class="role-card" data-role="gestor">
                <div class="role-card-icon" style="background:#3B82F620">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="2" stroke="#3B82F6" stroke-width="1.4"/><path d="M5 7h6M5 10h4" stroke="#3B82F6" stroke-width="1.4" stroke-linecap="round"/></svg>
                </div>
                <div class="role-card-label">Gestor / Membro</div>
                <div class="role-card-desc">Cria, edita e aprova</div>
              </div>
              <div class="role-card" data-role="visualizador">
                <div class="role-card-icon" style="background:#64748B20">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1.5 8s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5-6.5-5-6.5-5z" stroke="#64748B" stroke-width="1.4"/><circle cx="8" cy="8" r="2" stroke="#64748B" stroke-width="1.4"/></svg>
                </div>
                <div class="role-card-label">Visualizador</div>
                <div class="role-card-desc">Somente leitura</div>
              </div>
            </div>
          </div>

          <!-- Permissões Granulares -->
          <div class="invite-section">
            <h4 class="invite-section-title">
              Permissões granulares
              <span class="invite-section-badge">Personalizar</span>
            </h4>
            <p class="invite-section-desc">Ative ou desative permissões independente do papel — sobrescrevem o padrão do role.</p>
            <div class="granular-perms-grid">
              ${granularCheckboxes}
            </div>
          </div>

          <!-- Escolas -->
          <div class="invite-section">
            <h4 class="invite-section-title">Escolas com acesso *</h4>
            <div class="user-escolas-checks">${escolaCheckboxes}</div>
          </div>

          <!-- Senha -->
          <div class="invite-section" id="userSenhaGroup">
            <h4 class="invite-section-title" id="userSenhaLabel">Senha de acesso *</h4>
            <div class="invite-password-row">
              <input type="password" id="userSenhaInput" class="form-input" placeholder="Mínimo 6 caracteres" autocomplete="new-password">
              <button type="button" id="userSenhaToggle" class="team-action-btn" title="Mostrar/ocultar senha" style="flex-shrink:0">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><ellipse cx="7" cy="7" rx="5" ry="3.5" stroke="currentColor" stroke-width="1.3"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>
              </button>
            </div>
            <p class="form-hint" id="userSenhaHint"></p>
          </div>

        </div><!-- /invite-modal-body -->

        <div class="invite-modal-footer">
          <button class="btn-secondary" id="userModalCancel">Cancelar</button>
          <button class="btn-primary" id="userModalSave">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7l3.5 3.5 5.5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span id="userModalSaveLabel">Convidar Usuário</span>
          </button>
        </div>

      </div><!-- /invite-modal -->
    </div><!-- /userModalOverlay -->`;
}

function bindUsuariosEvents() {
  /* Limpa busca — Chrome às vezes autofill */
  const _srch = document.getElementById('userSearchInput');
  if (_srch) { _srch.value = ''; }
  setTimeout(() => { const s = document.getElementById('userSearchInput'); if (s) { s.value = ''; filterUserList(); } }, 300);

  document.getElementById('addUsuarioBtn').addEventListener('click', () => openUserModal(null));
  document.getElementById('userSearchInput').addEventListener('input', filterUserList);
  document.getElementById('userPerfilFilter').addEventListener('change', filterUserList);
  document.getElementById('userModalClose').addEventListener('click', closeUserModal);
  document.getElementById('userModalCancel').addEventListener('click', closeUserModal);
  document.getElementById('userModalSave').addEventListener('click', saveUsuario);

  /* Select de perfil — atualiza hint e role cards */
  document.getElementById('userPerfilInput').addEventListener('change', function() {
    const perfil = PERFIS[this.value];
    document.getElementById('userPerfilHint').textContent = perfil ? perfil.desc : '';
    _syncRoleCard(this.value);
    applyGranularDefaults(this.value);
  });

  /* Role cards — clique seleciona o perfil correspondente */
  document.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', () => {
      const role = card.dataset.role;
      const sel  = document.getElementById('userPerfilInput');
      if (sel) sel.value = role;
      _syncRoleCard(role);
      const p = PERFIS[role];
      document.getElementById('userPerfilHint').textContent = p ? p.desc : '';
      applyGranularDefaults(role);
    });
  });

  /* Toggle visibilidade da senha */
  document.getElementById('userSenhaToggle').addEventListener('click', function() {
    const inp = document.getElementById('userSenhaInput');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  /* Validação em tempo real da senha */
  document.getElementById('userSenhaInput').addEventListener('input', function() {
    const hint = document.getElementById('userSenhaHint');
    const v = this.value;
    if (!v) { hint.textContent = ''; hint.style.color = ''; return; }
    if (v.length < 6) { hint.textContent = 'Mínimo de 6 caracteres'; hint.style.color = '#EF4444'; }
    else              { hint.textContent = '✓ Senha válida';          hint.style.color = '#10B981'; }
  });

  /* Ações da tabela (edit / delete) via delegação */
  const tbody = document.getElementById('teamTableBody');
  if (tbody) {
    tbody.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'edit-usuario') {
        openUserModal(id);
      } else if (btn.dataset.action === 'del-usuario') {
        const u = settingsData.usuarios.find(u => u.id === id);
        if (!u) return;
        if (!confirm(`Remover o usuário "${u.nome}"? Esta ação não pode ser desfeita.`)) return;
        settingsData.usuarios = settingsData.usuarios.filter(u => u.id !== id);
        removeFromLoginUsers(id);
        saveUsuariosData();
        renderSettingsPanel('usuarios');
        showToast('Usuário removido.', 'success');
      }
    });
  }

  /* Fechar modal ao clicar no backdrop */
  document.getElementById('userModalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('userModalOverlay')) closeUserModal();
  });
}

/* Sincroniza destaque visual dos role cards com o valor selecionado */
function _syncRoleCard(role) {
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('role-card--selected'));
  const match = document.querySelector(`.role-card[data-role="${role}"]`);
  if (match) match.classList.add('role-card--selected');
}

function openUserModal(id) {
  _editingUserId = id;
  const overlay = document.getElementById('userModalOverlay');

  /* Reset geral */
  document.getElementById('userNomeInput').value   = '';
  document.getElementById('userEmailInput').value  = '';
  document.getElementById('userSenhaInput').value  = '';
  document.getElementById('userSenhaInput').type   = 'password';
  document.getElementById('userSenhaHint').textContent = '';
  document.getElementById('userSenhaHint').style.color = '';
  document.getElementById('userPerfilInput').value = 'operador';
  document.getElementById('userPerfilHint').textContent = PERFIS.operador?.desc || '';
  document.querySelectorAll('input[name="usr-escola"]').forEach(cb => cb.checked = false);
  _syncRoleCard('operador');
  applyGranularDefaults('operador');

  if (id) {
    /* ── Modo edição ── */
    const u = settingsData.usuarios.find(u => u.id === id);
    if (!u) return;
    document.getElementById('userModalTitle').textContent      = 'Editar Usuário';
    document.getElementById('userModalSubtitle').textContent   = 'Atualize os dados e permissões do membro';
    document.getElementById('userModalSaveLabel').textContent  = 'Salvar Alterações';
    document.getElementById('userSenhaLabel').textContent      = 'Nova senha (deixe em branco para manter)';
    document.getElementById('userSenhaInput').placeholder      = 'Somente se quiser alterar';
    document.getElementById('userNomeInput').value   = u.nome;
    document.getElementById('userEmailInput').value  = u.email;
    document.getElementById('userPerfilInput').value = u.perfil;
    document.getElementById('userPerfilHint').textContent = PERFIS[u.perfil]?.desc || '';
    _syncRoleCard(u.perfil);
    /* Escolas */
    (u.escolas || []).forEach(eid => {
      const cb = document.querySelector(`input[name="usr-escola"][value="${eid}"]`);
      if (cb) cb.checked = true;
    });
    /* Permissões granulares salvas ou defaults do perfil */
    const granular = u.permissoesGranulares || GRANULAR_DEFAULTS[u.perfil] || [];
    document.querySelectorAll('.granular-cb').forEach(cb => {
      cb.checked = granular.includes(cb.value);
    });
  } else {
    /* ── Modo convite ── */
    document.getElementById('userModalTitle').textContent      = 'Convidar Usuário';
    document.getElementById('userModalSubtitle').textContent   = 'Preencha os dados e escolha o nível de acesso';
    document.getElementById('userModalSaveLabel').textContent  = 'Convidar Usuário';
    document.getElementById('userSenhaLabel').textContent      = 'Senha de acesso *';
    document.getElementById('userSenhaInput').placeholder      = 'Mínimo 6 caracteres';
    document.querySelectorAll('input[name="usr-escola"]').forEach(cb => cb.checked = true);
  }

  overlay.classList.add('open');
  document.getElementById('userNomeInput').focus();
}

function closeUserModal() {
  document.getElementById('userModalOverlay').classList.remove('open');
  _editingUserId = null;
}

/* ── Helpers de sincronização usuário ↔ login ── */
function getPermissoesByPerfil(perfil) {
  const all = ['ver','criar','editar','aprovar'];
  const maps = {
    admin:        { solicitacoes:all, contas_pagar:all, contas_receber:all, compras:all, processos:all, ti:all, central_pagamentos:all, comercial:all },
    gestor:       { solicitacoes:all, contas_pagar:['ver','aprovar'], contas_receber:['ver','aprovar'], compras:['ver','criar','aprovar'], processos:all, ti:['ver','criar'], central_pagamentos:['ver'], comercial:all },
    operador:     { solicitacoes:['ver','criar','editar'], contas_pagar:['ver','criar'], contas_receber:['ver','criar'], compras:['ver','criar','editar'], processos:['ver','criar','editar'], ti:['ver','criar'], central_pagamentos:[], comercial:['ver','criar','editar'] },
    visualizador: { solicitacoes:['ver'], contas_pagar:['ver'], contas_receber:['ver'], compras:['ver'], processos:['ver'], ti:['ver'], central_pagamentos:[], comercial:['ver'] },
  };
  return maps[perfil] || maps.visualizador;
}

function syncToLoginUsers(u, senha) {
  const initials = u.nome.split(' ').slice(0,2).map(n => n[0]||'').join('').toUpperCase();
  const school   = (u.escolas||[]).length >= settingsData.escolas.length ? 'all' : (u.escolas[0]||'all');
  const role     = PERFIS[u.perfil]?.label || u.perfil;
  const perms    = getPermissoesByPerfil(u.perfil);

  // Sincroniza com tabela usuarios no backend via API
  apiRequest('PUT', `/api/usuarios/${u.id}`, {
    nome: u.nome, email: u.email, role, initials, school,
    active: u.ativo !== false,
    permissoes: perms,
    ...(senha ? { password: senha } : {}),
  }).catch(err => {
    // Se o user nao existe no backend, cria
    if (err.message.includes('nao encontrado')) {
      apiRequest('POST', '/api/register', {
        nome: u.nome, email: u.email, password: senha || 'mudar123',
        role, initials, school, permissoes: perms,
      }).catch(e => console.warn('[Usuarios] Falha ao criar no backend:', e.message));
    } else {
      console.warn('[Usuarios] Falha ao sync:', err.message);
    }
  });
}

function removeFromLoginUsers(id) {
  apiRequest('DELETE', `/api/usuarios/${id}`).catch(err => {
    console.warn('[Usuarios] Falha ao remover do backend:', err.message);
  });
}

function saveUsuariosData() {
  saveSettingsData('usuarios');
}

/* ══════════════════════════════════════════════════════════
   PAINEL: PERMISSÕES — Matrix perfil × módulo × ação
══════════════════════════════════════════════════════════ */

const PERM_ACTIONS = [
  { key:'ver',     label:'Ver',     icon:'👁' },
  { key:'criar',   label:'Criar',   icon:'＋' },
  { key:'editar',  label:'Editar',  icon:'✏' },
  { key:'mover',   label:'Mover',   icon:'↔' },
  { key:'excluir', label:'Excluir', icon:'🗑' },
];

const PERM_MODULES = Object.entries(MODULES)
  .filter(([k]) => !['dashboard','relatorios','agenda','configuracoes','chat_financeiro','central_pagamentos'].includes(k))
  .map(([k, m]) => ({ key: k, label: m.shortLabel || m.label }));

function buildPanelPermissoes() {
  const wrap = document.getElementById('permsMatrixWrap');
  if (!wrap) return;

  /* Merged matrix: defaults overridden by saved custom */
  const customMatrix = settingsData.permissoes || {};

  const html = Object.entries(PERFIS).map(([perfil, pDef]) => {
    const defaultPerms = DEFAULT_PERM_MATRIX[perfil] || { '*': ['ver'] };
    const customPerms  = customMatrix[perfil] || {};

    const moduleRows = PERM_MODULES.map(mod => {
      /* Resolve effective permissions for this profile + module */
      const effectiveDefault = defaultPerms[mod.key] || defaultPerms['*'] || [];
      const effective = customPerms[mod.key] !== undefined ? customPerms[mod.key] : effectiveDefault;

      const checkboxes = PERM_ACTIONS.map(action => {
        const checked = effective.includes(action.key);
        return `<label class="perm-check" title="${action.label}">
          <input type="checkbox" class="perm-cb"
                 data-perfil="${perfil}"
                 data-module="${mod.key}"
                 data-action="${action.key}"
                 ${checked ? 'checked' : ''} />
          <span class="perm-cb-label">${action.icon}</span>
        </label>`;
      }).join('');

      return `<div class="perm-row">
        <span class="perm-mod-name">${escHtml(mod.label)}</span>
        <div class="perm-actions">${checkboxes}</div>
      </div>`;
    }).join('');

    return `<div class="perm-profile-card">
      <div class="perm-profile-header">
        <span class="perm-profile-dot" style="background:${pDef.cor}"></span>
        <span class="perm-profile-name">${escHtml(pDef.label)}</span>
        <span class="perm-profile-desc">${escHtml(pDef.desc)}</span>
        ${perfil === 'admin' ? '<span class="perm-admin-badge">Acesso total (fixo)</span>' : ''}
      </div>
      ${perfil === 'admin' ? '<div class="perm-admin-note">Administradores sempre têm acesso completo a todos os módulos.</div>' : `
      <div class="perm-header-row">
        <span class="perm-mod-name perm-col-header">Módulo</span>
        <div class="perm-actions">${PERM_ACTIONS.map(a => `<span class="perm-action-label" title="${a.label}">${a.icon}</span>`).join('')}</div>
      </div>
      <div class="perm-rows">${moduleRows}</div>
      `}
    </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="perm-intro">
      <p>Configure as permissões de cada perfil por módulo. As alterações são salvas automaticamente e aplicadas no próximo login.</p>
      <button class="perm-reset-btn" id="permResetBtn">↺ Restaurar padrões</button>
    </div>
    <div class="perm-profiles-list">${html}</div>`;

  /* Event: checkbox change */
  wrap.querySelectorAll('.perm-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const perfil = cb.getAttribute('data-perfil');
      const mod = cb.getAttribute('data-module');
      const action = cb.getAttribute('data-action');
      settingsData.permissoes = settingsData.permissoes || {};
      settingsData.permissoes[perfil] = settingsData.permissoes[perfil] || {};

      /* Get current custom state for this profile+module */
      const defaultBase = DEFAULT_PERM_MATRIX[perfil]?.[mod] || DEFAULT_PERM_MATRIX[perfil]?.['*'] || [];
      let current = settingsData.permissoes[perfil][mod] !== undefined
        ? [...settingsData.permissoes[perfil][mod]]
        : [...defaultBase];

      if (cb.checked) {
        if (!current.includes(action)) current.push(action);
      } else {
        current = current.filter(a => a !== action);
      }
      settingsData.permissoes[perfil][mod] = current;
      saveSettings('permissoes');
      showToast('Permissão atualizada', 'success');
    });
  });

  /* Reset button */
  const resetBtn = document.getElementById('permResetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      settingsData.permissoes = {};
      saveSettings('permissoes');
      buildPanelPermissoes();
      showToast('Permissões restauradas ao padrão', 'success');
    });
  }
}

function saveUsuario() {
  const nome   = document.getElementById('userNomeInput').value.trim();
  const email  = document.getElementById('userEmailInput').value.trim();
  const perfil = document.getElementById('userPerfilInput').value;
  const senha  = document.getElementById('userSenhaInput').value.trim();
  const escolas = [...document.querySelectorAll('input[name="usr-escola"]:checked')].map(cb => cb.value);
  /* Coleta permissões granulares marcadas */
  const permissoesGranulares = [...document.querySelectorAll('.granular-cb:checked')].map(cb => cb.value);

  if (!nome)    { showToast('Informe o nome do usuário.', 'error');   return; }
  if (!email)   { showToast('Informe o e-mail do usuário.', 'error'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('E-mail inválido.', 'error'); return; }
  if (!escolas.length) { showToast('Selecione ao menos uma escola.', 'error'); return; }

  if (_editingUserId) {
    const dup = settingsData.usuarios.find(u => u.email === email && u.id !== _editingUserId);
    if (dup) { showToast('Já existe um usuário com este e-mail.', 'error'); return; }
    if (senha && senha.length < 6) { showToast('A senha deve ter ao menos 6 caracteres.', 'error'); return; }
    const u = settingsData.usuarios.find(u => u.id === _editingUserId);
    if (!u) return;
    u.nome = nome; u.email = email; u.perfil = perfil; u.escolas = escolas;
    u.permissoesGranulares = permissoesGranulares;
    syncToLoginUsers(u, senha || null);
    saveUsuariosData();
    showToast('Usuário atualizado!', 'success');
  } else {
    if (!senha) { showToast('Informe uma senha para o novo usuário.', 'error'); return; }
    if (senha.length < 6) { showToast('A senha deve ter ao menos 6 caracteres.', 'error'); return; }
    const dup = settingsData.usuarios.find(u => u.email === email);
    if (dup) { showToast('Já existe um usuário com este e-mail.', 'error'); return; }
    const novoUsuario = {
      id: 'usr'+uid(), nome, email, perfil, escolas,
      permissoesGranulares, ativo:true,
      criadoEm: new Date().toISOString().slice(0,10),
    };
    settingsData.usuarios.push(novoUsuario);
    syncToLoginUsers(novoUsuario, senha);
    saveUsuariosData();
    showToast(`Convite enviado! Login: ${email}`, 'success');
  }
  closeUserModal();
  renderSettingsPanel('usuarios');
}

function filterUserList() {
  const search = (document.getElementById('userSearchInput')?.value || '').toLowerCase();
  const pf     = document.getElementById('userPerfilFilter')?.value || '';
  /* Suporte à nova tabela (.team-tr) e ao antigo formato (.user-item) */
  const items  = document.querySelectorAll('#teamTableBody .team-tr, .user-item');
  items.forEach(item => {
    const u = settingsData.usuarios.find(u => u.id === item.dataset.id);
    if (!u) return;
    const ok = (!search || u.nome.toLowerCase().includes(search) || u.email.toLowerCase().includes(search))
            && (!pf || u.perfil === pf);
    item.style.display = ok ? '' : 'none';
  });
}

/* ══════════════════════════════════════════════════════════
   CAMPO CONFIG — Configuração de campos por fluxo
══════════════════════════════════════════════════════════ */
const CAMPOS_CONFIG = {};

function getDefaultCampos(modKey) {
  if (CAMPOS_CONFIG[modKey]) return CAMPOS_CONFIG[modKey];
  const mod = MODULES[modKey];
  if (!mod) return { sistema: [], custom: [] };

  const base = [
    { id:'titulo',      label:'Título',          tipo:'text',     obrigatorio:true,  visivel:true },
    { id:'descricao',   label:'Descrição',        tipo:'textarea', obrigatorio:false, visivel:true },
    { id:'escola',      label:'Escola / Unidade', tipo:'select',   obrigatorio:true,  visivel:true },
    { id:'categoria',   label:'Categoria',        tipo:'select',   obrigatorio:false, visivel:true },
    { id:'prioridade',  label:'Prioridade',       tipo:'select',   obrigatorio:false, visivel:true },
    { id:'fase',        label:'Fase',             tipo:'select',   obrigatorio:false, visivel:true },
    { id:'responsavel', label:'Responsável',      tipo:'text',     obrigatorio:false, visivel:true },
    { id:'prazo',       label:'Prazo',            tipo:'date',     obrigatorio:false, visivel:true },
  ];

  if (mod.hasFinancial) {
    base.push(
      { id:'valor',      label:'Valor (R$)',                        tipo:'currency', obrigatorio:false, visivel:true },
      { id:'fornecedor', label: mod.fornecedorLabel || 'Fornecedor', tipo:'text',   obrigatorio:false, visivel:true },
      { id:'num_doc',    label: mod.numDocLabel    || 'Nº Documento',tipo:'text',   obrigatorio:false, visivel:true },
      { id:'vencimento', label:'Vencimento',                         tipo:'date',   obrigatorio:false, visivel:true }
    );
  }

  CAMPOS_CONFIG[modKey] = { sistema: base, custom: [] };
  return CAMPOS_CONFIG[modKey];
}

/* ── Campo editor sub-page ── */
function openCamposEditor(modKey) {
  state.settingsTab = '_campos_' + modKey;
  const config = getDefaultCampos(modKey);
  const mod    = MODULES[modKey];
  document.getElementById('settingsContent').innerHTML = buildCamposEditorHTML(modKey, mod, config);
  bindCamposEditorEvents(modKey);
}

const TIPO_LABELS = {
  text:'Texto curto', textarea:'Texto longo', select:'Seleção',
  date:'Data', currency:'Moeda (R$)', number:'Número', checkbox:'Checkbox'
};

function buildCamposEditorHTML(modKey, mod, config) {
  const sistemaCampos = config.sistema.map(campo => `
    <div class="campo-editor-row ${!campo.visivel ? 'campo-oculto' : ''}" data-id="${campo.id}">
      <label class="toggle-switch" title="${campo.visivel ? 'Ocultar campo' : 'Mostrar campo'}">
        <input type="checkbox" class="campo-visivel-chk" data-campo-id="${campo.id}"
          ${campo.visivel ? 'checked' : ''} ${campo.obrigatorio ? 'disabled' : ''} />
        <span class="toggle-slider"></span>
      </label>
      <span class="campo-nome">${campo.label}</span>
      <span class="campo-tipo-badge">${TIPO_LABELS[campo.tipo] || campo.tipo}</span>
      ${campo.obrigatorio ? '<span class="campo-req-badge">Obrigatório</span>' : ''}
      <div class="campo-actions">
        <button class="btn-icon-sm campo-rename-btn" data-campo-id="${campo.id}" title="Renomear">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 1.5l2.5 2.5-6 6H2v-2.5l6-6z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>`).join('');

  const customCampos = config.custom.length
    ? config.custom.map(campo => `
      <div class="campo-editor-row" data-id="${campo.id}">
        <label class="toggle-switch">
          <input type="checkbox" class="campo-visivel-chk" data-campo-id="${campo.id}" ${campo.visivel ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
        <span class="campo-nome">${campo.label}</span>
        <span class="campo-tipo-badge">${TIPO_LABELS[campo.tipo] || campo.tipo}</span>
        <div class="campo-actions">
          <button class="btn-icon-sm campo-edit-btn" data-campo-id="${campo.id}" title="Editar">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M8 1.5l2.5 2.5-6 6H2v-2.5l6-6z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="btn-icon-sm btn-icon-danger campo-del-btn" data-campo-id="${campo.id}" title="Excluir">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>`).join('')
    : '<p style="color:var(--gray-400);font-size:13px;padding:12px 0;margin:0">Nenhum campo personalizado criado ainda.</p>';

  return `
    <div class="campos-breadcrumb">
      <button class="btn-ghost campos-back-btn">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Fluxos
      </button>
      <span class="campos-breadcrumb-sep">›</span>
      <span class="campos-breadcrumb-item">${mod.label}</span>
      <span class="campos-breadcrumb-sep">›</span>
      <span class="campos-breadcrumb-item campos-breadcrumb-curr">Campos</span>
    </div>

    <div class="settings-panel-header" style="margin-bottom:20px">
      <div>
        <h2>Campos — ${mod.shortLabel}</h2>
        <p>Configure visibilidade, nomes e adicione campos personalizados para este fluxo</p>
      </div>
    </div>

    <div class="settings-card" style="margin-bottom:20px">
      <div class="campos-section-header">
        <strong>Campos do sistema</strong>
        <span style="color:var(--gray-400);font-size:12px">Apenas visibilidade e nome são editáveis</span>
      </div>
      <div class="campo-editor-list" id="sistemaCamposList">${sistemaCampos}</div>
    </div>

    <div class="settings-card">
      <div class="campos-section-header" style="margin-bottom:12px">
        <strong>Campos personalizados</strong>
        <button class="btn-primary" id="addCustomCampoBtn" style="font-size:12px;padding:6px 12px">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1.5v8M1.5 5.5h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          Novo Campo
        </button>
      </div>
      <div class="campo-editor-list" id="customCamposList">${customCampos}</div>
    </div>

    <!-- Modal: criar/editar campo personalizado -->
    <div class="escola-modal-overlay" id="campoModalOverlay">
      <div class="escola-modal" style="width:440px;max-width:calc(100vw - 32px)">
        <div class="escola-modal-header">
          <h3 id="campoModalTitle">Novo Campo</h3>
          <button class="btn-icon-sm" id="campoModalClose">&#x2715;</button>
        </div>
        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Nome do campo *</label>
          <input type="text" class="form-input" id="campoInputLabel" placeholder="Ex: Centro de Custo"/>
        </div>
        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Tipo *</label>
          <select class="form-input" id="campoInputTipo">
            <option value="text">Texto curto</option>
            <option value="textarea">Texto longo</option>
            <option value="number">Número</option>
            <option value="currency">Moeda (R$)</option>
            <option value="date">Data</option>
            <option value="select">Seleção (lista)</option>
            <option value="checkbox">Checkbox (sim/não)</option>
          </select>
        </div>
        <div class="form-group" id="campoOpcoesGroup" style="display:none;margin-bottom:14px">
          <label class="form-label">Opções — uma por linha *</label>
          <textarea class="form-input" id="campoInputOpcoes" rows="4"
            placeholder="Opção 1&#10;Opção 2&#10;Opção 3"></textarea>
        </div>
        <div class="escola-modal-footer">
          <button class="btn-secondary" id="campoModalCancel">Cancelar</button>
          <button class="btn-primary" id="campoModalSave">Salvar Campo</button>
        </div>
      </div>
    </div>

    <!-- Modal: renomear campo sistema -->
    <div class="escola-modal-overlay" id="renameModalOverlay">
      <div class="escola-modal" style="width:380px;max-width:calc(100vw - 32px)">
        <div class="escola-modal-header">
          <h3>Renomear Campo</h3>
          <button class="btn-icon-sm" id="renameModalClose">&#x2715;</button>
        </div>
        <div class="form-group" style="margin-bottom:20px">
          <label class="form-label">Novo nome</label>
          <input type="text" class="form-input" id="renameInputLabel" />
          <input type="hidden" id="renameInputId" />
        </div>
        <div class="escola-modal-footer">
          <button class="btn-secondary" id="renameModalCancel">Cancelar</button>
          <button class="btn-primary" id="renameModalSave">Renomear</button>
        </div>
      </div>
    </div>`;
}

function bindCamposEditorEvents(modKey) {
  const content = document.getElementById('settingsContent');
  const config  = getDefaultCampos(modKey);

  // Voltar para Fluxos
  content.querySelector('.campos-back-btn').addEventListener('click', () => switchSettingsTab('fluxos'));

  // Toggle visibilidade
  content.addEventListener('change', e => {
    const chk = e.target.closest('.campo-visivel-chk');
    if (!chk || chk.disabled) return;
    const id    = chk.dataset.campoId;
    const campo = [...config.sistema, ...config.custom].find(c => c.id === id);
    if (campo) campo.visivel = chk.checked;
    const row = chk.closest('.campo-editor-row');
    if (row) row.classList.toggle('campo-oculto', !chk.checked);
    showToast(chk.checked ? 'Campo visível no card' : 'Campo ocultado', 'success');
  });

  // Renomear campo sistema
  content.addEventListener('click', e => {
    const renBtn = e.target.closest('.campo-rename-btn');
    if (renBtn) {
      const id    = renBtn.dataset.campoId;
      const campo = config.sistema.find(c => c.id === id);
      if (!campo) return;
      document.getElementById('renameInputId').value    = id;
      document.getElementById('renameInputLabel').value = campo.label;
      document.getElementById('renameModalOverlay').classList.add('open');
      setTimeout(() => document.getElementById('renameInputLabel').focus(), 50);
    }

    // Editar campo custom
    const editBtn = e.target.closest('.campo-edit-btn');
    if (editBtn) { openCampoModal(modKey, editBtn.dataset.campoId); return; }

    // Excluir campo custom
    const delBtn = e.target.closest('.campo-del-btn');
    if (delBtn) {
      const id    = delBtn.dataset.campoId;
      const campo = config.custom.find(c => c.id === id);
      if (!campo) return;
      if (!confirm(`Excluir o campo "${campo.label}"?\nDados existentes neste campo serão perdidos.`)) return;
      config.custom = config.custom.filter(c => c.id !== id);
      const row = content.querySelector(`#customCamposList .campo-editor-row[data-id="${id}"]`);
      if (row) row.remove();
      showToast('Campo excluído', 'success');
      // Se lista ficou vazia
      const list = document.getElementById('customCamposList');
      if (list && !list.querySelector('.campo-editor-row')) {
        list.innerHTML = '<p style="color:var(--gray-400);font-size:13px;padding:12px 0;margin:0">Nenhum campo personalizado criado ainda.</p>';
      }
    }
  });

  // Rename modal — fechar / salvar
  document.getElementById('renameModalClose').addEventListener('click',
    () => document.getElementById('renameModalOverlay').classList.remove('open'));
  document.getElementById('renameModalCancel').addEventListener('click',
    () => document.getElementById('renameModalOverlay').classList.remove('open'));
  document.getElementById('renameModalSave').addEventListener('click', () => {
    const id    = document.getElementById('renameInputId').value;
    const label = document.getElementById('renameInputLabel').value.trim();
    if (!label) { showToast('Informe o novo nome', 'warn'); return; }
    const campo = config.sistema.find(c => c.id === id);
    if (campo) {
      campo.label = label;
      const nameEl = content.querySelector(`.campo-editor-row[data-id="${id}"] .campo-nome`);
      if (nameEl) nameEl.textContent = label;
    }
    document.getElementById('renameModalOverlay').classList.remove('open');
    showToast('Campo renomeado com sucesso', 'success');
  });

  // Novo campo personalizado
  document.getElementById('addCustomCampoBtn').addEventListener('click', () => openCampoModal(modKey, null));

  // Campo modal: tipo → mostrar/ocultar opções
  document.getElementById('campoInputTipo').addEventListener('change', function() {
    document.getElementById('campoOpcoesGroup').style.display = this.value === 'select' ? '' : 'none';
  });

  // Campo modal: fechar
  const closeFn = () => closeCampoModal();
  document.getElementById('campoModalClose').addEventListener('click', closeFn);
  document.getElementById('campoModalCancel').addEventListener('click', closeFn);
  document.getElementById('campoModalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('campoModalOverlay')) closeFn();
  });

  // Campo modal: salvar
  document.getElementById('campoModalSave').addEventListener('click', () => saveCampo(modKey));
}

let _editingCampoId   = null;
let _editingCampoMod  = null;

function openCampoModal(modKey, campoId) {
  _editingCampoId  = campoId || null;
  _editingCampoMod = modKey;
  const overlay = document.getElementById('campoModalOverlay');
  document.getElementById('campoModalTitle').textContent  = campoId ? 'Editar Campo' : 'Novo Campo';
  document.getElementById('campoInputLabel').value = '';
  document.getElementById('campoInputTipo').value  = 'text';
  document.getElementById('campoInputOpcoes').value = '';
  document.getElementById('campoOpcoesGroup').style.display = 'none';

  if (campoId) {
    const campo = getDefaultCampos(modKey).custom.find(c => c.id === campoId);
    if (campo) {
      document.getElementById('campoInputLabel').value = campo.label;
      document.getElementById('campoInputTipo').value  = campo.tipo;
      if (campo.tipo === 'select') {
        document.getElementById('campoOpcoesGroup').style.display = '';
        document.getElementById('campoInputOpcoes').value = (campo.opcoes || []).join('\n');
      }
    }
  }
  overlay.classList.add('open');
  setTimeout(() => document.getElementById('campoInputLabel').focus(), 50);
}

function closeCampoModal() {
  const overlay = document.getElementById('campoModalOverlay');
  if (overlay) overlay.classList.remove('open');
  _editingCampoId = null;
}

function saveCampo(modKey) {
  const label = document.getElementById('campoInputLabel').value.trim();
  const tipo  = document.getElementById('campoInputTipo').value;
  if (!label) { showToast('Informe o nome do campo', 'warn'); return; }

  const config = getDefaultCampos(modKey);
  let opcoes = [];
  if (tipo === 'select') {
    opcoes = document.getElementById('campoInputOpcoes').value.split('\n').map(o => o.trim()).filter(Boolean);
    if (!opcoes.length) { showToast('Adicione ao menos uma opção para o campo de seleção', 'warn'); return; }
  }

  if (_editingCampoId) {
    const campo = config.custom.find(c => c.id === _editingCampoId);
    if (campo) { campo.label = label; campo.tipo = tipo; campo.opcoes = opcoes; }
    showToast('Campo atualizado!', 'success');
  } else {
    const id = 'custom_' + label.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'').substring(0,20)
                         + '_' + Date.now().toString(36);
    config.custom.push({ id, label, tipo, opcoes, obrigatorio:false, visivel:true });
    showToast('Campo personalizado criado!', 'success');
  }

  closeCampoModal();
  openCamposEditor(modKey); // re-render editor
}

/* ── Aplica configuração de campos no modal do card ── */
function applyFieldConfig(modKey) {
  const config = getDefaultCampos(modKey);

  config.sistema.forEach(campo => {
    // Visibilidade do grupo
    const group = document.querySelector(`[data-campo="${campo.id}"]`);
    if (group) {
      // Não ocultar se o módulo hasFinancial e o campo faz parte dos financials
      // (financialFields/documentFields já controlam o bloco inteiro)
      const inFinancial = ['valor','fornecedor','num_doc','vencimento'].includes(campo.id);
      if (!inFinancial) group.style.display = campo.visivel ? '' : 'none';
    }

    // Atualizar label (manter o span.required se existir)
    const labelEl = document.getElementById('label-' + campo.id);
    if (labelEl) {
      const reqSpan = labelEl.querySelector('.required');
      labelEl.textContent = campo.label;
      if (reqSpan) labelEl.appendChild(reqSpan);
    }
    // Casos com ID de label legado
    if (campo.id === 'fornecedor') {
      const el = document.getElementById('fornecedorLabel');
      if (el) el.textContent = campo.label;
    }
    if (campo.id === 'num_doc') {
      const el = document.getElementById('numDocLabel');
      if (el) el.textContent = campo.label;
    }
  });
}

/* ── Renderiza campos custom no #customFieldsArea do modal ── */
function renderCustomFields(modKey, card) {
  const area = document.getElementById('customFieldsArea');
  if (!area) return;
  const config       = getDefaultCampos(modKey);
  const visibleCustom = config.custom.filter(c => c.visivel);

  if (!visibleCustom.length) { area.innerHTML = ''; return; }

  const vals = (card && card.camposCustom) || {};
  area.innerHTML = `
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--gray-100)">
    <p class="form-label" style="margin-bottom:12px;font-weight:600;color:var(--gray-600)">Campos personalizados</p>
    <div class="form-row" style="flex-wrap:wrap">
      ${visibleCustom.map(campo => {
        const val = vals[campo.id] !== undefined ? vals[campo.id] : '';
        let input;
        if (campo.tipo === 'textarea') {
          input = `<textarea class="form-input custom-campo-input" data-custom-campo="${campo.id}" rows="2"
            placeholder="${campo.label}...">${val}</textarea>`;
        } else if (campo.tipo === 'select') {
          const opts = (campo.opcoes || []).map(o =>
            `<option value="${o}" ${val===o?'selected':''}>${o}</option>`).join('');
          input = `<select class="form-input custom-campo-input" data-custom-campo="${campo.id}">
            <option value="">Selecionar...</option>${opts}</select>`;
        } else if (campo.tipo === 'checkbox') {
          input = `<input type="checkbox" class="custom-campo-input" data-custom-campo="${campo.id}"
            ${val?'checked':''} style="width:20px;height:20px;cursor:pointer;margin-top:6px">`;
        } else {
          const typeAttr = campo.tipo === 'currency' ? 'number' : campo.tipo;
          const extra    = campo.tipo === 'currency' ? 'step="0.01" min="0"' : '';
          input = `<input type="${typeAttr}" class="form-input custom-campo-input"
            data-custom-campo="${campo.id}" placeholder="${campo.label}..." value="${val}" ${extra} />`;
        }
        const isFullWidth = campo.tipo === 'textarea' || campo.tipo === 'checkbox';
        return `<div class="form-group ${isFullWidth ? 'form-group--full' : ''}">
          <label class="form-label">${campo.label}</label>
          ${input}
        </div>`;
      }).join('')}
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   AUTOMAÇÕES — Motor de regras trigger → ação
══════════════════════════════════════════════════════════ */
const AUTOMACOES = JSON.parse(localStorage.getItem('ped_automacoes_settings') || '[]');

/* Salva AUTOMACOES no localStorage + PostgreSQL */
function saveAutomacoesData() {
  try { localStorage.setItem('ped_automacoes_settings', JSON.stringify(AUTOMACOES)); } catch(_) {}
  apiRequest('PUT', '/api/settings/automacoes_settings', AUTOMACOES).catch(err => {
    console.warn('[Settings API] Falha ao salvar automacoes_settings:', err.message);
  });
}

const AUTO_TRIGGERS = [
  { id:'fase_mudou',       label:'Quando o card muda para uma fase' },
  { id:'card_criado',      label:'Quando um card é criado' },
  { id:'campo_preenchido', label:'Quando o campo Responsável é preenchido' },
  { id:'prazo_vencendo',   label:'Quando o prazo está vencendo (1 dia)' },
];

const AUTO_ACOES = [
  { id:'mover_fase',          label:'Mover card para a fase',    temValor:true },
  { id:'alterar_prioridade',  label:'Alterar prioridade para',   temValor:true },
  { id:'notificar',           label:'Exibir notificação',        temValor:true },
  { id:'definir_responsavel', label:'Definir responsável como',  temValor:true },
];

function buildPanelAutomacoes() {
  const total      = AUTOMACOES.length;
  const modOptions = Object.entries(MODULES)
    .map(([k,m]) => `<option value="${k}">${m.label}</option>`).join('');

  const rules = total ? AUTOMACOES.map((rule, i) => {
    const triggerDef = AUTO_TRIGGERS.find(t => t.id === rule.trigger.tipo);
    const acaoDef    = AUTO_ACOES.find(a => a.id === rule.acao.tipo);
    const trigLabel  = triggerDef ? triggerDef.label : rule.trigger.tipo;
    const acaoLabel  = acaoDef   ? acaoDef.label    : rule.acao.tipo;
    const modLabel   = MODULES[rule.modulo]?.shortLabel || rule.modulo;
    const faseLabel  = rule.trigger.faseId ? (MODULES[rule.modulo]?.fases[rule.trigger.faseId]?.label || rule.trigger.faseId) : '';

    return `
      <div class="automacao-rule-card ${!rule.ativo ? 'automacao-inativa' : ''}" data-rule-idx="${i}">
        <div class="automacao-rule-header">
          <div class="automacao-rule-info">
            <span class="automacao-rule-name">${rule.nome}</span>
            <span class="automacao-module-badge">${modLabel}</span>
          </div>
          <div class="automacao-rule-actions">
            <label class="toggle-switch" title="${rule.ativo ? 'Desativar' : 'Ativar'}">
              <input type="checkbox" class="automacao-ativo-chk" data-idx="${i}" ${rule.ativo ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
            <button class="btn-fluxo-action automacao-edit-btn" data-idx="${i}">Editar</button>
            <button class="btn-fluxo-action btn-fluxo-danger automacao-del-btn" data-idx="${i}">Excluir</button>
          </div>
        </div>
        <div class="automacao-rule-body">
          <div class="automacao-step">
            <span class="automacao-step-icon automacao-trigger-icon">▶</span>
            <span><strong>Gatilho:</strong> ${escHtml(trigLabel)}${faseLabel ? ' → <em>' + escHtml(faseLabel) + '</em>' : ''}</span>
          </div>
          <div class="automacao-arrow">→</div>
          <div class="automacao-step">
            <span class="automacao-step-icon automacao-acao-icon">⚡</span>
            <span><strong>Ação:</strong> ${escHtml(acaoLabel)}${rule.acao.valor ? ' <em>"' + escHtml(rule.acao.valor) + '"</em>' : ''}</span>
          </div>
        </div>
      </div>`;
  }).join('') : `
    <div class="automacao-empty">
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" style="color:var(--gray-300)">
        <circle cx="22" cy="22" r="20" stroke="currentColor" stroke-width="1.5"/>
        <path d="M15 22h14M22 15v14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <p style="margin:12px 0 4px;color:var(--gray-500);font-weight:500">Nenhuma automação criada</p>
      <p style="margin:0;color:var(--gray-400);font-size:13px">
        Crie regras para automatizar tarefas repetitivas nos fluxos.
      </p>
    </div>`;

  return `
    <div class="settings-panel-header">
      <div>
        <h2>Automações</h2>
        <p>Regras automáticas trigger → ação nos seus pipelines — ${total} automação${total !== 1 ? 'ões' : ''}</p>
      </div>
      <button class="btn-primary" id="addAutomacaoBtn">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 1.5v10M1.5 6.5h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Nova Automação
      </button>
    </div>

    <div id="automacoesList">${rules}</div>

    <!-- Modal: Nova / Editar Automação -->
    <div class="escola-modal-overlay" id="autoModalOverlay">
      <div class="escola-modal" style="width:520px;max-width:calc(100vw - 32px)">
        <div class="escola-modal-header">
          <h3 id="autoModalTitle">Nova Automação</h3>
          <button class="btn-icon-sm" id="autoModalClose">&#x2715;</button>
        </div>

        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Nome da automação *</label>
          <input type="text" class="form-input" id="autoInputNome"
            placeholder="Ex: Mover para Pago quando aprovado"/>
        </div>
        <div class="form-group" style="margin-bottom:20px">
          <label class="form-label">Fluxo *</label>
          <select class="form-input" id="autoInputModulo">${modOptions}</select>
        </div>

        <!-- Trigger -->
        <div class="automacao-builder-section">
          <div class="automacao-builder-label">
            <span class="automacao-step-icon automacao-trigger-icon" style="width:24px;height:24px;font-size:13px">▶</span>
            <strong>Gatilho — quando isso acontecer</strong>
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <select class="form-input" id="autoTriggerTipo">
              ${AUTO_TRIGGERS.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" id="autoTriggerFaseGroup">
            <label class="form-label">Fase específica (opcional)</label>
            <select class="form-input" id="autoTriggerFase">
              <option value="">Qualquer fase</option>
            </select>
          </div>
        </div>

        <!-- Ação -->
        <div class="automacao-builder-section" style="margin-top:16px">
          <div class="automacao-builder-label">
            <span class="automacao-step-icon automacao-acao-icon" style="width:24px;height:24px;font-size:13px">⚡</span>
            <strong>Ação — executar automaticamente</strong>
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <select class="form-input" id="autoAcaoTipo">
              ${AUTO_ACOES.map(a => `<option value="${a.id}">${a.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" id="autoAcaoValorGroup">
            <label class="form-label" id="autoAcaoValorLabel">Valor da ação</label>
            <input type="text" class="form-input" id="autoAcaoValor" placeholder="Ex: nome da fase ou prioridade"/>
          </div>
        </div>

        <div class="escola-modal-footer">
          <button class="btn-secondary" id="autoModalCancel">Cancelar</button>
          <button class="btn-primary" id="autoModalSave">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 6.5l3.5 3.5 5.5-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Salvar Automação
          </button>
        </div>
      </div>
    </div>`;
}

function bindAutomacoesEvents() {
  const content = document.getElementById('settingsContent');

  // Toggle ativo/inativo
  content.addEventListener('change', e => {
    const chk = e.target.closest('.automacao-ativo-chk');
    if (!chk) return;
    const idx = parseInt(chk.dataset.idx);
    if (AUTOMACOES[idx]) {
      AUTOMACOES[idx].ativo = chk.checked;
      saveAutomacoesData();
      chk.closest('.automacao-rule-card').classList.toggle('automacao-inativa', !chk.checked);
      showToast(chk.checked ? 'Automação ativada' : 'Automação pausada', 'success');
    }
  });

  // Editar / excluir
  content.addEventListener('click', e => {
    const editBtn = e.target.closest('.automacao-edit-btn');
    if (editBtn) { openAutoModal(parseInt(editBtn.dataset.idx)); return; }

    const delBtn = e.target.closest('.automacao-del-btn');
    if (delBtn) {
      const idx = parseInt(delBtn.dataset.idx);
      const rule = AUTOMACOES[idx];
      if (!rule) return;
      if (!confirm(`Excluir a automação "${rule.nome}"?`)) return;
      AUTOMACOES.splice(idx, 1);
      saveAutomacoesData();
      renderSettingsPanel('automacoes');
      showToast('Automação excluída', 'success');
    }
  });

  // Botão "Nova Automação"
  document.getElementById('addAutomacaoBtn').addEventListener('click', () => openAutoModal(null));

  // Modal: fechar
  document.getElementById('autoModalClose').addEventListener('click',  closeAutoModal);
  document.getElementById('autoModalCancel').addEventListener('click', closeAutoModal);
  document.getElementById('autoModalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('autoModalOverlay')) closeAutoModal();
  });

  // Modal: mudança de fluxo → atualizar fases disponíveis
  document.getElementById('autoInputModulo').addEventListener('change', function() {
    refreshAutoTriggerFases(this.value);
    refreshAutoAcaoValor();
  });

  // Modal: mudança de trigger tipo → mostrar/ocultar fase
  document.getElementById('autoTriggerTipo').addEventListener('change', function() {
    const showFase = this.value === 'fase_mudou';
    document.getElementById('autoTriggerFaseGroup').style.display = showFase ? '' : 'none';
    refreshAutoAcaoValor();
  });

  // Modal: mudança de ação → atualizar label/valor
  document.getElementById('autoAcaoTipo').addEventListener('change', refreshAutoAcaoValor);

  // Modal: salvar
  document.getElementById('autoModalSave').addEventListener('click', saveAutomacao);

  // Keyboard
  document.addEventListener('keydown', function escAuto(e) {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('autoModalOverlay');
      if (overlay && overlay.classList.contains('open')) { closeAutoModal(); e.stopPropagation(); }
    }
  });
}

let _editingAutoIdx = null;

function openAutoModal(idx) {
  _editingAutoIdx = idx !== null ? idx : null;
  const overlay = document.getElementById('autoModalOverlay');
  document.getElementById('autoModalTitle').textContent = idx !== null ? 'Editar Automação' : 'Nova Automação';
  document.getElementById('autoInputNome').value   = '';
  document.getElementById('autoTriggerTipo').value = 'fase_mudou';
  document.getElementById('autoAcaoTipo').value    = 'mover_fase';
  document.getElementById('autoAcaoValor').value   = '';

  const firstMod = Object.keys(MODULES)[0] || '';
  document.getElementById('autoInputModulo').value = firstMod;

  if (idx !== null && AUTOMACOES[idx]) {
    const rule = AUTOMACOES[idx];
    document.getElementById('autoInputNome').value   = rule.nome;
    document.getElementById('autoInputModulo').value = rule.modulo;
    document.getElementById('autoTriggerTipo').value = rule.trigger.tipo;
    document.getElementById('autoAcaoTipo').value    = rule.acao.tipo;
    document.getElementById('autoAcaoValor').value   = rule.acao.valor || '';
    refreshAutoTriggerFases(rule.modulo, rule.trigger.faseId);
  } else {
    refreshAutoTriggerFases(firstMod);
  }

  document.getElementById('autoTriggerFaseGroup').style.display =
    document.getElementById('autoTriggerTipo').value === 'fase_mudou' ? '' : 'none';

  refreshAutoAcaoValor();
  overlay.classList.add('open');
  setTimeout(() => document.getElementById('autoInputNome').focus(), 60);
}

function closeAutoModal() {
  const overlay = document.getElementById('autoModalOverlay');
  if (overlay) overlay.classList.remove('open');
  _editingAutoIdx = null;
}

function refreshAutoTriggerFases(modKey, selectedFaseId) {
  const faseSelect = document.getElementById('autoTriggerFase');
  if (!faseSelect) return;
  const mod = MODULES[modKey];
  faseSelect.innerHTML = '<option value="">Qualquer fase</option>';
  if (mod) {
    Object.entries(mod.fases).forEach(([k,v]) => {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = v.label;
      if (k === selectedFaseId) opt.selected = true;
      faseSelect.appendChild(opt);
    });
  }
}

function refreshAutoAcaoValor() {
  const acaoTipo   = document.getElementById('autoAcaoTipo')?.value;
  const modKey     = document.getElementById('autoInputModulo')?.value;
  const valorGroup = document.getElementById('autoAcaoValorGroup');
  const valorLabel = document.getElementById('autoAcaoValorLabel');
  const valorInput = document.getElementById('autoAcaoValor');
  if (!acaoTipo || !valorGroup) return;

  const acaoDef = AUTO_ACOES.find(a => a.id === acaoTipo);
  valorGroup.style.display = '';

  if (acaoTipo === 'mover_fase') {
    valorLabel.textContent = 'Mover para fase';
    // Substituir input por select de fases
    if (valorInput.tagName === 'INPUT') {
      const sel = document.createElement('select');
      sel.className   = 'form-input';
      sel.id          = 'autoAcaoValor';
      const mod = MODULES[modKey];
      sel.innerHTML   = '<option value="">Selecionar fase...</option>';
      if (mod) Object.entries(mod.fases).forEach(([k,v]) => {
        sel.innerHTML += `<option value="${k}">${v.label}</option>`;
      });
      valorInput.replaceWith(sel);
    }
  } else if (acaoTipo === 'alterar_prioridade') {
    valorLabel.textContent = 'Nova prioridade';
    if (valorInput.tagName !== 'SELECT' || valorInput.options.length < 3) {
      const sel = document.createElement('select');
      sel.className = 'form-input'; sel.id = 'autoAcaoValor';
      sel.innerHTML = Object.entries(PRIORITIES).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('');
      document.getElementById('autoAcaoValor')?.replaceWith(sel);
    }
  } else if (acaoTipo === 'notificar') {
    valorLabel.textContent = 'Mensagem da notificação';
    if (document.getElementById('autoAcaoValor')?.tagName !== 'INPUT') {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'form-input'; inp.id = 'autoAcaoValor';
      inp.placeholder = 'Ex: Card aguardando aprovação!';
      document.getElementById('autoAcaoValor')?.replaceWith(inp);
    }
  } else {
    valorLabel.textContent = 'Valor';
    if (document.getElementById('autoAcaoValor')?.tagName !== 'INPUT') {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'form-input'; inp.id = 'autoAcaoValor';
      document.getElementById('autoAcaoValor')?.replaceWith(inp);
    }
  }
}

function saveAutomacao() {
  const nome    = document.getElementById('autoInputNome').value.trim();
  const modulo  = document.getElementById('autoInputModulo').value;
  const trigTipo = document.getElementById('autoTriggerTipo').value;
  const faseId  = document.getElementById('autoTriggerFase')?.value || '';
  const acaoTipo = document.getElementById('autoAcaoTipo').value;
  const valor   = document.getElementById('autoAcaoValor').value;

  if (!nome)   { showToast('Informe o nome da automação', 'warn'); return; }
  if (!modulo) { showToast('Selecione o fluxo', 'warn'); return; }
  if (!valor && AUTO_ACOES.find(a => a.id === acaoTipo)?.temValor) {
    showToast('Preencha o valor da ação', 'warn'); return;
  }

  const rule = {
    nome, modulo, ativo: true,
    trigger: { tipo: trigTipo, faseId: faseId || undefined },
    acao:    { tipo: acaoTipo, valor: valor || undefined },
  };

  if (_editingAutoIdx !== null && AUTOMACOES[_editingAutoIdx]) {
    AUTOMACOES[_editingAutoIdx] = rule;
    showToast('Automação atualizada!', 'success');
  } else {
    AUTOMACOES.push(rule);
    showToast('Automação criada!', 'success');
  }

  saveAutomacoesData();
  closeAutoModal();
  renderSettingsPanel('automacoes');
}

/* ── Motor de execução de automações (Settings) ── */
let _evalAutoDepth = 0;
function evaluateAutomacoes(card, eventTipo, prevFase) {
  if (_evalAutoDepth >= 3) return;   // proteção anti-loop
  _evalAutoDepth++;
  try { _evaluateAutomacoesInner(card, eventTipo, prevFase); } finally { _evalAutoDepth--; }
}
function _evaluateAutomacoesInner(card, eventTipo, prevFase) {
  const activeRules = AUTOMACOES.filter(r => r.ativo && r.modulo === card.modulo);
  activeRules.forEach(rule => {
    const t = rule.trigger;
    let triggered = false;

    if (t.tipo === 'fase_mudou' && eventTipo === 'fase_mudou') {
      triggered = !t.faseId || card.fase === t.faseId;
    } else if (t.tipo === 'card_criado' && eventTipo === 'card_criado') {
      triggered = true;
    } else if (t.tipo === 'campo_preenchido' && eventTipo === 'campo_preenchido') {
      triggered = !!card.responsavel;
    }

    if (!triggered) return;

    const a = rule.acao;
    let _cardChanged = false;
    if (a.tipo === 'mover_fase' && a.valor && MODULES[card.modulo]?.fases[a.valor]) {
      card.fase = a.valor;
      card.historico = card.historico || [];
      card.historico.push({ texto:`⚡ Automação "${rule.nome}" moveu card para "${MODULES[card.modulo].fases[a.valor].label}"`, data:now(), usuario:'Sistema (Automação)' });
      _cardChanged = true;
    } else if (a.tipo === 'alterar_prioridade' && a.valor) {
      card.prioridade = a.valor;
      card.historico = card.historico || [];
      card.historico.push({ texto:`⚡ Automação "${rule.nome}" alterou prioridade para "${a.valor}"`, data:now(), usuario:'Sistema (Automação)' });
      _cardChanged = true;
    } else if (a.tipo === 'notificar' && a.valor) {
      showToast(`🤖 ${rule.nome}: ${a.valor}`, 'success');
    } else if (a.tipo === 'definir_responsavel' && a.valor) {
      if (!card.responsavel) {
        card.responsavel = a.valor;
        card.historico = card.historico || [];
        card.historico.push({ texto:`⚡ Automação "${rule.nome}" definiu responsável como "${a.valor}"`, data:now(), usuario:'Sistema (Automação)' });
        _cardChanged = true;
      }
    }
    if (_cardChanged) { persistCards(); apiUpdateCard(card); }
  });
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD GERAL
══════════════════════════════════════════════════════════ */

const _dashCharts = {};

function openDashboard() {
  closeAgenda();
  document.getElementById('newCardBtn')?.classList.add('hidden');
  document.querySelector('.view-toggle')?.classList.add('hidden');
  document.querySelector('.topbar-search')?.classList.add('hidden');
  document.getElementById('statsBar').classList.add('hidden');
  document.getElementById('kanbanView').classList.add('hidden');
  document.getElementById('listView').classList.add('hidden');
  document.getElementById('settingsView').classList.add('hidden');
  document.getElementById('dashboardView').classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector('.nav-item[data-module="dashboard"]')?.classList.add('active');
  renderDashboard();
}

function closeDashboard() {
  document.getElementById('dashboardView').classList.add('hidden');
  document.getElementById('statsBar').classList.remove('hidden');
  document.getElementById('newCardBtn')?.classList.remove('hidden');
  document.querySelector('.view-toggle')?.classList.remove('hidden');
  document.querySelector('.topbar-search')?.classList.remove('hidden');

  // Restaura a view correta ao sair do dashboard
  document.getElementById('kanbanView').classList.toggle('hidden', state.viewMode !== 'kanban');
  document.getElementById('listView').classList.toggle('hidden',   state.viewMode !== 'list');
}

/* ── Agenda Edu (iframe interno) ── */
const AGENDA_URL = 'https://web-production-39cab.up.railway.app';

function openAgenda() {
  closeDashboard();
  document.getElementById('newCardBtn')?.classList.add('hidden');
  document.querySelector('.view-toggle')?.classList.add('hidden');
  document.querySelector('.topbar-search')?.classList.add('hidden');
  document.getElementById('statsBar').classList.add('hidden');
  document.getElementById('kanbanView').classList.add('hidden');
  document.getElementById('listView').classList.add('hidden');
  document.getElementById('settingsView').classList.add('hidden');
  document.getElementById('dashboardView').classList.add('hidden');

  const agendaView = document.getElementById('agendaView');
  const agendaFrame = document.getElementById('agendaFrame');
  agendaView.classList.remove('hidden');
  // Só carrega o iframe na primeira vez (ou se src diferente)
  if (!agendaFrame.src || !agendaFrame.src.startsWith(AGENDA_URL)) {
    agendaFrame.src = AGENDA_URL;
  }

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector('.nav-item[data-module="agenda"]')?.classList.add('active');
}

function closeAgenda() {
  const agendaView = document.getElementById('agendaView');
  if (agendaView) agendaView.classList.add('hidden');
}

function renderDashboard() {
  Object.keys(_dashCharts).forEach(k => { if (_dashCharts[k]) { _dashCharts[k].destroy(); delete _dashCharts[k]; } });

  const cards = allCards;
  const hoje  = new Date(); hoje.setHours(0,0,0,0);

  const total      = cards.length;
  const concluidos = cards.filter(c => MODULES[c.modulo]?.lastPhase === c.fase).length;
  const taxaConc   = total ? Math.round((concluidos / total) * 100) : 0;
  const slaVencido = cards.filter(c => {
    if (!c.prazo) return false;
    if (MODULES[c.modulo]?.lastPhase === c.fase) return false;
    return new Date(c.prazo) < hoje;
  });
  const mesAtual = hoje.toISOString().slice(0,7);
  const criados30 = cards.filter(c => (c.criadoEm || '').startsWith(mesAtual)).length;

  document.getElementById('dashKpis').innerHTML = `
    <div class="dash-kpi-card">
      <div class="dash-kpi-icon dash-kpi-icon--blue">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/></svg>
      </div>
      <div class="dash-kpi-body"><span class="dash-kpi-value">${total}</span><span class="dash-kpi-label">Total de Cards</span></div>
    </div>
    <div class="dash-kpi-card">
      <div class="dash-kpi-icon dash-kpi-icon--green">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 10l2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="dash-kpi-body"><span class="dash-kpi-value">${concluidos}</span><span class="dash-kpi-label">Concluídos</span></div>
    </div>
    <div class="dash-kpi-card">
      <div class="dash-kpi-icon ${slaVencido.length > 0 ? 'dash-kpi-icon--red' : 'dash-kpi-icon--gray'}">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v4l2.5 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </div>
      <div class="dash-kpi-body"><span class="dash-kpi-value" style="color:${slaVencido.length > 0 ? '#EF4444' : 'inherit'}">${slaVencido.length}</span><span class="dash-kpi-label">SLA Vencido</span></div>
    </div>
    <div class="dash-kpi-card">
      <div class="dash-kpi-icon dash-kpi-icon--purple">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 17V8l7-5 7 5v9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="7.5" y="12" width="5" height="5" rx="0.5" stroke="currentColor" stroke-width="1.5"/></svg>
      </div>
      <div class="dash-kpi-body"><span class="dash-kpi-value">${criados30}</span><span class="dash-kpi-label">Criados este mês</span></div>
    </div>
    <div class="dash-kpi-card">
      <div class="dash-kpi-icon dash-kpi-icon--amber">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2v4M10 14v4M2 10h4M14 10h4M4.22 4.22l2.83 2.83M12.95 12.95l2.83 2.83M4.22 15.78l2.83-2.83M12.95 7.05l2.83-2.83" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </div>
      <div class="dash-kpi-body"><span class="dash-kpi-value">${taxaConc}%</span><span class="dash-kpi-label">Taxa de conclusão</span></div>
    </div>`;

  // Chart: Cards por Módulo (Doughnut)
  const MOD_COLORS = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#EC4899','#06B6D4','#F97316'];
  const modLabels = [], modData = [], modColors = [];
  let ci = 0;
  Object.entries(MODULES).forEach(([key, mod]) => {
    const count = cards.filter(c => c.modulo === key).length;
    if (count > 0) { modLabels.push(mod.shortLabel || mod.label); modData.push(count); modColors.push(MOD_COLORS[ci++ % MOD_COLORS.length]); }
  });
  document.getElementById('dashModuloBadge').textContent = `${modData.reduce((a,b)=>a+b,0)} cards`;
  _dashCharts.modulo = new Chart(document.getElementById('chartPorModulo'), {
    type: 'doughnut',
    data: { labels: modLabels, datasets: [{ data: modData, backgroundColor: modColors, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 12 }, padding: 12, usePointStyle: true } } }, cutout: '65%' }
  });

  // Chart: Cards por Escola (Bar)
  const escLabels = settingsData.escolas.map(e => e.sigla);
  const escData   = settingsData.escolas.map(e => cards.filter(c => c.escola === e.id).length);
  const escColors = settingsData.escolas.map(e => e.cor);
  document.getElementById('dashEscolaBadge').textContent = `${settingsData.escolas.length} unidades`;
  _dashCharts.escola = new Chart(document.getElementById('chartPorEscola'), {
    type: 'bar',
    data: { labels: escLabels, datasets: [{ label: 'Cards', data: escData, backgroundColor: escColors.map(c => c + 'CC'), borderColor: escColors, borderWidth: 2, borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: '#f0f0f0' } }, x: { ticks: { font: { size: 12, weight: '600' } }, grid: { display: false } } } }
  });

  // Chart: Cards por Fase (Bar horizontal)
  const faseMap = {};
  cards.forEach(c => {
    const mod = MODULES[c.modulo]; if (!mod) return;
    const fase = mod.fases?.[c.fase];
    const key  = fase?.label || c.fase;
    const cor  = fase?.color || '#94A3B8';
    if (!faseMap[key]) faseMap[key] = { count: 0, color: cor };
    faseMap[key].count++;
  });
  const faseSorted = Object.entries(faseMap).sort((a,b) => b[1].count - a[1].count).slice(0,10);
  _dashCharts.fase = new Chart(document.getElementById('chartPorFase'), {
    type: 'bar',
    data: { labels: faseSorted.map(([k]) => k), datasets: [{ label: 'Cards', data: faseSorted.map(([,v]) => v.count), backgroundColor: faseSorted.map(([,v]) => v.color + 'BB'), borderColor: faseSorted.map(([,v]) => v.color), borderWidth: 2, borderRadius: 5 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: '#f0f0f0' } }, y: { ticks: { font: { size: 12 } }, grid: { display: false } } } }
  });

  // SLA Vencido
  document.getElementById('dashSlaCount').textContent = slaVencido.length;
  if (slaVencido.length === 0) {
    document.getElementById('dashSlaList').innerHTML = '<p class="dash-empty">Nenhum card com SLA vencido. ✓</p>';
  } else {
    const sorted = [...slaVencido].sort((a,b) => new Date(a.prazo) - new Date(b.prazo));
    document.getElementById('dashSlaList').innerHTML = sorted.slice(0,8).map(c => {
      const mod = MODULES[c.modulo]; const fase = mod?.fases?.[c.fase];
      const escola = settingsData.escolas.find(e => e.id === c.escola);
      const dias = Math.floor((hoje - new Date(c.prazo)) / 86400000);
      return `<div class="dash-sla-item" data-id="${escHtml(c.id)}">
        <div class="dash-sla-dot" style="background:${fase?.color || '#94A3B8'}"></div>
        <div class="dash-sla-info">
          <span class="dash-sla-titulo">${escHtml(c.titulo)}</span>
          <span class="dash-sla-meta">${escHtml(mod?.shortLabel || c.modulo)} · ${escHtml(escola?.sigla || c.escola)}</span>
        </div>
        <span class="dash-sla-dias">+${dias}d</span>
      </div>`;
    }).join('');
    document.getElementById('dashSlaList').addEventListener('click', e => {
      const item = e.target.closest('.dash-sla-item');
      if (!item) return;
      const card = allCards.find(c => c.id === item.dataset.id);
      if (card) { switchModule(card.modulo); openModal(card.id); }
    });
  }

  // Atividade Recente
  const events = [];
  cards.forEach(c => { (c.historico || []).forEach(h => events.push({ ...h, cardTitulo: c.titulo, cardId: c.id, modulo: c.modulo })); });
  const parse = s => { if (!s) return 0; const [d='',t=''] = s.split(' '); const [dd='1',mm='1',aaaa='2000'] = d.split('/'); return new Date(`${aaaa}-${mm}-${dd}T${t||'00:00'}`).getTime(); };
  events.sort((a,b) => parse(b.data) - parse(a.data));
  document.getElementById('dashActivity').innerHTML = events.slice(0,10).map(ev => {
    const mod = MODULES[ev.modulo];
    return `<div class="dash-activity-item">
      <div class="dash-activity-dot"></div>
      <div class="dash-activity-info">
        <span class="dash-activity-texto">${escHtml(ev.texto)}</span>
        <span class="dash-activity-meta">${escHtml(ev.cardTitulo)} · ${escHtml(mod?.shortLabel || ev.modulo)} · ${escHtml(ev.usuario || '')}</span>
      </div>
      <span class="dash-activity-data">${escHtml(ev.data || '')}</span>
    </div>`;
  }).join('') || '<p class="dash-empty">Nenhuma atividade registrada.</p>';

  document.getElementById('dashRefreshBtn').onclick = renderDashboard;
}

/* ══════════════════════════════════════════════════════════
   CHAT FINANCEIRO — Gestão de Atendimento via AgendaEdu API
   Dados carregados em tempo real do AgendaEdu via proxy Railway.
══════════════════════════════════════════════════════════ */

const CHAT_FIN = {
  channels      : [],   // canais carregados da API
  tickets       : [],   // tickets do canal atual
  filtered      : [],   // tickets filtrados
  selectedTicket: null,
  currentChannel: null,
  searchQuery   : '',
  statusFilter  : '',
  loading       : false,
};

/* ── Labels de status ── */
function chatFinStatusLabel(status) {
  const map = {
    waiting       : 'Aguardando',
    in_attendance : 'Em Atendimento',
    done          : 'Encerrado',
  };
  return map[status] || status || '—';
}

function chatFinStatusClass(status) {
  const map = {
    waiting       : 'status--waiting',
    in_attendance : 'status--in-attendance',
    done          : 'status--done',
  };
  return map[status] || '';
}

/* ── Normalizar ticket interno ── */
function chatFinNormalizeTicket(item) {
  return {
    id          : String(item.id),
    escola      : item.escola || '',
    assunto     : item.assunto || '(sem assunto)',
    descricao   : item.descricao || '',
    solicitante : item.solicitante || '—',
    atendente   : item.atendente || '',
    status      : item.status || 'waiting',
    criadoEm    : chatFinFmtDate(item.created_at || item.criadoEm),
    atualizadoEm: chatFinFmtDate(item.updated_at || item.atualizadoEm),
    mensagens   : (item.mensagens || []).map(m => ({
      id   : String(m.id),
      tipo : m.tipo || 'message',
      texto: m.texto || '',
      autor: m.autor || '',
      data : chatFinFmtDate(m.created_at),
    })),
  };
}

function chatFinFmtDate(str) {
  if (!str) return '';
  try {
    const d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return str; }
}

/* ── Abrir / Fechar view ── */
function openChatFinanceiro() {
  exitSettings();
  closeDashboard();
  closeAgenda();
  document.getElementById('statsBar')?.classList.add('hidden');
  document.getElementById('kanbanView')?.classList.add('hidden');
  document.getElementById('listView')?.classList.add('hidden');
  document.getElementById('settingsView')?.classList.add('hidden');
  document.getElementById('dashboardView')?.classList.add('hidden');

  document.getElementById('chatFinanceiroView').classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector('.nav-item[data-module="chat_financeiro"]')?.classList.add('active');

  chatFinLoadChannels();
}

function closeChatFinanceiro() {
  document.getElementById('chatFinanceiroView')?.classList.add('hidden');
}

/* ══════════════════════════════════════════════════════════
   ESTRUTURA ESCOLAR — Cadastro via API AgendaEdu
══════════════════════════════════════════════════════════ */

const _estCache = { unidades:null, periodos:null, turmas:null, disciplinas:null, profissionais:null, responsaveis:null };
let _estActiveTab = 'unidades';

const EST_ROLES = { manager:'Gestor / Diretor', coordinator:'Coordenador', secretariat:'Secretário', teacher:'Professor', assistant:'Assistente', financial:'Financeiro', financial_assistant:'Assist. Financeiro', master:'Master' };
const EST_STAGES = { pre_child:'Pré-Infantil', child:'Infantil', fundamental_one:'Fund. I', fundamental_two:'Fund. II', high_school:'Ensino Médio', preparatory_course:'Pré-Vestibular', free_courses:'Cursos Livres', others:'Outros' };

function _estHideAll() {
  ['newCardBtn'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
  document.querySelector('.view-toggle')?.classList.add('hidden');
  document.querySelector('.topbar-search')?.classList.add('hidden');
  ['statsBar','kanbanView','listView','settingsView','dashboardView','agendaView','chatFinanceiroView'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
}

function openEstruturaEscolar() {
  exitSettings(); closeDashboard(); closeAgenda(); closeChatFinanceiro(); _estHideAll();
  document.getElementById('estruturaView').classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector('.nav-item[data-module="estrutura_escolar"]')?.classList.add('active');
  _renderEstTabs(); estLoadTab(_estActiveTab);
}

function closeEstruturaEscolar() { document.getElementById('estruturaView')?.classList.add('hidden'); }

function _renderEstTabs() {
  document.querySelectorAll('.est-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === _estActiveTab);
    btn.onclick = () => { _estActiveTab = btn.dataset.tab; document.querySelectorAll('.est-tab').forEach(b => b.classList.remove('active')); btn.classList.add('active'); estLoadTab(_estActiveTab); };
  });
  document.getElementById('estRefreshBtn').onclick = () => { _estCache[_estActiveTab] = null; estLoadTab(_estActiveTab); };
}

const EST_KINSHIP = { mother:'Mãe', father:'Pai', grandmother:'Avó', grandfather:'Avô', aunt:'Tia', uncle:'Tio', nanny:'Babá', stepfather:'Padrasto', stepmother:'Madrasta', cousin:'Primo/a', brother:'Irmão', sister:'Irmã', other:'Outro' };

async function estLoadTab(tab) {
  switch(tab) {
    case 'unidades': return estRenderUnidades();
    case 'periodos': return estRenderPeriodos();
    case 'turmas': return estRenderTurmas();
    case 'disciplinas': return estRenderDisciplinas();
    case 'profissionais': return estRenderProfissionais();
    case 'responsaveis': return estRenderResponsaveis();
  }
}

function _estBodyHTML(html) { document.getElementById('estBody').innerHTML = html; }

function _estErrorHTML(msg) {
  const isNotConfig = msg && (msg.includes('não configurad') || msg.includes('503'));
  if (isNotConfig) return `<div class="est-not-configured"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="flex-shrink:0;margin-top:1px"><path d="M9 2L1.5 15h15L9 2z" stroke="#D97706" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 7v4M9 13v.5" stroke="#D97706" stroke-width="1.5" stroke-linecap="round"/></svg><div><strong>Integração não configurada</strong><br>Adicione <code>AGENDAEDU_CLIENT_ID</code> e <code>AGENDAEDU_CLIENT_SECRET</code> no Railway.</div></div>`;
  return `<div class="est-empty"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="1.5"/><path d="M12 12l8 8M20 12l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Erro: ${escHtml(msg||'Tente novamente')}</div>`;
}

async function _estFetch(ep) { return apiRequest('GET', `/api/agendaedu/estrutura/${ep}?per_page=100`); }
async function _estPost(ep, body) { return apiRequest('POST', `/api/agendaedu/estrutura/${ep}`, body); }
function _estToggleForm(id) { document.getElementById(id)?.classList.toggle('open'); }

/* ── UNIDADES ── */
async function estRenderUnidades() {
  _estBodyHTML('<div class="est-section"><div class="est-loading">Carregando unidades…</div></div>');
  if (!_estCache.unidades) { try { _estCache.unidades = await _estFetch('headquarters'); } catch(err) { _estBodyHTML(`<div class="est-section">${_estErrorHTML(err.message)}</div>`); return; } }
  const items = _estCache.unidades.data || [];
  const listHTML = items.length === 0 ? '<div class="est-empty"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M4 28V12l12-8 12 8v16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Nenhuma unidade cadastrada.</div>'
    : items.map(item => { const a=item.attributes||{}; return `<div class="est-list-item"><div class="est-item-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 14V6l6-4 6 4v8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="est-item-info"><div class="est-item-name">${escHtml(a.name||'—')}</div><div class="est-item-meta">ID: ${escHtml(String(item.id))}${a.external_id?' · Ext: '+escHtml(a.external_id):''}</div></div><span class="est-item-badge est-badge-active">Ativa</span></div>`; }).join('');
  _estBodyHTML(`<div class="est-section"><div class="est-section-header"><span class="est-section-title"><svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 14V6l6-4 6 4v8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Unidades cadastradas<span class="est-count-badge">${items.length}</span></span><button class="btn-primary" style="font-size:12px;padding:6px 12px" onclick="_estToggleForm('formUnidade')">+ Nova Unidade</button></div><div class="est-create-form" id="formUnidade"><div class="est-form-row"><div class="est-form-group"><label>Nome *</label><input type="text" id="estUnidadeNome" placeholder="Ex: PED Pituba"/></div><div class="est-form-group"><label>External ID</label><input type="text" id="estUnidadeExtId" placeholder="Ex: UN001"/></div><div class="est-form-group"><label>Custom ID</label><input type="text" id="estUnidadeCustomId" placeholder="Ex: AgendaEdu:101"/></div></div><div class="est-form-actions"><button class="btn-secondary" onclick="_estToggleForm('formUnidade')">Cancelar</button><button class="btn-primary" onclick="estCriarUnidade()">Cadastrar</button></div></div><div class="est-list">${listHTML}</div></div>`);
}
async function estCriarUnidade() {
  const nome=document.getElementById('estUnidadeNome')?.value.trim(), extId=document.getElementById('estUnidadeExtId')?.value.trim(), customId=document.getElementById('estUnidadeCustomId')?.value.trim();
  if(!nome){showToast('Nome obrigatório','warn');return;}
  const p={headquarter:{name:nome}}; if(extId) p.headquarter.external_id=extId; if(customId) p.headquarter.custom_id=customId;
  try { await _estPost('headquarters',p); _estCache.unidades=null; showToast('Unidade criada!','success'); estRenderUnidades(); } catch(err){showToast('Erro: '+err.message,'error');}
}

/* ── PERÍODO LETIVO ── */
async function estRenderPeriodos() {
  _estBodyHTML('<div class="est-section"><div class="est-loading">Carregando períodos…</div></div>');
  if (!_estCache.periodos) { try { _estCache.periodos = await _estFetch('school-terms'); } catch(err) { _estBodyHTML(`<div class="est-section">${_estErrorHTML(err.message)}</div>`); return; } }
  const items = _estCache.periodos.data || [];
  const listHTML = items.length === 0 ? '<div class="est-empty">Nenhum período letivo cadastrado.</div>'
    : items.map(item => { const a=item.attributes||{}, ativo=a.status===true; return `<div class="est-list-item"><div class="est-item-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M5 5h2v6H5zM9 7h2v4H9z" fill="currentColor" opacity=".6"/></svg></div><div class="est-item-info"><div class="est-item-name">${escHtml(a.name||'—')}</div><div class="est-item-meta">ID: ${escHtml(String(item.id))}</div></div>${ativo?'<span class="est-item-badge est-badge-active">Ativo</span>':`<button class="btn-secondary" style="font-size:11px;padding:4px 10px" onclick="estAtivarPeriodo('${escHtml(String(item.id))}')">Ativar</button>`}</div>`; }).join('');
  _estBodyHTML(`<div class="est-section"><div class="est-section-header"><span class="est-section-title"><svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M5 5h2v6H5zM9 7h2v4H9z" fill="currentColor" opacity=".6"/></svg>Períodos Letivos<span class="est-count-badge">${items.length}</span></span><button class="btn-primary" style="font-size:12px;padding:6px 12px" onclick="_estToggleForm('formPeriodo')">+ Novo Período</button></div><div class="est-create-form" id="formPeriodo"><div class="est-form-row"><div class="est-form-group"><label>Nome *</label><input type="text" id="estPeriodoNome" placeholder="Ex: 2026"/></div></div><div class="est-form-actions"><button class="btn-secondary" onclick="_estToggleForm('formPeriodo')">Cancelar</button><button class="btn-primary" onclick="estCriarPeriodo()">Cadastrar</button></div></div><div class="est-list">${listHTML}</div></div>`);
}
async function estCriarPeriodo() {
  const nome=document.getElementById('estPeriodoNome')?.value.trim(); if(!nome){showToast('Nome obrigatório','warn');return;}
  try { await _estPost('school-terms',{school_term:{name:nome}}); _estCache.periodos=null; showToast('Período criado!','success'); estRenderPeriodos(); } catch(err){showToast('Erro: '+err.message,'error');}
}
async function estAtivarPeriodo(id) {
  try { await apiRequest('POST',`/api/agendaedu/estrutura/school-terms/${encodeURIComponent(id)}/activate`); _estCache.periodos=null; showToast('Período ativado!','success'); estRenderPeriodos(); } catch(err){showToast('Erro: '+err.message,'error');}
}

/* ── TURMAS ── */
async function estRenderTurmas() {
  _estBodyHTML('<div class="est-section"><div class="est-loading">Carregando turmas…</div></div>');
  let dataT=_estCache.turmas, dataU=_estCache.unidades, dataD=_estCache.disciplinas;
  try { [dataT,dataU,dataD] = await Promise.all([dataT?Promise.resolve(dataT):_estFetch('classrooms'), dataU?Promise.resolve(dataU):_estFetch('headquarters'), dataD?Promise.resolve(dataD):_estFetch('disciplines')]); _estCache.turmas=dataT; _estCache.unidades=dataU; _estCache.disciplinas=dataD; } catch(err){ _estBodyHTML(`<div class="est-section">${_estErrorHTML(err.message)}</div>`); return; }
  const items=dataT.data||[], unidades=dataU.data||[];
  const unidadeOpts=unidades.map(u=>`<option value="${escHtml(String(u.id))}">${escHtml(u.attributes?.name||u.id)}</option>`).join('');
  const stageOpts=Object.entries(EST_STAGES).map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
  const listHTML=items.length===0?'<div class="est-empty">Nenhuma turma cadastrada.</div>'
    :items.map(item=>{const a=item.attributes||{},hq=item.relationships?.headquarter?.data,hqName=hq?(unidades.find(u=>String(u.id)===String(hq.id))?.attributes?.name||hq.id):'—',stage=EST_STAGES[a.educational_stage]||a.educational_stage||'—'; return `<div class="est-list-item"><div class="est-item-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M5 4V3a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.3"/></svg></div><div class="est-item-info"><div class="est-item-name">${escHtml(a.name||'—')}</div><div class="est-item-meta">${escHtml(stage)} · ${escHtml(String(hqName))}</div></div><span class="est-item-badge" style="background:#F5F3FF;color:#7C3AED">${escHtml(stage)}</span></div>`;}).join('');
  _estBodyHTML(`<div class="est-section"><div class="est-section-header"><span class="est-section-title"><svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M5 4V3a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.3"/></svg>Turmas<span class="est-count-badge">${items.length}</span></span><button class="btn-primary" style="font-size:12px;padding:6px 12px" onclick="_estToggleForm('formTurma')">+ Nova Turma</button></div><div class="est-create-form" id="formTurma"><div class="est-form-row"><div class="est-form-group"><label>Nome *</label><input type="text" id="estTurmaNome" placeholder="Ex: 1º Ano A"/></div><div class="est-form-group"><label>Unidade *</label><select id="estTurmaUnidade"><option value="">Selecione…</option>${unidadeOpts}</select></div><div class="est-form-group"><label>Segmento *</label><select id="estTurmaStage">${stageOpts}</select></div></div><div class="est-form-row"><div class="est-form-group"><label>Sala</label><input type="text" id="estTurmaSala" placeholder="Ex: Sala 102"/></div><div class="est-form-group"><label>External ID</label><input type="text" id="estTurmaExtId" placeholder="Ex: T001"/></div><div class="est-form-group"><label>IDs das Disciplinas (vírgula)</label><input type="text" id="estTurmaDiscs" placeholder="Ex: 3867, 3868"/></div></div><div class="est-form-actions"><button class="btn-secondary" onclick="_estToggleForm('formTurma')">Cancelar</button><button class="btn-primary" onclick="estCriarTurma()">Cadastrar</button></div></div><div class="est-list">${listHTML}</div></div>`);
}
async function estCriarTurma() {
  const nome=document.getElementById('estTurmaNome')?.value.trim(),unidade=document.getElementById('estTurmaUnidade')?.value,stage=document.getElementById('estTurmaStage')?.value,sala=document.getElementById('estTurmaSala')?.value.trim(),extId=document.getElementById('estTurmaExtId')?.value.trim(),discStr=document.getElementById('estTurmaDiscs')?.value.trim();
  if(!nome){showToast('Nome obrigatório','warn');return;} if(!unidade){showToast('Selecione a unidade','warn');return;}
  const discIds=discStr?discStr.split(',').map(s=>s.trim()).filter(Boolean).map(s=>isNaN(s)?s:Number(s)):[];
  const p={classroom:{name:nome,headquarter_id:unidade,educational_stage_name:stage,discipline_ids:discIds}};
  if(sala) p.classroom.room=sala; if(extId) p.classroom.external_id=extId;
  try { await _estPost('classrooms',p); _estCache.turmas=null; showToast('Turma criada!','success'); estRenderTurmas(); } catch(err){showToast('Erro: '+err.message,'error');}
}

/* ── DISCIPLINAS ── */
async function estRenderDisciplinas() {
  _estBodyHTML('<div class="est-section"><div class="est-loading">Carregando disciplinas…</div></div>');
  if (!_estCache.disciplinas) { try { _estCache.disciplinas = await _estFetch('disciplines'); } catch(err) { _estBodyHTML(`<div class="est-section">${_estErrorHTML(err.message)}</div>`); return; } }
  const items=_estCache.disciplinas.data||[];
  const listHTML=items.length===0?'<div class="est-empty">Nenhuma disciplina cadastrada.</div>'
    :items.map(item=>{const a=item.attributes||{},nT=(a.classroom_ids||[]).length; return `<div class="est-list-item"><div class="est-item-icon" style="background:#FFF7ED;color:#EA580C"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2h8l2 2v10H3V2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 7h4M6 10h4M6 4h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></div><div class="est-item-info"><div class="est-item-name">${escHtml(a.name||'—')}</div><div class="est-item-meta">${a.slug?'Sigla: '+escHtml(a.slug)+' · ':''}${nT} turma${nT!==1?'s':''}</div></div><span class="est-item-badge" style="background:#FFF7ED;color:#EA580C">ID ${escHtml(String(item.id))}</span></div>`;}).join('');
  _estBodyHTML(`<div class="est-section"><div class="est-section-header"><span class="est-section-title"><svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 2h8l2 2v10H3V2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>Disciplinas<span class="est-count-badge">${items.length}</span></span><button class="btn-primary" style="font-size:12px;padding:6px 12px" onclick="_estToggleForm('formDisciplina')">+ Nova Disciplina</button></div><div class="est-create-form" id="formDisciplina"><div class="est-form-row"><div class="est-form-group"><label>Nome *</label><input type="text" id="estDiscNome" placeholder="Ex: Matemática"/></div><div class="est-form-group"><label>Sigla</label><input type="text" id="estDiscSlug" placeholder="Ex: MAT_01"/></div><div class="est-form-group"><label>External ID</label><input type="text" id="estDiscExtId" placeholder="Ex: DI001"/></div></div><div class="est-form-actions"><button class="btn-secondary" onclick="_estToggleForm('formDisciplina')">Cancelar</button><button class="btn-primary" onclick="estCriarDisciplina()">Cadastrar</button></div></div><div class="est-list">${listHTML}</div></div>`);
}
async function estCriarDisciplina() {
  const nome=document.getElementById('estDiscNome')?.value.trim(),slug=document.getElementById('estDiscSlug')?.value.trim(),extId=document.getElementById('estDiscExtId')?.value.trim();
  if(!nome){showToast('Nome obrigatório','warn');return;}
  const p={discipline:{name:nome}}; if(slug) p.discipline.slug=slug; if(extId) p.discipline.external_id=extId;
  try { await _estPost('disciplines',p); _estCache.disciplinas=null; showToast('Disciplina criada!','success'); estRenderDisciplinas(); } catch(err){showToast('Erro: '+err.message,'error');}
}

/* ── PROFISSIONAIS ── */
async function estRenderProfissionais() {
  _estBodyHTML('<div class="est-section"><div class="est-loading">Carregando profissionais…</div></div>');
  if (!_estCache.profissionais) { try { _estCache.profissionais = await _estFetch('school-users'); } catch(err) { _estBodyHTML(`<div class="est-section">${_estErrorHTML(err.message)}</div>`); return; } }
  const items=_estCache.profissionais.data||[];
  const roleOpts=Object.entries(EST_ROLES).map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
  const listHTML=items.length===0?'<div class="est-empty">Nenhum profissional cadastrado.</div>'
    :items.map(item=>{const a=item.attributes||{},prf=a.profile||{},role=EST_ROLES[a.role]||a.role||'—',ativo=a.status==='active'; return `<div class="est-list-item"><div class="est-item-icon" style="background:#F0FDF4;color:#16A34A"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></div><div class="est-item-info"><div class="est-item-name">${escHtml(prf.name||a.name||a.username||'—')}</div><div class="est-item-meta">${escHtml(role)} · ${escHtml(a.email||a.username||'')} · ID ${escHtml(String(item.id))}</div></div><span class="est-item-badge ${ativo?'est-badge-active':'est-badge-inactive'}">${ativo?'Ativo':'Bloqueado'}</span></div>`;}).join('');
  _estBodyHTML(`<div class="est-section"><div class="est-section-header"><span class="est-section-title"><svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>Profissionais<span class="est-count-badge">${items.length}</span></span><button class="btn-primary" style="font-size:12px;padding:6px 12px" onclick="_estToggleForm('formProfissional')">+ Novo Profissional</button></div><div class="est-create-form" id="formProfissional"><div class="est-form-row"><div class="est-form-group"><label>Nome *</label><input type="text" id="estProfNome" placeholder="Ex: Maria Silva"/></div><div class="est-form-group"><label>E-mail *</label><input type="email" id="estProfEmail" placeholder="Ex: maria@escola.com"/></div><div class="est-form-group"><label>Username *</label><input type="text" id="estProfUsername" placeholder="Ex: maria.silva"/></div></div><div class="est-form-row"><div class="est-form-group"><label>Cargo *</label><select id="estProfRole">${roleOpts}</select></div><div class="est-form-group"><label>External ID *</label><input type="text" id="estProfExtId" placeholder="Ex: PROF001"/></div><div class="est-form-group"><label>Confirmar conta</label><select id="estProfConfirm"><option value="true">Sim</option><option value="false">Não</option></select></div></div><div class="est-form-actions"><button class="btn-secondary" onclick="_estToggleForm('formProfissional')">Cancelar</button><button class="btn-primary" onclick="estCriarProfissional()">Cadastrar</button></div></div><div class="est-list">${listHTML}</div></div>`);
}
async function estCriarProfissional() {
  const nome=document.getElementById('estProfNome')?.value.trim(),email=document.getElementById('estProfEmail')?.value.trim(),username=document.getElementById('estProfUsername')?.value.trim(),role=document.getElementById('estProfRole')?.value,extId=document.getElementById('estProfExtId')?.value.trim(),confirm=document.getElementById('estProfConfirm')?.value==='true';
  if(!nome||!email||!username||!extId){showToast('Preencha todos os campos obrigatórios','warn');return;}
  try { await _estPost('school-users',{school_user:{external_id:extId,email,username,status:'active',confirm,role,profile_attributes:{name:nome}}}); _estCache.profissionais=null; showToast('Profissional criado!','success'); estRenderProfissionais(); } catch(err){showToast('Erro: '+err.message,'error');}
}

/* ── RESPONSÁVEIS ── */
async function estRenderResponsaveis() {
  _estBodyHTML('<div class="est-section"><div class="est-loading">Carregando responsáveis…</div></div>');
  if (!_estCache.responsaveis) { try { _estCache.responsaveis = await _estFetch('responsible-profiles'); } catch(err) { _estBodyHTML(`<div class="est-section">${_estErrorHTML(err.message)}</div>`); return; } }
  const items = _estCache.responsaveis.data || [];
  const kinshipOpts = Object.entries(EST_KINSHIP).map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
  const listHTML = items.length === 0
    ? '<div class="est-empty"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="11" cy="10" r="5" stroke="currentColor" stroke-width="1.5"/><circle cx="21" cy="10" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M2 28c0-5 4-9 9-9s9 4 9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M21 19c4 0 9 3.5 9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Nenhum responsável cadastrado.</div>'
    : items.map(item => {
        const a = item.attributes || {};
        const kinship = EST_KINSHIP[a.kinship] || a.kinship || '—';
        const ativo = a.status === 'active' || a.active === true;
        const alunos = (a.student_profile_ids || []).length;
        return `<div class="est-list-item">
          <div class="est-item-icon" style="background:#FFF1F2;color:#E11D48">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="5.5" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4"/><circle cx="10.5" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M1 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10.5 9.5C12.8 9.5 15 11.3 15 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </div>
          <div class="est-item-info">
            <div class="est-item-name">${escHtml(a.name || '—')}</div>
            <div class="est-item-meta">${escHtml(kinship)}${a.email?' · '+escHtml(a.email):''} · ${aluno => aluno === 1 ? '1 aluno' : aluno + ' alunos'}${alunos}</div>
          </div>
          <span class="est-item-badge ${ativo?'est-badge-active':'est-badge-inactive'}">${ativo?'Ativo':'Inativo'}</span>
        </div>`;
      }).join('');

  _estBodyHTML(`
    <div class="est-section">
      <div class="est-section-header">
        <span class="est-section-title">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="5.5" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4"/><circle cx="10.5" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M1 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10.5 9.5C12.8 9.5 15 11.3 15 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          Responsáveis
          <span class="est-count-badge">${items.length}</span>
        </span>
        <button class="btn-primary" style="font-size:12px;padding:6px 12px" onclick="_estToggleForm('formResponsavel')">+ Novo Responsável</button>
      </div>

      <div class="est-create-form" id="formResponsavel">
        <div class="est-form-row">
          <div class="est-form-group">
            <label>Nome completo *</label>
            <input type="text" id="estRespNome" placeholder="Ex: Maria Silva"/>
          </div>
          <div class="est-form-group">
            <label>E-mail *</label>
            <input type="email" id="estRespEmail" placeholder="Ex: maria@email.com"/>
          </div>
          <div class="est-form-group">
            <label>CPF</label>
            <input type="text" id="estRespCpf" placeholder="Ex: 999.999.999-99"/>
          </div>
        </div>
        <div class="est-form-row">
          <div class="est-form-group">
            <label>Parentesco</label>
            <select id="estRespKinship"><option value="">Selecione…</option>${kinshipOpts}</select>
          </div>
          <div class="est-form-group">
            <label>Telefone</label>
            <input type="text" id="estRespPhone" placeholder="Ex: (71) 99999-9999"/>
          </div>
          <div class="est-form-group">
            <label>IDs dos Alunos * (vírgula)</label>
            <input type="text" id="estRespAlunos" placeholder="Ex: 16910, 16911"/>
          </div>
        </div>
        <div class="est-form-row">
          <div class="est-form-group">
            <label>External ID</label>
            <input type="text" id="estRespExtId" placeholder="Ex: RE001"/>
          </div>
          <div class="est-form-group">
            <label>Financeiro?</label>
            <select id="estRespFinanceiro"><option value="false">Não</option><option value="true">Sim</option></select>
          </div>
          <div class="est-form-group">
            <label>Confirmar conta automaticamente</label>
            <select id="estRespConfirm"><option value="true">Sim</option><option value="false">Não</option></select>
          </div>
        </div>
        <div class="est-form-actions">
          <button class="btn-secondary" onclick="_estToggleForm('formResponsavel')">Cancelar</button>
          <button class="btn-primary" onclick="estCriarResponsavel()">Cadastrar Responsável</button>
        </div>
      </div>

      <div class="est-list">${listHTML}</div>
    </div>
  `);
}

async function estCriarResponsavel() {
  const nome    = document.getElementById('estRespNome')?.value.trim();
  const email   = document.getElementById('estRespEmail')?.value.trim();
  const cpf     = document.getElementById('estRespCpf')?.value.trim();
  const kinship = document.getElementById('estRespKinship')?.value;
  const phone   = document.getElementById('estRespPhone')?.value.trim();
  const alunosStr = document.getElementById('estRespAlunos')?.value.trim();
  const extId   = document.getElementById('estRespExtId')?.value.trim();
  const financial = document.getElementById('estRespFinanceiro')?.value === 'true';
  const confirm = document.getElementById('estRespConfirm')?.value === 'true';

  if (!nome)      { showToast('Nome é obrigatório', 'warn'); return; }
  if (!email)     { showToast('E-mail é obrigatório', 'warn'); return; }
  if (!alunosStr) { showToast('Informe ao menos um ID de aluno', 'warn'); return; }

  const studentIds = alunosStr.split(',').map(s => s.trim()).filter(Boolean).map(s => isNaN(s) ? s : Number(s));

  const payload = {
    responsible_profile: {
      name               : nome,
      email,
      student_profile_ids: studentIds,
      confirm,
      financial,
    }
  };
  if (extId)   payload.responsible_profile.external_id      = extId;
  if (cpf)     payload.responsible_profile.document_number  = cpf;
  if (kinship) payload.responsible_profile.kinship          = kinship;
  if (phone)   payload.responsible_profile.phone            = phone;

  try {
    await _estPost('responsible-profiles', payload);
    _estCache.responsaveis = null;
    showToast('Responsável cadastrado com sucesso!', 'success');
    estRenderResponsaveis();
  } catch(err) { showToast('Erro: ' + err.message, 'error'); }
}

/* ── Carregar escolas como "canais" ── */
async function chatFinLoadChannels() {
  const select = document.getElementById('chatFinChannelSelect');
  const banner = document.getElementById('chatFinConfigBanner');
  if (!select) return;
  if (banner) banner.classList.add('hidden');

  // Usa as escolas configuradas nas Settings; fallback para "Todas"
  const escolas = (settingsData.escolas || []);
  CHAT_FIN.channels = [
    { id: '', name: 'Todas as Escolas' },
    ...escolas.map(e => ({ id: e.id, name: e.nome || e.name || e.id })),
  ];

  select.innerHTML = CHAT_FIN.channels.map(ch =>
    `<option value="${escHtml(ch.id)}">${escHtml(ch.name)}</option>`
  ).join('');

  if (CHAT_FIN.currentChannel === null) CHAT_FIN.currentChannel = '';
  select.value = CHAT_FIN.currentChannel;
  chatFinLoadTickets();
}

/* ── Carregar tickets (API interna) ── */
async function chatFinLoadTickets() {
  const container = document.getElementById('chatFinTickets');
  if (container) container.innerHTML = '<div class="chat-fin-empty"><span>Carregando tickets…</span></div>';

  try {
    const qs = new URLSearchParams();
    if (CHAT_FIN.currentChannel) qs.set('escola', CHAT_FIN.currentChannel);
    if (CHAT_FIN.statusFilter)   qs.set('status', CHAT_FIN.statusFilter);
    const data = await apiRequest('GET', `/api/tickets${qs.toString() ? '?' + qs : ''}`);

    const items = data.data || [];
    CHAT_FIN.tickets  = items.map(chatFinNormalizeTicket);
    CHAT_FIN.filtered = CHAT_FIN.tickets;

    chatFinRenderTicketList();
  } catch (err) {
    console.error('[ChatFin] tickets:', err.message);
    if (container) container.innerHTML = `<div class="chat-fin-empty"><span>Erro ao carregar tickets: ${escHtml(err.message)}</span></div>`;
  }
}

/* ── Renderizar lista de tickets ── */
function chatFinRenderTicketList() {
  const container = document.getElementById('chatFinTickets');
  const badge     = document.getElementById('badge-chat_financeiro');
  if (!container) return;

  const q = (CHAT_FIN.searchQuery || '').toLowerCase();
  let tickets = CHAT_FIN.filtered;

  if (q) {
    tickets = tickets.filter(t =>
      (t.assunto || '').toLowerCase().includes(q) ||
      (t.solicitante || '').toLowerCase().includes(q)
    );
  }

  // Badge: total de tickets abertos em todos os canais
  const openCount = CHAT_FIN.tickets.filter(t =>
    ['waiting', 'in_attendance'].includes(t.status)
  ).length;
  if (badge) {
    badge.textContent = openCount;
    badge.style.display = openCount > 0 ? '' : 'none';
  }

  if (tickets.length === 0) {
    container.innerHTML = `
      <div class="chat-fin-empty" id="chatFinEmptyList">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M33 7H7a2 2 0 00-2 2v18a2 2 0 002 2h7v6l8-6h11a2 2 0 002-2V9a2 2 0 00-2-2z" stroke="#94A3B8" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        <span>${q ? 'Nenhum resultado para "' + escHtml(q) + '"' : 'Nenhum ticket neste canal'}</span>
      </div>`;
    return;
  }

  container.innerHTML = tickets.map(t => {
    const status   = t.status || 'waiting';
    const isActive = CHAT_FIN.selectedTicket?.id === t.id;
    const escola   = (settingsData.escolas || []).find(e => e.id === t.escola);
    return `
      <div class="chat-fin-ticket-item${isActive ? ' active' : ''}" data-ticket-id="${escHtml(t.id)}">
        <div class="chat-fin-ticket-header">
          <span class="chat-fin-ticket-title">${escHtml(t.assunto || '(sem assunto)')}</span>
          <span class="chat-fin-ticket-status ${chatFinStatusClass(status)}">${chatFinStatusLabel(status)}</span>
        </div>
        <div class="chat-fin-ticket-footer">
          <span class="chat-fin-ticket-date">${escHtml(t.solicitante || '—')}</span>
          ${escola ? `<span class="chat-fin-ticket-school">${escHtml(escola.nome)}</span>` : ''}
          <span class="chat-fin-ticket-date" style="margin-left:auto;opacity:.7">${escHtml(t.atualizadoEm || t.criadoEm || '')}</span>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.chat-fin-ticket-item').forEach(el => {
    el.addEventListener('click', () => chatFinSelectTicket(el.dataset.ticketId));
  });
}

/* ── Selecionar ticket (API interna) ── */
async function chatFinSelectTicket(ticketId) {
  const detailEmpty   = document.getElementById('chatFinDetailEmpty');
  const detailContent = document.getElementById('chatFinDetailContent');
  if (!detailEmpty || !detailContent) return;

  document.querySelectorAll('.chat-fin-ticket-item').forEach(el => {
    el.classList.toggle('active', el.dataset.ticketId === ticketId);
  });

  detailEmpty.classList.add('hidden');
  detailContent.classList.remove('hidden');
  detailContent.innerHTML = '<div style="padding:2rem;text-align:center;color:#64748B">Carregando ticket…</div>';

  try {
    const data   = await apiRequest('GET', `/api/tickets/${ticketId}`);
    const ticket = chatFinNormalizeTicket(data.data || data);

    CHAT_FIN.selectedTicket = ticket;
    const idx = CHAT_FIN.tickets.findIndex(t => t.id === ticketId);
    if (idx >= 0) CHAT_FIN.tickets[idx] = ticket;

    chatFinRenderTicketDetail(ticket);
  } catch (err) {
    detailContent.innerHTML = `<div style="padding:2rem;color:#EF4444">Erro ao carregar ticket: ${escHtml(err.message)}</div>`;
  }
}

/* ── Renderizar detalhe do ticket ── */
function chatFinRenderTicketDetail(ticket) {
  const status      = ticket.status || 'waiting';
  const statusLabel = chatFinStatusLabel(status);
  const statusCls   = chatFinStatusClass(status);
  const escola      = (settingsData.escolas || []).find(e => e.id === ticket.escola);
  const meName      = currentUser?.nome || 'Atendente';

  document.getElementById('chatFinDetailContent').innerHTML = `
    <div class="chat-fin-detail-header">
      <div class="chat-fin-detail-meta">
        <span class="chat-fin-ticket-status ${escHtml(statusCls)}">${escHtml(statusLabel)}</span>
        <span class="chat-fin-detail-date">${escHtml(ticket.criadoEm || '—')}</span>
      </div>
      <h3 class="chat-fin-detail-title">${escHtml(ticket.assunto || '(sem assunto)')}</h3>
      <div class="chat-fin-detail-info">
        <span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="vertical-align:middle;margin-right:3px">
            <circle cx="6" cy="4.5" r="2" stroke="currentColor" stroke-width="1.2"/>
            <path d="M2 10c0-2 1.8-3.5 4-3.5S10 8 10 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          Solicitante: <strong>${escHtml(ticket.solicitante || '—')}</strong>
        </span>
        ${ticket.atendente ? `<span style="margin-left:.75rem">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="vertical-align:middle;margin-right:3px">
            <circle cx="6" cy="4.5" r="2" stroke="currentColor" stroke-width="1.2"/>
            <path d="M2 10c0-2 1.8-3.5 4-3.5S10 8 10 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          Atendente: <strong>${escHtml(ticket.atendente)}</strong>
        </span>` : ''}
        ${escola ? `<span style="margin-left:.75rem;color:#64748B;font-size:11px">🏫 ${escHtml(escola.nome)}</span>` : ''}
      </div>
    </div>

    <div class="chat-fin-messages" id="chatFinMessages">
      <div class="chat-fin-bubble chat-fin-bubble--incoming">
        <div class="chat-fin-bubble-header">
          <span class="chat-fin-bubble-name">${escHtml(ticket.solicitante || '—')}</span>
          <span class="chat-fin-bubble-time">${escHtml(ticket.criadoEm || '')}</span>
        </div>
        <div class="chat-fin-bubble-text">${escHtml(ticket.descricao || '(sem descrição)')}</div>
      </div>
      ${(ticket.mensagens || []).map(m => {
        if (m.tipo === 'system') {
          return `<div class="chat-system" style="text-align:center;color:#94A3B8;font-size:11px;padding:6px 0">${escHtml(m.texto)} · ${escHtml(m.data || '')}</div>`;
        }
        const isMe = m.autor === meName;
        return `<div class="chat-fin-bubble ${isMe ? 'chat-fin-bubble--mine' : 'chat-fin-bubble--incoming'}">
          <div class="chat-fin-bubble-header">
            <span class="chat-fin-bubble-name">${escHtml(m.autor || '')}</span>
            <span class="chat-fin-bubble-time">${escHtml(m.data || '')}</span>
          </div>
          <div class="chat-fin-bubble-text">${escHtml(m.texto || '')}</div>
        </div>`;
      }).join('')}
    </div>

    ${status !== 'done' ? `
    <div class="chat-fin-reply-wrap">
      <textarea id="chatFinReplyInput" class="chat-fin-reply-input" placeholder="Digite sua resposta…" rows="2"></textarea>
      <button class="chat-fin-btn chat-fin-btn--send" id="chatFinSendBtn">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M12.5 1.5L6.5 7.5M12.5 1.5L8.5 12.5L6.5 7.5L1.5 5.5L12.5 1.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
        Enviar
      </button>
    </div>` : ''}

    <div class="chat-fin-actions" id="chatFinActions">
      ${status === 'waiting' ? `
        <button class="chat-fin-btn chat-fin-btn--start" id="chatFinBtnStart" data-ticket-id="${escHtml(ticket.id)}">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 2.5l6 4.5-6 4.5V2.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          </svg>
          Iniciar Atendimento
        </button>` : ''}
      ${(status === 'waiting' || status === 'in_attendance') ? `
        <button class="chat-fin-btn chat-fin-btn--close" id="chatFinBtnClose" data-ticket-id="${escHtml(ticket.id)}">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/>
            <path d="M4.5 7l2 2 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Encerrar Atendimento
        </button>` : ''}
      <button class="chat-fin-btn" onclick="chatFinLoadTickets()" style="background:transparent;color:#64748B;border:1px solid #E2E8F0">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M11 6.5A4.5 4.5 0 112 6.5M2 2v3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Atualizar
      </button>
    </div>`;

  // Scroll para fim das mensagens
  const msgs = document.getElementById('chatFinMessages');
  if (msgs) setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 30);

  // Eventos
  document.getElementById('chatFinBtnStart')?.addEventListener('click', e => chatFinStartTicket(e.currentTarget.dataset.ticketId));
  document.getElementById('chatFinBtnClose')?.addEventListener('click', e => chatFinCloseTicket(e.currentTarget.dataset.ticketId));
  document.getElementById('chatFinSendBtn')?.addEventListener('click', () => chatFinSendMessage(ticket.id));
  document.getElementById('chatFinReplyInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatFinSendMessage(ticket.id); }
  });
}

/* ── Enviar mensagem (API interna) ── */
async function chatFinSendMessage(ticketId) {
  const input = document.getElementById('chatFinReplyInput');
  const btn   = document.getElementById('chatFinSendBtn');
  if (!input) return;
  const texto = input.value.trim();
  if (!texto) return;

  if (btn) btn.disabled = true;
  try {
    const data = await apiRequest('POST', `/api/tickets/${ticketId}/mensagens`, { texto });
    const msg  = data.data;
    input.value = '';
    // Adicionar mensagem na UI sem recarregar tudo
    const msgs = document.getElementById('chatFinMessages');
    if (msgs && msg) {
      const meName = currentUser?.nome || 'Atendente';
      const div = document.createElement('div');
      div.className = 'chat-fin-bubble chat-fin-bubble--mine';
      div.innerHTML = `
        <div class="chat-fin-bubble-header">
          <span class="chat-fin-bubble-name">${escHtml(msg.autor || meName)}</span>
          <span class="chat-fin-bubble-time">${chatFinFmtDate(msg.created_at)}</span>
        </div>
        <div class="chat-fin-bubble-text">${escHtml(msg.texto)}</div>`;
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }
    // Atualiza lista lateral (data de atualização)
    chatFinLoadTickets();
  } catch (err) {
    showToast(`Erro ao enviar mensagem: ${err.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ── Iniciar atendimento (API interna) ── */
async function chatFinStartTicket(ticketId) {
  const btn = document.getElementById('chatFinBtnStart');
  if (btn) btn.disabled = true;
  try {
    await apiRequest('PATCH', `/api/tickets/${ticketId}/status`, { status: 'in_attendance' });
    showToast('Atendimento iniciado!', 'success');
    await chatFinSelectTicket(ticketId);
    chatFinLoadTickets();
  } catch (err) {
    showToast(`Erro ao iniciar atendimento: ${err.message}`, 'error');
    if (btn) btn.disabled = false;
  }
}

/* ── Encerrar atendimento (API interna) ── */
async function chatFinCloseTicket(ticketId) {
  if (!confirm('Encerrar este atendimento?')) return;
  const btn = document.getElementById('chatFinBtnClose');
  if (btn) btn.disabled = true;
  try {
    await apiRequest('PATCH', `/api/tickets/${ticketId}/status`, { status: 'done' });
    showToast('Atendimento encerrado.', 'success');
    CHAT_FIN.selectedTicket = null;
    document.getElementById('chatFinDetailEmpty')?.classList.remove('hidden');
    document.getElementById('chatFinDetailContent')?.classList.add('hidden');
    chatFinLoadTickets();
  } catch (err) {
    showToast(`Erro ao encerrar atendimento: ${err.message}`, 'error');
    if (btn) btn.disabled = false;
  }
}

/* ── Novo Ticket ── */
function openChatFinNovoTicket() {
  const overlay = document.getElementById('chatFinNovoOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  // Popula select de escola
  const sel = document.getElementById('chatFinNovoCanal');
  if (sel) {
    const escolas = settingsData.escolas || [];
    sel.innerHTML = '<option value="">Selecione a escola...</option>' +
      escolas.map(e => `<option value="${escHtml(e.id)}"${e.id === CHAT_FIN.currentChannel ? ' selected' : ''}>${escHtml(e.nome || e.name || e.id)}</option>`).join('');
    if (CHAT_FIN.currentChannel) sel.value = CHAT_FIN.currentChannel;
  }
  setTimeout(() => document.getElementById('chatFinNovoAssunto')?.focus(), 50);
}

function closeChatFinNovoTicket() {
  const overlay = document.getElementById('chatFinNovoOverlay');
  if (overlay) overlay.style.display = 'none';
  // Limpa campos
  ['chatFinNovoAssunto','chatFinNovoSolicitante','chatFinNovoDescricao'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

async function chatFinSalvarNovoTicket() {
  const assunto      = (document.getElementById('chatFinNovoAssunto')?.value      || '').trim();
  const descricao    = (document.getElementById('chatFinNovoDescricao')?.value    || '').trim();
  const solicitante  = (document.getElementById('chatFinNovoSolicitante')?.value  || '').trim();
  const escola       = document.getElementById('chatFinNovoCanal')?.value || CHAT_FIN.currentChannel || '';

  if (!assunto) { showToast('Informe o assunto do ticket', 'warn'); return; }

  const btnSalvar = document.getElementById('chatFinNovoSalvar');
  if (btnSalvar) btnSalvar.disabled = true;

  try {
    const payload = { assunto, descricao, escola, solicitante };
    const resp    = await apiRequest('POST', '/api/tickets', payload);
    const newId   = (resp.data || resp)?.id;

    closeChatFinNovoTicket();
    showToast('Ticket criado com sucesso!', 'success');
    await chatFinLoadTickets();
    if (newId) setTimeout(() => chatFinSelectTicket(String(newId)), 200);
  } catch (err) {
    showToast(`Erro ao criar ticket: ${err.message}`, 'error');
  } finally {
    if (btnSalvar) btnSalvar.disabled = false;
  }
}

/* ── Inicializar módulo Chat ── */
function initChatFinanceiro() {
  // Troca de canal
  document.getElementById('chatFinChannelSelect')?.addEventListener('change', async e => {
    CHAT_FIN.currentChannel = e.target.value; // agora é o id da escola
    CHAT_FIN.selectedTicket = null;
    document.getElementById('chatFinDetailEmpty')?.classList.remove('hidden');
    document.getElementById('chatFinDetailContent')?.classList.add('hidden');
    await chatFinLoadTickets();
  });

  // Filtro de status
  document.getElementById('chatFinStatusFilter')?.addEventListener('change', async e => {
    CHAT_FIN.statusFilter = e.target.value;
    await chatFinLoadTickets();
  });

  // Botão Refresh
  document.getElementById('chatFinRefreshBtn')?.addEventListener('click', async () => {
    await chatFinLoadTickets();
    showToast('Atualizado', 'success');
  });

  // Busca
  document.getElementById('chatFinSearch')?.addEventListener('input', e => {
    CHAT_FIN.searchQuery = e.target.value;
    chatFinRenderTicketList();
  });

  // Novo Ticket
  document.getElementById('chatFinNovoBtn')?.addEventListener('click', openChatFinNovoTicket);
  document.getElementById('chatFinNovoClose')?.addEventListener('click', closeChatFinNovoTicket);
  document.getElementById('chatFinNovoCancelar')?.addEventListener('click', closeChatFinNovoTicket);
  document.getElementById('chatFinNovoSalvar')?.addEventListener('click', chatFinSalvarNovoTicket);
  document.getElementById('chatFinNovoOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('chatFinNovoOverlay')) closeChatFinNovoTicket();
  });
}

/* ══════════════════════════════════════════════════════════
   FORMULÁRIO PÚBLICO — Compartilhamento
══════════════════════════════════════════════════════════ */
function openFormShareModal() {
  const mod = getCurrentModule();
  const modKey = state.currentModule;
  const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/') + 'form.html';
  const link = `${baseUrl}?modulo=${encodeURIComponent(modKey)}`;
  const firstPhase = Object.values(mod.fases || {})[0]?.label || '—';

  document.getElementById('formShareModuleName').textContent = mod.label || modKey;
  document.getElementById('formShareLink').value = link;
  document.getElementById('formSharePhaseName').textContent = firstPhase;

  // QR Code via API pública
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(link)}`;
  const qrImg = document.getElementById('formShareQrImg');
  if (qrImg) qrImg.src = qrUrl;

  document.getElementById('formShareOverlay').style.display = 'flex';
}

function closeFormShareModal() {
  document.getElementById('formShareOverlay').style.display = 'none';
}

function initFormShare() {
  document.getElementById('formShareBtn').addEventListener('click', openFormShareModal);
  document.getElementById('formShareClose').addEventListener('click', closeFormShareModal);
  document.getElementById('formShareOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('formShareOverlay')) closeFormShareModal();
  });
  document.getElementById('formShareCopyBtn').addEventListener('click', () => {
    const link = document.getElementById('formShareLink').value;
    navigator.clipboard.writeText(link).then(
      () => showToast('Link copiado para a área de transferência!', 'success'),
      () => showToast('Não foi possível copiar o link', 'warn')
    );
  });
}

/* ══════════════════════════════════════════════════════════
   SISTEMA DE CONVITES
══════════════════════════════════════════════════════════ */
function openInviteModal() {
  // Renderiza checkboxes de módulos
  const container = document.getElementById('inviteModulosCheck');
  if (container) {
    container.innerHTML = Object.entries(MODULES).map(([key, mod]) =>
      `<label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#475569;cursor:pointer">
        <input type="checkbox" value="${key}" style="width:13px;height:13px">
        ${escHtml(mod.shortLabel || mod.label)}
      </label>`
    ).join('');
  }
  document.getElementById('inviteLinkResult').style.display = 'none';
  document.getElementById('inviteError').style.display = 'none';
  document.getElementById('inviteEmail').value = '';
  document.getElementById('inviteNome').value = '';
  document.getElementById('inviteModalOverlay').style.display = 'flex';
}

function closeInviteModal() {
  document.getElementById('inviteModalOverlay').style.display = 'none';
}

function initInvite() {
  document.getElementById('inviteModalClose')?.addEventListener('click', closeInviteModal);
  document.getElementById('inviteCancelBtn')?.addEventListener('click', closeInviteModal);
  document.getElementById('inviteModalOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('inviteModalOverlay')) closeInviteModal();
  });

  document.getElementById('inviteSubmitBtn')?.addEventListener('click', async () => {
    const email  = document.getElementById('inviteEmail').value.trim();
    const nome   = document.getElementById('inviteNome').value.trim();
    const perfil = document.getElementById('invitePerfil').value;
    const modulos = [...document.querySelectorAll('#inviteModulosCheck input:checked')].map(c => c.value);
    const errorEl = document.getElementById('inviteError');
    const resultEl = document.getElementById('inviteLinkResult');
    const btn = document.getElementById('inviteSubmitBtn');

    errorEl.style.display = 'none';
    resultEl.style.display = 'none';

    if (!email) { errorEl.textContent = 'Informe o e-mail do convidado.'; errorEl.style.display = ''; return; }

    btn.disabled = true;
    btn.textContent = 'Gerando...';

    try {
      const res = await apiRequest('POST', '/api/invite', { email, nome, perfil, modulos, escolas:[] });
      document.getElementById('inviteLinkInput').value = res.url;
      resultEl.style.display = '';
      showToast('Convite gerado com sucesso!', 'success');
    } catch (err) {
      errorEl.textContent = err.message || 'Erro ao gerar convite.';
      errorEl.style.display = '';
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Gerar Link de Convite`;
    }
  });

  document.getElementById('inviteLinkCopyBtn')?.addEventListener('click', () => {
    const link = document.getElementById('inviteLinkInput').value;
    navigator.clipboard.writeText(link).then(
      () => showToast('Link de convite copiado!', 'success'),
      () => showToast('Não foi possível copiar', 'warn')
    );
  });
}

/* ══════════════════════════════════════════════════════════
   QUICK CREATE — Templates pré-preenchidos
══════════════════════════════════════════════════════════ */
const QUICK_TEMPLATES = [
  {
    icon: '💳',
    label: 'Pagamento',
    desc: 'Conta a pagar ou receber',
    modulo: 'contas_pagar',
    titulo: 'Pagamento pendente',
    categoria: 'Fornecedores',
    prioridade: 'media',
  },
  {
    icon: '🛒',
    label: 'Compra',
    desc: 'Solicitação de compra',
    modulo: 'compras',
    titulo: 'Solicitação de compra',
    categoria: 'Material de Escritório',
    prioridade: 'media',
  },
  {
    icon: '💻',
    label: 'Chamado de T.I',
    desc: 'Suporte técnico',
    modulo: 'ti',
    titulo: 'Chamado de suporte',
    categoria: 'Suporte ao Usuário',
    prioridade: 'media',
  },
  {
    icon: '🔧',
    label: 'Manutenção',
    desc: 'Reparo ou manutenção',
    modulo: 'solicitacoes',
    titulo: 'Solicitação de manutenção',
    categoria: 'Manutenção',
    prioridade: 'media',
  },
  {
    icon: '👤',
    label: 'RH',
    desc: 'Solicitação de RH',
    modulo: 'recursos_humanos',
    titulo: 'Solicitação de RH',
    categoria: 'Outros',
    prioridade: 'media',
  },
  {
    icon: '📋',
    label: 'Do zero',
    desc: 'Card em branco',
    modulo: null,
    titulo: '',
    categoria: '',
    prioridade: 'media',
  },
];

function openQuickCreate() {
  const grid = document.getElementById('quickTemplatesGrid');
  if (!grid) return;

  grid.innerHTML = QUICK_TEMPLATES.map((tpl, i) => `
    <button class="quick-template-card" data-idx="${i}">
      <div class="quick-template-icon">${tpl.icon}</div>
      <div class="quick-template-label">${escHtml(tpl.label)}</div>
      <div class="quick-template-desc">${escHtml(tpl.desc)}</div>
    </button>
  `).join('');

  grid.querySelectorAll('.quick-template-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const tpl = QUICK_TEMPLATES[+btn.dataset.idx];
      closeQuickCreate();
      applyTemplate(tpl);
    });
  });

  document.getElementById('quickCreateOverlay').style.display = 'flex';
}

function closeQuickCreate() {
  document.getElementById('quickCreateOverlay').style.display = 'none';
}

function applyTemplate(tpl) {
  // Muda de módulo se necessário
  if (tpl.modulo && tpl.modulo !== state.currentModule && MODULES[tpl.modulo]) {
    switchModule(tpl.modulo);
  }
  // Abre modal com dados pré-preenchidos
  setTimeout(() => {
    openModal(null);
    setTimeout(() => {
      if (tpl.titulo)    { const el = document.getElementById('formTitulo');    if (el) el.value = tpl.titulo; }
      if (tpl.categoria) { const el = document.getElementById('formCategoria'); if (el) el.value = tpl.categoria; }
      if (tpl.prioridade){ const el = document.getElementById('formPrioridade');if (el) el.value = tpl.prioridade; }
    }, 80);
  }, tpl.modulo ? 300 : 0);
}

function initQuickCreate() {
  document.getElementById('quickCreateFab')?.addEventListener('click', openQuickCreate);
  document.getElementById('quickCreateClose')?.addEventListener('click', closeQuickCreate);
  document.getElementById('quickCreateOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('quickCreateOverlay')) closeQuickCreate();
  });
}

/* ══════════════════════════════════════════════════════════
   NOTIFICAÇÕES — Sistema de alertas úteis
══════════════════════════════════════════════════════════ */
const NOTIF_KEY = 'ped_notifications';

function loadNotifications() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch(_) { return []; }
}
function saveNotifications(notifs) {
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(notifs.slice(0, 50))); } catch(_) {}
}

function addNotification(msg, type, cardId) {
  const notifs = loadNotifications();
  notifs.unshift({
    id    : uid(),
    msg,
    type  : type || 'info',
    cardId: cardId || null,
    ts    : new Date().toISOString(),
    read  : false,
  });
  saveNotifications(notifs);
  renderNotifBadge();
}

function renderNotifBadge() {
  const notifs = loadNotifications();
  const unread = notifs.filter(n => !n.read).length;
  const badge  = document.getElementById('notifBadge');
  if (badge) {
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.style.display = unread > 0 ? '' : 'none';
  }
}

function renderNotifPanel() {
  const notifs = loadNotifications();
  const list   = document.getElementById('notifList');
  if (!list) return;

  if (!notifs.length) {
    list.innerHTML = '<div class="notif-empty">Nenhuma notificação</div>';
    return;
  }

  const icons = { info:'ℹ️', warn:'⚠️', success:'✅', error:'🔴', assign:'👤', move:'↗️' };
  list.innerHTML = notifs.map(n => {
    const ts = new Date(n.ts).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    return `<div class="notif-item ${n.read ? '' : 'notif-item--unread'}" data-id="${n.id}" data-card="${n.cardId || ''}">
      <span class="notif-item-icon">${icons[n.type] || 'ℹ️'}</span>
      <div class="notif-item-body">
        <div class="notif-item-msg">${escHtml(n.msg)}</div>
        <div class="notif-item-ts">${ts}</div>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', () => {
      const notifId = el.dataset.id;
      const cardId  = el.dataset.card;
      // Marca como lida
      const notifs2 = loadNotifications();
      const notif   = notifs2.find(n => n.id === notifId);
      if (notif) { notif.read = true; saveNotifications(notifs2); }
      renderNotifBadge();
      renderNotifPanel();
      // Abre card se houver
      if (cardId && allCards.find(c => c.id === cardId)) {
        const card = allCards.find(c => c.id === cardId);
        if (card && MODULES[card.modulo]) {
          if (card.modulo !== state.currentModule) switchModule(card.modulo);
          setTimeout(() => openModal(cardId), 200);
        }
      }
      closeNotifPanel();
    });
  });
}

function openNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  renderNotifPanel();
  panel.style.display = '';
  // Fecha ao clicar fora
  setTimeout(() => {
    document.addEventListener('click', closeNotifOnOutside);
  }, 0);
}

function closeNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (panel) panel.style.display = 'none';
  document.removeEventListener('click', closeNotifOnOutside);
}

function closeNotifOnOutside(e) {
  const panel = document.getElementById('notifPanel');
  const btn   = document.getElementById('notifBtn');
  if (panel && !panel.contains(e.target) && !btn?.contains(e.target)) {
    closeNotifPanel();
  }
}

function initNotifications() {
  renderNotifBadge();

  document.getElementById('notifBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = document.getElementById('notifPanel');
    if (panel?.style.display === 'none' || !panel?.style.display) openNotifPanel();
    else closeNotifPanel();
  });

  document.getElementById('notifClearBtn')?.addEventListener('click', () => {
    const notifs = loadNotifications().map(n => ({ ...n, read: true }));
    saveNotifications(notifs);
    renderNotifBadge();
    renderNotifPanel();
  });

  // Gera notificações de cards urgentes / SLA ao carregar
  setTimeout(() => {
    const urgentes = allCards.filter(c => {
      const mod = MODULES[c.modulo];
      if (!mod || c.fase === mod.lastPhase) return false;
      return c.prioridade === 'urgente' || isOverdue(c.prazo);
    });

    if (urgentes.length > 0) {
      const stored = loadNotifications();
      const todayKey = new Date().toDateString();
      const alreadyNotified = stored.some(n => n.msg?.includes('SLA') && n.ts?.startsWith(new Date().toISOString().slice(0,10)));
      if (!alreadyNotified) {
        addNotification(`🔴 ${urgentes.length} card(s) precisam de ação hoje (urgente ou SLA vencido)`, 'warn', null);
      }
    }
  }, 2000);
}

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
function init() {
  // Hash-based routing: escuta mudanças na URL
  window.addEventListener('hashchange', () => {
    const hash = location.hash.slice(1);
    if (hash === 'configuracoes') openSettings();
    else if (hash === 'dashboard') openDashboard();
    else if (hash === 'agenda') openAgenda();
    else if (hash === 'chat_financeiro') openChatFinanceiro();
    else if (hash === 'estrutura_escolar') openEstruturaEscolar();
    else if (MODULES[hash]) switchModule(hash);
  });

  // Module navigation (cliques na sidebar)
  document.querySelectorAll('.nav-item[data-module]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const target = el.dataset.module;
      if (target === 'configuracoes') {
        history.pushState(null, '', '#configuracoes');
        openSettings();
      } else if (target === 'dashboard') {
        history.pushState(null, '', '#dashboard');
        openDashboard();
      } else if (target === 'agenda') {
        history.pushState(null, '', '#agenda');
        openAgenda();
      } else if (target === 'chat_financeiro') {
        history.pushState(null, '', '#chat_financeiro');
        openChatFinanceiro();
      } else if (target === 'estrutura_escolar') {
        history.pushState(null, '', '#estrutura_escolar');
        openEstruturaEscolar();
      } else if (MODULES[target]) {
        history.pushState(null, '', '#' + target);
        switchModule(target);
      }
    });
  });

  // Settings: cliques nas abas do sub-menu
  document.getElementById('settingsView').addEventListener('click', e => {
    const tab = e.target.closest('.settings-tab-btn');
    if (tab && tab.dataset.tab) switchSettingsTab(tab.dataset.tab);
  });

  // School filter
  document.getElementById('schoolFilterSelect').addEventListener('change', function() {
    state.filterSchool = this.value;
    const school = SCHOOLS[this.value] || SCHOOLS.all;
    document.getElementById('sidebarSchoolAvatar').textContent    = school.sigla;
    document.getElementById('sidebarSchoolAvatar').style.background = school.cor;
    document.getElementById('sidebarSchoolName').textContent      = school.nome;
    document.getElementById('sidebarSchoolCount').textContent     = this.value === 'all' ? '4 unidades' : school.nome;
    renderAll();
  });

  // Search
  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.filterSearch = this.value; renderAll(); }, 200);
  });

  // New card button
  document.getElementById('newCardBtn').addEventListener('click', () => openModal(null));

  // Modal controls
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // Tab switching no drawer
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.pf-drawer-tab');
    if (!tab) return;
    const tabName = tab.dataset.tab;
    document.querySelectorAll('.pf-drawer-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.pf-drawer-tab-content').forEach(c => c.classList.add('hidden'));
    tab.classList.add('active');
    const content = document.getElementById('pf-tab-' + tabName);
    if (content) content.classList.remove('hidden');
  });

  document.getElementById('cardForm').addEventListener('submit', saveCard);
  document.getElementById('deleteCardBtn').addEventListener('click', deleteCard);

  // Comments (legacy - hidden form section)
  const legacyAddBtn = document.getElementById('addCommentBtnLegacy');
  if (legacyAddBtn) legacyAddBtn.addEventListener('click', addComment);
  const legacyInput = document.getElementById('commentInputLegacy');
  if (legacyInput) legacyInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addComment(); }
  });

  // Chat system init
  initChat();
  initChecklists();
  initSidebarGroups();

  // Sidebar
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    document.getElementById('appWrapper').classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
  });
  document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    document.getElementById('appWrapper').classList.toggle('sidebar-open');
  });

  // View toggle
  document.getElementById('viewKanban').addEventListener('click', () => setViewMode('kanban'));
  document.getElementById('viewList').addEventListener('click',   () => setViewMode('list'));

  // Smart sort toggle
  document.getElementById('smartSortBtn')?.addEventListener('click', function() {
    state.smartSort = !state.smartSort;
    this.classList.toggle('active', state.smartSort);
    this.textContent = state.smartSort ? '🔴 Smart ON' : '🔴 Prioridade automática';
    renderAll();
    if (state.smartSort) showToast('Cards ordenados por urgência e SLA', 'success');
  });

  // Minhas tarefas
  document.getElementById('myTasksBtn')?.addEventListener('click', function() {
    state.filterMyTasks = !state.filterMyTasks;
    this.classList.toggle('active', state.filterMyTasks);
    renderAll();
    if (state.filterMyTasks) showToast('Mostrando apenas seus cards', 'info');
    else showToast('Mostrando todos os cards', 'info');
  });

  // Mostrar/esconder parcelas ao mudar tipo de pagamento
  document.getElementById('formTipoPagamento').addEventListener('change', function () {
    const parcelasGroup = document.getElementById('parcelasGroup');
    if (this.value === 'credito') {
      parcelasGroup.style.display = '';
    } else {
      parcelasGroup.style.display = 'none';
      document.getElementById('formParcelas').value = '1';
    }
  });

  // Payment link actions
  document.getElementById('genLinkBtn').addEventListener('click', () => {
    if (state.editingCardId) generatePaymentLink(state.editingCardId);
  });
  document.getElementById('confirmPaymentBtn').addEventListener('click', () => {
    if (state.editingCardId && confirm('Confirmar o recebimento do pagamento?')) confirmPayment(state.editingCardId);
  });
  document.getElementById('copyLinkBtn').addEventListener('click', () => {
    const url = document.getElementById('linkUrl').textContent;
    if (url && url !== '—') {
      navigator.clipboard.writeText(url).then(
        () => showToast('Link copiado!', 'success'),
        () => showToast('Não foi possível copiar', 'warn')
      );
    }
  });

  // Attachment zone
  setupAttachmentZone();

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Lê o hash da URL na carga inicial e ativa o módulo correto
  // Carrega automações salvas
  state.automations = loadAutomations() || [];
  initAutomationPanel();
  initPhaseEditor();
  initChatFinanceiro();
  initFormShare();
  initInvite();
  initQuickCreate();
  initNotifications();
  initLogin();

  const initialHash = location.hash.slice(1);
  if (initialHash === 'configuracoes') openSettings();
  else if (initialHash === 'chat_financeiro') openChatFinanceiro();
  else if (initialHash === 'dashboard') openDashboard();
  else if (initialHash === 'agenda') openAgenda();
  else if (initialHash === 'estrutura_escolar') openEstruturaEscolar();
  else switchModule(MODULES[initialHash] ? initialHash : 'solicitacoes');

  console.log('%c🏫 Central Operacional — Grupo PED', 'color:#3B82F6;font-weight:bold;font-size:14px');
  console.log(`%c${Object.keys(MODULES).length} módulos · ${allCards.length} cards de exemplo`, 'color:#64748B;font-size:12px');
}

/* ══════════════════════════════════════════════════════════
   EDITOR DE FASE — Configuração por coluna do Kanban
══════════════════════════════════════════════════════════ */

const PHASE_COLORS = [
  '#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444',
  '#EC4899','#06B6D4','#F97316','#6366F1','#14B8A6',
  '#84CC16','#A855F7','#64748B','#0EA5E9','#D946EF',
];
const PHASE_BG_COLORS = [
  '#EFF6FF','#F5F3FF','#ECFDF5','#FFFBEB','#FEF2F2',
  '#FDF2F8','#F0FDFA','#FFF7ED','#EEF2FF','#F0FDFA',
  '#F7FEE7','#FAF5FF','#F8FAFC','#F0F9FF','#FDF4FF',
];

let _editingPhaseKey = null;

function openPhaseEditor(phaseKey) {
  const mod   = getCurrentModule();
  const phase = mod.fases[phaseKey];
  if (!phase) return;

  _editingPhaseKey = phaseKey;

  /* Preenche campos */
  document.getElementById('phaseEditorTitle').textContent = `Editar fase — ${phase.label}`;
  document.getElementById('phaseInputLabel').value        = phase.label;
  document.getElementById('phaseColorCustom').value       = phase.color  || '#3B82F6';
  document.getElementById('phaseBgCustom').value          = phase.bg     || '#EFF6FF';
  document.getElementById('phaseInputSLA').value          = phase.slaDias || '';
  document.getElementById('phaseIsFinal').checked         = (mod.lastPhase === phaseKey);

  /* Paleta de cores principais */
  renderPhasePalette('phaseColorPalette', phase.color, PHASE_COLORS, (cor) => {
    document.getElementById('phaseColorCustom').value = cor;
    updatePhasePreview();
  });

  /* Paleta de cores de fundo */
  renderPhasePalette('phaseBgPalette', phase.bg, PHASE_BG_COLORS, (cor) => {
    document.getElementById('phaseBgCustom').value = cor;
  });

  updatePhasePreview();

  /* Eventos inline de cor */
  document.getElementById('phaseColorCustom').oninput = updatePhasePreview;
  document.getElementById('phaseBgCustom').oninput    = updatePhasePreview;

  document.getElementById('phaseEditorOverlay').classList.add('active');
  document.getElementById('phaseInputLabel').focus();
}

function renderPhasePalette(containerId, selectedColor, palette, onSelect) {
  const el = document.getElementById(containerId);
  el.innerHTML = palette.map(cor => `
    <button type="button"
      class="phase-swatch ${cor === selectedColor ? 'selected' : ''}"
      data-cor="${cor}"
      style="background:${cor}"
      title="${cor}"></button>`).join('');

  el.querySelectorAll('.phase-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      el.querySelectorAll('.phase-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      onSelect(sw.dataset.cor);
    });
  });
}

function updatePhasePreview() {
  const label = document.getElementById('phaseInputLabel').value || 'Fase';
  const color = document.getElementById('phaseColorCustom').value;
  document.getElementById('phasePreviewDot').style.background   = color;
  document.getElementById('phaseEditorDot').style.background    = color;
  document.getElementById('phasePreviewLabel').textContent      = label;
  document.getElementById('phasePreviewLabel').style.color      = color;
}

function savePhaseEditor() {
  const label   = document.getElementById('phaseInputLabel').value.trim();
  if (!label) { showToast('O nome da fase não pode estar vazio', 'warn'); return; }

  const color   = document.getElementById('phaseColorCustom').value;
  const bg      = document.getElementById('phaseBgCustom').value;
  const slaDias = parseInt(document.getElementById('phaseInputSLA').value) || 0;
  const isFinal = document.getElementById('phaseIsFinal').checked;
  const mod     = getCurrentModule();

  /* Atualiza a fase */
  mod.fases[_editingPhaseKey].label   = label;
  mod.fases[_editingPhaseKey].color   = color;
  mod.fases[_editingPhaseKey].bg      = bg;
  mod.fases[_editingPhaseKey].slaDias = slaDias || undefined;

  /* Atualiza fase final */
  if (isFinal) mod.lastPhase = _editingPhaseKey;
  else if (mod.lastPhase === _editingPhaseKey) {
    const remaining = Object.keys(mod.fases);
    mod.lastPhase = remaining.length ? remaining[remaining.length - 1] : '';
  }

  closePhaseEditor();
  showToast(`Fase "${label}" atualizada!`, 'success');
  renderAll();
}

function closePhaseEditor() {
  document.getElementById('phaseEditorOverlay').classList.remove('active');
  _editingPhaseKey = null;
}

function initPhaseEditor() {
  document.getElementById('phaseEditorClose').addEventListener('click', closePhaseEditor);
  document.getElementById('phaseEditorCancel').addEventListener('click', closePhaseEditor);
  document.getElementById('phaseEditorSave').addEventListener('click', savePhaseEditor);
  document.getElementById('phaseEditorOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('phaseEditorOverlay')) closePhaseEditor();
  });
  document.getElementById('phaseInputLabel').addEventListener('input', updatePhasePreview);
}

/* ══════════════════════════════════════════════════════════
   AUTOMAÇÕES — Engine + UI (estilo Pipefy)
══════════════════════════════════════════════════════════ */

/* ── Definições de gatilhos disponíveis ── */
const TRIGGER_DEFS = [
  {
    type   : 'card_enter_phase',
    label  : 'Um card entrar em uma fase',
    icon   : '<path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    params : [
      { key:'modulo', label:'Fluxo',            type:'module-select'       },
      { key:'fase',   label:'Fase de entrada',  type:'phase-select-dynamic' },
    ],
  },
  {
    type   : 'card_leave_phase',
    label  : 'Um card sair de uma fase',
    icon   : '<path d="M13 8H3M7 4L3 8l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    params : [
      { key:'modulo', label:'Fluxo',          type:'module-select'       },
      { key:'fase',   label:'Fase de saída',  type:'phase-select-dynamic' },
    ],
  },
  {
    type   : 'card_created',
    label  : 'Um card for criado',
    icon   : '<path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    params : [],
  },
  {
    type   : 'field_updated',
    label  : 'Um campo for atualizado',
    icon   : '<path d="M11 2.5l2.5 2.5-7 7H4V9.5l7-7z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    params : [{ key:'campo', label:'Campo monitorado', type:'field-select' }],
  },
  {
    type   : 'sla_at_risk',
    label  : 'Um alerta de SLA for acionado',
    icon   : '<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3.5l2 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    params : [],
  },
  {
    type   : 'card_moved',
    label  : 'Um card for movido (arrastar)',
    icon   : '<rect x="1" y="4" width="14" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 8h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    params : [],
  },
];

/* ── Definições de ações disponíveis ── */
const ACTION_DEFS = [
  {
    type   : 'move_card',
    label  : 'Mova um card',
    icon   : '<path d="M2 8h12M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    params : [{ key:'targetFase', label:'Mover para a fase', type:'phase-select' }],
  },
  {
    type   : 'copy_to_module',
    label  : 'Copiar card para outro fluxo',
    icon   : '<rect x="1" y="5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.4"/><rect x="8" y="2" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M5 5V4a3 3 0 013-3h0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    params : [
      { key:'modulo', label:'Fluxo de destino',  type:'module-select'        },
      { key:'fase',   label:'Fase inicial',       type:'phase-select-dynamic' },
    ],
  },
  {
    type   : 'update_field',
    label  : 'Atualize um campo no card',
    icon   : '<path d="M11 2.5l2.5 2.5-7 7H4V9.5l7-7z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    params : [
      { key:'campo',  label:'Campo a atualizar', type:'field-select' },
      { key:'valor',  label:'Novo valor',         type:'text' },
    ],
  },
  {
    type   : 'send_notification',
    label  : 'Envie uma notificação',
    icon   : '<path d="M8 2a4 4 0 014 4v3l1.5 2h-11L4 9V6a4 4 0 014-4zM6.5 13a1.5 1.5 0 003 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    params : [{ key:'mensagem', label:'Texto da notificação', type:'text' }],
  },
  {
    type   : 'assign_user',
    label  : 'Distribua responsáveis',
    icon   : '<circle cx="8" cy="6" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    params : [{ key:'responsavel', label:'Responsável', type:'text' }],
  },
  {
    type   : 'http_request',
    label  : 'Faça uma requisição HTTP',
    badge  : 'Beta',
    icon   : '<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 2.5C6 5 5 6.5 5 8s1 3 3 5.5M8 2.5C10 5 11 6.5 11 8s-1 3-3 5.5M2.5 8h11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
    params : [
      { key:'url',    label:'URL do endpoint', type:'text' },
      { key:'method', label:'Método',          type:'method-select' },
    ],
  },
  {
    type   : 'apply_sla',
    label  : 'Aplique regras de SLA',
    badge  : 'Beta',
    icon   : '<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 5v3.5l2 1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    params : [{ key:'dias', label:'Prazo em dias', type:'number' }],
  },
];

const FIELD_OPTIONS = [
  { value:'prioridade',  label:'Prioridade' },
  { value:'responsavel', label:'Responsável' },
  { value:'prazo',       label:'Prazo' },
  { value:'categoria',   label:'Categoria' },
  { value:'descricao',   label:'Descrição' },
  { value:'escola',      label:'Escola / Unidade' },
];

/* ── Estado do builder ── */
let _autoBuilder = { trigger: null, action: null };

/* ── Persistência (localStorage) ── */
function loadAutomations() {
  try {
    return JSON.parse(localStorage.getItem('ped_automations') || '[]');
  } catch (_) { return []; }
}
function saveAutomations() {
  try { localStorage.setItem('ped_automations', JSON.stringify(state.automations)); } catch(_) {}
  apiRequest('PUT', '/api/settings/automations', state.automations).catch(err => {
    console.warn('[Settings API] Falha ao salvar automations:', err.message);
  });
}

/* ── Engine de execução ── */
const AutomationEngine = {
  _depth: 0,         // proteção anti-loop infinito
  _maxDepth: 3,      // profundidade máxima de recursão

  execute(eventType, card, extra = {}) {
    if (this._depth >= this._maxDepth) {
      console.warn('[AutomationEngine] Profundidade máxima atingida — ignorando para evitar loop infinito');
      return;
    }
    this._depth++;

    try {
      const matching = state.automations.filter(a => {
        if (!a.enabled) return false;
        if (a.trigger.type !== eventType) return false;
        const triggerModulo = a.trigger.params?.modulo;
        const escopoModulo  = triggerModulo || a.modulo;
        return escopoModulo === card.modulo;
      });

      matching.forEach(auto => {
        if (!this._matchesTrigger(auto.trigger, card, extra)) return;
        this._runAction(auto.action, card, auto);
      });
    } finally {
      this._depth--;
    }
  },

  _matchesTrigger(trigger, card, extra) {
    switch (trigger.type) {
      case 'card_enter_phase':
      case 'card_leave_phase':
        // Se o usuário escolheu um fluxo específico, verifica o módulo do card
        if (trigger.params.modulo && trigger.params.modulo !== card.modulo) return false;
        // Se escolheu uma fase específica, verifica a fase do evento
        return !trigger.params.fase || trigger.params.fase === extra.fase;
      case 'field_updated':
        return !trigger.params.campo || trigger.params.campo === extra.campo;
      case 'card_created':
      case 'sla_at_risk':
      case 'card_moved':
        return true;
      default:
        return false;
    }
  },

  _runAction(action, card, auto) {
    switch (action.type) {
      case 'move_card': {
        const targetFase = action.params.targetFase;
        if (targetFase && MODULES[card.modulo]?.fases[targetFase] && card.fase !== targetFase) {
          const oldLabel = getPhaseStyle(card.modulo, card.fase).label;
          const newLabel = getPhaseStyle(card.modulo, targetFase).label;
          card.fase = targetFase;
          card.historico.push({
            texto  : `⚡ <strong>Automação "${auto.nome}"</strong>: movido de <strong>${oldLabel}</strong> para <strong>${newLabel}</strong>`,
            data   : now(),
            usuario: 'Sistema (Automação)',
          });
          persistCards(); apiUpdateCard(card);
          setTimeout(() => renderAll(), 50);
        }
        break;
      }
      case 'update_field': {
        const { campo, valor } = action.params;
        if (campo && card.hasOwnProperty(campo)) {
          card[campo] = valor || '';
          card.historico.push({
            texto  : `⚡ <strong>Automação "${auto.nome}"</strong>: campo <strong>${campo}</strong> atualizado para "<em>${valor}</em>"`,
            data   : now(),
            usuario: 'Sistema (Automação)',
          });
          persistCards(); apiUpdateCard(card);
        }
        break;
      }
      case 'send_notification':
        showToast(`⚡ ${action.params.mensagem || auto.nome}`, 'success');
        break;
      case 'assign_user': {
        const resp = action.params.responsavel;
        if (resp) {
          card.responsavel = resp;
          card.historico.push({
            texto  : `⚡ <strong>Automação "${auto.nome}"</strong>: responsável atribuído: <strong>${resp}</strong>`,
            data   : now(),
            usuario: 'Sistema (Automação)',
          });
          persistCards(); apiUpdateCard(card);
        }
        break;
      }
      case 'http_request': {
        const { url, method } = action.params;
        if (url) {
          fetch(url, { method: method || 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ card }) })
            .then(() => showToast(`⚡ Requisição HTTP enviada (${auto.nome})`, 'success'))
            .catch(() => showToast(`⚡ Erro na requisição HTTP (${auto.nome})`, 'warn'));
        }
        break;
      }
      case 'apply_sla': {
        const dias = parseInt(action.params.dias) || 3;
        if (!card.prazo) {
          const d = new Date();
          d.setDate(d.getDate() + dias);
          card.prazo = d.toISOString().split('T')[0];
          card.historico.push({
            texto  : `⚡ <strong>Automação "${auto.nome}"</strong>: SLA aplicado — prazo definido para ${dias} dias`,
            data   : now(),
            usuario: 'Sistema (Automação)',
          });
          persistCards(); apiUpdateCard(card);
        }
        break;
      }

      case 'copy_to_module': {
        const targetModulo = action.params.modulo;
        if (!targetModulo || !MODULES[targetModulo]) {
          showToast(`⚡ Automação "${auto.nome}": fluxo de destino não configurado`, 'warn');
          break;
        }
        const destMod  = MODULES[targetModulo];
        const destFases = Object.keys(destMod.fases || {});
        if (!destFases.length) break;

        // Fase de entrada no destino: usa a configurada, senão a primeira do módulo
        const targetFase = (action.params.fase && destMod.fases[action.params.fase])
          ? action.params.fase
          : destFases[0];

        const origemLabel = MODULES[card.modulo]?.label || card.modulo;
        if (!destMod.fases[targetFase]) break;
        const destFaseLabel = destMod.fases[targetFase].label;

        // Clona o card, preservando todos os campos, e adapta para o destino
        const newCard = Object.assign({}, card, {
          id          : 'cp_' + uid(),
          modulo      : targetModulo,
          fase        : targetFase,
          historico   : [{
            texto  : `⚡ <strong>Automação "${escHtml(auto.nome)}"</strong>: Card criado automaticamente a partir de `
                   + `<strong>${escHtml(card.titulo)}</strong> no fluxo <strong>${escHtml(origemLabel)}</strong>`,
            data   : now(),
            usuario: 'Sistema (Automação)',
          }],
          comentarios : [],          // comentários não são copiados (ficam no card original)
          anexos      : [],          // anexos idem
          linkPagamento   : '',      // dados de pagamento não migram
          codigoTransacao : '',
          linkStatus      : 'pendente',
        });

        allCards.unshift(newCard);
        persistCards(); apiCreateCard(newCard);

        // Registra no card de origem
        card.historico.push({
          texto  : `⚡ <strong>Automação "${escHtml(auto.nome)}"</strong>: Card copiado para o fluxo `
                 + `<strong>${escHtml(destMod.label)}</strong> na fase <strong>${escHtml(destFaseLabel)}</strong>`,
          data   : now(),
          usuario: 'Sistema (Automação)',
        });

        apiUpdateCard(card);      // salva histórico no card de origem
        setTimeout(() => { renderAll(); renderNavBadges(); }, 60);
        showToast(`⚡ Card copiado para "${destMod.label}" — ${destFaseLabel}`, 'success');
        break;
      }
    }
  },
};

/* ══ UI DO PAINEL ══════════════════════════════════════════ */

function openAutomationsPanel() {
  const mod = getCurrentModule();
  document.getElementById('autoPanelModule').textContent = mod.label;
  document.getElementById('autoOverlay').classList.add('active');
  showAutoView('list');
  renderAutoList();
}

function closeAutomationsPanel() {
  document.getElementById('autoOverlay').classList.remove('active');
  _autoBuilder = { trigger: null, action: null };
}

function showAutoView(view) {
  document.getElementById('autoListView').classList.toggle('hidden', view !== 'list');
  document.getElementById('autoBuilderView').classList.toggle('hidden', view !== 'builder');
  document.getElementById('autoTabList').classList.toggle('active', view === 'list');
  document.getElementById('autoTabNew').classList.toggle('active', view === 'builder');

  if (view === 'builder') {
    _autoBuilder = { trigger: null, action: null };
    renderTriggerPicker();
    renderActionPicker();
    document.getElementById('autoConfigForm').classList.add('hidden');
  }
}

/* ── Lista de automações ── */
function renderAutoList() {
  const modKey = state.currentModule;
  const list   = state.automations.filter(a => a.modulo === modKey);
  const el     = document.getElementById('autoListItems');
  const empty  = document.getElementById('autoEmpty');

  if (!list.length) {
    el.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  el.innerHTML = list.map(auto => {
    const tDef = TRIGGER_DEFS.find(t => t.type === auto.trigger.type);
    const aDef = ACTION_DEFS.find(a  => a.type === auto.action.type);
    const tLabel = tDef ? tDef.label : auto.trigger.type;
    const aLabel = aDef ? aDef.label : auto.action.type;

    return `
    <div class="auto-list-item" data-id="${auto.id}">
      <div class="auto-list-item-content">
        <div class="auto-list-item-name">${escHtml(auto.nome)}</div>
        <div class="auto-list-item-desc">
          <span class="auto-tag auto-tag--trigger">${escHtml(tLabel)}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="flex-shrink:0">
            <path d="M2 5h6M6 3l2 2-2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          <span class="auto-tag auto-tag--action">${escHtml(aLabel)}</span>
        </div>
      </div>
      <div class="auto-list-item-controls">
        <label class="auto-toggle" title="${auto.enabled ? 'Desativar' : 'Ativar'}">
          <input type="checkbox" class="auto-toggle-input" data-id="${auto.id}" ${auto.enabled ? 'checked' : ''}/>
          <span class="auto-toggle-slider"></span>
        </label>
        <button class="auto-del-btn" data-id="${auto.id}" title="Excluir automação">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 3.5h9M5 3.5V2h3v1.5M3 3.5l.8 7h5.4l.8-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>`;
  }).join('');

  /* bind eventos da lista */
  el.querySelectorAll('.auto-toggle-input').forEach(cb => {
    cb.addEventListener('change', () => {
      const auto = state.automations.find(a => a.id === cb.dataset.id);
      if (auto) { auto.enabled = cb.checked; saveAutomations(); }
    });
  });
  el.querySelectorAll('.auto-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Excluir esta automação?')) return;
      state.automations = state.automations.filter(a => a.id !== btn.dataset.id);
      saveAutomations();
      renderAutoList();
      showToast('Automação removida', 'success');
    });
  });
}

/* ── Pickers ── */
function renderTriggerPicker() {
  const el = document.getElementById('triggerPicker');
  el.innerHTML = TRIGGER_DEFS.map(t => `
    <button class="auto-picker-item ${_autoBuilder.trigger === t.type ? 'selected' : ''}" data-type="${t.type}">
      <svg class="auto-picker-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">${t.icon}</svg>
      <span>${t.label}</span>
    </button>`).join('');

  el.querySelectorAll('.auto-picker-item').forEach(btn => {
    btn.addEventListener('click', () => {
      _autoBuilder.trigger = btn.dataset.type;
      renderTriggerPicker();
      checkShowConfigForm();
    });
  });
}

function renderActionPicker() {
  const el = document.getElementById('actionPicker');
  el.innerHTML = ACTION_DEFS.map(a => `
    <button class="auto-picker-item ${_autoBuilder.action === a.type ? 'selected' : ''}" data-type="${a.type}">
      <svg class="auto-picker-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">${a.icon}</svg>
      <span>${a.label}</span>
      ${a.badge ? `<span class="auto-beta-badge">${a.badge}</span>` : ''}
    </button>`).join('');

  el.querySelectorAll('.auto-picker-item').forEach(btn => {
    btn.addEventListener('click', () => {
      _autoBuilder.action = btn.dataset.type;
      renderActionPicker();
      checkShowConfigForm();
    });
  });
}

/* ── Formulário de configuração ── */
function checkShowConfigForm() {
  const form = document.getElementById('autoConfigForm');
  if (!_autoBuilder.trigger || !_autoBuilder.action) {
    form.classList.add('hidden');
    return;
  }
  form.classList.remove('hidden');

  const tDef = TRIGGER_DEFS.find(t => t.type === _autoBuilder.trigger);
  const aDef = ACTION_DEFS.find(a  => a.type === _autoBuilder.action);

  /* summary */
  document.getElementById('autoConfigSummary').innerHTML = `
    <div class="auto-summary-row">
      <span class="auto-tag auto-tag--trigger">${tDef.label}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      <span class="auto-tag auto-tag--action">${aDef.label}</span>
    </div>`;

  /* trigger fields */
  document.getElementById('autoTriggerFields').innerHTML = buildParamFields(tDef.params, 'trigger');
  /* action fields */
  document.getElementById('autoActionFields').innerHTML = buildParamFields(aDef.params, 'action');

  /* sugestão de nome */
  const nomeInput = document.getElementById('autoNomeInput');
  if (!nomeInput.value) nomeInput.value = `${tDef.label} → ${aDef.label}`;

  form.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function buildParamFields(params, prefix) {
  if (!params.length) return '';
  const mod = getCurrentModule();
  const phases = Object.entries(mod.fases || {});

  return params.map(p => {
    const id = `auto_${prefix}_${p.key}`;
    let input = '';

    switch (p.type) {

      /* ── Seletor de fluxo: lista todos os módulos criados ── */
      case 'module-select': {
        const moduleOpts = Object.entries(MODULES)
          .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
          .join('');
        // Para ações (destino), o rótulo muda para indicar seleção obrigatória
        const emptyLabel = prefix === 'action'
          ? '— Selecione o fluxo de destino —'
          : '— Qualquer fluxo —';
        input = `<select class="form-input auto-param-input" id="${id}"
            data-key="${p.key}"
            data-prefix="${prefix}"
            onchange="onAutoModuleChange(this)">
          <option value="">${emptyLabel}</option>
          ${moduleOpts}
        </select>`;
        break;
      }

      /* ── Seletor de fase dinâmico: preenchido via onAutoModuleChange ── */
      case 'phase-select-dynamic':
        input = `<select class="form-input auto-param-input" id="${id}" data-key="${p.key}" disabled>
          <option value="">— Selecione um fluxo primeiro —</option>
        </select>`;
        break;

      case 'phase-select':
        input = `<select class="form-input auto-param-input" id="${id}" data-key="${p.key}">
          <option value="">— Qualquer fase —</option>
          ${phases.map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
        </select>`;
        break;

      case 'field-select':
        input = `<select class="form-input auto-param-input" id="${id}" data-key="${p.key}">
          <option value="">— Qualquer campo —</option>
          ${FIELD_OPTIONS.map(f => `<option value="${f.value}">${f.label}</option>`).join('')}
        </select>`;
        break;

      case 'method-select':
        input = `<select class="form-input auto-param-input" id="${id}" data-key="${p.key}">
          ${['POST','GET','PUT','PATCH'].map(m => `<option value="${m}">${m}</option>`).join('')}
        </select>`;
        break;

      case 'number':
        input = `<input type="number" class="form-input auto-param-input" id="${id}" data-key="${p.key}" min="1" max="365" placeholder="3"/>`;
        break;

      default:
        input = `<input type="text" class="form-input auto-param-input" id="${id}" data-key="${p.key}" placeholder="${p.label}..."/>`;
    }

    return `<div class="form-group" style="margin-bottom:10px">
      <label class="form-label">${p.label}</label>
      ${input}
    </div>`;
  }).join('');
}

/**
 * Disparado quando o usuário muda o seletor de fluxo (module-select).
 * Atualiza dinamicamente o seletor de fases correspondente (phase-select-dynamic).
 */
function onAutoModuleChange(selectEl) {
  const modKey = selectEl.value;
  const prefix = selectEl.dataset.prefix;          // 'trigger' ou 'action'
  const phaseId = `auto_${prefix}_fase`;
  const phaseEl = document.getElementById(phaseId);
  if (!phaseEl) return;

  if (!modKey || !MODULES[modKey]) {
    phaseEl.innerHTML = '<option value="">— Selecione um fluxo primeiro —</option>';
    phaseEl.disabled  = true;
    return;
  }

  const phaseEntries = Object.entries(MODULES[modKey].fases || {});
  phaseEl.innerHTML  = '<option value="">— Qualquer fase —</option>' +
    phaseEntries.map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  phaseEl.disabled = false;
}

/* ── Salvar automação ── */
function saveAutomation() {
  if (!_autoBuilder.trigger || !_autoBuilder.action) {
    showToast('Selecione um gatilho e uma ação', 'warn'); return;
  }

  const nome = document.getElementById('autoNomeInput').value.trim();
  if (!nome) { showToast('Dê um nome para a automação', 'warn'); return; }

  const triggerParams = {};
  document.querySelectorAll('#autoTriggerFields .auto-param-input').forEach(el => {
    triggerParams[el.dataset.key] = el.value;
  });
  const actionParams = {};
  document.querySelectorAll('#autoActionFields .auto-param-input').forEach(el => {
    actionParams[el.dataset.key] = el.value;
  });

  // Validação específica por tipo de ação
  if (_autoBuilder.action === 'copy_to_module' && !actionParams.modulo) {
    showToast('Selecione o fluxo de destino para a cópia', 'warn'); return;
  }

  const newAuto = {
    id     : 'auto_' + Date.now().toString(36),
    modulo : state.currentModule,
    nome,
    enabled: true,
    trigger: { type: _autoBuilder.trigger, params: triggerParams },
    action : { type: _autoBuilder.action,  params: actionParams  },
  };

  state.automations.push(newAuto);
  saveAutomations();
  showAutoView('list');
  renderAutoList();
  showToast(`Automação "${nome}" criada!`, 'success');
  _autoBuilder = { trigger: null, action: null };
}

/* ── Inicialização dos listeners do painel ── */
function initAutomationPanel() {
  document.getElementById('automationBtn').addEventListener('click', openAutomationsPanel);
  document.getElementById('autoCloseBtn').addEventListener('click', closeAutomationsPanel);

  document.getElementById('autoOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('autoOverlay')) closeAutomationsPanel();
  });

  document.getElementById('autoTabList').addEventListener('click', () => showAutoView('list'));
  document.getElementById('autoTabNew').addEventListener('click',  () => showAutoView('builder'));

  document.getElementById('autoEmptyNew').addEventListener('click', () => showAutoView('builder'));
  document.getElementById('saveAutoBtn').addEventListener('click', saveAutomation);
  document.getElementById('cancelAutoBtn').addEventListener('click', () => {
    _autoBuilder = { trigger: null, action: null };
    document.getElementById('autoConfigForm').classList.add('hidden');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Aplica configurações de aparência salvas à sidebar (do cache local)
  const _ap = settingsData.aparencia;
  const _logoName = document.querySelector('.logo-name');
  if (_logoName && _ap.nomeExibicao) _logoName.textContent = _ap.nomeExibicao;

  // Se tem token salvo, tenta carregar dados antes de renderizar
  if (getAuthToken()) {
    try {
      await loadSettingsFromAPI();
      refreshSidebarNav();   // Reconstrói sidebar com MODULES do PostgreSQL (remove fluxos deletados)
      refreshEscolasSelects();
      await loadCardsFromAPI();
    } catch(err) {
      console.warn('[Init] Falha ao carregar dados:', err.message);
    }
  }

  init();
});
