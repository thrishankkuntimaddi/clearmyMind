import { useRef, useEffect, useState, useMemo } from 'react'
import { isSnapshot, parseSnapshot } from '../utils/snapshot.js'
import styles from './LoadModal.module.css'

export default function LoadModal({ onLoad, onClose }) {
  const [text, setText] = useState('')
  const areaRef = useRef(null)

  useEffect(() => { areaRef.current?.focus() }, [])

  // Detect format on every keystroke
  const snap = useMemo(() => {
    if (!isSnapshot(text)) return null
    return parseSnapshot(text)
  }, [text])

  const isSnap = !!snap

  function submit() {
    if (!text.trim()) return
    onLoad(text)
    onClose()
  }

  function handleKey(e) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'Enter' && !e.shiftKey && !isSnap) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <p className={styles.label}>
          {isSnap ? '📸 ClearMyMind Snapshot detected' : 'Paste names here (one per line)'}
        </p>

        {/* Snapshot preview card */}
        {isSnap && (
          <div className={styles.snapPreview}>
            <div className={styles.snapRow}>
              <span className={styles.snapItem}>
                🗂 {snap.sheets?.length ?? 1} <em>sheet{(snap.sheets?.length ?? 1) !== 1 ? 's' : ''}</em>
              </span>
              <span className={styles.snapItem}>
                📋 {snap.sheets?.reduce((s, sh) => s + (snap.namesBySheet?.[sh.id]?.length ?? 0), 0) ?? snap.names?.length ?? 0} <em>names</em>
              </span>
              <span className={styles.snapItem}>📂 {Object.keys(snap.groups ?? {}).length} <em>groups</em></span>
              <span className={styles.snapItem}>🎒 {(snap.bag ?? []).length} <em>in bag</em></span>
              <span className={styles.snapItem}>
                🎨 {snap.sheets?.reduce((s, sh) => s + Object.keys(snap.tagsBySheet?.[sh.id] ?? {}).length, 0) ?? Object.keys(snap.tags ?? {}).length} <em>colors</em>
              </span>
            </div>
            {/* Per-sheet breakdown */}
            {snap.sheets && snap.sheets.length > 1 && (
              <div className={styles.snapGroups}>
                {snap.sheets.map((sh) => (
                  <span key={sh.id} className={styles.snapGroupTag}>
                    {sh.name}: {snap.namesBySheet?.[sh.id]?.length ?? 0}
                  </span>
                ))}
              </div>
            )}
            {Object.values(snap.groups ?? {}).length > 0 && (
              <div className={styles.snapGroups}>
                {Object.values(snap.groups).map((g, i) => (
                  <span key={i} className={styles.snapGroupTag}>
                    {g.name} ({g.members.length})
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <textarea
          ref={areaRef}
          className={styles.area}
          placeholder={'Thrishank Kuntimaddi\nElon Musk\n...or paste a full snapshot'}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          rows={isSnap ? 5 : 8}
          spellCheck={false}
        />

        <div className={styles.footer}>
          <span className={styles.hint}>
            {isSnap ? 'Click below to restore full snapshot' : 'Enter to load\u00a0·\u00a0Esc to cancel'}
          </span>
          <button
            className={`${styles.loadBtn} ${isSnap ? styles.snapBtn : ''}`}
            onClick={submit}
            disabled={!text.trim()}
          >
            {isSnap ? '✓ Restore Snapshot' : 'Load →'}
          </button>
        </div>

      </div>
    </div>
  )
}
