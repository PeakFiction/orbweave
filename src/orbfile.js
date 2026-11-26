'use strict';
/*
 * ORBWEAVE save-file format (.orbweave), format version 1
 * ------------------------------------------------------
 * This is Orbweave's own binary container. It is not JSON, not SQLite, not zip.
 *
 *   offset  size  field
 *   0       8     signature  89 4F 52 42 57 0D 0A 1A   (\x89 O R B W \r \n \x1A)
 *   8       1     format version (1)
 *   9       1     flags: bit0 = password protected
 *   10      2     reserved (0)
 *   12      4     body length, little endian
 *   16      n     body
 *   16+n    4     CRC-32 (little endian) of bytes 0 .. 16+n-1
 *
 * Body, not protected:   zlib-deflate( payload )
 * Body, protected:       salt[16] nonce[12] logN[1] r[1] p[1] 0[1]
 *                        AES-256-GCM( zlib-deflate( payload ) ) tag[16]
 *                        key = scrypt(password, salt, N=2^logN, r, p); AAD = bytes 0..15
 *
 * payload = ATV value (below): a map { app, schema, savedAt, model, images:[{name,mime,data}] }
 *
 * ATV ("Orbweave typed value") encoding, one byte tag then data:
 *   00 null | 01 false | 02 true
 *   03 integer      zigzag varint
 *   04 float        8 bytes IEEE-754 little endian
 *   05 string       varint byteLength, UTF-8 bytes
 *   06 array        varint count, values
 *   07 map          varint count, (string-without-tag: varint len + UTF-8) key, value pairs
 *   08 bytes        varint length, raw bytes
 */
const zlib = require('zlib');
const crypto = require('crypto');

const SIG = Buffer.from([0x89, 0x4f, 0x52, 0x42, 0x57, 0x0d, 0x0a, 0x1a]);
const FORMAT_VERSION = 1;
const FLAG_ENC = 1;
const HEADER = 16;
const SCRYPT_LOGN = 15, SCRYPT_R = 8, SCRYPT_P = 1;
const MAX_DEPTH = 64;

class OrbFileError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/* ---------------- CRC-32 ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------------- ATV encode ---------------- */
class Writer {
  constructor() { this.chunks = []; this.cur = Buffer.allocUnsafe(1 << 16); this.n = 0; }
  _room(k) {
    if (this.n + k <= this.cur.length) return;
    this.chunks.push(this.cur.subarray(0, this.n));
    this.cur = Buffer.allocUnsafe(Math.max(1 << 16, k));
    this.n = 0;
  }
  byte(b) { this._room(1); this.cur[this.n++] = b; }
  raw(buf) {
    if (buf.length > (1 << 16)) { this.chunks.push(this.cur.subarray(0, this.n)); this.chunks.push(Buffer.from(buf)); this.cur = Buffer.allocUnsafe(1 << 16); this.n = 0; return; }
    this._room(buf.length); buf.copy ? buf.copy(this.cur, this.n) : this.cur.set(buf, this.n); this.n += buf.length;
  }
  varint(v) { // v: non-negative BigInt or number
    let x = BigInt(v);
    do {
      let b = Number(x & 0x7fn);
      x >>= 7n;
      if (x > 0n) b |= 0x80;
      this.byte(b);
    } while (x > 0n);
  }
  done() { this.chunks.push(this.cur.subarray(0, this.n)); return Buffer.concat(this.chunks); }
}
function encodeValue(w, v, depth = 0) {
  if (depth > MAX_DEPTH) throw new OrbFileError('depth', 'Data is nested too deeply.');
  if (v === null || v === undefined) { w.byte(0); return; }
  switch (typeof v) {
    case 'boolean': w.byte(v ? 2 : 1); return;
    case 'number':
      if (Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER) {
        const b = BigInt(v);
        w.byte(3); w.varint(b >= 0n ? b << 1n : ((-b) << 1n) - 1n); return;
      }
      if (!Number.isFinite(v)) { w.byte(0); return; }
      { const f = Buffer.allocUnsafe(8); f.writeDoubleLE(v); w.byte(4); w.raw(f); } return;
    case 'string': { const b = Buffer.from(v, 'utf8'); w.byte(5); w.varint(b.length); w.raw(b); return; }
    case 'object':
      if (v instanceof Uint8Array) { w.byte(8); w.varint(v.length); w.raw(v); return; }
      if (Array.isArray(v)) { w.byte(6); w.varint(v.length); for (const x of v) encodeValue(w, x, depth + 1); return; }
      {
        const keys = Object.keys(v).filter(k => v[k] !== undefined && typeof v[k] !== 'function');
        w.byte(7); w.varint(keys.length);
        for (const k of keys) { const kb = Buffer.from(k, 'utf8'); w.varint(kb.length); w.raw(kb); encodeValue(w, v[k], depth + 1); }
      }
      return;
    default: w.byte(0);
  }
}

