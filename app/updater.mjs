/**
 * Updates for the desktop pig, shown and driven from the panel.
 *
 * Looks at the latest GitHub release shortly after launch and every few hours.
 * The panel reads `state()` through the server's `/pig/update` route and shows
 * a newer version with an update button; `act('install')` then downloads the
 * installer and replaces the app in place:
 *
 * - Windows: run the NSIS installer silently (`/S --force-run` restarts the pig)
 *   and quit so it can overwrite the files.
 * - macOS: copy the app out of the dmg next to the installed one, then quit and
 *   let a small detached script swap the bundles and reopen the pig.
 *
 * Where that cannot work (a development run, an app started from the dmg or
 * from a folder we may not write to) `canInstall` is false and the panel
 * offers the download page instead.
 */

import { app, net, shell } from 'electron'
import { spawn } from 'node:child_process'
import { accessSync, constants, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { bundleOf, download, fetchLatest, MAC_SWAP_SCRIPT, REPO, stageMacApp } from './update-core.mjs'

const FIRST_CHECK_MS = 20 * 1000
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

/** Why this copy cannot replace itself, or null when it can. */
function blocker() {
  if (!app.isPackaged) return 'dev'
  if (process.platform === 'win32') return null
  if (process.platform !== 'darwin') return 'platform'
  const bundle = bundleOf(app.getPath('exe'))
  if (bundle === null || bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) return 'location'
  try { accessSync(dirname(bundle), constants.W_OK) } catch { return 'location' }
  return null
}

export function createUpdater() {
  // 'idle' (not checked yet) · 'checking' · 'latest' · 'available' · 'downloading' · 'installing'
  let status = 'idle'
  let latest = null
  let progress = 0
  let failure = null // { during: 'check' | 'install', message }

  async function check() {
    if (status === 'checking' || status === 'downloading' || status === 'installing') return
    const before = status
    status = 'checking'
    try {
      latest = await fetchLatest({
        // [ST0014] Chromium's network stack: follows the system proxy.
        fetchImpl: (url, init) => net.fetch(url, init),
        current: app.getVersion(),
        repo: process.env.PIGGY_UPDATE_REPO || undefined,
        feed: process.env.PIGGY_UPDATE_FEED || undefined,
      })
      status = latest === null ? 'latest' : 'available'
      failure = null
    } catch (error) {
      status = before
      failure = { during: 'check', message: String(error?.message ?? error) }
    }
  }

  async function install() {
    if (status !== 'available' || latest?.asset == null) return
    const release = latest
    status = 'downloading'
    progress = 0
    failure = null
    const dir = join(app.getPath('temp'), 'dsh-piggy-update')
    // Leftovers from an earlier attempt.
    rmSync(dir, { recursive: true, force: true })
    try {
      const file = await download(release.asset, dir, { onProgress: fraction => { progress = fraction }, fetchImpl: (url, init) => net.fetch(url, init) })
      status = 'installing'
      if (process.platform === 'win32') {
        spawn(file, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref()
      } else {
        const bundle = bundleOf(app.getPath('exe'))
        const staged = `${bundle}.update`
        // [ST0012] The new app keeps the name it has in the dmg, so a renamed
        // app lands under its new name next to where the old one was.
        const name = await stageMacApp(file, staged)
        const script = join(dir, 'swap.sh')
        writeFileSync(script, MAC_SWAP_SCRIPT, { mode: 0o755 })
        spawn('/bin/sh', [script, String(process.pid), bundle, staged, file, join(dirname(bundle), name)], { detached: true, stdio: 'ignore' }).unref()
      }
      // Give the panel a moment to show "installing"; before-quit saves the
      // pig as on any other quit.
      setTimeout(() => app.quit(), 1500)
    } catch (error) {
      status = 'available'
      failure = { during: 'install', message: String(error?.message ?? error) }
      rmSync(dir, { recursive: true, force: true })
    }
  }

  /** What the panel shows. */
  function state() {
    return {
      current: app.getVersion(),
      status,
      latest: latest === null ? null : { version: latest.version, notes: latest.notes },
      progress: Math.round(progress * 100),
      canInstall: latest !== null && latest.asset !== null && blocker() === null,
      error: failure === null ? null : failure.during,
      message: failure === null ? '' : failure.message,
    }
  }

  /** The panel's buttons; false for anything else. */
  function act(action) {
    if (action === 'check') check()
    else if (action === 'install') install()
    else if (action === 'page') shell.openExternal(latest?.url ?? `https://github.com/${REPO}/releases/latest`)
    else return false
    return true
  }

  function start() {
    setTimeout(() => check(), FIRST_CHECK_MS).unref?.()
    setInterval(() => check(), CHECK_EVERY_MS).unref?.()
  }

  return { state, act, start }
}
