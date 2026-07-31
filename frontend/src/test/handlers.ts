import { http, HttpResponse } from 'msw'
import type { Project, Recurrence, Tag, Todo, TodoInput } from '../features/todo/types'

/**
 * A tiny in-memory stand-in for the `/api/todo` backend. It is just stateful
 * enough that behavioural tests (create a task, toggle it done) see a real
 * request → response → refetch cycle, the same path the app takes in the browser.
 * Backend concerns like sort ordering and ownership are tested in Go; here we
 * only assert the frontend wires the calls up correctly.
 */
interface Db {
  todos: Todo[]
  projects: Project[]
  tags: Tag[]
  /** todo id -> attached tag ids (the todo_tag_map stand-in) */
  tagLinks: Record<number, number[]>
  /** spawned occurrence id -> the one it came from (the spawned_from_id column) */
  spawnedFrom: Record<number, number>
  seq: number
  tagSeq: number
  /** Every `sort` spec the app has asked for, in order — lets tests assert sorting. */
  requestedSorts: string[]
}

const db: Db = { todos: [], projects: [], tags: [], tagLinks: {}, spawnedFrom: {}, seq: 1, tagSeq: 1, requestedSorts: [] }

/** Reset the fake backend between tests, optionally seeding rows. */
export function resetDb(seed: Partial<Pick<Db, 'todos' | 'projects' | 'tags'>> = {}) {
  db.todos = seed.todos ?? []
  db.projects = seed.projects ?? []
  db.tags = seed.tags ?? []
  // seed the tag links from any tags already on the seeded todos
  db.tagLinks = {}
  db.spawnedFrom = {}
  for (const t of db.todos) {
    if (t.tags?.length) db.tagLinks[t.id] = t.tags.map((tag) => tag.id)
  }
  db.seq = db.todos.reduce((max, t) => Math.max(max, t.id), 0) + 1
  db.tagSeq = db.tags.reduce((max, t) => Math.max(max, t.id), 0) + 1
  db.requestedSorts = []
}

/** The tags currently linked to a todo, resolved from the id map (like the real list embed). */
function tagsFor(todoId: number): Tag[] {
  return (db.tagLinks[todoId] ?? [])
    .map((id) => db.tags.find((tag) => tag.id === id))
    .filter((t): t is Tag => t != null)
}

/** The sort specs requested so far (e.g. ["-priority", "due"]). */
export function requestedSorts(): readonly string[] {
  return db.requestedSorts
}

const now = () => new Date().toISOString()

/**
 * The successor's deadline, mirroring the backend's rule: move on by one interval
 * from the current deadline (or from today when there is none). The catch-up loop
 * and the month-length clamping are the backend's business and covered by Go
 * tests; here we only need a plausible date so the UI has something to show.
 */
function nextDueIso(due: string | null, r: Recurrence): string {
  const d = due ? new Date(due) : new Date()
  const days = r.weekdays ?? []
  if (r.freq === 'weekly' && days.length > 0) {
    // walk to the next selected weekday (ISO: monday = 1, sunday = 7)
    for (let i = 0; i < 70; i++) {
      d.setDate(d.getDate() + 1)
      if (days.includes(d.getDay() === 0 ? 7 : d.getDay())) break
    }
    return d.toISOString()
  }
  const n = r.interval
  if (r.freq === 'daily') d.setDate(d.getDate() + n)
  else if (r.freq === 'weekly') d.setDate(d.getDate() + 7 * n)
  else if (r.freq === 'monthly') d.setMonth(d.getMonth() + n)
  else d.setFullYear(d.getFullYear() + n)
  return d.toISOString()
}

/** Mirrors the backend's end-of-series check: is this occurrence the last one? */
function seriesEnded(r: Recurrence, nextDue: string): boolean {
  if (r.count != null && r.count <= 0) return true
  if (r.until != null && new Date(nextDue) > new Date(r.until)) return true
  return false
}

