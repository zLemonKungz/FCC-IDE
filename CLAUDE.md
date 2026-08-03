# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**FCC Studio** — a VS Code-like desktop IDE for [free-claude-code (FCC)](https://github.com/Alishahryar1/free-claude-code). Instead of running `fcc-claude` separately in a terminal, everything lives in one Electron app: file explorer + Monaco editor, a chat panel that talks to Claude through the FCC proxy, an integrated xterm terminal, and FCC server health management. It is deliberately small — not a VS Code clone.

## Commands

```bash
npm run dev          # electron-vite dev (HMR renderer, restarts main/preload)
npm run build        # electron-vite build (main + preload + renderer → out/)
npm run preview      # electron-vite preview
npm run typecheck    # tsc --noEmit for both node + web tsconfigs
npm run test         # vitest run (tests/ directory)
npm run smoke        # node smoke/sdk-smoke.mjs — live SDK↔FCC proxy round-trip check
npm run icons        # electron scripts/generate-icons.mjs — re-render build/icon-*.png + icon.ico from resources/icon.svg
npm run dist:win     # build + electron-builder NSIS Windows installer
```

To run a single test file: `npx vitest run tests/path-utils.test.ts`.

## Architecture

Electron 3-process layout under `electron-vite`, with a shared module imported by all three via the `@shared` alias (`src/shared`):

- **`src/main`** — Node side (CJS, bundled). `index.ts` creates the `BrowserWindow` and wires IPC; `ipc.ts` registers every handler; `file-service.ts`, `terminal-service.ts` (node-pty), `fcc-manager.ts` (FCC server health/start), `chat/chat-host.ts` (Claude Agent SDK).
- **`src/preload`** — exposes `window.fcc`, a typed promise-based API over `ipcRenderer.invoke`/`.on` (see `FccApi` type). The renderer never touches `ipcRenderer` directly.
- **`src/renderer`** — React + Zustand. Stores under `src/renderer/src/stores/`, components under `components/`, UI theme in `styles.css` (warm-dark terracotta palette, CSS variables, Geist font). Monaco is themed via `monaco-setup.ts` (`fcc-dark`/`fcc-light` themes, worker config). The app has a custom HTML titlebar (`Titlebar.tsx`) over a hidden native titlebar; the window caption buttons are re-tinted per theme through IPC (see constraints).

State flow: renderer calls `window.fcc.*` → main handles → pushes events back over `ipcRenderer.on` channels. Chat and FCC status are push-driven (channels `chat:event`, `fcc:status-changed`, `term:output`); file ops are invoke/response.

**IPC contract** — channel names live in `src/shared/ipc.ts` (`IPC` const + `evt*` event names). Main→renderer events use the `evt*` prefix to distinguish them from invoke channels. Never rename a channel without updating preload + both sides; the term channels deliberately use `term:output` (not `term:data`) to avoid colliding with the invoke channel `term:data`.

## Non-obvious constraints (all verified empirically)

