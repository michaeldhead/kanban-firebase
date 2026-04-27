// ---------------------------------------------------------------------------
// CardForm
//
// A shared form that renders all editable card fields. Used by both
// AddCardModal (where `initial` is empty / defaulted) and the edit mode
// of CardDialog (where `initial` is populated from an existing card).
//
// Fields, in the order they appear:
//   - Title (required)
//   - Column (select, defaulted to the first column on add)
//   - Priority (select, or "No priority")
//   - Due date (native date input, stored as YYYY-MM-DD)
//   - Tags (comma-separated input + one-click suggestions from existing
//     project-wide tags)
//   - Description (textarea)
//   - Links (dynamic list of label + URL rows)
//   - Notes (textarea — not shown in the inline `···` expand)
//
// The form calls `onSubmit` with the normalized values; the wrapping
// modal is responsible for writing to Firestore and closing. We do not
// lock the form state while submitting — the wrapper disables the
// submit button and waits on the promise.
//
// State reset between cards:
//   The form does NOT carry any reset-on-prop-change effect — the
//   wrapping modals are responsible for unmounting the form between
//   distinct uses, which means the `useState` initializers naturally
//   reseed from `initial` on the next mount. CardDialog uses
//   `key={openCardId}` so a brand-new instance mounts each time the
//   user opens a different card. AddCardModal does not use a key, but
//   its parent only renders the modal while `addCardOpen` is true, so
//   the form unmounts on close and remounts on the next open.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import type { CardLink, Column, Priority } from '../../types'
import { ALLOWED_LINK_SCHEMES } from '../../lib/importParser'

// Internal link row that carries a stable id alongside the user-visible
// fields. Using the id as the React key on the form rows means the
// `key`-driven identity stays correct under reorder / mid-list deletes;
// an array index would re-key the same DOM element to a different
// logical row whenever the list shrinks. The id is stripped before
// `onSubmit` so the public `CardLink` shape is unchanged.
interface LinkRow {
  id: string
  label: string
  url: string
}

// Module-level id generator. The id only has to be unique across the
// rows of a single form instance, so any reasonably collision-resistant
// scheme is fine. We prefer the Web Crypto UUID where available and
// fall back to a counter + timestamp + random suffix for older
// browsers.
let linkIdSeq = 0
function genLinkId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  linkIdSeq += 1
  return `link-${Date.now()}-${linkIdSeq}-${Math.random().toString(36).slice(2)}`
}

// Convert an inbound `CardLink[]` (from `initial.links`) into the
// internal id-bearing row shape the form uses. Called once via the
// `useState` lazy initializer; the form does not re-seed afterward
// because the wrapping modals unmount the form between distinct
// uses (see header).
function seedLinkRows(links: CardLink[] | undefined): LinkRow[] {
  if (!links) return []
  return links.map((l) => ({ id: genLinkId(), label: l.label, url: l.url }))
}

export interface CardFormValues {
  title: string
  columnId: string
  priority: Priority | null
  dueDate: string | null
  tags: string[]
  description: string | null
  links: CardLink[]
  notes: string | null
}

interface Props {
  formId: string
  // Columns in display order. The select reflects this order.
  columns: Column[]
  // Union of all tags already used on cards in this project, offered as
  // one-click additions below the tag input.
  existingTags: string[]
  initial?: Partial<CardFormValues>
  onSubmit: (values: CardFormValues) => void
}

const PRIORITIES: Priority[] = ['Critical', 'High', 'Medium', 'Low']

