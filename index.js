/**
 * dsh-pig — a pig that lives in your DeepSeek Harness. 🐖
 *
 * The plugin registers no model-facing tool and injects no context, so the
 * model never learns the pig exists and the pig costs zero tokens per request.
 * Every listener body is wrapped so a pig bug can never veto or delay real work.
 *
 * Two ways the human interacts, both ending in the same core calls:
 *   - the floating pig's six icons → POST /dsh-pig/act
 *   - typing `/pig feed`           → the slash command
 * The GUI is the primary path; the command is the fallback.
 *
 * @module dsh-pig
 */

import { readFileSync } from 'node:fs'

import {
  ACTIONS,
  ACTION_ORDER,
  activityLabel,
  JOBS,
  MAX,
  REVIVE_ITEM,
  SCHOOL_STAGES,
  SHOP,
  SUBJECTS,
  TRAITS,
  TRAIT_ORDER,
  TRIPS,
  actionCooldownSeconds,
  activitySecondsLeft,
  isAsleep,
  awayBlockedReason,
  careView,
  courseView,
  currentIllness,
  formatWeight,
  healthPercent,
  inventoryView,
  ageDays,
  daysToNextStage,
  kgToNextStage,
  hasDefaultName,
  perksOf,
  regionProgress,
  tripQuote,
  canChooseLook,
  outfitIsAuto,
  wardrobeView,
  wearUnlocked,
  wornFor,
  langOf,
  hasSoul,
  LIFE_STAGES,
  lifeStageFor,
  mood,
  studyView,
  diplomaView,
  traitView,
  growthPercent,
  lotteryWaitSeconds,
  blackjackHand,
} from './core.js'
import { ALL_ITEMS, BLACKJACK, GYM, GYM_CLASSES, ILLNESS_CHAINS, KIND_LABEL, KIND_ORDER, LOTTERY, PARALLEL_COURSES, RENAME_CARD, WEARABLES, WEAR_FOR_SALE, jobByKey, wearableByKey, jobMissing, traitBonus } from './data.js'
import { FARE, PLACES, REGIONS, WORLD_BONUS, souvenirByKey, placeByKey, systemTimeZone, systemUtcOffset } from './world.js'
import {
  renderAbout,
  renderAction,
  renderBuy,
  renderHatch,
  renderNoPig,
  renderStatus,
  renderStudyReport,
  renderTooSoon,
  renderTripList,
  renderTripReport,
  renderUse,
  renderWeigh,
  renderWorkRefusal,
  renderWorkReport,
  renderWardrobe,
  wearHint,
} from './render.js'
import { createStore } from './store.js'
import { dress, parseWear } from './art.js'
import { LANGS, LANG_NAMES, tr } from './i18n.js'

export const name = 'dsh-piggy'

/**
 * No required services. The pig rides on emit-mode events, and it reaches the
 * optional web seam through the safe `ctx.get()` accessor rather than a
 * declared injection — reading an undeclared service as a property throws in
 * cordis and would take the whole plugin down.
 */
export const inject = []

const STATE_ROUTE = '/dsh-pig/state'
const ACT_ROUTE = '/dsh-pig/act'
const ART_ROUTE = '/dsh-pig/art'
const BODY_LIMIT_BYTES = 2048

const contained = fn => (...args) => {
  try { fn(...args) } catch { /* the pig absorbs its own mishaps */ }
}

