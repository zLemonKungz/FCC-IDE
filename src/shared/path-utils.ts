import path from 'path';
import { promises as fs } from 'fs';

export function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

// Realpath of the nearest existing ancestor — handles not-yet-created paths.
async function realpathNearest(p: string): Promise<string> {
  let current = path.resolve(p);
  while (true) {
    try {
      return await fs.realpath(current);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`Cannot resolve realpath for ${p}`);
      current = parent;
    }
  }
}

// Realpath-aware containment check: prevents symlink/junction escape.
export async function isInsideResolved(root: string, target: string): Promise<boolean> {
  const realRoot = await fs.realpath(path.resolve(root));
  const realTarget = await realpathNearest(target);
  return isInside(realRoot, realTarget);
}
