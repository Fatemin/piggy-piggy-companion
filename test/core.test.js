/**
 * dsh-pig core tests — the whole game model is pure and timestamp-driven, so
 * every mechanic (growth, decay, work shifts, illness chains, shop, death) is
 * testable here without a timer or a wait.
 *
 * Run: node --test test/*.test.js
 */

import { PLACES, REGIONS, SOUVENIRS, SPECIALTIES, WORLD_BONUS, fareFor, zonesBetween } from '../world.js'
import { ALL_ITEMS, DIPLOMAS, GYM, GYM_CLASSES, PARALLEL_COURSES, RENAME_CARD, WEAR_FOR_SALE, diplomaCount, schoolStageByKey as schoolStage } from '../data.js'
import { diplomaView, outfitIsAuto, wardrobeView, wear, wearAuto, wornFor } from '../core.js'
import { setRandomForTests } from '../core.js'
import { applyOp } from '../ops.js'
import { hasDefaultName, perksOf, regionProgress, renamePig, tripQuote } from '../core.js'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  ACTIONS,
  ACTION_ORDER,
  JOBS,
  MAX,
  REVIVE_ITEM,
  SCHOOL_STAGES,
  SHOP,
  LIFE_STAGES,
  STATE_VERSION,
  SUBJECTS,
  THRESHOLDS,
  TRAITS,
  TRIPS,
  act,
  actionCooldownSeconds,
  actionReady,
  bar,
  buy,
  dailyBuysLeft,
  callOffActivity,
  callOffWork,
  canWork,
  courseView,
  currentIllness,
  decay,
  feed,
  formatWeight,
  hatchEgg,
  hasSoul,
  healthPercent,
  inventoryView,
  layEgg,
  careView,
  migrate,
  mood,
  ageDays,
  applyDevPatch,
  adopt,
  daysToNextStage,
  kgToNextStage,
  canChooseLook,
  setLook,
  growthPercent,
  sizeForWeight,
  lifeStageFor,
  rename,
  startGym,
  noteCoins,
  startStudy,
  studyView,
  startTrip,
  startWork,
  traitView,
  useItem,
  workSecondsLeft,
  goToSleep,
  isAsleep,
  wakeUp,
} from '../core.js'
import { LIFESPAN_DAYS, DEFAULT_TOY, ILLNESS_CHAINS, illnessStageMs, SICK_RISK_MINUTES, SLEEP_RECOVERY_PER_MIN, illnessAt, medicineForStage } from '../data.js'

const T0 = 1_700_000_000_000
const MIN = 60_000

/** Push the clock forward by `minutes`, resolving everything that happens. */
function advance(state, minutes) {
  return decay(state, (state.lastSeenAt ?? T0) + minutes * MIN)
}

/** Stage length converted to the minutes `advance` wants. */
const stageMinutes = stage => illnessStageMs(stage) / MIN

/** Walk the illness all the way down the chain, one stage per call. */
function worsen(state, times) {
  for (let i = 0; i < times; i += 1) advance(state, stageMinutes(state.illness.stage) + 1)
}

/** Give the pig something without paying for it. */
function give(state, key, count = 1) {
  state.inventory = { ...(state.inventory ?? {}) }
  state.inventory[key] = (state.inventory[key] ?? 0) + count
}

// ===========================================================================
// Creation, growth, migration
// ===========================================================================

test('layEgg produces a complete, sane save', () => {
  const egg = layEgg(T0)
  assert.equal(egg.version, STATE_VERSION)
  assert.equal(egg.name, '猪猪')
  assert.equal(egg.hatched, false)
  assert.equal(egg.dead, false)
  assert.equal(egg.weightG, 1200)
  assert.equal(egg.cleanliness, 90)
  assert.equal(egg.health, MAX.health)
  assert.equal(egg.coins, 500, 'enough to buy medicine on day one')
  assert.deepEqual(egg.inventory, {})
  assert.deepEqual(egg.traits, { intel: 0, charm: 0, strong: 0 })
  assert.deepEqual(egg.courses, {})
  assert.deepEqual(egg.souvenirs, [])
  assert.equal(egg.illness, null)
  assert.equal(egg.activity, null)
  assert.deepEqual(egg.pending, [])
  assert.equal(egg.stats.jobs, 0)
  assert.equal(egg.stats.lessons, 0)
  assert.equal(egg.stats.trips, 0)
})

test('a fresh pig is a cardboard box, and opening it lets a piglet out', () => {
  const box = layEgg(T0)
  assert.equal(box.hatched, false)
  assert.equal(lifeStageFor(box, T0).key, 'box')

  const piglet = hatchEgg(T0)
  assert.equal(piglet.hatched, true)
  assert.equal(lifeStageFor(piglet, T0).key, 'piglet')
  assert.equal(ageDays(piglet, T0), 0, 'the clock starts when the box opens')
  assert.ok(piglet.memories.some(m => m.includes('纸盒')), 'it remembers the box')
})

// [dsh-piggy-claude-code mod] growth follows weight; nothing dies of old age.
test('the pig grows by weight, not by age or XP', () => {
  const DAY = 86_400_000
  const pig = hatchEgg(T0)
  pig.xp = 999_999
  assert.equal(lifeStageFor(pig, T0).key, 'piglet')
  assert.equal(lifeStageFor(pig, T0 + 30 * DAY).key, 'piglet', 'age alone grows nothing')

  const at = kg => { pig.weightG = kg * 1000; return lifeStageFor(pig, T0) }
  assert.equal(at(19.9).key, 'piglet')
  assert.equal(at(20).key, 'young')
  assert.equal(at(50).key, 'middle')
  assert.equal(at(79.9).key, 'middle')
  assert.equal(at(80).key, 'elder')
  // Every stage has its own drawing.
  assert.equal(at(1).art, 'stage-piglet')
  assert.equal(at(20).art, 'stage-young')
  assert.equal(at(60).art, 'stage-middle')
  assert.equal(at(80).art, 'stage-elder')
})

test('the sprite widens with weight: 40 px at hatching, 200 px at 120 kg, 400 px at 500 kg', () => {
  const pig = hatchEgg(T0)
  assert.equal(lifeStageFor(pig, T0).size, 40)
  assert.equal(sizeForWeight(pig.weightG), 40)
  assert.equal(sizeForWeight(80_000), 146)
  assert.equal(sizeForWeight(120_000), 200)
  assert.equal(sizeForWeight(310_000), 300, 'the second stretch is linear too')
  assert.equal(sizeForWeight(500_000), 400)
  assert.equal(sizeForWeight(900_000), 400, 'capped')
  assert.equal(sizeForWeight(NaN), 40, 'a broken weight is a newborn, not a giant')
  assert.ok(sizeForWeight(60_000) > sizeForWeight(40_000), 'grows steadily in between')
  assert.ok(sizeForWeight(200_000) > sizeForWeight(150_000), 'and keeps growing past 120 kg')
  assert.equal(growthPercent(500_000), 100)
  assert.equal(growthPercent(120_000), 24)
})

test('kgToNextStage counts down in kilograms; days no longer matter', () => {
  const pig = hatchEgg(T0)
  assert.equal(kgToNextStage(pig, T0), 20 - pig.weightG / 1000)
  pig.weightG = 70_000
  assert.equal(kgToNextStage(pig, T0), 10)
  pig.weightG = 80_000
  assert.equal(kgToNextStage(pig, T0), null, 'no stage past 老年猪')
  assert.equal(daysToNextStage(pig, T0), null)
})

test('weight comes from food actually eaten, slower once elderly, slower still past 120 kg', () => {
  const pig = hatchEgg(T0)
  pig.satiety = 50
  const start = pig.weightG
  feed(pig, 'turn', T0) // +2 satiety
  assert.equal(pig.weightG, start + 2 * 98)

  pig.satiety = 100
  const full = pig.weightG
  feed(pig, 'turn', T0)
  assert.equal(pig.weightG, full, 'a full pig cannot be stuffed heavier')

  pig.weightG = 90_000
  pig.satiety = 50
  feed(pig, 'turn', T0)
  assert.equal(pig.weightG, 90_000 + 2 * 50)

  pig.weightG = 200_000
  pig.satiety = 50
  feed(pig, 'turn', T0)
  assert.equal(pig.weightG, 200_000 + 2 * 25)
})

// [ST0004] the old elder switch only puts the beard on or takes it off now.
test('an elder pig can switch between the elder and the original look', () => {
  const pig = hatchEgg(T0)
  assert.equal(canChooseLook(pig), false)
  assert.deepEqual(setLook(pig, 'original', T0), { ok: false, reason: 'too-light' })

  pig.weightG = 80_000
  assert.equal(canChooseLook(pig), true)
  assert.deepEqual(wornFor(pig), ['whiskers', 'cane'], 'elder by default, [AC0021] walking stick and all')
  assert.equal(setLook(pig, 'original', T0).ok, true)
  assert.equal(lifeStageFor(pig, T0).art, 'stage-elder', 'still the elder pose: the look is the outfit, not the drawing')
  assert.deepEqual(wornFor(pig), ['cane'], 'the beard is off; the stick was never part of the look')
  assert.equal(setLook(pig, 'nonsense', T0).ok, false)
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(pig))).outfit, ['cane'], 'the choice is saved')
  assert.equal(setLook(pig, 'elder', T0).ok, true)
  assert.deepEqual(wornFor(pig), ['whiskers', 'cane'])
})

test('wardrobe: unlocks follow progress the save already keeps', () => {
  const pig = hatchEgg(T0)
  const unlocked = () => wardrobeView(pig).filter(item => item.unlocked).map(item => item.key)
  assert.deepEqual(unlocked(), ['bow'], 'a new piglet has its bow')
  assert.deepEqual(wardrobeView(layEgg(T0)).filter(item => item.unlocked), [], 'a box has nothing')
  pig.weightG = 50_000
  assert.deepEqual(unlocked(), ['bow', 'flatcap'], 'grown: the flat cap')
  pig.lessonsByStage.college = 1
  assert.deepEqual(unlocked(), ['bow', 'flatcap', 'glasses'], 'any lesson: the glasses')
  pig.lessonsByStage.primary = 9
  assert.deepEqual(unlocked(), ['bow', 'flatcap', 'mortarboard', 'glasses', 'scarf'], 'primary school: the scarf; a diploma: the mortarboard')
  pig.stats.trips = 1
  assert.ok(unlocked().includes('strawhat'), 'home from a trip: the straw hat')
  assert.ok(!unlocked().includes('sunglasses'))
  const mideast = SOUVENIRS.find(souvenir => souvenir.region === 'mideast')
  pig.collected = { [mideast.key]: 1 }
  assert.ok(unlocked().includes('sunglasses'), 'a souvenir from the Middle East: the sunglasses')
  pig.weightG = 80_000
  assert.ok(unlocked().includes('whiskers'), 'elder: the beard')
  assert.ok(unlocked().includes('cane'), '[AC0021] elder: the walking stick')
})

test('wardrobe: the stage look until the owner dresses the pig, one thing per slot', () => {
  const pig = hatchEgg(T0)
  assert.equal(outfitIsAuto(pig), true)
  assert.deepEqual(wornFor(pig), ['bow'], 'a piglet wears its bow')
  pig.weightG = 50_000
  assert.deepEqual(wornFor(pig), ['flatcap'], 'the stage look follows the stage')
  pig.lessonsByStage.primary = 9

  assert.deepEqual(wear(pig, 'glasses', true, T0), { ok: true })
  assert.equal(outfitIsAuto(pig), false, 'dressed by hand now')
  assert.deepEqual(wornFor(pig), ['glasses', 'flatcap'], 'kept the stage look and added the glasses, in drawing order')
  assert.equal(wear(pig, 'mortarboard', true, T0).ok, true)
  assert.deepEqual(wornFor(pig), ['glasses', 'mortarboard'], 'one hat at a time')
  assert.equal(wear(pig, 'scarf', true, T0).ok, true)
  assert.deepEqual(wornFor(pig), ['scarf', 'glasses', 'mortarboard'])
  assert.equal(wear(pig, 'glasses', false, T0).ok, true)
  assert.deepEqual(wornFor(pig), ['scarf', 'mortarboard'])
  pig.weightG = 80_000
  assert.deepEqual(wornFor(pig), ['scarf', 'mortarboard'], "the owner's outfit outlasts growing up")

  assert.deepEqual(wear(pig, 'sunglasses', true, T0), { ok: false, reason: 'wear-locked' })
  assert.deepEqual(wear(pig, 'cape', true, T0), { ok: false, reason: 'bad-wear' })
  assert.deepEqual(wearAuto(pig, T0), { ok: true })
  assert.deepEqual(wornFor(pig), ['whiskers', 'cane'], 'back to the stage look')
  // [AC0021] the stick is held in front, drawn after everything else.
  assert.equal(wear(pig, 'scarf', true, T0).ok, true)
  assert.equal(wear(pig, 'whiskers', false, T0).ok, true)
  assert.deepEqual(wornFor(pig), ['scarf', 'cane'], 'the stick stays in its own slot')
  assert.equal(wear(pig, 'cane', false, T0).ok, true)
  assert.deepEqual(wornFor(pig), ['scarf'], 'and comes off on its own')
  assert.equal(wear(pig, 'cane', true, T0).ok, true)
  assert.deepEqual(wornFor(pig), ['scarf', 'cane'])

  pig.dead = true
  assert.deepEqual(wornFor(pig), [], 'a grave wears nothing')
  assert.deepEqual(wear(pig, 'bow', true, T0), { ok: false, reason: 'dead' })
})

