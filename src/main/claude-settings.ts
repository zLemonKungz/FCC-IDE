// claude-settings.ts — read/write Claude Code's settings.json files so the
// app can offer a structured config editor (what the CLI's interactive
// `/config` screen does, without the TTY). The claude CLI subprocess reads
// these files at spawn, so saved edits apply to the next conversation.
//
// User settings live at ~/.claude/settings.json (outside the project root, so
// they bypass the sandboxed file-service — the path is fixed, not user input).
// Project settings live at <root>/.claude/settings.json when a folder is open.
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import * as files from './file-service';
import type { ClaudeSettingsFile } from '@shared/types';

export type SettingsScope = 'user' | 'project';

function userPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

function projectPath(): string | null {
  const root = files.getRoot();
  return root ? join(root, '.claude', 'settings.json') : null;
}

async function readJson(p: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(p, 'utf-8');
    const j = JSON.parse(raw) as unknown;
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Deep-merge a patch into existing, preserving any fields the UI doesn't
 *  render (hooks, statusLine, enabledPlugins, …). permissions merge field-wise
 *  (preserving un-rendered permission keys); env is a flat key-value map so it
 *  REPLACES (an empty object clears); everything else is replaced when present.
 *  Exported for unit tests. */
export function mergeSettings(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existing };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const ev = out[k];
    if (k === 'permissions' && ev && typeof ev === 'object' && v && typeof v === 'object') {
      out.permissions = { ...(ev as Record<string, unknown>), ...(v as Record<string, unknown>) };
    } else if (k === 'env' && v && typeof v === 'object') {
      out.env = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function getSettings(): Promise<{ user: ClaudeSettingsFile; project: ClaudeSettingsFile | null }> {
  const user = (await readJson(userPath())) as ClaudeSettingsFile;
  const pp = projectPath();
  const project = pp ? ((await readJson(pp)) as ClaudeSettingsFile) : null;
  return { user, project };
}

export async function setSettings(scope: SettingsScope, patch: ClaudeSettingsFile): Promise<void> {
  const p = scope === 'user' ? userPath() : projectPath();
  if (!p) throw new Error('No folder open for project settings');
  const existing = await readJson(p);
  const next = mergeSettings(existing, patch as unknown as Record<string, unknown>);
  await fs.mkdir(join(p, '..'), { recursive: true });
  await fs.writeFile(p, JSON.stringify(next, null, 2) + '\n', 'utf-8');
}
