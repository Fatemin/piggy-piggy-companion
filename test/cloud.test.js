/**
 * [ST0014] This machine's cloud client against the real Worker (in process,
 * SQLite for D1): logging in, linking the first time, two devices keeping one
 * pig, offline ops, a revoked device and a lagging clock.
 *
 * Run: node --test test/cloud.test.js
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createCloud, readOutbox, recordOp } from '../lib/cloud.js'
import { cloudPath } from '../lib/config.js'
import { startServer } from '../lib/server.js'
import { openD1 } from '../server/d1-sqlite.mjs'
import { handle } from '../server/worker.js'
import { createStore } from '../store.js'

const SERVER = 'https://pig.test'

function cloudWorld() {
  const env = { DB: openD1(), PIG_SECRET: 'test', PIG_DEV_MAIL: 'memory', outbox: [], PIG_FEED_EVERY_MIN: '0' }
  let online = true
  let shift = 0
  const fetch = async (url, init) => {
    if (!online) throw new Error('network down')
    return handle(new Request(url, { ...init, headers: { ...init.headers, 'cf-connecting-ip': '203.0.113.9' } }), env)
  }
  const dirs = []
  const devices = []
  return {
    env,
    setOnline: value => { online = value },
    /** Move every device clock (not the server's). */
    setShift: ms => { shift = ms },
    /** One machine: its own save, store and cloud client. */
    device(name) {
      const dir = mkdtempSync(join(tmpdir(), `dsh-pig-cloud-${name}-`))
      dirs.push(dir)
      const statePath = join(dir, 'state.json')
      let cloud = null
      const store = createStore(statePath, {
        now: () => Date.now() + shift,
        setTimer: () => null,
        clearTimer: () => {},
        onOp: op => { recordOp(statePath, op); cloud?.nudge() },
      })
      cloud = createCloud({ statePath, store, fetch, now: () => Date.now() + shift, setTimer: () => null, clearTimer: () => {}, deviceName: name, defaultServer: SERVER })
      const device = {
        name, dir, statePath, store, cloud,
        async login(email) {
          env.outbox.length = 0
          // Real time runs here, so lift the one-code-a-minute limit between logins.
          await env.DB.prepare("DELETE FROM auth_events WHERE kind = 'send'").run()
          const sent = await cloud.requestCode({ server: SERVER, email })
          assert.equal(sent.ok, true, JSON.stringify(sent))
          return cloud.verify({ code: env.outbox.at(-1).code })
        },
      }
      devices.push(device)
      return device
    },
    done() {
      for (const device of devices) { device.cloud.stop(); device.store.dispose() }
      for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
    },
  }
}

const comparable = state => {
  const copy = structuredClone(state)
  delete copy.pending
  return copy
}

test('first login uploads the local pig; ops after that reach the cloud', async () => {
  const w = cloudWorld()
  try {
    const mac = w.device('mac')
    mac.store.hatch()
    mac.store.dev({ coins: 3000 })
    const login = await mac.login('me@example.com')
    assert.equal(login.ok, true)
    assert.equal(mac.cloud.status().phase, 'idle')
    assert.equal(mac.cloud.status().linked, true)
    assert.equal(mac.store.state.coins, 3000, 'the uploaded pig is the local pig')

    // The private key stays private.
    assert.equal(statSync(cloudPath(mac.statePath)).mode & 0o777, 0o600)
    assert.equal(JSON.stringify(mac.cloud.status()).includes('privateJwk'), false)

    assert.equal(mac.store.buy('apple').ok, true)
    assert.equal(readOutbox(mac.statePath).length, 1, 'queued while linked')
    assert.equal(await mac.cloud.syncNow(), true)
    assert.equal(readOutbox(mac.statePath).length, 0, 'confirmed and dropped')
    assert.equal(mac.store.state.inventory.apple, 1)
  } finally {
    w.done()
  }
})

test('a second machine adopts the pig, and what each does shows up on the other', async () => {
  const w = cloudWorld()
  try {
    const mac = w.device('mac')
    mac.store.hatch()
    mac.store.dev({ coins: 3000 })
    await mac.login('two@example.com')

    const pc = w.device('pc')
    assert.equal(pc.store.state, null, 'nothing here yet')
    await pc.login('two@example.com')
    assert.equal(pc.cloud.status().phase, 'idle')
    assert.equal(pc.store.state.bornAt, mac.store.state.bornAt, 'the same pig')

    assert.equal(pc.store.startWork('stall').ok, true)
    await pc.cloud.syncNow()
    await mac.cloud.syncNow()
    assert.equal(mac.store.state.activity?.kind, 'work', 'the Mac sees the pig went to work on the PC')
    assert.equal(mac.store.startTrip('tokyo').ok, false, 'and cannot send it elsewhere meanwhile')

    assert.equal(mac.store.act('pet').ok, true)
    await mac.cloud.syncNow()
    await pc.cloud.syncNow()
    assert.deepEqual(comparable(pc.store.state), comparable(mac.store.state))
  } finally {
    w.done()
  }
})

