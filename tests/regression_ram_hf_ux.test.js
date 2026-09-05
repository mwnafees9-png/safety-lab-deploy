/*
 * regression_ram_hf_ux.test.js — the R&M / HF intuitiveness pass
 * (30 Aug 2026, Waqas: "we need to make the RAM and HF interface far more
 * intuitive"). Three surfaces, one doctrine: teach on empty, get out of the
 * way once data exists, never invent a store name.
 *
 *  1. RAM HUB (ram_hub.js NEW). One overview page grouping every R&M analysis
 *     under the four questions an engineer asks, with live status badges read
 *     ONLY from stores whose names are verified in their owning modules —
 *     a lane the hub does not know shows NO badge, never a fake "empty".
 *     Executed in vm: cards render, statuses count, gating chips follow
 *     _ramHasAccess, clicks route through switchTab.
 *  2. 217F LIVE RESULTS (ram_predict v0.5). The page computes on render and
 *     on every authored change — no stale/empty result block on a populated
 *     page; the empty state teaches the three steps. Engine untouched.
 *  3. HF ORIENTATION (hf_register_panel v0.9). Empty register → full
 *     three-step orientation with the guarded AI entry; populated register →
 *     slim action row. Display-lane only (no store writes in the orientation).
 *
 * Mutations proven red: a guessed store name added to STATUS; status reader
 * throwing kills the render; live recompute unplugged; orientation always
 * teaching (never collapsing); hub view not toggled by switchTab.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = path.join(__dirname, '..', 'site');
const hubSrc = fs.readFileSync(path.join(SITE, 'ram_hub.js'), 'utf8');
const rpSrc = fs.readFileSync(path.join(SITE, 'ram_predict.js'), 'utf8');
const hfSrc = fs.readFileSync(path.join(SITE, 'hf_register_panel.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok   ' + name);
  else { failures++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- shared fake DOM (string-capture, same style as the other UI suites) --
function fakeDoc(ids) {
  const els = {};
  (ids || []).forEach(id => { els[id] = { id, innerHTML: '', style: {}, appendChild() {}, querySelector: () => null }; });
  return {
    getElementById: id => els[id] || null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    _els: els,
  };
}

/* ------------------------------------------------------------------ */
console.log('1. RAM hub — executed');

function hubSandbox(cfg) {
  const doc = fakeDoc(['ram-hub-host', 'view-ram-hub']);
  const calls = [];
  const sb = {
    window: {}, document: doc, console, Array, Object, String, Number, Math, JSON,
    projectConfig: cfg,
  };
  sb.window.switchTab = t => calls.push(t);
  sb.window._ramHasAccess = () => (cfg && cfg.__access !== undefined ? cfg.__access : true);
  vm.createContext(sb);
  vm.runInContext(hubSrc, sb);
  return { sb, doc, calls, api: sb.window.RAM_HUB };
}