test('[ST0012] waist gear is bought once in the shop and worn straight away', () => {
  assert.deepEqual(WEAR_FOR_SALE.map(item => [item.key, item.slot, item.price]), [
    ['hulahoop', 'waist', 66], ['swimring', 'waist', 88], ['fannypack', 'waist', 168], ['chainbelt', 'waist', 188], ['pager', 'waist', 288],
  ])
  const pig = hatchEgg(T0)
  pig.coins = 200
  pig.lessonsByStage.primary = 1
  assert.equal(wear(pig, 'scarf', true, T0).ok, true)
  assert.equal(wardrobeView(pig).find(item => item.key === 'swimring').unlocked, false, 'not until it is bought')
  assert.deepEqual(wear(pig, 'swimring', true, T0), { ok: false, reason: 'wear-locked' })

  const bought = buy(pig, 'swimring')
  assert.equal(bought.ok, true)
  assert.equal(bought.item.kind, 'wear')
  assert.equal(pig.coins, 112)
  assert.deepEqual(pig.wardrobeBought, ['swimring'])
  assert.deepEqual(wornFor(pig), ['swimring', 'bow'], 'on at once, the scarf off: one thing per slot')
  assert.equal(pig.inventory.swimring, undefined, 'never in the bag')
  assert.equal(pig.stats.purchases, 1)

  assert.deepEqual(buy(pig, 'swimring'), { ok: false, reason: 'owned' })
  assert.deepEqual(buy(pig, 'pager'), { ok: false, reason: 'poor', price: 288 })
  assert.deepEqual(buy(pig, 'scarf'), { ok: false, reason: 'not-for-sale' }, 'earned, never sold')
  assert.equal(pig.coins, 112, 'refusals cost nothing')
  assert.equal(wear(pig, 'swimring', false, T0).ok, true)
  assert.equal(wear(pig, 'swimring', true, T0).ok, true, 'it stays in the wardrobe')

  assert.deepEqual(migrate({ ...pig, wardrobeBought: ['pager', 'scarf', 'nope', 'swimring'] }).wardrobeBought, ['swimring', 'pager'], 'only gear on sale, in shelf order')
  assert.deepEqual(migrate({ ...pig, wardrobeBought: undefined }).wardrobeBought, [], 'an old save has bought nothing')

  pig.dead = true
  assert.deepEqual(buy(pig, 'hulahoop'), { ok: false, reason: 'dead' })
})

test('wardrobe: migration keeps the outfit tidy and moves the old elder look over', () => {
  assert.equal(migrate({ hatched: true }).outfit, null, 'no outfit: follow the stage')
  assert.deepEqual(migrate({ hatched: true, outfit: ['strawhat', 'bow', 'cape', 7, 'whiskers'] }).outfit, ['whiskers', 'strawhat'],
    'known keys, one per slot, drawing order')
  const old = migrate({ version: 5, hatched: true, weightG: 90_000, look: 'original' })
  assert.deepEqual(old.outfit, [], "an owner who took the beard off keeps it off")
  assert.equal(Object.hasOwn(old, 'look'), false, 'the old key is gone')
  assert.equal(migrate({ version: 5, hatched: true, weightG: 90_000, look: 'elder' }).outfit, null, 'the elder look is the stage look')
  assert.deepEqual(migrate({ version: 6, hatched: true, outfit: ['bow'], look: 'original' }).outfit, ['bow'], 'a v6 outfit wins')
})

test('nothing dies of old age, and a grave can still be left for a new pig', () => {
  const DAY = 86_400_000
  const HOUR = 3_600_000
  const pig = hatchEgg(T0)
  // Looked after every hour for well past upstream's 14-day lifespan.
  for (let t = T0; t <= T0 + (LIFESPAN_DAYS + 6) * DAY; t += HOUR) {
    decay(pig, t)
    pig.satiety = 100
    pig.cleanliness = 100
    pig.happiness = 100
  }
  assert.equal(pig.dead, false, 'still alive after 20 days')

  // Illness can still take it; its story is kept when a new one arrives.
  applyDevPatch(pig, { dead: true }, T0 + 20 * DAY)
  assert.equal(lifeStageFor(pig, T0 + 20 * DAY).key, 'grave')
  const before = pig.memories.length
  adopt(pig, T0 + 21 * DAY)
  assert.equal(pig.dead, false)
  assert.equal(pig.hatched, false, 'a new pig starts as a box again')
  assert.equal(lifeStageFor(pig, T0 + 21 * DAY).key, 'box')
  assert.ok(pig.memories.length >= before - 1, 'the old memories are still there')
})

test('a soul settles on a grave nobody came back for', () => {
  const DAY = 86_400_000
  const pig = hatchEgg(T0)
  pig.dead = true
  pig.diedAt = T0
  assert.equal(hasSoul(pig, T0 + 0.5 * DAY), false)
  assert.equal(hasSoul(pig, T0 + 1.1 * DAY), true)
})

test('migrate tolerates junk', () => {
  assert.equal(migrate(null), null)
  assert.equal(migrate('nope'), null)
  assert.equal(migrate([1, 2]), null)
  const repaired = migrate({ xp: 'lots', satiety: Number.NaN, name: '  ', memories: 'x', stats: null, coins: -5 })
  assert.equal(repaired.xp, 0)
  assert.equal(repaired.name, '猪猪')
  assert.equal(repaired.coins, 0)
  assert.deepEqual(repaired.memories, [])
  assert.deepEqual(repaired.inventory, {})
})

test('migrate upgrades a v1 save all the way to the current version', () => {
  const upgraded = migrate({
    version: 1, name: '大花', bornAt: T0, xp: 200, weightG: 5000,
    satiety: 50, happiness: 50, lastSeenAt: T0,
    // no cleanliness, no health, no coins, no inventory, no traits
  })
  assert.equal(upgraded.version, STATE_VERSION)
  assert.equal(upgraded.name, '大花')
  assert.equal(upgraded.xp, 200)
  assert.equal(upgraded.cleanliness, 90)
  assert.equal(upgraded.health, MAX.health)
  assert.equal(upgraded.coins, 500)
  assert.deepEqual(upgraded.inventory, {})
  assert.deepEqual(upgraded.traits, { intel: 0, charm: 0, strong: 0 })
  assert.deepEqual(upgraded.souvenirs, [])
})

test('migrate lifts a v3 "work" record into the v4 activity shape', () => {
  const upgraded = migrate({
    ...layEgg(T0),
    version: 3,
    work: { job: 'site', startedAt: T0, endsAt: T0 + MIN },
  })
  assert.equal(upgraded.activity.kind, 'work')
  assert.equal(upgraded.activity.key, 'site')
  assert.equal(upgraded.activity.endsAt, T0 + MIN)
})

test('migrate drops unknown inventory keys and bad illness records', () => {
  const upgraded = migrate({
    ...layEgg(T0),
    inventory: { apple: 2, 'not-a-real-item': 9, med1: 'x' },
    illness: { chain: 99, stage: 1, since: T0 },
    activity: { kind: 'work', key: 'nonexistent', endsAt: T0 },
  })
  assert.deepEqual(upgraded.inventory, { apple: 2 })
  assert.equal(upgraded.illness, null)
  assert.equal(upgraded.activity, null)
})

// ===========================================================================
// Passive diet and care actions
// ===========================================================================

test('passive events accumulate xp, satiety and weight', () => {
  const pig = layEgg(T0)
  feed(pig, 'turn', T0)
  // A turn is worth 2 after the rebalance; tool calls used to drown everything.
  assert.equal(pig.xp, 2)
  assert.equal(pig.stats.turns, 1)
  assert.deepEqual(feed(pig, 'not-a-thing', T0), [])
})

test('care actions apply their effects and honour per-action cooldowns', () => {
  const pig = hatchEgg(T0)
  pig.cleanliness = 20
  // Washing spends soap; the pig has none until it buys some.
  assert.equal(act(pig, 'bathe', T0).reason, 'no-item')
  pig.inventory = { bubble: 2 }
  assert.equal(act(pig, 'bathe', T0, 'bubble').ok, true)
  assert.ok(pig.cleanliness > 60)
  assert.equal(pig.inventory.bubble, 1, 'one bubble bath was used up')
  const again = act(pig, 'bathe', T0 + 1000, 'bubble')
  assert.equal(again.ok, false)
  assert.equal(again.reason, 'cooldown')
  assert.equal(act(pig, 'bathe', T0 + ACTIONS.bathe.cooldownMs, 'bubble').ok, true)

  // Cooldowns are per action, and the free default toy needs no purchase.
  const played = act(pig, 'play', T0 + ACTIONS.bathe.cooldownMs)
  assert.equal(played.ok, true)
  assert.equal(played.spent, false, 'the scruffy default ball is not consumed')
  assert.deepEqual(act(pig, 'dance', T0), { ok: false, reason: 'unknown' })
})

// ===========================================================================
// Care costs an item — QQ Pet keeps food, sundries and medicine in separate
// inventory categories for exactly this reason.
// ===========================================================================

test('feeding, washing and playing each need something from their own shelf', () => {
  const pig = hatchEgg(T0)
  assert.equal(pig.inventory.apple, undefined)
  for (const [action, kind] of [['feed', 'food'], ['bathe', 'bath'], ['play', 'toy']]) {
    const refused = act(pig, action, T0)
    if (kind === 'toy') {
      // …except playing, where the free default toy is always in the bag.
      assert.equal(refused.ok, true, 'the default toy needs no purchase')
      assert.equal(refused.spent, false, 'and is never used up')
    } else {
      assert.equal(refused.ok, false, `${action} must need an item`)
      assert.equal(refused.reason, 'no-item')
      assert.equal(refused.kind, kind)
    }
  }
})

test('a care item is consumed and its own numbers are the ones applied', () => {
  const pig = hatchEgg(T0)
  pig.satiety = 10
  pig.inventory = { bone: 1, cake: 2 }
  const fed = act(pig, 'feed', T0, 'bone')
  assert.equal(fed.ok, true)
  assert.equal(fed.spent, true)
  assert.equal(pig.inventory.bone, undefined, 'the last bone is gone')
  assert.equal(pig.satiety, 55, '10 + the bone\'s 45, not the 22 of a plain feed')

  // Asking for something the pig does not own is refused, not silently swapped.
  assert.equal(act(pig, 'feed', T0 + 61_000, 'apple').reason, 'no-item')
  // With no pick at all it spends the cheapest thing it actually has.
  const again = act(pig, 'feed', T0 + 61_000)
  assert.equal(again.ok, true)
  assert.equal(again.item, 'cake')
  assert.equal(pig.inventory.cake, 1)
})

test('the toy shelf keeps the free default ball alongside bought toys', () => {
  const pig = hatchEgg(T0)
  pig.inventory = { yoyo: 3 }
  const shelf = careView(pig).play.map(i => i.key)
  assert.deepEqual(shelf, ['ball', 'yoyo'], 'default first, then what was bought')
  const played = act(pig, 'play', T0, 'yoyo')
  assert.equal(played.spent, true)
  assert.equal(pig.inventory.yoyo, 2)
})

// ===========================================================================
// The school ladder
// ===========================================================================

test('school starts at primary and the higher stages are gated behind it', () => {
  const pig = hatchEgg(T0)
  pig.coins = 50_000
  assert.equal(studyView(pig)[0].unlocked, true, '小学 is always open')
  assert.equal(studyView(pig)[1].unlocked, false, '大学 is not')
  assert.equal(studyView(pig)[2].unlocked, false, '研究生 is not')

  const refused = startStudy(pig, 'chinese', 'college', T0)
  assert.equal(refused.ok, false)
  assert.equal(refused.reason, 'locked')
  assert.equal(refused.need.need, 9)
  assert.equal(pig.coins, 50_000, 'a locked stage costs nothing')

  // Every subject once at primary opens college.
  pig.lessonsByStage = { primary: 8, college: 0, graduate: 0 }
  assert.equal(startStudy(pig, 'chinese', 'college', T0).reason, 'locked')
  pig.lessonsByStage.primary = 9
  assert.equal(studyView(pig)[1].unlocked, true)
  assert.equal(startStudy(pig, 'chinese', 'college', T0).ok, true)
})

test('finishing a lesson counts toward the stage, not just the subject', () => {
  const pig = hatchEgg(T0)
  pig.coins = 5000
  assert.deepEqual(pig.lessonsByStage, { primary: 0, college: 0, graduate: 0, doctor: 0 })
  startStudy(pig, 'music', 'primary', T0)
  advance(pig, SCHOOL_STAGES[0].minutes + 1)
  assert.equal(pig.lessonsByStage.primary, 1)
  assert.equal(pig.courses.music, 1)
})

