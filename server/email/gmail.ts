import { randomBytes } from 'node:crypto'
import nodemailer, { type Transporter } from 'nodemailer'

export interface OutgoingEmail {
  to: string
  subject: string
  text: string
  html: string
}

/** GMAIL_SENDER is "Display Name <address@gmail.com>"; the address is also the SMTP login. */
function senderAddress(): string {
  const sender = process.env.GMAIL_SENDER ?? ''
  return (sender.match(/<([^>]+)>/)?.[1] ?? sender).trim()
}

function hasCredentials(): boolean {
  return Boolean(senderAddress() && process.env.GMAIL_APP_PASSWORD)
}

/** Dry run logs instead of sending; on by default whenever Gmail credentials are missing. */
export function isDryRun(): boolean {
  const flag = process.env.EMAIL_DRY_RUN
  if (flag !== undefined && flag !== '') return flag === 'true'
  return !hasCredentials()
}

let transporter: Transporter | null = null

function gmailTransport(): Transporter {
  if (!hasCredentials()) {
    throw new Error('Gmail is not configured: set GMAIL_SENDER and GMAIL_APP_PASSWORD')
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: senderAddress(),
        // Google shows app passwords in groups of four; the spaces aren't part of it
        pass: (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, ''),
      },
    })
  }
  return transporter
}

/** Sends one email from the wedding Gmail account; returns the SMTP message id. */
export async function sendEmail(email: OutgoingEmail): Promise<string> {
  if (isDryRun()) {
    console.log(
      `[wedding-agent] (dry run) email to ${email.to}: "${email.subject}"\n${email.text}\n`,
    )
    return `dry-run-${randomBytes(6).toString('hex')}`
  }

  const info = await gmailTransport().sendMail({
    from: process.env.GMAIL_SENDER,
    to: email.to,
    replyTo: process.env.GMAIL_REPLY_TO || undefined,
    subject: email.subject,
    text: email.text,
    html: email.html,
  })
  return info.messageId
}
