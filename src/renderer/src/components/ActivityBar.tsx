import { useLayoutStore } from '../stores/layout-store';
import { IconChat, IconFolder, IconTerminal } from './icons';

// Leftmost icon rail — toggles each panel on/off (VS Code-style activity bar).
export default function ActivityBar() {
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const chatVisible = useLayoutStore((s) => s.chatVisible);
  const terminalVisible = useLayoutStore((s) => s.terminalVisible);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const toggleChat = useLayoutStore((s) => s.toggleChat);
  const toggleTerminal = useLayoutStore((s) => s.toggleTerminal);

  return (
    <nav className="activity-bar">
      <button
        className={`activity ${sidebarVisible ? 'active' : ''}`}
        title="Explorer (Ctrl+B)"
        onClick={toggleSidebar}
      >
        <IconFolder width={20} height={20} />
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
    </nav>
  );
}