test('a save from before the ladder keeps its lessons as primary', () => {
  const upgraded = migrate({ ...layEgg(T0), version: 4, courses: { chinese: 3, art: 2 } })
  assert.equal(upgraded.lessonsByStage.primary, 5, 'existing lessons are not thrown away')
})

// [dsh-piggy-claude-code mod] ST0002: cheap capped schools, slow open-ended ones.
test('小学 and 大学 cap each subject, 研究生 and 博士 do not', () => {
  const pig = hatchEgg(T0)
  pig.coins = 1_000_000
  let clock = T0
  const sit = (keys, stageKey) => {
    pig.satiety = 100
    pig.happiness = 100
    const result = startStudy(pig, keys, stageKey, clock)
    if (result.ok) {
      clock += (schoolStage(stageKey).minutes + 1) * MIN
      decay(pig, clock)
    }
    return result
  }
  const primary = SCHOOL_STAGES[0]
  for (let i = 0; i < primary.cap; i += 1) assert.equal(sit('chinese', 'primary').ok, true)
  const refused = sit('chinese', 'primary')
  assert.equal(refused.reason, 'capped')
  assert.equal(refused.max, primary.cap)
  assert.deepEqual(refused.full, ['chinese'])
  assert.equal(pig.stageCourses.primary.chinese, primary.cap)
  assert.equal(studyView(pig)[0].taken.chinese, primary.cap)
  assert.equal(sit('mathematics', 'primary').ok, true, 'other subjects still open')

  pig.lessonsByStage = { primary: 9, college: 9, graduate: 9, doctor: 0 }
  for (let i = 0; i < SCHOOL_STAGES[1].cap; i += 1) assert.equal(sit(['pe', 'art'], 'college').ok, true)
  const coins = pig.coins
  assert.equal(sit(['pe', 'music'], 'college').reason, 'capped', 'one used-up subject refuses the sitting')
  assert.equal(pig.coins, coins, 'a refused sitting costs nothing')

  for (const stageKey of ['graduate', 'doctor']) {
    assert.equal(schoolStage(stageKey).cap, null)
    for (let i = 0; i < 4; i += 1) assert.equal(sit('chinese', stageKey).ok, true, `${stageKey} has no cap`)
  }
})

test('the capped schools bound each trait, and beat the open ones per coin and per hour', () => {
  const capped = SCHOOL_STAGES.filter(stage => stage.cap !== null)
  const open = SCHOOL_STAGES.filter(stage => stage.cap === null)
  assert.deepEqual(capped.map(stage => stage.key), ['primary', 'college'])
  assert.deepEqual(open.map(stage => stage.key), ['graduate', 'doctor'])
  // Three subjects per trait: the most the cheap schools can ever add to one trait.
  const perTrait = capped.reduce((sum, stage) => sum + 3 * stage.cap * stage.gain, 0)
  assert.equal(perTrait, 18)
  assert.ok(perTrait < 30, 'the wage cap still needs the open-ended schools')
  const coinsPerPoint = stage => stage.tuition / stage.gain
  const pointsPerHour = stage => (PARALLEL_COURSES[stage.key] * stage.gain) / (stage.minutes / 60)
  for (const cheap of capped) {
    for (const dear of open) {
      assert.ok(coinsPerPoint(cheap) < coinsPerPoint(dear), `${cheap.key} is cheaper per point than ${dear.key}`)
      assert.ok(pointsPerHour(cheap) > pointsPerHour(dear), `${cheap.key} is faster than ${dear.key}`)
    }
  }
  // The gate to the next school still fits under the cap.
  for (const stage of SCHOOL_STAGES) {
    if (stage.requires === null) continue
    const before = SCHOOL_STAGES.find(s => s.key === stage.requires.stage)
    if (before.cap !== null) assert.ok(stage.requires.lessons <= before.cap * SUBJECTS.length)
  }
})

test('every school hands out a diploma; graduate degrees and doctorates come again', () => {
  assert.deepEqual(DIPLOMAS.map(d => [d.stage, d.repeat]), [['primary', false], ['college', false], ['graduate', true], ['doctor', true]])
  const once = DIPLOMAS[0]
  const again = DIPLOMAS[2]
  assert.deepEqual([0, 8, 9, 18].map(n => diplomaCount(once, n)), [0, 0, 1, 1])
  assert.deepEqual([0, 8, 9, 17, 18, 27].map(n => diplomaCount(again, n)), [0, 0, 1, 1, 2, 3])

  const pig = hatchEgg(T0)
  pig.coins = 1_000_000
  assert.ok(diplomaView(pig).every(d => d.count === 0), 'a fresh pig has none')
  pig.lessonsByStage = { primary: 8, college: 0, graduate: 8, doctor: 0 }
  pig.satiety = 100
  pig.happiness = 100
  assert.equal(startStudy(pig, 'chinese', 'primary', T0).ok, true)
  advance(pig, SCHOOL_STAGES[0].minutes + 1)
  assert.equal(diplomaView(pig)[0].count, 1)
  assert.equal(diplomaView(pig)[0].next, null, 'a one-off diploma has no next')
  assert.ok(pig.pending.some(e => e.kind === 'diploma'))

  pig.lessonsByStage.college = 9
  for (let round = 1; round <= 2; round += 1) {
    pig.pending = []
    pig.satiety = 100
    pig.happiness = 100
    assert.equal(startStudy(pig, ['chinese', 'music', 'pe'], 'graduate', pig.lastSeenAt).ok, true)
    advance(pig, SCHOOL_STAGES[2].minutes + 1)
    if (round === 1) assert.equal(diplomaView(pig)[2].count, 1, '8 + 3 lessons: the first degree')
  }
  // 8 + 6 = 14 lessons: still one, five into the next.
  assert.deepEqual(diplomaView(pig)[2].next, { done: 5, need: 9 })
  pig.lessonsByStage.graduate = 17
  pig.pending = []
  pig.satiety = 100
  startStudy(pig, 'art', 'graduate', pig.lastSeenAt)
  advance(pig, SCHOOL_STAGES[2].minutes + 1)
  assert.equal(diplomaView(pig)[2].count, 2, 'the second degree')
  assert.ok(pig.pending.some(e => e.kind === 'diploma' && e.text.includes('第 2 张')))
})

test('a save from before the caps spreads its lessons over the subjects', () => {
  const raw = { ...layEgg(T0), lessonsByStage: { primary: 20, college: 4, graduate: 0, doctor: 0 } }
  delete raw.stageCourses
  const upgraded = migrate(raw)
  const primary = Object.values(upgraded.stageCourses.primary)
  assert.equal(primary.reduce((sum, n) => sum + n, 0), 20, 'every lesson is accounted for')
  assert.ok(primary.every(n => n >= 2), 'twenty lessons fill the 小学 cap everywhere')
  assert.equal(Object.values(upgraded.stageCourses.college).reduce((sum, n) => sum + n, 0), 4)
  assert.deepEqual(migrate(upgraded).stageCourses, upgraded.stageCourses, 'idempotent')
  assert.deepEqual(hatchEgg(T0).stageCourses, { primary: {}, college: {}, graduate: {}, doctor: {} })
})

test('long-haul activities really do take hours', () => {
  for (const activity of [...JOBS, ...SCHOOL_STAGES, ...TRIPS]) {
    assert.ok(activity.minutes >= 15, `${activity.label} is at least a quarter hour`)
  }
  assert.ok(Math.max(...JOBS.map(j => j.minutes)) >= 240, 'the longest shift is hours')
  assert.ok(Math.max(...TRIPS.map(t => t.minutes)) >= 1440, 'the longest trip is a day')
})

test('petting has no cooldown', () => {
  const pig = hatchEgg(T0)
  assert.equal(ACTIONS.pet.cooldownMs, 0)
  for (let i = 0; i < 5; i += 1) assert.equal(act(pig, 'pet', T0).ok, true)
  assert.equal(pig.stats.pets, 5)
  assert.equal(actionCooldownSeconds(pig, 'pet', T0), 0)
})

test('the whole care loop is exposed in a stable order', () => {
  assert.deepEqual([...ACTION_ORDER], ['feed', 'bathe', 'play', 'pet'])
  for (const key of ACTION_ORDER) {
    assert.equal(ACTIONS[key].key, key)
    assert.equal(typeof ACTIONS[key].label, 'string')
    assert.equal(typeof ACTIONS[key].emoji, 'string')
  }
})

// ===========================================================================
// Decay
// ===========================================================================

test('attributes decay with wall-clock time', () => {
  const pig = layEgg(T0)
  pig.satiety = 100
  pig.happiness = 100
  pig.cleanliness = 100
  advance(pig, 60)
  assert.ok(pig.satiety < 100 && pig.satiety > 80, `satiety=${pig.satiety}`)
  assert.ok(pig.happiness < 100 && pig.happiness > 85, `happiness=${pig.happiness}`)
  assert.ok(pig.cleanliness < 100 && pig.cleanliness > 88, `cleanliness=${pig.cleanliness}`)
})

test('decay never goes below zero', () => {
  const pig = layEgg(T0)
  pig.satiety = 5
  pig.happiness = 5
  pig.cleanliness = 5
  advance(pig, 100 * 60)
  assert.equal(Math.round(pig.satiety), 0)
  assert.equal(Math.round(pig.happiness), 0)
  assert.equal(Math.round(pig.cleanliness), 0)
})

test('mood: dead beats sick beats working beats everything else', () => {
  const pig = hatchEgg(T0)
  pig.happiness = 90
  assert.equal(mood(pig, T0).key, 'happy')

  pig.satiety = 10
  assert.equal(mood(pig, T0).key, 'hungry')

  pig.illness = { chain: 0, stage: 1, since: T0 }
  assert.equal(mood(pig, T0).key, 'sick')
  assert.equal(mood(pig, T0).label, '得了感冒')

  pig.illness = null
  pig.activity = { kind: 'work', key: 'odd', label: '打零工', emoji: '🧹', startedAt: T0, endsAt: T0 + MIN }
  assert.equal(mood(pig, T0).key, 'working')

  pig.activity = { kind: 'study', key: 'chinese', stage: 'primary', label: '小学语文', emoji: '📖', startedAt: T0, endsAt: T0 + MIN }
  assert.equal(mood(pig, T0).key, 'studying')

  pig.activity = { kind: 'trip', key: 'suburb', label: '郊游', emoji: '🏞', startedAt: T0, endsAt: T0 + MIN }
  assert.equal(mood(pig, T0).key, 'traveling')

  pig.activity = null
  pig.dead = true
  assert.equal(mood(pig, T0).key, 'dead')
})

// ===========================================================================
// Work
// ===========================================================================

test('the job board is well formed', () => {
  assert.ok(JOBS.length >= 3)
  for (const job of JOBS) {
    assert.equal(typeof job.key, 'string')
    assert.ok(job.minutes > 0)
    assert.ok(job.coins > 0)
    assert.ok(job.satiety < 0, 'work costs satiety')
  }
})

test('a shift pays out when the clock passes its end', () => {
  const pig = hatchEgg(T0)
  const before = pig.coins
  const result = startWork(pig, 'odd', T0)
  assert.equal(result.ok, true)
  assert.equal(pig.activity.kind, 'work')
  assert.equal(pig.activity.key, 'odd')
  assert.equal(workSecondsLeft(pig, T0), JOBS.find(j => j.key === "odd").minutes * 60)

  advance(pig, JOBS.find(j => j.key === "odd").minutes + 1)
  assert.equal(pig.activity, null, 'the shift is over')
  assert.equal(pig.coins, before + JOBS.find(j => j.key === "odd").coins)
  assert.equal(pig.stats.jobs, 1)
  assert.equal(pig.stats.coinsEarned, JOBS.find(j => j.key === "odd").coins)
  assert.ok(pig.memories.some(m => m.includes('猪币')))
  assert.ok(pig.pending.some(e => e.kind === 'work'), 'the payout is announced')
})

test('a shift drains satiety and cleanliness faster than idling', () => {
  const working = hatchEgg(T0)
  const idle = hatchEgg(T0)
  startWork(working, 'office', T0)
  advance(working, 5)
  advance(idle, 5)
  assert.ok(working.satiety < idle.satiety, 'working pig gets hungrier')
  assert.ok(working.cleanliness < idle.cleanliness, 'working pig gets dirtier')
})

test('work is refused while away, sick, hungry or dead', () => {
  const pig = hatchEgg(T0)
  startWork(pig, 'odd', T0)
  assert.equal(startWork(pig, 'odd', T0).reason, 'away')

  const sick = hatchEgg(T0)
  sick.illness = { chain: 0, stage: 1, since: T0 }
  assert.equal(canWork(sick), true, 'illness alone does not ground the pig')
  // Being ill no longer grounds the pig: that deadlocked the game, because a
  // sick pig with no coins could not buy the medicine it needed.
  assert.equal(startWork(sick, 'odd', T0).ok, true, 'a sick pig can still go to work')
  const weak = hatchEgg(T0)
  weak.health = 1
  assert.equal(startWork(weak, 'odd', T0).reason, 'weak', 'death\'s door is another matter')

  const hungry = hatchEgg(T0)
  hungry.satiety = 5
  assert.equal(startWork(hungry, 'odd', T0).reason, 'hungry')

  const dead = hatchEgg(T0)
  dead.dead = true
  dead.health = 0
  assert.equal(startWork(dead, 'odd', T0).reason, 'dead')

  assert.equal(startWork(hatchEgg(T0), 'moon', T0).reason, 'unknown')
})

