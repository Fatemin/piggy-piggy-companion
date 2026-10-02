/**
 * [ST0014] The cloud pig's Worker, run on Node against real SQLite: login by
 * emailed code, the IP freeze, device signatures and replayed sync.
 *
 * Run: node --test test/server.test.js
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { hatchEgg } from '../core.js'
import { HEADERS, importPrivateKey, newDeviceKey, signRequest } from '../lib/cloud-proto.js'
import { openD1 } from '../server/d1-sqlite.mjs'
import { ipKey } from '../server/http.js'
import { handle } from '../server/worker.js'

const MIN = 60_000
const T0 = Date.UTC(2026, 9, 2, 3, 0, 0)

function world() {
  let clock = T0
  const env = { DB: openD1(), PIG_SECRET: 'test', PIG_DEV_MAIL: 'memory', outbox: [], now: () => clock }
  const call = async (method, path, body, { ip = '203.0.113.7', headers = {} } = {}) => {
    const text = body === undefined ? undefined : JSON.stringify(body)
    const response = await handle(new Request(`https://pig.test${path}`, {
      method,
      headers: { 'cf-connecting-ip': ip, 'content-type': 'application/json', ...headers },
      body: text,
    }), env)
    return { status: response.status, body: await response.json() }
  }
  return {
    env,
    call,
    get now() { return clock },
    wait(ms) { clock += ms },
    lastCode: () => env.outbox.at(-1)?.code,
  }
}

/** Log a fresh device into `email`; returns a signed caller for it. */
async function login(w, email, { ip, name = 'mac' } = {}) {
  w.wait(MIN + 1) // one code per address per minute
  const sent = await w.call('POST', '/v1/auth/code', { email, lang: 'ja' }, { ip })
  assert.equal(sent.status, 200, JSON.stringify(sent.body))
  const deviceId = crypto.randomUUID()
  const { publicKey, privateJwk } = await newDeviceKey()
  const verified = await w.call('POST', '/v1/auth/verify', { email, code: w.lastCode(), deviceId, publicKey, deviceName: name }, { ip })
  assert.equal(verified.status, 200, JSON.stringify(verified.body))
  const key = await importPrivateKey(privateJwk)
  const signed = async (method, path, body, overrides = {}) => {
    const text = body === undefined ? '' : JSON.stringify(body)
    const headers = await signRequest({ deviceId, key, method, path, body: text, time: w.now, ...overrides })
    return w.call(method, path, body, { headers })
  }
  return { deviceId, key, signed, verified: verified.body }
}

let opSeq = 0
const op = (name, args, at, tz = 540) => ({ id: `op-${String(opSeq++).padStart(8, '0')}`, at, tz, op: name, args })

test('a code arrives by mail, logs a device in, and works only once', async () => {
  const w = world()
  const device = await login(w, ' Pig@Example.com ')
  assert.equal(w.env.outbox[0].to, 'pig@example.com')
  assert.match(w.env.outbox[0].subject, /\d{6}/)
  assert.match(w.env.outbox[0].text, /10 分間/, 'in the language asked for')
  assert.equal(device.verified.hasPig, false)
  const again = await w.call('POST', '/v1/auth/verify', {
    email: 'pig@example.com', code: w.lastCode(), deviceId: crypto.randomUUID(), publicKey: (await newDeviceKey()).publicKey,
  })
  assert.equal(again.status, 401)
  assert.equal(again.body.reason, 'wrong-code')
  const me = await device.signed('GET', '/v1/me')
  assert.equal(me.status, 200)
  assert.equal(me.body.email, 'pig@example.com')
  assert.equal(me.body.devices.length, 1)
})

