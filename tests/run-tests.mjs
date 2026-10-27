// Tests for the pure core logic embedded in index.html.
// Extracts the CORE block and runs assertions with node's assert module.
// Run: node tests/run-tests.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(here, '..', 'index.html'), 'utf8');

const begin = html.indexOf('// === CORE BEGIN');
const end = html.indexOf('// === CORE END');
assert.ok(begin !== -1 && end !== -1 && end > begin, 'CORE block markers present in index.html');
const source = html.slice(begin, end);

const moduleShim = { exports: {} };
const context = { console, exports: {}, module: moduleShim };
vm.runInNewContext(source, context, { filename: 'core.js' });
const core = moduleShim.exports;
assert.ok(core && typeof core.summarizePar === 'function', 'core module exported');
const C = core;

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok - ' + name);
  } catch (e) {
    failures.push(name + ': ' + (e && e.message));
    console.error('FAIL - ' + name + '\n  ' + (e && e.stack));
  }
}

// ---------------- Par math ----------------

test('average of 4 moves / 120s is 30s', () => {
  assert.equal(C.computeMoveAverage(4, 120000), 30000);
});

test('average with zero moves returns null', () => {
  assert.equal(C.computeMoveAverage(0, 120000), null);
});

test('average clamps negative elapsed to zero', () => {
  assert.equal(C.computeMoveAverage(2, -5000), 0);
});

test('average rejects non-finite input', () => {
  assert.equal(C.computeMoveAverage(NaN, 1000), null);
  assert.equal(C.computeMoveAverage(1, Infinity), null);
});

test('drift is average minus par', () => {
  assert.equal(C.computeParDrift(30000, 35000), 5000);
  assert.equal(C.computeParDrift(30000, 25000), -5000);
});

test('drift rejects null average', () => {
  assert.equal(C.computeParDrift(30000, null), null);
});

test('status thresholds: on-pace within tolerance, behind/ahead beyond', () => {
  assert.equal(C.computeParStatus(400), 'on-pace');     // +0.4s
  assert.equal(C.computeParStatus(-400), 'on-pace');    // −0.4s
  assert.equal(C.computeParStatus(600), 'behind');      // +0.6s
  assert.equal(C.computeParStatus(-600), 'ahead');      // −0.6s
});

test('status with no data', () => {
  assert.equal(C.computeParStatus(null), 'no-data');
  assert.equal(C.computeParStatus(undefined), 'no-data');
  assert.equal(C.computeParStatus(NaN), 'no-data');
});

test('custom tolerance is respected', () => {
  assert.equal(C.computeParStatus(900, 1000), 'on-pace');
  assert.equal(C.computeParStatus(1500, 1000), 'behind');
});

test('summarizePar full flight', () => {
  const s = C.summarizePar({ parMs: 30000, movesCompleted: 4, elapsedMs: 130000 });
  assert.equal(s.movesCompleted, 4);
  assert.equal(s.averageMs, 32500);
  assert.equal(s.driftMs, 2500);
  assert.equal(s.status, 'behind');
  assert.equal(s.expectedTotalMs, 120000);
});

test('summarizePar ahead of par', () => {
  const s = C.summarizePar({ parMs: 30000, movesCompleted: 10, elapsedMs: 280000 });
  assert.equal(s.averageMs, 28000);
  assert.equal(s.status, 'ahead');
});

test('summarizePar zero moves yields on-pace-safe no-data flow', () => {
  const s = C.summarizePar({ parMs: 30000, movesCompleted: 0, elapsedMs: 0 });
  assert.equal(s.movesCompleted, 0);
  assert.equal(s.averageMs, null);
  assert.equal(s.driftMs, null);
  assert.equal(s.status, 'no-data');
});

test('summarizePar fractional moves floored', () => {
  const s = C.summarizePar({ parMs: 10000, movesCompleted: 3.7, elapsedMs: 90000 });
  assert.equal(s.movesCompleted, 3);
  assert.equal(s.averageMs, 30000);
});

test('summarizePar invalid par returns null', () => {
  assert.equal(C.summarizePar({ parMs: 0, movesCompleted: 3, elapsedMs: 1000 }), null);
  assert.equal(C.summarizePar({ parMs: -5, movesCompleted: 3, elapsedMs: 1000 }), null);
  assert.equal(C.summarizePar({}), null);
});

test('describeParStatus wording', () => {
  assert.equal(C.describeParStatus('ahead'), 'ahead of par');
  assert.equal(C.describeParStatus('behind'), 'behind par');
  assert.equal(C.describeParStatus('on-pace'), 'on pace');
  assert.equal(C.describeParStatus('no-data'), 'no pace data yet');
});

test('par math stays symmetric and stable across order of calls', () => {
  const a = C.summarizePar({ parMs: 5000, movesCompleted: 9, elapsedMs: 46000 });
  const b = C.summarizePar({ parMs: 5000, movesCompleted: 9, elapsedMs: 46000 });
  assert.deepEqual(a, b);
});

// ---------------- Profiles ----------------

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map
  };
}

function validProfile(overrides) {
  return Object.assign({
    name: '5+3 blitz',
    minutes: 5,
    increment: 3,
    parSeconds: 15,
    wakeSeconds: 30,
    criticalSeconds: 10
  }, overrides || {});
}

test('sanitizeProfile keeps valid profile', () => {
  const p = C.sanitizeProfile(validProfile());
  assert.ok(p);
  assert.equal(p.name, '5+3 blitz');
  assert.equal(p.minutes, 5);
  assert.equal(p.increment, 3);
});

