// ---------------------------------------------------------------------------
// AddCardModal
//
// Thin wrapper around CardForm that writes a new card to Firestore when
// the form submits. The heavy lifting of the form itself lives in
// CardForm; this file handles the create-specific details (initial
// values, submit handler, modal chrome).
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { CardForm, type CardFormValues } from './CardForm'
import { createCard } from '../../lib/firestore'
import type { Card, Column, Project } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  userId: string
  project: Project | null
  cards: Card[]
  // When the stats-bar "+" button is clicked no particular column is
  // implied — the form defaults to the first column. A future inline
  // "+ Add card" button at the top of a column can pre-select a column
  // by passing its id here.
  defaultColumnId?: string
}

export function AddCardModal({
  open,
  onClose,
  userId,
  project,
  cards,
  defaultColumnId,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Columns in display order. Safe to compute unconditionally; empty when
  // `project` is null and the form simply shows no columns.
  const columns = useMemo<Column[]>(() => {
    if (!project) return []
    return project.columnOrder
      .map((id) => project.columns[id])
      .filter((c): c is Column => Boolean(c))
  }, [project])

  // Aggregate every tag used on cards in this project for the suggestion
  // list. Case-insensitive dedupe preserves the casing of the first seen
  // occurrence, so "Auth" and "auth" merge into a single suggestion.
  const existingTags = useMemo(() => aggregateTags(cards), [cards])

  async function handleSubmit(values: CardFormValues) {
    if (!project) return
    setSubmitting(true)
    setError(null)
    try {
      await createCard({
        userId,
        // Stamped onto the card so security rules can authorize
        // owner-side reads/writes without re-fetching the parent
        // project. Members creating cards on a shared board pass
        // the project's owner uid, not their own uid.
        projectOwnerId: project.userId,
        // Full project member list (lowercased emails) at write
        // time. Stamped per card so the rules can authorize
        // member-level reads via a per-document `memberEmails`
        // check without a cross-collection get(). Membership changes
        // are fanned out to every existing card by
        // `updateCardMemberEmails` from the invite / remove flows.
        memberEmails: project.memberEmails,
        projectId: project.id,
        columnId: values.columnId,
        title: values.title,
        description: values.description,
        priority: values.priority,
        dueDate: values.dueDate,
        tags: values.tags,
        links: values.links,
        notes: values.notes,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create card.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!project) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New card"
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
            type="submit"
            form="add-card-form"
            disabled={submitting}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create card'}
          </button>
        </>
      }
    >
      <CardForm
        formId="add-card-form"
        columns={columns}
        existingTags={existingTags}
        initial={{ columnId: defaultColumnId ?? columns[0]?.id ?? '' }}
        onSubmit={handleSubmit}
      />
      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </Modal>
  )
}

function aggregateTags(cards: Card[]): string[] {
  const seen = new Map<string, string>() // key: lowercase, value: first-seen casing
  for (const c of cards) {
    for (const t of c.tags) {
      const k = t.toLowerCase()
      if (!seen.has(k)) seen.set(k, t)
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}
