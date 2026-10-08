import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './MobileDragOverlay.module.css'

/**
 * MobileDragOverlay — mobile long-press drag to move a name between sheets
 *
 * 1. Long-press a name → ghost chip appears at finger
 * 2. Drag onto another sheet tab in the bottom bar → tab highlights
 * 3. Release on it → name (and its colour) moves there; anywhere else → cancel
 */
export default function MobileDragOverlay({
  draggingName,          // string | null
  initialPos,            // { x, y } — finger position at long-press fire
  sheets,                // [{ id, name }]
  activeSheetId,         // string
  onMoveNameToSheet,     // (name, toSheetId) => void
  onCancel,              // () => void
}) {
  const [ghostPos,     setGhostPos]     = useState({ x: 0, y: 0 })
  const [hoverSheetId, setHoverSheetId] = useState(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draggingName && initialPos) setGhostPos(initialPos)
    if (!draggingName) setHoverSheetId(null)
  }, [draggingName, initialPos])

  useEffect(() => {
    if (!draggingName) return

    // elementFromPoint skips pointer-events:none elements, so the backdrop
    // won't block this. Walk up to the nearest sheet tab.
    function getHoveredSheetId(x, y) {
      const sid = document.elementFromPoint(x, y)?.closest('[data-sheet-id]')?.dataset.sheetId
      return sid && sid !== activeSheetId ? sid : null
    }

    function onTouchMove(e) {
      e.preventDefault()
      const { clientX: x, clientY: y } = e.touches[0]
      setGhostPos({ x, y })
      setHoverSheetId(getHoveredSheetId(x, y))
    }

    function onTouchEnd(e) {
      const { clientX: x, clientY: y } = e.changedTouches[0]
      const sid = getHoveredSheetId(x, y)
      if (sid) onMoveNameToSheet(draggingName, sid)
      else onCancel()
    }

    document.addEventListener('touchmove',   onTouchMove, { passive: false })
    document.addEventListener('touchend',    onTouchEnd,  { passive: false })
    document.addEventListener('touchcancel', onCancel,    { passive: false })
    return () => {
      document.removeEventListener('touchmove',   onTouchMove)
      document.removeEventListener('touchend',    onTouchEnd)
      document.removeEventListener('touchcancel', onCancel)
    }
  }, [draggingName, onMoveNameToSheet, onCancel, activeSheetId])

  if (!draggingName) return null

  const hoverSheetName = hoverSheetId ? sheets.find((s) => s.id === hoverSheetId)?.name ?? 'sheet' : null

  return createPortal(
    <>
      <div className={styles.backdrop} />
      <div
        className={styles.ghost}
        style={{ left: ghostPos.x - 60, top: ghostPos.y - 20 }}
        aria-hidden="true"
      >
        {draggingName}
      </div>
      <div className={styles.sheetDropIndicator}>
        {hoverSheetName
          ? <>➡️ Move to <strong>{hoverSheetName}</strong></>
          : sheets.length > 1 ? 'Drag onto a sheet tab below to move' : 'Add another sheet to move names'}
      </div>
    </>,
    document.body,
  )
}
