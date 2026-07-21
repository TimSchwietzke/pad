/**
 * A tiny toast store that lives OUTSIDE React, so non-component code — notably
 * the React Query MutationCache — can surface a failure with a single call.
 * <Toaster /> (Toaster.tsx) subscribes and renders; there's no provider to
 * thread through. Intentionally minimal (no queue caps, no actions): the app
 * only needs to tell the user "that didn't save" when a mutation rolls back.
 */

export type ToastVariant = 'error' | 'info'
export interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

let toasts: Toast[] = []
const listeners = new Set<() => void>()
let seq = 1

function emit() {
  // fresh array each change so useSyncExternalStore sees a new reference
  listeners.forEach((l) => l())
}

/** Current toasts — the snapshot for useSyncExternalStore (stable until changed). */
export function getToasts(): Toast[] {
  return toasts
}

export function subscribeToasts(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Show a toast; it auto-dismisses after `ms`. Returns its id (for manual dismiss). */
export function toast(message: string, variant: ToastVariant = 'error', ms = 4000): number {
  const id = seq++
  toasts = [...toasts, { id, message, variant }]
  emit()
  if (ms > 0) window.setTimeout(() => dismissToast(id), ms)
  return id
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

/** For tests only: clear any pending toasts between cases. */
export function resetToasts() {
  toasts = []
  emit()
}
