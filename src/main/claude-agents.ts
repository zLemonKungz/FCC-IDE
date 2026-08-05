// claude-agents.ts — read/write custom subagents in the project's
// .claude/agents/*.md (Claude Code's custom-agent format). Mirrors mcp-service:
// all file access goes through the sandboxed file-service so paths stay in root.
import { join } from 'path';
import * as files from './file-service';
import type { AgentSummary } from '@shared/types';

const AGENTS_DIR = '.claude/agents';
// Subagent filenames must be safe path segments (also the CLI expects this).
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

function assertSafeName(name: string): void {
  if (!SAFE_NAME.test(name)) throw new Error(`Invalid agent name: ${name}`);
}

export async function listAgents(): Promise<AgentSummary[]> {
  const root = files.getRoot();
  if (!root) return [];
  try {
    const entries = await files.listDir(join(root, AGENTS_DIR));
    return entries
      .filter((e) => !e.isDir && e.name.endsWith('.md'))
      .map((e) => ({ name: e.name.slice(0, -'.md'.length), path: e.path }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return []; // .claude/agents doesn't exist yet
  }
}

export async function readAgent(name: string): Promise<string> {
  const root = files.getRoot();
  if (!root) throw new Error('No folder open');
  assertSafeName(name);
  return files.readFile(join(root, AGENTS_DIR, `${name}.md`));
}

export async function saveAgent(name: string, content: string): Promise<void> {
  const root = files.getRoot();
  if (!root) throw new Error('No folder open');
  assertSafeName(name);
  const dir = join(root, AGENTS_DIR);
  await files.createEntry(dir, true); // mkdir -p (no-op when it exists)
  await files.writeFile(join(dir, `${name}.md`), content);
}

export async function deleteAgent(name: string): Promise<void> {
  const root = files.getRoot();
  if (!root) throw new Error('No folder open');
  assertSafeName(name);
  await files.deleteEntry(join(root, AGENTS_DIR, `${name}.md`));
}