// ---------------------------------------------------------------------------
// ExportModal
//
// Per-project export dialog. Opens from the StatsBar's download icon
// (alongside the existing + add card button). Lets the user choose:
//
//   - Scope:        "Current view"  (filtered visible cards) OR
//                   "All cards"     (every active card, ignoring filter)
//   - Format:       Markdown (.md)  OR  CSV (.csv)
//   - Archived:     checkbox to also fetch + append archived cards
//
// On Export, the modal assembles the chosen card set, runs it through
// `cardsToExportMarkdown` / `cardsToExportCsv` from src/lib/cardExport,
// and triggers a browser download via Blob + URL.createObjectURL. The
// object URL is revoked after a short delay so the browser has a
// moment to start the download before we release it (same pattern
// used by the import-template downloader in ImportModal).
//
// Archived cards are subscribed via `useArchivedCards` whenever the
// modal is open, so a stale listener never lingers when the modal
// closes. We do NOT lazily start the subscription on Export click —
// the read latency would manifest as a visible delay between click
// and download. The trade-off is a brief Firestore listener while
// the dialog sits open; entirely acceptable for an on-demand action.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { Modal } from './Modal'
import { useArchivedCards } from '../../hooks/useArchivedCards'
import {
  cardsToExportMarkdown,
  cardsToExportCsv,
  exportFilename,
} from '../../lib/cardExport'
import type { Card, Project } from '../../types'
import { useToast } from '../toast/ToastProvider'

// Two-option discriminated unions. `as const` arrays let us derive the
// type below without a separate `type Scope = 'current' | 'all'`
// declaration that would have to stay in lockstep manually.
type Scope = 'current' | 'all'
type Format = 'md' | 'csv'

interface Props {
  open: boolean
  onClose: () => void
  // The active project. Null while no project is selected — in that
  // state the parent never opens the modal, so we treat null as a
  // safety case and render nothing.
  project: Project | null
  // Cards visible after applying the active tag filter, across all
  // columns. Caller (Board) is the source of truth for the filter so
  // it produces this list once and hands it down.
  visibleCards: Card[]
  // Every active (non-archived) card on the project, ignoring any
  // filter. Used by the "All cards" scope.
  allCards: Card[]
  // Auth context required by the archived-cards subscription. Null
  // values short-circuit the hook to an empty list; both are
  // generally non-null by the time the dialog opens.
  uid: string | null
  userEmail: string | null
}

