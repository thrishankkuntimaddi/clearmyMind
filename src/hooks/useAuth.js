import { useState, useEffect, useRef, useCallback } from 'react'
import {
  hashPassword,
  isBiometricAvailable,
  registerBiometric,
  verifyBiometric,
  clearBiometric,
  hasStoredCredential,
} from '../utils/crypto.js'

const HASH_KEY      = 'clearmind_password_hash'
const NAMES_KEY     = 'clearmind_names'
const NOLOCK_KEY    = 'clearmind_nolock'   // '1' = on, '0' = off
const MAX_ATTEMPTS  = 3
const LOCK_DELAY_MS = 15000        // 15 s after tab hidden before locking
const NOLOCK_TTL_MS = 30 * 60000  // 30 min — then NoLock auto-disables

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getStoredHash() {
  return localStorage.getItem(HASH_KEY)
}

// Read saved NoLock preference ('1' = on, anything else / missing = off by default ON first time)
function readNoLockPref() {
  const val = localStorage.getItem(NOLOCK_KEY)
  if (val === null) {
    // First ever launch → default to ON, save it
    localStorage.setItem(NOLOCK_KEY, '1')
    return true
  }
  return val === '1'
}

function saveNoLockPref(enabled) {
  localStorage.setItem(NOLOCK_KEY, enabled ? '1' : '0')
}

export function useAuth() {
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS)
  const [biometricReady, setBiometricReady] = useState(false)
  // credSaved: true if a credential ID is stored in localStorage
  const [credSaved, setCredSaved] = useState(() => hasStoredCredential())

  // ── NoLock preference: remembers ON/OFF across refreshes ─────────────────
  // Does NOT bypass login on refresh — only controls tab-switch locking
  const [noLock, setNoLock] = useState(() => readNoLockPref())

  // ── Status: refresh ALWAYS requires password when a hash exists ───────────
  const [status, setStatus] = useState(() => getStoredHash() ? 'locked' : 'setup')

  const lockTimer   = useRef(null)
  const noLockTimer = useRef(null)  // in-memory 30-min auto-expire

  // Check biometric once on mount
  useEffect(() => {
    isBiometricAvailable().then(setBiometricReady)
    setCredSaved(hasStoredCredential())
  }, [])

  // ─── Start 30-min timer when NoLock is ON after login ─────────────────────
  // This runs in-memory only — when it fires it turns NoLock OFF and saves '0'
  useEffect(() => {
    clearTimeout(noLockTimer.current)
    if (noLock && status === 'unlocked') {
      noLockTimer.current = setTimeout(() => {
        setNoLock(false)
        saveNoLockPref(false)
      }, NOLOCK_TTL_MS)
    }
    return () => clearTimeout(noLockTimer.current)
  }, [noLock, status])

  // ─── NoLock toggle ─────────────────────────────────────────────────────────
  const toggleNoLock = useCallback(() => {
    setNoLock(prev => {
      const next = !prev
      saveNoLockPref(next)
      return next
    })
  }, [])

  // ─── Auto-lock after 15 s of tab hidden (only when NoLock is OFF) ─────────
  useEffect(() => {
    if (status !== 'unlocked') return

    function onVisibilityChange() {
      if (document.hidden) {
        if (noLock) return                // NoLock suppresses auto-lock
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
    // Always try to register biometric — don't gate on biometricReady state
    // which may still be false due to async timing on first mount
    const available = await isBiometricAvailable()
    if (available) {
      const registered = await registerBiometric()
      if (registered) {
        setBiometricReady(true)
        setCredSaved(true)
      }
    }
  }, [])

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
      localStorage.removeItem(HASH_KEY)
      localStorage.removeItem(NAMES_KEY)
      clearBiometric()
      setCredSaved(false)
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
    setStatus('locked')
    // Note: does NOT change noLock preference — user preference stays as-is
  }, [])

  return {
    status,
    attemptsLeft,
    // Show fingerprint button if platform supports biometrics AND we have a stored credential
    biometricAvailable: (biometricReady || credSaved) && status === 'locked',
    noLock,
    toggleNoLock,
    setupPassword,
    login,
    loginBiometric,
    lock,
  }
}
