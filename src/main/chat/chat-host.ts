import type { BrowserWindow } from 'electron';
import { Notification } from 'electron';
import { IPC } from '@shared/ipc';
import type { ChatImage, PermissionMode } from '@shared/types';
import { FCC_BASE_URL, FCC_AUTH_TOKEN } from '../fcc-manager';
import { getChatConfig, effectiveAutoCompactTokens } from './config';
import { log } from '../logger';
import { collectSecrets, scrubEvent } from '../redact';
import { CliSession, resolveCliBinary } from '../cli/cli-runner';
import * as history from './history';

interface ActiveSession {
  session: CliSession;
  sawResult: boolean;
  cleaned: boolean;
}

export interface ChatStartOpts {
  resume?: string;
  images?: ChatImage[];
  permissionMode?: PermissionMode;
}

interface CliEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  slash_commands?: unknown;
  permission_mode?: string;
  request_id?: string;
  request?: { subtype?: string; tool_name?: string; tool_use_id?: string; input?: Record<string, unknown> };
}

// Drives the `claude` CLI as a subprocess instead of the Agent SDK. The CLI's
// stream-json events are the same Anthropic message shapes the renderer
// reducer already dispatches on ('assistant' | 'user' | 'result' | 'system'),
// so the IPC contract (chat:event {sessionId, message}) is unchanged.
//
// One conversation = one sessionId = one subprocess. Later turns are written to
// the same process (multi-turn), so Claude keeps context across messages.
export class ChatHost {
  private sessions = new Map<string, ActiveSession>();
  /** sessionId -> folder, kept after the process dies so send() can respawn. */
  private folders = new Map<string, string>();
  /** sessionId -> permission mode of the spawned process (respawn keeps it). */
  private modes = new Map<string, PermissionMode>();
  /** Exact secret values scraped from the env at startup — scrubbed from every
   *  chat event before it is recorded or forwarded. */
  private secrets = collectSecrets();

  constructor(private win: BrowserWindow) {}

  async start(sessionId: string, folder: string, prompt: string, opts?: ChatStartOpts): Promise<void> {
    // One conversation = one sessionId = one subprocess. Multiple sessions can
    // coexist (multi-chat panel); this only begins/respawns the named session.
    this.folders.set(sessionId, folder);
    this.modes.set(sessionId, opts?.permissionMode ?? 'acceptEdits');
    // Open the new transcript before the first user-message so the title + first
    // turn land in it.
    history.begin(sessionId, folder);

    this.emit(sessionId, { type: 'user-message', text: prompt, images: opts?.images?.length });
    this.emit(sessionId, { type: 'started' });
    await this.spawn(sessionId, folder, prompt, opts);
  }

  /** Continue an existing conversation: write the next turn to the live
   *  subprocess, or respawn one under the same sessionId if it died. */
  async send(sessionId: string, prompt: string, images?: ChatImage[]): Promise<void> {
    this.emit(sessionId, { type: 'user-message', text: prompt, images: images?.length });
    this.emit(sessionId, { type: 'started' });

    const live = this.sessions.get(sessionId);
    if (live && !live.cleaned) {
      // A new turn on the live process: clear the previous turn's result
      // marker so a mid-turn death below is reported as an error instead of
      // being silently swallowed by the stale sawResult=true.
      live.sawResult = false;
      live.session.send(prompt, images);
      return;
    }
    const folder = this.folders.get(sessionId);
    if (folder === undefined) {
      this.emit(sessionId, { type: 'error', message: 'No active conversation for this session.' });
      return;
    }
    // A dead process respawns under the same session — keep its permission mode
    // so a plan-mode conversation stays in plan mode across a crash.
    await this.spawn(sessionId, folder, prompt, { images, permissionMode: this.modes.get(sessionId) });
  }

  /** Approve a plan-mode proposal: switch the session to acting (acceptEdits).
   *  Uses the same stop→respawn path as Stop, NOT a control signal — the
   *  {"type":"interrupt"} control family is unreliable through the FCC proxy,
   *  while kill+respawn under the same sessionId is empirically solid. The
   *  plan text is re-sent so the fresh process has the approved plan in context. */
  async approve(sessionId: string, plan: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    // Mark cleaned BEFORE stopping so onExit doesn't surface an error for the
    // aborted plan turn (no result was seen while waiting for approval).
    if (entry) {
      entry.cleaned = true;
      entry.session.stop();
    }
    const folder = this.folders.get(sessionId);
    if (folder === undefined) {
      this.emit(sessionId, { type: 'error', message: 'No active conversation for this session.' });
      return;
    }
    this.modes.set(sessionId, 'acceptEdits');
    this.emit(sessionId, { type: 'user-message', text: 'Plan approved — implementing now.' });
    this.emit(sessionId, { type: 'started' });
    await this.spawn(sessionId, folder, `The user approved this plan — implement it now:\n\n${plan}`, {
      permissionMode: 'acceptEdits'
    });
  }

