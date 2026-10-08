import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  loadUserData, writeFields, subscribeToUserData,
  loadMemoryNames, deleteAllUserData, REMOVE,
} from '../lib/db.js'
import {
  cleanName, cleanSheetName, isValidSheetId, sortNames, mergeNames,
  canTag, MAX_SHEETS, MAX_NAMES_PER_SHEET, MAX_GROUPS, TAG_KEYS,
} from '../utils/validate.js'

const ACTIVE_KEY  = 'cmm_active_sheet'   // device-local: which sheet is open
const SAVE_ERROR  = '⚠️ Data not saved — check your connection and try again.'
const LOAD_ERROR  = '⚠️ Could not load your data. Check your connection and reload.'
const EMPTY_TAGS  = Object.freeze({})

function defaultSheets() {
  return [{ id: 'sheet-1', name: 'Sheet 1' }]
}

function initialState() {
  return {
    sheets: defaultSheets(), activeSheetId: 'sheet-1',
    namesBySheet: {}, tagsBySheet: {}, groups: {}, bag: [], noClear: true,
  }
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

function readGroups(data) {
  const out = {}
  const src = data?.groups && typeof data.groups === 'object' ? data.groups : {}
  for (const [id, g] of Object.entries(src)) {
    if (!isValidSheetId(id) || !g || typeof g.name !== 'string') continue
    out[id] = { name: g.name, members: Array.isArray(g.members) ? g.members.filter((m) => typeof m === 'string') : [] }
  }
  return out
}

function readBag(data) {
  return Array.isArray(data?.bag) ? data.bag.filter((n) => typeof n === 'string') : []
}

function readNoClear(data) {
  return typeof data?.noclear === 'boolean' ? data.noclear : true
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

// ─── Undo the short-lived v2 migration ───────────────────────────────────────
// One deployed build copied Memory Sheets + Bag into regular sheets with ids
// "sheet-m…" and stamped `schema: 2`. Remove those copies — but only when every
// name in them still exists in a Memory Sheet or the Bag, so nothing is lost.
async function undoMigration(uid, sheets, namesBySheet, tagsBySheet, bag) {
  const memNames = await loadMemoryNames(uid)
  const bagNames = new Set(bag.map((n) => n.toLowerCase()))
  const isCopy = (s) => /^sheet-m[0-9a-z]+$/.test(s.id) &&
    (namesBySheet[s.id] ?? []).every((n) => memNames.has(n.toLowerCase()) || bagNames.has(n.toLowerCase()))

  const copies = sheets.filter(isCopy)
  let kept = sheets.filter((s) => !isCopy(s))
  if (!kept.length) kept = defaultSheets()
  const names = { ...namesBySheet }
  const tags  = { ...tagsBySheet }
  if (copies.length) {
    copies.forEach((s) => { delete names[s.id]; delete tags[s.id] })
    const removal = Object.fromEntries(copies.map((s) => [s.id, REMOVE()]))
    if (!(await writeFields(uid, 'names', removal))) throw new Error('names write failed')
    await writeFields(uid, 'tags', removal)
  }
  if (!(await writeFields(uid, 'sheets', { sheets: kept, schema: 3 }))) throw new Error('sheets write failed')
  return { sheets: kept, namesBySheet: names, tagsBySheet: tags }
}

// ─── useFirestoreData ─────────────────────────────────────────────────────────
// Owns all session data. State lives in a ref (S) so callbacks can read the
// latest values synchronously; commit() mirrors it into React state.
export function useFirestoreData(uid) {
  const [status, setStatus] = useState('idle')   // idle | loading | ready | error
  const [writeError, setWriteError] = useState(null)
  const [state, setState]   = useState(initialState)
  const S        = useRef(state)
  const uidRef   = useRef(uid)
  const readyRef = useRef(false)

  const clearWriteError = useCallback(() => setWriteError(null), [])

  const commit = useCallback((patch) => {
    S.current = { ...S.current, ...patch }
    setState(S.current)
  }, [])

  // Writes are refused until the initial server read succeeded — this is what
  // prevents a flaky connection from overwriting real data with empty defaults.
  const save = useCallback(async (docName, fields) => {
    if (!uidRef.current || !readyRef.current) return false
    const ok = await writeFields(uidRef.current, docName, fields)
    if (!ok) setWriteError(SAVE_ERROR)
    return ok
  }, [])

  // ─── Boot: reset → load → subscribe ────────────────────────────────────────
  useEffect(() => {
    // Always start from a blank slate so one account's data can never be
    // shown to (or written into) the next account signed in on this device.
    uidRef.current   = uid
    readyRef.current = false
    commit(initialState())
    setWriteError(null)
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
        if (!cancelled) { setStatus('error'); setWriteError(LOAD_ERROR) }
        return
      }
      if (cancelled) return

      let sheets       = readSheets(data.sheets)
      let namesBySheet = readNames(data.names)
      let tagsBySheet  = readTags(data.tags)
      const bag        = readBag(data.bag)

      if (data.sheets?.schema === 2) {
        try {
          ;({ sheets, namesBySheet, tagsBySheet } = await undoMigration(uid, sheets, namesBySheet, tagsBySheet, bag))
        } catch (e) {
          console.error('[ClearMyMind] migration cleanup failed:', e.message ?? e.code)
        }
        if (cancelled) return
      }

      const preferred = [readActive(), data.sheets?.activeSheetId]
      const activeSheetId = preferred.find((id) => sheets.some((s) => s.id === id)) ?? sheets[0].id
      commit({
        sheets, activeSheetId, namesBySheet, tagsBySheet, bag,
        groups: readGroups(data.groups), noClear: readNoClear(data.profile),
      })
      readyRef.current = true
      setStatus('ready')

      unsub = subscribeToUserData(uid, (docName, d) => {
        switch (docName) {
          case 'sheets': {
            const list   = readSheets(d)
            const active = list.some((s) => s.id === S.current.activeSheetId) ? S.current.activeSheetId : list[0].id
            commit({ sheets: list, activeSheetId: active })
            break
          }
          case 'names':   commit({ namesBySheet: readNames(d) }); break
          case 'tags':    commit({ tagsBySheet: readTags(d) }); break
          case 'groups':  commit({ groups: readGroups(d) }); break
          case 'bag':     commit({ bag: readBag(d) }); break
          case 'profile': commit({ noClear: readNoClear(d) }); break
        }
      })
    })()

    return () => {
      cancelled        = true
      readyRef.current = false
      unsub()
    }
  }, [uid, commit])

  // ─── Low-level setters ─────────────────────────────────────────────────────
  const putNames = useCallback((sid, list) => {
    commit({ namesBySheet: { ...S.current.namesBySheet, [sid]: list } })
    save('names', { [sid]: list })
  }, [commit, save])

  const putTags = useCallback((sid, map) => {
    commit({ tagsBySheet: { ...S.current.tagsBySheet, [sid]: map } })
    save('tags', { [sid]: map })
  }, [commit, save])

  const putGroups = useCallback((groups) => {
    commit({ groups })
    save('groups', { groups })
  }, [commit, save])

  const putBag = useCallback((bag) => {
    commit({ bag })
    save('bag', { bag })
  }, [commit, save])

  // Rename/remove a name inside every group
  const mapGroupMembers = useCallback((fn) => {
    const next = {}
    for (const [id, g] of Object.entries(S.current.groups)) next[id] = { ...g, members: fn(g.members) }
    putGroups(next)
  }, [putGroups])

  // ═══════════════════════════════════════════════════════════════════════════
  // NAMES
  // ═══════════════════════════════════════════════════════════════════════════
  /** Add many names to the active sheet in ONE write. Returns how many were added. */
  const addNames = useCallback((rawList) => {
    if (!readyRef.current) return 0
    const sid = S.current.activeSheetId
    const cur = S.current.namesBySheet[sid] ?? []
    if (cur.length >= MAX_NAMES_PER_SHEET) {
      setWriteError(`This sheet is full (${MAX_NAMES_PER_SHEET} names) — start a new sheet.`)
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
    mapGroupMembers((m) => m.map((n) => (n === oldName ? newName : n)))
    return true
  }, [putNames, putTags, mapGroupMembers])

  const removeName = useCallback((name) => {
    if (!readyRef.current) return
    const sid = S.current.activeSheetId
    putNames(sid, (S.current.namesBySheet[sid] ?? []).filter((n) => n !== name))
    const tags = S.current.tagsBySheet[sid] ?? {}
    if (tags[name]) {
      const { [name]: _drop, ...rest } = tags
      putTags(sid, rest)
    }
    if (Object.values(S.current.groups).some((g) => g.members.includes(name))) {
      mapGroupMembers((m) => m.filter((n) => n !== name))
    }
  }, [putNames, putTags, mapGroupMembers])

  /** Clear the active sheet's names + colours. Returns what was removed (for Undo). */
  const clearAll = useCallback(() => {
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
  // BAG
  // ═══════════════════════════════════════════════════════════════════════════
  const addToBag = useCallback((name) => {
    if (!readyRef.current) return
    const n = cleanName(name)
    if (!n || S.current.bag.includes(n) || S.current.bag.length >= MAX_NAMES_PER_SHEET) return
    putBag([...S.current.bag, n])
  }, [putBag])

  const removeFromBag = useCallback((name) => {
    if (!readyRef.current) return
    putBag(S.current.bag.filter((n) => n !== name))
  }, [putBag])

  const clearBag = useCallback(() => {
    if (!readyRef.current) return
    putBag([])
  }, [putBag])

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUPS (global across sheets)
  // ═══════════════════════════════════════════════════════════════════════════
  const createGroup = useCallback((rawName) => {
    if (!readyRef.current) return null
    const name = cleanSheetName(rawName)
    if (!name) return null
    if (Object.keys(S.current.groups).length >= MAX_GROUPS) {
      setWriteError(`You can have up to ${MAX_GROUPS} groups.`)
      return null
    }
    const id = `g-${Date.now()}`
    putGroups({ ...S.current.groups, [id]: { name, members: [] } })
    return id
  }, [putGroups])

  const renameGroup = useCallback((id, rawName) => {
    const g = S.current.groups[id]
    const name = cleanSheetName(rawName)
    if (!readyRef.current || !g || !name) return
    putGroups({ ...S.current.groups, [id]: { ...g, name } })
  }, [putGroups])

  const deleteGroup = useCallback((id) => {
    if (!readyRef.current || !S.current.groups[id]) return
    const { [id]: _drop, ...rest } = S.current.groups
    putGroups(rest)
  }, [putGroups])

  const addToGroup = useCallback((groupId, name) => {
    const g = S.current.groups[groupId]
    if (!readyRef.current || !g || typeof name !== 'string' || g.members.includes(name)) return
    if (g.members.length >= MAX_NAMES_PER_SHEET) return
    putGroups({ ...S.current.groups, [groupId]: { ...g, members: [...g.members, name] } })
  }, [putGroups])

  const removeFromGroup = useCallback((groupId, name) => {
    const g = S.current.groups[groupId]
    if (!readyRef.current || !g) return
    putGroups({ ...S.current.groups, [groupId]: { ...g, members: g.members.filter((n) => n !== name) } })
  }, [putGroups])

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
      setWriteError(`You can have up to ${MAX_SHEETS} sheets.`)
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
    save('names',  { [id]: REMOVE() })   // no orphaned keys left in Firestore
    save('tags',   { [id]: REMOVE() })
  }, [commit, save])

  /** Move a name between sheets — carries its colour, drops it from groups. */
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
    if (Object.values(S.current.groups).some((g) => g.members.includes(name))) {
      mapGroupMembers((m) => m.filter((n) => n !== name))
    }
    return { ok: true }
  }, [commit, save, mapGroupMembers])

  // ═══════════════════════════════════════════════════════════════════════════
  // PREFS
  // ═══════════════════════════════════════════════════════════════════════════
  const toggleNoClear = useCallback(() => {
    if (!readyRef.current) return
    const next = !S.current.noClear
    commit({ noClear: next })
    save('profile', { noclear: next })
  }, [commit, save])

  /** Settings → Reset: every sheet's names + colours, plus bag and groups. */
  const clearEverything = useCallback(() => {
    if (!readyRef.current) return
    const empty = Object.fromEntries(S.current.sheets.map((s) => [s.id, []]))
    const emptyTags = Object.fromEntries(S.current.sheets.map((s) => [s.id, {}]))
    commit({ namesBySheet: empty, tagsBySheet: emptyTags })
    save('names', empty)
    save('tags', emptyTags)
    putBag([])
    putGroups({})
  }, [commit, save, putBag, putGroups])

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

      const present = new Set(merged)
      const kept    = Object.fromEntries(
        Object.entries(parsed.tagsBySheet[snapSheet.id] ?? {})
          .map(([n, c]) => [cleanName(n), c]).filter(([n]) => present.has(n)),
      )
      tagsBySheet[id] = tagsPatch[id] = { ...(tagsBySheet[id] ?? {}), ...kept }
      colors += Object.keys(kept).length
      sheetsRestored++
    }

    commit({ sheets, namesBySheet, tagsBySheet })
    save('sheets', { sheets })
    save('names', namesPatch)
    save('tags', tagsPatch)

    // Groups: merge by name
    const groups = { ...S.current.groups }
    let gi = 0
    for (const g of Object.values(parsed.groups)) {
      const existing = Object.entries(groups).find(([, eg]) => eg.name === g.name)
      if (existing) {
        const [eid, eg] = existing
        groups[eid] = { ...eg, members: [...new Set([...eg.members, ...g.members])] }
      } else if (Object.keys(groups).length < MAX_GROUPS) {
        groups[`g-snap-${Date.now()}-${gi++}`] = { name: g.name, members: [...g.members] }
      }
    }
    if (Object.keys(parsed.groups).length) putGroups(groups)

    // Bag: merge
    const bagSet = new Set(S.current.bag)
    const bag = [...S.current.bag, ...parsed.bag.filter((n) => !bagSet.has(n))].slice(0, MAX_NAMES_PER_SHEET)
    if (parsed.bag.length) putBag(bag)

    return { sheetsRestored, totalNames, colors, groups: Object.keys(parsed.groups).length, bag: parsed.bag.length }
  }, [commit, save, putGroups, putBag])

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE EVERYTHING (account deletion)
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
  const { sheets, activeSheetId, namesBySheet, tagsBySheet, groups, bag, noClear } = state
  const names = useMemo(() => sortNames(namesBySheet[activeSheetId] ?? []), [namesBySheet, activeSheetId])
  const tags  = tagsBySheet[activeSheetId] ?? EMPTY_TAGS

  return {
    status, writeError, clearWriteError,
    sheets, activeSheetId, namesBySheet, tagsBySheet,
    switchSheet, addSheet, renameSheet, deleteSheet, moveNameToSheet,
    names, addName, addNames, editName, removeName, clearAll, restoreCleared, clearEverything,
    tags, setTag, clearTags,
    bag, addToBag, removeFromBag, clearBag,
    groups, createGroup, renameGroup, deleteGroup, addToGroup, removeFromGroup,
    noClear, toggleNoClear,
    restoreFullSnapshot, deleteAllData,
  }
}