export function CardForm({
  formId,
  columns,
  existingTags,
  initial,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [columnId, setColumnId] = useState(
    initial?.columnId ?? columns[0]?.id ?? '',
  )
  const [priority, setPriority] = useState<Priority | null>(
    initial?.priority ?? null,
  )
  const [dueDate, setDueDate] = useState<string>(initial?.dueDate ?? '')
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [description, setDescription] = useState(initial?.description ?? '')
  // Links carry an id internally so the React key stays stable across
  // mid-list deletes / reorders. `seedLinkRows` runs once at mount and
  // converts the inbound `CardLink[]` to `LinkRow[]`. No re-seed effect
  // — see the file header for why.
  const [links, setLinks] = useState<LinkRow[]>(() =>
    seedLinkRows(initial?.links),
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  function addCurrentTagInput() {
    const parts = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    // Dedupe case-insensitively against whatever is already selected.
    const lower = new Set(tags.map((t) => t.toLowerCase()))
    const additions = parts.filter((p) => !lower.has(p.toLowerCase()))
    if (additions.length > 0) setTags((t) => [...t, ...additions])
    setTagInput('')
  }

  function removeTag(tag: string) {
    setTags((t) => t.filter((x) => x !== tag))
  }

  function toggleSuggestion(tag: string) {
    setTags((t) =>
      t.some((x) => x.toLowerCase() === tag.toLowerCase())
        ? t.filter((x) => x.toLowerCase() !== tag.toLowerCase())
        : [...t, tag],
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Title is required.')
      return
    }
    if (!columnId) {
      setError('This project has no columns yet.')
      return
    }

    // Make sure any unsubmitted text in the tag input is captured before
    // we submit the form — otherwise users lose tags they typed but
    // forgot to press Enter on.
    let finalTags = tags
    if (tagInput.trim()) {
      const parts = tagInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const lower = new Set(tags.map((t) => t.toLowerCase()))
      const extras = parts.filter((p) => !lower.has(p.toLowerCase()))
      finalTags = [...tags, ...extras]
    }

    // Filter out blank link rows so partially-filled links do not
    // pollute the saved card. Keep a row only if both label AND url
    // are non-empty after trim, and the URL uses a permitted scheme
    // (http/https). The native `<input type="url">` validation is
    // bypassed if the field value is set programmatically, and the
    // browser also accepts `javascript:` URLs as syntactically valid
    // — neither of those is something we want to reach Firestore,
    // because the link is rendered later as `<a href={url}>` and a
    // `javascript:` href executes on click. We share the regex with
    // the import parser so both write paths enforce the same
    // allow-list.
    const cleanLinks = links
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label && l.url && ALLOWED_LINK_SCHEMES.test(l.url))

    onSubmit({
      title: trimmed,
      columnId,
      priority,
      dueDate: dueDate || null,
      tags: finalTags,
      description: description.trim() || null,
      links: cleanLinks,
      notes: notes.trim() || null,
    })
  }

  // Suggestions are existing tags not already selected.
  const selectedLower = new Set(tags.map((t) => t.toLowerCase()))
  const suggestions = existingTags.filter(
    (t) => !selectedLower.has(t.toLowerCase()),
  )

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      <Field label="Title" required>
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-3 py-1.5 text-sm text-[var(--kb-text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          maxLength={140}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Column">
          <select
            value={columnId}
            onChange={(e) => setColumnId(e.target.value)}
            className="w-full rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-2.5 py-1.5 text-sm text-[var(--kb-text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          >
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Priority">
          <select
            value={priority ?? ''}
            onChange={(e) =>
              setPriority(e.target.value ? (e.target.value as Priority) : null)
            }
            className="w-full rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-2.5 py-1.5 text-sm text-[var(--kb-text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          >
            <option value="">No priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Due date" hint="Optional (YYYY-MM-DD)">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-3 py-1.5 text-sm text-[var(--kb-text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
      </Field>

      <Field label="Tags" hint="Press Enter or comma to add.">
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-2 py-1.5 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500">
          {tags.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded-full bg-[var(--kb-board-bg)] px-2 py-0.5 text-xs text-[var(--kb-text-secondary)]"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="text-[var(--kb-text-muted)] hover:text-[var(--kb-text-secondary)]"
                title="Remove tag"
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addCurrentTagInput()
              } else if (
                e.key === 'Backspace' &&
                tagInput === '' &&
                tags.length > 0
              ) {
                // Delete the last tag when the user backspaces on an
                // empty input — standard multi-chip input affordance.
                setTags((t) => t.slice(0, -1))
              }
            }}
            onBlur={addCurrentTagInput}
            placeholder={tags.length === 0 ? 'e.g. auth, backend' : ''}
            className="min-w-[8ch] flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        {suggestions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {suggestions.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleSuggestion(t)}
                className="rounded-full border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-2 py-0.5 text-xs text-[var(--kb-text-muted)] hover:border-[var(--kb-card-border)] hover:text-[var(--kb-text-secondary)]"
              >
                + {t}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-3 py-1.5 text-sm text-[var(--kb-text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
      </Field>

      <Field label="Links" hint="Label + URL pairs.">
        <div className="space-y-2">
          {links.map((l) => (
            <div key={l.id} className="flex gap-2">
              <input
                type="text"
                placeholder="Label"
                value={l.label}
                onChange={(e) =>
                  setLinks((ls) =>
                    ls.map((x) =>
                      x.id === l.id ? { ...x, label: e.target.value } : x,
                    ),
                  )
                }
                className="w-1/3 rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-2.5 py-1 text-sm text-[var(--kb-text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
              <input
                type="url"
                placeholder="https://…"
                value={l.url}
                onChange={(e) =>
                  setLinks((ls) =>
                    ls.map((x) =>
                      x.id === l.id ? { ...x, url: e.target.value } : x,
                    ),
                  )
                }
                className="flex-1 rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-2.5 py-1 text-sm text-[var(--kb-text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
              <button
                type="button"
                onClick={() =>
                  setLinks((ls) => ls.filter((x) => x.id !== l.id))
                }
                className="rounded px-2 text-[var(--kb-text-muted)] hover:bg-[var(--kb-board-bg)] hover:text-[var(--kb-text-secondary)]"
                title="Remove link"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setLinks((ls) => [
                ...ls,
                { id: genLinkId(), label: '', url: '' },
              ])
            }
            className="text-xs text-violet-600 hover:text-violet-800"
          >
            + Add link
          </button>
        </div>
      </Field>

      <Field
        label="Notes"
        hint="Private notes — not shown on the card's inline expand."
      >
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-3 py-1.5 text-sm text-[var(--kb-text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
      </Field>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </form>
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
