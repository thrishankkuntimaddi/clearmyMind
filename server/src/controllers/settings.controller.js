/**
 * settings.controller.js
 *
 * Handles server-side user preferences (supplemental to Firestore profile doc).
 * Mirrors EveryDay's settings.controller.js.
 */

import * as store from '../db/store.js'

/**
 * GET /api/settings
 * Returns the current server-stored settings.
 */
export function getSettings(req, res) {
  const settings = store.get('settings') || { name: '', noclear: false }
  res.json(settings)
}

/**
 * PATCH /api/settings
 * Partially update settings.
 * Body: { name?, noclear? }
 */
export function updateSettings(req, res) {
  const allowed  = ['name', 'noclear']
  const partial  = {}

  for (const key of allowed) {
    if (req.body[key] !== undefined) partial[key] = req.body[key]
  }

  if (Object.keys(partial).length === 0) {
    return res.status(400).json({ error: 'No valid fields provided.' })
  }

  store.merge('settings', partial)
  res.json(store.get('settings'))
}
