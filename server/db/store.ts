import type { DocumentData } from '@google-cloud/firestore'
import { randomBytes } from 'node:crypto'
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
  pricePerHead: 0,
  minimumSpend: 0,
}

const SEED_GUESTS: Omit<Guest, 'id' | 'rsvpToken' | 'inviteUrl' | 'rsvpMessage' | 'lastEmailedAt'>[] = [
  { name: 'Jordan Rivera', rsvp: 'yes', group: 'Family', email: 'jordan@example.com', overnight: true },
  { name: 'Taylor Chen', rsvp: 'pending', group: 'Friends', email: '', overnight: false },
  { name: 'Morgan Patel', rsvp: 'no', group: 'Work', email: 'morgan@example.com', overnight: false },
]

const SEED_TASKS: Omit<Task, 'id'>[] = [
  { title: 'Book venue', done: true, notes: '', labels: [] },
  { title: 'Send save-the-dates', done: true, notes: '', labels: [] },
  { title: 'Choose caterer', done: false, notes: '', labels: [] },
  { title: 'Order invitations', done: false, notes: '', labels: [] },
  { title: 'Finalize guest list', done: false, notes: '', labels: [] },
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

// 128 random bits, URL-safe - guests can't guess each other's invite links
function generateRsvpToken(): string {
  return randomBytes(16).toString('base64url')
}

function inviteUrlFor(token: string): string {
  const base = (process.env.RSVP_SITE_URL || 'http://localhost:5174').replace(/\/+$/, '')
  return `${base}/?g=${encodeURIComponent(token)}`
}

function guestFromDoc(id: number, data: DocumentData): Guest {
  const rsvpToken = typeof data.rsvpToken === 'string' ? data.rsvpToken : ''
  return {
    id,
    name: data.name,
    rsvp: data.rsvp,
    group: data.group,
    email: typeof data.email === 'string' ? data.email : '',
    overnight: data.overnight === true,
    rsvpToken,
    inviteUrl: rsvpToken ? inviteUrlFor(rsvpToken) : '',
    rsvpMessage: typeof data.rsvpMessage === 'string' ? data.rsvpMessage : '',
    lastEmailedAt: typeof data.lastEmailedAt === 'string' ? data.lastEmailedAt : '',
  }
}

function taskFromDoc(id: number, data: DocumentData): Task {
  return {
    id,
    title: data.title,
    done: data.done,
    notes: typeof data.notes === 'string' ? data.notes : '',
    labels: Array.isArray(data.labels)
      ? data.labels.filter((l: unknown): l is string => typeof l === 'string')
      : [],
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

// Reserves `count` consecutive ids and returns the first one
async function nextId(counterField: keyof Counters, count = 1): Promise<number> {
  const counterRef = db.collection(COLLECTIONS.counters).doc(COUNTERS_DOC_ID)

  const first = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    const counters = snap.data() as Counters
    const id = counters[counterField] + 1
    tx.update(counterRef, { [counterField]: counters[counterField] + count })
    return id
  })

  return first
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
    batch.set(db.collection(COLLECTIONS.guests).doc(String(id)), {
      ...guest,
      rsvpToken: generateRsvpToken(),
    })
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

/** Gives any guest created before invite links existed an RSVP token. */
export async function ensureGuestRsvpTokens(): Promise<void> {
  const snap = await db.collection(COLLECTIONS.guests).get()
  const missing = snap.docs.filter((doc) => typeof doc.data().rsvpToken !== 'string')
  if (missing.length === 0) return

  const batch = db.batch()
  missing.forEach((doc) => batch.update(doc.ref, { rsvpToken: generateRsvpToken() }))
  await batch.commit()
  console.log(`[wedding-agent] generated RSVP tokens for ${missing.length} guest(s)`)
}

export async function getWedding(): Promise<Wedding> {
  const snap = await db.collection(COLLECTIONS.wedding).doc(WEDDING_DOC_ID).get()
  if (!snap.exists) {
    throw new Error('wedding document not found — run seedIfEmpty first')
  }
  const data = snap.data()!
  return {
    coupleNames: data.coupleNames,
    date: data.date,
    totalBudget: data.totalBudget,
    // Older wedding docs predate these fields
    pricePerHead: typeof data.pricePerHead === 'number' ? data.pricePerHead : 0,
    minimumSpend: typeof data.minimumSpend === 'number' ? data.minimumSpend : 0,
  }
}

export async function getWeddingSummary(): Promise<WeddingSummary> {
  const [wedding, budget, guests] = await Promise.all([getWedding(), getBudget(), getGuests()])
  const spent = budget.reduce((sum, b) => sum + b.actual, 0)
  const confirmedGuests = guests.filter((g) => g.rsvp === 'yes').length
  return {
    ...wedding,
    spent,
    remaining: wedding.totalBudget - spent,
    confirmedGuests,
    expectedGuests: confirmedGuests + guests.filter((g) => g.rsvp === 'pending').length,
  }
}

export async function getGuests(): Promise<Guest[]> {
  const snap = await db.collection(COLLECTIONS.guests).get()
  return snap.docs
    .map((doc) => guestFromDoc(Number(doc.id), doc.data()))
    .sort((a, b) => a.id - b.id)
}

export async function createGuest(
  name: string,
  group: string,
  email = '',
  overnight = false,
): Promise<Guest> {
  const id = await nextId('guestId')
  const rsvpToken = generateRsvpToken()
  const guest: Guest = {
    id,
    name,
    rsvp: 'pending',
    group,
    email,
    overnight,
    rsvpToken,
    inviteUrl: inviteUrlFor(rsvpToken),
    rsvpMessage: '',
    lastEmailedAt: '',
  }
  await db.collection(COLLECTIONS.guests).doc(String(id)).set({
    name: guest.name,
    rsvp: guest.rsvp,
    group: guest.group,
    email: guest.email,
    overnight: guest.overnight,
    rsvpToken,
  })
  return guest
}

export type NewGuest = Pick<Guest, 'name' | 'group' | 'email' | 'overnight'>

// Bulk insert for CSV import. Firestore batches cap at 500 writes, so chunk.
export async function createGuests(rows: NewGuest[]): Promise<Guest[]> {
  if (rows.length === 0) return []
  const firstId = await nextId('guestId', rows.length)
  const guests = rows.map((row, i): Guest => {
    const rsvpToken = generateRsvpToken()
    return {
      id: firstId + i,
      ...row,
      rsvp: 'pending',
      rsvpToken,
      inviteUrl: inviteUrlFor(rsvpToken),
      rsvpMessage: '',
      lastEmailedAt: '',
    }
  })
  for (let i = 0; i < guests.length; i += 500) {
    const batch = db.batch()
    guests.slice(i, i + 500).forEach((g) => {
      batch.set(db.collection(COLLECTIONS.guests).doc(String(g.id)), {
        name: g.name,
        rsvp: g.rsvp,
        group: g.group,
        email: g.email,
        overnight: g.overnight,
        rsvpToken: g.rsvpToken,
      })
    })
    await batch.commit()
  }
  return guests
}

export async function updateGuest(
  id: number,
  patch: Partial<Pick<Guest, 'name' | 'rsvp' | 'group' | 'email' | 'overnight'>>,
): Promise<Guest | null> {
  const ref = db.collection(COLLECTIONS.guests).doc(String(id))
  const snap = await ref.get()
  if (!snap.exists) return null
  const data = snap.data()!

  const updates: Record<string, string | boolean> = {}
  if (typeof patch.name === 'string') updates.name = patch.name
  if (typeof patch.rsvp === 'string') updates.rsvp = patch.rsvp
  if (typeof patch.group === 'string') updates.group = patch.group
  if (typeof patch.email === 'string') updates.email = patch.email
  if (typeof patch.overnight === 'boolean') updates.overnight = patch.overnight
  if (Object.keys(updates).length === 0) return guestFromDoc(id, data)

  await ref.update(updates)
  return guestFromDoc(id, { ...data, ...updates })
}

async function findGuestRefByRsvpToken(token: string) {
  const snap = await db
    .collection(COLLECTIONS.guests)
    .where('rsvpToken', '==', token)
    .limit(1)
    .get()
  return snap.empty ? null : snap.docs[0]
}

export async function deleteGuest(id: number): Promise<boolean> {
  const ref = db.collection(COLLECTIONS.guests).doc(String(id))
  const snap = await ref.get()
  if (!snap.exists) return false
  await ref.delete()
  return true
}

export async function getGuestByRsvpToken(token: string): Promise<Guest | null> {
  const doc = await findGuestRefByRsvpToken(token)
  return doc ? guestFromDoc(Number(doc.id), doc.data()) : null
}

/** Records a guest's reply from the RSVP site. */
export async function submitGuestRsvp(
  token: string,
  response: { attending: boolean; stayingOvernight: boolean; message: string },
): Promise<Guest | null> {
  const doc = await findGuestRefByRsvpToken(token)
  if (!doc) return null

  const updates = {
    rsvp: response.attending ? 'yes' : 'no',
    overnight: response.attending && response.stayingOvernight,
    rsvpMessage: response.message,
    rsvpRespondedAt: new Date().toISOString(),
  }
  await doc.ref.update(updates)
  return guestFromDoc(Number(doc.id), { ...doc.data(), ...updates })
}

export async function getTasks(): Promise<Task[]> {
  const snap = await db.collection(COLLECTIONS.tasks).get()
  return snap.docs
    .map((doc) => taskFromDoc(Number(doc.id), doc.data()))
    .sort((a, b) => a.id - b.id)
}

export async function createTask(title: string, notes = '', labels: string[] = []): Promise<Task> {
  const id = await nextId('taskId')
  const task: Task = {
    id,
    title,
    done: false,
    notes,
    labels,
  }
  await db.collection(COLLECTIONS.tasks).doc(String(id)).set({
    title: task.title,
    done: task.done,
    notes: task.notes,
    labels: task.labels,
  })
  return task
}

export async function updateTask(
  id: number,
  patch: Partial<Pick<Task, 'title' | 'done' | 'notes' | 'labels'>>,
): Promise<Task | null> {
  const ref = db.collection(COLLECTIONS.tasks).doc(String(id))
  const snap = await ref.get()
  if (!snap.exists) return null
  const data = snap.data()!

  const updates: Record<string, string | boolean | string[]> = {}
  if (typeof patch.title === 'string') updates.title = patch.title
  if (typeof patch.done === 'boolean') updates.done = patch.done
  if (typeof patch.notes === 'string') updates.notes = patch.notes
  if (Array.isArray(patch.labels)) updates.labels = patch.labels
  if (Object.keys(updates).length === 0) return taskFromDoc(id, data)

  await ref.update(updates)
  return taskFromDoc(id, { ...data, ...updates })
}

export async function deleteTask(id: number): Promise<boolean> {
  const ref = db.collection(COLLECTIONS.tasks).doc(String(id))
  const snap = await ref.get()
  if (!snap.exists) return false
  await ref.delete()
  return true
}

export async function getBudget(): Promise<BudgetItem[]> {
  const snap = await db.collection(COLLECTIONS.budget).get()
  return snap.docs
    .map((doc) => budgetFromDoc(Number(doc.id), doc.data()))
    .sort((a, b) => a.id - b.id)
}

export async function createBudgetItem(
  category: string,
  estimated: number,
  actual = 0,
): Promise<BudgetItem> {
  const id = await nextId('budgetId')
  const item: BudgetItem = { id, category, estimated, actual }
  await db.collection(COLLECTIONS.budget).doc(String(id)).set({
    category: item.category,
    estimated: item.estimated,
    actual: item.actual,
  })
  return item
}

export async function updateBudgetItem(
  id: number,
  patch: Partial<Pick<BudgetItem, 'category' | 'estimated' | 'actual'>>,
): Promise<BudgetItem | null> {
  const ref = db.collection(COLLECTIONS.budget).doc(String(id))
  const snap = await ref.get()
  if (!snap.exists) return null
  const data = snap.data()!

  const updates: Record<string, string | number> = {}
  if (typeof patch.category === 'string') updates.category = patch.category
  if (typeof patch.estimated === 'number') updates.estimated = patch.estimated
  if (typeof patch.actual === 'number') updates.actual = patch.actual
  if (Object.keys(updates).length === 0) {
    return budgetFromDoc(id, data)
  }

  await ref.update(updates)
  return budgetFromDoc(id, { ...data, ...updates })
}

export async function updateWedding(
  patch: Partial<Pick<Wedding, 'totalBudget' | 'pricePerHead' | 'minimumSpend'>>,
): Promise<Wedding> {
  const ref = db.collection(COLLECTIONS.wedding).doc(WEDDING_DOC_ID)
  await ref.update(patch)
  return getWedding()
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
