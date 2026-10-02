# Piggy Companion Agent Entry

> `AGENTS.md` points here. These are repository rules, not a platform system prompt.
> Keep authorization, critical safeguards, and routing here; load methods and commands from [`docs/agent/`](docs/agent/README.md) on demand.
> Adapted from the business-agnostic part of the RIMINA OPS harness (local untracked snapshot in `harness/`, read-only reference; not on every machine).

## 1. Intent and communication

- Communicate with the user in Chinese unless asked otherwise. Keep identifiers, commands, filenames and quoted evidence unchanged. Keep one authority per rule. Persist decisions, constraints, open questions, evidence and next actions, not full chains of thought.
- Classify tasks as review, diagnosis, design, implementation, or release. State goals, scope, non-goals and high-risk actions; never extend authorization across them.
- Reviews and diagnoses default to read-only; edit only when requested. Push, publishing and releases need explicit authorization for this task.
- Preserve the user's and other sessions' uncommitted files, branches and worktrees. Other Claude sessions edit this repo concurrently: check `git status` and the current branch first, touch only your own files, stop on unclear ownership, never clean up.
- Use current code, relevant tests, recent commits and worktree state as evidence. Memory or old documents' task status and test counts do not prove current state.

### Session numbering

- Every interactive main session numbers its task before the first one: **ST** = development (design, implementation, refactor), **AC** = operation (real-data writes, release, environment), **Q** = query (read-only review, diagnosis, questions). Run `node scripts/harness/session-number.mjs new --type <ST|AC|Q> --title "<≤30 chars>" --session <session_id> --cwd <cwd>`, then rename the session to the returned `full_title` (`mcp__ccd_session_mgmt__set_session_title`, `session_id="self"`; load via ToolSearch if deferred). Without a rename tool, or if it is declined, report the number in the first reply and do not retry.
- One sequence across the three types, allocated only by that script (registry `~/.agent-framework/sessions.json`); never hand-write or guess a number. The counter continues only within one project (this git repository, worktrees included); a different project/path starts again at 0001.
- A task changing nature mid-session (query → implementation) keeps its number. A resumed session whose `session_id` changed but continues a numbered task reuses the old number: do not run `new` again.
- Branches are `feature/<number>-<name>`; commit messages start with `[<number>]`.
- Non-interactive sessions (`claude -p`, bridge, subagents, scheduled tasks) are not numbered; ignore the hook reminder there. The reminder comes from `scripts/harness/session-number-hook.mjs` and is silent once the session has a number.

## 2. Critical safeguards

1. **Stage only this task's exact paths.** Never `git add .`, `git add -A` or `git commit -a`. Run `git diff --check` and `git diff --cached --check` before committing; after the commit `git status --porcelain` must show none of your files.
2. **Isolated work for concurrent tasks.** When another session has uncommitted work on the same files, implement in a worktree on `feature/<name>` created from committed local `main` (`git worktree add ../wt-<name> -b feature/<name> main`) instead of sharing the directory.
3. **Local `main` awaits acceptance.** Verify, commit exact changes, merge into local `main`, then stop. Merging authorizes neither push nor release. Retain the feature branch/worktree until the user accepts.
4. **Remote updates are separate.** Push `origin/main` only on an explicit push request. If `origin/main` has commits missing locally, stop and integrate them; never force-push, never `--no-verify`.
5. **No destructive shortcuts.** No `git reset --hard`, `git checkout -- .`, `git clean`, `git worktree remove --force`, or branch deletion without looking at the target and getting explicit approval.
6. **Never conflate** local commit, merge, push and release as "done". Report each layer separately.
7. **The Swift pig is the user's; Electron is for testing.** The native `DshPiggyDesk` (save `~/.claude/pig/state.json`) is the pig the user plays with. Do not restart it after a commit or merge; restart it only when the user asks, with `node scripts/harness/pigs.mjs restart` (user's standing rule).
8. **Leave no test pigs.** Every Electron desktop pig is a test pig; run it on its own save (`PIGGY_USER_DATA`, or `PIG_STATE` for `pig serve`). It is yours to stop: before your final reply run `node scripts/harness/pigs.mjs reap --mine`. Never `pkill`/`killall` by name, never stop the real pig except through `restart` ([delivery §3.2](docs/agent/delivery.md#32-local-pig-processes)).

## 3. Task routing

Start with the read-only diagnostic:

```bash
node scripts/harness/doctor.mjs --json
```

| Task | Primary entry |
|---|---|
| Design, art, sprites, gameplay rules | [`docs/DESIGN.md`](docs/DESIGN.md), [`docs/ART-SPEC.md`](docs/ART-SPEC.md), [`docs/PROCESS.md`](docs/PROCESS.md) |
| Tests, commits, branches, worktrees, merges | [`docs/agent/delivery.md`](docs/agent/delivery.md) |
| Rule maintenance, information ownership | [`docs/agent/README.md`](docs/agent/README.md) |

Use `rg` from these entries to find current implementation and tests. Doctor is diagnostic, never proof of passing tests. Warnings are not gate passes.

## 4. Execution and stopping boundaries

- Edit only in-scope files. Coordinate shared entries (`client.js`, `core.js`, `data.js`, `index.js`, locales) before concurrent edits; never absorb others' WIP.
- **Test consent applies to every client.** Ask only before the complete test suite (`npm test`, bare `node --test`, or `node --test "test/**/*.test.js"`). Targeted runs (`node --test test/core.test.js`, `--test-name-pattern`), builds, lint/syntax checks, whitespace checks and read-only queries do not need it. Existing approval covers its stated scope; skipped tests remain unverified. Enforced by [`scripts/harness/claude-test-consent.mjs`](scripts/harness/claude-test-consent.mjs) via `.claude/settings.json`.
- Ordinary development verifies only the affected parts: directly changed modules + their dependents and shared contracts (`core.js` rules, `data.js` tables, `locales/`, store format). State assessed impact and actual tests run. Failure is failure; unverified is not passed.
- On errors give root-cause evidence, safe retry and stop conditions. Stop affected actions for missing outcome-changing user choices, unknown overlapping edits, remote ahead, or failed tests.

## 5. Result contract

Final reports include `status` (`success` / `warning` / `error`), `summary` (one sentence), `next_actions` (acceptance, retry, or stop reason) and `artifacts` (files, branches, SHA, verification counts).

Development completion replies use three Chinese paragraphs:

1. **模块**: changed modules.
2. **功能与内容**: changes, assessed impact, and actual verification scope.
3. **合入状态**: whether merged into local `main`; state blockers if not. Report remote status separately.

For user confirmation give the conclusion and recommendation first, then brief situation, conflict, key choice and alternatives. Avoid process logs.

## 6. Maintenance boundaries

Follow [information ownership](docs/agent/README.md#information-ownership): this file owns stable global rules; `docs/agent/` owns methods; memory owns preferences and experience; harness scripts own mechanical conditions. Prefer a test or narrow command to a new prose rule; do not duplicate procedures across entries.
