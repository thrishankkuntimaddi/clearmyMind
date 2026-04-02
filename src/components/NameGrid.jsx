import styles from './NameGrid.module.css'
import NameCell from './NameCell.jsx'

const COLS = 5
const ROWS = 20
const PAGE = COLS * ROWS   // 100 names per grid block

export default function NameGrid({ names, tags, onRemove, onEdit, onTagSet }) {
  const numPages = Math.max(1, Math.ceil(names.length / PAGE))
  const overflow = names.length > PAGE

  return (
    <div className={`${styles.wrapper} ${overflow ? styles.scrollable : ''}`}>
      {Array.from({ length: numPages }, (_, pageIdx) => {
        const pageNames = names.slice(pageIdx * PAGE, (pageIdx + 1) * PAGE)
        const slots = Array.from({ length: PAGE }, (_, i) =>
          i < pageNames.length ? pageNames[i] : null
        )

        return (
          <div
            key={pageIdx}
            className={styles.grid}
            role="list"
            aria-label={numPages > 1 ? `Name list — page ${pageIdx + 1}` : 'Name list'}
          >
            {slots.map((name, cellIdx) =>
              name !== null ? (
                <NameCell
                  key={name}
                  name={name}
                  tag={tags[name] ?? null}
                  onRemove={onRemove}
                  onEdit={onEdit}
                  onTagSet={onTagSet}
                />
              ) : (
                <div
                  key={`e-${pageIdx}-${cellIdx}`}
                  className={styles.emptyCell}
                  aria-hidden="true"
                />
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
