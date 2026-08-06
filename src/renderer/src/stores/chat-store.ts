import { create } from 'zustand';
import type { ChatImage, HistoryRecord, PermissionMode } from '@shared/types';
import { emptyChatState, applyChatEvent, type ChatEvent, type ChatUiState, type FileEvent } from '../chat/chat-reducer';
import { useEditorStore } from './editor-store';
import { useTelemetryStore } from './telemetry-store';

type ChatSession = ChatUiState & {
  id: string;
  folder: string;
  planMode: boolean;
  pendingResume: string | null;
};

interface ChatStore {
  sessions: ChatSession[];
  activeId: string | null;
  checkpoints: Record<string, Record<string, string>>;
  fastMode: boolean;
  thinking: boolean;

  addChat: () => void;
  closeChat: (id: string) => void;
  setActive: (id: string) => void;
  send: (id: string, folder: string, prompt: string, images?: ChatImage[]) => void;
  stop: (id: string) => void;
  approve: (id: string, plan: string) => void;
  reject: (id: string) => void;
  setPlanMode: (id: string, v: boolean) => void;
  control: (id: string, subtype: string, request: Record<string, unknown>) => void;
  reset: (id: string) => void;
  openHistory: (rec: HistoryRecord) => void;
  handleEvent: (sessionId: string, message: unknown) => void;
  rewindTo: (msgId: string) => void;

  sendActive: (folder: string, prompt: string, images?: ChatImage[]) => void;
  stopActive: () => void;
  resetActive: () => void;
  controlActive: (subtype: string, request: Record<string, unknown>) => void;
  toggleFastMode: () => void;
  toggleThinking: () => void;
}

