import type { Project, Todo } from './types'
import { priorityLabel } from './format'
import { bucketLabel, bucketOf, bucketOrder } from './triage'

/**
 * Grouping is the list's third axis, next to sort (order within a list) and density
 * (how tight rows are). The date buckets used to be hard-wired as the list's spine;
 * they are now just one of several axes the user can pick from the control bar.
 *
 * Everything here is pure so the dashboard only has to render what it gets back.
 */
export type GroupKey = 'none' | 'date' | 'project' | 'priority'

export const groupKeys: GroupKey[] = ['none', 'date', 'project', 'priority']

/** Short hint per axis, shown next to the option in the group menu. */
export const groupHint: Record<GroupKey, string> = {
  none: 'one flat list',
  date: 'by deadline',
  project: 'one list per project',
  priority: 'highest first',
}

/**
 * A rendered group: the todos plus what the header needs. `tone` colours the two
 * urgent date buckets (and nothing else, so the accent keeps meaning); `color` is
 * the project dot.
 */
export interface Group {
  /** Stable key for React and for telling neighbouring rows apart. */
  id: string
  label: string
  tone?: 'danger' | 'accent'
  color?: string
  todos: Todo[]
}

/** What grouping needs from the surrounding view beyond the todos themselves. */
export interface GroupContext {
  projects: Project[]
  /** True while a just-checked task sits in its undo grace period — it stays put. */
  isLeaving?: (id: number) => boolean
  now?: Date
}

/** Priorities from high to none — the order the priority axis lists its groups in. */
const priorityOrder = [3, 2, 1, 0] as const

/**
 * Splits the visible todos into groups along `key`, keeping the incoming order
 * (i.e. the chosen sort) inside each group.
 *
 * Finished work sinks into a trailing "done" group — but only while the list
 * actually mixes open and done tasks. Filtering *for* done tasks would otherwise
 * collapse everything into a single useless group, so in that case the done tasks
 * are grouped along the chosen axis like any other.
 *
 * @returns the non-empty groups, in display order. Grouping by "none" yields a
 *   single unlabelled group, which the caller renders without a header.
 */
export function groupTodos(todos: Todo[], key: GroupKey, ctx: GroupContext): Group[] {
  const leaving = (t: Todo) => ctx.isLeaving?.(t.id) ?? false
  const isDone = (t: Todo) => t.status === 'done' && !leaving(t)

  if (key === 'none') return todos.length > 0 ? [{ id: 'all', label: '', todos: [...todos] }] : []

  const segregateDone = todos.some(isDone) && todos.some((t) => !isDone(t))
  const done: Todo[] = []
  const rest: Todo[] = []
  for (const t of todos) (segregateDone && isDone(t) ? done : rest).push(t)

  const groups = key === 'date' ? byDate(rest, ctx) : key === 'project' ? byProject(rest, ctx) : byPriority(rest)
  if (done.length > 0) groups.push({ id: 'done', label: bucketLabel.done, todos: done })
  return groups.filter((g) => g.todos.length > 0)
}

/** Buckets by time to deadline — the original spine, now one axis among several. */
function byDate(todos: Todo[], ctx: GroupContext): Group[] {
  const by = bucket(todos, (t) => bucketOf(t, true, ctx.now))
  return bucketOrder.map((b) => ({
    id: `date:${b}`,
    label: bucketLabel[b],
    tone: b === 'overdue' ? ('danger' as const) : b === 'today' ? ('accent' as const) : undefined,
    todos: by.get(b) ?? [],
  }))
}

/** One list per project, in the order the projects come back; unassigned tasks last. */
function byProject(todos: Todo[], ctx: GroupContext): Group[] {
  const by = bucket(todos, (t) => t.project_id)
  const groups: Group[] = ctx.projects.map((p) => ({
    id: `project:${p.id}`,
    label: p.name,
    color: p.color || undefined,
    todos: by.get(p.id) ?? [],
  }))
  // tasks whose project was deleted meanwhile land here too, which is where they belong
  const known = new Set(ctx.projects.map((p) => p.id))
  const loose = todos.filter((t) => t.project_id == null || !known.has(t.project_id))
  groups.push({ id: 'project:none', label: 'no project', todos: loose })
  return groups
}

/** high → medium → low → none. "none" is a real group, not a leftover bin. */
function byPriority(todos: Todo[]): Group[] {
  const by = bucket(todos, (t) => t.priority)
  return priorityOrder.map((p) => ({
    id: `priority:${p}`,
    label: p === 0 ? 'no priority' : priorityLabel[p],
    todos: by.get(p) ?? [],
  }))
}

/** Groups items by a key while preserving their incoming order. */
function bucket<K>(todos: Todo[], keyOf: (t: Todo) => K): Map<K, Todo[]> {
  const map = new Map<K, Todo[]>()
  for (const t of todos) {
    const k = keyOf(t)
    const arr = map.get(k)
    if (arr) arr.push(t)
    else map.set(k, [t])
  }
  return map
}
