import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useCreateTodo, useProjects, useTags, useTodos, useUpdateTodo } from './hooks'
import type { Priority, Project, Todo, TodoInput } from './types'

// Which field the list is sorted by, mapped to the backend's ?sort= spec.
type SortKey = 'priority' | 'effort' | 'deadline'
const sortSpec: Record<SortKey, string> = {
  priority: '-priority', // highest first
  effort: 'estimate', // smallest effort first
  deadline: 'due', // soonest deadline first
}

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

// --- tiny inline icons (stroke, inherit color) ----------------------------
const sv = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const Search = () => <svg width="18" height="18" viewBox="0 0 24 24" {...sv} aria-hidden><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.2-4.2" /></svg>
const Plus = () => <svg width="18" height="18" viewBox="0 0 24 24" {...sv} aria-hidden><path d="M12 5v14M5 12h14" /></svg>
const Moon = () => <svg width="18" height="18" viewBox="0 0 24 24" {...sv} aria-hidden><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
const Sun = () => <svg width="18" height="18" viewBox="0 0 24 24" {...sv} aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>
const Clock = () => <svg width="15" height="15" viewBox="0 0 24 24" {...sv} aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
const Cal = () => <svg width="15" height="15" viewBox="0 0 24 24" {...sv} aria-hidden><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M7 3v4M17 3v4M4 10h16" /></svg>

/**
 * The ToDo dashboard: sidebar (projects + tags), top bar (search + theme),
 * a sort bar, and the task list. Theme is token-driven via data-attributes on
 * <html>. UI copy is lowercase by default; user content (titles, names) is shown
 * as entered.
 */
export function TodoDashboard() {
  const [preset, setPreset] = useState<'standard' | 'google'>('standard')
  // Start in the visitor's OS color scheme; the toggle overrides it.
  const [mode, setMode] = useState<'light' | 'dark'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  )
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

  // project_id -> project, for showing the project name + dot on each row.
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

        <QuickAdd onAdd={(title) => create.mutate({ title })} pending={create.isPending} />

        <nav className="nav" aria-label="modules">
          <button className="nav__item is-active">to-dos</button>
          <button className="nav__item" disabled>calendar</button>
          <button className="nav__item" disabled>applications</button>
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
      </aside>

      <main className="main">
        <header className="topbar">
          <label className="search">
            <Search />
            <input placeholder="search tasks, projects…" aria-label="search" />
          </label>
          <div className="topbar__actions">
            <button
              className="icon-btn"
              onClick={() => setPreset((p) => (p === 'standard' ? 'google' : 'standard'))}
              title={`preset: ${preset}`}
            >
              {preset === 'standard' ? 'std' : 'goog'}
            </button>
            <button
              className="icon-btn"
              onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
              aria-label="toggle light/dark"
            >
              {mode === 'light' ? <Moon /> : <Sun />}
            </button>
          </div>
        </header>

        <div className="content">
          <div className="page-head">
            <div>
              <h1 className="page-title">to-dos</h1>
              <p className="page-sub">
                {todos.isPending ? 'loading…' : `${openCount} open ${openCount === 1 ? 'task' : 'tasks'}`}
              </p>
            </div>
          </div>

          <div className="sortbar">
            <span className="sortbar__label">sort by</span>
            {(['priority', 'effort', 'deadline'] as SortKey[]).map((key) => (
              <button
                key={key}
                className={`sort-pill${sort === key ? ' is-active' : ''}`}
                onClick={() => setSort(key)}
              >
                {key}
              </button>
            ))}
          </div>

          {todos.isError && <p className="state state--error">couldn’t load tasks — is the backend running on :8080?</p>}
          {todos.data?.length === 0 && <p className="state">no tasks yet — add one above.</p>}

          <ul className="todo-list">
            {(todos.data ?? []).map((todo) => {
              const due = formatDue(todo.due_at)
              const estimate = formatEstimate(todo.estimate_minutes)
              const project = todo.project_id != null ? projectsById.get(todo.project_id) : undefined
              return (
                <li className={`todo${todo.status === 'done' ? ' is-done' : ''}`} key={todo.id}>
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
                </li>
              )
            })}
          </ul>
        </div>
      </main>
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

/** Quick-add input: type a title and press enter to create a task. */
function QuickAdd({ onAdd, pending }: { onAdd: (title: string) => void; pending: boolean }) {
  const [value, setValue] = useState('')
  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault()
        const title = value.trim()
        if (!title) return
        onAdd(title)
        setValue('')
      }}
    >
      <span className="quick-add__icon"><Plus /></span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="new task…"
        aria-label="new task"
        disabled={pending}
      />
    </form>
  )
}
