import { useState, useCallback, useEffect } from 'react'

const GROUPS_KEY = 'clearmind_groups'

function loadGroups() {
  try {
    const raw = localStorage.getItem(GROUPS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}

export function useGroups() {
  const [groups, setGroups] = useState(() => loadGroups())

  useEffect(() => {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups))
  }, [groups])

  const createGroup = useCallback((name) => {
    const id = `g-${Date.now()}`
    setGroups(prev => ({ ...prev, [id]: { name, members: [] } }))
    return id
  }, [])

  const renameGroup = useCallback((id, name) => {
    setGroups(prev => prev[id] ? { ...prev, [id]: { ...prev[id], name } } : prev)
  }, [])

  const deleteGroup = useCallback((id) => {
    setGroups(prev => { const n = { ...prev }; delete n[id]; return n })
  }, [])

  const addToGroup = useCallback((groupId, name) => {
    setGroups(prev => {
      const g = prev[groupId]
      if (!g || g.members.includes(name)) return prev
      return { ...prev, [groupId]: { ...g, members: [...g.members, name] } }
    })
  }, [])

  const removeFromGroup = useCallback((groupId, name) => {
    setGroups(prev => {
      const g = prev[groupId]
      if (!g) return prev
      return { ...prev, [groupId]: { ...g, members: g.members.filter(n => n !== name) } }
    })
  }, [])

  // Call when a name is deleted globally
  const removeNameFromAllGroups = useCallback((name) => {
    setGroups(prev => {
      const next = {}
      Object.entries(prev).forEach(([id, g]) => {
        next[id] = { ...g, members: g.members.filter(n => n !== name) }
      })
      return next
    })
  }, [])

  // Call when a name is renamed
  const renameInGroups = useCallback((oldName, newName) => {
    setGroups(prev => {
      const next = {}
      Object.entries(prev).forEach(([id, g]) => {
        next[id] = { ...g, members: g.members.map(n => n === oldName ? newName : n) }
      })
      return next
    })
  }, [])

  const mergeGroups = useCallback((incoming) => {
    setGroups(prev => {
      const next = { ...prev }
      let i = 0
      Object.values(incoming).forEach(g => {
        const existEntry = Object.entries(next).find(([, eg]) => eg.name === g.name)
        if (existEntry) {
          const [eid, eg] = existEntry
          const merged = [...eg.members]
          g.members.forEach(m => { if (!merged.includes(m)) merged.push(m) })
          next[eid] = { ...eg, members: merged }
        } else {
          next[`g-import-${Date.now()}-${i++}`] = { name: g.name, members: [...g.members] }
        }
      })
      return next
    })
  }, [])

  return { groups, createGroup, renameGroup, deleteGroup, addToGroup, removeFromGroup, removeNameFromAllGroups, renameInGroups, mergeGroups }
}
