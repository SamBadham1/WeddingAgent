export interface Guest {
  id: number
  name: string
  rsvp: 'yes' | 'no' | 'pending'
  group: string
  email: string
  overnight: boolean
  /** Unguessable token used in the guest's RSVP invite link */
  rsvpToken: string
  inviteUrl: string
  /** Note left by the guest on the RSVP site */
  rsvpMessage: string
  /** ISO time the dispatcher last sent this guest an email */
  lastEmailedAt: string
}

export interface Task {
  id: number
  title: string
  done: boolean
}

export interface BudgetItem {
  id: number
  category: string
  estimated: number
  actual: number
}

export interface Wedding {
  coupleNames: string
  date: string
  totalBudget: number
}

export interface WeddingSummary extends Wedding {
  spent: number
  remaining: number
}

export interface Counters {
  guestId: number
  taskId: number
  budgetId: number
}

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  /** Plain text with {{placeholders}}; rendered per guest when staged */
  body: string
  createdAt: string
  updatedAt: string
}

export type OutboxStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled'

export interface OutboxEmail {
  id: string
  guestId: number
  guestName: string
  to: string
  templateId: string
  subject: string
  text: string
  html: string
  status: OutboxStatus
  sendAfter: string
  createdAt: string
  sentAt: string
  attempts: number
  error: string
  gmailMessageId: string
}
