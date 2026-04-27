// ---------------------------------------------------------------------------
// Firestore collection references, document-to-model converters, and the
// full set of write helpers used by the UI.
//
// Why hand-rolled helpers rather than raw Firestore calls from every
// component?
//   - Centralizing writes gives us one place to stamp `updatedAt` on
//     every mutation, which keeps the timestamps meaningful.
//   - It also keeps component code short and declarative — a component
//     says "archive this card" without having to know the document shape.
//   - Writes can be swapped to a batch or transaction later without
//     touching call sites.
// ---------------------------------------------------------------------------

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  Card,
  CardLink,
  Column,
  Priority,
  Project,
  ProjectMember,
  SortMode,
} from '../types'

// Top-level collection references. Keeping them here (rather than rebuilding
// `collection(db, 'projects')` at every call site) gives us one place to
// change collection names if we ever need to.
export const projectsCol = collection(db, 'projects')
export const cardsCol = collection(db, 'cards')

/**
 * Generate a short unique ID for nested objects like column entries that
 * live inside a project document (and therefore do not get a Firestore-
 * generated doc ID of their own). We prefer the Web Crypto UUID where
 * available; the fallback is sufficient for a personal board.
 */
function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ---------------------------------------------------------------------------
// Converters: Firestore document -> in-memory model
// ---------------------------------------------------------------------------

/**
 * Convert a Firestore project document snapshot into the in-memory
 * `Project` shape, applying sensible defaults so that older / partial
 * documents are still readable without breaking the UI.
 */
export function projectFromDoc(snap: QueryDocumentSnapshot<DocumentData>): Project {
  const data = snap.data()
  return {
    id: snap.id,
    userId: data.userId,
    title: data.title,
    group: data.group ?? null,
    columnOrder: data.columnOrder ?? [],
    columns: data.columns ?? {},
    cardSortMode: (data.cardSortMode ?? 'priority') as SortMode,
    // Members default to an empty map / array so older projects that
    // existed before sharing was added still load. The owner-side code
    // that seeds these fields runs idempotently, so legacy projects
    // pick up the new shape on the next owner-side write.
    members: (data.members ?? {}) as Record<string, ProjectMember>,
    memberEmails: data.memberEmails ?? [],
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  }
}

/**
 * Convert a Firestore card document snapshot into the in-memory `Card`
 * shape. Fields omitted from the stored document are defaulted to safe
 * neutral values (empty array, null, false, zero) so the UI can render
 * without special-casing.
 */
export function cardFromDoc(snap: QueryDocumentSnapshot<DocumentData>): Card {
  const data = snap.data()
  return {
    id: snap.id,
    userId: data.userId,
    // Legacy cards predating sharing have no `projectOwnerId`; fall
    // back to `userId` (which used to be the owner). Owner-side writes
    // will refresh this field on the next mutation through the new
    // helpers.
    projectOwnerId: data.projectOwnerId ?? data.userId,
    // Legacy cards have no `memberEmails`; default to an empty list.
    // Rules treat a missing field as "no members can read", which is
    // safe — the creator and the project owner can still read via the
    // other two predicates. The owner can refresh every card's
    // `memberEmails` by re-saving the project (any membership write
    // calls `updateCardMemberEmails`) which back-fills.
    memberEmails: data.memberEmails ?? [],
    projectId: data.projectId,
    columnId: data.columnId,
    title: data.title,
    description: data.description ?? null,
    priority: data.priority ?? null,
    dueDate: data.dueDate ?? null,
    tags: data.tags ?? [],
    links: data.links ?? [],
    notes: data.notes ?? null,
    customOrder: data.customOrder ?? 0,
    archived: data.archived ?? false,
    archivedAt: data.archivedAt ?? null,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    createdByUid: data.createdByUid ?? data.userId,
  }
}

// ---------------------------------------------------------------------------
// Project writes
// ---------------------------------------------------------------------------

interface NewProjectInput {
  userId: string
  // Owner email is needed to seed the `members` map and `memberEmails`
  // array — without these, the new project would not show up in
  // `getUserProjects` queries that match by email.
  userEmail: string
  title: string
  group: string | null
  columnTitles: string[]
}

/**
 * Create a new project document with the given starting columns, returning
 * the new project's ID. Each starting column title becomes a `Column`
 * entry with a locally-generated ID; the resulting `columnOrder` array
 * mirrors the input order exactly.
 *
 * The creator is seeded as the first (and only) member with role
 * `'owner'` and status `'active'`. Their email is also added to the
 * `memberEmails` denormalized array, which is what the shared-projects
 * query indexes against.
 */
