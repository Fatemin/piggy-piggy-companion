# HOST.SNAPSHOT.V1 · 宿主快照与操作接口

> contract_id: `HOST.SNAPSHOT.V1` · status: `CURRENT`

> 实施事实基线：`main` `678e7e4`（2026-10-02）。代码变化后同一分支更新本文与下方机器块；`test/contracts.test.js` 会拿真实 `snapshot()` 比对。

## 1. 归属 Ownership

| 角色 | 拥有 | 不得越权 |
|---|---|---|
| `core.js` | 所有数值与规则的计算结果 | 不知道 HTTP、面板或语言以外的展示细节 |
| `index.js` `snapshot()` | 快照的**唯一形状**；路由与斜杠命令共用的 `OPERATIONS` 表 | 不渲染 HTML；不在快照里放面板专用的排版决定 |
| `client.js` `normalize()` | 把任意载荷（当前 / 旧版 / 截断）映射成确定形状，缺字段给默认值 | 不重算游戏规则（冷却、价格、加成都以快照为准） |
| `render.js` | 终端文字渲染 | 同上 |

快照是宿主与面板之间**唯一**的接口。面板需要的任何事实都必须先进快照，再由 `normalize()` 给出安全默认值；面板不得自己从 `data.js` 推算（它在浏览器里也拿不到）。

## 2. 字段 Fields

### 2.1 深度与 freshness

| 深度 | 判定 |
|---|---|
| `core` | 只要快照存在就必须有；`normalize()` 必须给出不为 `undefined` / `NaN` 的默认值 |
| `task` | 某个标签页或动作需要；缺失时该标签页给出可见降级（例如「重启 dsh 之后才会出现」），不能空白 |
| `deep` | 只在展开或详情中出现 |
| `internal` | 只存在于存档（见 [STORE.SAVE.V6](save-format.md)），**不得**进入快照 |

| freshness | 含义 |
|---|---|
| `LIVE` | 每次取快照时按当前时间计算（年龄、剩余秒数、进度、冷却） |
| `STATE` | 存档中的值（金币、经验、属性、背包） |
| `TABLE` | 来自 `data.js` / `world.js` 的静态表，已按当前语言翻译 |
| `DERIVED` | 状态 × 表的推导值（例如带属性加成后的打工报酬与时长） |

`0`、`null`、缺字段是三种不同状态：`0` 是有效数值；`null` 表示“不适用”（例如 `daysToNextStage` 在最后阶段为 `null`）；缺字段表示旧版宿主，只能由 `normalize()` 兜底，不得渲染成 `0` 冒充真值。

### 2.2 顶层字段

| 字段 | 深度 | freshness | 说明 |
|---|---|---|---|
| `ok` | core | LIVE | 取快照恒为 `true`；`/act` 回执中被操作结论覆盖（见 §3） |
| `hatched` / `dead` | core | STATE | **真实**标志：有存档 ≠ 已拆盒 |
| `pig` | core | STATE+LIVE | 未拆盒且无存档时为 `null`；字段见 §2.3 |
| `lang` / `langs` | core | STATE / TABLE | 猪的语言与可切换列表 |
| `boxStage` | core | TABLE | 纸盒自己的尺寸与文案，面板不得硬编码 |
| `actions` | core | DERIVED+LIVE | `feed`/`bathe`/`play`/`pet` 的 `ready`、`waitSeconds`、`blocked` |
| `jobs` / `subjects` / `stages` / `trips` / `world` | task | DERIVED | 打工、学习、旅行标签页 |
| `shop` / `inventory` / `bag` / `care` / `lottery` | task | DERIVED | 商店、背包、照料选择、刮刮卡；`care` 只在有猪时出现。`shop` 每项带 `owned`；`kind: 'wear'` 的是「装扮」货架上的装饰（ST0012），买过的 `owned: true`，不进 `inventory` / `bag` |
| `blackjack` | task | TABLE+STATE | 21 点（ST0015）：`bets`（可选下注）、`standAt`（停牌最低点数）、`payouts[{total,multiplier}]`、`hand`（没打完的一手 `{bet,cards[{rank,suit}],total,soft}`，没有时 `null`） |
| `gym` | task | TABLE+STATE | 健身房（Q0016）：`floorKg`（体重下限）、`muscleKg`（累计瘦掉多少解锁肌肉）、`lostKg`（已累计瘦掉）、`muscle`（已解锁）、`atFloor`（已到下限，不能再去）、`classes[{key,label,emoji,minutes,price,lossKg,affordable}]` |
| `activity` | core | STATE+LIVE | 外出中为对象（`kind`、`key`、`secondsLeft`、`progress` …；上课另带学段 `stage`，旅行另带地区 `region`，面板据此选外出形象），否则 `null` |
| `canGoOut` / `awayBlocked` | core | DERIVED | 不能外出的原因键，面板据此置灰 |
| `pending` | core | STATE | 待展示的事件，取快照时被消费（`drain`） |
| `reviveItem` / `maxHealth` | core | TABLE | 还魂丹键与健康上限 |

