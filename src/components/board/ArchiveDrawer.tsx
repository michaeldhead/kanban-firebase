// ---------------------------------------------------------------------------
// ArchiveDrawer
//
// Slide-in panel from the right showing every archived card on the
// active project. Two destructive actions per row:
//
//   - Restore → flips `archived` back to false and clears `archivedAt`
//     via `restoreCard`. The card disappears from the drawer (the
//     `useArchivedCards` snapshot drops it) and reappears on the board
//     in its original column on the next active-cards snapshot.
//
//   - Delete  → hard-deletes the card document via `deleteCard`. Two
//     clicks: the first flips the button label to "Confirm delete";
//     the second runs the delete. Clicking anywhere else (or pressing
//     Escape) resets the pending row, so a stray first-click cannot
//     leave the row armed indefinitely.
//
// Visual chrome:
//   - Fixed full-height panel anchored to the right edge of the
//     viewport, 360 px wide. Slides in via a `translate-x-` toggle so
//     the open/close has a 300 ms ease.
//   - Backdrop dim under the drawer; clicking it closes the drawer.
//     Escape also closes.
//   - Surfaces use the `--kb-*` theme tokens so the drawer follows
//     whatever theme + color mode the user is on.
//
// Grouping:
//   - Cards are grouped under their original column title (looked up
//     via `project.columns[card.columnId]?.title` with a "Unknown
//     column" fallback for cards whose original column was deleted).
//   - Group order matches the project's `columnOrder`. Any "unknown"
//     bucket sorts to the end.
//   - Within a group, cards are sorted by `archivedAt` descending so
//     the most-recently archived card appears first. Cards whose
//     `archivedAt` has not yet round-tripped from the server (still
//     null locally) sort to the top within their group — they are
//     definitionally the freshest.
//
// Permissions:
//   - The Firestore rules already restrict delete to creator + owner
//     (Session 14). A member trying to delete another user's card
//     will see a permission error from `deleteCard`; the drawer
//     surfaces it via the toast.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import type { Timestamp } from 'firebase/firestore'
import { useArchivedCards } from '../../hooks/useArchivedCards'
import { restoreCard, deleteCard } from '../../lib/firestore'
import { formatDate, parseISODate, startOfToday } from '../../lib/dateUtils'
import { useToast } from '../toast/ToastProvider'
import type { Card, Project } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  project: Project | null
  uid: string | null
  userEmail: string
}

