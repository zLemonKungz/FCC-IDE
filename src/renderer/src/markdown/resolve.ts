// resolve.ts — classify a markdown href into a concrete renderer action.
// Pure and renderer-safe: the sandboxed renderer has no node:path, so path
// joining is done on the raw string (handling both / and \ separators).

export type HrefAction =
  | { kind: 'external'; url: string }
  | { kind: 'anchor'; id: string }
  | { kind: 'data' }
  | { kind: 'repo'; absPath: string };

/** Join `rel` onto `base` and normalize `.`/`..` segments, preserving the
 *  separator style of `base` (backslash on Windows-style paths). */
function joinResolve(base: string, rel: string): string {
  const parts = [...base.split(/[\\/]+/), ...rel.split(/[\\/]+/)];
  const out: string[] = [];
  for (const seg of parts) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join(base.includes('\\') ? '\\' : '/');
}

function dirname(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx <= 0 ? p : p.slice(0, idx);
}

/** Lexical containment of `target` under `root` (case-insensitive on
 *  drive-letter paths, matching the app's own path containment). */
function isWithin(root: string, target: string): boolean {
  const r = root.replace(/[\\/]+$/, '');
  const ci = /^[A-Za-z]:/.test(r);
  const a = ci ? r.toLowerCase() : r;
  const b = ci ? target.toLowerCase() : target;
  return b === a || b.startsWith(a + '\\') || b.startsWith(a + '/');
}

/** Classify a markdown href:
 *  - http(s)/mailto/tel (+ unknown schemes) → external (open in system browser)
 *  - `#frag` → same-document anchor
 *  - `data:` → embedded asset, pass through
 *  - anything else → a repo-relative path resolved against the base (the
 *    current file's directory, or the open-folder root when no basePath), only
 *    if the result stays inside the root; an escaping path becomes external. */
export function resolveHref(href: string, opts: { basePath?: string; root: string | null }): HrefAction {
  const h = href.trim();
  const scheme = h.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1]?.toLowerCase();
  if (scheme) {
    if (scheme === 'http' || scheme === 'https' || scheme === 'mailto' || scheme === 'tel') {
      return { kind: 'external', url: h };
    }
    if (scheme === 'data') return { kind: 'data' };
    return { kind: 'external', url: h };
  }
  if (h.startsWith('#')) return { kind: 'anchor', id: h.slice(1) };
  if (!opts.root) return { kind: 'external', url: h };
  const baseDir = opts.basePath ? dirname(opts.basePath) : opts.root;
  const abs = joinResolve(baseDir, h);
  if (isWithin(opts.root, abs)) return { kind: 'repo', absPath: abs };
  return { kind: 'external', url: h };
}