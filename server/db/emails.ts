import type { DocumentData } from '@google-cloud/firestore'
import { sendEmail } from '../email/gmail.js'
import { INVITE_TEMPLATE_ID, renderInviteEmail } from '../email/render.js'
import { COLLECTIONS, db } from './firestore.js'
import { getGuests, getWedding } from './store.js'
import type { OutboxEmail, OutboxStatus } from './types.js'

const MAX_SEND_ATTEMPTS = 3
const SEND_GAP_MS = 250

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function outboxFromDoc(id: string, data: DocumentData): OutboxEmail {
  return {
    id,
    guestId: Number(data.guestId),
    guestName: str(data.guestName),
    to: str(data.to),
    templateId: str(data.templateId),
    subject: str(data.subject),
    text: str(data.text),
    html: str(data.html),
    status: data.status as OutboxStatus,
    sendAfter: str(data.sendAfter),
    createdAt: str(data.createdAt),
    sentAt: str(data.sentAt),
    attempts: typeof data.attempts === 'number' ? data.attempts : 0,
    error: str(data.error),
    gmailMessageId: str(data.gmailMessageId),
  }
}

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------

export interface StageResult {
  staged: number
  skipped: { guestId: number; name: string; reason: string }[]
}

/** Renders the invite for each guest and queues the result for the dispatcher. */
export async function stageEmails(
  guestIds: number[],
  options: { sendAfter?: string; skipAlreadySent?: boolean } = {},
): Promise<StageResult> {
  // Every outbox email counts, so guests invited with the old templates are skipped too
  const [wedding, guests, existing] = await Promise.all([
    getWedding(),
    getGuests(),
    db.collection(COLLECTIONS.emailOutbox).get(),
  ])

  const alreadyHas = new Set(
    existing.docs
      .filter((doc) => ['queued', 'sending', 'sent'].includes(doc.data().status))
      .map((doc) => Number(doc.data().guestId)),
  )
  const wanted = new Set(guestIds)
  const now = new Date().toISOString()
  const sendAfter = options.sendAfter || now
  const result: StageResult = { staged: 0, skipped: [] }
  const batch = db.batch()

  for (const guest of guests) {
    if (!wanted.has(guest.id)) continue
    if (!guest.email) {
      result.skipped.push({ guestId: guest.id, name: guest.name, reason: 'no email address' })
      continue
    }
    if (options.skipAlreadySent && alreadyHas.has(guest.id)) {
      result.skipped.push({
        guestId: guest.id,
        name: guest.name,
        reason: 'already has an invite queued or sent',
      })
      continue
    }

    const rendered = renderInviteEmail(guest, wedding)
    batch.set(db.collection(COLLECTIONS.emailOutbox).doc(), {
      guestId: guest.id,
      guestName: guest.name,
      to: guest.email,
      templateId: INVITE_TEMPLATE_ID,
      ...rendered,
      status: 'queued',
      sendAfter,
      createdAt: now,
      sentAt: '',
      attempts: 0,
      error: '',
      gmailMessageId: '',
    })
    result.staged++
  }

  if (result.staged > 0) await batch.commit()
  return result
}

export async function getOutbox(): Promise<OutboxEmail[]> {
  const snap = await db.collection(COLLECTIONS.emailOutbox).get()
  return snap.docs
    .map((doc) => outboxFromDoc(doc.id, doc.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function transitionOutbox(
  id: string,
  from: OutboxStatus[],
  updates: Record<string, unknown>,
): Promise<OutboxEmail | 'conflict' | null> {
  const ref = db.collection(COLLECTIONS.emailOutbox).doc(id)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return null
    if (!from.includes(snap.data()!.status)) return 'conflict'
    tx.update(ref, updates)
    return outboxFromDoc(id, { ...snap.data(), ...updates })
  })
}

/** Cancels a deleted guest's queued emails so they never send; sent history is kept. */
export async function cancelQueuedForGuest(guestId: number): Promise<number> {
  const snap = await db.collection(COLLECTIONS.emailOutbox).where('guestId', '==', guestId).get()
  const queued = snap.docs.filter((doc) => doc.data().status === 'queued')
  if (queued.length === 0) return 0
  const batch = db.batch()
  for (const doc of queued) batch.update(doc.ref, { status: 'cancelled' })
  await batch.commit()
  return queued.length
}

export function cancelOutbox(id: string) {
  return transitionOutbox(id, ['queued'], { status: 'cancelled' })
}

/** Requeues a failed email, or one stuck in "sending" after a crash. */
export function retryOutbox(id: string) {
  return transitionOutbox(id, ['failed', 'sending', 'cancelled'], {
    status: 'queued',
    attempts: 0,
    error: '',
  })
}

export interface DispatchResult {
  sent: number
  failed: number
  requeued: number
  remaining: number
}

/** Sends due queued emails, oldest first, up to `max` per run. */
export async function dispatchQueued(max: number): Promise<DispatchResult> {
  const now = new Date().toISOString()
  const snap = await db.collection(COLLECTIONS.emailOutbox).where('status', '==', 'queued').get()
  const due = snap.docs
    .filter((doc) => str(doc.data().sendAfter) <= now)
    .sort((a, b) => str(a.data().createdAt).localeCompare(str(b.data().createdAt)))

  const result: DispatchResult = { sent: 0, failed: 0, requeued: 0, remaining: 0 }
  const batch = due.slice(0, max)
  result.remaining = due.length - batch.length

  for (const [i, doc] of batch.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, SEND_GAP_MS))

    // Claim it so an overlapping run (manual + scheduled) can't double-send
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref)
      if (fresh.data()?.status !== 'queued') return null
      const attempts = (fresh.data()!.attempts ?? 0) + 1
      tx.update(doc.ref, { status: 'sending', attempts })
      return outboxFromDoc(doc.id, { ...fresh.data(), attempts })
    })
    if (!claimed) continue

    try {
      const gmailMessageId = await sendEmail(claimed)
      const sentAt = new Date().toISOString()
      await doc.ref.update({ status: 'sent', sentAt, gmailMessageId, error: '' })
      await db
        .collection(COLLECTIONS.guests)
        .doc(String(claimed.guestId))
        .update({ lastEmailedAt: sentAt })
        .catch(() => {}) // guest may have been removed since staging
      result.sent++
    } catch (err) {
      const giveUp = claimed.attempts >= MAX_SEND_ATTEMPTS
      await doc.ref.update({
        status: giveUp ? 'failed' : 'queued',
        error: (err as Error).message.slice(0, 500),
      })
      if (giveUp) result.failed++
      else result.requeued++
      console.error(`[wedding-agent] email to ${claimed.to} failed:`, err)
    }
  }

  return result
}
