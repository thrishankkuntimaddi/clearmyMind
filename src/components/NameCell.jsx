import { useState, useRef, useEffect } from 'react'
import styles from './NameCell.module.css'

export default function NameCell({ name, onEdit, onRemove }) {
  const [hovered,  setHovered]  = useState(false)
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState('')
  const [removing, setRemoving] = useState(false)

  const editRef    = useRef(null)
  // Guard against double-commit (blur fires when input unmounts after Enter)
  const committed  = useRef(false)

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
    // Prevent double-call: Enter key fires → input unmounts → blur fires
    if (committed.current) return
    committed.current = true

    const trimmed = draft.trim()
    if (trimmed) onEdit(name, trimmed)   // let editName handle dedup + title-case
    setEditing(false)
  }

  function cancelEdit() {
    committed.current = true   // also mark as done so blur doesn't re-commit
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
