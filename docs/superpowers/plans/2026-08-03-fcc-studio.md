# FCC Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้าง Electron IDE ชื่อ "FCC Studio" ที่รวม file explorer, Monaco editor, chat panel (คุยกับ Claude ผ่าน FCC proxy), integrated terminal และการจัดการ FCC server ไว้ในแอปเดียว พร้อม Windows installer

**Architecture:** Electron 3 กระบวนการ (main/preload/renderer) แบบ security-first. Main process เป็นเจ้าของทุก service: file ops, node-pty terminals, FCC server manager และ Chat engine (Claude Agent SDK spawn `claude` CLI ชี้ไปที่ proxy `http://127.0.0.1:8082` ด้วย env `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN=freecc`). Renderer (React + Zustand) ติดต่อผ่าน IPC ที่ preload expose แบบ typed เท่านั้น.

**Tech Stack:** Electron · electron-vite · React 19 · TypeScript · Vite · Monaco (`@monaco-editor/react` + `monaco-editor`) · xterm.js (`@xterm/xterm` + `@xterm/addon-fit`) · `node-pty` · `@anthropic-ai/claude-agent-sdk` · Zustand · vitest · electron-builder (NSIS)

## Global Constraints

- **Environment ที่พิสูจน์แล้ว:** `fcc-server`/`fcc-claude`/`claude` อยู่ใน PATH แล้ว; FCC proxy อยู่ที่ `http://127.0.0.1:8082`; auth token default `freecc` (อ่านจาก env `FCC_BASE_URL`/`FCC_AUTH_TOKEN` ได้ — ต้องไม่ hardcode แบบตายตัวในโค้ด)
- **Model default ของ chat:** `claude-haiku-4-5-20251001` (FCC route ตาม tier/fallback ที่ตั้งใน Admin UI) — เก็บเป็น constant ใน `src/main/chat/config.ts`
- **Env ที่ตั้งให้ SDK:** `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`, `CLAUDE_CODE_AUTO_COMPACT_WINDOW=190000`
- **Security:** ทุก BrowserWindow ใช้ `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; renderer เข้า Node ได้ผ่าน API ของ preload เท่านั้น; main ตรวจ path ทุกตัวที่รับจาก IPC ว่าอยู่ใน root folder
- **Path validation:** ใช้ `isInside(root, target)` จาก `src/shared/path-utils.ts` — ห้าม bypass
- **Version control:** ขั้น commit ในแต่ละ task ทำได้เมื่อ repo พร้อม — ถ้าผู้ใช้ขอให้ไม่ init git ให้ข้ามขั้น commit ทั้งหมด (ไม่บล็อกงาน)
- **Test:** `npm test` = vitest; `npm run smoke` = สคริปต์ยืนยัน SDK↔FCC; `npm run typecheck` = typecheck ทั้ง main+renderer — ต้องผ่านก่อนจบ task

---

### Task 1: Project Scaffold (electron-vite + React + TS)

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`, `electron-builder.yml`
- Modify: `.gitignore` (มีอยู่แล้วจากขั้นวางแผน — เพิ่ม `out/` ถ้ายังไม่มี)

**Interfaces:**
- Consumes: ไม่มี (task แรก)
- Produces: โครงสร้างโปรเจกต์ที่ `npm run dev` เปิดหน้าต่าง Electron ได้, `window.fcc` API object ว่างๆ ใน preload

- [ ] **Step 1: เขียน `package.json`**

```json
{
  "name": "fcc-studio",
  "version": "0.1.0",
  "description": "IDE for free-claude-code",
  "main": "out/main/index.js",
  "author": "FCC Studio",
  "license": "MIT",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "test": "vitest run",
    "smoke": "node smoke/sdk-smoke.mjs",
    "postinstall": "electron-builder install-app-deps",
    "dist:win": "electron-vite build && electron-builder --win nsis"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.10.0",
    "node-pty": "^1.0.0"
  },
  "devDependencies": {
    "@monaco-editor/react": "^4.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/xterm": "^5.5.0",
    "electron": "^33.0.0",
    "electron-builder": "^25.1.0",
    "electron-vite": "^2.3.0",
    "monaco-editor": "^0.52.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "zustand": "^5.0.0"
  }
}
```

*หมายเหตุ:* main/preload ใช้เฉพาะ deps ใน `dependencies` (externalized); renderer deps อยู่ใน `devDependencies` เพราะ vite bundle เข้าไปแล้ว (electron-vite convention).

- [ ] **Step 2: เขียน `electron.vite.config.ts`**

```ts
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  }
});
```

- [ ] **Step 3: เขียน tsconfig ทั้ง 3 ไฟล์**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }]
}
```
`tsconfig.node.json` (main + preload + shared):
```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] }
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "electron.vite.config.ts"]
}
```
`tsconfig.web.json` (renderer + shared):
```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] }
  },
  "include": ["src/renderer/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 4: เขียน main process entry `src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'path';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'FCC Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 5: เขียน preload `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping')
};