test('care actions are blocked while the pig is away (except petting)', () => {
  const pig = hatchEgg(T0)
  startWork(pig, 'odd', T0)
  assert.equal(act(pig, 'feed', T0).reason, 'away')
  assert.equal(act(pig, 'bathe', T0).reason, 'away')
  assert.equal(act(pig, 'pet', T0).ok, true, 'you can still pat it')
})

test('calling the pig home early forfeits the pay', () => {
  const pig = hatchEgg(T0)
  const before = pig.coins
  startWork(pig, 'office', T0)
  assert.equal(callOffWork(pig, T0).ok, true)
  assert.equal(pig.activity, null)
  assert.equal(pig.coins, before, 'no pay for an unfinished shift')
  assert.equal(callOffWork(pig, T0).reason, 'idle')
})

// ===========================================================================
// Illness chains
// ===========================================================================

test('the illness chains match the QQ Pet reverse engineering', () => {
  assert.equal(ILLNESS_CHAINS.length, 3)
  assert.deepEqual(ILLNESS_CHAINS[0].stages.map(s => s.name), ['感冒', '发烧', '重感冒', '肺炎'])
  assert.deepEqual(ILLNESS_CHAINS[1].stages.map(s => s.name), ['咳嗽', '支气管炎', '哮喘', '肺结核'])
  assert.deepEqual(ILLNESS_CHAINS[2].stages.map(s => s.name), ['肚子胀', '胃炎', '胃溃疡', '胃癌'])
  assert.equal(illnessAt(0, 1).cure, '板蓝根')
  assert.equal(illnessAt(0, 4).cure, '金色消炎药水')
  assert.equal(illnessAt(0, 4).health, 1)
  assert.equal(illnessAt(0, 5), null)
  assert.equal(medicineForStage(1).tier, 1)
  assert.equal(medicineForStage(4).tier, 4)
})

test('neglect long enough makes the pig sick and costs a health point', () => {
  const pig = hatchEgg(T0)
  pig.satiety = 10
  assert.equal(pig.illness, null)
  advance(pig, SICK_RISK_MINUTES + 2)
  assert.notEqual(pig.illness, null, 'illness should have struck')
  assert.equal(pig.illness.stage, 1)
  assert.equal(pig.health, 4, 'stage 1 leaves 4 of 5 health')
  assert.ok(pig.pending.some(e => e.kind === 'sick'), 'it is announced')
  assert.ok(currentIllness(pig) !== null)
})

test('being well cared for keeps the pig healthy', () => {
  const pig = hatchEgg(T0)
  pig.satiety = 90
  pig.cleanliness = 90
  advance(pig, 60)
  assert.equal(pig.illness, null)
  assert.equal(pig.health, MAX.health)
})

test('a sick pig earns half, but still earns', () => {
  const run = (sick) => {
    const pig = hatchEgg(T0)
    pig.coins = 0
    if (sick) {
      pig.illness = { chain: 0, stage: 1, since: T0, progressMs: 0 }
      pig.health = 4
    }
    startWork(pig, 'site', T0)
    decay(pig, pig.activity.endsAt)
    return pig.coins
  }
  const healthy = run(false)
  const ill = run(true)
  assert.equal(healthy, JOBS.find(j => j.key === "site").coins)
  assert.equal(ill, Math.round(JOBS.find(j => j.key === "site").coins / 2), 'half pay')
  assert.ok(ill > 0, 'but never nothing — working while ill is the way out of being broke')
})

test('an untreated illness runs its stages in days, and can shake itself off', () => {
  try {
    // --- it gets worse, one stage a day ---------------------------------
    setRandomForTests(() => 0.99) // never self-heal
    const pig = hatchEgg(T0)
    pig.illness = { chain: 0, stage: 1, since: T0, progressMs: 0 }
    pig.health = 4
    pig.satiety = 80
    pig.cleanliness = 80

    advance(pig, stageMinutes(1) - 1)
    assert.equal(pig.illness.stage, 1, 'not yet')

    advance(pig, 2)
    assert.equal(pig.illness.stage, 2)
    assert.equal(pig.health, 3)
    assert.equal(currentIllness(pig).name, '发烧')

    // --- a day really is the unit ---------------------------------------
    const day = hatchEgg(T0)
    day.illness = { chain: 0, stage: 1, since: T0, progressMs: 0 }
    decay(day, T0 + 23 * 60 * 60000)
    assert.equal(day.illness.stage, 1, '23 hours is not a day')

    // --- an untreated cold really can just go away ----------------------
    setRandomForTests(() => 0.01) // always self-heal
    const lucky = hatchEgg(T0)
    lucky.illness = { chain: 0, stage: 1, since: T0, progressMs: 0 }
    lucky.health = 4
    decay(lucky, T0 + illnessStageMs(1) + 1000)
    assert.equal(lucky.illness, null, 'it shrugged the cold off')
    assert.equal(lucky.health, 5, 'and got a little health back')

    // --- the last stage never heals on its own --------------------------
    setRandomForTests(() => 0.0001)
    const terminal = hatchEgg(T0)
    terminal.illness = { chain: 0, stage: 4, since: T0, progressMs: 0 }
    terminal.health = 1
    decay(terminal, T0 + illnessStageMs(4) + 1000)
    assert.equal(terminal.dead, true, 'the last stage is fatal without medicine')
  } finally {
    setRandomForTests(null)
  }
})

test('being out while ill runs the illness clock faster than resting', () => {
  try {
    setRandomForTests(() => 0.99) // never self-heal, so only the rate differs
    const build = () => {
      const pig = hatchEgg(T0)
      pig.illness = { chain: 0, stage: 1, since: T0, progressMs: 0 }
      pig.health = 4
      pig.satiety = 100
      pig.cleanliness = 100
      return pig
    }

    // Half a day at home: still stage 1.
    const home = build()
    decay(home, T0 + 12 * 60 * 60000)
    assert.equal(home.illness.stage, 1, 'resting is slow')

    // Half a day out, which counts double: a full stage.
    const out = build()
    out.activity = { kind: 'work', key: 'office', label: '上班', emoji: '💼', startedAt: T0, endsAt: T0 + 12 * 60 * 60000 }
    decay(out, T0 + 12 * 60 * 60000)
    assert.equal(out.illness.stage, 2, 'a half day out is a whole day of illness')
  } finally {
    setRandomForTests(null)
  }
})

test('the fourth stage progressing means death, and 还魂丹 brings it back', () => {
  const pig = hatchEgg(T0)
  pig.illness = { chain: 0, stage: 4, since: T0 }
  pig.health = 1
  pig.satiety = 80
  pig.cleanliness = 80
  pig.xp = 500

  worsen(pig, 1)
  assert.equal(pig.dead, true)
  assert.equal(pig.health, 0)
  assert.equal(pig.illness, null)
  assert.ok(pig.pending.some(e => e.kind === 'death'))

  // Nothing works on a dead pig except the revive item.
  assert.equal(act(pig, 'feed', T0).reason, 'dead')
  assert.equal(startWork(pig, 'odd', T0).reason, 'dead')
  give(pig, 'apple')
  assert.equal(useItem(pig, 'apple', T0).reason, 'dead')
  assert.equal(useItem(pig, REVIVE_ITEM.key, T0).reason, 'empty')

  give(pig, REVIVE_ITEM.key)
  const revived = useItem(pig, REVIVE_ITEM.key, T0)
  assert.equal(revived.ok, true)
  assert.equal(pig.dead, false)
  assert.equal(pig.health, MAX.health)
  assert.equal(pig.xp, 500, 'level and xp survive death')
  assert.equal(pig.stats.revives, 1)
})

test('the revive item is refused on a living pig', () => {
  const pig = hatchEgg(T0)
  give(pig, REVIVE_ITEM.key)
  const result = useItem(pig, REVIVE_ITEM.key, T0)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'not-dead')
  assert.equal(pig.inventory[REVIVE_ITEM.key], 1, 'the item is not consumed')
})

test('only the matching medicine cures, and it costs the item', () => {
  const pig = hatchEgg(T0)
  pig.illness = { chain: 1, stage: 2, since: T0 }
  pig.health = 3

  give(pig, 'med1')
  assert.equal(useItem(pig, 'med1', T0).reason, 'wrong-medicine')
  assert.equal(pig.illness.stage, 2, 'still sick')
  assert.equal(pig.inventory.med1, 1, 'the wrong item is not consumed')

  give(pig, 'med2')
  const cured = useItem(pig, 'med2', T0)
  assert.equal(cured.ok, true)
  assert.equal(pig.illness, null)
  assert.equal(pig.health, MAX.health)
  assert.equal(pig.inventory.med2, 0, 'the medicine is consumed')
  assert.equal(pig.stats.cures, 1)
  assert.ok(pig.pending.some(e => e.kind === 'cured'))
})

test('medicine on a healthy pig is refused', () => {
  const pig = hatchEgg(T0)
  give(pig, 'med1')
  assert.equal(useItem(pig, 'med1', T0).reason, 'not-sick')
  assert.equal(pig.inventory.med1, 1)
})

test('using a care item applies its effects', () => {
  const pig = hatchEgg(T0)
  pig.satiety = 30
  give(pig, 'bone')
  const result = useItem(pig, 'bone', T0)
  assert.equal(result.ok, true)
  assert.ok(pig.satiety > 60, `satiety=${pig.satiety}`)
  assert.equal(pig.inventory.bone, 0)
  assert.equal(useItem(pig, 'bone', T0).reason, 'empty')
  assert.equal(useItem(pig, 'nope', T0).reason, 'unknown')
})

// ===========================================================================
// Study — the nine QQ Pet subjects
// ===========================================================================

test('the course table mirrors the QQ Pet subjects and stages', () => {
  assert.equal(SUBJECTS.length, 9)
  assert.deepEqual(SUBJECTS.map(s => s.label),
    ['语文', '数学', '政治', '美术', '音乐', '礼仪', '体育', '武术', '劳动'])
  assert.deepEqual(SCHOOL_STAGES.map(s => s.label), ['小学', '大学', '研究生', '博士'])
  // Every subject feeds exactly one of the three traits.
  for (const subject of SUBJECTS) assert.ok(['intel', 'charm', 'strong'].includes(subject.trait))
  // The three groups the original art implies.
  assert.deepEqual(SUBJECTS.filter(s => s.trait === 'intel').map(s => s.label), ['语文', '数学', '政治'])
  assert.deepEqual(SUBJECTS.filter(s => s.trait === 'charm').map(s => s.label), ['美术', '音乐', '礼仪'])
  assert.deepEqual(SUBJECTS.filter(s => s.trait === 'strong').map(s => s.label), ['体育', '武术', '劳动'])
  // Stages get dearer and slower.
  assert.ok(SCHOOL_STAGES[0].tuition < SCHOOL_STAGES[2].tuition)
  assert.ok(SCHOOL_STAGES[0].minutes < SCHOOL_STAGES[2].minutes)
})

test('studying costs the tuition up front and pays a trait on completion', () => {
  const pig = hatchEgg(T0)
  pig.coins = 200
  const stage = SCHOOL_STAGES[0]
  const result = startStudy(pig, 'chinese', 'primary', T0)
  assert.equal(result.ok, true)
  assert.equal(pig.coins, 200 - stage.tuition, 'tuition is taken at the start')
  assert.equal(pig.activity.kind, 'study')
  assert.equal(pig.activity.key, 'chinese')
  assert.equal(pig.activity.stage, 'primary')

  advance(pig, stage.minutes + 1)
  assert.equal(pig.activity, null)
  assert.equal(pig.traits.intel, stage.gain, '语文 feeds 智力')
  assert.equal(pig.courses.chinese, 1)
  assert.equal(pig.stats.lessons, 1)
  assert.ok(pig.pending.some(e => e.kind === 'study'))
  assert.ok(pig.memories.some(m => m.includes('语文')))
})

test('each subject feeds its own trait', () => {
  const cases = [['art', 'charm'], ['pe', 'strong'], ['politics', 'intel']]
  for (const [subject, trait] of cases) {
    const pig = hatchEgg(T0)
    pig.coins = 200
    startStudy(pig, subject, 'primary', T0)
    advance(pig, SCHOOL_STAGES[0].minutes + 1)
    assert.equal(pig.traits[trait], SCHOOL_STAGES[0].gain, `${subject} should feed ${trait}`)
    for (const other of ['intel', 'charm', 'strong']) {
      if (other !== trait) assert.equal(pig.traits[other], 0, `${subject} must not feed ${other}`)
    }
  }
})

test('a higher stage pays more of the same trait', () => {
  const pig = hatchEgg(T0)
  pig.coins = 5000
  pig.lessonsByStage = { primary: 9, college: 9, graduate: 0 }
  startStudy(pig, 'wushu', 'graduate', T0)
  advance(pig, SCHOOL_STAGES[2].minutes + 1)
  assert.equal(pig.traits.strong, SCHOOL_STAGES[2].gain)
  assert.equal(pig.courses.wushu, 1)
})

