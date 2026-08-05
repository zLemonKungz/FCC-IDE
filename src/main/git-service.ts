// git-service.ts — read-only + mutating git operations on the open folder for
// the Source Control panel. All commands run with cwd = the open folder; paths
// come from git itself (repo-relative), so there's no path traversal surface.
import { execFile } from 'child_process';
import * as files from './file-service';

function run(root: string, args: string[], timeoutMs = 20000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: root, maxBuffer: 8 * 1024 * 1024, timeout: timeoutMs }, (err, stdout, stderr) => {
      resolve({ code: err ? 1 : 0, out: stdout || '', err: stderr || '' });
    });
  });
}

function gitRoot(): string | null {
  return files.getRoot();
}

/** One changed file: its path (repo-relative) and which status letters apply. */
export interface GitChange {
  path: string;
  staged: boolean;
  kind: string; // M/A/D/R/U
  untracked: boolean;
  conflict: boolean;
}

export interface GitStatus {
  branch: string;
  remote: string | null;
  changes: GitChange[];
  ahead: number;
  behind: number;
}

/** Current branch + full change list from `status --porcelain`. */
export async function gitStatus(): Promise<GitStatus | null> {
  const root = gitRoot();
  if (!root) return null;
  const [st, br, up, remote] = await Promise.all([
    run(root, ['status', '--porcelain', '--branch']),
    run(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    run(root, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']),
    run(root, ['remote', 'get-url', 'origin'])
  ]);
  const branch = br.out.trim() || '(detached)';
  // ahead/behind from `rev-list --left-right --count HEAD...@{upstream}`
  let ahead = 0;
  let behind = 0;
  if (up.code === 0) {
    const [a, b] = up.out.trim().split(/\s+/);
    ahead = Number(a) || 0;
    behind = Number(b) || 0;
  }
  const remoteName = remote.code === 0 ? (remote.out.trim().split(/[\\/]/).pop() ?? null) : null;
  return { branch, remote: remoteName, changes: parseStatusPorcelain(st.out), ahead, behind };
}

/** Parse `git status --porcelain` text into GitChange rows (pure + tested).
 *  Skips the `## branch…` summary line and `!!` ignored entries. */
export function parseStatusPorcelain(out: string): GitChange[] {
  const changes: GitChange[] = [];
  for (const raw of out.split('\n')) {
    if (!raw.trim()) continue;
    if (raw.startsWith('##') || raw.startsWith('!!')) continue;
    const code = raw.slice(0, 2);
    const path = raw.slice(3).trim().replace(/^"|"$/g, '');
    changes.push({
      path,
      staged: code[0] !== ' ' && code[0] !== '?',
      kind: code[0] === '?' ? code[1] : code[0] !== ' ' ? code[0] : code[1],
      untracked: code === '??',
      conflict: code[0] === 'U' || code[1] === 'U'
    });
  }
  return changes;
}

export type GitAction = 'stage' | 'unstage' | 'discard';

/** stage / unstage / discard one or more files (repo-relative paths). */
export async function gitChangeAction(action: GitAction, paths: string[]): Promise<boolean> {
  const root = gitRoot();
  if (!root || paths.length === 0) return false;
  const args =
    action === 'stage' ? ['add', '--', ...paths]
    : action === 'unstage' ? ['restore', '--staged', '--', ...paths]
    : ['restore', '--', ...paths];
  const r = await run(root, args);
  return r.code === 0;
}

/** Commit the staged changes with the given message. */
export async function gitCommit(message: string): Promise<{ ok: boolean; err?: string }> {
  const root = gitRoot();
  if (!root || !message.trim()) return { ok: false, err: 'No commit message' };
  const r = await run(root, ['commit', '-m', message.trim()]);
  return r.code === 0 ? { ok: true } : { ok: false, err: r.err.trim().split('\n')[0] || 'commit failed' };
}

/** Staged diff text (for the Claude commit-message helper). */
export async function gitStagedDiff(): Promise<string | null> {
  const root = gitRoot();
  if (!root) return null;
  const r = await run(root, ['diff', '--cached']);
  const t = r.out.trim();
  return t ? t.slice(0, 30000) : null;
}

export interface GitBranch {
  name: string;
  current: boolean;
}

/** Local branches with the current one flagged. */
export async function gitBranchList(): Promise<GitBranch[] | null> {
  const root = gitRoot();
  if (!root) return null;
  const r = await run(root, ['branch', '--no-color']);
  if (r.code !== 0) return null;
  return r.out
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ name: line.trim().replace(/^\*?\s*/, ''), current: line.trimStart().startsWith('*') }));
}

/** Create-and-switch or switch to a branch. */
export async function gitBranchSwitch(name: string, create = false): Promise<{ ok: boolean; err?: string }> {
  const root = gitRoot();
  if (!root || !name.trim()) return { ok: false, err: 'No branch name' };
  const args = create ? ['switch', '-c', name.trim()] : ['switch', name.trim()];
  const r = await run(root, args);
  return r.code === 0 ? { ok: true } : { ok: false, err: r.err.trim().split('\n')[0] || 'switch failed' };
}