/**
 * dsh-pig client tests — run the browser bundle in a faked DOM.
 *
 * The client half is a plain script that self-registers through
 * `window.__ModuleLoader__`, so it can be loaded and exercised in Node with a
 * minimal DOM stub. This covers what would otherwise only show up in a real
 * browser: the pig not moving, the six icons doing nothing, an empty shop, or a
 * screen full of `undefined` after a host/client version mismatch.
 *
 * Run: node --test test/*.test.js
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

/** The bundle source, as written. */
const readSource = () => readFile(new URL('../client.js', import.meta.url), 'utf8')

/**
 * The stylesheet the browser actually receives.
 *
 * The bundle assembles `CSS` from many concatenated string literals, so a regex
 * run against the source can only ever see one fragment at a time — a rule
 * split across two literals looks absent even when it is there. Joining the
 * literals back together first is what makes these static assertions mean
 * something.
 */
async function readCss() {
  const source = await readSource()
  const start = source.indexOf('var CSS = [')
  const end = source.indexOf("].join('')", start)
  assert.ok(start >= 0 && end > start, 'could not locate the CSS array')
  const body = source.slice(start, end)
  // Two shapes of literal: one that begins a line, and one appended to a
  // previous literal with `+`. The cursor data-URI is split across seven of the
  // latter, so matching only line-anchored literals silently truncated the sheet
  // and made the brace-balance check below meaningless.
  // Anchoring matters: a plain quoted-string scan is fooled by apostrophes
  // inside comments ("the UA sheet's ...").
  return [...body.matchAll(/(?:^[ \t]*|\+[ \t]*)'((?:[^'\\]|\\.)*)'/gm)]
    .map(match => match[1])
    .join('')
}

/** The smallest DOM that satisfies the bundle. */
function fakeDom() {
  /** A zero-sized box; tests that care set `element.rect` explicitly. */
  const emptyRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 })

  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName
      this.children = []
      this.style = { setProperty() {}, removeProperty() {} }
      this.attributes = {}
      this.className = ''
      this.textContent = ''
      this.disabled = false
      this.hidden = false
      this.type = ''
      this.parentNode = null
      this.listeners = {}
      this.rect = emptyRect()
    }

    // The bundle measures the scene to keep itself on screen, so a DOM without
    // geometry makes mount() throw — and apply() swallows that, which shows up
    // as "the pig is simply not there".
    getBoundingClientRect() { return this.rect }

    appendChild(child) {
      child.parentNode = this
      this.children.push(child)
      return child
    }

    setAttribute(name, value) { this.attributes[name] = String(value) }
    getAttribute(name) { return this.attributes[name] ?? null }
    removeAttribute(name) { delete this.attributes[name] }
    insertBefore(child) { return this.appendChild(child) }
    remove() {
      if (this.parentNode !== null) {
        const index = this.parentNode.children.indexOf(this)
        if (index >= 0) this.parentNode.children.splice(index, 1)
        this.parentNode = null
      }
    }

    addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn) }
    setPointerCapture() {}
    // Focus is tracked like a browser does, on `document.activeElement`.
    focus() { document.activeElement = this }
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end }
    querySelector() { return null }

    /** Fire a listener with `this` bound like a real DOM. */
    fire(name, event = {}) {
      for (const fn of this.listeners[name] ?? []) {
        fn.call(this, { stopPropagation() {}, preventDefault() {}, ...event })
      }
    }

    allText() {
      return [this.textContent, ...this.children.map(c => c.allText())].join(' ')
    }

    walk(visit) {
      visit(this)
      for (const child of this.children) child.walk(visit)
    }
  }

  const head = new FakeElement('head')
  const body = new FakeElement('body')
  const document = {
    head,
    body,
    activeElement: null,
    createElement(tag) { return new FakeElement(tag) },
    querySelector() { return null },
    addEventListener() {},
    removeEventListener() {},
  }
  return { document, head, body, FakeElement }
}

function fakeNet(status, actResult) {
  const calls = []
  const fetch = async (url, options) => {
    const method = options?.method ?? 'GET'
    calls.push({ url, method, body: options?.body })
    const payload = method === 'POST' ? (actResult ?? status) : status
    return { ok: true, status: 200, async json() { return payload } }
  }
  return { fetch, calls }
}

async function loadClient(options) {
  const { status = SNAPSHOT, actResult = null, storage = {} } = options ?? {}
  const dom = fakeDom()
  const net = fakeNet(status, actResult)
  // `storage` seeds localStorage, as if an earlier session had left it there.
  const store = new Map(Object.entries(storage))

  const windowListeners = {}
  globalThis.window = {
    __ModuleLoader__: { load: () => {} },
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => { store.set(key, String(value)) },
    },
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    // Geometry, so the on-screen clamp is exercised instead of skipped.
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: (name, fn) => { (windowListeners[name] ??= []).push(fn) },
    removeEventListener: (name, fn) => {
      const list = windowListeners[name]
      if (list) windowListeners[name] = list.filter(entry => entry !== fn)
    },
  }
  const resize = () => { for (const fn of windowListeners.resize ?? []) fn() }
  globalThis.document = dom.document
  globalThis.fetch = net.fetch
  // Read the real inline style back. A constant stub makes every drag start from
  // the same fictional origin, which quietly invalidates drag assertions.
  globalThis.getComputedStyle = element => ({
    right: element?.style?.right || '18px',
    bottom: element?.style?.bottom || '18px',
  })

  let registration = null
  globalThis.window.__ModuleLoader__ = { load: entry => { registration = entry } }

  const url = new URL('../client.js', import.meta.url)
  url.searchParams.set('t', String(Math.random()))
  await import(url.href)

  return { dom, net, registration, store, resize, windowListeners }
}

const hostOf = dom => {
  const found = []
  dom.body.walk(node => { if (node.attributes?.['data-dsh-pig'] !== undefined) found.push(node) })
  return found[0]
}
// The pig is a sibling of the panel, not a child of it: host = [panel, scene].
const cardOf = dom => hostOf(dom).children[0]
const sceneOf = dom => hostOf(dom).children[1]
// Inside the panel, content sits above the icon bar.
const contentOf = dom => cardOf(dom).children[0]
const barOf = dom => cardOf(dom).children[1]

const findByAttr = (root, attr, value) => {
  const found = []
  root.walk(node => { if (node.attributes?.[attr] === value) found.push(node) })
  return found[0]
}
const findByClass = (root, className) => {
  const found = []
  root.walk(node => {
    if (typeof node.className === 'string' && node.className.split(/\s+/).includes(className)) found.push(node)
  })
  return found[0]
}

const settle = () => new Promise(resolve => setImmediate(resolve))

/** Open the panel by tapping the pig. */
function openPanel(dom) {
  // The menu lives on the context menu; a left click only pats the pig.
  sceneOf(dom).fire('contextmenu', { preventDefault() {} })
}

/** Left-click the pig (a pat, not the menu). */
function patPig(dom) {
  sceneOf(dom).fire('pointerdown', { button: 0, clientX: 0, clientY: 0 })
  sceneOf(dom).fire('pointerup', {})
}

/** Switch to one of the six icons. */
/** [ST0015] From the shop tab, step into the casino (scratch cards, blackjack). */
function openCasino(dom) {
  findByAttr(contentOf(dom), 'data-casino', 'open').fire('click')
}

function pickTab(dom, key) {
  findByAttr(barOf(dom), 'data-tab', key).fire('click')
}

const ACTIONS = {
  feed: { ready: true, waitSeconds: 0, blocked: null },
  bathe: { ready: true, waitSeconds: 0, blocked: null },
  play: { ready: false, waitSeconds: 37, blocked: null },
  pet: { ready: true, waitSeconds: 0, blocked: null },
}

const JOBS = [
  { key: 'odd', label: '打零工', emoji: '🧹', minutes: 1, coins: 12, available: true },
  { key: 'site', label: '搬砖', emoji: '🧱', minutes: 3, coins: 42, available: true },
]

const SUBJECTS = [
  { key: 'chinese', label: '语文', emoji: '📖', traitLabel: '智力', level: 2, available: true },
  { key: 'art', label: '美术', emoji: '🎨', traitLabel: '魅力', level: 0, available: true },
  { key: 'wushu', label: '武术', emoji: '🥋', traitLabel: '武力', level: 1, available: true },
]

const STAGES = [
  { key: 'primary', label: '小学', minutes: 2, tuition: 10, gain: 1 },
  { key: 'college', label: '大学', minutes: 6, tuition: 45, gain: 2 },
  { key: 'graduate', label: '研究生', minutes: 15, tuition: 130, gain: 4 },
]

const TRIPS = [
  { key: 'suburb', label: '郊游', emoji: '🏞', minutes: 3, cost: 15, affordable: true, available: true },
  { key: 'abroad', label: '出国', emoji: '🌍', minutes: 40, cost: 400, affordable: false, available: true },
]

const SHOP = [
  { key: 'apple', label: '苹果', emoji: '🍎', price: 6, kind: 'food', tier: null, affordable: true, needed: false },
  { key: 'med1', label: '普通药', emoji: '💊', price: 12, kind: 'medicine', tier: 1, affordable: true, needed: true },
  { key: 'soul', label: '还魂丹', emoji: '✨', price: 150, kind: 'revive', tier: null, affordable: false, needed: false },
]

const PIG = {
  name: '大花',
  stage: { key: 'middle', label: '中年猪', emoji: '🐖', size: 62, line: '很有分量' },
  ageLabel: '4 天大', daysToNextStage: 3, soul: false,
  mood: 'happy', moodEmoji: '❤️', moodLabel: '很开心',
  satiety: 62, happiness: 74, cleanliness: 41,
  health: 4, healthPercent: 80,
  weight: '8.4 kg', xp: 168, xpToNext: 232, coins: 88,
  traits: { intel: 5, charm: 3, strong: 2 },
  courses: { chinese: 2 }, souvenirs: ['贝壳', '松果'],
  illness: null, stageLine: '圆滚滚的，走路会晃',
  memories: ['[16:53] 长成了「圆滚猪」🐖'],
}

const SNAPSHOT = {
  ok: true, hatched: true, dead: false, pig: PIG,
  actions: ACTIONS, jobs: JOBS, subjects: SUBJECTS, stages: STAGES, trips: TRIPS,
  shop: SHOP, inventory: { apple: 2, med1: 0, soul: 0 },
  activity: null, canGoOut: true, awayBlocked: null, pending: [],
  reviveItem: 'soul', maxHealth: 5,
}

// ===========================================================================
// Registration, mounting, the collapsed form
// ===========================================================================

test('client bundle registers itself under the package id', async () => {
  const { registration } = await loadClient()
  assert.equal(registration.id, 'dsh-piggy')
  assert.equal(typeof registration.factory, 'function')
})

test('client exports name and apply in the shape DSH expects', async () => {
  const { registration } = await loadClient()
  const exports = registration.factory(() => {})
  assert.equal(exports.name, 'dsh-piggy')
  assert.equal(typeof exports.apply, 'function')
})

test('apply mounts a floating pig and returns a disposer', async () => {
  const { registration, dom } = await loadClient()
  const dispose = registration.factory(() => {}).apply({})
  assert.equal(typeof dispose, 'function')
  assert.equal(cardOf(dom).className, 'dp-card')
  await settle()
  assert.ok(hostOf(dom).allText().includes('🐖'))
})

test('the pig carries an animation and a mood the CSS keys off', async () => {
  const { registration, dom } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()
  assert.notEqual(findByAttr(hostOf(dom), 'data-mood', 'happy'), undefined)
})

test('there is no decorative background on the scene', async () => {
  const { registration, dom } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()
  assert.equal(findByClass(hostOf(dom), 'dp-cloud'), undefined)
  assert.equal(findByClass(hostOf(dom), 'dp-grass'), undefined)
})

test('the pig starts collapsed and tapping it opens the panel', async () => {
  const { registration, dom } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()
  assert.equal(hostOf(dom).attributes['data-open'], 'false')
  openPanel(dom)
  assert.equal(hostOf(dom).attributes['data-open'], 'true')
  openPanel(dom)
  assert.equal(hostOf(dom).attributes['data-open'], 'false')
})

/**
 * Regression: collapsing used to only strip the card's background, leaving the
 * six icons, the content area and the hud all floating on a transparent card.
 * Collapsed must be the pig and nothing else.
 */
test('collapsing hides the whole panel and leaves only the pig', async () => {
  const { registration, dom } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()

  const card = cardOf(dom)
  assert.equal(hostOf(dom).attributes['data-open'], 'false')
  assert.equal(card.hidden, true, 'the panel must be hidden while collapsed')

  openPanel(dom)
  assert.equal(card.hidden, false, 'the panel returns when opened')

  openPanel(dom)
  assert.equal(card.hidden, true, 'and goes away again')
})

test('the collapsed widget contains the pig and nothing else', async () => {
  const { registration, dom } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()

  // Treat `hidden` as display:none so "visible text" means something.
  const visibleText = node => (node.hidden ? '' : [node.textContent, ...node.children.map(visibleText)].join(' '))
  const text = visibleText(hostOf(dom))
  assert.ok(text.includes('🐖'), `the pig should still show: ${text}`)
  assert.ok(!text.includes('状态'), `the icons should be gone: ${text}`)
  assert.ok(!text.includes('大花'), `the hud should be gone: ${text}`)
  assert.ok(!text.includes('🪙'), `no coin readout while collapsed: ${text}`)

  openPanel(dom)
  const openText = visibleText(hostOf(dom))
  assert.ok(openText.includes('状态'), `the icons return when opened: ${openText}`)
  assert.ok(openText.includes('大花'), `the hud returns when opened: ${openText}`)
})

test('the pig is a sibling of the panel, so opening cannot move it', async () => {
  const { registration, dom } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()
  const host = hostOf(dom)
  // host = [panel, scene]; the pig is NOT inside the panel.
  assert.equal(host.children.length, 2)
  assert.equal(host.children[0].className, 'dp-card')
  assert.equal(host.children[1].className, 'dp-scene')
  assert.equal(findByClass(host.children[0], 'dp-pig'), undefined, 'the pig must not live inside the panel')
  assert.notEqual(findByClass(host.children[1], 'dp-pig'), undefined, 'the pig lives in the scene')
})

/**
 * Regression, and a lesson about what a test can prove.
 *
 * A fake DOM has no CSS engine, so `bar.hidden = true` looked correct in every
 * assertion above while the real browser kept painting the icon bar: `.dp-bar`
 * sets `display:grid`, which ties on specificity with the UA sheet's
 * `[hidden]{display:none}` and wins by source order. `hidden` is therefore only
 * as good as the CSS behind it, and that has to be checked statically.
 */
