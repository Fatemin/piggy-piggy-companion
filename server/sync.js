/**
 * [ST0014] The account's pig, settled by replaying what its devices did.
 *
 * Devices never upload a pig they computed; they upload ops. The server puts
 * them in time order, pins each one between the pig's own clock and now,
 * checks the shared feeding cooldown, applies it with the same ops.js the
 * devices run, folds time in up to now and hands the result back. A device
 * then adopts that pig and replays whatever it did in the meantime on top.
 *
 * The only pig ever taken whole is the first one (design §5.3): when the
 * account has none yet, or only a box or a grave.
 */

import { advance, migrate } from '../core.js'
import { LOCAL_OPS, SERVER_OPS, applyOp, opProblem } from '../ops.js'
import { fail, json, parseObject } from './http.js'

export const MAX_OPS_PER_SYNC = 500
const KEEP_OPS_MS = 30 * 86_400_000
const WRITE_ATTEMPTS = 5

const feedEveryMs = env => {
  const minutes = Number.parseFloat(env.PIG_FEED_EVERY_MIN ?? '')
  return (Number.isFinite(minutes) && minutes >= 0 ? minutes : 30) * 60_000
}

export async function loadPig(env, accountId) {
  const row = await env.DB.prepare('SELECT rev, state, last_at, last_feed_at, token FROM pigs WHERE account_id = ?').bind(accountId).first()
  if (row === null) return { exists: false, rev: 0, state: null, lastAt: 0, lastFeedAt: 0 }
  let state = null
  try { state = row.state === null ? null : migrate(JSON.parse(row.state)) } catch { state = null }
  return { exists: true, rev: row.rev, state, lastAt: row.last_at, lastFeedAt: row.last_feed_at }
}

/** The pig as it stands right now: folded in to `now`, no announcements. */
export function settled(state, now) {
  if (state === null) return null
  advance(state, now)
  state.pending = []
  return state
}

/** A pig the server will take whole: none, a box, or a grave. */
const replaceable = state => state === null || state.hatched !== true || state.dead === true

/** GET /v1/sync */
export async function getPig(env, device, now) {
  const pig = await loadPig(env, device.account_id)
  return json(200, { ok: true, rev: pig.rev, state: settled(pig.state, now), serverNow: now })
}

async function knownIds(env, accountId, ids) {
  const known = new Set()
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90)
    const rows = (await env.DB.prepare(
      `SELECT id FROM ops WHERE account_id = ? AND id IN (${chunk.map(() => '?').join(', ')})`,
    ).bind(accountId, ...chunk).all()).results ?? []
    for (const row of rows) known.add(row.id)
  }
  return known
}

