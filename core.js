/**
 * dsh-pig · core — the pure pig model.
 *
 * No IO, no ctx, no clock of its own: every function takes the current time as
 * a parameter, so the whole game model is testable in isolation. Nothing here
 * schedules a timer — shifts, courses, trips, illness progression and decay are
 * all resolved lazily from timestamps, which is why the pig survives restarts
 * and why the tests never have to wait.
 *
 * Three ways the pig changes:
 *   - `feed()`  digests a *passive* harness event (a turn ended, a tool ran)
 *   - `act()`   applies a *deliberate* care action (feed it, bathe it, play)
 *   - `buy()` / `useItem()` / `start*()` drive the game loop
 *
 * Time away from the desk is one concept, not three: work, study and travel all
 * become a single `activity` record, so "is the pig home?" has exactly one
 * answer and `decay()` has exactly one place to settle it.
 *
 * @module dsh-pig/core
 */

import {
  AWAY_MULTIPLIER,
  CARE_KIND,
  DEFAULT_TOY,
  GRAVE,
  GROWTH,
  GYM,
  gymClassByKey,
  LIFE_STAGES,
  LOOKS,
  LIFESPAN_DAYS,
  STAGE_OUTFIT,
  WEARABLES,
  WEAR_FOR_SALE,
  WEAR_SLOTS,
  wearableByKey,
  SOUL,
  SOUL_AFTER_DAYS,
  ILLNESS_CHAINS,
  illnessStageMs,
  traitBonus,
  SELF_HEAL_CHANCE,
  SICK_AWAY_MULTIPLIER,
  SICK_PAY_MULTIPLIER,
  JOBS,
  KIND_ORDER,
  MAX,
  REVIVE_ITEM,
  SCHOOL_STAGES,
  SHOP,
  SICK_RISK_MINUTES,
  SLEEPY_AFTER_MINUTES,
  SLEEP_RECOVERY_PER_MIN,
  SLEEP_SICK_RISK_MULTIPLIER,
  STAGE_HEALTH,
  SUBJECTS,
  THRESHOLDS,
  MOOD_LEVELS,
  TRAITS,
  TRAIT_ORDER,
  TRIPS,
  ALL_ITEMS,
  DOCTOR_GRADUATION,
  DIPLOMAS,
  diplomaCount,
  PARALLEL_COURSES,
  COOP,
  RENAME_CARD,
  LOTTERY,
  BLACKJACK,
  blackjackCard,
  blackjackMultiplier,
  blackjackTotal,
  jobMissing,
  lotteryPrize,
  illnessAt,
  itemByKey,
  jobByKey,
  careItems,
  medicineForStage,
  nextIllness,
  schoolStageByKey,
  stageProgress,
  stageUnlocked,
  subjectByKey,
  tripByKey,
} from './data.js'
import { defaultLang, langOf, normalizeLang, tr } from './i18n.js'
import {
  FARE,
  LEGACY_TRIPS,
  PLACES,
  REGIONS,
  WORLD_BONUS,
  fareFor,
  placeByKey,
  regionSouvenirs,
  souvenirByKey,
  specialtyByKey,
  systemUtcOffset,
} from './world.js'

/** Bumped when the saved shape changes in a way migrate() must handle. */
export const STATE_VERSION = 6

const BIRTH_WEIGHT_G = 1200
const HATCH_WEIGHT_G = 160
const MEMORY_LIMIT = 8
const PENDING_LIMIT = 6

/** Growth ladder, ascending by xp. */
/**
 * Growth ladder, ascending by xp.
 *
 * Tuned so that ordinary passive work alone takes roughly: 7 minutes to 小猪崽,
 * 40 minutes to 圆滚猪, an afternoon to 大猪猪, a few days to 猪皇, a week or so
 * to 猪王, and the best part of a month of real use to 野猪王. Sending the pig
 * out to work or study is worth several hours of watching you type, so playing
 * the game is the fast lane.
 */

/**
 * Passive diet — what the pig gets for watching you actually work.
 *
 * These numbers are deliberately small. A single tool call used to be worth 3,
 * and a heavy agent session fires hundreds of them an hour: one afternoon of
 * ordinary use was 2232 XP, 94% of the whole pig, and it hit 「猪皇」 without the
 * player ever sending it to work or school. Passive work is now a trickle; the
 * activities are where the growth is.
 */
const DIET = Object.freeze({
  message: { xp: 1, satiety: 1, happiness: 1, weightG: 6 },
  turn: { xp: 2, satiety: 2, happiness: 1, weightG: 14 },
  tool: { xp: 1, satiety: 2, happiness: 0, weightG: 9 },
  toolError: { xp: 1, satiety: 0, happiness: 1, weightG: 2 },
  agentError: { xp: 1, satiety: 0, happiness: 0, weightG: 2 },
})

export const ACTIONS = Object.freeze({
  feed: {
    key: 'feed', label: '喂食', emoji: '🍎', verb: '吃了一口 🍎',
    // No blanket cleanliness hit: eating an apple does not make you dirty. Only
    // the foods that are actually messy declare a penalty of their own.
    cooldownMs: 60_000, satiety: 22, happiness: 6, cleanliness: 0, xp: 4, weightG: 90,
  },
  bathe: {
    key: 'bathe', label: '洗澡', emoji: '🛁', verb: '洗了个澡 🛁',
    cooldownMs: 90_000, satiety: -2, happiness: 8, cleanliness: 50, xp: 3, weightG: 0,
  },
  play: {
    key: 'play', label: '玩耍', emoji: '🎾', verb: '玩了一会儿 🎾',
    cooldownMs: 45_000, satiety: -5, happiness: 16, cleanliness: -4, xp: 3, weightG: 4,
  },
  pet: {
    key: 'pet', label: '摸摸', emoji: '❤️', verb: '被摸了摸头 ❤️',
    cooldownMs: 0, satiety: 0, happiness: 10, cleanliness: 0, xp: 1, weightG: 0,
  },
})

export const ACTION_ORDER = Object.freeze(['feed', 'bathe', 'play', 'pet'])

// Tuned against the activity lengths, not against minutes. A four-hour shift
// now costs roughly one meal and one bath, which is recoverable; the old rates
// were written when a shift was ten minutes and emptied every bar twice over.
const SATIETY_DECAY_PER_MIN = 0.08
const HAPPINESS_DECAY_PER_MIN = 0.06
const CLEANLINESS_DECAY_PER_MIN = 0.07
const AWAY_DECAY_MULTIPLIER = 1.4
/** No single trip may push a bar below this — see the drain() comment in decay. */
const AWAY_FLOOR = 15

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const clamp100 = value => clamp(value, 0, 100)

// ---------------------------------------------------------------------------
// Life — the pig is measured in days, not in points
//
// QQ Pet's pets hatch, grow up and eventually die; nothing in it is a level to
// grind. This is that idea, on a clock the pig can actually be watched against.
// XP still accumulates from real work, but it feeds *weight*: a fatter pig, not
// a higher one.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

/** The pig's age in fractional days since it was born. */
export function ageDays(state, nowMs) {
  if (state === null || typeof state.bornAt !== 'number') return 0
  return Math.max(0, (nowMs - state.bornAt) / DAY_MS)
}

/** 0 at `fromG`, 1 at `toG`, linear in between and clamped. */
const stretch = (weightG, fromG, toG) => {
  const t = (weightG - fromG) / (toG - fromG)
  return Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0))
}

/**
 * [dsh-piggy-claude-code mod] Sprite width for a weight: 40 px at hatching,
 * 200 px at 120 kg, 400 px at 500 kg, linear within each stretch and capped
 * at both ends. [Q0016] The second stretch leaves every size below 120 kg as
 * it was.
 */
export function sizeForWeight(weightG) {
  const startG = BIRTH_WEIGHT_G + HATCH_WEIGHT_G
  const bigG = GROWTH.bigKg * 1000
  const size = !(weightG >= bigG)
    ? GROWTH.minSize + stretch(weightG, startG, bigG) * (GROWTH.bigSize - GROWTH.minSize)
    : GROWTH.bigSize + stretch(weightG, bigG, GROWTH.fullKg * 1000) * (GROWTH.maxSize - GROWTH.bigSize)
  return Math.round(size)
}

/** [mod] How far from hatching weight to full size (500 kg), 0-100. */
export function growthPercent(weightG) {
  const startG = BIRTH_WEIGHT_G + HATCH_WEIGHT_G
  const t = (weightG - startG) / (GROWTH.fullKg * 1000 - startG)
  return Math.round(100 * Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)))
}

/** Heaviest stage this weight has reached. */
function stageForWeight(weightG) {
  const kg = weightG / 1000
  let stage = LIFE_STAGES[1]
  for (const candidate of LIFE_STAGES) {
    if (candidate.box === true) continue
    if (kg >= candidate.fromKg) stage = candidate
  }
  return stage
}

/**
 * [Q0016] The weight the life stage goes by: the heaviest the pig has been.
 * `peakWeightG` is only brought up to date when weight is about to come off
 * (the gym), so the current weight counts too.
 */
const stageWeightG = state => Math.max(state.weightG, Number.isFinite(state.peakWeightG) ? state.peakWeightG : 0)

/** The stage this pig has grown to; working out never takes it back. */
const stageOf = state => stageForWeight(stageWeightG(state))

/**
 * Can the owner pick between the elder look and the original one yet?
 * [ST0004] The old `look` switch: it only puts the beard on or takes it off.
 */
export const canChooseLook = state =>
  state !== null && state.hatched === true && state.dead !== true && wearUnlocked(state, wearableByKey('whiskers'))

/**
 * Which stage the pig is at right now: a box, a pig of some weight, or a grave.
 * [dsh-piggy-claude-code mod] Weight decides the stage and the size. [ST0004]
 * The stage drawing is only the pose; what the pig wears is `wornFor`.
 */
export function lifeStageFor(state, nowMs) {
  if (state === null) return LIFE_STAGES[0]
  if (state.dead === true) return GRAVE
  if (state.hatched !== true) return LIFE_STAGES[0]
  // [Q0016] The stage keeps the heaviest weight; the size shows today's.
  const stage = stageOf(state)
  return { ...stage, size: sizeForWeight(state.weightG) }
}

// ---------------------------------------------------------------------------
// [ST0004] Wardrobe: what the pig has unlocked and what it wears. Purely how it
// looks — nothing here touches a number the game is played with.
// ---------------------------------------------------------------------------

const stageRank = key => LIFE_STAGES.findIndex(stage => stage.key === key)

/** Has this pig earned `item` (a WEARABLES entry)? Derived from progress, or [ST0012] bought. */
export function wearUnlocked(state, item) {
  if (state === null || item === null || state.hatched !== true) return false
  const unlock = item.unlock
  const lessons = state.lessonsByStage ?? {}
  const collected = Object.keys(state.collected ?? {})
  switch (unlock.kind) {
    case 'always': return true
    case 'stage': return stageRank(stageOf(state).key) >= stageRank(unlock.stage)
    case 'lessons': return unlock.stage === null ? Object.values(lessons).some(n => n > 0) : (lessons[unlock.stage] ?? 0) > 0
    case 'diploma': return diplomaView(state).some(diploma => diploma.count > 0)
    case 'trip': return (state.stats?.trips ?? 0) > 0 || collected.length > 0
    case 'region': return collected.some(key => souvenirByKey(key)?.region === unlock.region)
    case 'shop': return (state.wardrobeBought ?? []).includes(item.key)
    case 'gym': return (state.stats?.gymLostG ?? 0) >= unlock.kg * 1000
    case 'coins': return Math.max(state.coins, state.stats?.peakCoins ?? 0) >= unlock.coins
    default: return false
  }
}

/** Known keys only, at most one per slot (the first wins), in slot order. */
function sanitizeOutfit(raw) {
  if (!Array.isArray(raw)) return null
  const items = raw.map(wearableByKey).filter(item => item !== null)
  return WEAR_SLOTS.map(slot => items.find(item => item.slot === slot)?.key).filter(key => key !== undefined)
}

/** Is the pig following its stage's look (no outfit of the owner's own)? */
export const outfitIsAuto = state => !Array.isArray(state?.outfit)

/**
 * What the pig wears right now, in drawing order: the owner's outfit, or the
 * stage's own look until there is one. Locked things are never worn; a box or
 * a grave wears nothing.
 */
export function wornFor(state) {
  if (state === null || state.hatched !== true || state.dead === true) return []
  const keys = outfitIsAuto(state) ? STAGE_OUTFIT[stageOf(state).key] ?? [] : state.outfit
  return (sanitizeOutfit(keys) ?? []).filter(key => wearUnlocked(state, wearableByKey(key)))
}

/** Every decoration with whether this pig has it and wears it. */
export function wardrobeView(state) {
  const worn = wornFor(state)
  return WEARABLES.map(item => ({
    key: item.key, slot: item.slot, label: item.label, emoji: item.emoji, unlock: item.unlock,
    unlocked: wearUnlocked(state, item), worn: worn.includes(item.key),
  }))
}

function wearRefusal(state) {
  if (state.hatched !== true) return 'unhatched'
  if (state.dead === true) return 'dead'
  return null
}

/**
 * Put `key` on (taking off whatever was in its slot) or take it off. The
 * first change turns the stage's look into the owner's own outfit.
 * @returns {{ok: boolean, reason?: string}}
 */
