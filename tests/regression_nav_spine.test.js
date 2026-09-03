#!/usr/bin/env node
/*
 * Regression — the horizontal strip is RETIRED; Prove presents as tabs
 * (23 Aug 2026 — the day's full arc, ending with Waqas: "this is useless" /
 * "remove the pills we have the vertical nav options" / "under prove there
 * should be separate tabs for the previous drop down menu options rather
 * than shoving everything in one page").
 *
 * This file once pinned the navigable spine (the reconciled six-stage map,
 * the lane pills, the Prove cluster). That entire surface shipped and was
 * struck the same day — a deliberate, signed-off reversal, superseded here
 * in place so the file itself tells the story. What it pins NOW:
 *   · the strip renderer is a TOMBSTONE: it renders nothing and actively
 *     removes any residue host (the catalogue-residue lesson — no dead
 *     artifact survives on a timer);
 *   · _WF_STEPS is gone from bindings — no dead map waiting to lie again;
 *   · the Prove area presents its ten former dropdown options as TABS over
 *     the EXISTING views (nothing merged into one page), with SORA the only
 *     gated tab (basis-tied via the plan lane, enforced at render time);
 *   · the rail's single Prove row is the door (pinned in the nav IA suite).
 * Run: node tests/regression_nav_spine.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const misc = S('misc_fn_modules.js');
const bindings = S('bindings_modules.js');
const idx = S('index.html');
const css = S('safety_lab.css');

// ---- the strip is dead, and cannot come back by accident --------------------
const R = misc.slice(misc.indexOf('function _renderWorkflowStepper'), misc.indexOf('function _maybeShowGettingStarted'));
check('the strip renderer is a tombstone — clears residue, creates nothing',
  R.includes('removeChild(host)') && !R.includes('createElement') && !R.includes('_WF_STEPS') &&
  !R.includes('innerHTML'));
check('_WF_STEPS is gone from bindings (no dead map on standby)',
  !bindings.includes('_WF_STEPS = ['));
check('index.html carries no stepper host of its own', !idx.includes('wf-stepper-host'));

// ---- the area tabs (Prove + AFHA — v1.1 generalization) --------------------
const PT = require('../site/prove_tabs.js');
const src = S('prove_tabs.js');
const PROVE = PT.AREAS.find(a => /Prove/.test(a.label)).tabs;
const AFHA = PT.AREAS.find(a => a.label === 'AFHA').tabs;
check('ten Prove tabs, one per former dropdown option, in the dropdown\'s order',
  PROVE.map(x => x.t).join(' ') === 'trace gt-integrity evpkg appa validation cm review pr mod sora-thread');
// 23 Aug 2026 (3) — Waqas: "same thing for both the FHAs". The AFHA dropdown
// emptied into these five tabs; SFHA was already tabbed (system workspace).
check('the five AFHA pages ride as area tabs, in the dropdown\'s order',
  AFHA.map(x => x.t).join(' ') === 'ac-func ac-fcim ac-fha ac-asm ac-req');
// Reachability, not literal presence: bow-tie self-mounts its view (moat).
const siteJs = fs.readdirSync(path.join(__dirname, '..', 'site')).filter(f => f.endsWith('.js'))
  .map(f => { try { return fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8'); } catch (_) { return ''; } }).join('\n');
check('every area tab routes to an EXISTING view — nothing merged into one page',
  PT.AREAS.every(a => a.tabs.every(x => idx.includes('id="view-' + x.t + '"') || siteJs.indexOf("'view-" + x.t + "'") >= 0)));
// 23 Aug 2026 (4) — the Fault-trees area (Waqas: "bowtie, event trees and
// other tree options under the fault trees … as tab options instead of left
// nav menu options"). Lane-gated tabs carry their old plan gating forward.
const TREES = PT.AREAS.find(a => a.label === 'Fault trees').tabs;
// 23 Aug 2026 (7) — Monitors/Exposure/Frequency joined ("these can be tabs
// under fault trees too"), labels clean of clause numbers.
check('the tree family rides as tabs: FTA · Bow-Tie · ETA · Markov · Monitors · Exposure · Frequency',
  TREES.map(x => x.t).join(' ') === 'fta bowtie eta markov monitors expcase freq');
check('nav labels carry no clause numbers',
  !TREES.some(x => /G\.\d/.test(x.k)) && TREES.find(x => x.t === 'expcase').k === 'Exposure cases' &&
  TREES.find(x => x.t === 'freq').k === 'Frequency');
// 26 Aug 2026 — gate census 4 → 6: the CCA consolidation (prove_tabs v1.5)
// added routing (a ZSA tab) and ipledger (a CMA tab), each keeping the lane
// gate its rail row used to carry. Same invariant: every gate names its lane,
// and nothing gated renders loose.
check('gated tabs: SORA basis-tied + three tree tabs + routing + ipledger, none loose',
  PROVE.find(x => x.t === 'sora-thread').gateLane === 'sora' &&
  TREES.filter(x => x.gateLane).map(x => x.gateLane).join(' ') === 'bowtie eta markov' &&
  (function () { var z = PT.AREAS.find(function (a) { return a.label === 'ZSA'; }), c = PT.AREAS.find(function (a) { return a.label === 'CMA'; });
    return z && c && z.tabs.find(function (x) { return x.t === 'routing'; }).gateLane === 'routing' &&
           c.tabs.find(function (x) { return x.t === 'ipledger'; }).gateLane === 'ipledger'; })() &&
  PT.AREAS.reduce((n, a) => n + a.tabs.filter(x => x.gateLane).length, 0) === 6 &&
  /PROGRAM_PLAN\.laneOn\(x\.gateLane\)/.test(src));
// ---- the tree picker (fta_tree_picker.js) ----------------------------------
// Waqas: "for the fault trees, we will do a drop down select similar to how
// we have it for the golden thread, and remove all the fault trees from the
// left nav."
{
  const pk = S('fta_tree_picker.js');
  const rail = S('nav_rail.js');
  check('the picker mounts a grouped <select> on the FTA page and switches the browser way',
    /optgroup/.test(pk) && /activeFTAPageId = id/.test(pk) &&
    /syncFtaConfigFromActivePage/.test(pk) && /calculateAllProbabilities/.test(pk) &&
    /renderFTASidebar/.test(pk) && pk.includes('SL_FTA_PICKER_OFF'));
  // 23 Aug 2026 (5) — Waqas, seeing the pane back on the page: "we dont need
  // this when we have the selection menu up top".
  check('the browser pane hides behind the picker, and + New moves up beside the select',
    /pane\.style\.display = 'none'/.test(pk) && /addNewFTAPage/.test(pk) &&
    pk.includes("'+ New Fault Tree'"));
  // 23 Aug 2026 (6) — "MF&MS should also be in here": its own picker group,
  // covering all three origins (MAC-compiled, interdependence-seeded, authored).
  check('the picker groups the MF&MS family separately from Aircraft', (() => {
    const PK = require('../site/fta_tree_picker.js');
    global.ftaPages = [
      { id: 'p1', name: 'PASA · FC-01', treeLevel: 'aircraft', root: {} },
      { id: 'mac-pg-r1', name: 'MF&MS · FC-01', treeLevel: 'aircraft', root: {} },
      { id: 'idp-pg-101', name: 'MF&MS · FC-02 — seeded', treeLevel: 'aircraft', root: {} },
      { id: 'p9', name: 'MF&MS (authored) · FC-07', treeLevel: 'aircraft', root: {} },
      { id: 's1', name: 'SSA tree', treeLevel: 'system', systemId: 'sys-a', root: {} }];
    global.systemsData = [{ id: 'sys-a', name: 'Alpha' }];
    const g = PK._groups();
    const labels = g.map(x => x.label);
    const mf = g.find(x => x.label === 'MF&MS');
    const ok = labels.indexOf('Aircraft') === 0 && labels.indexOf('MF&MS') === 1 &&
      g[0].pages.length === 1 && mf.pages.length === 3 &&
      g.some(x => /System · Alpha/.test(x.label));
    delete global.ftaPages; delete global.systemsData;
    return ok;
  })());
  check('wired in index.html, cache-busted', /fta_tree_picker\.js\?v=[\d.]+/.test(idx));
  check('no fault tree anywhere in the left nav — folder tree rows removed too',
    !rail.includes('data-systree') && !rail.includes('treesOf') &&
    !idx.includes('id="asb-fta-list"'));
  check('the tree-family rows are gone from the rail and Bow-Tie mounts no row',
    !idx.includes('id="snav-markov"') && !idx.includes('id="snav-eta"') &&
    !S('bowtie.js').includes("a.id = 'snav-bowtie'"));
  check('the system folders still carry their five assessment children',
    rail.includes("'ws:fha'") && rail.includes("'ws:pssa'") && rail.includes("'tab:ssa-page'") &&
    rail.includes("'tab:fmes'") && rail.includes("'ws:items'"));
}
check('the bar mounts INTO the active view (presentation over pages, no new page)',
  /view\.insertBefore\(bar, view\.firstChild\)/.test(src) && /switchTab\(btn\.getAttribute\('data-prove-tab'\)\)/.test(src));
check('moat pattern: wraps switchTab, guarded, kill switch present',
  src.includes('_proveTabsWrapped') && src.includes('SL_PROVE_TABS_OFF'));
check('wired in index.html, cache-busted', /prove_tabs\.js\?v=[\d.]+/.test(idx));
check('the tab bar is styled (underline tabs, focus ring, active accent)',
  /\.prove-tabbar \{/.test(css) && /\.prove-tab\.active \{/.test(css) && /\.prove-tab:focus-visible \{/.test(css));

// ---- render behavior (DOM harness) -----------------------------------------
{
  const mkView = id => {
    const el = { id, firstChild: null, _bar: null,
      querySelector: sel => (el._bar && sel.indexOf('prove-tabbar') >= 0) ? el._bar : null,
      insertBefore: n => { el._bar = n; } };
    return el;
  };
  const views = { 'view-trace': mkView('view-trace') };
  const mkBar = () => ({ attrs: {}, className: '', innerHTML: '',
    setAttribute: function (k, v) { this.attrs[k] = v; },
    querySelectorAll: () => [] });
  global.window = global;
  global.document = { getElementById: id => views[id] || null, createElement: () => mkBar() };
  global.PROGRAM_PLAN = { laneOn: id => id !== 'sora' };   // sora OFF (Part 25)
  PT.render('trace');
  const bar = views['view-trace']._bar;
  check('rendering on a Prove view mounts the bar with the active tab marked',
    !!bar && /data-prove-tab="trace"/.test(bar.innerHTML) && /prove-tab active/.test(bar.innerHTML));
  check('the gated SORA tab does NOT render while the lane is off',
    bar && bar.innerHTML.indexOf('sora-thread') === -1);
  global.PROGRAM_PLAN = { laneOn: () => true };            // a SORA-basis program
  PT.render('trace');
  check('…and renders when the lane is on',
    views['view-trace']._bar.innerHTML.indexOf('sora-thread') !== -1);
  delete global.window; delete global.document; delete global.PROGRAM_PLAN;
}

// ---- the bar holds the top slot against later mounts (v1.4) ---------------
// 25 Aug 2026 — Waqas: "when you click on assumptions the horizontal nav
// dissapears". It did not disappear: assumption_moat.js mounts its register
// 120ms after the switch with insertBefore(host, view.firstChild), which
// pushed the already-mounted tab bar below a full-width table and off the top
// of the viewport. fta_tree_picker does the same thing on view-fta, so the
// guard lives in prove_tabs (the bar defends itself) rather than in whichever
// module happened to displace it this week.
{
  const V = { children: [], firstChild: null,
    _s() { this.firstChild = this.children[0] || null; },
    querySelector: sel => sel.indexOf('prove-tabbar') >= 0
      ? (V.children.find(c => c.className === 'prove-tabbar') || null) : null,
    insertBefore(n, ref) { const i = ref ? this.children.indexOf(ref) : this.children.length;
      this.children.splice(i < 0 ? this.children.length : i, 0, n); this._s(); } };
  const mkn = () => ({ attrs: {}, className: '', id: '', innerHTML: '',
    setAttribute(k, v) { this.attrs[k] = v; }, querySelectorAll: () => [] });
  global.window = global;
  global.document = { getElementById: id => (id === 'view-ac-asm' ? V : null), createElement: mkn };
  global.PROGRAM_PLAN = { laneOn: () => true };
  PT.render('ac-asm');
  const idxBar = () => V.children.findIndex(c => c.className === 'prove-tabbar');
  check('the bar mounts at the top of the Assumptions view', idxBar() === 0);
  // the exact displacement assumption_moat.js:175 performs
  const host = mkn(); host.id = 'asm-register-host';
  V.insertBefore(host, V.firstChild);
  check('a later panel CAN displace it (the reported defect reproduces)', idxBar() === 1);
  check('…and the bar takes the top slot back', PT._keepFirst() === true && idxBar() === 0);
  check('…idempotently — a second pass is a no-op, so the observer terminates',
    PT._keepFirst() === false && idxBar() === 0);
  check('the guard is wired to a childList observer on the active view',
    /_obs\.observe\(view, \{ childList: true \}\)/.test(src) && /_keepFirst\(view, bar\);/.test(src));
  delete global.window; delete global.document; delete global.PROGRAM_PLAN;
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
