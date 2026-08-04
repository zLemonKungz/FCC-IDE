// history.ts — chat transcript persistence for the History tab.
//
// Conversations are recorded in-memory as events stream through the ChatHost
// (one `record()` per emitted event) and flushed to disk as JSON files at
// `app.getPath('userData')/sessions/<sessionId>.json`. Files are the source of
// truth for the history list, so they survive a renderer reload / app restart.
//
// `app` is only importable in the main process; like cli-runner.ts we guard it,
// so tests can point at a temp dir via setHistoryDir() and never touch it.
import { app } from 'electron';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { HistoryMessage, HistoryRecord, HistorySummary } from '@shared/types';

const TITLE_MAX = 80;

/** A conversation being accumulated; undefined once flushed. */
interface Active {
  folder: string;
  title: string;
  cliSessionId: string | null;
  messages: HistoryMessage[];
  createdAt: number;
  updatedAt: number;
}

const active = new Map<string, Active>();

/** Test hook: point persistence at a temp dir (mirrors file-service.setRoot). */
let historyDir: string | null = null;
export function setHistoryDir(dir: string | null): void {
  historyDir = dir;
}

function dir(): string {
  if (historyDir) return historyDir;
  return join(app.getPath('userData'), 'sessions');
}

/** Renderer sessionIds are s-<ts>-<rand>; never trust an arbitrary id in a path. */
const SAFE_ID = /^[A-Za-z0-9._-]+$/;
function safePath(id: string): string | null {
  return SAFE_ID.test(id) ? join(dir(), `${id}.json`) : null;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(dir(), { recursive: true });
}

/** Start a fresh conversation record for a renderer sessionId. */
export function begin(sessionId: string, folder: string): void {
  const now = Date.now();
  active.set(sessionId, {
    folder,
    title: '',
    cliSessionId: null,
    messages: [],
    createdAt: now,
    updatedAt: now
  });
}

/** Fold one chat event into the active record. Called from the ChatHost emit
 *  funnel, so it sees synthetic 'user-message' events and raw CLI events. */
export function record(sessionId: string, msg: unknown): void {
  const rec = active.get(sessionId);
  if (!rec) return;
  const m = msg as { type?: string; message?: { content?: unknown[] } };
  switch (m.type) {
    case 'user-message': {
      const text = String((m as { text?: string }).text ?? '');
      if (text) {
        if (!rec.title) rec.title = text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX)}…` : text;
        rec.messages.push({ role: 'user', text });
      }
      break;
    }
    case 'assistant': {
      const blocks = (m.message?.content ?? []) as { type?: string; text?: string }[];
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
      if (!text) break;
      const last = rec.messages[rec.messages.length - 1];
      // Merge streamed chunks into one assistant message (matches the reducer).
      if (last && last.role === 'assistant') last.text += text;
      else rec.messages.push({ role: 'assistant', text });
      break;
    }
    case 'session-id': {
      const id = (m as { session_id?: string }).session_id;
      if (id) rec.cliSessionId = id;
      break;
    }
    case 'result':
      // A turn finished — persist so a crash loses at most the in-flight turn.
      void flush(sessionId);
      break;
    default:
      break;
  }
}

async function persist(rec: Active, id: string): Promise<void> {
  const out: HistoryRecord = { id, ...rec };
  try {
    await ensureDir();
    await fs.writeFile(safePath(id)!, JSON.stringify(out, null, 2), 'utf-8');
  } catch {
    // best-effort — never let a history write fail a chat turn
  }
}

/** Persist one conversation now. */
export async function flush(sessionId: string): Promise<void> {
  const rec = active.get(sessionId);
  if (!rec) return;
  rec.updatedAt = Date.now();
  await persist(rec, sessionId);
}

/** Persist every live conversation (app quit / starting a new chat). */
export function flushAll(): void {
  for (const [id, rec] of active) {
    void persist(rec, id);
  }
}

/** List saved conversations, newest first; corrupt files are skipped. */
export async function list(): Promise<HistorySummary[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir());
  } catch {
    return []; // no sessions dir yet
  }
  const summaries: HistorySummary[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const rec = await read(name.slice(0, -'.json'.length));
    if (!rec) continue;
    summaries.push({ id: rec.id, title: rec.title, folder: rec.folder, createdAt: rec.createdAt, updatedAt: rec.updatedAt });
  }
  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Read one conversation; null when missing or corrupt. */
export async function read(id: string): Promise<HistoryRecord | null> {
  const p = safePath(id);
  if (!p) return null;
  try {
    const raw = await fs.readFile(p, 'utf-8');
    const parsed = JSON.parse(raw) as HistoryRecord;
    if (!parsed || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Delete one conversation file (and any live record for it). */
export async function remove(id: string): Promise<void> {
  active.delete(id);
  const p = safePath(id);
  if (!p) return;
  try {
    await fs.rm(p, { force: true });
  } catch {
    // already gone
  }
}
