/**
 * [ST0014] Logging in with an emailed code, and every request after that
 * signed by a registered device key.
 *
 * Limits (design §4.1):
 *   - a code: 6 digits, 10 minutes, used once, dead after 3 wrong tries
 *   - an IP (IPv6 by /64): 3 failed checks in an hour → frozen for an hour
 *   - sending: one per address per minute, 5 per address and 10 per IP an
 *     hour, 90 a day in all (Resend's free tier stops at 100)
 */

import {
  CLOCK_WINDOW_MS,
  HEADERS,
  importPublicKey,
  isDeviceId,
  normalizeEmail,
  sha256Hex,
  verifySignature,
} from '../lib/cloud-proto.js'
import { clientIp, fail, ipKey, json, parseObject } from './http.js'
import { sendLoginCode } from './mail.js'

const MIN = 60_000
const HOUR = 60 * MIN

export const LIMITS = Object.freeze({
  codeTtlMs: 10 * MIN,
  codeTries: 3,
  freezeFailures: 3,
  freezeMs: HOUR,
  resendGapMs: MIN,
  sendsPerEmailHour: 5,
  sendsPerIpHour: 10,
  sendsPerDay: 90,
  nonceTtlMs: 10 * MIN,
})

const count = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).first())?.n ?? 0

/** When the IP's freeze ends, or 0 when it is not frozen. */
async function frozenUntil(env, key, now) {
  const rows = (await env.DB.prepare(
    "SELECT at FROM auth_events WHERE ip_key = ? AND kind = 'fail' AND at > ? ORDER BY at DESC LIMIT ?",
  ).bind(key, now - LIMITS.freezeMs, LIMITS.freezeFailures).all()).results ?? []
  if (rows.length < LIMITS.freezeFailures) return 0
  return rows[0].at + LIMITS.freezeMs
}

const frozenReply = (until, now) => fail(429, 'frozen', { retryAfter: Math.ceil((until - now) / 1000) })

const codeHash = (env, email, code) => sha256Hex(`${env.PIG_SECRET ?? ''}\n${email}\n${code}`)

/** Six digits, uniformly. */
function newCode() {
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000
  for (;;) {
    const [value] = crypto.getRandomValues(new Uint32Array(1))
    if (value < limit) return String(value % 1_000_000).padStart(6, '0')
  }
}

function allowed(env, email) {
  const list = typeof env.PIG_ALLOWED_EMAILS === 'string' ? env.PIG_ALLOWED_EMAILS.split(',').map(e => e.trim().toLowerCase()).filter(Boolean) : []
  return list.length === 0 || list.includes(email)
}

/** POST /v1/auth/code { email, lang } */
export async function requestCode(request, env, now, text) {
  const body = parseObject(text)
  const email = normalizeEmail(body?.email)
  if (email === null) return fail(400, 'bad-email')
  const key = ipKey(clientIp(request))
  const until = await frozenUntil(env, key, now)
  if (until > now) return frozenReply(until, now)
  if (!allowed(env, email)) return fail(403, 'not-invited')

  const lastSend = (await env.DB.prepare(
    "SELECT MAX(at) AS at FROM auth_events WHERE email = ? AND kind = 'send'",
  ).bind(email).first())?.at ?? 0
  if (now - lastSend < LIMITS.resendGapMs) return fail(429, 'too-soon', { retryAfter: Math.ceil((lastSend + LIMITS.resendGapMs - now) / 1000) })
  if (await count(env, "SELECT COUNT(*) AS n FROM auth_events WHERE email = ? AND kind = 'send' AND at > ?", email, now - HOUR) >= LIMITS.sendsPerEmailHour) return fail(429, 'too-many', { retryAfter: 3600 })
  if (await count(env, "SELECT COUNT(*) AS n FROM auth_events WHERE ip_key = ? AND kind = 'send' AND at > ?", key, now - HOUR) >= LIMITS.sendsPerIpHour) return fail(429, 'too-many', { retryAfter: 3600 })
  if (await count(env, "SELECT COUNT(*) AS n FROM auth_events WHERE kind = 'send' AND at > ?", now - 24 * HOUR) >= LIMITS.sendsPerDay) return fail(503, 'mail-quota')

  const code = newCode()
  await env.DB.prepare(
    'INSERT INTO codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0) ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0',
  ).bind(email, await codeHash(env, email, code), now + LIMITS.codeTtlMs).run()
  await env.DB.prepare("INSERT INTO auth_events (ip_key, email, kind, at) VALUES (?, ?, 'send', ?)").bind(key, email, now).run()

  const lang = ['zh', 'ja', 'en'].includes(body.lang) ? body.lang : 'zh'
  if (!(await sendLoginCode(env, email, code, lang))) {
    await env.DB.prepare('DELETE FROM codes WHERE email = ?').bind(email).run()
    return fail(502, 'mail-failed')
  }
  return json(200, { ok: true, expiresIn: LIMITS.codeTtlMs / 1000 })
}

