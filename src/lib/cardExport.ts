// ---------------------------------------------------------------------------
// cardExport
//
// Pure (non-IO) helpers that turn cards into export-ready text. Two
// surfaces consume these helpers, on slightly different flavors of the
// same shape:
//
//   1. CardDialog's clipboard copy — single card, Markdown only.
//      Excludes the Column line (the dialog already shows the column
//      label inline; clipboarded text usually flows into a doc/issue
//      where the original column is irrelevant). Implemented by
//      `cardToClipboardMarkdown`.
//
//   2. Board export modal — many cards in either Markdown or CSV,
//      with optional archived rows merged in. The Markdown variant
//      adds the Column line (so a flat dump still tells you where
//      each card lived) and an explicit "Status: Archived" line for
//      archived cards. Implemented by `cardsToExportMarkdown` /
//      `cardsToExportCsv`.
//
// Keeping all of this in one pure module means the two surfaces can
// never drift on what an "exported card" looks like, and it's
// trivial to unit-test (no Firestore / DOM dependencies).
// ---------------------------------------------------------------------------

import { formatDateLong } from './dateUtils'
import type { Card, Project } from '../types'

// ---------------------------------------------------------------------------
// Single-card → Markdown (clipboard target).
//
// Spec layout:
//   # {title}
//
//   **Priority:** {priority}        (omit if no priority)
//   **Due:** {dueDate}              (omit if no due date)
//   **Tags:** {tag1}, {tag2}        (omit if no tags)
//
//   {description}                   (omit section if empty)
//
//   ## Notes                        (omit section if empty)
//   {notes}
//
//   ## Links                        (omit section if no links)
//   - [{label}]({url})
//
// Optional headers (priority/due/tags) cluster together, so any
// combination omitted preserves the rest. We assemble line-by-line
// and join, which is easier to reason about than embedding optional
// sections inside a template literal.
// ---------------------------------------------------------------------------
export function cardToClipboardMarkdown(card: Card): string {
  const lines: string[] = []

  // Title.
  lines.push(`# ${card.title}`)

  // Meta block. We collect candidates and only emit the leading blank
  // line if at least one meta line is present — otherwise the output
  // would have a trailing blank header gap before description.
  const meta: string[] = []
  if (card.priority) meta.push(`**Priority:** ${card.priority}`)
  if (card.dueDate) meta.push(`**Due:** ${formatDateLong(card.dueDate)}`)
  if (card.tags.length > 0) meta.push(`**Tags:** ${card.tags.join(', ')}`)
  if (meta.length > 0) {
    lines.push('')
    lines.push(...meta)
  }

  // Description body. Plain paragraph; preserve the user's line breaks.
  if (card.description && card.description.trim().length > 0) {
    lines.push('')
    lines.push(card.description)
  }

  // Notes section.
  if (card.notes && card.notes.trim().length > 0) {
    lines.push('')
    lines.push('## Notes')
    lines.push(card.notes)
  }

  // Links section.
  if (card.links.length > 0) {
    lines.push('')
    lines.push('## Links')
    for (const link of card.links) {
      lines.push(`- [${link.label}](${link.url})`)
    }
  }

  // Trailing newline so editors that strip the final newline still
  // produce a clean paste.
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Multi-card export → Markdown.
//
// Each card gets the same per-card layout as the clipboard copy, plus:
//   - **Column:** {columnTitle}        (always)
//   - **Status:** Archived             (only when the card is archived)
//
// Cards are separated by `---` on its own line, with blank lines
// around it so each card reads as its own section in any Markdown
// renderer.
// ---------------------------------------------------------------------------
export function cardsToExportMarkdown(
  cards: Card[],
  project: Project,
): string {
  const blocks = cards.map((card) => cardToExportMarkdownBlock(card, project))
  // Join with the `---` divider on its own line. Each block already
  // ends in a newline.
  return blocks.join('\n---\n\n')
}

// Single-card block used by the multi-card Markdown export. Same shape
// as the clipboard variant but with Column + (optional) Status lines
// in the meta cluster.
function cardToExportMarkdownBlock(card: Card, project: Project): string {
  const lines: string[] = []

  lines.push(`# ${card.title}`)

  const meta: string[] = []
  // Column always appears in the multi-card export so a flat dump is
  // self-describing — without it the reader would have to guess where
  // each card belonged.
  meta.push(`**Column:** ${columnTitleFor(card, project)}`)
  if (card.priority) meta.push(`**Priority:** ${card.priority}`)
  if (card.dueDate) meta.push(`**Due:** ${formatDateLong(card.dueDate)}`)
  if (card.tags.length > 0) meta.push(`**Tags:** ${card.tags.join(', ')}`)
  if (card.archived) meta.push('**Status:** Archived')
  // Meta is non-empty by construction (Column is unconditional), so
  // we emit the leading blank line unconditionally as well.
  lines.push('')
  lines.push(...meta)

  if (card.description && card.description.trim().length > 0) {
    lines.push('')
    lines.push(card.description)
  }

  if (card.notes && card.notes.trim().length > 0) {
    lines.push('')
    lines.push('## Notes')
    lines.push(card.notes)
  }

  if (card.links.length > 0) {
    lines.push('')
    lines.push('## Links')
    for (const link of card.links) {
      lines.push(`- [${link.label}](${link.url})`)
    }
  }

  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Multi-card export → CSV.
//
// Header row (fixed order):
//   Title, Column, Priority, Due Date, Tags, Description, Notes, Links, Archived
//
// Quoting rules (RFC 4180-ish):
//   - We quote every field unconditionally. This is more permissive
//     than strictly necessary but gives every cell predictable shape
//     and avoids subtle quoting bugs in cells like notes that may
//     contain commas, quotes, or line breaks.
//   - Embedded `"` is escaped as `""` per RFC 4180.
//   - Embedded line breaks inside notes/description are preserved
//     verbatim — the spec says "preserve line breaks as \n within the
//     cell." A raw `\n` inside a quoted CSV field is the standard way
//     to do this; spreadsheets unwrap it correctly on import.
// Tags collapse to a single comma-separated string. Links collapse to
// "{label} ({url})" tokens joined by `; `. Archived is "Yes"/"No".
// ---------------------------------------------------------------------------
export function cardsToExportCsv(cards: Card[], project: Project): string {
  const header = [
    'Title',
    'Column',
    'Priority',
    'Due Date',
    'Tags',
    'Description',
    'Notes',
    'Links',
    'Archived',
  ]

  const rows: string[] = [header.map(csvQuote).join(',')]

  for (const card of cards) {
    const row = [
      card.title,
      columnTitleFor(card, project),
      card.priority ?? '',
      card.dueDate ?? '',
      card.tags.join(', '),
      card.description ?? '',
      card.notes ?? '',
      card.links.map((l) => `${l.label} (${l.url})`).join('; '),
      card.archived ? 'Yes' : 'No',
    ]
    rows.push(row.map(csvQuote).join(','))
  }

  // CRLF line endings per RFC 4180. Excel + LibreOffice treat both LF
  // and CRLF correctly, but CRLF is the safer default for CSV
  // consumers that still parse strictly.
  return rows.join('\r\n') + '\r\n'
}

// Resolve the column title for a card, falling back to a stable label
// when the card's column has been deleted from the project (e.g. an
// archived card whose origin column was later removed).
function columnTitleFor(card: Card, project: Project): string {
  return project.columns[card.columnId]?.title ?? 'Unknown column'
}

// Quote a single CSV cell. Always wraps in double quotes and escapes
// inner quotes as `""`. See header notes above for the rationale.
function csvQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

// ---------------------------------------------------------------------------
// Filename slug.
//
// Project title → kebab-case ASCII. Same shape used by the import
// template downloader (Session 8) so users see a familiar filename
// stem — only the extension differs. Non-alphanumerics collapse to a
// single hyphen, leading/trailing hyphens are stripped, and the
// result lowercases. Falls back to "kanban-export" when the input
// produces an empty slug (e.g. a project titled with only emoji or
// non-Latin characters).
// ---------------------------------------------------------------------------
export function exportFilename(projectTitle: string, ext: 'md' | 'csv'): string {
  const slug = projectTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'kanban-export'}.${ext}`
}
