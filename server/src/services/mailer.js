/**
 * mailer.js — Brevo SMTP email service
 * ======================================
 * Sends transactional emails via Brevo (formerly Sendinblue) SMTP relay.
 * Uses nodemailer with SMTP credentials from .env
 *
 * Mirrors EveryDay's server/src/services/mailer.js — adapted for ClearMyMind.
 */

import nodemailer from 'nodemailer'

// ── SMTP Transporter ──────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port:   parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false,   // STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

// Verify connection on startup (non-blocking)
transporter.verify().then(() => {
  console.log('[Mailer] ✅ Brevo SMTP connection verified — ready to send')
}).catch(err => {
  console.warn('[Mailer] ⚠️  Brevo SMTP verify failed:', err.message)
})

// ── Email Templates ───────────────────────────────────────────────────────────

function _verificationHTML(verifyUrl, email) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Verify your ClearMyMind account</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#080810;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#f1f0fc;padding:40px 16px}
  .wrap{max-width:480px;margin:0 auto}
  .card{background:#13131f;border:1px solid rgba(168,85,247,0.25);border-radius:16px;overflow:hidden}
  .top-bar{height:3px;background:linear-gradient(90deg,#a855f7,#06b6d4)}
  .body{padding:36px 32px}
  .logo{display:flex;align-items:center;gap:10px;margin-bottom:28px}
  .logo-icon{width:36px;height:36px;background:linear-gradient(135deg,#a855f7,#06b6d4);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px}
  .logo-name{font-size:18px;font-weight:800;color:#fff;letter-spacing:-0.02em}
  h1{font-size:22px;font-weight:800;color:#f1f0fc;margin-bottom:8px;letter-spacing:-0.03em}
  .sub{font-size:14px;color:#a09ec5;margin-bottom:28px;line-height:1.6}
  .sub strong{color:#f1f0fc}
  .btn{display:block;background:linear-gradient(135deg,#a855f7,#c084fc);color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:14px 24px;border-radius:10px;letter-spacing:0.01em;margin-bottom:24px}
  .divider{border:none;border-top:1px solid rgba(255,255,255,0.06);margin:20px 0}
  .url-label{font-size:11px;color:#5a5878;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em}
  .url-box{background:#0f0f1a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 14px;font-size:11px;color:#5a5878;word-break:break-all;line-height:1.4}
  .footer{margin-top:24px;font-size:12px;color:#2a2840;text-align:center;line-height:1.6}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="top-bar"></div>
    <div class="body">
      <div class="logo">
        <div class="logo-icon">🧠</div>
        <span class="logo-name">ClearMyMind</span>
      </div>

      <h1>Verify your email</h1>
      <p class="sub">
        You're one step away from clearing your mind with confidence.<br><br>
        Click the button below to verify <strong>${email}</strong> and activate your account.
      </p>

      <a href="${verifyUrl}" class="btn">✓ Verify my account</a>

      <hr class="divider"/>
      <p class="url-label">Or copy this link into your browser</p>
      <div class="url-box">${verifyUrl}</div>
    </div>
  </div>
  <p class="footer">
    If you didn't create a ClearMyMind account, you can safely ignore this email.<br>
    This link expires in 24 hours.
  </p>
</div>
</body>
</html>`
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * sendVerificationEmail — send a verification link to the user via Brevo SMTP.
 *
 * @param {object} opts
 * @param {string} opts.to    — recipient email address
 * @param {string} opts.uid   — Firebase UID (embedded in the verify URL)
 * @param {string} opts.token — UUID verification token (generated client-side, stored in Firestore)
 */
export async function sendVerificationEmail({ to, uid, token }) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
  const verifyUrl = `${clientUrl}/?verify=${token}&uid=${encodeURIComponent(uid)}`

  const info = await transporter.sendMail({
    from:    `"ClearMyMind" <${process.env.EMAIL_FROM}>`,
    to,
    subject: '🧠 Verify your ClearMyMind account',
    html:    _verificationHTML(verifyUrl, to),
    text:    `Verify your ClearMyMind account:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`,
  })

  console.log(`[Mailer] ✉️  Verification email sent to ${to} — messageId: ${info.messageId}`)
  return info
}
