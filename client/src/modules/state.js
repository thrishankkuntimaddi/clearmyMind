/**
 * state.js — ClearMyMind Global STATE Singleton
 * ================================================
 * Mirrors EveryDay's src/modules/state.js pattern.
 *
 * Holds cross-module, non-React read-only state used by listeners,
 * event handlers, and utility functions that live outside the React tree.
 *
 * React components use their own useState / hooks for reactive rendering.
 * STATE here exists for:
 *   - auth state tracking (which phase are we in?)
 *   - current user UID (available synchronously to any module)
 *   - flags readable by event handlers without closing over stale refs
 *
 * USAGE:
 *   import { STATE } from './state.js'
 *   STATE.uid = user.uid        // write
 *   if (STATE.authReady) { … }  // read
 */

export const STATE = {
  // ── Auth ───────────────────────────────────────────────────────────────────
  /** Firebase auth phase: 'loading' | 'unauthenticated' | 'unverified' | 'authenticated' | 'not-configured' */
  authState: 'loading',

  /** Firebase UID of the authenticated user, or null */
  uid: null,

  /** User's email address (convenience) */
  email: null,

  // ── App Lock ───────────────────────────────────────────────────────────────
  /** Whether the device-level App Lock is currently engaged */
  locked: false,

  // ── Data ───────────────────────────────────────────────────────────────────
  /** True after the initial Firestore fetch is complete */
  dataReady: false,

  /** Active sheet ID (mirror of Firestore — updated on sheet switch) */
  activeSheetId: 'sheet-1',

  // ── UI ─────────────────────────────────────────────────────────────────────
  /** Current view/tab name (reserved for future non-React navigation) */
  currentView: 'grid',
}
