import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { disposeChatHost, registerIpc } from './ipc';
import * as fcc from './fcc-manager';
import * as terminal from './terminal-service';
import { createSplash, closeSplash } from './splash';
import { initUpdater } from './updater';
import { initLogging, log, logFilePath, handleRendererError as rendererError } from './logger';

function createWindow(): void {
  const splash = createSplash();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'FCC Studio',
    show: false,
    icon: join(__dirname, '../../build/icon-256.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0e1013',
      symbolColor: '#a0a8b4',
      height: 34
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  registerIpc(win);
  // Renderer crashes / hangs — log them so a blank-screen or silently-closed
  // webContents leaves a trace in the log file.
  win.webContents.on('render-process-gone', (_e, details) => {
    rendererError(undefined, { type: 'render-process-gone', message: `${details.reason} (exit ${details.exitCode})` });
    // The renderer can't reattach to the pty streams after a crash/reload —
    // kill them so orphaned shells don't accumulate in the terminals map.
    terminal.disposeAll();
  });
  win.on('unresponsive', () => log.info('window', 'renderer unresponsive'));
  win.on('responsive', () => log.info('window', 'renderer responsive again'));
  // Auto-update only makes sense in a packaged app — dev has no update feed.
  if (app.isPackaged) initUpdater(win);
  fcc.startPolling(win);
  // Open the app chat-ready: if FCC is installed but its server is offline,
  // spawn it in the background (the user shouldn't need the FCC tray app).
  fcc.autoStartServer(win);

  const reveal = (): void => {
    closeSplash();
    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  };

  win.once('ready-to-show', reveal);
  // Fallback: never leave the splash up if the main window load hangs.
  setTimeout(reveal, 6000);

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  initLogging();
  createWindow();
  log.info('app', 'ready', { version: app.getVersion(), packaged: app.isPackaged, logs: logFilePath() });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  log.info('app', 'quitting');
  fcc.stopPolling();
  // Stop the fcc-server we spawned (the kill is detached, so it completes
  // even as the app exits). A tray-app server is left alone.
  void fcc.stopServer();
  terminal.disposeAll();
  disposeChatHost();
});
