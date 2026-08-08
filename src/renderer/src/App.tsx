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
import SubagentPanel from './components/SubagentPanel';
import SourceControlPanel from './components/SourceControlPanel';
import ActivityPanel from './components/ActivityPanel';
import SettingsPage from './components/SettingsPage';
import { useLayoutStore, LAYOUT } from './stores/layout-store';
import { useSettingsStore, effectiveEffort } from './stores/settings-store';
import { useExplorerStore } from './stores/explorer-store';
import { useEditorStore } from './stores/editor-store';

export default function App() {
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const chatVisible = useLayoutStore((s) => s.chatVisible);
  const terminalVisible = useLayoutStore((s) => s.terminalVisible);
  const terminalPosition = useLayoutStore((s) => s.terminalPosition);
  const chatPosition = useLayoutStore((s) => s.chatPosition);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const chatWidth = useLayoutStore((s) => s.chatWidth);
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
  const chatModel = useSettingsStore((s) => s.chatModel);
  const chatMaxTurns = useSettingsStore((s) => s.chatMaxTurns);
  const autoCompactWindow = useSettingsStore((s) => s.autoCompactWindow);
  const chatEffort = useSettingsStore((s) => s.chatEffort);

  const pendingChord = useRef<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // The menu bar opens the command palette through this event (the palette is
  // App-level state, not a store).
  useEffect(() => {
    const open = () => setPaletteOpen(true);
    window.addEventListener('fcc:open-palette', open);
    return () => window.removeEventListener('fcc:open-palette', open);
  }, []);

  // The menu bar / palette open the unified Settings page through events: the
  // "settings" gear targets the General tab, "chat settings" targets the Chat
  // tab. Escape closes it.
  const settingsTab = useLayoutStore((s) => s.settingsTab);
  const openSettings = useLayoutStore((s) => s.openSettings);
  useEffect(() => {
    const openGeneral = () => openSettings('general');
    const openChat = () => openSettings('chat');
    window.addEventListener('fcc:open-settings', openGeneral);
    window.addEventListener('fcc:open-chat-settings', openChat);
    return () => {
      window.removeEventListener('fcc:open-settings', openGeneral);
      window.removeEventListener('fcc:open-chat-settings', openChat);
    };
  }, [openSettings]);

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
        if (!useLayoutStore.getState().sidebarVisible) toggleSidebar();
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
    // Push the effective (model-snapped) effort so the CLI never receives a
    // level the current model can't honor.
    void window.fcc.setChatSettings({
      model: chatModel,
      maxTurns: chatMaxTurns,
      autoCompactWindow,
      effort: effectiveEffort(chatModel, chatEffort)
    });
  }, [chatModel, chatMaxTurns, autoCompactWindow, chatEffort]);

  // Workspace restore. The persisted stores hold the folder path and tab paths
  // only; contents are re-read from disk. Order matters: the folder must be
  // registered in the main process (fs:open-root) BEFORE any file IPC, or the
  // "No folder open" guard rejects every list/read.
  const restored = useRef(false);
  // Auto-check for updates once on launch (packaged builds; respects the toggle).
  useEffect(() => {
    void window.fcc
      .appInfo()
      .then((i) => {
        if (i.packaged && useSettingsStore.getState().autoUpdate) void window.fcc.updatesCheck();
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const root = useExplorerStore.getState().root;
    const tabs = useEditorStore.getState().tabs;
    const active = useEditorStore.getState().activePath;
    const restore = async (): Promise<void> => {
      if (!root) {
        if (tabs.length > 0) useEditorStore.setState({ tabs: [], activePath: null });
        return;
      }
      const ok = await window.fcc.openFolderAt(root);
      if (!ok) {
        useExplorerStore.setState({ root: null, children: {}, expanded: {} });
        useEditorStore.setState({ tabs: [], activePath: null });
        return;
      }
      const entries = await window.fcc.fsList(root);
      useExplorerStore.setState({ root, children: { [root]: entries }, expanded: { [root]: true } });
      if (tabs.length === 0) return;
      useEditorStore.setState({ tabs: [], activePath: null });
      await Promise.all(tabs.map((t) => useEditorStore.getState().open(t.path).catch(() => undefined)));
      if (active) useEditorStore.setState({ activePath: active });
    };
    void restore();
  }, []);

  // The right column holds the side chat and/or a right-docked terminal. When
  // the chat is centered it leaves the column, which then only exists for the
  // terminal — and the centered chat overlay stops at the column's edge.
  const rightColVisible =
    (chatVisible && chatPosition === 'right') || (terminalVisible && terminalPosition === 'right');

  return (
    <div className={`app${isDragging ? ' dragging' : ''}`}>
      <Titlebar />
      <ActivityBar />
      <aside className="sidebar" style={{ width: sidebarVisible ? sidebarWidth : 0 }}>
        {sidebarView === 'search' ? (
          <SearchPanel />
        ) : sidebarView === 'subagents' ? (
          <SubagentPanel />
        ) : sidebarView === 'source' ? (
          <SourceControlPanel />
        ) : sidebarView === 'activity' ? (
          <ActivityPanel />
        ) : (
          <Explorer />
        )}
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
        {/* The editor always stays mounted so Monaco buffers and tab state
            survive; the centered chat overlays it (inset), and a right-docked
            terminal still gets its column. */}
        <Editor />
        {chatPosition === 'center' && chatVisible && (
          <ChatPanel
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              right: rightColVisible ? chatWidth : 0
            }}
          />
        )}
        {rightColVisible && (
          <>
            <DragHandle
              orientation="vertical"
              value={chatWidth}
              min={LAYOUT.CHAT_MIN}
              max={LAYOUT.CHAT_MAX}
              defaultValue={LAYOUT.CHAT_DEFAULT}
              onChange={setChatWidth}
              invert
            />
            <div className="right-col" style={{ width: chatWidth }}>
              {chatPosition === 'right' && chatVisible && (
                <ChatPanel style={{ flex: '1 1 auto', minHeight: 0 }} />
              )}
              {terminalPosition === 'right' && <Terminal position="right" />}
            </div>
          </>
        )}
      </main>
      {terminalPosition === 'bottom' && <Terminal position="bottom" />}
      <StatusBar />
      {settingsTab && <SettingsPage />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
