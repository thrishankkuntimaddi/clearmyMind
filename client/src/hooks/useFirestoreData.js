import { useState, useEffect, useRef, useCallback } from 'react'
import { patchUserData, subscribeToUserData, fetchAllUserDataWithErrors, USER_DOCS } from '../lib/db.js'

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
// Single hook that owns ALL app data. Uses refs for synchronous reads inside
// callbacks so all public functions return meaningful values without async reads.
export function useFirestoreData(uid) {
  // Write-error toast — set when a Firestore write silently fails
  const [writeError, _setWriteError] = useState(null)
  const clearWriteError = useCallback(() => _setWriteError(null), [])

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
      ? async (docName, partial) => {
          const ok = await patchUserData(uid, docName, partial)
          if (!ok) _setWriteError('⚠️ Data not saved — check your connection or app permissions.')
        }
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
  //
  // FLOW:
  //   1. Open subscription immediately → queues early snapshots (IndexedDB cache)
  //   2. fetchAllUserData → network read (fast if auth token ready)
  //      If network fails (PERMISSION_DENIED mid-refresh): tries IndexedDB
  //      If BOTH fail: results[docName] = null  AND  _fetchErrors[docName] = true
  //   3. Decide: newUser | existingUser | unknownUser (all errored, wait for sub)
  //
  // CRITICAL RACE: on a second device with empty IndexedDB, if auth token is
  // mid-refresh ALL fetches fail → all docs null → falsely treated as new user
  // → seed written → DATA WIPED. Fix: track which docs errored vs. don't exist,
  // and if ALL errored, wait for the subscription to deliver real data instead.
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    initCompleteRef.current = false

    // Queue for snapshots that arrive before init finishes
    const pendingUpdates = {}   // { docName: data }

    // Pre-open the subscription immediately so we catch the very first
    // local-cache snapshot. Updates received before initCompleteRef is true
    // are queued; afterwards they pass straight through.
    const unsub = subscribeToUserData(uid, (docName, data) => {
      if (!initCompleteRef.current) {
        pendingUpdates[docName] = data
      } else {
        handleRemoteUpdate(docName, data)
      }
    })

    async function init() {
      // 1. Fetch current Firestore state (tracks per-doc errors internally)
      const { data, fetchErrors } = await fetchAllUserDataWithErrors(uid)
      if (cancelled) return

      const allFetchesFailed = USER_DOCS.every((k) => fetchErrors[k])
      const hasFetchedAnyData = USER_DOCS.some(
        (k) => !fetchErrors[k] && data[k] !== null && data[k] !== undefined
      )
      const hasQueuedAnyData = Object.keys(pendingUpdates).length > 0

      if (allFetchesFailed && !hasQueuedAnyData) {
        // ALL network + cache reads failed AND subscription has delivered nothing yet.
        // This happens on a pristine second device when auth token is mid-refresh.
        // Wait up to 3 seconds for the subscription to deliver real Firestore data.
        await new Promise((resolve) => {
          const deadline = setTimeout(resolve, 3000)
          function checkQueue() {
            if (Object.keys(pendingUpdates).length > 0 || cancelled) {
              clearTimeout(deadline)
              resolve()
            } else {
              setTimeout(checkQueue, 100)
            }
          }
          checkQueue()
        })
        if (cancelled) return
      }

      // Re-evaluate after potential wait
      const finalHasQueued = Object.keys(pendingUpdates).length > 0
      const isNewUser = !hasFetchedAnyData && !finalHasQueued

      if (isNewUser) {
        // Truly brand-new user — seed Firestore with default sheet + profile marker.
        // Profile doc = reliable "user exists" signal for future logins on new devices.
        console.warn('[CMM] SEEDING NEW USER — this should only happen ONCE per account')
        const defaultSheetList = defaultSheets()
        const defaultActiveId  = defaultSheetList[0].id
        await patchUserData(uid, 'sheets', {
          sheets: defaultSheetList,
          activeSheetId: defaultActiveId,
        })
        await patchUserData(uid, 'profile', { noclear: true, createdAt: Date.now() })
        if (cancelled) return
        setSheets(defaultSheetList)
        setActiveSheetId(defaultActiveId)

      } else {
        // Existing user — hydrate from fetched data first, then overlay subscription queue
        if (hasFetchedAnyData) {
          hydrateFromFetchedData(data)
        }

        // Flush queued subscription snapshots (these may have newer data than the fetch)
        if (finalHasQueued) {
          // Unlock first so handleRemoteUpdate pass-through works
          initCompleteRef.current = true
          Object.keys(pendingUpdates).forEach((docName) =>
            handleRemoteUpdate(docName, pendingUpdates[docName])
          )
        }
      }

      if (cancelled) return
      initCompleteRef.current = true  // ensure always set regardless of branch
    }

    init().catch(console.error)

    return () => {
      cancelled = true
      initCompleteRef.current = false
      unsub?.()
    }
  }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════════════════
  // NAMES API
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

    // Clear names + tags for deleted sheet — update local state AND Firestore.
    // We write empty values (not deleteField) because patchUserData uses merge:true.
    // The orphaned sheetId key in Firestore becomes [] / {} so it never restores
    // ghost data on next login or cross-device load.
    const newNames = { ...namesBySheetRef.current }
    delete newNames[id]
    setNamesBySheet(newNames)
    patchRef.current('names', { [id]: [] })   // zero out in Firestore

    const newTags = { ...tagsBySheetRef.current }
    delete newTags[id]
    setTagsBySheet(newTags)
    patchRef.current('tags', { [id]: {} })    // zero out in Firestore
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

  // ── clearAll: wipes only the ACTIVE sheet's names + tags.
  // Bag and groups are cross-sheet and are NOT touched here.
  const clearAll = useCallback(() => {
    clearAllNames()
    clearTags()
  }, [clearAllNames, clearTags])

  // ── clearEverything: full nuclear reset used by Settings → "Reset all data".
  // Wipes EVERY sheet's names+tags, plus bag and groups.
  const clearEverything = useCallback(() => {
    // Clear names + tags for every sheet
    const emptyNames = {}
    const emptyTags  = {}
    sheetsRef.current.forEach(s => { emptyNames[s.id] = []; emptyTags[s.id] = {} })
    setNamesBySheet(emptyNames)
    setTagsBySheet(emptyTags)
    patchRef.current('names', emptyNames)
    patchRef.current('tags', emptyTags)
    // Clear bag and groups
    clearBag()
    clearGroups()
  }, [clearBag, clearGroups])

  // ══════════════════════════════════════════════════════════════════════════
  // FULL SNAPSHOT RESTORE  (multi-sheet, groups, bag, tags)
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * Atomically restore a full v2 snapshot from parseSnapshot().
   * ALL existing data is replaced (sheets, names, tags, groups, bag).
   *
   * Strategy:
   *  - Merge snapshot sheets into existing sheet list by ID.
   *    Sheets that already exist keep their ID (data just updated).
   *    New sheets from the snapshot are appended.
   *  - Name/tag maps are written per-sheet directly.
   *  - Groups and bag are fully replaced.
   *
   * Returns a summary { sheetsRestored, totalNames, groups, bag, colors }.
   */
  const restoreFullSnapshot = useCallback((parsed) => {
    const snapSheets      = parsed.sheets      ?? []
    const snapNamesBySheet = parsed.namesBySheet ?? {}
    const snapTagsBySheet  = parsed.tagsBySheet  ?? {}
    const snapGroups       = parsed.groups        ?? {}
    const snapBag          = parsed.bag           ?? []

    // ── 1. Merge sheet list ───────────────────────────────────────────────────────────
    // Build a final sheet list: existing sheets stay in order; snapshot sheets
    // with IDs not yet in the list are appended.
    const existingIds = new Set(sheetsRef.current.map(s => s.id))
    const mergedSheets = [...sheetsRef.current]
    const sheetIdMap = {}  // snapSheetId -> finalSheetId (in case of remapping)

    snapSheets.forEach((snapSheet) => {
      if (existingIds.has(snapSheet.id)) {
        // ID collision: reuse existing sheet with same ID (just overwrite data)
        sheetIdMap[snapSheet.id] = snapSheet.id
        // Rename sheet to match snapshot name
        const idx = mergedSheets.findIndex(s => s.id === snapSheet.id)
        if (idx !== -1) mergedSheets[idx] = { ...mergedSheets[idx], name: snapSheet.name }
      } else {
        // New sheet from snapshot — append it
        mergedSheets.push({ id: snapSheet.id, name: snapSheet.name })
        sheetIdMap[snapSheet.id] = snapSheet.id
        existingIds.add(snapSheet.id)
      }
    })

    const newActiveId = mergedSheets[0]?.id ?? activeSheetIdRef.current

    setSheets(mergedSheets)
    setActiveSheetId(newActiveId)
    patchRef.current('sheets', { sheets: mergedSheets, activeSheetId: newActiveId })

    // ── 2. Write names per sheet ──────────────────────────────────────────────────────
    const newNamesBySheet = { ...namesBySheetRef.current }
    const namesFirestorePatch = {}
    let totalNames = 0

    snapSheets.forEach((snapSheet) => {
      const finalId   = sheetIdMap[snapSheet.id]
      const incoming  = snapNamesBySheet[snapSheet.id] ?? []
      const existing  = newNamesBySheet[finalId] ?? []
      // Merge: add incoming names not already present (case-insensitive)
      const lowerExisting = new Set(existing.map(n => n.toLowerCase()))
      const merged = [...existing]
      incoming.forEach(n => { if (!lowerExisting.has(n.toLowerCase())) { merged.push(n); lowerExisting.add(n.toLowerCase()) } })
      const sorted = [...merged].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      newNamesBySheet[finalId] = sorted
      namesFirestorePatch[finalId] = sorted
      totalNames += sorted.length
    })

    setNamesBySheet(newNamesBySheet)
    patchRef.current('names', namesFirestorePatch)

    // ── 3. Write tags per sheet ─────────────────────────────────────────────────────
    const newTagsBySheet = { ...tagsBySheetRef.current }
    const tagsFirestorePatch = {}
    let totalColors = 0

    snapSheets.forEach((snapSheet) => {
      const finalId  = sheetIdMap[snapSheet.id]
      const incoming = snapTagsBySheet[snapSheet.id] ?? {}
      const existing = newTagsBySheet[finalId] ?? {}
      const merged   = { ...existing, ...incoming }  // snapshot tags win on conflict
      newTagsBySheet[finalId] = merged
      tagsFirestorePatch[finalId] = merged
      totalColors += Object.keys(incoming).length
    })

    setTagsBySheet(newTagsBySheet)
    patchRef.current('tags', tagsFirestorePatch)

    // ── 4. Merge groups ─────────────────────────────────────────────────────────────
    const nextGroups = { ...groupsRef.current }
    let gi = 0
    Object.values(snapGroups).forEach((g) => {
      const existEntry = Object.entries(nextGroups).find(([, eg]) => eg.name === g.name)
      if (existEntry) {
        const [eid, eg] = existEntry
        const merged = [...eg.members]
        g.members.forEach(m => { if (!merged.includes(m)) merged.push(m) })
        nextGroups[eid] = { ...eg, members: merged }
      } else {
        nextGroups[`g-snap-${Date.now()}-${gi++}`] = { name: g.name, members: [...g.members] }
      }
    })
    setGroups(nextGroups)
    patchRef.current('groups', { groups: nextGroups })

    // ── 5. Merge bag ──────────────────────────────────────────────────────────────────
    const nextBag = [...bagRef.current]
    snapBag.forEach(item => { if (!nextBag.includes(item)) nextBag.push(item) })
    setBag(nextBag)
    patchRef.current('bag', { bag: nextBag })

    return {
      sheetsRestored: snapSheets.length,
      totalNames,
      groups:  Object.keys(snapGroups).length,
      bag:     snapBag.length,
      colors:  totalColors,
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    writeError, clearWriteError,

    // Sheets
    sheets, activeSheetId,
    addSheet, renameSheet, deleteSheet, switchSheet, moveNameToSheet,

    // Names (active sheet) + raw multi-sheet maps for full snapshot
    names, addName, editName, removeName,
    clearAll, clearEverything, reloadFromStorage,
    namesBySheet: namesBySheetRef.current,
    tagsBySheet:  tagsBySheetRef.current,

    // Tags (active sheet)
    tags, setTag, renameTag, removeTag, clearTags, mergeTags,

    // Bag
    bag, addToBag, removeFromBag, clearBag, mergeBag,

    // Groups
    groups, createGroup, renameGroup, deleteGroup, clearGroups,
    addToGroup, removeFromGroup, mergeGroups,

    // Full snapshot restore (all sheets at once)
    restoreFullSnapshot,

    // Prefs
    noClear, toggleNoClear,
  }
}
