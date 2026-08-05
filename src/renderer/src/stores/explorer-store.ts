import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FileEntry } from '@shared/types';

// OS path separator — the main process joins with the platform separator, so the
// renderer must build copy/paste/duplicate targets the same way.
const SEP = window.fcc.platform === 'win32' ? '\\' : '/';

function joinPath(dir: string, name: string): string {
  return dir.endsWith('\\') || dir.endsWith('/') ? dir + name : dir + SEP + name;
}
function dirOf(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return i >= 0 ? p.slice(0, i) : p;
}
function baseName(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return i >= 0 ? p.slice(i + 1) : p;
}
function dupName(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? `${name.slice(0, i)}-copy${name.slice(i)}` : `${name}-copy`;
}

type ClipboardAction = { action: 'copy' | 'cut'; path: string };

interface ExplorerState {
  root: string | null;
  children: Record<string, FileEntry[]>;
  expanded: Record<string, boolean>;
  selectedPath: string | null;
  clipboard: ClipboardAction | null;
  openRoot: () => Promise<void>;
  toggle: (dir: string) => Promise<void>;
  /** Re-list the root and every expanded dir so nested edits stay in sync. */
  refresh: () => Promise<void>;
  create: (dir: string, name: string, isDir: boolean) => Promise<void>;
  rename: (p: string, newName: string) => Promise<void>;
  duplicate: (p: string) => Promise<void>;
  copy: (p: string) => void;
  cut: (p: string) => void;
  paste: (destDir: string) => Promise<void>;
  deleteEntry: (p: string) => Promise<void>;
  select: (p: string) => void;
  openFile: (path: string) => void;
}

export const useExplorerStore = create<ExplorerState>()(
  persist(
    (set, get) => ({
  root: null,
  children: {},
  expanded: {},
  selectedPath: null,
  clipboard: null,
  openRoot: async () => {
    const root = await window.fcc.openFolder();
    if (!root) return;
    const entries = await window.fcc.fsList(root);
    set({ root, children: { [root]: entries }, expanded: { [root]: true } });
  },
  toggle: async (dir) => {
    const { expanded, children } = get();
    const next = { ...expanded, [dir]: !expanded[dir] };
    let nextChildren = children;
    if (next[dir] && !children[dir]) {
      nextChildren = { ...children, [dir]: await window.fcc.fsList(dir) };
    }
    set({ expanded: next, children: nextChildren });
  },
  refresh: async () => {
    const { root, expanded, children } = get();
    if (!root) return;
    const out = { ...children };
    const dirs = [root, ...Object.keys(expanded).filter((d) => expanded[d])];
    for (const d of dirs) {
      try {
        out[d] = await window.fcc.fsList(d);
      } catch {
        // a dir may vanish mid-edit (renamed/deleted) — leave its old listing
      }
    }
    set({ children: out });
  },
  create: async (dir, name, isDir) => {
    await window.fcc.fsCreate(joinPath(dir, name), isDir);
    await get().refresh();
  },
  rename: async (p, newName) => {
    await window.fcc.fsRename(p, newName);
    await get().refresh();
  },
  duplicate: async (p) => {
    await window.fcc.fsCopy(p, joinPath(dirOf(p), dupName(baseName(p))));
    await get().refresh();
  },
  copy: (p) => set({ clipboard: { action: 'copy', path: p } }),
  cut: (p) => set({ clipboard: { action: 'cut', path: p } }),
  paste: async (destDir) => {
    const clip = get().clipboard;
    if (!clip) return;
    await window.fcc.fsCopy(clip.path, joinPath(destDir, baseName(clip.path)));
    if (clip.action === 'cut') await window.fcc.fsDelete(clip.path);
    set({ clipboard: null });
    await get().refresh();
  },
  deleteEntry: async (p) => {
    await window.fcc.fsDelete(p);
    const clip = get().clipboard;
    if (clip?.path === p) set({ clipboard: null });
    await get().refresh();
  },
  select: (p) => set({ selectedPath: p }),
  openFile: (path) => {
    set({ selectedPath: path });
    window.dispatchEvent(new CustomEvent('fcc:open-file', { detail: path }));
  }
    }),
    {
      // The open folder is saved here; the actual restore (registering it in
      // the main process, then listing) happens in App's startup effect so it
      // can run before editor tabs are re-opened.
      name: 'fcc-explorer',
      partialize: (s) => ({ root: s.root })
    }
  )
);