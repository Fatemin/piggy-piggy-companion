# STORE.SAVE.V6 · 存档格式与迁移

> contract_id: `STORE.SAVE.V6` · status: `CURRENT`

> 实施事实基线：ST0004（2026-10-02，装扮功能），`STATE_VERSION = 6`。契约 ID 的 `V6` 跟随存档版本：存档升到 7 时新开 `STORE.SAVE.V7`。上一版 [STORE.SAVE.V5](save-format-v5.md) 已退役。

## 1. 归属 Ownership

| 角色 | 拥有 | 不得越权 |
|---|---|---|
| `core.js` `migrate()` | 任意旧存档 → 当前形状的**唯一**入口；`STATE_VERSION` | 不读写文件 |
| `store.js` | 存档路径、加载时迁移、原子写盘、写入节流 | 不在迁移之外“修”数据 |
| `lib/lock.js` | 多进程（各个 hook、面板服务）同一存档只有一个写者 | 不改存档内容 |

**真实存档是用户数据**：`$DSH_HOME/dsh-pig/state.json`，未设置时是 `~/.dsh/dsh-pig/state.json`。开发与测试一律用临时路径（`createStore(<tmp>)` 或插件配置 `statePath`）；读写真实存档按 [`docs/agent/environment.md`](../agent/environment.md) §3 处理。

## 2. 字段 Fields

<!-- contract:state-version -->
```json
6
```

`migrate({})` 产出的全部键（新增键必须同分支登记）：

<!-- contract:state-keys -->
```json
["activity", "blackjack", "bornAt", "cleanliness", "coins", "collected", "cooldowns", "courses", "dead", "diedAt", "doctorDone", "happiness", "hatched", "health", "illness", "inventory", "lang", "lastActiveAt", "lastFedAt", "lastLotteryAt", "lastSeenAt", "lastTrip", "lessonsByStage", "memories", "name", "outfit", "peakWeightG", "pending", "regionsDone", "riskMinutes", "rng", "satiety", "sleep", "souvenirs", "stage", "stageCourses", "stats", "traits", "utcOffsetMin", "version", "wardrobeBought", "weightG", "worldDone", "xp"]
```

| 组 | 键 | 说明 |
|---|---|---|
| 身份与生命 | `name`, `stage`, `hatched`, `dead`, `diedAt`, `bornAt`, `lang` | `hatched` 与“存档存在”是两回事 |
| 四维与成长 | `satiety`, `happiness`, `cleanliness`, `health`, `weightG`, `xp` | 迁移时夹到合法范围 |
| 最高体重 | `peakWeightG` | 到过的最高体重（克，Q0016）：生命阶段和 `stage` 类装饰解锁按 `max(weightG, peakWeightG)` 算，健身减重不会让猪变小一个阶段；只在健身结算减重前更新，所以平时可能低于 `weightG`。默认出生体重，迁移时夹到 0–500000。`stats` 新增 `gyms`、`gymLostG`（健身次数、累计减掉的克数，后者解锁 `muscle`）与 `peakCoins`（同时持有过的最多猪币，解锁 `gold`；时间推进后和每个操作后更新，迁移时取它与当前猪币的较大值），迁移时补 0。新增可默认的键，不升版本 |
| 资产 | `coins`, `inventory` | `coins` 为非负整数 |
| 养成 | `traits`, `courses`, `lessonsByStage`, `stageCourses`, `doctorDone` | `stageCourses` 是各学段每门课的次数（小学/大学上限按它算）；缺失时按 `lessonsByStage` 平均摊到九门课 |
| 旅行 | `souvenirs`, `collected`, `regionsDone`, `worldDone`, `lastTrip` | |
| 外观 | `outfit` | `null`（跟着阶段穿）或装饰键数组（玩家搭配，每部位至多一件，按部位顺序）；含义与解锁见 [ART.ASSETS.V2](art-assets.md) §2.3。迁移时只留已登记键 |
| 衣柜购买 | `wardrobeBought` | 商店「装扮」货架买过的装饰键数组（ST0012，按 `WEAR_FOR_SALE` 顺序）；默认 `[]`，迁移时只留在售装饰键。新增可默认的键，不升版本 |
| 进行中 | `activity`, `illness`, `sleep`, `cooldowns`, `riskMinutes` | `activity.key` 引用 [GAME.RULES.V1](game-rules.md) 的表键；`sleep` 为 `{since, auto}` 或 `null`（外出、死亡时迁移成 `null`；`auto` 表示电脑休眠触发） |
| 记录 | `memories`（最多 8 条）, `pending`（加载时清空）, `stats` | |
| 时间戳 | `lastFedAt`, `lastLotteryAt`, `lastActiveAt`, `lastSeenAt` | 毫秒时间戳 |
| 21 点（ST0015） | `blackjack` | 桌上没打完的一手：`{bet, cards}`，`cards` 是 0–51 的不重复整数（`card % 13` 为点数，0 = A），总点数小于 21；没有时为 `null`。迁移时读不成一手的，把 `bet`（正整数）退回 `coins` 后置 `null`。可默认的新键，不升版本 |
| 可复现（ST0014） | `rng`, `utcOffsetMin` | `rng`：32 位无符号整数，猪自己的骰子（mulberry32），所有随机结果从这里取，取一次推进一次；缺失时由 `bornAt` 派生。`utcOffsetMin`：主人时区偏移（分钟），记忆里的 `[HH:MM]` 按它显示，`null` 表示用本机时区；每条操作写入。都是可默认的新键，不升版本 |

