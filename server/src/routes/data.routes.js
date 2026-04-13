/**
 * data.routes.js — Data export and reset endpoints
 * ==================================================
 * GET    /api/data/export  — Full data JSON export
 * DELETE /api/data/reset   — Wipe all server data (X-Confirm-Reset: yes)
 *
 * Mirrors EveryDay's data.routes.js.
 */

import express from 'express'
import { exportData, resetAllData } from '../controllers/data.controller.js'

const router = express.Router()

router.get('/export',  exportData)
router.delete('/reset', resetAllData)

export default router
