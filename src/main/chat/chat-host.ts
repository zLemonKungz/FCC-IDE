import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import { FCC_BASE_URL, FCC_AUTH_TOKEN } from '../fcc-manager';
import { CHAT_MODEL, CHAT_MAX_TURNS } from './config';
import type { query as QueryFn } from '@anthropic-ai/claude-agent-sdk';

interface ActiveSession {
  abort: AbortController;
}

export class ChatHost {
  private sessions = new Map<string, ActiveSession>();

  constructor(private win: BrowserWindow) {}

  async start(sessionId: string, folder: string, prompt: string, resume?: string): Promise<void> {
    // The SDK is ESM-only; the main bundle is CJS, so load it dynamically.
    const { query }: { query: typeof QueryFn } = await import('@anthropic-ai/claude-agent-sdk');

    const abort = new AbortController();
    this.sessions.set(sessionId, { abort });

    this.emit(sessionId, { type: 'user-message', text: prompt });
    this.emit(sessionId, { type: 'started' });

    try {
      const gen = query({
        prompt,
        options: {
          abortController: abort,
          model: CHAT_MODEL,
          cwd: folder,
          resume,
          maxTurns: CHAT_MAX_TURNS,
          settingSources: ['local'],
          // The SDK's canUseTool permission bridge does not fire through the FCC proxy
          // with the installed claude CLI (verified by spike). Edits are auto-accepted
          // via acceptEdits and the user reviews them in the diff view instead.
          permissionMode: 'acceptEdits',
          env: {
            ANTHROPIC_BASE_URL: FCC_BASE_URL,
            ANTHROPIC_AUTH_TOKEN: FCC_AUTH_TOKEN,
            CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
            CLAUDE_CODE_AUTO_COMPACT_WINDOW: '190000'
          }
        }
      });
      for await (const message of gen) {
        // Emit the raw SDK message directly — the renderer reducer dispatches on
        // message.type ('assistant' | 'user' | 'result' | 'system').
        this.emit(sessionId, message);
        if (message.type === 'result' && message.session_id) {
          this.emit(sessionId, { type: 'session-id', session_id: message.session_id });
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this.emit(sessionId, { type: 'stopped' });
      } else {
        this.emit(sessionId, { type: 'error', message: (err as Error).message });
      }
    } finally {
      this.sessions.delete(sessionId);
    }
  }

  stop(sessionId: string): void {
    this.sessions.get(sessionId)?.abort.abort();
  }

  private emit(sessionId: string, message: unknown): void {
    this.win.webContents.send(IPC.evtChat, { sessionId, message });
  }
}
