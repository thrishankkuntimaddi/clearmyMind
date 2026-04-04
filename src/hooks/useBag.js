import { useState, useCallback, useEffect } from 'react'

const BAG_KEY = 'clearmind_bag'

function loadBag() {
  try {
    const raw = localStorage.getItem(BAG_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function useBag() {
  const [bag, setBag] = useState(() => loadBag())

  useEffect(() => {
    localStorage.setItem(BAG_KEY, JSON.stringify(bag))
  }, [bag])

  const addToBag = useCallback((name) => {
    setBag(prev => prev.includes(name) ? prev : [...prev, name])
  }, [])

  const removeFromBag = useCallback((name) => {
    setBag(prev => prev.filter(n => n !== name))
  }, [])

  const clearBag = useCallback(() => setBag([]), [])

  const mergeBag = useCallback((items) => {
    setBag(prev => {
      const next = [...prev]
      items.forEach(item => { if (!next.includes(item)) next.push(item) })
      return next
    })
  }, [])

  return { bag, addToBag, removeFromBag, clearBag, mergeBag }
}
