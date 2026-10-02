/**
 * [dsh-piggy-claude-code mod] The game logic speaks the pig's language.
 *
 * Plays a pig through a real store — growing up, a shift, a lesson, a trip,
 * falling ill, dying and being revived — after switching it to English or
 * Japanese, and checks that nothing the snapshot or the command replies carry
 * is still Chinese. The pig's name is user data and memories written before the
 * switch stay in the language they were written in, so both are left out.
 *
 * Run: node --test test/*.test.js
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { dispatch, snapshot } from '../index.js'
import { createStore } from '../store.js'
import { hatchEgg, mood, setLang } from '../core.js'
import { setRandomForTests } from '../core.js'
import { tr } from '../i18n.js'
import coreLocale from '../locales/core.js'
import dataLocale from '../locales/data.js'
import indexLocale from '../locales/index.js'
import { REGIONS, SOUVENIRS } from '../world.js'

const MIN = 60_000
const HAN = /[一-鿿]/

/** Play one pig through every path and collect what a player would see. */
function playThrough(lang) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pig-i18n-'))
  // snapshot() reads Date.now() too, so the fake clock only ever runs ahead of it.
  let clock = Date.now()
  const store = createStore(join(dir, 'state.json'), {
    now: () => clock,
    setTimer: () => null,
    clearTimer: () => {},
  })
  const tick = minutes => { clock += minutes * MIN }
  // [ST0014] time is folded in minute by minute, so a pig left a whole day after
  // it came home would be a neglected one: wait just until it is back.
  const untilBack = () => Math.ceil((store.state.activity.endsAt - clock) / MIN) + 1
  const seen = []
  const collected = () => seen

  try {
    assert.equal(store.hatch(), true)
    assert.equal(store.setLang(lang).ok, true)
    const before = new Set(store.state.memories)
    // The name is user data and shows up inside messages, so give it one with no Han.
    assert.equal(store.rename('Bo'), 'Bo')
    const shot = () => {
      const snap = snapshot(store, { drain: false })
      // The pig's name is user data; the language list names each language in itself.
      const { langs, ...rest } = snap
      assert.ok(Array.isArray(langs))
      const pig = rest.pig === null ? null : {
        ...rest.pig,
        name: undefined,
        memories: rest.pig.memories.filter(line => !before.has(line)),
      }
      seen.push(JSON.stringify({ ...rest, pig }))
      return snap
    }
    const reply = text => { seen.push(text); return text }

    // Grow up by weight.
    store.state.weightG = 21_000
    tick(1)
    store.freshen()
    const grown = shot()
    assert.equal(grown.pig.stage.key, 'young')
    assert.ok(grown.pending.some(event => event.kind === 'stage'))

    // Bags and care.
    assert.equal(store.buy('apple').ok, true)
    assert.equal(store.act('feed', 'apple').ok, true)
    assert.equal(store.buy('soap').ok, true)
    tick(2)
    assert.equal(store.useItem('soap').ok, true)
    assert.equal(store.act('play').ok, true)
    assert.equal(store.act('pet').ok, true)

    // A shift: seen while away, then paid out.
    assert.equal(store.startWork('odd').ok, true)
    tick(3)
    const working = shot()
    assert.equal(working.activity.kind, 'work')
    assert.equal(store.act('feed').reason, 'away')
    tick(30)
    store.freshen()
    assert.ok(shot().pending.some(event => event.kind === 'work'))

    // A lesson and a trip, one of them called off.
    assert.equal(store.startStudy('chinese', 'primary').ok, true)
    tick(5)
    const studying = shot()
    assert.equal(studying.activity.key, 'chinese')
    tick(40)
    store.freshen()
    store.state.coins = 50_000
    store.state.satiety = 100
    try {
      // [mod] a world trip that always brings back loot (the place's specialty).
      setRandomForTests(() => 0)
      assert.equal(store.startTrip('tokyo').ok, true)
      tick(5)
      shot()
      tick(untilBack())
      store.freshen()
      const back = shot()
      assert.ok(back.pending.some(event => event.kind === 'trip'))
      assert.ok(back.world.lastTrip.loot.length > 0, 'the trip brought something back')
      reply(dispatch(store, 'pig', 'trip').text)

      // [mod] the last souvenir of China, which is also the last one in the world.
      store.state.collected = Object.fromEntries(SOUVENIRS.filter(s => s.key !== 'wallbrick').map(s => [s.key, 1]))
      store.state.regionsDone = REGIONS.map(region => region.key).filter(key => key !== 'china')
      store.state.satiety = 100
      assert.equal(store.startTrip('beijing').ok, true)
      tick(untilBack())
      store.freshen()
      const world = shot()
      assert.ok(world.pending.some(event => event.kind === 'region'))
      assert.ok(world.pending.some(event => event.kind === 'world'))
      assert.equal(world.pig.worldTraveler, true)
      reply(dispatch(store, 'pig', 'trip').text)

      // [mod] the doctorate, three subjects at a time, through the command.
      store.state.lessonsByStage = { primary: 9, college: 9, graduate: 9, doctor: 6 }
      store.state.satiety = 100
      reply(dispatch(store, 'pig', 'study reading, music, martial arts doctorate').text)
      assert.equal(store.state.activity?.kind, 'study')
      tick(5)
      shot()
      tick(untilBack())
      store.freshen()
      const doctor = shot()
      assert.equal(doctor.pig.doctor, true)
      assert.ok(doctor.pending.some(event => event.kind === 'doctor'))
      reply(dispatch(store, 'pig', 'status').text.split('🕘')[0])
      reply(dispatch(store, 'pig', 'weigh').text)
    } finally {
      setRandomForTests(null)
    }
    store.state.satiety = 100
    store.state.coins = 50_000
    assert.equal(store.startTrip('seoul').ok, true)
    assert.equal(store.callOffActivity().ok, true)

    // [mod] renaming: the pig already has a name, so it takes a rename card.
    reply(dispatch(store, 'pig', 'name Ann').text)
    assert.equal(store.state.name, 'Bo')
    assert.equal(store.buy('renamecard').ok, true)
    reply(dispatch(store, 'pig', 'name Ann').text)
    assert.equal(store.state.name, 'Ann')
    reply(dispatch(store, 'pig', 'name Ann').text)
    for (const line of ['trip tokyo', 'study math art', 'study math art music university', 'study math art university', 'buy duck', 'use renamecard', 'use duck']) {
      reply(dispatch(store, 'pig', line).text)
    }
    store.callOffActivity()

    // Neglect it until it falls ill.
    store.state.satiety = 5
    store.state.cleanliness = 5
    tick(30) // the Oceania perk (抗寒体质) doubles how long neglect takes
    store.freshen()
    const sick = shot()
    assert.equal(sick.pig.mood, 'sick')
    assert.notEqual(sick.pig.illness, null)

    // Death, the grave, and the revive item.
    assert.equal(store.dev({ dead: true }), true)
    const grave = shot()
    assert.equal(grave.dead, true)
    assert.ok(grave.pending.some(event => event.kind === 'death'))
    assert.equal(store.buy('soul').ok, true)
    assert.equal(store.useItem('soul').ok, true)
    const back = shot()
    assert.equal(back.dead, false)
    assert.ok(back.pending.some(event => event.kind === 'revived'))
    shot()

    // Replies the command writes itself, without render.js.
    for (const line of ['shop', 'calloff', 'work nowhere', 'trip nowhere', 'study nothing', 'buy nothing', 'use nothing', 'look sideways', 'look original', 'name', 'frobnicate', 'hatch']) {
      reply(dispatch(store, 'pig', line).text.split('\n\n')[0])
    }
    return { seen: collected(), store }
  } finally {
    store.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
}

