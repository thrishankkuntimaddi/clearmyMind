import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './SheetBar.module.css'

// ─── MemoryPicker — inline popover for selecting/creating a memory sheet ──────
function MemoryPicker({ memSheets, onAdd, onCreateAndAdd, onClose }) {
  const [creating,  setCreating]  = useState(false)
  const [newName,   setNewName]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const newRef  = useRef(null)
  const boxRef  = useRef(null)

  useEffect(() => { if (creating) newRef.current?.focus() }, [creating])

  // Close when clicking outside
  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
    }
  }, [onClose])

  async function handleAdd(sheetId) {
    setLoading(true)
    await onAdd(sheetId)
    setLoading(false)
    onClose()
  }

  async function handleCreate(e) {
    e.preventDefault()
    const t = newName.trim()
    if (!t) return
    setLoading(true)
    await onCreateAndAdd(t)
    setLoading(false)
    onClose()
  }

  const sheetList = Object.entries(memSheets)

  return (
    <div className={styles.memPicker} ref={boxRef}>
      <p className={styles.memPickerTitle}>📚 Save to Memory Sheet</p>

      {sheetList.length === 0 && !creating && (
        <p className={styles.memPickerEmpty}>No memory sheets yet.</p>
      )}

      {sheetList.map(([id, sh]) => (
        <button
          key={id}
          className={styles.memPickerRow}
          onClick={() => handleAdd(id)}
          disabled={loading}
        >
          <span className={styles.memPickerName}>{sh.name}</span>
          <span className={styles.memPickerCount}>{sh.names?.length ?? 0}</span>
        </button>
      ))}

      {creating ? (
        <form className={styles.memPickerNewForm} onSubmit={handleCreate}>
          <input
            ref={newRef}
            className={styles.memPickerInput}
            placeholder="New sheet name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setCreating(false)}
            disabled={loading}
          />
          <button type="submit" className={styles.memPickerCreate} disabled={!newName.trim() || loading}>
            {loading ? '…' : 'Create & Save'}
          </button>
        </form>
      ) : (
        <button className={styles.memPickerNew} onClick={() => setCreating(true)} disabled={loading}>
          + New sheet
        </button>
      )}
    </div>
  )
}

