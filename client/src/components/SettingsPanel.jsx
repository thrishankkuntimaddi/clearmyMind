import { useState, useCallback, useEffect, useRef } from 'react'
import { deleteAllUserData } from '../lib/db.js'
import styles from './SettingsPanel.module.css'

export default function SettingsPanel({
  user,
  isLockEnabled,
  onSignOut,
  onDeleteAccount,
  onResetData,
  onEnableLock,
  onDisableLock,
  onChangePassword,
  onClose,
}) {
  // ── Local UI state ────────────────────────────────────────────────────────
  const [view, setView]       = useState('main') // 'main' | 'changePwd' | 'disableLock' | 'confirm'
  const [confirmAction, setConfirmAction] = useState(null) // { label, danger, run }
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  // Change-password form
  const [oldPwd, setOldPwd]   = useState('')
  const [newPwd, setNewPwd]   = useState('')
  const [cfmPwd, setCfmPwd]   = useState('')

  // Disable-lock confirmation form
  const [lockPwd, setLockPwd] = useState('')

  const panelRef = useRef(null)

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Close on backdrop click
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose()
  }

  function clearMessages() { setError(''); setSuccess('') }
  function goMain() { setView('main'); clearMessages(); setOldPwd(''); setNewPwd(''); setCfmPwd(''); setLockPwd('') }

  // ── Sign out ──────────────────────────────────────────────────────────────
  const handleSignOut = useCallback(async () => {
    setLoading(true)
    await onSignOut()
    // Auth state change will unmount this panel automatically
  }, [onSignOut])

  // ── Reset all data ────────────────────────────────────────────────────────
  function askResetData() {
    setConfirmAction({
      label: 'This will permanently erase ALL your names, groups, bag, and tags across every device. This cannot be undone.',
      danger: true,
      btnLabel: 'Yes, reset everything',
      run: async () => {
        setLoading(true)
        await onResetData()
        setLoading(false)
        goMain()
        setSuccess('All data has been reset.')
      },
    })
    setView('confirm')
  }

  // ── Delete account ────────────────────────────────────────────────────────
  function askDeleteAccount() {
    setConfirmAction({
      label: 'This will permanently delete your account AND all data. You cannot undo this.',
      danger: true,
      btnLabel: 'Yes, delete my account',
      run: async () => {
        setLoading(true)
        // Wipe Firestore data first
        if (user?.uid) await deleteAllUserData(user.uid)
        const result = await onDeleteAccount()
        setLoading(false)
        if (!result?.success) {
          setError(result?.error ?? 'Failed. You may need to sign out and sign in again first.')
          setView('main')
        }
        // On success, authState change unmounts this component
      },
    })
    setView('confirm')
  }

  // ── Change password ───────────────────────────────────────────────────────
  async function handleChangePassword(e) {
    e.preventDefault()
    if (newPwd.length < 4) { setError('New password must be at least 4 characters.'); return }
    if (newPwd !== cfmPwd) { setError('New passwords do not match.'); return }
    setLoading(true); clearMessages()
    const result = await onChangePassword(oldPwd, newPwd)
    setLoading(false)
    if (result.success) { setSuccess('Password changed.'); goMain() }
    else setError(result.error)
  }

  // ── Disable lock ──────────────────────────────────────────────────────────
  async function handleDisableLock(e) {
    e.preventDefault()
    setLoading(true); clearMessages()
    const result = await onDisableLock(lockPwd)
    setLoading(false)
    if (result.success) { setSuccess('App Lock disabled.'); goMain() }
    else setError(result.error)
  }

  // ─── Render: Confirm dialog ───────────────────────────────────────────────
  if (view === 'confirm' && confirmAction) {
    return (
      <div className={styles.backdrop} onClick={handleBackdrop}>
        <div className={styles.panel} ref={panelRef}>
          <div className={styles.header}>
            <button className={styles.backBtn} onClick={goMain} aria-label="Back">←</button>
            <h2 className={styles.panelTitle}>Are you sure?</h2>
          </div>
          <p className={styles.confirmText}>{confirmAction.label}</p>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.confirmBtns}>
            <button className={styles.cancelBtn} onClick={goMain} disabled={loading}>Cancel</button>
            <button
              className={`${styles.dangerBtn} ${loading ? styles.btnLoading : ''}`}
              onClick={confirmAction.run}
              disabled={loading}
            >
              {loading ? '…' : confirmAction.btnLabel}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render: Change password ──────────────────────────────────────────────
  if (view === 'changePwd') {
    return (
      <div className={styles.backdrop} onClick={handleBackdrop}>
        <div className={styles.panel} ref={panelRef}>
          <div className={styles.header}>
            <button className={styles.backBtn} onClick={goMain} aria-label="Back">←</button>
            <h2 className={styles.panelTitle}>Change Lock Password</h2>
          </div>
          {error   && <p className={styles.error}   role="alert">{error}</p>}
          {success && <p className={styles.success} role="status">{success}</p>}
          <form className={styles.form} onSubmit={handleChangePassword}>
            <input className={styles.input} type="password" placeholder="Current password"
              value={oldPwd} onChange={(e) => { setOldPwd(e.target.value); clearMessages() }}
              autoFocus disabled={loading} />
            <input className={styles.input} type="password" placeholder="New password (min 4)"
              value={newPwd} onChange={(e) => { setNewPwd(e.target.value); clearMessages() }}
              disabled={loading} />
            <input className={styles.input} type="password" placeholder="Confirm new password"
              value={cfmPwd} onChange={(e) => { setCfmPwd(e.target.value); clearMessages() }}
              disabled={loading} />
            <button type="submit" className={styles.primaryBtn} disabled={loading || !oldPwd || !newPwd || !cfmPwd}>
              {loading ? '…' : 'Save new password'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── Render: Disable lock ─────────────────────────────────────────────────
  if (view === 'disableLock') {
    return (
      <div className={styles.backdrop} onClick={handleBackdrop}>
        <div className={styles.panel} ref={panelRef}>
          <div className={styles.header}>
            <button className={styles.backBtn} onClick={goMain} aria-label="Back">←</button>
            <h2 className={styles.panelTitle}>Disable App Lock</h2>
          </div>
          <p className={styles.hint}>Enter your current lock password to confirm.</p>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <form className={styles.form} onSubmit={handleDisableLock}>
            <input className={styles.input} type="password" placeholder="Current lock password"
              value={lockPwd} onChange={(e) => { setLockPwd(e.target.value); clearMessages() }}
              autoFocus disabled={loading} />
            <button type="submit" className={styles.dangerBtn} disabled={loading || !lockPwd}>
              {loading ? '…' : 'Disable App Lock'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── Render: Main settings ────────────────────────────────────────────────
  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.panel} ref={panelRef}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.panelTitle}>⚙️ Settings</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close settings">×</button>
        </div>

        {success && <p className={styles.success} role="status">{success}</p>}

        {/* ── Account section ── */}
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Account</p>
          <div className={styles.accountCard}>
            <span className={styles.accountAvatar}>👤</span>
            <div>
              <p className={styles.accountEmail}>{user?.email}</p>
              <p className={styles.accountNote}>Signed in via Firebase</p>
            </div>
          </div>
          <button id="settings-signout" className={styles.rowBtn} onClick={handleSignOut} disabled={loading}>
            <span>🚪</span> Sign out
          </button>
        </section>

        {/* ── Data section ── */}
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Data</p>
          <button id="settings-reset" className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={askResetData} disabled={loading}>
            <span>🗑️</span> Reset all data
          </button>
          <button id="settings-delete-account" className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={askDeleteAccount} disabled={loading}>
            <span>⚠️</span> Delete account
          </button>
        </section>

        {/* ── App Lock section ── */}
        <section className={styles.section}>
          <p className={styles.sectionLabel}>App Lock (device)</p>
          {isLockEnabled ? (
            <>
              <div className={styles.lockStatusBadge}>
                <span>🔒</span> App Lock is <strong>enabled</strong>
              </div>
              <button id="settings-change-pwd" className={styles.rowBtn} onClick={() => { setView('changePwd'); clearMessages() }} disabled={loading}>
                <span>🔑</span> Change lock password
              </button>
              <button id="settings-disable-lock" className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={() => { setView('disableLock'); clearMessages() }} disabled={loading}>
                <span>🔓</span> Disable App Lock
              </button>
            </>
          ) : (
            <>
              <div className={`${styles.lockStatusBadge} ${styles.lockDisabled}`}>
                <span>🔓</span> App Lock is <strong>disabled</strong>
              </div>
              <button id="settings-enable-lock" className={styles.rowBtn} onClick={() => { onEnableLock(); onClose() }} disabled={loading}>
                <span>🔒</span> Enable App Lock
              </button>
            </>
          )}
        </section>

        <p className={styles.footer}>
          ClearMyMind — synced via Firebase ☁️
        </p>
      </div>
    </div>
  )
}
