import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface EditorTab {
  path: string;
  name: string;
  content: string;
  baseContent: string;
  dirty: boolean;
  agentModified?: boolean;
}

export interface CursorPos {
  line: number;
  col: number;
}

/** A single diff hunk between baseContent (original) and the file on disk —
 *  line ranges are 1-based inclusive, from Monaco's ILineChange. */
export interface HunkRange {
  originalStart: number;
  originalEnd: number;
  modifiedStart: number;
  modifiedEnd: number;
}

interface EditorState {
  tabs: EditorTab[];
  activePath: string | null;
  /** tab armed for a discard-confirm (dirty tab that got one ✕ click) */
  closingPath: string | null;
  diffPath: string | null;
  cursor: CursorPos;
  /** markdown files render as a live preview instead of the editor */
  mdPreview: boolean;
  setPreview: (v: boolean) => void;
  open: (path: string) => Promise<void>;
  setContent: (path: string, content: string) => void;
  save: (path: string) => Promise<void>;
  close: (path: string) => void;
  closeOthers: (path: string) => void;
  closeSaved: () => void;
  closeAll: () => void;
  setActive: (path: string) => void;
  setDiff: (path: string | null) => void;
  setCursor: (c: CursorPos) => void;
  markAgentModified: (path: string) => void;
  acceptAgentChange: (path: string) => Promise<void>;
  revertAgentChange: (path: string) => Promise<void>;
  revertAgentHunk: (path: string, hunk: HunkRange) => Promise<void>;
  acceptAllAgentChanges: () => Promise<void>;
  revertAllAgentChanges: () => Promise<void>;
  getBase: (path: string) => string | null;
  getTab: (path: string) => EditorTab | null;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
  tabs: [],
  activePath: null,
  closingPath: null,
  diffPath: null,
  cursor: { line: 1, col: 1 },
  mdPreview: false,
  setPreview: (v) => set({ mdPreview: v }),
  open: async (path) => {
    if (get().tabs.some((t) => t.path === path)) {
      set({ activePath: path, closingPath: null, mdPreview: false });
      return;
    }
    const content = await window.fcc.fsRead(path);
    const name = path.split(/[\\/]/).pop() ?? path;
    set({
      tabs: [...get().tabs, { path, name, content, baseContent: content, dirty: false }],
      activePath: path,
      closingPath: null,
      mdPreview: false
    });
  },
  setContent: (path, content) => {
    set({
      tabs: get().tabs.map((t) => (t.path === path ? { ...t, content, dirty: content !== t.baseContent } : t)),
      closingPath: null
    });
  },
  save: async (path) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab) return;
    await window.fcc.fsWrite(path, tab.content);
    set({
      tabs: get().tabs.map((t) => (t.path === path ? { ...t, baseContent: t.content, dirty: false } : t)),
      closingPath: null
    });
  },
  close: (path) => {
    // Two-step guard: closing a dirty tab only arms it; a second ✕ discards.
    const tab = get().tabs.find((t) => t.path === path);
    if (tab?.dirty && get().closingPath !== path) {
      set({ closingPath: path });
      return;
    }
    const rest = get().tabs.filter((t) => t.path !== path);
    set({ tabs: rest, activePath: rest.length ? rest[rest.length - 1].path : null, closingPath: null, mdPreview: false });
  },
  closeOthers: (path) => {
    const dirtyOther = get().tabs.find((t) => t.path !== path && t.dirty);
    if (dirtyOther) {
      set({ closingPath: dirtyOther.path });
      return;
    }
    const kept = get().tabs.filter((t) => t.path === path);
    set({ tabs: kept, activePath: path, closingPath: null, mdPreview: false });
  },
  closeSaved: () => {
    const rest = get().tabs.filter((t) => t.dirty);
    set({ tabs: rest, activePath: rest.length ? rest[rest.length - 1].path : null, closingPath: null, mdPreview: false });
  },
  closeAll: () => {
    const dirtyTab = get().tabs.find((t) => t.dirty);
    if (dirtyTab) {
      set({ closingPath: dirtyTab.path });
      return;
    }
    set({ tabs: [], activePath: null, closingPath: null, mdPreview: false });
  },
  setActive: (path) => set({ activePath: path, closingPath: null, mdPreview: false }),
  setDiff: (path) => set({ diffPath: path }),
  setCursor: (c) => set({ cursor: c }),
  markAgentModified: (path) => {
    set({
      tabs: get().tabs.map((t) => (t.path === path ? { ...t, agentModified: true } : t))
    });
  },
  acceptAgentChange: async (path) => {
    const content = await window.fcc.fsRead(path);
    set({
      tabs: get().tabs.map((t) =>
        t.path === path
          ? { ...t, content, baseContent: content, dirty: false, agentModified: false }
          : t
      )
    });
  },
  revertAgentChange: async (path) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab) return;
    await window.fcc.fsWrite(path, tab.baseContent);
    set({
      tabs: get().tabs.map((t) =>
        t.path === path
          ? { ...t, content: t.baseContent, dirty: false, agentModified: false }
          : t
      )
    });
  },
  // Undo ONE agent hunk: replace the hunk's lines in the current (disk) content
  // with the original lines from baseContent. Operates on disk because the tab's
  // content may be stale after the agent edits the file externally.
  revertAgentHunk: async (path, hunk) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab) return;
    const disk = await window.fcc.fsRead(path).catch(() => tab.content);
    const baseLines = tab.baseContent.split('\n');
    const curLines = disk.split('\n');
    const orig = baseLines.slice(hunk.originalStart - 1, hunk.originalEnd);
    const next = curLines.slice();
    next.splice(hunk.modifiedStart - 1, hunk.modifiedEnd - hunk.modifiedStart + 1, ...orig);
    const newContent = next.join('\n');
    await window.fcc.fsWrite(path, newContent);
    set({
      tabs: get().tabs.map((t) =>
        t.path === path
          ? {
              ...t,
              content: newContent,
              dirty: newContent !== tab.baseContent,
              agentModified: newContent !== tab.baseContent
            }
          : t
      )
    });
  },
  acceptAllAgentChanges: async () => {
    for (const t of get().tabs.filter((x) => x.agentModified)) {
      await get().acceptAgentChange(t.path);
    }
  },
  revertAllAgentChanges: async () => {
    for (const t of get().tabs.filter((x) => x.agentModified)) {
      await get().revertAgentChange(t.path);
    }
  },
  getBase: (path) => get().tabs.find((t) => t.path === path)?.baseContent ?? null,
  getTab: (path) => get().tabs.find((t) => t.path === path) ?? null
    }),
    {
      // Tab paths are saved here; the startup effect in App re-reads their
      // contents from disk after the open folder is registered in main.
      name: 'fcc-tabs',
      partialize: (s) => ({ tabs: s.tabs.map(({ path, name }) => ({ path, name })), activePath: s.activePath })
    }
  )
);
