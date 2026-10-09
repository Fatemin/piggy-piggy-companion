# ART.ASSETS.V2 · 美术资产：行为资产与装饰资产

> contract_id: `ART.ASSETS.V2` · status: `CURRENT`

> 实施事实基线：ST0004（2026-10-02，装扮功能）；ST0012（发布前修订）把部位 `neck` 改为 `waist`：猪没有脖子，领巾类饰品绑在腰上。V1 尚未发布，故原地修订、不升版本。**V2（Q0016，健身房）**新增部位 `body`（画在身体上、最先画）和第一件 `body` 装饰 `muscle`，按 §4「新部位」升版本；`stage` 解锁改按「到过的最高体重」算（健身会减重）。以后**每一项新美术**在设计阶段就要先归类为行为资产或装饰资产（写进 design handoff），再按本文的接口实现；`test/contracts.test.js` 逐个文件比对 `assets/`。

## 1. 归属 Ownership

两类资产，互不越界：

| 类别 | 是什么 | 谁来选 | 文件 | 能画什么 | 不得画什么 |
|---|---|---|---|---|---|
| **行为资产**（姿势 pose） | 猪**在做什么**：动作、表情、场景道具（桌子、书、被子、路、粒子） | **游戏状态**（心情、外出、反应、阶段） | `assets/<pose>.svg` | 猪本体的动作与表情；场景道具；该行为**必需**的随身装备（工地安全帽、实验护目镜、旅行草帽），但必须在 `data-occupies` 声明它占了哪些部位 | 玩家可选的装饰；未声明部位上的穿戴物 |
| **装饰资产**（装扮 wear） | 猪**身上穿戴的东西** | **玩家**（衣柜） | `assets/wear-<key>.svg` | 一个部位上的穿戴物，画在猪本体坐标上 | 场景、动作、表情；任何改变游戏数值的东西 |

| 代码 | 拥有 | 不得越权 |
|---|---|---|
| `tools/build-sprites.mjs` | 两类资产的**唯一生成器**：姿势的 `wears` 声明、装饰的 `WEAR` 表 | 不手改 `assets/` 下生成的文件 |
| `data.js` `WEAR_SLOTS` / `WEARABLES` / `STAGE_OUTFIT` | 部位、装饰键与部位、解锁条件、各阶段默认穿戴 | 装饰不带任何数值字段 |
| `core.js` `wearUnlocked` / `wornFor` / `wear` / `wearAuto` | 解锁判定（从已有进度推导）、当前穿戴、穿脱规则 | 穿戴不改金币、属性、冷却等任何玩法数值 |
| `art.js` `dress` | 把装饰倒进姿势的穿戴槽（纯字符串） | 不读文件、不认识具体姿势 |
| `index.js` 美术路由 | `/dsh-pig/art/<pose>.svg?wear=<k1>,<k2>` 读文件并调用 `dress` | 只放行 `WEARABLES` 里的键 |
| `client.js` | 把快照 `pig.outfit.worn` 拼到每个姿势 URL 上 | 不在前端合成 SVG；不自行判断解锁 |

## 2. 字段 Fields

### 2.1 部位（绘制顺序，后画的在上）

`body`（V2）是身体本身：画在身体轮廓内（裁到 `P.body`），在所有部位之前画，所以腰饰、胡子、眼镜、帽子都盖在它上面；只画身体表面的东西（肌肉线条、腹肌），不画穿戴物。

`waist` 是腰部：猪没有脖子，红领巾、围巾这类饰品像绑在身上一样顺着身体绕一圈——沿 `build-sprites.mjs` 的 `WAIST` 腰线斜着画（上端靠头、下端靠屁股、向后鼓出一道弧），裁到身体轮廓内，不碰近耳；圈类同样倾斜，远半圈藏在身后。

<!-- contract:wear-slots -->
```json
["body", "face", "waist", "eyes", "head"]
```

### 2.2 装饰键 → 部位

<!-- contract:wear-keys -->
```json
{"bow": "head", "flatcap": "head", "mortarboard": "head", "strawhat": "head", "glasses": "eyes", "sunglasses": "eyes", "scarf": "waist", "whiskers": "face", "hulahoop": "waist", "swimring": "waist", "fannypack": "waist", "chainbelt": "waist", "pager": "waist", "muscle": "body", "gold": "body"}
```

解锁条件（`WEARABLES[].unlock`）：除 `shop` 外全部从存档已有进度推导、不存档；`shop` 是商店「装扮」货架上买的，买过的键记在存档 `wardrobeBought`（ST0012，见 [STORE.SAVE.V6](save-format.md)）：

