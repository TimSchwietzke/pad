import { isBareKey, isTypingTarget, shortcutSections } from './shortcuts'

/** Builds a detached element, optionally wrapped in a container with a role. */
function el(tag: string, wrapperRole?: string): HTMLElement {
  const node = document.createElement(tag)
  if (!wrapperRole) return node
  const wrapper = document.createElement('div')
  wrapper.setAttribute('role', wrapperRole)
  wrapper.appendChild(node)
  return node
}

describe('isTypingTarget', () => {
  it('claims keystrokes that belong to a text field', () => {
    expect(isTypingTarget(el('input'))).toBe(true)
    expect(isTypingTarget(el('textarea'))).toBe(true)

    const editable = el('div')
    editable.contentEditable = 'true'
    // jsdom doesn't derive isContentEditable from the attribute
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(isTypingTarget(editable)).toBe(true)
  })

  it('claims keystrokes inside an open menu or dialog (Radix types ahead there)', () => {
    expect(isTypingTarget(el('button', 'menu'))).toBe(true)
    expect(isTypingTarget(el('button', 'dialog'))).toBe(true)
    expect(isTypingTarget(el('div', 'listbox'))).toBe(true)
  })

  it('leaves ordinary targets to the shortcut layer', () => {
    expect(isTypingTarget(el('button'))).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('isBareKey', () => {
  it('is true without modifiers and false with any of them', () => {
    expect(isBareKey({ metaKey: false, ctrlKey: false, altKey: false } as KeyboardEvent)).toBe(true)
    expect(isBareKey({ metaKey: true, ctrlKey: false, altKey: false } as KeyboardEvent)).toBe(false)
    expect(isBareKey({ metaKey: false, ctrlKey: true, altKey: false } as KeyboardEvent)).toBe(false)
    expect(isBareKey({ metaKey: false, ctrlKey: false, altKey: true } as KeyboardEvent)).toBe(false)
  })
})

describe('shortcutSections', () => {
  it('documents every global key the view listens for', () => {
    const keys = shortcutSections.flatMap((s) => s.items.flatMap((i) => i.keys))
    expect(keys).toEqual(expect.arrayContaining(['c', 'b', '?', 'esc']))
  })
})
