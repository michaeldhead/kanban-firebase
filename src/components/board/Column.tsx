// ---------------------------------------------------------------------------
// Column
//
// A single vertical lane on the board. Renders its title and card count
// in a header followed by the cards (or an empty state).
//
// Drag-and-drop integration:
//
//   - The column participates in the board's outer (horizontal)
//     SortableContext for column reordering. A dedicated GRIP HANDLE
//     at the left of the header is the drag activator — the title
//     text and the card-count badge are NOT draggable. `setActivator
//     NodeRef` + `{...listeners}` live only on the grip button.
//
//   - The column hosts its own inner (vertical) SortableContext for
//     the cards inside. Cards ARE the sortable items.
//
//   - The column body (the scrollable card-list area) is separately
//     registered as a `useDroppable` so that empty columns accept
//     cards dropped on their body. CRITICALLY, the sortable (column
//     root) ref and the droppable (card-body) ref point to DIFFERENT
//     DOM elements. Registering them on the same element caused
//     collision detection to be ambiguous — dnd-kit could resolve a
//     card-over-column hover to either the card or the column-drop
//     id, depending on registration order, breaking cross-column
//     card moves. Separating the rects (card body is a rect strictly
//     smaller than the column root) removes the ambiguity.
// ---------------------------------------------------------------------------

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card as CardType, Column as ColumnType } from '../../types'
import { Card } from './Card'

// Suffix appended to a column's id to form its droppable id. Centralizing
// the suffix here keeps the Board's handlers and the column in sync.
export const COLUMN_DROP_SUFFIX = ':drop'

interface Props {
  column: ColumnType
  cards: CardType[]
  // True when this column is the last in the project's `columnOrder`.
  // Passed down so cards know whether to show the archive icon.
  isLastColumn: boolean
  // True when the current user owns the parent project. Members
  // (isOwner=false) cannot reorder columns — Firestore rules forbid
  // changes to `columnOrder` from non-owners — so the grip handle is
  // hidden for them. Cards remain freely draggable within and across
  // columns regardless of role.
  isOwner: boolean
  // Tags currently selected on the board's tag-filter bar. Empty
  // means "no filter — show every card". When non-empty, OR-logic
  // applies: a card is visible iff any of its tags appear in this
  // array. Hidden cards stay in the DOM (rendered with `hidden`)
  // so column height and the dnd-kit sortable structure are not
  // disrupted while filters are active.
  activeTagFilters: string[]
  onOpenCard: (cardId: string) => void
}

export function Column({
  column,
  cards,
  isLastColumn,
  isOwner,
  activeTagFilters,
  onOpenCard,
}: Props) {
  // Column reorder (outer horizontal SortableContext). `setActivator
  // NodeRef` goes on the grip button so ONLY that element initiates a
  // column drag; `setNodeRef` goes on the column root so dnd-kit
  // measures the full column rect for drop-position calculations.
  const {
    setNodeRef: setSortableRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: { type: 'column' },
  })

  // Droppable for card drops on the column body. Attached to a DIFFERENT
  // DOM element than the sortable ref (see notes at the top of this
  // file).
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: column.id + COLUMN_DROP_SUFFIX,
    data: { type: 'column-drop', columnId: column.id },
  })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const cardIds = cards.map((c) => c.id)

  // Resolve which cards pass the active tag filter. We compute visibility
  // here (rather than further down inside the .map) so the badge can show
  // the visible/total split without a second pass over the array.
  //
  // OR semantics: when any filter is active, a card is visible iff it
  // shares at least one tag with the active set. When the filter is
  // empty, every card is visible (no behavioral change).
  //
  // Hidden cards remain in the rendered list — they pass through to
  // <Card hidden /> which hides them via display:none — so the
  // SortableContext membership and column height behavior are unchanged
  // while a filter is active.
  const filterActive = activeTagFilters.length > 0
  const filterSet = filterActive ? new Set(activeTagFilters) : null
  const isVisible = (c: CardType): boolean => {
    if (!filterSet) return true
    for (const t of c.tags) {
      if (filterSet.has(t)) return true
    }
    return false
  }
  const visibleCount = filterActive
    ? cards.reduce((acc, c) => (isVisible(c) ? acc + 1 : acc), 0)
    : cards.length

  return (
    <div
      ref={setSortableRef}
      style={style}
      {...attributes}
      className={`flex h-full w-72 shrink-0 flex-col rounded-lg bg-[var(--kb-column-header)] transition-colors ${
        isOver ? 'ring-2 ring-violet-400' : ''
      }`}
    >
      {/* Header: grip handle (drag activator), title, count badge. */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Grip handle — column reorder is owner-only. We omit the
            handle entirely for members (rather than disabling it) so
            the column header has a tidier look. The card-level
            sortable contexts inside still work for everyone. */}
        {isOwner && (
          <button
            ref={setActivatorNodeRef}
            {...listeners}
            title="Drag to reorder column"
            aria-label="Drag to reorder column"
            className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-slate-400 hover:text-slate-600 active:cursor-grabbing dark:text-slate-500 dark:hover:text-slate-300"
          >
            <GripIcon />
          </button>
        )}
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-100">
          {column.title}
        </h3>
        <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700/70 dark:text-slate-200">
          {/* When a tag filter is active, show the visible/total split
              (e.g. "3 / 8") so the user can see at a glance how much
              of each column the filter is hiding. With no filter, the
              badge keeps its original total-only form. */}
          {filterActive ? `${visibleCount} / ${cards.length}` : cards.length}
        </span>
      </div>

      {/* Card list body. The droppable ref lives on THIS div — a
          smaller rect than the column root — so collision detection
          returns the column-drop id only when the pointer is inside
          the card area (not over the header). Uses `kb-scroll-thin`
          (the same utility as the board's two horizontal scrollbars)
          so the per-column vertical scrollbar is visible across every
          theme + light/dark variant — `--kb-card-border` was too
          pale on some light themes for `kb-scroll`'s thumb to read. */}
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setDroppableRef}
          className="kb-scroll-thin flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2"
        >
          {cards.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-10 text-center text-xs text-slate-400 dark:text-slate-500">
              No cards
            </div>
          ) : (
            // Render every card in the underlying list — Card itself
            // applies `display: none` when `hidden` is true. This
            // keeps the dnd-kit SortableContext membership and DOM
            // structure intact while a tag filter is active, per spec.
            cards.map((c) => (
              <Card
                key={c.id}
                card={c}
                isLastColumn={isLastColumn}
                hidden={!isVisible(c)}
                onOpenDialog={() => onOpenCard(c.id)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// Six-dot grip icon, the standard "this is a drag handle" affordance.
function GripIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
      <circle cx="6" cy="4" r="1.3" />
      <circle cx="6" cy="8" r="1.3" />
      <circle cx="6" cy="12" r="1.3" />
      <circle cx="10" cy="4" r="1.3" />
      <circle cx="10" cy="8" r="1.3" />
      <circle cx="10" cy="12" r="1.3" />
    </svg>
  )
}
