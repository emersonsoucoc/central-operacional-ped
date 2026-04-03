/* ═══════════════════════════════════════════════════════════
   CENTRAL OPERACIONAL — Grupo PED
   script.js — 5 módulos, Kanban dinâmico, Drag & Drop, Anexos
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════════════════════
   INTEGRAÇÃO E-REDE — Link de Pagamento
   Altere a URL abaixo após o deploy no Railway.
══════════════════════════════════════════════════════════ */
const PAYMENT_BACKEND_URL = 'https://SEU-APP.railway.app';

/* ══════════════════════════════════════════════════════════
   CONFIG: MÓDULOS E FASES
══════════════════════════════════════════════════════════ */
const MODULES = {
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
};

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
};

const CORES_PALETTE = [
  '#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444',
  '#EC4899','#06B6D4','#F97316','#84CC16','#6366F1',
];

/* ══════════════════════════════════════════════════════════
   SEED DATA — Cards de Exemplo por Módulo
══════════════════════════════════════════════════════════ */
let allCards = [
  /* ── SOLICITAÇÕES ── */
  { id:'s1', modulo:'solicitacoes', titulo:'Substituição de ar-condicionado — Sala 12',
    descricao:'Equipamento com defeito. Afeta aulas no período da tarde.',
    fase:'pendente', prioridade:'alta', escola:'ped1', categoria:'Manutenção',
    responsavel:'Maria Silva', criadoEm:'2026-03-20', prazo:'2026-04-05',
    valor:'', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[{id:'cm1',autor:'Maria Silva',texto:'Técnico agendado para amanhã.',data:'2026-03-21 09:00'}],
    historico:[{texto:'Card criado',data:'2026-03-20 08:00',usuario:'Emerson Santos'}], anexos:[] },

  { id:'s2', modulo:'solicitacoes', titulo:'Solicitação de notebook para coordenação pedagógica',
    descricao:'Notebook com 8 anos de uso. Desempenho crítico.',
    fase:'pendente', prioridade:'media', escola:'ped2', categoria:'TI',
    responsavel:'João Costa', criadoEm:'2026-03-25', prazo:'2026-04-15',
    valor:'', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[], historico:[{texto:'Card criado',data:'2026-03-25 10:30',usuario:'Ana Oliveira'}], anexos:[] },

  { id:'s3', modulo:'solicitacoes', titulo:'Reposição de material de limpeza — estoque zerado',
    descricao:'Urgente! Produtos de limpeza acabaram.',
    fase:'pendente', prioridade:'urgente', escola:'ped3', categoria:'Compras',
    responsavel:'', criadoEm:'2026-04-01', prazo:'2026-04-03',
    valor:'', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[], historico:[{texto:'Card criado',data:'2026-04-01 07:30',usuario:'Pedro Alves'}], anexos:[] },

  { id:'s4', modulo:'solicitacoes', titulo:'Revisão do contrato de terceirização — vigilância',
    descricao:'Contrato vence em maio. Avaliar renovação ou nova licitação.',
    fase:'em_andamento', prioridade:'alta', escola:'ped1', categoria:'Financeiro',
    responsavel:'Carla Mendes', criadoEm:'2026-03-15', prazo:'2026-04-20',
    valor:'', fornecedor:'Segurança Total Ltda', numDoc:'CT-2024-077', vencimento:'',
    comentarios:[{id:'cm2',autor:'Carla Mendes',texto:'Aguardando cotação de 3 empresas.',data:'2026-03-18 14:00'}],
    historico:[
      {texto:'Card criado',data:'2026-03-15 09:00',usuario:'Emerson Santos'},
      {texto:'Movido para <strong>Em Andamento</strong>',data:'2026-03-17 11:00',usuario:'Carla Mendes'}
    ], anexos:[] },

  { id:'s5', modulo:'solicitacoes', titulo:'Adequação do refeitório — Exigências ANVISA',
    descricao:'Visita da ANVISA prevista. Ajustes na cozinha e armazenamento.',
    fase:'aguardando_validacao', prioridade:'urgente', escola:'ped1', categoria:'Infraestrutura',
    responsavel:'Maria Silva', criadoEm:'2026-03-05', prazo:'2026-04-08',
    valor:'', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[{id:'cm3',autor:'Maria Silva',texto:'Laudos prontos. Aguardando aprovação da diretoria.',data:'2026-03-28 16:00'}],
    historico:[
      {texto:'Card criado',data:'2026-03-05 09:00',usuario:'Maria Silva'},
      {texto:'Movido para <strong>Em Andamento</strong>',data:'2026-03-08 10:00',usuario:'Maria Silva'},
      {texto:'Movido para <strong>Aguard. Validação</strong>',data:'2026-03-28 15:00',usuario:'Maria Silva'}
    ], anexos:[] },

  { id:'s6', modulo:'solicitacoes', titulo:'Configuração do sistema de ponto eletrônico',
    descricao:'Integração com folha finalizada com sucesso.',
    fase:'concluido', prioridade:'media', escola:'ped4', categoria:'RH',
    responsavel:'Ana Oliveira', criadoEm:'2026-02-20', prazo:'2026-03-31',
    valor:'', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[], historico:[
      {texto:'Card criado',data:'2026-02-20 09:00',usuario:'Ana Oliveira'},
      {texto:'Movido para <strong>Concluído</strong>',data:'2026-03-28 14:00',usuario:'Ana Oliveira'}
    ], anexos:[] },

  /* ── CONTAS A PAGAR ── */
  { id:'p1', modulo:'contas_pagar', titulo:'Fatura de energia elétrica — Abril 2026',
    descricao:'Conta de energia da unidade principal.',
    fase:'solicitacao_criada', prioridade:'alta', escola:'ped1', categoria:'Utilidades',
    responsavel:'Carla Mendes', criadoEm:'2026-04-01', prazo:'2026-04-10',
    valor:'4850.00', fornecedor:'Coelba', numDoc:'NF-2026-004123', vencimento:'2026-04-10',
    comentarios:[], historico:[{texto:'Card criado',data:'2026-04-01 09:00',usuario:'Carla Mendes'}], anexos:[] },

  { id:'p2', modulo:'contas_pagar', titulo:'Pagamento de serviço de internet — Março/Abril',
    descricao:'Contrato mensal de internet empresarial 1Gbps.',
    fase:'aguardando_aprovacao', prioridade:'media', escola:'ped2', categoria:'TI',
    responsavel:'João Costa', criadoEm:'2026-03-28', prazo:'2026-04-05',
    valor:'1200.00', fornecedor:'Vivo Empresas', numDoc:'NF-099234', vencimento:'2026-04-05',
    comentarios:[], historico:[
      {texto:'Card criado',data:'2026-03-28 09:00',usuario:'João Costa'},
      {texto:'Movido para <strong>Aguard. Aprovação</strong>',data:'2026-03-29 10:00',usuario:'João Costa'}
    ], anexos:[] },

  { id:'p3', modulo:'contas_pagar', titulo:'Manutenção preventiva — elevadores',
    descricao:'Manutenção trimestral obrigatória dos elevadores.',
    fase:'aprovado', prioridade:'media', escola:'ped3', categoria:'Manutenção',
    responsavel:'Roberto Lima', criadoEm:'2026-03-20', prazo:'2026-04-15',
    valor:'3200.00', fornecedor:'TecnoElev Manutenção', numDoc:'OS-2026-0881', vencimento:'2026-04-15',
    comentarios:[], historico:[
      {texto:'Card criado',data:'2026-03-20 09:00',usuario:'Roberto Lima'},
      {texto:'Aprovado por <strong>Emerson Santos</strong>',data:'2026-03-22 14:00',usuario:'Emerson Santos'}
    ], anexos:[] },

  { id:'p4', modulo:'contas_pagar', titulo:'Aluguel sede administrativa — Maio 2026',
    descricao:'Aluguel mensal da sede administrativa.',
    fase:'aguardando_pagamento', prioridade:'alta', escola:'all', categoria:'Aluguel',
    responsavel:'Carla Mendes', criadoEm:'2026-03-25', prazo:'2026-05-05',
    valor:'8500.00', fornecedor:'Imóveis Brasil Ltda', numDoc:'REC-2026-00045', vencimento:'2026-05-05',
    comentarios:[], historico:[
      {texto:'Card criado',data:'2026-03-25 09:00',usuario:'Carla Mendes'},
      {texto:'Movido para <strong>Aguard. Pagamento</strong>',data:'2026-03-30 11:00',usuario:'Carla Mendes'}
    ], anexos:[] },

  { id:'p5', modulo:'contas_pagar', titulo:'Serviço de limpeza — Fevereiro 2026',
    descricao:'Contrato de limpeza e conservação.',
    fase:'pago', prioridade:'baixa', escola:'ped4', categoria:'Serviços',
    responsavel:'Ana Oliveira', criadoEm:'2026-02-25', prazo:'2026-03-10',
    valor:'6800.00', fornecedor:'LimpaMax Serviços', numDoc:'NF-20260234', vencimento:'2026-03-10',
    comentarios:[], historico:[
      {texto:'Card criado',data:'2026-02-25 09:00',usuario:'Ana Oliveira'},
      {texto:'Pago via <strong>transferência bancária</strong>',data:'2026-03-09 15:00',usuario:'Ana Oliveira'}
    ], anexos:[] },

  /* ── CONTAS A RECEBER ── */
  { id:'r1', modulo:'contas_receber', titulo:'Mensalidades Abril — Turma 3º Ano Médio (30 alunos)',
    descricao:'30 alunos · R$ 1.250,00/aluno. Gerar links individuais via PIX.',
    fase:'criar_link', prioridade:'alta', escola:'ped1', categoria:'Mensalidades',
    responsavel:'Maria Silva', criadoEm:'2026-04-01', prazo:'2026-04-10',
    valor:'37500.00', fornecedor:'Turma 3M-A/B/C', numDoc:'', vencimento:'2026-04-10',
    tipoPagamento:'pix', linkPagamento:'', codigoTransacao:'', linkStatus:'pendente',
    comentarios:[], historico:[{texto:'Card criado — aguardando geração do link',data:'2026-04-01 08:00',usuario:'Maria Silva'}], anexos:[] },

  { id:'r2', modulo:'contas_receber', titulo:'Matrículas novas — Abril/Maio 2026 (28 alunos)',
    descricao:'28 novas matrículas. Boleto gerado e enviado por e-mail.',
    fase:'aguardando_pagamento', prioridade:'alta', escola:'ped2', categoria:'Matrículas',
    responsavel:'João Costa', criadoEm:'2026-03-20', prazo:'2026-04-15',
    valor:'42000.00', fornecedor:'Novos alunos 2026', numDoc:'FAT-2026-0028', vencimento:'2026-04-15',
    tipoPagamento:'boleto', linkPagamento:'https://pay.grupoped.com.br/link/TRX2B28F4A', codigoTransacao:'TRX-2B28F4A1', linkStatus:'ativo',
    comentarios:[{id:'cm6a',autor:'João Costa',texto:'Boleto enviado para os responsáveis. Aguardando pagamento.',data:'2026-03-21 10:00'}],
    historico:[
      {texto:'Card criado',data:'2026-03-20 09:00',usuario:'João Costa'},
      {texto:'Link de pagamento gerado: <strong>TRX-2B28F4A1</strong>',data:'2026-03-20 09:30',usuario:'João Costa'},
      {texto:'Movido para <strong>Aguard. Pagamento</strong>',data:'2026-03-20 09:35',usuario:'João Costa'}
    ], anexos:[] },

  { id:'r3', modulo:'contas_receber', titulo:'Material didático — 1º Semestre 2026 (PIX em lote)',
    descricao:'450 alunos · Pagamento via PIX. Link gerado e confirmado.',
    fase:'pagamento_efetuado', prioridade:'media', escola:'ped3', categoria:'Material Didático',
    responsavel:'Ana Oliveira', criadoEm:'2026-03-10', prazo:'2026-03-31',
    valor:'58500.00', fornecedor:'Alunos 1S/2026', numDoc:'FAT-2026-0015', vencimento:'2026-03-31',
    tipoPagamento:'pix', linkPagamento:'https://pay.grupoped.com.br/link/TRX9C74E2B', codigoTransacao:'TRX-9C74E2B3', linkStatus:'pago',
    comentarios:[{id:'cm6b',autor:'Ana Oliveira',texto:'Pagamento confirmado automaticamente via integração.',data:'2026-03-29 14:00'}],
    historico:[
      {texto:'Card criado',data:'2026-03-10 09:00',usuario:'Ana Oliveira'},
      {texto:'Link de pagamento gerado: <strong>TRX-9C74E2B3</strong>',data:'2026-03-10 09:20',usuario:'Ana Oliveira'},
      {texto:'<strong>Pagamento efetuado</strong> — R$ 58.500,00 via PIX',data:'2026-03-29 14:00',usuario:'Sistema (Integração)'}
    ], anexos:[] },

  { id:'r4', modulo:'contas_receber', titulo:'Mensalidades Março — PED Imbuí (inadimplentes)',
    descricao:'12 alunos com boleto vencido. Reenvio de link necessário.',
    fase:'aguardando_pagamento', prioridade:'urgente', escola:'ped4', categoria:'Mensalidades',
    responsavel:'Roberto Lima', criadoEm:'2026-03-01', prazo:'2026-03-15',
    valor:'15000.00', fornecedor:'12 alunos em atraso', numDoc:'FAT-2026-0009', vencimento:'2026-03-15',
    tipoPagamento:'boleto', linkPagamento:'https://pay.grupoped.com.br/link/TRX4D11C9F', codigoTransacao:'TRX-4D11C9F8', linkStatus:'ativo',
    comentarios:[{id:'cm6c',autor:'Roberto Lima',texto:'Cobrança reforçada via WhatsApp. Aguardando retorno.',data:'2026-04-01 10:00'}],
    historico:[
      {texto:'Card criado',data:'2026-03-01 09:00',usuario:'Roberto Lima'},
      {texto:'Link gerado e boleto enviado',data:'2026-03-01 09:30',usuario:'Roberto Lima'},
      {texto:'Pagamento não efetuado no prazo — <strong>em atraso</strong>',data:'2026-03-16 00:01',usuario:'Sistema'}
    ], anexos:[] },

  { id:'r5', modulo:'contas_receber', titulo:'Taxa de uso de laboratório — Turmas TI',
    descricao:'Taxa semestral confirmada. Processando faturamento final.',
    fase:'processando', prioridade:'baixa', escola:'ped1', categoria:'Taxa de Serviços',
    responsavel:'Carla Mendes', criadoEm:'2026-03-05', prazo:'2026-04-30',
    valor:'9800.00', fornecedor:'Turmas TI 1S/2026', numDoc:'FAT-2026-0022', vencimento:'2026-04-30',
    tipoPagamento:'credito', linkPagamento:'https://pay.grupoped.com.br/link/TRX7E55A1C', codigoTransacao:'TRX-7E55A1C2', linkStatus:'pago',
    comentarios:[], historico:[
      {texto:'Card criado',data:'2026-03-05 09:00',usuario:'Carla Mendes'},
      {texto:'Link gerado e pagamento confirmado',data:'2026-03-20 15:00',usuario:'Sistema (Integração)'},
      {texto:'Movido para <strong>Processando CR</strong>',data:'2026-03-20 15:30',usuario:'Carla Mendes'}
    ], anexos:[] },

  { id:'r6', modulo:'contas_receber', titulo:'Evento Formatura — Turma 2025',
    descricao:'Arrecadação da formatura totalmente quitada.',
    fase:'concluido', prioridade:'baixa', escola:'ped2', categoria:'Eventos',
    responsavel:'Carla Mendes', criadoEm:'2026-02-10', prazo:'2026-03-30',
    valor:'24500.00', fornecedor:'Turma Formandos 2025', numDoc:'REC-2026-FORM', vencimento:'2026-03-30',
    tipoPagamento:'pix', linkPagamento:'https://pay.grupoped.com.br/link/TRX1A88D3E', codigoTransacao:'TRX-1A88D3E9', linkStatus:'pago',
    comentarios:[], historico:[
      {texto:'Card criado',data:'2026-02-10 09:00',usuario:'Carla Mendes'},
      {texto:'Pagamento integral confirmado via PIX',data:'2026-03-28 16:00',usuario:'Sistema (Integração)'},
      {texto:'Faturamento concluído',data:'2026-03-29 10:00',usuario:'Carla Mendes'}
    ], anexos:[] },

  /* ── COMPRAS ── */
  { id:'c1', modulo:'compras', titulo:'Aquisição de 20 cadeiras escolares ergonômicas',
    descricao:'Substituição das cadeiras quebradas nas salas 5 a 8.',
    fase:'solicitacao', prioridade:'media', escola:'ped1', categoria:'Móveis',
    responsavel:'Pedro Alves', criadoEm:'2026-03-28', prazo:'2026-04-20',
    valor:'4600.00', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[], historico:[{texto:'Card criado',data:'2026-03-28 09:00',usuario:'Pedro Alves'}], anexos:[] },

  { id:'c2', modulo:'compras', titulo:'Notebooks para laboratório de informática — 15 unidades',
    descricao:'Renovação do parque tecnológico. Core i5, 8GB RAM.',
    fase:'cotacao', prioridade:'alta', escola:'ped3', categoria:'Equipamentos TI',
    responsavel:'João Costa', criadoEm:'2026-03-20', prazo:'2026-04-30',
    valor:'52500.00', fornecedor:'Dell / Lenovo', numDoc:'COT-2026-0041', vencimento:'',
    comentarios:[{id:'cm7',autor:'João Costa',texto:'3 cotações em andamento. Dell e Lenovo responderam.',data:'2026-03-25 14:00'}],
    historico:[
      {texto:'Card criado',data:'2026-03-20 09:00',usuario:'João Costa'},
      {texto:'Movido para <strong>Cotação</strong>',data:'2026-03-22 10:00',usuario:'João Costa'}
    ], anexos:[] },

  { id:'c3', modulo:'compras', titulo:'Material de escritório — 2º Trimestre 2026',
    descricao:'Papéis, canetas, grampos e suprimentos gerais.',
    fase:'aprovacao', prioridade:'baixa', escola:'all', categoria:'Material de Escritório',
    responsavel:'Ana Oliveira', criadoEm:'2026-03-10', prazo:'2026-04-05',
    valor:'2800.00', fornecedor:'Kalunga Empresas', numDoc:'COT-2026-0038', vencimento:'',
    comentarios:[], historico:[
      {texto:'Card criado',data:'2026-03-10 09:00',usuario:'Ana Oliveira'},
      {texto:'Movido para <strong>Aprovação</strong>',data:'2026-03-15 11:00',usuario:'Ana Oliveira'}
    ], anexos:[] },

  { id:'c4', modulo:'compras', titulo:'Merenda escolar — Fornecedor Abril/Maio',
    descricao:'Contrato de fornecimento de merenda.',
    fase:'pedido_realizado', prioridade:'alta', escola:'ped2', categoria:'Alimentação',
    responsavel:'Maria Silva', criadoEm:'2026-03-18', prazo:'2026-04-01',
    valor:'18400.00', fornecedor:'NutriEscola Alimentos', numDoc:'PO-2026-0192', vencimento:'2026-04-01',
    comentarios:[], historico:[
      {texto:'Card criado',data:'2026-03-18 09:00',usuario:'Maria Silva'},
      {texto:'Pedido realizado',data:'2026-03-25 14:00',usuario:'Maria Silva'}
    ], anexos:[] },

  { id:'c5', modulo:'compras', titulo:'Projetores interativos — Salas 1 a 5',
    descricao:'5 projetores Epson 4K instalados.',
    fase:'entregue', prioridade:'media', escola:'ped1', categoria:'Equipamentos TI',
    responsavel:'Roberto Lima', criadoEm:'2026-02-15', prazo:'2026-03-30',
    valor:'35000.00', fornecedor:'TecnoEdu Distribuidora', numDoc:'NF-20260567', vencimento:'',
    comentarios:[], historico:[
      {texto:'Card criado',data:'2026-02-15 09:00',usuario:'Roberto Lima'},
      {texto:'Entregue e instalado',data:'2026-03-25 16:00',usuario:'Roberto Lima'}
    ], anexos:[] },

  /* ── T.I ── */
  { id:'ti1', modulo:'ti', titulo:'Servidor de arquivos offline — unidade Pituba',
    descricao:'Servidor de arquivos caiu. Usuários sem acesso ao drive compartilhado.',
    fase:'em_atendimento', prioridade:'urgente', escola:'ped1', categoria:'Infraestrutura TI',
    responsavel:'João Costa', criadoEm:'2026-04-02', prazo:'2026-04-03',
    valor:'', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[{id:'ti_cm1',autor:'João Costa',texto:'Servidor reiniciado. Aguardando estabilidade dos serviços.',data:'2026-04-02 14:30'}],
    historico:[
      {texto:'Chamado aberto',data:'2026-04-02 13:00',usuario:'Pedro Alves'},
      {texto:'Movido para <strong>Em Atendimento</strong>',data:'2026-04-02 13:30',usuario:'João Costa'}
    ], anexos:[] },

  { id:'ti2', modulo:'ti', titulo:'Atualização do sistema acadêmico — versão 4.2',
    descricao:'Nova versão do ERP acadêmico precisa ser homologada antes do deploy em produção.',
    fase:'diagnostico', prioridade:'alta', escola:'all', categoria:'Sistemas',
    responsavel:'João Costa', criadoEm:'2026-03-28', prazo:'2026-04-15',
    valor:'', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[], historico:[
      {texto:'Chamado aberto',data:'2026-03-28 09:00',usuario:'Carla Mendes'},
      {texto:'Movido para <strong>Diagnóstico</strong> — análise de compatibilidade iniciada',data:'2026-03-29 10:00',usuario:'João Costa'}
    ], anexos:[] },

  { id:'ti3', modulo:'ti', titulo:'Troca de switch — sala de servidores Barra',
    descricao:'Switch com porta danificada causando queda intermitente de rede no andar administrativo.',
    fase:'aguardando_aprovacao', prioridade:'alta', escola:'ped2', categoria:'Rede / Conectividade',
    responsavel:'João Costa', criadoEm:'2026-03-25', prazo:'2026-04-10',
    valor:'', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[{id:'ti_cm2',autor:'João Costa',texto:'Cotação enviada. Aguardando aprovação da diretoria para compra.',data:'2026-03-26 11:00'}],
    historico:[
      {texto:'Chamado aberto',data:'2026-03-25 09:00',usuario:'João Costa'},
      {texto:'Movido para <strong>Aguard. Aprovação</strong>',data:'2026-03-26 10:00',usuario:'João Costa'}
    ], anexos:[] },

  { id:'ti4', modulo:'ti', titulo:'Instalação de antivírus corporativo — 180 máquinas',
    descricao:'Renovação da licença e reinstalação do antivírus em toda a rede das 4 unidades.',
    fase:'aberto', prioridade:'media', escola:'all', categoria:'Segurança da Informação',
    responsavel:'', criadoEm:'2026-04-01', prazo:'2026-04-30',
    valor:'', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[], historico:[{texto:'Chamado aberto',data:'2026-04-01 09:00',usuario:'Emerson Santos'}], anexos:[] },

  { id:'ti5', modulo:'ti', titulo:'Impressora da secretaria sem comunicação pós-update',
    descricao:'Impressora HP da secretaria parou de imprimir após atualização automática do Windows.',
    fase:'resolvido', prioridade:'baixa', escola:'ped3', categoria:'Hardware',
    responsavel:'João Costa', criadoEm:'2026-03-30', prazo:'2026-04-02',
    valor:'', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[], historico:[
      {texto:'Chamado aberto',data:'2026-03-30 08:00',usuario:'Ana Oliveira'},
      {texto:'Driver reinstalado e impressora reconfigura na rede',data:'2026-03-30 11:00',usuario:'João Costa'},
      {texto:'Movido para <strong>Resolvido</strong>',data:'2026-03-30 11:30',usuario:'João Costa'}
    ], anexos:[] },

  /* ── PROCESSOS ── */
  { id:'pr1', modulo:'processos', titulo:'Revisão do Projeto Político Pedagógico 2026',
    descricao:'PPP deve ser atualizado para o novo ano letivo.',
    fase:'pendente', prioridade:'alta', escola:'all', categoria:'Pedagógico',
    responsavel:'Maria Silva', criadoEm:'2026-03-01', prazo:'2026-04-30',
    valor:'', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[], historico:[{texto:'Card criado',data:'2026-03-01 09:00',usuario:'Maria Silva'}], anexos:[] },

  { id:'pr2', modulo:'processos', titulo:'Auditoria interna — Processos de RH',
    descricao:'Revisão dos processos de contratação e demissão.',
    fase:'em_andamento', prioridade:'media', escola:'ped1', categoria:'RH',
    responsavel:'Carla Mendes', criadoEm:'2026-03-10', prazo:'2026-04-20',
    valor:'', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[{id:'cm8',autor:'Carla Mendes',texto:'Revisando documentos de 2024 e 2025.',data:'2026-03-18 11:00'}],
    historico:[
      {texto:'Card criado',data:'2026-03-10 09:00',usuario:'Carla Mendes'},
      {texto:'Movido para <strong>Em Andamento</strong>',data:'2026-03-12 10:00',usuario:'Carla Mendes'}
    ], anexos:[] },

  { id:'pr3', modulo:'processos', titulo:'Certificação ISO 9001 — Renovação anual',
    descricao:'Auditoria externa de renovação da certificação.',
    fase:'aguardando_validacao', prioridade:'alta', escola:'all', categoria:'Qualidade',
    responsavel:'Pedro Alves', criadoEm:'2026-02-15', prazo:'2026-04-15',
    valor:'', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[], historico:[
      {texto:'Card criado',data:'2026-02-15 09:00',usuario:'Pedro Alves'},
      {texto:'Aguardando auditoria externa',data:'2026-03-20 14:00',usuario:'Pedro Alves'}
    ], anexos:[] },

  { id:'pr4', modulo:'processos', titulo:'Plano de evacuação e simulacro de emergência',
    descricao:'Exercício realizado com sucesso em todas as unidades.',
    fase:'concluido', prioridade:'urgente', escola:'all', categoria:'Segurança',
    responsavel:'Roberto Lima', criadoEm:'2026-02-01', prazo:'2026-03-15',
    valor:'', fornecedor:'', numDoc:'', vencimento:'',
    comentarios:[], historico:[
      {texto:'Card criado',data:'2026-02-01 09:00',usuario:'Roberto Lima'},
      {texto:'Simulacro realizado com <strong>98% de participação</strong>',data:'2026-03-14 17:00',usuario:'Roberto Lima'},
      {texto:'Movido para <strong>Concluído</strong>',data:'2026-03-14 17:30',usuario:'Roberto Lima'}
    ], anexos:[] },
];

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
  return getCurrentModuleCards().filter(c => {
    const schoolOk = state.filterSchool === 'all' || c.escola === state.filterSchool || c.escola === 'all';
    const searchOk = !term ||
      c.titulo.toLowerCase().includes(term) ||
      c.categoria.toLowerCase().includes(term) ||
      (c.responsavel||'').toLowerCase().includes(term) ||
      (c.fornecedor||'').toLowerCase().includes(term);
    return schoolOk && searchOk;
  });
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

  // Sai do modo configurações se estava ativo
  exitSettings();

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
  board.className = 'kanban-board' + (keys.length === 5 ? ' cols-5' : keys.length === 3 ? ' cols-3' : '');

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

  return `
    <div class="kanban-column" data-phase="${phaseKey}">
      <div class="column-header" style="border-top-color:${phase.color}">
        <div class="column-header-left">
          <span class="phase-dot" style="background:${phase.color}"></span>
          <h3 class="column-title">${escHtml(phase.label)}</h3>
          <span class="column-count">${phaseCards.length}</span>
        </div>
        <button class="column-add-btn" data-phase="${phaseKey}" title="Adicionar">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="column-body" id="col-${phaseKey}" data-phase="${phaseKey}">
        ${cardsHTML}
      </div>
    </div>`;
}

