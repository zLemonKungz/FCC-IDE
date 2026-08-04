import { useState } from 'react';
import type { ChatMessage as Msg } from '../chat/chat-reducer';
import Markdown from '../chat/markdown';
import ToolCallCard from './ToolCallCard';
import { IconCopy, IconCheck } from './icons';

export default function ChatMessage({ message }: { message: Msg }) {
  const [copied, setCopied] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="msg user">
        {message.text}
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
      <div className="msg-text">
        <Markdown text={message.text} />
      </div>
      {message.text && (
        <button className="copy-btn" onClick={copy} title="Copy response">
          {copied ? <IconCheck width={12} height={12} /> : <IconCopy width={12} height={12} />}
        </button>
      )}
      {message.tools.map((t) => <ToolCallCard key={t.tool_use_id} tool={t} />)}
    </div>
  );
}
