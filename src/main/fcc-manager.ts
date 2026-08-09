import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { net, type BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import { log } from './logger';
import type { FccInstallStatus, FccStatus } from '@shared/types';

export const FCC_PORT = Number(process.env.FCC_PORT ?? 8082);
export const FCC_BASE_URL = process.env.FCC_BASE_URL ?? `http://127.0.0.1:${FCC_PORT}`;
export const FCC_AUTH_TOKEN = process.env.FCC_AUTH_TOKEN ?? 'freecc';

/**
 * Decide the install state from gathered facts. Pure so it is unit-testable
 * without spawning anything.
 */
export function classifyInstall(opts: {
  override: string | null;
  localPath: string;
  localPathExists: boolean;
  onPath: string | null;
}): Pick<FccInstallStatus, 'installed' | 'serverPath' | 'reason'> {
  if (opts.override) return { installed: true, serverPath: opts.override, reason: 'installed' };
  if (opts.localPathExists) {
    return {
      installed: true,
      serverPath: opts.localPath,
      reason: opts.onPath ? 'installed' : 'path-missing'
    };
  }
  if (opts.onPath) return { installed: true, serverPath: opts.onPath, reason: 'installed' };
  return { installed: false, serverPath: null, reason: 'missing' };
}

/** Run a short, harmless command (where/which/python --version/uv --version) with a timeout. */
function probe(cmd: string, args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch {
      resolve({ code: null, out: '' });
      return;
    }
    let out = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* already gone */ }
      resolve({ code: null, out });
    }, 3000);
    child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', () => { clearTimeout(timer); resolve({ code: null, out }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

function probeOnPath(cmd: string): Promise<string | null> {
  return probe(process.platform === 'win32' ? 'where' : 'which', [cmd]).then(({ code, out }) => {
    if (code !== 0) return null;
    return out.trim().split(/\r?\n/)[0]?.trim() || null;
  });
}

async function probePythonVersion(): Promise<string | null> {
  const { out } = await probe(process.platform === 'win32' ? 'python' : 'python3', ['--version']);
  const m = out.match(/Python\s+(\d+\.\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

async function probeUv(): Promise<boolean> {
  return (await probe('uv', ['--version'])).code === 0;
}

/**
 * Detect whether free-claude-code (fcc-server) is installed. Resolves the
 * binary without executing the server: explicit FCC_SERVER_BIN override, then
 * the uv-managed ~/.local/bin install dir, then the PATH. Python 3.14 + uv are
 * probed too so the setup guide can tailor its message.
 */
export async function detectInstall(): Promise<FccInstallStatus> {
  const [pythonVersion, hasUv, onPath] = await Promise.all([
    probePythonVersion(),
    probeUv(),
    probeOnPath('fcc-server')
  ]);
  const override =
    process.env.FCC_SERVER_BIN && existsSync(process.env.FCC_SERVER_BIN) ? process.env.FCC_SERVER_BIN : null;
  const localPath = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'fcc-server.exe' : 'fcc-server');
  const classified = classifyInstall({
    override,
    localPath,
    localPathExists: existsSync(localPath),
    onPath
  });
  return { ...classified, pythonVersion, hasUv };
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastStatus: FccStatus = { online: false, port: FCC_PORT };
/** PID of the fcc-server this app spawned (null when it's not ours, e.g. the
 *  FCC tray app started it). Only our own server gets a Stop button. */
let managedPid: number | null = null;

/** True while the target pid still exists as a process (works on win32 too:
 *  kill(pid, 0) signals nothing but still probes liveness — EPERM means alive). */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/** Whether the health poll outcome drops our ownership of the fcc-server we
 *  spawned. Only a confirmed-dead process counts — a mere offline (timeout,
 *  slow boot, busy server) must keep the pid so Stop/quit cleanup still works. */
export function shouldClearManagedPid(ok: boolean, pid: number | null): boolean {
  return !ok && pid !== null && !processAlive(pid);
}
/** True while our spawn is booting — the status bar shows "Starting…" instead
 *  of "offline" until the first healthy /health. */
let starting = false;

export function buildStatus(ok: boolean, port: number): FccStatus {
  return { online: ok, port, managed: managedPid !== null, starting };
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
  // If it's offline, drop our ownership of the process only when it is actually
  // gone. A failed poll here is indistinguishable from the server being busy
  // (slow boot, load spike, sleep/resume); clearing managedPid on a timeout made
  // the Stop button vanish permanently and our own detached server leak past
  // app quit (stopServer would no-op on a null pid).
  if (shouldClearManagedPid(ok, managedPid)) managedPid = null;
  // Log a change of state (avoids a line every 5s poll when it's stable).
  if (ok !== lastStatus.online) log.info('fcc', ok ? 'server online' : 'server offline');
  lastStatus = buildStatus(ok, FCC_PORT);
  return lastStatus;
}

export async function startServer(win?: BrowserWindow): Promise<FccStatus> {
  const before = await checkHealth();
  if (!before.online) {
    const inst = await detectInstall();
    // Not installed: don't spawn a phantom command — return offline and let
    // the renderer route to the setup guide.
    if (!inst.installed) return buildStatus(false, FCC_PORT);
    const bin = inst.serverPath ?? 'fcc-server';
    // Push "starting" immediately so the status bar shows the boot in progress
    // instead of a misleading "offline" during the spawn delay.
    starting = true;
    if (win) win.webContents.send(IPC.evtFcc, buildStatus(false, FCC_PORT));
    const child = spawn(bin, [], { detached: true, stdio: 'ignore', windowsHide: true });
    // Missing/invalid binary shouldn't crash the app — the 5s health poll
    // simply keeps reporting offline.
    child.on('error', () => {});
    child.unref();
    // We own this child from the moment it spawns — a cold uv/Python start can
    // outlive the boot loop below, and ownership must not depend on the server
    // coming online within 5s or the Stop button / quit-cleanup would no-op.
    managedPid = child.pid ?? null;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const s = await checkHealth();
      if (s.online) {
        starting = false;
        // Rebuild so the just-set managed flag is reflected immediately.
        const f = buildStatus(true, FCC_PORT);
        if (win) win.webContents.send(IPC.evtFcc, f);
        return f;
      }
    }
    starting = false;
  }
  return lastStatus;
}

/** Stop the fcc-server this app spawned. A server the tray app started is not
 *  ours to kill — managedPid is only ever set by startServer. */
export async function stopServer(): Promise<FccStatus> {
  const pid = managedPid;
  managedPid = null;
  starting = false;
  if (pid !== null) {
    if (process.platform === 'win32') {
      // Detached so the kill survives an app quit mid-taskkill.
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
    } else {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
    }
  }
  return checkHealth();
}

/** One-shot on app launch: spawn fcc-server in the background when installed
 *  and offline, so the app is chat-ready without the user starting anything. */
export function autoStartServer(win: BrowserWindow): void {
  // startServer pushes both the "starting" and final status events itself.
  void startServer(win);
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
