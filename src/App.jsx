import { useState, useCallback, useEffect, useRef } from 'react'
import { useNames }    from './hooks/useNames.js'
import { useAuth }     from './hooks/useAuth.js'
import { useAutoWipe } from './hooks/useAutoWipe.js'
import AuthScreen      from './components/AuthScreen.jsx'
import NameInput       from './components/NameInput.jsx'
import NameGrid        from './components/NameGrid.jsx'
import BlastAnimation  from './components/BlastAnimation.jsx'
import CongratsScreen  from './components/CongratsScreen.jsx'
import styles from './App.module.css'

export default function App() {
  // ─── Auth ────────────────────────────────────────────────────────────────
  const { status, attemptsLeft, biometricAvailable,
          setupPassword, login, loginBiometric, lock } = useAuth()

  // ─── Names ───────────────────────────────────────────────────────────────
  const { names, addName, editName, removeName, clearAll, reloadFromStorage } = useNames()

  const prevStatus = useRef(status)
  useEffect(() => {
    if (prevStatus.current !== 'unlocked' && status === 'unlocked') reloadFromStorage()
    prevStatus.current = status
  }, [status, reloadFromStorage])

  // ─── Auto-wipe ────────────────────────────────────────────────────────────
  const { phase, countdown, handleWait, handleBlastComplete, handleCongratsClose, isWarning }
    = useAutoWipe(names.length)

  const capturedNames = useRef([])
  const hasBlasted    = useRef(false)    // prevents StrictMode double-run from wiping capturedNames

  useEffect(() => {
    if (phase === 'blasting' && !hasBlasted.current) {
      // Capture BEFORE clearAll so StrictMode's second invocation sees names=[]
      // and the guard skips it
      hasBlasted.current  = true
      capturedNames.current = [...names]
      clearAll()
    }
    if (phase === 'idle') {
      // Reset for next blast cycle
      hasBlasted.current = false
    }
  }, [phase])   // eslint-disable-line — intentionally omit names/clearAll

  // ─── Copy ────────────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    if (!names.length) return
    try {
      await navigator.clipboard.writeText(names.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /**/ }
  }, [names])

  // ─── Paste to load ───────────────────────────────────────────────────────
  const [restored, setRestored] = useState(0)   // 0 = toast hidden

  useEffect(() => {
    if (status !== 'unlocked') return

    function handlePaste(e) {
      const text  = e.clipboardData?.getData('text/plain') ?? ''
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

      // Single-name paste while an input is focused → let browser handle normally
      if (lines.length <= 1 && document.activeElement?.tagName === 'INPUT') return
      if (lines.length < 1) return

      e.preventDefault()
      let added = 0
      lines.forEach(name => { if (addName(name)) added++ })

      if (added > 0) {
        setRestored(added)
        setTimeout(() => setRestored(0), 2500)
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [status, addName])

  // ─── Auth screens ─────────────────────────────────────────────────────────
  if (status === 'setup' || status === 'locked') {
    return (
      <AuthScreen
        mode={status}
        attemptsLeft={attemptsLeft}
        biometricAvailable={biometricAvailable}
        onSetup={setupPassword}
        onLogin={login}
        onBiometric={loginBiometric}
      />
    )
  }

  if (phase === 'blasting') {
    return <BlastAnimation names={capturedNames.current} onComplete={handleBlastComplete} />
  }

  if (phase === 'congrats') {
    return <CongratsScreen onClose={handleCongratsClose} />
  }

  // ── Timer display helpers ──────────────────────────────────────────────────
  const mins    = Math.floor(countdown / 60)
  const secs    = countdown % 60
  const timeStr = countdown >= 60
    ? `${mins}:${secs.toString().padStart(2, '0')}`
    : `${countdown}s`

  const timerClass = phase === 'critical' ? styles.timerCritical : styles.timerExtended

  // ─── Main app ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon} aria-hidden="true">🧠</span>
          <span className={styles.title}>ClearMyMind</span>
          {names.length > 0 && (
            <span
              className={`${styles.count} ${
                names.length >= 90 ? styles.countCritical :
                names.length >= 80 ? styles.countWarn : ''}`}
              aria-live="polite"
            >
              {names.length}
            </span>
          )}
        </div>

        <div className={styles.actions}>
          {/* ── pending: only show Wait button, no timer yet ── */}
          {phase === 'pending' && (
            <button id="wait-btn" className={styles.waitBtn} onClick={handleWait}>
              ⏸ Wait
            </button>
          )}

          {/* ── counting / critical: show timer badge, no Wait button ── */}
          {(phase === 'counting' || phase === 'critical') && (
            <span className={`${styles.timerBadge} ${timerClass}`} aria-live="polite">
              💣 {timeStr}
            </span>
          )}

          <button
            id="copy-btn"
            className={`${styles.actionBtn} ${copied ? styles.copied : ''}`}
            onClick={handleCopy}
            disabled={!names.length}
            aria-label="Copy all names"
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
          <button
            id="clear-btn"
            className={`${styles.actionBtn} ${styles.danger}`}
            onClick={clearAll}
            disabled={!names.length}
            aria-label="Clear all names"
          >
            Clear All
          </button>
          <button
            id="lock-btn"
            className={`${styles.actionBtn} ${styles.lock}`}
            onClick={lock}
            aria-label="Lock app"
            title="Lock"
          >
            🔒
          </button>
        </div>
      </header>

      {/* ── Input ── */}
      <section className={styles.inputSection} aria-label="Add a name">
        <NameInput onAdd={addName} />
      </section>

      {/* ── Grid ── */}
      <section className={styles.gridSection} aria-label="Name list">
        <NameGrid names={names} onRemove={removeName} onEdit={editName} />
      </section>

      {/* ── Paste-restore toast ── */}
      {restored > 0 && (
        <div className={styles.toast} role="status" aria-live="polite">
          ↓ Restored {restored} name{restored === 1 ? '' : 's'}
        </div>
      )}
    </div>
  )
}
