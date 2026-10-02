/**
 * [ST0014] Replayable pigs: the same ops give the same save, whoever applies
 * them and however often the pig was looked at in between. This is what lets
 * the server settle a synced pig by replaying its devices' ops.
 *
 * Run: node --test test/ops.test.js
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { TICK_MS, advance, hatchEgg, migrate, nextRandom, seedFrom } from '../core.js'
import { OP_NAMES, applyOp, opProblem, succeeded } from '../ops.js'
import { createStore } from '../store.js'

const MIN = 60_000
const T0 = Date.UTC(2026, 9, 2, 3, 17, 41, 123)

/** A store on a temp save with a fake clock, recording the ops that took. */
function recordingStore() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pig-ops-'))
  let clock = T0
  let n = 0
  const ops = []
  const store = createStore(join(dir, 'state.json'), {
    now: () => clock,
    setTimer: () => null,
    clearTimer: () => {},
    offsetMinutes: () => 540,
    newId: () => `op-${String(n++).padStart(6, '0')}`,
    onOp: op => ops.push(structuredClone(op)),
  })
  return {
    store,
    ops,
    get clock() { return clock },
    wait(ms, { looks = 0 } = {}) {
      // `looks` refreshes spread over the wait, like a panel polling it.
      for (let i = 1; i <= looks; i += 1) {
        clock += Math.floor(ms / (looks + 1))
        store.freshen()
      }
      clock = clock - Math.floor(ms / (looks + 1)) * looks + ms
    },
    done() {
      store.dispose()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** A morning of play, the same script for every run. */
function play(pig, looks) {
  const { store } = pig
  assert.equal(store.hatch(), true)
  assert.equal(store.dev({ coins: 5000 }), true)
  pig.wait(3 * MIN, { looks })
  store.feed('turn')
  store.act('feed')
  pig.wait(47 * MIN + 13_000, { looks })
  assert.equal(store.startWork('stall').ok, true, 'a gig with a random pay')
  pig.wait(3 * 60 * MIN, { looks })
  store.act('bathe')
  store.buy('apple')
  store.useItem('apple')
  assert.equal(store.startTrip('tokyo').ok, true)
  pig.wait(26 * 60 * MIN + 7_777, { looks })
  store.scratchLottery()
  store.act('play')
  pig.wait(9 * MIN, { looks })
  store.freshen()
}

const comparable = state => {
  const copy = structuredClone(state)
  delete copy.pending
  return copy
}

test('the same ops give the same pig however often it was refreshed', () => {
  const rare = recordingStore()
  const busy = recordingStore()
  try {
    play(rare, 0)
    play(busy, 25)
    assert.equal(rare.clock, busy.clock)
    assert.deepEqual(comparable(busy.store.state), comparable(rare.store.state))
    assert.ok(rare.store.state.stats.jobs === 1 && rare.store.state.stats.trips === 1, 'the outings settled')
  } finally {
    rare.done()
    busy.done()
  }
})

test('replaying the recorded ops from nothing rebuilds the pig exactly', () => {
  const pig = recordingStore()
  try {
    play(pig, 7)
    assert.ok(pig.ops.length >= 8)
    let replayed = null
    for (const op of pig.ops) {
      assert.equal(opProblem(op), null, JSON.stringify(op))
      const out = applyOp(replayed, structuredClone(op))
      assert.equal(out.ok, true, `${op.op} took on the device, so it takes in the replay`)
      replayed = out.state
    }
    advance(replayed, pig.clock)
    assert.deepEqual(comparable(replayed), comparable(pig.store.state))
  } finally {
    pig.done()
  }
})

test('a replay through JSON (the wire, the disk) changes nothing', () => {
  const pig = recordingStore()
  try {
    play(pig, 3)
    const thawed = migrate(JSON.parse(JSON.stringify(pig.store.state)))
    assert.deepEqual(comparable(thawed), comparable(pig.store.state))
  } finally {
    pig.done()
  }
})

test('the dice live in the save: same seed, same rolls; they move on every roll', () => {
  const a = hatchEgg(T0, 'zh')
  const b = hatchEgg(T0, 'zh')
  assert.equal(a.rng, seedFrom(T0))
  const rollsA = Array.from({ length: 50 }, () => nextRandom(a))
  const rollsB = Array.from({ length: 50 }, () => nextRandom(b))
  assert.deepEqual(rollsA, rollsB)
  assert.ok(rollsA.every(r => r >= 0 && r < 1))
  assert.ok(new Set(rollsA).size > 45, 'and they are not stuck')
  assert.notEqual(a.rng, seedFrom(T0))
})

test('an old save gets dice from its birthday, the same on every machine', () => {
  const old = { bornAt: T0, hatched: true, version: 6 }
  assert.equal(migrate(old).rng, seedFrom(T0))
  assert.equal(migrate(old).utcOffsetMin, null)
  assert.equal(migrate({ ...old, rng: 7, utcOffsetMin: 540 }).rng, 7)
  assert.equal(migrate({ ...old, rng: -1 }).rng, seedFrom(T0), 'nonsense is replaced')
})

test('memories are stamped in the owner zone the op carried', () => {
  let state = null
  state = applyOp(state, { id: 'op-hatch-01', at: Date.UTC(2026, 9, 2, 0, 5), tz: 540, op: 'hatch', args: ['zh'] }).state
  assert.match(state.memories.at(-1), /^\[09:05\]/)
  state = applyOp(state, { id: 'op-buy-0001', at: Date.UTC(2026, 9, 2, 0, 9), tz: -300, op: 'buy', args: ['apple'] }).state
  assert.match(state.memories.at(-1), /^\[19:09\]/)
})

test('time is folded in on whole minutes and exactly when an outing ends', () => {
  const pig = hatchEgg(T0, 'zh')
  const nextTick = Math.ceil(T0 / TICK_MS) * TICK_MS
  advance(pig, nextTick - 1)
  assert.equal(pig.lastSeenAt, T0, 'no tick yet')
  advance(pig, T0 + 5 * MIN)
  assert.equal(pig.lastSeenAt % TICK_MS, 0)
  pig.activity = { kind: 'work', key: 'stall', label: '', emoji: '', startedAt: T0, endsAt: pig.lastSeenAt + 12_345, cost: 0 }
  advance(pig, pig.lastSeenAt + 20_000)
  assert.equal(pig.activity, null, 'the shift settled at endsAt, not at the next minute')
  assert.equal(pig.stats.jobs, 1)
})

test('a week away folds in quickly', () => {
  const pig = hatchEgg(T0, 'zh')
  const started = performance.now()
  advance(pig, T0 + 30 * 86_400_000)
  assert.ok(performance.now() - started < 1000, 'a month of absence in under a second')
  assert.ok(pig.lastSeenAt > T0 + 29 * 86_400_000)
})

test('ops off the wire are shape-checked before they are trusted', () => {
  const good = { id: 'op-000001', at: T0, tz: 540, op: 'act', args: ['feed'] }
  assert.equal(opProblem(good), null)
  assert.equal(opProblem(null), 'not-an-object')
  assert.equal(opProblem({ ...good, id: 'x' }), 'bad-id')
  assert.equal(opProblem({ ...good, at: 'soon' }), 'bad-time')
  assert.equal(opProblem({ ...good, tz: 9999 }), 'bad-zone')
  assert.equal(opProblem({ ...good, op: 'cheat' }), 'unknown-op')
  assert.equal(opProblem({ ...good, op: 'constructor' }), 'unknown-op')
  assert.equal(opProblem({ ...good, args: 'feed' }), 'bad-args')
  assert.equal(opProblem({ ...good, args: ['x'.repeat(600)] }), 'bad-args')
  assert.ok(OP_NAMES.includes('feed') && OP_NAMES.includes('dev'))
})

test('a refused op reports ok:false and leaves the pig as it was', () => {
  const state = hatchEgg(T0, 'zh')
  state.coins = 0
  const before = structuredClone(state)
  const out = applyOp(state, { id: 'op-000002', at: T0, tz: 0, op: 'buy', args: ['cake'] })
  assert.equal(out.ok, false)
  assert.equal(out.result.reason, 'poor')
  assert.equal(out.state.coins, before.coins)
  assert.equal(applyOp(null, { id: 'op-000003', at: T0, tz: 0, op: 'act', args: ['feed'] }).ok, false)
  assert.equal(succeeded([]), true)
  assert.equal(succeeded(null), false)
  assert.equal(succeeded({ ok: false }), false)
})