export function wear(state, key, on, nowMs) {
  const refusal = wearRefusal(state)
  if (refusal !== null) return { ok: false, reason: refusal }
  const item = wearableByKey(key)
  if (item === null) return { ok: false, reason: 'bad-wear' }
  if (!wearUnlocked(state, item)) return { ok: false, reason: 'wear-locked' }
  const kept = wornFor(state).filter(other => other !== key && (on !== true || wearableByKey(other).slot !== item.slot))
  state.outfit = sanitizeOutfit(on === true ? [key, ...kept] : kept)
  state.lastActiveAt = nowMs
  return { ok: true }
}

/** Forget the owner's outfit: the pig follows its stage's look again. */
export function wearAuto(state, nowMs) {
  const refusal = wearRefusal(state)
  if (refusal !== null) return { ok: false, reason: refusal }
  state.outfit = null
  state.lastActiveAt = nowMs
  return { ok: true }
}

/** The next rung, or null once the pig is as grown as it gets. */
export function nextLifeStage(state, nowMs) {
  if (state === null || state.dead === true || state.hatched !== true) return null
  const kg = stageWeightG(state) / 1000
  return LIFE_STAGES.find(stage => stage.box !== true && stage.fromKg > kg) ?? null
}

/** Kilograms still to gain before that next rung, or null at the end of the line. */
export function kgToNextStage(state, nowMs) {
  const next = nextLifeStage(state, nowMs)
  return next === null ? null : Math.max(0, next.fromKg - state.weightG / 1000)
}

/**
 * [dsh-piggy-claude-code mod] Switch the pig's language: zh · ja · en.
 * @returns {{ok: boolean, reason?: string, lang?: string}}
 */
export function setLang(state, lang, nowMs) {
  const next = normalizeLang(lang)
  if (next === null) return { ok: false, reason: 'bad-lang' }
  // A pig still wearing a default name gets the default of the new language;
  // a name the owner chose is theirs and is never touched.
  const defaults = ['zh', 'ja', 'en'].map(code => tr(code, '猪猪'))
  if (defaults.includes(state.name)) state.name = tr(next, '猪猪')
  state.lang = next
  return { ok: true, lang: next }
}

export { langOf }

/** [dsh-piggy-claude-code mod] A message in the pig's current language. */
const say = (state, zh, params) => tr(langOf(state), zh, params)
/** A data label (stage, item, illness…) in the pig's current language. */
const word = (state, zh) => tr(langOf(state), zh)

/** The Chinese source label of an activity, rebuilt from its keys when possible. */
function activitySourceLabel(activity) {
  if (activity === null || activity === undefined) return ''
  if (activity.kind === 'work') return jobByKey(activity.key)?.label ?? activity.label ?? ''
  if (activity.kind === 'trip') return placeByKey(activity.key)?.label ?? tripByKey(activity.key)?.label ?? activity.label ?? ''
  if (activity.kind === 'gym') return gymClassByKey(activity.key)?.label ?? activity.label ?? ''
  return typeof activity.label === 'string' ? activity.label : ''
}

/** The subjects of a study sitting (one, or several taken together). */
export const studyKeys = activity => (Array.isArray(activity?.keys) && activity.keys.length > 0 ? activity.keys : [activity?.key])

/**
 * [dsh-piggy-claude-code mod] "大学数学+美术" — a sitting's stage and subjects,
 * each translated on its own so any combination reads right in any language.
 */
export function lessonLabel(lang, stageKey, subjectKeys) {
  const stage = schoolStageByKey(stageKey)
  const subjects = subjectKeys.map(subjectByKey).filter(Boolean)
  if (stage === null || subjects.length === 0) return ''
  return tr(lang, '{stage}{subjects}', {
    stage: tr(lang, stage.label),
    subjects: subjects.map(subject => tr(lang, subject.label)).join(tr(lang, '+')),
  })
}

/**
 * [dsh-piggy-claude-code mod] An activity's label ("打零工", "大学数学+美术",
 * "东京") in `lang`. The saved record keeps the Chinese source label.
 */
export function activityLabel(activity, lang) {
  if (activity?.kind === 'study') {
    const label = lessonLabel(lang, activity.stage, studyKeys(activity))
    if (label !== '') return label
  }
  return tr(lang, activitySourceLabel(activity))
}

/** Upstream's countdown in days; stages no longer follow age, so there is none. */
export function daysToNextStage(state, nowMs) {
  return null
}

/**
 * Switch an elder pig between the elder look and the original one.
 * @returns {{ok: boolean, reason?: string, look?: string}}
 */
export function setLook(state, look, nowMs) {
  if (!LOOKS.includes(look)) return { ok: false, reason: 'bad-look' }
  if (!canChooseLook(state)) return { ok: false, reason: state.dead === true ? 'dead' : 'too-light' }
  // [ST0004] the elder look is the beard in the wardrobe now.
  wear(state, 'whiskers', look === 'elder', nowMs)
  return { ok: true, look }
}

/** Has the pig outlived its span? [dsh-piggy-claude-code mod] Never: no death by old age. */
export const isElderly = (state, nowMs) => false

/** Has the grave been left alone long enough for the soul to settle on it? */
export const hasSoul = (state, nowMs) =>
  state !== null && state.dead === true && (nowMs - (state.diedAt ?? nowMs)) / DAY_MS >= SOUL_AFTER_DAYS

/**
 * Let the pig go. Used by illness at the end of a chain and by old age.
 * @param {string} why - shown in the announcement.
 */
function die(state, nowMs, why) {
  if (state.dead === true) return
  state.dead = true
  state.health = 0
  state.illness = null
  state.activity = null
  state.sleep = null
  state.diedAt = nowMs
  state.stats.deaths = (state.stats.deaths ?? 0) + 1
  remember(state, `${word(state, why)} ${GRAVE.emoji}`, nowMs)
  announce(state, 'death', say(state, '{name} {why}…用{item}可以救回来，也可以领养一只新的', {
    name: state.name, why: word(state, why), item: word(state, REVIVE_ITEM.label),
  }))
}

/**
 * Wipe the pig and start from a fresh box, whatever state it was in.
 *
 * `adopt` only works once a pig has died, which meant there was no way to start
 * over with a living one short of deleting the save file by hand — and the
 * running host holds the state in memory, so editing the file does not even
 * work while it is up.
 */
export function reset(nowMs, lang) {
  return layEgg(nowMs, lang)
}

/**
 * ---------------------------------------------------------------------------
 * Developer mode
 *
 * Applies an arbitrary patch to the pig so the panel can be driven into any
 * state without waiting days for it. Everything is clamped through the same
 * bounds the game uses, so dev mode can produce a *valid* state but never a
 * corrupt one — no negative coins, no health of 99, no dangling illness.
 * ---------------------------------------------------------------------------
 */

/** Numeric fields dev mode may set, with their legal range. */
const DEV_NUMBERS = Object.freeze({
  satiety: [0, 100],
  happiness: [0, 100],
  cleanliness: [0, 100],
  health: [0, MAX.health],
  coins: [0, 1_000_000],
  xp: [0, 10_000_000],
  weightG: [400, 500_000],
})

export function applyDevPatch(state, patch, nowMs) {
  if (state === null || typeof patch !== 'object' || patch === null) return state
  const before = { dead: state.dead, hatched: state.hatched, stage: state.stage }

  for (const [key, [lo, hi]] of Object.entries(DEV_NUMBERS)) {
    const value = patch[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      state[key] = clamp(Math.round(value), lo, hi)
    }
  }
  // [Q0016] Setting a weight sets the stage too: the debug weights jump stages
  // both ways, which the heaviest-weight rule would otherwise forbid.
  if (typeof patch.weightG === 'number' && Number.isFinite(patch.weightG)) state.peakWeightG = state.weightG

  if (patch.traits !== null && typeof patch.traits === 'object') {
    state.traits = sanitizeTraits({ ...state.traits, ...patch.traits })
  }

  if (patch.illness === null) state.illness = null
  else if (typeof patch.illness === 'object' && patch.illness !== null) {
    state.illness = sanitizeIllness({ ...patch.illness, since: nowMs, progressMs: 0 })
  }

  if (patch.inventory !== null && typeof patch.inventory === 'object') {
    state.inventory = sanitizeInventory({ ...state.inventory, ...patch.inventory })
  }

  // Fast-forward: decay the pig as if `__advanceMs` had really passed. This is
  // the whole point of dev mode — the interesting states take days to reach.
  if (typeof patch.__advanceMs === 'number' && Number.isFinite(patch.__advanceMs) && patch.__advanceMs > 0) {
    state.lastSeenAt = nowMs - Math.min(patch.__advanceMs, 60 * 86_400_000)
    decay(state, nowMs)
  }

  // Age is the one thing worth jumping: it is what takes days to see.
  if (typeof patch.ageDays === 'number' && Number.isFinite(patch.ageDays)) {
    state.bornAt = nowMs - Math.max(0, patch.ageDays) * 86_400_000
  }

  if (patch.dead === true) {
    die(state, nowMs, '被开发者按死了')
  } else if (patch.dead === false && state.dead === true) {
    revive(state, nowMs)
  }

  if (patch.hatched === true && state.hatched !== true) state.hatched = true
  if (patch.hatched === false) {
    state.hatched = false
    state.dead = false
    state.diedAt = null
    state.stage = 'box'
  }

  if (patch.activity === null) state.activity = null
  if (patch.riskMinutes === 0) state.riskMinutes = 0

  state.stage = lifeStageFor(state, nowMs).key
  state.lastSeenAt = nowMs
  remember(state, say(state, '🔧 开发者改了状态（{from} → {to}）', { from: before.stage, to: state.stage }), nowMs)
  return state
}

/** Start over with a fresh box. The old pig's story stays in `memories`. */
export function adopt(state, nowMs) {
  const fresh = layEgg(nowMs)
  // [dsh-piggy-claude-code mod] a new pig keeps the owner's language.
  if (normalizeLang(state?.lang) !== null) {
    fresh.lang = state.lang
    fresh.name = tr(fresh.lang, '猪猪')
  }
  if (state !== null && Array.isArray(state.memories)) {
    fresh.memories = state.memories.slice(-MEMORY_LIMIT)
    remember(fresh, say(fresh, '又领养了一只，纸盒里传来窸窸窣窣的声音 📦'), nowMs)
  }
  return Object.assign(state ?? {}, fresh)
}

// ---------------------------------------------------------------------------
// Creation and migration
// ---------------------------------------------------------------------------

export function layEgg(nowMs, lang = defaultLang()) {
  // [dsh-piggy-claude-code mod] a new pig speaks the host's default language;
  // [ST0014] a replayed op names it, since the server has no host language.
  lang = normalizeLang(lang) ?? defaultLang()
  return {
    lang,
    version: STATE_VERSION,
    name: tr(lang, '猪猪'),
    bornAt: nowMs,
    hatched: false,
    dead: false,
    /** When the pig died, so the grave can be left alone long enough for a soul. */
    diedAt: null,
    /** Last stage the panel announced; drives the "grew up" message. */
    stage: 'box',
    xp: 0,
    weightG: BIRTH_WEIGHT_G,
    // [Q0016] the heaviest it has been, kept for the life stage once the gym
    // takes weight off (see stageWeightG).
    peakWeightG: BIRTH_WEIGHT_G,
    satiety: 70,
    happiness: 70,
    cleanliness: 90,
    health: MAX.health,
    // Enough to buy medicine on day one: at 60 a sick pig could not afford the
    // cheapest cure and had nothing left to earn it with.
    coins: 500,
    inventory: {},
    traits: { intel: 0, charm: 0, strong: 0 },
    courses: {},
    // Finished lessons per school stage. QQ Pet starts every pet at 小学 and
    // `college` / `graduate` sit behind it; this is what opens them.
    lessonsByStage: { primary: 0, college: 0, graduate: 0, doctor: 0 },
    // [mod] Lessons per subject at each stage: what the 小学 / 大学 caps count.
    stageCourses: { primary: {}, college: {}, graduate: {}, doctor: {} },
    souvenirs: [],
    // [dsh-piggy-claude-code mod] the travel collection and what it has paid out.
    collected: {},
    regionsDone: [],
    worldDone: false,
    doctorDone: false,
    lastTrip: null,
    illness: null,
    activity: null,
    // [dsh-piggy-claude-code mod] `{ since, auto }` while asleep; `auto` marks
    // a nap the computer's own sleep started, which its wake-up may end.
    sleep: null,
    // [ST0004] the owner's outfit as wardrobe keys, or null: wear the stage's look.
    outfit: null,
    // [ST0012] decorations bought on the shop's 装扮 shelf, once each.
    wardrobeBought: [],
    riskMinutes: 0,
    lastFedAt: 0,
    // [dsh-piggy-claude-code mod] when the last scratch card was bought.
    lastLotteryAt: 0,
    // [ST0015] the blackjack hand on the table, `{ bet, cards }`, or null.
    blackjack: null,
    lastActiveAt: nowMs,
    lastSeenAt: nowMs,
    cooldowns: {},
    // [ST0014] the pig's own dice: every roll comes from here, so the same ops
    // give the same pig on any machine (see nextRandom).
    rng: seedFrom(nowMs),
    // [ST0014] the owner's UTC offset in minutes, for the [HH:MM] in memories;
    // null means the machine's own zone.
    utcOffsetMin: null,
    pending: [],
    memories: [],
    stats: {
      turns: 0, messages: 0, tools: 0, toolErrors: 0, agentErrors: 0,
      levelUps: 0, feeds: 0, baths: 0, plays: 0, pets: 0,
      jobs: 0, coinsEarned: 0, purchases: 0, illnesses: 0, cures: 0, deaths: 0, revives: 0,
      courses: 0, lessons: 0, trips: 0, lotteries: 0, lotteryWon: 0,
      blackjacks: 0, blackjackWon: 0,
      // [Q0016] gym sessions, and the grams they took off in all; the most
      // coins ever held at once (the gold look).
      gyms: 0, gymLostG: 0, peakCoins: 0,
    },
  }
}

