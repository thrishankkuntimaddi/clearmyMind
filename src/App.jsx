import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useNames } from './hooks/useNames.js'
import { useAuth } from './hooks/useAuth.js'
import { useAutoWipe } from './hooks/useAutoWipe.js'
import { useTags } from './hooks/useTags.js'
import { useBag } from './hooks/useBag.js'
import { useGroups } from './hooks/useGroups.js'
import AuthScreen from './components/AuthScreen.jsx'
import NameInput from './components/NameInput.jsx'
import NameGrid from './components/NameGrid.jsx'
import Bag from './components/Bag.jsx'
import Groups from './components/Groups.jsx'
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
  const { bag, addToBag, removeFromBag, clearBag } = useBag()
  const { groups, createGroup, renameGroup, deleteGroup, addToGroup, removeFromGroup, removeNameFromAllGroups, renameInGroups } = useGroups()

  // Wrap edit/remove/clearAll to keep tags + groups in sync
  const editName = useCallback((old, next) => { editNameBase(old, next); renameTag(old, next); renameInGroups(old, next) }, [editNameBase, renameTag, renameInGroups])
  const removeName = useCallback((name) => { removeNameBase(name); removeTag(name); removeNameFromAllGroups(name) }, [removeNameBase, removeTag, removeNameFromAllGroups])
  const clearAll = useCallback(() => { clearAllBase(); clearTags() }, [clearAllBase, clearTags])

  // ─── Bag: move name grid ↔ bag ────────────────────────────────────────────
  const moveToBag = useCallback((name) => {
    removeName(name)
    addToBag(name)
  }, [removeName, addToBag])

  const restoreFromBag = useCallback((name) => {
    removeFromBag(name)
    addName(name)
  }, [removeFromBag, addName])

  // ─── Groups: active group for cell highlight ─────────────────────────────
  const [activeGroupId, setActiveGroupId] = useState(null)
  const groupHighlightedNames = activeGroupId && groups[activeGroupId]
    ? new Set(groups[activeGroupId].members)
    : new Set()

  const prevStatus = useRef(status)
  useEffect(() => {
    if (prevStatus.current !== 'unlocked' && status === 'unlocked') reloadFromStorage()
    prevStatus.current = status
  }, [status, reloadFromStorage])

  // ─── NoClear mode (default ON) ───────────────────────────────────────────
  const [noClear, setNoClear] = useState(() => {
    const stored = localStorage.getItem('clearmind_noclear')
    // If never set before, default to ON
    if (stored === null) { localStorage.setItem('clearmind_noclear', '1'); return true }
    return stored === '1'
  })
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

  // ─── Search ───────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef(null)

  // Highlight any name that starts with the query (case-insensitive)
  const searchHighlighted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return new Set()
    return new Set(names.filter(n => n.toLowerCase().startsWith(q)))
  }, [searchQuery, names])

  // First match name — used for auto-scroll
  const firstMatchName = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return null
    return names.find(n => n.toLowerCase().startsWith(q)) ?? null
  }, [searchQuery, names])

  // Auto-scroll the grid to the first matching cell
  useEffect(() => {
    if (!firstMatchName) return
    const t = setTimeout(() => {
      const el = document.querySelector('[data-search-first="true"]')
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 40)
    return () => clearTimeout(t)
  }, [firstMatchName])

  // Clear search on Escape (when search input is focused)
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && searchQuery) setSearchQuery('')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [searchQuery])

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
    const t = setTimeout(() => setRandomPicks(new Set()), 5000)
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

        {/* Always-visible dual bar: search (left) + add-name (right) */}
        <div className={styles.headerInput}>
          <div className={styles.headerInputRow}>
            {/* Search bar — always shown */}
            <div className={styles.searchBarWrapper}>
              <span className={styles.searchIcon} aria-hidden="true">🔍</span>
              <input
                ref={searchInputRef}
                id="search-input"
                type="text"
                className={styles.searchInput}
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-label="Search names"
              />
              {searchQuery && (
                <span className={styles.searchMatchCount}>
                  {searchHighlighted.size}
                </span>
              )}
              {searchQuery && (
                <button
                  className={styles.searchClearBtn}
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  title="Clear (Esc)"
                >×</button>
              )}
            </div>

            {/* Add-name input — always shown */}
            <div className={styles.nameInputSlot}>
              <NameInput ref={nameInputRef} onAdd={addNameTracked} />
            </div>
          </div>
        </div>

        {/* ─── Action buttons ─── */}
        <div className={styles.actions}>

          {/* Group 1: 🎲 Pick 3 */}
          <button
            id="pick3-btn"
            className={`${styles.pick3Btn} ${randomPicks.size > 0 ? styles.pick3Active : ''}`}
            onClick={pickRandom}
            disabled={names.length < 3}
            title={names.length < 3 ? 'Need at least 3 names' : 'Pick 3 random'}
            aria-label="Pick 3 random names"
          >
            🎲 {randomPicks.size > 0 ? `${[...randomPicks].sort((a,b)=>a-b).join(', ')}` : 'Pick 3'}
          </button>

          <span className={styles.btnDivider} />

          {/* Group 2: Data I/O */}
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
            aria-label="Load names"
            title="Paste names to load"
          >
            Load
          </button>

          <span className={styles.btnDivider} />

          {/* Group 3: Timer / Wait (contextual) */}
          {phase === 'pending' && (
            <button id="wait-btn" className={styles.waitBtn} onClick={handleWait}>
              ⏸ Wait
            </button>
          )}
          {(phase === 'counting' || phase === 'critical') && (
            <span className={`${styles.timerBadge} ${timerClass}`} aria-live="polite">
              💣 {timeStr}
            </span>
          )}

          {/* Group 4: Toggles */}
          <button
            id="noclear-btn"
            className={`${styles.noClearBtn} ${noClear ? styles.noClearActive : ''}`}
            onClick={toggleNoClear}
            title={noClear ? 'NoClear ON — click to re-enable auto-wipe' : 'NoClear OFF — click to disable auto-wipe'}
          >
            {noClear ? '✅ NoClear' : '⛔ NoClear'}
          </button>
          <button
            id="nolock-btn"
            className={`${styles.noLockBtn} ${noLock ? styles.noLockActive : ''}`}
            onClick={toggleNoLock}
            title={noLock ? 'NoLock ON — 30 min. Click to re-enable.' : 'NoLock OFF — stay unlocked across tabs'}
            aria-label={noLock ? 'NoLock active' : 'Enable NoLock'}
          >
            {noLock ? '🛡️ NoLock' : '🔓 NoLock'}
          </button>

          <span className={styles.btnDivider} />

          {/* Group 5: Danger + Lock */}
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

      {/* ── Content row: Grid + right panel ── */}
      <div className={styles.contentRow}>
        <section className={styles.gridSection} aria-label="Name list">
          <NameGrid
            names={names}
            tags={tags}
            randomPicks={randomPicks}
            highlightedNames={groupHighlightedNames}
            searchHighlighted={searchHighlighted}
            firstMatchName={firstMatchName}
            onRemove={removeName}
            onEdit={editName}
            onTagSet={setTag}
          />
        </section>

        {/* Right sidebar: Groups top, Bag bottom — 50/50 */}
        <div className={styles.rightPanel}>
          <Groups
            groups={groups}
            activeGroupId={activeGroupId}
            onSelectGroup={setActiveGroupId}
            onCreateGroup={createGroup}
            onRenameGroup={renameGroup}
            onDeleteGroup={deleteGroup}
            onAddToGroup={addToGroup}
            onRemoveFromGroup={removeFromGroup}
          />
          <Bag
            bag={bag}
            onDrop={moveToBag}
            onRestore={restoreFromBag}
            onRemove={removeFromBag}
            onClear={clearBag}
          />
        </div>
      </div>

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
