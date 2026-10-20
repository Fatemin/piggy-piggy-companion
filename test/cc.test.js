import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { lockPath } from '../lib/config.js'
import { feed } from '../lib/feed.js'
import { createHost } from '../lib/host.js'
import { acquireLock } from '../lib/lock.js'
import { withLocalHost } from '../lib/reach.js'
import { startServer } from '../lib/server.js'
import { readSnapshot, statusLine } from '../lib/status.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

// Most tests count every event; the throttle has its own test below.
process.env.PIG_FEED_EVERY_MIN = '0'

const tempState = () => join(mkdtempSync(join(tmpdir(), 'pig-cc-')), 'state.json')
const readSave = file => JSON.parse(readFileSync(file, 'utf8'))

async function freePort() {
  const probe = createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address()
  await new Promise(resolve => probe.close(resolve))
  return port
}

function hatched(file) {
  withLocalHost(file, host => host.command('hatch'))
  return file
}

test('upstream plugin runs unmodified on the shim and flushes on dispose', () => {
  const file = tempState()
  const host = createHost({ statePath: file })
  assert.equal(host.command('hatch').kind, 'success')
  for (const kind of ['message', 'turn', 'tool', 'tool', 'toolError', 'agentError']) assert.ok(host.emit(kind))
  assert.equal(host.emit('nonsense'), false)
  host.dispose()
  const stats = readSave(file).stats
  assert.deepEqual(
    [stats.messages, stats.turns, stats.tools, stats.toolErrors, stats.agentErrors],
    [1, 1, 2, 1, 1],
  )
})

test('with no server, a hook feeds the save directly under the lock', async () => {
  const file = hatched(tempState())
  const env = { PIG_STATE: file, PIG_PORT: String(await freePort()) }
  assert.equal(await feed('tool', env), 'local')
  assert.equal(await feed('bogus', env), 'ignored')
  assert.equal(readSave(file).stats.tools, 1)
  assert.equal(existsSync(lockPath(file)), false, 'lock released')
})

test('a held lock drops the event instead of racing the owner', async () => {
  const file = hatched(tempState())
  const release = acquireLock(lockPath(file))
  try {
    const env = { PIG_STATE: file, PIG_PORT: String(await freePort()) }
    const started = Date.now()
    assert.equal(await feed('tool', env), 'dropped')
    assert.ok(Date.now() - started < 2500)
  } finally {
    release()
  }
  assert.equal(readSave(file).stats.tools, 0)
})

test('a lock left by a dead process is taken over', () => {
  const file = tempState()
  mkdirSync(lockPath(file), { recursive: true })
  writeFileSync(join(lockPath(file), 'pid'), '2147483646')
  const release = acquireLock(lockPath(file), { waitMs: 0 })
  assert.equal(typeof release, 'function')
  release()
})

test('while the server runs it is the single writer', async () => {
  const file = hatched(tempState())
  const server = await startServer({ port: 0, statePath: file })
  try {
    const env = { PIG_STATE: file, PIG_PORT: String(server.port) }
    assert.equal(await feed('turn', env), 'server')
    assert.equal(await feed('turn', env), 'server')
    assert.deepEqual(withLocalHost(file, () => 'wrote', { waitMs: 0 }), { locked: true })
    await assert.rejects(startServer({ port: 0, statePath: file }), /locked by pid/)
  } finally {
    await server.close()
  }
  assert.equal(readSave(file).stats.turns, 2, 'flushed on close')
  assert.equal(existsSync(lockPath(file)), false)
})

