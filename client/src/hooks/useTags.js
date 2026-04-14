// ─── Tag color constants ───────────────────────────────────────────────────────
// macOS-style tag color palette used by TagPicker and NameCell.
// NOTE: The localStorage-based useTags() hook has been removed — all tag state
// is now managed by useFirestoreData (Firestore-backed, multi-device sync).

export const TAG_COLORS = [
  { key: 'red',    hex: '#ef4444', label: 'Red'    },
  { key: 'orange', hex: '#f97316', label: 'Orange' },
  { key: 'yellow', hex: '#eab308', label: 'Yellow' },
  { key: 'green',  hex: '#22c55e', label: 'Green'  },
  { key: 'blue',   hex: '#3b82f6', label: 'Blue'   },
  { key: 'purple', hex: '#a855f7', label: 'Purple' },
  { key: 'gray',   hex: '#6b7280', label: 'Gray'   },
]

export const TAG_MAP = Object.fromEntries(TAG_COLORS.map((t) => [t.key, t]))
