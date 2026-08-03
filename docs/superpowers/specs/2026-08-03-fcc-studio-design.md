# Design: "FCC Studio" — IDE สำหรับ free-claude-code

วันที่: 2026-08-03
สถานะ: **อนุมัติแล้ว** (ผู้ใช้ตอบ "ok" หลังนำเสนอ design)

## 1. ภาพรวม (Overview)

แอปเดสก์ท็อปคล้าย VS Code (แต่ไม่เยอะเท่า) ที่รวมการใช้งาน **free-claude-code (FCC)** ไว้ในที่เดียว —
แทนที่ workflow ปกติที่ต้องเปิด terminal แล้วรัน `fcc-claude` แยก FCC Studio ให้:

- **File explorer** — เปิดโฟลเดอร์ ดู/แก้ไฟล์
- **Code editor** — Monaco editor (ตัวเดียวกับที่ VS Code ใช้)
- **Chat panel** — คุยกับ Claude แบบ UI ผ่าน proxy ของ FCC (agent loop เต็มรูปแบบ)
- **Integrated terminal** — terminal ในตัว รัน `fcc-claude` ได้จากปุ่มเดียว
- **FCC integration** — ตรวจ/เริ่ม FCC server อัตโนมัติ

ผู้ใช้เปิดโฟลเดอร์โปรเจกต์ → สั่ง agent ใน chat panel → อนุมัติการแก้ไฟล์ → เห็น diff → รัน/ทดสอบใน terminal — ทุกอย่างในแอปเดียว

## 2. เทคโนโลยี (Tech Stack)

| ชั้น | เทคโนโลยี |
|---|---|
| Shell | Electron (latest stable) |
| UI | React 19 + TypeScript + Vite |
| Editor | Monaco (`@monaco-editor/react`) |
| Terminal | xterm.js + `node-pty` (native module — ต้อง `@electron/rebuild` ตอน build) |
| Chat engine | `@anthropic-ai/claude-agent-sdk` (spawn `claude` CLI, ชี้ไปที่ FCC proxy) |
| State | Zustand (4 stores: explorer, editor, chat, fcc) |
| Packaging | electron-builder (NSIS → Windows `.exe` installer) |

### ข้อกำหนดสภาพแวดล้อม (พิสูจน์แล้วบนเครื่อง dev นี้)
- `fcc-server.exe` / `fcc-claude.exe` / `claude.exe` อยู่ใน PATH (`~/.local/bin/`)
- FCC server รันที่ `http://127.0.0.1:8082` — auth token: `freecc`
- **Spike ที่พิสูจน์แล้ว:** Agent SDK + env `ANTHROPIC_BASE_URL=http://127.0.0.1:8082` + `ANTHROPIC_AUTH_TOKEN=freecc` ตอบสนองได้ครบ (streaming + tool use bash) — ไฟล์อ้างอิง: `~/fcc-spike/spike.mjs`

## 3. สถาปัตยกรรม (Architecture)

```
┌──────────────────────────────────────────────────────────────┐
│  Electron MAIN process (Node.js)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ File service │  │ Terminal svc │  │ Chat engine          │ │
│  │ (fs ops)     │  │ (node-pty)   │  │ (Agent SDK → spawn   │ │
│  │              │  │              │  │  claude → FCC proxy) │ │
│  └──────────────┘  └──────────────┘  └─────────────────────┘ │
│  ┌──────────────┐                                             │
│  │ FCC manager  │ ── health check / start fcc-server ──────── │
│  └──────────────┘                                             │
└────────────────────────────────┬──────────────────────────────┘
                                 │ IPC (contextBridge — typed API)
┌────────────────────────────────▼──────────────────────────────┐
│  Renderer process (React + TS + Zustand)                      │
│  ┌──────────┬───────────────┬──────────────┐                  │
│  │ Explorer │  Editor       │  Chat panel  │                  │
│  │ ต้นไม้ไฟล์ │  (Monaco)     │  (messages,   │                  │
│  │          │  + tabs       │   streaming,  │                  │
│  │          │  + diff view  │   tool cards, │                  │
│  │          │               │   permission) │                  │
│  ├──────────┴───────────────┴──────────────┤                  │
│  │  Terminal (xterm.js)  +  Status bar (FCC status)           │
│  └──────────────────────────────────────────┘                 │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 เหตุผลที่ Chat engine อยู่ใน main process
- `node-pty` (native module) ต้องรันใน main process
- Agent SDK spawn `claude` CLI เป็น child process — จัดการจาก main ได้ตรง
- Renderer แยก sandbox เต็มที่ (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`) — renderer ไม่มี Node access ตรงๆ ทุกอย่างผ่าน IPC ผ่าน preload ที่แคบและ typed

