import { useEffect } from 'react';
import Explorer from './components/Explorer';
import Editor from './components/Editor';
import ChatPanel from './components/ChatPanel';
import Terminal from './components/Terminal';
import StatusBar from './components/StatusBar';
import ActivityBar from './components/ActivityBar';
import DragHandle from './components/DragHandle';
import { useLayoutStore, LAYOUT } from './stores/layout-store';

export default function App() {
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const chatVisible = useLayoutStore((s) => s.chatVisible);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const chatWidth = useLayoutStore((s) => s.chatWidth);
  const terminalHeight = useLayoutStore((s) => s.terminalHeight);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const toggleChat = useLayoutStore((s) => s.toggleChat);
  const toggleTerminal = useLayoutStore((s) => s.toggleTerminal);
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const setChatWidth = useLayoutStore((s) => s.setChatWidth);
  const setTerminalHeight = useLayoutStore((s) => s.setTerminalHeight);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar, toggleChat, toggleTerminal]);

  return (
    <div className="app">
      <ActivityBar />
      <aside className="sidebar" style={{ width: sidebarVisible ? sidebarWidth : 0 }}>
        <Explorer />
      </aside>
      <DragHandle
        orientation="vertical"
        value={sidebarWidth}
        min={LAYOUT.SIDEBAR_MIN}
        max={LAYOUT.SIDEBAR_MAX}
        defaultValue={LAYOUT.SIDEBAR_DEFAULT}
        onChange={setSidebarWidth}
      />
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
    </div>
  );
}
