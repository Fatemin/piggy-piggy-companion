/**
 * Updates from GitHub Releases — the parts that need no Electron, so tests can
 * run them under plain Node. `updater.mjs` wires them to the tray and dialogs.
 *
 * A release is "newer" when its tag (`v0.7.0` or `0.7.0`) beats the running
 * version. The installer is picked from the release assets by platform: the
 * `.dmg` on macOS, the NSIS `Setup … .exe` on Windows.
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

export const REPO = 'Fatemin/piggy-piggy-companion'

const run = promisify(execFile)

/** '0.7.0' / 'v1.2' / '1.0.0-beta.2' → { nums: [0, 7, 0], pre: '' }; anything else → null. */
function parseVersion(value) {
  const match = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value ?? '').trim())
  if (match === null) return null
  return { nums: match[1].split('.').map(Number), pre: match[2] ?? '' }
}

/** Sign of a − b; a pre-release sorts before its release. Unparseable → 0. */
export function compareVersions(a, b) {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (x === null || y === null) return 0
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i += 1) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d !== 0) return Math.sign(d)
  }
  if (x.pre === y.pre) return 0
  if (x.pre === '') return 1
  if (y.pre === '') return -1
  return x.pre < y.pre ? -1 : 1
}

/** The installer for this platform among a release's assets, or null. */
export function pickAsset(assets, platform = process.platform) {
  const list = Array.isArray(assets) ? assets.filter(a => typeof a?.name === 'string' && typeof a?.browser_download_url === 'string') : []
  const ranked = ext => list
    .filter(a => a.name.toLowerCase().endsWith(ext))
    .sort((a, b) => Number(/universal|setup/i.test(b.name)) - Number(/universal|setup/i.test(a.name)))
  if (platform === 'darwin') return ranked('.dmg')[0] ?? null
  if (platform === 'win32') return ranked('.exe')[0] ?? null
  return null
}

/**
 * What a `releases/latest` answer means for a pig running `current`:
 * `{ version, url, notes, asset }` when it is newer, otherwise null.
 */
export function readRelease(release, current, platform = process.platform) {
  if (release === null || typeof release !== 'object' || release.draft || release.prerelease) return null
  const version = String(release.tag_name ?? '').replace(/^v/, '')
  if (parseVersion(version) === null || compareVersions(version, current) <= 0) return null
  const notes = String(release.body ?? '').trim()
  return {
    version,
    url: typeof release.html_url === 'string' ? release.html_url : `https://github.com/${REPO}/releases`,
    notes: notes.length > 600 ? notes.slice(0, 600) + '…' : notes,
    asset: pickAsset(release.assets, platform),
  }
}

/** Ask GitHub for the newest release; resolves to `readRelease`'s answer. */
export async function fetchLatest({ current, repo = REPO, feed, platform = process.platform, fetchImpl = fetch }) {
  const response = await fetchImpl(feed ?? `https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'piggy-piggy-companion' },
    signal: AbortSignal.timeout(15000),
  })
  // No release published yet.
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub ${response.status}`)
  return readRelease(await response.json(), current, platform)
}

/**
 * Download one asset into `dir`, reporting progress as a 0..1 fraction, and
 * check it against the size and (when GitHub gives one) the sha256 digest.
 */
export async function download(asset, dir, { onProgress = () => {}, fetchImpl = fetch } = {}) {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, basename(asset.name))
  const response = await fetchImpl(asset.browser_download_url, { headers: { 'user-agent': 'piggy-piggy-companion' } })
  if (!response.ok || response.body === null) throw new Error(`download ${response.status}`)
  const total = Number(asset.size) || Number(response.headers.get('content-length')) || 0
  const hash = createHash('sha256')
  let received = 0
  const meter = new Transform({
    transform(chunk, _encoding, done) {
      received += chunk.length
      hash.update(chunk)
      if (total > 0) onProgress(Math.min(1, received / total))
      done(null, chunk)
    },
  })
  try {
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(file))
    if (Number(asset.size) > 0 && received !== Number(asset.size)) throw new Error(`download incomplete (${received}/${asset.size})`)
    const digest = typeof asset.digest === 'string' && asset.digest.startsWith('sha256:') ? asset.digest.slice(7) : null
    if (digest !== null && digest !== hash.digest('hex')) throw new Error('download checksum mismatch')
  } catch (error) {
    rmSync(file, { force: true })
    throw error
  }
  return file
}

/** The `.app` bundle the running executable lives in, or null outside one. */
export function bundleOf(exePath) {
  const bundle = dirname(dirname(dirname(exePath)))
  return bundle.endsWith('.app') ? bundle : null
}

/**
 * Copy the app out of a downloaded dmg into `staging`, next to the installed
 * bundle so the final swap is a rename on the same volume. Resolves to the
 * app's name in the dmg (`piggy-piggy-companion.app`).
 */
export async function stageMacApp(dmg, staging) {
  const mount = mkdtempSync(join(dirname(staging), '.piggy-dmg-'))
  await run('hdiutil', ['attach', dmg, '-nobrowse', '-noautoopen', '-readonly', '-mountpoint', mount])
  try {
    const name = readdirSync(mount).find(entry => entry.endsWith('.app'))
    if (name === undefined) throw new Error('no app in the dmg')
    rmSync(staging, { recursive: true, force: true })
    await run('ditto', [join(mount, name), staging])
    if (!statSync(join(staging, 'Contents', 'MacOS')).isDirectory()) throw new Error('broken app in the dmg')
    return name
  } finally {
    await run('hdiutil', ['detach', mount, '-quiet']).catch(() => run('hdiutil', ['detach', mount, '-force', '-quiet']).catch(() => {}))
    rmSync(mount, { recursive: true, force: true })
  }
}

/**
 * The shell script that finishes a macOS update once the running pig has quit:
 * wait for its pid, swap the staged bundle in (putting the old one back if the
 * swap fails), clean up and start the new version.
 * Arguments: pid, installed bundle, staged bundle, downloaded dmg, and where
 * the new bundle goes (default: where the old one was). [ST0012] A renamed
 * app lands under its new name; if something already sits there, in the old
 * place instead.
 */
export const MAC_SWAP_SCRIPT = `#!/bin/sh
pid="$1"; target="$2"; staged="$3"; dmg="$4"; dest="\${5:-$2}"
i=0
while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 600 ]; do sleep 0.1; i=$((i + 1)); done
[ "$dest" != "$target" ] && [ -e "$dest" ] && dest="$target"
old="$target.old-$$"
if mv "$target" "$old"; then
  if mv "$staged" "$dest"; then
    rm -rf "$old"
  else
    mv "$old" "$target"
    dest="$target"
  fi
fi
rm -rf "$staged" "$dmg" "$0"
[ -z "$PIGGY_UPDATE_NO_OPEN" ] && open "$dest"
exit 0
`
