import { useState, useCallback, useEffect } from 'react'

function makeKey(sheetId) {
  return sheetId ? `clearmind_sheet_${sheetId}_bag` : 'clearmind_bag'
}

function loadBag(sheetId) {
  try {
    const raw = localStorage.getItem(makeKey(sheetId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function useBag(sheetId) {
  const [bag, setBag] = useState(() => loadBag(sheetId))

  // Reload when sheet changes
  useEffect(() => {
    setBag(loadBag(sheetId))
  }, [sheetId])

  useEffect(() => {
    localStorage.setItem(makeKey(sheetId), JSON.stringify(bag))
  }, [sheetId, bag])

  const addToBag = useCallback((name) => {
    setBag(prev => prev.includes(name) ? prev : [...prev, name])
  }, [])

  const removeFromBag = useCallback((name) => {
    setBag(prev => prev.filter(n => n !== name))
  }, [])

  const clearBag = useCallback(() => {
    setBag([])
    localStorage.removeItem(makeKey(sheetId))
  }, [sheetId])

  const mergeBag = useCallback((items) => {
    setBag(prev => {
      const next = [...prev]
      items.forEach(item => { if (!next.includes(item)) next.push(item) })
      return next
    })
  }, [])

  return { bag, addToBag, removeFromBag, clearBag, mergeBag }
}
