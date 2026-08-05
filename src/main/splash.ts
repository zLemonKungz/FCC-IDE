import { BrowserWindow } from 'electron';

let splash: BrowserWindow | null = null;

// App mark — a solid rounded "F" (three bars + terminal cursor block) in a warm
// terracotta→amber gradient (see resources/icon.svg). Kept inline so the splash
// HTML is fully self-contained (no network, works in dev and packaged).
const LOGO_SVG = `<svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true">
  <defs>
    <linearGradient id="lg" gradientUnits="userSpaceOnUse" x1="19" y1="12" x2="52" y2="48">
      <stop offset="0" stop-color="#f7c27a"/>
      <stop offset="1" stop-color="#d06f4a"/>
    </linearGradient>
  </defs>
  <rect x="20" y="13.5" width="9" height="34.5" rx="4.5" fill="url(#lg)"/>
  <rect x="20" y="13.5" width="29.5" height="8.5" rx="4.25" fill="url(#lg)"/>
  <rect x="20" y="26.5" width="18" height="8.5" rx="4.25" fill="url(#lg)"/>
  <rect x="51.5" y="14.5" width="3" height="7.5" rx="1.5" fill="url(#lg)"/>
</svg>`;

const SPLASH_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
  body {
    font-family: 'Geist Variable', 'Segoe UI', system-ui, sans-serif;
    color: #e4e7ec;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    position: absolute; inset: 0;
    margin: 10px;
    border-radius: 16px;
    background: #14171c;
    border: 1px solid #262b34;
    box-shadow: 0 18px 50px rgba(0,0,0,0.5);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 14px;
    user-select: none;
    -webkit-app-region: drag;
  }
  .logo { opacity: 0; animation: pop 420ms cubic-bezier(0.4,0,0.2,1) 80ms forwards; }
  @keyframes pop {
    0% { opacity: 0; transform: scale(0.82) translateY(6px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
  .wordmark {
    font-size: 15px; font-weight: 600; letter-spacing: 0.04em;
    color: #e4e7ec; opacity: 0;
    animation: fadein 300ms ease 180ms forwards;
  }
  .wordmark b { color: #d97a55; font-weight: 600; }
  @keyframes fadein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .bar {
    width: 120px; height: 3px; border-radius: 2px;
    background: #22262e; overflow: hidden; opacity: 0;
    animation: fadein 300ms ease 260ms forwards;
  }
  .bar::after {
    content: ''; display: block; height: 100%; width: 40%;
    border-radius: 2px; background: #d97a55;
    animation: slide 1.1s ease-in-out infinite;
  }
  @keyframes slide {
    0% { transform: translateX(-110%); }
    100% { transform: translateX(310%); }
  }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">__LOGO__</div>
    <div class="wordmark">FCC <b>Studio</b></div>
    <div class="bar"></div>
  </div>
</body>
</html>`;

export function createSplash(): BrowserWindow {
  splash = new BrowserWindow({
    width: 360,
    height: 230,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    // Transparent window: explicit transparent bg avoids a black/white flash
    // on 'ready-to-show' with some GPU drivers.
    backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const html = SPLASH_HTML.replace('__LOGO__', LOGO_SVG);
  void splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  splash.once('ready-to-show', () => splash?.show());
  splash.on('closed', () => {
    splash = null;
  });
  return splash;
}

export function closeSplash(): void {
  if (splash) {
    splash.close();
    splash = null;
  }
}
