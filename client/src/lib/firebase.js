import { initializeApp } from 'firebase/app'
import { getAuth, setPersistence, indexedDBLocalPersistence } from 'firebase/auth'
import { initializeFirestore, memoryLocalCache, clearIndexedDbPersistence } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

// Guard: if credentials are missing, skip init so the app can show setup instructions
export const isConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId)

let app  = null
let auth = null
let db   = null
// Resolves once Firestore is safe to use (old on-disk cache cleared).
let dbReady = Promise.resolve()

if (isConfigured) {
  try {
    app  = initializeApp(firebaseConfig)
    auth = getAuth(app)
    setPersistence(auth, indexedDBLocalPersistence).catch((e) => {
      console.warn('[ClearMyMind] Could not set IndexedDB auth persistence:', e.code)
    })

    // Memory-only cache: your names are never written to this device's disk,
    // so nothing is left behind on a shared computer after you sign out.
    db = initializeFirestore(app, { localCache: memoryLocalCache() })

    // Earlier versions persisted Firestore data to IndexedDB. Remove that
    // leftover copy. Must run before the first Firestore read/write.
    dbReady = clearIndexedDbPersistence(db).catch(() => { /* nothing to clear */ })
  } catch (e) {
    console.error('[ClearMyMind] Firebase init failed:', e)
  }
}

export { auth, db, dbReady }
export default app
