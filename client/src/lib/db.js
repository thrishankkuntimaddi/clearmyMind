/**
 * db.js — ClearMyMind Firestore Data Layer (session data)
 * =========================================================
 * Memory Sheets live in memoryDb.js; everything else goes through here.
 *
 * DATA MODEL — 6 documents per user:
 *   users/{uid}/data/sheets   — { sheets: [{ id, name }], schema }
 *   users/{uid}/data/names    — { [sheetId]: string[] }
 *   users/{uid}/data/tags     — { [sheetId]: { [name]: colorKey } }
 *   users/{uid}/data/groups   — { groups: { [id]: { name, members } } }
 *   users/{uid}/data/bag      — { bag: string[] }
 *   users/{uid}/data/profile  — { noclear }   (doc may be shared with other PASSI apps)
 */

import {
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  serverTimestamp,
  FieldPath,
} from 'firebase/firestore'
import { db, dbReady } from './firebase.js'
import { deleteAllMemoryData } from './memoryDb.js'

export const USER_DOCS = ['sheets', 'names', 'tags', 'groups', 'bag', 'profile']

function docRef(uid, docName) {
  return doc(db, 'users', uid, 'data', docName)
}

// Sentinel for removing a top-level field (e.g. a deleted sheet's names).
export const REMOVE = deleteField

// ─── loadUserData — one-shot read of all docs at boot ────────────────────────
// Throws if Firestore is unreachable. The caller must NOT write anything in
// that case, otherwise it could overwrite real data with empty defaults.
export async function loadUserData(uid) {
  await dbReady
  const snaps = await Promise.all(USER_DOCS.map((d) => getDoc(docRef(uid, d))))
  const out = {}
  USER_DOCS.forEach((d, i) => { out[d] = snaps[i].exists() ? snaps[i].data() : null })
  return out
}

// ─── writeFields — replace specific top-level fields of one doc ──────────────
// Uses mergeFields so each listed field is REPLACED, not deep-merged. A plain
// { merge: true } deep-merges nested maps, which silently kept removed tag
// colours (and deleted groups) alive in Firestore.
export async function writeFields(uid, docName, fields) {
  if (!uid || !db) return false
  const keys = Object.keys(fields)
  if (!keys.length) return true
  try {
    await setDoc(
      docRef(uid, docName),
      { ...fields, updatedAt: serverTimestamp() },
      { mergeFields: [...keys.map((k) => new FieldPath(k)), 'updatedAt'] },
    )
    return true
  } catch (e) {
    console.error(`[ClearMyMind] write(${docName}) failed:`, e.code)
    return false
  }
}

// ─── subscribeToUserData — real-time cross-device sync ───────────────────────
// Only server-confirmed snapshots are forwarded: local writes echoing back
// (hasPendingWrites) would otherwise clobber newer optimistic state.
export function subscribeToUserData(uid, onUpdate) {
  if (!db) return () => {}
  const unsubs = USER_DOCS.map((docName) =>
    onSnapshot(
      docRef(uid, docName),
      (snap) => {
        if (snap.metadata.hasPendingWrites || snap.metadata.fromCache) return
        onUpdate(docName, snap.exists() ? snap.data() : null)
      },
      (err) => console.error(`[ClearMyMind] listen(${docName}) error:`, err.code),
    ),
  )
  return () => unsubs.forEach((u) => u())
}

// ─── loadMemoryNames — every name in every Memory Sheet (lower-cased) ────────
export async function loadMemoryNames(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'memory'))
  const out = new Set()
  snap.forEach((d) => (Array.isArray(d.data().names) ? d.data().names : []).forEach((n) => {
    if (typeof n === 'string') out.add(n.toLowerCase())
  }))
  return out
}

// ─── deleteAllUserData — permanently remove every ClearMyMind document ──────
export async function deleteAllUserData(uid) {
  if (!uid || !db) return
  await Promise.all([
    ...USER_DOCS.filter((d) => d !== 'profile').map((d) => deleteDoc(docRef(uid, d))),
    // The profile doc may be shared with other PASSI apps — only drop our field.
    updateDoc(docRef(uid, 'profile'), { noclear: deleteField() }).catch(() => {}),
    deleteAllMemoryData(uid),
  ])
}
