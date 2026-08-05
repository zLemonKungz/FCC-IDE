import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useChatStore } from '../stores/chat-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useFccStore } from '../stores/fcc-store';
import { useLayoutStore } from '../stores/layout-store';
import { useSettingsStore, claudeLabel } from '../stores/settings-store';
import type { ChatImage } from '@shared/types';
import ChatMessage from './ChatMessage';
import ChatSettingsModal from './ChatSettingsModal';
import Markdown from '../chat/markdown';
import { IconChat, IconChevronLeft, IconChevronRight, IconClaude, IconClose, IconSend, IconSettings, IconSparkles, IconStop } from './icons';

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
  '/mcp': 'Manage MCP servers',
  '/effort': 'Set the model effort',
  '/plan': 'Plan before acting (this conversation)',
  '/agents': 'Create / edit custom subagents',
  '/workflows': 'List running and completed workflows',
  '/tasks': 'List running background tasks',
  '/config': 'Open interactive configuration',
  '/init': 'Scaffold a CLAUDE.md',
  '/login': 'Manage account sign-in',
  '/deep-research': 'Orchestrate a research workflow',
  '/code-review': 'Review the current diff',
  '/simplify': 'Simplify recently changed code',
  '/new': 'Start a new chat'
};

// Argument placeholders shown dimmed next to a command's description.
const COMMAND_ARGS: Record<string, string> = {
  '/effort': '<low|medium|high|xhigh|max|ultracode>',
  '/model': '<model>',
  '/memory': '[topic]',
  '/code-review': '[level] [--fix]',
  '/deep-research': '<question>',
  '/simplify': '[file]'
};

