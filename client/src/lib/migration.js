import { patchUserData, fetchAllUserData } from './db.js'

const MIGRATED_KEY = 'clearmind_migrated'

function safeJSON(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}

// ─── One-time migration: localStorage → Firestore ────────────────────────────
// Returns the Firestore data object (either existing cloud data, or newly written).
// This avoids a double-fetch: the caller can use the returned data directly.
//
// KEY INVARIANT: If Firestore already has a `sheets` doc → skip writing.
// This prevents overwriting cloud data with empty localStorage defaults when
// the user logs in on a new browser/device (e.g. fresh GitHub Pages session).
export async function migrateLocalStorageToFirestore(uid) {
  if (!uid) return {}

  // ── Always fetch current Firestore state first ────────────────────────────
  // This serves double duty: (1) skip migration if data already exists,
  // (2) returns data so the caller avoids a redundant second fetch.
  const existing = await fetchAllUserData(uid)

  // Fast path: local flag says already migrated on this device
  if (localStorage.getItem(MIGRATED_KEY) === '1') return existing

  // If cloud data already has sheets, user has real data → don't overwrite it
  if (existing.sheets?.sheets?.length) {
    localStorage.setItem(MIGRATED_KEY, '1')
    console.log('[ClearMyMind] Migration: cloud data exists — skipping local migration')
    return existing
  }

  // ── Nothing in Firestore yet — try to migrate from localStorage ───────────
  const sheets = safeJSON(localStorage.getItem('clearmind_sheets'), null)
    || [{ id: 'sheet-1', name: 'Sheet 1' }]
  const activeSheetId = localStorage.getItem('clearmind_active_sheet') || sheets[0].id

  // Names (per sheet)
  const namesBySheet = {}
  sheets.forEach(({ id }) => {
    const key = `clearmind_sheet_${id}_names`
    const arr = safeJSON(localStorage.getItem(key), null)
      ?? safeJSON(localStorage.getItem('clearmind_names'), [])
    if (arr.length) namesBySheet[id] = arr
  })
  if (!namesBySheet['sheet-1']) {
    const legacy = safeJSON(localStorage.getItem('clearmind_names'), [])
    if (legacy.length) namesBySheet['sheet-1'] = legacy
  }

  // Tags (per sheet)
  const tagsBySheet = {}
  sheets.forEach(({ id }) => {
    const key = `clearmind_sheet_${id}_tags`
    const t = safeJSON(localStorage.getItem(key), null)
      ?? safeJSON(localStorage.getItem('clearmind_tags'), {})
    if (Object.keys(t).length) tagsBySheet[id] = t
  })

  const groups  = safeJSON(localStorage.getItem('clearmind_groups'), {})
  const bag     = safeJSON(localStorage.getItem('clearmind_bag'), [])
  const noclear = localStorage.getItem('clearmind_noclear') !== '0'

  const writes = [
    patchUserData(uid, 'sheets',  { sheets, activeSheetId }),
    patchUserData(uid, 'profile', { noclear }),
  ]
  if (Object.keys(namesBySheet).length) writes.push(patchUserData(uid, 'names', namesBySheet))
  if (Object.keys(tagsBySheet).length)  writes.push(patchUserData(uid, 'tags', tagsBySheet))
  if (Object.keys(groups).length)       writes.push(patchUserData(uid, 'groups', { groups }))
  if (bag.length)                       writes.push(patchUserData(uid, 'bag', { bag }))

  await Promise.all(writes)
  localStorage.setItem(MIGRATED_KEY, '1')
  console.log('[ClearMyMind] Migration: localStorage → Firestore complete')

  // Return what we're about to hydrate so the caller skips a redundant fetch
  return {
    sheets:  { sheets, activeSheetId },
    names:   namesBySheet,
    tags:    tagsBySheet,
    groups:  Object.keys(groups).length ? { groups } : null,
    bag:     bag.length ? { bag } : null,
    profile: { noclear },
  }
}
