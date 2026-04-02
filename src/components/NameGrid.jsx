import styles from './NameGrid.module.css'
import NameCell from './NameCell.jsx'

const TOTAL_SLOTS = 100
const ROWS = 25 // 25 rows × 4 columns = 100

export default function NameGrid({ names, onRemove }) {
  // Always render exactly 100 slots; names go first, rest are empty
  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) =>
    i < names.length ? names[i] : null
  )

  return (
    <div className={styles.grid} role="list" aria-label="Name list">
      {slots.map((name, idx) =>
        name !== null ? (
          <NameCell key={name} name={name} onRemove={onRemove} rowIndex={idx % ROWS} />
        ) : (
          <div
            key={`empty-${idx}`}
            className={styles.emptyCell}
            aria-hidden="true"
          />
        )
      )}
    </div>
  )
}
