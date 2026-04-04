import { useState, useRef, useEffect } from 'react'
import styles from './SheetBar.module.css'

export default function SheetBar({ sheets, activeSheetId, onSwitch, onAdd, onRename, onDelete }) {
  const [renamingId, setRenamingId] = useState(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)
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

  return (
    <div className={styles.sheetBar}>
      <div className={styles.tabsScroll} ref={scrollRef}>
        {sheets.map(sheet => {
          const isActive = sheet.id === activeSheetId
          return (
            <div
              key={sheet.id}
              data-active={isActive ? 'true' : 'false'}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => onSwitch(sheet.id)}
              onDoubleClick={(e) => startRename(sheet.id, sheet.name, e)}
              title={`${sheet.name} — double-click to rename`}
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
