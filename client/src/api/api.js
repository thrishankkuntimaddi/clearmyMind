/**
 * api.js — ClearMyMind Data Facade
 * ==================================
 * A thin semantic API that wraps all Firestore operations.
 * UI code (hooks, components) calls this — never touches db.js directly.
 *
 * ARCHITECTURE (mirrors EveryDay):
 *   App / Hooks
 *      ↓
 *   api.js          ← semantic domain surface (names, sheets, settings, auth)
 *      ↓
 *   lib/db.js       ← raw Firestore read / write / listen (all SDK calls live here)
 *      ↓
 *   Firestore       ← users/{uid}/data/{docName}
 *
 * Adding a new domain? Add a new namespace below. Never import firebase/* here.
 */

import {
  patchUserData,
  fetchAllUserData,
  subscribeToUserData,
  deleteAllUserData,
  USER_DOCS,
} from '../lib/db.js'

// ─── Names ────────────────────────────────────────────────────────────────────

export const names = {
  /**
   * Add a name to a sheet. Returns { ok, reason }.
   * Duplicate check and title-casing are the caller's responsibility
   * so that React optimistic state stays consistent.
   */
  async set(uid, sheetId, nameList) {
    await patchUserData(uid, 'names', { [sheetId]: nameList })
    return { ok: true }
  },
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export const tags = {
  async set(uid, sheetId, tagMap) {
    await patchUserData(uid, 'tags', { [sheetId]: tagMap })
    return { ok: true }
  },
}

// ─── Sheets ───────────────────────────────────────────────────────────────────

export const sheets = {
  async update(uid, sheetList, activeSheetId) {
    await patchUserData(uid, 'sheets', { sheets: sheetList, activeSheetId })
    return { ok: true }
  },

  async switchActive(uid, activeSheetId) {
    await patchUserData(uid, 'sheets', { activeSheetId })
    return { ok: true }
  },
}

// ─── Bag ──────────────────────────────────────────────────────────────────────

export const bag = {
  async set(uid, bagArray) {
    await patchUserData(uid, 'bag', { bag: bagArray })
    return { ok: true }
  },
}

// ─── Groups ───────────────────────────────────────────────────────────────────

export const groups = {
  async set(uid, groupsMap) {
    await patchUserData(uid, 'groups', { groups: groupsMap })
    return { ok: true }
  },
}

// ─── Profile / Prefs ─────────────────────────────────────────────────────────

export const profile = {
  async setNoClear(uid, noclear) {
    await patchUserData(uid, 'profile', { noclear })
    return { ok: true }
  },
}

// ─── Settings ────────────────────────────────────────────────────────────────

export const settings = {
  async update(uid, partial) {
    await patchUserData(uid, 'profile', partial)
    return { ok: true }
  },
}

// ─── Data — full fetch / delete ───────────────────────────────────────────────

export const data = {
  /**
   * Fetch all user documents at once. Used on boot and hard-refresh.
   * Returns { sheets, names, tags, groups, bag, profile } (null if doc missing).
   */
  fetchAll: (uid) => fetchAllUserData(uid),

  /**
   * Delete all user Firestore documents. Used on account deletion.
   */
  deleteAll: (uid) => deleteAllUserData(uid),

  /**
   * Export all user data as a downloadable JSON file.
   */
  async export(uid) {
    const snapshot = await fetchAllUserData(uid)
    snapshot.exportedAt = new Date().toISOString()
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `clearmymind-backup-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
  },
}

// ─── Sync — real-time listener lifecycle ─────────────────────────────────────

export const sync = {
  /**
   * Subscribe to all user docs. onUpdate(docName, data) is called for each
   * server-confirmed remote change (not local echo writes).
   * Returns an unsubscribe function.
   */
  listen: (uid, onUpdate, onError) => subscribeToUserData(uid, onUpdate, onError),
}

// ─── Health ──────────────────────────────────────────────────────────────────

export const health = {
  check: () => Promise.resolve({ status: 'firestore-only', docs: USER_DOCS }),
}

// ─── Default export (namespace object, mirrors EveryDay's api.js pattern) ────

export default { names, tags, sheets, bag, groups, profile, settings, data, sync, health }
