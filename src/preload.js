'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (ch, arg) => ipcRenderer.invoke(ch, arg);
const EVENTS = new Set(['menu', 'open-path', 'before-close']);

contextBridge.exposeInMainWorld('orbHost', {
  status: () => invoke('host:status'),
  newFile: model => invoke('host:new', { model }),
  open: opts => invoke('host:open', opts || {}),
  save: payload => invoke('host:save', payload),
  saveAs: payload => invoke('host:saveAs', payload),
  meta: () => invoke('host:meta'),
  setPassword: pw => invoke('host:setPassword', { password: pw }),
  saveExport: (name, bytes, kind) => invoke('host:saveExport', { name, bytes, kind }),
  reveal: () => invoke('host:reveal'),
  forgetRecent: p => invoke('host:forgetRecent', { path: p }),
  tutorialDone: () => invoke('host:tutorialDone'),
  closeNow: () => invoke('host:closeNow'),
  pathForFile: f => { try { return webUtils.getPathForFile(f); } catch (_) { return ''; } },
  on: (name, cb) => { if (EVENTS.has(name)) ipcRenderer.on('host:' + name, (_e, v) => cb(v)); },
  test: process.env.ORBWEAVE_TEST === '1' ? { nextPath: p => invoke('test:nextPath', { path: p }), close: () => invoke('test:close') } : undefined,
});