test('study is refused when broke, away, sick or dead', () => {
  const poor = hatchEgg(T0)
  poor.coins = 1
  assert.equal(startStudy(poor, 'chinese', 'primary', T0).reason, 'poor')
  assert.equal(poor.coins, 1, 'nothing was spent')
  assert.equal(poor.activity, null)

  const away = hatchEgg(T0)
  away.coins = 500
  startStudy(away, 'chinese', 'primary', T0)
  assert.equal(startStudy(away, 'art', 'primary', T0).reason, 'away')

  const sick = hatchEgg(T0)
  sick.coins = 500
  sick.illness = { chain: 0, stage: 1, since: T0 }
  assert.equal(startStudy(sick, 'chinese', 'primary', T0).ok, true, 'a sick pig can still go to school')

  const dead = hatchEgg(T0)
  dead.dead = true
  dead.health = 0
  assert.equal(startStudy(dead, 'chinese', 'primary', T0).reason, 'dead')

  assert.equal(startStudy(hatchEgg(T0), 'underwater-basket-weaving', 'primary', T0).reason, 'unknown')
  assert.equal(startStudy(hatchEgg(T0), 'chinese', 'kindergarten', T0).reason, 'unknown')
})

// ===========================================================================
// Travel — souvenirs for the collection
// ===========================================================================

// [dsh-piggy-claude-code mod] the travel world: priced by time zones from home.
// [ST0001] every job, school stage and region has a pose. [ST0004] Decorations
// are their own files now, so there is one drawing per pose. [ST0011] Every
// destination has its own too, and the panel knows each one by name.
test('every job, school stage, trip region and destination has its sprite', () => {
  const poses = [
    ...JOBS.map(job => `job-${job.art}`),
    ...SCHOOL_STAGES.map(stage => `study-${stage.key}`),
    ...REGIONS.map(region => `away-trip-${region.key}`),
    ...PLACES.map(place => `away-trip-${place.key}`),
    'react-graduate',
  ]
  assert.ok(JOBS.every(job => typeof job.art === 'string' && job.art !== ''), 'every job names its art')
  for (const pose of poses) {
    assert.ok(existsSync(new URL(`../assets/${pose}.svg`, import.meta.url)), `assets/${pose}.svg`)
    assert.match(`${pose}.svg`, /^[a-z][a-z0-9-]{0,31}\.svg$/, 'the art route serves it')
  }
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  for (const place of PLACES) assert.ok(client.includes(`${place.key}: 'away-trip-${place.key}'`), `client.js PLACE_ART names ${place.key}`)
})

// [ST0022] Each gym class has its own pose; the treadmill is the generic gym.
test('every gym class has its own sprite', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const map = client.match(/var GYM_ART = \{([^}]*)\}/)
  assert.ok(map, 'client.js has GYM_ART')
  const poses = new Map([...map[1].matchAll(/(\w+): '([a-z0-9-]+)'/g)].map(m => [m[1], m[2]]))
  assert.deepEqual([...poses.keys()].sort(), GYM_CLASSES.map(entry => entry.key).sort(), 'GYM_ART names every class')
  assert.equal(new Set(poses.values()).size, GYM_CLASSES.length, 'no two classes share a pose')
  for (const pose of poses.values()) assert.ok(existsSync(new URL(`../assets/${pose}.svg`, import.meta.url)), `assets/${pose}.svg`)
})

test('the travel world is well formed', () => {
  assert.equal(REGIONS.length, 7)
  for (const region of REGIONS) {
    // China has a fourth city, Shanghai; every other region has three.
    assert.equal(region.places.length, region.key === 'china' ? 4 : 3)
    assert.ok(region.perk.key && region.perk.label)
  }
  assert.equal(PLACES.length, 22)
  assert.equal(SOUVENIRS.length, 44)
  assert.equal(new Set(SOUVENIRS.map(s => s.key)).size, 44, 'souvenir keys are unique')
  assert.equal(new Set(PLACES.map(p => p.key)).size, 22, 'place keys are unique')
  for (const place of PLACES) {
    const specialty = SPECIALTIES.find(item => item.key === place.specialty)
    assert.ok(specialty, `${place.key} has a specialty`)
    assert.equal(specialty.exclusive, true)
  }
  assert.equal(new Set(ALL_ITEMS.map(i => i.key)).size, ALL_ITEMS.length, 'no item key clashes with a specialty')
})

test('a trip costs 100 + 200 per time zone and takes 1 h + 1 h per zone, the short way round', () => {
  assert.equal(zonesBetween(9, 9), 0)
  assert.equal(zonesBetween(9, 8), 1)
  assert.equal(zonesBetween(9, -5), 10, 'Tokyo → New York goes over the Pacific')
  assert.equal(zonesBetween(9, 5.5), 4, 'half-hour zones round to whole hours')
  const tokyo = PLACES.find(p => p.key === 'tokyo')
  const paris = PLACES.find(p => p.key === 'paris')
  assert.deepEqual([fareFor(tokyo, 9).cost, fareFor(tokyo, 9).minutes], [100, 60], 'staying in your own zone')
  assert.deepEqual([fareFor(paris, 9).cost, fareFor(paris, 9).minutes], [1700, 540])
  assert.deepEqual([fareFor(paris, 1).cost, fareFor(paris, 1).minutes], [100, 60], 'it depends on where home is')
})

test('travelling costs coins up front and brings back a souvenir from that place', () => {
  const pig = hatchEgg(T0)
  pig.coins = 1000
  const happiness = pig.happiness
  const result = startTrip(pig, 'beijing', T0, 9)
  assert.equal(result.ok, true)
  assert.equal(pig.coins, 1000 - 300)
  assert.equal(pig.activity.kind, 'trip')
  assert.equal((pig.activity.endsAt - pig.activity.startedAt) / MIN, 120)

  advance(pig, 121)
  assert.equal(pig.activity, null)
  const got = Object.keys(pig.collected)
  assert.equal(got.length, 1)
  assert.ok(['wallbrick', 'tanghulu'].includes(got[0]), 'the souvenir comes from Beijing')
  assert.equal(pig.lastTrip.place, 'beijing')
  assert.ok(pig.happiness > happiness - 5, 'a trip should not leave the pig sad')
  assert.equal(pig.stats.trips, 1)
  assert.ok(pig.pending.some(e => e.kind === 'trip'))
})

test('souvenirs favour the missing one, trips bring specialties, and a full region pays out', () => {
  try {
    // 0 → always the first missing souvenir, always loot, always the specialty.
    setRandomForTests(() => 0)
    const pig = hatchEgg(T0)
    pig.coins = 100_000
    let clock = T0
    const strongBefore = pig.traits.strong
    const weightBefore = pig.weightG
    for (const place of ['beijing', 'beijing', 'chengdu', 'chengdu', 'xian', 'xian', 'shanghai', 'shanghai']) {
      pig.satiety = 100
      assert.equal(startTrip(pig, place, clock, 8).ok, true)
      clock += 61 * MIN
      decay(pig, clock)
    }
    assert.deepEqual(regionProgress(pig, 'china'), { have: 8, total: 8, done: true }, 'eight trips, eight different souvenirs')
    assert.ok(pig.inventory.duck >= 1 && pig.inventory.hotpot >= 1 && pig.inventory.biang >= 1 && pig.inventory.xiaolongbao >= 1, 'local specialties came home')
    assert.deepEqual(pig.regionsDone, ['china'])
    assert.equal(pig.traits.strong, strongBefore + 3, 'China: strength +3')
    assert.ok(pig.weightG >= weightBefore + 5000, 'China: +5 kg')
    assert.deepEqual(perksOf(pig), ['foodie'])
    assert.ok(pig.pending.some(e => e.kind === 'region'))
    assert.equal(pig.lastTrip.regionDone, 'china')
  } finally {
    setRandomForTests(null)
  }
})

test('trips never bring back the daily-limited ration', () => {
  try {
    for (let r = 0; r < 1; r += 0.02) {
      setRandomForTests(() => r)
      const pig = hatchEgg(T0)
      pig.coins = 100_000
      pig.satiety = 100
      assert.equal(startTrip(pig, 'beijing', T0, 8).ok, true)
      decay(pig, T0 + 61 * MIN)
      assert.equal(pig.inventory.ration, undefined, `roll ${r}`)
    }
  } finally {
    setRandomForTests(null)
  }
})

test('travel-only specialties cannot be bought, but can be eaten', () => {
  const pig = hatchEgg(T0)
  pig.coins = 5000
  assert.equal(buy(pig, 'duck').reason, 'not-for-sale')
  pig.inventory.duck = 1
  pig.satiety = 20
  assert.equal(act(pig, 'feed', T0, 'duck').ok, true)
  assert.ok(pig.satiety > 20)
})

test('every region done makes a 环球旅行家, once', () => {
  try {
    setRandomForTests(() => 0.99) // no loot, keeps it short
    const pig = hatchEgg(T0)
    for (const souvenir of SOUVENIRS) pig.collected[souvenir.key] = 1
    for (const region of REGIONS) {
      if (region.key !== 'oceania') pig.regionsDone.push(region.key)
    }
    delete pig.collected.penguinpic
    pig.coins = 100_000
    const intel = pig.traits.intel
    startTrip(pig, 'antarctica', T0, 12)
    setRandomForTests(() => 0) // the missing souvenir
    decay(pig, T0 + 61 * MIN)
    assert.equal(pig.worldDone, true)
    assert.equal(pig.traits.intel, intel + WORLD_BONUS.traits.intel)
    assert.equal(perksOf(pig).length, 7)
  } finally {
    setRandomForTests(null)
  }
})

test('perks change the numbers they promise', () => {
  const pig = hatchEgg(T0)
  pig.coins = 100_000
  const plain = tripQuote(pig, 'paris', 9).cost
  pig.regionsDone = ['americas']
  assert.equal(tripQuote(pig, 'paris', 9).cost, Math.round(plain * 0.8), '常旅客: a fifth off')

  const student = hatchEgg(T0)
  student.coins = 100_000
  student.regionsDone = ['eastasia']
  startStudy(student, 'chinese', 'primary', T0)
  assert.equal((student.activity.endsAt - student.activity.startedAt) / MIN, Math.round(SCHOOL_STAGES[0].minutes * 0.8), '卷王: shorter lessons')
})

test('a trip is refused when broke, and nothing is spent', () => {
  const pig = hatchEgg(T0)
  pig.coins = 5
  const result = startTrip(pig, 'newyork', T0, 9)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'poor')
  assert.equal(result.price, 2100)
  assert.equal(pig.coins, 5)
  assert.equal(pig.activity, null)
  assert.equal(startTrip(pig, 'mars', T0, 9).reason, 'unknown')
})

test('care is blocked while travelling, and the pig can be recalled', () => {
  const pig = hatchEgg(T0)
  pig.coins = 200
  startTrip(pig, 'tokyo', T0, 9)
  pig.inventory.apple = 1
  assert.equal(act(pig, 'feed', T0, 'apple').reason, 'away')
  assert.equal(startWork(pig, 'odd', T0).reason, 'away')

  const recalled = callOffActivity(pig, T0)
  assert.equal(recalled.ok, true)
  assert.equal(recalled.refunded, 100, 'an unfinished trip is refunded')
  assert.equal(pig.coins, 200, 'coins are back')
  assert.deepEqual(pig.collected, {})
})

test('a save caught mid-way on a retired trip gets its money back', () => {
  const old = hatchEgg(T0)
  old.coins = 10
  old.activity = { kind: 'trip', key: 'sea', label: '看海', emoji: '🌊', startedAt: T0, endsAt: T0 + 1000, cost: 620 }
  const upgraded = migrate(JSON.parse(JSON.stringify(old)))
  assert.equal(upgraded.activity, null)
  assert.equal(upgraded.coins, 630)
  assert.deepEqual(upgraded.collected, {})
})

test('recalling a study session refunds the tuition; recalling work does not pay', () => {
  const student = hatchEgg(T0)
  student.coins = 5000
  student.lessonsByStage = { primary: 9, college: 0, graduate: 0 }
  startStudy(student, 'music', 'college', T0)
  const refund = callOffActivity(student, T0)
  assert.equal(refund.refunded, SCHOOL_STAGES[1].tuition)
  assert.equal(student.coins, 5000, 'the tuition comes back whole')

  const worker = hatchEgg(T0)
  const before = worker.coins
  startWork(worker, 'office', T0)
  const forfeit = callOffActivity(worker, T0)
  assert.equal(forfeit.refunded, 0)
  assert.equal(worker.coins, before)
})

// ===========================================================================
// Unified activity
// ===========================================================================

test('the three activities are mutually exclusive', () => {
  const pig = hatchEgg(T0)
  pig.coins = 500
  startWork(pig, 'odd', T0)
  assert.equal(startStudy(pig, 'chinese', 'primary', T0).reason, 'away')
  assert.equal(startTrip(pig, 'tokyo', T0, 9).reason, 'away')
  assert.equal(pig.activity.kind, 'work')
})