test('the composed stylesheet is balanced and complete', async () => {
  const css = await readCss()
  let depth = 0
  for (const ch of css) {
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    assert.ok(depth >= 0, 'the sheet closes a block it never opened')
  }
  assert.equal(depth, 0, `the sheet is unbalanced by ${depth} — a rule is swallowing the rest`)

  // A truncated data-URI is exactly how the sheet went unbalanced before.
  const cursor = css.slice(css.indexOf('.dp-pig{cursor:url('))
  const uri = cursor.slice(0, cursor.indexOf("')"))
  assert.ok(uri.includes('</svg>'), 'the petting-hand cursor data-URI must be complete')
  assert.ok(css.includes('.dp-pig-img{'), 'the sprite sizing rule survived')
})

test('classes the bundle hides carry a CSS rule that beats their own display', async () => {
  const css = await readCss()
  const source = await readSource()

  // Derived from the source, NOT a hand-kept list. The previous version spelled
  // the class names out, so when .dp-work started being hidden the array was
  // never updated and the test stayed green while the work prop hung beside an
  // idle pig.
  const classes = new Map()
  for (const m of source.matchAll(/var (\w+) = el\('[a-z]+', '([A-Za-z0-9_-]+)/g)) classes.set(m[1], m[2])
  for (const m of source.matchAll(/var (\w+) = document\.createElement\('[a-z]+'\)\s*\n\s*\1\.className = '([A-Za-z0-9_-]+)'/g)) {
    classes.set(m[1], m[2])
  }

  const hiddenVars = [...new Set([...source.matchAll(/(\w+)\.hidden\s*=/g)].map(m => m[1]))]
  const resolved = hiddenVars.map(name => classes.get(name)).filter(Boolean)
  assert.ok(resolved.length >= 5, `expected to resolve several hidden elements, got ${resolved.join(', ')}`)

  for (const cls of resolved) {
    assert.ok(
      css.includes(`.${cls}[hidden]`),
      `.${cls} is hidden by JS but no CSS rule hides it — the element will keep rendering`,
    )
  }
})

test('the open panel shows the live host state', async () => {
  const { registration, dom, net } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()
  assert.equal(net.calls[0].url, '/dsh-pig/state')
  openPanel(dom)
  const text = hostOf(dom).allText()
  assert.ok(text.includes('大花'), text)
  assert.ok(text.includes('圆滚猪'), text)
  assert.ok(text.includes('88'), `expected coins, got: ${text}`)
  assert.ok(text.includes('4/5'), `expected health, got: ${text}`)
})

// ===========================================================================
// THE regression: a legacy host must not paint `undefined`
// ===========================================================================

test('a legacy host payload renders defaults, never "undefined"', async () => {
  // Exactly what the old host returned before coins/health/jobs/shop existed.
  const legacy = {
    ok: true,
    pig: {
      name: '猪猪',
      stage: { key: 'middle', label: '中年猪', emoji: '🐖', size: 62 },
      ageLabel: '4 天大',
      mood: 'happy', moodEmoji: '❤️', moodLabel: '很开心',
      satiety: 100, happiness: 76, weight: '2.2 kg', xp: 295, xpToNext: 105,
      canFeed: true, feedWaitSeconds: 0, stageLine: '圆滚滚的，走路会晃',
      memories: ['[17:59] 从蛋壳里钻出来了 🐣'],
    },
  }
  const { registration, dom } = await loadClient({ status: legacy })
  registration.factory(() => {}).apply({})
  await settle()

  const collapsed = hostOf(dom).allText()
  assert.ok(!collapsed.includes('undefined'), `collapsed shows undefined: ${collapsed}`)
  assert.ok(!collapsed.includes('NaN'), `collapsed shows NaN: ${collapsed}`)
  assert.ok(collapsed.includes('🪙 0'), `coins should default to 0, got: ${collapsed}`)

  openPanel(dom)
  for (const tab of ['status', 'study', 'work', 'shop', 'travel', 'bag']) {
    pickTab(dom, tab)
    const text = hostOf(dom).allText()
    assert.ok(!text.includes('undefined'), `tab ${tab} shows undefined: ${text}`)
    assert.ok(!text.includes('NaN'), `tab ${tab} shows NaN: ${text}`)
  }
})

test('a legacy host is called out instead of silently showing gaps', async () => {
  const { registration, dom } = await loadClient({
    status: { ok: true, pig: { name: '猪猪', stage: { key: 'piglet', label: '小猪', emoji: '🐖', size: 40 }, ageLabel: '今天刚出生', mood: 'fine', satiety: 50, happiness: 50, weight: '1.5 kg', xp: 40 } },
  })
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)
  const text = hostOf(dom).allText()
  assert.ok(text.includes('宿主是旧版本'), text)
  assert.ok(text.includes('重启 dsh'), text)
})

test('a truncated payload still renders without throwing', async () => {
  const { registration, dom } = await loadClient({
    status: { ok: true, pig: { name: '猪猪' }, actions: null, jobs: 'nope', shop: 42, inventory: null, pending: null },
  })
  assert.doesNotThrow(() => registration.factory(() => {}).apply({}))
  await settle()
  openPanel(dom)
  for (const tab of ['status', 'study', 'work', 'shop', 'travel', 'bag']) {
    pickTab(dom, tab)
    assert.ok(!hostOf(dom).allText().includes('undefined'), `tab ${tab} broke`)
  }
})

// ===========================================================================
// The six-icon bar
// ===========================================================================

test('the icon bar holds exactly the six QQ Pet entries in order', async () => {
  const { registration, dom } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)

  // allText() joins sibling text with spaces, so collapse runs of whitespace.
  const labelOf = key => findByAttr(barOf(dom), 'data-tab', key).allText().replace(/\s+/g, ' ').trim()
  assert.deepEqual(
    ['status', 'study', 'work', 'shop', 'travel', 'bag'].map(labelOf),
    ['📋 状态', '📚 学习', '💼 打工', '🛒 商店', '🧳 旅行', '🎒 背包'],
  )
  assert.equal(barOf(dom).children.length, 6)
  assert.equal(findByAttr(barOf(dom), 'data-tab', 'status').attributes['data-active'], 'true')
})

test('clicking an icon marks it active and switches the content', async () => {
  const { registration, dom } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)

  pickTab(dom, 'work')
  assert.equal(findByAttr(barOf(dom), 'data-tab', 'work').attributes['data-active'], 'true')
  assert.equal(findByAttr(barOf(dom), 'data-tab', 'status').attributes['data-active'], 'false')
  assert.ok(contentOf(dom).allText().includes('打零工'), contentOf(dom).allText())
})

test('the shop icon flags itself when the pig is sick', async () => {
  const { registration, dom } = await loadClient({
    status: { ...SNAPSHOT, pig: { ...PIG, illness: { name: '感冒', cure: '板蓝根', stage: 1 } } },
  })
  registration.factory(() => {}).apply({})
  await settle()
  assert.equal(findByAttr(barOf(dom), 'data-tab', 'shop').attributes['data-alert'], 'true')
})

// ===========================================================================
// Per-tab content
// ===========================================================================

test('the status tab shows labelled bars, traits and the care buttons', async () => {
  const { registration, dom } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)

  const text = contentOf(dom).allText()
  for (const label of ['饱食', '心情', '清洁', '健康', '智力', '魅力', '武力', '体重', '年龄']) {
    assert.ok(text.includes(label), `expected "${label}" in: ${text}`)
  }
  for (const key of ['feed', 'bathe', 'play', 'pet']) {
    assert.notEqual(findByAttr(contentOf(dom), 'data-action', key), undefined, `care button ${key}`)
  }
  const play = findByAttr(contentOf(dom), 'data-action', 'play')
  assert.equal(play.disabled, true, 'cooling-down action is disabled')
  assert.ok(play.allText().includes('37'), play.allText())
})

test('the study tab lists stages and subjects, and studying POSTs both', async () => {
  const { registration, dom, net } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)
  pickTab(dom, 'study')

  const text = contentOf(dom).allText()
  assert.ok(text.includes('小学'), text)
  assert.ok(text.includes('语文'), text)
  assert.ok(text.includes('美术'), text)
  assert.ok(text.includes('已上 2 次'), text)

  findByAttr(contentOf(dom), 'data-stage', 'college').fire('click')
  findByAttr(contentOf(dom), 'data-subject', 'art').fire('click')
  await settle()
  await settle()

  const post = net.calls.find(call => call.method === 'POST')
  assert.deepEqual(JSON.parse(post.body), { action: 'study', subject: 'art', stage: 'college' })
})

test('the work tab lists jobs and sending the pig out POSTs the job', async () => {
  const { registration, dom, net } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)
  pickTab(dom, 'work')

  const text = contentOf(dom).allText()
  assert.ok(text.includes('打零工'), text)
  assert.ok(text.includes('12'), text)

  findByAttr(contentOf(dom), 'data-job', 'odd').fire('click')
  await settle()
  await settle()
  const post = net.calls.find(call => call.method === 'POST')
  assert.deepEqual(JSON.parse(post.body), { action: 'work', job: 'odd' })
})

test('the shop tab disables what the pig cannot afford and flags the needed medicine', async () => {
  const { registration, dom, net } = await loadClient({
    status: { ...SNAPSHOT, pig: { ...PIG, illness: { name: '感冒', cure: '板蓝根', stage: 1 } } },
  })
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)
  pickTab(dom, 'shop')

  assert.equal(findByAttr(contentOf(dom), 'data-buy', 'soul').disabled, true)
  assert.equal(findByAttr(contentOf(dom), 'data-buy', 'apple').disabled, false)
  assert.ok(contentOf(dom).allText().includes('现在需要'), contentOf(dom).allText())

  findByAttr(contentOf(dom), 'data-buy', 'apple').fire('click')
  await settle()
  await settle()
  const post = net.calls.find(call => call.method === 'POST')
  assert.deepEqual(JSON.parse(post.body), { action: 'buy', item: 'apple' })
})

test('an older host without a travel world still gets the flat destination list', async () => {
  const { registration, dom, net } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)
  pickTab(dom, 'travel')

  const text = contentOf(dom).allText()
  assert.ok(text.includes('郊游'), text)
  assert.ok(text.includes('纪念品 2'), `expected the collection count, got: ${text}`)
  assert.ok(text.includes('贝壳'), text)
  assert.equal(findByAttr(contentOf(dom), 'data-trip', 'abroad').disabled, true, 'unaffordable trip is disabled')

  findByAttr(contentOf(dom), 'data-trip', 'suburb').fire('click')
  await settle()
  await settle()
  const post = net.calls.find(call => call.method === 'POST')
  assert.deepEqual(JSON.parse(post.body), { action: 'trip', trip: 'suburb' })
})

test('an older host without a bag list still shows owned shop items with a use button', async () => {
  const { registration, dom, net } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)
  pickTab(dom, 'bag')

  const text = contentOf(dom).allText()
  assert.ok(text.includes('苹果'), text)
  assert.ok(text.includes('×2'), text)
  assert.equal(findByAttr(contentOf(dom), 'data-use', 'med1'), undefined, 'zero-count items are hidden')

  findByAttr(contentOf(dom), 'data-use', 'apple').fire('click')
  await settle()
  await settle()
  const post = net.calls.find(call => call.method === 'POST')
  assert.deepEqual(JSON.parse(post.body), { action: 'use', item: 'apple' })
})

test('an empty bag says so instead of showing nothing', async () => {
  const { registration, dom } = await loadClient({
    status: { ...SNAPSHOT, inventory: { apple: 0, med1: 0, soul: 0 } },
  })
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)
  pickTab(dom, 'bag')
  assert.ok(contentOf(dom).allText().includes('背包空空的'))
})

// ===========================================================================
// Banners: away, sick, dead, unhatched
// ===========================================================================

test('an active trip shows a countdown banner and a recall button', async () => {
  const { registration, dom } = await loadClient({
    status: { ...SNAPSHOT, canGoOut: false, activity: { kind: 'trip', key: 'sea', label: '看海', emoji: '🌊', secondsLeft: 42 } },
  })
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)

  const text = contentOf(dom).allText()
  assert.ok(text.includes('42'), text)
  assert.ok(text.includes('看海'), text)
  assert.notEqual(findByAttr(contentOf(dom), 'data-action', 'calloff'), undefined)
})

test('the sleep button puts the pig to bed, and a sleeping pig shows it and can be woken', async () => {
  const awake = await loadClient()
  awake.registration.factory(() => {}).apply({})
  await settle()
  openPanel(awake.dom)
  findByAttr(contentOf(awake.dom), 'data-action', 'sleep').fire('click')
  await settle()
  await settle()
  const post = awake.net.calls.find(call => call.method === 'POST')
  assert.deepEqual(JSON.parse(post.body), { action: 'sleep' })

  const stage = { key: 'young', label: '青年猪', emoji: '🐖', size: 48, art: 'stage-young' }
  const asleep = await loadClient({ status: { ...SNAPSHOT, pig: { ...PIG, stage, mood: 'asleep', asleep: true, sleepAuto: true } } })
  asleep.registration.factory(() => {}).apply({})
  await settle()
  assert.equal(findByClass(hostOf(asleep.dom), 'dp-pig-img').src, '/dsh-pig/art/mood-asleep.svg')
  openPanel(asleep.dom)
  const text = contentOf(asleep.dom).allText()
  assert.ok(text.includes('在睡觉'), text)
  assert.ok(text.includes('电脑醒来'), text)
  assert.equal(findByAttr(contentOf(asleep.dom), 'data-action', 'sleep'), undefined)
  assert.notEqual(findByAttr(contentOf(asleep.dom), 'data-action', 'wake'), undefined)
})

test('a sick pig shows its illness and what it needs', async () => {
  const { registration, dom } = await loadClient({
    status: { ...SNAPSHOT, pig: { ...PIG, illness: { name: '肺炎', cure: '金色消炎药水', stage: 4 } } },
  })
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)
  const text = contentOf(dom).allText()
  assert.ok(text.includes('肺炎'), text)
  assert.ok(text.includes('金色消炎药水'), text)
})

