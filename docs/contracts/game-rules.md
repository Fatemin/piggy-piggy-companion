# GAME.RULES.V1 · 玩法数值表与结算规则

> contract_id: `GAME.RULES.V1` · status: `CURRENT`

> 实施事实基线：`main` `678e7e4`（2026-10-02，ST0003 打工时薪平衡之后）。设计意图与参考来源看 [`docs/DESIGN.md`](../DESIGN.md)；本文只登记**当前生效**的表键、字段与不变量，`test/contracts.test.js` 逐项比对。

## 1. 归属 Ownership

| 来源 | 拥有 | 不得越权 |
|---|---|---|
| `data.js` | 打工、学科、学段、商店、疾病链、阈值与上限等静态表 | 不读写状态 |
| `world.js` | 旅行地区、目的地、纪念品、特产、时区与票价 | 同上 |
| `core.js` | 以 `(state, table, nowMs)` 计算结果的纯函数：开始 / 结算 / 衰减 / 生病 / 死亡 | 不做 I/O；不缓存表值 |
| `store.js` | 何时调用 `core.js` 与持久化（见 [STORE.SAVE.V6](save-format.md)） | 不实现规则 |

数值的**设计理由**（为什么是这个数）写在 `docs/DESIGN.md` 或 CHANGELOG；本文只约束“哪些键存在、字段齐不齐、规则之间不能矛盾”。

## 2. 字段 Fields

### 2.1 表键（新增 / 删除键必须同分支更新这里）

<!-- contract:job-keys -->
```json
["label", "tutor", "office", "aitrainer", "stall", "odd", "tea", "influencer", "vtuber", "rider", "site", "sorting", "coach"]
```

<!-- contract:subject-keys -->
```json
["chinese", "mathematics", "politics", "art", "music", "manner", "pe", "wushu", "labouring"]
```

<!-- contract:school-stage-keys -->
```json
["primary", "college", "graduate", "doctor"]
```

<!-- contract:shop-keys -->
```json
["apple", "bread", "bone", "rice", "cake", "noodle", "soap", "shower", "shampoo", "bubble", "sauna", "yoyo", "blocks", "plush", "scooter", "carousel", "med1", "med2", "med3", "med4", "soul", "renamecard"]
```

<!-- contract:item-kinds -->
```json
["food", "bath", "toy", "medicine", "revive", "card", "wear"]
```

<!-- contract:illness-chains -->
```json
[["感冒", "发烧", "重感冒", "肺炎"], ["咳嗽", "支气管炎", "哮喘", "肺结核"], ["肚子胀", "胃炎", "胃溃疡", "胃癌"]]
```

<!-- contract:gym-class-keys -->
```json
["treadmill", "weights", "trainer"]
```

<!-- contract:region-keys -->
```json
["china", "eastasia", "southasia", "europe", "americas", "mideast", "oceania"]
```

<!-- contract:place-keys -->
```json
["beijing", "chengdu", "xian", "shanghai", "tokyo", "seoul", "ulaanbaatar", "bangkok", "singapore", "newdelhi", "paris", "rome", "london", "newyork", "mexicocity", "rio", "dubai", "cairo", "nairobi", "sydney", "auckland", "antarctica"]
```

### 2.2 打工表字段

<!-- contract:job-fields -->
```json
["art", "cleanliness", "coins", "emoji", "fixed", "key", "label", "minutes", "random", "requires", "satiety", "tier", "trait", "xp"]
```

| 字段 | 含义 | 约束 |
|---|---|---|
| `key` | 稳定标识，进入存档 `activity.key` | 只增不删（见 §3） |
| `label` / `emoji` | 中文源串与图标 | `label` 必须有 ja/en 译文（[I18N.TERMS.V1](i18n.md)） |
| `trait` | 依赖的属性 | ∈ `TRAIT_ORDER` |
| `tier` / `requires` | `basic` 无门槛；`pro` 需要属性点 | `pro` 必须有 `requires`，且键都在 `TRAITS` 里 |
| `minutes` / `fixed` | 基础时长；`fixed` 的零工不受属性加速 | `minutes > 0` |
| `coins` / `random` | 期望报酬；`random` 为 `[低, 高]` 掷骰区间 | 区间 `低 < 高` |
| `xp` / `satiety` / `cleanliness` | 结算时的经验与消耗 | 消耗为负数 |

### 2.3 freshness（什么时候读表）

