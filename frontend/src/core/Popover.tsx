import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'

/**
 * A small menu/popover anchored under a trigger element. It renders into a portal
 * with `position: fixed`, so it escapes the to-do list's `overflow: auto` clipping
 * and the stacking context. Closes on Escape, on an outside click, and re-anchors
 * on scroll/resize.
 */
export function Popover({
  anchorRef,
  open,
  onClose,
  labelledBy,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  labelledBy?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Keep the popover glued under its trigger, clamped to the viewport.
  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const a = anchorRef.current
      if (!a) return
      const r = a.getBoundingClientRect()
      const width = ref.current?.offsetWidth ?? 220
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
      setPos({ top: r.bottom + 6, left })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null
  return createPortal(
    <div
      ref={ref}
      className="popover"
      aria-labelledby={labelledBy}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  )
}
