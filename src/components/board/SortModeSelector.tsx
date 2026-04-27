// ---------------------------------------------------------------------------
// SortModeSelector
//
// Small segmented control in the stats bar that switches the project's
// card sort mode. Four logical options: Priority, Date, Alpha, Custom.
//
// "Custom" is special per the spec:
//   - It is not a user-selectable button under normal circumstances —
//     the project enters custom mode only when the user drags a card to
//     reorder it within a column.
//   - When the project's current mode IS "custom", we render Custom as
//     the active (grayed out) option with the label "Drag to reorder"
//     to make it obvious what state the board is in and how to leave
//     it. Clicking any of the other three options switches back out
//     of custom mode.
//
// Theme awareness:
//   The control's surface uses the card background / border theme
//   tokens. Text colors carry `dark:` variants so the segments read
//   correctly in either mode.
// ---------------------------------------------------------------------------

import type { SortMode } from '../../types'

interface Props {
  mode: SortMode
  onChange: (mode: SortMode) => void
}

export function SortModeSelector({ mode, onChange }: Props) {
  const isCustom = mode === 'custom'

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 dark:text-slate-400">Sort</span>
      <div className="flex items-center rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] p-0.5 text-xs">
        <Segment
          active={mode === 'priority'}
          onClick={() => onChange('priority')}
        >
          Priority
        </Segment>
        <Segment active={mode === 'date'} onClick={() => onChange('date')}>
          Date
        </Segment>
        <Segment active={mode === 'alpha'} onClick={() => onChange('alpha')}>
          Alpha
        </Segment>
        {/* Custom is only actively rendered when the project is in custom
            mode — otherwise there is nothing to click and we save the
            space in the control. */}
        {isCustom && (
          <Segment active title="Exit custom order by picking another mode">
            Drag to reorder
          </Segment>
        )}
      </div>
    </div>
  )
}

function Segment({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick?: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={active && !onClick}
      className={`rounded px-2 py-1 font-medium transition ${
        active
          ? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
      }`}
    >
      {children}
    </button>
  )
}
