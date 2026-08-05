# FCC Studio — Architecture

Technical reference for how FCC Studio (an Electron IDE for free-claude-code) is
built and — crucially — the **empirically-verified constraints** you must not break
when editing it. These notes were confirmed against a live CLI/FCC proxy, not just
read off docs.

Related: [DESIGN.md](DESIGN.md) is the UI design system; [CLAUDE.md](CLAUDE.md) is
the entry point.

---

## 1. Process layout

Electron 3-process layout under `electron-vite`, with a shared module imported by
all three via the `@shared` alias (`src/shared`):

- **`src/main`** — Node side (CJS, bundled). `index.ts` creates the `BrowserWindow`
  and wires IPC; `ipc.ts` registers every handler; `file-service.ts`,
  `terminal-service.ts` (node-pty), `fcc-manager.ts` (FCC server health/start),
  `cli/cli-runner.ts` + `chat/chat-host.ts` (the claude CLI subprocess engine).
- **`src/preload`** — exposes `window.fcc`, a typed promise-based API over
  `ipcRenderer.invoke`/`.on` (see the `FccApi` type). The renderer never touches
  `ipcRenderer` directly.
- **`src/renderer`** — React + Zustand. Stores under
  `src/renderer/src/stores/`, components under `components/`, UI theme in
  `styles.css` (see DESIGN.md), Monaco themes in `monaco-setup.ts`.

**Security posture**: the renderer is sandboxed (`contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true`). Every piece of Node capability goes
through the preload bridge — the renderer cannot touch the filesystem, spawn
processes, or read env on its own.

## 2. State flow

- **Invoke/response** (file ops, settings, models): renderer calls `window.fcc.*`
  → main handles → returns a value.
- **Push-driven** (chat, FCC status, terminal): main pushes events over
  `ipcRenderer.on` channels. Channels: `chat:event`, `fcc:status-changed`,
  `term:output`, `file:modified`.

## 3. IPC contract

- Channel names live in `src/shared/ipc.ts` (`IPC` const + `evt*` for
  main→renderer events). Main→renderer events use the `evt*` prefix to tell them
  apart from invoke channels.
- **Never rename a channel** without updating preload + both sides simultaneously.
- The terminal channels deliberately use `term:output` (not `term:data`) to avoid
  colliding with the invoke channel `term:data`.
- **Markdown preview wiring** adds two channels: `shell:open-external`
  (`shell.openExternal` guarded to http:/https:/mailto: only) and `fs:read-asset`
  (`file-service.readAsset` — image → base64 data URI, ≤ 4 MB, MIME by extension,
  `assertInside`-gated) for rendering external links + relative images.
- **Chat quick-access context** adds two more channels: `term:recent` (the last
  ~8 KB of a terminal's output — `terminal-service` keeps a per-terminal scrollback
  and `lastActiveId`) and `git:diff` (`git-diff.ts` reads the open folder's
  uncommitted diff vs HEAD, capped at 30 KB). `app:info` returns
  `{ name, version }` from `app.getName()`/`app.getVersion()` for the titlebar
  version and the About popover. The chat drives them via the local
  slash commands `/review` (feed the diff) and `/terminal <q>` (feed recent
  output), and the terminal's error-detected **⚡ Fix** button dispatches
  `fcc:ai-fix` with the captured output for the chat to fix.
- **Git / Source Control** — `git-service.ts` runs git in the open folder (cwd,
  repo-relative paths only): `git:status` (`status --porcelain --branch` parsed by
  the pure `parseStatusPorcelain`, plus branch/ahead/behind/remote), `git:action`
  (stage/unstage/discard via add/restore), `git:commit`, `git:staged-diff`,
  `git:branch` (list/switch/create), and `git:history` (`git log --graph` for the
  commit-graph view). The **Source Control sidebar view**
  (`SourceControlPanel.tsx`, `sidebarView:'source'`, activity-bar git icon) shows
  staged/unstaged/untracked/conflicts with per-file actions, a commit box, branch
  switch/create, and an **✨ Message** button that fills the chat input with a
  "write a commit message for this staged diff" prompt (`fcc:chat-input`). It
  refreshes on folder open, `fcc:file-modified`, and an 8s poll.

---

## 4. The chat engine — `claude` CLI as a subprocess

The chat is **not** the Agent SDK's `query()` — it drives the real `claude` binary
as a subprocess over the stream-json protocol, so the agent has full Claude Code
extension parity (skills, plugins, hooks, MCP, slash commands).

### Spawn

`cli-runner.ts` spawns with:

