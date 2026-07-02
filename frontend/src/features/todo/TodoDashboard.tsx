import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { usePersistentState } from '../../core/usePersistentState'
import { useCreateTodo, useProjects, useReorderTodos, useTags, useTodos, useUpdateTodo } from './hooks'
import type { Priority, Project, Todo, TodoInput } from './types'
import { DueField, EffortField, PriorityField, ProjectField } from './ParamFields'

// Which top-level view is shown. dashboard is the (placeholder) start page.
type View = 'dashboard' | 'todos' | 'settings'

type Preset = 'standard' | 'google'
type Mode = 'light' | 'dark'

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
const Gear = () => <svg width="18" height="18" viewBox="0 0 24 24" {...sv} aria-hidden><circle cx="12" cy="12" r="3.2" /><path d="M19.4 13a7.7 7.7 0 000-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-1.7-1L15 2.5h-4l-.4 2.5a7.6 7.6 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7.7 7.7 0 000 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4z" /></svg>

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
  // Device-level preferences, persisted in localStorage (see settings view).
  const [preset, setPreset] = usePersistentState<Preset>('pad.preset', 'standard')
  // Default to the visitor's OS color scheme until they pick one.
  const [mode, setMode] = usePersistentState<Mode>('pad.mode', () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const [density, setDensity] = usePersistentState<Density>('pad.density', 'comfortable')
  const [view, setView] = useState<View>('dashboard')
  const [sort, setSort] = useState<SortKey>('priority')

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

  // After creating, briefly highlight the new task once it lands in its sorted spot.
  const [newId, setNewId] = useState<number | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)
  const handleCreate = (input: TodoInput) => {
    create.mutate(input, {
      onSuccess: (todo) => {
        setNewId(todo.id)
        window.clearTimeout(flashTimer.current)
        // keep in sync with the todo-flash animation duration in App.scss
        flashTimer.current = window.setTimeout(() => setNewId(null), 2000)
      },
    })
  }
  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  // Bring the just-created task into view, but only if it landed off-screen
  // (block: "nearest" is a no-op for rows that are already visible). Depends on
  // todos.data so it re-runs once the refetched list actually contains the row.
  useEffect(() => {
    if (newId == null) return
    const el = document.querySelector(`[data-todo-id="${newId}"]`)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // optional call: jsdom (tests) doesn't implement scrollIntoView
    el?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [newId, todos.data])

  /** Inline param edit: resend the whole todo with one field changed (optimistic). */
  const patchTodo = (todo: Todo, patch: Partial<TodoInput>) => {
    update.mutate({
      id: todo.id,
      input: {
        project_id: todo.project_id,
        title: todo.title,
        notes: todo.notes,
        priority: todo.priority,
        status: todo.status,
        due_at: todo.due_at,
        estimate_minutes: todo.estimate_minutes,
        ...patch,
      },
    })
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

        <div className="sidebar__footer">
          <button
            className={`nav__item${view === 'settings' ? ' is-active' : ''}`}
            onClick={() => setView('settings')}
          >
            <Gear /> settings
          </button>
          <button className="account" type="button">
            <Avatar />
            <span className="account__text">
              <span className="account__name">account</span>
              <span className="account__sub">local mode</span>
            </span>
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <label className="search">
            <Search />
            <input placeholder="search tasks, projects…" aria-label="search" />
          </label>
          <div className="topbar__actions">
            {/* preset lives in settings now; light/dark stays a quick top-bar toggle */}
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
        ) : view === 'settings' ? (
          <SettingsView
            preset={preset}
            setPreset={setPreset}
            mode={mode}
            setMode={setMode}
            density={density}
            setDensity={setDensity}
          />
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

            {/* sticky create row, pinned above the list (see CreateBar) */}
            <CreateBar projects={projects.data ?? []} onCreate={handleCreate} />

            {todos.isError && <p className="state state--error">couldn’t load tasks — is the backend running on :8080?</p>}

            <ul className={`todo-list todo-list--${density}${isCustom ? ' todo-list--custom' : ''}`}>
              {(todos.data ?? []).map((todo) => {
                const cls =
                  'todo' +
                  (todo.status === 'done' ? ' is-done' : '') +
                  (dragId === todo.id ? ' is-dragging' : '') +
                  (overId === todo.id && dragId !== todo.id ? ' is-drop-target' : '') +
                  (newId === todo.id ? ' is-new' : '')
                return (
                  <li
                    className={cls}
                    key={todo.id}
                    data-todo-id={todo.id}
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
                      </div>
                      {/* inline param fields — set values show; empty ones reveal on hover/focus */}
                      <div className="todo__params">
                        <ProjectField value={todo.project_id} projects={projects.data ?? []} onChange={(v) => patchTodo(todo, { project_id: v })} />
                        <DueField value={todo.due_at} onChange={(v) => patchTodo(todo, { due_at: v })} />
                        <PriorityField value={todo.priority} onChange={(v) => patchTodo(todo, { priority: v })} />
                        <EffortField value={todo.estimate_minutes} onChange={(v) => patchTodo(todo, { estimate_minutes: v })} />
                      </div>
                    </div>
                    {/* in custom sort the handle is the drag affordance; otherwise a hint */}
                    <span className="todo__handle" aria-hidden><Grip /></span>
                  </li>
                )
              })}
            </ul>
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

/**
 * Device-level appearance settings. The preset switch lives here (it left the top
 * bar); light/dark also stays a quick top-bar toggle. All of these persist in
 * localStorage, so they're per device until real accounts arrive.
 */
function SettingsView({
  preset,
  setPreset,
  mode,
  setMode,
  density,
  setDensity,
}: {
  preset: Preset
  setPreset: (v: Preset) => void
  mode: Mode
  setMode: (v: Mode) => void
  density: Density
  setDensity: (v: Density) => void
}) {
  return (
    <div className="content">
      <div className="page-head">
        <h1 className="page-title">settings</h1>
        <p className="page-sub">appearance and preferences for this device</p>
      </div>

      <section className="settings-group">
        <h2 className="settings-group__title">appearance</h2>
        <SettingRow label="preset" hint="overall look of the app">
          <OptionGroup value={preset} options={['standard', 'google']} onChange={setPreset} />
        </SettingRow>
        <SettingRow label="mode" hint="light or dark — also in the top bar">
          <OptionGroup value={mode} options={['light', 'dark']} onChange={setMode} />
        </SettingRow>
        <SettingRow label="list density" hint="default spacing for the to-do list">
          <OptionGroup value={density} options={['comfortable', 'compact']} onChange={setDensity} />
        </SettingRow>
      </section>

      <p className="settings-note">preferences are saved on this device.</p>
    </div>
  )
}

/** A labelled settings row: text on the left, control on the right. */
function SettingRow({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <span className="settings-row__label">{label}</span>
        <span className="settings-row__hint">{hint}</span>
      </div>
      {children}
    </div>
  )
}

/** A small segmented control of mutually exclusive text options. */
function OptionGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: T[]
  onChange: (v: T) => void
}) {
  return (
    <div className="opt-group" role="group">
      {options.map((opt) => (
        <button
          key={opt}
          className={`opt${value === opt ? ' is-active' : ''}`}
          aria-pressed={value === opt}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
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
 * Sticky create row pinned above the list, styled like a task row but dashed and
 * without a checkbox. It always occupies the height of a task row with params, so
 * opening/closing never resizes anything or overlaps the list. At rest only the
 * prompt shows (the param line keeps its space, invisible); "c" or a click swaps
 * in the title input + the four param chips. Enter creates and keeps it open for
 * rapid entry; Escape closes, and a click outside closes only while it's empty.
 */
function CreateBar({ projects, onCreate }: { projects: Project[]; onCreate: (input: TodoInput) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<number | null>(null)
  const [priority, setPriority] = useState<Priority>(0)
  const [due, setDue] = useState<string | null>(null)
  const [effort, setEffort] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const reset = () => {
    setTitle('')
    setProjectId(null)
    setPriority(0)
    setDue(null)
    setEffort(null)
  }
  const close = () => {
    setOpen(false)
    reset()
  }

  // "c" opens the create row, unless the user is already typing somewhere.
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

  // A click outside closes the editor, but only while nothing was entered yet —
  // set params or a typed title survive a stray click. Field menus are portaled,
  // so clicks inside `.popover` don't count as outside.
  const dirty = title.trim() !== '' || projectId != null || priority !== 0 || due != null || effort != null
  useEffect(() => {
    if (!open || dirty) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (rootRef.current?.contains(t) || t.closest('.popover')) return
      close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, dirty])

  if (!open) {
    return (
      <div className="create-bar" ref={rootRef}>
        <button className="create-tile" type="button" onClick={() => setOpen(true)}>
          <div className="create-tile__row">
            <Plus />
            <span>
              create a task — or press <kbd>c</kbd>
            </span>
          </div>
          {/* invisible height keeper: reserves the param line so the row never resizes */}
          <div className="create-tile__params is-ghost" aria-hidden>
            <span className="chip">
              <span className="chip__label">placeholder</span>
            </span>
          </div>
        </button>
      </div>
    )
  }

  return (
    <div className="create-bar" ref={rootRef}>
      <form
        className="create-tile is-editing"
        onSubmit={(e) => {
          e.preventDefault()
          const t = title.trim()
          if (!t) return
          onCreate({ title: t, project_id: projectId, priority, status: 'open', due_at: due, estimate_minutes: effort })
          reset()
          inputRef.current?.focus() // keep open for rapid entry
        }}
      >
        <div className="create-tile__row">
          <Plus />
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close()
            }}
            placeholder="what needs doing?"
            aria-label="new task title"
          />
        </div>
        <div className="create-tile__params">
          <ProjectField value={projectId} projects={projects} onChange={setProjectId} />
          <DueField value={due} onChange={setDue} />
          <PriorityField value={priority} onChange={setPriority} />
          <EffortField value={effort} onChange={setEffort} />
        </div>
      </form>
    </div>
  )
}
