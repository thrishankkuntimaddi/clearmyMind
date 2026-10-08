/**
 * data.routes.js — Export / reset the caller's server-side data
 * ===============================================================
 * GET    /api/data/export  — caller's data as JSON
 * DELETE /api/data/reset   — wipe caller's data (header X-Confirm-Reset: yes)
 */

import express from 'express'
import { exportData, resetAllData } from '../controllers/data.controller.js'

const router = express.Router()

router.get('/export',  exportData)
router.delete('/reset', resetAllData)

export default router
