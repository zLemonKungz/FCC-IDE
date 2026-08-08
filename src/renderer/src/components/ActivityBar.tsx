import { useLayoutStore } from '../stores/layout-store';
import { IconActivity, IconChat, IconFolder, IconGitBranch, IconMoon, IconSearch, IconSettings, IconSparkles, IconSun, IconTerminal } from './icons';

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
  const openSettings = useLayoutStore((s) => s.openSettings);
  const settingsTab = useLayoutStore((s) => s.settingsTab);

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
  const showSource = (): void => {
    setSidebarView('source');
    if (!sidebarVisible) toggleSidebar();
  };
  const showActivity = (): void => {
    setSidebarView('activity');
    if (!sidebarVisible) toggleSidebar();
  };

  return (
    <nav className="activity-bar">
      <button
        className={`activity ${sidebarVisible && sidebarView === 'explorer' ? 'active' : ''}`}
        title="Explorer (Ctrl+B)"
        aria-label="Explorer"
        onClick={showExplorer}
      >
        <IconFolder width={20} height={20} />
      </button>
      <button
        className={`activity ${sidebarVisible && sidebarView === 'search' ? 'active' : ''}`}
        title="Search (Ctrl+Shift+F)"
        aria-label="Search"
        onClick={showSearch}
      >
        <IconSearch width={20} height={20} />
      </button>
      <button
        className={`activity ${sidebarVisible && sidebarView === 'subagents' ? 'active' : ''}`}
        title="Subagents"
        aria-label="Subagents"
        onClick={showSubagents}
      >
        <IconSparkles width={20} height={20} />
      </button>
      <button
        className={`activity ${sidebarVisible && sidebarView === 'source' ? 'active' : ''}`}
        title="Source control"
        aria-label="Source control"
        onClick={showSource}
      >
        <IconGitBranch width={20} height={20} />
      </button>
      <button
        className={`activity ${sidebarVisible && sidebarView === 'activity' ? 'active' : ''}`}
        title="Activity (agent timeline)"
        aria-label="Activity"
        onClick={showActivity}
      >
        <IconActivity width={20} height={20} />
      </button>
      <button
        className={`activity ${chatVisible ? 'active' : ''}`}
        title="Chat (Ctrl+Shift+`)"
        aria-label="Chat"
        onClick={toggleChat}
      >
        <IconChat width={20} height={20} />
      </button>
      <button
        className={`activity ${terminalVisible ? 'active' : ''}`}
        title="Terminal (Ctrl+`)"
        aria-label="Terminal"
        onClick={toggleTerminal}
      >
        <IconTerminal width={20} height={20} />
      </button>
      <button
        className="activity theme-toggle"
        title={theme === 'dark' ? 'Switch to light theme (Ctrl+K Ctrl+T)' : 'Switch to dark theme (Ctrl+K Ctrl+T)'}
        aria-label="Toggle theme"
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <IconSun width={20} height={20} /> : <IconMoon width={20} height={20} />}
      </button>
      <button
        className={`activity settings-toggle${settingsTab !== null ? ' active' : ''}`}
        title="Settings"
        aria-label="Settings"
        onClick={() => openSettings('general')}
      >
        <IconSettings width={19} height={19} />
      </button>
    </nav>
  );
}