test('anything away from home drains the pig faster', () => {
  for (const kind of ['work', 'study', 'trip']) {
    const away = hatchEgg(T0)
    const idle = hatchEgg(T0)
    // Same starting bars, so the only difference is being away.
    away.satiety = 100
    idle.satiety = 100
    away.coins = 5000
    if (kind === 'work') startWork(away, 'office', T0)
    else if (kind === 'study') {
      away.coins = 5000
      away.lessonsByStage = { primary: 9, college: 9, graduate: 0 }
      startStudy(away, 'chinese', 'graduate', T0)
    }
    else startTrip(away, 'newyork', T0, 9)
    advance(away, 2)
    advance(idle, 2)
    assert.ok(away.satiety < idle.satiety, `${kind} should make the pig hungrier`)
  }
})

test('trait and course views always list everything', () => {
  const pig = hatchEgg(T0)
  assert.deepEqual(Object.keys(traitView(pig)).sort(), ['charm', 'intel', 'strong'])
  assert.equal(Object.keys(courseView(pig)).length, SUBJECTS.length)
  assert.ok(Object.values(courseView(pig)).every(n => n === 0))
  assert.deepEqual(inventoryView(pig).apple, 0)
})

// ===========================================================================
// Shop
// ===========================================================================

test('the shop is well formed and every illness stage has a cure on sale', () => {
  assert.ok(SHOP.length >= 8)
  for (const item of SHOP) {
    assert.equal(typeof item.key, 'string')
    assert.ok(item.price > 0)
    assert.ok(['food', 'bath', 'toy', 'medicine', 'revive', 'card'].includes(item.kind))
  }
  for (let stage = 1; stage <= 4; stage += 1) {
    const med = medicineForStage(stage)
    assert.notEqual(med, null, `stage ${stage} needs a medicine`)
  }
  assert.ok(SHOP.some(i => i.key === REVIVE_ITEM.key), 'the revive item is stocked')
})

test('buying deducts coins and fills the backpack', () => {
  const pig = hatchEgg(T0)
  pig.coins = 50
  const result = buy(pig, 'apple')
  assert.equal(result.ok, true)
  assert.equal(pig.coins, 44)
  assert.equal(pig.inventory.apple, 1)
  assert.equal(pig.stats.purchases, 1)
  assert.deepEqual(inventoryView(pig).apple, 1)
})

test('buying is refused when broke, and for unknown goods', () => {
  const pig = hatchEgg(T0)
  pig.coins = 3
  const poor = buy(pig, 'bone')
  assert.equal(poor.ok, false)
  assert.equal(poor.reason, 'poor')
  assert.equal(pig.coins, 3, 'nothing was spent')
  assert.equal(buy(pig, 'yacht').reason, 'unknown')
})

// [ST0020] The emergency ration: 1 coin, a tenth of a full belly, one a day.
test('the emergency ration costs 1, feeds a tenth of the belly, and sells one a day', () => {
  const ration = SHOP.find(item => item.key === 'ration')
  assert.equal(ration.price, 1)
  assert.equal(ration.kind, 'food')
  assert.equal(ration.satiety, MAX.satiety / 10)
  const pig = hatchEgg(T0)
  pig.utcOffsetMin = 0 // T0 is 22:13 UTC on 2023-11-14
  pig.coins = 10
  assert.equal(dailyBuysLeft(pig, ration, T0), 1)
  assert.equal(buy(pig, 'ration', T0).ok, true)
  assert.equal(pig.coins, 9)
  assert.deepEqual(buy(pig, 'ration', T0 + 60_000), { ok: false, reason: 'daily-limit', max: 1 })
  assert.equal(pig.coins, 9, 'nothing was spent')
  assert.equal(pig.inventory.ration, 1)
  assert.equal(dailyBuysLeft(pig, ration, T0), 0)
  assert.equal(dailyBuysLeft(pig, SHOP.find(item => item.key === 'apple'), T0), null, 'other food has no limit')
  assert.equal(buy(pig, 'apple', T0).ok, true)

  pig.satiety = 50
  assert.equal(useItem(pig, 'ration', T0).ok, true)
  assert.equal(Math.round(pig.satiety), 60)

  // Midnight in the owner's zone opens a new day.
  assert.equal(buy(pig, 'ration', T0 + 2 * 3_600_000).ok, true)
  assert.deepEqual(pig.dailyBuys, { day: '2023-11-15', counts: { ration: 1 } })
})

test('the ration day follows the owner\'s zone and survives a reload', () => {
  const pig = hatchEgg(T0)
  pig.utcOffsetMin = 9 * 60 // T0 is 07:13 JST on 2023-11-15
  pig.coins = 10
  assert.equal(buy(pig, 'ration', T0).ok, true)
  assert.equal(buy(pig, 'ration', T0 + 2 * 3_600_000).reason, 'daily-limit', 'still the 15th in Tokyo')
  const reloaded = migrate(JSON.parse(JSON.stringify(pig)))
  assert.equal(buy(reloaded, 'ration', T0 + 3_600_000).reason, 'daily-limit')
  assert.deepEqual(migrate({ dailyBuys: { day: '2023-11-15', counts: { ration: 1, apple: 2, yacht: 1, bad: -1 } } }).dailyBuys,
    { day: '2023-11-15', counts: { ration: 1 } })
  assert.deepEqual(migrate({ dailyBuys: { day: 'yesterday', counts: { ration: 1 } } }).dailyBuys, { day: '', counts: {} })
  assert.deepEqual(migrate({}).dailyBuys, { day: '', counts: {} })
})

test('snapshot-independent inventory view always lists every item', () => {
  const pig = hatchEgg(T0)
  const view = inventoryView(pig)
  // Every item (shop and travel-only), plus the free default toy the pig always owns.
  assert.equal(Object.keys(view).length, ALL_ITEMS.length + 1)
  assert.equal(view[DEFAULT_TOY.key], Infinity, 'the default toy never runs out')
  for (const item of SHOP) assert.equal(view[item.key], 0)
})

// ===========================================================================
// Housekeeping and display
// ===========================================================================

test('rename validates and cleans', () => {
  const pig = layEgg(T0)
  assert.equal(rename(pig, '  大花  ', T0), '大花')
  assert.equal(rename(pig, '', T0), null)
  assert.equal(rename(pig, '一二三四五六七八九十一二三四五六七', T0), null)
})

test('memories are capped', () => {
  const pig = hatchEgg(T0)
  for (let i = 0; i < 30; i += 1) act(pig, 'feed', T0 + (i + 1) * ACTIONS.feed.cooldownMs)
  assert.ok(pig.memories.length <= 8, `memories=${pig.memories.length}`)
  assert.ok(pig.pending.length <= 6, `pending=${pig.pending.length}`)
})

test('display helpers', () => {
  assert.equal(formatWeight(1200), '1.2 kg')
  assert.equal(healthPercent({ health: 5 }), 100)
  assert.equal(healthPercent({ health: 0 }), 0)
  assert.equal(healthPercent({ health: 3 }), 60)
  assert.equal(bar(0).includes('▓'), false)
  assert.equal(bar(100).includes('░'), false)
  assert.equal([...bar(50, 4)].length, 4)
  assert.equal(THRESHOLDS.hungry, 25)
})

test('developer mode can force any state, but only valid ones', () => {
  try {
    setRandomForTests(() => 0.99) // keep illnesses from self-healing mid-test

    const pig = hatchEgg(T0)
    // Numbers are clamped, so dev mode cannot produce a corrupt pig.
    applyDevPatch(pig, { satiety: 999, cleanliness: -50, health: 99, coins: -5 }, T0)
    assert.equal(pig.satiety, 100)
    assert.equal(pig.cleanliness, 0)
    assert.equal(pig.health, MAX.health)
    assert.equal(pig.coins, 0)

    // Illness is set to a real stage.
    applyDevPatch(pig, { illness: { chain: 0, stage: 4 }, health: 1 }, T0)
    assert.equal(pig.illness.stage, 4)
    assert.equal(currentIllness(pig).name, '肺炎')

    // Dying and coming back.
    applyDevPatch(pig, { dead: true }, T0)
    assert.equal(pig.dead, true)
    applyDevPatch(pig, { dead: false, health: 5 }, T0)
    assert.equal(pig.dead, false)

    // Age is jumpable, but [mod] weight is what makes an elder pig now.
    applyDevPatch(pig, { ageDays: 9 }, T0)
    assert.notEqual(lifeStageFor(pig, T0).key, 'elder')
    applyDevPatch(pig, { weightG: 90_000 }, T0)
    assert.equal(lifeStageFor(pig, T0).key, 'elder')

    // And the clock can be fast-forwarded.
    const before = hatchEgg(T0)
    before.satiety = 100
    applyDevPatch(before, { __advanceMs: 12 * 3600_000 }, T0)
    assert.ok(before.satiety < 100, 'time moved')
  } finally {
    setRandomForTests(null)
  }
})


test('a save from the age-based rules is re-ranked quietly, never announced backwards', () => {
  const DAY = 86_400_000
  const old = hatchEgg(T0)
  old.stage = 'middle' // what upstream called a 4-day-old pig
  old.pending = []
  decay(old, T0 + 4 * DAY)
  assert.equal(old.stage, 'piglet', 'weight decides now')
  assert.ok(!old.pending.some(event => event.kind === 'stage'), 'no "grew into a piglet" announcement')

  old.weightG = 25_000
  decay(old, T0 + 4 * DAY + 1000)
  assert.equal(old.stage, 'young')
  assert.ok(old.pending.some(event => event.kind === 'stage'), 'growing up is still announced')
})

// [dsh-piggy-claude-code mod] several subjects at once, and a doctorate.
test('university takes two subjects at once, graduate school and the doctorate three', () => {
  assert.deepEqual(PARALLEL_COURSES, { primary: 1, college: 2, graduate: 3, doctor: 3 })
  const pig = hatchEgg(T0)
  pig.coins = 100_000
  assert.equal(startStudy(pig, ['chinese', 'music'], 'primary', T0).reason, 'too-many')
  pig.lessonsByStage = { primary: 9, college: 0, graduate: 0, doctor: 0 }
  const before = { ...pig.traits }
  const coins = pig.coins
  assert.equal(startStudy(pig, ['chinese', 'music'], 'college', T0).ok, true)
  assert.equal(pig.coins, coins - 2 * SCHOOL_STAGES[1].tuition, 'tuition per subject')
  advance(pig, SCHOOL_STAGES[1].minutes + 1)
  assert.equal(pig.traits.intel, before.intel + 2)
  assert.equal(pig.traits.charm, before.charm + 2)
  assert.equal(pig.lessonsByStage.college, 2, 'both count toward the next school')
  assert.equal(startStudy(pig, ['chinese', 'music', 'pe'], 'college', T0 + 86_400_000).reason, 'too-many')
})

test('the doctorate opens after graduate school, and the thesis pays once', () => {
  const pig = hatchEgg(T0)
  pig.coins = 1_000_000
  pig.lessonsByStage = { primary: 9, college: 9, graduate: 8, doctor: 0 }
  assert.equal(startStudy(pig, 'chinese', 'doctor', T0).reason, 'locked')
  pig.lessonsByStage.graduate = 9
  let clock = T0
  for (const trio of [['chinese', 'mathematics', 'politics'], ['art', 'music', 'manner'], ['pe', 'wushu', 'labouring']]) {
    pig.satiety = 100
    pig.happiness = 100
    assert.equal(startStudy(pig, trio, 'doctor', clock).ok, true)
    clock += (SCHOOL_STAGES[3].minutes + 1) * MIN
    decay(pig, clock)
  }
  assert.equal(pig.doctorDone, true)
  assert.ok(pig.pending.some(e => e.kind === 'doctor'))
  assert.equal(pig.traits.intel, 3 * SCHOOL_STAGES[3].gain + 1, 'three lessons plus the thesis')
})

// [dsh-piggy-claude-code mod] the first name is free; after that, a rename card.
test('the first name is free, every rename after that costs a rename card', () => {
  const pig = hatchEgg(T0)
  assert.equal(hasDefaultName(pig), true)
  assert.deepEqual(renamePig(pig, '大花', T0), { ok: true, name: '大花', usedCard: false })
  assert.equal(hasDefaultName(pig), false)
  assert.equal(renamePig(pig, '二花', T0).reason, 'need-card')
  assert.equal(renamePig(pig, '   ', T0).reason, 'bad-name')
  assert.equal(renamePig(pig, 'x'.repeat(17), T0).reason, 'bad-name')

  pig.coins = 1500
  assert.equal(buy(pig, RENAME_CARD.key).ok, true)
  assert.equal(pig.coins, 500, 'a rename card costs 1000')
  assert.equal(useItem(pig, RENAME_CARD.key, T0).reason, 'use-to-rename')
  assert.deepEqual(renamePig(pig, '二花', T0), { ok: true, name: '二花', usedCard: true })
  assert.equal(pig.inventory[RENAME_CARD.key], 0)
})

// ---------------------------------------------------------------------------
// [dsh-piggy-claude-code mod] the job ladder per trait, and scratch cards
// ---------------------------------------------------------------------------

import { LOTTERY, lotteryPrize } from '../data.js'
import { lotteryWaitSeconds, scratchLottery, startWork as startWorkAgain } from '../core.js'