export async function createProject({
  userId,
  userEmail,
  title,
  group,
  columnTitles,
}: NewProjectInput): Promise<string> {
  const ref = doc(projectsCol)

  const columns: Record<string, Column> = {}
  const columnOrder: string[] = []
  columnTitles.forEach((t, i) => {
    const colId = genId()
    columns[colId] = { id: colId, title: t, order: i }
    columnOrder.push(colId)
  })

  const ownerMember: ProjectMember = {
    role: 'owner',
    status: 'active',
    // Server timestamps cannot live inside a nested map; use a
    // client-side Timestamp here.
    invitedAt: Timestamp.now(),
    invitedBy: userId,
  }

  await setDoc(ref, {
    userId,
    title,
    group,
    columnOrder,
    columns,
    cardSortMode: 'priority' as SortMode,
    members: { [userEmail]: ownerMember },
    memberEmails: [userEmail],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return ref.id
}

/**
 * Partial update of a project. Callers pass only the fields they want to
 * change; `updatedAt` is always refreshed so any "last modified" surface
 * in the UI stays accurate.
 *
 * `userId` must NEVER appear in `patch`. Firestore rules reject writes
 * that try to hand a document to a different user, but leaving the field
 * out of patches is cleaner than relying on rules as a safety net.
 */
export async function updateProject(
  projectId: string,
  patch: Partial<Pick<Project, 'title' | 'group' | 'columnOrder' | 'columns' | 'cardSortMode'>>,
): Promise<void> {
  const ref = doc(projectsCol, projectId)
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() })
}

/**
 * Delete a project document. Callers are responsible for first checking
 * that no unarchived cards remain — the UI does this before offering the
 * delete action. Any archived cards that happen to still exist for this
 * project become orphaned but are invisible anyway (archived filter).
 */
export async function deleteProject(projectId: string): Promise<void> {
  const ref = doc(projectsCol, projectId)
  await deleteDoc(ref)
}

// ---------------------------------------------------------------------------
// Member writes (sharing)
//
// All three helpers do a read-then-write rather than a Firestore-side
// patch on a nested map field. Reasons:
//   - Email addresses contain `.`, which Firestore interprets as
//     nesting in dotted field paths. Replacing the whole `members` map
//     sidesteps the escaping problem.
//   - Keeping `members` and `memberEmails` consistent requires a single
//     atomic write of both fields anyway.
// ---------------------------------------------------------------------------

/**
 * Look up a project, then return its in-memory shape. Throws if the doc
 * does not exist (caller is expected to know the project id).
 */
async function getProjectOrThrow(projectId: string): Promise<Project> {
  const ref = doc(projectsCol, projectId)
  const { getDoc } = await import('firebase/firestore')
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Project not found.')
  return projectFromDoc(snap as QueryDocumentSnapshot<DocumentData>)
}

/**
 * Add `email` to the project's member list with status `'pending'`.
 * If the email is already a member at any status this is a no-op
 * (returning silently rather than throwing — repeat invites should
 * be friendly).
 *
 * The owner is the only caller; rules enforce that members cannot
 * mutate `members` / `memberEmails`.
 */
export async function inviteMember(
  projectId: string,
  email: string,
  invitedByUid: string,
): Promise<void> {
  const project = await getProjectOrThrow(projectId)
  const normalized = email.trim().toLowerCase()
  if (project.members[normalized]) {
    // Already invited or active. Treat as idempotent.
    return
  }
  const newMember: ProjectMember = {
    role: 'member',
    status: 'pending',
    invitedAt: Timestamp.now(),
    invitedBy: invitedByUid,
  }
  const newMemberEmails = Array.from(
    new Set([...project.memberEmails, normalized]),
  )
  await updateDoc(doc(projectsCol, projectId), {
    members: { ...project.members, [normalized]: newMember },
    memberEmails: newMemberEmails,
    updatedAt: serverTimestamp(),
  })
  // Propagate the new membership down to every card so the
  // per-card `memberEmails` predicate the rules use stays in
  // sync. Owner-driven (inviteMember is owner-only) so the
  // rules-safe `projectOwnerId == owner.uid` filter inside
  // `updateCardMemberEmails` will accept the list query.
  await updateCardMemberEmails(projectId, project.userId, newMemberEmails)
}

