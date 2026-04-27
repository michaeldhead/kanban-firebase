// ---------------------------------------------------------------------------
// useCards
//
// Subscribes to the cards of a single project in Firestore. Returns
// them as an array; the Board component is responsible for bucketing
// them by column and sorting per the project's sort mode.
//
// Why two parallel queries (and not one)?
//
//   The cards rule allows read for ANY of:
//     - request.auth.uid == resource.data.userId        (creator)
//     - request.auth.uid == resource.data.projectOwnerId (project owner)
//     - authEmail() in resource.data.memberEmails       (project member)
//
//   Firestore's rules evaluator rejects a query if it cannot
//   STATICALLY prove every potential result satisfies the rule. A
//   single `where('projectId', '==', X)` query supplies none of
//   the three predicates above as a query filter, so the engine
//   has no proof — the list query is denied with "Missing or
//   insufficient permissions" even when the caller would in fact
//   be allowed to read every doc.
//
//   The fix is to issue TWO queries, each provably safe:
//
//     Q1 — `projectId == X AND projectOwnerId == uid`
//          Every result has projectOwnerId == uid, which satisfies
//          isProjectOwnerOnCard(). Owners read every card in their
//          project through this query.
//
//     Q2 — `projectId == X AND memberEmails array-contains email`
//          Every result has the caller's email in memberEmails,
//          which satisfies isMemberOnCard(). Members (and owners
//          who are also members of their own project) read through
//          this query.
//
//   The two result sets overlap for owners (the owner is in their
//   own project's `memberEmails`, so Q2 also returns every card),
//   but we dedupe by card id when merging — see `mergeById` below.
//
//   This is the same shape `useProjects` uses for owned vs shared
//   project visibility.
//
// Archived cards are filtered out client-side. Acceptable while card
// counts are small; can move to a server-side `where('archived',
// '==', false)` later (composite index already pre-declared in
// firestore.indexes.json).
//
// Both subscriptions need composite indexes
//   - cards: projectId ASC + projectOwnerId ASC
//   - cards: projectId ASC + memberEmails ARRAY_CONTAINS
// declared in firestore.indexes.json. Deploy once with
// `npx firebase deploy --only firestore:indexes`.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { cardFromDoc, cardsCol } from '../lib/firestore'
import type { Card } from '../types'

interface UseCardsResult {
  cards: Card[]
  loading: boolean
  error: string | null
}

export function useCards(
  uid: string | null,
  userEmail: string | null,
  projectId: string | null,
): UseCardsResult {
  const [ownedCards, setOwnedCards] = useState<Card[]>([])
  const [memberCards, setMemberCards] = useState<Card[]>([])
  // Two streams, two `loaded` flags. The hook reports `loading` true
  // until BOTH have produced a snapshot (or short-circuited because
  // their dep is null).
  const [ownedLoaded, setOwnedLoaded] = useState(false)
  const [memberLoaded, setMemberLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ---- Q1: cards the caller owns (projectOwnerId == uid) ----
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
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(cardFromDoc).filter((c) => !c.archived)
        setOwnedCards(list)
        setOwnedLoaded(true)
      },
      (err) => {
        setError(err.message)
        setOwnedLoaded(true)
      },
    )
    return unsub
  }, [uid, projectId])

  // ---- Q2: cards the caller is listed on (memberEmails contains email) ----
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
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(cardFromDoc).filter((c) => !c.archived)
        setMemberCards(list)
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
 * collision (their object reference is preserved), but the data on
 * both sides is necessarily identical — they came from the same
 * Firestore documents — so the choice is cosmetic.
 */
function mergeById(owned: Card[], member: Card[]): Card[] {
  const byId = new Map<string, Card>()
  for (const c of owned) byId.set(c.id, c)
  for (const c of member) {
    if (!byId.has(c.id)) byId.set(c.id, c)
  }
  return Array.from(byId.values())
}