test('two different living pigs: the panel asks, the cloud pig wins, the local one is backed up', async () => {
  const w = cloudWorld()
  try {
    const mac = w.device('mac')
    mac.store.hatch()
    await mac.login('clash@example.com')

    const pc = w.device('pc')
    pc.store.hatch()
    pc.store.renamePig('Other')
    await new Promise(resolve => setTimeout(resolve, 5)) // a different birthday
    const login = await pc.login('clash@example.com')
    assert.equal(login.phase, 'choose')
    const status = pc.cloud.status()
    assert.equal(status.conflict.cloud.bornAt, mac.store.state.bornAt)
    assert.equal(status.conflict.local.name, 'Other')
    assert.equal(status.linked, false)
    pc.store.act('pet')
    assert.equal(readOutbox(pc.statePath).length, 0, 'nothing is queued before the choice')

    const kept = await pc.cloud.keepCloud()
    assert.equal(kept.ok, true)
    assert.ok(kept.backup && existsSync(kept.backup), 'the local pig is kept in a file')
    assert.equal(pc.store.state.bornAt, mac.store.state.bornAt)
    assert.equal(pc.cloud.status().phase, 'idle')
  } finally {
    w.done()
  }
})

test('offline: ops wait in the outbox and go out when the network is back', async () => {
  const w = cloudWorld()
  try {
    const mac = w.device('mac')
    mac.store.hatch()
    mac.store.dev({ coins: 3000 })
    await mac.login('offline@example.com')
    w.setOnline(false)
    mac.store.buy('apple')
    mac.store.buy('bread')
    assert.equal(await mac.cloud.syncNow(), false)
    assert.equal(mac.cloud.status().phase, 'offline')
    assert.equal(mac.cloud.status().waiting, 2)
    assert.equal(mac.store.state.inventory.bread, 1, 'the pig does not wait for the network')
    w.setOnline(true)
    assert.equal(await mac.cloud.syncNow(), true)
    assert.equal(mac.cloud.status().waiting, 0)
    assert.equal(mac.store.state.inventory.bread, 1)
    assert.equal(mac.store.state.inventory.apple, 1)
  } finally {
    w.done()
  }
})

test('an op the cloud refuses comes back as a notice and is undone here', async () => {
  const w = cloudWorld()
  try {
    const mac = w.device('mac')
    mac.store.hatch()
    mac.store.dev({ coins: 3000 })
    await mac.login('refuse@example.com')
    const pc = w.device('pc')
    await pc.login('refuse@example.com')
    // Both send the pig out while out of touch with each other.
    assert.equal(mac.store.startWork('stall').ok, true)
    assert.equal(pc.store.startTrip('tokyo').ok, true)
    await mac.cloud.syncNow()
    await pc.cloud.syncNow()
    assert.equal(pc.store.state.activity.kind, 'work', 'the Mac was first')
    assert.deepEqual(pc.cloud.status().notices.map(n => [n.op, n.reason]), [['trip', 'away']])
  } finally {
    w.done()
  }
})

test('a device revoked elsewhere is signed out here', async () => {
  const w = cloudWorld()
  try {
    const mac = w.device('mac')
    mac.store.hatch()
    await mac.login('revoke@example.com')
    const pc = w.device('pc')
    await pc.login('revoke@example.com')
    const row = await w.env.DB.prepare('SELECT id FROM devices WHERE name = ?').bind('pc').first()
    await w.env.DB.prepare('UPDATE devices SET revoked_at = 1 WHERE id = ?').bind(row.id).run()
    assert.equal(await pc.cloud.syncNow(), false)
    assert.equal(pc.cloud.status().phase, 'signed-out')
    assert.equal(pc.cloud.status().lastError, 'revoked')
    assert.equal(existsSync(cloudPath(pc.statePath)), false)
    assert.ok(pc.store.state !== null, 'the pig stays on this machine')
  } finally {
    w.done()
  }
})