/**
 * Promote a `'pending'` member to `'active'`, called from the invite-link
 * flow once the invitee has signed in. Idempotent: if the email is
 * already active, the write is skipped. If the email is not yet in
 * the members map at all (the link was forwarded to someone other
 * than the originally-invited address), they are added as an active
 * member — having the link is treated as authorization.
 */
export async function activateMember(
  projectId: string,
  email: string,
): Promise<void> {
  const project = await getProjectOrThrow(projectId)
  const normalized = email.trim().toLowerCase()
  const existing = project.members[normalized]
  if (existing && existing.status === 'active') return

  const member: ProjectMember = existing
    ? { ...existing, status: 'active' }
    : {
        role: 'member',
        status: 'active',
        invitedAt: Timestamp.now(),
        // Self-claimed via link — there is no specific inviter uid
        // to attribute, so we fall back to the owner.
        invitedBy: project.userId,
      }

  const newMemberEmails = Array.from(
    new Set([...project.memberEmails, normalized]),
  )
  await updateDoc(doc(projectsCol, projectId), {
    members: { ...project.members, [normalized]: member },
    memberEmails: newMemberEmails,
    updatedAt: serverTimestamp(),
  })
  // The invitee themself is the typical caller here (post-link).
  // The list query inside `updateCardMemberEmails` will be
  // rejected for them — `projectOwnerId == project.userId` does
  // not match their auth uid — and so will the per-card writes.
  // Both failures are expected; the owner's earlier
  // `inviteMember` call already fanned out the new email to every
  // card. Swallow the resulting error rather than blocking
  // invite-acceptance.
  await updateCardMemberEmails(
    projectId,
    project.userId,
    newMemberEmails,
  ).catch(() => {
    // Permission errors here are expected for the activator.
  })
}

/**
 * Remove a member entirely. Refuses to remove the owner — the owner
 * row is always present, and removing it would orphan the project.
 */
export async function removeMember(
  projectId: string,
  email: string,
): Promise<void> {
  const project = await getProjectOrThrow(projectId)
  const normalized = email.trim().toLowerCase()
  const member = project.members[normalized]
  if (!member) return
  if (member.role === 'owner') {
    throw new Error('Cannot remove the project owner.')
  }
  const { [normalized]: _removed, ...members } = project.members
  void _removed
  const memberEmails = project.memberEmails.filter((e) => e !== normalized)
  await updateDoc(doc(projectsCol, projectId), {
    members,
    memberEmails,
    updatedAt: serverTimestamp(),
  })
  // Strip the removed email from every card's `memberEmails` so
  // they immediately lose card-level access (project-level access
  // is already revoked above). Owner-driven, so the rules-safe
  // filter inside `updateCardMemberEmails` accepts the list query.
  await updateCardMemberEmails(projectId, project.userId, memberEmails)
}

/**
 * Rewrite the `memberEmails` array on every card belonging to a
 * project. Called after membership changes (`inviteMember`,
 * `activateMember`, `removeMember`) so that the membership-based
 * card-access predicate stays accurate.
 *
 * Implementation notes:
 *   - The list query is filtered by BOTH `projectId == X` AND
 *     `projectOwnerId == ownerUid`. The double filter is required
 *     for the rules evaluator to statically prove every result
 *     satisfies `isProjectOwnerOnCard()` — a single
 *     `projectId == X` filter is rejected with "Missing or
 *     insufficient permissions" because none of the three card
 *     read predicates (creator / owner / member) appears as a
 *     query filter. Same class of bug fixed for `useCards` in
 *     Session 15.
 *   - Splits writes into batches of 400 to stay under Firestore's
 *     500-write-per-batch limit. Larger projects rarely have
 *     thousands of cards, but this keeps the helper safe at scale.
 *   - Includes archived cards. Archived cards are still readable
 *     by their owner / creator on a future "restore" feature, so
 *     keeping their `memberEmails` accurate is the right default.
 *   - Stamps a fresh `updatedAt` so any "recently changed" UI
 *     reflects the membership change.
 *
 * If the caller is not the project owner, both the list query and
 * the per-card writes will be rejected by the rules. This helper
 * is intended to be called by the OWNER from the share / invite
 * flow; `inviteMember` and `removeMember` are owner-driven by
 * design. `activateMember` swallows the resulting permission error
 * because the activator is typically the new member, who has no
 * write access to the cards yet — the owner's earlier
 * `inviteMember` call already covered the fan-out.
 */
