// ---------------------------------------------------------------------------
// CardDialog
//
// Full card modal opened when the user clicks a card's title or the
// "View full card" link in the inline expand. Two modes within the
// same modal frame:
//
//   - Read mode (default): every field rendered as a labeled row.
//     Compact, easy to scan. An Edit button in the footer flips to
//     edit mode.
//
//   - Edit mode: all fields become editable (via the shared CardForm),
//     including the column — so this is also how you move a card
//     between columns from the dialog. Save writes to Firestore and
//     flips back to read mode; Cancel discards and flips back.
//
// Close / ESC always exits the whole dialog regardless of mode.
// Changes are discarded if the user closes while editing — we do not
// prompt, because a personal app is not a good place to fight the
// user.
//
// ---------------------------------------------------------------------------
// Mount invariant: the Modal's lifecycle is owned by App.tsx alone.
//
//   Earlier versions of this component had an early `if (!card ||
//   !project) return null` that ran BEFORE the Modal was rendered.
//   When `card` transiently resolved to null for a single frame during
//   a Firestore snapshot re-render, the whole component (including
//   the Modal) unmounted — producing the "Edit click closes the
//   dialog" flash.
//
//   The rule now: nothing in CardDialog returns null above the Modal.
//   The Modal is always rendered when `open` is true. Its children —
//   and its footer — handle the transient null case gracefully by
//   showing a small loading state and hiding the mode-specific
//   buttons. This guarantees that CardDialog cannot ever yank the
//   Modal out from under itself.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../modals/Modal'
import { CardForm, type CardFormValues } from '../modals/CardForm'
import { deleteCard, updateCard } from '../../lib/firestore'
import { formatDateLong } from '../../lib/dateUtils'
import { cardToClipboardMarkdown } from '../../lib/cardExport'
import type { Card, Column, Project } from '../../types'
import { useToast } from '../toast/ToastProvider'

interface Props {
  open: boolean
  onClose: () => void
  card: Card | null
  project: Project | null
  allCards: Card[]
  // Uid of the signed-in user. Used to gate the read-mode Delete
  // button: only the card creator and the project owner see it.
  // Members on a shared board who did not author the card get no
  // delete affordance — the rules layer would reject the write
  // anyway, but hiding the button avoids dangling a destructive
  // action that cannot succeed.
  currentUid: string
}

