import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { TAG_MAP } from '../hooks/useTags.js'
import TagPicker from './TagPicker.jsx'
import styles from './NameCell.module.css'

export default function NameCell({
  index, name, tag, dimmed, picked, highlighted, searchMatch, isFirstMatch,
  inMemory, memoryIcon,
  onEdit, onRemove, onTagSet,
  onMobileLongPress,
}) {
  const [hovered,    setHovered]    = useState(false)
  const [editing,    setEditing]    = useState(false)
  const [draft,      setDraft]      = useState('')
  const [removing,   setRemoving]   = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [dragging,   setDragging]   = useState(false)
  const [copied,     setCopied]     = useState(false)
  const [pickerPos,  setPickerPos]  = useState(null)
  const [isMobile,   setIsMobile]   = useState(() => window.innerWidth <= 768)

  const editRef        = useRef(null)
  const committed      = useRef(false)
  const cellRef        = useRef(null)
  const clickTimer     = useRef(null)   // desktop double-click detection
  const longPressTimer = useRef(null)
  const touchStart     = useRef({ x: 0, y: 0 })
  const longPressFired = useRef(false)

  // Track mobile breakpoint
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = e => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Non-passive touchmove: block scroll during long-press drag + cancel if finger moved
  useEffect(() => {
    const el = cellRef.current
    if (!el) return

    function onNativeMove(e) {
      if (longPressFired.current) {
        e.preventDefault()   // block page scroll while dragging
        return
      }
      if (longPressTimer.current) {
        const t  = e.touches[0]
        const dx = Math.abs(t.clientX - touchStart.current.x)
        const dy = Math.abs(t.clientY - touchStart.current.y)
        if (dx > 10 || dy > 10) {
          clearTimeout(longPressTimer.current)
          longPressTimer.current = null
        }
      }
    }

    // Prevent click from firing after a completed long-press drag
    function onNativeEnd(e) {
      if (longPressFired.current) {
        e.preventDefault()   // this blocks the browser's synthetic 'click' event
      }
    }

    el.addEventListener('touchmove', onNativeMove, { passive: false })
    el.addEventListener('touchend',  onNativeEnd,  { passive: false })
    return () => {
      el.removeEventListener('touchmove', onNativeMove)
      el.removeEventListener('touchend',  onNativeEnd)
    }
  }, [])

  useEffect(() => { if (editing) editRef.current?.focus() }, [editing])

  // ── Edit helpers ──────────────────────────────────────────────────────────────
  function startEdit() {
    committed.current = false
    setDraft(name); setEditing(true); setHovered(false); setShowPicker(false)
  }
  function commitEdit() {
    if (committed.current) return
    committed.current = true
    const t = draft.trim()
    if (t) onEdit(name, t)
    setEditing(false)
  }
  function cancelEdit() { committed.current = true; setEditing(false); setDraft('') }
  function handleEditKey(e) {
    if (e.key === 'Enter')  { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
  }
  function handleRemove() { setRemoving(true); setTimeout(() => onRemove(name), 200) }

  // ── Copy to clipboard ─────────────────────────────────────────────────────────
  async function copyName() {
    try {
      await navigator.clipboard.writeText(name)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Fallback for HTTP / older browsers
      try {
        const ta = document.createElement('textarea')
        ta.value = name
        Object.assign(ta.style, { position: 'fixed', opacity: '0', top: '0', left: '0' })
        document.body.appendChild(ta)
        ta.focus(); ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      } catch { /**/ }
    }
  }

  // ── Open tag picker at the exact click/tap position ───────────────
  // Using clientX/Y from the event is immune to parent transforms & scroll issues.
  function openPickerAt(clientX, clientY) {
    if (!onTagSet) return  // no tag support in this mode (e.g. memory mode)
    const popH = 52
    const popW = 220
    let top  = clientY - popH - 10
    if (top < 8) top = clientY + 14
    const left = Math.max(8, Math.min(clientX - popW / 2, window.innerWidth - popW - 8))
    setPickerPos({ top, left })
    setShowPicker(true)
  }
  function closePicker() { setShowPicker(false); setPickerPos(null) }

  // ── onClick: handles BOTH desktop and mobile tap (browser synthesizes click) ──
  // This is the SAME approach as the original working code.
  // Single click/tap  → copy after 250ms (waiting for possible 2nd click)
  // Double click/tap → cancel timer & open picker immediately
  function handleCellClick(e) {
    if (editing) return
    if (showPicker) { closePicker(); return }
    // If long-press just fired, ignore the click (native touchend blocked it, but just in case)
    if (longPressFired.current) { longPressFired.current = false; return }

    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      openPickerAt(e.clientX, e.clientY)
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null
        copyName()
      }, 250)
    }
  }

  // ── Mobile long-press: ONLY triggers drag overlay (does NOT copy) ─────────────
  function handleTouchStart(e) {
    if (editing) return
    longPressFired.current = false
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }

    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      onMobileLongPress?.(name, t.clientX, t.clientY)
    }, 500)
  }

  function handleTouchEnd() {
    clearTimeout(longPressTimer.current)
    longPressTimer.current = null
    // If long-press fired: native listener called e.preventDefault() which
    // blocks the browser's synthetic click event → no accidental copy/picker
    if (longPressFired.current) {
      longPressFired.current = false
    }
    // Otherwise: browser will fire 'click' → handleCellClick handles copy/picker
  }

  // ── Desktop HTML5 drag (disabled on mobile — uses long-press instead) ─────────
  function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', name)
    e.dataTransfer.effectAllowed = 'all'
    setDragging(true); setShowPicker(false)
  }
  function handleDragEnd() { setDragging(false) }

  // ── Edit mode ──────────────────────────────────────────────────────────────────
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

  // Memory highlight: indigo left border (separate visual axis from tag background)
  const memoryStyle = inMemory && !tagColor
    ? { borderLeft: '3px solid rgba(139, 92, 246, 0.6)' }
    : inMemory
    ? { borderLeft: '3px solid rgba(139, 92, 246, 0.6)', background: `${tagColor}22` }
    : tagColor
    ? { background: `${tagColor}22`, borderLeft: `3px solid ${tagColor}` }
    : {}

  // ── View mode ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div
        ref={cellRef}
        className={[
          styles.cell,
          removing    && styles.removing,
          dimmed      && styles.dimmed,
          picked      && styles.picked,
          highlighted && styles.highlighted,
          searchMatch && styles.searchMatch,
          inMemory    && styles.inMemory,
          dragging    && styles.dragging,
          copied      && styles.copiedFlash,
        ].filter(Boolean).join(' ')}
        data-search-first={isFirstMatch && searchMatch ? 'true' : undefined}
        style={memoryStyle}
        role="listitem"
        // draggable ONLY on desktop — on mobile it blocks touch→click synthesis
        draggable={!isMobile}
        onDragStart={!isMobile ? handleDragStart : undefined}
        onDragEnd={!isMobile   ? handleDragEnd   : undefined}
        onMouseEnter={() => !isMobile && setHovered(true)}
        onMouseLeave={() => !isMobile && setHovered(false)}
        onClick={handleCellClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <span className={styles.index}>{index}</span>
        <span className={styles.name} title={name}>{name}</span>
        {inMemory && <span className={styles.memoryDot} title={`Saved in memory (${memoryIcon ?? '📚'})`} aria-label="In Memory">{memoryIcon ?? '📚'}</span>}

        {copied && <span className={styles.copiedBadge} aria-hidden="true">✓</span>}

        {/* Desktop: hover buttons */}
        {hovered && !showPicker && !copied && (
          <span className={styles.dragHandle} title="Drag to bag or group" aria-hidden="true">⠿</span>
        )}
        {hovered && !showPicker && !copied && (
          <div className={styles.btnGroup} onClick={e => e.stopPropagation()}>
            <button className={`${styles.iconBtn} ${styles.editBtn}`}   onClick={startEdit}    aria-label={`Edit ${name}`}   title="Edit">✎</button>
            <button className={`${styles.iconBtn} ${styles.removeBtn}`} onClick={handleRemove} aria-label={`Remove ${name}`} title="Remove">×</button>
          </div>
        )}

        {/* Mobile: always-visible edit/remove buttons */}
        {isMobile && !copied && (
          <div className={styles.btnGroup} onClick={e => e.stopPropagation()}>
            <button className={`${styles.iconBtn} ${styles.editBtn}`}   onClick={startEdit}    aria-label={`Edit ${name}`}   title="Edit">✎</button>
            <button className={`${styles.iconBtn} ${styles.removeBtn}`} onClick={handleRemove} aria-label={`Remove ${name}`} title="Remove">×</button>
          </div>
        )}
      </div>

      {/* Tag picker — always portal, never inline/overlapping */}
      {showPicker && pickerPos && createPortal(
        <div
          style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left, zIndex: 9999 }}
          onClick={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          <TagPicker
            currentTag={tag}
            onSelect={color => { onTagSet(name, color); closePicker() }}
            onClose={closePicker}
          />
        </div>,
        document.body
      )}
    </>
  )
}
