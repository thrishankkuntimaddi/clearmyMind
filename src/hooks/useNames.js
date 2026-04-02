import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'clearmind_names'

// Capitalize first letter of every word
export function toTitleCase(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (ch) => ch.toUpperCase())
}

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
    const formatted = toTitleCase(raw)
    if (!formatted) return false

    setNames((prev) => {
      const lower = formatted.toLowerCase()
      const exists = prev.some((n) => n.toLowerCase() === lower)
      if (exists) return prev
      return sortNames([...prev, formatted])
    })
    return true
  }, [])

  const editName = useCallback((oldName, rawNew) => {
    const newName = toTitleCase(rawNew)
    if (!newName || newName.toLowerCase() === oldName.toLowerCase()) return

    setNames((prev) => {
      const alreadyExists = prev.some(
        (n) => n !== oldName && n.toLowerCase() === newName.toLowerCase()
      )
      if (alreadyExists) return prev
      return sortNames(prev.map((n) => (n === oldName ? newName : n)))
    })
  }, [])

  const removeName = useCallback((name) => {
    setNames((prev) => prev.filter((n) => n !== name))
  }, [])

  const clearAll = useCallback(() => {
    setNames([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return { names, addName, editName, removeName, clearAll }
}
