import { useState, useEffect, useRef, useCallback } from 'react'
import { isConfigured } from '../lib/firebase.js'
import {
  onAuthChange,
  signInWithEmail,
  signUpWithEmail,
  sendVerification,
  sendPasswordReset,
  reauthenticate,
  signOut,
  currentUser,
  deleteAccount as fbDeleteAccount,
} from '../lib/auth.js'
import { clearLocalPrefs } from './useFirestoreData.js'

// How long to wait after receiving a null auth event before treating it as a real sign-out.
// Guards against a transient null while the SDK restores the session on start-up.
const NULL_AUTH_GRACE_MS = 900

// authState: 'not-configured' | 'loading' | 'unauthenticated' | 'unverified' | 'authenticated'
export function useFirebaseAuth() {
  const [authState, setAuthState] = useState(isConfigured ? 'loading' : 'not-configured')
  const [user, setUser]           = useState(null)

  const signOutTimer = useRef(null)

  const applyUser = useCallback((firebaseUser) => {
    setUser(firebaseUser)
    setAuthState(firebaseUser.emailVerified ? 'authenticated' : 'unverified')
  }, [])

  useEffect(() => {
    if (!isConfigured) return
    const unsub = onAuthChange((firebaseUser) => {
      clearTimeout(signOutTimer.current)
      if (firebaseUser) {
        applyUser(firebaseUser)
      } else {
        signOutTimer.current = setTimeout(() => {
          setUser(null)
          setAuthState('unauthenticated')
        }, NULL_AUTH_GRACE_MS)
      }
    })
    return () => {
      clearTimeout(signOutTimer.current)
      unsub()
    }
  }, [applyUser])

  // ─── Sign in ──────────────────────────────────────────────────────────────
  const signIn = useCallback(async (email, password) => {
    try {
      await signInWithEmail(email, password)
      return { success: true }
    } catch (err) {
      return { success: false, error: mapFirebaseError(err.code) }
    }
  }, [])

  // ─── Sign up ─────────────────────────────────────────────────────────────
  const signUp = useCallback(async (email, password) => {
    try {
      const cred = await signUpWithEmail(email, password)
      await sendVerification(cred.user)
      return { success: true }
    } catch (err) {
      return { success: false, error: mapFirebaseError(err.code) }
    }
  }, [])

  // ─── Forgot password ─────────────────────────────────────────────────────
  // Always reports success so the form can't be used to probe which emails
  // have accounts.
  const resetPassword = useCallback(async (email) => {
    try {
      await sendPasswordReset(email)
    } catch (err) {
      if (err.code === 'auth/invalid-email') return { success: false, error: mapFirebaseError(err.code) }
      if (err.code === 'auth/too-many-requests') return { success: false, error: mapFirebaseError(err.code) }
    }
    return { success: true }
  }, [])

  // ─── Email verification ───────────────────────────────────────────────────
  const resendVerification = useCallback(async () => {
    if (!user) return { success: false }
    try {
      await sendVerification(user)
      return { success: true }
    } catch (err) {
      return { success: false, error: mapFirebaseError(err.code) }
    }
  }, [user])

  /** Reload the user from Firebase; moves on if the email is now verified. */
  const checkVerified = useCallback(async () => {
    const u = currentUser()
    if (!u) return false
    try {
      await u.reload()
      if (u.emailVerified) {
        await u.getIdToken(true)   // refresh token so it carries email_verified
        applyUser(u)
        return true
      }
    } catch (err) {
      console.warn('[ClearMyMind] verification check failed:', err.code)
    }
    return false
  }, [applyUser])

  // ─── Sign out ─────────────────────────────────────────────────────────────
  const signOutUser = useCallback(async () => {
    clearLocalPrefs()
    clearLockState()
    await signOut()
  }, [])

  // ─── Delete Firebase account ──────────────────────────────────────────────
  // Order matters: verify the password FIRST, so a failure can't leave the
  // account alive with its data already wiped (or the reverse).
  const deleteAccount = useCallback(async (password, deleteData) => {
    const u = currentUser()
    if (!u) return { success: false, error: 'Not signed in.' }
    try {
      await reauthenticate(u, password)
    } catch (err) {
      return { success: false, error: mapFirebaseError(err.code) }
    }
    try {
      const ok = await deleteData()
      if (!ok) return { success: false, error: 'Could not delete your data. Nothing was removed from your account.' }
      await fbDeleteAccount(u)
      clearLocalPrefs()
      clearLockState()
      setUser(null)
      setAuthState('unauthenticated')
      return { success: true }
    } catch (err) {
      return { success: false, error: mapFirebaseError(err.code) }
    }
  }, [])

  return {
    authState, user,
    signIn, signUp, resetPassword,
    resendVerification, checkVerified,
    signOutUser, deleteAccount,
  }
}

// Device-local App Lock state is per person: clear it so the next account on
// this device starts without someone else's lock.
export function clearLockState() {
  ;[
    'clearmind_password_hash', 'clearmind_cred_id', 'clearmind_nolock',
    'clearmind_applock_v2', 'clearmind_lock_failures',
  ].forEach((k) => localStorage.removeItem(k))
}

// ─── Firebase error code → human-readable message ─────────────────────────────
function mapFirebaseError(code) {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.'
    case 'auth/weak-password':
      return 'Password must be at least 8 characters.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait and try again.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.'
    case 'auth/requires-recent-login':
      return 'Please sign out and sign in again to perform this action.'
    default:
      return 'Something went wrong. Please try again.'
  }
}
