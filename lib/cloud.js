/**
 * [ST0014] This machine's side of the cloud pig.
 *
 * Login: an emailed code, then a device key made here; the private half never
 * leaves `<save>.cloud.json` (0600). After that every request is signed.
 *
 * Sync: while linked, every op the store does is appended to
 * `<save>.outbox.jsonl` (by whichever process holds the save lock). The panel
 * server, which holds that lock while it runs, sends the outbox, adopts the
 * pig the server settled and redoes on top whatever happened meanwhile.
 *
 * Linking (the first sync after logging in) is the one place a whole pig
 * crosses the wire — design §5.3:
 *   - the cloud has no living pig, this machine has one → upload it
 *   - the cloud has one, this machine has none (or the same pig) → adopt it
 *   - both have different living pigs → ask; the cloud's wins or you log out
 */

import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'

import { LOCAL_OPS } from '../ops.js'
import { importPrivateKey, newDeviceKey, normalizeEmail, signRequest } from './cloud-proto.js'
import { cloudPath, cloudUrl, outboxPath } from './config.js'

const IDLE_SYNC_MS = 60_000
const SOON_MS = 3_000
const MAX_BACKOFF_MS = 5 * 60_000
const NOTICE_LIMIT = 5
// [ST0014 P3] how often to look at the pen: often while in one, rarely when not.
const PEN_IN_MS = 30_000
const PEN_OUT_MS = 5 * 60_000

// ---- files --------------------------------------------------------------

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

function writePrivate(path, value) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 })
  renameSync(tmp, path)
}

export function readOutbox(statePath) {
  let text = ''
  try { text = readFileSync(outboxPath(statePath), 'utf8') } catch { return [] }
  const ops = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try { ops.push(JSON.parse(line)) } catch { /* a torn last line from a crash */ }
  }
  return ops
}

function writeOutbox(statePath, ops) {
  const path = outboxPath(statePath)
  if (ops.length === 0) {
    rmSync(path, { force: true })
    return
  }
  const tmp = `${path}.tmp`
  writeFileSync(tmp, ops.map(op => JSON.stringify(op)).join('\n') + '\n', { mode: 0o600 })
  renameSync(tmp, path)
}

/**
 * Remember one op for the cloud, when this save is linked to it. Called by the
 * store's op listener in every process that writes the save (under its lock).
 */
export function recordOp(statePath, op) {
  if (LOCAL_OPS.includes(op.op)) return
  const config = readJson(cloudPath(statePath))
  if (config?.linked !== true) return
  writeFileSync(outboxPath(statePath), JSON.stringify(op) + '\n', { flag: 'a', mode: 0o600 })
}

// ---- the sync client -------------------------------------------------------

const living = state => state !== null && state !== undefined && state.hatched === true && state.dead !== true

/**
 * @param options.statePath - the save this login belongs to
 * @param options.store - the live store (from the plugin's `onStore`)
 * @param options.fetch / now / setTimer / clearTimer - injectable for tests
 */