export function ExportModal({
  open,
  onClose,
  project,
  visibleCards,
  allCards,
  uid,
  userEmail,
}: Props) {
  // ---- Form state ----
  const [scope, setScope] = useState<Scope>('current')
  const [format, setFormat] = useState<Format>('md')
  const [includeArchived, setIncludeArchived] = useState(false)
  const toast = useToast()

  // Archived cards subscription. We pass the project id only while
  // the modal is open AND the user has asked to include archived; at
  // any other time we hand null so the hook does not start a listener
  // it would not need. This keeps the Firestore listener footprint
  // proportional to actual user intent, not to "modal mounted at all".
  const archivedProjectId =
    open && includeArchived && project ? project.id : null
  const { cards: archivedCards, error: archivedError } = useArchivedCards(
    open ? uid : null,
    open ? userEmail : null,
    archivedProjectId,
  )

  // Modal mount safety net. App.tsx never renders the dialog with a
  // null project (the Export button is in StatsBar, which only
  // renders inside an active board), but we still guard so the
  // component is tolerant of future call-site changes.
  if (!project) return null

  // Resolve the card set the user has asked for. "Current view" pulls
  // from the pre-filtered list; "All cards" pulls from the unfiltered
  // active list. Archived cards are appended verbatim when included.
  function resolveCardSet(): Card[] {
    const base = scope === 'current' ? visibleCards : allCards
    if (!includeArchived) return base
    // Archived stream is provably disjoint from the active stream
    // (`archived == true` filter inside useArchivedCards), so a flat
    // concat is correct — no dedupe pass needed.
    return [...base, ...archivedCards]
  }

  // ---- Export action ----
  function handleExport() {
    if (!project) return

    // If "Include archived" is on but the archived stream errored
    // (typically a missing composite index), surface a toast and
    // bail rather than silently shipping an incomplete export.
    if (includeArchived && archivedError) {
      toast.push(`Could not load archived cards: ${archivedError}`, 'error')
      return
    }

    const cards = resolveCardSet()

    // No cards to export: friendly toast, no file. The most common
    // way into this state is the empty board + filter combination,
    // which is rare but possible.
    if (cards.length === 0) {
      toast.push('No cards to export.', 'info')
      return
    }

    // Build the payload. MIME types match the file extension: text/
    // markdown for .md (which most browsers + GitHub render as
    // markdown), text/csv with UTF-8 charset for .csv.
    let payload: string
    let mime: string
    if (format === 'md') {
      payload = cardsToExportMarkdown(cards, project)
      mime = 'text/markdown;charset=utf-8'
    } else {
      payload = cardsToExportCsv(cards, project)
      mime = 'text/csv;charset=utf-8'
    }

    // Trigger the download via a temporary <a download> anchor. Same
    // pattern as ImportModal's template downloader (Session 8). The
    // anchor is appended to the body for Firefox compatibility — some
    // older Firefox versions would otherwise refuse the click.
    try {
      const blob = new Blob([payload], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = exportFilename(project.title, format)
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // 1 s is well clear of any reasonable download initiation; the
      // browser holds onto the blob just long enough to start the
      // download before we revoke the URL.
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      toast.push(
        `Exported ${cards.length} card${cards.length === 1 ? '' : 's'}.`,
        'success',
      )
      onClose()
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : 'Export failed.',
        'error',
      )
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export Cards"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-[var(--kb-text-secondary)] hover:bg-[var(--kb-board-bg)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700"
          >
            Export
          </button>
        </>
      }
    >
      <div className="space-y-5 text-sm">
        {/* Scope radio group. Defaults to "Current view" so the user's
            active filter is respected — switching to "All cards" is
            an explicit override. */}
        <Fieldset legend="Cards to export">
          <RadioOption
            name="export-scope"
            value="current"
            checked={scope === 'current'}
            onChange={() => setScope('current')}
            label="Current view"
            help="Cards visible across all columns under the active tag filter."
          />
          <RadioOption
            name="export-scope"
            value="all"
            checked={scope === 'all'}
            onChange={() => setScope('all')}
            label="All cards"
            help="Every card on the board, ignoring any active filter."
          />
        </Fieldset>

        {/* Format radio group. Markdown is the default — the same shape
            users get from the per-card clipboard copy, so a flat dump
            in Markdown is conceptually familiar. CSV is the structured
            alternative for spreadsheets. */}
        <Fieldset legend="Format">
          <RadioOption
            name="export-format"
            value="md"
            checked={format === 'md'}
            onChange={() => setFormat('md')}
            label="Markdown (.md)"
          />
          <RadioOption
            name="export-format"
            value="csv"
            checked={format === 'csv'}
            onChange={() => setFormat('csv')}
            label="CSV (.csv)"
          />
        </Fieldset>

        {/* Archived checkbox. Off by default — most users want a
            current-state export; archived rows are appended verbatim
            when on, with the "Status: Archived" / Archived=Yes flag
            already injected by the formatter. */}
        <label className="flex cursor-pointer items-center gap-2 text-[var(--kb-text-secondary)]">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--kb-card-border)] text-violet-600 focus:ring-violet-500"
          />
          <span>Include archived cards</span>
        </label>

        {/* Inline notice for the archived-fetch error case. Non-fatal
            until the user clicks Export with the checkbox on, but
            previewing the issue here lets them clear the checkbox
            instead of getting an error toast. */}
        {includeArchived && archivedError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            Could not load archived cards: {archivedError}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Form primitives — kept inline since they exist only here. If a
// future modal needs the same radio group shape we can promote these
// into a shared form-controls module.
// ---------------------------------------------------------------------------

function Fieldset({
  legend,
  children,
}: {
  legend: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--kb-text-muted)]">
        {legend}
      </legend>
      <div className="space-y-1.5">{children}</div>
    </fieldset>
  )
}

// Single radio row. `help` is an optional second-line hint shown in
// muted text — used by the Scope group where each option's behavior
// is worth a one-line clarification.
function RadioOption({
  name,
  value,
  checked,
  onChange,
  label,
  help,
}: {
  name: string
  value: string
  checked: boolean
  onChange: () => void
  label: string
  help?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-[var(--kb-text-secondary)]">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 border-[var(--kb-card-border)] text-violet-600 focus:ring-violet-500"
      />
      <span className="flex-1">
        <span>{label}</span>
        {help && (
          <span className="block text-xs text-[var(--kb-text-muted)]">
            {help}
          </span>
        )}
      </span>
    </label>
  )
}