test('a box that already has a save is still pokeable', async () => {
  // `reset` and `adopt` write a real save with hatched:false, so `pig` is an
  // object rather than null. Gating the poke on `pig === null` meant clicking
  // such a box fell through to petting and the pig said 好舒服…
  const { registration, dom, net } = await loadClient({
    status: {
      ...SNAPSHOT,
      hatched: false,
      dead: false,
      pig: { ...PIG, stage: { key: 'box', label: '纸盒', emoji: '📦', size: 58 }, ageLabel: '还没拆开' },
    },
  })
  registration.factory(() => {}).apply({})
  await settle()

  const host = hostOf(dom)
  const scene = sceneOf(dom)
  const poke = () => { scene.fire('pointerdown', { button: 0, clientX: 0, clientY: 0 }); scene.fire('pointerup', {}) }

  assert.equal(host.attributes['data-unhatched'], 'true', 'an existing-but-unhatched save shows the box')
  assert.equal(findByClass(host, 'dp-poke-hint').hidden, false, 'with its hint')

  poke()
  assert.equal(host.attributes['data-poke'], '1', 'the first poke registers')
  assert.equal(
    findByClass(host, 'dp-bubble').allText().includes('好舒服'),
    false,
    'and it must NOT be treated as a pat on the head',
  )

  poke()
  poke()
  const hatches = net.calls.filter(c => c.method === 'POST' && String(c.body).includes('hatch'))
  assert.equal(hatches.length, 1, 'the third poke hatches it')
})

test('a new box takes three pokes to open, not one', async () => {
  const { registration, dom, net } = await loadClient({
    status: { ok: true, pig: null, hatched: false, dead: false, pending: [] },
  })
  registration.factory(() => {}).apply({})
  await settle()

  const host = hostOf(dom)
  const scene = sceneOf(dom)
  const poke = () => { scene.fire('pointerdown', { button: 0, clientX: 0, clientY: 0 }); scene.fire('pointerup', {}) }

  assert.equal(host.attributes['data-unhatched'], 'true', 'the box announces itself')
  assert.equal(findByClass(host, 'dp-poke-hint').hidden, false, 'and shows a hint')

  poke()
  assert.equal(findByClass(host, 'dp-bubble').allText().includes('里面好像有东西'), true, 'first poke hints')
  assert.equal(host.attributes['data-poke'], '1')

  poke()
  assert.equal(findByClass(host, 'dp-bubble').allText().includes('再戳一下'), true, 'second poke teases')
  assert.equal(host.attributes['data-poke'], '2')

  poke()
  // The third one opens it, which means the host is asked to hatch.
  const posts = net.calls.filter(c => c.method === 'POST' && String(c.body).includes('hatch'))
  assert.equal(posts.length, 1, 'the third poke is the one that hatches')
  assert.equal(host.attributes['data-poke'], undefined, 'and the poke counter is cleared')
})

test('a graveside pig can be replaced at once, soul or no soul', async () => {
  for (const soul of [false, true]) {
    const { registration, dom } = await loadClient({
      status: {
        ...SNAPSHOT,
        dead: true,
        pig: { ...PIG, stage: { key: 'grave', label: '墓碑', emoji: '🪦', size: 52 }, soul, health: 0 },
      },
    })
    registration.factory(() => {}).apply({})
    await settle()
    openPanel(dom)
    const adopt = findByAttr(contentOf(dom), 'data-action', 'adopt')
    assert.notEqual(adopt, undefined, `adopt must be offered (soul=${soul})`)
    assert.ok(adopt.allText().includes('领养新猪'))
  }
})

test('a sick pig with no money is told it can still go out and earn', async () => {
  const broke = await loadClient({
    status: {
      ...SNAPSHOT,
      canGoOut: true,
      shop: [{ key: 'med1', label: '普通药', emoji: '💊', price: 12, kind: 'medicine', affordable: true }],
      pig: { ...PIG, coins: 3, illness: { name: '感冒', cure: '板蓝根', stage: 1 } },
    },
  })
  broke.registration.factory(() => {}).apply({})
  await settle()
  openPanel(broke.dom)
  const text = contentOf(broke.dom).allText()
  assert.ok(text.includes('带病也能出门'), `the way out must be spelled out: ${text}`)
  assert.ok(text.includes('12'), `and how much it needs: ${text}`)

  // With enough money there is no need for the hint.
  const rich = await loadClient({
    status: {
      ...SNAPSHOT,
      canGoOut: true,
      shop: [{ key: 'med1', label: '普通药', emoji: '💊', price: 12, kind: 'medicine', affordable: true }],
      pig: { ...PIG, coins: 900, illness: { name: '感冒', cure: '板蓝根', stage: 1 } },
    },
  })
  rich.registration.factory(() => {}).apply({})
  await settle()
  openPanel(rich.dom)
  assert.ok(!contentOf(rich.dom).allText().includes('先去打工'))
})

test('a dead pig shows the revive banner and greys out', async () => {
  const { registration, dom } = await loadClient({
    status: { ...SNAPSHOT, dead: true, pig: { ...PIG, health: 0, healthPercent: 0, mood: 'dead' } },
  })
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)
  const text = contentOf(dom).allText()
  assert.ok(text.includes('走了'), text)
  assert.ok(text.includes('还魂丹'), text)
  assert.equal(hostOf(dom).attributes['data-dead'], 'true')
  for (const key of ['feed', 'bathe', 'play']) {
    assert.equal(findByAttr(contentOf(dom), 'data-action', key).disabled, true)
  }
})

test('an unhatched pig offers a hatch button instead of a command', async () => {
  const { registration, dom, net } = await loadClient({
    status: { ok: true, hatched: false, dead: false, pig: null, actions: ACTIONS, jobs: [], subjects: [], stages: STAGES, trips: [], shop: [], inventory: {}, activity: null, canGoOut: false, awayBlocked: 'absent', pending: [], maxHealth: 5 },
    actResult: { ...SNAPSHOT, ok: true },
  })
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)

  const hatch = findByAttr(contentOf(dom), 'data-action', 'hatch')
  assert.notEqual(hatch, undefined, 'the empty panel must offer hatching without typing')
  assert.ok(hatch.allText().includes('拆开纸盒'), hatch.allText())

  hatch.fire('click')
  await settle()
  await settle()
  const post = net.calls.find(call => call.method === 'POST')
  assert.deepEqual(JSON.parse(post.body), { action: 'hatch' })
})

// ===========================================================================
// Announcements and failures
// ===========================================================================

test('queued host announcements surface as toasts', async () => {
  const { registration, dom } = await loadClient({
    status: { ...SNAPSHOT, pending: [{ kind: 'trip', text: '大花 从看海回来了，带回「贝壳」🧳', at: 111 }] },
  })
  registration.factory(() => {}).apply({})
  await settle()
  const toast = findByClass(hostOf(dom), 'dp-toast')
  assert.notEqual(toast, undefined, 'a toast should be mounted')
  assert.ok(toast.allText().includes('看海'), toast.allText())
})

test('a refused operation explains itself in the bubble', async () => {
  const { registration, dom } = await loadClient({
    actResult: { ...SNAPSHOT, ok: false, reason: 'poor', price: 400 },
  })
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)
  pickTab(dom, 'work')
  findByAttr(contentOf(dom), 'data-job', 'odd').fire('click')
  await settle()
  await settle()
  const bubble = findByClass(hostOf(dom), 'dp-bubble')
  assert.notEqual(bubble, undefined)
  assert.ok(bubble.allText().includes('钱不够'), bubble.allText())
})

test('a drawn stage shows a sprite, the others show the emoji', async () => {
  const drawn = await loadClient({
    status: {
      ...SNAPSHOT,
      pig: { ...PIG, mood: 'fine', stage: { key: 'piglet', label: '小猪', emoji: '🐖', size: 40, art: 'stage-piglet' } },
    },
  })
  drawn.registration.factory(() => {}).apply({})
  await settle()
  const img = findByClass(hostOf(drawn.dom), 'dp-pig-img')
  const emoji = findByClass(hostOf(drawn.dom), 'dp-pig-emoji')
  assert.notEqual(img, undefined, 'the sprite element must exist')
  assert.equal(img.hidden, false, 'the sprite is shown')
  assert.equal(img.src, '/dsh-pig/art/stage-piglet.svg', 'the sprite points at the plugin art route')
  assert.equal(emoji.hidden, true, 'and the emoji is hidden')

  const plain = await loadClient()
  plain.registration.factory(() => {}).apply({})
  await settle()
  const img2 = findByClass(hostOf(plain.dom), 'dp-pig-img')
  const emoji2 = findByClass(hostOf(plain.dom), 'dp-pig-emoji')
  assert.equal(img2.hidden, true, 'a stage with no art keeps the emoji')
  assert.ok(!img2.src, 'and no sprite is requested at all')
  assert.equal(emoji2.hidden, false)
})

test('a drawn pig wears its mood pose; fine and grave keep the stage drawing', async () => {
  const stage = { key: 'young', label: '青年猪', emoji: '🐖', size: 48, art: 'stage-young' }
  const hungry = await loadClient({ status: { ...SNAPSHOT, pig: { ...PIG, stage, mood: 'hungry', moodLevel: 3 } } })
  hungry.registration.factory(() => {}).apply({})
  await settle()
  const img = findByClass(hostOf(hungry.dom), 'dp-pig-img')
  assert.equal(img.src, '/dsh-pig/art/mood-hungry-3.svg', 'a starving pig looks starving')

  const oldHost = await loadClient({ status: { ...SNAPSHOT, pig: { ...PIG, stage, mood: 'sick' } } })
  oldHost.registration.factory(() => {}).apply({})
  await settle()
  assert.equal(findByClass(hostOf(oldHost.dom), 'dp-pig-img').src, '/dsh-pig/art/mood-sick-2.svg', 'no level from the host: the middle one')

  const fine = await loadClient({ status: { ...SNAPSHOT, pig: { ...PIG, stage, mood: 'fine' } } })
  fine.registration.factory(() => {}).apply({})
  await settle()
  assert.equal(findByClass(hostOf(fine.dom), 'dp-pig-img').src, '/dsh-pig/art/stage-young.svg', 'fine keeps the stage drawing')

  const career = await loadClient({ status: { ...SNAPSHOT,
    jobs: [{ key: 'vtuber', label: 'VTuber', emoji: '🎙️', tier: 'pro', art: 'vtuber' }],
    activity: { kind: 'work', key: 'vtuber', label: 'VTuber', emoji: '🎙️', secondsLeft: 60, progress: 10 },
    pig: { ...PIG, stage, mood: 'working' } } })
  career.registration.factory(() => {}).apply({})
  await settle()
  assert.equal(findByClass(hostOf(career.dom), 'dp-pig-img').src, '/dsh-pig/art/job-vtuber.svg', 'a career has its own pose')

  const grave = await loadClient({ status: { ...SNAPSHOT, pig: { ...PIG, stage: { key: 'grave', label: '墓碑', emoji: '🪦', size: 52, art: 'stage-grave' }, mood: 'dead' } } })
  grave.registration.factory(() => {}).apply({})
  await settle()
  assert.equal(findByClass(hostOf(grave.dom), 'dp-pig-img').src, '/dsh-pig/art/stage-grave.svg', 'a grave stays a grave')
})

// [ST0001] every job, school stage and trip region has a pose. [ST0004] What the
// pig wears rides along on every pose's URL, so the art route can dress it.
test('away poses follow the job, the school stage and the destination; the outfit goes along', async () => {
  const young = { key: 'young', label: '青年猪', emoji: '🐖', size: 48, art: 'stage-young' }
  const piglet = { key: 'piglet', label: '小猪', emoji: '🐖', size: 40, art: 'stage-piglet' }
  const elder = { key: 'elder', label: '老年猪', emoji: '🐖', size: 56, art: 'stage-elder' }
  const srcFor = async (status) => {
    const client = await loadClient({ status: { ...SNAPSHOT, ...status } })
    client.registration.factory(() => {}).apply({})
    await settle()
    return findByClass(hostOf(client.dom), 'dp-pig-img').src
  }
  const away = (kind, key, extra) => ({ kind, key, label: key, emoji: '🐖', secondsLeft: 60, progress: 10, ...extra })

  assert.equal(await srcFor({ jobs: [{ key: 'tea', label: '奶茶店员', emoji: '🧋', art: 'tea' }],
    activity: away('work', 'tea'), pig: { ...PIG, stage: young, mood: 'working' } }), '/dsh-pig/art/job-tea.svg', 'an everyday job has its own pose')
  assert.equal(await srcFor({ activity: away('study', 'math', { stage: 'doctor' }), pig: { ...PIG, stage: young, mood: 'studying' } }),
    '/dsh-pig/art/study-doctor.svg', 'a doctorate looks like a doctorate')
  assert.equal(await srcFor({ activity: away('study', 'math'), pig: { ...PIG, stage: young, mood: 'studying' } }),
    '/dsh-pig/art/away-study.svg', 'no stage from the host: the generic desk')
  assert.equal(await srcFor({ activity: away('trip', 'shanghai', { region: 'china' }), pig: { ...PIG, stage: young, mood: 'traveling' } }),
    '/dsh-pig/art/away-trip-shanghai.svg', 'a trip shows its destination')
  assert.equal(await srcFor({ activity: away('trip', 'atlantis', { region: 'europe' }), pig: { ...PIG, stage: young, mood: 'traveling' } }),
    '/dsh-pig/art/away-trip-europe.svg', 'a destination without its own drawing shows its region')
  assert.equal(await srcFor({ activity: away('trip', 'constructor', { region: 'toString' }), pig: { ...PIG, stage: young, mood: 'traveling' } }),
    '/dsh-pig/art/away-trip.svg', 'prototype names are not destinations or regions')
  assert.equal(await srcFor({ activity: away('trip', 'mars', { region: 'mars' }), pig: { ...PIG, stage: young, mood: 'traveling' } }),
    '/dsh-pig/art/away-trip.svg', 'an unknown region falls back to the plain road')

  const wearing = (...worn) => ({ auto: false, worn })
  assert.equal(await srcFor({ pig: { ...PIG, stage: piglet, mood: 'hungry', moodLevel: 1, outfit: wearing('bow') } }),
    '/dsh-pig/art/mood-hungry-1.svg?wear=bow', 'a piglet keeps its bow')
  assert.equal(await srcFor({ activity: away('trip', 'paris', { region: 'europe' }), pig: { ...PIG, stage: elder, mood: 'traveling', outfit: wearing('whiskers', 'glasses') } }),
    '/dsh-pig/art/away-trip-paris.svg?wear=whiskers,glasses', 'an old pig keeps its beard and glasses on the road')
  assert.equal(await srcFor({ pig: { ...PIG, stage: elder, mood: 'happy', outfit: wearing() } }),
    '/dsh-pig/art/mood-happy.svg', 'nothing worn: the plain pose')
  assert.equal(await srcFor({ pig: { ...PIG, stage: piglet, mood: 'fine', outfit: wearing('bow') } }), '/dsh-pig/art/stage-piglet.svg?wear=bow', 'fine still shows the stage itself')
  assert.equal(await srcFor({ pig: { ...PIG, stage: piglet, mood: 'fine', outfit: wearing('bow', '../x', 'a,b') } }),
    '/dsh-pig/art/stage-piglet.svg?wear=bow', 'only plain keys reach the URL')
  assert.equal(await srcFor({ pig: { ...PIG, stage: piglet, mood: 'fine' } }), '/dsh-pig/art/stage-piglet.svg', 'an older host: nothing worn')
})

