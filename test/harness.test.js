import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needsConfirmation, response, tokenize } from '../scripts/harness/claude-test-consent.mjs'
import { parseWorktrees } from '../scripts/harness/doctor.mjs'

test('complete suite needs confirmation', () => {
  for (const cmd of [
    'npm test',
    'npm run test',
    'npm --prefix . test',
    'node --test',
    'node --test test/',
    'node --test "test/**/*.test.js"',
    'cd x && npm test',
    'bash -c "npm test"',
    'FOO=1 npm test',
    'npx node --test',
  ]) assert.equal(needsConfirmation(cmd), true, cmd)
})

test('targeted runs and ordinary commands pass through', () => {
  for (const cmd of [
    'node --test test/core.test.js',
    'node --test --test-name-pattern "feed" test/core.test.js',
    'npm test -- --test-name-pattern=feed',
    'npm test -- test/core.test.js',
    'npm run build',
    'git status',
    'echo npm test',
    'node tools/build-sprites.mjs',
    'node scripts/harness/doctor.mjs --json',
    'npm test > out.log "unbalanced',
    '',
  ]) assert.equal(needsConfirmation(cmd), false, cmd)
})

test('tokenize drops redirect targets and splits chains', () => {
  assert.deepEqual(tokenize('a b > out.txt; c "d e"'), [['a', 'b'], ['c', 'd e']])
  assert.equal(tokenize('echo "oops'), null)
})

test('hook response asks, or denies where asking is impossible', () => {
  const base = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } }
  assert.equal(response(base).hookSpecificOutput.permissionDecision, 'ask')
  assert.equal(response({ ...base, permission_mode: 'bypassPermissions' }).hookSpecificOutput.permissionDecision, 'deny')
  assert.deepEqual(response({ ...base, tool_input: { command: 'git status' } }), {})
  assert.deepEqual(response({ ...base, tool_name: 'Read' }), {})
  assert.ok(response({ hook_event_name: 'SessionStart' }).hookSpecificOutput.additionalContext)
})

test('doctor parses worktree porcelain', () => {
  const w = parseWorktrees('worktree /a\nHEAD abc\nbranch refs/heads/main\n\nworktree /b\nHEAD def\ndetached\nlocked')
  assert.equal(w.length, 2)
  assert.equal(w[0].branch, 'main')
  assert.equal(w[1].detached && w[1].locked, true)
})

test('pigs: ps rows, env values and roles', async () => {
  const { classify, envValue, parseEtime, parsePs, reapReason } = await import('../scripts/harness/pigs.mjs')
  assert.equal(parseEtime('05:59'), 359)
  assert.equal(parseEtime('01:10:44'), 4244)
  assert.equal(parseEtime('2-00:00:01'), 172801)
  assert.equal(envValue('x PIGGY_USER_DATA=/a b/c PIG_LANG=zh', 'PIGGY_USER_DATA'), '/a b/c')
  assert.equal(envValue('x PIG_LANG=zh', 'PIGGY_USER_DATA'), null)
  const procs = parsePs([
    '  100     1   10:00 /Applications/Claude.app/claude',
    '  200   100   10:00 /bin/zsh -c run',
    '  300   200 3:00:00 apps/DSH Piggy.app/Contents/MacOS/DSH Piggy',
    '  301   300 3:00:00 apps/DSH Piggy.app/Contents/Frameworks/DSH Piggy Helper.app/Contents/MacOS/DSH Piggy Helper --type=gpu',
    '  400     1   20:00 npm start',
    '  401   400   20:00 sh -c npm run sync && electron .',
    '  402   401   20:00 node /r/app/node_modules/.bin/electron .',
    '  403   402   20:00 /r/app/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .',
    '  500     1   05:00 /bin/zsh -c left behind',
    '  501   500   05:00 /w/app/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .',
    '  600     1   05:00 node /r/bin/pig.js serve',
    '  700     1   01:00 /Applications/piggy-piggy-companion.app/Contents/MacOS/piggy-piggy-companion',
  ].join('\n'))
  const env = { 300: 'DSH Piggy PIGGY_USER_DATA=/tmp/e2e/userdata', 501: 'Electron . PIGGY_USER_DATA=/tmp/ud', 600: 'node PIG_STATE=/tmp/s.json' }
  const pigs = Object.fromEntries(classify(procs, (pid) => env[pid] ?? null).map((p) => [p.pid, p]))
  assert.deepEqual(Object.keys(pigs).map(Number), [300, 403, 501, 600, 700])
  assert.equal(pigs[700].kind, 'desk-app', '[ST0012] the renamed app is a pig too')
  assert.equal(pigs[700].role, 'real')
  assert.equal(pigs[300].role, 'test')
  assert.equal(pigs[300].orphan, false)
  assert.equal(pigs[403].role, 'real')
  assert.equal(pigs[403].checkout, '/r')
  assert.equal(pigs[403].orphan, true)
  assert.equal(pigs[501].orphan, true)
  assert.equal(pigs[600].role, 'test')
  assert.equal(reapReason(pigs[403], { allTests: true }), null, 'the real pig is never reaped')
  assert.match(reapReason(pigs[501]), /orphaned/)
  assert.match(reapReason(pigs[300]), /older than/)
  assert.equal(reapReason(pigs[300], { maxAgeMin: 500 }), null)
  assert.match(reapReason(pigs[300], { maxAgeMin: 500, mine: 100 }), /this session/)
})
