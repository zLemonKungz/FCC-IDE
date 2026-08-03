import { promises as fs } from 'fs';
import path from 'path';
import { isInside, isInsideResolved } from '@shared/path-utils';
import type { FileEntry } from '@shared/types';

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'out', 'release']);
let rootDir: string | null = null;

export function setRoot(dir: string): void {
  rootDir = path.resolve(dir);
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