function sendJson(res, status, body, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...extra })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req) {
  let text = ''
  for await (const chunk of req) {
    text += chunk
    if (text.length > BODY_LIMIT_BYTES) return null
  }
  if (text.trim() === '') return {}
  try {
    const parsed = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

/**
 * Every operation the panel can invoke. One table means the HTTP route and the
 * slash command cannot drift apart.
 */
const OPERATIONS = {
  hatch: store => ({ ok: true, hatched: store.hatch() }),
  adopt: store => ({ ok: store.adopt(), adopted: true }),
  reset: store => ({ ok: store.reset(), reset: true }),
  dev: (store, body) => ({ ok: store.dev(body.patch ?? {}), dev: true }),
  // The three care actions spend an item; `item` says which one.
  feed: (store, body) => store.act('feed', str(body.item)),
  bathe: (store, body) => store.act('bathe', str(body.item)),
  play: (store, body) => store.act('play', str(body.item)),
  pet: store => store.act('pet'),
  // [dsh-piggy-claude-code mod] bed and back; `auto` is the computer's own sleep.
  sleep: (store, body) => store.sleep(body.auto === true),
  wake: (store, body) => store.wake(body.auto === true),
  work: (store, body) => store.startWork(str(body.job)),
  // [mod] `subjects` (a list, for several at once) or the old single `subject`.
  study: (store, body) => store.startStudy(Array.isArray(body.subjects) ? body.subjects.map(str) : str(body.subject), str(body.stage)),
  trip: (store, body) => store.startTrip(str(body.trip)),
  // [Q0016] `{gym}` names the class.
  gym: (store, body) => store.startGym(str(body.gym)),
  rename: (store, body) => store.renamePig(str(body.name)),
  calloff: store => store.callOffActivity(),
  // [dsh-piggy-claude-code mod] switch an elder pig's drawing. [ST0004] Kept
  // for old panels; it only puts the beard on or takes it off.
  look: (store, body) => store.setLook(str(body.look)),
  // [ST0004] the wardrobe: `{item, on}` puts a decoration on or takes it off,
  // `{auto: true}` goes back to the stage's own look.
  wear: (store, body) => (body.auto === true ? store.wearAuto() : store.wear(str(body.item), body.on === true)),
  lang: (store, body) => store.setLang(str(body.lang)),
  buy: (store, body) => store.buy(str(body.item)),
  use: (store, body) => store.useItem(str(body.item)),
  // [dsh-piggy-claude-code mod] buy a scratch card and scratch it.
  lottery: store => store.scratchLottery(),
  // [ST0015] blackjack: `{move: 'deal', bet}`, then `{move: 'hit'}` / `{move: 'stand'}`.
  blackjack: (store, body) => store.blackjack(str(body.move), Number.isInteger(body.bet) ? body.bet : 0),
}

const str = value => (typeof value === 'string' ? value : '')

export function apply(ctx, config = {}) {
  const commandName = typeof config.command === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(config.command)
    ? config.command
    : 'pig'
  // [ST0014] `storeOptions` (e.g. an op listener) and `onStore` let a host
  // that syncs the pig reach the store this plugin owns.
  const store = createStore(typeof config.statePath === 'string' && config.statePath.trim() !== ''
    ? config.statePath
    : undefined, typeof config.storeOptions === 'object' && config.storeOptions !== null ? config.storeOptions : {})
  if (typeof config.onStore === 'function') config.onStore(store)

  ctx.on('agent/inbox/claimed', contained(() => store.feed('message')))
  ctx.on('agent/turn-stopping', contained(() => store.feed('turn')))
  ctx.on('agent/error', contained(() => store.feed('agentError')))
  ctx.on('tools/result', contained((exec, result) => {
    store.feed(result?.isError === true ? 'toolError' : 'tool')
  }))

  // ---- the routes the floating pig drives ----
  //
  // `ctx.inject` waits for the service instead of sampling it. The previous
  // version read `ctx.get('webServer')` at apply time and bailed out when it was
  // undefined — which is exactly what happened during profile activation, so
  // the routes were never registered and the panel polled a 404 forever. A
  // silent optionality guard is not the same thing as a tolerant one: this one
  // still degrades on a host with no web seam, but only *after* the service has
  // actually been waited for.
  ctx.inject(['webServer'], (webCtx) => {
    const webServer = webCtx.webServer
    if (webServer === undefined) return () => {}
    const disposers = []
    try {
      disposers.push(webServer.register({
        kind: 'exact',
        path: STATE_ROUTE,
        handler: async (req, res) => {
          if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed; use GET' }, { allow: 'GET' })
          try {
            sendJson(res, 200, snapshot(store), { 'cache-control': 'no-store' })
          } catch (error) {
            sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
          }
        },
      }))
      // The hand-drawn sprites for the piglet and the elder pig. Serving them
      // from the package keeps the art as real .svg files in the repository
      // rather than a blob embedded in the client bundle.
      disposers.push(webServer.register({
        kind: 'prefix',
        path: ART_ROUTE,
        handler: (req, res) => {
          if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed; use GET' }, { allow: 'GET' })
          const [raw, query = ''] = String(req.url ?? '').split('?')
          const name = raw.startsWith(ART_ROUTE + '/') ? raw.slice(ART_ROUTE.length + 1) : ''
          // Only the files this package ships: a fixed, boring name pattern, so
          // nothing from the request can ever walk out of ./assets.
          if (!/^[a-z][a-z0-9-]{0,31}\.svg$/.test(name)) return sendJson(res, 404, { error: 'not found' })
          try {
            const asset = file => readFileSync(new URL('./assets/' + file, import.meta.url), 'utf8')
            // [ST0004] `?wear=bow,glasses` dresses the pose; only wardrobe keys
            // get through, so the decoration files are as fixed as the poses.
            const wears = parseWear(new URLSearchParams(query).get('wear'))
            const svg = wears.length === 0 ? asset(name) : dress(asset(name), wears.map(key => ({ key, svg: asset(`wear-${key}.svg`) })))
            res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-cache' })
            res.end(svg)
          } catch {
            sendJson(res, 404, { error: 'not found' })
          }
        },
      }))

      disposers.push(webServer.register({
        kind: 'exact',
        path: ACT_ROUTE,
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed; use POST' }, { allow: 'POST' })
          const body = await readJsonBody(req)
          if (body === null) return sendJson(res, 413, { error: 'body too large or not JSON' })
          const operation = typeof body.action === 'string' ? body.action : ''
          const run = Object.hasOwn(OPERATIONS, operation) ? OPERATIONS[operation] : null
          if (run === null) {
            return sendJson(res, 400, { error: `unknown action "${operation}"`, allowed: Object.keys(OPERATIONS) })
          }
          const result = run(store, body)
          const snap = snapshot(store)
          // The operation's verdict must win over the snapshot's always-true
          // `ok`: spreading the snapshot last silently swallowed every refusal.
          sendJson(res, 200, {
            ...snap,
            ok: result.ok !== false,
            reason: result.reason,
            wait: result.wait,
            price: result.price,
            // [mod] the limit behind a too-many, the shelf behind a no-item
            max: result.max,
            kind: result.kind,
            // [mod] what a scratch card paid out; which trait points a career lacks
            prize: result.prize,
            missing: result.missing,
            // [ST0015] the blackjack hand after the move, settled or not
            round: result.round,
            // [mod] the subjects a capped stage has used up
            full: result.full,
          }, { 'cache-control': 'no-store' })
        },
      }))
    } catch {
      // A route already taken: the pig stays command-only rather than breaking
      // activation, but this is a real failure and should be visible.
      console.warn(tr(langOf(store.state), '[dsh-pig] 路由注册失败，猪只能用命令访问'))
    }
    return () => { for (const dispose of disposers) { try { dispose() } catch { /* best effort */ } } }
  })

  ctx.effect(() => () => store.dispose())

  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: commandName,
      description: 'your pig 🐖: status · study · work · shop · travel · bag',
      input: { hint: tr(langOf(store.state), '[hatch|feed|bathe|play|pet|sleep|wake|study <科目>|work <job>|trip <目的地>|shop|buy|use|weigh|wear [装饰]|lang <zh|ja|en>|about]') },
      handler: invocation => {
        try {
          return dispatch(store, commandName, String(invocation.rawInput ?? ''))
        } catch (error) {
          return { kind: 'error', text: tr(langOf(store.state), '🐖 猪摔了一跤：{error}', { error: error?.message ?? error }) }
        }
      },
    })
  })
}

// ---------------------------------------------------------------------------
// Snapshot — the single shape both routes and the panel read
// ---------------------------------------------------------------------------

/** The stage the panel shows before there is a pig: the cardboard box. */
function boxStageView(lang) {
  const box = LIFE_STAGES.find(stage => stage.key === 'box') ?? LIFE_STAGES[0]
  return { key: box.key, label: tr(lang, box.label), emoji: box.emoji, size: box.size, line: tr(lang, box.line), art: box.art ?? null }
}

/** "今天刚出生" / "3 天大" / "刚拆开纸盒" — the pig's age in words. */
function formatAge(days, state, nowMs) {
  const lang = langOf(state)
  if (state.hatched !== true) return tr(lang, '还没拆开')
  // A tombstone is not "newborn today". Once the pig is gone its clock stops,
  // and what matters is how long it had — not how long ago it hatched.
  if (state.dead === true) {
    const lived = Math.max(0, (state.diedAt ?? nowMs) - state.bornAt)
    return tr(lang, '活了 {span}', { span: formatSpan(lived, lang) })
  }
  if (days < 1) return tr(lang, '今天刚出生')
  const whole = Math.floor(days)
  return whole === 1 ? tr(lang, '1 天大') : tr(lang, '{days} 天大', { days: whole })
}

