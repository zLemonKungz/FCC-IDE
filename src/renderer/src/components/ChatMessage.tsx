import { useState } from 'react';
import type { ChatMessage as Msg } from '../chat/chat-reducer';
import Markdown from '../chat/markdown';
import ToolCallCard from './ToolCallCard';
import { IconCopy, IconCheck, IconPencil } from './icons';

export default function ChatMessage({
  message,
  onEdit,
  onRewind
}: {
  message: Msg;
  /** for user bubbles — re-submits an edited prompt as a new turn */
  onEdit?: (text: string) => void;
  /** for assistant bubbles — restores files to before this message (checkpoints) */
  onRewind?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  if (message.role === 'user') {
    if (editing !== null) {
      return (
        <div className="msg user edit">
          <textarea
            className="msg-edit"
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            autoFocus
          />
          <div className="msg-edit-actions">
            <button className="primary" disabled={!editing.trim()} onClick={() => onEdit?.(editing)}>
              Re-send
            </button>
            <button onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      );
    }
    return (
      <div className="msg user">
        {message.text}
        {onEdit && (
          <button
            className="msg-edit-btn"
            onClick={() => setEditing(message.text)}
            title="Edit and re-send"
            aria-label="Edit message"
          >
            <IconPencil width={11} height={11} />
          </button>
        )}
        {message.imageCount ? (
          <span className="msg-images">
            🖼 {message.imageCount} image{message.imageCount > 1 ? 's' : ''}
          </span>
        ) : null}
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable — ignore
    }
  };

  return (
    <div className="msg assistant">
      {message.thinking && (
        <details className="msg-thinking" open={false}>
          <summary>Thinking</summary>
          <pre className="msg-thinking-body">{message.thinking}</pre>
        </details>
      )}
      <div className="msg-text">
        <Markdown text={message.text} />
      </div>
      {onRewind && (
        <button
          className="rewind-btn"
          onClick={onRewind}
          title="Rewind files to before this message"
          aria-label="Rewind files to before this message"
        >
          ⟲
        </button>
      )}
      {message.text && (
        <button className="copy-btn" onClick={copy} title="Copy response">
          {copied ? <IconCheck width={12} height={12} /> : <IconCopy width={12} height={12} />}
        </button>
      )}
      {message.tools.map((t) => <ToolCallCard key={t.tool_use_id} tool={t} />)}
    </div>
  );
}
