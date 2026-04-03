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
const NOLOCK_KEY    = 'clearmind_nolock_expiry'  // stores expiry epoch ms
const MAX_ATTEMPTS  = 3
const LOCK_DELAY_MS = 15000        // 15 s after tab is hidden
const NOLOCK_TTL_MS = 30 * 60000  // 30 min NoLock auto-expires

// ─── NoLock localStorage helpers ─────────────────────────────────────────────
function readNoLock() {
  try {
    const ts = Number(localStorage.getItem(NOLOCK_KEY))
    if (ts && Date.now() < ts) return true     // within 30-min window
  } catch { /**/ }
  return false
}

function writeNoLock(enabled) {
  if (enabled) {
    localStorage.setItem(NOLOCK_KEY, String(Date.now() + NOLOCK_TTL_MS))
  } else {
    localStorage.removeItem(NOLOCK_KEY)
  }
}

function getStoredHash() {
  return localStorage.getItem(HASH_KEY)
}

export function useAuth() {
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS)
  const [biometricReady, setBiometricReady] = useState(false)

  // ── NoLock: compute first so status init can use it ─────────────────────
  const [noLock, setNoLock] = useState(() => {
    const persisted = readNoLock()
    if (!persisted) {
      // First time ever (no key stored at all) → default to ON
      const hasKey = localStorage.getItem(NOLOCK_KEY) !== null
      if (!hasKey) { writeNoLock(true); return true }
    }
    return persisted
  })

  // ── Status: if NoLock is active, bypass lock screen on refresh ───────────
  const [status, setStatus] = useState(() => {
    if (!getStoredHash()) return 'setup'
    // NoLock still within its 30-min window → stay unlocked across refresh
    if (readNoLock()) return 'unlocked'
    return 'locked'
  })

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
      writeNoLock(next)    // persist to localStorage
      if (next) {
        // Auto-disable after 30 min
        noLockTimer.current = setTimeout(() => {
          setNoLock(false)
          writeNoLock(false)
        }, NOLOCK_TTL_MS)
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
    writeNoLock(false)   // clear persisted NoLock on manual lock
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
