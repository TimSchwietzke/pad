import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useCreateTodo, useProjects, useReorderTodos, useTags, useTodos, useUpdateTodo } from './hooks'
import type { Priority, Project, Todo, TodoInput } from './types'

// Which top-level view is shown. dashboard is the (placeholder) start page.
type View = 'dashboard' | 'todos'

// Which field the list is sorted by, mapped to the backend's ?sort= spec.
// "custom" is the manual drag order (todos.position).
type SortKey = 'priority' | 'effort' | 'deadline' | 'custom'
const sortSpec: Record<SortKey, string> = {
  priority: '-priority', // highest first
  effort: 'estimate', // smallest effort first
  deadline: 'due', // soonest deadline first
  custom: 'position', // the user's manual order
}

// How densely the list is rendered. Comfortable is the roomy default;
// compact tightens rows so more fits on screen.
type Density = 'comfortable' | 'compact'

const priorityLabel: Record<Exclude<Priority, 0>, string> = { 1: 'low', 2: 'medium', 3: 'high' }

/** Formats an effort estimate in minutes, e.g. 45 -> "45 min", 90 -> "1 h 30 min". */
function formatEstimate(min: number | null): string | null {
  if (min == null) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Formats a due date relative to today, lowercased ("today", "tomorrow", "12 oct"). */
function formatDue(iso: string | null): { label: string; overdue: boolean } | null {
  if (!iso) return null
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / 86_400_000)
  let label: string
  if (days === 0) label = 'today'
  else if (days === 1) label = 'tomorrow'
  else if (days === -1) label = 'yesterday'
  else label = new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toLowerCase()
  return { label, overdue: days < 0 }
}

/** A friendly, personal summary line for the to-dos header. */
function pendingLabel(isPending: boolean, count: number): string {
  if (isPending) return 'loading…'
  if (count === 0) return "you're all caught up"
  return `you have ${count} pending ${count === 1 ? 'task' : 'tasks'}`
}

// --- tiny inline icons (stroke, inherit color) ----------------------------
const sv = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const Search = () => <svg width="18" height="18" viewBox="0 0 24 24" {...sv} aria-hidden><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.2-4.2" /></svg>
const Plus = () => <svg width="18" height="18" viewBox="0 0 24 24" {...sv} aria-hidden><path d="M12 5v14M5 12h14" /></svg>
const Moon = () => <svg width="18" height="18" viewBox="0 0 24 24" {...sv} aria-hidden><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
const Sun = () => <svg width="18" height="18" viewBox="0 0 24 24" {...sv} aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>
const Clock = () => <svg width="15" height="15" viewBox="0 0 24 24" {...sv} aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
const Cal = () => <svg width="15" height="15" viewBox="0 0 24 24" {...sv} aria-hidden><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M7 3v4M17 3v4M4 10h16" /></svg>
const Grid = () => <svg width="18" height="18" viewBox="0 0 24 24" {...sv} aria-hidden><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>
const Check = () => <svg width="18" height="18" viewBox="0 0 24 24" {...sv} aria-hidden><path d="M5 12.5l4 4L19 7" /></svg>
const Bell = () => <svg width="18" height="18" viewBox="0 0 24 24" {...sv} aria-hidden><path d="M6 9a6 6 0 0112 0c0 4.5 1.2 5.8 2.2 6.8.4.4.1 1.2-.5 1.2H4.3c-.6 0-.9-.8-.5-1.2C4.8 14.8 6 13.5 6 9z" /><path d="M10.2 20a1.9 1.9 0 003.6 0" /></svg>
// custom-drawn icons (no third-party assets) — funnel for filter, export-up for share
const Filter = () => <svg width="16" height="16" viewBox="0 0 24 24" {...sv} aria-hidden><path d="M4 6h16M7 12h10M10 18h4" /></svg>
const Share = () => <svg width="16" height="16" viewBox="0 0 24 24" {...sv} aria-hidden><path d="M12 15V4M8.5 7.5L12 4l3.5 3.5" /><path d="M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5" /></svg>
const Rows = () => <svg width="16" height="16" viewBox="0 0 24 24" {...sv} aria-hidden><rect x="4" y="5" width="16" height="6" rx="1.5" /><rect x="4" y="13" width="16" height="6" rx="1.5" /></svg>
const Lines = () => <svg width="16" height="16" viewBox="0 0 24 24" {...sv} aria-hidden><path d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
// six-dot drag affordance — a placeholder for the future custom-priority handle
const Grip = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></svg>

