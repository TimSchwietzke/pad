import { describe, expect, it } from 'vitest'
import { bucketOf, openDueOn, triageStats } from './triage'
import type { Todo } from './types'

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
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...over,
  }
}

// A fixed "now" so the relative-date maths is deterministic regardless of the clock.
const now = new Date(2026, 6, 5, 10, 0, 0) // sun 5 jul 2026, 10:00 local
const at = (y: number, m: number, d: number) => new Date(y, m, d).toISOString()

describe('bucketOf', () => {
  it('sorts open tasks into date buckets relative to now', () => {
    expect(bucketOf(todo({ due_at: at(2026, 6, 3) }), false, now)).toBe('overdue') // 2 days ago
    expect(bucketOf(todo({ due_at: at(2026, 6, 5) }), false, now)).toBe('today')
    expect(bucketOf(todo({ due_at: at(2026, 6, 9) }), false, now)).toBe('week') // +4 days
    expect(bucketOf(todo({ due_at: at(2026, 6, 12) }), false, now)).toBe('week') // +7 days, still this week
    expect(bucketOf(todo({ due_at: at(2026, 6, 13) }), false, now)).toBe('later') // +8 days
    expect(bucketOf(todo({ due_at: null }), false, now)).toBe('nodate')
  })

  it('puts done tasks in the done bucket, unless kept open for the grace period', () => {
    const done = todo({ status: 'done', due_at: at(2026, 6, 3) })
    expect(bucketOf(done, false, now)).toBe('done')
    // a task mid-undo stays in its date bucket so it collapses in place
    expect(bucketOf(done, true, now)).toBe('overdue')
  })
})

describe('triageStats', () => {
  it('counts overdue / due-today and sums only today-relevant effort', () => {
    const stats = triageStats(
      [
        todo({ id: 1, due_at: at(2026, 6, 3), estimate_minutes: 30 }), // overdue
        todo({ id: 2, due_at: at(2026, 6, 5), estimate_minutes: 60 }), // today
        todo({ id: 3, due_at: at(2026, 6, 20), estimate_minutes: 90 }), // later — excluded from est
        todo({ id: 4, due_at: null, estimate_minutes: 15 }), // no date — excluded from est
        todo({ id: 5, status: 'done', due_at: at(2026, 6, 5) }), // done — not pending
      ],
      now,
    )
    expect(stats.overdue).toBe(1)
    expect(stats.dueToday).toBe(1)
    expect(stats.estTodayMinutes).toBe(90) // 30 (overdue) + 60 (today), not the later/undated/done ones
    expect(stats.open).toBe(4)
  })
})

describe('openDueOn', () => {
  it('counts only open tasks due on the given calendar day', () => {
    const todos = [
      todo({ id: 1, due_at: at(2026, 6, 5) }),
      todo({ id: 2, due_at: at(2026, 6, 5) }),
      todo({ id: 3, due_at: at(2026, 6, 5), status: 'done' }),
      todo({ id: 4, due_at: at(2026, 6, 6) }),
    ]
    expect(openDueOn(todos, new Date(2026, 6, 5))).toBe(2)
    expect(openDueOn(todos, new Date(2026, 6, 6))).toBe(1)
    expect(openDueOn(todos, new Date(2026, 6, 7))).toBe(0)
  })
})
