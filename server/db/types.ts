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
  /** Free-text instructions or follow-ups for the task */
  notes: string
  /** Free-form tags; the label picker offers every label used on any task */
  labels: string[]
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
  /** Venue catering price per guest, kept apart from the budget line items */
  pricePerHead: number
  /** Venue minimum spend the per-head total is measured against */
  minimumSpend: number
}

export interface WeddingSummary extends Wedding {
  spent: number
  remaining: number
  /** Guests who RSVP'd yes */
  confirmedGuests: number
  /** Guests who RSVP'd yes or haven't answered yet */
  expectedGuests: number
}

export interface Counters {
  guestId: number
  taskId: number
  budgetId: number
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
