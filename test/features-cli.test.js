/**
 * [dsh-piggy-claude-code mod] The three new features through the slash command:
 * world trips, several subjects at once (and the doctorate), and the rename
 * card — played on a real store, in Chinese and in English.
 *
 * Fares depend on the computer's time zone, so the numbers are checked against
 * core's own quote for the same zone rather than hard-coded.
 *
 * Run: node --test test/*.test.js
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { dispatch } from '../index.js'
import { createStore } from '../store.js'
import { tripQuote } from '../core.js'
import { RENAME_CARD, schoolStageByKey } from '../data.js'
import { tr } from '../i18n.js'
import { PLACES, SOUVENIRS, placeByKey, systemUtcOffset } from '../world.js'

const MIN = 60_000

/** A hatched pig on a real store with a fake clock, in `lang`, with money to spend. */
function withPig(lang, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pig-cli-'))
  let clock = Date.now()
  const store = createStore(join(dir, 'state.json'), { now: () => clock, setTimer: () => null, clearTimer: () => {} })
  try {
    assert.equal(store.hatch(), true)
    assert.equal(store.setLang(lang).ok, true)
    store.state.coins = 100_000
    const run = line => dispatch(store, 'pig', line)
    const tick = minutes => { clock += minutes * MIN; store.freshen() }
    // [ST0014] time is folded in minute by minute: wait just until the pig is back.
    const untilBack = () => Math.ceil((store.state.activity.endsAt - clock) / MIN) + 1
    return fn({ store, run, tick, untilBack, t: (zh, params) => tr(lang, zh, params) })
  } finally {
    store.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
}

for (const lang of ['zh', 'en']) {
  test(`${lang}: /pig trip lists every region and place, priced from this computer's time zone`, () => {
    withPig(lang, ({ store, run, t }) => {
      const reply = run('trip')
      assert.equal(reply.kind, 'success')
      const home = systemUtcOffset()
      for (const place of PLACES) {
        const quote = tripQuote(store.state, place.key, home)
        const line = reply.text.split('\n').find(l => l.includes(`(${place.key})`))
        assert.ok(line !== undefined, `${place.key} missing from /pig trip`)
        assert.ok(line.includes(t(place.label)), `${place.key} is not labelled in ${lang}: ${line}`)
        assert.ok(line.includes(t('{price} 金币', { price: quote.cost })) || line.includes(`${quote.cost} `), `${place.key} fare: ${line}`)
        assert.equal(quote.cost, 100 + 200 * quote.zones)
        assert.equal(quote.minutes, 60 + 60 * quote.zones)
      }
      assert.match(reply.text, new RegExp(`0/${SOUVENIRS.length}`))
      assert.ok(reply.text.includes(t('环球旅行家')), 'the grand title is named')
    })
  })

  test(`${lang}: /pig trip <place> takes a key or a label in any language and starts the trip`, () => {
    withPig(lang, ({ store, run, tick, untilBack, t }) => {
      // A label in the pig's own language…
      const coins = store.state.coins
      const quote = tripQuote(store.state, 'tokyo', systemUtcOffset())
      const reply = run(`trip ${t('东京')}`)
      assert.equal(reply.kind, 'success')
      assert.equal(store.state.activity?.kind, 'trip')
      assert.equal(store.state.activity.key, 'tokyo')
      assert.equal(store.state.coins, coins - quote.cost)
      assert.ok(reply.text.includes(t('东京')), reply.text)
      assert.ok(reply.text.includes(String(quote.cost)), reply.text)
      // Already away: a refusal, not a second trip.
      assert.match(run('trip beijing').text, new RegExp(t('{name} 已经在外面了。', { name: store.state.name })))
      tick(untilBack())
      assert.equal(store.state.activity, null)
      assert.equal(Object.keys(store.state.collected).length, 1, 'one souvenir came home')

      // …a label in another language, the key, and a spaced English name.
      for (const [input, key] of [['ソウル', 'seoul'], ['首尔', 'seoul'], ['Rio de Janeiro', 'rio'], ['newyork', 'newyork'], ['new york', 'newyork']]) {
        assert.equal(run(`trip ${input}`).kind, 'success', input)
        assert.equal(store.state.activity?.key, key, input)
        assert.equal(store.callOffActivity().ok, true)
      }

      // The old four trips are gone, and nonsense is refused.
      assert.equal(run('trip suburb').kind, 'error')
      assert.equal(run('trip mars').kind, 'error')
      assert.equal(store.state.activity, null)

      // Too poor for the fare.
      store.state.coins = 50
      const refused = run(`trip ${t(placeByKey('london').label)}`)
      assert.equal(store.state.activity, null)
      assert.match(refused.text, new RegExp(`${tripQuote(store.state, 'london', systemUtcOffset()).cost}`))
    })
  })

  test(`${lang}: /pig study takes several subjects up to the stage's limit, and the doctorate`, () => {
    withPig(lang, ({ store, run, t }) => {
      // No stage: 小学, one subject.
      assert.equal(run(`study ${t('语文')}`).kind, 'success')
      assert.deepEqual(store.state.activity.keys, ['chinese'])
      assert.equal(store.state.activity.stage, 'primary')
      assert.equal(store.callOffActivity().ok, true)

      // University is locked until every primary lesson is done.
      const locked = run(`study ${t('数学')} ${t('美术')} ${t('大学')}`)
      assert.equal(store.state.activity, null)
      assert.ok(locked.text.includes(t('小学九门课各上一次')), locked.text)

      store.state.lessonsByStage = { primary: 9, college: 9, graduate: 9, doctor: 0 }
      const coins = store.state.coins
      const pair = run(`study ${t('数学')}, ${t('美术')} ${t('大学')}`)
      assert.equal(pair.kind, 'success')
      assert.deepEqual(store.state.activity.keys, ['mathematics', 'art'])
      assert.equal(store.state.activity.stage, 'college')
      assert.equal(store.state.coins, coins - 2 * schoolStageByKey('college').tuition)
      assert.ok(pair.text.includes(t('{stage}{subjects}', { stage: t('大学'), subjects: [t('数学'), t('美术')].join(t('+')) })), pair.text)
      assert.equal(store.callOffActivity().ok, true)

      // Three at university is one too many; the refusal says how many fit.
      const many = run(`study ${t('数学')}、${t('美术')}、${t('音乐')} ${t('大学')}`)
      assert.equal(store.state.activity, null)
      assert.ok(many.text.includes(t('{stage}一次最多上 {max} 门课。', { stage: t('大学'), max: 2 })), many.text)

      // [mod] ST0002: a used-up subject at a capped stage is refused by name.
      store.state.stageCourses = { ...store.state.stageCourses, college: { mathematics: 2 } }
      const capped = run(`study ${t('数学')}, ${t('美术')} ${t('大学')}`)
      assert.equal(store.state.activity, null)
      assert.ok(capped.text.includes(t('{stage}每门课最多上 {max} 次，{subjects}已经上满了。', { stage: t('大学'), max: 2, subjects: t('数学') })), capped.text)

      // Stage first, keys instead of labels, the doctorate takes three.
      assert.equal(run('study doctor chinese music wushu').kind, 'success')
      assert.deepEqual(store.state.activity.keys, ['chinese', 'music', 'wushu'])
      assert.equal(store.state.activity.stage, 'doctor')
      assert.equal(store.callOffActivity().ok, true)
      assert.equal(run(`study ${t('语文')} ${t('音乐')} ${t('武术')} ${t('博士')}`).kind, 'success')
      assert.equal(store.state.activity.stage, 'doctor')
      assert.equal(store.callOffActivity().ok, true)

      // Gibberish gets the usage, which names the new stage.
      const usage = run('study quantum basketweaving')
      assert.equal(usage.kind, 'error')
      assert.ok(usage.text.includes(t('博士')), usage.text)
    })
  })

  test(`${lang}: /pig name is free once, then costs a rename card`, () => {
    withPig(lang, ({ store, run, t }) => {
      const card = t(RENAME_CARD.label)
      // The default name may be swapped for free.
      const first = run('name Bao')
      assert.equal(first.kind, 'success')
      assert.equal(store.state.name, 'Bao')
      assert.ok(first.text.includes(card), 'says that the next rename needs a card')

      // Now it takes a card: the reply says what it costs and where to get it.
      const refused = run('name Mochi')
      assert.equal(store.state.name, 'Bao')
      assert.ok(refused.text.includes(card) && refused.text.includes(String(RENAME_CARD.price)) && refused.text.includes(`buy ${RENAME_CARD.key}`), refused.text)

      // The shop has a shelf for it; /pig use explains it is spent by renaming.
      const shop = run('shop').text
      assert.ok(shop.includes(t('道具')) && shop.includes(card), shop)
      assert.equal(run(`buy ${card}`).kind, 'success')
      assert.equal(store.state.inventory[RENAME_CARD.key], 1)
      assert.ok(run(`use ${RENAME_CARD.key}`).text.includes('/pig name'))
      assert.equal(store.state.inventory[RENAME_CARD.key], 1)

      const renamed = run('name Mochi')
      assert.equal(store.state.name, 'Mochi')
      assert.equal(store.state.inventory[RENAME_CARD.key], 0)
      assert.ok(renamed.text.includes(card), renamed.text)

      // Same name and an overlong one change nothing and spend nothing.
      assert.ok(run('name Mochi').text.includes('Mochi'))
      assert.equal(run(`name ${'x'.repeat(17)}`).kind, 'error')
      assert.equal(store.state.name, 'Mochi')

      // Travel-only specialties are never for sale.
      const coins = store.state.coins
      assert.ok(run(`buy ${t('北京烤鸭')}`).text.includes(t('北京烤鸭')))
      assert.equal(store.state.coins, coins)
      assert.equal(store.state.inventory.duck ?? 0, 0)
    })
  })
}

// [ST0004] the wardrobe through the slash command.
for (const lang of ['zh', 'en']) {
  test(`${lang}: /pig wear lists, toggles, refuses what is locked and goes back to the stage look`, () => {
    withPig(lang, ({ store, run, t }) => {
      const list = run('wear')
      assert.equal(list.kind, 'success')
      assert.ok(list.text.includes(t('👗 衣柜{auto}', { auto: t('（现在跟着阶段穿）') })), list.text)
      assert.ok(list.text.includes(`✅🎀${t('蝴蝶结')}`), 'the piglet wears its bow')
      assert.ok(list.text.includes(`🔒🎓${t('学士帽')}`), 'the mortarboard is locked')

      assert.equal(run('wear bow').text, t('👗 摘下了{item}', { item: `🎀${t('蝴蝶结')}` }))
      assert.deepEqual(store.state.outfit, [], 'dressed by hand: nothing on')
      assert.equal(run(`wear ${t('蝴蝶结')}`).text, t('👗 戴上了{item}', { item: `🎀${t('蝴蝶结')}` }), 'by its name too')
      assert.deepEqual(store.state.outfit, ['bow'])

      const locked = run('wear mortarboard')
      assert.ok(locked.text.startsWith('🔒'), locked.text)
      assert.ok(locked.text.includes(t('拿到任意一张毕业证后解锁')), locked.text)
      assert.equal(run('wear cape').kind, 'error')

      assert.equal(run('wear none').text, t('👗 全脱了，光溜溜的'))
      assert.deepEqual(store.state.outfit, [])
      assert.equal(run('wear auto').text, t('👗 跟着阶段穿了'))
      assert.equal(store.state.outfit, null)
    })
  })

  test(`${lang}: [ST0012] /pig shop has a 装扮 shelf; /pig buy puts the gear on, once`, () => {
    withPig(lang, ({ store, run, t }) => {
      const shop = run('shop').text
      assert.ok(shop.includes(t('【{shelf}】', { shelf: t('装扮') })), shop)
      assert.ok(shop.includes(`📟 ${t('BP机皮带')}  ${t('{price} 金币', { price: 288 })}`), shop)

      const bought = run(`buy ${t('BP机皮带')}`)
      assert.ok(bought.text.includes(t('👗 已经穿上了，衣柜里随时换：/pig wear')), bought.text)
      assert.deepEqual(store.state.wardrobeBought, ['pager'])
      assert.ok(run('wear').text.includes(`✅📟${t('BP机皮带')}`), 'worn')
      assert.ok(run('shop').text.includes(`📟 ${t('BP机皮带')}  ${t('已拥有')}`), 'the shelf says it is owned')
      assert.equal(run('buy pager').text, t('👗 {emoji} {item} 已经在衣柜里了，不用再买。', { emoji: '📟', item: t('BP机皮带') }))
      assert.ok(run('wear').text.includes(t('在商店「装扮」货架买，{price} 金币', { price: 66 })), 'the hint says where to buy it')
    })
  })
}
