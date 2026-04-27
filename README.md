# Kanban

A personal Kanban board built with React, TypeScript, and Firebase.
Supports multiple independent projects, drag-and-drop card management,
YAML import, 8 color themes with light / dark modes, and per-project
card sorting.

## Features

- Multiple projects, grouped in a resizable / collapsible sidebar
- Per-project column sets (rename, reorder, add, delete)
- Cards with title, priority, due date, tags, links, description, notes
- Drag-and-drop: cards between columns, cards within a column
  (auto-switches sort to "custom"), and columns themselves
- Four sort modes: Priority, Date, Alpha, Custom
- Full card dialog with read / edit modes
- **Copy to clipboard:** copy any card's full detail as Markdown with
  one click from the card dialog header
- **Label/tag filter bar:** filter visible cards by one or more tags
  with OR logic; column badges show visible/total counts while active
- **Board export:** export cards to Markdown or CSV — scope to current
  filtered view or all cards, optionally include archived cards,
  downloads as a named file
- Archive (soft-delete) on cards in the last column, with a slide-in
  archive drawer for restore or permanent delete
- YAML / Markdown import with validation and a per-project template
  download
- 8 color themes × light/dark, persisted to localStorage
- Toast notifications for Firestore write failures
- **Two sign-in methods:** Email/Password and Google
- **Project sharing:** invite collaborators by email; members can
  view, edit, add, and archive cards but cannot rename, delete, or
  restructure the board
- Firestore security rules enforcing per-user ownership and per-
  project membership

## Tech Stack

