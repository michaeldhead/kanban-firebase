// ---------------------------------------------------------------------------
// Card sort
//
// Sort a list of cards for display according to the project's current
// `cardSortMode`. Called at render time rather than persisted, so the UI
// responds instantly when the user switches modes — only the "custom"
// mode reads values (`customOrder`) that are actually stored on each card.
//
// Sorts are stable: for modes where two cards compare equal (e.g. two
// cards with no priority), they keep their relative input order. This
// matters when switching from custom → priority and back: cards that
// share a priority do not reshuffle.
// ---------------------------------------------------------------------------

import type { Card, SortMode } from '../types'

// Lower index = higher priority. Cards with no priority go last (null -> 4).
const PRIORITY_RANK: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
}
const NO_PRIORITY_RANK = 4

/**
 * Return a new array of cards sorted per the given mode. Never mutates
 * the input.
 */
export function sortCards(cards: Card[], mode: SortMode): Card[] {
  // Use .slice() first so we never mutate a caller's array. Array.sort in
  // JavaScript is stable as of ES2019, which is all we need for the
  // "preserve input order on ties" behavior.
  const copy = cards.slice()

  switch (mode) {
    case 'priority':
      return copy.sort((a, b) => priorityRank(a) - priorityRank(b))

    case 'date':
      // Ascending due date with nulls pushed to the end. We compare the
      // ISO date strings directly — they sort lexicographically in
      // chronological order because of the YYYY-MM-DD layout.
      return copy.sort((a, b) => {
        if (a.dueDate == null && b.dueDate == null) return 0
        if (a.dueDate == null) return 1
        if (b.dueDate == null) return -1
        if (a.dueDate < b.dueDate) return -1
        if (a.dueDate > b.dueDate) return 1
        return 0
      })

    case 'alpha':
      // `localeCompare` respects locale-sensitive casing and accents so
      // e.g. "éditer" sorts where a reader would expect.
      return copy.sort((a, b) => a.title.localeCompare(b.title))

    case 'custom':
      // `customOrder` is a user-controlled integer (currently timestamp-
      // seeded for new cards; drag-and-drop will overwrite it). Lower
      // values render first, top-of-column.
      return copy.sort((a, b) => a.customOrder - b.customOrder)
  }
}

function priorityRank(c: Card): number {
  if (c.priority == null) return NO_PRIORITY_RANK
  return PRIORITY_RANK[c.priority] ?? NO_PRIORITY_RANK
}
