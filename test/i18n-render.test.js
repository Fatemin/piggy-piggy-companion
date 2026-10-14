/**
 * [dsh-piggy-claude-code mod] render.js speaks the pig's language.
 *
 * render.js owns its sentences (locales/render.js); data labels such as stage,
 * job or item names are translated by other locale files, so the runtime
 * checks below strip those labels before looking for leftover Chinese and the
 * static checks prove every sentence render.js writes has a ja and an en entry.
 *
 * Run: node --test test/*.test.js
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import * as core from '../core.js'
import * as data from '../data.js'
import * as world from '../world.js'
import dict from '../locales/render.js'
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
} from '../render.js'

const { hatchEgg, layEgg, mood, startStudy, startTrip, startWork } = core
const { JOBS, RENAME_CARD, REVIVE_ITEM, SCHOOL_STAGES, SHOP, SUBJECTS, schoolStageByKey, subjectByKey } = data
const { REGIONS, SOUVENIRS, placeByKey, specialtyByKey } = world

const T0 = 1_700_000_000_000
const HAN = /[一-鿿]/
const KANA = /[ぁ-んァ-ヶ]/
const NAME = '小花'

const SOURCE = readFileSync(new URL('../render.js', import.meta.url), 'utf8')
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
/** The portrait's "dirty" mouth is ASCII art, not a word. */
const ART = new Set(['益'])

function pig(lang, nowMs = T0) {
  const state = hatchEgg(nowMs)
  state.name = NAME
  state.lang = lang
  state.memories = []
  return state
}

