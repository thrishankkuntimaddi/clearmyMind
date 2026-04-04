import { useState, useCallback, useEffect } from 'react'

const SHEETS_KEY = 'clearmind_sheets'
const ACTIVE_KEY = 'clearmind_active_sheet'

// Each sheet: { id, name }
// Sheet data is stored separately under clearmind_sheet_{id}_names etc.

function loadSheets() {
  try {
    const raw = localStorage.getItem(SHEETS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch { return null }
}

function defaultSheets() {
  const id = 'sheet-1'
  return [{ id, name: 'Sheet 1' }]
}

export function useSheets() {
  const [sheets, setSheets] = useState(() => {
    return loadSheets() || defaultSheets()
  })

  const [activeSheetId, setActiveSheetId] = useState(() => {
    const stored = localStorage.getItem(ACTIVE_KEY)
    const all = loadSheets() || defaultSheets()
    return (stored && all.find(s => s.id === stored)) ? stored : all[0].id
  })

  // Persist sheets list
  useEffect(() => {
    localStorage.setItem(SHEETS_KEY, JSON.stringify(sheets))
  }, [sheets])

  // Persist active sheet
  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, activeSheetId)
  }, [activeSheetId])

  const addSheet = useCallback(() => {
    const id = `sheet-${Date.now()}`
    const num = sheets.length + 1
    setSheets(prev => [...prev, { id, name: `Sheet ${num}` }])
    setActiveSheetId(id)
    return id
  }, [sheets.length])

  const renameSheet = useCallback((id, name) => {
    setSheets(prev => prev.map(s => s.id === id ? { ...s, name } : s))
  }, [])

  const deleteSheet = useCallback((id) => {
    setSheets(prev => {
      if (prev.length <= 1) return prev // keep at least one sheet
      const next = prev.filter(s => s.id !== id)
      // Clean up storage for this sheet
      const keySuffixes = ['names', 'tags', 'bag', 'groups']
      keySuffixes.forEach(k => localStorage.removeItem(`clearmind_sheet_${id}_${k}`))
      return next
    })
    setActiveSheetId(prev => {
      if (prev !== id) return prev
      const remaining = sheets.filter(s => s.id !== id)
      return remaining[0]?.id ?? sheets[0]?.id
    })
  }, [sheets])

  const switchSheet = useCallback((id) => {
    setActiveSheetId(id)
  }, [])

  return { sheets, activeSheetId, addSheet, renameSheet, deleteSheet, switchSheet }
}
