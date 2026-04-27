// ---------------------------------------------------------------------------
// Project utilities — small, stateless helpers shared across modal
// callsites. Anything React-aware lives in the modal itself; only
// data-shape transforms belong here.
// ---------------------------------------------------------------------------

import type { Project } from '../types'

/**
 * Collect the unique non-null group names used across the given project
 * list, preserving the first-seen casing of each name. Case-insensitive
 * dedupe avoids "Work" and "work" appearing as two different
 * suggestions. Sorted alphabetically for stable display.
 *
 * Used by both `NewProjectModal` (to suggest groups when creating) and
 * `EditProjectModal` (to suggest groups when re-grouping). Pulling the
 * helper into one place means the dedup / sort behavior cannot drift
 * between the two modals.
 */
export function collectGroupNames(projects: Project[]): string[] {
  const seen = new Map<string, string>()
  for (const p of projects) {
    const g = p.group
    if (!g) continue
    const k = g.toLowerCase()
    if (!seen.has(k)) seen.set(k, g)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}
