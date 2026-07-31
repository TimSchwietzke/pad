import type { Project, Todo } from './types'
import { formatDue, formatEstimate, formatRecurrence, priorityLabel } from './format'

/**
 * Markdown export of the visible to-do list. Pure functions only — the share
 * menu (TodoDashboard) collects what's on screen and which fields the user
 * wants, this module turns it into a portable .md string.
 */

/** The optional per-task fields a user can include in the export. */
export type ExportField = 'project' | 'due' | 'priority' | 'effort' | 'repeat' | 'tags'
export const exportFields: ExportField[] = ['project', 'due', 'priority', 'effort', 'repeat', 'tags']

/** One exported group: the visible list's bucket (or null when the list is flat). */
export interface ExportSection {
  label: string | null
  todos: Todo[]
}

/**
 * Renders the sections as GitHub-flavoured markdown: an H1 with the date,
 * one H2 per named section, and a task list with checkboxes. Only the chosen
 * fields are appended (em-dash separated from the title, middot between
 * fields); unset values are skipped entirely so lines stay clean.
 */
export function buildMarkdown(
  sections: ExportSection[],
  fields: ExportField[],
  projects: Project[],
  now: Date = new Date(),
): string {
  const has = (f: ExportField) => fields.includes(f)
  const projectName = (id: number | null) => projects.find((p) => p.id === id)?.name

  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toLowerCase()
  const lines: string[] = [`# to-dos — ${date}`]

  for (const section of sections) {
    if (section.todos.length === 0) continue
    lines.push('')
    if (section.label) {
      lines.push(`## ${section.label}`, '')
    }
    for (const t of section.todos) {
      const parts: string[] = []
      if (has('project')) {
        const name = projectName(t.project_id)
        if (name) parts.push(name)
      }
      if (has('due') && t.due_at) {
        const due = formatDue(t.due_at)
        if (due) parts.push(`due ${due.label}`)
      }
      if (has('priority') && t.priority !== 0) parts.push(priorityLabel[t.priority])
      if (has('effort') && t.estimate_minutes != null) {
        const est = formatEstimate(t.estimate_minutes)
        if (est) parts.push(est)
      }
      if (has('repeat')) {
        const rep = formatRecurrence(t.recurrence)
        if (rep) parts.push(`repeats ${rep}`)
      }
      if (has('tags') && t.tags.length > 0) parts.push(t.tags.map((tag) => `#${tag.name}`).join(' '))

      const box = t.status === 'done' ? '[x]' : '[ ]'
      lines.push(`- ${box} ${t.title}${parts.length > 0 ? ` — ${parts.join(' · ')}` : ''}`)
    }
  }

  return lines.join('\n') + '\n'
}

/** The dated default filename for a download, e.g. `todos-2026-07-21.md`. */
export function exportFilename(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `todos-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.md`
}
