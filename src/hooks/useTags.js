import { useState, useCallback } from 'react'

const STORAGE_KEY = 'clearmind_tags'

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

function loadTags() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
  catch { return {} }
}
function saveTags(t) { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)) }

export function useTags() {
  const [tags, setTags] = useState(loadTags)

  const setTag = useCallback((name, colorKey) => {
    setTags(prev => {
      const next = { ...prev }
      if (!colorKey) delete next[name]
      else next[name] = colorKey
      saveTags(next)
      return next
    })
  }, [])

  const renameTag = useCallback((oldName, newName) => {
    setTags(prev => {
      if (!prev[oldName]) return prev
      const next = { ...prev, [newName]: prev[oldName] }
      delete next[oldName]
      saveTags(next)
      return next
    })
  }, [])

  const removeTag = useCallback((name) => {
    setTags(prev => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      saveTags(next)
      return next
    })
  }, [])

  const clearTags = useCallback(() => {
    setTags({})
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return { tags, setTag, renameTag, removeTag, clearTags }
}
