import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './MobileDragOverlay.module.css'

/**
 * MobileDragOverlay — Mobile long-press drag-and-drop
 *
 * Flow:
 * 1. Long-press a name → ghost chip appears at finger
 * 2. Drag toward Bag tab → "Release to add to Bag" hint
 *    Release → name added to bag
 * 3. Drag toward Groups tab → app auto-switches to Groups tab
 *    User then drags over a group row → row glows amber
 *    Release over group row → name added to that group
 * 4. Release anywhere else → cancel
 */
export default function MobileDragOverlay({
  draggingName,        // string | null
  initialPos,          // { x, y } — finger position at long-press fire
  groups,              // { [id]: { name, members } }
  onDropToBag,         // (name) => void
  onDropToGroup,       // (groupId, name) => void
  onCancel,            // () => void
  onSwitchToGroups,    // () => void — auto-switch mobile tab to Groups
  tabBarRef,           // ref to the bottom tab bar
}) {
  const [ghostPos,      setGhostPos]      = useState({ x: 0, y: 0 })
  const [hoverTarget,   setHoverTarget]   = useState(null) // 'bag' | 'groups' | null
  const [hoverGroupId,  setHoverGroupId]  = useState(null) // id of group being hovered
  const didSwitchGroups = useRef(false)   // switch tab only once per drag

  // Initialize ghost at finger position the moment drag starts
  useEffect(() => {
    if (draggingName && initialPos) {
      setGhostPos(initialPos)
    }
    if (!draggingName) {
      setHoverTarget(null)
      setHoverGroupId(null)
      didSwitchGroups.current = false
    }
  }, [draggingName, initialPos])

  useEffect(() => {
    if (!draggingName) return

    function getTabZone(x, y) {
      const bar = tabBarRef?.current
      if (!bar) return null
      const rect = bar.getBoundingClientRect()
      // Only activate when within 80px above the tab bar or inside it
      if (y < rect.top - 80) return null
      const third = rect.width / 3
      const relX  = x - rect.left
      if (relX < third)       return 'names'
      if (relX < third * 2)   return 'groups'
      return 'bag'
    }

    function getHoveredGroupId(x, y) {
      // Use elementFromPoint to find what's under the finger
      const el = document.elementFromPoint(x, y)
      if (!el) return null
      // Walk up DOM to find the group row with data-group-id
      const groupEl = el.closest('[data-group-id]')
      return groupEl ? groupEl.dataset.groupId : null
    }

    function onTouchMove(e) {
      e.preventDefault()
      const touch = e.touches[0]
      const { clientX: x, clientY: y } = touch
      setGhostPos({ x, y })

      const zone = getTabZone(x, y)
      setHoverTarget(zone)

      // Auto-switch to Groups tab once when we enter the groups zone
      if (zone === 'groups' && !didSwitchGroups.current) {
        didSwitchGroups.current = true
        onSwitchToGroups()
      }

      // Once on Groups tab, detect which group row the finger is over
      if (didSwitchGroups.current) {
        const gid = getHoveredGroupId(x, y)
        setHoverGroupId(gid)
      } else {
        setHoverGroupId(null)
      }
    }

    function onTouchEnd(e) {
      const touch = e.changedTouches[0]
      const { clientX: x, clientY: y } = touch
      const zone = getTabZone(x, y)

      // Drop into bag
      if (zone === 'bag') {
        onDropToBag(draggingName)
        return
      }

      // Drop into a group (via element detection — works even after tab switch)
      const hoveredGroupId = getHoveredGroupId(x, y)
      if (hoveredGroupId) {
        onDropToGroup(hoveredGroupId, draggingName)
        return
      }

      // Nowhere useful — cancel
      onCancel()
    }

    function onTouchCancel() {
      onCancel()
    }

    document.addEventListener('touchmove',   onTouchMove,   { passive: false })
    document.addEventListener('touchend',    onTouchEnd,    { passive: false })
    document.addEventListener('touchcancel', onTouchCancel, { passive: false })
    return () => {
      document.removeEventListener('touchmove',   onTouchMove)
      document.removeEventListener('touchend',    onTouchEnd)
      document.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [draggingName, onDropToBag, onDropToGroup, onCancel, onSwitchToGroups, tabBarRef])

  if (!draggingName) return null

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

      {/* ── Bag drop hint ── */}
      {hoverTarget === 'bag' && (
        <div className={styles.bagDropIndicator}>
          🎒 Release to add to Bag
        </div>
      )}

      {/* ── Groups hint: first time entering groups zone ── */}
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
