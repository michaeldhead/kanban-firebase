# Kanban Board App — spec.md

## Overview
A personal Kanban board web application hosted on Firebase. Supports multiple independent projects, drag-and-drop card management, YAML-based card import, customizable columns, and full theme control. Built with React + TypeScript, Firestore for data, Firebase Hosting for deployment, and localStorage for UI state preferences.

---

## Tech Stack
- **Frontend**: React + TypeScript (Vite scaffold)
- **Database**: Firebase Firestore
- **Auth**: Firebase Google Sign-In (single user / personal)
- **Hosting**: Firebase Hosting
- **Drag and Drop**: @dnd-kit/core + @dnd-kit/sortable
- **Styling**: Tailwind CSS v3
- **YAML parsing**: js-yaml
- **State persistence (UI prefs)**: localStorage

---

## Firebase Setup
CC will scaffold all Firebase config. User provides:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

These go into a `.env` file at the project root. CC will document which Firestore indexes and security rules are needed, and instruct the user on any manual Firebase Console steps (e.g., enabling Google Auth, setting Hosting).

---

## Firestore Data Model

### Collection: `projects`
```
projects/{projectId}
  id: string
  title: string
  group: string | null         // "CoHo" | "Personal" | null
  columnOrder: string[]        // ordered array of columnIds
  columns: {
    [columnId]: {
      id: string
      title: string
      order: number
    }
  }
  cardSortMode: "priority" | "date" | "alpha" | "custom"
  createdAt: timestamp
  updatedAt: timestamp
```

### Collection: `cards`
```
cards/{cardId}
  id: string
  projectId: string
  columnId: string
  title: string
  description: string | null
  priority: "Critical" | "High" | "Medium" | "Low" | null
  dueDate: string | null        // ISO date string
  tags: string[]                // project-scoped freeform tags
  links: { label: string, url: string }[]
  notes: string | null
  customOrder: number           // used when sortMode = "custom"
  createdAt: timestamp
  updatedAt: timestamp
```

---

## localStorage Keys
```
kanban_sidebar_collapsed: boolean
kanban_sidebar_width: number (px, default 200, min 160, max 320)
kanban_theme: string (theme key)
kanban_color_mode: "light" | "dark"
```

---

## Application Layout

### Sidebar (left)
- Resizable: drag handle on right edge, min 160px, max 320px
- Collapsible: collapses to 48px slim rail showing colored group dots only
- Width and collapsed state persisted to localStorage
- When collapsed, hovering a dot shows a tooltip with project name
- Sections:
  - App logo / wordmark at top
  - Projects grouped by group label (CoHo / Personal / ungrouped)
  - Each project shows a colored dot (CoHo = purple, Personal = teal, ungrouped = gray)
  - Active project highlighted with right-side accent border
  - Bottom: "Settings & more" button (gear icon + label, hidden when collapsed → icon only)

### Settings Popover (lower-left, triggered by Settings button)
Floating popover above the button, items:
1. Import cards
2. Manage columns
3. New project
4. Divider
5. Dark / Light mode toggle
6. Color theme picker

### Main Area
**Top bar:**
- Project title (large)
- Project subtitle: group · type hint
- No action buttons here

**Stats bar (below top bar):**
- Total cards · Critical count (red) · Due this week (amber) · Overdue (red)
- `+` icon button (circle) at far right to add a new card

**Board:**
- Horizontal scrolling flex row of columns
- Each column has header (name + card count badge) and card list
- Columns are drag-reorderable (drag column header)
- Drop zones shown between cards when dragging

---

## Columns

### Per-project configuration
- Each project has its own independent column set
- Default on new project: **To Do / Doing / Done**
- Managed via "Manage columns" in settings popover

### Manage Columns dialog
- List of current columns with drag handles for reordering
- Inline rename each column
- Add new column (appended to right)
- Delete column (only enabled if column has 0 cards; otherwise button disabled with tooltip "Move all cards out first")

---

## Cards

### Card (collapsed view in column)
Visible fields:
- Title (clickable → opens full card dialog)
- Priority badge (top right)
- Description (2-line clamp with fade)
- Tags (pill list)
- Due date (red if overdue)
- `···` button (bottom right) → inline expand
- Archive icon (bottom right, only visible on cards in the last column)

### Card (inline expanded via `···`)
Additional fields revealed below the base card:
- Description (full, no clamp)
- Tags (full list)
- Due date
- Links (label + URL, clickable)
- Collapse button to return to default view

### Card (full dialog, opened by clicking title)
Read mode by default. Shows all fields:
- Title
- Column / Priority / Project
- Description
- Due date
- Tags
- Links
- Notes
- Edit button → switches dialog to edit mode (inline form)
- Close button

