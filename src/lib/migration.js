import { patchUserData } from './db.js'

const MIGRATED_KEY = 'clearmind_migrated'

function safeJSON(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}

// ─── One-time migration: localStorage → Firestore ────────────────────────────
// Returns true if migration ran, false if already done or nothing to migrate.
export async function migrateLocalStorageToFirestore(uid) {
  if (!uid) return false
  if (localStorage.getItem(MIGRATED_KEY) === '1') return false

  // ── Sheets
  const sheets = safeJSON(localStorage.getItem('clearmind_sheets'), null)
    || [{ id: 'sheet-1', name: 'Sheet 1' }]
  const activeSheetId = localStorage.getItem('clearmind_active_sheet') || sheets[0].id

  // ── Names (per sheet)
  const namesBySheet = {}
  sheets.forEach(({ id }) => {
    const key = `clearmind_sheet_${id}_names`
    const arr = safeJSON(localStorage.getItem(key), null)
      ?? safeJSON(localStorage.getItem('clearmind_names'), [])
    if (arr.length) namesBySheet[id] = arr
  })
  // Legacy single-list fallback
  if (!namesBySheet['sheet-1']) {
    const legacy = safeJSON(localStorage.getItem('clearmind_names'), [])
    if (legacy.length) namesBySheet['sheet-1'] = legacy
  }

  // ── Tags (per sheet)
  const tagsBySheet = {}
  sheets.forEach(({ id }) => {
    const key = `clearmind_sheet_${id}_tags`
    const t = safeJSON(localStorage.getItem(key), null)
      ?? safeJSON(localStorage.getItem('clearmind_tags'), {})
    if (Object.keys(t).length) tagsBySheet[id] = t
  })

  // ── Groups (global)
  const groups = safeJSON(localStorage.getItem('clearmind_groups'), {})

  // ── Bag (global)
  const bag = safeJSON(localStorage.getItem('clearmind_bag'), [])

  // ── Profile prefs
  const noclear = localStorage.getItem('clearmind_noclear') !== '0'

  // ── Write to Firestore in parallel
  const writes = [
    patchUserData(uid, 'sheets', { sheets, activeSheetId }),
    patchUserData(uid, 'profile', { noclear }),
  ]
  if (Object.keys(namesBySheet).length) writes.push(patchUserData(uid, 'names', namesBySheet))
  if (Object.keys(tagsBySheet).length)  writes.push(patchUserData(uid, 'tags', tagsBySheet))
  if (Object.keys(groups).length)       writes.push(patchUserData(uid, 'groups', { groups }))
  if (bag.length)                        writes.push(patchUserData(uid, 'bag', { bag }))

  await Promise.all(writes)

  // Mark migration complete (localStorage flag — intentionally kept)
  localStorage.setItem(MIGRATED_KEY, '1')
  console.log('[ClearMyMind] Migration: localStorage → Firestore complete')
  return true
}
