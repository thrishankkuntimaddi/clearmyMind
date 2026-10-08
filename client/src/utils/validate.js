// ─── Input limits ─────────────────────────────────────────────────────────────
// Keep every user's data comfortably inside Firestore's 1 MiB-per-document cap
// and stop pasted/imported junk from bloating or corrupting documents.
export const MAX_NAME_LEN        = 100
export const MAX_SHEET_NAME_LEN  = 40
export const MAX_SHEETS          = 30
export const MAX_NAMES_PER_SHEET = 500
export const MAX_GROUPS          = 50

const SHEET_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export const TAG_KEYS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray']

export function toTitleCase(str) {
  return str.trim().toLowerCase().replace(/(?:^|\s)\S/g, (ch) => ch.toUpperCase())
}

/** Normalise a raw name. Returns '' when the input is unusable. */
export function cleanName(raw) {
  if (typeof raw !== 'string') return ''
  // Strip control characters, collapse whitespace, cap length
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return toTitleCase(s.slice(0, MAX_NAME_LEN))
}

export function cleanSheetName(raw) {
  if (typeof raw !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SHEET_NAME_LEN)
}

// Sheet ids become object keys and Firestore field names: reject anything that
// could pollute prototypes or collide with reserved/metadata fields.
const RESERVED_IDS = new Set(['updatedAt', 'constructor', 'prototype', 'schema', 'sheets'])

export function isValidSheetId(id) {
  return typeof id === 'string' && SHEET_ID_RE.test(id) && !id.startsWith('__') && !RESERVED_IDS.has(id)
}

/** Names key the colour map; Firestore reserves `__name__`-style keys. */
export function canTag(name) {
  return typeof name === 'string' && name.length > 0 && !/^__.*__$/.test(name)
}

export function sortNames(arr) {
  return [...arr].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/** Clean + case-insensitively dedupe a list of names against `existing`. */
export function mergeNames(existing, incoming) {
  const seen = new Set(existing.map((n) => n.toLowerCase()))
  const out  = [...existing]
  for (const raw of incoming) {
    if (out.length >= MAX_NAMES_PER_SHEET) break
    const n = cleanName(raw)
    if (!n || seen.has(n.toLowerCase())) continue
    seen.add(n.toLowerCase())
    out.push(n)
  }
  return sortNames(out)
}
