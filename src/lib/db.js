import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore'
import { db } from './firebase.js'

// ─── In-memory cache (keyed by uid) ──────────────────────────────────────────
const _cache = {}

export const USER_DOCS = ['sheets', 'names', 'tags', 'groups', 'bag', 'profile']

function docRef(uid, docName) {
  return doc(db, `users/${uid}/data/${docName}`)
}

// ─── Write to Firestore (merge) + update in-memory cache ─────────────────────
export async function patchUserData(uid, docName, partial) {
  if (!uid) return
  if (!_cache[uid]) _cache[uid] = {}
  _cache[uid][docName] = { ...(_cache[uid][docName] ?? {}), ...partial }
  await setDoc(docRef(uid, docName), { ...partial, updatedAt: serverTimestamp() }, { merge: true })
}

// ─── Read in-memory cache ─────────────────────────────────────────────────────
export function getCached(uid, docName) {
  return _cache[uid]?.[docName] ?? null
}

// ─── Seed cache from fetched data ────────────────────────────────────────────
function setCached(uid, docName, data) {
  if (!_cache[uid]) _cache[uid] = {}
  _cache[uid][docName] = data
}

// ─── Initial fetch — reads all 6 user docs at once ───────────────────────────
export async function fetchAllUserData(uid) {
  const results = {}
  await Promise.all(
    USER_DOCS.map(async (docName) => {
      const snap = await getDoc(docRef(uid, docName))
      const data = snap.exists() ? snap.data() : null
      results[docName] = data
      if (data) setCached(uid, docName, data)
    })
  )
  return results
}

// ─── Real-time subscription — fires for REMOTE changes only ──────────────────
// hasPendingWrites = true  → our own local write echoing back → skip
// hasPendingWrites = false → server-confirmed (could be from another device) → process
export function subscribeToUserData(uid, onUpdate) {
  const unsubs = USER_DOCS.map((docName) =>
    onSnapshot(docRef(uid, docName), (snap) => {
      if (snap.metadata.hasPendingWrites) return
      const data = snap.data() ?? null
      setCached(uid, docName, data)
      onUpdate(docName, data)
    })
  )
  return () => unsubs.forEach((u) => u())
}

// ─── Delete all user data docs ───────────────────────────────────────────────
export async function deleteAllUserData(uid) {
  await Promise.all(USER_DOCS.map((docName) => deleteDoc(docRef(uid, docName))))
  delete _cache[uid]
}
