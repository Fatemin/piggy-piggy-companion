// Local pig processes: who is running, reaping test pigs, restarting the real one
// (docs/agent/delivery.md §3.2).
//
//   node scripts/harness/pigs.mjs list [--json]
//   node scripts/harness/pigs.mjs reap [--mine] [--all-tests] [--max-age <min>] [--dry-run] [--json]
//   node scripts/harness/pigs.mjs restart [--dry-run] [--json]
//
// [AC0013] The *real* pig is the user's own: the native DshPiggyDesk and the
// `pig serve` on the default save (~/.claude/pig/state.json). Every Electron
// desktop pig is a *test* pig, whatever its profile, and so is `pig serve`
// with PIG_STATE. `reap` never touches the real pig; it stops test pigs that
// are orphaned (no live launcher), older than --max-age (default 120 min), or,
// with --mine, started under this Claude session; --all-tests takes every test
// pig. `restart` quits the real DshPiggyDesk and starts the main checkout's
// build in its own session; only on the user's request, never after a merge.
// Only macOS/Linux (`ps`).
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { HarnessError, finish, isMain, parseArgs, repoRoot, result, worktrees } from './lib/common.mjs'
import { requireConfig } from './lib/config.mjs'

export const DEFAULT_MAX_AGE_MIN = 120
const TERM_GRACE_MS = 10_000
const LOG = path.join(os.tmpdir(), 'dsh-piggy-native.log')
const NATIVE_BIN = path.join('desktop', '.build', 'release', 'DshPiggyDesk')

/** Processes that only pass a launch along; a pig whose ancestors are all these has no live launcher. */
const WRAPPER = /^-?(sh|bash|zsh|dash|fish|npm|npx|node|env|nohup|caffeinate|timeout)$/

const KINDS = [
  // Main processes only: helpers live under Frameworks/ and die with them.
  ['desk-dev', /\/app\/node_modules\/electron\/dist\/Electron\.app\/Contents\/MacOS\/Electron(?= |$)/],
  // [ST0012] the app was "DSH Piggy"; an older install may still run under it.
  ['desk-app', /(?:DSH Piggy|piggy-piggy-companion)\.app\/Contents\/MacOS\/(?:DSH Piggy|piggy-piggy-companion)(?= |$)/],
  ['native', /\/DshPiggyDesk(?= |$)/],
  ['serve', /bin\/pig\.js serve(?= |$)/],
]

/** `[[dd-]hh:]mm:ss` → seconds. */
export function parseEtime(text) {
  const [days, rest] = text.includes('-') ? text.split('-') : ['0', text]
  const parts = rest.split(':').map(Number)
  while (parts.length < 3) parts.unshift(0)
  const [h, m, s] = parts
  return Number(days) * 86_400 + h * 3600 + m * 60 + s
}

/** Rows of `ps -o pid=,ppid=,etime=,command=`. */
export function parsePs(text) {
  return text.split('\n').map((line) => /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line)).filter(Boolean)
    .map(([, pid, ppid, etime, command]) => ({ pid: Number(pid), ppid: Number(ppid), age_s: parseEtime(etime), command }))
}

/** One variable out of a `ps -E` command line (values may contain spaces). */
export function envValue(commandWithEnv, name) {
  const m = new RegExp(`(?:^| )${name}=(.*?)(?= [A-Za-z_][A-Za-z0-9_]*=|$)`).exec(commandWithEnv ?? '')
  return m ? m[1] : null
}

/**
 * The executable's name, for matching only: from `ps -o comm=` when known (its
 * path may hold spaces), else the command's first word. Its first word, since
 * npm retitles itself to `npm start`.
 */
const exe = (p) => (p.name ?? path.basename(p.command.split(' ')[0])).split(' ')[0]

/**
 * The pigs among `procs`, each with its role and launcher chain.
 * `envOf(pid)` returns that process's `ps -E` line, or null.
 */