/** "18 小时" / "3 天" / "2 小时" — a duration in the largest sensible unit. */
function formatSpan(ms, lang) {
  const hours = ms / 3_600_000
  if (hours < 1) return tr(lang, '{n} 分钟', { n: Math.max(1, Math.round(ms / 60000)) })
  if (hours < 48) return tr(lang, '{n} 小时', { n: Math.round(hours) })
  return tr(lang, '{n} 天', { n: Math.round(hours / 24) })
}

/** 0-100 through the current activity, for the scene's progress line. */
function activityProgress(activity, nowMs) {
  const span = activity.endsAt - activity.startedAt
  if (!Number.isFinite(span) || span <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(((nowMs - activity.startedAt) / span) * 100)))
}

/** [dsh-piggy-claude-code mod] Languages the panel offers, each named in itself. */
const langChoices = () => LANGS.map(key => ({ key, label: LANG_NAMES[key] }))

export function snapshot(store, options = {}) {
  const drain = options.drain !== false
  const state = store.freshen()
  const nowMs = Date.now()

  if (state === null) {
    const lang = langOf(null)
    return {
      ok: true, hatched: false, dead: false, pig: null,
      lang, langs: langChoices(),
      actions: actionsFor(null, nowMs),
      jobs: jobsFor(null),
      subjects: subjectsFor(null),
      stages: SCHOOL_STAGES.map(stage => ({
        ...stage,
        parallel: PARALLEL_COURSES[stage.key] ?? 1,
        label: tr(lang, stage.label),
        requires: stage.requires === null ? null : { ...stage.requires, label: tr(lang, stage.requires.label) },
      })),
      trips: tripsFor(null),
      world: worldFor(null),
      shop: shopFor(null),
      inventory: inventoryView({ inventory: {} }),
      bag: [],
      lottery: lotteryFor(null, nowMs),
      blackjack: blackjackFor(null),
      gym: gymFor(null),
      activity: null, canGoOut: false, awayBlocked: 'absent',
      // The box has a size of its own; the client must not hard-code it.
      boxStage: boxStageView(lang),
      pending: [],
      reviveItem: REVIVE_ITEM.key, maxHealth: MAX.health,
    }
  }

  const lang = langOf(state)
  const life = lifeStageFor(state, nowMs)
  const current = mood(state, nowMs)
  const illness = currentIllness(state)
  const activity = state.activity
  const pending = Array.isArray(state.pending) ? state.pending.slice() : []
  if (drain && pending.length > 0) store.drainPending()

  return {
    ok: true,
    // [dsh-piggy-claude-code mod] the pig's language, and what it can switch to.
    lang: langOf(state), langs: langChoices(),
    // The REAL flag, not "a save exists". A box produced by reset/adopt has a
    // save but is not hatched, and conflating the two made the box un-pokeable.
    hatched: state.hatched === true,
    dead: state.dead === true,
    boxStage: boxStageView(lang),
    pig: {
      name: state.name,
      // Age is the progression now, not a level.
      stage: { key: life.key, label: tr(lang, life.label), emoji: life.emoji, size: life.size, line: tr(lang, life.line), art: life.art ?? null, faded: life.faded === true },
      ageDays: Number(ageDays(state, nowMs).toFixed(2)),
      ageLabel: formatAge(ageDays(state, nowMs), state, nowMs),
      daysToNextStage: daysToNextStage(state, nowMs) === null ? null : Number(daysToNextStage(state, nowMs).toFixed(2)),
      // [dsh-piggy-claude-code mod] growth follows weight; elder look is switchable.
      kgToNextStage: kgToNextStage(state, nowMs) === null ? null : Number(kgToNextStage(state, nowMs).toFixed(1)),
      canChooseLook: canChooseLook(state),
      // [ST0004] the old elder switch, now read off the wardrobe: 'elder' while the beard is on.
      look: wornFor(state).includes('whiskers') ? 'elder' : 'original',
      // [ST0004] what it wears (drawing order; the panel puts it on the sprite
      // URL) and whether that is still the stage's own look.
      outfit: { auto: outfitIsAuto(state), worn: wornFor(state) },
      wardrobe: wardrobeView(state).map(({ unlock, ...item }) => ({ ...item, label: tr(lang, item.label), hint: wearHint(lang, unlock) })),
      // [mod] naming, travel perks, doctorate.
      renameFree: hasDefaultName(state),
      renameCards: state.inventory?.[RENAME_CARD.key] ?? 0,
      renameCardPrice: RENAME_CARD.price,
      perks: perksOf(state),
      doctor: state.doctorDone === true,
      // [mod] the diplomas in the bag, held or not
      diplomas: diplomaView(state).map(diploma => ({ ...diploma, label: tr(lang, diploma.label) })),
      worldTraveler: state.worldDone === true,
      soul: hasSoul(state, nowMs),
      mood: current.key,
      moodLevel: current.level ?? 0,
      moodEmoji: current.emoji,
      moodLabel: current.label,
      // [mod] in bed, and whether the computer's sleep put it there.
      asleep: isAsleep(state),
      sleepAuto: isAsleep(state) && state.sleep.auto === true,
      satiety: Math.round(state.satiety),
      happiness: Math.round(state.happiness),
      cleanliness: Math.round(state.cleanliness),
      health: state.health,
      healthPercent: healthPercent(state),
      weight: formatWeight(state.weightG),
      // [mod] the sprite grows with this, from 0 at hatching to 100 at full size
      growthPercent: growthPercent(state.weightG),
      xp: state.xp,
      coins: state.coins,
      traits: traitView(state),
      courses: courseView(state),
      souvenirs: (state.souvenirs ?? []).slice(-30).map(souvenir => tr(lang, souvenir)),
      stageLine: tr(lang, life.line),
      illness: illness === null ? null : { name: tr(lang, illness.name), cure: tr(lang, illness.cure), stage: illness.stage, chain: tr(lang, illness.chain) },
      memories: state.memories.slice(-3),
    },
    actions: actionsFor(state, nowMs),
    jobs: jobsFor(state),
    subjects: subjectsFor(state),
    stages: studyView(state).map(stage => ({
      ...stage,
      parallel: PARALLEL_COURSES[stage.key] ?? 1,
      label: tr(lang, stage.label),
      progress: stage.progress === null ? null : { ...stage.progress, label: tr(lang, stage.progress.label) },
    })),
    trips: tripsFor(state),
    world: worldFor(state),
    shop: shopFor(state),
    inventory: inventoryView(state),
    bag: bagFor(state),
    lottery: lotteryFor(state, nowMs),
    blackjack: blackjackFor(state),
    gym: gymFor(state),
    care: Object.fromEntries(Object.entries(careView(state))
      .map(([action, items]) => [action, items.map(item => ({ ...item, label: tr(lang, item.label) }))])),
    activity: activity === null ? null : {
      kind: activity.kind,
      key: activity.key,
      label: activityLabel(activity, lang),
      emoji: activity.emoji,
      cost: activity.cost ?? 0,
      secondsLeft: activitySecondsLeft(state, nowMs),
      // How far along, so the panel can draw the pig actually getting on with it.
      progress: activityProgress(activity, nowMs),
      // Which school stage / which region, so the pig is drawn at that school or in that place.
      ...(activity.kind === 'study' && typeof activity.stage === 'string' ? { stage: activity.stage } : {}),
      ...(activity.kind === 'trip' ? { region: placeByKey(activity.key)?.region ?? null } : {}),
    },
    canGoOut: awayBlockedReason(state) === null,
    awayBlocked: awayBlockedReason(state),
    pending,
    reviveItem: REVIVE_ITEM.key,
    maxHealth: MAX.health,
  }
}

