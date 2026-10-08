/**
 * settings.controller.js
 *
 * Per-user server-side preferences (supplemental to the Firestore profile doc).
 * Previously ONE global settings object was shared by every caller.
 */

import * as store from '../db/store.js'

const MAX_NAME_LEN = 80

/** GET /api/settings */
export function getSettings(req, res) {
  res.json(store.getUser(req.user.uid))
}

/**
 * PATCH /api/settings
 * Body: { name?: string (≤ 80 chars), noclear?: boolean }
 */
export function updateSettings(req, res) {
  const body    = req.body ?? {}
  const partial = {}

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.length > MAX_NAME_LEN) {
      return res.status(400).json({ error: `name must be a string of at most ${MAX_NAME_LEN} characters.` })
    }
    partial.name = body.name.trim()
  }
  if (body.noclear !== undefined) {
    if (typeof body.noclear !== 'boolean') return res.status(400).json({ error: 'noclear must be a boolean.' })
    partial.noclear = body.noclear
  }
  if (!Object.keys(partial).length) return res.status(400).json({ error: 'No valid fields provided.' })

  res.json(store.mergeUser(req.user.uid, partial))
}