test('graduating as a doctor plays the graduation pose in the outfit', async () => {
  const stage = { key: 'middle', label: '中年猪', emoji: '🐖', size: 62, art: 'stage-middle' }
  const { registration, dom } = await loadClient({
    status: { ...SNAPSHOT, pig: { ...PIG, stage, mood: 'fine', outfit: { auto: true, worn: ['flatcap'] } }, pending: [{ kind: 'doctor', text: '猪猪 博士毕业了！🎓', at: 222 }] },
  })
  const later = []
  window.setTimeout = fn => { later.push(fn); return later.length }
  registration.factory(() => {}).apply({})
  await settle()
  const img = () => findByClass(hostOf(dom), 'dp-pig-img')
  assert.equal(img().src, '/dsh-pig/art/react-graduate.svg?wear=flatcap', 'cap tossed; the pose itself keeps the flat cap off')
  for (const fn of later.splice(0)) fn()
  assert.equal(img().src, '/dsh-pig/art/stage-middle.svg?wear=flatcap', 'then back to the stage drawing')
})

test('any diploma is a graduation too', async () => {
  const stage = { key: 'young', label: '青年猪', emoji: '🐖', size: 48, art: 'stage-young' }
  const { registration, dom } = await loadClient({
    status: { ...SNAPSHOT, pig: { ...PIG, stage, mood: 'fine' }, pending: [{ kind: 'diploma', text: '猪猪 毕业了，拿到小学毕业证 📃', at: 333 }] },
  })
  window.setTimeout = () => 0
  registration.factory(() => {}).apply({})
  await settle()
  assert.equal(findByClass(hostOf(dom), 'dp-pig-img').src, '/dsh-pig/art/react-graduate.svg')
})

test('being away shows what the pig is doing and how far along it is', async () => {
  const cases = [
    ['work', 'working', '💻'],
    ['study', 'studying', '📖'],
    ['trip', 'traveling', '🌊'],
  ]
  for (const [kind, mood, emoji] of cases) {
    const { registration, dom } = await loadClient({
      status: {
        ...SNAPSHOT,
        pig: { ...PIG, mood },
        canGoOut: false,
        activity: { kind, key: 'x', label: '出门', emoji, secondsLeft: 900, progress: 42 },
      },
    })
    registration.factory(() => {}).apply({})
    await settle()

    const host = hostOf(dom)
    assert.equal(host.attributes['data-away'], kind, `${kind}: the host must announce the activity`)
    const work = findByClass(host, 'dp-work')
    assert.notEqual(work, undefined, `${kind}: a work block must exist`)
    assert.equal(work.hidden, false, `${kind}: it must be visible while away`)
    assert.equal(findByClass(host, 'dp-prop').textContent, emoji, `${kind}: the prop emoji`)
    assert.equal(findByClass(host, 'dp-progress').children[0].style.width, '42%', `${kind}: progress`)
    // The pig carries the pose the stylesheet keys its animation off.
    assert.notEqual(findByAttr(host, 'data-mood', mood), undefined, `${kind}: the pig needs the ${mood} pose`)
  }
})

test('coming home hides the work block again', async () => {
  const { registration, dom } = await loadClient({
    status: { ...SNAPSHOT, canGoOut: false, activity: { kind: 'work', key: 'x', label: '上班', emoji: '💻', secondsLeft: 60, progress: 10 } },
  })
  registration.factory(() => {}).apply({})
  await settle()
  assert.equal(hostOf(dom).attributes['data-away'], 'work')
  assert.equal(findByClass(hostOf(dom), 'dp-work').hidden, false)
})

test('an empty shelf is explained in the pig\'s own words', async () => {
  const cases = [
    ['feed', 'food', '没有吃的啦，快去买一点'],
    ['bathe', 'bath', '没有洗浴用品了'],
    ['play', 'toy', '没有玩具了'],
  ]
  for (const [action, kind, expected] of cases) {
    const { registration, dom } = await loadClient({
      // No items on this shelf, so the host refuses with `no-item`.
      status: { ...SNAPSHOT, care: { feed: [], bathe: [], play: [] } },
      actResult: { ...SNAPSHOT, ok: false, reason: 'no-item', kind },
    })
    registration.factory(() => {}).apply({})
    await settle()
    openPanel(dom)
    findByAttr(contentOf(dom), 'data-action', action).fire('click')
    await settle()
    await settle()
    const bubble = findByClass(hostOf(dom), 'dp-bubble')
    assert.notEqual(bubble, undefined, `${action}: the pig should say something`)
    assert.ok(
      bubble.allText().includes(expected),
      `${action}: expected "${expected}", got "${bubble.allText()}"`,
    )
  }
})

test('a failing host route degrades instead of throwing', async () => {
  const { registration, dom } = await loadClient()
  globalThis.fetch = async () => { throw new Error('ECONNREFUSED') }
  registration.factory(() => {}).apply({})
  await settle()
  await settle()
  assert.ok(findByClass(hostOf(dom), 'dp-bubble').allText().includes('连接不上宿主'))
})

test('apply survives a shell with no body yet', async () => {
  const { registration, dom } = await loadClient()
  let deferred = null
  dom.document.body = null
  dom.document.addEventListener = (name, fn) => { if (name === 'DOMContentLoaded') deferred = fn }
  let dispose
  assert.doesNotThrow(() => { dispose = registration.factory(() => {}).apply({}) })
  assert.equal(typeof dispose, 'function')
  assert.equal(typeof deferred, 'function')
  assert.doesNotThrow(() => deferred())
})

test('apply never throws, even against a hostile DOM', async () => {
  const { registration } = await loadClient()
  globalThis.document = {
    head: { appendChild() {} },
    body: { appendChild() {} },
    createElement() { throw new Error('CSP says no') },
    querySelector() { return null },
    addEventListener() {},
    removeEventListener() {},
  }
  let dispose
  assert.doesNotThrow(() => { dispose = registration.factory(() => {}).apply({}) })
  assert.equal(typeof dispose, 'function')
  assert.doesNotThrow(() => dispose())
})

test('dispose removes the floating pig', async () => {
  const { registration, dom } = await loadClient()
  const dispose = registration.factory(() => {}).apply({})
  assert.equal(dom.body.children.length, 1)
  dispose()
  assert.equal(dom.body.children.length, 0)
})

/**
 * Regression: the widget is anchored at right:18px/bottom:18px, which is exactly
 * where the harness parks its composer and its send button. With `pointer-events`
 * left at its default the wrapper swallowed those clicks — the message never left
 * the browser while the model, the server and the network were all healthy, and
 * the only visible symptom was "sending a message does nothing". A fake DOM has
 * no layout and no hit-testing, so both guarantees are checked statically.
 */
test('the widget lets clicks through without steering the user', async () => {
  const source = await readSource()
  const css = await readCss()
  assert.match(css, /\[data-dsh-pig\]\{[^}]*pointer-events:none/, 'the wrapper must not take clicks')
  assert.match(css, /\[data-dsh-pig\]>\*\{pointer-events:auto\}/, 'the pig and the panel must still take clicks')

  // A composer-avoidance floor used to force the widget above the input box,
  // because the wrapper was swallowing clicks aimed at the send button.
  // `pointer-events` fixes that properly, and the floor only ever stopped the
  // user from parking their pet where they wanted it — including beside the
  // composer, which is where a desktop pet belongs.
  assert.doesNotMatch(source, /contenteditable="true"/, 'the composer floor must be gone')
  assert.doesNotMatch(source, /Math\.max\(userBottom, floor\)/, 'placement is the user\'s choice')

  // What remains is only "keep the widget on screen".
  assert.match(source, /function clampPig\(\)/, 'the pig is still kept on screen')
  assert.match(source, /function fitPanel\(\)/, 'the panel is fitted to the window')
  assert.match(source, /addEventListener\?\.\('resize', onResize\)/, 'both follow viewport changes')
  assert.match(source, /removeEventListener\?\.\('resize', onResize\)/, 'and both are released on dispose')
})

test('the pig is clamped to the window but never pushed around', async () => {
  const { registration, dom } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()

  const host = hostOf(dom)
  const scene = sceneOf(dom)
  const pigEl = findByClass(scene, 'dp-pig')
  scene.rect = { x: 0, y: 0, top: 700, left: 1200, right: 1260, bottom: 768, width: 60, height: 68 }
  // The horizontal bound is the pig itself, not the scene: the scene widens to
  // the panel when open, and clamping against that would shove the pig sideways
  // on any window resize.
  pigEl.rect = { x: 0, y: 0, top: 712, left: 1200, right: 1260, bottom: 768, width: 60, height: 56 }

  const dragBy = (dx, dy) => {
    scene.fire('pointerdown', { button: 0, clientX: 0, clientY: 0 })
    scene.fire('pointermove', { clientX: dx, clientY: dy })
    scene.fire('pointerup', {})
  }

  // Dragged far past the top-left: pulled back just far enough to stay visible.
  // The horizontal footprint is the glyph plus the scene's 6px side padding.
  dragBy(-1200, -1200)
  assert.equal(parseFloat(host.style.right), 1280 - (60 + 12) - 4, 'right is clamped to leave the pig on screen')
  // The vertical reserve is the OPEN scene (132), not the collapsed box (68):
  // clamping by the collapsed height let the pig be parked so high that opening
  // its own panel pushed the hud off the top of the window.
  assert.equal(parseFloat(host.style.bottom), 800 - 132 - 4, 'bottom reserves the open scene')

  // Anywhere inside the window is the user's business — including the corner
  // beside the composer, which is the whole point of dropping the old floor.
  const before = parseFloat(host.style.right)
  dragBy(400, 400)
  const parked = { right: parseFloat(host.style.right), bottom: parseFloat(host.style.bottom) }
  assert.equal(parked.right, before - 400, 'a legal horizontal move is kept exactly')
  assert.equal(parked.bottom, 800 - 132 - 4 - 400, 'and so is a legal vertical one')
  assert.ok(parked.bottom < 800 - 132 - 4, 'it really did move lower')

  // Coming back to rest changes nothing.
  dragBy(0, 0)
  assert.equal(parseFloat(host.style.right), parked.right)
  assert.equal(parseFloat(host.style.bottom), parked.bottom)
})

test('a desktop shell can place the pig inside its window, clamped and remembered', async () => {
  const { registration, dom, store } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()

  const host = hostOf(dom)
  const scene = sceneOf(dom)
  scene.rect = { x: 0, y: 0, top: 700, left: 1200, right: 1260, bottom: 768, width: 60, height: 68 }
  findByClass(scene, 'dp-pig').rect = { x: 0, y: 0, top: 712, left: 1200, right: 1260, bottom: 768, width: 60, height: 56 }

  // The window stopped at the top of the screen; the pig goes on up inside it.
  host.fire('dsh-pig:place', { detail: { right: 18, bottom: 500 } })
  assert.equal(parseFloat(host.style.bottom), 500)
  assert.deepEqual(JSON.parse(store.get('dsh-pig:position')), { right: 18, bottom: 500 })

  // Past the window's edge it is clamped like any drag.
  host.fire('dsh-pig:place', { detail: { right: 18, bottom: 5000 } })
  assert.equal(parseFloat(host.style.bottom), 800 - 132 - 4)

  // Junk from the host leaves the pig where it was.
  host.fire('dsh-pig:place', { detail: { right: 'x', bottom: null } })
  host.fire('dsh-pig:place', {})
  assert.equal(parseFloat(host.style.bottom), 800 - 132 - 4)
})

test('the panel uses one anchor at a time, never top and bottom together', async () => {
  const { registration, dom, resize } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()
  const card = cardOf(dom)
  const scene = sceneOf(dom)

  // Plenty of room above: the panel hangs upward off the pig.
  scene.rect = { x: 0, y: 0, top: 500, left: 1100, right: 1180, bottom: 632, width: 80, height: 132 }
  openPanel(dom)
  assert.equal(card.style.top, 'auto', 'the top anchor must be released')
  assert.match(card.style.bottom, /100%/, 'and the bottom anchor used')

  // Parked near the top: it must flip rather than open off the screen.
  scene.rect = { x: 0, y: 0, top: 8, left: 1100, right: 1180, bottom: 140, width: 80, height: 132 }
  resize()
  assert.equal(card.style.bottom, 'auto', 'the bottom anchor must be released')
  assert.match(card.style.top, /100%/, 'and the panel flipped below the pig')

  // Regression: clearing an anchor with '' falls back to the stylesheet, so both
  // edges end up pinned and an absolutely positioned box collapses to nothing.
  assert.notEqual(card.style.top, '', 'the top anchor is always explicit')
  assert.notEqual(card.style.bottom, '', 'the bottom anchor is always explicit')
})

test('the JS scene reserve tracks the CSS token it stands in for', async () => {
  const source = await readSource()
  const css = await readCss()
  const fromCss = /--scene-open:\s*(\d+)px/.exec(css)
  const fromJs = /var SCENE_RESERVE = (\d+)/.exec(source)
  assert.ok(fromCss !== null, 'the CSS must declare --scene-open')
  assert.ok(fromJs !== null, 'the bundle must declare SCENE_RESERVE')
  assert.equal(fromJs[1], fromCss[1], 'SCENE_RESERVE must match --scene-open')
})

test('right-click opens the menu and left-click only pats the pig', async () => {
  const { registration, dom } = await loadClient()
  registration.factory(() => {}).apply({})
  await settle()

  const host = hostOf(dom)
  assert.equal(host.attributes['data-open'], 'false')

  // A left click is a pat: the panel stays shut.
  patPig(dom)
  assert.equal(host.attributes['data-open'], 'false', 'left click must not open the panel')
  assert.equal(findByClass(sceneOf(dom), 'dp-pig').attributes['data-react'], 'pet', 'but the pig reacts')

  // The menu is on the context menu.
  let prevented = false
  sceneOf(dom).fire('contextmenu', { preventDefault() { prevented = true } })
  assert.equal(prevented, true, 'the native context menu must be suppressed')
  assert.equal(host.attributes['data-open'], 'true')

  sceneOf(dom).fire('contextmenu', { preventDefault() {} })
  assert.equal(host.attributes['data-open'], 'false', 'and it toggles back')

  // The tooltip is the only discoverability right-click gets.
  assert.match(sceneOf(dom).title, /右键/, 'the pig must say how to open the menu')
})

