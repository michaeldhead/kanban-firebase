// ---------------------------------------------------------------------------
// Shared TypeScript types.
//
// These describe the shape of Firestore documents and a few derived ideas
// (priority, sort mode, group) used throughout the UI. They are the single
// source of truth for what a Project / Card looks like in memory — the
// Firestore converters in src/lib/firestore.ts are responsible for coercing
// raw document data into these shapes, filling in defaults where the stored
// document is missing optional fields.
// ---------------------------------------------------------------------------

import type { Timestamp } from 'firebase/firestore'

// Four-level card priority. `null` means "no priority assigned".
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low'

// How a column's cards are ordered. Most modes are derived from card fields
// at render time; `custom` uses the per-card `customOrder` integer and is
// set automatically when the user drags a card to reorder it within a
// column.
export type SortMode = 'priority' | 'date' | 'alpha' | 'custom'

// A project's group label. Users can type any value they like; `null`
// means the project is ungrouped and is shown under "Other" in the
// sidebar.
export type ProjectGroup = string | null

// A single column on a board. Columns live inside their parent project
// document (keyed by id) and are ordered by the project's `columnOrder`.
export interface Column {
  id: string
  title: string
  order: number
}

// A user's role on a project: the owner created it, members were
// invited and have read/write access to cards but cannot restructure
// the board (columns, member list, ownership).
export type ProjectMemberRole = 'owner' | 'member'

// Membership lifecycle: invited but has not yet accepted ('pending')
// vs has joined ('active'). The owner is always 'active'.
export type ProjectMemberStatus = 'pending' | 'active'

/**
 * One entry in a project's `members` map. Keyed by email address —
 * we do not have a uid for invited users until they actually sign up
 * and accept, and the email is the only stable identifier we have at
 * invite time.
 */
export interface ProjectMember {
  role: ProjectMemberRole
  status: ProjectMemberStatus
  // Stored as a Firestore Timestamp. Using `any` would be loose; we
  // accept either a Timestamp or `null` so freshly-written maps that
  // have not yet round-tripped through the server are still typed.
  invitedAt: Timestamp | null
  // Uid of the owner who invited this member.
  invitedBy: string
}

// A Firestore-backed project. Each signed-in user has their own projects;
// security rules enforce that `userId` matches `request.auth.uid` for
// owner-only operations, and that membership is required for shared
// access.
//
// Sharing model:
//   - `userId` is the project owner's uid. Owners have full control
//     (rename, delete, manage columns, invite, remove members).
//   - `members` is a per-email record of role + status + invite metadata.
//     Includes the owner (status='active', role='owner').
//   - `memberEmails` is a flat array of every member email, denormalized
//     so we can run an efficient `array-contains` query for "projects
//     this user has access to". Kept in sync with `members` on every
//     write.
//
// `isOwner` is set by `useProjects` for the current user; it is NOT a
// stored field. The hook tags each project as we hand it down so the
// UI can branch on ownership without having to know the current uid.
export interface Project {
  id: string
  userId: string
  title: string
  group: ProjectGroup
  columnOrder: string[]
  columns: Record<string, Column>
  cardSortMode: SortMode
  members: Record<string, ProjectMember>
  memberEmails: string[]
  // `createdAt` / `updatedAt` use Firestore server timestamps. They are
  // nullable in our TypeScript model because a freshly-written doc's
  // timestamp is not populated locally until the server acknowledges it.
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  // Derived in `useProjects` from `userId === currentUid`. Not stored.
  isOwner?: boolean
}

// An external link attached to a card (e.g. documentation, a ticket).
export interface CardLink {
  label: string
  url: string
}

// A Firestore-backed card. Cards are stored in a top-level `cards`
// collection and associated with a project via `projectId` (not nested
// subcollections — this keeps cross-project operations like import batches
// straightforward).
//
// Multi-user fields:
//   - `userId` is the uid of whoever CREATED the card (could be the
//     project owner or any active member). Set once on create, never
//     changes.
//   - `projectOwnerId` is the project owner's uid at the time of
//     creation. Denormalized so security rules can authorize a card
//     read/write without having to fetch the parent project. Stays in
//     sync with the project's owner — projects do not currently support
//     ownership transfer, so this value is set once on create.
//   - `createdByUid` is reserved for future "created by …" attribution
//     (e.g. surfacing on the card UI). Optional — we default it to
//     `userId` at create time so old callers do not need to change
//     until the feature is wired.
export interface Card {
  id: string
  userId: string
  projectOwnerId: string
  // Lowercased emails of every member of the parent project at the
  // time of the most-recent write. Stamped on every card so security
  // rules can authorize cross-member reads with a per-document check
  // (`authEmail() in resource.data.memberEmails`) — no `get()`
  // lookup against the parent project, which the rules evaluator
  // rejects on list queries. Kept in sync by `inviteMember` and
  // `removeMember`, both of which call `updateCardMemberEmails` to
  // rewrite the array on every card in the project after the
  // membership change.
  memberEmails: string[]
  projectId: string
  columnId: string
  title: string
  description: string | null
  priority: Priority | null
  dueDate: string | null // stored as YYYY-MM-DD so it parses/sorts as text
  tags: string[]
  links: CardLink[]
  notes: string | null
  customOrder: number
  // Archive is a soft-delete: archived cards are filtered out of the board
  // view rather than physically removed. This keeps a simple recovery path
  // available if we ever add an "archived" view later.
  archived: boolean
  archivedAt: Timestamp | null
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  createdByUid?: string
}
