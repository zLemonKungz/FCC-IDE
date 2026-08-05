import { useLayoutStore } from '../stores/layout-store';
import { IconChat, IconFolder, IconMoon, IconSearch, IconSparkles, IconSun, IconTerminal } from './icons';

// Leftmost icon rail — each icon toggles its panel open/closed; the active
// highlight shows which panels are currently open.
export default function ActivityBar() {
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const sidebarView = useLayoutStore((s) => s.sidebarView);
  const chatVisible = useLayoutStore((s) => s.chatVisible);
  const terminalVisible = useLayoutStore((s) => s.terminalVisible);
  const theme = useLayoutStore((s) => s.theme);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const toggleChat = useLayoutStore((s) => s.toggleChat);
  const toggleTerminal = useLayoutStore((s) => s.toggleTerminal);
  const toggleTheme = useLayoutStore((s) => s.toggleTheme);
  const setSidebarView = useLayoutStore((s) => s.setSidebarView);

  const showExplorer = (): void => {
    setSidebarView('explorer');
    if (!sidebarVisible) toggleSidebar();
  };
  const showSearch = (): void => {
    setSidebarView('search');
    if (!sidebarVisible) toggleSidebar();
  };
  const showSubagents = (): void => {
    setSidebarView('subagents');
    if (!sidebarVisible) toggleSidebar();
  };

  return (
    <nav className="activity-bar">
      <button
        className={`activity ${sidebarVisible && sidebarView === 'explorer' ? 'active' : ''}`}
        title="Explorer (Ctrl+B)"
        onClick={showExplorer}
      >
        <IconFolder width={20} height={20} />
      </button>
      <button
        className={`activity ${sidebarVisible && sidebarView === 'search' ? 'active' : ''}`}
        title="Search (Ctrl+Shift+F)"
        onClick={showSearch}
      >
        <IconSearch width={20} height={20} />
      </button>
      <button
        className={`activity ${sidebarVisible && sidebarView === 'subagents' ? 'active' : ''}`}
        title="Subagents"
        onClick={showSubagents}
      >
        <IconSparkles width={20} height={20} />
      </button>
      <button
        className={`activity ${chatVisible ? 'active' : ''}`}
        title="Chat (Ctrl+Shift+`)"
        onClick={toggleChat}
      >
        <IconChat width={20} height={20} />
      </button>
      <button
        className={`activity ${terminalVisible ? 'active' : ''}`}
        title="Terminal (Ctrl+`)"
        onClick={toggleTerminal}
      >
        <IconTerminal width={20} height={20} />
      </button>
      <button
        className="activity theme-toggle"
        title={theme === 'dark' ? 'Switch to light theme (Ctrl+K Ctrl+T)' : 'Switch to dark theme (Ctrl+K Ctrl+T)'}
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <IconSun width={20} height={20} /> : <IconMoon width={20} height={20} />}
      </button>
    </nav>
  );
}
