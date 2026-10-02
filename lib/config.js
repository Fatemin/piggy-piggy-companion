/**
 * Where the pig lives under Claude Code, and how to reach its panel server.
 *
 * Both are overridable through the environment so tests (and a second pig)
 * never touch the real save.
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const DEFAULT_PORT = 41717

export function statePath(env = process.env) {
  const configured = env.PIG_STATE
  if (typeof configured === 'string' && configured.trim() !== '') return resolve(configured.trim())
  return join(homedir(), '.claude', 'pig', 'state.json')
}

export function port(env = process.env) {
  const parsed = Number.parseInt(env.PIG_PORT ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEFAULT_PORT
}

export const lockPath = file => `${file}.lock`

/** Where the passive-feeding throttle remembers its last meal. */
export const feedClockPath = file => `${file}.fed`

/**
 * Claude Code fires hundreds of tool calls an hour; upstream's diet was tuned
 * for far fewer events. Passive feeding is throttled to one bite per interval
 * (default 30 min, `PIG_FEED_EVERY_MIN`, 0 = off) so the pig still needs you.
 */
export function feedEveryMs(env = process.env) {
  const minutes = Number.parseFloat(env.PIG_FEED_EVERY_MIN ?? '')
  return Number.isFinite(minutes) && minutes >= 0 ? minutes * 60_000 : 30 * 60_000
}

/** [ST0014] The cloud login of this save: server, device key, sync state (0600). */
export const cloudPath = file => `${file}.cloud.json`

/** [ST0014] Ops done while linked to the cloud and not yet confirmed by it, one JSON per line. */
export const outboxPath = file => `${file}.outbox.jsonl`

/** [ST0014] The cloud server to offer at login (`PIG_CLOUD_URL`), or ''. */
export function cloudUrl(env = process.env) {
  const configured = env.PIG_CLOUD_URL
  return typeof configured === 'string' ? configured.trim().replace(/\/+$/, '') : ''
}
