// ---------------------------------------------------------------------------
// Card statistics used in the board's stats bar.
//
// The four numbers shown (total, critical, due-this-week, overdue) are all
// derived from the current set of (non-archived) cards for the active
// project. Computing them client-side here avoids an extra Firestore read
// and keeps the stats perfectly in sync with the rendered board.
//
// "Due this week" is defined as "due between today and 7 days from now,
// inclusive". "Overdue" is "due date strictly before today". Cards with no
// due date contribute to `total` only.
// ---------------------------------------------------------------------------

import type { Card } from '../types'
import { parseISODate, startOfToday } from './dateUtils'

export interface CardStats {
  total: number
  critical: number
  dueThisWeek: number
  overdue: number
}

export function computeStats(cards: Card[], now = new Date()): CardStats {
  // Normalize "today" to midnight so date-only comparisons line up. The
  // spec stores due dates as YYYY-MM-DD strings with no time component;
  // treating every due date as start-of-day avoids off-by-one bugs where
  // a card due "today" would appear overdue at 14:00.
  const today = startOfToday(now)
  const weekEnd = new Date(today)
  weekEnd.setDate(weekEnd.getDate() + 7)

  let critical = 0
  let dueThisWeek = 0
  let overdue = 0

  for (const c of cards) {
    if (c.priority === 'Critical') critical++
    if (c.dueDate) {
      const due = parseISODate(c.dueDate)
      if (due) {
        if (due.getTime() < today.getTime()) overdue++
        else if (due.getTime() <= weekEnd.getTime()) dueThisWeek++
      }
    }
  }

  return { total: cards.length, critical, dueThisWeek, overdue }
}

