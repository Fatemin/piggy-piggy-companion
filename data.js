/**
 * dsh-pig · data — the static game tables.
 *
 * Numbers and names only, no behaviour. The illness chains, thresholds, the
 * nine school subjects, the job/trip idea and the item categories are lifted
 * from QQ 宠物 (怀旧服 v1.2.4) as documented by xuemian168/qqpet_automation's
 * reverse engineering and the original asset tree:
 *
 *   img_res/study/  xx-* (小学) · dx-* (大学) · yjs-* (研究生)
 *                   art 美术 · chinese 语文 · labouring 劳动 · manner 礼仪 ·
 *                   mathematics 数学 · music 音乐 · pe 体育 · politics 政治 ·
 *                   wushu 武术
 *   img_res/work/   the job set
 *   img_res/food/   food art, one entry per dish
 *   img_res/commodity/  the sundries — bath things and toys
 *   models.py       ActiveOption { work, study, trip, ill, die }
 *                   PetInfo { growth, hunger, clean, health, mood, yb,
 *                             intel 智力, charm 魅力, strong 武力 }
 *                   StoreInventory { food, commodity, medicine, background }
 *
 * The last one is the reason care costs an item: the original keeps **food**,
 * **commodity** and **medicine** as separate inventory categories, and its own
 * heal path is "find the matching medicine in the bag → use it → recover".
 * Feeding, bathing and playing work the same way here.
 *
 * Attribute scale: QQ Pet counts in the thousands and its hunger ceiling grows
 * with level (3000 + 100 × min(level, 30)); this pig draws 0-100 bars instead,
 * with the QQ Pet thresholds rescaled:
 *   hunger 720/3100 ≈ 23%  → satiety < 25
 *   clean  1080/3100 ≈ 35% → cleanliness < 35
 *   mood   100/1000 = 10%  → happiness < 35 (a little kinder)
 *   health 5 → 5, unchanged — 0 is still death.
 *
 * @module dsh-pig/data
 */

// [dsh-piggy-claude-code mod] travel-only items live with the travel world.
import { SPECIALTIES } from './world.js'

/** Attribute ceilings. `health` keeps QQ Pet's 5-point scale. */
export const MAX = Object.freeze({ satiety: 100, happiness: 100, cleanliness: 100, health: 5 })

export const THRESHOLDS = Object.freeze({
  hungry: 25,
  dirty: 35,
  lonely: 35,
  sickSatiety: 25,
  sickCleanliness: 30,
})

/**
 * How bad a bad mood is, 1–3, for the sprite (mood-<key>-<level>.svg).
 * Below the first number it is level 2, below the second level 3; anything
 * that tripped the mood at all is at least level 1. Illness goes by its stage:
 * stage 1 → 1, stage 2 → 2, stages 3 and 4 → 3.
 */
export const MOOD_LEVELS = Object.freeze({
  hungry: Object.freeze([15, 5]),
  dirty: Object.freeze([20, 8]),
  lonely: Object.freeze([20, 8]),
})

export const SICK_RISK_MINUTES = 12

// ---------------------------------------------------------------------------
// Illness is measured in DAYS, not in minutes.
//
// Twenty-five minutes a stage meant a cold killed the pig inside two hours
// unless you were watching the whole time. A stage is now a day, so an
// untreated illness runs its four stages over four days — slow enough to notice,
// react and go shopping, fast enough to matter.
// ---------------------------------------------------------------------------

/**
 * How long each stage lasts, in hours, indexed by stage - 1.
 *
 * A cold comes on fast; pneumonia takes days to develop. Making every stage the
 * same length is what killed the pig in 100 minutes: four stages of 25 minutes.
 * Untreated, this ladder runs 1 + 1.5 + 2 + 3 days.
 */
export const ILLNESS_STAGE_HOURS = Object.freeze([24, 36, 48, 72])
export const ILLNESS_STAGE_MINUTES = ILLNESS_STAGE_HOURS[0] * 60

/** Milliseconds one stage lasts. */
export const illnessStageMs = stage => (ILLNESS_STAGE_HOURS[stage - 1] ?? 24) * 3_600_000

/**
 * Chance an untreated illness shakes itself off when a stage would otherwise
 * pass, by stage (index 0 = the first stage). A cold really can just go away;
 * the last stage never does — by then it needs medicine or it is fatal.
 */
export const SELF_HEAL_CHANCE = Object.freeze([0.25, 0.12, 0.05, 0])

/**
 * ---------------------------------------------------------------------------
 * Study feeds work.
 *
 * Each job leans on one trait, and every lesson the pig sits through raises
 * that trait by one point. So 体育/武术/劳动 make 搬砖 pay better and go
 * faster, 语文/数学/政治 do the same for 上班, and 美术/音乐/礼仪 for 打零工.
 * Going to school is no longer a side activity — it is how the pig gets a
 * better job.
 * ---------------------------------------------------------------------------
 */

/** Extra pay per trait point, as a fraction. 15 points doubles the wage. */
export const TRAIT_PAY_PER_POINT = 1 / 15
/** ...but a pig that studied everything still only triples the wage, or the
 *  late game has no shape left. */
export const TRAIT_PAY_CAP = 3

/** Shorter shift per trait point, capped so a job never vanishes. */
export const TRAIT_SPEED_PER_POINT = 0.04
export const TRAIT_SPEED_CAP = 0.5

/** What one trait point buys on a given job. */
export function traitBonus(traitKey, points) {
  const n = Number.isFinite(points) ? Math.max(0, points) : 0
  return {
    pay: Math.min(TRAIT_PAY_CAP, 1 + n * TRAIT_PAY_PER_POINT),
    minutes: Math.max(1 - TRAIT_SPEED_CAP, 1 - n * TRAIT_SPEED_PER_POINT),
  }
}

