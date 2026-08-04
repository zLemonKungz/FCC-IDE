import { create } from 'zustand';
import type { ChatImage, PermissionMode } from '@shared/types';
import { emptyChatState, applyChatEvent, type ChatEvent, type ChatUiState, type FileEvent } from '../chat/chat-reducer';

interface ChatStore extends ChatUiState {
  activeSessionId: string | null;
  folder: string | null;
  /** Plan mode: the next conversation spawns with --permission-mode plan and
   *  surfaces an Approve/Reject prompt when the CLI proposes a plan. */
  planMode: boolean;
  /** Start a new conversation, or continue the live one if it exists. */
  send: (folder: string, prompt: string, images?: ChatImage[]) => void;
  stop: () => void;
  reset: () => void;
  /** Approve the proposed plan — main respawns the session in act mode. */
  approve: (plan: string) => void;
  /** Reject the proposed plan — stop the session, back to planning. */
  reject: () => void;
  setPlanMode: (v: boolean) => void;
  handleEvent: (sessionId: string, message: unknown) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  ...emptyChatState(),
  activeSessionId: null,
  folder: null,
  planMode: false,
  handleEvent: (sessionId, message) => {
    if (sessionId !== get().activeSessionId) return;
    const { state, fileEvents } = applyChatEvent(get(), message as ChatEvent);
    set(state);
    fileEvents.forEach((f: FileEvent) =>
      window.dispatchEvent(new CustomEvent('fcc:file-modified', { detail: f.path }))
    );
  },
  send: (folder, prompt, images) => {
    const { activeSessionId, messages, running, planMode } = get();
    // A live conversation continues on the same subprocess (context preserved).
    // While a turn runs, the Stop button is the only way to interrupt.
    if (running) return;
    if (activeSessionId && messages.length > 0) {
      // Keep the exact 2-arg call when there are no images — chat-store tests
      // assert it, and an `undefined` third arg is noise over IPC.
      if (images?.length) void window.fcc.chatSend(activeSessionId, prompt, images);
      else void window.fcc.chatSend(activeSessionId, prompt);
      return;
    }
    const sid = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set({ ...emptyChatState(), activeSessionId: sid, folder });
    const opts: { images?: ChatImage[]; permissionMode?: PermissionMode } = {};
    if (images?.length) opts.images = images;
    if (planMode) opts.permissionMode = 'plan';
    void window.fcc.chatStart(sid, folder, prompt, Object.keys(opts).length > 0 ? opts : undefined);
  },
  stop: () => {
    const sid = get().activeSessionId;
    if (sid) void window.fcc.chatStop(sid);
  },
  approve: (plan) => {
    const sid = get().activeSessionId;
    if (!sid) return;
    set({ planMode: false, awaitingPlanApproval: false, running: true });
    void window.fcc.chatApprove(sid, plan);
  },
  reject: () => {
    const sid = get().activeSessionId;
    if (sid) void window.fcc.chatStop(sid);
    set({ awaitingPlanApproval: false, planMode: false, running: false });
  },
  setPlanMode: (v) => set({ planMode: v }),
  reset: () => {
    // /new while a turn is running must actually stop the subprocess, not
    // just drop the renderer state — otherwise the CLI keeps working invisibly
    // until the next chatStart kills it.
    const sid = get().activeSessionId;
    if (sid) void window.fcc.chatStop(sid);
    set({ ...emptyChatState(), activeSessionId: null });
  }
}));
