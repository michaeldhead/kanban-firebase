// ---------------------------------------------------------------------------
// YAML card import — parse, validate, and (on success) return the list
// of cards ready to be batch-written to Firestore. Also generates an
// on-the-fly download template matching the active project's columns.
//
// Validation is strict per spec: all cards must pass for any to be
// imported. On failure the caller receives a list of per-card errors
// (card index + field + reason) suitable for rendering in the error
// modal. On success the caller gets a flat list of `ValidCard` records
// that already have every optional field normalized.
// ---------------------------------------------------------------------------

import jsYaml from 'js-yaml'
import type { CardLink, Column, Priority, Project } from '../types'

const VALID_PRIORITIES: readonly Priority[] = [
  'Critical',
  'High',
  'Medium',
  'Low',
]

// Regex matching the spec's due_date format: YYYY-MM-DD.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Schemes allowed on link URLs. The card UI renders links as
// `<a href={url}>` and a `javascript:` URL would execute on click
// — `rel="noreferrer"` does not block it. Restrict to http and
// https, the only two schemes a personal Kanban legitimately needs.
// Exported so the form-side validator (`CardForm`) can reuse the
// same allow-list and stay in lockstep with the import path.
export const ALLOWED_LINK_SCHEMES = /^https?:\/\//i

export interface ImportError {
  cardIndex: number // 1-based for user-friendly error messages
  field: string
  reason: string
}

// A card object ready for Firestore. Column is already resolved to the
// target column's ID, so the batch writer does not need to look it up
// again.
export interface ValidImportCard {
  title: string
  columnId: string
  priority: Priority | null
  description: string | null
  dueDate: string | null
  tags: string[]
  links: CardLink[]
  notes: string | null
}

export interface ImportResult {
  ok: boolean
  errors: ImportError[]
  // Populated only when `ok === true`.
  cards: ValidImportCard[]
}

/**
 * Parse + validate a YAML import document against the given project's
 * columns. Returns either a list of validated cards (on success) or a
 * list of per-card errors (on failure). Never throws.
 */
