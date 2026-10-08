/**
 * auth.routes.js — Authentication email endpoints (caller's own email only)
 * ==========================================================================
 * POST /api/auth/send-verification   — email the signed-in user a verification link
 * POST /api/auth/resend-verification — alias
 */

import express from 'express'
import { sendVerification } from '../controllers/auth.controller.js'
import { rateLimit } from '../middleware/security.js'

const router = express.Router()

// Email is expensive and abusable: 3 per user per hour
const emailLimit = rateLimit({
  windowMs: 60 * 60_000,
  max: 3,
  key: (req) => req.user.uid,
  message: 'Too many verification emails — try again later.',
})

router.post('/send-verification',   emailLimit, sendVerification)
router.post('/resend-verification', emailLimit, sendVerification)

export default router
