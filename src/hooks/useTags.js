import { useState, useCallback } from 'react'

const STORAGE_KEY = 'clearmind_tags'

const CYCLE = [null, 'live', 'interested']  // click cycles through these

function loadTags() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveTags(tags) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tags))
}

export function useTags() {
  const [tags, setTags] = useState(loadTags)

  const getTag = useCallback((name) => tags[name] ?? null, [tags])

  const cycleTag = useCallback((name) => {
    setTags(prev => {
      const current = prev[name] ?? null
      const idx     = CYCLE.indexOf(current)
      const next    = CYCLE[(idx + 1) % CYCLE.length]
      const updated = { ...prev }
      if (next === null) delete updated[name]
      else updated[name] = next
      saveTags(updated)
      return updated
    })
  }, [])

  // Call when a name is renamed so the tag follows the new name
  const renameTag = useCallback((oldName, newName) => {
    setTags(prev => {
      if (!prev[oldName]) return prev
      const updated = { ...prev }
      updated[newName] = updated[oldName]
      delete updated[oldName]
      saveTags(updated)
      return updated
    })
  }, [])

  // Call when a name is removed to clean up its tag
  const removeTag = useCallback((name) => {
    setTags(prev => {
      if (!prev[name]) return prev
      const updated = { ...prev }
      delete updated[name]
      saveTags(updated)
      return updated
    })
  }, [])

  // Wipe all tags (used on clearAll / blast)
  const clearTags = useCallback(() => {
    setTags({})
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return { tags, getTag, cycleTag, renameTag, removeTag, clearTags }
}
