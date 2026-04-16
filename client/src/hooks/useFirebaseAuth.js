import { useState, useEffect, useRef, useCallback } from 'react'
import { isConfigured } from '../lib/firebase.js'
import {
  onAuthChange,
  signInWithEmail,
  signUpWithEmail,
  sendVerification,
  signOut,
  deleteAccount as fbDeleteAccount,
} from '../lib/auth.js'
import { stopListening } from '../lib/db.js'

// How long to wait after receiving a null auth event before treating it as a real sign-out.
// Firebase fires onAuthStateChanged(null) transiently while it refreshes the ID token
// (which expires every 1 hour). Without this grace period, a mid-refresh null event
// immediately redirects the user to the login screen even though they are still logged in.
const NULL_AUTH_GRACE_MS = 900

// authState: 'not-configured' | 'loading' | 'unauthenticated' | 'unverified' | 'authenticated'
export function useFirebaseAuth() {
  const [authState, setAuthState] = useState(isConfigured ? 'loading' : 'not-configured')
  const [user, setUser]           = useState(null)

  // Ref to the pending "sign-out" timer so we can cancel it if the user comes back
  const signOutTimer = useRef(null)

  useEffect(() => {
    // Guard: skip listener if Firebase was not configured at build time
    if (!isConfigured) return
    const unsub = onAuthChange((firebaseUser) => {
      // Cancel any pending deferred sign-out — a new event arrived
      clearTimeout(signOutTimer.current)

      if (!firebaseUser) {
        // ── Transient null guard ──────────────────────────────────────────
        // Firebase emits null briefly while refreshing the ID token (every ~1 h).
        // We wait NULL_AUTH_GRACE_MS before treating null as a real sign-out.
        // If a non-null event arrives within that window, the timer is cancelled
        // above and the user stays logged in.
        signOutTimer.current = setTimeout(() => {
          setUser(null)
          setAuthState('unauthenticated')
        }, NULL_AUTH_GRACE_MS)
      } else if (!firebaseUser.emailVerified) {
        setUser(firebaseUser)
        setAuthState('unverified')
      } else {
        setUser(firebaseUser)
        setAuthState('authenticated')
      }
    })
    return () => {
      clearTimeout(signOutTimer.current)
      unsub()
    }
  }, [])

  // ─── Sign in ──────────────────────────────────────────────────────────────
  const signIn = useCallback(async (email, password) => {
    try {
      await signInWithEmail(email, password)
      return { success: true }
    } catch (err) {
      console.error('[ClearMyMind] signIn error:', err.code, err.message)
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

  // ─── Resend verification email ────────────────────────────────────────────
  const resendVerification = useCallback(async () => {
    if (!user) return { success: false }
    try {
      await sendVerification(user)
      return { success: true }
    } catch {
      return { success: false }
    }
  }, [user])

  // ─── Sign out ─────────────────────────────────────────────────────────────
  const signOutUser = useCallback(async () => {
    stopListening()  // clear Firestore listeners + cache before signing out
    // Clear device-local App Lock state so the next account/user on this
    // device starts fresh with no lock enforced.
    ;[
      'clearmind_password_hash',
      'clearmind_cred_id',
      'clearmind_nolock',
      'clearmind_applock_v2',
    ].forEach((k) => localStorage.removeItem(k))
    await signOut()
  }, [])

  // ─── Delete Firebase account ──────────────────────────────────────────────
  const deleteAccount = useCallback(async () => {
    if (!user) return { success: false }
    try {
      await fbDeleteAccount(user)
      // Explicitly clear Firestore listeners + cache, then force the UI back to
      // the login screen. We don't rely solely on onAuthStateChanged because
      // Firebase may not fire it reliably after deleteUser in all browsers.
      stopListening()
      setUser(null)
      setAuthState('unauthenticated')
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [user])

  return { authState, user, signIn, signUp, resendVerification, signOutUser, deleteAccount }
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
      return 'Password must be at least 6 characters.'
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
