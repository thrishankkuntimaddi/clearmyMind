import { useEffect, useState } from 'react'
import styles from './CongratsScreen.module.css'

const LINES = [
  "🎉 Congrats!",
  "You forgot everything about those names.",
  "They no longer have power over you.",
  "Your mind is clear. 🧠✨",
]

export default function CongratsScreen({ onClose }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Fade in
    const t1 = setTimeout(() => setVisible(true), 50)
    // Auto-close after 5 seconds
    const t2 = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 500)   // wait for fade-out then close
    }, 5000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onClose])

  return (
    <div className={`${styles.overlay} ${visible ? styles.visible : ''}`}>
      {/* Floating emoji confetti */}
      {['🎊','🌟','✨','💫','🎉','🌈','🎊','✨'].map((e, i) => (
        <span key={i} className={styles.confetti} style={{ '--i': i }}>{e}</span>
      ))}

      <div className={styles.card}>
        {LINES.map((line, i) => (
          <p
            key={i}
            className={styles.line}
            style={{ '--delay': `${i * 0.18}s` }}
          >
            {line}
          </p>
        ))}

        <button className={styles.closeBtn} onClick={() => { setVisible(false); setTimeout(onClose, 400) }}>
          Start fresh →
        </button>
      </div>
    </div>
  )
}
