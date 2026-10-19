/**
 * [ST0014 P3] Pig pens: a few friends' pigs that can head out together.
 *
 * Anyone makes a pen and shares its six-letter code; an account is in one pen
 * at a time, six pigs at most. A member invites the pen to an outing (work,
 * class or a trip); the first other member to accept takes it. Accepting
 * checks both pigs as they stand right now — each must be home, able to go
 * and qualified on its own — then writes a server-only `coop` op into both
 * pigs at the same moment: 30% faster, 30% more on the way back (COOP).
 */

import { lifeStageFor, mood, wornFor } from '../core.js'
import { COOP } from '../data.js'
import { applyOp } from '../ops.js'
import { placeByKey } from '../world.js'
import { fail, json, parseObject } from './http.js'
import { loadPig, settled } from './sync.js'

export const PEN_LIMITS = Object.freeze({ members: 6, inviteTtlMs: 10 * 60_000, nameMax: 24 })
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const ACCEPT_ATTEMPTS = 4

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map(byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
}

const membership = (env, accountId) => env.DB.prepare(
  'SELECT p.id, p.code, p.name, p.owner_id FROM pen_members m JOIN pens p ON p.id = m.pen_id WHERE m.account_id = ?',
).bind(accountId).first()

/**
 * What a pen mate may see of a pig: who it is, what it is doing, and enough
 * to draw it beside their own (stage, mood, outfit) — no coins, no bag.
 */
function publicPig(state, now) {
  if (state === null) return null
  const a = state.activity
  const life = lifeStageFor(state, now)
  const current = mood(state, now)
  return {
    name: state.name,
    hatched: state.hatched === true,
    dead: state.dead === true,
    asleep: state.sleep !== null && state.sleep !== undefined,
    // [ST0014] for drawing it: the same fields the panel's own pig comes with.
    stage: { key: life.key, size: life.size, art: life.art ?? null, emoji: life.emoji, faded: life.faded === true },
    mood: current.key,
    moodLevel: current.level ?? 0,
    worn: wornFor(state),
    activity: a === null ? null : {
      kind: a.kind, key: a.key, label: a.label, emoji: a.emoji, endsAt: a.endsAt, partner: a.coop?.partner ?? null,
      ...(a.kind === 'study' ? { stage: a.stage ?? null } : {}),
      ...(a.kind === 'trip' ? { region: placeByKey(a.key)?.region ?? null } : {}),
    },
  }
}

/** The pen with its pigs and open invites, as the caller sees it. */
async function penView(env, accountId, now) {
  const pen = await membership(env, accountId)
  if (pen === null) return { pen: null }
  await env.DB.prepare("UPDATE coops SET status = 'expired' WHERE pen_id = ? AND status = 'open' AND expires_at <= ?").bind(pen.id, now).run()
  const rows = (await env.DB.prepare('SELECT account_id, joined_at FROM pen_members WHERE pen_id = ? ORDER BY joined_at').bind(pen.id).all()).results ?? []
  const members = []
  const names = {}
  for (const row of rows) {
    const pig = await loadPig(env, row.account_id)
    const view = publicPig(settled(pig.state, now), now)
    names[row.account_id] = view?.name ?? '?'
    members.push({ id: row.account_id, you: row.account_id === accountId, owner: row.account_id === pen.owner_id, pig: view })
  }
  const invites = ((await env.DB.prepare(
    "SELECT id, inviter_id, kind, args, label, expires_at FROM coops WHERE pen_id = ? AND status = 'open' ORDER BY created_at",
  ).bind(pen.id).all()).results ?? []).map(row => ({
    id: row.id, from: names[row.inviter_id] ?? '?', mine: row.inviter_id === accountId,
    kind: row.kind, args: JSON.parse(row.args), label: row.label, expiresAt: row.expires_at,
  }))
  return { pen: { id: pen.id, code: pen.code, name: pen.name, members, invites, limit: PEN_LIMITS.members } }
}

/** GET /v1/pen */
export async function getPen(env, device, now) {
  return json(200, { ok: true, ...(await penView(env, device.account_id, now)) })
}

