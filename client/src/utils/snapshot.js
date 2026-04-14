// ─── ClearMyMind Rich Snapshot ───────────────────────────────────────────────
// Human-readable text + embedded base64-JSON for lossless round-trip

const HEADER = '═══ ClearMyMind Snapshot'
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

// ── Build ─────────────────────────────────────────────────────────────────────
export function buildSnapshot(names, tags, groups, bag) {
  const now = new Date()
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

  // Embedded JSON for lossless restore
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ names, tags, groups, bag }))))
  L.push('')
  L.push(`${DATA_TAG}${encoded}${DATA_END}`)

  return L.join('\n')
}

// ── Detect ────────────────────────────────────────────────────────────────────
export function isSnapshot(text) {
  return typeof text === 'string' && text.trimStart().startsWith(HEADER)
}

// ── Parse → { names, groups, bag, tags } ─────────────────────────────────────
export function parseSnapshot(text) {
  // Try embedded JSON first (perfect round-trip)
  const si = text.indexOf(DATA_TAG)
  if (si !== -1) {
    const ei = text.indexOf(DATA_END, si + DATA_TAG.length)
    if (ei !== -1) {
      try {
        const d = JSON.parse(decodeURIComponent(escape(atob(text.slice(si + DATA_TAG.length, ei)))))
        return {
          names:  Array.isArray(d.names)              ? d.names  : [],
          groups: d.groups && typeof d.groups === 'object' ? d.groups : {},
          bag:    Array.isArray(d.bag)                ? d.bag    : [],
          tags:   d.tags   && typeof d.tags   === 'object' ? d.tags   : {},
        }
      } catch { /* fall through */ }
    }
  }
  return parseText(text)
}

// ── Human-readable text fallback ─────────────────────────────────────────────
function parseText(text) {
  const r = { names: [], groups: {}, bag: [], tags: {} }
  let section = null, curGid = null, gi = 0

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const t = line.trim()
    if      (line.startsWith('── NAMES'))  { section = 'names';  curGid = null; continue }
    else if (line.startsWith('── GROUPS')) { section = 'groups'; curGid = null; continue }
    else if (line.startsWith('── BAG'))    { section = 'bag';    curGid = null; continue }
    else if (line.startsWith('── COLORS')) { section = 'colors'; curGid = null; continue }
    else if (line.startsWith('═══') || line.startsWith(DATA_TAG)) continue
    if (!t || t === '(none)' || t === '(empty)') continue

    if (section === 'names') {
      r.names.push(t)
    } else if (section === 'groups') {
      const gm = t.match(/^\[(.+)\]$/)
      if (gm) { curGid = `g-i-${gi++}`; r.groups[curGid] = { name: gm[1], members: [] } }
      else if (curGid) { const mm = t.match(/^•\s+(.+)$/); if (mm) r.groups[curGid].members.push(mm[1]) }
    } else if (section === 'bag') {
      const mm = t.match(/^•\s+(.+)$/); if (mm) r.bag.push(mm[1])
    } else if (section === 'colors') {
      const mm = t.match(/^(.+?)\s+→\s+(.+)$/)
      if (mm) { const k = LABEL_TO_KEY[mm[2].trim().toLowerCase()]; if (k) r.tags[mm[1].trim()] = k }
    }
  }
  return r
}
