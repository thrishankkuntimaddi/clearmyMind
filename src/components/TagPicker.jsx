import { useEffect, useRef } from 'react'
import { TAG_COLORS } from '../hooks/useTags.js'
import styles from './TagPicker.module.css'

export default function TagPicker({ currentTag, onSelect, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  return (
    <div ref={ref} className={styles.picker} role="dialog" aria-label="Choose tag color">
      <div className={styles.dots}>
        {TAG_COLORS.map(({ key, hex, label }) => (
          <button
            key={key}
            className={`${styles.dot} ${currentTag === key ? styles.active : ''}`}
            style={{ '--c': hex }}
            onClick={() => onSelect(currentTag === key ? null : key)}
            title={label}
            aria-label={label}
          />
        ))}
      </div>
      {/* Divider + Remove Color button — always visible for discoverability */}
      <span className={styles.sep} />
      <button
        className={`${styles.clear} ${!currentTag ? styles.clearDisabled : ''}`}
        onClick={() => { if (currentTag) onSelect(null) }}
        title={currentTag ? 'Remove color' : 'No color set'}
        aria-label="Remove color"
        disabled={!currentTag}
      >
        ✕ Remove Color
      </button>
    </div>
  )
}
