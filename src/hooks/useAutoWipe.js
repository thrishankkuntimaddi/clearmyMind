import { useState, useEffect, useRef, useCallback } from 'react'

const WARN_THRESHOLD     = 75   // names to trigger warning
const CRITICAL_THRESHOLD = 90   // names to escalate during extended
const TIME_WARN          = 60   // 60 seconds
const TIME_EXTENDED      = 300  // 5 minutes
const TIME_CRITICAL      = 30   // 30 seconds

export function useAutoWipe(nameCount) {
  // phase: 'idle' | 'warning' | 'extended' | 'critical' | 'blasting' | 'congrats'
  const [phase, setPhase]         = useState('idle')
  const [countdown, setCountdown] = useState(0)
  const intervalRef = useRef(null)
  const phaseRef    = useRef('idle')   // sync ref readable inside intervals

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const startTimer = useCallback((seconds, newPhase) => {
    stopTimer()
    setPhase(newPhase)
    phaseRef.current = newPhase
    setCountdown(seconds)

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
          setPhase('blasting')
          phaseRef.current = 'blasting'
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [stopTimer])

  // ── React to name-count changes ──────────────────────────────────────────
  useEffect(() => {
    const p = phaseRef.current

    if (nameCount >= WARN_THRESHOLD && p === 'idle') {
      // Cross 75 for the first time → start 60s warning
      startTimer(TIME_WARN, 'warning')
    } else if (nameCount >= CRITICAL_THRESHOLD && p === 'extended') {
      // Cross 90 while in extended grace period → escalate to 30s
      startTimer(TIME_CRITICAL, 'critical')
    } else if (nameCount < WARN_THRESHOLD && (p === 'warning' || p === 'extended' || p === 'critical')) {
      // User deleted names back below threshold → cancel and return to idle
      stopTimer()
      setPhase('idle')
      phaseRef.current = 'idle'
      setCountdown(0)
    }
  }, [nameCount, startTimer, stopTimer])

  // Cleanup on unmount
  useEffect(() => () => stopTimer(), [stopTimer])

  // ── Public API ────────────────────────────────────────────────────────────

  /** User clicked "Wait 5 mins" */
  const handleWait = useCallback(() => {
    if (phaseRef.current === 'warning') {
      startTimer(TIME_EXTENDED, 'extended')
    }
  }, [startTimer])

  /** Called by BlastAnimation when the animation finishes */
  const handleBlastComplete = useCallback(() => {
    setPhase('congrats')
    phaseRef.current = 'congrats'
  }, [])

  /** Called when the congrats screen is dismissed */
  const handleCongratsClose = useCallback(() => {
    setPhase('idle')
    phaseRef.current = 'idle'
    setCountdown(0)
  }, [])

  return {
    phase,
    countdown,
    handleWait,
    handleBlastComplete,
    handleCongratsClose,
    isWarning: ['warning', 'extended', 'critical'].includes(phase),
  }
}