/** A sick pig works at half speed, so being ill has a cost without being a wall. */
export const SICK_PAY_MULTIPLIER = 0.5

/**
 * Being out and about while ill runs the clock faster: a day of work counts as
 * two days of illness. Resting at home is the cheap option.
 */
export const SICK_AWAY_MULTIPLIER = 2
export const SLEEPY_AFTER_MINUTES = 30

/**
 * [dsh-piggy-claude-code mod] Asleep — put to bed by hand, or because the
 * computer went to sleep — the pig only gets hungrier: satiety drains at the
 * usual rate while mood and cleanliness come back by these amounts per minute
 * (a night of eight hours is about +72 mood and +48 cleanliness).
 */
export const SLEEP_RECOVERY_PER_MIN = Object.freeze({ happiness: 0.15, cleanliness: 0.1 })
/** Asleep, neglect builds toward illness at half speed. */
export const SLEEP_SICK_RISK_MULTIPLIER = 0.5

/** Away from home the pig burns through its bars faster. */
export const AWAY_MULTIPLIER = 1.8

// ---------------------------------------------------------------------------
// Life — [dsh-piggy-claude-code mod] the pig is measured in kilograms.
//
// Upstream grows the pig by age (piglet → young → middle → elder by day 7) and
// lets it die of old age on day 14. This fork grows it by WEIGHT instead:
//
//   - weight comes only from food actually eaten (satiety gained), so a pig
//     that is looked after grows at the pace of its appetite: about a week to
//     80 kg, about two weeks to 120 kg, then slowly — about four more months —
//     on to 500 kg;
//   - the sprite widens with weight, from 40 px at birth to 200 px at 120 kg
//     and on to 400 px at 500 kg (two straight stretches, so a pig that was
//     already big under the old 120 kg cap keeps its size);
//   - at 80 kg it becomes an elder pig, and from then on the owner may switch
//     between the elder drawing and the original one;
//   - nothing dies of old age any more (illness can still kill, and the soul
//     pill still revives).
//
// Age is still wall-clock time since `bornAt` and still shown, it just no
// longer drives anything.
// ---------------------------------------------------------------------------

/** Growth by weight. */
export const GROWTH = Object.freeze({
  /**
   * Sprite width at hatching weight, at `bigKg` and at `fullKg`: linear from
   * hatching to `bigKg`, linear again from there to `fullKg`, capped beyond.
   * [Q0016] `bigKg`/`bigSize` were the old cap; the second stretch is new.
   */
  minSize: 40,
  bigSize: 200,
  bigKg: 120,
  maxSize: 400,
  fullKg: 500,
  /** Where the elder pig starts, and where the look becomes switchable. */
  elderKg: 80,
  /**
   * Grams per point of satiety actually gained. Satiety drains ~115 points a
   * day, so a fed pig eats ~115 points a day: ~11 kg/day below 80 kg (≈ 7 days
   * from hatching), ~5.8 kg/day up to 120 kg (≈ 7 more days), and ~2.9 kg/day
   * beyond it (≈ 130 more days to 500 kg).
   */
  gramsPerSatiety: 98,
  gramsPerSatietyElder: 50,
  gramsPerSatietyHeavy: 25,
})

/**
 * The looks an elder pig can wear. [ST0004] Kept for the old `look` command
 * only: 'elder' puts the white brows and beard (`whiskers`) on, 'original'
 * takes them off. The wardrobe below is what really dresses the pig.
 */
export const LOOKS = Object.freeze(['elder', 'original'])

// ---------------------------------------------------------------------------
// [ST0004] Wardrobe. A decoration (装饰资产) is something the pig wears and its
// owner picks; a pose (行为资产) is what the pig is doing and the game picks.
// The contract between the two: docs/contracts/art-assets.md (ART.ASSETS.V2).
// ---------------------------------------------------------------------------

/** Where a decoration sits on the pig, in drawing order (later is on top). */
/** [Q0016] `body` (drawn on the body itself, under everything) is new in ART.ASSETS.V2. */
export const WEAR_SLOTS = Object.freeze(['body', 'face', 'waist', 'eyes', 'head'])

/**
 * Every decoration, one slot each; its drawing is assets/wear-<key>.svg.
 * `unlock` is mostly worked out from progress the save already keeps, so a pig
 * that grew up before the wardrobe has its things:
 *   always            from the moment it hatches
 *   stage <key>       it has grown to that life stage ([Q0016] by its heaviest
 *                     weight, so the gym never takes it away)
 *   lessons <stage>   it has sat a lesson at that school (`null`: any school)
 *   diploma           it holds any diploma
 *   trip              it has come home from a trip
 *   region <key>      it brought a souvenir home from that region
 *   shop <price>      [ST0012] bought once on the shop's 装扮 shelf; the one
 *                     kind that is saved (`wardrobeBought`)
 *   gym <kg>          [Q0016] it has worked off that many kilograms in all
 *   coins <n>         [Q0016] it has held that many coins at once, ever
 */
