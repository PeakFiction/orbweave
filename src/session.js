'use strict';
/* File session: owns the open .orbweave file. No Electron imports, so it can be unit-tested. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const A = require('./orbfile');

const BACKUP_EVERY_MS = 10 * 60 * 1000;
const BACKUP_KEEP = 40;

const sha = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20);
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const pad = n => String(n).padStart(2, '0');
const stampNow = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };

function writeAtomic(file, buf) {
  const tmp = `${file}.${process.pid}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, buf, 0, buf.length, 0);
    try { fs.fsyncSync(fd); } catch (_) { /* some network drives refuse fsync */ }
    fs.closeSync(fd); fd = null;
    let lastErr;
    for (let i = 0; i < 8; i++) {
      try { fs.renameSync(tmp, file); return; }
      catch (e) { lastErr = e; if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e; sleepSync(60 * (i + 1)); } // sync clients / antivirus briefly lock files on Windows
    }
    throw lastErr;
  } finally {
    if (fd != null) try { fs.closeSync(fd); } catch (_) {}
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
  }
}

function referencedImages(model) {
  const s = new Set();
  const list = model && Array.isArray(model.entries) ? model.entries : [];
  for (const e of list) if (e && e.image && typeof e.image.file === 'string') s.add(e.image.file);
  return s;
}

class Session {
  constructor() { this.reset(); }
  reset() {
    this.file = null; this.protection = null; this.password = null; this.images = new Map();
    this.rev = null; this.stat = null;
  }
  get name() { return this.file ? path.basename(this.file, '.orbweave') : ''; }

  /** Describe a file on disk without opening it. */
  static inspect(file) {
    try {
      const st = fs.statSync(file);
      if (!st.isFile()) return { exists: false };
      const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(16);
      fs.readSync(fd, b, 0, 16, 0); fs.closeSync(fd);
      const ok = b.subarray(0, 8).equals(Buffer.from([0x89, 0x4f, 0x52, 0x42, 0x57, 0x0d, 0x0a, 0x1a]));
      return { exists: true, size: st.size, mtime: st.mtimeMs, valid: ok, encrypted: ok && !!(b[9] & 1) };
    } catch (_) { return { exists: false }; }
  }

  open(file, password) {
    let buf;
    try { buf = fs.readFileSync(file); }
    catch (e) { return { error: { code: 'read', message: 'Cannot read the file: ' + (e.code || e.message) } }; }
    let doc;
    try {
      const info = A.peek(buf);
      if (info.encrypted && !password) return { needPassword: true, file };
      doc = A.decode(buf, password);
    } catch (e) {
      if (e instanceof A.OrbFileError) return { error: { code: e.code, message: e.message }, file };
      return { error: { code: 'unknown', message: 'Could not open the file: ' + e.message }, file };
    }
    this.file = file;
    this.protection = doc.protection || null;
    this.password = doc.protection ? (password || this.password) : null;
    this.images = new Map(doc.images.map(i => [i.name, { mime: i.mime, data: i.data }]));
    this._remember(buf);
    return { ok: true, file, model: doc.model, images: doc.images.map(i => ({ name: i.name, mime: i.mime, data: new Uint8Array(i.data) })), rev: this.rev, encrypted: !!this.protection };
  }

  _remember(buf) {
    this.rev = sha(buf);
    try { const st = fs.statSync(this.file); this.stat = { m: st.mtimeMs, s: st.size }; } catch (_) { this.stat = null; }
  }

  /** Current revision of the file on disk (cheap unless the file changed). */
  meta() {
    if (!this.file) return { none: true };
    let st;
    try { st = fs.statSync(this.file); } catch (_) { return { missing: true }; }
    if (this.stat && st.mtimeMs === this.stat.m && st.size === this.stat.s) return { rev: this.rev };
    try {
      const buf = fs.readFileSync(this.file); const r = sha(buf);
      if (r === this.rev) this.stat = { m: st.mtimeMs, s: st.size }; // touched, not changed
      return { rev: r };
    } catch (_) { return { missing: true }; }
  }

  /** Write the document. Returns {ok, rev} or {conflict:true}. */
  save({ model, newImages = [], baseRev, force = false, file }) {
    const target = file || this.file;
    if (!target) return { error: { code: 'nofile', message: 'No file is open.' } };
    if (!file && !force && this.rev && fs.existsSync(target)) {
      const cur = this.meta();
      if (cur.rev && cur.rev !== (baseRev || this.rev)) return { conflict: true };
    }
    for (const i of newImages) if (i && typeof i.name === 'string' && i.data) this.images.set(i.name, { mime: String(i.mime || 'image/png'), data: Buffer.from(i.data) });
    const keep = referencedImages(model);
    for (const k of [...this.images.keys()]) if (!keep.has(k)) this.images.delete(k);
    for (const k of keep) if (!this.images.has(k)) { /* reference to an image we never received: drop it quietly */ }
    const buf = A.encode({ model, images: [...this.images].map(([name, v]) => ({ name, mime: v.mime, data: v.data })) }, { protection: this.protection || undefined });
    if (fs.existsSync(target) && !file) this._backup(target);
    writeAtomic(target, buf);
    this.file = target;
    this._remember(buf);
    return { ok: true, rev: this.rev, file: this.file };
  }

  create(file, model) {
    this.reset(); this.file = file;
    const r = this.save({ model, file });
    return r.ok ? { ok: true, file, rev: this.rev } : r;
  }

  setPassword(pw) { this.protection = pw ? A.makeProtection(pw) : null; this.password = pw || null; }

  _backup(target) {
    try {
      const dir = path.join(path.dirname(target), path.basename(target, '.orbweave') + '.backups');
      const base = path.basename(target, '.orbweave');
      let items = [];
      if (fs.existsSync(dir)) items = fs.readdirSync(dir).filter(n => n.endsWith('.orbweave')).map(n => ({ n, m: fs.statSync(path.join(dir, n)).mtimeMs })).sort((a, b) => a.m - b.m);
      const newest = items.length ? items[items.length - 1].m : 0;
      if (Date.now() - newest < BACKUP_EVERY_MS) return;
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(target, path.join(dir, `${base}-${stampNow()}.orbweave`));
      items = fs.readdirSync(dir).filter(n => n.endsWith('.orbweave')).map(n => ({ n, m: fs.statSync(path.join(dir, n)).mtimeMs })).sort((a, b) => a.m - b.m);
      while (items.length > BACKUP_KEEP) fs.unlinkSync(path.join(dir, items.shift().n));
    } catch (_) { /* a failed backup must never block a save */ }
  }
}

module.exports = { Session, writeAtomic, referencedImages, BACKUP_KEEP };
