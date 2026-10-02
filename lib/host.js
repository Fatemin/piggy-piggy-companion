/**
 * A pocket-sized DSH host for the unmodified upstream plugin.
 *
 * Upstream's `apply(ctx, config)` only touches four things on its context:
 * `on`, `inject(['webServer'])`, `inject(['commands'])` and `effect`. Faking
 * exactly those lets the real plugin run untouched — its routes, its command
 * table and its save logic — while Claude Code supplies the events.
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { apply } from '../index.js'
import { recordOp } from './cloud.js'
import { feedClockPath, feedEveryMs as defaultFeedEveryMs } from './config.js'

/** Claude Code hook kinds → the DSH events upstream listens for. */
export const EVENTS = Object.freeze({
  message: ['agent/inbox/claimed'],
  turn: ['agent/turn-stopping'],
  tool: ['tools/result', {}, { isError: false }],
  toolError: ['tools/result', {}, { isError: true }],
  agentError: ['agent/error'],
})

/**
 * @param options.onOp - [ST0014] hears every op that took, after it is queued
 *   for the cloud (the panel server uses it to send soon).
 */
export function createHost({ statePath, command = 'pig', feedEveryMs = defaultFeedEveryMs(), now = Date.now, onOp = null }) {
  const listeners = new Map()
  const routes = []
  const disposers = []
  let commandHandler = null

  const services = {
    webServer: {
      register(route) {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index !== -1) routes.splice(index, 1)
        }
      },
    },
    commands: {
      register(definition) {
        commandHandler = definition.handler
      },
    },
  }

  const ctx = {
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, [])
      listeners.get(name).push(fn)
    },
    inject(names, callback) {
      const provided = {}
      for (const name of names) provided[name] = services[name]
      const dispose = callback(provided)
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
  }

  // [ST0014] every op is queued for the cloud when this save is linked to it.
  let store = null
  const storeOptions = {
    onOp(op, result) {
      try { recordOp(statePath, op) } catch { /* the pig must not break over the cloud */ }
      if (typeof onOp === 'function') onOp(op, result)
    },
  }
  apply(ctx, { statePath, command, storeOptions, onStore: created => { store = created } })

  function findRoute(path) {
    return routes.find(route => route.kind === 'exact' ? route.path === path : path === route.path || path.startsWith(route.path + '/')) ?? null
  }

  return {
    /** [ST0014] The plugin's live store. */
    get store() { return store },

    /**
     * Feed the pig one Claude Code event (`message` / `turn` / `tool` / …).
     * At most one bite per `feedEveryMs`, shared by every process through a
     * clock file next to the save (callers hold the save lock).
     * @returns 'fed' · 'throttled' · false for an unknown event.
     */
    emit(kind) {
      const event = EVENTS[kind]
      if (event === undefined) return false
      const clock = feedClockPath(statePath)
      const at = now()
      if (feedEveryMs > 0) {
        let last = null
        try { last = Number(readFileSync(clock, 'utf8')) } catch { /* never fed */ }
        if (Number.isFinite(last) && at >= last && at - last < feedEveryMs) return 'throttled'
      }
      const [name, ...args] = event
      for (const fn of listeners.get(name) ?? []) fn(...args)
      try { writeFileSync(clock, String(at)) } catch { /* the next event just feeds again */ }
      return 'fed'
    },

    /** Upstream's route for this path, or null. */
    route: findRoute,

    /** Run the `/pig …` command table; returns `{ kind, text }`. */
    command(rawInput) {
      if (commandHandler === null) return { kind: 'error', text: 'pig command not registered' }
      return commandHandler({ rawInput })
    },

    /** Unregister routes and flush the save to disk. */
    dispose() {
      while (disposers.length > 0) {
        try { disposers.pop()() } catch { /* best effort */ }
      }
    },
  }
}
