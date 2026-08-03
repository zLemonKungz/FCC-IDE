import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { registerIpc } from './ipc';
import * as fcc from './fcc-manager';
import { createSplash, closeSplash } from './splash';

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
  fcc.startPolling(win);

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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  fcc.stopPolling();
});

// --- TEMP screenshot harness (FCC_SHOT=1) ---
if (process.env.FCC_SHOT) {
  app.whenReady().then(() => {
    setTimeout(() => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      setTimeout(async () => {
        try {
          const img = await win.webContents.capturePage();
          const out = process.env.FCC_SHOT_OUT ?? 'shot.png';
          writeFileSync(out, img.toPNG());
          console.log('SHOT_SAVED', out);
        } catch (e) {
          console.error('SHOT_ERR', e);
        }
        app.quit();
      }, 6000);
    }, 2500);
  });
}
