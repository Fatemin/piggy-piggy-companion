/**
 * [ST0014 P3] Pig pens: friends' pigs heading out together, 30% faster and
 * paying 30% more, both or neither — on the real Worker with SQLite.
 *
 * Run: node --test test/pens.test.js
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { decay, hatchEgg, migrate, setRandomForTests, startTogether } from '../core.js'
import { COOP } from '../data.js'
import { importPrivateKey, newDeviceKey, signRequest } from '../lib/cloud-proto.js'
import { openD1 } from '../server/d1-sqlite.mjs'
import { handle } from '../server/worker.js'

const MIN = 60_000
const T0 = Date.UTC(2026, 9, 2, 3, 0, 0)

function world() {
  let clock = T0
  const env = { DB: openD1(), PIG_SECRET: 'test', PIG_DEV_MAIL: 'memory', outbox: [], now: () => clock }
  const call = async (method, path, body, headers = {}) => {
    const response = await handle(new Request(`https://pig.test${path}`, {
      method, headers: { 'cf-connecting-ip': '203.0.113.20', 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env)
    return { status: response.status, body: await response.json() }
  }
  return { env, call, get now() { return clock }, wait(ms) { clock += ms } }
}

let ipSeq = 1
/** An account with one device and a hatched pig in the cloud. */
async function player(w, email, setup = () => {}) {
  const ip = `198.51.100.${ipSeq++}`
  const callAs = (method, path, body, headers = {}) => w.call(method, path, body, { 'cf-connecting-ip': ip, ...headers })
  await callAs('POST', '/v1/auth/code', { email })
  const deviceId = crypto.randomUUID()
  const { publicKey, privateJwk } = await newDeviceKey()
  const verified = await callAs('POST', '/v1/auth/verify', { email, code: w.env.outbox.at(-1).code, deviceId, publicKey })
  assert.equal(verified.status, 200, JSON.stringify(verified.body))
  const key = await importPrivateKey(privateJwk)
  const signed = async (method, path, body) => {
    const text = body === undefined ? '' : JSON.stringify(body)
    return callAs(method, path, body, await signRequest({ deviceId, key, method, path, body: text, time: w.now }))
  }
  const pig = hatchEgg(w.now - 60 * MIN, 'zh')
  pig.coins = 5000
  setup(pig)
  const up = await signed('POST', '/v1/sync', { snapshot: pig, ops: [] })
  assert.equal(up.body.snapshot, 'taken')
  return { signed, pig: async () => (await signed('GET', '/v1/sync')).body.state }
}

let opSeq = 0
const op = (name, args, at) => ({ id: `op-pen-${String(opSeq++).padStart(6, '0')}`, at, tz: 540, op: name, args })

test('make a pen, share its code, see each other\'s pigs', async () => {
  const w = world()
  const ann = await player(w, 'ann@example.com', pig => { pig.name = 'Ann' })
  const bo = await player(w, 'bo@example.com', pig => { pig.name = 'Bo' })
  assert.deepEqual((await ann.signed('GET', '/v1/pen')).body.pen, null)
  const made = await ann.signed('POST', '/v1/pen/create', { name: '小猪圈' })
  assert.equal(made.status, 200)
  const code = made.body.pen.code
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/)
  assert.equal((await bo.signed('POST', '/v1/pen/join', { code: 'NOPE00' })).body.reason, 'no-such-pen')
  const joined = await bo.signed('POST', '/v1/pen/join', { code: code.toLowerCase() })
  assert.equal(joined.status, 200)
  assert.deepEqual(joined.body.pen.members.map(m => [m.pig.name, m.you, m.owner]), [['Ann', false, true], ['Bo', true, false]])
  assert.equal((await bo.signed('POST', '/v1/pen/create', {})).body.reason, 'in-a-pen', 'one pen at a time')
  // What a pen mate sees of a pig: no coins, no inventory.
  assert.equal('coins' in joined.body.pen.members[0].pig, false)
})