- **Claude Agent SDK is ESM-only.** The main bundle is CJS, so `chat-host.ts` loads it with a dynamic `await import('@anthropic-ai/claude-agent-sdk')` — keep that dynamic import, a static `require`/`import` will fail with `ERR_REQUIRE_ESM`.
- **FCC proxy wiring.** Chat and agent calls route through FCC at `FCC_BASE_URL` (`http://127.0.0.1:8082`) with `ANTHROPIC_AUTH_TOKEN=freecc`, plus `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1` and `CLAUDE_CODE_AUTO_COMPACT_WINDOW=190000`. These go in `options.env` (not top-level) of `query()`.
- **`settingSources` must be an array** of valid values (`user|project|local`). `'default'` crashes the SDK (`P.join is not a function`); the array form with an invalid source throws "Invalid setting source".
- **The SDK `canUseTool` permission bridge never fires through the FCC proxy** with the bundled claude CLI. The chat deliberately uses `permissionMode: 'acceptEdits'` — agent edits are auto-accepted and surfaced to the user via the diff view, not gated per-tool. Do not try to reintroduce a permission gate without re-spiking this.
- **`abortController`/`env` are `options` fields of `query()`, not top-level** (`signal`/`env` at top level are silently ignored).
- **SDK message shapes**: there is no top-level `tool_use` message type. Tool calls are content blocks inside `assistant` messages; results arrive as `tool_result` blocks inside `user` messages. The renderer reducer (`src/renderer/src/chat/chat-reducer.ts`) dispatches on `message.type` (`assistant` | `user` | `result` | `system`).
- **npm 24 `allowScripts` policy** blocks postinstall scripts for `electron`/`esbuild` by default; they are whitelisted in `package.json`. There is deliberately **no `postinstall` script** — node-pty ships N-API prebuilds, so `electron-builder install-app-deps` (which would trigger a node-gyp rebuild) is skipped.
- **node-pty and the SDK must be externalized** in `electron.vite.config.ts` (`externalizeDepsPlugin()` on main+preload). Bundling node-pty breaks `conpty.node` loading.
- **Sandboxed renderer**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. All Node capability must go through the preload bridge.
- **Custom titlebar overlay.** The window is frameless (`titleBarStyle: 'hidden'` + `titleBarOverlay` height 34 in `src/main/index.ts`). The HTML `.titlebar` must keep `padding-right: 150px` to reserve the native caption-button overlay. The caption buttons are re-tinted via the `setTitleBarOverlay` IPC, fired from the App.tsx theme effect with hardcoded hex pairs (`#0e1013`/`#a0a8b4` dark, `#faf8f6`/`#6f665d` light) that must stay in sync with the CSS theme variables.
- **Theme switching** is `data-theme` on `<html>` + CSS variables (`--bg-*`, `--text-*`, `--accent`). Dark and light are both defined in `styles.css`; store the `theme` in `layout-store` (zustand-persist, key `fcc-layout`). `Ctrl+K Ctrl+T` toggles it. Never hardcode a theme color in a component — components must use `var(--…)`; SVG presentation attributes (which reject `var()`) are colored via inline `style`.
- **Dirty-tab discard guard.** Closing an unsaved tab only arms it (`closingPath` in `editor-store`); a second ✕ click discards. `closeOthers`/`closeAll` refuse while any tab is dirty. Any other tab interaction cancels the armed state. The UI signals the armed state with a `.tab.closing` red tint + pulsing dot.
- **App icons.** `resources/icon.svg` is the single source; `npm run icons` rasterizes it (in a hidden Electron window) to `build/icon-*.png` + `icon.ico` used by the BrowserWindow and the NSIS installer. The generator window and page background must stay transparent — `capturePage` only keeps the icon's alpha channel that way. The mark color is `#d97a55` so it reads on both light and dark. Icons are read from disk at window creation; changing them needs a dev restart (HMR won't pick them up).

## File-system safety (main process)

`src/main/file-service.ts` guards every path operation:

- `assertInside()` rejects any path escaping the open folder (lexical `isInside` + realpath-based symlink/junction check).
- `deleteEntry` refuses to delete the project root.
- `renameEntry` refuses to overwrite an existing target; `createEntry` uses `{ flag: 'wx' }`.
- Directory listing skips `node_modules`, `.git`, `.next`, `dist`, `out`, `release`.

## Testing notes

- Unit tests are plain vitest files in `tests/`, mirroring shared/main/renderer-store modules (path-utils, file-service, fcc-manager, chat-reducer, layout-store, editor-store). Terminal and editor UI components are not covered by tests.
- `npm run smoke` is the only test that needs a live FCC server; everything else is offline.

## FCC server

- `fcc-manager.ts` polls `GET /health` every 5s and pushes status to the status bar. If offline, "Start" spawns `fcc-server` (override binary via `FCC_SERVER_BIN`, port via `FCC_PORT`, token via `FCC_AUTH_TOKEN`, base URL via `FCC_BASE_URL`).
- Chat model and turn limit are configurable via env: `FCC_CHAT_MODEL` (default `claude-haiku-4-5-20251001`), `FCC_CHAT_MAX_TURNS` (default 50). See `src/main/chat/config.ts`.