```
--input-format stream-json --output-format stream-json --verbose
--model <model> --max-turns <n> --permission-mode acceptEdits
[--resume <session_id>] [--effort <level>] --forward-subagent-text
```

- Writes user turns to stdin as `{"type":"user","message":{...}}`.
- Reads `\n`-terminated JSONL events from stdout.
- The binary resolves via `CLI_PATH` env > the SDK's bundled platform package
  (`node_modules/@anthropic-ai/claude-agent-sdk-<platform>/claude.*`) > PATH.
- **Packaged build**: `resolveCliBinary()` also checks `process.resourcesPath/app.asar.unpacked`,
  and `package.json` `build.asarUnpack` ships `claude.exe` **out** of the asar — an
  executable inside `app.asar` can't be spawned.

### Empirically-verified invariants (the load-bearing ones)

- **Write the first user message immediately after spawn.** The CLI only emits its
  `system/init` event once a prompt is waiting on stdin — gating on init first
  deadlocks. The process stays alive across turns: one conversation = one process
  + one `session_id`; later turns are written via a separate `chat:send` IPC to
  the live process (multi-turn keeps context).
- **`Stop`** kills the subprocess and emits `stopped`. The `{"type":"interrupt"}`
  control message is **not reliable** through the FCC proxy — the app uses
  kill + respawn under the same `sessionId` instead. After a stop the same
  session can respawn a fresh process via `chat:send`.

### Subprocess hardening (all verified)

- `windowsHide: true` — without it the console-subsystem `claude.exe` flashes a
  cmd window on every chat turn in the packaged GUI app.
