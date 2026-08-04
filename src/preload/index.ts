import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type { ChatSettings, FileEntry, FccInstallStatus, FccStatus } from '@shared/types';

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke(IPC.ping),
  fsList: (dir: string): Promise<FileEntry[]> => ipcRenderer.invoke(IPC.fsList, dir),
  fsRead: (p: string): Promise<string> => ipcRenderer.invoke(IPC.fsRead, p),
  fsWrite: (p: string, content: string): Promise<void> => ipcRenderer.invoke(IPC.fsWrite, p, content),
  fsCreate: (p: string, isDir: boolean): Promise<void> => ipcRenderer.invoke(IPC.fsCreate, p, isDir),
  fsRename: (p: string, newName: string): Promise<void> => ipcRenderer.invoke(IPC.fsRename, p, newName),
  fsDelete: (p: string): Promise<void> => ipcRenderer.invoke(IPC.fsDelete, p),
  openFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogOpenFolder),
  termCreate: (cwd: string): Promise<number> => ipcRenderer.invoke(IPC.termCreate, cwd),
  termData: (id: number, data: string): void => ipcRenderer.send(IPC.termData, id, data),
  termResize: (id: number, cols: number, rows: number): void => ipcRenderer.send(IPC.termResize, id, cols, rows),
  termDispose: (id: number): Promise<void> => ipcRenderer.invoke(IPC.termDispose, id),
  fccStatus: (): Promise<FccStatus> => ipcRenderer.invoke(IPC.fccStatus),
  fccStart: (): Promise<FccStatus> => ipcRenderer.invoke(IPC.fccStart),
  fccStop: (): Promise<FccStatus> => ipcRenderer.invoke(IPC.fccStop),
  fccDetect: (): Promise<FccInstallStatus> => ipcRenderer.invoke(IPC.fccDetect),
  chatStart: (sessionId: string, folder: string, prompt: string, resume?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.chatStart, sessionId, folder, prompt, resume),
  chatSend: (sessionId: string, prompt: string): Promise<void> =>
    ipcRenderer.invoke(IPC.chatSend, sessionId, prompt),
  chatStop: (sessionId: string): Promise<void> => ipcRenderer.invoke(IPC.chatStop, sessionId),
  setChatSettings: (s: ChatSettings): Promise<void> =>
    ipcRenderer.invoke(IPC.setChatSettings, s),
  setTitleBarOverlay: (color: string, symbolColor: string): Promise<void> =>
    ipcRenderer.invoke(IPC.setTitleBarOverlay, color, symbolColor),
  onChatEvent: (cb: (payload: { sessionId: string; message: unknown }) => void): void => {
    ipcRenderer.on(IPC.evtChat, (_ev, payload) => cb(payload));
  },
  onFccStatus: (cb: (s: FccStatus) => void): void => {
    ipcRenderer.on(IPC.evtFcc, (_ev, s) => cb(s));
  },
  onTermData: (id: number, cb: (data: string) => void): void => {
    ipcRenderer.on(IPC.evtTerm, (_ev, tid: number, data: string) => {
      if (tid === id) cb(data);
    });
  },
  onFileModified: (cb: (e: { path: string }) => void): void => {
    ipcRenderer.on(IPC.evtFileModified, (_ev, e) => cb(e));
  }
};

contextBridge.exposeInMainWorld('fcc', api);
export type FccApi = typeof api;