test('a machine whose clock is ten minutes slow still syncs', async () => {
  const w = cloudWorld()
  try {
    const mac = w.device('mac')
    mac.store.hatch()
    await mac.login('clock@example.com')
    w.setShift(-10 * 60_000)
    mac.store.act('pet')
    assert.equal(await mac.cloud.syncNow(), true)
    assert.equal(mac.cloud.status().waiting, 0)
  } finally {
    w.done()
  }
})

test('the panel server logs in and syncs through /pig/cloud', async () => {
  const w = cloudWorld()
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pig-cloud-panel-'))
  const fetchCloud = async (url, init) => handle(new Request(url, { ...init, headers: { ...init.headers, 'cf-connecting-ip': '203.0.113.10' } }), w.env)
  const server = await startServer({ port: 0, statePath: join(dir, 'state.json'), cloudOptions: { fetch: fetchCloud, defaultServer: SERVER } })
  try {
    const post = async (path, body) => {
      const response = await fetch(`${server.url}${path.slice(1)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return response.json()
    }
    const status = await (await fetch(`${server.url}pig/cloud`)).json()
    assert.equal(status.phase, 'signed-out')
    assert.equal(status.server, SERVER)
    await post('/dsh-pig/act', { action: 'hatch' })
    const sent = await post('/pig/cloud', { action: 'code', email: 'panel@example.com' })
    assert.equal(sent.ok, true, JSON.stringify(sent))
    assert.equal(sent.status.phase, 'code-sent')
    const verified = await post('/pig/cloud', { action: 'verify', code: w.env.outbox.at(-1).code })
    assert.equal(verified.ok, true, JSON.stringify(verified))
    assert.equal(verified.status.phase, 'idle')
    await post('/dsh-pig/act', { action: 'pet' })
    const synced = await post('/pig/cloud', { action: 'sync' })
    assert.equal(synced.ok, true)
    assert.equal(synced.status.waiting, 0)
    assert.equal((await post('/pig/cloud', { action: 'nope' })).error, 'unknown action')
    const out = await post('/pig/cloud', { action: 'sign-out' })
    assert.equal(out.status.phase, 'signed-out')
    assert.deepEqual(readdirSync(dir).filter(f => f.includes('cloud')), [])
  } finally {
    await server.close()
    w.done()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('[P3] two friends: a pen, an invite, and both pigs head out together', async () => {
  const w = cloudWorld()
  try {
    const ann = w.device('ann')
    ann.store.hatch()
    ann.store.renamePig('Ann')
    ann.store.dev({ coins: 3000 })
    await ann.login('ann@example.com')
    const bo = w.device('bo')
    bo.store.hatch()
    bo.store.renamePig('Bo')
    await bo.login('bo@example.com')

    const made = await ann.cloud.penCreate('猪圈')
    assert.equal(made.ok, true, JSON.stringify(made))
    const joined = await bo.cloud.penJoin(made.pen.code)
    assert.equal(joined.ok, true)
    assert.equal(bo.cloud.status().pen.members.length, 2)

    const asked = await ann.cloud.penInvite('work', ['tutor'])
    assert.equal(asked.ok, true, JSON.stringify(asked))
    await bo.cloud.penRefresh()
    const invite = bo.cloud.status().pen.invites[0]
    assert.equal(invite.from, 'Ann')
    const accepted = await bo.cloud.penAccept(invite.id)
    assert.equal(accepted.ok, true, JSON.stringify(accepted))
    assert.equal(bo.store.state.activity?.coop?.partner, 'Ann', 'synced right after accepting')
    await ann.cloud.syncNow()
    assert.equal(ann.store.state.activity?.coop?.partner, 'Bo', 'and the inviter sees it on its next sync')
  } finally {
    w.done()
  }
})

test('[ST0014] which pen mates show is remembered with the login, and checked', async () => {
  const w = cloudWorld()
  try {
    const mac = w.device('mac')
    mac.store.hatch()
    assert.equal(mac.cloud.penShow('self').ok, false, 'nothing to remember before logging in')
    await mac.login('show@example.com')
    assert.equal(mac.cloud.status().penShow, 'all', 'everyone by default')
    assert.equal(mac.cloud.penShow(['a', 'b', 'a', 42, '']).ok, true)
    assert.deepEqual(mac.cloud.status().penShow, ['a', 'b'])
    mac.cloud.penShow('self')
    const again = createCloud({ statePath: mac.statePath, store: mac.store, fetch: async () => { throw new Error('offline') }, setTimer: () => null, clearTimer: () => {} })
    assert.equal(again.status().penShow, 'self', 'a restarted server reads it back')
    mac.cloud.penShow('nonsense')
    assert.equal(mac.cloud.status().penShow, 'all')
  } finally {
    w.done()
  }
})
