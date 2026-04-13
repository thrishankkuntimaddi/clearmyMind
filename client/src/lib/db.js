/**
 * db.js — ClearMyMind Firestore Data Layer
 * ==========================================
 * The ONLY file in the codebase that imports firebase/firestore.
 * All reads, writes, and real-time listeners live here.
 *
 * ARCHITECTURE (mirrors EveryDay's db.js):
 *   useFirestoreData.js / api.js
 *      ↓
 *   db.js             ← YOU ARE HERE
 *      ↓
 *   Firestore         ← users/{uid}/data/{docName}
 *
 * DATA MODEL — 6 sub-documents per user:
 *   users/{uid}/data/sheets   — sheet list + activeSheetId
 *   users/{uid}/data/names    — { [sheetId]: string[] }
 *   users/{uid}/data/tags     — { [sheetId]: { [name]: colorKey } }
 *   users/{uid}/data/groups   — { groups: { [id]: { name, members } } }
 *   users/{uid}/data/bag      — { bag: string[] }
 *   users/{uid}/data/profile  — { noclear, emailVerified, … }
 *
 * PUBLIC API:
 *   patchUserData(uid, docName, partial)  → write (merge) to one doc
 *   fetchAllUserData(uid)                 → read all 6 docs at once (boot)
 *   subscribeToUserData(uid, onUpdate)    → real-time cross-device sync
 *   deleteAllUserData(uid)               → wipe all docs (account deletion)
 *   stopListening()                      → tear down listeners on logout
 *   getCached(uid, docName)              → synchronous cache read (post-fetch)
 */

import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore'
import { db } from './firebase.js'

// ─── Constants ────────────────────────────────────────────────────────────────
export const USER_DOCS = ['sheets', 'names', 'tags', 'groups', 'bag', 'profile']

// ─── In-memory cache (post-fetch) ────────────────────────────────────────────
// Populated by fetchAllUserData() on boot. After that, hooks read from
// React state (which is already hydrated from the cache). Useful for
// synchronous reads in event handlers that can't await Firestore.
let _cache = {}

// ─── Active listener unsubscribe functions ───────────────────────────────────
let _unsubs = []

// ─── Internal ─────────────────────────────────────────────────────────────────
function docRef(uid, docName) {
  return doc(db, `users/${uid}/data/${docName}`)
}

// ─── getCached — synchronous cache read ──────────────────────────────────────
/**
 * Read a cached doc snapshot synchronously after fetchAllUserData().
 * Returns null if the doc hasn't been loaded yet.
 * Mirrors EveryDay's getCached(key, fallback).
 */
export function getCached(docName, fallback = null) {
  const val = _cache[docName]
  return (val !== undefined && val !== null) ? val : fallback
}

// ─── patchUserData — write to Firestore ──────────────────────────────────────
/**
 * Merge-write a partial update to one Firestore doc.
 * Also updates the in-memory cache for any subsequent getCached() calls.
 */
export async function patchUserData(uid, docName, partial) {
  if (!uid || !db) return false
  // Update cache synchronously so getCached() is always fresh
  _cache[docName] = { ...(_cache[docName] ?? {}), ...partial }
  try {
    await setDoc(docRef(uid, docName), { ...partial, updatedAt: serverTimestamp() }, { merge: true })
    return true
  } catch (e) {
    console.error(`[ClearMyMind] patchUserData(${docName}) failed:`, e.code, e.message)
    return false
  }
}

// ─── fetchAllUserData — initial read on boot ──────────────────────────────────
/**
 * Read all 6 user documents in parallel. Hydrates the in-memory cache.
 * MUST be called before getCached() and before subscribeToUserData().
 * Returns { sheets, names, tags, groups, bag, profile } (null per missing doc).
 */
export async function fetchAllUserData(uid) {
  if (!db) return {}
  const results = {}
  await Promise.all(
    USER_DOCS.map(async (docName) => {
      try {
        const snap = await getDoc(docRef(uid, docName))
        results[docName] = snap.exists() ? snap.data() : null
      } catch (err) {
        console.error(`[ClearMyMind] fetchAllUserData(${docName}) failed:`, err.code, err.message)
        results[docName] = null
      }
    })
  )
  _cache = results   // hydrate cache
  return results
}

// ─── subscribeToUserData — real-time cross-device sync ───────────────────────
/**
 * Open onSnapshot listeners for all 6 user docs.
 * Fires onUpdate(docName, data) ONLY for server-confirmed changes:
 *   hasPendingWrites = true  → local write echoing back → SKIP
 *   hasPendingWrites = false → remote device update    → CALL onUpdate
 *
 * The caller (useFirestoreData) guards initCompleteRef so that our own
 * seed writes for brand-new users don't bounce back and wipe state.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToUserData(uid, onUpdate, onError) {
  if (!db) return () => {}

  const unsubs = USER_DOCS.map((docName) => {
    console.log(`[ClearMyMind] Attaching listener: users/${uid}/data/${docName}`)
    return onSnapshot(
      docRef(uid, docName),
      { includeMetadataChanges: true },
      (snap) => {
        // Skip our own local optimistic writes echoing back — they would
        // overwrite state we already applied synchronously.
        if (snap.metadata.hasPendingWrites) return
        if (!snap.exists()) return   // doc not yet created — skip

        const data = snap.data()
        _cache[docName] = data       // keep cache fresh
        console.log(
          `[ClearMyMind] snapshot(${docName}) fromCache=${snap.metadata.fromCache}`,
          data
        )
        // Allow BOTH fromCache=true (offline/local Firestore cache, e.g. on
        // GitHub Pages before the network round-trip completes) and
        // fromCache=false (confirmed server snapshot for cross-device sync).
        onUpdate(docName, data)
      },
      (err) => {
        console.error(`[ClearMyMind] onSnapshot(${docName}) error:`, err.code, err.message)
        onError?.(docName, err)
      }
    )
  })

  _unsubs = unsubs
  return () => unsubs.forEach((u) => u())
}

// ─── stopListening — tear down all listeners on logout ───────────────────────
/**
 * Unsubscribes all active Firestore listeners and clears the cache.
 * Call this when the user logs out to prevent cross-user data leaks.
 * Mirrors EveryDay's stopListening().
 */
export function stopListening() {
  _unsubs.forEach((u) => u())
  _unsubs = []
  _cache  = {}
  console.log('[ClearMyMind] Firestore listeners stopped, cache cleared.')
}

// ─── deleteAllUserData — wipe all docs (account deletion) ───────────────────
/**
 * Permanently deletes all 6 Firestore documents for a user.
 * Called from SettingsPanel when the user requests account deletion.
 */
export async function deleteAllUserData(uid) {
  if (!db) return
  await Promise.all(USER_DOCS.map((docName) => deleteDoc(docRef(uid, docName))))
  _cache = {}
  console.log(`[ClearMyMind] All Firestore data deleted for uid: ${uid}`)
}

