import { ipcMain, dialog, clipboard, shell, type BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type { ChatImage, ClaudeSettingsFile, McpServerDef } from '@shared/types';
import * as files from './file-service';
import * as terminal from './terminal-service';
import * as fcc from './fcc-manager';
import * as history from './chat/history';
import * as mcp from './mcp-service';
import * as claudeSettings from './claude-settings';
import * as agents from './claude-agents';
import { listModels } from './chat/models';
import { ChatHost, type ChatStartOpts } from './chat/chat-host';
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

  ipcMain.handle(IPC.setChatSettings, (_e, s: { model: string; maxTurns: number; effort?: string }) => {
    setChatConfig(s);
  });

  ipcMain.handle(IPC.dialogOpenFolder, async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (res.canceled || res.filePaths.length === 0) return null;
    files.setRoot(res.filePaths[0]);
    return res.filePaths[0];
  });

  ipcMain.handle(IPC.fsList, (_e, dir: string) => files.listDir(dir));
  ipcMain.handle(IPC.openFolderAt, (_e, dir: string) => files.openRootAt(dir));
  ipcMain.handle(IPC.fsRead, (_e, p: string) => files.readFile(p));
  ipcMain.handle(IPC.fsWrite, (_e, p: string, content: string) => files.writeFile(p, content));
  ipcMain.handle(IPC.readAsset, (_e, p: string) => files.readAsset(p));
  // Markdown preview opens http/https/mailto links in the system browser — never
  // arbitrary schemes (a crafted href must not launch a local executable).
  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return;
    }
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') {
      return shell.openExternal(url);
    }
  });
  ipcMain.handle(IPC.fsCreate, (_e, p: string, isDir: boolean) => files.createEntry(p, isDir));
  ipcMain.handle(IPC.fsRename, (_e, p: string, newName: string) => files.renameEntry(p, newName));
  ipcMain.handle(IPC.fsDelete, (_e, p: string) => files.deleteEntry(p));
  ipcMain.handle(IPC.fsSearch, () => files.searchFiles());
  ipcMain.handle(IPC.fsSearchContent, (_e, query: string) => files.searchContent(query));

  ipcMain.handle(IPC.termCreate, (_e, cwd: string) => terminal.createTerminal(win, cwd || process.cwd()));
  ipcMain.on(IPC.termData, (_e, id: number, data: string) => terminal.writeTerminal(id, data));
  ipcMain.on(IPC.termResize, (_e, id: number, cols: number, rows: number) =>
    terminal.resizeTerminal(id, cols, rows)
  );
  ipcMain.handle(IPC.termDispose, (_e, id: number) => terminal.disposeTerminal(id));

  ipcMain.handle(IPC.fccStatus, () => fcc.checkHealth());
  ipcMain.handle(IPC.fccStart, () => fcc.startServer());
  ipcMain.handle(IPC.fccStop, () => fcc.stopServer());
  ipcMain.handle(IPC.fccDetect, () => fcc.detectInstall());

  chatHost = new ChatHost(win);
  ipcMain.handle(IPC.chatStart, (_e, sessionId: string, folder: string, prompt: string, opts?: ChatStartOpts) =>
    chatHost!.start(sessionId, folder, prompt, opts)
  );
  ipcMain.handle(IPC.chatSend, (_e, sessionId: string, prompt: string, images?: ChatImage[]) =>
    chatHost!.send(sessionId, prompt, images)
  );
  ipcMain.handle(IPC.chatStop, (_e, sessionId: string) => chatHost!.stop(sessionId));
  ipcMain.handle(IPC.chatApprove, (_e, sessionId: string, plan: string) => chatHost!.approve(sessionId, plan));
  ipcMain.handle(IPC.chatControl, (_e, sessionId: string, subtype: string, request: Record<string, unknown>) =>
    chatHost!.control(sessionId, subtype, request)
  );

  // A bitmap on the system clipboard (e.g. a Win+Shift+S screenshot) can't be
  // read by the sandboxed renderer's Clipboard API under file:// — read it in
  // main and hand back the base64 PNG.
  ipcMain.handle(IPC.clipboardReadImage, () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    return img.toPNG().toString('base64');
  });

  ipcMain.handle(IPC.historyList, () => history.list());
  ipcMain.handle(IPC.historyOpen, (_e, id: string) => history.read(id));
  ipcMain.handle(IPC.historyDelete, (_e, id: string) => history.remove(id));
  ipcMain.handle(IPC.mcpGet, () => mcp.getMcpConfig());
  ipcMain.handle(IPC.mcpSet, (_e, servers: Record<string, McpServerDef>) => mcp.setMcpConfig(servers));
  ipcMain.handle(IPC.chatModels, () => listModels());
  ipcMain.handle(IPC.claudeSettingsGet, () => claudeSettings.getSettings());
  ipcMain.handle(IPC.claudeSettingsSet, (_e, scope: 'user' | 'project', patch: ClaudeSettingsFile) =>
    claudeSettings.setSettings(scope, patch)
  );
  ipcMain.handle(IPC.agentsList, () => agents.listAgents());
  ipcMain.handle(IPC.agentsRead, (_e, name: string) => agents.readAgent(name));
  ipcMain.handle(IPC.agentsSave, (_e, name: string, content: string) => agents.saveAgent(name, content));
  ipcMain.handle(IPC.agentsDelete, (_e, name: string) => agents.deleteAgent(name));
}
