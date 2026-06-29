import { http, HttpResponse } from 'msw'
import { fireEvent, screen, waitFor } from '@testing-library/react'
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
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...over,
  }
}

/** Opens the dashboard and navigates from the home view into the to-dos view. */
async function openTodos(user: ReturnType<typeof userEvent.setup>) {
  renderWithClient(<TodoDashboard />)
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

    expect(await screen.findByRole('button', { name: /click to create a new task/i })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('new task…')).not.toBeInTheDocument()
  })

  it('creates a task from the create tile', async () => {
    const user = userEvent.setup()
    await openTodos(user)

    await user.click(await screen.findByRole('button', { name: /click to create a new task/i }))
    await user.type(screen.getByLabelText('new task title'), 'buy milk{Enter}')

    expect(await screen.findByText('buy milk')).toBeInTheDocument()
    expect(screen.getByText('you have 1 pending task')).toBeInTheDocument()
  })

  it('opens the create input with the "c" shortcut', async () => {
    const user = userEvent.setup()
    await openTodos(user)
    await screen.findByRole('button', { name: /click to create a new task/i })

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
