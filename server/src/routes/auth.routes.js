/**
 * auth.routes.js — Authentication email endpoints
 * =================================================
 * POST /api/auth/send-verification   — send verification email via Brevo SMTP
 * POST /api/auth/resend-verification — resend (alias)
 *
 * Mirrors EveryDay's auth.routes.js.
 */

import express from 'express'
import { sendVerification } from '../controllers/auth.controller.js'

const router = express.Router()

// POST /api/auth/send-verification
router.post('/send-verification', sendVerification)

// Alias — resend uses the same logic
router.post('/resend-verification', sendVerification)

export default router
