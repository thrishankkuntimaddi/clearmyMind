import { useState, useCallback } from 'react'
import styles from './VerifyEmailScreen.module.css'

export default function VerifyEmailScreen({ user, onResend, onSignOut }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const handleResend = useCallback(async () => {
    if (sending || sent) return
    setSending(true)
    const result = await onResend()
    setSending(false)
    if (result?.success !== false) {
      setSent(true)
      setTimeout(() => setSent(false), 8000)
    }
  }, [sending, sent, onResend])

  const handleSignOut = useCallback(async () => {
    setSigningOut(true)
    await onSignOut()
  }, [onSignOut])

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.iconWrap}>
          <span className={styles.icon}>📬</span>
        </div>

        <h1 className={styles.title}>Verify your email</h1>

        <p className={styles.message}>
          We sent a verification link to<br />
          <strong className={styles.email}>{user?.email}</strong>
        </p>

        <p className={styles.hint}>
          Click the link in your inbox to activate your account, then come back and sign in.
        </p>

        {sent && (
          <p className={styles.sentBadge} role="status">
            ✓ Email resent — check your inbox
          </p>
        )}

        <div className={styles.actions}>
          <button
            id="resend-email-btn"
            className={styles.resendBtn}
            onClick={handleResend}
            disabled={sending || sent}
          >
            {sending ? '…Sending' : sent ? '✓ Sent!' : '↺ Resend email'}
          </button>

          <button
            id="verify-signout-btn"
            className={styles.signOutBtn}
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? '…' : 'Sign out'}
          </button>
        </div>

        <p className={styles.tip}>
          💡 After verifying, refresh this page or sign in again.
        </p>
      </div>
    </div>
  )
}