contextBridge.exposeInMainWorld('fcc', api);
export type FccApi = typeof api;
```

- [ ] **Step 6: เขียน renderer เริ่มต้น**

`src/renderer/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FCC Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```
`src/renderer/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```
`src/renderer/src/App.tsx`:
```tsx
export default function App() {
  return <div className="app">FCC Studio</div>;
}
```
`src/renderer/src/styles.css`:
```css
html, body, #root { height: 100%; margin: 0; }
body { font-family: system-ui, sans-serif; background: #1e1e1e; color: #d4d4d4; }
```

- [ ] **Step 7: เขียน `electron-builder.yml`**

```yaml
appId: com.fccstudio.app
productName: FCC Studio
directories:
  buildResources: build
  output: release
files:
  - out/**
  - "!**/.vscode/*"
win:
  target:
    - nsis
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
```

- [ ] **Step 8: ติดตั้งและ verify**

Run: `npm install`
Run: `npm run typecheck`
Expected: ไม่มี error
Run: `npm run dev`
Expected: หน้าต่าง Electron เปิดแสดง "FCC Studio" โดยไม่มี error ใน terminal

- [ ] **Step 9: Commit (ข้ามได้ถ้าผู้ใช้จัดการ git เอง)**

```bash
git init -b main
git add .
git commit -m "feat: scaffold electron-vite react-ts project"
```

---

### Task 2: Shared Types + Path Validation + IPC Skeleton

**Files:**
- Create: `src/shared/types.ts`, `src/shared/ipc.ts`, `src/shared/path-utils.ts`, `src/preload/index.d.ts`
- Modify: `src/main/index.ts` (ต่อ IPC), `src/preload/index.ts` (expose API เต็มรูปแบบ), `src/main/ipc.ts` (สร้าง)
- Test: `tests/path-utils.test.ts`

**Interfaces:**
- Consumes: Task 1 scaffold
- Produces: `isInside(root, target): boolean` (ใช้ในทุก file op), channel names จาก `IPC` (ใช้ใน main+preload+renderer), `window.fcc` typed API, `FileEntry` type

- [ ] **Step 1: เขียน failing test สำหรับ `isInside`**

`tests/path-utils.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isInside } from '../src/shared/path-utils';

describe('isInside', () => {
  it('allows a file inside the root', () => {
    expect(isInside('C:\\proj', 'C:\\proj\\src\\a.ts')).toBe(true);
  });
  it('rejects a file outside the root', () => {
    expect(isInside('C:\\proj', 'C:\\other\\a.ts')).toBe(false);
  });
  it('rejects parent-traversal paths', () => {
    expect(isInside('C:\\proj', 'C:\\proj\\..\\evil.ts')).toBe(false);
  });
  it('treats root itself as inside', () => {
    expect(isInside('C:\\proj', 'C:\\proj')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test ให้ fail**

Run: `npx vitest run tests/path-utils.test.ts`
Expected: FAIL — `isInside` not defined

- [ ] **Step 3: เขียน `src/shared/path-utils.ts`**

```ts
import path from 'path';

export function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
```

- [ ] **Step 4: Run test ให้ผ่าน**

Run: `npx vitest run tests/path-utils.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: เขียน `src/shared/types.ts`**

```ts
export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface FccStatus {
  online: boolean;
  port: number;
  version?: string;
}

export interface ChatEventPayload {
  sessionId: string;
  message: unknown; // SDK message type | custom: {type:'session-id'|'permission-request'|'user-message'}
}
```

- [ ] **Step 6: เขียน `src/shared/ipc.ts`**

```ts
export const IPC = {
  ping: 'app:ping',
  fsList: 'fs:list',
  fsRead: 'fs:read',
  fsWrite: 'fs:write',
  fsCreate: 'fs:create',
  fsRename: 'fs:rename',
  fsDelete: 'fs:delete',
  dialogOpenFolder: 'dialog:open-folder',
  termCreate: 'term:create',
  termData: 'term:data',
  termResize: 'term:resize',
  termDispose: 'term:dispose',
  fccStatus: 'fcc:status',
  fccStart: 'fcc:start',
  chatStart: 'chat:start',
  chatStop: 'chat:stop',
  chatPermission: 'chat:permission-response',
  // events main -> renderer
  evtChat: 'chat:event',
  evtFcc: 'fcc:status-changed',
  evtTerm: 'term:data',
  evtFileModified: 'file:modified'
} as const;
```

- [ ] **Step 7: เขียน `src/main/ipc.ts` (skeleton — เติม service จริงใน Task 3+)**

```ts
import { ipcMain, type BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';

export function registerIpc(win: BrowserWindow): void {
  ipcMain.handle(IPC.ping, () => 'pong');
}
```
และแก้ `src/main/index.ts`: import `registerIpc` แล้วเรียก `registerIpc(win)` ใน `createWindow()`.

- [ ] **Step 8: ขยาย preload เป็น API เต็มรูปแบบ + type declaration**

`src/preload/index.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type { FileEntry, FccStatus } from '@shared/types';

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke(IPC.ping),
  fsList: (dir: string): Promise<FileEntry[]> => ipcRenderer.invoke(IPC.fsList, dir),
  fsRead: (p: string): Promise<string> => ipcRenderer.invoke(IPC.fsRead, p),
  fsWrite: (p: string, content: string): Promise<void> => ipcRenderer.invoke(IPC.fsWrite, p, content),
  fsCreate: (p: string, isDir: boolean): Promise<void> => ipcRenderer.invoke(IPC.fsCreate, p, isDir),
  fsRename: (p: string, newName: string): Promise<void> => ipcRenderer.invoke(IPC.fsRename, p, newName),
  fsDelete: (p: string): Promise<void> => ipcRenderer.invoke(IPC.fsDelete, p),
  openFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogOpenFolder),
  termCreate: (cwd: string): Promise<number> => ipcRenderer.invoke(IPC.termCreate, cwd),
  termData: (id: number, data: string): void => ipcRenderer.send(IPC.termData, id, data),
  termResize: (id: number, cols: number, rows: number): void => ipcRenderer.send(IPC.termResize, id, cols, rows),
  termDispose: (id: number): Promise<void> => ipcRenderer.invoke(IPC.termDispose, id),
  fccStatus: (): Promise<FccStatus> => ipcRenderer.invoke(IPC.fccStatus),
  fccStart: (): Promise<FccStatus> => ipcRenderer.invoke(IPC.fccStart),
  chatStart: (sessionId: string, folder: string, prompt: string, resume?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.chatStart, sessionId, folder, prompt, resume),
  chatStop: (sessionId: string): Promise<void> => ipcRenderer.invoke(IPC.chatStop, sessionId),
  chatPermission: (requestId: string, allow: boolean): void => ipcRenderer.send(IPC.chatPermission, requestId, allow),
  onChatEvent: (cb: (payload: { sessionId: string; message: unknown }) => void): void => {
    ipcRenderer.on(IPC.evtChat, (_ev, payload) => cb(payload));
  },
  onFccStatus: (cb: (s: FccStatus) => void): void => {
    ipcRenderer.on(IPC.evtFcc, (_ev, s) => cb(s));
  },
  onTermData: (id: number, cb: (data: string) => void): void => {
    ipcRenderer.on(IPC.evtTerm, (_ev, tid: number, data: string) => { if (tid === id) cb(data); });
  },
  onFileModified: (cb: (e: { path: string }) => void): void => {
    ipcRenderer.on(IPC.evtFileModified, (_ev, e) => cb(e));
  }
};

contextBridge.exposeInMainWorld('fcc', api);
export type FccApi = typeof api;
```
`src/preload/index.d.ts`:
```ts
import type { FccApi } from './index';
declare global {
  interface Window { fcc: FccApi; }
}
export {};
```

- [ ] **Step 9: Verify**

Run: `npm run typecheck` → ไม่มี error
Run: `npm run test` → 4 tests ผ่าน
Run: `npm run dev` → เปิด DevTools (Ctrl+Shift+I) พิมพ์ `await window.fcc.ping()` → ได้ `"pong"`

- [ ] **Step 10: Commit**

```bash
git add src/shared src/main src/preload tests
git commit -m "feat: shared types, path validation, IPC skeleton"
```

---

### Task 3: File Service (main process) + Tests

**Files:**
- Create: `src/main/file-service.ts`
- Modify: `src/main/ipc.ts` (register fs + dialog handlers)
- Test: `tests/file-service.test.ts`

**Interfaces:**
- Consumes: `isInside` (Task 2), `FileEntry` (Task 2), `IPC` channels (Task 2)
- Produces: `setRoot(dir)`, `getRoot()`, `assertInside(target)`, `listDir(dir): Promise<FileEntry[]>`, `readFile(p): Promise<string>`, `writeFile(p, content)`, `createEntry(p, isDir)`, `renameEntry(p, newName)`, `deleteEntry(p)` — ใช้ใน Explorer UI (Task 4)

- [ ] **Step 1: เขียน failing test**

`tests/file-service.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { setRoot, listDir, readFile, writeFile, assertInside } from '../src/main/file-service';

let root: string;
beforeAll(() => { root = mkdtempSync(join(tmpdir(), 'fcc-test-')); });
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

describe('file-service', () => {
  it('lists dir entries sorted dirs-first, skipping node_modules/.git', async () => {
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    writeFileSync(join(root, 'a.txt'), 'hi');
    setRoot(root);
    const entries = await listDir(root);
    const names = entries.map((e) => e.name);
    expect(names).toEqual(['src', 'a.txt']);
  });
  it('reads and writes files under root', async () => {
    setRoot(root);
    await writeFile(join(root, 'x.ts'), 'export const x = 1');
    expect(await readFile(join(root, 'x.ts'))).toBe('export const x = 1');
  });
  it('throws when a path escapes the root', () => {
    setRoot(root);
    expect(() => assertInside(join(root, '..', 'evil.txt'))).toThrow();
  });
});
```

- [ ] **Step 2: Run test ให้ fail**

Run: `npx vitest run tests/file-service.test.ts`
Expected: FAIL — module/file not found

- [ ] **Step 3: เขียน `src/main/file-service.ts`**

```ts
import { promises as fs } from 'fs';
import path from 'path';
import { isInside } from '@shared/path-utils';
import type { FileEntry } from '@shared/types';

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'out', 'release']);
let rootDir: string | null = null;

export function setRoot(dir: string): void { rootDir = path.resolve(dir); }
export function getRoot(): string | null { return rootDir; }

export function assertInside(target: string): void {
  if (!rootDir) throw new Error('No folder open');
  if (!isInside(rootDir, target)) throw new Error(`Path outside root: ${target}`);
}

export async function listDir(dir: string): Promise<FileEntry[]> {
  assertInside(dir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => !SKIP_DIRS.has(e.name))
    .map((e) => ({ name: e.name, path: path.join(dir, e.name), isDir: e.isDirectory() }))
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
}

export async function readFile(p: string): Promise<string> {
  assertInside(p);
  return fs.readFile(p, 'utf-8');
}

export async function writeFile(p: string, content: string): Promise<void> {
  assertInside(p);
  await fs.writeFile(p, content, 'utf-8');
}

export async function createEntry(p: string, isDir: boolean): Promise<void> {
  assertInside(p);
  if (isDir) await fs.mkdir(p, { recursive: true });
  else await fs.writeFile(p, '', 'utf-8');
}

export async function renameEntry(p: string, newName: string): Promise<void> {
  assertInside(p);
  const target = path.join(path.dirname(p), newName);
  assertInside(target);
  await fs.rename(p, target);
}

export async function deleteEntry(p: string): Promise<void> {
  assertInside(p);
  await fs.rm(p, { recursive: true, force: true });
}
```

- [ ] **Step 4: Run test ให้ผ่าน**

Run: `npx vitest run tests/file-service.test.ts`
Expected: PASS

- [ ] **Step 5: ต่อ IPC ใน `src/main/ipc.ts`**

```ts
import { ipcMain, dialog, type BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import * as files from './file-service';

export function registerIpc(win: BrowserWindow): void {
  ipcMain.handle(IPC.ping, () => 'pong');

  ipcMain.handle(IPC.dialogOpenFolder, async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (res.canceled || res.filePaths.length === 0) return null;
    files.setRoot(res.filePaths[0]);
    return res.filePaths[0];
  });

  ipcMain.handle(IPC.fsList, (_e, dir: string) => files.listDir(dir));
  ipcMain.handle(IPC.fsRead, (_e, p: string) => files.readFile(p));
  ipcMain.handle(IPC.fsWrite, (_e, p: string, content: string) => files.writeFile(p, content));
  ipcMain.handle(IPC.fsCreate, (_e, p: string, isDir: boolean) => files.createEntry(p, isDir));
  ipcMain.handle(IPC.fsRename, (_e, p: string, newName: string) => files.renameEntry(p, newName));
  ipcMain.handle(IPC.fsDelete, (_e, p: string) => files.deleteEntry(p));
}
```

- [ ] **Step 6: Verify**

Run: `npm run test` + `npm run typecheck` → ผ่านทั้งหมด

- [ ] **Step 7: Commit**

```bash
git add src/main/file-service.ts src/main/ipc.ts tests
git commit -m "feat: file service with path validation"
```

---

### Task 4: Explorer UI + App Layout

**Files:**
- Create: `src/renderer/src/stores/explorer-store.ts`, `src/renderer/src/components/Explorer.tsx`, `src/renderer/src/components/StatusBar.tsx`, `src/renderer/src/stores/fcc-store.ts`
- Modify: `src/renderer/src/App.tsx` (layout เต็มรูปแบบ)
- Test: manual checklist (UI)

**Interfaces:**
- Consumes: `window.fcc.*` API (Task 2), file-service IPC (Task 3)
- Produces: `useExplorerStore` (root, tree, expand/collapse, actions), ใช้ใน Editor (Task 5) และ Chat (Task 9)

- [ ] **Step 1: เขียน `src/renderer/src/stores/explorer-store.ts`**

```ts
import { create } from 'zustand';
import type { FileEntry } from '@shared/types';

interface ExplorerState {
  root: string | null;
  children: Record<string, FileEntry[]>; // dir path -> entries
  expanded: Record<string, boolean>;
  openRoot: () => Promise<void>;
  toggle: (dir: string) => Promise<void>;
  refresh: () => Promise<void>;
  createFile: (parentDir: string) => Promise<void>;
  deleteEntry: (p: string) => Promise<void>;
}

export const useExplorerStore = create<ExplorerState>((set, get) => ({
  root: null,
  children: {},
  expanded: {},
  openRoot: async () => {
    const root = await window.fcc.openFolder();
    if (!root) return;
    const entries = await window.fcc.fsList(root);
    set({ root, children: { [root]: entries }, expanded: { [root]: true } });
  },
  toggle: async (dir) => {
    const { expanded, children } = get();
    const next = { ...expanded, [dir]: !expanded[dir] };
    let nextChildren = children;
    if (next[dir] && !children[dir]) {
      nextChildren = { ...children, [dir]: await window.fcc.fsList(dir) };
    }
    set({ expanded: next, children: nextChildren });
  },
  refresh: async () => {
    const { root } = get();
    if (!root) return;
    const entries = await window.fcc.fsList(root);
    set({ children: { ...get().children, [root]: entries } });
  },
  createFile: async (parentDir) => {
    const p = `${parentDir}\\untitled-${Date.now()}.ts`;
    await window.fcc.fsCreate(p, false);
    await get().refresh();
  },
  deleteEntry: async (p) => {
    if (window.confirm(`Delete ${p}?`)) {
      await window.fcc.fsDelete(p);
      await get().refresh();
    }
  }
}));
```

- [ ] **Step 2: เขียน `src/renderer/src/components/Explorer.tsx`**

```tsx
import { useExplorerStore } from '../stores/explorer-store';

function Node({ entry }: { entry: { name: string; path: string; isDir: boolean } }) {
  const toggle = useExplorerStore((s) => s.toggle);
  const expanded = useExplorerStore((s) => s.expanded[entry.path]);
  const children = useExplorerStore((s) => s.children[entry.path]);
  const deleteEntry = useExplorerStore((s) => s.deleteEntry);

  if (entry.isDir) {
    return (
      <div>
        <div className="tree-item" onClick={() => toggle(entry.path)}>
          <span>{expanded ? '▼' : '▶'} {entry.name}</span>
          <button onClick={(e) => { e.stopPropagation(); deleteEntry(entry.path); }} title="Delete">🗑</button>
        </div>
        {expanded && (children ?? []).map((c) => <Node key={c.path} entry={c} />)}
      </div>
    );
  }
  return (
    <div className="tree-item file" onClick={() => window.dispatchEvent(new CustomEvent('fcc:open-file', { detail: entry.path }))}>
      {entry.name}
      <button onClick={(e) => { e.stopPropagation(); deleteEntry(entry.path); }} title="Delete">🗑</button>
    </div>
  );
}

export default function Explorer() {
  const root = useExplorerStore((s) => s.root);
  const rootChildren = root ? useExplorerStore((s) => s.children[root]) : [];
  const openRoot = useExplorerStore((s) => s.openRoot);
  const createFile = useExplorerStore((s) => s.createFile);

  return (
    <div className="explorer">
      <div className="explorer-header">
        <span>EXPLORER</span>
        <button onClick={openRoot}>📂 Open Folder</button>
        {root && <button onClick={() => createFile(root)}>📄</button>}
      </div>
      {root ? (
        <div className="tree">
          {rootChildren.map((c) => <Node key={c.path} entry={c} />)}
        </div>
      ) : (
        <p className="empty">Click 📂 to open a folder</p>
      )}
    </div>
  );
}
```
*หมายเหตุ:* `fcc:open-file` เป็น CustomEvent เรียบง่าย — Editor (Task 5) ฟัง event นี้เพื่อเปิดแท็บ.

- [ ] **Step 3: เขียน `src/renderer/src/stores/fcc-store.ts`**

```ts
import { create } from 'zustand';
import type { FccStatus } from '@shared/types';

interface FccState {
  status: FccStatus | null;
  refresh: () => Promise<void>;
  start: () => Promise<void>;
}

export const useFccStore = create<FccState>((set) => ({
  status: null,
  refresh: async () => {
    try { set({ status: await window.fcc.fccStatus() }); } catch { set({ status: null }); }
  },
  start: async () => {
    set({ status: await window.fcc.fccStart() });
  }
}));
```

- [ ] **Step 4: เขียน `src/renderer/src/components/StatusBar.tsx`**

```tsx
import { useEffect } from 'react';
import { useFccStore } from '../stores/fcc-store';
import { useExplorerStore } from '../stores/explorer-store';

export default function StatusBar() {
  const status = useFccStore((s) => s.status);
  const refresh = useFccStore((s) => s.refresh);
  const start = useFccStore((s) => s.start);
  const root = useExplorerStore((s) => s.root);

  useEffect(() => {
    refresh();
    window.fcc.onFccStatus((s) => useFccStore.setState({ status: s }));
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="statusbar">
      <span className="folder">{root ?? 'No folder'}</span>
      <span className="spacer" />
      <span className={`fcc ${status?.online ? 'ok' : 'down'}`}>
        FCC {status?.online ? '● online' : '● offline'}
      </span>
      {!status?.online && <button onClick={start}>Start FCC server</button>}
    </div>
  );
}
```

- [ ] **Step 5: แก้ `src/renderer/src/App.tsx` เป็น layout เต็มรูปแบบ**

```tsx
import Explorer from './components/Explorer';
import Editor from './components/Editor';
import ChatPanel from './components/ChatPanel';
import Terminal from './components/Terminal';
import StatusBar from './components/StatusBar';

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar"><Explorer /></aside>
      <main className="center">
        <Editor />
        <ChatPanel />
      </main>
      <Terminal />
      <StatusBar />
    </div>
  );
}
```
*หมายเหตุ:* `Editor`, `ChatPanel`, `Terminal` ยังไม่มีใน Task นี้ — สร้างไฟล์ stub ง่ายๆ (return `<div className="pane">...</div>`) เพื่อให้ compile ผ่าน.

- [ ] **Step 6: เพิ่ม CSS layout**

เพิ่มใน `styles.css`:
```css
.app { display: flex; flex-direction: column; height: 100%; }
.sidebar { width: 240px; border-right: 1px solid #333; overflow: auto; }
.center { flex: 1; display: flex; flex-direction: row; min-height: 0; }
.center .editor-pane { flex: 1; min-width: 0; }
.center .chat-pane { width: 380px; border-left: 1px solid #333; display: flex; flex-direction: column; }
.terminal-pane { height: 240px; border-top: 1px solid #333; }
.statusbar { display: flex; gap: 12px; padding: 4px 8px; font-size: 12px; background: #007acc; color: #fff; }
.statusbar .spacer { flex: 1; }
.fcc.ok { color: #9fff9f; }
.fcc.down { color: #ff9f9f; }
.tree-item { padding: 2px 8px; cursor: pointer; user-select: none; }
.tree-item:hover { background: #2a2a2a; }
.tree-item .tree-item { padding-left: 20px; }
.empty { padding: 12px; color: #888; }
```

- [ ] **Step 7: Verify (manual)**

Run: `npm run dev`
Checklist:
- คลิก "📂 Open Folder" → เลือกโฟลเดอร์ → ต้นไม้ไฟล์แสดง, โฟลเดอร์มาก่อน, ไม่มี `node_modules`
- คลิกโฟลเดอร์ → ขยาย/ย่อ
- คลิก 🗑 → confirm → ไฟล์ถูกลบ และ refresh
- Status bar แสดง "FCC ● online" (ถ้า server รันอยู่) พร้อมโฟลเดอร์ปัจจุบัน

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src
git commit -m "feat: explorer tree, app layout, status bar"
```

---

### Task 5: Editor (Monaco + Tabs + Save)

**Files:**
- Create: `src/renderer/src/stores/editor-store.ts`, `src/renderer/src/components/Editor.tsx`
- Modify: `src/renderer/src/App.tsx` (wire open-file event)
- Test: manual checklist

**Interfaces:**
- Consumes: `window.fcc.fsRead/fsWrite` (Task 3), CustomEvent `fcc:open-file` (Task 4)
- Produces: `useEditorStore` — `tabs: EditorTab[]`, `activePath`, `open(path)`, `setContent(path, content)`, `save(path)`, `close(path)`, `getBase(path)` — ใช้ใน Chat/Diff (Task 10)

- [ ] **Step 1: เขียน `src/renderer/src/stores/editor-store.ts`**

```ts
import { create } from 'zustand';

export interface EditorTab {
  path: string;
  name: string;
  content: string;
  baseContent: string; // snapshot ที่ load/last save — ใช้ diff กับ agent edit
  dirty: boolean;
  agentModified?: boolean;
}

interface EditorState {
  tabs: EditorTab[];
  activePath: string | null;
  diffPath: string | null;
  open: (path: string) => Promise<void>;
  setContent: (path: string, content: string) => void;
  save: (path: string) => Promise<void>;
  close: (path: string) => void;
  setActive: (path: string) => void;
  setDiff: (path: string | null) => void;
  markAgentModified: (path: string) => void;
  acceptAgentChange: (path: string) => Promise<void>;
  revertAgentChange: (path: string) => Promise<void>;
  getBase: (path: string) => string | null;
  getTab: (path: string) => EditorTab | null;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activePath: null,
  diffPath: null,
  open: async (path) => {
    if (get().tabs.some((t) => t.path === path)) { set({ activePath: path }); return; }
    const content = await window.fcc.fsRead(path);
    const name = path.split(/[\\/]/).pop() ?? path;
    set({
      tabs: [...get().tabs, { path, name, content, baseContent: content, dirty: false }],
      activePath: path
    });
  },
  setContent: (path, content) => {
    set({
      tabs: get().tabs.map((t) => (t.path === path ? { ...t, content, dirty: content !== t.baseContent } : t))
    });
  },
  save: async (path) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab) return;
    await window.fcc.fsWrite(path, tab.content);
    set({ tabs: get().tabs.map((t) => (t.path === path ? { ...t, baseContent: t.content, dirty: false } : t)) });
  },
  close: (path) => {
    const rest = get().tabs.filter((t) => t.path !== path);
    set({ tabs: rest, activePath: rest.length ? rest[rest.length - 1].path : null });
  },
  setActive: (path) => set({ activePath: path }),
  setDiff: (path) => set({ diffPath: path }),
  markAgentModified: (path) => {
    set({
      tabs: get().tabs.map((t) => (t.path === path ? { ...t, agentModified: true } : t))
    });
  },
  acceptAgentChange: async (path) => {
    const content = await window.fcc.fsRead(path);
    set({
      tabs: get().tabs.map((t) => (t.path === path ? { ...t, content, baseContent: content, dirty: false, agentModified: false } : t))
    });
  },
  revertAgentChange: async (path) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab) return;
    await window.fcc.fsWrite(path, tab.baseContent);
    set({
      tabs: get().tabs.map((t) => (t.path === path ? { ...t, content: t.baseContent, dirty: false, agentModified: false } : t))
    });
  },
  getBase: (path) => get().tabs.find((t) => t.path === path)?.baseContent ?? null,
  getTab: (path) => get().tabs.find((t) => t.path === path) ?? null
}));
```

- [ ] **Step 2: เขียน `src/renderer/src/components/Editor.tsx`**

```tsx
import { useEffect } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useEditorStore } from '../stores/editor-store';
import DiffView from './DiffView';

loader.config({ monaco });

export default function EditorPane() {
  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore((s) => s.activePath);
  const diffPath = useEditorStore((s) => s.diffPath);
  const setDiff = useEditorStore((s) => s.setDiff);
  const setContent = useEditorStore((s) => s.setContent);
  const save = useEditorStore((s) => s.save);
  const close = useEditorStore((s) => s.close);
  const setActive = useEditorStore((s) => s.setActive);
  const open = useEditorStore((s) => s.open);
  const accept = useEditorStore((s) => s.acceptAgentChange);
  const revert = useEditorStore((s) => s.revertAgentChange);
  const markAgentModified = useEditorStore((s) => s.markAgentModified);

  useEffect(() => {
    const handler = (e: Event) => open((e as CustomEvent).detail as string);
    window.addEventListener('fcc:open-file', handler);
    return () => window.removeEventListener('fcc:open-file', handler);
  }, [open]);

  useEffect(() => {
    const modified = (e: Event) => {
      const p = (e as CustomEvent).detail as string;
      if (tabs.some((t) => t.path === p)) markAgentModified(p);
    };
    window.addEventListener('fcc:file-modified', modified);
    return () => window.removeEventListener('fcc:file-modified', modified);
  }, [tabs, markAgentModified]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && activePath) {
        e.preventDefault();
        save(activePath);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePath, save]);

  const active = tabs.find((t) => t.path === activePath);

  return (
    <div className="editor-pane">
      <div className="tabs">
        {tabs.map((t) => (
          <span
            key={t.path}
            className={`tab ${t.path === activePath ? 'active' : ''}`}
            onClick={() => setActive(t.path)}
          >
            {t.dirty && '* '}{t.name}
            <button onClick={(e) => { e.stopPropagation(); close(t.path); }}>×</button>
          </span>
        ))}
      </div>
      {active && active.agentModified && !diffPath && (
        <div className="agent-banner">
          🤖 Claude modified this file
          <button onClick={() => setDiff(active.path)}>Review changes</button>
          <button onClick={() => accept(active.path)}>Accept</button>
          <button onClick={() => revert(active.path)}>Revert</button>
        </div>
      )}
      {diffPath ? (
        <DiffView path={diffPath} onClose={() => setDiff(null)} />
      ) : active ? (
        <Editor
          key={active.path}
          path={active.path}
          defaultLanguage={langFor(active.path)}
          value={active.content}
          onChange={(v) => v !== undefined && setContent(active.path, v)}
          theme="vs-dark"
          options={{ minimap: { enabled: false }, fontSize: 14 }}
        />
      ) : (
        <div className="empty">Select a file from the explorer</div>
      )}
    </div>
  );
}

function langFor(p: string): string {
  const ext = p.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', html: 'html', css: 'css', py: 'python',
    rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp', sh: 'shell', yml: 'yaml', yaml: 'yaml'
  };
  return map[ext] ?? 'plaintext';
}
```
*หมายเหตุ:* Editor.tsx นี้รวม DiffView integration (Task 10) ไว้แล้ว — ถ้าทำทีละ task ตามลำดับ ให้เริ่มจากส่วน editor ปกติก่อน แล้วค่อยเพิ่ม diff ใน Task 10 (โค้ดด้านบนคือ endpoint รวม).

- [ ] **Step 3: เพิ่ม CSS**

```css
.tabs { display: flex; border-bottom: 1px solid #333; background: #252526; overflow-x: auto; }
.tab { padding: 6px 10px; cursor: pointer; white-space: nowrap; font-size: 13px; }
.tab.active { background: #1e1e1e; border-top: 1px solid #007acc; }
.agent-banner { padding: 6px 10px; background: #3a2e00; display: flex; gap: 8px; align-items: center; }
```

- [ ] **Step 4: Verify (manual)**

Run: `npm run dev`
Checklist:
- คลิกไฟล์ใน explorer → เปิดแท็บ Monaco, syntax highlight ตามภาษา
- แก้โค้ด → ขึ้น `*` หน้าแท็บ; Ctrl+S → บันทึก, `*` หาย
- เปิดหลายไฟล์ → สลับแท็บได้, ปิดแท็บได้

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/editor-store.ts src/renderer/src/components/Editor.tsx
git commit -m "feat: monaco editor with tabs and save"
```

---

### Task 6: Terminal (xterm.js + node-pty + Run fcc-claude)

**Files:**
- Create: `src/main/terminal-service.ts`, `src/renderer/src/components/Terminal.tsx`
- Modify: `src/main/ipc.ts` (term handlers)
- Test: manual checklist

**Interfaces:**
- Consumes: `node-pty` (dep Task 1), `IPC.term*` (Task 2)
- Produces: `createTerminal(cwd): number`, `writeTerminal(id, data)`, `resizeTerminal(id, cols, rows)`, `disposeTerminal(id)` + event `term:data {id, data}` — ใช้เป็นที่รัน `fcc-claude`

- [ ] **Step 1: เขียน `src/main/terminal-service.ts`**

```ts
import * as pty from 'node-pty';
import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';

const terminals = new Map<number, pty.IPty>();
let nextId = 1;

function defaultShell(): string {
  if (process.platform === 'win32') return process.env.ComSpec ?? 'powershell.exe';
  return process.env.SHELL ?? '/bin/bash';
}

export function createTerminal(win: BrowserWindow, cwd: string): number {
  const id = nextId++;
  const term = pty.spawn(defaultShell(), [], {
    name: 'xterm-256color', cols: 80, rows: 24, cwd,
    env: process.env as Record<string, string>
  });
  term.onData((data) => win.webContents.send(IPC.evtTerm, id, data));
  term.onExit(() => terminals.delete(id));
  terminals.set(id, term);
  return id;
}

export function writeTerminal(id: number, data: string): void {
  terminals.get(id)?.write(data);
}

export function resizeTerminal(id: number, cols: number, rows: number): void {
  terminals.get(id)?.resize(cols, rows);
}

export function disposeTerminal(id: number): void {
  terminals.get(id)?.kill();
  terminals.delete(id);
}
```

- [ ] **Step 2: ต่อ IPC ใน `src/main/ipc.ts`**

```ts
ipcMain.handle(IPC.termCreate, (_e, cwd: string) => createTerminal(win, cwd ?? process.cwd()));
ipcMain.on(IPC.termData, (_e, id: number, data: string) => writeTerminal(id, data));
ipcMain.on(IPC.termResize, (_e, id: number, cols: number, rows: number) => resizeTerminal(id, cols, rows));
ipcMain.handle(IPC.termDispose, (_e, id: number) => disposeTerminal(id));
```

- [ ] **Step 3: เขียน `src/renderer/src/components/Terminal.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useExplorerStore } from '../stores/explorer-store';

export default function TerminalPane() {
  const ref = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const idRef = useRef<number | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const root = useExplorerStore((s) => s.root);

  useEffect(() => {
    if (!ref.current) return;
    const term = new XTerm({ convertEol: true, cursorBlink: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(ref.current);
    termRef.current = term;
    fitRef.current = fit;
    fit.fit();

    const cwd = root ?? process.cwd();
    window.fcc.termCreate(cwd).then((id) => {
      idRef.current = id;
      window.fcc.onTermData(id, (data) => term.write(data));
    });

    term.onData((data) => { if (idRef.current !== null) window.fcc.termData(idRef.current, data); });

    const onResize = () => {
      fit.fit();
      if (idRef.current !== null) window.fcc.termResize(idRef.current, term.cols, term.rows);
    };
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      if (idRef.current !== null) window.fcc.termDispose(idRef.current);
      term.dispose();
    };
  }, [root]);

  return (
    <div className="terminal-pane">
      <div className="term-header">
        <span>TERMINAL</span>
        <button onClick={() => { if (idRef.current !== null) window.fcc.termData(idRef.current, 'fcc-claude\r'); }}>
          ▶ Run fcc-claude here
        </button>
      </div>
      <div ref={ref} className="term-body" />
    </div>
  );
}
```

- [ ] **Step 4: เพิ่ม CSS**

```css
.term-header { display: flex; justify-content: space-between; padding: 4px 8px; background: #252526; font-size: 12px; }
.term-body { height: calc(100% - 28px); padding: 4px 8px; }
```

- [ ] **Step 5: Verify (manual)**

Run: `npm run dev`
Checklist:
- Terminal โผล่ด้านล่าง พิมพ์คำสั่งได้ (เช่น `dir`)
- คลิก "▶ Run fcc-claude here" → `fcc-claude` รันใน terminal และคุยได้ (ต้องมี FCC server รันอยู่)
- ย่อ/ขยายหน้าต่าง → ขนาด terminal ตาม

- [ ] **Step 6: Commit**

```bash
git add src/main/terminal-service.ts src/renderer/src/components/Terminal.tsx
git commit -m "feat: integrated terminal with fcc-claude launcher"
```

---

### Task 7: FCC Manager (Health + Start + Status)

**Files:**
- Create: `src/main/fcc-manager.ts`
- Modify: `src/main/ipc.ts`, `src/main/index.ts` (start polling), `src/renderer/src/stores/fcc-store.ts` (ใช้ API เต็ม)
- Test: `tests/fcc-manager.test.ts`

**Interfaces:**
- Consumes: none new
- Produces: `FCC_BASE_URL`, `FCC_AUTH_TOKEN`, `checkHealth(): Promise<FccStatus>`, `startServer(): Promise<FccStatus>`, `startPolling(win)`, `stopPolling()`, `buildStatus(ok, port): FccStatus` — ใช้ใน StatusBar (Task 4) และ Chat (Task 8)

- [ ] **Step 1: เขียน failing test**

`tests/fcc-manager.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildStatus } from '../src/main/fcc-manager';

describe('buildStatus', () => {
  it('reports online when http status is ok', () => {
    expect(buildStatus(true, 8082)).toEqual({ online: true, port: 8082 });
  });
  it('reports offline when request failed', () => {
    expect(buildStatus(false, 8082)).toEqual({ online: false, port: 8082 });
  });
});
```

- [ ] **Step 2: Run test ให้ fail**

Run: `npx vitest run tests/fcc-manager.test.ts`
Expected: FAIL — `buildStatus` not defined

- [ ] **Step 3: เขียน `src/main/fcc-manager.ts`**

```ts
import { spawn } from 'child_process';
import { net, type BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type { FccStatus } from '@shared/types';

export const FCC_PORT = Number(process.env.FCC_PORT ?? 8082);
export const FCC_BASE_URL = process.env.FCC_BASE_URL ?? `http://127.0.0.1:${FCC_PORT}`;
export const FCC_AUTH_TOKEN = process.env.FCC_AUTH_TOKEN ?? 'freecc';

let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastStatus: FccStatus = { online: false, port: FCC_PORT };

export function buildStatus(ok: boolean, port: number): FccStatus {
  return { online: ok, port };
}

export async function checkHealth(): Promise<FccStatus> {
  const ok = await new Promise<boolean>((resolve) => {
    const req = net.request({ url: `${FCC_BASE_URL}/health`, timeout: 2000 });
    req.on('response', () => resolve(true));
    req.on('error', () => resolve(false));
    req.on('abort', () => resolve(false));
    req.end();
  });
  lastStatus = buildStatus(ok, FCC_PORT);
  return lastStatus;
}

export async function startServer(): Promise<FccStatus> {
  const before = await checkHealth();
  if (!before.online) {
    const bin = process.env.FCC_SERVER_BIN ?? 'fcc-server';
    spawn(bin, [], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const s = await checkHealth();
      if (s.online) return s;
    }
  }
  return lastStatus;
}

export function startPolling(win: BrowserWindow): void {
  if (pollTimer) return;
  const tick = async (): Promise<void> => {
    const s = await checkHealth();
    win.webContents.send(IPC.evtFcc, s);
  };
  void tick();
  pollTimer = setInterval(tick, 5000);
}

export function stopPolling(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
```

- [ ] **Step 4: Run test ให้ผ่าน**

Run: `npx vitest run tests/fcc-manager.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: ต่อ IPC + เริ่ม polling**

`src/main/ipc.ts` เพิ่ม import `* as fcc from './fcc-manager'` และ:
```ts
ipcMain.handle(IPC.fccStatus, () => fcc.checkHealth());
ipcMain.handle(IPC.fccStart, () => fcc.startServer());
```
`src/main/index.ts` เพิ่มใน `createWindow()` หลัง `registerIpc(win)`:
```ts
fcc.startPolling(win);
```
และ `app.on('will-quit', () => fcc.stopPolling())`.

- [ ] **Step 6: Verify (manual + smoke)**

Run: `npm run test` (ผ่าน), `npm run dev`
Checklist:
- Status bar แสดง "FCC ● online" (server รันอยู่)
- ปิด FCC server (ถ้าคุมได้) → กลายเป็น offline → คลิก "Start FCC server" → กลับเป็น online

- [ ] **Step 7: Commit**

```bash
git add src/main/fcc-manager.ts tests
git commit -m "feat: fcc server health management"
```

---

### Task 8: Chat Engine Host (main process) + Permission Gate

**Files:**
- Create: `src/main/chat/config.ts`, `src/main/chat/permission-gate.ts`, `src/main/chat/chat-host.ts`, `smoke/sdk-smoke.mjs`
- Modify: `src/main/ipc.ts` (chat handlers)
- Test: `tests/permission-gate.test.ts`
- **สำคัญ:** เริ่มด้วย **spike** — ยืนยัน `canUseTool` async + env + settingSources ทำงานผ่าน FCC proxy

**Interfaces:**
- Consumes: `FCC_BASE_URL`, `FCC_AUTH_TOKEN` (Task 7), `IPC.evtChat` (Task 2)
- Produces: `ChatHost.start(sessionId, folder, prompt, resume?)`, `ChatHost.stop(sessionId)`, `ChatHost.respondPermission(requestId, allow)`; events: SDK message (`{type:'message', message}`) + custom `{type:'session-id'}`, `{type:'permission-request', requestId, toolName, input}`, `{type:'user-message', text}`, `{type:'started'|'stopped'|'error'}` — ใช้ใน ChatPanel UI (Task 9)

- [ ] **Step 0: Spike — verify SDK options กับ FCC proxy**

`smoke/sdk-smoke.mjs`:
```js
import { query } from '@anthropic-ai/claude-agent-sdk';

const base = process.env.FCC_BASE_URL ?? 'http://127.0.0.1:8082';
const token = process.env.FCC_AUTH_TOKEN ?? 'freecc';
const prompt = process.argv[2] ?? 'Reply with exactly: OK';

const gen = await query({
  prompt,
  options: {
    model: 'claude-haiku-4-5-20251001',
    maxTurns: 5,
    cwd: process.cwd(),
    settingSources: 'default',
    canUseTool: () => true
  },
  env: {
    ANTHROPIC_BASE_URL: base,
    ANTHROPIC_AUTH_TOKEN: token,
    CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: '190000'
  }
});

let text = '';
for await (const m of gen) {
  if (m.type === 'assistant') {
    text += m.message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
}
if (!text.trim()) { console.error('SMOKE FAIL: empty reply'); process.exit(1); }
console.log('SMOKE OK:', JSON.stringify(text.slice(0, 200)));
```
Run: `node smoke/sdk-smoke.mjs "Run bash echo fcc-ok and report output"`
Expected: output มี `SMOKE OK:` และข้อความรายงานผล — **ยืนยัน** canUseTool + env + settingSources ทำงานผ่าน proxy

- [ ] **Step 1: เขียน failing test สำหรับ `PermissionGate`**

`tests/permission-gate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PermissionGate } from '../src/main/chat/permission-gate';

describe('PermissionGate', () => {
  it('auto-allows read-only tools', () => {
    const gate = new PermissionGate(() => {});
    expect(gate.canUse('Read', { file_path: 'a.ts' })).toBe(true);
  });
  it('requests permission for other tools and resolves the promise', async () => {
    let requested: { requestId: string; toolName: string } | null = null;
    const gate = new PermissionGate((req) => { requested = req; });
    const promise = gate.canUse('Bash', { command: 'ls' });
    expect(requested?.toolName).toBe('Bash');
    gate.respond(requested!.requestId, true);
    expect(await promise).toBe(true);
  });
  it('denies when user denies', async () => {
    let requested: { requestId: string } | null = null;
    const gate = new PermissionGate((req) => { requested = req; });
    const promise = gate.canUse('Edit', { file_path: 'a.ts' });
    gate.respond(requested!.requestId, false);
    expect(await promise).toBe(false);
  });
  it('ignores unknown request ids', () => {
    const gate = new PermissionGate(() => {});
    expect(gate.respond('nope', true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test ให้ fail**

Run: `npx vitest run tests/permission-gate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: เขียน `src/main/chat/permission-gate.ts`**

```ts
import { randomUUID } from 'crypto';

export const ALLOWED_TOOLS = ['Read', 'Glob', 'Grep'];

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  input: unknown;
}

export class PermissionGate {
  private pending = new Map<string, (allow: boolean) => void>();

  constructor(private onRequest: (req: PermissionRequest) => void) {}

  canUse(toolName: string, input: unknown): boolean | Promise<boolean> {
    if (ALLOWED_TOOLS.includes(toolName)) return true;
    return new Promise<boolean>((resolve) => {
      const requestId = randomUUID();
      this.pending.set(requestId, resolve);
      this.onRequest({ requestId, toolName, input });
    });
  }

  respond(requestId: string, allow: boolean): boolean {
    const resolve = this.pending.get(requestId);
    if (!resolve) return false;
    this.pending.delete(requestId);
    resolve(allow);
    return true;
  }
}
```

- [ ] **Step 4: Run test ให้ผ่าน**

Run: `npx vitest run tests/permission-gate.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: เขียน `src/main/chat/config.ts`**

```ts
export const CHAT_MODEL = process.env.FCC_CHAT_MODEL ?? 'claude-haiku-4-5-20251001';
export const CHAT_MAX_TURNS = Number(process.env.FCC_CHAT_MAX_TURNS ?? 50);
```

- [ ] **Step 6: เขียน `src/main/chat/chat-host.ts`**

```ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import { FCC_BASE_URL, FCC_AUTH_TOKEN } from '../fcc-manager';
import { CHAT_MODEL, CHAT_MAX_TURNS } from './config';
import { PermissionGate } from './permission-gate';

interface ActiveSession {
  gate: PermissionGate;
  abort: AbortController;
}

export class ChatHost {
  private sessions = new Map<string, ActiveSession>();

  constructor(private win: BrowserWindow) {}

  async start(sessionId: string, folder: string, prompt: string, resume?: string): Promise<void> {
    const gate = new PermissionGate((req) => {
      this.emit(sessionId, { type: 'permission-request', ...req });
    });
    const abort = new AbortController();
    this.sessions.set(sessionId, { gate, abort });

    this.emit(sessionId, { type: 'user-message', text: prompt });
    this.emit(sessionId, { type: 'started' });

    try {
      const gen = query({
        prompt,
        signal: abort.signal,
        options: {
          model: CHAT_MODEL,
          cwd: folder,
          resume,
          maxTurns: CHAT_MAX_TURNS,
          settingSources: 'default',
          canUseTool: (toolName: string, input: unknown) => gate.canUse(toolName, input)
        },
        env: {
          ANTHROPIC_BASE_URL: FCC_BASE_URL,
          ANTHROPIC_AUTH_TOKEN: FCC_AUTH_TOKEN,
          CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: '190000'
        }
      });
      for await (const message of gen) {
        this.emit(sessionId, { type: 'message', message });
        if (message.type === 'result' && message.session_id) {
          this.emit(sessionId, { type: 'session-id', session_id: message.session_id });
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this.emit(sessionId, { type: 'stopped' });
      } else {
        this.emit(sessionId, { type: 'error', message: (err as Error).message });
      }
    } finally {
      this.sessions.delete(sessionId);
    }
  }

  stop(sessionId: string): void {
    this.sessions.get(sessionId)?.abort.abort();
  }

  respondPermission(requestId: string, allow: boolean): void {
    for (const s of this.sessions.values()) s.gate.respond(requestId, allow);
  }

  private emit(sessionId: string, message: unknown): void {
    this.win.webContents.send(IPC.evtChat, { sessionId, message });
  }
}
```

- [ ] **Step 7: ต่อ IPC ใน `src/main/ipc.ts`**

```ts
import { ChatHost } from './chat/chat-host';
let chatHost: ChatHost | null = null;
// ใน registerIpc:
chatHost = new ChatHost(win);
ipcMain.handle(IPC.chatStart, (_e, sessionId: string, folder: string, prompt: string, resume?: string) =>
  chatHost!.start(sessionId, folder, prompt, resume));
ipcMain.handle(IPC.chatStop, (_e, sessionId: string) => chatHost!.stop(sessionId));
ipcMain.on(IPC.chatPermission, (_e, requestId: string, allow: boolean) => chatHost!.respondPermission(requestId, allow));
```

- [ ] **Step 8: Verify**

Run: `npm run smoke` → SMOKE OK
Run: `npm run typecheck` + `npm run test` → ผ่านทั้งหมด

- [ ] **Step 9: Commit**

```bash
git add src/main/chat smoke tests
git commit -m "feat: chat engine host with permission gate"
```

---

### Task 9: Chat Panel UI (messages, streaming, tool cards, permissions)

**Files:**
- Create: `src/renderer/src/chat/chat-reducer.ts`, `src/renderer/src/stores/chat-store.ts`, `src/renderer/src/components/ChatPanel.tsx`, `src/renderer/src/components/ChatMessage.tsx`, `src/renderer/src/components/ToolCallCard.tsx`, `src/renderer/src/components/PermissionCard.tsx`
- Test: `tests/chat-reducer.test.ts`

**Interfaces:**
- Consumes: `ChatHost` events (Task 8): `{type:'message', message}` (SDK message), `{type:'permission-request', requestId, toolName, input}`, `{type:'session-id', session_id}`, `{type:'user-message', text}`, `{type:'started'|'stopped'|'error'}`
- Produces: `useChatStore` — `messages`, `permissions`, `running`, `error`, `activeSessionId`, `folder`, `handleEvent(sessionId, message)`, `start(folder, prompt, resume?)`, `stop()`, `respond(requestId, allow)`, `reset()` — ใช้ใน Diff view (Task 10)

- [ ] **Step 1: เขียน failing test สำหรับ chat reducer**

`tests/chat-reducer.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { emptyChatState, applyChatEvent, type ChatEvent } from '../src/renderer/src/chat/chat-reducer';

describe('applyChatEvent', () => {
  it('appends assistant text to the last assistant message', () => {
    let s = emptyChatState();
    s = applyChatEvent(s, { type: 'assistant', message: { content: [{ type: 'text', text: 'Hel' }] } }).state;
    s = applyChatEvent(s, { type: 'assistant', message: { content: [{ type: 'text', text: 'lo' }] } }).state;
    expect(s.messages[0].text).toBe('Hello');
  });

  it('tracks tool_use state and emits file event on successful Edit', () => {
    let s = emptyChatState();
    let r = applyChatEvent(s, {
      type: 'tool_use',
      message: { tool_use_id: 't1', tool_name: 'Edit', input: { file_path: 'C:/proj/a.ts' }, state: 'running' }
    });
    expect(r.state.messages[0].tools[0].state).toBe('running');
    r = applyChatEvent(r.state, {
      type: 'tool_use',
      message: { tool_use_id: 't1', tool_name: 'Edit', input: { file_path: 'C:/proj/a.ts' }, state: 'success' }
    });
    expect(r.state.messages[0].tools[0].state).toBe('success');
    expect(r.fileEvents).toEqual([{ path: 'C:/proj/a.ts' }]);
  });

  it('adds and removes permission requests', () => {
    let s = emptyChatState();
    s = applyChatEvent(s, { type: 'permission-request', requestId: 'r1', toolName: 'Bash', input: { command: 'rm -rf' } }).state;
    expect(s.permissions).toHaveLength(1);
    s = applyChatEvent(s, { type: 'permission-resolved', requestId: 'r1' }).state;
    expect(s.permissions).toHaveLength(0);
  });

  it('captures session id and clears error on start', () => {
    let s = emptyChatState();
    s = applyChatEvent(s, { type: 'started' }).state;
    expect(s.running).toBe(true);
    expect(s.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run test ให้ fail**

Run: `npx vitest run tests/chat-reducer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: เขียน `src/renderer/src/chat/chat-reducer.ts`**

```ts
export interface ToolCall {
  tool_use_id: string;
  toolName: string;
  input: unknown;
  state: 'running' | 'success' | 'error';
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools: ToolCall[];
}
export interface PermissionItem {
  requestId: string;
  toolName: string;
  input: unknown;
}
export interface ChatUiState {
  messages: ChatMessage[];
  permissions: PermissionItem[];
  running: boolean;
  error: string | null;
  sessionId: string | null;
}
export interface FileEvent { path: string; }

export type ChatEvent =
  | { type: 'user-message'; text: string }
  | { type: 'assistant'; message: { content?: { type: string; text: string }[] } }
  | { type: 'tool_use'; message: { tool_use_id: string; tool_name: string; input: unknown; state?: string } }
  | { type: 'result'; message?: { is_error?: boolean; errors?: string[] } }
  | { type: 'session-id'; session_id: string }
  | { type: 'permission-request'; requestId: string; toolName: string; input: unknown }
  | { type: 'permission-resolved'; requestId: string }
  | { type: 'started' }
  | { type: 'stopped' }
  | { type: 'error'; message: string };

export function emptyChatState(): ChatUiState {
  return { messages: [], permissions: [], running: false, error: null, sessionId: null };
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function applyChatEvent(
  state: ChatUiState,
  ev: ChatEvent
): { state: ChatUiState; fileEvents: FileEvent[] } {
  const fileEvents: FileEvent[] = [];
  let s = state;
  switch (ev.type) {
    case 'user-message':
      s = { ...s, messages: [...s.messages, { id: uid(), role: 'user', text: ev.text, tools: [] }] };
      break;
    case 'assistant': {
      const text = (ev.message?.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const last = s.messages[s.messages.length - 1];
      if (last && last.role === 'assistant') {
        s = { ...s, messages: s.messages.slice(0, -1).concat({ ...last, text: last.text + text }) };
      } else {
        s = { ...s, messages: [...s.messages, { id: uid(), role: 'assistant', text, tools: [] }] };
      }
      break;
    }
    case 'tool_use': {
      const tool: ToolCall = {
        tool_use_id: ev.message.tool_use_id,
        toolName: ev.message.tool_name,
        input: ev.message.input,
        state: ev.message.state === 'success' ? 'success' : ev.message.state === 'error' ? 'error' : 'running'
      };
      const last = s.messages[s.messages.length - 1];
      if (!last || last.role !== 'assistant') {
        s = { ...s, messages: [...s.messages, { id: uid(), role: 'assistant', text: '', tools: [tool] }] };
      } else {
        const idx = last.tools.findIndex((t) => t.tool_use_id === tool.tool_use_id);
        const tools = idx >= 0 ? last.tools.map((t, i) => (i === idx ? { ...t, ...tool } : t)) : [...last.tools, tool];
        s = { ...s, messages: s.messages.slice(0, -1).concat({ ...last, tools }) };
      }
      if (tool.state === 'success' && (tool.toolName === 'Edit' || tool.toolName === 'Write')) {
        const p = (tool.input as { file_path?: string })?.file_path;
        if (p) fileEvents.push({ path: p });
      }
      break;
    }
    case 'result':
      s = {
        ...s,
        running: false,
        error: ev.message?.is_error ? (ev.message.errors ?? ['Agent error']).join('; ') : null
      };
      break;
    case 'session-id':
      s = { ...s, sessionId: ev.session_id };
      break;
    case 'permission-request':
      s = { ...s, permissions: [...s.permissions, { requestId: ev.requestId, toolName: ev.toolName, input: ev.input }] };
      break;
    case 'permission-resolved':
      s = { ...s, permissions: s.permissions.filter((p) => p.requestId !== ev.requestId) };
      break;
    case 'started':
      s = { ...s, running: true, error: null };
      break;
    case 'stopped':
      s = { ...s, running: false };
      break;
    case 'error':
      s = { ...s, running: false, error: ev.message };
      break;
  }
  return { state: s, fileEvents };
}
```

- [ ] **Step 4: Run test ให้ผ่าน**

Run: `npx vitest run tests/chat-reducer.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: เขียน `src/renderer/src/stores/chat-store.ts`**

```ts
import { create } from 'zustand';
import { emptyChatState, applyChatEvent, type ChatEvent, type ChatUiState, type FileEvent } from '../chat/chat-reducer';

interface ChatStore extends ChatUiState {
  activeSessionId: string | null;
  folder: string | null;
  start: (folder: string, prompt: string, resumeSessionId?: string) => void;
  stop: () => void;
  respond: (requestId: string, allow: boolean) => void;
  reset: () => void;
  handleEvent: (sessionId: string, message: unknown) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  ...emptyChatState(),
  activeSessionId: null,
  folder: null,
  handleEvent: (sessionId, message) => {
    if (sessionId !== get().activeSessionId) return;
    const { state, fileEvents } = applyChatEvent(get(), message as ChatEvent);
    set(state);
    fileEvents.forEach((f: FileEvent) =>
      window.dispatchEvent(new CustomEvent('fcc:file-modified', { detail: f.path })));
  },
  start: (folder, prompt, resumeSessionId) => {
    const sid = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set({ ...emptyChatState(), activeSessionId: sid, folder });
    void window.fcc.chatStart(sid, folder, prompt, resumeSessionId);
  },
  stop: () => {
    const sid = get().activeSessionId;
    if (sid) void window.fcc.chatStop(sid);
  },
  respond: (requestId, allow) => window.fcc.chatPermission(requestId, allow),
  reset: () => set({ ...emptyChatState(), activeSessionId: null })
}));
```

- [ ] **Step 6: เขียน `ChatPanel.tsx` + sub-components**

`src/renderer/src/components/ChatPanel.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../stores/chat-store';
import { useExplorerStore } from '../stores/explorer-store';
import ChatMessage from './ChatMessage';
import PermissionCard from './PermissionCard';

export default function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const permissions = useChatStore((s) => s.permissions);
  const running = useChatStore((s) => s.running);
  const error = useChatStore((s) => s.error);
  const sessionId = useChatStore((s) => s.sessionId);
  const handleEvent = useChatStore((s) => s.handleEvent);
  const start = useChatStore((s) => s.start);
  const stop = useChatStore((s) => s.stop);
  const root = useExplorerStore((s) => s.root);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.fcc.onChatEvent(({ sessionId: s, message }) => handleEvent(s, message));
  }, [handleEvent]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || !root) return;
    start(root, text);
    setInput('');
  };

  return (
    <div className="chat-pane">
      <div className="chat-header">
        <span>CLAUDE CHAT</span>
        <button onClick={resetChat}>New chat</button>
        {running && <button onClick={stop}>■ Stop</button>}
      </div>
      <div className="chat-messages" ref={scrollRef}>
        {messages.map((m) => <ChatMessage key={m.id} message={m} />)}
        {error && <div className="chat-error">{error}</div>}
      </div>
      <div className="chat-permissions">
        {permissions.map((p) => <PermissionCard key={p.requestId} req={p} />)}
      </div>
      <div className="chat-input">
        {!root && <div className="hint">Open a folder first</div>}
        <textarea
          value={input}
          placeholder="Ask Claude to do something..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={!root}
        />
        <button onClick={send} disabled={!root || !input.trim()}>Send</button>
      </div>
    </div>
  );

  function resetChat() {
    useChatStore.getState().reset();
  }
}
```

`src/renderer/src/components/ChatMessage.tsx`:
```tsx
import type { ChatMessage as Msg } from '../chat/chat-reducer';
import ToolCallCard from './ToolCallCard';

export default function ChatMessage({ message }: { message: Msg }) {
  if (message.role === 'user') {
    return <div className="msg user">{message.text}</div>;
  }
  return (
    <div className="msg assistant">
      <div className="msg-text">{message.text}</div>
      {message.tools.map((t) => <ToolCallCard key={t.tool_use_id} tool={t} />)}
    </div>
  );
}
```

`src/renderer/src/components/ToolCallCard.tsx`:
```tsx
import { useState } from 'react';
import type { ToolCall } from '../chat/chat-reducer';

const ICONS: Record<string, string> = {
  Bash: '💻', Edit: '✏️', Write: '📝', Read: '📖', Glob: '🔎', Grep: '🔍', Task: '📌'
};

export default function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const label = tool.toolName === 'Edit' || tool.toolName === 'Write'
    ? (tool.input as { file_path?: string })?.file_path
    : (tool.input as { command?: string })?.command ?? (tool.input as { pattern?: string })?.pattern ?? '';
  return (
    <div className={`tool-card ${tool.state}`}>
      <div className="tool-line" onClick={() => setOpen(!open)}>
        <span>{ICONS[tool.toolName] ?? '🔧'} {tool.toolName}</span>
        <span className="tool-label">{label}</span>
        <span className="tool-state">{tool.state === 'running' ? '…' : tool.state === 'success' ? '✓' : '✗'}</span>
      </div>
      {open && <pre className="tool-input">{JSON.stringify(tool.input, null, 2)}</pre>}
    </div>
  );
}
```

`src/renderer/src/components/PermissionCard.tsx`:
```tsx
import { useChatStore } from '../stores/chat-store';
import type { PermissionItem } from '../chat/chat-reducer';

export default function PermissionCard({ req }: { req: PermissionItem }) {
  const respond = useChatStore((s) => s.respond);
  const label = req.toolName === 'Bash'
    ? (req.input as { command?: string })?.command
    : (req.input as { file_path?: string })?.file_path ?? '';
  return (
    <div className="permission-card">
      <div className="perm-title">🤖 Claude wants to {req.toolName}</div>
      <pre className="perm-detail">{label || JSON.stringify(req.input, null, 2)}</pre>
      <div className="perm-actions">
        <button className="allow" onClick={() => respond(req.requestId, true)}>Allow</button>
        <button className="deny" onClick={() => respond(req.requestId, false)}>Deny</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: เพิ่ม CSS**

```css
.chat-messages { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.msg { padding: 8px; border-radius: 6px; font-size: 13px; }
.msg.user { background: #0e4d6e; align-self: flex-end; max-width: 90%; }
.msg.assistant { background: #2d2d2d; align-self: stretch; }
.chat-error { color: #ff6b6b; padding: 8px; }
.chat-input { display: flex; gap: 8px; padding: 8px; border-top: 1px solid #333; }
.chat-input textarea { flex: 1; background: #252526; color: #ddd; border: 1px solid #333; border-radius: 4px; resize: none; height: 48px; }
.chat-permissions { border-top: 1px solid #333; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.permission-card { background: #3a2e00; border: 1px solid #665500; border-radius: 6px; padding: 8px; font-size: 13px; }
.perm-actions { display: flex; gap: 8px; margin-top: 6px; }
.allow { background: #1a7f37; color: #fff; }
.deny { background: #a1260d; color: #fff; }
.tool-card { border: 1px solid #444; border-radius: 6px; margin: 4px 0; font-size: 12px; }
.tool-card.running { border-color: #007acc; }
.tool-card.success { border-color: #1a7f37; }
.tool-card.error { border-color: #a1260d; }
.tool-line { display: flex; gap: 8px; padding: 6px 8px; cursor: pointer; align-items: center; }
.tool-label { color: #bbb; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-input { margin: 0; padding: 6px 8px; background: #1a1a1a; overflow: auto; font-size: 11px; }
```

- [ ] **Step 8: Verify (manual)**

Run: `npm run dev`
Checklist:
- เปิดโฟลเดอร์ → พิมพ์ "สร้างไฟล์ hello.ts ที่มี export const hi = 1" → กด Send
- ข้อความ user ปรากฏ → agent เริ่มตอบ (streaming) → การ์ด tool (Write/Edit) แสดง → การ์ด permission ปรากฏพร้อมปุ่ม Allow/Deny
- กด Allow → agent ดำเนินต่อ → ข้อความจบ
- กด Stop กลางคัน → agent หยุด
- ส่งข้อความถัดไป → ต่อบทสนทนาจาก session ก่อน (resume)

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/chat src/renderer/src/stores/chat-store.ts src/renderer/src/components/ChatPanel.tsx src/renderer/src/components/ChatMessage.tsx src/renderer/src/components/ToolCallCard.tsx src/renderer/src/components/PermissionCard.tsx tests/chat-reducer.test.ts
git commit -m "feat: chat panel with streaming, tool cards, permissions"
```

---

### Task 10: Diff View (agent edits → review/accept/revert)

**Files:**
- Create: `src/renderer/src/components/DiffView.tsx`
- Modify: `src/renderer/src/components/Editor.tsx`, `src/renderer/src/stores/editor-store.ts`
- Test: manual checklist

**Interfaces:**
- Consumes: `useEditorStore` (Task 5), event `fcc:file-modified` (dispatch จาก chat-store Task 9), `window.fcc.fsRead/fsWrite` (Task 3)
- Produces: UI ที่ผู้ใช้กด "Review changes" → เห็น Monaco diff (base vs disk) → Accept/Revert

- [ ] **Step 1: เขียน `src/renderer/src/components/DiffView.tsx`**

```tsx
import { DiffEditor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useEffect, useState } from 'react';
import { useEditorStore } from '../stores/editor-store';

loader.config({ monaco });

export default function DiffView({ path, onClose }: { path: string; onClose: () => void }) {
  const base = useEditorStore((s) => s.getBase(path)) ?? '';
  const accept = useEditorStore((s) => s.acceptAgentChange);
  const revert = useEditorStore((s) => s.revertAgentChange);
  const [modified, setModified] = useState('');

  useEffect(() => {
    window.fcc.fsRead(path).then(setModified).catch(() => setModified(base));
  }, [path, base]);

  return (
    <div className="diff-view">
      <div className="diff-header">
        <span>Diff: {path}</span>
        <button onClick={() => accept(path)}>Accept changes</button>
        <button onClick={() => revert(path)}>Revert</button>
        <button onClick={onClose}>Close</button>
      </div>
      <DiffEditor
        original={base}
        modified={modified}
        language="plaintext"
        theme="vs-dark"
        options={{ readOnly: true, minimap: { enabled: false } }}
      />
    </div>
  );
}
```

- [ ] **Step 2: ตรวจ `editor-store.ts` มี `diffPath`/`setDiff`/`markAgentModified`/`acceptAgentChange`/`revertAgentChange` ครบ (เขียนไว้แล้วใน Task 5)**

- [ ] **Step 3: ตรวจ `Editor.tsx` มี diff integration (เขียนไว้แล้วใน Task 5)**

- [ ] **Step 4: Verify (manual)**

Run: `npm run dev`
Checklist:
- สั่ง agent "แก้ hello.ts เพิ่ม function greet" → อนุมัติ → banner "Claude modified this file" โผล่ในแท็บ hello.ts
- กด "Review changes" → diff view แสดง base vs ใหม่
- กด "Revert" → ไฟล์กลับเป็นเดิม; กด "Accept" → เนื้อหาใหม่เป็น base
- กด Close → กลับไป editor ปกติ

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/Editor.tsx src/renderer/src/components/DiffView.tsx src/renderer/src/stores/editor-store.ts
git commit -m "feat: diff review for agent edits"
```

---

### Task 11: Polish + Packaging (Windows installer)

**Files:**
- Modify: `electron-builder.yml` (icon), `package.json` (scripts ครบ)
- Create: `build/icon.ico` (placeholder แล้วค่อยเปลี่ยน), `README.md`
- Test: manual checklist + `npm run smoke`

**Interfaces:**
- Consumes: ทั้งหมดที่ผ่านมา
- Produces: `release/FCC Studio Setup.exe` + คู่มือใช้งานสั้นใน README

- [ ] **Step 1: ตรวจ `package.json` scripts ครบ**

```json
"scripts": {
  "dev": "electron-vite dev",
  "build": "electron-vite build",
  "preview": "electron-vite preview",
  "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
  "test": "vitest run",
  "smoke": "node smoke/sdk-smoke.mjs",
  "postinstall": "electron-builder install-app-deps",
  "dist:win": "electron-vite build && electron-builder --win nsis"
}
```

- [ ] **Step 2: สร้าง icon**

สร้าง `build/icon.ico` (อย่างน้อย 256x256, ICO multi-size) — วางไฟล์ placeholder ก่อน แล้วให้ผู้ใช้เปลี่ยนภายหลัง.

- [ ] **Step 3: เขียน `README.md`**

สรุป: สิ่งที่ต้องมีก่อนรัน (FCC + claude ใน PATH), `npm install`, `npm run dev`, `npm run dist:win`, วิธีใช้ (เปิดโฟลเดอร์ → chat → อนุมัติ → diff → terminal), สถาปัตยกรรม 1 ย่อหน้า.

- [ ] **Step 4: Run smoke + test + typecheck**

Run: `npm run smoke` → SMOKE OK
Run: `npm test` → ทุก test ผ่าน
Run: `npm run typecheck` → ไม่มี error

- [ ] **Step 5: Build installer**

Run: `npm run dist:win`
Expected: ได้ `release/FCC Studio Setup.exe` (NSIS installer)
หมายเหตุ: node-pty เป็น native module — `postinstall` (`electron-builder install-app-deps`) rebuild ให้ตรง ABI ของ Electron โดยอัตโนมัติ. ถ้า error เรื่อง ABI ให้รัน `npx electron-rebuild -f -w node-pty` ก่อน build.

- [ ] **Step 6: Verify installer (manual)**

Checklist:
- รัน `release/FCC Studio Setup.exe` → ติดตั้งลง Program Files ได้
- เปิด FCC Studio จาก Start menu → เปิดโฟลเดอร์ → chat กับ agent → terminal รัน fcc-claude ได้
- (บันทึกผลใน README หรือ release notes)

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: package windows installer and docs"
```

---

## Manual E2E Checklist (รันก่อนประกาศเสร็จ)

- [ ] เปิดแอป → เปิดโฟลเดอร์โปรเจกต์ → explorer แสดงไฟล์
- [ ] เปิดไฟล์ → แก้ → Ctrl+S → บันทึก
- [ ] Terminal พิมพ์คำสั่งได้, "Run fcc-claude here" ทำงาน
- [ ] Status bar: FCC online/offline ถูกต้อง, Start server ทำงาน
- [ ] Chat: ส่งข้อความ → streaming → tool card → อนุมัติ → เสร็จ
- [ ] Agent แก้ไฟล์ → banner → diff → accept/revert
- [ ] ปิด/เปิดแอป → session chat ต่อเนื่อง (resume)
- [ ] `npm run smoke` / `npm test` / `npm run typecheck` ผ่าน
- [ ] Installer `Setup.exe` ติดตั้งและใช้งานได้

## Self-Review (ทำตอนจบ plan)

1. **Spec coverage:** ทุก § ใน design spec มี task ครอบคลุม (explorer/editor/diff = T2-T5, T10 · terminal = T6 · fcc = T7 · chat = T8-T9 · packaging = T11 · testing = กระจายทุก task + smoke)
2. **Placeholder scan:** ไม่มี TODO/TBD; โค้ดทุกขั้นเขียนจริง (ข้อยกเว้นที่ระบุชัด: ไฟล์ icon เป็น placeholder ให้ผู้ใช้เปลี่ยน)
3. **Type consistency:** `window.fcc.*` ตรงกันทั้ง preload/renderer; `applyChatEvent`/`PermissionGate`/`isInside` ถูกเรียกด้วย signature เดียวกันตลอด plan; event names (`chat:event`, `fcc:file-modified`) ตรงกันทั้ง main-renderer-reducer
