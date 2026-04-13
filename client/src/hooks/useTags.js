import { useState, useCallback, useEffect } from 'react'

// macOS-style tag colors
export const TAG_COLORS = [
  { key: 'red',    hex: '#ef4444', label: 'Red'    },
  { key: 'orange', hex: '#f97316', label: 'Orange' },
  { key: 'yellow', hex: '#eab308', label: 'Yellow' },
  { key: 'green',  hex: '#22c55e', label: 'Green'  },
  { key: 'blue',   hex: '#3b82f6', label: 'Blue'   },
  { key: 'purple', hex: '#a855f7', label: 'Purple' },
  { key: 'gray',   hex: '#6b7280', label: 'Gray'   },
]

export const TAG_MAP = Object.fromEntries(TAG_COLORS.map(t => [t.key, t]))

function makeKey(sheetId) {
  return sheetId ? `clearmind_sheet_${sheetId}_tags` : 'clearmind_tags'
}

function loadTags(sheetId) {
  try { return JSON.parse(localStorage.getItem(makeKey(sheetId)) ?? '{}') }
  catch { return {} }
}

export function useTags(sheetId) {
  const [tags, setTags] = useState(() => loadTags(sheetId))

  // Reload when sheet changes
  useEffect(() => {
    setTags(loadTags(sheetId))
  }, [sheetId])

  const saveTags = (t) => localStorage.setItem(makeKey(sheetId), JSON.stringify(t))

  const setTag = useCallback((name, colorKey) => {
    setTags(prev => {
      const next = { ...prev }
      if (!colorKey) delete next[name]
      else next[name] = colorKey
      localStorage.setItem(makeKey(sheetId), JSON.stringify(next))
      return next
    })
  }, [sheetId])

  const renameTag = useCallback((oldName, newName) => {
    setTags(prev => {
      if (!prev[oldName]) return prev
      const next = { ...prev, [newName]: prev[oldName] }
      delete next[oldName]
      localStorage.setItem(makeKey(sheetId), JSON.stringify(next))
      return next
    })
  }, [sheetId])

  const removeTag = useCallback((name) => {
    setTags(prev => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      localStorage.setItem(makeKey(sheetId), JSON.stringify(next))
      return next
    })
  }, [sheetId])

  const clearTags = useCallback(() => {
    setTags({})
    localStorage.removeItem(makeKey(sheetId))
  }, [sheetId])

  const mergeTags = useCallback((incoming) => {
    setTags(prev => {
      const next = { ...prev, ...incoming }
      localStorage.setItem(makeKey(sheetId), JSON.stringify(next))
      return next
    })
  }, [sheetId])

  return { tags, setTag, renameTag, removeTag, clearTags, mergeTags }
}
