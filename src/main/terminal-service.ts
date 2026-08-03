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
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
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
