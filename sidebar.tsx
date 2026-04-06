"use client"

/**
 * Sidebar — Untitled UI (pixel-perfect)
 * Stack : Next.js App Router · TypeScript · Tailwind CSS
 * Deps  : lucide-react   →  npm i lucide-react
 *
 * Coloque em: components/layout/sidebar.tsx
 * Use:
 *   import Sidebar from "@/components/layout/sidebar"
 *   <Sidebar />
 */

import { useState } from "react"
import {
  Package,
  BarChart2,
  CreditCard,
  ShoppingBag,
  Users,
  Wallet,
  PenSquare,
  Monitor,
  Gauge,
  UserCog,
  Sliders,
  ChevronDown,
  ChevronRight,
  Plus,
  ArrowLeftRight,
  Bell,
  Settings,
} from "lucide-react"

/* ─────────────────────────────────────────────
   TIPOS
───────────────────────────────────────────── */
type SubItem = {
  label: string
  badge?: number
  href?: string
}

type NavItem = {
  icon: React.ElementType
  label: string
  href?: string
  badge?: number
  addable?: boolean           // mostra o botão "+"
  expandable?: boolean        // tem sub-itens colapsáveis
  subItems?: SubItem[]
}

type Workspace = {
  name: string
  domain: string
}

/* ─────────────────────────────────────────────
   DADOS (troque pelos dados reais)
───────────────────────────────────────────── */
const WORKSPACE: Workspace = {
  name: "Untitled UI",
  domain: "store.untitledui.com",
}

const WORKSPACES: Workspace[] = [
  { name: "Untitled UI",  domain: "store.untitledui.com" },
  { name: "Epicurious",   domain: "epicurious.com" },
  { name: "BoltShift",    domain: "boltshift.io" },
]

const TOP_NAV: NavItem[] = [
  { icon: Package,      label: "Products",     href: "/products" },
  { icon: BarChart2,    label: "Analytics",    href: "/analytics" },
  { icon: CreditCard,   label: "Transactions", href: "/transactions" },
  { icon: ShoppingBag,  label: "Orders",       href: "/orders" },
  { icon: Users,        label: "Subscribers",  href: "/subscribers" },
  { icon: Wallet,       label: "Payouts",      href: "/payouts" },
]

const MID_NAV: NavItem[] = [
  {
    icon: PenSquare,
    label: "Posts",
    addable: true,
    expandable: true,
    subItems: [
      { label: "Drafts",    badge: 10, href: "/posts/drafts" },
      { label: "Scheduled", badge: 2,  href: "/posts/scheduled" },
      { label: "Published", badge: 28, href: "/posts/published" },
    ],
  },
  {
    icon: Monitor,
    label: "Pages",
    addable: true,
    href: "/pages",
  },
]

const BOTTOM_NAV: NavItem[] = [
  { icon: Gauge,    label: "Performance",      href: "/performance" },
  { icon: UserCog,  label: "Team management",  href: "/team" },
  { icon: Sliders,  label: "Customize",        href: "/customize" },
]

/* ─────────────────────────────────────────────
   TOKENS DE COR (centralizados)
   — edite aqui para mudar todo o tema
───────────────────────────────────────────── */
const C = {
  /* sidebar */
  bg:          "bg-white dark:bg-[#0C0C0E]",
  border:      "border-gray-100 dark:border-white/[0.06]",

  /* item padrão */
  itemText:    "text-gray-500 dark:text-white/40",
  itemHover:   "hover:bg-gray-50 dark:hover:bg-white/[0.05] hover:text-gray-700 dark:hover:text-white/70",

  /* item ativo */
  activeText:  "text-gray-900 dark:text-white",
  activeBg:    "bg-gray-100 dark:bg-white/[0.08]",

  /* badge */
  badge:       "bg-gray-900 dark:bg-[#1E1E1E] text-white",
  badgeBorder: "ring-1 ring-black/5 dark:ring-white/10",

  /* muted (workspace domain, switch) */
  muted:       "text-gray-400 dark:text-white/30",

  /* workspace switcher popup */
  popupBg:     "bg-white dark:bg-[#161618]",
  popupBorder: "border-gray-100 dark:border-white/[0.08]",
  popupItem:   "hover:bg-gray-50 dark:hover:bg-white/[0.05]",
}

