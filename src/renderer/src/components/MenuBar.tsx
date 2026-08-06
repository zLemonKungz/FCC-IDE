import { useEffect, useState } from 'react';
import { useExplorerStore } from '../stores/explorer-store';
import { useEditorStore } from '../stores/editor-store';
import { useChatStore } from '../stores/chat-store';
import { useLayoutStore } from '../stores/layout-store';

type Item =
  | { label: string; shortcut?: string; disabled?: boolean; run: () => void }
  | { sep: true };

interface Menu {
  label: string;
  items: Item[];
}

// VS Code-style titlebar menus. Actions reuse the same stores/events as the
// command palette and activity bar; dynamic labels (e.g. "Move Terminal Right")
// reflect the current layout state.
function buildMenus(
  root: string | null,
  chatPosition: 'right' | 'center',
  terminalPosition: 'bottom' | 'right'
): Menu[] {
  const layout = useLayoutStore.getState();
  const editor = useEditorStore.getState();
  const chat = useChatStore.getState();
  const explorer = useExplorerStore.getState();
  const openSettings = (): void => {
    window.dispatchEvent(new CustomEvent('fcc:open-settings'));
  };
  const openChatSettings = (): void => {
    window.dispatchEvent(new CustomEvent('fcc:open-chat-settings'));
  };
  const openPalette = (): void => {
    window.dispatchEvent(new CustomEvent('fcc:open-palette'));
  };
  const showSidebar = (view: 'explorer' | 'search'): void => {
    layout.setSidebarView(view);
    if (!layout.sidebarVisible) layout.toggleSidebar();
  };
  const saveActive = (): void => {
    const p = useEditorStore.getState().activePath;
    if (p) void useEditorStore.getState().save(p);
  };
  const closeActive = (): void => {
    const p = useEditorStore.getState().activePath;
    if (p) useEditorStore.getState().close(p);
  };

  return [
    {
      label: 'File',
      items: [
        {
          label: 'New File',
          disabled: !root,
          run: () => window.dispatchEvent(new CustomEvent('fcc:new-file'))
        },
        { label: 'Open Folder…', run: () => void explorer.openRoot() },
        { label: 'Save', shortcut: 'Ctrl+S', disabled: !editor.activePath, run: saveActive },
        { sep: true },
        { label: 'Close Tab', disabled: !editor.activePath, run: closeActive },
        { label: 'Close All Tabs', run: () => editor.closeAll() },
        { sep: true },
        { label: 'Program Settings', run: openSettings }
      ]
    },
    {
      label: 'Edit',
      items: [
        { label: 'Find in Files', shortcut: 'Ctrl+Shift+F', run: () => showSidebar('search') },
        { label: 'Command Palette', shortcut: 'Ctrl+Shift+P', run: openPalette }
      ]
    },
    {
      label: 'View',
      items: [
        { label: 'Command Palette', shortcut: 'Ctrl+Shift+P', run: openPalette },
        { sep: true },
        { label: 'Explorer', run: () => showSidebar('explorer') },
        { label: 'Search', run: () => showSidebar('search') },
        { sep: true },
        { label: 'Toggle Sidebar', shortcut: 'Ctrl+B', run: () => layout.toggleSidebar() },
        { label: 'Toggle Chat', shortcut: 'Ctrl+Shift+`', run: () => layout.toggleChat() },
        { label: 'Toggle Terminal', shortcut: 'Ctrl+`', run: () => layout.toggleTerminal() },
        {
          label: chatPosition === 'right' ? 'Move Chat to Editor' : 'Move Chat to Side',
          run: () => layout.setChatPosition(chatPosition === 'right' ? 'center' : 'right')
        },
        {
          label: terminalPosition === 'bottom' ? 'Move Terminal Right' : 'Move Terminal to Bottom',
          run: () => layout.setTerminalPosition(terminalPosition === 'bottom' ? 'right' : 'bottom')
        },
        { sep: true },
        { label: 'Toggle Theme', shortcut: 'Ctrl+K Ctrl+T', run: () => layout.toggleTheme() }
      ]
    },
    {
      label: 'Chat',
      items: [
        { label: 'New Conversation', run: () => chat.resetActive() },
        {
          label: 'Toggle Plan Mode',
          run: () => {
            const s = useChatStore.getState();
            const id = s.activeId;
            if (!id) return;
            const cur = s.sessions.find((x) => x.id === id)?.planMode ?? false;
            s.setPlanMode(id, !cur);
          }
        },
        { sep: true },
        { label: 'Chat Settings', run: openChatSettings }
      ]
    },
    {
      label: 'Terminal',
      items: [
        {
          label: 'New Terminal',
          run: () => {
            layout.setTerminalVisible(true);
            window.dispatchEvent(new CustomEvent('fcc:term-new'));
          }
        },
        { label: 'Clear Terminal', run: () => window.dispatchEvent(new CustomEvent('fcc:term-clear')) },
        { label: 'Run fcc-claude', run: () => window.dispatchEvent(new CustomEvent('fcc:term-run')) },
        { sep: true },
        {
          label: terminalPosition === 'bottom' ? 'Move Terminal Right' : 'Move Terminal to Bottom',
          run: () => layout.setTerminalPosition(terminalPosition === 'bottom' ? 'right' : 'bottom')
        }
      ]
    },
    {
      label: 'Help',
      items: [
        { label: 'Keyboard Shortcuts', run: () => window.dispatchEvent(new CustomEvent('fcc:open-shortcuts')) },
        { label: "What's New", run: () => window.dispatchEvent(new CustomEvent('fcc:open-whatsnew')) },
        { label: 'Command Palette', shortcut: 'Ctrl+Shift+P', run: openPalette }
      ]
    }
  ];
}

export default function MenuBar() {
  const root = useExplorerStore((s) => s.root);
  const chatPosition = useLayoutStore((s) => s.chatPosition);
  const terminalPosition = useLayoutStore((s) => s.terminalPosition);
  const [open, setOpen] = useState<{ label: string; x: number; y: number } | null>(null);

  const menus = buildMenus(root, chatPosition, terminalPosition);
  const active = open ? menus.find((m) => m.label === open.label) : null;

  // Escape closes the open menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="menubar">
      {menus.map((m) => (
        <button
          key={m.label}
          className={`menu-label${open?.label === m.label ? ' open' : ''}`}
          onClick={(e) => {
            if (open?.label === m.label) {
              setOpen(null);
              return;
            }
            const r = e.currentTarget.getBoundingClientRect();
            setOpen({ label: m.label, x: r.left, y: r.bottom + 4 });
          }}
        >
          {m.label}
        </button>
      ))}
      {open && active && (
        <>
          <div className="ctx-backdrop" onPointerDown={() => setOpen(null)} onContextMenu={(e) => e.preventDefault()} />
          <div className="menu-dropdown" style={{ left: open.x, top: open.y }}>
            {active.items.map((it, i) =>
              'sep' in it ? (
                <div key={i} className="menu-sep" />
              ) : (
                <button
                  key={i}
                  className={`menu-item${it.disabled ? ' disabled' : ''}`}
                  disabled={it.disabled}
                  onClick={() => {
                    it.run();
                    setOpen(null);
                  }}
                >
                  <span>{it.label}</span>
                  {it.shortcut && <span className="shortcut">{it.shortcut}</span>}
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