function actionsFor(state, nowMs) {
  const lang = langOf(state)
  const out = {}
  for (const key of ACTION_ORDER) {
    const spec = ACTIONS[key]
    const wait = state === null ? 0 : actionCooldownSeconds(state, key, nowMs)
    const away = state !== null && !state.dead && state.activity !== null && key !== 'pet'
    out[key] = {
      label: tr(lang, spec.label),
      emoji: spec.emoji,
      ready: wait === 0 && !away && !(state?.dead === true),
      waitSeconds: wait,
      blocked: away ? 'away' : null,
    }
  }
  return out
}

function jobsFor(state) {
  const lang = langOf(state)
  const open = state !== null && awayBlockedReason(state) === null
  return JOBS.map(job => {
    // Jobs lean on a trait and lessons raise it, so the panel has to show what
    // the pig's schooling is actually buying it.
    const points = state === null ? 0 : (state.traits?.[job.trait] ?? 0)
    const bonus = traitBonus(job.trait, points)
    const pay = coins => Math.round(coins * bonus.pay)
    // [mod] careers name what they still need; gigs show their pay range.
    const missing = state === null ? jobMissing(job, {}) : jobMissing(job, state.traits)
    return {
      key: job.key, label: tr(lang, job.label), emoji: job.emoji,
      tier: job.tier,
      art: job.art,
      fixed: job.fixed,
      random: job.random === null ? null : job.random.map(pay),
      requires: job.requires === null ? [] : Object.entries(job.requires).map(([trait, need]) => ({
        trait, need, label: tr(lang, TRAITS[trait].label), emoji: TRAITS[trait].emoji,
        have: state === null ? 0 : (state.traits?.[trait] ?? 0),
      })),
      locked: missing.length > 0,
      trait: job.trait,
      traitLabel: tr(lang, TRAITS[job.trait].label),
      traitEmoji: TRAITS[job.trait].emoji,
      traitPoints: points,
      minutes: job.fixed ? job.minutes : Math.max(1, Math.round(job.minutes * bonus.minutes)),
      baseMinutes: job.minutes,
      coins: pay(job.coins),
      baseCoins: job.coins,
      payPercent: Math.round((bonus.pay - 1) * 100),
      speedPercent: job.fixed ? 0 : Math.round((1 - bonus.minutes) * 100),
      satiety: job.satiety,
      available: open,
    }
  })
}

function subjectsFor(state) {
  const lang = langOf(state)
  const open = state !== null && awayBlockedReason(state) === null
  const levels = state === null ? {} : courseView(state)
  return SUBJECTS.map(subject => ({
    key: subject.key, label: tr(lang, subject.label), emoji: subject.emoji,
    trait: subject.trait, traitLabel: tr(lang, TRAITS[subject.trait].label),
    level: levels[subject.key] ?? 0,
    available: open,
  }))
}

/** [mod] Every destination as a flat list (older panels read `trips`). */
function tripsFor(state) {
  return worldFor(state).regions.flatMap(region => region.places.map(place => ({ ...place, region: region.key })))
}

/** "Asia/Tokyo" → "Tokyo". */
const cityOf = zone => (typeof zone === 'string' && zone.includes('/') ? zone.split('/').pop().replace(/_/g, ' ') : zone ?? '')

/**
 * [mod] The travel world as the panel draws it: home, then each region with its
 * destinations (priced from home), its souvenir collection and its reward.
 */
