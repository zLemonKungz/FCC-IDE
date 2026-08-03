import type { ChatMessage as Msg } from '../chat/chat-reducer';
import ToolCallCard from './ToolCallCard';

export default function ChatMessage({ message }: { message: Msg }) {
  if (message.role === 'user') {
    return <div className="msg user">{message.text}</div>;
  }
  return (
    <div className="msg assistant">
      <div className="msg-text">{message.text}</div>
      {message.tools.map((t) => <ToolCallCard key={t.tool_use_id} tool={t} />)}
    </div>
  );
}
