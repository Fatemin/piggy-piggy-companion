# Piggy Piggy Companion 🐖

**简体中文** · [English](README.en.md) · [日本語](README.ja.md)

一只住在 **Claude Code** 和你桌面上的猪。它吃你的**真实工作**长大，会上课、打工、环游世界、生病，玩法照 QQ 宠物（怀旧服 v1.2.4）复刻。

> [!NOTE]
> **本项目是 fork，不是从零写的。**
>
> 主要来源是 [**CLICGGER-TYPES/dsh-piggy**](https://github.com/CLICGGER-TYPES/dsh-piggy)（MIT，© dsh-pig contributors）——一只住在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 里的猪。游戏本体（状态机、数值、六图标面板、疾病链、学习 / 打工 / 商店系统）都来自上游，上游原版说明保留在 [README.dsh.md](README.dsh.md)。
>
> 在此基础上，我按自己的想法做了二次开发：把它搬进 Claude Code、做成桌面宠物，并改了不少玩法（见「[和上游的区别](#和上游的区别)」）。上游的版权声明与许可原样保留在 [LICENSE](LICENSE)，第三方声明见 [THIRD-PARTY.md](THIRD-PARTY.md)。
>
> 这是非官方的个人作品，与上游作者、DeepSeek、Anthropic、腾讯均无关联。

## 特点

- **零 token**：只用 hooks 和 statusLine，hook 永不输出，模型不知道猪存在（`claude plugin details` 显示常驻开销 ~0）
- **不拖慢工作**：所有 hook 都是 `async`，出了任何问题也永远 `exit 0`
- **贴着上游改**：Claude Code 适配层全部在新增目录里；玩法改动只动了根目录几处，都标了 `[dsh-piggy-claude-code mod]`，merge 上游更新时容易对照
- **三种语言**：中文 / 日本語 / English，随时切换

四种看猪的方式：

| | 是什么 | 平台 |
|---|---|---|
| 状态栏 | Claude Code 底部一行：`🐖 猪猪 · 🍚79 ❤️73 🫧90 💚5/5 · 🪙500 · 😊` | 全平台 |
| 网页面板 | 上游的六图标面板（一整套自带动画的手绘 SVG 形象），浏览器打开 | 全平台 |
| 桌面悬浮猪 | 透明的桌面宠物（普通窗口，不强制置顶，点一下猪就回到前面）+ 菜单栏图标，点击猪以外的地方直接穿透 | macOS |
| 独立桌宠 App | 不接 Claude Code，双击安装就能养 | Windows · macOS |

## 和上游的区别

### 我新增的部分

| | 内容 |
|---|---|
| Claude Code 插件 | 5 个 hook 把你的提问、回复、工具调用变成猪的口粮；`lib/host.js` 模拟上游需要的 DSH 宿主接口，上游插件以为自己还在 DSH 里 |
| 状态栏 | 一行猪状态，可以接在你原有的 statusLine 后面 |
| 命令行 | 终端里的 `pig` 命令，代替上游的 `/pig` 斜杠命令（不经过模型、不花 token） |
| 桌面悬浮猪 | macOS 原生（SwiftPM），透明、不强制置顶、点击穿透、开机自启 |
| 独立桌宠 App | Electron 版，Windows + macOS 安装包 |
| 多语言 | 中文 / 日本語 / English，gettext 风格，词典在 `locales/` |
| 美术 | 22 张重新手绘、自带动画的 SVG：每个人生阶段、心情、外出、照顾反应各一张 |

### 玩法改动

| | 上游原版 | 本项目 |
|---|---|---|
| 长大靠什么 | 年龄：第 1 / 3 / 7 天换阶段 | **体重**：20 kg 青年猪、50 kg 中年猪、**80 kg 老年猪** |
| 体型 | 每个阶段固定大小（40–62 px） | **随体重连续变大**：出生 40 px，**120 kg 时 200 px**，之后放慢，**500 kg 时 400 px**（封顶） |
| 形象 | 纸盒 → 小猪 → 青年猪 → 中年猪 → 老年猪 | 始终是项目原有的同一只 Noto 🐖，老年猪拄拐杖；心情（饿 / 脏 / 睡 / 开心 / 孤单 / 生病）、外出（打工 / 上课 / 旅行）、照顾反应（喂食 / 洗澡 / 玩耍 / 摸摸 / 拒绝 / 病愈）各有自己的姿势和动画，见 `tools/sprites.html` |
| 装扮 | — | **衣柜**：蝴蝶结、鸭舌帽、学士帽、草帽、圆眼镜、墨镜、红领巾、白眉白胡子，外加商店「装扮」货架上卖的 5 件腰饰（网红呼啦圈、小黄鸭游泳圈、多巴胺腰包、杀马特腰链、BP机皮带），按头 / 眼 / 腰 / 脸 / 身上五个部位（「身上」是健身练出的肌肉，或手里攒到过 10000 金币变成的黄金猪）**自由搭配**，每个姿势都戴着。腰饰用金币买，其余靠进度解锁（长大、上课、拿毕业证、旅行、去过中东·非洲）；没动过衣柜时跟着阶段穿（小猪蝴蝶结、中年猪鸭舌帽、老年猪白胡子）。自带装备的姿势（旅行草帽、工地安全帽、实验护目镜…）会暂时盖住同部位的装饰 |
| 体重从哪来 | 每个事件、每次喂食固定加几克 | **只来自真正吃下去的饱食度**：每点约 98 g，80 kg 后约 50 g。吃饱了再喂不长肉 |
| 长大要多久 | — | 正常照顾：约 1 周到 80 kg，约 2 周到 120 kg，之后长得更慢，再约 4 个多月到 500 kg |
| 睡觉 | — | **可以让猪去睡觉**（面板按钮或 `pig sleep`），独立桌宠 App 里**电脑休眠时它也跟着睡**。睡着时只掉饱食，心情和清洁慢慢恢复（约每小时 +9 / +6），生病风险减半；喂食、洗澡、玩耍、摸摸或出门都会叫醒它 |
| 寿命 | 第 14 天老死 | **不会老死**；生病拖到健康归零仍会死，还魂丹照样能救 |
| 名字 | 只能用命令改 | 第一次起名免费；之后每次改名用一张**更名卡**（商店「道具」，1000 🪙） |
| 旅行 | 郊游 / 名山大川 / 看海 / 出国四档 | **7 个地区 22 个目的地**，按你电脑所在时区算路费和时长；带回纪念品和当地特产，**集齐一个地区**得属性奖励和被动效果 |
| 上学 | 小学 → 大学 → 研究生，一次一门 | 加 **博士**（12 小时、学费 2400、属性 +7）；**大学可以同时上 2 门，研究生和博士 3 门** |
| 语言 | 只有中文 | **中文 / 日本語 / English** |
| 打工 | 打零工 / 搬砖 / 上班三档 | **按智力 / 魅力 / 武力分组**，每组有不同时长的工作和一个**固定 15 分钟、收入随机**的零工；每组最上面是要属性才能接的**高阶工作**：AI 训练师、网红、VTuber（收入随机）、健身教练 |
| 商店 | 只有价格 | 每样东西写明**效果**（饱食 / 心情 / 清洁，药写明治什么病）；背包按货架**分区**；顶部**刮彩票**：100 🪙 一张、每 10 分钟一次，一等 10000 / 二等 1000 / 三等 200 / 安慰 100 / 谢谢参与 |
| 健身房 | — | 打工页顶部的**健身房**：跑步机（30 分钟 50 🪙，−2 kg）/ 撸铁（1 小时 150 🪙，−5 kg）/ 私教课（2 小时 400 🪙，−12 kg），像上课一样出门，回来**变瘦、体型变小**，最低 20 kg；阶段按到过的最高体重算，减重不会变回小猪。**一共瘦掉 100 kg 练成肌肉猪**：解锁「身上」部位的肌肉装扮并自动穿上 |

改动集中在 `data.js`、`core.js`、`index.js`、`store.js`、`client.js`、`world.js`，都标了 `[dsh-piggy-claude-code mod]`。

<details>
<summary><b>大面板与界面</b></summary>

- 悬浮菜单可以拖左上角、上边、左边**拉大**（记住大小，双击左上角复位）；菜单变宽时商店、背包等会多排几列
- 点菜单和猪以外的地方，菜单**自动收起**（桌宠是窗口失去焦点时收起）
- 菜单右上角 **⤢** 打开**大面板**：左栏是猪、名字、四条状态、属性、照顾按钮和语言，右栏是六个标签页。桌宠 App 的托盘「打开大面板」、Claude Code 用户的 `pig serve` 网页打开的都是它
- 大面板两种皮肤：**游戏风**（默认）和 **Excel 风**——绿色标题栏「季度预算.xlsx - Excel」、菜单带、`fx =PIG("名字")` 公式栏、行列号和网格线、状态值是条件格式数据条、六个标签页变成底部的工作表标签，窗口标题也跟着变。**老板键**：连按两次 Esc 或 Ctrl+Shift+E 瞬间切成表格；表格底部状态栏的按钮切回来
- 窄于 760px 时左右两栏上下排列

</details>

<details>
<summary><b>旅行地区与奖励</b></summary>

旅费 100 🪙 + 每跨一个时区 200 🪙，时长 1 小时 + 每个时区 1 小时。每次带回一件纪念品，60% 概率顺手带回消耗品（一半是只能旅行得到的当地特产）。

| 地区 | 目的地 | 集齐奖励 | 被动效果 |
|---|---|---|---|
| 🐉 中国 | 北京 · 成都 · 西安 · 上海 | 武力 +3、体重 +5 kg | 🍚 干饭王：吃东西长肉 +10% |
| 🗾 东亚 | 东京 · 首尔 · 乌兰巴托 | 智力 +2、魅力 +2 | 📚 卷王：上课时间 -20% |
| 🛺 南亚·东南亚 | 曼谷 · 新加坡 · 新德里 | 魅力 +2 | 🧘 佛系：心情掉得慢 25% |
| 🏰 欧洲 | 巴黎 · 罗马 · 伦敦 | 智力 +4 | 🖼 博物馆通票：旅行回来心情 +50% |
| 🗽 美洲 | 纽约 · 墨西哥城 · 里约热内卢 | 武力 +2、魅力 +2 | ✈️ 常旅客：旅费 -20% |
| 🐫 中东·非洲 | 迪拜 · 开罗 · 内罗毕 | 魅力 +1、武力 +1 | 💰 土豪：打工收入 +15% |
| 🐧 大洋洲·南极 | 悉尼 · 奥克兰 · 南极科考站 | 武力 +2 | 🧣 抗寒体质：更不容易生病 |
| 🌍 全部集齐 | — | 三项属性各 +3，称号「环球旅行家」 | — |

每个目的地有 2 件纪念品，优先给还没集到的。数值都在 [`world.js`](world.js)。

</details>

<details>
<summary><b>多语言</b></summary>

语言跟着存档走：面板、状态栏、托盘 / 菜单栏、终端命令都用同一只猪的语言。

- 新猪默认用 `PIG_LANG`；桌面猪和独立桌宠 App 会把系统语言传进去。没有设置时是中文
- 这个功能出现之前的老存档一律保持中文，不会自己变
- 翻译以中文原文为键（gettext 方式），词典在 `locales/`，术语表在 [`locales/GLOSSARY.md`](locales/GLOSSARY.md)；缺翻译时回落到中文
- 切换前已经写下的回忆和公告保持原来的语言

</details>

## 需要

- Claude Code（带 `PostToolUseFailure` / `StopFailure` hook 的版本；在 2.1.285 上验证）
- Node.js ≥ 20
- 桌面悬浮猪另需 macOS 13+ 和 Swift 6 工具链（Xcode 或 Command Line Tools）

## 安装

**1. 插件（喂猪的 hooks）**

```bash
claude plugin marketplace add Fatemin/piggy-piggy-companion
```

```bash
claude plugin install dsh-piggy@dsh-piggy-claude-code
```

重启 Claude Code 后生效。

**2. 克隆一份（命令行、状态栏、面板、桌面猪都用它）**

```bash
git clone https://github.com/Fatemin/piggy-piggy-companion.git ~/piggy-piggy-companion
```

**3. 孵一只猪**

```bash
node ~/piggy-piggy-companion/bin/pig.js hatch
```

（或者在面板 / 桌面猪里戳三下纸盒。）

## 状态栏

在 `~/.claude/settings.json` 里：

```json
"statusLine": { "type": "command", "command": "sh ~/piggy-piggy-companion/bin/statusline.sh" }
```

已经有自己的 statusLine？把原命令当参数传进去，猪会接在后面：

```json
"statusLine": { "type": "command", "command": "sh ~/piggy-piggy-companion/bin/statusline.sh ~/.claude/my-statusline" }
```

状态栏只读，不会写存档。

## 网页面板

```bash
node ~/piggy-piggy-companion/bin/pig.js serve
```

打开 <http://127.0.0.1:41717/>，右键猪开菜单，左键摸摸。

## 桌面悬浮猪（macOS）

```bash
~/piggy-piggy-companion/desktop/build.command
```

```bash
~/piggy-piggy-companion/desktop/.build/release/DshPiggyDesk
```

- **右键猪**开关菜单，**左键**摸摸，**拖动猪**移动整个窗口（位置会记住）
- 猪以外的透明区域，点击**直接穿透**到下面的窗口
- 菜单栏小猪：状态一行、显示/隐藏、回到右下角、在浏览器打开面板、退出
- 自己拉起面板服务（已有就复用），退出时一起停；App 意外退出，服务 2 秒内自行退出并保存

开机自启（LaunchAgent）：`desktop/install-autostart.command`，撤销：`desktop/uninstall-autostart.command`。

> 如果 `swift build` 报 `Invalid manifest` / 链接失败，`brew install swift` 后再构建即可，`build.command` 会自动优先用 Homebrew 的工具链。

自检：用 `PIGGY_DEBUG_SNAPSHOT=<目录>` 启动时，App 会把窗口渲染（收起 / 展开）和点击穿透判定写进该目录，不需要录屏权限。

## 独立桌宠 App（Windows + macOS）

`app/` 是 Electron 版的桌面猪：不接 Claude Code，双击就能用。猪的逻辑和面板与上面是同一份（`app/scripts/sync.mjs` 把根目录的运行时拷进去）。

- Mac：`.dmg`，通用包（Intel + Apple 芯片）；Windows：一键安装的 `Setup.exe`（x64，免管理员）
- 右键开菜单、左键摸摸、拖动移动，猪以外的区域点击穿透；托盘 / 菜单栏图标可隐藏、复位、开机自启、退出
- 电脑休眠时猪跟着睡，电脑醒来就起床；你亲手哄睡的猪不会被电脑叫醒
- 自动检查更新：GitHub 上有新版本时，猪猪冒个气泡说一声，面板顶部出现更新卡片，点「立即更新」就下载、替换并重启；语言下面的版本行可以随时「检查更新」。不弹窗
- 存档在系统的应用数据目录（Mac `~/Library/Application Support/piggy-piggy-companion/`，Windows `%APPDATA%\piggy-piggy-companion\`），和 Claude Code 版互不影响。App 原名「DSH Piggy」：改名后第一次启动会自动把旧目录里的猪搬过来，旧目录原样留作备份

```bash
cd app && npm install
```

```bash
npm run dist:mac
```

```bash
npm run dist:win
```

产物在 `app/dist/`。未签名：Mac 首次打开要在「系统设置 → 隐私与安全性」里点「仍要打开」，Windows 要在 SmartScreen 里点「更多信息 → 仍要运行」。给不熟悉电脑的人的说明见 [`app/share-readme.txt`](app/share-readme.txt)。开发时 `npm start` 直接运行。

发新版：先改 `app/package.json` 的 `version`，打包后在 GitHub 建 Release，tag 写 `v<版本号>`，把 `.dmg` 和 `Setup.exe` 作为附件上传。已装的 App 启动 20 秒后和之后每 6 小时查一次最新 Release（草稿和预发布不算）。Mac 版要装在可写的目录（如「应用程序」）才能自己替换，直接从 dmg 里运行时会改为打开下载页。

## 命令

```
pig                                  状态卡
pig hatch | feed | bathe | play | pet | sleep | wake
pig study <科目> <小学|大学|研究生>    pig work <odd|site|office>    pig trip <suburb|mountain|sea|abroad>
pig shop | buy <物品> | use <物品> | calloff | weigh | name <名字>
pig wear [装饰|自动|不穿]            衣柜：列出 / 穿脱 / 跟着阶段 / 全脱
pig lang zh | ja | en                 切换语言
pig serve                            面板服务
pig status-line                      一行状态
```

（`pig` = `node ~/piggy-piggy-companion/bin/pig.js`，可以自己 alias。）刻意不做成 Claude Code 斜杠命令——那样每次都要经过模型、花 token。

## 怎么接上的

| DSH | Claude Code |
|---|---|
| `agent/inbox/claimed` | `UserPromptSubmit` → `message` |
| `agent/turn-stopping` | `Stop` → `turn` |
| `tools/result`（成功 / 失败） | `PostToolUse` / `PostToolUseFailure` → `tool` / `toolError` |
| `agent/error` | `StopFailure` → `agentError` |
| `ctx.webServer` + 客户端挂载 | `pig serve` + `web/index.html`（浏览器）/ `web/desk.html`（桌面猪） |
| `/pig` 斜杠命令 | 终端里的 `pig` |

| 目录 | 内容 | 来源 |
|---|---|---|
| `.claude-plugin/` · `hooks/` | 插件清单、marketplace、5 个 hook | 本项目 |
| `bin/` | `pig.js`（命令行 / 服务）、`pig-hook.js`（hook 入口）、`statusline.sh`、`pig-node.sh` | 本项目 |
| `lib/` | 宿主模拟、存档锁、面板服务、状态栏 | 本项目 |
| `web/` | 浏览器面板与桌面猪的外壳页 | 本项目 |
| `desktop/` | macOS 悬浮猪（SwiftPM） | 本项目 |
| `app/` | 独立桌宠（Electron） | 本项目 |
| `locales/` · `i18n.js` · `world.js` | 多语言、旅行世界 | 本项目 |
| `assets/` | SVG 形象：本体是 Noto Emoji 的 🐖，`tools/build-sprites.mjs` 加动作和配饰生成 | Noto Emoji 为 Apache-2.0 |
| 根目录其余文件 | 游戏本体 | 上游 dsh-piggy（玩法改动处有标记） |

## 存档

默认 `~/.claude/pig/state.json`，可用 `PIG_STATE` 改；面板端口默认 `41717`，可用 `PIG_PORT` 改。

Claude Code 一小时能有几百次工具调用，远超上游数值设计时的假设，所以**被动喂食有节流：所有会话合起来最多每 30 分钟喂一口**（`PIG_FEED_EVERY_MIN` 可调，`0` = 关闭）。

每个 hook 都是独立的短进程，还可能有多个会话同时在跑，所以：

1. 面板服务（`pig serve` 或桌面猪）在跑时，它持有存档锁、是**唯一写者**，hook 只通知它；
2. 服务没跑时，hook 拿锁后直接读 → 喂 → **立即落盘**；
3. 1 秒内拿不到锁就丢掉这一口——少吃一口没事，卡住 Claude Code 不行。

锁是带 pid 的目录，持有者进程死了会被自动接管。

## 安全

面板服务只绑 `127.0.0.1`；校验 `Host`（防 DNS rebinding），带 `Origin` 时必须是本服务，POST 必须是 `application/json`。本机其他进程仍然可以访问它。

## 测试

```bash
node --test test/*.test.js
```

包含上游自带的测试和适配层测试（`test/cc.test.js`）。

## 已知限制

- `StopFailure` 已接线，但没有端到端验证（难以人为制造 API 错误）
- 原生桌面悬浮猪只有 macOS 版（Windows 请用独立桌宠 App）
- 过期锁接管在"两个进程同时发现过期锁"的极端情况下有很小的竞态窗口

## 许可与致谢

- 代码以 **MIT** 发布，见 [LICENSE](LICENSE)。上游 dsh-piggy 的版权声明（© dsh-pig contributors）原样保留。
- 游戏本体、数值体系、面板设计来自 [CLICGGER-TYPES/dsh-piggy](https://github.com/CLICGGER-TYPES/dsh-piggy)，感谢原作者。
- 参考资料、字体、运行时依赖与商标声明见 [THIRD-PARTY.md](THIRD-PARTY.md)。
- QQ 宠物 / QQ 是腾讯的商标；本项目为独立的非官方致敬作品，与腾讯无关联，亦未获其授权。