- `stop()` tree-kills on Windows via `taskkill /pid <pid> /T /F` (plain `kill()`
  leaks grandchildren — the Bash tool's / MCP-server node children).
- A bounded stderr tail is folded into error messages so a crash is diagnosable.
- stdin writes to a dead child are guarded and EPIPE is swallowed (an unhandled
  stream `error` would crash main).
- `sawResult` is cleared **per turn** in `send()`, so a mid-turn CLI death always
  emits an error — without it the renderer's `running` flag wedges forever.

### Stream-json message shapes

Equal to the SDK's: there is no top-level `tool_use` type — tool calls are content
blocks inside `assistant` messages, and tool results are `tool_result` blocks
inside `user` messages. The renderer reducer (`chat-reducer.ts`) dispatches on
`message.type` (`assistant` | `user` | `result` | `system`). `system/init` and
`system/hook_*` events are ignored by the reducer. `chat-host.ts` forwards raw
events and also emits a `session-id` event derived from `result.session_id`, plus
synthetic `user-message` / `started` events.

### Slash commands

- Come from the CLI, not the app. `system/init` carries `slash_commands` (bare
  names, incl. namespaced skills like `design-taste-frontend`); `chat-host.ts`
  re-emits `{type:'slash-commands',commands}` so the renderer can show a `/` picker.
- `ChatPanel.tsx` handles `/help` `/theme` `/new` locally and forwards every other
  `/cmd` to the CLI as the prompt. Note `/clear` forwards and runs, but does NOT
  actually reset conversation context in stream-json mode (verified).

## 5. Realtime control protocol (`chat:control`)

Editing spawn flags only would confine changes (mode, model, effort) to the *next*
conversation. To change a **running** chat, the app sends SDK `control_request`
envelopes to the CLI's stdin — the same mechanism as the SDK's `setPermissionMode()`
/ `setModel()` / `applyFlagSettings()`:

- `CliSession.sendControl(subtype, request)` writes
  `{"type":"control_request","request_id":"ctl-…","request":{subtype,…}}`.
- These are handled **locally by the CLI and never touch the FCC proxy**, unlike
  the unreliable `interrupt`.
- Verified live on the bundled binary:
  - `set_permission_mode {mode}` → `control_response` success + a `system/status`
    echoing the new `permissionMode` (immediate Plan/Act switch).
  - `set_model {model}` → success response; applies to the next model call of the
    current turn.
  - `apply_flag_settings {settings:{effortLevel|ultracode|effortLevel:null}}` →
    effort on the next turn (`effortControlSettings()` in settings-store builds it).
  - `apply_flag_settings {settings:{fastMode}}` / `{alwaysThinkingEnabled}` →
    fast-mode / extended-thinking toggles.
  - `mcp_toggle {serverName,enabled}` / `mcp_reconnect {serverName}` → live MCP.
- Routing: `chat-host.control()` forwards to the live session and keeps its stored
  spawn-mode in sync (so a later respawn keeps the mode); `chat-store.control()`
  is the renderer entry (no-op with no live session). Control responses are
  ignored by the reducer and by `history.record` (its `default:` branch).
- **CLI thinking blocks carry the text in the `thinking` field, not `text`**
  (short tool-selection thoughts can be signature-only, `thinking:''`). The
  reducer reads `b.thinking`; `ChatMessage` renders it as a foldable `.msg-thinking`.

## 6. Effort & model support detection

- `settings-store` holds raw `chatEffort` (`'auto' | low|medium|high|xhigh|max|ultracode`);
  `effectiveEffort(model, chosen)` snaps a too-high choice down to `effortCap(model)`:
  Opus 5 / Fable 5 → ultracode; Sonnet 5 → xhigh; Haiku 4.5 → no effort → `'auto'`.
- The chat-settings UI and `App.tsx` push the *effective* value via `settings:set`
  → `config.setChatConfig` → `cli-runner --effort` (guard: only `low..max,ultracode`)
  for fresh spawns, **and** send `apply_flag_settings` live so the current chat's
  next turn honors it. `FCC_CHAT_EFFORT` supplies a headless default.

## 7. Subagents & workflow/task progress

- **`--forward-subagent-text` is always on** — without it the CLI hides subagent
  output over stream-json. It tags forwarded subagent text/thinking/tool blocks
  with `parent_tool_use_id`; the reducer nests those into child `ChatMessage`s
  (`parentId` = the owning Agent/Task message's id). The Subagents sidebar view
  (`SubagentPanel.tsx`, `sidebarView:'subagents'`) groups them per spawn call.
- A subagent tool never resolves on the *last* message, so the `user`/`tool_result`
  case scans **every** message for a matching `tool_use_id`. Reducers elsewhere
  must keep `isAssistantTurn` requiring `!parentId` — main-turn text must not merge
  into a nested child.
- **Live progress**: a multi-agent run emits `system:task_started {task_id,
  description, subagent_type, tool_use_id}` and `system:task_progress {task_id,
  description, last_tool_name, usage.total_tokens}` (`system:background_tasks_changed`,
  `system:thinking_tokens`, `system:hook_started/progress/response` also appear).
  The reducer folds `task_*` into `chat-store.liveTasks` and clears it on `result`
  (tasks are per-turn); `SubagentPanel` shows a live "Running" section.

## 8. Chat history, resume, MCP, agents, settings

- **Chat history** lives in main (`chat/history.ts`), JSON at
  `app.getPath('userData')/sessions/<rendererSessionId>.json`. The transcript
  accumulates in `chat-host.ts`'s single `emit()` funnel — every chat event
  (synthetic + raw) is recorded; `result` flushes, `start()` flushes superseded
  sessions *before* clearing them, `stop()`/`stopAll()` flush. Record ids
  (`s-<ts>-<rand>`) pass a `/^[A-Za-z0-9._-]+$/` path guard.
- **Resume** — History tab `openHistory()` restores the transcript, sets
  `pendingResume` to the saved CLI `session_id`, and the next `send()` spawns with
  `--resume`. Reliability through the FCC proxy is unverified — if resume fails the
  restored transcript still displays and the CLI error surfaces in chat.
- **MCP** — `mcp-service.ts` surfaces servers **per scope** via `mcp:get`
  (`getMcpOverview`): `project` (`.mcp.json` in the open folder — the only
  **editable** scope, `mcp:set`, over the sandboxed file-service), `user`
  (`~/.claude.json` + `~/.claude/settings.json`, read-only — never write
  `~/.claude.json`), and `plugins` (merged from **enabled** plugins' manifests,
  read-only). The CLI discovers MCP from its cwd + user configs at spawn, so
  project edits apply to the next conversation; live On/Off / ↻ go through the
  `chat:control` `mcp_toggle`/`mcp_reconnect`.
- **Plugins** — `claude-plugins.ts` lists installed plugins from
  `~/.claude/plugins/installed_plugins.json` + the `enabledPlugins` map in
  `~/.claude/settings.json` (`name@marketplace` → bool), reading each manifest's
  `.claude-plugin/plugin.json` for its declared MCP servers. `plugins:set` toggles
  enabled by editing `settings.json` `enabledPlugins` (preserves every other key).
  A chat-settings **Plugins** tab shows the list with enable/disable + an "MCP · n"
  badge; the MCP tab folds enabled plugins' servers in as a "From plugins" section.
- **Custom subagents** — chat-settings **Agents** tab lists/edits/creates
  `.claude/agents/*.md` (`claude-agents.ts` mirrors mcp-service; `agents:*` IPC).
  Saving locks the frontmatter `name:` to the filename. With no folder open this is
  rejected; `assertInside` keeps writes in root.
- **Claude Code settings editor** — the "Config" tab edits `~/.claude/settings.json`
  (user) and `<root>/.claude/settings.json` (project) via `claude-settings.ts`.
  `mergeSettings` preserves fields the UI doesn't render (hooks, statusLine,
  enabledPlugins); **permission rules are byte-exact strings** — never re-format
  them. The user's env often lives in the `claudeCode.environmentVariables` array
  (VS Code spelling), distinct from the CLI's `env` object the editor writes — leave
  that array alone. **Never write `~/.claude.json`** (CLI-managed runtime state).

## 9. Renderer layout & persistence (the non-obvious bits)

- **Workspace restore** — folder persisted by `explorer-store` (persist
  `fcc-explorer`, `root` only), tabs by `editor-store` (persist `fcc-tabs`, paths +
  `activePath` only — never content). Restore is one `App.tsx` mount effect **in
  order**: `openFolderAt(root)` (registers root in main) → `fsList(root)` →
  re-open each tab. The order is load-bearing: `assertInside` throws "No folder
  open" until `setRoot` runs, so any file IPC before registration rejects. If the
  folder is gone, both stores clear.
- **Flexible panels** — the `.app` grid is `rows: 34px 1fr auto auto; cols: auto auto
  auto 1fr` (titlebar / activity-bar + sidebar + center / terminal / statusbar).
  `layout-store` (persist `fcc-layout`) drives `terminalPosition`/`chatPosition`/
  `*Visible`/sizes. Activity-bar icons **toggle** their panel; headers can ✕ close.
  The terminal hides via `display:none` but stays mounted so pty sessions survive.
  Drag handles: right/bottom-docked panels use `invert` (drag toward center grows);
  the left sidebar is **not** inverted. When `chatPosition === 'center'` the chat
  overlays the editor (`position:absolute; inset:0`) while the editor stays mounted
  underneath so Monaco buffers survive. Switching dock positions remounts the pane
  (accepted tradeoff).
- **Multi-terminal tabs** — backend already had a `Map<id, pty>`, so tabs are
  renderer-only: each tab is an always-mounted `TerminalTab` (`display:none` hides
  inactive). `preload.onTermData` returns an unsubscribe — **must** call it on
  unmount or listeners accumulate on the shared `term:output` channel. The term
  header is `flex-wrap: wrap` with `.term-tabs` at `min-width: 88px`.
- **Command palette (Ctrl+Shift+P)** — top-centered overlay (`CommandPalette.tsx`).
  Slash commands are NOT sent directly: the palette dispatches `fcc:chat-input` with
  the completed `"/cmd "`; ChatPanel fills its input so `submit()` keeps the
  local-vs-forward logic and the `!root`/`running` guards. Settings open via
  `fcc:open-settings` / `fcc:open-chat-settings` CustomEvents.
- **Titlebar menu bar** — `MenuBar.tsx` dropdowns dispatch `fcc:open-palette`,
  `fcc:open-shortcuts`, `fcc:term-new`/`term-clear`/`term-run` to their targets. The
  dropdown is `position: fixed` at z-1001 over `.ctx-backdrop` (z-1000), closes on
  outside click or Escape.
- **Find in files (Ctrl+Shift+F)** runs in main (`file-service.searchContent` — same
  walk as `searchFiles` plus a 1 MB cap, NUL-byte binary skip, 1000-hit cap), returns
  `SearchHit{path,relative,line,text}`. Clicking a hit dispatches `fcc:reveal`; the
  Editor applies it in `onMount` via `revealLineInCenter`.
- **Per-hunk diff review** — `DiffView` lists hunks (Monaco `getLineChanges()` +
  `onDidUpdateDiff`) with per-hunk Revert. `revertAgentHunk` splices base lines over
  current disk content (tabs can be stale — the store reads the file first); the
  agent-modified flag clears only when the whole file equals base.
- **Prog/chat settings are separate modals.** Titlebar gear → "Program settings"
  (editor font size, auto-save); chat gear → "Chat settings" (model/turns/effort/
  plan toggle + History/MCP/Agents/Config). History/MCP/Agents/Config lists load via
  IPC into **local component state** — never a zustand selector that returns a fresh
  array (a `.filter()` in a selector caused "Maximum update depth exceeded" / white
  screen once).
- **Auto-save** is a debounced (800ms) save on editor change, **skipped for
  `agentModified` files** — auto-saving would clobber a Claude edit on disk and
  corrupt accept/revert.
- **Dirty-tab discard guard** — closing an unsaved tab arms it (`closingPath`);
  a second ✕ discards. `closeOthers`/`closeAll` refuse while any tab is dirty. Any
  other tab interaction cancels the armed state. Signaled with `.tab.closing` red
  tint + pulsing dot.

## 10. File-system safety (main process)

`src/main/file-service.ts` guards every path operation:

- `assertInside()` rejects any path escaping the open folder (lexical `isInside` +
  realpath-based symlink/junction check).
- `deleteEntry` refuses to delete the project root.
- `renameEntry` refuses to overwrite an existing target; `createEntry` uses
  `{ flag: 'wx' }`.
- Directory listing skips `node_modules`, `.git`, `.next`, `dist`, `out`, `release`.

## 11. FCC server

- `fcc-manager.ts` polls `GET /health` every 5s → status bar. Offline? "Start"
  spawns `fcc-server` (override via `FCC_SERVER_BIN`, `FCC_PORT`, `FCC_AUTH_TOKEN`,
  `FCC_BASE_URL`).
- **Install detection** resolves `fcc-server` *without executing it* (override →
  `~/.local/bin` → PATH) and probes Python 3.14 + `uv`. `FccSetupModal` shows the
  platform install command (FCC is a Python/uv tool, **not** npm). `startServer()`
  swallows spawn errors so a missing binary can't crash the app.
- **The app owns the server lifecycle** when it spawned it (`autoStartServer` on
  window creation; `FccStatus.managed` only for its own server → "Stop server").
  `stopServer()` kills via `taskkill /pid <pid> /T /F` (win32, detached). A server
  already running (e.g. the tray app) is left untouched — never killed. `will-quit`
  stops our own server.
- Chat defaults from env: `FCC_CHAT_MODEL` (default `claude-haiku-4-5-20251001`),
  `FCC_CHAT_MAX_TURNS` (default 50). `settings-store` (persist `fcc-settings`) is the
  source of truth, pushed via `settings:set` → `setChatConfig`.

## 12. FCC proxy wiring

The FCC env goes on the subprocess env (spread over `process.env`):
`ANTHROPIC_BASE_URL=FCC_BASE_URL` (`http://127.0.0.1:8082`), `ANTHROPIC_AUTH_TOKEN=freecc`,
`CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`, and
`CLAUDE_CODE_AUTO_COMPACT_WINDOW=<autoCompactWindow * 1000>` (thousands→tokens).
FCC is a **request-transforming gateway**, not a dumb relay. It also serves
`GET /v1/models` — the chat model picker fetches it (`chat/models.ts`) and filters
to claude-related entries.

**The `canUseTool` permission bridge never fires through the FCC proxy** — the chat
uses `--permission-mode acceptEdits` (agent edits auto-accepted, surfaced via diff),
so interactive per-tool approval is not reachable. Local hooks
(PreToolUse/PostToolUse/SessionStart) do run in the subprocess.

## 13. Testing notes

- Unit tests are plain vitest files in `tests/` (path-utils, file-service,
  fcc-manager, cli-runner, chat-reducer, chat-store, editor-store, layout-store,
  settings-store, config, mcp-service, claude-agents, history, claude-settings).
  Terminal and editor UI components are not covered. `tests/` is **git-ignored
  (dev-only)** — run locally, not shipped or committed.
- Coverage is heaviest on the risky logic: CliSession (taskkill / EPIPE / stderr
  tail / windowsHide+env), chat-reducer running-state transitions (the "no wedge"
  invariant), chat-store send continue-vs-start heuristic + stale-session filtering,
  and fcc-manager `classifyInstall`.
- `npm run smoke` is the only test needing a live FCC server; everything else is
  offline.

## 14. Node/npm gotchas

- npm 24 `allowScripts` policy blocks postinstall scripts for `electron`/`esbuild`
  by default; whitelisted in `package.json`. There is deliberately **no
  `postinstall` script** — node-pty ships N-API prebuilds, so
  `electron-builder install-app-deps` (which would trigger a node-gyp rebuild) is
  skipped.
- **node-pty must be externalized** in `electron.vite.config.ts`
  (`externalizeDepsPlugin()` on main+preload) — bundling it breaks `conpty.node`
  loading. `@anthropic-ai/claude-agent-sdk` stays as a dependency solely to ship the
  bundled `claude` binary (platform packages); the app never imports the SDK —
  `chat-host.ts` spawns the binary directly.