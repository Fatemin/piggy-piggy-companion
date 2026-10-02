/**
 * [ST0012] The app was renamed from "DSH Piggy" to the GitHub project's name,
 * and Electron keeps a pig's save in a folder named after the app. On the
 * first start under the new name, carry the pig over from the old folder so
 * nobody loses it. No Electron here, so tests run it under plain Node.
 *
 * The old folder is left as it was: it stays a backup, and an old copy of the
 * app that is still installed keeps working on its own save.
 */

import { copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

/** Names the app had before, newest first. */
export const LEGACY_APP_NAMES = Object.freeze(['DSH Piggy'])

/** What a pig's save is: the game itself, then where its window stood. */
const SAVE = 'state.json'
const EXTRAS = Object.freeze(['window.json'])

/**
 * Copy the newest old save into `userData` unless that already has one.
 * `appData` is the folder the app folders live in. Returns
 * `{ from, copied: [file names] }`, or null when there was nothing to do.
 */
export function migrateSave(appData, userData, legacy = LEGACY_APP_NAMES) {
  if (existsSync(join(userData, SAVE))) return null
  for (const name of legacy) {
    const from = join(appData, name)
    if (from === userData || !existsSync(join(from, SAVE))) continue
    mkdirSync(userData, { recursive: true })
    // The save goes last, through a temporary name: its arrival is what
    // marks the move done, so a start that dies halfway simply tries again.
    const copied = [...EXTRAS, SAVE].filter(file => existsSync(join(from, file)))
    for (const file of copied) {
      const temp = join(userData, `${file}.migrating`)
      copyFileSync(join(from, file), temp)
      renameSync(temp, join(userData, file))
    }
    return { from, copied }
  }
  return null
}
