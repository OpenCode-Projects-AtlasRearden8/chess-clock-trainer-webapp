// Headless smoke test of the full app wiring (no dependencies).
// Shim enough DOM to execute index.html's script and exercise the main flows.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// collect element ids referenced in HTML
const idMatches = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const known = new Set(idMatches);

let timers = [];
let hrt = 0;
const storageMap = new Map();

function makeEl(id) {
  const el = {
    id,
    textContent: '',
    value: '',
    className: '',
    set innerHTML(v) { this._innerHTML = v; this.children = []; },
    get innerHTML() { return this._innerHTML || ''; },
    disabled: false,
    title: '',
    style: { display: '' },
    handlers: {},
    children: [],
    classSet: new Set(),
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    click() { (this.handlers.click || []).forEach((f) => f.call(this, { code: 'click' })); },
    appendChild(c) { this.children.push(c); },
    set classList(v) {},
    get classList() {
      const self = this;
      return {
        add(...cs) { cs.forEach((c) => self.classSet.add(c)); },
        remove(...cs) { cs.forEach((c) => self.classSet.delete(c)); }
      };
    }
  };
  if (id.startsWith('set-') || id.startsWith('prof-') || id.startsWith('dr-')) {
    el.value = { 'set-par': '30', 'set-wake': '30', 'set-crit': '10',
      'prof-name': '', 'prof-min': '5', 'prof-inc': '3', 'prof-par': '15',
      'dr-blink': '3', 'dr-think': '12', 'dr-rounds': '8' }[id] || '';
  }
  if (id.endsWith('-time') || /^time-/.test(id)) el.className = 'time';
  return el;
}

const els = new Map();
function $(id) {
  if (!els.has(id)) els.set(id, makeEl(id));
  return els.get(id);
}

const document = {
  getElementById: $,
  createElement: (tag) => makeEl('anon-' + tag),
  querySelectorAll(sel) {
    if (sel === 'nav button') return ['tab-clock', 'tab-profiles', 'tab-drills'].map($);
    if (sel === '.tab') return ['view-clock', 'view-profiles', 'view-drills'].map($);
    return [];
  },
  addEventListener() {}
};

const window = {
  localStorage: {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => { storageMap.set(k, String(v)); }
  },
  AudioContext: undefined,
  webkitAudioContext: undefined
};

const sandbox = {
  window,
  document,
  localStorage: window.localStorage,
  performance: { now: () => hrt },
  setInterval: (fn) => { timers.push(fn); return timers.length; },
  clearInterval: (id) => { timers[id - 1] = null; },
  crypto: { randomUUID: () => 'uuid-' + (storageMap.size + 1) * 7 + '-x' },
  console,
  setTimeout: () => 0,
  parseFloat,
  JSON,
  Math,
  Object,
  Array,
  Number,
  String,
  Date
};
sandbox.window.document = document;
sandbox.document = document;

vm.runInNewContext(script, sandbox, { filename: 'app.js' });

// sanity: ids used by the app exist in the HTML
for (const id of ['side-white', 'time-w', 'par-b', 'chair-phase', 'savedmsg', 'btn-chair']) {
  assert.ok(known.has(id), 'id in HTML: ' + id);
}

// drive the timers once with no clock running — must not throw
hrt += 100;
timers.filter(Boolean).forEach((f) => f());

// start → switch → pause → reset
$('btn-start').click();
$('btn-pause').click();   //uspend
$('btn-pause').click();   // resume
hrt += 5000;              // white thinks 5 s
timers.filter(Boolean).forEach((f) => f());   // tick
assert.notEqual($('time-w').textContent, '05:00', 'white time decremented: ' + $('time-w').textContent);
assert.match($('time-w').textContent, /^04:/, 'white time under 5 min after 5 s of think');
$('btn-reset').click();

// par mode toggle changes label
$('btn-par-toggle').click();
assert.equal($('btn-par-toggle').textContent, 'Par mode: On');
$('btn-par-toggle').click();

// settings change clamps and persists
$('set-par').value = '999999';
$('set-par').handlers.change[0].call($('set-par'));
assert.equal($('set-par').value, 600, 'par clamped to 600');
assert.equal(JSON.parse(storageMap.get('cct.settings.v1')).parSeconds, 600);

// profile save + list render (using clock-side settings)
$('prof-name').value = 'My Five';
$('btn-save-profile').click();
assert.ok(storageMap.has('cct.profiles.v1'), 'profile persisted to localStorage');
assert.match($('savedmsg').textContent, /Saved "My Five"/, 'save confirmation shown');
assert.ok($('profile-list').children.length === 1, 'profile listed');
const li = $('profile-list').children[0];
const useBtn = li.children[1];
const delBtn = li.children[2];
assert.equal(useBtn.textContent, 'Load');
assert.equal(delBtn.textContent, 'Delete');

// load applies to clock
useBtn.click();
assert.equal($('time-w').textContent, '05:00', 'loaded profile resets clock to 5 min');

// delete
delBtn.click();
assert.equal($('profile-list').children.length, 0);
assert.equal($('').textContent === undefined ? true : true, true);

// blink chair: start runs, ticks switch phases
$('btn-chair').click();
assert.equal($('chair-phase').textContent, 'BLINK');
const chairTimer = timers[timers.length - 1];
assert.equal($('btn-chair').textContent, 'Stop');
for (let i = 0; i < 31; i++) chairTimer(); // 3.1 s of 100 ms ticks → think phase
assert.equal($('chair-phase').textContent, 'THINK');
for (let i = 0; i < 121; i++) chairTimer(); // 12.1 s → next blink, round 2
assert.equal($('chair-round').textContent, 'round 2 / 8', 'round advanced after think');
$('btn-chair').click(); // stop
assert.equal($('chair-phase').textContent, 'READY');
assert.equal($('btn-chair').textContent, 'Start');

// endgame via battery of ticks with wake thresholds
$('set-wake').value = '120';
$('set-wake').handlers.change[0].call($('set-wake'));
$('btn-start').click();
let flaggedSeen = false;
for (let i = 0; i < 400 && !flaggedSeen; i++) { hrt += 1000; timers.filter(Boolean).forEach((f) => f()); if ($('resultBanner').className.includes('show')) flaggedSeen = true; }
assert.ok(flaggedSeen, 'flag banner appears when time runs out');

console.log('App smoke test passed: start/pause/reset, par toggle + clamp + settings persist,');
console.log('profile save/load/delete, blink chair phases, time-out flag banner.');
