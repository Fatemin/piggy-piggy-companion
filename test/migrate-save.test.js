// [ST0012] The desktop app was renamed; its first start under the new name
// carries the pig over from the old app's folder.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { LEGACY_APP_NAMES, migrateSave } from '../app/migrate-save.mjs'

const appData = () => mkdtempSync(join(tmpdir(), 'pig-appdata-'))
const put = (dir, file, text) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, file), text) }

test('the old save and window spot move to the new folder, once', () => {
  const root = appData()
  const old = join(root, LEGACY_APP_NAMES[0])
  const fresh = join(root, 'piggy-piggy-companion')
  put(old, 'state.json', '{"name":"小猪"}')
  put(old, 'window.json', '{"right":10}')
  put(old, 'Cookies', 'chromium stuff')
  assert.deepEqual(migrateSave(root, fresh), { from: old, copied: ['window.json', 'state.json'] })
  assert.equal(readFileSync(join(fresh, 'state.json'), 'utf8'), '{"name":"小猪"}')
  assert.equal(readFileSync(join(fresh, 'window.json'), 'utf8'), '{"right":10}')
  assert.deepEqual(readdirSync(fresh).sort(), ['state.json', 'window.json'], 'only the pig, no browser leftovers or temp files')
  assert.equal(readFileSync(join(old, 'state.json'), 'utf8'), '{"name":"小猪"}', 'the old save stays as a backup')

  put(old, 'state.json', '{"name":"旧的"}')
  assert.equal(migrateSave(root, fresh), null, 'a pig already here is never overwritten')
  assert.equal(readFileSync(join(fresh, 'state.json'), 'utf8'), '{"name":"小猪"}')
})

test('nothing to move: a new player, or a window spot without a pig', () => {
  const root = appData()
  const fresh = join(root, 'piggy-piggy-companion')
  assert.equal(migrateSave(root, fresh), null)
  put(join(root, 'DSH Piggy'), 'window.json', '{}')
  assert.equal(migrateSave(root, fresh), null, 'no state.json, no move')
  assert.equal(migrateSave(root, join(root, 'DSH Piggy')), null, 'never onto itself')
})
