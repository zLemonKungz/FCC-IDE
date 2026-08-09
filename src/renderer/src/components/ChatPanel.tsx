import { useEffect, useState, type CSSProperties } from 'react';
import { useChatStore } from '../stores/chat-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useFccStore } from '../stores/fcc-store';
import { useLayoutStore } from '../stores/layout-store';
import ChatColumn from './ChatColumn';
import { IconChat, IconChevronLeft, IconChevronRight, IconClose, IconPlus, IconSparkles } from './icons';

/** The chat panel container: one header (title, add-chat, move/hide) over a
 *  horizontally-scrolling strip of independent ChatColumns. Owns the global
 *  chat IPC subscription and the settings modal. */
export default function ChatPanel({ style }: { style?: CSSProperties }) {
  const sessions = useChatStore((s) => s.sessions);
  const addChat = useChatStore((s) => s.addChat);
  const handleEvent = useChatStore((s) => s.handleEvent);
  const root = useExplorerStore((s) => s.root);
  const install = useFccStore((s) => s.install);
  const setSetupOpen = useFccStore((s) => s.setSetupOpen);
  const chatPosition = useLayoutStore((s) => s.chatPosition);
  const setChatPosition = useLayoutStore((s) => s.setChatPosition);

  useEffect(() => {
    // ChatPanel unmounts when the chat is hidden or switched right/center, and
    // every remount used to stack a new ipcRenderer listener on the shared
    // evtChat channel — after a couple of show/hide cycles each stream event
    // was delivered N times (duplicate bubbles, doubled usage). Unsubscribe on
    // unmount so the subscription lives exactly as long as the panel.
    return window.fcc.onChatEvent(({ sessionId: s, message }) => handleEvent(s, message));
  }, [handleEvent]);

  // Terminal "Fix" button → review the captured error output in the ACTIVE chat.
  useEffect(() => {
    const onFix = (e: Event): void => {
      if (!root) return;
      const out = (e as CustomEvent).detail?.output ?? '';
      const content = `Fix this terminal error:\n\n\`\`\`\n${(out || 'no output captured').slice(0, 4000)}\n\`\`\`\n\nDiagnose the failure and suggest or apply a fix.`;
      useChatStore.getState().sendActive(root, content);
    };
    window.addEventListener('fcc:ai-fix', onFix);
    return () => window.removeEventListener('fcc:ai-fix', onFix);
  }, [root]);

  return (
    <div className="chat-pane" style={style}>
      <div className="chat-header">
        <span className="title">
          <IconChat width={14} height={14} />
          Claude chat
        </span>
        <button className="ghost" onClick={addChat} title="Add chat">
          <IconPlus width={13} height={13} />Add
        </button>
        <button className="ghost" onClick={() => useChatStore.getState().parallelWorkers(3)} title="Run the active prompt in 3 parallel columns">
          ⊞3
        </button>
        <button className="ghost" onClick={() => useChatStore.getState().mergeWorkers()} title="Combine all columns into one answer">
          Σ merge
        </button>
        <button
          className="icon-btn"
          aria-label="Move chat"
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

      <div className="chat-col-strip">
        {sessions.map((s, i) => (
          <ChatColumn key={s.id} id={s.id} label={`Chat ${i + 1}`} />
        ))}
      </div>

      {install && !install.installed && (
        <button className="fcc-install-banner" onClick={() => setSetupOpen(true)}>
          <IconSparkles width={12} height={12} />
          FCC isn’t installed — click to set up
        </button>
      )}
    </div>
  );
}