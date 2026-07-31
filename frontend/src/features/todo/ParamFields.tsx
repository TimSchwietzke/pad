import { useEffect, useRef, useState } from 'react'
import type { ComponentPropsWithRef, ReactNode } from 'react'
import {
  Calendar as CalIcon,
  Check as CheckIcon,
  Clock as ClockIcon,
  Flag as FlagIcon,
  Folder as FolderIcon,
  Repeat as RepeatIcon,
  Tag as TagIcon,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Priority, Project, Recurrence, RecurrenceFreq, Tag } from './types'
import { formatDue, formatEstimate, formatRecurrence, priorityLabel, weekdayOrder, weekdayShort } from './format'

// field icons — lucide, sized down for the small chips
const Folder = () => <FolderIcon size={14} />
const Flag = () => <FlagIcon size={14} />
const Clock = () => <ClockIcon size={14} />
const Cal = () => <CalIcon size={14} />

/**
 * The clickable chip that triggers a field's menu. Placeholder when unset.
 * Extra props (click handler, aria-expanded, data-state, ref …) come from the
 * Radix `PopoverTrigger asChild` and are spread onto the button.
 */
function Chip({
  icon,
  label,
  placeholder,
  set,
  danger,
  ...rest
}: {
  icon: ReactNode
  label: string | null
  placeholder: string
  set: boolean
  danger?: boolean
} & ComponentPropsWithRef<'button'>) {
  return (
    <button
      type="button"
      className={`chip${set ? ' is-set' : ''}${danger ? ' is-danger' : ''}`}
      aria-label={set ? `${placeholder}: ${label}` : `set ${placeholder}`}
      {...rest}
    >
      <span className="chip__icon">{icon}</span>
      <span className="chip__label">{set ? label : placeholder}</span>
    </button>
  )
}

/**
 * The floating panel of a field: Radix handles anchoring, portal, outside-click
 * and Escape; the `.popover` class keeps the token styling AND the create bar's
 * "click inside a menu isn't outside" check working (it matches `.popover`).
 * Radix's own auto-focus is disabled so the Menu can focus its first item.
 */
function FieldMenu({ children }: { children: ReactNode }) {
  return (
    <PopoverContent className="popover w-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
      <Menu>{children}</Menu>
    </PopoverContent>
  )
}

/** A menu of options with arrow-key roving focus. */
function Menu({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-menuitem]')?.focus()
  }, [])
  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        const items = [...(ref.current?.querySelectorAll<HTMLElement>('[data-menuitem]') ?? [])]
        if (items.length === 0) return
        e.preventDefault()
        const i = items.indexOf(document.activeElement as HTMLElement)
        const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
        items[next]?.focus()
      }}
    >
      {children}
    </div>
  )
}

