// ---------------------------------------------------------------------------
// StatsBar
//
// The horizontal strip under the project header. Shows the four
// at-a-glance counts (total, critical, due-this-week, overdue), the
// per-project card sort selector on the left, and a round "+" button on
// the far right that opens the new-card dialog.
//
// Theme awareness:
//   The bar's background uses the `--kb-card-bg` CSS variable so it
//   follows whichever theme + mode is active. All text colors carry
//   `dark:` Tailwind variants so the numbers and labels stay legible
//   on the darker surfaces.
// ---------------------------------------------------------------------------

import type { CardStats } from '../../lib/cardStats'
import type { SortMode } from '../../types'
import { SortModeSelector } from './SortModeSelector'

interface Props {
  stats: CardStats
  sortMode: SortMode
  onChangeSortMode: (mode: SortMode) => void
  onAddCard: () => void
  // Open the export dialog. Wired in by Board so the bar's far-right
  // cluster (export + add) lives next to the existing add-card button
  // — keeping all "card output" actions in one visual group.
  onOpenExport: () => void
}

export function StatsBar({
  stats,
  sortMode,
  onChangeSortMode,
  onAddCard,
  onOpenExport,
}: Props) {
  return (
    <div className="flex items-center gap-4 border-b border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-6 py-3">
      <SortModeSelector mode={sortMode} onChange={onChangeSortMode} />

      <Divider />

      <Stat label="Total" value={stats.total} />
      <Divider />
      <Stat label="Critical" value={stats.critical} tone="red" />
      <Divider />
      <Stat label="Due this week" value={stats.dueThisWeek} tone="amber" />
      <Divider />
      <Stat label="Overdue" value={stats.overdue} tone="red" />

      {/* Right-side action cluster: Export then Add. Export is rendered
          first so the primary "+" stays at the far right where users
          already expect it; Export is the secondary action and a
          neutral icon-only affordance. Both share the round 9×9 hit
          target so they read as a matched pair. */}
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onOpenExport}
          title="Export board"
          aria-label="Export board"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] text-[var(--kb-text-secondary)] transition hover:bg-[var(--kb-board-bg)] hover:text-[var(--kb-text-primary)]"
        >
          <DownloadIcon />
        </button>
        <button
          onClick={onAddCard}
          title="Add a card"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--kb-accent-primary)] text-[var(--kb-accent-text)] shadow-sm transition hover:brightness-110"
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  )
}

// A single "{N} {label}" pair. `tone` tints the number for the two
// attention-seeking stats (critical + overdue in red, due-this-week in
// amber); everything else renders in the default slate.
function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'red' | 'amber'
}) {
  const valueClass =
    tone === 'red'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'amber'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-900 dark:text-slate-100'
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-lg font-semibold ${valueClass}`}>{value}</span>
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  )
}

function Divider() {
  return (
    <span
      className="h-4 w-px bg-slate-200 dark:bg-slate-700"
      aria-hidden
    />
  )
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

// lucide-react Download glyph, inlined to match the rest of the app's
// icon style (no lucide-react dependency in this project). Three
// strokes: the shelf at the bottom (bracket), the arrowhead, and the
// vertical shaft. Sized to mirror PlusIcon so the two buttons read as
// the same visual class.
function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  )
}
