// ---------------------------------------------------------------------------
// Modal
//
// Shared overlay used by every dialog in the app. Responsibilities:
//
//   - Render a centered panel over a semi-transparent backdrop.
//   - Close on Escape.
//   - Close on backdrop click — but only under a set of deliberately
//     strict guard conditions (see below).
//   - Lock body scrolling while mounted so background content does not
//     drift under the dialog.
//
// The guard pattern (fixes the "Edit button closes the modal" bug):
//
//   Event-target checking alone is not enough. A React state update
//   (e.g. clicking Edit in the card dialog) can re-render the modal
//   content between a pointerdown and its paired pointerup — the
//   pointerup then fires on whatever element sits at those
//   coordinates after the re-render, which may be the backdrop even
//   though the user was clicking a button. We defend against this
//   with two independent signals:
//
//     1. `blockUntilRef` — ANY mousedown on the panel arms a brief
//        300 ms window during which backdrop dismissal is refused.
//        This window always outlasts the synchronous re-render that
//        shuffled the DOM under the cursor, so the follow-up
//        pointerup is ignored.
//     2. `mountedAtRef` — the modal refuses to dismiss for the first
//        300 ms after it opens, as a belt-and-braces guard against
//        "stray first-click" races (popovers opening the modal then
//        firing mouseup on the backdrop, etc.).
//
//   Both guards combine with a final `e.target === e.currentTarget`
//   check so a genuine press-and-release on the bare backdrop still
//   works as expected.
// ---------------------------------------------------------------------------

import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  // Useful for forms: wider than the default 440px when true.
  wide?: boolean
  // When false, the backdrop is purely visual — pressing or releasing
  // on it does not dismiss the modal. Use this for dialogs that may
  // hold unsaved user input (e.g. the full-card read/edit dialog),
  // where an accidental backdrop click should never lose work.
  // Escape-to-close and the explicit Close button still dismiss
  // regardless of this setting. Defaults to true.
  dismissOnBackdrop?: boolean
  // Optional extra controls rendered at the right end of the header,
  // immediately to the LEFT of the close button. Used by CardDialog
  // for its copy-to-clipboard affordance. The Modal is a generic
  // dialog frame, so this stays as a plain ReactNode slot rather than
  // a typed buttons-array — callers style their own buttons to match
  // the close-button styling already inside the header.
  headerActions?: ReactNode
}

// Window during which backdrop dismissal is refused after any
// mousedown inside the modal panel. Long enough to outlast the
// synchronous re-render triggered by a state update; short enough to
// not interfere with deliberate user gestures.
const CLOSE_BLOCK_MS = 300

// Minimum open duration before a backdrop dismissal is honored. Stops
// the modal from closing on the very click that opened it.
const MIN_OPEN_MS = 300

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  dismissOnBackdrop = true,
  headerActions,
}: Props) {
  // Last-mounted-at timestamp. Refreshed each time `open` flips true.
  const mountedAtRef = useRef(0)
  // Timestamp until which backdrop dismissal is blocked.
  const blockUntilRef = useRef(0)

  // Escape-to-close, body-scroll-lock, and mount timestamp are bundled
  // in one effect because they share the "modal is open" lifecycle.
  useEffect(() => {
    if (!open) return

    mountedAtRef.current = Date.now()

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  // Arm the close-block on any mousedown INSIDE the panel. Fires via
  // event bubbling from whichever child was pressed. No-op when
  // backdrop dismissal is disabled — the ref is never read in that
  // mode so there is nothing to update.
  function armBlock() {
    if (!dismissOnBackdrop) return
    blockUntilRef.current = Date.now() + CLOSE_BLOCK_MS
  }

  function handleBackdropMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    // When backdrop dismissal is opted out, the backdrop is decorative
    // only. The user must click the explicit Close button or press
    // Escape to leave.
    if (!dismissOnBackdrop) return
    // Otherwise refuse the dismissal if a recent press inside the
    // panel armed the block window, if we are within the minimum open
    // window, or if the mouseup landed on a descendant rather than
    // the backdrop itself.
    const now = Date.now()
    if (now < blockUntilRef.current) return
    if (now - mountedAtRef.current < MIN_OPEN_MS) return
    if (e.target !== e.currentTarget) return
    onClose()
  }

  return (
    <div
      onMouseUp={handleBackdropMouseUp}
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
    >
      <div
        // Arm the close-block on ANY mousedown inside the panel.
        // Using bubble-phase so the handler fires regardless of which
        // descendant was pressed (buttons, inputs, text, the panel
        // background itself).
        onMouseDown={armBlock}
        className={`relative flex max-h-[90vh] w-full ${
          wide ? 'max-w-2xl' : 'max-w-md'
        } flex-col overflow-hidden rounded-xl bg-[var(--kb-card-bg)] shadow-2xl`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-center justify-between border-b border-[var(--kb-card-border)] px-5 py-3">
          <h2 className="text-base font-semibold text-[var(--kb-text-primary)]">
            {title}
          </h2>
          {/* Right-side header cluster. `headerActions` (if any) sits
              to the LEFT of the close button so the X is always the
              last element — its position stays predictable for users
              who learn the dialog by muscle memory. The cluster spaces
              its children with `gap-1` to match the close button's
              7×7 hit target without crowding. */}
          <div className="flex items-center gap-1">
            {headerActions}
            <button
              onClick={onClose}
              title="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--kb-text-muted)] transition hover:bg-[var(--kb-board-bg)] hover:text-[var(--kb-text-secondary)]"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--kb-card-border)] bg-[var(--kb-sidebar-bg)] px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
