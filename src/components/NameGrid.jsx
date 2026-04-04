import { useState, useEffect } from 'react'
import styles from './NameGrid.module.css'
import NameCell from './NameCell.jsx'

const DESKTOP_COLS = 5
const DESKTOP_ROWS = 20
const DESKTOP_PAGE = DESKTOP_COLS * DESKTOP_ROWS  // 100 per page

const MOBILE_COLS = 2

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth <= 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = (e) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}

export default function NameGrid({ names, tags, randomPicks = new Set(), highlightedNames = new Set(), searchHighlighted = new Set(), firstMatchName = null, onRemove, onEdit, onTagSet, onMobileLongPress }) {
  const isMobile = useIsMobile()

  if (isMobile) {
    // Mobile: 2 columns, rows = ceil(names.length / 2), scrollable
    const totalCells = Math.max(names.length, 2)  // at least 1 row
    // Pad to next even number so grid is symmetric
    const padded = totalCells % 2 === 0 ? totalCells : totalCells + 1
    const slots = Array.from({ length: padded }, (_, i) =>
      i < names.length ? names[i] : null
    )

    return (
      <div className={`${styles.wrapper} ${styles.mobileWrapper}`}>
        <div
          className={`${styles.mobileGrid}`}
          role="list"
          aria-label="Name list"
          style={{ gridTemplateRows: `repeat(${Math.ceil(padded / MOBILE_COLS)}, var(--mobile-row-h, 38px))` }}
        >
          {slots.map((name, i) =>
            name !== null ? (
              <NameCell
                key={name}
                index={i + 1}
                name={name}
                tag={tags[name] ?? null}
                picked={randomPicks.has(i + 1)}
                highlighted={highlightedNames.has(name)}
                searchMatch={searchHighlighted.has(name)}
                isFirstMatch={firstMatchName === name}
                onRemove={onRemove}
                onEdit={onEdit}
                onTagSet={onTagSet}
                onMobileLongPress={onMobileLongPress}
              />
            ) : (
              <div key={`me-${i}`} className={styles.emptyCell} aria-hidden="true" />
            )
          )}
        </div>
      </div>
    )
  }

  // Desktop: 5 cols × 20 rows, paged
  const numPages = Math.max(1, Math.ceil(names.length / DESKTOP_PAGE))
  const overflow = names.length > DESKTOP_PAGE

  return (
    <div className={`${styles.wrapper} ${overflow ? styles.scrollable : ''}`}>
      {Array.from({ length: numPages }, (_, pageIdx) => {
        const pageNames = names.slice(pageIdx * DESKTOP_PAGE, (pageIdx + 1) * DESKTOP_PAGE)
        const slots = Array.from({ length: DESKTOP_PAGE }, (_, i) =>
          i < pageNames.length ? pageNames[i] : null
        )

        return (
          <div
            key={pageIdx}
            className={styles.grid}
            role="list"
            aria-label={numPages > 1 ? `Name list — page ${pageIdx + 1}` : 'Name list'}
          >
            {slots.map((name, cellIdx) => {
              const globalIdx = pageIdx * DESKTOP_PAGE + cellIdx + 1
              return name !== null ? (
                <NameCell
                  key={name}
                  index={globalIdx}
                  name={name}
                  tag={tags[name] ?? null}
                  picked={randomPicks.has(globalIdx)}
                  highlighted={highlightedNames.has(name)}
                  searchMatch={searchHighlighted.has(name)}
                  isFirstMatch={firstMatchName === name}
                  onRemove={onRemove}
                  onEdit={onEdit}
                  onTagSet={onTagSet}
                  onMobileLongPress={onMobileLongPress}
                />
              ) : (
                <div
                  key={`e-${pageIdx}-${cellIdx}`}
                  className={styles.emptyCell}
                  aria-hidden="true"
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
