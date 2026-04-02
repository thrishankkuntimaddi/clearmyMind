import styles from './NameGrid.module.css'
import NameCell from './NameCell.jsx'

const COLUMNS = 4

export default function NameGrid({ names, onRemove }) {
  if (names.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>🧠</span>
        <p className={styles.emptyText}>Nothing here yet.</p>
        <p className={styles.emptyHint}>Type a name above and press&nbsp;<kbd>Enter</kbd></p>
      </div>
    )
  }

  // Pad to fill last row so grid looks clean
  const remainder = names.length % COLUMNS
  const padCount = remainder === 0 ? 0 : COLUMNS - remainder
  const padded = [...names, ...Array(padCount).fill(null)]

  return (
    <div className={styles.grid} role="list" aria-label="Name list">
      {padded.map((name, idx) =>
        name !== null ? (
          <NameCell key={name} name={name} onRemove={onRemove} />
        ) : (
          <div key={`pad-${idx}`} className={styles.phantom} aria-hidden="true" />
        )
      )}
    </div>
  )
}
