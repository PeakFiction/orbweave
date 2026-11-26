'use strict';
const assert = require('assert');
const crypto = require('crypto');
const A = require('../src/orbfile');

const model = {
  app: 'orbweave', v: 2, types: [{ id: 't1', name: 'Système 日本語 🚀', color: '#fff' }],
  entries: Array.from({ length: 300 }, (_, i) => ({ id: 'e' + i, name: 'Entry ' + i, x: i * 1.5 - 77.25, y: -i, n: -(2 ** 40) - i, big: Number.MAX_SAFE_INTEGER, neg: -1, zero: 0,
    pinned: i % 2 === 0, none: null, tags: ['a', 'b'], links: [{ to: 'e' + ((i + 1) % 300), rel: 'feeds' }], desc: 'x'.repeat(i) })),
};
const img1 = crypto.randomBytes(5000), img2 = Buffer.alloc(300000, 7);
const doc = { model, images: [{ name: 'a.png', mime: 'image/png', data: img1 }, { name: 'b.jpg', mime: 'image/jpeg', data: img2 }] };

// roundtrip plain
let f = A.encode(doc);
assert(f.subarray(0, 8).equals(Buffer.from([0x89, 0x4f, 0x52, 0x42, 0x57, 0x0d, 0x0a, 0x1a])));
assert.throws(() => JSON.parse(f.toString('utf8')), 'must not parse as JSON'); assert(f[0] !== 0x7b);
let d = A.decode(f);
assert.deepStrictEqual(d.model, JSON.parse(JSON.stringify(model)));
assert.strictEqual(d.encrypted, false);
assert(d.images[0].data.equals(img1) && d.images[1].data.equals(img2));
assert.strictEqual(d.images[1].name, 'b.jpg');
console.log('plain roundtrip ok', f.length, 'bytes');

// special numbers
const nums = A.decode(A.encode({ model: { a: 1.5, b: -0.5, c: 1e300, d: NaN, e: Infinity, f: -1, g: 2 ** 53 - 1, h: -(2 ** 53 - 1), u: undefined, s: '', arr: [], o: {} } })).model;
assert.deepStrictEqual(nums, { a: 1.5, b: -0.5, c: 1e300, d: null, e: null, f: -1, g: 2 ** 53 - 1, h: -(2 ** 53 - 1), s: '', arr: [], o: {} });
console.log('numbers ok');

// encrypted
const pr = A.makeProtection('correct horse battery staple');
f = A.encode(doc, { protection: pr });
assert.strictEqual(A.peek(f).encrypted, true);
assert(!f.includes(Buffer.from('Entry 1')), 'plaintext must not leak');
assert.throws(() => A.decode(f), e => e.code === 'password');
assert.throws(() => A.decode(f, 'wrong'), e => e.code === 'badpassword');
d = A.decode(f, 'correct horse battery staple');
assert.deepStrictEqual(d.model, JSON.parse(JSON.stringify(model)));
assert.strictEqual(d.encrypted, true);
// unicode password normalisation + reuse of protection gives different nonces
const f2 = A.encode(doc, { protection: d.protection });
assert(!f2.equals(f));
assert.deepStrictEqual(A.decode(f2, 'correct horse battery staple').model.entries.length, 300);
console.log('encrypted ok');

// tamper detection
for (const [name, mut] of [
  ['flip body byte', b => { b[200] ^= 1; }],
  ['flip header version', b => { b[8] = 1; b[9] ^= 1; }],
  ['truncate', b => b.subarray(0, b.length - 10)],
  ['append', b => Buffer.concat([b, Buffer.from([1])])],
]) {
  const t = Buffer.from(f2); const r = mut(t) || t;
  assert.throws(() => A.decode(r, 'correct horse battery staple'), e => e instanceof A.OrbFileError, name);
}
// header tamper with fixed CRC must still fail GCM (AAD)
{
  const t = Buffer.from(f2); t[10] = 9; t.writeUInt32LE(A.crc32(t.subarray(0, t.length - 4)), t.length - 4);
  assert.throws(() => A.decode(t, 'correct horse battery staple'), e => e.code === 'badpassword');
}
// body tamper with fixed CRC must fail GCM
{
  const t = Buffer.from(f2); t[100] ^= 0xff; t.writeUInt32LE(A.crc32(t.subarray(0, t.length - 4)), t.length - 4);
  assert.throws(() => A.decode(t, 'correct horse battery staple'), e => e.code === 'badpassword');
}
// not an Orbweave file
assert.throws(() => A.decode(Buffer.from('{"app":"orbweave"}')), e => e.code === 'notorb');
assert.throws(() => A.decode(Buffer.alloc(0)), e => e.code === 'notorb');
// future version
{ const t = A.encode(doc); t[8] = 9; t.writeUInt32LE(A.crc32(t.subarray(0, t.length - 4)), t.length - 4); assert.throws(() => A.decode(t), e => e.code === 'newer'); }
// hostile payload: valid container, absurd lengths / deep nesting / __proto__
{
  const zlib = require('zlib');
  const mk = raw => { const w = Buffer.concat([Buffer.from([0x89,0x4f,0x52,0x42,0x57,0x0d,0x0a,0x1a,1,0,0,0,0,0,0,0]), zlib.deflateSync(raw), Buffer.alloc(4)]); w.writeUInt32LE(w.length - 20, 12); w.writeUInt32LE(A.crc32(w.subarray(0, w.length - 4)), w.length - 4); return w; };
  assert.throws(() => A.decode(mk(Buffer.from([5, 0xff, 0xff, 0xff, 0xff, 0x0f]))), e => e.code === 'corrupt');
  assert.throws(() => A.decode(mk(Buffer.from(Array(200).fill(6).flatMap(() => [6, 1]).concat([0])))), e => e.code === 'corrupt');
  const w = new A._internal.Writer(); w.byte(7); w.varint(2);
  w.varint(9); w.raw(Buffer.from('__proto__')); w.byte(7); w.varint(1); w.varint(1); w.raw(Buffer.from('x')); w.byte(2);
  w.varint(3); w.raw(Buffer.from('app')); w.byte(5); w.varint(8); w.raw(Buffer.from("orbweave"));
  assert.throws(() => A.decode(mk(w.done())), e => e.code === 'notorb');
  assert.strictEqual({}.x, undefined);
}
console.log('tamper + hostile ok');
console.log('ALL CODEC TESTS PASSED');
