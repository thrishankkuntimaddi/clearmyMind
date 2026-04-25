/**
 * db.js — ClearMyMind Firestore Data Layer
 * ==========================================
 * The ONLY file in the codebase that imports firebase/firestore.
 * All reads, writes, and real-time listeners live here.
 *
 * ARCHITECTURE:
 *   useFirestoreData.js / SettingsPanel.jsx
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
 *   patchUserData(uid, docName, partial)  → write (setDoc merge) to one doc
 *   fetchAllUserDataWithErrors(uid)       → read all 6 docs at boot (tracks per-doc errors)
 *   subscribeToUserData(uid, onUpdate)    → real-time cross-device sync
 *   deleteAllUserData(uid)               → wipe all docs (account deletion)
 *   stopListening()                      → tear down listeners on logout
 */

import {
  doc,
  setDoc,
  getDoc,
  getDocFromCache,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { deleteAllMemoryData } from './memoryDb.js'

// ─── Constants ────────────────────────────────────────────────────────────────
export const USER_DOCS = ['sheets', 'names', 'tags', 'groups', 'bag', 'profile']

// ─── In-memory cache (post-fetch) ────────────────────────────────────────────
// Populated by fetchAllUserDataWithErrors() on boot. After that, hooks read from
// React state (which is already hydrated from the cache). Useful for
// synchronous reads in event handlers that can't await Firestore.
let _cache = {}

// ─── Active listener unsubscribe functions ───────────────────────────────────
let _unsubs = []

// ─── Internal ─────────────────────────────────────────────────────────────────
function docRef(uid, docName) {
  return doc(db, `users/${uid}/data/${docName}`)
}

// ─── patchUserData — write to Firestore ──────────────────────────────────────
/**
 * Merge-write a partial update to one Firestore doc.
 */
export async function patchUserData(uid, docName, partial) {
  if (!uid || !db) return false
  // Update cache synchronously
  _cache[docName] = { ...(_cache[docName] ?? {}), ...partial }
  try {
    await setDoc(docRef(uid, docName), { ...partial, updatedAt: serverTimestamp() }, { merge: true })
    return true
  } catch (e) {
    console.error(`[ClearMyMind] patchUserData(${docName}) failed:`, e.code, e.message)
    return false
  }
}

// ─── fetchAllUserDataWithErrors — like fetchAllUserData but also returns error map ─
/**
 * Same as fetchAllUserData but also returns a `fetchErrors` map
 * so callers can distinguish between docs that legitimately don't exist (null, no error)
 * vs docs that failed to fetch due to auth/permission issues (null + fetchErrors[docName]=true).
 * This prevents second-device fresh login from falsely detecting an "new user".
 */
export async function fetchAllUserDataWithErrors(uid) {
  if (!db) return { data: {}, fetchErrors: {} }
  const results = {}
  const fetchErrors = {}
  await Promise.all(
    USER_DOCS.map(async (docName) => {
      try {
        const snap = await getDoc(docRef(uid, docName))
        results[docName] = snap.exists() ? snap.data() : null
      } catch (netErr) {
        console.warn(`[CMM] fetch(${docName}): network FAILED (${netErr.code}) — trying IndexedDB cache`)
        try {
          const cached = await getDocFromCache(docRef(uid, docName))
          results[docName] = cached.exists() ? cached.data() : null
        } catch (cacheErr) {
          console.error(`[CMM] fetch(${docName}): BOTH network AND cache failed:`, cacheErr.code)
          results[docName] = null
          fetchErrors[docName] = true  // mark as error (not "doc doesn't exist")
        }
      }
    })
  )
  _cache = results
  return { data: results, fetchErrors }
}

// ─── subscribeToUserData — real-time cross-device sync ───────────────────────
/**
 * Open onSnapshot listeners for all 6 user docs.
 * Fires onUpdate(docName, data) ONLY for server-confirmed (fromCache=false) changes:
 *   hasPendingWrites = true  → local write echoing back     → SKIP
 *   fromCache = true         → stale IndexedDB echo mid-op  → SKIP
 *   fromCache = false        → remote device / server ack   → CALL onUpdate
 *
 * The caller (useFirestoreData) guards initCompleteRef so that our own
 * seed writes for brand-new users don't bounce back and wipe state.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToUserData(uid, onUpdate, onError) {
  if (!db) return () => {}

  const unsubs = USER_DOCS.map((docName) => {
    return onSnapshot(
      docRef(uid, docName),
      { includeMetadataChanges: true },
      (snap) => {
        // Skip our own local optimistic writes echoing back — they would
        // overwrite state we already applied synchronously.
        if (snap.metadata.hasPendingWrites) return
        if (!snap.exists()) return   // doc not yet created — skip

        // Skip cache snapshots during live operation. The initial boot
        // already handles IndexedDB via getDocFromCache(). A fromCache=true
        // snapshot fired mid-session is stale local state that would revert
        // optimistic deletes/removes before Firestore confirms the write.
        if (snap.metadata.fromCache) return

        const data = snap.data()
        _cache[docName] = data       // keep cache fresh
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
}

// ─── deleteAllUserData — wipe all docs (account deletion) ───────────────────
/**
 * Permanently deletes all 6 Firestore documents for a user AND all Memory
 * sub-collection documents (sheets + trash).
 * Called from SettingsPanel when the user requests account deletion.
 */
export async function deleteAllUserData(uid) {
  if (!db) return
  await Promise.all([
    ...USER_DOCS.map((docName) => deleteDoc(docRef(uid, docName))),
    deleteAllMemoryData(uid),   // also wipe memory/ and memoryTrash/ sub-collections
  ])
  _cache = {}
}
