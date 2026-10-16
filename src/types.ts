export interface Guest {
  id: number
  name: string
  rsvp: 'yes' | 'no' | 'pending'
  group: string
  email: string
  overnight: boolean
  rsvpToken: string
  inviteUrl: string
  rsvpMessage: string
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

export interface WeddingSummary {
  coupleNames: string
  date: string
  totalBudget: number
  spent: number
  remaining: number
}

export interface AgentMessage {
  role: 'user' | 'agent'
  text: string
}

export interface EmailTemplate {
  id: string
  name: string
  subject: string
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

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

export interface StageResult {
  staged: number
  skipped: { guestId: number; name: string; reason: string }[]
}

export interface DispatchResult {
  sent: number
  failed: number
  requeued: number
  remaining: number
}
