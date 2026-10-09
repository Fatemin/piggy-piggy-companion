#!/usr/bin/env node
/**
 * Build every pig sprite in assets/ from ONE pig.
 *
 * The pig is the project's original drawing — the Noto Emoji 🐖 traced into
 * flat paths (it used to live in assets/piglet.svg). No stage or behaviour
 * redraws it: a sprite only moves it (CSS animation inside the SVG), closes
 * its eyes, and adds things around it — a desk, a tub, tears.
 *
 * [ST0004] Two kinds of asset, never mixed (docs/contracts/art-assets.md):
 *   pose (行为资产)        <pose>.svg — what the pig is doing; the game picks it.
 *                          It carries one empty wear slot, `<g class="wear"
 *                          data-occupies="…">`, naming the slots its own gear
 *                          already covers (the trip's straw hat, the lab goggles).
 *   decoration (装饰资产)  wear-<key>.svg — something the pig wears; its owner
 *                          picks it. The art route pours the worn decorations
 *                          into the pose's slot, so one drawing fits every pose.
 *
 * stage-box.svg and stage-grave.svg have no pig in them and are hand-written;
 * this script leaves them alone.
 *
 *   node tools/build-sprites.mjs
 */
import { writeFileSync } from 'node:fs'

const OUT = new URL('../assets/', import.meta.url)
// Pig content spans x 48–341, y 31–298; the top margin leaves room for props.
const VIEWBOX = '24 -36 336 336'

// ---------------------------------------------------------------------------
// The pig, verbatim. Colours and shapes never change.
// ---------------------------------------------------------------------------
const C = { body: '#FFD1AF', far: '#FF9FA5', snout: '#FF8195', ear: '#E95892', eye: '#373A32', blush: '#FFAFAC' }
const P = {
  farLeg: 'M214 210C213 221 210 232 211 246C212 256 224 257 233 254C244 251 246 240 247 225L248 211Z',
  tail: 'M294 62C298 47 305 40 315 45C327 50 341 64 329 72C319 80 309 67 316 51C322 39 330 31 339 35',
  body: 'M110 70C155 46 192 37 231 41C259 43 279 48 298 64C320 83 332 105 332 128C333 146 326 163 319 180C312 197 309 223 308 241C308 254 301 260 289 260C277 260 270 255 269 244L267 230C266 222 261 219 253 220C231 227 213 235 192 240L191 282C191 292 185 298 173 298C159 298 152 293 152 284L151 248C140 248 131 247 123 245L122 271C121 282 116 287 104 287C93 287 88 283 87 273L84 232C63 224 52 210 48 192C42 170 48 148 62 126C69 115 75 106 80 94C87 79 96 68 110 70Z',
  earBase: 'M63 107C64 97 75 81 84 68C90 58 102 58 108 66L115 87L90 113Z',
  ear1: 'M97 65C88 63 83 75 78 82C71 91 65 101 64 106C68 116 86 109 93 98',
  ear2: 'M187 104C174 110 184 129 193 139C201 147 213 150 220 139C225 131 224 119 222 112',
  eye1: 'M91 130C84 129 79 136 80 144C80 151 85 155 92 154C99 153 103 147 102 140C102 134 98 130 91 130Z',
  eye2: 'M166 145C159 144 154 150 154 157C153 164 158 170 165 170C171 170 176 164 176 157C176 151 173 146 166 145Z',
  snout: 'M108 165C91 161 78 166 74 175C68 186 74 200 90 207C106 214 125 214 135 204C143 196 140 183 129 174C123 170 116 167 108 165Z',
  nostril1: 'M92 175C87 174 84 178 85 185C85 191 89 196 94 195C99 194 101 188 99 182C98 178 96 175 92 175Z',
  nostril2: 'M115 180C110 178 107 183 107 189C106 195 109 200 114 200C119 200 122 195 122 189C122 184 119 180 115 180Z',
}
// The same eyes, shut: ‿ for asleep, ^ for a happy squint.
const SHUT = { closed: 'M80 141Q91 152 102 141M154 156Q165 167 176 156', happy: 'M80 147Q91 134 102 147M154 162Q165 149 176 162' }

/**
 * The pig. `eyes`: 'open' (blinks) | 'closed' | 'happy'. `face` is drawn on
 * top of the face (glasses, tears…), `back` between the far leg and the body.
 */
/**
 * Both cheeks. The near one sits right of the snout; the far one, left of the
 * snout under the far eye, is a little smaller since the face is turned.
 */
const cheeks = (rx, ry, fill, opacity, cls = '') => {
  const c = cls === '' ? '' : ` class="${cls}"`
  return `<ellipse${c} cx="155" cy="187" rx="${rx}" ry="${ry}" fill="${fill}" opacity="${opacity}"/>`
    + `<ellipse${c} cx="60" cy="170" rx="${+(rx * .75).toFixed(1)}" ry="${+(ry * .75).toFixed(1)}" fill="${fill}" opacity="${opacity}"/>`
}

function pig({ eyes = 'open', face = '', back = '', blush = '', wear = '' } = {}) {
  const eyeMarkup = eyes === 'open'
    ? `<path class="eye" fill="${C.eye}" d="${P.eye1}"/><path class="eye" fill="${C.eye}" d="${P.eye2}"/>`
    : `<path d="${SHUT[eyes]}" fill="none" stroke="${C.eye}" stroke-width="7"/>`
  return `<g class="pig" stroke-linecap="round" stroke-linejoin="round">
    <path fill="${C.far}" d="${P.farLeg}"/>
    <path class="tail" d="${P.tail}" fill="none" stroke="${C.body}" stroke-width="11"/>
    ${back}
    <path fill="${C.body}" d="${P.body}"/>
    <path fill="${C.body}" d="${P.earBase}"/>
    <path class="ear1" d="${P.ear1}" fill="none" stroke="${C.ear}" stroke-width="10"/>
    <path class="ear2" d="${P.ear2}" fill="none" stroke="${C.ear}" stroke-width="11"/>
    ${eyeMarkup}
    <g class="snout"><path fill="${C.snout}" d="${P.snout}"/>
    <path fill="${C.eye}" d="${P.nostril1}"/>
    <path fill="${C.eye}" d="${P.nostril2}"/></g>
    ${cheeks(12, 7, C.blush, '.75', 'blush')}
    ${blush}
    ${wear}
    ${face}
  </g>`
}

// Shared motion: blink, wag, ear flick. Each sprite adds its own.
const BASE_CSS = `
    .eye{animation:blink 4.2s infinite;transform-box:fill-box;transform-origin:50% 50%}
    .tail{animation:wag 1.4s ease-in-out infinite;transform-origin:296px 64px}
    .ear2{animation:flick 5.2s ease-in-out infinite;transform-origin:205px 108px}
    @keyframes blink{0%,90%,100%{transform:scaleY(1)}93%{transform:scaleY(.1)}}
    @keyframes wag{50%{transform:rotate(14deg)}}
    @keyframes flick{0%,80%,100%{transform:rotate(0)}85%{transform:rotate(-12deg)}90%{transform:rotate(4deg)}}`

const heart = (x, y, s, fill, cls) =>
  // The animated class sits on a wrapper: a CSS transform would replace the
  // path's own transform attribute.
  `<g class="${cls}"><path transform="translate(${x} ${y}) scale(${s})" d="M0 0c0-10 13-15 18-5 5-10 18-5 18 5 0 13-18 23-18 23S0 13 0 0Z" fill="${fill}"/></g>`
const sparkle = (x, y, r, fill, cls) =>
  `<path class="${cls}" d="M${x} ${y - r}l${r * .3} ${r * .7} ${r * .7} ${r * .3}-${r * .7} ${r * .3}-${r * .3} ${r * .7}-${r * .3}-${r * .7}-${r * .7}-${r * .3} ${r * .7}-${r * .3}Z" fill="${fill}"/>`
const drop = (x, y, s, fill, cls) =>
  `<g class="${cls}"><path transform="translate(${x} ${y}) scale(${s})" d="M0 0C-4 7-6 11-6 14a6 6 0 0 0 12 0c0-3-2-7-6-14Z" fill="${fill}"/></g>`

// ---------------------------------------------------------------------------
// [ST0004] Decorations (装饰资产): each one is drawn once, on the pig's own
// coordinates, so it sits right in every pose. Keys and slots must match
// data.js WEARABLES. Classes and keyframes start with `w-<key>` so they can never
// collide with a pose's own. Poses reuse a few of these as their own gear.
// ---------------------------------------------------------------------------
const glasses = stroke => `<g fill="none" stroke="${stroke}" stroke-width="5"><circle cx="91" cy="142" r="20"/><circle cx="165" cy="157" r="20"/><path d="M111 145L145 152M71 138L58 132"/></g>`
// Hats are drawn at their first size, then scaled up about the point where
// they sit on the head, so a bigger hat still sits on the same spot.
const HAT_SCALE = 1.35
const hat = (cx, cy, svg) => `<g transform="translate(${cx} ${cy}) scale(${HAT_SCALE}) translate(${-cx} ${-cy})">${svg}</g>`
// [ST0012] Waist gear. The pig has no neck, so anything worn round the middle
// goes round its waist, following the body: the pig is turned toward us, so a
// belt round it leans, its top toward the head and its foot toward the rump,
// bowing toward the rump (the line the owner drew), and stays clear of the
// near ear. The belt is a band clipped to the body, so it ends exactly on the
// outline. A hoop leans the same way, its far half behind the pig.
const WAIST = { top: [222, 32], ctrl: [270, 124], bottom: [256, 244] }
/** The waist line `t` of the way down (0 = the back, 1 = the belly), `dx` to the right. */
const waistAt = (t, dx = 0) => {
  const q = i => (1 - t) ** 2 * WAIST.top[i] + 2 * t * (1 - t) * WAIST.ctrl[i] + t ** 2 * WAIST.bottom[i]
  return [+(q(0) + dx).toFixed(1), +q(1).toFixed(1)]
}
/** How far the waist line leans from upright at `t`, in degrees (negative: its foot toward the rump). */
const waistLean = t => {
  const d = i => 2 * (1 - t) * (WAIST.ctrl[i] - WAIST.top[i]) + 2 * t * (WAIST.bottom[i] - WAIST.ctrl[i])
  return +(-Math.atan2(d(0), d(1)) * 180 / Math.PI).toFixed(1)
}
/** The waist line as a path, `dx` to the right. */
const waistLine = (dx = 0) => `M${WAIST.top[0] + dx} ${WAIST.top[1]}Q${WAIST.ctrl[0] + dx} ${WAIST.ctrl[1]} ${WAIST.bottom[0] + dx} ${WAIST.bottom[1]}`
/** A band `w` wide along the waist line, centred `dx` right of it. */
const waistBand = (w, dx = 0) => {
  const [l, r] = [dx - w / 2, dx + w / 2]
  return `${waistLine(l)}H${WAIST.bottom[0] + r}Q${WAIST.ctrl[0] + r} ${WAIST.ctrl[1]} ${WAIST.top[0] + r} ${WAIST.top[1]}Z`
}
/** Something fastened on the belt at `t`, drawn about its own 0,0 and turned with the belt. */
const onWaist = (t, inner, dx = 0) => { const [x, y] = waistAt(t, dx); return `<g transform="translate(${x} ${y}) rotate(${waistLean(t)})">${inner}</g>` }
const bodyClip = id => `<clipPath id="${id}"><path d="${P.body}"/></clipPath>`
/** Hides anything that would cross the near ear (the ear is nearer us than the waist). */
const earMask = id => `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="-60" width="400" height="400"><rect x="0" y="-60" width="400" height="400" fill="#fff"/><path d="${P.ear2}" fill="none" stroke="#000" stroke-width="15" stroke-linecap="round"/></mask>`
/** The belt itself, clipped to the body and tucked behind the ear. */
const belt = (key, inner) => `${bodyClip(`w-${key}-body`)}${earMask(`w-${key}-ear`)}
    <g mask="url(#w-${key}-ear)"><g clip-path="url(#w-${key}-body)">${inner}</g></g>`
/** Paints only outside the body: the far half of a hoop goes behind the pig. */
const behindBody = id => `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="-60" width="400" height="400"><rect x="0" y="-60" width="400" height="400" fill="#fff"/><path d="${P.body}" fill="#000"/></mask>`
/** A hoop round the waist, leaning like the belt: its near arc bows toward the rump. */
const HOOP = { cx: 246, cy: 138, tilt: -12 }
const HOOP_TILT = `rotate(${HOOP.tilt} ${HOOP.cx} ${HOOP.cy})`
const hoopArcs = (rx, ry) => ({
  near: `M${HOOP.cx} ${HOOP.cy - ry}A${rx} ${ry} 0 0 1 ${HOOP.cx} ${HOOP.cy + ry}`,
  far: `M${HOOP.cx} ${HOOP.cy - ry}A${rx} ${ry} 0 0 0 ${HOOP.cx} ${HOOP.cy + ry}`,
})
/** Where a point `(0, dy)` from the hoop's centre lands once the hoop leans. */
const hoopPoint = dy => {
  const a = HOOP.tilt * Math.PI / 180
  return [+(HOOP.cx - dy * Math.sin(a)).toFixed(1), +(HOOP.cy + dy * Math.cos(a)).toFixed(1)]
}
const studs = () => [.14, .28, .42, .56, .7].map(t => { const [x, y] = waistAt(t); return `<circle cx="${x}" cy="${y}" r="3.6" fill="#D9DCE3"/>` }).join('')

const WEAR = {
  bow: {
    slot: 'head', title: '蝴蝶结', note: '小猪耳朵上的粉色蝴蝶结。',
    svg: `<g transform="translate(86 50) rotate(-18)"><path d="M0 0L-22-12C-28-3-28 7-22 14Z" fill="#FF6F9A"/><path d="M0 0L22-12C28-3 28 7 22 14Z" fill="#FF6F9A"/><circle r="7" fill="#E9507F"/></g>`,
  },
  flatcap: {
    slot: 'head', title: '鸭舌帽', note: '中年猪的棕色鸭舌帽。',
    svg: hat(160, 56, `<path d="M118 62C124 34 166 22 200 34L204 52C176 46 146 52 118 62Z" fill="#8B6B4E"/><path d="M98 70Q116 56 140 58" fill="none" stroke="#6E5239" stroke-width="10"/>`),
  },
  mortarboard: {
    slot: 'head', title: '学士帽', note: '拿到毕业证才有的学位帽，流苏轻轻晃。',
    css: `.w-mortarboard-tassel{animation:w-mortarboard-swing 1.8s ease-in-out infinite;transform-origin:236px 52px}
    @keyframes w-mortarboard-swing{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(10deg)}}`,
    svg: hat(168, 72, `<path d="M126 58C124 76 200 82 208 62L206 48L130 52Z" fill="#3A3A48"/>
    <path d="M94 50L168 26L242 46L168 70Z" fill="#2E2E3A"/><circle cx="168" cy="48" r="5" fill="#F5C24C"/>
    <path d="M168 48L236 52" fill="none" stroke="#F5C24C" stroke-width="3"/>
    <g class="w-mortarboard-tassel"><path d="M236 52V84" fill="none" stroke="#F5C24C" stroke-width="4"/><rect x="230" y="82" width="12" height="16" rx="3" fill="#F5C24C"/></g>`),
  },
  strawhat: {
    slot: 'head', title: '草帽', note: '旅行时戴的草帽，系一圈红带子。',
    svg: hat(150, 58, `<ellipse cx="150" cy="54" rx="64" ry="14" fill="#E9C46A" transform="rotate(-14 150 54)"/>
    <path d="M118 58C110 26 172 10 182 42Z" fill="#F2D488"/><path d="M120 50L180 34" fill="none" stroke="#E5534B" stroke-width="7"/>`),
  },
  glasses: {
    slot: 'eyes', title: '圆眼镜', note: '上课戴的棕框圆眼镜。',
    svg: glasses('#7A5A3A'),
  },
  sunglasses: {
    slot: 'eyes', title: '墨镜', note: '从中东·非洲晒回来的墨镜。',
    svg: `<path d="M72 134h40v10a16 16 0 0 1-40 0ZM146 148h40v10a16 16 0 0 1-40 0Z" fill="#2E2E3A"/><path d="M112 138L146 152M72 136L58 130" fill="none" stroke="#2E2E3A" stroke-width="5"/>`,
  },
  // The pig has no neck: the scarf goes round its waist (see WAIST), knotted
  // low on the near side; the knot's two ends flutter.
  scarf: {
    slot: 'waist', title: '红领巾', note: '上小学系的红领巾，猪没有脖子，顺着身体绑在腰上。',
    css: `.w-scarf-ends{animation:w-scarf-flutter 2.4s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 0}
    @keyframes w-scarf-flutter{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(5deg)}}`,
    svg: `${belt('scarf', `<path d="${waistBand(22)}" fill="#E5534B"/><path d="${waistLine(8)}" fill="none" stroke="#C9433C" stroke-width="5"/>`)}
    ${onWaist(.8, `<g class="w-scarf-ends"><path d="M-6 2C-20 14-34 26-48 40L-14 50Z" fill="#E5534B"/><path d="M-6 4L-28 42" fill="none" stroke="#C9433C" stroke-width="3" stroke-linecap="round"/>
    <path d="M6 2C20 12 32 24 44 38L12 50Z" fill="#E5534B"/><path d="M6 4L24 42" fill="none" stroke="#C9433C" stroke-width="3" stroke-linecap="round"/></g>
    <ellipse rx="14" ry="12" fill="#C9433C"/><path d="M-7-4Q0-8 7-4" fill="none" stroke="#F07A72" stroke-width="3" stroke-linecap="round"/>`)}`,
  },
  // ---- [ST0012] waist gear sold in the shop: trends and old internet memes ----
  hulahoop: {
    slot: 'waist', title: '网红呼啦圈', note: '2021 年居家减肥的智能呼啦圈：配重球甩着转。',
    css: `.w-hulahoop-hoop{animation:w-hulahoop-wobble 1.2s ease-in-out infinite;transform-origin:${HOOP.cx}px ${HOOP.cy}px}
    .w-hulahoop-ball{animation:w-hulahoop-swing .6s ease-in-out infinite alternate;transform-origin:${hoopPoint(124).join('px ')}px}
    @keyframes w-hulahoop-wobble{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
    @keyframes w-hulahoop-swing{from{transform:rotate(-32deg)}to{transform:rotate(32deg)}}`,
    svg: `${behindBody('w-hulahoop-behind')}
    <g mask="url(#w-hulahoop-behind)"><g class="w-hulahoop-hoop"><g transform="${HOOP_TILT}"><path d="${hoopArcs(48, 124).far}" fill="none" stroke="#E0559A" stroke-width="11"/></g></g></g>
    <g class="w-hulahoop-hoop"><g transform="${HOOP_TILT}"><path d="${hoopArcs(48, 124).near}" fill="none" stroke="#FF6FAE" stroke-width="11"/>
    <path d="${hoopArcs(48, 124).near}" fill="none" stroke="#9B87F5" stroke-width="11" stroke-dasharray="16 16"/></g>
    <g class="w-hulahoop-ball"><path d="M${hoopPoint(124).join(' ')}v28" fill="none" stroke="#5B5F73" stroke-width="3"/><circle cx="${hoopPoint(124)[0]}" cy="${hoopPoint(124)[1] + 34}" r="10" fill="#9B87F5"/><circle cx="${hoopPoint(124)[0] - 4}" cy="${hoopPoint(124)[1] + 30}" r="3" fill="#D4CCFF"/></g></g>`,
  },
  swimring: {
    slot: 'waist', title: '小黄鸭游泳圈', note: '中年肚子上的「游泳圈」，这回是真的：一只小黄鸭。',
    css: `.w-swimring-duck{animation:w-swimring-bob 1.6s ease-in-out infinite;transform-origin:${hoopPoint(-106).join('px ')}px}
    @keyframes w-swimring-bob{0%,100%{transform:rotate(0)}50%{transform:rotate(-10deg)}}`,
    svg: `${behindBody('w-swimring-behind')}
    <g mask="url(#w-swimring-behind)"><g transform="${HOOP_TILT}"><path d="${hoopArcs(56, 106).far}" fill="none" stroke="#F2C230" stroke-width="30"/></g></g>
    <g transform="${HOOP_TILT}"><path d="${hoopArcs(56, 106).near}" fill="none" stroke="#FFD84D" stroke-width="30"/>
    <path d="M${HOOP.cx + 10} ${HOOP.cy - 94}A44 92 0 0 1 ${HOOP.cx + 44} ${HOOP.cy - 20}" fill="none" stroke="#FFF3B0" stroke-width="7" stroke-linecap="round"/></g>
    <g class="w-swimring-duck">${(([x, y]) => `<circle cx="${x - 10}" cy="${y - 18}" r="20" fill="#FFD84D"/><path d="M${x - 28} ${y - 20}L${x - 50} ${y - 14}L${x - 28} ${y - 8}Z" fill="#F5862E"/>
    <circle cx="${x - 16}" cy="${y - 24}" r="3.5" fill="#373A32"/>`)(hoopPoint(-106))}</g>`,
  },
  fannypack: {
    slot: 'waist', title: '多巴胺腰包', note: '2023 年 City Walk 的多巴胺撞色腰包。',
    css: `.w-fannypack-tab{animation:w-fannypack-jiggle 1.4s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 0}
    @keyframes w-fannypack-jiggle{0%,100%{transform:rotate(0)}50%{transform:rotate(18deg)}}`,
    svg: `${belt('fannypack', `<path d="${waistBand(12)}" fill="#7B61FF"/>`)}
    ${onWaist(.78, `<rect x="-30" y="-22" width="62" height="42" rx="18" fill="#FF8A3D"/>
    <rect x="-24" y="-4" width="50" height="20" rx="9" fill="#FFD23F"/>
    <path d="M-22-12H24" fill="none" stroke="#2E2E3A" stroke-width="3" stroke-linecap="round"/>
    <g class="w-fannypack-tab"><rect x="-25" y="-18" width="8" height="16" rx="3" fill="#3AC0B5"/></g>
    <circle cx="12" cy="6" r="5" fill="#FF6FAE"/>`)}`,
  },
  chainbelt: {
    slot: 'waist', title: '杀马特腰链', note: '2010 年前后非主流的铆钉腰带，挂一串叮当响的链子。',
    css: `.w-chainbelt-chain{animation:w-chainbelt-swing 1.3s ease-in-out infinite;transform-box:fill-box;transform-origin:0 0}
    @keyframes w-chainbelt-swing{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}`,
    svg: `${belt('chainbelt', `<path d="${waistBand(16)}" fill="#2E2E3A"/>${studs()}`)}
    ${onWaist(.8, `<g class="w-chainbelt-chain"><path d="M0 0Q12 52 40 18" fill="none" stroke="#C0C4CC" stroke-width="5" stroke-dasharray="6 4" stroke-linecap="round"/>
    <path d="M2 8Q0 70 50 30" fill="none" stroke="#C0C4CC" stroke-width="5" stroke-dasharray="6 4" stroke-linecap="round"/>
    <path d="M16 50c0-6 8-9 11-3 3-6 11-3 11 3 0 8-11 14-11 14s-11-6-11-14Z" fill="#E040A0"/></g>`)}`,
  },
  pager: {
    slot: 'waist', title: 'BP机皮带', note: '九十年代老板派头：大金扣皮带，腰上别一台 BP 机。',
    css: `.w-pager-lcd{animation:w-pager-beep 2.4s steps(1) infinite}
    @keyframes w-pager-beep{0%,60%,100%{fill:#A8C686}65%,75%,85%{fill:#E2F5C8}70%,80%{fill:#A8C686}}`,
    svg: `${belt('pager', `<path d="${waistBand(16)}" fill="#6B4A2E"/>
    ${onWaist(.6, `<rect x="-15" y="-13" width="30" height="26" rx="5" fill="#F5C24C"/><rect x="-9" y="-7" width="18" height="14" rx="3" fill="#D99A1E"/><path d="M0-11V11" fill="none" stroke="#FFE27A" stroke-width="3"/>`)}`)}
    ${onWaist(.82, `<rect x="-17" y="-13" width="34" height="26" rx="6" fill="#2E2E3A"/><rect class="w-pager-lcd" x="-12" y="-8" width="24" height="10" rx="2" fill="#A8C686"/>
    <circle cx="-8" cy="7" r="2.5" fill="#8A8F9E"/><circle cy="7" r="2.5" fill="#8A8F9E"/><circle cx="8" cy="7" r="2.5" fill="#8A8F9E"/>`)}`,
  },
  // [Q0016] 100 kg worked off at the gym. The body slot is drawn first, right on
  // the body: muscle lines in a deeper skin tone (round-capped strokes, like the
  // elder's brows), clipped to the outline so nothing spills; the shoulder flexes.
  muscle: {
    slot: 'body', title: '肌肉', note: '在健身房一共瘦掉 100 kg 练出来的一身肌肉：鼓起的肩膀、结实的后腿、六块腹肌，肩膀一鼓一鼓。',
    css: `.w-muscle-flex{animation:w-muscle-flex 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
    @keyframes w-muscle-flex{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}`,
    svg: `${bodyClip('w-muscle-body')}<g clip-path="url(#w-muscle-body)" stroke-linecap="round">
    <g transform="rotate(-10 254 184)" fill="#F4BC94"><rect x="232" y="152" width="20" height="17" rx="7"/><rect x="256" y="152" width="20" height="17" rx="7"/>
    <rect x="232" y="173" width="20" height="17" rx="7"/><rect x="256" y="173" width="20" height="17" rx="7"/>
    <rect x="233" y="194" width="18" height="15" rx="7"/><rect x="257" y="194" width="18" height="15" rx="7"/></g>
    <g class="w-muscle-flex"><path d="M190 240Q194 196 226 196" fill="none" stroke="#E9A47C" stroke-width="7"/>
    <ellipse cx="208" cy="212" rx="9" ry="14" fill="#FFE6D2" opacity=".8" transform="rotate(20 208 212)"/></g>
    <path d="M160 256Q173 265 186 256" fill="none" stroke="#E9A47C" stroke-width="6"/>
    <path d="M262 172Q302 164 316 204" fill="none" stroke="#E9A47C" stroke-width="7"/>
    <ellipse cx="292" cy="192" rx="13" ry="7" fill="#FFE6D2" opacity=".8" transform="rotate(20 292 192)"/>
    <path d="M276 232Q290 238 304 230" fill="none" stroke="#E9A47C" stroke-width="5"/></g>`,
  },
  // [Q0016] Held 10000 coins at once. The whole pig is cast in gold: the body,
  // the ears and the far leg, drawn over the pig's own; the eyes and the snout
  // are left as holes so every pose's expression (and the talking snout) shows
  // through. The near ear is redrawn in gold and flicks like the real one. The
  // shine is kept small: a thin highlight along the back, a dot on the rump,
  // and a narrow glint that sweeps the body now and then — invisible at rest,
  // so with motion reduced it never hangs across the pig. Two small sparkles
  // twinkle. The tail is left alone: a copy could not keep time with the poses
  // that wag it faster or not at all.
  gold: {
    slot: 'body', title: '黄金猪', note: '手里攒到过 10000 金币的黄金猪：浑身金灿灿，眼睛和粉鼻子不变，一道反光扫过身体，两颗星星一闪一闪。',
    css: `.w-gold-ear2{animation:w-gold-flick 5.2s ease-in-out infinite;transform-origin:205px 108px}
    .w-gold-glint{animation:w-gold-glint 4s ease-in-out infinite}
    .w-gold-star{animation:w-gold-twinkle 2.4s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    .w-gold-star2{animation:w-gold-twinkle 2.4s ease-in-out -1.2s infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes w-gold-flick{0%,80%,100%{transform:rotate(0)}85%{transform:rotate(-12deg)}90%{transform:rotate(4deg)}}
    @keyframes w-gold-glint{0%,72%{transform:translateX(-90px);opacity:0}76%{opacity:.85}96%{opacity:.85}100%{transform:translateX(260px);opacity:0}}
    @keyframes w-gold-twinkle{0%,100%{opacity:.15;transform:scale(.5)}50%{opacity:1;transform:scale(1)}}`,
    svg: `<mask id="w-gold-face" maskUnits="userSpaceOnUse" x="0" y="-60" width="400" height="400"><rect x="0" y="-60" width="400" height="400" fill="#fff"/>
    <path d="${P.eye1}" fill="#000"/><path d="${P.eye2}" fill="#000"/><path d="${P.snout}" fill="#000"/></mask>
    ${bodyClip('w-gold-body')}
    <path fill="#D99A1E" d="${P.farLeg}"/>
    <g mask="url(#w-gold-face)"><path fill="#F5C542" d="${P.body}"/><path fill="#F5C542" d="${P.earBase}"/>
    <g clip-path="url(#w-gold-body)"><path d="M116 86Q170 58 238 54" fill="none" stroke="#FFE27A" stroke-width="9" stroke-linecap="round"/>
    <ellipse cx="302" cy="104" rx="11" ry="5" fill="#FFE27A" transform="rotate(38 302 104)"/>
    <path d="M300 92C322 120 326 160 312 200" fill="none" stroke="#E0A82E" stroke-width="16" stroke-linecap="round"/>
    <path d="M100 250C150 262 220 250 262 228" fill="none" stroke="#E0A82E" stroke-width="12" stroke-linecap="round"/>
    <g class="w-gold-glint" opacity="0"><path d="M112 40L124 40L84 300L72 300Z" fill="#FFF6C8"/></g></g>
    ${cheeks(12, 7, '#F08A3C', '.45')}</g>
    <path d="${P.ear1}" fill="none" stroke="#C98A1C" stroke-width="10" stroke-linecap="round"/>
    <path class="w-gold-ear2" d="${P.ear2}" fill="none" stroke="#C98A1C" stroke-width="11" stroke-linecap="round"/>
    ${sparkle(262, 74, 9, '#FFF6C8', 'w-gold-star')}${sparkle(136, 98, 6, '#FFF6C8', 'w-gold-star2')}`,
  },
  whiskers: {
    slot: 'face', title: '白眉白胡子', note: '老年猪的灰眉毛和白胡子。',
    svg: `<path d="M77 122Q89 111 104 121M151 137Q164 127 179 138" fill="none" stroke="#ADADA5" stroke-width="8"/>
    <path d="M107 207C98 203 96 213 84 212C88 220 98 223 107 216C114 225 127 226 134 219C120 220 119 208 107 207Z" fill="#F8F4E8"/>
    <path d="M105 228Q116 233 128 230Q127 241 119 247L116 240L110 244Q107 236 105 228Z" fill="#F8F4E8"/>`,
  },
}
/** A decoration as it goes into a pose's wear slot: its own style, then its shapes. */
const wearMarkup = key => {
  const w = WEAR[key]
  return `<g class="w-${key}" data-wear="${key}" data-slot="${w.slot}">${w.css ? `<style>${w.css}</style>` : ''}
    ${w.svg}</g>`
}