function buildCardHTML(card) {
  const prio   = PRIORITIES[card.prioridade] || PRIORITIES.media;
  const school = SCHOOLS[card.escola] || SCHOOLS.all;
  const overdue = isOverdue(card.prazo) && card.fase !== getCurrentModule().lastPhase;
  const days   = daysUntil(card.prazo);
  const anexos = (card.anexos || []).length;
  const comments = (card.comentarios || []).length;

  let dueDateHtml = '';
  if (card.prazo) {
    const cls = overdue ? 'card-meta-item overdue' : 'card-meta-item';
    dueDateHtml = `<span class="${cls}">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" stroke-width="1.2"/><path d="M5 3v2l1.5 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      ${overdue ? 'Atrasado' : formatDate(card.prazo)}
    </span>`;
  }

  const metaItems = [
    dueDateHtml,
    comments > 0 ? `<span class="card-meta-item">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5h7a.5.5 0 01.5.5v4a.5.5 0 01-.5.5H4L1.5 8V2a.5.5 0 010 0z" stroke="currentColor" stroke-width="1.1"/></svg>
      ${comments}
    </span>` : '',
    anexos > 0 ? `<span class="card-meta-item">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5.5 1L8 3.5 4 7.5a2 2 0 01-2.83-2.83L5.5.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
      ${anexos}
    </span>` : '',
  ].filter(Boolean).join('');

  const valorHtml = card.valor
    ? `<div class="card-valor">${formatCurrency(card.valor)}</div>`
    : '';

  const assigneeHtml = card.responsavel
    ? `<div class="card-assignee">
        <div class="assignee-avatar" title="${escHtml(card.responsavel)}">${initials(card.responsavel)}</div>
       </div>`
    : '';

  // Bloco de link de pagamento — só para contas_receber
  let paymentBlockHtml = '';
  if (card.modulo === 'contas_receber') {
    if (card.fase === 'criar_link') {
      paymentBlockHtml = `
        <div class="card-payment-action">
          <button class="btn-card-gen-link" data-id="${card.id}">⚡ Gerar Link</button>
        </div>`;
    } else if (card.fase === 'aguardando_pagamento' && card.linkPagamento) {
      const tipTag = card.tipoPagamento
        ? `<span class="pay-type-tag">${card.tipoPagamento.toUpperCase()}</span>` : '';
      paymentBlockHtml = `
        <div class="card-payment-row">
          ${tipTag}
          <span class="pay-code">${escHtml(card.codigoTransacao)}</span>
          <button class="btn-card-confirm-pay" data-id="${card.id}">✓ Pago</button>
        </div>`;
    } else if (['pagamento_efetuado','processando','concluido'].includes(card.fase) && card.codigoTransacao) {
      paymentBlockHtml = `
        <div class="card-paid-row">
          <span class="pay-paid-badge">✅ ${escHtml(card.codigoTransacao)}</span>
        </div>`;
    }
  }

  return `
    <div class="kanban-card" draggable="true" data-id="${card.id}" data-prio="${card.prioridade}">
      <div class="card-top">
        <div class="card-badges">
          <span class="badge badge--cat">${escHtml(card.categoria)}</span>
          <span class="badge badge--escola">${school.sigla}</span>
          <span class="badge ${prio.cls}">${prio.icon} ${prio.label}</span>
        </div>
        <button class="card-menu-btn" data-id="${card.id}" title="Editar">⋯</button>
      </div>
      ${valorHtml}
      <p class="card-title">${escHtml(card.titulo)}</p>
      <div class="card-footer">
        <div class="card-meta">${metaItems}</div>
        ${assigneeHtml}
      </div>
      ${paymentBlockHtml}
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
      if (!col.contains(e.relatedTarget)) col.closest('.kankan-column')?.classList.remove('drag-over');
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
        card.fase = targetPhase;
        card.historico.push({
          texto:`Movido de <strong>${oldLabel}</strong> para <strong>${newLabel}</strong>`,
          data: now(), usuario:'Emerson Santos',
        });
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

    document.getElementById('deleteCardArea').style.display = '';
    document.getElementById('commentSection').style.display = '';
    document.getElementById('historySection').style.display = '';

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

    renderComments(card);
    renderHistory(card);
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
    document.getElementById('commentSection').style.display = 'none';
    document.getElementById('historySection').style.display = 'none';

    // Reset payment link section for new card
    if (mod.hasPaymentLink) {
      document.getElementById('genLinkRow').style.display     = '';
      document.getElementById('linkDisplayBox').style.display = 'none';
    }

    // Clear attachment list for new card (temp id)
    document.getElementById('attachmentsList').innerHTML = '';
    document.getElementById('attachCountBadge').style.display = 'none';
  }

  document.getElementById('modalOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('formTitulo').focus(), 50);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
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

  if (!titulo || !escola || !categoria) {
    showToast('Preencha os campos obrigatórios', 'error'); return;
  }

  const cardId = document.getElementById('formCardId').value;

  if (cardId) {
    const card = allCards.find(c => c.id === cardId);
    if (!card) return;
    const oldFase = card.fase;
    Object.assign(card, { titulo, descricao, escola, categoria, prioridade, responsavel, prazo, valor, fornecedor, numDoc, vencimento,
      ...(mod.hasPaymentLink ? { tipoPagamento } : {}) });
    if (fase !== oldFase) {
      card.fase = fase;
      card.historico.push({ texto:`Movido de <strong>${getPhaseStyle(state.currentModule, oldFase).label}</strong> para <strong>${getPhaseStyle(state.currentModule, fase).label}</strong>`, data:now(), usuario:'Emerson Santos' });
    }
    card.historico.push({ texto:'Card atualizado', data:now(), usuario:'Emerson Santos' });
    showToast('Card atualizado!', 'success');
  } else {
    const newCard = {
      id: uid(), modulo: state.currentModule,
      titulo, descricao, escola, categoria, prioridade, fase, responsavel, prazo,
      valor, fornecedor, numDoc, vencimento,
      ...(mod.hasPaymentLink ? { tipoPagamento, linkPagamento:'', codigoTransacao:'', linkStatus:'pendente' } : {}),
      criadoEm: new Date().toISOString().split('T')[0],
      comentarios:[], historico:[{ texto:'Card criado', data:now(), usuario:'Emerson Santos' }],
      anexos:[],
    };
    allCards.unshift(newCard);
    showToast('Card criado!', 'success');
  }

  closeModal();
  renderAll();
}

function deleteCard() {
  if (!state.editingCardId) return;
  if (!confirm('Excluir este card? Esta ação não pode ser desfeita.')) return;
  allCards = allCards.filter(c => c.id !== state.editingCardId);
  fileStore.delete(state.editingCardId);
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
   COMMENTS
══════════════════════════════════════════════════════════ */
function renderComments(card) {
  const list = document.getElementById('commentsList');
  list.innerHTML = '';
  if (!card.comentarios?.length) {
    list.innerHTML = `<p style="font-size:12px;color:var(--quadro-faint);padding:6px 0">Sem comentários ainda.</p>`;
    return;
  }
  card.comentarios.forEach(c => {
    const el = document.createElement('div');
    el.className = 'comment-item';
    el.innerHTML = `
      <div class="comment-avatar">${initials(c.autor)}</div>
      <div class="comment-content">
        <div class="comment-author">${escHtml(c.autor)}</div>
        <div class="comment-text">${escHtml(c.texto)}</div>
        <div class="comment-time">${c.data}</div>
      </div>`;
    list.appendChild(el);
  });
  list.scrollTop = list.scrollHeight;
}

function addComment() {
  const input = document.getElementById('commentInput');
  const text  = input.value.trim();
  if (!text || !state.editingCardId) return;
  const card = allCards.find(c => c.id === state.editingCardId);
  if (!card) return;
  card.comentarios.push({ id:uid(), autor:'Emerson Santos', texto:text, data:now() });
  input.value = '';
  renderComments(card);
  showToast('Comentário adicionado', 'success');
}

/* ══════════════════════════════════════════════════════════
   HISTORY
══════════════════════════════════════════════════════════ */
function renderHistory(card) {
  const list = document.getElementById('historyList');
  list.innerHTML = [...(card.historico || [])].reverse().map(h => `
    <div class="history-item">
      <div class="history-dot"></div>
      <div class="history-content">
        ${h.texto}
        <div style="font-size:10px;color:var(--quadro-faint);margin-top:2px">${h.data} · ${escHtml(h.usuario)}</div>
      </div>
    </div>`).join('');
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

    const body = {
      amount,
      description,
      installments  : 1,
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

    const oldFase  = card.fase;
    const oldLabel = getPhaseStyle('contas_receber', oldFase).label;
    card.fase = 'aguardando_pagamento';

    card.historico.push({
      texto:   `Link de pagamento gerado via e-Rede: <strong>${txCode}</strong> (${tipo.toUpperCase()})`,
      data:    now(),
      usuario: 'Emerson Santos',
    });
    card.historico.push({
      texto:   `Movido de <strong>${oldLabel}</strong> para <strong>Aguard. Pagamento</strong>`,
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

function confirmPayment(cardId) {
  const card = allCards.find(c => c.id === cardId);
  if (!card) return;

  card.linkStatus = 'pago';
  const oldFase  = card.fase;
  const oldLabel = getPhaseStyle('contas_receber', oldFase).label;
  card.fase = 'pagamento_efetuado';
  card.historico.push({
    texto:   `<strong>Pagamento confirmado</strong> — ${formatCurrency(card.valor) || 'valor não informado'} via ${(card.tipoPagamento || 'link').toUpperCase()}`,
    data:    now(),
    usuario: 'Emerson Santos',
  });
  card.historico.push({
    texto:   `Movido de <strong>${oldLabel}</strong> para <strong>Pag. Efetuado</strong>`,
    data:    now(),
    usuario: 'Emerson Santos',
  });

  showToast('Pagamento confirmado! 🎉', 'success');
  closeModal();
  renderAll();
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

  // Oculta kanban/list/stats e exibe settings
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

  // Oculta settings e restaura stats + conteúdo
  document.getElementById('settingsView').classList.add('hidden');
  document.getElementById('statsBar').classList.remove('hidden');
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
    case 'aparencia':  container.innerHTML = buildPanelAparencia(); bindAparenciaEvents(); break;
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
        const label = btn.closest('.escola-status-toggle').querySelector('span');
        if (label) label.textContent = escola.ativa ? 'Ativa' : 'Inativa';
      }
    }
    if (action === 'edit-escola') openEscolaModal(id);
    if (action === 'del-escola') {
      if (confirm('Remover esta escola do sistema?')) {
        settingsData.escolas = settingsData.escolas.filter(s => s.id !== id);
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

  closeEscolaModal();
  renderSettingsPanel('escolas');
}

/* ──────────────────────────────────────────────────────────
   PAINEL: FLUXOS
────────────────────────────────────────────────────────── */
function buildPanelFluxos() {
  const cards = Object.entries(MODULES).map(([key, mod]) => {
    const phases = Object.entries(mod.fases).map(([pkey, phase]) => `
      <div class="fluxo-phase-item">
        <div class="fluxo-phase-dot" style="background:${phase.color}"></div>
        <span class="fluxo-phase-label">${phase.label}</span>
        <input type="color" class="fluxo-phase-color-input"
          value="${phase.color}"
          data-module="${key}" data-phase="${pkey}"
          title="Alterar cor da fase" />
      </div>`).join('');

    return `
      <div class="fluxo-module-card">
        <div class="fluxo-module-header">
          <span class="fluxo-module-name">${mod.label}</span>
          <span class="fluxo-module-count">${Object.keys(mod.fases).length} fases</span>
        </div>
        <div class="fluxo-phases-list">${phases}</div>
      </div>`;
  }).join('');

  return `
    <div class="settings-panel-header">
      <div>
        <h2>Fluxos</h2>
        <p>Visualize e personalize as cores das fases de cada pipeline</p>
      </div>
    </div>
    ${cards}`;
}

function bindFluxosEvents() {
  document.getElementById('settingsContent').addEventListener('change', e => {
    const input = e.target.closest('.fluxo-phase-color-input');
    if (!input) return;
    const modKey   = input.dataset.module;
    const phaseKey = input.dataset.phase;
    if (MODULES[modKey] && MODULES[modKey].fases[phaseKey]) {
      MODULES[modKey].fases[phaseKey].color = input.value;
      const dot = input.closest('.fluxo-phase-item').querySelector('.fluxo-phase-dot');
      if (dot) dot.style.background = input.value;
      showToast('Cor da fase atualizada', 'success');
    }
  });
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
      renderSettingsPanel('aparencia');
      showToast('Logo atualizada com sucesso', 'success');
    };
    reader.readAsDataURL(file);
  });

  const removeLogoBtn = document.getElementById('removeLogoBtn');
  if (removeLogoBtn) {
    removeLogoBtn.addEventListener('click', () => {
      settingsData.aparencia.logo = null;
      renderSettingsPanel('aparencia');
      showToast('Logo removida', 'success');
    });
  }

  document.getElementById('saveNomeBtn').addEventListener('click', () => {
    const val = document.getElementById('nomeExibicaoInput').value.trim();
    if (!val) { showToast('Digite um nome valido', 'warn'); return; }
    settingsData.aparencia.nomeExibicao = val;
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
    showToast('Cor principal aplicada ao sistema', 'success');
    renderSettingsPanel('aparencia');
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

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
function init() {
  // Hash-based routing: escuta mudanças na URL
  window.addEventListener('hashchange', () => {
    const hash = location.hash.slice(1);
    if (hash === 'configuracoes') openSettings();
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
  document.getElementById('cardForm').addEventListener('submit', saveCard);
  document.getElementById('deleteCardBtn').addEventListener('click', deleteCard);

  // Comments
  document.getElementById('addCommentBtn').addEventListener('click', addComment);
  document.getElementById('commentInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addComment(); }
  });

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
  const initialHash = location.hash.slice(1);
  if (initialHash === 'configuracoes') openSettings();
  else switchModule(MODULES[initialHash] ? initialHash : 'solicitacoes');

  console.log('%c🏫 Central Operacional — Grupo PED', 'color:#3B82F6;font-weight:bold;font-size:14px');
  console.log(`%c5 módulos · ${allCards.length} cards de exemplo`, 'color:#64748B;font-size:12px');
}

document.addEventListener('DOMContentLoaded', init);
