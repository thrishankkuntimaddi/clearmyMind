/**
 * settings.routes.js — User settings endpoints
 * ==============================================
 * GET   /api/settings  — Get current settings
 * PATCH /api/settings  — Update settings (partial)
 *
 * Mirrors EveryDay's settings.routes.js.
 */

import express from 'express'
import { getSettings, updateSettings } from '../controllers/settings.controller.js'

const router = express.Router()

router.get('/',   getSettings)
router.patch('/', updateSettings)

export default router
