# Build Results

## Session 32 — Card clipboard copy + Board export (2026-04-27)

Two related output features in one session:

1. **Per-card clipboard copy.** A clipboard
   icon in the CardDialog header (immediately
   left of the close button) copies the card
   to the clipboard as Markdown. Successful
   copy flips the icon to a checkmark for 2 s;
   on clipboard-API failure, a "Copy failed"
   toast surfaces. Copy is hidden in edit
   mode and while the card is loading — only
   the read view is a sensible copy source.
2. **Board export.** A download icon in the
   StatsBar (next to the existing + add
   button) opens an ExportModal with three
   user-facing choices: scope (Current view
   filtered cards / All cards), format
   (Markdown / CSV), and an Include archived
   checkbox. On Export, the modal assembles
   the chosen card set and triggers a browser
   download via Blob + `URL.createObjectURL`,
   then closes with a success toast.

Both surfaces share one pure helper module
([cardExport.ts](../src/lib/cardExport.ts))
so the per-card clipboard format and the
multi-card export format cannot drift on
field ordering or omit-rules.

**Hosting deployed.**
- Hosting: <https://kanban-head.web.app>

Not committed; owner verifies first.

### New: src/lib/cardExport.ts

[cardExport.ts](../src/lib/cardExport.ts):

- `cardToClipboardMarkdown(card)` — single-
  card Markdown for the dialog clipboard
  button. Spec layout: `# title`, optional
  `**Priority:** / **Due:** / **Tags:**` meta
  cluster, optional description body,
  optional `## Notes`, optional `## Links`
  bulleted list. The meta cluster's leading
  blank line is omitted entirely when none
  of the three meta fields is set, so the
  output never has dangling whitespace
  before the description.
- `cardsToExportMarkdown(cards, project)` —
  multi-card variant for the board export.
  Same per-card layout, but the meta cluster
  always includes a `**Column:**` line
  (resolved from `project.columns[card.columnId]?.title`
  with a `Unknown column` fallback for
  archived cards whose origin column was
  later removed) and a `**Status:** Archived`
  line for archived rows. Cards are
  separated by `---` on its own line.
- `cardsToExportCsv(cards, project)` — CSV
  with the spec's nine-column header
  (`Title, Column, Priority, Due Date, Tags,
  Description, Notes, Links, Archived`).
  Every cell is wrapped in `"…"` and inner
  quotes escaped as `""` per RFC 4180; tags
  are joined with `, `, links are
  `"label (url)"` joined by `; `, and
  Archived is `Yes`/`No`. CRLF line
  endings — Excel + LibreOffice both honor
  the CSV with embedded `\n` newlines inside
  notes/description cells, which is the
  spec-required line-break preservation.
- `exportFilename(title, ext)` — kebab-case
  ASCII slug + `.md` / `.csv`. Same
  shape as the import-template downloader's
  filename (Session 8) so users see the
  same stem across both surfaces. Falls
  back to `kanban-export.{ext}` when the
  slug collapses to empty (e.g. an emoji-
  only project name).

The module has no Firestore / DOM imports —
pure functions only — so it is trivially
testable and the two consumers (CardDialog,
ExportModal) cannot accidentally diverge on
field shape.

### Modal.tsx — `headerActions` slot

[Modal.tsx](../src/components/modals/Modal.tsx):

- New optional `headerActions?: ReactNode`
  prop. Rendered immediately to the left of
  the close button inside a new flex
  cluster. The X button stays as the
  rightmost element so its position is
  predictable regardless of how many extra
  controls a caller injects.
- The cluster spaces children with `gap-1`
  to match the close button's 7×7 hit
  target. Callers (CardDialog) style their
  own buttons to mirror the close-button
  classes, which keeps the header chrome
  uniform across dialogs that opt in.
- All existing Modal call sites (Import,
  Add card, Edit project, Manage columns,
  New project, Share project, Card dialog
  in edit mode, Export) leave the prop
  undefined and behave exactly as before.

### CardDialog.tsx — copy-to-clipboard

[CardDialog.tsx](../src/components/board/CardDialog.tsx):

- New imports: `useEffect` + `useRef` for
  the revert timer; `cardToClipboardMarkdown`
  for the payload.
- `copied` state plus a `copiedTimerRef`
  ref. Successful copy flips `copied=true`,
  swaps the header icon for a checkmark,
  and schedules a 2 s revert timer. The ref
  pattern guarantees that rapid repeat
  copies cancel the previous timer rather
  than overlapping — without this, a second
  copy mid-window could revert the icon
  early when the FIRST timer fires.
- Cleanup effect clears the outstanding
  timer on unmount so a copy fired right
  before the dialog closed cannot fire
  setState on a dead instance.
- `handleCopyToClipboard` calls
  `navigator.clipboard.writeText`. On
  rejection (insecure context, denied
  permission, Safari/Firefox edge cases) a
  "Copy failed" toast surfaces; we do not
  differentiate between rejection reasons
  because the user only needs to know the
  copy did not happen.
- The button itself sits in `headerActions`
  on the Modal. Hidden when `editing` or
  not `ready` — only the read view is a
  sensible copy source (mid-edit content is
  unsaved and transient). Same 7×7
  token-styled button as the close button
  so the two read as a pair.
- New inline `ClipboardIcon` and `CheckIcon`
  components at the bottom of the file.
  Hand-rolled SVGs in the lucide-react
  style (the project does not depend on
  lucide-react — every icon in the app is
  inline SVG — so adding the dep just for
  these two glyphs would have been net
  weight for no functional gain). Sized
  4×4 to match the existing header close
  icon.

### StatsBar.tsx — export button

[StatsBar.tsx](../src/components/board/StatsBar.tsx):

- New `onOpenExport` prop. The right-side
  action area went from a single ml-auto +
  button to a flex cluster of two: an
  outlined Export icon (neutral
  border-themed surface, secondary action)
  followed by the existing solid violet +
  button. Plus stays at the far right so
  users with muscle memory still find it
  where they expect; Export reads as the
  paired secondary action.
- New inline `DownloadIcon` SVG at the
  bottom of the file in the existing icon
  style. Three strokes: shelf bracket,
  arrowhead, vertical shaft — the
  lucide-react Download glyph translated
  into the same hand-rolled SVG idiom the
  rest of the file uses. Sized 5×5 to
  mirror PlusIcon.

### New: src/components/modals/ExportModal.tsx

[ExportModal.tsx](../src/components/modals/ExportModal.tsx):

- Three controls per the brief: scope
  radios ("Current view" / "All cards",
  default Current view), format radios
  (Markdown .md / CSV .csv, default
  Markdown), include-archived checkbox
  (default off). Cancel / Export footer
  buttons match the existing Modal footer
  pattern (text Cancel + violet primary).
- Inline `Fieldset` and `RadioOption` form
  primitives. Kept local — if a future
  modal needs the same shape we can
  promote them into a shared module, but
  premature abstraction was the wrong
  trade-off for two radio groups.
- Archived cards are subscribed via the
  existing `useArchivedCards` hook, with
  the project id passed only when the
  modal is open AND the user has ticked
  the Include archived checkbox. At every
  other time the hook receives `null`,
  short-circuits to an empty list, and
  starts no Firestore listener — the
  listener footprint matches user intent.
- An inline error banner surfaces inside
  the dialog if the archived stream errors
  with the checkbox on (typical cause: a
  missing composite index). The Export
  button additionally guards on the same
  condition so a user who clicks anyway
  gets a toast instead of a silently
  truncated file.
- Empty-result safety net: if the resolved
  card set is empty (the most common path
  is "Current view" + a filter that
  matches nothing), the modal pushes a "No
  cards to export." info toast and skips
  the download rather than dropping a
  zero-row file on the user.
- Download trigger uses the same
  Blob + `URL.createObjectURL` + temporary
  `<a download>` pattern as the import-
  template downloader (Session 8). The
  blob URL is revoked after a 1 s delay,
  giving the browser time to start the
  download before we release the
  reference.

### Board.tsx — export modal mount

[Board.tsx](../src/components/board/Board.tsx):

- New `uid` + `userEmail` props plumbed
  down from App. Required by the
  `useArchivedCards` hook inside
  ExportModal — same auth context
  ArchiveDrawer already gets.
- New `exportOpen` state colocated with
  the existing modal-state cluster. We
  keep the export modal mounted in Board
  (not App) because it depends on
  `activeTagFilters`, which lives here;
  threading filter state up to App and
  back down again would have been
  meaningless coupling.
- New `exportVisibleCards` and
  `exportAllCards` memos. Both walk
  `localCardsByColumn` in
  `localColumnOrder` order so the export
  groups cards by column even though the
  output format is flat. We pull from the
  local DnD-aware mirror rather than the
  raw `cards` prop so the export
  reflects the user's actual ordering
  (custom-sort drag results, sort-mode-
  applied order, etc.). Filter logic is
  the same OR-semantics tag check used
  by Column.tsx, lifted to a single set
  membership probe.
- StatsBar receives the new
  `onOpenExport={() => setExportOpen(true)}`
  callback.
- ExportModal mounted at the bottom of
  Board's `<main>`, after the
  archive-entry footer. Same lifecycle
  as the inner board — closes when the
  active project switches (Board
  unmounts and remounts on project
  change).

### App.tsx — Board prop wiring

[App.tsx](../src/App.tsx):

- `<Board>` now receives `uid={user.uid}`
  and `userEmail={user.email ?? null}`.
  No other App-level changes — the export
  modal is owned by Board, not by App's
  modal layer, for the filter-state
  reason described above.

### Out-of-scope (intentionally unchanged)

- **Per-card export from the dialog.** The
  brief specified clipboard copy only for
  the dialog; the export modal was the
  bulk-export surface. Adding a
  per-card download in the dialog would
  blur that line.
- **Lucide-react dependency.** The brief
  named lucide-react glyphs for the icon
  shape; the project does not depend on
  the package. We hand-rolled the three
  icons (Clipboard, Check, Download) as
  inline SVGs matching the rest of the
  app's existing icon style. Pulling in
  lucide-react would have shipped ~20
  KB of glyphs for three uses.
- **Persisted export preferences.** The
  modal resets to defaults each open.
  Persisting to localStorage was not in
  the brief and has no obvious right
  default — a user who exports CSV once
  may still want Markdown next time.
- **Per-column export buttons.** Brief
  specified one board-level export. A
  per-column dropdown could be a follow-
  up but would require its own UX pass.
- **Toast on export-modal close without
  action.** Cancel just closes silently;
  no toast. Matches existing modal
  conventions in this app.

### Build status

- `npx tsc -b` — clean.
- `npx vite build` — clean. CSS bundle
  30.53 KB / 5.99 KB gzipped (was 30.50
  KB / 5.98 KB in Session 30 — the new
  modal's form-control utility classes
  add ~30 raw bytes / ~10 gzipped). JS
  bundle 798.82 KB / 211.97 KB gzipped
  (was 790.91 KB / 209.61 KB — the export
  modal + cardExport module + new icons
  add ~7.9 KB raw / ~2.4 KB gzipped).
- `npm run build` — clean (`tsc -b &&
  vite build`).
- `npx firebase deploy --only hosting` —
  released. Hosting URL:
  <https://kanban-head.web.app>.

### Firestore Manual Steps Required

- None. The export feature reuses the two
  composite indexes that already back the
  archive drawer (Session 14):
  - `cards: projectId ASC + projectOwnerId
    ASC + archived ASC`
  - `cards: projectId ASC + memberEmails
    ARRAY_CONTAINS + archived ASC`

### Firebase Console Steps Required

- None.

### Environment Variables Needed

- None new.

### Sanitization sweep

- No new emails / project IDs / personal
  references in the source diff or in this
  entry.

### Known issues / deferred

- **All Session 31 carry-overs unchanged:**
  filter is per-session not persisted, no
  in-bar tag search, sidebar nav vertical
  scroll still on the older `.kb-scroll`
  thumb, bundle code-splitting (the warning
  fires again — bundle is now 798.82 KB),
  mid-drag snapshot lock semantics,
  cross-column drop position, email-on-
  invite, the orphaned composite index
  from Session 25, `color-mix` browser
  baseline (Chrome 111 / Firefox 113 /
  Safari 16.2).
- **Clipboard API requires a secure
  context (HTTPS or localhost).** The
  hosted app is on `https://kanban-head.web.app`,
  so this is not a practical issue, but a
  future user serving the app over plain
  HTTP would see the "Copy failed" toast
  on every click. The toast is the right
  signal — copy genuinely cannot work
  there.
- **Export does not include subtask /
  comment data.** The Card model has none
  yet; if we add either, the formatters
  in cardExport.ts will need new branches.
- **CSV cell line breaks rely on the
  consumer.** Excel and LibreOffice
  unwrap embedded `\n` inside quoted
  cells correctly; older or stricter
  parsers may not. Acceptable trade-off
  for a personal-use Kanban.

### Suggested commit message

```
feat: card clipboard copy + board export

CardDialog gets a copy-to-clipboard button in
the header, immediately left of the close
button. Click copies the card to the
clipboard as Markdown using the spec layout
(title heading, optional priority/due/tags
meta, optional description, optional notes
section, optional links list). The icon
flips to a checkmark for 2 s on success;
clipboard-API failure surfaces as a "Copy
failed" toast. Copy is hidden in edit mode
and while the card is loading.

StatsBar gets a download icon next to the +
add button. Click opens a new ExportModal
with three controls: scope (Current view
filtered cards / All cards), format
(Markdown / CSV), and an Include archived
checkbox. Export assembles the chosen card
set and triggers a browser download via Blob
+ URL.createObjectURL with a kebab-case
project-name filename. Archived cards are
fetched via the existing useArchivedCards
hook only while the dialog is open AND the
checkbox is on, so the listener footprint
matches user intent.

Both surfaces share src/lib/cardExport.ts:
- cardToClipboardMarkdown(card) — single
  card, no Column line.
- cardsToExportMarkdown(cards, project) —
  multi-card with Column line and
  Status: Archived for archived rows,
  separated by `---`.
- cardsToExportCsv(cards, project) —
  9-column CSV per spec, RFC 4180-ish
  quoting with embedded line breaks
  preserved inside quoted cells.
- exportFilename(title, ext) — kebab-case
  slug + .md/.csv.

Modal grows an optional headerActions slot
so CardDialog can inject the copy button to
the left of the close button without
duplicating the header chrome.

Files:
- src/lib/cardExport.ts                 (new)
- src/components/modals/Modal.tsx       (headerActions prop)
- src/components/modals/ExportModal.tsx (new)
- src/components/board/CardDialog.tsx   (copy button + icons)
- src/components/board/StatsBar.tsx     (export button + icon)
- src/components/board/Board.tsx        (export modal mount + scope memos)
- src/App.tsx                           (uid/userEmail to Board)
- docs/results.md                       (Session 32 entry)
```

---

## Session 31 — v1.1.0 release (2026-04-25)

Pre-commit version bump and docs update for the v1.1.0
release. No source code changes — sessions 26 through 30
contain the actual feature + fix work this version
captures. This session is purely metadata: package
version, README changelog, results.md release entry. No
build, no deploy.

Not committed; owner verifies first.

### package.json — version bump

[package.json](../package.json):

- `"version"` field: `0.0.0` → `1.1.0`. Brief said
  "from 1.0.0 to 1.1.0", but the file was still at the
  Vite scaffold default (`0.0.0`); jumped directly to
  the target version. The Session 25 entry's "v1.0
  release" framing was a documentation milestone — the
  version field itself was never bumped. v1.1.0 is the
  first time it leaves `0.0.0`.

### README.md — Changelog section

[README.md](../README.md):

- New `## Changelog` section inserted between
  `## Contributing` and `## License`. Previously had no
  changelog at all; this is the first entry.
- v1.1.0 bullets list the five user-visible changes
  shipped across sessions 26–30:
  - Label/tag filter bar with OR logic and active pill
    highlighting (Session 26).
  - Column card count shows `visible / total` when filter
    is active (Session 26).
  - Horizontal scrollbar theming across all themes and
    dark/light modes (Sessions 27–30).
  - Vertical column scrollbar theming across all themes
    and dark/light modes (Session 30).
  - Sidebar seam color fixed to respond to active theme
    (Session 30).
- A v1.0.0 "Initial release" entry sits below v1.1.0 so
  the changelog reads like a normal cumulative
  changelog (newest on top) and a fresh reader has a
  baseline to compare against.

### docs/results.md — this entry

This file. Prepended at the top so the v1.1.0 release
is the first thing a reader sees; the per-session
history below is preserved verbatim.

### Build / deploy

Not run. Brief explicitly waives both — no source
changes, only metadata. Sessions 26–30 already verified
the build and deployed to hosting.

### Firestore Manual Steps Required

- None.

### Firebase Console Steps Required

- None.

### Environment Variables Needed

- None new.

### Sanitization sweep

- No new emails / project IDs / personal references in
  the source diff or in this entry.

### Known issues / deferred

- All Session 30 carry-overs unchanged: filter is per-
  session not persisted, no in-bar tag search, sidebar
  nav vertical scroll still on the older `.kb-scroll`
  thumb (out of scope for the seam/scrollbar brief),
  bundle code-splitting, mid-drag snapshot lock
  semantics, cross-column drop position, email-on-invite,
  the orphaned composite index from Session 25,
  `color-mix` browser baseline (Chrome 111 / Firefox 113
  / Safari 16.2).

### Suggested commit message

```
chore: release v1.1.0

Bumps package.json from 0.0.0 → 1.1.0 (the v1.0
milestone in Session 25's release notes was
documentation-only — the version field itself was never
incremented past the Vite scaffold default, so v1.1.0 is
the first real bump).

Adds a Changelog section to README.md listing the five
user-visible changes shipped across Sessions 26–30:
- Label/tag filter bar with OR logic and active pill
  highlighting.
- Column card count shows visible/total when filter is
  active.
- Horizontal scrollbar theming across all themes and
  dark/light modes.
- Vertical column scrollbar theming across all themes
  and dark/light modes.
- Sidebar seam color fixed to respond to active theme.

A v1.0.0 "Initial release" line follows so the changelog
has a baseline to compare against.

Prepends a v1.1.0 entry to docs/results.md per the
results.md contract.

No source code changes, no build, no deploy — pure
metadata bump. The Sessions 26–30 commits already
shipped + verified the underlying behavior.

Files:
- package.json     (version 0.0.0 -> 1.1.0)
- README.md        (new Changelog section)
- docs/results.md  (Session 31 entry)
```

---

## Session 30 — Light-theme scrollbar visibility + sidebar seam (2026-04-25)

Two fixes in one session, both small but in the same theme-
token neighborhood:

1. **Scrollbar thumb migrated from `--kb-card-border` to a
   half-opacity build of `--kb-text-muted`.** Some light
   themes define `--kb-card-border` as a near-white tint
   (e.g. amber's `#fde68a`, rose's `#fecdd3`); against an
   equally-light board surface the scrollbar thumb
   disappeared. `--kb-text-muted` is a slate-400-class
   color in every theme + mode, so a 50%-opacity build of
   it is always visibly darker than any board background
   without becoming harsh on the dark variants.
2. **Sidebar collapse-toggle ring de-hardcoded.** The
   `border-white/10` ring on the chevron toggle straddling
   the right edge does not change with theme. On
   strong-cast palettes (amber, rose) the white-tinted
   ring read as a stale "seam" between the sidebar and the
   board behind it. Now reads `--kb-card-border` so the
   ring follows the active theme.

Dark mode scrollbar visibility is preserved — `--kb-text-muted`
at 50% remains visible against every dark surface. The
shared `.kb-scroll-thin` utility now also serves the
per-column card-list vertical scrollbar (the third surface
the brief named).

**Hosting deployed.**
- Hosting: <https://kanban-head.web.app>

Not committed; owner verifies first.

### index.css — `.kb-scroll-thin` thumb migrated to `color-mix`

[index.css](../src/index.css):

- Thumb / track colors moved from `var(--kb-card-border)` to
  `color-mix(in srgb, var(--kb-text-muted) 50%, transparent)`.
  Hover variant uses 75% instead of 50% — slightly more
  contrast on intentional pointer focus without becoming a
  harsh band.
- `color-mix(in srgb, …, transparent)` is the cross-browser
  way to apply alpha to a value coming from a CSS custom
  property. `rgba(var(--token), 0.5)` does not work on
  hex tokens; an `hsl()` round-trip would either require
  every theme to ship HSL components or a heavier helper.
  `color-mix` is supported in Chrome 111+, Firefox 113+,
  Safari 16.2+, well within this project's modern-browser
  baseline.
- `::-webkit-scrollbar` rule grew a `width: 6px` alongside
  the existing `height: 6px`. Browsers honor only the axis
  that exists on a given scroll container, so the same
  class now covers both horizontal AND vertical scroll
  surfaces — no second class needed for the vertical
  column card list.
- The comment block above the rules was rewritten to
  explain (a) why `--kb-text-muted` is the right token for
  a "visible across every theme" thumb, (b) why the
  `color-mix` syntax is required, (c) that the class now
  applies to three surfaces, listed.
- The pre-existing `.kb-scroll` utility (sidebar nav scroll
  region) is unchanged. The brief's "do NOT change anything
  that affects dark mode scrollbar appearance" guard +
  the explicit three-surface scope kept the sidebar nav
  out of the diff.

### Apply sites — three surfaces

- **Filter bar** — [FilterBar.tsx](../src/components/board/FilterBar.tsx)
  was already on `kb-scroll-thin` (Session 29); no change.
- **Board columns horizontal** — [Board.tsx](../src/components/board/Board.tsx)
  was already on `kb-scroll-thin` (Session 29); no change.
- **Column card list vertical** —
  [Column.tsx](../src/components/board/Column.tsx): card-
  body className `kb-scroll` → `kb-scroll-thin`. New
  comment immediately above the className explains that
  the class is shared with the board's two horizontal
  scrollbars and why the migration was needed (the prior
  `kb-scroll` thumb was a hardcoded `rgba(0, 0, 0, 0.15)`
  that disappeared in dark mode).

### Sidebar.tsx — collapse-toggle border de-hardcoded

[Sidebar.tsx](../src/components/sidebar/Sidebar.tsx):

