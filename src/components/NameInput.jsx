import { useRef, useState, useEffect } from 'react'
import styles from './NameInput.module.css'

export default function NameInput({ onAdd }) {
  const [value, setValue] = useState('')
  const [shake, setShake] = useState(false)
  const inputRef = useRef(null)

  // ─── Global key capture ───────────────────────────────────────────────────
  // Any printable keystroke on the page auto-focuses the input so typing
  // works immediately without needing to click the field first.
  useEffect(() => {
    function handleGlobalKeyDown(e) {
      // Already focused — nothing to do
      if (document.activeElement === inputRef.current) return
      // Ignore modifier combos (Ctrl+C, Cmd+R, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // Only react to single printable characters (length === 1)
      if (e.key.length !== 1) return

      inputRef.current?.focus()
      // Don't preventDefault — let the character land naturally in the input
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  function handleKeyDown(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const success = onAdd(value)

    if (success) {
      setValue('')
    } else {
      setShake(true)
      setTimeout(() => setShake(false), 400)
    }
  }

  return (
    <div className={`${styles.wrapper} ${shake ? styles.shake : ''}`}>
      <span className={styles.icon} aria-hidden="true">+</span>
      <input
        ref={inputRef}
        id="name-input"
        type="text"
        className={styles.input}
        placeholder="Type a name and press Enter..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        autoFocus
        spellCheck={false}
        aria-label="Add name"
      />
    </div>
  )
}