/**
 * Open the box. The piglet falls out — it does not start as a fully grown pig,
 * and `ageDays` starts counting from the moment it does.
 */
/**
 * Open an existing box in place, keeping everything the save already has.
 * `hatchEgg` builds a brand new pig; this one just lets the piglet out.
 */
export function hatch(state, nowMs) {
  state.hatched = true
  state.bornAt = nowMs
  state.dead = false
  state.diedAt = null
  state.stage = 'piglet'
  state.weightG += HATCH_WEIGHT_G
  state.health = Math.max(state.health, 1)
  remember(state, say(state, '纸盒打开了，一只小猪蹦了出来 🐷'), nowMs)
  return state
}

export function hatchEgg(nowMs, lang) {
  const state = layEgg(nowMs, lang)
  state.hatched = true
  state.bornAt = nowMs
  state.weightG += HATCH_WEIGHT_G
  state.stage = 'piglet'
  remember(state, say(state, '纸盒打开了，一只小猪蹦了出来 🐷'), nowMs)
  return state
}

/** Fill in anything a hand-edited or older save is missing. */
export function migrate(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const egg = layEgg(typeof raw.bornAt === 'number' ? raw.bornAt : Date.now())
  const state = { ...egg, ...raw }
  state.version = STATE_VERSION
  state.stats = { ...egg.stats, ...(asObject(raw.stats) ?? {}) }
  state.cooldowns = { ...(asObject(raw.cooldowns) ?? {}) }
  state.inventory = sanitizeInventory(raw.inventory)
  state.traits = sanitizeTraits(raw.traits)
  state.courses = sanitizeCourses(raw.courses)
  state.lessonsByStage = sanitizeLessonsByStage(raw.lessonsByStage, raw.courses)
  state.stageCourses = sanitizeStageCourses(raw.stageCourses, state.lessonsByStage)
  state.souvenirs = Array.isArray(raw.souvenirs) ? raw.souvenirs.filter(s => typeof s === 'string').slice(-40) : []
  // [dsh-piggy-claude-code mod] travel collection, region payouts, doctorate.
  state.collected = sanitizeCollected(raw.collected)
  state.regionsDone = Array.isArray(raw.regionsDone) ? REGIONS.map(r => r.key).filter(key => raw.regionsDone.includes(key)) : []
  state.wardrobeBought = Array.isArray(raw.wardrobeBought) ? WEAR_FOR_SALE.map(w => w.key).filter(key => raw.wardrobeBought.includes(key)) : []
  state.worldDone = raw.worldDone === true
  state.doctorDone = raw.doctorDone === true
  state.lastTrip = sanitizeLastTrip(raw.lastTrip)
  state.pending = []
  state.memories = Array.isArray(raw.memories)
    ? raw.memories.filter(m => typeof m === 'string').slice(-MEMORY_LIMIT)
    : []

  for (const key of ['xp', 'weightG', 'peakWeightG', 'satiety', 'happiness', 'cleanliness', 'health', 'coins', 'riskMinutes', 'bornAt', 'lastFedAt', 'lastLotteryAt', 'lastActiveAt', 'lastSeenAt']) {
    if (typeof state[key] !== 'number' || !Number.isFinite(state[key])) state[key] = egg[key]
  }
  // [Q0016] The gym's running totals open the muscle look, the most coins ever
  // held the gold one: keep them counts.
  for (const key of ['gyms', 'gymLostG', 'peakCoins']) {
    if (!Number.isFinite(state.stats[key]) || state.stats[key] < 0) state.stats[key] = 0
  }
  state.peakWeightG = clamp(state.peakWeightG, 0, 500_000)
  if (typeof raw.cleanliness !== 'number') state.cleanliness = egg.cleanliness
  if (typeof raw.health !== 'number') state.health = raw.dead === true ? 0 : MAX.health
  if (typeof raw.coins !== 'number') state.coins = egg.coins
  // Starting money went 60 -> 500. A pig that hatched under the old number is
  // broke through no fault of its owner, so top it up once — and only once, by
  // keying off the version that was on disk when it was loaded.
  if ((typeof raw.version !== 'number' || raw.version < 5) && state.coins >= 0 && state.coins < egg.coins) {
    state.coins = egg.coins
  }
  if (typeof raw.diedAt !== 'number') state.diedAt = state.dead === true ? (raw.lastSeenAt ?? egg.bornAt) : null
  if (typeof state.stage !== 'string') state.stage = state.hatched === true ? 'piglet' : 'box'
  if (typeof state.name !== 'string' || state.name.trim() === '') state.name = egg.name
  // [dsh-piggy-claude-code mod] saves from before languages existed stay Chinese.
  state.lang = normalizeLang(raw.lang) ?? 'zh'
  // [ST0014] older saves get dice seeded from their birth, the same everywhere.
  state.rng = Number.isInteger(raw.rng) && raw.rng >= 0 && raw.rng <= 0xffffffff ? raw.rng : seedFrom(state.bornAt)
  state.utcOffsetMin = Number.isFinite(raw.utcOffsetMin) && Math.abs(raw.utcOffsetMin) <= 14 * 60 ? raw.utcOffsetMin : null

  state.health = clamp(Math.round(state.health), 0, MAX.health)
  state.satiety = clamp100(state.satiety)
  state.happiness = clamp100(state.happiness)
  state.cleanliness = clamp100(state.cleanliness)
  state.coins = Math.max(0, Math.floor(state.coins))
  // [ST0015] a hand that no longer reads as one hands its bet back.
  state.blackjack = sanitizeBlackjack(raw.blackjack)
  if (state.blackjack === null) state.coins += blackjackRefund(raw.blackjack)
  state.illness = sanitizeIllness(raw.illness)
  // [dsh-piggy-claude-code mod] a trip from the retired four is refunded and dropped.
  const rawActivity = asObject(raw.activity)
  if (rawActivity !== null && rawActivity.kind === 'trip' && LEGACY_TRIPS.includes(rawActivity.key) && !raw.dead) {
    state.coins += Math.max(0, Math.floor(Number(rawActivity.cost) || 0))
    state.activity = null
  } else {
    state.activity = sanitizeActivity(raw.activity ?? raw.work)
  }
  state.dead = state.dead === true || state.health <= 0
  // A pig cannot be asleep at home and out at the same time, nor in its grave.
  state.sleep = state.activity === null && !state.dead ? sanitizeSleep(raw.sleep) : null
  state.hatched = state.hatched === true || state.xp > 0
  // [ST0004] v6: the elder look moved into the wardrobe. A pig whose owner had
  // taken the beard off ('original') keeps it off; every other pig follows its
  // stage's look until it is dressed by hand.
  state.outfit = sanitizeOutfit(raw.outfit)
  if ((typeof raw.version !== 'number' || raw.version < 6) && raw.outfit === undefined && raw.look === 'original') state.outfit = []
  delete state.look
  // [Q0016] A save from before the gold look knows today's coins, after every
  // refund above.
  state.stats.peakCoins = Math.max(state.stats.peakCoins, state.coins)
  return state
}

function asObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null
}

function sanitizeInventory(raw) {
  const source = asObject(raw)
  if (source === null) return {}
  const out = {}
  for (const [key, count] of Object.entries(source)) {
    if (!Number.isFinite(count)) continue
    const n = Math.floor(count)
    if (n > 0 && ALL_ITEMS.some(item => item.key === key)) out[key] = n
  }
  return out
}

/** [dsh-piggy-claude-code mod] Souvenir counts, known keys only. */
function sanitizeCollected(raw) {
  const source = asObject(raw)
  if (source === null) return {}
  const out = {}
  for (const [key, count] of Object.entries(source)) {
    if (souvenirByKey(key) !== null && Number.isFinite(count) && count > 0) out[key] = Math.floor(count)
  }
  return out
}

/** [ST0015] An open blackjack hand: a bet, two or more distinct cards, under 21. */
function sanitizeBlackjack(raw) {
  const source = asObject(raw)
  if (source === null || !Number.isInteger(source.bet) || source.bet <= 0) return null
  const cards = source.cards
  if (!Array.isArray(cards) || cards.length < 2 || !cards.every(card => Number.isInteger(card) && card >= 0 && card < 52)) return null
  if (new Set(cards).size !== cards.length || blackjackTotal(cards).total >= 21) return null
  return { bet: source.bet, cards: [...cards] }
}

/** [ST0015] What a broken hand's bet was worth, to give it back; 0 if none. */
function blackjackRefund(raw) {
  const bet = asObject(raw)?.bet
  return Number.isInteger(bet) && bet > 0 ? bet : 0
}

function sanitizeLastTrip(raw) {
  const source = asObject(raw)
  if (source === null || placeByKey(source.place) === null) return null
  return {
    place: source.place,
    souvenir: souvenirByKey(source.souvenir) !== null ? source.souvenir : null,
    fresh: source.fresh === true,
    loot: Array.isArray(source.loot) ? source.loot.filter(key => itemByKey(key) !== null) : [],
    regionDone: typeof source.regionDone === 'string' ? source.regionDone : null,
    at: Number(source.at) || 0,
  }
}

function sanitizeTraits(raw) {
  const source = asObject(raw)
  const out = {}
  for (const key of TRAIT_ORDER) {
    const value = source?.[key]
    out[key] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  }
  return out
}

function sanitizeCourses(raw) {
  const source = asObject(raw)
  if (source === null) return {}
  const out = {}
  for (const [key, level] of Object.entries(source)) {
    if (!Number.isFinite(level)) continue
    const n = Math.floor(level)
    if (n > 0 && subjectByKey(key) !== null) out[key] = n
  }
  return out
}

/**
 * Lesson counts per school stage.
 *
 * A save written before the stage ladder existed only has per-subject totals,
 * and no way to say which stage they came from. Rather than locking an existing
 * player out of everything, assume those lessons were the entry stage — which is
 * the only one that existed to them.
 */
function sanitizeLessonsByStage(raw, rawCourses) {
  const source = asObject(raw)
  const out = {}
  for (const stage of SCHOOL_STAGES) out[stage.key] = 0
  if (source !== null) {
    for (const stage of SCHOOL_STAGES) {
      const n = source[stage.key]
      if (Number.isFinite(n) && n > 0) out[stage.key] = Math.floor(n)
    }
  }
  const total = Object.values(out).reduce((sum, n) => sum + n, 0)
  if (total === 0) {
    const legacy = Object.values(sanitizeCourses(rawCourses)).reduce((sum, n) => sum + n, 0)
    if (legacy > 0) out[SCHOOL_STAGES[0].key] = legacy
  }
  return out
}

/**
 * [mod] Lessons per subject at each stage.
 *
 * A save from before the caps only knows how many lessons each stage had, not
 * which subjects. Spread that total evenly over the nine subjects, so a pig
 * that already went through 小学 many times does not get the cheap lessons a
 * second time.
 */
function sanitizeStageCourses(raw, lessonsByStage) {
  const source = asObject(raw)
  const out = {}
  for (const stage of SCHOOL_STAGES) {
    out[stage.key] = {}
    if (source !== null) {
      for (const [key, n] of Object.entries(asObject(source[stage.key]) ?? {})) {
        if (Number.isFinite(n) && n > 0 && subjectByKey(key) !== null) out[stage.key][key] = Math.floor(n)
      }
      continue
    }
    const total = lessonsByStage?.[stage.key] ?? 0
    SUBJECTS.forEach((subject, i) => {
      const n = Math.floor(total / SUBJECTS.length) + (i < total % SUBJECTS.length ? 1 : 0)
      if (n > 0) out[stage.key][subject.key] = n
    })
  }
  return out
}

/** [mod] How many times `subjectKey` has been taken at `stageKey`. */
export const stageLessons = (state, stageKey, subjectKey) => state?.stageCourses?.[stageKey]?.[subjectKey] ?? 0

function sanitizeIllness(raw) {
  const source = asObject(raw)
  if (source === null) return null
  const chain = Number.isInteger(source.chain) ? source.chain : -1
  const stage = Number.isInteger(source.stage) ? source.stage : 0
  if (chain < 0 || chain >= ILLNESS_CHAINS.length) return null
  if (stage < 1 || stage > ILLNESS_CHAINS[chain].stages.length) return null
  return {
    chain,
    stage,
    since: Number.isFinite(source.since) ? source.since : 0,
    progressMs: Number.isFinite(source.progressMs) ? Math.max(0, source.progressMs) : 0,
  }
}

/** [mod] `{ since, auto }`, or null for awake and for anything malformed. */
function sanitizeSleep(raw) {
  const source = asObject(raw)
  if (source === null || !Number.isFinite(source.since)) return null
  return { since: source.since, auto: source.auto === true }
}