export function ArchiveDrawer({
  open,
  onClose,
  project,
  uid,
  userEmail,
}: Props) {
  const { cards, loading, error } = useArchivedCards(
    uid,
    userEmail || null,
    project?.id ?? null,
  )

  // Escape to close. Mounted only while the drawer is open so we do
  // not leak listeners onto the document during the (likely majority)
  // time the drawer is closed.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Body scroll lock while the drawer is open. The board itself can
  // be very tall in a populated project, so leaving the underlying
  // page scrollable while a 100% drawer is open is jarring.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Group archived cards by their original column. Groups appear in
  // the project's column order; any "unknown column" bucket trails.
  const grouped = useMemo(
    () => groupByColumn(cards, project),
    [cards, project],
  )

  // Always render the drawer DOM so the slide-in transform animates
  // both ways. When `open` is false the panel translates fully off
  // to the right and the backdrop fades to transparent / pointer-
  // events-none, matching the closed state.
  return (
    <>
      <div
        // The backdrop. `pointer-events-none` while closed so it does
        // not intercept clicks on the board, and `pointer-events-auto`
        // while open so a click dismisses.
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!open}
      />
      <aside
        // The panel itself. `translate-x-full` slides off to the right
        // when closed; `translate-x-0` brings it on screen.
        className={`fixed top-0 right-0 z-50 flex h-full w-[360px] flex-col border-l border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-label="Archived cards"
        aria-hidden={!open}
      >
        <Header
          count={cards.length}
          loading={loading}
          onClose={onClose}
        />

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          {!loading && cards.length === 0 && !error && <EmptyState />}

          {grouped.map((group) => (
            <Section
              key={group.columnId}
              title={group.title}
              cards={group.cards}
              project={project}
            />
          ))}
        </div>
      </aside>
    </>
  )
}

// ---------- Header ----------

function Header({
  count,
  loading,
  onClose,
}: {
  count: number
  loading: boolean
  onClose: () => void
}) {
  // Subtitle copy varies based on count + loading — once cards have
  // loaded, "{n} archived cards" is the canonical phrasing; the
  // singular case is handled in formatCount.
  const subtitle = loading
    ? 'Loading…'
    : count === 0
      ? 'No archived cards'
      : `${formatCount(count)} archived`
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--kb-card-border)] px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--kb-text-primary)]">
          Archived cards
        </h2>
        <p className="mt-0.5 text-xs text-[var(--kb-text-muted)]">
          {subtitle}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        title="Close"
        aria-label="Close archive drawer"
        className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--kb-text-muted)] hover:bg-[var(--kb-board-bg)] hover:text-[var(--kb-text-secondary)]"
      >
        <CloseIcon />
      </button>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

// ---------- Empty state ----------

function EmptyState() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-2 text-sm font-medium text-[var(--kb-text-secondary)]">
        No archived cards
      </div>
      <p className="text-xs text-[var(--kb-text-muted)]">
        Cards you archive appear here.
      </p>
    </div>
  )
}

// ---------- Section + row ----------

function Section({
  title,
  cards,
  project,
}: {
  title: string
  cards: Card[]
  project: Project | null
}) {
  return (
    <section className="mb-4">
      <h3 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--kb-text-muted)]">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {cards.map((card) => (
          <ArchiveRow key={card.id} card={card} project={project} />
        ))}
      </ul>
    </section>
  )
}

function ArchiveRow({
  card,
  project,
}: {
  card: Card
  project: Project | null
}) {
  // Three local states for the row's action buttons:
  //   - 'idle'      → both Restore and Delete in their default state
  //   - 'restoring' → Restore button shows "Restoring…" until the
  //                   write resolves; the snapshot then drops the
  //                   card and unmounts this row
  //   - 'confirm-delete' → Delete button label flips to "Confirm
  //                        delete"; second click runs the delete
  //   - 'deleting' → Delete button shows "Deleting…" until resolved
  //
  // Clicking outside the row resets a pending confirm — handled by
  // a document-level pointerdown listener mounted only while
  // `mode === 'confirm-delete'`.
  type Mode = 'idle' | 'restoring' | 'confirm-delete' | 'deleting'
  const [mode, setMode] = useState<Mode>('idle')
  const toast = useToast()

  // Reset the pending-delete confirm if the user clicks elsewhere.
  // The handler ignores clicks inside this row (the row's own
  // pointerdown stops propagation below).
  useEffect(() => {
    if (mode !== 'confirm-delete') return
    function onAnywherePointerDown() {
      setMode('idle')
    }
    // Defer attachment by a tick so the click that armed the confirm
    // does not immediately reset it.
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onAnywherePointerDown)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('pointerdown', onAnywherePointerDown)
    }
  }, [mode])

  async function handleRestore() {
    if (mode !== 'idle') return
    setMode('restoring')
    try {
      await restoreCard(card.id, card.columnId)
      // No state reset — the card unmounts as the snapshot drops it.
    } catch (err) {
      setMode('idle')
      toast.push(
        err instanceof Error ? err.message : 'Could not restore card.',
        'error',
      )
    }
  }

  async function handleDeleteClick() {
    if (mode === 'idle') {
      setMode('confirm-delete')
      return
    }
    if (mode !== 'confirm-delete') return
    setMode('deleting')
    try {
      await deleteCard(card.id)
    } catch (err) {
      setMode('idle')
      toast.push(
        err instanceof Error ? err.message : 'Could not delete card.',
        'error',
      )
    }
  }

  const overdue = isOverdue(card.dueDate)
  const tagsText = card.tags.length > 0 ? card.tags.join(', ') : null

  return (
    <li
      className="rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-board-bg)] p-2.5"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1 text-xs font-semibold text-[var(--kb-text-primary)]">
              {card.title}
            </div>
            {card.priority && <PriorityBadge priority={card.priority} />}
          </div>
          {card.dueDate && (
            <div
              className={`mt-1 text-[11px] ${
                overdue
                  ? 'font-medium text-red-600 dark:text-red-400'
                  : 'text-[var(--kb-text-muted)]'
              }`}
            >
              Due {formatDate(card.dueDate)}
            </div>
          )}
          {tagsText && (
            <div className="mt-0.5 truncate text-[11px] text-[var(--kb-text-muted)]">
              {tagsText}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={handleRestore}
          disabled={mode !== 'idle' && mode !== 'confirm-delete'}
          className="rounded border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--kb-text-secondary)] hover:bg-[var(--kb-board-bg)] disabled:opacity-60"
        >
          {mode === 'restoring' ? 'Restoring…' : 'Restore'}
        </button>
        <button
          type="button"
          onClick={handleDeleteClick}
          disabled={mode === 'restoring' || mode === 'deleting'}
          className={`rounded px-2 py-0.5 text-[11px] font-medium disabled:opacity-60 ${
            mode === 'confirm-delete'
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30'
          }`}
        >
          {mode === 'deleting'
            ? 'Deleting…'
            : mode === 'confirm-delete'
              ? 'Confirm delete'
              : 'Delete'}
        </button>
      </div>

      {/* Visual hint that the project context is preserved when restoring.
          Shown only when we know the original column is still in place;
          otherwise the row is silent (the section header is "Unknown
          column" in that case, which carries the warning by itself). */}
      {project && project.columns[card.columnId] && mode === 'idle' && (
        <p className="mt-1.5 text-[10px] text-[var(--kb-text-muted)]">
          Restores to {project.columns[card.columnId].title}
        </p>
      )}
    </li>
  )
}

// ---------- Subcomponents ----------

function PriorityBadge({
  priority,
}: {
  priority: NonNullable<Card['priority']>
}) {
  const color =
    priority === 'Critical'
      ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200'
      : priority === 'High'
        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-200'
        : priority === 'Medium'
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${color}`}
    >
      {priority}
    </span>
  )
}

