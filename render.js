/**
 * dsh-pig · render — every word the pig says.
 *
 * Pure string building: the command handlers, the HTTP actions, the tests and
 * the client bubble all read from here, so the pig's voice lives in exactly one
 * file.
 *
 * @module dsh-pig/render
 *
 * [dsh-piggy-claude-code mod] Every sentence goes through `tr(lang, 中文)`; the
 * Chinese literal is the key into locales/render.js. Data labels (stages, jobs,
 * items, moods…) are passed through `tr` too and translated by their own
 * locale files.
 */

import {
  ACTIONS,
  ACTION_ORDER,
  JOBS,
  MAX,
  REVIVE_ITEM,
  SCHOOL_STAGES,
  SHOP,
  SUBJECTS,
  TRAITS,
  TRAIT_ORDER,
  actionCooldownSeconds,
  activityLabel as coreActivityLabel,
  activitySecondsLeft,
  bar,
  courseView,
  stageLessons,
  formatWeight,
  healthPercent,
  lessonLabel,
  lifeStageFor,
  mood,
  perksOf,
  diplomaView,
  regionProgress,
  traitView,
  tripQuote,
  outfitIsAuto,
  wardrobeView,
} from './core.js'
import { DOCTOR_GRADUATION, PARALLEL_COURSES, RENAME_CARD, WEAR_SLOTS, illnessAt, lifeStageByKey, schoolStageByKey } from './data.js'
import { langOf, tr } from './i18n.js'
import { FARE, REGIONS, SOUVENIRS, WORLD_BONUS } from './world.js'

const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━━'

/** Which portrait face matches the mood. */
function face(currentMood) {
  switch (currentMood.key) {
    case 'sleepy': return { l: '˘', r: '˘', m: 'ω' }
    case 'asleep': return { l: '－', r: '－', m: 'ᶻ' }
    case 'hungry': return { l: '◕', r: '◕', m: 'o' }
    case 'dirty': return { l: 'ò', r: 'ó', m: '益' }
    case 'sick': return { l: '×', r: '×', m: '︿' }
    case 'dead': return { l: '×', r: '×', m: '︵' }
    case 'working': return { l: '•', r: '•', m: 'ω' }
    case 'happy': return { l: '^', r: '^', m: 'ω' }
    case 'lonely': return { l: '◕', r: '◕', m: '︵' }
    default: return { l: '◕', r: '◕', m: 'ω' }
  }
}

/** 🐖 with a face that follows the mood. */
export function portrait(stage, currentMood) {
  if (stage.key === 'box') {
    return [
      '      🥚',
      '   ╭───────╮',
      '   │  〜〜  │',
      '   ╰───────╯',
    ]
  }
  const f = face(currentMood)
  const hat = currentMood.key === 'working' ? ' 💼' : currentMood.key === 'dead' ? ' 💀' : ''
  return [
    `      ${stage.emoji}${hat}`,
    '   ╭───────╮',
    `   │ ${f.l}   ${f.r} │`,
    `   │   ${f.m}   │`,
    '   ╰───────╯',
  ]
}

/** A quoted one-liner under the portrait, 「…」 in zh/ja and "…" in en. */
const quote = (lang, text) => tr(lang, '「{line}」', { line: tr(lang, text) })

/** The pig's name, or a stand-in when there is no pig. */
const nameOf = (lang, state) => state?.name ?? tr(lang, '猪')

/** What the pig is out doing, translated; a lesson is rebuilt from its stage + subjects. */
const activityLabel = (lang, activity) => coreActivityLabel(activity, lang)

/** [dsh-piggy-claude-code mod] "45 分钟" / "3 小时" / "2 小时 30 分钟". */
function durationText(lang, minutes) {
  const total = Math.max(1, Math.round(minutes))
  if (total < 60) return tr(lang, '{n} 分钟', { n: total })
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? tr(lang, '{n} 小时', { n: h }) : tr(lang, '{h} 小时 {m} 分钟', { h, m })
}

/** [mod] A UTC offset as "UTC+9" / "UTC+5:30" / "UTC-3". */
export function utcText(offset) {
  const n = Number(offset) || 0
  const sign = n < 0 ? '-' : '+'
  const abs = Math.abs(n)
  const h = Math.floor(abs)
  const m = Math.round((abs - h) * 60)
  return `UTC${sign}${h}${m === 0 ? '' : `:${String(m).padStart(2, '0')}`}`
}

