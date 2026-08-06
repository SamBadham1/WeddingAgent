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