const WEARABLE = fields => Object.freeze({ ...fields, unlock: Object.freeze(fields.unlock) })
export const WEARABLES = Object.freeze([
  WEARABLE({ key: 'bow', slot: 'head', label: '蝴蝶结', emoji: '🎀', unlock: { kind: 'always' } }),
  WEARABLE({ key: 'flatcap', slot: 'head', label: '鸭舌帽', emoji: '🧢', unlock: { kind: 'stage', stage: 'middle' } }),
  WEARABLE({ key: 'mortarboard', slot: 'head', label: '学士帽', emoji: '🎓', unlock: { kind: 'diploma' } }),
  WEARABLE({ key: 'strawhat', slot: 'head', label: '草帽', emoji: '👒', unlock: { kind: 'trip' } }),
  WEARABLE({ key: 'glasses', slot: 'eyes', label: '圆眼镜', emoji: '👓', unlock: { kind: 'lessons', stage: null } }),
  WEARABLE({ key: 'sunglasses', slot: 'eyes', label: '墨镜', emoji: '🕶️', unlock: { kind: 'region', region: 'mideast' } }),
  WEARABLE({ key: 'scarf', slot: 'waist', label: '红领巾', emoji: '🧣', unlock: { kind: 'lessons', stage: 'primary' } }),
  WEARABLE({ key: 'whiskers', slot: 'face', label: '白眉白胡子', emoji: '🧓', unlock: { kind: 'stage', stage: 'elder' } }),
  // [ST0012] Waist gear on sale: today's trends and old internet memes.
  WEARABLE({ key: 'hulahoop', slot: 'waist', label: '网红呼啦圈', emoji: '⭕', unlock: { kind: 'shop', price: 66 } }),
  WEARABLE({ key: 'swimring', slot: 'waist', label: '小黄鸭游泳圈', emoji: '🦆', unlock: { kind: 'shop', price: 88 } }),
  WEARABLE({ key: 'fannypack', slot: 'waist', label: '多巴胺腰包', emoji: '👝', unlock: { kind: 'shop', price: 168 } }),
  WEARABLE({ key: 'chainbelt', slot: 'waist', label: '杀马特腰链', emoji: '⛓️', unlock: { kind: 'shop', price: 188 } }),
  WEARABLE({ key: 'pager', slot: 'waist', label: 'BP机皮带', emoji: '📟', unlock: { kind: 'shop', price: 288 } }),
  // [Q0016] Worked off this many kilograms at the gym (GYM.muscleKg reads it).
  WEARABLE({ key: 'muscle', slot: 'body', label: '肌肉', emoji: '💪', unlock: { kind: 'gym', kg: 100 } }),
  // [Q0016] Held this many coins at once, at any point (stats.peakCoins).
  WEARABLE({ key: 'gold', slot: 'body', label: '黄金猪', emoji: '🪙', unlock: { kind: 'coins', coins: 10000 } }),
])

export const wearableByKey = key => WEARABLES.find(item => item.key === key) ?? null
/**
 * [ST0012] The decorations the shop sells, as its 装扮 shelf lists them. They
 * are not SHOP items: never in the bag, never used up, bought once each.
 */
export const WEAR_FOR_SALE = Object.freeze(WEARABLES.filter(item => item.unlock.kind === 'shop').map(item => Object.freeze({
  key: item.key, label: item.label, emoji: item.emoji, price: item.unlock.price, kind: 'wear', slot: item.slot,
})))

/**
 * What a pig wears until its owner dresses it: each life stage's own look, as
 * the stage drawings used to have it baked in. An `outfit` of `null` in the
 * save means "follow this table".
 */
export const STAGE_OUTFIT = Object.freeze({
  piglet: Object.freeze(['bow']),
  young: Object.freeze([]),
  middle: Object.freeze(['flatcap']),
  elder: Object.freeze(['whiskers']),
})

/**
 * Where the stages change over, in kilograms. The `size` here is only the
 * upstream age-based value and the box's own size: a hatched pig's sprite
 * always comes from `sizeForWeight`, smoothly, not from these steps.
 */
export const LIFE_STAGES = Object.freeze([
  Object.freeze({
    key: 'box', label: '纸盒', emoji: '📦', art: 'stage-box', size: 58, from: 0, fromKg: 0, box: true,
    line: '一个纸盒，侧面戳了几个透气孔',
  }),
  Object.freeze({
    key: 'piglet', label: '小猪', emoji: '🐖', art: 'stage-piglet', size: 40, from: 0, fromKg: 0,
    line: '刚从纸盒里蹦出来，圆头圆脑',
  }),
  Object.freeze({
    key: 'young', label: '青年猪', emoji: '🐖', art: 'stage-young', size: 48, from: 1, fromKg: 20,
    line: '长开了，走路带风',
  }),
  Object.freeze({
    key: 'middle', label: '中年猪', emoji: '🐖', art: 'stage-middle', size: 62, from: 3, fromKg: 50,
    line: '很有分量，会一屁股坐住你的椅子',
  }),
  Object.freeze({
    key: 'elder', label: '老年猪', emoji: '🐖', art: 'stage-elder', size: 56, from: 7, fromKg: 80,
    line: '鬃毛白了，獠牙还在',
  }),
])

/** Days a pig lived before old age took it — upstream only; this fork never uses it. */
export const LIFESPAN_DAYS = 14

/** The tombstone and the soul that settles on an unclaimed one. */
export const GRAVE = Object.freeze({ key: 'grave', label: '墓碑', emoji: '🪦', art: 'stage-grave', size: 52, line: '这里躺着一只猪' })
export const SOUL = Object.freeze({ emoji: '👻', art: 'soul', label: '灵魂' })
/** How long a grave is left alone before the soul turns up. */
export const SOUL_AFTER_DAYS = 1

export const lifeStageByKey = key => LIFE_STAGES.find(stage => stage.key === key) ?? null

// ---------------------------------------------------------------------------
// Time — QQ Pet hands out timers measured in hours, not seconds. The desktop
// pet sits in a corner for a working day; the pig should too.
// ---------------------------------------------------------------------------

export const MINUTES = Object.freeze({
  quarter: 15,
  half: 30,
  hour: 60,
  twoHours: 120,
  threeHours: 180,
  fourHours: 240,
  sixHours: 360,
  eightHours: 480,
  day: 1440,
})

