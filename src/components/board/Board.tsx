// ---------------------------------------------------------------------------
// Board
//
// Main content area for a single active project. Hosts the DnD context
// that powers both card drag-and-drop and column reorder.
//
// Architecture, top to bottom:
//
//   <DndContext>
//     <SortableContext (horizontal, columns)>
//       {columns.map(col =>
//         <Column> (outer sortable, also a droppable zone for cards)
//           <SortableContext (vertical, cards for this column)>
//             {cards.map(<Card>)}  (each card is a sortable item)
//           </SortableContext>
//         </Column>
//       )}
//     </SortableContext>
//   </DndContext>
//
// Local state during a drag:
//   `localCardsByColumn` mirrors the server's cards-by-column, but is
//   mutated during a cross-column drag so the visual preview shows the
//   card in the target column BEFORE the Firestore write. When the drag
//   ends, we persist to Firestore and let the snapshot stream rehydrate
//   local state naturally.
//
//   Local state is rebuilt from Firestore props while NOT dragging (so
//   changes made elsewhere — another tab, another device — flow in).
//   While dragging we pause the sync so we do not fight the user.
//
// Write semantics (match the spec):
//   - In-column reorder: write all of that column's cards with
//     `customOrder = i`, and set the project's `cardSortMode` to
//     `'custom'`. Single batch.
//   - Cross-column move: update only the card's `columnId`. The project
//     `cardSortMode` is left untouched, so the card's position in the
//     new column is determined by the active mode.
//   - Column reorder: update the project's `columnOrder` array (and
//     refresh each column's numeric `order`).
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import type { Card as CardType, Project, SortMode } from '../../types'
import { computeStats } from '../../lib/cardStats'
import { sortCards } from '../../lib/cardSort'
import {
  reorderCardsInColumn,
  reorderColumns,
  updateCard,
  updateProject,
} from '../../lib/firestore'
import { Column, COLUMN_DROP_SUFFIX } from './Column'
import { FilterBar } from './FilterBar'
import { StatsBar } from './StatsBar'
import { ExportModal } from '../modals/ExportModal'
import { groupLabel } from '../sidebar/groupColor'
import { useToast } from '../toast/ToastProvider'

interface Props {
  project: Project
  // True when the current user owns the project. Members on a shared
  // board still get full card-level functionality (add, edit,
  // archive, drag) but their UI does not expose the column drag
  // handles or any owner-only chrome. The flag is plumbed in by App
  // from `project.isOwner`.
  isOwner: boolean
  cards: CardType[]
  cardsLoading: boolean
  cardsError: string | null
  // Auth context for the ExportModal's archived-cards subscription.
  // Threaded down from App so the modal can mount its own
  // `useArchivedCards` hook (the hook is permission-scoped — owner /
  // member queries — and matches how ArchiveDrawer is wired).
  uid: string | null
  userEmail: string | null
  onAddCard: () => void
  onOpenCard: (cardId: string) => void
  // Open the archive drawer (a slide-in panel showing archived
  // cards for this project). Pinned at the bottom of the board so
  // the entry point is discoverable without crowding the columns.
  onOpenArchive: () => void
}

// Discriminated union describing whatever is currently being dragged.
// Kept in state so callers can distinguish a card drag from a column
// drag without walking data payloads.
type ActiveDrag =
  | { type: 'card'; cardId: string; fromColumnId: string }
  | { type: 'column'; columnId: string }
  | null

