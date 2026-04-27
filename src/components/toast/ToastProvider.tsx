// ---------------------------------------------------------------------------
// Toast notification system
//
// A lightweight, context-based toast stack rendered in the top-right
// corner. Each toast auto-dismisses after 4 seconds (spec). Any part of
// the component tree can call `useToast().push(message, tone?)` to fire
// one — the provider takes care of queuing, rendering, and cleanup.
//
// Why context rather than a module-level store (like a singleton
// emitter)?
//   - Context gives us a clean test/override story: render the tree
//     without the provider and the hook is a no-op; render with a mock
//     provider to capture messages.
//   - The toast container is rendered as a sibling of `children` so it
//     naturally sits above the rest of the app and is unaffected by
//     overflow / transform cages higher up the tree.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ToastTone = 'info' | 'success' | 'error'

interface Toast {
  id: string
  message: string
  tone: ToastTone
}

interface ToastContextValue {
  push: (message: string, tone?: ToastTone) => void
}

// Default context value is a no-op so components can safely call
// `useToast().push(...)` even before the provider is mounted (e.g. in
// the middle of a test). The provider below replaces this with the real
// value.
const ToastContext = createContext<ToastContextValue>({
  push: () => undefined,
})

const DISMISS_MS = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  // Outstanding auto-dismiss timer handles. Tracked so we can clear
  // every pending timeout if the provider unmounts (e.g. test
  // teardown, HMR reload). Without this, a fired timeout would call
  // `setToasts` on an unmounted component — silent under React 18,
  // but a leak the moment the provider becomes conditionally
  // mounted.
  const timers = useRef<Set<number>>(new Set())

  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = genId()
    setToasts((t) => [...t, { id, message, tone }])
    // Schedule removal. The timeout captures `id` so it always removes
    // the correct toast, even if many are queued rapidly. The handle
    // is tracked in `timers` and removed both on natural fire (so the
    // set does not grow unbounded) and on unmount (so no stray timer
    // fires after the provider is gone).
    const handle = window.setTimeout(() => {
      timers.current.delete(handle)
      setToasts((t) => t.filter((x) => x.id !== id))
    }, DISMISS_MS)
    timers.current.add(handle)
  }, [])

  // Clear every pending auto-dismiss timer on unmount. The cleanup
  // captures `timers.current` at unmount time — the ref itself never
  // changes identity, so a stale-closure read is impossible here.
  useEffect(() => {
    return () => {
      timers.current.forEach((handle) => window.clearTimeout(handle))
      timers.current.clear()
    }
  }, [])

  // Memoize the context value so consumers only re-render when `push`
  // changes — which is never, since the callback is stable.
  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem
            key={t.id}
            toast={t}
            onDismiss={() =>
              setToasts((arr) => arr.filter((x) => x.id !== t.id))
            }
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/**
 * Hook for any component in the tree to push a toast. Returns a stable
 * object — safe to put in effect dependency arrays.
 */
export function useToast() {
  return useContext(ToastContext)
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: () => void
}) {
  // Trigger a subtle entrance animation by flipping `visible` on mount.
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const bg =
    toast.tone === 'error'
      ? 'bg-red-600'
      : toast.tone === 'success'
        ? 'bg-emerald-600'
        : 'bg-slate-800'

  return (
    <div
      className={`pointer-events-auto max-w-sm rounded-md px-3 py-2 text-sm text-white shadow-lg transition-all ${bg} ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'
      }`}
      role="status"
    >
      <div className="flex items-start gap-3">
        <span className="flex-1">{toast.message}</span>
        <button
          onClick={onDismiss}
          className="text-white/70 hover:text-white"
          title="Dismiss"
          aria-label="Dismiss toast"
        >
          ×
        </button>
      </div>
    </div>
  )
}

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}