// ---------------------------------------------------------------------------
// Illness — three chains of four stages, straight from the reverse engineering.
// ---------------------------------------------------------------------------

const CHAIN = (name, stages) => Object.freeze({ name, stages: Object.freeze(stages) })

export const ILLNESS_CHAINS = Object.freeze([
  CHAIN('感冒', [
    { name: '感冒', cure: '板蓝根' },
    { name: '发烧', cure: '退烧药' },
    { name: '重感冒', cure: '银翘丸' },
    { name: '肺炎', cure: '金色消炎药水' },
  ]),
  CHAIN('咳嗽', [
    { name: '咳嗽', cure: '枇杷糖浆' },
    { name: '支气管炎', cure: '甘草剂' },
    { name: '哮喘', cure: '定喘丸' },
    { name: '肺结核', cure: '通风散' },
  ]),
  CHAIN('肚子胀', [
    { name: '肚子胀', cure: '消食片' },
    { name: '胃炎', cure: '蓝色消炎药水' },
    { name: '胃溃疡', cure: '龙胆草' },
    { name: '胃癌', cure: '仙人汤' },
  ]),
])

/** Health left at each illness stage index (0-based): 4, 3, 2, 1. */
export const STAGE_HEALTH = Object.freeze([4, 3, 2, 1])

export const REVIVE_ITEM = Object.freeze({ key: 'soul', label: '还魂丹', emoji: '✨', price: 150, kind: 'revive' })

/** [dsh-piggy-claude-code mod] Renaming a pig that already has a name costs one of these. */
export const RENAME_CARD = Object.freeze({ key: 'renamecard', label: '更名卡', emoji: '🪪', price: 1000, kind: 'card' })

// ---------------------------------------------------------------------------
// Work — the pig leaves the desk and earns coins. A shift is a real shift.
// ---------------------------------------------------------------------------

/**
 * [dsh-piggy-claude-code mod] Jobs, grouped by the trait they lean on.
 *
 * Every trait has a ladder of shift lengths, plus one 15-minute gig whose pay
 * is a roll (`random: [min, max]`, before the trait bonus) and whose length is
 * `fixed` — schooling raises its pay but never shortens it. Any job may roll
 * its pay (VTuber does); only `fixed` keeps the length. The top rung of
 * each trait is a "career" that needs trait points first (`requires`). Every
 * job has its own outfit and working animation (`art`, drawn in assets/job-*.svg).
 */
const JOB = (fields) => Object.freeze({ tier: 'basic', requires: null, random: null, fixed: false, art: null, ...fields })

export const JOBS = Object.freeze([
  // --- 🧠 smarts ------------------------------------------------------------
  JOB({ key: 'label', label: 'AI 数据标注', emoji: '🏷️', trait: 'intel', minutes: MINUTES.quarter, coins: 45, random: Object.freeze([10, 80]), fixed: true, xp: 45, satiety: -5, cleanliness: -2, art: 'label' }),
  JOB({ key: 'tutor', label: '家教', emoji: '📝', trait: 'intel', minutes: MINUTES.hour, coins: 200, xp: 220, satiety: -12, cleanliness: -6, art: 'tutor' }),
  JOB({ key: 'office', label: '上班', emoji: '💼', trait: 'intel', minutes: MINUTES.fourHours, coins: 900, xp: 900, satiety: -34, cleanliness: -26, art: 'office' }),
  JOB({ key: 'aitrainer', label: 'AI 训练师', emoji: '🤖', trait: 'intel', minutes: MINUTES.threeHours, coins: 1150, xp: 1150, satiety: -28, cleanliness: -12, tier: 'pro', requires: Object.freeze({ intel: 20 }), art: 'aitrainer' }),
  // --- ✨ charm -------------------------------------------------------------
  JOB({ key: 'stall', label: '摆地摊', emoji: '🛍️', trait: 'charm', minutes: MINUTES.quarter, coins: 45, random: Object.freeze([5, 85]), fixed: true, xp: 45, satiety: -6, cleanliness: -4, art: 'stall' }),
  JOB({ key: 'odd', label: '打零工', emoji: '🧹', trait: 'charm', minutes: MINUTES.quarter, coins: 40, xp: 45, satiety: -6, cleanliness: -4, art: 'odd' }),
  JOB({ key: 'tea', label: '奶茶店员', emoji: '🧋', trait: 'charm', minutes: 90, coins: 300, xp: 320, satiety: -14, cleanliness: -8, art: 'tea' }),
  JOB({ key: 'influencer', label: '网红', emoji: '🤳', trait: 'charm', minutes: MINUTES.twoHours, coins: 760, xp: 770, satiety: -18, cleanliness: -6, tier: 'pro', requires: Object.freeze({ charm: 15 }), art: 'influencer' }),
  // A stream can flop or go viral: the pay is a roll, but the stream still runs its full length.
  JOB({ key: 'vtuber', label: 'VTuber', emoji: '🎙️', trait: 'charm', minutes: MINUTES.threeHours, coins: 1300, random: Object.freeze([200, 2400]), xp: 1300, satiety: -26, cleanliness: -8, tier: 'pro', requires: Object.freeze({ charm: 30, intel: 10 }), art: 'vtuber' }),
  // --- 💪 strength ----------------------------------------------------------
  JOB({ key: 'rider', label: '外卖骑手', emoji: '🛵', trait: 'strong', minutes: MINUTES.quarter, coins: 45, random: Object.freeze([10, 80]), fixed: true, xp: 45, satiety: -8, cleanliness: -6, art: 'rider' }),
  JOB({ key: 'site', label: '搬砖', emoji: '🧱', trait: 'strong', minutes: MINUTES.hour, coins: 210, xp: 230, satiety: -16, cleanliness: -14, art: 'site' }),
  JOB({ key: 'sorting', label: '快递分拣', emoji: '📦', trait: 'strong', minutes: MINUTES.threeHours, coins: 690, xp: 700, satiety: -30, cleanliness: -22, art: 'sorting' }),
  JOB({ key: 'coach', label: '健身教练', emoji: '🏋️', trait: 'strong', minutes: MINUTES.twoHours, coins: 780, xp: 780, satiety: -26, cleanliness: -20, tier: 'pro', requires: Object.freeze({ strong: 15 }), art: 'coach' }),
])

