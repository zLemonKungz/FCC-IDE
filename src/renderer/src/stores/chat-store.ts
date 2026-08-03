import { create } from 'zustand';
import { emptyChatState, applyChatEvent, type ChatEvent, type ChatUiState, type FileEvent } from '../chat/chat-reducer';

interface ChatStore extends ChatUiState {
  activeSessionId: string | null;
  folder: string | null;
  start: (folder: string, prompt: string, resumeSessionId?: string) => void;
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
  start: (folder, prompt, resumeSessionId) => {
    const sid = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set({ ...emptyChatState(), activeSessionId: sid, folder });
    void window.fcc.chatStart(sid, folder, prompt, resumeSessionId);
  },
  stop: () => {
    const sid = get().activeSessionId;
    if (sid) void window.fcc.chatStop(sid);
  },
  reset: () => set({ ...emptyChatState(), activeSessionId: null })
}));
