import styles from './NameGrid.module.css'
import NameCell from './NameCell.jsx'

const COLS        = 5
const TOTAL_SLOTS = 100          // 5 × 20 = 100
const ROWS        = TOTAL_SLOTS / COLS   // 20

export default function NameGrid({ names, onRemove }) {
  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) =>
    i < names.length ? names[i] : null
  )

  return (
    <div className={styles.grid} role="list" aria-label="Name list">
      {slots.map((name, idx) =>
        name !== null ? (
          <NameCell key={name} name={name} onRemove={onRemove} />
        ) : (
          <div key={`e-${idx}`} className={styles.emptyCell} aria-hidden="true" />
        )
      )}
    </div>
  )
}
