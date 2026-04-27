# Kanban Board App — notes.md

## Purpose
Supplementary build notes for Claude Code. Read alongside spec.md. These notes clarify decisions, flag tricky areas, and set expectations on how to handle ambiguity.

---

## Project Structure
Scaffold as a Vite + React + TypeScript project. Recommended structure:

```
/src
  /components
    /sidebar         — Sidebar, ProjectItem, SidebarRail
    /board           — Board, Column, Card, CardDialog, CardInlineExpand
    /modals          — ImportModal, ErrorModal, ManageColumnsModal, NewProjectModal
    /settings        — SettingsPopover, ThemePicker
  /hooks             — useProjects, useCards, useLocalStorage, useDragSort
  /lib               — firebase.ts, firestore.ts, importParser.ts, themes.ts
  /types             — index.ts (all shared TypeScript types)
  App.tsx
  main.tsx
```

---

## Firebase Notes

### .env variables
CC must read these from `.env` at root. Provide a `.env.example` with placeholder values and instructions. Never commit real values.

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### Firestore security rules
Enforce that a user can only read/write their own documents. Add `userId` field to every project and card document. Rules should deny all unless `request.auth.uid == resource.data.userId`.

### Firestore indexes
CC should note in results.md if any composite indexes need to be created manually in Firebase Console (e.g., cards by projectId + columnId + customOrder).

---

## Sidebar Resize + Collapse

### Resize
- Drag handle: 4px wide invisible hit area on right edge of sidebar, cursor `col-resize`
- On mousedown: attach mousemove/mouseup to document, update width in real time
- Clamp between 160px and 320px
- On mouseup: save to localStorage key `kanban_sidebar_width`
- Do NOT use CSS resize — implement manually for control

### Collapse
- Collapsed width: 48px
- Show only colored group dots (no text)
- Dot tooltip on hover shows project name
- Bottom button: gear icon only (no label)
- Toggle button: small arrow chevron at top of sidebar
- On collapse: save current width to localStorage before collapsing, restore on expand
- localStorage key `kanban_sidebar_collapsed` (boolean)
- localStorage key `kanban_sidebar_width` (number)

---

## Drag and Drop (@dnd-kit)

### Card drag between columns
- Use `DndContext` wrapping the board
- Each column is a `SortableContext` (vertical list strategy)
- Cards are sortable items
- On drop into a new column: update `columnId` in Firestore
- On reorder within a column: update `customOrder` for affected cards AND set project `cardSortMode` to `"custom"`

### Column reorder
- Separate `SortableContext` (horizontal) wrapping column headers
- On drop: update `columnOrder` array in project document

### Visual feedback
- Active drag card: slightly reduced opacity (0.5), shadow ring
- Drop target column: subtle highlight border
- Drop zone between cards: visible dashed line indicator

---

## Card Sort Logic

Sort is applied client-side when rendering cards in a column. Do not re-sort on every Firestore update — sort in the component render based on `cardSortMode`.

```ts
function sortCards(cards: Card[], mode: SortMode): Card[] {
  switch (mode) {
    case 'priority': return sortByPriority(cards)  // Critical=0, High=1, Medium=2, Low=3, null=4
    case 'date':     return sortByDueDate(cards)    // ascending, nulls last
    case 'alpha':    return sortByTitle(cards)      // A-Z
    case 'custom':   return sortByCustomOrder(cards)
  }
}
```

