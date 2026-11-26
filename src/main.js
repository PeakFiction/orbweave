'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, session: electronSession, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { Session } = require('./session');

const TEST = process.env.ORBWEAVE_TEST === '1' && !app.isPackaged;
if (TEST && process.env.ORBWEAVE_USERDATA) app.setPath('userData', process.env.ORBWEAVE_USERDATA);

const FILE_EXT = 'orbweave';
const sess = new Session();
let win = null, closing = false, pendingOpen = null, rendererReady = false;
const testQueue = [];

/* ---------------- app settings: recent files and whether the first-run tutorial was seen ---------------- */
const settingsFile = () => path.join(app.getPath('userData'), 'orbweave-settings.json');
let settings = { recent: [], last: null, tutorialDone: false };
function loadSettings() {
  try { const s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); settings = { recent: Array.isArray(s.recent) ? s.recent.filter(x => typeof x === 'string').slice(0, 12) : [], last: typeof s.last === 'string' ? s.last : null, tutorialDone: s.tutorialDone === true }; }
  catch (_) { /* first run */ }
}
function saveSettings() { try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch (_) {} }
function remember(file) {
  settings.recent = [file, ...settings.recent.filter(f => f !== file)].slice(0, 12);
  settings.last = file; saveSettings(); buildMenu();
}

/* ---------------- dialogs (with a test seam) ---------------- */
async function pickSave(opts) {
  if (TEST && testQueue.length) return testQueue.shift();
  const r = await dialog.showSaveDialog(win, opts);
  return r.canceled ? null : r.filePath;
}
async function pickOpen(opts) {
  if (TEST && testQueue.length) return testQueue.shift();
  const r = await dialog.showOpenDialog(win, { ...opts, properties: ['openFile'] });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
}
const withExt = p => (path.extname(p).toLowerCase() === '.' + FILE_EXT ? p : p + '.' + FILE_EXT);
const FILTERS = [{ name: 'Orbweave file', extensions: [FILE_EXT] }];
const defaultDir = () => { try { return app.getPath('documents'); } catch (_) { return app.getPath('home'); } };

/* ---------------- window ---------------- */
function setTitle() { if (win) win.setTitle(sess.file ? `${sess.name} — Orbweave` : 'Orbweave'); }
function send(ch, v) { if (win && !win.isDestroyed()) win.webContents.send('host:' + ch, v); }

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600, show: false, backgroundColor: '#04060d', title: 'Orbweave',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false, devTools: !app.isPackaged || TEST },
  });
  win.once('ready-to-show', () => win.show());
  win.on('page-title-updated', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); });
  win.webContents.on('did-finish-load', () => { rendererReady = true; });
  win.on('close', e => {
    if (closing) return;
    e.preventDefault();
    send('before-close');
    setTimeout(() => { if (!closing && win && !win.isDestroyed()) { closing = true; win.close(); } }, 5000); // renderer frozen: do not trap the user
  });
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  setTitle();
}

function lockDownNetwork() {
  const ses = electronSession.defaultSession;
  ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(file|blob|data|devtools):/i.test(d.url) }));
  ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
}

