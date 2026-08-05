import { promises as fs } from 'fs';
import path from 'path';
import { isInside, isInsideResolved } from '@shared/path-utils';
import type { FileEntry, SearchHit } from '@shared/types';

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'out', 'release']);

// MIME map for relative markdown image assets + a size cap so a huge image can't
// balloon into a multi-MB base64 data URI in the renderer.
const ASSET_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon'
};
const ASSET_MAX = 4 * 1024 * 1024;

let rootDir: string | null = null;

export function setRoot(dir: string): void {
  rootDir = path.resolve(dir);
}

// Startup restore: register a previously-open folder without a dialog. Returns
// false (and leaves the root unset) if it no longer exists, so a moved/deleted
// folder can't silently become the root and break later path checks.
export async function openRootAt(dir: string): Promise<boolean> {
  try {
    const st = await fs.stat(dir);
    if (!st.isDirectory()) return false;
  } catch {
    return false;
  }
  setRoot(dir);
  return true;
}

export function getRoot(): string | null {
  return rootDir;
}

// Lexical + realpath containment check (realpath blocks symlink/junction escape).
export async function assertInside(target: string): Promise<void> {
  if (!rootDir) throw new Error('No folder open');
  if (!isInside(rootDir, target)) throw new Error(`Path outside root: ${target}`);
  if (!(await isInsideResolved(rootDir, target))) {
    throw new Error(`Path escapes root via symlink: ${target}`);
  }
}

/** Recursively list files under the root as forward-slash relative paths
 *  (skips the same noise dirs as listDir) — feeds the chat '@' mention picker. */
export async function searchFiles(): Promise<string[]> {
  const base = rootDir;
  if (!base) return [];
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir (permissions) — skip it
    }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else out.push(path.relative(base, p).split(path.sep).join('/'));
    }
  };
  await walk(base);
  return out.sort((a, b) => a.localeCompare(b));
}

/** Find-in-files: case-insensitive substring search across the root, reusing
 *  the searchFiles walk (skip dirs, unreadable dirs skipped). Large files and
 *  binaries are skipped so a PNG or a vendored bundle can't stall the search. */
const SEARCH_CAP = 1000;
const SEARCH_FILE_CAP = 1_000_000; // 1 MB

export async function searchContent(query: string): Promise<SearchHit[]> {
  const base = rootDir;
  if (!base || !query) return [];
  const needle = query.toLowerCase();
  const hits: SearchHit[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (hits.length >= SEARCH_CAP) return;
      if (SKIP_DIRS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(p);
        continue;
      }
      try {
        const stat = await fs.stat(p);
        if (stat.size > SEARCH_FILE_CAP) continue;
      } catch {
        continue;
      }
      let content: string;
      try {
        content = await fs.readFile(p, 'utf-8');
      } catch {
        continue;
      }
      if (content.includes(String.fromCharCode(0))) continue; // binary
      const lines = content.split('\n');
      for (let i = 0; i < lines.length && hits.length < SEARCH_CAP; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes(needle)) {
          hits.push({
            path: p,
            relative: path.relative(base, p).split(path.sep).join('/'),
            line: i + 1,
            text: line.trim().slice(0, 300)
          });
        }
      }
    }
  };
  await walk(base);
  return hits.sort((a, b) => (a.relative === b.relative ? a.line - b.line : a.relative.localeCompare(b.relative)));
}

export async function listDir(dir: string): Promise<FileEntry[]> {
  await assertInside(dir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => !SKIP_DIRS.has(e.name))
    .map((e) => ({ name: e.name, path: path.join(dir, e.name), isDir: e.isDirectory() }))
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
}

export async function readFile(p: string): Promise<string> {
  await assertInside(p);
  return fs.readFile(p, 'utf-8');
}

/** Read an image/asset as a base64 data URI for markdown previews. Null when the
 *  file is missing, not a supported image, or over the size cap. */
export async function readAsset(p: string): Promise<string | null> {
  await assertInside(p);
  try {
    const st = await fs.stat(p);
    if (!st.isFile() || st.size > ASSET_MAX) return null;
    const ext = p.split('.').pop()?.toLowerCase() ?? '';
    const mime = ASSET_MIME[ext];
    if (!mime) return null;
    const buf = await fs.readFile(p);
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null; // ENOENT / unreadable
  }
}

export async function writeFile(p: string, content: string): Promise<void> {
  await assertInside(p);
  await fs.writeFile(p, content, 'utf-8');
}

export async function createEntry(p: string, isDir: boolean): Promise<void> {
  await assertInside(p);
  if (isDir) await fs.mkdir(p, { recursive: true });
  else await fs.writeFile(p, '', { flag: 'wx' }); // 'wx' = fail if exists, never truncate
}

export async function renameEntry(p: string, newName: string): Promise<void> {
  await assertInside(p);
  const target = path.join(path.dirname(p), newName);
  await assertInside(target);
  try {
    await fs.lstat(target);
    throw new Error(`Target already exists: ${target}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  await fs.rename(p, target);
}

export async function deleteEntry(p: string): Promise<void> {
  await assertInside(p);
  if (rootDir && path.resolve(p) === rootDir) {
    throw new Error('Refusing to delete the open root folder');
  }
  await fs.rm(p, { recursive: true, force: true });
}

/** Copy a file or directory (recursive) to a target inside the open folder. */
export async function copyPath(from: string, to: string): Promise<void> {
  await assertInside(from);
  await assertInside(to);
  await fs.cp(from, to, { recursive: true });
}
