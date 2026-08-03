import { create } from 'zustand';
import type { FileEntry } from '@shared/types';

interface ExplorerState {
  root: string | null;
  children: Record<string, FileEntry[]>;
  expanded: Record<string, boolean>;
  selectedPath: string | null;
  openRoot: () => Promise<void>;
  toggle: (dir: string) => Promise<void>;
  refresh: () => Promise<void>;
  createFile: (parentDir: string) => Promise<void>;
  deleteEntry: (p: string) => Promise<void>;
  openFile: (path: string) => void;
}

export const useExplorerStore = create<ExplorerState>((set, get) => ({
  root: null,
  children: {},
  expanded: {},
  selectedPath: null,
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
    const { root } = get();
    if (!root) return;
    const entries = await window.fcc.fsList(root);
    set({ children: { ...get().children, [root]: entries } });
  },
  createFile: async (parentDir) => {
    const p = `${parentDir}\\untitled-${Date.now()}.ts`;
    await window.fcc.fsCreate(p, false);
    await get().refresh();
  },
  deleteEntry: async (p) => {
    await window.fcc.fsDelete(p);
    await get().refresh();
  },
  openFile: (path) => {
    set({ selectedPath: path });
    window.dispatchEvent(new CustomEvent('fcc:open-file', { detail: path }));
  }
}));