test('sanitizeProfile clamps out-of-range numbers', () => {
  const p = C.sanitizeProfile(validProfile({ minutes: 9000, increment: -3, parSeconds: 999999, criticalSeconds: -99, wakeSeconds: 10 }));
  assert.ok(p);
  assert.equal(p.minutes, 180);
  assert.strictEqual(p.increment, 0);
  assert.equal(p.parSeconds, 600);
  assert.strictEqual(p.criticalSeconds, 0);
});

test('sanitizeProfile rejects empty or non-string names', () => {
  assert.equal(C.sanitizeProfile(validProfile({ name: '   ' })), null);
  assert.equal(C.sanitizeProfile(validProfile({ name: 42 })), null);
});

test('sanitizeProfile rejects non-numeric junk and weird objects', () => {
  assert.equal(C.sanitizeProfile(null), null);
  assert.equal(C.sanitizeProfile('nope'), null);
  assert.equal(C.sanitizeProfile([1, 2]), null);
  assert.equal(C.sanitizeProfile(validProfile({ minutes: 'soon' })), null);
  assert.equal(C.sanitizeProfile(validProfile({ parSeconds: NaN })), null);
});

test('sanitizeProfile trims long names to 40 chars', () => {
  const p = C.sanitizeProfile(validProfile({ name: 'x'.repeat(100) }));
  assert.equal(p.name.length, 40);
});

test('store save assigns id and timestamps', () => {
  const store = C.createProfileStore(memoryStorage(), 'test.profiles');
  const saved = store.save(validProfile());
  assert.ok(saved);
  assert.equal(typeof saved.id, 'string');
  assert.ok(saved.id.length > 0);
  assert.equal(typeof saved.createdAt, 'number');
  assert.equal(typeof saved.updatedAt, 'number');
});

test('save then list round-trips', () => {
  const store = C.createProfileStore(memoryStorage(), 'test.profiles');
  store.save(validProfile({ name: 'alpha' }));
  store.save(validProfile({ name: 'beta' }));
  const list = store.list();
  assert.equal(list.length, 2);
  const names = Array.from(list, (p) => p.name).sort();
  assert.deepEqual(names, ['alpha', 'beta']);
});

test('save with same id updates instead of duplicating', () => {
  const store = C.createProfileStore(memoryStorage(), 'test.profiles');
  const first = store.save(validProfile({ name: 'before' }));
  const updated = store.save(Object.assign(validProfile({ name: 'after' }), { id: first.id }));
  assert.equal(updated.id, first.id);
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'after');
  assert.equal(list[0].createdAt, first.createdAt);
  assert.ok(list[0].updatedAt >= first.createdAt);
});

test('get returns saved profile and null for miss', () => {
  const store = C.createProfileStore(memoryStorage(), 'test.profiles');
  const saved = store.save(validProfile());
  assert.equal(store.get(saved.id).name, saved.name);
  assert.equal(store.get('no-such-id'), null);
});

test('remove deletes only the target profile', () => {
  const store = C.createProfileStore(memoryStorage(), 'test.profiles');
  const a = store.save(validProfile({ name: 'a' }));
  const b = store.save(validProfile({ name: 'b' }));
  assert.equal(store.remove(a.id), true);
  assert.equal(store.list().length, 1);
  assert.equal(store.get(a.id), null);
  assert.equal(store.get(b.id).name, 'b');
});

test('remove unknown id returns false', () => {
  const store = C.createProfileStore(memoryStorage(), 'test.profiles');
  assert.equal(store.remove('ghost'), false);
});

test('store survives corrupt JSON in storage', () => {
  const storage = memoryStorage();
  storage.setItem('test.profiles', '{not json at all');
  const store = C.createProfileStore(storage, 'test.profiles');
  assert.equal(store.list().length, 0);
  const saved = store.save(validProfile({ name: 'rescued' }));
  assert.ok(saved);
  assert.equal(store.list().length, 1);
});

test('store drops malformed entries but keeps good ones', () => {
  const storage = memoryStorage();
  storage.setItem('test.profiles', JSON.stringify([
    { id: 'x1', name: 'good', minutes: 10, increment: 0, parSeconds: 20, wakeSeconds: 30, criticalSeconds: 10 },
    { id: 'x2', name: '', minutes: 10 },
    'not an object',
    { id: 'x3', name: 'bad numbers', minutes: 'many', parSeconds: 20 }
  ]));
  const store = C.createProfileStore(storage, 'test.profiles');
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'good');
});

test('store persists across store instances (localStorage semantics)', () => {
  const storage = memoryStorage();
  const s1 = C.createProfileStore(storage, 'test.profiles');
  s1.save(validProfile({ name: 'carried' }));
  const s2 = C.createProfileStore(storage, 'test.profiles');
  const list = s2.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'carried');
});

test('save rejects unsanitizable profiles returned as null', () => {
  const store = C.createProfileStore(memoryStorage(), 'test.profiles');
  assert.equal(store.save(validProfile({ name: '' })), null);
  assert.equal(store.list().length, 0);
});

// ---------------- Summary ----------------

console.log('');
if (failures.length) {
  console.error(failedSummary());
  process.exit(1);
} else {
  console.log('All ' + passed + ' tests passed.');
}

function failedSummary() {
  return failures.length + ' test(s) failed:\n  - ' + failures.join('\n  - ');
}
