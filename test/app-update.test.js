import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { bundleOf, compareVersions, download, fetchLatest, MAC_SWAP_SCRIPT, pickAsset, readRelease, REPO, stageMacApp } from '../app/update-core.mjs'

const temp = () => mkdtempSync(join(tmpdir(), 'pig-update-'))
const url = name => `https://github.com/x/y/releases/download/v0.7.0/${name}`
// GitHub turns the spaces in electron-builder's file names into dots.
const ASSETS = [
  { name: 'DSH.Piggy-0.7.0-universal.dmg.blockmap', browser_download_url: url('a') },
  { name: 'DSH.Piggy-0.7.0-universal.dmg', browser_download_url: url('b'), size: 10 },
  { name: 'DSH.Piggy.Setup.0.7.0.exe.blockmap', browser_download_url: url('c') },
  { name: 'DSH.Piggy.Setup.0.7.0.exe', browser_download_url: url('d'), size: 10 },
  { name: 'latest.yml', browser_download_url: url('e') },
]
const release = extra => ({ tag_name: 'v0.7.0', html_url: 'https://github.com/x/y/releases/tag/v0.7.0', body: '新衣柜', assets: ASSETS, ...extra })
const fakeFetch = (status, body, headers = {}) => async () => new Response(body, { status, headers })

test('versions compare numerically, a pre-release before its release', () => {
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1)
  assert.equal(compareVersions('v0.7.0', '0.7.0'), 0)
  assert.equal(compareVersions('0.7', '0.7.0'), 0)
  assert.equal(compareVersions('0.6.0', '0.7.0'), -1)
  assert.equal(compareVersions('1.0.0-beta.1', '1.0.0'), -1)
  assert.equal(compareVersions('1.0.0', '1.0.0-beta.1'), 1)
  assert.equal(compareVersions('nightly', '1.0.0'), 0, 'unparseable never counts as newer')
})

test('the installer is picked by platform, never a blockmap', () => {
  assert.equal(pickAsset(ASSETS, 'darwin').name, 'DSH.Piggy-0.7.0-universal.dmg')
  assert.equal(pickAsset(ASSETS, 'win32').name, 'DSH.Piggy.Setup.0.7.0.exe')
  assert.equal(pickAsset(ASSETS, 'linux'), null)
  assert.equal(pickAsset(undefined, 'darwin'), null)
})

test('only a newer, published release is offered', () => {
  const info = readRelease(release(), '0.6.0', 'darwin')
  assert.equal(info.version, '0.7.0')
  assert.equal(info.notes, '新衣柜')
  assert.equal(info.asset.name, 'DSH.Piggy-0.7.0-universal.dmg')
  assert.equal(readRelease(release(), '0.7.0', 'darwin'), null, 'same version')
  assert.equal(readRelease(release(), '0.8.0', 'darwin'), null, 'older release')
  assert.equal(readRelease(release({ draft: true }), '0.6.0', 'darwin'), null)
  assert.equal(readRelease(release({ prerelease: true }), '0.6.0', 'darwin'), null)
  assert.equal(readRelease(release({ tag_name: 'latest' }), '0.6.0', 'darwin'), null)
  assert.equal(readRelease(release(), '0.6.0', 'linux').asset, null, 'newer but nothing to install here')
  assert.ok(readRelease(release({ body: 'x'.repeat(2000) }), '0.6.0').notes.length <= 601)
})

test('asking GitHub: no release yet is not an error, a server error is', async () => {
  assert.equal(await fetchLatest({ current: '0.6.0', fetchImpl: fakeFetch(404, '{}') }), null)
  const info = await fetchLatest({ current: '0.6.0', platform: 'win32', fetchImpl: fakeFetch(200, JSON.stringify(release())) })
  assert.equal(info.asset.name, 'DSH.Piggy.Setup.0.7.0.exe')
  await assert.rejects(fetchLatest({ current: '0.6.0', fetchImpl: fakeFetch(503, '') }), /GitHub 503/)
})

test('a download is checked against its size and sha256 digest', async () => {
  const dir = temp()
  const body = 'piggy-installer-bytes'
  const digest = 'sha256:' + createHash('sha256').update(body).digest('hex')
  const seen = []
  const file = await download({ name: 'a.dmg', browser_download_url: 'x', size: body.length, digest }, dir, {
    fetchImpl: fakeFetch(200, body),
    onProgress: fraction => seen.push(fraction),
  })
  assert.equal(readFileSync(file, 'utf8'), body)
  assert.equal(seen.at(-1), 1)

  await assert.rejects(download({ name: 'b.dmg', browser_download_url: 'x', size: body.length + 1 }, dir, { fetchImpl: fakeFetch(200, body) }), /incomplete/)
  assert.equal(existsSync(join(dir, 'b.dmg')), false, 'a short file is not left behind')
  await assert.rejects(download({ name: 'c.dmg', browser_download_url: 'x', size: body.length, digest: 'sha256:00' }, dir, { fetchImpl: fakeFetch(200, body) }), /checksum/)
  assert.equal(existsSync(join(dir, 'c.dmg')), false)
  await assert.rejects(download({ name: 'd.dmg', browser_download_url: 'x' }, dir, { fetchImpl: fakeFetch(404, '') }), /download 404/)
})

test('the running bundle is found from the executable path', () => {
  assert.equal(bundleOf('/Applications/DSH Piggy.app/Contents/MacOS/DSH Piggy'), '/Applications/DSH Piggy.app')
  assert.equal(bundleOf('/usr/local/bin/electron'), null)
})

/** A pid that has already exited, so the swap script does not wait. */
const deadPid = () => spawnSync(process.execPath, ['-e', '0']).pid