function MenuItem({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="menuitem" data-menuitem className={`menu-item${active ? ' is-active' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

/** project picker — the user's projects plus a clear option. */
export function ProjectField({
  value,
  onChange,
  projects,
}: {
  value: number | null
  onChange: (v: number | null) => void
  projects: Project[]
}) {
  const [open, setOpen] = useState(false)
  const current = projects.find((p) => p.id === value)
  const pick = (v: number | null) => {
    onChange(v)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip
          icon={current ? <span className="dot" style={{ background: current.color || 'var(--color-text-secondary)' }} /> : <Folder />}
          label={current?.name ?? null}
          placeholder="project"
          set={value != null}
        />
      </PopoverTrigger>
      <FieldMenu>
        <MenuItem active={value == null} onClick={() => pick(null)}>
          no project
        </MenuItem>
        {projects.map((p) => (
          <MenuItem key={p.id} active={p.id === value} onClick={() => pick(p.id)}>
            <span className="dot" style={{ background: p.color || 'var(--color-text-secondary)' }} />
            {p.name}
          </MenuItem>
        ))}
        {projects.length === 0 && <p className="menu-empty">no projects yet</p>}
      </FieldMenu>
    </Popover>
  )
}

const PRIORITIES: Priority[] = [3, 2, 1, 0]

/** priority picker — none / low / medium / high. */
export function PriorityField({ value, onChange }: { value: Priority; onChange: (v: Priority) => void }) {
  const [open, setOpen] = useState(false)
  const pick = (v: Priority) => {
    onChange(v)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip icon={<Flag />} label={value !== 0 ? priorityLabel[value] : null} placeholder="priority" set={value !== 0} />
      </PopoverTrigger>
      <FieldMenu>
        {PRIORITIES.map((p) => (
          <MenuItem key={p} active={p === value} onClick={() => pick(p)}>
            {p === 0 ? 'none' : priorityLabel[p]}
          </MenuItem>
        ))}
      </FieldMenu>
    </Popover>
  )
}

const EFFORT_PRESETS = [15, 30, 45, 60, 90, 120]

/** effort picker — minute presets plus a free numeric input. */
export function EffortField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const pick = (v: number | null) => {
    onChange(v)
    setOpen(false)
  }
  const applyDraft = () => {
    const n = Number(draft)
    if (Number.isFinite(n) && n > 0) pick(Math.round(n))
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(value != null ? String(value) : '')
        setOpen(o)
      }}
    >
      <PopoverTrigger asChild>
        <Chip icon={<Clock />} label={formatEstimate(value)} placeholder="effort" set={value != null} />
      </PopoverTrigger>
      <FieldMenu>
        {EFFORT_PRESETS.map((m) => (
          <MenuItem key={m} active={m === value} onClick={() => pick(m)}>
            {formatEstimate(m)}
          </MenuItem>
        ))}
        {value != null && (
          <MenuItem onClick={() => pick(null)}>
            <span className="menu-item__muted">clear</span>
          </MenuItem>
        )}
        <div className="menu-input">
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={draft}
            placeholder="minutes…"
            aria-label="effort in minutes"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyDraft()
              }
            }}
          />
          <button type="button" className="menu-input__apply" onClick={applyDraft}>
            set
          </button>
        </div>
      </FieldMenu>
    </Popover>
  )
}

// --- due date presets ------------------------------------------------------
const atMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return atMidnight(d)
}
const thisWeekend = () => {
  const d = new Date()
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7)) // upcoming Saturday
  return atMidnight(d)
}
const nextWeek = () => {
  const d = new Date()
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)) // next Monday
  return atMidnight(d)
}
const toDateInput = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** due-date picker — quick presets plus a native date input. */
export function DueField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const due = formatDue(value)
  const pick = (v: string | null) => {
    onChange(v)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip icon={<Cal />} label={due?.label ?? null} placeholder="due" set={value != null} danger={due?.overdue} />
      </PopoverTrigger>
      <FieldMenu>
        <MenuItem onClick={() => pick(inDays(0))}>today</MenuItem>
        <MenuItem onClick={() => pick(inDays(1))}>tomorrow</MenuItem>
        <MenuItem onClick={() => pick(thisWeekend())}>this weekend</MenuItem>
        <MenuItem onClick={() => pick(nextWeek())}>next week</MenuItem>
        {value != null && (
          <MenuItem onClick={() => pick(null)}>
            <span className="menu-item__muted">clear</span>
          </MenuItem>
        )}
        <div className="menu-input">
          <input
            type="date"
            value={value ? toDateInput(value) : ''}
            aria-label="due date"
            onChange={(e) => {
              const v = e.target.value
              if (!v) return pick(null)
              const [y, m, d] = v.split('-').map(Number)
              pick(new Date(y, m - 1, d).toISOString())
            }}
          />
        </div>
      </FieldMenu>
    </Popover>
  )
}

// The cadences offered as one click. Anything else (every 3 days, every 6 months)
// comes from the interval input below them.
const REPEAT_PRESETS: Recurrence[] = [
  { freq: 'daily', interval: 1 },
  { freq: 'weekly', interval: 1 },
  { freq: 'weekly', interval: 2 },
  { freq: 'monthly', interval: 1 },
  { freq: 'yearly', interval: 1 },
]

const REPEAT_UNITS: RecurrenceFreq[] = ['daily', 'weekly', 'monthly', 'yearly']

/**
 * repeat picker — the common cadences plus a free "every N <unit>" row. Setting a
 * rule doesn't change anything on its own; it takes effect when the task is checked
 * done, which is when the next occurrence appears (the backend spawns it).
 */
export function RepeatField({ value, onChange }: { value: Recurrence | null; onChange: (v: Recurrence | null) => void }) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState('')
  const [unit, setUnit] = useState<RecurrenceFreq>('weekly')
  const days = value?.weekdays ?? []
  const same = (a: Recurrence, b: Recurrence | null) =>
    !!b && a.freq === b.freq && a.interval === b.interval && (b.weekdays ?? []).length === 0
  const pick = (v: Recurrence | null) => {
    onChange(v)
    setOpen(false)
  }
  const applyCustom = () => {
    const n = Number(count)
    if (Number.isFinite(n) && n >= 1) pick({ ...(value ?? {}), freq: unit, interval: Math.round(n), weekdays: unit === 'weekly' ? days : [] })
  }

  /**
   * Toggling a weekday keeps the menu open — picking "mon + thu" is one thought,
   * not two visits. A rule pinned to days is weekly by definition, so the first
   * day also switches the cadence over.
   */
  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b)
    const base: Recurrence = value ?? { freq: 'weekly', interval: 1 }
    onChange({ ...base, freq: 'weekly', weekdays: next })
  }

  /** Series end: never / on a date / after n more occurrences — mutually exclusive. */
  const setEnd = (patch: Pick<Recurrence, 'until' | 'count'>) => {
    if (!value) return
    onChange({ ...value, until: null, count: null, ...patch })
  }
  const endMode = value?.until != null ? 'date' : value?.count != null ? 'count' : 'never'
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        // seed the custom row from the current rule, so tweaking it starts where you are
        if (o) {
          setCount(value ? String(value.interval) : '')
          setUnit(value?.freq ?? 'weekly')
        }
        setOpen(o)
      }}
    >
      <PopoverTrigger asChild>
        <Chip icon={<RepeatIcon size={14} />} label={formatRecurrence(value)} placeholder="repeat" set={value != null} />
      </PopoverTrigger>
      <FieldMenu>
        {REPEAT_PRESETS.map((r) => (
          <MenuItem key={`${r.freq}-${r.interval}`} active={same(r, value)} onClick={() => pick(r)}>
            {formatRecurrence(r)}
          </MenuItem>
        ))}
        {value != null && (
          <MenuItem onClick={() => pick(null)}>
            <span className="menu-item__muted">doesn’t repeat</span>
          </MenuItem>
        )}

        {/* weekday rule — picking days is what makes a weekly cadence concrete */}
        <div className="menu-section">
          <span className="menu-section__label">on these days</span>
          <div className="day-row">
            {weekdayOrder.map((d) => (
              <button
                key={d}
                type="button"
                className={`day${days.includes(d) ? ' is-on' : ''}`}
                aria-pressed={days.includes(d)}
                aria-label={weekdayShort[d]}
                onClick={() => toggleDay(d)}
              >
                {weekdayShort[d].slice(0, 2)}
              </button>
            ))}
          </div>
        </div>

        <div className="menu-input">
          <span className="menu-input__prefix">every</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={count}
            placeholder="2"
            aria-label="repeat interval"
            onChange={(e) => setCount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyCustom()
              }
            }}
          />
          <select aria-label="repeat unit" value={unit} onChange={(e) => setUnit(e.target.value as RecurrenceFreq)}>
            {REPEAT_UNITS.map((u) => (
              <option key={u} value={u}>
                {freqUnitLabel[u]}
              </option>
            ))}
          </select>
          <button type="button" className="menu-input__apply" onClick={applyCustom}>
            set
          </button>
        </div>

        {/* where the series stops — only worth showing once there is a series */}
        {value != null && (
          <div className="menu-section">
            <span className="menu-section__label">ends</span>
            <div className="day-row">
              <button
                type="button"
                className={`day day--wide${endMode === 'never' ? ' is-on' : ''}`}
                aria-pressed={endMode === 'never'}
                onClick={() => setEnd({ until: null, count: null })}
              >
                never
              </button>
              <button
                type="button"
                className={`day day--wide${endMode === 'date' ? ' is-on' : ''}`}
                aria-pressed={endMode === 'date'}
                onClick={() => setEnd({ until: defaultEndDate() })}
              >
                on date
              </button>
              <button
                type="button"
                className={`day day--wide${endMode === 'count' ? ' is-on' : ''}`}
                aria-pressed={endMode === 'count'}
                onClick={() => setEnd({ count: 5 })}
              >
                after n
              </button>
            </div>
            {endMode === 'date' && (
              <input
                type="date"
                className="menu-section__input"
                aria-label="repeat until"
                value={value.until ? toDateInput(value.until) : ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) return setEnd({ until: null, count: null })
                  const [y, m, d] = v.split('-').map(Number)
                  setEnd({ until: new Date(y, m - 1, d).toISOString() })
                }}
              />
            )}
            {endMode === 'count' && (
              <input
                type="number"
                min={1}
                className="menu-section__input"
                aria-label="remaining occurrences"
                value={value.count ?? ''}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setEnd({ count: Number.isFinite(n) && n >= 0 ? Math.round(n) : null })
                }}
              />
            )}
          </div>
        )}
      </FieldMenu>
    </Popover>
  )
}

/** A sensible first end date when the user picks "on date": three months out. */
function defaultEndDate(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 3)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}

// Unit names for the "every N …" select — the noun, not the adverb.
const freqUnitLabel: Record<RecurrenceFreq, string> = {
  daily: 'days',
  weekly: 'weeks',
  monthly: 'months',
  yearly: 'years',
}

/**
 * tags picker — multi-select over the user's tags, with an inline "create tag". Unlike the
 * single-value fields it stays open while toggling, so several tags can be set in one go.
 */
export function TagsField({
  value,
  allTags,
  onToggle,
  onCreate,
}: {
  value: Tag[]
  allTags: Tag[]
  onToggle: (tagId: number, currentlyOn: boolean) => void
  onCreate: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const has = (id: number) => value.some((t) => t.id === id)
  const create = () => {
    const name = draft.trim()
    if (!name) return
    onCreate(name)
    setDraft('')
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip
          icon={<TagIcon size={14} />}
          label={value.length ? value.map((t) => t.name).join(', ') : null}
          placeholder="tags"
          set={value.length > 0}
        />
      </PopoverTrigger>
      <FieldMenu>
        {allTags.map((t) => (
          <MenuItem key={t.id} active={has(t.id)} onClick={() => onToggle(t.id, has(t.id))}>
            <span className="menu-check">{has(t.id) && <CheckIcon size={14} />}</span>#{t.name}
          </MenuItem>
        ))}
        {allTags.length === 0 && <p className="menu-empty">no tags yet</p>}
        <div className="menu-input">
          <input
            value={draft}
            placeholder="new tag…"
            aria-label="new tag"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                create()
              }
            }}
          />
          <button type="button" className="menu-input__apply" onClick={create}>add</button>
        </div>
      </FieldMenu>
    </Popover>
  )
}
