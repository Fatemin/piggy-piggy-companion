/**
 * dsh-pig · store — the save file and the feeding valve.
 *
 * One pig per harness home, saved at `$DSH_HOME/dsh-pig/state.json`. Writes go
 * to a sibling temp file, get fsynced, then atomically rename over the old
 * save, so a crash mid-write can never leave a torn pig. Feeds are throttled to
 * one disk write per interval so a busy agent doesn't turn every tool call into
 * IO — and every write is wrapped, because a pet must never break the harness.
 *
 * Every mutator funnels through `decay()` inside core, which is also where a
 * finished work shift, an illness flare-up or a death is resolved. Nothing here
 * owns a timer: the pig is driven entirely by wall-clock timestamps, so it
 * survives restarts exactly as it was left.
 *
 * @module dsh-pig/store
 */

import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { advance, drainPending, migrate } from './core.js'
import { defaultLang } from './i18n.js'
import { applyOp, localOffsetMinutes } from './ops.js'

/** The harness home, matching the launcher's own resolution. */
export function dshHome() {
  const configured = process.env.DSH_HOME
  return configured !== undefined && configured.trim() !== ''
    ? resolve(configured.trim())
    : join(homedir(), '.dsh')
}

/** Default save location. */
export function defaultStatePath() {
  return join(dshHome(), 'dsh-pig', 'state.json')
}

const SAVE_THROTTLE_MS = 1500

/**
 * Open (or lazily create on first hatch) the save file.
 * @param filePath - where the save lives.
 * @param options.now - injectable clock for tests.
 * @param options.setTimer / options.clearTimer - injectable scheduler for tests.
 */
export function createStore(filePath = defaultStatePath(), options = {}) {
  const now = options.now ?? (() => Date.now())
  const setTimer = options.setTimer ?? setTimeout
  const clearTimer = options.clearTimer ?? clearTimeout
  // [ST0014] every change is an op; `onOp(op, result)` hears the ones that took.
  const onOp = typeof options.onOp === 'function' ? options.onOp : null
  const offsetAt = options.offsetMinutes ?? localOffsetMinutes
  const newId = options.newId ?? (() => globalThis.crypto.randomUUID())

  let dirty = false
  let timer = null
  let state = load()

  function load() {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
      const upgraded = migrate(parsed)
      if (upgraded !== null && parsed?.version !== upgraded.version) dirty = true
      return upgraded
    } catch {
      return null
    }
  }

  function writeNow() {
    if (!dirty || state === null) return
    mkdirSync(dirname(filePath), { recursive: true })
    const tmp = `${filePath}.tmp`
    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, JSON.stringify(state, null, 2))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, filePath)
    dirty = false
  }

  function scheduleSave() {
    dirty = true
    if (timer !== null) return
    timer = setTimer(() => {
      timer = null
      try { writeNow() } catch { /* a pet must never break the harness */ }
    }, SAVE_THROTTLE_MS)
    if (typeof timer?.unref === 'function') timer.unref()
  }

  /**
   * [ST0014] Do one op: build it, apply it through ops.js (which folds time in
   * on the grid first), save, and report it when it took.
   */
  function run(name, args = []) {
    const at = now()
    const op = { id: newId(), at, tz: offsetAt(at), op: name, args }
    try {
      const out = applyOp(state, op)
      state = out.state
      scheduleSave()
      if (out.ok && onOp !== null) {
        try { onOp(op, out.result) } catch { /* a listener must never break the pig */ }
      }
      return out.result
    } catch (error) {
      return { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  return {
    /** The live state (null until an egg is laid). Exposed for rendering. */
    get state() { return state },

    /** Where this pig is saved. */
    get filePath() { return filePath },

    /** Digest one observed harness event; silently ignored before hatching. */
    feed(event) {
      if (state === null) return []
      const crossed = run('feed', [event])
      return Array.isArray(crossed) ? crossed : []
    },

    /** Fold wall-clock decay in (and resolve work/illness) then hand back state. */
    freshen() {
      if (state === null) return null
      try {
        advance(state, now())
        scheduleSave()
      } catch { /* keep the stale-but-valid state */ }
      return state
    },

    /** Apply one care action with its cooldown, spending `itemKey` when given. */
    act: (action, itemKey) => run('act', [action, itemKey]),

    /** Send the pig out to work. */
    startWork: jobKey => run('work', [jobKey]),

    /** Send the pig to class. */
    startStudy: (subjectKey, stageKey) => run('study', [subjectKey, stageKey]),

    /** Send the pig travelling. */
    startTrip: tripKey => run('trip', [tripKey]),

    /** [mod] Put the pig to bed; `auto` when the computer is going to sleep. */
    sleep: auto => run('sleep', [auto === true]),

    /** [mod] Wake the pig; with `auto`, only a nap the computer started ends. */
    wake: auto => run('wake', [auto === true]),

    /** Bring the pig home early (work forfeits pay; study/trips are refunded). */
    callOffActivity: () => run('calloff'),

    /** Back-compat alias. */
    callOffWork: () => run('calloff'),

    /** [mod] Buy a scratch card and scratch it. */
    scratchLottery: () => run('lottery'),

    /** Buy one item into the backpack. */
    buy: itemKey => run('buy', [itemKey]),

    /** [dsh-piggy-claude-code mod] Elder look: 'elder' or 'original'. */
    setLook: look => run('look', [look]),

    /** [ST0004] Put a decoration on (`on`) or take it off; `wearAuto` follows the stage again. */
    wear: (key, on) => run('wear', [key, on]),
    wearAuto: () => run('wearAuto'),

    /** [mod] Name the pig: free while it has a default name, then a 更名卡 each time. */
    renamePig: name => run('renamePig', [name]),

    /**
     * [dsh-piggy-claude-code mod] Language: zh · ja · en. Works before there is a
     * pig too — the choice is kept on an unopened box.
     */
    setLang: lang => run('lang', [lang, defaultLang()]),

    /** Use one item from the backpack. */
    useItem: itemKey => run('use', [itemKey]),

    /** Open the box. Only works when there is no pig at all. */
    hatch: () => run('hatch', [defaultLang()]) === true,

    /** Developer mode: force the pig into any state. */
    dev: patch => run('dev', [patch]) === true,

    /** Start from a brand new box, living pig or not. */
    reset: () => run('reset', [defaultLang()]) === true,

    /**
     * Start over with a fresh box, keeping the old pig's memories. Only offered
     * once a pig has died — you cannot throw a living one away.
     */
    adopt: () => run('adopt') === true,

    /** Rename the pig; null when the name is unusable or the pig is absent. */
    rename(rawName) {
      if (state === null) return null
      const cleaned = run('rename', [rawName])
      return typeof cleaned === 'string' ? cleaned : null
    },

    /** Take the queued announcements (work done, got sick, got better…). */
    drainPending() {
      if (state === null) return []
      try {
        const events = drainPending(state)
        if (events.length > 0) scheduleSave()
        return events
      } catch {
        return []
      }
    },

    /** Flush any pending write and stop the timer. Called on plugin unload. */
    dispose() {
      if (timer !== null) {
        clearTimer(timer)
        timer = null
      }
      try { writeNow() } catch { /* best effort on the way out */ }
    },
  }
}
