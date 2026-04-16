// ─── ClearMyMind Rich Snapshot ────────────────────────────────────────────────
// Supports two formats:
//
//  v1 (legacy, single-sheet):  { names, tags, groups, bag }
//  v2 (multi-sheet):           { _version: 2, sheets, namesBySheet, tagsBySheet, groups, bag }
//
// buildFullSnapshot()  → always produces v2
// buildSnapshot()      → kept for backward compat (produces v1, single-sheet only)
// isSnapshot()         → detects either format by header
// parseSnapshot()      → returns v2 shape; upgrades v1 to v2 automatically

const HEADER   = '═══ ClearMyMind Snapshot'
const DATA_TAG = '[cmm:'
const DATA_END = ']'

const TAG_LABELS = {
  red: 'Red', orange: 'Orange', yellow: 'Yellow',
  green: 'Green', blue: 'Blue', purple: 'Purple', gray: 'Gray',
}

const LABEL_TO_KEY = Object.fromEntries(
  Object.entries(TAG_LABELS).flatMap(([k, v]) => [
    [v.toLowerCase(), k], [k.toLowerCase(), k],
  ])
)

// ── Detect ────────────────────────────────────────────────────────────────────
export function isSnapshot(text) {
  return typeof text === 'string' && text.trimStart().startsWith(HEADER)
}

// ── Build (v2 — all sheets) ───────────────────────────────────────────────────
/**
 * Build a full multi-sheet snapshot.
 *
 * @param {Array}  sheets       – [{ id, name }, …]
 * @param {Object} namesBySheet – { [sheetId]: string[] }
 * @param {Object} tagsBySheet  – { [sheetId]: { [name]: colorKey } }
 * @param {Object} groups       – { [id]: { name, members } }
 * @param {Array}  bag          – string[]
 */
export function buildFullSnapshot(sheets, namesBySheet, tagsBySheet, groups, bag) {
  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const totalNames = sheets.reduce((s, sh) => s + (namesBySheet[sh.id]?.length ?? 0), 0)

  const L = []
  L.push(`${HEADER} — ${dateStr}, ${timeStr} ═══`)
  L.push(`v2 · ${sheets.length} sheet${sheets.length !== 1 ? 's' : ''} · ${totalNames} name${totalNames !== 1 ? 's' : ''} total`)
  L.push('')

  // ── Per-sheet sections ──────────────────────────────────────────────────────
  sheets.forEach((sheet) => {
    const names = namesBySheet[sheet.id] ?? []
    const tags  = tagsBySheet[sheet.id]  ?? {}

    L.push(`── SHEET: ${sheet.name} ──`)
    L.push(`   id: ${sheet.id}`)

    L.push(`   NAMES (${names.length})`)
    names.length ? names.forEach(n => L.push(`     ${n}`)) : L.push('     (none)')

    const tArr = Object.entries(tags)
    L.push(`   COLORS (${tArr.length})`)
    tArr.length
      ? tArr.forEach(([name, key]) => L.push(`     ${name} → ${TAG_LABELS[key] ?? key}`))
      : L.push('     (none)')

    L.push('')
  })

  // ── Groups ─────────────────────────────────────────────────────────────────
  const gArr = Object.values(groups)
  L.push(`── GROUPS (${gArr.length}) ──`)
  if (!gArr.length) {
    L.push('  (none)')
  } else {
    gArr.forEach(g => {
      L.push(`  [${g.name}]`)
      g.members.length ? g.members.forEach(m => L.push(`    • ${m}`)) : L.push('    (empty)')
    })
  }
  L.push('')

  // ── Bag ────────────────────────────────────────────────────────────────────
  L.push(`── BAG (${bag.length}) ──`)
  bag.length ? bag.forEach(n => L.push(`  • ${n}`)) : L.push('  (none)')

  // ── Embedded JSON (perfect round-trip) ─────────────────────────────────────
  const payload = { _version: 2, sheets, namesBySheet, tagsBySheet, groups, bag }
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
  L.push('')
  L.push(`${DATA_TAG}${encoded}${DATA_END}`)

  return L.join('\n')
}

// ── Build (v1 — single-sheet legacy, kept for compat) ─────────────────────────
export function buildSnapshot(names, tags, groups, bag) {
  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const L = []
  L.push(`${HEADER} — ${dateStr}, ${timeStr} ═══`)
  L.push('')

  L.push(`── NAMES (${names.length}) ──`)
  names.length ? names.forEach(n => L.push(`  ${n}`)) : L.push('  (none)')
  L.push('')

  const gArr = Object.values(groups)
  L.push(`── GROUPS (${gArr.length}) ──`)
  if (!gArr.length) {
    L.push('  (none)')
  } else {
    gArr.forEach(g => {
      L.push(`  [${g.name}]`)
      g.members.length ? g.members.forEach(m => L.push(`    • ${m}`)) : L.push('    (empty)')
    })
  }
  L.push('')

  L.push(`── BAG (${bag.length}) ──`)
  bag.length ? bag.forEach(n => L.push(`  • ${n}`)) : L.push('  (none)')
  L.push('')

  const tArr = Object.entries(tags)
  L.push(`── COLORS (${tArr.length}) ──`)
  tArr.length
    ? tArr.forEach(([name, key]) => L.push(`  ${name} → ${TAG_LABELS[key] ?? key}`))
    : L.push('  (none)')

  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ names, tags, groups, bag }))))
  L.push('')
  L.push(`${DATA_TAG}${encoded}${DATA_END}`)

  return L.join('\n')
}

