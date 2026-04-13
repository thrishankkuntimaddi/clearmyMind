/**
 * data.controller.js
 *
 * Handles full data export and destructive reset.
 * Mirrors EveryDay's data.controller.js.
 */

import * as store from '../db/store.js'
import { todayKey } from '../utils/date.js'

/**
 * GET /api/data/export
 * Returns a full JSON export of all server-stored data.
 * Note: Firestore data is exported from the client (api.js → data.export()).
 */
export function exportData(req, res) {
  const snap = store.snapshot()
  snap.exportedAt = new Date().toISOString()
  res.setHeader('Content-Disposition', `attachment; filename="clearmymind-server-backup-${todayKey()}.json"`)
  res.setHeader('Content-Type', 'application/json')
  res.json(snap)
}

/**
 * DELETE /api/data/reset
 * Wipes all server-stored data and resets to defaults.
 * Requires confirmation header: X-Confirm-Reset: yes
 */
export function resetAllData(req, res) {
  const confirm = req.headers['x-confirm-reset']
  if (confirm !== 'yes') {
    return res.status(400).json({ error: 'Send header X-Confirm-Reset: yes to confirm.' })
  }

  store.set('settings', { name: '', noclear: false })

  res.json({ message: 'All server data reset successfully.' })
}
