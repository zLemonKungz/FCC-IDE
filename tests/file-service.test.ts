import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  setRoot,
  listDir,
  readFile,
  writeFile,
  assertInside,
  createEntry,
  renameEntry,
  deleteEntry
} from '../src/main/file-service';

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'fcc-test-'));
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('file-service', () => {
  it('lists dir entries sorted dirs-first, skipping node_modules/.git', async () => {
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    writeFileSync(join(root, 'a.txt'), 'hi');
    setRoot(root);
    const entries = await listDir(root);
    const names = entries.map((e) => e.name);
    expect(names).toEqual(['src', 'a.txt']);
  });
  it('reads and writes files under root', async () => {
    setRoot(root);
    await writeFile(join(root, 'x.ts'), 'export const x = 1');
    expect(await readFile(join(root, 'x.ts'))).toBe('export const x = 1');
  });
  it('throws when a path escapes the root', async () => {
    setRoot(root);
    await expect(assertInside(join(root, '..', 'evil.txt'))).rejects.toThrow();
  });
  it('refuses to delete the open root folder', async () => {
    setRoot(root);
    await expect(deleteEntry(root)).rejects.toThrow(/root/i);
  });
  it('does not overwrite an existing target on rename', async () => {
    setRoot(root);
    writeFileSync(join(root, 'keep.txt'), 'keep me');
    writeFileSync(join(root, 'src.txt'), 'src');
    await expect(renameEntry(join(root, 'src.txt'), 'keep.txt')).rejects.toThrow(/exists/i);
    expect(await readFile(join(root, 'keep.txt'))).toBe('keep me');
  });
  it('does not truncate an existing file on create', async () => {
    setRoot(root);
    writeFileSync(join(root, 'exists.txt'), 'precious');
    await expect(createEntry(join(root, 'exists.txt'), false)).rejects.toThrow();
    expect(await readFile(join(root, 'exists.txt'))).toBe('precious');
  });
});