/** [mod] When something ends, as the local wall clock: "18:30", "明天 02:00". */
function clockText(lang, endsAt, nowMs) {
  const end = new Date(endsAt)
  const time = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
  const day = date => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((day(end) - day(new Date(nowMs))) / 86_400_000)
  if (days <= 0) return time
  if (days === 1) return tr(lang, '明天 {time}', { time })
  return tr(lang, '{month}月{day}日 {time}', { month: end.getMonth() + 1, day: end.getDate(), time })
}

/** [mod] "同一时区" / "跨 3 个时区". */
const zonesText = (lang, zones) => (zones > 0 ? tr(lang, '跨 {n} 个时区', { n: zones }) : tr(lang, '同一时区'))

/** [mod] How much of the travel collection the pig owns. */
export function collectionProgress(state) {
  const have = SOUVENIRS.filter(souvenir => (state?.collected?.[souvenir.key] ?? 0) > 0).length
  return { have, total: SOUVENIRS.length, regions: (state?.regionsDone ?? []).length, allRegions: REGIONS.length }
}

/** [mod] Badges after the name: 🎓 doctor, 🌍 globetrotter. */
function badges(state) {
  return `${state.doctorDone === true ? ' 🎓' : ''}${state.worldDone === true ? ` ${WORLD_BONUS.emoji}` : ''}`
}

/** [mod] "智力 +2，魅力 +2" — what a sitting pays, one entry per trait. */
function gainsText(lang, subjects, stage) {
  return [...new Set(subjects.map(subject => subject.trait))]
    .map(trait => tr(lang, '{trait} +{gain}', {
      trait: tr(lang, TRAITS[trait].label),
      gain: stage.gain * subjects.filter(subject => subject.trait === trait).length,
    }))
    .join(tr(lang, '，'))
}

/** The three care bars, shared by the status, action and use cards. */
function careBars(lang, state) {
  return [
    tr(lang, '🍚 饱食  {bar}  {value}', { bar: bar(state.satiety), value: Math.round(state.satiety) }),
    tr(lang, '❤️  心情  {bar}  {value}', { bar: bar(state.happiness), value: Math.round(state.happiness) }),
    tr(lang, '🫧 清洁  {bar}  {value}', { bar: bar(state.cleanliness), value: Math.round(state.cleanliness) }),
  ]
}

function xpLine(lang, state) {
  return tr(lang, '✨ 成长  {xp}   （只喂体重，不再决定形态）', { xp: state.xp })
}

function statusLine(lang, state, nowMs) {
  if (state.dead) return tr(lang, '💀 状态  已经走了 · 用 {item} 可以救回来', { item: tr(lang, REVIVE_ITEM.label) })
  if (state.activity !== null) {
    const params = {
      emoji: state.activity.emoji,
      label: activityLabel(lang, state.activity),
      left: activitySecondsLeft(state, nowMs),
    }
    if (state.activity.kind === 'study') return tr(lang, '{emoji} 上课  {label}中 · 还有 {left} 秒', params)
    if (state.activity.kind === 'trip') return tr(lang, '{emoji} 旅行  {label}中 · 还有 {left} 秒', params)
    if (state.activity.kind === 'gym') return tr(lang, '{emoji} 健身  {label}中 · 还有 {left} 秒', params)
    return tr(lang, '{emoji} 打工  {label}中 · 还有 {left} 秒', params)
  }
  const ill = state.illness === null ? null : illnessAt(state.illness.chain, state.illness.stage)
  if (ill !== null) {
    return tr(lang, '🤒 生病  {name}（第 {stage}/4 期）· 需要「{cure}」', {
      name: tr(lang, ill.name), stage: ill.stage, cure: tr(lang, ill.cure),
    })
  }
  return null
}

/** The three QQ Pet traits, as one line. */
function traitsLine(lang, state) {
  const traits = traitView(state)
  return TRAIT_ORDER
    .map(key => `${TRAITS[key].emoji} ${tr(lang, TRAITS[key].label)} ${traits[key]}`)
    .join('   ')
}

