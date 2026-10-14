# STORE.SAVE.V5 · 存档格式与迁移

> contract_id: `STORE.SAVE.V5` · status: `RETIRED`

> **已退役（ST0004）**：存档升到 6，现行契约见 [STORE.SAVE.V6](save-format.md)。本文只读保留，记录 v5 的形状；机器块不再被测试比对。

> 实施事实基线：`main` `678e7e4`（2026-10-02），`STATE_VERSION = 5`。契约 ID 的 `V5` 跟随存档版本：存档升到 6 时新开 `STORE.SAVE.V6`。

## 1. 归属 Ownership

| 角色 | 拥有 | 不得越权 |
|---|---|---|
| `core.js` `migrate()` | 任意旧存档 → 当前形状的**唯一**入口；`STATE_VERSION` | 不读写文件 |
| `store.js` | 存档路径、加载时迁移、原子写盘、写入节流 | 不在迁移之外“修”数据 |
| `lib/lock.js` | 多进程（各个 hook、面板服务）同一存档只有一个写者 | 不改存档内容 |

**真实存档是用户数据**：`$DSH_HOME/dsh-pig/state.json`，未设置时是 `~/.dsh/dsh-pig/state.json`。开发与测试一律用临时路径（`createStore(<tmp>)` 或插件配置 `statePath`）；读写真实存档按 [`docs/agent/environment.md`](../agent/environment.md) §3 处理。

## 2. 字段 Fields

<!-- retired:state-version -->
```json
5
```

`migrate({})` 产出的全部键（新增键必须同分支登记）：

<!-- retired:state-keys -->
```json
["activity", "bornAt", "cleanliness", "coins", "collected", "cooldowns", "courses", "dead", "diedAt", "doctorDone", "happiness", "hatched", "health", "illness", "inventory", "lang", "lastActiveAt", "lastFedAt", "lastLotteryAt", "lastSeenAt", "lastTrip", "lessonsByStage", "memories", "name", "pending", "regionsDone", "riskMinutes", "satiety", "sleep", "souvenirs", "stage", "stageCourses", "stats", "traits", "version", "weightG", "worldDone", "xp"]
```

| 组 | 键 | 说明 |
|---|---|---|
| 身份与生命 | `name`, `stage`, `hatched`, `dead`, `diedAt`, `bornAt`, `lang` | `hatched` 与“存档存在”是两回事 |
| 四维与成长 | `satiety`, `happiness`, `cleanliness`, `health`, `weightG`, `xp` | 迁移时夹到合法范围 |
| 资产 | `coins`, `inventory` | `coins` 为非负整数 |
| 养成 | `traits`, `courses`, `lessonsByStage`, `stageCourses`, `doctorDone` | `stageCourses` 是各学段每门课的次数（小学/大学上限按它算）；缺失时按 `lessonsByStage` 平均摊到九门课 |
| 旅行 | `souvenirs`, `collected`, `regionsDone`, `worldDone`, `lastTrip` | |
| 进行中 | `activity`, `illness`, `sleep`, `cooldowns`, `riskMinutes` | `activity.key` 引用 [GAME.RULES.V1](game-rules.md) 的表键；`sleep` 为 `{since, auto}` 或 `null`（外出、死亡时迁移成 `null`；`auto` 表示电脑休眠触发） |
| 记录 | `memories`（最多 8 条）, `pending`（加载时清空）, `stats` | |
| 时间戳 | `lastFedAt`, `lastLotteryAt`, `lastActiveAt`, `lastSeenAt` | 毫秒时间戳 |

## 3. 不变量 Invariants

1. **迁移是全函数**：任何对象都迁移成合法状态；`null`、数组、非对象返回 `null`（视为没有存档）。
2. **迁移幂等**：`migrate(migrate(x))` 与 `migrate(x)` 相同。
3. **不丢进度**：猪币、经验、背包、属性、课程、纪念品在迁移中保留；退役内容必须给出补偿（先例：旧旅行退款、v5 起始猪币补足到 500）。
4. **一次性修正以磁盘上的旧版本号为键**：例如“`version < 5` 时补猪币”，保证只执行一次。
5. **原子写盘**：写临时文件 → `fsync` → `rename`，不会出现半个文件。
6. **单写者**：同一存档同一时刻只有一个进程写（`lib/lock.js`，目录锁，持有者已死时可接管）。

## 4. 变更规则 Change rules

| 改动 | 是否升 `STATE_VERSION` | 要做的事 |
|---|---|---|
| 新增可默认的键 | 否 | `layEgg()` / `migrate()` 给默认值 → 更新 `state-keys` 块 |
| 一次性数据修正、键改名或删除、语义改变 | **是** | `STATE_VERSION + 1`，在 `migrate()` 里以旧版本号分支处理 → 新开 `STORE.SAVE.V<n>`、旧的标 `RETIRED` → 更新 `harness.config.json` 规则 ID → 补 `test/core.test.js` 迁移测试 → CHANGELOG |
| 写盘方式 / 路径 | 否 | 先在本文写清兼容旧路径的方式；路径变化必须能找到旧存档 |

降级不受支持：旧版本插件读到新存档的行为不作保证，CHANGELOG 要写明。

## 5. 验证 Verification

- `test/contracts.test.js`：`STATE_VERSION` 与 `state-version` 块相等；`migrate({})` 的键与 `state-keys` 块相等；全函数与幂等断言。
- `test/core.test.js`：v1 → v5 迁移、退役内容补偿。
- `test/cc.test.js`：多进程锁。
