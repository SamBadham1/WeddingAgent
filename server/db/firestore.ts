import { Firestore } from '@google-cloud/firestore'

const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT
const databaseId = process.env.FIRESTORE_DATABASE_ID ?? 'wedding'

export const db = new Firestore({
  ...(projectId ? { projectId } : {}),
  databaseId,
})

export const COLLECTIONS = {
  wedding: 'wedding',
  guests: 'guests',
  tasks: 'tasks',
  budget: 'budget',
  counters: 'counters',
} as const

export const WEDDING_DOC_ID = 'default'
export const COUNTERS_DOC_ID = 'ids'