/** [mod] The travel collection and the perks it has unlocked, for the status card. */
function collectionLines(lang, state) {
  if (state.hatched !== true) return []
  const progress = collectionProgress(state)
  const lines = [tr(lang, '🧳 纪念品  {have}/{total} · 集齐地区 {regions}/{all}', {
    have: progress.have, total: progress.total, regions: progress.regions, all: progress.allRegions,
  })]
  const perks = perksOf(state).map(key => REGIONS.find(region => region.perk.key === key)?.perk).filter(Boolean)
  if (perks.length > 0) {
    lines.push(tr(lang, '🎁 加成  {perks}', { perks: perks.map(perk => `${perk.emoji}${tr(lang, perk.label)}`).join(' · ') }))
  }
  // [mod] diplomas held, with a count for the ones that can be earned again.
  const diplomas = diplomaView(state).filter(diploma => diploma.count > 0)
  if (diplomas.length > 0) {
    lines.push(tr(lang, '📜 毕业证  {list}', {
      list: diplomas.map(diploma => `${diploma.emoji}${tr(lang, diploma.label)}${diploma.count > 1 ? ` ×${diploma.count}` : ''}`).join(' · '),
    }))
  }
  // [ST0004] what it is wearing, and whether that is the stage's own look.
  const worn = wardrobeView(state).filter(item => item.worn)
  if (state.dead !== true) {
    lines.push(tr(lang, '👗 穿戴  {list}', {
      list: [worn.length === 0 ? tr(lang, '什么也没穿') : worn.map(item => `${item.emoji}${tr(lang, item.label)}`).join(' · '),
        outfitIsAuto(state) ? tr(lang, '（跟着阶段）') : ''].join(''),
    }))
  }
  if (state.doctorDone === true || state.worldDone === true) {
    const titles = []
    if (state.doctorDone === true) titles.push(tr(lang, '🎓 博士'))
    if (state.worldDone === true) titles.push(`${WORLD_BONUS.emoji} ${tr(lang, WORLD_BONUS.label)}`)
    lines.push(tr(lang, '🏅 称号  {titles}', { titles: titles.join(' · ') }))
  }
  return lines
}

function memoriesBlock(lang, state) {
  if (state.memories.length === 0) return []
  return ['', tr(lang, '🕘 最近'), ...state.memories.slice(-4).map(line => `   ${tr(lang, line)}`)]
}

/** "今天刚出生" / "3 天大" / "还没拆开". */
function ageText(lang, state, nowMs) {
  if (state.hatched !== true) return tr(lang, '还没拆开')
  const days = (nowMs - state.bornAt) / 86_400_000
  if (days < 1) return tr(lang, '今天刚出生')
  const whole = Math.floor(days)
  return whole === 1 ? tr(lang, '1 天大') : tr(lang, '{days} 天大', { days: whole })
}

/** The full `/pig` card. */
export function renderStatus(state, nowMs) {
  const lang = langOf(state)
  const stage = lifeStageFor(state, nowMs)
  const current = mood(state, nowMs)
  const special = statusLine(lang, state, nowMs)
  const age = ageText(lang, state, nowMs)
  const lines = [
    `${stage.emoji} ${state.name}${badges(state)}  ${tr(lang, stage.label)} · ${age}   ${current.emoji} ${tr(lang, current.label)}`,
    RULE,
    ...careBars(lang, state),
    tr(lang, '💚 健康  {bar}  {health}/{max}', { bar: bar(healthPercent(state)), health: state.health, max: MAX.health }),
    tr(lang, '🪙 猪币  {coins}', { coins: state.coins }),
    tr(lang, '⚖️  体重  {weight}', { weight: formatWeight(state.weightG) }),
    xpLine(lang, state),
    traitsLine(lang, state),
    ...collectionLines(lang, state),
  ]
  if (special !== null) lines.push(RULE, special)
  lines.push(
    RULE,
    ...portrait(stage, current),
    `    ${quote(lang, stage.line)}`,
    RULE,
    tr(lang, '🍽  完成回合 +5 · 发消息 +2 · 工具调用 +3 · 报错也长肉'),
    tr(lang, '👆  右下角的猪点着就能养：喂食 · 洗澡 · 玩耍 · 打工 · 商店'),
  )
  return [...lines, ...memoriesBlock(lang, state)].join('\n')
}

/** The hatching ceremony. */
export function renderHatch(state, nowMs) {
  const lang = langOf(state)
  const stage = lifeStageFor(state, nowMs)
  return [
    tr(lang, '   纸盒打开了 ——'),
    '',
    ...portrait(stage, mood(state, nowMs)),
    '',
    tr(lang, '✨ {emoji} {name} 蹦了出来（{stage}）', { emoji: stage.emoji, name: state.name, stage: tr(lang, stage.label) }),
    `   ${quote(lang, stage.line)}`,
    '',
    tr(lang, '初始盘缠：🪙 {coins} 猪币。', { coins: state.coins }),
    tr(lang, '正常干活就能养活它；右下角的猪点一下就能喂食、洗澡、送去打工。'),
  ].join('\n')
}

/** One care action's outcome card. */
export function renderAction(state, nowMs, action, crossed) {
  const lang = langOf(state)
  const spec = ACTIONS[action]
  if (spec === undefined) return tr(lang, '🐖 不认识这个动作。')
  const current = mood(state, nowMs)
  const lines = [
    tr(lang, '{name} {verb}', { name: state.name, verb: tr(lang, spec.verb) }),
    '',
    ...portrait(lifeStageFor(state, nowMs), current),
    '',
    ...careBars(lang, state),
  ]
  const wait = actionCooldownSeconds(state, action, nowMs)
  if (wait > 0) lines.push('', tr(lang, '（{wait} 秒后还能再来一次）', { wait }))
  return lines.join('\n')
}