test('every trait has a fixed 15-minute gig with random pay, and a career behind trait points', () => {
  for (const trait of ['intel', 'charm', 'strong']) {
    const jobs = JOBS.filter(job => job.trait === trait)
    const gig = jobs.find(job => job.random !== null)
    assert.ok(gig, `${trait} has a random-pay gig`)
    assert.equal(gig.minutes, 15)
    assert.equal(gig.fixed, true)
    assert.ok(jobs.some(job => job.tier === 'pro' && job.requires !== null), `${trait} has a career`)
    assert.ok(new Set(jobs.map(job => job.minutes)).size >= 3, `${trait} offers several shift lengths`)
  }
})

test('a career refuses a pig without the trait points, and takes one that has them', () => {
  const pig = hatchEgg(T0)
  const refused = startWorkAgain(pig, 'coach', T0)
  assert.equal(refused.ok, false)
  assert.equal(refused.reason, 'job-locked')
  assert.deepEqual(refused.missing, [{ trait: 'strong', need: 15, have: 0 }])
  pig.traits.strong = 15
  assert.equal(startWorkAgain(pig, 'coach', T0).ok, true)
})

test('a gig keeps its 15 minutes however trained the pig is, and pays inside its range', () => {
  const gig = JOBS.find(job => job.key === 'rider')
  for (let i = 0; i < 40; i += 1) {
    const pig = hatchEgg(T0)
    pig.coins = 0
    pig.traits.strong = 30
    assert.equal(startWorkAgain(pig, 'rider', T0).ok, true)
    assert.equal(pig.activity.endsAt - T0, 15 * MIN, 'no speed bonus on a fixed gig')
    decay(pig, pig.activity.endsAt)
    // 30 points is the 3× pay cap
    assert.ok(pig.coins >= gig.random[0] * 3 && pig.coins <= gig.random[1] * 3, `paid ${pig.coins}`)
  }
})

test('scratch cards: the prize table, the price and one card every ten minutes', () => {
  assert.equal(lotteryPrize(0).tier, 'first')
  assert.equal(lotteryPrize(0.999).tier, 'none')
  assert.deepEqual(LOTTERY.prizes.map(p => p.coins), [10000, 1000, 200, 100, 0])
  const value = LOTTERY.prizes.slice(0, -1).reduce((sum, p) => sum + p.coins * p.chance, 0)
  assert.ok(value < LOTTERY.price, 'a card loses money on average')

  const pig = hatchEgg(T0)
  pig.coins = 500
  const win = scratchLottery(pig, T0, () => 0)
  assert.equal(win.ok, true)
  assert.equal(win.prize.tier, 'first')
  assert.equal(pig.coins, 500 - LOTTERY.price + 10000)

  const again = scratchLottery(pig, T0 + 5 * MIN, () => 0.99)
  assert.equal(again.ok, false)
  assert.equal(again.reason, 'cooldown')
  assert.equal(lotteryWaitSeconds(pig, T0 + 5 * MIN), 5 * 60)

  const later = scratchLottery(pig, T0 + 10 * MIN, () => 0.99)
  assert.equal(later.ok, true)
  assert.equal(later.prize.tier, 'none')
  assert.equal(later.prize.mood, 'sad')

  const poor = hatchEgg(T0)
  poor.coins = 50
  assert.equal(scratchLottery(poor, T0, () => 0).reason, 'poor')
})

// ---------------------------------------------------------------------------
// [ST0015] Blackjack: bet, draw, stand; paid by the total, exactly 21 pays 10×
// ---------------------------------------------------------------------------

import { BLACKJACK, blackjackTotal } from '../data.js'
import { dealBlackjack, hitBlackjack, standBlackjack } from '../core.js'

/** Rolls that deal exactly `cards` (0–51, A♠ = 0, K♠ = 12) from a deck missing `dealt`. */
function deck(cards, dealt = []) {
  const rolls = []
  dealt = [...dealt]
  for (const card of cards) {
    const left = [...Array(52).keys()].filter(c => !dealt.includes(c))
    rolls.push((left.indexOf(card) + 0.5) / left.length)
    dealt.push(card)
  }
  return () => rolls.shift()
}

const A = 0, FIVE = 4, SEVEN = 6, NINE = 8, TEN = 9, KING = 12, QUEEN_H = 24, NINE_H = 21

test('blackjack: the table is 18→1 up to 21→5, bets from 100, stand on 18', () => {
  assert.deepEqual(BLACKJACK.payouts.map(row => [row.total, row.multiplier]), [[18, 1], [19, 1.2], [20, 1.5], [21, 5]])
  assert.equal(Math.min(...BLACKJACK.bets), 100)
  assert.equal(BLACKJACK.standAt, 18)
  assert.deepEqual(blackjackTotal([A, KING]), { total: 21, soft: true })
  assert.deepEqual(blackjackTotal([A, FIVE]), { total: 16, soft: true })
  assert.deepEqual(blackjackTotal([A, FIVE, KING]), { total: 16, soft: false }, 'the ace drops to 1 rather than bust')
  assert.deepEqual(blackjackTotal([A, A + 13, NINE]), { total: 21, soft: true })
})

test('blackjack: a natural 21 is paid 5× on the deal', () => {
  const pig = hatchEgg(T0)
  pig.coins = 1000
  const out = dealBlackjack(pig, 100, T0, deck([A, KING]))
  assert.equal(out.ok, true)
  assert.equal(out.round.done, true)
  assert.equal(out.round.outcome, 'jackpot')
  assert.equal(out.round.coins, 500)
  assert.equal(pig.coins, 1000 - 100 + 500)
  assert.equal(pig.blackjack, null)
  assert.deepEqual(out.round.cards, [{ rank: 'A', suit: '♠' }, { rank: 'K', suit: '♠' }])
})

test('blackjack: under 18 the pig must draw; a stand pays by the total', () => {
  const pig = hatchEgg(T0)
  pig.coins = 1000
  const dealt = dealBlackjack(pig, 200, T0, deck([TEN, SEVEN]))
  assert.equal(dealt.ok, true)
  assert.equal(dealt.round.done, false)
  assert.equal(dealt.round.total, 17)
  assert.equal(pig.coins, 800, 'the bet is on the table')
  assert.equal(standBlackjack(pig, T0).reason, 'too-low')
  assert.equal(dealBlackjack(pig, 100, T0).reason, 'in-hand')

  const hit = hitBlackjack(pig, T0, deck([A + 13], pig.blackjack.cards))
  assert.equal(hit.round.total, 18)
  assert.equal(hit.round.done, false)
  const stood = standBlackjack(pig, T0)
  assert.equal(stood.ok, true)
  assert.equal(stood.round.outcome, 'win')
  assert.equal(stood.round.multiplier, 1)
  assert.equal(pig.coins, 800 + 200)
  assert.equal(pig.stats.blackjacks, 1)
  assert.equal(standBlackjack(pig, T0).reason, 'no-hand')
})

test('blackjack: over 21 is bust and the bet is gone; drawing to exactly 21 pays 5×', () => {
  const pig = hatchEgg(T0)
  pig.coins = 1000
  dealBlackjack(pig, 100, T0, deck([TEN, FIVE]))
  const bust = hitBlackjack(pig, T0, deck([QUEEN_H], pig.blackjack.cards))
  assert.equal(bust.round.outcome, 'bust')
  assert.equal(bust.round.total, 25)
  assert.equal(bust.round.coins, 0)
  assert.equal(pig.coins, 900)

  dealBlackjack(pig, 500, T0, deck([TEN, 1]))
  const twentyOne = hitBlackjack(pig, T0, deck([NINE_H], pig.blackjack.cards))
  assert.equal(twentyOne.round.total, 21)
  assert.equal(twentyOne.round.outcome, 'jackpot')
  assert.equal(pig.coins, 900 - 500 + 2500)
})

test('blackjack: refusals — bets off the table, too poor, out of the house, dead', () => {
  const pig = hatchEgg(T0)
  pig.coins = 150
  assert.equal(dealBlackjack(pig, 50, T0).reason, 'bad-bet')
  assert.equal(dealBlackjack(pig, 200, T0).reason, 'poor')
  assert.equal(hitBlackjack(pig, T0).reason, 'no-hand')
  pig.coins = 5000
  assert.equal(startWorkAgain(pig, 'rider', T0).ok, true)
  assert.equal(dealBlackjack(pig, 100, T0).reason, 'away')
  const dead = hatchEgg(T0)
  dead.dead = true
  assert.equal(dealBlackjack(dead, 100, T0).reason, 'dead')
})

test('blackjack: an open hand survives a reload; a broken one gives its bet back', () => {
  const pig = hatchEgg(T0)
  pig.coins = 1000
  dealBlackjack(pig, 100, T0, deck([TEN, SEVEN]))
  const kept = migrate(JSON.parse(JSON.stringify(pig)))
  assert.deepEqual(kept.blackjack, { bet: 100, cards: [TEN, SEVEN] })
  assert.equal(kept.coins, 900)

  const broken = migrate({ ...JSON.parse(JSON.stringify(pig)), blackjack: { bet: 100, cards: [TEN, TEN] } })
  assert.equal(broken.blackjack, null)
  assert.equal(broken.coins, 1000, 'the bet came back')
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(broken))), broken, 'and only once')
  assert.equal(migrate({ bornAt: T0 }).blackjack, null)
})

test('a VTuber stream pays a roll but still runs its full, trainable length', () => {
  const vtuber = JOBS.find(job => job.key === 'vtuber')
  assert.deepEqual(vtuber.random, [200, 2400])
  assert.equal(vtuber.fixed, false)
  const pig = hatchEgg(T0)
  pig.coins = 0
  pig.traits = { intel: 10, charm: 30, strong: 0 }
  assert.equal(startWorkAgain(pig, 'vtuber', T0).ok, true)
  assert.ok(pig.activity.endsAt - T0 < vtuber.minutes * MIN, 'charm still shortens the stream')
  decay(pig, pig.activity.endsAt)
  // 30 charm is the 3x pay cap
  assert.ok(pig.coins >= 200 * 3 && pig.coins <= 2400 * 3, `paid ${pig.coins}`)
})

test('bad moods come in three strengths, illness by its stage', () => {
  const pig = hatchEgg(T0)
  pig.lastActiveAt = T0
  const at = patch => mood(Object.assign(pig, { satiety: 80, cleanliness: 80, happiness: 50, illness: null }, patch), T0)
  assert.deepEqual([24, 14, 4].map(v => at({ satiety: v }).level), [1, 2, 3], 'hungry')
  assert.deepEqual([34, 19, 7].map(v => at({ cleanliness: v }).level), [1, 2, 3], 'dirty')
  assert.deepEqual([34, 19, 7].map(v => at({ happiness: v }).level), [1, 2, 3], 'lonely')
  assert.deepEqual([1, 2, 3, 4].map(stage => at({ illness: { chain: 0, stage, since: T0, progressMs: 0 } }).level), [1, 2, 3, 3], 'sick')
  assert.equal(at({}).level, 0, 'fine has no strength')
})

// ===========================================================================
// [dsh-piggy-claude-code mod] Sleep
// ===========================================================================

test('asleep, only satiety drops; mood and cleanliness come back', () => {
  const awake = hatchEgg(T0)
  const asleep = hatchEgg(T0)
  for (const pig of [awake, asleep]) Object.assign(pig, { satiety: 80, happiness: 40, cleanliness: 40 })
  assert.deepEqual(goToSleep(asleep, T0), { ok: true })
  advance(awake, 120)
  advance(asleep, 120)
  assert.equal(asleep.satiety, awake.satiety, 'satiety drains at the usual rate')
  assert.ok(asleep.satiety < 80)
  assert.ok(Math.abs(asleep.happiness - (40 + 120 * SLEEP_RECOVERY_PER_MIN.happiness)) < 1e-9)
  assert.ok(Math.abs(asleep.cleanliness - (40 + 120 * SLEEP_RECOVERY_PER_MIN.cleanliness)) < 1e-9)
  assert.ok(awake.happiness < 40 && awake.cleanliness < 40, 'awake they drain as before')
  advance(asleep, 24 * 60)
  assert.equal(asleep.happiness, 100, 'recovery stops at the top')
  assert.equal(asleep.cleanliness, 100)
})

test('asleep, neglect makes the pig ill half as fast', () => {
  const pig = hatchEgg(T0)
  pig.satiety = 5
  goToSleep(pig, T0)
  advance(pig, SICK_RISK_MINUTES + 1)
  assert.equal(pig.illness, null, 'what makes an awake pig ill only half-counts asleep')
  advance(pig, SICK_RISK_MINUTES)
  assert.notEqual(pig.illness, null, 'twice as long and it falls ill all the same')
  assert.equal(isAsleep(pig), true, 'falling ill does not wake it')
})

