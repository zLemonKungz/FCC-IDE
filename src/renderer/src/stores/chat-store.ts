import { create } from 'zustand';
import type { ChatImage } from '@shared/types';
import { emptyChatState, applyChatEvent, type ChatEvent, type ChatUiState, type FileEvent } from '../chat/chat-reducer';

interface ChatStore extends ChatUiState {
  activeSessionId: string | null;
  folder: string | null;
  /** Start a new conversation, or continue the live one if it exists. */
  send: (folder: string, prompt: string, images?: ChatImage[]) => void;
  stop: () => void;
  reset: () => void;
  handleEvent: (sessionId: string, message: unknown) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  ...emptyChatState(),
  activeSessionId: null,
  folder: null,
  handleEvent: (sessionId, message) => {
    if (sessionId !== get().activeSessionId) return;
    const { state, fileEvents } = applyChatEvent(get(), message as ChatEvent);
    set(state);
    fileEvents.forEach((f: FileEvent) =>
      window.dispatchEvent(new CustomEvent('fcc:file-modified', { detail: f.path }))
    );
  },
  send: (folder, prompt, images) => {
    const { activeSessionId, messages, running } = get();
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
    void window.fcc.chatStart(sid, folder, prompt, images?.length ? { images } : undefined);
  },
  stop: () => {
    const sid = get().activeSessionId;
    if (sid) void window.fcc.chatStop(sid);
  },
  reset: () => {
    // /new while a turn is running must actually stop the subprocess, not
    // just drop the renderer state — otherwise the CLI keeps working invisibly
    // until the next chatStart kills it.
    const sid = get().activeSessionId;
    if (sid) void window.fcc.chatStop(sid);
    set({ ...emptyChatState(), activeSessionId: null });
  }
}));
