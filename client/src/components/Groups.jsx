import { useState, useCallback } from 'react'
import styles from './Groups.module.css'

export default function Groups({
  groups,
  activeGroupId,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onAddToGroup,
  onRemoveFromGroup,
  draggingName,
}) {
  const [creating,     setCreating]     = useState(false)
  const [newName,      setNewName]      = useState('')
  const [editingId,    setEditingId]    = useState(null)
  const [editDraft,    setEditDraft]    = useState('')
  const [dragOverId,   setDragOverId]   = useState(null)
  const [expandedId,   setExpandedId]   = useState(null)
  const [confirmDelId, setConfirmDelId] = useState(null)  // 2-step delete

  // ── Create ──────────────────────────────────────────────────────────────────
  function handleCreate() {
    const name = newName.trim()
    if (name) { onCreateGroup(name); setExpandedId(null) }
    setNewName('')
    setCreating(false)
  }

  // ── Rename ──────────────────────────────────────────────────────────────────
  function startEdit(id, current) { setEditingId(id); setEditDraft(current) }
  function commitEdit() {
    if (editDraft.trim()) onRenameGroup(editingId, editDraft.trim())
    setEditingId(null); setEditDraft('')
  }

  // ── Delete (2-step) ─────────────────────────────────────────────────────────
  function requestDelete(e, id) {
    e.stopPropagation()
    setConfirmDelId(id)
    // Auto-cancel confirm after 3s
    setTimeout(() => setConfirmDelId(c => c === id ? null : c), 3000)
  }
  function confirmDelete(e, id) {
    e.stopPropagation()
    onDeleteGroup(id)
    setConfirmDelId(null)
    if (expandedId === id) setExpandedId(null)
  }
  function cancelDelete(e) { e.stopPropagation(); setConfirmDelId(null) }

  // ── Drag-drop ───────────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e, id) => {
    e.preventDefault(); e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(id)
  }, [])
  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverId(null)
  }, [])
  const handleDrop = useCallback((e, groupId) => {
    e.preventDefault(); setDragOverId(null)
    const name = e.dataTransfer.getData('text/plain')
    if (name) onAddToGroup(groupId, name)
  }, [onAddToGroup])

  // ── Toggle expand ────────────────────────────────────────────────────────────
  function toggleExpand(e, id) {
    e.stopPropagation()
    setExpandedId(prev => prev === id ? null : id)
  }

  const entries = Object.entries(groups)

  return (
    <div className={styles.groups}>
      {/* ── Section header ── */}
      <div className={styles.header}>
        <span className={styles.icon}>📂</span>
        <span className={styles.title}>Groups</span>
        {entries.length > 0 && (
          <span className={styles.totalCount}>{entries.length}</span>
        )}
        <button
          className={styles.addBtn}
          onClick={() => setCreating(true)}
          title="New group"
          aria-label="Create new group"
        >+</button>
      </div>

      {/* ── New group input ── */}
      {creating && (
        <div className={styles.newGroupRow}>
          <input
            autoFocus
            className={styles.newGroupInput}
            placeholder="Group name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); handleCreate() }
              if (e.key === 'Escape') { setCreating(false); setNewName('') }
            }}
            onBlur={() => { if (!newName.trim()) { setCreating(false); setNewName('') } }}
          />
          <button
            className={styles.newGroupConfirm}
            onMouseDown={e => { e.preventDefault(); handleCreate() }}
            disabled={!newName.trim()}
            title="Create group"
            aria-label="Confirm create group"
          >✓</button>
        </div>
      )}

      {/* ── Group list ── */}
      <div className={styles.list}>
        {entries.length === 0 && !creating && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>🗂️</span>
            <span>Press + to create<br />a group</span>
          </div>
        )}

        {entries.map(([id, group]) => {
          const isActive    = activeGroupId === id
          const isDragOver  = dragOverId === id
          const isExpanded  = expandedId === id
          const isConfirm   = confirmDelId === id

          return (
            <div
              key={id}
              data-group-id={id}
              className={`${styles.group} ${isActive ? styles.activeGroup : ''} ${isDragOver ? styles.dragOver : ''} ${draggingName ? styles.mobileDrop : ''}`}
              onDragOver={e => handleDragOver(e, id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, id)}
            >
              {/* Group header row */}
              <div
                className={styles.groupRow}
                onClick={() => onSelectGroup(isActive ? null : id)}
              >
                {/* Expand toggle */}
                <button
                  className={styles.expandBtn}
                  onClick={e => toggleExpand(e, id)}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  title={isExpanded ? 'Collapse' : 'Show members'}
                >{isExpanded ? '▾' : '▸'}</button>

                {/* Name / rename input */}
                {editingId === id ? (
                  <input
                    autoFocus
                    className={styles.renameInput}
                    value={editDraft}
                    onChange={e => setEditDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === 'Escape') commitEdit()
                    }}
                    onBlur={commitEdit}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className={styles.groupName}
                    onDoubleClick={e => { e.stopPropagation(); startEdit(id, group.name) }}
                    title="Click to highlight · Double-click to rename"
                  >{group.name}</span>
                )}

                <span className={styles.count}>{group.members.length}</span>

                {/* ── Delete only — no rename button, double-click handles rename ── */}
                <div className={styles.groupActions} onClick={e => e.stopPropagation()}>
                  {!isConfirm ? (
                    <button
                      className={styles.deleteBtn}
                      onClick={e => requestDelete(e, id)}
                      title="Delete group"
                      aria-label={`Delete ${group.name}`}
                    >×</button>
                  ) : (
                    <>
                      <button
                        className={styles.confirmYes}
                        onClick={e => confirmDelete(e, id)}
                        title="Yes, delete"
                      >Yes</button>
                      <button
                        className={styles.confirmNo}
                        onClick={cancelDelete}
                        title="Cancel"
                      >No</button>
                    </>
                  )}
                </div>
              </div>

              {/* Members list */}
              {isExpanded && group.members.length > 0 && (
                <ul className={styles.members}>
                  {group.members.map(name => (
                    <li key={name} className={styles.member}>
                      <span className={styles.memberDot} />
                      <span className={styles.memberName} title={name}>{name}</span>
                      <button
                        className={styles.removeMember}
                        onClick={e => { e.stopPropagation(); onRemoveFromGroup(id, name) }}
                        title="Remove from group"
                        aria-label={`Remove ${name}`}
                      >×</button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Drop hint when expanded and empty */}
              {isExpanded && group.members.length === 0 && (
                <p className={styles.emptyMembers}>Drag names here to add them</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
