import { useState, useRef, useEffect } from 'react'
import styles from './NameCell.module.css'

const TAG_CONFIG = {
  live:       { label: 'Live',       cls: 'tagLive' },
  interested: { label: 'Interested', cls: 'tagInterested' },
}

export default function NameCell({ name, tag, onEdit, onRemove, onTagCycle }) {
  const [hovered,  setHovered]  = useState(false)
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState('')
  const [removing, setRemoving] = useState(false)

  const editRef   = useRef(null)
  const committed = useRef(false)

  useEffect(() => {
    if (editing) editRef.current?.focus()
  }, [editing])

  function startEdit() {
    committed.current = false
    setDraft(name)
    setEditing(true)
    setHovered(false)
  }

  function commitEdit() {
    if (committed.current) return
    committed.current = true
    const trimmed = draft.trim()
    if (trimmed) onEdit(name, trimmed)
    setEditing(false)
  }

  function cancelEdit() {
    committed.current = true
    setEditing(false)
    setDraft('')
  }

  function handleEditKey(e) {
    if (e.key === 'Enter')  { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
  }

  function handleRemove() {
    setRemoving(true)
    setTimeout(() => onRemove(name), 200)
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className={styles.cell} role="listitem">
        <input
          ref={editRef}
          className={styles.editInput}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleEditKey}
          onBlur={commitEdit}
          spellCheck={false}
          aria-label={`Edit ${name}`}
        />
      </div>
    )
  }

  const tagCfg = tag ? TAG_CONFIG[tag] : null

  // ── View mode ──────────────────────────────────────────────────────────────
  return (
    <div
      className={`${styles.cell} ${removing ? styles.removing : ''}`}
      role="listitem"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Tag dot — always visible, cycles on click */}
      <button
        className={`${styles.tagDot} ${tagCfg ? styles[tagCfg.cls] : ''}`}
        onClick={e => { e.stopPropagation(); onTagCycle(name) }}
        title={tagCfg ? tagCfg.label : 'Set tag'}
        aria-label={tagCfg ? `Tag: ${tagCfg.label}` : 'No tag'}
      />

      <span className={styles.name} title={name}>{name}</span>

      {hovered && (
        <div className={styles.btnGroup}>
          <button
            className={`${styles.iconBtn} ${styles.editBtn}`}
            onClick={startEdit}
            aria-label={`Edit ${name}`}
            title="Edit"
          >✎</button>
          <button
            className={`${styles.iconBtn} ${styles.removeBtn}`}
            onClick={handleRemove}
            aria-label={`Remove ${name}`}
            title="Remove"
          >×</button>
        </div>
      )}
    </div>
  )
}