// The little work desk most indoor poses stand at.
const DESK = `<rect x="28" y="252" width="170" height="12" rx="6" fill="#C69C6D"/>
    <rect x="38" y="264" width="12" height="36" rx="6" fill="#B0875A"/><rect x="176" y="264" width="12" height="36" rx="6" fill="#B0875A"/>`
// On the road: straw hat, backpack, the road sliding back under the feet.
// The dashes repeat every 120px, so one loop must slide exactly 120px or the
// road snaps back half a dash each time it restarts.
const TRIP_CSS = `.walk{animation:walk .5s ease-in-out infinite;transform-origin:190px 298px}
    .road{animation:road 1.6s linear infinite}
    .tail{animation-duration:.5s}
    @keyframes walk{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-8px) rotate(-1.5deg)}}
    @keyframes road{to{transform:translateX(120px)}}`
const TRIP_GEAR = `<path d="M236 58Q206 110 226 168" fill="none" stroke="#4E7FB0" stroke-width="9"/>
    <rect x="238" y="34" width="84" height="92" rx="26" fill="#6FA8DC" transform="rotate(8 280 80)"/>
    <rect x="248" y="86" width="64" height="32" rx="13" fill="#5A93C8" transform="rotate(8 280 80)"/>
    ${WEAR.strawhat.svg}`
const TRIP_ROAD = `<g class="road"><path d="M-60 300H0M60 300H120M180 300H240M300 300H360M420 300H480" fill="none" stroke="#D9CBB3" stroke-width="7" stroke-linecap="round"/></g>`
/** A trip to one region: the walking pig, plus that region's scenery. */
const trip = (title, note, { css = '', under = '', over = '', gear = '', back = '', wears = ['head'] }) => ({
  title, note, wears,
  css: `${TRIP_CSS}
    ${css}`,
  wrap: 'walk',
  pig: { face: TRIP_GEAR + gear, back },
  under: under + TRIP_ROAD,
  over,
})

// [ST0011] Scenery a region's drawing shares with one of its destinations.
const EIFFEL = `<g fill="none" stroke="#8C7A68" stroke-linecap="round"><path d="M56 -34V-14" stroke-width="4"/><path d="M56 -14C52 30 42 80 28 128M56 -14C60 30 70 80 84 128" stroke-width="6"/>
    <path d="M44 36H68M36 82H76" stroke-width="5"/><path d="M34 128Q56 96 78 128" stroke-width="5"/></g>`
const BAGUETTE = `<path d="M262 44L318 -22" fill="none" stroke="#D9A066" stroke-width="18" stroke-linecap="round"/>
    <path d="M280 14l8 6M292 0l8 6M304 -14l8 6" fill="none" stroke="#B9824A" stroke-width="4" stroke-linecap="round"/>`
const PYRAMIDS = `<path d="M190 44L240 -10L290 44Z" fill="#E9C98A"/><path d="M240 -10L290 44H254Z" fill="#D9B06C"/>
    <path d="M262 44L304 0L346 44Z" fill="#E9C98A"/><path d="M304 0L346 44H316Z" fill="#D9B06C"/>`
const HEAT = `<path class="heat" d="M30 280q6-8 0-16t0-16M46 284q6-8 0-16t0-16" fill="none" stroke="#F2D488" stroke-width="4" stroke-linecap="round"/>`
const OPERA = `<g fill="#E6ECF2"><path d="M210 44Q216 4 252 -8Q240 18 246 44Z"/><path d="M244 44Q256 -6 300 -20Q284 12 290 44Z"/><path d="M286 44Q300 6 336 0Q322 20 330 44Z"/></g>
    <g fill="#CBD5E0"><path d="M246 44Q240 18 252 -8L250 44Z"/><path d="M290 44Q284 12 300 -20L296 44Z"/><path d="M330 44Q322 20 336 0L334 44Z"/></g>
    <rect x="204" y="42" width="136" height="7" rx="3" fill="#C9CED6"/>`
const PENGUIN = `<g class="peng"><ellipse cx="44" cy="294" rx="8" ry="4" fill="#F5A23C"/><ellipse cx="58" cy="294" rx="8" ry="4" fill="#F5A23C"/>
    <ellipse cx="50" cy="266" rx="20" ry="28" fill="#3A3E52"/><ellipse cx="45" cy="272" rx="12" ry="20" fill="#FFFFFF"/>
    <circle cx="42" cy="250" r="4" fill="#FFFFFF"/><circle cx="41" cy="250" r="2" fill="#3A3E52"/><path d="M32 254L20 258L32 262Z" fill="#F5A23C"/></g>`
const SNOW = `<circle class="sn" cx="120" cy="-30" r="5" fill="#CFE6F5"/><circle class="sn2" cx="200" cy="-30" r="4" fill="#CFE6F5"/><circle class="sn3" cx="290" cy="-30" r="5" fill="#CFE6F5"/>`
const SNOW_CSS = `.peng{animation:waddle .5s ease-in-out infinite;transform-origin:44px 298px}
    .sn{animation:snow 3s linear infinite}.sn2{animation:snow 3s linear -1s infinite}.sn3{animation:snow 3s linear -2s infinite}
    @keyframes waddle{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
    @keyframes snow{0%{opacity:0;transform:translate(0,0)}10%{opacity:1}100%{opacity:0;transform:translate(-30px,300px)}}`
// Twinkling and blinking, shared by several skylines.
const TWINKLE_CSS = `.tw{animation:tw 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    .tw2{animation:tw 1.6s ease-in-out -.55s infinite;transform-box:fill-box;transform-origin:50% 50%}
    .tw3{animation:tw 1.6s ease-in-out -1.1s infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes tw{0%,100%{opacity:.1;transform:scale(.5)}50%{opacity:1;transform:scale(1)}}`
const BLINK_CSS = `.tip{animation:tip 1.2s steps(1) infinite}
    @keyframes tip{50%{opacity:.2}}`
// Papel picado for Mexico City: little cut-paper flags along a sagging string.
const PAPEL = [44, 84, 124, 164, 204, 244, 284, 324].map((x, i) => {
  const t = (x - 24) / 336
  const y = +(-30 + 48 * t * (1 - t)).toFixed(1)
  const fill = ['#FF6F9A', '#F5A23C', '#3FB8AF', '#FFD35A', '#8C6BB1'][i % 5]
  return `<g class="pp${i % 2 === 0 ? '' : '2'}"><path d="M${x - 10} ${y}h20v22l-5-4-5 4-5-4-5 4Z" fill="${fill}"/><circle cx="${x}" cy="${y + 9}" r="3" fill="#FFFFFF"/></g>`
}).join('')

