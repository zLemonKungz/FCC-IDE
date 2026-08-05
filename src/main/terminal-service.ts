import * as pty from 'node-pty';
import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';

const terminals = new Map<number, pty.IPty>();
let nextId = 1;

// Per-terminal scrollback tail (last ~8KB of output) so the chat can @Terminal /
// Fix an error without the renderer buffering everything. lastActiveId picks the
// most recently written terminal when no id is given.
const recent = new Map<number, string>();
const RECENT_MAX = 8192;
let lastActiveId: number | null = null;

function defaultShell(): string {
  if (process.platform === 'win32') return process.env.ComSpec ?? 'powershell.exe';
  return process.env.SHELL ?? '/bin/bash';
}

export function createTerminal(win: BrowserWindow, cwd: string): number {
  const id = nextId++;
  const term = pty.spawn(defaultShell(), [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: process.env as Record<string, string>
  });
  term.onData((data) => {
    recent.set(id, ((recent.get(id) ?? '') + data).slice(-RECENT_MAX));
    lastActiveId = id;
    win.webContents.send(IPC.evtTerm, id, data);
  });
  term.onExit(() => {
    terminals.delete(id);
    recent.delete(id);
    if (lastActiveId === id) lastActiveId = null;
  });
  recent.set(id, '');
  terminals.set(id, term);
  return id;
}

/** Last ~8KB of a terminal's output (the most recently written when id is
 *  omitted) — used by @Terminal context and the terminal error Fix button. */
export function recentOutput(id?: number): string {
  const key = id ?? lastActiveId;
  return key === null ? '' : (recent.get(key) ?? '');
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