// ===========================================================================
// [dsh-piggy-claude-code mod] Languages: zh · ja · en
// ===========================================================================

const LANGS = [{ key: 'zh', label: '中文' }, { key: 'ja', label: '日本語' }, { key: 'en', label: 'English' }]
const TAB_KEYS = ['status', 'study', 'work', 'shop', 'travel', 'bag']
// The fake DOM keeps children when `textContent = ''` clears a node, so after
// a re-render the freshest element is the last match, not the first.
const findLastByAttr = (root, attr, value) => {
  let last
  root.walk(node => { if (node.attributes?.[attr] === value) last = node })
  return last
}
const tabLabels = dom => TAB_KEYS.map(key => findByAttr(barOf(dom), 'data-tab', key).allText().replace(/\s+/g, ' ').trim())

/** The dictionary and translator the bundle exposes for tests. */
async function clientI18n() {
  const { registration } = await loadClient()
  const exports = registration.factory(() => {})
  return { I18N: exports.I18N, tr: exports.tr }
}

test('an English snapshot renders the tabs and the status bars in English', async () => {
  const { registration, dom } = await loadClient({ status: { ...SNAPSHOT, lang: 'en', langs: LANGS } })
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)

  assert.deepEqual(tabLabels(dom), ['📋 Status', '📚 Study', '💼 Work', '🛒 Shop', '🧳 Travel', '🎒 Bag'])
  const text = contentOf(dom).allText()
  for (const label of ['Fullness', 'Mood', 'Cleanliness', 'Health', 'Smarts', 'Charm', 'Strength', 'Weight', 'Age', 'Feed', 'Bathe', 'Play', 'Pat']) {
    assert.ok(text.includes(label), `expected "${label}" in: ${text}`)
  }
  for (const zh of ['饱食', '心情', '清洁', '智力', '喂食']) {
    assert.ok(!text.includes(zh), `"${zh}" should be translated: ${text}`)
  }
  assert.equal(hostOf(dom).attributes.lang, 'en')
  assert.doesNotMatch(sceneOf(dom).title, /右键/, 'the tooltip follows the language too')
})

test('a Japanese snapshot renders the tabs and the status bars in Japanese', async () => {
  const { registration, dom } = await loadClient({ status: { ...SNAPSHOT, lang: 'ja', langs: LANGS } })
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)

  assert.deepEqual(tabLabels(dom), ['📋 ようす', '📚 勉強', '💼 バイト', '🛒 おみせ', '🧳 旅行', '🎒 バッグ'])
  const text = contentOf(dom).allText()
  for (const label of ['おなか', 'きげん', 'きれいさ', '健康', 'かしこさ', 'みりょく', 'ちから', '体重', '年齢', 'ごはん', 'おふろ', 'あそぶ', 'なでなで']) {
    assert.ok(text.includes(label), `expected "${label}" in: ${text}`)
  }
})

test('labels the host sent are shown as sent, never translated twice', async () => {
  const { registration, dom } = await loadClient({
    status: { ...SNAPSHOT, lang: 'en', langs: LANGS, pig: { ...PIG, stage: { ...PIG.stage, label: '小猪' } } },
  })
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)
  const text = contentOf(dom).allText()
  // '小猪' is a dictionary key, but here it came from the host, so it stays.
  assert.ok(text.includes('小猪'), text)
  pickTab(dom, 'work')
  assert.ok(contentOf(dom).allText().includes('打零工'), 'job names are the host\'s business')
})

test('durations and counts read naturally in each language', async () => {
  for (const [lang, expected] of [['zh', ['1 分钟', '已上 2 次']], ['ja', ['1分', 'じゅぎょう 2 回']], ['en', ['1 min', '2 lessons so far']]]) {
    const { registration, dom } = await loadClient({ status: { ...SNAPSHOT, lang, langs: LANGS } })
    registration.factory(() => {}).apply({})
    await settle()
    openPanel(dom)
    pickTab(dom, 'work')
    assert.ok(contentOf(dom).allText().includes(expected[0]), `${lang}: ${contentOf(dom).allText()}`)
    pickTab(dom, 'study')
    assert.ok(contentOf(dom).allText().includes(expected[1]), `${lang}: ${contentOf(dom).allText()}`)
  }
  const { tr } = await clientI18n()
  assert.equal(tr('en', '{n} 天', { n: 1 }), '1 day')
  assert.equal(tr('en', '{n} 天', { n: 3 }), '3 days')
  assert.equal(tr('ja', '{n} 天', { n: 3 }), '3日')
  assert.equal(tr('zh', '{n} 天', { n: 3 }), '3 天')
})

// [ST0004] the wardrobe: a bag shelf right of the consumables; worn things
// pressed, locked ones disabled, a click posts the change.
test('the wardrobe is a bag shelf beside the consumables and posts what to put on or take off', async () => {
  const item = (key, emoji, fields) => ({ key, slot: 'head', label: key, emoji, unlocked: true, worn: false, hint: '', ...fields })
  const wardrobe = [item('bow', '🎀', { worn: true }), item('flatcap', '🧢'), item('mortarboard', '🎓', { unlocked: false, hint: '拿到任意一张毕业证后解锁' })]
  const pig = { ...PIG, stage: { ...PIG.stage, art: 'stage-middle' }, mood: 'fine' }
  const { registration, dom, net } = await loadClient({
    status: { ...SNAPSHOT, pig: { ...pig, outfit: { auto: true, worn: ['bow'] }, wardrobe } },
    actResult: { ...SNAPSHOT, ok: true, pig: { ...pig, outfit: { auto: false, worn: ['flatcap'] }, wardrobe } },
  })
  const later = []
  window.setTimeout = fn => { later.push(fn); return later.length }
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)
  assert.equal(findByAttr(contentOf(dom), 'data-wear', 'bow'), undefined, 'not on the status tab')

  pickTab(dom, 'bag')
  const shelves = []
  const walk = node => {
    if (node.attributes?.['data-bag'] !== undefined) shelves.push(node.attributes['data-bag'])
    for (const child of node.children ?? []) walk(child)
  }
  walk(contentOf(dom))
  assert.deepEqual(shelves, ['items', 'wardrobe', 'travel', 'school'], 'right of the consumables')
  const shelf = findByAttr(contentOf(dom), 'data-bag', 'wardrobe')
  assert.ok(shelf.textContent.includes('👗 衣柜 2/3'), 'counts what is unlocked')
  assert.match(shelf.parentNode?.className ?? findByClass(contentOf(dom), 'dp-seg').className, /dp-seg-2/, 'four shelves, two by two')
  shelf.fire('click')
  assert.ok(contentOf(dom).allText().includes('🎀bow'), 'says what it is wearing')
  const bow = findByAttr(contentOf(dom), 'data-wear', 'bow')
  const cap = findByAttr(contentOf(dom), 'data-wear', 'flatcap')
  const board = findByAttr(contentOf(dom), 'data-wear', 'mortarboard')
  assert.equal(bow.attributes['aria-pressed'], 'true', 'worn')
  assert.equal(cap.attributes['aria-pressed'], 'false')
  assert.equal(board.attributes['data-locked'], 'true', 'locked')
  assert.equal(board.disabled, true)
  assert.match(board.attributes.title, /毕业证/, 'says how to earn it')
  assert.equal(findByAttr(contentOf(dom), 'data-wear-auto', 'true').attributes['aria-pressed'], 'true', 'following the stage')

  cap.fire('click')
  await settle()
  await settle()
  const post = net.calls.find(call => call.method === 'POST')
  assert.deepEqual(JSON.parse(post.body), { action: 'wear', item: 'flatcap', on: true })
  for (const fn of later.splice(0)) fn()
  assert.equal(findByClass(hostOf(dom), 'dp-pig-img').src, '/dsh-pig/art/stage-middle.svg?wear=flatcap', 'the pig is the preview')
})

// [ST0012] one section per slot, head to toe; an unknown slot goes last.
test('the wardrobe groups decorations by slot, head to toe', async () => {
  const item = (key, slot, emoji) => ({ key, slot, label: key, emoji, unlocked: true, worn: false, hint: '' })
  const wardrobe = [item('whiskers', 'face', '🧓'), item('scarf', 'waist', '🧣'), item('bow', 'head', '🎀'), item('glasses', 'eyes', '👓'),
    item('pager', 'waist', '📟'), item('cape', 'back', '🦸'), item('flatcap', 'head', '🧢')]
  for (const [lang, waist] of [['zh', '🎗️ 腰上'], ['en', '🎗️ Waist']]) {
    const { dom } = await loadWithPoll({ status: { ...SNAPSHOT, lang, langs: LANGS, pig: { ...PIG, outfit: { auto: false, worn: [] }, wardrobe } }, storage: { 'dsh-pig:bag': 'wardrobe' } })
    openPanel(dom)
    pickTab(dom, 'bag')
    const sections = []
    const walk = node => {
      if (node.attributes?.['data-wear-slot'] !== undefined && /dp-wear/.test(node.className ?? '')) {
        const keys = []
        const pills = child => { if (child.attributes?.['data-wear'] !== undefined) keys.push(child.attributes['data-wear']); for (const c of child.children ?? []) pills(c) }
        pills(node)
        sections.push([node.attributes['data-wear-slot'], keys])
      }
      for (const child of node.children ?? []) walk(child)
    }
    walk(contentOf(dom))
    assert.deepEqual(sections, [['head', ['bow', 'flatcap']], ['eyes', ['glasses']], ['waist', ['scarf', 'pager']], ['face', ['whiskers']], ['back', ['cape']]], lang)
    assert.ok(contentOf(dom).allText().includes(waist), `${lang}: ${contentOf(dom).allText()}`)
  }
})

test('the language switcher sits on the status tab and posts the choice', async () => {
  const { registration, dom, net } = await loadClient({
    status: { ...SNAPSHOT, lang: 'zh', langs: LANGS },
    actResult: { ...SNAPSHOT, ok: true, lang: 'ja', langs: LANGS },
  })
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)

  const text = contentOf(dom).allText()
  assert.ok(text.includes('🌐 语言'), text)
  const zh = findByAttr(contentOf(dom), 'data-lang', 'zh')
  const ja = findByAttr(contentOf(dom), 'data-lang', 'ja')
  const en = findByAttr(contentOf(dom), 'data-lang', 'en')
  assert.ok(zh && ja && en, 'one button per language')
  assert.equal(zh.attributes['aria-pressed'], 'true')
  assert.equal(ja.attributes['aria-pressed'], 'false')
  // Each language is named in its own language.
  assert.equal(ja.allText().trim(), '日本語')
  assert.equal(en.allText().trim(), 'English')
  assert.match(findByClass(contentOf(dom), 'dp-langs').className, /dp-actions/)

  ja.fire('click')
  await settle()
  await settle()
  const post = net.calls.find(call => call.method === 'POST')
  assert.deepEqual(JSON.parse(post.body), { action: 'lang', lang: 'ja' })

  // The reply is rendered straight away: no reload, the whole panel switches.
  assert.equal(tabLabels(dom)[0], '📋 ようす')
  assert.ok(contentOf(dom).allText().includes('🌐 言語'), contentOf(dom).allText())
  assert.equal(findLastByAttr(contentOf(dom), 'data-lang', 'ja').attributes['aria-pressed'], 'true')
  assert.equal(findLastByAttr(contentOf(dom), 'data-lang', 'zh').attributes['aria-pressed'], 'false')
})

test('the language can be switched while the pig is still a box', async () => {
  const box = { ok: true, hatched: false, dead: false, pig: null, pending: [], lang: 'zh', langs: LANGS }
  const { registration, dom, net } = await loadClient({ status: box, actResult: { ...box, lang: 'ja' } })
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)

  assert.notEqual(findByAttr(contentOf(dom), 'data-action', 'hatch'), undefined)
  const ja = findByAttr(contentOf(dom), 'data-lang', 'ja')
  assert.notEqual(ja, undefined, 'the switcher is there before hatching')
  ja.fire('click')
  await settle()
  await settle()
  const post = net.calls.find(call => call.method === 'POST')
  assert.deepEqual(JSON.parse(post.body), { action: 'lang', lang: 'ja' })
  assert.ok(findLastByAttr(contentOf(dom), 'data-action', 'hatch').allText().includes('箱をあける'))
})

test('a host that sends no language list still offers all three', async () => {
  const { registration, dom } = await loadClient({ status: { ...SNAPSHOT, lang: 'klingon', langs: 'nope' } })
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)
  // An unknown language falls back to Chinese, like the host's normalizeLang.
  assert.equal(tabLabels(dom)[0], '📋 状态')
  for (const key of ['zh', 'ja', 'en']) {
    assert.notEqual(findByAttr(contentOf(dom), 'data-lang', key), undefined, key)
  }
})

test('every Japanese key has an English twin and vice versa', async () => {
  const { I18N } = await clientI18n()
  const ja = Object.keys(I18N.ja).sort()
  const en = Object.keys(I18N.en).sort()
  assert.ok(ja.length > 100, `expected a real dictionary, got ${ja.length}`)
  assert.deepEqual(ja.filter(key => !(key in I18N.en)), [], 'in ja but not en')
  assert.deepEqual(en.filter(key => !(key in I18N.ja)), [], 'in en but not ja')
  // Placeholders must survive translation, or a value silently disappears.
  const holes = text => (text.match(/\{\w+\}/g) ?? []).sort().join()
  for (const key of ja) {
    assert.equal(holes(I18N.ja[key]), holes(key), `ja placeholders for "${key}"`)
    assert.equal(holes(I18N.en[key]), holes(key), `en placeholders for "${key}"`)
  }
})

test('every string the bundle translates has a translation', async () => {
  const { I18N } = await clientI18n()
  const source = await readSource()
  const used = [...source.matchAll(/\b[TL]\('((?:[^'\\]|\\.)+)'/g)].map(m => m[1])
  assert.ok(used.length > 50, `expected many T() calls, got ${used.length}`)
  const missing = [...new Set(used)].filter(key => !(key in I18N.ja) || !(key in I18N.en))
  assert.deepEqual(missing, [], 'T() keys missing from the dictionary')
})

// ===========================================================================
// [dsh-piggy-claude-code mod] Naming, the travel world, the bag, multi-lesson study
// ===========================================================================

/** Load with the poll captured, so a test can fire a re-render on demand. */
async function loadWithPoll(options) {
  const loaded = await loadClient(options)
  let poll = null
  globalThis.window.setInterval = fn => { poll = fn; return 1 }
  loaded.registration.factory(() => {}).apply({})
  await settle()
  return { ...loaded, poll: async () => { await poll(); await settle() } }
}

