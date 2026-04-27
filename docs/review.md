# Code Review — 2026-04-25

## Summary

This is a well-engineered personal Kanban app that reads like production code: consistent
module structure, thorough explanatory comments where the "why" is non-obvious, a sound
Firestore security model, and a thoughtfully layered theming system. The multi-session
CardDialog flash-close investigation produced an unusually detailed paper trail and leaves
the fix well-justified and robust. The main issues are two exported Firestore helper
functions that carry the same broken query pattern that Session 3 diagnosed and fixed in
`useCards` — they will error with a permissions failure if called. There is also a missing
URL-scheme check on card links that allows a `javascript:` URL to be imported and rendered
as a clickable anchor. The SettingsPopover was missed during the Session 11 dark-mode
migration and renders light-only colors regardless of theme. Several module-level comments
are stale leftovers from earlier sessions. None of this prevents the app from functioning
for its stated purpose, but the two broken helper functions are a genuine latent defect
that should be fixed before the codebase is shared.

---

## Critical Findings

### CF-1: `countActiveCardsForProject` will always throw a permissions error

**File:** [`src/lib/firestore.ts:418`](../src/lib/firestore.ts)

**Issue:** The query filters only on `projectId` — no `userId` filter. Firestore's rules
engine cannot statically prove that every document the query could return belongs to the
caller (`resource.data.userId == request.auth.uid`), so the query is rejected with
"Missing or insufficient permissions." This is the exact same root cause diagnosed and
fixed in Session 3 for `useCards`. The function is exported and ready to be called; the
comment in `results.md` acknowledges that it _should_ be wired into `EditProjectModal` for
the non-active-project case. A developer who follows that suggestion will hit a confusing
runtime error with no compile-time indication of the problem.

```ts
// Current (broken):
const q = query(cardsCol, where('projectId', '==', projectId))

// Fix: add the userId equality filter (caller must pass userId):
const q = query(
  cardsCol,
  where('userId', '==', userId),
  where('projectId', '==', projectId),
)
```

**Suggestion:** Add a `userId: string` parameter and the matching `where('userId', '==',
userId)` clause. Update the JSDoc to document the parameter. Then wire it into
`App.tsx`'s `editingProjectActiveCardCount` memo so that editing non-active projects
shows the correct card count.

---

### CF-2: `archiveCardsInColumn` will always throw a permissions error

**File:** [`src/lib/firestore.ts:436`](../src/lib/firestore.ts)

**Issue:** Identical problem to CF-1. The query filters only on `projectId` and `columnId`
— no `userId` — so Firestore rejects it. The function is exported as a public API
("exposed for completeness") and will fail for any authenticated caller.

```ts
// Current (broken):
const q = query(
  cardsCol,
  where('projectId', '==', projectId),
  where('columnId', '==', columnId),
)

// Fix:
const q = query(
  cardsCol,
  where('userId', '==', userId),  // add this
  where('projectId', '==', projectId),
  where('columnId', '==', columnId),
)
```

**Suggestion:** Add a `userId: string` parameter and the `userId` filter, consistent with
every other multi-document card query in the codebase. If this function is not yet used,
mark it with a `// TODO: not yet called — wire up before use` comment as a minimum guard.

---

### CF-3: `javascript:` URLs pass import validation and render as clickable anchors

**File:** [`src/lib/importParser.ts:305`](../src/lib/importParser.ts),
[`src/components/board/Card.tsx:248`](../src/components/board/Card.tsx),
[`src/components/board/CardDialog.tsx:295`](../src/components/board/CardDialog.tsx)

**Issue:** The import validator checks that `url` is a non-empty string but does not
check its scheme. A YAML file containing `url: "javascript:alert(document.cookie)"` will
pass validation and be stored in Firestore. The card is then rendered with:

```tsx
<a href={l.url} target="_blank" rel="noreferrer">
```

