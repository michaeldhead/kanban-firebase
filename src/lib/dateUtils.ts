// ---------------------------------------------------------------------------
// Date utilities — pure helpers shared across the board, card preview,
// dialog, archive drawer, and stats computation. Pulling them into one
// module keeps four near-identical copies in lockstep, and means a
// future timezone or i18n tweak only has to be applied once.
//
// All callers operate on the YYYY-MM-DD string format the spec uses
// for `Card.dueDate`, so the parser and the formatters are scoped to
// that shape.
// ---------------------------------------------------------------------------

/**
 * Parse a "YYYY-MM-DD" string into a local-time Date at midnight.
 *
 * `new Date("2026-05-01")` parses as UTC midnight, which displays as
 * the previous day in western-hemisphere timezones. Building the Date
 * from the individual numeric components avoids that trap: the result
 * is always local-time midnight on the intended calendar day.
 *
 * Returns null if the input is not a valid YYYY-MM-DD string or if
 * the resulting Date is invalid (e.g. February 30).
 */
export function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return isNaN(d.getTime()) ? null : d
}

/**
 * Today at local midnight. Used by overdue checks so a "due today"
 * card does not flip to overdue partway through the day.
 *
 * Optionally accepts a reference Date — most callers omit this, but
 * `cardStats` passes its own `now` for testability.
 */
export function startOfToday(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Format a YYYY-MM-DD due date for compact display on a card or in
 * the archive drawer. The year is omitted when the date falls in the
 * current calendar year, so most cards show "May 1" rather than the
 * noisier "May 1, 2026". Falls back to the raw string for unparseable
 * input — the renderer never throws.
 */
export function formatDate(s: string): string {
  const d = parseISODate(s)
  if (!d) return s
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year:
      d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

/**
 * Format a YYYY-MM-DD due date for the full card dialog, where space
 * is not constrained and we want the year always visible — the
 * dialog is also where users edit dates, so an unambiguous "May 1,
 * 2026" is the right default. Falls back to the raw string for
 * unparseable input.
 */
export function formatDateLong(s: string): string {
  const d = parseISODate(s)
  if (!d) return s
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