export function parseImport(yamlText: string, project: Project): ImportResult {
  // Step 1: YAML parse. A parse failure is reported as a single
  // document-level error so the user sees a useful message even when
  // their file never reaches the per-card validators.
  let parsed: unknown
  try {
    parsed = jsYaml.load(yamlText)
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : 'Invalid YAML document.'
    return {
      ok: false,
      errors: [{ cardIndex: 0, field: '(document)', reason }],
      cards: [],
    }
  }

  // Step 2: top-level shape — must be an object with a `cards` array.
  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      errors: [
        {
          cardIndex: 0,
          field: '(document)',
          reason: 'Expected a YAML object with a "cards" list.',
        },
      ],
      cards: [],
    }
  }
  const cardsRaw = (parsed as { cards?: unknown }).cards
  if (!Array.isArray(cardsRaw)) {
    return {
      ok: false,
      errors: [
        {
          cardIndex: 0,
          field: 'cards',
          reason: 'Expected a top-level "cards:" list.',
        },
      ],
      cards: [],
    }
  }
  if (cardsRaw.length === 0) {
    return {
      ok: false,
      errors: [
        {
          cardIndex: 0,
          field: 'cards',
          reason: 'The "cards" list is empty.',
        },
      ],
      cards: [],
    }
  }

  // Step 3: resolve columns. Map column title -> column id for exact-
  // match lookups (case-sensitive per spec). Also identify the default
  // (first) column for cards that omit the `column` field.
  const columnsByTitle = new Map<string, Column>()
  for (const colId of project.columnOrder) {
    const col = project.columns[colId]
    if (col) columnsByTitle.set(col.title, col)
  }
  const defaultColumnId = project.columnOrder[0] ?? null

  if (!defaultColumnId) {
    return {
      ok: false,
      errors: [
        {
          cardIndex: 0,
          field: '(project)',
          reason: 'This project has no columns. Add one before importing.',
        },
      ],
      cards: [],
    }
  }

  // Step 4: per-card validation. Errors accumulate across every card so
  // the user can fix them all in one pass.
  const errors: ImportError[] = []
  const validated: ValidImportCard[] = []

  for (let i = 0; i < cardsRaw.length; i++) {
    const raw = cardsRaw[i]
    const idx = i + 1 // human-friendly index for error messages

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push({
        cardIndex: idx,
        field: '(card)',
        reason: 'Expected a YAML mapping of fields.',
      })
      continue
    }
    const c = raw as Record<string, unknown>

    // --- title (required) ---
    const titleVal = c.title
    if (typeof titleVal !== 'string' || titleVal.trim() === '') {
      errors.push({
        cardIndex: idx,
        field: 'title',
        reason: 'Required. Must be a non-empty string.',
      })
      // Continue validating the rest so the user sees all errors at once.
    }

    // --- column (optional, must match exactly) ---
    let columnId = defaultColumnId
    if (c.column !== undefined && c.column !== null) {
      if (typeof c.column !== 'string') {
        errors.push({
          cardIndex: idx,
          field: 'column',
          reason: 'Must be a string (the column title).',
        })
      } else {
        const matched = columnsByTitle.get(c.column)
        if (!matched) {
          errors.push({
            cardIndex: idx,
            field: 'column',
            reason: `Value "${c.column}" is not a valid column on this board.`,
          })
        } else {
          columnId = matched.id
        }
      }
    }

    // --- priority (optional, must be one of four) ---
    let priority: Priority | null = null
    if (c.priority !== undefined && c.priority !== null) {
      if (
        typeof c.priority !== 'string' ||
        !VALID_PRIORITIES.includes(c.priority as Priority)
      ) {
        errors.push({
          cardIndex: idx,
          field: 'priority',
          reason: `Value "${String(
            c.priority,
          )}" is not one of ${VALID_PRIORITIES.join(', ')}.`,
        })
      } else {
        priority = c.priority as Priority
      }
    }

    // --- due_date (optional, YYYY-MM-DD) ---
    let dueDate: string | null = null
    // Accept both `due_date` (spec) and `dueDate` (in case a user writes
    // camelCase). The spec field name wins if both are present.
    const rawDue = c.due_date ?? c.dueDate
    if (rawDue !== undefined && rawDue !== null) {
      // js-yaml will parse an unquoted YYYY-MM-DD as a Date object
      // (YAML 1.1 timestamp). Accept both Date and string.
      let str: string | null = null
      if (rawDue instanceof Date) {
        // ISO local date, trimmed to YYYY-MM-DD.
        const y = rawDue.getFullYear()
        const m = String(rawDue.getMonth() + 1).padStart(2, '0')
        const d = String(rawDue.getDate()).padStart(2, '0')
        str = `${y}-${m}-${d}`
      } else if (typeof rawDue === 'string') {
        str = rawDue
      }
      if (!str || !DATE_RE.test(str)) {
        errors.push({
          cardIndex: idx,
          field: 'due_date',
          reason: 'Must be a YYYY-MM-DD date.',
        })
      } else {
        // Also require the date to be a real calendar date.
        const parsed = new Date(str + 'T00:00:00')
        if (isNaN(parsed.getTime())) {
          errors.push({
            cardIndex: idx,
            field: 'due_date',
            reason: `Value "${str}" is not a valid date.`,
          })
        } else {
          dueDate = str
        }
      }
    }

    // --- tags (optional, array of strings) ---
    let tags: string[] = []
    if (c.tags !== undefined && c.tags !== null) {
      if (!Array.isArray(c.tags)) {
        errors.push({
          cardIndex: idx,
          field: 'tags',
          reason: 'Must be a list of strings.',
        })
      } else {
        const badIndex = c.tags.findIndex((t) => typeof t !== 'string')
        if (badIndex >= 0) {
          errors.push({
            cardIndex: idx,
            field: `tags[${badIndex}]`,
            reason: 'Must be a string.',
          })
        } else {
          tags = c.tags.filter((t) => typeof t === 'string') as string[]
        }
      }
    }

    // --- links (optional, label + url pairs) ---
    let links: CardLink[] = []
    if (c.links !== undefined && c.links !== null) {
      if (!Array.isArray(c.links)) {
        errors.push({
          cardIndex: idx,
          field: 'links',
          reason: 'Must be a list of { label, url } entries.',
        })
      } else {
        c.links.forEach((l, j) => {
          if (!l || typeof l !== 'object' || Array.isArray(l)) {
            errors.push({
              cardIndex: idx,
              field: `links[${j}]`,
              reason: 'Must be an object with a label and url.',
            })
            return
          }
          const link = l as Record<string, unknown>
          const label = link.label
          const url = link.url
          if (typeof label !== 'string' || label.trim() === '') {
            errors.push({
              cardIndex: idx,
              field: `links[${j}].label`,
              reason: 'Required. Must be a non-empty string.',
            })
            return
          }
          if (typeof url !== 'string' || url.trim() === '') {
            errors.push({
              cardIndex: idx,
              field: `links[${j}].url`,
              reason: 'Required. Must be a non-empty string.',
            })
            return
          }
          // Restrict to http(s) so a malicious template cannot
          // smuggle a `javascript:` URL into Firestore. The link
          // is rendered later as `<a href={url}>`, and `javascript:`
          // hrefs execute in the page's context on click —
          // `rel="noreferrer"` does not block this. Allow-list the
          // two schemes a personal Kanban legitimately needs.
          if (!ALLOWED_LINK_SCHEMES.test(url.trim())) {
            errors.push({
              cardIndex: idx,
              field: `links[${j}].url`,
              reason: 'URL must start with http:// or https://',
            })
            return
          }
          links.push({ label: label.trim(), url: url.trim() })
        })
      }
    }

    // --- description & notes (optional strings) ---
    let description: string | null = null
    if (c.description !== undefined && c.description !== null) {
      if (typeof c.description !== 'string') {
        errors.push({
          cardIndex: idx,
          field: 'description',
          reason: 'Must be a string.',
        })
      } else {
        description = c.description
      }
    }

    let notes: string | null = null
    if (c.notes !== undefined && c.notes !== null) {
      if (typeof c.notes !== 'string') {
        errors.push({
          cardIndex: idx,
          field: 'notes',
          reason: 'Must be a string.',
        })
      } else {
        notes = c.notes
      }
    }

    // If this card produced any errors we skip it from `validated`, but
    // we still checked every field so the user sees them all.
    if (!errors.some((e) => e.cardIndex === idx) && typeof titleVal === 'string') {
      validated.push({
        title: titleVal.trim(),
        columnId,
        priority,
        description,
        dueDate,
        tags,
        links,
        notes,
      })
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, cards: [] }
  }
  return { ok: true, errors: [], cards: validated }
}