`rel="noreferrer"` prevents opener access but does not block `javascript:` execution —
clicking such a link runs the script in the current page's context. For a single-user
personal app this is self-XSS, but if the user imports files generated or provided by
anyone else (e.g. a team member, an AI assistant, a shared template), the risk is real.

**Suggestion:** In `importParser.ts`, add a protocol allow-list check after the format
regex:

```ts
const ALLOWED_SCHEMES = /^https?:\/\//i
if (!ALLOWED_SCHEMES.test(url.trim())) {
  errors.push({ cardIndex: idx, field: `links[${j}].url`,
    reason: 'URL must start with http:// or https://' })
  return
}
```

Apply the same check in `CardForm.tsx`'s submit handler for the add/edit path (the
`<input type="url">` browser validation is bypassed if the field value is set
programmatically).

---

## Minor Findings

### MF-1: `SettingsPopover` was missed in the Session 11 dark-mode migration

**File:** [`src/components/settings/SettingsPopover.tsx:103`](../src/components/settings/SettingsPopover.tsx)

**Issue:** The popover panel and all its children still use hardcoded light-mode values:
`bg-white`, `border-slate-200`, `text-slate-700`, `text-slate-400`, `hover:bg-slate-100`,
`bg-slate-200` (divider). Session 11 migrated every modal to `var(--kb-*)` tokens, but
the popover was not touched. In dark mode or on any non-default theme, the popover
appears as a bright white card against the themed board — visually jarring and
inconsistent with the rest of the UI.

**Suggestion:** Replace hardcoded classes following the same mapping used in the modal
migration:
- `bg-white` → `bg-[var(--kb-card-bg)]`
- `border-slate-200` → `border-[var(--kb-card-border)]`
- `text-slate-700` / `hover:bg-slate-100` → `text-[var(--kb-text-secondary)]` /
  `hover:bg-[var(--kb-board-bg)]`
- `text-slate-400` → `text-[var(--kb-text-muted)]`
- Divider `bg-slate-200` → `bg-[var(--kb-card-border)]`

---

### MF-2: `collectGroupNames` is duplicated verbatim across two files

**Files:** [`src/components/modals/NewProjectModal.tsx:257`](../src/components/modals/NewProjectModal.tsx),
[`src/components/modals/EditProjectModal.tsx:233`](../src/components/modals/EditProjectModal.tsx)

**Issue:** The function body, JSDoc comment, and type signature are byte-for-byte
identical. Any change to the dedup/sort behavior requires editing two files.

**Suggestion:** Extract to a shared location — either `src/lib/projectUtils.ts` or inline
into a sibling `src/components/modals/utils.ts`. Both modals import from there. Four
lines of change.

---

### MF-3: `parseISODate` and `formatDate` are duplicated between `Card.tsx` and `CardDialog.tsx`

**Files:** [`src/components/board/Card.tsx:366`](../src/components/board/Card.tsx),
[`src/components/board/CardDialog.tsx:344`](../src/components/board/CardDialog.tsx)

**Issue:** Both files contain identical `parseISODate` implementations; `formatDate`
differs only in whether it displays the year for the current year. `startOfToday` in
`Card.tsx` duplicates the same pattern as `startOfDay` in `cardStats.ts`.

**Suggestion:** Move `parseISODate` and both `formatDate` variants to `src/lib/dateUtils.ts`.
`cardStats.ts` can also import the shared `parseISODate` instead of its own copy.

---

### MF-4: `CardForm`'s re-seed `useEffect` is both fragile and currently dead code

**File:** [`src/components/modals/CardForm.tsx:79`](../src/components/modals/CardForm.tsx)