/** [mod] Which trait points a job still lacks: [] when the pig qualifies. */
export function jobMissing(job, traits) {
  if (job === null || job.requires === null) return []
  return Object.entries(job.requires)
    .filter(([trait, need]) => (traits?.[trait] ?? 0) < need)
    .map(([trait, need]) => ({ trait, need, have: traits?.[trait] ?? 0 }))
}

// ---------------------------------------------------------------------------
// [Q0016] The gym (健身房), behind a door on the work page. A session is an
// outing like a lesson: pay, go, come back lighter — and hungrier and sweatier.
//
//   - weight never drops below `floorKg`; a pig at the floor is turned away;
//   - the life stage, and the looks it unlocks, follow the heaviest the pig
//     has been (`peakWeightG`), so slimming down never makes it younger;
//   - every gram taken off counts towards `muscleKg` in total, which unlocks
//     the muscle look (`muscle`, the body slot) for good.
//
// Losses are sized against what food puts back: a fed pig eats ~115 satiety a
// day, worth ~11 kg below 80 kg and ~2.9 kg past 120 kg (GROWTH).
// ---------------------------------------------------------------------------

/** `muscleKg` is the muscle look's own unlock, so the two cannot drift apart. */
export const GYM = Object.freeze({ floorKg: 20, muscleKg: wearableByKey('muscle').unlock.kg })

/** One class: `lossG` comes off on the way home, the bars move like a job's. */
const GYM_CLASS = fields => Object.freeze(fields)
export const GYM_CLASSES = Object.freeze([
  GYM_CLASS({ key: 'treadmill', label: '跑步机', emoji: '🏃', minutes: MINUTES.half, price: 50, lossG: 2000, satiety: -10, cleanliness: -10, happiness: 2 }),
  GYM_CLASS({ key: 'weights', label: '撸铁', emoji: '🏋️', minutes: MINUTES.hour, price: 150, lossG: 5000, satiety: -16, cleanliness: -16, happiness: 0 }),
  GYM_CLASS({ key: 'trainer', label: '私教课', emoji: '💪', minutes: MINUTES.twoHours, price: 400, lossG: 12000, satiety: -24, cleanliness: -22, happiness: -2 }),
])

export const gymClassByKey = key => GYM_CLASSES.find(entry => entry.key === key) ?? null

// ---------------------------------------------------------------------------
// [dsh-piggy-claude-code mod] Scratch cards, sold at the shop counter.
//
// One card every ten minutes. The prize table is weighted so a card is worth
// about 81 coins on average: a small, fun loss, never a way to farm money.
// `mood` picks the pig's reaction: jackpot (spins), happy (streamers), sad
// (a rain cloud over its head).
// ---------------------------------------------------------------------------

export const LOTTERY = Object.freeze({
  price: 100,
  cooldownMinutes: 10,
  prizes: Object.freeze([
    Object.freeze({ tier: 'first', label: '一等奖', emoji: '🏆', coins: 10000, chance: 0.002, mood: 'jackpot', happiness: 30 }),
    Object.freeze({ tier: 'second', label: '二等奖', emoji: '🥈', coins: 1000, chance: 0.02, mood: 'happy', happiness: 15 }),
    Object.freeze({ tier: 'third', label: '三等奖', emoji: '🥉', coins: 200, chance: 0.08, mood: 'happy', happiness: 10 }),
    Object.freeze({ tier: 'comfort', label: '安慰奖', emoji: '🍬', coins: 100, chance: 0.25, mood: 'happy', happiness: 5 }),
    Object.freeze({ tier: 'none', label: '谢谢参与', emoji: '🌧️', coins: 0, chance: 1, mood: 'sad', happiness: -5 }),
  ]),
})

/** Draw a prize for a roll in [0, 1). The last entry catches everything left. */
export function lotteryPrize(roll) {
  let left = roll
  for (const prize of LOTTERY.prizes) {
    if (left < prize.chance) return prize
    left -= prize.chance
  }
  return LOTTERY.prizes[LOTTERY.prizes.length - 1]
}

// ---------------------------------------------------------------------------
// [ST0015] Blackjack, at the same counter: bet, draw, stand, paid by the total.
//
// No dealer: the hand alone decides. Below `standAt` the pig has to draw; over
// 21 is bust and the bet is gone. A stand pays the bet times its total's
// multiplier, and exactly 21 (on the deal or after drawing) pays 10×, so the
// small totals pay little and the whole game is pushing toward 21. Played
// well it returns about 2× the bet on average, about 40% of hands bust and
// about 14% land on 21 (the owner's call, ST0015).
//
// Cards come from one shuffled 52-card deck per hand; `card` is 0–51, rank
// `card % 13` (0 = A, 10–12 = J Q K) and suit `Math.floor(card / 13)`.
// ---------------------------------------------------------------------------

export const BLACKJACK = Object.freeze({
  bets: Object.freeze([100, 200, 500]),
  standAt: 18,
  payouts: Object.freeze([
    Object.freeze({ total: 18, multiplier: 1.1 }),
    Object.freeze({ total: 19, multiplier: 1.3 }),
    Object.freeze({ total: 20, multiplier: 1.8 }),
    Object.freeze({ total: 21, multiplier: 10 }),
  ]),
  // Mood after the hand: hitting 21, any other paid stand, and a bust.
  happiness: Object.freeze({ jackpot: 20, win: 5, bust: -5 }),
})