/** Every Chinese string reachable from data.js / core.js exports: the labels other locale files own. */
function dataLabels() {
  const out = new Set()
  const seen = new Set()
  const walk = value => {
    if (typeof value === 'string') {
      if (HAN.test(value)) out.add(value)
      return
    }
    if (value === null || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    for (const inner of Object.values(value)) walk(inner)
  }
  walk(data)
  walk(core)
  walk(world)
  return out
}
const LABELS = dataLabels()

/** Remove the pig's name and any untranslated data label, longest first. */
function stripLabels(text, extra = []) {
  const labels = [...LABELS, ...extra, NAME].sort((a, b) => b.length - a.length)
  let out = text
  for (const label of labels) out = out.split(label).join('')
  return out
}

function assertNoChinese(text, extra = []) {
  const left = stripLabels(text, extra)
  const line = left.split('\n').find(l => HAN.test(l))
  assert.equal(line, undefined, `untranslated Chinese in:\n${text}`)
}

/**
 * Every rendered card for one language, keyed by what it is, plus the runtime
 * strings that come from core.js rather than render.js (mood labels, memories
 * written by decay) so the English check can set them aside.
 */
function cards(lang) {
  const now = T0 + 1000
  const out = {}
  const fromCore = []
  const seen = (state, nowMs) => {
    fromCore.push(mood(state, nowMs).label, ...state.memories)
  }
  const idle = pig(lang)
  out.status = renderStatus(idle, now)
  seen(idle, now)
  out.statusOld = renderStatus(idle, T0 + 3 * 86_400_000)
  seen(idle, T0 + 3 * 86_400_000)
  out.hatch = renderHatch(pig(lang), T0)
  out.weigh = renderWeigh(pig(lang), T0)
  out.action = renderAction(pig(lang), T0, 'feed', false)
  out.unknownAction = renderAction(pig(lang), T0, 'juggle', false)
  for (const action of ['feed', 'bathe', 'play', 'pet']) {
    const state = pig(lang)
    state.cooldowns = { ...state.cooldowns, [action]: T0 }
    out[`tooSoon.${action}`] = renderTooSoon(state, T0, action)
  }

  const worker = pig(lang)
  assert.equal(startWork(worker, JOBS[0].key, T0).ok, true)
  worker.memories = []
  out.work = renderWorkReport(worker, T0, JOBS[0])
  out.statusWorking = renderStatus(worker, now)
  seen(worker, now)

  const student = pig(lang)
  student.coins = 10_000
  assert.equal(startStudy(student, SUBJECTS[0].key, SCHOOL_STAGES[0].key, T0).ok, true)
  student.memories = []
  out.study = renderStudyReport(student, T0, SUBJECTS[0], SCHOOL_STAGES[0])
  out.statusStudying = renderStatus(student, now)
  seen(student, now)

  // [mod] several subjects at once, and the doctorate.
  const college = schoolStageByKey('college')
  const pair = [subjectByKey('mathematics'), subjectByKey('art')]
  const senior = pig(lang)
  senior.coins = 10_000
  senior.lessonsByStage = { primary: 9, college: 0, graduate: 0, doctor: 0 }
  assert.equal(startStudy(senior, pair.map(s => s.key), college.key, T0).ok, true)
  senior.memories = []
  out.studyPair = renderStudyReport(senior, T0, pair, college)
  out.statusStudyingPair = renderStatus(senior, now)
  seen(senior, now)
  const doctor = schoolStageByKey('doctor')
  const trio = ['chinese', 'music', 'wushu'].map(subjectByKey)
  const scholar = pig(lang)
  scholar.coins = 10_000
  scholar.lessonsByStage = { primary: 9, college: 9, graduate: 9, doctor: 3 }
  assert.equal(startStudy(scholar, trio.map(s => s.key), doctor.key, T0).ok, true)
  scholar.memories = []
  out.studyDoctor = renderStudyReport(scholar, T0, trio, doctor)

  // [mod] a world trip, priced from an explicit home time zone.
  const tokyo = placeByKey('tokyo')
  const traveller = pig(lang)
  traveller.coins = 10_000
  assert.equal(startTrip(traveller, tokyo.key, T0, 0).ok, true)
  traveller.memories = []
  out.trip = renderTripReport(traveller, T0, tokyo)
  out.statusTraveling = renderStatus(traveller, now)
  seen(traveller, now)
  out.tripList = renderTripList(pig(lang), { utc: 9, zone: 'Asia/Tokyo' }, 'pig')
  out.tripListNoZone = renderTripList(pig(lang), { utc: 5.5, zone: null }, 'pig')

  // [mod] a well-travelled doctor: collection, perks and titles on the cards.
  const veteran = pig(lang)
  for (const souvenir of SOUVENIRS) veteran.collected[souvenir.key] = 1
  veteran.regionsDone = REGIONS.map(region => region.key)
  veteran.worldDone = true
  veteran.doctorDone = true
  out.statusVeteran = renderStatus(veteran, now)
  out.weighVeteran = renderWeigh(veteran, now)
  out.tripListVeteran = renderTripList(veteran, { utc: -5, zone: 'America/New_York' }, 'pig')
  seen(veteran, now)

  const sick = pig(lang)
  sick.illness = { chain: 0, stage: 2, since: T0, progressMs: 0 }
  out.statusSick = renderStatus(sick, T0)
  seen(sick, T0)
  const dead = pig(lang)
  dead.dead = true
  out.statusDead = renderStatus(dead, T0)
  seen(dead, T0)
  const egg = layEgg(T0)
  egg.lang = lang
  egg.name = NAME
  egg.memories = []
  out.statusBox = renderStatus(egg, T0)
  seen(egg, T0)

  const shopper = pig(lang, Date.now())
  const apple = SHOP[0]
  out.buyOk = renderBuy(shopper, { ok: true }, apple)
  out.buyPoor = renderBuy(shopper, { ok: false, reason: 'poor' }, apple)
  out.buyDead = renderBuy(shopper, { ok: false, reason: 'dead' }, apple)
  out.buyOther = renderBuy(shopper, { ok: false }, apple)
  for (const reason of ['empty', 'not-sick', 'not-dead', 'dead', 'wrong-medicine', 'working', 'other']) {
    out[`use.${reason}`] = renderUse(shopper, { ok: false, reason }, apple)
  }
  const duck = specialtyByKey('duck')
  out.buyExclusive = renderBuy(shopper, { ok: false, reason: 'not-for-sale' }, duck)
  out.buyCard = renderBuy(shopper, { ok: true }, RENAME_CARD)
  out.useCard = renderUse(shopper, { ok: false, reason: 'use-to-rename' }, RENAME_CARD)
  out.useExclusiveEmpty = renderUse(shopper, { ok: false, reason: 'empty' }, duck)
  out.useAway = renderUse(shopper, { ok: false, reason: 'away' }, duck)
  out.useFood = renderUse(shopper, { ok: true }, apple)
  out.useRevive = renderUse(shopper, { ok: true }, REVIVE_ITEM)
  out.refusal = renderWorkRefusal(shopper, 'REASON')
  seen(shopper, Date.now())
  out.about = renderAbout('pig', { lang })
  return { out, fromCore }
}

test('render: every Chinese sentence in render.js has a ja and an en translation', () => {
  const literals = [...CODE.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map(m => m[1]).filter(s => HAN.test(s) && !ART.has(s))
  assert.ok(literals.length > 50, `found only ${literals.length} literals — is the scan broken?`)
  for (const zh of literals) {
    assert.ok(Object.hasOwn(dict.ja, zh), `ja is missing: ${zh}`)
    assert.ok(Object.hasOwn(dict.en, zh), `en is missing: ${zh}`)
  }
})

test('render: no Chinese hides in template literals or string concatenation', () => {
  for (const [, body] of CODE.matchAll(/`([^`]*)`/g)) {
    assert.ok(!HAN.test(body), `Chinese inside a template literal: \`${body}\``)
  }
  for (const [, body] of CODE.matchAll(/"([^"\n]*)"/g)) {
    assert.ok(!HAN.test(body), `Chinese inside a double-quoted string: "${body}"`)
  }
})

