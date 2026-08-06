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

/** Push the current branch to its remote. A normal user gets the browser login
 *  via Git Credential Manager on the first push. */
export async function gitPush(): Promise<{ ok: boolean; err?: string }> {
  const root = gitRoot();
  if (!root) return { ok: false, err: 'No folder open' };
  const res = await run(root, ['push'], 180000); // network + possibly an auth popup
  return res.code === 0 ? { ok: true } : { ok: false, err: (res.err || res.out).trim() || 'push failed' };
}
/** Pull the current branch from its remote. */
export async function gitPull(): Promise<{ ok: boolean; err?: string }> {
  const root = gitRoot();
  if (!root) return { ok: false, err: 'No folder open' };
  const res = await run(root, ['pull'], 180_000);
  return res.code === 0 ? { ok: true } : { ok: false, err: (res.err || res.out).trim() || 'pull failed' };
}

const REMOTE_URL = /^[A-Za-z0-9@.:\/_~+-]+$/;
/** Set the origin remote to a GitHub/other URL (`remote add` or `set-url`). */
export async function gitSetRemote(url: string): Promise<{ ok: boolean; err?: string }> {
  const root = gitRoot();
  if (!root) return { ok: false, err: 'No folder open' };
  const u = url.trim();
  if (!u || !REMOTE_URL.test(u) || u.includes(' ')) return { ok: false, err: 'That does not look like a git URL.' };
  // Always add-or-replace origin (safe: the arg is passed as-is to execFile).
  await run(root, ['remote', 'remove', 'origin']);
  const res = await run(root, ['remote', 'add', 'origin', u]);
  return res.code === 0 ? { ok: true } : { ok: false, err: res.err.trim() || 'Could not set remote' };
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

export interface GitCommit {
  hash: string;
  parents: string[];
  refs: string;
  subject: string;
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
  const remoteUrl = remote.code === 0 ? (remote.out.trim() || null) : null;
  return { branch, remote: remoteUrl, changes: parseStatusPorcelain(st.out), ahead, behind };
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

/** HEAD blob for one file (abs path → repo-relative), or null when untracked. */
export async function gitShow(path: string): Promise<string | null> {
  const root = gitRoot();
  if (!root) return null;
  let rel = path.startsWith(root) ? path.slice(root.length).replace(/^[\\/]/, '') : path;
  rel = rel.replace(/\\/g, '/'); // git pathspecs use forward slashes
  const r = await run(root, ['show', `HEAD:${rel}`]);
  return r.code === 0 ? r.out : null;
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

/** Structured commit list for the graph view. Hashes are shortened to 7 chars
 *  (parents too, so lane matching stays consistent). */
export async function gitHistory(limit = 40): Promise<GitCommit[] | null> {
  const root = gitRoot();
  if (!root) return null;
  const r = await run(root, [
    'log',
    '--all',
    '--topo-order',
    '--pretty=format:%H%x09%P%x09%d%x09%s',
    '-n',
    String(limit)
  ]);
  if (r.code !== 0 || !r.out.trim()) return null;
  return r.out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash = '', parents = '', refs = '', subject = ''] = line.split('\t');
      return {
        hash: hash.slice(0, 7),
        parents: parents ? parents.split(' ').map((p) => p.slice(0, 7)) : [],
        refs: refs.trim(),
        subject: subject.trim()
      };
    });
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