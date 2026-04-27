// ---------------------------------------------------------------------------
// useArchivedCards
//
// Live subscription to the archived cards of a single project. Mirrors
// the rules-evaluator-safe two-query pattern that `useCards` uses for
// active cards (Session 15) — a single `where('projectId', '==', X)`
// query is rejected by Firestore because none of the three card-read
// predicates (creator / project owner / member by email) appears as
// a query filter, and the rules engine cannot statically prove every
// result is readable.
//
// Two parallel queries, each provably safe against one predicate, plus
// the `archived == true` filter so the drawer never has to scan
// active cards client-side:
//
//   Q1 — `projectId == X AND projectOwnerId == uid AND archived == true`
//        Every result has `projectOwnerId == uid`, satisfying
//        `isProjectOwnerOnCard()`. Owners read every archived card in
//        their project through this query.
//
//   Q2 — `projectId == X AND memberEmails array-contains email
//         AND archived == true`
//        Every result has the caller's email in `memberEmails`,
//        satisfying `isMemberOnCard()`. Members (and owners, who are
//        in their own project's `memberEmails`) read through this
//        query.
//
// The two result sets overlap for owners; results are merged and
// deduped by card id. Same shape as `useCards` and `useProjects`.
//
// Required composite indexes (declared in firestore.indexes.json):
//   - cards: projectId ASC + projectOwnerId ASC + archived ASC
//   - cards: projectId ASC + memberEmails ARRAY_CONTAINS + archived ASC
// Deploy once with `npx firebase deploy --only firestore:indexes`.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { cardFromDoc, cardsCol } from '../lib/firestore'
import type { Card } from '../types'

interface UseArchivedCardsResult {
  cards: Card[]
  loading: boolean
  error: string | null
}

export function useArchivedCards(
  uid: string | null,
  userEmail: string | null,
  projectId: string | null,
): UseArchivedCardsResult {
  const [ownedCards, setOwnedCards] = useState<Card[]>([])
  const [memberCards, setMemberCards] = useState<Card[]>([])
  // Two streams, two `loaded` flags. The hook reports `loading` true
  // until BOTH have produced a snapshot (or short-circuited because
  // their dep is null).
  const [ownedLoaded, setOwnedLoaded] = useState(false)
  const [memberLoaded, setMemberLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ---- Q1: archived cards the caller owns (projectOwnerId == uid) ----
  useEffect(() => {
    if (!uid || !projectId) {
      setOwnedCards([])
      setOwnedLoaded(true)
      return
    }
    setOwnedLoaded(false)
    setError(null)
    const q = query(
      cardsCol,
      where('projectId', '==', projectId),
      where('projectOwnerId', '==', uid),
      where('archived', '==', true),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setOwnedCards(snap.docs.map(cardFromDoc))
        setOwnedLoaded(true)
      },
      (err) => {
        setError(err.message)
        setOwnedLoaded(true)
      },
    )
    return unsub
  }, [uid, projectId])

  // ---- Q2: archived cards the caller is listed on ----
  useEffect(() => {
    const normalized = userEmail ? userEmail.trim().toLowerCase() : ''
    if (!normalized || !projectId) {
      setMemberCards([])
      setMemberLoaded(true)
      return
    }
    setMemberLoaded(false)
    setError(null)
    const q = query(
      cardsCol,
      where('projectId', '==', projectId),
      where('memberEmails', 'array-contains', normalized),
      where('archived', '==', true),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMemberCards(snap.docs.map(cardFromDoc))
        setMemberLoaded(true)
      },
      (err) => {
        setError(err.message)
        setMemberLoaded(true)
      },
    )
    return unsub
  }, [userEmail, projectId])

  const cards = useMemo(
    () => mergeById(ownedCards, memberCards),
    [ownedCards, memberCards],
  )

  return {
    cards,
    loading: !(ownedLoaded && memberLoaded),
    error,
  }
}

/**
 * Merge two card lists, deduplicating by id. Owner-side rows win on
 * collision (their object reference is preserved); the underlying
 * data is identical (same Firestore doc), so the choice is cosmetic.
 */
function mergeById(owned: Card[], member: Card[]): Card[] {
  const byId = new Map<string, Card>()
  for (const c of owned) byId.set(c.id, c)
  for (const c of member) {
    if (!byId.has(c.id)) byId.set(c.id, c)
  }
  return Array.from(byId.values())
}