test('going out together: both pigs leave at once, 30% faster, 30% more pay', async () => {
  const w = world()
  const ann = await player(w, 'ann2@example.com', pig => { pig.name = 'Ann' })
  const bo = await player(w, 'bo2@example.com', pig => { pig.name = 'Bo' })
  const solo = await player(w, 'solo@example.com')
  const { body: { pen } } = await ann.signed('POST', '/v1/pen/create', {})
  await bo.signed('POST', '/v1/pen/join', { code: pen.code })

  const asked = await ann.signed('POST', '/v1/pen/invite', { kind: 'work', args: ['tutor'] })
  assert.equal(asked.status, 200, JSON.stringify(asked.body))
  assert.equal(asked.body.pen.invites.length, 1)
  assert.match(asked.body.pen.invites[0].label, /家教|tutor/i)
  assert.equal((await ann.signed('POST', '/v1/pen/accept', { inviteId: asked.body.inviteId })).body.reason, 'own-invite')

  const accepted = await bo.signed('POST', '/v1/pen/accept', { inviteId: asked.body.inviteId })
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body))
  assert.equal(accepted.body.pen.invites.length, 0, 'taken')
  await solo.signed('POST', '/v1/sync', { ops: [op('work', ['tutor'], w.now)] })

  const annPig = await ann.pig()
  const boPig = await bo.pig()
  const soloPig = await solo.pig()
  assert.equal(annPig.activity.coop.partner, 'Bo')
  assert.equal(boPig.activity.coop.partner, 'Ann')
  assert.equal(annPig.activity.startedAt, boPig.activity.startedAt, 'the same moment')
  const together = annPig.activity.endsAt - annPig.activity.startedAt
  const alone = soloPig.activity.endsAt - soloPig.activity.startedAt
  assert.equal(together, Math.round(alone / COOP.speed))

  w.wait(61 * MIN)
  const [annBack, soloBack] = [await ann.pig(), await solo.pig()]
  assert.equal(annBack.activity, null)
  assert.equal(soloBack.activity, null)
  assert.equal(annBack.coins - 5000, Math.round((soloBack.coins - 5000) * COOP.bonus))
  // A device cannot write a pen outing into its own pig.
  const forged = await bo.signed('POST', '/v1/sync', { ops: [op('coop', ['work', ['office'], { id: 'x', partner: 'me' }], w.now)] })
  assert.deepEqual(forged.body.rejected.map(r => r.reason), ['server-only'])
})

test('a career outing needs both pigs qualified; a busy pig cannot be invited along', async () => {
  const w = world()
  const ann = await player(w, 'ann3@example.com', pig => { pig.traits.intel = 25 })
  const bo = await player(w, 'bo3@example.com')
  const { body: { pen } } = await ann.signed('POST', '/v1/pen/create', {})
  await bo.signed('POST', '/v1/pen/join', { code: pen.code })

  // Bo cannot even ask for a career it is not qualified for.
  const refused = await bo.signed('POST', '/v1/pen/invite', { kind: 'work', args: ['aitrainer'] })
  assert.equal(refused.body.reason, 'cannot-go')
  assert.equal(refused.body.why, 'job-locked')

  // Ann can ask, but Bo cannot accept: both must qualify.
  const asked = await ann.signed('POST', '/v1/pen/invite', { kind: 'work', args: ['aitrainer'] })
  const no = await bo.signed('POST', '/v1/pen/accept', { inviteId: asked.body.inviteId })
  assert.deepEqual([no.body.reason, no.body.who, no.body.why], ['cannot-go', 'you', 'job-locked'])
  assert.equal((await ann.pig()).activity, null, 'neither pig went')

  // The inviter went off alone meanwhile: the partner side refuses.
  const trip = await ann.signed('POST', '/v1/pen/invite', { kind: 'trip', args: ['tokyo'] })
  await ann.signed('POST', '/v1/sync', { ops: [op('work', ['tutor'], w.now)] })
  const late = await bo.signed('POST', '/v1/pen/accept', { inviteId: trip.body.inviteId })
  assert.deepEqual([late.body.who, late.body.why], ['partner', 'away'])
  assert.equal((await bo.pig()).activity, null)
})