**Issue:** The effect re-seeds all form fields when `initial?.title` or `initial?.columnId`
changes. The `eslint-disable-next-line react-hooks/exhaustive-deps` comment acknowledges
the intentional incomplete dependency list. In practice, because `CardDialog` uses
`key={openCardId}` the entire `CardForm` remounts on each open — the re-seed effect never
fires in the happy path. It would silently not run if a user opened the same card's dialog
twice without closing (impossible in the current UI), or if the title happened to match
across two different cards. The effect is dead code under the current architecture, and
its presence misleads a future reader into thinking there is a scenario where the form
must be reset in-place.

**Suggestion:** Either remove the effect entirely (documenting that the `key` prop in
`CardDialog` handles the reset) or rename the suppressed comment to explain why the
reduced deps are safe. If removed, verify no regression in `AddCardModal`'s use path
(which does not remount on repeated opens of the same dialog).

---

### MF-5: Several module-level comments are stale

**Files:**

- [`src/App.tsx:23`](../src/App.tsx) — The module-level comment at the top of `App.tsx`
  still contains point 4: `"Dark / light mode. The toggle is a stub this session...
  The CSS variables themselves remain in light-mode values until theming lands."` Theming
  fully landed in Session 3 and Session 11. The comment describes a state that no longer
  exists.

- [`src/lib/firebase.ts:38`](../src/lib/firebase.ts) — The `googleProvider` JSDoc says
  "`signInWithPopup` accepts either a fresh or a reused provider." `signInWithPopup` was
  replaced by `signInWithRedirect` in Session 5. The comment refers to a function that is
  no longer called.

- [`src/lib/firestore.ts:306`](../src/lib/firestore.ts) — The `CardPatch` block comment
  says `updateCard` is "used by the card dialog's edit mode and by **future** drag-and-drop
  handlers." Drag-and-drop was implemented in Session 3; this is no longer future work.

**Suggestion:** Update or remove these three comments. The `App.tsx` stub text is the most
likely to confuse a new contributor reading the file top-down.

---

### MF-6: `EmptyDashboard` uses hardcoded light-mode text colors

**File:** [`src/App.tsx:304`](../src/App.tsx)

**Issue:** The empty-state component renders `text-slate-800`, `text-slate-500`, and
`text-slate-400` without theme-variable equivalents or `dark:` variants. A user who
creates their first project in dark mode will see dark text on a dark `--kb-board-bg`
background with poor contrast until they have a project to switch to.

**Suggestion:** Replace with `text-[var(--kb-text-primary)]`, `text-[var(--kb-text-secondary)]`,
and `text-[var(--kb-text-muted)]` respectively — consistent with every other surface in
the app.

---

### MF-7: Link list items use array-index keys

**Files:** [`src/components/board/Card.tsx:246`](../src/components/board/Card.tsx),
[`src/components/board/CardDialog.tsx:290`](../src/components/board/CardDialog.tsx),
[`src/components/modals/CardForm.tsx:295`](../src/components/modals/CardForm.tsx)

