// ---------------------------------------------------------------------------
// useProjects
//
// Subscribes to every project the current user can see — both owned
// (`userId == uid`) and shared (the user's email appears in the
// project's `memberEmails` array).
//
// Two parallel `onSnapshot` listeners feed local "owned" / "shared"
// arrays; the hook merges them into a single deduplicated list, tags
// each project with a derived `isOwner` boolean, and sorts the result
// by title.
//
// Deduplication: it is possible for the owner's own email to appear
// in `memberEmails` (we seed it on create), so the same project can
// match both queries. The merge prefers the owned-side row so
// `isOwner === true` wins.
//
// Email is normalized to lowercase before the array-contains query;
// `inviteMember` and `activateMember` do the same on write, so the
// indexed values are consistent.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { projectFromDoc, projectsCol } from '../lib/firestore'
import type { Project } from '../types'

interface UseProjectsResult {
  projects: Project[]
  loading: boolean
  error: string | null
}

export function useProjects(
  userId: string | null,
  email: string | null,
): UseProjectsResult {
  const [owned, setOwned] = useState<Project[]>([])
  const [shared, setShared] = useState<Project[]>([])
  // Two streams, two `loading` flags. The combined `loading` is true
  // until BOTH have emitted at least once.
  const [ownedLoaded, setOwnedLoaded] = useState(false)
  const [sharedLoaded, setSharedLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ---- Owned subscription ----
  useEffect(() => {
    if (!userId) {
      setOwned([])
      setOwnedLoaded(true)
      return
    }
    setOwnedLoaded(false)
    const q = query(projectsCol, where('userId', '==', userId))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setOwned(snap.docs.map(projectFromDoc))
        setOwnedLoaded(true)
      },
      (err) => {
        setError(err.message)
        setOwnedLoaded(true)
      },
    )
    return unsub
  }, [userId])

  // ---- Shared subscription ----
  useEffect(() => {
    const normalized = email ? email.trim().toLowerCase() : ''
    if (!normalized) {
      setShared([])
      setSharedLoaded(true)
      return
    }
    setSharedLoaded(false)
    const q = query(
      projectsCol,
      where('memberEmails', 'array-contains', normalized),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setShared(snap.docs.map(projectFromDoc))
        setSharedLoaded(true)
      },
      (err) => {
        setError(err.message)
        setSharedLoaded(true)
      },
    )
    return unsub
  }, [email])

  // ---- Merge + tag ----
  const projects = mergeOwnedShared(owned, shared, userId)

  return {
    projects,
    loading: !(ownedLoaded && sharedLoaded),
    error,
  }
}

/**
 * Combine the two query results into a single deduped list, tagging
 * each project with `isOwner` derived from `userId`. Sorted by title
 * so the sidebar order is stable across snapshots.
 */
function mergeOwnedShared(
  owned: Project[],
  shared: Project[],
  uid: string | null,
): Project[] {
  const byId = new Map<string, Project>()
  for (const p of owned) {
    byId.set(p.id, { ...p, isOwner: true })
  }
  for (const p of shared) {
    if (byId.has(p.id)) continue // owner row already wins
    byId.set(p.id, { ...p, isOwner: uid != null && p.userId === uid })
  }
  const out = Array.from(byId.values())
  out.sort((a, b) => a.title.localeCompare(b.title))
  return out
}