/** The refusal card when a care action is still cooling down. */
export function renderTooSoon(state, nowMs, action) {
  const lang = langOf(state)
  const spec = ACTIONS[action]
  if (spec === undefined) return tr(lang, '🐖 不认识这个动作。')
  const wait = actionCooldownSeconds(state, action, nowMs)
  const name = state.name
  const hints = {
    feed: () => tr(lang, '{name} 摆摆手：刚吃过，肚子还圆着呢。', { name }),
    bathe: () => tr(lang, '{name} 缩了缩：刚洗完，香着呢，别再冲水了。', { name }),
    play: () => tr(lang, '{name} 喘着气：让我歇会儿，刚玩过。', { name }),
    pet: () => tr(lang, '{name} 还没缓过来。', { name }),
  }
  const hint = hints[action]?.() ?? tr(lang, '{name} 现在不想动。', { name })
  return [hint, '', tr(lang, '{wait} 秒后可以再{action}。', { wait, action: tr(lang, spec.label) })].join('\n')
}

/** Sent the pig out to work. */
export function renderWorkReport(state, nowMs, job) {
  const lang = langOf(state)
  return [
    tr(lang, '{name} 背上小包出门了 {emoji}', { name: state.name, emoji: job.emoji }),
    '',
    tr(lang, '💼 工作    {job}', { job: tr(lang, job.label) }),
    tr(lang, '⏱  时长    {minutes} 分钟', { minutes: job.minutes }),
    tr(lang, '🪙 报酬    {coins} 猪币', { coins: job.coins }),
    tr(lang, '🍚 消耗    饱食 {satiety} · 清洁 {cleanliness}', { satiety: job.satiety, cleanliness: job.cleanliness }),
    '',
    tr(lang, '预计 {seconds} 秒后回来。这期间不能喂食洗澡 —— 它在外面忙着。', { seconds: activitySecondsLeft(state, nowMs) }),
  ].join('\n')
}

/**
 * Sent the pig to class. [mod] `subjects` may be one subject or several taken
 * in one sitting; the numbers come from the sitting the pig is actually in.
 */
export function renderStudyReport(state, nowMs, subjects, stage) {
  const lang = langOf(state)
  const list = (Array.isArray(subjects) ? subjects : [subjects]).filter(Boolean)
  const n = list.length
  const activity = state.activity?.kind === 'study' ? state.activity : null
  const minutes = activity === null ? stage.minutes : Math.round((activity.endsAt - activity.startedAt) / 60000)
  const seconds = activitySecondsLeft(state, nowMs)
  const lines = [
    tr(lang, '{name} 背上书包去上课了 {emoji}', { name: state.name, emoji: activity?.emoji ?? list[0]?.emoji ?? '📚' }),
    '',
    tr(lang, '📚 课程    {course}', { course: lessonLabel(lang, stage.key, list.map(subject => subject.key)) }),
    tr(lang, '⏱  时长    {duration}', { duration: durationText(lang, minutes) }),
    tr(lang, '🪙 学费    {tuition} 猪币', { tuition: stage.tuition * n }),
    tr(lang, '📈 收获    {gains} · 经验 +{xp}', { gains: gainsText(lang, list, stage), xp: stage.xp * n }),
    tr(lang, '🍚 消耗    饱食 {satiety} · 心情 {happiness}', { satiety: stage.satiety * n, happiness: stage.happiness * n }),
  ]
  // [mod] a capped stage says which of its lessons this is.
  if (stage.cap !== null && stage.cap !== undefined) {
    lines.push(tr(lang, '📒 次数    {list}（本段每门限 {cap} 次）', {
      list: list.map(subject => `${tr(lang, subject.label)} ${stageLessons(state, stage.key, subject.key) + 1}/${stage.cap}`).join(tr(lang, '、')),
      cap: stage.cap,
    }))
  }
  if (stage.key === 'doctor' && state.doctorDone !== true) {
    lines.push(tr(lang, '🎓 答辩    {done}/{need} 节博士课', {
      done: state.lessonsByStage?.doctor ?? 0, need: DOCTOR_GRADUATION.lessons,
    }))
  }
  lines.push('')
  if (n === 1) {
    const level = courseView(state)[list[0].key] ?? 0
    lines.push(tr(lang, '这门课已经上了 {level} 次。预计 {seconds} 秒后下课。', { level, seconds }))
  } else {
    const endsAt = activity?.endsAt ?? nowMs + minutes * 60000
    lines.push(tr(lang, '{count} 门课一起上，只花一门课的时间，{time} 下课。', { count: n, time: clockText(lang, endsAt, nowMs) }))
  }
  return lines.join('\n')
}

