// ---------------------------------------------------------------------------
// ImportModal
//
// YAML / Markdown card import. Three interactions from a single dialog:
//
//   1. "Download import template" — generates a .yaml template based on
//      the active project's columns and saves it via a blob URL. The
//      template works as a starting point users (or AI assistants) can
//      edit and re-import.
//
//   2. "Choose file" — opens a file picker accepting .yaml, .yml, .md.
//      The file contents are parsed and validated; on any error the
//      error list is shown inline and nothing is written. On success
//      all validated cards are batch-written to Firestore and the
//      dialog closes with a success toast from the caller.
//
//   3. "Cancel" — dismisses the dialog.
//
// Error rendering matches the spec's format: "Card #N · field · reason".
// The all-or-nothing semantics live in the parser (it returns either
// errors OR cards, never both).
// ---------------------------------------------------------------------------

import { useRef, useState } from 'react'
import { Modal } from './Modal'
import { generateTemplate, parseImport, type ImportError } from '../../lib/importParser'
import { createCardsBatch } from '../../lib/firestore'
import type { Project } from '../../types'
import { useToast } from '../toast/ToastProvider'

interface Props {
  open: boolean
  onClose: () => void
  userId: string
  project: Project | null
}

export function ImportModal({ open, onClose, userId, project }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [errors, setErrors] = useState<ImportError[]>([])
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  function handleDownloadTemplate() {
    if (!project) return
    const text = generateTemplate(project)
    const blob = new Blob([text], { type: 'application/x-yaml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // Filename derived from project title, sanitized to a safe slug.
    const safe = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    a.download = `${safe || 'kanban'}-import-template.yaml`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Give the browser a moment to start the download before releasing
    // the blob URL. 1s is well clear of any reasonable initiation.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the input so picking the same file twice in a row still
    // fires the change event.
    e.target.value = ''
    if (!file || !project) return

    setSubmitting(true)
    setErrors([])
    try {
      const text = await file.text()
      const result = parseImport(text, project)
      if (!result.ok) {
        setErrors(result.errors)
        return
      }
      await createCardsBatch(
        userId,
        // Project owner uid stamped onto each imported card so
        // security rules can authorize owner-side reads. Members
        // can also import — they pass the OWNER's uid here, not
        // their own.
        project.userId,
        // Full project member list (lowercased emails) at import
        // time. Same purpose as for `createCard`: per-document
        // membership predicate so rules can authorize cross-member
        // reads without a get() on the parent project.
        project.memberEmails,
        project.id,
        result.cards.map((c) => ({
          columnId: c.columnId,
          title: c.title,
          description: c.description,
          priority: c.priority,
          dueDate: c.dueDate,
          tags: c.tags,
          links: c.links,
          notes: c.notes,
        })),
      )
      const count = result.cards.length
      toast.push(
        `Imported ${count} card${count === 1 ? '' : 's'}.`,
        'success',
      )
      onClose()
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : 'Import failed.',
        'error',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!project) return null

  const hasErrors = errors.length > 0

  return (
    <Modal
      open={open}
      onClose={() => {
        setErrors([])
        onClose()
      }}
      title={hasErrors ? 'Import failed — 0 cards added' : 'Import cards'}
      wide
      footer={
        <>
          <button
            type="button"
            onClick={() => {
              setErrors([])
              onClose()
            }}
            disabled={submitting}
            className="rounded-md px-3 py-1.5 text-sm text-[var(--kb-text-secondary)] hover:bg-[var(--kb-board-bg)]"
          >
            {hasErrors ? 'OK' : 'Cancel'}
          </button>
          {!hasErrors && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-60"
            >
              {submitting ? 'Importing…' : 'Choose file'}
            </button>
          )}
        </>
      }
    >
      {/* Hidden file input — triggered by the "Choose file" footer button
          so the file-picker UX matches the modal's visual hierarchy. */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".yaml,.yml,.md"
        onChange={handleFileSelected}
        className="hidden"
      />

      {hasErrors ? (
        <div>
          <p className="mb-3 text-sm text-[var(--kb-text-secondary)]">
            Fix the issues below and re-import.
          </p>
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900">
            {errors.map((e, i) => (
              <li key={i} className="font-mono">
                Card #{e.cardIndex} · {e.field} · {e.reason}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setErrors([])
              fileInputRef.current?.click()
            }}
            className="mt-3 text-sm text-violet-600 hover:underline"
          >
            Try a different file
          </button>
        </div>
      ) : (
        <div className="space-y-4 text-sm text-[var(--kb-text-secondary)]">
          <p>
            Import cards into{' '}
            <span className="font-medium">{project.title}</span> from a
            YAML or Markdown file. All-or-nothing: if any card fails
            validation, no cards are imported and errors are listed
            here.
          </p>

          <div className="rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-board-bg)] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-[var(--kb-text-primary)]">
                  Download import template
                </div>
                <p className="mt-0.5 text-xs text-[var(--kb-text-muted)]">
                  Pre-filled with this project's columns and example
                  cards.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="shrink-0 rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-3 py-1.5 text-xs font-medium text-[var(--kb-text-secondary)] hover:bg-[var(--kb-board-bg)]"
              >
                Download .yaml
              </button>
            </div>
          </div>

          <div className="text-xs text-[var(--kb-text-muted)]">
            Accepted file extensions: <code>.yaml</code>, <code>.yml</code>,{' '}
            <code>.md</code>. The top-level document must be a{' '}
            <code>cards:</code> list.
          </div>
        </div>
      )}
    </Modal>
  )
}
