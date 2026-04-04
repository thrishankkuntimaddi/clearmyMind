import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useNames } from './hooks/useNames.js'
import { useAuth } from './hooks/useAuth.js'
import { useAutoWipe } from './hooks/useAutoWipe.js'
import { useTags } from './hooks/useTags.js'
import { useBag } from './hooks/useBag.js'
import { useGroups } from './hooks/useGroups.js'
import { buildSnapshot, isSnapshot, parseSnapshot } from './utils/snapshot.js'
import AuthScreen from './components/AuthScreen.jsx'
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
    bioSetupState, enrollBiometric, skipBioEnroll,
    setupPassword, login, loginBiometric, lock, noLock, toggleNoLock } = useAuth()

  // ─── Names ───────────────────────────────────────────────────────────────
  const { names, addName, editName: editNameBase, removeName: removeNameBase, clearAll: clearAllBase, reloadFromStorage } = useNames()
  const { setTag, renameTag, removeTag, clearTags, tags, mergeTags } = useTags()
  const { bag, addToBag, removeFromBag, clearBag, mergeBag } = useBag()
  const { groups, createGroup, renameGroup, deleteGroup, addToGroup, removeFromGroup, removeNameFromAllGroups, renameInGroups, mergeGroups } = useGroups()

  // Wrap edit/remove/clearAll to keep tags + groups in sync
  const editName = useCallback((old, next) => { editNameBase(old, next); renameTag(old, next); renameInGroups(old, next) }, [editNameBase, renameTag, renameInGroups])
  const removeName = useCallback((name) => { removeNameBase(name); removeTag(name); removeNameFromAllGroups(name) }, [removeNameBase, removeTag, removeNameFromAllGroups])
  const clearAll = useCallback(() => { clearAllBase(); clearTags() }, [clearAllBase, clearTags])

  // ─── Restore a full snapshot ─────────────────────────────────────────────
  const restoreSnapshot = useCallback((parsed) => {
    let nameCount = 0
    parsed.names.forEach(n => { if (addName(n)) nameCount++ })
    if (parsed.bag?.length)                        mergeBag(parsed.bag)
    if (Object.keys(parsed.tags   ?? {}).length)   mergeTags(parsed.tags)
    if (Object.keys(parsed.groups ?? {}).length)   mergeGroups(parsed.groups)
    return {
      names:  nameCount,
      groups: Object.keys(parsed.groups ?? {}).length,
      bag:    (parsed.bag ?? []).length,
      colors: Object.keys(parsed.tags   ?? {}).length,
    }
  }, [addName, mergeBag, mergeTags, mergeGroups])

  // Show a rich toast after snapshot restore
  function showSnapshotToast(r) {
    const parts = []
    if (r.names  > 0) parts.push(`${r.names} name${r.names  !== 1 ? 's' : ''}`)
    if (r.groups > 0) parts.push(`${r.groups} group${r.groups !== 1 ? 's' : ''}`)
    if (r.bag    > 0) parts.push(`${r.bag} in bag`)
    if (r.colors > 0) parts.push(`${r.colors} color${r.colors !== 1 ? 's' : ''}`)
    if (!parts.length) return
    setRestoreMsg(`✓ Snapshot — ${parts.join(' · ')}`)
    setTimeout(() => setRestoreMsg(''), 3500)
  }

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

  // ─── Smart bar (unified search + add) ───────────────────────────────────────
  const [query, setQuery] = useState('')
  const smartInputRef = useRef(null)
  const smartBarRef   = useRef(null)
  const [smartShaking, setSmartShaking] = useState(false)

  // ─── Mobile tab (names | groups | bag) ─────────────────────────────────
  const [mobileTab, setMobileTab] = useState('names')

  // Highlight names that start with the query (case-insensitive)
  const searchHighlighted = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return new Set()
    return new Set(names.filter(n => n.toLowerCase().startsWith(q)))
  }, [query, names])

  // First matching name — drives auto-scroll
  const firstMatchName = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return names.find(n => n.toLowerCase().startsWith(q)) ?? null
  }, [query, names])

  // Auto-scroll the grid to the first matching cell
  useEffect(() => {
    if (!firstMatchName) return
    const t = setTimeout(() => {
      const el = document.querySelector('[data-search-first="true"]')
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 40)
    return () => clearTimeout(t)
  }, [firstMatchName])

  // Escape clears the query
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && query) setQuery('')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [query])

  // Global key capture → focus smart bar when a printable key is pressed anywhere
  useEffect(() => {
    function onGlobal(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.length !== 1) return
      smartInputRef.current?.focus()
    }
    document.addEventListener('keydown', onGlobal)
    return () => document.removeEventListener('keydown', onGlobal)
  }, [])

  // Enter key handler for smart bar
  function handleSmartKey(e) {
    if (e.key !== 'Enter') return
    const trimmed = query.trim()
    if (!trimmed) return
    // Exact match check (case-insensitive) — partial matches don't block adding
    // e.g. "Kuntimaddi" can still be added even if "Kuntimaddi Thrishank" is highlighted
    const exactExists = names.some(n => n.toLowerCase() === trimmed.toLowerCase())
    if (!exactExists) {
      e.preventDefault()
      const ok = addNameTracked(trimmed)
      if (ok) {
        setQuery('')
      } else {
        setSmartShaking(true)
        setTimeout(() => setSmartShaking(false), 420)
      }
    }
    // Exact match exists → do nothing (already in list)
  }

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
  const lastAdded = useRef(null)    // most recently added name

  // Wrap addName to track last added + apply title case
  const addNameTracked = useCallback((raw) => {
    const toTitleCase = (s) => s.trim().toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase())
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
      // If smart bar has content, let browser handle native undo
      const inputEl = document.getElementById('smart-input')
      if (inputEl && inputEl.value.length > 0) return
      if (!lastAdded.current) return
      e.preventDefault()
      const name = lastAdded.current
      lastAdded.current = null
      removeName(name)
      // Restore the name back into the smart bar
      setQuery(name)
      smartInputRef.current?.focus()
    }
    document.addEventListener('keydown', handleUndo)
    return () => document.removeEventListener('keydown', handleUndo)
  }, [status, removeName])

  // ─── Copy ────────────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    if (!names.length) return
    try {
      const text = buildSnapshot(names, tags, groups, bag)
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /**/ }
  }, [names, tags, groups, bag])

  const handleLoad = useCallback((rawText) => {
    if (isSnapshot(rawText)) {
      const r = restoreSnapshot(parseSnapshot(rawText))
      showSnapshotToast(r)
    } else {
      const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
      let added = 0
      lines.forEach(name => { if (addName(name)) added++ })
      if (added > 0) {
        setRestoreMsg(`↓ Restored ${added} name${added === 1 ? '' : 's'}`)
        setTimeout(() => setRestoreMsg(''), 2500)
      }
    }
  }, [addName, restoreSnapshot])

  const [showLoadModal, setShowLoadModal] = useState(false)

  // ─── Paste to load ───────────────────────────────────────────────────────
  const [restoreMsg, setRestoreMsg] = useState('')   // toast message

  useEffect(() => {
    if (status !== 'unlocked') return

    function handlePaste(e) {
      if (showLoadModal) return
      const text = e.clipboardData?.getData('text/plain') ?? ''

      // Rich snapshot paste → restore everything
      if (isSnapshot(text)) {
        e.preventDefault()
        const r = restoreSnapshot(parseSnapshot(text))
        showSnapshotToast(r)
        return
      }

      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.length <= 1 && document.activeElement?.tagName === 'INPUT') return
      if (lines.length < 1) return
      e.preventDefault()
      let added = 0
      lines.forEach(name => { if (addName(name)) added++ })
      if (added > 0) {
        setRestoreMsg(`↓ Restored ${added} name${added === 1 ? '' : 's'}`)
        setTimeout(() => setRestoreMsg(''), 2500)
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [status, addName, showLoadModal, restoreSnapshot])

  // ─── Auth screens ─────────────────────────────────────────────────────────
  if (status === 'setup' || status === 'locked') {
    return (
      <AuthScreen
        mode={status}
        attemptsLeft={attemptsLeft}
        biometricAvailable={biometricAvailable}
        bioSetupState={bioSetupState}
        onSetup={setupPassword}
        onLogin={login}
        onBiometric={loginBiometric}
        onEnrollBiometric={enrollBiometric}
        onSkipBiometric={skipBioEnroll}
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

  // Smart bar: is the current query an exact existing name?
  const exactExists = query.trim()
    ? names.some(n => n.toLowerCase() === query.trim().toLowerCase())
    : false
  // add-mode = typed something + not an exact match
  const isAddMode = !!query.trim() && !exactExists
  // search-mode = typed something + partial matches exist (may or may not be exact)
  const isSearchMode = !!query.trim() && searchHighlighted.size > 0

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

        {/* ── Smart bar: search while typing, Enter to add if no match ── */}
        <div className={styles.headerInput}>
          <div
            ref={smartBarRef}
            className={`${styles.smartBar} ${smartShaking ? styles.smartBarShake : isAddMode ? styles.smartBarAdd : isSearchMode ? styles.smartBarSearch : ''}`}
          >
            {/* Contextual icon: + when can add, 🔍 when searching */}
            <span className={styles.smartBarIcon} aria-hidden="true">
              {isAddMode ? '+' : '🔍'}
            </span>

            <input
              ref={smartInputRef}
              id="smart-input"
              type="text"
              className={styles.smartBarInput}
              placeholder="Search or add a name…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleSmartKey}
              autoComplete="off"
              autoFocus
              spellCheck={false}
              aria-label="Search or add name"
            />

            {/* Match count — shown whenever partial matches exist */}
            {query && searchHighlighted.size > 0 && (
              <span className={styles.smartMatchBadge}>
                {searchHighlighted.size} match{searchHighlighted.size !== 1 ? 'es' : ''}
              </span>
            )}

            {/* "↵ add" hint — shown when no exact match (can press Enter to add) */}
            {isAddMode && (
              <span className={styles.smartAddHint}>↵ add</span>
            )}

            {/* Clear button */}
            {query && (
              <button
                className={styles.smartClearBtn}
                onClick={() => { setQuery(''); smartInputRef.current?.focus() }}
                aria-label="Clear"
                title="Clear (Esc)"
              >×</button>
            )}
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

          {/* Clear Colors — only when tags are applied */}
          {Object.keys(tags).length > 0 && (
            <button
              id="clear-colors-btn"
              className={`${styles.actionBtn} ${styles.clearColors}`}
              onClick={clearTags}
              title="Remove all cell colors"
              aria-label="Clear all colors"
            >
              🎨 Clear Colors
            </button>
          )}

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
        <section
          className={`${styles.gridSection} ${mobileTab !== 'names' ? styles.mobileHidden : ''}`}
          aria-label="Name list"
        >
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

        {/* Right sidebar: visible on desktop always; on mobile shown via tab */}
        <div className={`${styles.rightPanel} ${mobileTab !== 'names' ? styles.mobileVisible : ''}`}>
          {(mobileTab === 'names' || mobileTab === 'groups') && (
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
          )}
          {(mobileTab === 'names' || mobileTab === 'bag') && (
            <Bag
              bag={bag}
              onDrop={moveToBag}
              onRestore={restoreFromBag}
              onRemove={removeFromBag}
              onClear={clearBag}
            />
          )}
        </div>
      </div>

      {/* ── Paste-restore toast ── */}
      {restoreMsg && (
        <div className={styles.toast} role="status" aria-live="polite">
          {restoreMsg}
        </div>
      )}

      {/* ── Load modal ── */}
      {showLoadModal && (
        <LoadModal
          onLoad={handleLoad}
          onClose={() => setShowLoadModal(false)}
        />
      )}

      {/* ── Mobile bottom tab bar ── */}
      <nav className={styles.mobileTabBar} aria-label="Navigation">
        <button
          className={`${styles.mobileTab} ${mobileTab === 'names' ? styles.mobileTabActive : ''}`}
          onClick={() => setMobileTab('names')}
          aria-label="Names"
        >
          <span className={styles.mobileTabIcon}>🧠</span>
          <span>Names{names.length > 0 ? ` (${names.length})` : ''}</span>
        </button>
        <button
          className={`${styles.mobileTab} ${mobileTab === 'groups' ? styles.mobileTabActive : ''}`}
          onClick={() => setMobileTab('groups')}
          aria-label="Groups"
        >
          <span className={styles.mobileTabIcon}>📂</span>
          <span>Groups{Object.keys(groups).length > 0 ? ` (${Object.keys(groups).length})` : ''}</span>
        </button>
        <button
          className={`${styles.mobileTab} ${mobileTab === 'bag' ? styles.mobileTabActive : ''}`}
          onClick={() => setMobileTab('bag')}
          aria-label="Bag"
        >
          <span className={styles.mobileTabIcon}>🎒</span>
          <span>Bag{bag.length > 0 ? ` (${bag.length})` : ''}</span>
        </button>
      </nav>
    </div>
  )
}
