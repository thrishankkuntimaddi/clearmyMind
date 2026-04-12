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
  return signInWithEmailAndPassword(auth, email, password)
}

export function signUpWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password)
}

export function sendVerification(user) {
  return sendEmailVerification(user)
}

export function signOut() {
  return firebaseSignOut(auth)
}

export function deleteAccount(user) {
  return deleteUser(user)
}

// Returns an unsubscribe function
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback)
}
