import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './AuthScreen.module.css'

export default function AuthScreen({
  mode,           // 'setup' | 'locked'
  attemptsLeft,
  biometricAvailable,
  onSetup,
  onLogin,
  onBiometric,
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const inputRef = useRef(null)

  // Auto-focus when mode changes
  useEffect(() => {
    setPassword('')
    setConfirm('')
    setError('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [mode])

  const clearError = useCallback(() => setError(''), [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (loading) return
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
        setError(result.wiped
          ? '3 failed attempts — all data has been wiped. Start fresh.'
          : `Incorrect password. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.`)
      }
    }
  }

  async function handleBiometric() {
    setLoading(true)
    const ok = await onBiometric()
    setLoading(false)
    if (!ok) setError('Biometric verification failed. Use your password.')
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

        {biometricAvailable && (
          <button
            id="auth-biometric"
            className={styles.biometricBtn}
            onClick={handleBiometric}
            disabled={loading}
            aria-label="Unlock with fingerprint"
          >
            <span aria-hidden="true">☝️</span>
            Use fingerprint
          </button>
        )}
      </div>
    </div>
  )
}

// mirrored constant (hook is the source of truth)
const MAX_ATTEMPTS = 3
