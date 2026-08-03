import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useChatStore } from '../stores/chat-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useLayoutStore } from '../stores/layout-store';
import ChatMessage from './ChatMessage';
import Markdown from '../chat/markdown';
import { IconChat, IconSend, IconSparkles, IconStop } from './icons';

const HELP_TEXT = `Available commands:
/help  Show this help
/clear New chat
/theme Toggle dark / light theme

Keyboard: Ctrl+K Ctrl+T theme · Ctrl+B sidebar · Ctrl+\` terminal · Ctrl+S save
Type anything else to send it to Claude.`;

export default function ChatPanel({ style }: { style?: CSSProperties }) {
  const messages = useChatStore((s) => s.messages);
  const running = useChatStore((s) => s.running);
  const error = useChatStore((s) => s.error);
  const sessionId = useChatStore((s) => s.sessionId);
  const lastUsage = useChatStore((s) => s.lastUsage);
  const handleEvent = useChatStore((s) => s.handleEvent);
  const start = useChatStore((s) => s.start);
  const stop = useChatStore((s) => s.stop);
  const root = useExplorerStore((s) => s.root);
  const toggleTheme = useLayoutStore((s) => s.toggleTheme);
  const [input, setInput] = useState('');
  const [help, setHelp] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.fcc.onChatEvent(({ sessionId: s, message }) => handleEvent(s, message));
  }, [handleEvent]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, help]);

  const send = () => {
    const text = input.trim();
    if (!text || !root) return;
    setInput('');
    if (text.startsWith('/')) {
      const [cmd] = text.toLowerCase().split(/\s+/);
      if (cmd === '/help') {
        setHelp(HELP_TEXT);
      } else if (cmd === '/clear' || cmd === '/new') {
        setHelp(null);
        useChatStore.getState().reset();
      } else if (cmd === '/theme') {
        toggleTheme();
      } else {
        setHelp(`Unknown command: ${cmd} — type /help for the list.`);
      }
      return;
    }
    start(root, text);
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
                ? 'Type a request below — Claude reads and edits files inside the open folder.'
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
                {lastUsage.cost !== undefined && ` · $${lastUsage.cost.toFixed(4)}`}
              </div>
            )}
          </>
        )}
      </div>

      <div className="chat-input">
        {!root && <div className="hint">Open a folder first</div>}
        <textarea
          value={input}
          placeholder={root ? 'Ask Claude to do something...' : ''}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={!root}
        />
        <button className="send" onClick={send} disabled={!root || !input.trim()} title="Send">
          <IconSend width={14} height={14} />
        </button>
      </div>
    </div>
  );
}