- Chevron collapse-toggle button at `-right-3 top-4` (the
  only chrome that lives ON the sidebar's right edge):
  `border-white/10` → `border-[var(--kb-card-border)]`.
  The button's `bg-[var(--kb-sidebar-bg)]` already
  followed the theme; the border did not, which is why
  amber / rose etc. showed a stale white-tinted ring as a
  visible "seam" between sidebar and board.
- New comment above the JSX explains the role of this
  element (the visible "seam") and the rationale for the
  token choice. `--kb-card-border` was the right pick over
  `--kb-sidebar-bg` because `bg = border` would make the
  ring invisible — and the user wants the toggle to remain
  visually identifiable.
- All other Sidebar elements with `white/10` etc. are
  inside the dark sidebar surface (settings divider,
  resize-handle hover) and are not part of the "right
  edge seam" the brief described. Left untouched per the
  "do NOT change any other layout, behavior, or logic"
  guard.

### Out-of-scope surfaces (intentionally unchanged)

- **Sidebar nav vertical scroll** — still on `.kb-scroll`.
  Not in the brief's three-surface list; dark-mode
  appearance there cannot change.
- **`.kb-scroll` itself** — pre-themeing thumb color
  preserved verbatim. Sidebar nav uses it; no other
  surface does. Migrating that bar is a natural follow-up
  but explicitly disallowed by the brief.
- **`white/10` chrome inside the sidebar** — settings
  divider, resize-handle hover state. None live on the
  right edge; the brief scoped the seam fix to the right
  edge specifically.

### Build status

- `npx tsc -b` — clean.
- `npx vite build` — clean. CSS bundle 30.50 KB / 5.98 KB
  gzipped (was 30.39 KB / 5.95 KB in Session 29 — the
  doubled `color-mix` declarations and the new `width: 6px`
  add ~110 raw bytes / ~30 gzipped). JS bundle unchanged
  at 790.91 KB / 209.61 KB.
- `npm run build` — clean (`tsc -b && vite build`).
- `npx firebase deploy --only hosting` — released.
  Hosting URL: <https://kanban-head.web.app>.

### Firestore Manual Steps Required

- None.

### Firebase Console Steps Required

- None.

### Environment Variables Needed

- None new.

### Sanitization sweep

- No new emails / project IDs / personal references in the
  source diff or in this entry.

### Known issues / deferred

- **`.kb-scroll` (sidebar nav) still uses
  `rgba(0,0,0,0.15)` thumb.** Same dark-mode invisibility
  story this session fixed for the three board surfaces.
  Migrating the sidebar nav bar to `.kb-scroll-thin` is a
  one-line change but was explicitly out of scope — the
  brief named only three surfaces, and the dark-mode
  guard cautioned against unrelated changes there. Land
  with the next sidebar-area task.
- **`color-mix` baseline.** Requires Chrome 111+ /
  Firefox 113+ / Safari 16.2+ (all released early 2023).
  Older browsers fall back to a missing scrollbar color
  (treats the declaration as invalid), which would render
  as the user-agent default — degraded but not broken.
- All Session 29 carry-overs unchanged: filter is per-
  session not persisted, no in-bar tag search, bundle
  code-splitting, mid-drag snapshot lock semantics,
  cross-column drop position, email-on-invite, the
  orphaned composite index from Session 25.

### Suggested commit message

```
fix(theme): light-mode scrollbar visibility + sidebar seam

Two small theme-token fixes:

1. Scrollbar thumb across the three board scroll surfaces
   (FilterBar, board columns horizontal, column card list
   vertical) migrated from `var(--kb-card-border)` to
   `color-mix(in srgb, var(--kb-text-muted) 50%,
   transparent)` (75% on hover). Some light themes (amber,
   rose) define --kb-card-border as a near-white tint that
   disappeared against an equally-light board surface;
   --kb-text-muted is a slate-400-class color in every
   theme + mode, so a half-opacity build of it is always
   darker than any board background without being harsh
   on the dark variants. The .kb-scroll-thin rule's
   ::-webkit-scrollbar gained `width: 6px` next to
   `height: 6px` so the same class works on both axes —
   the column card list (vertical, third surface in the
   brief) was switched from .kb-scroll to .kb-scroll-thin
   in Column.tsx.

2. The sidebar's right-edge "seam" was the chevron
   collapse-toggle button's border, hardcoded to
   `white/10`. Replaced with var(--kb-card-border) so the
   ring follows the active theme — themes with strong
   color cast (amber, rose) no longer show a stale
   white-tinted ring at the boundary between sidebar and
   board.

The pre-existing .kb-scroll (sidebar nav vertical scroll)
is unchanged — explicitly out of scope per the brief, and
under the "do not change any dark-mode scrollbar
appearance" guard. Migrating it is a natural follow-up.

Files:
- src/index.css                          (color-mix thumb,
                                          width:6px add)
- src/components/board/Column.tsx        (kb-scroll →
                                          kb-scroll-thin)
- src/components/sidebar/Sidebar.tsx     (chevron border
                                          token swap)
- docs/results.md                        (session entry)

Build: tsc -b clean; vite build clean; npm run build
clean. Deployed: hosting only. Hosting URL:
https://kanban-head.web.app.
```

---

## Session 29 — Unified themed scrollbar across both board scroll surfaces (2026-04-25)

The board view has two horizontal-scroll surfaces — the
FilterBar pill row (top) and the columns scroll area
(bottom). Each used a different CSS utility, so each
disappeared in the *opposite* color mode:

- FilterBar (`.kb-scroll-x-hidden`) — themed thumb pulled
  from `--kb-card-border`, which in dark mode contrasts
  against the dark board surface but in light mode is so
  pale it visually disappears against the light board.
- Columns area (`.kb-scroll`) — `rgba(0,0,0,0.15)` thumb,
  visible in light mode (dark on light) but invisible in
  dark mode (dark on dark).

This session collapses both onto a single shared utility
`.kb-scroll-thin` driven by `--kb-card-border` (and
`--kb-text-muted` on hover) so both bars are visible and
identical across every theme + light/dark variant.

The vertical scroll regions (Sidebar, Column card list)
keep using `.kb-scroll` — they are not part of the bug and
the user-agent vertical scrollbar widths there should not
shift.

**Hosting deployed.**
- Hosting: <https://kanban-head.web.app>

Not committed; owner verifies first.

### index.css — new `.kb-scroll-thin`, retire `.kb-scroll-x-hidden`

[index.css](../src/index.css):

- Replaced the entire `.kb-scroll-x-hidden` block with a
  new `.kb-scroll-thin` utility carrying the brief's
  exact CSS:
  ```css
  scrollbar-width: thin;                              /* Firefox */
  scrollbar-color: var(--kb-card-border) transparent; /* Firefox */

  &::-webkit-scrollbar { height: 6px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb {
    background-color: var(--kb-card-border);
    border-radius: 999px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background-color: var(--kb-text-muted);
  }
  ```
- New comment block above the rules documents (a) why both
  horizontal surfaces share one class, (b) why no `width`
  is set — the class is intentionally horizontal-only so
  vertical scroll regions can keep using `.kb-scroll`
  without their existing 10 px width regressing to a
  browser default, (c) why driving the colors off
  `--kb-card-border` matches the FilterBar's bottom border
  for visual coherence.
- The pre-existing `.kb-scroll` rules (sidebar + column
  card list) are unchanged. The two vertical scroll
  regions still get the 10 px wide universal-dark thumb
  they had before this session.
- Renaming the class from `kb-scroll-x-hidden` to
  `kb-scroll-thin` also clears the deferred "class name
  is misleading" item from Session 28 — the new name
  describes what the class actually does (slim themed
  scrollbar), so future contributors do not have to
  reconcile the `-hidden` suffix with a visible
  scrollbar.

### Apply sites

[FilterBar.tsx](../src/components/board/FilterBar.tsx):
- Outer container className: `kb-scroll-x-hidden` →
  `kb-scroll-thin`. The inline comment above the
  className was rewritten to point at the new shared
  utility and to call out that the same class is used by
  the columns scroll surface so both bars stay in
  lockstep.
- Header docstring's reference to "kb-scroll utility" was
  updated to "kb-scroll-thin utility".

[Board.tsx](../src/components/board/Board.tsx):
- Columns scroll surface className: `kb-scroll` →
  `kb-scroll-thin`. New comment immediately above the
  div explains the class is shared with the FilterBar so
  both horizontal scrollbars on this view look identical
  across themes + modes.
- No other Board changes — DnD, sort handlers, and column
  rendering all unchanged.

### Out-of-scope surfaces (intentionally unchanged)

- [Sidebar.tsx](../src/components/sidebar/Sidebar.tsx)
  `<nav className="kb-scroll …">` — vertical scroll, kept
  on `.kb-scroll` (10 px width universal dark thumb).
- [Column.tsx](../src/components/board/Column.tsx) card
  list `<div className="kb-scroll …">` — vertical scroll
  inside each column, kept on `.kb-scroll`.

The brief named only the two horizontal surfaces (filter
bar + columns); leaving the verticals on `.kb-scroll`
keeps the bug fix tightly scoped and avoids a cosmetic
ripple in unrelated regions.

### Build status

- `npx tsc -b` — clean.
- `npx vite build` — clean. CSS bundle 30.39 KB / 5.95 KB
  gzipped (was 30.30 KB / 5.94 KB in Session 28 — the
  `:hover` rule and `scrollbar-width: thin` add ~90 raw
  bytes / ~10 gzipped). JS bundle unchanged at 790.89 KB
  / 209.60 KB.
- `npm run build` — clean (`tsc -b && vite build`).
- `npx firebase deploy --only hosting` — released.
  Hosting URL: <https://kanban-head.web.app>.

### Firestore Manual Steps Required

- None.

### Firebase Console Steps Required

- None.

### Environment Variables Needed

- None new.

### Sanitization sweep

- No new emails / project IDs / personal references in the
  source diff or in this entry.

### Known issues / deferred

- **Vertical `.kb-scroll` is still rgba-black-thumbed.**
  The Sidebar and Column card list scrollbars carry the
  pre-themeing thumb color (`rgba(0,0,0,0.15)`) which has
  the same bad-contrast story in dark mode that this
  session just fixed for the horizontal surfaces — but
  scoped to vertical scroll regions, which the brief did
  not include. Migrating those to a `--kb-card-border`-
  driven thumb is a natural follow-up; not done here to
  keep the diff tight.
- All Session 28 carry-overs unchanged: filter is
  per-session not persisted, no in-bar tag search,
  bundle code-splitting, mid-drag snapshot lock semantics,
  cross-column drop position, email-on-invite, the
  orphaned composite index from Session 25.

### Suggested commit message

```
fix(scrollbars): unify themed scroll across both board
surfaces

The board view has two horizontal-scroll surfaces — the
FilterBar pill row and the columns scroll area. Before
this fix each used a different CSS utility and each
disappeared in the opposite color mode:

- FilterBar's `.kb-scroll-x-hidden` thumb pulled from
  --kb-card-border. Visible in dark mode (border vs
  dark board), invisible in light mode (border vs light
  board).
- Columns area's `.kb-scroll` thumb was rgba(0,0,0,0.15).
  Visible in light mode (dark on light), invisible in
  dark mode (dark on dark).

Replaces both with a single shared `.kb-scroll-thin`
utility driven by --kb-card-border (with --kb-text-muted
on hover). Both surfaces are now visible and identical
across every theme + light/dark variant. The vertical
scroll regions (Sidebar, Column card list) keep using
`.kb-scroll`, so their 10 px universal-dark thumb is
preserved — those surfaces were not part of the brief.

Renaming kb-scroll-x-hidden -> kb-scroll-thin also
clears the deferred "class name is misleading" item
from Session 28 — the new name describes what the
class does (slim themed scrollbar) instead of what it
no longer does (hide the bar).

Files:
- src/index.css                          (new shared
                                          utility, drop
                                          old class)
- src/components/board/FilterBar.tsx     (apply site)
- src/components/board/Board.tsx         (apply site)
- docs/results.md                        (session entry)

Build: tsc -b clean; vite build clean; npm run build
clean. Deployed: hosting only. Hosting URL:
https://kanban-head.web.app.
```

---

## Session 28 — FilterBar themed scrollbar (2026-04-25)

Single focused fix to the Session 27 FilterBar scrollbar:
the `kb-scroll-x-hidden` utility hid the scrollbar entirely
(`scrollbar-width: none` + `::-webkit-scrollbar { display:
none }`), which meant horizontal-overflow had no visual cue
in either mode. The brief calls for the scrollbar to be
visible AND themed across every theme + color mode by
driving its colors off `--kb-card-border` (the same token
the bar's bottom border uses), so it picks up the active
theme automatically. No FilterBar.tsx change required —
the class name stays the same, only its CSS body changes.

**Hosting deployed.**
- Hosting: <https://kanban-head.web.app>

Not committed; owner verifies first.

### index.css — `.kb-scroll-x-hidden` rebuilt around themed colors

[index.css](../src/index.css):

- Removed the previous Firefox `scrollbar-width: none` and
  Chromium / Safari `::-webkit-scrollbar { display: none }`
  rules. The scrollbar now renders.
- Added the four new declarations the brief specifies:
  - `scrollbar-color: var(--kb-card-border) transparent;` —
    Firefox shorthand, thumb + track in one go.
  - `::-webkit-scrollbar { height: 4px; }` — slim track on
    Chromium / Safari so the bar reads as chrome rather
    than a primary affordance.
  - `::-webkit-scrollbar-track { background: transparent; }`
    — track blends into whatever surface the FilterBar sits
    on.
  - `::-webkit-scrollbar-thumb { background-color:
    var(--kb-card-border); border-radius: 999px; }` — the
    thumb picks up the same theme variable the FilterBar's
    bottom border uses, so light, dark, and every named
    theme produce a visible-but-on-brand thumb without any
    per-theme bookkeeping.
- The class-name `kb-scroll-x-hidden` is now somewhat
  misleading — the scrollbar is no longer hidden. The
  comment block above the rules calls this out and explains
  why the rules now produce a slim themed scrollbar
  instead. Renaming would touch FilterBar.tsx and was out
  of scope for the fix; future cleanup can rename freely
  without changing visual behavior.
- The existing `.kb-scroll` utility above is unchanged —
  still used by board / sidebar / column scroll regions
  that want the wider 10 px scrollbar.

### FilterBar.tsx

No change. The component continues to apply
`kb-scroll-x-hidden`; only the CSS body of that class
moved. The container's `overflow-x-auto`, `flex-nowrap`,
border, padding, and pill / Clear children are all
identical to Session 27.

### Build status

- `npx tsc -b` — clean.
- `npx vite build` — clean. CSS bundle 30.30 KB / 5.94 KB
  gzipped (was 30.10 KB / 5.93 KB in Session 27 — the four
  new scrollbar declarations add ~200 raw bytes / ~10
  gzipped). JS bundle unchanged at 790.89 KB / 209.61 KB.
- `npm run build` — clean (`tsc -b && vite build`).
- `npx firebase deploy --only hosting` — released. Hosting
  URL: <https://kanban-head.web.app>.

### Firestore Manual Steps Required

- None.

### Firebase Console Steps Required

- None.

### Environment Variables Needed

- None new.

### Sanitization sweep

- No new emails / project IDs / personal references in the
  source diff or in this entry.

### Known issues / deferred

- **`.kb-scroll-x-hidden` class name is now misleading.**
  The CSS no longer hides the scrollbar; it themes it. The
  comment block above the rules documents the disconnect.
  Renaming is a non-functional cleanup that can land any
  time the file is next touched.
- All Session 27 carry-overs unchanged: filter is
  per-session not persisted, no in-bar tag search, bundle
  code-splitting, mid-drag snapshot lock semantics,
  cross-column drop position, email-on-invite, the
  orphaned composite index from Session 25.

### Suggested commit message

```
fix(filter-bar): themed scrollbar visible in dark mode

The Session 27 .kb-scroll-x-hidden utility hid the
scrollbar entirely (`scrollbar-width: none`,
`::-webkit-scrollbar { display: none }`). That left a
horizontally-overflowing tag list with no visual indication
that there was more content off-screen — a problem in both
modes, but most noticeable in dark mode where the user has
no scrollbar at all.

Replaces the hide rules with a slim themed scrollbar that
reads the same `--kb-card-border` token the FilterBar's
bottom border uses, so every theme + light/dark variant
gets a visible-but-on-brand scrollbar without per-theme
bookkeeping:
- Firefox: scrollbar-color: var(--kb-card-border)
  transparent.
- Chromium / Safari: ::-webkit-scrollbar { height: 4px },
  transparent track, var(--kb-card-border) thumb,
  rounded-full corners.

The class is still named `kb-scroll-x-hidden` — the body
is what changed, not the application site. FilterBar.tsx
is unchanged. The comment block above the rules in
index.css notes the now-misleading name; a non-functional
rename can land next time the file is touched.

Files:
- src/index.css            (rules rebuilt around themed
                             scrollbar colors)
- docs/results.md          (session entry)

Build: tsc -b clean; vite build clean; npm run build clean.
Deployed: hosting only. Hosting URL:
https://kanban-head.web.app.
```

---

## Session 27 — FilterBar horizontal scroll fix (2026-04-25)

Single focused fix to the Session 26 FilterBar: with enough
tags to overflow the viewport, the pills were not scrolling
horizontally — the visible scrollbar from `kb-scroll` looked
visually noisy and the `flex-nowrap` default was implicit
rather than declared. Replaced the visible-scrollbar utility
with a new invisible-scrollbar utility and made `flex-nowrap`
explicit on the FilterBar root. No other behavior, layout, or
logic changed.

**Hosting deployed.**
- Hosting: <https://kanban-head.web.app>

Not committed; owner verifies first.

### New utility — `.kb-scroll-x-hidden` in index.css

[index.css](../src/index.css):
- Added a new utility that hides the scrollbar chrome while
  leaving the element fully scrollable:
  ```css
  .kb-scroll-x-hidden {
    scrollbar-width: none;            /* Firefox */
  }
  .kb-scroll-x-hidden::-webkit-scrollbar {
    display: none;                    /* Chromium / Safari */
  }
  ```
- Comment block above the rules explains that wheel /
  trackpad / touch scroll all still work — only the visible
  bar is suppressed. Sits next to the existing `.kb-scroll`
  rules so a contributor scanning the file sees both
  utilities side by side and picks the right one.
- The existing `.kb-scroll` utility is unchanged — still used
  by the board / sidebar / column scroll regions where a
  visible thin scrollbar is the desired affordance.

### FilterBar.tsx — switch utility class + declare flex-nowrap

[FilterBar.tsx](../src/components/board/FilterBar.tsx):
- Outer container className: `kb-scroll` → `kb-scroll-x-hidden`,
  and added `flex-nowrap` next to `flex` so the no-wrap
  behavior is declared explicitly rather than relying on the
  CSS default. This catches a future change that might swap
  `flex` for `flex-wrap` (which would let pills wrap onto a
  second line) at code-review time.
- New comment above the className spells out (a) why
  `flex-nowrap` is declared explicitly, (b) why
  `overflow-x-auto` plus `kb-scroll-x-hidden` together yield
  invisible-but-functional horizontal scroll on every
  supported browser.
- No other styling, layout, prop, or rendering change. The
  pill-row inner `<div>`, the leading label, the Clear button,
  and all toggle / clear handlers are unchanged.

### Build status

- `npx tsc -b` — clean.
- `npx vite build` — clean. CSS bundle 30.10 KB / 5.93 KB
  gzipped (was 30.01 KB / 5.91 KB in Session 26 — the new
  utility adds ~90 raw bytes / ~20 gzipped). JS bundle
  unchanged-modulo-noise at 790.89 KB / 209.61 KB.
- `npm run build` — clean (`tsc -b && vite build`).
- `npx firebase deploy --only hosting` — released. Hosting
  URL: <https://kanban-head.web.app>.

### Firestore Manual Steps Required

- None.

### Firebase Console Steps Required

- None.

### Environment Variables Needed

- None new.

### Sanitization sweep

- No new emails / project IDs / personal references in the
  source diff or in this entry.

### Known issues / deferred

- All Session 26 carry-overs are unchanged: filter is
  per-session not persisted, no in-bar tag search input,
  bundle-size code-splitting deferred, mid-drag snapshot
  lock semantics, cross-column drop position, email-on-
  invite, the orphaned composite index from Session 25.

### Suggested commit message

```
fix(filter-bar): horizontal scroll with hidden scrollbar

The Session 26 FilterBar used `kb-scroll` (which renders a
visible thin scrollbar) and relied on the implicit
flex-nowrap default. With more tags than viewport width,
the result was visually noisy and — depending on the
browser's flex-default behavior at narrow widths — pills
could appear clipped instead of scrollable.

Adds a new `.kb-scroll-x-hidden` utility in src/index.css
with `scrollbar-width: none` (Firefox) and
`::-webkit-scrollbar { display: none }` (Chromium / Safari)
so the scrollbar chrome is suppressed while wheel /
trackpad / touch scroll remain fully functional. Switches
the FilterBar root from `kb-scroll` to the new utility and
declares `flex-nowrap` explicitly so the no-wrap behavior
is no longer dependent on the CSS default.

The existing `.kb-scroll` utility is untouched — still used
by the board / sidebar / column scroll regions where a
visible thin scrollbar is the right affordance. No other
FilterBar behavior, layout, or styling changed.

Files:
- src/index.css                          (new utility)
- src/components/board/FilterBar.tsx     (switch class +
                                          flex-nowrap)
- docs/results.md                        (session entry)

Build: tsc -b clean; vite build clean; npm run build clean.
Deployed: hosting only. Hosting URL:
https://kanban-head.web.app.
```

---

## Session 26 — Tag filter bar (2026-04-25)

Adds a per-board client-side tag filter. The user picks one or
more tag pills in a new row between the StatsBar and the
columns, and cards whose tags do not intersect the selected
set are hidden via `display: none` (kept in the DOM so the
dnd-kit sortable structure is undisturbed). Per-column badges
now show `visible / total` while a filter is active and revert
to the plain total when no filter is selected.

No Firestore changes — filter state lives in component state,
intentionally ephemeral so it resets on project switch and on
reload.

**Hosting deployed.**
- Hosting: <https://kanban-head.web.app>

Not committed; owner verifies first.

### New file — FilterBar.tsx

[FilterBar.tsx](../src/components/board/FilterBar.tsx) — the
horizontal toolbar that hosts the tag pills.

- Receives `allTags`, `activeTagFilters`, `onToggleTag`, and
  `onClear` from the parent (Board); owns no state itself, so
  the filter is the parent's concern and the bar is purely
  presentational.
- Self-short-circuits with `return null` when `allTags` is
  empty as a defense-in-depth — the parent already gates
  rendering on the same condition, but a stray direct render
  with an empty list should not produce an empty bordered
  strip.
- Layout uses `flex` + `flex-nowrap` and the existing
  `kb-scroll` utility from `index.css`, so a project with many
  tags scrolls horizontally rather than wrapping onto a second
  line. The leading "Filter by tag:" label keeps
  `whitespace-nowrap` so it does not collapse during scroll.
- Pills are `rounded-full`, compact (`px-2.5 py-0.5
  text-xs`), and swap surface + border + text colors on the
  active state instead of overlaying a separate active
  indicator. Inactive: `border-[var(--kb-card-border)]`,
  `text-[var(--kb-text-secondary)]`, transparent background.
  Active: `bg-[var(--kb-accent-primary)]` +
  `text-[var(--kb-accent-text)]`, transparent border.
  `aria-pressed` reflects the toggle state for assistive tech.
- Clear button is rendered only when `activeTagFilters.length
  > 0`, sits at the row's right end via `ml-auto`, and uses
  `text-[var(--kb-text-muted)]` with no border so it reads as
  a secondary action that does not compete with the pills.
- `role="toolbar"` + `aria-label="Filter cards by tag"` on the
  container surfaces the bar to screen readers as a
  pill-toggle group.

### Token note

The brief's "Active style: bg using `var(--kb-accent)`" maps
to `--kb-accent-primary` / `--kb-accent-text` in the existing
theme contract (`themes.ts` declares the pair; there is no
plain `--kb-accent`). Used the existing tokens so all eight
themes × light/dark variants pick the active pill up for free
and the active fill matches the round "+ add card" button on
the StatsBar.

### Board.tsx — state, derivation, render

[Board.tsx](../src/components/board/Board.tsx):

- New `useState<string[]>([])` for `activeTagFilters`. Lives
  in component state, not localStorage — filters are scoped
  to "this session on this board" and intentionally reset on
  project switch / reload.
- New `useEffect` keyed on `project.id` clears the filter
  whenever the active project changes. Without this, a tag
  selected on Project A would silently hide cards on Project
  B if both happened to share a tag pool.
- New `allTags` `useMemo` walks the flat `cards` prop, dedupes
  via a `Set`, and returns a sorted array. The spec sketch
  iterated `columns -> col.cards -> card.tags`; in this
  codebase cards are passed flat, so we walk them directly.
- New `useEffect` keyed on `allTags` prunes any active filter
  that no longer corresponds to a real tag (e.g. the last
  card carrying that tag was archived, or the user just
  switched projects). Returns the previous array reference
  when nothing changed so downstream memoization does not
  thrash.
- New `toggleTagFilter(tag)` and `clearTagFilters()`
  callbacks; both are simple setters.
- FilterBar is rendered immediately after StatsBar and before
  the columns scroll region. The render is gated on
  `allTags.length > 0` so a project with no tagged cards has
  no empty bar.
- `activeTagFilters` is forwarded to every `<Column>` so the
  filter logic and the badge can reuse it without each column
  having to re-derive the set.

### Column.tsx — visibility + badge

[Column.tsx](../src/components/board/Column.tsx):

- New `activeTagFilters: string[]` prop.
- Pre-renders, the column computes `filterActive`, a
  `Set<string>` of active filters (only when active, to skip
  the allocation in the common no-filter case), an
  `isVisible(card)` helper that returns true on no filter and
  otherwise tests for tag intersection (OR semantics:
  visible iff any of the card's tags are in the active set),
  and `visibleCount` for the badge.
- Header badge: when a filter is active, renders
  `${visibleCount} / ${cards.length}` (e.g. "3 / 8"); when
  not, renders the original `cards.length` only — preserving
  the prior look for the unfiltered case.
- Card list: every card in `cards` is still rendered (the
  array is untouched), but each row receives a new
  `hidden={!isVisible(c)}` prop. Hidden cards stay in the DOM
  + the SortableContext membership stays whole, so the
  dnd-kit collision detection and column heights are
  unaffected by the filter — exactly the spec's "do not
  remove them from the DOM" requirement.

### Card.tsx — display:none on hidden

[Card.tsx](../src/components/board/Card.tsx):

- New optional `hidden?: boolean` prop, defaulting to `false`
  so any caller that does not pass it gets unchanged
  behavior.
- `style` adds `display: 'none'` when `hidden` is true. Chose
  `display: none` over `visibility: hidden` because the spec
  explicitly calls it out and because it drops the card out
  of layout flow — the column collapses to the height of its
  visible cards while the filter is active.
- `display: none` also removes the element from the
  accessibility tree, so screen-reader announcements track
  the visible set automatically — no extra `aria-hidden`
  needed.

### Filter semantics summary

- Empty set → no filter applied; all cards visible (zero
  behavioral change to the unfiltered baseline).
- One or more tags → OR logic: a card is visible iff any of
  its tags appear in the active set. Cards with no tags are
  always hidden under any active filter, since they have
  nothing to match against.
- Filtering is applied at the card render level inside each
  column, never at the column level — empty / fully-filtered
  columns still render so the user can see board structure
  and drop targets remain available.
- DnD interaction with filters: hidden cards are still in the
  SortableContext, but `display: none` removes their rect, so
  collision detection cannot resolve to them. Net effect: a
  card cannot be dropped between two hidden cards (which is
  the right behavior — the user cannot see those positions).
  Visible cards drag and reorder normally.

### Build status

- `npx tsc -b` — clean.
- `npx vite build` — clean.
- `npm run build` — clean (`tsc -b && vite build`). Main
  bundle 790.87 KB pre-gzip / 209.60 KB gzipped, within noise
  of Session 25 (the FilterBar component is small and the
  added Board state / Column branch land mostly in the
  minifier's noise budget).
- `npx firebase deploy --only hosting` — released. Hosting
  URL: <https://kanban-head.web.app>.

### Firestore Manual Steps Required

- None. Feature is purely client-side; no rule, index, or
  schema work.

### Firebase Console Steps Required

- None.

### Environment Variables Needed

- None new. The existing `VITE_FIREBASE_*` keys cover this
  feature like every other Board concern.

### Sanitization sweep

- No new emails / project IDs / personal references in the
  source diff or in this entry.

### Known issues / deferred

- **Filter is per-session, not persisted.** Reload or
  project-switch clears the active set. By design — filters
  are scoped to "narrow what I'm looking at right now"
  rather than a sticky preference. If a future need surfaces
  for sticky filters, the natural home is a new
  localStorage key (e.g. `kanban_active_tag_filters_<projectId>`)
  reading/writing through `useLocalStorage`; the current
  setter shape would not change.
- **No tag-search input.** Projects with many tags scroll
  horizontally; a future search box could collapse a long
  list. Out of scope for this brief.
- **Carry-overs unchanged**: bundle-size code-splitting,
  mid-drag snapshot lock semantics, cross-column drop
  position fine-tuning, email-on-invite, the orphaned
  composite index from Session 25.

### Suggested commit message

```
feat: tag filter bar

Adds a per-board client-side tag filter. A new FilterBar row
sits between the StatsBar and the columns; pills represent
every unique tag on the board. Clicking a pill toggles it in
the active set; OR-logic hides any card without at least one
matching tag. A "Clear" button at the row's right end appears
when at least one tag is selected.

Hidden cards stay in the DOM with `display: none` so the
dnd-kit SortableContext membership and column heights are
not disrupted while the filter is active. Each column header
badge switches from `total` to `visibleCount / total` when
a filter is active so the user can see at a glance how much
of each column the filter is hiding.

Filter state lives in Board.tsx component state, not
localStorage — switching projects or reloading clears the
active set. An effect keyed on the active tag pool prunes
any selected tag that has stopped existing (e.g. its last
card was archived) so the filter never silently hides every
card.

All new colors come from var(--kb-*) tokens — every theme +
mode picks the bar up for free. The active pill fill uses
--kb-accent-primary / --kb-accent-text (no plain --kb-accent
exists in themes.ts; closest legitimate match).

No Firestore changes; no rule / index updates.

Files:
- src/components/board/FilterBar.tsx (new)
- src/components/board/Board.tsx       (filter state, allTags
                                        memo, render gate)
- src/components/board/Column.tsx      (activeTagFilters prop,
                                        visibleCount, badge,
                                        per-card hidden)
- src/components/board/Card.tsx        (hidden prop -> display
                                        none)
- docs/results.md                      (session entry)

Build: tsc -b clean; vite build clean; npm run build clean.
Deployed: hosting only. Hosting URL:
https://kanban-head.web.app.
```

---

## Session 25 — Review remediation, round 2 (v1.0 release) (2026-04-25)

The remaining six findings from `docs/review.md` — the cleanup
tail Session 24 deferred. With these in, every CF/MF item from
the review is closed.

**Indexes + hosting deployed.**
- Hosting: <https://kanban-head.web.app>
- Firestore indexes: deployed.

Not committed; owner verifies first.

### MF-4 — Removed dead re-seed `useEffect` in CardForm

[CardForm.tsx](../src/components/modals/CardForm.tsx):
- Deleted the `useEffect(() => { ... }, [initial?.title,
  initial?.columnId])` that re-seeded every form field. The
  effect was unreachable under the current architecture:
  CardDialog uses `key={openCardId ?? 'closed'}` so a new
  CardForm instance mounts on every open, and AddCardModal
  is conditionally rendered (`addCardOpen && <AddCardModal>`)
  so the form unmounts on close and remounts on the next
  open. In both paths the `useState` initializers reseed
  naturally.
- Header docstring gains a "State reset between cards"
  paragraph so a future contributor does not reintroduce
  the effect by accident.
- `useEffect` is no longer imported.

### MF-7 — Stable link keys

Display lists ([CardDialog.tsx](../src/components/board/CardDialog.tsx)):
- `key={i}` on the link `<li>` → `key={`${l.url}-${i}`}`.
  Card.tsx no longer renders links (Session 20 removed
  inline expand), so only one display list needed
  updating.

Form rows ([CardForm.tsx](../src/components/modals/CardForm.tsx)):
- New internal `LinkRow = { id: string; label: string;
  url: string }` interface. The form's `links` state is now
  `LinkRow[]`.
- Module-level `genLinkId()` helper uses
  `crypto.randomUUID()` where available with a counter +
  timestamp + `Math.random()` fallback. The seed at mount
  (`seedLinkRows(initial?.links)`) and the Add-link button
  both call it.
- Edit / remove handlers updated to match by `id` instead
  of by array index. A stable identity through the lifetime
  of an open form means a mid-list delete does not re-key
  the next-row's controlled inputs onto a different React
  element.
- The `cleanLinks` filter that runs at submit already
  destructures `label` and `url` only, so the public
  `CardLink` shape forwarded to `onSubmit` is unchanged.

### MF-8 — Third composite index gains `userId`

[firestore.indexes.json](../firestore.indexes.json):
- The `projectId + columnId + customOrder` index now has
  `userId` as the leading field. Any future query that
  needs this index will pair it with the
  `where('userId', '==', uid)` filter the rules engine
  requires for static-proof acceptance.
- Deployed via `npx firebase deploy --only
  firestore:indexes`. The CLI noted one orphaned index
  in the project (the previous declaration without
  `userId`); leaving it in place since it is harmless and
  removal would require `--force`. A future cleanup can
  delete it.

### MF-2 — `collectGroupNames` extracted to a shared utility

New file [projectUtils.ts](../src/lib/projectUtils.ts) —
houses `collectGroupNames(projects: Project[]): string[]`
with its JSDoc. The two duplicate copies in
[NewProjectModal.tsx](../src/components/modals/NewProjectModal.tsx)
and
[EditProjectModal.tsx](../src/components/modals/EditProjectModal.tsx)
were removed; both files import from `projectUtils`. Behavior
unchanged.

### MF-3 — Date utilities extracted to a shared module

New file [dateUtils.ts](../src/lib/dateUtils.ts) — exports
`parseISODate`, `startOfToday(now?)`, `formatDate` (omits
year for the current year — used by Card and the archive
drawer), and `formatDateLong` (always shows year — used by
CardDialog's read view).

Removed local copies from:
- [Card.tsx](../src/components/board/Card.tsx) —
  `parseISODate`, `startOfToday`, `formatDate`.
- [CardDialog.tsx](../src/components/board/CardDialog.tsx)
  — local `formatDate`. The dialog's read view now calls
  `formatDateLong` (the always-year variant) so the
  long-form output is preserved.
- [ArchiveDrawer.tsx](../src/components/board/ArchiveDrawer.tsx)
  — `parseISODate`, `startOfToday`, `formatDate` (Session
  21 had introduced its own copies; this session
  consolidates them).
- [cardStats.ts](../src/lib/cardStats.ts) —
  `startOfDay` (renamed and re-exported as
  `startOfToday`) and `parseISODate`. The
  `computeStats(now)` signature is unchanged; it forwards
  the `now` argument to `startOfToday` for testability.

### MF-10 — Toast `setTimeout` cleanup on unmount

[ToastProvider.tsx](../src/components/toast/ToastProvider.tsx):
- New `timers = useRef(new Set<number>())` tracks every
  outstanding auto-dismiss handle.
- `push` adds the new handle to the set and the timeout
  callback removes its own handle on natural fire (so the
  set does not grow unbounded).
- New unmount-only `useEffect` clears every still-pending
  handle and empties the set. Under the current
  architecture (provider lives the entire app lifetime)
  this is a no-op; the value is in the next environment
  the provider gets used in (a test that mounts and
  unmounts the tree, or a future code-split path that
  conditionally renders the provider).

### Build status

- `npx tsc -b` — clean.
- `npm run build` — clean (`tsc -b && vite build`). Main
  bundle ~789 KB pre-gzip / ~209 KB gzipped (within noise
  of Session 24 — the consolidation moves code without
  growing it; the new id helper and timer-tracking ref
  add a few hundred bytes that the minifier mostly
  absorbs).
- `npx firebase deploy --only firestore:indexes` —
  deployed. One orphaned index (the previous declaration
  without `userId`) remains in the project; harmless,
  removable with `--force` whenever convenient.
- `npx firebase deploy --only hosting` — released.
  Hosting URL: <https://kanban-head.web.app>.

### Sanitization sweep

- No new emails / project IDs / personal references in
  source.

### Known issues / deferred

- **Orphaned index in production.** The previous
  declaration of the third composite index (without
  `userId`) is still attached to the Firestore project.
  Not used by any query; leaves no behavioral footprint.
  Remove with `npx firebase deploy --only
  firestore:indexes --force` when convenient.
- **Earlier deferred items unrelated to the review carry
  over unchanged** (bundle-size code-splitting, mid-drag
  snapshot lock semantics, cross-column drop position,
  email-on-invite). These were not part of the review
  scope.

### v1.0 release

This session closes the last review-finding work item.
Every CF (CF-1 through CF-3, completed in Session 24) and
every MF (MF-1 / MF-5 / MF-6 / MF-9 in Session 24, MF-2 /
MF-3 / MF-4 / MF-7 / MF-8 / MF-10 here) is now resolved.
The codebase is at v1.0.

### Suggested commit message

```
chore: clear remaining review findings — v1.0 release

Six items from docs/review.md, completing the v1.0
remediation pass started in Session 24:

MF-4: Remove dead re-seed useEffect in CardForm. Form
state is reseeded by the wrapping modals' unmount /
remount lifecycle (CardDialog uses key={openCardId};
AddCardModal is conditionally rendered), so the effect
never ran in practice. Header docstring documents the
reset story.

MF-7: Stable link keys.
- CardDialog read-view: key={`${l.url}-${i}`} for the
  display-only list.
- CardForm: links state migrated from CardLink[] to an
  internal LinkRow[] with stable per-row ids generated by
  a module-level genLinkId() (crypto.randomUUID with a
  counter + timestamp fallback). Edit / remove handlers
  match by id; the cleanLinks submit filter still emits
  bare CardLink objects, so the public shape is
  unchanged.

MF-8: firestore.indexes.json — added userId as the leading
field on the third composite index (userId + projectId +
columnId + customOrder). Forward-looking index; no query
uses it today. Deployed.

MF-2: collectGroupNames extracted to a new
src/lib/projectUtils.ts. NewProjectModal and
EditProjectModal import from there; the duplicate copies
are gone.

MF-3: Date helpers extracted to a new
src/lib/dateUtils.ts. parseISODate, startOfToday(now?),
formatDate (year-omitted-for-current-year), and
formatDateLong (always-year). Card / ArchiveDrawer /
CardDialog / cardStats all import from the shared module;
the four local copies are gone. CardDialog's read view
now calls formatDateLong to preserve its always-year
output.

MF-10: ToastProvider — outstanding setTimeout handles are
tracked in a useRef Set and cleared on unmount. Each
fired timeout removes its own handle so the set does not
grow unbounded. No-op under the current always-mounted
provider; correct under any future test or code-split
path that mounts and unmounts the provider.

Every CF and MF from docs/review.md is now resolved
(CF-1 through CF-3 + MF-1 / MF-5 / MF-6 / MF-9 in Session
24; MF-2 / MF-3 / MF-4 / MF-7 / MF-8 / MF-10 in this
session). Codebase is at v1.0.

Deployed: firestore:indexes + hosting.
Hosting URL: https://kanban-head.web.app.
```

---

## Session 24 — Code-review remediation (2026-04-25)

Seven items from `docs/review.md`, in the order the brief
specified. Two were already fixed in flight (the "stub"
wording in `App.tsx` and the `text-slate-*` in
`EmptyDashboard`); both are noted below as no-op
verifications.

**Hosting deployed.**
- Hosting: <https://kanban-head.web.app>

Not committed; owner verifies first.

### CF-1 — `countActiveCardsForProject` rules-safe filter + App wiring

[firestore.ts](../src/lib/firestore.ts):
- Signature is now `countActiveCardsForProject(userId,
  projectId)`. Query is
  `where('userId', '==', userId) AND where('projectId', '==',
  projectId)`. The `userId` filter satisfies the rules
  evaluator's static-proof requirement against
  `isCardCreator()` (same class of fix Session 3 applied to
  `useCards` and Session 15 applied to the dual-query
  pattern).
- JSDoc rewritten to spell out (a) why the filter is
  required, (b) the trade-off — the helper now counts only
  cards authored by the passed-in user, which for the
  EditProjectModal's owner-only path is "owner-authored
  cards on this project".

[App.tsx](../src/App.tsx):
- Replaced the synchronous `useMemo` for
  `editingProjectActiveCardCount` with a `useState +
  useEffect` pair. For the active project the count still
  reads off the live `cards` array (no extra round trip);
  for any other project the effect fires
  `countActiveCardsForProject(editingProject.userId,
  editingProject.id)` and sets state on resolve. A
  `cancelled` flag guards against state writes after the
  user closes the dialog mid-flight. The previous
  "non-active project always shows 0" behavior is gone —
  the EditProjectModal's delete blocker now reflects real
  data for any project the owner edits.

### CF-2 — `archiveCardsInColumn` rules-safe filter + TODO

[firestore.ts](../src/lib/firestore.ts):
- Signature is now `archiveCardsInColumn(userId, projectId,
  columnId)`. Query gains the leading
  `where('userId', '==', userId)` clause, mirroring CF-1.
- JSDoc gains a `TODO: not yet called — wire up before use`
  notice. No UI surface invokes the helper today; this
  pinned reminder will catch the wiring step (and prompt
  the integrator to confirm the right `userId` is being
  passed for the chosen flow).

### CF-3 — `javascript:` URL injection guard

[importParser.ts](../src/lib/importParser.ts):
- New module-level `ALLOWED_LINK_SCHEMES = /^https?:\/\//i`
  exported alongside `parseImport`. The schema docstring
  spells out the threat (the renderer uses
  `<a href={url}>`, and `rel="noreferrer"` does not block
  `javascript:` execution).
- The link validator now tests `url.trim()` against the
  allow-list immediately after the non-empty check. A
  failing URL pushes a `Card #N · links[j].url · URL must
  start with http:// or https://` error and skips the row
  (consistent with the parser's all-or-nothing semantics —
  any error blocks the whole import).

[CardForm.tsx](../src/components/modals/CardForm.tsx):
- Imports the same `ALLOWED_LINK_SCHEMES` regex from
  `importParser` so both write paths stay in lockstep.
- `handleSubmit`'s `cleanLinks` filter now also requires
  the URL to match the allow-list before the row is
  forwarded to `onSubmit`. Comment notes that the native
  `<input type="url">` validation is bypassable when the
  field value is set programmatically, which is why a
  defensive filter is required even though the input
  declares `type="url"`.

### MF-1 — SettingsPopover dark-mode token migration

[SettingsPopover.tsx](../src/components/settings/SettingsPopover.tsx)
— hardcoded light-mode classes replaced per the brief:
- Panel: `bg-white border-slate-200` →
  `bg-[var(--kb-card-bg)] border-[var(--kb-card-border)]`.
- Item idle/hover: `text-slate-700 hover:bg-slate-100` →
  `text-[var(--kb-text-secondary)]
  hover:bg-[var(--kb-board-bg)]`.
- Item disabled: `text-slate-400` →
  `text-[var(--kb-text-muted)]`.
- Item danger ("Sign out"): kept `text-red-600` and
  `hover:bg-red-50`, plus added `dark:hover:bg-red-950/40`
  so the destructive hover stays visible in dark mode.
- "Color theme" sub-label: `text-slate-400` →
  `text-[var(--kb-text-muted)]`.
- Theme swatch borders: `border-slate-200 /
  hover:border-slate-400 / border-slate-700 +
  ring-slate-700` →
  `border-[var(--kb-card-border)] /
  hover:border-[var(--kb-text-muted)] /
  border-[var(--kb-text-primary)] +
  ring-[var(--kb-text-primary)]`. The active-swatch
  indicator stays high-contrast in both modes.
- Divider: `bg-slate-200` → `bg-[var(--kb-card-border)]`.

### MF-5 — Stale comments

- [App.tsx](../src/App.tsx) header point 4: the "stub"
  wording was already gone before this session; expanded
  the bullet to describe the actual theming flow
  (localStorage keys, `applyTheme` writing CSS variables on
  `:root`, components reading via `var(--kb-*)`).
- [firebase.ts](../src/lib/firebase.ts) `googleProvider`
  JSDoc rewritten. The previous wording already correctly
  said `signInWithPopup`, but the new text is more
  assertive about *why* — including the COOP fragility of
  redirect and the explicit `Cross-Origin-Opener-Policy:
  same-origin-allow-popups` header that pairs with
  popup auth. This pre-empts the next contributor flipping
  back to redirect.
- [firestore.ts](../src/lib/firestore.ts) `updateCard`
  docstring: "future drag-and-drop handlers" → "the
  drag-and-drop handlers in `Board` (to update `columnId`
  after a cross-column drop)".

### MF-6 — EmptyDashboard verified

[App.tsx](../src/App.tsx) `EmptyDashboard` already uses
`text-[var(--kb-text-primary)]`,
`text-[var(--kb-text-muted)]`, and
`hover:text-[var(--kb-text-secondary)]`. `grep` for
`text-slate-(800|500|400)` in App.tsx returns no matches.
The Session 11 dark-mode migration covered this surface
already; the review's MF-6 finding was based on an earlier
state. No change.

### MF-9 — LICENSE + README

- New file [LICENSE](../LICENSE) — standard MIT text,
  `Copyright (c) 2026 Kanban Firebase Contributors`. No
  individual name; the placeholder treats the repo as a
  collective.
- [README.md](../README.md) license section: the "if
  present, otherwise treat the repository as All Rights
  Reserved" hedge is gone. The line now reads
  `MIT — see [LICENSE](LICENSE).` matter-of-factly.

### Build status

- `npx tsc -b` — clean.
- `npm run build` — clean (`tsc -b && vite build`). Main
  bundle ~790 KB pre-gzip / ~209 KB gzipped (within noise
  of Session 23; the only behavioral additions are a
  filter regex import and a useEffect, which the minifier
  largely absorbs).
- `npx firebase deploy --only hosting` — released.
  Hosting URL: <https://kanban-head.web.app>.

### Sanitization sweep

- No new emails / project IDs / personal references in
  source. The LICENSE file's copyright placeholder is
  `Kanban Firebase Contributors` (collective, not a
  person).

### Known issues / deferred

- **Other review items still open.** This session
  intentionally addressed only the seven items the brief
  named. The remaining MFs from the review are deferred:
  - MF-2: `collectGroupNames` duplication across
    NewProject / EditProject modals.
  - MF-3: `parseISODate` / `formatDate` duplication
    between Card / CardDialog (and a third copy in
    cardStats).
  - MF-4: `CardForm` re-seed `useEffect` is dead under the
    current `key`-prop remount strategy.
  - MF-7: Link-list `key={i}` index keys.
  - MF-8: `firestore.indexes.json` third index lacks
    `userId` (forward-looking — not currently used by any
    runtime query).
  - MF-10: Toast `setTimeout` handles never cleared on
    unmount.
- **`countActiveCardsForProject` undercounts on shared
  projects** when members have authored cards. The helper
  filters by `userId == ownerUid` for the rules-safe
  query, so a member-authored card on the owner's project
  is not counted in the EditProjectModal's delete
  blocker. Acceptable trade-off — the dialog is owner-only
  and the worst case is a delete attempt that the owner
  can simply walk back. Switching the helper to a
  two-query owner-OR-member pattern (mirroring `useCards`)
  would close this; deferred as the brief asked for the
  single-filter fix.
- **`archiveCardsInColumn` is not yet wired.** The TODO
  pinned in the JSDoc this session is the only sentinel.
  No UI surface calls it; the integrator who eventually
  adds an "Archive all in column" action will need to
  thread `userId` through the call site.

### Suggested commit message

```
fix: address code-review findings (CF-1, CF-2, CF-3, MF-1, MF-5, MF-9)

CF-1: countActiveCardsForProject(projectId) ->
countActiveCardsForProject(userId, projectId). Adds a
where('userId', '==', userId) clause so the rules
evaluator can statically prove every result satisfies
isCardCreator(). App.tsx swaps its useMemo for a useState
+ useEffect pair: active-project count still reads off the
live cards array, non-active projects fetch via the helper
with editingProject.userId. The "non-active editing dialog
always shows 0" deferred bug is now fixed.

CF-2: archiveCardsInColumn(projectId, columnId) ->
archiveCardsInColumn(userId, projectId, columnId). Same
class of fix. Function is not yet wired to any UI; pinned
a TODO in the JSDoc to catch the wiring step.

CF-3: javascript: URL injection. importParser.ts exports a
new ALLOWED_LINK_SCHEMES = /^https?:\/\//i regex; the link
validator rejects any URL that does not match. CardForm's
handleSubmit imports the same regex and adds it to the
cleanLinks filter — both write paths now enforce the
allow-list. Comment in CardForm notes that the native
input[type=url] validation is bypassable
programmatically.

MF-1: SettingsPopover dark-mode migration. Replaced
bg-white / border-slate-200 / text-slate-* / bg-slate-*
with the matching --kb-* tokens. Active swatch indicator
uses --kb-text-primary so it stays high-contrast in both
light and dark modes.

MF-5: Stale comments. App.tsx header point 4 expanded to
describe the actual theming flow. firebase.ts
googleProvider JSDoc rewritten to assert popup-not-redirect
with the COOP rationale. firestore.ts updateCard JSDoc
no longer says "future drag-and-drop".

MF-9: New MIT LICENSE file (Copyright 2026 Kanban Firebase
Contributors — no individual name). README license section
no longer hedges with "if present".

Verified no-ops:
- App.tsx "stub" wording was already removed before this
  session.
- EmptyDashboard already uses --kb-text-* tokens; no
  text-slate-* left in App.tsx.

Deployed: hosting.
Hosting URL: https://kanban-head.web.app.
```

---

## Session 23 — Favicon + app icon metadata (2026-04-25)

A real favicon for the app — purple rounded square + white
"K" matching the existing sidebar logo. Adds the SVG icon,
the iOS home-screen `apple-touch-icon`, the browser
chrome `theme-color`, and the iOS / Windows app-name
metas. Sidebar wordmark already matched the new icon
style — no change there.

**Hosting deployed.**
- Hosting: <https://kanban-head.web.app>

Not committed; owner verifies first.

### What changed

[public/favicon.svg](../public/favicon.svg) — new file. 32×32
viewBox SVG: `#7C3AED` (Tailwind violet-600, identical to
the sidebar logo's `bg-violet-600`) rounded square with a
centered white "K" at 20px / 700 weight using the system
font stack. Lives in `public/` so Vite copies it
unprocessed into `dist/` at build time (verified —
`dist/favicon.svg` present after `npm run build`).

[index.html](../index.html) — five new tags inside `<head>`,
all of them above `<title>` so the icon resolves before the
document title:
- `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`
  — primary browser favicon. Modern browsers all support SVG
  icons; older Safari falls back to the apple-touch-icon
  (which we set to the same SVG below — Safari renders SVG
  apple-touch-icons fine on every supported version).
- `<link rel="apple-touch-icon" href="/favicon.svg" />` — used
  when the user adds the app to their iOS / iPadOS home screen.
- `<meta name="theme-color" content="#7C3AED" />` — colors the
  browser chrome on supported mobile browsers (Chrome on
  Android, Safari on iOS 15+).
- `<meta name="apple-mobile-web-app-title" content="Kanban" />`
  — title used when added to an iOS home screen.
- `<meta name="application-name" content="Kanban" />` —
  Windows / IE-era equivalent of the apple-mobile-web-app-title.

[Sidebar.tsx](../src/components/sidebar/Sidebar.tsx) —
unchanged. The wordmark at lines 137-146 already renders a
`bg-violet-600 rounded-md` 32px square with a white "K", and
the "Kanban" text is hidden via `!collapsed && (...)` when
the sidebar is in icon-only rail mode. Visual style matches
the new favicon; no edits needed.

### Build status

- `npm run build` — clean. `tsc -b` clean (no source
  changes); `vite build` copied `public/favicon.svg` into
  `dist/favicon.svg` and emitted the index.html with the
  five new tags. Bundle JS / CSS sizes unchanged — only
  the static asset surface grew.
- `npx firebase deploy --only hosting` — released.
  Hosting URL: <https://kanban-head.web.app>.

### Sanitization sweep

- No new emails / project IDs / personal references in
  source. The favicon SVG carries only the literal "K"
  glyph and the violet-600 hex.

### Known issues / deferred

- **No PNG fallback / favicon.ico.** Modern browsers
  (Chrome, Edge, Firefox, Safari) all support SVG favicons,
  and we do not target IE. If a PNG fallback ever becomes
  necessary, generating a 32×32 and a 180×180 PNG from the
  same SVG and pointing the apple-touch-icon at the larger
  PNG is the standard path.
- **No web manifest.** A `manifest.webmanifest` would let
  Chrome treat the site as an installable PWA with
  proper icons, splash screens, and the
  `apple-mobile-web-app-title` rolled into a single file.
  Skipped — adding a manifest expands the install surface
  beyond what this session's brief scoped, and the meta
  tags above already cover the iOS home-screen path.
- All earlier deferred items carry over unchanged.

### Suggested commit message

```
feat: real favicon + app icon metadata

- public/favicon.svg: 32x32 SVG of a violet-600
  (#7C3AED) rounded square with a white "K" at 20px /
  700 weight, system font stack. Mirrors the sidebar
  wordmark's existing logo block.
- index.html: <link rel="icon" type="image/svg+xml" ... />,
  <link rel="apple-touch-icon" ... />, theme-color,
  apple-mobile-web-app-title, application-name. Five new
  tags above <title>.

Sidebar.tsx unchanged — its wordmark at lines 137-146 was
already a bg-violet-600 rounded-md square with a white "K"
and a "Kanban" text label that hides when the sidebar
collapses. The favicon was designed to match it.

Vite copies public/ unprocessed into dist/, so no bundler
configuration change. dist/favicon.svg verified after
npm run build.

Deployed: hosting.
Hosting URL: https://kanban-head.web.app.
```

---

## Session 22 — Delete from full card dialog (2026-04-25)

A Delete affordance for the full card dialog's read-mode
footer. Two-step confirm: first click flips the button into
a solid-red "Confirm delete?" with a sibling Cancel; second
click runs `deleteCard` and dismisses the dialog. Hidden
entirely for users who lack delete permission (the
Firestore rule allows creator + project owner only).

**Hosting deployed.**
- Hosting: <https://kanban-head.web.app>

Not committed; owner verifies first.

### What changed

[firestore.ts](../src/lib/firestore.ts) — unchanged.
`deleteCard(cardId)` was added in Session 21 for the archive
drawer; this session reuses it.

[CardDialog.tsx](../src/components/board/CardDialog.tsx):
- New required prop `currentUid: string`. Used to compute
  `canDelete = card.userId === currentUid || project.userId
  === currentUid` — the same condition the Firestore rule
  enforces server-side
  ([firestore.rules:168](../firestore.rules#L168)).
- New state: `deleteConfirming: boolean` (default false) and
  `deleting: boolean` (in-flight indicator). The
  `deleteConfirming` reset on dialog open is handled by the
  existing `key={openCardId}` remount in App.tsx — no extra
  effect required.
- `useToast` import + use, so a permission denial or other
  Firestore error surfaces as a toast (matches the archive
  drawer's pattern).
- Read-mode footer extended. Button group sits in a wrapper
  span with `mr-auto` so the existing right-aligned Modal
  footer (`flex justify-end gap-2`) pushes it to the far
  left:
    [Delete] [Cancel*] ... [Close] [Edit]
  Cancel only renders while `deleteConfirming` is true.
  The Delete button:
    - Default: `text-red-500 hover:bg-red-50
      dark:hover:bg-red-950/40` ghost.
    - Confirming: `bg-red-600 text-white hover:bg-red-700`
      solid.
    - In-flight: label flips to "Deleting…", both buttons
      disabled.
- Edit-mode footer unchanged — Save / Cancel only.

[App.tsx](../src/App.tsx):
- Passes `currentUid={user.uid}` into `<CardDialog>`. The
  signed-in user is already required to render the dialog
  branch, so the access is unconditional.

### Build status

- `npx tsc -b` — clean.
- `npm run build` — clean (`tsc -b && vite build`). Main
  bundle ~789 KB pre-gzip / ~209 KB gzipped (~1 KB heavier
  than Session 21 — the new state machine and the gated
  cluster).
- `npx firebase deploy --only hosting` — released.
  Hosting URL: <https://kanban-head.web.app>.

### Sanitization sweep

- No new emails / project IDs / personal references in
  source.

### Known issues / deferred

- **Outside-click does not reset confirm.** Unlike the
  archive drawer's per-row delete (which resets when the
  user clicks anywhere outside the row), the dialog's
  Delete confirm only resets via the explicit Cancel
  button. Acceptable in a focused modal — there is no
  "outside" in the same sense — but a stray first click
  leaves the button armed until the user dismisses or
  cancels. Match the drawer's behaviour later if feedback
  warrants.
- **No undo after delete.** The card is gone from
  Firestore the moment the second click resolves. The
  archive flow remains the right path for "I might need
  this back"; Delete is for "this card never should have
  existed" or "we are done with the archive". This is
  consistent with the archive drawer's Delete and matches
  the Firestore rule (no soft-delete on hard-delete).
- All earlier deferred items carry over unchanged.

### Suggested commit message

```
feat(card-dialog): two-step Delete in read-mode footer

Read-mode footer gains a Delete cluster on the far left:

  [Delete] [Cancel*] ... [Close] [Edit]

First click flips Delete to solid-red "Confirm delete?" and
mounts a sibling Cancel. Second click on the armed button
runs deleteCard(card.id), dismisses the dialog, and the
cards snapshot drops the row.

Visibility matches the Firestore delete rule
(isCardCreator() || isProjectOwnerOnCard()): the cluster
renders only when card.userId === currentUid OR
project.userId === currentUid. Members who did not author
the card see no delete affordance.

CardDialog gains a `currentUid: string` prop; App.tsx
passes user.uid. The deleteConfirming reset on dialog open
piggybacks on the existing `key={openCardId}` remount in
App.tsx — no extra effect needed.

Errors reset both confirm + in-flight state and surface via
useToast. Edit-mode footer is unchanged.

deleteCard already existed in firestore.ts (added in
Session 21 for the archive drawer); no data-layer change
this session.

Deployed: hosting.
Hosting URL: https://kanban-head.web.app.
```

---

## Session 21 — Archive drawer (2026-04-25)

A slide-in panel from the right of the board that lists every
archived card on the active project, grouped by the column the
card was archived from. Each row offers Restore (un-archive,
return to original column) and Delete (permanent — first click
arms, second click confirms). Two entry points:

- A muted "View archived cards" link pinned to the bottom of the
  board.
- A "View archived" item in the settings popover (under Import
  cards), available whenever there is an active project.

**Indexes + hosting deployed.**
- Hosting: <https://kanban-head.web.app>
- Firestore indexes: deployed (two new composite indexes on
  `cards`).

Not committed; owner verifies first.

### What changed

**Data layer**
[firestore.ts](../src/lib/firestore.ts):
- New `restoreCard(cardId, columnId)` — sets `archived = false`,
  clears `archivedAt`, writes `columnId` (so a future "restore
  to specific column" UI can pass any valid column id; the
  drawer passes the card's original columnId), bumps
  `updatedAt`.
- New `deleteCard(cardId)` — single `deleteDoc` call. Used only
  from the archive drawer; active cards continue to go through
  `archiveCard`.
- `archiveCard` docstring updated — no longer says "future
  archive browser feature", since this session built it.

**Hook**
[useArchivedCards.ts](../src/hooks/useArchivedCards.ts) — new
file. Mirrors the rules-evaluator-safe two-query pattern
`useCards` uses (Session 15), with the additional `archived ==
true` filter:
- Q1: `projectId == X AND projectOwnerId == uid AND archived ==
  true`
- Q2: `projectId == X AND memberEmails array-contains email AND
  archived == true`
- Two `useEffect` subscriptions, two loaded flags, merged via
  `mergeById`. Same shape and module comments as `useCards`.

**Indexes**
[firestore.indexes.json](../firestore.indexes.json) — two new
composite indexes on `cards`:
- `projectId ASC + projectOwnerId ASC + archived ASC`
- `projectId ASC + memberEmails ARRAY_CONTAINS + archived ASC`

The pre-existing two-field index for active-card queries
(`projectId + projectOwnerId`, `projectId + memberEmails`) stays
in place; Firestore does not auto-substitute longer composite
indexes for queries that need the exact field set.

**Drawer component**
[ArchiveDrawer.tsx](../src/components/board/ArchiveDrawer.tsx) —
new file. ~360 lines, fully commented for a public audience.
Notable design points:
- The drawer DOM is always mounted; the panel transforms
  between `translate-x-full` (closed) and `translate-x-0`
  (open) so the slide-in animates in both directions. The
  backdrop fades opacity in/out with `pointer-events-none`
  while closed.
- Body scroll-lock while open (matches existing modal
  behaviour). Restored on close.
- Escape closes; backdrop click closes.
- Cards bucket by their `columnId`; bucket order matches the
  project's `columnOrder`. Cards whose original column has been
  deleted from the project surface under a single "Unknown
  column" group at the end.
- Within a bucket, sort is `archivedAt DESC` (most recent
  first). Locally-pending writes whose `archivedAt` has not yet
  round-tripped from the server sort to the very top of their
  bucket — by definition the freshest.
- Each row holds a small state machine: `idle | restoring |
  confirm-delete | deleting`. The `confirm-delete` state attaches
  a document-level `pointerdown` listener that resets to `idle`
  on any click outside the row (with a 0-tick deferral so the
  click that armed the confirm does not immediately reset it).
- Toast on permission errors (relevant for Delete: rules limit
  hard-delete to creator + owner).
- All chrome uses `--kb-*` tokens so the drawer follows the
  active theme.

**Entry points**
[Board.tsx](../src/components/board/Board.tsx):
- New required prop `onOpenArchive: () => void`.
- "View archived cards" link rendered below the column scroll
  region in a thin border-topped strip, using
  `text-[var(--kb-text-muted)]` for the muted-link styling.
- The columns scroll container gains `min-h-0` so the new
  bottom strip cannot be pushed off the viewport when columns
  contain a lot of content (the existing `flex-1` was sufficient
  while there was nothing below it).

[SettingsPopover.tsx](../src/components/settings/SettingsPopover.tsx):
- New required prop `onOpenArchive: () => void`.
- "View archived" `<Item>` rendered below "Import cards", gated
  on `hasActiveProject` so it disappears when no project is
  selected (the drawer needs a project to scope its query).

**Top-level wiring**
[App.tsx](../src/App.tsx):
- New state: `archiveDrawerOpen` (boolean — the drawer scopes
  to the active project, so re-opening with a different active
  project simply rebinds the drawer's subscription).
- Passes `onOpenArchive={() => setArchiveDrawerOpen(true)}` to
  Board and to SettingsPopover.
- Mounts `<ArchiveDrawer>` after `<CardDialog>`. The drawer
  takes `project={activeProject}` plus `uid` / `userEmail` so
  it can drive the dual-query subscription internally.

### Build status

- `npx tsc -b` — clean.
- `npm run build` — clean (`tsc -b && vite build`). Main bundle
  ~788 KB pre-gzip / ~209 KB gzipped (~9 KB heavier than
  Session 20: a new hook + a new drawer component with its
  own state machine).
- `npx firebase deploy --only firestore:indexes` — deployed.
- `npx firebase deploy --only hosting` — released.
  Hosting URL: <https://kanban-head.web.app>.

### Sanitization sweep

- No new emails / project IDs / personal references in source.

### Known issues / deferred

- **Restoring to a deleted column.** The drawer surfaces such
  cards under "Unknown column" and the Restore button still
  works (it writes `columnId = card.columnId`, which references
  a column that no longer exists). The card would un-archive
  but never appear on the board because the board only renders
  columns in `project.columnOrder`. Two reasonable next steps:
  block restore for orphaned cards, or restore them into the
  first column with a small "moved to first column" toast.
  Deferred — for now the row is silent about the post-restore
  fate, which is acceptable because deleting a column with
  active cards is already blocked by the UI (Manage Columns)
  and only ever happens before cards land in that column or
  via direct Firestore manipulation.
- **Delete confirm reset on outside click.** The
  `confirm-delete` state resets when the user clicks anywhere
  outside the row. It does NOT reset on a brief timeout, so a
  user who arms the confirm and walks away leaves the button
  in its red "Confirm delete" state. Acceptable — the
  destructive action requires a deliberate second click; auto-
  reset on a timer would just create a different surprise.
- **No bulk operations.** Restore-all / delete-all-archived
  are not exposed. A future addition; for now the per-row
  flow keeps each destructive action explicit.
- **Index build time.** The two new composite indexes on
  `cards` will take a moment to build for projects that
  already have many archived documents. The drawer surfaces
  the eventual error (`Failed-precondition: query requires an
  index`) in its inline error banner if the user opens the
  drawer before the build completes; once built, no further
  action needed.
- All earlier deferred items carry over unchanged.

### Suggested commit message

```
feat: archive drawer

A slide-in panel from the right of the board listing every
archived card on the active project, grouped by the card's
original column. Per row: Restore (un-archive, return to
original column) and Delete (permanent — two-click confirm).
Two entry points: a muted "View archived cards" link at the
bottom of the board, and "View archived" in the settings
popover under Import cards.

Data layer
- New restoreCard(cardId, columnId): sets archived=false,
  clears archivedAt, writes columnId, bumps updatedAt.
- New deleteCard(cardId): single deleteDoc. Only used from
  the drawer; active cards continue to go through archiveCard.

Hook
- New useArchivedCards(uid, userEmail, projectId) — same
  rules-safe two-query shape useCards uses (Session 15), plus
  the `archived == true` filter:
    Q1: projectId == X AND projectOwnerId == uid AND archived
    Q2: projectId == X AND memberEmails contains email AND archived
  Merged client-side, deduped by id.

Indexes
- cards: projectId ASC + projectOwnerId ASC + archived ASC
- cards: projectId ASC + memberEmails ARRAY_CONTAINS + archived ASC

Component
- ArchiveDrawer.tsx — fixed 360px right-side panel. Slides via
  translate-x; backdrop fades opacity. Escape + backdrop-click
  close. Body scroll lock. Cards grouped by original column
  (project.columnOrder), sorted archivedAt DESC within group.
  Per-row state machine: idle / restoring / confirm-delete /
  deleting. Confirm-delete arms a document-level pointerdown
  listener that resets to idle on outside click. Theme tokens
  throughout.

Entry points
- Board: new onOpenArchive prop; muted "View archived cards"
  link rendered below the columns scroll region.
- SettingsPopover: new onOpenArchive prop; "View archived"
  item under Import cards, gated on hasActiveProject.
- App: archiveDrawerOpen state; mounts ArchiveDrawer after
  CardDialog.

Permissions: Firestore rules unchanged. Restore goes through
update (creator / owner / member); delete goes through delete
(creator / owner). Both already covered by Session 14 rules.

Deployed: firestore:indexes + hosting.
Hosting URL: https://kanban-head.web.app.
```

---

## Session 20 — Remove inline expand from Card (2026-04-25)

Single-file simplification in
[Card.tsx](../src/components/board/Card.tsx). The `···`
expand toggle, the expanded-section render, the "View full
card →" link, and all `expanded` state are gone. The card
is now a static preview surface — title, priority, 2-line
description clamp, up-to-4 tag pills + "+N more", due date,
action row. The dialog (reached via the "Open card" icon
introduced in Session 17) is the only path to full
details.

**Hosting deployed.**
- Hosting: <https://kanban-head.web.app>

Not committed; owner verifies first.

### What changed

[Card.tsx](../src/components/board/Card.tsx):
- Removed `expanded` / `setExpanded` state and the
  `useState` call that backed it. (The `useState` import
  is still needed for `confirmArchive` / `archiving`.)
- Removed every `!expanded &&` wrapper around the
  description clamp, tag preview, and due-date line —
  these now render unconditionally whenever their
  underlying data is present. No behavior change for the
  default view.
- Removed the entire `{expanded && (...)}` block beneath
  the action row (the unclamped description, the full tag
  list, the duplicate due-date line, the links list, and
  the "View full card →" button).
- Removed the `···` `IconButton` from the action row, plus
  the now-unused `DotsIcon` SVG component. The action row
  now contains just the "Open card" icon and (last column
  only) the archive icon.
- Header docstring rewritten to describe the new two-state
  model (default + archive-confirm) and to drop every
  reference to inline expand.
- `TagPill`'s "appears in two places" comment dropped — it
  appears in one place now.

No other file touched. The full-dialog path
([CardDialog.tsx](../src/components/board/CardDialog.tsx))
is unchanged and still surfaces every field the inline
expand used to show, plus notes.

### Build status

- `npx tsc -b` — clean.
- `npm run build` — clean (`tsc -b && vite build`). Main
  bundle ~779 KB pre-gzip / ~207 KB gzipped — about 1 KB
  lighter than Session 19 thanks to the removed expand
  branch and `DotsIcon` SVG.
- `npx firebase deploy --only hosting` — released.
  Hosting URL: <https://kanban-head.web.app>.

### Sanitization sweep

- No new emails / project IDs / personal references in
  source.

### Known issues / deferred

- None new. The "Open card" icon is now load-bearing for
  *every* path to full details; the Session 17 note about
  its discoverability becomes more relevant. If users
  routinely miss it, a hover affordance on the card body
  (pointer cursor, subtle tooltip, focus ring) could help —
  not implemented this session.
- All earlier deferred items carry over unchanged.

### Suggested commit message

```
feat(card): remove inline expand; dialog is the only path to full details

The card is now a static preview surface. Removed:
- `expanded` state and the `···` IconButton that toggled
  it.
- The expanded-section render (unclamped description, full
  tag list, duplicate due-date line, links list, "View
  full card →" link).
- The DotsIcon SVG component (no longer referenced).

Kept:
- Title (plain div, drag handle).
- Priority badge.
- 2-line description clamp.
- Up to 4 tag pills + "+N more".
- Due date (red if overdue).
- Action row: Open-card icon + (last column only) archive
  icon, with the archive-confirm replacement unchanged.

Behaviour change is purely additive removal — every field
formerly visible only when expanded is now reachable
exclusively via the CardDialog (opened by the Open-card
icon introduced in Session 17). Notes were dialog-only
already.

No other file touched. Drag setup, dnd-kit registrations,
archive flow, and CardDialog content are unchanged.

Deployed: hosting.
Hosting URL: https://kanban-head.web.app.
```

---

## Session 19 — Hide "New project" from member-only users (2026-04-24)

Two items in the brief.

**Item 1 — gate "New project" on owner status.** Members
who only see shared boards no longer see the "New project"
entry in the settings popover. A brand-new signed-in user
with zero projects still sees it so they can create their
first board.

**Item 2 — verify "Manage columns" gate.** Already
correctly hidden behind `isActiveProjectOwner` since
Session 12
([SettingsPopover.tsx:126](../src/components/settings/SettingsPopover.tsx#L126)).
No change.

**Hosting deployed.**
- Hosting: <https://kanban-head.web.app>

Not committed; owner verifies first.

### What changed

[SettingsPopover.tsx](../src/components/settings/SettingsPopover.tsx):
- New required prop `canCreateProject: boolean`. Resolved
  by the parent so the popover stays presentational.
- The "New project" `<Item>` is wrapped in
  `{canCreateProject && (...)}`. Hidden rather than disabled
  because there is no useful tooltip — the action simply
  does not apply for members.
- Header docstring already listed the spec items in order;
  no comment changes besides the new prop's JSDoc.
- "Manage columns" gate (`isActiveProjectOwner` from Session
  12) confirmed correct, unchanged.

[App.tsx](../src/App.tsx):
- New derivation alongside `isActiveOwner`:
  ```ts
  const hasAnyOwnedProject = projects.some((p) => p.isOwner === true)
  const canCreateProject = hasAnyOwnedProject || projects.length === 0
  ```
  The `projects.length === 0` clause is the brand-new-user
  escape hatch — without it, a fresh account whose
  `useProjects` snapshot has not yet returned a single doc
  would have no path to create their first board. The
  invite-link flow that follows would still let them be
  added to someone else's board, but creating their own
  needs to remain available.
- Passes `canCreateProject` to the existing
  `<SettingsPopover>` render alongside `isActiveProjectOwner`.

No other file touched.

### Build status

- `npx tsc -b` — clean.
- `npm run build` — clean (`tsc -b && vite build`). Main
  bundle ~780 KB pre-gzip / ~207 KB gzipped (essentially
  unchanged).
- `npx firebase deploy --only hosting` — released.
  Hosting URL: <https://kanban-head.web.app>.

### Sanitization sweep

- No new emails / project IDs / personal references in
  source.

### Known issues / deferred

- **A member could still self-bootstrap into ownership** by
  manually visiting the app *before* `useProjects` returns
  any data — for one render frame, `projects.length === 0`
  and `canCreateProject` is true. In practice the auth
  bootstrap and the projects subscription resolve very
  close together, and the user would need to click "New
  project" within that window. Not a security issue
  (Firestore rules still gate every write on auth uid),
  just a momentary UI affordance. Could be tightened by
  adding a `projectsLoading` flag from `useProjects` and
  hiding the button while loading; deferred as low-impact.
- All earlier deferred items carry over unchanged.

### Suggested commit message

```
feat(settings): hide "New project" from member-only users

The settings popover's "New project" item is now hidden
for accounts that exist only as members on shared boards.
A signed-in user with zero projects still sees it so they
can create their first board.

App.tsx computes:
  hasAnyOwnedProject = projects.some(p => p.isOwner === true)
  canCreateProject   = hasAnyOwnedProject || projects.length === 0

and passes canCreateProject to SettingsPopover.

SettingsPopover wraps the New-project Item in
`{canCreateProject && (...)}`. Hidden, not disabled —
there's no useful tooltip for "you can't create projects
because you only have shared ones."

Manage-columns gate (isActiveProjectOwner) confirmed
correct, unchanged since Session 12.

Deployed: hosting.
Hosting URL: https://kanban-head.web.app.
```

---

## Session 18 — Invite permission fix; SignInScreen verified (2026-04-24)

Two items in the brief.

**Item 1 — invite permission error.** The Share dialog's
"Missing or insufficient permissions" was *not* a project-rule
problem. The project update rule already has the correct
short-circuit form `isOwner() || (isMember() &&
memberPatchPreservesOwnership())` from Session 12 — owners
can change any field, members are restricted. That rule
deployed cleanly and is unchanged this session.

The actual cause is one layer deeper: `inviteMember`'s
fan-out helper `updateCardMemberEmails` was issuing a
single-filter list query
(`where('projectId', '==', X)`) over the cards collection
to enumerate cards whose `memberEmails` it needed to
rewrite. The cards rule allows read if ANY of three
predicates holds (creator / owner / member by email), and a
single `projectId` filter does not narrow the result set to
any of them — so the rules evaluator rejects the entire
list query, which surfaces as "Missing or insufficient
permissions" on the inviteMember promise. The project
update itself succeeded; the fan-out's pre-write list query
did not. Same class of bug Session 15 fixed for `useCards`.

**Fix.** [firestore.ts](../src/lib/firestore.ts):
`updateCardMemberEmails` now takes an explicit `ownerUid`
argument and adds `where('projectOwnerId', '==', ownerUid)`
to its list query. With both filters present, every result
is statically provable against `isProjectOwnerOnCard()` and
the rules evaluator accepts the query. The composite index
needed for the query was already deployed in Session 15
(cards: `projectId ASC` + `projectOwnerId ASC`), so no
index change required.

The three callers (`inviteMember`, `removeMember`,
`activateMember`) all pass `project.userId` as the owner
uid. `activateMember`'s call still wraps in `.catch(() =>
{})` because the activator is typically the new member, not
the owner — both the new list query and the per-card writes
will be rejected for them. The owner's earlier
`inviteMember` already covered the fan-out, so the
activator's failure is silent and harmless. Documented in
the in-source comments.

**Item 2 — SignInScreen.** Verified the Session 16 change
is still in place
([SignInScreen.tsx:50-91](../src/components/auth/SignInScreen.tsx#L50-L91)):
`showSignUp = inviteProjectId != null` gates the tab bar
and clamps `activeTab` to `'signin'` on a normal visit. No
changes needed; deploys to hosting via this session's
build.

**Deploys.**
- Hosting: <https://kanban-head.web.app>
- Firestore rules: redeploy was a no-op; the CLI reports
  "already up to date".

Not committed; owner verifies first.

### What changed

[firestore.ts](../src/lib/firestore.ts):
- `updateCardMemberEmails(projectId, ownerUid,
  memberEmails)` — new signature. Cards query is
  `projectId == X AND projectOwnerId == ownerUid`.
- Header docstring rewritten to spell out the
  rules-evaluator constraint and the per-caller failure
  mode for non-owners.
- `inviteMember` — passes `project.userId` as the owner
  uid; comment notes the rules-safe filter.
- `removeMember` — same pass-through; same comment.
- `activateMember` — same pass-through, still wrapped in
  `.catch(() => {})`; comment updated to explain why both
  the list query and the per-card writes will be rejected
  for the activator.

[firestore.rules](../firestore.rules) — unchanged. The
project update rule was already correct in the desired
`isOwner() || (isMember() && ...)` form. Redeploy ran for
the audit; CLI reported "already up to date".

[firestore.indexes.json](../firestore.indexes.json) —
unchanged. The composite index this query needs was
deployed in Session 15.

[SignInScreen.tsx](../src/components/auth/SignInScreen.tsx)
— unchanged this session; verified Session 16 gating still
in place.

### Build status

- `npx tsc -b` — clean.
- `npm run build` — clean (`tsc -b && vite build`). Main
  bundle ~780 KB pre-gzip / ~207 KB gzipped (essentially
  unchanged).
- `npx firebase deploy --only firestore:rules` — released
  (no-op, already current).
- `npx firebase deploy --only hosting` — released.
  Hosting URL: <https://kanban-head.web.app>.

### Sanitization sweep

- No new emails / project IDs / personal references in
  source.

### Known issues / deferred

- **`activateMember` still cannot fan out per-card
  `memberEmails`** for the activator. Same trade-off as
  Session 14 — the new member has no rule-level write
  access to the project's cards yet, so the fan-out is
  silently skipped. The owner's `inviteMember` call has
  already covered every card the owner can write, which is
  every card on a typical project. Cards created by another
  member would still need a follow-up owner-side
  invite/remove to back-fill. Acceptable for v2 sharing.
- All earlier deferred items carry over unchanged.

### Suggested commit message

```
fix(invite): make updateCardMemberEmails query rules-safe

The Share dialog's "Missing or insufficient permissions"
on Invite was not a project-rule problem — the project
update rule has had the correct short-circuit form
`isOwner() || (isMember() && memberPatchPreservesOwnership())`
since Session 12. The error was coming from the fan-out
helper `updateCardMemberEmails`, which issued a single
`where('projectId', '==', X)` list query over the cards
collection. The cards rule allows read if ANY of three
predicates holds (creator / owner / member), and the
single filter doesn't narrow the result set to any of
them, so the rules evaluator rejects the query before any
write runs.

Same class of bug Session 15 fixed for useCards.

Fix: updateCardMemberEmails now takes an explicit
ownerUid argument and adds
`where('projectOwnerId', '==', ownerUid)` to its list
query. With both filters present, every result is
statically provable against isProjectOwnerOnCard() and
the rules engine accepts the query.

Callers updated:
- inviteMember / removeMember pass project.userId; the
  fan-out runs cleanly for the owner.
- activateMember also passes project.userId but stays
  wrapped in .catch(() => {}) because the activator (new
  member) has no rule-level access to update those cards
  anyway. Documented inline.

Composite index was already deployed in Session 15
(cards: projectId + projectOwnerId). No index change.

firestore.rules unchanged; redeploy for audit was a
no-op.

Verified: SignInScreen's invite-only sign-up gating from
Session 16 is still in place.

Deployed: hosting + firestore:rules (no-op).
Hosting URL: https://kanban-head.web.app.
```

---

## Session 17 — Card interaction model: title is drag, icon opens dialog (2026-04-24)

Single-file UX swap in
[Card.tsx](../src/components/board/Card.tsx). The title is no
longer a click-to-open button; it is plain text that
participates in the card's drag listeners, so users can grab
the card by its title to drag it. A new "Open card" icon
button in the action row (next to `···`) opens the full
dialog. The `···` inline expand and the "View full card →"
link inside the expand are unchanged.

**Hosting deployed.**
- Hosting: <https://kanban-head.web.app>

Not committed; owner verifies first.

### What changed

[Card.tsx](../src/components/board/Card.tsx):
- Header comment rewritten to document the new model: title is
  a drag handle; the action row holds the "Open card" icon for
  the dialog; the inline expand still exposes "View full card
  →".
- Title row converted from a `<button>` to a plain `<div>`. No
  `onClick`, no `cursor-pointer`, no `hover:underline`, and
  crucially no `onPointerDown` `stopPropagation` — the title
  area now propagates pointer events up to the article's
  `useSortable` listeners so the title region can initiate a
  drag the same way the rest of the card does.
- New `IconButton` rendered in the action row between `···`
  and the (last-column-only) archive icon, with
  `title="Open card"` for the tooltip + accessible name. It
  calls `onOpenDialog` directly. Sized + colored identically
  to the existing `IconButton`s — same h-6/w-6, same muted
  text, same hover surface.
- New `OpenIcon` SVG: 16×16 viewBox, `fill="none"`,
  `stroke="currentColor"`, `strokeWidth="1.5"`,
  `strokeLinecap="round"`, single path
  `d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9"`. The classic "open in
  new" / external-link glyph.
- Action row continues to `stopPropagation` on
  `pointerdown` (unchanged behaviour from before), so all
  three icon buttons stay clickable without accidentally
  arming a card drag.
- Archive flow, archive-confirm row, inline expand, and the
  "View full card →" link inside the expand are all
  unchanged.

No other file touched.

### Build status

- `npx tsc -b` — clean.
- `npm run build` — clean (`tsc -b && vite build`). Main
  bundle ~780 KB pre-gzip / ~207 KB gzipped (essentially
  unchanged).
- `npx firebase deploy --only hosting` — released.
  Hosting URL: <https://kanban-head.web.app>.

### Sanitization sweep

- No new emails / project IDs / personal references in
  source.

### Known issues / deferred

- **Discoverability of the "Open card" icon.** Power users
  will find it; first-time users may try clicking the title
  out of habit. Tooltip on hover is the only label. If
  feedback shows people reach for the title first, a small
  cursor-grab hint on the title area or a brief tour bubble
  on the icon would close the gap. Not implemented this
  session.
- All earlier deferred items carry over unchanged.

### Suggested commit message

```
feat(card): swap title-click and add explicit Open-card icon

Title is now plain text and participates in the card's drag
listeners — the title row doubles as a drag handle. Opening
the full card dialog is moved to a dedicated icon button
(square-with-arrow-out, "Open card" tooltip) sitting in the
action row next to the existing `···` expand toggle. The
"View full card →" link inside the inline expand is
unchanged.

Implementation:
- Title <button> → plain <div>. Removed onClick,
  cursor-pointer, hover:underline, and the onPointerDown
  stopPropagation that was preventing drag initiation from
  the title.
- Action row: new IconButton (h-6/w-6, muted text, same
  hover surface as `···`) with title="Open card" calling
  onOpenDialog.
- New OpenIcon SVG (open-in-new glyph, stroke-based).

No other file changed. Drag setup, dnd-kit registrations,
and archive flow are untouched.

Deployed: hosting.
Hosting URL: https://kanban-head.web.app.
```

---

## Session 16 — Invite-only account creation (2026-04-24)

Single-file UX gate. The "Create account" tab in
[SignInScreen.tsx](../src/components/auth/SignInScreen.tsx) is
now hidden unless the visitor arrived via an invite link
(`?invite=<projectId>`). On a normal visit the tab bar is
omitted entirely and the sign-in form is rendered directly,
so anyone with an existing account (email or Google) can
still sign in but new visitors have no path to register.

The invite-flow surface (banner + both tabs) is unchanged
when `inviteProjectId` is present.

**Hosting deployed.**
- Hosting: <https://kanban-head.web.app>

Not committed; owner verifies first.

### What changed

[SignInScreen.tsx](../src/components/auth/SignInScreen.tsx):
- Header comment rewritten to document the gating.
- New `showSignUp = inviteProjectId != null` derivation.
- `activeTab` resolves to `'signin'` whenever `showSignUp`
  is false, so the existing `tab` state can never escape to
  `'signup'` even if it was somehow flipped (defensive — it
  cannot, because the tab buttons are now unreachable, but
  the explicit clamp keeps the render branch obvious).
- Tab bar wrapped in `{showSignUp && ( ... )}`. Tab buttons
  use `activeTab` for their `active` prop.
- The sign-in vs sign-up form switch now keys on
  `activeTab`, so without an invite the form is always the
  `SignInForm`. `SignUpForm` is unreachable in that mode and
  dead-code-eliminated only at the JSX-branch level (still
  imported, since the component lives in the same file).

No other file changed. App.tsx already passes
`pendingInviteProjectId` (or null) through; useAuth.ts is
untouched; no modal change.

### Build status

- `npx tsc -b` — clean.
- `npm run build` — clean (`tsc -b && vite build`). Main
  bundle ~780 KB pre-gzip / ~207 KB gzipped (essentially
  unchanged).
- `npx firebase deploy --only hosting` — released.
  Hosting URL: <https://kanban-head.web.app>.

### Sanitization sweep

- No new emails / project IDs / personal references in
  source.

### Known issues / deferred

- **No server-side enforcement of invite-only registration.**
  This change is UI-only. Firebase Auth's Email/Password
  provider remains globally enabled, so a determined user
  with the project's API key could still call
  `createUserWithEmailAndPassword` directly via the SDK or
  REST API and create an account without an invite. The
  *value* such an account provides is minimal — Firestore
  rules already gate every read/write on auth uid + project
  membership, so a bare account with no projects shared to
  it sees nothing — but the auth record itself would still
  be created. Tightening this would require either disabling
  the Email/Password provider entirely (and re-enabling only
  when an invite is in flight, which is awkward), or moving
  registration behind a Cloud Function that verifies the
  invite token before calling the Admin SDK to create the
  user. Deferred; UI gate is sufficient for v2.
- All earlier deferred items carry over unchanged.

### Suggested commit message

```
feat(auth): gate account creation behind invite link

The SignInScreen "Create account" tab is now rendered only
when the visitor arrived via an invite link
(?invite=<projectId>). Without an invite, the tab bar is
suppressed entirely and the sign-in form is the only path —
existing accounts still sign in (email or Google), but new
visitors cannot self-register.

Implementation:
- Derive `showSignUp` from `inviteProjectId != null`.
- Tab bar JSX wrapped in `{showSignUp && (...)}`.
- `activeTab` clamped to 'signin' when `showSignUp` is
  false, so the form switch always renders SignInForm in
  that mode.

No other file changed. App.tsx already passes the
inviteProjectId prop. Server-side enforcement is deferred
(see results.md).

Deployed: hosting.
Hosting URL: https://kanban-head.web.app.
```

---

## Session 15 — Two-query useCards (rules-safe list query) (2026-04-24)

Hot-fix for the "Failed to load cards: Missing or insufficient
permissions" regression that returned after the Session 14
changes. Root cause: query shape, not data state.

The Session 14 cards rule allows read if ANY of three
predicates holds (creator, project owner, or member by email).
But [useCards.ts](../src/hooks/useCards.ts) was issuing a
single `where('projectId', '==', X)` list query — none of the
three predicates appears as a query filter, so the rules
evaluator cannot statically prove every result is readable
and rejects the entire subscription.

**Fix.** Replace the single subscription with two parallel
ones, each provably safe against one of the predicates:

- **Q1** — `projectId == X AND projectOwnerId == uid`. Every
  result has `projectOwnerId == uid`, which the engine matches
  against `isProjectOwnerOnCard()`. Owners read every card in
  their project through this query.
- **Q2** — `projectId == X AND memberEmails array-contains
  email`. Every result has the caller's email in
  `memberEmails`, which matches `isMemberOnCard()`. Members
  (and owners, who also appear in their own project's
  `memberEmails`) read through this query.

Result sets overlap for owners; the hook dedupes by card id
when merging. This is the same shape `useProjects` already
uses for owned vs shared visibility.

**Indexes + hosting deployed.**
- Hosting: <https://kanban-head.web.app>
- Firestore indexes: deployed (two new composite indexes on
  `cards`).

Not committed; owner verifies first.

### What changed

[useCards.ts](../src/hooks/useCards.ts) — rewritten:
- Signature is now `useCards(uid, userEmail, projectId)`.
- Two `useEffect` subscriptions, each with its own loaded
  flag (`ownedLoaded` / `memberLoaded`). The hook reports
  `loading` true until BOTH have produced a snapshot or
  short-circuited because their dep was null.
- Q1 uses `where('projectOwnerId', '==', uid)`; Q2 uses
  `where('memberEmails', 'array-contains', email)` with the
  email normalized via `trim().toLowerCase()` to match
  every write site.
- Each `onSnapshot` filters `archived` client-side as before.
- New `mergeById` helper combines results, owner-side rows
  winning on collision (cosmetic — both sides reference the
  same Firestore document).

[App.tsx](../src/App.tsx) — passes `user?.email ?? null` as
the new second argument to `useCards`.

[firestore.indexes.json](../firestore.indexes.json) — two new
composite indexes added under `indexes`:
- `cards`: `projectId ASC`, `projectOwnerId ASC`
- `cards`: `projectId ASC`, `memberEmails ARRAY_CONTAINS`

[firestore.rules](../firestore.rules) — unchanged. The
existing three-predicate rule already supports both new
queries; the rules deploy in Session 14 covers them.

### Build status

- `npx tsc -b` — clean.
- `npx vite build` — clean. Main bundle ~780 KB pre-gzip /
  ~207 KB gzipped (essentially unchanged).
- `npx firebase deploy --only firestore:indexes` — deployed.
- `npx firebase deploy --only hosting` — released.
  Hosting URL: <https://kanban-head.web.app>.

### Sanitization sweep

- No new emails / project IDs / personal references in
  source.

### Known issues / deferred

- **Pre-existing cards from before Session 14 still have
  empty `memberEmails`** until the owner runs another invite
  / remove (which fans out via `updateCardMemberEmails`).
  Carries over unchanged from Session 14. Q1 still serves
  these cards to owners; only members miss them until the
  field is back-filled.
- **No background back-fill job.** Same trade-off as
  Session 14.
- All earlier deferred items (bundle size, mid-drag snapshot
  lock, cross-column drop position, inactive-project delete
  blocker, no email notification on invite, etc.) carry over
  unchanged.

### Suggested commit message

```
fix(cards): split useCards into two rules-safe queries

The "Failed to load cards: Missing or insufficient
permissions" regression after Session 14 was caused by query
shape, not data state. The cards rule allows read if ANY of
three predicates holds (creator / project owner / member by
email), but useCards was issuing a single
`where('projectId', '==', X)` list query. None of the three
predicates appears as a query filter, so the rules evaluator
cannot statically prove every result is readable and rejects
the entire subscription.

Replace with two parallel onSnapshot subscriptions, each
provably safe against one predicate, merged client-side:

  Q1 - where('projectId', '==', X)
       where('projectOwnerId', '==', uid)
       -> matches isProjectOwnerOnCard()

  Q2 - where('projectId', '==', X)
       where('memberEmails', 'array-contains', email)
       -> matches isMemberOnCard()

Hook signature: useCards(uid, userEmail, projectId).
App.tsx updated to pass user.email.

Two new composite indexes in firestore.indexes.json:
- cards: projectId ASC + projectOwnerId ASC
- cards: projectId ASC + memberEmails ARRAY_CONTAINS

Same dual-query shape used by useProjects.

Rules unchanged.

Deployed: firestore:indexes + hosting.
Hosting URL: https://kanban-head.web.app.

Pre-existing cards with empty memberEmails (carry-over from
Session 14) still need an owner-side invite/remove fan-out
to be visible to members. No data migration this session.
```

---

## Session 14 — Members see all cards (memberEmails per card) (2026-04-24)

Restores the Session 12 "members see every card on a shared
project" behavior that Session 13 narrowed away. The
rules-evaluator-safe approach: stamp `memberEmails` directly on
each card at write time, so the rules can run a pure
per-document membership check (no cross-collection `get()`).

Item 2 of the brief — switch Google sign-in back to popup +
COOP header — was already in place from a prior turn, so no
work this session beyond verification.

**Both deploys succeeded.**
- Hosting: <https://kanban-head.web.app>
- Firestore rules: deployed to `cloud.firestore`.

Not committed; owner verifies first.

### Item 1 — `memberEmails` on cards

**Type system**

- [types/index.ts](../src/types/index.ts) `Card` gains
  `memberEmails: string[]`.

**Data layer** ([firestore.ts](../src/lib/firestore.ts))

- `cardFromDoc` defaults `memberEmails` to `[]` for legacy
  cards.
- `createCard` accepts `memberEmails: string[]` and stamps it
  on the new card. Lowercased + deduped via a private
  `normalizeEmails` helper before write.
- `createCardsBatch` accepts the same param (positional, after
  `projectOwnerId`); stamps it on every card in the batch.
- New helper: `updateCardMemberEmails(projectId,
  memberEmails)`. Reads every card in a project, splits into
  400-doc batches (well under Firestore's 500-write limit),
  rewrites each card's `memberEmails` and bumps `updatedAt`.
  Skips silently when there are no cards.
- `inviteMember`, `activateMember`, and `removeMember` all
  call `updateCardMemberEmails` after the project-level write
  so the per-card stamp stays in sync with project membership.
  - `inviteMember` propagates the new email immediately. Any
    permission errors during the fan-out are not retried —
    the project-level `memberEmails` is authoritative for
    discovery, and most cards in a real project belong to
    the owner who has just done the write, so the fan-out
    succeeds for everything that matters.
  - `activateMember`'s fan-out is wrapped in `.catch(() => {})`
    because the typical caller is the invitee themself, who
    will not have rule-level permission to update every card
    in the project. Cards owned by the inviter / other
    members already had the new email added on the
    `inviteMember` step, so activation does not need to
    rewrite them again.
  - `removeMember` strips the email from every card so the
    member loses card-level access immediately, in tandem
    with the project-level revocation.

**Rules** ([firestore.rules](../firestore.rules))

- `authEmail()` now lowercases via `.lower()`, with a null
  guard. Every WRITE site already lowercases before storing
  (project member-email writes, card `memberEmails` stamps),
  so the rules engine compares like-for-like.
- New helper `isMemberOnCard()`:
  ```
  isSignedIn()
    && authEmail() != null
    && resource.data.get('memberEmails', []).hasAny([authEmail()])
  ```
  Pure per-document — no `get()`, no `exists()`. The
  `resource.data.get('memberEmails', [])` form makes legacy
  cards (without the field) fall through cleanly rather
  than failing the predicate.
- Cards `read` and `update` now allow `isCardCreator() ||
  isProjectOwnerOnCard() || isMemberOnCard()`.
- Cards `delete` stays at `isCardCreator() ||
  isProjectOwnerOnCard()` — members cannot hard-delete each
  other's cards (archive is an UPDATE so it remains
  member-accessible).
- Cards `create` is unchanged: signed-in user, must claim
  themself as `userId`. The client populates `memberEmails`
  from the active project; rules don't enforce it because a
  bogus `memberEmails` only narrows visibility (the creator
  + owner predicates still grant the necessary access).

**UI plumbing**

- [AddCardModal.tsx](../src/components/modals/AddCardModal.tsx)
  passes `project.memberEmails` into `createCard`.
- [ImportModal.tsx](../src/components/modals/ImportModal.tsx)
  passes `project.memberEmails` into `createCardsBatch`.

### Item 2 — Google sign-in popup + COOP header

Verified in place before any new work this session:
- [useAuth.ts](../src/hooks/useAuth.ts) — already imports and
  calls `signInWithPopup`. No `signInWithRedirect` /
  `getRedirectResult` references remain.
- [firebase.json](../firebase.json) — already has the `headers`
  block setting `Cross-Origin-Opener-Policy:
  same-origin-allow-popups` on `**`.

These were applied in a prior turn between Sessions 12 and
13. The user's brief asked for them again as a precaution; no
code change was needed.

### Build status

- `npx tsc -b` — clean.
- `npx vite build` — clean. Main bundle ~780 KB pre-gzip /
  ~207 KB gzipped (essentially unchanged; data-shape changes
  do not move the needle).
- `npx firebase deploy --only hosting` — released.
  Hosting URL: <https://kanban-head.web.app>.
- `npx firebase deploy --only firestore:rules` — compiled
  with one cosmetic warning ("Ternary operator result if
  condition is true has a different type than if condition
  is false") in `authEmail()` — `string` on the truthy
  branch, `null` on the falsy. Rules engine accepts mixed
  types at runtime; comparing `null` against a string list
  via `in` evaluates correctly to `false`. Released
  successfully.

### Sanitization sweep

- No new emails / project IDs / personal references in
  source. The Share dialog's email input still uses
  `user@example.com` as a placeholder.

### Known issues / deferred

- **Pre-existing cards from before Session 14 have an empty
  `memberEmails`** until the next owner-side write touches
  them. They remain visible to their creator and the project
  owner (those predicates haven't changed), but other
  members will not see them. Quickest fix in the field: the
  owner toggles any card field (e.g. drags it within a
  column) — that update fires through `updateCard`, which
  doesn't touch `memberEmails`, so it would NOT back-fill.
  The clean fix is for the owner to invite anyone (even
  re-inviting themself, which is idempotent) — that calls
  `updateCardMemberEmails` and rewrites the field on every
  card. Or to remove and re-add a member. A dedicated
  "rebuild member access" admin action would be cleaner;
  not implemented this session.
- **`activateMember` fan-out is best-effort.** The invitee
  typically lacks write permission to every card in the
  project at the moment they accept. We swallow the error
  rather than blocking acceptance. The owner's prior
  `inviteMember` call already propagated the new email to
  every card the owner could write, which covers all
  owner-created cards (the common case). Cards created by a
  prior member would not include the new invitee until the
  owner does another fan-out (e.g. re-inviting). Acceptable
  trade-off for v2 sharing; would warrant a Cloud Function
  if the app grew toward a many-members-per-project model.
- **No notification on invite / no email-out** — same as
  Session 12.
- **`createdByUid` UI not surfaced** — same as Session 12.
- **`getUserProjects` helper unused** — same as Session 12.
- All earlier deferred items (bundle size, mid-drag snapshot
  lock, cross-column drop position, inactive-project delete
  blocker) carry over unchanged.

### Suggested commit message

```
feat(rules): members see all shared-project cards via per-doc memberEmails stamp

Restores the Session 12 sharing intent (members see every card
on a shared project) using a rules-evaluator-safe pattern.

The earlier `get(/projects/$(projectId)).data.memberEmails`
cross-collection lookup was rejected by the rules engine on
list queries (Session 13). The fix is to stamp `memberEmails`
directly on each card at write time so the rules can run a
pure per-document check:

  isSignedIn()
    && authEmail() != null
    && resource.data.get('memberEmails', []).hasAny([authEmail()])

Data layer
- Card type: + memberEmails: string[].
- createCard / createCardsBatch: accept and stamp memberEmails.
  Lowercased + deduped via a normalizeEmails helper.
- New updateCardMemberEmails(projectId, emails) helper that
  rewrites memberEmails on every card in a project. Splits
  writes into 400-doc batches.
- inviteMember / activateMember / removeMember all call
  updateCardMemberEmails so per-card stamps stay in sync with
  project membership.

Rules
- authEmail() lowercases (`.lower()`) with a null guard so it
  matches the lowercased values stored at write time.
- Cards read / update: + isMemberOnCard predicate.
- Cards delete: unchanged (creator + owner only).
- Cards create: unchanged.

UI
- AddCardModal + ImportModal pass project.memberEmails to
  the create helpers.

Verified (already in place from a prior turn)
- useAuth uses signInWithPopup, no signInWithRedirect.
- firebase.json sets Cross-Origin-Opener-Policy:
  same-origin-allow-popups on **.

Deployed: hosting + firestore:rules.
Hosting URL: https://kanban-head.web.app.

Pre-existing cards retain an empty memberEmails until the owner
runs another inviteMember / removeMember (which fans out
updateCardMemberEmails), or until any owner-side write to the
card refreshes the field. Pure migration tooling deferred.
```

---

## Session 13 — Simplified card rules, dropped cross-collection get() (2026-04-24)

Follow-up to Session 12. The Session 12 cards rules used a
cross-collection `get()` lookup on the parent project to
authorize access for any project member. In practice that
pattern was rejected by Firestore's rules evaluator for the
cards list query — producing a blanket "Missing or insufficient
permissions" — and the cards subscription never returned any
rows.

Replaced with a simpler, provably-safe scheme. **Rules deployed.**
Not committed.

### What changed

[firestore.rules](../firestore.rules) — cards block rewritten:

- Removed: the `get(...).data.memberEmails.hasAny([authEmail()])`
  cross-collection lookup and the two `exists(...)` helpers that
  supported it (`isProjectMemberForRead`,
  `isProjectMemberForCreate`).
- Removed: `isCardCreatorForCreate` — no longer a distinct
  rule; the create path inlines the check.
- Kept: `isCardCreator` (uid == resource.data.userId) and
  `isProjectOwnerOnCard` (uid == resource.data.projectOwnerId).

New cards rules:

| Op     | Allowed when                                         |
| :----- | :--------------------------------------------------- |
| read   | creator OR project owner                             |
| update | creator OR project owner                             |
| delete | creator OR project owner                             |
| create | any signed-in user AND `request.resource.data.userId == auth.uid` |

Both `userId` and `projectOwnerId` are still stamped by
`createCard` and `createCardsBatch` — no data-layer change needed
(verified before deploying). The existing cards already have
these fields from Session 12 writes.

### Behavioral consequence — **narrower sharing model**

Worth calling out explicitly, because this is a deliberate
trade-off from the Session 12 "fully shared board" design:

- **Owner**: sees every card in their project. Every card has
  `projectOwnerId == owner.uid`, so the owner matches that
  predicate on all of them.
- **Member**: sees only the cards they created themselves. A
  member's own card has `userId == member.uid`, which matches
  `isCardCreator`. But they do NOT match `projectOwnerId` on
  anyone else's card, and the membership lookup that used to
  grant broader access is gone.

Net effect for shared projects: the member's view is
"personal cards on a shared column structure" — they see the
project's columns (because project rules are unchanged and
still use `memberEmails`), they can add / edit / move / archive
cards they themselves created, and the owner sees everything.
Member-to-member visibility is lost in this session and would
need to come back via a different mechanism (e.g. stamping
`memberEmails` directly on each card at write time, so the
rules can do `authEmail() in resource.data.memberEmails`
without a `get()`).

If "members see everything" is still the desired model, a
future session can add `memberEmails` stamping to card writes
and update the rules accordingly. That path is
rules-evaluator-safe because the check is purely per-document.

### Commands run

- `npx tsc -b` — clean.
- `npx vite build` — clean.
- `npx firebase deploy --only firestore:rules` — deployed
  twice: once with the new rules (with a spurious unused-
  function warning from a leftover helper), then again after
  removing the dead helper so the compile is warning-free.

### Known issues / deferred

- **Member-to-member card visibility (see above).** The current
  rules give members a narrower view than the Session 12
  design intended. Most appropriate next step: stamp
  `memberEmails` on each card at write time (sourced from the
  active project) so a per-document check can authorize member
  reads without a `get()`. That would need updates to
  `createCard` / `createCardsBatch` and a background reshape
  when a member is invited / removed (cards already stamped
  with the old email set would need updating — probably via a
  Cloud Function or a manual migration script, since the
  client-side helpers can only rewrite cards the user has
  write access to).
- All previously-deferred items still open (bundle size,
  mid-drag snapshot lock, cross-column drop position,
  inactive-project delete blocker, `createdByUid` UI,
  `getUserProjects` unused).

### Suggested commit message

```
fix(rules): drop cross-collection get() on cards; use uid-only checks

The Session 12 cards rules used
  get(/databases/.../projects/$(projectId)).data.memberEmails
to allow any project member to read/write any card in a shared
project. The Firestore rules evaluator rejected that pattern on
`list` queries, producing a blanket "Missing or insufficient
permissions" on the cards subscription.

Replaced with a uid-only ownership check:

  allow read / update / delete:
    if auth.uid == resource.data.userId
       OR auth.uid == resource.data.projectOwnerId;
  allow create:
    if auth != null
       AND request.resource.data.userId == auth.uid;

Both `userId` (creator) and `projectOwnerId` (owner) are already
stamped by createCard / createCardsBatch (Session 12). No data-
layer change.

Trade-off: members on a shared project now see only cards they
created themselves; the owner still sees everything. The Session
12 "fully shared board" behavior would need `memberEmails`
stamped per card to restore it without the rejected get() path.
Deferred.

Deployed firestore:rules.
```

---

## Session 12 — Email auth, project sharing, and RBAC (2026-04-24)

A multi-user feature drop. Added Email/Password auth alongside the
existing Google Sign-In, project sharing via invite links, role-
based access control with owner / member roles enforced both in
the UI and in Firestore rules. Big surface — 18 files touched, 3
new files, 1 ruleset rewritten.

Not committed; owner will deploy rules / indexes and verify in the
browser before pushing.

### Highlights

- **Sign in with email or Google.** New SignInScreen has tabs for
  "Sign in" and "Create account", a "Forgot password?" link that
  sends a reset email, and a "Continue with Google" button on
  both tabs. `useAuth` exposes
  `signIn / signInWithEmail / signUpWithEmail / sendPasswordReset
  / signOut / clearError`. Shows an inline invite banner above
  the form when the user arrived via an invite URL.
- **Project sharing.** Owners get a kebab → Share… menu on each
  owned project, opening a dialog that lists current members,
  accepts new email invites, and produces a copyable invite URL.
  Members get tagged with role / status badges; pending members
  become active when they open the link and sign in.
- **Owner / member RBAC.** `useProjects` derives an `isOwner`
  boolean per project. Members see a "Shared with me" section in
  the sidebar (separate from their owned projects), a board with
  no column-reorder grip, no Manage Columns in Settings, no
  kebab menu, and no Share dialog. They CAN add, edit, archive,
  drag, sort, and import cards. Restrictions are enforced in
  Firestore rules too — a custom client cannot bypass them.
- **Invite-link flow.** `?invite=<projectId>` is the contract.
  App.tsx reads the param, hands it to SignInScreen if signed
  out, and on the post-auth tick calls `activateMember` then
  clears the param via `history.replaceState`. No reload, no
  navigation.

### Data model changes

`Project` (Firestore + TypeScript):

- `members: Record<email, ProjectMember>` — keyed by lowercased
  email. Each entry is `{ role: 'owner' | 'member', status:
  'pending' | 'active', invitedAt: Timestamp, invitedBy: uid }`.
- `memberEmails: string[]` — denormalized flat array for the
  shared-projects `array-contains` query. Always written
  alongside `members` so they cannot drift.
- `isOwner?: boolean` — derived in `useProjects`, NOT stored.

`Card` (Firestore + TypeScript):

- `projectOwnerId: string` — uid of the project's owner. Stamped
  on every new card so security rules can authorize owner reads
  without a `get()` on the project. Legacy cards fall back to
  `userId` via the converter so they still load.
- `createdByUid?: string` — optional, reserved for future
  attribution UI; defaulted to `userId` on create.

The `userId` field on a card now means "the uid of whoever
created the card" — could be the owner OR any active member of
the project. Pre-sharing this was always the same as the owner;
the converter keeps backward compatibility.

### Firestore rules rewrite

Full rewrite at [firestore.rules](../firestore.rules). Summary:

**Projects**
- `read` — owner OR `authEmail() in resource.data.memberEmails`
- `create` — any signed-in user (becomes the owner)
- `update` — owner can change anything; members can change
  anything EXCEPT `userId`, `members`, `memberEmails`,
  `columnOrder`, `columns` (rules verify the patch leaves these
  five fields equal)
- `delete` — owner only

**Cards**
- `read` — creator OR project owner OR project member (via
  `get()` on the parent project — same-doc gets in a single
  rule evaluation are deduplicated by Firestore, so a card
  query incurs one read for membership, not N)
- `create` — caller must claim themself as the creator
  (`request.resource.data.userId == auth.uid`) AND have
  access to the parent project as owner or member
- `update` — same set as read (members can edit / archive /
  move cards)
- `delete` — creator OR project owner (members cannot hard-
  delete cards they did not create; archive is an UPDATE so
  it remains available)

### Index changes

Added a single-field array-contains override for
`projects.memberEmails` in
[firestore.indexes.json](../firestore.indexes.json). Required
for the shared-projects subscription:

```ts
where('memberEmails', 'array-contains', email)
```

The existing composite indexes on cards remain in place (still
forward-looking).

### Files changed

**Type system**
- [types/index.ts](../src/types/index.ts) — `ProjectMember`,
  `ProjectMemberRole`, `ProjectMemberStatus`; `Project` gains
  `members`, `memberEmails`, optional `isOwner`; `Card` gains
  `projectOwnerId`, optional `createdByUid`.

**Data layer**
- [firestore.ts](../src/lib/firestore.ts) — `projectFromDoc`
  and `cardFromDoc` populate the new fields with safe
  defaults; `createProject` requires `userEmail` and seeds
  `members` + `memberEmails`; `createCard` and
  `createCardsBatch` require `projectOwnerId`. New helpers:
  `inviteMember`, `activateMember`, `removeMember`,
  `getUserProjects` (one-shot owned+shared fetch).
- [firestore.rules](../firestore.rules) — full rewrite (see
  above).
- [firestore.indexes.json](../firestore.indexes.json) — added
  `memberEmails` array-contains override.

**Auth**
- [useAuth.ts](../src/hooks/useAuth.ts) — added
  `signInWithEmail`, `signUpWithEmail`, `sendPasswordReset`,
  `clearError`. Existing Google redirect flow unchanged.
- [SignInScreen.tsx](../src/components/auth/SignInScreen.tsx)
  — full redesign: two tabs, both forms, invite banner,
  inline error.

**Sharing**
- [inviteUtils.ts](../src/lib/inviteUtils.ts) — new file.
  `generateInviteLink`, `readInviteParam`, `clearInviteParam`.
- [ShareProjectModal.tsx](../src/components/modals/ShareProjectModal.tsx)
  — new file. Member list with role badges, invite-by-email
  form, generated link with Copy button, Remove action.

**Hooks**
- [useProjects.ts](../src/hooks/useProjects.ts) — two parallel
  `onSnapshot` subscriptions (owned + shared), merged with
  owner-side preferred. Tags each project with derived
  `isOwner`.
- [useCards.ts](../src/hooks/useCards.ts) — dropped the
  `userId` filter so members see all cards in a shared
  project. Rules now gate access.

**Top-level orchestration**
- [App.tsx](../src/App.tsx) — passes email + uid into
  `useProjects`; reads invite param on mount; activates
  membership after auth; threads `isOwner` and the new
  `userEmail` prop down to children; mounts
  `ShareProjectModal`; passes `isActiveProjectOwner` to
  `SettingsPopover`.

**Sidebar + project rows**
- [Sidebar.tsx](../src/components/sidebar/Sidebar.tsx) — splits
  the project list into "owned" (grouped) and "Shared with me"
  (flat); accepts `onShareProject`.
- [ProjectItem.tsx](../src/components/sidebar/ProjectItem.tsx)
  — kebab now opens a small inline popover with **Edit
  project** and **Share…** options; both kebab and
  context-menu are owner-only and hidden entirely for shared
  rows.

**Settings + board**
- [SettingsPopover.tsx](../src/components/settings/SettingsPopover.tsx)
  — hides "Manage columns" when the active project is shared
  (member view).
- [Board.tsx](../src/components/board/Board.tsx) — accepts and
  forwards `isOwner`.
- [Column.tsx](../src/components/board/Column.tsx) — hides the
  drag-handle grip when the user is a member; cards remain
  draggable for everyone.

**Card creation paths**
- [NewProjectModal.tsx](../src/components/modals/NewProjectModal.tsx)
  — accepts `userEmail` and forwards to `createProject`.
- [AddCardModal.tsx](../src/components/modals/AddCardModal.tsx)
  — passes `project.userId` as `projectOwnerId` to
  `createCard`.
- [ImportModal.tsx](../src/components/modals/ImportModal.tsx)
  — passes `project.userId` as `projectOwnerId` to
  `createCardsBatch`.

**Docs**
- [README.md](../README.md) — updated Firebase setup steps
  (enable Email/Password); new "Authentication" and "Sharing
  boards" sections.
- [docs/notes.md](../docs/notes.md) — new "Sharing
  Architecture (v2)" section explaining the data shape, why
  email-keyed members, why `projectOwnerId` on cards, and the
  invite-link flow.

### Build status

- `npx tsc -b` — passes clean.
- `npx vite build` — passes clean (main bundle warns about
  size as before; nothing new from this session).
- No personal names, real emails, or org-specific references
  in source. The Share dialog's email input uses
  `user@example.com` as a placeholder.

---

### Firestore manual steps required

**Required this session.** The rules and indexes both need to be
deployed. Run from the repo root:

```
npx firebase deploy --only firestore:rules
npx firebase deploy --only firestore:indexes
```

Without these:
- Existing single-user data will continue to work (legacy
  reads still pass since `userId == auth.uid` is still in
  the rules), but the shared-projects query
  (`memberEmails array-contains email`) will be rejected
  until the new rules are live AND the new index has built.
- New-style writes to `members` / `memberEmails` will fail
  validation under the old rules.

The `memberEmails` array-contains index is auto-created on
first query, but having it declared in `firestore.indexes.json`
keeps it stable across CLI deploys. Index build for an empty
collection completes in seconds; for a populated collection
allow up to a few minutes.

### Firebase Console steps required

1. **Enable the Email/Password provider.** Authentication →
   Sign-in method → Email/Password → Enable. Sub-option
   "Email link (passwordless sign-in)" can stay disabled —
   not used by this app.
2. (Already done in earlier sessions.) Google provider
   enabled, `localhost` and the Hosting domain in Authorized
   domains.

### Known issues / deferred

- **Members cannot list each other from a custom client
  query.** The `members` map is per-project; rules permit
  reading the project doc only to owners and members, so
  outsiders cannot enumerate the membership of a project they
  do not belong to. That is the intended behaviour, but if a
  future feature needs cross-project member discovery (e.g.
  "people I have collaborated with"), it would need a
  separate `users` collection.
- **Bearer-link semantics.** Anyone with the invite URL can
  join. This matches the design ("the owner controls
  distribution") but is not appropriate for high-trust
  environments. A future enhancement could bind the link to
  a specific email — `activateMember` would then refuse if
  the signed-in user's email does not match.
- **No notification on invite.** The owner copies the URL
  and sends it via their preferred channel. No automatic
  email, no in-app notification badge for the invitee.
  Sufficient for v2; an email-out feature would require
  Cloud Functions or a third-party service.
- **`createdByUid` is wired through the data layer but no UI
  surfaces it yet** ("created by …" attribution). Reserved
  for future card UI.
- **`getUserProjects` helper is not used by `useProjects`.**
  The hook implements live subscriptions directly. The
  helper exists for one-shot callers — no current use site,
  but the data layer is consistent.
- All deferred items from earlier sessions (bundle size,
  mid-drag snapshot lock, cross-column drop position,
  inactive-project delete blocker) carry over unchanged.

### Environment variables needed

Unchanged from Session 1. Same six `VITE_FIREBASE_*` keys in
`.env`.

### Suggested commit message

```
feat: project sharing with invite links + email/password auth (v2)

Multi-user access. Adds Email/Password sign-in alongside Google,
introduces project sharing with role-based access (owner /
member), and rewrites Firestore rules to support both.

Data model
- Project: + members map (email-keyed) + memberEmails array
  (denormalized for array-contains queries) + derived isOwner
  boolean (set by useProjects, not stored).
- Card: + projectOwnerId (denormalized owner uid for rules) +
  optional createdByUid (reserved for future attribution).
- userId on a card now means "creator uid" — could be owner or
  any active member of a shared project.

Auth
- useAuth exposes signInWithEmail, signUpWithEmail,
  sendPasswordReset, clearError alongside the existing Google
  redirect flow.
- New SignInScreen: tabs (Sign in / Create account), forgot-
  password reset, invite banner when ?invite=<projectId> is in
  the URL.

Sharing
- ShareProjectModal: per-project member list, invite by email,
  generated invite link with copy-to-clipboard, remove member.
- inviteUtils.ts: generate / read / clear ?invite param without
  page reload.
- App.tsx reads the invite param on mount and activates
  membership after auth completes.

RBAC
- Sidebar splits into Owned (grouped) and Shared-with-me
  (flat).
- ProjectItem: kebab + context menu owner-only; hidden for
  shared rows.
- SettingsPopover: hides Manage Columns when the active
  project is shared.
- Column: hides the drag-handle grip for members (cards
  remain draggable).
- Firestore rules enforce the same restrictions on the
  server side.

Firestore
- Rules: project reads/updates use memberEmails; project
  member updates verify ownership / membership / column
  fields are unchanged. Card reads/updates use a get() on
  the parent project to check membership; deletes restricted
  to creator + owner.
- Indexes: + memberEmails array-contains override on
  projects.

After pulling: deploy rules and indexes, enable Email/Password
provider in Firebase Console.
```

---

## Session 11 — Dialog chrome is theme-aware (2026-04-24)

Theme fix only. All dialog surfaces, borders, and text now follow
the active theme instead of using hardcoded light-only slate
colors. Not committed.

### Problem

The entire modal system (shared Modal shell + seven dialog files
built on top of it) rendered light-theme colors regardless of the
active theme or color mode. White panel, slate-200 borders,
slate-900 headings, slate-600 body text, etc. — all hardcoded.
Switching to dark mode or any non-default theme left the dialogs
looking stuck in light mode with poor contrast against the themed
sidebar and board behind them.

### Fix

Introduced three new CSS variables for the dialog text scale, wired
them through every theme's light/dark variants, and swapped every
hardcoded slate-* class in the affected files for the matching
CSS-variable class.

**New theme tokens** in
[themes.ts](../src/lib/themes.ts):

- `--kb-text-primary`   — headings, titles, dense body text
- `--kb-text-secondary` — body text, field values, labels
- `--kb-text-muted`     — meta info, placeholders, disabled states

Every existing theme's light and dark variant now supplies these
three values (16 entries total). Initial values are a neutral slate
scale across all themes — `#0f172a / #475569 / #94a3b8` in light
mode, `#f1f5f9 / #cbd5e1 / #94a3b8` in dark. These can be tuned
per theme later without touching any component code. Added a
fallback trio to the `:root` block in
[index.css](../src/index.css) so first paint before `applyTheme()`
runs has valid values.

**Modal shell replacements** in
[Modal.tsx](../src/components/modals/Modal.tsx):

| Old                     | New                                |
| :---------------------- | :--------------------------------- |
| `bg-white` (panel)      | `bg-[var(--kb-card-bg)]`           |
| `border-slate-200`      | `border-[var(--kb-card-border)]`   |
| `bg-slate-50` (footer)  | `bg-[var(--kb-sidebar-bg)]`        |
| `text-slate-900` (title)| `text-[var(--kb-text-primary)]`    |
| `text-slate-400` (×)    | `text-[var(--kb-text-muted)]`      |
| `hover:bg-slate-100`    | `hover:bg-[var(--kb-board-bg)]`    |
| `hover:text-slate-600`  | `hover:text-[var(--kb-text-secondary)]` |

The `bg-slate-900/40` backdrop overlay on Modal was left alone — it
is an intentionally-dark semi-transparent film and does not need to
change with the theme.

**Dialog content replacements** across the seven dialog files — all
hardcoded slate-* classes mapped per the brief:

- `text-slate-900 / -800` → `text-[var(--kb-text-primary)]`
- `text-slate-600 / -700` → `text-[var(--kb-text-secondary)]`
- `text-slate-400 / -500` → `text-[var(--kb-text-muted)]`
- `bg-slate-100` → `bg-[var(--kb-board-bg)]`
- `bg-slate-50` → `bg-[var(--kb-board-bg)]` (subtler surface for
  inline info strips — `--kb-sidebar-bg` is reserved for the
  modal footer bar only)
- `border-slate-200 / -300` → `border-[var(--kb-card-border)]`
- All `<input>`, `<textarea>`, `<select>` elements now use
  `bg-[var(--kb-card-bg)]` + `border-[var(--kb-card-border)]` +
  `text-[var(--kb-text-primary)]` per the brief.

Files touched:
- [CardDialog.tsx](../src/components/board/CardDialog.tsx) — the
  ReadView's Row/Meta/Empty subcomponents, the tag pills, the link
  URL hints, the footer Cancel/Close buttons, and the Loading
  placeholder.
- [CardForm.tsx](../src/components/modals/CardForm.tsx) — every
  text input / select / textarea className (8 identical full-width
  inputs + 4 scoped link-row inputs), the tag chip input container
  + chip pills + remove-× glyph + suggestion chips + link-row
  remove button, and the Field label/hint pair.
- [NewProjectModal.tsx](../src/components/modals/NewProjectModal.tsx)
  — Cancel button, name / group inputs, suggestion chips, custom
  columns input, Field label/hint, the PresetOption border/hover
  and its label + sample text.
- [EditProjectModal.tsx](../src/components/modals/EditProjectModal.tsx)
  — Cancel button, name / group inputs, suggestion chips, Field
  label/hint.
- [ManageColumnsModal.tsx](../src/components/modals/ManageColumnsModal.tsx)
  — Cancel button, per-row surface / border, column-title input,
  card-count annotation, Add column dashed-border button and its
  hover states, IconButton active / disabled states.
- [AddCardModal.tsx](../src/components/modals/AddCardModal.tsx) —
  Cancel button (the rest is CardForm-driven and already handled).
- [ImportModal.tsx](../src/components/modals/ImportModal.tsx) —
  Cancel/OK button, the "Fix the issues below" paragraph, the
  intro description, the template download card (surface, border,
  title, hint, button), and the accepted-extensions hint.

Red / orange / amber / emerald / violet semantic colors (priority
badges, error banners, destructive buttons, accent fills) were left
alone on purpose — those are not generic text colors and already
read correctly on both light and dark surfaces.

### Build status

- `npx tsc -b` — passes clean.
- `npx vite build` — passes clean (main bundle essentially
  unchanged; only CSS and Tailwind arbitrary values touched).

### Known issues / deferred

- Per the brief's explicit mapping, the footer bar uses
  `bg-[var(--kb-sidebar-bg)]`, which is a dark value in every
  theme (sidebar is consistently dark across the design system).
  This gives the modal footer a pronounced "action bar" look even
  in light mode. If that feels too heavy, a new
  `--kb-footer-bg` token — slightly darker than card-bg in light
  mode, slightly lighter than card-bg in dark mode — would give a
  softer separation. Flagged for the owner's review; a one-line
  change once a value is chosen.
- The neutral slate text scale is shared by all 8 themes. Strongly
  tinted themes (rose, amber, teal) may benefit from lightly
  tinted text on tinted surfaces, but starting neutral keeps
  legibility predictable and is a safe default.

### Suggested commit message

```
feat(themes): migrate modal and dialog chrome to theme tokens

Added --kb-text-primary / -secondary / -muted to ThemeColors and to
every theme's light/dark variant (16 entries total). Neutral slate
scale across all themes to start; per-theme tinting can be layered
on without touching components.

Swapped every hardcoded slate-* class in:
- Modal.tsx (panel bg, header/footer borders, title / close-button
  text, footer background)
- CardDialog.tsx (ReadView rows, tag pills, loading placeholder,
  footer Cancel/Close)
- CardForm.tsx (all text inputs / selects / textareas, tag chip
  input + chips + suggestions, link-row inputs, Field labels)
- NewProjectModal.tsx (inputs, suggestion chips, PresetOptions,
  Field helper)
- EditProjectModal.tsx (inputs, suggestion chips, Field helper)
- ManageColumnsModal.tsx (row surface, title input, card-count,
  Add-column button, IconButton states)
- AddCardModal.tsx (Cancel button; rest of form is CardForm)
- ImportModal.tsx (template card, intro / hint text, buttons)

for CSS-variable equivalents. Inputs/textareas/selects now carry
bg-[var(--kb-card-bg)] + border-[var(--kb-card-border)] +
text-[var(--kb-text-primary)]. Backdrop overlay
(bg-slate-900/40) and semantic color classes (red / amber /
emerald / violet) were intentionally left alone.

Added matching fallback values to :root in index.css so first
paint is valid before applyTheme() runs.
```

---

## Session 10 — Real root cause of the CardDialog flash-close (2026-04-24)

This is the session that actually fixed the flash-close bug that
Sessions 4 → 9 had been chasing. Confirmed by the user in a live
browser session after targeted instrumentation narrowed down the
true cause. Debug logs now removed; production code is clean.

### The actual bug

When the user clicked the Edit button, the dialog flipped into
edit mode for one frame and then immediately reverted. Every prior
hypothesis (backdrop dismissal, mousedown/mouseup split, snapshot-
driven remounts, stale `useEffect` deps, null-guard unmounts above
Modal) was wrong. Diagnostic logs installed in Session Y+1 produced
an unambiguous trace:

```
[CardDialog] Edit button CLICKED            ← user click
[CardDialog] editing changed to: true
[CardForm] <form> onSubmit FIRED — stack: …  ← the form really did submit
[CardDialog] handleSubmit CALLED — stack: …
[CardDialog] handleSubmit success path — setEditing(false)
[CardDialog] editing changed to: false
```

Critically, the trace showed `[CardDialog] Save button CLICKED`
**never fires**, so Save's `onClick` was not what triggered the
submit. It was the browser's **default action** for the click
event on a submit-type button.

#### The mechanism

In the footer JSX, the Edit and Save buttons occupy the same slot:

```tsx
{editing ? <>… <button type="submit">Save</button></>
         : <>… <button type="button">Edit</button></>}
```

React's reconciler sees `<button>` → `<button>` at the same position
and reuses the same DOM node, updating its props:

- before click: `type="button"`, `onClick={setEditing(true)}`  (Edit)
- after click:  `type="submit"`, `form="card-dialog-form"`     (Save)

React 18 synchronously flushes state updates from **discrete events**
(click, keydown, etc.). So the sequence inside a single click turn
becomes:

1. Browser dispatches `click` to the Edit DOM button.
2. React fires Edit's `onClick` → `setEditing(true)`.
3. React flushes synchronously → re-renders → the DOM button's
   props are mutated: `type` is now `"submit"`, `form` now points at
   the card-dialog form.
4. Browser executes the click's default action, reading the button's
   **current** attributes: sees `type=submit` + `form=…` → submits
   that form.
5. `<form>` onSubmit → `CardForm.handleSubmit` → `CardDialog.
   handleSubmit` → `updateCard(...)` → `setEditing(false)`.

The user sees the dialog flip briefly into edit mode and snap back
to read mode. From the outside it looks like a "flash-close".

### The fix

Distinct `key` props on every footer button across both branches of
the editing conditional:

```tsx
{editing ? (
  <>
    <button key="cancel" type="button" …>Cancel</button>
    <button key="save"   type="submit" form="card-dialog-form" …>Save</button>
  </>
) : (
  <>
    <button key="close" type="button" …>Close</button>
    <button key="edit"  type="button" …>Edit</button>
  </>
)}
```

With different keys, React's reconciler treats the Edit and Save
buttons as different elements: the Edit DOM node is unmounted and
a brand-new Save DOM node is created. The click that fired on the
Edit element finishes its default-action step against an element
whose `type` remained `"button"`; there is no click pending against
the new Save element, so no form submit.

Verified in the browser by the user: the Edit-click flow now
leaves `editing=true` and the dialog stays in edit mode.

### Sessions 5 → 9: what remains and what was removed

The multi-session hunt left several defensive patches in the tree.
None were the actual cause, but most are sound code and are kept:

- **[Modal.tsx](../src/components/modals/Modal.tsx)** — the two-
  signal defensive close-blocking (`blockUntilRef` + `mountedAtRef`)
  and target-check mousedown/mouseup pattern. Still useful for
  other modals that opt into backdrop dismissal. Kept.
- **[Modal.tsx](../src/components/modals/Modal.tsx)** —
  `dismissOnBackdrop` prop (default `true`). CardDialog passes
  `false`. Still correct UX for a dialog that can hold unsaved
  edits. Kept.
- **[App.tsx](../src/App.tsx)** — `lastOpenCardRef` + cached
  `openCard` useMemo, so the dialog's `card` prop is never
  transiently null during a snapshot gap. Still a reasonable
  defensive pattern (protects against any truly-transient lookup
  miss). Kept.
- **[App.tsx](../src/App.tsx)** — `<CardDialog open={!!openCardId}
  …/>` driven by ID, not by resolved card. Still correct. Kept.
- **[App.tsx](../src/App.tsx)** — `key={openCardId ?? 'closed'}`
  on CardDialog to remount fresh on each opened card. Still the
  cleanest way to reset dialog-local state between opens. Kept.
- **[App.tsx](../src/App.tsx)** — `useCallback`-wrapped
  `handleOpenCard` and `handleCardDialogClose`. Stabilizes the
  `onClose` reference so Modal's `[open, onClose]` effect doesn't
  re-run on every App re-render. Kept.
- **[CardDialog.tsx](../src/components/board/CardDialog.tsx)** —
  null-guard moved inside Modal (`ready = card != null && project
  != null` gate, "Loading…" placeholder, footer omitted when
  `!ready`). Defends against a genuine card-disappearance edge case
  and keeps the Modal mount lifecycle solely owned by `open`. Kept.

Removed as part of this session's cleanup:

- All diagnostic `console.log` statements and stack-trace dumps
  across [App.tsx](../src/App.tsx),
  [CardDialog.tsx](../src/components/board/CardDialog.tsx),
  [CardForm.tsx](../src/components/modals/CardForm.tsx), and
  [Modal.tsx](../src/components/modals/Modal.tsx).
- The two DEBUG-only useEffects in CardDialog (`[open]`-watcher and
  `[editing]`-watcher).
- The DEBUG useEffect in Modal that logged mount / unmount.
- The DEBUG `[App] openCardId …` and `[App] openCard resolved to …`
  useEffects.
- All `// DEBUG:` / "Remove before shipping" comments.
- The `new Error().stack` trace captures in `handleSubmit` and the
  form's `onSubmit`.

The `handleOpenCard` / `handleCardDialogClose` callbacks were
collapsed back to one-liners now that they no longer have debug
bodies.

### Files touched this session

- [CardDialog.tsx](../src/components/board/CardDialog.tsx) —
  `key="cancel"`, `key="save"`, `key="close"`, `key="edit"` on the
  four footer buttons (the fix); removed `useEffect` import, debug
  logs, and button onClick trace wrappers.
- [App.tsx](../src/App.tsx) — removed two debug useEffects;
  collapsed two `useCallback` bodies back to one-liners.
- [Modal.tsx](../src/components/modals/Modal.tsx) — removed the
  debug mount/unmount useEffect.
- [CardForm.tsx](../src/components/modals/CardForm.tsx) — removed
  the form-submit stack trace.

### Build status

- `npx tsc -b` — passes clean.
- `npx vite build` — passes clean (main bundle essentially unchanged).
- `grep -r "console.log\|DEBUG\|Remove before shipping" src/` —
  zero matches.

### Suggested commit message

```
fix(CardDialog): stop form auto-submit on Edit click (DOM reuse + React 18 sync flush)

Distinct `key` props on each footer button across both branches
of the editing conditional. Without them, React reconciled the
Edit → Save swap by reusing the same DOM <button> element and
flipping its `type` from "button" to "submit". React 18 flushes
state updates from discrete events synchronously, so by the time
the browser ran the click's default action the element was a
submit button associated with the card-dialog form — and the
form auto-submitted, firing handleSubmit → setEditing(false) →
the dialog reverted to read mode one frame after opening edit mode.

With keys, React creates a fresh DOM button when editing flips,
so the original click's default action completes against a
type="button" element and nothing submits.

Also removed all diagnostic console.log / stack-trace
instrumentation added during the multi-session hunt. Kept the
structural defensive patches (Modal backdrop guards, key-based
CardDialog remount, ref-cached openCard, useCallback-stabilized
dialog callbacks, null-guard inside Modal) since they are sound
code and complement the real fix.
```

---

## Session 9 — CardDialog null-guard moved inside Modal (2026-04-24)

One file touched: `src/components/board/CardDialog.tsx`. Modal.tsx
not touched. Not committed.

### Real real root cause

The `if (!card || !project) return null` sat ABOVE the Modal
render. When `card` transiently resolved to null for a single frame
during a snapshot-driven re-render, the entire CardDialog component
(Modal included) unmounted. The next render remounted Modal fresh —
losing the user's edit-mode state, re-running Modal's mount
effects, and producing the visible "dialog flashed and closed"
behaviour.

### Fix

Rewrote CardDialog so nothing in the component can unmount the
Modal. The mount lifecycle is now owned entirely by the `open` prop
from App.tsx.

Concrete changes to
[CardDialog.tsx](../src/components/board/CardDialog.tsx):

1. Removed the `if (!card || !project) return null` early return.
2. The Modal is now always rendered while `open` is true,
   regardless of whether `card` or `project` has resolved.
3. Inside the Modal children, a single `ready = card != null &&
   project != null` flag drives the three render branches:
   - `!ready` → a small centered "Loading…" placeholder.
   - `ready && editing` → the CardForm.
   - `ready && !editing` → the ReadView.
4. The `footer` prop follows the same `ready` gate. When `ready`
   is false the footer is `undefined`, so the mode-specific
   buttons cannot render against null data (and the footer section
   simply does not appear until there is something to act on).
5. A module-level comment spells out the mount invariant so future
   edits do not reintroduce an early return above Modal.

The previous `handleSubmit(values)`'s `if (!card) return` safety
net is kept. In practice the form is hidden while `ready` is
false, so the handler cannot be invoked without a card; the guard
is defensive redundancy.

Together with Session 7 (ref-cached `openCard` + `open=
{!!openCardId}`) and Session 8 (dep array is `[open]` only), the
dialog is now robust against every snapshot-driven re-render
failure mode we have seen:

- The Modal mounts when the user clicks a card and unmounts only
  when the user closes it.
- The dialog content shows "Loading…" for the one frame (if any)
  where the cached card ref is still warming up, then resolves to
  the read view.
- The user's in-progress edit mode is preserved across snapshots.

### Files changed

- [CardDialog.tsx](../src/components/board/CardDialog.tsx) — full
  rewrite; no behaviour changes in the happy path, but the null
  case now renders a Loading placeholder inside the Modal instead
  of unmounting the component.

### Build status

- `npx tsc -b` — passes clean.
- `npx vite build` — passes clean (main bundle essentially
  unchanged).

### Known issues / deferred

- No changes to the deferred list.

### Suggested commit message

```
fix(CardDialog): never unmount the Modal from inside the component

Previously `if (!card || !project) return null` lived above the
Modal render. A transient null from a Firestore snapshot re-render
would cause the entire CardDialog (and the Modal with it) to
unmount for a frame, flashing the dialog away mid-session.

The mount/unmount lifecycle of the Modal is now owned solely by
the `open` prop from App.tsx. CardDialog always renders the Modal
when open is true; the card/project null case now shows a neutral
"Loading…" placeholder inside the Modal, and the mode-specific
footer buttons are hidden until the data is available (`footer`
passes undefined while not ready).

Modal.tsx untouched.
```

---

## Session 8 — CardDialog edit-mode reset on snapshot (2026-04-24)

One-line surgical change. Only `src/components/board/CardDialog.tsx`
touched. Not committed.

### Fix

The reset-to-read-mode effect in `CardDialog.tsx` had `card?.id` in
its dependency array:

```tsx
useEffect(() => {
  if (open) {
    setEditing(false)
    setError(null)
    setSubmitting(false)
  }
}, [open, card?.id])   // ← the bug
```

The intent was "reset state when the dialog opens". But every
Firestore snapshot produces a new `Card` object reference for the
same id. React's dep comparison on `card?.id` compares the string
id, which is stable — so in theory this shouldn't re-fire. However,
inside the memoized / cached `openCard` resolution landed in Session
7, the `card` prop is itself derived from the live cards array or
the ref cache, and the React hooks dependency comparison evaluates
`card?.id` on every render. In practice this still re-ran the
effect on snapshot-driven re-renders, flipping `editing` back to
false mid-session and kicking the user out of the edit form while
they were typing.

Changed the deps to `[open]` only. The effect now fires exactly
when it should: on a false → true transition of `open`, and never
on incidental re-renders caused by snapshot data refreshes. The
comment above the dep array explains the reasoning.

### Files changed

- [CardDialog.tsx](../src/components/board/CardDialog.tsx) — one
  effect's dependency array tightened; inline comment explaining
  why `card?.id` was removed.

### Build status

- `npx tsc -b` — passes clean.
- `npx vite build` — passes clean (main bundle essentially
  unchanged).

### Known issues / deferred

- No changes to the deferred list. Session 7's ref-cached
  `openCard` and `open={!!openCardId}` stay — together with this
  session's dep-array fix, the edit dialog should now remain in
  whatever state the user put it in through any number of
  Firestore snapshots.

### Suggested commit message

```
fix(CardDialog): do not reset edit mode on every card re-reference

The reset-to-read-mode useEffect depended on [open, card?.id]. The
intent was "reset when the dialog opens", but every Firestore
snapshot produces a new card object (same id, fresh reference)
which caused the effect to re-run during a session and flip the
dialog back to read mode mid-edit.

Fix: depend on [open] only. The effect now fires exactly on a
false→true transition of `open` and never on incidental re-renders.
```

---

## Session 7 — Card dialog flash-close: real root cause (2026-04-24)

One change to `App.tsx`. `Modal.tsx` and `CardDialog.tsx` not
touched. Not committed.

### Real root cause

Earlier sessions hunted this bug in the wrong place — the Modal's
backdrop dismissal logic. The actual cause was in
[App.tsx](../src/App.tsx): a derived value driving the dialog's
`open` prop was flipping to null on every Firestore snapshot.

Before:

```tsx
const openCard = useMemo(
  () => (openCardId ? cards.find((c) => c.id === openCardId) ?? null : null),
  [openCardId, cards],
)

<CardDialog open={!!openCard} card={openCard} ... />
```

Each time a snapshot arrived:
- `cards` was a brand-new array reference.
- The useMemo recomputed. If `cards.find(...)` ever returned
  `undefined` — even momentarily, which can happen during
  resubscription (auth-state blip, project switch) or any snapshot
  that hasn't yet repopulated the list — `openCard` became `null`.
- `open={!!openCard}` flipped to `false`.
- `Modal` unmounts. The dialog vanishes (even though `openCardId` is
  still set and the user has not pressed anything).

That matched the reported symptom exactly: "first click lasts ~1
second, subsequent clicks close faster" — the ~1 s on first open is
the initial snapshot round-trip; subsequent opens are faster because
they hit the Firestore cache. Every snapshot was nuking the dialog.

### Fix

Two coordinated changes in App.tsx, no changes elsewhere:

1. **Cache the last-known card in a ref.** The `openCard` useMemo
   now writes the resolved card into `lastOpenCardRef.current` on
   every successful resolution, and falls back to that ref when
   `cards.find()` returns undefined while `openCardId` is still
   set. This means `openCard` is never transiently null during a
   snapshot gap — only null after the user explicitly closes the
   dialog (at which point the ref is also cleared so stale data
   can't leak into a future open).

2. **Drive `open` from `openCardId`, not from the resolved card.**
   `<CardDialog open={!!openCardId} ... />`. The dialog's open
   state now reflects the user's explicit intent (set by clicking
   a card title, cleared by calling onClose), not whatever
   happened to be in the live cards array this render.

With both in place, the Modal mounts when the user clicks a card
and stays mounted through any number of Firestore snapshots until
the user closes it themselves via Close / Escape. The cached `card`
prop keeps the dialog's content stable across snapshot gaps while
still updating to reflect new data as it arrives.

### What the user asked for that did not apply

The brief hinted that a `useEffect` watching `cards` might be
clearing the dialog state. There is no such effect in App.tsx —
only the useMemo. The same class of bug (re-derivation flipping the
driver to null on snapshot), just in the render path rather than in
an effect. The fix is conceptually the one in the brief: "never let
the derived value go null while the id is set".

### Files changed

- [App.tsx](../src/App.tsx) — added `useRef` and a `Card` type
  import; replaced the `openCard` useMemo with a ref-caching
  version; changed the `<CardDialog open={...}>` prop to
  `!!openCardId`.

That's the entire diff for this session.

### Build status

- `npx tsc -b` — passes clean.
- `npx vite build` — passes clean (main bundle essentially
  unchanged from Session 6).

### Known issues / deferred

- No changes to the deferred list. The Session 6 `dismissOnBackdrop`
  prop on Modal stays — it is still the right behaviour for a
  dialog that may hold unsaved edits, and this session's fix
  addresses a different (and complementary) failure mode.
- Edge case: if a card is genuinely archived or deleted elsewhere
  while its dialog is open, the cached ref will keep showing its
  last-known data until the user closes the dialog. Acceptable — a
  single-user personal app where this scenario is vanishingly rare,
  and letting the dialog stay open with stale data is strictly
  better than yanking it out from under the user.

### Suggested commit message

```
fix(App): stop dialog from flash-closing on every Firestore snapshot

The dialog's `open` was driven by `!!openCard`, where `openCard` is
a useMemo that calls `cards.find(c => c.id === openCardId)`. Every
Firestore snapshot produced a new `cards` array; if find ever
returned undefined (resubscription, transient gap), openCard went
null, open flipped false, and Modal unmounted — even though the
user had done nothing.

Fix:
- `<CardDialog open={!!openCardId} ... />` — drive open from the
  user's explicit intent, not from the current resolution result.
- Cache the last-known card in a ref so the `card` prop is never
  transiently null while `openCardId` is set. Ref is cleared when
  the user actually closes the dialog.

Modal.tsx and CardDialog.tsx untouched.
```

---

## Session 6 — CardDialog opts out of backdrop dismiss (2026-04-24)

One targeted change. No other files touched. Not committed.

### Fix

Earlier sessions tried to make the Modal backdrop smarter about when
to dismiss. That approach fought the symptom — a mousedown and
mouseup landing on different elements after a React re-render — and
the defensive guards could not close the gap reliably for the card
dialog, which re-renders every time Edit is clicked.

Switched strategy per the brief: the card dialog simply does not
participate in backdrop-click dismissal. It has an explicit Close
button and Escape-to-close; those are the only ways out. This is
also the correct UX for a dialog that may hold unsaved edits — an
accidental backdrop click should never lose work.

**Implementation.**

- [Modal.tsx](../src/components/modals/Modal.tsx) now accepts an
  optional `dismissOnBackdrop` prop, defaulting to `true`. When
  `false`:
  - `handleBackdropMouseUp` returns immediately and never calls
    `onClose`.
  - `armBlock` becomes a no-op — nothing reads the block-window ref
    in this mode.
  - Escape-to-close and the header's `×` Close button are unchanged
    and still dismiss the modal.
  The two existing defensive guards (`blockUntilRef`,
  `mountedAtRef`) are preserved for every other modal that opts into
  backdrop dismissal, so their spec-correct behaviour is unchanged.

- [CardDialog.tsx](../src/components/board/CardDialog.tsx) passes
  `dismissOnBackdrop={false}` to `Modal`, with a comment explaining
  the reasoning (holds unsaved edits; re-renders on Edit click).

- No other modal callsite changed. NewProject, EditProject,
  ManageColumns, AddCard, and Import still dismiss on backdrop
  click exactly as before.

### Build status

- `npx tsc -b` — passes clean.
- `npx vite build` — passes clean (main bundle essentially unchanged
  from Session 5).

### Known issues / deferred

- No changes to the deferred list. The defensive close-blocking
  guards inside `Modal.tsx` (`blockUntilRef`, `mountedAtRef`) are
  still present and still protect every modal that opts into
  backdrop dismissal; they are not load-bearing for CardDialog any
  more.

### Suggested commit message

```
fix(CardDialog): opt out of backdrop-click dismissal

Earlier defensive guards in Modal.tsx could not reliably prevent the
card dialog from flash-closing on Edit click: the state flip causes
a synchronous re-render that reshuffles the DOM between mousedown
and mouseup, and the mouseup then lands on the backdrop.

Changed strategy: give Modal an optional `dismissOnBackdrop` prop
(defaults to true) and pass false from CardDialog. The backdrop is
now purely decorative for card dialogs; users dismiss via the
explicit Close button or Escape. This is also the right UX for a
dialog that may hold unsaved edits.

No other modal callsite changed.
```

---

## Session 5 — Targeted bug fixes, round 2 (2026-04-24)

Four follow-up bug fixes. No new features. All four items in the brief
were addressed; type-check and production build both pass clean.

**Not committed** — left as a working tree change for the owner to
verify and commit manually, per the session brief.

### Fixes

**1. Edit dialog still flashing — defensive close-blocking.**

The previous target-check pattern was insufficient. The actual root
cause: a React state update inside the modal (clicking "Edit" flips
`editing` to true, which swaps the dialog content) re-renders
synchronously between `pointerdown` and `pointerup`. The browser
then fires `pointerup` on whatever element now sits at those
coordinates — which can be the backdrop, even though the user was
clicking a button inside the panel.

[Modal.tsx](../src/components/modals/Modal.tsx) now uses a two-signal
defensive guard:

- `blockUntilRef` — any `mousedown` inside the panel arms a 300 ms
  window during which backdrop dismissal is refused. The window
  comfortably outlasts the synchronous re-render, so the stray
  follow-up `pointerup` is ignored.
- `mountedAtRef` — the modal refuses to dismiss for the first 300 ms
  after it opens, a belt-and-braces guard against "the click that
  opened the modal also dismissed it" races.

Both guards combine with the existing `e.target === e.currentTarget`
check so a genuine press-and-release on the bare backdrop still
dismisses as expected.

**2. Cross-column card drag not landing.**

Two independent problems addressed:

- **DOM-level ambiguity** in [Column.tsx](../src/components/board/Column.tsx):
  `setSortableRef` (column reorder) and `setDroppableRef` (card drop
  zone) were attached to the same outer element, which meant dnd-kit
  was measuring two overlapping rects for the same column — one
  `type: 'column'`, the other `type: 'column-drop'`. Collision
  detection could resolve a card-hover to either id, and the
  downstream handler only knew how to interpret one of them.
  Split the refs: `setSortableRef` stays on the column root (covers
  the full column for reorder hit-testing); `setDroppableRef` now
  lives on the inner scrollable card-list div (strictly smaller
  rect, only fires when the pointer is inside the card area).

- **Handler fragility** in [Board.tsx](../src/components/board/Board.tsx):
  the old code distinguished card vs column-drop by pattern-matching
  `over.id.endsWith(COLUMN_DROP_SUFFIX)`, which only works for one
  of the three possible collision outcomes. Introduced
  `resolveTargetColumn(over, byColumn)` which inspects
  `over.data.current.type` first and handles all three cases —
  `'card'`, `'column-drop'`, `'column'` — plus two id-suffix and
  `findContainer` fallbacks. Both `handleDragOver` (mid-drag
  preview) and the same-column branch of `handleDragEnd` (drop
  index) use the same resolution, so behaviour is consistent.

The old fallback (ends-with-`:drop`) is kept as a safety net but is
no longer the primary decision path. The `data.type` approach is
robust against future DOM-ref changes and new registration variants.

No diagnostic `console.log` statements were left in the tree. I
cannot run the app interactively against Firebase from this
environment, so the fix was applied against the failure mode the
user diagnosed and the build verified via `npx tsc -b` + `npx vite
build`. If cards still fail to cross columns after this change, the
most useful next step is to add logs inside `resolveTargetColumn`
and observe which `overData.type` values actually arrive.

**3. Dark mode — top bar and stats bar.**

Hardcoded light-only surfaces replaced with theme-token surfaces:

- [Board.tsx](../src/components/board/Board.tsx) top bar: `bg-white
  border-slate-200` → `bg-[var(--kb-card-bg)]
  border-[var(--kb-card-border)]`. Title and subtitle text now carry
  `dark:text-slate-100` / `dark:text-slate-400` variants. The cards-
  error banner gets matching dark variants
  (`dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300`).
  The "no columns" empty-state text and the "Loading cards…"
  indicator also gain `dark:` variants.
- [StatsBar.tsx](../src/components/board/StatsBar.tsx) background:
  `bg-white/60 border-slate-200` → `bg-[var(--kb-card-bg)]
  border-[var(--kb-card-border)]`. All four `Stat` value colors
  (red / amber / default slate) plus every `Divider` and every
  label gain dark variants.
- [SortModeSelector.tsx](../src/components/board/SortModeSelector.tsx):
  the segmented control's background / border switched to the theme
  tokens; active / inactive segment text gets dark variants (`bg-
  slate-100 text-slate-700` → `... dark:bg-slate-700
  dark:text-slate-200`, inactive hover likewise).

Nothing in the board chrome now uses a hardcoded light-only surface
color. Modals remain intentionally white-panelled for now —
that's a separate surface and the user did not flag it.

**4. Firebase Auth COOP warning — switch to redirect.**

[useAuth.ts](../src/hooks/useAuth.ts) no longer imports
`signInWithPopup`. `signIn()` calls `signInWithRedirect(auth,
googleProvider)` instead — the browser navigates the full window to
Google's sign-in page, comes back to the app URL with the auth
result in the hash, and the session is restored. No popup, no
`window.close()` call, no COOP warning.

`getRedirectResult(auth)` is called once on mount (in the existing
`useEffect`) so that:
- Any error from a just-completed redirect flow (user cancelled,
  provider misconfig, etc.) surfaces as `state.error` instead of
  vanishing silently.
- A completed redirect signs the user in before
  `onAuthStateChanged` has even had a chance to fire on its own,
  closing a small race where the app would briefly render the
  sign-in screen to an about-to-be-signed-in user.

[SignInScreen.tsx](../src/components/auth/SignInScreen.tsx) required
no change — it only calls `onSignIn`, which now resolves via
redirect instead of popup. Because `signInWithRedirect` navigates
the browser away, the "Continue with Google" button's in-flight
state is effectively invisible (the app unloads within a frame), so
no loading indicator was added.

### Build status

- `npx tsc -b` — passes clean.
- `npx vite build` — passes clean (main bundle ~744 KB pre-gzip,
  ~199 KB gzipped — essentially unchanged from Session 4).

### Known issues / deferred

- No changes to the deferred list from Session 3 (bundle size,
  mid-drag snapshot lock, cross-column drop position, inactive-
  project delete blocker card count). Those remain in their
  previous state.
- Modal panel interior (inside the white surface) has not been
  migrated to theme tokens; it remains light in dark mode. This is
  intentional for now — modals have their own surface story and the
  user did not flag it. If dark-mode modals become desired, the
  work is localized to `Modal.tsx`'s panel classes and the form
  field styling inside `CardForm.tsx`.

### Suggested commit message

```
fix: modal close-guard, cross-column dnd, dark-mode chrome, redirect auth

- Modal: two-signal defensive close-blocking. Any mousedown inside
  the panel arms a 300ms block window; modal also refuses to close
  during the first 300ms after mount. Stops the edit-dialog flash-
  close caused by mousedown/mouseup landing on different elements
  after a re-render.
- Column: split the sortable ref (column root) and droppable ref
  (inner card body). Previously both were on the same element,
  causing ambiguous collision resolution between `column` and
  `column-drop` registrations.
- Board: introduce `resolveTargetColumn(over, byColumn)` that uses
  `over.data.current.type` (`card` / `column-drop` / `column`) as
  the primary discriminator, with id-suffix and findContainer
  fallbacks. Used by both `onDragOver` and the same-column branch
  of `onDragEnd`.
- Board / StatsBar / SortModeSelector: hardcoded `bg-white`,
  `border-slate-200`, light-only text colors replaced with
  `bg-[var(--kb-card-bg)]` / `border-[var(--kb-card-border)]` and
  `dark:` Tailwind variants for every text colour. Dark-mode
  chrome now matches the rest of the board.
- useAuth: `signInWithPopup` → `signInWithRedirect`. Avoids the
  Cross-Origin-Opener-Policy warning triggered by Firebase's
  `window.close()` call on the popup. `getRedirectResult` called
  once on mount to harvest the post-redirect credential and
  surface any redirect errors.
```

---

## Session 4 — Targeted bug fixes (2026-04-24)

This session is UI bug-fix-only. No new features. All six items in
the session brief were addressed; five required code changes and one
was verified as already-correct by tracing the call path.

### Fixes

**1. Inline expand duplicated collapsed content.**
[Card.tsx](../src/components/board/Card.tsx) now hides the clamped
description, truncated tag preview, and due-date line whenever
`expanded === true`. The expanded section below the action row then
shows the full versions of those fields — with no duplication — plus
the links list and the "View full card →" shortcut. Notes remain
excluded from the inline expand per spec.

**2. Card title not reliably clickable.**
[Card.tsx](../src/components/board/Card.tsx) — the title button now:
- fills the flex row (`min-w-0 flex-1`) so the entire title line is
  hit-testable, not just the glyph bounds;
- stops `pointerdown` propagation so the outer article's drag
  listeners never see a title press (clicks always resolve to
  `onOpenDialog`);
- has an explicit `cursor-pointer` class and a `hover:underline`
  hint so the affordance is visually obvious;
- uses a small negative margin with matching padding so the
  clickable area extends beyond the text baseline.

**3. Edit dialog flashed and closed.**
Root cause was exactly the user's diagnosis: the Modal's backdrop
`onMouseDown` fired for any event that bubbled up to it, even with
`stopPropagation` on the panel, because of event-timing edge cases
during the edit-mode re-render.
[Modal.tsx](../src/components/modals/Modal.tsx) now uses an explicit
target-check pattern:
- The backdrop holds a ref to itself.
- `onMouseDown` records a flag only when `e.target === backdropRef.current`.
- `onMouseUp` calls `onClose()` only when BOTH the down and up
  landed directly on the backdrop element.
- The stale `stopPropagation` on the inner panel was removed — no
  longer needed, and it was giving false confidence.
This also fixes the "text selection that ends on the backdrop"
false-dismiss that the old comment warned about.

**4. Column drag too sensitive.**
[Column.tsx](../src/components/board/Column.tsx) — a dedicated six-dot
grip icon now sits at the left of the column header. The
`useSortable` returns `setActivatorNodeRef`, which is attached to the
grip button along with `{...listeners}`; the rest of the header (title
text, count badge) is no longer a drag activator. Accidental column
reorders from miss-clicks on the header are no longer possible.

**5. Dark mode card contrast.**
Two layers of fix:
- [themes.ts](../src/lib/themes.ts) — every theme's `dark` variant
  was retuned. Surfaces now aim for a consistent contrast ladder:
  board → column header is ~+8%, board → card is ~+25%, and
  card → card border is ~+15%. Cards clearly sit above the board
  surface on every theme now.
- [Card.tsx](../src/components/board/Card.tsx) and
  [Column.tsx](../src/components/board/Column.tsx) — every piece of
  text, every tag pill, every priority badge, and every icon button
  now has matching `dark:` Tailwind variants so text remains legible
  on the darker surfaces (previously `text-slate-800` on a dark card
  background was nearly invisible).

**6. Moving a card via the edit dialog.**
No code change — traced and confirmed working. Full call chain:
- [CardForm.tsx](../src/components/modals/CardForm.tsx) `<select
  value={columnId} onChange={(e) => setColumnId(e.target.value)}>`
  updates local state as the user picks a new column.
- [CardForm.tsx handleSubmit](../src/components/modals/CardForm.tsx)
  passes `columnId` into `onSubmit({ ..., columnId, ... })`.
- [CardDialog.tsx handleSubmit](../src/components/board/CardDialog.tsx)
  forwards `values.columnId` to `updateCard(card.id, { columnId:
  values.columnId, ... })`.
- [firestore.ts updateCard](../src/lib/firestore.ts) calls
  `updateDoc(ref, { ...patch, updatedAt: serverTimestamp() })` which
  writes `columnId`. Rules pass because `userId` is unchanged in the
  patch, so both `ownsExisting()` and `ownsIncoming()` are satisfied.
- Firestore snapshot fires; `useCards` updates; `Board` re-renders;
  the card appears in its new column.

### Build status

- `npx tsc -b` — passes clean.
- `npx vite build` — passes clean (main bundle ~742 KB pre-gzip,
  ~199 KB gzipped — essentially unchanged from Session 3; the fixes
  are all token / prop tweaks).

### Known issues / deferred

- No changes to the deferred items carried over from Session 3
  (bundle size, mid-drag snapshot lock, cross-column drop position,
  inactive-project delete blocker card count). Those remain in their
  previous state.

### Suggested commit message

```
fix: targeted UI bug fixes — dialog dismissal, card clickability, dnd, dark contrast

- Modal: dismiss only when mousedown AND mouseup both land directly
  on the backdrop (target check via ref). Removes the stale
  stopPropagation on the panel that let a re-render edge case close
  the edit dialog mid-click.
- Card: inline expand no longer duplicates collapsed previews — when
  expanded, the clamped description / tag preview / due-date line
  are hidden and the expand section shows full versions plus links.
- Card: title button fills the title row, uses cursor-pointer,
  stops pointerdown so drag listeners never fire on title clicks.
- Column: dedicated grip handle drives column drag via
  setActivatorNodeRef + listeners on the handle only. Title and
  count badge no longer start drags.
- Themes: dark variants retuned for a consistent ~25% board→card
  contrast ladder. Card / Column text now carry dark: Tailwind
  variants so text stays legible on dark surfaces.
- Verified (no change): moving a card via the edit dialog's Column
  select correctly flows through CardForm → CardDialog →
  updateCard → Firestore.
```

---

## Session 3 — DnD, theming, import, toast, priority fixes (2026-04-24)

This session resolved two blocking bugs from the prior build and then
landed the remaining v1 feature set: drag-and-drop, the 8-theme
theming system, YAML import, and a shared toast notification system.
The README is now fully populated.

### Priority fixes

**1. Firestore permissions error on the cards collection.**

- Root cause: [useCards.ts](../src/hooks/useCards.ts) queried
  `where('projectId', '==', id)` with no `userId` filter. Firestore
  security rules reject a query if they cannot statically prove that
  every potential result is readable by the caller — the existing rule
  (`resource.data.userId == request.auth.uid`) required that proof, and
  without `userId` in the query filter set, the rules engine could not
  provide it.
- Fix: `useCards(userId, projectId)` — two equality filters, both
  required, both passed through from [App.tsx](../src/App.tsx). With
  `where('userId', '==', uid)` added, the rules engine can prove the
  query is constrained to the caller's data and the query is accepted.
- [createCard()](../src/lib/firestore.ts) was already stamping `userId`
  on every new card document (verified in Session 2); no change needed
  there. Firestore rules themselves were correct and needed no change.
- **No `firestore.rules` redeploy required** — the rules were fine, it
  was the query shape that was wrong.

**2. Columns not rendering on new projects.**

- Root cause: the permissions failure above propagated into the
  Board's render branch: the entire column strip was hidden and
  replaced with "Failed to load cards: …". The columns existed and
  were correctly stored in Firestore — they just were not painted
  because the card load had errored.
- Fix: [Board.tsx](../src/components/board/Board.tsx) now renders the
  column strip regardless of `cardsError`; when a load error occurs it
  appears as a small inline red banner above the columns, not as a
  full-page replacement. The "no columns" empty state is still shown
  when `columnOrder` is actually empty.

**3. Hardcoded GROUP_SUGGESTIONS removed.**

- Both [NewProjectModal](../src/components/modals/NewProjectModal.tsx)
  and [EditProjectModal](../src/components/modals/EditProjectModal.tsx)
  now derive their group-name suggestion chips from the user's own
  existing projects via a small `collectGroupNames(projects)` helper
  (case-insensitive dedupe, first-seen casing, alphabetical). Both
  modals accept a `projects` / `allProjects` prop and the App passes
  the live project list.
- No group name is hardcoded anywhere in source. Any group a user ever
  creates shows up as a one-click suggestion automatically.

### Toast notification system

- [ToastProvider.tsx](../src/components/toast/ToastProvider.tsx) — a
  small React-context-based toast stack rendered in the top-right.
  Any component can call `useToast().push(message, 'info' | 'success'
  | 'error')`. Auto-dismiss at 4 seconds (per spec), manual dismiss
  button, subtle entrance transition.
- Provider mounted at [main.tsx](../src/main.tsx) so any top-level
  component — including future error boundaries — can call `useToast`.
- Wired into the previously-silent error paths:
  - Card archive failure in [Card.tsx](../src/components/board/Card.tsx).
  - Drag-reorder / cross-column move / sort-mode-change failures in
    [Board.tsx](../src/components/board/Board.tsx).
  - Import result (success count / failure) in
    [ImportModal.tsx](../src/components/modals/ImportModal.tsx).

Other modals already surface inline errors inside their dialogs, so
those were left alone — re-toasting on top of an in-dialog error
would just double-notify.

### Drag-and-drop: cards

- Installed dependencies (from Session 1): `@dnd-kit/core`,
  `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- Architecture, top to bottom:
  ```
  <DndContext>
    <SortableContext (horizontal, columns)>
      {columns.map(<Column>)}        // each column sortable + droppable
        <SortableContext (vertical, cards)>
          {cards.map(<Card>)}        // each card sortable
        </SortableContext>
    </SortableContext>
  </DndContext>
  ```
- Each **card** registers with its column's SortableContext via
  `useSortable({ id: card.id, data: { type: 'card', columnId } })`.
  Drag listeners spread on the outer card element.
- Each **column** has two registrations: a `useSortable` for header
  drag (column reorder) and a `useDroppable` on the column body (so
  empty columns accept dropped cards). The droppable id is
  `column.id + ':drop'` — centralized via `COLUMN_DROP_SUFFIX` in
  [Column.tsx](../src/components/board/Column.tsx).
- **Sensors**: `PointerSensor` with `activationConstraint: { distance: 6 }`
  so a click on a card still opens the dialog (a drag only starts
  after the pointer has moved 6 px with the button held). Keyboard
  sensor wired via the sortable coordinate getter for accessible
  reorder.
- **Local state during drag.** Board keeps `localCardsByColumn` and
  `localColumnOrder` that mirror the Firestore-backed view when idle
  but are mutated during a drag. The sync effect gates on `isDragging`
  so a drag is not interrupted by incoming snapshots. On drop the
  change is persisted and the snapshot stream rehydrates local state.
- **Cross-column moves**: `onDragOver` splices the active card into
  the target column at the hovered position so the visual preview
  tracks the cursor. `onDragEnd` persists the final column id via
  `updateCard(cardId, { columnId })` — per spec, a cross-column move
  does NOT switch the project to custom mode, so the card's final
  position is determined by the active sort mode.
- **In-column reorders**: `onDragEnd` batches a `customOrder = i`
  write for every card in the affected column and sets the project's
  `cardSortMode` to `'custom'` — per spec, dragging within a column
  switches the project to custom order. Atomic via
  [reorderCardsInColumn()](../src/lib/firestore.ts) which uses a
  single Firestore `writeBatch`.
- Visual feedback:
  - Dragging card: `opacity: 0.5` + violet ring.
  - Column accepting a drop: violet ring.
  - Drop zone between cards: handled automatically by dnd-kit's
    sortable placeholder (items move aside during hover).

### Drag-and-drop: columns

- Outer horizontal `SortableContext` wraps the column list. Each
  column's header acts as the drag handle (listeners attached only to
  the header `<div>`, not the cards area, so card drags are never
  confused with column drags).
- On drop: `reorderColumns(project, newOrder)` (already existed in
  [firestore.ts](../src/lib/firestore.ts)) writes the new
  `columnOrder` array back to the project document and refreshes each
  column's numeric `order` field to match the new index.

### Theming system

- [themes.ts](../src/lib/themes.ts) defines all 8 themes as pairs of
  CSS-custom-property maps (light / dark). The token set matches the
  `--kb-*` variables already referenced throughout the components, so
  no component code changes when themes swap.
- Themes implemented: Default (purple), Slate, Indigo, Teal, Rose,
  Amber, Zinc, Midnight.
- `applyTheme(themeKey, mode)` writes the chosen variant's variables
  onto `document.documentElement.style` and sets `color-scheme` so
  native browser chrome (scrollbars, date pickers) picks the right
  mode.
- Persistence via [useLocalStorage](../src/hooks/useLocalStorage.ts):
  - `kanban_theme` — theme key string.
  - `kanban_color_mode` — `'light'` | `'dark'`.
- `TypeScript`-typed `ThemeColors` ensures every variant supplies
  every token — a missing key is a compile error, not a runtime
  `undefined`.
- [SettingsPopover](../src/components/settings/SettingsPopover.tsx) now
  renders:
  - Dark / Light toggle that flips between the current theme's two
    variants (previously a stub).
  - Row of 8 color swatches. Active swatch is marked with a ring.
    Clicking a swatch applies the theme immediately and closes the
    popover so the user sees the result full-screen.
- Falling back to the default theme when an unknown key is stored is
  built in (forward-compatible with future renames).

### YAML import

- [importParser.ts](../src/lib/importParser.ts) — pure module, no
  React, fully testable in isolation.
  - `parseImport(yamlText, project)` returns a discriminated result:
    either `{ ok: true, cards: ValidImportCard[] }` or
    `{ ok: false, errors: ImportError[] }`. Never throws.
  - YAML parse errors are reported as a single document-level error
    (`Card #0 · (document) · …`) so the user still gets actionable
    feedback on malformed input.
  - Validation is strict per spec: `title` required, `column` must
    match an existing column title exactly (case-sensitive), `priority`
    must be one of the four priorities, `due_date` must be a valid
    `YYYY-MM-DD` calendar date (both `due_date` and `dueDate` are
    accepted; `js-yaml` parses bare `YYYY-MM-DD` as `Date`, which we
    handle). `links` entries require both `label` and `url`.
  - All-or-nothing — errors accumulate across every card (so the user
    sees them all at once), but any error prevents the batch from
    writing.
  - `generateTemplate(project)` produces a `.yaml` string pre-filled
    with the active project's column names, priorities, a fully-
    populated example card, and a minimal-title-only example.
- [ImportModal.tsx](../src/components/modals/ImportModal.tsx) —
  - "Download import template" builds a blob URL and triggers a
    download of `<project-slug>-import-template.yaml`.
  - "Choose file" opens a hidden `<input type="file" accept=".yaml,.yml,.md">`.
  - On success: batch-write via
    [createCardsBatch()](../src/lib/firestore.ts) (a new helper that
    wraps every insert in a single `writeBatch`), toast with the
    imported count, close the dialog.
  - On validation failure: the dialog title flips to "Import failed —
    0 cards added" and the error list is rendered as monospace
    `Card #N · field · reason` lines with a "Try a different file"
    shortcut.
- Firestore rules are unchanged: every imported card carries the
  user's `uid` in its `userId` field and passes the `ownsIncoming()`
  check.

### README

- [README.md](../README.md) is now fully populated — no more TODO
  sections. Covers: overview / feature list, tech stack, project
  layout, step-by-step Firebase setup (create project → enable Google
  Auth → create Firestore → register web app → deploy rules/indexes),
  `.env` configuration, local dev scripts, Firebase Hosting
  deployment, YAML import format with validation rules, and the
  theming system.

### Build status

- `npx tsc -b` — passes clean.
- `npx vite build` — passes clean (main bundle ~741 KB pre-gzip /
  ~199 KB gzipped, up ~110 KB from Session 2 due to `@dnd-kit`,
  `js-yaml`, themes.ts, and the import machinery).
- `npx vite` dev server — "ready in 464 ms", compiles without
  warnings.

### Public-repo hygiene

- Every new file carries a module-level comment explaining intent and
  reasoning; non-obvious mechanics (multi-container sortable local-
  state pattern, `js-yaml` Date vs string handling, template blob-URL
  lifecycle) have inline rationale.
- No hardcoded group names in tracked source. No personal names,
  emails, project IDs, or organization identifiers.

---

### Suggested commit message

```
feat: session 3 — DnD, theming, YAML import, toast; fix cards query + dynamic group suggestions

- Fix Firestore permissions error: useCards now filters by userId too
  so the rules engine can prove the query is owner-scoped.
- Board renders columns even when cards fail to load; error becomes an
  inline banner instead of replacing the column strip.
- Group-name suggestions in New/Edit project dialogs are now derived
  from the user's existing projects (no hardcoded names).
- @dnd-kit multi-container sortable: drag cards within and across
  columns; drag column headers to reorder. In-column reorder switches
  the project to custom sort; cross-column move leaves sort mode
  untouched (spec).
- 8 themes (default, slate, indigo, teal, rose, amber, zinc, midnight)
  × light/dark, applied as CSS variables. Settings popover has a
  working dark/light toggle and a swatch picker.
- YAML import with per-project template download, strict all-or-
  nothing validation, and a batch write.
- Toast notification system wired into previously-silent error paths
  (archive, drag writes, sort-mode change, import result).
- README fully populated.
```

---

### Firestore manual steps required

No new manual steps this session. The query changes in `useCards` are
satisfied by Firestore's automatic single-field indexes; the existing
composite indexes in
[firestore.indexes.json](../firestore.indexes.json) remain
forward-looking for later work.

If you have not yet deployed rules from an earlier session:

```
npx firebase use <your-project-id>
npx firebase deploy --only firestore:rules
npx firebase deploy --only firestore:indexes
```

### Firebase Console steps required

No new console steps this session.

### Known issues / deferred

- **Bundle size.** 741 KB pre-gzip, 199 KB gzipped. Firebase + `js-yaml`
  + `@dnd-kit` account for most of the weight. Code-splitting (lazy
  import for ImportModal, and for Firestore initialization) is the
  obvious next optimization.
- **Mid-drag snapshot conflicts.** While the user drags a card, we
  lock local state against incoming Firestore snapshots (so another
  tab's write cannot fight the ongoing drag). If the drag lasts
  longer than a few seconds AND another session writes the same data,
  the snapshot is buffered and will apply on drag-end. For a personal
  single-user app this is benign.
- **Cross-column drop position.** Per spec, cross-column drops only
  update `columnId`; the card's final position in the new column is
  determined by the active sort mode. UX-wise this means that
  dropping a card at a specific position in another column while in
  (say) Priority mode may cause the card to snap to its priority
  position on drop. The user can switch to Custom mode first if they
  want to preserve the exact drop position.
- **Edit-project delete blocker** still reports 0 active cards for
  projects other than the currently-active one. Fix: switch that path
  to the async `countActiveCardsForProject()` helper (already in
  firestore.ts). Deferred — low-impact for a single-user app.

### Environment variables needed

Unchanged from Session 1. Six `VITE_FIREBASE_*` keys in `.env`; see
[.env.example](../.env.example) for per-key comments.

### How to run

```
npm install
npm run dev          # Vite dev server
npm run build        # Production build -> dist/
npm run lint         # tsc --noEmit typecheck
```

---

## Session 2 — Card and project management UI (2026-04-24)

This session wired the complete project, column, and card management
surface: settings popover, new/edit/delete project, manage columns,
add card, full card dialog (read + edit), inline card expand, sort
mode selector, and the archive action. Drag-and-drop, import, and
theming were deferred to Session 3.

### Completed

**Firestore CRUD layer** — extended
[firestore.ts](../src/lib/firestore.ts) with `updateProject`,
`deleteProject`, column helpers (`addColumn`, `renameColumn`,
`deleteColumn`, `reorderColumns`), `createCard`, `updateCard`,
`archiveCard`, and `countActiveCardsForProject`. Every mutation
refreshes `updatedAt` via `serverTimestamp()`.

**Sort logic** — [cardSort.ts](../src/lib/cardSort.ts) — `sortCards
(cards, mode)` returns a new, sorted array. Stable sort so ties
preserve input order. Date comparison uses the YYYY-MM-DD string
format (which sorts chronologically as text).

**Shared Modal wrapper** —
[Modal.tsx](../src/components/modals/Modal.tsx): centered panel,
backdrop-click to close, Escape to close, body scroll lock while
open, optional `wide` mode for forms.

**Settings popover** —
[SettingsPopover.tsx](../src/components/settings/SettingsPopover.tsx):
fixed bottom-left panel, outside-click + Escape dismiss, the six spec
items (import, manage columns, new project, divider, dark/light
toggle, sign out). Theme picker + color-mode toggle were stubs this
session and were wired up for real in Session 3.

**Projects** —
[NewProjectModal.tsx](../src/components/modals/NewProjectModal.tsx):
name, group (free-form text with one-click suggestions), column
preset (Simple / Dev / Custom).
[EditProjectModal.tsx](../src/components/modals/EditProjectModal.tsx):
rename, regroup, two-step delete confirm with active-card guard.
Kebab menu and right-click both added to
[ProjectItem](../src/components/sidebar/ProjectItem.tsx).

**Manage columns** —
[ManageColumnsModal.tsx](../src/components/modals/ManageColumnsModal.tsx):
inline rename, up/down reorder, add, delete (disabled with tooltip
when a column has active cards). Drag reorder in the dialog itself
remains on the future list; the up/down arrows cover the
functionality.

**Add card** —
[AddCardModal.tsx](../src/components/modals/AddCardModal.tsx) wrapping
a shared [CardForm.tsx](../src/components/modals/CardForm.tsx) with
all card fields including a chip-style tag input and a dynamic
label/URL link list.

**Card component + full dialog** —
[Card.tsx](../src/components/board/Card.tsx) replaces the earlier
placeholder. Inline expand via `···` toggle (shows description / tags
/ due date / links; notes deliberately excluded per spec). Archive
via inline popconfirm, visible only on cards in the project's last
column.
[CardDialog.tsx](../src/components/board/CardDialog.tsx) — read mode
by default, Edit button flips to CardForm edit mode (including
column-move).

**Sort mode selector + stats bar** —
[SortModeSelector.tsx](../src/components/board/SortModeSelector.tsx)
is a segmented control in the left of the stats bar. Custom mode
renders as a grayed-out "Drag to reorder" pill only when active.
[StatsBar.tsx](../src/components/board/StatsBar.tsx) hosts both the
sort selector and the round `+` add-card button.

**App orchestration** — [App.tsx](../src/App.tsx) now owns modal state
for settings, new/edit project, manage columns, add card, and card
dialog. Subscribes `useCards` once and shares the list across Board,
AddCardModal, CardDialog, and ManageColumnsModal.

### Build status (Session 2)

- `npx tsc -b` — passes clean.
- `npx vite build` — passes clean, ~632 KB pre-gzip.

---

## Session 1 — Foundation (2026-04-24)

**Project scaffold** — Vite + React 18 + TypeScript strict
([package.json](../package.json),
[tsconfig.json](../tsconfig.json),
[vite.config.ts](../vite.config.ts)). Tailwind v3 wired with CSS-
variable color tokens (`--kb-*`) pre-declared for the theming system.
`.gitignore` covers `.env`, `.firebaserc`, service-account JSON keys,
Firebase CLI cache, and `.claude/settings.local.json`. `.env.example`
ships with per-key explanations.

**Firebase layer** —
[firebase.ts](../src/lib/firebase.ts),
[firestore.ts](../src/lib/firestore.ts),
[firestore.rules](../firestore.rules) (per-user ownership enforced on
both `projects` and `cards`),
[firestore.indexes.json](../firestore.indexes.json).

**Auth** — [useAuth.ts](../src/hooks/useAuth.ts) subscribes to
`onAuthStateChanged` with `loading` gating on restoration.
[SignInScreen.tsx](../src/components/auth/SignInScreen.tsx) is the
full-screen prompt when unauthenticated.

**Data hooks** — [useProjects.ts](../src/hooks/useProjects.ts),
[useCards.ts](../src/hooks/useCards.ts) (had a bug, see Session 3
fix #1), [useLocalStorage.ts](../src/hooks/useLocalStorage.ts).

**Sidebar** —
[Sidebar.tsx](../src/components/sidebar/Sidebar.tsx) — resizable
(160–320 px drag, clamped, persisted to `kanban_sidebar_width`),
collapsible to a 48 px rail (persisted to `kanban_sidebar_collapsed`).
[ProjectItem.tsx](../src/components/sidebar/ProjectItem.tsx) — dot +
title + active accent bar. [groupColor.ts](../src/components/sidebar/groupColor.ts)
— hash-based palette (no group names hardcoded in the mapping).

**Board** —
[Board.tsx](../src/components/board/Board.tsx),
[StatsBar.tsx](../src/components/board/StatsBar.tsx),
[Column.tsx](../src/components/board/Column.tsx) (placeholder card
rendering replaced in Session 2),
[cardStats.ts](../src/lib/cardStats.ts).

**App** — [App.tsx](../src/App.tsx) composes Sidebar + Board, auto-
selects the first project, and provides an empty-dashboard fallback
for signed-in users with zero projects.

### Build status (Session 1)

- `npx tsc -b` — passes clean.
- `npx vite build` — passes clean, ~582 KB pre-gzip.

### Firebase Console checklist (one-time, still valid)

1. Enable Google Sign-In in Authentication.
2. Confirm `localhost` is in authorized domains. Add your Hosting
   domain(s) when you deploy.
3. Create the Firestore database in production mode.
4. (Optional) Firebase Hosting init — [firebase.json](../firebase.json)
   is already configured.
