import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  loadUserData, writeFields, subscribeToUserData,
  loadLegacyData, deleteAllUserData, REMOVE,
} from '../lib/db.js'
import {
  cleanName, cleanSheetName, isValidSheetId, sortNames, mergeNames,
  canTag, MAX_SHEETS, MAX_NAMES_PER_SHEET, TAG_KEYS,
} from '../utils/validate.js'

const ACTIVE_KEY  = 'cmm_active_sheet'   // device-local: which sheet is open
const SAVE_ERROR  = '⚠️ Not saved — check your connection and try again.'
const LOAD_ERROR  = '⚠️ Could not load your data. Check your connection and reload.'
const EMPTY_TAGS  = Object.freeze({})

function defaultSheets() {
  return [{ id: 'sheet-1', name: 'Sheet 1' }]
}

function initialState() {
  return { sheets: defaultSheets(), activeSheetId: 'sheet-1', namesBySheet: {}, tagsBySheet: {} }
}

// ─── Defensive readers: accept only well-formed data from Firestore ──────────
function stripMeta(data) {
  if (!data) return {}
  const { updatedAt: _u, ...rest } = data
  return rest
}

function readSheets(data) {
  const list = Array.isArray(data?.sheets)
    ? data.sheets.filter((s) => s && isValidSheetId(s.id) && typeof s.name === 'string')
    : []
  return list.length ? list : defaultSheets()
}

function readNames(data) {
  const out = {}
  for (const [sid, list] of Object.entries(stripMeta(data))) {
    if (isValidSheetId(sid) && Array.isArray(list)) out[sid] = list.filter((n) => typeof n === 'string')
  }
  return out
}

function readTags(data) {
  const out = {}
  for (const [sid, map] of Object.entries(stripMeta(data))) {
    if (!isValidSheetId(sid) || !map || typeof map !== 'object') continue
    out[sid] = Object.fromEntries(Object.entries(map).filter(([n, c]) => canTag(n) && TAG_KEYS.includes(c)))
  }
  return out
}

function readActive() {
  try { return localStorage.getItem(ACTIVE_KEY) } catch { return null }
}
function saveActive(id) {
  try { localStorage.setItem(ACTIVE_KEY, id) } catch { /* storage unavailable */ }
}
export function clearLocalPrefs() {
  try { localStorage.removeItem(ACTIVE_KEY) } catch { /* storage unavailable */ }
}

