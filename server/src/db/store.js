/**
 * store.js — Simple file-based JSON persistence layer.
 * Mirrors EveryDay's server/src/db/store.js exactly.
 *
 * Used by the ClearMyMind server as a local dev cache for server-side
 * operations (settings, admin tasks). Firestore remains the source of truth
 * for all client data.
 *
 * In future, swap read/write here to use MongoDB, SQLite, Postgres, etc.
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH   = path.join(__dirname, 'data.json')

// ── Default shape of the store ──────────────────────────────────────────────
const DEFAULT_STORE = {
  settings: { name: '', noclear: false },
}

// ── Internal in-memory cache ─────────────────────────────────────────────────
let _store = null

/**
 * Initialize store from disk (called once at server start).
 */
export function initStore() {
  if (!fs.existsSync(DB_PATH)) {
    _store = structuredClone(DEFAULT_STORE)
    _flush()
    console.log('[Store] Initialized fresh data.json')
  } else {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf-8')
      _store = { ...structuredClone(DEFAULT_STORE), ...JSON.parse(raw) }
      console.log('[Store] Loaded data.json')
    } catch (err) {
      console.error('[Store] Corrupt data.json — resetting.', err.message)
      _store = structuredClone(DEFAULT_STORE)
      _flush()
    }
  }
}

/**
 * Write in-memory store to disk.
 * @private
 */
function _flush() {
  fs.writeFileSync(DB_PATH, JSON.stringify(_store, null, 2), 'utf-8')
}

/**
 * Get a top-level key from the store.
 * @param {string} key
 */
export function get(key) {
  if (!_store) throw new Error('Store not initialized. Call initStore() first.')
  return _store[key]
}

/**
 * Set a top-level key in the store and persist to disk.
 * @param {string} key
 * @param {*}      value
 */
export function set(key, value) {
  if (!_store) throw new Error('Store not initialized. Call initStore() first.')
  _store[key] = value
  _flush()
}

/**
 * Merge a partial value into an existing key (shallow merge for objects).
 * @param {string} key
 * @param {object} partial
 */
export function merge(key, partial) {
  const existing = _store[key]
  if (typeof existing === 'object' && !Array.isArray(existing)) {
    _store[key] = { ...existing, ...partial }
  } else {
    _store[key] = partial
  }
  _flush()
}

/**
 * Return a full snapshot of the store.
 */
export function snapshot() {
  return structuredClone(_store)
}
