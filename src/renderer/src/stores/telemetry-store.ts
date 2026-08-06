import { create } from 'zustand';
import type { ChatMessage, ToolCall } from '../chat/chat-reducer';

// Per-turn agent telemetry, fed by chat-store's event funnel. One record per
// finished assistant turn: which files it edited, the ordered tool sequence,
// token usage, and whether a pre-turn snapshot (checkpoint) exists for the
// Time Machine preview/restore.

export interface TurnTool {
  name: string;
  file?: string;
  state: ToolCall['state'];
}

export interface TurnRecord {
  /** the turn's assistant message id — matches chat-store checkpoints key */
  id: string;
  /** renderer session id (chat column) */
  sessionId: string;
  at: number;
  summary: string;
  /** file path → edit/write call count for the turn (successful calls only) */
  touched: Record<string, number>;
  /** ordered tool calls: the main turn's tools, then each subagent child's */
  tools: TurnTool[];
  usage: { input: number; output: number; cost?: number } | null;
  hasSnapshot: boolean;
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const SUMMARY_LEN = 160;

/** The files a tool call edits (Edit/Write/NotebookEdit carry file_path). */
function toolFile(t: ToolCall): string | undefined {
  const input = t.input as { file_path?: string } | undefined;
  return typeof input?.file_path === 'string' ? input.file_path : undefined;
}

/** Build the record for the just-finished turn from a session's full messages. */
function buildTurnRecord(
  sessionId: string,
  messages: ChatMessage[],
  checkpoints: Record<string, Record<string, string>>,
  usage: TurnRecord['usage']
): TurnRecord | null {
  // The turn's main assistant message is the last main (non-subagent) one.
  let mainIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && !messages[i].parentId) {
      mainIdx = i;
      break;
    }
  }
  if (mainIdx < 0) return null;
  const main = messages[mainIdx];

  // Subagent children of this turn share the main message's tools' agent id —
  // collect every assistant message at/after mainIdx (main + its children).
  const turnMessages = messages.slice(mainIdx);
  const tools: TurnTool[] = [];
  const touched: Record<string, number> = {};
  for (const m of turnMessages) {
    for (const t of m.tools) {
      const file = toolFile(t);
      if (EDIT_TOOLS.has(t.toolName)) {
        if (t.state !== 'error' && file) touched[file] = (touched[file] ?? 0) + 1;
      }
      tools.push({ name: t.toolName, file, state: t.state });
    }
  }

  return {
    id: main.id,
    sessionId,
    at: Date.now(),
    summary: main.text.trim().slice(0, SUMMARY_LEN),
    touched,
    tools,
    usage,
    hasSnapshot: !!checkpoints[main.id]
  };
}

interface TelemetryState {
  turns: TurnRecord[];
  /** Record the turn that just finished (result / error / stopped). */
  finalizeTurn: (
    sessionId: string,
    messages: ChatMessage[],
    checkpoints: Record<string, Record<string, string>>,
    usage: TurnRecord['usage']
  ) => void;
  /** Drop every turn of a closed/reset chat column. */
  forgetSession: (sessionId: string) => void;
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  turns: [],
  finalizeTurn: (sessionId, messages, checkpoints, usage) => {
    const rec = buildTurnRecord(sessionId, messages, checkpoints, usage);
    if (!rec) return;
    set((s) => {
      const rest = s.turns.filter((t) => !(t.sessionId === sessionId && t.id === rec.id));
      return { turns: [...rest, rec] };
    });
  },
  forgetSession: (sessionId) =>
    set((s) => ({ turns: s.turns.filter((t) => t.sessionId !== sessionId) }))
}));