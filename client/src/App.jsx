import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useAuth } from './hooks/useAuth.js'
import { useAutoWipe } from './hooks/useAutoWipe.js'
import { useFirebaseAuth } from './hooks/useFirebaseAuth.js'
import { useFirestoreData } from './hooks/useFirestoreData.js'
import { useMemorySheets } from './hooks/useMemorySheets.js'
import { buildFullSnapshot, isSnapshot, parseSnapshot } from './utils/snapshot.js'
import { stopListening } from './lib/db.js'
import AuthScreen from './components/AuthScreen.jsx'
import FirebaseLoginScreen from './components/FirebaseLoginScreen.jsx'
import VerifyEmailScreen from './components/VerifyEmailScreen.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import NameGrid from './components/NameGrid.jsx'
import Bag from './components/Bag.jsx'
import Groups from './components/Groups.jsx'
import BlastAnimation from './components/BlastAnimation.jsx'
import CongratsScreen from './components/CongratsScreen.jsx'
import LoadModal from './components/LoadModal.jsx'
import SheetBar from './components/SheetBar.jsx'
import MobileDragOverlay from './components/MobileDragOverlay.jsx'
import MemoryPanel, { MemoryPrompt } from './components/MemoryPanel.jsx'
import styles from './App.module.css'

// ─── ImportToMemory — dropdown to bulk copy/move session names into a memory sheet
function ImportToMemory({ sessionNames, bagNames = [], memSheets, onCopy, onMove, onCreateAndCopy, onCreateAndMove }) {
  const [open,     setOpen]     = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName,  setNewName]  = useState('')
  const [busy,     setBusy]     = useState(false)
  const boxRef = useRef(null)
  const newRef = useRef(null)

  useEffect(() => { if (creating) newRef.current?.focus() }, [creating])

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown',   onKey)
    }
  }, [open])

  async function run(fn) {
    setBusy(true)
    await fn()
    setBusy(false)
    setOpen(false)
    setCreating(false)
    setNewName('')
  }

  async function handleCreate(e, mode) {
    e.preventDefault()
    const t = newName.trim()
    if (!t) return
    if (mode === 'move') run(() => onCreateAndMove(t))
    else                 run(() => onCreateAndCopy(t))
  }

  const sheetList = Object.entries(memSheets)
  const disabled   = !sessionNames.length && !bagNames.length
  const totalCount = sessionNames.length + bagNames.length
  const bagOnly    = bagNames.length > 0

  return (
    <div style={{ position: 'relative', flexShrink: 0 }} ref={boxRef}>
      <button
        id="import-to-memory-btn"
        className={`${styles.actionBtn} ${styles.importMemBtn} ${open ? styles.importMemBtnOpen : ''}`}
        onClick={() => !disabled && setOpen(p => !p)}
        disabled={disabled}
        title={disabled ? 'No names to save' : `Save ${totalCount} name${totalCount !== 1 ? 's' : ''} (${sessionNames.length} active${bagOnly ? ` + ${bagNames.length} in bag` : ''}) to a Memory Sheet`}
        aria-label="Import to Memory Sheet"
      >
        📚 → Memory {totalCount > 0 ? `(${totalCount})` : ''}
      </button>

      {open && (
        <div className={styles.importMemPicker}>
          <p className={styles.importMemTitle}>
            Save {sessionNames.length} name{sessionNames.length !== 1 ? 's' : ''}
            {bagOnly ? <span style={{ color: 'rgba(251,191,36,0.75)', marginLeft: 4 }}>+ {bagNames.length} bag</span> : ''}
            {' '}to Memory
          </p>

          {sheetList.length === 0 && !creating && (
            <p className={styles.importMemEmpty}>No memory sheets yet — create one below.</p>
          )}

          {sheetList.map(([id, sh]) => (
            <div key={id} className={styles.importMemRow}>
              <span className={styles.importMemName}>{sh.name}</span>
              <span className={styles.importMemCount}>{sh.names?.length ?? 0}</span>
              <div className={styles.importMemActions}>
                <button
                  className={styles.importCopyBtn}
                  onClick={() => run(() => onCopy(id))}
                  disabled={busy}
                  title="Copy names to memory (keep in session)"
                >
                  Copy
                </button>
                <button
                  className={styles.importMoveBtn}
                  onClick={() => run(() => onMove(id))}
                  disabled={busy}
                  title="Move to memory (removes from session)"
                >
                  Move
                </button>
              </div>
            </div>
          ))}

          {creating ? (
            <form className={styles.importNewForm}>
              <input
                ref={newRef}
                className={styles.importNewInput}
                placeholder="New sheet name…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && setCreating(false)}
                disabled={busy}
              />
              <button
                type="submit"
                className={styles.importCopyBtn}
                onClick={e => handleCreate(e, 'copy')}
                disabled={!newName.trim() || busy}
              >Copy</button>
              <button
                type="submit"
                className={styles.importMoveBtn}
                onClick={e => handleCreate(e, 'move')}
                disabled={!newName.trim() || busy}
              >Move</button>
            </form>
          ) : (
            <button
              className={styles.importNewBtn}
              onClick={() => setCreating(true)}
              disabled={busy}
            >
              + New Memory Sheet
            </button>
          )}

          <p className={styles.importMemHint}>
            <strong>Copy</strong> keeps session intact &nbsp;·&nbsp; <strong>Move</strong> removes names, bag &amp; empty groups
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Pick 3 unique indices from [1..n] ────────────────────────────────────────
function pickThree(n) {
  if (n < 3) return new Set()
  const picks = new Set()
  while (picks.size < 3) picks.add(Math.floor(Math.random() * n) + 1)
  return picks
}

export default function App() {
  // ─── Firebase Auth (cloud identity) ──────────────────────────────────────
  const {
    authState, user,
    signIn, signUp, signOutUser, resendVerification, deleteAccount,
  } = useFirebaseAuth()

  // ─── Security wipe callback ────────────────────────────────────────────────
  // Called by useAuth when 3 consecutive wrong passwords are entered.
  // App.jsx owns this because it has access to both the db layer (stopListening)
  // and the Firebase auth layer (signOutUser).
  //
  // Flow:  stop Firestore → clear device lock state → sign out → hard reload
  //
  // The hard reload is intentional: it guarantees zero React state, zero
  // Firestore IndexedDB cache, and zero in-memory data survives the wipe.
  async function handleWipe() {
    // 1. Tear down all Firestore real-time listeners and clear in-memory cache
    stopListening()
    // 2. Clear every App Lock key stored on THIS device
    ;[
      'clearmind_password_hash',
      'clearmind_cred_id',
      'clearmind_nolock',
      'clearmind_applock_v2',
    ].forEach((k) => localStorage.removeItem(k))
    // 3. Sign out of Firebase (best-effort — the reload is the real safety net)
    try { await signOutUser() } catch (_) { /* ignore */ }
    // 4. Hard reload: wipes React state, Firestore IndexedDB, and all caches.
    //    Using replace() so the wipe page is not in the browser history.
    window.location.replace('/')
  }

  // ─── App Lock (local device security — device-specific) ───────────────────
  const {
    status, attemptsLeft, biometricAvailable,
    bioSetupState, enrollBiometric, skipBioEnroll,
    setupPassword, login, loginBiometric, lock, noLock, toggleNoLock,
    isLockEnabled, changePassword, disableLock, enableLock,
  } = useAuth(handleWipe)

  // ─── Firestore data (replaces all localStorage data hooks) ───────────────
  // uid is undefined when not authenticated — hook returns empty defaults safely
  const {
    sheets, activeSheetId, addSheet, renameSheet, deleteSheet, switchSheet, moveNameToSheet,
    names, addName, editName, removeName, clearAll, clearEverything, reloadFromStorage,
    namesBySheet, tagsBySheet, restoreFullSnapshot,
    tags, setTag, clearTags, mergeTags,
    bag, addToBag, removeFromBag, clearBag, mergeBag,
    groups, createGroup, renameGroup, deleteGroup,
    addToGroup, removeFromGroup, mergeGroups,
    noClear, toggleNoClear,
    writeError, clearWriteError,
  } = useFirestoreData(user?.uid)

  // ─── Memory Sheets (persistent layer — isolated from active session) ───────────
  // GUARANTEE: This hook is NEVER called by blast, clearAll, or auto-wipe.
  const {
    memSheets, trash, trashCount, memoryNameSet,
    createMemorySheet, renameMemorySheet, deleteMemSheet,
    restoreSheet, permanentDelete,
    addNamesToMemSheet, removeNameFromMemSheet, editNameInMemSheet, clearMemSheet,
    restorePreviousVersion,
    exportAsJSON, exportAsCSV,
  } = useMemorySheets(user?.uid)

  const [showMemory,       setShowMemory]       = useState(false)
  const [showMemoryPrompt, setShowMemoryPrompt] = useState(false)
  // Which memory sheet tab is currently open in the grid (null = session mode)
  const [activeMemSheetId, setActiveMemSheetId] = useState(null)

  // Called only from Settings → Reset → with Memory Sheets checkbox ON.
  const resetMemory = useCallback(async () => {
    const ids = Object.keys(memSheets)
    await Promise.all(ids.map(id => deleteMemSheet(id)))
  }, [memSheets, deleteMemSheet])

  // Create a new memory sheet AND immediately populate it with names.
  // Used by SheetBar's "Create & Save" flow.
  const createMemSheetAndAdd = useCallback(async (sheetName, namesToAdd) => {
    const id = await createMemorySheet(sheetName)
    if (!id || !namesToAdd?.length) return 0
    return addNamesToMemSheet(id, namesToAdd)
  }, [createMemorySheet, addNamesToMemSheet])

  // Create a new memory sheet and immediately switch to it in the grid.
  const handleAddMemSheet = useCallback(async () => {
    const id = await createMemorySheet('Memory')
    if (id) setActiveMemSheetId(id)
  }, [createMemorySheet])

  // Delete a memory tab — soft-delete it then exit memory mode if active.
  const handleDeleteMemTab = useCallback(async (memId) => {
    if (activeMemSheetId === memId) setActiveMemSheetId(null)
    await deleteMemSheet(memId)
  }, [activeMemSheetId, deleteMemSheet])

  // ─── Computed display values (memory mode overrides session) ──────────────────
  // When a memory tab is active we show its names in the grid.
  // All grid write operations are routed to memory functions.
  const isMemoryMode   = !!activeMemSheetId && !!memSheets[activeMemSheetId]
  const displayNames   = isMemoryMode ? (memSheets[activeMemSheetId]?.names ?? []) : names
  const displayTags    = isMemoryMode ? {} : tags   // tags not applicable in memory mode

  const handleGridAdd    = useCallback((name) => {
    if (isMemoryMode) return addNamesToMemSheet(activeMemSheetId, [name])
    return addName(name)
  }, [isMemoryMode, activeMemSheetId, addNamesToMemSheet, addName])

  const handleGridRemove = useCallback((name) => {
    if (isMemoryMode) return removeNameFromMemSheet(activeMemSheetId, name)
    return removeName(name)
  }, [isMemoryMode, activeMemSheetId, removeNameFromMemSheet, removeName])

  const handleGridEdit   = useCallback((oldName, newName) => {
    if (isMemoryMode) return editNameInMemSheet(activeMemSheetId, oldName, newName)
    return editName(oldName, newName)
  }, [isMemoryMode, activeMemSheetId, editNameInMemSheet, editName])

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

  // Filter groups to only those with ≥1 member in the CURRENT sheet's names.
  // Groups are global but the panel must only surface groups relevant to
  // the sheet being viewed. Empty sheet → zero groups shown (no clutter).
  // A group spanning Sheet 2 and Sheet 3 correctly appears on both.
  const sheetNameSet = useMemo(() => new Set(names), [names])
  const sheetGroups  = useMemo(() => {
    const filtered = {}
    Object.entries(groups).forEach(([id, g]) => {
      if (g.members.some(m => sheetNameSet.has(m))) filtered[id] = g
    })
    return filtered
  }, [groups, sheetNameSet])

  // Deselect the active group if it has no members in the newly active sheet
  // (prevents a stale highlight carrying over when switching sheets).
  useEffect(() => {
    if (activeGroupId && !sheetGroups[activeGroupId]) setActiveGroupId(null)
  }, [activeGroupId, sheetGroups])

  const groupHighlightedNames = activeGroupId && groups[activeGroupId]
    ? new Set(groups[activeGroupId].members)
    : new Set()

  // Reload from storage when App Lock is lifted — no-op in Firestore mode,
  // but kept so the hook contract stays identical
  const prevStatus = useRef(status)
  useEffect(() => {
    if (prevStatus.current !== 'unlocked' && status === 'unlocked') reloadFromStorage()
    prevStatus.current = status
  }, [status, reloadFromStorage])

  // ─── Auto-wipe ───────────────────────────────────────────────────────────
  const { phase, countdown, handleWait, handleBlastComplete, handleCongratsClose }
    = useAutoWipe(noClear ? 0 : names.length)

  const capturedNames = useRef([])
  const hasBlasted    = useRef(false)

  useEffect(() => {
    if (phase === 'blasting' && !hasBlasted.current) {
      hasBlasted.current = true
      capturedNames.current = [...names]
      clearAll()
    }
    if (phase === 'idle') {
      hasBlasted.current = false
      setShowMemoryPrompt(false)
    }
  }, [phase]) // eslint-disable-line

  // After blast completes → show Memory prompt if user has names to potentially save
  const handleBlastCompleteWithMemory = useCallback(() => {
    if (capturedNames.current.length > 0) {
      setShowMemoryPrompt(true)
    } else {
      handleBlastComplete()
    }
  }, [handleBlastComplete])

  async function handleMemorySave(sheetId, selectedNames) {
    await addNamesToMemSheet(sheetId, selectedNames)
    setShowMemoryPrompt(false)
    handleBlastComplete()
  }

  function handleMemoryDiscard() {
    setShowMemoryPrompt(false)
    handleBlastComplete()
  }

  // ─── Smart bar ───────────────────────────────────────────────────────────
  const [query, setQuery]           = useState('')
  const smartInputRef               = useRef(null)
  const smartBarRef                 = useRef(null)
  const [smartShaking, setSmartShaking] = useState(false)

  // ─── Mobile tab (names | groups | bag) ───────────────────────────────────
  const [mobileTab, setMobileTab] = useState('names')

  // ─── Mobile long-press drag state ────────────────────────────────────────
  const [mobileDraggingName, setMobileDraggingName] = useState(null)
  const [mobileDragPos, setMobileDragPos]           = useState({ x: 0, y: 0 })
  const tabBarRef   = useRef(null)
  const sheetBarRef = useRef(null)

  const handleMobileLongPress = useCallback((name, x, y) => {
    setMobileDraggingName(name)
    setMobileDragPos({ x, y })
  }, [])

  const [toast, setToast] = useState('')

  const handleMobileDropToBag = useCallback((name) => {
    moveToBag(name)
    setMobileDraggingName(null)
    setToast(`🎒 ${name} → Bag`)
    setTimeout(() => setToast(''), 2000)
  }, [moveToBag])

  const handleMobileDropToGroup = useCallback((groupId, name) => {
    addToGroup(groupId, name)
    setMobileDraggingName(null)
    const gName = groups[groupId]?.name ?? 'group'
    setToast(`📂 ${name} → ${gName}`)
    setTimeout(() => setToast(''), 2000)
  }, [addToGroup, groups])

  const handleMobileSwitchToGroups = useCallback(() => setMobileTab('groups'), [])
  const handleMobileDragCancel     = useCallback(() => setMobileDraggingName(null), [])

  // ── Cross-sheet drag-to-move ──────────────────────────────────────────────
  // moveNameToSheet already handles names + tags + groups atomically in Firestore
  const handleMoveNameToSheet = useCallback((name, toSheetId) => {
    setMobileDraggingName(null)
    const result = moveNameToSheet(name, activeSheetId, toSheetId)
    if (result.ok) {
      const destSheet = sheets.find((s) => s.id === toSheetId)
      setToast(`➡️ ${name} moved to ${destSheet?.name ?? 'sheet'}`)
      setTimeout(() => setToast(''), 2500)
    } else if (result.reason === 'duplicate') {
      setToast(`⚠️ ${name} already exists in that sheet`)
      setTimeout(() => setToast(''), 2500)
    }
  }, [moveNameToSheet, activeSheetId, sheets])

  // ─── Search ───────────────────────────────────────────────────────────────
  const searchHighlighted = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return new Set()
    return new Set(displayNames.filter((n) => n.toLowerCase().startsWith(q)))
  }, [query, displayNames])

  const firstMatchName = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return displayNames.find((n) => n.toLowerCase().startsWith(q)) ?? null
  }, [query, displayNames])

  useEffect(() => {
    if (!firstMatchName) return
    const t = setTimeout(() => {
      const el = document.querySelector('[data-search-first="true"]')
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 40)
    return () => clearTimeout(t)
  }, [firstMatchName])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && query) setQuery('') }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [query])

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

  function handleSmartKey(e) {
    if (e.key !== 'Enter') return
    const trimmed = query.trim()
    if (!trimmed) return
    const exactExists = displayNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())
    if (!exactExists) {
      e.preventDefault()
      const ok = isMemoryMode
        ? addNamesToMemSheet(activeMemSheetId, [trimmed]).then(c => c > 0) && (setQuery(''), true)
        : addNameTracked(trimmed)
      if (isMemoryMode) { setQuery('') }
      else if (ok) setQuery('')
      else {
        setSmartShaking(true)
        setTimeout(() => setSmartShaking(false), 420)
      }
    }
  }

  // ─── Random Pick 3 ───────────────────────────────────────────────────────
  const [randomPicks, setRandomPicks] = useState(() => new Set())
  const pickRandom = useCallback(() => setRandomPicks(pickThree(names.length)), [names.length])
  useEffect(() => { setRandomPicks(new Set()) }, [names.length])
  useEffect(() => {
    if (randomPicks.size === 0) return
    const t = setTimeout(() => setRandomPicks(new Set()), 5000)
    return () => clearTimeout(t)
  }, [randomPicks])

  // ─── Cmd+Z Undo ──────────────────────────────────────────────────────────
  const lastAdded = useRef(null)

  const addNameTracked = useCallback((raw) => {
    const toTitleCase = (s) => s.trim().toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase())
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
      const inputEl = document.getElementById('smart-input')
      if (inputEl && inputEl.value.length > 0) return
      if (!lastAdded.current) return
      e.preventDefault()
      const name = lastAdded.current
      lastAdded.current = null
      removeName(name)
      setQuery(name)
      smartInputRef.current?.focus()
    }
    document.addEventListener('keydown', handleUndo)
    return () => document.removeEventListener('keydown', handleUndo)
  }, [status, removeName])

  // ─── Copy — ALL sheets, groups, bag, tags ─────────────────────────────────
  // Uses buildFullSnapshot (v2) which includes every sheet's names + colors.
  // Falls back to single-sheet v1 only if there is truly just one sheet and
  // everything lives in it (legacy compat not needed, but kept for safety).
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    // Require at least some data across all sheets
    const totalNames = sheets.reduce((s, sh) => s + (namesBySheet[sh.id]?.length ?? 0), 0)
    if (!totalNames && !bag.length && !Object.keys(groups).length) return
    try {
      const text = buildFullSnapshot(sheets, namesBySheet, tagsBySheet, groups, bag)
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /**/ }
  }, [sheets, namesBySheet, tagsBySheet, groups, bag])

  // ─── Paste / Load / Snapshot ──────────────────────────────────────────────
  const [restoreMsg, setRestoreMsg] = useState('')

  // Restore a parsed v2 snapshot (all sheets). parseSnapshot() always returns
  // v2 shape, even for old v1 clipboard content — so this always works.
  const restoreSnapshot = useCallback((parsed) => {
    return restoreFullSnapshot(parsed)
  }, [restoreFullSnapshot])

  function showSnapshotToast(r) {
    const parts = []
    if (r.sheetsRestored > 0) parts.push(`${r.sheetsRestored} sheet${r.sheetsRestored !== 1 ? 's' : ''}`)
    if (r.totalNames    > 0) parts.push(`${r.totalNames} name${r.totalNames !== 1 ? 's' : ''}`)
    if (r.groups        > 0) parts.push(`${r.groups} group${r.groups !== 1 ? 's' : ''}`)
    if (r.bag           > 0) parts.push(`${r.bag} in bag`)
    if (r.colors        > 0) parts.push(`${r.colors} color${r.colors !== 1 ? 's' : ''}`)
    if (!parts.length) return
    setRestoreMsg(`✓ Snapshot — ${parts.join(' · ')}`)
    setTimeout(() => setRestoreMsg(''), 3500)
  }

  const [showLoadModal, setShowLoadModal] = useState(false)

  const handleLoad = useCallback((rawText) => {
    if (isSnapshot(rawText)) {
      showSnapshotToast(restoreSnapshot(parseSnapshot(rawText)))
    } else {
      const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean)
      let added = 0
      lines.forEach((name) => { if (addName(name)) added++ })
      if (added > 0) {
        setRestoreMsg(`↓ Restored ${added} name${added === 1 ? '' : 's'}`)
        setTimeout(() => setRestoreMsg(''), 2500)
      }
    }
  }, [addName, restoreSnapshot])

  useEffect(() => {
    if (status !== 'unlocked') return
    function handlePaste(e) {
      if (showLoadModal) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (isSnapshot(text)) {
        e.preventDefault()
        showSnapshotToast(restoreSnapshot(parseSnapshot(text)))
        return
      }
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
      if (lines.length <= 1 && document.activeElement?.tagName === 'INPUT') return
      if (lines.length < 1) return
      e.preventDefault()
      let added = 0
      lines.forEach((name) => { if (addName(name)) added++ })
      if (added > 0) {
        setRestoreMsg(`↓ Restored ${added} name${added === 1 ? '' : 's'}`)
        setTimeout(() => setRestoreMsg(''), 2500)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [status, addName, showLoadModal, restoreSnapshot])

  // ─── Settings panel ───────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false)

  // ─── Firebase not configured (secrets missing from build) ────────────────
  if (authState === 'not-configured') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', background: '#0b0b0f',
        color: '#f87171', fontFamily: 'Inter, system-ui, sans-serif',
        gap: '12px', padding: '24px', textAlign: 'center',
      }}>
        <span style={{ fontSize: '2.5rem' }}>⚠️</span>
        <strong style={{ fontSize: '1.1rem' }}>Firebase not configured</strong>
        <p style={{ color: '#9ca3af', fontSize: '0.9rem', maxWidth: '360px', margin: 0 }}>
          The app's Firebase credentials are missing from this build.
          Add the <code style={{ color: '#a855f7' }}>VITE_FIREBASE_*</code> secrets
          to GitHub → Settings → Secrets, then re-run the Actions workflow.
        </p>
      </div>
    )
  }

  // ─── Firebase Auth rendering waterfall ───────────────────────────────────
  if (authState === 'loading') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0b0b0f', color: '#a855f7',
        fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', gap: '10px',
      }}>
        <span style={{ display: 'inline-block', animation: 'none', fontSize: '1.4rem' }}>🧠</span>
        Loading…
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return <FirebaseLoginScreen onSignIn={signIn} onSignUp={signUp} />
  }

  if (authState === 'unverified') {
    return <VerifyEmailScreen user={user} onResend={resendVerification} onSignOut={signOutUser} />
  }

  // ─── App Lock gate (local, device-level) ─────────────────────────────────
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
    return <BlastAnimation names={capturedNames.current} onComplete={handleBlastCompleteWithMemory} />
  }

  if (showMemoryPrompt) {
    return (
      <MemoryPrompt
        capturedNames={capturedNames.current}
        memSheets={memSheets}
        onSave={handleMemorySave}
        onDiscard={handleMemoryDiscard}
        onCreateSheet={createMemorySheet}
      />
    )
  }

  if (phase === 'congrats') {
    return <CongratsScreen onClose={handleCongratsClose} />
  }

  // Timer display
  const mins    = Math.floor(countdown / 60)
  const secs    = countdown % 60
  const timeStr = countdown >= 60
    ? `${mins}:${secs.toString().padStart(2, '0')}`
    : `${countdown}s`

  const timerClass = phase === 'critical' ? styles.timerCritical : styles.timerExtended

  // Smart bar modes
  const exactExists  = query.trim() ? displayNames.some((n) => n.toLowerCase() === query.trim().toLowerCase()) : false
  const isAddMode    = !!query.trim() && !exactExists
  const isSearchMode = !!query.trim() && searchHighlighted.size > 0

  // ─── Main app ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon} aria-hidden="true">🧠</span>
          <span className={styles.title}>ClearMyMind</span>
          {/* Count badge: shows memory sheet count when in memory mode */}
          {displayNames.length > 0 && (
            <span
              className={`${styles.count} ${
                !isMemoryMode && displayNames.length >= 90 ? styles.countCritical :
                !isMemoryMode && displayNames.length >= 80 ? styles.countWarn : ''}`}
              aria-live="polite"
              style={isMemoryMode ? { color: '#a78bfa', background: 'rgba(139,92,246,0.1)', borderColor: 'rgba(139,92,246,0.25)' } : {}}
            >
              {displayNames.length}
            </span>
          )}
          {/* 🔒 Memory mode badge */}
          {isMemoryMode && (
            <span style={{
              fontSize: '10px', fontWeight: 700, color: '#a78bfa',
              background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: '99px', padding: '2px 8px', letterSpacing: '0.03em',
            }}>📚 Memory</span>
          )}
        </div>

        {/* Smart bar */}
        <div className={styles.headerInput}>
          <div
            ref={smartBarRef}
            className={`${styles.smartBar} ${
              smartShaking  ? styles.smartBarShake  :
              isAddMode     ? styles.smartBarAdd    :
              isSearchMode  ? styles.smartBarSearch : ''}`}
          >
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
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSmartKey}
              autoComplete="off"
              autoFocus
              spellCheck={false}
              aria-label="Search or add name"
            />
            {query && searchHighlighted.size > 0 && (
              <span className={styles.smartMatchBadge}>
                {searchHighlighted.size} match{searchHighlighted.size !== 1 ? 'es' : ''}
              </span>
            )}
            {/* Memory hint: shown when typed name already exists in a Memory Sheet */}
            {isAddMode && memoryNameSet.has(query.trim().toLowerCase()) && (
              <span className={styles.smartMemoryHint} title="Already in Memory">📚</span>
            )}
            {isAddMode && <span className={styles.smartAddHint}>↵ add</span>}
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

        {/* Action buttons */}
        <div className={styles.actions}>
          <button
            id="pick3-btn"
            className={`${styles.pick3Btn} ${randomPicks.size > 0 ? styles.pick3Active : ''}`}
            onClick={pickRandom}
            disabled={names.length < 3}
            title={names.length < 3 ? 'Need at least 3 names' : 'Pick 3 random'}
            aria-label="Pick 3 random names"
          >
            🎲 {randomPicks.size > 0 ? `${[...randomPicks].sort((a, b) => a - b).join(', ')}` : 'Pick 3'}
          </button>

          <span className={styles.btnDivider} />

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
          >Load</button>

          <span className={styles.btnDivider} />

          {Object.keys(tags).length > 0 && (
            <button
              id="clear-colors-btn"
              className={`${styles.actionBtn} ${styles.clearColors}`}
              onClick={clearTags}
              title="Remove all cell colors"
              aria-label="Clear all colors"
            >🎨 Clear Colors</button>
          )}

          <span className={styles.btnDivider} />

          {phase === 'pending' && (
            <button id="wait-btn" className={styles.waitBtn} onClick={handleWait}>⏸ Wait</button>
          )}
          {(phase === 'counting' || phase === 'critical') && (
            <span className={`${styles.timerBadge} ${timerClass}`} aria-live="polite">
              💣 {timeStr}
            </span>
          )}

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

          {/* 📚 → Memory — bulk import current sheet into a memory sheet */}
          {!isMemoryMode && (
            <ImportToMemory
              sessionNames={names}
              bagNames={bag}
              memSheets={memSheets}
              onCopy={async (sheetId) => {
                // Copy = names + bag → memory, session untouched
                await addNamesToMemSheet(sheetId, [...names, ...bag])
              }}
              onMove={async (sheetId) => {
                // Move = names + bag → memory, then wipe session
                await addNamesToMemSheet(sheetId, [...names, ...bag])
                // Clear all session names
                clearAll()
                // Clear the bag (those people are now in memory)
                clearBag()
                // Delete any groups whose members are NOW all gone
                Object.entries(groups).forEach(([gid, g]) => {
                  const movedSet = new Set([...names, ...bag].map(n => n.toLowerCase()))
                  const anyRemaining = (g.members ?? []).some(m => !movedSet.has(m.toLowerCase()))
                  if (!anyRemaining) deleteGroup(gid)
                })
              }}
              onCreateAndCopy={async (sheetName) => {
                const id = await createMemorySheet(sheetName)
                if (id) {
                  await addNamesToMemSheet(id, [...names, ...bag])
                  setActiveMemSheetId(id)
                }
              }}
              onCreateAndMove={async (sheetName) => {
                const id = await createMemorySheet(sheetName)
                if (id) {
                  await addNamesToMemSheet(id, [...names, ...bag])
                  clearAll()
                  clearBag()
                  Object.entries(groups).forEach(([gid, g]) => {
                    const movedSet = new Set([...names, ...bag].map(n => n.toLowerCase()))
                    const anyRemaining = (g.members ?? []).some(m => !movedSet.has(m.toLowerCase()))
                    if (!anyRemaining) deleteGroup(gid)
                  })
                  setActiveMemSheetId(id)
                }
              }}
            />
          )}

          <button
            id="clear-btn"
            className={`${styles.actionBtn} ${styles.danger}`}
            onClick={isMemoryMode ? () => clearMemSheet(activeMemSheetId) : clearAll}
            disabled={!displayNames.length}
            aria-label={isMemoryMode ? 'Clear memory sheet' : 'Clear current sheet'}
            title={isMemoryMode ? 'Remove all names from this memory sheet' : 'Clear names from this sheet'}
          >{isMemoryMode ? 'Clear Memory' : 'Clear All'}</button>
          <button
            id="lock-btn"
            className={`${styles.actionBtn} ${styles.lock}`}
            onClick={lock}
            disabled={!isLockEnabled}
            aria-label={isLockEnabled ? 'Lock app' : 'App Lock not enabled — set a password in Settings'}
            title={isLockEnabled ? 'Lock' : 'No password set — enable App Lock in Settings first'}
          >🔒</button>
          <button
            id="settings-btn"
            className={`${styles.actionBtn} ${styles.settingsBtn}`}
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            title="Settings"
          >⚙️</button>
          {/* 📚 Memory button */}
          <button
            id="memory-btn"
            className={`${styles.actionBtn} ${styles.memoryBtn} ${Object.keys(memSheets).length > 0 ? styles.memoryBtnActive : ''}`}
            onClick={() => setShowMemory(true)}
            aria-label="Memory Sheets"
            title={`Memory Sheets${Object.keys(memSheets).length > 0 ? ` — ${Object.keys(memSheets).length} sheet(s)` : ''}`}
          >📚</button>
        </div>
      </header>

      {/* ── Content row: Grid + right panel ── */}
      <div className={styles.contentRow}>
        <section
          className={`${styles.gridSection} ${mobileTab !== 'names' ? styles.mobileHidden : ''}`}
          aria-label="Name list"
        >
          <NameGrid
            names={displayNames}
            tags={displayTags}
            randomPicks={isMemoryMode ? new Set() : randomPicks}
            highlightedNames={isMemoryMode ? new Set() : groupHighlightedNames}
            searchHighlighted={searchHighlighted}
            firstMatchName={firstMatchName}
            memoryNameSet={isMemoryMode ? new Set() : memoryNameSet}
            onRemove={handleGridRemove}
            onEdit={handleGridEdit}
            onTagSet={isMemoryMode ? () => {} : setTag}
            onMobileLongPress={isMemoryMode ? () => {} : handleMobileLongPress}
          />
        </section>

        {/* Right sidebar */}
        <div className={`${styles.rightPanel} ${mobileTab !== 'names' ? styles.mobileVisible : ''}`}>
          {(mobileTab === 'names' || mobileTab === 'groups') && (
            <Groups
              groups={sheetGroups}
              activeGroupId={activeGroupId}
              onSelectGroup={setActiveGroupId}
              onCreateGroup={createGroup}
              onRenameGroup={renameGroup}
              onDeleteGroup={deleteGroup}
              onAddToGroup={addToGroup}
              onRemoveFromGroup={removeFromGroup}
              draggingName={mobileDraggingName}
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
        <div className={styles.toast} role="status" aria-live="polite">{restoreMsg}</div>
      )}

      {/* ── Mobile drop toast ── */}
      {toast && (
        <div className={styles.toast} role="status" aria-live="polite">{toast}</div>
      )}

      {/* ── Write-error toast (Firestore failure) ── */}
      {writeError && (
        <div
          className={styles.toast}
          style={{ background: 'rgba(220,38,38,0.96)', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}
          role="alert"
          aria-live="assertive"
        >
          <span style={{ flex: 1 }}>{writeError}</span>
          <button
            onClick={clearWriteError}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
            aria-label="Dismiss error"
          >×</button>
        </div>
      )}

      {/* ── Load modal ── */}
      {showLoadModal && (
        <LoadModal
          onLoad={handleLoad}
          onClose={() => setShowLoadModal(false)}
        />
      )}

      {/* ── Settings panel ── */}
      {showSettings && (
        <SettingsPanel
          user={user}
          isLockEnabled={isLockEnabled}
          onSignOut={signOutUser}
          onDeleteAccount={deleteAccount}
          onResetData={clearEverything}
          onResetMemory={resetMemory}
          onEnableLock={enableLock}
          onDisableLock={disableLock}
          onChangePassword={changePassword}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* ── Memory Panel ── */}
      {showMemory && (
        <MemoryPanel
          memSheets={memSheets}
          trash={trash}
          trashCount={trashCount}
          onCreateSheet={createMemorySheet}
          onRenameSheet={renameMemorySheet}
          onDeleteSheet={deleteMemSheet}
          onClearSheet={clearMemSheet}
          onAddNames={addNamesToMemSheet}
          onRemoveName={removeNameFromMemSheet}
          onRestoreVersion={restorePreviousVersion}
          onRestoreTrash={restoreSheet}
          onPermanentDelete={permanentDelete}
          onExportJSON={exportAsJSON}
          onExportCSV={exportAsCSV}
          onClose={() => setShowMemory(false)}
        />
      )}

      {/* ── Sheet bar — bottom strip ── */}
      <div className={styles.sheetBarWrap} ref={sheetBarRef}>
        <SheetBar
          sheets={sheets}
          activeSheetId={activeSheetId}
          onSwitch={switchSheet}
          onAdd={addSheet}
          onRename={renameSheet}
          onDelete={deleteSheet}
          onMoveName={handleMoveNameToSheet}
          memSheets={memSheets}
          activeMemSheetId={activeMemSheetId}
          onSwitchMemSheet={setActiveMemSheetId}
          onRenameMemSheet={renameMemorySheet}
          onDeleteMemSheet={handleDeleteMemTab}
          onAddMemSheet={handleAddMemSheet}
          activeSheetNames={names}
          onAddNamesToMemSheet={addNamesToMemSheet}
          onCreateMemSheetAndAdd={createMemSheetAndAdd}
        />
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <nav className={styles.mobileTabBar} aria-label="Navigation" ref={tabBarRef}>
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

      {/* ── Mobile long-press drag overlay ── */}
      <MobileDragOverlay
        draggingName={mobileDraggingName}
        initialPos={mobileDragPos}
        groups={groups}
        sheets={sheets}
        activeSheetId={activeSheetId}
        onDropToBag={handleMobileDropToBag}
        onDropToGroup={handleMobileDropToGroup}
        onMoveNameToSheet={handleMoveNameToSheet}
        onCancel={handleMobileDragCancel}
        onSwitchToGroups={handleMobileSwitchToGroups}
        tabBarRef={tabBarRef}
        sheetBarRef={sheetBarRef}
      />
    </div>
  )
}
