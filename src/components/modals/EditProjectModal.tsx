// ---------------------------------------------------------------------------
// EditProjectModal
//
// Rename / regroup / delete a project. The "edit" fields (title and group)
// are written on save. Delete is a secondary action guarded by two
// checks:
//
//   1. If the project still has unarchived cards, delete is blocked and
//      the user is told to archive or move them first. We count cards
//      from the already-subscribed in-memory list (`activeCardCount`),
//      so this is instant with no extra read.
//
//   2. When allowed, clicking "Delete project" puts the dialog into a
//      two-step confirm state — the button itself changes to "Confirm
//      delete" for a second click. A full separate confirm dialog would
//      be overkill for a personal app where the user knows the stakes.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import { Modal } from './Modal'
import { deleteProject, updateProject } from '../../lib/firestore'
import { collectGroupNames } from '../../lib/projectUtils'
import type { Project } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  project: Project | null
  // All of the user's projects. Used to derive one-click group
  // suggestions dynamically (no hardcoded group names anywhere).
  allProjects: Project[]
  activeCardCount: number
  onDeleted: () => void
}

export function EditProjectModal({
  open,
  onClose,
  project,
  allProjects,
  activeCardCount,
  onDeleted,
}: Props) {
  const [title, setTitle] = useState('')
  const [group, setGroup] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Suggestions derived from the user's existing projects. When a user
  // already has a "Work" group and opens the edit dialog, "Work" shows
  // up as a one-click chip.
  const groupSuggestions = useMemo(
    () => collectGroupNames(allProjects),
    [allProjects],
  )
  // Two-step delete: first click arms; second click (within the same
  // open session) actually deletes. Resets whenever the modal opens.
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !project) return
    setTitle(project.title)
    setGroup(project.group ?? '')
    setConfirmDelete(false)
    setError(null)
    setSubmitting(false)
    setDeleting(false)
  }, [open, project])

  if (!project) return null

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!project) return

    const trimmed = title.trim()
    if (!trimmed) {
      setError('Project name is required.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await updateProject(project.id, {
        title: trimmed,
        group: group.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!project) return
    if (activeCardCount > 0) return // defensive — the button is disabled

    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    setDeleting(true)
    setError(null)
    try {
      await deleteProject(project.id)
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete project.')
      setDeleting(false)
    }
  }

  const deleteBlocked = activeCardCount > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit project"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting || deleting}
            className="rounded-md px-3 py-1.5 text-sm text-[var(--kb-text-secondary)] hover:bg-[var(--kb-board-bg)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-project-form"
            disabled={submitting || deleting}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id="edit-project-form" onSubmit={handleSave} className="space-y-4">
        <Field label="Project name" required>
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-3 py-1.5 text-sm text-[var(--kb-text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            maxLength={80}
          />
        </Field>

        <Field label="Group" hint="Leave blank for ungrouped.">
          <input
            type="text"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="w-full rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-3 py-1.5 text-sm text-[var(--kb-text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            maxLength={40}
          />
          {groupSuggestions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {groupSuggestions.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroup(g)}
                  className="rounded-full border border-[var(--kb-card-border)] bg-[var(--kb-board-bg)] px-2.5 py-0.5 text-xs text-[var(--kb-text-secondary)] hover:border-[var(--kb-card-border)] hover:bg-[var(--kb-board-bg)]"
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </Field>

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </form>

      {/* Danger zone — visually separated, destructive action. Two-step
          confirm protects against accidental clicks. */}
      <div className="mt-6 rounded-md border border-red-200 bg-red-50/40 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-red-900">
              Delete project
            </div>
            <p className="mt-0.5 text-xs text-red-700/90">
              {deleteBlocked
                ? `This project has ${activeCardCount} active card${
                    activeCardCount === 1 ? '' : 's'
                  }. Archive or move them before deleting.`
                : 'This permanently removes the project. Archived cards from this project are left orphaned.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteBlocked || deleting}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              deleteBlocked
                ? 'cursor-not-allowed bg-red-100 text-red-400'
                : confirmDelete
                  ? 'bg-red-700 text-white hover:bg-red-800'
                  : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {deleting
              ? 'Deleting…'
              : confirmDelete
                ? 'Confirm delete'
                : 'Delete project'}
          </button>
        </div>
      </div>
    </Modal>
  )
}


function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline gap-1">
        <span className="text-xs font-medium text-[var(--kb-text-secondary)]">{label}</span>
        {required && <span className="text-xs text-red-500">*</span>}
        {hint && <span className="ml-1 text-xs text-[var(--kb-text-muted)]">{hint}</span>}
      </div>
      {children}
    </label>
  )
}