const countByAttr = (root, attr, value) => {
  let n = 0
  root.walk(node => { if (node.attributes?.[attr] === value) n += 1 })
  return n
}

const postsOf = net => net.calls.filter(call => call.method === 'POST').map(call => JSON.parse(call.body))

test('a pig with a default name is renamed for free from the status tab', async () => {
  const status = { ...SNAPSHOT, pig: { ...PIG, name: '猪猪', renameFree: true, renameCards: 0, renameCardPrice: 1000 } }
  const { dom, net } = await loadWithPoll({ status, actResult: { ...status, pig: { ...status.pig, name: '小花', renameFree: false } } })
  openPanel(dom)

  const row = findByClass(contentOf(dom), 'dp-name')
  assert.ok(row.allText().includes('猪猪'), row.allText())
  findByAttr(contentOf(dom), 'data-rename', 'open').fire('click')

  const text = contentOf(dom).allText()
  assert.ok(text.includes('起个名字 · 免费'), text)
  const input = findLastByAttr(contentOf(dom), 'data-rename', 'input')
  assert.notEqual(input, undefined, 'the free path offers the field')
  assert.equal(input.maxLength, 16)
  assert.equal(input.value, '', 'a default name is not pre-filled')
  assert.equal(dom.document.activeElement, input, 'and the field is focused')

  input.value = '小花'
  input.fire('input')
  input.fire('keydown', { key: 'Enter' })
  await settle()
  await settle()
  assert.deepEqual(postsOf(net), [{ action: 'rename', name: '小花' }])
  assert.ok(findLastByAttr(contentOf(dom), 'data-rename', 'open').attributes['aria-expanded'] === 'false', 'the field closes after sending')
})

test('Enter while an IME is composing does not submit, and Escape cancels', async () => {
  const status = { ...SNAPSHOT, pig: { ...PIG, renameFree: true } }
  const { dom, net } = await loadWithPoll({ status })
  openPanel(dom)
  findByAttr(contentOf(dom), 'data-rename', 'open').fire('click')
  const input = findLastByAttr(contentOf(dom), 'data-rename', 'input')
  input.value = 'はな'
  input.fire('input')
  input.fire('keydown', { key: 'Enter', isComposing: true })
  await settle()
  assert.deepEqual(postsOf(net), [], 'confirming a kana candidate is not a submit')
  input.fire('keydown', { key: 'Escape' })
  assert.equal(findLastByAttr(contentOf(dom), 'data-rename', 'open').attributes['aria-expanded'], 'false')
  assert.deepEqual(postsOf(net), [])
})

test('renaming a named pig spends a card and says how many are left', async () => {
  const status = { ...SNAPSHOT, pig: { ...PIG, renameFree: false, renameCards: 2, renameCardPrice: 1000 } }
  const { dom, net } = await loadWithPoll({ status })
  openPanel(dom)
  findByAttr(contentOf(dom), 'data-rename', 'open').fire('click')
  const text = contentOf(dom).allText()
  assert.ok(text.includes('改名会用掉 1 张 🪪（还有 2 张）'), text)
  const input = findLastByAttr(contentOf(dom), 'data-rename', 'input')
  assert.equal(input.value, '大花', 'the current name is the starting point')
  input.value = '二花'
  input.fire('input')
  findLastByAttr(contentOf(dom), 'data-rename', 'ok').fire('click')
  await settle()
  await settle()
  assert.deepEqual(postsOf(net), [{ action: 'rename', name: '二花' }])
})

test('without a card the rename field points at the shop instead', async () => {
  const status = { ...SNAPSHOT, pig: { ...PIG, renameFree: false, renameCards: 0, renameCardPrice: 1000 } }
  const { dom, net } = await loadWithPoll({ status })
  openPanel(dom)
  findByAttr(contentOf(dom), 'data-rename', 'open').fire('click')
  const text = contentOf(dom).allText()
  assert.ok(text.includes('更名卡'), text)
  assert.ok(text.includes('1000 🪙'), text)
  assert.equal(findByAttr(contentOf(dom), 'data-rename', 'input'), undefined, 'no field that can only be refused')
  findLastByAttr(contentOf(dom), 'data-rename', 'shop').fire('click')
  assert.equal(findByAttr(barOf(dom), 'data-tab', 'shop').attributes['data-active'], 'true')
  assert.deepEqual(postsOf(net), [])
})

test('an older host that cannot rename shows no pencil', async () => {
  const { dom } = await loadWithPoll()
  openPanel(dom)
  assert.ok(findByClass(contentOf(dom), 'dp-name').allText().includes('大花'))
  assert.equal(findByAttr(contentOf(dom), 'data-rename', 'open'), undefined)
})

test('typing a name survives the poll re-rendering the panel', async () => {
  const status = { ...SNAPSHOT, pig: { ...PIG, renameFree: true } }
  const { dom, poll } = await loadWithPoll({ status })
  openPanel(dom)
  findByAttr(contentOf(dom), 'data-rename', 'open').fire('click')
  const input = findLastByAttr(contentOf(dom), 'data-rename', 'input')
  input.value = '小'
  input.fire('input')
  assert.equal(dom.document.activeElement, input)

  // While the field has focus, a poll leaves the content area alone.
  const before = countByAttr(contentOf(dom), 'data-rename', 'input')
  await poll()
  assert.equal(countByAttr(contentOf(dom), 'data-rename', 'input'), before, 'no rebuild while typing')
  assert.equal(input.value, '小')
  assert.equal(dom.document.activeElement, input)

  // A rebuild that does happen (here: after focus left) restores the draft.
  input.value = '小花'
  input.fire('input')
  dom.document.activeElement = null
  await poll()
  const rebuilt = findLastByAttr(contentOf(dom), 'data-rename', 'input')
  assert.notEqual(rebuilt, input, 'the content was rebuilt')
  assert.equal(rebuilt.value, '小花', 'with the draft intact')
})

test('rename refusals explain themselves and keep what was typed', async () => {
  const status = { ...SNAPSHOT, pig: { ...PIG, renameFree: false, renameCards: 1 } }
  for (const [reason, expected] of [['same-name', '和现在的名字一样'], ['need-card', '1000'], ['bad-name', '1–16']]) {
    const { dom } = await loadWithPoll({ status, actResult: { ...status, ok: false, reason, price: 1000 } })
    openPanel(dom)
    findByAttr(contentOf(dom), 'data-rename', 'open').fire('click')
    const input = findLastByAttr(contentOf(dom), 'data-rename', 'input')
    input.value = '大花2'
    input.fire('input')
    input.fire('keydown', { key: 'Enter' })
    await settle()
    await settle()
    const bubble = findByClass(hostOf(dom), 'dp-bubble').allText()
    assert.ok(bubble.includes(expected), `${reason}: ${bubble}`)
    assert.equal(findLastByAttr(contentOf(dom), 'data-rename', 'input').value, '大花2', `${reason}: the draft comes back`)
  }
})

const place = (key, label, emoji, cost, affordable, souvenirs) => ({
  key, label, emoji, utc: 8, zones: 1, cost, minutes: 120, happiness: 13, available: true, affordable, souvenirs,
})

const WORLD = {
  home: { utc: 9, zone: 'Asia/Tokyo', city: 'Tokyo' },
  regions: [
    {
      key: 'china', label: '中国', emoji: '🐉', have: 2, total: 6, done: false,
      reward: ['💪武力 +3', '⚖️体重 +5 kg'],
      perk: { key: 'foodie', label: '干饭王', emoji: '🍚', text: '吃东西长肉 +10%', active: false },
      places: [
        place('beijing', '北京', '🏯', 300, true, [
          { key: 'wallbrick', label: '长城砖（复刻版）', emoji: '🧱', count: 2 },
          { key: 'tanghulu', label: '冰糖葫芦签', emoji: '🍡', count: 0 },
        ]),
        place('chengdu', '成都', '🐼', 300, true, [
          { key: 'pandabutt', label: '熊猫屁屁抱枕', emoji: '🐼', count: 1 },
          { key: 'facemask', label: '变脸面具', emoji: '🎭', count: 0 },
        ]),
        place('xian', '西安', '🗿', 2300, false, [
          { key: 'terracotta', label: '兵马俑手办', emoji: '🗿', count: 0 },
          { key: 'biangcard', label: '写着「Biáng」的字帖', emoji: '📜', count: 0 },
        ]),
      ],
    },
    {
      key: 'europe', label: '欧洲', emoji: '🏰', have: 6, total: 6, done: true,
      reward: ['🧠智力 +4'],
      perk: { key: 'museum', label: '博物馆通票', emoji: '🖼', text: '旅行回来心情 +50%', active: true },
      places: [
        place('paris', '巴黎', '🗼', 1700, true, [{ key: 'eiffel', label: '埃菲尔铁塔钥匙扣', emoji: '🗼', count: 1 }]),
      ],
    },
  ],
  worldDone: false,
  worldTitle: { label: '环球旅行家', emoji: '🌍', reward: ['🧠智力 +3'] },
  lastTrip: null,
  oldSouvenirs: ['贝壳'],
}

const worldSnapshot = (world = WORLD) => ({ ...SNAPSHOT, world, trips: [] })

test('the travel tab shows home, the fare rule and the regions as an accordion', async () => {
  const { dom, net, store } = await loadWithPoll({ status: worldSnapshot() })
  openPanel(dom)
  pickTab(dom, 'travel')

  let text = contentOf(dom).allText()
  assert.ok(text.includes('🏠 Tokyo · UTC+9'), text)
  assert.ok(text.includes('每跨一个时区 +200 🪙 · +1 小时'), text)
  for (const bit of ['中国', '2/6', '欧洲', '6/6 ✅', '🌍', '环球旅行家', '1/2', '以前的纪念品：贝壳']) {
    assert.ok(text.includes(bit), `expected "${bit}" in: ${text}`)
  }
  // The first unfinished region is open; its places, reward, perk and chips show.
  assert.equal(findByAttr(contentOf(dom), 'data-region', 'china').attributes['aria-expanded'], 'true')
  for (const bit of ['北京', '300 🪙 · 2 小时', '集齐奖励：💪武力 +3 · ⚖️体重 +5 kg', '干饭王', '🔒 集齐后解锁']) {
    assert.ok(text.includes(bit), `expected "${bit}" in: ${text}`)
  }
  const brick = findByAttr(contentOf(dom), 'data-souvenir', 'wallbrick')
  assert.equal(brick.textContent, '🧱长城砖（复刻版） ×2')
  assert.equal(findByAttr(contentOf(dom), 'data-souvenir', 'pandabutt').textContent, '🐼熊猫屁屁抱枕', 'no ×1')
  const missing = findByAttr(contentOf(dom), 'data-souvenir', 'tanghulu')
  assert.equal(missing.textContent, '？')
  assert.equal(missing.attributes['data-have'], 'false')
  assert.ok(!text.includes('冰糖葫芦签'), 'a missing souvenir is not spoiled')
  assert.equal(findByAttr(contentOf(dom), 'data-trip', 'xian').disabled, true, 'unaffordable')
  assert.equal(findByAttr(contentOf(dom), 'data-trip', 'paris'), undefined, 'a closed region hides its places')

  findByAttr(contentOf(dom), 'data-trip', 'beijing').fire('click')
  await settle()
  await settle()
  assert.deepEqual(postsOf(net), [{ action: 'trip', trip: 'beijing' }])

  // One region open at a time, remembered.
  findLastByAttr(contentOf(dom), 'data-region', 'europe').fire('click')
  assert.equal(store.get('dsh-pig:region'), 'europe')
  assert.equal(findLastByAttr(contentOf(dom), 'data-region', 'europe').attributes['aria-expanded'], 'true')
  assert.equal(findLastByAttr(contentOf(dom), 'data-region', 'china').attributes['aria-expanded'], 'false')
  text = contentOf(dom).allText()
  assert.ok(text.includes('博物馆通票') && text.includes('已生效'), text)
  // Tapping the open one folds everything.
  findLastByAttr(contentOf(dom), 'data-region', 'europe').fire('click')
  assert.equal(store.get('dsh-pig:region'), '')
  assert.equal(findLastByAttr(contentOf(dom), 'data-region', 'europe').attributes['aria-expanded'], 'false')
})

test('the remembered region is the one that opens', async () => {
  const loaded = await loadClient({ status: worldSnapshot() })
  loaded.store.set('dsh-pig:region', 'europe')
  loaded.registration.factory(() => {}).apply({})
  await settle()
  openPanel(loaded.dom)
  pickTab(loaded.dom, 'travel')
  assert.equal(findLastByAttr(contentOf(loaded.dom), 'data-region', 'europe').attributes['aria-expanded'], 'true')
  assert.equal(findLastByAttr(contentOf(loaded.dom), 'data-region', 'china').attributes['aria-expanded'], 'false')
})

test('a recent trip is announced on the travel tab, an old one is not', async () => {
  const lastTrip = {
    place: '成都', emoji: '🐼',
    souvenir: { label: '变脸面具', emoji: '🎭', fresh: true },
    loot: [{ key: 'hotpot', label: '九宫格火锅', emoji: '🍲', exclusive: true }, { key: 'apple', label: '苹果', emoji: '🍎', exclusive: false }],
    regionDone: '中国',
    at: Date.now() - 60 * 1000,
  }
  const { dom } = await loadWithPoll({ status: worldSnapshot({ ...WORLD, lastTrip }) })
  openPanel(dom)
  pickTab(dom, 'travel')
  const banner = findByAttr(contentOf(dom), 'data-last-trip', 'true')
  assert.notEqual(banner, undefined)
  const text = banner.allText()
  for (const bit of ['刚从成都回来', '🎭变脸面具', '新！', '🍲九宫格火锅', '✈️ 限定', '🍎苹果', '集齐了「中国」！']) {
    assert.ok(text.includes(bit), `expected "${bit}" in: ${text}`)
  }
  // Only the specialty is tagged as travel-only.
  assert.equal(text.split('✈️ 限定').length - 1, 1, text)

  const stale = await loadWithPoll({ status: worldSnapshot({ ...WORLD, lastTrip: { ...lastTrip, at: Date.now() - 13 * 3600 * 1000 } }) })
  openPanel(stale.dom)
  pickTab(stale.dom, 'travel')
  assert.equal(findByAttr(contentOf(stale.dom), 'data-last-trip', 'true'), undefined)
})

