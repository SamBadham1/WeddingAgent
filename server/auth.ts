import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

// Hash both sides so timingSafeEqual gets equal-length buffers
function safeEqual(a: string, b: string): boolean {
  const hash = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(hash(a), hash(b))
}

let warnedNoAdminToken = false

/** Guards the dashboard API with the shared ADMIN_TOKEN (sent as x-admin-token). */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_TOKEN
  if (!expected) {
    if (!warnedNoAdminToken) {
      console.warn('[wedding-agent] ADMIN_TOKEN is not set — dashboard API is unprotected')
      warnedNoAdminToken = true
    }
    next()
    return
  }
  const given = req.header('x-admin-token') ?? ''
  if (!given || !safeEqual(given, expected)) {
    res.status(401).json({ error: 'admin token required' })
    return
  }
  next()
}
