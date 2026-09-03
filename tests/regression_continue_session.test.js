#!/usr/bin/env node
/**
 * Regression — continue_session.js: "Continue where you left off" on sign-in, and
 * the two silent-provisioning guards in cloud_sync (3 Sep 2026).
 *
 * Waqas: "when a user signs in do they automatically get to where they left off
 * last session?" → "continue where you left off is what I want."
 *
 * Executed in a vm with a stub DOM and a scripted Supabase client:
 *   · the most-recent lookup (own or member; RLS is the server's job) and its shape;
 *   · the decision: card only for an EMPTY session or a PRISTINE DEMO, never over real
 *     work, never when the project is already open, never when paywalled, never after
 *     "Not now" in this browser session, never while an overlay is up;
 *   · the first-run demo offer is held back when a cloud project exists;
 *   · Open adopts the workspace, loads through _loadCloudProject and re-enters the PLACE;
 *   · the place is recorded on navigation into projectConfig.lastPlace, never during a
 *     resume, and never triggers a save;
 *   · cloud_sync: no silent provisioning within ten minutes of a demo load, none for a
 *     paywalled user; manual Save still provisions.
 * Run: node tests/regression_continue_session.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- stub DOM + scripted client ---------------------------------------------
function makeCtx(o) {
  o = o || {};
  const calls = [];
  const els = {};
  function el(id) { const e = { id, style: {}, attrs: {}, children: [], innerHTML: '', textContent: '', disabled: false, offsetParent: null, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, appendChild(c) { this.children.push(c); c.parent = this; }, remove() { this.removed = true; if (ctx.document.body.children.includes(this)) ctx.document.body.children.splice(ctx.document.body.children.indexOf(this), 1); }, querySelector(sel) { const m = sel.match(/#([\w-]+)/); return m ? (this.q[m[1]] || (this.q[m[1]] = { id: m[1], onclick: null, disabled: false, textContent: '' })) : null; }, q: {}, classList: { add() {}, contains() { return false; } } }; return e; }
  const ctx = {
    console: { warn() {}, error() {}, log() {}, info() {} }, Promise, Date, JSON, Object, Array, String, RegExp, setTimeout, clearTimeout, setInterval, clearInterval, Math,
    document: { readyState: 'complete', body: el('body'), documentElement: { classList: { contains() { return false; } } }, createElement(tag) { return el(tag); }, getElementById(id) { return o.overlays && o.overlays.includes(id) ? el(id) : null; }, querySelectorAll() { return []; }, addEventListener() {} },
    localStorage: { _m: Object.assign({}, o.ls || {}), getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); } },
    sessionStorage: { _m: Object.assign({}, o.ss || {}), getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); } },
    isSupabaseSignedIn: () => o.signedIn !== false,
    isPaywalled: () => !!o.paywalled,
    getSupabaseClient: () => ({ from(t) { const q = { _t: t, _ops: [], select() { return q; }, is() { return q; }, order() { return q; }, limit() { return q; }, eq() { return q; }, maybeSingle() { calls.push(t + ':maybeSingle'); return Promise.resolve({ data: o.doc === undefined ? { updated_at: '2026-09-03T00:00:00Z', version: 7 } : o.doc, error: null }); }, then(res, rej) { calls.push(t + ':list'); return Promise.resolve({ data: o.projects === undefined ? [{ id: 'p-1', name: 'HF Consistency · Aeolus · D1', workspace_id: 'ws-9', cert_basis: 'Part 25', updated_at: '2026-09-03T00:00:00Z' }] : o.projects, error: null }).then(res, rej); } }; return q; } }),
    setActiveWorkspaceId: (id) => { calls.push('ws:' + id); ctx._ws = id; },
    _loadCloudProject: async (id) => { calls.push('load:' + id); if (o.loadFails) return; ctx.__set('_activeCloudProjectId', id); if (o.lastPlace) ctx.__get('projectConfig').lastPlace = o.lastPlace; if (o.systemsAfterLoad) ctx.__set('systemsData', o.systemsAfterLoad); },
    openSystemWorkspace: (id) => calls.push('openSys:' + id),
    switchTab: (t) => calls.push('tab:' + t),
    switchWorkspaceTab: (t) => calls.push('sub:' + t),
    showToast: (m) => calls.push('toast:' + String(m).slice(0, 40)),
    scheduleAutosave: () => calls.push('AUTOSAVE'),
    window: null, _calls: calls,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  // the model's globals are top-level lets in other scripts: declare them in the context the same way
  vm.runInContext('let projectName = ' + JSON.stringify(o.projectName || '') + '; let projectConfig = {}; let _activeCloudProjectId = ' + JSON.stringify(o.pid || null) + '; let _dirtySinceSave = ' + (!!o.dirty) + ';' +
    'let acFunctionsData = ' + JSON.stringify(o.fns || []) + '; let acFhaData = []; let systemsData = ' + JSON.stringify(o.systems || []) + '; let itemsData = []; let acReqData = []; let ftaPages = [{ id: 1, root: null }]; let activeSystemId = null;' +
    'globalThis.__set = function (k, v) { eval(k + " = v"); }; globalThis.__get = function (k) { return eval(k); };', ctx);
  vm.runInContext(S('continue_session.js'), ctx);
  return ctx;
}
async function settle(ctx, ms) { await sleep(ms || 1300); }
function cardShown(ctx) { return ctx.document.body.children.some(c => c.id === 'sl-continue-card' && !c.removed); }

(async function () {
  console.log('\n[1] the lookup + the decision');
  {
    let c = makeCtx({}); await settle(c);
    check('empty session + a cloud project with a document → the card shows', cardShown(c) && c.SLContinue.state().candidate && c.SLContinue.state().candidate.id === 'p-1');
    check('…and the first-run demo offer is held back for a returning engineer', c.localStorage.getItem('safetyLab.firstRun.v1') === 'skipped-has-cloud-project');
    check('the lookup is one project query + one document query', c._calls.filter(x => x === 'projects:list').length === 1 && c._calls.filter(x => x === 'project_documents:maybeSingle').length === 1);
    c = makeCtx({ fns: [{ subId: 'F1' }], projectName: 'My real project' }); await settle(c);
    check('a session with real work: NO card, ever', !cardShown(c));
    c = makeCtx({ fns: [{ subId: 'F1' }], projectName: 'K350 Kestrel · Program Showcase' }); await settle(c);
    check('an untouched showcase (content, no cloud id, not dirty): the card shows over it', cardShown(c));
    c = makeCtx({ fns: [{ subId: 'F1' }], projectName: 'K350 Kestrel · Program Showcase', dirty: true }); c.__slDemoLoadedAt = Date.now() - 60000; await settle(c);
    check('a showcase loaded a minute ago, already dirty from the load itself: still pristine, card shows', cardShown(c));
    c = makeCtx({ fns: [{ subId: 'F1' }], projectName: 'K350 Kestrel · Program Showcase', dirty: true }); c.__slDemoLoadedAt = Date.now() - 20 * 60000; await settle(c);
    check('a showcase someone has worked on for twenty minutes: real work, no card', !cardShown(c));
    c = makeCtx({ pid: 'p-1' }); await settle(c);
    check('the project is already open (local resume carried it): no card', !cardShown(c));
    c = makeCtx({ paywalled: true }); await settle(c);
    check('paywalled: no card and no lookup at all — the paywall is the page', !cardShown(c) && c._calls.length === 0);
    c = makeCtx({ ss: { 'safetyLab.continue.dismissed': 'p-1' } }); await settle(c);
    check('"Not now" is remembered for the browser session', !cardShown(c));
    c = makeCtx({ projects: [] }); await settle(c);
    check('no cloud projects: nothing to continue, first-run offer left alone', !cardShown(c) && c.localStorage.getItem('safetyLab.firstRun.v1') === null);
    c = makeCtx({ doc: null }); await settle(c);
    check('a project row with no document yet: nothing to continue', !cardShown(c));
    c = makeCtx({ overlays: ['sl-eula-overlay'] }); await settle(c);
    check('an overlay (EULA) still up: the card waits', !cardShown(c) && c.SLContinue.state().candidate);
    c = makeCtx({ signedIn: false }); await settle(c);
    check('not signed in: no lookup', c._calls.length === 0);
  }

  console.log('\n[2] Open — workspace, load, place');
  {
    let c = makeCtx({ lastPlace: { tab: 'sys-workspace', systemId: 'sys-7', subTab: 'sfha' }, systemsAfterLoad: [{ id: 'sys-7' }] }); await settle(c);
    const card = c.document.body.children.find(x => x.id === 'sl-continue-card');
    await card.q['sl-continue-open'].onclick.call(card.q['sl-continue-open']); await sleep(20);
    check('Open adopts the project\'s workspace, loads through _loadCloudProject, then re-enters the system workspace + sub-tab', c._calls.join(' ').includes('ws:ws-9 load:p-1 openSys:sys-7 sub:sfha'), c._calls.join(' '));
    check('…the card is gone and the engineer is told', card.removed && c._calls.some(x => /^toast:Continuing HF Consistency/.test(x)));
    c = makeCtx({ lastPlace: { tab: 'ac-fha', systemId: '', subTab: '' } }); await settle(c);
    let cd = c.document.body.children.find(x => x.id === 'sl-continue-card'); await cd.q['sl-continue-open'].onclick.call(cd.q['sl-continue-open']); await sleep(20);
    check('a plain tab place re-enters that tab', c._calls.includes('tab:ac-fha'));
    c = makeCtx({ lastPlace: { tab: 'sys-workspace', systemId: 'sys-gone', subTab: 'sfha' }, systemsAfterLoad: [] }); await settle(c);
    cd = c.document.body.children.find(x => x.id === 'sl-continue-card'); await cd.q['sl-continue-open'].onclick.call(cd.q['sl-continue-open']); await sleep(20);
    check('a recorded system that no longer exists: falls back to the tab, never throws', !c._calls.some(x => x.startsWith('openSys:')) && c._calls.includes('tab:sys-workspace'));
    c = makeCtx({ loadFails: true }); await settle(c);
    cd = c.document.body.children.find(x => x.id === 'sl-continue-card'); await cd.q['sl-continue-open'].onclick.call(cd.q['sl-continue-open']); await sleep(20);
    check('a load that does not take: the card stays, the button re-arms, the engineer is pointed at Open-from-cloud', !cd.removed && cd.q['sl-continue-open'].disabled === false && c._calls.some(x => /Could not open/.test(x)));
  }

  console.log('\n[3] the place rides the document');
  {
    const c = makeCtx({ pid: 'p-1', fns: [{ subId: 'F1' }] }); await settle(c);
    c.switchTab('ac-fha');
    let lp = c.__get('projectConfig').lastPlace;
    check('navigation records projectConfig.lastPlace (tab)', lp && lp.tab === 'ac-fha' && lp.at, JSON.stringify(lp));
    c.__set('activeSystemId', 'sys-3'); c.switchTab('sys-workspace'); c.switchWorkspaceTab('pssa');
    lp = c.__get('projectConfig').lastPlace;
    check('…and the system + sub-tab', lp.tab === 'sys-workspace' && lp.systemId === 'sys-3' && lp.subTab === 'pssa', JSON.stringify(lp));
    check('recording never triggers a save of its own', !c._calls.includes('AUTOSAVE'));
    c._slResumeInFlight = true; c.switchTab('dashboard'); c._slResumeInFlight = false;
    check('a navigation made by the resume itself is not recorded', c.__get('projectConfig').lastPlace.tab === 'sys-workspace');
    check('the wrappers keep the earlier modules\' markers (SLWrap.preserve is called when present)', /SLWrap\.preserve\(orig, wrapped\)/.test(S('continue_session.js')));
  }

  console.log('\n[4] cloud_sync: silent provisioning guards');
  {
    const cs = S('cloud_sync.js');
    check('a demo load stamps window.__slDemoLoadedAt', /window\.__slDemoLoadedAt = Date\.now\(\)/.test(cs) && /isDemo = \(typeof _DEMO_LOADERS !== 'undefined'\) && _DEMO_LOADERS\.indexOf\(fnName\) >= 0/.test(cs));
    check('no silent provisioning within the demo grace window', /__slDemoLoadedAt && \(Date\.now\(\) - window\.__slDemoLoadedAt\) < _DEMO_GRACE_MS\) return null/.test(cs) && /_DEMO_GRACE_MS = 10 \* 60 \* 1000/.test(cs));
    check('no silent provisioning for a paywalled user', /isPaywalled === 'function' && isPaywalled\(\)\) return null/.test(cs));
    check('both guards sit inside the !pid branch — an EXISTING cloud project keeps syncing', (() => { const i = cs.indexOf('if (!pid) {'); const j = cs.indexOf('} else {', i); const blk = cs.slice(i, j); return /__slDemoLoadedAt/.test(blk) && /isPaywalled/.test(blk); })());
    check('the manual Save still provisions on purpose (unchanged path through _ensureCloudProject)', /projectId = await _ensureCloudProject\(client, wsId, name, certBasis, userId\)/.test(S('helpers_modules.js')));
    check('index.html loads continue_session.js after first_run.js', /first_run\.js\?v=[\d.]+" defer><\/script>\s*<script src="continue_session\.js\?v=/.test(S('index.html')));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