test('the bag lists everything held, tags specialties and has no Use for rename cards', async () => {
  const bag = [
    { key: 'apple', label: '苹果', emoji: '🍎', kind: 'food', count: 2, exclusive: false },
    { key: 'duck', label: '北京烤鸭', emoji: '🦆', kind: 'food', count: 1, exclusive: true },
    { key: 'renamecard', label: '更名卡', emoji: '🪪', kind: 'card', count: 1, exclusive: false },
  ]
  const { dom, net } = await loadWithPoll({ status: { ...worldSnapshot(), bag } })
  openPanel(dom)
  pickTab(dom, 'bag')
  const text = contentOf(dom).allText()
  assert.ok(text.includes('北京烤鸭 ×1'), text)
  assert.ok(text.includes('✈️ 限定'), text)
  assert.ok(text.includes('用来改名'), text)
  assert.notEqual(findByAttr(contentOf(dom), 'data-use', 'duck'), undefined, 'a specialty is used like any food')
  assert.equal(findByAttr(contentOf(dom), 'data-use', 'renamecard'), undefined, 'a card is spent by renaming')
  // Consumables only: the collections have shelves of their own.
  assert.ok(!text.includes('贝壳'), 'no souvenirs on the consumables shelf')
  assert.equal(findByAttr(contentOf(dom), 'data-bag', 'items').attributes['data-active'], 'true')
  assert.ok(findByAttr(contentOf(dom), 'data-bag', 'items').textContent.includes('4'), 'counts every item held')

  findLastByAttr(contentOf(dom), 'data-use', 'duck').fire('click')
  await settle()
  await settle()
  assert.deepEqual(postsOf(net), [{ action: 'use', item: 'duck' }])
})

// [dsh-piggy-claude-code mod] ST0002: the bag's collections, by where they came from.
test('the bag keeps travel souvenirs and school diplomas on shelves of their own', async () => {
  const diplomas = [
    { key: 'diploma-primary', stage: 'primary', label: '小学毕业证', emoji: '📃', repeat: false, count: 1, next: null },
    { key: 'diploma-college', stage: 'college', label: '大学毕业证', emoji: '📜', repeat: false, count: 0, next: { done: 4, need: 9 } },
    { key: 'diploma-graduate', stage: 'graduate', label: '硕士学位证', emoji: '🎖️', repeat: true, count: 2, next: { done: 3, need: 9 } },
    { key: 'diploma-doctor', stage: 'doctor', label: '博士学位证', emoji: '🎓', repeat: true, count: 0, next: { done: 0, need: 9 } },
  ]
  const status = { ...worldSnapshot(), pig: { ...worldSnapshot().pig, diplomas } }
  const { dom, store } = await loadWithPoll({ status })
  openPanel(dom)
  pickTab(dom, 'bag')
  assert.ok(findByAttr(contentOf(dom), 'data-bag', 'travel').textContent.includes('纪念品 8/12'))
  assert.ok(findByAttr(contentOf(dom), 'data-bag', 'school').textContent.includes('毕业证 2/4'))

  findByAttr(contentOf(dom), 'data-bag', 'travel').fire('click')
  let text = contentOf(dom).allText()
  for (const bit of ['中国 2/6', '欧洲 6/6 ✅', '干饭王', '以前的纪念品：贝壳']) assert.ok(text.includes(bit), `expected "${bit}" in: ${text}`)
  assert.equal(findLastByAttr(contentOf(dom), 'data-souvenir', 'wallbrick').textContent, '🧱长城砖（复刻版） ×2')
  assert.equal(store.get('dsh-pig:bag'), 'travel', 'the shelf is remembered')

  findByAttr(contentOf(dom), 'data-bag', 'school').fire('click')
  text = contentOf(dom).allText()
  for (const bit of ['小学毕业证 ×1', '收藏品', '硕士学位证 ×2', '再上 6 节再发一张', '上满 9 节发证（4/9）']) {
    assert.ok(text.includes(bit), `expected "${bit}" in: ${text}`)
  }
  findLastByAttr(contentOf(dom), 'data-goto', 'study').fire('click')
  assert.equal(findByAttr(barOf(dom), 'data-tab', 'study').attributes['data-active'], 'true')

  // A fresh panel (the fake DOM keeps old nodes on re-render): each shelf holds only its own.
  const travel = await loadWithPoll({ status, storage: { 'dsh-pig:bag': 'travel' } })
  openPanel(travel.dom)
  pickTab(travel.dom, 'bag')
  assert.equal(findByAttr(contentOf(travel.dom), 'data-bag', 'travel').attributes['data-active'], 'true')
  assert.equal(findByAttr(contentOf(travel.dom), 'data-trip', 'beijing'), undefined, 'trips stay on the travel tab')
  assert.equal(findByAttr(contentOf(travel.dom), 'data-use', 'apple'), undefined, 'no consumables among the souvenirs')
  assert.equal(findByAttr(contentOf(travel.dom), 'data-diploma', 'diploma-primary'), undefined)
  const school = await loadWithPoll({ status, storage: { 'dsh-pig:bag': 'school' } })
  openPanel(school.dom)
  pickTab(school.dom, 'bag')
  assert.ok(!contentOf(school.dom).allText().includes('长城砖'), 'no souvenirs among the diplomas')
  assert.equal(findByAttr(contentOf(school.dom), 'data-use', 'apple'), undefined)
})

test('the shop has an items shelf with the rename card', async () => {
  const shop = [...SHOP, { key: 'renamecard', label: '更名卡', emoji: '🪪', price: 1000, kind: 'card', tier: null, affordable: false, needed: false }]
  for (const [lang, shelf] of [['zh', '🪪 道具'], ['ja', '🪪 どうぐ'], ['en', '🪪 Items']]) {
    const { dom } = await loadWithPoll({ status: { ...SNAPSHOT, shop, lang, langs: LANGS } })
    openPanel(dom)
    pickTab(dom, 'shop')
    assert.ok(contentOf(dom).allText().includes(shelf), `${lang}: ${contentOf(dom).allText()}`)
    assert.equal(findByAttr(contentOf(dom), 'data-buy', 'renamecard').disabled, true)
  }
})

// [ST0012] the 装扮 shelf: one decoration owned, one for sale.
test('the shop has a dress-up shelf; owned gear cannot be bought again', async () => {
  const shop = [
    ...SHOP,
    { key: 'pager', label: 'BP机皮带', emoji: '📟', price: 288, kind: 'wear', tier: null, affordable: true, needed: false, owned: true },
    { key: 'hulahoop', label: '网红呼啦圈', emoji: '⭕', price: 66, kind: 'wear', tier: null, affordable: true, needed: false, owned: false },
  ]
  for (const [lang, shelf, owned] of [['zh', '👗 装扮', '已拥有'], ['ja', '👗 きせかえ', '持ってる'], ['en', '👗 Dress-up', 'Owned']]) {
    const { dom } = await loadWithPoll({ status: { ...SNAPSHOT, shop, lang, langs: LANGS } })
    openPanel(dom)
    pickTab(dom, 'shop')
    assert.ok(contentOf(dom).allText().includes(shelf), `${lang}: ${contentOf(dom).allText()}`)
    const pager = findByAttr(contentOf(dom), 'data-buy', 'pager')
    assert.equal(pager.disabled, true, `${lang}: owned`)
    assert.equal(pager.textContent, owned)
    assert.equal(findByAttr(contentOf(dom), 'data-buy', 'hulahoop').disabled, false, `${lang}: on sale`)
  }
})

const STUDY_SUBJECTS = [
  ...SUBJECTS,
  { key: 'math', label: '数学', emoji: '🔢', traitLabel: '智力', level: 0, available: true },
]
const LADDER = [
  { key: 'primary', label: '小学', minutes: 120, tuition: 40, gain: 1, parallel: 1, unlocked: true, progress: null },
  { key: 'college', label: '大学', minutes: 240, tuition: 220, gain: 2, parallel: 2, unlocked: true, progress: null },
  { key: 'graduate', label: '研究生', minutes: 480, tuition: 900, gain: 4, parallel: 3, unlocked: true, progress: null },
  { key: 'doctor', label: '博士', minutes: 720, tuition: 2400, gain: 7, parallel: 3, unlocked: false, progress: { done: 4, need: 9, label: '研究生九门课各上一次' } },
]

test('a stage that allows several subjects lets them be ticked and sent together', async () => {
  const { dom, net } = await loadWithPoll({ status: { ...SNAPSHOT, subjects: STUDY_SUBJECTS, stages: LADDER } })
  openPanel(dom)
  pickTab(dom, 'study')
  assert.ok(contentOf(dom).allText().includes('博士'), 'the doctorate is on the ladder')
  findByAttr(contentOf(dom), 'data-stage', 'graduate').fire('click')
  assert.ok(contentOf(dom).allText().includes('可以一起上 3 门 · 已选 0'), contentOf(dom).allText())
  assert.equal(findLastByAttr(contentOf(dom), 'data-study', 'go').disabled, true, 'nothing ticked yet')

  for (const key of ['chinese', 'art', 'wushu', 'math']) findLastByAttr(contentOf(dom), 'data-subject', key).fire('click')
  assert.ok(findByClass(hostOf(dom), 'dp-bubble').allText().includes('最多上 3 门课'), 'the 4th tick is refused with a hint')
  assert.equal(findLastByAttr(contentOf(dom), 'data-subject', 'math').attributes['aria-pressed'], 'false')
  assert.equal(findLastByAttr(contentOf(dom), 'data-subject', 'art').attributes['aria-pressed'], 'true')
  // Untick and tick again works.
  findLastByAttr(contentOf(dom), 'data-subject', 'art').fire('click')
  findLastByAttr(contentOf(dom), 'data-subject', 'math').fire('click')

  const go = findLastByAttr(contentOf(dom), 'data-study', 'go')
  assert.equal(go.disabled, false)
  assert.ok(go.allText().includes('上课 × 3（学费 2700 🪙）'), go.allText())
  assert.deepEqual(postsOf(net), [], 'ticking sends nothing')
  go.fire('click')
  await settle()
  await settle()
  assert.deepEqual(postsOf(net), [{ action: 'study', subjects: ['chinese', 'wushu', 'math'], stage: 'graduate' }])
})

test('a one-subject stage keeps the one-tap lesson, the doctorate shows its lock and badge', async () => {
  const { dom, net } = await loadWithPoll({
    status: { ...SNAPSHOT, subjects: STUDY_SUBJECTS, stages: LADDER, pig: { ...PIG, doctor: true } },
  })
  openPanel(dom)
  pickTab(dom, 'study')
  assert.ok(contentOf(dom).allText().includes('🎓 博士毕业'), 'a doctor wears the badge')
  assert.equal(findByAttr(contentOf(dom), 'data-study', 'go'), undefined, 'no tick-and-send at 小学')
  assert.match(findByClass(contentOf(dom), 'dp-seg').className, /dp-seg-2/, 'four stages sit in two rows')

  findLastByAttr(contentOf(dom), 'data-stage', 'doctor').fire('click')
  const text = contentOf(dom).allText()
  assert.ok(text.includes('要先念完研究生九门课各上一次（4/9）'), text)
  assert.equal(findLastByAttr(contentOf(dom), 'data-subject', 'art').disabled, true)

  findLastByAttr(contentOf(dom), 'data-stage', 'primary').fire('click')
  findLastByAttr(contentOf(dom), 'data-subject', 'art').fire('click')
  await settle()
  await settle()
  assert.deepEqual(postsOf(net), [{ action: 'study', subject: 'art', stage: 'primary' }])
})

test('the new refusals explain themselves', async () => {
  const cases = [
    ['too-many', { max: 2 }, '最多上 2 门课'],
    ['not-for-sale', {}, '旅行限定'],
    ['use-to-rename', {}, '改名时用'],
  ]
  for (const [reason, extra, expected] of cases) {
    const { dom } = await loadWithPoll({ actResult: { ...SNAPSHOT, ok: false, reason, ...extra } })
    openPanel(dom)
    pickTab(dom, 'work')
    findByAttr(contentOf(dom), 'data-job', 'odd').fire('click')
    await settle()
    await settle()
    const bubble = findByClass(hostOf(dom), 'dp-bubble').allText()
    assert.ok(bubble.includes(expected), `${reason}: ${bubble}`)
  }
})

test('the travel world reads in Japanese without stray Chinese from the client', async () => {
  const { dom } = await loadWithPoll({ status: { ...worldSnapshot(), lang: 'ja', langs: LANGS } })
  openPanel(dom)
  pickTab(dom, 'travel')
  const text = contentOf(dom).allText()
  for (const bit of ['時差1時間ごとに +200 🪙 · +1 時間', '2時間', 'コンプリート報酬', '出発', 'むかしのおみやげ']) {
    assert.ok(text.includes(bit), `expected "${bit}" in: ${text}`)
  }
  for (const zh of ['每跨', '集齐', '小时', '以前的']) assert.ok(!text.includes(zh), `"${zh}" leaked: ${text}`)
})

// ===========================================================================
// [dsh-piggy-claude-code mod] Resizable panel, the big panel and its skins
// ===========================================================================

async function loadWithCtx(ctx, options) {
  const loaded = await loadClient(options)
  globalThis.window.setInterval = () => 1
  loaded.registration.factory(() => {}).apply(ctx)
  await settle()
  return loaded
}

test('the open panel can be resized from its grips, remembers the size, and a double-click resets it', async () => {
  const { dom, net, store } = await loadWithCtx({})
  openPanel(dom)
  const host = hostOf(dom)
  assert.equal(host.attributes['data-open'], 'true')
  const corner = findByAttr(cardOf(dom), 'data-resize', 'corner')
  assert.ok(corner, 'a corner grip')
  assert.ok(findByAttr(cardOf(dom), 'data-resize', 'top') && findByAttr(cardOf(dom), 'data-resize', 'left'), 'edge grips')

  corner.fire('pointerdown', { button: 0, clientX: 600, clientY: 300 })
  corner.fire('pointermove', { clientX: 450, clientY: 200 })
  corner.fire('pointerup', {})
  const saved = JSON.parse(store.get('dsh-pig:cardSize'))
  assert.ok(saved.w > 292, `wider: ${saved.w}`)
  assert.ok(saved.h > 0)
  assert.equal(host.attributes['data-open'], 'true', 'resizing does not close the menu')
  assert.deepEqual(postsOf(net), [], 'resizing pats nothing and sends nothing')

  corner.fire('dblclick', {})
  assert.equal(store.get('dsh-pig:cardSize'), '', 'double-click forgets the size')
})

test('the ⤢ button only appears when the host can open the big panel', async () => {
  const plain = await loadWithCtx({})
  openPanel(plain.dom)
  assert.equal(findByAttr(hostOf(plain.dom), 'data-open-panel', 'true'), undefined, 'no ⤢ without a host that can open it')

  let opened = 0
  const hosted = await loadWithCtx({ openPanel: () => { opened += 1 } })
  openPanel(hosted.dom)
  const button = findByAttr(hostOf(hosted.dom), 'data-open-panel', 'true')
  assert.ok(button, 'the ⤢ button')
  button.fire('click', {})
  assert.equal(opened, 1)
})

