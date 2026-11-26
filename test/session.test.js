'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { Session } = require('../src/session');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbweave-s-'));
const f = path.join(dir, 'Work.orbweave');
const model = n => ({ app: 'orbweave', v: 2, types: [], relations: [], lenses: [], entries: Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'N' + i, image: i === 0 ? { file: 'img1.png' } : null, links: [] })) });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

let s = new Session();
assert(s.create(f, model(2)).ok);
assert.deepStrictEqual(Session.inspect(f).encrypted, false);
// save with a new image
let r = s.save({ model: model(3), newImages: [{ name: 'img1.png', mime: 'image/png', data: png }], baseRev: s.rev });
assert(r.ok);
// open in a second session = other computer
let s2 = new Session(); let o = s2.open(f);
assert(o.ok && o.model.entries.length === 3 && o.images.length === 1 && Buffer.from(o.images[0].data).equals(png));
// unreferenced image removed
r = s.save({ model: { ...model(1), entries: [{ id: 'x', name: 'x', image: null, links: [] }] }, baseRev: s.rev });
assert(r.ok); o = new Session().open(f); assert(o.ok && o.images.length === 0);
// conflict: s2 saves, s (stale) tries
s = new Session(); s.open(f);
assert(s2.open(f).ok);
assert(s2.save({ model: model(5), baseRev: s2.rev }).ok);
r = s.save({ model: model(9), baseRev: s.rev });
assert.strictEqual(r.conflict, true, 'stale writer must conflict');
assert.strictEqual(new Session().open(f).model.entries.length, 5, 'conflicting write must not land');
r = s.save({ model: model(9), baseRev: s.rev, force: true }); assert(r.ok);
// meta detects external change, ignores touch
s2.open(f); const rev0 = s2.meta().rev; fs.utimesSync(f, new Date(), new Date(Date.now() + 5000));
assert.strictEqual(s2.meta().rev, rev0, 'touch only is not a change');
s.save({ model: model(2), baseRev: s.rev, force: true }); assert.notStrictEqual(s2.meta().rev, rev0);
// password
s.setPassword('pässwörd'); assert(s.save({ model: model(4), baseRev: s.rev }).ok);
assert.deepStrictEqual(Session.inspect(f).encrypted, true);
let n = new Session(); assert.strictEqual(n.open(f).needPassword, true);
assert.strictEqual(n.open(f, 'nope').error.code, 'badpassword');
assert.strictEqual(n.file, null, 'failed open must not change session');
o = n.open(f, 'pässwörd'); assert(o.ok && o.encrypted && o.model.entries.length === 4);
assert(n.save({ model: model(6), baseRev: n.rev }).ok); assert.strictEqual(Session.inspect(f).encrypted, true, 'stays protected after save');
n.setPassword(null); assert(n.save({ model: model(6), baseRev: n.rev }).ok); assert.strictEqual(Session.inspect(f).encrypted, false);
// corrupt + not an Orbweave file
fs.writeFileSync(path.join(dir, 'bad.orbweave'), Buffer.from('hello')); assert.strictEqual(new Session().open(path.join(dir, 'bad.orbweave')).error.code, 'notorb');
const raw = fs.readFileSync(f); raw[40] ^= 1; fs.writeFileSync(path.join(dir, 'c.orbweave'), raw); assert.strictEqual(new Session().open(path.join(dir, 'c.orbweave')).error.code, 'corrupt');
// backups
const bdir = path.join(dir, 'Work.backups'); assert(fs.existsSync(bdir) && fs.readdirSync(bdir).length === 1, 'one backup (rate limited to 1 per 10 min)');
// no leftover tmp files
assert.deepStrictEqual(fs.readdirSync(dir).filter(x => x.endsWith('.tmp')), []);
// save as copy keeps original untouched and moves session
const cp = path.join(dir, 'Copy.orbweave'); const before = fs.readFileSync(f);
assert(n.save({ model: model(7), file: cp }).ok); assert.strictEqual(n.file, cp); assert(fs.readFileSync(f).equals(before));
console.log('SESSION TESTS PASSED');