/** Replay `ops` onto the stored pig; pure apart from reading `known`. */
function replay(pig, body, ops, known, env, now) {
  let state = pig.state
  let lastAt = pig.lastAt
  let lastFeedAt = pig.lastFeedAt
  let snapshot

  if (body.snapshot !== undefined) {
    if (!replaceable(state)) {
      snapshot = 'refused'
    } else {
      const taken = migrate(body.snapshot)
      if (taken === null) return { error: fail(400, 'bad-snapshot') }
      if (!(taken.lastSeenAt <= now)) taken.lastSeenAt = now
      taken.pending = []
      state = taken
      lastAt = Math.max(lastAt, taken.lastSeenAt)
      snapshot = 'taken'
    }
  }

  const accepted = []
  const rejected = []
  const records = []
  const ordered = ops
    .map((op, index) => ({ op, index }))
    .sort((a, b) => (Number(a.op?.at) || 0) - (Number(b.op?.at) || 0) || a.index - b.index)
    .map(entry => entry.op)

  for (const op of ordered) {
    const problem = opProblem(op)
    if (problem !== null) {
      rejected.push({ id: typeof op?.id === 'string' ? op.id.slice(0, 64) : null, reason: problem })
      continue
    }
    if (known.has(op.id)) {
      accepted.push(op.id) // sent before; its effect is already in the pig
      continue
    }
    known.add(op.id)
    const floor = Math.max(lastAt, state?.lastSeenAt ?? 0)
    const at = Math.min(Math.max(op.at, floor), now)
    let reason = null
    if (LOCAL_OPS.includes(op.op)) reason = 'local-only'
    else if (SERVER_OPS.includes(op.op)) reason = 'server-only'
    else if (op.op === 'feed' && lastFeedAt > 0 && at - lastFeedAt < feedEveryMs(env)) reason = 'feed-cooldown'
    else {
      const out = applyOp(state, { ...op, at })
      state = out.state
      lastAt = Math.max(lastAt, out.at)
      if (out.ok) {
        if (op.op === 'feed') lastFeedAt = out.at
      } else {
        reason = typeof out.result?.reason === 'string' ? out.result.reason : 'refused'
      }
    }
    if (reason === null) accepted.push(op.id)
    else rejected.push({ id: op.id, reason })
    records.push({ id: op.id, at, op: JSON.stringify({ op: op.op, args: op.args, tz: op.tz, sentAt: op.at }), ok: reason === null ? 1 : 0, reason })
  }

  return { state: settled(state, now), lastAt, lastFeedAt, accepted, rejected, records, snapshot }
}

/** POST /v1/sync { ops, snapshot? } */
export async function postSync(env, device, now, text) {
  const body = parseObject(text)
  if (body === null) return fail(400, 'bad-request')
  const ops = Array.isArray(body.ops) ? body.ops : []
  if (ops.length > MAX_OPS_PER_SYNC) return fail(413, 'too-many-ops', { max: MAX_OPS_PER_SYNC })
  const accountId = device.account_id
  const ids = ops.map(op => op?.id).filter(id => typeof id === 'string' && id.length <= 64)

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const pig = await loadPig(env, accountId)
    const known = await knownIds(env, accountId, ids)
    const out = replay(pig, body, ops, known, env, now)
    if (out.error) return out.error

    const changed = out.records.length > 0 || out.snapshot === 'taken'
    if (!changed) {
      return json(200, { ok: true, rev: pig.rev, state: out.state, accepted: out.accepted, rejected: out.rejected, snapshot: out.snapshot, serverNow: now })
    }

    const rev = pig.rev + 1
    const token = crypto.randomUUID()
    const stateText = out.state === null ? null : JSON.stringify(out.state)
    const write = pig.exists
      ? env.DB.prepare('UPDATE pigs SET rev = ?, state = ?, last_at = ?, last_feed_at = ?, updated_at = ?, token = ? WHERE account_id = ? AND rev = ?')
        .bind(rev, stateText, out.lastAt, out.lastFeedAt, now, token, accountId, pig.rev)
      : env.DB.prepare('INSERT INTO pigs (account_id, rev, state, last_at, last_feed_at, updated_at, token) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(account_id) DO NOTHING')
        .bind(accountId, rev, stateText, out.lastAt, out.lastFeedAt, now, token)
    // The log rows only land when this very write did (same token).
    const logs = out.records.map(record => env.DB.prepare(
      'INSERT OR IGNORE INTO ops (account_id, id, rev, device_id, at, op, ok, reason) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM pigs WHERE account_id = ? AND token = ?)',
    ).bind(accountId, record.id, rev, device.id, record.at, record.op, record.ok, record.reason, accountId, token))
    const results = await env.DB.batch([write, ...logs])
    if ((results[0]?.meta?.changes ?? 0) === 0) continue // someone else wrote first: replay on their pig

    await env.DB.prepare('DELETE FROM ops WHERE account_id = ? AND at < ?').bind(accountId, now - KEEP_OPS_MS).run()
    return json(200, { ok: true, rev, state: out.state, accepted: out.accepted, rejected: out.rejected, snapshot: out.snapshot, serverNow: now })
  }
  return fail(503, 'busy')
}