export function classify(procs, envOf) {
  const byPid = new Map(procs.map((p) => [p.pid, p]))
  const pigs = []
  for (const p of procs) {
    const kind = KINDS.find(([, re]) => re.test(p.command))?.[0]
    if (!kind) continue
    const env = envOf(p.pid)
    const testData = kind === 'serve' ? envValue(env, 'PIG_STATE') : kind.startsWith('desk') ? envValue(env, 'PIGGY_USER_DATA') : null
    // [AC0013] Electron is for testing only, even on its default profile.
    const role = kind.startsWith('desk') || testData ? 'test' : 'real'
    const ancestors = []
    for (let up = byPid.get(p.ppid); up && up.pid > 1 && ancestors.length < 32; up = byPid.get(up.ppid)) ancestors.push(up)
    const launcher = ancestors.find((a) => !WRAPPER.test(exe(a))) ?? null
    const checkout = kind === 'desk-dev' ? p.command.split('/app/node_modules/')[0]
      : kind === 'native' && p.command.startsWith('/') ? p.command.split('/desktop/.build/')[0] : null
    pigs.push({
      pid: p.pid, kind, role, age_min: Math.floor(p.age_s / 60),
      data: testData, checkout, orphan: launcher === null,
      launcher: launcher ? { pid: launcher.pid, command: launcher.command.slice(0, 120) } : null,
      ancestors: ancestors.map((a) => a.pid),
    })
  }
  return pigs
}

/** Why `pig` should be reaped, or null to keep it. */
export function reapReason(pig, { maxAgeMin = DEFAULT_MAX_AGE_MIN, mine = null, allTests = false } = {}) {
  if (pig.role !== 'test') return null
  if (allTests) return '--all-tests'
  if (pig.orphan) return 'orphaned: no live launcher'
  if (mine !== null && pig.ancestors.includes(mine)) return 'started by this session'
  if (pig.age_min >= maxAgeMin) return `older than ${maxAgeMin} min`
  return null
}

