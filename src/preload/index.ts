import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  AgentSummary,
  ChatImage,
  ChatSettings,
  FileEntry,
  FccInstallStatus,
  FccStatus,
  GatewayModel,
  ClaudeSettingsFile,
  GitBranch,
  GitCommit,
  GitStatus,
  HistoryRecord,
  HistorySummary,
  McpOverview,
  McpServerDef,
  PermissionMode,
  PluginInfo,
  SearchHit
} from '@shared/types';

const api = {
  // The sandboxed renderer has no `process` global — surface the platform
  // (win32 / darwin / linux) so components can pick platform-specific text.
  platform: process.platform,
  ping: (): Promise<string> => ipcRenderer.invoke(IPC.ping),
  fsList: (dir: string): Promise<FileEntry[]> => ipcRenderer.invoke(IPC.fsList, dir),
  fsRead: (p: string): Promise<string> => ipcRenderer.invoke(IPC.fsRead, p),
  readAsset: (p: string): Promise<string | null> => ipcRenderer.invoke(IPC.readAsset, p),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.openExternal, url),
  fsWrite: (p: string, content: string): Promise<void> => ipcRenderer.invoke(IPC.fsWrite, p, content),
  fsCreate: (p: string, isDir: boolean): Promise<void> => ipcRenderer.invoke(IPC.fsCreate, p, isDir),
  fsRename: (p: string, newName: string): Promise<void> => ipcRenderer.invoke(IPC.fsRename, p, newName),
  fsDelete: (p: string): Promise<void> => ipcRenderer.invoke(IPC.fsDelete, p),
  fsCopy: (from: string, to: string): Promise<void> => ipcRenderer.invoke(IPC.fsCopy, from, to),
  fsSearch: (): Promise<string[]> => ipcRenderer.invoke(IPC.fsSearch),
  fsSearchContent: (query: string): Promise<SearchHit[]> => ipcRenderer.invoke(IPC.fsSearchContent, query),
  openFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogOpenFolder),
  openFolderAt: (dir: string): Promise<boolean> => ipcRenderer.invoke(IPC.openFolderAt, dir),
  termCreate: (cwd: string): Promise<number> => ipcRenderer.invoke(IPC.termCreate, cwd),
  termData: (id: number, data: string): void => ipcRenderer.send(IPC.termData, id, data),
  termResize: (id: number, cols: number, rows: number): void => ipcRenderer.send(IPC.termResize, id, cols, rows),
  termDispose: (id: number): Promise<void> => ipcRenderer.invoke(IPC.termDispose, id),
  termRecent: (id?: number): Promise<string> => ipcRenderer.invoke(IPC.termRecent, id),
  gitDiff: (): Promise<string | null> => ipcRenderer.invoke(IPC.gitDiff),
  gitInfo: (): Promise<{ branch: string; changes: number } | null> => ipcRenderer.invoke(IPC.gitInfo),
  gitStatus: (): Promise<GitStatus | null> => ipcRenderer.invoke(IPC.gitStatus),
  gitAction: (action: 'stage' | 'unstage' | 'discard', paths: string[]): Promise<boolean> =>
    ipcRenderer.invoke(IPC.gitAction, action, paths),
  gitCommit: (message: string): Promise<{ ok: boolean; err?: string }> => ipcRenderer.invoke(IPC.gitCommit, message),
  gitStagedDiff: (): Promise<string | null> => ipcRenderer.invoke(IPC.gitStagedDiff),
  gitBranch: (action: 'list' | 'switch' | 'create', name?: string): Promise<GitBranch[] | { ok: boolean; err?: string } | null> =>
    ipcRenderer.invoke(IPC.gitBranch, action, name),
  gitHistory: (): Promise<GitCommit[] | null> => ipcRenderer.invoke(IPC.gitHistory),
  gitShow: (path: string): Promise<string | null> => ipcRenderer.invoke(IPC.gitShow, path),
  fccStatus: (): Promise<FccStatus> => ipcRenderer.invoke(IPC.fccStatus),
  fccStart: (): Promise<FccStatus> => ipcRenderer.invoke(IPC.fccStart),
  fccStop: (): Promise<FccStatus> => ipcRenderer.invoke(IPC.fccStop),
  fccDetect: (): Promise<FccInstallStatus> => ipcRenderer.invoke(IPC.fccDetect),
  chatStart: (sessionId: string, folder: string, prompt: string, opts?: { resume?: string; images?: ChatImage[]; permissionMode?: PermissionMode }): Promise<void> =>
    ipcRenderer.invoke(IPC.chatStart, sessionId, folder, prompt, opts),
  chatSend: (sessionId: string, prompt: string, images?: ChatImage[]): Promise<void> =>
    ipcRenderer.invoke(IPC.chatSend, sessionId, prompt, images),
  chatStop: (sessionId: string): Promise<void> => ipcRenderer.invoke(IPC.chatStop, sessionId),
  chatApprove: (sessionId: string, plan: string): Promise<void> => ipcRenderer.invoke(IPC.chatApprove, sessionId, plan),
  chatControl: (sessionId: string, subtype: string, request: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke(IPC.chatControl, sessionId, subtype, request),
  clipboardReadImage: (): Promise<string | null> => ipcRenderer.invoke(IPC.clipboardReadImage),
  historyList: (): Promise<HistorySummary[]> => ipcRenderer.invoke(IPC.historyList),
  historyOpen: (id: string): Promise<HistoryRecord | null> => ipcRenderer.invoke(IPC.historyOpen, id),
  historyDelete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.historyDelete, id),
  mcpGet: (): Promise<McpOverview> => ipcRenderer.invoke(IPC.mcpGet),
  mcpSet: (servers: Record<string, McpServerDef>): Promise<void> => ipcRenderer.invoke(IPC.mcpSet, servers),
  pluginsList: (): Promise<PluginInfo[]> => ipcRenderer.invoke(IPC.pluginsList),
  pluginsSet: (id: string, enabled: boolean): Promise<void> => ipcRenderer.invoke(IPC.pluginsSet, id, enabled),
  chatModels: (): Promise<GatewayModel[] | null> => ipcRenderer.invoke(IPC.chatModels),
  claudeSettingsGet: (): Promise<{ user: ClaudeSettingsFile; project: ClaudeSettingsFile | null }> =>
    ipcRenderer.invoke(IPC.claudeSettingsGet),
  claudeSettingsSet: (scope: 'user' | 'project', patch: ClaudeSettingsFile): Promise<void> =>
    ipcRenderer.invoke(IPC.claudeSettingsSet, scope, patch),
  agentsList: (): Promise<AgentSummary[]> => ipcRenderer.invoke(IPC.agentsList),
  agentsRead: (name: string): Promise<string> => ipcRenderer.invoke(IPC.agentsRead, name),
  agentsSave: (name: string, content: string): Promise<void> => ipcRenderer.invoke(IPC.agentsSave, name, content),
  agentsDelete: (name: string): Promise<void> => ipcRenderer.invoke(IPC.agentsDelete, name),
  setChatSettings: (s: ChatSettings): Promise<void> =>
    ipcRenderer.invoke(IPC.setChatSettings, s),
  appInfo: (): Promise<{ name: string; version: string; packaged: boolean }> => ipcRenderer.invoke(IPC.appInfo),
  setTitleBarOverlay: (color: string, symbolColor: string): Promise<void> =>
    ipcRenderer.invoke(IPC.setTitleBarOverlay, color, symbolColor),
  updatesCheck: (): Promise<void> => ipcRenderer.invoke(IPC.updatesCheck),
  updatesDownload: (): Promise<void> => ipcRenderer.invoke(IPC.updatesDownload),
  updatesInstall: (): Promise<void> => ipcRenderer.invoke(IPC.updatesInstall),
  onUpdate: (cb: (state: unknown) => void): void => {
    ipcRenderer.on(IPC.evtUpdate, (_ev, state) => cb(state));
  },
  onChatEvent: (cb: (payload: { sessionId: string; message: unknown }) => void): void => {
    ipcRenderer.on(IPC.evtChat, (_ev, payload) => cb(payload));
  },
  onFccStatus: (cb: (s: FccStatus) => void): void => {
    ipcRenderer.on(IPC.evtFcc, (_ev, s) => cb(s));
  },
  onTermData: (id: number, cb: (data: string) => void): () => void => {
    const listener = (_ev: unknown, tid: number, data: string): void => {
      if (tid === id) cb(data);
    };
    ipcRenderer.on(IPC.evtTerm, listener);
    // Return an unsubscribe — multiple terminals subscribe on the shared
    // channel and each must remove its listener on unmount.
    return () => ipcRenderer.removeListener(IPC.evtTerm, listener);
  },
  onFileModified: (cb: (e: { path: string }) => void): void => {
    ipcRenderer.on(IPC.evtFileModified, (_ev, e) => cb(e));
  }
};

contextBridge.exposeInMainWorld('fcc', api);
export type FccApi = typeof api;
