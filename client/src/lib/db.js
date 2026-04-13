import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore'
import { db } from './firebase.js'

export const USER_DOCS = ['sheets', 'names', 'tags', 'groups', 'bag', 'profile']

function docRef(uid, docName) {
  return doc(db, `users/${uid}/data/${docName}`)
}

// ─── Write to Firestore (merge) ───────────────────────────────────────────────
export async function patchUserData(uid, docName, partial) {
  if (!uid || !db) return
  try {
    await setDoc(docRef(uid, docName), { ...partial, updatedAt: serverTimestamp() }, { merge: true })
  } catch (e) {
    console.error(`[ClearMyMind] patchUserData(${docName}) failed:`, e.code, e.message)
  }
}

// ─── Initial fetch — reads all 6 user docs at once ───────────────────────────
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
  return results
}

// ─── Real-time subscription ───────────────────────────────────────────────────
// Fires onUpdate(docName, data) for every server-confirmed remote change.
//
// We use includeMetadataChanges so we can distinguish:
//   hasPendingWrites = true  → our own optimistic write echoing back → SKIP
//   hasPendingWrites = false → server has confirmed/sent data        → PROCESS
//
// The caller (useFirestoreData) additionally guards with initCompleteRef so
// that our own seed writes for new users don't echo back and wipe state.
export function subscribeToUserData(uid, onUpdate, onError) {
  if (!db) return () => {}

  const unsubs = USER_DOCS.map((docName) => {
    console.log(`[ClearMyMind] Attaching listener: users/${uid}/data/${docName}`)
    return onSnapshot(
      docRef(uid, docName),
      { includeMetadataChanges: true },
      (snap) => {
        // Skip our own optimistic writes echoing back from the local SDK cache
        if (snap.metadata.hasPendingWrites) return

        // Doc doesn't exist yet — nothing to apply
        if (!snap.exists()) return

        const data = snap.data()
        console.log(`[ClearMyMind] snapshot(${docName}) fromCache=${snap.metadata.fromCache}`)
        onUpdate(docName, data)
      },
      (err) => {
        console.error(`[ClearMyMind] onSnapshot(${docName}) error:`, err.code, err.message)
        onError?.(docName, err)
      }
    )
  })

  return () => unsubs.forEach((u) => u())
}

// ─── Delete all user data docs ───────────────────────────────────────────────
export async function deleteAllUserData(uid) {
  if (!db) return
  await Promise.all(USER_DOCS.map((docName) => deleteDoc(docRef(uid, docName))))
}
