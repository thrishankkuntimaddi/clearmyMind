/**
 * auth.controller.js
 *
 * Handles Firebase Auth supplemental operations.
 * Primary auth is Firebase Auth (client SDK) — this server handles
 * transactional email delivery only (Brevo SMTP via mailer.js).
 */

import { sendVerificationEmail } from '../services/mailer.js'

/**
 * POST /api/auth/send-verification
 * Sends a verification email to the user via Brevo SMTP.
 * Body: { email, uid, token }
 */
export async function sendVerification(req, res) {
  const { email, uid, token } = req.body

  if (!email || !uid || !token) {
    return res.status(400).json({ error: 'Missing required fields: email, uid, token' })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' })
  }

  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return res.status(400).json({ error: 'Invalid verification token format (expected UUID)' })
  }

  try {
    await sendVerificationEmail({ to: email, uid, token })
    return res.json({ success: true, message: `Verification email sent to ${email}` })
  } catch (err) {
    console.error('[Auth Controller] Failed to send verification email:', err.message)
    return res.status(500).json({ error: 'Email delivery failed: ' + err.message })
  }
}