export function CardDialog({
  open,
  onClose,
  card,
  project,
  allCards,
  currentUid,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Two-step delete confirm. First click on Delete arms this flag,
  // turning the button into a solid-red "Confirm delete?" with a
  // sibling Cancel button. Second click on the armed button runs
  // the delete and closes the dialog. Reset to `false` when the
  // dialog opens — App.tsx remounts CardDialog on every open via
  // `key={openCardId ?? 'closed'}`, so the useState initial value
  // is sufficient and no effect is needed for the open transition.
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Tracks whether the most-recent clipboard copy is still in its
  // success window. While true the header copy button shows a
  // checkmark instead of the clipboard icon. Reverts after 2 seconds.
  const [copied, setCopied] = useState(false)
  // Outstanding revert timer for the copied-state. Stored in a ref so
  // multiple rapid copies do not overlap timers — every copy resets
  // the existing timer before scheduling a fresh one.
  const copiedTimerRef = useRef<number | null>(null)
  const toast = useToast()

  // Clean up the revert timer on unmount so a copy that fired right
  // before the dialog closed cannot fire setState on a dead instance.
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current)
      }
    }
  }, [])

  // Build the Markdown payload for the card, copy it, and flip the
  // header icon to a checkmark for 2 s. On clipboard failure (Safari
  // permission denial, insecure context, etc.) surface a brief toast
  // and keep the icon in its default state.
  async function handleCopyToClipboard() {
    if (!card) return
    const text = cardToClipboardMarkdown(card)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current)
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(false)
        copiedTimerRef.current = null
      }, 2000)
    } catch {
      // The clipboard API rejects under several conditions (HTTP
      // origin, denied permission prompt, Firefox older than 63 etc.).
      // We do not differentiate — the user only needs to know it
      // didn't work and that they should try again.
      toast.push('Copy failed', 'error')
    }
  }

  // Reset-on-open is handled by remounting this component, not by an
  // effect. App.tsx passes `key={openCardId ?? 'closed'}`, so when
  // the user opens a card the key changes, React discards the old
  // instance and mounts a fresh one — and `editing`, `submitting`,
  // and `error` are naturally their useState initial values
  // (`false`, `false`, `null`). No effect needed, and nothing can
  // accidentally re-fire mid-session to knock the user out of edit
  // mode.

  const columns = useMemo<Column[]>(() => {
    if (!project) return []
    return project.columnOrder
      .map((id) => project.columns[id])
      .filter((c): c is Column => Boolean(c))
  }, [project])

  const existingTags = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of allCards) {
      for (const t of c.tags) {
        const k = t.toLowerCase()
        if (!seen.has(k)) seen.set(k, t)
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }, [allCards])

  // Submit handler wired to CardForm. The `card` null-guard here is a
  // safety net; the UI hides the form entirely while card is null so
  // in practice the handler cannot be invoked in that state.
  async function handleSubmit(values: CardFormValues) {
    if (!card) return
    setSubmitting(true)
    setError(null)
    try {
      await updateCard(card.id, {
        title: values.title,
        columnId: values.columnId,
        description: values.description,
        priority: values.priority,
        dueDate: values.dueDate,
        tags: values.tags,
        links: values.links,
        notes: values.notes,
      })
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save card.')
    } finally {
      setSubmitting(false)
    }
  }

  // Delete handler. First click flips the button into a confirm
  // state; second click runs the actual write. Errors reset the
  // confirm and surface via toast — the dialog stays open so the
  // user can try again or close manually.
  async function handleDeleteClick() {
    if (!card) return
    if (!deleteConfirming) {
      setDeleteConfirming(true)
      return
    }
    setDeleting(true)
    try {
      await deleteCard(card.id)
      // The card unmounts as the cards snapshot drops it, but we
      // still close explicitly so the dialog goes away in the same
      // tick rather than waiting for the next render.
      onClose()
    } catch (err) {
      setDeleting(false)
      setDeleteConfirming(false)
      toast.push(
        err instanceof Error ? err.message : 'Could not delete card.',
        'error',
      )
    }
  }

  // Visibility for the Delete button in read mode. Mirrors the
  // Firestore rule for card delete (`isCardCreator() ||
  // isProjectOwnerOnCard()`): only the creator and the project
  // owner see the affordance. Members who did not create the card
  // would have their delete rejected by the rules anyway, so
  // hiding the button keeps the UI honest.
  const canDelete =
    card != null &&
    project != null &&
    (card.userId === currentUid || project.userId === currentUid)

  // `ready` gates the mode-specific UI (form / read view, footer
  // buttons) — when either dependency is missing we show a neutral
  // loading state inside the Modal, never unmount it.
  const ready = card != null && project != null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit card' : 'Card'}
      wide
      // The card dialog can hold unsaved edits (while in edit mode)
      // and also briefly re-renders when the user clicks Edit, so a
      // backdrop click should never dismiss it. The explicit Close
      // button and Escape remain available.
      dismissOnBackdrop={false}
      // Copy-to-clipboard control in the header, immediately to the
      // left of the close button. Hidden in edit mode and while the
      // card is still loading — only the read view is a reasonable
      // copy source (mid-edit content is unsaved + transient). Same
      // 7×7 hit-area + token styling as the close button so the two
      // controls look like a single header cluster. The icon swaps
      // to a checkmark for 2 s after a successful copy.
      headerActions={
        ready && !editing ? (
          <button
            type="button"
            onClick={handleCopyToClipboard}
            title="Copy to clipboard"
            aria-label="Copy card to clipboard as Markdown"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--kb-text-muted)] transition hover:bg-[var(--kb-board-bg)] hover:text-[var(--kb-text-secondary)]"
          >
            {copied ? <CheckIcon /> : <ClipboardIcon />}
          </button>
        ) : undefined
      }
      // Footer is only rendered once we have data to act on. When
      // card / project are transiently null, omit the footer entirely
      // so the mode-specific buttons do not flash on screen with
      // nothing for them to do.
      footer={
        ready
          ? editing
            ? (
              <>
                {/* Distinct `key` props on every footer button across
                    both branches of this conditional are load-bearing.
                    Without them, React reconciles the Edit ↔ Save
                    swap by reusing the same DOM <button> element and
                    just mutating its props — flipping `type="button"`
                    to `type="submit"`. React 18 synchronously flushes
                    state updates from discrete events (click), so by
                    the time the browser runs the click's default
                    action it sees type=submit and submits the form.
                    Separate keys force React to unmount the Edit DOM
                    element and create a fresh Save element, which has
                    no pending click. */}
                <button
                  key="cancel"
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={submitting}
                  className="rounded-md px-3 py-1.5 text-sm text-[var(--kb-text-secondary)] hover:bg-[var(--kb-board-bg)]"
                >
                  Cancel
                </button>
                <button
                  key="save"
                  type="submit"
                  form="card-dialog-form"
                  disabled={submitting}
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
                >
                  {submitting ? 'Saving…' : 'Save changes'}
                </button>
              </>
            )
            : (
              <>
                {/* Delete cluster sits at the far left via `mr-auto`
                    on the wrapper; Modal's footer container is a
                    `flex justify-end gap-2`, so the auto-margin
                    pushes everything else right. Hidden entirely
                    for users who lack delete permission — matches
                    the Firestore rule (creator + owner only). */}
                {canDelete && (
                  <span
                    key="delete-cluster"
                    className="mr-auto flex items-center gap-2"
                  >
                    {deleteConfirming && (
                      <button
                        key="delete-cancel"
                        type="button"
                        onClick={() => setDeleteConfirming(false)}
                        disabled={deleting}
                        className="rounded-md px-3 py-1.5 text-sm text-[var(--kb-text-muted)] transition hover:bg-[var(--kb-board-bg)] disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      key="delete"
                      type="button"
                      onClick={handleDeleteClick}
                      disabled={deleting}
                      className={
                        deleteConfirming
                          ? 'rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60'
                          : 'rounded-md px-3 py-1.5 text-sm text-red-500 transition hover:bg-red-50 dark:hover:bg-red-950/40'
                      }
                    >
                      {deleting
                        ? 'Deleting…'
                        : deleteConfirming
                          ? 'Confirm delete?'
                          : 'Delete'}
                    </button>
                  </span>
                )}
                <button
                  key="close"
                  type="button"
                  onClick={onClose}
                  className="rounded-md px-3 py-1.5 text-sm text-[var(--kb-text-secondary)] hover:bg-[var(--kb-board-bg)]"
                >
                  Close
                </button>
                <button
                  key="edit"
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700"
                >
                  Edit
                </button>
              </>
            )
          : undefined
      }
    >
      {!ready ? (
        // Neutral placeholder while the card or project reference
        // is being resolved. Rendered INSIDE the Modal so the Modal
        // itself never unmounts mid-session.
        <div className="py-8 text-center text-sm text-[var(--kb-text-muted)]">
          Loading…
        </div>
      ) : editing ? (
        <>
          <CardForm
            formId="card-dialog-form"
            columns={columns}
            existingTags={existingTags}
            initial={{
              title: card.title,
              columnId: card.columnId,
              priority: card.priority,
              dueDate: card.dueDate,
              tags: card.tags,
              description: card.description,
              links: card.links,
              notes: card.notes,
            }}
            onSubmit={handleSubmit}
          />
          {error && (
            <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </>
      ) : (
        <ReadView
          card={card}
          columnTitle={project.columns[card.columnId]?.title ?? 'Unknown'}
          projectTitle={project.title}
        />
      )}
    </Modal>
  )
}

function ReadView({
  card,
  columnTitle,
  projectTitle,
}: {
  card: Card
  columnTitle: string
  projectTitle: string
}) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="text-xl font-semibold text-[var(--kb-text-primary)]">
          {card.title}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--kb-text-muted)]">
          <Meta label="Project">{projectTitle}</Meta>
          <Meta label="Column">{columnTitle}</Meta>
          <Meta label="Priority">{card.priority ?? '—'}</Meta>
        </div>
      </div>

      <Row label="Description">
        {card.description ? (
          <p className="whitespace-pre-wrap text-[var(--kb-text-secondary)]">
            {card.description}
          </p>
        ) : (
          <Empty />
        )}
      </Row>

      <Row label="Due date">
        {card.dueDate ? formatDateLong(card.dueDate) : <Empty />}
      </Row>

      <Row label="Tags">
        {card.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {card.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-[var(--kb-board-bg)] px-2 py-0.5 text-xs text-[var(--kb-text-secondary)]"
              >
                {t}
              </span>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </Row>

      <Row label="Links">
        {card.links.length > 0 ? (
          <ul className="space-y-1">
            {card.links.map((l, i) => (
              <li key={`${l.url}-${i}`}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-600 hover:underline"
                >
                  {l.label}
                </a>{' '}
                <span className="text-xs text-[var(--kb-text-muted)]">— {l.url}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Row>

      <Row label="Notes">
        {card.notes ? (
          <p className="whitespace-pre-wrap text-[var(--kb-text-secondary)]">{card.notes}</p>
        ) : (
          <Empty />
        )}
      </Row>
    </div>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span>
      <span className="text-[var(--kb-text-muted)]">{label}:</span>{' '}
      <span className="text-[var(--kb-text-secondary)]">{children}</span>
    </span>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--kb-text-muted)]">
        {label}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Empty() {
  return <span className="text-xs italic text-[var(--kb-text-muted)]">Not set</span>
}

// lucide-react Clipboard glyph, inlined as raw SVG. The project does
// not depend on lucide-react — the rest of the UI uses inline SVGs in
// the same style — so we hand-roll the path here. Sized to match the
// header's existing 4×4 close icon for visual parity.
function ClipboardIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  )
}

// lucide-react Check glyph. Briefly replaces the ClipboardIcon for 2 s
// after a successful copy so the user gets immediate visual
// confirmation without a toast competing for attention.
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

