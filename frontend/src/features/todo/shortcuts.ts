/**
 * The keyboard layer of the to-dos view: the guard that decides when a bare
 * letter is a shortcut, and the table the help sheet renders.
 *
 * The table is data, not decoration — every line here is a key that actually
 * works. A help sheet that lists aspirations is worse than none.
 */

/**
 * True when a keystroke belongs to whatever the user is currently in, not to
 * the app. Text fields are the obvious case; menus and dialogs matter just as
 * much because Radix uses printable keys for its own typeahead, and a bare "c"
 * would otherwise fire a shortcut behind the open menu.
 *
 * @param target the event's target (`e.target`)
 * @returns whether the key should be left alone
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return true
  return el.closest('[role="menu"], [role="dialog"], [role="listbox"]') != null
}

/**
 * True for a plain keypress — no modifier held. Modifier combos belong to the
 * browser and the OS; pad never steals them.
 */
export function isBareKey(e: KeyboardEvent): boolean {
  return !e.metaKey && !e.ctrlKey && !e.altKey
}

/** One row in the help sheet: the keys, and what they do in the user's words. */
export interface Shortcut {
  /** Rendered as separate caps; a "+" between them means "at the same time". */
  keys: string[]
  what: string
}

export interface ShortcutSection {
  title: string
  items: Shortcut[]
}

/**
 * Everything the to-dos view answers to, grouped by where it applies. Keys are
 * lowercase like the rest of the UI copy — they're typed, not shouted.
 */
export const shortcutSections: ShortcutSection[] = [
  {
    title: 'anywhere',
    items: [
      { keys: ['c'], what: 'start a new task' },
      { keys: ['b'], what: 'show or hide the sidebar' },
      { keys: ['?'], what: 'open this sheet' },
      { keys: ['esc'], what: "close what's open" },
    ],
  },
  {
    title: 'a task',
    items: [
      { keys: ['tab'], what: 'step through the tasks and their fields' },
      { keys: ['enter'], what: "open what's focused — the task, a field, the menu" },
      { keys: ['space'], what: 'tick off the focused task' },
      { keys: ['↑', '↓'], what: 'in the task menu: move the task up or down' },
    ],
  },
]
