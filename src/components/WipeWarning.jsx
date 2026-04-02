import styles from './WipeWarning.module.css'

const MESSAGES = {
  warning:  'Your mind is overloaded. Auto-clearing in',
  extended: 'Grace period active. Clearing in',
  critical: '🚨 Critical overload — no stopping this now. Clearing in',
}

const HINTS = {
  warning:  'No new names for 60 seconds = auto-clear. Or wait 5 more minutes.',
  extended: 'Reach 90 names during this time and you get only 30 seconds.',
  critical: 'You went too far. Let it go.',
}

export default function WipeWarning({ phase, countdown, onWait }) {
  const mins = Math.floor(countdown / 60)
  const secs = countdown % 60
  const display = countdown >= 60
    ? `${mins}:${secs.toString().padStart(2, '0')}`
    : `${countdown}`

  const urgent = countdown <= 10

  return (
    <div className={styles.overlay}>
      <div className={`${styles.panel} ${styles[phase]}`}>
        <span className={styles.bomb} aria-hidden="true">💣</span>

        <p className={styles.msg}>{MESSAGES[phase]}</p>

        <div className={`${styles.countdown} ${urgent ? styles.urgent : ''}`}>
          {display}
          {countdown < 60 && <span className={styles.sec}>s</span>}
        </div>

        <p className={styles.hint}>{HINTS[phase]}</p>

        {phase === 'warning' && (
          <button id="wait-btn" className={styles.waitBtn} onClick={onWait}>
            ⏸ &nbsp;Wait for 5 mins
          </button>
        )}
      </div>
    </div>
  )
}