test('server serves the shell, the client and upstream routes', async () => {
  const file = hatched(tempState())
  const server = await startServer({ port: 0, statePath: file })
  try {
    const page = await fetch(server.url)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /__ModuleLoader__/)
    const client = await fetch(new URL('client.js', server.url))
    assert.match(await client.text(), /window\.__ModuleLoader__\.load/)

    const state = await (await fetch(new URL('dsh-pig/state', server.url))).json()
    assert.equal(state.hatched, true)
    assert.equal(typeof state.pig.satiety, 'number')

    const pet = await fetch(new URL('dsh-pig/act', server.url), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'pet' }),
    })
    assert.equal((await pet.json()).ok, true)

    const art = await fetch(new URL('dsh-pig/art/stage-piglet.svg', server.url))
    assert.equal(art.status, 200)
    // [ST0004] the art route dresses a pose; unknown keys are dropped, never echoed.
    const dressed = await (await fetch(new URL('dsh-pig/art/stage-piglet.svg?wear=bow,../../x,glasses', server.url))).text()
    assert.match(dressed, /data-wear="bow"/)
    assert.match(dressed, /data-wear="glasses"/)
    assert.doesNotMatch(dressed, /\.\.\/\.\.\/x/)
    const covered = await (await fetch(new URL('dsh-pig/art/away-trip.svg?wear=bow', server.url))).text()
    assert.doesNotMatch(covered, /data-wear="bow"/, 'the straw hat of the road covers the bow')

    const desk = await (await fetch(new URL('desk', server.url))).text()
    assert.match(desk, /__pigHit/)
    assert.match(desk, /background: transparent/)
    // [ST0026] the desk's pen: the host's bridge for it, and the overlay that fences one in.
    assert.match(desk, /__pigPen/)
    assert.match(desk, /layout: 'pen'/)
    const pick = await fetch(new URL('pen-pick?lang=ja', server.url))
    assert.equal(pick.status, 200)
    assert.match(await pick.text(), /penPicked/)

    const peek = await (await fetch(new URL('pig/peek', server.url))).json()
    assert.match(peek.line, /🍚\d+/)

    const cmd = await (await fetch(new URL('pig/cmd', server.url), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'status' }),
    })).json()
    assert.equal(cmd.kind, 'success')
  } finally {
    await server.close()
  }
})

test('[ST0026] the desk pen reads the state with ?peek=1, which leaves the announcements to the panel', async () => {
  const file = hatched(tempState())
  // A shift that ended a minute ago: the server settles it and queues "back from work".
  const save = readSave(file)
  const now = Date.now()
  save.activity = { kind: 'work', key: 'odd', label: '打零工', emoji: '🧹', startedAt: now - 2 * 60_000, endsAt: now - 60_000 }
  save.lastSeenAt = now - 2 * 60_000
  writeFileSync(file, JSON.stringify(save))
  const server = await startServer({ port: 0, statePath: file })
  try {
    const read = async path => (await (await fetch(new URL(path, server.url))).json()).pending.map(p => p.text)
    const news = await read('dsh-pig/state?peek=1')
    assert.ok(news.length > 0, 'the shift was settled')
    assert.deepEqual(await read('dsh-pig/state?peek=1'), news, 'peeking drains nothing')
    assert.deepEqual(await read('dsh-pig/state'), news, 'the panel still gets it')
    assert.deepEqual(await read('dsh-pig/state'), [], 'once')
  } finally {
    await server.close()
  }
})

test('the update route is there only when the host can update itself', async () => {
  const plain = await startServer({ port: 0, statePath: tempState() })
  try {
    assert.equal((await fetch(new URL('pig/update', plain.url))).status, 404, 'the Claude Code panel has no updater')
  } finally {
    await plain.close()
  }

  const acts = []
  const update = {
    state: () => ({ current: '0.6.0', status: acts.includes('check') ? 'latest' : 'idle' }),
    act: action => (['check', 'install'].includes(action) ? (acts.push(action), true) : false),
  }
  const server = await startServer({ port: 0, statePath: tempState(), update })
  const route = new URL('pig/update', server.url)
  const post = body => fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  try {
    assert.deepEqual(await (await fetch(route)).json(), { current: '0.6.0', status: 'idle' })
    assert.deepEqual(await (await post({ action: 'check' })).json(), { current: '0.6.0', status: 'latest' })
    assert.equal((await post({ action: 'rm -rf' })).status, 400)
    const foreign = await fetch(route, { method: 'POST', headers: { origin: 'http://evil.example', 'content-type': 'application/json' }, body: '{"action":"install"}' })
    assert.equal(foreign.status, 403, 'other pages cannot start an install')
    assert.deepEqual(acts, ['check'])
  } finally {
    await server.close()
  }
})

test('server refuses foreign hosts, foreign origins and non-JSON posts', async () => {
  const server = await startServer({ port: 0, statePath: tempState() })
  const act = new URL('dsh-pig/act', server.url)
  try {
    // fetch() silently replaces a custom Host header, so send this one raw.
    const rebinding = await new Promise((resolve, reject) => {
      const req = request(act, { method: 'POST', headers: { host: 'evil.example', 'content-type': 'application/json' } }, res => {
        res.resume()
        resolve(res.statusCode)
      })
      req.on('error', reject)
      req.end('{"action":"hatch"}')
    })
    assert.equal(rebinding, 403)
    const foreign = await fetch(act, { method: 'POST', headers: { origin: 'http://evil.example', 'content-type': 'application/json' }, body: '{"action":"hatch"}' })
    assert.equal(foreign.status, 403)
    const simple = await fetch(act, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"action":"hatch"}' })
    assert.equal(simple.status, 415)
    const state = await (await fetch(new URL('dsh-pig/state', server.url))).json()
    assert.equal(state.hatched, false, 'none of them hatched the pig')
  } finally {
    await server.close()
  }
})