/* ─────────────────────────────────────────────
   BADGE
───────────────────────────────────────────── */
function Badge({ count }: { count: number }) {
  return (
    <span
      className={`
        inline-flex items-center justify-center min-w-[20px] h-5 px-1.5
        text-[11px] font-semibold rounded-full
        ${C.badge} ${C.badgeBorder}
      `}
    >
      {count}
    </span>
  )
}

/* ─────────────────────────────────────────────
   BOTÃO "+"
───────────────────────────────────────────── */
function PlusBtn({ onClick }: { onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(e) }}
      className={`
        flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0
        ${C.muted} hover:text-gray-600 dark:hover:text-white/60
        hover:bg-gray-100 dark:hover:bg-white/[0.08]
        transition-colors duration-150
      `}
      title="Adicionar"
    >
      <Plus className="w-3 h-3" strokeWidth={2} />
    </button>
  )
}

/* ─────────────────────────────────────────────
   LINHA DE ITEM (top / bottom nav)
───────────────────────────────────────────── */
function NavRow({
  item,
  collapsed,
  active,
  onClick,
}: {
  item: NavItem
  collapsed: boolean
  active: boolean
  onClick: () => void
}) {
  const Icon = item.icon

  return (
    <button
      onClick={onClick}
      className={`
        flex items-center w-full gap-2.5 rounded-lg
        text-sm font-medium transition-colors duration-150
        ${collapsed ? "justify-center px-2 py-2.5" : "px-2.5 py-2"}
        ${active
          ? `${C.activeText} ${C.activeBg}`
          : `${C.itemText} ${C.itemHover}`
        }
      `}
    >
      <Icon
        className={`flex-shrink-0 transition-colors ${collapsed ? "w-5 h-5" : "w-[18px] h-[18px]"}`}
        strokeWidth={1.6}
      />
      {!collapsed && (
        <>
          <span className="flex-1 text-left truncate leading-snug">
            {item.label}
          </span>
          {item.badge !== undefined && <Badge count={item.badge} />}
        </>
      )}
    </button>
  )
}