const CARD_RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'])
const CARD_SUITS = Object.freeze(['♠', '♥', '♦', '♣'])

/** A card (0–51) as `{ rank, suit }` for display. */
export function blackjackCard(card) {
  return { rank: CARD_RANKS[card % 13], suit: CARD_SUITS[Math.floor(card / 13)] }
}

/** The best total of a hand: aces count 11 while that does not bust, else 1. */
export function blackjackTotal(cards) {
  let total = 0
  let aces = 0
  for (const card of cards) {
    const rank = card % 13
    if (rank === 0) aces += 1
    total += rank === 0 ? 1 : Math.min(rank + 1, 10)
  }
  const soft = aces > 0 && total + 10 <= 21
  return { total: soft ? total + 10 : total, soft }
}

/** What a stand on `total` pays per coin bet; 0 below the table. */
export function blackjackMultiplier(total) {
  return BLACKJACK.payouts.find(row => row.total === total)?.multiplier ?? 0
}

// ---------------------------------------------------------------------------
// Study — the nine QQ Pet subjects, each tied to one of the three traits.
//
// The stages are a ladder, not a menu: QQ Pet starts every pet at 小学 and the
// higher stages sit behind it. `requires` is that gate — you must finish every
// subject once at the previous stage before the next one opens.
// ---------------------------------------------------------------------------

/** The three traits QQ Pet tracks alongside growth. */
export const TRAITS = Object.freeze({
  intel: Object.freeze({ key: 'intel', label: '智力', emoji: '🧠' }),
  charm: Object.freeze({ key: 'charm', label: '魅力', emoji: '✨' }),
  strong: Object.freeze({ key: 'strong', label: '武力', emoji: '💪' }),
})

export const TRAIT_ORDER = Object.freeze(['intel', 'charm', 'strong'])

/** Nine subjects, mirroring the img_res/study artwork. */
export const SUBJECTS = Object.freeze([
  Object.freeze({ key: 'chinese', label: '语文', emoji: '📖', trait: 'intel' }),
  Object.freeze({ key: 'mathematics', label: '数学', emoji: '🔢', trait: 'intel' }),
  Object.freeze({ key: 'politics', label: '政治', emoji: '⚖️', trait: 'intel' }),
  Object.freeze({ key: 'art', label: '美术', emoji: '🎨', trait: 'charm' }),
  Object.freeze({ key: 'music', label: '音乐', emoji: '🎵', trait: 'charm' }),
  Object.freeze({ key: 'manner', label: '礼仪', emoji: '🎩', trait: 'charm' }),
  Object.freeze({ key: 'pe', label: '体育', emoji: '🏃', trait: 'strong' }),
  Object.freeze({ key: 'wushu', label: '武术', emoji: '🥋', trait: 'strong' }),
  Object.freeze({ key: 'labouring', label: '劳动', emoji: '🧺', trait: 'strong' }),
])

/**
 * School stages, mirroring the xx- / dx- / yjs- asset prefixes.
 *
 * [dsh-piggy-claude-code mod] Two kinds of school, to keep traits from running
 * away (ST0002):
 *
 *   小学 · 大学     cheap and quick, but each subject may only be taken `cap`
 *                  times per stage. Together they hand every trait at most
 *                  3 × 2 × (1 + 2) = 18 points: shifts already at their
 *                  shortest (12.5 points), the 15-point careers open, wage × 2.2.
 *   研究生 · 博士   no cap, but dear: the last 12 points to the wage cap (30)
 *                  cost 600–750 coins each. Sittings are short (2 h / 4 h), so
 *                  it is the coins, not the clock, that slow them down.
 *
 *   stage    coins/point   points/hour (full sitting)
 *   小学          15            2
 *   大学          30            4
 *   研究生       600            1.5
 *   博士         750            1.5   (graduation still +1 each, once)
 *
 * `cap` is per subject per stage; `null` means no limit.
 */
export const SCHOOL_STAGES = Object.freeze([
  Object.freeze({
    key: 'primary', label: '小学', minutes: MINUTES.half,
    tuition: 15, gain: 1, cap: 2, xp: 60, satiety: -8, happiness: -2, requires: null,
  }),
  Object.freeze({
    key: 'college', label: '大学', minutes: MINUTES.hour,
    tuition: 60, gain: 2, cap: 2, xp: 200, satiety: -12, happiness: -3,
    requires: Object.freeze({ stage: 'primary', lessons: 9, label: '小学九门课各上一次' }),
  }),
  Object.freeze({
    key: 'graduate', label: '研究生', minutes: MINUTES.twoHours,
    tuition: 600, gain: 1, cap: null, xp: 400, satiety: -18, happiness: -5,
    requires: Object.freeze({ stage: 'college', lessons: 9, label: '大学九门课各上一次' }),
  }),
  // [dsh-piggy-claude-code mod] a doctorate after graduate school.
  Object.freeze({
    key: 'doctor', label: '博士', minutes: MINUTES.fourHours,
    tuition: 1500, gain: 2, cap: null, xp: 1000, satiety: -24, happiness: -7,
    requires: Object.freeze({ stage: 'graduate', lessons: 9, label: '研究生九门课各上一次' }),
  }),
])

/**
 * [dsh-piggy-claude-code mod] How many subjects one sitting can take at each
 * stage: one at 小学, two at 大学, three from 研究生 on. Tuition, satiety and
 * mood costs are paid per subject; the sitting lasts as long as one lesson.
 */