/**
 * Sent the pig travelling. [mod] `place` is a world.js destination; the fare
 * and the length come from the trip the pig is actually on.
 */
export function renderTripReport(state, nowMs, place) {
  const lang = langOf(state)
  const activity = state.activity?.kind === 'trip' ? state.activity : null
  const quote = activity === null ? (tripQuote(state, place.key) ?? {}) : activity
  const region = REGIONS.find(r => r.places.some(p => p.key === place.key))
  const minutes = activity === null ? quote.minutes : Math.round((activity.endsAt - activity.startedAt) / 60000)
  const where = region === undefined ? tr(lang, place.label) : `${tr(lang, place.label)} · ${region.emoji}${tr(lang, region.label)}`
  return [
    tr(lang, '{name} 拖着小行李箱出发了 {emoji}', { name: state.name, emoji: place.emoji }),
    '',
    tr(lang, '🧳 目的地  {trip}', { trip: where }),
    tr(lang, '🪙 花费    {cost} 猪币', { cost: activity?.cost ?? quote.cost }),
    tr(lang, '⏱  时长    {duration} · {zones}', { duration: durationText(lang, minutes), zones: zonesText(lang, quote.zones ?? 0) }),
    tr(lang, '🕐 到家    {time}', { time: clockText(lang, activity?.endsAt ?? nowMs + minutes * 60000, nowMs) }),
    tr(lang, '❤️  心情    +{happiness} · 经验 +{xp}', { happiness: quote.happiness ?? 0, xp: quote.xp ?? 0 }),
    tr(lang, '🍚 消耗    饱食 {satiety}', { satiety: quote.satiety ?? 0 }),
    '',
    tr(lang, '会带回一件纪念品，运气好还有当地特产。'),
  ].join('\n')
}

/**
 * [mod] `/pig trip` with no destination: every region and place, priced from
 * the player's own time zone, with how much of each collection is done.
 * @param home - { utc, zone } of the host.
 */
export function renderTripList(state, home, commandName = 'pig') {
  const lang = langOf(state)
  const where = home.zone ? `${home.zone} · ${utcText(home.utc)}` : utcText(home.utc)
  const progress = collectionProgress(state)
  const lines = [
    tr(lang, '🌍 环游世界 · 从 {home} 出发', { home: where }),
    tr(lang, '票价 {base} 猪币 + 每个时区 {perZone} · 时长 1 小时 + 每个时区 1 小时', { base: FARE.baseCost, perZone: FARE.costPerZone }),
    tr(lang, '🧳 纪念品  {have}/{total} · 集齐地区 {regions}/{all}', {
      have: progress.have, total: progress.total, regions: progress.regions, all: progress.allRegions,
    }),
  ]
  const done = new Set(state?.regionsDone ?? [])
  for (const region of REGIONS) {
    const got = regionProgress(state, region.key)
    const params = {
      emoji: region.emoji, region: tr(lang, region.label), have: got.have, total: got.total,
      perk: `${region.perk.emoji}${tr(lang, region.perk.label)}`, text: tr(lang, region.perk.text),
    }
    lines.push(RULE, done.has(region.key)
      ? tr(lang, '{emoji} {region}  {have}/{total} ✅ 已解锁「{perk}」：{text}', params)
      : tr(lang, '{emoji} {region}  {have}/{total} · 集齐解锁「{perk}」：{text}', params))
    for (const place of region.places) {
      const quote = tripQuote(state, place.key, home.utc)
      const owned = place.souvenirs.map(souvenir => ((state?.collected?.[souvenir.key] ?? 0) > 0 ? souvenir.emoji : '❔')).join('')
      lines.push(tr(lang, '  {emoji} {place} ({key})  {cost} 猪币 · {duration} · {zones}  {souvenirs}', {
        emoji: place.emoji, place: tr(lang, place.label), key: place.key, cost: quote.cost,
        duration: durationText(lang, quote.minutes),
        zones: zonesText(lang, quote.zones),
        souvenirs: owned,
      }))
    }
  }
  const title = { emoji: WORLD_BONUS.emoji, title: tr(lang, WORLD_BONUS.label) }
  lines.push(RULE, state?.worldDone === true
    ? tr(lang, '{emoji} 已经是「{title}」了！', title)
    : tr(lang, '{emoji} 七个地区都集齐，就是「{title}」：三项属性各 +3', title))
  lines.push(
    RULE,
    tr(lang, '🪙 你有 {coins} 猪币', { coins: state?.coins ?? 0 }),
    tr(lang, '出发：/{cmd} trip <目的地>（中文、日文、英文名或括号里的 key 都行）', { cmd: commandName }),
  )
  return lines.join('\n')
}

