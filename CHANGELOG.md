# Changelog

All notable changes to **FCC Studio** are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[SemVer](https://semver.org/).

## [Unreleased]

_Next release notes go here._

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
