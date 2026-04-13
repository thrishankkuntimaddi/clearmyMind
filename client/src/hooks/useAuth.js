import { useState, useEffect, useRef, useCallback } from 'react'
import {
  hashPassword,
  isBiometricAvailable,
  registerBiometric,
  verifyBiometric,
  clearBiometric,
  hasStoredCredential,
} from '../utils/crypto.js'

const HASH_KEY         = 'clearmind_password_hash'
// Unused legacy key kept here only for migration cleanup
const LOCK_DISABLED_KEY_LEGACY = 'clearmind_lock_disabled'
const NOLOCK_KEY       = 'clearmind_nolock'        // '1' = on, '0' = off
// App Lock is now opt-in (disabled by default). Version stamp for migration.
const APPLOCK_VERSION  = 'clearmind_applock_v2'    // bump to force-clear old lock state
export const MAX_ATTEMPTS  = 3
const LOCK_DELAY_MS = 15000        // 15 s after tab hidden before locking
const NOLOCK_TTL_MS = 30 * 60000  // 30 min — then NoLock auto-disables

// ─── One-time migration: clear old App Lock state from pre-v2 ─────────────────
// Users who had App Lock enabled previously have a hash in localStorage that
// would lock them out. Since App Lock is now opt-in, we wipe the old hash on
// the first load of this version so everyone starts with a clean unlocked state.
function migrateIfNeeded() {
  if (localStorage.getItem(APPLOCK_VERSION) === '1') return // already migrated
  // First load of v2 — clear all old App Lock residue
  localStorage.removeItem(HASH_KEY)
  localStorage.removeItem(LOCK_DISABLED_KEY_LEGACY)
  localStorage.removeItem('clearmind_biometric_credential_id')
  localStorage.setItem(APPLOCK_VERSION, '1')
  console.log('[ClearMyMind] App Lock migration v2: cleared old lock state')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getStoredHash() {
  return localStorage.getItem(HASH_KEY)
}

function readNoLockPref() {
  const val = localStorage.getItem(NOLOCK_KEY)
  if (val === null) {
    localStorage.setItem(NOLOCK_KEY, '1')
    return true
  }
  return val === '1'
}

function saveNoLockPref(enabled) {
  localStorage.setItem(NOLOCK_KEY, enabled ? '1' : '0')
}

export function useAuth() {
  // Run migration exactly once on first render (synchronous, before any state reads)
  migrateIfNeeded()

  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS)
  const [biometricSupported, setBiometricSupported] = useState(false)
  // credSaved: true if a credential ID exists in localStorage (sync check)
  const [credSaved, setCredSaved] = useState(() => hasStoredCredential())

  const [noLock, setNoLock] = useState(() => readNoLockPref())

  // 'setup' | 'locked' | 'unlocked'
  // App Lock is OPT-IN. Default to 'unlocked' unless a password hash exists,
  // meaning the user previously enabled App Lock from Settings.
  const [status, setStatus] = useState(() => {
    return getStoredHash() ? 'locked' : 'unlocked'
  })

  // After password setup, we offer the user to register fingerprint
  // This is 'idle' | 'offering' | 'registering'
  const [bioSetupState, setBioSetupState] = useState('idle')

  const lockTimer   = useRef(null)
  const noLockTimer = useRef(null)

  // Check biometric support once on mount
  useEffect(() => {
    isBiometricAvailable().then(setBiometricSupported)
    // Sync the credSaved flag from localStorage on mount
    setCredSaved(hasStoredCredential())
  }, [])

  // ─── Start 30-min timer when NoLock is ON after login ─────────────────────
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
        if (noLock) return
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
  // NOTE: Does NOT call registerBiometric here — that requires a direct user
  // gesture tap and cannot be called after an async await chain on iOS Safari.
  const setupPassword = useCallback(async (password) => {
    const hash = await hashPassword(password)
    localStorage.setItem(HASH_KEY, hash)
    setStatus('unlocked')
    setAttemptsLeft(MAX_ATTEMPTS)
    // Offer fingerprint registration if the device supports it
    // (actual registration must happen from a direct button click — see enrollBiometric)
    if (await isBiometricAvailable()) {
      setBioSetupState('offering')
    }
  }, [])

  // ─── Enroll fingerprint — MUST be called directly from a button click ─────
  // Call this from onClick, with NO async awaits before it in the handler
  const enrollBiometric = useCallback(async () => {
    setBioSetupState('registering')
    const ok = await registerBiometric()
    if (ok) {
      setCredSaved(true)
      setBiometricSupported(true)
    }
    setBioSetupState('idle')
    return ok
  }, [])

  const skipBioEnroll = useCallback(() => {
    setBioSetupState('idle')
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
      clearBiometric()
      setCredSaved(false)
      setStatus('unlocked')  // App Lock is opt-in — wipe hash and unlock
      setAttemptsLeft(MAX_ATTEMPTS)
      return { success: false, wiped: true }
    }

    return { success: false, attemptsLeft: next }
  }, [attemptsLeft])

  // ─── Login with biometric ─────────────────────────────────────────────────
  // MUST be called directly from a button click — no async code before this
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
  }, [])

  // ─── Change password (Settings) ──────────────────────────────────────────
  const changePassword = useCallback(async (oldPwd, newPwd) => {
    const oldHash = await hashPassword(oldPwd)
    if (oldHash !== getStoredHash()) return { success: false, error: 'Incorrect current password.' }
    const newHash = await hashPassword(newPwd)
    localStorage.setItem(HASH_KEY, newHash)
    return { success: true }
  }, [])

  // ─── Disable App Lock (Settings) — keeps Firebase auth, removes device lock
  const disableLock = useCallback(async (password) => {
    const hash = await hashPassword(password)
    if (hash !== getStoredHash()) return { success: false, error: 'Incorrect password.' }
    localStorage.removeItem(HASH_KEY)
    clearBiometric()
    setCredSaved(false)
    setStatus('unlocked')   // immediately unlock without requiring re-login
    return { success: true }
  }, [])

  // ─── Enable App Lock (Settings) — sends user to Setup flow
  const enableLock = useCallback(() => {
    setStatus('setup')
  }, [])

  return {
    status,
    attemptsLeft,
    // Fingerprint UNLOCK button: show when locked + have a stored credential
    biometricAvailable: credSaved && status === 'locked',
    // Fingerprint ENROLL offer: show after setup when device supports it
    bioSetupState,      // 'idle' | 'offering' | 'registering'
    biometricSupported,
    noLock,
    toggleNoLock,
    setupPassword,
    enrollBiometric,
    skipBioEnroll,
    login,
    loginBiometric,
    lock,
    // Settings-facing — isLockEnabled: true only if user enabled App Lock
    isLockEnabled: !!getStoredHash(),
    changePassword,
    disableLock,
    enableLock,
  }
}