function worldFor(state) {
  const lang = langOf(state)
  const open = state !== null && awayBlockedReason(state) === null
  const homeUtc = systemUtcOffset()
  const zone = systemTimeZone()
  const perks = state === null ? [] : perksOf(state)
  const traitText = traits => Object.entries(traits ?? {})
    .map(([trait, points]) => `${TRAITS[trait].emoji}${tr(lang, TRAITS[trait].label)} +${points}`)
  const regions = REGIONS.map(region => {
    const progress = state === null ? { have: 0, total: region.places.length * 2, done: false } : regionProgress(state, region.key)
    const reward = [...traitText(region.bonus.traits)]
    if (region.bonus.weightG) reward.push(tr(lang, '⚖️体重 +{kg} kg', { kg: region.bonus.weightG / 1000 }))
    return {
      key: region.key, label: tr(lang, region.label), emoji: region.emoji,
      have: progress.have, total: progress.total,
      done: (state?.regionsDone ?? []).includes(region.key),
      reward,
      perk: { key: region.perk.key, label: tr(lang, region.perk.label), emoji: region.perk.emoji, text: tr(lang, region.perk.text), active: perks.includes(region.perk.key) },
      places: region.places.map(place => {
        const quote = tripQuote(state, place.key, homeUtc)
        return {
          key: place.key, label: tr(lang, place.label), emoji: place.emoji, utc: place.utc,
          zones: quote.zones, cost: quote.cost, minutes: quote.minutes, happiness: quote.happiness,
          available: open,
          affordable: state === null ? false : state.coins >= quote.cost,
          souvenirs: place.souvenirs.map(souvenir => ({
            key: souvenir.key, label: tr(lang, souvenir.label), emoji: souvenir.emoji,
            count: state?.collected?.[souvenir.key] ?? 0,
          })),
        }
      }),
    }
  })
  const last = state?.lastTrip ?? null
  const lastPlace = last === null ? null : placeByKey(last.place)
  const lastSouvenir = last === null ? null : souvenirByKey(last.souvenir)
  return {
    home: { utc: homeUtc, zone, city: cityOf(zone) },
    // [mod] the fare rule, so the panel never hard-codes it
    fare: { costPerZone: FARE.costPerZone, hoursPerZone: FARE.minutesPerZone / 60 },
    regions,
    worldDone: state?.worldDone === true,
    worldTitle: { label: tr(lang, WORLD_BONUS.label), emoji: WORLD_BONUS.emoji, reward: traitText(WORLD_BONUS.traits) },
    lastTrip: lastPlace === null ? null : {
      place: tr(lang, lastPlace.label), emoji: lastPlace.emoji,
      souvenir: lastSouvenir === null ? null : { label: tr(lang, lastSouvenir.label), emoji: lastSouvenir.emoji, fresh: last.fresh === true },
      loot: last.loot.map(key => ALL_ITEMS.find(item => item.key === key)).filter(Boolean).map(item => ({ key: item.key, label: tr(lang, item.label), emoji: item.emoji, exclusive: item.exclusive === true })),
      regionDone: last.regionDone === null ? null : tr(lang, REGIONS.find(r => r.key === last.regionDone)?.label ?? ''),
      at: last.at,
    },
    // Upstream's four retired trips left these behind; they are kept as keepsakes.
    oldSouvenirs: (state?.souvenirs ?? []).slice(-30).map(souvenir => tr(lang, souvenir)),
  }
}

/** [mod] What is in the bag, with what each thing is, travel-only ones tagged. */
function bagFor(state) {
  const lang = langOf(state)
  return ALL_ITEMS
    .filter(item => (state?.inventory?.[item.key] ?? 0) > 0)
    .map(item => ({
      key: item.key, label: tr(lang, item.label), emoji: item.emoji, kind: item.kind,
      count: state.inventory[item.key], exclusive: item.exclusive === true,
      tier: item.tier ?? null,
      ...itemEffects(item, lang),
    }))
}

function shopFor(state) {
  const lang = langOf(state)
  const shelf = SHOP.map(item => ({
    key: item.key, label: tr(lang, item.label), emoji: item.emoji,
    price: item.price, kind: item.kind, tier: item.tier ?? null,
    affordable: state === null ? false : state.coins >= item.price,
    needed: state?.illness != null && item.kind === 'medicine' && item.tier === state.illness.stage,
    owned: false,
    ...itemEffects(item, lang),
  }))
  // [ST0012] the 装扮 shelf: decorations, bought once and then owned.
  const wear = WEAR_FOR_SALE.map(item => ({
    key: item.key, label: tr(lang, item.label), emoji: item.emoji,
    price: item.price, kind: item.kind, tier: null,
    affordable: state === null ? false : state.coins >= item.price,
    needed: false,
    owned: wearUnlocked(state, wearableByKey(item.key)),
    ...itemEffects(item, lang),
  }))
  return [...shelf, ...wear]
}

/**
 * [dsh-piggy-claude-code mod] What an item does, so the shop and the bag can
 * say it: the bars it moves, and for a medicine the illnesses it cures.
 */
function itemEffects(item, lang) {
  return {
    satiety: item.satiety ?? 0,
    happiness: item.happiness ?? 0,
    cleanliness: item.cleanliness ?? 0,
    cures: item.kind === 'medicine'
      ? ILLNESS_CHAINS.map(chain => chain.stages[(item.tier ?? 1) - 1]?.name).filter(Boolean).map(name => tr(lang, name))
      : [],
  }
}

/** [mod] The scratch-card counter: price, cooldown and the prize table. */
function lotteryFor(state, nowMs) {
  const lang = langOf(state)
  return {
    price: LOTTERY.price,
    cooldownMinutes: LOTTERY.cooldownMinutes,
    waitSeconds: state === null ? 0 : lotteryWaitSeconds(state, nowMs),
    affordable: state !== null && state.coins >= LOTTERY.price,
    prizes: LOTTERY.prizes.map(prize => ({ tier: prize.tier, label: tr(lang, prize.label), emoji: prize.emoji, coins: prize.coins })),
  }
}

/** [ST0015] The blackjack table: bets, the stand line, the payouts and the open hand. */
function blackjackFor(state) {
  const hand = state?.blackjack ?? null
  return {
    bets: [...BLACKJACK.bets],
    standAt: BLACKJACK.standAt,
    payouts: BLACKJACK.payouts.map(row => ({ total: row.total, multiplier: row.multiplier })),
    hand: hand === null ? null : blackjackHand(hand),
  }
}

/**
 * [Q0016] The gym: its classes, the weight floor, and how far the pig is from
 * the muscle look (kilograms worked off in all).
 */
function gymFor(state) {
  const lang = langOf(state)
  const lostG = state?.stats?.gymLostG ?? 0
  return {
    floorKg: GYM.floorKg,
    muscleKg: GYM.muscleKg,
    lostKg: Math.floor(lostG / 100) / 10,
    muscle: lostG >= GYM.muscleKg * 1000,
    atFloor: state !== null && state.weightG <= GYM.floorKg * 1000,
    classes: GYM_CLASSES.map(entry => ({
      key: entry.key, label: tr(lang, entry.label), emoji: entry.emoji,
      minutes: entry.minutes, price: entry.price, lossKg: entry.lossG / 1000,
      affordable: state !== null && state.coins >= entry.price,
    })),
  }
}

// ---------------------------------------------------------------------------
// Slash command (the fallback path)
// ---------------------------------------------------------------------------

/**
 * [dsh-piggy-claude-code mod] What a player may type for a table entry: its key
 * or its label in any language, ignoring case and spaces ("martial arts").
 */
const squash = text => String(text ?? '').toLowerCase().replace(/\s+/g, '')
const namesOf = entry => [entry.key, ...LANGS.map(lang => tr(lang, entry.label))].map(squash)
function findByName(entries, input) {
  const wanted = squash(input)
  return wanted === '' ? undefined : entries.find(entry => namesOf(entry).includes(wanted))
}

