# Changelog

All notable changes to **FCC Studio** are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[SemVer](https://semver.org/).

## [0.1.7] - 2026-08-09

### Added
- **AskUserQuestion cards** — when a model asks a multiple-choice question via
  the CLI's `can_use_tool`/AskUserQuestion control, the chat shows a rendered
  card (options with descriptions and previews, multi-select, free-text) and
  answers through a `control_response` (the same flow the interactive CLI's
  choices use). The runner advertises dialog capability at spawn (`initialize`
  + `supportedDialogKinds`); other `can_use_tool` requests stay auto-allowed.
  Verified: current FCC-routed models are not yet offered the tool, so the card
  is dormant until a capable route/model appears.
- **Chat rename + live session meta** — rename a chat (sends the CLI's
  `rename_session` and keeps a display title), and a "Refresh live meta" button
  in Chat settings round-trips `get_session_cost` / `get_context_usage` to show
  the CLI's own reported session cost and a real context window breakdown
  (request-id-correlated additions in `cli-runner.query`).
- **`conversation_reset` + UX notices + turn notifications** — `/clear` and
  plan-exit (which make the CLI reset its transcript under a new conversation
  id) now clear the bubble list instead of leaving a ghost conversation; CLI UX
  notices (`system/notice`, e.g. context forewarning) surface as a banner; and a
  native notification fires when a turn/plan-approval finishes while the window
  is unfocused.
- **Chat columns survive restarts** — the app re-mounts the open chats (id,
  folder, title) from their saved transcripts on relaunch, with `--resume`
  armed so the next message continues the live CLI thread. Falls back to the
  default empty column when nothing to restore.
- **Secret redaction guard** — exact env-derived secret values (`*_TOKEN` /
  `*_API_KEY` etc.) and standard token shapes (`sk-ant-…`, `ghp_…`, `AKIA…`,
  `xox…`, Bearer…) are scrubbed from every streamed chat event (before
  transcript + IPC) and from `app.log`, instead of only blocking Bash commands.

### Fixed
- **Context meter no longer counts the CLI's cumulative session total** — the
  fill % was being driven by `result.modelUsage[model].inputTokens`, which
  the CLI *sums* on every result (probe: 42,650 → 85,349 → 128,097 = the exact
  sum of each turn's input), so a short chat read as "300k / 200k" after a few
  messages while each request actually stayed ~43k. The meter now shows the
  live window fill: this turn's real input (fresh + cache read + cache write).
  The cumulative session total is still accumulated in `sessionUsage` for the
  Chat settings usage panel.
- **Chat events no longer double-deliver after hiding/switching the panel** —
  `preload.onChatEvent`/`onFccStatus`/`onTermData` now return an unsubscribe and
  every caller cleans up on unmount. Before, hiding the chat (Ctrl+Shift+`) or
  moving it right/center remounted ChatPanel and stacked a new
  `ipcRenderer.on(evtChat)` listener each time — a couple of show/hide cycles
  delivered each stream event N times (duplicate bubbles, doubled usage).
- **Regenerating a mid-stream turn no longer interleaves the old answer** —
  `regenerate` used to re-ask while the still-running subprocess kept emitting;
  leftover frames re-appended into the truncated transcript and both `result`
  events double-counted usage. Regenerate now stops (kills) the subprocess first
  and drops stale old-turn events until the fresh turn's `started` arrives.
- **Terminal tabs spawn one pty, not two** — `addTerminal` creates the pty and
  the tab id IS the pty id; a second idle shell (whose output the error-Fix /
  Run / Clear actions read instead) is gone. Renderer crashes/reloads and app
  quit now call `terminal.disposeAll()` so pty shells don't get orphaned.
- **FCC server ownership survives transient health-check failures** — a single
  slow poll used to clear `managedPid`, so the Stop button vanished and the app
  couldn't clean up the detached fcc-server at quit. Ownership is granted at
  spawn and released only when the process is confirmed dead
  (`shouldClearManagedPid`).

## [0.1.6] - 2026-08-09

### Added
- **Live thinking-token counter** — while the model is thinking, the running
  indicator shows the live estimate from the CLI's `system/thinking_tokens`
  events (`Claude is working · 1,234 tokens`), with monospaced tabular digits so
  the number doesn't jitter as it climbs.
- **Per-turn run meta** — after a finished turn the chat footer shows the turn
  duration and time-to-first-token (`… · 17.9s · first token 9.1s`), the
  fast-mode gate as a chip (a `Fast · off` chip's tooltip explains why the Fast
  toggle didn't take, e.g. `sdk_opt_in_required`), server web-tool usage
  (`web ×n`), and the tools Claude actually used — MCP server names
  (`mcp__server__…` → `MCP · server`), skill names resolved from the `Skill`
  call, and plugin tools — as small chips.
- **Tool output** — expanding a finished tool call shows its captured `stdout`
  (or `stderr` in red when it raised), read from `user.tool_use_result`.
- **Realtime-setting failures no longer silent** — when a live model/effort/
  mode/fast/thinking/MCP control comes back with a `control_response` error, a
  warn banner appears above the input instead of the failure being dropped.

### Changed
- **CLI protocol probe** — `npm run protocol` (smoke/protocol-dump.mjs) spawns
  the same claude CLI flags the app uses (`--input-format stream-json --verbose
  --forward-subagent-text`) and dumps the raw event stream to
  `smoke/protocol-dump.log.jsonl` for protocol work.
- **Hook telemetry no longer crosses IPC** — `system/hook_*` events (SessionStart
  etc., which fire several times per turn) are dropped in `chat-host.ts` before
  the renderer; an audit confirmed zero consumers (reducer, history, tests, UI).
- **Context meter reads the CLI's real session context** — the fill % now uses
  `result.modelUsage[model].inputTokens` (cumulative across turns, incl. a
  resumed transcript) instead of the last turn's per-turn input, which
  under-reported once a conversation grew (e.g. turn-2 showed ~46k when the CLI
  held ~138k).
- **Restored chats show an estimated context** — opening a saved/imported
  session seeds the meter with a chars/4 estimate (marked `≈` / `(estimate)`;
  the CLI's exact value replaces it after the first live turn) instead of 0.
- **Compact nudge** — when a conversation fills 55–100% of its window, the chat
  shows a soft note suggesting Compact before the turn gets expensive (replaces
  the old behavior of only warning once past 100%).

## [0.1.5] - 2026-08-08

### Changed
- **Settings is a full page, not a modal** — the gear moved from the titlebar
  to the bottom-left of the activity bar (below the theme toggle), and opening
  it now fills the window with a **Settings** page. Program settings
  (appearance/editor/files/updates) and chat settings (model · effort · turns ·
  history · MCP · agents · plugins · Claude Code config) are unified under one
  set of sections on a left nav rail:
  **General · Chat · History · MCP · Agents · Plugins · Claude Code**. The chat
  gear, menu bar, and command palette all open the page straight to the relevant
  section; Escape closes it.
- **Padded, card-based layout** — each settings section is a card panel
  (`SettingsPanel`) with a header row + grouped rows, keeping the wide page
  readable rather than a flat stretched list.
- **Scrollable content column** — the content area is height-bounded with
  `overflow-y: auto` (panels `flex-shrink: 0`) so tall tabs (History, MCP,
  Agents, Plugins) scroll inside the page instead of growing it; the nav rail
  stays pinned.

### Added
- Settings nav icons: `IconHistory`, `IconPlug`, `IconPuzzle`.
- **Context meter in the chat** — the input footer shows how full the current
  conversation is (fill dot + %, green → amber past the auto-compact window → red
  over it), and a **Compact** pill sends `/compact` to the CLI. The Chat settings
  usage panel shows the same context-window fill with a progress bar.
- **Chat** reducer tracks `contextTokens` (the last turn's total input = the
  live context size, incl. a resumed transcript) and `modelContextWindow`.
- **Background log file** — the app writes a timestamped log to
  `userData/logs/app.log` (main lifecycle, FCC status, chat spawns/errors,
  renderer crashes) plus an `uncaughtException`/`unhandledRejection` safety net;
  renderer `window.onerror`/`unhandledrejection` forward over the `log:error`
  IPC so a blank-screen renderer still leaves a trace. Rotates to `app.log.old`
  at 5 MB.
- **Model-aware context** — auto-compact is **Auto** by default: the CLI is not
  given a fixed `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, so compaction follows the
  selected model's own context window (read from `result.modelUsage[model]
  .contextWindow`). The chat footer / settings usage meters show the fill against
  that model window (fallback: the auto-compact window, then 200k), while
  `auto-compact` in Chat settings still offers a fixed override (100k–500k).

### Fixed
- **Resumed/imported transcripts no longer stack replies** — restored history
  messages are marked `restored`, so a live assistant reply opens its own bubble
  instead of merging into the imported conversation's last message. (Verified:
  the CLI does not replay history on `--resume`, so the restored transcript is
  the only copy on screen; the earlier "1 send → many messages" feel came from
  the reply gluing onto the imported transcript + the full resumed context
  loading.)
- **`Ctrl+Shift+F` no longer hides the sidebar** — the global keydown handler
  read a stale mount-time `sidebarVisible`; it now reads the store at keydown, so
  Search opens with the sidebar visible.
- **Chat session could get permanently stuck** — `send()` armed the in-flight
  guard before its resume branch could bail on an empty folder; the guard is now
  armed only when a send actually proceeds, and the Source Control panel's
  busy flag is reset in `finally` so a failed git action can't leave buttons
  disabled forever.
- **Streaming render cost** — `ChatColumn`/`ChatMessage` are memoized with
  stable callbacks, so idle chat columns and unchanged transcript rows skip
  re-rendering while one conversation streams.

### Accessibility
- **Settings is a proper dialog** — `role="dialog"` + focus-in on open and
  **focus return** to the trigger on close (reuses `useModalFocus`); Escape
  inside a settings input no longer closes the page.
- **Chat announces itself** — the message scroll is an `aria-live` log region,
  and the chat textarea, Send button, and every ActivityBar nav button got
  accessible `aria-label`s.

## [0.1.4] - 2026-08-07

### Added
- **Claude Code hooks editor** — view and add hooks (event + matcher + command)
  from Chat settings → config, written to the project's `.claude/settings.json`.
- **Guardrails** — per-project **PreToolUse hook** that blocks Bash commands
  containing user-listed patterns (generated Node script; exit-2 block, preserved
  across other hooks).
- **Compose workbench** — re-run a prompt in **N parallel columns** (`⊞3`) and
  **merge all assistant outputs** into one synthesized answer (`Σ merge`).
- **Claude Code CLI compatibility check** — the Config tab shows the resolved
  `claude` binary, its version, and warns if any flag the app uses is missing
  from the CLI's `--help` (surfaces version drift early).

## [0.1.3] - 2026-08-06

### Added
- **Source control sync** — connect a GitHub remote (paste the repo URL), then
  **Push** / **Pull** from one state-driven button that follows the repo: changes →
  Commit, committed → Push, behind → Pull. The first push opens your **Git
  Credential Manager** browser sign-in. ✨ writes the commit message, remote +
  branch sit in one compact top row.
- **Model selector in the chat** — the model chip at the bottom of the input is
  now a dropdown: pick any model, the next conversation spawns with it.
- **Unified chat input box** — one clean framed field holding the text, Plan/Act,
  model, tokens, gear, and send/stop.
- **Extended thinking toggle** in Chat settings (Model tab), on top of the
  Command-palette entry.

### Fixed
- **Chat could send the same message twice** — two rapid submits (Enter repeat /
  Enter + button) before the CLI's `started` event arrived both called
  `chatStart`, duplicating the bubble and spawning a second process under the
  same session. A per-session in-flight guard now drops the second send.
- **Source control panel** — compact top row (remote chip + branch), full-width
  state-driven action, remote URL surfaced from `git remote get-url origin`.

## [0.1.2] - 2026-08-06

### Fixed
- **Packaged app could not start the Claude CLI** — `resolveCliBinary()`
  resolved to the `app.asar` stub instead of the unpacked copy
  (`app.asar.unpacked`), so spawn failed with `ENOENT`. The unpacked path is now
  checked first.

## [0.1.1] - 2026-08-06

### Added
- **Import Claude Code CLI history** — the History tab also lists sessions from
  `~/.claude/projects` (tagged "Claude Code"), and you can open and resume them
  in the app (`--resume`).

## [0.1.0] - 2026-08-06

First public release — a warm-dark, all-in-one desktop IDE for Claude Code,
powered by free-claude-code.

### Chat (Claude Code engine)
- Drives the **real `claude` CLI** as a subprocess over `stream-json` — full
  Claude Code parity: slash commands, skills, modes, MCP, subagents.
- **Multi-chat panel** — run several conversations side by side, each with its
  own subprocess, Plan/Act mode, Stop, and input.
- Plan/Act toggle, live effort / fast-mode / thinking controls, image attach,
  `@`-file mention, paste screenshots, edit-and-resend a turn.
- **Subagent live view**, workflow/task progress, checkpoints/rewind.
- Session history — reopen past conversations and continue (`--resume`).
- **Activity panel** — per-turn agent telemetry: timeline, file influence heat
  map, ordered tool flow, read-only snapshot preview + restore.

### Editor & explorer
- File explorer with **right-click rename / copy / cut / paste / duplicate /
  delete** and inline new file/folder.
- Multi-tab Monaco editor with **syntax highlighting for every Monaco language**
  (picked up by extension), image preview, undo-aware tabs, find-in-files.
- Markdown renderer: GFM, math/Katex, and raw HTML **sanitized with DOMPurify**.

### Tools & panels
- Integrated **xterm terminal** (node-pty, multiple tabs, dockable).
- **Source control** — git status / stage / unstage / diff / commit graph.
- **FCC server** management — health, one-click start, install detection +
  guided setup.
- Settings: program + chat, Claude Code settings editor, MCP manager, custom
  agents editor.

### Distribution & updates
- **Windows installer** (NSIS) via `npm run dist:win`.
- **Auto-update** (`electron-updater`) — Settings → Updates: check on launch or
  manually, download, restart & install; GitHub Releases feed.
- **What's New** — in-app release notes from this changelog (Help menu).
- Release pipeline: `npm run release` + GitHub Actions on `v*` tags.

### Under the hood
- Electron 43, Vite 8, TypeScript 7, React 19, Monaco 0.56, xterm 6,
  electron-builder 26, vitest 4.
- Warm-dark terracotta + light theme — titlebar, editor, terminal, chat and
  icons all follow.
