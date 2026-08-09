import type { AskQuestion } from '@shared/types';

export interface ToolCall {
  tool_use_id: string;
  toolName: string;
  input: unknown;
  state: 'running' | 'success' | 'error';
  /** stdout from the matching user.tool_use_result — shown when expanded. */
  output?: string;
  /** stderr from the same tool_use_result (usually empty). */
  stderr?: string;
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
  /** set on transcript messages restored from a saved/imported session (NOT
   *  live streamed turns). A live assistant reply must never merge into one of
   *  these — it starts its own message instead. */
  restored?: boolean;
}
export interface ChatUiState {
  messages: ChatMessage[];
  running: boolean;
  error: string | null;
  sessionId: string | null;
  /** usage of the last completed turn, from the SDK result message. `input` is
   *  the total input tokens (fresh + cache write + cache read); cacheRead /
   *  cacheWrite break that total out for the context-usage bar. */
  lastUsage: { input: number; output: number; cost?: number; cacheRead?: number; cacheWrite?: number } | null;
  /** current context-window size (input tokens the CLI holds across turns,
   *  incl. a resumed transcript) — the "how full is this conversation" number. */
  contextTokens: number;
  /** true while contextTokens is only a chars/4 estimate from a restored
   *  transcript (opened from history) — replaced by the CLI's real cumulative
   *  context on the next result. UI shows the estimate with a ≈ prefix. */
  contextEstimated: boolean;
  /** the model's context window (tokens) as reported by the CLI via
   *  result.modelUsage[model].contextWindow — set once a turn runs. Falls back
   *  to the user's auto-compact window when unknown. */
  modelContextWindow: number;
  /** cumulative tokens/cost across all completed turns of this conversation */
  sessionUsage: { input: number; output: number; cost: number };
  /** slash commands / skills discovered from the CLI init message (no leading '/') */
  slashCommands: string[];
  /** plan mode surfaced a proposal — the input should offer Approve / Reject. */
  awaitingPlanApproval: boolean;
  /** live session status from the backend's system/status events (mode/model),
   *  for the status bar — reflects realtime set_permission_mode / set_model. */
  liveStatus: { permissionMode?: string; model?: string };
  /** a model-issued AskUserQuestion card parked by the CLI, awaiting a choice
   *  (control_response). Rendered by the chat column; cleared on turn end. */
  pendingQuestion: { requestId: string; toolUseId?: string; questions: AskQuestion[] } | null;
  /** latest CLI UX notice (system/notice) — a thin banner until the next turn. */
  notice: string | null;
  /** running background/subagent tasks from system:task_started/task_progress,
   *  keyed by task_id — cleared when the turn finishes (result). */
  liveTasks: Record<string, LiveTask>;
  /** set when the CLI reports a compact boundary (history was auto-compacted) —
   *  shown as a "compacted" note in the transcript; cleared on a new turn. */
  compacted: boolean;
  /** live thinking-token estimate from system/thinking_tokens (the CLI status
   *  line's "Thinking • N tokens") — one running number per turn, reset at the
   *  next 'started'. */
  thinkingTokens: number;
  /** per-turn run metrics from the last result — timing, fast-mode gate, server
   *  web tools, and the tool names (MCP / skills / plugins) Claude used. */
  lastMeta: {
    ttftMs: number | null;
    durationMs: number | null;
    fastState: string | null;
    fastDisabledReason: string | null;
    webSearch: number;
    webFetch: number;
    tools: string[];
  } | null;
  /** a realtime setting (model / effort / mode / fast / thinking / MCP) failed
   *  to apply — surfaced instead of failing silently. */
  controlError: string | null;
}

export interface LiveTask {
  taskId: string;
  description: string;
  agent: string;
  lastTool?: string;
  tokens?: number;
}
export interface FileEvent {
  path: string;
}

export type ChatEvent =
  | { type: 'user-message'; text: string; images?: number }
  | { type: 'plan-approval' }
  | { type: 'assistant'; message: { content?: { type: string; text?: string; id?: string; name?: string; input?: unknown }[] } }
  | { type: 'user'; message?: { content?: { type: string; tool_use_id?: string; is_error?: boolean }[] }; tool_use_result?: { stdout?: string; stderr?: string } }
  | {
      type: 'result';
      is_error?: boolean;
      errors?: string[];
      usage?: {
        input_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
        output_tokens?: number;
        /** server-side tools the gateway ran (web search / fetch). */
        server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number };
      };
      total_cost_usd?: number;
      /** per-model usage the CLI reports (model id → usage + context window). */
      modelUsage?: Record<string, { contextWindow?: number; inputTokens?: number }>;
      /** turn timing in ms (the CLI's status footer). */
      ttft_ms?: number;
      duration_ms?: number;
      /** whether the fast-mode control actually took effect, and why not. */
      fast_mode_state?: string;
      fast_mode_disabled_reason?: string | null;
    }
  | { type: 'control_response'; response?: { subtype?: string; request_id?: string; error?: string; message?: string } }
  | { type: 'session-id'; session_id: string }
  | { type: 'slash-commands'; commands: string[] }
  | {
      type: 'system';
      subtype?: string;
      permissionMode?: string;
      model?: string;
      task_id?: string;
      description?: string;
      subagent_type?: string;
      last_tool_name?: string;
      usage?: { total_tokens?: number };
      /** live think-token estimate carried by system/thinking_tokens events. */
      estimated_tokens?: number;
      /** UX notice (context overflow / compaction forewarning) — surfaced as a banner. */
      notice?: { message?: string; text?: string; type?: string; level?: string };
    }
  | { type: 'started' }
  | { type: 'stopped' }
  | { type: 'error'; message: string }
  | { type: 'question'; requestId: string; toolUseId?: string; questions: AskQuestion[] }
  | { type: 'conversation_reset'; new_conversation_id?: string };