/** POST /v1/pen/create { name } */
export async function createPen(env, device, now, text) {
  const body = parseObject(text) ?? {}
  if ((await membership(env, device.account_id)) !== null) return fail(409, 'in-a-pen')
  const name = typeof body.name === 'string' && body.name.trim() !== '' ? body.name.trim().slice(0, PEN_LIMITS.nameMax) : '猪圈'
  const id = crypto.randomUUID()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCode()
    const taken = await env.DB.prepare('SELECT 1 AS hit FROM pens WHERE code = ?').bind(code).first()
    if (taken !== null) continue
    await env.DB.batch([
      env.DB.prepare('INSERT INTO pens (id, code, name, owner_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, code, name, device.account_id, now),
      env.DB.prepare('INSERT INTO pen_members (account_id, pen_id, joined_at) VALUES (?, ?, ?)').bind(device.account_id, id, now),
    ])
    return json(200, { ok: true, ...(await penView(env, device.account_id, now)) })
  }
  return fail(503, 'busy')
}

/** POST /v1/pen/join { code } */
export async function joinPen(env, device, now, text) {
  const body = parseObject(text) ?? {}
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  if ((await membership(env, device.account_id)) !== null) return fail(409, 'in-a-pen')
  const pen = await env.DB.prepare('SELECT id FROM pens WHERE code = ?').bind(code).first()
  if (pen === null) return fail(404, 'no-such-pen')
  const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM pen_members WHERE pen_id = ?').bind(pen.id).first())?.n ?? 0
  if (count >= PEN_LIMITS.members) return fail(409, 'pen-full')
  await env.DB.prepare('INSERT INTO pen_members (account_id, pen_id, joined_at) VALUES (?, ?, ?) ON CONFLICT(account_id) DO NOTHING').bind(device.account_id, pen.id, now).run()
  return json(200, { ok: true, ...(await penView(env, device.account_id, now)) })
}

/** POST /v1/pen/leave — the last one out closes the pen. */
export async function leavePen(env, device, now) {
  const pen = await membership(env, device.account_id)
  if (pen === null) return fail(404, 'not-in-a-pen')
  await env.DB.prepare("UPDATE coops SET status = 'cancelled' WHERE pen_id = ? AND inviter_id = ? AND status = 'open'").bind(pen.id, device.account_id).run()
  await env.DB.prepare('DELETE FROM pen_members WHERE account_id = ?').bind(device.account_id).run()
  const left = (await env.DB.prepare('SELECT account_id FROM pen_members WHERE pen_id = ? ORDER BY joined_at LIMIT 1').bind(pen.id).first())
  if (left === null) await env.DB.prepare('DELETE FROM pens WHERE id = ?').bind(pen.id).run()
  else if (pen.owner_id === device.account_id) await env.DB.prepare('UPDATE pens SET owner_id = ? WHERE id = ?').bind(left.account_id, pen.id).run()
  return json(200, { ok: true, pen: null })
}

/** The op that sends `state` out together; `partner` is the other pig's name. */
const coopOp = (id, accountId, kind, args, partner, state, now) => ({
  id: `coop-${id.slice(0, 24)}-${accountId.slice(0, 8)}`,
  at: now,
  tz: Number.isFinite(state?.utcOffsetMin) ? state.utcOffsetMin : 0,
  op: 'coop',
  args: [kind, args, { id, partner }],
})

/** Would this pig go? `{ ok, state, result }` on a copy, nothing written. */
function tryCoop(state, op) {
  if (state === null) return { ok: false, result: { reason: 'absent' } }
  const copy = structuredClone(state)
  return applyOp(copy, op)
}

function validArgs(kind, args) {
  if (!COOP.kinds.includes(kind) || !Array.isArray(args) || args.length < 1 || args.length > 2) return false
  if (JSON.stringify(args).length > 200) return false
  if (kind === 'study') return (typeof args[0] === 'string' || (Array.isArray(args[0]) && args[0].every(k => typeof k === 'string'))) && typeof args[1] === 'string'
  return typeof args[0] === 'string'
}

/** POST /v1/pen/invite { kind, args } — one open invite per member. */
export async function invite(env, device, now, text) {
  const body = parseObject(text) ?? {}
  const pen = await membership(env, device.account_id)
  if (pen === null) return fail(404, 'not-in-a-pen')
  if (!validArgs(body.kind, body.args)) return fail(400, 'bad-invite')
  const pig = await loadPig(env, device.account_id)
  const state = settled(pig.state, now)
  const id = crypto.randomUUID()
  const trial = tryCoop(state, coopOp(id, device.account_id, body.kind, body.args, '?', state, now))
  if (!trial.ok) return fail(409, 'cannot-go', { who: 'you', why: trial.result?.reason ?? 'refused' })
  const label = `${trial.state.activity.emoji} ${trial.state.activity.label}`
  await env.DB.prepare("UPDATE coops SET status = 'cancelled' WHERE inviter_id = ? AND status = 'open'").bind(device.account_id).run()
  await env.DB.prepare(
    "INSERT INTO coops (id, pen_id, inviter_id, kind, args, label, created_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')",
  ).bind(id, pen.id, device.account_id, body.kind, JSON.stringify(body.args), label, now, now + PEN_LIMITS.inviteTtlMs).run()
  return json(200, { ok: true, inviteId: id, ...(await penView(env, device.account_id, now)) })
}

