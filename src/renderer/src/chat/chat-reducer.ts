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
  /** extended-thought folding for a turn/subagent, when the CLI forwards it */
  thinking?: string;
  tools: ToolCall[];
  /** attached images on a user turn (count, shown as a chip) */
  imageCount?: number;
  /** set on a subagent's forwarded output — the id of the message whose
   *  Agent/Task tool call spawned it, so the renderer can nest it underneath. */
  parentId?: string;
}
export interface ChatUiState {
  messages: ChatMessage[];
  running: boolean;
  error: string | null;
  sessionId: string | null;
  /** usage of the last completed turn, from the SDK result message */
  lastUsage: { input: number; output: number; cost?: number } | null;
  /** cumulative tokens/cost across all completed turns of this conversation */
  sessionUsage: { input: number; output: number; cost: number };
  /** slash commands / skills discovered from the CLI init message (no leading '/') */
  slashCommands: string[];
  /** plan mode surfaced a proposal — the input should offer Approve / Reject. */
  awaitingPlanApproval: boolean;
  /** live session status from the CLI's system/status events (mode/model),
   *  for the status bar — reflects realtime set_permission_mode / set_model. */
  liveStatus: { permissionMode?: string; model?: string };
}
export interface FileEvent {
  path: string;
}

export type ChatEvent =
  | { type: 'user-message'; text: string; images?: number }
  | { type: 'plan-approval' }
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
  | { type: 'system'; subtype?: string; permissionMode?: string; model?: string }
  | { type: 'started' }
  | { type: 'stopped' }
  | { type: 'error'; message: string };

