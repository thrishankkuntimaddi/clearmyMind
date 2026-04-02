import { useState, useCallback } from 'react'
import { useNames } from './hooks/useNames.js'
import { useAuth }  from './hooks/useAuth.js'
import AuthScreen   from './components/AuthScreen.jsx'
import NameInput    from './components/NameInput.jsx'
import NameGrid     from './components/NameGrid.jsx'
import styles from './App.module.css'

export default function App() {
  // ─── Auth ────────────────────────────────────────────────────────────────
  const { status, attemptsLeft, biometricAvailable,
          setupPassword, login, loginBiometric, lock } = useAuth()

  // ─── Names (only active when unlocked) ───────────────────────────────────
  const { names, addName, editName, removeName, clearAll } = useNames()

  // ─── Copy ─────────────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!names.length) return
    try {
      await navigator.clipboard.writeText(names.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard not available — silent fail
    }
  }, [names])

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

  // ─── Main app ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon} aria-hidden="true">🧠</span>
          <span className={styles.title}>ClearMyMind</span>
          {names.length > 0 && (
            <span className={styles.count} aria-live="polite">
              {names.length}
            </span>
          )}
        </div>

        <div className={styles.actions}>
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
    </div>
  )
}
