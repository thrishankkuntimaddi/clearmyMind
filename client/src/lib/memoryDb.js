/**
 * memoryDb.js — ClearMyMind Memory Sheets Data Layer
 * ====================================================
 * ALL Firestore operations for the Memory Sheets feature live here.
 *
 * DATA MODEL:
 *   users/{uid}/memory/{sheetId}
 *     name: string
 *     names: string[]
 *     createdAt: Timestamp
 *     updatedAt: Timestamp
 *     _v1: string[]   (version backup — previous names array)
 *     _v2: string[]   (version backup — names array before _v1)
 *
 *   users/{uid}/memoryTrash/{sheetId}
 *     name: string
 *     names: string[]
 *     deletedAt: Timestamp
 *     originalId: string
 *
 * PERSISTENCE GUARANTEE:
 *   Memory Sheets are NEVER touched by:
 *     - blast animation
 *     - session clearAll / clearEverything
 *     - auto-wipe timeout
 *   They are only modified by explicit user action via this module.
 *
 * PUBLIC API:
 *   upsertMemorySheet(uid, sheetId, name, names)
 *   patchMemoryNames(uid, sheetId, names)  — with auto-versioning
 *   softDeleteMemorySheet(uid, sheetId)    — moves to trash
 *   restoreFromTrash(uid, trashId)
 *   permanentlyDeleteTrash(uid, trashId)
 *   purgeOldTrash(uid)                     — removes items > 30 days old
 *   fetchAllMemorySheets(uid)
 *   fetchTrash(uid)
 *   subscribeMemorySheets(uid, onUpdate)
 *   subscribeTrash(uid, onUpdate)
 *   exportMemoryJSON(memSheets)
 *   exportMemoryCSV(memSheets)
 */

import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, serverTimestamp, getDocs, getDoc, Timestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'

// ─── Path helpers ─────────────────────────────────────────────────────────────
function memColRef(uid)        { return collection(db, `users/${uid}/memory`) }
function memDocRef(uid, id)    { return doc(db, `users/${uid}/memory/${id}`) }
function trashColRef(uid)      { return collection(db, `users/${uid}/memoryTrash`) }
function trashDocRef(uid, id)  { return doc(db, `users/${uid}/memoryTrash/${id}`) }

// ─── TRASH TTL ────────────────────────────────────────────────────────────────
const TRASH_TTL_DAYS = 30

// ─── upsertMemorySheet — create or rename a memory sheet ─────────────────────
/**
 * Creates a new sheet or updates its name only (does not overwrite names).
 * Use patchMemoryNames to update the names array.
 */
export async function upsertMemorySheet(uid, sheetId, name) {
  if (!uid || !db) return false
  try {
    await setDoc(memDocRef(uid, sheetId), {
      name,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),   // merge:true — only writes if field absent
    }, { merge: true })
    return true
  } catch (e) {
    console.error('[CMM] upsertMemorySheet failed:', e.code, e.message)
    return false
  }
}

// ─── patchMemoryNames — update names array, rotate version history ─────────
/**
 * Updates the names array for a sheet.
 * Rotates previous version into _v1 (and _v1 → _v2) before writing,
 * giving the user a "restore previous version" option.
 *
 * Version slot layout:
 *   current = names[]   (live)
 *   _v1     = previous names snapshot
 *   _v2     = snapshot before _v1 (oldest kept)
 */
export async function patchMemoryNames(uid, sheetId, newNames) {
  if (!uid || !db) return false
  try {
    // Read current to rotate versions
    const snap = await getDoc(memDocRef(uid, sheetId))
    const current = snap.exists() ? snap.data() : {}
    const v1 = current.names    ?? []
    const v2 = current._v1      ?? []

    await setDoc(memDocRef(uid, sheetId), {
      names:     newNames,
      _v1:       v1,
      _v2:       v2,
      updatedAt: serverTimestamp(),
    }, { merge: true })
    return true
  } catch (e) {
    console.error('[CMM] patchMemoryNames failed:', e.code, e.message)
    return false
  }
}

// ─── restoreVersion — roll back to _v1 ───────────────────────────────────────
export async function restoreVersion(uid, sheetId) {
  if (!uid || !db) return null
  try {
    const snap = await getDoc(memDocRef(uid, sheetId))
    if (!snap.exists()) return null
    const { _v1 = [], _v2 = [] } = snap.data()
    if (!_v1.length) return null   // nothing to restore

    await setDoc(memDocRef(uid, sheetId), {
      names:     _v1,
      _v1:       _v2,
      _v2:       [],
      updatedAt: serverTimestamp(),
    }, { merge: true })
    return _v1
  } catch (e) {
    console.error('[CMM] restoreVersion failed:', e.code, e.message)
    return null
  }
}

// ─── softDeleteMemorySheet — move to trash ───────────────────────────────────
/**
 * Moves a memory sheet to the trash sub-collection.
 * The sheet can be restored within TRASH_TTL_DAYS days.
 * This is the ONLY allowed way to delete a memory sheet — never call
 * deleteDoc directly from UI code.
 */
export async function softDeleteMemorySheet(uid, sheetId) {
  if (!uid || !db) return false
  try {
    const snap = await getDoc(memDocRef(uid, sheetId))
    if (!snap.exists()) return false
    const data = snap.data()

    // Write to trash
    const trashId = `trash-${sheetId}-${Date.now()}`
    await setDoc(trashDocRef(uid, trashId), {
      name:       data.name   ?? 'Untitled',
      names:      data.names  ?? [],
      deletedAt:  serverTimestamp(),
      originalId: sheetId,
    })

    // Remove from live memory
    await deleteDoc(memDocRef(uid, sheetId))
    return { trashId }
  } catch (e) {
    console.error('[CMM] softDeleteMemorySheet failed:', e.code, e.message)
    return false
  }
}