Sort mode selector: small segmented button group in the stats bar area (not per-column — it's per-project). Show: Priority | Date | Alpha | Custom (Custom is auto-selected and grayed out as "Drag to reorder" when mode = custom, clicking any of the other three switches out of custom).

---

## Import Parser

Location: `/src/lib/importParser.ts`

Steps:
1. Read file as text
2. Parse YAML with `js-yaml`
3. Validate each card object against rules in spec
4. Collect all errors with card index and field name
5. If errors.length > 0 → return error list, do not write to Firestore
6. If no errors → batch write all cards to Firestore
7. Default `column` to first column in `project.columnOrder` if omitted

Error message format: `Card #3 · field "column" · value "In Review" is not a valid column on this board`

---

## Import Template Generation

When user clicks "Import cards" in settings popover, before showing the file picker, offer a "Download template" link. Generate this dynamically based on the active project's columns.

Template should be a downloadable `.yaml` file pre-filled with:
- Comment header listing project name
- Comment listing valid column names
- Comment listing valid priorities
- One example card with all fields filled in
- One minimal card with only title

This gives users (and AI assistants) a correct starting point every time.

---

## Theming System

Define themes in `/src/lib/themes.ts` as a map of CSS variable overrides. Apply the active theme by injecting a `<style>` tag or setting variables on `:root`.

Suggested CSS variables to define per theme:
```
--kb-sidebar-bg
--kb-sidebar-text
--kb-sidebar-accent
--kb-board-bg
--kb-card-bg
--kb-card-border
--kb-column-header
--kb-accent-primary
--kb-accent-text
```

Each theme object has a `light` and `dark` variant. When mode switches, swap the variant within the same theme.

---

## Card Dialog

- Opens on card title click
- Uses a modal overlay (fixed position, backdrop blur light)
- Read mode: all fields displayed as labeled rows
- Edit mode: toggled by Edit button, in-place form within the same dialog
- On Save: update Firestore, close edit mode, stay in dialog (read mode)
- On Close: dismiss dialog entirely
- ESC key closes dialog

---

## Inline Card Expand (`···`)

- Clicking `···` toggles an expanded section below the card's base view
- Revealed: full description, tags, due date, links
- Notes are NOT shown inline — dialog only
- Add a "View full card" link at the bottom of the inline expand that opens the dialog
- Clicking `···` again collapses back to base view

---

## Archive

- Archive icon (box/download icon) appears only on cards in the last column (last in `columnOrder`)
- On click: confirm with a small inline popconfirm ("Archive this card?") — not a full modal
- On confirm: set `archived: true` and `archivedAt: timestamp` in Firestore
- Archived cards are filtered out of all board queries
- No archive browser in v1 — archived cards are gone from UI

---

## Error Handling Patterns

- Firestore write failures: show a toast notification (top right, auto-dismiss 4s)
- Auth failure on load: show full-screen error with retry button
- Import validation errors: show error modal (spec defines format)
- Empty states: each column shows a subtle "No cards" message when empty (not a drop zone placeholder)

---

## Sharing Architecture (v2)

The sharing layer added in Session 12 of `results.md` introduces
multi-user access to projects. The decisions below explain why the
shape is what it is.

### Data shape

Each project carries TWO membership fields:

- `members: Record<email, { role, status, invitedAt, invitedBy }>` —
  authoritative per-member state. Used by the Share dialog to render
  the member list with role badges and pending indicators.
- `memberEmails: string[]` — denormalized flat array. Required because
  Firestore cannot run a query over the keys of a map; the
  shared-projects subscription uses `where('memberEmails',
  'array-contains', email)` against this array.

`inviteMember`, `activateMember`, and `removeMember` ALWAYS write
both fields together so they cannot drift apart.

### Why email instead of uid?

At invite time we do not have the invitee's Firebase Auth uid — they
may not have an account yet. Email is the only stable identifier
available before sign-up. Firebase Auth populates `request.auth.token.email`
for both Email/Password and Google providers, so rules can match on
it directly.

Emails are normalized to lowercase before any read or write so the
indexed values are consistent regardless of casing.

### Why a separate `projectOwnerId` on cards?

Firestore rules cannot perform JOINs. To authorize card access for
project members we need to evaluate "is this caller in the parent
project's memberEmails?" — which requires a `get()` on the project
doc. Two facts shape the design:

1. Same-doc gets in a single rule evaluation are deduplicated by
   Firestore, so the `get()` cost is one read per query, not one
   per card.
2. The rule still needs a fast path for the owner. Stamping
   `projectOwnerId` on each card lets the rule compare uids
   directly without `get()` for owner-side reads — important
   because the owner is by far the most common reader.

So card rules check three predicates in order:
   - `request.auth.uid == resource.data.userId` (creator),
   - `request.auth.uid == resource.data.projectOwnerId` (project
     owner),
   - `request.auth.token.email in get(/projects/...).memberEmails`
     (project member, with the cross-doc lookup).

Members can update cards but cannot delete them — `archive` is a
plain update so it remains member-accessible without giving
members destructive power.

### Why drop the `userId` filter from `useCards`?

Pre-sharing, the cards query filtered by `userId == auth.uid` so
each user only saw their own cards (the rules required it). After
sharing, that filter would HIDE cards created by other members of
a shared project. The query now filters by `projectId` only;
security rules gate access via the get()-based membership check.

### Invite-link flow

Links are `?invite=<projectId>` query parameters. When the user
opens such a URL:

1. App.tsx reads the param on mount via `readInviteParam`.
2. If the user is signed out, the SignInScreen receives the
   projectId and shows a banner explaining the invite.
3. After auth completes (any provider), an effect calls
   `activateMember(projectId, user.email)` — which:
   - flips a pre-existing `pending` membership to `active`, OR
   - adds the user as a fresh active member if their email was
     not pre-invited (the link was forwarded).
4. `clearInviteParam()` removes `?invite` from the URL via
   `history.replaceState` so a refresh does not reapply.

This means the link is effectively a bearer token — anyone with it
joins. Revocation is by removal through the Share dialog.

### Roles in the UI

`useProjects` tags every project with a derived `isOwner` boolean
based on `userId === currentUid`. That boolean is plumbed down
through `Sidebar → ProjectItem` (kebab + Share menu visibility),
`Board → Column` (column-reorder grip handle), and
`SettingsPopover` (Manage columns visibility).

UI restrictions are advisory; the source of truth is the Firestore
rules. A member who custom-builds a client and tries to write
`userId`, `members`, `memberEmails`, `columnOrder`, or `columns` is
rejected by the rules engine.

---

## results.md Contract

CC must write a `results.md` file at the project root after each build session. Format:

```md
# Build Results

## Session: [date]

### Completed
- [list of features/files completed]

### Firestore Manual Steps Required
- [any indexes, rules, or console actions the user must do]

### Firebase Console Steps Required
- [e.g., enable Google Auth, add authorized domain]

### Known Issues / Deferred
- [anything not completed or flagged for next session]

### Environment Variables Needed
- [list of .env keys user must fill in]
```

---

## Definition of Done (v1)
- [ ] Firebase project wired, auth working
- [ ] Projects CRUD (create, rename, delete, group)
- [ ] Columns: create, rename, reorder, delete (if empty)
- [ ] Cards: create, edit, move between columns, archive
- [ ] Drag and drop: cards (cross-column + reorder), columns
- [ ] Card sort: priority, date, alpha, custom (drag triggers custom)
- [ ] Import: YAML parse, validate, batch write, error modal, template download
- [ ] Sidebar: resizable, collapsible, localStorage state
- [ ] Theming: 8 themes × light/dark, localStorage persistence
- [ ] Full card dialog: read + edit mode
- [ ] Inline card expand (`···`)
- [ ] Stats bar: total, critical, due this week, overdue
- [ ] results.md written with manual steps