export async function updateCardMemberEmails(
  projectId: string,
  ownerUid: string,
  memberEmails: string[],
): Promise<void> {
  const normalized = normalizeEmails(memberEmails)
  const q = query(
    cardsCol,
    where('projectId', '==', projectId),
    where('projectOwnerId', '==', ownerUid),
  )
  const snap = await getDocs(q)
  if (snap.empty) return

  const docs = snap.docs
  const BATCH_LIMIT = 400
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const slice = docs.slice(i, i + BATCH_LIMIT)
    const batch = writeBatch(db)
    for (const d of slice) {
      batch.update(d.ref, {
        memberEmails: normalized,
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  }
}

/**
 * One-shot fetch of every project the user can see — owned plus shared.
 * Two parallel reads merged into a deduped, owner-tagged list.
 *
 * Note: `useProjects` does the same thing live with two `onSnapshot`
 * listeners. This helper exists for non-reactive callers (boot-time
 * checks, server-side tooling, etc.) and is not on the hot path.
 */
export async function getUserProjects(
  uid: string,
  email: string,
): Promise<Project[]> {
  const ownedQ = query(projectsCol, where('userId', '==', uid))
  const sharedQ = query(
    projectsCol,
    where('memberEmails', 'array-contains', email.trim().toLowerCase()),
  )
  const [ownedSnap, sharedSnap] = await Promise.all([
    getDocs(ownedQ),
    getDocs(sharedQ),
  ])
  const byId = new Map<string, Project>()
  ownedSnap.forEach((d) =>
    byId.set(d.id, { ...projectFromDoc(d), isOwner: true }),
  )
  sharedSnap.forEach((d) => {
    if (byId.has(d.id)) return // owner row wins; user is also in members
    byId.set(d.id, { ...projectFromDoc(d), isOwner: false })
  })
  return Array.from(byId.values())
}

// ---------------------------------------------------------------------------
// Column writes (columns live inside the project document, so every column
// operation is ultimately a project update)
// ---------------------------------------------------------------------------

/**
 * Append a new column to the end of the project's `columnOrder`. Returns
 * the new column ID so the caller can scroll to it / focus its title
 * input.
 */
export async function addColumn(
  project: Project,
  title: string,
): Promise<string> {
  const colId = genId()
  const order = project.columnOrder.length
  const columns = { ...project.columns, [colId]: { id: colId, title, order } }
  const columnOrder = [...project.columnOrder, colId]
  await updateProject(project.id, { columns, columnOrder })
  return colId
}

/**
 * Rename a single column in place. No-op if `columnId` does not exist in
 * the project (defensive — should not happen in practice).
 */
export async function renameColumn(
  project: Project,
  columnId: string,
  title: string,
): Promise<void> {
  const existing = project.columns[columnId]
  if (!existing) return
  const columns = {
    ...project.columns,
    [columnId]: { ...existing, title },
  }
  await updateProject(project.id, { columns })
}

/**
 * Remove a column from the project. Caller must have already verified the
 * column is empty (per the spec — deletion is blocked in the UI when the
 * column has cards). We remove the entry from both `columns` and
 * `columnOrder` so the project is consistent after the write.
 */
export async function deleteColumn(
  project: Project,
  columnId: string,
): Promise<void> {
  const { [columnId]: _removed, ...columns } = project.columns
  void _removed
  const columnOrder = project.columnOrder.filter((id) => id !== columnId)
  await updateProject(project.id, { columns, columnOrder })
}

/**
 * Overwrite the project's column order. Used by Manage Columns and
 * (in a future session) by column-header drag-and-drop.
 * The `order` index on each column object is refreshed to match the new
 * position so any code that reads it directly stays correct.
 */
export async function reorderColumns(
  project: Project,
  newOrder: string[],
): Promise<void> {
  const columns: Record<string, Column> = {}
  newOrder.forEach((id, i) => {
    const c = project.columns[id]
    if (c) columns[id] = { ...c, order: i }
  })
  await updateProject(project.id, { columns, columnOrder: newOrder })
}

// ---------------------------------------------------------------------------
// Card writes
// ---------------------------------------------------------------------------

export interface NewCardInput {
  // Uid of the user creating the card. Could be the project owner OR
  // an active member.
  userId: string
  // Uid of the project's owner. Stamped onto the card so security
  // rules can authorize owner-side writes without re-fetching the
  // parent project. The caller (the active project context) already
  // has this value, so passing it in costs nothing.
  projectOwnerId: string
  // The full list of project member emails (lowercase) at the time of
  // creation. Stamped on the card so the rules can run a pure
  // per-document membership check
  // (`authEmail() in resource.data.memberEmails`). The caller passes
  // `project.memberEmails` directly. Kept in sync after the fact by
  // `inviteMember` / `removeMember` via `updateCardMemberEmails`.
  memberEmails: string[]
  projectId: string
  columnId: string
  title: string
  description?: string | null
  priority?: Priority | null
  dueDate?: string | null
  tags?: string[]
  links?: CardLink[]
  notes?: string | null
  // Optional: explicit creator attribution. Defaults to `userId`
  // (which is currently the same user). Reserved for future "created
  // by" UI; safe to omit.
  createdByUid?: string
}

/**
 * Create a new card. `customOrder` is derived from the current timestamp
 * so newly-created cards sort naturally to the bottom when the user
 * later switches to custom order — without having to scan existing cards
 * to compute "max + 1".
 */
export async function createCard(input: NewCardInput): Promise<string> {
  const ref = await addDoc(cardsCol, {
    userId: input.userId,
    projectOwnerId: input.projectOwnerId,
    // Defensive normalization: `inviteMember` / `activateMember`
    // already lowercase emails on write, so `project.memberEmails`
    // should already be lowercase. We re-lowercase + dedupe here so
    // a misbehaving caller cannot create a card whose memberEmails
    // do not match what the rules will compare against.
    memberEmails: normalizeEmails(input.memberEmails),
    projectId: input.projectId,
    columnId: input.columnId,
    title: input.title,
    description: input.description ?? null,
    priority: input.priority ?? null,
    dueDate: input.dueDate ?? null,
    tags: input.tags ?? [],
    links: input.links ?? [],
    notes: input.notes ?? null,
    customOrder: Date.now(),
    archived: false,
    archivedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUid: input.createdByUid ?? input.userId,
  })
  return ref.id
}

/** Lowercase + dedupe member emails before stamping onto a card. */
function normalizeEmails(emails: string[]): string[] {
  const seen = new Set<string>()
  for (const e of emails) {
    const k = e.trim().toLowerCase()
    if (k) seen.add(k)
  }
  return Array.from(seen)
}

// Fields the UI is allowed to update. `userId`, `projectId`, and system
// fields (`createdAt`, `customOrder`, `archived`, `archivedAt`) are
// deliberately excluded here — archive has its own helper and the rest
// are either immutable or system-managed.
export type CardPatch = Partial<
  Pick<
    Card,
    | 'columnId'
    | 'title'
    | 'description'
    | 'priority'
    | 'dueDate'
    | 'tags'
    | 'links'
    | 'notes'
  >
>

/**
 * Partial update of a card. Used by the card dialog's edit mode and
 * by the drag-and-drop handlers in `Board` (to update `columnId`
 * after a cross-column drop).
 */
export async function updateCard(cardId: string, patch: CardPatch): Promise<void> {
  const ref = doc(cardsCol, cardId)
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() })
}