/**
 * [mod] `<subject>[,subject…] [stage]` — several subjects at once, separated by
 * commas, spaces, 、 or +, then the stage (or the stage first). Split on the
 * names rather than on spaces, which English labels contain ("martial arts",
 * "graduate school"). With no stage, 小学.
 * @returns {{subjects: object[], stage: object|undefined}}
 */
function parseLesson(input) {
  const wanted = squash(String(input ?? '').replace(/[,，、+＋/／;；&・]/g, ' '))
  const none = { subjects: [], stage: undefined }
  if (wanted === '') return none
  // Subjects only, the whole string, longest names first with backtracking
  // ("mathematics" must not stop at "math").
  const subjectsOf = text => {
    if (text === '') return []
    const options = SUBJECTS.flatMap(subject => namesOf(subject).filter(name => name !== '' && text.startsWith(name)).map(name => ({ subject, name })))
      .sort((a, b) => b.name.length - a.name.length)
    for (const { subject, name } of options) {
      const tail = subjectsOf(text.slice(name.length))
      if (tail !== null) return [subject, ...tail]
    }
    return null
  }
  const stageNames = SCHOOL_STAGES.flatMap(stage => namesOf(stage).filter(name => name !== '').map(name => ({ stage, name })))
    .sort((a, b) => b.name.length - a.name.length)
  for (const { stage, name } of stageNames) {
    if (wanted.endsWith(name)) {
      const subjects = subjectsOf(wanted.slice(0, -name.length))
      if (subjects !== null && subjects.length > 0) return { subjects, stage }
    }
    if (wanted.startsWith(name)) {
      const subjects = subjectsOf(wanted.slice(name.length))
      if (subjects !== null && subjects.length > 0) return { subjects, stage }
    }
  }
  const subjects = subjectsOf(wanted)
  if (subjects !== null && subjects.length > 0) return { subjects, stage: SCHOOL_STAGES.find(s => s.key === 'primary') }
  return none
}

/** [mod] The host's home for pricing trips: its UTC offset and zone name. */
const homeOf = () => ({ utc: systemUtcOffset(), zone: systemTimeZone() })

export function performAction(store, action) {
  const state = store.freshen()
  if (state === null) return { kind: 'error', text: renderNoPig('pig') }
  const lang = langOf(state)
  const result = store.act(action)
  if (!result.ok) {
    if (result.reason === 'cooldown') return { kind: 'success', text: renderTooSoon(state, Date.now(), action) }
    if (result.reason === 'away') return { kind: 'success', text: renderWorkRefusal(state, tr(lang, '{name} 正在外面，回来再说。', { name: state.name })) }
    if (result.reason === 'dead') return { kind: 'error', text: tr(lang, '{name} 已经走了…用 {item} 可以救回来。', { name: state.name, item: tr(lang, REVIVE_ITEM.label) }) }
    if (result.reason === 'absent') return { kind: 'error', text: renderNoPig('pig') }
    return { kind: 'error', text: tr(lang, '🐖 {action} 没做成。', { action: ACTIONS[action] ? tr(lang, ACTIONS[action].label) : action }) }
  }
  return { kind: 'success', text: renderAction(store.freshen(), Date.now(), action, result.crossed) }
}

