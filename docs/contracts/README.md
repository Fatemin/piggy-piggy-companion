# 业务契约注册表 · Contract registry

> 状态：current / authoritative。本页是本项目全部业务契约的唯一入口：每个 `contract_id` 指向一份契约文档，契约文档再由 `test/contracts.test.js` 与代码逐项比对。
> 怎么写、怎么改契约的 runbook `docs/agent/contracts.md` 待补（Q0004 后续）；合入时的机械门看 [`docs/agent/delivery.md`](../agent/delivery.md) §5。

## 注册表

`scripts/harness/contracts.mjs` 解析下表（列顺序固定：`contract_id` | 权威对象 | 文档 | status）。`harness.config.json` 的 `gates.contracts.rules` 必须与下表一一对应。

| contract_id | 权威对象 | 文档 | status |
|---|---|---|---|
| `HOST.SNAPSHOT.V1` | `GET /dsh-pig/state` 快照、`POST /dsh-pig/act` 操作表与回执、`client.js` 的 `normalize()` 容错 | [host-snapshot.md](host-snapshot.md) | `CURRENT` |
| `GAME.RULES.V1` | `data.js` / `world.js` 数值表与 `core.js` 结算规则（打工、学习、旅行、疾病、商店） | [game-rules.md](game-rules.md) | `CURRENT` |
| `STORE.SAVE.V6` | 存档 `state.json` 的形状、`STATE_VERSION`、`migrate()` 与写盘方式 | [save-format.md](save-format.md) | `CURRENT` |
| `STORE.SAVE.V5` | 存档 v5（ST0004 前）；被 V6 取代 | [save-format-v5.md](save-format-v5.md) | `RETIRED` |
| `I18N.TERMS.V1` | 中文源串为键的三语文案、占位符、术语表与三语 README | [i18n.md](i18n.md) | `CURRENT` |
| `ART.ASSETS.V2` | 美术资产两分：行为资产（姿势，游戏选）与装饰资产（装扮，玩家选）的文件接口、部位、解锁与合成路由 | [art-assets.md](art-assets.md) | `CURRENT` |

## 状态标签

| 标签 | 含义 | 新代码能否依赖 |
|---|---|---|
| `CONTRACT` | 已拍板、尚未全部实现的契约 | 可以按它实现；实现后改为 `CURRENT` |
| `CURRENT` | 已实现，且契约测试正在比对 | 可以 |
| `GAP` | 实现与契约不一致，已登记待修 | 不可以复制现状；修复前在文档 §Invariants 写明差异 |
| `BLOCKED` | 需要的事实当前没有可信来源 | 不得猜值，先补来源 |
| `TARGET_PENDING` | 用户提出方向、设计收敛中 | 只能当待办，不能声称已实现 |
| `RETIRED` | 已被新版本（`.V2`…）取代 | 只读；保留到最后一个兼容路径删除 |

## 契约之间的关系

```text
data.js / world.js 数值表 ──GAME.RULES──▶ core.js 结算 ──▶ state（STORE.SAVE 持久化）
                                                        │
                              index.js snapshot() ◀──────┘
                                    │  HOST.SNAPSHOT（JSON 形状 = 宿主与面板之间唯一的接口）
                                    ▼
                         client.js normalize() ──▶ 面板渲染
所有面向玩家的文字 ──I18N.TERMS──▶ locales/*.js（中文源串为键）

assets/<pose>.svg（行为资产，游戏状态选）─┐
assets/wear-<key>.svg（装饰资产，玩家选）─┴─ART.ASSETS──▶ /dsh-pig/art/<pose>.svg?wear=… ──▶ 面板精灵
```

一个改动同时碰到多份契约时，逐份更新；不要把一份契约的规则抄进另一份，用链接引用。