/** POST /v1/pen/cancel { inviteId } */
export async function cancelInvite(env, device, now, text) {
  const body = parseObject(text) ?? {}
  const result = await env.DB.prepare("UPDATE coops SET status = 'cancelled' WHERE id = ? AND inviter_id = ? AND status = 'open'").bind(String(body.inviteId ?? ''), device.account_id).run()
  if ((result.meta?.changes ?? 0) === 0) return fail(404, 'no-such-invite')
  return json(200, { ok: true, ...(await penView(env, device.account_id, now)) })
}

/** POST /v1/pen/accept { inviteId } — both pigs head out, or neither. */
export async function acceptInvite(env, device, now, text) {
  const body = parseObject(text) ?? {}
  const pen = await membership(env, device.account_id)
  if (pen === null) return fail(404, 'not-in-a-pen')

  for (let attempt = 0; attempt < ACCEPT_ATTEMPTS; attempt += 1) {
    const coop = await env.DB.prepare("SELECT * FROM coops WHERE id = ? AND pen_id = ? AND status = 'open'").bind(String(body.inviteId ?? ''), pen.id).first()
    if (coop === null || coop.expires_at <= now) return fail(404, 'no-such-invite')
    if (coop.inviter_id === device.account_id) return fail(409, 'own-invite')
    const stillMember = await env.DB.prepare('SELECT 1 AS hit FROM pen_members WHERE account_id = ? AND pen_id = ?').bind(coop.inviter_id, pen.id).first()
    if (stillMember === null) return fail(404, 'no-such-invite')

    const args = JSON.parse(coop.args)
    const host = await loadPig(env, coop.inviter_id)
    const guest = await loadPig(env, device.account_id)
    const hostState = settled(host.state, now)
    const guestState = settled(guest.state, now)
    const hostOp = coopOp(coop.id, coop.inviter_id, coop.kind, args, guestState?.name ?? '?', hostState, now)
    const guestOp = coopOp(coop.id, device.account_id, coop.kind, args, hostState?.name ?? '?', guestState, now)
    const guestTry = tryCoop(guestState, guestOp)
    if (!guestTry.ok) return fail(409, 'cannot-go', { who: 'you', why: guestTry.result?.reason ?? 'refused' })
    const hostTry = tryCoop(hostState, hostOp)
    if (!hostTry.ok) return fail(409, 'cannot-go', { who: 'partner', why: hostTry.result?.reason ?? 'refused' })
    for (const out of [hostTry, guestTry]) out.state.pending = []

    const token = crypto.randomUUID()
    const writePig = (accountId, pig, state, op) => [
      env.DB.prepare('UPDATE pigs SET rev = ?, state = ?, last_at = ?, updated_at = ?, token = ? WHERE account_id = ? AND rev = ?')
        .bind(pig.rev + 1, JSON.stringify(state), Math.max(pig.lastAt, now), now, token, accountId, pig.rev),
      env.DB.prepare('INSERT OR IGNORE INTO ops (account_id, id, rev, device_id, at, op, ok, reason) VALUES (?, ?, ?, ?, ?, ?, 1, NULL)')
        .bind(accountId, op.id, pig.rev + 1, 'server', now, JSON.stringify({ op: op.op, args: op.args, tz: op.tz, sentAt: now })),
    ]
    try {
      await env.DB.batch([
        env.DB.prepare("UPDATE coops SET status = 'started', partner_id = ?, token = ? WHERE id = ? AND status = 'open'").bind(device.account_id, token, coop.id),
        ...writePig(coop.inviter_id, host, hostTry.state, hostOp),
        ...writePig(device.account_id, guest, guestTry.state, guestOp),
        env.DB.prepare(
          'INSERT INTO coop_guard (n) SELECT (SELECT COUNT(*) FROM pigs WHERE token = ? AND account_id IN (?, ?)) + (SELECT COUNT(*) FROM coops WHERE id = ? AND token = ?)',
        ).bind(token, coop.inviter_id, device.account_id, coop.id, token),
        env.DB.prepare('DELETE FROM coop_guard'),
      ])
    } catch {
      continue // someone wrote one of the pigs first: look again
    }
    return json(200, { ok: true, ...(await penView(env, device.account_id, now)) })
  }
  return fail(503, 'busy')
}