export function emptyChatState(): ChatUiState {
  return {
    messages: [],
    running: false,
    error: null,
    sessionId: null,
    lastUsage: null,
    contextTokens: 0,
    contextEstimated: false,
    modelContextWindow: 0,
    slashCommands: [],
    awaitingPlanApproval: false,
    sessionUsage: { input: 0, output: 0, cost: 0 },
    liveStatus: {},
    pendingQuestion: null,
    notice: null,
    liveTasks: {},
    thinkingTokens: 0,
    lastMeta: null,
    controlError: null,
    compacted: false
  };
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Human label for the turn footer's used-tool list: resolve the Skill tool's
 *  name from its input and strip an MCP tool name down to its server. */
function toolUsageLabel(t: ToolCall): string {
  if (t.toolName === 'Skill') {
    const skill = (t.input as { skill?: string })?.skill;
    return skill ? `Skill · ${skill}` : 'Skill';
  }
  // mcp__<server>__<method>, or a plugin/namespaced tool "plugin:foo::bar".
  // second alternative: group 1 is the optional "plugin:" prefix, group 2 is
  // the actual namespace.
  const mcp = /^mcp__(.+?)__/.exec(t.toolName) ?? /^(?:plugin:)?([^:]+?)::/.exec(t.toolName);
  if (mcp) return `MCP · ${mcp[2] ?? mcp[1]}`;
  return t.toolName;
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
      s = { ...s, compacted: false, notice: null, pendingQuestion: null, messages: [...s.messages, { id: uid(), role: 'user', text: ev.text, tools: [], imageCount: ev.images }] };
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
      // the list when a subagent just ran), nor into a restored transcript
      // message (those are history, not the live stream — the new reply must
      // open its own bubble, not absorb into the imported conversation).
      const isAssistantTurn = last && last.role === 'assistant' && !last.parentId && !last.restored;
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
          const output = ev.tool_use_result?.stdout ?? t.output;
          const stderr = ev.tool_use_result?.stderr ?? t.stderr;
          return { ...t, state, output, stderr };
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
            cacheRead: ev.usage.cache_read_input_tokens ?? 0,
            cacheWrite: ev.usage.cache_creation_input_tokens ?? 0,
            // JSON null bypasses TS — never store null for a number field.
            cost: ev.total_cost_usd ?? undefined
          }
        : null;
      s = {
        ...s,
        running: false,
        error: ev.is_error ? (ev.errors ?? ['Agent error']).join('; ') : null,
        lastUsage: usage,
        pendingQuestion: null,
        // A first live result replaces any restored-transcript estimate.
        contextEstimated: false,
        // The live window fill = the input the model actually received THIS
        // turn (fresh + cache read + cache write). result.modelUsage[model]
        // .inputTokens is NOT that — it is the CLI's cumulative session TOTAL,
        // summed on every result (probe: 42,650 → 85,349 → 128,097 = exact sum
        // of each turn). Driving the meter with it made a short chat read as
        // hundreds of thousands of tokens while each request stayed ~43k. Keep
        // the previous value when a result carries no usage at all.
        contextTokens: usage ? usage.input : s.contextTokens,
        // The model's real context window, reported per-model by the CLI. Use
        // the first modelUsage entry that carries one; keep an already-known
        // window if the CLI stops sending it on a later turn.
        modelContextWindow: (() => {
          if (!ev.modelUsage) return s.modelContextWindow;
          for (const u of Object.values(ev.modelUsage)) {
            if (u && Number.isFinite(u.contextWindow) && u.contextWindow! > 0) return u.contextWindow!;
          }
          return s.modelContextWindow;
        })(),
        // The turn finished — its subagent/background tasks are done, so the
        // live-progress list clears.
        liveTasks: {},
        sessionUsage: usage
          ? {
              input: s.sessionUsage.input + usage.input,
              output: s.sessionUsage.output + usage.output,
              cost: s.sessionUsage.cost + (usage.cost ?? 0)
            }
          : s.sessionUsage,
        // Per-run meta; the tool list covers the finished turn (every assistant
        // message since the last user message — main + nested subagent children)
        // so an Agent workflow whose final bubble has no tools still lists them.
        lastMeta: {
          ttftMs: typeof ev.ttft_ms === 'number' ? ev.ttft_ms : null,
          durationMs: typeof ev.duration_ms === 'number' ? ev.duration_ms : null,
          fastState: ev.fast_mode_state ?? null,
          fastDisabledReason: ev.fast_mode_disabled_reason ?? null,
          webSearch: ev.usage?.server_tool_use?.web_search_requests ?? 0,
          webFetch: ev.usage?.server_tool_use?.web_fetch_requests ?? 0,
          tools: (() => {
            const lastUser = [...s.messages].map((m) => m.role).lastIndexOf('user');
            const labels: string[] = [];
            const seen = new Set<string>();
            for (const m of s.messages.slice(lastUser + 1)) {
              if (m.role !== 'assistant') continue;
              for (const t of m.tools) {
                const label = toolUsageLabel(t);
                if (!seen.has(label)) {
                  seen.add(label);
                  labels.push(label);
                }
              }
            }
            return labels;
          })()
        }
      };
      break;
    }

    case 'session-id':
      s = { ...s, sessionId: ev.session_id };
      break;

    case 'conversation_reset':
      // /clear / plan-exit / fresh-session: the CLI reset its transcript under
      // new_conversation_id. Mount a fresh bubble list (session/process live on).
      s = { ...s, messages: [], compacted: false, notice: null, pendingQuestion: null };
      break;

    case 'slash-commands':
      s = { ...s, slashCommands: ev.commands };
      break;

    case 'started':
      s = { ...s, running: true, error: null, thinkingTokens: 0, controlError: null, pendingQuestion: null, notice: null };
      break;

    case 'control_response':
      // A realtime control (model/effort/mode/fast/…) fails silently today — the
      // CLI only echoes {subtype:'success', request_id} on success, so surface
      // the error response instead of dropping it with everything else.
      if (ev.response?.subtype === 'error') {
        // The CLI's error envelope carries the reason in `error` (not `message`).
        s = { ...s, controlError: ev.response.error ?? ev.response.message ?? 'Realtime setting failed to apply.' };
      }
      break;

    case 'stopped':
      s = { ...s, running: false, pendingQuestion: null };
      break;

    case 'plan-approval':
      // The CLI is idle, waiting for the user to approve/reject the proposal —
      // not doing work, so the running flag clears and the input re-enables.
      s = { ...s, running: false, awaitingPlanApproval: true };
      break;

    case 'question':
      // AskUserQuestion card parked by the CLI — the column renders the options
      // and answers via control_response (chat-store.answerQuestion).
      s = { ...s, pendingQuestion: { requestId: ev.requestId, toolUseId: ev.toolUseId, questions: ev.questions } };
      break;

    case 'error':
      s = { ...s, running: false, error: ev.message, pendingQuestion: null };
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
      } else if (ev.subtype === 'task_started' && ev.task_id && ev.description) {
        // A subagent/background task begins — show it as live progress.
        s = {
          ...s,
          liveTasks: {
            ...s.liveTasks,
            [ev.task_id]: {
              taskId: ev.task_id,
              description: ev.description,
              agent: ev.subagent_type ?? 'subagent',
              lastTool: undefined,
              tokens: 0
            }
          }
        };
      } else if (ev.subtype === 'task_progress' && ev.task_id) {
        const cur = s.liveTasks[ev.task_id];
        if (cur) {
          s = {
            ...s,
            liveTasks: {
              ...s.liveTasks,
              [ev.task_id]: {
                ...cur,
                lastTool: ev.last_tool_name,
                description: ev.description ?? cur.description,
                tokens: ev.usage?.total_tokens ?? cur.tokens
              }
            }
          };
        }
      } else if (ev.subtype === 'compact_boundary') {
        // The CLI finalized an auto/requested compact — the transcript is now a
        // summary. Surface it (the ChatColumn shows a "compacted" note + offers
        // a fresh /compact path). No pre-warning event exists (auto-compact is
        // silent), so this is post-hoc only.
        s = { ...s, compacted: true };
      } else if (ev.subtype === 'thinking_tokens' && typeof ev.estimated_tokens === 'number') {
        // Live think-token counter — a running estimate per event from the CLI
        // status line. Cleared at the next 'started'.
        s = { ...s, thinkingTokens: ev.estimated_tokens };
      } else if (ev.subtype === 'notice' || ev.notice) {
        // UX notice (context forewarning, pending compaction) — a soft banner
        // that clears on the next user message.
        const text = ev.notice?.message ?? ev.notice?.text ?? '';
        if (text) s = { ...s, notice: text };
      }
      break;
    }

    default:
      // unknown messages are ignored
      break;
  }

  return { state: s, fileEvents };
}
