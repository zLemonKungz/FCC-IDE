// git-diff.ts — read the open folder's uncommitted changes (git diff HEAD) so
// the chat can "review my changes". Read-only; capped so a huge diff can't blow
// up a prompt.
import { execFile } from 'child_process';
import * as files from './file-service';

const MAX = 30000;

function run(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: MAX + 64 * 1024 }, (err, stdout) => resolve(stdout || ''));
  });
}

/** Uncommitted diff against HEAD, or the staged+unstaged diff when HEAD doesn't
 *  exist yet (fresh repo). Null when there's nothing to show or no folder. */
export async function gitDiffText(): Promise<string | null> {
  const root = files.getRoot();
  if (!root) return null;
  let out = (await run(root, ['diff', 'HEAD'])).trim();
  if (!out) {
    out = ((await run(root, ['diff'])) + (await run(root, ['diff', '--cached']))).trim();
  }
  if (!out) return null;
  return out.slice(0, MAX);
}

/** Current git branch + count of uncommitted changes (status bar). */
export async function gitBranchInfo(): Promise<{ branch: string; changes: number } | null> {
  const root = files.getRoot();
  if (!root) return null;
  const [branchOut, statusOut] = await Promise.all([
    run(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    run(root, ['status', '--porcelain'])
  ]);
  const branch = branchOut.trim();
  if (!branch || branch === 'HEAD') return null; // not a git repo / detached HEAD
  const changes = statusOut.trim() ? statusOut.trim().split('\n').length : 0;
  return { branch, changes };
}