/** A refusal from the work path, with the reason spelled out. */
export function renderWorkRefusal(state, text) {
  const lang = langOf(state)
  const current = mood(state, Date.now())
  return [
    tr(lang, '💼 出不了门'),
    '',
    text,
    '',
    tr(lang, '现在：{emoji} {mood} · 🍚 {satiety} · 🪙 {coins}', {
      emoji: current.emoji, mood: tr(lang, current.label), satiety: Math.round(state.satiety), coins: state.coins,
    }),
  ].join('\n')
}

/** Bought something. */
export function renderBuy(state, result, item) {
  const lang = langOf(state)
  const label = tr(lang, item.label)
  if (result?.ok !== true) {
    if (result?.reason === 'poor') {
      return tr(lang, '🪙 钱不够：{emoji} {item} 要 {price} 猪币，你只有 {coins}。', {
        emoji: item.emoji, item: label, price: item.price, coins: state?.coins ?? 0,
      })
    }
    if (result?.reason === 'dead') return tr(lang, '{name} 已经走了…先救回来再买东西。', { name: nameOf(lang, state) })
    if (result?.reason === 'daily-limit') {
      return tr(lang, '📅 {emoji} {item} 每天只能买 {n} 个，明天再来吧。', { emoji: item.emoji, item: label, n: result.max ?? item.dailyLimit ?? 1 })
    }
    if (result?.reason === 'owned') return tr(lang, '👗 {emoji} {item} 已经在衣柜里了，不用再买。', { emoji: item.emoji, item: label })
    if (result?.reason === 'not-for-sale') {
      return tr(lang, '🧳 {emoji} {item} 是旅行限定的特产，商店不卖 —— 只能出门旅行时碰运气带回来。', { emoji: item.emoji, item: label })
    }
    return tr(lang, '🐖 没能买下 {item}。', { item: label })
  }
  if (item.kind === 'wear') {
    return [
      tr(lang, '🛒 买到了 {emoji} {item}（-{price} 猪币）', { emoji: item.emoji, item: label, price: item.price }),
      '',
      tr(lang, '🪙 余额    {coins}', { coins: state.coins }),
      tr(lang, '👗 已经穿上了，衣柜里随时换：/pig wear'),
    ].join('\n')
  }
  return [
    tr(lang, '🛒 买到了 {emoji} {item}（-{price} 猪币）', { emoji: item.emoji, item: label, price: item.price }),
    '',
    tr(lang, '🪙 余额    {coins}', { coins: state.coins }),
    tr(lang, '🎒 背包    {item} ×{count}', { item: label, count: state.inventory?.[item.key] ?? 0 }),
    '',
    item.kind === 'card'
      ? tr(lang, '改名时会自动用掉一张：/pig name <新名字>')
      : tr(lang, '用起来：/pig use {key}', { key: item.key }),
  ].join('\n')
}

/** Used something from the backpack. */
export function renderUse(state, result, item) {
  const lang = langOf(state)
  const label = tr(lang, item.label)
  if (result?.ok !== true) {
    const name = nameOf(lang, state)
    const revive = tr(lang, REVIVE_ITEM.label)
    switch (result?.reason) {
      case 'empty':
        if (item.exclusive === true) return tr(lang, '🎒 背包里没有 {emoji} {item}。这是旅行限定的特产，只能出门旅行时带回来。', { emoji: item.emoji, item: label })
        return tr(lang, '🎒 背包里没有 {emoji} {item}。先去 /pig shop 买。', { emoji: item.emoji, item: label })
      case 'use-to-rename': return tr(lang, '{emoji} {item} 不用在这里 —— 直接 /pig name <新名字>，改名时自动用掉一张。', { emoji: item.emoji, item: label })
      case 'away': return tr(lang, '{name} 在外面，回来再用。', { name })
      case 'not-sick': return tr(lang, '{name} 现在没生病，吃药没用。', { name })
      case 'not-dead': return tr(lang, '{name} 活得好好的，用不上 {item}。', { name, item: revive })
      case 'dead': return tr(lang, '{name} 已经走了…只有 {item} 能救回来。', { name, item: revive })
      case 'wrong-medicine': {
        const need = result.needs
        const needLabel = need?.label === undefined ? tr(lang, '别的药') : tr(lang, need.label)
        return tr(lang, '💊 药不对症。{name} 现在需要的是「{need}」。', { name, need: needLabel })
      }
      case 'working': return tr(lang, '{name} 在外面打工，回来再吃。', { name })
      default: return tr(lang, '🐖 没能用上 {item}。', { item: label })
    }
  }
  const lines = [tr(lang, '{name} 用了 {emoji} {item}', { name: state.name, emoji: item.emoji, item: label })]
  if (item.kind === 'medicine') lines.push('', tr(lang, '💚 病好了！健康恢复满值。'))
  else if (item.kind === 'revive') lines.push('', tr(lang, '✨ 回来了！等级、经验和猪币都还在。'))
  else lines.push('', ...careBars(lang, state))
  return lines.join('\n')
}

