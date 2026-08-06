import type { BudgetItem, Guest, Task, WeddingSummary } from './types'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  getWedding: () => fetch('/api/wedding').then((r) => json<WeddingSummary>(r)),
  getGuests: () => fetch('/api/guests').then((r) => json<Guest[]>(r)),
  addGuest: (name: string, group: string) =>
    fetch('/api/guests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, group }),
    }).then((r) => json<Guest>(r)),
  setRsvp: (id: number, rsvp: Guest['rsvp']) =>
    fetch(`/api/guests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rsvp }),
    }).then((r) => json<Guest>(r)),
  getTasks: () => fetch('/api/tasks').then((r) => json<Task[]>(r)),
  addTask: (title: string) =>
    fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).then((r) => json<Task>(r)),
  toggleTask: (id: number, done: boolean) =>
    fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done }),
    }).then((r) => json<Task>(r)),
  getBudget: () => fetch('/api/budget').then((r) => json<BudgetItem[]>(r)),
  askAgent: (message: string) =>
    fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }).then((r) => json<{ reply: string }>(r)),
}
