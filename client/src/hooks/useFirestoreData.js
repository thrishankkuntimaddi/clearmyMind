import { useState, useEffect, useRef, useCallback } from 'react'
import { patchUserData, subscribeToUserData, fetchAllUserData } from '../lib/db.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function toTitleCase(str) {
  return str.trim().toLowerCase().replace(/(?:^|\s)\S/g, (ch) => ch.toUpperCase())
}

function sortNames(arr) {
  return [...arr].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

function defaultSheets() {
  return [{ id: 'sheet-1', name: 'Sheet 1' }]
}

// ─── useFirestoreData ─────────────────────────────────────────────────────────
// Single hook that owns ALL app data (replaces useNames, useSheets, useTags,
// useBag, useGroups). Uses refs for synchronous reads inside callbacks so that
// all public functions can return meaningful values without async state reads.
export function useFirestoreData(uid) {
  const [dataReady, setDataReady] = useState(false)

  // ── State + shadow refs (refs let callbacks read current values synchronously)
  const [sheets, _setSheets]               = useState(defaultSheets())
  const sheetsRef                           = useRef(defaultSheets())
  const [activeSheetId, _setActiveSheetId] = useState('sheet-1')
  const activeSheetIdRef                    = useRef('sheet-1')
  const [namesBySheet, _setNamesBySheet]   = useState({})
  const namesBySheetRef                     = useRef({})
  const [tagsBySheet, _setTagsBySheet]     = useState({})
  const tagsBySheetRef                      = useRef({})
  const [groups, _setGroups]               = useState({})
  const groupsRef                           = useRef({})
  const [bag, _setBag]                     = useState([])
  const bagRef                              = useRef([])
  const [noClear, _setNoClear]             = useState(true)

  // Guard: while we are seeding Firestore for a brand-new user, ignore the
  // subscription echoes of our own writes — they would wipe state immediately.
  const initCompleteRef = useRef(false)

  // ── Synced setters — keep ref + state in lockstep ─────────────────────────
  const setSheets         = (v) => { sheetsRef.current        = v; _setSheets(v) }
  const setActiveSheetId  = (v) => { activeSheetIdRef.current = v; _setActiveSheetId(v) }
  const setNamesBySheet   = (v) => { namesBySheetRef.current  = v; _setNamesBySheet(v) }
  const setTagsBySheet    = (v) => { tagsBySheetRef.current   = v; _setTagsBySheet(v) }
  const setGroups         = (v) => { groupsRef.current        = v; _setGroups(v) }
  const setBag            = (v) => { bagRef.current           = v; _setBag(v) }

  // ── patchRef: always points to uid-scoped patch so callbacks don't close over uid
  const patchRef = useRef(null)
  useEffect(() => {
    patchRef.current = uid
      ? (docName, partial) => patchUserData(uid, docName, partial)
      : () => {}
  }, [uid])

  // ─── Hydrate state from fetched Firestore data ────────────────────────────
  // Accepts a multi-doc data object (keyed by doc name) and applies whatever
  // is present. Missing/null docs are skipped — defaults remain in place.
  function hydrateFromFetchedData(data) {
    if (data.sheets?.sheets?.length) {
      const s  = data.sheets.sheets
      const id = data.sheets.activeSheetId || s[0]?.id || 'sheet-1'
      setSheets(s)
      setActiveSheetId(id)
    }
    if (data.names) {
      const { updatedAt: _u, ...rest } = data.names
      if (Object.keys(rest).length) setNamesBySheet(rest)
    }
    if (data.tags) {
      const { updatedAt: _u, ...rest } = data.tags
      if (Object.keys(rest).length) setTagsBySheet(rest)
    }
    if (data.groups?.groups && Object.keys(data.groups.groups).length) {
      setGroups(data.groups.groups)
    }
    if (data.bag?.bag?.length) {
      setBag(data.bag.bag)
    }
    if (typeof data.profile?.noclear === 'boolean') {
      _setNoClear(data.profile.noclear)
    }
  }

  // ─── Handle remote update from onSnapshot ────────────────────────────────
  // Called for every server-confirmed snapshot (hasPendingWrites=false).
  // The server document is authoritative — ALWAYS replace state, never merge.
  // DO NOT guard with length checks — that silently drops clears/empty updates.
  function handleRemoteUpdate(docName, data) {
    // Block subscription echoes until we have finished our own init writes.
    // This prevents our seed writes from bouncing back and wiping state.
    if (!initCompleteRef.current) return

    console.log('[ClearMyMind] REMOTE UPDATE:', docName, data)
    if (!data) return

    switch (docName) {
      case 'sheets': {
        const s       = data.sheets      ?? sheetsRef.current
        const activeId = data.activeSheetId ?? activeSheetIdRef.current
        setSheets(s)
        setActiveSheetId(activeId)
        break
      }
      case 'names': {
        const { updatedAt: _u, ...rest } = data
        setNamesBySheet(rest)
        break
      }
      case 'tags': {
        const { updatedAt: _u, ...rest } = data
        setTagsBySheet(rest)
        break
      }
      case 'groups':
        setGroups(data.groups ?? {})
        break
      case 'bag':
        setBag(data.bag ?? [])
        break
      case 'profile':
        if (typeof data.noclear === 'boolean') _setNoClear(data.noclear)
        break
    }
  }

  // ─── Initial load + one-time seed + real-time subscription ───────────────
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    let unsub = null
    initCompleteRef.current = false

    async function init() {
      // 1. Fetch current Firestore state
      const data = await fetchAllUserData(uid)
      if (cancelled) return

      // 2. If brand-new user (no sheets doc), seed Firestore with defaults
      if (!data.sheets?.sheets?.length) {
        const defaultSheetList = defaultSheets()
        const defaultActiveId  = defaultSheetList[0].id
        await patchUserData(uid, 'sheets', {
          sheets: defaultSheetList,
          activeSheetId: defaultActiveId,
        })
        // Hydrate from local defaults — don't wait for the snapshot echo
        setSheets(defaultSheetList)
        setActiveSheetId(defaultActiveId)
      } else {
        // 3. Hydrate state from fetched Firestore data
        hydrateFromFetchedData(data)
      }

      if (cancelled) return
      setDataReady(true)

      // 4. Now open the real-time subscription — init is done, echoes are safe
      initCompleteRef.current = true
      unsub = subscribeToUserData(uid, handleRemoteUpdate)
    }

    init().catch(console.error)

    return () => {
      cancelled = true
      initCompleteRef.current = false
      unsub?.()
      setDataReady(false)
    }
  }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps

  // ════════════════════════════════════════════════════════════════════════════
  // NAMES API  (same surface as the old useNames hook)
  // ════════════════════════════════════════════════════════════════════════════
  const names = sortNames(namesBySheet[activeSheetId] ?? [])

  const addName = useCallback((raw) => {
    const formatted = toTitleCase(raw)
    if (!formatted) return false
    const sid     = activeSheetIdRef.current
    const current = namesBySheetRef.current[sid] ?? []
    const lower   = formatted.toLowerCase()
    if (current.some((n) => n.toLowerCase() === lower)) return false
    const next     = sortNames([...current, formatted])
    const newState = { ...namesBySheetRef.current, [sid]: next }
    setNamesBySheet(newState)
    patchRef.current('names', { [sid]: next })
    return true
  }, [])

  const editName = useCallback((oldName, rawNew) => {
    const newName = toTitleCase(rawNew)
    if (!newName || newName.toLowerCase() === oldName.toLowerCase()) return
    const sid     = activeSheetIdRef.current
    const current = namesBySheetRef.current[sid] ?? []
    if (current.some((n) => n !== oldName && n.toLowerCase() === newName.toLowerCase())) return
    const nextNames     = sortNames(current.map((n) => (n === oldName ? newName : n)))
    const newNamesState = { ...namesBySheetRef.current, [sid]: nextNames }
    setNamesBySheet(newNamesState)
    patchRef.current('names', { [sid]: nextNames })

    // ── also rename tag in same sheet
    const currentTags = tagsBySheetRef.current[sid] ?? {}
    if (currentTags[oldName]) {
      const nextTags    = { ...currentTags, [newName]: currentTags[oldName] }
      delete nextTags[oldName]
      const newTagState = { ...tagsBySheetRef.current, [sid]: nextTags }
      setTagsBySheet(newTagState)
      patchRef.current('tags', { [sid]: nextTags })
    }

    // ── also rename in all groups
    const nextGroups = {}
    Object.entries(groupsRef.current).forEach(([id, g]) => {
      nextGroups[id] = { ...g, members: g.members.map((n) => (n === oldName ? newName : n)) }
    })
    setGroups(nextGroups)
    patchRef.current('groups', { groups: nextGroups })
  }, [])

  const removeName = useCallback((name) => {
    const sid      = activeSheetIdRef.current
    const current  = namesBySheetRef.current[sid] ?? []
    const next     = current.filter((n) => n !== name)
    const newState = { ...namesBySheetRef.current, [sid]: next }
    setNamesBySheet(newState)
    patchRef.current('names', { [sid]: next })

    // ── also remove tag
    const currentTags = tagsBySheetRef.current[sid] ?? {}
    if (currentTags[name]) {
      const nextTags    = { ...currentTags }
      delete nextTags[name]
      const newTagState = { ...tagsBySheetRef.current, [sid]: nextTags }
      setTagsBySheet(newTagState)
      patchRef.current('tags', { [sid]: nextTags })
    }

    // ── also remove from all groups
    const nextGroups = {}
    Object.entries(groupsRef.current).forEach(([id, g]) => {
      nextGroups[id] = { ...g, members: g.members.filter((n) => n !== name) }
    })
    setGroups(nextGroups)
    patchRef.current('groups', { groups: nextGroups })
  }, [])

  // Clears only the ACTIVE sheet's names (same behaviour as old useNames.clearAll)
  const clearAllNames = useCallback(() => {
    const sid      = activeSheetIdRef.current
    const newState = { ...namesBySheetRef.current, [sid]: [] }
    setNamesBySheet(newState)
    patchRef.current('names', { [sid]: [] })
  }, [])

  // no-op in Firestore mode (real-time subscription keeps data fresh)
  const reloadFromStorage = useCallback(() => {}, [])

  // ════════════════════════════════════════════════════════════════════════════
  // TAGS API  (same surface as the old useTags hook)
  // ════════════════════════════════════════════════════════════════════════════
  const tags = tagsBySheet[activeSheetId] ?? {}

  const setTag = useCallback((name, colorKey) => {
    const sid      = activeSheetIdRef.current
    const current  = { ...(tagsBySheetRef.current[sid] ?? {}) }
    if (!colorKey) delete current[name]
    else current[name] = colorKey
    const newState = { ...tagsBySheetRef.current, [sid]: current }
    setTagsBySheet(newState)
    patchRef.current('tags', { [sid]: current })
  }, [])

  const renameTag = useCallback((oldName, newName) => {
    const sid     = activeSheetIdRef.current
    const current = tagsBySheetRef.current[sid] ?? {}
    if (!current[oldName]) return
    const next    = { ...current, [newName]: current[oldName] }
    delete next[oldName]
    const newState = { ...tagsBySheetRef.current, [sid]: next }
    setTagsBySheet(newState)
    patchRef.current('tags', { [sid]: next })
  }, [])

  const removeTag = useCallback((name) => {
    const sid     = activeSheetIdRef.current
    const current = tagsBySheetRef.current[sid] ?? {}
    if (!current[name]) return
    const next    = { ...current }
    delete next[name]
    const newState = { ...tagsBySheetRef.current, [sid]: next }
    setTagsBySheet(newState)
    patchRef.current('tags', { [sid]: next })
  }, [])

  const clearTags = useCallback(() => {
    const sid      = activeSheetIdRef.current
    const newState = { ...tagsBySheetRef.current, [sid]: {} }
    setTagsBySheet(newState)
    patchRef.current('tags', { [sid]: {} })
  }, [])

  const mergeTags = useCallback((incoming) => {
    const sid     = activeSheetIdRef.current
    const current = tagsBySheetRef.current[sid] ?? {}
    const next    = { ...current, ...incoming }
    const newState = { ...tagsBySheetRef.current, [sid]: next }
    setTagsBySheet(newState)
    patchRef.current('tags', { [sid]: next })
  }, [])

  // ════════════════════════════════════════════════════════════════════════════
  // BAG API  (same surface as the old useBag hook)
  // ════════════════════════════════════════════════════════════════════════════
  const addToBag = useCallback((name) => {
    if (bagRef.current.includes(name)) return
    const next = [...bagRef.current, name]
    setBag(next)
    patchRef.current('bag', { bag: next })
  }, [])

  const removeFromBag = useCallback((name) => {
    const next = bagRef.current.filter((n) => n !== name)
    setBag(next)
    patchRef.current('bag', { bag: next })
  }, [])

  const clearBag = useCallback(() => {
    setBag([])
    patchRef.current('bag', { bag: [] })
  }, [])

  const mergeBag = useCallback((items) => {
    const next = [...bagRef.current]
    items.forEach((item) => { if (!next.includes(item)) next.push(item) })
    setBag(next)
    patchRef.current('bag', { bag: next })
  }, [])

  // ════════════════════════════════════════════════════════════════════════════
  // GROUPS API  (same surface as the old useGroups hook)
  // ════════════════════════════════════════════════════════════════════════════
  const createGroup = useCallback((name) => {
    const id   = `g-${Date.now()}`
    const next = { ...groupsRef.current, [id]: { name, members: [] } }
    setGroups(next)
    patchRef.current('groups', { groups: next })
    return id
  }, [])

  const renameGroup = useCallback((id, name) => {
    if (!groupsRef.current[id]) return
    const next = { ...groupsRef.current, [id]: { ...groupsRef.current[id], name } }
    setGroups(next)
    patchRef.current('groups', { groups: next })
  }, [])

  const deleteGroup = useCallback((id) => {
    const next = { ...groupsRef.current }
    delete next[id]
    setGroups(next)
    patchRef.current('groups', { groups: next })
  }, [])

  const clearGroups = useCallback(() => {
    setGroups({})
    patchRef.current('groups', { groups: {} })
  }, [])

  const addToGroup = useCallback((groupId, name) => {
    const g = groupsRef.current[groupId]
    if (!g || g.members.includes(name)) return
    const next = { ...groupsRef.current, [groupId]: { ...g, members: [...g.members, name] } }
    setGroups(next)
    patchRef.current('groups', { groups: next })
  }, [])

  const removeFromGroup = useCallback((groupId, name) => {
    const g = groupsRef.current[groupId]
    if (!g) return
    const next = { ...groupsRef.current, [groupId]: { ...g, members: g.members.filter((n) => n !== name) } }
    setGroups(next)
    patchRef.current('groups', { groups: next })
  }, [])

  const removeNameFromAllGroups = useCallback((name) => {
    const next = {}
    Object.entries(groupsRef.current).forEach(([id, g]) => {
      next[id] = { ...g, members: g.members.filter((n) => n !== name) }
    })
    setGroups(next)
    patchRef.current('groups', { groups: next })
  }, [])

  const renameInGroups = useCallback((oldName, newName) => {
    const next = {}
    Object.entries(groupsRef.current).forEach(([id, g]) => {
      next[id] = { ...g, members: g.members.map((n) => (n === oldName ? newName : n)) }
    })
    setGroups(next)
    patchRef.current('groups', { groups: next })
  }, [])

  const mergeGroups = useCallback((incoming) => {
    const next = { ...groupsRef.current }
    let i = 0
    Object.values(incoming).forEach((g) => {
      const existEntry = Object.entries(next).find(([, eg]) => eg.name === g.name)
      if (existEntry) {
        const [eid, eg] = existEntry
        const merged = [...eg.members]
        g.members.forEach((m) => { if (!merged.includes(m)) merged.push(m) })
        next[eid] = { ...eg, members: merged }
      } else {
        next[`g-import-${Date.now()}-${i++}`] = { name: g.name, members: [...g.members] }
      }
    })
    setGroups(next)
    patchRef.current('groups', { groups: next })
  }, [])

  // ════════════════════════════════════════════════════════════════════════════
  // SHEETS API  (same surface as the old useSheets hook)
  // ════════════════════════════════════════════════════════════════════════════
  const addSheet = useCallback(() => {
    const id   = `sheet-${Date.now()}`
    const num  = sheetsRef.current.length + 1
    const next = [...sheetsRef.current, { id, name: `Sheet ${num}` }]
    setSheets(next)
    setActiveSheetId(id)
    patchRef.current('sheets', { sheets: next, activeSheetId: id })
    return id
  }, [])

  const renameSheet = useCallback((id, name) => {
    const next = sheetsRef.current.map((s) => (s.id === id ? { ...s, name } : s))
    setSheets(next)
    patchRef.current('sheets', { sheets: next })
  }, [])

  const deleteSheet = useCallback((id) => {
    const prev = sheetsRef.current
    if (prev.length <= 1) return
    const next      = prev.filter((s) => s.id !== id)
    const newActive = activeSheetIdRef.current !== id
      ? activeSheetIdRef.current
      : (next[0]?.id ?? prev[0]?.id)

    setSheets(next)
    setActiveSheetId(newActive)
    patchRef.current('sheets', { sheets: next, activeSheetId: newActive })

    // Clear names + tags for deleted sheet from state
    const newNames = { ...namesBySheetRef.current }
    delete newNames[id]
    setNamesBySheet(newNames)

    const newTags = { ...tagsBySheetRef.current }
    delete newTags[id]
    setTagsBySheet(newTags)
  }, [])

  const switchSheet = useCallback((id) => {
    setActiveSheetId(id)
    patchRef.current('sheets', { activeSheetId: id })
  }, [])

  // Move a name from one sheet to another — atomically updates names, tags, groups
  const moveNameToSheet = useCallback((name, fromSheetId, toSheetId) => {
    if (fromSheetId === toSheetId) return { ok: false, reason: 'same-sheet' }

    const fromArr = namesBySheetRef.current[fromSheetId] ?? []
    const toArr   = namesBySheetRef.current[toSheetId]   ?? []

    if (!fromArr.includes(name))
      return { ok: false, reason: 'not-found' }
    if (toArr.some((n) => n.toLowerCase() === name.toLowerCase()))
      return { ok: false, reason: 'duplicate' }

    const newFrom = fromArr.filter((n) => n !== name)
    const newTo   = sortNames([...toArr, name])
    const newNamesState = { ...namesBySheetRef.current, [fromSheetId]: newFrom, [toSheetId]: newTo }
    setNamesBySheet(newNamesState)
    patchRef.current('names', { [fromSheetId]: newFrom, [toSheetId]: newTo })

    // Remove tag from source sheet
    const srcTags    = { ...(tagsBySheetRef.current[fromSheetId] ?? {}) }
    delete srcTags[name]
    const newTagState = { ...tagsBySheetRef.current, [fromSheetId]: srcTags }
    setTagsBySheet(newTagState)
    patchRef.current('tags', { [fromSheetId]: srcTags })

    // Remove name from all groups
    const nextGroups = {}
    Object.entries(groupsRef.current).forEach(([id, g]) => {
      nextGroups[id] = { ...g, members: g.members.filter((n) => n !== name) }
    })
    setGroups(nextGroups)
    patchRef.current('groups', { groups: nextGroups })

    return { ok: true }
  }, [])

  // ════════════════════════════════════════════════════════════════════════════
  // PROFILE / PREFS
  // ════════════════════════════════════════════════════════════════════════════
  const toggleNoClear = useCallback(() => {
    _setNoClear((prev) => {
      const next = !prev
      patchRef.current('profile', { noclear: next })
      return next
    })
  }, [])

  // ── Combined clearAll: clears current sheet names+tags AND global bag+groups
  const clearAll = useCallback(() => {
    clearAllNames()
    clearTags()
    clearBag()
    clearGroups()
  }, [clearAllNames, clearTags, clearBag, clearGroups])

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    dataReady,

    // Sheets
    sheets, activeSheetId,
    addSheet, renameSheet, deleteSheet, switchSheet, moveNameToSheet,

    // Names
    names, addName, editName, removeName,
    clearAll, reloadFromStorage,

    // Tags
    tags, setTag, renameTag, removeTag, clearTags, mergeTags,

    // Bag
    bag, addToBag, removeFromBag, clearBag, mergeBag,

    // Groups
    groups, createGroup, renameGroup, deleteGroup, clearGroups,
    addToGroup, removeFromGroup, removeNameFromAllGroups,
    renameInGroups, mergeGroups,

    // Prefs
    noClear, toggleNoClear,
  }
}
