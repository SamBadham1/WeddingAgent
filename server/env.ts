import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = path.join(appRoot, '..')

for (const dir of [workspaceRoot, appRoot]) {
  dotenv.config({ path: path.join(dir, '.env'), quiet: true })
}
for (const dir of [workspaceRoot, appRoot]) {
  dotenv.config({ path: path.join(dir, '.env.local'), override: true, quiet: true })
}

export const envLoaded = true
