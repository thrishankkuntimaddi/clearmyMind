// SHA-256 hash via Web Crypto API
export async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── WebAuthn biometrics helpers ───────────────────────────────────────────

const CRED_KEY = 'clearmind_cred_id'

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function base64ToBuffer(base64) {
  const binary = atob(base64)
  const buf = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
  return buf
}

export async function isBiometricAvailable() {
  try {
    if (!window.PublicKeyCredential) return false
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export async function registerBiometric() {
  try {
    const rpId = window.location.hostname || 'localhost'
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'ClearMyMind', id: rpId },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'user',
          displayName: 'User',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 60000,
      },
    })
    if (credential) {
      localStorage.setItem(CRED_KEY, bufferToBase64(credential.rawId))
      return true
    }
    return false
  } catch {
    return false
  }
}

export async function verifyBiometric() {
  try {
    const credId = localStorage.getItem(CRED_KEY)
    if (!credId) return false
    const rpId = window.location.hostname || 'localhost'
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId,
        allowCredentials: [{ id: base64ToBuffer(credId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    })
    return !!assertion
  } catch {
    return false
  }
}

export function clearBiometric() {
  localStorage.removeItem(CRED_KEY)
}