/**
 * Soft-delete (archive) a card. The card is hidden from the board but
 * the document itself remains in Firestore so the archive drawer can
 * surface or restore it.
 */
export async function archiveCard(cardId: string): Promise<void> {
  const ref = doc(cardsCol, cardId)
  await updateDoc(ref, {
    archived: true,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Bring an archived card back to the board. `columnId` lets the
 * caller restore to a specific column — the drawer passes the card's
 * existing `columnId` to restore to its original column, but a
 * future "restore to current first column" UI could pass any valid
 * column id for the same project. `archivedAt` is cleared so the
 * card is visually identical to one that was never archived.
 */
export async function restoreCard(
  cardId: string,
  columnId: string,
): Promise<void> {
  const ref = doc(cardsCol, cardId)
  await updateDoc(ref, {
    archived: false,
    archivedAt: null,
    columnId,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Permanently delete a card. Only used from the archive drawer —
 * active (unarchived) cards are never hard-deleted; the board's
 * archive action goes through `archiveCard` instead. Firestore
 * rules already restrict delete to the card's creator and the
 * project owner.
 */
export async function deleteCard(cardId: string): Promise<void> {
  const ref = doc(cardsCol, cardId)
  await deleteDoc(ref)
}

export interface ImportCardInput {
  columnId: string
  title: string
  description: string | null
  priority: Priority | null
  dueDate: string | null
  tags: string[]
  links: CardLink[]
  notes: string | null
}

/**
 * Batch-create a set of imported cards. All writes succeed together or
 * fail together — this gives the all-or-nothing import semantics the
 * spec requires. `customOrder` is staggered by millisecond so imports
 * preserve input order if the project later switches to custom mode.
 *
 * `userId` is the caller (creator); `projectOwnerId` is the project
 * owner. `memberEmails` is the project's full member list at write
 * time, stamped on each card so rules can authorize cross-member
 * reads. Members can import too — `userId` and `projectOwnerId` will
 * be different uids in that case.
 */
export async function createCardsBatch(
  userId: string,
  projectOwnerId: string,
  memberEmails: string[],
  projectId: string,
  cards: ImportCardInput[],
): Promise<void> {
  if (cards.length === 0) return
  const normalized = normalizeEmails(memberEmails)
  const batch = writeBatch(db)
  const base = Date.now()
  cards.forEach((c, i) => {
    const ref = doc(cardsCol) // auto-id
    batch.set(ref, {
      userId,
      projectOwnerId,
      memberEmails: normalized,
      projectId,
      columnId: c.columnId,
      title: c.title,
      description: c.description,
      priority: c.priority,
      dueDate: c.dueDate,
      tags: c.tags,
      links: c.links,
      notes: c.notes,
      customOrder: base + i,
      archived: false,
      archivedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByUid: userId,
    })
  })
  await batch.commit()
}

/**
 * Persist a manual reorder of cards within a single column. Writes
 * `customOrder = i` for each card in order and flips the project's
 * `cardSortMode` to `'custom'` — per spec, any drag-reorder within a
 * column switches the project to custom order. Executed as a single
 * batch so the UI cannot momentarily observe a half-applied state.
 */
export async function reorderCardsInColumn(
  projectId: string,
  cardIdsInOrder: string[],
): Promise<void> {
  const batch = writeBatch(db)
  cardIdsInOrder.forEach((cardId, i) => {
    const cardRef = doc(cardsCol, cardId)
    batch.update(cardRef, {
      customOrder: i,
      updatedAt: serverTimestamp(),
    })
  })
  const projectRef = doc(projectsCol, projectId)
  batch.update(projectRef, {
    cardSortMode: 'custom' as SortMode,
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
}

/**
 * Count the number of non-archived cards for a project. Used by the
 * edit-project dialog to decide whether delete is allowed. Reads
 * once rather than subscribing — callers are always one-shot.
 *
 * `userId` scopes the query to a single creator. The Firestore rules
 * evaluator rejects a list query whose filters cannot statically
 * prove that every result is readable; matching `isCardCreator()`
 * via `where('userId', '==', userId)` satisfies that constraint
 * without a per-document predicate. The caller passes the project
 * owner's uid (`project.userId`), which counts owner-authored cards
 * — the only path through which the edit dialog reaches this
 * helper, since the dialog itself is owner-only.
 */
export async function countActiveCardsForProject(
  userId: string,
  projectId: string,
): Promise<number> {
  const q = query(
    cardsCol,
    where('userId', '==', userId),
    where('projectId', '==', projectId),
  )
  const snap = await getDocs(q)
  let n = 0
  snap.forEach((d) => {
    if (!d.data().archived) n++
  })
  return n
}

/**
 * Batch-archive every card in a given column.
 *
 * `userId` is the creator filter required by Firestore's rules
 * evaluator: the query must statically prove every result satisfies
 * `isCardCreator()` (or another predicate), and the simplest way is
 * a `where('userId', '==', userId)` clause. The natural caller is a
 * project owner clearing their own column.
 *
 * TODO: not yet called — wire up before use. No UI surface invokes
 * this helper today; it sits here for a future "Archive all cards
 * in this column" action. Mark this TODO read so the wiring step
 * can also verify the appropriate userId is being passed (e.g.
 * `project.userId` for an owner-driven flow).
 */
export async function archiveCardsInColumn(
  userId: string,
  projectId: string,
  columnId: string,
): Promise<number> {
  const q = query(
    cardsCol,
    where('userId', '==', userId),
    where('projectId', '==', projectId),
    where('columnId', '==', columnId),
  )
  const snap = await getDocs(q)
  const batch = writeBatch(db)
  let n = 0
  snap.forEach((d) => {
    if (d.data().archived) return
    batch.update(d.ref, {
      archived: true,
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    n++
  })
  if (n > 0) await batch.commit()
  return n
}
