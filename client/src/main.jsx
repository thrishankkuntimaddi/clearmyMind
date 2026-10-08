import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Remove keys left behind by the retired App Lock feature (an unsalted
// password hash and a WebAuthn credential id) from this device.
try {
  ;[
    'clearmind_password_hash', 'clearmind_cred_id', 'clearmind_nolock',
    'clearmind_applock_v2', 'clearmind_lock_disabled', 'clearmind_biometric_credential_id',
  ].forEach((k) => localStorage.removeItem(k))
} catch { /* storage unavailable */ }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ── PWA: Register service worker (production only) ───────────────────────────
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}service-worker.js`)
      .catch((err) => console.warn('[SW] Registration failed:', err))
  })
}
