export interface ImportedGuest {
  name: string
  group: string
  email: string
  overnight: boolean
}

export interface GuestCsvResult {
  guests: ImportedGuest[]
  /** Non-fatal problems, e.g. an email that didn't look valid and was dropped */
  warnings: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Header spellings we recognise, normalised to lowercase with punctuation removed
const HEADERS = {
  name: ['name', 'fullname', 'guest', 'guestname'],
  firstName: ['first', 'firstname', 'givenname'],
  lastName: ['last', 'lastname', 'surname', 'familyname'],
  email: ['email', 'emailaddress', 'mail'],
  group: ['group', 'side', 'category', 'party'],
  overnight: ['overnight', 'stayingovernight', 'staying', 'accommodation'],
} as const

type Field = keyof typeof HEADERS

function normaliseHeader(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z]/g, '')
}

// RFC 4180-ish: handles quoted fields, escaped quotes ("") and CRLF line endings
function parseRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  row.push(cell)
  rows.push(row)

  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''))
}

function isTruthy(value: string): boolean {
  return ['yes', 'y', 'true', '1', 'x'].includes(value.toLowerCase())
}

/**
 * Turns a CSV into guests. With a header row, columns are matched by name
 * (name or first/last, email, group, overnight). Without one, the first
 * column is the name and any cell that looks like an email is the email.
 * Empty email cells are fine — the guest just has no email yet.
 */
export function parseGuestCsv(text: string): GuestCsvResult {
  const rows = parseRows(text.replace(/^﻿/, ''))
  const warnings: string[] = []
  if (rows.length === 0) return { guests: [], warnings: ['The file is empty.'] }

  const columns: Partial<Record<Field, number>> = {}
  rows[0].forEach((cell, i) => {
    const h = normaliseHeader(cell)
    for (const field of Object.keys(HEADERS) as Field[]) {
      if (columns[field] === undefined && (HEADERS[field] as readonly string[]).includes(h)) {
        columns[field] = i
      }
    }
  })
  const hasHeader =
    columns.name !== undefined || columns.firstName !== undefined || columns.lastName !== undefined
  const dataRows = hasHeader ? rows.slice(1) : rows

  const guests: ImportedGuest[] = []
  dataRows.forEach((row, index) => {
    const lineNo = index + (hasHeader ? 2 : 1)
    const get = (field: Field) => {
      const i = columns[field]
      return i === undefined ? '' : (row[i] ?? '')
    }

    let name: string
    let email: string
    if (hasHeader) {
      name = get('name') || [get('firstName'), get('lastName')].filter(Boolean).join(' ')
      email = get('email')
    } else {
      name = row[0]
      email = row.slice(1).find((c) => EMAIL_RE.test(c)) ?? ''
    }

    if (!name) {
      warnings.push(`Line ${lineNo}: no name, skipped.`)
      return
    }
    if (email && !EMAIL_RE.test(email)) {
      warnings.push(`Line ${lineNo}: "${email}" doesn't look like an email, left blank for ${name}.`)
      email = ''
    }

    guests.push({
      name,
      email,
      group: hasHeader ? get('group') : '',
      overnight: hasHeader ? isTruthy(get('overnight')) : false,
    })
  })

  return { guests, warnings }
}