| 键 | 名称 | 解锁 |
|---|---|---|
| `bow` | 🎀 蝴蝶结 | `always`：拆开纸盒就有 |
| `flatcap` | 🧢 鸭舌帽 | `stage middle`：长成中年猪（按到过的最高体重 `max(weightG, peakWeightG)` 算，健身减重不会退回去） |
| `mortarboard` | 🎓 学士帽 | `diploma`：持有任意一张毕业证 |
| `strawhat` | 👒 草帽 | `trip`：旅行回来过（`stats.trips > 0` 或已有纪念品） |
| `glasses` | 👓 圆眼镜 | `lessons null`：上过任意一节课 |
| `sunglasses` | 🕶️ 墨镜 | `region mideast`：带回过中东·非洲的纪念品 |
| `scarf` | 🧣 红领巾 | `lessons primary`：上过小学 |
| `whiskers` | 🧓 白眉白胡子 | `stage elder`：长成老年猪 |
| `hulahoop` | ⭕ 网红呼啦圈 | `shop 66`：商店购买 |
| `swimring` | 🦆 小黄鸭游泳圈 | `shop 88`：商店购买 |
| `fannypack` | 👝 多巴胺腰包 | `shop 168`：商店购买 |
| `chainbelt` | ⛓️ 杀马特腰链 | `shop 188`：商店购买 |
| `pager` | 📟 BP机皮带 | `shop 288`：商店购买 |
| `muscle` | 💪 肌肉 | `gym 100`：在健身房一共瘦掉 100 kg（`stats.gymLostG >= 100000`，Q0016）；解锁那一刻自动穿上 |
| `gold` | 🪙 黄金猪 | `coins 10000`：手里同时有过 10000 金币（`max(coins, stats.peakCoins)`，Q0016）；解锁那一刻若「身上」没穿东西就自动穿上 |

商店购买（`core.js` `buy` 对装饰键的分支）：每件只能买一次（已拥有拒绝 `owned`）、未孵化 / 死亡拒绝；扣 `unlock.price` 金币、记入 `wardrobeBought`、计一次 `stats.purchases`，并立刻穿上（同部位的换下）。装饰不进 `SHOP`、`inventory` 与背包，不能“使用”。

### 2.3 穿戴（存档 `outfit`，见 [STORE.SAVE.V6](save-format.md)）

| `outfit` | 含义 |
|---|---|
| `null` | 跟着阶段穿 `STAGE_OUTFIT`：小猪 `bow`、青年猪无、中年猪 `flatcap`、老年猪 `whiskers`（与 ST0004 之前烘焙在阶段图里的样子一致） |
| `[key…]` | 玩家自己搭配；每个部位至多一件，按 `wear-slots` 顺序；第一次在衣柜里改动时由当前穿戴物化而来 |

`wornFor` 只返回已解锁的键；纸盒和墓碑什么都不穿。

### 2.4 不可装扮的行为资产（画面里没有活着的猪）

<!-- contract:undressable-poses -->
```json
["soul", "stage-box", "stage-grave"]
```

### 2.5 自带装备、占用部位的行为资产

其他行为资产的 `data-occupies` 为空：玩家穿戴的全部显示。

<!-- contract:pose-occupies -->
```json
{
  "away-study": ["eyes"],
  "away-trip": ["head"],
  "away-trip-americas": ["head"],
  "away-trip-antarctica": ["head"],
  "away-trip-auckland": ["head"],
  "away-trip-bangkok": ["head"],
  "away-trip-beijing": ["head"],
  "away-trip-cairo": ["eyes", "head"],
  "away-trip-chengdu": ["head"],
  "away-trip-china": ["head"],
  "away-trip-dubai": ["head"],
  "away-trip-eastasia": ["head"],
  "away-trip-europe": ["head"],
  "away-trip-london": ["head"],
  "away-trip-mexicocity": ["head"],
  "away-trip-mideast": ["eyes", "head"],
  "away-trip-nairobi": ["head"],
  "away-trip-newdelhi": ["head"],
  "away-trip-newyork": ["head"],
  "away-trip-oceania": ["head"],
  "away-trip-paris": ["head"],
  "away-trip-rio": ["head"],
  "away-trip-rome": ["head"],
  "away-trip-seoul": ["head"],
  "away-trip-shanghai": ["head"],
  "away-trip-singapore": ["head"],
  "away-trip-southasia": ["head"],
  "away-trip-sydney": ["head"],
  "away-trip-tokyo": ["head"],
  "away-trip-ulaanbaatar": ["head"],
  "away-trip-xian": ["head"],
  "job-aitrainer": ["eyes"],
  "job-coach": ["waist"],
  "job-odd": ["head"],
  "job-office": ["waist"],
  "job-rider": ["head"],
  "job-site": ["head"],
  "job-sorting": ["waist"],
  "job-tea": ["head"],
  "job-vtuber": ["head"],
  "mood-asleep": ["head"],
  "mood-sick-3": ["head"],
  "react-bathe": ["head"],
  "react-graduate": ["head"],
  "study-doctor": ["eyes"],
  "study-graduate": ["eyes"],
  "study-primary": ["waist"]
}
```

