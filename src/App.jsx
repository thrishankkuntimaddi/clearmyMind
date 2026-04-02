import { useNames } from './hooks/useNames.js'
import NameInput from './components/NameInput.jsx'
import NameGrid from './components/NameGrid.jsx'
import styles from './App.module.css'

export default function App() {
  const { names, addName, removeName, clearAll } = useNames()

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>🧠</span>
          <div>
            <h1 className={styles.title}>ClearMyMind</h1>
            <p className={styles.subtitle}>Mental offload tool</p>
          </div>
        </div>

        <div className={styles.meta}>
          {names.length > 0 && (
            <span className={styles.count} aria-live="polite">
              {names.length} {names.length === 1 ? 'name' : 'names'}
            </span>
          )}
          <button
            id="clear-all-btn"
            className={styles.clearBtn}
            onClick={clearAll}
            disabled={names.length === 0}
            aria-label="Clear all names"
          >
            Clear All
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.inputSection} aria-label="Add a name">
          <NameInput onAdd={addName} />
        </section>

        <section className={styles.gridSection} aria-label="Name list">
          <NameGrid names={names} onRemove={removeName} />
        </section>
      </main>

      <footer className={styles.footer}>
        <span>Sorted A → Z &middot; Persisted locally &middot; Hover a name to remove it</span>
      </footer>
    </div>
  )
}
