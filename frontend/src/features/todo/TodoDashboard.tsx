import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { usePersistentState } from '../../core/usePersistentState'
import {
  useAddTodoTag,
  useCreateTag,
  useCreateTodo,
  useDeleteTodo,
  useProjects,
  useRemoveTodoTag,
  useReorderTodos,
  useTags,
  useTodos,
  useUpdateTodo,
} from './hooks'
import type { Priority, Project, Tag, Todo, TodoInput } from './types'
import { DueField, EffortField, PriorityField, ProjectField, TagsField } from './ParamFields'
import { buildMarkdown, exportFields, exportFilename } from './exportMd'
import type { ExportField, ExportSection } from './exportMd'
import { formatDue, formatEstimate } from './format'
import { bucketLabel, bucketOf, bucketOrder, openDueOn, startOfDay, triageStats } from './triage'
import type { Bucket } from './triage'
import {
  Search,
  Moon,
  Sun,
  Bell,
  Share,
  Briefcase,
  PanelLeft as PanelIcon,
  ListFilter as Filter,
  LayoutDashboard as Grid,
  ListTodo as Check,
  Calendar as Cal,
  Settings as Gear,
  Plus as PlusIcon,
  Rows2,
  AlignJustify,
  GripVertical,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Check as CheckIcon,
  X as XIcon,
  MoreHorizontal,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Which top-level view is shown. dashboard is the (placeholder) start page.
type View = 'dashboard' | 'todos' | 'settings'

type Preset = 'standard' | 'google'
type Mode = 'light' | 'dark'

// Which field the list is sorted by, mapped to the backend's ?sort= spec.
// "custom" is the manual drag order (todos.position).
type SortKey = 'priority' | 'effort' | 'deadline' | 'custom'
// Keys that can act as the secondary ("then by") criterion — everything except
// custom, whose manual order is already total and can't be refined.
type ThenKey = Exclude<SortKey, 'custom'>
const sortKeys: SortKey[] = ['priority', 'effort', 'deadline', 'custom']
const thenKeys: ThenKey[] = ['priority', 'effort', 'deadline']
const sortSpec: Record<SortKey, string> = {
  priority: '-priority', // highest first
  effort: 'estimate', // smallest effort first
  deadline: 'due', // soonest deadline first
  custom: 'position', // the user's manual order
}
// Short direction hints shown next to each option in the sort menu.
const sortHint: Record<SortKey, string> = {
  priority: 'highest first',
  effort: 'smallest first',
  deadline: 'soonest first',
  custom: 'your order',
}

/**
 * Builds the backend sort spec from the primary key and the optional secondary.
 * The secondary breaks ties in the primary (backend: `?sort=a,b`); custom is a
 * total manual order, so a secondary would never kick in and is ignored.
 */
function buildSortSpec(sort: SortKey, thenBy: ThenKey | null): string {
  if (sort === 'custom' || thenBy == null || thenBy === sort) return sortSpec[sort]
  return `${sortSpec[sort]},${sortSpec[thenBy]}`
}

// How densely the list is rendered. Comfortable is the roomy default;
// compact tightens rows so more fits on screen.
type Density = 'comfortable' | 'compact'

// Which tasks the list shows. "open" is the default; with "both", done tasks
// sink to the bottom (the custom drag order is a separate concern).
type StatusFilter = 'open' | 'done' | 'both'

/** A friendly, personal summary line for the to-dos header. */
function pendingLabel(isPending: boolean, count: number): string {
  if (isPending) return 'loading…'
  if (count === 0) return "you're all caught up"
  return `you have ${count} pending ${count === 1 ? 'task' : 'tasks'}`
}

// All icons are lucide-react now; these thin wrappers just fix the size per use-site.
const Plus = () => <PlusIcon size={18} />
const Rows = () => <Rows2 size={16} />
const Lines = () => <AlignJustify size={16} />
const Grip = () => <GripVertical size={16} />

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
export function TodoDashboard({ doneGraceMs = 3000 }: { doneGraceMs?: number } = {}) {
  // Device-level preferences, persisted in localStorage (see settings view).
  const [preset, setPreset] = usePersistentState<Preset>('pad.preset', 'standard')
  // Default to the visitor's OS color scheme until they pick one.
  const [mode, setMode] = usePersistentState<Mode>('pad.mode', () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const [density, setDensity] = usePersistentState<Density>('pad.density', 'comfortable')
  // The nav sidebar is fully collapsed by default; opening it slides an elevated panel in
  // and pushes the content over (persisted, like the Claude desktop sidebar).
  const [sidebarOpen, setSidebarOpen] = usePersistentState<boolean>('pad.sidebar.open', false)
  const [view, setView] = useState<View>('dashboard')
  const [sort, setSort] = useState<SortKey>('priority')
  // Optional secondary criterion: breaks ties in the primary sort (e.g. same
  // priority -> soonest deadline first). null = primary only.
  const [thenBy, setThenBy] = useState<ThenKey | null>(null)

  // List filters — persisted like the other device preferences. They surface as
  // removable tokens next to the filter menu, so there's no panel state to keep.
  const [statusFilter, setStatusFilter] = usePersistentState<StatusFilter>('pad.filter.status', 'open')
  const [projectFilter, setProjectFilter] = usePersistentState<number | null>('pad.filter.project', null)
  const [tagFilter, setTagFilter] = usePersistentState<number | null>('pad.filter.tag', null)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.preset = preset
    root.dataset.mode = mode
  }, [preset, mode])

  // Escape closes the nav sidebar. (Search — and its ⌘K jump-to — is not wired
  // yet; the field shows a "coming soon" state rather than pretending to work.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSidebarOpen])

  const projects = useProjects()
  const tags = useTags()
  const todos = useTodos(buildSortSpec(sort, thenBy))
  const create = useCreateTodo()
  const update = useUpdateTodo()
  const remove = useDeleteTodo()
  const reorder = useReorderTodos()
  const createTag = useCreateTag()
  const addTag = useAddTodoTag()
  const removeTag = useRemoveTodoTag()

  /** Toggle a tag on a todo; the list refetch (tags are embedded) updates the row. */
  const toggleTag = (todoId: number, tagId: number, on: boolean) =>
    on ? removeTag.mutate({ todoId, tagId }) : addTag.mutate({ todoId, tagId })

  /** Create a tag and immediately attach it to the todo. */
  const createAndAttachTag = (todoId: number, name: string) =>
    createTag.mutate(name, { onSuccess: (tag) => addTag.mutate({ todoId, tagId: tag.id }) })

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

  // A just-checked task lingers for a grace period (the checkbox doubles as undo),
  // then collapses away — only while the "open" filter would hide it. Two timers:
  // grace -> start the collapse animation, collapse -> actually remove the row.
  // doneGraceMs is a prop only so tests can shorten the wait.
  const [leaving, setLeaving] = useState<Map<number, 'grace' | 'closing'>>(new Map())
  const leaveTimers = useRef<Map<number, number>>(new Map())
  const setLeavePhase = (id: number, phase: 'grace' | 'closing' | null) =>
    setLeaving((prev) => {
      const next = new Map(prev)
      if (phase === null) next.delete(id)
      else next.set(id, phase)
      return next
    })
  const clearLeaveTimer = (id: number) => {
    const t = leaveTimers.current.get(id)
    if (t) window.clearTimeout(t)
    leaveTimers.current.delete(id)
  }
  useEffect(() => {
    const timers = leaveTimers.current
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [])

  const toggleDone = (todo: Todo) => {
    const nowDone = todo.status === 'open'
    const input: TodoInput = {
      project_id: todo.project_id,
      title: todo.title,
      notes: todo.notes,
      priority: todo.priority,
      status: nowDone ? 'done' : 'open',
      due_at: todo.due_at,
      estimate_minutes: todo.estimate_minutes,
    }
    update.mutate({ id: todo.id, input })

    if (nowDone) {
      setLeavePhase(todo.id, 'grace')
      clearLeaveTimer(todo.id)
      const graceTimer = window.setTimeout(() => {
        setLeavePhase(todo.id, 'closing')
        // keep in sync with the todo-collapse animation duration in App.scss
        const closeTimer = window.setTimeout(() => {
          leaveTimers.current.delete(todo.id)
          setLeavePhase(todo.id, null)
        }, 450)
        leaveTimers.current.set(todo.id, closeTimer)
      }, doneGraceMs)
      leaveTimers.current.set(todo.id, graceTimer)
    } else {
      // undo within the grace period: cancel the departure, the row stays
      clearLeaveTimer(todo.id)
      setLeavePhase(todo.id, null)
    }
  }

  // After creating, briefly highlight the new task once it lands in its sorted spot.
  const [newId, setNewId] = useState<number | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)
  const handleCreate = (input: TodoInput, tagIds: number[]) => {
    create.mutate(input, {
      onSuccess: (todo) => {
        // tags picked in the create tile attach right after the todo exists;
        // the list refetch (tags are embedded) then shows them on the new row
        tagIds.forEach((tagId) => addTag.mutate({ todoId: todo.id, tagId }))
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

  // Expanding a row opens an inline editor for the two fields the chips don't
  // cover — the title (rename) and notes. Only one row edits at a time; the
  // drafts hold the in-progress values and save on blur / on close.
  const [editingId, setEditingId] = useState<number | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')

  const openEditor = (todo: Todo) => {
    setEditingId(todo.id)
    setTitleDraft(todo.title)
    setNotesDraft(todo.notes)
  }
  /** Persist a changed title (a blank one reverts — a task must keep a name). */
  const saveTitle = (todo: Todo) => {
    const t = titleDraft.trim()
    if (t && t !== todo.title) patchTodo(todo, { title: t })
    else if (!t) setTitleDraft(todo.title)
  }
  const saveNotes = (todo: Todo) => {
    if (notesDraft !== todo.notes) patchTodo(todo, { notes: notesDraft })
  }
  /** Flush both fields, then collapse the editor. */
  const closeEditor = (todo: Todo) => {
    saveTitle(todo)
    saveNotes(todo)
    setEditingId(null)
  }

  // A click outside the open row collapses its editor (saving first). Clicks
  // inside the row, or inside a portaled field menu (.popover, rendered on
  // document.body), don't count as outside. Re-runs as the drafts change so the
  // save on close always sees the latest values.
  useEffect(() => {
    if (editingId == null) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest(`[data-todo-id="${editingId}"]`) || t.closest('.popover')) return
      const todo = (todos.data ?? []).find((x) => x.id === editingId)
      if (todo) closeEditor(todo)
      else setEditingId(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [editingId, titleDraft, notesDraft, todos.data])

  const openCount = (todos.data ?? []).filter((t) => t.status === 'open').length

  // What the list actually shows. The project/tag filters guard against a stale
  // persisted id (the project or tag was deleted meanwhile); with "open", tasks in
  // their grace period stay visible; with "both", done tasks sink below the open ones.
  const projectIds = new Set((projects.data ?? []).map((p) => p.id))
  const tagIds = new Set((tags.data ?? []).map((t) => t.id))
  const activeProject = projectFilter != null && projectIds.has(projectFilter) ? projectFilter : null
  const activeTag = tagFilter != null && tagIds.has(tagFilter) ? tagFilter : null
  const scoped = (todos.data ?? []).filter(
    (t) =>
      (activeProject == null || t.project_id === activeProject) &&
      (activeTag == null || t.tags.some((tg) => tg.id === activeTag)),
  )
  const visible =
    statusFilter === 'open'
      ? scoped.filter((t) => t.status === 'open' || leaving.has(t.id))
      : statusFilter === 'done'
        ? scoped.filter((t) => t.status === 'done')
        : [...scoped.filter((t) => t.status === 'open'), ...scoped.filter((t) => t.status === 'done')]

  // Live triage indicators for the focus band, computed over the (project-scoped) list.
  const stats = triageStats(scoped)

  // The list's spine: group the visible tasks into time-to-deadline buckets, with the
  // chosen sort ordering within each. A manual (custom) order is inherently flat, so it
  // opts out of grouping. Headers only appear once there's more than one bucket to name.
  type ListRow = { kind: 'header'; bucket: Bucket; count: number } | { kind: 'todo'; todo: Todo }
  const listRows: ListRow[] = []
  if (isCustom) {
    for (const t of visible) listRows.push({ kind: 'todo', todo: t })
  } else {
    const byBucket = new Map<Bucket, Todo[]>()
    for (const t of visible) {
      const b = bucketOf(t, leaving.has(t.id))
      const arr = byBucket.get(b)
      if (arr) arr.push(t)
      else byBucket.set(b, [t])
    }
    const nonEmpty = bucketOrder.filter((b) => (byBucket.get(b)?.length ?? 0) > 0)
    const showHeaders = nonEmpty.length > 1
    for (const b of nonEmpty) {
      const arr = byBucket.get(b)!
      if (showHeaders) listRows.push({ kind: 'header', bucket: b, count: arr.length })
      for (const t of arr) listRows.push({ kind: 'todo', todo: t })
    }
  }

  // The exact on-screen order of task ids (across buckets) — the basis for
  // menu reorder, so "up"/"down" mean what the user sees, not the raw fetch
  // order (which also holds filtered-out / done tasks).
  const orderedIds: number[] = []
  for (const r of listRows) if (r.kind === 'todo') orderedIds.push(r.todo.id)

  /**
   * Move a todo one slot up (-1) or down (+1) past its visible neighbour and
   * persist the result as the custom order — the no-mouse equivalent of a drag.
   */
  const moveBy = (id: number, dir: -1 | 1) => {
    const i = orderedIds.indexOf(id)
    const j = i + dir
    if (i === -1 || j < 0 || j >= orderedIds.length) return
    const neighborId = orderedIds[j]
    const full = todos.data ?? []
    const from = full.findIndex((t) => t.id === id)
    if (from === -1 || !full.some((t) => t.id === neighborId)) return
    const next = [...full]
    const [moved] = next.splice(from, 1)
    const nbIdx = next.findIndex((t) => t.id === neighborId)
    next.splice(dir === -1 ? nbIdx : nbIdx + 1, 0, moved)
    reorder.mutate(next)
    if (sort !== 'custom') setSort('custom')
  }

  // The export mirrors exactly what's on screen: same filters, same order, same
  // grouping — the list rows just get folded into labelled sections.
  const exportSections: ExportSection[] = []
  for (const row of listRows) {
    if (row.kind === 'header') {
      exportSections.push({ label: bucketLabel[row.bucket], todos: [] })
    } else {
      if (exportSections.length === 0) exportSections.push({ label: null, todos: [] })
      exportSections[exportSections.length - 1].todos.push(row.todo)
    }
  }

  return (
    <div className="app" data-preset={preset} data-mode={mode} data-sidebar={sidebarOpen ? 'open' : 'closed'}>
      {/* full-width header: the panel toggle sits top-left in one fixed spot, the search
          stays window-centred, and the bar itself is transparent (dissolves into the canvas). */}
      <header className="topbar">
        <div className="topbar__lead">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="h-8 w-8 [&_svg]:size-[18px]"
            aria-label="toggle sidebar"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <PanelIcon />
          </Button>
        </div>
        {/* search isn't wired yet — shown as a clearly inactive "coming soon" field
            instead of a box that focuses but can't search (honest > pretend) */}
        <label className="search is-soon" title="search is coming soon">
          <Search />
          <input placeholder="search — coming soon" aria-label="search" disabled />
          <span className="search__soon" aria-hidden>soon</span>
        </label>
        <div className="topbar__actions">
          {/* preset lives in settings now; light/dark stays a quick top-bar toggle */}
          <Button variant="ghost" size="icon" type="button" className="h-8 w-8 [&_svg]:size-[18px]" onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))} aria-label="toggle light/dark">
            {mode === 'light' ? <Moon /> : <Sun />}
          </Button>
          {/* notifications — disabled until the notifications surface lands */}
          <Button variant="ghost" size="icon" type="button" className="h-8 w-8 [&_svg]:size-[18px]" aria-label="notifications (coming soon)" title="coming soon" disabled><Bell /></Button>
          <span className="topbar__divider" aria-hidden />
          <button className="avatar-btn" aria-label="account"><Avatar size={30} /></button>
        </div>
      </header>

      <div className="workspace">
        {/* global nav — a fully collapsible, elevated card that begins below the header.
            Closed by default; the header toggle opens it, pushing the content over. Module
            context (projects, tags) lives in the to-dos view. Inert while closed. */}
        <aside className="sidebar" inert={!sidebarOpen}>
          <div className="sidebar__inner">
            <div className="sidebar__brand">
              <span className="sidebar__mark" aria-hidden>p</span>
              <span className="sidebar__word">
                <span className="sidebar__name">pad</span>
                <span className="sidebar__tagline">workspace</span>
              </span>
            </div>

            <nav className="nav" aria-label="modules">
              <button className={`nav__item${view === 'dashboard' ? ' is-active' : ''}`} onClick={() => setView('dashboard')}>
                <span className="nav__icon"><Grid /></span>
                <span className="nav__label">dashboard</span>
              </button>
              <button className={`nav__item${view === 'todos' ? ' is-active' : ''}`} onClick={() => setView('todos')}>
                <span className="nav__icon"><Check /></span>
                <span className="nav__label">to-dos</span>
              </button>
              <button className="nav__item" disabled>
                <span className="nav__icon"><Cal /></span>
                <span className="nav__label">calendar</span>
              </button>
              <button className="nav__item" disabled>
                <span className="nav__icon"><Briefcase /></span>
                <span className="nav__label">applications</span>
              </button>
            </nav>

            <div className="sidebar__footer">
              <button
                className={`nav__item${view === 'settings' ? ' is-active' : ''}`}
                onClick={() => setView('settings')}
              >
                <span className="nav__icon"><Gear /></span>
                <span className="nav__label">settings</span>
              </button>
              <button className="nav__item account" type="button">
                <span className="nav__icon"><Avatar size={24} /></span>
                <span className="nav__label account__text">
                  <span className="account__name">account</span>
                  <span className="account__sub">local mode</span>
                </span>
              </button>
            </div>
          </div>
        </aside>

        <main className="main">
          {view === 'dashboard' ? (
            <DashboardView
              todos={todos.data ?? []}
              projects={projects.data ?? []}
              onToggle={toggleDone}
              onOpenTodos={() => setView('todos')}
              onOpenProject={(id) => {
                setProjectFilter(id)
                setView('todos')
              }}
            />
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
            <div className="todos-view">
              <div className="todos-main">
                {/* focus band: the page's anchor — title, a personal line, and the live
                    triage indicators (overdue / due today / today's estimated effort) that
                    make the state of the day readable at a glance (PRODUCT.md core). */}
                <header className="focusband">
                  <div className="focusband__top">
                    <div>
                      <h1 className="page-title">to-dos</h1>
                      <p className="page-sub">{pendingLabel(todos.isPending, openCount)}</p>
                    </div>
                    <div className="page-head__actions">
                      <ShareMenu sections={exportSections} projects={projects.data ?? []} />
                    </div>
                  </div>
                  {/* only lights up when there's date-driven signal — quiet when nothing's due */}
                  {(stats.overdue > 0 || stats.dueToday > 0) && (
                    <div className="focusband__stats">
                      {stats.overdue > 0 && (
                        <span className="stat stat--danger">
                          <span className="stat__value">{stats.overdue}</span>
                          <span className="stat__label">overdue</span>
                        </span>
                      )}
                      {stats.dueToday > 0 && (
                        <span className="stat">
                          <span className="stat__value">{stats.dueToday}</span>
                          <span className="stat__label">due today</span>
                        </span>
                      )}
                      {stats.estTodayMinutes > 0 && (
                        <span className="stat">
                          <span className="stat__value">{formatEstimate(stats.estTodayMinutes)}</span>
                          <span className="stat__label">est. today</span>
                        </span>
                      )}
                    </div>
                  )}
                </header>

                <div className="controlbar">
                  {/* the list's one control row: filter (menu + removable tokens for what's
                      active) on the left, sort + density on the right — no push-down panel,
                      the resting state is a single quiet line (Linear-style toolbar) */}
                  <div className="controlbar__filters">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="sort-trigger" aria-label="filter">
                          <Filter size={14} aria-hidden />
                          filter
                          <ChevronDown size={14} className="sort-trigger__caret" aria-hidden />
                        </button>
                      </DropdownMenuTrigger>
                      {/* selecting keeps the menu open (preventDefault) so several filters
                          can be combined in one visit; Escape or outside click closes */}
                      <DropdownMenuContent className="min-w-[12rem]">
                        <DropdownMenuLabel>show</DropdownMenuLabel>
                        {(['open', 'done', 'both'] as StatusFilter[]).map((key) => (
                          <DropdownMenuItem
                            key={key}
                            onSelect={(e) => {
                              e.preventDefault()
                              setStatusFilter(key)
                            }}
                          >
                            <span className="menu-check">{statusFilter === key && <CheckIcon size={14} />}</span>
                            {key === 'both' ? 'open + done' : key}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>project</DropdownMenuLabel>
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault()
                            setProjectFilter(null)
                          }}
                        >
                          <span className="menu-check">{activeProject == null && <CheckIcon size={14} />}</span>
                          all projects
                        </DropdownMenuItem>
                        {(projects.data ?? []).map((p) => (
                          <DropdownMenuItem
                            key={p.id}
                            onSelect={(e) => {
                              e.preventDefault()
                              setProjectFilter(activeProject === p.id ? null : p.id)
                            }}
                          >
                            <span className="menu-check">{activeProject === p.id && <CheckIcon size={14} />}</span>
                            <span className="dot" style={{ background: p.color || 'var(--color-text-secondary)' }} />
                            {p.name}
                          </DropdownMenuItem>
                        ))}
                        {(tags.data ?? []).length > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>tag</DropdownMenuLabel>
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault()
                                setTagFilter(null)
                              }}
                            >
                              <span className="menu-check">{activeTag == null && <CheckIcon size={14} />}</span>
                              all tags
                            </DropdownMenuItem>
                            {(tags.data ?? []).map((t) => (
                              <DropdownMenuItem
                                key={t.id}
                                onSelect={(e) => {
                                  e.preventDefault()
                                  setTagFilter(activeTag === t.id ? null : t.id)
                                }}
                              >
                                <span className="menu-check">{activeTag === t.id && <CheckIcon size={14} />}</span>#{t.name}
                              </DropdownMenuItem>
                            ))}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {statusFilter !== 'open' && (
                      <FilterToken label="status" onClear={() => setStatusFilter('open')}>
                        {statusFilter === 'done' ? 'done' : 'open + done'}
                      </FilterToken>
                    )}
                    {activeProject != null && (
                      <FilterToken label="project" onClear={() => setProjectFilter(null)}>
                        <span
                          className="dot"
                          style={{
                            background:
                              (projects.data ?? []).find((p) => p.id === activeProject)?.color ||
                              'var(--color-text-secondary)',
                          }}
                        />
                        {(projects.data ?? []).find((p) => p.id === activeProject)?.name}
                      </FilterToken>
                    )}
                    {activeTag != null && (
                      <FilterToken label="tag" onClear={() => setTagFilter(null)}>
                        #{(tags.data ?? []).find((t) => t.id === activeTag)?.name}
                      </FilterToken>
                    )}
                  </div>

                  <div className="controlbar__side">
                    <div className="controlbar__sort">
                      <span className="controlbar__label">sort by</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="sort-trigger" aria-label="sort by">
                            <ArrowUpDown size={14} aria-hidden />
                            {sort !== 'custom' && thenBy != null && thenBy !== sort ? `${sort} · ${thenBy}` : sort}
                            <ChevronDown size={14} className="sort-trigger__caret" aria-hidden />
                          </button>
                        </DropdownMenuTrigger>
                        {/* like the filter menu, selecting keeps this open so primary and
                            secondary can be set in one visit */}
                        <DropdownMenuContent className="min-w-[11.5rem]">
                          <DropdownMenuLabel>sort by</DropdownMenuLabel>
                          {sortKeys.map((key) => (
                            <DropdownMenuItem
                              key={key}
                              aria-label={`sort by ${key}`}
                              onSelect={(e) => {
                                e.preventDefault()
                                setSort(key)
                                // the same key can't refine itself as the tiebreaker
                                if (thenBy === key) setThenBy(null)
                              }}
                            >
                              <span className="menu-check">{sort === key && <CheckIcon size={14} />}</span>
                              <span className="flex-1">{key}</span>
                              <span className="text-xs text-muted-foreground">{sortHint[key]}</span>
                            </DropdownMenuItem>
                          ))}
                          {/* the tiebreaker only makes sense for real sorts; the manual
                              custom order is already total */}
                          {sort !== 'custom' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel>then by</DropdownMenuLabel>
                              <DropdownMenuItem
                                aria-label="then by none"
                                onSelect={(e) => {
                                  e.preventDefault()
                                  setThenBy(null)
                                }}
                              >
                                <span className="menu-check">{thenBy == null && <CheckIcon size={14} />}</span>
                                none
                              </DropdownMenuItem>
                              {thenKeys
                                .filter((key) => key !== sort)
                                .map((key) => (
                                  <DropdownMenuItem
                                    key={key}
                                    aria-label={`then by ${key}`}
                                    onSelect={(e) => {
                                      e.preventDefault()
                                      setThenBy(key)
                                    }}
                                  >
                                    <span className="menu-check">{thenBy === key && <CheckIcon size={14} />}</span>
                                    {key}
                                  </DropdownMenuItem>
                                ))}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                </div>

                {/* sticky create row, pinned above the list (see CreateBar) */}
                <CreateBar
                  projects={projects.data ?? []}
                  tags={tags.data ?? []}
                  onCreate={handleCreate}
                  onCreateTag={(name, onDone) => createTag.mutate(name, { onSuccess: onDone })}
                />

                {todos.isError && <p className="state state--error">couldn’t load your tasks — please try again.</p>}

                {!todos.isPending && !todos.isError && visible.length === 0 && (
                  <p className="state">nothing here — adjust the filters or create a task.</p>
                )}

                <ul className={`todo-list todo-list--${density}${isCustom ? ' todo-list--custom' : ''}`}>
                  {listRows.map((row) => {
                    if (row.kind === 'header')
                      return (
                        <li className={`todo-group todo-group--${row.bucket}`} key={`h-${row.bucket}`}>
                          <span className="todo-group__label">{bucketLabel[row.bucket]}</span>
                          <span className="todo-group__count">{row.count}</span>
                        </li>
                      )
                    const todo = row.todo
                    const isEditing = editingId === todo.id
                    const cls =
                      'todo' +
                      (todo.status === 'done' ? ' is-done' : '') +
                      (isEditing ? ' is-open' : '') +
                      (dragId === todo.id ? ' is-dragging' : '') +
                      (overId === todo.id && dragId !== todo.id ? ' is-drop-target' : '') +
                      (newId === todo.id ? ' is-new' : '') +
                      (leaving.get(todo.id) === 'closing' ? ' is-leaving' : '')
                    return (
                      <li
                        className={cls}
                        key={todo.id}
                        data-todo-id={todo.id}
                        draggable={!isEditing}
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
                            {isEditing ? (
                              // rename in place; blank reverts, Enter commits, Escape closes
                              <input
                                className="todo__title-input"
                                value={titleDraft}
                                aria-label="edit title"
                                autoFocus
                                onChange={(e) => setTitleDraft(e.target.value)}
                                onBlur={() => saveTitle(todo)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    closeEditor(todo) // commit both fields and collapse
                                  }
                                  if (e.key === 'Escape') closeEditor(todo)
                                }}
                              />
                            ) : (
                              // clicking the title opens the editor (rename + notes)
                              <button type="button" className="todo__title todo__title--btn" onClick={() => openEditor(todo)}>
                                {todo.title}
                              </button>
                            )}
                          </div>
                          {/* inline param fields — set values show; empty ones reveal on hover/focus
                              (and always while the row is open for editing) */}
                          <div className="todo__params">
                            <ProjectField value={todo.project_id} projects={projects.data ?? []} onChange={(v) => patchTodo(todo, { project_id: v })} />
                            <DueField value={todo.due_at} onChange={(v) => patchTodo(todo, { due_at: v })} />
                            <PriorityField value={todo.priority} onChange={(v) => patchTodo(todo, { priority: v })} />
                            <EffortField value={todo.estimate_minutes} onChange={(v) => patchTodo(todo, { estimate_minutes: v })} />
                            <TagsField
                              value={todo.tags}
                              allTags={tags.data ?? []}
                              onToggle={(tagId, on) => toggleTag(todo.id, tagId, on)}
                              onCreate={(name) => createAndAttachTag(todo.id, name)}
                            />
                          </div>
                          {isEditing && (
                            <label className="todo__notes-field">
                              <span className="todo__notes-label">notes</span>
                              <textarea
                                className="todo__notes"
                                value={notesDraft}
                                placeholder="add notes…"
                                rows={3}
                                aria-label="edit notes"
                                onChange={(e) => setNotesDraft(e.target.value)}
                                onBlur={() => saveNotes(todo)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') closeEditor(todo)
                                }}
                              />
                            </label>
                          )}
                        </div>
                        {isEditing ? (
                          <button type="button" className="todo__collapse" aria-label="close editor" onClick={() => closeEditor(todo)}>
                            <ChevronUp size={16} />
                          </button>
                        ) : (
                          (() => {
                            const i = orderedIds.indexOf(todo.id)
                            return (
                              <RowMenu
                                onDelete={() => remove.mutate(todo.id)}
                                onMoveUp={() => moveBy(todo.id, -1)}
                                onMoveDown={() => moveBy(todo.id, 1)}
                                canUp={i > 0}
                                canDown={i >= 0 && i < orderedIds.length - 1}
                              />
                            )
                          })()
                        )}
                        {/* in custom sort the handle is the drag affordance; otherwise a hint */}
                        <span className="todo__handle" aria-hidden><Grip /></span>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {/* context rail — fills the width with a second axis on the same data: the week
                  ahead (temporal overview) and per-project counts (click to filter the list). */}
              <aside className="rail" aria-label="overview">
                <RailWeek todos={todos.data ?? []} />
                <RailProjects
                  projects={projects.data ?? []}
                  todos={todos.data ?? []}
                  active={activeProject}
                  onPick={(id) => setProjectFilter(activeProject === id ? null : id)}
                />
                <RailTags tags={tags.data ?? []} />
              </aside>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

// Menu labels for the export fields ("due" reads better as "due date" here).
const exportFieldLabels: Record<ExportField, string> = {
  project: 'project',
  due: 'due date',
  priority: 'priority',
  effort: 'effort',
  tags: 'tags',
}

/**
 * The share menu: exports the currently visible list (same filters, order and
 * grouping as on screen) as markdown — copy to clipboard or download as .md.
 * The field toggles choose what each task line carries; the choice persists
 * like the other device preferences.
 */
function ShareMenu({ sections, projects }: { sections: ExportSection[]; projects: Project[] }) {
  const [open, setOpen] = useState(false)
  const [fields, setFields] = usePersistentState<ExportField[]>('pad.export.fields', exportFields)
  // The copy button reports its own outcome briefly — success AND failure
  // (clipboard access can be denied or the document unfocused).
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copiedTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  const count = sections.reduce((n, s) => n + s.todos.length, 0)
  const toggle = (f: ExportField) =>
    setFields(fields.includes(f) ? fields.filter((x) => x !== f) : [...fields, f])
  const markdown = () => buildMarkdown(sections, fields, projects)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown())
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopyState('idle'), 1500)
  }

  const download = () => {
    const blob = new Blob([markdown()], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = exportFilename()
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="ghost-btn" type="button">
          <Share /> share
        </button>
      </PopoverTrigger>
      <PopoverContent className="popover w-auto" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="menu">
          <p className="menu-note">
            {count === 0 ? 'nothing to export — the list is empty' : `exports the ${count} ${count === 1 ? 'task' : 'tasks'} shown, as listed`}
          </p>
          {exportFields.map((f) => {
            const on = fields.includes(f)
            return (
              <button key={f} type="button" className="menu-item" aria-pressed={on} onClick={() => toggle(f)}>
                <span className="menu-check">{on && <CheckIcon size={14} />}</span>
                {exportFieldLabels[f]}
              </button>
            )
          })}
          <div className="menu-actions">
            <button type="button" className="menu-btn" disabled={count === 0} onClick={copy}>
              {copyState === 'copied' ? 'copied ✓' : copyState === 'failed' ? "couldn't copy" : 'copy'}
            </button>
            <button type="button" className="menu-btn menu-btn--primary" disabled={count === 0} onClick={download}>
              download .md
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Per-row actions (kebab → delete). Delete is destructive with no soft-delete on
 * the backend, so it's a two-step: the first click swaps the item to a confirm
 * label, the second deletes — error prevention without a modal. The confirm
 * state resets whenever the menu closes.
 */
function RowMenu({
  onDelete,
  onMoveUp,
  onMoveDown,
  canUp,
  canDown,
}: {
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canUp: boolean
  canDown: boolean
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setConfirming(false)
      }}
    >
      <DropdownMenuTrigger asChild>
        <button type="button" className="todo__menu" aria-label="task actions">
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9.5rem]">
        {/* reorder without a mouse — the keyboard/menu path to the custom order */}
        {canUp && (
          <DropdownMenuItem onSelect={() => onMoveUp()}>
            <ArrowUp size={14} /> move up
          </DropdownMenuItem>
        )}
        {canDown && (
          <DropdownMenuItem onSelect={() => onMoveDown()}>
            <ArrowDown size={14} /> move down
          </DropdownMenuItem>
        )}
        {(canUp || canDown) && <DropdownMenuSeparator />}
        {confirming ? (
          <DropdownMenuItem style={{ color: 'var(--color-danger)' }} onSelect={() => onDelete()}>
            <Trash2 size={14} /> click again to delete
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            style={{ color: 'var(--color-danger)' }}
            onSelect={(e) => {
              e.preventDefault() // keep the menu open to show the confirm step
              setConfirming(true)
            }}
          >
            <Trash2 size={14} /> delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * One active list filter, shown as a removable token next to the filter menu —
 * the resting control row stays empty; only real choices take up space.
 */
function FilterToken({ label, onClear, children }: { label: string; onClear: () => void; children: ReactNode }) {
  return (
    <span className="filter-token">
      {children}
      <button type="button" className="filter-token__x" aria-label={`remove filter: ${label}`} onClick={onClear}>
        <XIcon size={12} />
      </button>
    </span>
  )
}

/** Greeting keyed to the local hour — lowercase, human, no exclamation. */
function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'good morning'
  if (h < 18) return 'good afternoon'
  return 'good evening'
}

/**
 * The start page: a calm "today" home that pays off the triage design. A greeting, the same
 * live indicators as the to-dos band, and a restrained panel grid reusing the module's own
 * building blocks (a focus list of what's due now, week-ahead, by-project) plus placeholders
 * for the modules still to come. Real configurable widgets replace this later; for now it's
 * the honest default overview so the landing view isn't an empty box.
 */
function DashboardView({
  todos,
  projects,
  onToggle,
  onOpenTodos,
  onOpenProject,
}: {
  todos: Todo[]
  projects: Project[]
  onToggle: (t: Todo) => void
  onOpenTodos: () => void
  onOpenProject: (id: number) => void
}) {
  const stats = triageStats(todos)
  // what's actually on the plate: open tasks overdue or due today, most urgent first
  const focus = todos
    .filter((t) => {
      const b = bucketOf(t, false)
      return b === 'overdue' || b === 'today'
    })
    .sort((a, b) => ((a.due_at ?? '') < (b.due_at ?? '') ? -1 : 1))
    .slice(0, 6)

  return (
    <div className="content dashboard">
      <header className="focusband">
        <div className="focusband__top">
          <div>
            <h1 className="page-title">{greeting()}</h1>
            <p className="page-sub">here's what's on your plate today.</p>
          </div>
        </div>
        {(stats.overdue > 0 || stats.dueToday > 0) && (
          <div className="focusband__stats">
            {stats.overdue > 0 && (
              <span className="stat stat--danger">
                <span className="stat__value">{stats.overdue}</span>
                <span className="stat__label">overdue</span>
              </span>
            )}
            {stats.dueToday > 0 && (
              <span className="stat">
                <span className="stat__value">{stats.dueToday}</span>
                <span className="stat__label">due today</span>
              </span>
            )}
            {stats.estTodayMinutes > 0 && (
              <span className="stat">
                <span className="stat__value">{formatEstimate(stats.estTodayMinutes)}</span>
                <span className="stat__label">est. today</span>
              </span>
            )}
          </div>
        )}
      </header>

      <div className="dash-grid">
        <section className="dash-panel dash-panel--wide">
          <div className="dash-panel__head">
            <h2 className="rail__title">today &amp; overdue</h2>
            <button className="dash-link" type="button" onClick={onOpenTodos}>open to-dos →</button>
          </div>
          {focus.length === 0 ? (
            <p className="dash-empty">nothing due right now — you're clear.</p>
          ) : (
            <ul className="dash-tasks">
              {focus.map((t) => {
                const due = formatDue(t.due_at)
                return (
                  <li className="dash-task" key={t.id}>
                    <button
                      className="todo__check"
                      role="checkbox"
                      aria-checked={false}
                      aria-label="mark done"
                      onClick={() => onToggle(t)}
                    />
                    <span className="dash-task__title">{t.title}</span>
                    {due && <span className={`dash-task__meta${due.overdue ? ' is-overdue' : ''}`}>{due.label}</span>}
                    {t.estimate_minutes != null && <span className="dash-task__meta">{formatEstimate(t.estimate_minutes)}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="dash-panel">
          <RailWeek todos={todos} />
        </section>
        <section className="dash-panel">
          <RailProjects projects={projects} todos={todos} active={null} onPick={onOpenProject} />
        </section>

        <div className="dash-tiles">
          <div className="dash-tile" aria-hidden>
            <Cal />
            <span className="dash-tile__text">
              <span className="dash-tile__title">calendar</span>
              <span className="dash-tile__sub">coming soon</span>
            </span>
          </div>
          <div className="dash-tile" aria-hidden>
            <Briefcase />
            <span className="dash-tile__text">
              <span className="dash-tile__title">applications</span>
              <span className="dash-tile__sub">coming soon</span>
            </span>
          </div>
        </div>
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

/**
 * Rail: the user's tags, as a quiet overview. Assigning tags happens per-task in the list
 * (TagsField) and filtering by tag lives in the filter panel; this panel just lists them.
 */
function RailTags({ tags }: { tags: Tag[] }) {
  return (
    <section className="rail__panel">
      <h2 className="rail__title">tags</h2>
      {tags.length === 0 ? (
        <p className="rail__empty">no tags yet</p>
      ) : (
        <div className="tag-row">
          {tags.map((t) => (
            <span className="tag" key={t.id}>#{t.name}</span>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Rail: week-ahead strip. The next seven days, each with a count (and a proportional bar)
 * of open tasks due that day — a temporal overview the date-grouped list doesn't surface
 * directly. Read-only; purely orienting.
 */
function RailWeek({ todos }: { todos: Todo[] }) {
  const today = startOfDay(new Date())
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today + i * 86_400_000)
    return { date, count: openDueOn(todos, date) }
  })
  const max = Math.max(1, ...days.map((d) => d.count))
  const weekday = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short' }).toLowerCase()
  return (
    <section className="rail__panel">
      <h2 className="rail__title">week ahead</h2>
      <div className="rail-week">
        {days.map(({ date, count }, i) => (
          <div className={`rail-day${i === 0 ? ' is-today' : ''}`} key={i}>
            <span className="rail-day__label">{i === 0 ? 'today' : weekday(date)}</span>
            <span className="rail-day__track">
              <span className="rail-day__bar" style={{ width: `${(count / max) * 100}%` }} />
            </span>
            <span className="rail-day__count">{count || ''}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * Rail: per-project open-task counts — a second axis over the same list. Clicking a
 * project scopes the list to it (the parent toggles it off when already active). Tasks
 * with no project are shown as a static count, since the list has no "unassigned" filter.
 */
function RailProjects({
  projects,
  todos,
  active,
  onPick,
}: {
  projects: Project[]
  todos: Todo[]
  active: number | null
  onPick: (id: number) => void
}) {
  const open = todos.filter((t) => t.status === 'open')
  const countFor = (id: number | null) => open.filter((t) => t.project_id === id).length
  const noProject = countFor(null)
  return (
    <section className="rail__panel">
      <h2 className="rail__title">by project</h2>
      <div className="rail-proj">
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`rail-proj__row${active === p.id ? ' is-active' : ''}`}
            onClick={() => onPick(p.id)}
          >
            <span className="dot" style={{ background: p.color || 'var(--color-text-secondary)' }} />
            <span className="rail-proj__name">{p.name}</span>
            <span className="rail-proj__count">{countFor(p.id)}</span>
          </button>
        ))}
        {noProject > 0 && (
          <div className="rail-proj__row rail-proj__row--static">
            <span className="dot" style={{ background: 'var(--color-border-strong)' }} />
            <span className="rail-proj__name">no project</span>
            <span className="rail-proj__count">{noProject}</span>
          </div>
        )}
        {projects.length === 0 && noProject === 0 && <p className="rail__empty">no projects yet</p>}
      </div>
    </section>
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
function CreateBar({
  projects,
  tags,
  onCreate,
  onCreateTag,
}: {
  projects: Project[]
  tags: Tag[]
  onCreate: (input: TodoInput, tagIds: number[]) => void
  onCreateTag: (name: string, onDone: (tag: Tag) => void) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<number | null>(null)
  const [priority, setPriority] = useState<Priority>(0)
  const [due, setDue] = useState<string | null>(null)
  const [effort, setEffort] = useState<number | null>(null)
  // Tags picked for the task being drafted. They only exist client-side until
  // Enter creates the todo — the parent then attaches them to the new row.
  const [selTags, setSelTags] = useState<Tag[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const reset = () => {
    setTitle('')
    setProjectId(null)
    setPriority(0)
    setDue(null)
    setEffort(null)
    setSelTags([])
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
  const dirty =
    title.trim() !== '' || projectId != null || priority !== 0 || due != null || effort != null || selTags.length > 0
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
          onCreate(
            { title: t, project_id: projectId, priority, status: 'open', due_at: due, estimate_minutes: effort },
            selTags.map((tag) => tag.id),
          )
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
          <TagsField
            value={selTags}
            allTags={tags}
            onToggle={(tagId, on) =>
              setSelTags((prev) => {
                if (on) return prev.filter((t) => t.id !== tagId)
                const tag = tags.find((t) => t.id === tagId)
                return tag ? [...prev, tag] : prev
              })
            }
            onCreate={(name) =>
              onCreateTag(name, (tag) => setSelTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag])))
            }
          />
        </div>
      </form>
    </div>
  )
}
