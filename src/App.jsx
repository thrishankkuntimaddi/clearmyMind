import { useState, useCallback, useEffect, useRef } from 'react'
import { useNames } from './hooks/useNames.js'
import { useAuth } from './hooks/useAuth.js'
import { useAutoWipe } from './hooks/useAutoWipe.js'
import { useTags } from './hooks/useTags.js'
import AuthScreen from './components/AuthScreen.jsx'
import NameInput from './components/NameInput.jsx'
import NameGrid from './components/NameGrid.jsx'
import BlastAnimation from './components/BlastAnimation.jsx'
import CongratsScreen from './components/CongratsScreen.jsx'
import LoadModal from './components/LoadModal.jsx'
import TagFilterBar from './components/TagFilterBar.jsx'
import styles from './App.module.css'

// ─── Pick 3 unique indices from [1..n] ────────────────────────────────────────
function pickThree(n) {
  if (n < 3) return new Set()
  const picks = new Set()
  while (picks.size < 3) picks.add(Math.floor(Math.random() * n) + 1)
  return picks
}

export default function App() {
  // ─── Auth ────────────────────────────────────────────────────────────────
  const { status, attemptsLeft, biometricAvailable,
    setupPassword, login, loginBiometric, lock, noLock, toggleNoLock } = useAuth()

  // ─── Names ───────────────────────────────────────────────────────────────
  const { names, addName, editName: editNameBase, removeName: removeNameBase, clearAll: clearAllBase, reloadFromStorage } = useNames()
  const { setTag, renameTag, removeTag, clearTags, tags } = useTags()

  // Wrap edit/remove/clearAll to keep tags in sync
  const editName = useCallback((old, next) => { editNameBase(old, next); renameTag(old, next) }, [editNameBase, renameTag])
  const removeName = useCallback((name) => { removeNameBase(name); removeTag(name) }, [removeNameBase, removeTag])
  const clearAll = useCallback(() => { clearAllBase(); clearTags() }, [clearAllBase, clearTags])

  const prevStatus = useRef(status)
  useEffect(() => {
    if (prevStatus.current !== 'unlocked' && status === 'unlocked') reloadFromStorage()
    prevStatus.current = status
  }, [status, reloadFromStorage])

  // ─── NoClear mode ────────────────────────────────────────────────────────
  const [noClear, setNoClear] = useState(
    () => localStorage.getItem('clearmind_noclear') === '1'
  )
  const toggleNoClear = useCallback(() => {
    setNoClear(prev => {
      const next = !prev
      localStorage.setItem('clearmind_noclear', next ? '1' : '0')
      return next
    })
  }, [])

  // ─── Auto-wipe ───────────────────────────────────────────────────────────
  const { phase, countdown, handleWait, handleBlastComplete, handleCongratsClose, isWarning }
    = useAutoWipe(noClear ? 0 : names.length)   // pass 0 when NoClear is ON → never triggers

  const capturedNames = useRef([])
  const hasBlasted = useRef(false)    // prevents StrictMode double-run from wiping capturedNames

  useEffect(() => {
    if (phase === 'blasting' && !hasBlasted.current) {
      // Capture BEFORE clearAll so StrictMode's second invocation sees names=[]
      // and the guard skips it
      hasBlasted.current = true
      capturedNames.current = [...names]
      clearAll()
    }
    if (phase === 'idle') {
      // Reset for next blast cycle
      hasBlasted.current = false
    }
  }, [phase])   // eslint-disable-line — intentionally omit names/clearAll

  // ─── Random Pick 3 ───────────────────────────────────────────────────────
  const [randomPicks, setRandomPicks] = useState(() => new Set())
  const pickRandom = useCallback(() => {
    setRandomPicks(pickThree(names.length))
  }, [names.length])
  // Clear picks when names count changes
  useEffect(() => { setRandomPicks(new Set()) }, [names.length])
  // Auto-clear picks after 10 seconds
  useEffect(() => {
    if (randomPicks.size === 0) return
    const t = setTimeout(() => setRandomPicks(new Set()), 10000)
    return () => clearTimeout(t)
  }, [randomPicks])

  // ─── Cmd+Z Undo last-added name ──────────────────────────────────────────
  const lastAdded  = useRef(null)    // most recently added name
  const nameInputRef = useRef(null)  // imperative handle to NameInput

  // Wrap addName to track last added
  const addNameTracked = useCallback((raw) => {
    const { toTitleCase } = { toTitleCase: (s) => s.trim().toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase()) }
    const formatted = toTitleCase(raw)
    const ok = addName(raw)
    if (ok) lastAdded.current = formatted
    return ok
  }, [addName])

  useEffect(() => {
    if (status !== 'unlocked') return
    function handleUndo(e) {
      const isMac  = navigator.platform.toUpperCase().includes('MAC')
      const isUndo = (isMac ? e.metaKey : e.ctrlKey) && e.key === 'z' && !e.shiftKey
      if (!isUndo) return
      // Only undo if the input is focused or nothing is focused
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        // If the input itself has content still, let browser handle native undo
        const inputEl = document.getElementById('name-input')
        if (inputEl && inputEl.value.length > 0) return
      }
      if (!lastAdded.current) return
      e.preventDefault()
      const name = lastAdded.current
      lastAdded.current = null
      removeName(name)
      nameInputRef.current?.restoreName(name)
    }
    document.addEventListener('keydown', handleUndo)
    return () => document.removeEventListener('keydown', handleUndo)
  }, [status, removeName])

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

  const handleLoad = useCallback((lines) => {
    let added = 0
    lines.forEach(name => { if (addName(name)) added++ })
    if (added > 0) {
      setRestored(added)
      setTimeout(() => setRestored(0), 2500)
    }
  }, [addName])

  const [showLoadModal, setShowLoadModal] = useState(false)

  // ─── Paste to load ───────────────────────────────────────────────────────
  const [restored, setRestored] = useState(0)   // 0 = toast hidden

  useEffect(() => {
    if (status !== 'unlocked') return

    function handlePaste(e) {
      // If the Load modal is open, let the textarea inside it handle paste natively
      if (showLoadModal) return

      const text = e.clipboardData?.getData('text/plain') ?? ''
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
  }, [status, addName, showLoadModal])

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
  const mins = Math.floor(countdown / 60)
  const secs = countdown % 60
  const timeStr = countdown >= 60
    ? `${mins}:${secs.toString().padStart(2, '0')}`
    : `${countdown}s`

  const timerClass = phase === 'critical' ? styles.timerCritical : styles.timerExtended

  // ─── Main app ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      {/* ── Header — single line: brand | input | actions ── */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon} aria-hidden="true">🧠</span>
          <span className={styles.title}>ClearMyMind</span>
          {names.length > 0 && (
            <span
              className={`${styles.count} ${names.length >= 90 ? styles.countCritical :
                  names.length >= 80 ? styles.countWarn : ''}`}
              aria-live="polite"
            >
              {names.length}
            </span>
          )}
        </div>

        {/* Input lives in the header, grows to fill the middle */}
        <div className={styles.headerInput}>
          <NameInput ref={nameInputRef} onAdd={addNameTracked} />
        </div>

        {/* 🎲 Random Pick 3 button — sits between input and actions */}
        <button
          id="pick3-btn"
          className={`${styles.pick3Btn} ${randomPicks.size > 0 ? styles.pick3Active : ''}`}
          onClick={pickRandom}
          disabled={names.length < 3}
          title={names.length < 3 ? 'Need at least 3 names' : 'Pick 3 random names'}
          aria-label="Pick 3 random names"
        >
          🎲 {randomPicks.size > 0 ? `${[...randomPicks].sort((a,b)=>a-b).join(', ')}` : 'Pick 3'}
        </button>

        <div className={styles.actions}>
          {/* ── NoClear toggle ── */}
          <button
            id="noclear-btn"
            className={`${styles.noClearBtn} ${noClear ? styles.noClearActive : ''}`}
            onClick={toggleNoClear}
            title={noClear ? 'NoClear ON — click to re-enable auto-wipe' : 'NoClear OFF — click to disable auto-wipe'}
          >
            {noClear ? '✅ NoClear' : '⛔ NoClear'}
          </button>

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
            id="load-btn"
            className={`${styles.actionBtn} ${styles.load}`}
            onClick={() => setShowLoadModal(true)}
            aria-label="Load names from clipboard"
            title="Paste names here to load"
          >
            Load
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

          {/* ── NoLock toggle — prevents auto-lock on tab switch ── */}
          <button
            id="nolock-btn"
            className={`${styles.noLockBtn} ${noLock ? styles.noLockActive : ''}`}
            onClick={toggleNoLock}
            title={noLock ? 'NoLock ON — auto-locking disabled (30 min). Click to re-enable.' : 'NoLock OFF — tap to stay unlocked when switching tabs'}
            aria-label={noLock ? 'NoLock active' : 'Enable NoLock'}
          >
            {noLock ? '🛡️ NoLock' : '🔓 NoLock'}
          </button>
        </div>
      </header>

      {/* ── Grid ── */}
      <section className={styles.gridSection} aria-label="Name list">
        <NameGrid
          names={names}
          tags={tags}
          randomPicks={randomPicks}
          onRemove={removeName}
          onEdit={editName}
          onTagSet={setTag}
        />
      </section>

      {/* ── Paste-restore toast ── */}
      {restored > 0 && (
        <div className={styles.toast} role="status" aria-live="polite">
          ↓ Restored {restored} name{restored === 1 ? '' : 's'}
        </div>
      )}

      {/* ── Load modal ── */}
      {showLoadModal && (
        <LoadModal
          onLoad={handleLoad}
          onClose={() => setShowLoadModal(false)}
        />
      )}
    </div>
  )
}
