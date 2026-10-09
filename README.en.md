# Piggy Piggy Companion 🐖

[简体中文](README.md) · **English** · [日本語](README.ja.md)

A pig that lives in **Claude Code** and on your desktop. It grows on your **real work**, goes to school, takes jobs, travels the world and gets sick — gameplay modelled on QQ Pet (怀旧服 v1.2.4).

> [!NOTE]
> **This project is a fork, not written from scratch.**
>
> It is based on [**CLICGGER-TYPES/dsh-piggy**](https://github.com/CLICGGER-TYPES/dsh-piggy) (MIT, © dsh-pig contributors), a pig that lives inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). The game itself — the state machine, the numbers, the six-icon panel, illness chains, school / jobs / shop — comes from upstream. The original upstream README is kept as [README.dsh.md](README.dsh.md) (Chinese).
>
> On top of that I have reworked it to my own ideas: moved it into Claude Code, turned it into a desktop pet, and changed a fair amount of gameplay (see [Differences from upstream](#differences-from-upstream)). Upstream's copyright and license are kept intact in [LICENSE](LICENSE); third-party notices are in [THIRD-PARTY.md](THIRD-PARTY.md).
>
> This is an unofficial personal project, not affiliated with the upstream author, DeepSeek, Anthropic or Tencent.

## Highlights

- **Zero tokens**: hooks and statusLine only. Hooks never print anything, so the model never knows the pig exists (`claude plugin details` shows ~0 resident cost)
- **Never slows you down**: every hook is `async` and always `exit 0`, whatever goes wrong
- **Stays close to upstream**: the Claude Code adapter lives in new directories; gameplay changes touch only a few root files and are all tagged `[dsh-piggy-claude-code mod]`, so upstream merges are easy to review
- **Three languages**: 中文 / 日本語 / English, switchable at any time

Four ways to see your pig:

| | What it is | Platform |
|---|---|---|
| Status line | One line at the bottom of Claude Code: `🐖 Piggy · 🍚79 ❤️73 🫧90 💚5/5 · 🪙500 · 😊` | All |
| Web panel | Upstream's six-icon panel (a full set of animated hand-drawn SVG sprites) in your browser | All |
| Floating desktop pig | Transparent pet in an ordinary window (not always on top; click the pig to bring it to the front) plus a menu-bar icon; clicks outside the pig pass straight through | macOS |
| Standalone app | No Claude Code needed — install and start raising | Windows · macOS |

## Differences from upstream

### What I added

| | |
|---|---|
| Claude Code plugin | 5 hooks turn your prompts, replies and tool calls into food; `lib/host.js` emulates the DSH host interfaces upstream needs, so the upstream plugin thinks it is still running in DSH |
| Status line | A one-line pig summary that can be appended to your existing statusLine |
| CLI | A `pig` command in your terminal instead of upstream's `/pig` slash command (never goes through the model, costs no tokens) |
| Floating desktop pig | Native macOS (SwiftPM): transparent, not forced on top, click-through, launch at login |
| Standalone app | Electron build with installers for Windows and macOS |
| Localisation | 中文 / 日本語 / English, gettext-style, dictionaries in `locales/` |
| Art | 22 redrawn, self-animating SVGs: one for every life stage, mood, outing and care reaction |

### Gameplay changes

| | Upstream | This project |
|---|---|---|
| What makes it grow | Age: new stage on day 1 / 3 / 7 | **Weight**: young at 20 kg, middle-aged at 50 kg, **elder at 80 kg** |
| Size | Fixed per stage (40–62 px) | **Grows continuously with weight**: 40 px at birth, **200 px at 120 kg**, then more slowly to **400 px at 500 kg** (cap) |
| Looks | Box → piglet → young → middle-aged → elder | One sprite per stage, plus its own pose and animation for each mood (hungry / dirty / sleepy / happy / lonely / sick), outing (work / school / trip) and care reaction (eat / bathe / play / pet / refuse / cured) — see `tools/sprites.html` |
| Dress-up | — | **Wardrobe**: bow, flat cap, mortarboard, straw hat, round glasses, sunglasses, red scarf, white brows & beard, plus five waist pieces sold on the shop's Dress-up shelf (viral hula hoop, rubber-duck swim ring, dopamine fanny pack, emo chain belt, pager belt), **mixed freely** across five slots (head / eyes / waist / face / body; the body slot holds the muscles earned at the gym) and worn in every pose. The waist pieces cost coins; the rest unlock by progress (growing up, lessons, diplomas, trips, the Middle East & Africa); until you open the wardrobe it matches the stage (piglet bow, grown-pig flat cap, elder beard). Poses with their own gear (the trip's straw hat, the site helmet, lab goggles…) cover that slot for a while |
| Where weight comes from | A fixed few grams per event and per meal | **Only from fullness actually eaten**: ~98 g per point, ~50 g after 80 kg. Feeding a full pig adds nothing |
| Time to grow up | — | With normal care: about 1 week to 80 kg, about 2 weeks to 120 kg, then more slowly, about 4 more months to 500 kg |
| Sleep | — | **Put the pig to bed** (panel button or `pig sleep`); in the standalone desktop app **it also sleeps when the computer does**. Asleep it only gets hungrier, mood and cleanliness slowly come back (about +9 / +6 an hour) and it falls ill half as easily; feeding, bathing, playing, petting or sending it out wakes it |
| Lifespan | Dies of old age on day 14 | **Never dies of old age**; untreated illness down to 0 health still kills, and the Revival pill still works |
| Name | Command only | First name is free; each rename after that costs a **Rename card** (shop → items, 1000 🪙) |
| Travel | Four tiers: outing / mountains / seaside / abroad | **22 destinations in 7 regions**, priced and timed by your computer's time zone; brings back souvenirs and local specialities; **completing a region** grants stat bonuses and a passive perk |
| School | Primary → university → graduate, one course at a time | Adds a **doctorate** (12 h, 2400 tuition, +7 stats); **2 parallel courses at university, 3 at graduate and doctorate** |
| Language | Chinese only | **中文 / 日本語 / English** |
| Work | Odd jobs / bricks / office | **Grouped by smarts / charm / strength**, each with jobs of different lengths and one **fixed 15-minute gig with random pay**; the top of each group is a **career** that needs trait points: AI trainer, influencer, VTuber (random pay), fitness coach |
| Shop | Prices only | Every item states its **effect** (fullness / mood / cleanliness; medicines say what they cure); the bag is **sorted into shelves**; **scratch cards** at the top: 100 🪙 each, one every 10 minutes, 1st 10000 / 2nd 1000 / 3rd 200 / consolation 100 / no luck |
| Gym | — | A **gym** at the top of the Work page: treadmill (30 min, 50 🪙, −2 kg) / weights (1 h, 150 🪙, −5 kg) / personal trainer (2 h, 400 🪙, −12 kg). The pig goes out like for a lesson and comes back **lighter and smaller**, never below 20 kg; its life stage follows the heaviest it has been, so slimming never turns it back into a piglet. **Lose 100 kg in all to become a muscle pig**: unlocks the muscle look in the new body slot and puts it on |

Changes are concentrated in `data.js`, `core.js`, `index.js`, `store.js`, `client.js` and `world.js`, all tagged `[dsh-piggy-claude-code mod]`.

<details>
<summary><b>Big panel and interface</b></summary>

- Drag the floating menu's top-left corner, top edge or left edge to **make it bigger** (the size is remembered; double-click the corner to reset); a wider menu lays the shop, bag and so on out in more columns
- Click anywhere outside the menu and the pig and the menu **closes itself** (the desktop pet closes it when its window loses focus)
- **⤢** at the menu's top right opens the **big panel**: the pig, name, four bars, traits, care buttons and language on the left, the six tabs on the right. It is also what the app's tray item "Open the big panel" and `pig serve` open
- Two skins for the big panel: **game** (default) and **Excel** — a green "Quarterly Budget.xlsx - Excel" title bar, a ribbon, an `fx =PIG("name")` formula bar, row and column headers with gridlines, the bars as conditional-format data bars, the six tabs as worksheet tabs at the bottom, and the window title follows. **Boss key**: Esc twice or Ctrl+Shift+E turns it into a spreadsheet at once; the button in the sheet's status bar switches back
- Narrower than 760 px, the two columns stack

</details>

<details>
<summary><b>Travel regions and rewards</b></summary>

Fare: 100 🪙 + 200 🪙 per time zone crossed; duration: 1 h + 1 h per time zone. Every trip brings back one souvenir, and with 60% chance a consumable too (half of those are local specialities you can only get by travelling).

| Region | Destinations | Completion reward | Passive perk |
|---|---|---|---|
| 🐉 China | Beijing · Chengdu · Xi'an · Shanghai | Strength +3, weight +5 kg | 🍚 Chow king: +10% weight from food |
| 🗾 East Asia | Tokyo · Seoul · Ulaanbaatar | Smarts +2, Charm +2 | 📚 Grind king: classes 20% shorter |
| 🛺 South & SE Asia | Bangkok · Singapore · New Delhi | Charm +2 | 🧘 Zen mode: mood drops 25% slower |
| 🏰 Europe | Paris · Rome · London | Smarts +4 | 🖼 Museum pass: +50% mood from trips |
| 🗽 The Americas | New York · Mexico City · Rio de Janeiro | Strength +2, Charm +2 | ✈️ Frequent flyer: fares -20% |
| 🐫 Middle East & Africa | Dubai · Cairo · Nairobi | Charm +1, Strength +1 | 💰 Tycoon: +15% job income |
| 🐧 Oceania & Antarctica | Sydney · Auckland · Antarctic station | Strength +2 | 🧣 Cold-proof: less likely to get sick |
| 🌍 All regions | — | +3 to all three stats, title "Globetrotter" | — |

Each destination has 2 souvenirs; ones you don't have yet come first. All numbers live in [`world.js`](world.js).

</details>

<details>
<summary><b>Languages</b></summary>

The language belongs to the save: panel, status line, tray / menu bar and terminal commands all speak the pig's language.

- New pigs use `PIG_LANG`; the desktop pig and the standalone app pass in your system language. Without either, it's Chinese
- Saves from before this feature stay Chinese and never switch on their own
- Translations are keyed by the Chinese source text (gettext style); dictionaries are in `locales/`, the glossary is [`locales/GLOSSARY.md`](locales/GLOSSARY.md); missing translations fall back to Chinese
- Memories and notices written before a switch keep their original language

</details>

## Requirements

- Claude Code (a version with the `PostToolUseFailure` / `StopFailure` hooks; verified on 2.1.285)
- Node.js ≥ 20
- The floating desktop pig additionally needs macOS 13+ and a Swift 6 toolchain (Xcode or Command Line Tools)

## Install

**1. Plugin (the hooks that feed the pig)**

```bash
claude plugin marketplace add Fatemin/piggy-piggy-companion
```

```bash
claude plugin install dsh-piggy@dsh-piggy-claude-code
```

Restart Claude Code to activate it.

**2. Clone a copy (used by the CLI, status line, panel and desktop pig)**

```bash
git clone https://github.com/Fatemin/piggy-piggy-companion.git ~/piggy-piggy-companion
```

**3. Hatch a pig**

```bash
node ~/piggy-piggy-companion/bin/pig.js hatch
```

(Or poke the box three times in the panel / desktop pig.)

## Status line

In `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "sh ~/piggy-piggy-companion/bin/statusline.sh" }
```

Already have a statusLine? Pass your command as an argument and the pig is appended after it:

```json
"statusLine": { "type": "command", "command": "sh ~/piggy-piggy-companion/bin/statusline.sh ~/.claude/my-statusline" }
```

The status line is read-only and never writes the save.

## Web panel

```bash
node ~/piggy-piggy-companion/bin/pig.js serve
```

Open <http://127.0.0.1:41717/>. Right-click the pig for the menu, left-click to pet it.

## Floating desktop pig (macOS)

```bash
~/piggy-piggy-companion/desktop/build.command
```

```bash
~/piggy-piggy-companion/desktop/.build/release/DshPiggyDesk
```

- **Right-click** the pig to toggle the menu, **left-click** to pet, **drag** to move the window (position is remembered)
- Clicks on the transparent area around the pig **pass through** to the window below
- Menu-bar pig: status line, show / hide, back to bottom-right, open panel in browser, quit
- Starts the panel server itself (or reuses a running one) and stops it on quit; if the app crashes, the server saves and exits within 2 seconds

Launch at login (LaunchAgent): `desktop/install-autostart.command`; undo with `desktop/uninstall-autostart.command`.

> If `swift build` fails with `Invalid manifest` or a link error, run `brew install swift` and build again — `build.command` prefers the Homebrew toolchain automatically.

Self-check: launch with `PIGGY_DEBUG_SNAPSHOT=<dir>` and the app writes window renders (collapsed / expanded) and click-through decisions to that directory, no screen-recording permission needed.

## Standalone app (Windows + macOS)

`app/` is an Electron desktop pig: no Claude Code, just install and run. The pig logic and panel are the same code as above (`app/scripts/sync.mjs` copies the root runtime in).

- Mac: universal `.dmg` (Intel + Apple silicon); Windows: one-click `Setup.exe` (x64, no admin needed)
- Right-click for the menu, left-click to pet, drag to move, click-through outside the pig; tray / menu-bar icon to hide, reset position, launch at login and quit
- The pig falls asleep when the computer sleeps and gets up when it wakes; a pig you put to bed yourself is not woken by the computer
- Update check: when GitHub has a newer version the pig says so in a bubble and the panel shows an update card on top; "Update now" downloads it, swaps it in and restarts. The version row under the languages has "Check for updates". No pop-up dialogs
- Saves live in the system app-data folder (Mac `~/Library/Application Support/piggy-piggy-companion/`, Windows `%APPDATA%\piggy-piggy-companion\`), separate from the Claude Code pig. The app used to be called "DSH Piggy": its first start under the new name brings the pig over from the old folder, which stays as a backup

```bash
cd app && npm install
```

```bash
npm run dist:mac
```

```bash
npm run dist:win
```

Output goes to `app/dist/`. Builds are unsigned: on Mac, the first launch needs "Open Anyway" in System Settings → Privacy & Security; on Windows, click "More info → Run anyway" in SmartScreen. A guide for less technical users is in [`app/share-readme.txt`](app/share-readme.txt) (Chinese). Use `npm start` during development.

To ship a new version: bump `version` in `app/package.json`, build, then create a GitHub Release tagged `v<version>` with the `.dmg` and `Setup.exe` attached. Installed apps check the latest release 20 s after launch and every 6 hours (drafts and pre-releases are ignored). On Mac the app must sit in a writable folder (such as Applications) to replace itself; run straight from the dmg it opens the download page instead.

## Commands

```
pig                                  status card
pig hatch | feed | bathe | play | pet | sleep | wake
pig study <subject> <小学|大学|研究生>  pig work <odd|site|office>    pig trip <suburb|mountain|sea|abroad>
pig shop | buy <item> | use <item> | calloff | weigh | name <name>
pig wear [item|auto|none]            wardrobe: list / put on or take off / match stage / nothing
pig lang zh | ja | en                 switch language
pig serve                            panel server
pig status-line                      one-line status
```

(`pig` = `node ~/piggy-piggy-companion/bin/pig.js`; alias it if you like.) It is deliberately not a Claude Code slash command — that would go through the model and cost tokens every time.

## How it's wired

| DSH | Claude Code |
|---|---|
| `agent/inbox/claimed` | `UserPromptSubmit` → `message` |
| `agent/turn-stopping` | `Stop` → `turn` |
| `tools/result` (success / failure) | `PostToolUse` / `PostToolUseFailure` → `tool` / `toolError` |
| `agent/error` | `StopFailure` → `agentError` |
| `ctx.webServer` + client mount | `pig serve` + `web/index.html` (browser) / `web/desk.html` (desktop pig) |
| `/pig` slash command | `pig` in the terminal |

| Path | Contents | Origin |
|---|---|---|
| `.claude-plugin/` · `hooks/` | Plugin manifest, marketplace, 5 hooks | This project |
| `bin/` | `pig.js` (CLI / server), `pig-hook.js` (hook entry), `statusline.sh`, `pig-node.sh` | This project |
| `lib/` | Host emulation, save lock, panel server, status line | This project |
| `web/` | Shell pages for the browser panel and desktop pig | This project |
| `desktop/` | macOS floating pig (SwiftPM) | This project |
| `app/` | Standalone desktop pet (Electron) | This project |
| `locales/` · `i18n.js` · `world.js` | Localisation, travel world | This project |
| `assets/` | Hand-drawn SVG sprites | Redrawn in this project |
| Other root files | The game itself | Upstream dsh-piggy (gameplay changes are tagged) |

## Save file

Default `~/.claude/pig/state.json`, override with `PIG_STATE`; panel port defaults to `41717`, override with `PIG_PORT`.

Claude Code can make hundreds of tool calls an hour — far beyond what upstream's numbers assume — so **passive feeding is throttled: at most one bite every 30 minutes across all sessions** (`PIG_FEED_EVERY_MIN` to tune, `0` = off).

Every hook is a separate short-lived process, and several sessions may run at once, so:

1. While the panel server (`pig serve` or the desktop pig) is running, it holds the save lock and is the **only writer**; hooks just notify it;
2. When no server is running, a hook takes the lock, reads → feeds → **writes immediately**;
3. If the lock can't be taken within 1 second, the bite is dropped — a missed snack is fine, stalling Claude Code is not.

The lock is a directory tagged with a pid; if its holder dies, it is taken over automatically.

## Security

The panel server binds to `127.0.0.1` only, checks `Host` (against DNS rebinding), requires any `Origin` to be itself, and requires POSTs to be `application/json`. Other local processes can still reach it.

## Tests

```bash
node --test test/*.test.js
```

Includes upstream's tests and the adapter tests (`test/cc.test.js`).

## Known limitations

- `StopFailure` is wired up but not verified end-to-end (API errors are hard to provoke on purpose)
- The native floating pig is macOS only (on Windows, use the standalone app)
- Stale-lock takeover has a tiny race window if two processes notice the stale lock at the same moment

## License and credits

- Code is released under **MIT**, see [LICENSE](LICENSE). Upstream dsh-piggy's copyright notice (© dsh-pig contributors) is preserved.
- The game, its number system and panel design come from [CLICGGER-TYPES/dsh-piggy](https://github.com/CLICGGER-TYPES/dsh-piggy) — thanks to the original authors.
- Reference material, fonts, runtime dependencies and trademark notices: see [THIRD-PARTY.md](THIRD-PARTY.md).
- QQ Pet (QQ 宠物) and QQ are trademarks of Tencent. This is an independent, unofficial tribute, not affiliated with or authorised by Tencent.
