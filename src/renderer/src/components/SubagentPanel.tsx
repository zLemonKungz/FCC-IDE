import { useMemo, useState } from 'react';
import { useActiveChat } from '../stores/chat-store';
import type { ChatMessage, ToolCall } from '../chat/chat-reducer';
import Markdown from '../chat/markdown';
import ToolCallCard from './ToolCallCard';
import { IconSparkles } from './icons';

// Live Subagents view (sidebar). Reads the chat transcript's nested subagent
// messages (produced by the reducer from --forward-subagent-text output) and
// groups them per spawning Agent/Task call, so each delegated worker shows its
// own transcript, thinking, and tool calls — like the CLI's subagent tree.
interface SubagentGroup {
  parentId: string;
  label: string;
  text: string;
  thinking: string;
  tools: ToolCall[];
}

/** Subagent display label from the parent message's Agent/Task call input. */
function spawnLabel(messages: ChatMessage[], child: ChatMessage): string {
  const parent = messages.find((m) => m.id === child.parentId);
  const spawn = parent?.tools.find(
    (t) => t.toolName === 'Agent' || t.toolName === 'Task' || t.toolName === 'Subagent'
  );
  const input = spawn?.input as { name?: string; subagentType?: string } | undefined;
  const name = input?.name ?? input?.subagentType;
  return name ? `${spawn?.toolName}: ${name}` : 'Subagent';
}

export default function SubagentPanel() {
  const active = useActiveChat();
  const messages = active?.messages ?? [];
  const activeSessionId = active?.id ?? null;
  const liveTasks = active?.liveTasks ?? {};
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, SubagentGroup>();
    for (const m of messages) {
      if (!m.parentId) continue;
      const g = map.get(m.parentId) ?? { parentId: m.parentId, label: '', text: '', thinking: '', tools: [] };
      g.text += m.text;
      g.thinking += m.thinking ?? '';
      const seen = new Set(g.tools.map((t) => t.tool_use_id));
      for (const t of m.tools) {
        if (!seen.has(t.tool_use_id)) g.tools.push(t);
      }
      g.label = spawnLabel(messages, m);
      map.set(m.parentId, g);
    }
    return Array.from(map.values());
  }, [messages]);

  const toggle = (id: string): void =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="explorer">
      <div className="explorer-header">
        <span className="title">
          <IconSparkles width={13} height={13} />
          Subagents
        </span>
      </div>
      <div className="explorer-body">
        {!activeSessionId && (
          <div className="empty-state">
            <div className="empty-title">No subagents</div>
            <div className="empty-hint">Start a chat — delegated work will show up here.</div>
          </div>
        )}
        {activeSessionId && groups.length === 0 && (
          <div className="empty-state">
            <div className="empty-title">No subagents yet</div>
            <div className="empty-hint">Claude will list subagents it spawns (Agent / Task) here.</div>
          </div>
        )}
        {activeSessionId && Object.values(liveTasks).length > 0 && (
          <div className="subagent-running">
            <div className="subagent-running-title">Running</div>
            {Object.values(liveTasks).map((t) => (
              <div key={t.taskId} className="subagent-running-item" title={`${t.agent} · ${t.tokens ? t.tokens.toLocaleString() + ' tok' : ''}`}>
                <span className="sri-dot" />
                <span className="sri-desc">{t.description}</span>
                <span className="sri-meta">{t.lastTool ?? 'working…'}{t.tokens ? ` · ${t.tokens.toLocaleString()} tok` : ''}</span>
              </div>
            ))}
          </div>
        )}
        {groups.map((g) => {
          const isOpen = open.has(g.parentId);
          return (
            <div key={g.parentId} className="subagent-card">
              <button className="subagent-head" onClick={() => toggle(g.parentId)}>
                <span className="subagent-caret">{isOpen ? '▾' : '▸'}</span>
                <IconSparkles width={13} height={13} />
                <span className="subagent-label">{g.label}</span>
                <span className="subagent-meta">
                  {g.text || g.thinking ? 'done' : 'running'} · {g.tools.length} tool{g.tools.length !== 1 ? 's' : ''}
                </span>
              </button>
              {isOpen && (
                <div className="subagent-detail">
                  {g.thinking && <pre className="subagent-thinking">{g.thinking}</pre>}
                  {g.text && (
                    <div className="subagent-text">
                      <Markdown text={g.text} />
                    </div>
                  )}
                  {g.tools.map((t) => (
                    <ToolCallCard key={t.tool_use_id} tool={t} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}