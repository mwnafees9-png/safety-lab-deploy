#!/usr/bin/env node
/*
 * Regression tests for COL-1 — teammate presence (presence.js).
 *
 * Locks:
 *   [1] guards: ITAR projects never start presence; ?presence=0 and
 *       SLA_PRESENCE='0' opt out; display lane (no store writes).
 *   [2] behavior on a stubbed Realtime channel: subscribe → track carries
 *       name/tok/tab/pageId; presence sync renders peers (self excluded);
 *       cursor broadcasts render peers on the SAME page only, in world
 *       coordinates; identity never color-alone (name on every marker).
 *   [3] wiring: script tag; additive switchTab wrap (_presWrapped) re-tracks;
 *       fixed categorical palette assigned by stable hash.
 *
 * Run:  node tests/regression_presence.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const SITE = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const src = SITE('presence.js');

// ---- harness: stub DOM + supabase channel ------------------------------------
globalThis.window = globalThis;
globalThis.location = { search: '' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => 'selfselfXXXX' }, configurable: true });
const dom = {};
globalThis.document = {
  getElementById: id => dom[id] || null,
  querySelector: sel => dom[sel] || null,
  createElement: () => { const el = { style: {}, innerHTML: '', setAttribute() {}, appendChild() {}, addEventListener() {} }; return el; },
  createElementNS: () => { const el = { style: {}, innerHTML: '', attrs: {}, setAttribute(k, v) { el.attrs[k] = v; }, remove() {} }; return el; },
  body: { appendChild(el) { dom['pres-strip'] = el; } },
  addEventListener() {},
  readyState: 'complete'
};
globalThis.projectConfig = {};
globalThis._supabaseSession = { user: { email: 'waqas@safetylabaero.com' } };
globalThis.getActiveCloudProjectId = () => 'proj-1';
globalThis.getActiveWorkspaceId = () => 'ws-1';
globalThis.activeFTAPageId = 'pg-A';
globalThis.switchTab = function () { return 'orig'; };
// stubbed channel
const chanLog = { on: [], sent: [], tracked: [] };
let _syncCb = null, _cursorCb = null;
const chanStub = {
  on(kind, opts, cb) { chanLog.on.push(opts.event || kind); if (opts.event === 'sync') _syncCb = cb; if (opts.event === 'cursor') _cursorCb = cb; return chanStub; },
  subscribe(cb) { cb('SUBSCRIBED'); return chanStub; },
  track(p) { chanLog.tracked.push(p); },
  send(m) { chanLog.sent.push(m); },
  presenceState() { return { 'selfself': [{ name: 'waqas', tok: 'selfself', tab: 'FTA', pageId: 'pg-A' }],
                             'tok-peer-1': [{ name: 'tj', tok: 'tok-peer-1', tab: 'FTA', pageId: 'pg-A' }] }; }
};
globalThis.getSupabaseClient = () => ({ channel: (name, cfg) => { chanLog.name = name; chanLog.cfg = cfg; return chanStub; } });

(0, eval)(src);
const P = globalThis.SLPresence;

console.log('\n[1] guards');
const stripped = src.replace(/\/\/[^\n]*/g, '');
check('display lane — no store writes', !/(ftaPages\s*=(?!=)|acFhaData\s*=(?!=)|projectConfig\.\w+\s*=(?!=))/.test(stripped));
check('ITAR projects never start presence', /_itar\(\)\) return;/.test(src));
check('opt-outs honored (?presence=0 / SLA_PRESENCE)', /presence=0/.test(src) && /SLA_PRESENCE/.test(src));

console.log('\n[2] behavior (stubbed Realtime channel)');
P.start();
check('channel scoped to workspace+project with presence key', chanLog.name === 'slab-presence:ws-1:proj-1' && chanLog.cfg.config.presence.key === 'selfself');
check('subscribe → track carries name/tok/tab/pageId', chanLog.tracked.length === 1 && chanLog.tracked[0].name === 'waqas' && chanLog.tracked[0].tok === 'selfself' && chanLog.tracked[0].pageId === 'pg-A');
_syncCb();
check('presence sync renders peers, self excluded', P.peers().length === 1 && P.peers()[0].name === 'tj');
check('avatar strip carries the NAME (identity never color-alone)', dom['pres-strip'] && /tj/.test(dom['pres-strip'].innerHTML) && /border:1\.5px solid/.test(dom['pres-strip'].innerHTML));
// cursor rendering: same page renders; different page ignored
const gStub = { children: [], querySelector: () => null, appendChild(el) { gStub.children.push(el); }, parentNode: {} };
dom['#fta-svg g'] = gStub;
_cursorCb({ payload: { tok: 'tok-peer-1', name: 'tj', pageId: 'pg-A', x: 120, y: 340 } });
check('same-page peer cursor rendered at world coords with name label', gStub.children.length === 1 && gStub.children[0].attrs.transform === 'translate(120,340)' && /tj/.test(gStub.children[0].innerHTML));
_cursorCb({ payload: { tok: 'tok-peer-2', name: 'mike', pageId: 'pg-OTHER', x: 1, y: 2 } });
check('different-page cursor NOT rendered', gStub.children.length === 1);
_cursorCb({ payload: { tok: 'selfself', name: 'waqas', pageId: 'pg-A', x: 0, y: 0 } });
check('own echo ignored', gStub.children.length === 1);

console.log('\n[3] wiring');
const idx = SITE('index.html');
check('index.html loads presence.js', /presence\.js\?v=1\./.test(idx));
check('switchTab wrap additive + re-tracks', globalThis.switchTab._presWrapped === true && /_retrack\(\)/.test(src));
check('fixed palette by stable hash, 6 colors', Array.isArray(P.COLORS) && P.COLORS.length === 6 && P._colorFor('abc') === P._colorFor('abc'));
check('cursor stream throttled + world-coordinate transform', /CURSOR_MS/.test(src) && /d3\.zoomTransform/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