test('invites expire, can be withdrawn, and leaving hands the pen on', async () => {
  const w = world()
  const ann = await player(w, 'ann4@example.com', pig => { pig.name = 'Ann' })
  const bo = await player(w, 'bo4@example.com', pig => { pig.name = 'Bo' })
  const { body: { pen } } = await ann.signed('POST', '/v1/pen/create', {})
  await bo.signed('POST', '/v1/pen/join', { code: pen.code })

  const first = await ann.signed('POST', '/v1/pen/invite', { kind: 'study', args: [['chinese'], 'primary'] })
  assert.equal(first.status, 200, JSON.stringify(first.body))
  w.wait(11 * MIN)
  assert.equal((await bo.signed('GET', '/v1/pen')).body.pen.invites.length, 0)
  assert.equal((await bo.signed('POST', '/v1/pen/accept', { inviteId: first.body.inviteId })).body.reason, 'no-such-invite')

  const second = await ann.signed('POST', '/v1/pen/invite', { kind: 'work', args: ['odd'] })
  assert.equal((await ann.signed('POST', '/v1/pen/cancel', { inviteId: second.body.inviteId })).status, 200)
  assert.equal((await bo.signed('POST', '/v1/pen/accept', { inviteId: second.body.inviteId })).body.reason, 'no-such-invite')
  assert.equal((await ann.signed('POST', '/v1/pen/invite', { kind: 'nap', args: ['x'] })).body.reason, 'bad-invite')

  await ann.signed('POST', '/v1/pen/leave')
  const left = await bo.signed('GET', '/v1/pen')
  assert.deepEqual(left.body.pen.members.map(m => [m.pig.name, m.owner]), [['Bo', true]])
  await bo.signed('POST', '/v1/pen/leave')
  assert.equal((await ann.signed('POST', '/v1/pen/join', { code: pen.code })).body.reason, 'no-such-pen', 'the last one out closed it')
})

test('studying together: trait points +30% on average, the fraction rolled by the pig\'s dice', () => {
  const coop = { id: 'c1', partner: 'Bo' }
  const settle = roll => {
    const pig = hatchEgg(T0, 'zh')
    assert.equal(startTogether(pig, 'study', [['chinese'], 'primary'], coop, T0, 9).ok, true)
    setRandomForTests(() => roll)
    try { decay(pig, pig.activity.endsAt) } finally { setRandomForTests(null) }
    assert.equal(pig.activity, null)
    return pig.traits.intel
  }
  // 小学 pays 1 point; together that is 1.3: the 0.3 is a roll.
  assert.equal(settle(0), 2, 'the roll came up')
  assert.equal(settle(0.99), 1, 'it did not')
})

test('a pen outing keeps its bonus through a save, and nonsense is clamped', () => {
  const pig = hatchEgg(T0, 'zh')
  assert.equal(startTogether(pig, 'work', ['tutor'], { id: 'c2', partner: 'Bo' }, T0, 9).ok, true)
  const back = migrate(JSON.parse(JSON.stringify(pig)))
  assert.deepEqual(back.activity.coop, { id: 'c2', partner: 'Bo', bonus: COOP.bonus })
  const greedy = migrate({ ...JSON.parse(JSON.stringify(pig)), activity: { ...pig.activity, coop: { id: 'x', partner: 'y', bonus: 99 } } })
  assert.equal(greedy.activity.coop.bonus, COOP.bonus)
  assert.equal(startTogether(hatchEgg(T0, 'zh'), 'nap', ['x'], {}, T0).ok, false)
})