export function Board({
  project,
  isOwner,
  cards,
  cardsLoading,
  cardsError,
  uid,
  userEmail,
  onAddCard,
  onOpenCard,
  onOpenArchive,
}: Props) {
  // `isOwner` is currently consumed by Column (forwarded below) to
  // gate the column-reorder grip handle. Members can still drag
  // cards within and between columns; only column-reorder is
  // owner-only since rules forbid members from changing
  // `columnOrder`.
  void isOwner // Kept here so the prop participates in destructuring
               // even before all branches consume it.
  const toast = useToast()

  // ---------- Derived (non-draggy) data ----------

  const stats = useMemo(() => computeStats(cards), [cards])

  // Dereference column IDs in the project's `columnOrder` into the
  // corresponding Column objects. `.filter(Boolean)` is a safety net
  // against stale IDs whose entry in `columns` has been removed.
  const columns = useMemo(
    () =>
      project.columnOrder
        .map((id) => project.columns[id])
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [project],
  )

  // ---------- Tag-filter state ----------
  //
  // Client-side filter that hides cards whose tags do not intersect
  // the active set. Lives in component state (not localStorage) so
  // the filter is intentionally ephemeral — switching projects or
  // reloading clears it, which matches the "narrow what I'm looking
  // at right now" intent rather than a sticky preference.
  //
  // OR semantics: a card is visible if it carries AT LEAST ONE active
  // tag. Filtering itself is applied at the card render level inside
  // each column (see Column.tsx + Card.tsx) — Board only owns the
  // state and the derived tag list.
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([])

  // Reset the active filter set when the user navigates to a different
  // project. Without this, a tag selected on Project A would carry
  // over to Project B and silently hide cards there — surprising
  // behavior given filters are scoped to "this board". The user can
  // still re-pick the same tag on the new board if it exists there.
  useEffect(() => {
    setActiveTagFilters([])
  }, [project.id])

  // Full sorted list of unique tag values used by any card on this
  // board. Spec sketches this as "iterate columns -> col.cards ->
  // card.tags"; in this codebase cards are passed as a flat array so
  // we walk that directly. Sort once for stable pill order.
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const c of cards) {
      for (const t of c.tags) set.add(t)
    }
    return Array.from(set).sort()
  }, [cards])

  // If the underlying tag pool changes (a card's tag was renamed,
  // every card with that tag was archived, the user switched
  // projects), prune any active filters that no longer correspond to
  // a real tag — otherwise the filter would silently hide every card
  // because nothing matches a tag that has ceased to exist.
  useEffect(() => {
    setActiveTagFilters((prev) => {
      if (prev.length === 0) return prev
      const valid = new Set(allTags)
      const next = prev.filter((t) => valid.has(t))
      // Reuse the previous array reference when nothing changed so
      // downstream memoization does not invalidate needlessly.
      return next.length === prev.length ? prev : next
    })
  }, [allTags])

  function toggleTagFilter(tag: string) {
    setActiveTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  function clearTagFilters() {
    setActiveTagFilters([])
  }

  // ---------- Export modal state ----------
  //
  // Open/close is owned by Board (rather than App) because the modal
  // depends on `activeTagFilters` — the filter set lives in this
  // component, so colocating the modal here avoids threading filter
  // state up to App and back down again.
  const [exportOpen, setExportOpen] = useState(false)

  // ---------- DnD local state ----------

  // `activeDrag` is what the DndContext is currently dragging. Set in
  // `onDragStart`, cleared in `onDragEnd` / `onDragCancel`.
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null)
  const isDragging = activeDrag !== null

  // Mirror of "cards bucketed by column, then sorted". Syncs from
  // Firestore props when no drag is in progress; mutated locally during
  // a drag to reflect cross-column moves.
  const [localCardsByColumn, setLocalCardsByColumn] = useState<
    Record<string, CardType[]>
  >({})

  // Keep a stable copy of the last-synced state, for diffing at drop
  // time against what the user ended up with.
  const lastSyncedRef = useRef<Record<string, CardType[]>>({})

  // Local copy of column order. Same sync rules as above.
  const [localColumnOrder, setLocalColumnOrder] = useState<string[]>([])

  // Rebuild local state from Firestore props when not dragging. This is
  // the single source of truth for layout when idle; during a drag it
  // is held frozen.
  useEffect(() => {
    if (isDragging) return

    const map: Record<string, CardType[]> = {}
    for (const col of columns) map[col.id] = []
    for (const c of cards) {
      if (map[c.columnId]) map[c.columnId].push(c)
    }
    for (const colId of Object.keys(map)) {
      map[colId] = sortCards(map[colId], project.cardSortMode)
    }

    setLocalCardsByColumn(map)
    lastSyncedRef.current = map
    setLocalColumnOrder(project.columnOrder.slice())
  }, [cards, columns, project.cardSortMode, project.columnOrder, isDragging])

  // ---------- DnD handlers ----------

  // Sensors:
  //   - Pointer sensor with `distance: 6px` activation constraint so a
  //     plain click on a card (opens the dialog) does not become a drag.
  //   - Keyboard sensor using the sortable coordinate getter so
  //     keyboard reorder is consistent with the pointer drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragStart(e: DragStartEvent) {
    const data = e.active.data.current as { type?: string; columnId?: string } | undefined
    if (data?.type === 'card') {
      setActiveDrag({
        type: 'card',
        cardId: String(e.active.id),
        fromColumnId: data.columnId ?? '',
      })
    } else if (data?.type === 'column') {
      setActiveDrag({ type: 'column', columnId: String(e.active.id) })
    }
  }

  // Mid-drag cross-column move. Only relevant for card drags — column
  // drags are handled entirely in `onDragEnd`.
  //
  // Target-column resolution is driven by the `data.type` payload each
  // sortable / droppable registers with dnd-kit. This is more robust
  // than pattern-matching the id string because the same id can show
  // up for multiple registrations — the column root registers as
  // `{ type: 'column' }` for the outer horizontal sortable, and the
  // column body registers as `{ type: 'column-drop', columnId }` for
  // card drops. Explicit type discrimination means ambiguous collision
  // results never fall through silently.
  function handleDragOver(e: DragOverEvent) {
    if (activeDrag?.type !== 'card') return
    const { active, over } = e
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)

    // Resolve source container by finding the column that currently
    // contains the active card in local state.
    const sourceCol = findContainer(localCardsByColumn, activeId)
    if (!sourceCol) return

    const targetCol = resolveTargetColumn(over, localCardsByColumn)
    if (!targetCol || targetCol === sourceCol) return

    // Splice the card out of the source list and into the target list
    // at the hovered position (end of list if over an empty column).
    setLocalCardsByColumn((prev) => {
      const sourceList = prev[sourceCol] ?? []
      const targetList = prev[targetCol] ?? []

      const movingCard = sourceList.find((c) => c.id === activeId)
      if (!movingCard) return prev

      // If the pointer landed on another card, insert at that card's
      // index. Otherwise (column-drop, column sortable) append.
      const overIndex = targetList.findIndex((c) => c.id === overId)
      const insertAt = overIndex >= 0 ? overIndex : targetList.length

      return {
        ...prev,
        [sourceCol]: sourceList.filter((c) => c.id !== activeId),
        [targetCol]: [
          ...targetList.slice(0, insertAt),
          { ...movingCard, columnId: targetCol },
          ...targetList.slice(insertAt),
        ],
      }
    })
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    const drag = activeDrag
    // Clear active drag immediately so the `useEffect` above will
    // re-sync local state once we return control to React.
    setActiveDrag(null)

    if (!drag) return

    if (drag.type === 'column') {
      // Column reorder: active and over are column IDs (or null).
      if (!over || active.id === over.id) return
      const oldIndex = localColumnOrder.indexOf(String(active.id))
      const newIndex = localColumnOrder.indexOf(String(over.id))
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return

      const newOrder = arrayMove(localColumnOrder, oldIndex, newIndex)
      setLocalColumnOrder(newOrder)
      try {
        await reorderColumns(project, newOrder)
      } catch (err) {
        toast.push(
          err instanceof Error ? err.message : 'Could not reorder columns.',
          'error',
        )
      }
      return
    }

    // --- Card drag end ---

    const cardId = drag.cardId
    const sourceCol = drag.fromColumnId
    const currentCol = findContainer(localCardsByColumn, cardId)
    if (!currentCol) return

    // Finalize in-column ordering: if the drag ended over another card
    // inside the same column, swap into that card's index. Use
    // `data.type` instead of id pattern-matching to decide between
    // "dropped on a card" and "dropped on the column's empty area".
    if (over && currentCol === sourceCol) {
      const overData = over.data.current as
        | { type?: string; columnId?: string }
        | undefined
      const list = localCardsByColumn[currentCol] ?? []
      const oldIndex = list.findIndex((c) => c.id === cardId)

      let newIndex = oldIndex
      if (overData?.type === 'card') {
        const idx = list.findIndex((c) => c.id === String(over.id))
        if (idx >= 0) newIndex = idx
      } else {
        // `column-drop`, `column`, or any other target — append to end.
        newIndex = list.length - 1
      }

      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        const reordered = arrayMove(list, oldIndex, newIndex)
        setLocalCardsByColumn((prev) => ({ ...prev, [currentCol]: reordered }))
        try {
          await reorderCardsInColumn(
            project.id,
            reordered.map((c) => c.id),
          )
        } catch (err) {
          toast.push(
            err instanceof Error ? err.message : 'Could not reorder cards.',
            'error',
          )
        }
      }
      return
    }

    // Cross-column finalization: just persist the new columnId. The
    // card's position within the new column follows the active sort
    // mode — per spec, cross-column drops do not switch to custom mode.
    if (currentCol !== sourceCol) {
      try {
        await updateCard(cardId, { columnId: currentCol })
      } catch (err) {
        toast.push(
          err instanceof Error ? err.message : 'Could not move card.',
          'error',
        )
      }
    }
  }

  function handleDragCancel() {
    setActiveDrag(null)
  }

  // ---------- Non-DnD board handlers ----------

  async function handleChangeSortMode(mode: SortMode) {
    if (mode === project.cardSortMode) return
    try {
      await updateProject(project.id, { cardSortMode: mode })
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : 'Could not change sort mode.',
        'error',
      )
    }
  }

  // Last column (archive-icon visibility). Reads `localColumnOrder`
  // while dragging columns so the archive icon stays consistent with
  // the visible order during reorder.
  const lastColumnId =
    localColumnOrder.length > 0
      ? localColumnOrder[localColumnOrder.length - 1]
      : null

  // Build the column render list from the local order so column DnD
  // preview is reflected visually.
  const orderedColumns = useMemo(
    () =>
      localColumnOrder
        .map((id) => columns.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [localColumnOrder, columns],
  )

  // ---------- Export-scope derived data ----------
  //
  // `exportVisibleCards` is the "Current view" payload: cards that
  // pass the active tag filter (OR-logic: a card is visible iff it
  // shares at least one tag with the active set), traversed in
  // column-then-card order so the resulting file groups cards by
  // column even though the export format is flat.
  //
  // The empty-filter case short-circuits to the full ordered list,
  // matching the user's mental model of "current view" — when no
  // filter is on, current view is the whole board.
  //
  // We pull from `localCardsByColumn` rather than the raw `cards`
  // array so the export reflects the user's actual ordering inside
  // each column (custom-sort drag results, sort-mode-applied order,
  // etc.). `localCardsByColumn` is rebuilt from `cards` when not
  // dragging, so it is always the right source for a static export.
  const exportVisibleCards = useMemo(() => {
    const filterSet =
      activeTagFilters.length > 0 ? new Set(activeTagFilters) : null
    const out: CardType[] = []
    for (const colId of localColumnOrder) {
      const list = localCardsByColumn[colId] ?? []
      for (const card of list) {
        if (!filterSet) {
          out.push(card)
          continue
        }
        // OR semantics: include if any of the card's tags appears in
        // the filter set. Mirrors the per-column visibility check
        // inside Column.tsx.
        for (const t of card.tags) {
          if (filterSet.has(t)) {
            out.push(card)
            break
          }
        }
      }
    }
    return out
  }, [activeTagFilters, localCardsByColumn, localColumnOrder])

  // Same column-then-card walk, but ignoring the filter. Used by the
  // "All cards" scope.
  const exportAllCards = useMemo(() => {
    const out: CardType[] = []
    for (const colId of localColumnOrder) {
      const list = localCardsByColumn[colId] ?? []
      for (const card of list) out.push(card)
    }
    return out
  }, [localCardsByColumn, localColumnOrder])

  return (
    <main className="relative flex h-full flex-1 flex-col overflow-hidden bg-[var(--kb-board-bg)]">
      {/* Top bar — project title + group subtitle. Uses the card surface
          theme token for its background so it picks up whatever the
          active theme defines for card backgrounds (and darkens
          correctly in dark mode). */}
      <header className="flex flex-col gap-0.5 border-b border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-6 py-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {project.title}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {groupLabel(project.group)} · Kanban board
        </p>
      </header>

      <StatsBar
        stats={stats}
        sortMode={project.cardSortMode}
        onChangeSortMode={handleChangeSortMode}
        onAddCard={onAddCard}
        onOpenExport={() => setExportOpen(true)}
      />

      {/* Tag-filter bar. Hidden when the project has no tagged cards
          at all — there is nothing to filter by, and a perpetually
          empty bar would just be visual noise. The bar itself
          handles its own scrollbar / overflow so the rest of the
          board layout is unaffected by long tag lists. */}
      {allTags.length > 0 && (
        <FilterBar
          allTags={allTags}
          activeTagFilters={activeTagFilters}
          onToggleTag={toggleTagFilter}
          onClear={clearTagFilters}
        />
      )}

      {cardsError && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          Failed to load cards: {cardsError}
        </div>
      )}

      {/* Board columns horizontal scroll surface. Uses `kb-scroll-thin`
          (the same utility as the FilterBar above) so both scrollbars
          on this view look identical and remain visible across every
          theme + light/dark mode. */}
      <div className="kb-scroll-thin min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        {columns.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
            This project has no columns. Add one from "Manage columns".
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={localColumnOrder}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex h-full gap-3 px-4 pb-4 pt-4">
                {cardsLoading && !cardsError && (
                  <div className="absolute right-6 top-20 text-xs text-slate-400 dark:text-slate-500">
                    Loading cards…
                  </div>
                )}
                {orderedColumns.map((col) => (
                  <Column
                    key={col.id}
                    column={col}
                    cards={localCardsByColumn[col.id] ?? []}
                    isLastColumn={col.id === lastColumnId}
                    isOwner={isOwner}
                    activeTagFilters={activeTagFilters}
                    onOpenCard={onOpenCard}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Archive entry point. Sits at the bottom of the board, below
          the columns scroll region. Plain muted link rather than a
          button so it does not compete visually with primary
          actions; the same action also lives in the settings popover
          for users who never look down here. */}
      <div className="border-t border-[var(--kb-card-border)] bg-[var(--kb-board-bg)] py-2">
        <button
          type="button"
          onClick={onOpenArchive}
          className="mx-auto block text-xs text-[var(--kb-text-muted)] hover:text-[var(--kb-text-secondary)]"
        >
          View archived cards
        </button>
      </div>

      {/* Export dialog. Mounted inside Board (not App) so the modal
          can read the active tag filter directly. The two derived
          card lists are computed unconditionally above — cheap, and
          keeping them in the render path means Board re-derives them
          when filters or card data shift, so the modal sees the
          freshest snapshot the moment the user opens it. */}
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        project={project}
        visibleCards={exportVisibleCards}
        allCards={exportAllCards}
        uid={uid}
        userEmail={userEmail}
      />
    </main>
  )
}

/**
 * Find which column currently contains the given card id in local state.
 * Returns null if the id is not a card in any column (e.g. it is a
 * column id or a droppable sentinel).
 */
function findContainer(
  byColumn: Record<string, CardType[]>,
  id: string,
): string | null {
  for (const [colId, list] of Object.entries(byColumn)) {
    if (list.some((c) => c.id === id)) return colId
  }
  return null
}

// Minimal shape of a dnd-kit `over` object — we only need the id and
// the data payload. Keeping a narrow interface here avoids importing
// the whole dnd-kit type surface and pins us to the fields we actually
// read.
interface DndOver {
  id: string | number
  data: {
    current?: { type?: string; columnId?: string } | undefined
  }
}

/**
 * Resolve which column a card-drag is currently over.
 *
 * Three cases, in order of precedence:
 *
 *   1. Over another card → data.type === 'card', data.columnId holds
 *      the target column.
 *   2. Over a column's empty body (our useDroppable registration) →
 *      data.type === 'column-drop', data.columnId holds the target.
 *   3. Over a column's header / sortable handle → data.type === 'column'
 *      and `over.id` IS the column id.
 *
 * Two fallback paths are kept for safety:
 *   - Id ending in `:drop` → strip the suffix (handles the case where
 *     data payload is somehow missing).
 *   - `findContainer` lookup by card id (handles the case where
 *     data.type is 'card' but data.columnId is stale).
 *
 * Returns null when the target cannot be resolved.
 */
function resolveTargetColumn(
  over: DndOver,
  byColumn: Record<string, CardType[]>,
): string | null {
  const overData = over.data.current
  const overId = String(over.id)

  if (overData?.type === 'card' && overData.columnId) {
    return overData.columnId
  }
  if (overData?.type === 'column-drop' && overData.columnId) {
    return overData.columnId
  }
  if (overData?.type === 'column') {
    return overId
  }

  // Fallbacks for unusual cases.
  if (overId.endsWith(COLUMN_DROP_SUFFIX)) {
    return overId.slice(0, -COLUMN_DROP_SUFFIX.length)
  }
  return findContainer(byColumn, overId)
}