function fakeApp(path, version) {
  mkdirSync(join(path, 'Contents', 'MacOS'), { recursive: true })
  writeFileSync(join(path, 'Contents', 'version'), version)
}

test('the macOS swap replaces the bundle and cleans up', { skip: process.platform === 'win32' }, () => {
  const dir = temp()
  const script = join(dir, 'swap.sh')
  writeFileSync(script, MAC_SWAP_SCRIPT, { mode: 0o755 })
  const target = join(dir, 'DSH Piggy.app')
  const staged = `${target}.update`
  const dmg = join(dir, 'new.dmg')
  fakeApp(target, 'old')
  fakeApp(staged, 'new')
  writeFileSync(dmg, '')
  execFileSync('/bin/sh', [script, String(deadPid()), target, staged, dmg], { env: { ...process.env, PIGGY_UPDATE_NO_OPEN: '1' } })
  assert.equal(readFileSync(join(target, 'Contents', 'version'), 'utf8'), 'new')
  assert.equal(existsSync(staged), false)
  assert.equal(existsSync(dmg), false)
  assert.equal(existsSync(script), false, 'the script removes itself')

  // Nothing staged: the old app must be put back, not lost.
  writeFileSync(script, MAC_SWAP_SCRIPT, { mode: 0o755 })
  execFileSync('/bin/sh', [script, String(deadPid()), target, join(dir, 'missing.app'), dmg], { env: { ...process.env, PIGGY_UPDATE_NO_OPEN: '1' }, stdio: 'pipe' })
  assert.equal(readFileSync(join(target, 'Contents', 'version'), 'utf8'), 'new')
})

// [ST0012] a renamed app lands under its new name; the old bundle goes.
test('the macOS swap installs a renamed app under its new name', { skip: process.platform === 'win32' }, () => {
  const dir = temp()
  const run = args => {
    const script = join(dir, 'swap.sh')
    writeFileSync(script, MAC_SWAP_SCRIPT, { mode: 0o755 })
    execFileSync('/bin/sh', [script, String(deadPid()), ...args], { env: { ...process.env, PIGGY_UPDATE_NO_OPEN: '1' }, stdio: 'pipe' })
  }
  const target = join(dir, 'DSH Piggy.app')
  const dest = join(dir, 'piggy-piggy-companion.app')
  fakeApp(target, 'old')
  fakeApp(`${target}.update`, 'new')
  writeFileSync(join(dir, 'a.dmg'), '')
  run([target, `${target}.update`, join(dir, 'a.dmg'), dest])
  assert.equal(readFileSync(join(dest, 'Contents', 'version'), 'utf8'), 'new')
  assert.equal(existsSync(target), false, 'the old bundle is gone')

  // Something already has the new name: update in place rather than nest inside it.
  fakeApp(target, 'old')
  fakeApp(`${target}.update`, 'newer')
  writeFileSync(join(dir, 'b.dmg'), '')
  run([target, `${target}.update`, join(dir, 'b.dmg'), dest])
  assert.equal(readFileSync(join(target, 'Contents', 'version'), 'utf8'), 'newer')
  assert.equal(readFileSync(join(dest, 'Contents', 'version'), 'utf8'), 'new', 'left alone')
  assert.equal(existsSync(join(dest, 'DSH Piggy.app.update')), false, 'nothing nested')
})

test('the app is copied out of a real dmg', { skip: process.platform !== 'darwin' }, async () => {
  const dir = temp()
  const src = join(dir, 'src')
  fakeApp(join(src, 'DSH Piggy.app'), 'from-dmg')
  const dmg = join(dir, 'new.dmg')
  execFileSync('hdiutil', ['create', '-quiet', '-fs', 'HFS+', '-srcfolder', src, '-volname', 'DSH Piggy', dmg])
  const staged = join(dir, 'DSH Piggy.app.update')
  assert.equal(await stageMacApp(dmg, staged), 'DSH Piggy.app', 'says what the app is called in the dmg')
  assert.equal(readFileSync(join(staged, 'Contents', 'version'), 'utf8'), 'from-dmg')
  assert.deepEqual(execFileSync('ls', ['-a', dir], { encoding: 'utf8' }).split('\n').filter(n => n.startsWith('.piggy-dmg-')), [], 'mount point removed')
})

// [ST0012] Installers are named after the GitHub project the updater reads,
// so a download, a release asset and the share folder all say what it is.
test('installers are named after the GitHub project', () => {
  const app = JSON.parse(readFileSync(new URL('../app/package.json', import.meta.url), 'utf8'))
  const project = REPO.split('/')[1]
  const fill = (pattern, ext) => pattern.replace('${version}', app.version).replace('${arch}', 'universal').replace('${ext}', ext)
  const dmg = fill(app.build.dmg.artifactName, 'dmg')
  const exe = fill(app.build.nsis.artifactName, 'exe')
  assert.equal(dmg, `${project}-${app.version}-universal.dmg`)
  assert.equal(exe, `${project}-Setup-${app.version}.exe`)
  const asset = name => ({ name, browser_download_url: `https://example.invalid/${name}` })
  assert.equal(pickAsset([asset(exe), asset(dmg)], 'darwin').name, dmg, 'the updater still finds the dmg')
  assert.equal(pickAsset([asset(dmg), asset(exe)], 'win32').name, exe, 'and the Setup exe')
  const readme = readFileSync(new URL('../app/share-readme.txt', import.meta.url), 'utf8')
  for (const name of [dmg, exe]) assert.ok(readme.includes(`“${name}”`), `the share readme names ${name}`)
})