export const PARALLEL_COURSES = Object.freeze({ primary: 1, college: 2, graduate: 3, doctor: 3 })

/**
 * [ST0014] Going out together (a pig pen invite): the outing is 30% faster
 * (its length ÷ speed) and pays 30% more (coins, xp, mood; trait points on
 * average — the fraction is a roll of the pig's own dice).
 */
export const COOP = Object.freeze({ speed: 1.3, bonus: 1.3, kinds: Object.freeze(['work', 'study', 'trip']) })

/** Defending the thesis: every 博士 subject once pays this, a single time. */
export const DOCTOR_GRADUATION = Object.freeze({ lessons: 9, traits: Object.freeze({ intel: 1, charm: 1, strong: 1 }) })

/**
 * [dsh-piggy-claude-code mod] A diploma for every school, kept in the bag as a
 * collectible. 小学 and 大学 hand one out once `lessons` lessons are done there;
 * 研究生 and 博士 hand out another for every further `lessons` (`repeat`).
 * The count is worked out from `lessonsByStage`, so nothing extra is saved and
 * a pig that studied before diplomas existed already has its own.
 */
const DIPLOMA = fields => Object.freeze({ lessons: 9, repeat: false, ...fields })
export const DIPLOMAS = Object.freeze([
  DIPLOMA({ key: 'diploma-primary', stage: 'primary', label: '小学毕业证', emoji: '📃' }),
  DIPLOMA({ key: 'diploma-college', stage: 'college', label: '大学毕业证', emoji: '📜' }),
  DIPLOMA({ key: 'diploma-graduate', stage: 'graduate', label: '硕士学位证', emoji: '🎖️', repeat: true }),
  DIPLOMA({ key: 'diploma-doctor', stage: 'doctor', label: '博士学位证', emoji: '🎓', repeat: true }),
])

/** How many of `diploma` a pig with `lessons` lessons at its stage holds. */
export function diplomaCount(diploma, lessons) {
  const n = Number.isFinite(lessons) ? Math.max(0, Math.floor(lessons)) : 0
  return diploma.repeat ? Math.floor(n / diploma.lessons) : (n >= diploma.lessons ? 1 : 0)
}

// ---------------------------------------------------------------------------
// Travel — QQ Pet's `trip` option. The pig goes away and comes back with a
// souvenir for the collection.
// ---------------------------------------------------------------------------

export const TRIPS = Object.freeze([
  Object.freeze({ key: 'suburb', label: '郊游', emoji: '🏞', minutes: MINUTES.hour, cost: 60, happiness: 10, xp: 80, satiety: -8, souvenirs: Object.freeze(['四叶草', '松果', '野花']) }),
  Object.freeze({ key: 'mountain', label: '名山大川', emoji: '🏔', minutes: MINUTES.threeHours, cost: 200, happiness: 16, xp: 260, satiety: -20, souvenirs: Object.freeze(['云海照片', '山石', '竹杖']) }),
  Object.freeze({ key: 'sea', label: '看海', emoji: '🌊', minutes: MINUTES.eightHours, cost: 620, happiness: 24, xp: 700, satiety: -42, souvenirs: Object.freeze(['贝壳', '海盐', '漂流瓶']) }),
  Object.freeze({ key: 'abroad', label: '出国', emoji: '🌍', minutes: MINUTES.day, cost: 2000, happiness: 38, xp: 2000, satiety: -80, souvenirs: Object.freeze(['外国硬币', '异国邮票', '手写明信片']) }),
])

// ---------------------------------------------------------------------------
// Items — one shop, four shelves.
//
//   food      feeds the pig
//   bath      washes it
//   toy       plays with it
//   medicine  cures it (four tiers, one per illness stage)
//   revive    brings it back
//
// Buying is not the only way in: every pig owns one scruffy default toy for
// free, so `玩耍` always works even with an empty bag. That mirrors QQ Pet,
// where the pet can amuse itself without a bought plaything.
// ---------------------------------------------------------------------------

export const DEFAULT_TOY = Object.freeze({
  key: 'ball', label: '小皮球', emoji: '🎾', price: 0, kind: 'toy',
  happiness: 12, satiety: -3, default: true,
})

