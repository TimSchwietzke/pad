import type { Priority } from './types'

/** Human label for a non-zero priority. */
export const priorityLabel: Record<Exclude<Priority, 0>, string> = { 1: 'low', 2: 'medium', 3: 'high' }

/** Formats an effort estimate in minutes, e.g. 45 -> "45 min", 90 -> "1 h 30 min". */
export function formatEstimate(min: number | null): string | null {
  if (min == null) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Formats a due date relative to today, lowercased ("today", "tomorrow", "12 jul"). */
export function formatDue(iso: string | null): { label: string; overdue: boolean } | null {
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
