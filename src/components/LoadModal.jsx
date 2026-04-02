import { useRef, useEffect, useState } from 'react'
import styles from './LoadModal.module.css'

export default function LoadModal({ onLoad, onClose }) {
  const [text, setText] = useState('')
  const areaRef = useRef(null)

  // Auto-focus the textarea when modal opens
  useEffect(() => {
    areaRef.current?.focus()
  }, [])

  function submit() {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length) onLoad(lines)
    onClose()
  }

  function handleKey(e) {
    if (e.key === 'Escape') { onClose(); return }
    // Enter (without Shift) = submit
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <p className={styles.label}>Paste names here (one per line)</p>
        <textarea
          ref={areaRef}
          className={styles.area}
          placeholder={'Thrishank Kuntimaddi\nElon Musk\n...'}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          rows={8}
          spellCheck={false}
        />
        <div className={styles.footer}>
          <span className={styles.hint}>Enter to load &nbsp;·&nbsp; Esc to cancel</span>
          <button
            className={styles.loadBtn}
            onClick={submit}
            disabled={!text.trim()}
          >
            Load →
          </button>
        </div>
      </div>
    </div>
  )
}
