import { useState } from 'react'
import styles from './NameCell.module.css'

export default function NameCell({ name, onRemove }) {
  const [hovered, setHovered] = useState(false)
  const [removing, setRemoving] = useState(false)

  function handleRemove() {
    setRemoving(true)
    setTimeout(() => onRemove(name), 200)
  }

  return (
    <div
      className={`${styles.cell} ${removing ? styles.removing : ''}`}
      role="listitem"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className={styles.name} title={name}>{name}</span>
      {hovered && (
        <button
          className={styles.removeBtn}
          onClick={handleRemove}
          aria-label={`Remove ${name}`}
          title={`Remove ${name}`}
        >
          ×
        </button>
      )}
    </div>
  )
}
