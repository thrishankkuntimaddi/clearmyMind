import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useAuth } from './hooks/useAuth.js'
import { useAutoWipe } from './hooks/useAutoWipe.js'
import { useFirebaseAuth } from './hooks/useFirebaseAuth.js'
import { useFirestoreData } from './hooks/useFirestoreData.js'
import { useMemorySheets } from './hooks/useMemorySheets.js'
import { buildFullSnapshot, isSnapshot, parseSnapshot } from './utils/snapshot.js'
import { cleanName } from './utils/validate.js'
import { deleteAllMemoryData } from './lib/memoryDb.js'
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

const EMPTY_SET = new Set()

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
    signIn, signUp, resetPassword, resendVerification, checkVerified,
    signOutUser, deleteAccount,
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
    // 1. Sign out — this also clears every App Lock key on THIS device, and the
    //    data hooks drop all in-memory data as soon as the user goes away.
    try { await signOutUser() } catch { /* the reload below is the safety net */ }
    // 2. Hard reload: wipes React state and Firestore's in-memory cache (data
    //    is never written to disk). replace() keeps the wipe out of history.
    //    BASE_URL keeps us inside the app on GitHub Pages (/clearmyMind/).
    window.location.replace(import.meta.env.BASE_URL)
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
  // Data only loads once the email is verified.
  const dataUid = authState === 'authenticated' ? user?.uid : undefined
  const {
    status: dataStatus,
    sheets, activeSheetId, addSheet, renameSheet, deleteSheet, switchSheet, moveNameToSheet,
    names, addName, addNames, editName, removeName, clearAll, restoreCleared, clearEverything,
    namesBySheet, tagsBySheet, restoreFullSnapshot, deleteAllData,
    tags, setTag, clearTags,
    bag, addToBag, removeFromBag, clearBag,
    groups, createGroup, renameGroup, deleteGroup,
    addToGroup, removeFromGroup,
    noClear, toggleNoClear,
    writeError, clearWriteError,
  } = useFirestoreData(dataUid)

  // ─── Memory Sheets (persistent layer — isolated from active session) ───────────
  // GUARANTEE: This hook is NEVER called by blast, clearAll, or auto-wipe.
  const {
    memSheets, trash, trashCount, memoryNameSet, memoryIconMap,
    createMemorySheet, renameMemorySheet, deleteMemSheet, setMemSheetIcon,
    restoreSheet, permanentDelete,
    addNamesToMemSheet, removeNameFromMemSheet, editNameInMemSheet, clearMemSheet,
    restorePreviousVersion,
    exportAsJSON, exportAsCSV,
  } = useMemorySheets(dataUid)

  const [showMemory,       setShowMemory]       = useState(false)
  const [showMemoryPrompt, setShowMemoryPrompt] = useState(false)
  const [showMemTabs,      setShowMemTabs]      = useState(false)  // toggle memory tabs in SheetBar
  // Which memory sheet tab is open in the grid (null = session mode)
  const [activeMemSheetId, setActiveMemSheetId] = useState(null)

  // Called only from Settings → Reset → with Memory Sheets checkbox ON.
  // Settings promises "permanently deleted", so delete the sheets AND trash
  // (a soft delete would have left everything in Trash for 30 days).
  const resetMemory = useCallback(async () => {
    if (!dataUid) return
    setActiveMemSheetId(null)
    await deleteAllMemoryData(dataUid)
  }, [dataUid])

  // Soft-delete a memory tab; exit memory mode if it was active
  const handleDeleteMemTab = useCallback(async (memId) => {
    if (activeMemSheetId === memId) setActiveMemSheetId(null)
    await deleteMemSheet(memId)
  }, [activeMemSheetId, deleteMemSheet])

  // ─── Computed display values (memory mode overrides session) ─────────────────
  const isMemoryMode = !!activeMemSheetId && !!memSheets[activeMemSheetId]
  const memNames     = isMemoryMode ? memSheets[activeMemSheetId]?.names : null
  const displayNames = useMemo(() => memNames ?? names, [memNames, names])
  const displayTags  = tags   // tags work by name — same in session or memory mode

  const handleGridRemove = useCallback((name) => {
    if (isMemoryMode) return removeNameFromMemSheet(activeMemSheetId, name)
    return removeName(name)
  }, [isMemoryMode, activeMemSheetId, removeNameFromMemSheet, removeName])

  const handleGridEdit = useCallback((oldName, newName) => {
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

  // Groups are GLOBAL — visible on all sheets and memory sheets.
  // sheetGroups = all groups always (no filtering by current sheet).
  const sheetGroups  = groups


  // A deleted group simply stops being selected
  const selectedGroupId = activeGroupId && groups[activeGroupId] ? activeGroupId : null

  const groupHighlightedNames = activeGroupId && groups[activeGroupId]
    ? new Set(groups[activeGroupId].members)
    : new Set()


  // ─── Auto-wipe ───────────────────────────────────────────────────────────
  const { phase, countdown, handleWait, handleBlastComplete, handleCongratsClose }
    = useAutoWipe(noClear ? 0 : names.length)

  const [capturedNames, setCapturedNames] = useState([])
  const hasBlasted = useRef(false)

  useEffect(() => {
    if (phase === 'blasting' && !hasBlasted.current) {
      hasBlasted.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCapturedNames([...names])
      clearAll()
    }
    if (phase === 'idle') {
      hasBlasted.current = false
      setShowMemoryPrompt(false)
    }
  }, [phase]) // eslint-disable-line

  // After blast completes → show Memory prompt if user has names to potentially save
  const handleBlastCompleteWithMemory = useCallback(() => {
    if (capturedNames.length > 0) {
      setShowMemoryPrompt(true)
    } else {
      handleBlastComplete()
    }
  }, [capturedNames, handleBlastComplete])

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
  const [mobileTab, setMobileTab]       = useState('names')
  const [rightPanelOpen, setRightPanelOpen] = useState(true)

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
  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }, [])

  // ─── Clear All: two taps to confirm, then 8 s to Undo ────────────────────
  const [confirmClear, setConfirmClear] = useState(false)
  const [undoClear, setUndoClear]       = useState(null)   // { removed } | null
  useEffect(() => {
    if (!confirmClear) return
    const t = setTimeout(() => setConfirmClear(false), 3000)
    return () => clearTimeout(t)
  }, [confirmClear])
  useEffect(() => {
    if (!undoClear) return
    const t = setTimeout(() => setUndoClear(null), 8000)
    return () => clearTimeout(t)
  }, [undoClear])

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
      if (isMemoryMode) {
        addNamesToMemSheet(activeMemSheetId, [trimmed])
        setQuery('')
      } else if (addNameTracked(trimmed)) {
        setQuery('')
      } else {
        setSmartShaking(true)
        setTimeout(() => setSmartShaking(false), 420)
      }
    }
  }

  // ─── Random Pick 3 ───────────────────────────────────────────────────────
  // Picks are tied to the list size they were drawn from; adding or removing
  // a name invalidates them (the indices would point at different names).
  const [pickState, setPickState] = useState({ picks: new Set(), count: 0 })
  const randomPicks = pickState.count === names.length ? pickState.picks : EMPTY_SET
  const pickRandom = useCallback(
    () => setPickState({ picks: pickThree(names.length), count: names.length }),
    [names.length],
  )
  useEffect(() => {
    if (pickState.picks.size === 0) return
    const t = setTimeout(() => setPickState({ picks: new Set(), count: 0 }), 5000)
    return () => clearTimeout(t)
  }, [pickState])

  // ─── Cmd+Z Undo ──────────────────────────────────────────────────────────
  const lastAdded = useRef(null)

  const addNameTracked = useCallback((raw) => {
    const ok = addName(raw)
    if (ok) lastAdded.current = cleanName(raw)
    return ok
  }, [addName])

  useEffect(() => {
    if (status !== 'unlocked') return
    function handleUndo(e) {
      const isUndo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey
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
  const totalNames = useMemo(
    () => sheets.reduce((s, sh) => s + (namesBySheet[sh.id]?.length ?? 0), 0),
    [sheets, namesBySheet],
  )
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    // Require at least some data across all sheets
    if (!totalNames && !bag.length && !Object.keys(groups).length) return
    try {
      const text = buildFullSnapshot(sheets, namesBySheet, tagsBySheet, groups, bag)
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('⚠️ Clipboard not available')
    }
  }, [totalNames, sheets, namesBySheet, tagsBySheet, groups, bag, showToast])

  // ─── Paste / Load / Snapshot ──────────────────────────────────────────────
  const [restoreMsg, setRestoreMsg] = useState('')

  // Restore a parsed v2 snapshot (all sheets). parseSnapshot() always returns
  // v2 shape, even for old v1 clipboard content — so this always works.
  const restoreSnapshot = useCallback((parsed) => {
    return restoreFullSnapshot(parsed)
  }, [restoreFullSnapshot])

  function showSnapshotToast(r) {
    if (!r) return
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

  // null = closed; a string = open, pre-filled with that text
  const [loadText, setLoadText] = useState(null)
  const showLoadModal = loadText !== null

  const handleLoad = useCallback((rawText) => {
    if (isSnapshot(rawText)) {
      showSnapshotToast(restoreSnapshot(parseSnapshot(rawText)))
    } else {
      // One batched write instead of one write per pasted line
      const added = addNames(rawText.split('\n'))
      if (added > 0) {
        setRestoreMsg(`↓ Restored ${added} name${added === 1 ? '' : 's'}`)
        setTimeout(() => setRestoreMsg(''), 2500)
      }
    }
  }, [addNames, restoreSnapshot])

  useEffect(() => {
    if (status !== 'unlocked') return
    function handlePaste(e) {
      if (showLoadModal) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (isSnapshot(text)) {
        // Don't merge a whole snapshot silently — open Load so it's confirmed
        e.preventDefault()
        setLoadText(text)
        return
      }
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
      const tag = document.activeElement?.tagName
      if (lines.length <= 1 && (tag === 'INPUT' || tag === 'TEXTAREA')) return
      if (lines.length < 1) return
      e.preventDefault()
      const added = isMemoryMode
        ? (addNamesToMemSheet(activeMemSheetId, lines), 0)
        : addNames(lines)
      if (added > 0) {
        setRestoreMsg(`↓ Restored ${added} name${added === 1 ? '' : 's'}`)
        setTimeout(() => setRestoreMsg(''), 2500)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [status, addNames, showLoadModal, isMemoryMode, activeMemSheetId, addNamesToMemSheet])

  // ─── Settings panel ───────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false)

  // deleteAllData also removes Memory Sheets + Trash
  const handleDeleteAccount = (password) => deleteAccount(password, deleteAllData)

  function handleClearClick() {
    if (isMemoryMode) { clearMemSheet(activeMemSheetId); return }
    if (!confirmClear) { setConfirmClear(true); return }
    setConfirmClear(false)
    const removed = clearAll()
    if (removed?.names.length) setUndoClear({ removed })
  }

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
    return <FirebaseLoginScreen onSignIn={signIn} onSignUp={signUp} onResetPassword={resetPassword} />
  }

  if (authState === 'unverified') {
    return (
      <VerifyEmailScreen
        user={user}
        onResend={resendVerification}
        onCheckVerified={checkVerified}
        onSignOut={signOutUser}
      />
    )
  }

  // ─── Data load gate: never show (or write over) data we haven't loaded ───
  if (dataStatus === 'error') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100dvh', background: '#0b0b0f', color: '#f87171', gap: '12px', padding: '24px',
        fontFamily: 'Inter, system-ui, sans-serif', textAlign: 'center',
      }}>
        <span style={{ fontSize: '2rem' }}>📡</span>
        <strong>Couldn't load your data</strong>
        <p style={{ color: '#9ca3af', fontSize: '0.9rem', margin: 0 }}>
          Nothing was changed. Check your connection and try again.
        </p>
        <button className={styles.actionBtn} onClick={() => window.location.reload()}>Reload</button>
        <button className={styles.actionBtn} onClick={signOutUser}>Sign out</button>
      </div>
    )
  }

  if (dataStatus !== 'ready') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100dvh', background: '#0b0b0f', color: '#a855f7',
        fontFamily: 'Inter, system-ui, sans-serif', fontSize: '1.1rem', gap: '10px',
      }}>
        <span style={{ fontSize: '1.4rem' }}>🧠</span>
        Loading your sheets…
      </div>
    )
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
    return <BlastAnimation names={capturedNames} onComplete={handleBlastCompleteWithMemory} />
  }

  if (showMemoryPrompt) {
    return (
      <MemoryPrompt
        capturedNames={capturedNames}
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
          {/* Count badge */}
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
          {/* 📚 Memory mode badge */}
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
            disabled={!totalNames && !bag.length && !Object.keys(groups).length}
            aria-label="Copy all names"
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
          <button
            id="load-btn"
            className={`${styles.actionBtn} ${styles.load}`}
            onClick={() => setLoadText('')}
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

          {/* 📚 → Memory — bulk import (only in session mode) */}
          {!isMemoryMode && (
            <ImportToMemory
              sessionNames={names}
              bagNames={bag}
              memSheets={memSheets}
              onCopy={async (sheetId) => {
                await addNamesToMemSheet(sheetId, [...names, ...bag])
              }}
              onMove={async (sheetId) => {
                await addNamesToMemSheet(sheetId, [...names, ...bag])
                clearAll()
                clearBag()
                Object.entries(groups).forEach(([gid, g]) => {
                  const movedSet = new Set([...names, ...bag].map(n => n.toLowerCase()))
                  const anyRemaining = (g.members ?? []).some(m => !movedSet.has(m.toLowerCase()))
                  if (!anyRemaining) deleteGroup(gid)
                })
              }}
              onCreateAndCopy={async (sheetName) => {
                const id = await createMemorySheet(sheetName)
                if (id) await addNamesToMemSheet(id, [...names, ...bag])
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
                }
              }}
            />
          )}

          <button
            id="clear-btn"
            className={`${styles.actionBtn} ${styles.danger}`}
            onClick={handleClearClick}
            disabled={!displayNames.length}
            aria-label={isMemoryMode ? 'Clear memory sheet' : 'Clear current sheet'}
            title={isMemoryMode ? 'Remove all names from this memory sheet' : 'Clear names from this sheet (click twice; you can undo)'}
          >{isMemoryMode ? 'Clear Memory' : confirmClear ? `Clear ${displayNames.length}?` : 'Clear All'}</button>
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

          {/* 📚 Tab toggle — shows/hides memory sheet tabs in SheetBar */}
          <button
            id="memory-tabs-toggle-btn"
            className={`${styles.actionBtn} ${styles.memoryBtn} ${showMemTabs ? styles.memoryBtnActive : ''} ${activeMemSheetId ? styles.memoryBtnActive : ''}`}
            onClick={() => {
              const next = !showMemTabs
              setShowMemTabs(next)
              if (!next && activeMemSheetId) setActiveMemSheetId(null)
            }}
            aria-label="Toggle memory sheet tabs"
            aria-pressed={showMemTabs}
            title={showMemTabs ? 'Hide Memory Tabs' : `Show Memory Tabs (${Object.keys(memSheets).length})`}
          >
            📚 Tabs{Object.keys(memSheets).length > 0 && <span style={{ fontSize: '9px', fontWeight: 700, marginLeft: 2, opacity: 0.7 }}>{Object.keys(memSheets).length}</span>}
          </button>

          {/* 📚 Memory Panel button */}
          <button
            id="memory-btn"
            className={`${styles.actionBtn} ${styles.memoryBtn} ${Object.keys(memSheets).length > 0 ? styles.memoryBtnActive : ''}`}
            onClick={() => setShowMemory(true)}
            aria-label="Memory Sheets Panel"
            title={`Memory Sheets Panel${Object.keys(memSheets).length > 0 ? ` — ${Object.keys(memSheets).length} sheet(s)` : ''}`}
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
            highlightedNames={groupHighlightedNames}
            searchHighlighted={searchHighlighted}
            firstMatchName={firstMatchName}
            memoryNameSet={isMemoryMode ? new Set() : memoryNameSet}
            memoryIconMap={isMemoryMode ? new Map() : memoryIconMap}
            onRemove={handleGridRemove}
            onEdit={handleGridEdit}
            onTagSet={setTag}
            onMobileLongPress={handleMobileLongPress}
          />
        </section>

        {/* Right sidebar — collapsible with slide animation */}
        <div className={styles.rightPanelWrapper}>
          {/* Toggle tab — always visible on the panel's left edge */}
          <button
            className={styles.panelToggleTab}
            onClick={() => setRightPanelOpen(o => !o)}
            title={rightPanelOpen ? 'Collapse panel' : 'Expand panel'}
            aria-label={rightPanelOpen ? 'Collapse Groups & Bag' : 'Expand Groups & Bag'}
          >
            {rightPanelOpen ? '›' : '‹'}
          </button>

          <div className={`${styles.rightPanel} ${rightPanelOpen ? '' : styles.collapsed} ${mobileTab !== 'names' ? styles.mobileVisible : ''}`}>
            {(mobileTab === 'names' || mobileTab === 'groups') && (
              <Groups
                groups={sheetGroups}
                activeGroupId={selectedGroupId}
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
      </div>

      {/* ── Paste-restore toast ── */}
      {restoreMsg && (
        <div className={styles.toast} role="status" aria-live="polite">{restoreMsg}</div>
      )}

      {/* ── Mobile drop toast ── */}
      {toast && (
        <div className={styles.toast} role="status" aria-live="polite">{toast}</div>
      )}

      {/* ── Undo toast after Clear All ── */}
      {undoClear && (
        <div className={`${styles.toast} ${styles.toastInteractive}`} role="status" aria-live="polite">
          <span>Cleared {undoClear.removed.names.length} name{undoClear.removed.names.length !== 1 ? 's' : ''}</span>
          <button
            className={styles.toastAction}
            onClick={() => { restoreCleared(undoClear.removed); setUndoClear(null); showToast('↩ Restored') }}
          >Undo</button>
        </div>
      )}

      {/* ── Write-error toast (Firestore failure) ── */}
      {writeError && (
        <div
          className={`${styles.toast} ${styles.toastInteractive}`}
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
          initialText={loadText}
          onLoad={handleLoad}
          onClose={() => setLoadText(null)}
        />
      )}

      {/* ── Settings panel ── */}
      {showSettings && (
        <SettingsPanel
          user={user}
          isLockEnabled={isLockEnabled}
          onSignOut={signOutUser}
          onDeleteAccount={handleDeleteAccount}
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
          onEditName={editNameInMemSheet}
          onRestoreVersion={restorePreviousVersion}
          onRestoreTrash={restoreSheet}
          onPermanentDelete={permanentDelete}
          onExportJSON={exportAsJSON}
          onExportCSV={exportAsCSV}
          onSetIcon={setMemSheetIcon}
          onClose={() => setShowMemory(false)}
        />
      )}

      {/* ── Sheet bar — bottom strip ── */}
      <div className={styles.sheetBarWrap} ref={sheetBarRef}>
        <SheetBar
          sheets={sheets}
          activeSheetId={activeSheetId}
          namesBySheet={namesBySheet}
          onSwitch={switchSheet}
          onAdd={addSheet}
          onRename={renameSheet}
          onDelete={deleteSheet}
          onMoveName={handleMoveNameToSheet}
          memSheets={memSheets}
          activeMemSheetId={activeMemSheetId}
          showMemTabs={showMemTabs}
          onSwitchMemSheet={setActiveMemSheetId}
          onRenameMemSheet={renameMemorySheet}
          onDeleteMemSheet={handleDeleteMemTab}
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