export function emptyChatState(): ChatUiState {
  return {
    messages: [],
    running: false,
    error: null,
    sessionId: null,
    lastUsage: null,
    slashCommands: [],
    awaitingPlanApproval: false,
    sessionUsage: { input: 0, output: 0, cost: 0 },
    liveStatus: {}
  };
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type SdkContentBlock =
  | { type: 'text'; text: string; parent_tool_use_id?: string }
  // CLI thinking blocks carry the text in the `thinking` field, not `text`
  // (some tool-selection thoughts are signature-only with thinking:'').
  | { type: 'thinking'; thinking?: string; signature?: string; parent_tool_use_id?: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown; parent_tool_use_id?: string }
  | { type: 'tool_result'; tool_use_id: string; is_error?: boolean; parent_tool_use_id?: string };

export function applyChatEvent(
  state: ChatUiState,
  ev: ChatEvent
): { state: ChatUiState; fileEvents: FileEvent[] } {
  const fileEvents: FileEvent[] = [];
  let s = state;

  switch (ev.type) {
    case 'user-message':
      s = { ...s, messages: [...s.messages, { id: uid(), role: 'user', text: ev.text, tools: [], imageCount: ev.images }] };
      break;

    case 'assistant': {
      const content = (ev.message?.content ?? []) as unknown as SdkContentBlock[];
      const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const thinking = content.filter((b) => b.type === 'thinking').map((b) => b.thinking ?? '').join('');
      const toolBlocks = content.filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use');
      const last = s.messages[s.messages.length - 1];

      // ---- Subagent output (forwarded by --forward-subagent-text) ----
      // Content blocks are tagged with the parent Agent/Task tool_use_id. Nest
      // these as children of the message that owns that tool call so subagent
      // activity stays grouped and never merges into the main turn.
      const parentToolId = content.find((b) => b.parent_tool_use_id)?.parent_tool_use_id;
      if (parentToolId) {
        // The nearest owning message (a main or nested turn that listed the
        // Agent/Task call). Fall back to keying on the raw tool id if none.
        let parentId = parentToolId;
        for (let i = s.messages.length - 1; i >= 0; i--) {
          if (s.messages[i].tools.some((t) => t.tool_use_id === parentToolId)) {
            parentId = s.messages[i].id;
            break;
          }
        }
        const isSameChild = last && last.role === 'assistant' && last.parentId === parentId;
        const baseTools = isSameChild ? last.tools : [];
        const mergedTools = [...baseTools];
        for (const tb of toolBlocks) {
          if (!mergedTools.some((t) => t.tool_use_id === tb.id)) {
            mergedTools.push({ tool_use_id: tb.id, toolName: tb.name, input: tb.input, state: 'running' });
          }
        }
        const child: ChatMessage = {
          id: isSameChild ? last.id : uid(),
          role: 'assistant',
          text: isSameChild ? last.text + text : text,
          thinking: isSameChild ? (last.thinking ?? '') + thinking : thinking,
          tools: mergedTools,
          parentId
        };
        s = isSameChild
          ? { ...s, messages: s.messages.slice(0, -1).concat(child) }
          : { ...s, messages: [...s.messages, child] };
        break;
      }

      // ---- main assistant turn ----
      // A main turn never merges into a nested subagent child (which is only on
      // the list when a subagent just ran).
      const isAssistantTurn = last && last.role === 'assistant' && !last.parentId;
      const baseTools = isAssistantTurn ? last.tools : [];
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
        thinking: isAssistantTurn ? (last.thinking ?? '') + thinking : thinking,
        tools: mergedTools
      };
      s = isAssistantTurn
        ? { ...s, messages: s.messages.slice(0, -1).concat(msg) }
        : { ...s, messages: [...s.messages, msg] };
      break;
    }

    case 'user': {
      // SDK user message carrying tool_result blocks — mark matching tools done.
      // Scan every message (main + nested subagent children) so a tool resolves
      // wherever its owner lives, not just on the last message.
      const content = (ev.message?.content ?? []) as unknown as SdkContentBlock[];
      const results = content.filter((b): b is { type: 'tool_result'; tool_use_id: string; is_error?: boolean } => b.type === 'tool_result');
      if (results.length === 0) break;
      const messages: ChatMessage[] = s.messages.map((m) => {
        let changed = false;
        const tools: ToolCall[] = m.tools.map((t) => {
          const r = results.find((x) => x.tool_use_id === t.tool_use_id);
          if (!r) return t;
          changed = true;
          const state: ToolCall['state'] = r.is_error ? 'error' : 'success';
          if (state === 'success' && (t.toolName === 'Edit' || t.toolName === 'Write')) {
            const p = (t.input as { file_path?: string })?.file_path;
            if (p) fileEvents.push({ path: p });
          }
          return { ...t, state };
        });
        return changed ? { ...m, tools } : m;
      });
      s = { ...s, messages };
      break;
    }

    case 'result': {
      const usage = ev.usage
        ? {
            input: (ev.usage.input_tokens ?? 0) + (ev.usage.cache_creation_input_tokens ?? 0) + (ev.usage.cache_read_input_tokens ?? 0),
            output: ev.usage.output_tokens ?? 0,
            // JSON null bypasses TS — never store null for a number field.
            cost: ev.total_cost_usd ?? undefined
          }
        : null;
      s = {
        ...s,
        running: false,
        error: ev.is_error ? (ev.errors ?? ['Agent error']).join('; ') : null,
        lastUsage: usage,
        sessionUsage: usage
          ? {
              input: s.sessionUsage.input + usage.input,
              output: s.sessionUsage.output + usage.output,
              cost: s.sessionUsage.cost + (usage.cost ?? 0)
            }
          : s.sessionUsage
      };
      break;
    }

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

    case 'plan-approval':
      // The CLI is idle, waiting for the user to approve/reject the proposal —
      // not doing work, so the running flag clears and the input re-enables.
      s = { ...s, running: false, awaitingPlanApproval: true };
      break;

    case 'error':
      s = { ...s, running: false, error: ev.message };
      break;

    case 'system': {
      // The CLI emits system/status when the live session changes (a realtime
      // set_permission_mode / set_model) — surface the current mode/model for
      // the status bar.
      if (ev.subtype === 'status') {
        const patch = { ...s.liveStatus };
        if (ev.permissionMode) patch.permissionMode = ev.permissionMode;
        if (ev.model) patch.model = ev.model;
        s = { ...s, liveStatus: patch };
      }
      break;
    }

    default:
      // unknown messages are ignored
      break;
  }

  return { state: s, fileEvents };
}
