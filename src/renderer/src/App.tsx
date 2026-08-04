import { useEffect, useRef, useState } from 'react';
import Titlebar from './components/Titlebar';
import Explorer from './components/Explorer';
import Editor from './components/Editor';
import ChatPanel from './components/ChatPanel';
import Terminal from './components/Terminal';
import StatusBar from './components/StatusBar';
import ActivityBar from './components/ActivityBar';
import DragHandle from './components/DragHandle';
import CommandPalette from './components/CommandPalette';
import SearchPanel from './components/SearchPanel';
import { useLayoutStore, LAYOUT } from './stores/layout-store';
import { useSettingsStore } from './stores/settings-store';

export default function App() {
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const chatVisible = useLayoutStore((s) => s.chatVisible);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const chatWidth = useLayoutStore((s) => s.chatWidth);
  const terminalHeight = useLayoutStore((s) => s.terminalHeight);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const toggleChat = useLayoutStore((s) => s.toggleChat);
  const toggleTerminal = useLayoutStore((s) => s.toggleTerminal);
  const toggleTheme = useLayoutStore((s) => s.toggleTheme);
  const sidebarView = useLayoutStore((s) => s.sidebarView);
  const setSidebarView = useLayoutStore((s) => s.setSidebarView);
  const theme = useLayoutStore((s) => s.theme);
  const isDragging = useLayoutStore((s) => s.isDragging);
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const setChatWidth = useLayoutStore((s) => s.setChatWidth);
  const setTerminalHeight = useLayoutStore((s) => s.setTerminalHeight);
  const chatModel = useSettingsStore((s) => s.chatModel);
  const chatMaxTurns = useSettingsStore((s) => s.chatMaxTurns);
  const autoCompactWindow = useSettingsStore((s) => s.autoCompactWindow);

  const pendingChord = useRef<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Theme chord: Ctrl+K then Ctrl+T (reset on any other key).
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        pendingChord.current = 'k';
        return;
      }
      if (pendingChord.current === 'k' && e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        pendingChord.current = null;
        toggleTheme();
        return;
      }
      pendingChord.current = null;

      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.code === 'KeyB') {
        e.preventDefault();
        toggleSidebar();
      } else if (e.code === 'Backquote' && !e.shiftKey) {
        e.preventDefault();
        toggleTerminal();
      } else if (e.code === 'Backquote' && e.shiftKey) {
        e.preventDefault();
        toggleChat();
      } else if (e.code === 'KeyJ') {
        e.preventDefault();
        toggleTerminal();
      } else if (e.code === 'KeyP' && e.shiftKey) {
        e.preventDefault();
        setPaletteOpen((p) => !p);
      } else if (e.code === 'KeyF' && e.shiftKey) {
        e.preventDefault();
        setSidebarView('search');
        if (!sidebarVisible) toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar, toggleChat, toggleTerminal, toggleTheme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // Keep the native window-control overlay (Windows caption buttons)
    // tinted to match the current theme.
    const overlay =
      theme === 'light'
        ? { color: '#faf8f6', symbolColor: '#6f665d' }
        : { color: '#0e1013', symbolColor: '#a0a8b4' };
    window.fcc.setTitleBarOverlay(overlay.color, overlay.symbolColor);
  }, [theme]);

  // Persisted chat settings override the main process env defaults. Push on
  // mount (so a restart re-applies them) and on every change.
  useEffect(() => {
    void window.fcc.setChatSettings({ model: chatModel, maxTurns: chatMaxTurns, autoCompactWindow });
  }, [chatModel, chatMaxTurns, autoCompactWindow]);

  return (
    <div className={`app${isDragging ? ' dragging' : ''}`}>
      <Titlebar />
      <ActivityBar />
      <aside className="sidebar" style={{ width: sidebarVisible ? sidebarWidth : 0 }}>
        {sidebarView === 'search' ? <SearchPanel /> : <Explorer />}
      </aside>
      {sidebarVisible && (
        <DragHandle
          orientation="vertical"
          value={sidebarWidth}
          min={LAYOUT.SIDEBAR_MIN}
          max={LAYOUT.SIDEBAR_MAX}
          defaultValue={LAYOUT.SIDEBAR_DEFAULT}
          onChange={setSidebarWidth}
        />
      )}
      <main className="center">
        <Editor />
        {chatVisible && (
          <>
            <DragHandle
              orientation="vertical"
              value={chatWidth}
              min={LAYOUT.CHAT_MIN}
              max={LAYOUT.CHAT_MAX}
              defaultValue={LAYOUT.CHAT_DEFAULT}
              onChange={setChatWidth}
            />
            <ChatPanel style={{ width: chatWidth }} />
          </>
        )}
      </main>
      <Terminal height={terminalHeight} onResize={setTerminalHeight} />
      <StatusBar />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
