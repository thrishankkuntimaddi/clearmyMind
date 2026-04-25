/**
 * MemoryPanel — Full Memory Sheets UI
 * Includes: sheet manager, trash, export, versioning, post-session save flow.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './MemoryPanel.module.css'

// ─── Trash: human-readable days since deletion ────────────────────────────────
function daysSince(deletedAt) {
  if (!deletedAt) return '?'
  const ms = deletedAt?.toMillis?.() ?? (typeof deletedAt === 'number' ? deletedAt : Date.now())
  const diff = Math.floor((Date.now() - ms) / 86400000)
  return diff === 0 ? 'today' : `${diff}d ago`
}

// ─── NameRow — one name in the sheet table with safe 2-step delete ───────────
function NameRow({ sheetId, name, onRemove, onEdit }) {
  const [confirming, setConfirming] = useState(false)
  const [editing,    setEditing]    = useState(false)
  const [draft,      setDraft]      = useState(name)
  const editRef = useRef(null)

  useEffect(() => { if (editing) editRef.current?.focus() }, [editing])

  // Reset confirm state after 3s of inactivity
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(t)
  }, [confirming])

  function commitEdit() {
    const t = draft.trim()
    if (t && t !== name) onEdit(sheetId, name, t)
    setEditing(false)
  }

  return (
    <div className={styles.nameRow}>
      {editing ? (
        <input
          ref={editRef}
          className={styles.nameRowEditInput}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.preventDefault(); commitEdit() }
            if (e.key === 'Escape') { setDraft(name); setEditing(false) }
          }}
        />
      ) : (
        <span
          className={styles.nameRowLabel}
          onDoubleClick={() => { setDraft(name); setEditing(true) }}
          title="Double-click to rename"
        >
          {name}
        </span>
      )}
      <div className={styles.nameRowActions}>
        {!editing && (
          <button
            className={styles.nameRowEdit}
            onClick={() => { setDraft(name); setEditing(true) }}
            title="Rename"
            aria-label={`Rename ${name}`}
          >✎</button>
        )}
        {confirming ? (
          <>
            <span className={styles.nameRowConfirmText}>Remove?</span>
            <button
              className={styles.nameRowConfirmYes}
              onClick={() => onRemove(sheetId, name)}
              title="Yes, remove"
            >Yes</button>
            <button
              className={styles.nameRowConfirmNo}
              onClick={() => setConfirming(false)}
              title="Cancel"
            >No</button>
          </>
        ) : (
          <button
            className={styles.nameRowDelete}
            onClick={() => setConfirming(true)}
            title="Remove name (will ask to confirm)"
            aria-label={`Remove ${name}`}
          >🗑</button>
        )}
      </div>
    </div>
  )
}

// ─── SheetCard — one expandable sheet in the panel ───────────────────────────
function SheetCard({
  sheetId, sheet, onRename, onDelete, onClearAll,
  onAddName, onRemoveName, onEditName, onRestoreVersion, hasVersion,
}) {
  const [expanded,  setExpanded]  = useState(true)
  const [renaming,  setRenaming]  = useState(false)
  const [draft,     setDraft]     = useState('')
  const [addDraft,  setAddDraft]  = useState('')
  const [adding,    setAdding]    = useState(false)
  const [clearing,  setClearing]  = useState(false)
  const renameRef = useRef(null)
  const addRef    = useRef(null)

  useEffect(() => { if (renaming) renameRef.current?.focus() }, [renaming])
  useEffect(() => { if (adding)   addRef.current?.focus()    }, [adding])
  useEffect(() => {
    if (!clearing) return
    const t = setTimeout(() => setClearing(false), 4000)
    return () => clearTimeout(t)
  }, [clearing])

  function commitRename() {
    const t = draft.trim()
    if (t && t !== sheet.name) onRename(sheetId, t)
    setRenaming(false)
  }

  function commitAdd(e) {
    e.preventDefault()
    const t = addDraft.trim()
    if (t) { onAddName(sheetId, [t]); setAddDraft('') }
  }

  const names   = sheet.names ?? []
  const isEmpty = names.length === 0

  return (
    <div className={styles.sheetCard}>
      {/* Sheet header */}
      <div className={styles.sheetHeader} onClick={() => !renaming && setExpanded(x => !x)}>
        <span className={styles.sheetChevron}>{expanded ? '▾' : '▸'}</span>
        <span className={styles.sheetIcon}>{sheet.icon ?? '📚'}</span>

        {renaming ? (
          <input
            ref={renameRef}
            className={styles.renameInput}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); commitRename() }
              if (e.key === 'Escape') { setRenaming(false) }
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className={styles.sheetName}>{sheet.name ?? 'Untitled'}</span>
        )}

        <span className={styles.sheetCount}>{names.length}</span>

        <div className={styles.sheetActions} onClick={e => e.stopPropagation()}>
          {hasVersion && (
            <button
              className={styles.iconBtn}
              onClick={() => onRestoreVersion(sheetId)}
              title="Restore previous version"
              aria-label="Restore previous version"
            >↩</button>
          )}
          <button
            className={styles.iconBtn}
            onClick={() => { setDraft(sheet.name ?? ''); setRenaming(true); setExpanded(true) }}
            title="Rename sheet"
            aria-label="Rename sheet"
          >✎</button>

          {/* 2-step Clear All */}
          {!isEmpty && !clearing && (
            <button
              className={`${styles.iconBtn} ${styles.iconBtnWarn}`}
              onClick={() => setClearing(true)}
              title="Clear all names (asks for confirmation)"
              aria-label="Clear all names"
            >⊘</button>
          )}
          {clearing && (
            <>
              <span className={styles.clearConfirmText}>Clear all?</span>
              <button className={styles.clearConfirmYes} onClick={() => { onClearAll(sheetId); setClearing(false) }}>Yes</button>
              <button className={styles.clearConfirmNo}  onClick={() => setClearing(false)}>No</button>
            </>
          )}

          <button
            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
            onClick={() => onDelete(sheetId)}
            title="Delete sheet (goes to trash)"
            aria-label="Delete sheet"
          >🗑</button>
        </div>
      </div>

      {/* Sheet body */}
      {expanded && (
        <div className={styles.sheetBody}>
          {isEmpty && (
            <p className={styles.emptyHint}>No names yet. Add one below.</p>
          )}

          {/* Safe name table */}
          {!isEmpty && (
            <div className={styles.nameTable}>
              <div className={styles.nameTableHeader}>
                <span>Name</span>
                <span>Actions</span>
              </div>
              {names.map(name => (
                <NameRow
                  key={name}
                  sheetId={sheetId}
                  name={name}
                  onRemove={onRemoveName}
                  onEdit={onEditName}
                />
              ))}
            </div>
          )}

          {/* Inline add */}
          <form className={styles.addRow} onSubmit={commitAdd}>
            <input
              ref={addRef}
              className={styles.addInput}
              placeholder="Add a name…"
              value={addDraft}
              onChange={e => setAddDraft(e.target.value)}
              onFocus={() => setAdding(true)}
              onBlur={() => { if (!addDraft) setAdding(false) }}
              spellCheck={false}
            />
            {(adding || addDraft) && (
              <button type="submit" className={styles.addBtn} disabled={!addDraft.trim()}>
                + Add
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  )
}

// ─── TrashPanel — list of soft-deleted sheets ────────────────────────────────
function TrashPanel({ trash, onRestore, onPermanentDelete }) {
  const entries = Object.entries(trash)
  if (!entries.length) {
    return <p className={styles.emptyHint} style={{ padding: '12px 0' }}>Trash is empty.</p>
  }
  return (
    <div className={styles.trashList}>
      {entries.map(([trashId, item]) => (
        <div key={trashId} className={styles.trashItem}>
          <div className={styles.trashInfo}>
            <span className={styles.trashName}>{item.name}</span>
            <span className={styles.trashMeta}>
              {(item.names ?? []).length} names · deleted {daysSince(item.deletedAt)}
            </span>
          </div>
          <div className={styles.trashBtns}>
            <button className={styles.restoreBtn} onClick={() => onRestore(trashId)}>
              ↩ Restore
            </button>
            <button
              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
              onClick={() => onPermanentDelete(trashId)}
              title="Delete permanently"
            >🗑</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── MemoryPrompt — post-blast "Save to Memory?" modal ───────────────────────
export function MemoryPrompt({ capturedNames, memSheets, onSave, onDiscard, onCreateSheet }) {
  const [selected,      setSelected]      = useState(new Set(capturedNames))
  const [targetSheetId, setTargetSheetId] = useState(Object.keys(memSheets)[0] ?? null)
  const [creating,      setCreating]      = useState(false)
  const [newSheetName,  setNewSheetName]  = useState('')
  const newRef = useRef(null)

  useEffect(() => { if (creating) newRef.current?.focus() }, [creating])

  const sheetList = Object.entries(memSheets)

  function toggleName(name) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  async function handleSave() {
    if (!targetSheetId || !selected.size) return
    await onSave(targetSheetId, [...selected])
  }

  async function handleCreate(e) {
    e.preventDefault()
    const t = newSheetName.trim()
    if (!t) return
    const id = await onCreateSheet(t)
    if (id) {
      setTargetSheetId(id)
      setCreating(false)
      setNewSheetName('')
    }
  }

  return (
    <div className={styles.promptBackdrop}>
      <div className={styles.promptBox}>
        <h2 className={styles.promptTitle}>💭 Session Complete</h2>
        <p className={styles.promptSubtitle}>Save any of these to your Memory?</p>

        {/* Name checklist */}
        <div className={styles.promptNames}>
          {capturedNames.map(name => (
            <label key={name} className={styles.promptNameRow}>
              <input
                type="checkbox"
                checked={selected.has(name)}
                onChange={() => toggleName(name)}
              />
              <span className={styles.promptNameLabel}>{name}</span>
            </label>
          ))}
        </div>

        {/* Sheet selector */}
        {selected.size > 0 && (
          <div className={styles.sheetPicker}>
            <p className={styles.pickerLabel}>Save to:</p>
            <div className={styles.pickerOptions}>
              {sheetList.map(([id, sh]) => (
                <label key={id} className={`${styles.pickerOption} ${targetSheetId === id ? styles.pickerOptionSelected : ''}`}>
                  <input
                    type="radio"
                    name="sheet"
                    value={id}
                    checked={targetSheetId === id}
                    onChange={() => setTargetSheetId(id)}
                  />
                  {sh.name}
                </label>
              ))}
              {!creating ? (
                <button className={styles.pickerNewBtn} onClick={() => setCreating(true)}>
                  + New sheet
                </button>
              ) : (
                <form onSubmit={handleCreate} className={styles.pickerNewForm}>
                  <input
                    ref={newRef}
                    className={styles.addInput}
                    placeholder="Sheet name…"
                    value={newSheetName}
                    onChange={e => setNewSheetName(e.target.value)}
                  />
                  <button type="submit" className={styles.addBtn} disabled={!newSheetName.trim()}>
                    Create
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className={styles.promptActions}>
          <button className={styles.promptDiscard} onClick={onDiscard}>
            Discard
          </button>
          <button
            className={styles.promptSave}
            onClick={handleSave}
            disabled={!selected.size || !targetSheetId}
          >
            📚 Save to Memory
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MemoryPanel — main drawer/panel ─────────────────────────────────────────
export default function MemoryPanel({
  memSheets, trash, trashCount,
  onCreateSheet, onRenameSheet, onDeleteSheet, onClearSheet,
  onAddNames, onRemoveName, onEditName, onRestoreVersion,
  onRestoreTrash, onPermanentDelete,
  onExportJSON, onExportCSV,
  onClose,
}) {
  const [tab,          setTab]          = useState('sheets') // 'sheets' | 'trash'
  const [creating,     setCreating]     = useState(false)
  const [newSheetName, setNewSheetName] = useState('')
  const [toast,        setToast]        = useState('')
  const newRef    = useRef(null)
  const panelRef  = useRef(null)

  useEffect(() => { if (creating) newRef.current?.focus() }, [creating])

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    const t = newSheetName.trim()
    if (!t) return
    await onCreateSheet(t)
    setNewSheetName('')
    setCreating(false)
  }

  async function handleDelete(sheetId) {
    const trashId = await onDeleteSheet(sheetId)
    if (trashId) showToast('Sheet moved to Trash. Restore within 30 days.')
  }

  async function handleRestoreTrash(trashId) {
    await onRestoreTrash(trashId)
    showToast('Sheet restored.')
  }

  async function handleRestoreVersion(sheetId) {
    const names = await onRestoreVersion(sheetId)
    if (names) showToast(`Restored previous version (${names.length} names).`)
    else showToast('No previous version available.')
  }

  const sheetEntries = Object.entries(memSheets)
  const totalNames   = sheetEntries.reduce((s, [, sh]) => s + (sh.names?.length ?? 0), 0)

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />

      {/* Drawer */}
      <aside className={styles.panel} ref={panelRef} aria-label="Memory Sheets">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}>📚</span>
            <div>
              <h2 className={styles.title}>Memory Sheets</h2>
              <p className={styles.subtitle}>
                {sheetEntries.length} sheet{sheetEntries.length !== 1 ? 's' : ''} · {totalNames} names
              </p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Persistence badge */}
        <div className={styles.persistBadge}>
          🔒 Never auto-cleared &nbsp;·&nbsp; Survives all sessions
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'sheets' ? styles.tabActive : ''}`}
            onClick={() => setTab('sheets')}
          >Sheets</button>
          <button
            className={`${styles.tab} ${tab === 'trash' ? styles.tabActive : ''}`}
            onClick={() => setTab('trash')}
          >
            Trash {trashCount > 0 && <span className={styles.trashBadge}>{trashCount}</span>}
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {tab === 'sheets' && (
            <>
              {sheetEntries.length === 0 && (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>📭</span>
                  <p>No memory sheets yet.</p>
                  <p className={styles.emptyHint}>Create a sheet to start remembering people across sessions.</p>
                </div>
              )}

              {sheetEntries.map(([id, sheet]) => (
                <SheetCard
                  key={id}
                  sheetId={id}
                  sheet={sheet}
                  onRename={onRenameSheet}
                  onDelete={handleDelete}
                  onClearAll={onClearSheet}
                  onAddName={onAddNames}
                  onRemoveName={onRemoveName}
                  onEditName={onEditName}
                  onRestoreVersion={handleRestoreVersion}
                  hasVersion={(sheet._v1?.length ?? 0) > 0}
                />
              ))}

              {/* New sheet form */}
              {creating ? (
                <form className={styles.newSheetForm} onSubmit={handleCreate}>
                  <input
                    ref={newRef}
                    className={styles.newSheetInput}
                    placeholder="Sheet name (e.g. Friends)…"
                    value={newSheetName}
                    onChange={e => setNewSheetName(e.target.value)}
                    onKeyDown={e => e.key === 'Escape' && setCreating(false)}
                  />
                  <div className={styles.newSheetBtns}>
                    <button type="button" className={styles.cancelBtn} onClick={() => setCreating(false)}>
                      Cancel
                    </button>
                    <button type="submit" className={styles.createBtn} disabled={!newSheetName.trim()}>
                      Create Sheet
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  id="memory-new-sheet-btn"
                  className={styles.newSheetBtn}
                  onClick={() => setCreating(true)}
                >
                  + New Sheet
                </button>
              )}
            </>
          )}

          {tab === 'trash' && (
            <TrashPanel
              trash={trash}
              onRestore={handleRestoreTrash}
              onPermanentDelete={onPermanentDelete}
            />
          )}
        </div>

        {/* Footer — Export */}
        <div className={styles.footer}>
          <span className={styles.footerLabel}>Export Memory:</span>
          <button
            id="memory-export-json"
            className={styles.exportBtn}
            onClick={onExportJSON}
            disabled={totalNames === 0}
            title="Download as JSON"
          >
            ⬇ JSON
          </button>
          <button
            id="memory-export-csv"
            className={styles.exportBtn}
            onClick={onExportCSV}
            disabled={totalNames === 0}
            title="Download as CSV"
          >
            ⬇ CSV
          </button>
          <span className={styles.footerHint}>Your data, always yours.</span>
        </div>

        {/* Toast */}
        {toast && <div className={styles.panelToast}>{toast}</div>}
      </aside>
    </>
  )
}
