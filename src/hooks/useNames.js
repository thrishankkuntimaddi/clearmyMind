import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'clearmind_names'

function loadNames() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function sortNames(arr) {
  return [...arr].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

function saveNames(names) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(names))
}

export function useNames() {
  const [names, setNames] = useState(() => sortNames(loadNames()))

  useEffect(() => {
    saveNames(names)
  }, [names])

  const addName = useCallback((raw) => {
    const trimmed = raw.trim()
    if (!trimmed) return false

    setNames((prev) => {
      const lower = trimmed.toLowerCase()
      const exists = prev.some((n) => n.toLowerCase() === lower)
      if (exists) return prev
      return sortNames([...prev, trimmed])
    })
    return true
  }, [])

  const removeName = useCallback((name) => {
    setNames((prev) => prev.filter((n) => n !== name))
  }, [])

  const clearAll = useCallback(() => {
    setNames([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return { names, addName, removeName, clearAll }
}
