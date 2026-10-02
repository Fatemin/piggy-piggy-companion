/**
 * [ST0014] Small HTTP helpers for the Worker: JSON replies, bodies with a size
 * cap, and the caller's IP reduced to the key the rate limits count by.
 */

export const BODY_LIMIT_BYTES = 256 * 1024

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })
}

export const fail = (status, reason, extra = {}) => json(status, { ok: false, reason, ...extra })

/** The raw body text, or null when it is too big. */
export async function readText(request) {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > BODY_LIMIT_BYTES) return null
  const text = await request.text()
  return text.length > BODY_LIMIT_BYTES ? null : text
}

/** An object parsed from `text`, or null. */
export function parseObject(text) {
  if (typeof text !== 'string' || text.trim() === '') return {}
  try {
    const value = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

/**
 * Where the request came from. Cloudflare sets `cf-connecting-ip` and a client
 * cannot override it; the local dev runner sets it from the socket.
 */
export const clientIp = request => request.headers.get('cf-connecting-ip') ?? 'unknown'

/**
 * The address the limits count by: IPv4 as it is, IPv6 by its /64 — one home
 * line usually owns a whole /64, so counting single addresses would count
 * nothing at all.
 */
export function ipKey(ip) {
  if (typeof ip !== 'string' || ip === '') return 'unknown'
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
  if (mapped !== null) return mapped[1]
  if (!ip.includes(':')) return ip
  const [head, tail = ''] = ip.toLowerCase().split('%')[0].split('::')
  const left = head === '' ? [] : head.split(':')
  const right = tail === '' ? [] : tail.split(':')
  const groups = ip.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left
  return `${groups.slice(0, 4).map(group => group.replace(/^0+(?=.)/, '')).join(':')}::/64`
}
