'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { exec } = require('node:child_process');

app.setName('IskraLauncher');
app.setAppUserModelId('com.iskra.launcher');

// Portable storage: config + images live next to the launcher (where the .exe is),
// so the whole folder can be copied around. In dev they sit in the project root.
// If that location is not writable (e.g. installed under Program Files) fall back
// to %APPDATA%\IskraLauncher.
let BASE_DIR = app.getPath('userData');

// Where the app itself lives: next to the .exe when packaged, the project
// root in dev. Unlike BASE_DIR this never falls back to %APPDATA% — it's
// used to find bundled-but-loose assets (localization/) that ship with the
// app regardless of whether that folder happens to be writable.
function portableDir() {
  return app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname;
}

function resolveBaseDir() {
  const portable = portableDir();
  try {
    fs.mkdirSync(portable, { recursive: true });
    fs.accessSync(portable, fs.constants.W_OK);
    return portable;
  } catch {
    return app.getPath('userData');
  }
}

const imagesDir = () => path.join(BASE_DIR, 'images');
const configPath = () => path.join(BASE_DIR, 'config.json');

const DEFAULT_SEP_COLOR = '#37c0e8';

const DEFAULT_CONFIG = {
  theme: {
    titleColor: '#e6b23a',
    playColor: '#4caf50'
  },
  language: 'rus',
  selectedGameId: null,
  // ordered list — each entry is a game or a separator ({ type: 'separator' })
  games: [
    { id: 'seed-portal2', type: 'game', name: 'PORTAL 2', url: 'steam://rungameid/620', image: null }
  ]
};

// Normalise one list entry from disk (older configs had bare games with no `type`).
function normItem(it) {
  if (!it || typeof it !== 'object') return null;
  const id = typeof it.id === 'string' && it.id ? it.id : crypto.randomUUID();
  if (it.type === 'separator') {
    return {
      id,
      type: 'separator',
      name: String(it.name ?? ''),
      color: typeof it.color === 'string' && it.color ? it.color : DEFAULT_SEP_COLOR,
      collapsed: !!it.collapsed
    };
  }
  return {
    id,
    type: 'game',
    name: String(it.name ?? ''),
    url: String(it.url ?? ''),
    image: it.image || null
  };
}

const normList = (arr) => (Array.isArray(arr) ? arr.map(normItem).filter(Boolean) : []);

function ensureDirs() {
  fs.mkdirSync(imagesDir(), { recursive: true });
}

// Build version (ГГ.ММ.ДД.НН), bumped by `npm run pack` — see scripts/bump-version.js.
function readVersionInfo() {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf-8'));
    if (v && typeof v.version === 'string') return v;
  } catch { /* no build yet, e.g. `npm start` before the first `npm run pack` */ }
  return { version: 'dev', date: null, build: 0 };
}

// One-time move of data written by older builds (%APPDATA%\IskraLauncher).
function migrateLegacyData() {
  try {
    const legacyDir = app.getPath('userData');
    if (path.resolve(legacyDir) === path.resolve(BASE_DIR)) return;
    if (fs.existsSync(configPath())) return;

    const legacyCfg = path.join(legacyDir, 'config.json');
    if (fs.existsSync(legacyCfg)) fs.copyFileSync(legacyCfg, configPath());

    const legacyImg = path.join(legacyDir, 'images');
    if (fs.existsSync(legacyImg)) {
      fs.mkdirSync(imagesDir(), { recursive: true });
      for (const f of fs.readdirSync(legacyImg)) {
        const from = path.join(legacyImg, f);
        const to = path.join(imagesDir(), f);
        if (!fs.existsSync(to)) fs.copyFileSync(from, to);
      }
    }
  } catch { /* best effort */ }
}

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), 'utf-8'));
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      theme: readConfigTheme(parsed),
      games: normList(parsed.games)
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function readConfigTheme(parsed) {
  return { ...DEFAULT_CONFIG.theme, ...(parsed && parsed.theme) };
}

function writeConfig(cfg) {
  const safe = {
    theme: readConfigTheme(cfg),
    language: (cfg && typeof cfg.language === 'string' && cfg.language) || DEFAULT_CONFIG.language,
    selectedGameId: cfg ? cfg.selectedGameId ?? null : null,
    games: normList(cfg && cfg.games)
  };
  fs.writeFileSync(configPath(), JSON.stringify(safe, null, 2), 'utf-8');
  return safe;
}

/* ---------- localization ---------- */

// A loose, editable folder next to the .exe (see scripts/pack.js) — like
// images/ and config.json, so translations can be added/edited post-build.
const localizationDir = () => path.join(portableDir(), 'localization');

// Parses "code = Display Name" lines from localization/languages.txt. This
// file only supplies display names for the dropdown — which languages
// actually show up is decided by which localization/<code>.json files exist.
function readLanguageNames() {
  const names = {};
  try {
    const txt = fs.readFileSync(path.join(localizationDir(), 'languages.txt'), 'utf-8');
    for (const line of txt.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const m = trimmed.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
      if (m) names[m[1].toLowerCase()] = m[2].trim();
    }
  } catch { /* languages.txt is optional; codes fall back to their raw name */ }
  return names;
}

function listLanguages() {
  const fallbackNames = readLanguageNames();
  let files = [];
  try {
    files = fs.readdirSync(localizationDir()).filter((f) => f.toLowerCase().endsWith('.json'));
  } catch {
    return [];
  }
  return files.map((f) => {
    const code = f.slice(0, -5).toLowerCase();
    let name = fallbackNames[code] || code;
    try {
      const strings = JSON.parse(fs.readFileSync(path.join(localizationDir(), f), 'utf-8'));
      name = pick(strings, 'common.languageName', name);
    } catch { /* keep the fallback name */ }
    return { code, name };
  });
}

