/** Priority level: 0 none, 1 low, 2 medium, 3 high. */
export type Priority = 0 | 1 | 2 | 3

export type Status = 'open' | 'done'

export interface Project {
  id: number
  name: string
  color: string
  created_at: string
  updated_at: string
}

export interface ProjectInput {
  name: string
  color?: string
}

export interface Todo {
  id: number
  project_id: number | null
  title: string
  notes: string
  priority: Priority
  status: Status
  /** ISO-8601 timestamp, or null when no deadline is set. */
  due_at: string | null
  /** Personal effort estimate in minutes, or null. */
  estimate_minutes: number | null
  /** Rank in the user's manual "custom" order (see the reorder endpoint). */
  position: number
  /** Tags attached to this todo, embedded by the list endpoint (always present). */
  tags: Tag[]
  created_at: string
  updated_at: string
}

export interface TodoInput {
  project_id?: number | null
  title: string
  notes?: string
  priority?: Priority
  status?: Status
  due_at?: string | null
  estimate_minutes?: number | null
}

export interface Tag {
  id: number
  name: string
}