/** A small round avatar placeholder (auth/account logic comes later). */
function Avatar({ size = 32 }: { size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size }} aria-hidden>
      a
    </span>
  )
}

/**
 * The pad shell + ToDo module. Sidebar (dashboard/to-dos nav, projects, tags,
 * account), top bar (search, theme, account), and the selected view. Theme is
 * token-driven and starts in the OS color scheme. UI copy is lowercase; user
 * content (titles, names) is shown as entered.
 *
 * The theme/preset toggles live in the top bar only for now — they move into a
 * settings page later. The dashboard is a placeholder until widget config lands.
 */
export function TodoDashboard() {
  const [preset, setPreset] = useState<'standard' | 'google'>('standard')
  // Start in the visitor's OS color scheme; the toggle overrides it.
  const [mode, setMode] = useState<'light' | 'dark'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const [view, setView] = useState<View>('dashboard')
  const [sort, setSort] = useState<SortKey>('priority')
  const [density, setDensity] = useState<Density>('comfortable')

  useEffect(() => {
    const root = document.documentElement
    root.dataset.preset = preset
    root.dataset.mode = mode
  }, [preset, mode])

  const projects = useProjects()
  const tags = useTags()
  const todos = useTodos(sortSpec[sort])
  const create = useCreateTodo()
  const update = useUpdateTodo()
  const reorder = useReorderTodos()

  // Drag-to-reorder works from any sort. dragId is the row being dragged, overId
  // the row it's hovering, so we can show a drop indicator.
  const isCustom = sort === 'custom'
  const [dragId, setDragId] = useState<number | null>(null)
  const [overId, setOverId] = useState<number | null>(null)

  /**
   * Moves the dragged todo to the drop target's slot. Starting from whatever order
   * is on screen, the result is saved as the manual order and the view switches to
   * "custom" — so a drag from any sort just becomes the custom arrangement.
   */
  const dropOn = (targetId: number) => {
    setOverId(null)
    const dragged = dragId
    setDragId(null)
    if (dragged === null || dragged === targetId) return

    const current = todos.data ?? []
    const from = current.findIndex((t) => t.id === dragged)
    const to = current.findIndex((t) => t.id === targetId)
    if (from === -1 || to === -1) return

    const next = [...current]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    reorder.mutate(next) // seeds the custom-order cache + persists
    if (sort !== 'custom') setSort('custom')
  }

  const projectsById = useMemo(() => {
    const map = new Map<number, Project>()
    for (const p of projects.data ?? []) map.set(p.id, p)
    return map
  }, [projects.data])

  const toggleDone = (todo: Todo) => {
    const input: TodoInput = {
      project_id: todo.project_id,
      title: todo.title,
      notes: todo.notes,
      priority: todo.priority,
      status: todo.status === 'open' ? 'done' : 'open',
      due_at: todo.due_at,
      estimate_minutes: todo.estimate_minutes,
    }
    update.mutate({ id: todo.id, input })
  }

  const openCount = (todos.data ?? []).filter((t) => t.status === 'open').length

  return (
    <div className="app" data-preset={preset} data-mode={mode}>
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__name">pad</span>
          <span className="sidebar__tagline">productivity workspace</span>
        </div>

        <nav className="nav" aria-label="views">
          <button className={`nav__item${view === 'dashboard' ? ' is-active' : ''}`} onClick={() => setView('dashboard')}>
            <Grid /> dashboard
          </button>
          <button className={`nav__item${view === 'todos' ? ' is-active' : ''}`} onClick={() => setView('todos')}>
            <Check /> to-dos
          </button>
          <button className="nav__item" disabled><Cal /> calendar</button>
          <button className="nav__item" disabled><Grid /> applications</button>
        </nav>

        <SidebarSection label="projects">
          {(projects.data ?? []).map((p) => (
            <div className="project" key={p.id}>
              <span className="project__dot" style={{ background: p.color || 'var(--color-text-secondary)' }} />
              <span className="project__name">{p.name}</span>
            </div>
          ))}
          {projects.data?.length === 0 && <p className="sidebar__empty">no projects yet</p>}
        </SidebarSection>

        <SidebarSection label="tags">
          <div className="tag-row">
            {(tags.data ?? []).map((t) => (
              <span className="tag" key={t.id}>#{t.name}</span>
            ))}
            {tags.data?.length === 0 && <p className="sidebar__empty">no tags yet</p>}
          </div>
        </SidebarSection>

        <button className="account" type="button">
          <Avatar />
          <span className="account__text">
            <span className="account__name">account</span>
            <span className="account__sub">local mode</span>
          </span>
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <label className="search">
            <Search />
            <input placeholder="search tasks, projects…" aria-label="search" />
          </label>
          <div className="topbar__actions">
            {/* temporary — moves into settings later */}
            <button className="icon-btn" onClick={() => setPreset((p) => (p === 'standard' ? 'google' : 'standard'))} title={`preset: ${preset}`}>
              {preset === 'standard' ? 'std' : 'goog'}
            </button>
            <button className="icon-btn" onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))} aria-label="toggle light/dark">
              {mode === 'light' ? <Moon /> : <Sun />}
            </button>
            {/* notifications — surface lands with a later module */}
            <button className="icon-btn" aria-label="notifications"><Bell /></button>
            <span className="topbar__divider" aria-hidden />
            <button className="avatar-btn" aria-label="account"><Avatar size={34} /></button>
          </div>
        </header>

        {view === 'dashboard' ? (
          <DashboardView onGoToTodos={() => setView('todos')} />
        ) : (
          <div className="content">
            <div className="page-head page-head--row">
              <div>
                <h1 className="page-title">to-dos</h1>
                <p className="page-sub">{pendingLabel(todos.isPending, openCount)}</p>
              </div>
              {/* filter + share land in their own slices; shown here as the entry points */}
              <div className="page-head__actions">
                <button className="ghost-btn" type="button"><Filter /> filter</button>
                <button className="ghost-btn" type="button"><Share /> share</button>
              </div>
            </div>

            <div className="controlbar">
              <div className="controlbar__sort">
                <span className="controlbar__label">sort by</span>
                {(['priority', 'effort', 'deadline', 'custom'] as SortKey[]).map((key) => (
                  <button key={key} className={`sort-pill${sort === key ? ' is-active' : ''}`} onClick={() => setSort(key)}>
                    {key}
                  </button>
                ))}
              </div>
              <div className="seg" role="group" aria-label="view density">
                <button
                  className={`seg__btn${density === 'comfortable' ? ' is-active' : ''}`}
                  aria-pressed={density === 'comfortable'}
                  title="comfortable"
                  onClick={() => setDensity('comfortable')}
                >
                  <Rows />
                </button>
                <button
                  className={`seg__btn${density === 'compact' ? ' is-active' : ''}`}
                  aria-pressed={density === 'compact'}
                  title="compact"
                  onClick={() => setDensity('compact')}
                >
                  <Lines />
                </button>
              </div>
            </div>

            {todos.isError && <p className="state state--error">couldn’t load tasks — is the backend running on :8080?</p>}

            <ul className={`todo-list todo-list--${density}${isCustom ? ' todo-list--custom' : ''}`}>
              {(todos.data ?? []).map((todo) => {
                const due = formatDue(todo.due_at)
                const estimate = formatEstimate(todo.estimate_minutes)
                const project = todo.project_id != null ? projectsById.get(todo.project_id) : undefined
                const cls =
                  'todo' +
                  (todo.status === 'done' ? ' is-done' : '') +
                  (dragId === todo.id ? ' is-dragging' : '') +
                  (overId === todo.id && dragId !== todo.id ? ' is-drop-target' : '')
                return (
                  <li
                    className={cls}
                    key={todo.id}
                    draggable
                    onDragStart={() => setDragId(todo.id)}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverId(null)
                    }}
                    onDragOver={(e) => {
                      if (dragId !== null) {
                        e.preventDefault()
                        if (overId !== todo.id) setOverId(todo.id)
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      dropOn(todo.id)
                    }}
                  >
                    <button
                      className="todo__check"
                      role="checkbox"
                      aria-checked={todo.status === 'done'}
                      aria-label={todo.status === 'done' ? 'mark open' : 'mark done'}
                      onClick={() => toggleDone(todo)}
                    />
                    <div className="todo__body">
                      <div className="todo__line">
                        <span className="todo__title">{todo.title}</span>
                        {todo.priority !== 0 && (
                          <span className={`badge badge--p${todo.priority}`}>{priorityLabel[todo.priority]}</span>
                        )}
                      </div>
                      <div className="todo__meta">
                        {project && (
                          <span className="meta">
                            <span className="project__dot" style={{ background: project.color || 'var(--color-text-secondary)' }} />
                            {project.name}
                          </span>
                        )}
                        {estimate && <span className="meta"><Clock /> {estimate}</span>}
                        {due && <span className={`meta${due.overdue ? ' meta--overdue' : ''}`}><Cal /> {due.label}</span>}
                      </div>
                    </div>
                    {/* in custom sort the handle is the drag affordance; otherwise a hint */}
                    <span className="todo__handle" aria-hidden><Grip /></span>
                  </li>
                )
              })}
            </ul>

            <CreateTask onAdd={(title) => create.mutate({ title })} pending={create.isPending} />
          </div>
        )}
      </main>
    </div>
  )
}