function readStrings(lang) {
  const tryRead = (code) => JSON.parse(fs.readFileSync(path.join(localizationDir(), `${code}.json`), 'utf-8'));
  const code = (lang || DEFAULT_CONFIG.language).toLowerCase();
  try { return tryRead(code); } catch { /* fall through to default language */ }
  try { return tryRead(DEFAULT_CONFIG.language); } catch { /* no localization files at all */ }
  return {};
}

function currentLanguage() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf-8')).language || DEFAULT_CONFIG.language;
  } catch {
    return DEFAULT_CONFIG.language;
  }
}

// Looks up a dotted path ("dialogs.pickImageTitle") in a strings object.
function pick(strings, dottedPath, fallback) {
  let cur = strings;
  for (const part of dottedPath.split('.')) {
    if (!cur || typeof cur !== 'object') return fallback;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : fallback;
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

let win = null;

function windowIcon() {
  for (const name of ['icon.ico', 'icon.png', 'logo.png']) {
    const p = path.join(__dirname, 'renderer', 'assets', name);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 640,
    minHeight: 460,
    frame: false,
    backgroundColor: '#1b1b1b',
    icon: windowIcon(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  BASE_DIR = resolveBaseDir();
  migrateLegacyData();
  ensureDirs();

  protocol.handle('media', (request) => {
    try {
      const u = new URL(request.url);
      const name = decodeURIComponent(u.pathname).replace(/^\/+/, '') || u.hostname;
      const filePath = path.join(imagesDir(), path.basename(name));
      if (!filePath.startsWith(imagesDir())) return new Response('forbidden', { status: 403 });
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (e) {
      return new Response('not found', { status: 404 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------- IPC ---------- */

ipcMain.handle('assets:list', () => {
  try {
    return fs.readdirSync(path.join(__dirname, 'renderer', 'assets')).map((f) => f.toLowerCase());
  } catch {
    return [];
  }
});

ipcMain.handle('app:getVersionInfo', () => readVersionInfo());

ipcMain.handle('config:get', () => readConfig());

ipcMain.handle('config:save', (_e, cfg) => writeConfig(cfg));

ipcMain.handle('i18n:list', () => listLanguages());

ipcMain.handle('i18n:get', (_e, lang) => readStrings(lang));

ipcMain.handle('dialog:pickImage', async () => {
  const strings = readStrings(currentLanguage());
  const res = await dialog.showOpenDialog(win, {
    title: pick(strings, 'dialogs.pickImageTitle', 'Choose a game image'),
    properties: ['openFile'],
    filters: [{
      name: pick(strings, 'dialogs.imagesFilterName', 'Images'),
      extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
    }]
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return res.filePaths[0];
});

ipcMain.handle('image:import', (_e, srcPath) => {
  ensureDirs();
  const ext = (path.extname(srcPath || '') || '.png').toLowerCase();
  const name = `${crypto.randomUUID()}${ext}`;
  fs.copyFileSync(srcPath, path.join(imagesDir(), name));
  return name;
});

ipcMain.handle('image:delete', (_e, name) => {
  if (!name) return false;
  try {
    fs.unlinkSync(path.join(imagesDir(), path.basename(name)));
    return true;
  } catch {
    return false;
  }
});

// A real URL/URI ("steam://...", "roblox://...", "com.epicgames.launcher://...")
// vs. a local command line copied out of a shortcut's Target field ("C:\...\x.exe
// --launch \"Foo\""). shell.openExternal only handles the former — give it the
// whole string and it just tries (and fails) to open a file literally named
// "x.exe --launch \"Foo\"". Windows drive paths (C:\...) and quoted/UNC paths
// are never URIs, so anything shaped like one goes through the shell instead.
function isLikelyUrl(target) {
  if (target.startsWith('"') || target.startsWith("'")) return false;
  if (/^[a-zA-Z]:[\\/]/.test(target)) return false; // C:\... or C:/...
  if (target.startsWith('\\\\')) return false; // \\server\share
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target); // scheme:...
}

// Runs a local "target [args...]" command line the same way double-clicking a
// .lnk shortcut would — via cmd.exe, so quoted paths and arguments are parsed
// exactly as typed. Resolves once the process has been handed to Windows; it
// does not wait for the launched game/launcher to exit.
function launchCommandLine(cmd) {
  return new Promise((resolve, reject) => {
    const child = exec(cmd, () => { /* exit info arrives too late to matter here */ });
    child.once('error', reject);
    setTimeout(resolve, 60);
  });
}

ipcMain.handle('game:launch', async (_e, url) => {
  if (typeof url !== 'string' || !url.trim()) {
    return { ok: false, error: pick(readStrings(currentLanguage()), 'backend.urlMissing', 'URL is not set') };
  }
  const target = url.trim();
  try {
    if (isLikelyUrl(target)) {
      await shell.openExternal(target);
    } else {
      await launchCommandLine(target);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

ipcMain.handle('app:openLauncherDir', async () => {
  ensureDirs();
  await shell.openPath(BASE_DIR);
  return BASE_DIR;
});

ipcMain.handle('app:openImagesDir', async () => {
  ensureDirs();
  await shell.openPath(imagesDir());
  return imagesDir();
});

ipcMain.on('window:minimize', () => win && win.minimize());
ipcMain.on('window:close', () => win && win.close());
