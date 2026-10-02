/**
 * [ST0014] The cloud pig: a Cloudflare Worker with a D1 database (`env.DB`).
 *
 *   POST /v1/auth/code       { email, lang }                      send a login code
 *   POST /v1/auth/verify     { email, code, deviceId, publicKey, deviceName }
 *   GET  /v1/me                                         (signed)  account and devices
 *   GET  /v1/sync                                       (signed)  the pig as it stands
 *   POST /v1/sync            { ops, snapshot? }         (signed)  replay ops, get the pig
 *   POST /v1/devices/revoke  { deviceId }               (signed)
 *   GET  /v1/pen                                        (signed)  my pig pen, its pigs and invites
 *   POST /v1/pen/create|join|leave|invite|accept|cancel (signed)  see pens.js
 *   GET  /v1/health
 *
 * Design: docs/design/ST0014-online-design.md. Locally, server/dev.mjs runs
 * this same handler on Node with SQLite standing in for D1.
 */

import { authenticate, me, requestCode, revokeDevice, verifyCode } from './auth.js'
import { fail, json, readText } from './http.js'
import { acceptInvite, cancelInvite, createPen, getPen, invite, joinPen, leavePen } from './pens.js'
import { getPig, postSync } from './sync.js'

const SIGNED = {
  'GET /v1/me': (env, device) => me(env, device),
  'GET /v1/sync': (env, device, now) => getPig(env, device, now),
  'POST /v1/sync': (env, device, now, text) => postSync(env, device, now, text),
  'POST /v1/devices/revoke': (env, device, now, text) => revokeDevice(env, device, now, text),
  // [ST0014 P3] pig pens
  'GET /v1/pen': (env, device, now) => getPen(env, device, now),
  'POST /v1/pen/create': createPen,
  'POST /v1/pen/join': joinPen,
  'POST /v1/pen/leave': (env, device, now) => leavePen(env, device, now),
  'POST /v1/pen/invite': invite,
  'POST /v1/pen/accept': acceptInvite,
  'POST /v1/pen/cancel': cancelInvite,
}

const OPEN = {
  'POST /v1/auth/code': requestCode,
  'POST /v1/auth/verify': verifyCode,
}

export async function handle(request, env) {
  const now = typeof env.now === 'function' ? env.now() : Date.now()
  const url = new URL(request.url)
  const route = `${request.method} ${url.pathname}`
  if (route === 'GET /v1/health') return json(200, { ok: true, serverNow: now })

  const text = await readText(request)
  if (text === null) return fail(413, 'too-big')
  try {
    if (Object.hasOwn(OPEN, route)) return await OPEN[route](request, env, now, text)
    if (Object.hasOwn(SIGNED, route)) {
      const auth = await authenticate(request, env, now, text)
      if (auth.reply) return auth.reply
      return await SIGNED[route](env, auth.device, now, text)
    }
    return fail(404, 'not-found')
  } catch (error) {
    console.error('pig worker:', error)
    return fail(500, 'error')
  }
}

export default {
  fetch: (request, env) => handle(request, env),
}
