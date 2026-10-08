import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useFirebaseAuth } from './hooks/useFirebaseAuth.js'
import { useFirestoreData } from './hooks/useFirestoreData.js'
import { buildFullSnapshot, isSnapshot, parseSnapshot } from './utils/snapshot.js'
import { cleanName } from './utils/validate.js'
import FirebaseLoginScreen from './components/FirebaseLoginScreen.jsx'
import VerifyEmailScreen from './components/VerifyEmailScreen.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import NameGrid from './components/NameGrid.jsx'
import BlastAnimation from './components/BlastAnimation.jsx'
import CongratsScreen from './components/CongratsScreen.jsx'
import LoadModal from './components/LoadModal.jsx'
import SheetBar from './components/SheetBar.jsx'
import MobileDragOverlay from './components/MobileDragOverlay.jsx'
import styles from './App.module.css'

const UNDO_MS = 8000

function FullScreenMessage({ children, color = '#a855f7' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100dvh', background: '#0b0b0f', color, gap: '12px', padding: '24px',
      fontFamily: 'Inter, system-ui, sans-serif', textAlign: 'center',
    }}>
      {children}
    </div>
  )
}

export default function App() {
  // ─── Firebase Auth ────────────────────────────────────────────────────────
  const {
    authState, user,
    signIn, signUp, resetPassword, resendVerification, checkVerified,
    signOutUser, deleteAccount,
  } = useFirebaseAuth()

  // ─── Data (only loads once the email is verified) ─────────────────────────
  const {
    status, error, clearError,
    sheets, activeSheetId, namesBySheet, tagsBySheet,
    switchSheet, addSheet, renameSheet, deleteSheet, moveNameToSheet,
    names, addName, addNames, editName, removeName, clearSheet, restoreCleared,
    tags, setTag, clearTags,
    restoreFullSnapshot, deleteAllData,
  } = useFirestoreData(authState === 'authenticated' ? user?.uid : undefined)

  // ─── Toast (with optional action button) ──────────────────────────────────
  const [toast, setToast] = useState(null)   // { text, action?: { label, run } }
  const toastTimer = useRef(null)
  const showToast = useCallback((text, action = null, ms = 2500) => {
    clearTimeout(toastTimer.current)
    setToast({ text, action })
    toastTimer.current = setTimeout(() => setToast(null), ms)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // ─── Clear ritual: confirm → blast → congrats → Undo toast ───────────────
  const [phase, setPhase]               = useState('idle')  // idle | blasting | congrats
  const [confirmClear, setConfirmClear] = useState(false)
  const [cleared, setCleared]           = useState(null)   // what the last clear removed

  useEffect(() => {
    if (!confirmClear) return
    const t = setTimeout(() => setConfirmClear(false), 3000)
    return () => clearTimeout(t)
  }, [confirmClear])

  const handleClear = useCallback(() => {
    if (!confirmClear) { setConfirmClear(true); return }
    setConfirmClear(false)
    const removed = clearSheet()
    if (!removed?.names.length) return
    setCleared(removed)
    setPhase('blasting')
  }, [confirmClear, clearSheet])

  const handleCongratsClose = useCallback(() => {
    setPhase('idle')
    setCleared(null)
    if (!cleared) return
    const n = cleared.names.length
    showToast(`Cleared ${n} name${n !== 1 ? 's' : ''}`, {
      label: 'Undo',
      run: () => { restoreCleared(cleared); showToast('↩ Restored') },
    }, UNDO_MS)
  }, [cleared, restoreCleared, showToast])

  // ─── Smart bar ────────────────────────────────────────────────────────────
  const [query, setQuery]               = useState('')
  const [smartShaking, setSmartShaking] = useState(false)
  const smartInputRef = useRef(null)
  const lastAdded     = useRef(null)

  const searchHighlighted = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return new Set()
    return new Set(names.filter((n) => n.toLowerCase().startsWith(q)))
  }, [query, names])

  const firstMatchName = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? names.find((n) => n.toLowerCase().startsWith(q)) ?? null : null
  }, [query, names])

  useEffect(() => {
    if (!firstMatchName) return
    const t = setTimeout(() => {
      document.querySelector('[data-search-first="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 40)
    return () => clearTimeout(t)
  }, [firstMatchName])

  function handleSmartKey(e) {
    if (e.key === 'Escape') { setQuery(''); return }
    if (e.key !== 'Enter') return
    const trimmed = query.trim()
    if (!trimmed || names.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return
    e.preventDefault()
    if (addName(trimmed)) {
      lastAdded.current = cleanName(trimmed)
      setQuery('')
    } else {
      setSmartShaking(true)
      setTimeout(() => setSmartShaking(false), 420)
    }
  }

  // Typing anywhere focuses the smart bar; Cmd/Ctrl+Z undoes the last add
  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName
      const inField = tag === 'INPUT' || tag === 'TEXTAREA'
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z'
      if (isUndo && lastAdded.current && !(inField && document.activeElement.value)) {
        if (inField && document.activeElement !== smartInputRef.current) return
        e.preventDefault()
        const name = lastAdded.current
        lastAdded.current = null
        removeName(name)
        setQuery(name)
        smartInputRef.current?.focus()
        return
      }
      if (inField || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return
      smartInputRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [removeName])

  // ─── Copy / Load ──────────────────────────────────────────────────────────
  const totalNames = useMemo(
    () => sheets.reduce((s, sh) => s + (namesBySheet[sh.id]?.length ?? 0), 0),
    [sheets, namesBySheet],
  )
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    if (!totalNames) return
    try {
      await navigator.clipboard.writeText(buildFullSnapshot(sheets, namesBySheet, tagsBySheet))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('⚠️ Clipboard not available')
    }
  }, [totalNames, sheets, namesBySheet, tagsBySheet, showToast])

  const [loadText, setLoadText] = useState(null)   // null = modal closed

  const handleLoad = useCallback((rawText) => {
    if (isSnapshot(rawText)) {
      const r = restoreFullSnapshot(parseSnapshot(rawText))
      if (!r) return
      const parts = [`${r.sheetsRestored} sheet${r.sheetsRestored !== 1 ? 's' : ''}`]
      if (r.totalNames) parts.push(`${r.totalNames} new name${r.totalNames !== 1 ? 's' : ''}`)
      if (r.colors) parts.push(`${r.colors} color${r.colors !== 1 ? 's' : ''}`)
      showToast(`✓ Snapshot — ${parts.join(' · ')}`, null, 3500)
      return
    }
    const added = addNames(rawText.split('\n'))
    if (added) showToast(`↓ Added ${added} name${added !== 1 ? 's' : ''}`)
  }, [addNames, restoreFullSnapshot, showToast])

  // Pasting a list adds it; pasting a snapshot opens Load so you can confirm
  useEffect(() => {
    if (status !== 'ready') return
    function handlePaste(e) {
      if (loadText !== null) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (isSnapshot(text)) { e.preventDefault(); setLoadText(text); return }
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
      const inInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA'
      if (!lines.length || (lines.length === 1 && inInput)) return
      e.preventDefault()
      const added = addNames(lines)
      if (added) showToast(`↓ Added ${added} name${added !== 1 ? 's' : ''}`)
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [status, loadText, addNames, showToast])

  // ─── Moving names between sheets (desktop drag + mobile long-press) ──────
  const [mobileDraggingName, setMobileDraggingName] = useState(null)
  const [mobileDragPos, setMobileDragPos]           = useState({ x: 0, y: 0 })

  const handleMobileLongPress = useCallback((name, x, y) => {
    setMobileDraggingName(name)
    setMobileDragPos({ x, y })
  }, [])
  const handleMobileDragCancel = useCallback(() => setMobileDraggingName(null), [])

  const handleMoveNameToSheet = useCallback((name, toSheetId) => {
    setMobileDraggingName(null)
    const result = moveNameToSheet(name, activeSheetId, toSheetId)
    const dest   = sheets.find((s) => s.id === toSheetId)?.name ?? 'sheet'
    if (result.ok) showToast(`➡️ ${name} moved to ${dest}`)
    else if (result.reason === 'duplicate') showToast(`⚠️ ${name} is already in ${dest}`)
    else if (result.reason === 'full') showToast(`⚠️ ${dest} is full`)
  }, [moveNameToSheet, activeSheetId, sheets, showToast])

  const [showSettings, setShowSettings] = useState(false)

  const handleDeleteAccount = useCallback(
    (password) => deleteAccount(password, deleteAllData),
    [deleteAccount, deleteAllData],
  )

  // ─── Rendering waterfall ──────────────────────────────────────────────────
  if (authState === 'not-configured') {
    return (
      <FullScreenMessage color="#f87171">
        <span style={{ fontSize: '2.5rem' }}>⚠️</span>
        <strong style={{ fontSize: '1.1rem' }}>Firebase not configured</strong>
        <p style={{ color: '#9ca3af', fontSize: '0.9rem', maxWidth: '360px', margin: 0 }}>
          The app's Firebase credentials are missing from this build.
          Add the <code style={{ color: '#a855f7' }}>VITE_FIREBASE_*</code> secrets
          to GitHub → Settings → Secrets, then re-run the Actions workflow.
        </p>
      </FullScreenMessage>
    )
  }

  if (authState === 'loading') {
    return <FullScreenMessage><span style={{ fontSize: '1.4rem' }}>🧠</span>Loading…</FullScreenMessage>
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

  if (status === 'loading' || status === 'idle') {
    return <FullScreenMessage><span style={{ fontSize: '1.4rem' }}>🧠</span>Loading your sheets…</FullScreenMessage>
  }

  if (status === 'error') {
    return (
      <FullScreenMessage color="#f87171">
        <span style={{ fontSize: '2rem' }}>📡</span>
        <strong>Couldn't load your data</strong>
        <p style={{ color: '#9ca3af', fontSize: '0.9rem', margin: 0 }}>
          Nothing was changed. Check your connection and try again.
        </p>
        <button className={styles.actionBtn} onClick={() => window.location.reload()}>Reload</button>
        <button className={styles.actionBtn} onClick={signOutUser}>Sign out</button>
      </FullScreenMessage>
    )
  }

  if (phase === 'blasting') {
    return <BlastAnimation names={cleared?.names ?? []} onComplete={() => setPhase('congrats')} />
  }

  if (phase === 'congrats') {
    return <CongratsScreen onClose={handleCongratsClose} />
  }

  const trimmedQuery = query.trim()
  const exactExists  = trimmedQuery ? names.some((n) => n.toLowerCase() === trimmedQuery.toLowerCase()) : false
  const isAddMode    = !!trimmedQuery && !exactExists
  const isSearchMode = !!trimmedQuery && searchHighlighted.size > 0

  // ─── Main app ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon} aria-hidden="true">🧠</span>
          <span className={styles.title}>ClearMyMind</span>
          {names.length > 0 && <span className={styles.count} aria-live="polite">{names.length}</span>}
        </div>

        {/* Smart bar: type to search, Enter to add */}
        <div className={styles.headerInput}>
          <div
            className={`${styles.smartBar} ${
              smartShaking ? styles.smartBarShake  :
              isAddMode    ? styles.smartBarAdd    :
              isSearchMode ? styles.smartBarSearch : ''}`}
          >
            <span className={styles.smartBarIcon} aria-hidden="true">{isAddMode ? '+' : '🔍'}</span>
            <input
              ref={smartInputRef}
              id="smart-input"
              type="text"
              className={styles.smartBarInput}
              placeholder="Search or add a name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSmartKey}
              maxLength={100}
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

        <div className={styles.actions}>
          <button
            id="copy-btn"
            className={`${styles.actionBtn} ${copied ? styles.copied : ''}`}
            onClick={handleCopy}
            disabled={!totalNames}
            title="Copy a snapshot of all sheets (paste it into Load to restore)"
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
          <button
            id="load-btn"
            className={`${styles.actionBtn} ${styles.load}`}
            onClick={() => setLoadText('')}
            title="Paste a list of names or a snapshot"
          >Load</button>

          {Object.keys(tags).length > 0 && (
            <>
              <span className={styles.btnDivider} />
              <button
                id="clear-colors-btn"
                className={`${styles.actionBtn} ${styles.clearColors}`}
                onClick={clearTags}
                title="Remove all colors on this sheet"
              >🎨 Clear colors</button>
            </>
          )}

          <span className={styles.btnDivider} />

          <button
            id="clear-btn"
            className={`${styles.actionBtn} ${styles.danger}`}
            onClick={handleClear}
            disabled={!names.length}
            title="Clear every name on this sheet (you can undo)"
          >{confirmClear ? `Clear ${names.length}?` : 'Clear my mind'}</button>
          <button
            id="settings-btn"
            className={`${styles.actionBtn} ${styles.settingsBtn}`}
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            title="Settings"
          >⚙️</button>
        </div>
      </header>

      <section className={styles.gridSection} aria-label="Name list">
        {names.length === 0 && !query ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Your mind is clear.</p>
            <p className={styles.emptyHint}>
              Start typing anywhere and press <kbd>Enter</kbd> to get a name out of your head.
              Paste a list to add many at once.
            </p>
          </div>
        ) : (
          <NameGrid
            names={names}
            tags={tags}
            searchHighlighted={searchHighlighted}
            firstMatchName={firstMatchName}
            onRemove={removeName}
            onEdit={editName}
            onTagSet={setTag}
            onMobileLongPress={handleMobileLongPress}
          />
        )}
      </section>

      {toast && (
        <div className={`${styles.toast} ${toast.action ? styles.toastInteractive : ''}`} role="status" aria-live="polite">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className={styles.toastAction}
              onClick={() => { const run = toast.action.run; setToast(null); run() }}
            >{toast.action.label}</button>
          )}
        </div>
      )}

      {error && (
        <div className={`${styles.toast} ${styles.toastError}`} role="alert" aria-live="assertive">
          <span>{error}</span>
          <button className={styles.toastAction} onClick={clearError} aria-label="Dismiss error">×</button>
        </div>
      )}

      {loadText !== null && (
        <LoadModal initialText={loadText} onLoad={handleLoad} onClose={() => setLoadText(null)} />
      )}

      {showSettings && (
        <SettingsPanel
          user={user}
          onSignOut={signOutUser}
          onDeleteData={deleteAllData}
          onDeleteAccount={handleDeleteAccount}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div className={styles.sheetBarWrap}>
        <SheetBar
          sheets={sheets}
          activeSheetId={activeSheetId}
          namesBySheet={namesBySheet}
          onSwitch={(id) => { setConfirmClear(false); switchSheet(id) }}
          onAdd={addSheet}
          onRename={renameSheet}
          onDelete={deleteSheet}
          onMoveName={handleMoveNameToSheet}
        />
      </div>

      <MobileDragOverlay
        draggingName={mobileDraggingName}
        initialPos={mobileDragPos}
        sheets={sheets}
        activeSheetId={activeSheetId}
        onMoveNameToSheet={handleMoveNameToSheet}
        onCancel={handleMobileDragCancel}
      />
    </div>
  )
}
