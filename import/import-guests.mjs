#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Firestore } from '@google-cloud/firestore'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID ?? 'wedding'
const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.GCLOUD_PROJECT ??
  process.env.PROJECT_ID

const replace = process.argv.includes('--replace')
const dryRun = process.argv.includes('--dry-run')
const guestsFile = process.argv.find((arg) => arg.startsWith('--file='))?.slice(7) ?? 'guests.json'

if (!PROJECT_ID) {
  console.error(
    'Missing project ID. Set GOOGLE_CLOUD_PROJECT or run: export PROJECT_ID=$(gcloud config get-value project)',
  )
  process.exit(1)
}

const db = new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID })

/** @typedef {{ name: string; rsvp?: string; group?: string; notes?: string }} GuestInput */

function loadGuests(filePath) {
  const raw = readFileSync(filePath, 'utf8')
  /** @type {GuestInput[]} */
  const guests = JSON.parse(raw)
  if (!Array.isArray(guests)) {
    throw new Error(`${filePath} must contain a JSON array`)
  }
  return guests
}

function toFirestoreGuest(guest) {
  const doc = {
    name: guest.name.trim(),
    rsvp: guest.rsvp ?? 'pending',
    group: guest.group?.trim() || 'Other',
  }
  if (guest.notes?.trim()) {
    doc.notes = guest.notes.trim()
  }
  return doc
}

async function deleteExistingGuests() {
  const snap = await db.collection('guests').get()
  if (snap.empty) return 0

  const batchSize = 400
  let deleted = 0
  const docs = snap.docs

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch()
    docs.slice(i, i + batchSize).forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
    deleted += Math.min(batchSize, docs.length - i)
  }

  return deleted
}

async function importGuests(guests) {
  const batchSize = 400
  let imported = 0

  for (let i = 0; i < guests.length; i += batchSize) {
    const batch = db.batch()
    const chunk = guests.slice(i, i + batchSize)

    chunk.forEach((guest, offset) => {
      const id = i + offset + 1
      batch.set(db.collection('guests').doc(String(id)), toFirestoreGuest(guest))
    })

    if (!dryRun) {
      await batch.commit()
    }
    imported += chunk.length
  }

  return imported
}

async function updateGuestCounter(guestCount) {
  const counterRef = db.collection('counters').doc('ids')
  const snap = await counterRef.get()
  const existing = snap.exists ? snap.data() : {}

  const nextCounters = {
    guestId: guestCount,
    taskId: existing.taskId ?? 0,
    budgetId: existing.budgetId ?? 0,
  }

  if (!dryRun) {
    await counterRef.set(nextCounters, { merge: true })
  }

  return nextCounters
}

async function main() {
  const filePath = join(__dirname, guestsFile)
  const guests = loadGuests(filePath)

  console.log(`Project:   ${PROJECT_ID}`)
  console.log(`Database:  ${DATABASE_ID}`)
  console.log(`File:      ${filePath}`)
  console.log(`Guests:    ${guests.length}`)
  console.log(`Mode:      ${dryRun ? 'dry-run' : replace ? 'replace' : 'append'}`)
  console.log('')

  if (replace) {
    const deleted = dryRun
      ? (await db.collection('guests').get()).size
      : await deleteExistingGuests()
    console.log(`Cleared ${deleted} existing guest document(s).`)
  }

  const imported = await importGuests(guests)
  const counters = await updateGuestCounter(imported)

  console.log(`${dryRun ? 'Would import' : 'Imported'} ${imported} guest(s).`)
  console.log(`${dryRun ? 'Would set' : 'Set'} counters/ids.guestId = ${counters.guestId}`)
}

main().catch((err) => {
  console.error('Import failed:', err)
  process.exit(1)
})
