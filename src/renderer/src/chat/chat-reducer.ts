export interface ToolCall {
  tool_use_id: string;
  toolName: string;
  input: unknown;
  state: 'running' | 'success' | 'error';
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools: ToolCall[];
}
export interface ChatUiState {
  messages: ChatMessage[];
  running: boolean;
  error: string | null;
  sessionId: string | null;
  /** usage of the last completed turn, from the SDK result message */
  lastUsage: { input: number; output: number; cost?: number } | null;
  /** slash commands / skills discovered from the CLI init message (no leading '/') */
  slashCommands: string[];
}
export interface FileEvent {
  path: string;
}

export type ChatEvent =
  | { type: 'user-message'; text: string }
  | { type: 'assistant'; message: { content?: { type: string; text?: string; id?: string; name?: string; input?: unknown }[] } }
  | { type: 'user'; message?: { content?: { type: string; tool_use_id?: string; is_error?: boolean }[] } }
  | {
      type: 'result';
      is_error?: boolean;
      errors?: string[];
      usage?: { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number };
      total_cost_usd?: number;
    }
  | { type: 'session-id'; session_id: string }
  | { type: 'slash-commands'; commands: string[] }
  | { type: 'started' }
  | { type: 'stopped' }
  | { type: 'error'; message: string };

export function emptyChatState(): ChatUiState {
  return { messages: [], running: false, error: null, sessionId: null, lastUsage: null, slashCommands: [] };
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type SdkContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; is_error?: boolean };

export function applyChatEvent(
  state: ChatUiState,
  ev: ChatEvent
): { state: ChatUiState; fileEvents: FileEvent[] } {
  const fileEvents: FileEvent[] = [];
  let s = state;

  switch (ev.type) {
    case 'user-message':
      s = { ...s, messages: [...s.messages, { id: uid(), role: 'user', text: ev.text, tools: [] }] };
      break;

    case 'assistant': {
      const content = (ev.message?.content ?? []) as unknown as SdkContentBlock[];
      const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const toolBlocks = content.filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use');
      const last = s.messages[s.messages.length - 1];
      const isAssistantTurn = last && last.role === 'assistant';
      const baseTools = isAssistantTurn ? last.tools : [];
      // merge running tool blocks: skip ones already tracked (by id)
      const mergedTools = [...baseTools];
      for (const tb of toolBlocks) {
        if (!mergedTools.some((t) => t.tool_use_id === tb.id)) {
          mergedTools.push({ tool_use_id: tb.id, toolName: tb.name, input: tb.input, state: 'running' });
        }
      }
      const msg: ChatMessage = {
        id: isAssistantTurn ? last.id : uid(),
        role: 'assistant',
        text: isAssistantTurn ? last.text + text : text,
        tools: mergedTools
      };
      s = isAssistantTurn
        ? { ...s, messages: s.messages.slice(0, -1).concat(msg) }
        : { ...s, messages: [...s.messages, msg] };
      break;
    }

    case 'user': {
      // SDK user message carrying tool_result blocks — mark matching tools done.
      const content = (ev.message?.content ?? []) as unknown as SdkContentBlock[];
      const results = content.filter((b): b is { type: 'tool_result'; tool_use_id: string; is_error?: boolean } => b.type === 'tool_result');
      if (results.length === 0) break;
      const last = s.messages[s.messages.length - 1];
      if (!last || last.role !== 'assistant') break;
      const tools: ToolCall[] = last.tools.map((t) => {
        const r = results.find((x) => x.tool_use_id === t.tool_use_id);
        if (!r) return t;
        const state: ToolCall['state'] = r.is_error ? 'error' : 'success';
        if (state === 'success' && (t.toolName === 'Edit' || t.toolName === 'Write')) {
          const p = (t.input as { file_path?: string })?.file_path;
          if (p) fileEvents.push({ path: p });
        }
        return { ...t, state };
      });
      s = { ...s, messages: s.messages.slice(0, -1).concat({ ...last, tools }) };
      break;
    }

    case 'result':
      s = {
        ...s,
        running: false,
        error: ev.is_error ? (ev.errors ?? ['Agent error']).join('; ') : null,
        lastUsage: ev.usage
          ? {
              input: (ev.usage.input_tokens ?? 0) + (ev.usage.cache_creation_input_tokens ?? 0) + (ev.usage.cache_read_input_tokens ?? 0),
              output: ev.usage.output_tokens ?? 0,
              // JSON null bypasses TS — never store null for a number field.
              cost: ev.total_cost_usd ?? undefined
            }
          : null
      };
      break;

    case 'session-id':
      s = { ...s, sessionId: ev.session_id };
      break;

    case 'slash-commands':
      s = { ...s, slashCommands: ev.commands };
      break;

    case 'started':
      s = { ...s, running: true, error: null };
      break;

    case 'stopped':
      s = { ...s, running: false };
      break;

    case 'error':
      s = { ...s, running: false, error: ev.message };
      break;

    default:
      // 'system' and unknown messages are ignored
      break;
  }

  return { state: s, fileEvents };
}