### 3.2 การเชื่อมต่อกับ FCC
- Chat: ตั้ง env `ANTHROPIC_BASE_URL=http://127.0.0.1:8082` + `ANTHROPIC_AUTH_TOKEN=freecc` ตอนเรียก `query()` ของ SDK
- **Model ที่ส่งไปใน query:** default `claude-haiku-4-5-20251001` — FCC จะ route ตาม tier ที่ตั้งใน Admin UI (`MODEL_HAIKU` หรือ fallback `MODEL`) โดยอัตโนมัติ แอป v1 ไม่ต้องเลือก model เอง (ค่า default เก็บเป็น constant แก้ไขง่าย)
- Terminal "รัน fcc-claude ที่นี่": spawn `fcc-claude` ใน pty (ใช้ config ของ FCC ที่มีอยู่)
- FCC manager: poll health ที่ 8082; ถ้าไม่รัน เสนอปุ่ม start `fcc-server`; ถ้าไม่ติดตั้ง แสดงคำแนะนำการติดตั้ง

## 4. ขอบเขตฟีเจอร์ (Scope)

### 4.1 มี (in scope)
| โมดูล | ความสามารถ |
|---|---|
| **File explorer** | เปิดโฟลเดอร์ (dialog), ต้นไม้ไฟล์ (ข้าม node_modules/.git), สร้าง/เปลี่ยนชื่อ/ลบไฟล์-โฟลเดอร์, refresh |
| **Editor** | Monaco, แท็บหลายไฟล์, indicator unsaved, Ctrl+S, syntax highlight ภาษาทั่วไป |
| **Diff view** | เมื่อ agent แก้ไฟล์ — แสดง Monaco diff editor + ปุ่ม accept/revert |
| **Chat panel** | รายการข้อความ + streaming, การ์ด tool call (แสดง tool + argument + สถานะ), ปุ่มอนุมัติ/ปฏิเสธสิทธิ์, session ต่อเนื่องต่อโฟลเดอร์, ปุ่มหยุด (abort), เริ่มใหม่/ต่อบทสนทนาก่อนหน้า |
| **Terminal** | xterm.js, หลายแท็บ, shell เริ่มต้นของ Windows, ปุ่ม "รัน fcc-claude ที่นี่", cwd = โฟลเดอร์โปรเจกต์ |
| **FCC status** | indicator ใน status bar (เขียว=ออนไลน์/แดง=ออฟไลน์), ปุ่มเริ่ม server |
| **จำค่า** | โฟลเดอร์สุดท้าย, แท็บที่เปิด, session id ของ chat (JSON ใน appData) |

### 4.2 ไม่มีใน v1 (YAGNI — ตัดออก)
- Extensions / marketplace
- Git integration panel
- Debugger
- Model picker ในแอป (FCC Admin UI ควบคุม model อยู่แล้ว — เปิดใน browser แยก)
- ฝัง Admin UI ของ FCC
- i18n / หลายธีม (dark/light พื้นฐานเท่านั้น)
- Multi-window

## 5. ระบบสิทธิ์ agent (Permission System)

**อัปเดตหลัง spike #2 (verified):** `canUseTool` callback ของ Agent SDK **ไม่ทำงาน** ผ่าน FCC proxy + claude CLI 2.1.220 (bridge ไม่ fire เลย — ทดสอบแล้วว่า deny ก็ไม่ถูกเรียก) ดังนั้น v1 ใช้:

- `permissionMode: 'acceptEdits'` — tool แก้ไฟล์ (Edit/Write) ผ่านอัตโนมัติ
- ผู้ใช้ review การแก้ไขผ่าน **Diff view** (Task 10) แล้ว Accept/Revert แทนปุ่มอนุมัติราย tool
- Tool card ใน chat แสดงสถานะ running/success/error ของทุก tool (รวม Bash)

**หมายเหตุ:** ถ้า SDK/CLI เวอร์ชันอนาคตซ่อม `canUseTool` bridge (return type `Promise<PermissionResult | null>`) ให้กลับมาใช้ปุ่ม Allow/Deny ได้ — โครงสร้าง event/reducer รองรับอยู่แล้ว

## 6. Data Flow

