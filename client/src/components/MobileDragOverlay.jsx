import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './MobileDragOverlay.module.css'

/**
 * MobileDragOverlay — Mobile long-press drag-and-drop
 *
 * Flow:
 * 1. Long-press a name → ghost chip appears at finger
 * 2. Drag toward Bag tab       → "Release to add to Bag" hint → adds to bag
 * 3. Drag toward Groups tab    → auto-switches, then drop on group row → adds to group
 * 4. Drag toward Sheet Bar     → highlights target sheet tab, release = MOVE name there
 * 5. Release anywhere else     → cancel
 */
export default function MobileDragOverlay({
  draggingName,          // string | null
  initialPos,            // { x, y } — finger position at long-press fire
  groups,                // { [id]: { name, members } }
  sheets,                // [{ id, name }]   ← NEW
  activeSheetId,         // string            ← NEW
  onDropToBag,           // (name) => void
  onDropToGroup,         // (groupId, name) => void
  onMoveNameToSheet,     // (name, toSheetId) => void  ← NEW
  onCancel,              // () => void
  onSwitchToGroups,      // () => void
  tabBarRef,             // ref to the bottom tab bar
  sheetBarRef,           // ref to the sheet bar strip  ← NEW
}) {
  const [ghostPos,       setGhostPos]      = useState({ x: 0, y: 0 })
  const [hoverTarget,    setHoverTarget]   = useState(null) // 'bag' | 'groups' | 'sheet' | null
  const [hoverGroupId,   setHoverGroupId]  = useState(null)
  const [hoverSheetId,   setHoverSheetId]  = useState(null) // id of sheet tab finger is over
  const didSwitchGroups  = useRef(false)

  // Reset state when a new drag starts or drag ends
  useEffect(() => {
    if (draggingName && initialPos) setGhostPos(initialPos)
    if (!draggingName) {
      setHoverTarget(null)
      setHoverGroupId(null)
      setHoverSheetId(null)
      didSwitchGroups.current = false
    }
  }, [draggingName, initialPos])

  useEffect(() => {
    if (!draggingName) return

    // ── Which bottom tab zone (Names / Groups / Bag) is the finger in? ──
    function getTabZone(x, y) {
      const bar = tabBarRef?.current
      if (!bar) return null
      const rect = bar.getBoundingClientRect()
      if (y < rect.top - 80) return null
      const third = rect.width / 3
      const relX  = x - rect.left
      if (relX < third)      return 'names'
      if (relX < third * 2)  return 'groups'
      return 'bag'
    }

    // ── Which sheet tab is the finger over in the sheet bar? ──
    // NOTE: We do NOT use sheetBarRef.getBoundingClientRect() because on mobile
    // the wrapper has height:0 (the inner SheetBar is position:fixed). Instead
    // we rely purely on elementFromPoint which works against the visual render.
    function getHoveredSheetId(x, y) {
      // elementFromPoint skips pointer-events:none elements, so the backdrop
      // won't block this. Walk up to find the nearest [data-sheet-id] ancestor.
      const el = document.elementFromPoint(x, y)
      if (!el) return null
      const sheetEl = el.closest('[data-sheet-id]')
      if (!sheetEl) return null
      const sid = sheetEl.dataset.sheetId
      // Only allow dropping onto a DIFFERENT sheet
      return sid && sid !== activeSheetId ? sid : null
    }

    function getHoveredGroupId(x, y) {
      const el = document.elementFromPoint(x, y)
      if (!el) return null
      const groupEl = el.closest('[data-group-id]')
      return groupEl ? groupEl.dataset.groupId : null
    }

    function onTouchMove(e) {
      e.preventDefault()
      const touch = e.touches[0]
      const { clientX: x, clientY: y } = touch
      setGhostPos({ x, y })

      // ── Sheet bar takes priority over bottom tab bar ──
      const sid = getHoveredSheetId(x, y)
      if (sid) {
        setHoverTarget('sheet')
        setHoverSheetId(sid)
        setHoverGroupId(null)
        return
      }
      setHoverSheetId(null)

      const zone = getTabZone(x, y)
      setHoverTarget(zone)

      if (zone === 'groups' && !didSwitchGroups.current) {
        didSwitchGroups.current = true
        onSwitchToGroups()
      }

      if (didSwitchGroups.current) {
        setHoverGroupId(getHoveredGroupId(x, y))
      } else {
        setHoverGroupId(null)
      }
    }

    function onTouchEnd(e) {
      const touch = e.changedTouches[0]
      const { clientX: x, clientY: y } = touch

      // ── Drop onto a sheet tab → MOVE ──
      const sid = getHoveredSheetId(x, y)
      if (sid) {
        onMoveNameToSheet?.(draggingName, sid)
        return
      }

      // ── Drop into bag ──
      const zone = getTabZone(x, y)
      if (zone === 'bag') {
        onDropToBag(draggingName)
        return
      }

      // ── Drop into a group ──
      const hoveredGroupId = getHoveredGroupId(x, y)
      if (hoveredGroupId) {
        onDropToGroup(hoveredGroupId, draggingName)
        return
      }

      onCancel()
    }

    function onTouchCancel() { onCancel() }

    document.addEventListener('touchmove',   onTouchMove,   { passive: false })
    document.addEventListener('touchend',    onTouchEnd,    { passive: false })
    document.addEventListener('touchcancel', onTouchCancel, { passive: false })
    return () => {
      document.removeEventListener('touchmove',   onTouchMove)
      document.removeEventListener('touchend',    onTouchEnd)
      document.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [draggingName, onDropToBag, onDropToGroup, onMoveNameToSheet, onCancel, onSwitchToGroups, tabBarRef, sheetBarRef, activeSheetId])

  if (!draggingName) return null

  const hoverSheetName = hoverSheetId
    ? (sheets ?? []).find(s => s.id === hoverSheetId)?.name ?? 'sheet'
    : null

  return createPortal(
    <>
      {/* ── Dim backdrop ── */}
      <div className={styles.backdrop} />

      {/* ── Ghost chip following finger ── */}
      <div
        className={styles.ghost}
        style={{ left: ghostPos.x - 60, top: ghostPos.y - 20 }}
        aria-hidden="true"
      >
        {draggingName}
      </div>

      {/* ── Sheet drop hint ── */}
      {hoverTarget === 'sheet' && hoverSheetName && (
        <div className={styles.sheetDropIndicator}>
          ➡️ Move to <strong>{hoverSheetName}</strong>
        </div>
      )}

      {/* ── Bag drop hint ── */}
      {hoverTarget === 'bag' && (
        <div className={styles.bagDropIndicator}>
          🎒 Release to add to Bag
        </div>
      )}

      {/* ── Groups hint ── */}
      {hoverTarget === 'groups' && !hoverGroupId && (
        <div className={styles.groupsHint}>
          📂 Drag onto a group to add
        </div>
      )}

      {/* ── Group-specific drop hint ── */}
      {hoverGroupId && (() => {
        const g = groups[hoverGroupId]
        return g ? (
          <div className={styles.groupTargetIndicator}>
            ✚ Add to <strong>{g.name}</strong>
          </div>
        ) : null
      })()}
    </>,
    document.body
  )
}
