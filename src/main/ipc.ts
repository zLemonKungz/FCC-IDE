import { ipcMain, dialog, type BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import * as files from './file-service';
import * as terminal from './terminal-service';
import * as fcc from './fcc-manager';
import { ChatHost } from './chat/chat-host';
import { setChatConfig } from './chat/config';

let chatHost: ChatHost | null = null;
let ipcRegistered = false;

export function disposeChatHost(): void {
  chatHost?.stopAll();
  chatHost = null;
}

export function registerIpc(win: BrowserWindow): void {
  if (ipcRegistered) return; // guard against duplicate registration (macOS re-activate)
  ipcRegistered = true;

  ipcMain.handle(IPC.ping, () => 'pong');

  ipcMain.handle(IPC.setTitleBarOverlay, (_e, color: string, symbolColor: string) => {
    if (win.setTitleBarOverlay) win.setTitleBarOverlay({ color, symbolColor });
  });

  ipcMain.handle(IPC.setChatSettings, (_e, s: { model: string; maxTurns: number }) => {
    setChatConfig(s);
  });

  ipcMain.handle(IPC.dialogOpenFolder, async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (res.canceled || res.filePaths.length === 0) return null;
    files.setRoot(res.filePaths[0]);
    return res.filePaths[0];
  });

  ipcMain.handle(IPC.fsList, (_e, dir: string) => files.listDir(dir));
  ipcMain.handle(IPC.fsRead, (_e, p: string) => files.readFile(p));
  ipcMain.handle(IPC.fsWrite, (_e, p: string, content: string) => files.writeFile(p, content));
  ipcMain.handle(IPC.fsCreate, (_e, p: string, isDir: boolean) => files.createEntry(p, isDir));
  ipcMain.handle(IPC.fsRename, (_e, p: string, newName: string) => files.renameEntry(p, newName));
  ipcMain.handle(IPC.fsDelete, (_e, p: string) => files.deleteEntry(p));

  ipcMain.handle(IPC.termCreate, (_e, cwd: string) => terminal.createTerminal(win, cwd || process.cwd()));
  ipcMain.on(IPC.termData, (_e, id: number, data: string) => terminal.writeTerminal(id, data));
  ipcMain.on(IPC.termResize, (_e, id: number, cols: number, rows: number) =>
    terminal.resizeTerminal(id, cols, rows)
  );
  ipcMain.handle(IPC.termDispose, (_e, id: number) => terminal.disposeTerminal(id));

  ipcMain.handle(IPC.fccStatus, () => fcc.checkHealth());
  ipcMain.handle(IPC.fccStart, () => fcc.startServer());

  chatHost = new ChatHost(win);
  ipcMain.handle(IPC.chatStart, (_e, sessionId: string, folder: string, prompt: string, resume?: string) =>
    chatHost!.start(sessionId, folder, prompt, resume)
  );
  ipcMain.handle(IPC.chatStop, (_e, sessionId: string) => chatHost!.stop(sessionId));
}