// ---------------------------------------------------------------------------
// Sprites. `css` animates; `under` sits behind the pig, `over` in front;
// `wrap` names the class on the group holding the pig (+ its own props).
// ---------------------------------------------------------------------------
const SPRITES = {
  // ---- stages: the same pig, only accessories ----
  'stage-piglet': {
    title: '小猪', note: '刚出纸盒：走两步颠一下（蝴蝶结是装饰 wear-bow）。',
    css: `.hop{animation:hop 1.4s ease-in-out infinite;transform-origin:190px 298px}
    @keyframes hop{0%,100%{transform:translateY(0) scale(1,1)}45%{transform:translateY(-10px) scale(.98,1.02)}70%{transform:translateY(0) scale(1.03,.97)}}`,
    wrap: 'hop',
  },
  'stage-young': {
    title: '青年猪', note: '原版那只猪：呼吸、眨眼、甩尾巴。',
    css: `.breathe{animation:breathe 2.6s ease-in-out infinite;transform-origin:190px 298px}
    @keyframes breathe{50%{transform:scale(1.015,.975)}}`,
    wrap: 'breathe',
  },
  'stage-middle': {
    title: '中年猪', note: '同一只猪，呼吸慢一点（鸭舌帽是装饰 wear-flatcap）。',
    css: `.breathe{animation:breathe 3.2s ease-in-out infinite;transform-origin:190px 298px}
    @keyframes breathe{50%{transform:scale(1.02,.97)}}`,
    wrap: 'breathe',
  },
  'stage-elder': {
    title: '老年猪', note: '同一只猪：拄一根小拐杖，偶尔点头打盹（白眉白胡子是装饰 wear-whiskers）。',
    css: `.nod{animation:nod 6s ease-in-out infinite;transform-origin:190px 298px}
    .cane{animation:tap 4s ease-in-out infinite;transform-origin:44px 298px}
    @keyframes nod{0%,60%,100%{transform:rotate(0)}72%{transform:rotate(-3deg) translateY(3px)}84%{transform:rotate(0)}}
    @keyframes tap{50%{transform:rotate(-3deg)}}`,
    wrap: 'nod',
    over: `<path class="cane" d="M40 298V226C40 206 66 206 66 226" fill="none" stroke="#A8764C" stroke-width="10"/>`,
  },
  'soul': {
    title: '灵魂', note: '还是那只猪，变得半透明，头顶光环，飘着。',
    css: `.float{animation:float 3.4s ease-in-out infinite}
    .halo{animation:glow 1.7s ease-in-out infinite}
    .sp{animation:twinkle 1.7s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    .sp2{animation:twinkle 1.7s ease-in-out -.85s infinite;transform-box:fill-box;transform-origin:50% 50%}
    .ghost{opacity:.6}
    @keyframes float{0%,100%{transform:translateY(6px)}50%{transform:translateY(-12px)}}
    @keyframes glow{50%{opacity:.5}}
    @keyframes twinkle{0%,100%{opacity:0;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}`,
    wrap: 'float ghost', dress: false,
    pig: { eyes: 'closed' },
    over: `<g class="float"><ellipse class="halo" cx="160" cy="16" rx="52" ry="13" fill="none" stroke="#F5D76E" stroke-width="10"/></g>
    ${sparkle(52, 40, 18, '#FFE27A', 'sp')}${sparkle(344, 180, 14, '#FFE27A', 'sp2')}`,
  },

  // ---- moods ----
  'mood-happy': {
    title: '开心', note: '眯眼笑，原地蹦跶，冒小心心。',
    css: `.hop{animation:hop .9s ease-in-out infinite;transform-origin:190px 298px}
    .tail{animation-duration:.45s}
    .h1{animation:rise 1.8s ease-out infinite;transform-box:fill-box;transform-origin:50% 100%}
    .h2{animation:rise 1.8s ease-out -.9s infinite;transform-box:fill-box;transform-origin:50% 100%}
    @keyframes hop{0%,100%{transform:translateY(0) scale(1.03,.97)}40%,60%{transform:translateY(-22px) scale(.98,1.02)}}
    @keyframes rise{0%{opacity:0;transform:translateY(14px) scale(.5)}25%{opacity:1}100%{opacity:0;transform:translateY(-24px) scale(1)}}`,
    wrap: 'hop',
    pig: { eyes: 'happy' },
    over: heart(250, -10, 1.2, '#FF7A93', 'h1') + heart(300, 10, .9, '#FF9FB0', 'h2'),
  },
  'mood-hungry-2': {
    title: '饿了 · 二级', note: '抬头盯着想象中的胡萝卜，口水往下滴，肚子咕咕叫。',
    css: `.look{animation:look 2.4s ease-in-out infinite;transform-origin:190px 298px}
    .drool{animation:drip 2.4s ease-in infinite;transform-box:fill-box;transform-origin:50% 0}
    .think{animation:dream 2.4s ease-in-out infinite}
    .growl{animation:growl 1.2s ease-in-out infinite}
    @keyframes look{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(-4deg)}}
    @keyframes drip{0%{transform:scaleY(.3);opacity:0}10%,30%{transform:scaleY(.3);opacity:1}80%{transform:scaleY(1.4);opacity:1}100%{transform:scaleY(1.4) translateY(10px);opacity:0}}
    @keyframes dream{50%{transform:translateY(-6px)}}
    @keyframes growl{0%,100%{opacity:0}30%,60%{opacity:1}}`,
    wrap: 'look',
    pig: { face: drop(112, 212, 1.3, '#9FD8F0', 'drool') },
    under: `<g class="think"><circle cx="150" cy="40" r="7" fill="#EAE3D8"/><circle cx="176" cy="16" r="11" fill="#EAE3D8"/>
    <ellipse cx="250" cy="-6" rx="56" ry="34" fill="#F3EDE4"/>
    <path d="M226 14L268-22" fill="none" stroke="#F49A4A" stroke-width="16" stroke-linecap="round"/>
    <path d="M268-22L276-34M268-22L284-24M268-22L272-36" fill="none" stroke="#7DBF6A" stroke-width="6" stroke-linecap="round"/></g>`,
    over: `<path class="growl" d="M250 178q7-7 14 0t14 0M256 196q7-7 14 0t14 0" fill="none" stroke="#E8A882" stroke-width="5" stroke-linecap="round"/>`,
  },
  'mood-dirty-2': {
    title: '该洗澡了 · 二级', note: '身上沾了泥点，一只苍蝇绕着飞，屁股后面一坨便便。',
    css: `.itch{animation:itch 3s ease-in-out infinite;transform-origin:190px 298px}
    .fly{animation:orbit 2.2s linear infinite;transform-origin:250px 70px}
    .wing{animation:buzz .12s linear infinite;transform-box:fill-box;transform-origin:50% 100%}
    .stink{animation:stink 2s ease-in-out infinite}
    @keyframes itch{0%,70%,100%{transform:rotate(0)}76%{transform:rotate(-1.5deg)}82%{transform:rotate(1.5deg)}88%{transform:rotate(-.8deg)}}
    @keyframes orbit{to{transform:rotate(360deg)}}
    @keyframes buzz{50%{transform:scaleY(.4)}}
    @keyframes stink{0%,100%{opacity:0;transform:translateY(8px)}50%{opacity:.9;transform:translateY(-6px)}}`,
    wrap: 'itch',
    pig: { face: `<path d="M226 76c16-6 32 2 30 15s-22 12-32 6-12-19 2-21Z" fill="#B88A63"/>
    <path d="M276 160c11-3 22 4 20 13s-14 11-22 6-9-17 2-19Z" fill="#B88A63"/>
    <ellipse cx="200" cy="210" rx="11" ry="7" fill="#B88A63"/><circle cx="250" cy="122" r="5" fill="#B88A63"/>
    <path d="M158 278h30v6a15 15 0 0 1-30 0Z" fill="#B88A63"/>` },
    under: `<path d="M330 298c-13 0-18-8-13-13-5-6 0-13 8-13-3-8 5-13 11-11 8 0 13 5 11 11 8 0 13 8 8 13 5 5 0 13-13 13Z" fill="#8A5A3B"/>
    <path class="stink" d="M326 256q-7-10 0-20t0-20M344 256q-7-10 0-20" fill="none" stroke="#A9C98A" stroke-width="5" stroke-linecap="round"/>`,
    over: `<g class="fly"><g transform="translate(250 0)"><ellipse class="wing" cx="-6" cy="-8" rx="6" ry="9" fill="#DDEFF7"/><ellipse class="wing" cx="6" cy="-8" rx="6" ry="9" fill="#DDEFF7"/><circle r="7" fill="#3E3A35"/></g></g>`,
  },
  'mood-sleepy': {
    title: '睡着了', note: '站着打盹：闭眼，鼻涕泡一鼓一缩，头顶飘 Z。',
    css: `.breathe{animation:breathe 3.6s ease-in-out infinite;transform-origin:190px 298px}
    .tail{animation:none}.ear2{animation:none}
    .bubble{animation:bubble 3.6s ease-in-out infinite;transform-box:fill-box;transform-origin:100% 50%}
    .z1{animation:z 3.6s ease-out infinite}.z2{animation:z 3.6s ease-out -1.2s infinite}.z3{animation:z 3.6s ease-out -2.4s infinite}
    @keyframes breathe{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.025,.97) rotate(1deg)}}
    @keyframes bubble{0%,100%{transform:scale(.3)}50%{transform:scale(1)}}
    @keyframes z{0%{opacity:0;transform:translate(0,14px)}30%{opacity:1}100%{opacity:0;transform:translate(24px,-36px)}}`,
    wrap: 'breathe',
    pig: { eyes: 'closed', face: `<circle class="bubble" cx="62" cy="190" r="18" fill="#CFEAF7" opacity=".85"/>` },
    over: `<g fill="none" stroke="#8C9BC4" stroke-linecap="round" stroke-linejoin="round">
    <path class="z1" d="M150 50h18l-18 20h18" stroke-width="6"/>
    <path class="z2" d="M188 24h22l-22 24h22" stroke-width="7"/>
    <path class="z3" d="M230 0h26l-26 28h26" stroke-width="8"/></g>`,
  },
  // [dsh-piggy-claude-code mod] Really asleep (put to bed, or the computer slept):
  // unlike the dozing pose above, it is tucked in for the night.
  'mood-asleep': {
    title: '在睡觉', note: '真的睡了：戴着睡帽、盖着小被子，呼吸很慢，被子跟着起伏，睡帽的绒球一晃一晃，头顶飘 Z，身后一弯月亮。',
    css: `.breathe{animation:breathe 4.4s ease-in-out infinite;transform-origin:190px 298px}
    .tail{animation:none}.ear2{animation:none}
    .pom{animation:pom 4.4s ease-in-out infinite}
    .z1{animation:z 4.4s ease-out infinite}.z2{animation:z 4.4s ease-out -1.47s infinite}.z3{animation:z 4.4s ease-out -2.93s infinite}
    .moon{animation:glow 4.4s ease-in-out infinite}
    .sp{animation:twinkle 2.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    .sp2{animation:twinkle 2.2s ease-in-out -1.1s infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.02,.965)}}
    @keyframes pom{50%{transform:translateY(6px)}}
    @keyframes z{0%{opacity:0;transform:translate(0,14px)}30%{opacity:1}100%{opacity:0;transform:translate(24px,-36px)}}
    @keyframes glow{50%{opacity:.65}}
    @keyframes twinkle{0%,100%{opacity:0;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}`,
    wrap: 'breathe', wears: ['head'],
    pig: {
      eyes: 'closed',
      face: `<path d="M110 72C120 30 170 4 222 12C250 16 266 34 270 58C252 46 236 42 214 46Z" fill="#7E9BD8"/>
    <path d="M150 36C170 24 196 18 220 20" fill="none" stroke="#A9BDEA" stroke-width="7"/>
    <path d="M106 76Q160 50 216 44" fill="none" stroke="#F8F4E8" stroke-width="18"/>
    <circle class="pom" cx="272" cy="62" r="13" fill="#F8F4E8"/>
    <path d="M36 300V236C36 222 48 214 64 216C130 224 250 222 318 212C334 210 344 220 344 234V300Z" fill="#A9C7F0"/>
    <path d="M42 232C110 242 250 240 338 226" fill="none" stroke="#DCE9FA" stroke-width="14"/>
    <g fill="#FFFFFF" opacity=".7"><circle cx="90" cy="266" r="6"/><circle cx="150" cy="282" r="5"/><circle cx="206" cy="262" r="6"/><circle cx="262" cy="284" r="5"/><circle cx="306" cy="258" r="6"/></g>`,
    },
    under: `<path class="moon" d="M74 -26a32 32 0 1 0 28 48a26 26 0 1 1 -28 -48Z" fill="#F5D76E"/>
    ${sparkle(30, 66, 11, '#FFE27A', 'sp')}${sparkle(116, -18, 9, '#FFE27A', 'sp2')}`,
    over: `<g fill="none" stroke="#8C9BC4" stroke-linecap="round" stroke-linejoin="round">
    <path class="z1" d="M284 28h18l-18 20h18" stroke-width="6"/>
    <path class="z2" d="M308 -2h22l-22 24h22" stroke-width="7"/>
    <path class="z3" d="M330 -32h24l-24 26h24" stroke-width="8"/></g>`,
  },
  'mood-lonely-2': {
    title: '孤单 · 二级', note: '眼眶含着泪（参考 sample 里的含泪猪），一滴一滴往下掉，头顶一小朵乌云。',
    css: `.sway{animation:sway 4s ease-in-out infinite;transform-origin:190px 298px}
    .tail{animation:none}.ear2{animation:none}
    .t1{animation:drop 2.4s ease-in infinite}.t2{animation:drop 2.4s ease-in -1.2s infinite}
    .cloud{animation:drift 4s ease-in-out infinite}
    .rain{animation:rain 1s linear infinite}
    @keyframes sway{0%,100%{transform:rotate(1deg)}50%{transform:rotate(3deg) translateY(2px)}}
    @keyframes drop{0%,40%{opacity:0;transform:translateY(0)}50%{opacity:1}100%{opacity:0;transform:translateY(36px)}}
    @keyframes drift{50%{transform:translateX(8px)}}
    @keyframes rain{0%{opacity:0;transform:translateY(0)}30%{opacity:1}100%{opacity:0;transform:translateY(22px)}}`,
    wrap: 'sway',
    pig: { face: `<path d="M82 158Q91 162 100 158M156 173Q165 177 174 173" fill="none" stroke="#6EC3EA" stroke-width="6" stroke-linecap="round"/>
    ${drop(100, 160, 1.2, '#6EC3EA', 't1')}${drop(174, 175, 1.2, '#6EC3EA', 't2')}` },
    over: `<g class="cloud"><path d="M106 22a22 22 0 0 1 40-14 26 26 0 0 1 48 8 18 18 0 0 1-2 36H112a20 20 0 0 1-6-30Z" fill="#B9C0CC"/>
    <path class="rain" d="M128 64v12M152 64v12M176 64v12" fill="none" stroke="#8FB6D8" stroke-width="5" stroke-linecap="round"/></g>`,
  },
  'mood-sick-2': {
    title: '生病 · 二级', note: '额头搭湿毛巾，嘴里叼体温计，脸烧得通红，时不时打哆嗦。',
    css: `.shiver{animation:shiver 2.2s ease-in-out infinite;transform-origin:190px 298px}
    .tail{animation:none}
    .heat{animation:heat 2.2s ease-in-out infinite}
    @keyframes shiver{0%,60%,100%{transform:translateX(0)}64%{transform:translateX(-4px) rotate(-1deg)}68%{transform:translateX(4px) rotate(.8deg)}72%{transform:translateX(-2px)}}
    @keyframes heat{0%,100%{opacity:.2;transform:translateY(6px)}50%{opacity:1;transform:translateY(-6px)}}`,
    wrap: 'shiver',
    pig: {
      blush: cheeks(22, 12, '#FF6F6F', '.4'),
      face: `<path d="M70 104L178 116L174 136L66 124Z" fill="#9FD3E6"/>
    <path d="M90 110v10M112 112v10M134 115v10M156 117v10" fill="none" stroke="#7FBFD6" stroke-width="4" stroke-linecap="round"/>
    <path d="M78 214L36 238" fill="none" stroke="#F4F6F8" stroke-width="11" stroke-linecap="round"/>
    <path d="M58 226L36 238" fill="none" stroke="#E5534B" stroke-width="5" stroke-linecap="round"/>`,
    },
    over: `<path class="heat" d="M110 60q-8-10 0-20t0-20M140 54q-8-10 0-20t0-20" fill="none" stroke="#FFB0A0" stroke-width="6" stroke-linecap="round"/>`,
  },

  // ---- the same four moods, one level milder and one level worse ----
  'mood-hungry-1': {
    title: '饿了 · 一级', note: '有点饿：肚子咕咕叫，左右张望找吃的。',
    css: `.look{animation:scan 3.2s ease-in-out infinite;transform-origin:190px 298px}
    .growl{animation:growl 1.6s ease-in-out infinite}
    @keyframes scan{0%,100%{transform:rotate(0)}30%{transform:rotate(-2.5deg)}65%{transform:rotate(1.5deg)}}
    @keyframes growl{0%,100%{opacity:.35}30%,60%{opacity:1}}`,
    wrap: 'look',
    over: `<path class="growl" d="M252 186q6-6 12 0t12 0" fill="none" stroke="#E8A882" stroke-width="5" stroke-linecap="round"/>`,
  },
  'mood-hungry-3': {
    title: '饿了 · 三级', note: '饿坏了：饿得头晕眼冒金星，打翻的空碗，走路发飘、肚子大声叫。',
    css: `.wobble{animation:wobble 2.6s ease-in-out infinite;transform-origin:190px 298px}
    .tail{animation:none}.ear2{animation:none}
    .stars{animation:orbit 1.8s linear infinite;transform-origin:130px 40px}
    .growl{animation:growl .8s ease-in-out infinite}
    .sweat{animation:slide 2.6s ease-in infinite}
    @keyframes wobble{0%,100%{transform:rotate(1deg) translateY(2px)}25%{transform:rotate(-2.5deg)}50%{transform:rotate(2deg) translateY(4px)}75%{transform:rotate(-1deg)}}
    @keyframes orbit{to{transform:rotate(360deg)}}
    @keyframes growl{0%,100%{opacity:.2;transform:translateX(0)}50%{opacity:1;transform:translateX(4px)}}
    @keyframes slide{0%,30%{opacity:0;transform:translateY(0)}45%{opacity:1}100%{opacity:0;transform:translateY(24px)}}`,
    wrap: 'wobble',
    pig: { face: drop(64, 118, 1.6, '#9FD8F0', 'sweat') },
    under: `<g class="stars">${sparkle(130, -6, 16, '#FFD35A', '')}${sparkle(176, 56, 12, '#FFD35A', '')}${sparkle(86, 64, 12, '#FFD35A', '')}</g>`,
    over: `<path class="growl" d="M246 172q8-8 16 0t16 0t16 0M252 194q8-8 16 0t16 0t16 0" fill="none" stroke="#E07B5A" stroke-width="6" stroke-linecap="round"/>
    <path d="M40 298C40 270 70 258 98 258S156 270 156 298Z" fill="#7FB3D5"/><ellipse cx="98" cy="260" rx="40" ry="8" fill="#9CC7E0"/>`,
  },
  'mood-dirty-1': {
    title: '该洗澡了 · 一级', note: '有点脏：身上两块泥点，时不时蹭一下痒。',
    css: `.itch{animation:itch 3.4s ease-in-out infinite;transform-origin:190px 298px}
    @keyframes itch{0%,75%,100%{transform:rotate(0)}80%{transform:rotate(-1.2deg)}86%{transform:rotate(1.2deg)}}`,
    wrap: 'itch',
    pig: { face: `<path d="M276 160c11-3 22 4 20 13s-14 11-22 6-9-17 2-19Z" fill="#C9A07D"/><circle cx="250" cy="122" r="5" fill="#C9A07D"/>` },
  },
  'mood-dirty-3': {
    title: '该洗澡了 · 三级', note: '脏透了：浑身是泥站在泥坑里，三只苍蝇围着转，臭气一阵阵往上冒。',
    css: `.itch{animation:itch 1.6s ease-in-out infinite;transform-origin:190px 298px}
    .fly{animation:orbit 2.2s linear infinite;transform-origin:220px 90px}
    .fly2{animation:orbit 1.7s linear -.6s infinite reverse;transform-origin:200px 110px}
    .fly3{animation:orbit 2.6s linear -1.3s infinite;transform-origin:260px 120px}
    .wing{animation:buzz .12s linear infinite;transform-box:fill-box;transform-origin:50% 100%}
    .stink{animation:stink 2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}.stink2{animation:stink 2s ease-in-out -1s infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes itch{0%,50%,100%{transform:rotate(0)}60%{transform:rotate(-2deg)}70%{transform:rotate(2deg)}80%{transform:rotate(-1deg)}}
    @keyframes orbit{to{transform:rotate(360deg)}}
    @keyframes buzz{50%{transform:scaleY(.4)}}
    @keyframes stink{0%,100%{opacity:0;transform:translateY(10px) scale(.8)}50%{opacity:.85;transform:translateY(-10px) scale(1)}}`,
    wrap: 'itch',
    pig: { face: `<path d="M226 76c16-6 32 2 30 15s-22 12-32 6-12-19 2-21Z" fill="#9C7150"/>
    <path d="M276 160c11-3 22 4 20 13s-14 11-22 6-9-17 2-19Z" fill="#9C7150"/>
    <path d="M150 84c10-4 22 0 20 9s-14 10-20 6-8-12 0-15Z" fill="#9C7150"/>
    <path d="M58 140c8-2 14 4 12 10s-10 6-14 2-4-11 2-12Z" fill="#9C7150"/>
    <ellipse cx="200" cy="210" rx="14" ry="9" fill="#9C7150"/><circle cx="250" cy="122" r="6" fill="#9C7150"/><circle cx="296" cy="100" r="5" fill="#9C7150"/>
    <path d="M86 258h37v14a18 18 0 0 1-37 0ZM152 262h39v20a19 19 0 0 1-39 0ZM269 236h39v6a19 19 0 0 1-39 0Z" fill="#9C7150"/>` },
    under: `<ellipse cx="200" cy="298" rx="150" ry="14" fill="#8A6A4D"/>
    <g class="stink"><circle cx="300" cy="40" r="16" fill="#C5DCA8"/><circle cx="318" cy="30" r="12" fill="#C5DCA8"/></g>
    <g class="stink2"><circle cx="70" cy="60" r="13" fill="#C5DCA8"/><circle cx="56" cy="48" r="10" fill="#C5DCA8"/></g>
    <path d="M336 298c-15 0-21-9-15-15-6-7 0-15 9-15-3-9 6-15 13-13 9 0 15 6 13 13 9 0 15 9 9 15 6 6 0 15-15 15Z" fill="#7A4C30"/>`,
    over: [['fly', 220, 20], ['fly2', 200, 50], ['fly3', 260, 60]].map(([c, x, y]) =>
      `<g class="${c}"><g transform="translate(${x} ${y})"><ellipse class="wing" cx="-6" cy="-8" rx="6" ry="9" fill="#DDEFF7"/><ellipse class="wing" cx="6" cy="-8" rx="6" ry="9" fill="#DDEFF7"/><circle r="7" fill="#3E3A35"/></g></g>`).join(''),
  },
  'mood-lonely-1': {
    title: '孤单 · 一级', note: '有点闷：叹一口气，头顶冒个省略号。',
    css: `.sway{animation:sway 4.4s ease-in-out infinite;transform-origin:190px 298px}
    .sigh{animation:sigh 4.4s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    .dots{animation:dots 4.4s ease-in-out infinite}
    @keyframes sway{0%,100%{transform:rotate(0)}50%{transform:rotate(1.5deg) translateY(1px)}}
    @keyframes sigh{0%,40%{opacity:0;transform:translate(0,0) scale(.6)}55%{opacity:.9}100%{opacity:0;transform:translate(-26px,8px) scale(1.2)}}
    @keyframes dots{0%,20%,100%{opacity:.35}35%,85%{opacity:1}}`,
    wrap: 'sway',
    over: `<g class="sigh"><circle cx="54" cy="206" r="10" fill="#E6EEF4"/><circle cx="40" cy="214" r="7" fill="#E6EEF4"/></g>
    <g class="dots" fill="#A7A39B"><circle cx="150" cy="24" r="7"/><circle cx="174" cy="24" r="7"/><circle cx="198" cy="24" r="7"/></g>`,
  },
  'mood-lonely-3': {
    title: '孤单 · 三级', note: '伤心大哭：眼泪成两道小瀑布，脚下积了一摊泪，头顶乌云打雷下大雨。',
    css: `.sob{animation:sob .9s ease-in-out infinite;transform-origin:190px 298px}
    .tail{animation:none}.ear2{animation:none}
    .stream{animation:stream .5s linear infinite}
    .rain{animation:rain .6s linear infinite}
    .bolt{animation:bolt 2.4s steps(1) infinite}
    .puddle{animation:puddle 2.4s ease-in-out infinite;transform-origin:150px 298px}
    @keyframes sob{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(3px) scale(1.01,.98)}}
    @keyframes stream{to{stroke-dashoffset:-24}}
    @keyframes rain{0%{opacity:0;transform:translateY(0)}30%{opacity:1}100%{opacity:0;transform:translateY(34px)}}
    @keyframes bolt{0%,70%,80%,100%{opacity:0}72%,78%{opacity:1}}
    @keyframes puddle{50%{transform:scaleX(1.08)}}`,
    wrap: 'sob',
    pig: { face: `<path d="M82 158Q91 163 100 158M156 173Q165 178 174 173" fill="none" stroke="#6EC3EA" stroke-width="7" stroke-linecap="round"/>
    <path class="stream" d="M98 160C104 200 96 240 104 290M172 175C178 210 172 250 178 290" fill="none" stroke="#7FCDEE" stroke-width="9" stroke-linecap="round" stroke-dasharray="14 10"/>` },
    under: `<ellipse class="puddle" cx="150" cy="298" rx="100" ry="10" fill="#BFE6F6"/>`,
    over: `<path d="M86 30a28 28 0 0 1 50-18 32 32 0 0 1 60 10 22 22 0 0 1-2 44H94a26 26 0 0 1-8-36Z" fill="#9AA2B0"/>
    <path class="bolt" d="M156 76l-12 24h14l-10 22" fill="none" stroke="#FFD35A" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path class="rain" d="M104 80v14M128 80v14M184 80v14M204 80v14" fill="none" stroke="#8FB6D8" stroke-width="5" stroke-linecap="round"/>`,
  },
  'mood-sick-1': {
    title: '生病 · 一级', note: '有点不舒服：脸微微发红，隔一会儿打个喷嚏，一滴鼻涕飞出去。',
    css: `.sneeze{animation:sneeze 3.2s ease-in-out infinite;transform-origin:190px 298px}
    .spray{animation:spray 3.2s ease-out infinite}
    @keyframes sneeze{0%,55%,100%{transform:rotate(0)}65%{transform:rotate(2deg) translateY(-2px)}72%{transform:rotate(-4deg) translateX(-6px)}80%{transform:rotate(0)}}
    @keyframes spray{0%,70%{opacity:0;transform:translate(0,0)}74%{opacity:1}100%{opacity:0;transform:translate(-30px,6px)}}`,
    wrap: 'sneeze',
    pig: { blush: cheeks(16, 9, '#FF7F7F', '.35') },
    over: `<g class="spray">${drop(60, 196, 1.2, '#CDEBA8', '')}<path d="M48 176l-12-6M46 190l-14 0" fill="none" stroke="#D8D2C6" stroke-width="5" stroke-linecap="round"/></g>`,
  },
  'mood-sick-3': {
    title: '生病 · 三级', note: '病重：闭着眼蔫蔫地晃，头上压着冰袋，旁边吊着点滴，冒冷汗、眼前打转。',
    css: `.droop{animation:droop 3.6s ease-in-out infinite;transform-origin:190px 298px}
    .tail{animation:none}.ear2{animation:none}
    .swirl{animation:spin 2.4s linear infinite;transform-box:fill-box;transform-origin:50% 50%}
    .drip{animation:drip 1.6s ease-in infinite}
    .sweat{animation:slide 2.4s ease-in infinite}.sweat2{animation:slide 2.4s ease-in -1.2s infinite}
    @keyframes droop{0%,100%{transform:rotate(1.5deg) translateY(2px)}50%{transform:rotate(3.5deg) translateY(5px)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes drip{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(30px)}}
    @keyframes slide{0%,20%{opacity:0;transform:translateY(0)}40%{opacity:1}100%{opacity:0;transform:translateY(28px)}}`,
    wrap: 'droop', wears: ['head'],
    pig: {
      eyes: 'closed',
      blush: cheeks(20, 11, '#B9C6E8', '.45'),
      face: `<path d="M86 92C96 70 150 66 168 88C158 108 98 112 86 92Z" fill="#CDEBF7"/>
    <path d="M110 78l8 8M134 76l6 8" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
    <path d="M128 66V54" fill="none" stroke="#7FBFD6" stroke-width="6" stroke-linecap="round"/>
    ${drop(66, 120, 1.4, '#9FD8F0', 'sweat')}${drop(186, 128, 1.2, '#9FD8F0', 'sweat2')}`,
    },
    under: `<path d="M352 300V10M332 10H356" fill="none" stroke="#B5BCC6" stroke-width="7" stroke-linecap="round"/>
    <rect x="322" y="14" width="30" height="44" rx="10" fill="#E3F2FA"/><rect x="326" y="34" width="22" height="20" rx="6" fill="#BFE0F0"/>
    <path d="M336 58C336 110 330 160 320 200" fill="none" stroke="#D4E6F0" stroke-width="4"/>
    <g class="drip"><circle cx="337" cy="66" r="4" fill="#9FD3E6"/></g>`,
    over: `<path class="swirl" d="M130 18a10 10 0 1 1 10 10 16 16 0 1 1-16-16 22 22 0 1 1 22 22" fill="none" stroke="#B49CD8" stroke-width="5" stroke-linecap="round"/>`,
  },

  // ---- away ----
  'away-work': {
    title: '打工', note: '站在小桌前对着笔记本，头一点一点地敲键盘；桌角一杯热咖啡。',
    css: `.type{animation:type .35s ease-in-out infinite;transform-origin:190px 298px}
    .keys{animation:keys .35s steps(2) infinite}
    .steam{animation:steam 2s ease-in-out infinite}
    @keyframes type{50%{transform:translateY(3px) rotate(.8deg)}}
    @keyframes keys{50%{opacity:0}}
    @keyframes steam{0%,100%{opacity:0;transform:translateY(6px)}50%{opacity:.9;transform:translateY(-6px)}}`,
    wrap: 'type',
    over: `<rect x="28" y="252" width="170" height="12" rx="6" fill="#C69C6D"/>
    <rect x="38" y="264" width="12" height="36" rx="6" fill="#B0875A"/><rect x="176" y="264" width="12" height="36" rx="6" fill="#B0875A"/>
    <path d="M36 250L46 214H112L104 250Z" fill="#B9C2CC"/>
    <ellipse cx="76" cy="232" rx="9" ry="6" fill="#D5DCE3"/>
    <rect x="34" y="246" width="96" height="8" rx="4" fill="#98A3AE"/>
    <path class="keys" d="M118 236l8-6M124 244l10-2" fill="none" stroke="#9FA9B4" stroke-width="4" stroke-linecap="round"/>
    <path class="steam" d="M156 214q-5-7 0-14t0-14M170 214q-5-7 0-14" fill="none" stroke="#D8CFC2" stroke-width="4" stroke-linecap="round"/>
    <path d="M148 222H178V246C178 250 175 252 171 252H155C151 252 148 250 148 246Z" fill="#FFFFFF"/>
    <path d="M178 228C190 228 190 244 178 244" fill="none" stroke="#FFFFFF" stroke-width="5"/>`,
  },
  // [Q0016] the gym (action 'gym'): one pose for every class.
  'away-gym': {
    title: '健身', note: '在跑步机上一颠一颠地跑，传送带往后滑，汗珠往外甩；扶手上的小屏幕一闪一闪地数步数。',
    css: `.jog{animation:jog .4s ease-in-out infinite;transform-origin:190px 298px}
    .belt{animation:belt .8s linear infinite}
    .tail{animation-duration:.4s}
    .s1{animation:fling 1.2s ease-out infinite}.s2{animation:fling 1.2s ease-out -.6s infinite}
    .lcd{animation:lcd 1.2s steps(1) infinite}
    @keyframes jog{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-10px) rotate(-1.5deg)}}
    @keyframes belt{to{transform:translateX(60px)}}
    @keyframes fling{0%{opacity:0;transform:translate(0,0)}20%{opacity:1}100%{opacity:0;transform:translate(26px,-30px)}}
    @keyframes lcd{50%{fill:#C8F5D2}}`,
    wrap: 'jog',
    pig: { face: `${drop(220, 70, 1.3, '#9FD8F0', 's1')}${drop(60, 100, 1.1, '#9FD8F0', 's2')}` },
    // The belt's dashes repeat every 60px, so one loop slides exactly 60px.
    under: `<path d="M56 296L46 168" fill="none" stroke="#8A8F9E" stroke-width="10" stroke-linecap="round"/>
    <path d="M48 204L96 212" fill="none" stroke="#8A8F9E" stroke-width="8" stroke-linecap="round"/>
    <rect x="28" y="136" width="44" height="32" rx="7" fill="#3A3E52" transform="rotate(-6 50 152)"/>
    <rect class="lcd" x="33" y="143" width="34" height="13" rx="3" fill="#7FD18F" transform="rotate(-6 50 152)"/>
    <rect x="36" y="288" width="316" height="14" rx="7" fill="#3A3E52"/>
    <clipPath id="gym-belt"><rect x="44" y="288" width="300" height="7" rx="3"/></clipPath>
    <g clip-path="url(#gym-belt)"><g class="belt"><path d="M-36 291H-6M24 291H54M84 291H114M144 291H174M204 291H234M264 291H294M324 291H354" fill="none" stroke="#6B7083" stroke-width="5"/></g></g>`,
  },
  'away-study': {
    title: '上课', note: '戴上圆眼镜，看着前面摊开的书，慢慢歪头想；想通了亮一盏灯泡。',
    css: `.tilt{animation:tilt 2.4s ease-in-out infinite;transform-origin:190px 298px}
    .idea{animation:idea 2.4s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    .page{animation:flip 4.8s ease-in-out infinite;transform-origin:104px 272px}
    @keyframes tilt{0%,100%{transform:rotate(0)}35%{transform:rotate(-3deg)}70%{transform:rotate(-1deg)}}
    @keyframes idea{0%,40%,100%{opacity:0;transform:scale(.6)}55%,85%{opacity:1;transform:scale(1)}}
    @keyframes flip{0%,70%,100%{transform:scaleX(1)}80%{transform:scaleX(-1)}90%{transform:scaleX(1)}}`,
    wrap: 'tilt', wears: ['eyes'],
    pig: { face: WEAR.glasses.svg },
    under: `<g class="idea"><circle cx="230" cy="-4" r="22" fill="#FFE27A"/><rect x="220" y="16" width="20" height="12" rx="4" fill="#C9C3B8"/>
    <path d="M230-38v-10M262-22l8-8M198-22l-8-8" fill="none" stroke="#FFD35A" stroke-width="5" stroke-linecap="round"/></g>`,
    over: `<path d="M36 278L104 266V300L36 300Z" fill="#FFFDF6"/>
    <path class="page" d="M104 266L172 278V300L104 300Z" fill="#F3EEDF"/>
    <path d="M48 282L92 274M48 292L92 284" fill="none" stroke="#D9D2C0" stroke-width="4" stroke-linecap="round"/>
    <path d="M186 296L250 286" fill="none" stroke="#F5C24C" stroke-width="9" stroke-linecap="round"/>
    <path d="M250 286L262 284" fill="none" stroke="#E7A9A2" stroke-width="9" stroke-linecap="round"/>`,
  },
  'away-trip': {
    title: '旅行', note: '戴草帽、背小包往前走，一颠一颠，脚下的路往后退。',
    css: TRIP_CSS,
    wrap: 'walk', wears: ['head'],
    pig: { face: TRIP_GEAR },
    under: TRIP_ROAD,
  },

  // ---- reactions ----
  'react-eat': {
    title: '喂食', note: '低头对着食盆啃胡萝卜（参考 sample 的「猪进食」），一点一点地嚼，渣渣往外蹦。',
    css: `.chomp{animation:chomp .42s ease-in-out infinite;transform-origin:190px 298px}
    .blush{animation:puff .42s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    .c1{animation:crumb .84s ease-out infinite}.c2{animation:crumb .84s ease-out -.42s infinite}
    .tail{animation-duration:.42s}
    @keyframes chomp{0%,100%{transform:rotate(3deg)}50%{transform:rotate(5deg) translateY(3px)}}
    @keyframes puff{50%{transform:scale(1.35)}}
    @keyframes crumb{0%{opacity:0;transform:translate(0,0)}15%{opacity:1}100%{opacity:0;transform:translate(-18px,-24px)}}`,
    wrap: 'chomp',
    pig: { eyes: 'happy', face: `<path d="M96 210L58 244" fill="none" stroke="#F49A4A" stroke-width="16" stroke-linecap="round"/><path d="M66 232l5 5M78 222l5 5" fill="none" stroke="#D97B2E" stroke-width="4" stroke-linecap="round"/>` },
    over: `<path class="c1" d="M66 214h.1M82 204h.1" fill="none" stroke="#F49A4A" stroke-width="8" stroke-linecap="round"/>
    <path class="c2" d="M56 222h.1M90 210h.1" fill="none" stroke="#F49A4A" stroke-width="6" stroke-linecap="round"/>
    <path d="M28 258H140L130 290C129 295 125 298 120 298H48C43 298 39 295 38 290Z" fill="#7FB3D5"/>
    <rect x="26" y="252" width="116" height="12" rx="6" fill="#9CC7E0"/>
    <path d="M60 252C60 238 80 234 84 252M100 252l10-14 10 14" fill="#7DBF6A"/>`,
  },
  'react-bathe': {
    title: '洗澡', note: '泡在小木盆里闭眼享受，头顶一堆泡沫，泡泡往上冒。',
    css: `.soak{animation:soak 1.6s ease-in-out infinite;transform-origin:190px 298px}
    .foam{animation:foam 1.6s ease-in-out infinite;transform-origin:150px 80px}
    .b1{animation:rise 2s ease-out infinite}.b2{animation:rise 2s ease-out -.7s infinite}.b3{animation:rise 2s ease-out -1.4s infinite}
    .ripple{animation:ripple 1.6s ease-in-out infinite}
    @keyframes soak{50%{transform:translateY(4px) rotate(-1deg)}}
    @keyframes foam{50%{transform:scale(1.06,.94)}}
    @keyframes rise{0%{opacity:0;transform:translateY(10px)}20%{opacity:1}100%{opacity:0;transform:translateY(-80px)}}
    @keyframes ripple{50%{transform:translateX(8px)}}`,
    wrap: 'soak', wears: ['head'],
    pig: { eyes: 'closed', face: `<g class="foam" fill="#FFFFFF"><circle cx="110" cy="72" r="24"/><circle cx="146" cy="56" r="30"/><circle cx="186" cy="68" r="22"/><circle cx="140" cy="84" r="20"/><circle cx="136" cy="44" r="6" fill="#DDF1FB"/></g>` },
    over: `<path d="M34 208H348L330 290C329 296 323 300 316 300H66C59 300 53 296 52 290Z" fill="#C69C6D"/>
    <path d="M40 232H342M46 256H336M50 280H332" fill="none" stroke="#B0875A" stroke-width="5"/>
    <path class="ripple" d="M28 208C48 198 68 216 88 208S128 198 148 208 188 216 208 208 248 198 268 208 308 216 328 208 352 202 360 208V218H28Z" fill="#AEDCF2"/>
    <circle class="b1" cx="292" cy="190" r="13" fill="none" stroke="#9FD3E6" stroke-width="5"/>
    <circle class="b2" cx="326" cy="180" r="9" fill="none" stroke="#9FD3E6" stroke-width="5"/>
    <circle class="b3" cx="262" cy="196" r="7" fill="none" stroke="#9FD3E6" stroke-width="5"/>`,
  },
  'react-play': {
    title: '玩耍', note: '高兴得原地蹦起来翻个跟头（参考 sample 里打滚的猪），落地再颠两下。',
    css: `.flip{animation:flip 1.6s cubic-bezier(.4,0,.3,1) infinite;transform-origin:190px 170px}
    .tail{animation-duration:.3s}
    .s1{animation:pop 1.6s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    .s2{animation:pop 1.6s ease-out -.8s infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes flip{0%{transform:translateY(0) rotate(0)}15%{transform:translateY(8px) scale(1.04,.94)}50%{transform:translateY(-40px) rotate(-360deg)}70%{transform:translateY(0) rotate(-360deg) scale(1.04,.95)}82%{transform:translateY(-10px) rotate(-360deg)}100%{transform:translateY(0) rotate(-360deg)}}
    @keyframes pop{0%{opacity:0;transform:scale(.4)}40%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.2)}}`,
    wrap: 'flip',
    pig: { eyes: 'happy' },
    under: sparkle(60, 30, 22, '#FFD35A', 's1') + sparkle(330, 40, 18, '#FF9FB0', 's2'),
  },
  'react-pet': {
    title: '摸摸', note: '一只手在头上轻轻拍，眯眼往上蹭，小心心冒出来。',
    css: `.nuzzle{animation:nuzzle .6s ease-in-out infinite;transform-origin:190px 298px}
    .hand{animation:pat .6s ease-in-out infinite}
    .tail{animation-duration:.3s}
    .h1{animation:rise 1.2s ease-out infinite;transform-box:fill-box;transform-origin:50% 100%}
    .h2{animation:rise 1.2s ease-out -.6s infinite;transform-box:fill-box;transform-origin:50% 100%}
    @keyframes nuzzle{0%,100%{transform:scale(1,1)}50%{transform:scale(1.03,.96) rotate(-1.5deg)}}
    @keyframes pat{0%,100%{transform:translateY(-10px)}50%{transform:translateY(6px)}}
    @keyframes rise{0%{opacity:0;transform:translateY(12px) scale(.5)}30%{opacity:1}100%{opacity:0;transform:translateY(-30px) scale(1)}}`,
    wrap: 'nuzzle',
    pig: { eyes: 'happy', blush: cheeks(18, 10, '#FF9AA0', '.6') },
    over: `<g class="hand"><g transform="translate(14 28)"><path d="M88 22C92 2 132-2 152 8 166 15 166 32 152 36H106C96 36 86 32 88 22Z" fill="#FBE3CF"/>
    <path d="M108 8V32M124 6V32M140 8V32" fill="none" stroke="#EBC9AE" stroke-width="4" stroke-linecap="round"/>
    <path d="M152 20H230" fill="none" stroke="#FBE3CF" stroke-width="24" stroke-linecap="round"/></g></g>
    ${heart(250, 20, 1.2, '#FF7A93', 'h1')}${heart(300, 50, .9, '#FF9FB0', 'h2')}`,
  },
  'react-refuse': {
    title: '拒绝', note: '一扭身背过去（参考 sample 转身的帧），头顶冒火、鼻子喷气，过一会儿再转回来。',
    css: `.turn{animation:turn 1.6s ease-in-out infinite;transform-origin:190px 298px}
    .tail{animation-duration:.25s}
    .vein{animation:throb .4s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    .puff{animation:puff 1.6s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes turn{0%,100%{transform:scaleX(1)}15%,80%{transform:scaleX(-1)}35%,55%{transform:scaleX(-1) rotate(2deg)}45%{transform:scaleX(-1) rotate(-2deg)}}
    @keyframes throb{50%{transform:scale(1.25)}}
    @keyframes puff{0%,15%{opacity:0;transform:translate(0,0) scale(.6)}35%{opacity:1}70%,100%{opacity:0;transform:translate(26px,-10px) scale(1.3)}}`,
    wrap: 'turn',
    over: `<path class="vein" d="M250 0l10 10M270 0l-10 10M250 30l10-10M270 30l-10-10" fill="none" stroke="#E5534B" stroke-width="7" stroke-linecap="round"/>
    <g class="puff"><circle cx="320" cy="200" r="11" fill="#ECE6DC"/><circle cx="340" cy="190" r="8" fill="#ECE6DC"/></g>`,
  },
  'react-cure': {
    title: '病愈', note: '额头贴着创可贴，精神地挺一下，绿十字和光点往上飘。',
    css: `.glow{animation:glow 1.2s ease-in-out infinite;transform-origin:190px 170px}
    .stand{animation:stand 1.2s ease-out infinite;transform-origin:190px 298px}
    .c1{animation:rise 1.4s ease-out infinite}.c2{animation:rise 1.4s ease-out -.5s infinite}.c3{animation:rise 1.4s ease-out -1s infinite}
    @keyframes glow{0%,100%{opacity:.35;transform:scale(.92)}50%{opacity:.7;transform:scale(1.04)}}
    @keyframes stand{0%{transform:scale(1)}15%{transform:scale(1.04,.94)}40%{transform:scale(.98,1.04) translateY(-8px)}70%,100%{transform:scale(1)}}
    @keyframes rise{0%{opacity:0;transform:translateY(16px)}30%{opacity:1}100%{opacity:0;transform:translateY(-44px)}}`,
    wrap: 'stand',
    pig: { face: `<path d="M110 96L156 86L160 104L114 114Z" fill="#F6D7A7"/><path d="M128 100l12-3" fill="none" stroke="#E5BD84" stroke-width="6" stroke-linecap="round"/>` },
    under: `<ellipse class="glow" cx="190" cy="170" rx="168" ry="140" fill="#DFF3D4"/>`,
    over: `<path class="c1" d="M48 60h12V48h12v12h12v12H72v12H60V72H48Z" fill="#6CC27A"/>
    <path class="c2" d="M300 30h9v-9h9v9h9v9h-9v9h-9v-9h-9Z" fill="#6CC27A"/>
    <circle class="c3" cx="260" cy="10" r="7" fill="#FFE27A"/>`,
  },

  // ---- careers (data.js JOBS, tier 'pro'): job-<art>.svg while at work ----
  'job-aitrainer': {
    title: 'AI 训练师', note: '戴着眼镜对着笔记本调模型，头顶的神经网络一层层亮起来。',
    css: `.type{animation:type .4s ease-in-out infinite;transform-origin:190px 298px}
    .n{animation:fire 1.8s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    .n2{animation-delay:.3s}.n3{animation-delay:.6s}
    .keys{animation:keys .4s steps(2) infinite}
    @keyframes type{50%{transform:translateY(3px) rotate(.6deg)}}
    @keyframes fire{0%,100%{fill:#D9DDF2;transform:scale(1)}30%{fill:#7C8CF0;transform:scale(1.25)}}
    @keyframes keys{50%{opacity:0}}`,
    wrap: 'type', wears: ['eyes'],
    pig: { face: `<g fill="none" stroke="#5B5F73" stroke-width="5"><circle cx="91" cy="142" r="20"/><circle cx="165" cy="157" r="20"/><path d="M111 145L145 152M71 138L58 132"/></g>` },
    under: `<g stroke="#C9CEE8" stroke-width="3">
    <path d="M190 -14L240 -24M190 -14L240 6M190 -14L240 36M190 22L240 -24M190 22L240 6M190 22L240 36M240 -24L290 -6M240 6L290 -6M240 36L290 -6M240 -24L290 24M240 6L290 24M240 36L290 24"/></g>
    <circle class="n" cx="190" cy="-14" r="10" fill="#D9DDF2"/><circle class="n" cx="190" cy="22" r="10" fill="#D9DDF2"/>
    <circle class="n n2" cx="240" cy="-24" r="10" fill="#D9DDF2"/><circle class="n n2" cx="240" cy="6" r="10" fill="#D9DDF2"/><circle class="n n2" cx="240" cy="36" r="10" fill="#D9DDF2"/>
    <circle class="n n3" cx="290" cy="-6" r="10" fill="#D9DDF2"/><circle class="n n3" cx="290" cy="24" r="10" fill="#D9DDF2"/>`,
    over: `<rect x="28" y="252" width="170" height="12" rx="6" fill="#C69C6D"/>
    <rect x="38" y="264" width="12" height="36" rx="6" fill="#B0875A"/><rect x="176" y="264" width="12" height="36" rx="6" fill="#B0875A"/>
    <path d="M36 250L46 210H118L110 250Z" fill="#4B5068"/>
    <circle cx="80" cy="230" r="8" fill="#7C8CF0"/>
    <rect x="34" y="246" width="100" height="8" rx="4" fill="#3A3E52"/>
    <path class="keys" d="M124 236l8-6M130 244l10-2" fill="none" stroke="#9FA9B4" stroke-width="4" stroke-linecap="round"/>`,
  },
  'job-influencer': {
    title: '网红', note: '环形补光灯前对着手机摆姿势，换个角度再拍一张，点赞和小心心往上冒。',
    css: `.pose{animation:pose 2s ease-in-out infinite;transform-origin:190px 298px}
    .flash{animation:flash 2s steps(1) infinite}
    .h1{animation:rise 2s ease-out infinite;transform-box:fill-box;transform-origin:50% 100%}
    .h2{animation:rise 2s ease-out -.7s infinite;transform-box:fill-box;transform-origin:50% 100%}
    .h3{animation:rise 2s ease-out -1.4s infinite;transform-box:fill-box;transform-origin:50% 100%}
    @keyframes pose{0%,40%{transform:rotate(-3deg)}50%,90%{transform:rotate(2deg) translateY(-4px)}100%{transform:rotate(-3deg)}}
    @keyframes flash{0%,44%,56%,94%,100%{opacity:0}46%,96%{opacity:1}}
    @keyframes rise{0%{opacity:0;transform:translateY(16px) scale(.5)}25%{opacity:1}100%{opacity:0;transform:translateY(-60px) scale(1)}}`,
    wrap: 'pose',
    pig: { eyes: 'happy', blush: cheeks(18, 10, '#FF9AA0', '.6') },
    under: `<circle cx="170" cy="140" r="150" fill="none" stroke="#FFF4C8" stroke-width="26"/>
    <circle cx="170" cy="140" r="150" fill="none" stroke="#FFE27A" stroke-width="6"/>`,
    over: `<path d="M44 300L44 214M44 300L24 300M44 300L64 300" fill="none" stroke="#5B5F73" stroke-width="6" stroke-linecap="round"/>
    <rect x="28" y="150" width="34" height="64" rx="8" fill="#3A3E52"/><rect x="32" y="156" width="26" height="50" rx="5" fill="#9FD3E6"/>
    <circle class="flash" cx="45" cy="160" r="22" fill="#FFFFFF" opacity=".9"/>
    ${heart(30, 110, .9, '#FF7A93', 'h1')}${heart(56, 100, .7, '#FF9FB0', 'h2')}
    <g class="h3"><path d="M34 120h8v18h-8ZM44 138V122l6-10c4 0 6 3 5 7l-2 5h9c4 0 6 3 5 6l-3 8H44Z" fill="#6FA8DC"/></g>`,
  },
  'job-vtuber': {
    title: 'VTuber', note: '戴着耳麦对着麦克风直播，嘴巴（鼻子）一动一动，屏幕上的小猪头像跟着动，弹幕往上飘。',
    css: `.bob{animation:bob .8s ease-in-out infinite;transform-origin:190px 298px}
    .snout{animation:talk .28s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    .live{animation:live 1s steps(1) infinite}
    .avatar{animation:bob .8s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
    .wave{animation:wave .8s ease-out infinite}
    .chat1{animation:chat 3s linear infinite}.chat2{animation:chat 3s linear -1s infinite}.chat3{animation:chat 3s linear -2s infinite}
    @keyframes bob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-3px) rotate(-1deg)}}
    @keyframes talk{50%{transform:scale(1.06,.94)}}
    @keyframes live{50%{opacity:.2}}
    @keyframes wave{0%{opacity:0;transform:translateX(0)}40%{opacity:1}100%{opacity:0;transform:translateX(-16px)}}
    @keyframes chat{0%{opacity:0;transform:translateY(30px)}15%,80%{opacity:1}100%{opacity:0;transform:translateY(-40px)}}`,
    wrap: 'bob', wears: ['head'],
    pig: { face: `<path d="M62 128C62 50 200 34 222 110" fill="none" stroke="#5B5F73" stroke-width="12" stroke-linecap="round"/>
    <ellipse cx="64" cy="132" rx="15" ry="22" fill="#8E7CC3"/><ellipse cx="220" cy="116" rx="15" ry="22" fill="#8E7CC3"/>
    <path d="M58 150Q44 196 64 212" fill="none" stroke="#5B5F73" stroke-width="5" stroke-linecap="round"/>
    <circle cx="68" cy="214" r="9" fill="#3A3E52"/>` },
    under: `<rect x="228" y="-30" width="122" height="84" rx="10" fill="#3A3E52"/><rect x="236" y="-22" width="106" height="68" rx="6" fill="#2A2D3C"/>
    <g class="avatar"><circle cx="300" cy="24" r="20" fill="#FFD1AF"/><path d="M286 8C282 2 288-2 292 4M310 6C314 0 320 4 316 10" fill="none" stroke="#E95892" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="292" cy="30" rx="8" ry="6" fill="#FF8195"/></g>
    <circle class="live" cx="250" cy="-10" r="6" fill="#E5534B"/>
    <g class="chat1"><rect x="244" y="60" width="54" height="16" rx="8" fill="#FFE27A"/></g>
    <g class="chat2"><rect x="270" y="60" width="66" height="16" rx="8" fill="#B5E3F5"/></g>
    <g class="chat3"><rect x="250" y="60" width="44" height="16" rx="8" fill="#FFC2D1"/></g>`,
    over: `<path class="wave" d="M40 200q-8 14 0 28M28 192q-12 22 0 44" fill="none" stroke="#B49CD8" stroke-width="5" stroke-linecap="round"/>`,
  },
  'job-coach': {
    title: '健身教练', note: '绑着头带、挂着哨子，一下一下举哑铃带大家练，汗珠往外甩。',
    css: `.squat{animation:squat 1.2s ease-in-out infinite;transform-origin:190px 298px}
    .bell{animation:lift 1.2s ease-in-out infinite}
    .s1{animation:fling 1.2s ease-out infinite}.s2{animation:fling 1.2s ease-out -.6s infinite}
    @keyframes squat{0%,100%{transform:scale(1,1)}50%{transform:scale(1.03,.94)}}
    @keyframes lift{0%,100%{transform:translateY(0)}50%{transform:translateY(-70px)}}
    @keyframes fling{0%{opacity:0;transform:translate(0,0)}20%{opacity:1}100%{opacity:0;transform:translate(26px,-30px)}}`,
    wrap: 'squat', wears: ['waist'],
    pig: { face: `<path d="M64 112L196 128L194 146L60 130Z" fill="#E5534B"/><path d="M64 120L195 136" fill="none" stroke="#FFFFFF" stroke-width="4"/>
    <path d="M120 214Q150 240 190 226" fill="none" stroke="#5B5F73" stroke-width="4"/><rect x="138" y="228" width="22" height="14" rx="6" fill="#F5C24C"/>
    ${drop(220, 70, 1.3, '#9FD8F0', 's1')}${drop(60, 100, 1.1, '#9FD8F0', 's2')}` },
    over: `<g class="bell"><path d="M28 236H118" fill="none" stroke="#5B5F73" stroke-width="8" stroke-linecap="round"/>
    <rect x="22" y="216" width="20" height="40" rx="6" fill="#3A3E52"/><rect x="104" y="216" width="20" height="40" rx="6" fill="#3A3E52"/></g>`,
  },

  // ---- scratch card (shop, action 'lottery'): scratch first, then the result ----
  'lottery-scratch': {
    title: '刮彩票', note: '捧着一张彩票，拿硬币来回刮，银屑往外飞。',
    css: `.lean{animation:lean .6s ease-in-out infinite;transform-origin:190px 298px}
    .coin{animation:scratch .3s ease-in-out infinite}
    .bits{animation:bits .3s ease-out infinite}
    @keyframes lean{50%{transform:rotate(1.5deg) translateY(2px)}}
    @keyframes scratch{0%,100%{transform:translateX(0)}50%{transform:translateX(44px)}}
    @keyframes bits{0%{opacity:0;transform:translate(0,0)}20%{opacity:1}100%{opacity:0;transform:translate(-10px,20px)}}`,
    wrap: 'lean',
    over: `<rect x="24" y="206" width="120" height="74" rx="8" fill="#F5C24C"/>
    <rect x="34" y="216" width="100" height="54" rx="5" fill="#C9CED6"/>
    <path d="M40 232h30M40 248h44" fill="none" stroke="#E7D9A8" stroke-width="6" stroke-linecap="round"/>
    <g class="coin"><circle cx="58" cy="226" r="14" fill="#FFD35A"/><circle cx="58" cy="226" r="9" fill="none" stroke="#E5B33A" stroke-width="3"/></g>
    <g class="bits" fill="#AEB4BE"><circle cx="70" cy="256" r="3"/><circle cx="96" cy="262" r="2.5"/><circle cx="82" cy="270" r="3"/></g>`,
  },
  'lottery-jackpot': {
    title: '一等奖', note: '一等奖！高兴得原地转圈，金币哗啦啦往下掉。',
    css: `.spin{animation:spin 1s ease-in-out infinite;transform-origin:190px 170px}
    .tail{animation-duration:.25s}
    .c{animation:fall 1.2s linear infinite;transform-box:fill-box;transform-origin:50% 50%}
    .c2{animation-delay:-.4s}.c3{animation-delay:-.8s}
    .sp{animation:pop 1s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes spin{0%{transform:translateY(0) rotate(0)}50%{transform:translateY(-24px) rotate(-180deg)}100%{transform:translateY(0) rotate(-360deg)}}
    @keyframes fall{0%{opacity:0;transform:translateY(-40px) rotate(0)}15%{opacity:1}100%{opacity:0;transform:translateY(300px) rotate(180deg)}}
    @keyframes pop{0%{opacity:0;transform:scale(.4)}40%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.3)}}`,
    wrap: 'spin',
    pig: { eyes: 'happy', blush: cheeks(18, 10, '#FF9AA0', '.6') },
    under: [[50, ''], [110, 'c2'], [180, 'c3'], [250, ''], [320, 'c2'], [80, 'c3'], [290, 'c3']].map(([x, d]) =>
      `<g class="c ${d}"><circle cx="${x}" cy="-20" r="12" fill="#FFD35A"/><circle cx="${x}" cy="-20" r="7" fill="none" stroke="#E5B33A" stroke-width="3"/></g>`).join('')
      + sparkle(40, 40, 22, '#FFE27A', 'sp') + sparkle(340, 60, 18, '#FFE27A', 'sp'),
  },
  'lottery-win': {
    title: '中奖了', note: '中了二三等奖或安慰奖：吹响派对喇叭，彩带撒下来，开心地颠两下。',
    css: `.hop{animation:hop .7s ease-in-out infinite;transform-origin:190px 298px}
    .horn{animation:blow .7s ease-in-out infinite;stroke-dasharray:70;transform-origin:56px 186px}
    .f{animation:fall 1.6s linear infinite;transform-box:fill-box;transform-origin:50% 50%}
    .f2{animation-delay:-.5s}.f3{animation-delay:-1.1s}
    @keyframes hop{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
    @keyframes blow{0%,100%{stroke-dashoffset:60}40%,70%{stroke-dashoffset:0}}
    @keyframes fall{0%{opacity:0;transform:translateY(-30px) rotate(0)}15%{opacity:1}100%{opacity:0;transform:translateY(260px) rotate(240deg)}}`,
    wrap: 'hop',
    pig: { eyes: 'happy', face: `<path d="M80 188L50 170L48 204Z" fill="#6FA8DC"/><path d="M80 188L50 170" fill="none" stroke="#F5C24C" stroke-width="4"/>
    <path class="horn" d="M48 186C30 186 20 176 24 166S40 160 38 172" fill="none" stroke="#FF7A93" stroke-width="7" stroke-linecap="round"/>` },
    under: [[60, '#FF7A93', ''], [120, '#6FA8DC', 'f2'], [190, '#FFD35A', 'f3'], [250, '#7DBF6A', ''], [320, '#B49CD8', 'f2'], [290, '#FF9FB0', 'f3']].map(([x, c, d]) =>
      `<g class="f ${d}"><rect x="${x}" y="-20" width="8" height="18" rx="2" fill="${c}"/></g>`).join('')
      + `<path d="M40 -10Q90 30 140 0T240 0T340 -10" fill="none" stroke="#FFC2D1" stroke-width="5"/>`,
  },
  'lottery-lose': {
    title: '谢谢参与', note: '没中：彩票掉在脚边，蔫蔫地低着头，头顶一朵乌云下雨。',
    css: `.droop{animation:droop 2s ease-in-out infinite;transform-origin:190px 298px}
    .tail{animation:none}.ear2{animation:none}
    .rain{animation:rain .7s linear infinite}.rain2{animation:rain .7s linear -.35s infinite}
    .cloud{animation:drift 2s ease-in-out infinite}
    @keyframes droop{0%,100%{transform:rotate(2deg) translateY(2px)}50%{transform:rotate(3.5deg) translateY(4px)}}
    @keyframes rain{0%{opacity:0;transform:translateY(0)}30%{opacity:1}100%{opacity:0;transform:translateY(40px)}}
    @keyframes drift{50%{transform:translateX(6px)}}`,
    wrap: 'droop',
    pig: { face: `<path d="M82 158Q91 162 100 158M156 173Q165 177 174 173" fill="none" stroke="#6EC3EA" stroke-width="6" stroke-linecap="round"/>` },
    over: `<g class="cloud"><path d="M86 34a26 26 0 0 1 46-16 30 30 0 0 1 56 10 20 20 0 0 1-2 40H94a24 24 0 0 1-8-34Z" fill="#9AA2B0"/>
    <path class="rain" d="M106 80v14M154 80v14" fill="none" stroke="#8FB6D8" stroke-width="5" stroke-linecap="round"/>
    <path class="rain2" d="M130 80v14M178 80v14" fill="none" stroke="#8FB6D8" stroke-width="5" stroke-linecap="round"/></g>
    <g transform="rotate(-12 80 286)"><rect x="40" y="272" width="80" height="26" rx="5" fill="#C9CED6"/><path d="M50 284h40" stroke="#AEB4BE" stroke-width="5" stroke-linecap="round"/></g>`,
  },

  // ---- everyday jobs (data.js JOBS, tier 'basic'): job-<art>.svg too ----
  'job-label': {
    title: 'AI 数据标注', note: '对着笔记本给图片画框打标签，框一画好就蹦出一张小标签。',
    css: `.type{animation:type .4s ease-in-out infinite;transform-origin:190px 298px}
    .box{stroke-dasharray:126;animation:draw 2s ease-in-out infinite}
    .tag{animation:tag 2s ease-out infinite}.tag2{animation:tag 2s ease-out -1s infinite}
    .keys{animation:keys .4s steps(2) infinite}
    @keyframes type{50%{transform:translateY(3px) rotate(.6deg)}}
    @keyframes draw{0%{stroke-dashoffset:126}45%,100%{stroke-dashoffset:0}}
    @keyframes tag{0%,45%{opacity:0;transform:translate(0,0)}55%{opacity:1}100%{opacity:0;transform:translate(-4px,-80px)}}
    @keyframes keys{50%{opacity:0}}`,
    wrap: 'type',
    over: `${DESK}
    <path d="M36 250L46 210H118L110 250Z" fill="#4B5068"/>
    <path d="M52 244L59 216H110L104 244Z" fill="#E6EEF4"/>
    <ellipse cx="80" cy="236" rx="12" ry="7" fill="#F2B98A"/><circle cx="92" cy="226" r="6" fill="#F2B98A"/>
    <path d="M88 220l2-5 3 5M94 220l3-5 2 5" fill="#F2B98A"/>
    <rect class="box" x="64" y="217" width="38" height="25" fill="none" stroke="#3FBF7F" stroke-width="3"/>
    <rect x="34" y="246" width="100" height="8" rx="4" fill="#3A3E52"/>
    <path class="keys" d="M124 236l8-6M130 244l10-2" fill="none" stroke="#9FA9B4" stroke-width="4" stroke-linecap="round"/>
    <g class="tag"><path d="M30 186H54L64 196L54 206H30Z" fill="#FFD35A"/><circle cx="37" cy="196" r="3" fill="#C69C6D"/></g>
    <g class="tag2"><path d="M34 186H58L68 196L58 206H34Z" fill="#9FD8F0"/><circle cx="41" cy="196" r="3" fill="#5A93C8"/></g>`,
  },
  'job-tutor': {
    title: '家教', note: '站在小黑板前讲题，粉笔字一笔一笔写出来，桌上的作业一个个打上红勾。',
    css: `.explain{animation:explain 1s ease-in-out infinite;transform-origin:190px 298px}
    .chalk{stroke-dasharray:80;animation:write 3s linear infinite}
    .tick{stroke-dasharray:40;animation:tick 3s ease-out infinite}
    .wave{animation:wave 1s ease-out infinite}
    @keyframes explain{0%,100%{transform:rotate(0)}30%{transform:rotate(-2deg)}60%{transform:rotate(.5deg)}}
    @keyframes write{0%{stroke-dashoffset:80}60%,100%{stroke-dashoffset:0}}
    @keyframes tick{0%,60%{stroke-dashoffset:40}80%,100%{stroke-dashoffset:0}}
    @keyframes wave{0%{opacity:0;transform:translateX(0)}40%{opacity:1}100%{opacity:0;transform:translateX(-14px)}}`,
    wrap: 'explain',
    under: `<rect x="26" y="-30" width="172" height="82" rx="6" fill="#8B6B4E"/><rect x="34" y="-22" width="156" height="66" rx="3" fill="#2F5D50"/>
    <g fill="none" stroke="#F4F4EC" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <path class="chalk" d="M50 -8v22M62 3h16M70 -5v16M88 -8v22M100 0h16M100 8h16M126 -4q8-8 14 0t-14 18h16"/>
    <path class="chalk" d="M160 30l12-24 12 24Z"/></g>`,
    over: `<path class="wave" d="M40 200q-8 14 0 28M28 192q-12 22 0 44" fill="none" stroke="#C9B79C" stroke-width="5" stroke-linecap="round"/>
    <g transform="rotate(-6 70 274)"><rect x="32" y="252" width="76" height="46" rx="4" fill="#FFFDF6"/>
    <path d="M42 264h28M42 276h22M42 288h26" fill="none" stroke="#D9D2C0" stroke-width="4" stroke-linecap="round"/>
    <path class="tick" d="M78 268l7 8 14-16" fill="none" stroke="#E5534B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>
    <circle cx="140" cy="284" r="14" fill="#E5534B"/><path d="M140 270q2-8 9-10" fill="none" stroke="#7DBF6A" stroke-width="4" stroke-linecap="round"/>`,
  },
  'job-office': {
    title: '上班', note: '打着领带，一份一份往文件上盖章，墙上的钟走得飞快。',
    css: `.sit{animation:sit 1.2s ease-in-out infinite;transform-origin:190px 298px}
    .stamp{animation:stamp 1.2s ease-in infinite}
    .mark{animation:mark 1.2s steps(1) infinite}
    .hand{animation:spin 2.4s linear infinite;transform-origin:306px -2px}
    .hand2{animation:spin 28.8s linear infinite;transform-origin:306px -2px}
    @keyframes sit{0%,100%{transform:rotate(0)}45%{transform:rotate(1deg) translateY(2px)}}
    @keyframes stamp{0%,30%,100%{transform:translateY(-22px)}45%,55%{transform:translateY(0)}}
    @keyframes mark{0%,45%{opacity:0}50%,95%{opacity:1}}
    @keyframes spin{to{transform:rotate(360deg)}}`,
    wrap: 'sit', wears: ['waist'],
    pig: { face: `<path d="M120 212h20l-4 10h-12Z" fill="#3E5C99"/><path d="M125 222h10l6 30-11 11-11-11Z" fill="#4A6FB5"/>
    <path d="M128 232l8 6M126 244l10 7" fill="none" stroke="#7FA0D8" stroke-width="3" stroke-linecap="round"/>` },
    under: `<circle cx="306" cy="-2" r="30" fill="#FFFFFF"/><circle cx="306" cy="-2" r="30" fill="none" stroke="#8B6B4E" stroke-width="6"/>
    <path class="hand2" d="M306 -2V-20" fill="none" stroke="#3A3E52" stroke-width="5" stroke-linecap="round"/>
    <path class="hand" d="M306 -2V-24" fill="none" stroke="#E5534B" stroke-width="3" stroke-linecap="round"/>`,
    over: `${DESK}
    <rect x="34" y="244" width="70" height="8" rx="2" fill="#E6E0D2"/><rect x="38" y="238" width="66" height="7" rx="2" fill="#F3EEDF"/><rect x="34" y="232" width="70" height="7" rx="2" fill="#FFFDF6"/>
    <rect class="mark" x="50" y="233" width="26" height="5" rx="2" fill="#E5534B"/>
    <g class="stamp"><rect x="48" y="220" width="30" height="10" rx="3" fill="#8B5A3C"/><rect x="56" y="198" width="14" height="24" rx="6" fill="#A8764C"/><circle cx="63" cy="196" r="9" fill="#A8764C"/></g>
    <path d="M156 222H186V246C186 250 183 252 179 252H163C159 252 156 250 156 246Z" fill="#FFFFFF"/>
    <path d="M186 228C198 228 198 244 186 244" fill="none" stroke="#FFFFFF" stroke-width="5"/>`,
  },
  'job-stall': {
    title: '摆地摊', note: '大伞底下铺块布摆满小玩意儿，晃着脑袋吆喝，卖出一件蹦一枚硬币。',
    css: `.hawk{animation:hawk 1.4s ease-in-out infinite;transform-origin:190px 298px}
    .shade{animation:shade 3s ease-in-out infinite;transform-origin:200px 300px}
    .wave{animation:wave .7s ease-out infinite}
    .coin{animation:coin 1.4s ease-out infinite}.coin2{animation:coin 1.4s ease-out -.7s infinite}
    @keyframes hawk{0%,100%{transform:rotate(0)}25%{transform:rotate(-2.5deg) translateY(-3px)}50%{transform:rotate(0)}}
    @keyframes shade{50%{transform:rotate(1deg)}}
    @keyframes wave{0%{opacity:0;transform:translateX(0)}40%{opacity:1}100%{opacity:0;transform:translateX(-16px)}}
    @keyframes coin{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(-60px)}}`,
    wrap: 'hawk',
    under: `<g class="shade"><path d="M200 -20V300" fill="none" stroke="#B0875A" stroke-width="8"/>
    <path d="M56 30Q200 -70 344 30Z" fill="#FF8FA3"/><path d="M200 -32L128 30H176ZM200 -32L224 30H272Z" fill="#FFFFFF"/>
    <path d="M56 30a12 12 0 0 0 24 0a12 12 0 0 0 24 0a12 12 0 0 0 24 0a12 12 0 0 0 24 0a12 12 0 0 0 24 0a12 12 0 0 0 24 0a12 12 0 0 0 24 0a12 12 0 0 0 24 0a12 12 0 0 0 24 0a12 12 0 0 0 24 0a12 12 0 0 0 24 0a12 12 0 0 0 24 0Z" fill="#FF8FA3"/></g>`,
    over: `<path class="wave" d="M40 200q-8 14 0 28M28 192q-12 22 0 44" fill="none" stroke="#E8A882" stroke-width="5" stroke-linecap="round"/>
    <path d="M24 300L36 268H206L196 300Z" fill="#6FA8DC"/><path d="M44 284H196" fill="none" stroke="#9CC7E0" stroke-width="5" stroke-dasharray="10 10"/>
    <circle cx="60" cy="266" r="12" fill="#B0875A"/><circle cx="51" cy="256" r="5" fill="#B0875A"/><circle cx="69" cy="256" r="5" fill="#B0875A"/>
    <path d="M98 276C90 262 96 252 102 248V240H114V248C120 252 126 262 118 276Z" fill="#B49CD8"/>
    <circle cx="150" cy="268" r="11" fill="#FFD35A"/><path d="M139 268h22M150 257v22" fill="none" stroke="#F5A23C" stroke-width="3"/>
    <g class="coin"><circle cx="80" cy="240" r="9" fill="#FFD35A"/><circle cx="80" cy="240" r="5" fill="none" stroke="#E5B33A" stroke-width="2"/></g>
    <g class="coin2"><circle cx="130" cy="236" r="9" fill="#FFD35A"/><circle cx="130" cy="236" r="5" fill="none" stroke="#E5B33A" stroke-width="2"/></g>`,
  },
  'job-odd': {
    title: '打零工', note: '包着头巾，拿大扫帚左一下右一下地扫地，扫得尘土一团团飞。',
    css: `.sway{animation:sway 1s ease-in-out infinite;transform-origin:190px 298px}
    .broom{animation:sweep 1s ease-in-out infinite;transform-origin:30px 120px}
    .dust{animation:dust 1s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}.dust2{animation:dust 1s ease-out -.5s infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes sway{0%,100%{transform:rotate(-1deg)}50%{transform:rotate(1.5deg)}}
    @keyframes sweep{0%,100%{transform:rotate(6deg)}50%{transform:rotate(-8deg)}}
    @keyframes dust{0%{opacity:0;transform:translate(0,0) scale(.6)}30%{opacity:.9}100%{opacity:0;transform:translate(-20px,-26px) scale(1.3)}}`,
    wrap: 'sway', wears: ['head'],
    pig: { face: `<path d="M104 76C128 40 192 30 218 50L208 72C180 58 138 62 114 90Z" fill="#6FA8DC"/>
    <circle cx="140" cy="62" r="4" fill="#FFFFFF"/><circle cx="170" cy="52" r="4" fill="#FFFFFF"/><circle cx="196" cy="56" r="4" fill="#FFFFFF"/>
    <path d="M214 60L238 52L232 72Z" fill="#5A93C8"/>` },
    over: `<g class="broom"><path d="M30 120L92 268" fill="none" stroke="#B0875A" stroke-width="9" stroke-linecap="round"/>
    <path d="M78 258L112 248L132 296H70Z" fill="#E9C46A"/><path d="M84 274L118 264" fill="none" stroke="#C9A04C" stroke-width="5"/>
    <path d="M82 296L80 286M96 296L94 284M110 296L110 284M122 296L124 286" fill="none" stroke="#C9A04C" stroke-width="3"/></g>
    <g class="dust"><circle cx="150" cy="290" r="11" fill="#E6DED0"/><circle cx="164" cy="284" r="8" fill="#E6DED0"/></g>
    <g class="dust2"><circle cx="60" cy="292" r="9" fill="#E6DED0"/><circle cx="48" cy="286" r="6" fill="#E6DED0"/></g>`,
  },
  'job-tea': {
    title: '奶茶店员', note: '戴着遮阳帽站在柜台后摇雪克杯，杯里的珍珠一颠一颠。',
    css: `.bop{animation:bop .5s ease-in-out infinite;transform-origin:190px 298px}
    .shaker{animation:shake .25s ease-in-out infinite;transform-origin:48px 214px}
    .pearl{animation:pearl .5s ease-in-out infinite}.pearl2{animation:pearl .5s ease-in-out -.25s infinite}
    .sp{animation:pop 1.5s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes bop{50%{transform:translateY(-3px)}}
    @keyframes shake{0%,100%{transform:translateY(-8px) rotate(-6deg)}50%{transform:translateY(8px) rotate(6deg)}}
    @keyframes pearl{50%{transform:translateY(-4px)}}
    @keyframes pop{0%{opacity:0;transform:scale(.4)}40%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.2)}}`,
    wrap: 'bop', wears: ['head'],
    pig: { face: `<path d="M116 66C124 38 176 30 206 44L202 60C176 52 146 54 120 72Z" fill="#7DBF6A"/>
    <path d="M120 68C100 60 78 66 64 80C84 84 106 80 122 74Z" fill="#5FA84E"/>` },
    over: `<rect x="24" y="246" width="210" height="14" rx="6" fill="#F3EDE4"/><rect x="32" y="258" width="194" height="42" rx="4" fill="#FFC2D1"/>
    <path d="M60 258V300M100 258V300M140 258V300M180 258V300" fill="none" stroke="#FFD7E1" stroke-width="10"/>
    <g class="shaker"><rect x="36" y="168" width="26" height="18" rx="7" fill="#AEB4BE"/><path d="M33 186H65L60 244H38Z" fill="#C9CED6"/><path d="M40 196l3 40" fill="none" stroke="#E6EAEE" stroke-width="4" stroke-linecap="round"/></g>
    <path d="M176 206L186 172" fill="none" stroke="#FF7A93" stroke-width="7" stroke-linecap="round"/>
    <path d="M150 206H190L184 246H156Z" fill="#E8C9A0"/><ellipse cx="170" cy="206" rx="21" ry="5" fill="#F7E6CF"/>
    <g class="pearl" fill="#5A3E2B"><circle cx="162" cy="238" r="4"/><circle cx="176" cy="236" r="4"/></g>
    <g class="pearl2" fill="#5A3E2B"><circle cx="168" cy="230" r="4"/><circle cx="180" cy="240" r="3.5"/></g>
    ${sparkle(110, 150, 12, '#FFE27A', 'sp')}`,
  },
  'job-rider': {
    title: '外卖骑手', note: '戴黄头盔、背外卖箱，踩着小滑板车往前冲，轮子飞转，身后拉出风线。',
    css: `.ride{animation:ride .3s ease-in-out infinite;transform-origin:190px 298px}
    .wheel{animation:spin .4s linear infinite;transform-box:fill-box;transform-origin:50% 50%}
    .road{animation:road 1s linear infinite}
    .wind{animation:wind .6s linear infinite}.wind2{animation:wind .6s linear -.3s infinite}
    .tail{animation-duration:.3s}
    @keyframes ride{50%{transform:translateY(-3px)}}
    @keyframes spin{to{transform:rotate(-360deg)}}
    @keyframes road{to{transform:translateX(120px)}}
    @keyframes wind{0%{opacity:0;transform:translateX(0)}30%{opacity:1}100%{opacity:0;transform:translateX(30px)}}`,
    wrap: 'ride', wears: ['head'],
    pig: { face: `<rect x="212" y="-4" width="104" height="78" rx="10" fill="#FFC83D"/><path d="M212 18H316" fill="none" stroke="#E5A92A" stroke-width="5"/>
    <circle cx="264" cy="44" r="12" fill="#FFFFFF"/><path d="M258 44l5 5 8-9" fill="none" stroke="#E5A92A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M228 70Q208 110 222 160" fill="none" stroke="#E5A92A" stroke-width="9"/>
    <path d="M76 100C70 50 120 10 180 4C220 2 246 22 244 52C200 44 140 56 90 104Z" fill="#FFC83D"/>
    <path d="M120 30C140 18 170 12 196 14" fill="none" stroke="#FFE08A" stroke-width="8"/>
    <path d="M84 104C128 60 196 46 248 54" fill="none" stroke="#E5A92A" stroke-width="9"/>` },
    under: `<g class="road"><path d="M-60 300H0M60 300H120M180 300H240M300 300H360M420 300H480" fill="none" stroke="#D9CBB3" stroke-width="7" stroke-linecap="round"/></g>
    <path d="M52 286L40 168" fill="none" stroke="#5B5F73" stroke-width="8" stroke-linecap="round"/><path d="M26 170H56" fill="none" stroke="#3A3E52" stroke-width="10" stroke-linecap="round"/>
    <rect x="50" y="280" width="290" height="10" rx="5" fill="#5B5F73"/>`,
    over: `<g class="wheel"><circle cx="52" cy="288" r="12" fill="#3A3E52"/><path d="M44 288h16M52 280v16" stroke="#9FA9B4" stroke-width="3"/></g>
    <g class="wheel"><circle cx="330" cy="288" r="12" fill="#3A3E52"/><path d="M322 288h16M330 280v16" stroke="#9FA9B4" stroke-width="3"/></g>
    <path class="wind" d="M320 110h26M330 150h22M318 190h30" fill="none" stroke="#CFD8E3" stroke-width="5" stroke-linecap="round"/>
    <path class="wind2" d="M326 130h20M322 170h28" fill="none" stroke="#CFD8E3" stroke-width="5" stroke-linecap="round"/>`,
  },
  'job-site': {
    title: '搬砖', note: '戴安全帽，背上码着三块砖，一步一顿地扛，汗珠往外甩。',
    css: `.haul{animation:haul 1s ease-in-out infinite;transform-origin:190px 298px}
    .bricks{animation:wobble 1s ease-in-out infinite;transform-origin:262px 66px}
    .s1{animation:fling 1s ease-out infinite}.s2{animation:fling 1s ease-out -.5s infinite}
    .puff{animation:puff 1s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes haul{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(5px) rotate(1deg)}}
    @keyframes wobble{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(2deg)}}
    @keyframes fling{0%{opacity:0;transform:translate(0,0)}20%{opacity:1}100%{opacity:0;transform:translate(-24px,-26px)}}
    @keyframes puff{0%,40%{opacity:0;transform:scale(.6)}60%{opacity:.8}100%{opacity:0;transform:scale(1.3) translateY(-8px)}}`,
    wrap: 'haul', wears: ['head'],
    pig: { face: `<g class="bricks"><rect x="212" y="36" width="58" height="28" rx="3" fill="#C8553D"/><rect x="272" y="40" width="54" height="26" rx="3" fill="#B84A35"/>
    <rect x="236" y="8" width="58" height="28" rx="3" fill="#D2654C"/>
    <path d="M220 50h12M246 22h12M282 54h12" fill="none" stroke="#E58A72" stroke-width="4" stroke-linecap="round"/></g>
    <path d="M80 96C76 48 124 12 180 8C222 6 246 26 242 56C198 46 140 58 92 100Z" fill="#F5A23C"/>
    <path d="M150 12C152 30 154 40 156 50" fill="none" stroke="#E57B2E" stroke-width="7"/>
    <path d="M72 104C124 62 196 50 254 60" fill="none" stroke="#E57B2E" stroke-width="10"/>
    ${drop(64, 110, 1.3, '#9FD8F0', 's1')}${drop(200, 92, 1.1, '#9FD8F0', 's2')}` },
    over: `<rect x="26" y="280" width="34" height="18" rx="3" fill="#C8553D"/><rect x="62" y="280" width="34" height="18" rx="3" fill="#B84A35"/><rect x="42" y="262" width="34" height="18" rx="3" fill="#D2654C"/>
    <g class="puff"><circle cx="190" cy="292" r="9" fill="#E6DED0"/><circle cx="204" cy="288" r="7" fill="#E6DED0"/></g>`,
  },
  'job-sorting': {
    title: '快递分拣', note: '挂着工牌守在传送带边，一个个纸箱滑过来，扫码枪「嘀」一下亮红光。',
    css: `.scan{animation:scan 1.2s ease-in-out infinite;transform-origin:190px 298px}
    .b1{animation:belt 2.4s linear infinite}.b2{animation:belt 2.4s linear -1.2s infinite}
    .beam{animation:beam 1.2s steps(1) infinite}
    .roll{animation:roll .6s linear infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes scan{0%,100%{transform:rotate(0)}50%{transform:rotate(-2deg)}}
    @keyframes belt{0%{opacity:0;transform:translateX(0)}10%,85%{opacity:1}100%{opacity:0;transform:translateX(-150px)}}
    @keyframes beam{0%,50%,70%,100%{opacity:0}55%,65%{opacity:1}}
    @keyframes roll{to{transform:rotate(-360deg)}}`,
    wrap: 'scan', wears: ['waist'],
    pig: { face: `<path d="M118 212Q150 240 192 226" fill="none" stroke="#4A6FB5" stroke-width="4"/>
    <rect x="140" y="228" width="26" height="32" rx="4" fill="#FFFFFF"/><rect x="144" y="232" width="18" height="10" rx="2" fill="#6FA8DC"/>
    <path d="M145 248h16M145 254h10" fill="none" stroke="#C9CED6" stroke-width="3" stroke-linecap="round"/>` },
    over: `<g class="b1"><rect x="176" y="222" width="44" height="34" rx="3" fill="#D9A066"/><path d="M198 222V256" fill="none" stroke="#F3D9B1" stroke-width="6"/></g>
    <g class="b2"><rect x="180" y="228" width="38" height="28" rx="3" fill="#C8904F"/><path d="M180 240H218" fill="none" stroke="#F3D9B1" stroke-width="5"/></g>
    <rect x="24" y="256" width="226" height="14" rx="7" fill="#5B5F73"/>
    <circle class="roll" cx="44" cy="263" r="5" fill="#9FA9B4"/><circle class="roll" cx="100" cy="263" r="5" fill="#9FA9B4"/><circle class="roll" cx="156" cy="263" r="5" fill="#9FA9B4"/><circle class="roll" cx="212" cy="263" r="5" fill="#9FA9B4"/>
    <path d="M40 270V300M234 270V300" fill="none" stroke="#3A3E52" stroke-width="8"/>
    <path d="M30 150L62 140L66 154L44 162L40 182H30Z" fill="#3A3E52"/>
    <path class="beam" d="M62 148L92 236" fill="none" stroke="#FF5A5A" stroke-width="4" stroke-linecap="round"/>`,
  },

  // ---- school stages (data.js SCHOOL_STAGES): study-<stage>.svg ----
  'study-primary': {
    title: '上小学', note: '系着红领巾、背着小黄书包，对着积木大声念，音符一个个往外冒。',
    css: `.recite{animation:recite .8s ease-in-out infinite;transform-origin:190px 298px}
    .n1{animation:note 1.6s ease-out infinite}.n2{animation:note 1.6s ease-out -.8s infinite}
    .top{animation:bounce .8s ease-in-out infinite}
    @keyframes recite{0%,100%{transform:rotate(0)}50%{transform:rotate(-2deg) translateY(-2px)}}
    @keyframes note{0%{opacity:0;transform:translate(0,0)}25%{opacity:1}100%{opacity:0;transform:translate(-14px,-56px)}}
    @keyframes bounce{50%{transform:translateY(-6px)}}
    ${WEAR.scarf.css}`,
    wrap: 'recite', wears: ['waist'],
    pig: { face: `${WEAR.scarf.svg}
    <path d="M236 58Q206 110 226 168" fill="none" stroke="#E5A92A" stroke-width="8"/>
    <rect x="244" y="40" width="70" height="80" rx="22" fill="#FFC83D" transform="rotate(8 280 80)"/>
    <rect x="254" y="84" width="52" height="26" rx="10" fill="#F5B52A" transform="rotate(8 280 80)"/>` },
    over: `<g class="n1"><circle cx="48" cy="200" r="7" fill="#8C9BC4"/><path d="M54 200V176l10 4" fill="none" stroke="#8C9BC4" stroke-width="4" stroke-linecap="round"/></g>
    <g class="n2"><circle cx="40" cy="176" r="6" fill="#FF9FB0"/><path d="M45 176V156l9 4" fill="none" stroke="#FF9FB0" stroke-width="4" stroke-linecap="round"/></g>
    <rect x="28" y="266" width="34" height="34" rx="4" fill="#FF7A93"/><circle cx="45" cy="283" r="9" fill="#FFFFFF"/>
    <rect x="64" y="266" width="34" height="34" rx="4" fill="#6FA8DC"/><path d="M81 273L91 292H71Z" fill="#FFFFFF"/>
    <g class="top"><rect x="46" y="230" width="34" height="34" rx="4" fill="#7DBF6A"/>${sparkle(63, 247, 11, '#FFFFFF', '')}</g>`,
  },
  'study-college': {
    title: '上大学', note: '面前摊着厚课本，荧光笔一行行划过去，旁边一摞书，头顶挂着校旗。',
    css: `.tilt{animation:tilt 2.4s ease-in-out infinite;transform-origin:190px 298px}
    .hl{stroke-dasharray:64;animation:hl 2.4s linear infinite}
    .pen{animation:pen 2.4s linear infinite}
    .flag{animation:flag 1.6s ease-in-out infinite;transform-origin:30px -26px}
    @keyframes tilt{0%,100%{transform:rotate(0)}40%{transform:rotate(-2.5deg)}}
    @keyframes hl{0%{stroke-dashoffset:64}70%,100%{stroke-dashoffset:0}}
    @keyframes pen{0%{transform:translateX(0);opacity:0}8%{opacity:1}70%{transform:translateX(56px);opacity:1}100%{transform:translateX(56px);opacity:0}}
    @keyframes flag{50%{transform:rotate(6deg)}}`,
    wrap: 'tilt',
    under: `<path d="M24 -30H140" fill="none" stroke="#B0875A" stroke-width="3"/>
    <g class="flag"><path d="M30 -28L110 -16L30 -2Z" fill="#6A5ACD"/><circle cx="54" cy="-15" r="5" fill="#FFE27A"/></g>`,
    over: `<path d="M34 276L110 262V300H34Z" fill="#FFFDF6"/><path d="M110 262L186 276V300H110Z" fill="#F3EEDF"/>
    <path d="M118 278L172 286M118 290L160 296" fill="none" stroke="#D9D2C0" stroke-width="4" stroke-linecap="round"/>
    <path class="hl" d="M44 282L100 272" fill="none" stroke="#FFF07A" stroke-width="8" stroke-linecap="round" opacity=".9"/>
    <path d="M44 294L96 285" fill="none" stroke="#D9D2C0" stroke-width="4" stroke-linecap="round"/>
    <g class="pen"><path d="M40 270L54 252" fill="none" stroke="#F5D33A" stroke-width="10" stroke-linecap="round"/><path d="M40 270L36 276" fill="none" stroke="#3A3E52" stroke-width="5" stroke-linecap="round"/></g>
    <rect x="300" y="280" width="58" height="20" rx="3" fill="#6FA8DC"/><rect x="306" y="262" width="50" height="18" rx="3" fill="#E5534B"/><rect x="302" y="246" width="54" height="16" rx="3" fill="#7DBF6A"/>`,
  },
  'study-graduate': {
    title: '读研究生', note: '戴护目镜做实验，烧瓶里咕嘟咕嘟冒泡，偶尔「噗」地冒一小团烟。',
    css: `.tilt{animation:tilt 2.4s ease-in-out infinite;transform-origin:190px 298px}
    .bub{animation:bub 1.4s ease-out infinite}.bub2{animation:bub 1.4s ease-out -.5s infinite}.bub3{animation:bub 1.4s ease-out -1s infinite}
    .poof{animation:poof 4.2s ease-out infinite;transform-box:fill-box;transform-origin:50% 100%}
    .liq{animation:slosh 1.4s ease-in-out infinite;transform-origin:56px 288px}
    @keyframes tilt{0%,100%{transform:rotate(0)}40%{transform:rotate(-3deg)}75%{transform:rotate(-1deg)}}
    @keyframes bub{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(-60px)}}
    @keyframes poof{0%,80%{opacity:0;transform:scale(.4)}86%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.4) translateY(-10px)}}
    @keyframes slosh{50%{transform:scaleY(1.06)}}`,
    wrap: 'tilt', wears: ['eyes'],
    pig: { face: `<path d="M58 132C80 112 196 118 228 152" fill="none" stroke="#5B5F73" stroke-width="6"/>
    <ellipse cx="91" cy="142" rx="24" ry="19" fill="#BFE6F6" opacity=".55"/><ellipse cx="91" cy="142" rx="24" ry="19" fill="none" stroke="#5B8DB8" stroke-width="5"/>
    <ellipse cx="165" cy="157" rx="24" ry="19" fill="#BFE6F6" opacity=".55"/><ellipse cx="165" cy="157" rx="24" ry="19" fill="none" stroke="#5B8DB8" stroke-width="5"/>
    <path d="M115 146L141 152" fill="none" stroke="#5B8DB8" stroke-width="5"/>` },
    over: `<path d="M48 236V208h18v28l26 46c3 6-1 12-8 12H30c-7 0-11-6-8-12Z" fill="#EAF6FB" opacity=".9"/>
    <path class="liq" d="M37 262H77L92 284c2 5-1 10-6 10H28c-5 0-8-5-6-10Z" fill="#7DDCA8"/>
    <rect x="44" y="200" width="26" height="10" rx="4" fill="#C9CED6"/>
    <circle class="bub" cx="56" cy="190" r="6" fill="#A9E6C4"/><circle class="bub2" cx="64" cy="186" r="4" fill="#A9E6C4"/><circle class="bub3" cx="52" cy="184" r="5" fill="#A9E6C4"/>
    <g class="poof"><circle cx="58" cy="170" r="16" fill="#D7F0E2"/><circle cx="44" cy="160" r="11" fill="#D7F0E2"/><circle cx="72" cy="158" r="12" fill="#D7F0E2"/></g>
    <rect x="300" y="262" width="58" height="10" rx="3" fill="#B0875A"/><rect x="306" y="272" width="6" height="28" fill="#B0875A"/><rect x="346" y="272" width="6" height="28" fill="#B0875A"/>
    <rect x="310" y="226" width="10" height="40" rx="5" fill="#EAF6FB"/><rect x="310" y="246" width="10" height="20" rx="5" fill="#FF9FB0"/>
    <rect x="326" y="226" width="10" height="40" rx="5" fill="#EAF6FB"/><rect x="326" y="240" width="10" height="26" rx="5" fill="#8C9BC4"/>
    <rect x="342" y="226" width="10" height="40" rx="5" fill="#EAF6FB"/><rect x="342" y="252" width="10" height="14" rx="5" fill="#FFD35A"/>`,
  },
  'study-doctor': {
    title: '读博士', note: '深夜台灯下守着一大摞论文，戴着圆眼镜、挂着黑眼圈，打个盹又猛地惊醒，咖啡还冒着热气。',
    css: `.doze{animation:doze 4s ease-in-out infinite;transform-origin:190px 298px}
    .steam{animation:steam 2s ease-in-out infinite}
    .tw{animation:tw 2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}.tw2{animation:tw 2s ease-in-out -1s infinite;transform-box:fill-box;transform-origin:50% 50%}
    .glow{animation:glow 4s ease-in-out infinite}
    @keyframes doze{0%,55%,100%{transform:rotate(0)}70%{transform:rotate(-4deg) translateY(4px)}74%{transform:rotate(1deg) translateY(-3px)}80%{transform:rotate(0)}}
    @keyframes steam{0%,100%{opacity:0;transform:translateY(6px)}50%{opacity:.9;transform:translateY(-6px)}}
    @keyframes tw{0%,100%{opacity:.2;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}
    @keyframes glow{0%,100%{opacity:.55}50%{opacity:.8}}`,
    wrap: 'doze', wears: ['eyes'],
    pig: { face: `${glasses('#7A5A3A')}
    <path d="M80 166Q91 172 102 166M154 181Q165 187 176 181" fill="none" stroke="#B9A7CF" stroke-width="5" stroke-linecap="round"/>` },
    under: `<path d="M330 -30a28 28 0 1 0 18 50 24 24 0 1 1-18-50Z" fill="#FFE27A"/>
    ${sparkle(270, -16, 10, '#FFE27A', 'tw')}${sparkle(244, 14, 7, '#FFE27A', 'tw2')}${sparkle(352, 40, 8, '#FFE27A', 'tw2')}`,
    over: `<path class="glow" d="M40 206L84 252H30Z" fill="#FFF4C8"/>
    ${DESK}
    <path d="M30 252L36 244H52L58 252Z" fill="#5B5F73"/><path d="M44 244L50 206L34 178" fill="none" stroke="#5B5F73" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M24 186L50 172L56 202Z" fill="#E5534B"/>
    <rect x="84" y="244" width="62" height="8" rx="1" fill="#FFFDF6"/><rect x="88" y="236" width="60" height="8" rx="1" fill="#F3EEDF"/><rect x="84" y="228" width="62" height="8" rx="1" fill="#FFFDF6"/>
    <rect x="86" y="220" width="60" height="8" rx="1" fill="#F3EEDF"/><rect x="84" y="212" width="62" height="8" rx="1" fill="#FFFDF6"/>
    <path class="steam" d="M164 214q-5-7 0-14t0-14M178 214q-5-7 0-14" fill="none" stroke="#D8CFC2" stroke-width="4" stroke-linecap="round"/>
    <path d="M156 222H186V246C186 250 183 252 179 252H163C159 252 156 250 156 246Z" fill="#FFFFFF"/>
    <path d="M186 228C198 228 198 244 186 244" fill="none" stroke="#FFFFFF" stroke-width="5"/>`,
  },
  'react-graduate': {
    title: '博士毕业', note: '戴学位帽、抱着卷好的证书，高兴得把帽子抛上天又接住，彩带撒下来。',
    css: `.hop{animation:hop .8s ease-in-out infinite;transform-origin:190px 298px}
    .cap{animation:toss 2.4s cubic-bezier(.3,0,.4,1) infinite;transform-origin:168px 52px}
    .tassel{animation:swing .8s ease-in-out infinite;transform-origin:236px 52px}
    .f{animation:fall 1.6s linear infinite;transform-box:fill-box;transform-origin:50% 50%}.f2{animation-delay:-.5s}.f3{animation-delay:-1.1s}
    @keyframes hop{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
    @keyframes toss{0%,25%,85%,100%{transform:translateY(0) rotate(0)}55%{transform:translateY(-70px) rotate(-200deg)}}
    @keyframes swing{0%,100%{transform:rotate(-10deg)}50%{transform:rotate(12deg)}}
    @keyframes fall{0%{opacity:0;transform:translateY(-30px) rotate(0)}15%{opacity:1}100%{opacity:0;transform:translateY(260px) rotate(240deg)}}`,
    wrap: 'hop', wears: ['head'],
    pig: { eyes: 'happy', blush: cheeks(18, 10, '#FF9AA0', '.6'), face: `<g class="cap">
    <path d="M126 58C124 76 200 82 208 62L206 48L130 52Z" fill="#3A3A48"/>
    <path d="M94 50L168 26L242 46L168 70Z" fill="#2E2E3A"/><circle cx="168" cy="48" r="5" fill="#F5C24C"/>
    <path d="M168 48L236 52" fill="none" stroke="#F5C24C" stroke-width="3"/>
    <g class="tassel"><path d="M236 52V84" fill="none" stroke="#F5C24C" stroke-width="4"/><rect x="230" y="82" width="12" height="16" rx="3" fill="#F5C24C"/></g></g>
    <rect x="30" y="224" width="88" height="24" rx="12" fill="#FFFDF6"/><ellipse cx="34" cy="236" rx="6" ry="12" fill="#EDE6D3"/>
    <rect x="68" y="222" width="12" height="28" fill="#E5534B"/><path d="M74 250l-8 16M74 250l8 16" fill="none" stroke="#E5534B" stroke-width="5" stroke-linecap="round"/>` },
    under: [[60, '#FF7A93', ''], [120, '#6FA8DC', 'f2'], [190, '#FFD35A', 'f3'], [250, '#7DBF6A', ''], [320, '#B49CD8', 'f2'], [290, '#FF9FB0', 'f3']].map(([x, c, d]) =>
      `<g class="f ${d}"><rect x="${x}" y="-20" width="8" height="18" rx="2" fill="${c}"/></g>`).join(''),
  },

  // ---- trips by region (world.js REGIONS): away-trip-<region>.svg ----
  'away-trip-china': trip('旅行 · 中国', '远处是一段长城和烽火台，头顶一盏红灯笼晃呀晃。', {
    css: `.lantern{animation:swing 2s ease-in-out infinite;transform-origin:60px -36px}
    @keyframes swing{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}`,
    under: `<path d="M24 30C70 4 110 22 150 4S250 -14 300 6 340 22 360 16" fill="none" stroke="#DCC59A" stroke-width="12"/>
    <path d="M24 21C70 -5 110 13 150 -5S250 -23 300 -3 340 13 360 7" fill="none" stroke="#DCC59A" stroke-width="8" stroke-dasharray="7 7"/>
    <rect x="138" y="-22" width="26" height="26" fill="#D1B585"/><path d="M132 -22L151 -34L170 -22Z" fill="#C9433C"/>
    <g class="lantern"><path d="M60 -36V-18" fill="none" stroke="#8B6B4E" stroke-width="3"/>
    <rect x="50" y="-20" width="20" height="5" rx="2" fill="#F5C24C"/><ellipse cx="60" cy="0" rx="17" ry="16" fill="#E5534B"/>
    <path d="M60 -16V16" fill="none" stroke="#C9433C" stroke-width="3"/><rect x="50" y="14" width="20" height="5" rx="2" fill="#F5C24C"/>
    <path d="M60 19V36" fill="none" stroke="#F5C24C" stroke-width="4" stroke-linecap="round"/></g>`,
  }),
  'away-trip-eastasia': trip('旅行 · 东亚', '远处是雪顶富士山，旁边一座红鸟居，樱花瓣飘下来。', {
    css: `.p1{animation:petal 3s linear infinite;transform-box:fill-box;transform-origin:50% 50%}
    .p2{animation:petal 3s linear -1s infinite;transform-box:fill-box;transform-origin:50% 50%}
    .p3{animation:petal 3s linear -2s infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes petal{0%{opacity:0;transform:translate(0,0) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translate(-70px,300px) rotate(300deg)}}`,
    under: `<path d="M196 44L280 -26L360 44Z" fill="#A9C1DE"/><path d="M262 -11L280 -26L298 -11L290 -4L280 -12L270 -4Z" fill="#FFFFFF"/>
    <g fill="none" stroke="#E5534B" stroke-linecap="round"><path d="M42 -8V58M86 -8V58" stroke-width="8"/><path d="M28 -20Q64 -30 100 -20" stroke-width="10"/><path d="M36 -4H92" stroke-width="6"/></g>`,
    over: `<ellipse class="p1" cx="140" cy="-30" rx="7" ry="4" fill="#FFC2D1"/><ellipse class="p2" cx="220" cy="-30" rx="6" ry="4" fill="#FFB0C4"/><ellipse class="p3" cx="300" cy="-30" rx="7" ry="4" fill="#FFC2D1"/>`,
  }),
  'away-trip-southasia': trip('旅行 · 南亚·东南亚', '远处一座金色佛塔，身边的椰子树叶子沙沙地摇。', {
    css: `.palm{animation:palm 2.4s ease-in-out infinite;transform-origin:58px -6px}
    .sun{animation:glow 2.4s ease-in-out infinite}
    @keyframes palm{50%{transform:rotate(5deg)}}
    @keyframes glow{50%{opacity:.6}}`,
    under: `<circle class="sun" cx="200" cy="-8" r="20" fill="#FFE27A"/>
    <path d="M296 -34L304 -2H288Z" fill="#E5B33A"/><path d="M262 44C262 4 330 4 330 44Z" fill="#F2C14E"/><rect x="254" y="40" width="84" height="8" rx="3" fill="#E5B33A"/>
    <path d="M44 120Q30 50 58 -6" fill="none" stroke="#A8764C" stroke-width="9" stroke-linecap="round"/>
    <g class="palm"><path d="M58 -6C40 -26 20 -18 24 -4M58 -6C70 -30 96 -26 100 -12M58 -6C40 2 30 18 34 30M58 -6C80 -2 96 10 94 24" fill="none" stroke="#5FA84E" stroke-width="9" stroke-linecap="round"/>
    <circle cx="54" cy="4" r="6" fill="#8B6B4E"/><circle cx="64" cy="6" r="6" fill="#8B6B4E"/></g>`,
  }),
  'away-trip-europe': trip('旅行 · 欧洲', '远处一座小铁塔，云慢慢飘过，背包里插着一根比猪还长的法棍。', {
    css: `.cloud{animation:drift 6s ease-in-out infinite}.cloud2{animation:drift 6s ease-in-out -3s infinite}
    @keyframes drift{50%{transform:translateX(-24px)}}`,
    under: `${EIFFEL}
    <g class="cloud"><path d="M250 -4a14 14 0 0 1 26-8 16 16 0 0 1 30 6 10 10 0 0 1 0 20H254a10 10 0 0 1-4-18Z" fill="#E6ECF2"/></g>
    <g class="cloud2"><path d="M170 -20a11 11 0 0 1 20-6 12 12 0 0 1 24 5 8 8 0 0 1 0 15H174a8 8 0 0 1-4-14Z" fill="#E6ECF2"/></g>`,
    back: `${BAGUETTE}`,
  }),
  'away-trip-americas': trip('旅行 · 美洲', '远处是高楼天际线和举着火炬的自由女神，路边一株仙人掌。', {
    css: `.flame{animation:flame .5s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
    .win{animation:win 2s steps(1) infinite}
    @keyframes flame{50%{transform:scale(.8,1.15)}}
    @keyframes win{50%{opacity:.3}}`,
    under: `<g fill="#DCE3EC"><rect x="214" y="-6" width="24" height="50"/><rect x="242" y="-26" width="20" height="70"/><rect x="266" y="2" width="28" height="42"/><rect x="298" y="-18" width="22" height="62"/><rect x="324" y="-2" width="30" height="46"/></g>
    <g class="win" fill="#FFF4C8"><rect x="247" y="-18" width="4" height="6"/><rect x="253" y="-6" width="4" height="6"/><rect x="303" y="-10" width="4" height="6"/><rect x="311" y="2" width="4" height="6"/></g>
    <g fill="#7FB8A4"><path d="M28 120L32 40H48L52 120Z"/><circle cx="40" cy="28" r="11"/></g>
    <path d="M30 20L26 10M38 16V4M46 18L52 8M46 34L58 -10" fill="none" stroke="#7FB8A4" stroke-width="5" stroke-linecap="round"/>
    <path class="flame" d="M60 -12c-9-6-7-16 0-22 7 6 9 16 0 22Z" fill="#F5A23C"/>`,
    over: `<path d="M326 300V236a11 11 0 0 1 22 0V300Z" fill="#6FB36A"/><path d="M326 266h-10a8 8 0 0 1-8-8v-14" fill="none" stroke="#6FB36A" stroke-width="10" stroke-linecap="round"/>
    <path d="M334 250h.1M342 274h.1" fill="none" stroke="#4E8F4A" stroke-width="4" stroke-linecap="round"/>`,
  }),
  'away-trip-mideast': trip('旅行 · 中东·非洲', '远处两座金字塔，大太阳晒着，猪戴上了墨镜。', {
    css: `.rays{animation:spin 10s linear infinite;transform-origin:56px -4px}
    .heat{animation:heat 1.6s ease-in-out infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes heat{0%,100%{opacity:0;transform:translateY(4px)}50%{opacity:.8;transform:translateY(-4px)}}`,
    under: `${PYRAMIDS}
    <g class="rays"><path d="M56 -38V-30M56 22V30M22 -4H30M82 -4H90M32 -28l6 6M74 14l6 6M80 -28l-6 6M32 20l6-6" fill="none" stroke="#FFD35A" stroke-width="5" stroke-linecap="round"/></g>
    <circle cx="56" cy="-4" r="20" fill="#FFD35A"/>`,
    gear: WEAR.sunglasses.svg, wears: ['head', 'eyes'],
    over: `${HEAT}`,
  }),
  'away-trip-oceania': trip('旅行 · 大洋洲·南极', '远处是歌剧院的白贝壳顶，雪花飘着，一只小企鹅摇摇摆摆跟在后面。', {
    css: SNOW_CSS,
    under: OPERA,
    over: `${SNOW}
    ${PENGUIN}`,
  }),

  // ---- [ST0011] trips by destination (world.js PLACES): away-trip-<place>.svg ----
  // Every place has its own landmark and something that moves; the region's
  // drawing above stays as the fallback for a place that has none.

  // China
  'away-trip-beijing': trip('旅行 · 北京', '远处是红墙黄瓦的城楼，天上一只沙燕风筝一上一下地飘。', {
    css: `.kite{animation:kite 2.6s ease-in-out infinite;transform-origin:82px -6px}
    .ktail{animation:ktail .8s ease-in-out infinite;transform-origin:82px 2px}
    @keyframes kite{0%,100%{transform:translate(0,0) rotate(-6deg)}50%{transform:translate(8px,-6px) rotate(6deg)}}
    @keyframes ktail{50%{transform:skewX(14deg)}}`,
    under: `<rect x="244" y="4" width="108" height="40" fill="#C9433C"/><path d="M290 44V28a8 8 0 0 1 16 0V44Z" fill="#8E2E2A"/>
    <path d="M232 8H364L350 -4H246Z" fill="#F2B33D"/><rect x="258" y="-16" width="80" height="12" fill="#B83A34"/>
    <path d="M246 -14H350L336 -28H260Z" fill="#F2B33D"/><path d="M262 -28H334" fill="none" stroke="#D99A2B" stroke-width="3"/>
    <path d="M82 2Q50 60 30 128" fill="none" stroke="#8B6B4E" stroke-width="2"/>
    <g class="kite"><path d="M82 -16C66 -28 46 -20 42 -4C56 -10 70 -8 82 0C94 -8 108 -10 122 -4C118 -20 98 -28 82 -16Z" fill="#3A6EA5"/>
    <path d="M82 -16C74 -22 60 -20 56 -12M82 -16C90 -22 104 -20 108 -12" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
    <circle cx="82" cy="-16" r="6" fill="#E5534B"/><path d="M82 -10V2" fill="none" stroke="#2E2E3A" stroke-width="5" stroke-linecap="round"/>
    <g class="ktail"><path d="M82 2L70 26M82 2L94 26" fill="none" stroke="#E5534B" stroke-width="5" stroke-linecap="round"/></g></g>`,
  }),
  'away-trip-chengdu': trip('旅行 · 成都', '身边的竹子沙沙地摇，路边坐着一只熊猫，抱着竹子嚼个不停。', {
    css: `.bamboo{animation:sway 3s ease-in-out infinite;transform-origin:44px 140px}
    .chew{animation:chew .6s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
    @keyframes sway{50%{transform:rotate(3deg)}}
    @keyframes chew{50%{transform:translateY(2px) rotate(-7deg)}}`,
    under: `<path d="M196 44Q236 -6 280 26Q312 -4 360 22V44Z" fill="#CFE3C2"/><path d="M240 44Q280 10 320 30Q340 18 360 30V44Z" fill="#B5D6A4"/>
    <g class="bamboo"><path d="M34 140V-36M56 100V-30" fill="none" stroke="#7DBF6A" stroke-width="8"/>
    <path d="M30 100H38M30 50H38M30 0H38M52 60H60M52 14H60" fill="none" stroke="#5E9E4E" stroke-width="3"/>
    <g fill="#6FB35E"><ellipse cx="48" cy="-10" rx="14" ry="4" transform="rotate(-30 48 -10)"/><ellipse cx="22" cy="20" rx="12" ry="4" transform="rotate(30 22 20)"/>
    <ellipse cx="70" cy="-26" rx="14" ry="4" transform="rotate(-20 70 -26)"/><ellipse cx="72" cy="30" rx="12" ry="4" transform="rotate(-35 72 30)"/><ellipse cx="44" cy="44" rx="12" ry="4" transform="rotate(25 44 44)"/></g></g>`,
    over: `<ellipse cx="338" cy="282" rx="22" ry="20" fill="#F7F5F0" stroke="#D9D4CA" stroke-width="2"/>
    <ellipse cx="322" cy="294" rx="8" ry="6" fill="#2E2E3A"/><ellipse cx="354" cy="294" rx="8" ry="6" fill="#2E2E3A"/>
    <path d="M318 290L306 236" fill="none" stroke="#7DBF6A" stroke-width="5" stroke-linecap="round"/><ellipse cx="302" cy="232" rx="8" ry="3" fill="#6FB35E" transform="rotate(-50 302 232)"/>
    <ellipse cx="322" cy="270" rx="7" ry="10" fill="#2E2E3A" transform="rotate(30 322 270)"/>
    <g class="chew"><circle cx="324" cy="236" r="6" fill="#2E2E3A"/><circle cx="350" cy="236" r="6" fill="#2E2E3A"/>
    <circle cx="337" cy="250" r="16" fill="#F7F5F0" stroke="#D9D4CA" stroke-width="2"/>
    <ellipse cx="331" cy="249" rx="4" ry="5" fill="#2E2E3A"/><ellipse cx="344" cy="249" rx="4" ry="5" fill="#2E2E3A"/>
    <circle cx="331" cy="248" r="1.5" fill="#FFFFFF"/><circle cx="344" cy="248" r="1.5" fill="#FFFFFF"/><ellipse cx="337" cy="257" rx="3" ry="2" fill="#2E2E3A"/></g>`,
  }),
  'away-trip-xian': trip('旅行 · 西安', '远处是古城墙和钟楼，头顶一口铜钟咚咚地晃，路边一个兵马俑探出头来。', {
    css: `.bell{animation:swing 2s ease-in-out infinite;transform-origin:64px -30px}
    .dong{animation:dong 2s ease-out infinite;transform-box:fill-box;transform-origin:0 50%}
    .peek{animation:peek 3s ease-in-out infinite}
    @keyframes swing{0%,100%{transform:rotate(-10deg)}50%{transform:rotate(10deg)}}
    @keyframes dong{0%,40%{opacity:0;transform:scale(.6)}50%{opacity:1}100%{opacity:0;transform:scale(1.3)}}
    @keyframes peek{0%,30%,100%{transform:translateY(12px)}50%,80%{transform:translateY(0)}}`,
    under: `<rect x="24" y="16" width="336" height="28" fill="#BFA47E"/><path d="M24 12H360" fill="none" stroke="#BFA47E" stroke-width="10" stroke-dasharray="12 8"/>
    <rect x="276" y="-2" width="68" height="20" fill="#A68A62"/><path d="M296 18V8a14 14 0 0 1 28 0V18Z" fill="#7A6446"/>
    <rect x="290" y="-16" width="40" height="14" fill="#C9433C"/><path d="M274 -12H346L334 -22H286Z" fill="#3D6B5A"/>
    <rect x="297" y="-30" width="26" height="9" fill="#C9433C"/><path d="M284 -26H336L326 -34H294Z" fill="#3D6B5A"/><circle cx="310" cy="-36" r="3" fill="#F5C24C"/>
    <path d="M28 -30H100" fill="none" stroke="#8B6B4E" stroke-width="6" stroke-linecap="round"/>
    <g class="bell"><path d="M64 -30V-22" fill="none" stroke="#8B6B4E" stroke-width="3"/><path d="M50 4C50 -14 54 -22 64 -22S78 -14 78 4L82 8H46Z" fill="#B8863B"/>
    <path d="M52 -6H76" fill="none" stroke="#8E6528" stroke-width="3"/><circle cx="64" cy="10" r="4" fill="#8E6528"/></g>
    <path class="dong" d="M90 -16q8 10 0 20M98 -22q12 16 0 32" fill="none" stroke="#D9A85C" stroke-width="4" stroke-linecap="round"/>`,
    over: `<g class="peek"><path d="M314 300V276C314 266 324 262 336 262S358 266 358 276V300Z" fill="#B88A64"/>
    <path d="M318 280H354M318 290H354" fill="none" stroke="#9C7250" stroke-width="3"/>
    <circle cx="342" cy="228" r="7" fill="#9C7250"/><circle cx="336" cy="246" r="15" fill="#C99A72"/>
    <path d="M330 246h.1M342 246h.1" fill="none" stroke="#5E4630" stroke-width="5" stroke-linecap="round"/>
    <path d="M330 254Q336 258 342 254" fill="none" stroke="#5E4630" stroke-width="3" stroke-linecap="round"/></g>`,
  }),
  'away-trip-shanghai': trip('旅行 · 上海', '远处是东方明珠和陆家嘴的高楼，黄浦江上一条渡轮慢慢开过，路边一笼小笼包冒着热气。', {
    css: `.glow{animation:glow 1.6s ease-in-out infinite}
    .ferry{animation:ferry 7s ease-in-out infinite}
    .steam{animation:steam 2s ease-in-out infinite}
    @keyframes glow{50%{opacity:.55}}
    @keyframes ferry{0%,100%{transform:translateX(0)}50%{transform:translateX(70px)}}
    @keyframes steam{0%,100%{opacity:0;transform:translateY(6px)}50%{opacity:.9;transform:translateY(-6px)}}`,
    under: `<rect x="24" y="30" width="336" height="14" fill="#CFE6F2"/>
    <g fill="#DCE3EC"><path d="M214 30V-4L222 -16L230 -4V30Z"/><path d="M240 30V-22L256 -30V30Z"/><rect x="262" y="6" width="22" height="24"/><rect x="340" y="0" width="20" height="30"/></g>
    <path d="M244 -18h8v6h-8Z" fill="#FFFFFF"/>
    <path d="M304 30L313 -10M328 30L319 -10" fill="none" stroke="#B5BCC6" stroke-width="5"/><rect x="314" y="-28" width="4" height="26" fill="#B5BCC6"/>
    <path d="M316 -29V-36" fill="none" stroke="#B5BCC6" stroke-width="3"/>
    <circle class="glow" cx="316" cy="-2" r="11" fill="#E86AA0"/><circle class="glow" cx="316" cy="-25" r="6" fill="#E86AA0"/>
    <g class="ferry"><path d="M30 30H84L76 42H38Z" fill="#E5534B"/><rect x="40" y="18" width="30" height="12" rx="2" fill="#FFFDF6" stroke="#C9CED6" stroke-width="2"/>
    <path d="M46 24h4M54 24h4M62 24h4" fill="none" stroke="#7FA7C9" stroke-width="3"/></g>`,
    over: `<path class="steam" d="M46 262q-5-7 0-14t0-14M62 262q-5-7 0-14" fill="none" stroke="#D8CFC2" stroke-width="4" stroke-linecap="round"/>
    <rect x="28" y="274" width="54" height="24" rx="6" fill="#D9A85C"/><path d="M28 286H82" fill="none" stroke="#B9873E" stroke-width="3"/>
    <ellipse cx="55" cy="274" rx="27" ry="7" fill="#E8BF77"/><ellipse cx="55" cy="275" rx="22" ry="5" fill="#C9984F"/>
    <g fill="#FFF6E6"><circle cx="44" cy="271" r="7"/><circle cx="56" cy="269" r="7"/><circle cx="68" cy="271" r="7"/></g>`,
  }),

  // East Asia
  'away-trip-tokyo': trip('旅行 · 东京', '远处是红白相间的东京塔和亮着霓虹的楼，路边一只招财猫不停地招手。', {
    css: `.paw{animation:beckon .7s ease-in-out infinite;transform-origin:350px 252px}
    .neon{animation:neon 1.2s steps(1) infinite}
    @keyframes beckon{0%,100%{transform:rotate(0)}50%{transform:rotate(-22deg)}}
    @keyframes neon{50%{opacity:.25}}`,
    under: `<g fill="#E3E6F0"><rect x="250" y="-2" width="26" height="46"/><rect x="280" y="-18" width="22" height="62"/><rect x="306" y="4" width="24" height="40"/><rect x="334" y="-10" width="26" height="54"/></g>
    <g class="neon"><rect x="283" y="-12" width="16" height="22" rx="3" fill="#FF7A93"/><path d="M287 -6h8M287 0h8M291 -8v14" fill="none" stroke="#FFFFFF" stroke-width="2"/></g>
    <g fill="none" stroke-linecap="round"><path d="M56 -36V-18" stroke="#B5BCC6" stroke-width="3"/><path d="M56 -18L34 128M56 -18L78 128" stroke="#E5534B" stroke-width="7"/>
    <path d="M50 30L68 72M62 30L44 72M44 100H70" stroke="#E5534B" stroke-width="3"/></g>
    <rect x="44" y="14" width="24" height="9" rx="2" fill="#FFFFFF" stroke="#E5534B" stroke-width="3"/><rect x="40" y="50" width="32" height="10" rx="2" fill="#FFFFFF" stroke="#E5534B" stroke-width="3"/>`,
    over: `<path d="M318 300V268C318 256 326 250 338 250S358 256 358 268V300Z" fill="#FFFDF6" stroke="#E1DCD3" stroke-width="2"/>
    <path d="M322 262Q338 270 354 262" fill="none" stroke="#E5534B" stroke-width="5"/><circle cx="338" cy="268" r="4" fill="#F5C24C"/>
    <path d="M324 230L326 218L334 226ZM352 230L350 218L342 226Z" fill="#FFFDF6" stroke="#E1DCD3" stroke-width="2"/>
    <circle cx="338" cy="240" r="15" fill="#FFFDF6" stroke="#E1DCD3" stroke-width="2"/><circle cx="345" cy="232" r="4" fill="#F2B33D"/>
    <path d="M331 238q2-3 4 0M341 238q2-3 4 0M336 245q2 2 4 0" fill="none" stroke="#3A3A48" stroke-width="2" stroke-linecap="round"/>
    <g class="paw"><path d="M350 252V232" fill="none" stroke="#E1DCD3" stroke-width="13" stroke-linecap="round"/><path d="M350 252V232" fill="none" stroke="#FFFDF6" stroke-width="9" stroke-linecap="round"/></g>`,
  }),
  'away-trip-seoul': trip('旅行 · 首尔', '远处是宫殿的屋檐和山顶的南山塔，猪举着应援手灯挥个不停，爱心往上冒。', {
    css: `.stick{animation:cheer .8s ease-in-out infinite;transform-origin:56px 300px}
    .h1{animation:float 1.6s ease-out infinite}.h2{animation:float 1.6s ease-out -.8s infinite}
    @keyframes cheer{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(12deg)}}
    @keyframes float{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(-50px)}}
    ${BLINK_CSS}`,
    under: `<path d="M196 44Q274 -18 360 30V44Z" fill="#A8D49A"/>
    <rect x="270" y="-20" width="8" height="32" fill="#E6ECF2" stroke="#C9D3DE" stroke-width="2"/><ellipse cx="274" cy="-14" rx="13" ry="6" fill="#C9D3DE"/>
    <path d="M274 -20V-33" fill="none" stroke="#B5BCC6" stroke-width="3"/><circle class="tip" cx="274" cy="-34" r="3" fill="#E5534B"/>
    <rect x="34" y="14" width="56" height="24" fill="#F3EEDF"/><path d="M40 14V38M84 14V38M62 14V38" fill="none" stroke="#C9433C" stroke-width="5"/>
    <path d="M22 16Q62 4 102 16L96 4Q62 -6 28 4Z" fill="#3F5F6B"/><path d="M28 4Q62 -6 96 4" fill="none" stroke="#5B7F8C" stroke-width="3"/>`,
    over: `${heart(28, 200, .5, '#FF7AC0', 'h1')}${heart(50, 212, .4, '#FFB3D9', 'h2')}
    <g class="stick"><rect x="52" y="250" width="8" height="48" rx="4" fill="#5B5F73"/><circle cx="56" cy="238" r="16" fill="#FFB3D9"/><circle cx="56" cy="238" r="10" fill="#FF7AC0"/>
    <path transform="translate(50 234) scale(.33)" d="M0 0c0-10 13-15 18-5 5-10 18-5 18 5 0 13-18 23-18 23S0 13 0 0Z" fill="#FFFFFF"/></g>`,
  }),
  'away-trip-ulaanbaatar': trip('旅行 · 乌兰巴托', '草原上几座蒙古包冒着炊烟，一只雄鹰在天上盘旋，路边的小羊低头吃草。', {
    css: `.eagle{animation:soar 6s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    .smoke{animation:smoke 2.4s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    .smoke2{animation:smoke 2.4s ease-out -1.2s infinite;transform-box:fill-box;transform-origin:50% 50%}
    .graze{animation:graze 1.8s ease-in-out infinite;transform-origin:36px 276px}
    @keyframes soar{0%,100%{transform:translate(0,0) rotate(0)}25%{transform:translate(40px,-8px) rotate(6deg)}50%{transform:translate(80px,0) rotate(0)}75%{transform:translate(40px,8px) rotate(-6deg)}}
    @keyframes smoke{0%{opacity:0;transform:translate(0,0) scale(.6)}30%{opacity:.8}100%{opacity:0;transform:translate(10px,-30px) scale(1.4)}}
    @keyframes graze{0%,100%{transform:rotate(0)}50%{transform:rotate(-20deg)}}`,
    under: `<path d="M24 44Q100 8 180 30T360 22V44Z" fill="#BFDDA0"/>
    <rect x="268" y="10" width="52" height="26" fill="#FFFDF6" stroke="#D9D2C0" stroke-width="2"/><rect x="268" y="16" width="52" height="4" fill="#4E7FB0"/>
    <path d="M262 12Q294 -14 326 12Z" fill="#F3EEDF" stroke="#D9D2C0" stroke-width="2"/><rect x="288" y="20" width="12" height="16" fill="#E5534B"/><rect x="306" y="-8" width="5" height="10" fill="#8B6B4E"/>
    <circle class="smoke" cx="308" cy="-14" r="5" fill="#E6ECF2"/><circle class="smoke2" cx="308" cy="-14" r="4" fill="#E6ECF2"/>
    <rect x="332" y="22" width="30" height="16" fill="#FFFDF6" stroke="#D9D2C0" stroke-width="2"/><path d="M328 24Q346 8 364 24Z" fill="#F3EEDF" stroke="#D9D2C0" stroke-width="2"/>
    <g class="eagle"><path d="M30 -14Q42 -24 54 -16Q60 -20 66 -16Q78 -24 90 -14Q76 -14 66 -8L60 -4L54 -8Q44 -14 30 -14Z" fill="#6E5239"/><circle cx="60" cy="-13" r="3" fill="#FFFDF6"/></g>`,
    over: `<path d="M42 286V298M64 286V298" fill="none" stroke="#5B5F73" stroke-width="4" stroke-linecap="round"/>
    <path d="M34 284a10 10 0 0 1 4-18 10 10 0 0 1 18-4 10 10 0 0 1 18 6 9 9 0 0 1-2 18H40a8 8 0 0 1-6-2Z" fill="#FFFDF6" stroke="#D9D2C0" stroke-width="2"/>
    <g class="graze"><ellipse cx="32" cy="280" rx="7" ry="9" fill="#5B5F73"/><circle cx="30" cy="278" r="1.5" fill="#FFFFFF"/></g>`,
  }),

  // South & Southeast Asia
  'away-trip-bangkok': trip('旅行 · 曼谷', '远处是金顶的寺庙和高高的郑王庙塔，路边一辆嘟嘟车颠颠地等客。', {
    css: `.tuk{animation:tuk .3s ease-in-out infinite}
    .puff{animation:puff 1s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes tuk{50%{transform:translateY(-3px)}}
    @keyframes puff{0%{opacity:0;transform:translate(0,0) scale(.5)}15%{opacity:.8}100%{opacity:0;transform:translate(14px,-8px) scale(1.5)}}`,
    under: `<path d="M20 40L62 6L104 40Z" fill="#C9433C"/><path d="M34 14L62 -14L90 14Z" fill="#C9433C"/>
    <path d="M20 40L62 6L104 40M34 14L62 -14L90 14" fill="none" stroke="#F2B33D" stroke-width="4" stroke-linejoin="round"/>
    <path d="M62 -14V-32M20 40q-6-8 2-12M104 40q6-8-2-12" fill="none" stroke="#F2B33D" stroke-width="4" stroke-linecap="round"/>
    <path d="M304 -34L308 -18L314 0L318 22L322 44H286L290 22L294 0L300 -18Z" fill="#E8D7B0"/>
    <path d="M296 -4H312M292 18H316M300 -20H308" fill="none" stroke="#C9B48A" stroke-width="3"/>
    <path d="M262 44L266 20L272 8L278 20L282 44ZM326 44L330 20L336 8L342 20L346 44Z" fill="#E8D7B0"/>`,
    over: `<circle class="puff" cx="364" cy="284" r="6" fill="#D8D8D8"/>
    <g class="tuk"><path d="M312 288V270Q312 258 324 256L340 254V288Z" fill="#2F9C95"/><rect x="336" y="254" width="26" height="34" fill="#2F9C95"/>
    <rect x="306" y="244" width="58" height="9" rx="3" fill="#F5C24C"/><path d="M314 253V262M340 253V256" fill="none" stroke="#5B5F73" stroke-width="3"/>
    <circle cx="312" cy="276" r="4" fill="#FFE27A"/>
    <circle cx="324" cy="292" r="8" fill="#3A3E52"/><circle cx="352" cy="292" r="8" fill="#3A3E52"/><circle cx="324" cy="292" r="3" fill="#C9CED6"/><circle cx="352" cy="292" r="3" fill="#C9CED6"/></g>`,
  }),
  'away-trip-singapore': trip('旅行 · 新加坡', '鱼尾狮的水柱哗哗地喷，远处是顶着船的金沙酒店，路边一棵擎天树闪着灯。', {
    css: `.spout{animation:spout .6s linear infinite}
    @keyframes spout{to{stroke-dashoffset:-28}}
    ${TWINKLE_CSS}`,
    under: `<g fill="#DCE3EC"><path d="M262 44L266 -4H280L278 44Z"/><path d="M292 44L294 -4H308L308 44Z"/><path d="M322 44L322 -4H336L340 44Z"/></g>
    <path d="M250 -10H350L344 -3H256Z" fill="#B9C2CC"/>
    <path d="M24 78H74L70 64H28Z" fill="#B9AE9A"/>
    <path d="M34 64C26 52 30 36 44 26L60 30C66 44 62 58 52 64Z" fill="#F4F1EA" stroke="#C9C1B0" stroke-width="2"/>
    <path d="M36 50q6-4 12 0M38 58q6-4 12 0" fill="none" stroke="#C9C1B0" stroke-width="2"/>
    <path d="M30 70Q20 60 28 46" fill="none" stroke="#F4F1EA" stroke-width="7" stroke-linecap="round"/>
    <circle cx="50" cy="14" r="17" fill="#E6DCC8"/><circle cx="56" cy="14" r="12" fill="#F4F1EA" stroke="#C9C1B0" stroke-width="2"/>
    <circle cx="60" cy="10" r="2" fill="#5B5F73"/><path d="M62 18h6" fill="none" stroke="#C9C1B0" stroke-width="3" stroke-linecap="round"/>
    <path class="spout" d="M68 16Q130 -40 200 30" fill="none" stroke="#8CCBEB" stroke-width="5" stroke-linecap="round" stroke-dasharray="8 6"/>`,
    over: `<path d="M336 300V250" fill="none" stroke="#8C6BB1" stroke-width="8"/><path d="M336 270L322 250M336 270L350 250" fill="none" stroke="#8C6BB1" stroke-width="3"/>
    <path d="M314 232Q336 256 358 232Z" fill="#8C6BB1"/><path d="M316 232H356" fill="none" stroke="#6FB35E" stroke-width="6" stroke-linecap="round"/>
    ${sparkle(322, 226, 6, '#FFE27A', 'tw')}${sparkle(338, 222, 7, '#FFE27A', 'tw2')}${sparkle(352, 226, 6, '#FFE27A', 'tw3')}`,
  }),
  'away-trip-newdelhi': trip('旅行 · 新德里', '远处是莲花寺和印度门，路边一只孔雀把尾巴哗地一下开屏。', {
    css: `.fan{animation:fan 3s ease-in-out infinite;transform-origin:332px 290px}
    @keyframes fan{0%,100%{transform:scale(.55,.4)}40%,70%{transform:scale(1,1)}}`,
    under: `<g fill="#F4F1EA" stroke="#D9D2C0" stroke-width="2"><path d="M26 40Q30 16 48 8Q46 26 52 40Z"/><path d="M98 40Q94 16 76 8Q78 26 72 40Z"/><path d="M40 40Q44 4 62 -6Q80 4 84 40Z"/></g>
    <rect x="272" y="-22" width="64" height="66" fill="#D9A57A"/><path d="M292 44V10a12 12 0 0 1 24 0V44Z" fill="#FFFFFF"/>
    <rect x="268" y="-28" width="72" height="8" fill="#C88E62"/><path d="M290 -28Q304 -40 318 -28Z" fill="#C88E62"/>
    <path d="M278 -12H286M322 -12H330" fill="none" stroke="#C88E62" stroke-width="3"/>`,
    over: `<g class="fan"><path d="M294 290A38 38 0 0 1 370 290Z" fill="#3E9C6E"/>
    ${[[306, 280], [314, 269], [327, 262], [342, 264], [353, 272], [358, 280]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#F5C24C"/><circle cx="${x}" cy="${y}" r="4" fill="#2E5FA8"/>`).join('')}</g>
    <path d="M330 296V300M336 296V300" fill="none" stroke="#C9A276" stroke-width="3"/>
    <ellipse cx="332" cy="284" rx="9" ry="13" fill="#2E5FA8"/><path d="M328 274Q324 262 326 254" fill="none" stroke="#2E5FA8" stroke-width="6" stroke-linecap="round"/>
    <circle cx="326" cy="252" r="5" fill="#2E5FA8"/><path d="M321 251L315 253L321 255Z" fill="#F5C24C"/><circle cx="324" cy="251" r="1.5" fill="#FFFFFF"/>
    <path d="M326 247L324 240M328 247L331 240" fill="none" stroke="#2E5FA8" stroke-width="2"/>`,
  }),

  // Europe
  'away-trip-paris': trip('旅行 · 巴黎', '远处的埃菲尔铁塔一闪一闪，旁边是凯旋门，背包里插着一根比猪还长的法棍。', {
    css: TWINKLE_CSS,
    under: `${EIFFEL}
    ${sparkle(48, 10, 7, '#FFE27A', 'tw')}${sparkle(66, 44, 6, '#FFE27A', 'tw2')}${sparkle(42, 78, 6, '#FFE27A', 'tw3')}${sparkle(58, -22, 5, '#FFE27A', 'tw2')}
    <path d="M270 44V-14H346V44H326V18a18 18 0 0 0-36 0V44Z" fill="#E8DCC4"/><rect x="266" y="-22" width="84" height="10" fill="#D9C9A8"/>
    <path d="M276 -4H284M332 -4H340" fill="none" stroke="#D9C9A8" stroke-width="4"/>`,
    back: BAGUETTE,
  }),
  'away-trip-rome': trip('旅行 · 罗马', '远处是缺了一角的斗兽场和柏树，猪往许愿池里抛了一枚硬币。', {
    css: `.coin{animation:toss 2.4s ease-in infinite}
    .ripple{animation:ripple 2.4s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes toss{0%{opacity:0;transform:translate(0,0)}10%{opacity:1}25%{transform:translate(-14px,-26px)}50%{opacity:1;transform:translate(-32px,30px)}51%,100%{opacity:0;transform:translate(-32px,30px)}}
    @keyframes ripple{0%,50%{opacity:0;transform:scale(.3)}55%{opacity:1}100%{opacity:0;transform:scale(1.4)}}`,
    under: `<path d="M224 44V-2Q288 -22 352 -14L346 2L356 16L350 44Z" fill="#E2C39A"/>
    <path d="M232 34H344" fill="none" stroke="#C49A6C" stroke-width="10" stroke-dasharray="7 6"/>
    <path d="M232 14Q288 2 344 6" fill="none" stroke="#C49A6C" stroke-width="9" stroke-dasharray="6 6"/>
    <path d="M232 -4Q288 -18 340 -10" fill="none" stroke="#C49A6C" stroke-width="5" stroke-dasharray="5 7"/>
    <g fill="#5E8F52"><path d="M40 -16C50 6 52 50 48 90H32C28 50 30 6 40 -16Z"/><path d="M64 -28C74 -4 76 40 72 80H56C52 40 54 -4 64 -28Z"/></g>`,
    over: `<path d="M24 280H86L80 300H30Z" fill="#E6DCC8"/><ellipse cx="55" cy="280" rx="31" ry="7" fill="#9FD3E6"/>
    <ellipse class="ripple" cx="54" cy="280" rx="10" ry="3" fill="none" stroke="#FFFFFF" stroke-width="2"/>
    <g class="coin"><circle cx="86" cy="244" r="6" fill="#F5C24C" stroke="#D99A2B" stroke-width="2"/></g>`,
  }),
  'away-trip-london': trip('旅行 · 伦敦', '远处的大本钟分针转啊转，头顶一朵乌云一直在下雨，路边一个红色电话亭。', {
    css: `.minute{animation:spin 6s linear infinite;transform-origin:54px 14px}
    .rain{animation:rain .7s linear infinite}.rain2{animation:rain .7s linear -.35s infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes rain{0%{opacity:0;transform:translate(0,0)}20%{opacity:.8}100%{opacity:0;transform:translate(-8px,40px)}}`,
    under: `<rect x="38" y="-4" width="32" height="140" fill="#C9A86A"/><path d="M46 34V130M62 34V130" fill="none" stroke="#B39256" stroke-width="3"/>
    <path d="M34 -4L54 -36L74 -4Z" fill="#6E5A3A"/><rect x="34" y="-6" width="40" height="5" fill="#A88A50"/>
    <circle cx="54" cy="14" r="12" fill="#FFFDF6" stroke="#8B6B4E" stroke-width="3"/><path d="M54 14V8" fill="none" stroke="#3A3A48" stroke-width="3" stroke-linecap="round"/>
    <g class="minute"><path d="M54 14H62" fill="none" stroke="#3A3A48" stroke-width="2" stroke-linecap="round"/></g>
    <path d="M232 -2a16 16 0 0 1 28-12 20 20 0 0 1 38 4 14 14 0 0 1 4 28H236a12 12 0 0 1-4-20Z" fill="#B9C2CC"/>
    <path d="M306 -10a12 12 0 0 1 22-8 14 14 0 0 1 26 4 10 10 0 0 1 2 20H310a9 9 0 0 1-4-16Z" fill="#C9D0D8"/>`,
    over: `<g fill="none" stroke="#9FC3DA" stroke-width="3" stroke-linecap="round"><path class="rain" d="M250 22l-3 12M290 26l-3 12M330 18l-3 12"/><path class="rain2" d="M270 20l-3 12M310 24l-3 12M350 16l-3 12"/></g>
    <path d="M318 226Q337 214 356 226Z" fill="#C42A23"/><rect x="320" y="226" width="34" height="74" rx="3" fill="#D8342C"/>
    <rect x="324" y="230" width="26" height="6" fill="#2E2E3A"/>
    <g fill="#F7E7C6"><rect x="325" y="242" width="10" height="12"/><rect x="339" y="242" width="10" height="12"/><rect x="325" y="258" width="10" height="12"/><rect x="339" y="258" width="10" height="12"/></g>`,
  }),

  // Americas
  'away-trip-newyork': trip('旅行 · 纽约', '一辆黄色出租车开过布鲁克林大桥，后面是帝国大厦和高楼天际线。', {
    css: `.taxi{animation:taxi 3.5s linear infinite}
    @keyframes taxi{75%{opacity:1}100%{opacity:0;transform:translateX(260px)}}
    ${BLINK_CSS}`,
    under: `<g fill="#DCE3EC"><rect x="254" y="4" width="22" height="40"/><rect x="280" y="-6" width="16" height="50"/>
    <path d="M300 44V-6H304V-16H308V-24H312V-16H316V-6H320V44Z"/><rect x="324" y="8" width="18" height="36"/><rect x="344" y="-2" width="16" height="46"/></g>
    <path d="M310 -24V-33" fill="none" stroke="#C9D3DE" stroke-width="2"/><circle class="tip" cx="310" cy="-34" r="2.5" fill="#E5534B"/>
    <rect x="50" y="-12" width="22" height="52" fill="#B98E6A"/><rect x="184" y="-12" width="22" height="52" fill="#B98E6A"/>
    <path d="M54 30V4l3-6 3 6V30ZM62 30V4l3-6 3 6V30ZM188 30V4l3-6 3 6V30ZM196 30V4l3-6 3 6V30Z" fill="#FFFFFF"/>
    <path d="M24 2Q42 20 61 -12M61 -12Q128 36 195 -12M195 -12Q218 14 240 30" fill="none" stroke="#8C7A68" stroke-width="3"/>
    <path d="M80 10V30M100 16V30M120 18V30M140 18V30M160 16V30M176 8V30" fill="none" stroke="#B5A898" stroke-width="2"/>
    <path d="M24 30H250" fill="none" stroke="#8C7A68" stroke-width="5"/>
    <g class="taxi"><path d="M-24 18L-20 12H-10L-6 18Z" fill="#F5C24C"/><rect x="-30" y="17" width="28" height="9" rx="3" fill="#F5C24C"/>
    <circle cx="-24" cy="27" r="3" fill="#3A3E52"/><circle cx="-8" cy="27" r="3" fill="#3A3E52"/></g>`,
  }),
  'away-trip-mexicocity': trip('旅行 · 墨西哥城', '远处一座阶梯金字塔，头顶挂着一串彩色剪纸小旗，风一吹就晃。', {
    css: `.pp{animation:flutter 1.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 0}
    .pp2{animation:flutter 1.2s ease-in-out -.6s infinite;transform-box:fill-box;transform-origin:50% 0}
    @keyframes flutter{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}`,
    under: `<g fill="#C9A27A"><rect x="244" y="34" width="116" height="10"/><rect x="256" y="22" width="92" height="12"/><rect x="268" y="10" width="68" height="12"/><rect x="280" y="-2" width="44" height="12"/></g>
    <rect x="290" y="-14" width="24" height="12" fill="#B5835A"/><path d="M302 -2V44" fill="none" stroke="#E2C39A" stroke-width="8"/>
    <path d="M24 -30Q192 -6 360 -30" fill="none" stroke="#8B6B4E" stroke-width="2"/>
    ${PAPEL}`,
  }),
  'away-trip-rio': trip('旅行 · 里约热内卢', '远处是山顶张开双臂的基督像和面包山的缆车，路边一只足球蹦蹦跳跳。', {
    css: `.car{animation:car 5s ease-in-out infinite}
    .ball{animation:ball .8s infinite}
    .shade{animation:shade .8s infinite;transform-box:fill-box;transform-origin:50% 50%}
    @keyframes car{0%,10%{transform:translate(0,0)}50%,60%{transform:translate(70px,-28px)}100%{transform:translate(0,0)}}
    @keyframes ball{0%,100%{transform:translateY(0);animation-timing-function:ease-out}50%{transform:translateY(-34px);animation-timing-function:ease-in}}
    @keyframes shade{0%,100%{transform:scale(1);animation-timing-function:ease-out}50%{transform:scale(.6);animation-timing-function:ease-in}}`,
    under: `<rect x="24" y="36" width="336" height="8" fill="#BFE0F0"/>
    <path d="M24 60Q48 4 70 -2Q90 6 118 44H24Z" fill="#8FBF7A"/>
    <g fill="#F4F1EA" stroke="#D9D2C0" stroke-width="1"><rect x="68" y="-22" width="5" height="20"/><rect x="58" y="-20" width="25" height="4" rx="2"/><circle cx="70.5" cy="-25" r="3"/></g>
    <path d="M222 44Q236 4 262 8Q274 20 280 44Z" fill="#8FBF7A"/><path d="M282 44Q288 -16 322 -20Q350 -16 360 8V44Z" fill="#7FAF6E"/>
    <path d="M248 11L330 -22" fill="none" stroke="#8C7A68" stroke-width="2"/>
    <g class="car"><path d="M254 9V14" fill="none" stroke="#8C7A68" stroke-width="2"/><rect x="246" y="13" width="16" height="11" rx="3" fill="#E5534B"/><rect x="249" y="16" width="10" height="4" fill="#FFFDF6"/></g>`,
    over: `<ellipse class="shade" cx="50" cy="296" rx="12" ry="3" fill="#000000" opacity=".12"/>
    <g class="ball"><circle cx="50" cy="278" r="12" fill="#FFFFFF" stroke="#3A3A48" stroke-width="2"/><path d="M50 272l5 4-2 6h-6l-2-6Z" fill="#3A3A48"/>
    <path d="M38 276l4 1M62 276l-4 1M44 289l2-3M56 289l-2-3" fill="none" stroke="#3A3A48" stroke-width="2"/></g>`,
  }),

  // Middle East & Africa
  'away-trip-dubai': trip('旅行 · 迪拜', '沙丘那头是帆船酒店和高耸入云的哈利法塔，空气里闪着金光。', {
    css: `${TWINKLE_CSS}
    ${BLINK_CSS}`,
    under: `<path d="M24 44Q70 8 120 28Q160 10 220 36V44Z" fill="#EBCB8B"/>
    <path d="M262 44L268 -14Q302 4 300 44Z" fill="#F4F6F8" stroke="#C9D3DE" stroke-width="2"/><path d="M268 -14V44" fill="none" stroke="#B5BCC6" stroke-width="3"/>
    <path d="M270 6Q284 14 298 26" fill="none" stroke="#C9D3DE" stroke-width="2"/>
    <path d="M324 44V12H328V-4H332V-20H336V-36H338V-20H342V-4H346V12H350V44Z" fill="#C9D6E3"/><circle class="tip" cx="337" cy="-36" r="2.5" fill="#E5534B"/>
    ${sparkle(214, -18, 8, '#F5C24C', 'tw')}${sparkle(110, -24, 7, '#F5C24C', 'tw2')}${sparkle(300, -26, 6, '#F5C24C', 'tw3')}${sparkle(40, -10, 7, '#F5C24C', 'tw2')}`,
  }),
  'away-trip-cairo': trip('旅行 · 开罗', '远处是金字塔，一头骆驼慢悠悠地走着，太阳太大，猪戴上了墨镜。', {
    css: `.camel{animation:camel .6s ease-in-out infinite}
    .lg1{animation:stride .6s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 0}
    .lg2{animation:stride .6s ease-in-out -.3s infinite;transform-box:fill-box;transform-origin:50% 0}
    .heat{animation:heat 1.6s ease-in-out infinite}
    @keyframes camel{50%{transform:translateY(-3px)}}
    @keyframes stride{0%,100%{transform:rotate(14deg)}50%{transform:rotate(-14deg)}}
    @keyframes heat{0%,100%{opacity:0;transform:translateY(4px)}50%{opacity:.8;transform:translateY(-4px)}}`,
    under: `<circle cx="200" cy="-18" r="13" fill="#FFD35A"/>
    ${PYRAMIDS}
    <path d="M24 44Q120 30 360 40V44Z" fill="#EBCB8B"/>
    <g class="camel"><path class="lg1" d="M62 8V34" fill="none" stroke="#C49A5C" stroke-width="5" stroke-linecap="round"/><path class="lg2" d="M68 8V34" fill="none" stroke="#C49A5C" stroke-width="5" stroke-linecap="round"/>
    <path class="lg2" d="M84 8V34" fill="none" stroke="#C49A5C" stroke-width="5" stroke-linecap="round"/><path class="lg1" d="M90 8V34" fill="none" stroke="#C49A5C" stroke-width="5" stroke-linecap="round"/>
    <path d="M98 0q6 6 2 14" fill="none" stroke="#C49A5C" stroke-width="3"/>
    <ellipse cx="74" cy="0" rx="24" ry="11" fill="#D9A86A"/><path d="M60 -6Q72 -26 86 -6Z" fill="#D9A86A"/>
    <path d="M54 -2Q44 -10 46 -24" fill="none" stroke="#D9A86A" stroke-width="8" stroke-linecap="round"/>
    <ellipse cx="42" cy="-26" rx="8" ry="5" fill="#D9A86A"/><circle cx="41" cy="-28" r="1.5" fill="#5E4630"/></g>`,
    gear: WEAR.sunglasses.svg, wears: ['head', 'eyes'],
    over: HEAT,
  }),
  'away-trip-nairobi': trip('旅行 · 内罗毕', '大草原上一棵平顶的金合欢树，夕阳下一只长颈鹿慢慢嚼着叶子，鸟儿飞过。', {
    css: `.gir{animation:munch 2.4s ease-in-out infinite;transform-origin:352px 130px}
    .bird{animation:fly 8s linear infinite}
    @keyframes munch{0%,100%{transform:rotate(0)}50%{transform:rotate(-4deg)}}
    @keyframes fly{0%{opacity:0;transform:translateX(40px)}10%,90%{opacity:1}100%{opacity:0;transform:translateX(-200px)}}`,
    under: `<circle cx="268" cy="2" r="24" fill="#FFC27A"/>
    <path d="M24 44Q100 34 180 40T360 36V44Z" fill="#E2C77E"/>
    <path d="M50 130Q46 60 58 6M58 30Q70 14 84 4M56 20Q42 10 34 2" fill="none" stroke="#6E5239" stroke-width="6" stroke-linecap="round"/>
    <ellipse cx="60" cy="0" rx="40" ry="9" fill="#6FA25A"/><ellipse cx="54" cy="-8" rx="28" ry="7" fill="#82B36A"/>
    <g class="bird"><path d="M200 -24q5-5 10 0q5-5 10 0M226 -14q4-4 8 0q4-4 8 0" fill="none" stroke="#5E4630" stroke-width="2.5" stroke-linecap="round"/></g>
    <g class="gir"><path d="M346 130L338 -6L350 -8L360 130Z" fill="#F2C14E"/>
    <g fill="#C98A3A"><circle cx="346" cy="10" r="4"/><circle cx="350" cy="40" r="5"/><circle cx="346" cy="70" r="4"/><circle cx="354" cy="100" r="5"/></g>
    <path d="M340 -20V-30M346 -18V-28" fill="none" stroke="#C98A3A" stroke-width="3" stroke-linecap="round"/><circle cx="340" cy="-31" r="2.5" fill="#8B6B4E"/><circle cx="346" cy="-29" r="2.5" fill="#8B6B4E"/>
    <ellipse cx="350" cy="-14" rx="5" ry="2.5" fill="#E0A94A"/><ellipse cx="334" cy="-12" rx="14" ry="8" fill="#F2C14E"/><ellipse cx="322" cy="-10" rx="6" ry="5" fill="#E0A94A"/>
    <circle cx="334" cy="-15" r="2" fill="#5E4630"/></g>`,
  }),

  // Oceania & Antarctica
  'away-trip-sydney': trip('旅行 · 悉尼', '远处是海港大桥和歌剧院的白贝壳顶，一只戴拳击手套的袋鼠蹦在前面。', {
    css: `.roo{animation:hop .7s ease-in-out infinite;transform-origin:50px 298px}
    @keyframes hop{0%,100%{transform:translateY(0) rotate(0)}40%{transform:translateY(-22px) rotate(-6deg)}}`,
    under: `<rect x="24" y="36" width="336" height="8" fill="#BFE0F0"/>
    <path d="M24 30Q90 -34 156 30M24 30Q90 -18 156 30" fill="none" stroke="#8E9AA6" stroke-width="5"/>
    <path d="M50 30V10M70 30V1M90 30V-2M110 30V1M130 30V10" fill="none" stroke="#B5BCC6" stroke-width="2"/>
    <path d="M24 30H170" fill="none" stroke="#8E9AA6" stroke-width="5"/>
    <rect x="18" y="14" width="12" height="22" fill="#C9C1B0"/><rect x="152" y="14" width="12" height="22" fill="#C9C1B0"/>
    ${OPERA}`,
    over: `<g class="roo"><path d="M62 290Q76 296 84 288" fill="none" stroke="#C68B59" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="46" cy="296" rx="12" ry="4" fill="#B07A4A"/>
    <ellipse cx="54" cy="274" rx="13" ry="20" fill="#C68B59" transform="rotate(-15 54 274)"/><ellipse cx="48" cy="278" rx="7" ry="12" fill="#E2B88E" transform="rotate(-15 48 278)"/>
    <ellipse cx="48" cy="234" rx="3" ry="8" fill="#C68B59" transform="rotate(15 48 234)"/><ellipse cx="42" cy="246" rx="11" ry="8" fill="#C68B59"/>
    <circle cx="38" cy="244" r="2" fill="#3A3A48"/><circle cx="31" cy="247" r="2" fill="#3A3A48"/>
    <circle cx="36" cy="264" r="6" fill="#E5534B"/><circle cx="44" cy="268" r="6" fill="#E5534B"/></g>`,
  }),
  'away-trip-auckland': trip('旅行 · 奥克兰', '绿油油的山坡上有一扇圆圆的霍比特人小门，远处是天空塔，路边一只几维鸟埋头啄地。', {
    css: `.peck{animation:peck 1.2s ease-in-out infinite;transform-origin:340px 284px}
    .cloud{animation:drift 6s ease-in-out infinite}
    @keyframes peck{0%,40%,100%{transform:rotate(0)}55%{transform:rotate(-18deg)}70%{transform:rotate(0)}}
    @keyframes drift{50%{transform:translateX(-20px)}}`,
    under: `<path d="M24 44Q90 0 160 30T290 22T360 30V44Z" fill="#9CCB7E"/>
    <g class="cloud"><path d="M200 -16a11 11 0 0 1 20-6 12 12 0 0 1 24 5 8 8 0 0 1 0 15H204a8 8 0 0 1-4-14Z" fill="#E6ECF2"/></g>
    <rect x="312" y="-4" width="8" height="48" fill="#DCE3EC"/><ellipse cx="316" cy="-6" rx="14" ry="6" fill="#C9D3DE"/><ellipse cx="316" cy="-14" rx="9" ry="4" fill="#C9D3DE"/>
    <path d="M316 -18V-36" fill="none" stroke="#B5BCC6" stroke-width="3"/>
    <path d="M24 70Q30 6 70 4Q104 6 112 50Z" fill="#8FC06E"/>
    <circle cx="58" cy="34" r="15" fill="#8B6B4E"/><circle cx="58" cy="34" r="12" fill="#4E8F4A"/><path d="M58 22V46M47 34H69" fill="none" stroke="#3F7A3C" stroke-width="2"/>
    <circle cx="62" cy="34" r="2.5" fill="#F5C24C"/><circle cx="88" cy="30" r="6" fill="#F7E7C6" stroke="#8B6B4E" stroke-width="3"/>`,
    over: `<path d="M334 292L330 300M346 292L344 300" fill="none" stroke="#C9A276" stroke-width="3" stroke-linecap="round"/>
    <g class="peck"><ellipse cx="342" cy="280" rx="18" ry="13" fill="#8B6B4E"/><circle cx="326" cy="274" r="7" fill="#7A5A3A"/>
    <path d="M320 276Q306 284 300 294" fill="none" stroke="#E2C39A" stroke-width="3" stroke-linecap="round"/><circle cx="324" cy="272" r="1.6" fill="#2E2E3A"/>
    <path d="M336 274q6 3 12 0M340 284q6 3 12 0" fill="none" stroke="#6E5239" stroke-width="2"/></g>`,
  }),
  'away-trip-antarctica': trip('旅行 · 南极科考站', '冰山旁边是橙色的科考站，天上的极光一飘一飘，雪花里一只小企鹅跟在后面。', {
    css: `.aur{animation:aur 4s ease-in-out infinite}.aur2{animation:aur 4s ease-in-out -2s infinite}
    @keyframes aur{0%,100%{opacity:.35;transform:translateX(0)}50%{opacity:.8;transform:translateX(-16px)}}
    ${BLINK_CSS}
    ${SNOW_CSS}`,
    under: `<path class="aur" d="M24 -18Q90 -38 160 -16T300 -20T440 -16" fill="none" stroke="#7EE0B5" stroke-width="10" stroke-linecap="round"/>
    <path class="aur2" d="M24 -6Q100 -24 170 -4T320 -8T470 -4" fill="none" stroke="#A9B4F5" stroke-width="7" stroke-linecap="round"/>
    <path d="M24 44Q120 32 220 40T360 36V44Z" fill="#EEF4F8"/>
    <path d="M24 44L36 4L52 -6L64 10L80 2L96 44Z" fill="#E6F2FA" stroke="#CFE3F0" stroke-width="2"/><path d="M52 -6L58 44H40Z" fill="#CFE3F0"/>
    <path d="M270 36V44M302 36V44M316 36V44M346 36V44" fill="none" stroke="#8E9AA6" stroke-width="3"/>
    <rect x="264" y="14" width="44" height="22" rx="3" fill="#F28C3A"/><rect x="310" y="8" width="40" height="28" rx="3" fill="#E5734A"/>
    <g fill="#CFE6F5"><rect x="270" y="20" width="8" height="6"/><rect x="284" y="20" width="8" height="6"/><rect x="318" y="16" width="8" height="6"/><rect x="332" y="16" width="8" height="6"/></g>
    <path d="M340 8V-16M288 14V-6" fill="none" stroke="#8E9AA6" stroke-width="2"/><circle class="tip" cx="340" cy="-17" r="3" fill="#E5534B"/>
    <path d="M288 -6h14l-4 4 4 4h-14Z" fill="#4E7FB0"/>`,
    over: `${SNOW}
    ${PENGUIN}`,
  }),
}

// [Q0016] ART.ASSETS.V2: `body` is drawn first, on the body itself.
const SLOT_ORDER = ['body', 'face', 'waist', 'eyes', 'head']

function render(s) {
  // The empty wear slot: the art route fills it with the decorations worn,
  // skipping the slots this pose's own gear already covers.
  const occupies = SLOT_ORDER.filter(slot => (s.wears ?? []).includes(slot))
  const wear = s.dress === false ? '' : `<g class="wear" data-occupies="${occupies.join(' ')}"></g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" width="128" height="128" role="img" aria-label="${s.title}">
  <title>${s.title}</title>
  <!-- 行为资产（姿势）：${s.note} 本体是项目原有的 Noto 🐖，形状和颜色不变；由 tools/build-sprites.mjs 生成，别手改。 -->
  <style>${BASE_CSS}
    ${s.css}
    @media (prefers-reduced-motion:reduce){*{animation:none!important}}
  </style>
  ${s.under ?? ''}
  <g class="${s.wrap}">
  ${pig({ ...s.pig, wear })}
  </g>
  ${s.over ?? ''}
</svg>
`
}

/**
 * A decoration on its own: a faint outline of the pig shows where it sits, and
 * the part between the wear markers is what the art route pours into a pose.
 */
function renderWear(key) {
  const w = WEAR[key]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" width="128" height="128" role="img" aria-label="${w.title}">
  <title>${w.title}</title>
  <!-- 装饰资产（${w.slot}）：${w.note} 画在猪本体的坐标上，任何姿势都戴得上；由 tools/build-sprites.mjs 生成，别手改。 -->
  <style>@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>
  <g opacity=".18"><path fill="${C.far}" d="${P.farLeg}"/><path fill="${C.body}" d="${P.body}"/><path fill="${C.snout}" d="${P.snout}"/></g>
  <!-- wear:begin -->
  ${wearMarkup(key)}
  <!-- wear:end -->
</svg>
`
}

// Empty slots (no props, no face) would leave blank, space-only lines.
const write = (name, svg) => writeFileSync(new URL(name + '.svg', OUT), svg.replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n'))

let count = 0
for (const [name, s] of Object.entries(SPRITES)) {
  write(name, render(s))
  count += 1
}
for (const key of Object.keys(WEAR)) {
  write(`wear-${key}`, renderWear(key))
  count += 1
}
console.log(`wrote ${count} sprites to assets/`)
