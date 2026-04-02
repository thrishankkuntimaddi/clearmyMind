import { useState, useRef, useEffect } from 'react'
import styles from './NameCell.module.css'

export default function NameCell({ name, onEdit, onRemove }) {
  const [hovered,  setHovered]  = useState(false)
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState('')
  const [removing, setRemoving] = useState(false)
  const editRef = useRef(null)

  // Focus inline input when edit mode opens
  useEffect(() => {
    if (editing) editRef.current?.focus()
  }, [editing])

  function startEdit() {
    setDraft(name)
    setEditing(true)
    setHovered(false)
  }

  function commitEdit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== name) onEdit(name, trimmed)
    setEditing(false)
  }

  function cancelEdit() {
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
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleEditKey}
          onBlur={commitEdit}
          spellCheck={false}
          aria-label={`Edit ${name}`}
        />
      </div>
    )
  }

  // ── View mode ──────────────────────────────────────────────────────────────
  return (
    <div
      className={`${styles.cell} ${removing ? styles.removing : ''}`}
      role="listitem"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className={styles.name} title={name}>{name}</span>

      {hovered && (
        <div className={styles.btnGroup}>
          <button
            className={`${styles.iconBtn} ${styles.editBtn}`}
            onClick={startEdit}
            aria-label={`Edit ${name}`}
            title="Edit"
          >
            ✎
          </button>
          <button
            className={`${styles.iconBtn} ${styles.removeBtn}`}
            onClick={handleRemove}
            aria-label={`Remove ${name}`}
            title="Remove"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
