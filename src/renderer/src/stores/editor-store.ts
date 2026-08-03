import { create } from 'zustand';

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

interface EditorState {
  tabs: EditorTab[];
  activePath: string | null;
  diffPath: string | null;
  cursor: CursorPos;
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
  getBase: (path: string) => string | null;
  getTab: (path: string) => EditorTab | null;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activePath: null,
  diffPath: null,
  cursor: { line: 1, col: 1 },
  open: async (path) => {
    if (get().tabs.some((t) => t.path === path)) {
      set({ activePath: path });
      return;
    }
    const content = await window.fcc.fsRead(path);
    const name = path.split(/[\\/]/).pop() ?? path;
    set({
      tabs: [...get().tabs, { path, name, content, baseContent: content, dirty: false }],
      activePath: path
    });
  },
  setContent: (path, content) => {
    set({
      tabs: get().tabs.map((t) => (t.path === path ? { ...t, content, dirty: content !== t.baseContent } : t))
    });
  },
  save: async (path) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab) return;
    await window.fcc.fsWrite(path, tab.content);
    set({
      tabs: get().tabs.map((t) => (t.path === path ? { ...t, baseContent: t.content, dirty: false } : t))
    });
  },
  close: (path) => {
    const rest = get().tabs.filter((t) => t.path !== path);
    set({ tabs: rest, activePath: rest.length ? rest[rest.length - 1].path : null });
  },
  closeOthers: (path) => {
    const kept = get().tabs.filter((t) => t.path === path);
    set({ tabs: kept, activePath: path });
  },
  closeSaved: () => {
    const rest = get().tabs.filter((t) => t.dirty);
    set({ tabs: rest, activePath: rest.length ? rest[rest.length - 1].path : null });
  },
  closeAll: () => set({ tabs: [], activePath: null }),
  setActive: (path) => set({ activePath: path }),
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
  getBase: (path) => get().tabs.find((t) => t.path === path)?.baseContent ?? null,
  getTab: (path) => get().tabs.find((t) => t.path === path) ?? null
}));
