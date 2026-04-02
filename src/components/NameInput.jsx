import { useRef, useState } from 'react'
import styles from './NameInput.module.css'

export default function NameInput({ onAdd }) {
  const [value, setValue] = useState('')
  const [shake, setShake] = useState(false)
  const inputRef = useRef(null)

  function handleKeyDown(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const success = onAdd(value)

    if (success) {
      setValue('')
    } else {
      // Duplicate or empty — trigger shake
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
