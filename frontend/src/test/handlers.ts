import { http, HttpResponse } from 'msw'
import type { Project, Tag, Todo, TodoInput } from '../features/todo/types'

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
  seq: number
  tagSeq: number
  /** Every `sort` spec the app has asked for, in order — lets tests assert sorting. */
  requestedSorts: string[]
}

const db: Db = { todos: [], projects: [], tags: [], tagLinks: {}, seq: 1, tagSeq: 1, requestedSorts: [] }

/** Reset the fake backend between tests, optionally seeding rows. */
export function resetDb(seed: Partial<Pick<Db, 'todos' | 'projects' | 'tags'>> = {}) {
  db.todos = seed.todos ?? []
  db.projects = seed.projects ?? []
  db.tags = seed.tags ?? []
  // seed the tag links from any tags already on the seeded todos
  db.tagLinks = {}
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
      updated_at: now(),
    }
    db.todos = db.todos.map((t) => (t.id === id ? updated : t))
    return HttpResponse.json(updated)
  }),
]