没有猪时（`pig === null`）的顶层键：

<!-- contract:snapshot-keys-empty -->
```json
["actions", "activity", "awayBlocked", "bag", "blackjack", "boxStage", "canGoOut", "dead", "gym", "hatched", "inventory", "jobs", "lang", "langs", "lottery", "maxHealth", "ok", "pending", "pig", "reviveItem", "shop", "stages", "subjects", "trips", "world"]
```

有猪时的顶层键：

<!-- contract:snapshot-keys -->
```json
["actions", "activity", "awayBlocked", "bag", "blackjack", "boxStage", "canGoOut", "care", "dead", "gym", "hatched", "inventory", "jobs", "lang", "langs", "lottery", "maxHealth", "ok", "pending", "pig", "reviveItem", "shop", "stages", "subjects", "trips", "world"]
```

### 2.3 `pig` 字段

<!-- contract:pig-keys -->
```json
["ageDays", "ageLabel", "asleep", "canChooseLook", "cleanliness", "coins", "courses", "daysToNextStage", "diplomas", "doctor", "growthPercent", "happiness", "health", "healthPercent", "illness", "kgToNextStage", "look", "memories", "mood", "moodEmoji", "moodLabel", "moodLevel", "name", "outfit", "perks", "renameCardPrice", "renameCards", "renameFree", "satiety", "sleepAuto", "soul", "souvenirs", "stage", "stageLine", "traits", "wardrobe", "weight", "worldTraveler", "xp"]
```

| 组 | 字段 | 深度 | freshness |
|---|---|---|---|
| 身份 | `name`, `stage{key,label,emoji,size,line,art,faded}` | core | STATE+TABLE |
| 穿戴 | `outfit{auto,worn[]}`：`worn` 是当前穿戴的装饰键（按部位绘制顺序，面板原样拼到精灵 URL 的 `?wear=`），`auto` 为跟着阶段穿 | core | DERIVED（ST0004，见 [ART.ASSETS.V2](art-assets.md)） |
| 衣柜 | `wardrobe[{key,slot,label,emoji,unlocked,worn,hint}]`：全部装饰，`hint` 是已翻译的解锁条件 | task | DERIVED |
| 旧外观开关 | `look`（`'elder'` = 戴着 `whiskers`，否则 `'original'`）、`canChooseLook`（`whiskers` 已解锁）：ST0004 起由衣柜推导，只为旧面板保留 | core | DERIVED |
| 年龄与成长 | `ageDays`, `ageLabel`, `daysToNextStage`, `kgToNextStage`, `growthPercent`, `weight` | core | LIVE |
| 四维 | `satiety`, `happiness`, `cleanliness`（0–100 整数）, `health`, `healthPercent` | core | STATE |
| 心情 | `mood`, `moodLevel`, `moodEmoji`, `moodLabel` | core | LIVE |
| 睡眠 | `asleep`（在睡觉）, `sleepAuto`（电脑休眠触发、电脑唤醒时自动起床） | core | STATE |
| 资产 | `coins`, `xp`, `renameCards`, `renameCardPrice`, `renameFree` | core | STATE |
| 养成 | `traits{intel,charm,strong}`, `courses`, `perks`, `doctor`, `worldTraveler`, `souvenirs` | task | STATE |
| 毕业证 | `diplomas[{key,stage,label,emoji,repeat,count,next}]`：四个学段各一种；`next` 为下一张的进度，一次性的已拿到时为 `null` | core | DERIVED（由 `lessonsByStage` 推出，不单独存档） |
| 状态 | `illness{name,cure,stage,chain}` 或 `null`, `soul`, `stageLine`, `memories`（最近 3 条） | core | STATE |

## 3. 操作接口

| 路由 | 方法 | 约定 |
|---|---|---|
| `/dsh-pig/state` | GET | 返回快照，`cache-control: no-store`；其他方法 405 + `allow` |
| `/dsh-pig/act` | POST | JSON 体 `{action, ...}`；未知 `action` → 400 + `allowed` 列表；体过大或非 JSON → 413 |
| `/dsh-pig/art/<name>.svg` | GET | 只服务 `assets/` 下匹配 `^[a-z][a-z0-9-]{0,31}\.svg$` 的文件，其他一律 404；可带 `?wear=<k1>,<k2>` 给姿势穿上装饰，只认 `WEARABLES` 键，其余丢弃（合成规则见 [ART.ASSETS.V2](art-assets.md) §2.6） |