export function createCloud({
  statePath,
  store,
  fetch: doFetch = globalThis.fetch,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  deviceName = hostname(),
  defaultServer = cloudUrl(),
}) {
  const configFile = cloudPath(statePath)
  let config = readJson(configFile)
  let pendingLogin = null // { server, email } between sending a code and typing it
  let phase = config === null ? 'signed-out' : (config.linked === true ? 'idle' : 'linking')
  let lastSyncAt = 0
  let lastError = null
  let notices = []
  let conflict = null // { cloud, local } summaries while asking which pig to keep
  let skewMs = 0
  let timer = null
  let busy = false
  let again = false
  let backoffMs = 0
  let running = false
  let keyPromise = null
  let pen = null // the pig pen as the server last showed it (undefined until asked)
  let penAt = 0

  const save = () => writePrivate(configFile, config)
  const privateKey = () => {
    keyPromise ??= importPrivateKey(config.privateJwk)
    return keyPromise
  }

  async function call(server, method, path, body, { signed = false } = {}) {
    const text = body === undefined ? undefined : JSON.stringify(body)
    const headers = { 'content-type': 'application/json' }
    if (signed) Object.assign(headers, await signRequest({ deviceId: config.deviceId, key: await privateKey(), method, path, body: text ?? '', time: now() + skewMs }))
    let response
    try {
      response = await doFetch(`${server}${path}`, { method, headers, body: text })
    } catch (error) {
      return { status: 0, body: { ok: false, reason: 'offline', message: error instanceof Error ? error.message : String(error) } }
    }
    let parsed = null
    try { parsed = await response.json() } catch { parsed = { ok: false, reason: 'bad-reply' } }
    return { status: response.status, body: parsed }
  }

  /** A signed call that corrects for this machine's clock once if the server says it is off. */
  async function signedCall(method, path, body) {
    let reply = await call(config.server, method, path, body, { signed: true })
    if (reply.status === 401 && reply.body?.reason === 'clock' && Number.isFinite(reply.body.serverNow)) {
      skewMs = reply.body.serverNow - now()
      reply = await call(config.server, method, path, body, { signed: true })
    }
    if (reply.status === 401 && ['unknown-device', 'bad-signature'].includes(reply.body?.reason)) {
      // Revoked from another device: this login is over.
      signOut()
      lastError = 'revoked'
    }
    return reply
  }

  function schedule(ms) {
    if (!running || config?.linked !== true) return
    if (timer !== null) clearTimer(timer)
    timer = setTimer(() => {
      timer = null
      sync().catch(() => {})
    }, ms)
    if (typeof timer?.unref === 'function') timer.unref()
  }

  function signOut() {
    config = null
    pen = null
    penAt = 0
    pendingLogin = null
    conflict = null
    keyPromise = null
    phase = 'signed-out'
    rmSync(configFile, { force: true })
    writeOutbox(statePath, [])
    if (timer !== null) clearTimer(timer)
    timer = null
  }

  /** This machine's pig as it is now (the save on disk may lag a write behind). */
  function backup() {
    if (store.state === null) return null
    const path = `${statePath}.before-cloud-${now()}.json`
    try { writeFileSync(path, JSON.stringify(store.state, null, 2)) } catch { return null }
    return path
  }

  function adopt(reply, sentIds = new Set()) {
    const remaining = readOutbox(statePath).filter(op => !sentIds.has(op.id))
    writeOutbox(statePath, remaining)
    store.replaceFromCloud(reply.state, remaining)
    config.rev = reply.rev
    config.lastSyncAt = now()
    lastSyncAt = config.lastSyncAt
    save()
  }

  const summary = state => (state === null || state === undefined ? null : {
    name: state.name, stage: state.stage, bornAt: state.bornAt, coins: state.coins, hatched: state.hatched === true, dead: state.dead === true,
  })

  /** The first sync after logging in: who keeps which pig. */
  async function link() {
    const reply = await signedCall('GET', '/v1/sync')
    if (reply.body?.ok !== true) return failWith(reply)
    const cloud = reply.body.state
    const local = store.state
    if (living(local) && !living(cloud)) {
      const up = await signedCall('POST', '/v1/sync', { snapshot: local, ops: [] })
      if (up.body?.ok !== true) return failWith(up)
      if (up.body.snapshot !== 'taken') return failWith({ body: { reason: 'snapshot-refused' } })
      finishLink(up.body)
      return true
    }
    if (living(local) && living(cloud) && local.bornAt !== cloud.bornAt) {
      conflict = { cloud: summary(cloud), local: summary(local) }
      phase = 'choose'
      return false
    }
    if (cloud !== null) backup()
    finishLink(reply.body)
    return true
  }

  function finishLink(body) {
    writeOutbox(statePath, [])
    if (body.state !== null) store.replaceFromCloud(body.state, [])
    config.linked = true
    config.rev = body.rev
    config.lastSyncAt = now()
    lastSyncAt = config.lastSyncAt
    conflict = null
    save()
    phase = 'idle'
    lastError = null
    backoffMs = 0
    schedule(IDLE_SYNC_MS)
  }

  function failWith(reply) {
    lastError = reply.body?.reason ?? 'error'
    if (phase !== 'signed-out' && phase !== 'choose') phase = reply.body?.reason === 'offline' ? 'offline' : 'error'
    return false
  }

  /** Send the outbox, adopt the settled pig. Never throws. */
  async function sync() {
    if (config === null) return false
    if (busy) {
      again = true
      return false
    }
    busy = true
    try {
      if (config.linked !== true) return phase === 'choose' ? false : await link()
      phase = 'syncing'
      const sent = readOutbox(statePath)
      const reply = await signedCall('POST', '/v1/sync', { ops: sent })
      if (config === null) return false
      if (reply.body?.ok !== true) {
        failWith(reply)
        backoffMs = Math.min(MAX_BACKOFF_MS, Math.max(SOON_MS * 2, backoffMs * 2))
        schedule(backoffMs)
        return false
      }
      adopt(reply.body, new Set(sent.map(op => op.id)))
      const fresh = (reply.body.rejected ?? []).filter(r => r.reason !== 'feed-cooldown')
      if (fresh.length > 0) {
        const byId = new Map(sent.map(op => [op.id, op.op]))
        notices = [...notices, ...fresh.map(r => ({ op: byId.get(r.id) ?? null, reason: r.reason, at: now() }))].slice(-NOTICE_LIMIT)
      }
      phase = 'idle'
      lastError = null
      backoffMs = 0
      if (now() - penAt >= (pen ? PEN_IN_MS : PEN_OUT_MS)) await refreshPen()
      schedule(pen ? PEN_IN_MS : IDLE_SYNC_MS)
      return true
    } finally {
      busy = false
      if (again) {
        again = false
        schedule(0)
      }
    }
  }

  async function refreshPen() {
    const reply = await signedCall('GET', '/v1/pen')
    if (reply.body?.ok === true) {
      pen = reply.body.pen ?? null
      penAt = now()
    }
    return reply
  }

  /** One pen request; the reply's pen becomes the shown one. */
  async function penCall(path, body) {
    if (config?.linked !== true) return { ok: false, reason: 'signed-out' }
    const reply = await signedCall('POST', path, body)
    if (reply.body && 'pen' in reply.body) {
      pen = reply.body.pen ?? null
      penAt = now()
    }
    return reply.body ?? { ok: false, reason: 'error' }
  }

  return {
    /** What the panel shows. Never includes keys. */
    status() {
      return {
        phase,
        server: config?.server ?? pendingLogin?.server ?? defaultServer,
        email: config?.email ?? pendingLogin?.email ?? null,
        deviceId: config?.deviceId ?? null,
        linked: config?.linked === true,
        rev: config?.rev ?? 0,
        lastSyncAt,
        lastError,
        waiting: config?.linked === true ? readOutbox(statePath).length : 0,
        notices,
        conflict,
        pen: config?.linked === true ? pen : null,
      }
    },

    /** [ST0014 P3] The pig pen: make one, join by code, leave. */
    penCreate: name => penCall('/v1/pen/create', { name }),
    penJoin: code => penCall('/v1/pen/join', { code }),
    penLeave: () => penCall('/v1/pen/leave'),
    penRefresh: async () => (await refreshPen()).body ?? { ok: false },

    /** Invite the pen to an outing; accepting sends both pigs, so sync right after. */
    penInvite: (kind, args) => penCall('/v1/pen/invite', { kind, args }),
    penCancel: inviteId => penCall('/v1/pen/cancel', { inviteId }),
    async penAccept(inviteId) {
      const result = await penCall('/v1/pen/accept', { inviteId })
      if (result.ok) await sync()
      return result
    },

    /** Step 1: mail a code to `email` via `server`. */
    async requestCode({ server, email, lang = 'zh' }) {
      const base = String(server ?? defaultServer ?? '').trim().replace(/\/+$/, '')
      const address = normalizeEmail(email)
      if (!/^https?:\/\/[^\s/]+/.test(base)) return { ok: false, reason: 'bad-server' }
      if (address === null) return { ok: false, reason: 'bad-email' }
      if (config !== null) return { ok: false, reason: 'signed-in' }
      const reply = await call(base, 'POST', '/v1/auth/code', { email: address, lang })
      if (reply.body?.ok !== true) return reply.body ?? { ok: false, reason: 'error' }
      pendingLogin = { server: base, email: address }
      phase = 'code-sent'
      return { ok: true, expiresIn: reply.body.expiresIn }
    },

    /** Step 2: the code from the mail; makes this device's key and links. */
    async verify({ code }) {
      if (pendingLogin === null) return { ok: false, reason: 'no-code' }
      const { publicKey, privateJwk } = await newDeviceKey()
      const deviceId = globalThis.crypto.randomUUID()
      const reply = await call(pendingLogin.server, 'POST', '/v1/auth/verify', {
        email: pendingLogin.email, code: String(code ?? '').trim(), deviceId, publicKey, deviceName,
      })
      if (reply.body?.ok !== true) return reply.body ?? { ok: false, reason: 'error' }
      config = { server: pendingLogin.server, email: pendingLogin.email, accountId: reply.body.accountId, deviceId, publicKey, privateJwk, linked: false, rev: 0 }
      keyPromise = null
      pendingLogin = null
      save()
      phase = 'linking'
      await sync()
      return { ok: true, phase }
    },

    /** Both sides had a pig: keep the cloud's (this machine's is backed up first). */
    async keepCloud() {
      if (phase !== 'choose') return { ok: false, reason: 'nothing-to-choose' }
      const reply = await signedCall('GET', '/v1/sync')
      if (reply.body?.ok !== true) return { ok: false, reason: reply.body?.reason ?? 'error' }
      const saved = backup()
      finishLink(reply.body)
      return { ok: true, backup: saved }
    },

    /** Forget the login here. The cloud pig stays; this machine keeps a copy. */
    signOut() {
      signOut()
      lastError = null
      return { ok: true }
    },

    /** Send now (after an op, or from the panel). */
    syncNow: () => sync(),

    /** An op just landed in the outbox: send it soon. */
    nudge() {
      if (config?.linked === true && !busy) schedule(SOON_MS)
    },

    start() {
      running = true
      if (config !== null) schedule(0)
    },

    stop() {
      running = false
      if (timer !== null) clearTimer(timer)
      timer = null
    },
  }
}
