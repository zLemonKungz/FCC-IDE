import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type { ChatImage, PermissionMode } from '@shared/types';
import { FCC_BASE_URL, FCC_AUTH_TOKEN } from '../fcc-manager';
import { getChatConfig } from './config';
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
    const { model, maxTurns, autoCompactWindow, effort } = getChatConfig();
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
        if (m.type === 'result') entry.sawResult = true;
        // Emit the raw CLI event — the reducer dispatches on message.type.
        this.emit(sessionId, msg);
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
    history.record(sessionId, message);
    this.win.webContents.send(IPC.evtChat, { sessionId, message });
  }
}
