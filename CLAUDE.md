# CLAUDE.md

This file is the entry point for Claude Code working in this repository. The full
detail lives in two companion docs — read the one your task touches:

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — how the app is built + every
  empirically-verified technical constraint (chat subprocess protocol, realtime
  control, IPC contract, file-system safety, testing, FCC server).
- **[DESIGN.md](DESIGN.md)** — the UI design system (palette, type, spacing,
  layout grid, component patterns, motion, theme, titlebar, icons, a11y).

## What this is

**FCC Studio** — an Electron desktop IDE for [free-claude-code (FCC)](https://github.com/Alishahryar1/free-claude-code). Instead of running `fcc-claude` separately in a terminal, everything lives in one Electron app: file explorer + Monaco editor, a chat panel that talks to Claude through the FCC proxy, an integrated xterm terminal, and FCC server health management. It is deliberately small.

## Commands

```bash
npm run dev          # electron-vite dev (HMR renderer, restarts main/preload)
npm run build        # electron-vite build (main + preload + renderer → out/)
npm run preview      # electron-vite preview
npm run typecheck    # tsc --noEmit for both node + web tsconfigs
npm run test         # vitest run (tests/ — git-ignored, dev-only)
npm run smoke        # node smoke/sdk-smoke.mjs — live FCC proxy round-trip check (uses the SDK directly, not the app's chat path)
npm run protocol     # node smoke/protocol-dump.mjs — dump the claude CLI's raw stream-json events (init/assistant/tool/result) for protocol work
npm run icons        # electron scripts/generate-icons.mjs — re-render build/icon-*.png + icon.ico from resources/icon.svg
npm run dist:win     # build + electron-builder NSIS Windows installer
npm run release      # dist:win + publish to GitHub Releases (needs a v* tag + GH_TOKEN)
```

**Releasing**: bump `version` in `package.json` → tag `v<version>` → push. The
GitHub Actions `release.yml` builds + publishes the installer, which becomes the
auto-update feed (Settings → Updates checks it; `CHANGELOG.md` is shown in-app as
Help → What's New).

To run a single test file: `npx vitest run tests/path-utils.test.ts`.

## Architecture — at a glance (details in ARCHITECTURE.md)

Electron 3-process layout under `electron-vite`, sharing types via the `@shared`
alias:

- **`src/main`** — Node side: `index.ts` builds the window, `ipc.ts` registers
  handlers, `file-service.ts`, `terminal-service.ts` (node-pty),
  `fcc-manager.ts`, and the chat engine `cli/cli-runner.ts` + `chat/chat-host.ts`.
- **`src/preload`** — exposes typed `window.fcc`; the sandboxed renderer never
  touches `ipcRenderer`.
- **`src/renderer`** — React + Zustand. The chat drives the **`claude` CLI as a
  subprocess** over stream-json (full Claude Code parity), not the Agent SDK.

State flow: renderer calls `window.fcc.*` → main handles → pushes back over
`ipcRenderer.on` (chat/FCC/terminal are push-driven; file ops are invoke/response).
Channel names live in `src/shared/ipc.ts`; main→renderer events use the `evt*`
prefix.

## UI — at a glance (details in DESIGN.md)

Warm-dark **terracotta** over near-black, deliberately not VS Code blue-grey.
Comic Neue (UI) + JetBrains Mono (technical); the accent is `#d97a55` (dark) /
`#c9643c` (light). Theme = `data-theme` + CSS variables (dark default, `Ctrl+K Ctrl+T`).

Rules to never break: **never hardcode a theme color** (always `var(--…)`); cards are
`--bg-0` + `--border-1` with **no shadow** (shadow is for floating surfaces);
entrance animations use `backwards` (not `both` — a lingering transform breaks
`position:fixed` modal ancestors); all motion respects `prefers-reduced-motion`.

## Non-negotiable runtime invariants (don't break these)

These are empirically load-bearing; full context in ARCHITECTURE.md §4–§9:

- **Write the first user message immediately after spawn** — the CLI only emits
  `system/init` once a prompt is on stdin; gating on init deadlocks. One
  conversation = one process + one `session_id`.
- **`Stop` kills + respawns**, it does **not** rely on `{"type":"interrupt"}`
  (unreliable through the FCC proxy). `stop()` tree-kills via
  `taskkill /pid <pid> /T /F` on Windows.
- The CLI **spawn args** are: `--input-format stream-json --output-format
  stream-json --verbose --model <m> --max-turns <n> --permission-mode acceptEdits
  --forward-subagent-text` (+ optional `--resume` / `--effort`).
- **Realtime changes** (mode / model / effort / fast / thinking / MCP) go through
  the `chat:control` SDK `control_request` envelopes — never through the proxy.
  Control responses are ignored by the reducer and `history.record`.
- **Reducer `assistant` handling must keep `isAssistantTurn` requiring `!parentId`
  and `!restored`** — main-turn text must not merge into a nested subagent child
  (subagents nest via `parent_tool_use_id`), nor into a restored history bubble
  (resumed transcripts are marked `restored`; a live reply opens its own message).
  A subagent tool_result resolves by scanning **every** message, not just the last.
- **CLI thinking blocks use the `thinking` field, not `text`** (may be
  signature-only/empty). `liveTasks` is per-turn and clears on `result`.
- **`--forward-subagent-text` must stay on** or subagent output disappears.
- **Workspace-restore order is load-bearing**: `openFolderAt(root)` registers the
  root in main *before* any file IPC — `assertInside` throws "No folder open"
  otherwise. Restore runs in one `App.tsx` mount effect.
- **FCC proxy env** on the subprocess: `ANTHROPIC_BASE_URL=http://127.0.0.1:8082`,
  `ANTHROPIC_AUTH_TOKEN=freecc`, `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`,
  and `CLAUDE_CODE_AUTO_COMPACT_WINDOW=<k-tokens * 1000>` **only when the
  autoCompactWindow setting is > 0** — at 0 (the default) the env is omitted so
  compaction follows the model's own window (read from `result.modelUsage[model]
  .contextWindow`). The `canUseTool` bridge never fires through the proxy — edits
  are auto-accepted (`acceptEdits`).
- **Claude Code settings editor**: never re-format permission rules (byte-exact
  strings); leave the `claudeCode.environmentVariables` array alone; **never write
  `~/.claude.json`**.
- **Custom-titlebar**: `.titlebar` keeps `padding-right: 150px`; the `setTitleBarOverlay`
  hex pairs must track the CSS theme (dark `#0e1013`/`#a0a8b4`, light
  `#faf8f6`/`#6f665d`).
- **History id path guard** `/^[A-Za-z0-9._-]+$/` in `read`/`remove`.
- **Settings page** (activity-bar gear → `SettingsPage.tsx`): tabs live in
  `layout-store.settingsTab` (`openSettings(tab)`/`closeSettings()`); it is a
  `role="dialog"` reusing `useModalFocus` — Escape closes **unless** an editable
  field is focused (an input guard keeps typing from closing the page). Entry
  points map to a tab (`fcc:open-settings`→General, `fcc:open-chat-settings`→Chat).
  Its list pages load via IPC into **local state** — never a zustand selector that
  returns a fresh array (that caused a white screen).
- **Streaming hot path is memoized**: `ChatPanel`→`ChatColumn` and
  `ChatColumn`→`ChatMessage` are `memo`-wrapped with `useCallback`-stable
  per-message handlers — don't break the memo by passing new inline closures or
  new array/object props on the chat tree.

## Testing & FCC server

- Unit tests are vitest files in `tests/` — **git-ignored (dev-only)**, run locally,
  not committed; heaviest on CliSession, chat-reducer running-state, chat-store, and
  fcc-manager. `npm run smoke` needs a live FCC server. (Details: ARCHITECTURE.md §13.)
- FCC server health polls `GET /health` every 5s; the app starts its own `fcc-server`
  if installed+offline and can stop it (only one it spawned — never a server another
  app started). Install = Python/uv tool, **not** npm. (Details: ARCHITECTURE.md §11.)