### 2.6 文件接口

行为资产：在猪本体的分组里（随姿势动画一起动）恰好一个空穿戴槽，位于腮红之后、姿势自己的脸部道具之前：

```svg
<g class="wear" data-occupies="eyes head"></g>
```

装饰资产：独立可预览（淡色猪轮廓示意位置），注入部分夹在两个标记之间，外层 `<g>` 带键与部位；自带动画的 class 与 keyframes 一律以 `w-<key>` 开头，避免与姿势的 CSS 冲突：

```svg
<!-- wear:begin -->
<g class="w-mortarboard" data-wear="mortarboard" data-slot="head"><style>.w-mortarboard-tassel{…}</style>…</g>
<!-- wear:end -->
```

合成：`GET /dsh-pig/art/<pose>.svg?wear=<k1>,<k2>` → `parseWear` 过滤为已登记键、每部位一件、按部位顺序 → `dress` 跳过姿势已占部位、把片段写进槽里。没有槽的资产原样返回。

## 3. 不变量 Invariants

1. **一个文件只属于一类**：`assets/wear-<key>.svg` 是装饰资产，其余 `.svg` 都是行为资产。文件名不得再出现 `--<阶段>` 之类的“姿势 × 装饰”组合文件——组合在运行时完成。
2. **行为资产恰好一个穿戴槽**，`undressable-poses` 里的除外（零个）；槽里的 `data-occupies` 与 `pose-occupies` 一致。
3. **行为资产不含 `data-wear=`**：它自带的装备是行为的一部分，只靠 `data-occupies` 让出部位，不冒充装饰。
4. **装饰资产恰好一个片段**，`data-wear` 与文件名一致，`data-slot` 与 `wear-keys` 一致；`wear-keys` 与 `WEARABLES` 一一对应。
5. **装饰不改玩法**：`WEARABLES` 条目只有 `key`/`slot`/`label`/`emoji`/`unlock`（数字只有 `shop` 的售价 `unlock.price`，只在购买时扣金币；以及 `gym` / `coins` 的解锁门槛 `unlock.kg` / `unlock.coins`，只用于判断解锁）；穿脱只改 `outfit` 与 `lastActiveAt`。
6. **同一坐标系**：装饰画在猪本体（Noto 🐖，`VIEWBOX 24 -36 336 336`）坐标上；姿势只能移动整只猪（动画作用在分组上），不得重画本体，否则装饰会错位。
7. **新美术先归类**：设计交接文档（`docs/design/*design-handoff*.md`）必须写明每项新美术属于哪一类；行为资产写明占用部位，装饰资产写明部位与解锁条件。

## 4. 变更规则 Change rules

| 改动 | 要做的事 |
|---|---|
| 新姿势（行为资产） | `build-sprites.mjs` 的 `SPRITES` 加一项，自带穿戴物时写 `wears: [...]` → 重新生成 → 有占用时更新 `pose-occupies` 块 |
| 新装饰 | `build-sprites.mjs` 的 `WEAR` 与 `data.js` `WEARABLES` 同时加一项（同键同部位）→ 三语译文 → 更新 `wear-keys` 块与 §2.2 解锁表 → 走设计门 |
| 新部位 | 本契约升 `V2`：`WEAR_SLOTS`、`build-sprites.mjs` 的 `SLOT_ORDER`、`wear-slots` 块一起改 |
| 新解锁方式 | 在 `core.js` `wearUnlocked` 实现、在 `render.js` `wearHint` 写提示，并在 §2.2 登记；只能从已有进度推导，需要新存档字段时先按 [STORE.SAVE.V6](save-format.md) §4 处理 |

## 5. 验证 Verification

- `test/contracts.test.js`：遍历 `assets/*.svg` 断言不变量 1–4；`wear-slots`、`wear-keys` 与 `data.js` 相等。
- `test/core.test.js`：解锁、穿脱、阶段默认、迁移。
- `test/cc.test.js`：真实美术路由按 `?wear=` 合成、未知键被丢弃、姿势占用的部位不显示。
- `test/client.test.js`：面板把穿戴拼到姿势 URL、衣柜按钮状态与提交内容。
