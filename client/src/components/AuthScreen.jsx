import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './AuthScreen.module.css'

export default function AuthScreen({
  mode,               // 'setup' | 'locked'
  attemptsLeft,
  biometricAvailable, // true when locked + credential exists
  bioSetupState,      // 'idle' | 'offering' | 'registering'
  onSetup,
  onLogin,
  onBiometric,        // called directly from onClick → user gesture preserved
  onEnrollBiometric,  // called directly from onClick → user gesture preserved
  onSkipBiometric,
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  // Separate state for the security wipe flow — once wiping starts the async
  // handleWipe() is running; the page will reload shortly. We freeze the UI.
  const [wiping, setWiping]     = useState(false)
  const inputRef = useRef(null)

  // Reset form when mode changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPassword('')
     
    setConfirm('')
     
    setError('')
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [mode])

  const clearError = useCallback(() => setError(''), [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (loading || wiping) return
    const pwd = password.trim()
    if (!pwd) return

    if (mode === 'setup') {
      if (pwd.length < 4) { setError('Password must be at least 4 characters'); return }
      if (pwd !== confirm.trim()) { setError('Passwords do not match'); return }
      setLoading(true)
      await onSetup(pwd)
      setLoading(false)
    } else {
      setLoading(true)
      const result = await onLogin(pwd)
      setLoading(false)
      if (!result.success) {
        setPassword('')
        if (result.wiped) {
          // Freeze the UI — handleWipe() is now running asynchronously.
          // The page will reload in a moment; show a clear wipe message.
          setWiping(true)
        } else {
          setError(`Incorrect password. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.`)
        }
      }
    }
  }

  // ── Direct click handler — user gesture is preserved ──────────────────────
  // DO NOT put any await before calling onBiometric; the browser gesture context
  // must flow directly into navigator.credentials.get()
  function handleBiometricClick() {
    if (loading) return
    setLoading(true)
    setError('')
    onBiometric().then(ok => {
      setLoading(false)
      if (!ok) setError('Fingerprint not recognised. Use your password.')
    })
  }

  function handleEnrollClick() {
    if (loading) return
    setLoading(true)
    onEnrollBiometric().then(ok => {
      setLoading(false)
      if (!ok) setError('Fingerprint setup was skipped or not supported.')
    })
  }

  // ── Fingerprint enrol offer (shown after password setup) ──────────────────
  // ── Security wipe in progress ─────────────────────────────────────────────
  // handleWipe() is running async (stop listeners → clear storage → sign out →
  // reload). Freeze the entire UI so the user sees a clear message.
  if (wiping) {
    return (
      <div className={styles.overlay}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true" style={{ filter: 'grayscale(1)' }}>⚠️</div>
          <h1 className={styles.title} style={{ color: '#f87171' }}>Too many attempts</h1>
          <p className={styles.subtitle} style={{ color: '#f87171', fontWeight: 600 }}>
            Wiping all data and signing you out…
          </p>
          <p className={styles.subtitle} style={{ marginTop: '8px', color: '#9ca3af', fontSize: '0.85rem' }}>
            This device's data is being permanently erased. The app will restart momentarily.
          </p>
        </div>
      </div>
    )
  }

  if (bioSetupState === 'offering' || bioSetupState === 'registering') {
    return (
      <div className={styles.overlay}>
        <div className={styles.card}>
          <div className={styles.fingerprintIcon} aria-hidden="true">🔐</div>
          <h1 className={styles.title}>Enable Fingerprint?</h1>
          <p className={styles.subtitle}>
            Use your fingerprint or Face ID to unlock the app instantly — no password needed.
          </p>

          {error && <p className={styles.error} role="alert">{error}</p>}

          {/* ── This button click IS the user gesture — navigator.credentials.create fires inside ── */}
          <button
            id="enroll-biometric-btn"
            className={styles.enrollBtn}
            onClick={handleEnrollClick}
            disabled={loading || bioSetupState === 'registering'}
          >
            <span aria-hidden="true">👆</span>
            {bioSetupState === 'registering' ? 'Follow the prompt…' : 'Set up Fingerprint / Face ID'}
          </button>

          <button
            id="skip-biometric-btn"
            className={styles.skipBtn}
            onClick={onSkipBiometric}
            disabled={loading || bioSetupState === 'registering'}
          >
            Skip for now
          </button>
        </div>
      </div>
    )
  }

  const showWarn = mode === 'locked' && attemptsLeft < MAX_ATTEMPTS && !error

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true">🧠</div>

        <h1 className={styles.title}>
          {mode === 'setup' ? 'Protect your mind' : 'ClearMyMind'}
        </h1>
        <p className={styles.subtitle}>
          {mode === 'setup'
            ? 'Set a password — wrong 3× wipes everything'
            : 'Enter your password to unlock'}
        </p>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {showWarn && (
          <p className={styles.warn} role="alert">
            ⚠ {attemptsLeft} attempt{attemptsLeft === 1 ? '' : 's'} remaining
          </p>
        )}

        {/* ── Fingerprint button ABOVE the password form — hard to miss ── */}
        {biometricAvailable && (
          <button
            id="auth-biometric"
            className={styles.biometricBtn}
            onClick={handleBiometricClick}
            disabled={loading}
            aria-label="Unlock with fingerprint"
          >
            <span className={styles.biometricFingerprintIcon} aria-hidden="true">👆</span>
            <span className={styles.biometricLabel}>
              <strong>Use Fingerprint / Face ID</strong>
              <small>Tap to unlock instantly</small>
            </span>
          </button>
        )}

        {biometricAvailable && (
          <div className={styles.orDivider}>
            <span>or enter password</span>
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <input
            ref={inputRef}
            id="auth-password"
            type="password"
            className={styles.input}
            placeholder="Password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearError() }}
            autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
            disabled={loading}
          />
          {mode === 'setup' && (
            <input
              id="auth-confirm"
              type="password"
              className={styles.input}
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); clearError() }}
              autoComplete="new-password"
              disabled={loading}
            />
          )}
          <button
            id="auth-submit"
            type="submit"
            className={styles.submitBtn}
            disabled={loading || !password.trim()}
          >
            {loading ? '…' : mode === 'setup' ? 'Set Password' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}

// mirrored constant (hook is the source of truth)
const MAX_ATTEMPTS = 3
