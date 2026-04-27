// ---------------------------------------------------------------------------
// useLocalStorage
//
// A typed wrapper around `window.localStorage` that mirrors the `useState`
// API. Values are JSON-serialized so strings, numbers, booleans, arrays,
// and plain objects all round-trip cleanly.
//
// Quirks handled:
//   - If the stored value cannot be parsed (corrupted / older format) we
//     silently fall back to `initialValue`. The app should never crash due
//     to bad cache data.
//   - Write failures (quota exceeded, Safari private browsing) are also
//     swallowed — the user's in-memory state still works, they just lose
//     persistence for this session.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw === null) return initialValue
      return JSON.parse(raw) as T
    } catch {
      return initialValue
    }
  })

  // Persist on every change. We write synchronously here (cheap for the
  // small values we store) so a page refresh immediately sees the latest
  // state.
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // ignore quota / private-mode errors
    }
  }, [key, value])

  // Same update signature as `setState` — callers can pass either a value
  // or an updater function.
  const update = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) =>
      typeof next === 'function' ? (next as (p: T) => T)(prev) : next,
    )
  }, [])

  return [value, update] as const
}
