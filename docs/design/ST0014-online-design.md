# ST0014 · 登录、云存档与联机设计

> 状态：P0–P3 已实现（本地开发与测试完成），待用户配置域名 / Resend / Cloudflare 后上线。决策来源：ST0014 会话中用户的四条答复（2026-10-02）。
> 本文是设计意图与决策记录；落地后的接口契约另开 `docs/contracts/` 条目，以契约为准。

## 1. 目标与非目标

**目标**

1. 邮箱验证码登录，无密码。
2. 一个账号一头猪，多台设备同时在线，存档与进行中的进度（打工 / 上课 / 旅行倒计时、疾病、冷却）都同步。
3. 客户端签名：每台设备一把 Ed25519 密钥，所有同步请求签名。
4. 服务端重放结算：服务端不收客户端算好的存档，只收操作，用同一份 `core.js` 重放出权威存档。
5. 猪圈与一起行动（TODO 2026-10-03 第 3 项）：好友的猪一起上课 / 打工 / 旅游，速度 +30%、收益 +30%；高阶职业 / 课程要求双方都满足条件。

**非目标**

- 公开注册、排行榜、交易、聊天。用户规模按 ≤10 人设计。
- 防住能逆向客户端、提取设备私钥的人（见 §7）。
- 实时动作同步。玩法是分钟到小时级的异步结算，30 秒级延迟可以接受。

## 2. 决策记录

| # | 问题 | 决定 | 理由 |
|---|---|---|---|
| D1 | 部署形态 | Cloudflare Workers 免费版 + D1 | ≤10 人，免费额度（每天 10 万次请求、5 GB）绰绰有余；无服务器运维；HTTPS 与可靠的来源 IP（`CF-Connecting-IP`）自带 |
| D2 | 登录方式 | 邮箱验证码，不设密码 | 用户要求；邮箱同时是找回账号的方式 |
| D3 | 发信 | Resend 免费版（每月 3000 封、每天 100 封），用户自有域名做发件域 | 走 HTTP API，Workers 可直接调用；Cloudflare 自家发信给任意地址需要付费版 |
| D4 | 防作弊 | 设备签名 + 服务端重放 | 用户要求“客户端签名”；签名只证明“是这台已登记设备发的”，真正让手改存档失效的是重放 |
| D5 | 多设备 | 同时在线，存档与进度都同步 | 用户要求 |
| D6 | 两台机器同时喂食 | **共享冷却**：账号级每 30 分钟一口（与现有单机节流同值） | 一头猪一个胃；用户未另行指定，采用推荐值 |
| D7 | 离线时的主动操作 | 补传时按服务端当前状态执行，与已发生的事冲突就作废并提示 | 用户未另行指定，采用推荐值 |
| D8 | 先开发后配置 | 服务端代码与本地开发运行器先行；域名、Resend、Cloudflare 账号由用户在上线前配置 | 用户要求 |

## 3. 总体架构

```
 Swift / Electron / 浏览器面板                Cloudflare Worker (server/)
          │ 127.0.0.1                         ┌───────────────────────────────┐
          ▼                                   │ /v1/auth/*   验证码、登记设备   │
   pig serve (lib/server.js)                  │ /v1/sync     收操作 → 重放      │
     ├─ store.js ── ops.js ── core.js         │ /v1/pens/*   猪圈、一起行动      │
     │    └─ outbox（未确认的操作）            │   ops.js + core.js（同一份代码） │
     └─ lib/cloud.js ── HTTPS + Ed25519 ────▶ │ D1：账号 / 设备 / 操作 / 快照    │
                                              └───────────────────────────────┘
```

- 现在的所有客户端（Swift、Electron、浏览器面板）都套在本机 `pig serve` 外面，所以云同步只做在 `lib/cloud.js` 一处，原生 App 不用改。
- `ops.js`（新增）是纯函数层：把“一次操作”映射到 `core.js` 的调用。本机 `store.js` 和服务端共用它，这是两边结果一致的根本。

## 4. 账号与登录

### 4.1 验证码

| 规则 | 值 |
|---|---|
| 形式 | 6 位数字，10 分钟有效，用一次即作废；库里只存 `SHA-256(email + code + PIG_SECRET)` |
| 同一验证码 | 输错 3 次作废 |
| 同一 IP 冷冻 | 1 小时内校验失败 3 次 → 冷冻 1 小时（IPv4 按 /32，IPv6 按 /64） |
| 发送频率 | 同一邮箱每 60 秒 1 封、每小时 5 封；同一 IP 每小时 10 封；全站每天 90 封（低于 Resend 的 100） |
| 邮箱 | 小写、去空格；不做白名单，但可选 `PIG_ALLOWED_EMAILS` 环境变量把注册限制在好友范围内 |

