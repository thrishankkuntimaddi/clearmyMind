/**
 * db.js — ClearMyMind Firestore Data Layer
 * ==========================================
 * The ONLY file in the codebase that imports firebase/firestore.
 *
 * DATA MODEL — 3 documents per user:
 *   users/{uid}/data/sheets  — { sheets: [{ id, name }], schema: 2 }
 *   users/{uid}/data/names   — { [sheetId]: string[] }
 *   users/{uid}/data/tags    — { [sheetId]: { [name]: colorKey } }
 *
 * LEGACY (v1) — read once for migration, removed by deleteAllUserData():
 *   users/{uid}/data/groups, users/{uid}/data/bag,
 *   users/{uid}/memory/*, users/{uid}/memoryTrash/*,
 *   users/{uid}/data/profile.noclear
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

export const USER_DOCS = ['sheets', 'names', 'tags']
const LEGACY_DOCS = ['groups', 'bag']
const LEGACY_COLLECTIONS = ['memory', 'memoryTrash']

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
// { merge: true } would deep-merge nested maps, which silently kept removed
// tag colours alive in Firestore.
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

// ─── loadLegacyData — v1 Bag + Memory Sheets, for one-time migration ─────────
export async function loadLegacyData(uid) {
  const [bagSnap, memSnap] = await Promise.all([
    getDoc(docRef(uid, 'bag')),
    getDocs(collection(db, 'users', uid, 'memory')),
  ])
  const bag = bagSnap.exists() && Array.isArray(bagSnap.data().bag) ? bagSnap.data().bag : []
  const memorySheets = memSnap.docs.map((d) => ({
    name:  d.data().name,
    names: Array.isArray(d.data().names) ? d.data().names : [],
  }))
  return { bag, memorySheets }
}

// ─── deleteAllUserData — permanently remove every ClearMyMind document ──────
export async function deleteAllUserData(uid) {
  if (!uid || !db) return
  const colSnaps = await Promise.all(
    LEGACY_COLLECTIONS.map((c) => getDocs(collection(db, 'users', uid, c))),
  )
  await Promise.all([
    ...[...USER_DOCS, ...LEGACY_DOCS].map((d) => deleteDoc(docRef(uid, d))),
    ...colSnaps.flatMap((s) => s.docs.map((d) => deleteDoc(d.ref))),
    // The profile doc may be shared with other PASSI apps — only drop our field.
    updateDoc(docRef(uid, 'profile'), { noclear: deleteField() }).catch(() => {}),
  ])
}
