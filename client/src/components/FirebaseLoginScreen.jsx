import { useState, useRef } from 'react'
import styles from './FirebaseLoginScreen.module.css'

const MIN_PASSWORD = 8

export default function FirebaseLoginScreen({ onSignIn, onSignUp, onResetPassword }) {
  const [tab, setTab]           = useState('signin') // 'signin' | 'signup' | 'reset'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState('')
  const emailRef = useRef(null)

  function switchTab(t) {
    setTab(t)
    setError('')
    setSuccess('')
    setPassword('')
    setConfirm('')
    setTimeout(() => emailRef.current?.focus(), 60)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (loading) return
    const em  = email.trim()
    // Passwords are used exactly as typed — never trimmed.
    const pwd = password
    if (!em || (tab !== 'reset' && !pwd)) { setError('Please fill in all fields.'); return }

    if (tab === 'signup') {
      if (pwd.length < MIN_PASSWORD) { setError(`Password must be at least ${MIN_PASSWORD} characters.`); return }
      if (pwd !== confirm)           { setError('Passwords do not match.'); return }
    }

    setLoading(true)
    setError('')
    setSuccess('')

    const result = tab === 'signin' ? await onSignIn(em, pwd)
      : tab === 'signup'            ? await onSignUp(em, pwd)
      :                               await onResetPassword(em)

    setLoading(false)

    if (!result.success) {
      setError(result.error ?? 'Something went wrong.')
    } else if (tab === 'reset') {
      setSuccess('If an account exists for that email, a reset link is on its way.')
      setTab('signin')
    } else if (tab === 'signup') {
      setSuccess('Account created! Check your email to verify, then sign in.')
      setTab('signin')
      setPassword('')
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        {/* ── Brand ── */}
        <div className={styles.brand}>
          <span className={styles.brandIcon}>🧠</span>
          <h1 className={styles.brandName}>ClearMyMind</h1>
          <p className={styles.brandTagline}>Your mind, organised.</p>
        </div>

        {/* ── Tabs ── */}
        <div className={styles.tabs}>
          <button
            id="tab-signin"
            className={`${styles.tab} ${tab === 'signin' ? styles.tabActive : ''}`}
            onClick={() => switchTab('signin')}
            type="button"
          >Sign in</button>
          <button
            id="tab-signup"
            className={`${styles.tab} ${tab === 'signup' ? styles.tabActive : ''}`}
            onClick={() => switchTab('signup')}
            type="button"
          >Create account</button>
        </div>

        {/* ── Messages ── */}
        {error   && <p className={styles.error}   role="alert">{error}</p>}
        {success && <p className={styles.success} role="status">{success}</p>}

        {/* ── Form ── */}
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="fb-email">Email</label>
            <input
              ref={emailRef}
              id="fb-email"
              type="email"
              className={styles.input}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError('') }}
              autoComplete="email"
              disabled={loading}
              autoFocus
            />
          </div>

          {tab !== 'reset' && <div className={styles.field}>
            <label className={styles.label} htmlFor="fb-password">Password</label>
            <input
              id="fb-password"
              type="password"
              className={styles.input}
              placeholder={tab === 'signup' ? `At least ${MIN_PASSWORD} characters` : 'Your password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              disabled={loading}
            />
          </div>}

          {tab === 'signup' && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="fb-confirm">Confirm password</label>
              <input
                id="fb-confirm"
                type="password"
                className={styles.input}
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError('') }}
                autoComplete="new-password"
                disabled={loading}
              />
            </div>
          )}

          <button
            id="fb-submit"
            type="submit"
            className={styles.submitBtn}
            disabled={loading || !email.trim() || (tab !== 'reset' && !password)}
          >
            {loading
              ? <span className={styles.spinner}>⟳</span>
              : tab === 'signin' ? 'Sign in' : tab === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
        </form>

        {tab === 'signin' && (
          <p className={styles.footnote}>
            <button type="button" className={styles.switchLink} onClick={() => switchTab('reset')}>
              Forgot password?
            </button>
          </p>
        )}

        <p className={styles.footnote}>
          {tab === 'signin'
            ? 'New here? '
            : 'Already have an account? '}
          <button
            type="button"
            className={styles.switchLink}
            onClick={() => switchTab(tab === 'signin' ? 'signup' : 'signin')}
          >
            {tab === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