## 3. 不变量 Invariants

1. **迁移是全函数**：任何对象都迁移成合法状态；`null`、数组、非对象返回 `null`（视为没有存档）。
2. **迁移幂等**：`migrate(migrate(x))` 与 `migrate(x)` 相同。
3. **不丢进度**：猪币、经验、背包、属性、课程、纪念品在迁移中保留；退役内容必须给出补偿（先例：旧旅行退款、v5 起始猪币补足到 500）。
4. **一次性修正以磁盘上的旧版本号为键**：例如“`version < 5` 时补猪币”，保证只执行一次。
   v6（ST0004）：旧键 `look` 删除；`version < 6` 且 `look === 'original'`、没有 `outfit` 的存档迁成 `outfit: []`（主人摘掉过胡子，就保持不戴），其余为 `null`（跟着阶段，与之前的样子一致）。
5. **可复现（ST0014）**：时间只在整分钟与 `activity.endsAt` 处结算（`core.advance`），随机数只来自 `rng`；同一存档加同一串操作（`ops.js`），在任何机器上得到逐字节相同的存档（`pending` 除外，它是本机的待播公告）。
6. **原子写盘**：写临时文件 → `fsync` → `rename`，不会出现半个文件。
7. **单写者**：同一存档同一时刻只有一个进程写（`lib/lock.js`，目录锁，持有者已死时可接管）。

## 4. 变更规则 Change rules

| 改动 | 是否升 `STATE_VERSION` | 要做的事 |
|---|---|---|
| 新增可默认的键 | 否 | `layEgg()` / `migrate()` 给默认值 → 更新 `state-keys` 块 |
| 一次性数据修正、键改名或删除、语义改变 | **是** | `STATE_VERSION + 1`，在 `migrate()` 里以旧版本号分支处理 → 新开 `STORE.SAVE.V<n>`、旧的标 `RETIRED` → 更新 `harness.config.json` 规则 ID → 补 `test/core.test.js` 迁移测试 → CHANGELOG |
| 写盘方式 / 路径 | 否 | 先在本文写清兼容旧路径的方式；路径变化必须能找到旧存档 |

降级不受支持：旧版本插件读到新存档的行为不作保证，CHANGELOG 要写明。

## 5. 验证 Verification

- `test/contracts.test.js`：`STATE_VERSION` 与 `state-version` 块相等；`migrate({})` 的键与 `state-keys` 块相等；全函数与幂等断言。
- `test/core.test.js`：v1 → v6 迁移、退役内容补偿、`look` → `outfit`。
- `test/cc.test.js`：多进程锁。