/* ---------------- menu ---------------- */
function buildMenu() {
  const mac = process.platform === 'darwin';
  const recent = settings.recent.filter(f => { try { return fs.existsSync(f); } catch (_) { return false; } });
  const act = a => () => send('menu', a);
  const tpl = [
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'New Orbweave file…', accelerator: 'CmdOrCtrl+N', click: act('new') },
      { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: act('open') },
      { label: 'Open recent', submenu: recent.length ? recent.map(f => ({ label: f, click: () => send('open-path', f) })) : [{ label: '(none)', enabled: false }] },
      { type: 'separator' },
      { label: 'Save now', accelerator: 'CmdOrCtrl+S', click: act('save') },
      { label: 'Save as…', accelerator: 'CmdOrCtrl+Shift+S', click: act('saveas') },
      { label: 'Password…', click: act('password') },
      { label: 'Show file in folder', click: () => { if (sess.file) shell.showItemInFolder(sess.file); } },
      { type: 'separator' },
      mac ? { role: 'close' } : { role: 'quit' },
    ] },
    { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }, ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools' }])] },
    { label: 'Window', submenu: [{ role: 'minimize' }, ...(mac ? [{ role: 'zoom' }] : [])] },
    { label: 'Help', submenu: [{ label: 'How Orbweave works', click: act('help') }, { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: act('settings') }, { label: 'About Orbweave', click: () => dialog.showMessageBox(win, { type: 'info', title: 'About Orbweave', message: 'Orbweave ' + app.getVersion(), detail: 'A local map for anything you want to connect. No network access, no AI. Your data stays in the .orbweave file you chose.' }) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

/* ---------------- IPC ---------------- */
const fail = (e, fallback = 'Something went wrong.') => ({ error: { code: e && e.code || 'error', message: (e && e.message) || fallback } });

ipcMain.handle('host:status', () => {
  const recent = settings.recent.map(f => ({ path: f, ...Session.inspect(f) })).filter(r => r.exists);
  return { file: sess.file, name: sess.name, encrypted: !!sess.protection, recent, last: settings.last && Session.inspect(settings.last).exists ? settings.last : null, platform: process.platform, version: app.getVersion(), pendingOpen: takePendingOpen(), tutorialDone: settings.tutorialDone };
});

ipcMain.handle('host:new', async (_e, { model }) => {
  const p = await pickSave({ title: 'Create a new Orbweave file', defaultPath: path.join(defaultDir(), 'My Map.' + FILE_EXT), filters: FILTERS, buttonLabel: 'Create' });
  if (!p) return { canceled: true };
  const file = withExt(p);
  try {
    const r = sess.create(file, model);
    if (!r.ok) return r;
    remember(file); setTitle();
    return { ok: true, file, model, images: [], rev: sess.rev, encrypted: false };
  } catch (e) { return fail(e, 'Could not create the file.'); }
});

ipcMain.handle('host:open', async (_e, { path: p, password } = {}) => {
  let file = p;
  if (!file) {
    file = await pickOpen({ title: 'Open an Orbweave file', defaultPath: defaultDir(), filters: [...FILTERS, { name: 'All files', extensions: ['*'] }] });
    if (!file) return { canceled: true };
  }
  const r = sess.open(file, password || (file === sess.file ? sess.password : undefined));
  if (r.ok) { remember(file); setTitle(); }
  else if (r.error && !r.needPassword) { /* leave the previous session untouched */ }
  return r;
});

ipcMain.handle('host:save', (_e, payload) => {
  try { return sess.save(payload || {}); } catch (e) { return fail(e, 'Could not write the file.'); }
});

ipcMain.handle('host:saveAs', async (_e, payload) => {
  const p = await pickSave({ title: 'Save this Orbweave file as…', defaultPath: path.join(sess.file ? path.dirname(sess.file) : defaultDir(), (sess.name || 'My Map') + ' copy.' + FILE_EXT), filters: FILTERS });
  if (!p) return { canceled: true };
  const file = withExt(p);
  try { const r = sess.save({ ...(payload || {}), file }); if (r.ok) { remember(file); setTitle(); } return r; } catch (e) { return fail(e, 'Could not write the file.'); }
});

ipcMain.handle('host:meta', () => sess.meta());
ipcMain.handle('host:setPassword', (_e, { password }) => { try { sess.setPassword(password || null); return { ok: true, encrypted: !!sess.protection }; } catch (e) { return fail(e); } });
ipcMain.handle('host:reveal', () => { if (sess.file) shell.showItemInFolder(sess.file); return { ok: true }; });
ipcMain.handle('host:forgetRecent', (_e, { path: p }) => { settings.recent = settings.recent.filter(f => f !== p); if (settings.last === p) settings.last = null; saveSettings(); buildMenu(); return { ok: true }; });
ipcMain.handle('host:tutorialDone', () => { settings.tutorialDone = true; saveSettings(); return { ok: true }; });
ipcMain.handle('host:closeNow', () => { closing = true; if (win && !win.isDestroyed()) win.close(); return { ok: true }; });

ipcMain.handle('host:saveExport', async (_e, { name, bytes, kind }) => {
  const safe = String(name || 'export').replace(/[\\/:*?"<>|]/g, '_');
  const ext = path.extname(safe).slice(1) || '*';
  const p = await pickSave({ title: 'Save', defaultPath: path.join(sess.file ? path.dirname(sess.file) : defaultDir(), safe), filters: [{ name: kind || ext.toUpperCase(), extensions: [ext] }] });
  if (!p) return { canceled: true };
  try { fs.writeFileSync(p, Buffer.from(bytes)); return { ok: true, file: p }; } catch (e) { return fail(e, 'Could not write the file.'); }
});

if (TEST) {
  ipcMain.handle('test:nextPath', (_e, { path: p }) => { testQueue.push(p); return true; });
  ipcMain.handle('test:close', () => { if (win) win.close(); return true; });
}

/* ---------------- open-with / second launch ---------------- */
const isOrbPath = a => typeof a === 'string' && a.toLowerCase().endsWith('.' + FILE_EXT) && !a.startsWith('-');
function takePendingOpen() { const p = pendingOpen; pendingOpen = null; return p; }
function requestOpen(p) {
  if (!isOrbPath(p)) return;
  if (win && rendererReady) send('open-path', p); else pendingOpen = p;
}
app.on('open-file', (e, p) => { e.preventDefault(); requestOpen(p); });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    const p = argv.find(isOrbPath); if (p) requestOpen(path.resolve(p));
  });
  app.whenReady().then(() => {
    loadSettings(); lockDownNetwork(); buildMenu();
    const p = process.argv.slice(1).find(isOrbPath); if (p) pendingOpen = path.resolve(p);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
