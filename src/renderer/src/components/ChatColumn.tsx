import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '../stores/chat-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useLayoutStore } from '../stores/layout-store';
import { useSettingsStore, claudeLabel } from '../stores/settings-store';
import type { ChatImage } from '@shared/types';
import ChatMessage from './ChatMessage';
import Markdown from '../chat/markdown';
import { IconChat, IconClaude, IconClose, IconSend, IconSettings, IconStop } from './icons';

// Client-side commands handled here; every other `/cmd` is forwarded to the
// claude CLI subprocess (slash commands / skills discovered via the init msg).
const LOCAL_COMMANDS: { name: string; desc: string }[] = [
  { name: '/help', desc: 'Show this help' },
  { name: '/theme', desc: 'Toggle dark / light theme' },
  { name: '/new', desc: 'Start a new chat' },
  { name: '/review', desc: 'Review the uncommitted git diff' },
  { name: '/terminal', desc: 'Send the recent terminal output as context' }
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

const COMMAND_ARGS: Record<string, string> = {
  '/effort': '<low|medium|high|xhigh|max|ultracode>',
  '/model': '<model>',
  '/memory': '[topic]',
  '/code-review': '[level] [--fix]',
  '/deep-research': '<question>',
  '/simplify': '[file]',
  '/review': '[note]',
  '/terminal': '<question>'
};

/** One independent Claude conversation (message list + input) in the strip of
 *  ChatColumns. Every store call is keyed on `id`. */
export default function ChatColumn({ id, label }: { id: string; label: string }) {
  const session = useChatStore((s) => s.sessions.find((x) => x.id === id));
  const messages = session?.messages ?? [];
  const running = session?.running ?? false;
  const error = session?.error ?? null;
  const lastUsage = session?.lastUsage ?? null;
  const slashCommands = session?.slashCommands ?? [];
  const planMode = session?.planMode ?? false;
  const awaitingPlanApproval = session?.awaitingPlanApproval ?? false;
  const checkpoints = useChatStore((s) => s.checkpoints);
  const root = useExplorerStore((s) => s.root);
  const chatModel = useSettingsStore((s) => s.chatModel);

  const [input, setInput] = useState('');
  const [help, setHelp] = useState<string | null>(null);
  const [images, setImages] = useState<ChatImage[]>([]);
  const [picker, setPicker] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [modelOpen, setModelOpen] = useState(false);
  const [models, setModels] = useState<{ id: string }[] | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [atPicker, setAtPicker] = useState<{ open: boolean; index: number; files: string[] }>({ open: false, index: 0, files: [] });
  // File list for '@' mentions, cached once per open folder (fs:search walks it).
  const filesCache = useRef<{ root: string | null; list: string[] }>({ root: null, list: [] });
  const atStartRef = useRef(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Command palette fills the input of the ACTIVE column only.
  useEffect(() => {
    const chatInput = (e: Event) => {
      if (useChatStore.getState().activeId !== id) return;
      const text = String((e as CustomEvent).detail ?? '');
      setInput(text);
      setPicker({ open: false, index: 0 });
      setAtPicker({ open: false, index: 0, files: [] });
      inputRef.current?.focus();
    };
    window.addEventListener('fcc:chat-input', chatInput);
    return () => window.removeEventListener('fcc:chat-input', chatInput);
  }, [id]);

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

  // The proposal awaiting approval is the latest assistant text.
  const planText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].text;
    }
    return '';
  }, [messages]);

  const matches = useMemo(() => {
    if (!picker.open) return [];
    const t = input.trimStart();
    if (!t.startsWith('/') || t.includes(' ')) return [];
    const filter = t.slice(1).toLowerCase();
    return allCommands.filter((c) => c.slice(1).toLowerCase().startsWith(filter));
  }, [picker.open, input, allCommands]);

  const st = (): ReturnType<typeof useChatStore.getState> => useChatStore.getState();
  const send = (prompt: string, imgs?: ChatImage[]): void => st().send(id, root ?? '', prompt, imgs);

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

  const mentionStart = (value: string): number => {
    for (let i = value.length - 1; i >= 0; i--) {
      if (value[i] === '@' && (i === 0 || /\s/.test(value[i - 1]))) return i;
    }
    return -1;
  };

  const completeAt = (path: string): void => {
    const start = atStartRef.current;
    if (start < 0) return;
    setInput(`${input.slice(0, start)}@${path} `);
    setAtPicker({ open: false, index: 0, files: [] });
    inputRef.current?.focus();
  };

  const handleChange = async (value: string): Promise<void> => {
    setInput(value);
    const t = value.trimStart();
    if (t.startsWith('/') && !t.includes(' ')) {
      const filter = t.slice(1).toLowerCase();
      const hasMatches = allCommands.some((c) => c.slice(1).toLowerCase().startsWith(filter));
      setPicker({ open: hasMatches, index: 0 });
    } else {
      setPicker({ open: false, index: 0 });
    }
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
        e.preventDefault();
        completeCommand();
        return;
      }
    }
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
    if ((!text && images.length === 0) || !root || running) return;
    if (text === '/') return;
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
        setHelp(null);
        useLayoutStore.getState().toggleTheme();
        return;
      }
      if (cmd === '/new') {
        setHelp(null);
        st().reset(id);
        return;
      }
      if (cmd === '/review') {
        setHelp(null);
        void composeReview(text.replace(/^\/review\s*/, '').trim());
        return;
      }
      if (cmd === '/terminal') {
        setHelp(null);
        void composeTerminal(text.replace(/^\/terminal\s*/, '').trim());
        return;
      }
      setHelp(null);
      send(text);
      return;
    }
    setHelp(null);
    send(text, images.length > 0 ? images : undefined);
  };

  const composeReview = async (note: string): Promise<void> => {
    if (!root) return;
    const diff = await window.fcc.gitDiff().catch(() => null);
    if (!diff) {
      send(note ? `${note} — there are no uncommitted changes.` : 'There are no uncommitted changes to review.');
      return;
    }
    send(
      `Review these uncommitted changes:\n\n${note ? note + '\n' : ''}\`\`\`diff\n${diff}\n\`\`\`\n\nPoint out any bugs, issues, or suggested improvements.`
    );
  };

  const composeTerminal = async (q: string): Promise<void> => {
    if (!root) return;
    const out = await window.fcc.termRecent().catch(() => '');
    if (!out) {
      send(q || 'Explain the terminal output.');
      return;
    }
    send(`${q || 'Explain this terminal output'}\n\n\`\`\`\n${out.slice(0, 4000)}\n\`\`\``);
  };

  const toggleMode = (): void => {
    const next = !(session?.planMode ?? false);
    st().setPlanMode(id, next);
    st().control(id, 'set_permission_mode', { mode: next ? 'plan' : 'acceptEdits' });
  };

  return (
    <div className="chat-column">
      <div className="chat-col-header">
        <span className="title"><IconChat width={12} height={12} />{label}</span>
        {running && (
          <button className="ghost" onClick={() => st().stop(id)} title="Stop">
            <IconStop width={12} height={12} />Stop
          </button>
        )}
        <button className={`ghost plan-toggle${planMode ? ' on' : ''}`} onClick={toggleMode}
          title={planMode ? 'Plan mode is on — proposes before acting' : 'Plan mode is off — act directly'}>
          {planMode ? 'Act' : 'Plan'}
        </button>
        <button className="ghost" onClick={() => st().reset(id)} title="New chat">New</button>
        <button className="icon-btn" onClick={() => st().closeChat(id)} title="Close chat" aria-label="Close chat">
          <IconClose width={11} height={11} />
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
            <div className="icon"><IconClaude width={24} height={24} /></div>
            <div className="title">Ask Claude to build, fix, or explain</div>
            <div className="hint">
              {root
                ? 'Type a request below. Claude reads and edits files inside the open folder.'
                : 'Open a folder first, then start a conversation.'}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                message={m}
                onEdit={m.role === 'user' ? (t) => root && send(t) : undefined}
                onRewind={m.role === 'assistant' && checkpoints[m.id] ? () => st().rewindTo(m.id) : undefined}
              />
            ))}
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

      {awaitingPlanApproval && (
        <div className="plan-approval">
          <span className="pa-text">Claude proposed a plan — approve to implement, or reject.</span>
          <div className="pa-actions">
            <button className="primary" onClick={() => st().approve(id, planText)} disabled={!planText}>
              Approve plan
            </button>
            <button onClick={() => st().reject(id)}>Reject</button>
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
                aria-label="Remove image"
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
        {!root && <div className="chat-hint">Open a folder first</div>}
        <div className="chat-field">
          <textarea
            ref={inputRef}
            value={input}
            placeholder={root ? 'Message Claude…' : ''}
            onChange={(e) => void handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(e) => void handlePaste(e)}
            disabled={!root}
          />
          <div className="chat-box-foot">
            <button
              className={`chat-plan${planMode ? ' on' : ''}`}
              onClick={toggleMode}
              title={planMode ? 'Act mode — click to switch to Plan' : 'Plan mode — click to switch to Act'}
            >
              {planMode ? 'Act' : 'Plan'}
            </button>
            <div className="chat-model" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setModelOpen(false); }}>
              <button
                className="cbf-model"
                title={chatModel}
                onClick={() => {
                  if (!models) void window.fcc.chatModels().then((l) => setModels(l as { id: string }[])).catch(() => setModels([]));
                  setModelOpen((v) => !v);
                }}
              >
                {claudeLabel(chatModel)} <span className="cm-caret">▾</span>
              </button>
              {modelOpen && (
                <div className="chat-model-dd">
                  {(models && models.length ? models : [{ id: chatModel }]).map((m) => (
                    <button
                      key={m.id}
                      className={m.id === chatModel ? 'active' : ''}
                      onClick={() => { useSettingsStore.getState().setChatModel(m.id); setModelOpen(false); }}
                    >
                      {claudeLabel(m.id)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {tokenEstimate > 0 && <span className="cbf-tokens">~{tokenEstimate.toLocaleString()} tokens</span>}
            <span className="cbf-spacer" />
            <button
              className="cbf-gear"
              onClick={() => window.dispatchEvent(new CustomEvent('fcc:open-chat-settings'))}
              title="Chat settings"
              aria-label="Chat settings"
            >
              <IconSettings width={13} height={13} />
            </button>
            {running ? (
              <button className="chat-stop" onClick={() => st().stop(id)} title="Stop" aria-label="Stop">
                <IconStop width={14} height={14} />
              </button>
            ) : (
              <button
                className="chat-send"
                onClick={submit}
                disabled={!root || (!input.trim() && images.length === 0)}
                title="Send (Enter)"
              >
                <IconSend width={14} height={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}