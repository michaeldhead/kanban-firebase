// ---------------------------------------------------------------------------
// FilterBar
//
// Horizontal "Filter by tag" strip rendered between the StatsBar and the
// columns scroll region. Lets the user narrow visible cards by one or
// more tags — the filter is purely client-side (no Firestore work) and
// ephemeral (state lives in the Board component, not localStorage), so
// it resets when the user switches projects or reloads the app.
//
// Behavior:
//   - One pill per unique tag found across all cards in the active
//     project. When the project has no tags at all, the bar is hidden
//     entirely (parent gates rendering on `allTags.length > 0`, and
//     this component also short-circuits as a defense in depth).
//   - Clicking a pill toggles its tag in/out of the active filter set.
//     Multiple active pills mean "match cards that have AT LEAST ONE
//     of the active tags" (OR logic, applied in Column).
//   - A "Clear" button appears at the right end of the row when at
//     least one filter is active, and resets the set in one click.
//
// Layout / theming:
//   - The whole row scrolls horizontally on narrow viewports so a
//     project with many tags never wraps and never pushes the columns
//     down. The kb-scroll-thin utility from index.css gives the
//     scrollbar a slim themed treatment that matches the board
//     columns scrollbar below.
//   - Colors come exclusively from the var(--kb-*) design tokens so
//     all eight themes × light/dark variants pick the bar up for free.
//     The active pill uses --kb-accent-primary / --kb-accent-text (the
//     same accent the "+ add card" round button uses), and inactive
//     pills use the card-border + text-secondary tokens against a
//     transparent background so they sit comfortably on whatever
//     surface the bar lives on.
// ---------------------------------------------------------------------------

interface Props {
  // The full sorted list of unique tag values used by any card in the
  // current project. The parent component derives this; we just render.
  allTags: string[]
  // Tags currently selected as filters. Membership is the only thing
  // that matters here — order is whatever the parent decides.
  activeTagFilters: string[]
  // Toggle a single tag. Parent owns the state and decides whether
  // the click adds or removes.
  onToggleTag: (tag: string) => void
  // Reset the active set to empty. Only meaningful (and only shown)
  // when at least one filter is active.
  onClear: () => void
}

export function FilterBar({
  allTags,
  activeTagFilters,
  onToggleTag,
  onClear,
}: Props) {
  // Defense in depth — the parent already gates on this, but a stray
  // direct render with an empty list should not produce an empty
  // bordered strip.
  if (allTags.length === 0) return null

  // O(n) membership lookup against the active set. The set is
  // typically tiny (a handful of pills at most), so re-creating it on
  // every render is cheaper than the bookkeeping a useMemo would add.
  const activeSet = new Set(activeTagFilters)
  const hasActive = activeTagFilters.length > 0

  return (
    <div
      // `flex-nowrap` is the CSS default for flex containers but we
      // declare it explicitly so future changes that swap `flex` for
      // `flex-wrap` (which would let pills wrap) can be caught at
      // review time. `overflow-x-auto` enables horizontal scroll once
      // the pills overflow; `kb-scroll-thin` (in index.css) renders a
      // slim themed scrollbar with track + thumb colors that follow
      // the active theme via `--kb-card-border`. The same class is
      // applied to the board columns scroll surface below the bar so
      // the two horizontal scrollbars on this view look identical.
      className="kb-scroll-thin flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden border-b border-[var(--kb-card-border)] bg-[var(--kb-board-bg)] px-6 py-2"
      role="toolbar"
      aria-label="Filter cards by tag"
    >
      {/* Leading label. Uses the muted text token so it reads as
          chrome rather than a primary action. `whitespace-nowrap`
          prevents the label from collapsing when the row scrolls. */}
      <span className="shrink-0 whitespace-nowrap text-xs text-[var(--kb-text-muted)]">
        Filter by tag:
      </span>

      {/* Pills row. `flex-nowrap` ensures the pills scroll horizontally
          rather than wrapping onto a second line — matches the spec's
          "scroll horizontally on narrow viewports without wrapping". */}
      <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
        {allTags.map((tag) => {
          const active = activeSet.has(tag)
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onToggleTag(tag)}
              aria-pressed={active}
              className={
                // Compact rounded-full pill. We swap the surface +
                // border + text colors based on the active flag rather
                // than overlaying a separate "active" indicator — the
                // inverted color is itself the affordance.
                'shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ' +
                (active
                  ? 'border border-transparent bg-[var(--kb-accent-primary)] text-[var(--kb-accent-text)]'
                  : 'border border-[var(--kb-card-border)] bg-transparent text-[var(--kb-text-secondary)] hover:border-[var(--kb-text-muted)]')
              }
            >
              {tag}
            </button>
          )
        })}
      </div>

      {/* Clear button. Only present when there is something to clear,
          per the spec. Borderless + muted to read as a secondary
          action that does not compete with the pills themselves. */}
      {hasActive && (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-xs text-[var(--kb-text-muted)] hover:text-[var(--kb-text-secondary)]"
        >
          Clear
        </button>
      )}
    </div>
  )
}
