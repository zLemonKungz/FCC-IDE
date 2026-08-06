// Import Claude Code CLI history (~/.claude/projects/<encoded-folder>/*.jsonl)
// so conversations you had in a terminal can be opened and resumed from the
// app's History tab. The transcript is the CLI's stream-json shape — same as
// our chat events — and the sessionId (the filename) is a valid `--resume` id.

import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { HistoryMessage, HistoryRecord, HistorySummary } from '@shared/types';

const TITLE_MAX = 80;
const ROOT = join(homedir(), '.claude', 'projects');

/** id (filename without .jsonl) -> full path of the transcript. Built lazily. */
let index: Map<string, string> | null = null;

async function buildIndex(): Promise<Map<string, string>> {
  if (index) return index;
  const map = new Map<string, string>();
  try {
    const dirs = await fs.readdir(ROOT, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      let files: string[];
      try {
        files = await fs.readdir(join(ROOT, d.name));
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        map.set(f.slice(0, -'.jsonl'.length), join(ROOT, d.name, f));
      }
    }
  } catch {
    /* no ~/.claude — empty */
  }
  index = map;
  return map;
}

interface Parsed {
  folder: string;
  title: string;
  messages: HistoryMessage[];
}

/** Walk one transcript: cwd from the first event that carries it, title = first
 *  user message, plus user/assistant text for the transcript. */
async function parse(file: string): Promise<Parsed | null> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
  let folder = '';
  const messages: HistoryMessage[] = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let ev: {
      type?: string;
      cwd?: string;
      message?: { content?: unknown; role?: string };
    };
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (!folder && ev.cwd) folder = ev.cwd;
    if (ev.type === 'user') {
      const text = typeof ev.message?.content === 'string' ? ev.message.content : '';
      if (text.trim()) messages.push({ role: 'user', text });
    } else if (ev.type === 'assistant') {
      const blocks = (ev.message?.content as { type?: string; text?: string }[] | undefined) ?? [];
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
      if (text.trim()) messages.push({ role: 'assistant', text });
    }
  }
  if (messages.length === 0) return null;
  const first = messages[0].text.trim();
  return {
    folder: folder || ROOT,
    title: first.length > TITLE_MAX ? `${first.slice(0, TITLE_MAX)}…` : first,
    messages
  };
}

/** All Claude Code CLI sessions, newest first. */
export async function listClaude(): Promise<HistorySummary[]> {
  const map = await buildIndex();
  const out: HistorySummary[] = [];
  for (const [id, file] of map) {
    const p = await parse(file);
    if (!p) continue;
    let mtime: number;
    try {
      mtime = (await fs.stat(file)).mtimeMs;
    } catch {
      mtime = 0;
    }
    out.push({
      id,
      title: p.title,
      folder: p.folder,
      createdAt: mtime,
      updatedAt: mtime,
      source: 'claude-code'
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Full record for one imported session (cliSessionId = the --resume id). */
export async function readClaude(id: string): Promise<HistoryRecord | null> {
  const map = await buildIndex();
  const file = map.get(id);
  if (!file) return null;
  const p = await parse(file);
  if (!p) return null;
  let mtime: number;
  try {
    mtime = (await fs.stat(file)).mtimeMs;
  } catch {
    mtime = 0;
  }
  return {
    id,
    title: p.title,
    folder: p.folder,
    cliSessionId: id,
    messages: p.messages,
    createdAt: mtime,
    updatedAt: mtime
  };
}