`OPERATIONS` 表（路由与斜杠命令共用，同一张表防止两者漂移）：

<!-- contract:act-operations -->
```json
["adopt", "bathe", "buy", "calloff", "dev", "feed", "blackjack", "gym", "hatch", "lang", "look", "lottery", "pet", "play", "rename", "reset", "sleep", "study", "trip", "use", "wake", "wear", "work"]
```

`wear`：`{item, on}` 穿上（同部位的换下）或脱下一件，`{auto: true}` 回到跟着阶段穿；拒绝原因 `unhatched` / `dead` / `bad-wear` / `wear-locked`。`buy` 给装饰键时买下并穿上，另有拒绝原因 `owned`（已经买过）与 `not-for-sale`（不是商店装饰）。`look` 自 ST0004 起只是戴上 / 摘下 `whiskers` 的旧入口。

`gym`（Q0016）：`{gym: <课程键>}` 付钱去健身，像上课一样外出计时（`activity.kind === 'gym'`，心情 `exercising`），回来按课程减重、不低于 `floorKg`；提前叫回全额退款、不减重。拒绝原因 `unknown` / `unhatched` / `dead` / `away` / `weak` / `too-light`（已到下限）/ `poor`（带 `price`）/ `hungry`。

`blackjack`（ST0015）：`{move: 'deal', bet}` 下注发两张，`{move: 'hit'}` 要一张，`{move: 'stand'}` 停牌结算；回执 `round` 是这一手（同快照 `hand`，另带 `done`；结束时带 `outcome`（`jackpot` 正好 21 / `win` / `bust`）、`multiplier`、`coins`）。拒绝原因 `in-hand`（已有一手）/ `bad-bet` / `poor` / `away`（发牌要在家）/ `no-hand` / `too-low`（不到 `standAt`）/ `bad-move`。

`/act` 回执 = 最新快照 + 以下操作结论字段（结论在后，覆盖快照的 `ok`）：

<!-- contract:act-receipt-keys -->
```json
["full", "kind", "max", "missing", "ok", "price", "prize", "reason", "round", "wait"]
```

## 4. 不变量 Invariants

1. **拒绝必须诚实**：被拒绝的操作回执 `ok: false` 且带 `reason`；快照的恒真 `ok` 绝不能覆盖操作结论（历史 bug #2）。
2. **`hatched` 是真实标志**：`reset` / `adopt` 产生“有存档但未拆盒”的状态，面板以 `hatched !== true` 判断纸盒（0.14.1）。
3. **快照从不携带 `internal` 字段**：冷却时间戳、`riskMinutes`、`stats` 等只在存档里。
4. **面板不出现 `undefined` / `NaN`**：任何缺字段由 `normalize()` 兜底；旧版宿主（缺 `coins`/`health`）进入 `legacy` 显示升级提示。
5. **文本已按猪的语言翻译**：快照中的 `label` / `line` 类字段是最终显示文字，面板不再翻译数据标签（见 [I18N.TERMS.V1](i18n.md)）。
6. **路由在 `ctx.inject(['webServer'])` 内注册**：不得在 `apply()` 时直接 `ctx.get`（历史 bug #12）。

## 5. 变更规则 Change rules

- **加字段**（向后兼容）：同一分支内更新 §2 表格与机器块、在 `normalize()` 加默认值、在 `test/client.test.js` 覆盖“旧宿主没有这个字段”的情况。仍是 `V1`。
- **改名、删字段或改语义**：新开 `HOST.SNAPSHOT.V2`，旧版本标 `RETIRED`；新宿主继续发旧字段直到 `normalize()` 两种都能读，CHANGELOG 写明迁移窗口。
- **加操作**：`OPERATIONS` 加一行 → 更新 `act-operations` 块 → 斜杠命令帮助与三语文案同步。
- 改动碰到面板外观时同时走设计门（[`docs/agent/design.md`](../agent/design.md)）。

## 6. 验证 Verification

- `test/contracts.test.js`：真实 `snapshot()` 的顶层键、`pig` 键与本文机器块逐项相等；`/act` 的 `allowed` 列表与回执字段与本文相等。
- `test/host.test.js`：路由注册、方法校验、拒绝诚实、完整路由流程。
- `test/client.test.js`：旧版 / 截断 / 畸形载荷不出现 `undefined`、`NaN`。
