import { useEffect, useState } from 'react'

/**
 * Like useState, but the value is mirrored to localStorage so it survives reloads.
 * Used for device-level preferences (theme preset, light/dark, list density) — these
 * live per device, so there's no backend involved until real accounts land.
 *
 * @param key      the localStorage key
 * @param fallback the value (or a lazy factory) to use when nothing is stored yet
 */
export function usePersistentState<T>(key: string, fallback: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw != null) return JSON.parse(raw) as T
    } catch {
      // corrupt or unavailable storage — fall back below
    }
    return typeof fallback === 'function' ? (fallback as () => T)() : fallback
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // storage full or blocked — preference just won't persist this time
    }
  }, [key, value])

  return [value, setValue] as const
}
