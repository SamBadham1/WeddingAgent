import type { Guest, Wedding } from '../db/types.js'

export const PLACEHOLDERS = ['name', 'firstName', 'inviteUrl', 'coupleNames', 'date'] as const

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

function formatWeddingDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-NZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    key in values ? values[key] : match,
  )
}

const URL_PATTERN = /(https?:\/\/[^\s<]+)/g

/** Escapes a rendered line and turns URLs into links; the invite URL becomes a button. */
function lineToHtml(line: string, inviteUrl: string): string {
  return line
    .split(URL_PATTERN)
    .map((part, i) => {
      if (i % 2 === 0) return escapeHtml(part)
      const href = escapeHtml(part)
      if (inviteUrl && part === inviteUrl) {
        return (
          `<a href="${href}" style="display:inline-block;background:#c25e7a;color:#ffffff;` +
          `text-decoration:none;font-weight:600;padding:12px 24px;border-radius:10px;">RSVP here</a>`
        )
      }
      return `<a href="${href}" style="color:#c25e7a;">${href}</a>`
    })
    .join('')
}

function bodyToHtml(text: string, inviteUrl: string): string {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;line-height:1.6;">` +
        p
          .split('\n')
          .map((line) => lineToHtml(line, inviteUrl))
          .join('<br>') +
        `</p>`,
    )
    .join('')

  return (
    `<!doctype html><html><body style="margin:0;padding:24px;background:#faf7f5;">` +
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ece5ea;` +
    `border-radius:16px;padding:28px;font-family:Georgia,'Times New Roman',serif;color:#2c2431;font-size:16px;">` +
    paragraphs +
    `</div></body></html>`
  )
}

export function renderEmail(
  tpl: { subject: string; body: string },
  guest: Pick<Guest, 'name' | 'inviteUrl'>,
  wedding: Pick<Wedding, 'coupleNames' | 'date'>,
): RenderedEmail {
  const values: Record<string, string> = {
    name: guest.name,
    firstName: guest.name.trim().split(/\s+/)[0] ?? guest.name,
    inviteUrl: guest.inviteUrl,
    coupleNames: wedding.coupleNames,
    date: formatWeddingDate(wedding.date),
  }
  const subject = fill(tpl.subject, values).replace(/[\r\n]+/g, ' ').trim()
  const text = fill(tpl.body, values)
  return { subject, text, html: bodyToHtml(text, guest.inviteUrl) }
}
