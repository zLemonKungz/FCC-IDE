import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Panel geometry + visibility, persisted so the layout survives restarts.
const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 520;
const SIDEBAR_DEFAULT = 240;
const CHAT_MIN = 240;
const CHAT_MAX = 640;
const CHAT_DEFAULT = 360;
const TERM_MIN = 80;
const TERM_MAX = 480;
const TERM_DEFAULT = 210;

export const LAYOUT = {
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  SIDEBAR_DEFAULT,
  CHAT_MIN,
  CHAT_MAX,
  CHAT_DEFAULT,
  TERM_MIN,
  TERM_MAX,
  TERM_DEFAULT
} as const;

interface LayoutState {
  sidebarVisible: boolean;
  chatVisible: boolean;
  terminalVisible: boolean;
  /** which view the sidebar shows — Explorer or Find-in-files */
  sidebarView: 'explorer' | 'search';
  sidebarWidth: number;
  chatWidth: number;
  terminalHeight: number;
  theme: 'dark' | 'light';
  isDragging: boolean;
  toggleSidebar: () => void;
  toggleChat: () => void;
  toggleTerminal: () => void;
  setSidebarView: (v: 'explorer' | 'search') => void;
  setSidebarWidth: (v: number) => void;
  setChatWidth: (v: number) => void;
  setTerminalHeight: (v: number) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  setDragging: (d: boolean) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarVisible: true,
      chatVisible: true,
      terminalVisible: true,
      sidebarView: 'explorer',
      sidebarWidth: SIDEBAR_DEFAULT,
      chatWidth: CHAT_DEFAULT,
      terminalHeight: TERM_DEFAULT,
      theme: 'dark',
      isDragging: false,
      toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
      toggleChat: () => set((s) => ({ chatVisible: !s.chatVisible })),
      toggleTerminal: () => set((s) => ({ terminalVisible: !s.terminalVisible })),
      setSidebarView: (sidebarView) => set({ sidebarView }),
      setSidebarWidth: (v) => set({ sidebarWidth: v }),
      setChatWidth: (v) => set({ chatWidth: v }),
      setTerminalHeight: (v) => set({ terminalHeight: v }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setDragging: (isDragging) => set({ isDragging })
    }),
    { name: 'fcc-layout' }
  )
);