/** The scales. */
export function renderWeigh(state, nowMs) {
  const lang = langOf(state)
  const stage = lifeStageFor(state, nowMs)
  const kilos = state.weightG / 1000
  let verdict = '还算苗条，继续保持'
  if (kilos >= 40) verdict = '这已经是一头正经的猪了'
  else if (kilos >= 15) verdict = '抱起来有点费劲'
  else if (kilos >= 6) verdict = '手感很好，沉甸甸的'
  else if (kilos >= 3) verdict = '圆润，但还能抱得动'
  const progress = collectionProgress(state)
  return [
    tr(lang, '⚖️  {name} 站上了秤', { name: state.name }),
    '',
    `        ${stage.emoji}${badges(state)}`,
    `     ${formatWeight(state.weightG)}`,
    tr(lang, '   🧳 纪念品 {have}/{total} · 集齐地区 {regions}/{all}', {
      have: progress.have, total: progress.total, regions: progress.regions, all: progress.allRegions,
    }),
    '',
    `   ${quote(lang, verdict)}`,
  ].join('\n')
}

/**
 * `/pig about`. There may be no pig yet, so the language is the default unless
 * the caller passes the pig (or its state) as the optional second argument.
 */
export function renderAbout(commandName, state = null) {
  const lang = langOf(state)
  const cmd = commandName
  const actions = ACTION_ORDER.map(key => `  ${ACTIONS[key].emoji} ${tr(lang, ACTIONS[key].label)}`).join(' · ')
  const outing = (emoji, label, minutes, coins) => tr(lang, '  {emoji} {label}（{minutes} 分钟 · {coins} 猪币）', {
    emoji, label: tr(lang, label), minutes, coins,
  })
  const jobs = JOBS.map(job => outing(job.emoji, job.label, job.minutes, job.coins)).join('\n')
  const courses = SUBJECTS.map(s => `${s.emoji}${tr(lang, s.label)}`).join(' ')
  const stages = SCHOOL_STAGES.map(s => tr(lang, '{stage}（{minutes} 分钟 · 学费 {tuition} · +{gain} · 一次最多 {parallel} 门 · {cap}）', {
    stage: tr(lang, s.label), minutes: s.minutes, tuition: s.tuition, gain: s.gain, parallel: PARALLEL_COURSES[s.key] ?? 1,
    cap: s.cap === null ? tr(lang, '不限次数') : tr(lang, '每门限 {cap} 次', { cap: s.cap }),
  })).join('\n')
  const trips = [
    tr(lang, '  票价 {base} 猪币 + 每个时区 {perZone} · 时长 1 小时 + 每个时区 1 小时', { base: FARE.baseCost, perZone: FARE.costPerZone }),
    ...REGIONS.map(region => tr(lang, '  {emoji} {region}：{places}', {
      emoji: region.emoji, region: tr(lang, region.label),
      places: region.places.map(place => `${place.emoji}${tr(lang, place.label)}`).join(' · '),
    })),
    tr(lang, '  每个地区 6 件纪念品，集齐解锁加成；七个地区都集齐成为「{title}」{emoji}', { title: tr(lang, WORLD_BONUS.label), emoji: WORLD_BONUS.emoji }),
  ].join('\n')
  const shop = SHOP.map(item => tr(lang, '  {emoji} {item}  {price} 猪币', {
    emoji: item.emoji, item: tr(lang, item.label), price: String(item.price).padStart(3),
  })).join('\n')
  return [
    tr(lang, '🐖 dsh-pig —— 一只住在 DSH 里的猪'),
    RULE,
    tr(lang, '最省事的用法：点右下角的 🐖，面板上六个图标点着用。'),
    tr(lang, '  ① 状态  ② 学习  ③ 打工  ④ 商店  ⑤ 旅行  ⑥ 背包'),
    RULE,
    tr(lang, '照顾：{actions}', { actions }),
    '',
    tr(lang, '📚 学习（涨智力 / 魅力 / 武力）：'),
    `  ${courses}`,
    stages,
    '',
    tr(lang, '💼 打工（出门赚钱）：'),
    jobs,
    '',
    tr(lang, '🧳 旅行（带回纪念品，有时还有特产）：'),
    trips,
    '',
    tr(lang, '🛒 商店：'),
    shop,
    '',
    tr(lang, '🤒 生病：饿着或脏着太久会得病，健康上限 5。必须对症下药；'),
    tr(lang, '      健康归零就没了，用 {item} 救回来（保留等级、猪币和收藏）。', { item: tr(lang, REVIVE_ITEM.label) }),
    RULE,
    tr(lang, '命令（不想点鼠标时才用）：'),
    `/${cmd} · hatch · feed · bathe · play · pet`,
    tr(lang, '/{cmd} study <科目>[,科目…] <小学|大学|研究生|博士>', { cmd }),
    tr(lang, '/{cmd} work <odd|site|office> · trip [目的地] · calloff', { cmd }),
    tr(lang, '/{cmd} shop · buy <物品> · use <物品>', { cmd }),
    tr(lang, '/{cmd} weigh · name <名字> · about', { cmd }),
    tr(lang, '/{cmd} wear [装饰|自动|不穿]', { cmd }),
    tr(lang, '      第一次起名免费，之后每次改名用一张{card}（{price} 猪币）', { card: tr(lang, RENAME_CARD.label), price: RENAME_CARD.price }),
    RULE,
    tr(lang, '它不调用模型、不注入上下文、不花一个 token。'),
    tr(lang, '存档在 $DSH_HOME/dsh-pig/state.json。'),
  ].join('\n')
}

