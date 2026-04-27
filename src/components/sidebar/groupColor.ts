// ---------------------------------------------------------------------------
// Sidebar group color assignment.
//
// Each project in the sidebar shows a small colored dot indicating which
// "group" it belongs to (e.g. a work group, a personal group — the user names
// these freely). We deterministically map a group name to a color from a
// fixed palette, so the same name always gets the same dot color across
// sessions and users, with a neutral gray reserved for ungrouped projects.
//
// Using a hash keeps this fully data-driven: the code carries no knowledge
// of any specific group name. Users can create any group they like and get
// a stable color for it without touching this file.
// ---------------------------------------------------------------------------

import type { ProjectGroup } from '../../types'

// Tailwind-inspired mid-saturation tones that read well on a dark sidebar.
// Order is meaningful only in that each index becomes "group N" when hashed.
const PALETTE = [
  '#a855f7', // purple
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#ec4899', // pink
  '#8b5cf6', // violet
] as const

// Neutral color used when a project has no group assigned.
const UNGROUPED = '#9ca3af' // gray-400

/**
 * Return a stable dot color for a group name. Null / empty groups always get
 * the neutral gray; named groups get a palette color chosen via a cheap
 * string hash so the mapping is consistent across renders.
 */
export function groupColor(group: ProjectGroup): string {
  if (!group) return UNGROUPED
  const idx = hashString(group) % PALETTE.length
  return PALETTE[idx]
}

/**
 * Human-readable label shown above a group's project list in the sidebar.
 * "Other" is used for the bucket of projects that have no group set.
 */
export function groupLabel(group: ProjectGroup): string {
  if (!group) return 'Other'
  return group
}

// djb2-style string hash. Not cryptographic — it just needs to spread group
// names over the palette indices deterministically.
function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}