test('locales/render: ja and en have exactly the same keys, all used, with matching placeholders', () => {
  assert.deepEqual(Object.keys(dict.ja).sort(), Object.keys(dict.en).sort())
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()
  for (const lang of ['ja', 'en']) {
    for (const [zh, text] of Object.entries(dict[lang])) {
      assert.equal(typeof text, 'string', `${lang}: ${zh}`)
      assert.ok(text.trim() !== '', `${lang}: empty translation for ${zh}`)
      assert.deepEqual(placeholders(text), placeholders(zh), `${lang}: placeholders differ for ${zh}`)
      assert.ok(CODE.includes(`'${zh.replace(/'/g, "\\'")}'`), `${lang}: key not used by render.js: ${zh}`)
    }
  }
  for (const text of Object.values(dict.en)) assert.ok(!HAN.test(text), `en still has Chinese: ${text}`)
})

test('render: an English pig gets English cards', () => {
  const { out: en, fromCore } = cards('en')
  for (const text of Object.values(en)) assertNoChinese(text, fromCore)
  assert.match(en.status, /🍚 Fullness +▓/)
  assert.match(en.status, /🪙 Oinks {2}\d+/)
  assert.match(en.status, /born today/)
  assert.match(en.statusOld, /3 days old/)
  assert.match(en.statusWorking, /s left/)
  assert.match(en.statusDead, /💀 Status/)
  assert.match(en['tooSoon.feed'], /again in \d+s\./)
  assert.match(en.buyPoor, /^🪙 Not enough oinks/)
  assert.match(en.about, /\/pig study <subject>\[,subject…\] <primary\|college\|graduate\|doctor>/)
  // [mod] the world, several subjects, the doctorate, the rename card.
  assert.match(en.trip, /🧳 Going to {2}Tokyo · 🗾East Asia/)
  assert.match(en.trip, /🪙 Cost {6}1900 oinks/)
  assert.match(en.trip, /⏱ {2}Time {6}10 h · 9 h time difference/)
  assert.match(en.trip, /🕐 Home at {3}\S/)
  assert.match(en.tripList, /^🌍 Around the world · from Asia\/Tokyo · UTC\+9$/m)
  assert.match(en.tripList, /🗼 Tokyo \(tokyo\) {2}100 oinks · 1 h · same time zone {2}❔❔/)
  assert.match(en.tripList, /🗽 New York \(newyork\) {2}2100 oinks · 11 h · 10 h time difference/)
  assert.match(en.tripListNoZone, /from UTC\+5:30$/m)
  assert.match(en.tripListVeteran, /✈️Frequent flyer/)
  assert.match(en.tripListVeteran, /🐼 Chengdu \(chengdu\) {2}1840 oinks · 12 h/, 'the frequent-flyer perk takes 20% off')
  assert.match(en.studyPair, /📚 Lesson {4}Math \+ Art \(University\)/)
  assert.match(en.studyPair, /🪙 Tuition {3}120 oinks/)
  assert.match(en.studyPair, /📈 Gains {5}Smarts \+2, Charm \+2 · XP \+400/)
  assert.match(en.studyPair, /2 subjects at once/)
  assert.match(en.studyDoctor, /Reading \+ Music \+ Martial arts \(Doctorate\)/)
  assert.match(en.studyDoctor, /🎓 Thesis {4}3\/9 doctorate lessons/)
  assert.match(en.statusVeteran, /🧳 Souvenirs {2}44\/44 · regions done 7\/7/)
  assert.match(en.statusVeteran, /🏅 Titles {2}🎓 Doctor · 🌍 Globetrotter/)
  assert.match(en.statusVeteran, /^🐖 小花 🎓 🌍 {2}/)
  assert.match(en.weighVeteran, /🧳 Souvenirs 44\/44/)
  assert.match(en.buyExclusive, /travel-only specialty/)
  assert.match(en.buyCard, /\/pig name <new name>/)
  assert.match(en.useCard, /\/pig name <new name>/)
})

test('render: a Japanese pig gets Japanese cards', () => {
  const ja = cards('ja').out
  const zh = cards('zh').out
  for (const [what, text] of Object.entries(ja)) {
    if (what === 'refusal') continue
    assert.notEqual(text, zh[what], `ja card "${what}" is still the Chinese one`)
    assert.match(text, KANA, `ja card "${what}" has no kana`)
  }
  assert.match(ja.status, /🍚 おなか/)
  assert.match(ja.status, /🪙 ブーコイン {2}\d+/)
  assert.match(ja.refusal, /^💼 出かけられない/)
})

