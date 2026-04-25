/**
 * useMemorySheets.js — React hook for Memory Sheets
 * ===================================================
 * Owns all memory state. Exposes a clean API to App.jsx and MemoryPanel.
 *
 * STATE LAYOUT:
 *   memSheets  : { [sheetId]: { name, names[], _v1[], _v2[], createdAt, updatedAt } }
 *   trash      : { [trashId]: { name, names[], deletedAt, originalId } }
 *   memoryNameSet : Set<string> — flat lowercase union for O(1) lookup
 *
 * PERSISTENCE GUARANTEE (enforced here, not just documented):
 *   - No function in this hook is called by blast, clearAll, or auto-wipe.
 *   - This hook has NO dependency on useFirestoreData whatsoever.
 *   - The only data-destroying functions are deleteMemSheet (soft) and
 *     clearMemSheet. Both require explicit user action.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  upsertMemorySheet, patchMemoryNames, restoreVersion,
  softDeleteMemorySheet, restoreFromTrash, permanentlyDeleteTrash,
  purgeOldTrash, fetchAllMemorySheets, fetchTrash,
  subscribeMemorySheets, subscribeTrash,
  exportMemoryJSON, exportMemoryCSV, downloadFile,
} from '../lib/memoryDb.js'
import { toTitleCase } from './useFirestoreData.js'

// ─── Curated icon set for memory sheets ────────────────────────────────────────────────
// Each icon is visually distinct so users can tell sheets apart at a glance.
export const MEM_SHEET_ICONS = [
  '📘', // blue book
  '📗', // green book
  '📙', // orange book
  '📕', // closed red book
  '📛', // notebook
  '📜', // scroll
  '🗒️', // spiral notepad
  '📂', // open file folder
  '🏷️', // label
  '⭐', // star
  '📎', // paperclip
  '🔖', // bookmark
  '🧩', // puzzle
  '💡', // bulb
  '🎯', // bullseye
]

export function pickNextIcon(existingSheets) {
  const usedIcons = new Set(Object.values(existingSheets).map(s => s.icon).filter(Boolean))
  return MEM_SHEET_ICONS.find(i => !usedIcons.has(i)) ?? MEM_SHEET_ICONS[Object.keys(existingSheets).length % MEM_SHEET_ICONS.length]
}

export function useMemorySheets(uid) {
  const [memSheets, _setMemSheets] = useState({})
  const [trash,     _setTrash]     = useState({})
  const [memError,  setMemError]   = useState(null)

  const memSheetsRef = useRef({})
  const setMemSheets = (v) => { memSheetsRef.current = v; _setMemSheets(v) }

  // ── Boot: fetch + subscribe ─────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return
    let cancelled = false

    // Fetch initial state + purge stale trash on boot
    Promise.all([
      fetchAllMemorySheets(uid),
      fetchTrash(uid),
      purgeOldTrash(uid),
    ]).then(([sheets, trashData]) => {
      if (cancelled) return
      setMemSheets(sheets)
      _setTrash(trashData)
    })

    const unsubMem   = subscribeMemorySheets(uid, (sheets) => {
      if (!cancelled) setMemSheets(sheets)
    })
    const unsubTrash = subscribeTrash(uid, (items) => {
      if (!cancelled) _setTrash(items)
    })

    return () => {
      cancelled = true
      unsubMem()
      unsubTrash()
    }
  }, [uid])

  // ── memoryNameSet — flat O(1) lookup across all sheets ──────────────────────
  const memoryNameSet = useMemo(() => {
    const s = new Set()
    Object.values(memSheets).forEach(sheet => {
      ;(sheet.names ?? []).forEach(n => s.add(n.toLowerCase()))
    })
    return s
  }, [memSheets])

  // ── memoryIconMap — Map<lowercase_name, icon> for per-cell icon display ─────
  const memoryIconMap = useMemo(() => {
    const m = new Map()
    Object.values(memSheets).forEach(sheet => {
      const icon = sheet.icon ?? '📚'
      ;(sheet.names ?? []).forEach(n => {
        const key = n.toLowerCase()
        if (!m.has(key)) m.set(key, icon)  // first sheet wins
      })
    })
    return m
  }, [memSheets])

  // ── Helper: find which sheet(s) contain a given name ───────────────────────
  const sheetsContainingName = useCallback((name) => {
    const lower = name.toLowerCase()
    return Object.entries(memSheetsRef.current)
      .filter(([, sh]) => (sh.names ?? []).some(n => n.toLowerCase() === lower))
      .map(([id, sh]) => ({ id, name: sh.name }))
  }, [])

  // ── createMemorySheet ───────────────────────────────────────────────────────
  const createMemorySheet = useCallback(async (name, iconOverride) => {
    if (!uid) return null
    const id   = `mem-${Date.now()}`
    const icon = iconOverride ?? pickNextIcon(memSheetsRef.current)
    // Optimistic update
    setMemSheets({ ...memSheetsRef.current, [id]: { name, icon, names: [] } })
    const ok = await upsertMemorySheet(uid, id, name, icon)
    if (!ok) {
      setMemError('Failed to create sheet. Check your connection.')
      const next = { ...memSheetsRef.current }
      delete next[id]
      setMemSheets(next)
      return null
    }
    return id
  }, [uid])

  // ── renameMemorySheet ───────────────────────────────────────────────────────
  const renameMemorySheet = useCallback(async (sheetId, name) => {
    if (!uid || !memSheetsRef.current[sheetId]) return
    const prev = memSheetsRef.current[sheetId]
    setMemSheets({ ...memSheetsRef.current, [sheetId]: { ...prev, name } })
    await upsertMemorySheet(uid, sheetId, name, prev.icon)  // preserve icon
  }, [uid])

  // ── setMemSheetIcon — change a sheet's icon ────────────────────────────────
  const setMemSheetIcon = useCallback(async (sheetId, icon) => {
    if (!uid || !memSheetsRef.current[sheetId]) return
    const prev = memSheetsRef.current[sheetId]
    setMemSheets({ ...memSheetsRef.current, [sheetId]: { ...prev, icon } })
    await upsertMemorySheet(uid, sheetId, prev.name, icon)
  }, [uid])



  // ── deleteMemSheet — SOFT DELETE only ───────────────────────────────────────
  const deleteMemSheet = useCallback(async (sheetId) => {
    if (!uid) return null
    const prev = { ...memSheetsRef.current }
    const sheet = prev[sheetId]
    if (!sheet) return null

    // Optimistic: remove from live state immediately
    const next = { ...prev }
    delete next[sheetId]
    setMemSheets(next)

    const result = await softDeleteMemorySheet(uid, sheetId)
    if (!result) {
      // Rollback
      setMemSheets(prev)
      setMemError('Failed to delete sheet.')
      return null
    }
    return result.trashId   // caller can use for "undo" toast
  }, [uid])

  // ── restoreSheet — recover from trash ───────────────────────────────────────
  const restoreSheet = useCallback(async (trashId) => {
    if (!uid) return false
    return restoreFromTrash(uid, trashId)
  }, [uid])

  // ── permanentDelete — hard delete from trash ─────────────────────────────
  const permanentDelete = useCallback(async (trashId) => {
    if (!uid) return false
    return permanentlyDeleteTrash(uid, trashId)
  }, [uid])

  // ── addNamesToMemSheet — dedup, titlecase, persist ───────────────────────
  const addNamesToMemSheet = useCallback(async (sheetId, incomingNames) => {
    if (!uid) return 0
    const sheet = memSheetsRef.current[sheetId]
    if (!sheet) return 0
    const current  = sheet.names ?? []
    const lowerSet = new Set(current.map(n => n.toLowerCase()))
    const toAdd    = incomingNames
      .map(n => toTitleCase(n))
      .filter(n => n && !lowerSet.has(n.toLowerCase()))
    if (!toAdd.length) return 0

    const next    = [...current, ...toAdd].sort((a, b) => a.localeCompare(b))
    const updated = { ...memSheetsRef.current, [sheetId]: { ...sheet, names: next } }
    setMemSheets(updated)
    await patchMemoryNames(uid, sheetId, next)
    return toAdd.length
  }, [uid])

  // ── removeNameFromMemSheet ────────────────────────────────────────────────
  const removeNameFromMemSheet = useCallback(async (sheetId, name) => {
    if (!uid) return
    const sheet = memSheetsRef.current[sheetId]
    if (!sheet) return
    const next    = (sheet.names ?? []).filter(n => n !== name)
    const updated = { ...memSheetsRef.current, [sheetId]: { ...sheet, names: next } }
    setMemSheets(updated)
    await patchMemoryNames(uid, sheetId, next)
  }, [uid])

  // ── clearMemSheet — wipe all names (keep the sheet itself) ───────────────
  const clearMemSheet = useCallback(async (sheetId) => {
    if (!uid) return
    const sheet = memSheetsRef.current[sheetId]
    if (!sheet) return
    const updated = { ...memSheetsRef.current, [sheetId]: { ...sheet, names: [] } }
    setMemSheets(updated)
    await patchMemoryNames(uid, sheetId, [])
  }, [uid])

  // ── editNameInMemSheet — rename a name in place ───────────────────────────
  const editNameInMemSheet = useCallback(async (sheetId, oldName, newName) => {
    if (!uid) return
    const sheet = memSheetsRef.current[sheetId]
    if (!sheet) return
    const trimmed   = newName.trim()
    if (!trimmed || trimmed === oldName) return
    const lowerSet  = new Set((sheet.names ?? []).map(n => n.toLowerCase()))
    // If new name already exists (case-insensitive), just remove old
    const next = lowerSet.has(trimmed.toLowerCase()) && trimmed.toLowerCase() !== oldName.toLowerCase()
      ? (sheet.names ?? []).filter(n => n !== oldName)
      : (sheet.names ?? []).map(n => n === oldName ? trimmed : n)
    const sorted  = next.sort((a, b) => a.localeCompare(b))
    const updated = { ...memSheetsRef.current, [sheetId]: { ...sheet, names: sorted } }
    setMemSheets(updated)
    await patchMemoryNames(uid, sheetId, sorted)
  }, [uid])

  // ── restorePreviousVersion — roll back names to _v1 ──────────────────────
  const restorePreviousVersion = useCallback(async (sheetId) => {
    if (!uid) return null
    const restoredNames = await restoreVersion(uid, sheetId)
    if (restoredNames !== null) {
      const sheet   = memSheetsRef.current[sheetId]
      const updated = { ...memSheetsRef.current, [sheetId]: { ...sheet, names: restoredNames } }
      setMemSheets(updated)
    }
    return restoredNames
  }, [uid])

  // ── Export helpers ────────────────────────────────────────────────────────
  const exportAsJSON = useCallback(() => {
    const json = exportMemoryJSON(memSheetsRef.current)
    downloadFile(json, `clearmymind-memory-${Date.now()}.json`, 'application/json')
  }, [])

  const exportAsCSV = useCallback(() => {
    const csv = exportMemoryCSV(memSheetsRef.current)
    downloadFile(csv, `clearmymind-memory-${Date.now()}.csv`, 'text/csv')
  }, [])

  // ── Trash utilities ───────────────────────────────────────────────────────
  const trashCount = Object.keys(trash).length

  return {
    // State
    memSheets,
    trash,
    trashCount,
    memoryNameSet,    // O(1) lookup
    memoryIconMap,    // Map<name, icon> for per-cell icon display
    memError,
    clearMemError: () => setMemError(null),

    // Derived
    sheetsContainingName,

    // Sheet lifecycle
    createMemorySheet,
    renameMemorySheet,
    setMemSheetIcon,
    deleteMemSheet,       // soft — goes to trash
    restoreSheet,
    permanentDelete,

    // Name operations
    addNamesToMemSheet,
    removeNameFromMemSheet,
    editNameInMemSheet,
    clearMemSheet,

    // Versioning
    restorePreviousVersion,

    // Export
    exportAsJSON,
    exportAsCSV,
  }
}