  private async spawn(sessionId: string, folder: string, prompt: string, opts?: ChatStartOpts): Promise<void> {
    const { model, maxTurns, effort } = getChatConfig();
    const autoCompactWindow = effectiveAutoCompactTokens() ?? 0; // raw tokens
    const entry: ActiveSession = {
      session: undefined as unknown as CliSession,
      sawResult: false,
      cleaned: false
    };
    const cleanup = (err?: Error): void => {
      if (entry.cleaned) return;
      entry.cleaned = true;
      if (err && !entry.sawResult) {
        // Fold in the CLI's stderr tail — spawn failures and crashes print the
        // real cause there (missing binary, bad env, node stack trace).
        const trace = entry.session.stderrTrace();
        const message = trace ? `${err.message}\n${trace.trim().split('\n').slice(-3).join('\n')}` : err.message;
        log.error('chat', 'session error', { sessionId, message: err.message, trace: trace.slice(-500) });
        this.emit(sessionId, { type: 'error', message });
      }
      this.sessions.delete(sessionId);
    };

    entry.session = new CliSession({
      binary: resolveCliBinary(),
      cwd: folder,
      model,
      maxTurns,
      baseUrl: FCC_BASE_URL,
      authToken: FCC_AUTH_TOKEN,
      resume: opts?.resume,
      permissionMode: opts?.permissionMode,
      autoCompactWindow,
      effort,
      onEvent: (msg) => {
        const m = msg as CliEvent;
        if (m.type === 'result') {
          entry.sawResult = true;
          // A finished turn is the natural notification point for a long run.
          this.notifyIfBackground('Chat turn finished');
        }
        // Hook telemetry (SessionStart/UserPromptSubmit/…) fires multiple times
        // per turn and the renderer reducer drops every payload — don't pay the
        // IPC cost of shipping it across. session_id/tasks/etc. still flow.
        // typeof guard: startsWith throws on a non-string, and the onEvent loop
        // has no try/catch — a TypeError would abort the whole parsed chunk.
        const isHookNoise = m.type === 'system' && typeof m.subtype === 'string' && m.subtype.startsWith('hook_');
        // Emit the raw CLI event — the reducer dispatches on message.type.
        if (!isHookNoise) this.emit(sessionId, msg);
        if (m.type === 'result' && m.session_id) {
          this.emit(sessionId, { type: 'session-id', session_id: m.session_id });
        }
        if (m.type === 'system' && m.subtype === 'init' && Array.isArray(m.slash_commands)) {
          const commands = m.slash_commands.map((c) => String(c)).filter(Boolean);
          if (commands.length > 0) this.emit(sessionId, { type: 'slash-commands', commands });
        }
        // Plan mode: the CLI signals a proposal is waiting for user approval.
        if (m.type === 'control' && m.subtype === 'plan_approval') {
          this.emit(sessionId, { type: 'plan-approval' });
          this.notifyIfBackground('Claude is waiting for plan approval');
        }
        // can_use_tool: the CLI parks an AskUserQuestion card for THIS process
        // to render. Auto-allow everything else (the app never interrupts agent
        // edits — acceptEdits), so an unrelated permission can't stall the turn.
        if (m.type === 'control' && m.subtype === 'can_use_tool') {
          const toolName = m.request?.tool_name;
          if (toolName === 'AskUserQuestion' && m.request_id && m.request?.input) {
            this.emit(sessionId, {
              type: 'question',
              requestId: m.request_id,
              toolUseId: m.request.tool_use_id,
              questions: m.request.input.questions
            });
          } else if (m.request_id) {
            entry.session.sendControlResponse(m.request_id, {
              behavior: 'allow',
              updatedInput: m.request?.input ?? {}
            });
          }
        }
      },
      onExit: (code) => {
        // A turn that ended cleanly (result seen) leaves the process alive for
        // the next message; reaching here means it exited on its own or was killed.
        // The in-flight turn produced no result (sawResult was cleared at
        // send/spawn): always surface an error so the renderer's running flag
        // is cleared — a silent cleanup here wedges the conversation forever.
        if (!entry.sawResult) {
          cleanup(
            code === 0 || code === null
              ? new Error(`Claude exited before finishing (code ${code})`)
              : new Error(`Claude exited (code ${code})`)
          );
        } else {
          cleanup();
        }
      },
      onError: (err) => cleanup(err)
    });
    this.sessions.set(sessionId, entry);
    entry.session.start();
    entry.session.send(prompt, opts?.images);
    log.info('chat', 'spawn', { sessionId, folder, resume: opts?.resume ?? null, model: getChatConfig().model });
  }

