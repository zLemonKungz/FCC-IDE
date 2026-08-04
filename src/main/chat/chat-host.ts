import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import { FCC_BASE_URL, FCC_AUTH_TOKEN } from '../fcc-manager';
import { getChatConfig } from './config';
import { CliSession, resolveCliBinary } from '../cli/cli-runner';

interface ActiveSession {
  session: CliSession;
  sawResult: boolean;
  cleaned: boolean;
}

interface CliEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  slash_commands?: unknown;
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

  constructor(private win: BrowserWindow) {}

  async start(sessionId: string, folder: string, prompt: string, resume?: string): Promise<void> {
    // A new conversation supersedes any previous one — kill processes and drop
    // stored folders so nothing leaks between chats.
    for (const [, s] of this.sessions) {
      s.cleaned = true;
      s.session.stop();
    }
    this.sessions.clear();
    this.folders.clear();
    this.folders.set(sessionId, folder);

    this.emit(sessionId, { type: 'user-message', text: prompt });
    this.emit(sessionId, { type: 'started' });
    await this.spawn(sessionId, folder, prompt, resume);
  }

  /** Continue an existing conversation: write the next turn to the live
   *  subprocess, or respawn one under the same sessionId if it died. */
  async send(sessionId: string, prompt: string): Promise<void> {
    this.emit(sessionId, { type: 'user-message', text: prompt });
    this.emit(sessionId, { type: 'started' });

    const live = this.sessions.get(sessionId);
    if (live && !live.cleaned) {
      // A new turn on the live process: clear the previous turn's result
      // marker so a mid-turn death below is reported as an error instead of
      // being silently swallowed by the stale sawResult=true.
      live.sawResult = false;
      live.session.send(prompt);
      return;
    }
    const folder = this.folders.get(sessionId);
    if (folder === undefined) {
      this.emit(sessionId, { type: 'error', message: 'No active conversation for this session.' });
      return;
    }
    await this.spawn(sessionId, folder, prompt);
  }

  private async spawn(sessionId: string, folder: string, prompt: string, resume?: string): Promise<void> {
    const { model, maxTurns } = getChatConfig();
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
      resume,
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
    entry.session.send(prompt);
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
  }

  /** Kill every subprocess (app quit). */
  stopAll(): void {
    for (const [, s] of this.sessions) {
      s.cleaned = true;
      s.session.stop();
    }
    this.sessions.clear();
    this.folders.clear();
  }

  private emit(sessionId: string, message: unknown): void {
    this.win.webContents.send(IPC.evtChat, { sessionId, message });
  }
}