/* ---------------- ATV decode ---------------- */
class Reader {
  constructor(buf) { this.b = buf; this.p = 0; }
  need(k) { if (k < 0 || this.p + k > this.b.length) throw new OrbFileError('corrupt', 'The file is damaged (unexpected end).'); }
  byte() { this.need(1); return this.b[this.p++]; }
  varint() {
    let r = 0n, s = 0n;
    for (let i = 0; i < 10; i++) {
      const b = this.byte();
      r |= BigInt(b & 0x7f) << s;
      if (!(b & 0x80)) return r;
      s += 7n;
    }
    throw new OrbFileError('corrupt', 'The file is damaged (bad number).');
  }
  len() { const v = this.varint(); if (v > BigInt(this.b.length)) throw new OrbFileError('corrupt', 'The file is damaged (bad length).'); return Number(v); }
  take(k) { this.need(k); const s = this.b.subarray(this.p, this.p + k); this.p += k; return s; }
}
function decodeValue(r, depth = 0) {
  if (depth > MAX_DEPTH) throw new OrbFileError('corrupt', 'The file is damaged (too deep).');
  const t = r.byte();
  switch (t) {
    case 0: return null;
    case 1: return false;
    case 2: return true;
    case 3: { const z = r.varint(); const n = (z & 1n) ? -((z + 1n) >> 1n) : (z >> 1n); return Number(n); }
    case 4: return r.take(8).readDoubleLE(0);
    case 5: { const n = r.len(); return r.take(n).toString('utf8'); }
    case 6: { const n = r.len(); const a = new Array(n); for (let i = 0; i < n; i++) a[i] = decodeValue(r, depth + 1); return a; }
    case 7: {
      const n = r.len(), o = {};
      for (let i = 0; i < n; i++) {
        const kl = r.len(), k = r.take(kl).toString('utf8');
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') { decodeValue(r, depth + 1); continue; }
        o[k] = decodeValue(r, depth + 1);
      }
      return o;
    }
    case 8: { const n = r.len(); return Buffer.from(r.take(n)); }
    default: throw new OrbFileError('corrupt', 'The file is damaged (unknown data type).');
  }
}

/* ---------------- container ---------------- */
function deriveKey(password, salt, logN = SCRYPT_LOGN, r = SCRYPT_R, p = SCRYPT_P) {
  if (logN < 10 || logN > 20 || r < 1 || r > 16 || p < 1 || p > 4) throw new OrbFileError('corrupt', 'The file uses unsupported protection settings.');
  const N = 2 ** logN;
  return crypto.scryptSync(String(password).normalize('NFKC'), salt, 32, { N, r, p, maxmem: 256 * 1024 * 1024 });
}

/**
 * Make a protection context from a password. Reuse it for every save in a session
 * (the slow key derivation then happens once).
 */
function makeProtection(password, existing) {
  const salt = existing ? existing.salt : crypto.randomBytes(16);
  const logN = existing ? existing.logN : SCRYPT_LOGN;
  const r = existing ? existing.r : SCRYPT_R, p = existing ? existing.p : SCRYPT_P;
  return { salt, logN, r, p, key: deriveKey(password, salt, logN, r, p) };
}

/**
 * @param {{model:object, images?:Array<{name:string,mime:string,data:Uint8Array}>}} doc
 * @param {{protection?:object}} opts
 */
