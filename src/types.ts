export interface Guest {
  id: number
  name: string
  rsvp: 'yes' | 'no' | 'pending'
  group: string
}

export interface Task {
  id: number
  title: string
  done: boolean
  dueWeeksBefore: number
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
