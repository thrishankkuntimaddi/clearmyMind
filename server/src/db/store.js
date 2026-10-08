/**
 * store.js — Simple file-based JSON persistence, keyed by Firebase uid.
 *
 * Shape on disk:  { users: { [uid]: { name, noclear } } }
 *
 * Firestore remains the source of truth for all client data; this is only
 * for server-side preferences. data.json holds per-user data, so it is
 * git-ignored and written with owner-only permissions.
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH   = process.env.STORE_PATH || path.join(__dirname, 'data.json')

const DEFAULT_SETTINGS = Object.freeze({ name: '', noclear: false })
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/

let _store = null

export function initStore() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    // Files from the old single-user shape ({ settings }) are dropped: that
    // data was shared by every caller and can't be attributed to anyone.
    // Prototype-free map: a uid can never reach Object.prototype
    _store = { users: Object.assign(Object.create(null), parsed?.users && typeof parsed.users === 'object' ? parsed.users : {}) }
    console.log('[Store] Loaded data store')
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[Store] Unreadable data store — starting empty:', err.message)
    _store = { users: Object.create(null) }
    _flush()
  }
}

// Write to a temp file then rename, so a crash mid-write can't corrupt the store
function _flush() {
  const tmp = `${DB_PATH}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(_store, null, 2), { encoding: 'utf-8', mode: 0o600 })
  fs.renameSync(tmp, DB_PATH)
}

function _check(uid) {
  if (!_store) throw new Error('Store not initialized. Call initStore() first.')
  if (typeof uid !== 'string' || !UID_RE.test(uid)) throw new Error('Invalid uid')
}

/** The user's settings (defaults if none saved). */
export function getUser(uid) {
  _check(uid)
  return { ...DEFAULT_SETTINGS, ...(Object.hasOwn(_store.users, uid) ? _store.users[uid] : {}) }
}

/** Shallow-merge validated fields into the user's settings; returns the result. */
export function mergeUser(uid, partial) {
  _check(uid)
  _store.users[uid] = { ...getUser(uid), ...partial }
  _flush()
  return _store.users[uid]
}

export function deleteUser(uid) {
  _check(uid)
  delete _store.users[uid]
  _flush()
}
