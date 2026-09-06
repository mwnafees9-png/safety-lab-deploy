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
  presenceState() { return { 'selfself': [{ name: 'waqas', email: 'waqas@safetylabaero.com', tok: 'selfself', tab: 'FTA', pageId: 'pg-A' }],
                             'tok-peer-1': [{ name: 'TJ Ahmed', email: 'tj@radia.com', initials: 'TA', tok: 'tok-peer-1', tab: 'FTA', pageId: 'pg-A', at: 5 }],
                             'tok-peer-1b': [{ name: 'TJ Ahmed', email: 'tj@radia.com', initials: 'TA', tok: 'tok-peer-1b', tab: 'FHA', pageId: null, at: 9 }],   // same person, second tab
                             'tok-anon': [{ name: '', email: '', tok: 'tok-anon', tab: 'FTA', pageId: 'pg-A' }] }; }   // unnamed session — must never show
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
check('subscribe → track carries name/email/initials/tok/tab/pageId', chanLog.tracked.length === 1 && chanLog.tracked[0].name === 'waqas' && chanLog.tracked[0].email === 'waqas@safetylabaero.com' && chanLog.tracked[0].initials === 'W' && chanLog.tracked[0].tok === 'selfself' && chanLog.tracked[0].pageId === 'pg-A');
_syncCb();
check('presence sync renders peers, self excluded', P.peers().length === 3 && !P.peers().some(p => p.tok === 'selfself'));
console.log('\n[2b] v2.0 avatars — one bubble per PERSON, initials, no anonymous bubbles');
const people = P.people();
check('ONE bubble per person: two tabs of tj@radia.com collapse to one', people.length === 1 && people[0].email === 'tj@radia.com');
check('the collapsed bubble is the most recent tab (FHA, at:9)', people[0].tab === 'FHA');
check('an unnamed session is NEVER shown', !people.some(p => !p.email));
const strip = dom['pres-strip'];
check('strip renders a round avatar with the two initials', strip && /sl-avatar/.test(strip.innerHTML) && /border-radius:50%/.test(strip.innerHTML) && />TA</.test(strip.innerHTML));
check('full name + where they are on hover (title), never a bare colour', strip && /title="TJ Ahmed — FHA"/.test(strip.innerHTML));
check('no anonymous "engineer" bubble anywhere', strip && !/engineer/.test(strip.innerHTML) && !/tok-anon/.test(strip.innerHTML));
check('strip is inline (no fixed positioning when a top bar exists) and hidden when empty', /export-group/.test(src) && /insertBefore\(strip, pref\)/.test(src) && /strip\.style\.display = 'none'/.test(src));
check('overflow past five people collapses to a "+N" bubble', /sl-avatar-more/.test(src) && /people\.length - MAX/.test(src));
const A = globalThis.SLAvatar;
check('SLAvatar.initials: first + last ("Waqas Nafees" → WN; "mwnafees9" → M; "Jean-Luc Picard" → JP)', A.initials('Waqas Nafees') === 'WN' && A.initials('mwnafees9') === 'M' && A.initials('Jean-Luc Picard') === 'JP' && A.initials('') === '?');
check('SLAvatar.html draws a picture when one is on the account, initials otherwise', /<img src="data:image\/jpeg;base64,x"/.test(A.html({ name: 'A B', email: 'a@b.c', avatar: 'data:image/jpeg;base64,x' }, 28)) && />AB</.test(A.html({ name: 'A B', email: 'a@b.c' }, 28)));
check('SLAvatar.html refuses a non-image "avatar" (no injection through the picture field)', !/<img/.test(A.html({ name: 'A B', email: 'a@b.c', avatar: 'javascript:alert(1)' }, 28)) && !/<img/.test(A.html({ name: 'A B', email: 'a@b.c', avatar: '<img src=x onerror=alert(1)>' }, 28)));
const helpers = SITE('helpers_modules.js');
check('sign-in chip shows YOUR avatar via the one renderer (SLAvatar), removed on sign-out', /signin-chip-avatar/.test(helpers) && /window\.SLAvatar\.html\(me, 22/.test(helpers) && /if \(_av\) _av\.remove\(\);/.test(helpers));
check('Account panel: picture is resized on-device to a 96px square JPEG and saved on the ACCOUNT (user_metadata.avatar)', /_resizeImageToDataUrl\(f, 96/.test(helpers) && /updateUser\(\{ data: \{ avatar: dataUrl \|\| null \} \}\)/.test(helpers) && /toDataURL\('image\/jpeg', 0\.82\)/.test(helpers));
check('Account panel: non-image files refused; oversize refused (20 KB cap); Remove clears it', /Please choose an image file/.test(helpers) && /dataUrl\.length > 20000/.test(helpers) && /_saveAvatar\('', email, nameFn, msg\)/.test(helpers));
check('saving a picture or a name refreshes the chip AND re-broadcasts presence', (helpers.match(/SLPresence\.refresh\(\)/g) || []).length >= 2);
check('start() refuses to track without a signed-in identity', /!_identity\(\)\) \{ setTimeout\(start, 4000\); return; \}/.test(src));
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
check('index.html loads presence.js 2.x', /presence\.js\?v=2\./.test(idx));
check('switchTab wrap additive + re-tracks', globalThis.switchTab._presWrapped === true && /_retrack\(\)/.test(src));
check('fixed palette by stable hash, 6 colors', Array.isArray(P.COLORS) && P.COLORS.length === 6 && P._colorFor('abc') === P._colorFor('abc'));
check('cursor stream throttled + world-coordinate transform', /CURSOR_MS/.test(src) && /d3\.zoomTransform/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
