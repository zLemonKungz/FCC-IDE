# FCC Studio

A small, VS Code–like desktop IDE for [free-claude-code (FCC)](https://github.com/Alishahryar1/free-claude-code). Instead of running `fcc-claude` separately in a terminal, everything lives in one Electron app: a file explorer + Monaco editor, a chat panel that talks to Claude through the FCC proxy, an integrated xterm terminal, and FCC server health management.

It is deliberately small — not a VS Code clone.

## Features

- **File explorer** — open a folder, browse, create/rename/delete files and directories
- **Monaco editor** — multi-tab, syntax highlighting, `Ctrl+S` save, dirty-tab discard guard
- **Chat panel** — talk to Claude through the local FCC proxy, with agent edit diff review
- **Integrated terminal** — xterm via node-pty, resizable
- **FCC server management** — health status in the status bar, one-click start when offline
- **Dark/light themes** — switch with `Ctrl+K Ctrl+T`, everything (titlebar, editor, terminal, icons) follows the theme
- **Resizable panels** — sidebar, chat, and terminal drag handles

## Getting started

```bash
npm install
npm run dev        # electron-vite dev (HMR renderer, restarts main/preload)
```

The app bundles the FCC proxy — see `src/main/fcc-manager.ts` for how the FCC server is started and the env vars to override it (`FCC_SERVER_BIN`, `FCC_PORT`, `FCC_AUTH_TOKEN`, `FCC_BASE_URL`).

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | electron-vite dev (HMR renderer, restarts main/preload) |
| `npm run build` | electron-vite build (main + preload + renderer → `out/`) |
| `npm run preview` | electron-vite preview |
| `npm run typecheck` | `tsc --noEmit` for both node + web tsconfigs |
| `npm run test` | vitest run (`tests/`) |
| `npm run smoke` | live SDK↔FCC proxy round-trip check (needs a running FCC server) |
| `npm run dist:win` | electron-vite build + electron-builder NSIS installer → `release/` |

Run a single test file: `npx vitest run tests/path-utils.test.ts`.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+K Ctrl+T` | Toggle dark/light theme |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+`` | Toggle terminal |
| `Ctrl+Shift+`` | Toggle chat panel |
| `Ctrl+J` | Toggle terminal |
| `Ctrl+S` | Save the active file |
| Middle-click tab | Close tab |
| Right-click tab | Tab context menu (close / close others / close saved / close all) |

Closing a **dirty** tab (one with unsaved changes, marked by a red dot) arms a discard-confirm: click ✕ again to discard. `Close Others` / `Close All` are blocked while any tab is dirty.

## Architecture

Electron 3-process layout under `electron-vite`, with a shared module (`src/shared`) imported by all three:

- **`src/main`** — Node side. Creates the `BrowserWindow`, registers IPC (`ipc.ts`), files (`file-service.ts`), node-pty terminal (`terminal-service.ts`), FCC health/start (`fcc-manager.ts`), and the Claude Agent SDK chat host (`chat/chat-host.ts`).
- **`src/preload`** — exposes `window.fcc`, a typed promise-based API over `ipcRenderer`. The renderer never touches `ipcRenderer` directly.
- **`src/renderer`** — React + Zustand. Stores under `stores/`, components under `components/`, theme in `styles.css`.

## License

MIT — see [LICENSE](LICENSE).
