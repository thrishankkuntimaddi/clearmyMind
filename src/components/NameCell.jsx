import { useState, useRef, useEffect } from 'react'
import { TAG_MAP } from '../hooks/useTags.js'
import TagPicker from './TagPicker.jsx'
import styles from './NameCell.module.css'

export default function NameCell({ index, name, tag, dimmed, picked, highlighted, searchMatch, isFirstMatch, onEdit, onRemove, onTagSet }) {
  const [hovered,    setHovered]    = useState(false)
  const [editing,    setEditing]    = useState(false)
  const [draft,      setDraft]      = useState('')
  const [removing,   setRemoving]   = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [dragging,   setDragging]   = useState(false)
  const [copied,     setCopied]     = useState(false)
  const [pickerPos,  setPickerPos]  = useState(null)  // { top, left } for mobile fixed overlay

  const editRef    = useRef(null)
  const committed  = useRef(false)
  const cellRef    = useRef(null)
  const clickTimer = useRef(null)

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

  // ── Copy name to clipboard ─────────────────────────────────────────────────
  async function copyName() {
    try {
      await navigator.clipboard.writeText(name)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch { /**/ }
  }

  // ── Click: single = copy, double = open picker ────────────────────────────
  function handleCellClick(e) {
    if (editing) return
    if (clickTimer.current) {
      // Second click — treat as double-click
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      openPicker(e)
    } else {
      // First click — wait to see if a second comes
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null
        copyName()
      }, 220)
    }
  }

  // ── Open picker, computing fixed position on mobile ───────────────────────
  function openPicker(e) {
    const isMobile = window.innerWidth <= 768
    if (isMobile && cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect()
      // Position below the cell, clamped to viewport
      const top  = Math.min(rect.bottom + 4, window.innerHeight - 60)
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 220))
      setPickerPos({ top, left })
    } else {
      setPickerPos(null)
    }
    setShowPicker(p => !p)
  }

  // ── Drag handlers ──────────────────────────────────────────────────────────
  function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', name)
    e.dataTransfer.effectAllowed = 'all'   // allow both move (Bag) and copy (Groups)
    setDragging(true)
    setShowPicker(false)
  }

  function handleDragEnd() {
    setDragging(false)
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
      ref={cellRef}
      className={`${styles.cell} ${removing ? styles.removing : ''} ${dimmed ? styles.dimmed : ''} ${picked ? styles.picked : ''} ${highlighted ? styles.highlighted : ''} ${searchMatch ? styles.searchMatch : ''} ${dragging ? styles.dragging : ''} ${copied ? styles.copiedFlash : ''}`}
      data-search-first={isFirstMatch && searchMatch ? 'true' : undefined}
      style={tagColor ? { background: `${tagColor}22`, borderLeft: `3px solid ${tagColor}` } : {}}
      role="listitem"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false) }}
      onClick={handleCellClick}
    >
      {/* Sequential number */}
      <span className={styles.index}>{index}</span>

      <span className={styles.name} title={name}>{name}</span>

      {/* Copied flash indicator */}
      {copied && <span className={styles.copiedBadge} aria-hidden="true">✓</span>}

      {/* Drag handle — shows on hover (desktop) */}
      {hovered && !showPicker && !copied && (
        <span className={styles.dragHandle} title="Drag to bag" aria-hidden="true">⠿</span>
      )}

      {hovered && !showPicker && !copied && (
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

      {/* Color picker — inline on desktop, fixed overlay on mobile */}
      {showPicker && !pickerPos && (
        <div onClick={e => e.stopPropagation()}>
          <TagPicker
            currentTag={tag}
            onSelect={color => { onTagSet(name, color); setShowPicker(false) }}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}

      {/* Mobile: fixed-position overlay picker rendered via portal */}
      {showPicker && pickerPos && (
        <MobilePickerPortal pos={pickerPos}>
          <TagPicker
            currentTag={tag}
            onSelect={color => { onTagSet(name, color); setShowPicker(false); setPickerPos(null) }}
            onClose={() => { setShowPicker(false); setPickerPos(null) }}
            fixed
          />
        </MobilePickerPortal>
      )}
    </div>
  )
}

// ── Tiny portal wrapper to render outside the cell DOM ────────────────────────
import { createPortal } from 'react-dom'
function MobilePickerPortal({ pos, children }) {
  return createPortal(
    <div style={{
      position: 'fixed',
      top:  pos.top,
      left: pos.left,
      zIndex: 9999,
    }}>
      {children}
    </div>,
    document.body
  )
}
