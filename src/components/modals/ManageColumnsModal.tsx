// ---------------------------------------------------------------------------
// ManageColumnsModal
//
// Add, rename, reorder, and delete the active project's columns. Each
// row shows the column title as an inline input, up / down reorder
// buttons, and a delete button.
//
// Design choices worth noting:
//
//   - All edits are held in a local draft while the dialog is open, and
//     only persisted to Firestore when the user clicks "Save". This lets
//     the user freely tweak names and positions without flickering
//     changes on the board behind the dialog, and keeps the whole
//     operation atomic from a UX standpoint.
//
//   - Drag-and-drop reorder is intentionally not implemented in this
//     session (DnD lands in a later session). Up / down arrows provide
//     full reorder capability in the meantime.
//
//   - Delete is blocked for columns that contain active cards. The
//     disabled state has a tooltip so the user knows why the action is
//     unavailable.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import { Modal } from './Modal'
import type { Card, Column, Project } from '../../types'
import { updateProject } from '../../lib/firestore'

interface DraftColumn {
  id: string
  title: string
  // Track whether a column is newly-added in this editing session so we
  // can distinguish "brand new, delete freely" from "existing column with
  // potential cards" when the user hits the trash icon.
  isNew?: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  project: Project | null
  cards: Card[]
}

export function ManageColumnsModal({ open, onClose, project, cards }: Props) {
  const [columns, setColumns] = useState<DraftColumn[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize the draft from the project whenever the dialog opens.
  useEffect(() => {
    if (!open || !project) return
    const initial = project.columnOrder
      .map((id) => project.columns[id])
      .filter((c): c is Column => Boolean(c))
      .map((c) => ({ id: c.id, title: c.title }))
    setColumns(initial)
    setError(null)
    setSubmitting(false)
  }, [open, project])

  // Card count per column, for the "can I delete?" check. Computed from
  // the subscribed card list rather than firing an extra read.
  const cardCountByColumn = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of cards) {
      map[c.columnId] = (map[c.columnId] ?? 0) + 1
    }
    return map
  }, [cards])

  if (!project) return null

  function move(index: number, delta: -1 | 1) {
    setColumns((cols) => {
      const next = cols.slice()
      const target = index + delta
      if (target < 0 || target >= next.length) return cols
      const tmp = next[index]
      next[index] = next[target]
      next[target] = tmp
      return next
    })
  }

  function rename(index: number, title: string) {
    setColumns((cols) => {
      const next = cols.slice()
      next[index] = { ...next[index], title }
      return next
    })
  }

  function remove(index: number) {
    setColumns((cols) => cols.filter((_, i) => i !== index))
  }

  function addColumn() {
    // New columns get a locally-unique ID; Firestore will accept it as an
    // entry key when we save. The ID only has to be unique within this
    // project's `columns` map.
    const newId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)
    setColumns((cols) => [...cols, { id: newId, title: 'New column', isNew: true }])
  }

  async function handleSave() {
    if (!project) return

    // Basic validation: every column needs a non-empty title after trim.
    const cleaned = columns.map((c) => ({ ...c, title: c.title.trim() }))
    if (cleaned.some((c) => c.title.length === 0)) {
      setError('Every column needs a name.')
      return
    }
    if (cleaned.length === 0) {
      setError('A project needs at least one column.')
      return
    }

    // Build the new columns map and columnOrder array. Preserves the
    // draft order exactly; `order` on each column object is refreshed so
    // any code reading it directly stays in sync with the array index.
    const newColumns: Record<string, Column> = {}
    const newColumnOrder: string[] = []
    cleaned.forEach((c, i) => {
      newColumns[c.id] = { id: c.id, title: c.title, order: i }
      newColumnOrder.push(c.id)
    })

    setSubmitting(true)
    setError(null)
    try {
      await updateProject(project.id, {
        columns: newColumns,
        columnOrder: newColumnOrder,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save columns.')
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manage columns"
      wide
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md px-3 py-1.5 text-sm text-[var(--kb-text-secondary)] hover:bg-[var(--kb-board-bg)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        {columns.map((col, i) => {
          const cardCount = cardCountByColumn[col.id] ?? 0
          // Brand new columns have never been persisted, so they are
          // always safe to delete even if the board shows them. Existing
          // columns follow the rule: only deletable when empty.
          const deleteBlocked = !col.isNew && cardCount > 0

          return (
            <div
              key={col.id}
              className="flex items-center gap-2 rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-board-bg)] p-2"
            >
              {/* Reorder arrows. Disabled at the ends of the list. */}
              <div className="flex flex-col">
                <IconButton
                  title="Move up"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                >
                  <ArrowIcon direction="up" />
                </IconButton>
                <IconButton
                  title="Move down"
                  onClick={() => move(i, 1)}
                  disabled={i === columns.length - 1}
                >
                  <ArrowIcon direction="down" />
                </IconButton>
              </div>

              <input
                type="text"
                value={col.title}
                onChange={(e) => rename(i, e.target.value)}
                className="flex-1 rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-2.5 py-1.5 text-sm text-[var(--kb-text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                maxLength={40}
              />

              <span className="w-16 text-right text-xs text-[var(--kb-text-muted)]">
                {cardCount} {cardCount === 1 ? 'card' : 'cards'}
              </span>

              <IconButton
                title={
                  deleteBlocked
                    ? 'Move all cards out first'
                    : 'Delete column'
                }
                onClick={() => remove(i)}
                disabled={deleteBlocked}
                danger
              >
                <TrashIcon />
              </IconButton>
            </div>
          )
        })}

        <button
          type="button"
          onClick={addColumn}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--kb-card-border)] py-2 text-sm text-[var(--kb-text-secondary)] transition hover:border-[var(--kb-text-muted)] hover:bg-[var(--kb-board-bg)] hover:text-[var(--kb-text-primary)]"
        >
          <PlusIcon /> Add column
        </button>

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

function IconButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded transition ${
        disabled
          ? 'cursor-not-allowed text-[var(--kb-text-muted)] opacity-50'
          : danger
            ? 'text-red-500 hover:bg-red-50 hover:text-red-700'
            : 'text-[var(--kb-text-muted)] hover:bg-[var(--kb-board-bg)] hover:text-[var(--kb-text-primary)]'
      }`}
    >
      {children}
    </button>
  )
}

function ArrowIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-3 w-3 ${direction === 'down' ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="5 12 10 7 15 12" />
    </svg>
  )
}

function TrashIcon() {
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
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
