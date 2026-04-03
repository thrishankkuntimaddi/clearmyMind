import { useState, useEffect, useRef, useCallback } from 'react'
import {
  hashPassword,
  isBiometricAvailable,
  registerBiometric,
  verifyBiometric,
  clearBiometric,
} from '../utils/crypto.js'

const HASH_KEY      = 'clearmind_password_hash'
const NAMES_KEY     = 'clearmind_names'
const MAX_ATTEMPTS  = 3
const LOCK_DELAY_MS = 15000        // 15 s after tab is hidden
const NOLOCK_TTL_MS = 30 * 60000  // 30 min NoLock auto-expires

function getStoredHash() {
  return localStorage.getItem(HASH_KEY)
}

export function useAuth() {
  const [status, setStatus]             = useState(() => getStoredHash() ? 'locked' : 'setup')
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS)
  const [biometricReady, setBiometricReady] = useState(false)
  const [noLock, setNoLock]             = useState(false)

  const lockTimer   = useRef(null)
  const noLockTimer = useRef(null)  // 30-min auto-expire for NoLock

  // Check biometric once on mount
  useEffect(() => {
    isBiometricAvailable().then(setBiometricReady)
  }, [])

  // ─── NoLock toggle — suppresses visibility-change locking ─────────────────
  const toggleNoLock = useCallback(() => {
    setNoLock(prev => {
      const next = !prev
      clearTimeout(noLockTimer.current)
      if (next) {
        // Auto-disable after 30 min
        noLockTimer.current = setTimeout(() => setNoLock(false), NOLOCK_TTL_MS)
      }
      return next
    })
  }, [])

  // Clear noLock timer on unmount
  useEffect(() => () => clearTimeout(noLockTimer.current), [])

  // ─── Lock after 15 s of tab being hidden (unless NoLock is ON) ────────────
  useEffect(() => {
    if (status !== 'unlocked') return

    function onVisibilityChange() {
      if (document.hidden) {
        if (noLock) return           // NoLock suppresses auto-lock
        lockTimer.current = setTimeout(() => setStatus('locked'), LOCK_DELAY_MS)
      } else {
        clearTimeout(lockTimer.current)
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearTimeout(lockTimer.current)
    }
  }, [status, noLock])

  // ─── Setup (first time) ───────────────────────────────────────────────────
  const setupPassword = useCallback(async (password) => {
    const hash = await hashPassword(password)
    localStorage.setItem(HASH_KEY, hash)
    setStatus('unlocked')
    setAttemptsLeft(MAX_ATTEMPTS)
    // Silently try biometric registration — ignore failures
    if (biometricReady) await registerBiometric()
  }, [biometricReady])

  // ─── Login with password ──────────────────────────────────────────────────
  const login = useCallback(async (password) => {
    const hash = await hashPassword(password)
    if (hash === getStoredHash()) {
      setStatus('unlocked')
      setAttemptsLeft(MAX_ATTEMPTS)
      return { success: true }
    }

    const next = attemptsLeft - 1
    setAttemptsLeft(next)

    if (next <= 0) {
      // Wipe everything and reset
      localStorage.removeItem(HASH_KEY)
      localStorage.removeItem(NAMES_KEY)
      clearBiometric()
      setStatus('setup')
      setAttemptsLeft(MAX_ATTEMPTS)
      return { success: false, wiped: true }
    }

    return { success: false, attemptsLeft: next }
  }, [attemptsLeft])

  // ─── Login with biometric ─────────────────────────────────────────────────
  const loginBiometric = useCallback(async () => {
    const ok = await verifyBiometric()
    if (ok) {
      setStatus('unlocked')
      setAttemptsLeft(MAX_ATTEMPTS)
    }
    return ok
  }, [])

  // ─── Manual lock ─────────────────────────────────────────────────────────
  const lock = useCallback(() => {
    clearTimeout(lockTimer.current)
    clearTimeout(noLockTimer.current)
    setNoLock(false)
    setStatus('locked')
  }, [])

  return {
    status,                                                 // 'setup' | 'locked' | 'unlocked'
    attemptsLeft,
    biometricAvailable: biometricReady && status === 'locked',
    noLock,
    toggleNoLock,
    setupPassword,
    login,
    loginBiometric,
    lock,
  }
}
