/**
 * data.controller.js
 *
 * Export and reset — scoped to the authenticated user (req.user.uid).
 * Firestore data is exported from the client; this covers server-side data only.
 */

import * as store from '../db/store.js'
import { todayKey } from '../utils/date.js'

/** GET /api/data/export */
export function exportData(req, res) {
  const snap = { settings: store.getUser(req.user.uid), exportedAt: new Date().toISOString() }
  res.setHeader('Content-Disposition', `attachment; filename="clearmymind-server-backup-${todayKey()}.json"`)
  res.json(snap)
}

/** DELETE /api/data/reset — requires header X-Confirm-Reset: yes */
export function resetAllData(req, res) {
  if (req.get('x-confirm-reset') !== 'yes') {
    return res.status(400).json({ error: 'Send header X-Confirm-Reset: yes to confirm.' })
  }
  store.deleteUser(req.user.uid)
  res.json({ message: 'Your server data has been reset.' })
}
