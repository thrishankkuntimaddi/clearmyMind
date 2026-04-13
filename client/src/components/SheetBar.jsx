import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './SheetBar.module.css'

export default function SheetBar({ sheets, activeSheetId, onSwitch, onAdd, onRename, onDelete, onMoveName }) {
  const [renamingId,  setRenamingId]  = useState(null)
  const [draft,       setDraft]       = useState('')
  const [dragOverId,  setDragOverId]  = useState(null)   // which tab is being hovered during drag
  const inputRef  = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (renamingId) inputRef.current?.focus()
  }, [renamingId])

  // Scroll active tab into view when switching
  useEffect(() => {
    const active = scrollRef.current?.querySelector('[data-active="true"]')
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [activeSheetId])

  function startRename(id, currentName, e) {
    e.stopPropagation()
    setRenamingId(id)
    setDraft(currentName)
  }

  function commitRename() {
    if (draft.trim()) onRename(renamingId, draft.trim())
    setRenamingId(null)
    setDraft('')
  }

  function handleRenameKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitRename() }
    if (e.key === 'Escape') { setRenamingId(null); setDraft('') }
  }

  // ── Drag-to-move-sheet handlers ───────────────────────────────────────────────
  const handleDragOver = useCallback((e, sheetId) => {
    // Only accept drags that carry a name (text/plain)
    if (!e.dataTransfer.types.includes('text/plain')) return
    // Allow drop only on a different sheet
    if (sheetId === activeSheetId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(sheetId)
  }, [activeSheetId])

  const handleDragLeave = useCallback((e, sheetId) => {
    // Only clear if we're leaving this specific tab
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

  return (
    <div className={styles.sheetBar}>
      <div className={styles.tabsScroll} ref={scrollRef}>
        {sheets.map(sheet => {
          const isActive   = sheet.id === activeSheetId
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
              onClick={() => onSwitch(sheet.id)}
              onDoubleClick={(e) => startRename(sheet.id, sheet.name, e)}
              title={isActive ? `${sheet.name} — double-click to rename` : `${sheet.name} — drag a name here to move it`}
              // Drop-zone events
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

              {/* Delete button — only show if more than 1 sheet and this tab is active */}
              {isActive && sheets.length > 1 && (
                <button
                  className={styles.deleteTab}
                  onClick={e => { e.stopPropagation(); onDelete(sheet.id) }}
                  title="Delete sheet"
                  aria-label={`Delete ${sheet.name}`}
                >
                  ×
                </button>
              )}

              {/* Drag-over label hint */}
              {isDragOver && (
                <span className={styles.dropHint} aria-hidden="true">Move here →</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Thin separator */}
      <div className={styles.addSep} aria-hidden="true" />

      {/* Add new sheet button */}
      <button
        className={styles.addTab}
        onClick={onAdd}
        title="New sheet"
        aria-label="Add sheet"
      >
        +
      </button>
    </div>
  )
}
