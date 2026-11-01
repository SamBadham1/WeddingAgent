import type { Guest, Wedding } from '../db/types.js'

// The one guest email: the invitation, laid out like the wedding website's hero
// (weddingWebsite/DesignFiles/wedding-website/design-system). Email clients ignore
// clip-path and CSS variables, so the clipped corners are dropped and tokens are inlined.

/** Stored on outbox records so sent invites can be told apart from older template emails. */
export const INVITE_TEMPLATE_ID = 'invite'

const VENUE = 'Man O War, Waiheke'

const COLOR = {
  forest: '#24382a',
  moss: '#5b6f45',
  sage: '#b9c4ab',
  lace: '#f6f4ee',
}

const SCRIPT = `'Great Vibes','Brush Script MT','Segoe Script',cursive`
const SANS = `Montserrat,'Helvetica Neue',Arial,sans-serif`
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Great+Vibes&family=Montserrat:wght@300;400;500&display=swap'

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'
}

/** "Saturday April 17th 2027" for display lines, "Saturday 17 April 2027" for running text. */
function weddingDates(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return { displayHtml: escapeHtml(iso), text: iso }
  const part = (options: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString('en-NZ', { ...options, timeZone: 'UTC' })
  const weekday = part({ weekday: 'long' })
  const month = part({ month: 'long' })
  const day = d.getUTCDate()
  const year = d.getUTCFullYear()
  const suffix = ordinal(day)
  return {
    displayHtml:
      `${weekday} ${month} ${day}` +
      `<sup style="font-size:0.65em;text-transform:lowercase;">${suffix}</sup> ${year}`,
    text: `${weekday} ${day} ${month} ${year}`,
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** "Samuel & Samantha" -> ["Samuel &", "Samantha"], the way the card sets the names. */
function nameLines(coupleNames: string): string[] {
  const i = coupleNames.indexOf('&')
  if (i === -1) return [coupleNames]
  return [coupleNames.slice(0, i + 1).trim(), coupleNames.slice(i + 1).trim()].filter(Boolean)
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 20px;font-family:${SANS};font-size:16px;line-height:26px;color:${COLOR.lace};">${html}</p>`
}

export function renderInviteEmail(
  guest: Pick<Guest, 'name' | 'inviteUrl'>,
  wedding: Pick<Wedding, 'coupleNames' | 'date'>,
): RenderedEmail {
  const firstName = guest.name.trim().split(/\s+/)[0] || guest.name
  const couple = wedding.coupleNames
  const dates = weddingDates(wedding.date)
  const venueName = VENUE.split(',')[0]
  const venueArea = VENUE.split(',')[1]?.trim() ?? ''

  const subject = `You're invited: ${couple}`.replace(/[\r\n]+/g, ' ')

  const text = [
    `Dear ${firstName},`,
    `We're getting married, and we'd love you to be there. Join us at ${venueName} on ${venueArea} on ${dates.text}.`,
    `Please RSVP using the link below to let us know whether you can make it:\n${guest.inviteUrl}`,
    `The link is just for you, so please don't share it.`,
    `Love,\n${couple}`,
  ].join('\n\n')

  const e = escapeHtml
  const url = e(guest.inviteUrl)

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light only"><title>${e(subject)}</title>` +
    `<link href="${FONTS_URL}" rel="stylesheet"></head>` +
    `<body style="margin:0;padding:0;background:${COLOR.forest};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.forest};">` +
    `<tr><td align="center" style="padding:40px 16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">` +
    // Hero: two lace hairlines around the moss panel, as on the website
    `<tr><td style="background:${COLOR.lace};padding:2px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${COLOR.forest};padding:6px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${COLOR.lace};padding:1px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td align="center" style="background:${COLOR.moss};padding:48px 16px;color:${COLOR.lace};">` +
    `<p style="margin:0 0 24px;font-family:${SANS};font-size:13px;line-height:20px;font-weight:500;letter-spacing:0.22em;text-transform:uppercase;color:${COLOR.lace};">You're invited</p>` +
    `<h1 style="margin:0;font-family:${SCRIPT};font-size:60px;line-height:1.05;font-weight:400;color:${COLOR.lace};">` +
    nameLines(couple).map(e).join('<br>') +
    `</h1>` +
    `<p style="margin:32px 0 8px;font-family:${SANS};font-size:15px;line-height:26px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${COLOR.lace};">${dates.displayHtml}</p>` +
    `<p style="margin:0;font-family:${SANS};font-size:15px;line-height:26px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${COLOR.lace};">${e(VENUE)}</p>` +
    `</td></tr></table></td></tr></table></td></tr></table></td></tr>` +
    // Letter: dark like the hero, because dark-mode clients (Yahoo, Gmail, Outlook.com)
    // ignore color-scheme and recolour light backgrounds and dark text
    `<tr><td bgcolor="${COLOR.moss}" style="background:${COLOR.moss};padding:40px 32px;">` +
    paragraph(`Dear ${e(firstName)},`) +
    paragraph(
      `We're getting married, and we'd love you to be there. Join us at ${e(venueName)} on ${e(venueArea)} on ${e(dates.text)}.`,
    ) +
    paragraph(`Please tap the RSVP button below to let us know whether you can make it.`) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 28px;"><tr>` +
    `<td bgcolor="${COLOR.forest}" style="background:${COLOR.forest};border:1px solid ${COLOR.lace};">` +
    `<a href="${url}" style="display:inline-block;padding:16px 32px;font-family:${SANS};font-size:12px;line-height:16px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:${COLOR.lace};text-decoration:none;">RSVP</a>` +
    `</td></tr></table>` +
    `<p style="margin:0 0 28px;font-family:${SANS};font-size:14px;line-height:22px;color:${COLOR.sage};text-align:center;">` +
    `The link is just for you, so please don't share it. If the button doesn't work, copy this into your browser:<br>` +
    `<a href="${url}" style="color:${COLOR.sage};word-break:break-all;">${url}</a></p>` +
    `<p style="margin:0;border-top:1px solid ${COLOR.sage};padding-top:24px;font-family:${SANS};font-size:16px;line-height:26px;color:${COLOR.lace};">Love,</p>` +
    `<p style="margin:0;font-family:${SCRIPT};font-size:36px;line-height:1.2;color:${COLOR.lace};">${e(couple)}</p>` +
    `</td></tr>` +
    // Footer
    `<tr><td align="center" style="padding:24px 16px 0;font-family:${SANS};font-size:12px;line-height:16px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:${COLOR.sage};">` +
    `${dates.displayHtml} &middot; ${e(VENUE)}` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`

  return { subject, text, html }
}
