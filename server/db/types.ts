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
