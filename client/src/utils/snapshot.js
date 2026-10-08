// ─── ClearMyMind Snapshot ─────────────────────────────────────────────────────
// A human-readable text export with an embedded base64 JSON payload for a
// perfect round-trip. Paste it back into Load to restore.
//
//  v2 payload:  { _version: 2, sheets, namesBySheet, tagsBySheet }
//  Older payloads (v1 single-sheet, or v2 with groups/bag) are still accepted:
//  groups are ignored and bag items are imported into a "Bag" sheet.
//
// Snapshot text is untrusted input — parseSnapshot() validates every field.

import { isValidSheetId, cleanName, cleanSheetName, canTag, TAG_KEYS, MAX_SHEETS, MAX_NAMES_PER_SHEET } from './validate.js'

const HEADER   = '═══ ClearMyMind Snapshot'
const DATA_TAG = '[cmm:'
const DATA_END = ']'
const MAX_SNAPSHOT_CHARS = 2_000_000

const TAG_LABELS = {
  red: 'Red', orange: 'Orange', yellow: 'Yellow',
  green: 'Green', blue: 'Blue', purple: 'Purple', gray: 'Gray',
}

const LABEL_TO_KEY = Object.fromEntries(
  Object.entries(TAG_LABELS).flatMap(([k, v]) => [[v.toLowerCase(), k], [k, k]]),
)

function toBase64(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function fromBase64(b64) {
  const bin   = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

// ── Detect ────────────────────────────────────────────────────────────────────
export function isSnapshot(text) {
  return typeof text === 'string' && text.length <= MAX_SNAPSHOT_CHARS && text.trimStart().startsWith(HEADER)
}

// ── Build ─────────────────────────────────────────────────────────────────────
export function buildFullSnapshot(sheets, namesBySheet, tagsBySheet) {
  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const total   = sheets.reduce((s, sh) => s + (namesBySheet[sh.id]?.length ?? 0), 0)

  const L = []
  L.push(`${HEADER} — ${dateStr}, ${timeStr} ═══`)
  L.push(`v2 · ${sheets.length} sheet${sheets.length !== 1 ? 's' : ''} · ${total} name${total !== 1 ? 's' : ''} total`)
  L.push('')

  sheets.forEach((sheet) => {
    const names = namesBySheet[sheet.id] ?? []
    const tags  = tagsBySheet[sheet.id]  ?? {}
    L.push(`── SHEET: ${sheet.name} ──`)
    L.push(`   NAMES (${names.length})`)
    names.length ? names.forEach((n) => L.push(`     ${n}`)) : L.push('     (none)')
    const tArr = Object.entries(tags)
    L.push(`   COLORS (${tArr.length})`)
    tArr.length
      ? tArr.forEach(([name, key]) => L.push(`     ${name} → ${TAG_LABELS[key] ?? key}`))
      : L.push('     (none)')
    L.push('')
  })

  const payload = {
    _version: 2,
    sheets: sheets.map(({ id, name }) => ({ id, name })),
    namesBySheet: Object.fromEntries(sheets.map((s) => [s.id, namesBySheet[s.id] ?? []])),
    tagsBySheet:  Object.fromEntries(sheets.map((s) => [s.id, tagsBySheet[s.id] ?? {}])),
  }
  L.push(`${DATA_TAG}${toBase64(JSON.stringify(payload))}${DATA_END}`)
  return L.join('\n')
}

// ── Sanitise any decoded payload into the v2 shape ───────────────────────────
function sanitize(raw) {
  const sheets = []
  const namesBySheet = {}
  const tagsBySheet  = {}

  const addSheet = (id, name, names, tags) => {
    if (sheets.length >= MAX_SHEETS || !isValidSheetId(id) || sheets.some((s) => s.id === id)) return
    sheets.push({ id, name: cleanSheetName(name) || 'Imported' })
    namesBySheet[id] = (Array.isArray(names) ? names : [])
      .map(cleanName).filter(Boolean).slice(0, MAX_NAMES_PER_SHEET)
    tagsBySheet[id] = Object.fromEntries(
      Object.entries(tags && typeof tags === 'object' ? tags : {})
        .filter(([n, c]) => canTag(n) && TAG_KEYS.includes(c)),
    )
  }

  if (raw && raw._version === 2 && Array.isArray(raw.sheets)) {
    for (const s of raw.sheets) {
      if (!s || typeof s !== 'object') continue
      addSheet(s.id, s.name, raw.namesBySheet?.[s.id], raw.tagsBySheet?.[s.id])
    }
  } else if (raw && typeof raw === 'object') {
    addSheet('sheet-1', 'Sheet 1', raw.names, raw.tags)   // v1: single sheet
  }

  // Legacy bag → its own sheet
  if (Array.isArray(raw?.bag) && raw.bag.length) addSheet('sheet-bag', 'Bag', raw.bag, {})

  return { _version: 2, sheets, namesBySheet, tagsBySheet }
}

// ── Parse → always returns a validated v2 shape ──────────────────────────────
export function parseSnapshot(text) {
  if (typeof text !== 'string' || text.length > MAX_SNAPSHOT_CHARS) return sanitize(null)
  const si = text.indexOf(DATA_TAG)
  if (si !== -1) {
    const ei = text.indexOf(DATA_END, si + DATA_TAG.length)
    if (ei !== -1) {
      try {
        return sanitize(JSON.parse(fromBase64(text.slice(si + DATA_TAG.length, ei))))
      } catch { /* fall through to the text parser */ }
    }
  }
  return sanitize(parseText(text))
}

// ── Human-readable fallback (single sheet: names, colours, bag) ──────────────
function parseText(text) {
  const names = []
  const tags  = {}
  const bag   = []
  let section = null

  for (const raw of text.split('\n')) {
    const t = raw.trim()
    if      (/── (SHEET:|NAMES)/.test(raw) || /^NAMES \(/.test(t)) { section = 'names';  continue }
    else if (raw.includes('── GROUPS'))                            { section = 'groups'; continue }
    else if (raw.includes('── BAG'))                               { section = 'bag';    continue }
    else if (raw.includes('── COLORS') || /^COLORS \(/.test(t))    { section = 'colors'; continue }
    if (!t || t.startsWith('═══') || t.startsWith(DATA_TAG) || t.startsWith('id: ') || t === '(none)' || t === '(empty)') continue

    if (section === 'names') {
      names.push(t)
    } else if (section === 'bag') {
      const m = t.match(/^•\s+(.+)$/)
      if (m) bag.push(m[1])
    } else if (section === 'colors') {
      const m = t.match(/^(.+?)\s+→\s+(.+)$/)
      const k = m && LABEL_TO_KEY[m[2].trim().toLowerCase()]
      if (k) tags[m[1].trim()] = k
    }
  }
  return { names, tags, bag }
}
