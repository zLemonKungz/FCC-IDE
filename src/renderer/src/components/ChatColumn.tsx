import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '../stores/chat-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useLayoutStore } from '../stores/layout-store';
import { useSettingsStore, claudeLabel, curatedModelOptions } from '../stores/settings-store';
import { effectiveContextWindow } from '@shared/model-context';
import type { ChatImage, GatewayModel } from '@shared/types';
import ChatMessage from './ChatMessage';
import QuestionCard from './QuestionCard';
import Markdown from '../chat/markdown';
import { IconChat, IconClaude, IconClose, IconPencil, IconSend, IconSettings, IconStop } from './icons';

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
  '/simplify': 'Simplify recently changed code'
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

// Module-scope helpers (pure — no component state/props captured), so they keep a
// stable identity across renders for the memoized column.
function st(): ReturnType<typeof useChatStore.getState> {
  return useChatStore.getState();
}

function mentionStart(value: string): number {
  for (let i = value.length - 1; i >= 0; i--) {
    if (value[i] === '@' && (i === 0 || /\s/.test(value[i - 1]))) return i;
  }
  return -1;
}

// Presentational column children (self-contained; no store reads — ChatColumn
// passes values + callbacks it already has). Kept in this file to avoid a new
// module boundary, per the split plan.
function SlashPicker({
  matches,
  index,
  onPick
}: {
  matches: string[];
  index: number;
  onPick: (cmd: string) => void;
}) {
  return (
    <div className="slash-picker">
      {matches.map((c, i) => (
        <div
          key={c}
          className={`sp-item${i === index ? ' active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(c);
          }}
        >
          <span className="sp-cmd">{c}</span>
          <span className="sp-desc">{KNOWN_COMMANDS[c] ?? LOCAL_COMMANDS.find((l) => l.name === c)?.desc ?? 'Send to Claude'}</span>
          {COMMAND_ARGS[c] && <span className="sp-args">{COMMAND_ARGS[c]}</span>}
        </div>
      ))}
    </div>
  );
}

function AtPicker({
  files,
  index,
  onPick
}: {
  files: string[];
  index: number;
  onPick: (path: string) => void;
}) {
  return (
    <div className="slash-picker">
      {files.map((f, i) => (
        <div
          key={f}
          className={`sp-item${i === index ? ' active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(f);
          }}
        >
          <span className="sp-cmd">@{f}</span>
        </div>
      ))}
    </div>
  );
}

function PlanApproval({
  plan,
  onApprove,
  onReject
}: {
  plan: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="plan-approval">
      <span className="pa-text">Claude proposed a plan — approve to implement, or reject.</span>
      <div className="pa-actions">
        <button className="primary" onClick={onApprove} disabled={!plan}>
          Approve plan
        </button>
        <button onClick={onReject}>Reject</button>
      </div>
    </div>
  );
}

