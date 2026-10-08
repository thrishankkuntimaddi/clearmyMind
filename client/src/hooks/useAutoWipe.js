import { useState, useEffect, useRef, useCallback } from 'react'

const WARN_THRESHOLD     = 80   // show Wait button
const CRITICAL_THRESHOLD = 90   // escalate to 10s
const TIME_COUNTING      = 300  // 5 minutes after clicking Wait
const TIME_CRITICAL      = 10   // 10 seconds urgent

export function useAutoWipe(nameCount) {
  // phase: 'idle' | 'pending' | 'counting' | 'critical' | 'blasting' | 'congrats'
  const [phase,     setPhase]     = useState('idle')
  const [countdown, setCountdown] = useState(0)

  const phaseRef     = useRef('idle')
  const countdownRef = useRef(0)      // source of truth for interval
  const intervalRef  = useRef(null)

  // ── Timer helpers ────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const startTimer = useCallback((seconds, newPhase) => {
    stopTimer()

    // Update refs synchronously so the interval closure always sees fresh values
    phaseRef.current     = newPhase
    countdownRef.current = seconds
    setPhase(newPhase)
    setCountdown(seconds)

    intervalRef.current = setInterval(() => {
      const next = countdownRef.current - 1
      countdownRef.current = next
      setCountdown(next)

      if (next <= 0) {
        clearInterval(intervalRef.current)
        intervalRef.current  = null
        phaseRef.current     = 'blasting'
        setPhase('blasting')
      }
    }, 1000)
  }, [stopTimer])

  // ── Name-count watcher ────────────────────────────────────────────────────
  useEffect(() => {
    const p = phaseRef.current

    if (nameCount >= WARN_THRESHOLD && p === 'idle') {
      // Cross 80 → show Wait button (no timer yet)
      phaseRef.current = 'pending'
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase('pending')
    } else if (nameCount >= CRITICAL_THRESHOLD && p === 'counting') {
      // Cross 90 while timer is running → escalate to 10s
      startTimer(TIME_CRITICAL, 'critical')
    } else if (nameCount < WARN_THRESHOLD &&
               (p === 'pending' || p === 'counting' || p === 'critical')) {
      // Dropped back below 80 (user deleted) → cancel
      stopTimer()
      phaseRef.current = 'idle'
       
      setPhase('idle')
       
      setCountdown(0)
    }
  }, [nameCount, startTimer, stopTimer])

  // Cleanup on unmount
  useEffect(() => () => stopTimer(), [stopTimer])

  // ── Public API ────────────────────────────────────────────────────────────

  /** User clicks "Wait" — THIS is what actually starts the 5-min countdown */
  const handleWait = useCallback(() => {
    if (phaseRef.current === 'pending') {
      startTimer(TIME_COUNTING, 'counting')
    }
  }, [startTimer])

  const handleBlastComplete = useCallback(() => {
    phaseRef.current = 'congrats'
    setPhase('congrats')
  }, [])

  const handleCongratsClose = useCallback(() => {
    phaseRef.current = 'idle'
    setPhase('idle')
    setCountdown(0)
  }, [])

  return {
    phase,
    countdown,
    handleWait,
    handleBlastComplete,
    handleCongratsClose,
  }
}