MAC 地址不参与：它过了第一个路由器就不存在，客户端自报又可以伪造。

### 4.2 设备密钥与请求签名

- 首次登录时本机生成 Ed25519 密钥对。私钥只留在本机：`pig serve` 存在存档旁的 `cloud.json`（权限 0600）。Swift 端和 Electron 端后续可迁到 Keychain / `safeStorage`。
- `POST /v1/auth/verify` 带上 `deviceId`（随机 UUID）、`publicKey`、`deviceName`；验证码正确后，公钥登记到账号。此后**没有 bearer token**，设备靠签名认证；吊销设备就是删掉这把公钥。
- 每个需要认证的请求带四个头：

```
x-pig-device: <deviceId>
x-pig-time:   <毫秒时间戳>
x-pig-nonce:  <16 字节随机 hex>
x-pig-sig:    base64url(Ed25519.sign("PIG1\n<METHOD>\n<path>\n<time>\n<nonce>\n<sha256hex(body)>"))
```

- 服务端校验：时间在 ±5 分钟内；nonce 在该设备 10 分钟内未出现过（防重放）；签名有效；设备未吊销。

## 5. 同步模型

### 5.1 操作（op）

所有改变存档的入口都已经集中在 `store.js` 的方法上，改造后每个方法产生一条 op：

```json
{ "id": "<uuid>", "at": 1790000000000, "tz": 540, "op": "work", "args": ["office"] }
```

- `at`：设备时钟的发生时刻；`tz`：设备时区偏移（分钟），用于记忆里的 `[HH:MM]` 和旅行时差。
- 白名单：`feed act work study trip sleep wake calloff lottery buy look wear wearAuto renamePig lang use hatch reset adopt rename`。
- `dev`（开发者补丁）只在未登录时可用；登录后服务端拒收，下次同步即被权威存档覆盖。

### 5.2 让重放可复现：`core.js` 的三处改造

1. **时间推进走固定网格**：新增 `advance(state, toMs)`，按每个整分钟、以及 `activity.endsAt` 依次调用 `decay`。`store.freshen()` 只推进到 `advance`，op 执行前先 `advance` 到 `at` 再调用对应函数。这样存档只取决于“初始存档 + 有序 op 列表”，与面板多久刷新一次无关。代价：显示最多滞后 60 秒（外出结算精确到 `endsAt`，不受影响）。
2. **随机数进存档**：新增键 `rng`（32 位整数种子，mulberry32），所有 `Math.random()` 改为从存档取下一个数。同样的 op 序列在任何机器上抽出同样的结果。
3. **去掉隐式环境**：`Date.now()` 改为参数传入的 `nowMs`；记忆时间按存档里的 `utcOffsetMin`（每条 op 的 `tz` 写入）格式化；`startTrip` 的 `homeUtc` 来自 op 的 `tz`；新建猪的语言由 op 参数给出。

新增的 `rng`、`utcOffsetMin` 都是可默认的键，按 [STORE.SAVE.V6](../contracts/save-format.md) §4 不升 `STATE_VERSION`。

### 5.3 一次同步

```
客户端 POST /v1/sync { baseRev, ops: [...] }   （签名）
服务端：
  1. 读账号快照 S（rev, state, lastAt）
  2. 按 at 排序；每条 op：at = clamp(at, lastAt, serverNow)
  3. 校验（白名单、喂食共享冷却 D6、参数形状）→ applyOp(S, op)
     core 返回 ok:false 的（猪不在家、钱不够……）记入 rejected，其余 accepted
  4. advance(S, serverNow)；pending 清空；rev + 1；写回快照，op 入日志
  5. 回 { rev, state: S, accepted: [id], rejected: [{id, reason}] }
客户端：
  以 S 为新的本地存档，把仍未确认的 op 在上面重新执行一遍（乐观显示）
```

- **在线**：操作立即本地生效并入 outbox，后台尽快推送；没有操作时每 30 秒（面板开着）/ 5 分钟（后台）拉一次，拿到其他设备的变化。
- **离线**：outbox 一直积累，联网后一次补传；冲突的主动操作被拒，面板提示“在另一台设备上已经……”（D7）。
- **公告不重复**：服务端返回的存档清空 `pending`，结算公告由每台设备在自己的 `advance` 中产生。
- **首次登录**：账号无猪 → 上传本机存档作为初始快照；本机只有纸盒 → 直接用云端；两边都有猪 → 面板让用户二选一，不合并。

## 6. 服务端

### 6.1 代码位置

```
server/
  worker.js        fetch 入口与路由（Workers 运行时，只用 Web 标准 API）
  auth.js          验证码、冷冻、发信、设备登记、签名校验
  sync.js          快照 + 重放
  pens.js          猪圈与一起行动（P3）
  schema.sql       D1 表结构
  dev.mjs          本地开发运行器：node:http + node:sqlite 模拟 D1，验证码打印到终端
  wrangler.toml.example
```

