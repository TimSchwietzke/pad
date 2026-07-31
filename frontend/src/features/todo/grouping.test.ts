import { describe, expect, it } from 'vitest'
import { groupTodos } from './grouping'
import type { Project, Todo } from './types'

/** A todo with sane defaults; override only what the case exercises. */
function todo(over: Partial<Todo> = {}): Todo {
  return {
    id: 1,
    project_id: null,
    title: 't',
    notes: '',
    priority: 0,
    status: 'open',
    due_at: null,
    estimate_minutes: null,
    position: 0,
    recurrence: null,
    tags: [],
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...over,
  }
}

const projects: Project[] = [
  { id: 1, name: 'pad', color: '#111', created_at: '', updated_at: '' },
  { id: 2, name: 'home', color: '', created_at: '', updated_at: '' },
]

// A fixed "now" so the date axis doesn't depend on the wall clock.
const now = new Date(2026, 6, 5, 10, 0, 0) // sun 5 jul 2026
const at = (y: number, m: number, d: number) => new Date(y, m, d).toISOString()

/** Compact view of a result: one `label: title, title` entry per group. */
const shape = (groups: ReturnType<typeof groupTodos>) =>
  groups.map((g) => `${g.label}: ${g.todos.map((t) => t.title).join(',')}`)

describe('groupTodos', () => {
  it('returns one unlabelled group for "none", keeping the incoming order', () => {
    const todos = [todo({ id: 1, title: 'a' }), todo({ id: 2, title: 'b', status: 'done' })]
    const groups = groupTodos(todos, 'none', { projects })
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('')
    expect(groups[0].todos.map((t) => t.title)).toEqual(['a', 'b'])
  })

  it('drops empty groups and returns nothing for an empty list', () => {
    expect(groupTodos([], 'none', { projects })).toEqual([])
    expect(groupTodos([], 'date', { projects })).toEqual([])
    expect(groupTodos([todo({ title: 'a', priority: 3 })], 'priority', { projects })).toHaveLength(1)
  })

  it('groups by deadline in urgency order and colours only the urgent buckets', () => {
    const todos = [
      todo({ id: 1, title: 'later', due_at: at(2026, 6, 20) }),
      todo({ id: 2, title: 'past', due_at: at(2026, 6, 1) }),
      todo({ id: 3, title: 'undated' }),
      todo({ id: 4, title: 'now', due_at: at(2026, 6, 5) }),
      todo({ id: 5, title: 'soon', due_at: at(2026, 6, 8) }),
    ]
    const groups = groupTodos(todos, 'date', { projects, now })
    expect(shape(groups)).toEqual(['overdue: past', 'today: now', 'this week: soon', 'later: later', 'no date: undated'])
    expect(groups.map((g) => g.tone)).toEqual(['danger', 'accent', undefined, undefined, undefined])
  })

  it('groups by project in the projects order, unassigned last', () => {
    const todos = [
      todo({ id: 1, title: 'a', project_id: 2 }),
      todo({ id: 2, title: 'b' }),
      todo({ id: 3, title: 'c', project_id: 1 }),
      todo({ id: 4, title: 'd', project_id: 2 }),
    ]
    expect(shape(groupTodos(todos, 'project', { projects }))).toEqual(['pad: c', 'home: a,d', 'no project: b'])
  })

  it('files tasks of an unknown (deleted) project under "no project"', () => {
    const todos = [todo({ id: 1, title: 'orphan', project_id: 99 })]
    expect(shape(groupTodos(todos, 'project', { projects }))).toEqual(['no project: orphan'])
  })

  it('carries the project colour into the group, skipping blank ones', () => {
    // both projects are represented, so the (empty) "no project" group drops out
    const todos = [todo({ id: 1, title: 'a', project_id: 1 }), todo({ id: 2, title: 'b', project_id: 2 })]
    expect(groupTodos(todos, 'project', { projects }).map((g) => g.color)).toEqual(['#111', undefined])
  })

  it('groups by priority from high to none', () => {
    const todos = [
      todo({ id: 1, title: 'plain' }),
      todo({ id: 2, title: 'urgent', priority: 3 }),
      todo({ id: 3, title: 'meh', priority: 1 }),
      todo({ id: 4, title: 'mid', priority: 2 }),
    ]
    expect(shape(groupTodos(todos, 'priority', { projects }))).toEqual([
      'high: urgent',
      'medium: mid',
      'low: meh',
      'no priority: plain',
    ])
  })

  it('sinks done tasks into a trailing group on every axis', () => {
    const todos = [
      todo({ id: 1, title: 'open', priority: 3 }),
      todo({ id: 2, title: 'finished', priority: 3, status: 'done' }),
    ]
    expect(shape(groupTodos(todos, 'priority', { projects }))).toEqual(['high: open', 'done: finished'])
    expect(shape(groupTodos(todos, 'project', { projects }))).toEqual(['no project: open', 'done: finished'])
  })

  it('keeps a task in its group while it sits in the undo grace period', () => {
    const todos = [todo({ id: 1, title: 'open', priority: 3 }), todo({ id: 2, title: 'just checked', priority: 3, status: 'done' })]
    const groups = groupTodos(todos, 'priority', { projects, isLeaving: (id) => id === 2 })
    expect(shape(groups)).toEqual(['high: open,just checked'])
  })

  it('groups an all-done list along the chosen axis instead of one useless "done" pile', () => {
    const todos = [
      todo({ id: 1, title: 'a', status: 'done', priority: 3 }),
      todo({ id: 2, title: 'b', status: 'done', priority: 1 }),
    ]
    expect(shape(groupTodos(todos, 'priority', { projects }))).toEqual(['high: a', 'low: b'])
    // the date axis too: done tasks land in their deadline bucket, not in "done"
    expect(shape(groupTodos([todo({ id: 3, title: 'c', status: 'done', due_at: at(2026, 6, 5) })], 'date', { projects, now }))).toEqual([
      'today: c',
    ])
  })
})