// ─── SheetBar ─────────────────────────────────────────────────────────────────
export default function SheetBar({
  sheets, activeSheetId, onSwitch, onAdd, onRename, onDelete, onMoveName,
  // Memory sheet tabs
  memSheets, activeMemSheetId,
  onSwitchMemSheet, onRenameMemSheet, onDeleteMemSheet, onAddMemSheet,
  // Legacy memory save popover (kept for backward compat, still works)
  activeSheetNames,
  onAddNamesToMemSheet, onCreateMemSheetAndAdd,
}) {
  const [renamingId,    setRenamingId]    = useState(null)
  const [draft,         setDraft]         = useState('')
  const [dragOverId,    setDragOverId]    = useState(null)
  const [memPickerOpen, setMemPickerOpen] = useState(false)   // shows memory picker popover
  const [memToast,      setMemToast]      = useState('')      // brief success message

  const inputRef  = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (renamingId) inputRef.current?.focus()
  }, [renamingId])

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
    if (e.key === 'Enter')  { e.preventDefault(); commitRename() }
    if (e.key === 'Escape') { setRenamingId(null); setDraft('') }
  }

  // ── Memory picker handlers ────────────────────────────────────────────────
  async function handleAddToExisting(sheetId) {
    if (!onAddNamesToMemSheet || !activeSheetNames?.length) return
    const added = await onAddNamesToMemSheet(sheetId, activeSheetNames)
    showMemToast(added)
  }

  async function handleCreateAndAdd(name) {
    if (!onCreateMemSheetAndAdd || !activeSheetNames?.length) return
    const added = await onCreateMemSheetAndAdd(name, activeSheetNames)
    showMemToast(added)
  }

  function showMemToast(count) {
    const msg = count > 0 ? `✓ ${count} name${count !== 1 ? 's' : ''} saved to Memory` : '✓ Saved to Memory'
    setMemToast(msg)
    setTimeout(() => setMemToast(''), 2400)
  }

  // ── Drag-to-move-sheet handlers ───────────────────────────────────────────
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

  const hasMemory  = !!memSheets
  const hasNames   = (activeSheetNames?.length ?? 0) > 0
  const memEntries = memSheets ? Object.entries(memSheets) : []

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
              title={isActive ? `${sheet.name} — double-click to rename` : `${sheet.name} — drag a name here to move it`}
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

              {/* 📚 Add-to-Memory quick save (only if memory sheets exist) */}
              {isActive && hasMemory && hasNames && (
                <div className={styles.memBtnWrap} onClick={e => e.stopPropagation()}>
                  <button
                    id={`add-to-memory-${sheet.id}`}
                    className={`${styles.memBtn} ${memPickerOpen ? styles.memBtnOpen : ''}`}
                    onClick={() => setMemPickerOpen(p => !p)}
                    title="Save names to Memory Sheet"
                    aria-label="Add to Memory Sheet"
                  >
                    📚
                  </button>
                  {memPickerOpen && (
                    <MemoryPicker
                      memSheets={memSheets}
                      onAdd={handleAddToExisting}
                      onCreateAndAdd={handleCreateAndAdd}
                      onClose={() => setMemPickerOpen(false)}
                    />
                  )}
                </div>
              )}

              {/* × Delete session sheet */}
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

              {isDragOver && (
                <span className={styles.dropHint} aria-hidden="true">Move here →</span>
              )}
            </div>
          )
        })}

        {/* ── Divider + Memory sheet tabs (if any exist) ── */}
        {memEntries.length > 0 && (
          <>
            <div className={styles.memTabDivider} aria-hidden="true" />
            {memEntries.map(([memId, memSheet]) => {
              const isMemActive = activeMemSheetId === memId
              return (
                <div
                  key={memId}
                  className={[
                    styles.tab,
                    styles.tabMemory,
                    isMemActive && styles.tabMemoryActive,
                  ].filter(Boolean).join(' ')}
                  onClick={() => onSwitchMemSheet?.(memId)}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setRenamingId(memId)
                    setDraft(memSheet.name ?? '')
                  }}
                  title={`${memSheet.name} (Memory) — double-click to rename`}
                  data-mem-id={memId}
                >
                  {renamingId === memId ? (
                    <input
                      ref={inputRef}
                      className={styles.renameInput}
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  { e.preventDefault(); if (draft.trim()) onRenameMemSheet?.(memId, draft.trim()); setRenamingId(null) }
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onBlur={() => { if (draft.trim()) onRenameMemSheet?.(memId, draft.trim()); setRenamingId(null) }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <span className={styles.memTabIcon}>📚</span>
                      <span className={styles.tabName}>{memSheet.name}</span>
                    </>
                  )}

                  {/* Count badge */}
                  {!renamingId && (
                    <span className={styles.memTabCount}>{(memSheet.names ?? []).length}</span>
                  )}

                  {/* × Delete memory tab */}
                  {isMemActive && (
                    <button
                      className={styles.deleteTab}
                      onClick={e => { e.stopPropagation(); onDeleteMemSheet?.(memId) }}
                      title="Delete memory sheet (goes to Trash)"
                      aria-label={`Delete ${memSheet.name} memory sheet`}
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}

            {/* + New memory sheet */}
            {onAddMemSheet && (
              <button
                className={`${styles.addTab} ${styles.addMemTab}`}
                onClick={onAddMemSheet}
                title="New Memory Sheet"
                aria-label="Add memory sheet"
              >
                📚+
              </button>
            )}
          </>
        )}
      </div>

      {/* Thin separator */}
      <div className={styles.addSep} aria-hidden="true" />

      {/* Add new session sheet */}
      <button className={styles.addTab} onClick={onAdd} title="New sheet" aria-label="Add sheet">
        +
      </button>

      {/* Success toast */}
      {memToast && (
        <div className={styles.memToast} role="status">{memToast}</div>
      )}
    </div>
  )
}