### Card edit mode (within dialog)
Editable fields:
- Title (text input)
- Description (textarea)
- Priority (select: Critical / High / Medium / Low)
- Due date (date picker)
- Tags (freeform input + selectable from existing project tags)
- Links (add/remove label+URL pairs)
- Notes (textarea)
- Column (select — allows moving card to another column)
- Save / Cancel buttons

### Archive
- Archive icon appears only on cards in the last column
- Clicking archive removes card from the board (soft delete — sets `archived: true` in Firestore)
- Archive view accessible from... (v2 — out of scope for v1, just archive and hide)

---

## Card Sorting

Each project has a `cardSortMode` field. Options:
- **priority** — Critical → High → Medium → Low → null
- **date** — ascending due date, nulls last
- **alpha** — A–Z by title
- **custom** — manual drag order, stored as `customOrder` integer per card

Sort mode selector shown in column header area (small segmented control or dropdown in board toolbar).

**Drag behavior:**
- Dragging a card to reorder it within a column automatically sets `cardSortMode` to `custom` for that project.
- User can click priority / date / alpha to switch back; doing so reorders all cards and clears custom order.

---

## Drag and Drop
- Cards drag between columns and reorder within columns (@dnd-kit)
- Column headers drag to reorder columns
- Desktop only (no touch support required)
- Visual drop zone indicator shown during drag

---

## Import

### Trigger
Settings popover → "Import cards" → file picker (accepts `.md` or `.yaml`/`.yml`)

### Behavior
- Import is always into the **currently active project**
- The import template/format is **generated based on the active project's column names**
- All-or-nothing: if any card in the batch fails validation, show error modal and import nothing
- Default column: if `column` field is omitted in a card, card goes into column 1 (first column)

### Import YAML format
```yaml
# Kanban Import — Project: Firebase Kanban App
# Valid columns: To Do, Doing, Done
# Valid priorities: Critical, High, Medium, Low

cards:
  - title: "Card title here"
    column: "To Do"               # optional — defaults to first column
    priority: "High"              # optional
    description: "Full description text here."  # optional
    due_date: "2025-06-15"        # optional — YYYY-MM-DD
    tags:                         # optional
      - firebase
      - auth
    links:                        # optional
      - label: "Firebase Docs"
        url: "https://firebase.google.com/docs"
    notes: "Any private notes here."  # optional
```

### Validation rules
- `title` is required for every card
- `column` if provided must match an existing column name exactly (case-sensitive)
- `priority` if provided must be one of: Critical, High, Medium, Low
- `due_date` if provided must be valid ISO date (YYYY-MM-DD)
- `links` entries must have both `label` and `url`

### Error modal
- Title: "Import failed — 0 cards added"
- Subtitle: "Fix the issues below and re-import."
- List of errors, each showing: line/card index + field + reason
- Single OK button

---

## Theming

### Color mode
- Light and Dark, toggled from settings popover
- Persisted to localStorage

### Color themes
Full theme swaps (sidebar bg, accent color, card surfaces, column headers). Theme list:

| Key | Name | Character |
|---|---|---|
| `default-light` | Default Light | Standard white + purple accent |
| `default-dark` | Default Dark | Standard dark + purple accent |
| `slate` | Slate | Cool gray tones |
| `indigo` | Indigo | Deep indigo accent |
| `teal` | Teal | Teal/cyan accent |
| `rose` | Rose | Warm rose accent |
| `amber` | Amber | Warm amber/sand |
| `zinc` | Zinc | Neutral zinc dark |

Each theme defines a set of Tailwind CSS variable overrides. Light/dark mode applies within whichever theme is active.

Theme picker in settings popover shows swatches. Selection persisted to localStorage.

---

## Auth
- Google Sign-In via Firebase Auth
- On app load: if not signed in → full-screen sign-in prompt
- Only the signed-in user's projects and cards are accessible (Firestore rules enforce this)
- No multi-user or sharing in v1

---

## Project Management

### New project (from settings popover)
Dialog fields:
- Project name (required)
- Group (optional select: CoHo / Personal / + type new group)
- Starting columns: preset picker
  - Simple: To Do / Doing / Done
  - Dev: Backlog / Ready / In Dev / Review / Done
  - Custom: blank, add your own

### Edit / delete project
- Right-click or kebab menu on project in sidebar
- Edit: rename, change group
- Delete: only if all cards are archived or deleted (warn if not)

---

## Responsive / Platform
- Desktop web only
- Minimum viewport: 1024px wide
- No mobile optimization required

---

## Out of Scope (v1)
- Archive browser / restore
- Card comments or activity log
- Due date notifications
- Multi-user / sharing
- Mobile touch drag-and-drop
- Export