function uniqueSheetName(base, sheets) {
  const taken = new Set(sheets.map((s) => s.name.toLowerCase()))
  const root  = cleanSheetName(base) || 'Sheet'
  let name = root
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${root} (${i})`
  return name
}

// ─── One-time migration from v1 (Bag + Memory Sheets → regular sheets) ───────
// Legacy documents are left untouched, so nothing is lost if this is rolled back.
async function migrateLegacy(uid, sheets, namesBySheet) {
  const { bag, memorySheets } = await loadLegacyData(uid)
  const nextSheets = [...sheets]
  const nextNames  = { ...namesBySheet }
  const added      = {}
  const stamp      = Date.now().toString(36)

  const addSheet = (base, list, i) => {
    if (nextSheets.length >= MAX_SHEETS) return
    const merged = mergeNames([], list)
    if (!merged.length) return
    const id = `sheet-m${stamp}${i}`
    nextSheets.push({ id, name: uniqueSheetName(base, nextSheets) })
    nextNames[id] = merged
    added[id]     = merged
  }
  addSheet('Bag', bag, 0)
  memorySheets.forEach((m, i) => addSheet(m.name || 'Memory', m.names, i + 1))

  if (Object.keys(added).length && !(await writeFields(uid, 'names', added))) {
    throw new Error('migration: names write failed')
  }
  if (!(await writeFields(uid, 'sheets', { sheets: nextSheets, schema: 2 }))) {
    throw new Error('migration: sheets write failed')
  }
  return { sheets: nextSheets, namesBySheet: nextNames }
}

// ─── useFirestoreData ─────────────────────────────────────────────────────────
// Owns all app data. State lives in a ref (S) so callbacks can read the latest
// values synchronously; commit() mirrors it into React state for rendering.
export function useFirestoreData(uid) {
  const [status, setStatus] = useState('idle')   // idle | loading | ready | error
  const [error, setError]   = useState(null)
  const [state, setState]   = useState(initialState)
  const S        = useRef(state)
  const uidRef   = useRef(uid)
  const readyRef = useRef(false)

  const clearError = useCallback(() => setError(null), [])

  const commit = useCallback((patch) => {
    S.current = { ...S.current, ...patch }
    setState(S.current)
  }, [])

  // Writes are refused until the initial server read succeeded — this is what
  // prevents a flaky connection from overwriting real data with empty defaults.
  const save = useCallback(async (docName, fields) => {
    if (!uidRef.current || !readyRef.current) return false
    const ok = await writeFields(uidRef.current, docName, fields)
    if (!ok) setError(SAVE_ERROR)
    return ok
  }, [])

  // ─── Boot: reset → load → migrate → subscribe ──────────────────────────────
  useEffect(() => {
    // Always start from a blank slate so one account's data can never be
    // shown to (or written into) the next account signed in on this device.
    uidRef.current   = uid
    readyRef.current = false
    commit(initialState())
    setError(null)
    if (!uid) { setStatus('idle'); return }
    setStatus('loading')

    let cancelled = false
    let unsub     = () => {}

    ;(async () => {
      let data
      try {
        data = await loadUserData(uid)
      } catch (e) {
        console.error('[ClearMyMind] load failed:', e.code)
        if (!cancelled) { setStatus('error'); setError(LOAD_ERROR) }
        return
      }
      if (cancelled) return

      let sheets       = readSheets(data.sheets)
      let namesBySheet = readNames(data.names)
      const tagsBySheet = readTags(data.tags)

      if ((data.sheets?.schema ?? 0) < 2) {
        try {
          ;({ sheets, namesBySheet } = await migrateLegacy(uid, sheets, namesBySheet))
        } catch (e) {
          // Non-fatal: the app works without it and it retries on next load.
          console.error('[ClearMyMind] migration failed:', e.message ?? e.code)
        }
        if (cancelled) return
      }

      const preferred = [readActive(), data.sheets?.activeSheetId]
      const activeSheetId = preferred.find((id) => sheets.some((s) => s.id === id)) ?? sheets[0].id
      commit({ sheets, activeSheetId, namesBySheet, tagsBySheet })
      readyRef.current = true
      setStatus('ready')

      unsub = subscribeToUserData(uid, (docName, d) => {
        if (docName === 'sheets') {
          const list   = readSheets(d)
          const active = list.some((s) => s.id === S.current.activeSheetId) ? S.current.activeSheetId : list[0].id
          commit({ sheets: list, activeSheetId: active })
        } else if (docName === 'names') {
          commit({ namesBySheet: readNames(d) })
        } else if (docName === 'tags') {
          commit({ tagsBySheet: readTags(d) })
        }
      })
    })()

    return () => {
      cancelled        = true
      readyRef.current = false
      unsub()
    }
  }, [uid, commit])

  // ─── Low-level per-sheet setters ───────────────────────────────────────────
  const putNames = useCallback((sid, list) => {
    commit({ namesBySheet: { ...S.current.namesBySheet, [sid]: list } })
    save('names', { [sid]: list })
  }, [commit, save])

  const putTags = useCallback((sid, map) => {
    commit({ tagsBySheet: { ...S.current.tagsBySheet, [sid]: map } })
    save('tags', { [sid]: map })
  }, [commit, save])

  // ═══════════════════════════════════════════════════════════════════════════
  // NAMES
  // ═══════════════════════════════════════════════════════════════════════════
  /** Add many names to the active sheet in ONE write. Returns how many were added. */
  const addNames = useCallback((rawList) => {
    if (!readyRef.current) return 0
    const sid = S.current.activeSheetId
    const cur = S.current.namesBySheet[sid] ?? []
    if (cur.length >= MAX_NAMES_PER_SHEET) {
      setError(`This sheet is full (${MAX_NAMES_PER_SHEET} names) — start a new sheet.`)
      return 0
    }
    const next  = mergeNames(cur, rawList)
    const added = next.length - cur.length
    if (added > 0) putNames(sid, next)
    return added
  }, [putNames])

  const addName = useCallback((raw) => addNames([raw]) > 0, [addNames])

  const editName = useCallback((oldName, raw) => {
    if (!readyRef.current) return false
    const newName = cleanName(raw)
    if (!newName || newName === oldName) return false
    const sid = S.current.activeSheetId
    const cur = S.current.namesBySheet[sid] ?? []
    if (cur.some((n) => n !== oldName && n.toLowerCase() === newName.toLowerCase())) return false
    putNames(sid, sortNames(cur.map((n) => (n === oldName ? newName : n))))

    const tags = S.current.tagsBySheet[sid] ?? {}
    if (tags[oldName]) {
      const { [oldName]: color, ...rest } = tags
      putTags(sid, { ...rest, [newName]: color })
    }
    return true
  }, [putNames, putTags])

  const removeName = useCallback((name) => {
    if (!readyRef.current) return
    const sid = S.current.activeSheetId
    putNames(sid, (S.current.namesBySheet[sid] ?? []).filter((n) => n !== name))
    const tags = S.current.tagsBySheet[sid] ?? {}
    if (tags[name]) {
      const { [name]: _drop, ...rest } = tags
      putTags(sid, rest)
    }
  }, [putNames, putTags])

  /** Clear the active sheet. Returns what was removed so the caller can offer Undo. */
  const clearSheet = useCallback(() => {
    if (!readyRef.current) return null
    const sid     = S.current.activeSheetId
    const removed = { sheetId: sid, names: S.current.namesBySheet[sid] ?? [], tags: S.current.tagsBySheet[sid] ?? {} }
    putNames(sid, [])
    if (Object.keys(removed.tags).length) putTags(sid, {})
    return removed
  }, [putNames, putTags])

  const restoreCleared = useCallback((removed) => {
    if (!readyRef.current || !removed) return
    const { sheetId, names, tags } = removed
    if (!S.current.sheets.some((s) => s.id === sheetId)) return
    putNames(sheetId, mergeNames(S.current.namesBySheet[sheetId] ?? [], names))
    if (Object.keys(tags).length) putTags(sheetId, { ...tags, ...(S.current.tagsBySheet[sheetId] ?? {}) })
  }, [putNames, putTags])

  // ═══════════════════════════════════════════════════════════════════════════
  // TAGS (colours)
  // ═══════════════════════════════════════════════════════════════════════════
  const setTag = useCallback((name, colorKey) => {
    if (!readyRef.current) return
    if (!canTag(name) || (colorKey && !TAG_KEYS.includes(colorKey))) return
    const sid  = S.current.activeSheetId
    const next = { ...(S.current.tagsBySheet[sid] ?? {}) }
    if (colorKey) next[name] = colorKey
    else delete next[name]
    putTags(sid, next)
  }, [putTags])

  const clearTags = useCallback(() => {
    if (!readyRef.current) return
    putTags(S.current.activeSheetId, {})
  }, [putTags])

  // ═══════════════════════════════════════════════════════════════════════════
  // SHEETS
  // ═══════════════════════════════════════════════════════════════════════════
  const switchSheet = useCallback((id) => {
    if (!S.current.sheets.some((s) => s.id === id)) return
    commit({ activeSheetId: id })
    saveActive(id)
  }, [commit])

  const addSheet = useCallback(() => {
    if (!readyRef.current) return null
    const cur = S.current.sheets
    if (cur.length >= MAX_SHEETS) {
      setError(`You can have up to ${MAX_SHEETS} sheets.`)
      return null
    }
    const id   = `sheet-${Date.now()}`
    const next = [...cur, { id, name: uniqueSheetName(`Sheet ${cur.length + 1}`, cur) }]
    commit({ sheets: next, activeSheetId: id })
    saveActive(id)
    save('sheets', { sheets: next })
    return id
  }, [commit, save])

  const renameSheet = useCallback((id, raw) => {
    if (!readyRef.current) return
    const name = cleanSheetName(raw)
    if (!name) return
    const next = S.current.sheets.map((s) => (s.id === id ? { ...s, name } : s))
    commit({ sheets: next })
    save('sheets', { sheets: next })
  }, [commit, save])

  const deleteSheet = useCallback((id) => {
    if (!readyRef.current) return
    const prev = S.current.sheets
    if (prev.length <= 1) return
    const next   = prev.filter((s) => s.id !== id)
    const active = S.current.activeSheetId === id ? next[0].id : S.current.activeSheetId
    const { [id]: _n, ...names } = S.current.namesBySheet
    const { [id]: _t, ...tags }  = S.current.tagsBySheet
    commit({ sheets: next, activeSheetId: active, namesBySheet: names, tagsBySheet: tags })
    saveActive(active)
    save('sheets', { sheets: next })
    save('names',  { [id]: REMOVE() })
    save('tags',   { [id]: REMOVE() })
  }, [commit, save])

  /** Move a name (and its colour) between sheets. */
  const moveNameToSheet = useCallback((name, fromId, toId) => {
    if (!readyRef.current) return { ok: false, reason: 'not-ready' }
    if (fromId === toId) return { ok: false, reason: 'same-sheet' }
    const from = S.current.namesBySheet[fromId] ?? []
    const to   = S.current.namesBySheet[toId]   ?? []
    if (!from.includes(name)) return { ok: false, reason: 'not-found' }
    if (to.some((n) => n.toLowerCase() === name.toLowerCase())) return { ok: false, reason: 'duplicate' }
    if (to.length >= MAX_NAMES_PER_SHEET) return { ok: false, reason: 'full' }

    const namesBySheet = { ...S.current.namesBySheet, [fromId]: from.filter((n) => n !== name), [toId]: sortNames([...to, name]) }
    commit({ namesBySheet })
    save('names', { [fromId]: namesBySheet[fromId], [toId]: namesBySheet[toId] })

    const fromTags = S.current.tagsBySheet[fromId] ?? {}
    if (fromTags[name]) {
      const { [name]: color, ...rest } = fromTags
      const toTags = { ...(S.current.tagsBySheet[toId] ?? {}), [name]: color }
      commit({ tagsBySheet: { ...S.current.tagsBySheet, [fromId]: rest, [toId]: toTags } })
      save('tags', { [fromId]: rest, [toId]: toTags })
    }
    return { ok: true }
  }, [commit, save])

  // ═══════════════════════════════════════════════════════════════════════════
  // SNAPSHOT RESTORE — merges a parsed (already validated) snapshot
  // ═══════════════════════════════════════════════════════════════════════════
  const restoreFullSnapshot = useCallback((parsed) => {
    if (!readyRef.current) return null
    const sheets       = [...S.current.sheets]
    const namesBySheet = { ...S.current.namesBySheet }
    const tagsBySheet  = { ...S.current.tagsBySheet }
    const namesPatch = {}
    const tagsPatch  = {}
    let sheetsRestored = 0, totalNames = 0, colors = 0

    for (const snapSheet of parsed.sheets) {
      let target = sheets.find((s) => s.id === snapSheet.id)
      if (!target) {
        if (sheets.length >= MAX_SHEETS) break
        target = { id: snapSheet.id, name: uniqueSheetName(snapSheet.name, sheets) }
        sheets.push(target)
      }
      const id     = target.id
      const before = namesBySheet[id] ?? []
      const merged = mergeNames(before, parsed.namesBySheet[snapSheet.id] ?? [])
      namesBySheet[id] = namesPatch[id] = merged
      totalNames += merged.length - before.length

      const incoming = parsed.tagsBySheet[snapSheet.id] ?? {}
      const present  = new Set(merged)
      const kept     = Object.fromEntries(
        Object.entries(incoming).map(([n, c]) => [cleanName(n), c]).filter(([n]) => present.has(n)),
      )
      tagsBySheet[id] = tagsPatch[id] = { ...(tagsBySheet[id] ?? {}), ...kept }
      colors += Object.keys(kept).length
      sheetsRestored++
    }

    commit({ sheets, namesBySheet, tagsBySheet })
    save('sheets', { sheets })
    save('names', namesPatch)
    save('tags', tagsPatch)
    return { sheetsRestored, totalNames, colors }
  }, [commit, save])

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE EVERYTHING (Settings)
  // ═══════════════════════════════════════════════════════════════════════════
  const deleteAllData = useCallback(async () => {
    if (!uidRef.current) return false
    try {
      await deleteAllUserData(uidRef.current)
    } catch (e) {
      console.error('[ClearMyMind] delete failed:', e.code)
      return false
    }
    commit(initialState())
    clearLocalPrefs()
    return true
  }, [commit])

  // ─── Derived values for the active sheet ───────────────────────────────────
  const { sheets, activeSheetId, namesBySheet, tagsBySheet } = state
  const names = useMemo(() => sortNames(namesBySheet[activeSheetId] ?? []), [namesBySheet, activeSheetId])
  const tags  = tagsBySheet[activeSheetId] ?? EMPTY_TAGS

  return {
    status, error, clearError,
    sheets, activeSheetId, namesBySheet, tagsBySheet,
    switchSheet, addSheet, renameSheet, deleteSheet, moveNameToSheet,
    names, addName, addNames, editName, removeName, clearSheet, restoreCleared,
    tags, setTag, clearTags,
    restoreFullSnapshot, deleteAllData,
  }
}
