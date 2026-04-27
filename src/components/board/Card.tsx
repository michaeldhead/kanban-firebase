// ---------------------------------------------------------------------------
// Card
//
// A single card rendered inside a column. Two interaction states:
//
//   1. Default: title, priority badge, 2-line description clamp, tag
//      preview pills (first 4 + "+N more"), due date, and the action
//      row. Title is plain text — pressing on it participates in the
//      card's drag listeners, so the title row doubles as a drag
//      handle. Full card details are reached only via the "Open card"
//      icon in the action row, which mounts the CardDialog.
//
//   2. Archive confirm (archive icon clicked): replaces the action
//      row with an inline "Archive this card?" / Cancel pair. Only
//      available on cards in the project's last column.
//
// There is no inline expand. The card is intentionally static — the
// preview fields above are the entire card surface; if the user
// wants to see the full description, every tag, links, or notes,
// they open the dialog.
//
// Drag-and-drop integration:
//   The card registers itself with its column's SortableContext via
//   `useSortable`. Drag listeners are spread on the outer element;
//   the DndContext's pointer sensor is configured with a small
//   activation distance (see Board.tsx) so plain pointer presses on
//   non-button areas still cleanly initiate a drag once the pointer
//   moves. The action row and archive-confirm row stop pointerdown
//   propagation so their buttons stay clickable without accidentally
//   arming a drag.
//
// Dark-mode contrast:
//   Tailwind classes include `dark:` variants for every text / tag
//   color so the card's surface-vs-text contrast remains legible
//   under the dark theme variants. The surface colors themselves
//   come from CSS variables in themes.ts, which are tuned to
//   contrast against the board background.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card as CardType } from '../../types'
import { archiveCard } from '../../lib/firestore'
import { formatDate, parseISODate, startOfToday } from '../../lib/dateUtils'
import { useToast } from '../toast/ToastProvider'

interface Props {
  card: CardType
  // True when this card lives in the project's last column; enables the
  // archive action per the spec.
  isLastColumn: boolean
  // True when the board's tag-filter is active and this card does not
  // match. Hidden cards stay in the DOM with `display: none` so the
  // dnd-kit sortable structure and column heights are not disturbed
  // while the filter is on. Defaults to false so callers that do not
  // care about filtering (currently none) get unchanged behavior.
  hidden?: boolean
  onOpenDialog: () => void
}

export function Card({ card, isLastColumn, hidden = false, onOpenDialog }: Props) {
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const toast = useToast()

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    // The `data` payload lets DragEnd handlers distinguish cards from
    // columns and find the card's current column without scanning arrays.
    data: { type: 'card', columnId: card.columnId },
  })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    // Per spec: dragging card gets reduced opacity + a subtle ring.
    opacity: isDragging ? 0.5 : 1,
    // Tag-filter hide: collapse fully so column height matches what
    // the user sees, but keep the article in the DOM so dnd-kit's
    // SortableContext and any in-flight drag state remain valid.
    // `display: none` (rather than `visibility: hidden`) is what the
    // spec calls out and is what drops the card out of layout flow.
    ...(hidden ? { display: 'none' as const } : null),
  }

  const overdue = isOverdue(card.dueDate)

  async function doArchive() {
    setArchiving(true)
    try {
      await archiveCard(card.id)
      // No local state reset needed — the onSnapshot subscription will
      // remove this card from the list and the component will unmount.
    } catch (err) {
      setArchiving(false)
      setConfirmArchive(false)
      toast.push(
        err instanceof Error ? err.message : 'Could not archive card.',
        'error',
      )
    }
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] p-3 shadow-sm ${
        isDragging ? 'ring-2 ring-violet-400' : ''
      }`}
    >
      {/* Title row. The title is plain text and intentionally does NOT
          stop pointerdown propagation — the title area participates in
          the article's drag listeners so users can grab the card by
          its title. Opening the full card dialog is done via the
          "Open card" icon in the action row below. */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">
          {card.title}
        </div>
        {card.priority && <PriorityBadge priority={card.priority} />}
      </div>

      {card.description && (
        <p className="mt-1.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
          {card.description}
        </p>
      )}

      {card.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.tags.slice(0, 4).map((t) => (
            <TagPill key={t}>{t}</TagPill>
          ))}
          {card.tags.length > 4 && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              +{card.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {card.dueDate && (
        <div
          className={`mt-2 text-xs ${
            overdue
              ? 'font-medium text-red-600 dark:text-red-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Due {formatDate(card.dueDate)}
        </div>
      )}

      {/* --- Action row. Always visible. The confirm-archive state
             replaces it with an inline popconfirm. --- */}
      {confirmArchive ? (
        <div
          className="mt-2 flex items-center justify-end gap-2 text-xs"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="mr-auto text-slate-600 dark:text-slate-300">
            Archive this card?
          </span>
          <button
            type="button"
            onClick={() => setConfirmArchive(false)}
            disabled={archiving}
            className="rounded px-2 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={doArchive}
            disabled={archiving}
            className="rounded bg-red-600 px-2 py-0.5 font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {archiving ? 'Archiving…' : 'Archive'}
          </button>
        </div>
      ) : (
        <div
          className="mt-2 flex items-center justify-end gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <IconButton title="Open card" onClick={onOpenDialog}>
            <OpenIcon />
          </IconButton>
          {isLastColumn && (
            <IconButton
              title="Archive card"
              onClick={() => setConfirmArchive(true)}
            >
              <ArchiveIcon />
            </IconButton>
          )}
        </div>
      )}
    </article>
  )
}

function TagPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-200">
      {children}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: NonNullable<CardType['priority']> }) {
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
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${color}`}
    >
      {priority}
    </span>
  )
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
    >
      {children}
    </button>
  )
}

function OpenIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="4" rx="1" />
      <path d="M5 7v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7" />
      <path d="M10 12h4" />
    </svg>
  )
}

// ---------- helpers ----------

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  const today = startOfToday()
  const due = parseISODate(dueDate)
  if (!due) return false
  return due.getTime() < today.getTime()
}
