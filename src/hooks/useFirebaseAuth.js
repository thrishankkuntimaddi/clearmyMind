import { useState, useEffect, useCallback } from 'react'
import { isConfigured, auth } from '../lib/firebase.js'
import {
  onAuthChange,
  signInWithEmail,
  signUpWithEmail,
  sendVerification,
  signOut,
  deleteAccount as fbDeleteAccount,
} from '../lib/auth.js'

// authState: 'not-configured' | 'loading' | 'unauthenticated' | 'unverified' | 'authenticated'
export function useFirebaseAuth() {
  const [authState, setAuthState] = useState(isConfigured ? 'loading' : 'not-configured')
  const [user, setUser]           = useState(null)

  useEffect(() => {
    const unsub = onAuthChange((firebaseUser) => {
      if (!firebaseUser) {
        setUser(null)
        setAuthState('unauthenticated')
      } else if (!firebaseUser.emailVerified) {
        setUser(firebaseUser)
        setAuthState('unverified')
      } else {
        setUser(firebaseUser)
        setAuthState('authenticated')
      }
    })
    return unsub
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
    await signOut()
  }, [])

  // ─── Delete Firebase account ──────────────────────────────────────────────
  const deleteAccount = useCallback(async () => {
    if (!user) return { success: false }
    try {
      await fbDeleteAccount(user)
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