export function dispatch(store, commandName, rawInput) {
  const trimmed = rawInput.trim()
  const [sub, ...rest] = trimmed === '' ? [''] : trimmed.split(/\s+/)
  const argument = rest.join(' ')
  const state = store.freshen()
  const nowMs = Date.now()
  const verb = sub.toLowerCase()
  const lang = langOf(state)
  const cmd = commandName

  switch (verb) {
    case '':
    case 'status': {
      if (state === null) return { kind: 'success', text: renderNoPig(commandName) }
      return { kind: 'success', text: renderStatus(state, nowMs) }
    }
    case 'hatch': {
      if (store.hatch()) return { kind: 'success', text: renderHatch(store.state, nowMs) }
      const existing = store.freshen()
      return { kind: 'success', text: `${tr(langOf(existing), '这里已经住着 {name} 了 🐖', { name: existing.name })}\n\n${renderStatus(existing, nowMs)}` }
    }
    case 'feed':
    case 'bathe':
    case 'play':
    case 'pet':
    case 'mo':
      return performAction(store, verb === 'mo' ? 'pet' : verb)

    // [dsh-piggy-claude-code mod] bed and back.
    case 'sleep':
    case 'wake': {
      if (state === null || state.hatched !== true) return { kind: 'error', text: renderNoPig(commandName) }
      const result = verb === 'sleep' ? store.sleep() : store.wake()
      if (result.ok) {
        return { kind: 'success', text: tr(lang, verb === 'sleep' ? '😴 {name} 去睡觉了。睡着时只会变饿，心情和清洁会慢慢恢复。' : '☀️ {name} 醒了。', { name: state.name }) }
      }
      return { kind: 'success', text: renderWorkRefusal(state, sleepRefusal(result, state)) }
    }

    case 'work': {
      if (state === null) return { kind: 'error', text: renderNoPig(commandName) }
      const key = argument.trim() === '' ? 'odd' : argument.trim()
      const job = findByName(JOBS, key)
      if (job === undefined) return { kind: 'error', text: tr(lang, '没有「{key}」这份工作。/{cmd} work 看有哪些。', { key, cmd }) }
      const result = store.startWork(job.key)
      if (!result.ok) return { kind: 'success', text: renderWorkRefusal(state, refusalText(result, state)) }
      return { kind: 'success', text: renderWorkReport(store.freshen(), Date.now(), job) }
    }

    case 'study': {
      if (state === null) return { kind: 'error', text: renderNoPig(commandName) }
      const { subjects, stage } = parseLesson(argument)
      if (subjects.length === 0 || stage === undefined) {
        return {
          kind: 'error',
          text: tr(lang, '用法：/{cmd} study <科目>[,科目…] <{stages}>\n科目：{subjects}\n一次最多：{limits}\n每门课上限：{caps}（其余不限）', {
            cmd,
            stages: SCHOOL_STAGES.map(s => tr(lang, s.label)).join('|'),
            subjects: SUBJECTS.map(s => tr(lang, s.label)).join(' · '),
            limits: SCHOOL_STAGES.map(s => `${tr(lang, s.label)} ${PARALLEL_COURSES[s.key] ?? 1}`).join(' · '),
            caps: SCHOOL_STAGES.filter(s => s.cap !== null).map(s => `${tr(lang, s.label)} ${s.cap}`).join(' · '),
          }),
        }
      }
      const unique = [...new Set(subjects)]
      const result = store.startStudy(unique.length === 1 ? unique[0].key : unique.map(subject => subject.key), stage.key)
      if (!result.ok) return { kind: 'success', text: renderWorkRefusal(state, refusalText(result, state, { stage })) }
      return { kind: 'success', text: renderStudyReport(store.freshen(), Date.now(), unique, stage) }
    }

    case 'trip':
    case 'travel': {
      if (state === null) return { kind: 'error', text: renderNoPig(commandName) }
      const key = argument.trim()
      // [mod] no destination: the world map, priced from this computer's time zone.
      if (key === '') return { kind: 'success', text: renderTripList(state, homeOf(), cmd) }
      const place = findByName(PLACES, key)
      if (place === undefined) return { kind: 'error', text: tr(lang, '没有「{key}」这个目的地。/{cmd} trip 看有哪些。', { key, cmd }) }
      const result = store.startTrip(place.key)
      if (!result.ok) return { kind: 'success', text: renderWorkRefusal(state, refusalText(result, state)) }
      return { kind: 'success', text: renderTripReport(store.freshen(), Date.now(), place) }
    }

    case 'calloff': {
      const result = store.callOffActivity()
      if (!result.ok) return { kind: 'success', text: tr(lang, '{name} 没在外面。', { name: state?.name ?? tr(lang, '猪') }) }
      return {
        kind: 'success',
        text: result.refunded > 0
          ? tr(lang, '{name} 提前回来了，退回 {coins} 猪币。', { name: state.name, coins: result.refunded })
          : tr(lang, '{name} 提前回来了，这趟白跑。', { name: state.name }),
      }
    }

    case 'shop': {
      // [mod] one block per shelf, the rename card on its own shelf.
      const shelves = KIND_ORDER.map(kind => {
        const items = kind === 'wear' ? WEAR_FOR_SALE : SHOP.filter(item => item.kind === kind)
        if (items.length === 0) return ''
        const owned = item => kind === 'wear' && wearUnlocked(state, wearableByKey(item.key))
        const lines = items.map(item => `  ${item.emoji} ${tr(lang, item.label)}  ${owned(item) ? tr(lang, '已拥有') : tr(lang, '{price} 猪币', { price: item.price })}`)
        if (kind === 'card') lines.push(tr(lang, '    改名用：/{cmd} name <名字>（第一次起名免费）', { cmd }))
        if (kind === 'wear') lines.push(tr(lang, '    买了就穿上，衣柜里随时换：/{cmd} wear', { cmd }))
        return [tr(lang, '【{shelf}】', { shelf: tr(lang, KIND_LABEL[kind]) }), ...lines].join('\n')
      }).filter(block => block !== '')
      return { kind: 'success', text: tr(lang, '🛒 商店（你有 {coins} 猪币）\n{lines}\n\n买：/{cmd} buy <物品>', { coins: state?.coins ?? 0, lines: shelves.join('\n'), cmd }) }
    }
    case 'buy': {
      if (state === null) return { kind: 'error', text: renderNoPig(commandName) }
      // [mod] travel-only specialties are found too, so the refusal can say why.
      const item = findByName([...ALL_ITEMS, ...WEAR_FOR_SALE], argument)
      if (item === undefined) return { kind: 'error', text: tr(lang, '没有「{name}」这样东西。/{cmd} shop 看货架。', { name: argument, cmd }) }
      return { kind: 'success', text: renderBuy(store.freshen(), store.buy(item.key), item) }
    }
    case 'use': {
      if (state === null) return { kind: 'error', text: renderNoPig(commandName) }
      const item = findByName(ALL_ITEMS, argument)
      if (item === undefined) return { kind: 'error', text: tr(lang, '没有「{name}」这样东西。', { name: argument }) }
      return { kind: 'success', text: renderUse(store.freshen(), store.useItem(item.key), item) }
    }
    case 'weigh': {
      if (state === null) return { kind: 'error', text: renderNoPig(commandName) }
      return { kind: 'success', text: renderWeigh(state, nowMs) }
    }
    case 'lang': {
      const result = store.setLang(argument.trim())
      if (!result.ok) return { kind: 'error', text: `/${commandName} lang zh | ja | en` }
      return { kind: 'success', text: `🐖 ${LANG_NAMES[result.lang]}` }
    }
    case 'look': {
      if (state === null) return { kind: 'error', text: renderNoPig(commandName) }
      const wanted = /^(原版|原来|original|piglet|オリジナル)$/i.test(argument.trim()) ? 'original'
        : /^(老年|老|elder|おじいブタ|おじい)$/i.test(argument.trim()) ? 'elder' : ''
      if (wanted === '') return { kind: 'error', text: tr(lang, '用法：/{cmd} look 老年 | 原版', { cmd }) }
      const result = store.setLook(wanted)
      if (!result.ok) {
        const why = result.reason === 'too-light' ? tr(lang, '要长到 80 kg、变成老年猪之后才能换样子') : tr(lang, '现在换不了样子')
        return { kind: 'success', text: `🐖 ${why}` }
      }
      return { kind: 'success', text: wanted === 'original' ? tr(lang, '🐖 换回原版小猪的样子了') : tr(lang, '🐖 换成老年猪的样子了') }
    }
    case 'wear': {
      if (state === null) return { kind: 'error', text: renderNoPig(commandName) }
      return wearReply(store, state, argument, cmd)
    }
    case 'name': {
      if (state === null) return { kind: 'error', text: renderNoPig(commandName) }
      return renameReply(store, state, argument, cmd)
    }
    case 'about':
    case 'help':
      return { kind: 'success', text: renderAbout(commandName, state) }
    default:
      return {
        kind: 'error',
        text: tr(lang, '不认识「{sub}」。可用：/{cmd} · {list}', {
          sub, cmd, list: 'hatch · feed · bathe · play · pet · sleep · wake · study · work · trip · shop · buy · use · weigh · wear · name · about',
        }),
      }
  }
}

/**
 * [ST0004] `/pig wear`: no argument lists the wardrobe; a decoration's name
 * puts it on, or takes it off when it is already on; 自动 follows the stage
 * again and 不穿 takes everything off.
 */
