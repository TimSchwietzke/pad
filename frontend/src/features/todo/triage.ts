import type { Todo } from './types'

/**
 * Triage is the core of pad (see PRODUCT.md): the list is grouped by time-to-deadline
 * so "what's next" is visible at a glance, and a few honest, action-relevant indicators
 * summarize the day. The buckets are the list's spine; the chosen sort orders within them.
 */
export type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'nodate' | 'done'

/** Lowercase labels for the bucket headers (UI copy is lowercase, see DESIGN.md §5). */
export const bucketLabel: Record<Bucket, string> = {
  overdue: 'overdue',
  today: 'today',
  week: 'this week',
  later: 'later',
  nodate: 'no date',
  done: 'done',
}

/** Fixed top-to-bottom order: the most urgent bucket first, finished work last. */
export const bucketOrder: Bucket[] = ['overdue', 'today', 'week', 'later', 'nodate', 'done']

/** Midnight of a date, as an epoch — the unit all day-diffs are measured in. */
export const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

const DAY = 86_400_000

/** Whole days from today's midnight to the due date's midnight (negative = past). */
function daysUntil(dueIso: string, now: Date): number {
  return Math.round((startOfDay(new Date(dueIso)) - startOfDay(now)) / DAY)
}

/**
 * Which bucket a todo belongs in, relative to `now`.
 *
 * @param treatAsOpen keep a just-checked task (still in its undo grace period) in its
 *   date bucket instead of sinking it to "done", so it collapses in place rather than jumping.
 */
export function bucketOf(todo: Todo, treatAsOpen: boolean, now: Date = new Date()): Bucket {
  if (todo.status === 'done' && !treatAsOpen) return 'done'
  if (!todo.due_at) return 'nodate'
  const days = daysUntil(todo.due_at, now)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 7) return 'week'
  return 'later'
}

/** The live indicators shown in the focus band. Open tasks only — done work isn't pending. */
export interface TriageStats {
  /** open tasks whose deadline has passed */
  overdue: number
  /** open tasks due today */
  dueToday: number
  /** summed effort estimate (minutes) of today's work — overdue + due today */
  estTodayMinutes: number
  /** total open tasks */
  open: number
}

/** Computes the focus-band indicators from the current (already user-scoped) list. */
export function triageStats(todos: Todo[], now: Date = new Date()): TriageStats {
  const s: TriageStats = { overdue: 0, dueToday: 0, estTodayMinutes: 0, open: 0 }
  for (const t of todos) {
    if (t.status !== 'open') continue
    s.open++
    if (!t.due_at) continue
    const days = daysUntil(t.due_at, now)
    if (days < 0) {
      s.overdue++
      s.estTodayMinutes += t.estimate_minutes ?? 0
    } else if (days === 0) {
      s.dueToday++
      s.estTodayMinutes += t.estimate_minutes ?? 0
    }
  }
  return s
}

/** Count of open tasks due on a specific calendar day — powers the rail's week-ahead strip. */
export function openDueOn(todos: Todo[], day: Date): number {
  const target = startOfDay(day)
  return todos.filter((t) => t.status === 'open' && t.due_at && startOfDay(new Date(t.due_at)) === target).length
}
