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

// Drives the `claude` CLI as a subprocess instead of the Agent SDK. The CLI's
// stream-json events are the same Anthropic message shapes the renderer
// reducer already dispatches on ('assistant' | 'user' | 'result' | 'system'),
// so the IPC contract (chat:event {sessionId, message}) is unchanged.
export class ChatHost {
  private sessions = new Map<string, ActiveSession>();

  constructor(private win: BrowserWindow) {}

  async start(sessionId: string, folder: string, prompt: string, resume?: string): Promise<void> {
    // Single-conversation chat: a new conversation supersedes any previous one.
    // Kill lingering subprocesses so they don't leak between chats.
    for (const [sid, s] of this.sessions) {
      s.cleaned = true;
      s.session.stop();
      this.sessions.delete(sid);
    }

    const { model, maxTurns } = getChatConfig();
    this.emit(sessionId, { type: 'user-message', text: prompt });
    this.emit(sessionId, { type: 'started' });

    const entry: ActiveSession = {
      session: undefined as unknown as CliSession,
      sawResult: false,
      cleaned: false
    };
    const cleanup = (err?: Error): void => {
      if (entry.cleaned) return;
      entry.cleaned = true;
      if (err && !entry.sawResult) this.emit(sessionId, { type: 'error', message: err.message });
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
        const m = msg as { type?: string; session_id?: string };
        if (m.type === 'result') entry.sawResult = true;
        // Emit the raw CLI event — the reducer dispatches on message.type.
        this.emit(sessionId, msg);
        if (m.type === 'result' && m.session_id) {
          this.emit(sessionId, { type: 'session-id', session_id: m.session_id });
        }
      },
      onExit: (code) => {
        // A turn that ended cleanly (result seen) leaves the process alive for
        // the next message; reaching here means it exited on its own or was killed.
        cleanup(code === 0 || code === null ? undefined : new Error(`Claude exited (code ${code})`));
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
    }
  }

  /** Kill every subprocess (app quit). */
  stopAll(): void {
    for (const [, s] of this.sessions) {
      s.cleaned = true;
      s.session.stop();
    }
    this.sessions.clear();
  }

  private emit(sessionId: string, message: unknown): void {
    this.win.webContents.send(IPC.evtChat, { sessionId, message });
  }
}