  /** Forward a live SDK control_request to the running CLI (set_permission_mode
   *  for an immediate mode switch, apply_flag_settings for next-turn effort).
   *  Handled locally by the CLI — never through the FCC proxy. Keeps the stored
   *  spawn-mode in sync so a later stop→respawn keeps the current mode. */
  control(sessionId: string, subtype: string, request: Record<string, unknown>): void {
    const live = this.sessions.get(sessionId);
    if (live && !live.cleaned) {
      if (subtype === 'set_permission_mode' && typeof request.mode === 'string') {
        this.modes.set(sessionId, request.mode as PermissionMode);
      }
      live.session.sendControl(subtype, request);
    }
  }

  /** Round-trip a host query to the live CLI and return the control_response body
   *  (inner `response`), e.g. get_session_cost / get_context_usage. Null when no
   *  live session or the CLI didn't answer. */
  async meta(sessionId: string, kind: 'cost' | 'context'): Promise<unknown> {
    const live = this.sessions.get(sessionId);
    if (!live || live.cleaned) return null;
    const envelope = await live.session.query(kind === 'cost' ? 'get_session_cost' : 'get_context_usage');
    return (envelope as { response?: { response?: unknown } } | null)?.response?.response ?? null;
  }

  /** Rename the live CLI session (keeps the CLI's own transcript title tidy). */
  rename(sessionId: string, title: string): void {
    const live = this.sessions.get(sessionId);
    if (live && !live.cleaned) live.session.sendControl('rename_session', { title });
  }

  /** Answer a parked AskUserQuestion card: echo a can_use_tool control_response
   *  with the user's selections so the CLI resumes the turn. */
  answer(sessionId: string, requestId: string, questions: unknown, answers: Record<string, string>, response?: string): void {
    const live = this.sessions.get(sessionId);
    if (live && !live.cleaned) {
      const updated: Record<string, unknown> = { questions, answers };
      if (response) updated.response = response;
      live.session.sendControlResponse(requestId, { behavior: 'allow', updatedInput: updated });
    }
  }

  /** Dismiss the pending card without answering (control_response deny). */
  dismiss(sessionId: string, requestId: string): void {
    const live = this.sessions.get(sessionId);
    if (live && !live.cleaned) {
      live.session.sendControlResponse(requestId, { behavior: 'deny', message: 'User dismissed the question.' });
    }
  }

  stop(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.cleaned = true;
      s.session.stop();
      this.emit(sessionId, { type: 'stopped' });
      this.sessions.delete(sessionId);
      // folders kept so a follow-up message respawns under the same thread.
    }
    void history.flush(sessionId);
  }

  /** Kill every subprocess (app quit). */
  stopAll(): void {
    for (const [, s] of this.sessions) {
      s.cleaned = true;
      s.session.stop();
    }
    history.flushAll();
    this.sessions.clear();
    this.folders.clear();
    this.modes.clear();
  }

  private emit(sessionId: string, message: unknown): void {
    // Record every chat event (synthetic + raw) into the transcript funnel.
    const scrubbed = scrubEvent(message, this.secrets);
    history.record(sessionId, scrubbed);
    this.win.webContents.send(IPC.evtChat, { sessionId, message: scrubbed });
  }

  /** Native notification when a long turn ends while the window is unfocused —
   *  agentic runs otherwise surface nothing until you tab back. */
  private notifyIfBackground(body: string): void {
    if (this.win.isDestroyed() || this.win.isFocused()) return;
    try {
      new Notification({ title: 'FCC Studio', body }).show();
    } catch {
      /* OS notification unavailable — never crash the chat loop */
    }
  }
}