/** POST /v1/auth/verify { email, code, deviceId, publicKey, deviceName } */
export async function verifyCode(request, env, now, text) {
  const body = parseObject(text)
  const key = ipKey(clientIp(request))
  const until = await frozenUntil(env, key, now)
  if (until > now) return frozenReply(until, now)

  const email = normalizeEmail(body?.email)
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  if (email === null || !/^\d{6}$/.test(code)) return fail(400, 'bad-request')
  if (!isDeviceId(body.deviceId)) return fail(400, 'bad-device')
  if ((await importPublicKey(body.publicKey)) === null) return fail(400, 'bad-key')
  const deviceName = typeof body.deviceName === 'string' && body.deviceName.trim() !== '' ? body.deviceName.trim().slice(0, 60) : 'device'

  const row = await env.DB.prepare('SELECT code_hash, expires_at, attempts FROM codes WHERE email = ?').bind(email).first()
  const right = row !== null && row.expires_at > now && row.code_hash === (await codeHash(env, email, code))
  if (!right) {
    await env.DB.prepare("INSERT INTO auth_events (ip_key, email, kind, at) VALUES (?, ?, 'fail', ?)").bind(key, email, now).run()
    if (row !== null) {
      if (row.attempts + 1 >= LIMITS.codeTries || row.expires_at <= now) await env.DB.prepare('DELETE FROM codes WHERE email = ?').bind(email).run()
      else await env.DB.prepare('UPDATE codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run()
    }
    const frozen = await frozenUntil(env, key, now)
    if (frozen > now) return frozenReply(frozen, now)
    return fail(401, 'wrong-code')
  }
  await env.DB.prepare('DELETE FROM codes WHERE email = ?').bind(email).run()

  let account = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?').bind(email).first()
  if (account === null) {
    account = { id: crypto.randomUUID() }
    await env.DB.prepare('INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)').bind(account.id, email, now).run()
  }
  const existing = await env.DB.prepare('SELECT account_id FROM devices WHERE id = ?').bind(body.deviceId).first()
  if (existing !== null && existing.account_id !== account.id) return fail(409, 'device-taken')
  await env.DB.prepare(
    'INSERT INTO devices (id, account_id, public_key, name, created_at, last_seen_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(id) DO UPDATE SET public_key = excluded.public_key, name = excluded.name, last_seen_at = excluded.last_seen_at, revoked_at = NULL',
  ).bind(body.deviceId, account.id, body.publicKey, deviceName, now, now).run()

  const pig = await env.DB.prepare('SELECT rev, state FROM pigs WHERE account_id = ?').bind(account.id).first()
  return json(200, { ok: true, accountId: account.id, email, hasPig: pig !== null && pig.state !== null, rev: pig?.rev ?? 0 })
}

/**
 * The device behind a signed request, or a reply refusing it.
 * @returns {Promise<{ device: { id, account_id, name } } | { reply: Response }>}
 */
export async function authenticate(request, env, now, text) {
  const deviceId = request.headers.get(HEADERS.device)
  const time = Number(request.headers.get(HEADERS.time))
  const nonce = request.headers.get(HEADERS.nonce) ?? ''
  const signature = request.headers.get(HEADERS.signature) ?? ''
  if (!isDeviceId(deviceId) || !/^[0-9a-f]{16,64}$/.test(nonce)) return { reply: fail(401, 'unsigned') }
  if (!Number.isFinite(time) || Math.abs(now - time) > CLOCK_WINDOW_MS) return { reply: fail(401, 'clock', { serverNow: now }) }

  const device = await env.DB.prepare('SELECT id, account_id, public_key, name, revoked_at FROM devices WHERE id = ?').bind(deviceId).first()
  if (device === null || device.revoked_at !== null) return { reply: fail(401, 'unknown-device') }
  const key = await importPublicKey(device.public_key)
  const url = new URL(request.url)
  const ok = key !== null && await verifySignature({ key, signature, method: request.method, path: url.pathname + url.search, time, nonce, body: text })
  if (!ok) return { reply: fail(401, 'bad-signature') }

  await env.DB.prepare('DELETE FROM nonces WHERE at < ?').bind(now - LIMITS.nonceTtlMs).run()
  const fresh = await env.DB.prepare('INSERT INTO nonces (device_id, nonce, at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').bind(deviceId, nonce, now).run()
  if ((fresh.meta?.changes ?? 0) === 0) return { reply: fail(401, 'replayed') }
  await env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(now, deviceId).run()
  return { device: { id: device.id, account_id: device.account_id, name: device.name } }
}

/** GET /v1/me */
export async function me(env, device) {
  const account = await env.DB.prepare('SELECT email FROM accounts WHERE id = ?').bind(device.account_id).first()
  const devices = (await env.DB.prepare(
    'SELECT id, name, created_at AS createdAt, last_seen_at AS lastSeenAt FROM devices WHERE account_id = ? AND revoked_at IS NULL ORDER BY created_at',
  ).bind(device.account_id).all()).results ?? []
  const pig = await env.DB.prepare('SELECT rev, state FROM pigs WHERE account_id = ?').bind(device.account_id).first()
  return json(200, {
    ok: true, email: account?.email ?? null, deviceId: device.id,
    devices: devices.map(d => ({ ...d, current: d.id === device.id })),
    hasPig: pig !== null && pig.state !== null, rev: pig?.rev ?? 0,
  })
}

/** POST /v1/devices/revoke { deviceId } — any device of the account, itself included. */
export async function revokeDevice(env, device, now, text) {
  const body = parseObject(text)
  if (!isDeviceId(body?.deviceId)) return fail(400, 'bad-device')
  const result = await env.DB.prepare('UPDATE devices SET revoked_at = ? WHERE id = ? AND account_id = ? AND revoked_at IS NULL').bind(now, body.deviceId, device.account_id).run()
  if ((result.meta?.changes ?? 0) === 0) return fail(404, 'no-such-device')
  return json(200, { ok: true })
}
