import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

// Guard: if credentials are missing, skip init so the app can show setup instructions
export const isConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId)

let app  = null
let auth = null
let db   = null

if (isConfigured) {
  try {
    app  = initializeApp(firebaseConfig)
    auth = getAuth(app)

    // Enable IndexedDB offline persistence so that on every page reload
    // Firestore returns cached data INSTANTLY from the local IndexedDB store —
    // even before the network round-trip completes. Without this, every refresh
    // starts cold: getDoc goes to the network, and if the Firebase auth token
    // is still being refreshed at that moment, the read gets PERMISSION_DENIED,
    // returns null, and the app mistakenly seeds "new user" defaults, wiping data.
    //
    // persistentMultipleTabManager allows multiple open tabs to share the cache
    // safely (one tab is the primary, others sync from it).
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  } catch (e) {
    console.error('[ClearMyMind] Firebase init failed:', e)
  }
}

export { auth, db }
export default app