- **Frontend:** React 18 + TypeScript, built with Vite
- **Styling:** Tailwind CSS v3, CSS custom properties for theme tokens
- **Auth:** Firebase Authentication (Email/Password and Google Sign-In)
- **Database:** Cloud Firestore
- **Hosting:** Firebase Hosting
- **Drag-and-drop:** [`@dnd-kit/core`](https://docs.dndkit.com/) +
  `@dnd-kit/sortable`
- **YAML:** [`js-yaml`](https://github.com/nodeca/js-yaml)

## Project layout

```
src/
  components/
    auth/                  — SignInScreen
    board/                 — Board, Column, Card, CardDialog, StatsBar,
                             SortModeSelector, FilterBar, ArchiveDrawer
    modals/                — Modal, NewProjectModal, EditProjectModal,
                             ManageColumnsModal, AddCardModal, CardForm,
                             ImportModal, ExportModal
    settings/              — SettingsPopover
    sidebar/               — Sidebar, ProjectItem, groupColor
    toast/                 — ToastProvider
  hooks/                   — useAuth, useProjects, useCards,
                             useArchivedCards, useLocalStorage
  lib/                     — firebase, firestore, cardStats, cardSort,
                             cardExport, themes, importParser,
                             dateUtils, projectUtils, inviteUtils
  types/                   — shared TypeScript types
  App.tsx                  — top-level composition, auth gate, modal
                             orchestration
  main.tsx                 — Vite / React entry + ToastProvider
docs/
  spec.md                  — functional spec
  notes.md                 — build notes
  results.md               — session-by-session implementation log
firestore.rules            — security rules (deploy with Firebase CLI)
firestore.indexes.json     — composite index declarations
firebase.json              — Firebase CLI config (hosting + Firestore)
```

## Firebase project setup

You need a Firebase project with **Authentication** and **Cloud
Firestore** enabled before the app can start. Everything below is a
one-time setup.

### 1. Create a Firebase project

- Go to [console.firebase.google.com](https://console.firebase.google.com/).
- Click **Add project**. Give it any name; the generated project ID
  becomes part of your auth domain.
- Disable Google Analytics unless you want it — this app does not use it.

### 2. Enable sign-in providers

- In the console: **Build → Authentication → Get started**.
- **Sign-in method** tab:
  - Enable **Email/Password** (top of the list). The "Email link"
    sub-option is not required.
  - Enable **Google**. Set a project support email when prompted.
- **Settings → Authorized domains**. Confirm `localhost` is present
  (added by default). Add your Firebase Hosting domain(s) (e.g.
  `<project-id>.web.app` and `<project-id>.firebaseapp.com`) when you
  deploy.

### 3. Create the Firestore database

- **Build → Firestore Database → Create database**.
- Start in **production mode** (the rules in this repo enforce
  per-user access; running in "test mode" would bypass them).
- Pick a region close to your users.

### 4. Register a Web app

- **Project settings (gear icon) → General → Your apps → Add app →
  Web**.
- Give the app a nickname; Firebase Hosting checkbox is optional.
- On the **SDK setup and configuration** screen, copy the six values
  from the `firebaseConfig` object. These become the `.env` entries in
  the next step.

### 5. Deploy security rules and indexes

Install the Firebase CLI if you haven't already:

```
npm install -g firebase-tools
firebase login
```

From the repo root:

```
npx firebase use <your-project-id>
npx firebase deploy --only firestore:rules
npx firebase deploy --only firestore:indexes
```

Security rules in [firestore.rules](firestore.rules) enforce that a
user may only read or write documents where `userId` equals their
Firebase Auth UID. This covers every collection the app writes to
(`projects`, `cards`).

Composite indexes are declared in
[firestore.indexes.json](firestore.indexes.json). They are required
for the archive drawer's filtered queries and for the shared-project
card subscriptions.

## `.env` configuration

Copy [`.env.example`](.env.example) to `.env` at the project root and
fill in the six `VITE_FIREBASE_*` values from Firebase Console. Each
key has a comment in the example file explaining where to find its
value.

The real `.env` is listed in [`.gitignore`](.gitignore) and must never
be committed. Vite requires the `VITE_` prefix for any variable
exposed to client code.

## Local development

```
npm install
npm run dev          # Vite dev server on http://localhost:5173
```

Other scripts:

```
npm run build        # Production build -> dist/
npm run preview      # Serve dist/ locally for a smoke test
npm run lint         # tsc --noEmit typecheck
```

On first load you will be sent to the sign-in screen. After signing in,
click "New project" in the Settings menu (bottom-left of the sidebar)
to create your first project. You can then use **Settings → Import
cards** to bulk-import from a YAML file.

## Deployment (Firebase Hosting)

[`firebase.json`](firebase.json) is pre-configured for Hosting — it
serves the `dist/` folder and rewrites all unknown paths to
`index.html` (the app has no router, but this keeps deep-links
graceful).

```
npm run build
npx firebase deploy --only hosting
```

Remember to add your Hosting domain (`<project-id>.web.app`) to the
**Authorized domains** list in Firebase Auth settings if you have not
already — otherwise Google Sign-In will fail on the deployed app.

## YAML import format

Import is triggered from **Settings → Import cards**. The file picker
accepts `.yaml`, `.yml`, and `.md`. Use the **Download import
template** button in the import dialog to get a pre-filled starting
point based on the active project's current column names.

### Example

```yaml
# Kanban Import Template
# Project: Example project
# Valid columns: To Do, Doing, Done
# Valid priorities: Critical, High, Medium, Low

cards:
  - title: "Fully-populated example"
    column: "To Do"           # optional — defaults to first column
    priority: "High"          # optional
    description: "Short summary shown on the card."
    due_date: "2026-12-31"    # optional — YYYY-MM-DD
    tags:
      - tag-one
      - tag-two
    links:
      - label: "Reference"
        url: "https://example.com"
    notes: "Private notes, not shown on the card."

  - title: "Minimal example — just a title"
```

### Validation rules

- `title` — required, non-empty string.
- `column` — optional. Must match an existing column title exactly
  (case-sensitive). Defaults to the project's first column when
  omitted.
- `priority` — optional. One of `Critical`, `High`, `Medium`, `Low`.
- `due_date` — optional. Must be a valid `YYYY-MM-DD` calendar date.
- `tags` — optional. List of strings.
- `links` — optional. List of `{ label, url }` pairs; both fields
  required. URLs must begin with `http://` or `https://`.
- `description`, `notes` — optional strings.

Import is **all-or-nothing**: if any card in the batch fails validation
the dialog shows a list of errors ("Card #N · field · reason") and
**no cards are written** to Firestore.

## Export

Export is triggered from the download icon in the board header, next
to the **+** add card button. The export dialog offers three options:

- **Cards to export** — Current view (cards visible after any active
  tag filter) or All cards (entire project, ignoring the filter).
- **Format** — Markdown (`.md`) or CSV (`.csv`).
- **Include archived cards** — off by default; fetches archived cards
  from Firestore and appends them to the export when checked.

The exported file is named after the project in kebab-case (e.g.
`article-pipeline.md`). Markdown exports include title, column,
priority, due date, tags, description, notes, and links per card,
separated by `---`. CSV exports use a nine-column header row
(`Title, Column, Priority, Due Date, Tags, Description, Notes, Links,
Archived`) with RFC 4180-style quoting and embedded line breaks
preserved inside quoted cells.

The same field layout is used by the per-card clipboard copy button
in the card dialog header — click the clipboard icon to copy a single
card's detail as Markdown.

## Authentication

Two sign-in methods are supported, both wired into the same auth
state:

- **Email and password.** Sign-up form takes a display name (optional),
  email, and password (minimum 8 characters, confirmed on a second
  field). Returning users sign in with email + password. A "Forgot
  password?" link sends a reset email via Firebase Auth.
- **Google Sign-In.** Uses `signInWithRedirect` rather than the popup
  flow — it avoids the Cross-Origin-Opener-Policy warning that
  popup-based auth triggers in modern browsers. After signing in at
  Google, the browser navigates back to the app URL and the session
  is restored automatically.

Both providers must be enabled in the Firebase Console under
**Authentication → Sign-in method** (see "Firebase project setup"
above). The signed-in user is the same regardless of which provider
they used; project ownership and membership are keyed off the
Firebase Auth uid (for ownership) and email (for membership).

Account creation is invite-only — the sign-up form is only shown when
the visitor arrives via a project invite link.

## Sharing boards

Board owners can invite other people to collaborate. Two flows are
involved:

### From the owner's side

1. In the sidebar, hover the project to reveal its kebab menu (`⋯`).
   Click it and choose **Share…**.
2. Enter the invitee's email address and click **Invite**. The
   invitee is added to the project's member list with status
   `pending`.
3. The dialog shows a generated invite link. Click **Copy** and
   share the link via your preferred channel (email, chat, etc.).
4. To revoke access at any time, open the same Share dialog and
   click **Remove** next to a member. The change takes effect
   immediately — Firestore rules drop their access on the next
   read.

The owner is always present in the member list (with role
`owner`) and cannot be removed.

### From the invitee's side

1. The invitee opens the link. The app reads `?invite=<projectId>`
   from the URL.
2. If the invitee is signed out, the sign-in screen shows a banner
   explaining they have been invited. They can either sign in with
   an existing account or create a new one (using either email or
   Google).
3. As soon as they are signed in, the app activates their
   membership (status flips from `pending` to `active`), removes
   the `?invite` query parameter from the URL, and snaps to the
   shared board.
4. The shared board appears in their sidebar under a "**Shared with
   me**" section, separate from their owned projects.

### What members can and cannot do

Members can:

- View and edit any card on the shared board
- Add new cards
- Move cards between columns (drag-and-drop or the card dialog's
  Column select)
- Archive cards
- Change the per-project sort mode
- Import cards from YAML

Members cannot:

- Rename or delete the project
- Add, rename, reorder, or delete columns
- Invite or remove other members
- Re-share the project (no Share menu item appears for them)

These restrictions are enforced both in the UI (kebab menu hidden,
column drag handle hidden, Manage Columns absent from the Settings
menu, etc.) and at the Firestore-rules layer — a member who tries
to write `userId`, `members`, `memberEmails`, `columnOrder`, or
`columns` from a custom client will be rejected by the rules
engine.

### Invite link semantics

An invite link is essentially a bearer URL: anyone who possesses it
can join the project as an active member. That matches the design —
the owner controls distribution by choosing whom to send the link
to. If you need to revoke access, remove the member through the
Share dialog; the link by itself does not encode the member's
identity.

## Theming

The app ships with 8 themes — Default, Slate, Indigo, Teal, Rose,
Amber, Zinc, Midnight — each with light and dark variants. Open
**Settings** and click a swatch to change theme; the dark/light toggle
flips between the current theme's two variants. Both selections
persist across sessions in localStorage.

Themes are defined in [`src/lib/themes.ts`](src/lib/themes.ts) as maps
of CSS custom properties written onto `<html>` at runtime. All theme-
sensitive components reference these tokens via Tailwind's arbitrary-
value syntax (e.g. `bg-[var(--kb-board-bg)]`), so adding a new theme
is a single-file edit.

## Contributing

This is a personal project. The code is public as a reference — feel
free to fork. Issues and pull requests are welcome but may not receive
a quick response.

## Changelog

### v1.2.0
- Copy to clipboard: one-click Markdown copy from the card dialog header
- Board export: download all or filtered cards as Markdown or CSV,
  with optional archived card inclusion
- Shared export formatting via `cardExport.ts` so clipboard and file
  output use the same field layout

### v1.1.0
- Label/tag filter bar with OR logic and active pill highlighting
- Column card count shows visible/total when filter is active
- Horizontal scrollbar theming across all themes and dark/light modes
- Vertical column scrollbar theming across all themes and dark/light modes
- Sidebar seam color fixed to respond to active theme

### v1.0.0
- Initial release

## License

MIT — see [`LICENSE`](LICENSE).