// ── Parse → always returns v2 shape ──────────────────────────────────────────
/**
 * Returns:
 *   {
 *     _version: 2,
 *     sheets: [{ id, name }],
 *     namesBySheet: { [sheetId]: string[] },
 *     tagsBySheet:  { [sheetId]: { [name]: colorKey } },
 *     groups: { [id]: { name, members } },
 *     bag: string[],
 *   }
 *
 * v1 snapshots are automatically promoted: all names/tags go into the first sheet.
 */
export function parseSnapshot(text) {
  // Try embedded JSON first (perfect round-trip)
  const si = text.indexOf(DATA_TAG)
  if (si !== -1) {
    const ei = text.indexOf(DATA_END, si + DATA_TAG.length)
    if (ei !== -1) {
      try {
        const d = JSON.parse(decodeURIComponent(escape(atob(text.slice(si + DATA_TAG.length, ei)))))
        if (d._version === 2) {
          // Native v2 — validate shape and return
          return {
            _version:    2,
            sheets:      Array.isArray(d.sheets)              ? d.sheets      : [{ id: 'sheet-1', name: 'Sheet 1' }],
            namesBySheet: d.namesBySheet && typeof d.namesBySheet === 'object' ? d.namesBySheet : {},
            tagsBySheet:  d.tagsBySheet  && typeof d.tagsBySheet  === 'object' ? d.tagsBySheet  : {},
            groups:       d.groups       && typeof d.groups       === 'object' ? d.groups       : {},
            bag:          Array.isArray(d.bag)                ? d.bag         : [],
          }
        }
        // v1 JSON — promote to v2 (all data into first sheet)
        const sheetId = 'sheet-1'
        return {
          _version:    2,
          sheets:      [{ id: sheetId, name: 'Sheet 1' }],
          namesBySheet: { [sheetId]: Array.isArray(d.names) ? d.names : [] },
          tagsBySheet:  { [sheetId]: d.tags && typeof d.tags === 'object' ? d.tags : {} },
          groups:       d.groups && typeof d.groups === 'object' ? d.groups : {},
          bag:          Array.isArray(d.bag) ? d.bag : [],
        }
      } catch { /* fall through to text parser */ }
    }
  }
  // Human-readable text fallback (promotes to v2 as single sheet)
  return parseTextToV2(text)
}

// ── Human-readable text fallback → v2 ────────────────────────────────────────
function parseTextToV2(text) {
  const sheetId = 'sheet-1'
  const names   = []
  const tags    = {}
  const groups  = {}
  const bag     = []
  let section = null, curGid = null, gi = 0

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const t    = line.trim()
    if      (line.includes('── NAMES'))  { section = 'names';  curGid = null; continue }
    else if (line.includes('── GROUPS')) { section = 'groups'; curGid = null; continue }
    else if (line.includes('── BAG'))    { section = 'bag';    curGid = null; continue }
    else if (line.includes('── COLORS')) { section = 'colors'; curGid = null; continue }
    else if (line.startsWith('═══') || line.startsWith(DATA_TAG)) continue
    if (!t || t === '(none)' || t === '(empty)') continue

    if (section === 'names') {
      names.push(t)
    } else if (section === 'groups') {
      const gm = t.match(/^\[(.+)\]$/)
      if (gm) { curGid = `g-i-${gi++}`; groups[curGid] = { name: gm[1], members: [] } }
      else if (curGid) { const mm = t.match(/^•\s+(.+)$/); if (mm) groups[curGid].members.push(mm[1]) }
    } else if (section === 'bag') {
      const mm = t.match(/^•\s+(.+)$/); if (mm) bag.push(mm[1])
    } else if (section === 'colors') {
      const mm = t.match(/^(.+?)\s+→\s+(.+)$/)
      if (mm) { const k = LABEL_TO_KEY[mm[2].trim().toLowerCase()]; if (k) tags[mm[1].trim()] = k }
    }
  }

  return {
    _version:    2,
    sheets:      [{ id: sheetId, name: 'Sheet 1' }],
    namesBySheet: { [sheetId]: names },
    tagsBySheet:  { [sheetId]: tags },
    groups,
    bag,
  }
}