export const SHOP = Object.freeze([
  // --- food ---------------------------------------------------------------
  Object.freeze({ key: 'apple', label: '苹果', emoji: '🍎', price: 6, kind: 'food', satiety: 22, happiness: 3 }),
  Object.freeze({ key: 'bread', label: '面包', emoji: '🍞', price: 10, kind: 'food', satiety: 32, happiness: 4 }),
  Object.freeze({ key: 'bone', label: '肉骨头', emoji: '🍖', price: 15, kind: 'food', satiety: 45, happiness: 8, cleanliness: -4 }),
  Object.freeze({ key: 'rice', label: '蛋炒饭', emoji: '🍚', price: 24, kind: 'food', satiety: 58, happiness: 10 }),
  Object.freeze({ key: 'cake', label: '奶油蛋糕', emoji: '🎂', price: 40, kind: 'food', satiety: 80, happiness: 18, cleanliness: -8 }),
  Object.freeze({ key: 'noodle', label: '大碗拉面', emoji: '🍜', price: 66, kind: 'food', satiety: 100, happiness: 26, cleanliness: -6 }),
  // [ST0020] A lifeline for a broke pig: one a day, a tenth of a full belly.
  // It sits last on the shelf, so feeding reaches for it only when nothing
  // better is in the bag.
  Object.freeze({ key: 'ration', label: '应急食物', emoji: '🥫', price: 1, kind: 'food', satiety: 10, happiness: 0, dailyLimit: 1 }),
  // --- bath ---------------------------------------------------------------
  Object.freeze({ key: 'soap', label: '香皂', emoji: '🧼', price: 6, kind: 'bath', cleanliness: 35, happiness: 2 }),
  Object.freeze({ key: 'shower', label: '冲个澡', emoji: '🚿', price: 10, kind: 'bath', cleanliness: 50, happiness: 3 }),
  Object.freeze({ key: 'shampoo', label: '沐浴露', emoji: '🧴', price: 14, kind: 'bath', cleanliness: 65, happiness: 6 }),
  Object.freeze({ key: 'bubble', label: '泡泡浴', emoji: '🛁', price: 28, kind: 'bath', cleanliness: 100, happiness: 14 }),
  Object.freeze({ key: 'sauna', label: '泡温泉', emoji: '🧖', price: 58, kind: 'bath', cleanliness: 100, happiness: 24, satiety: -8 }),
  // --- toys ---------------------------------------------------------------
  Object.freeze({ key: 'yoyo', label: '悠悠球', emoji: '🪀', price: 30, kind: 'toy', happiness: 22, satiety: -4 }),
  Object.freeze({ key: 'blocks', label: '积木', emoji: '🎲', price: 45, kind: 'toy', happiness: 30, satiety: -5 }),
  Object.freeze({ key: 'plush', label: '布偶', emoji: '🧸', price: 75, kind: 'toy', happiness: 42, satiety: -7 }),
  Object.freeze({ key: 'scooter', label: '滑板车', emoji: '🛴', price: 120, kind: 'toy', happiness: 58, satiety: -10, cleanliness: -6 }),
  Object.freeze({ key: 'carousel', label: '旋转木马', emoji: '🎠', price: 260, kind: 'toy', happiness: 80, satiety: -12, cleanliness: -8 }),
  // --- medicine -----------------------------------------------------------
  Object.freeze({ key: 'med1', label: '普通药', emoji: '💊', price: 12, kind: 'medicine', tier: 1 }),
  Object.freeze({ key: 'med2', label: '特效药', emoji: '💊', price: 26, kind: 'medicine', tier: 2 }),
  Object.freeze({ key: 'med3', label: '进口药', emoji: '💉', price: 52, kind: 'medicine', tier: 3 }),
  Object.freeze({ key: 'med4', label: '秘方药', emoji: '🧪', price: 95, kind: 'medicine', tier: 4 }),
  // --- revive -------------------------------------------------------------
  REVIVE_ITEM,
  // --- cards [dsh-piggy-claude-code mod] -----------------------------------
  RENAME_CARD,
])

/** Shop shelves, in the order the panel shows them. */
export const KIND_ORDER = Object.freeze(['food', 'bath', 'toy', 'medicine', 'revive', 'card', 'wear'])

export const KIND_LABEL = Object.freeze({
  food: '食物',
  bath: '洗浴',
  toy: '玩具',
  medicine: '药品',
  revive: '复活',
  card: '道具',
  // [ST0012] Not a SHOP item: the shelf lists WEAR_FOR_SALE, bought once each.
  wear: '装扮',
})

/** Which care action spends which shelf. */
export const CARE_KIND = Object.freeze({ feed: 'food', bathe: 'bath', play: 'toy' })

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export const jobByKey = key => JOBS.find(job => job.key === key) ?? null
/** [dsh-piggy-claude-code mod] Shop items plus travel-only specialties. */
export const ALL_ITEMS = Object.freeze([...SHOP, ...SPECIALTIES])
export const itemByKey = key => ALL_ITEMS.find(item => item.key === key) ?? null
export const subjectByKey = key => SUBJECTS.find(subject => subject.key === key) ?? null
export const schoolStageByKey = key => SCHOOL_STAGES.find(stage => stage.key === key) ?? null
export const tripByKey = key => TRIPS.find(trip => trip.key === key) ?? null

export const itemsOfKind = kind => SHOP.filter(item => item.kind === kind)

/** Every item a care action will accept: the shelf, plus the free default toy. */
export function careItems(kind) {
  const bought = [...itemsOfKind(kind), ...SPECIALTIES.filter(item => item.kind === kind)]
  return kind === 'toy' ? [DEFAULT_TOY, ...bought] : bought
}

export const medicineForStage = stage => SHOP.find(item => item.kind === 'medicine' && item.tier === stage) ?? null

/** The stage a fresh pig may enrol in: the first one with no gate. */
export const FIRST_STAGE = SCHOOL_STAGES[0].key

/**
 * Whether `stage` is open yet, given how many lessons have been finished at
 * each earlier stage.
 * @param {{key: string, requires: {stage: string, lessons: number, label: string}|null}} stage
 * @param {Record<string, number>} lessonsByStage
 */
export function stageUnlocked(stage, lessonsByStage) {
  if (stage === null || stage === undefined) return false
  const need = stage.requires
  if (!need) return true
  return (lessonsByStage?.[need.stage] ?? 0) >= need.lessons
}

/** How far along the gate is, for the panel's progress hint. */
export function stageProgress(stage, lessonsByStage) {
  const need = stage.requires
  if (!need) return null
  const done = lessonsByStage?.[need.stage] ?? 0
  return { done, need: need.lessons, label: need.label, stage: need.stage }
}

export function illnessAt(chainIndex, stage) {
  const chain = ILLNESS_CHAINS[chainIndex]
  if (chain === undefined) return null
  const entry = chain.stages[stage - 1]
  if (entry === undefined) return null
  return { chain: chain.name, stage, name: entry.name, cure: entry.cure, health: STAGE_HEALTH[stage - 1] }
}

export const nextIllness = (chainIndex, stage) => illnessAt(chainIndex, stage + 1)

/** Every course key a fresh pig has not studied yet. */
export const SUBJECT_KEYS = SUBJECTS.map(subject => subject.key)
