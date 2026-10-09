/**
 * [ST0014] dsh-pig · ops — every change to a pig, as data.
 *
 * Each store mutator is one op: `{ id, at, tz, op, args }`. Applying an op is a
 * pure function of the save and the op, because core folds time in on a fixed
 * grid and rolls the pig's own dice. That is what lets the server settle a
 * synced pig by replaying the ops its devices sent, with this same file, and
 * arrive at exactly the pig each device already shows.
 *
 * No IO and no clock here; the Workers runtime imports it as it is.
 *
 * @module dsh-pig/ops
 */

import {
  act,
  adopt,
  advance,
  applyDevPatch,
  buy,
  callOffActivity,
  dealBlackjack,
  feed,
  goToSleep,
  hatch,
  hatchEgg,
  hitBlackjack,
  rename,
  renamePig,
  reset,
  scratchLottery,
  setLang,
  setLook,
  standBlackjack,
  startStudy,
  startTogether,
  startGym,
  startTrip,
  startWork,
  useItem,
  wakeUp,
  wear,
  wearAuto,
} from './core.js'

/**
 * Op name → how to apply it. Each takes `(state, args, at, tz)` and returns
 * `{ state, result }`; `state` changes identity only for ops that start over.
 */
const TABLE = {
  // core's feed answers with nothing in particular; it always takes.
  feed: (s, [event], at) => ({ state: s, result: feed(s, event, at) ?? [] }),
  act: (s, [action, itemKey], at) => ({ state: s, result: act(s, action, at, itemKey) }),
  work: (s, [jobKey], at) => ({ state: s, result: startWork(s, jobKey, at) }),
  study: (s, [subjects, stageKey], at) => ({ state: s, result: startStudy(s, subjects, stageKey, at) }),
  trip: (s, [placeKey], at, tz) => ({ state: s, result: startTrip(s, placeKey, at, tz / 60) }),
  // [Q0016] one class at the gym.
  gym: (s, [classKey], at) => ({ state: s, result: startGym(s, classKey, at) }),
  sleep: (s, [auto], at) => ({ state: s, result: goToSleep(s, at, { auto: auto === true }) }),
  wake: (s, [auto], at) => ({ state: s, result: wakeUp(s, at, { auto: auto === true }) }),
  calloff: (s, _args, at) => ({ state: s, result: callOffActivity(s, at) }),
  lottery: (s, _args, at) => ({ state: s, result: scratchLottery(s, at) }),
  // [ST0015] one op for the whole table: ['deal', bet], ['hit'] or ['stand'].
  blackjack: (s, [move, bet], at) => ({ state: s, result: blackjackMove(s, move, bet, at) }),
  buy: (s, [itemKey], at) => ({ state: s, result: buy(s, itemKey, at) }),
  look: (s, [look], at) => ({ state: s, result: setLook(s, look, at) }),
  wear: (s, [key, on], at) => ({ state: s, result: wear(s, key, on, at) }),
  wearAuto: (s, _args, at) => ({ state: s, result: wearAuto(s, at) }),
  renamePig: (s, [name], at) => ({ state: s, result: renamePig(s, name, at) }),
  rename: (s, [name], at) => ({ state: s, result: rename(s, name, at) }),
  use: (s, [itemKey], at) => ({ state: s, result: useItem(s, itemKey, at) }),
  lang: (s, [lang, boxLang], at) => {
    const state = s ?? reset(at, boxLang)
    return { state, result: setLang(state, lang, at) }
  },
  hatch: (s, [lang], at) => {
    // A save that exists but is not hatched is a box: open it in place.
    if (s !== null && s.hatched === true) return { state: s, result: false }
    return { state: s === null ? hatchEgg(at, lang) : hatch(s, at), result: true }
  },
  reset: (_s, [lang], at) => ({ state: reset(at, lang), result: true }),
  adopt: (s, _args, at) => {
    if (s === null || s.dead !== true) return { state: s, result: false }
    return { state: adopt(s, at), result: true }
  },
  // [ST0014] issued by the server only, to both pigs of an accepted pen invite.
  coop: (s, [kind, args, coop], at, tz) => ({ state: s, result: startTogether(s, kind, args, coop, at, tz / 60) }),
  dev: (s, [patch], at) => {
    if (s === null) return { state: s, result: false }
    return { state: applyDevPatch(s, patch, at), result: true }
  },
}

function blackjackMove(state, move, bet, at) {
  if (move === 'deal') return dealBlackjack(state, bet, at)
  if (move === 'hit') return hitBlackjack(state, at)
  if (move === 'stand') return standBlackjack(state, at)
  return { ok: false, reason: 'bad-move' }
}

/** Every op name. */
export const OP_NAMES = Object.freeze(Object.keys(TABLE))

/** Ops that only make sense on the machine that did them; never synced. */
export const LOCAL_OPS = Object.freeze(['dev'])

/** Ops only the server may write into a pig's log; a device sending one is refused. */
export const SERVER_OPS = Object.freeze(['coop'])

/** Ops that work on an empty save (no pig, no box). */
const WORKS_ON_NOTHING = new Set(['lang', 'hatch', 'reset'])

/** Did a core call succeed? Core speaks in arrays, booleans, null and `{ ok }`. */
export function succeeded(result) {
  if (result === null || result === undefined || result === false) return false
  if (typeof result === 'object' && !Array.isArray(result) && 'ok' in result) return result.ok === true
  return true
}

/** The UTC offset of this machine at `at`, in minutes (Tokyo: 540). */
export function localOffsetMinutes(at) {
  return -new Date(at).getTimezoneOffset()
}

/** A shape check for ops that arrive over the wire; null when it is usable. */
export function opProblem(op) {
  if (op === null || typeof op !== 'object' || Array.isArray(op)) return 'not-an-object'
  if (typeof op.id !== 'string' || op.id.length < 8 || op.id.length > 64) return 'bad-id'
  if (!Number.isFinite(op.at) || op.at <= 0) return 'bad-time'
  if (!Number.isFinite(op.tz) || Math.abs(op.tz) > 14 * 60) return 'bad-zone'
  if (typeof op.op !== 'string' || !Object.hasOwn(TABLE, op.op)) return 'unknown-op'
  if (!Array.isArray(op.args) || op.args.length > 4) return 'bad-args'
  if (JSON.stringify(op.args).length > 512) return 'bad-args'
  return null
}

/**
 * Apply one op: fold time in up to `op.at` on the grid, then do it at `op.at`.
 * @returns {{ state: object|null, result: unknown, ok: boolean, at: number }} `at` is when it really happened
 */
export function applyOp(state, op) {
  const run = Object.hasOwn(TABLE, op.op) ? TABLE[op.op] : null
  if (run === null) return { state, result: { ok: false, reason: 'unknown-op' }, ok: false, at: op.at }
  if (state === null && !WORKS_ON_NOTHING.has(op.op)) return { state, result: { ok: false, reason: 'absent' }, ok: false, at: op.at }
  const args = Array.isArray(op.args) ? op.args : []
  const tz = Number.isFinite(op.tz) ? op.tz : 0
  // Never before the pig's own clock: decay would rewind it and fold the same
  // stretch in twice. A device whose clock lags the server's lands here.
  const at = state !== null && Number.isFinite(state.lastSeenAt) ? Math.max(op.at, state.lastSeenAt) : op.at
  if (state !== null) {
    state.utcOffsetMin = tz
    advance(state, at)
  }
  const out = run(state, args, at, tz)
  if (out.state !== null && out.state !== undefined) out.state.utcOffsetMin = tz
  return { state: out.state ?? null, result: out.result, ok: succeeded(out.result), at }
}