test('three wrong codes from one IP freeze it for an hour; other IPs are fine', async () => {
  const w = world()
  await w.call('POST', '/v1/auth/code', { email: 'a@example.com' }, { ip: '198.51.100.1' })
  const { publicKey } = await newDeviceKey()
  const guess = (code, ip = '198.51.100.1') => w.call('POST', '/v1/auth/verify', { email: 'a@example.com', code, deviceId: crypto.randomUUID(), publicKey }, { ip })
  const wrong = w.lastCode() === '000000' ? '111111' : '000000'
  assert.equal((await guess(wrong)).body.reason, 'wrong-code')
  assert.equal((await guess(wrong)).body.reason, 'wrong-code')
  const third = await guess(wrong)
  assert.equal(third.status, 429)
  assert.equal(third.body.reason, 'frozen')
  assert.equal(third.body.retryAfter, 3600)
  // Frozen means everything: even asking for a new code.
  assert.equal((await w.call('POST', '/v1/auth/code', { email: 'b@example.com' }, { ip: '198.51.100.1' })).body.reason, 'frozen')
  // The code itself died after three wrong tries, whoever tries next.
  w.wait(61 * MIN)
  assert.equal((await guess(w.lastCode(), '198.51.100.2')).body.reason, 'wrong-code')
  // An hour later the first IP may try again.
  const fresh = await w.call('POST', '/v1/auth/code', { email: 'a@example.com' }, { ip: '198.51.100.1' })
  assert.equal(fresh.status, 200)
  assert.equal((await guess(w.lastCode())).status, 200)
})

