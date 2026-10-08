import { useState, useCallback } from 'react'
import styles from './Bag.module.css'

export default function Bag({ bag, onDrop, onRestore, onRemove, onClear }) {
  const [dragOver, setDragOver] = useState(false)

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    // Only clear if leaving the bag panel entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOver(false)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const name = e.dataTransfer.getData('text/plain')
    if (name) onDrop(name)
  }, [onDrop])

  return (
    <aside
      className={`${styles.bag} ${dragOver ? styles.dragOver : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-label="Bag"
    >
      {/* ── Header ── */}
      <div className={styles.header}>
        <span className={styles.icon}>🗑️</span>
        <span className={styles.title}>Bag</span>
        {bag.length > 0 && (
          <span className={styles.count}>{bag.length}</span>
        )}
      </div>

      {/* ── Drop hint overlay ── */}
      {dragOver && (
        <div className={styles.dropHint}>
          <span className={styles.dropIcon}>📦</span>
          <span>Drop here</span>
        </div>
      )}

      {/* ── Content ── */}
      {!dragOver && (
        <>
          {bag.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>🎒</span>
              <span>Drag names here<br />to bag them</span>
            </div>
          ) : (
            <ul className={styles.list}>
              {bag.map((name, i) => (
                <li key={name} className={styles.item}>
                  <span className={styles.itemNum}>{i + 1}</span>
                  <span className={styles.itemName} title={name}>{name}</span>
                  <div className={styles.itemActions}>
                    <button
                      className={styles.restoreBtn}
                      onClick={() => onRestore(name)}
                      title="Restore to grid"
                      aria-label={`Restore ${name}`}
                    >↩</button>
                    <button
                      className={styles.removeBtn}
                      onClick={() => onRemove(name)}
                      title="Delete permanently"
                      aria-label={`Delete ${name}`}
                    >×</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* ── Footer ── */}
          {bag.length > 0 && (
            <div className={styles.footer}>
              <button
                className={styles.clearBtn}
                onClick={onClear}
                aria-label="Clear bag"
              >
                Clear Bag
              </button>
            </div>
          )}
        </>
      )}
    </aside>
  )
}