test('the big panel lays the pig and its bars on the left and the tabs on the right', async () => {
  const { dom } = await loadWithCtx({ layout: 'split' })
  const host = hostOf(dom)
  assert.equal(host.attributes['data-layout'], 'split')
  assert.equal(host.attributes['data-skin'], 'game')
  const left = findByClass(host, 'dp-left')
  assert.ok(left, 'a left column')
  assert.ok(left.allText().includes('饱食') && left.allText().includes('健康'), 'the bars are on the left')
  assert.ok(findByAttr(host, 'data-tab', 'travel'), 'the six tabs are there')
})

test('the spreadsheet skin is remembered, dresses up as Excel, and its sheet tabs switch the content', async () => {
  const { dom, store } = await loadWithCtx({ layout: 'split' })
  const host = hostOf(dom)
  findByAttr(host, 'data-skin-toggle', 'excel').fire('click', {})
  assert.equal(host.attributes['data-skin'], 'excel')
  assert.equal(store.get('dsh-pig:skin'), 'excel')
  for (const part of ['dp-xl-title', 'dp-xl-ribbon', 'dp-xl-fx']) assert.ok(findByClass(host, part), `${part} is drawn`)
  assert.match(globalThis.document.title ?? '', /xlsx/, 'the window title is a workbook')

  findByAttr(host, 'data-tab', 'shop').fire('click', {})
  assert.equal(findByAttr(host, 'data-tab', 'shop').attributes['aria-selected'] ?? findByAttr(host, 'data-tab', 'shop').attributes['data-active'] ?? 'true', 'true')

  findByAttr(host, 'data-skin-toggle', 'game').fire('click', {})
  assert.equal(host.attributes['data-skin'], 'game')
  assert.equal(store.get('dsh-pig:skin'), 'game')
})

test('the boss key turns the big panel into a spreadsheet at once', async () => {
  const { dom, windowListeners } = await loadWithCtx({ layout: 'split' })
  const host = hostOf(dom)
  assert.equal(host.attributes['data-skin'], 'game')
  for (const fn of windowListeners.keydown ?? []) fn({ key: 'E', ctrlKey: true, shiftKey: true, preventDefault() {} })
  assert.equal(host.attributes['data-skin'], 'excel')
})

test('a scratch card plays scratching first, then the verdict and the line', async () => {
  const lottery = { price: 100, cooldownMinutes: 10, waitSeconds: 0, affordable: true,
    prizes: [{ tier: 'first', label: '一等奖', emoji: '🏆', coins: 2000 }, { tier: 'none', label: '谢谢参与', emoji: '🙏', coins: 0 }] }
  const stage = { key: 'young', label: '青年猪', emoji: '🐖', size: 48, art: 'stage-young' }
  const status = { ...SNAPSHOT, lottery, pig: { ...PIG, stage, mood: 'fine' } }
  const { registration, dom } = await loadClient({
    status,
    actResult: { ...status, ok: true, prize: { tier: 'first', coins: 2000, mood: 'jackpot' } },
  })
  const later = []
  window.setTimeout = fn => { later.push(fn); return later.length }
  registration.factory(() => {}).apply({})
  await settle()
  openPanel(dom)
  pickTab(dom, 'shop')
  openCasino(dom)
  findByAttr(contentOf(dom), 'data-lottery', 'go').fire('click')
  await settle()
  await settle()
  const img = () => findByClass(hostOf(dom), 'dp-pig-img')
  assert.equal(img().src, '/dsh-pig/art/lottery-scratch.svg', 'scratching first')
  for (const fn of later.splice(0)) fn()
  assert.equal(img().src, '/dsh-pig/art/lottery-jackpot.svg', 'then the jackpot')
  assert.ok(findByClass(hostOf(dom), 'dp-bubble').allText().includes('2000'))
})

// [ST0015] Blackjack at the shop counter
const findAllByAttr = (root, attr, value) => {
  const found = []
  root.walk(node => { if (node.attributes?.[attr] === value) found.push(node) })
  return found
}
const BLACKJACK_TABLE = {
  bets: [100, 200, 500], standAt: 18,
  payouts: [{ total: 18, multiplier: 1.1 }, { total: 19, multiplier: 1.3 }, { total: 20, multiplier: 1.8 }, { total: 21, multiplier: 10 }],
  hand: null,
}

test('blackjack: the shop offers the bets the pig can afford, and a bet POSTs the deal', async () => {
  const status = { ...SNAPSHOT, blackjack: BLACKJACK_TABLE, pig: { ...PIG, coins: 250 } }
  const { dom, net } = await loadWithPoll({ status, actResult: { ...status, ok: true } })
  openPanel(dom)
  pickTab(dom, 'shop')
  openCasino(dom)
  const deals = findAllByAttr(contentOf(dom), 'data-blackjack', 'deal')
  assert.deepEqual(deals.map(b => [b.attributes['data-bet'], b.disabled]), [['100', false], ['200', false], ['500', true]])
  assert.ok(contentOf(dom).allText().includes('21 点 ×10'), contentOf(dom).allText())
  deals[0].fire('click')
  await settle()
  assert.deepEqual(postsOf(net).at(-1), { action: 'blackjack', move: 'deal', bet: 100 })
})

test('blackjack: an open hand shows its cards; stand waits for 18', async () => {
  const hand = { bet: 100, cards: [{ rank: '10', suit: '♠' }, { rank: '7', suit: '♥' }], total: 17, soft: false }
  const status = { ...SNAPSHOT, blackjack: { ...BLACKJACK_TABLE, hand } }
  const { dom, net } = await loadWithPoll({ status, actResult: { ...status, ok: true } })
  openPanel(dom)
  pickTab(dom, 'shop')
  openCasino(dom)
  assert.equal(findAllByAttr(contentOf(dom), 'data-blackjack', 'deal').length, 0, 'no new bet mid-hand')
  assert.ok(contentOf(dom).allText().includes('10♠'))
  assert.equal(findByAttr(contentOf(dom), 'data-blackjack', 'stand').disabled, true)
  findByAttr(contentOf(dom), 'data-blackjack', 'hit').fire('click')
  await settle()
  assert.deepEqual(postsOf(net).at(-1), { action: 'blackjack', move: 'hit' })
})

test('blackjack: a hand that ends says how, and stays on the table until the next deal', async () => {
  const status = { ...SNAPSHOT, blackjack: { ...BLACKJACK_TABLE, hand: { bet: 100, cards: [{ rank: '10', suit: '♠' }, { rank: '9', suit: '♦' }], total: 19, soft: false } } }
  const round = { bet: 100, cards: [{ rank: '10', suit: '♠' }, { rank: '9', suit: '♦' }, { rank: '2', suit: '♣' }], total: 21, soft: false, done: true, outcome: 'jackpot', multiplier: 10, coins: 1000 }
  const { dom } = await loadWithPoll({ status, actResult: { ...SNAPSHOT, blackjack: BLACKJACK_TABLE, ok: true, round } })
  openPanel(dom)
  pickTab(dom, 'shop')
  openCasino(dom)
  findByAttr(contentOf(dom), 'data-blackjack', 'hit').fire('click')
  await settle()
  await settle()
  assert.ok(findByClass(hostOf(dom), 'dp-bubble').allText().includes('1000'))
  assert.ok(lastByClass(hostOf(dom), 'dp-bj').allText().includes('2♣'), 'the last hand is still shown')
})

test('the shop opens on a casino door; the games live behind it, with a way back', async () => {
  const lottery = { price: 100, cooldownMinutes: 10, waitSeconds: 0, affordable: true, prizes: [] }
  const status = { ...SNAPSHOT, lottery, blackjack: BLACKJACK_TABLE }
  const { dom } = await loadWithPoll({ status })
  openPanel(dom)
  pickTab(dom, 'shop')
  const door = findByAttr(contentOf(dom), 'data-casino', 'open')
  assert.ok(door, 'a casino door')
  const kids = contentOf(dom).children
  assert.ok(kids.indexOf(door) >= 0 && kids.indexOf(door) < kids.indexOf(lastByClass(contentOf(dom), 'dp-list')), 'above every shelf')
  assert.equal(findByAttr(contentOf(dom), 'data-lottery', 'go'), undefined, 'no games on the shelves page')
  assert.ok(door.allText().includes('刮彩票') && door.allText().includes('21 点'), door.allText())

  // The fake DOM keeps cleared children, so read what the latest render ended with.
  const lastShown = () => contentOf(dom).children.at(-1).className
  door.fire('click')
  assert.ok(findByAttr(contentOf(dom), 'data-lottery', 'go'), 'scratch cards inside')
  assert.equal(findAllByAttr(contentOf(dom), 'data-blackjack', 'deal').length, 3, 'blackjack inside')
  assert.equal(lastShown(), 'dp-bj', 'the casino page ends with blackjack, no shelves after it')

  findByAttr(contentOf(dom), 'data-casino', 'back').fire('click')
  assert.equal(lastShown(), 'dp-list', 'back on the shelves')

  findAllByAttr(contentOf(dom), 'data-casino', 'open').at(-1).fire('click')
  assert.equal(lastShown(), 'dp-bj')
  pickTab(dom, 'status')
  pickTab(dom, 'shop')
  assert.equal(lastShown(), 'dp-list', 'another tab and back lands on the shelves')
})

test('blackjack: an older host without the table shows no blackjack', async () => {
  const { dom } = await loadWithPoll({ status: SNAPSHOT })
  openPanel(dom)
  pickTab(dom, 'shop')
  assert.equal(findAllByAttr(contentOf(dom), 'data-blackjack', 'deal').length, 0)
  assert.equal(findByAttr(contentOf(dom), 'data-casino', 'open'), undefined, 'nor a casino with nothing in it')
})

// ===========================================================================
// [ST0007] Updates, shown in the panel (the desktop app's /pig/update route)
// ===========================================================================

/** The fake DOM keeps cleared children around; the live element is the last one. */
const lastByClass = (root, className) => {
  let found
  root.walk(node => {
    if (typeof node.className === 'string' && node.className.split(/\s+/).includes(className)) found = node
  })
  return found
}

const UPDATE = { current: '0.6.0', status: 'available', latest: { version: '0.7.0', notes: '新衣柜' }, progress: 0, canInstall: true, error: null, message: '' }

/** Route /pig/update to `update` (a 404 when null); everything else gets the snapshot. */
function updateNet(update, onPost = () => {}) {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options?.method ?? 'GET' })
    if (url === '/pig/update') {
      if (update === null) return { ok: false, status: 404, async json() { return { error: 'no updater' } } }
      if (options?.method === 'POST') update = onPost(JSON.parse(options.body).action, update) ?? update
      return { ok: true, status: 200, async json() { return update } }
    }
    return { ok: true, status: 200, async json() { return SNAPSHOT } }
  }
  return calls
}

test('a new version shows above every tab, and the button installs it', async () => {
  const { dom, poll } = await loadWithPoll()
  const posts = []
  updateNet(UPDATE, (action, now) => {
    posts.push(action)
    return action === 'install' ? { ...now, status: 'downloading', progress: 42 } : now
  })
  await poll()
  assert.ok(hostOf(dom).allText().includes('有新版本 v0.7.0 啦'), 'the pig says so even with the panel closed')
  openPanel(dom)

  const card = lastByClass(contentOf(dom), 'dp-update')
  assert.notEqual(card, undefined)
  for (const line of ['有新版本 v0.7.0', '当前版本 v0.6.0', '新衣柜', '立即更新']) assert.ok(card.allText().includes(line), card.allText())
  pickTab(dom, 'shop')
  assert.notEqual(lastByClass(contentOf(dom), 'dp-update'), undefined, 'visible from any tab')

  findLastByAttr(contentOf(dom), 'data-update', 'install').fire('click')
  await settle()
  await settle()
  assert.deepEqual(posts, ['install'])
  const downloading = lastByClass(contentOf(dom), 'dp-update')
  assert.equal(downloading.attributes['data-update-status'], 'downloading')
  assert.ok(downloading.allText().includes('正在下载 v0.7.0… 42%'), downloading.allText())
  assert.equal(findByAttr(downloading, 'data-update', 'install'), undefined, 'no second install while downloading')
})

test('a failed install says why and offers to try again', async () => {
  const { dom, poll } = await loadWithPoll()
  updateNet({ ...UPDATE, error: 'install', message: 'download checksum mismatch' })
  await poll()
  openPanel(dom)
  const card = lastByClass(contentOf(dom), 'dp-update')
  assert.ok(card.allText().includes('更新失败：download checksum mismatch'), card.allText())
  assert.ok(findByAttr(card, 'data-update', 'install').allText().includes('再试一次'))
})

test('a copy that cannot replace itself points to the download page', async () => {
  const { dom, poll } = await loadWithPoll()
  const posts = []
  updateNet({ ...UPDATE, canInstall: false }, action => { posts.push(action) })
  await poll()
  openPanel(dom)
  assert.equal(findLastByAttr(contentOf(dom), 'data-update', 'install'), undefined)
  findLastByAttr(contentOf(dom), 'data-update', 'page').fire('click')
  await settle()
  assert.deepEqual(posts, ['page'])
})

test('the version row under the languages checks for updates', async () => {
  const { dom, poll } = await loadWithPoll()
  const posts = []
  updateNet({ ...UPDATE, status: 'latest', latest: null }, (action, now) => {
    posts.push(action)
    return { ...now, status: 'checking' }
  })
  await poll()
  openPanel(dom)
  assert.equal(lastByClass(contentOf(dom), 'dp-update'), undefined, 'nothing new, no card')
  const row = lastByClass(contentOf(dom), 'dp-version')
  assert.ok(row.allText().includes('v0.6.0 · 已经是最新版本'), row.allText())
  findByAttr(row, 'data-update', 'check').fire('click')
  await settle()
  await settle()
  assert.deepEqual(posts, ['check'])
  const checking = lastByClass(contentOf(dom), 'dp-version')
  assert.ok(checking.allText().includes('正在检查更新…'), checking.allText())
  assert.equal(findByAttr(checking, 'data-update', 'check').disabled, true)
})

test('a host without an updater shows nothing about versions and stops asking', async () => {
  const { dom, poll } = await loadWithPoll()
  const calls = updateNet(null)
  await poll()
  await poll()
  openPanel(dom)
  assert.equal(calls.filter(call => call.url === '/pig/update').length, 1, 'one 404 is enough')
  assert.equal(lastByClass(contentOf(dom), 'dp-update'), undefined)
  assert.equal(lastByClass(contentOf(dom), 'dp-version'), undefined)
})
