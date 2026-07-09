import { http, HttpResponse } from 'msw'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoDashboard } from './TodoDashboard'
import type { Todo } from './types'
import { renderWithClient } from '../../test/render'
import { requestedSorts, resetDb } from '../../test/handlers'
import { server } from '../../test/server'

/** Builds a todo with sensible defaults; override only what a test cares about. */
function makeTodo(over: Partial<Todo> = {}): Todo {
  return {
    id: 1,
    project_id: null,
    title: 'write report',
    notes: '',
    priority: 0,
    status: 'open',
    due_at: null,
    estimate_minutes: null,
    position: 0,
    tags: [],
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...over,
  }
}

/** ISO timestamp at local midnight, `n` days from today — for deadline-relative tests. */
function dayOffsetIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}

/**
 * Renders, opens the collapsible nav sidebar (module nav lives there now), and navigates
 * into the to-dos view.
 */
async function openTodos(user: ReturnType<typeof userEvent.setup>) {
  renderWithClient(<TodoDashboard />)
  await user.click(await screen.findByRole('button', { name: 'toggle sidebar' }))
  await user.click(await screen.findByRole('button', { name: 'to-dos' }))
}

describe('TodoDashboard', () => {
  beforeEach(() => resetDb())

  it('renders tasks with their meta and a personalized count', async () => {
    resetDb({
      todos: [
        makeTodo({ id: 1, title: 'alpha', priority: 3, estimate_minutes: 90 }),
        makeTodo({ id: 2, title: 'beta' }),
      ],
    })
    const user = userEvent.setup()
    await openTodos(user)

    expect(await screen.findByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
    expect(screen.getByText('you have 2 pending tasks')).toBeInTheDocument()
    expect(screen.getByText('high')).toBeInTheDocument() // priority badge
    expect(screen.getByText('1 h 30 min')).toBeInTheDocument() // formatted estimate
  })

  it('offers the dashed create tile instead of a fixed quick-add row', async () => {
    const user = userEvent.setup()
    await openTodos(user)

    expect(await screen.findByRole('button', { name: /create a task/i })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('new task…')).not.toBeInTheDocument()
  })

  it('creates a task from the create tile', async () => {
    const user = userEvent.setup()
    await openTodos(user)

    await user.click(await screen.findByRole('button', { name: /create a task/i }))
    await user.type(screen.getByLabelText('new task title'), 'buy milk{Enter}')

    expect(await screen.findByText('buy milk')).toBeInTheDocument()
    expect(screen.getByText('you have 1 pending task')).toBeInTheDocument()
  })

  it('opens the create input with the "c" shortcut', async () => {
    const user = userEvent.setup()
    await openTodos(user)
    await screen.findByRole('button', { name: /create a task/i })

    expect(screen.queryByLabelText('new task title')).not.toBeInTheDocument()
    await user.keyboard('c')
    expect(await screen.findByLabelText('new task title')).toBeInTheDocument()
  })

  it('toggles a task between open and done', async () => {
    resetDb({ todos: [makeTodo({ id: 1, title: 'alpha' })] })
    const user = userEvent.setup()
    await openTodos(user)

    await user.click(await screen.findByRole('checkbox', { name: /mark done/i }))
    expect(await screen.findByRole('checkbox', { name: /mark open/i })).toBeInTheDocument()
    expect(await screen.findByText("you're all caught up")).toBeInTheDocument()
  })

  it('switches the list density to compact', async () => {
    resetDb({ todos: [makeTodo({ id: 1, title: 'alpha' })] })
    const user = userEvent.setup()
    const { container } = renderWithClient(<TodoDashboard />)
    await user.click(await screen.findByRole('button', { name: 'toggle sidebar' }))
    await user.click(await screen.findByRole('button', { name: 'to-dos' }))
    await screen.findByText('alpha')

    expect(container.querySelector('.todo-list--comfortable')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'compact' }))
    expect(container.querySelector('.todo-list--compact')).toBeTruthy()
  })

  it('requests the chosen sort order from the backend', async () => {
    resetDb({ todos: [makeTodo({ id: 1, title: 'alpha' })] })
    const user = userEvent.setup()
    await openTodos(user)
    await screen.findByText('alpha')

    // Default sort is priority, highest first.
    await waitFor(() => expect(requestedSorts()).toContain('-priority'))
    await user.click(screen.getByRole('button', { name: 'deadline' }))
    await waitFor(() => expect(requestedSorts()).toContain('due'))
  })

  it('drag reorders from the current view and saves it as the custom order', async () => {
    resetDb({
      todos: [
        makeTodo({ id: 1, title: 'a', position: 0 }),
        makeTodo({ id: 2, title: 'b', position: 1 }),
        makeTodo({ id: 3, title: 'c', position: 2 }),
      ],
    })
    const user = userEvent.setup()
    const { container } = renderWithClient(<TodoDashboard />)
    await user.click(await screen.findByRole('button', { name: 'toggle sidebar' }))
    await user.click(await screen.findByRole('button', { name: 'to-dos' }))

    const titles = () => [...container.querySelectorAll('.todo__title')].map((n) => n.textContent)
    // Default (priority) view — no custom tab clicked first.
    await waitFor(() => expect(titles()).toEqual(['a', 'b', 'c']))

    // Drag the last row (c) onto the first (a): order becomes c, a, b.
    const rows = container.querySelectorAll('.todo')
    fireEvent.dragStart(rows[2])
    fireEvent.dragOver(rows[0])
    fireEvent.drop(rows[0])

    await waitFor(() => expect(titles()).toEqual(['c', 'a', 'b']))
    // Dragging switched the active sort to custom and persisted the order.
    expect(container.querySelector('.todo-list--custom')).toBeTruthy()
    await waitFor(() => expect(requestedSorts()).toContain('position'))
  })

  it('changes the preset from the settings view and persists it', async () => {
    const user = userEvent.setup()
    renderWithClient(<TodoDashboard />)
    await user.click(await screen.findByRole('button', { name: 'toggle sidebar' }))
    await user.click(await screen.findByRole('button', { name: 'settings' }))

    expect(document.documentElement.dataset.preset).toBe('standard')
    await user.click(screen.getByRole('button', { name: 'google' }))

    expect(document.documentElement.dataset.preset).toBe('google')
    expect(JSON.parse(localStorage.getItem('pad.preset')!)).toBe('google')
  })

  it('moved the preset toggle out of the top bar', async () => {
    const user = userEvent.setup()
    renderWithClient(<TodoDashboard />)
    await user.click(await screen.findByRole('button', { name: 'toggle sidebar' }))
    await user.click(await screen.findByRole('button', { name: 'to-dos' }))
    // the old std/goog top-bar toggle is gone; preset lives in settings now
    expect(screen.queryByRole('button', { name: /^(std|goog)$/ })).not.toBeInTheDocument()
  })

  it('sets a param (priority) from the chip menu while creating', async () => {
    const user = userEvent.setup()
    await openTodos(user)
    await user.click(await screen.findByRole('button', { name: /create a task/i }))

    await user.click(screen.getByRole('button', { name: 'set priority' }))
    await user.click(await screen.findByRole('menuitem', { name: 'high' }))

    await user.type(screen.getByLabelText('new task title'), 'ship it{Enter}')

    const row = (await screen.findByText('ship it')).closest('.todo') as HTMLElement
    expect(within(row).getByText('high')).toBeInTheDocument()
  })

  it('edits a task param (priority) inline and optimistically', async () => {
    resetDb({ todos: [makeTodo({ id: 1, title: 'alpha', priority: 0 })] })
    const user = userEvent.setup()
    await openTodos(user)

    const row = (await screen.findByText('alpha')).closest('.todo') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'set priority' }))
    await user.click(await screen.findByRole('menuitem', { name: 'medium' }))

    expect(await within(row).findByText('medium')).toBeInTheDocument()
  })

  it('a checked task lingers for the grace period, then collapses away', async () => {
    resetDb({ todos: [makeTodo({ id: 1, title: 'alpha' })] })
    const user = userEvent.setup()
    renderWithClient(<TodoDashboard doneGraceMs={80} />)
    await user.click(await screen.findByRole('button', { name: 'toggle sidebar' }))
    await user.click(await screen.findByRole('button', { name: 'to-dos' }))

    await user.click(await screen.findByRole('checkbox', { name: /mark done/i }))
    // still visible right after checking (grace period, checkbox = undo)
    expect(screen.getByText('alpha')).toBeInTheDocument()
    // grace (80ms) + collapse (450ms) later the row has left the open view
    await waitFor(() => expect(screen.queryByText('alpha')).not.toBeInTheDocument(), { timeout: 2000 })
  })

  it('re-checking within the grace period keeps the task', async () => {
    resetDb({ todos: [makeTodo({ id: 1, title: 'alpha' })] })
    const user = userEvent.setup()
    renderWithClient(<TodoDashboard doneGraceMs={500} />)
    await user.click(await screen.findByRole('button', { name: 'toggle sidebar' }))
    await user.click(await screen.findByRole('button', { name: 'to-dos' }))

    await user.click(await screen.findByRole('checkbox', { name: /mark done/i }))
    await user.click(await screen.findByRole('checkbox', { name: /mark open/i }))
    // wait well past grace + collapse; the undo must have cancelled the departure
    await new Promise((r) => setTimeout(r, 1100))
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /mark done/i })).toBeInTheDocument()
  })

  it('filters by status and puts done tasks last in "both"', async () => {
    resetDb({
      todos: [
        makeTodo({ id: 1, title: 'finished one', status: 'done' }),
        makeTodo({ id: 2, title: 'open one' }),
      ],
    })
    const user = userEvent.setup()
    const { container } = renderWithClient(<TodoDashboard />)
    await user.click(await screen.findByRole('button', { name: 'toggle sidebar' }))
    await user.click(await screen.findByRole('button', { name: 'to-dos' }))

    // default filter: open only
    await screen.findByText('open one')
    expect(screen.queryByText('finished one')).not.toBeInTheDocument()

    // open the panel, switch to done only
    await user.click(screen.getByRole('button', { name: 'filter' }))
    const panel = within(container.querySelector('.filter-panel') as HTMLElement)
    await user.click(panel.getByRole('button', { name: 'done' }))
    expect(await screen.findByText('finished one')).toBeInTheDocument()
    expect(screen.queryByText('open one')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('pad.filter.status')!)).toBe('done')

    // "both": open tasks first, done sink to the bottom (seed order was done first)
    await user.click(panel.getByRole('button', { name: 'both' }))
    const titles = [...container.querySelectorAll('.todo__title')].map((n) => n.textContent)
    expect(titles).toEqual(['open one', 'finished one'])
  })

  it('filters by project', async () => {
    resetDb({
      projects: [{ id: 1, name: 'work', color: '#f00', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' }],
      todos: [
        makeTodo({ id: 1, title: 'work task', project_id: 1 }),
        makeTodo({ id: 2, title: 'loose task' }),
      ],
    })
    const user = userEvent.setup()
    const { container } = renderWithClient(<TodoDashboard />)
    await user.click(await screen.findByRole('button', { name: 'toggle sidebar' }))
    await user.click(await screen.findByRole('button', { name: 'to-dos' }))
    await screen.findByText('loose task')

    await user.click(screen.getByRole('button', { name: 'filter' }))
    const panel = within(container.querySelector('.filter-panel') as HTMLElement)
    await user.click(panel.getByRole('button', { name: 'work' }))

    expect(screen.getByText('work task')).toBeInTheDocument()
    expect(screen.queryByText('loose task')).not.toBeInTheDocument()
  })

  it('surfaces overdue and due-today indicators in the focus band', async () => {
    resetDb({
      todos: [
        makeTodo({ id: 1, title: 'ship it', due_at: dayOffsetIso(-1), estimate_minutes: 30 }),
        makeTodo({ id: 2, title: 'call back', due_at: dayOffsetIso(0), estimate_minutes: 60 }),
      ],
    })
    const user = userEvent.setup()
    const { container } = renderWithClient(<TodoDashboard />)
    await user.click(await screen.findByRole('button', { name: 'toggle sidebar' }))
    await user.click(await screen.findByRole('button', { name: 'to-dos' }))
    await screen.findByText('ship it')

    const stats = within(container.querySelector('.focusband__stats') as HTMLElement)
    expect(stats.getByText('overdue')).toBeInTheDocument()
    expect(stats.getByText('due today')).toBeInTheDocument()
    // today's effort = 30 (overdue) + 60 (due today)
    expect(stats.getByText('1 h 30 min')).toBeInTheDocument()
  })

  it('groups the list into date buckets, most urgent first', async () => {
    resetDb({
      todos: [
        makeTodo({ id: 1, title: 'later task', due_at: dayOffsetIso(20) }),
        makeTodo({ id: 2, title: 'overdue task', due_at: dayOffsetIso(-2) }),
        makeTodo({ id: 3, title: 'today task', due_at: dayOffsetIso(0) }),
      ],
    })
    const user = userEvent.setup()
    const { container } = renderWithClient(<TodoDashboard />)
    await user.click(await screen.findByRole('button', { name: 'toggle sidebar' }))
    await user.click(await screen.findByRole('button', { name: 'to-dos' }))
    await screen.findByText('overdue task')

    const labels = [...container.querySelectorAll('.todo-group__label')].map((n) => n.textContent)
    expect(labels).toEqual(['overdue', 'today', 'later'])
    // tasks land in bucket order regardless of the fetched order
    const titles = [...container.querySelectorAll('.todo__title')].map((n) => n.textContent)
    expect(titles).toEqual(['overdue task', 'today task', 'later task'])
  })

  it('filters the list from the rail by-project panel', async () => {
    resetDb({
      projects: [{ id: 1, name: 'work', color: '#f00', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' }],
      todos: [
        makeTodo({ id: 1, title: 'work task', project_id: 1 }),
        makeTodo({ id: 2, title: 'loose task' }),
      ],
    })
    const user = userEvent.setup()
    const { container } = renderWithClient(<TodoDashboard />)
    await user.click(await screen.findByRole('button', { name: 'toggle sidebar' }))
    await user.click(await screen.findByRole('button', { name: 'to-dos' }))
    await screen.findByText('loose task')

    const rail = within(container.querySelector('.rail') as HTMLElement)
    await user.click(rail.getByRole('button', { name: /work/ }))

    expect(screen.getByText('work task')).toBeInTheDocument()
    expect(screen.queryByText('loose task')).not.toBeInTheDocument()
  })

  it('keeps the sidebar collapsed by default and toggles it open, persisting the choice', async () => {
    const user = userEvent.setup()
    const { container } = renderWithClient(<TodoDashboard />)
    await screen.findByRole('button', { name: 'toggle sidebar' })
    const app = container.querySelector('.app') as HTMLElement

    expect(app.dataset.sidebar).toBe('closed')
    await user.click(screen.getByRole('button', { name: 'toggle sidebar' }))
    expect(app.dataset.sidebar).toBe('open')
    expect(JSON.parse(localStorage.getItem('pad.sidebar.open')!)).toBe(true)

    // the same header toggle closes it again (no separate button on the panel)
    await user.click(screen.getByRole('button', { name: 'toggle sidebar' }))
    expect(app.dataset.sidebar).toBe('closed')
  })

  it('focuses the search field with the ⌘K / Ctrl+K shortcut', async () => {
    const user = userEvent.setup()
    renderWithClient(<TodoDashboard />)
    await screen.findByRole('button', { name: 'toggle sidebar' })

    const search = screen.getByLabelText('search')
    expect(search).not.toHaveFocus()
    await user.keyboard('{Control>}k{/Control}')
    expect(search).toHaveFocus()
  })

  it('assigns a tag to a todo from the tags field', async () => {
    resetDb({
      todos: [makeTodo({ id: 1, title: 'write report' })],
      tags: [{ id: 5, name: 'urgent' }],
    })
    const user = userEvent.setup()
    await openTodos(user)

    const row = (await screen.findByText('write report')).closest('.todo') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'set tags' }))
    await user.click(await screen.findByRole('menuitem', { name: '#urgent' }))

    // after assigning + refetch, the tag shows on the row's chip
    expect(await within(row).findByText('urgent')).toBeInTheDocument()
  })

  it('filters the list by tag', async () => {
    resetDb({
      tags: [{ id: 5, name: 'urgent' }],
      todos: [
        makeTodo({ id: 1, title: 'tagged task', tags: [{ id: 5, name: 'urgent' }] }),
        makeTodo({ id: 2, title: 'plain task' }),
      ],
    })
    const user = userEvent.setup()
    const { container } = renderWithClient(<TodoDashboard />)
    await user.click(await screen.findByRole('button', { name: 'toggle sidebar' }))
    await user.click(await screen.findByRole('button', { name: 'to-dos' }))
    await screen.findByText('plain task')

    await user.click(screen.getByRole('button', { name: 'filter' }))
    const panel = within(container.querySelector('.filter-panel') as HTMLElement)
    await user.click(panel.getByRole('button', { name: '#urgent' }))

    expect(screen.getByText('tagged task')).toBeInTheDocument()
    expect(screen.queryByText('plain task')).not.toBeInTheDocument()
  })

  it('shows an error state when the list fails to load', async () => {
    server.use(
      http.get('/api/todo/todos', () =>
        HttpResponse.json({ error: { code: 'boom', message: 'nope' } }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    await openTodos(user)

    expect(await screen.findByText(/load tasks/i)).toBeInTheDocument()
  })
})