| 值 | 何时确定 | 说明 |
|---|---|---|
| 打工时长 | 开始时冻结在 `activity` 里 | 中途改表不影响已出门的猪 |
| 打工报酬 | **结算时**按当前表与当前属性计算 | 改表会影响正在进行的班次；数值改动要在 CHANGELOG 说明 |
| 旅行花费 | 开始时冻结（`activity.cost`），提前召回按它退款 | |
| 疾病分期时长 | 按当前 `ILLNESS_STAGE_HOURS` 读取 | |

## 3. 不变量 Invariants

1. **键只增不删**：存档里的 `activity.key`、背包物品键、纪念品键都引用这些表。删除或改名一个键必须同时在 `migrate()` 给出处理路径（先例：退役的四个旧旅行地点由 `LEGACY_TRIPS` 退款并清除）。
2. 每个打工的 `trait` ∈ `TRAIT_ORDER`；`pro` 职业有 `requires` 且只引用存在的属性；`random` 区间下界小于上界。
3. 每条疾病链恰好 4 期；`ILLNESS_STAGE_HOURS`、`STAGE_HEALTH`、`SELF_HEAL_CHANCE` 长度均为 4；每一期都有对症药 `medicineForStage(1..4)`。
4. 商店物品的 `kind` ∈ `KIND_ORDER`；全部物品（商店 + 特产）键唯一，且不与装饰键重名。`wear` 货架（ST0012）不在 `SHOP` 里：它列出 `WEAR_FOR_SALE`（`unlock.kind === 'shop'` 的装饰），规则见 [ART.ASSETS.V2](art-assets.md) §2.2。
5. 每个目的地的 `region` 是已登记地区。
6. 面向玩家的 `label` 都是中文源串，并在 `locales/data.js` 有 ja 与 en 译文。
7. 规则只在 `core.js`：快照、面板、终端渲染都不得重算报酬、冷却或价格（见 [HOST.SNAPSHOT.V1](host-snapshot.md) §1）。
8. 睡觉与外出互斥：睡着时饱食照常下降，心情、清洁按 `SLEEP_RECOVERY_PER_MIN` 回升，疏于照顾累积的生病风险乘 `SLEEP_SICK_RISK_MULTIPLIER`；照顾动作和出门会先叫醒它；电脑唤醒（`auto`）只结束电脑休眠引起的睡眠。
9. **装扮不进玩法**：`data.js` 的 `WEAR_SLOTS` / `WEARABLES` / `STAGE_OUTFIT` 与 `core.js` 的解锁、穿脱只决定外观，由 [ART.ASSETS.V2](art-assets.md) 约束；除 `shop` 装饰的售价（`unlock.price`，只在购买时扣猪币）与 `gym` / `coins` 装饰的解锁门槛（`unlock.kg` / `unlock.coins`，Q0016）外不得带数值字段，也不得被任何结算读取。
10. **健身房**（Q0016，`GYM` / `GYM_CLASSES`）：一节课是一次外出（`activity.kind === 'gym'`），先付 `price`、提前叫回全额退款；回来减 `lossG`，体重不低于 `GYM.floorKg`，体重已在下限时拒绝 `too-light`。生命阶段与 `stage` 类装饰解锁按 `max(weightG, peakWeightG)` 算，减重前把当前体重记进 `peakWeightG`，所以健身不会让猪退回更小的阶段；`sizeForWeight` 仍按当前体重，猪会真的变小。累计减掉的克数记 `stats.gymLostG`，到 `GYM.muscleKg`（就是 `muscle` 装饰的 `unlock.kg`）解锁肌肉造型并自动穿上。

## 4. 变更规则 Change rules

- **调数值**（不加删键）：改 `data.js` / `world.js` 并在 CHANGELOG 写明前后对比与理由；本文无需改动，合入时用 `--contract-exempt "数值调整，键与字段不变"` 记录。
- **加键**（新职业、课程、商品、目的地）：同分支更新 §2 机器块、补三语译文、补图（走设计门）、必要时补 `test/core.test.js` 规则测试。
- **删 / 改名键**：先在 `migrate()` 写兼容路径，存档版本是否要升按 [STORE.SAVE.V6](save-format.md) §4 判断；本契约升 `V2` 当且仅当字段含义改变。
- **新系统**（例如 TODO 里的联机）：先在本注册表登记新的 `contract_id`（`TARGET_PENDING`），再设计、再实现。装扮已按此登记为 [ART.ASSETS.V2](art-assets.md)。

## 5. 验证 Verification

- `test/contracts.test.js`：表键、打工字段与本文机器块逐项相等；§3 不变量 2–6 逐条断言。
- `test/core.test.js`：结算、疾病、学习、旅行、商店、迁移的规则测试。