test('an English pig: no Chinese anywhere in the snapshot or the command replies', () => {
  const { seen } = playThrough('en')
  for (const text of seen) {
    const at = text.search(HAN)
    assert.equal(at, -1, `Chinese left in: …${text.slice(Math.max(0, at - 80), at + 40)}…`)
  }
  const all = seen.join('\n')
  for (const phrase of ['Young pig', 'Odd jobs', 'Reading (Primary school)', 'Tokyo', 'Cold', 'Revival pill', 'Grave', 'coins',
    'Kusatsu onsen bath salts', 'Chow king', 'Globetrotter', 'Reading + Music + Martial arts (Doctorate)', 'Dr. ', 'Rename card', 'travel-only']) {
    assert.ok(all.includes(phrase), `${phrase} missing`)
  }
})

test('a Japanese pig: the Chinese-only phrases are gone', () => {
  const { seen } = playThrough('ja')
  const all = seen.join('\n')
  for (const zh of ['金币', '打零工', '青年猪', '长成了', '得了', '还魂丹', '墓碑', '纸盒', '郊游', '小学语文', '提前回来', '已经走了', '没有「',
    '纪念品', '集齐', '环球旅行家', '更名卡', '特产', '博士毕业', '东京']) {
    assert.ok(!all.includes(zh), `${zh} is still there`)
  }
  for (const ja of ['わかブタ', 'ちょいバイト', 'コイン', 'よみがえりの薬', 'かぜ', '小学校のこくご',
    '東京', '草津温泉の入浴剤', 'コンプリート', '世界一周トラベラー', '博士課程のこくご・おんがく・ぶじゅつ', '名前変更カード']) {
    assert.ok(all.includes(ja), `${ja} missing`)
  }
})

test('Chinese stays the default and reads as before', () => {
  const pig = hatchEgg(Date.now())
  assert.equal(pig.lang, 'zh')
  assert.equal(pig.name, '猪猪')
  assert.equal(mood(pig, Date.now()).label, '还不错')
  setLang(pig, 'en', Date.now())
  assert.equal(mood(pig, Date.now()).label, 'Doing fine')
  assert.equal(pig.name, 'Piggy', 'a default name follows the language (chosen names never do)')
  assert.equal(tr('en', '小学语文'), 'Reading (Primary school)')
})

test('the three game-logic dictionaries have the same keys in ja and en', () => {
  for (const [file, locale] of Object.entries({ data: dataLocale, core: coreLocale, index: indexLocale })) {
    const ja = Object.keys(locale.ja).sort()
    const en = Object.keys(locale.en).sort()
    assert.deepEqual(ja, en, `locales/${file}.js`)
    assert.ok(ja.length > 0, `locales/${file}.js is empty`)
    for (const lang of ['ja', 'en']) {
      for (const [zh, text] of Object.entries(locale[lang])) {
        assert.equal(typeof text, 'string', `${file} ${lang} ${zh}`)
        assert.notEqual(text.trim(), '', `${file} ${lang} ${zh}`)
        // Every placeholder in the key survives the translation.
        const wanted = (zh.match(/\{\w+\}/g) ?? []).sort()
        const got = (text.match(/\{\w+\}/g) ?? []).sort()
        assert.deepEqual(got, wanted, `${file} ${lang} ${zh}`)
        if (lang === 'en') assert.equal(text.match(HAN), null, `${file} en ${zh} → ${text}`)
      }
    }
  }
})
