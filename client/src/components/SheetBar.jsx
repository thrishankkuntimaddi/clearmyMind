import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './SheetBar.module.css'

// ─── SheetBar ─────────────────────────────────────────────────────────────────
export default function SheetBar({
  // Session sheet props
  sheets, activeSheetId, onSwitch, onAdd, onRename, onDelete, onMoveName,
  // Memory tab props (optional — when passed, 📚 toggle button appears)
  memSheets, activeMemSheetId,
  onSwitchMemSheet, onRenameMemSheet, onDeleteMemSheet,
}) {
  const [renamingId,   setRenamingId]   = useState(null)
  const [draft,        setDraft]        = useState('')
  const [dragOverId,   setDragOverId]   = useState(null)
  // Toggle: show/hide memory sheet tabs in the bar
  const [showMemTabs,  setShowMemTabs]  = useState(false)

  const inputRef  = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (renamingId) inputRef.current?.focus()
  }, [renamingId])

  useEffect(() => {
    const active = scrollRef.current?.querySelector('[data-active="true"]')
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [activeSheetId, activeMemSheetId])

  function startRename(id, name, e) {
    e.stopPropagation()
    setRenamingId(id)
    setDraft(name ?? '')
  }

  function commitRename() {
    if (draft.trim() && renamingId) {
      // Could be session or memory sheet
      if (renamingId.startsWith('mem-')) {
        onRenameMemSheet?.(renamingId, draft.trim())
      } else {
        onRename(renamingId, draft.trim())
      }
    }
    setRenamingId(null)
    setDraft('')
  }

  function handleRenameKey(e) {
    if (e.key === 'Enter')  { e.preventDefault(); commitRename() }
    if (e.key === 'Escape') { setRenamingId(null); setDraft('') }
  }

  const handleDragOver = useCallback((e, sheetId) => {
    if (!e.dataTransfer.types.includes('text/plain')) return
    if (sheetId === activeSheetId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(sheetId)
  }, [activeSheetId])

  const handleDragLeave = useCallback((e, sheetId) => {
    setDragOverId(prev => prev === sheetId ? null : prev)
  }, [])

  const handleDrop = useCallback((e, sheetId) => {
    e.preventDefault()
    setDragOverId(null)
    if (sheetId === activeSheetId) return
    const name = e.dataTransfer.getData('text/plain')
    if (!name) return
    onMoveName?.(name, sheetId)
  }, [activeSheetId, onMoveName])

  const hasMemory  = memSheets && Object.keys(memSheets).length > 0
  const memEntries = memSheets ? Object.entries(memSheets) : []
  const memCount   = memEntries.length

  return (
    <div className={styles.sheetBar}>
      <div className={styles.tabsScroll} ref={scrollRef}>

        {/* ── Session sheet tabs ── */}
        {sheets.map(sheet => {
          const isActive   = sheet.id === activeSheetId && !activeMemSheetId
          const isDragOver = dragOverId === sheet.id && !isActive
          return (
            <div
              key={sheet.id}
              data-active={isActive ? 'true' : 'false'}
              data-sheet-id={sheet.id}
              className={[
                styles.tab,
                isActive   && styles.tabActive,
                isDragOver && styles.tabDragOver,
              ].filter(Boolean).join(' ')}
              onClick={() => { onSwitchMemSheet?.(null); onSwitch(sheet.id) }}
              onDoubleClick={(e) => startRename(sheet.id, sheet.name, e)}
              title={isActive
                ? `${sheet.name} — double-click to rename`
                : `${sheet.name} — drag a name here to move it`}
              onDragOver={(e) => handleDragOver(e, sheet.id)}
              onDragLeave={(e) => handleDragLeave(e, sheet.id)}
              onDrop={(e) => handleDrop(e, sheet.id)}
            >
              {renamingId === sheet.id ? (
                <input
                  ref={inputRef}
                  className={styles.renameInput}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={handleRenameKey}
                  onBlur={commitRename}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className={styles.tabName}>{sheet.name}</span>
              )}

              {isActive && sheets.length > 1 && (
                <button
                  className={styles.deleteTab}
                  onClick={e => { e.stopPropagation(); onDelete(sheet.id) }}
                  title="Delete sheet"
                  aria-label={`Delete ${sheet.name}`}
                >×</button>
              )}

              {isDragOver && (
                <span className={styles.dropHint} aria-hidden="true">Move here →</span>
              )}
            </div>
          )
        })}

        {/* ── 📚 Memory toggle button ── */}
        {memSheets && (
          <button
            className={`${styles.memToggleBtn} ${showMemTabs ? styles.memToggleBtnOn : ''} ${activeMemSheetId ? styles.memToggleBtnActive : ''}`}
            onClick={() => {
              const next = !showMemTabs
              setShowMemTabs(next)
              // When hiding, also deselect any active memory tab
              if (!next && activeMemSheetId) onSwitchMemSheet?.(null)
            }}
            title={showMemTabs ? 'Hide Memory Sheets' : `Show Memory Sheets (${memCount})`}
            aria-label="Toggle Memory Sheets in bar"
            aria-pressed={showMemTabs}
          >
            📚{memCount > 0 && <span className={styles.memToggleCount}>{memCount}</span>}
          </button>
        )}

        {/* ── Memory sheet tabs (shown when toggle is ON) ── */}
        {showMemTabs && memEntries.length > 0 && (
          <>
            <div className={styles.memTabDivider} aria-hidden="true" />
            {memEntries.map(([memId, memSheet]) => {
              const isMemActive = activeMemSheetId === memId
              return (
                <div
                  key={memId}
                  data-active={isMemActive ? 'true' : 'false'}
                  data-mem-id={memId}
                  className={[
                    styles.tab,
                    styles.tabMemory,
                    isMemActive && styles.tabMemoryActive,
                  ].filter(Boolean).join(' ')}
                  onClick={() => onSwitchMemSheet?.(memId)}
                  onDoubleClick={(e) => startRename(memId, memSheet.name, e)}
                  title={`${memSheet.name} (Memory) — double-click to rename`}
                >
                  {renamingId === memId ? (
                    <input
                      ref={inputRef}
                      className={styles.renameInput}
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={handleRenameKey}
                      onBlur={commitRename}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <span className={styles.memTabIcon}>{memSheet.icon ?? '📚'}</span>
                      <span className={styles.tabName}>{memSheet.name}</span>
                    </>
                  )}

                  {!renamingId && (
                    <span className={styles.memTabCount}>{(memSheet.names ?? []).length}</span>
                  )}

                  {isMemActive && (
                    <button
                      className={styles.deleteTab}
                      onClick={e => { e.stopPropagation(); onDeleteMemSheet?.(memId) }}
                      title="Delete memory sheet (goes to Trash)"
                      aria-label={`Delete ${memSheet.name}`}
                    >×</button>
                  )}
                </div>
              )
            })}
          </>
        )}

        {showMemTabs && memEntries.length === 0 && (
          <span className={styles.memEmptyHint}>No memory sheets yet — create one via 📚 button</span>
        )}
      </div>

      {/* Thin separator */}
      <div className={styles.addSep} aria-hidden="true" />

      {/* Add new session sheet */}
      <button className={styles.addTab} onClick={onAdd} title="New sheet" aria-label="Add sheet">
        +
      </button>
    </div>
  )
}