export const handlers = [
  http.get('/api/todo/projects', () => HttpResponse.json(db.projects)),
  http.get('/api/todo/tags', () => HttpResponse.json(db.tags)),

  http.get('/api/todo/todos', ({ request }) => {
    const sort = new URL(request.url).searchParams.get('sort')
    if (sort) db.requestedSorts.push(sort)
    // The custom mode asks for position order; everything else keeps insertion order
    // (backend sorting itself is covered by Go tests).
    const ordered =
      sort === 'position'
        ? [...db.todos].sort((a, b) => a.position - b.position || a.id - b.id)
        : db.todos
    // embed each todo's tags, exactly like the real list endpoint
    return HttpResponse.json(ordered.map((t) => ({ ...t, tags: tagsFor(t.id) })))
  }),

  http.post('/api/todo/todos', async ({ request }) => {
    const input = (await request.json()) as TodoInput
    const maxPos = db.todos.reduce((max, t) => Math.max(max, t.position), -1)
    const todo: Todo = {
      id: db.seq++,
      project_id: input.project_id ?? null,
      title: input.title,
      notes: input.notes ?? '',
      priority: input.priority ?? 0,
      status: input.status ?? 'open',
      due_at: input.due_at ?? null,
      estimate_minutes: input.estimate_minutes ?? null,
      recurrence: input.recurrence ?? null,
      position: maxPos + 1, // append to the end of the custom order
      tags: [],
      created_at: now(),
      updated_at: now(),
    }
    db.todos = [...db.todos, todo]
    return HttpResponse.json(todo, { status: 201 })
  }),

  // create a tag
  http.post('/api/todo/tags', async ({ request }) => {
    const { name } = (await request.json()) as { name: string }
    const tag: Tag = { id: db.tagSeq++, name: name.trim() }
    db.tags = [...db.tags, tag]
    return HttpResponse.json(tag, { status: 201 })
  }),

  // attach / detach a tag on a todo
  http.post('/api/todo/todos/:id/tags/:tagId', ({ params }) => {
    const todoId = Number(params.id)
    const tagId = Number(params.tagId)
    const links = db.tagLinks[todoId] ?? []
    if (!links.includes(tagId)) db.tagLinks[todoId] = [...links, tagId]
    return new HttpResponse(null, { status: 204 })
  }),
  http.delete('/api/todo/todos/:id/tags/:tagId', ({ params }) => {
    const todoId = Number(params.id)
    const tagId = Number(params.tagId)
    db.tagLinks[todoId] = (db.tagLinks[todoId] ?? []).filter((id) => id !== tagId)
    return new HttpResponse(null, { status: 204 })
  }),

  http.put('/api/todo/todos/reorder', async ({ request }) => {
    const { ids } = (await request.json()) as { ids: number[] }
    ids.forEach((id, i) => {
      const todo = db.todos.find((t) => t.id === id)
      if (todo) todo.position = i
    })
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('/api/todo/todos/:id', ({ params }) => {
    const id = Number(params.id)
    db.todos = db.todos.filter((t) => t.id !== id)
    delete db.tagLinks[id]
    return new HttpResponse(null, { status: 204 })
  }),

  http.put('/api/todo/todos/:id', async ({ request, params }) => {
    const id = Number(params.id)
    const existing = db.todos.find((t) => t.id === id)
    if (!existing) {
      return HttpResponse.json({ error: { code: 'not_found', message: 'todo not found' } }, { status: 404 })
    }
    const input = (await request.json()) as TodoInput
    const updated: Todo = {
      ...existing,
      ...input,
      project_id: input.project_id ?? null,
      recurrence: input.recurrence ?? null,
      updated_at: now(),
    }
    db.todos = db.todos.map((t) => (t.id === id ? updated : t))

    // Mirror the backend's recurrence behaviour: completing a repeating task
    // spawns the next occurrence, un-checking it takes an untouched one back.
    // Component tests then exercise the same flow the real app sees.
    const due = updated.recurrence ? nextDueIso(updated.due_at, updated.recurrence) : null
    if (
      existing.status === 'open' &&
      updated.status === 'done' &&
      updated.recurrence &&
      due &&
      !seriesEnded(updated.recurrence, due)
    ) {
      const maxPos = db.todos.reduce((max, t) => Math.max(max, t.position), -1)
      const rule = updated.recurrence
      const next: Todo = {
        ...updated,
        id: db.seq++,
        status: 'open',
        due_at: due,
        // the countdown moves with the series, so the successor knows what's left
        recurrence: { ...rule, count: rule.count != null ? rule.count - 1 : rule.count },
        position: maxPos + 1,
        created_at: now(),
        updated_at: now(),
      }
      db.todos = [...db.todos, next]
      db.spawnedFrom[next.id] = updated.id
      if (db.tagLinks[updated.id]) db.tagLinks[next.id] = [...db.tagLinks[updated.id]]
    } else if (existing.status === 'done' && updated.status === 'open') {
      const child = [...db.todos].reverse().find((t) => db.spawnedFrom[t.id] === updated.id)
      if (child && child.status === 'open') {
        db.todos = db.todos.filter((t) => t.id !== child.id)
        delete db.tagLinks[child.id]
      }
    }
    return HttpResponse.json(updated)
  }),
]
