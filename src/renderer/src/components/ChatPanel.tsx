import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useChatStore } from '../stores/chat-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useFccStore } from '../stores/fcc-store';
import { useLayoutStore } from '../stores/layout-store';
import ChatMessage from './ChatMessage';
import Markdown from '../chat/markdown';
import { IconChat, IconSend, IconSparkles, IconStop } from './icons';

// Client-side commands handled here; every other `/cmd` is forwarded to the
// claude CLI subprocess (slash commands / skills discovered via the init msg).
const LOCAL_COMMANDS: { name: string; desc: string }[] = [
  { name: '/help', desc: 'Show this help' },
  { name: '/theme', desc: 'Toggle dark / light theme' },
  { name: '/new', desc: 'Start a new chat' }
];

const KNOWN_COMMANDS: Record<string, string> = {
  '/clear': 'Clear the conversation context',
  '/compact': 'Compact the conversation history',
  '/cost': 'Show token usage and cost',
  '/memory': 'Manage memory',
  '/model': 'Switch the active model',
  '/statusline': 'Configure the status line',
  '/mcp': 'Manage MCP servers'
};

export default function ChatPanel({ style }: { style?: CSSProperties }) {
  const messages = useChatStore((s) => s.messages);
  const running = useChatStore((s) => s.running);
  const error = useChatStore((s) => s.error);
  const sessionId = useChatStore((s) => s.sessionId);
  const lastUsage = useChatStore((s) => s.lastUsage);
  const slashCommands = useChatStore((s) => s.slashCommands);
  const handleEvent = useChatStore((s) => s.handleEvent);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const root = useExplorerStore((s) => s.root);
  const install = useFccStore((s) => s.install);
  const setSetupOpen = useFccStore((s) => s.setSetupOpen);
  const toggleTheme = useLayoutStore((s) => s.toggleTheme);
  const [input, setInput] = useState('');
  const [help, setHelp] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [atPicker, setAtPicker] = useState<{ open: boolean; index: number; files: string[] }>({ open: false, index: 0, files: [] });
  // File list for '@' mentions, cached once per open folder (fs:search walks it).
  const filesCache = useRef<{ root: string | null; list: string[] }>({ root: null, list: [] });
  const atStartRef = useRef(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    window.fcc.onChatEvent(({ sessionId: s, message }) => handleEvent(s, message));
  }, [handleEvent]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, help]);

  // All discoverable commands: local + CLI slash commands / skills.
  const allCommands = useMemo(() => {
    const loc = LOCAL_COMMANDS.map((c) => c.name);
    const cli = slashCommands.map((c) => (c.startsWith('/') ? c : `/${c}`));
    return Array.from(new Set([...loc, ...cli])).sort();
  }, [slashCommands]);

  // Filtered list shown in the '/' picker (empty when closed).
  const matches = useMemo(() => {
    if (!picker.open) return [];
    const t = input.trimStart();
    if (!t.startsWith('/') || t.includes(' ')) return [];
    const filter = t.slice(1).toLowerCase();
    return allCommands.filter((c) => c.slice(1).toLowerCase().startsWith(filter));
  }, [picker.open, input, allCommands]);

  const buildHelp = (): string => {
    const names = LOCAL_COMMANDS.map((c) => `${c.name}  ${c.desc}`).join('\n');
    const cliNames = allCommands.filter((c) => !LOCAL_COMMANDS.some((l) => l.name === c));
    const cliLine = cliNames.length > 0 ? `\nAvailable: ${cliNames.join(', ')}` : '';
    return `Commands:\n${names}\n\nOther /commands (e.g. /clear, /compact) are sent to Claude.${cliLine}

Keyboard: Ctrl+K Ctrl+T theme, Ctrl+B sidebar, Ctrl+\` terminal, Ctrl+S save
Type anything else to send it to Claude.`;
  };

  const completeCommand = (cmd?: string): void => {
    const target = cmd ?? matches[picker.index];
    if (!target) return;
    setInput(`${target} `);
    setPicker({ open: false, index: 0 });
    inputRef.current?.focus();
  };

  const loadFiles = async (): Promise<void> => {
    const r = root ?? '';
    if (filesCache.current.root === r && filesCache.current.list.length > 0) return;
    const list = await window.fcc.fsSearch().catch(() => [] as string[]);
    filesCache.current = { root: r, list };
  };

  // Where a '@mention' begins: the last '@' preceded by whitespace or input start.
  const mentionStart = (value: string): number => {
    for (let i = value.length - 1; i >= 0; i--) {
      if (value[i] === '@' && (i === 0 || /\s/.test(value[i - 1]))) return i;
    }
    return -1;
  };

  const completeAt = (path: string): void => {
    const start = atStartRef.current;
    if (start < 0) return;
    const value = input;
    setInput(`${value.slice(0, start)}@${path} `);
    setAtPicker({ open: false, index: 0, files: [] });
    inputRef.current?.focus();
  };

  const handleChange = async (value: string): Promise<void> => {
    setInput(value);
    const t = value.trimStart();
    // Open the picker on a lone '/' too — that's how users discover commands.
    if (t.startsWith('/') && !t.includes(' ')) {
      const filter = t.slice(1).toLowerCase();
      const hasMatches = allCommands.some((c) => c.slice(1).toLowerCase().startsWith(filter));
      setPicker({ open: hasMatches, index: 0 });
    } else {
      setPicker({ open: false, index: 0 });
    }
    // '@' file mentions: filter the walk by what follows the @ (no spaces yet).
    const start = mentionStart(value);
    if (start >= 0 && !value.slice(start + 1).includes(' ')) {
      await loadFiles();
      const frag = value.slice(start + 1).toLowerCase();
      const hit = filesCache.current.list.filter((f) => f.toLowerCase().startsWith(frag));
      setAtPicker({ open: hit.length > 0, index: 0, files: hit.slice(0, 50) });
      atStartRef.current = start;
    } else if (atPicker.open) {
      setAtPicker({ open: false, index: 0, files: [] });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (atPicker.open && atPicker.files.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAtPicker((a) => ({ ...a, index: (a.index + 1) % a.files.length }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAtPicker((a) => ({ ...a, index: (a.index - 1 + a.files.length) % a.files.length }));
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        completeAt(atPicker.files[atPicker.index]);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        completeAt(atPicker.files[atPicker.index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAtPicker({ open: false, index: 0, files: [] });
        return;
      }
    }
    if (picker.open && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPicker((p) => ({ ...p, index: (p.index + 1) % matches.length }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPicker((p) => ({ ...p, index: (p.index - 1 + matches.length) % matches.length }));
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        completeCommand();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setPicker({ open: false, index: 0 });
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        // With the picker open, Enter completes the highlighted command
        // instead of forwarding a partial like '/he' to Claude.
        e.preventDefault();
        completeCommand();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const submit = (): void => {
    const text = input.trim();
    // While a turn runs, sending is blocked (chat-store drops it) — bail
    // BEFORE clearing the box so the draft isn't silently lost.
    if (!text || !root || running) return;
    if (text === '/') return; // a lone '/' isn't a prompt
    setInput('');
    setPicker({ open: false, index: 0 });
    setAtPicker({ open: false, index: 0, files: [] });
    const [cmd] = text.toLowerCase().split(/\s+/);
    if (text.startsWith('/')) {
      if (cmd === '/help') {
        setHelp(buildHelp());
        return;
      }
      if (cmd === '/theme') {
        toggleTheme();
        return;
      }
      if (cmd === '/new') {
        setHelp(null);
        useChatStore.getState().reset();
        return;
      }
      // Everything else — /clear, /compact, skills, ... — goes to Claude.
      setHelp(null);
      send(root, text);
      return;
    }
    setHelp(null);
    send(root, text);
  };

  return (
    <div className="chat-pane" style={style}>
      <div className="chat-header">
        <span className="title">
          <IconChat width={14} height={14} />
          Claude chat
        </span>
        {sessionId && (
          <button className="ghost" onClick={() => useChatStore.getState().reset()}>
            New chat
          </button>
        )}
        {running && (
          <button className="ghost" onClick={stop}>
            <IconStop width={12} height={12} />
            Stop
          </button>
        )}
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {help && <div className="chat-help"><Markdown text={help} /></div>}
        {messages.length === 0 && !running && !help ? (
          <div className="chat-empty">
            <div className="icon">
              <IconSparkles width={20} height={20} />
            </div>
            <div className="title">Ask Claude to build, fix, or explain</div>
            <div className="hint">
              {root
                ? 'Type a request below. Claude reads and edits files inside the open folder.'
                : 'Open a folder first, then start a conversation.'}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) => <ChatMessage key={m.id} message={m} />)}
            {running && (
              <div className="running-indicator">
                <span className="dots"><span /><span /><span /></span>
                Claude is working
              </div>
            )}
            {error && <div className="chat-error">{error}</div>}
            {lastUsage && !running && (
              <div className="chat-usage">
                {lastUsage.input.toLocaleString()} in · {lastUsage.output.toLocaleString()} out
                {lastUsage.cost != null && ` · $${lastUsage.cost.toFixed(4)}`}
              </div>
            )}
          </>
        )}
      </div>

      {install && !install.installed && (
        <button className="fcc-install-banner" onClick={() => setSetupOpen(true)}>
          <IconSparkles width={12} height={12} />
          FCC isn’t installed — click to set up
        </button>
      )}
      <div className="chat-input">
        {picker.open && matches.length > 0 && (
          <div className="slash-picker">
            {matches.map((c, i) => (
              <div
                key={c}
                className={`sp-item${i === picker.index ? ' active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  completeCommand(c);
                }}
              >
                <span className="sp-cmd">{c}</span>
                <span className="sp-desc">{KNOWN_COMMANDS[c] ?? LOCAL_COMMANDS.find((l) => l.name === c)?.desc ?? 'Send to Claude'}</span>
              </div>
            ))}
          </div>
        )}
        {atPicker.open && atPicker.files.length > 0 && (
          <div className="slash-picker">
            {atPicker.files.map((f, i) => (
              <div
                key={f}
                className={`sp-item${i === atPicker.index ? ' active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  completeAt(f);
                }}
              >
                <span className="sp-cmd">@{f}</span>
              </div>
            ))}
          </div>
        )}
        {!root && <div className="hint">Open a folder first</div>}
        <textarea
          ref={inputRef}
          value={input}
          placeholder={root ? 'Ask Claude to do something... (type / for commands, @ to mention a file)' : ''}
          onChange={(e) => void handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!root}
        />
        <button className="send" onClick={submit} disabled={!root || running || !input.trim()} title="Send">
          <IconSend width={14} height={14} />
        </button>
      </div>
    </div>
  );
}