- **ไฟล์:** renderer → IPC (`fs:readFile`/`fs:writeFile`/`fs:list`/…) → main อ่าน/เขียนจริง → ส่งผลกลับ; main ตรวจ path (realpath, จำกัดในโฟลเดอร์ที่เปิด)
- **Chat:** renderer ส่ง `chat:start {folder, prompt, resumeSessionId?}` → main spawn SDK query → main stream `chat:event` (SDK message types: assistant text, tool_use, result, …) → renderer เรนเดอร์
- **Permission:** ตาม §5
- **Terminal:** main เป็นเจ้าของ pty process; `term:data`/`term:resize` สองทางผ่าน IPC
- **FCC status:** main poll health ทุก N วินาที → `fcc:status` → status bar

## 7. ความปลอดภัย (Security)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- preload expose API ที่แคบและ typed (ไม่ expose `ipcRenderer` ตรงๆ)
- ไม่โหลด remote content
- main validate path ทั้งหมดที่รับจาก IPC

## 8. การจัดการข้อผิดพลาด (Error Handling)

| สถานการณ์ | พฤติกรรม |
|---|---|
| FCC server ไม่ออนไลน์ | Chat panel แสดงข้อความชัด + ปุ่ม "เริ่ม FCC server" / Terminal ยังใช้ได้ |
| Provider error (คีย์หมด/quota/ถูกปฏิเสธ) | error จาก SDK result แสดงใน chat UI เป็นข้อความอ่านง่าย |
| Agent process crash | แบนเนอร์ error + ปุ่มเริ่มใหม่ |
| `claude` binary ไม่เจอ | หน้าตั้งค่าแนะนำวิธีติดตั้ง (พร้อมคำสั่ง) |
| node-pty spawn ล้ม | แสดง error ในแท็บ terminal |

## 9. การทดสอบ (Testing)

- **Smoke test:** สคริปต์ spike (`smoke/sdk-smoke.mjs`) รัน `npm run smoke` — ยืนยัน SDK↔FCC ยังทำงานหลังแก้โค้ด
- **Unit (เบาๆ):** vitest — reducer ของ chat events, logic อนุมัติสิทธิ์, ตรวจ path ใน main
- **Manual checklist:** เปิดโฟลเดอร์ → สั่ง agent แก้ไฟล์ → อนุมัติ → เห็น diff → accept → รันใน terminal → ปิด/เปิดแอป session ต่อเนื่อง

## 10. ลำดับการสร้าง (Build Order — 7 ขั้น)

1. **Scaffold** — Electron + Vite + React + TS, secure webPreferences, IPC skeleton, Zustand, project layout
2. **Explorer + Editor** — ต้นไม้ไฟล์, Monaco, แท็บ, บันทึก, diff view เบื้องต้น
3. **Terminal** — xterm.js + node-pty, หลายแท็บ, "รัน fcc-claude ที่นี่"
4. **FCC integration** — health check, status bar, start/stop server
5. **Chat panel (ใหญ่สุด)** — SDK host ใน main + IPC stream → รายการข้อความ + streaming → การ์ด tool → ระบบอนุมัติ → session/resume → ปุ่มหยุด
6. **Diff review** — มุมมอง diff ของการแก้ไข agent + accept/revert
7. **Polish + Packaging** — icon, electron-builder → installer, smoke test script

## 11. ความเสี่ยงที่รู้ตัว (Risks / Unknowns)

1. **Async `canUseTool`** — ต้องยืนยันว่า SDK รองรับการรอผู้ใช้กลางคัน (fallback: permission-prompt stream)
2. **Claude Code อ่าน config `~/.claude` ของผู้ใช้** — hooks/settings อาจแทรกแซง; ทดสอบและกันออกตอนทำ chat panel (เช่น ตั้ง env/setting sources แยก)
3. **node-pty native build** — ต้อง `@electron/rebuild` ตรง ABI ของ Electron (electron-builder จัดการได้)
4. **SDK version vs `claude` CLI version** — pin เวอร์ชันและทดสอบคู่กัน (smoke test)
5. **FCC proxy auth token** — default `freecc`; ถ้าผู้ใช้ตั้ง token อื่นใน Admin UI ต้องอ่านได้ (config/setting ใน app)

## 12. การอ้างอิง (References)

- Repo: https://github.com/Alishahryar1/free-claude-code
- Spike ที่พิสูจน์แล้ว: `~/fcc-spike/spike.mjs` (Agent SDK ↔ FCC proxy)
- Env ที่ใช้: `ANTHROPIC_BASE_URL=http://127.0.0.1:8082`, `ANTHROPIC_AUTH_TOKEN=freecc`, `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`