/** [ST0004] Where a decoration sits, in words. */
export const WEAR_SLOT_LABEL = Object.freeze({ body: '身上', face: '脸上', waist: '腰上', eyes: '眼睛', head: '头上' })

/** [ST0004] How a decoration is earned, from its `unlock` rule. */
export function wearHint(lang, unlock) {
  switch (unlock?.kind) {
    case 'always': return tr(lang, '一出纸盒就有')
    case 'stage': return tr(lang, '长成{stage}后解锁', { stage: tr(lang, lifeStageByKey(unlock.stage)?.label ?? unlock.stage) })
    case 'lessons': return unlock.stage === null
      ? tr(lang, '上过一节课后解锁')
      : tr(lang, '上过{school}后解锁', { school: tr(lang, schoolStageByKey(unlock.stage)?.label ?? unlock.stage) })
    case 'diploma': return tr(lang, '拿到任意一张毕业证后解锁')
    case 'trip': return tr(lang, '旅行回来后解锁')
    case 'region': return tr(lang, '从{region}带回纪念品后解锁', { region: tr(lang, REGIONS.find(region => region.key === unlock.region)?.label ?? unlock.region) })
    case 'shop': return tr(lang, '在商店「装扮」货架买，{price} 猪币', { price: unlock.price })
    case 'gym': return tr(lang, '在健身房一共瘦掉 {kg} kg 后解锁', { kg: unlock.kg })
    case 'coins': return tr(lang, '手里攒到过 {coins} 猪币后解锁', { coins: unlock.coins })
    default: return ''
  }
}

/** [ST0004] `/pig wear`: the whole wardrobe, slot by slot. */
export function renderWardrobe(commandName, state) {
  const lang = langOf(state)
  const cmd = commandName
  const items = wardrobeView(state)
  const lines = [tr(lang, '👗 衣柜{auto}', { auto: outfitIsAuto(state) ? tr(lang, '（现在跟着阶段穿）') : '' }), RULE]
  for (const slot of WEAR_SLOTS.slice().reverse()) {
    const row = items.filter(item => item.slot === slot).map(item => {
      const mark = item.worn ? '✅' : item.unlocked ? '　' : '🔒'
      return `${mark}${item.emoji}${tr(lang, item.label)}${item.unlocked ? '' : tr(lang, '（{hint}）', { hint: wearHint(lang, item.unlock) })}`
    })
    lines.push(`${tr(lang, WEAR_SLOT_LABEL[slot])}  ${row.join('  ')}`)
  }
  lines.push(RULE, tr(lang, '穿 / 脱：/{cmd} wear <装饰>（再说一次就脱下）', { cmd }), tr(lang, '跟着阶段穿：/{cmd} wear 自动 · 全脱：/{cmd} wear 不穿', { cmd }))
  return lines.join('\n')
}

/** The empty-house prompt. */
export function renderNoPig(commandName) {
  return tr(langOf(null), '这里还没有猪。/{cmd} hatch 孵一只 🥚 —— 它会吃你之后的真实工作长大。', { cmd: commandName })
}
