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
    const req = net.request({ url: `${FCC_BASE_URL}/health` });
    const timer = setTimeout(() => {
      req.abort();
      resolve(false);
    }, 2000);
    req.on('response', () => {
      clearTimeout(timer);
      resolve(true);
    });
    req.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    req.on('abort', () => {
      clearTimeout(timer);
      resolve(false);
    });
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
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
