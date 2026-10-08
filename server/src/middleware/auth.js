/**
 * auth.js — Firebase ID-token authentication middleware
 * ======================================================
 * Every /api route except /api/health requires:
 *   Authorization: Bearer <Firebase ID token>
 *
 * The client gets the token with `await auth.currentUser.getIdToken()`.
 * Verification only needs the project id (Google's public signing keys are
 * fetched automatically) — no service-account secret is required.
 *
 * On success: req.user = { uid, email, emailVerified }
 */

import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const projectId = process.env.FIREBASE_PROJECT_ID

if (!projectId) {
  console.warn('[Auth] ⚠️  FIREBASE_PROJECT_ID is not set — every authenticated route will return 503')
} else if (!getApps().length) {
  initializeApp({ projectId })
}

export async function requireAuth(req, res, next) {
  if (!projectId) return res.status(503).json({ error: 'Server auth is not configured.' })

  const header = req.get('authorization') ?? ''
  const match  = header.match(/^Bearer ([A-Za-z0-9._-]+)$/)
  if (!match) return res.status(401).json({ error: 'Missing or malformed Authorization header.' })

  try {
    // checkRevoked: tokens of disabled/deleted users or after a password reset are refused
    const decoded = await getAuth().verifyIdToken(match[1], true)
    req.user = { uid: decoded.uid, email: decoded.email ?? null, emailVerified: !!decoded.email_verified }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' })
  }
}

/** Use after requireAuth on routes that must only serve verified accounts. */
export function requireVerifiedEmail(req, res, next) {
  if (!req.user?.emailVerified) return res.status(403).json({ error: 'Verify your email address first.' })
  next()
}
