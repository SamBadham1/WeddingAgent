import type { DocumentData } from '@google-cloud/firestore'
import {
  COLLECTIONS,
  COUNTERS_DOC_ID,
  WEDDING_DOC_ID,
  db,
} from './firestore.js'
import type {
  BudgetItem,
  Counters,
  Guest,
  Task,
  Wedding,
  WeddingSummary,
} from './types.js'

const SEED_WEDDING: Wedding = {
  coupleNames: 'Sam & Sam',
  date: '2026-09-19',
  totalBudget: 30000,
}

const SEED_GUESTS: Omit<Guest, 'id'>[] = [
  { name: 'Jordan Rivera', rsvp: 'yes', group: 'Family' },
  { name: 'Taylor Chen', rsvp: 'pending', group: 'Friends' },
  { name: 'Morgan Patel', rsvp: 'no', group: 'Work' },
]

const SEED_TASKS: Omit<Task, 'id'>[] = [
  { title: 'Book venue', done: true, dueWeeksBefore: 40 },
  { title: 'Send save-the-dates', done: true, dueWeeksBefore: 32 },
  { title: 'Choose caterer', done: false, dueWeeksBefore: 24 },
  { title: 'Order invitations', done: false, dueWeeksBefore: 16 },
  { title: 'Finalize guest list', done: false, dueWeeksBefore: 12 },
]

const SEED_BUDGET: Omit<BudgetItem, 'id'>[] = [
  { category: 'Venue', estimated: 12000, actual: 12500 },
  { category: 'Catering', estimated: 9000, actual: 0 },
  { category: 'Photography', estimated: 3500, actual: 3200 },
]

const SEED_COUNTERS: Counters = {
  guestId: 3,
  taskId: 5,
  budgetId: 3,
}

function guestFromDoc(id: number, data: DocumentData): Guest {
  return {
    id,
    name: data.name,
    rsvp: data.rsvp,
    group: data.group,
  }
}

function taskFromDoc(id: number, data: DocumentData): Task {
  return {
    id,
    title: data.title,
    done: data.done,
    dueWeeksBefore: data.dueWeeksBefore,
  }
}

function budgetFromDoc(id: number, data: DocumentData): BudgetItem {
  return {
    id,
    category: data.category,
    estimated: data.estimated,
    actual: data.actual,
  }
}

async function nextId(counterField: keyof Counters): Promise<number> {
  const counterRef = db.collection(COLLECTIONS.counters).doc(COUNTERS_DOC_ID)

  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    const counters = snap.data() as Counters
    const id = counters[counterField] + 1
    tx.update(counterRef, { [counterField]: id })
    return id
  })

  return next
}

export async function seedIfEmpty(): Promise<void> {
  const weddingRef = db.collection(COLLECTIONS.wedding).doc(WEDDING_DOC_ID)
  const existing = await weddingRef.get()
  if (existing.exists) return

  const batch = db.batch()

  batch.set(weddingRef, SEED_WEDDING)
  batch.set(db.collection(COLLECTIONS.counters).doc(COUNTERS_DOC_ID), SEED_COUNTERS)

  SEED_GUESTS.forEach((guest, index) => {
    const id = index + 1
    batch.set(db.collection(COLLECTIONS.guests).doc(String(id)), guest)
  })

  SEED_TASKS.forEach((task, index) => {
    const id = index + 1
    batch.set(db.collection(COLLECTIONS.tasks).doc(String(id)), task)
  })

  SEED_BUDGET.forEach((item, index) => {
    const id = index + 1
    batch.set(db.collection(COLLECTIONS.budget).doc(String(id)), item)
  })

  await batch.commit()
  console.log('[wedding-agent] seeded Firestore with initial data')
}

export async function getWedding(): Promise<Wedding> {
  const snap = await db.collection(COLLECTIONS.wedding).doc(WEDDING_DOC_ID).get()
  if (!snap.exists) {
    throw new Error('wedding document not found — run seedIfEmpty first')
  }
  return snap.data() as Wedding
}

export async function getWeddingSummary(): Promise<WeddingSummary> {
  const [wedding, budget] = await Promise.all([getWedding(), getBudget()])
  const spent = budget.reduce((sum, b) => sum + b.actual, 0)
  return {
    ...wedding,
    spent,
    remaining: wedding.totalBudget - spent,
  }
}

export async function getGuests(): Promise<Guest[]> {
  const snap = await db.collection(COLLECTIONS.guests).get()
  return snap.docs
    .map((doc) => guestFromDoc(Number(doc.id), doc.data()))
    .sort((a, b) => a.id - b.id)
}

export async function createGuest(name: string, group: string): Promise<Guest> {
  const id = await nextId('guestId')
  const guest: Guest = {
    id,
    name,
    rsvp: 'pending',
    group,
  }
  await db.collection(COLLECTIONS.guests).doc(String(id)).set({
    name: guest.name,
    rsvp: guest.rsvp,
    group: guest.group,
  })
  return guest
}

export async function updateGuestRsvp(
  id: number,
  rsvp: Guest['rsvp'],
): Promise<Guest | null> {
  const ref = db.collection(COLLECTIONS.guests).doc(String(id))
  const snap = await ref.get()
  if (!snap.exists) return null

  await ref.update({ rsvp })
  return guestFromDoc(id, { ...snap.data(), rsvp })
}

export async function getTasks(): Promise<Task[]> {
  const snap = await db.collection(COLLECTIONS.tasks).get()
  return snap.docs
    .map((doc) => taskFromDoc(Number(doc.id), doc.data()))
    .sort((a, b) => a.id - b.id)
}

export async function createTask(title: string, dueWeeksBefore: number): Promise<Task> {
  const id = await nextId('taskId')
  const task: Task = {
    id,
    title,
    done: false,
    dueWeeksBefore,
  }
  await db.collection(COLLECTIONS.tasks).doc(String(id)).set({
    title: task.title,
    done: task.done,
    dueWeeksBefore: task.dueWeeksBefore,
  })
  return task
}

export async function updateTaskDone(id: number, done: boolean): Promise<Task | null> {
  const ref = db.collection(COLLECTIONS.tasks).doc(String(id))
  const snap = await ref.get()
  if (!snap.exists) return null

  await ref.update({ done })
  return taskFromDoc(id, { ...snap.data(), done })
}

export async function getBudget(): Promise<BudgetItem[]> {
  const snap = await db.collection(COLLECTIONS.budget).get()
  return snap.docs
    .map((doc) => budgetFromDoc(Number(doc.id), doc.data()))
    .sort((a, b) => a.id - b.id)
}

export interface PlanningContext {
  wedding: Wedding
  guests: Guest[]
  tasks: Task[]
  budget: BudgetItem[]
}

export async function getPlanningContext(): Promise<PlanningContext> {
  const [wedding, guests, tasks, budget] = await Promise.all([
    getWedding(),
    getGuests(),
    getTasks(),
    getBudget(),
  ])
  return { wedding, guests, tasks, budget }
}