/** Placeholder start page. Real configurable widgets land in a later slice. */
function DashboardView({ onGoToTodos }: { onGoToTodos: () => void }) {
  return (
    <div className="content">
      <div className="page-head">
        <h1 className="page-title">dashboard</h1>
        <p className="page-sub">your overview at a glance.</p>
      </div>
      <div className="dash-placeholder">
        <Grid />
        <p>configurable widgets are coming here — pick what shows up where (to-dos, calendar, …).</p>
        <button className="btn" onClick={onGoToTodos}>open to-dos</button>
      </div>
    </div>
  )
}

/** A labelled sidebar group. */
function SidebarSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sidebar__section">
      <span className="sidebar__label">{label}</span>
      {children}
    </div>
  )
}

/**
 * Create affordance shown below the list: a dashed tile that invites a new task.
 * Click it (or press "c" anywhere outside a field) to reveal an inline input;
 * enter creates and keeps it open for rapid entry, escape or an empty blur closes it.
 */
function CreateTask({ onAdd, pending }: { onAdd: (title: string) => void; pending: boolean }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // "c" is a global shortcut to start a new task, as long as the user isn't
  // already typing somewhere (search box, the input itself, etc.).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'c' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (typing) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open) {
    return (
      <button className="create-tile" type="button" onClick={() => setOpen(true)}>
        <Plus />
        <span>
          click to create a new task — or press <kbd>c</kbd>
        </span>
      </button>
    )
  }

  return (
    <form
      className="create-tile is-editing"
      onSubmit={(e) => {
        e.preventDefault()
        const title = value.trim()
        if (!title) return
        onAdd(title)
        setValue('') // keep open so several tasks can be added in a row
      }}
    >
      <Plus />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (!value.trim()) setOpen(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setValue('')
            setOpen(false)
          }
        }}
        placeholder="what needs doing?"
        aria-label="new task title"
        disabled={pending}
      />
    </form>
  )
}