function wearReply(store, state, argument, cmd) {
  const lang = langOf(state)
  const wanted = argument.trim()
  if (wanted === '') return { kind: 'success', text: renderWardrobe(cmd, state) }
  const reply = (result, text) => {
    if (result.ok) return { kind: 'success', text }
    const why = result.reason === 'dead' ? tr(lang, '{name} 已经走了…', { name: state.name })
      : result.reason === 'unhatched' ? tr(lang, '还没拆开') : tr(lang, '现在换不了样子')
    return { kind: 'error', text: `🐖 ${why}` }
  }
  if (/^(自动|auto|オート|自動)$/i.test(wanted)) return reply(store.wearAuto(), tr(lang, '👗 跟着阶段穿了'))
  if (/^(不穿|全脱|none|off|なし)$/i.test(wanted)) {
    let result = { ok: true }
    for (const key of wornFor(state)) result = store.wear(key, false)
    return reply(result, tr(lang, '👗 全脱了，光溜溜的'))
  }
  const item = findByName(WEARABLES, wanted)
  if (item === undefined) return { kind: 'error', text: tr(lang, '衣柜里没有「{name}」。/{cmd} wear 看看有什么。', { name: wanted, cmd }) }
  const label = `${item.emoji}${tr(lang, item.label)}`
  const unlocked = wardrobeView(state).find(entry => entry.key === item.key)?.unlocked === true
  if (!unlocked) return { kind: 'success', text: tr(lang, '🔒 {item}还没解锁：{hint}', { item: label, hint: wearHint(lang, item.unlock) }) }
  const on = !wornFor(state).includes(item.key)
  return reply(store.wear(item.key, on), on ? tr(lang, '👗 戴上了{item}', { item: label }) : tr(lang, '👗 摘下了{item}', { item: label }))
}

/**
 * [mod] `/pig name`: free while the pig still wears a default name, then one
 * 更名卡 per rename. A store without `renamePig` (an old stub) renames freely.
 */
function renameReply(store, state, argument, cmd) {
  const lang = langOf(state)
  const card = tr(lang, RENAME_CARD.label)
  if (typeof store.renamePig !== 'function') {
    const cleaned = store.rename(argument)
    if (cleaned === null) return { kind: 'error', text: tr(lang, '用法：/{cmd} name <名字>（16 字以内）', { cmd }) }
    return { kind: 'success', text: tr(lang, '从今天起，它叫「{name}」🐖', { name: cleaned }) }
  }
  const result = store.renamePig(argument)
  if (result.ok) {
    const lines = [tr(lang, '从今天起，它叫「{name}」🐖', { name: result.name })]
    if (result.usedCard) {
      lines.push(tr(lang, '🪪 用掉了一张{card}，还剩 {left} 张。', { card, left: store.state?.inventory?.[RENAME_CARD.key] ?? 0 }))
    } else {
      lines.push(tr(lang, '第一次起名免费；以后再改名要用一张{card}（商店 {price} 猪币）。', { card, price: RENAME_CARD.price }))
    }
    return { kind: 'success', text: lines.join('\n') }
  }
  switch (result.reason) {
    case 'need-card':
      return {
        kind: 'success',
        text: tr(lang, '🪪 {name} 已经有名字了，再改名要用一张{card}（{price} 猪币，商店「{shelf}」货架上有）。\n买：/{cmd} buy {key}，然后再 /{cmd} name <新名字>', {
          name: state.name, card, price: result.price ?? RENAME_CARD.price, shelf: tr(lang, KIND_LABEL.card), key: RENAME_CARD.key, cmd,
        }),
      }
    case 'same-name': return { kind: 'success', text: tr(lang, '它本来就叫「{name}」呀，没改。', { name: state.name }) }
    case 'dead': return { kind: 'error', text: tr(lang, '{name} 已经走了…', { name: state.name }) }
    case 'absent': return { kind: 'error', text: renderNoPig(cmd) }
    default: return { kind: 'error', text: tr(lang, '用法：/{cmd} name <名字>（16 字以内）', { cmd }) }
  }
}

/** [mod] Why the pig cannot go to bed, or get up. */
function sleepRefusal(result, state) {
  const lang = langOf(state)
  const name = state.name
  switch (result.reason) {
    case 'asleep': return tr(lang, '{name} 已经在睡了。', { name })
    case 'awake': return tr(lang, '{name} 本来就醒着。', { name })
    default: return refusalText(result, state)
  }
}

/** Why the pig cannot go out; `context.stage` names the school stage for study refusals. */
function refusalText(result, state, context = {}) {
  const lang = langOf(state)
  const name = state.name
  switch (result.reason) {
    case 'dead': return tr(lang, '{name} 已经走了…', { name })
    case 'away': return tr(lang, '{name} 已经在外面了。', { name })
    case 'sick': return tr(lang, '{name} 病着，不能出门 —— 先治好它。', { name })
    case 'weak': return tr(lang, '{name} 身体太虚了，先把病治好、养养身体。', { name })
    case 'hungry': return tr(lang, '{name} 太饿了，先喂点东西。', { name })
    case 'poor': return tr(lang, '钱不够，需要 {price} 猪币，你只有 {coins}。', { price: result.price, coins: state.coins })
    case 'too-many': return tr(lang, '{stage}一次最多上 {max} 门课。', { stage: tr(lang, context.stage?.label ?? ''), max: result.max })
    case 'capped': return tr(lang, '{stage}每门课最多上 {max} 次，{subjects}已经上满了。', {
      stage: tr(lang, context.stage?.label ?? ''), max: result.max,
      subjects: (result.full ?? []).map(key => tr(lang, SUBJECTS.find(subject => subject.key === key)?.label ?? key)).join(tr(lang, '、')),
    })
    case 'locked': {
      const need = result.need
      if (need === null || need === undefined) return tr(lang, '{stage}还没解锁。', { stage: tr(lang, context.stage?.label ?? '') })
      return tr(lang, '{stage}还没解锁：要先「{label}」（{done}/{need}）。', {
        stage: tr(lang, context.stage?.label ?? ''), label: tr(lang, need.label), done: need.done, need: need.need,
      })
    }
    case 'job-locked': return tr(lang, '这份工作要求：{list}。', {
      list: (result.missing ?? []).map(m => tr(lang, '{trait} {need}（现在 {have}）', { trait: tr(lang, TRAITS[m.trait].label), need: m.need, have: m.have })).join(tr(lang, '，')),
    })
    case 'unknown': return tr(lang, '没有这个选项。')
    default: return tr(lang, '现在没法出门。')
  }
}

export { jobByKey, MAX, SHOP, JOBS, SUBJECTS, SCHOOL_STAGES, TRIPS, TRAITS, TRAIT_ORDER }