{
  const full = hubSandbox({
    ram: { predict: { rows: [{ cat: 'Capacitor, Ceramic', qty: 4 }] }, fieldRows: [], tasks: [{}, {}] },
    rbd: { models: [{}] }, rbdMc: { cases: [] }, markovModels: [{}, {}, {}],
    msg3: { msis: [] }, swrel: { cscis: [] }, lcc: { items: [] }, sneak: { dispositions: [] },
  });
  full.api.renderPage();
  const html = full.doc._els['ram-hub-host'].innerHTML;
  check('hub renders the four program-order questions',
    /How often will each piece fail/.test(html) && /tolerate failures/.test(html) &&
    /real experience/.test(html) && /maintained affordably/.test(html));
  check('every R&M nav page has a card (predict/rbd/weibull/growth/alloc/tol/mc/frameworks/swrel/sneak/lcc + maintainability six + library + markov)',
    ['ram-predict','library','ram-tol','swrel','ram-rbd','markov','rbd-mc','sneak','ram-rel','ram-weibull','ram-growth','rel-frameworks','ram-mx','ram-msg3','msg3x','ram-pmopt','ram-test','ram-lora','lcc','ram-alloc']
      .every(t => html.indexOf("RAM_HUB.go('" + t + "')") >= 0));
  check('live status: populated store shows its count with the right noun',
    /1 part category/.test(html) && /3 models/.test(html) && /2 maintenance tasks/.test(html));
  check('live status: empty VERIFIED store says "not started"', /not started/.test(html));
  check('a lane whose store the hub does not know shows NO badge (Weibull card carries neither count nor not-started)',
    (() => { const card = html.split('Weibull')[1].split('rmh-card')[0]; return !/not started/.test(card) && !/rmh-badge/.test(card); })());
  check('headline counts only tracked analyses honestly',
    /of 10 tracked analyses/.test(html) && /<b[^>]*>4<\/b>/.test(html));
  check('cards route through switchTab',
    (() => { full.api.go('ram-predict'); return full.calls.includes('ram-predict'); })());
  check('markov card says where it lives (cross-group honesty)', /lives under Safety Labs/.test(html));

  // gating: no access -> Pro+ chips appear on gated cards, hub still renders all
  const locked = hubSandbox({ __access: false });
  locked.api.renderPage();
  const lhtml = locked.doc._els['ram-hub-host'].innerHTML;
  check('without Pro+ the gated cards carry the chip and the hub SHOWS the lane anyway (the hub is the demo)',
    (lhtml.match(/>Pro\+</g) || []).length >= 10 && /Parts Count/.test(lhtml) && /visible here so you can see/.test(lhtml));
  const open2 = hubSandbox({});
  open2.api.renderPage();
  check('with access no Pro+ chip renders', !/>Pro\+</.test(open2.doc._els['ram-hub-host'].innerHTML));

  // defensive: a hostile/absent projectConfig never kills the page
  const bare = hubSandbox(null);
  bare.api.renderPage();
  check('renders with NO projectConfig at all (all counters read 0/absent, page intact)',
    /How often will each piece fail/.test(bare.doc._els['ram-hub-host'].innerHTML));
  // and a store whose PROPERTY ACCESS throws (desktop-sync ghosts, frozen
  // proxies) degrades that one badge to silence — the page still renders
  const hostileCfg = { ram: { predict: { rows: [{}] } } };
  Object.defineProperty(hostileCfg, 'rbd', { get() { throw new Error('hostile store'); }, enumerable: true });
  const hostile = hubSandbox(hostileCfg);
  hostile.api.renderPage();
  const hh = hostile.doc._els['ram-hub-host'].innerHTML;
  check('a THROWING store kills one badge, never the page (reader guard)',
    /How often will each piece fail/.test(hh) && /1 part category/.test(hh) &&
    (() => { const card = hh.split('Block Diagrams')[1].split('rmh-card')[0]; return !/rmh-badge/.test(card); })(),
    hh ? 'rendered len ' + hh.length : 'EMPTY — render died');

  // switchTab wrap toggles the hub view (the ram-predict lesson, applied)
  const w = hubSandbox({});
  w.sb.window.switchTab('ram-hub');
  check('switchTab wrap reveals view-ram-hub and renders', w.doc._els['view-ram-hub'].style.display === 'block' &&
    /rmh-stage/.test(w.doc._els['ram-hub-host'].innerHTML));
  w.sb.window.switchTab('fha');
  check('and hides it again on any other tab', w.doc._els['view-ram-hub'].style.display === 'none');

  // vocabulary rule, structurally: every STATUS key reads projectConfig via
  // guarded member access only — and the read-only rule holds (no assignments
  // into projectConfig anywhere in the file)
  check('hub is READ-ONLY (never assigns into projectConfig)', !/projectConfig\.[a-zA-Z.]+\s*=/.test(hubSrc));
  check('hub classes live under rmh-*',
    (() => { const cls = [...hubSrc.matchAll(/class="([a-z0-9-]+)/g)].map(m => m[1]).filter(c => c !== 'u-mono' && c !== 'btn-cyan'); return cls.length > 3 && cls.every(c => c.startsWith('rmh-')); })());
  check('no standalone stylesheet injected', !/<style/.test(hubSrc));
}

/* ------------------------------------------------------------------ */
console.log('2. 217F live results (ram_predict v0.5)');

function rpSandbox(cfg, db) {
  const doc = fakeDoc(['ram-predict-host', 'rp-out', 'view-ram-predict', 'rp-cat']);
  // renderPage assigns host.innerHTML then compute() writes rp-out
  const sb = {
    window: { RAM_PREDICT_DATA: db }, document: doc, console, Array, Object, String, Number, Math, JSON, Date,
    projectConfig: cfg, _toast: () => {},
  };
  vm.createContext(sb);
  vm.runInContext(rpSrc, sb);
  return { sb, doc, api: sb.window.RAM_PREDICT };
}
{
  const db = {
    meta: { source: 'MIL-HDBK-217F Notice 2' },
    environments: { AIC: 'Airborne, Inhabited Cargo' },
    categories: { cap: { name: 'Capacitor, Ceramic', defaultQuality: 'B', piQ: { B: 1 }, cite: 'T-1 p.1' } },
  };
  // the engine itself is real (predict lives in this file)
  const popped = rpSandbox({ ram: { predict: { env: 'AIC', rows: [{ cat: 'cap', qty: 2, quality: 'B' }] } } }, Object.assign({}, db, {
    categories: { cap: { name: 'Capacitor, Ceramic', defaultQuality: 'B', piQ: { B: 1 }, lambdaG: { AIC: 0.5 }, cite: 'T-1 p.1' } },
  }));
  popped.api.renderPage();
  const out = popped.doc._els['rp-out'].innerHTML;
  check('LIVE: a populated page shows the computed result on plain render (no button press)',
    /λ total/.test(out) && /MTBF/.test(out), out.slice(0, 120));
  popped.doc._els['rp-out'].innerHTML = '';
  popped.api.setQty(0, '5');
  check('LIVE: an authored change recomputes (setQty refreshed the result block)',
    /λ total/.test(popped.doc._els['rp-out'].innerHTML));
  popped.doc._els['rp-out'].innerHTML = '';
  popped.api.setEnv('AIC');
  check('LIVE: environment change recomputes too', /λ total/.test(popped.doc._els['rp-out'].innerHTML));

  const empty = rpSandbox({ ram: { predict: { env: 'AIC', rows: [] } } }, db);
  empty.api.renderPage();
  const ehtml = empty.doc._els['ram-predict-host'].innerHTML;
  check('teach-on-empty: the three steps and the promise of cited numbers',
    /first failure-rate estimate/i.test(ehtml) && /Pick the <b>use environment<\/b>/.test(ehtml) &&
    /Add part categories/.test(ehtml) && /handbook citation/.test(ehtml));
  check('teach-on-empty: the formula is stated, not hidden', /Σ N·λg·πQ/.test(ehtml));
  check('empty page does NOT run compute (reads never write; nothing to compute)',
    empty.doc._els['rp-out'].innerHTML === '');
  check('the two-lane honesty line survives the redesign', /a parts count earns no credit/.test(ehtml));
  check('refusal path intact: engine still throws the sourced-set refusal', /is not in the sourced set/.test(rpSrc));
}

/* ------------------------------------------------------------------ */
console.log('3. HF orientation (hf_register_panel v0.9)');
{
  check('orientation renders in the HFA view pipeline', /_hfaOrientation\(hf\)/.test(hfSrc) &&
    /function _hfaOrientation\(hf\)/.test(hfSrc));
  // 30 Aug (later, Waqas: "human factors is not just about assumptions") —
  // the strip was REFRAMED as the HF lane map; checks superseded to match.
  check('teach on empty: the lane map (allocation / task / error / alerting / ergonomics) + the bridge framing',
    /Human factors is its own analysis lane/.test(hfSrc) && /The bridge \(this page\)/.test(hfSrc) &&
    /Function Allocation/.test(hfSrc) && /Human Error Analysis/.test(hfSrc) && /Crew Alerting/.test(hfSrc));
  // EXECUTED, not source-shape: the collapse must actually happen
  const orientFn = (() => {
    const at = hfSrc.indexOf('function _hfaOrientation');
    const open = hfSrc.indexOf('{', at);
    let d = 0;
    for (let i = open; i < hfSrc.length; i++) {
      if (hfSrc[i] === '{') d++;
      else if (hfSrc[i] === '}') { d--; if (!d) return hfSrc.slice(at, i + 1); }
    }
    return null;
  })();
  const osb = { console, Array, Object, String };
  vm.createContext(osb);
  vm.runInContext(orientFn + ';globalThis.__o = _hfaOrientation;', osb);
  const fullStrip = vm.runInContext('__o({ asmAllTyped: () => [{ asmId: "A", statement: "untyped note" }] })', osb);
  const slim = vm.runInContext('__o({ asmAllTyped: () => [{ asmId: "A", type: "Human Factors" }] })', osb);
  check('EXECUTED collapse: empty register shows the full lane map',
    /Human factors is its own analysis lane/.test(fullStrip) && /hfr-orient"/.test(fullStrip) &&
    ['hfa-alloc','hfa-task','hfa-hea','hfa-alerts','hfa-ergo'].every(t => fullStrip.indexOf(t) >= 0));
  check('EXECUTED collapse: a typed row collapses to the slim action row (teach on empty, out of the way on data)',
    /hfr-orient-slim/.test(slim) && !/Human factors is its own analysis lane/.test(slim));
  check('the slim row keeps the AI entry and DROPS the duplicate lane links (vertical rail is canonical)',
    /Find unregistered crew credit/.test(slim) && ['hfa-alloc','hfa-task','hfa-hea','hfa-alerts','hfa-ergo'].every(t => slim.indexOf(t) < 0));
  check('the AI entry is present, guarded, and honestly described',
    /window\.SafetyLabAI\.draftHfAssumptions/.test(hfSrc) && /Find unregistered crew credit/.test(hfSrc) &&
    /drafts the missing assumptions for your review/.test(hfSrc));
  check('teaching-card lane links route to every HF analysis tab',
    ['hfa-alloc','hfa-task','hfa-hea','hfa-alerts','hfa-ergo'].every(t => hfSrc.indexOf("lane('" + t + "'") >= 0));
  check('orientation is DISPLAY-LANE (no author/store access inside it)',
    (() => { const fn = hfSrc.split('function _hfaOrientation')[1].split('\n    function ')[0]; return !/author\./.test(fn) && !/acAssumptionsData/.test(fn) && !/\.push\(/.test(fn); })());
  check('work-items empty row now names both entry paths (typed OR the AI button)',
    /or use <b>Find unregistered crew credit<\/b> above/.test(hfSrc));
  // the doctrines the existing suite pins must be untouched — spot-check two
  check('two-lane governing rule copy intact', /only while the assumption is Validated or Verified/i.test(hfSrc) ||
    /Validated or Verified/.test(hfSrc));
  check('membership language matches the register (type or credited/uncredited)', /a\.type \|\| a\.credited != null \|\| a\.uncredited != null/.test(hfSrc));
}

/* ------------------------------------------------------------------ */
console.log('4. index.html wiring + pins (floors)');
function pin(src, re) { const m = src.match(re); return m ? parseFloat(m[1]) : -1; }
check('hub nav item present, FIRST in the R&M group, never tier-hidden',
  (() => { const g = indexSrc.split('id="asb-grp-ram"')[1]; const i = g.indexOf('snav-ram-hub'); const j = g.indexOf('snav-library');
    return i >= 0 && j > i && !/snav-ram-hub[^>]*display:none/.test(g) && /switchTab\('ram-hub'\)/.test(g); })());
check('view-ram-hub exists with the hub host', /id="view-ram-hub"/.test(indexSrc) && /id="ram-hub-host"/.test(indexSrc));
check('ram_hub.js loaded cache-busted, floor >= 1.0', pin(indexSrc, /ram_hub\.js\?v=([\d.]+)/) >= 1.0);
check('ram_predict pin floor >= 0.5 (live results)', pin(indexSrc, /ram_predict\.js\?v=([\d.]+)/) >= 0.5);
check('hf_register_panel pin floor >= 1.0 (lane-map orientation)', pin(indexSrc, /hf_register_panel\.js\?v=([\d.]+)/) >= 1.0);

console.log(failures ? ('FAILED — ' + failures + ' check(s)') : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
