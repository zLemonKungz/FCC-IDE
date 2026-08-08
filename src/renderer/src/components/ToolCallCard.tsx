import { useState, type ComponentType } from 'react';
import type { ToolCall } from '../chat/chat-reducer';
import { IconFile, IconPencil, IconSearch, IconSparkles, IconTerminal } from './icons';

const ICONS: Record<string, ComponentType<{ width?: number; height?: number }>> = {
  Bash: IconTerminal,
  Edit: IconPencil,
  Write: IconPencil,
  Read: IconFile,
  Glob: IconSearch,
  Grep: IconSearch,
  Task: IconSparkles
};

export default function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const ToolIcon = ICONS[tool.toolName] ?? IconSparkles;
  const label =
    tool.toolName === 'Edit' || tool.toolName === 'Write'
      ? (tool.input as { file_path?: string })?.file_path
      : (tool.input as { command?: string })?.command ?? (tool.input as { pattern?: string })?.pattern ?? '';
  return (
    <div className={`tool-card ${tool.state}`}>
      <div className="tool-line" onClick={() => setOpen(!open)}>
        <span className="tool-icon">
          <ToolIcon width={14} height={14} />
        </span>
        <span className="tool-name">{tool.toolName}</span>
        <span className="tool-label">{label}</span>
        <span className="tool-state">
          {tool.state === 'running' ? 'Running' : tool.state === 'success' ? 'Done' : 'Failed'}
        </span>
      </div>
      {open && (
        <>
          <pre className="tool-input">{JSON.stringify(tool.input, null, 2)}</pre>
          {tool.stderr && tool.state === 'error' ? (
            <pre className="tool-output err">{tool.stderr}</pre>
          ) : tool.output ? (
            <pre className="tool-output">{tool.output}</pre>
          ) : null}
        </>
      )}
    </div>
  );
}
