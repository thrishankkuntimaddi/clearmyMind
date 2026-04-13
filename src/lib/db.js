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
  if (!uid || !db) return
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
  if (!db) return {}
  const results = {}
  await Promise.all(
    USER_DOCS.map(async (docName) => {
      try {
        const snap = await getDoc(docRef(uid, docName))
        const data = snap.exists() ? snap.data() : null
        results[docName] = data
        if (data) setCached(uid, docName, data)
      } catch (err) {
        console.error(`[ClearMyMind] fetchAllUserData(${docName}) failed:`, err.code, err.message)
        results[docName] = null
      }
    })
  )
  return results
}

// ─── Real-time subscription — fires for remote-confirmed changes ──────────────
// Strategy:
//   hasPendingWrites = true  → our own optimistic write echoing back → SKIP
//   hasPendingWrites = false → server has confirmed/sent data       → PROCESS
//   (We no longer gate on fromCache because GitHub Pages' restricted ServiceWorker
//    environment frequently marks legitimate server snapshots as fromCache=true,
//    which was silently dropping all real-time updates in production.)
export function subscribeToUserData(uid, onUpdate, onError) {
  if (!db) return () => {}

  const unsubs = USER_DOCS.map((docName) =>
    onSnapshot(
      docRef(uid, docName),
      { includeMetadataChanges: true },
      (snap) => {
        // Skip our own optimistic writes echoing back from the SDK
        if (snap.metadata.hasPendingWrites) return

        const data = snap.data() ?? null
        setCached(uid, docName, data)
        onUpdate(docName, data)
      },
      (err) => {
        console.error(`[ClearMyMind] onSnapshot(${docName}) error:`, err.code, err.message)
        onError?.(docName, err)
      }
    )
  )
  return () => unsubs.forEach((u) => u())
}

// ─── Delete all user data docs ───────────────────────────────────────────────
export async function deleteAllUserData(uid) {
  if (!db) return
  await Promise.all(USER_DOCS.map((docName) => deleteDoc(docRef(uid, docName))))
  delete _cache[uid]
}