/**
 * Generate a YAML import template pre-filled with the active project's
 * column names and priorities. Downloaded as a .yaml file so users have
 * a working starting point for any project's specific column set.
 */
export function generateTemplate(project: Project): string {
  const columns = project.columnOrder
    .map((id) => project.columns[id])
    .filter((c): c is Column => Boolean(c))

  const columnNames = columns.map((c) => c.title)
  const firstColumn = columnNames[0] ?? 'To Do'

  const lines: string[] = []
  lines.push('# Kanban Import Template')
  lines.push(`# Project: ${project.title}`)
  lines.push(`# Valid columns: ${columnNames.join(', ')}`)
  lines.push(`# Valid priorities: ${VALID_PRIORITIES.join(', ')}`)
  lines.push('#')
  lines.push('# Each card must have a `title`. All other fields are optional.')
  lines.push('# `column` must match a column name exactly (case-sensitive).')
  lines.push('# If `column` is omitted the card is placed in the first column.')
  lines.push('#')
  lines.push('# Edit / add entries below, then save and import from the app.')
  lines.push('')
  lines.push('cards:')
  lines.push('  # Fully-populated example showing every supported field:')
  lines.push('  - title: "Example card with every field"')
  lines.push(`    column: "${firstColumn}"`)
  lines.push('    priority: "High"')
  lines.push('    description: "Short summary shown on the card."')
  lines.push('    due_date: "2026-12-31"')
  lines.push('    tags:')
  lines.push('      - tag-one')
  lines.push('      - tag-two')
  lines.push('    links:')
  lines.push('      - label: "Reference"')
  lines.push('        url: "https://example.com"')
  lines.push('    notes: "Private notes, not shown on the card\'s inline expand."')
  lines.push('')
  lines.push('  # Minimal example — just the required `title` field:')
  lines.push('  - title: "Another card, minimal"')
  lines.push('')
  return lines.join('\n')
}