function ps(args) {
  if (process.platform === 'win32') throw new HarnessError('pigs.mjs needs ps (macOS/Linux)')
  const r = spawnSync('ps', ['-ax', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new HarnessError(`ps failed: ${r.stderr || r.error?.message}`)
  return r.stdout
}

const COLUMNS = ['-o', 'pid=,ppid=,etime=,command=']

function readProcs() {
  const names = new Map(ps(['-o', 'pid=,comm=']).split('\n').map((line) => /^\s*(\d+)\s+(.*)$/.exec(line)).filter(Boolean)
    .map(([, pid, comm]) => [Number(pid), path.basename(comm.trim())]))
  return parsePs(ps(COLUMNS)).map((p) => ({ ...p, name: names.get(p.pid) }))
}

export function scan() {
  const env = new Map(parsePs(ps(['-E', ...COLUMNS])).map((p) => [p.pid, p.command]))
  return classify(readProcs(), (pid) => env.get(pid) ?? null)
}

/** The Claude Code process this command runs under, or null. */
function sessionPid() {
  const procs = new Map(readProcs().map((p) => [p.pid, p]))
  for (let up = procs.get(process.ppid); up && up.pid > 1; up = procs.get(up.ppid)) {
    if (exe(up) === 'claude') return up.pid
  }
  return null
}

const alive = (pid) => {
  try { process.kill(pid, 0); return true } catch (error) { return error?.code === 'EPERM' }
}

async function waitGone(pid, ms) {
  const deadline = Date.now() + ms
  while (alive(pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200))
  return !alive(pid)
}

/** SIGTERM lets the app flush its save; a test pig that ignores it is killed. */
async function stop(pig, { force }) {
  try { process.kill(pig.pid, 'SIGTERM') } catch (error) { if (error?.code === 'ESRCH') return 'gone'; throw error }
  if (await waitGone(pig.pid, TERM_GRACE_MS)) return 'terminated'
  if (!force) return 'still running'
  try { process.kill(pig.pid, 'SIGKILL') } catch { /* already gone */ }
  return (await waitGone(pig.pid, 2000)) ? 'killed' : 'still running'
}

const brief = (p) => ({ pid: p.pid, kind: p.kind, role: p.role, age_min: p.age_min, orphan: p.orphan, data: p.data, checkout: p.checkout, launcher: p.launcher })

async function reap(flags) {
  const maxAgeMin = flags['max-age'] === undefined ? DEFAULT_MAX_AGE_MIN : Number(flags['max-age'])
  if (!Number.isFinite(maxAgeMin) || maxAgeMin < 0) throw new HarnessError('--max-age needs minutes')
  const mine = flags.mine ? sessionPid() : null
  if (flags.mine && mine === null) throw new HarnessError('--mine: not running under a Claude Code session')
  const pigs = scan()
  const targets = pigs.map((p) => ({ pig: p, reason: reapReason(p, { maxAgeMin, mine, allTests: flags['all-tests'] === true }) })).filter((t) => t.reason)
  const kept = pigs.filter((p) => !targets.some((t) => t.pig.pid === p.pid)).map(brief)
  if (flags['dry-run']) {
    return result('success', `${targets.length} test pig(s) would be reaped, ${kept.length} kept`,
      targets.length ? ['rerun without --dry-run to reap them'] : [], { reap: targets.map((t) => ({ ...brief(t.pig), reason: t.reason })), kept })
  }
  const reaped = []
  for (const t of targets) reaped.push({ ...brief(t.pig), reason: t.reason, outcome: await stop(t.pig, { force: true }) })
  const stuck = reaped.filter((r) => r.outcome === 'still running')
  return result(stuck.length ? 'warning' : 'success', `${reaped.length - stuck.length} test pig(s) reaped, ${kept.length} kept`,
    stuck.length ? [`still running: ${stuck.map((r) => r.pid).join(', ')}; check them by hand`] : [], { reaped, kept })
}

/** Newest mtime under `dir`, in ms. */
function newest(dir) {
  let latest = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    latest = Math.max(latest, entry.isDirectory() ? newest(full) : fs.statSync(full).mtimeMs)
  }
  return latest
}

async function restart(root, flags) {
  const cfg = requireConfig(root)
  const main = worktrees(root).find((w) => w.branch === cfg.main_branch)?.path
  if (!main) throw new HarnessError(`${cfg.main_branch} is not checked out in any worktree`)
  const bin = path.join(main, NATIVE_BIN)
  if (!fs.existsSync(bin)) throw new HarnessError(`no ${bin}: build it with desktop/build.command first`)
  const sources = path.join(main, 'desktop', 'Sources')
  const stale = fs.existsSync(sources) && newest(sources) > fs.statSync(bin).mtimeMs
  // The desk app's child `pig serve` quits with it and flushes the save.
  const pigs = scan()
  const old = pigs.filter((p) => p.role === 'real' && p.kind === 'native')
  const children = pigs.filter((p) => p.kind === 'serve' && old.some((o) => p.ancestors.includes(o.pid)))
  const plan = { main_checkout: main, stop: old.map(brief), start: bin, log: LOG, stale_build: stale }
  const warn = stale ? ['desktop/Sources is newer than the build: run desktop/build.command, then restart again'] : []
  if (flags['dry-run']) return result('success', `would stop ${old.length} real pig(s) and start ${bin}`, ['rerun without --dry-run', ...warn], plan)
  const stopped = []
  for (const p of old) stopped.push({ ...brief(p), outcome: await stop(p, { force: false }) })
  const stuck = stopped.filter((s) => s.outcome === 'still running')
  if (stuck.length) {
    return result('error', `real pig ${stuck.map((s) => s.pid).join(', ')} did not quit on SIGTERM; nothing started`,
      ['quit it from its menu-bar item, then rerun'], { ...plan, stopped })
  }
  for (const c of children) await waitGone(c.pid, TERM_GRACE_MS)
  const log = fs.openSync(LOG, 'a')
  // Its own session, so it outlives this command and the Claude session.
  const child = spawn(bin, [], { cwd: path.dirname(bin), detached: true, stdio: ['ignore', log, log] })
  child.unref()
  fs.closeSync(log)
  const deadline = Date.now() + 20_000
  let started = null
  while (!started && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    started = scan().find((p) => p.pid === child.pid && p.kind === 'native') ?? null
  }
  if (!started) return result('error', `${bin} did not come up within 20 s`, [`read ${LOG}`], { ...plan, stopped, spawned_pid: child.pid })
  return result(stale ? 'warning' : 'success', `real pig restarted from ${main} (pid ${started.pid})`, warn, { ...plan, stopped, started: brief(started) })
}

if (isMain(process.argv[1], import.meta.url)) {
  try {
    const { flags, positionals } = parseArgs(process.argv.slice(2), ['max-age'])
    const verb = positionals[0] ?? 'list'
    if (verb === 'list') {
      const pigs = scan()
      const tests = pigs.filter((p) => p.role === 'test')
      const due = tests.filter((p) => reapReason(p))
      finish(result(due.length ? 'warning' : 'success',
        `${pigs.length} pig(s): ${pigs.length - tests.length} real, ${tests.length} test, ${due.length} due for reaping`,
        due.length ? ['node scripts/harness/pigs.mjs reap'] : [], { pigs: pigs.map(brief) }))
    }
    if (verb === 'reap') finish(await reap(flags))
    if (verb === 'restart') finish(await restart(repoRoot(), flags))
    throw new HarnessError('usage: pigs.mjs <list|reap|restart> [--mine] [--all-tests] [--max-age <min>] [--dry-run] [--json]')
  } catch (error) {
    if (!(error instanceof HarnessError)) throw error
    finish(result('error', error.message))
  }
}
