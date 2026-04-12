import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut as firebaseSignOut,
  deleteUser,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from './firebase.js'

// ─── Pure Firebase Auth functions (no React state) ────────────────────────────

export function signInWithEmail(email, password) {
  if (!auth) return Promise.reject(new Error('auth/not-configured'))
  return signInWithEmailAndPassword(auth, email, password)
}

export function signUpWithEmail(email, password) {
  if (!auth) return Promise.reject(new Error('auth/not-configured'))
  return createUserWithEmailAndPassword(auth, email, password)
}

export function sendVerification(user) {
  if (!auth) return Promise.resolve()
  return sendEmailVerification(user)
}

export function signOut() {
  if (!auth) return Promise.resolve()
  return firebaseSignOut(auth)
}

export function deleteAccount(user) {
  if (!auth) return Promise.reject(new Error('auth/not-configured'))
  return deleteUser(user)
}

// Returns an unsubscribe function
export function onAuthChange(callback) {
  if (!auth) return () => {}
  return onAuthStateChanged(auth, callback)
}