const uid = (): string => `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function emptySession(id: string, folder: string): ChatSession {
  return { ...emptyChatState(), id, folder, planMode: false, pendingResume: null };
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeId: null,
  checkpoints: {},
  fastMode: false,
  thinking: false,

  addChat: () => {
    const id = uid();
    set((s) => ({ sessions: [...s.sessions, emptySession(id, '')], activeId: id }));
  },

  closeChat: (id) => {
    void window.fcc.chatStop(id);
    useTelemetryStore.getState().forgetSession(id);
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id);
      if (sessions.length === 0) {
        const nid = uid();
        return { sessions: [emptySession(nid, '')], activeId: nid };
      }
      const activeId = s.activeId === id ? sessions[0].id : s.activeId;
      return { sessions, activeId };
    });
  },

  setActive: (id) => set({ activeId: id }),

  send: (id, folder, prompt, images) => {
    const s = get();
    const idx = s.sessions.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const session = s.sessions[idx];
    if (session.running) return;
    set({ activeId: id });

    if (session.pendingResume) {
      const cliId = session.pendingResume;
      const fld = session.folder || folder;
      if (!fld) return;
      const opts: { resume: string; images?: ChatImage[]; permissionMode?: PermissionMode } = { resume: cliId };
      if (images?.length) opts.images = images;
      if (session.planMode) opts.permissionMode = 'plan';
      set((st) => {
        const sessions = st.sessions.slice();
        sessions[idx] = { ...sessions[idx], pendingResume: null };
        return { sessions };
      });
      void window.fcc.chatStart(id, fld, prompt, opts);
      return;
    }

    if (session.messages.length > 0) {
      if (images?.length) void window.fcc.chatSend(id, prompt, images);
      else void window.fcc.chatSend(id, prompt);
      return;
    }

    const opts: { images?: ChatImage[]; permissionMode?: PermissionMode } = {};
    if (images?.length) opts.images = images;
    if (session.planMode) opts.permissionMode = 'plan';
    set((st) => {
      const sessions = st.sessions.slice();
      sessions[idx] = { ...sessions[idx], folder };
      return { sessions };
    });
    void window.fcc.chatStart(id, folder, prompt, Object.keys(opts).length > 0 ? opts : undefined);
  },

  stop: (id) => {
    void window.fcc.chatStop(id);
  },

  approve: (id, plan) => {
    const idx = get().sessions.findIndex((x) => x.id === id);
    if (idx < 0) return;
    set((st) => {
      const sessions = st.sessions.slice();
      sessions[idx] = { ...sessions[idx], planMode: false, awaitingPlanApproval: false, running: true };
      return { sessions };
    });
    void window.fcc.chatApprove(id, plan);
  },

  reject: (id) => {
    const idx = get().sessions.findIndex((x) => x.id === id);
    if (idx < 0) return;
    void window.fcc.chatStop(id);
    set((st) => {
      const sessions = st.sessions.slice();
      sessions[idx] = { ...sessions[idx], awaitingPlanApproval: false, planMode: false, running: false };
      return { sessions };
    });
  },

  setPlanMode: (id, v) => {
    const idx = get().sessions.findIndex((x) => x.id === id);
    if (idx < 0) return;
    set((st) => {
      const sessions = st.sessions.slice();
      sessions[idx] = { ...sessions[idx], planMode: v };
      return { sessions };
    });
  },

  control: (id, subtype, request) => {
    void window.fcc.chatControl(id, subtype, request);
  },

  reset: (id) => {
    const idx = get().sessions.findIndex((x) => x.id === id);
    if (idx < 0) return;
    void window.fcc.chatStop(id);
    useTelemetryStore.getState().forgetSession(id);
    set((st) => {
      const sessions = st.sessions.slice();
      sessions[idx] = emptySession(id, st.sessions[idx].folder);
      return { sessions };
    });
  },

  openHistory: (rec) => {
    const id = uid();
    const session: ChatSession = {
      ...emptyChatState(),
      id,
      folder: rec.folder,
      planMode: false,
      pendingResume: rec.cliSessionId,
      messages: rec.messages.map((m) => ({
        id: `h-${Math.random().toString(36).slice(2)}`,
        role: m.role,
        text: m.text,
        tools: []
      }))
    };
    set((s) => ({ sessions: [...s.sessions, session], activeId: id }));
  },

  handleEvent: (sessionId, message) => {
    const s = get();
    const idx = s.sessions.findIndex((x) => x.id === sessionId);
    if (idx < 0) return;
    const session = s.sessions[idx];
    const prevLastId = session.messages[session.messages.length - 1]?.id ?? null;
    const { state, fileEvents } = applyChatEvent(session, message as ChatEvent);
    set((st) => {
      const sessions = st.sessions.slice();
      sessions[idx] = { ...sessions[idx], ...state };
      return { sessions };
    });
    fileEvents.forEach((f: FileEvent) =>
      window.dispatchEvent(new CustomEvent('fcc:file-modified', { detail: f.path }))
    );
    if ((message as ChatEvent).type === 'assistant') {
      const last = get().sessions[idx].messages[get().sessions[idx].messages.length - 1];
      if (last?.role === 'assistant' && !last.parentId && last.id !== prevLastId) {
        const files: Record<string, string> = {};
        for (const t of useEditorStore.getState().tabs) files[t.path] = t.content;
        set((st) => ({ checkpoints: { ...st.checkpoints, [last.id]: files } }));
      }
    }
    // Turn finished → feed agent telemetry (Timeline / Influence / Agent flow).
    const ev = message as ChatEvent;
    if (ev.type === 'result' || ev.type === 'error' || ev.type === 'stopped') {
      const usage = ev.type === 'result' && ev.usage
        ? {
            input: (ev.usage.input_tokens ?? 0) + (ev.usage.cache_creation_input_tokens ?? 0) + (ev.usage.cache_read_input_tokens ?? 0),
            output: ev.usage.output_tokens ?? 0,
            cost: ev.total_cost_usd ?? undefined
          }
        : null;
      useTelemetryStore.getState().finalizeTurn(sessionId, get().sessions[idx].messages, get().checkpoints, usage);
    }
  },

  rewindTo: (msgId) => {
    const cp = get().checkpoints[msgId];
    if (!cp) return;
    const es = useEditorStore.getState();
    for (const [path, content] of Object.entries(cp)) {
      void (async () => {
        try {
          await es.open(path);
          await es.restoreFile(path, content);
        } catch {
          /* file/cwd gone — skip */
        }
      })();
    }
  },

  sendActive: (folder, prompt, images) => {
    const id = get().activeId;
    if (id) get().send(id, folder, prompt, images);
  },
  stopActive: () => {
    const id = get().activeId;
    if (id) get().stop(id);
  },
  resetActive: () => {
    const id = get().activeId;
    if (id) get().reset(id);
  },
  controlActive: (subtype, request) => {
    const id = get().activeId;
    if (id) get().control(id, subtype, request);
  },
  toggleFastMode: () => {
    const next = !get().fastMode;
    set({ fastMode: next });
    get().controlActive('apply_flag_settings', { settings: { fastMode: next } });
  },
  toggleThinking: () => {
    const next = !get().thinking;
    set({ thinking: next });
    get().controlActive('apply_flag_settings', { settings: { alwaysThinkingEnabled: next } });
  }
}));

/** The focused column, for single-chat consumers (StatusBar, SubagentPanel, …). */
export function useActiveChat(): ChatSession | undefined {
  return useChatStore((s) => s.sessions.find((x) => x.id === s.activeId));
}