export default function ChatPanel({ style }: { style?: CSSProperties }) {
  const messages = useChatStore((s) => s.messages);
  const running = useChatStore((s) => s.running);
  const error = useChatStore((s) => s.error);
  const sessionId = useChatStore((s) => s.sessionId);
  const lastUsage = useChatStore((s) => s.lastUsage);
  const slashCommands = useChatStore((s) => s.slashCommands);
  const planMode = useChatStore((s) => s.planMode);
  const awaitingPlanApproval = useChatStore((s) => s.awaitingPlanApproval);
  const handleEvent = useChatStore((s) => s.handleEvent);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const approve = useChatStore((s) => s.approve);
  const reject = useChatStore((s) => s.reject);
  const setPlanMode = useChatStore((s) => s.setPlanMode);
  const root = useExplorerStore((s) => s.root);
  const install = useFccStore((s) => s.install);
  const setSetupOpen = useFccStore((s) => s.setSetupOpen);
  const toggleTheme = useLayoutStore((s) => s.toggleTheme);
  const chatPosition = useLayoutStore((s) => s.chatPosition);
  const setChatPosition = useLayoutStore((s) => s.setChatPosition);
  const chatModel = useSettingsStore((s) => s.chatModel);
  const [input, setInput] = useState('');
  const [help, setHelp] = useState<string | null>(null);
  const [images, setImages] = useState<ChatImage[]>([]);
  const [picker, setPicker] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [atPicker, setAtPicker] = useState<{ open: boolean; index: number; files: string[] }>({ open: false, index: 0, files: [] });
  // File list for '@' mentions, cached once per open folder (fs:search walks it).
  const filesCache = useRef<{ root: string | null; list: string[] }>({ root: null, list: [] });
  const atStartRef = useRef(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    window.fcc.onChatEvent(({ sessionId: s, message }) => handleEvent(s, message));
  }, [handleEvent]);

  // Command palette: slash commands fill the input so submit()'s
  // local-vs-forward logic and guards apply. Also open this modal on request.
  useEffect(() => {
    const chatInput = (e: Event) => {
      const text = String((e as CustomEvent).detail ?? '');
      setInput(text);
      setPicker({ open: false, index: 0 });
      setAtPicker({ open: false, index: 0, files: [] });
      inputRef.current?.focus();
    };
    const openSettings = () => setSettingsOpen(true);
    window.addEventListener('fcc:chat-input', chatInput);
    window.addEventListener('fcc:open-chat-settings', openSettings);
    return () => {
      window.removeEventListener('fcc:chat-input', chatInput);
      window.removeEventListener('fcc:open-chat-settings', openSettings);
    };
  }, []);

  useEffect(() => {
    // Follow new content only while the user is at the bottom — otherwise they
    // are reading older turns and shouldn't be yanked down.
    if (atBottom) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, help, atBottom]);

  // Auto-grow the input with its content (1 line up to a ~5-line cap).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [input]);

  // Rough token estimate (chars / 4) for the input footer.
  const tokenEstimate = input.trim() ? Math.max(1, Math.round(input.trim().length / 4)) : 0;

  // All discoverable commands: local + CLI slash commands / skills.
  const allCommands = useMemo(() => {
    const loc = LOCAL_COMMANDS.map((c) => c.name);
    const cli = slashCommands.map((c) => (c.startsWith('/') ? c : `/${c}`));
    return Array.from(new Set([...loc, ...cli])).sort();
  }, [slashCommands]);

  // The proposal awaiting approval is the latest assistant text (the CLI emits
  // plan_approval after streaming the plan; the text is already in the store).
  const planText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].text;
    }
    return '';
  }, [messages]);

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
    // Shift+Tab toggles Plan mode (mirrors the header Plan/Act button). The
    // live process keeps its spawn-time permission mode, so it takes effect on
    // the next conversation — same semantics as the button.
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      toggleMode();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>): Promise<void> => {
    // 1) An image File on the clipboard (copied file / most apps' screenshots).
    const fileImages = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (fileImages.length > 0) {
      e.preventDefault();
      const read = (f: File): Promise<ChatImage> =>
        new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => {
            const url = String(r.result);
            res({ media_type: f.type, data: url.split(',')[1] ?? '' });
          };
          r.onerror = () => rej(new Error('read failed'));
          r.readAsDataURL(f);
        });
      const imgs = await Promise.all(fileImages.map(read));
      setImages((prev) => [...prev, ...imgs]);
      return;
    }
    // 2) A raw bitmap (e.g. Win+Shift+S) — the sandboxed renderer can't read it
    //    under file://, so main's clipboard.readImage() produces the base64 PNG.
    if (e.clipboardData.types.includes('image/png') || e.clipboardData.types.includes('image/bitmap')) {
      const png = await window.fcc.clipboardReadImage().catch(() => null);
      if (png) {
        e.preventDefault();
        setImages((prev) => [...prev, { media_type: 'image/png', data: png }]);
      }
    }
  };

  const submit = (): void => {
    const text = input.trim();
    // While a turn runs, sending is blocked (chat-store drops it) — bail
    // BEFORE clearing the box so the draft isn't silently lost.
    if ((!text && images.length === 0) || !root || running) return;
    if (text === '/') return; // a lone '/' isn't a prompt
    setInput('');
    setImages([]);
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
    send(root, text, images.length > 0 ? images : undefined);
  };

  // Plan/Act toggle (header button + Shift+Tab). It flips the *next-conversation*
  // flag AND sends a live set_permission_mode control so an already-open chat
  // switches mode immediately instead of waiting for a new conversation.
  const toggleMode = (): void => {
    const next = !useChatStore.getState().planMode;
    setPlanMode(next);
    useChatStore.getState().control('set_permission_mode', { mode: next ? 'plan' : 'acceptEdits' });
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
        <button
          className={`ghost plan-toggle${planMode ? ' on' : ''}`}
          onClick={toggleMode}
          title={
            planMode
              ? 'Plan mode is on — the next chat proposes a plan before acting. Click to switch back to Act.'
              : 'Plan mode is off. Click to plan first (propose before acting).'
          }
        >
          {planMode ? 'Act' : 'Plan'}
        </button>
        {running && (
          <button className="ghost" onClick={stop}>
            <IconStop width={12} height={12} />
            Stop
          </button>
        )}
        <button
          className="icon-btn"
          onClick={() => setChatPosition(chatPosition === 'right' ? 'center' : 'right')}
          title={chatPosition === 'right' ? 'Move chat over the editor' : 'Move chat back to the side'}
        >
          {chatPosition === 'right' ? <IconChevronLeft width={12} height={12} /> : <IconChevronRight width={12} height={12} />}
        </button>
        <button
          className="icon-btn chat-hide"
          onClick={() => useLayoutStore.getState().toggleChat()}
          title="Hide chat (Ctrl+Shift+`)"
          aria-label="Hide chat"
        >
          <IconClose width={12} height={12} />
        </button>
      </div>

      <div
        className="chat-messages"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
      >
        {!atBottom && (
          <button
            className="chat-scroll-down"
            onClick={() => {
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
              setAtBottom(true);
            }}
            title="Scroll to latest"
            aria-label="Scroll to latest"
          >
            ↓
          </button>
        )}
        {help && <div className="chat-help"><Markdown text={help} /></div>}
        {messages.length === 0 && !running && !help ? (
          <div className="chat-empty">
            <div className="icon">
              <IconClaude width={24} height={24} />
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
      {awaitingPlanApproval && (
        <div className="plan-approval">
          <span className="pa-text">Claude proposed a plan — approve to implement, or reject.</span>
          <div className="pa-actions">
            <button className="primary" onClick={() => approve(planText)} disabled={!planText}>
              Approve plan
            </button>
            <button onClick={reject}>Reject</button>
          </div>
        </div>
      )}
      {images.length > 0 && (
        <div className="chat-attachments">
          {images.map((img, i) => (
            <div key={`${i}-${img.data.length}`} className="attach">
              <img src={`data:${img.media_type};base64,${img.data}`} alt="attached" />
              <button
                className="icon-btn"
                onClick={() => setImages(images.filter((_, j) => j !== i))}
                title="Remove image"
              >
                <IconClose width={11} height={11} />
              </button>
            </div>
          ))}
        </div>
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
                {COMMAND_ARGS[c] && <span className="sp-args">{COMMAND_ARGS[c]}</span>}
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
        <button
          className="ghost chat-gear"
          onClick={() => setSettingsOpen(true)}
          title="Chat settings"
          aria-label="Chat settings"
        >
          <IconSettings width={14} height={14} />
        </button>
        <textarea
          ref={inputRef}
          value={input}
          placeholder={root ? 'Ask Claude to do something... (type / for commands, @ to mention a file)' : ''}
          onChange={(e) => void handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={(e) => void handlePaste(e)}
          disabled={!root}
        />
        <button
          className={`send${running ? ' busy' : ''}`}
          onClick={submit}
          disabled={!root || running || (!input.trim() && images.length === 0)}
          title="Send (Enter)"
        >
          <IconSend width={14} height={14} />
        </button>
      </div>
      <div className="chat-input-footer">
        <span className="cif-left">
          <span className="cif-model" title={chatModel}>
            {claudeLabel(chatModel)}
          </span>
          {planMode && <span className="cif-plan">Plan</span>}
        </span>
        <span className="cif-right">
          {tokenEstimate > 0 && <span className="cif-tokens">~{tokenEstimate.toLocaleString()} tokens</span>}
          <span className="cif-keys">Enter ↵ send · Shift+Enter ⏎ newline</span>
        </span>
      </div>
      {settingsOpen && <ChatSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