function ChatAttachmentRow({
  images,
  onRemove
}: {
  images: ChatImage[];
  onRemove: (i: number) => void;
}) {
  return (
    <div className="chat-attachments">
      {images.map((img, i) => (
        <div key={`${i}-${img.data.length}`} className="attach">
          <img src={`data:${img.media_type};base64,${img.data}`} alt="attached" />
          <button
            className="icon-btn"
            onClick={() => onRemove(i)}
            title="Remove image"
            aria-label="Remove image"
          >
            <IconClose width={11} height={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** One independent Claude conversation (message list + input) in the strip of
 *  ChatColumns. Every store call is keyed on `id`. */
export default memo(function ChatColumn({ id, label }: { id: string; label: string }) {
  const session = useChatStore((s) => s.sessions.find((x) => x.id === id));
  const messages = session?.messages ?? [];
  const running = session?.running ?? false;
  const error = session?.error ?? null;
  const lastUsage = session?.lastUsage ?? null;
  const lastMeta = session?.lastMeta ?? null;
  const controlError = session?.controlError ?? null;
  const contextEstimated = session?.contextEstimated ?? false;
  const contextTokens = session?.contextTokens ?? 0;
  const slashCommands = session?.slashCommands ?? [];
  const planMode = session?.planMode ?? false;
  const awaitingPlanApproval = session?.awaitingPlanApproval ?? false;
  const pendingQuestion = session?.pendingQuestion ?? null;
  const notice = session?.notice ?? null;
  const checkpoints = useChatStore((s) => s.checkpoints);
  const root = useExplorerStore((s) => s.root);
  const chatModel = useSettingsStore((s) => s.chatModel);
  const autoCompactWindow = useSettingsStore((s) => s.autoCompactWindow);

  const [input, setInput] = useState('');
  const [help, setHelp] = useState<string | null>(null);
  const [images, setImages] = useState<ChatImage[]>([]);
  const [picker, setPicker] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [modelOpen, setModelOpen] = useState(false);
  const [models, setModels] = useState<GatewayModel[] | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [atPicker, setAtPicker] = useState<{ open: boolean; index: number; files: string[] }>({ open: false, index: 0, files: [] });
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  // Set true when Escape cancels a rename — blur fires as the input unmounts and
  // would otherwise re-run saveRename, re-saving the draft the user cancelled.
  const renameCancelRef = useRef(false);
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
    // are reading older turns and shouldn't be yanked down. Instant jump on the
    // stream hot path: behavior:'smooth' here queues one smooth animation per
    // token batch mid-stream (they interrupt each other); the explicit
    // scroll-down button is the place for the animated feel.
    if (atBottom) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
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

  // Turn timing from lastMeta — seconds for human-scale durations, ms below 1s.
  const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);

  // Context window: shared resolver prefers the model's real window (correct even
  // when the CLI table under-reports a true-1M model), then the CLI's report,
  // then the user's auto-compact window, else 200k.
  const ctxWindow = Math.max(effectiveContextWindow(chatModel, session?.modelContextWindow ?? 0, autoCompactWindow), 1);
  const ctxLevel = contextTokens / ctxWindow;
  const compacted = session?.compacted ?? false;

  // What Claude is doing right now: the newest running tool across messages
  // (tool_use blocks the reducer is tracking), else a live background task, else
  // a generic thinking state (with the live thinking-token counter). Shown next
  // to the running indicator.
  type CurrentActivity =
    | { kind: 'tool'; label: string }
    | { kind: 'task'; label: string }
    | { kind: 'think'; label: string; tokens: number };
  const currentActivity = useMemo<CurrentActivity | null>(() => {
    if (!running) return null;
    const liveTask = Object.values(session?.liveTasks ?? {})[0];
    // Scan newest→oldest, first running tool wins — no array allocation per
    // message on the hot chat-event path (a .filter() array built every chunk).
    for (let i = messages.length - 1; i >= 0; i--) {
      const tools = messages[i].tools;
      for (let j = tools.length - 1; j >= 0; j--) {
        if (tools[j].state === 'running') return { kind: 'tool', label: tools[j].toolName };
      }
    }
    if (liveTask?.description) return { kind: 'task', label: liveTask.description };
    return { kind: 'think', label: 'thinking', tokens: session?.thinkingTokens ?? 0 };
  }, [running, messages, session?.liveTasks, session?.thinkingTokens]);

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

  const send = useCallback(
    (prompt: string, imgs?: ChatImage[]): void => st().send(id, root ?? '', prompt, imgs),
    [id, root]
  );

  // Stabilized message callbacks so ChatMessage (memo) can bail on unchanged
  // messages during a stream. Only root/id/checkpoints changes legitimately
  // re-create these — those invalidate the message anyway.
  const editMessage = useCallback((t: string) => { if (root) send(t); }, [root, send]);
  // Inline rename: Enter/blur saves, Escape cancels; an empty draft keeps the
  // previous title (renameSession only fires with a non-empty name).
  const saveRename = (): void => {
    if (renameCancelRef.current) {
      renameCancelRef.current = false;
      return;
    }
    const t = draft.trim();
    setRenaming(false);
    if (t) st().renameSession(id, t);
  };
  const rewindMessage = useCallback((msgId: string) => st().rewindTo(msgId), []);
  const regenerateMessage = useCallback((msgId: string) => st().regenerate(id, msgId), [id]);

  // Compact the conversation. The CLI handles /compact over stdin as a regular
  // user turn and replaces the transcript with a summary; show a lightweight
  // "compacting" state via the normal send/result flow. No-op when already busy.
  const compact = (): void => {
    if (running || !root) return;
    send('/compact');
  };

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
        <span className="title">
          <IconChat width={12} height={12} />
          {renaming ? (
            <input
              className="chat-col-title"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              onBlur={saveRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveRename();
                } else if (e.key === 'Escape') {
                  renameCancelRef.current = true;
                  setRenaming(false);
                }
              }}
              aria-label="Chat name"
            />
          ) : (
            <>
              <span className="chat-col-name">{session?.title ?? label}</span>
              <button
                className="icon-btn chat-rename"
                title="Rename chat"
                aria-label="Rename chat"
                onClick={() => {
                  renameCancelRef.current = false;
                  setDraft(session?.title ?? label);
                  setRenaming(true);
                }}
              >
                <IconPencil width={11} height={11} />
              </button>
            </>
          )}
        </span>
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
        role="log"
        aria-live="polite"
        aria-label="Conversation"
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
                onEdit={m.role === 'user' ? editMessage : undefined}
                onRewind={m.role === 'assistant' && checkpoints[m.id] ? () => rewindMessage(m.id) : undefined}
                onRegenerate={m.role === 'assistant' ? () => regenerateMessage(m.id) : undefined}
              />
            ))}
            {running && (
              <div className="running-indicator">
                <span className="dots"><span /><span /><span /></span>
                <span className="ri-label">
                  {currentActivity?.kind === 'tool' && <>Using <b>{currentActivity.label}</b>…</>}
                  {currentActivity?.kind === 'task' && <>{currentActivity.label}</>}
                  {currentActivity && currentActivity.kind === 'think' && (
                    <>
                      Claude is working
                      {currentActivity.tokens > 0 && (
                        <>
                          {' · '}
                          <b>{currentActivity.tokens.toLocaleString()}</b> tokens
                        </>
                      )}
                      …
                    </>
                  )}
                </span>
              </div>
            )}
            {ctxLevel > 1 && !running && (
              <div className="chat-ctx-full">Context is past the window ({Math.round(ctxLevel * 100)}%) — press Compact below.</div>
            )}
            {ctxLevel > 0.55 && ctxLevel <= 1 && !running && !compacted && (
              <div className="chat-ctx-note">
                Context is ~{Math.round(ctxLevel * 100)}% — consider Compact below to free tokens and keep replies fast.
              </div>
            )}
            {compacted && !running && <div className="chat-ctx-note">Conversation was compacted — Claude is working from a summary.</div>}
            {notice && !running && <div className="chat-warn">{notice}</div>}
            {error && <div className="chat-error">{error}</div>}
            {controlError && !running && <div className="chat-warn">{controlError}</div>}
            {lastUsage && !running && (
              <div className="chat-usage">
                {lastUsage.input.toLocaleString()} in · {lastUsage.output.toLocaleString()} out
                {lastUsage.cost != null && ` · $${lastUsage.cost.toFixed(4)}`}
                {lastMeta?.durationMs != null && ` · ${fmtMs(lastMeta.durationMs)}`}
                {lastMeta?.ttftMs != null && ` · first token ${fmtMs(lastMeta.ttftMs)}`}
              </div>
            )}
            {lastMeta && !running && (
              <div className="chat-meta">
                {lastMeta.fastState === 'fast' && <span className="chip" title="Fast mode active">Fast</span>}
                {lastMeta.fastState === 'off' && lastMeta.fastDisabledReason && (
                  <span className="chip warn" title={lastMeta.fastDisabledReason}>Fast · off</span>
                )}
                {lastMeta.fastState !== 'fast' && lastMeta.fastState !== 'off' && lastMeta.fastState != null && (
                  <span className="chip warn">Fast · {lastMeta.fastState}</span>
                )}
                {lastMeta.webSearch + lastMeta.webFetch > 0 && (
                  <span className="chip">web ×{lastMeta.webSearch + lastMeta.webFetch}</span>
                )}
                {lastMeta.tools.map((name) => (
                  <span className="chip tool" key={name} title={name}>{name}</span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {awaitingPlanApproval && (
        <PlanApproval
          plan={planText}
          onApprove={() => st().approve(id, planText)}
          onReject={() => st().reject(id)}
        />
      )}

      {pendingQuestion && (
        <QuestionCard
          questions={pendingQuestion.questions}
          onAnswer={(answers, response) =>
            st().answerQuestion(id, pendingQuestion.requestId, pendingQuestion.questions, answers, response)
          }
          onDismiss={() => st().dismissQuestion(id, pendingQuestion.requestId)}
          disabled={running}
        />
      )}

      {images.length > 0 && (
        <ChatAttachmentRow
          images={images}
          onRemove={(i) => setImages(images.filter((_, j) => j !== i))}
        />
      )}

      <div className="chat-input">
        {picker.open && matches.length > 0 && (
          <SlashPicker matches={matches} index={picker.index} onPick={completeCommand} />
        )}
        {atPicker.open && atPicker.files.length > 0 && (
          <AtPicker files={atPicker.files} index={atPicker.index} onPick={completeAt} />
        )}
        {!root && <div className="chat-hint">Open a folder first</div>}
        <div className="chat-field">
          <textarea
            ref={inputRef}
            value={input}
            placeholder={root ? 'Message Claude…' : ''}
            aria-label="Message Claude"
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
                  if (!models) void window.fcc.chatModels().then((l) => setModels(l)).catch(() => setModels([]));
                  setModelOpen((v) => !v);
                }}
              >
                {claudeLabel(chatModel)} <span className="cm-caret">▾</span>
              </button>

              {modelOpen && (() => {
                const available = curatedModelOptions(models);
                const options = available.length ? available : [{ id: chatModel }];
                return (
                <div className="chat-model-dd">
                  {options.map((m) => (
                    <button
                      key={m.id}
                      className={m.id === chatModel ? 'active' : ''}
                      onClick={() => { useSettingsStore.getState().setChatModel(m.id); setModelOpen(false); }}
                    >
                      {claudeLabel(m.id)}
                    </button>
                  ))}
                </div>
                );
              })()}

            </div>
            {contextTokens > 0 && (
              <span
                className={`cbf-context${ctxLevel > 1 ? ' warn' : ''}${ctxLevel > 1.2 ? ' full' : ''}`}
                title={`Context: ${contextTokens.toLocaleString()} of ${ctxWindow.toLocaleString()} tokens (${claudeLabel(chatModel)})${contextEstimated ? ' — estimated from the loaded transcript, exact after the next turn' : ''}`}
              >
                <i className="ctx-dot" />
                {contextEstimated && '≈ '}{Math.round((contextTokens / ctxWindow) * 100)}%
              </span>
            )}
            {tokenEstimate > 0 && <span className="cbf-tokens">~{tokenEstimate.toLocaleString()} tokens</span>}
            {contextTokens > 0 && (
              <button className="cbf-compact" onClick={compact} disabled={running} title="Compact the conversation (like /compact in the CLI)">
                Compact
              </button>
            )}
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
                aria-label="Send message"
              >
                <IconSend width={14} height={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});