test('an IPv6 home line is one IP: the freeze covers its whole /64', async () => {
  assert.equal(ipKey('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64')
  assert.equal(ipKey('2001:0db8:0001:0002:ffff:0:0:9'), '2001:db8:1:2::/64')
  assert.equal(ipKey('::ffff:192.0.2.5'), '192.0.2.5')
  assert.equal(ipKey('192.0.2.5'), '192.0.2.5')
  const w = world()
  await w.call('POST', '/v1/auth/code', { email: 'v6@example.com' }, { ip: '2001:db8:1:2::1' })
  const { publicKey } = await newDeviceKey()
  for (const host of ['::2', '::3', '::4']) {
    await w.call('POST', '/v1/auth/verify', { email: 'v6@example.com', code: '999999', deviceId: crypto.randomUUID(), publicKey }, { ip: `2001:db8:1:2${host}` })
  }
  const next = await w.call('POST', '/v1/auth/code', { email: 'v6@example.com' }, { ip: '2001:db8:1:2:dead::beef' })
  assert.equal(next.body.reason, 'frozen')
})

test('sending is rate limited per address, per IP and per day', async () => {
  const w = world()
  assert.equal((await w.call('POST', '/v1/auth/code', { email: 'r@example.com' })).status, 200)
  const soon = await w.call('POST', '/v1/auth/code', { email: 'r@example.com' })
  assert.equal(soon.body.reason, 'too-soon')
  for (let i = 0; i < 4; i += 1) {
    w.wait(MIN + 1)
    assert.equal((await w.call('POST', '/v1/auth/code', { email: 'r@example.com' })).status, 200)
  }
  w.wait(MIN + 1)
  assert.equal((await w.call('POST', '/v1/auth/code', { email: 'r@example.com' })).body.reason, 'too-many')
  // Ten an hour from one IP, whatever the addresses.
  for (let i = 0; i < 5; i += 1) assert.equal((await w.call('POST', '/v1/auth/code', { email: `x${i}@example.com` })).status, 200)
  assert.equal((await w.call('POST', '/v1/auth/code', { email: 'y@example.com' })).body.reason, 'too-many')
  assert.equal((await w.call('POST', '/v1/auth/code', { email: 'not-an-address' }, { ip: '192.0.2.99' })).body.reason, 'bad-email')
})

test('an invite list keeps strangers out', async () => {
  const w = world()
  w.env.PIG_ALLOWED_EMAILS = 'friend@example.com, me@example.com'
  assert.equal((await w.call('POST', '/v1/auth/code', { email: 'stranger@example.com' })).body.reason, 'not-invited')
  assert.equal((await w.call('POST', '/v1/auth/code', { email: 'Friend@example.com' })).status, 200)
})

test('signed requests: wrong key, stale clock, replay and revoked devices are refused', async () => {
  const w = world()
  const device = await login(w, 'sig@example.com')
  assert.equal((await device.signed('GET', '/v1/sync')).status, 200)
  // No signature at all.
  assert.equal((await w.call('GET', '/v1/sync')).body.reason, 'unsigned')
  // Someone else's key.
  const stranger = await importPrivateKey((await newDeviceKey()).privateJwk)
  const forged = await signRequest({ deviceId: device.deviceId, key: stranger, method: 'GET', path: '/v1/sync', time: w.now })
  assert.equal((await w.call('GET', '/v1/sync', undefined, { headers: forged })).body.reason, 'bad-signature')
  // A clock ten minutes off.
  assert.equal((await device.signed('GET', '/v1/sync', undefined, { time: w.now - 10 * MIN })).body.reason, 'clock')
  // The same request twice.
  const once = await device.signed('POST', '/v1/sync', { ops: [] }, { nonce: 'ab'.repeat(16) })
  assert.equal(once.status, 200)
  assert.equal((await device.signed('POST', '/v1/sync', { ops: [] }, { nonce: 'ab'.repeat(16) })).body.reason, 'replayed')
  // Revoked: logged out for good.
  assert.equal((await device.signed('POST', '/v1/devices/revoke', { deviceId: device.deviceId })).status, 200)
  assert.equal((await device.signed('GET', '/v1/sync')).body.reason, 'unknown-device')
})

test('a tampered body fails the signature', async () => {
  const w = world()
  const device = await login(w, 'tamper@example.com')
  // Signed with the device's own key over an empty op list…
  const headers = await signRequest({
    deviceId: device.deviceId, key: device.key, method: 'POST', path: '/v1/sync', body: JSON.stringify({ ops: [] }), time: w.now,
  })
  assert.equal(headers[HEADERS.device], device.deviceId)
  // …but carrying something else.
  const sent = await w.call('POST', '/v1/sync', { ops: [op('dev', [{ coins: 999999 }], w.now)] }, { headers })
  assert.equal(sent.body.reason, 'bad-signature')
})

test('first sync takes the local pig whole; after that only ops count', async () => {
  const w = world()
  const mac = await login(w, 'owner@example.com')
  const local = hatchEgg(T0 - 60 * MIN, 'zh')
  local.coins = 1234
  const first = await mac.signed('POST', '/v1/sync', { snapshot: local, ops: [] })
  assert.equal(first.status, 200, JSON.stringify(first.body))
  assert.equal(first.body.snapshot, 'taken')
  assert.equal(first.body.rev, 1)
  assert.equal(first.body.state.coins, 1234)

  // A second machine logging in sees the same pig, and cannot replace it.
  const pc = await login(w, 'owner@example.com', { ip: '192.0.2.44', name: 'pc' })
  assert.equal(pc.verified.hasPig, true)
  const cheat = { ...local, coins: 999_999 }
  const refused = await pc.signed('POST', '/v1/sync', { snapshot: cheat, ops: [] })
  assert.equal(refused.body.snapshot, 'refused')
  assert.equal(refused.body.state.coins, 1234)

  // Developer patches stay on the machine that made them.
  const dev = await pc.signed('POST', '/v1/sync', { ops: [op('dev', [{ coins: 999_999 }], w.now)] })
  assert.deepEqual(dev.body.rejected.map(r => r.reason), ['local-only'])
  assert.equal(dev.body.state.coins, 1234)
})

test('two devices: their ops merge in time order and both get the same pig', async () => {
  const w = world()
  const mac = await login(w, 'two@example.com')
  const pc = await login(w, 'two@example.com', { ip: '192.0.2.45', name: 'pc' })
  const local = hatchEgg(T0, 'zh')
  local.coins = 5000
  await mac.signed('POST', '/v1/sync', { snapshot: local, ops: [] })

  w.wait(10 * MIN)
  const fromMac = await mac.signed('POST', '/v1/sync', { ops: [op('buy', ['apple'], w.now - 2 * MIN), op('use', ['apple'], w.now - MIN)] })
  assert.deepEqual(fromMac.body.rejected, [])
  const afterMac = fromMac.body.state
  assert.equal(afterMac.stats.purchases, 1)

  // The PC was offline: it went to work "five minutes ago", before the Mac's
  // latest op. It is pinned to the pig's clock instead of rewriting history.
  w.wait(MIN)
  const fromPc = await pc.signed('POST', '/v1/sync', { ops: [op('work', ['stall'], w.now - 5 * MIN)] })
  assert.deepEqual(fromPc.body.accepted.length, 1)
  assert.equal(fromPc.body.state.activity.kind, 'work')
  assert.ok(fromPc.body.state.activity.startedAt >= afterMac.lastSeenAt, 'never before the pig clock')

  // Both read the same pig.
  const macView = await mac.signed('GET', '/v1/sync')
  const pcView = await pc.signed('GET', '/v1/sync')
  assert.deepEqual(macView.body.state, pcView.body.state)
  assert.equal(macView.body.rev, fromPc.body.rev)

  // While it is out, the other device cannot send it somewhere else.
  const clash = await mac.signed('POST', '/v1/sync', { ops: [op('trip', ['tokyo'], w.now)] })
  assert.deepEqual(clash.body.rejected.map(r => r.reason), ['away'])
})

test('an op sent twice (a retry) counts once', async () => {
  const w = world()
  const mac = await login(w, 'retry@example.com')
  const local = hatchEgg(T0, 'zh')
  await mac.signed('POST', '/v1/sync', { snapshot: local, ops: [] })
  w.wait(5 * MIN)
  const buy = op('buy', ['apple'], w.now)
  const once = await mac.signed('POST', '/v1/sync', { ops: [buy] })
  const twice = await mac.signed('POST', '/v1/sync', { ops: [buy] })
  assert.equal(twice.body.state.inventory.apple, once.body.state.inventory.apple)
  assert.equal(twice.body.rev, once.body.rev, 'nothing new, nothing written')
  assert.deepEqual(twice.body.accepted, [buy.id])
})

test('passive feeding is shared between machines: one bite per 30 minutes', async () => {
  const w = world()
  const mac = await login(w, 'feed@example.com')
  const pc = await login(w, 'feed@example.com', { ip: '192.0.2.46', name: 'pc' })
  await mac.signed('POST', '/v1/sync', { snapshot: hatchEgg(T0, 'zh'), ops: [] })
  w.wait(MIN)
  const a = await mac.signed('POST', '/v1/sync', { ops: [op('feed', ['turn'], w.now)] })
  assert.equal(a.body.accepted.length, 1)
  w.wait(10 * MIN)
  const b = await pc.signed('POST', '/v1/sync', { ops: [op('feed', ['turn'], w.now)] })
  assert.deepEqual(b.body.rejected.map(r => r.reason), ['feed-cooldown'])
  w.wait(25 * MIN)
  const c = await pc.signed('POST', '/v1/sync', { ops: [op('feed', ['tool'], w.now)] })
  assert.equal(c.body.accepted.length, 1)
  assert.equal(c.body.state.stats.turns, 1)
  assert.equal(c.body.state.stats.tools, 1)
})

test('a device clock in the future cannot push the pig ahead of the server', async () => {
  const w = world()
  const mac = await login(w, 'future@example.com')
  await mac.signed('POST', '/v1/sync', { snapshot: hatchEgg(T0, 'zh'), ops: [] })
  const ahead = await mac.signed('POST', '/v1/sync', { ops: [op('work', ['stall'], w.now + 3 * 60 * MIN)] })
  assert.equal(ahead.body.accepted.length, 1)
  assert.ok(ahead.body.state.activity.startedAt <= w.now)
  assert.ok(ahead.body.state.lastSeenAt <= w.now)
})

test('nonsense is refused with a reason, not a crash', async () => {
  const w = world()
  const mac = await login(w, 'junk@example.com')
  const junk = await mac.signed('POST', '/v1/sync', { ops: [null, { id: 'short' }, op('cheat', [], w.now), op('act', ['feed'], w.now)] })
  assert.equal(junk.status, 200)
  assert.deepEqual(junk.body.rejected.map(r => r.reason), ['not-an-object', 'bad-id', 'unknown-op', 'absent'])
  assert.equal((await w.call('GET', '/v1/nowhere')).status, 404)
  assert.equal((await w.call('GET', '/v1/health')).body.ok, true)
  const huge = await mac.signed('POST', '/v1/sync', { ops: Array.from({ length: 501 }, (_, i) => op('act', ['pet'], w.now + i)) })
  assert.equal(huge.body.reason, 'too-many-ops')
})
