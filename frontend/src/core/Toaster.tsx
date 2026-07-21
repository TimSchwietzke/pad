import { useSyncExternalStore } from 'react'
import { dismissToast, getToasts, subscribeToasts } from './toast'

/**
 * Renders the live toast stack in a fixed corner. Mount once near the app root.
 * Each toast is an aria-live status so screen readers announce failures too.
 */
export function Toaster() {
  const items = useSyncExternalStore(subscribeToasts, getToasts, getToasts)
  if (items.length === 0) return null
  return (
    <div className="toaster" role="region" aria-label="notifications">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.variant}`} role="status" aria-live="polite">
          <span className="toast__msg">{t.message}</span>
          <button type="button" className="toast__x" aria-label="dismiss" onClick={() => dismissToast(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
