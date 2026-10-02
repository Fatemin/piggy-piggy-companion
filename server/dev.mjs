#!/usr/bin/env node
/**
 * [ST0014] Run the cloud pig locally: the Worker's own handler on node:http,
 * SQLite standing in for D1, and login codes printed here instead of mailed.
 *
 *   node server/dev.mjs                       # http://127.0.0.1:8787
 *   PIG_CLOUD_PORT=9000 PIG_CLOUD_DB=/tmp/pig.sqlite node server/dev.mjs
 *
 * PIG_CLOUD_DB defaults to an in-memory database (gone when it stops).
 */

import { createServer } from 'node:http'

import { openD1 } from './d1-sqlite.mjs'
import { handle } from './worker.js'

const port = Number.parseInt(process.env.PIG_CLOUD_PORT ?? '', 10) || 8787
const env = {
  DB: openD1(process.env.PIG_CLOUD_DB || ':memory:'),
  PIG_SECRET: process.env.PIG_SECRET || 'dev-secret',
  PIG_DEV_MAIL: 'log',
  PIG_FEED_EVERY_MIN: process.env.PIG_FEED_EVERY_MIN,
  PIG_ALLOWED_EMAILS: process.env.PIG_ALLOWED_EMAILS,
}

const server = createServer(async (req, res) => {
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value)
    // What Cloudflare does in production: the socket decides, not the client.
    headers.set('cf-connecting-ip', req.socket.remoteAddress ?? 'unknown')
    const body = chunks.length > 0 && req.method !== 'GET' ? Buffer.concat(chunks) : undefined
    const response = await handle(new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers, body }), env)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain' })
    res.end(String(error))
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`cloud pig (dev) on http://127.0.0.1:${port} — login codes are printed here`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
