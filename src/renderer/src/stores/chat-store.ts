import { create } from 'zustand';
import type { ChatImage, HistoryRecord, PermissionMode } from '@shared/types';
import { emptyChatState, applyChatEvent, type ChatEvent, type ChatUiState, type FileEvent } from '../chat/chat-reducer';
import { useEditorStore } from './editor-store';

interface ChatStore extends ChatUiState {
  activeSessionId: string | null;
  folder: string | null;
  /** Plan mode: the next conversation spawns with --permission-mode plan and
   *  surfaces an Approve/Reject prompt when the CLI proposes a plan. */
  planMode: boolean;
  /** CLI session id armed by openHistory — the next send spawns with --resume. */
  pendingResume: string | null;
  /** Start a new conversation, or continue the live one if it exists. */
  send: (folder: string, prompt: string, images?: ChatImage[]) => void;
  stop: () => void;
  reset: () => void;
  /** Send a live SDK control_request to the active CLI process (immediate mode
   *  switch, next-turn effort). No-op when no conversation is live. */
  control: (subtype: string, request: Record<string, unknown>) => void;
  /** Realtime fast-mode / extended-thinking toggles (apply_flag_settings). */
  fastMode: boolean;
  thinking: boolean;
  toggleFastMode: () => void;
  toggleThinking: () => void;
  /** Approve the proposed plan — main respawns the session in act mode. */
  approve: (plan: string) => void;
  /** Reject the proposed plan — stop the session, back to planning. */
  reject: () => void;
  setPlanMode: (v: boolean) => void;
  /** Restore a saved conversation: show its transcript and arm --resume. */
  openHistory: (rec: HistoryRecord) => void;
  handleEvent: (sessionId: string, message: unknown) => void;
  /** Pre-turn file snapshots keyed by the assistant message id (rewind targets). */
  checkpoints: Record<string, Record<string, string>>;
  /** Restore the open files to how they were before the given assistant message. */
  rewindTo: (msgId: string) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  ...emptyChatState(),
  activeSessionId: null,
  folder: null,
  planMode: false,
  pendingResume: null,
  fastMode: false,
  thinking: false,
  checkpoints: {},
  handleEvent: (sessionId, message) => {
    if (sessionId !== get().activeSessionId) return;
    const prevLastId = get().messages[get().messages.length - 1]?.id ?? null;
    const { state, fileEvents } = applyChatEvent(get(), message as ChatEvent);
    set(state);
    fileEvents.forEach((f: FileEvent) =>
      window.dispatchEvent(new CustomEvent('fcc:file-modified', { detail: f.path }))
    );
    // New main assistant turn begins → snapshot the open files so the user can
    // rewind the codebase to before this message (checkpoints/undo).
    if ((message as ChatEvent).type === 'assistant') {
      const last = get().messages[get().messages.length - 1];
      if (last?.role === 'assistant' && !last.parentId && last.id !== prevLastId) {
        const files: Record<string, string> = {};
        for (const t of useEditorStore.getState().tabs) files[t.path] = t.content;
        set((s) => ({ checkpoints: { ...s.checkpoints, [last.id]: files } }));
      }
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
          /* file/cwd gone — skip this one */
        }
      })();
    }
  },
  send: (folder, prompt, images) => {
    const { activeSessionId, messages, running, planMode, pendingResume } = get();
    // A live conversation continues on the same subprocess (context preserved).
    // While a turn runs, the Stop button is the only way to interrupt.
    if (running) return;
    // A restored conversation's first send spawns the CLI with --resume so it
    // rebuilds context from the saved session. Uses the saved folder, not the
    // (possibly different) currently-open one.
    if (pendingResume) {
      const cliId = pendingResume;
      const fld = get().folder ?? folder;
      if (!fld) return; // no folder to spawn in — shouldn't happen after openHistory
      set({ pendingResume: null });
      const opts: { resume: string; images?: ChatImage[]; permissionMode?: PermissionMode } = { resume: cliId };
      if (images?.length) opts.images = images;
      if (planMode) opts.permissionMode = 'plan';
      void window.fcc.chatStart(activeSessionId!, fld, prompt, opts);
      return;
    }
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
  control: (subtype, request) => {
    const sid = get().activeSessionId;
    if (sid) void window.fcc.chatControl(sid, subtype, request);
  },
  toggleFastMode: () => {
    const next = !get().fastMode;
    set({ fastMode: next });
    get().control('apply_flag_settings', { settings: { fastMode: next } });
  },
  toggleThinking: () => {
    const next = !get().thinking;
    set({ thinking: next });
    get().control('apply_flag_settings', { settings: { alwaysThinkingEnabled: next } });
  },
  openHistory: (rec) => {
    // Abandon the live conversation (already persisted by main on each result).
    const cur = get().activeSessionId;
    if (cur) void window.fcc.chatStop(cur);
    const sid = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set({
      ...emptyChatState(),
      messages: rec.messages.map((m) => ({
        id: `h-${Math.random().toString(36).slice(2)}`,
        role: m.role,
        text: m.text,
        tools: []
      })),
      activeSessionId: sid,
      folder: rec.folder,
      // The transcript is shown even if --resume is unsupported; the next send
      // just spawns fresh without it (chatStart drops an unusable resume id).
      pendingResume: rec.cliSessionId
    });
  },
  reset: () => {
    // /new while a turn is running must actually stop the subprocess, not
    // just drop the renderer state — otherwise the CLI keeps working invisibly
    // until the next chatStart kills it.
    const sid = get().activeSessionId;
    if (sid) void window.fcc.chatStop(sid);
    set({ ...emptyChatState(), activeSessionId: null, pendingResume: null, checkpoints: {} });
  }
}));
