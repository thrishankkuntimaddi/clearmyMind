import { TAG_COLORS } from '../hooks/useTags.js'
import styles from './TagFilterBar.module.css'

export default function TagFilterBar({ tags, filterTag, onFilter }) {
  // Find which colors are actually used
  const usedKeys = new Set(Object.values(tags).filter(Boolean))
  if (usedKeys.size === 0) return null

  return (
    <div className={styles.bar} role="toolbar" aria-label="Filter by tag">
      <span className={styles.label}>Filter:</span>
      {TAG_COLORS.filter(t => usedKeys.has(t.key)).map(({ key, hex, label }) => (
        <button
          key={key}
          className={`${styles.dot} ${filterTag === key ? styles.active : ''}`}
          style={{ '--c': hex }}
          onClick={() => onFilter(filterTag === key ? null : key)}
          title={label}
          aria-label={`Filter by ${label}`}
          aria-pressed={filterTag === key}
        />
      ))}
      {filterTag && (
        <button
          className={styles.clear}
          onClick={() => onFilter(null)}
          aria-label="Clear filter"
          title="Clear filter"
        >
          Clear ✕
        </button>
      )}
    </div>
  )
}
