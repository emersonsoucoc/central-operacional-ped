/**
 * KanbanBoard — Central Operacional PED
 * React + Tailwind CSS + @dnd-kit/core + @dnd-kit/sortable
 *
 * Dependências:
 *   npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities lucide-react
 */

import { useState, useCallback } from "react"
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Plus,
  MoreHorizontal,
  MessageSquare,
  Paperclip,
  CheckSquare,
  CalendarDays,
  Flag,
  Users,
  Search,
  Bell,
  Settings,
  ChevronDown,
  LayoutGrid,
  List,
  Filter,
  ArrowUpDown,
  Circle,
  Timer,
  CheckCircle2,
  X,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "high" | "medium" | "low"
type ColumnId = "todo" | "in_progress" | "done"

interface Member {
  id: string
  name: string
  avatar: string // initials fallback
  color: string  // bg color for avatar
}

interface Card {
  id: string
  columnId: ColumnId
  status: string
  statusColor: string
  statusBg: string
  title: string
  description: string
  members: Member[]
  dueDate: string
  priority: Priority
  comments: number
  attachments: number
  checklist: { done: number; total: number }
  tags?: string[]
}

interface Column {
  id: ColumnId
  label: string
  dotColor: string
  cards: Card[]
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const SEED_MEMBERS: Record<string, Member> = {
  ana:    { id: "ana",    name: "Ana Lima",     avatar: "AL", color: "bg-violet-500" },
  joao:   { id: "joao",  name: "João Costa",   avatar: "JC", color: "bg-sky-500"    },
  mari:   { id: "mari",  name: "Mariana",      avatar: "MA", color: "bg-emerald-500"},
  pedro:  { id: "pedro", name: "Pedro Souza",  avatar: "PS", color: "bg-amber-500"  },
  lucia:  { id: "lucia", name: "Lúcia Ferreira",avatar:"LF", color: "bg-rose-500"   },
}

const SEED_CARDS: Card[] = [
  // ── TO DO ──
  {
    id: "c1", columnId: "todo",
    status: "Backlog", statusColor: "#64748B", statusBg: "#F1F5F9",
    title: "Revisar contrato de fornecedor",
    description: "Analisar cláusulas de rescisão e reajuste para renovação 2026.",
    members: [SEED_MEMBERS.ana, SEED_MEMBERS.joao],
    dueDate: "15 abr",
    priority: "high",
    comments: 3, attachments: 2, checklist: { done: 1, total: 5 },
    tags: ["Jurídico"],
  },
  {
    id: "c2", columnId: "todo",
    status: "Planejado", statusColor: "#7C3AED", statusBg: "#F5F3FF",
    title: "Configurar integração Pix escola norte",
    description: "Configurar chave Pix e testar recebimentos no ambiente de produção.",
    members: [SEED_MEMBERS.pedro],
    dueDate: "18 abr",
    priority: "medium",
    comments: 1, attachments: 0, checklist: { done: 0, total: 3 },
  },
  {
    id: "c3", columnId: "todo",
    status: "Backlog", statusColor: "#64748B", statusBg: "#F1F5F9",
    title: "Levantar necessidade de compras Q2",
    description: "Coletar requisições de material das coordenações até 20/04.",
    members: [SEED_MEMBERS.mari, SEED_MEMBERS.lucia, SEED_MEMBERS.joao],
    dueDate: "20 abr",
    priority: "low",
    comments: 0, attachments: 1, checklist: { done: 2, total: 4 },
  },

  // ── IN PROGRESS ──
  {
    id: "c4", columnId: "in_progress",
    status: "Em progresso", statusColor: "#F59E0B", statusBg: "#FFFBEB",
    title: "Relatório financeiro março",
    description: "Consolidar DRE e fluxo de caixa das 4 unidades.",
    members: [SEED_MEMBERS.ana, SEED_MEMBERS.pedro],
    dueDate: "10 abr",
    priority: "high",
    comments: 7, attachments: 3, checklist: { done: 3, total: 5 },
    tags: ["Financeiro"],
  },
  {
    id: "c5", columnId: "in_progress",
    status: "Revisão", statusColor: "#3B82F6", statusBg: "#EFF6FF",
    title: "Treinamento de docentes — módulo EAD",
    description: "Preparar slides e roteiro para capacitação da equipe pedagógica.",
    members: [SEED_MEMBERS.mari],
    dueDate: "12 abr",
    priority: "medium",
    comments: 2, attachments: 5, checklist: { done: 4, total: 6 },
  },
  {
    id: "c6", columnId: "in_progress",
    status: "Em progresso", statusColor: "#F59E0B", statusBg: "#FFFBEB",
    title: "Auditoria de acessos do sistema",
    description: "Verificar permissões de usuários inativos e revisar perfis.",
    members: [SEED_MEMBERS.joao, SEED_MEMBERS.lucia],
    dueDate: "11 abr",
    priority: "high",
    comments: 4, attachments: 0, checklist: { done: 1, total: 3 },
    tags: ["T.I."],
  },

  // ── DONE ──
  {
    id: "c7", columnId: "done",
    status: "Concluído", statusColor: "#10B981", statusBg: "#ECFDF5",
    title: "Renovação de licenças de software",
    description: "Contrato anual renovado com desconto de 15%.",
    members: [SEED_MEMBERS.pedro, SEED_MEMBERS.ana],
    dueDate: "5 abr",
    priority: "medium",
    comments: 5, attachments: 4, checklist: { done: 5, total: 5 },
  },
  {
    id: "c8", columnId: "done",
    status: "Concluído", statusColor: "#10B981", statusBg: "#ECFDF5",
    title: "Cadastro de novos fornecedores",
    description: "4 fornecedores homologados e inseridos no sistema.",
    members: [SEED_MEMBERS.lucia],
    dueDate: "3 abr",
    priority: "low",
    comments: 2, attachments: 1, checklist: { done: 3, total: 3 },
  },
]

const SEED_COLUMNS: Column[] = [
  { id: "todo",        label: "A fazer",       dotColor: "#94A3B8", cards: [] },
  { id: "in_progress", label: "Em progresso",  dotColor: "#F59E0B", cards: [] },
  { id: "done",        label: "Concluído",     dotColor: "#10B981", cards: [] },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<Priority, { label: string; classes: string }> = {
  high:   { label: "Alta",   classes: "bg-red-50   text-red-600   ring-red-200"   },
  medium: { label: "Média",  classes: "bg-amber-50 text-amber-600 ring-amber-200" },
  low:    { label: "Baixa",  classes: "bg-blue-50  text-blue-600  ring-blue-200"  },
}

const COLUMN_DOT_ICONS: Record<ColumnId, React.ElementType> = {
  todo:        Circle,
  in_progress: Timer,
  done:        CheckCircle2,
}

function buildColumns(cards: Card[]): Column[] {
  return SEED_COLUMNS.map((col) => ({
    ...col,
    cards: cards.filter((c) => c.columnId === col.id),
  }))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ member, size = "sm" }: { member: Member; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs"
  return (
    <div
      className={`${sz} ${member.color} rounded-full flex items-center justify-center text-white font-semibold ring-2 ring-white select-none`}
      title={member.name}
    >
      {member.avatar}
    </div>
  )
}

function AvatarStack({ members }: { members: Member[] }) {
  const visible = members.slice(0, 3)
  const extra = members.length - 3
  return (
    <div className="flex -space-x-2">
      {visible.map((m) => (
        <Avatar key={m.id} member={m} size="sm" />
      ))}
      {extra > 0 && (
        <div className="w-6 h-6 rounded-full bg-gray-100 ring-2 ring-white flex items-center justify-center text-[10px] font-semibold text-gray-500">
          +{extra}
        </div>
      )}
    </div>
  )
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const cfg = PRIORITY_CONFIG[priority]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${cfg.classes}`}>
      <Flag size={9} />
      {cfg.label}
    </span>
  )
}

function StatusBadge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: bg, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

// ─── Card Component ───────────────────────────────────────────────────────────

interface KanbanCardProps {
  card: Card
  isDragging?: boolean
}

function KanbanCard({ card, isDragging = false }: KanbanCardProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-100 p-4 space-y-3 transition-shadow
        ${isDragging
          ? "shadow-2xl ring-2 ring-violet-400/40 opacity-90 rotate-1"
          : "shadow-sm hover:shadow-md"
        }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <StatusBadge label={card.status} color={card.statusColor} bg={card.statusBg} />
        <button className="text-gray-300 hover:text-gray-500 transition-colors p-0.5 rounded">
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* Title */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 leading-snug">{card.title}</h3>
        {card.description && (
          <p className="mt-1 text-xs text-gray-400 leading-relaxed line-clamp-2">
            {card.description}
          </p>
        )}
      </div>

      {/* Tags */}
      {card.tags && card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {card.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 bg-gray-50 border border-gray-200 rounded-full text-[10px] font-medium text-gray-500">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-50">
        {/* Left: avatars + priority */}
        <div className="flex items-center gap-2.5">
          <AvatarStack members={card.members} />
          <PriorityBadge priority={card.priority} />
        </div>

        {/* Right: meta */}
        <div className="flex items-center gap-2.5 text-gray-300">
          {card.dueDate && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400 font-medium">
              <CalendarDays size={10} className="text-gray-300" />
              {card.dueDate}
            </span>
          )}
          {card.comments > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
              <MessageSquare size={10} />
              {card.comments}
            </span>
          )}
          {card.attachments > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
              <Paperclip size={10} />
              {card.attachments}
            </span>
          )}
          {card.checklist.total > 0 && (
            <span className={`flex items-center gap-0.5 text-[10px] font-medium ${card.checklist.done === card.checklist.total ? "text-emerald-500" : "text-gray-400"}`}>
              <CheckSquare size={10} />
              {card.checklist.done}/{card.checklist.total}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sortable Card Wrapper ────────────────────────────────────────────────────

function SortableCard({ card }: { card: Card }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", card },
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    cursor: isDragging ? "grabbing" : "grab",
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard card={card} />
    </div>
  )
}

// ─── Column Component ─────────────────────────────────────────────────────────

function KanbanColumn({ column }: { column: Column }) {
  const DotIcon = COLUMN_DOT_ICONS[column.id]

  return (
    <div className="flex flex-col w-[300px] md:w-[320px] flex-shrink-0">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <DotIcon
          size={14}
          style={{ color: column.dotColor }}
          className="flex-shrink-0"
          strokeWidth={2.5}
        />
        <span className="text-sm font-semibold text-gray-700 flex-1">{column.label}</span>
        <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500">
          {column.cards.length}
        </span>
        <button
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          title="Adicionar card"
        >
          <Plus size={14} />
        </button>
        <button
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          title="Opções"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* Cards area */}
      <div className="flex-1 bg-gray-50/60 rounded-2xl p-2.5 space-y-2.5 min-h-[200px] border border-gray-100">
        <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {column.cards.map((card) => (
            <SortableCard key={card.id} card={card} />
          ))}
        </SortableContext>

        {column.cards.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-gray-300 gap-1.5">
            <LayoutGrid size={20} />
            <span className="text-xs">Arraste cards aqui</span>
          </div>
        )}
      </div>

      {/* Add card button */}
      <button className="mt-2.5 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors w-full">
        <Plus size={13} />
        Adicionar card
      </button>
    </div>
  )
}

// ─── Page Header ──────────────────────────────────────────────────────────────

const TABS = ["Visão geral", "Tarefas", "Prazos", "Relatórios", "Configurações"]

function PageHeader({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (t: string) => void }) {
  return (
    <div className="border-b border-gray-100 bg-white px-6 pt-5 pb-0">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tarefas</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gerencie e acompanhe as tarefas operacionais de todas as unidades.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex-shrink-0">
          <Users size={15} />
          Convidar membro
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === tab
                ? "border-violet-600 text-violet-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar() {
  return (
    <div className="flex items-center justify-between gap-3 px-6 py-3 bg-white border-b border-gray-100">
      {/* Left */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-400 w-56">
          <Search size={13} />
          <span>Buscar tarefa…</span>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors">
          <Filter size={13} />
          Filtrar
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors">
          <ArrowUpDown size={13} />
          Ordenar
        </button>
      </div>

      {/* Right: view toggle */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
        <button className="w-7 h-7 flex items-center justify-center rounded-md bg-white shadow-sm text-gray-700">
          <LayoutGrid size={14} />
        </button>
        <button className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-white hover:shadow-sm transition-all">
          <List size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Main Board ───────────────────────────────────────────────────────────────

function KanbanBoard() {
  const [cards, setCards] = useState<Card[]>(SEED_CARDS)
  const [activeCard, setActiveCard] = useState<Card | null>(null)
  const [activeTab, setActiveTab] = useState("Tarefas")

  const columns = buildColumns(cards)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const findColumn = useCallback(
    (id: string): ColumnId | null => {
      const card = cards.find((c) => c.id === id)
      if (card) return card.columnId
      // id might be a column id
      if (SEED_COLUMNS.find((col) => col.id === id)) return id as ColumnId
      return null
    },
    [cards]
  )

  const onDragStart = (e: DragStartEvent) => {
    const card = cards.find((c) => c.id === e.active.id)
    if (card) setActiveCard(card)
  }

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over) return
    if (active.id === over.id) return

    const activeColId = findColumn(active.id as string)
    const overColId   = findColumn(over.id as string)
    if (!activeColId || !overColId || activeColId === overColId) return

    setCards((prev) =>
      prev.map((c) =>
        c.id === active.id ? { ...c, columnId: overColId } : c
      )
    )
  }

  const onDragEnd = (e: DragEndEvent) => {
    setActiveCard(null)
    const { active, over } = e
    if (!over) return
    if (active.id === over.id) return

    const activeColId = findColumn(active.id as string)
    const overColId   = findColumn(over.id as string)
    if (!activeColId || !overColId) return

    setCards((prev) => {
      const colCards  = prev.filter((c) => c.columnId === activeColId)
      const otherCards = prev.filter((c) => c.columnId !== activeColId)
      const activeIdx  = colCards.findIndex((c) => c.id === active.id)
      const overIdx    = colCards.findIndex((c) => c.id === over.id)
      if (overIdx === -1) return prev
      const reordered = arrayMove(colCards, activeIdx, overIdx)
      return [...otherCards, ...reordered]
    })
  }

  return (
    <div className="flex flex-col h-screen bg-white font-sans">
      {/* Top nav (minimal shell) */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
            <LayoutGrid size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-800">Central Operacional</span>
          <ChevronDown size={14} className="text-gray-400" />
        </div>
        <div className="flex items-center gap-2">
          <button className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 transition-colors">
            <Bell size={16} />
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 transition-colors">
            <Settings size={16} />
          </button>
          <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center text-white text-xs font-bold ml-1">
            ES
          </div>
        </div>
      </header>

      {/* Page header with tabs */}
      <PageHeader activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Toolbar */}
      <Toolbar />

      {/* Board — horizontal scroll on mobile */}
      <main className="flex-1 overflow-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-5 p-6 min-w-max">
            {columns.map((col) => (
              <KanbanColumn key={col.id} column={col} />
            ))}

            {/* Add column button */}
            <button className="flex items-center gap-2 h-10 mt-[2px] px-4 py-2 rounded-xl border-2 border-dashed border-gray-200 text-sm font-medium text-gray-400 hover:border-violet-300 hover:text-violet-500 transition-all flex-shrink-0 self-start">
              <Plus size={15} />
              Nova coluna
            </button>
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {activeCard && <KanbanCard card={activeCard} isDragging />}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  )
}

export default KanbanBoard