function encode(doc, opts = {}) {
  const w = new Writer();
  encodeValue(w, {
    app: 'orbweave', schema: 2, savedAt: Date.now(),
    model: doc.model,
    images: (doc.images || []).map(i => ({ name: i.name, mime: i.mime, data: i.data })),
  });
  const payload = zlib.deflateSync(w.done(), { level: 6 });
  const enc = !!opts.protection;
  const head = Buffer.alloc(HEADER);
  SIG.copy(head, 0);
  head[8] = FORMAT_VERSION; head[9] = enc ? FLAG_ENC : 0;
  let body;
  if (enc) {
    const pr = opts.protection, nonce = crypto.randomBytes(12);
    const meta = Buffer.from([pr.logN, pr.r, pr.p, 0]);
    head.writeUInt32LE(16 + 12 + 4 + payload.length + 16, 12); // length is part of the authenticated header
    const c = crypto.createCipheriv('aes-256-gcm', pr.key, nonce);
    c.setAAD(head);
    const ct = Buffer.concat([c.update(payload), c.final()]);
    body = Buffer.concat([pr.salt, nonce, meta, ct, c.getAuthTag()]);
  } else {
    body = payload;
    head.writeUInt32LE(body.length, 12);
  }
  const out = Buffer.concat([head, body, Buffer.alloc(4)]);
  out.writeUInt32LE(crc32(out.subarray(0, out.length - 4)), out.length - 4);
  return out;
}

/** Inspect a file without a password. */
function peek(buf) {
  if (buf.length < HEADER + 4 || !buf.subarray(0, 8).equals(SIG)) throw new OrbFileError('notorb', 'This is not an Orbweave file.');
  const ver = buf[8], flags = buf[9];
  if (ver > FORMAT_VERSION) throw new OrbFileError('newer', 'This file was made by a newer version of Orbweave. Update Orbweave to open it.');
  const len = buf.readUInt32LE(12);
  if (HEADER + len + 4 !== buf.length) throw new OrbFileError('corrupt', 'The file is damaged or incomplete (length mismatch).');
  if (crc32(buf.subarray(0, buf.length - 4)) !== buf.readUInt32LE(buf.length - 4)) throw new OrbFileError('corrupt', 'The file is damaged (checksum mismatch). Try a backup copy.');
  return { version: ver, encrypted: !!(flags & FLAG_ENC), bodyLength: len };
}

/**
 * @returns {{model:object, images:Array, savedAt:number, encrypted:boolean, protection?:object}}
 */
function decode(buf, password) {
  const info = peek(buf);
  const head = buf.subarray(0, HEADER), body = buf.subarray(HEADER, buf.length - 4);
  let payload, protection;
  if (info.encrypted) {
    if (password == null || password === '') throw new OrbFileError('password', 'This file is password protected.');
    if (body.length < 16 + 12 + 4 + 16) throw new OrbFileError('corrupt', 'The file is damaged (protected part too short).');
    const salt = body.subarray(0, 16), nonce = body.subarray(16, 28);
    const logN = body[28], r = body[29], p = body[30];
    const ct = body.subarray(32, body.length - 16), tag = body.subarray(body.length - 16);
    protection = makeProtection(password, { salt: Buffer.from(salt), logN, r, p });
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', protection.key, nonce);
      d.setAAD(head); d.setAuthTag(tag);
      payload = Buffer.concat([d.update(ct), d.final()]);
    } catch (_) { throw new OrbFileError('badpassword', 'Wrong password.'); }
  } else payload = body;
  let raw;
  try { raw = zlib.inflateSync(payload, { maxOutputLength: 1 << 30 }); }
  catch (_) { throw new OrbFileError('corrupt', 'The file is damaged (cannot decompress).'); }
  const root = decodeValue(new Reader(raw));
  if (!root || root.app !== 'orbweave' || typeof root.model !== 'object' || root.model === null) throw new OrbFileError('notorb', 'This file does not contain Orbweave data.');
  return {
    model: root.model,
    images: Array.isArray(root.images) ? root.images.filter(i => i && typeof i.name === 'string' && Buffer.isBuffer(i.data)).map(i => ({ name: i.name, mime: String(i.mime || 'application/octet-stream'), data: i.data })) : [],
    savedAt: root.savedAt || 0,
    encrypted: info.encrypted,
    protection,
  };
}

module.exports = { encode, decode, peek, makeProtection, OrbFileError, crc32, FORMAT_VERSION, _internal: { Writer, Reader, encodeValue, decodeValue } };
