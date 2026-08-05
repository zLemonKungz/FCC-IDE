import { useEffect, useMemo, useRef, useState } from 'react';
import { useLayoutStore } from '../stores/layout-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useEditorStore } from '../stores/editor-store';
import { useChatStore } from '../stores/chat-store';

interface Command {
  id: string;
  label: string;
  run: () => void;
}

const SLASH_LOCAL = ['/help', '/theme', '/new'];

// Ctrl+Shift+P overlay: app commands (view/theme/file/chat) plus the chat slash
// commands. Slash commands fill the chat input via 'fcc:chat-input' so
// ChatPanel.submit() runs its local-vs-forward logic and its guards — the
// palette never calls send() directly.
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const root = useExplorerStore((s) => s.root);

  const commands = useMemo(() => {
    const layout = useLayoutStore.getState();
    const editor = useEditorStore.getState();
    const chat = useChatStore.getState();
    const base: Command[] = [
      { id: 'toggle-sidebar', label: 'View: Toggle Sidebar', run: () => layout.toggleSidebar() },
      { id: 'toggle-terminal', label: 'View: Toggle Terminal', run: () => layout.toggleTerminal() },
      {
        id: 'move-terminal',
        label: `View: Move Terminal ${layout.terminalPosition === 'bottom' ? 'Right' : 'to Bottom'}`,
        run: () => layout.setTerminalPosition(layout.terminalPosition === 'bottom' ? 'right' : 'bottom')
      },
      { id: 'toggle-chat', label: 'View: Toggle Chat', run: () => layout.toggleChat() },
      { id: 'toggle-theme', label: 'Theme: Toggle Dark / Light', run: () => layout.toggleTheme() },
      { id: 'open-folder', label: 'File: Open Folder…', run: () => void useExplorerStore.getState().openRoot() },
      { id: 'save', label: 'File: Save', run: () => { const p = editor.activePath; if (p) void editor.save(p); } },
      { id: 'new-chat', label: 'Chat: New Conversation', run: () => chat.resetActive() },
      {
        id: 'plan',
        label: 'Chat: Toggle Plan Mode',
        run: () => {
          const s = useChatStore.getState();
          const id = s.activeId;
          if (!id) return;
          const cur = s.sessions.find((x) => x.id === id)?.planMode ?? false;
          s.setPlanMode(id, !cur);
        }
      },
      { id: 'fast-mode', label: `Chat: ${chat.fastMode ? 'Disable' : 'Enable'} Fast Mode`, run: () => chat.toggleFastMode() },
      { id: 'thinking', label: `Chat: ${chat.thinking ? 'Disable' : 'Enable'} Thinking`, run: () => chat.toggleThinking() },
      { id: 'program-settings', label: 'Program Settings', run: () => window.dispatchEvent(new CustomEvent('fcc:open-settings')) },
      { id: 'chat-settings', label: 'Chat Settings', run: () => window.dispatchEvent(new CustomEvent('fcc:open-chat-settings')) }
    ];
    for (const c of SLASH_LOCAL) {
      base.push({ id: `slash:${c}`, label: c, run: () => window.dispatchEvent(new CustomEvent('fcc:chat-input', { detail: `${c} ` })) });
    }
    if (root) {
      for (const c of (useChatStore.getState().sessions.find((x) => x.id === useChatStore.getState().activeId)?.slashCommands ?? [])) {
        base.push({ id: `slash:${c}`, label: `/${c}`, run: () => window.dispatchEvent(new CustomEvent('fcc:chat-input', { detail: `/${c} ` })) });
      }
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Only the first 20 matches render — the highlight index must cycle over
  // that same window, or an index ≥20 has no highlighted row.
  const visible = matches.slice(0, 20);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    const n = visible.length;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => (i + 1) % Math.max(n, 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => (i - 1 + Math.max(n, 1)) % Math.max(n, 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const c = matches[index];
      if (c) {
        c.run();
        onClose();
      }
    }
  };

  return (
    <div className="palette-backdrop" onPointerDown={onClose}>
      <div className="command-palette" onPointerDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          placeholder="Type a command…"
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={handleKey}
          spellCheck={false}
        />
        <div className="palette-list">
          {matches.length === 0 && <div className="palette-empty">No matching commands</div>}
          {visible.map((c, i) => (
            <div
              key={c.id}
              className={`palette-item${i === index ? ' active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                c.run();
                onClose();
              }}
            >
              <span className="palette-label">{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
