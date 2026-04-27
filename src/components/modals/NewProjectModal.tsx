// ---------------------------------------------------------------------------
// NewProjectModal
//
// Dialog for creating a new project. Collects:
//
//   - Project name (required, trimmed)
//   - Group (optional — free-form text, with a handful of shortcut
//     suggestions so common groupings are a single click). The group
//     string is stored verbatim on the project; the sidebar's color
//     mapping is hash-based and does not care what the value is.
//   - Column preset: Simple / Dev / Custom. For "Custom" the user types
//     comma-separated column names so the dialog stays single-step.
//
// On save we call `createProject` in firestore.ts and invoke `onCreated`
// with the new project's ID so the parent can auto-select it in the
// sidebar.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import { Modal } from './Modal'
import { createProject } from '../../lib/firestore'
import { collectGroupNames } from '../../lib/projectUtils'
import type { Project } from '../../types'

// Preset column sets available when creating a new project. Matches the
// spec's column preset picker. "Custom" is handled specially below.
const COLUMN_PRESETS = {
  simple: ['To Do', 'Doing', 'Done'],
  dev: ['Backlog', 'Ready', 'In Dev', 'Review', 'Done'],
} as const

type PresetKey = 'simple' | 'dev' | 'custom'

interface Props {
  open: boolean
  onClose: () => void
  userId: string
  // The creator's email address, seeded into the project's `members`
  // map and `memberEmails` array. Required because the shared-projects
  // query keys on email — without this, the project would not show up
  // in `useProjects`'s shared-side subscription either (which is fine
  // for the owner because they match via `userId`, but we keep both
  // sides consistent so legacy code paths stay simple).
  userEmail: string
  // All of the user's existing projects. Used to derive one-click group
  // suggestions from groups they have already created — so the dialog
  // carries zero hardcoded group names and adapts to any taxonomy the
  // user invents.
  existingProjects: Project[]
  onCreated: (projectId: string) => void
}

export function NewProjectModal({
  open,
  onClose,
  userId,
  userEmail,
  existingProjects,
  onCreated,
}: Props) {
  const [title, setTitle] = useState('')
  const [group, setGroup] = useState('')
  const [preset, setPreset] = useState<PresetKey>('simple')
  const [customColumns, setCustomColumns] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Unique, non-null group names from the user's existing projects.
  // Case-insensitive dedupe preserves first-seen casing.
  const groupSuggestions = useMemo(
    () => collectGroupNames(existingProjects),
    [existingProjects],
  )

  // Reset form whenever the modal opens so a cancelled attempt does not
  // leak into the next one.
  useEffect(() => {
    if (!open) return
    setTitle('')
    setGroup('')
    setPreset('simple')
    setCustomColumns('')
    setError(null)
    setSubmitting(false)
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Project name is required.')
      return
    }

    // Resolve the starting column titles based on the chosen preset. For
    // the "custom" option we split on commas; empty entries are dropped
    // and whitespace is trimmed. If the user picks custom but leaves the
    // field blank we fall back to a single "To Do" column so the project
    // is at least functional on first load.
    let columnTitles: string[]
    if (preset === 'custom') {
      columnTitles = customColumns
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (columnTitles.length === 0) columnTitles = ['To Do']
    } else {
      columnTitles = [...COLUMN_PRESETS[preset]]
    }

    setSubmitting(true)
    setError(null)
    try {
      const id = await createProject({
        userId,
        userEmail,
        title: trimmedTitle,
        group: group.trim() || null,
        columnTitles,
      })
      onCreated(id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create project.')
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
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
            form="new-project-form"
            disabled={submitting}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create project'}
          </button>
        </>
      }
    >
      <form id="new-project-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Project name" required>
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Launch checklist"
            className="w-full rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-3 py-1.5 text-sm text-[var(--kb-text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            maxLength={80}
          />
        </Field>

        <Field label="Group" hint="Optional. Used to organize projects in the sidebar.">
          <input
            type="text"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="Leave blank for ungrouped"
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

        <Field label="Starting columns">
          <div className="space-y-1.5">
            <PresetOption
              value="simple"
              current={preset}
              onChange={setPreset}
              label="Simple"
              sample="To Do · Doing · Done"
            />
            <PresetOption
              value="dev"
              current={preset}
              onChange={setPreset}
              label="Dev"
              sample="Backlog · Ready · In Dev · Review · Done"
            />
            <PresetOption
              value="custom"
              current={preset}
              onChange={setPreset}
              label="Custom"
              sample="Enter your own, comma-separated"
            />
          </div>
          {preset === 'custom' && (
            <input
              type="text"
              value={customColumns}
              onChange={(e) => setCustomColumns(e.target.value)}
              placeholder="e.g. Inbox, Now, Next, Waiting, Done"
              className="mt-2 w-full rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-3 py-1.5 text-sm text-[var(--kb-text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          )}
        </Field>

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </form>
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

function PresetOption({
  value,
  current,
  onChange,
  label,
  sample,
}: {
  value: PresetKey
  current: PresetKey
  onChange: (v: PresetKey) => void
  label: string
  sample: string
}) {
  const active = value === current
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition ${
        active
          ? 'border-violet-500 bg-violet-50'
          : 'border-[var(--kb-card-border)] hover:border-[var(--kb-card-border)] hover:bg-[var(--kb-board-bg)]'
      }`}
    >
      <span className="text-sm font-medium text-[var(--kb-text-primary)]">{label}</span>
      <span className="text-xs text-[var(--kb-text-muted)]">{sample}</span>
    </button>
  )
}
