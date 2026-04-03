import { useState, useRef, useEffect } from 'react'
import { TAG_MAP } from '../hooks/useTags.js'
import TagPicker from './TagPicker.jsx'
import styles from './NameCell.module.css'

export default function NameCell({ index, name, tag, dimmed, picked, onEdit, onRemove, onTagSet }) {
  const [hovered,    setHovered]    = useState(false)
  const [editing,    setEditing]    = useState(false)
  const [draft,      setDraft]      = useState('')
  const [removing,   setRemoving]   = useState(false)
  const [showPicker, setShowPicker] = useState(false)

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
    setShowPicker(false)
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
        <span className={styles.index}>{index}</span>
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

  const tagColor = tag ? TAG_MAP[tag]?.hex : null

  // ── View mode ──────────────────────────────────────────────────────────────
  return (
    <div
      className={`${styles.cell} ${removing ? styles.removing : ''} ${dimmed ? styles.dimmed : ''} ${picked ? styles.picked : ''}`}
      style={tagColor ? { background: `${tagColor}22`, borderLeft: `3px solid ${tagColor}` } : {}}
      role="listitem"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowPicker(false) }}
      onClick={() => setShowPicker(p => !p)}
    >
      {/* Sequential number — no dot */}
      <span className={styles.index}>{index}</span>

      <span className={styles.name} title={name}>{name}</span>

      {hovered && !showPicker && (
        <div className={styles.btnGroup} onClick={e => e.stopPropagation()}>
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

      {/* Color picker — opens when cell is clicked */}
      {showPicker && (
        <div onClick={e => e.stopPropagation()}>
          <TagPicker
            currentTag={tag}
            onSelect={color => { onTagSet(name, color); setShowPicker(false) }}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}
    </div>
  )
}
