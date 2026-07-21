import { buildMarkdown, exportFields, exportFilename } from './exportMd'
import type { ExportSection } from './exportMd'
import type { Project, Todo } from './types'

/** Minimal todo for export tests; override what a test cares about. */
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
    tags: [],
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...over,
  }
}

const projects: Project[] = [
  { id: 1, name: 'work', color: '#f00', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' },
]

const now = new Date(2026, 6, 21) // 21 jul 2026

describe('buildMarkdown', () => {
  it('renders sections, checkboxes and all chosen fields', () => {
    const sections: ExportSection[] = [
      {
        label: 'overdue',
        todos: [
          makeTodo({
            id: 1,
            title: 'alpha',
            project_id: 1,
            priority: 3,
            estimate_minutes: 90,
            due_at: new Date(2026, 6, 9).toISOString(),
            tags: [{ id: 5, name: 'urgent' }],
          }),
        ],
      },
      { label: 'done', todos: [makeTodo({ id: 2, title: 'beta', status: 'done' })] },
    ]

    const md = buildMarkdown(sections, exportFields, projects, now)

    expect(md).toBe(
      [
        '# to-dos — 21 jul 2026',
        '',
        '## overdue',
        '',
        '- [ ] alpha — work · due 9 jul · high · 1 h 30 min · #urgent',
        '',
        '## done',
        '',
        '- [x] beta',
        '',
      ].join('\n'),
    )
  })

  it('omits fields that are toggled off and values that are unset', () => {
    const sections: ExportSection[] = [
      {
        label: null,
        todos: [makeTodo({ title: 'alpha', project_id: 1, priority: 2, estimate_minutes: 45 })],
      },
    ]

    // only project + priority chosen; effort must not appear even though set
    const md = buildMarkdown(sections, ['project', 'priority'], projects, now)

    expect(md).toContain('- [ ] alpha — work · medium\n')
    expect(md).not.toContain('45 min')
    // a flat list has no section heading
    expect(md).not.toContain('##')
  })

  it('keeps a title-only line clean when nothing is set', () => {
    const md = buildMarkdown([{ label: null, todos: [makeTodo({ title: 'bare' })] }], exportFields, [], now)
    expect(md).toContain('- [ ] bare\n')
    expect(md).not.toContain('bare —')
  })

  it('skips empty sections entirely', () => {
    const md = buildMarkdown(
      [
        { label: 'overdue', todos: [] },
        { label: 'today', todos: [makeTodo({ title: 'alpha' })] },
      ],
      exportFields,
      [],
      now,
    )
    expect(md).not.toContain('## overdue')
    expect(md).toContain('## today')
  })
})

describe('exportFilename', () => {
  it('is dated and zero-padded', () => {
    expect(exportFilename(new Date(2026, 6, 3))).toBe('todos-2026-07-03.md')
  })
})