`server/` 不进 npm 包（`package.json` `files` 不含它）。

### 6.2 表

| 表 | 关键列 |
|---|---|
| `accounts` | `id`, `email`(唯一), `created_at` |
| `devices` | `id`, `account_id`, `public_key`, `name`, `created_at`, `last_seen_at`, `revoked_at` |
| `codes` | `email`, `code_hash`, `expires_at`, `attempts` |
| `auth_events` | `ip_key`, `email`, `kind`(`send`/`fail`), `at` —— 频率限制与冷冻都从这里数 |
| `nonces` | `device_id`, `nonce`, `at` |
| `pigs` | `account_id`, `rev`, `state`(JSON), `last_at`, `last_feed_at` |
| `ops` | `account_id`, `rev`, `id`, `device_id`, `at`, `op`(JSON), `result` —— 审计与排错，保留 30 天 |
| `pens` / `pen_members` / `coops` | P3 |

### 6.3 环境变量（上线时配置）

| 名称 | 用途 |
|---|---|
| `PIG_SECRET` | 验证码哈希的盐（`wrangler secret put`） |
| `RESEND_API_KEY` | 发信（secret） |
| `PIG_MAIL_FROM` | 发件人，如 `Piggy <pig@你的域名>` |
| `PIG_ALLOWED_EMAILS` | 可选，逗号分隔的允许邮箱 |
| `PIG_FEED_EVERY_MIN` | 共享喂食冷却，默认 30 |

## 7. 防作弊边界

| 手段 | 结果 |
|---|---|
| 手改本机 `state.json` | 无效：下次同步被权威存档覆盖 |
| 用 curl 伪造请求 / 重放截获的请求 | 无效：没有私钥签不了；nonce 与时间窗挡重放 |
| 设备被盗 | 在另一台设备上吊销它 |
| 刷喂食 | 账号级共享冷却，服务端判定 |
| 改设备时钟 | `at` 被夹到 `[lastAt, serverNow]`，只能往“现在”靠 |
| 提取私钥后伪造合法 op | **防不住**，但只能做游戏里本来就能做的操作；种子在存档里，理论上可以预测彩票——10 人好友规模接受这个上限 |

## 8. 猪圈与一起行动（P3）

- 猪圈：任一账号创建，生成 6 位邀请码；最多 6 头猪。
- 邀请：A 选一项活动（打工 / 上课 / 旅游）发起，猪圈里的 B 在 10 分钟内接受。
- 接受时服务端用双方此刻的权威存档校验：都在家、都能出发、都满足条件（高阶职业 / 课程双方都要满足）。通过后对两个账号各写入一条服务端生成的 `coop` op，`startedAt` 相同，时长 ÷1.3，`activity.coop = { id, partner, bonus: 1.3 }`。
- 结算仍在各自的 `advance` 里完成，收益乘 `bonus`。开始之后两头猪互相独立，一方叫回不影响另一方。
- 面板里的猪圈列表显示每头猪的公开摘要（名字、在家 / 睡觉 / 外出及同伴），在猪圈里时 30 秒刷新；金币、背包不公开。两头猪同框显示留给“拜访 / 结婚”。
- 实现说明：接口为 `GET /v1/pen`、`POST /v1/pen/create|join|leave|invite|accept|cancel`（`server/pens.js`）；一个账号同时只在一个猪圈；接受邀请时两头猪和邀请在同一个 D1 批次里写入，靠 `coop_guard` 的 `CHECK (n = 3)` 保证要么全成要么全不成。上课的属性点按期望 +30%，小数部分由猪自己的骰子决定。

## 9. 分期与验证

| 期 | 内容 | 验证 |
|---|---|---|
| P0 | `core.js` 可复现改造（§5.2）+ `ops.js` + `store.js` 改为经由 op | `test/core.test.js` 等受影响测试；新增“同一 op 序列 + 不同刷新频率 → 存档逐字节相同”的测试 |
| P1 | 服务端：验证码、冷冻、设备登记、签名校验、同步重放；`server/dev.mjs` | `test/server-*.test.js`，用 `node:sqlite` 跑真实 SQL |
| P2 | 客户端：`lib/cloud.js`、outbox、同步循环、面板登录 UI | `test/cloud.test.js`（客户端 ↔ 本地服务端端到端）；测试用猪手动验证 |
| P3 | 猪圈、一起行动（同框显示改为猪圈成员列表，真正同框留给“拜访 / 结婚”） | 两个测试账号端到端 |
| 上线 | 用户配置域名 / Resend / Cloudflare，`wrangler d1 create` + `deploy` | 真实发信与一次跨设备同步 |
