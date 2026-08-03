// Renders resources/icon.svg in a hidden window and writes build/icon-*.png
// plus build/icon.ico (for the BrowserWindow on Windows and the NSIS installer).
// Run: npx electron scripts/generate-icons.mjs
import { app, BrowserWindow, nativeImage } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'build');
mkdirSync(outDir, { recursive: true });

// Minimal ICO container: header + directory entries + concatenated PNG data.
// PNG-in-ICO is valid on Windows Vista+.
function makeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dirSize = 16 * entries.length;
  const chunks = [header];
  let offset = 6 + dirSize;
  for (const e of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, 0); // 0 means 256
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, 1);
    dir.writeUInt16LE(1, 4); // planes
    dir.writeUInt16LE(32, 6); // bit count
    dir.writeUInt32LE(e.png.length, 8);
    dir.writeUInt32LE(offset, 12);
    chunks.push(dir);
    offset += e.png.length;
  }
  for (const e of entries) chunks.push(e.png);
  return Buffer.concat(chunks);
}

app.whenReady().then(async () => {
  const svg = readFileSync(join(root, 'resources', 'icon.svg'), 'utf8');
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    webPreferences: { sandbox: true }
  });
  await win.loadURL(
    `data:text/html,${encodeURIComponent(
      `<body style="margin:0"><img src="${dataUrl}" width="1024" height="1024" style="display:block"></body>`
    )}`
  );
  // Let the SVG rasterize.
  await new Promise((r) => setTimeout(r, 250));
  const img = await win.webContents.capturePage();
  const full = nativeImage.createFromBuffer(img.toPNG());
  const png = (size) => full.resize({ width: size, height: size }).toPNG();
  for (const size of [512, 256, 64, 32, 16]) {
    writeFileSync(join(outDir, `icon-${size}.png`), png(size));
  }
  writeFileSync(
    join(outDir, 'icon.ico'),
    makeIco([256, 48, 32, 16].map((size) => ({ size, png: png(size) })))
  );
  console.log('ICONS_OK');
  app.quit();
});
