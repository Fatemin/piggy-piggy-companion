/**
 * [ST0014] The wire between a device and the cloud pig, shared by both ends.
 *
 * Web Crypto only (no node: imports), so the Workers runtime and Node load the
 * same file. A request is signed with the device's Ed25519 key over
 *
 *   PIG1 \n METHOD \n path?query \n time \n nonce \n sha256hex(body)
 *
 * and carries that in four `x-pig-*` headers; the server checks the device is
 * registered, the time is near, the nonce is fresh and the signature holds.
 */

export const PROTOCOL = 'PIG1'

export const HEADERS = Object.freeze({
  device: 'x-pig-device',
  time: 'x-pig-time',
  nonce: 'x-pig-nonce',
  signature: 'x-pig-sig',
})

/** How far a request's clock may be from the server's. */
export const CLOCK_WINDOW_MS = 5 * 60_000

const encoder = new TextEncoder()

export function toBase64Url(bytes) {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Bytes from base64url, or null when it is not. */
export function fromBase64Url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) return null
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4))
    return Uint8Array.from(binary, char => char.charCodeAt(0))
  } catch {
    return null
  }
}

export function hex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
}

export function randomHex(byteCount) {
  return hex(crypto.getRandomValues(new Uint8Array(byteCount)))
}

/** The exact bytes a request signature covers. */
export async function signingMessage({ method, path, time, nonce, body }) {
  return encoder.encode([PROTOCOL, method.toUpperCase(), path, String(time), nonce, await sha256Hex(body ?? '')].join('\n'))
}

/** A fresh device key pair; the public half as base64url raw bytes. */
export async function newDeviceKey() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const publicKey = toBase64Url(await crypto.subtle.exportKey('raw', pair.publicKey))
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  return { publicKey, privateJwk }
}

export async function importPrivateKey(privateJwk) {
  return crypto.subtle.importKey('jwk', privateJwk, { name: 'Ed25519' }, false, ['sign'])
}

/** A usable Ed25519 public key from base64url, or null. */
export async function importPublicKey(publicKey) {
  const raw = fromBase64Url(publicKey)
  if (raw === null || raw.length !== 32) return null
  try {
    return await crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify'])
  } catch {
    return null
  }
}

/** The four headers for one signed request. */
export async function signRequest({ deviceId, key, method, path, body = '', time = Date.now(), nonce = randomHex(16) }) {
  const message = await signingMessage({ method, path, time, nonce, body })
  const signature = toBase64Url(await crypto.subtle.sign({ name: 'Ed25519' }, key, message))
  return {
    [HEADERS.device]: deviceId,
    [HEADERS.time]: String(time),
    [HEADERS.nonce]: nonce,
    [HEADERS.signature]: signature,
  }
}

export async function verifySignature({ key, signature, method, path, time, nonce, body }) {
  const bytes = fromBase64Url(signature)
  if (bytes === null || bytes.length !== 64) return false
  try {
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, bytes, await signingMessage({ method, path, time, nonce, body }))
  } catch {
    return false
  }
}

/** A device id: what the client generates (a UUID), loosely. */
export const isDeviceId = value => typeof value === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(value)

/** Lower-cased, trimmed, and plausibly an address; null otherwise. */
export function normalizeEmail(value) {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}