test('hook process prints nothing and always exits 0', async () => {
  const file = hatched(tempState())
  const env = { ...process.env, PIG_STATE: file, PIG_PORT: String(await freePort()) }
  const payload = JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash' })
  const ok = spawnSync(process.execPath, [join(ROOT, 'bin/pig-hook.js'), 'tool'], { env, input: payload, encoding: 'utf8' })
  assert.equal(ok.status, 0)
  assert.equal(ok.stdout, '')
  assert.equal(ok.stderr, '')
  assert.equal(readSave(file).stats.tools, 1)

  const junk = spawnSync(process.execPath, [join(ROOT, 'bin/pig-hook.js')], { env: { ...env, PIG_STATE: '/dev/null/nope' }, input: '', encoding: 'utf8' })
  assert.equal(junk.status, 0)
  assert.equal(junk.stdout, '')
})

test('status line reads without writing and covers box / alive', () => {
  const file = tempState()
  assert.match(statusLine(readSnapshot(file)), /📦/)
  assert.equal(existsSync(file), false, 'reading a missing save creates nothing')

  hatched(file)
  const before = statSync(file).mtimeMs
  const line = statusLine(readSnapshot(file))
  assert.match(line, /🍚\d+ ❤️\d+ 🫧\d+ 💚\d\/5/)
  assert.equal(statSync(file).mtimeMs, before, 'status line never writes')
})

test('pig CLI works without a server', async () => {
  const file = tempState()
  const env = { ...process.env, PIG_STATE: file, PIG_PORT: String(await freePort()) }
  const run = (...args) => spawnSync(process.execPath, [join(ROOT, 'bin/pig.js'), ...args], { env, encoding: 'utf8' })
  assert.equal(run('hatch').status, 0)
  const status = run()
  assert.equal(status.status, 0)
  assert.ok(status.stdout.length > 0)
  const line = run('status-line')
  assert.match(line.stdout, /🍚/)
  assert.notEqual(run('work', 'no-such-job').status, 0)
})

test('a server started by the desktop app leaves when the app is gone', async () => {
  const file = hatched(tempState())
  const parent = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' })
  const deadPid = parent.stdout
  const { spawn } = await import('node:child_process')
  const child = spawn(process.execPath, [join(ROOT, 'bin/pig.js'), 'serve'], {
    env: { ...process.env, PIG_STATE: file, PIG_PORT: String(await freePort()), PIG_PARENT_PID: deadPid },
    stdio: 'ignore',
  })
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('server outlived its parent')) }, 6000)
    child.on('exit', status => { clearTimeout(timer); resolve(status) })
  })
  assert.equal(code, 0)
  assert.equal(existsSync(lockPath(file)), false, 'lock released on the way out')
})

test('statusline.sh shows the pig alone or after another status line', () => {
  const env = { ...process.env, PIG_STATE: hatched(tempState()) }
  const alone = spawnSync('sh', [join(ROOT, 'bin/statusline.sh')], { env, input: '{}', encoding: 'utf8' })
  assert.match(alone.stdout, /^🐖 .*🍚\d+/)
  const chained = spawnSync('sh', [join(ROOT, 'bin/statusline.sh'), 'sh', '-c', 'cat >/dev/null; echo BASE'], { env, input: '{}', encoding: 'utf8' })
  assert.match(chained.stdout, /^BASE · 🐖 /)
})

test('passive feeding is throttled to one bite per interval, across processes', () => {
  const file = hatched(tempState())
  let clock = 1_000_000
  const now = () => clock
  const first = createHost({ statePath: file, feedEveryMs: 30 * 60_000, now })
  assert.equal(first.emit('tool'), 'fed')
  assert.equal(first.emit('tool'), 'throttled')
  assert.equal(first.emit('bogus'), false)
  first.dispose()

  // Another process (a hook, a second session) shares the same clock file.
  const second = createHost({ statePath: file, feedEveryMs: 30 * 60_000, now })
  clock += 29 * 60_000
  assert.equal(second.emit('turn'), 'throttled')
  clock += 2 * 60_000
  assert.equal(second.emit('turn'), 'fed')
  second.dispose()

  const stats = readSave(file).stats
  assert.deepEqual([stats.tools, stats.turns], [1, 1])
})