/** Accepts both the v4 `activity` record and the v3 `work` record. */
function sanitizeActivity(raw) {
  const source = asObject(raw)
  if (source === null) return null
  if (!Number.isFinite(source.endsAt)) return null
  const kind = source.kind ?? 'work'
  if (!['work', 'study', 'trip', 'gym'].includes(kind)) return null
  const known = kind === 'work'
    ? jobByKey(source.key ?? source.job) !== null
    : kind === 'study'
      ? subjectByKey(source.key) !== null
      : kind === 'gym'
        ? gymClassByKey(source.key) !== null
        : placeByKey(source.key) !== null
  if (!known) return null
  const keys = kind === 'study' && Array.isArray(source.keys)
    ? source.keys.filter(key => subjectByKey(key) !== null)
    : []
  return {
    kind,
    key: source.key ?? source.job,
    keys: kind === 'study' ? (keys.length > 0 ? keys : [source.key]) : undefined,
    stage: kind === 'study' && schoolStageByKey(source.stage) !== null ? source.stage : undefined,
    // a trip carries its own quote, worked out at departure
    zones: kind === 'trip' ? Number(source.zones) || 0 : undefined,
    happiness: kind === 'trip' ? Number(source.happiness) || 0 : undefined,
    xp: kind === 'trip' ? Number(source.xp) || 0 : undefined,
    satiety: kind === 'trip' ? Number(source.satiety) || 0 : undefined,
    label: typeof source.label === 'string' ? source.label : '',
    emoji: typeof source.emoji === 'string' ? source.emoji : '',
    startedAt: Number(source.startedAt) || 0,
    endsAt: source.endsAt,
    cost: Number(source.cost) || 0,
    // [ST0014] a pig pen outing keeps its bonus through a save and a sync.
    ...(asObject(source.coop) !== null && Number.isFinite(source.coop.bonus) ? {
      coop: {
        id: typeof source.coop.id === 'string' ? source.coop.id.slice(0, 64) : '',
        partner: typeof source.coop.partner === 'string' ? source.coop.partner.slice(0, 32) : '',
        bonus: Math.min(COOP.bonus, Math.max(1, source.coop.bonus)),
      },
    } : {}),
  }
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/** [ST0014] HH:MM in the owner's zone when the save knows it, else the machine's. */
function clock(state, nowMs) {
  const offset = state?.utcOffsetMin
  if (Number.isFinite(offset)) {
    const d = new Date(nowMs + offset * 60_000)
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  }
  const d = new Date(nowMs)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function remember(state, text, nowMs) {
  state.memories.push(`[${clock(state, nowMs)}] ${text}`)
  if (state.memories.length > MEMORY_LIMIT) state.memories.splice(0, state.memories.length - MEMORY_LIMIT)
}

function announce(state, kind, text) {
  state.pending = Array.isArray(state.pending) ? state.pending : []
  state.pending.push({ kind, text, at: Date.now() })
  if (state.pending.length > PENDING_LIMIT) state.pending.splice(0, state.pending.length - PENDING_LIMIT)
}

function takePending(state) {
  const out = Array.isArray(state.pending) ? state.pending.slice() : []
  state.pending = []
  return out
}

/** Take and clear the queued announcements. */
export function drainPending(state) {
  return takePending(state)
}

// ---------------------------------------------------------------------------
// [ST0014] Replayable: the same save and the same ops give the same pig on
// any machine, so the server can settle a synced pig by replaying them.
// ---------------------------------------------------------------------------

/** A 32-bit seed from any number (a timestamp, usually). */
export function seedFrom(value) {
  let h = (Math.floor(Math.abs(Number(value) || 0)) % 0x100000000) ^ 0x9e3779b9
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

let randomOverride = null

/** Tests only: force every roll to `fn()`; null restores the pig's own dice. */
export function setRandomForTests(fn) {
  randomOverride = typeof fn === 'function' ? fn : null
}

/** The next roll in [0, 1) from the pig's own dice (mulberry32), advancing them. */
export function nextRandom(state) {
  if (randomOverride !== null) return randomOverride()
  let t = ((state.rng >>> 0) + 0x6d2b79f5) >>> 0
  state.rng = t
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Time is folded in at every whole minute, and exactly when an outing ends. */
export const TICK_MS = 60_000
/** Beyond a week of absence the first stretch is folded in one go. */
const MAX_TICKS = 7 * 24 * 60

/**
 * Move the pig's clock to the last tick at or before `toMs`.
 *
 * `decay` is not quite additive (thresholds, floors and clamps are checked
 * where it is sampled), so a pig refreshed every second and one refreshed once
 * an hour used to drift apart. Folding time in on a fixed grid makes the save
 * depend only on its ops, not on how often anyone looked at it.
 */
export function advance(state, toMs) {
  if (state === null || !Number.isFinite(toMs)) return state
  const start = Number.isFinite(state.lastSeenAt) ? state.lastSeenAt : toMs
  const skipTo = Math.floor(toMs / TICK_MS) * TICK_MS - MAX_TICKS * TICK_MS
  if (skipTo > start) {
    const ends = state.activity?.endsAt
    if (Number.isFinite(ends) && ends > start && ends <= skipTo) decay(state, ends)
    decay(state, skipTo)
  }
  for (let guard = 0; guard <= MAX_TICKS + 2; guard += 1) {
    const from = state.lastSeenAt
    let next = Math.floor(from / TICK_MS) * TICK_MS + TICK_MS
    const ends = state.activity?.endsAt
    if (Number.isFinite(ends) && ends > from && ends < next) next = ends
    if (next > toMs) break
    decay(state, next)
  }
  noteCoins(state, toMs)
  return state
}

/**
 * [Q0016] Remember the most coins the pig has ever held (`stats.peakCoins`).
 * Crossing a `coins` look's line unlocks it for good: announced once, and put
 * on if nothing is worn on its slot yet. Called after time is folded in and
 * after every op, so a windfall spent in the very next op still counts.
 */
export function noteCoins(state, nowMs) {
  if (state === null || state.stats === null || typeof state.stats !== 'object') return
  const before = Number.isFinite(state.stats.peakCoins) ? state.stats.peakCoins : 0
  if (!(state.coins > before)) return
  state.stats.peakCoins = state.coins
  if (state.hatched !== true || state.dead === true) return
  for (const item of WEARABLES) {
    if (item.unlock.kind !== 'coins' || before >= item.unlock.coins || state.coins < item.unlock.coins) continue
    const slotTaken = wornFor(state).some(key => wearableByKey(key).slot === item.slot)
    if (!slotTaken) wear(state, item.key, true, nowMs)
    const params = { name: state.name, coins: item.unlock.coins, look: word(state, item.label) }
    remember(state, say(state, '🪙 手里攒到过 {coins} 猪币，解锁了「{look}」！', params), nowMs)
    announce(state, 'gold', say(state, '{name} 变成了{look}！✨', params))
  }
}

/** Inventory counts, always including zeroes so the UI can render a grid. */
export function inventoryView(state) {
  const out = {}
  for (const item of ALL_ITEMS) out[item.key] = state.inventory?.[item.key] ?? 0
  // The free default toy is always in the bag and never runs out, so `玩耍` is
  // never blocked by an empty one.
  out[DEFAULT_TOY.key] = Infinity
  return out
}

/** Which shelves the pig can actually use right now, for the panel's picker. */
export function careView(state) {
  const out = {}
  for (const action of ['feed', 'bathe', 'play']) out[action] = careOptions(state, action)
  return out
}

/** Per-stage lesson counts plus whether the next rung is open yet. */
export function studyView(state) {
  const lessons = state.lessonsByStage ?? {}
  return SCHOOL_STAGES.map(stage => ({
    key: stage.key,
    label: stage.label,
    minutes: stage.minutes,
    tuition: stage.tuition,
    gain: stage.gain,
    // [mod] per-subject limit at this stage (null = none) and how much of it is used
    cap: stage.cap,
    taken: Object.fromEntries(SUBJECTS.map(subject => [subject.key, stageLessons(state, stage.key, subject.key)])),
    unlocked: stageUnlocked(stage, lessons),
    progress: stageProgress(stage, lessons),
  }))
}

/**
 * [mod] Every diploma, held or not: how many the pig has, and how far it is
 * into the next one (a one-off diploma already held has no next).
 */
export function diplomaView(state) {
  return DIPLOMAS.map(diploma => {
    const lessons = state?.lessonsByStage?.[diploma.stage] ?? 0
    const count = diplomaCount(diploma, lessons)
    return {
      key: diploma.key, stage: diploma.stage, label: diploma.label, emoji: diploma.emoji,
      repeat: diploma.repeat, count,
      next: !diploma.repeat && count > 0 ? null : { done: lessons % diploma.lessons, need: diploma.lessons },
    }
  })
}

/** Trait totals, always including every trait. */
export function traitView(state) {
  const out = {}
  for (const key of TRAIT_ORDER) out[key] = state.traits?.[key] ?? 0
  return out
}

/** Levels per subject, always including every subject (0 = never studied). */
export function courseView(state) {
  const out = {}
  for (const subject of SUBJECTS) out[subject.key] = state.courses?.[subject.key] ?? 0
  return out
}

export function currentIllness(state) {
  if (state.illness === null || state.illness === undefined) return null
  return illnessAt(state.illness.chain, state.illness.stage)
}

// ---------------------------------------------------------------------------
// The clock: decay, activity settlement, illness progression
// ---------------------------------------------------------------------------

export function decay(state, nowMs) {
  const elapsedMs = Math.max(0, nowMs - (state.lastSeenAt ?? nowMs))
  state.lastSeenAt = nowMs
  if (elapsedMs <= 0) return state

  const minutes = elapsedMs / 60000
  // Read the away flag *before* settling: finishActivity clears `activity`, and
  // everything below needs to know whether this stretch was spent out of the
  // house. Getting this order wrong is what let a day trip come home sick.
  const away = state.activity !== null
  const speed = away ? AWAY_DECAY_MULTIPLIER : 1
  // [dsh-piggy-claude-code mod] Asleep, only satiety keeps draining; mood and
  // cleanliness come back, and neglect turns into illness half as fast.
  const asleep = !away && isAsleep(state)

  // Settle whatever the pig was away doing before anything else, so its payout
  // lands in the right order relative to decay.
  if (state.activity !== null && nowMs >= state.activity.endsAt) finishActivity(state, nowMs)

  if (state.dead) return state

  /**
   * Time passing, with one floor: an activity may not empty a bar on its own.
   * A pig back from a day trip should be ravenous and filthy — a welcome-home
   * meal and bath — not sitting at zero before you can even react to it.
   * Going away never *raises* a bar either.
   */
  const drain = (value, perMinute) => {
    const next = value - minutes * perMinute * speed
    return away ? Math.max(next, Math.min(value, AWAY_FLOOR)) : next
  }
  state.satiety = clamp100(drain(state.satiety, SATIETY_DECAY_PER_MIN))
  if (asleep) {
    state.happiness = clamp100(state.happiness + minutes * SLEEP_RECOVERY_PER_MIN.happiness)
    state.cleanliness = clamp100(state.cleanliness + minutes * SLEEP_RECOVERY_PER_MIN.cleanliness)
  } else {
    // [mod] 佛系 (South & Southeast Asia complete): mood drains a quarter slower.
    state.happiness = clamp100(drain(state.happiness, HAPPINESS_DECAY_PER_MIN * (hasPerk(state, 'zen') ? 0.75 : 1)))
    state.cleanliness = clamp100(drain(state.cleanliness, CLEANLINESS_DECAY_PER_MIN))
  }

  // Illness only comes from being left at home. A pig that was out living its
  // life has not been neglected, and coming back sick every trip is not a game.
  if (away) {
    state.riskMinutes = 0
  } else {
    const neglected = state.satiety < THRESHOLDS.sickSatiety || state.cleanliness < THRESHOLDS.sickCleanliness
    const risk = minutes * (asleep ? SLEEP_SICK_RISK_MULTIPLIER : 1)
    state.riskMinutes = neglected ? (state.riskMinutes ?? 0) + risk : 0
    // [mod] 抗寒体质 (Oceania complete): neglect takes twice as long to make it ill.
    if (state.illness === null && state.riskMinutes >= SICK_RISK_MINUTES * (hasPerk(state, 'hardy') ? 2 : 1)) {
      state.riskMinutes = 0
      catchIllness(state, nowMs)
    }
  }

  // Illness advances on accumulated *effective* time, not wall clock: being out
  // and about while ill runs it at SICK_AWAY_MULTIPLIER, so a day of work costs
  // two days of illness and staying home is the cheap way to wait it out.
  if (state.illness !== null) {
    const rate = away ? SICK_AWAY_MULTIPLIER : 1
    const gained = elapsedMs * rate
    state.illness.progressMs = (state.illness.progressMs ?? 0) + gained
    let guard = 0
    while (state.illness !== null && guard < 16) {
      // Each stage has its own length, so it has to be re-read after every step.
      const stageMs = illnessStageMs(state.illness.stage)
      if (state.illness.progressMs < stageMs) break
      // Carry the excess into the next stage rather than dropping it.
      const carried = state.illness.progressMs - stageMs
      advanceIllness(state, nowMs)
      if (state.illness !== null) state.illness.progressMs = carried
      guard += 1
    }
  }

  // [dsh-piggy-claude-code mod] Weight does the growing, and nothing dies of
  // old age; this only announces a pig that has eaten its way up a stage.
  if (state.dead !== true && state.hatched === true) {
    const stage = lifeStageFor(state, nowMs)
    if (state.stage !== stage.key) {
      // A save from the age-based rules can name a later stage than its weight
      // has reached; re-rank it quietly instead of announcing a step backwards.
      const rank = key => LIFE_STAGES.findIndex(candidate => candidate.key === key)
      const grewUp = rank(stage.key) > rank(state.stage)
      state.stage = stage.key
      if (grewUp) {
        const params = { name: state.name, stage: word(state, stage.label), emoji: stage.emoji }
        remember(state, say(state, '长成了{stage} {emoji}', params), nowMs)
        announce(state, 'stage', say(state, '{name} 长成了{stage} {emoji}', params))
      }
    }
  }

  return state
}

function finishActivity(state, nowMs) {
  const activity = state.activity
  state.activity = null
  if (activity === null) return
  state.lastActiveAt = nowMs
  if (activity.kind === 'work') finishWork(state, activity, nowMs)
  else if (activity.kind === 'study') finishStudy(state, activity, nowMs)
  else if (activity.kind === 'trip') finishTrip(state, activity, nowMs)
  else if (activity.kind === 'gym') finishGym(state, activity, nowMs)
}

/**
 * [Q0016] Home from the gym: lighter, never below the floor. The stage keeps
 * the heaviest weight (peakWeightG), so it is noted before anything comes off.
 * Crossing GYM.muscleKg lost in all unlocks the muscle look and puts it on.
 */
function finishGym(state, activity, nowMs) {
  const entry = gymClassByKey(activity.key)
  if (entry === null) return
  state.peakWeightG = stageWeightG(state)
  const lost = Math.max(0, Math.min(entry.lossG, state.weightG - GYM.floorKg * 1000))
  const muscle = wearableByKey('muscle')
  const hadMuscle = wearUnlocked(state, muscle)
  state.weightG -= lost
  state.satiety = clamp100(state.satiety + entry.satiety)
  state.cleanliness = clamp100(state.cleanliness + entry.cleanliness)
  state.happiness = clamp100(state.happiness + entry.happiness)
  state.stats.gyms += 1
  state.stats.gymLostG += lost
  const kg = (lost / 1000).toFixed(1)
  const weight = formatWeight(state.weightG)
  remember(state, say(state, '{emoji} {gym}回来，瘦了 {kg} kg，现在 {weight}', { emoji: entry.emoji, gym: word(state, entry.label), kg, weight }), nowMs)
  announce(state, 'gym', lost > 0
    ? say(state, '{name} 健身回来了！瘦了 {kg} kg 💦', { name: state.name, kg })
    : say(state, '{name} 健身回来了，已经瘦到底了 💦', { name: state.name }))
  if (!hadMuscle && wearUnlocked(state, muscle)) {
    wear(state, muscle.key, true, nowMs)
    remember(state, say(state, '💪 在健身房一共瘦了 {kg} kg，练出了一身肌肉！', { kg: GYM.muscleKg }), nowMs)
    announce(state, 'muscle', say(state, '{name} 练成了肌肉猪！💪', { name: state.name }))
  }
}

function finishWork(state, activity, nowMs) {
  const job = jobByKey(activity.key)
  if (job === null) return
  // A sick pig still goes to work — that is the way out of the sick-and-broke
  // deadlock — but it works at half speed, so being ill costs money rather than
  // being an outright wall.
  const sick = state.illness !== null
  // Trait bonus first, then the sick penalty: going to school should still be
  // worth it while the pig is under the weather.
  const points = state.traits?.[job.trait] ?? 0
  // [mod] a gig's pay is a roll; the trait bonus still multiplies it.
  const base = job.random === null ? job.coins : rollPay(job.random, () => nextRandom(state))
  // [mod] 土豪 (Middle East & Africa complete): +15% pay.
  const withTrait = base * traitBonus(job.trait, points).pay * (hasPerk(state, 'tycoon') ? 1.15 : 1) * coopBonus(activity)
  const coins = sick ? Math.max(1, Math.round(withTrait * SICK_PAY_MULTIPLIER)) : Math.round(withTrait)
  state.coins += coins
  state.satiety = clamp100(state.satiety + job.satiety)
  state.cleanliness = clamp100(state.cleanliness + job.cleanliness)
  state.stats.jobs += 1
  state.stats.coinsEarned += coins
  applyEffects(state, { xp: Math.round(job.xp * coopBonus(activity)) }, nowMs)
  const tag = sick
    ? say(state, '（带病上工，只有一半）')
    : (points > 0 ? say(state, '（{trait} {points}）', { trait: word(state, TRAITS[job.trait].label), points }) : '')
  remember(state, say(state, '{emoji} {job}回来，赚了 {coins} 猪币{tag}', {
    emoji: job.emoji, job: word(state, job.label), coins, tag,
  }), nowMs)
  announce(state, 'work', sick
    ? say(state, '{name} 带病打工回来了，只赚到 {coins} 猪币 🤒', { name: state.name, coins })
    : say(state, '{name} 打工回来了！赚到 {coins} 猪币 💰', { name: state.name, coins }))
}

/** [ST0014] The pay multiplier of an outing: COOP.bonus when it was a pig pen one. */
const coopBonus = activity => (Number.isFinite(activity?.coop?.bonus) && activity.coop.bonus > 1 ? activity.coop.bonus : 1)

/** [mod] A whole number of coins in [min, max]. */
function rollPay([min, max], random) {
  return min + Math.floor(random() * (max - min + 1))
}

function finishStudy(state, activity, nowMs) {
  const stage = schoolStageByKey(activity.stage)
  const subjects = studyKeys(activity).map(subjectByKey).filter(Boolean)
  if (stage === null || subjects.length === 0) return
  const diploma = DIPLOMAS.find(entry => entry.stage === stage.key) ?? null
  const diplomasBefore = diploma === null ? 0 : diplomaCount(diploma, state.lessonsByStage?.[stage.key] ?? 0)
  state.traits = { ...(state.traits ?? {}) }
  state.courses = { ...(state.courses ?? {}) }
  state.lessonsByStage = { ...(state.lessonsByStage ?? {}) }
  state.stageCourses = { ...(state.stageCourses ?? {}), [stage.key]: { ...(state.stageCourses?.[stage.key] ?? {}) } }
  // [mod] several subjects in one sitting: each pays out, each is tiring.
  // [ST0014] together: more points on average, the fraction rolled.
  const gainFor = () => {
    const bonus = coopBonus(activity)
    if (bonus === 1) return stage.gain
    const extra = stage.gain * (bonus - 1)
    return stage.gain + Math.floor(extra) + (nextRandom(state) < extra - Math.floor(extra) ? 1 : 0)
  }
  const gained = {}
  for (const subject of subjects) {
    const gain = gainFor()
    gained[subject.trait] = (gained[subject.trait] ?? 0) + gain
    state.traits[subject.trait] = (state.traits[subject.trait] ?? 0) + gain
    state.courses[subject.key] = (state.courses[subject.key] ?? 0) + 1
    state.stageCourses[stage.key][subject.key] = (state.stageCourses[stage.key][subject.key] ?? 0) + 1
    // Counted per stage, because that is what unlocks the next school.
    state.lessonsByStage[stage.key] = (state.lessonsByStage[stage.key] ?? 0) + 1
    state.stats.courses += 1
    state.stats.lessons += 1
  }
  state.satiety = clamp100(state.satiety + stage.satiety * subjects.length)
  state.happiness = clamp100(state.happiness + stage.happiness * subjects.length)
  applyEffects(state, { xp: Math.round(stage.xp * subjects.length * coopBonus(activity)) }, nowMs)
  const traits = [...new Set(subjects.map(subject => subject.trait))]
    .map(trait => say(state, '{trait} +{gain}', {
      trait: word(state, TRAITS[trait].label),
      gain: gained[trait],
    }))
    .join(word(state, '，'))
  const params = { name: state.name, emoji: activity.emoji, lesson: lessonLabel(langOf(state), stage.key, subjects.map(s => s.key)), gains: traits }
  remember(state, say(state, '{emoji} 上完{lesson}，{gains}', params), nowMs)
  announce(state, 'study', say(state, '{name} 学完{lesson}，{gains} 📚', params))

  // [mod] the thesis defence: every 博士 subject once, paid a single time.
  const thesis = stage.key === 'doctor' && state.doctorDone !== true && (state.lessonsByStage.doctor ?? 0) >= DOCTOR_GRADUATION.lessons
  if (thesis) {
    state.doctorDone = true
    for (const [trait, points] of Object.entries(DOCTOR_GRADUATION.traits)) state.traits[trait] = (state.traits[trait] ?? 0) + points
    remember(state, say(state, '🎓 博士答辩通过！三项属性各 +1'), nowMs)
    announce(state, 'doctor', say(state, '{name} 博士毕业了！🎓 以后请叫它「{name} 博士」', { name: state.name }))
  }

  // [mod] a diploma for the bag; the first doctorate is already announced above.
  const diplomasAfter = diploma === null ? 0 : diplomaCount(diploma, state.lessonsByStage[stage.key])
  if (diplomasAfter > diplomasBefore) {
    const params = { name: state.name, emoji: diploma.emoji, diploma: word(state, diploma.label), n: diplomasAfter }
    remember(state, say(state, diplomasAfter > 1 ? '{emoji} 又拿到一张{diploma}（第 {n} 张）' : '{emoji} 拿到了{diploma}', params), nowMs)
    if (!thesis) {
      announce(state, 'diploma', say(state, diplomasAfter > 1
        ? '{name} 又拿到一张{diploma} {emoji}（第 {n} 张）'
        : '{name} 毕业了，拿到{diploma} {emoji}', params))
    }
  }
}

/** [mod] Which passive perks the pig has earned by completing regions. */
export function perksOf(state) {
  const done = new Set(state?.regionsDone ?? [])
  return REGIONS.filter(region => done.has(region.key)).map(region => region.perk.key)
}
const hasPerk = (state, key) => perksOf(state).includes(key)

/** [mod] How many of a region's souvenirs the pig owns, and whether that is all of them. */
export function regionProgress(state, regionKey) {
  const all = regionSouvenirs(regionKey)
  const have = all.filter(souvenir => (state?.collected?.[souvenir.key] ?? 0) > 0).length
  return { have, total: all.length, done: have === all.length }
}

/** Pick a souvenir from `place`, favouring one the pig does not have yet. */
function pickSouvenir(state, place) {
  const missing = place.souvenirs.filter(s => (state.collected?.[s.key] ?? 0) === 0)
  if (missing.length > 0 && (missing.length === place.souvenirs.length || nextRandom(state) < FARE.newSouvenirBias)) {
    return missing[Math.floor(nextRandom(state) * missing.length)]
  }
  return place.souvenirs[Math.floor(nextRandom(state) * place.souvenirs.length)]
}

/** Ordinary shop consumables a trip can bring back, cheaper ones more often. */
const SHOP_LOOT = SHOP.filter(item => item.kind === 'food' || item.kind === 'bath')
function pickShopLoot(state) {
  const weights = SHOP_LOOT.map(item => 1 / Math.max(1, item.price))
  let roll = nextRandom(state) * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < SHOP_LOOT.length; i += 1) {
    roll -= weights[i]
    if (roll <= 0) return SHOP_LOOT[i]
  }
  return SHOP_LOOT[0]
}

function grantRegion(state, region, nowMs) {
  state.regionsDone = [...(state.regionsDone ?? []), region.key]
  state.traits = { ...(state.traits ?? {}) }
  for (const [trait, points] of Object.entries(region.bonus.traits ?? {})) state.traits[trait] = (state.traits[trait] ?? 0) + points
  if (region.bonus.weightG) state.weightG = Math.min(500_000, state.weightG + region.bonus.weightG)
  const params = { name: state.name, emoji: region.emoji, region: word(state, region.label), perk: word(state, region.perk.label), text: word(state, region.perk.text) }
  remember(state, say(state, '{emoji} 集齐了{region}的纪念品！解锁「{perk}」：{text}', params), nowMs)
  announce(state, 'region', say(state, '{name} 集齐了{region}！{emoji} 解锁「{perk}」', params))

  if (!state.worldDone && REGIONS.every(r => state.regionsDone.includes(r.key))) {
    state.worldDone = true
    for (const [trait, points] of Object.entries(WORLD_BONUS.traits)) state.traits[trait] = (state.traits[trait] ?? 0) + points
    const world = { name: state.name, emoji: WORLD_BONUS.emoji, title: word(state, WORLD_BONUS.label) }
    remember(state, say(state, '{emoji} 成为「{title}」！三项属性各 +3', world), nowMs)
    announce(state, 'world', say(state, '{name} 走遍了全世界，成为「{title}」{emoji}', world))
  }
}

function finishTrip(state, activity, nowMs) {
  const place = placeByKey(activity.key)
  if (place === null) return
  const region = REGIONS.find(r => r.key === place.region)

  const souvenir = pickSouvenir(state, place)
  const fresh = (state.collected?.[souvenir.key] ?? 0) === 0
  state.collected = { ...(state.collected ?? {}), [souvenir.key]: (state.collected?.[souvenir.key] ?? 0) + 1 }

  // A consumable or two: the place's own specialty, or something from the shop.
  const loot = []
  const rolls = activity.zones >= FARE.secondRollFromZones ? 2 : 1
  for (let i = 0; i < rolls; i += 1) {
    if (nextRandom(state) >= FARE.lootChance) continue
    const item = nextRandom(state) < FARE.specialtyShare ? specialtyByKey(place.specialty) : pickShopLoot(state)
    if (item === null) continue
    loot.push(item.key)
    state.inventory = { ...(state.inventory ?? {}), [item.key]: (state.inventory?.[item.key] ?? 0) + 1 }
  }

  // [mod] 博物馆通票 (Europe complete): half as much joy again from every trip.
  const joy = Math.round((activity.happiness || 0) * (hasPerk(state, 'museum') ? 1.5 : 1) * coopBonus(activity))
  state.happiness = clamp100(state.happiness + joy)
  state.satiety = clamp100(state.satiety + (activity.satiety || 0))
  state.stats.trips += 1
  applyEffects(state, { xp: Math.round((activity.xp || 0) * coopBonus(activity)) }, nowMs)

  const lootText = loot.length === 0 ? '' : say(state, '，还带回了 {items}', {
    items: loot.map(key => { const item = itemByKey(key); return `${item.emoji}${word(state, item.label)}` }).join(word(state, '、')),
  })
  const params = {
    name: state.name, emoji: place.emoji, trip: word(state, place.label),
    souvenir: `${souvenir.emoji}${word(state, souvenir.label)}`, isNew: fresh ? say(state, '（新！）') : '', loot: lootText,
  }
  remember(state, say(state, '{emoji} {trip}回来，带回「{souvenir}」{isNew}{loot}', params), nowMs)
  announce(state, 'trip', say(state, '{name} 从{trip}回来了，带回「{souvenir}」{isNew}🧳{loot}', params))

  let regionDone = null
  if (region !== undefined && !state.regionsDone.includes(region.key) && regionProgress(state, region.key).done) {
    grantRegion(state, region, nowMs)
    regionDone = region.key
  }
  state.lastTrip = { place: place.key, souvenir: souvenir.key, fresh, loot, regionDone, at: nowMs }
}

function catchIllness(state, nowMs) {
  const chain = (state.stats.illnesses ?? 0) % ILLNESS_CHAINS.length
  state.illness = { chain, stage: 1, since: nowMs, progressMs: 0 }
  state.health = STAGE_HEALTH[0]
  state.stats.illnesses = (state.stats.illnesses ?? 0) + 1
  const ill = illnessAt(chain, 1)
  if (ill !== null) {
    const params = { name: state.name, ill: word(state, ill.name), cure: word(state, ill.cure) }
    remember(state, say(state, '得了{ill} 🤒', params), nowMs)
    announce(state, 'sick', say(state, '{name} 得了{ill}，需要{cure} 🤒', params))
  }
}

function advanceIllness(state, nowMs) {
  const chain = state.illness.chain
  const stage = state.illness.stage
  const worse = nextIllness(chain, stage)

  // Before it gets worse, it might just get better. An untreated cold shakes
  // itself off fairly often; the last stage never does.
  const healChance = SELF_HEAL_CHANCE[stage - 1] ?? 0
  if (healChance > 0 && nextRandom(state) < healChance) {
    state.illness = null
    state.health = Math.min(MAX.health, state.health + 1)
    remember(state, say(state, '自己好了，扛过去了 💚'), nowMs)
    announce(state, 'cured', say(state, '{name} 的{ill}自己好了 💚', {
      name: state.name, ill: word(state, ILLNESS_CHAINS[chain].name),
    }))
    return
  }

  if (worse === null) {
    die(state, nowMs, '没能撑过去')
    return
  }

  state.illness = { chain, stage: stage + 1, since: nowMs, progressMs: 0 }
  state.health = STAGE_HEALTH[stage]
  const params = { name: state.name, ill: word(state, worse.name), cure: word(state, worse.cure) }
  remember(state, say(state, '病情加重：{ill}', params), nowMs)
  announce(state, 'worse', say(state, '{name} 的病情加重了：{ill}，需要{cure}', params))
}

// ---------------------------------------------------------------------------
// Effects and level crossings
// ---------------------------------------------------------------------------

/**
 * [dsh-piggy-claude-code mod] Weight comes from food actually eaten: each point
 * of satiety gained adds a fixed number of grams (fewer once elderly, fewer
 * still past 120 kg). Topping up a full pig adds nothing, so spamming events
 * or snacks cannot inflate it;
 * the old per-event `weightG` effects are no longer applied.
 */
function growFromFood(state, satietyGained) {
  if (!(satietyGained > 0) || state.hatched !== true) return
  const perPoint = state.weightG >= GROWTH.bigKg * 1000 ? GROWTH.gramsPerSatietyHeavy
    : state.weightG >= GROWTH.elderKg * 1000 ? GROWTH.gramsPerSatietyElder
      : GROWTH.gramsPerSatiety
  // [mod] 干饭王 (China complete): food sticks a little better.
  const foodie = hasPerk(state, 'foodie') ? 1.1 : 1
  state.weightG = Math.min(500_000, state.weightG + satietyGained * perPoint * foodie)
}

function applyEffects(state, effects, nowMs) {
  if (effects.xp) state.xp += effects.xp
  if (effects.satiety) {
    const before = state.satiety
    state.satiety = clamp100(state.satiety + effects.satiety)
    growFromFood(state, state.satiety - before)
  }
  if (effects.happiness) state.happiness = clamp100(state.happiness + effects.happiness)
  if (effects.cleanliness) state.cleanliness = clamp100(state.cleanliness + effects.cleanliness)
  if (effects.health) state.health = clamp(Math.round(state.health + effects.health), 0, MAX.health)
  state.lastActiveAt = nowMs
}

// ---------------------------------------------------------------------------
// Passive diet
// ---------------------------------------------------------------------------

export function feed(state, event, nowMs) {
  const diet = DIET[event]
  if (diet === undefined) return []
  decay(state, nowMs)
  if (state.dead) return []
  switch (event) {
    case 'message': state.stats.messages += 1; break
    case 'turn': state.stats.turns += 1; break
    case 'tool': state.stats.tools += 1; break
    case 'toolError': state.stats.toolErrors += 1; break
    case 'agentError': state.stats.agentErrors += 1; break
    default: break
  }
  return applyEffects(state, diet, nowMs)
}

// ---------------------------------------------------------------------------
// Care actions
// ---------------------------------------------------------------------------

export function actionCooldownSeconds(state, action, nowMs) {
  const spec = ACTIONS[action]
  if (spec === undefined || spec.cooldownMs <= 0) return 0
  const last = state.cooldowns?.[action] ?? 0
  const remaining = spec.cooldownMs - (nowMs - last)
  return remaining <= 0 ? 0 : Math.ceil(remaining / 1000)
}

export const actionReady = (state, action, nowMs) => actionCooldownSeconds(state, action, nowMs) === 0

export function act(state, action, nowMs, itemKey) {
  const spec = ACTIONS[action]
  if (spec === undefined) return { ok: false, reason: 'unknown' }
  if (state === null) return { ok: false, reason: 'absent' }
  decay(state, nowMs)
  if (state.dead) return { ok: false, reason: 'dead' }
  if (state.activity !== null && action !== 'pet') return { ok: false, reason: 'away' }

  const wait = actionCooldownSeconds(state, action, nowMs)
  if (wait > 0) return { ok: false, reason: 'cooldown', wait }

  // Feeding, washing and playing each spend something off their own shelf —
  // QQ Pet keeps food, sundries and medicine in separate inventory categories
  // for exactly this reason. Petting is affection, and costs nothing.
  const shelf = CARE_KIND[action]
  let item = null
  if (shelf !== undefined) {
    item = resolveCareItem(state, shelf, itemKey)
    if (item === null) return { ok: false, reason: 'no-item', kind: shelf }
    if (item.default !== true) {
      const left = (state.inventory?.[item.key] ?? 0) - 1
      state.inventory = { ...(state.inventory ?? {}) }
      if (left > 0) state.inventory[item.key] = left
      else delete state.inventory[item.key]
    }
  }

  // [mod] Caring for a sleeping pig wakes it up first.
  if (isAsleep(state)) rouse(state, nowMs, '被叫醒了 🥱')
  state.cooldowns = { ...(state.cooldowns ?? {}), [action]: nowMs }
  if (action === 'feed') { state.stats.feeds += 1; state.lastFedAt = nowMs }
  else if (action === 'bathe') state.stats.baths += 1
  else if (action === 'play') state.stats.plays += 1
  else if (action === 'pet') state.stats.pets += 1

  applyEffects(state, careEffects(item, spec), nowMs)
  remember(state, item === null
    ? say(state, spec.verb)
    : say(state, '{emoji} {action}用了「{item}」', { emoji: item.emoji, action: word(state, spec.label), item: word(state, item.label) }), nowMs)
  return { ok: true, item: item === null ? null : item.key, spent: item !== null && item.default !== true }
}

/**
 * The item an action will spend: the caller's pick when it is actually in the
 * bag, otherwise the cheapest thing the pig owns. The free default toy makes
 * `play` always available.
 */
function resolveCareItem(state, kind, wanted) {
  const usable = careItems(kind).filter(
    item => item.default === true || (state.inventory?.[item.key] ?? 0) > 0,
  )
  if (usable.length === 0) return null
  if (wanted === undefined || wanted === null || wanted === '') return usable[0]
  return usable.find(item => item.key === wanted) ?? null
}

/**
 * Blend an item's own effects with the action's baseline. The item decides how
 * far its own bar moves; the action keeps whatever the item does not mention.
 */
function careEffects(item, spec) {
  if (item === null) return spec
  return {
    xp: spec.xp,
    weightG: item.satiety !== undefined && spec.key === 'feed' ? spec.weightG : 0,
    satiety: item.satiety ?? spec.satiety,
    happiness: item.happiness ?? spec.happiness,
    cleanliness: item.cleanliness ?? spec.cleanliness,
  }
}

/** What each care action could be done with right now, and how many are left. */
export function careOptions(state, action) {
  const kind = CARE_KIND[action]
  if (kind === undefined) return []
  return careItems(kind)
    .filter(item => item.default === true || (state.inventory?.[item.key] ?? 0) > 0)
    .map(item => ({
      key: item.key,
      label: item.label,
      emoji: item.emoji,
      price: item.price,
      default: item.default === true,
      count: item.default === true ? null : (state.inventory?.[item.key] ?? 0),
      satiety: item.satiety ?? 0,
      happiness: item.happiness ?? 0,
      cleanliness: item.cleanliness ?? 0,
    }))
}

// ---------------------------------------------------------------------------
// [dsh-piggy-claude-code mod] Sleep
//
// The pig sleeps when put to bed, or when the computer itself goes to sleep.
// What sleeping does to the bars lives in decay(); this is only getting in and
// out of bed.
// ---------------------------------------------------------------------------

export function isAsleep(state) {
  return state !== null && state !== undefined && state.sleep !== null && state.sleep !== undefined
}

/**
 * Put the pig to bed. `auto` marks a nap the computer's own sleep started:
 * only those end when the computer wakes up, so a pig put to bed by hand
 * sleeps on until somebody wakes it.
 */
export function goToSleep(state, nowMs, { auto = false } = {}) {
  if (state === null || state.hatched !== true) return { ok: false, reason: 'absent' }
  decay(state, nowMs)
  if (state.dead) return { ok: false, reason: 'dead' }
  if (state.activity !== null) return { ok: false, reason: 'away' }
  if (isAsleep(state)) return { ok: false, reason: 'asleep' }
  state.sleep = { since: nowMs, auto: auto === true }
  remember(state, say(state, auto === true ? '电脑休眠了，跟着睡着了 😴' : '去睡觉了 😴'), nowMs)
  return { ok: true }
}

/**
 * Wake the pig. With `auto` (the computer waking up) only a nap the computer
 * started ends; a pig put to bed by hand answers `manual` and sleeps on.
 */
export function wakeUp(state, nowMs, { auto = false } = {}) {
  if (state === null) return { ok: false, reason: 'absent' }
  // Settle the night first, so the time asleep is counted as sleep.
  decay(state, nowMs)
  if (!isAsleep(state)) return { ok: false, reason: 'awake' }
  if (auto === true && state.sleep.auto !== true) return { ok: false, reason: 'manual' }
  rouse(state, nowMs, '睡醒了 ☀️')
  return { ok: true }
}

/** Out of bed. Counts as activity, so it does not drop straight into dozing. */
function rouse(state, nowMs, line) {
  state.sleep = null
  state.lastActiveAt = nowMs
  remember(state, say(state, line), nowMs)
}

// ---------------------------------------------------------------------------
// Activities: work · study · trip
// ---------------------------------------------------------------------------

/**
 * Health at or below which the pig is too weak to leave the house. The scale is
 * 5 = full, and the four illness stages set it to 4/3/2/1, so 1 is the last
 * stage before it dies.
 */
const TOO_WEAK_HEALTH = 1

/**
 * Why the pig cannot head out right now, or null when it can.
 *
 * Illness used to block this outright, which deadlocked the whole game:
 * sick → cannot work → no coins → cannot buy medicine → still sick, and the
 * only way out was to wait to die. A pig that can still stand up can go and
 * earn its own prescription; only one at death's door has to stay in bed.
 */
export function awayBlockedReason(state) {
  if (state === null) return 'absent'
  if (state.dead) return 'dead'
  if (state.activity !== null) return 'away'
  if (state.health <= TOO_WEAK_HEALTH) return 'weak'
  return null
}

/** Whether the pig is free to go out. */
export function canStartActivity(state) {
  return awayBlockedReason(state) === null
}

/** Back-compat alias. */
export const canWork = canStartActivity

/** Start the named activity. Returns `{ ok, activity }` or `{ ok:false, reason }`. */
function begin(state, activity, nowMs) {
  decay(state, nowMs)
  const blocked = awayBlockedReason(state)
  if (blocked !== null) return { ok: false, reason: blocked }
  // [mod] Sent out while asleep: it gets up and goes.
  if (isAsleep(state)) rouse(state, nowMs, '被叫醒了 🥱')
  state.activity = { ...activity, startedAt: nowMs, endsAt: nowMs + activity.minutes * 60000 }
  state.lastActiveAt = nowMs
  return { ok: true, activity: state.activity }
}

export function startWork(state, jobKey, nowMs) {
  const job = jobByKey(jobKey)
  if (job === null) return { ok: false, reason: 'unknown' }
  if (state.dead) return { ok: false, reason: 'dead' }
  if (state.activity !== null) return { ok: false, reason: 'away' }
  if (state.health <= TOO_WEAK_HEALTH) return { ok: false, reason: 'weak' }
  // [mod] a career needs trait points first.
  const missing = jobMissing(job, state.traits)
  if (missing.length > 0) return { ok: false, reason: 'job-locked', missing }
  if (state.satiety < 15) return { ok: false, reason: 'hungry' }
  // The pig's trait shortens the shift; the pay bonus is applied on the way out.
  // A fixed-length gig keeps its fifteen minutes.
  const points = state.traits?.[job.trait] ?? 0
  const bonus = traitBonus(job.trait, points)
  const minutes = job.fixed ? job.minutes : Math.max(1, Math.round(job.minutes * bonus.minutes))
  const result = begin(state, {
    kind: 'work', key: job.key, label: job.label, emoji: job.emoji, minutes, cost: 0,
    trait: job.trait ?? null,
  }, nowMs)
  if (result.ok) {
    const saved = job.minutes - minutes
    const note = saved > 0
      ? say(state, '（{trait} {points}，省了 {minutes} 分钟）', { trait: word(state, TRAITS[job.trait].label), points, minutes: saved })
      : ''
    remember(state, say(state, '{emoji} 出门{job}去了{saved}', { emoji: job.emoji, job: word(state, job.label), saved: note }), nowMs)
  }
  return result
}

/**
 * Enrol in one sitting. [mod] `subjectKeys` may be one key or a list: up to two
 * subjects at 大学, three from 研究生 on (PARALLEL_COURSES). Each subject pays its
 * own tuition; the sitting lasts as long as a single lesson. At a stage with a
 * `cap`, a subject already taken that many times there is refused.
 */
export function startStudy(state, subjectKeys, stageKey, nowMs) {
  const keys = [...new Set((Array.isArray(subjectKeys) ? subjectKeys : [subjectKeys]).filter(Boolean))]
  const subjects = keys.map(subjectByKey)
  const stage = schoolStageByKey(stageKey)
  if (subjects.length === 0 || subjects.some(subject => subject === null) || stage === null) return { ok: false, reason: 'unknown' }
  if (state.dead) return { ok: false, reason: 'dead' }
  if (state.activity !== null) return { ok: false, reason: 'away' }
  if (state.health <= TOO_WEAK_HEALTH) return { ok: false, reason: 'weak' }
  // The stage ladder: 小学 first, then every subject once before 大学 opens.
  if (!stageUnlocked(stage, state.lessonsByStage)) {
    return { ok: false, reason: 'locked', need: stageProgress(stage, state.lessonsByStage) }
  }
  const most = PARALLEL_COURSES[stage.key] ?? 1
  if (subjects.length > most) return { ok: false, reason: 'too-many', max: most }
  // [mod] 小学 / 大学 are cheap but capped per subject; the pig is told which are used up.
  if (stage.cap !== null) {
    const full = subjects.filter(subject => stageLessons(state, stage.key, subject.key) >= stage.cap)
    if (full.length > 0) return { ok: false, reason: 'capped', max: stage.cap, full: full.map(subject => subject.key) }
  }
  const tuition = stage.tuition * subjects.length
  if (state.coins < tuition) return { ok: false, reason: 'poor', price: tuition }
  if (state.satiety < 15) return { ok: false, reason: 'hungry' }

  // [mod] 卷王 (East Asia complete): lessons take a fifth less time.
  const minutes = Math.max(1, Math.round(stage.minutes * (hasPerk(state, 'grinder') ? 0.8 : 1)))
  state.coins -= tuition
  const result = begin(state, {
    kind: 'study', key: subjects[0].key, keys: subjects.map(subject => subject.key), stage: stage.key,
    label: `${stage.label}${subjects.map(subject => subject.label).join('+')}`,
    emoji: subjects.length === 1 ? subjects[0].emoji : '📚',
    minutes, cost: tuition,
  }, nowMs)
  if (!result.ok) {
    state.coins += tuition // refund if the pig turned out to be unavailable
    return result
  }
  remember(state, say(state, '{emoji} 去上{lesson}（学费 {tuition}）', {
    emoji: result.activity.emoji, lesson: lessonLabel(langOf(state), stage.key, subjects.map(s => s.key)), tuition,
  }), nowMs)
  return result
}

/**
 * [Q0016] Go to the gym for one class. Paid up front like tuition, and handed
 * back if the pig turns out to be busy or is called home early. A pig already
 * down at GYM.floorKg is turned away (`too-light`).
 */
export function startGym(state, classKey, nowMs) {
  const entry = gymClassByKey(classKey)
  if (entry === null) return { ok: false, reason: 'unknown' }
  if (state.hatched !== true) return { ok: false, reason: 'unhatched' }
  if (state.dead) return { ok: false, reason: 'dead' }
  if (state.activity !== null) return { ok: false, reason: 'away' }
  if (state.health <= TOO_WEAK_HEALTH) return { ok: false, reason: 'weak' }
  if (state.weightG <= GYM.floorKg * 1000) return { ok: false, reason: 'too-light' }
  if (state.coins < entry.price) return { ok: false, reason: 'poor', price: entry.price }
  if (state.satiety < 15) return { ok: false, reason: 'hungry' }

  state.coins -= entry.price
  const result = begin(state, {
    kind: 'gym', key: entry.key, label: entry.label, emoji: entry.emoji, minutes: entry.minutes, cost: entry.price,
  }, nowMs)
  if (!result.ok) {
    state.coins += entry.price
    return result
  }
  remember(state, say(state, '{emoji} 去健身房{gym}（{price} 猪币）', { emoji: entry.emoji, gym: word(state, entry.label), price: entry.price }), nowMs)
  return result
}

/**
 * [mod] What a trip to `placeKey` costs from `homeUtc` for this pig, perks
 * included: 100 coins + 200 per time zone, 1 h + 1 h per time zone.
 */
export function tripQuote(state, placeKey, homeUtc = systemUtcOffset()) {
  const place = placeByKey(placeKey)
  if (place === null) return null
  const fare = fareFor(place, homeUtc)
  // 常旅客 (Americas complete): a fifth off every ticket.
  const cost = Math.round(fare.cost * (hasPerk(state, 'flyer') ? 0.8 : 1))
  return { ...fare, cost }
}

export function startTrip(state, placeKey, nowMs, homeUtc = systemUtcOffset()) {
  const place = placeByKey(placeKey)
  if (place === null) return { ok: false, reason: 'unknown' }
  if (state.dead) return { ok: false, reason: 'dead' }
  if (state.activity !== null) return { ok: false, reason: 'away' }
  if (state.health <= TOO_WEAK_HEALTH) return { ok: false, reason: 'weak' }
  const quote = tripQuote(state, place.key, homeUtc)
  if (state.coins < quote.cost) return { ok: false, reason: 'poor', price: quote.cost }
  if (state.satiety < 15) return { ok: false, reason: 'hungry' }

  state.coins -= quote.cost
  const result = begin(state, {
    kind: 'trip', key: place.key, label: place.label, emoji: place.emoji,
    minutes: quote.minutes, cost: quote.cost,
    zones: quote.zones, happiness: quote.happiness, xp: quote.xp, satiety: quote.satiety,
  }, nowMs)
  if (!result.ok) {
    state.coins += quote.cost
    return result
  }
  remember(state, say(state, '{emoji} 出发去{trip}（花了 {cost} 猪币）', { emoji: place.emoji, trip: word(state, place.label), cost: quote.cost }), nowMs)
  return result
}

/**
 * [ST0014] Head out together with a pig from the pen: the ordinary start
 * (same checks, same costs — each pig must qualify on its own), then 30%
 * faster and marked as a pen outing, which pays 30% more when it settles.
 * Only the server issues this, for both pigs at once, when an invite is
 * accepted. `args` are what the ordinary op takes.
 */
export function startTogether(state, kind, args, coop, nowMs, homeUtc = systemUtcOffset()) {
  if (!COOP.kinds.includes(kind)) return { ok: false, reason: 'unknown' }
  const list = Array.isArray(args) ? args : []
  const result = kind === 'work' ? startWork(state, list[0], nowMs)
    : kind === 'study' ? startStudy(state, list[0], list[1], nowMs)
    : startTrip(state, list[0], nowMs, homeUtc)
  if (!result.ok) return result
  const activity = state.activity
  activity.endsAt = activity.startedAt + Math.max(60_000, Math.round((activity.endsAt - activity.startedAt) / COOP.speed))
  activity.coop = {
    id: typeof coop?.id === 'string' ? coop.id.slice(0, 64) : '',
    partner: typeof coop?.partner === 'string' ? coop.partner.slice(0, 32) : '',
    bonus: COOP.bonus,
  }
  remember(state, say(state, '🤝 和{partner}一起出发，快 30%、收获多 30%', { partner: activity.coop.partner }), nowMs)
  return { ok: true, activity }
}

/** Seconds left on the current activity (0 when idle). */
export function activitySecondsLeft(state, nowMs) {
  if (state.activity === null) return 0
  return Math.max(0, Math.ceil((state.activity.endsAt - nowMs) / 60000 * 60))
}

/** Back-compat alias. */
export const workSecondsLeft = activitySecondsLeft

/** Bring the pig home early. Work forfeits pay; study and trips are refunded. */
export function callOffActivity(state, nowMs) {
  if (state.activity === null) return { ok: false, reason: 'idle' }
  const activity = state.activity
  state.activity = null
  if (activity.kind !== 'work' && activity.cost > 0) {
    state.coins += activity.cost
    remember(state, say(state, '{emoji} 从{label}提前回来了，钱退回来了', { emoji: activity.emoji, label: activityLabel(activity, langOf(state)) }), nowMs)
    return { ok: true, refunded: activity.cost }
  }
  remember(state, say(state, '{emoji} 从{label}提前回来了，白跑一趟', { emoji: activity.emoji, label: activityLabel(activity, langOf(state)) }), nowMs)
  return { ok: true, refunded: 0 }
}

/** Back-compat alias. */
export const callOffWork = callOffActivity

// ---------------------------------------------------------------------------
// Shop and inventory
// ---------------------------------------------------------------------------

export function buy(state, itemKey, nowMs = Date.now()) {
  const wearable = wearableByKey(itemKey)
  if (wearable !== null) return buyWearable(state, wearable, nowMs)
  const item = itemByKey(itemKey)
  if (item === null) return { ok: false, reason: 'unknown' }
  // [mod] travel-only specialties never come from the shop.
  if (item.exclusive === true) return { ok: false, reason: 'not-for-sale' }
  if (state.dead && item.key !== REVIVE_ITEM.key) return { ok: false, reason: 'dead' }
  if (state.coins < item.price) return { ok: false, reason: 'poor', price: item.price }

  state.coins -= item.price
  state.inventory = { ...(state.inventory ?? {}) }
  state.inventory[item.key] = (state.inventory[item.key] ?? 0) + 1
  state.stats.purchases += 1
  remember(state, say(state, '买了 {emoji} {item}（-{price} 猪币）', { emoji: item.emoji, item: word(state, item.label), price: item.price }), nowMs)
  return { ok: true, item }
}

/**
 * [ST0012] A decoration off the 装扮 shelf: bought once, kept in the
 * wardrobe, and put straight on (taking off whatever was at that slot).
 */
function buyWearable(state, wearable, nowMs) {
  if (wearable.unlock.kind !== 'shop') return { ok: false, reason: 'not-for-sale' }
  const refusal = wearRefusal(state)
  if (refusal !== null) return { ok: false, reason: refusal }
  if (wearUnlocked(state, wearable)) return { ok: false, reason: 'owned' }
  const price = wearable.unlock.price
  if (state.coins < price) return { ok: false, reason: 'poor', price }

  state.coins -= price
  state.wardrobeBought = [...(state.wardrobeBought ?? []), wearable.key]
  state.stats.purchases += 1
  wear(state, wearable.key, true, nowMs)
  remember(state, say(state, '买了 {emoji} {item}（-{price} 猪币）', { emoji: wearable.emoji, item: word(state, wearable.label), price }), nowMs)
  return { ok: true, item: { key: wearable.key, label: wearable.label, emoji: wearable.emoji, price, kind: 'wear' } }
}

/** [dsh-piggy-claude-code mod] Seconds until the next scratch card may be bought. */
export function lotteryWaitSeconds(state, nowMs) {
  const last = state?.lastLotteryAt ?? 0
  if (!(last > 0)) return 0
  const remaining = LOTTERY.cooldownMinutes * 60000 - (nowMs - last)
  return remaining <= 0 ? 0 : Math.ceil(remaining / 1000)
}

/**
 * [mod] Buy a scratch card and scratch it on the spot. The pig does it itself,
 * so it has to be home; one card every ten minutes.
 * @returns {{ok:boolean, reason?:string, wait?:number, price?:number, prize?:{tier:string, coins:number, mood:string}}}
 */
export function scratchLottery(state, nowMs, random = () => nextRandom(state)) {
  if (state === null) return { ok: false, reason: 'absent' }
  decay(state, nowMs)
  if (state.dead) return { ok: false, reason: 'dead' }
  if (state.activity !== null) return { ok: false, reason: 'away' }
  const wait = lotteryWaitSeconds(state, nowMs)
  if (wait > 0) return { ok: false, reason: 'cooldown', wait }
  if (state.coins < LOTTERY.price) return { ok: false, reason: 'poor', price: LOTTERY.price }

  state.coins -= LOTTERY.price
  state.lastLotteryAt = nowMs
  const prize = lotteryPrize(random())
  state.coins += prize.coins
  state.happiness = clamp100(state.happiness + prize.happiness)
  state.stats.lotteries = (state.stats.lotteries ?? 0) + 1
  state.stats.lotteryWon = (state.stats.lotteryWon ?? 0) + prize.coins
  state.lastActiveAt = nowMs
  remember(state, prize.coins > 0
    ? say(state, '🎟️ 刮彩票中了{prize}，+{coins} 猪币', { prize: word(state, prize.label), coins: prize.coins })
    : say(state, '🎟️ 刮彩票：谢谢参与'), nowMs)
  return { ok: true, prize: { tier: prize.tier, coins: prize.coins, mood: prize.mood } }
}

// ---------------------------------------------------------------------------
// [ST0015] Blackjack: deal, hit, stand. The pig plays it at home; the bet goes
// on the table at the deal and the hand stays in the save until it is over.
// ---------------------------------------------------------------------------

/** The hand as the panel shows it (cards face up, total, bet). */
export function blackjackHand(hand) {
  const { total, soft } = blackjackTotal(hand.cards)
  return { bet: hand.bet, cards: hand.cards.map(blackjackCard), total, soft }
}

/** One card from what is left of this hand's deck. */
function drawCard(cards, random) {
  const left = []
  for (let card = 0; card < 52; card += 1) if (!cards.includes(card)) left.push(card)
  return left[Math.floor(random() * left.length)]
}

/** Pay the hand out (nothing when bust) and clear the table. */
function settleBlackjack(state, nowMs) {
  const hand = state.blackjack
  const shown = blackjackHand(hand)
  const outcome = shown.total > 21 ? 'bust' : shown.total === 21 ? 'jackpot' : 'win'
  const multiplier = outcome === 'bust' ? 0 : blackjackMultiplier(shown.total)
  const coins = Math.round(hand.bet * multiplier)
  state.coins += coins
  state.happiness = clamp100(state.happiness + BLACKJACK.happiness[outcome])
  state.stats.blackjacks = (state.stats.blackjacks ?? 0) + 1
  state.stats.blackjackWon = (state.stats.blackjackWon ?? 0) + coins
  state.blackjack = null
  state.lastActiveAt = nowMs
  const vars = { total: shown.total, coins, bet: hand.bet }
  remember(state, outcome === 'jackpot'
    ? say(state, '🃏 21 点正好 21！+{coins} 猪币', vars)
    : outcome === 'win'
      ? say(state, '🃏 21 点停在 {total} 点，+{coins} 猪币', vars)
      : say(state, '🃏 21 点爆了（{total} 点），输掉 {bet} 猪币', vars), nowMs)
  return { ok: true, round: { ...shown, done: true, outcome, multiplier, coins } }
}

/** Exactly 21 ends the hand at once; anything under it waits for the next move. */
function blackjackTurn(state, nowMs) {
  if (blackjackTotal(state.blackjack.cards).total >= 21) return settleBlackjack(state, nowMs)
  return { ok: true, round: { ...blackjackHand(state.blackjack), done: false } }
}

/**
 * Put `bet` on the table and deal two cards. A natural 21 is paid at once.
 * @returns {{ok:boolean, reason?:string, price?:number, round?:object}}
 */
export function dealBlackjack(state, bet, nowMs, random = () => nextRandom(state)) {
  if (state === null) return { ok: false, reason: 'absent' }
  decay(state, nowMs)
  if (state.dead) return { ok: false, reason: 'dead' }
  if (state.blackjack !== null) return { ok: false, reason: 'in-hand' }
  if (state.activity !== null) return { ok: false, reason: 'away' }
  if (!BLACKJACK.bets.includes(bet)) return { ok: false, reason: 'bad-bet' }
  if (state.coins < bet) return { ok: false, reason: 'poor', price: bet }

  state.coins -= bet
  const cards = []
  cards.push(drawCard(cards, random))
  cards.push(drawCard(cards, random))
  state.blackjack = { bet, cards }
  state.lastActiveAt = nowMs
  return blackjackTurn(state, nowMs)
}

/** Draw one more card; over 21 loses the bet, exactly 21 pays 10×. */
export function hitBlackjack(state, nowMs, random = () => nextRandom(state)) {
  if (state === null) return { ok: false, reason: 'absent' }
  decay(state, nowMs)
  if (state.blackjack === null) return { ok: false, reason: 'no-hand' }
  state.blackjack.cards = [...state.blackjack.cards, drawCard(state.blackjack.cards, random)]
  state.lastActiveAt = nowMs
  return blackjackTurn(state, nowMs)
}

/** Stop and get paid by the total; under `BLACKJACK.standAt` the pig must draw. */
export function standBlackjack(state, nowMs) {
  if (state === null) return { ok: false, reason: 'absent' }
  decay(state, nowMs)
  if (state.blackjack === null) return { ok: false, reason: 'no-hand' }
  if (blackjackTotal(state.blackjack.cards).total < BLACKJACK.standAt) return { ok: false, reason: 'too-low' }
  return settleBlackjack(state, nowMs)
}

export const canAfford = (state, itemKey) => {
  const item = itemByKey(itemKey)
  return item !== null && state.coins >= item.price
}

export function useItem(state, itemKey, nowMs) {
  const item = itemByKey(itemKey)
  if (item === null) return { ok: false, reason: 'unknown' }
  const have = state.inventory?.[itemKey] ?? 0
  if (have <= 0) return { ok: false, reason: 'empty' }
  decay(state, nowMs)

  if (item.key === REVIVE_ITEM.key) {
    if (!state.dead) return { ok: false, reason: 'not-dead' }
    state.inventory[itemKey] = have - 1
    revive(state, nowMs)
    return { ok: true, item }
  }
  if (state.dead) return { ok: false, reason: 'dead' }
  // [mod] a rename card is spent by renaming, not from the bag.
  if (item.kind === 'card') return { ok: false, reason: 'use-to-rename' }

  if (item.kind === 'medicine') {
    if (state.illness === null) return { ok: false, reason: 'not-sick' }
    const needed = medicineForStage(state.illness.stage)
    if (needed === null || needed.key !== item.key) {
      return { ok: false, reason: 'wrong-medicine', needs: needed }
    }
    state.inventory[itemKey] = have - 1
    state.illness = null
    state.health = MAX.health
    state.stats.cures = (state.stats.cures ?? 0) + 1
    const params = { name: state.name, emoji: item.emoji, item: word(state, item.label) }
    remember(state, say(state, '吃了 {emoji} {item}，病好了', params), nowMs)
    announce(state, 'cured', say(state, '{name} 吃了 {item}，痊愈了 💚', params))
    return { ok: true, item }
  }

  if (state.activity !== null) return { ok: false, reason: 'away' }
  state.inventory[itemKey] = have - 1
  applyEffects(state, item, nowMs)
  remember(state, say(state, '用了 {emoji} {item}', { emoji: item.emoji, item: word(state, item.label) }), nowMs)
  return { ok: true, item }
}

export function revive(state, nowMs) {
  state.dead = false
  state.diedAt = null
  state.health = MAX.health
  state.satiety = Math.max(state.satiety, 60)
  state.cleanliness = Math.max(state.cleanliness, 60)
  state.happiness = Math.max(state.happiness, 50)
  state.illness = null
  state.activity = null
  state.riskMinutes = 0
  state.stats.revives = (state.stats.revives ?? 0) + 1
  remember(state, say(state, '被 {item} 救了回来 ✨', { item: word(state, REVIVE_ITEM.label) }), nowMs)
  announce(state, 'revived', say(state, '{name} 回来了 ✨', { name: state.name }))
}

// ---------------------------------------------------------------------------
// Naming and mood
// ---------------------------------------------------------------------------

export function rename(state, rawName, nowMs) {
  const cleaned = String(rawName ?? '').replace(/\s+/g, ' ').trim()
  if (cleaned === '' || [...cleaned].length > 16) return null
  state.name = cleaned
  remember(state, say(state, '改名叫「{name}」', { name: cleaned }), nowMs)
  return cleaned
}

/** [mod] Is the pig still wearing a default name (in any language)? */
export const hasDefaultName = state => ['zh', 'ja', 'en'].some(code => tr(code, '猪猪') === state?.name)

/**
 * [mod] Name the pig. The first name is free while it still has a default
 * one; after that every rename spends a 更名卡 (1000 coins in the shop).
 * @returns {{ok:boolean, reason?:string, name?:string, usedCard?:boolean}}
 */
export function renamePig(state, rawName, nowMs) {
  if (state === null || state.hatched !== true) return { ok: false, reason: 'absent' }
  if (state.dead) return { ok: false, reason: 'dead' }
  const cleaned = String(rawName ?? '').replace(/\s+/g, ' ').trim()
  if (cleaned === '' || [...cleaned].length > 16) return { ok: false, reason: 'bad-name' }
  if (cleaned === state.name) return { ok: false, reason: 'same-name' }
  const free = hasDefaultName(state)
  if (!free && (state.inventory?.[RENAME_CARD.key] ?? 0) <= 0) return { ok: false, reason: 'need-card', price: RENAME_CARD.price }
  if (!free) state.inventory = { ...state.inventory, [RENAME_CARD.key]: state.inventory[RENAME_CARD.key] - 1 }
  rename(state, cleaned, nowMs)
  return { ok: true, name: cleaned, usedCard: !free }
}

const AWAY_MOODS = Object.freeze({
  work: { key: 'working', emoji: '💼', label: '在打工' },
  study: { key: 'studying', emoji: '📚', label: '在上课' },
  trip: { key: 'traveling', emoji: '🧳', label: '在旅行' },
  gym: { key: 'exercising', emoji: '🏋️', label: '在健身' },
})

export function mood(state, nowMs) {
  decay(state, nowMs)
  if (state.dead) return { key: 'dead', emoji: '💀', label: word(state, '已经走了'), level: 0 }
  // [mod] A sleeping pig looks asleep, even when ill; the panel still says so.
  if (isAsleep(state)) return { key: 'asleep', emoji: '😴', label: word(state, '在睡觉'), level: 0 }
  if (state.illness !== null) {
    const ill = currentIllness(state)
    const level = Math.min(3, Math.max(1, state.illness.stage ?? 1))
    return { key: 'sick', emoji: '🤒', label: ill === null ? word(state, '生病了') : say(state, '得了{ill}', { ill: word(state, ill.name) }), level }
  }
  if (state.activity !== null) {
    const base = AWAY_MOODS[state.activity.kind] ?? AWAY_MOODS.work
    return { ...base, label: word(state, base.label), emoji: state.activity.emoji || base.emoji, level: 0 }
  }
  if (state.satiety < THRESHOLDS.hungry) return { key: 'hungry', emoji: '🍎', label: word(state, '饿了'), level: moodLevel('hungry', state.satiety) }
  if (state.cleanliness < THRESHOLDS.dirty) return { key: 'dirty', emoji: '🫧', label: word(state, '该洗澡了'), level: moodLevel('dirty', state.cleanliness) }
  if (nowMs - state.lastActiveAt > SLEEPY_AFTER_MINUTES * 60000) return { key: 'sleepy', emoji: '💤', label: word(state, '在打盹'), level: 0 }
  if (state.happiness >= 75) return { key: 'happy', emoji: '❤️', label: word(state, '很开心'), level: 0 }
  if (state.happiness < THRESHOLDS.lonely) return { key: 'lonely', emoji: '🥺', label: word(state, '有点孤单'), level: moodLevel('lonely', state.happiness) }
  return { key: 'fine', emoji: '😊', label: word(state, '还不错'), level: 0 }
}

/** 1–3: how far below the mood's threshold the bar has fallen. */
function moodLevel(key, value) {
  const [worse, worst] = MOOD_LEVELS[key]
  return value < worst ? 3 : value < worse ? 2 : 1
}

export const healthPercent = state => Math.round((clamp(state.health, 0, MAX.health) / MAX.health) * 100)

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const canFeed = (state, nowMs) => actionReady(state, 'feed', nowMs)
export const feedCooldownSeconds = (state, nowMs) => actionCooldownSeconds(state, 'feed', nowMs)

export const formatWeight = weightG => `${(weightG / 1000).toFixed(1)} kg`

export function bar(value, width = 10) {
  const filled = Math.round((clamp100(value) / 100) * width)
  return `${'▓'.repeat(filled)}${'░'.repeat(width - filled)}`
}

export { JOBS, SHOP, MAX, THRESHOLDS, REVIVE_ITEM, SUBJECTS, SCHOOL_STAGES, TRIPS, TRAITS, TRAIT_ORDER }
export { LIFE_STAGES, GRAVE, SOUL, LIFESPAN_DAYS, SOUL_AFTER_DAYS }
export { DIET }
