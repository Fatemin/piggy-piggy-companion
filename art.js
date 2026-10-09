/**
 * [ST0004] Dressing a pose. The contract is docs/contracts/art-assets.md
 * (ART.ASSETS.V2); tools/build-sprites.mjs writes both halves of it:
 *
 *   pose (行为资产)        assets/<pose>.svg carries one empty wear slot,
 *                          `<g class="wear" data-occupies="head eyes"></g>`,
 *                          naming the slots its own gear already covers.
 *   decoration (装饰资产)  assets/wear-<key>.svg keeps what goes into a slot
 *                          between `<!-- wear:begin -->` and `<!-- wear:end -->`.
 *
 * Pure string work, no file access: the art route reads the files and calls
 * `dress`. A pose without a slot (a box, a grave, a soul) is never dressed.
 */
import { WEAR_SLOTS, wearableByKey } from './data.js'

const SLOT = /<g class="wear" data-occupies="([a-z ]*)"><\/g>/
const FRAGMENT = /<!-- wear:begin -->\s*([\s\S]*?)\s*<!-- wear:end -->/

/** The slots a pose's own gear covers, or null when the pose cannot be dressed. */
export function poseOccupies(poseSvg) {
  const match = SLOT.exec(poseSvg)
  if (match === null) return null
  return match[1].split(' ').filter(slot => slot !== '')
}

/** The markup a decoration file pours into a slot, or null if it has none. */
export function wearFragment(wearSvg) {
  const match = FRAGMENT.exec(wearSvg)
  return match === null ? null : match[1]
}

/**
 * Wardrobe keys from a `?wear=` value: known ones only, one per slot (the
 * first wins), in drawing order. Anything else is dropped, never echoed.
 */
export function parseWear(value) {
  const items = String(value ?? '').split(',').map(key => wearableByKey(key.trim())).filter(item => item !== null)
  return WEAR_SLOTS.map(slot => items.find(item => item.slot === slot)?.key).filter(key => key !== undefined)
}

/**
 * The pose with the decorations in its wear slot. `wears` is `[{key, svg}]`
 * in drawing order; a decoration whose slot the pose already covers stays off.
 */
export function dress(poseSvg, wears) {
  const occupies = poseOccupies(poseSvg)
  if (occupies === null) return poseSvg
  const markup = wears
    .filter(({ key }) => !occupies.includes(wearableByKey(key)?.slot))
    .map(({ svg }) => wearFragment(svg))
    .filter(fragment => fragment !== null)
    .join('\n    ')
  if (markup === '') return poseSvg
  return poseSvg.replace(SLOT, match => match.replace('></g>', () => `>${markup}</g>`))
}
