import { useEffect, useRef, useState } from 'react'
import { Search, CornerDownLeft } from 'lucide-react'
import { useTodos } from './hooks'
import type { Todo } from './types'

/**
 * One source of results. Today only the to-dos module fills one; calendar, mail
 * and the rest will add their own, which is why the panel groups by source and
 * always names it ("todo:") instead of showing a flat list. A hit that doesn't
 * say where it lives is only half an answer.
 */
export interface ResultGroup {
  /** Machine name of the module the hits came from. */
  source: string
  /** What the panel prints above the group, e.g. "todo:". */
  label: string
  items: ResultItem[]
}

export interface ResultItem {
  id: number
  title: string
  /** One quiet line of context under the title (notes excerpt, project, …). */
  hint?: string
  onOpen: () => void
}

/** How many hits one module may contribute before the list gets unwieldy. */
const perSourceLimit = 6

/**
 * The top bar's search. Types into one field, answers with hits grouped by the
 * module they live in — the panel is the "where", the rows are the "what".
 *
 * Keyboard: "/" (from the app shell) lands here, arrows walk the flattened hits,
 * Enter opens the highlighted one, Escape clears the term and then closes.
 *
 * @param focusToken bump this to pull focus into the field
 * @param onJumpToTodo called with a task id when a to-do hit is chosen
 */
export function GlobalSearch({ focusToken, onJumpToTodo }: { focusToken: number; onJumpToTodo: (id: number) => void }) {
  const [term, setTerm] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Settle the term before asking the backend: one request per pause, not per key.
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(term.trim()), 200)
    return () => window.clearTimeout(id)
  }, [term])

  useEffect(() => {
    if (focusToken > 0) inputRef.current?.focus()
  }, [focusToken])

  // The to-dos source. `enabled` keeps it quiet until there's something to search
  // for, so an idle field costs nothing.
  const todoHits = useTodos(undefined, query || undefined, { enabled: query !== '' })
  const groups: ResultGroup[] = []
  if (query !== '') {
    const items = (todoHits.data ?? []).slice(0, perSourceLimit).map((t: Todo) => ({
      id: t.id,
      title: t.title,
      hint: matchHint(t, query),
      onOpen: () => {
        onJumpToTodo(t.id)
        close()
      },
    }))
    if (items.length > 0) groups.push({ source: 'todo', label: 'todo:', items })
  }
  const flat = groups.flatMap((g) => g.items)

  function close() {
    setOpen(false)
    setActive(0)
  }

  // Clicking outside puts the panel away but keeps the term — coming back to a
  // search you were in the middle of shouldn't mean typing it again.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const showPanel = open && query !== ''
  const hasResults = flat.length > 0

  return (
    <div className="search-wrap" ref={rootRef}>
      <label className="search">
        <Search size={16} aria-hidden />
        <input
          ref={inputRef}
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && hasResults) {
              e.preventDefault()
              setActive((i) => (i + 1) % flat.length)
            } else if (e.key === 'ArrowUp' && hasResults) {
              e.preventDefault()
              setActive((i) => (i - 1 + flat.length) % flat.length)
            } else if (e.key === 'Enter' && hasResults) {
              e.preventDefault()
              flat[active]?.onOpen()
            } else if (e.key === 'Escape') {
              if (term !== '') {
                setTerm('')
                setQuery('')
              } else {
                inputRef.current?.blur()
              }
              close()
            }
          }}
          placeholder="search"
          aria-label="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="search-results"
          aria-autocomplete="list"
        />
        <kbd className="kbd search__kbd" aria-hidden>
          /
        </kbd>
      </label>

      {showPanel && (
        <div className="search-results" id="search-results" role="listbox" aria-label="search results">
          {todoHits.isPending && !hasResults && <p className="search-results__note">searching…</p>}
          {!todoHits.isPending && !hasResults && <p className="search-results__note">nothing matches “{query}”.</p>}
          {groups.map((group) => (
            <section key={group.source} className="search-group">
              {/* the "where": every hit is labelled with the module it came from */}
              <p className="search-group__label">{group.label}</p>
              {group.items.map((item) => {
                const index = flat.indexOf(item)
                return (
                  <button
                    key={`${group.source}-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className={`search-hit${index === active ? ' is-active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={item.onOpen}
                  >
                    <span className="search-hit__text">
                      <span className="search-hit__title">{item.title}</span>
                      {item.hint && <span className="search-hit__hint">{item.hint}</span>}
                    </span>
                    <CornerDownLeft size={13} className="search-hit__enter" aria-hidden />
                  </button>
                )
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Why this task matched, when the answer isn't the title: a short excerpt of the
 * notes around the term. Titles speak for themselves, so they get no hint.
 *
 * @returns the excerpt, or undefined when the title already carries the match
 */
function matchHint(todo: Todo, query: string): string | undefined {
  const q = query.toLowerCase()
  if (todo.title.toLowerCase().includes(q)) return undefined
  const notes = todo.notes ?? ''
  const at = notes.toLowerCase().indexOf(q)
  if (at === -1) return undefined
  const from = Math.max(0, at - 24)
  const excerpt = notes.slice(from, at + query.length + 36).replace(/\s+/g, ' ').trim()
  return `${from > 0 ? '…' : ''}${excerpt}${at + query.length + 36 < notes.length ? '…' : ''}`
}
