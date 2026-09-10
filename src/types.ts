export interface Guest {
  id: number
  name: string
  rsvp: 'yes' | 'no' | 'pending'
  group: string
  email: string
  overnight: boolean
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