test("the computer's wake-up ends only the naps the computer started", () => {
  const pig = hatchEgg(T0)
  assert.deepEqual(goToSleep(pig, T0, { auto: true }), { ok: true })
  assert.equal(pig.sleep.auto, true)
  assert.deepEqual(wakeUp(pig, T0 + 60 * MIN, { auto: true }), { ok: true })
  assert.equal(isAsleep(pig), false)
  assert.equal(pig.lastActiveAt, T0 + 60 * MIN, 'getting up counts as activity')

  goToSleep(pig, T0 + 61 * MIN)
  assert.equal(pig.sleep.auto, false)
  assert.deepEqual(wakeUp(pig, T0 + 90 * MIN, { auto: true }), { ok: false, reason: 'manual' })
  assert.equal(isAsleep(pig), true, 'put to bed by hand, it sleeps on')
  assert.deepEqual(goToSleep(pig, T0 + 91 * MIN, { auto: true }), { ok: false, reason: 'asleep' })
  assert.equal(pig.sleep.auto, false, 'the computer sleeping too does not take the nap over')
  assert.deepEqual(wakeUp(pig, T0 + 92 * MIN), { ok: true })
  assert.deepEqual(wakeUp(pig, T0 + 93 * MIN), { ok: false, reason: 'awake' })
})

test('a pig cannot go to bed while out, dead or still in its box', () => {
  assert.equal(goToSleep(null, T0).reason, 'absent')
  assert.equal(goToSleep(layEgg(T0), T0).reason, 'absent')
  const out = hatchEgg(T0)
  out.satiety = 90
  assert.equal(startWork(out, 'odd', T0).ok, true)
  assert.deepEqual(goToSleep(out, T0 + MIN), { ok: false, reason: 'away' })
  const dead = hatchEgg(T0)
  dead.dead = true
  assert.deepEqual(goToSleep(dead, T0), { ok: false, reason: 'dead' })
})

test('caring for a sleeping pig, or sending it out, wakes it first', () => {
  const fed = hatchEgg(T0)
  goToSleep(fed, T0)
  assert.equal(act(fed, 'pet', T0 + MIN).ok, true)
  assert.equal(isAsleep(fed), false)
  assert.match(fed.memories.at(-2), /被叫醒了/)

  const refused = hatchEgg(T0)
  goToSleep(refused, T0)
  assert.equal(act(refused, 'nonsense', T0 + MIN).ok, false)
  assert.equal(isAsleep(refused), true, 'a refused action leaves it asleep')

  const worker = hatchEgg(T0)
  worker.satiety = 90
  goToSleep(worker, T0)
  assert.equal(startWork(worker, 'odd', T0 + MIN).ok, true)
  assert.equal(isAsleep(worker), false)
  assert.notEqual(worker.activity, null)
})

test('mood: a sleeping pig looks asleep; an idle one only dozes', () => {
  const pig = hatchEgg(T0)
  goToSleep(pig, T0)
  pig.illness = { chain: 0, stage: 1, since: T0, progressMs: 0 }
  assert.equal(mood(pig, T0).key, 'asleep', 'asleep even when ill')
  assert.equal(mood(pig, T0).label, '在睡觉')
  const idle = hatchEgg(T0)
  Object.assign(idle, { satiety: 90, cleanliness: 90, happiness: 60 })
  const dozing = mood(idle, T0 + 31 * MIN)
  assert.equal(dozing.key, 'sleepy')
  assert.equal(dozing.label, '在打盹')
  const died = hatchEgg(T0)
  goToSleep(died, T0)
  died.dead = true
  assert.equal(mood(died, T0).key, 'dead')
})

test('migrate keeps a night in bed and drops a bad or impossible one', () => {
  assert.equal(migrate({}).sleep, null)
  assert.deepEqual(migrate({ hatched: true, sleep: { since: T0, auto: true } }).sleep, { since: T0, auto: true })
  assert.deepEqual(migrate({ hatched: true, sleep: { since: T0, auto: 'yes' } }).sleep, { since: T0, auto: false })
  assert.equal(migrate({ hatched: true, sleep: 'zzz' }).sleep, null)
  assert.equal(migrate({ hatched: true, sleep: { auto: true } }).sleep, null)
  assert.equal(migrate({ hatched: true, dead: true, sleep: { since: T0 } }).sleep, null)
  const out = { hatched: true, activity: { kind: 'work', key: JOBS[0].key, endsAt: T0 + MIN }, sleep: { since: T0 } }
  assert.equal(migrate(out).sleep, null, 'it cannot be in bed and at work')
})

// ---------------------------------------------------------------------------
// [Q0016] The gym: pay, go, come back lighter; never below the floor, never a
// younger stage; 100 kg off in all unlocks the muscle look.
// ---------------------------------------------------------------------------

/** A fed, well-off pig of `kg`, ready to go out. */
function gymPig(kg) {
  const pig = hatchEgg(T0)
  pig.weightG = kg * 1000
  pig.coins = 5000
  pig.satiety = 90
  pig.stage = lifeStageFor(pig, T0).key
  return pig
}

test('the gym turns away what it cannot take', () => {
  assert.equal(startGym(gymPig(60), 'yoga', T0).reason, 'unknown')
  assert.equal(startGym(layEgg(T0), 'treadmill', T0).reason, 'unhatched')
  assert.equal(startGym(gymPig(GYM.floorKg), 'treadmill', T0).reason, 'too-light')
  const broke = gymPig(60)
  broke.coins = 10
  assert.deepEqual(startGym(broke, 'trainer', T0), { ok: false, reason: 'poor', price: 400 })
  const hungry = gymPig(60)
  hungry.satiety = 5
  assert.equal(startGym(hungry, 'treadmill', T0).reason, 'hungry')
  const busy = gymPig(60)
  assert.equal(startGym(busy, 'treadmill', T0).ok, true)
  assert.equal(startGym(busy, 'treadmill', T0).reason, 'away')
})

test('a class is paid up front, takes its time, and takes weight off on the way home', () => {
  const pig = gymPig(104)
  const result = startGym(pig, 'weights', T0)
  assert.equal(result.ok, true)
  assert.equal(pig.coins, 5000 - 150)
  assert.equal(pig.activity.kind, 'gym')
  assert.equal(mood(pig, T0 + MIN).key, 'exercising')
  decay(pig, T0 + 59 * MIN)
  assert.equal(pig.weightG, 104_000, 'nothing comes off before the class ends')
  decay(pig, T0 + 60 * MIN)
  assert.equal(pig.activity, null)
  assert.equal(pig.weightG, 99_000)
  assert.equal(pig.stats.gyms, 1)
  assert.equal(pig.stats.gymLostG, 5000)
  assert.ok(pig.satiety < 90 && pig.cleanliness < 90, 'sweaty and hungry')
  assert.ok(pig.pending.some(event => event.kind === 'gym'))
})

test('slimming down shrinks the pig but never makes it younger', () => {
  const pig = gymPig(85)
  assert.equal(lifeStageFor(pig, T0).key, 'elder')
  for (let i = 0; i < 6; i += 1) {
    pig.satiety = 90
    assert.equal(startGym(pig, 'trainer', T0 + i * 200 * MIN).ok, true)
    decay(pig, T0 + i * 200 * MIN + 121 * MIN)
  }
  assert.equal(pig.weightG, GYM.floorKg * 1000, 'stopped at the floor')
  assert.equal(pig.stats.gymLostG, 65_000, 'only what really came off counts')
  assert.equal(lifeStageFor(pig, T0).key, 'elder', 'still an elder at 20 kg')
  assert.equal(lifeStageFor(pig, T0).size, sizeForWeight(GYM.floorKg * 1000), 'but drawn at 20 kg')
  assert.ok(lifeStageFor(pig, T0).size < sizeForWeight(85_000))
  assert.ok(wornFor(pig).includes('whiskers'), 'the elder look stays unlocked')
  assert.equal(kgToNextStage(pig, T0), null, 'nothing left to grow into')
  assert.equal(startGym(pig, 'treadmill', T0 + 2000 * MIN).reason, 'too-light')
})

test('calling a class off hands the money back and takes nothing off', () => {
  const pig = gymPig(60)
  startGym(pig, 'trainer', T0)
  assert.deepEqual(callOffActivity(pig, T0 + 10 * MIN), { ok: true, refunded: 400 })
  assert.equal(pig.coins, 5000)
  assert.equal(pig.weightG, 60_000)
  assert.equal(pig.stats.gymLostG, 0)
})

test('100 kg off in all unlocks the muscle look and puts it on', () => {
  const pig = gymPig(200)
  pig.stats.gymLostG = 95_000
  const muscle = () => wardrobeView(pig).find(item => item.key === 'muscle')
  assert.equal(muscle().unlocked, false)
  assert.equal(muscle().slot, 'body')
  startGym(pig, 'trainer', T0)
  decay(pig, T0 + 121 * MIN)
  assert.equal(pig.stats.gymLostG, 107_000)
  assert.equal(muscle().unlocked, true)
  assert.ok(wornFor(pig).includes('muscle'), 'worn straight away')
  assert.ok(wornFor(pig).includes('whiskers'), 'over the stage look, not instead of it')
  assert.ok(pig.pending.some(event => event.kind === 'muscle'))
  // Only once: the next class does not announce it again.
  pig.pending = []
  pig.satiety = 90
  startGym(pig, 'treadmill', T0 + 200 * MIN)
  decay(pig, T0 + 231 * MIN)
  assert.equal(pig.pending.some(event => event.kind === 'muscle'), false)
})

test('migrate keeps a gym class and the heaviest weight, and repairs bad totals', () => {
  const away = migrate({ hatched: true, weightG: 90_000, activity: { kind: 'gym', key: 'treadmill', endsAt: T0 + MIN, cost: 50 } })
  assert.equal(away.activity.kind, 'gym')
  assert.equal(away.activity.cost, 50)
  assert.equal(migrate({ hatched: true, activity: { kind: 'gym', key: 'pilates', endsAt: T0 + MIN } }).activity, null)
  const old = migrate({ hatched: true, weightG: 60_000 })
  assert.equal(old.stats.gymLostG, 0)
  assert.equal(lifeStageFor(old, T0).key, 'middle', 'a save from before the gym goes by its weight')
  const slim = migrate({ hatched: true, weightG: 30_000, peakWeightG: 90_000, stats: { gymLostG: 'lots', gyms: -3 } })
  assert.equal(lifeStageFor(slim, T0).key, 'elder')
  assert.equal(slim.stats.gymLostG, 0)
  assert.equal(slim.stats.gyms, 0)
})

test('a debug weight moves the stage both ways, past the heaviest weight', () => {
  const pig = gymPig(90)
  pig.peakWeightG = 90_000
  applyDevPatch(pig, { weightG: 2000 }, T0)
  assert.equal(lifeStageFor(pig, T0).key, 'piglet')
})

// ---------------------------------------------------------------------------
// [Q0016] The golden pig: held 10000 coins at once, ever.
// ---------------------------------------------------------------------------

test('holding 10000 coins once unlocks the golden pig for good and puts it on', () => {
  const pig = hatchEgg(T0)
  const gold = () => wardrobeView(pig).find(item => item.key === 'gold')
  assert.equal(gold().slot, 'body')
  pig.coins = 9999
  noteCoins(pig, T0)
  assert.equal(gold().unlocked, false)
  pig.coins = 10_000
  noteCoins(pig, T0)
  assert.equal(pig.stats.peakCoins, 10_000)
  assert.equal(gold().unlocked, true)
  assert.ok(wornFor(pig).includes('gold'), 'nothing was on the body slot: worn at once')
  assert.equal(pig.pending.filter(event => event.kind === 'gold').length, 1)
  pig.coins = 3
  noteCoins(pig, T0)
  assert.equal(gold().unlocked, true, 'spending it all does not lock it again')
  pig.coins = 20_000
  noteCoins(pig, T0)
  assert.equal(pig.pending.filter(event => event.kind === 'gold').length, 1, 'announced once')
})

test('the golden pig does not push the muscles off, and time folding in notices a payday', () => {
  const pig = hatchEgg(T0)
  pig.stats.gymLostG = 100_000
  wear(pig, 'muscle', true, T0)
  pig.coins = 9_900
  pig.satiety = 90
  assert.equal(startWork(pig, 'tutor', T0).ok, true)
  advance(pig, T0 + 61 * MIN)
  assert.ok(pig.coins >= 10_000, `paid ${pig.coins}`)
  assert.ok(wardrobeView(pig).find(item => item.key === 'gold').unlocked)
  assert.ok(wornFor(pig).includes('muscle') && !wornFor(pig).includes('gold'), 'the body slot keeps what the owner chose')
})

test('an op that hands out a windfall counts it at once, even if the next op spends it', () => {
  let { state } = applyOp(hatchEgg(T0), { op: 'dev', args: [{ coins: 12_000 }], at: T0 })
  state = applyOp(state, { op: 'dev', args: [{ coins: 0 }], at: T0 + 1 }).state
  assert.equal(state.stats.peakCoins, 12_000)
  assert.ok(wardrobeView(state).find(item => item.key === 'gold').unlocked)
})

test('migrate starts the coin record from today and repairs a bad one', () => {
  const save = fields => ({ version: STATE_VERSION, hatched: true, ...fields })
  assert.equal(migrate(save({ coins: 4321 })).stats.peakCoins, 4321)
  assert.equal(migrate(save({ coins: 10, stats: { peakCoins: 'lots' } })).stats.peakCoins, 10)
  assert.equal(migrate(save({ coins: 10, stats: { peakCoins: 15_000 } })).stats.peakCoins, 15_000)
})