test('render: Chinese stays exactly as upstream wrote it', () => {
  const zh = cards('zh').out
  const status = zh.status.split('\n')
  assert.equal(status[2], '🍚 饱食  ▓▓▓▓▓▓▓░░░  70')
  assert.match(status[5], /^💚 健康  ▓+░*  \d\/\d$/)
  assert.equal(status[6], '🪙 猪币  500')
  assert.match(status[7], /^⚖️ {2}体重 {2}\d+\.\d kg$/)
  assert.equal(status[8], '✨ 成长  0   （只喂体重，不再决定形态）')
  assert.ok(status.includes('🍽  完成回合 +5 · 发消息 +2 · 工具调用 +3 · 报错也长肉'))
  assert.match(zh.statusOld, / 3 天大 /)
  assert.match(zh.statusBox, / 还没拆开 /)
  assert.match(zh.statusStudying, /\n📖 上课  小学语文中 · 还有 \d+ 秒\n/)
  assert.match(zh.statusDead, /\n💀 状态  已经走了 · 用 还魂丹 可以救回来\n/)
  assert.equal(zh['tooSoon.feed'].split('\n')[0], `${NAME} 摆摆手：刚吃过，肚子还圆着呢。`)
  assert.match(zh['tooSoon.feed'], /\n\d+ 秒后可以再喂食。$/)
  assert.match(zh.action, new RegExp(`^${NAME} 吃了一口 🍎\n`))
  assert.equal(zh.buyPoor, `🪙 钱不够：🍎 苹果 要 ${SHOP[0].price} 猪币，你只有 500。`)
  assert.equal(zh['use.wrong-medicine'], `💊 药不对症。${NAME} 现在需要的是「别的药」。`)
  assert.equal(zh.hatch.split('\n')[0], '   纸盒打开了 ——')
  assert.equal(zh.work.split('\n')[3], `⏱  时长    ${JOBS[0].minutes} 分钟`)
  assert.equal(zh.study.split('\n')[2], '📚 课程    小学语文')
  assert.match(zh.weigh, /\n {3}「还算苗条，继续保持」$/)
  assert.match(zh.about, /\n\/pig study <科目>\[,科目…\] <小学\|大学\|研究生\|博士>\n/)
  // [mod] new cards, in the original voice.
  assert.equal(zh.studyPair.split('\n')[2], '📚 课程    大学数学+美术')
  assert.equal(zh.studyPair.split('\n')[5], '📈 收获    智力 +2，魅力 +2 · 经验 +400')
  assert.equal(zh.study.split('\n')[5], '📈 收获    智力 +1 · 经验 +60')
  assert.equal(zh.trip.split('\n')[2], '🧳 目的地  东京 · 🗾东亚')
  assert.equal(zh.trip.split('\n')[4], '⏱  时长    10 小时 · 跨 9 个时区')
  assert.match(zh.tripList, /\n {2}🗼 东京 \(tokyo\) {2}100 猪币 · 1 小时 · 同一时区 {2}❔❔\n/)
  assert.match(zh.tripList, /\n🐉 中国 {2}0\/8 · 集齐解锁「🍚干饭王」：吃东西长肉 \+10%\n/)
  assert.match(zh.statusVeteran, /\n🧳 纪念品 {2}44\/44 · 集齐地区 7\/7\n/)
  assert.match(zh.statusVeteran, /\n🏅 称号 {2}🎓 博士 · 🌍 环球旅行家\n/)
  assert.ok(!zh.status.includes('🎁'), 'no perk line before any region is done')
  assert.match(zh.about, /\n {2}🍎 苹果 {4}6 猪币\n/)
})

test('render: with no pig the default language decides (PIG_LANG)', () => {
  const saved = process.env.PIG_LANG
  try {
    delete process.env.PIG_LANG
    assert.equal(renderNoPig('pig'), '这里还没有猪。/pig hatch 孵一只 🥚 —— 它会吃你之后的真实工作长大。')
    assert.match(renderAbout('pig'), /^🐖 dsh-pig —— 一只住在 DSH 里的猪/)
    process.env.PIG_LANG = 'en'
    assert.equal(renderNoPig('pig'), 'No pig here yet. /pig hatch to hatch one 🥚 — it grows by eating your real work from now on.')
    process.env.PIG_LANG = 'ja-JP'
    assert.match(renderNoPig('pig'), KANA)
    assert.match(renderBuy(null, { ok: false, reason: 'dead' }, SHOP[0]), /^この子/)
  } finally {
    if (saved === undefined) delete process.env.PIG_LANG
    else process.env.PIG_LANG = saved
  }
})