**Issue:** All three files use `key={i}` for link list items. In `Card.tsx` and
`CardDialog.tsx` the lists are display-only, so there is no functional bug. In
`CardForm.tsx` the list is mutable — items can be removed — and the controlled inputs are
re-keyed correctly by React (since they're controlled, there is no local state to lose).
Still, index keys are a recognised code smell that will cause subtle bugs if the list ever
gains drag reorder, animations, or per-item local state.

**Suggestion:** Use `${l.url}-${i}` as a key for the display lists (close enough for
read-only rendering), and `useId`-seeded keys for the form rows. Alternatively, store
links in the form as `{ id: string; label: string; url: string }[]` and use the stable id
as key — the same pattern used for columns.

---

### MF-8: `firestore.indexes.json` third index lacks `userId`

**File:** [`firestore.indexes.json`](../firestore.indexes.json)

**Issue:** The third declared index (`projectId + columnId + customOrder`) does not
include `userId`. Any future query using this index will face the same permissions
rejection that Session 3 diagnosed: the rules engine cannot prove the query is
owner-scoped without a `userId` equality filter. The composite index is forward-looking
(per README), but as written it cannot be used safely.

**Suggestion:** Add `userId` as the first field: `userId (ASC) + projectId (ASC) +
columnId (ASC) + customOrder (ASC)`. The index is not currently deployed for production
reads, so this is a change to a declaration file only.

---

### MF-9: LICENSE file is missing

**File:** README.md line 252

**Issue:** The README says `"MIT — see LICENSE if present, otherwise treat the repository
as All Rights Reserved."` No `LICENSE` file exists in the repository. The repository
states it is public and contributions are welcome; without a license, the default is All
Rights Reserved — fork and reuse are legally ambiguous.

**Suggestion:** Add an MIT `LICENSE` file (a single-file change; the SPDX template is
one search away) or clarify the README to say "All Rights Reserved" if that is the
intent.

---

### MF-10: Toast `setTimeout` handles are never cleared

**File:** [`src/components/toast/ToastProvider.tsx:59`](../src/components/toast/ToastProvider.tsx)

**Issue:** Auto-dismiss is scheduled with `window.setTimeout` but the returned handle is
discarded. If the provider unmounts before the timer fires (e.g., during HMR in dev), the
callback runs on an unmounted component. React 18 removed the `setState-on-unmounted`
warning, so this is silent. For a provider that lives the entire app lifetime this is
harmless, but it prevents any future scenario where the provider could be conditionally
mounted (e.g., tests that render and unmount the full tree).

**Suggestion:** Store the handle in a `useRef`-backed set and clear all pending timers on
unmount:

```ts
const timers = useRef(new Set<number>())

// in push():
const handle = window.setTimeout(() => {
  timers.current.delete(handle)
  setToasts(...)
}, DISMISS_MS)
timers.current.add(handle)

// cleanup:
useEffect(() => () => timers.current.forEach(clearTimeout), [])
```

---

## Positive Observations

**Firestore security model is correct and complete.** The rules enforce both the
pre-write (`ownsExisting`) and post-write (`ownsIncoming`) halves on updates, preventing
ownership transfer. The `userId` filter in every live subscription query is also correct
— the decision to document _why_ it is needed (rules-engine static analysis) is exactly
the comment a new contributor would need. This is a common pitfall and it was handled
right from the start (and re-diagnosed and fixed correctly in Session 3).

**The CardDialog flash-close investigation is exemplary.** Sessions 5–10 produced a
complete written record of every wrong hypothesis, what was tried, why it was kept or
reverted, and finally the real root cause (React 18 sync-flush + DOM node reuse across
conditional renders). The final fix — distinct `key` props on footer buttons — is minimal
and correct. The defensive layers kept from earlier sessions are individually justified.
Any senior engineer would be satisfied with that root-cause writeup.

**Theme system is well-structured.** Defining `ThemeColors` as a TypeScript interface
means a missing token in any theme variant is a compile error, not a runtime `undefined`.
The `applyTheme` function writes to `document.documentElement.style` in a single loop,
and setting `color-scheme` keeps native browser chrome in sync — both are non-obvious
details that were done correctly. The fallback trio in `index.css` prevents a flash of
unstyled text before the first `applyTheme` call.

**The DnD collision resolution is robust.** `resolveTargetColumn` uses `data.current.type`
as the primary discriminator (typed payload, not string matching) and falls back
progressively to id-suffix and `findContainer`. The split of `setSortableRef` (column root)
and `setDroppableRef` (inner card body) onto different DOM elements — with a detailed
comment explaining the original collision ambiguity — shows careful dnd-kit knowledge.

**Import parser is cleanly separated.** `parseImport` is a pure function (no React, no
Firestore) that returns a discriminated result type, accumulates all errors before
returning, and handles the `js-yaml` Date-vs-string ambiguity for unquoted dates. It is
the most immediately unit-testable module in the codebase.

**Error handling coverage is good.** Every Firestore write in the UI layer is wrapped in
try/catch and routes to either an inline error state or a toast. The `cardsError` banner
is shown inline (not as a full page replacement), so a temporary read failure does not
hide the board. Silent failures from earlier sessions were addressed in Session 3 by
wiring in `useToast`.

**`useLocalStorage` is the right shape.** Initializing from storage in the `useState`
lazy initializer avoids a render with the default value. The `useEffect` for persistence
only fires on value change. The typed generic + `as const` return keep the caller's
destructured types correct. Write failures are swallowed silently with no disruption to
in-memory state.

**Sidebar resize is implemented correctly.** Attaching `mousemove`/`mouseup` to
`document` (not the element) and using a `ref` (not state) for the `dragging` flag
avoids the two most common failure modes: drag escaping the element boundary and
unnecessary re-renders during the mouse move.

---

## Test Coverage Recommendations

The deliberate no-tests decision for v1 is reasonable. If tests are added in v2, these
areas will return the highest value per test written:

**`importParser.ts` — highest priority.** It is already a pure function with no
side effects. A test suite covering happy-path batch import, each individual validation
error (missing title, bad column name, bad priority, bad date format, February 29 on a
non-leap-year, `javascript:` URL), and YAML parse failure would give strong regression
coverage for the most user-visible error path. The `generateTemplate` function can be
snapshot-tested.

**`cardSort.ts` and `cardStats.ts`.** Both are pure and take typed inputs. Priority sort,
null-priority tie-breaking, date sort with nulls last, `dueThisWeek` vs `overdue`
boundary at exactly midnight — all deterministic, all easy to parameterize.

**`firestore.ts` converters (`projectFromDoc`, `cardFromDoc`).** A set of unit tests
that pass partial/missing document data and assert the correct defaults are applied would
guard against future schema changes silently breaking older documents.

**`useCards` and `useProjects` hooks.** Integration tests with the Firestore emulator
would give confidence that the `userId` equality filter constraint continues to satisfy
the rules engine after any future rule changes. This is the class of regression that a
pure unit test cannot catch.

**`Board.tsx` drag-and-drop handlers.** `resolveTargetColumn` and the in-column vs.
cross-column branch in `handleDragEnd` are the most complex pure-logic paths in the UI.
They could be extracted and unit-tested independent of React / dnd-kit rendering with
lightweight mocks of the `over` object shape.

---

## Summary Scorecard

| Area | Score | Justification |
|---|---|---|
| Code Quality | 4/5 | Clean, consistent, well-commented. Deducted one point for the two broken exported helpers (CF-1, CF-2) and the five instances of duplicated date/group utilities (MF-2, MF-3). |
| Security | 3/5 | Firestore rules are correct and well-designed. Deducted two points: CF-1 and CF-2 are latent broken queries in exported functions, and CF-3 allows `javascript:` URL injection through the import path — both are genuine defects, not just theoretical risks. |
| Error Handling | 4/5 | All interactive write paths have try/catch and user-visible feedback. The one deduction is for the two broken helpers that would silently surface a cryptic permissions error if called. |
| Documentation | 4/5 | Module-level comments are thorough and accurate for the vast majority of the codebase. Deducted one point for three stale comments in `App.tsx`, `firebase.ts`, and `firestore.ts` that describe superseded behavior (MF-5). |
| Public Repo Hygiene | 4/5 | `.gitignore` is comprehensive, `.env.example` is complete and well-annotated, no personal identifiers in tracked files, `.firebaserc` is excluded. Deducted one point for the missing `LICENSE` file that the README acknowledges and defers (MF-9). |
| Architecture | 5/5 | The component hierarchy is clean and consistent. Data flow is unidirectional. The hooks/lib/component separation is well-enforced. The modal orchestration pattern (owned in `App.tsx`, triggered via callbacks) scales cleanly to the current feature set. Theme tokens, DnD local state, and the CardDialog mount invariant are all designed thoughtfully. |