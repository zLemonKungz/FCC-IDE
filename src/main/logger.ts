// logger.ts — a tiny append-only file logger for the main process, writing to
// `app.getPath('userData')/logs/app.log`. Stdlib only (no dependency). Rotates
// when the log grows past 5 MB (keeps app.log + one .old). Everything is
// best-effort — a logger must never throw into the app's real control flow.
//
// Why files: crashes (uncaughtException / renderer reload) and silent IPC
// failures leave no trace otherwise; a plain text log in the app data dir is
// the cheapest recoverable record, as the user asked.
//
// Efficiency: rotation is driven by `stream.bytesWritten` (in-memory) plus one
// `fs.stat` at open to capture the pre-existing file size — the append path does
// zero syscalls. No per-line stat, no detached concurrent rotations.

import { app } from 'electron';
import { promises as fs, createWriteStream, type WriteStream } from 'fs';
import { join } from 'path';
import { collectSecrets, redactSecrets } from './redact';

const MAX_BYTES = 5 * 1024 * 1024;

let dir: string | null = null;
let stream: WriteStream | null = null;
let opening: Promise<void> | null = null;
/** Exact env secrets to scrub from every written line (captured at load). */
const SECRETS = collectSecrets();
/** size already in app.log when the stream opened (pre-existing bytes). */
let baseBytes = 0;

function logDir(): string {
  if (!dir) dir = join(app.getPath('userData'), 'logs');
  return dir;
}

/** Test hook: point the log at a temp dir instead of userData. */
export function setLogDir(d: string | null): void {
  dir = d;
  stream = null;
  baseBytes = 0;
}

async function ensureOpen(): Promise<void> {
  if (stream || opening) return;
  opening = (async () => {
    try {
      await fs.mkdir(logDir(), { recursive: true });
      const f = join(logDir(), 'app.log');
      baseBytes = (await fs.stat(f).catch(() => null))?.size ?? 0;
      stream = createWriteStream(f, { flags: 'a', encoding: 'utf8' });
    } catch {
      /* never crash */
    } finally {
      opening = null;
    }
  })();
  await opening;
}

/** Rotate when big: keep app.log.old as a backup of the previous chunk, reopen
 *  app.log fresh. Guarded so concurrent calls are harmless (best-effort). */
async function rotate(): Promise<void> {
  if (!stream) return;
  const old = join(logDir(), 'app.log.old');
  await fs.rm(old, { force: true }).catch(() => undefined);
  await fs.rename(join(logDir(), 'app.log'), old).catch(() => undefined);
  stream.end();
  stream = null;
  baseBytes = 0;
  await ensureOpen();
}

/** Append one line. `level` ∈ info|warn|error. Timestamped, ISO + ms. */
async function logLine(level: 'info' | 'warn' | 'error', scope: string, message: string, extra?: unknown): Promise<void> {
  await ensureOpen().catch(() => undefined);
  if (!stream) return;
  const ts = new Date().toISOString();
  const detail = extra === undefined ? '' : '  ' + safeJSON(extra);
  const line = `${ts} [${level.toUpperCase()}] [${scope}] ${message}${detail}\n`;
  // Strip env-derived secrets + known token shapes before it touches disk.
  const safe = redactSecrets(line, SECRETS);
  // Rotate before the write when the total (pre-existing + streamed) exceeds
  // the cap — single in-memory check, no fs.stat on the common path.
  if (baseBytes + stream.bytesWritten + safe.length > MAX_BYTES) {
    await rotate().catch(() => undefined);
    if (!stream) return;
  }
  stream.write(safe);
}

function safeJSON(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return typeof s === 'string' ? s.slice(0, 2000) : String(v);
  } catch {
    return String(v);
  }
}

// ---- convenient log object (log.info / log.warn / log.error) ----
export const log = {
  info: (scope: string, message: string, extra?: unknown): void => void logLine('info', scope, message, extra),
  warn: (scope: string, message: string, extra?: unknown): void => void logLine('warn', scope, message, extra),
  error: (scope: string, message: string, extra?: unknown): void => void logLine('error', scope, message, extra)
};

/** Wire global crash handlers + a renderer error IPC. Call once at startup. */
export function initLogging(): void {
  process.on('uncaughtException', (err) => {
    log.error('process', 'uncaughtException', { message: err?.message ?? String(err), stack: err?.stack?.slice(0, 2000) });
  });
  process.on('unhandledRejection', (reason) => {
    log.error('process', 'unhandledRejection', { message: (reason as Error)?.message ?? String(reason), stack: (reason as Error)?.stack?.slice(0, 2000) });
  });
}

/** IPC handler for renderer-side events (window.onerror / unhandledrejection /
 *  forwarded by the preload). `_ev` is the ipc invoke event (unused). */
export async function handleRendererError(_ev: unknown, payload: unknown): Promise<void> {
  const p = (payload ?? {}) as { type?: string; message?: string; stack?: string; source?: string };
  log.error(p.source ? `renderer:${p.source}` : 'renderer', p.message ?? p.type ?? 'unknown', p.stack ? { stack: p.stack.slice(0, 2000) } : undefined);
}

/** Path of the current log file (not exposed via IPC — for future Help/About). */
export function logFilePath(): string {
  return join(logDir(), 'app.log');
}
