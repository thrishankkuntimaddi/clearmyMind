/**
 * date.js — Server-side date utilities.
 * Mirrors EveryDay's server/src/utils/date.js exactly.
 */

/**
 * Returns today's date as "YYYY-MM-DD" in local time.
 */
export function todayKey() {
  const d   = new Date()
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Check if a date string (YYYY-MM-DD) was yesterday.
 * @param {string} dateStr
 */
export function isYesterday(dateStr) {
  const d         = new Date(dateStr + 'T00:00:00')
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return d.toDateString() === yesterday.toDateString()
}
