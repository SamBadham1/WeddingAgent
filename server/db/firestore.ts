import { envLoaded } from '../env.js'
void envLoaded
import { Firestore } from '@google-cloud/firestore'

const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT
const databaseId = process.env.FIRESTORE_DATABASE_ID ?? 'wedding'
const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
// Cloud Run sets K_SERVICE; the Firestore client can resolve the project from
// the metadata server when projectId is omitted. Require an explicit project
// only for local (non-emulator) runs where metadata is unavailable.
const onCloudRun = Boolean(process.env.K_SERVICE)

if (!projectId && !usingEmulator && !onCloudRun) {
  throw new Error(
    'Missing GOOGLE_CLOUD_PROJECT. Copy .env.example to .env, set your GCP project ID, ' +
      'then run: gcloud auth application-default login',
  )
}

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

export function logFirestoreTarget(): void {
  const target = usingEmulator
    ? `emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`
    : `project ${projectId}`
  console.log(`[wedding-agent] Firestore: database "${databaseId}" on ${target}`)
}
