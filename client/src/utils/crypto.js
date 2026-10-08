// ─── App Lock password hashing ─────────────────────────────────────────────
// PBKDF2-SHA256 with a random per-device salt and 210k iterations (OWASP
// guidance). The old format was a bare unsalted SHA-256 hex digest, which a
// short PIN can be brute-forced from in milliseconds. Old hashes still verify
// and are upgraded on the next successful unlock.
const PBKDF2_ITERATIONS = 210_000

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return new Uint8Array(bits)
}

async function legacySha256Hex(password) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Returns a self-describing string: pbkdf2$<iterations>$<salt>$<hash> */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bufferToBase64(salt)}$${bufferToBase64(hash)}`
}

/** True if `stored` is a legacy hash that should be re-hashed after unlock. */
export function needsRehash(stored) {
  return typeof stored === 'string' && !stored.startsWith('pbkdf2$')
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored) return false
  if (needsRehash(stored)) return timingSafeEqual(await legacySha256Hex(password), stored)
  const [, iter, saltB64, hashB64] = stored.split('$')
  const iterations = Number(iter)
  if (!Number.isInteger(iterations) || iterations < 1 || !saltB64 || !hashB64) return false
  const hash = await pbkdf2(password, base64ToBuffer(saltB64), iterations)
  return timingSafeEqual(bufferToBase64(hash), hashB64)
}

// ─── WebAuthn biometrics helpers ───────────────────────────────────────────

const CRED_KEY = 'clearmind_cred_id'

// Safe base64 encoder — avoids spread operator stack overflow on mobile
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
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

// MUST be called directly from a click handler — no async awaits before this
export async function registerBiometric() {
  try {
    const rpId = window.location.hostname || 'localhost'
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'ClearMyMind', id: rpId },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'clearmymind-user',
          displayName: 'ClearMyMind User',
        },
        pubKeyCredParams: [
          { alg: -7,   type: 'public-key' },  // ES256
          { alg: -257, type: 'public-key' },  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',  // device fingerprint/face
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    })
    if (credential?.rawId) {
      localStorage.setItem(CRED_KEY, bufferToBase64(credential.rawId))
      return true
    }
    return false
  } catch (err) {
    // NotAllowedError = user cancelled or no gesture; other errors = not supported
    console.warn('[ClearMyMind] registerBiometric failed:', err?.name, err?.message)
    return false
  }
}

// MUST be called directly from a click handler — no async awaits before this
export async function verifyBiometric() {
  try {
    const credId = localStorage.getItem(CRED_KEY)
    if (!credId) return false
    const rpId = window.location.hostname || 'localhost'
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId,
        allowCredentials: [{ id: base64ToBuffer(credId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    })
    return isValidAssertion(assertion, credId, challenge)
  } catch (err) {
    console.warn('[ClearMyMind] verifyBiometric failed:', err?.name, err?.message)
    return false
  }
}

// Sanity-check the assertion instead of trusting any truthy result: it must be
// for OUR credential, answer OUR challenge from THIS origin, and carry the
// "user verified" flag (fingerprint/face actually checked).
// NOTE: without a server holding the public key this can't verify the
// signature, so App Lock remains a device-level privacy screen, not a substitute
// for your account password.
function isValidAssertion(assertion, credId, challenge) {
  try {
    if (!assertion?.rawId || bufferToBase64(assertion.rawId) !== credId) return false
    const client = JSON.parse(new TextDecoder().decode(assertion.response.clientDataJSON))
    const expected = bufferToBase64(challenge).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    if (client.type !== 'webauthn.get' || client.challenge !== expected) return false
    if (client.origin !== window.location.origin) return false
    const flags = new Uint8Array(assertion.response.authenticatorData)[32]
    return (flags & 0x01) !== 0 && (flags & 0x04) !== 0   // user present + user verified
  } catch {
    return false
  }
}

export function clearBiometric() {
  localStorage.removeItem(CRED_KEY)
}

// Synchronously checks if a credential ID is already saved
export function hasStoredCredential() {
  return !!localStorage.getItem(CRED_KEY)
}
