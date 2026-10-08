import { useState, useEffect } from 'react'
import styles from './SettingsPanel.module.css'

export default function SettingsPanel({
  user,
  onSignOut,
  onDeleteData,      // () => Promise<boolean> — wipes all ClearMyMind data
  onDeleteAccount,   // (password) => Promise<{ success, error? }>
  onClose,
}) {
  const [view, setView]         = useState('main') // 'main' | 'deleteData' | 'deleteAccount'
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [password, setPassword] = useState('')

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !loading) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, loading])

  function handleBackdrop(e) {
    if (e.target === e.currentTarget && !loading) onClose()
  }

  function goMain() { setView('main'); setError(''); setPassword('') }

  async function handleSignOut() {
    setLoading(true)
    await onSignOut()
  }

  async function handleDeleteData() {
    setLoading(true); setError('')
    const ok = await onDeleteData()
    setLoading(false)
    if (ok) { goMain(); setSuccess('All your ClearMyMind data has been deleted.') }
    else setError('Could not delete your data. Check your connection and try again.')
  }

  async function handleDeleteAccount(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const result = await onDeleteAccount(password)
    setLoading(false)
    if (!result?.success) setError(result?.error ?? 'Failed to delete account.')
    // On success the auth state change unmounts this panel
  }

  // ─── Confirm: delete all data ─────────────────────────────────────────────
  if (view === 'deleteData') {
    return (
      <div className={styles.backdrop} onClick={handleBackdrop}>
        <div className={styles.panel}>
          <div className={styles.header}>
            <button className={styles.backBtn} onClick={goMain} disabled={loading} aria-label="Back">←</button>
            <h2 className={styles.panelTitle}>Delete all data?</h2>
          </div>
          <p className={styles.confirmText}>
            Every sheet, name and colour you've saved in ClearMyMind will be permanently
            deleted from the cloud. Your account stays. This can't be undone.
          </p>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.confirmBtns}>
            <button className={styles.cancelBtn} onClick={goMain} disabled={loading}>Cancel</button>
            <button className={styles.dangerBtn} onClick={handleDeleteData} disabled={loading}>
              {loading ? '…' : 'Delete everything'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Confirm: delete account (password required) ─────────────────────────
  if (view === 'deleteAccount') {
    return (
      <div className={styles.backdrop} onClick={handleBackdrop}>
        <div className={styles.panel}>
          <div className={styles.header}>
            <button className={styles.backBtn} onClick={goMain} disabled={loading} aria-label="Back">←</button>
            <h2 className={styles.panelTitle}>Delete account?</h2>
          </div>
          <p className={styles.confirmText}>
            This deletes all your ClearMyMind data <strong>and</strong> your sign-in account.
            The same account is shared by other PASSI apps — you won't be able to sign in
            to those either. This can't be undone.
          </p>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <form className={styles.form} onSubmit={handleDeleteAccount}>
            <input
              className={styles.input}
              type="password"
              placeholder="Enter your password to confirm"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              autoFocus
              disabled={loading}
            />
            <div className={styles.confirmBtns}>
              <button type="button" className={styles.cancelBtn} onClick={goMain} disabled={loading}>Cancel</button>
              <button type="submit" className={styles.dangerBtn} disabled={loading || !password}>
                {loading ? '…' : 'Delete my account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // ─── Main ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.panelTitle}>⚙️ Settings</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close settings">×</button>
        </div>

        {success && <p className={styles.success} role="status">{success}</p>}

        <section className={styles.section}>
          <p className={styles.sectionLabel}>Account</p>
          <div className={styles.accountCard}>
            <span className={styles.accountAvatar}>👤</span>
            <div>
              <p className={styles.accountEmail}>{user?.email}</p>
              <p className={styles.accountNote}>Your data is private to this account</p>
            </div>
          </div>
          <button id="settings-signout" className={styles.rowBtn} onClick={handleSignOut} disabled={loading}>
            <span>🚪</span> Sign out
          </button>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionLabel}>Data</p>
          <button id="settings-delete-data" className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={() => { setSuccess(''); setView('deleteData') }} disabled={loading}>
            <span>🗑️</span> Delete all my data
          </button>
          <button id="settings-delete-account" className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={() => { setSuccess(''); setView('deleteAccount') }} disabled={loading}>
            <span>⚠️</span> Delete account
          </button>
        </section>

        <p className={styles.footer}>
          Synced privately via Firebase · nothing is stored on this device
        </p>
      </div>
    </div>
  )
}