// ─── restoreFromTrash — move trashed sheet back to memory ────────────────────
export async function restoreFromTrash(uid, trashId) {
  if (!uid || !db) return false
  try {
    const snap = await getDoc(trashDocRef(uid, trashId))
    if (!snap.exists()) return false
    const { name, names, originalId } = snap.data()

    // Restore to original ID (or create new if collision)
    const targetId = originalId ?? `mem-${Date.now()}`
    await setDoc(memDocRef(uid, targetId), {
      name,
      names: names ?? [],
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true })

    await deleteDoc(trashDocRef(uid, trashId))
    return true
  } catch (e) {
    console.error('[CMM] restoreFromTrash failed:', e.code, e.message)
    return false
  }
}

// ─── permanentlyDeleteTrash ───────────────────────────────────────────────────
export async function permanentlyDeleteTrash(uid, trashId) {
  if (!uid || !db) return false
  try {
    await deleteDoc(trashDocRef(uid, trashId))
    return true
  } catch (e) {
    console.error('[CMM] permanentlyDeleteTrash failed:', e.code, e.message)
    return false
  }
}

// ─── purgeOldTrash — remove trash items older than TRASH_TTL_DAYS ────────────
export async function purgeOldTrash(uid) {
  if (!uid || !db) return
  try {
    const snap = await getDocs(trashColRef(uid))
    const cutoff = Date.now() - TRASH_TTL_DAYS * 24 * 60 * 60 * 1000
    const toDelete = []
    snap.forEach(d => {
      const deletedAt = d.data().deletedAt
      // Firestore Timestamp → ms
      const ms = deletedAt instanceof Timestamp
        ? deletedAt.toMillis()
        : typeof deletedAt === 'number' ? deletedAt : Infinity
      if (ms < cutoff) toDelete.push(d.ref)
    })
    await Promise.all(toDelete.map(ref => deleteDoc(ref)))
  } catch (e) {
    console.warn('[CMM] purgeOldTrash failed:', e.code)
  }
}

// ─── fetchAllMemorySheets — one-time boot fetch ───────────────────────────────
export async function fetchAllMemorySheets(uid) {
  if (!uid || !db) return {}
  try {
    const snap = await getDocs(memColRef(uid))
    const result = {}
    snap.forEach(d => { result[d.id] = d.data() })
    return result
  } catch (e) {
    console.warn('[CMM] fetchAllMemorySheets failed:', e.code)
    return {}
  }
}

// ─── fetchTrash — one-time trash fetch ────────────────────────────────────────
export async function fetchTrash(uid) {
  if (!uid || !db) return {}
  try {
    const snap = await getDocs(trashColRef(uid))
    const result = {}
    snap.forEach(d => { result[d.id] = d.data() })
    return result
  } catch (e) {
    console.warn('[CMM] fetchTrash failed:', e.code)
    return {}
  }
}

// ─── subscribeMemorySheets — real-time listener ───────────────────────────────
export function subscribeMemorySheets(uid, onUpdate) {
  if (!uid || !db) return () => {}
  return onSnapshot(memColRef(uid), (snap) => {
    const sheets = {}
    snap.forEach(d => { sheets[d.id] = d.data() })
    onUpdate(sheets)
  }, (err) => {
    console.error('[CMM] subscribeMemorySheets error:', err.code)
  })
}

// ─── subscribeTrash — real-time trash listener ────────────────────────────────
export function subscribeTrash(uid, onUpdate) {
  if (!uid || !db) return () => {}
  return onSnapshot(trashColRef(uid), (snap) => {
    const items = {}
    snap.forEach(d => { items[d.id] = d.data() })
    onUpdate(items)
  }, (err) => {
    console.error('[CMM] subscribeTrash error:', err.code)
  })
}

// ─── deleteAllMemoryData — used by account deletion only ─────────────────────
/**
 * Permanently deletes ALL memory sheets and trash for a user.
 * Only called from deleteAllUserData (account deletion flow).
 */
export async function deleteAllMemoryData(uid) {
  if (!uid || !db) return
  const [memSnap, trashSnap] = await Promise.all([
    getDocs(memColRef(uid)),
    getDocs(trashColRef(uid)),
  ])
  await Promise.all([
    ...memSnap.docs.map(d => deleteDoc(d.ref)),
    ...trashSnap.docs.map(d => deleteDoc(d.ref)),
  ])
}

// ─── Export utilities ─────────────────────────────────────────────────────────

/**
 * Exports all memory sheets as a formatted JSON string.
 * Includes sheet names, names, and export timestamp.
 */
export function exportMemoryJSON(memSheets) {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'ClearMyMind',
    version: 1,
    sheets: Object.entries(memSheets).map(([id, sheet]) => ({
      id,
      name: sheet.name ?? 'Untitled',
      names: sheet.names ?? [],
      count: (sheet.names ?? []).length,
    })),
  }
  return JSON.stringify(payload, null, 2)
}

/**
 * Exports all memory sheets as a CSV string.
 * Format: Sheet Name, Name
 * One row per name across all sheets.
 */
export function exportMemoryCSV(memSheets) {
  const rows = ['Sheet,Name']
  Object.values(memSheets).forEach(sheet => {
    const sheetName = `"${(sheet.name ?? 'Untitled').replace(/"/g, '""')}"`
    ;(sheet.names ?? []).forEach(name => {
      rows.push(`${sheetName},"${name.replace(/"/g, '""')}"`)
    })
  })
  return rows.join('\n')
}

/**
 * Triggers a browser file download.
 */
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
