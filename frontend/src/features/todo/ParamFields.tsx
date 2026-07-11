import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import {
  Calendar as CalIcon,
  Check as CheckIcon,
  Clock as ClockIcon,
  Flag as FlagIcon,
  Folder as FolderIcon,
  Tag as TagIcon,
} from 'lucide-react'
import { Popover } from '../../core/Popover'
import type { Priority, Project, Tag } from './types'
import { formatDue, formatEstimate, priorityLabel } from './format'

// field icons — lucide, sized down for the small chips
const Folder = () => <FolderIcon size={14} />
const Flag = () => <FlagIcon size={14} />
const Clock = () => <ClockIcon size={14} />
const Cal = () => <CalIcon size={14} />

/** Manages a field's open state and the trigger ref shared with its Popover. */
function useField() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return { open, setOpen, ref }
}

/** The clickable chip that triggers a field's menu. Placeholder when unset. */
function Chip({
  icon,
  label,
  placeholder,
  set,
  danger,
  triggerRef,
  onClick,
  expanded,
}: {
  icon: ReactNode
  label: string | null
  placeholder: string
  set: boolean
  danger?: boolean
  triggerRef: RefObject<HTMLButtonElement | null>
  onClick: () => void
  expanded: boolean
}) {
  return (
    <button
      ref={triggerRef}
      type="button"
      className={`chip${set ? ' is-set' : ''}${danger ? ' is-danger' : ''}`}
      aria-haspopup="menu"
      aria-expanded={expanded}
      aria-label={set ? `${placeholder}: ${label}` : `set ${placeholder}`}
      onClick={onClick}
    >
      <span className="chip__icon">{icon}</span>
      <span className="chip__label">{set ? label : placeholder}</span>
    </button>
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
  const f = useField()
  const current = projects.find((p) => p.id === value)
  const pick = (v: number | null) => {
    onChange(v)
    f.setOpen(false)
  }
  return (
    <>
      <Chip
        icon={current ? <span className="dot" style={{ background: current.color || 'var(--color-text-secondary)' }} /> : <Folder />}
        label={current?.name ?? null}
        placeholder="project"
        set={value != null}
        triggerRef={f.ref}
        expanded={f.open}
        onClick={() => f.setOpen((o) => !o)}
      />
      <Popover anchorRef={f.ref} open={f.open} onClose={() => f.setOpen(false)}>
        <Menu>
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
        </Menu>
      </Popover>
    </>
  )
}

const PRIORITIES: Priority[] = [3, 2, 1, 0]

/** priority picker — none / low / medium / high. */
export function PriorityField({ value, onChange }: { value: Priority; onChange: (v: Priority) => void }) {
  const f = useField()
  const pick = (v: Priority) => {
    onChange(v)
    f.setOpen(false)
  }
  return (
    <>
      <Chip
        icon={<Flag />}
        label={value !== 0 ? priorityLabel[value] : null}
        placeholder="priority"
        set={value !== 0}
        triggerRef={f.ref}
        expanded={f.open}
        onClick={() => f.setOpen((o) => !o)}
      />
      <Popover anchorRef={f.ref} open={f.open} onClose={() => f.setOpen(false)}>
        <Menu>
          {PRIORITIES.map((p) => (
            <MenuItem key={p} active={p === value} onClick={() => pick(p)}>
              {p === 0 ? 'none' : priorityLabel[p]}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </>
  )
}

const EFFORT_PRESETS = [15, 30, 45, 60, 90, 120]

/** effort picker — minute presets plus a free numeric input. */
export function EffortField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const f = useField()
  const [draft, setDraft] = useState('')
  const pick = (v: number | null) => {
    onChange(v)
    f.setOpen(false)
  }
  const applyDraft = () => {
    const n = Number(draft)
    if (Number.isFinite(n) && n > 0) pick(Math.round(n))
  }
  return (
    <>
      <Chip
        icon={<Clock />}
        label={formatEstimate(value)}
        placeholder="effort"
        set={value != null}
        triggerRef={f.ref}
        expanded={f.open}
        onClick={() => {
          setDraft(value != null ? String(value) : '')
          f.setOpen((o) => !o)
        }}
      />
      <Popover anchorRef={f.ref} open={f.open} onClose={() => f.setOpen(false)}>
        <Menu>
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
        </Menu>
      </Popover>
    </>
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
  const f = useField()
  const due = formatDue(value)
  const pick = (v: string | null) => {
    onChange(v)
    f.setOpen(false)
  }
  return (
    <>
      <Chip
        icon={<Cal />}
        label={due?.label ?? null}
        placeholder="due"
        set={value != null}
        danger={due?.overdue}
        triggerRef={f.ref}
        expanded={f.open}
        onClick={() => f.setOpen((o) => !o)}
      />
      <Popover anchorRef={f.ref} open={f.open} onClose={() => f.setOpen(false)}>
        <Menu>
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
        </Menu>
      </Popover>
    </>
  )
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
  const f = useField()
  const [draft, setDraft] = useState('')
  const has = (id: number) => value.some((t) => t.id === id)
  const create = () => {
    const name = draft.trim()
    if (!name) return
    onCreate(name)
    setDraft('')
  }
  return (
    <>
      <Chip
        icon={<TagIcon size={14} />}
        label={value.length ? value.map((t) => t.name).join(', ') : null}
        placeholder="tags"
        set={value.length > 0}
        triggerRef={f.ref}
        expanded={f.open}
        onClick={() => f.setOpen((o) => !o)}
      />
      <Popover anchorRef={f.ref} open={f.open} onClose={() => f.setOpen(false)}>
        <Menu>
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
        </Menu>
      </Popover>
    </>
  )
}
