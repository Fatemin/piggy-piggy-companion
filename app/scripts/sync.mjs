// Copy the pig's runtime (upstream game + the adapter's server) into app/pig/,
// because electron-builder only packages files inside app/. Run before start
// and before every build; app/pig/ is generated and git-ignored.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = join(APP, '..')
const OUT = join(APP, 'pig')

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'lib'), { recursive: true })
for (const file of ['index.js', 'core.js', 'data.js', 'render.js', 'store.js', 'ops.js', 'client.js', 'i18n.js', 'world.js', 'art.js', 'LICENSE', 'THIRD-PARTY.md']) {
  cpSync(join(ROOT, file), join(OUT, file))
}
for (const file of ['cloud.js', 'cloud-proto.js', 'config.js', 'host.js', 'lock.js', 'server.js', 'status.js']) {
  cpSync(join(ROOT, 'lib', file), join(OUT, 'lib', file))
}
cpSync(join(ROOT, 'assets'), join(OUT, 'assets'), { recursive: true })
cpSync(join(ROOT, 'LICENSES'), join(OUT, 'LICENSES'), { recursive: true })
cpSync(join(ROOT, 'locales'), join(OUT, 'locales'), { recursive: true })
cpSync(join(ROOT, 'web'), join(OUT, 'web'), { recursive: true })
writeFileSync(join(OUT, 'package.json'), JSON.stringify({ type: 'module', private: true }, null, 2) + '\n')
console.log(`synced pig runtime → ${OUT}`)