/* ─────────────────────────────────────────────
   LINHA DE ITEM EXPANSÍVEL (Posts, Pages)
───────────────────────────────────────────── */
function ExpandableRow({
  item,
  collapsed,
  active,
  open,
  onToggle,
  onPlusClick,
}: {
  item: NavItem
  collapsed: boolean
  active: boolean
  open: boolean
  onToggle: () => void
  onPlusClick?: () => void
}) {
  const Icon = item.icon

  return (
    <div>
      {/* Cabeçalho do grupo */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggle}
          className={`
            flex items-center flex-1 gap-2.5 rounded-lg
            text-sm font-medium transition-colors duration-150
            ${collapsed ? "justify-center px-2 py-2.5" : "px-2.5 py-2"}
            ${active
              ? `${C.activeText} ${C.activeBg}`
              : `${C.itemText} ${C.itemHover}`
            }
          `}
        >
          <Icon
            className={`flex-shrink-0 ${collapsed ? "w-5 h-5" : "w-[18px] h-[18px]"}`}
            strokeWidth={1.6}
          />
          {!collapsed && (
            <>
              <span className="flex-1 text-left truncate leading-snug">
                {item.label}
              </span>
              {item.addable && (
                <PlusBtn onClick={onPlusClick} />
              )}
              {item.expandable && (
                <ChevronRight
                  className={`
                    w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200
                    ${C.muted} ${open ? "rotate-90" : ""}
                  `}
                  strokeWidth={2}
                />
              )}
            </>
          )}
        </button>
      </div>

      {/* Sub-itens */}
      {!collapsed && item.subItems && (
        <div
          className={`
            overflow-hidden transition-all duration-200
            ${open ? "max-h-96 opacity-100 mt-0.5" : "max-h-0 opacity-0"}
          `}
        >
          <div className="ml-[30px] border-l border-gray-100 dark:border-white/[0.06] pl-3 space-y-0.5 pb-0.5">
            {item.subItems.map((sub) => (
              <a
                key={sub.label}
                href={sub.href ?? "#"}
                className={`
                  flex items-center justify-between w-full gap-2
                  px-2 py-1.5 rounded-md text-sm
                  transition-colors duration-150
                  ${C.itemText} ${C.itemHover}
                `}
              >
                <span className="flex-1 truncate">{sub.label}</span>
                {sub.badge !== undefined && <Badge count={sub.badge} />}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   WORKSPACE SWITCHER DROPDOWN
───────────────────────────────────────────── */
function WorkspaceSwitcher({
  workspaces,
  current,
  onSelect,
  onClose,
}: {
  workspaces: Workspace[]
  current: Workspace
  onSelect: (w: Workspace) => void
  onClose: () => void
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      {/* Popup */}
      <div
        className={`
          absolute left-3 top-[68px] z-50 w-56
          rounded-xl border shadow-xl
          ${C.popupBg} ${C.popupBorder}
          py-1.5 overflow-hidden
        `}
      >
        {workspaces.map((ws) => (
          <button
            key={ws.domain}
            onClick={() => { onSelect(ws); onClose() }}
            className={`
              flex items-center gap-3 w-full px-3 py-2.5
              text-sm transition-colors
              ${C.popupItem}
            `}
          >
            {/* Radio indicator */}
            <span
              className={`
                flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center
                ${ws.domain === current.domain
                  ? "border-gray-900 dark:border-white"
                  : "border-gray-300 dark:border-white/20"
                }
              `}
            >
              {ws.domain === current.domain && (
                <span className="w-2 h-2 rounded-full bg-gray-900 dark:bg-white" />
              )}
            </span>
            {/* Ícone da workspace */}
            <span className="w-6 h-6 rounded-md bg-gray-900 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[10px] font-bold">
                {ws.name.charAt(0)}
              </span>
            </span>
            {/* Info */}
            <span className={`flex-1 text-left font-medium text-gray-800 dark:text-white/80 truncate`}>
              {ws.name}
            </span>
            {/* External link icon */}
            <svg className={`w-3.5 h-3.5 ${C.muted}`} fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth={1.5}>
              <path d="M5 2H2.5A1.5 1.5 0 001 3.5v8A1.5 1.5 0 002.5 13h8A1.5 1.5 0 0012 11.5V9M9 1h4m0 0v4m0-4L5.5 8.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ))}

        {/* Divider */}
        <div className={`my-1.5 h-px ${C.border} mx-2`} />

        {/* Create store */}
        <button
          className={`
            flex items-center gap-2 w-full px-3 py-2.5 text-sm
            bg-gray-900 dark:bg-white/[0.08]
            text-white dark:text-white/80 font-medium
            rounded-lg mx-1.5 w-[calc(100%-12px)]
            hover:bg-gray-800 dark:hover:bg-white/[0.12]
            transition-colors
          `}
          onClick={onClose}
        >
          <Plus className="w-3.5 h-3.5" />
          Create store
        </button>
      </div>
    </>
  )
}

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function Sidebar() {
  const [collapsed, setCollapsed]         = useState(false)
  const [activeItem, setActiveItem]       = useState("Analytics")
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({ Posts: true })
  const [workspace, setWorkspace]         = useState<Workspace>(WORKSPACE)
  const [showSwitcher, setShowSwitcher]   = useState(false)

  function toggleExpand(label: string) {
    setExpandedItems(prev => ({ ...prev, [label]: !prev[label] }))
    setActiveItem(label)
  }

  return (
    <div
      className={`
        relative flex flex-col h-screen
        ${collapsed ? "w-[64px]" : "w-[240px]"}
        transition-[width] duration-200 ease-in-out
        ${C.bg} border-r ${C.border}
        overflow-hidden select-none
      `}
    >
      {/* ── 1. WORKSPACE HEADER ─────────────────── */}
      <div className="px-3 pt-4 pb-0 flex-shrink-0 relative">
        <button
          onClick={() => !collapsed && setShowSwitcher(p => !p)}
          className={`
            flex items-center gap-2.5 w-full rounded-lg
            px-2 py-2 transition-colors duration-150
            hover:bg-gray-50 dark:hover:bg-white/[0.05]
            ${collapsed ? "justify-center" : ""}
          `}
        >
          {/* Logo mark */}
          <div className="w-8 h-8 rounded-[9px] bg-gray-900 dark:bg-white/[0.12] flex items-center justify-center flex-shrink-0 shadow-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white">
              <path
                d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </div>

          {!collapsed && (
            <>
              <div className="flex flex-col flex-1 min-w-0 text-left">
                <span className="text-[13.5px] font-semibold text-gray-900 dark:text-white leading-tight truncate">
                  {workspace.name}
                </span>
                <span className={`text-[11px] leading-tight truncate ${C.muted}`}>
                  {workspace.domain}
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 flex-shrink-0 ${C.muted} transition-transform duration-150 ${showSwitcher ? "rotate-180" : ""}`}
                strokeWidth={1.8}
              />
            </>
          )}
        </button>

        {/* Workspace switcher dropdown */}
        {showSwitcher && !collapsed && (
          <WorkspaceSwitcher
            workspaces={WORKSPACES}
            current={workspace}
            onSelect={setWorkspace}
            onClose={() => setShowSwitcher(false)}
          />
        )}
      </div>

      {/* ── 2. SWITCH STORES LINK ───────────────── */}
      {!collapsed && (
        <div className="px-5 pt-1.5 pb-3 flex-shrink-0">
          <button
            className={`
              flex items-center gap-1.5 text-[12px] font-medium
              ${C.muted} hover:text-gray-500 dark:hover:text-white/50
              transition-colors duration-150
            `}
          >
            <ArrowLeftRight className="w-3 h-3" strokeWidth={2} />
            Switch stores
          </button>
        </div>
      )}

      {/* ── 3. NAV PRINCIPAL (scroll) ───────────── */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-px scrollbar-none">

        {/* Grupo superior: Products → Payouts */}
        <div className="space-y-px py-1">
          {TOP_NAV.map((item) => (
            <NavRow
              key={item.label}
              item={item}
              collapsed={collapsed}
              active={activeItem === item.label}
              onClick={() => setActiveItem(item.label)}
            />
          ))}
        </div>

        {/* Divisor */}
        <div className={`h-px ${C.border} my-1`} />

        {/* Grupo do meio: Posts, Pages */}
        <div className="space-y-px py-1">
          {MID_NAV.map((item) =>
            item.expandable || item.addable ? (
              <ExpandableRow
                key={item.label}
                item={item}
                collapsed={collapsed}
                active={activeItem === item.label}
                open={!!expandedItems[item.label]}
                onToggle={() => toggleExpand(item.label)}
              />
            ) : (
              <NavRow
                key={item.label}
                item={item}
                collapsed={collapsed}
                active={activeItem === item.label}
                onClick={() => setActiveItem(item.label)}
              />
            )
          )}
        </div>
      </nav>

      {/* ── 4. NAV INFERIOR: Performance → Customize */}
      <div className={`px-2 pt-1 border-t ${C.border} flex-shrink-0`}>
        <div className="space-y-px py-1">
          {BOTTOM_NAV.map((item) => (
            <NavRow
              key={item.label}
              item={item}
              collapsed={collapsed}
              active={activeItem === item.label}
              onClick={() => setActiveItem(item.label)}
            />
          ))}
        </div>
      </div>

      {/* ── 5. FOOTER: Bell + Settings ──────────── */}
      <div className={`px-3 py-3 border-t ${C.border} flex items-center gap-1 flex-shrink-0`}>
        {[
          { Icon: Bell,     title: "Notificações" },
          { Icon: Settings, title: "Configurações" },
        ].map(({ Icon, title }) => (
          <button
            key={title}
            title={title}
            className={`
              flex items-center justify-center w-8 h-8 rounded-lg
              ${C.muted}
              hover:bg-gray-100 dark:hover:bg-white/[0.06]
              hover:text-gray-600 dark:hover:text-white/60
              transition-colors duration-150
            `}
          >
            <Icon className="w-4 h-4" strokeWidth={1.6} />
          </button>
        ))}

        {/* Botão para colapsar (só desktop) */}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            title="Recolher menu"
            className={`
              ml-auto flex items-center justify-center w-8 h-8 rounded-lg
              ${C.muted}
              hover:bg-gray-100 dark:hover:bg-white/[0.06]
              hover:text-gray-600 dark:hover:text-white/60
              transition-colors duration-150
            `}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M9 2L4 7l5 5" />
            </svg>
          </button>
        )}

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            title="Expandir menu"
            className={`
              flex items-center justify-center w-8 h-8 rounded-lg
              ${C.muted}
              hover:bg-gray-100 dark:hover:bg-white/[0.06]
              hover:text-gray-600 dark:hover:text-white/60
              transition-colors duration-150
            `}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M5 2l5 5-5 5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