// ---------- helpers ----------

interface ArchiveGroup {
  columnId: string
  title: string
  cards: Card[]
}

/**
 * Bucket archived cards by their `columnId`. Buckets appear in the
 * project's `columnOrder`; any cards whose `columnId` no longer
 * exists on the project are surfaced under a single "Unknown column"
 * bucket at the bottom (so the user sees them and can still
 * restore/delete instead of losing track).
 *
 * Within each bucket cards are sorted newest-archived first
 * (`archivedAt` descending). Locally-pending writes whose
 * `archivedAt` has not yet round-tripped from the server are sorted
 * to the very top of their bucket — they are by definition the
 * freshest.
 */
function groupByColumn(
  cards: Card[],
  project: Project | null,
): ArchiveGroup[] {
  if (!project) return []
  const byColumn = new Map<string, Card[]>()
  const unknown: Card[] = []
  for (const card of cards) {
    const col = project.columns[card.columnId]
    if (!col) {
      unknown.push(card)
      continue
    }
    const list = byColumn.get(card.columnId) ?? []
    list.push(card)
    byColumn.set(card.columnId, list)
  }
  const groups: ArchiveGroup[] = []
  for (const columnId of project.columnOrder) {
    const list = byColumn.get(columnId)
    if (!list || list.length === 0) continue
    const col = project.columns[columnId]
    list.sort(byArchivedAtDesc)
    groups.push({
      columnId,
      title: col?.title ?? 'Unknown column',
      cards: list,
    })
  }
  if (unknown.length > 0) {
    unknown.sort(byArchivedAtDesc)
    groups.push({
      columnId: '__unknown__',
      title: 'Unknown column',
      cards: unknown,
    })
  }
  return groups
}

function byArchivedAtDesc(a: Card, b: Card): number {
  // Pending (null) writes sort to the top: they have not yet been
  // confirmed by the server but are by definition the freshest.
  const am = millis(a.archivedAt)
  const bm = millis(b.archivedAt)
  if (am === null && bm === null) return 0
  if (am === null) return -1
  if (bm === null) return 1
  return bm - am
}

function millis(ts: Timestamp | null): number | null {
  return ts ? ts.toMillis() : null
}

function formatCount(n: number): string {
  return `${n} card${n === 1 ? '' : 's'}`
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  const today = startOfToday()
  const due = parseISODate(dueDate)
  if (!due) return false
  return due.getTime() < today.getTime()
}
