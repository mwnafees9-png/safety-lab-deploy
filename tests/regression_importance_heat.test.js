#!/usr/bin/env node
/*
 * Regression tests for UX-1 v2 — the THERMAL importance heatmap (importance_heat.js)
 * + the inline CCF tag (fta_view v66.12 / misc_fn v66.4).
 *
 * Locks:
 *   [1] display-lane discipline: the module never writes to nodes/stores; every
 *       per-event number comes from the engine; branch temperature is declared
 *       a display aggregation in the tooltip text itself.
 *   [2] thermal semantics: interpolated ramp cold→hot; root share = 1 (hottest);
 *       branch shares from Σ engine FV; the dominant branch runs hotter.
 *   [3] paint semantics (source-level): links get temperature strokes in the
 *       cutset-highlight visual language; glows sit BEHIND stock shapes (no
 *       shape fill overrides); toggle off removes glow/titles/strokes and
 *       restores via a plain updateD3; stale-token guard.
 *   [4] identity never color-alone: event tooltips carry FV + rank + Birnbaum;
 *       gate tooltips declare the aggregation; legend states measure + provenance.
 *   [5] wiring: script tag, toolbar injection, additive wraps; inline CCF tag
 *       replaces the floating SVG tag; autoSize reserves the CCF strip.
 *   [6] refusal honesty (HEAT-STALE, 26 Jul 2026): oversized pages REFUSE the
 *       importance sweep with a named reason; stale maps/FVmax are cleared
 *       BEFORE every recompute; engine failures surface as refusals, never
 *       swallowed; recovery on return to a small page. Found live: a 298k-node
 *       page silently wore the previous tree's FVmax.
 *
 * Run:  node tests/regression_importance_heat.test.js
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
const src = SITE('importance_heat.js');
const fv = SITE('fta_view_modules.js');
const misc = SITE('misc_fn_modules.js');

// ---- globals ----------------------------------------------------------------
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} }), createElementNS: () => ({ setAttribute: () => {}, style: {} }), addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null, readyState: 'complete', body: { appendChild: () => {} } };
globalThis.showToast = () => {};
globalThis.projectConfig = {};
globalThis.acFhaData = []; globalThis.systemsData = [];
globalThis._perfStats = {};
globalThis._cutsetWorker = null; globalThis._cutsetWorkerSeq = 0; globalThis._CUTSET_WORKER_MIN_NODES = 400;
globalThis.ftaConfig = { mode: 'bottom-up', apportion: 'equal', targetP: 1e-5, exposureTime: 1 };

// Tree: OR( AND(a,b), c ) — c dominates FV; the AND branch is cooler.
const L = (id, p) => ({ id, logicalId: 'L' + id, displayId: 'B' + id, name: 'e' + id, type: 'basic', probability: p, lambda: p, children: [] });
const andGate = { id: 2, type: 'gate', gateType: 'AND', children: [L(3, 1e-3), L(4, 2e-3)] };
const root = { id: 1, type: 'gate', gateType: 'OR', children: [andGate, L(5, 5e-4)] };
globalThis.ftaPages = [{ id: 'pg1', name: 't', mode: 'bottom-up', root }];
globalThis.activeFTAPageId = 'pg1';
globalThis.getActiveFTARoot = () => root;

(0, eval)(['fta_engine.js', 'engine_modules.js', 'fta_quant_modules.js', 'misc_fn_modules.js', 'importance_heat.js']
  .map(SITE).join('\n;\n'));
const G = globalThis;
const H = G.ImportanceHeat;

console.log('\n[1] display-lane discipline');
check('module exports the display API only', !!H && typeof H.toggle === 'function' && typeof H.heatColor === 'function' && typeof H._shareFor === 'function');
check('no writes to safety stores in source', !/(\.probability\s*=|\.lambda\s*=|ftaPages\s*=|acFhaData\s*=)/.test(src.replace(/\/\/[^\n]*/g, '')));
check('per-event numbers come from the engine', /computeImportanceAsync/.test(src) && /computeImportanceMeasures/.test(src) && !/Math\.random/.test(src));
check('branch temperature declared a display aggregation in the tooltip', /display aggregation/.test(src) && /computed BDD-exact by the engine/.test(src));

console.log('\n[2] thermal semantics');
(async () => {
  await H._recompute();
  check('interpolated thermal ramp, 7 stops cold→hot', Array.isArray(H.STOPS) && H.STOPS.length === 7 && H.STOPS[0].toUpperCase() === '#1F0C48' && H.STOPS[6].toUpperCase() === '#FCC227');
  check('share 0 → coldest stop', H.heatColor(0).toUpperCase() === H.STOPS[0].toUpperCase());
  check('share 1 → hottest stop', H.heatColor(1).toUpperCase() === H.STOPS[6].toUpperCase());
  const mid = H.heatColor(0.5);
  check('mid share → interpolated hex (neither pole)', /^#[0-9A-F]{6}$/i.test(mid) && mid.toUpperCase() !== H.STOPS[0].toUpperCase() && mid.toUpperCase() !== H.STOPS[6].toUpperCase(), mid);
  check('root (top event) runs hottest — share 1', H._shareFor(1) === 1);
  // Expected branch shares from the ENGINE's own measures.
  const imp = G.computeImportanceMeasures(root);
  const byLid = new Map(imp.measures.map(m => [String(m.node.logicalId), m.fv || 0]));
  const total = (byLid.get('L3') || 0) + (byLid.get('L4') || 0) + (byLid.get('L5') || 0);
  const andShare = ((byLid.get('L3') || 0) + (byLid.get('L4') || 0)) / total;
  check('AND-branch share = Σ subtree FV / total (engine numbers)', Math.abs(H._shareFor(2) - andShare) < 1e-12, H._shareFor(2) + ' vs ' + andShare);
  check('dominant single event runs hotter than the AND branch', H._shareFor(5) > H._shareFor(2));
  check('shares are 0..1 and cold default for unknown ids', H._shareFor('nope') === 0);

  console.log('\n[3] paint semantics (source-level: no jsdom d3 here)');
  check('links painted in the cutset-highlight visual language', /g\.selectAll\('\.link'\)/.test(src) && /cutset-highlight/.test(src) && /strokeWidth/.test(src));
  check('glow sits behind the stock shape, no shape fill overrides', /insertBefore\(glow, this\.firstChild\)/.test(src) && !/select\('path'\)\.attr\('fill'/.test(src) && !/sel\.attr\('fill'/.test(src));
  check('link transition race re-asserted (240ms)', /setTimeout\(_paintLinks, 240\)/.test(src));
  check('toggle off removes glow + titles + strokes, then plain updateD3', /heat-glow/.test(src) && /removeProperty\('stroke'\)/.test(src) && /_shareById = null;[\s\S]{0,300}updateD3\(\)/.test(src));
  check('stale-compute token guards tree switches', /token !== _computeToken/.test(src));

  console.log('\n[4] identity never color-alone');
  check('event tooltip carries FV + rank + Birnbaum + share', /Fussell–Vesely ' \+ _fmt\(rec\.fv\)/.test(src) && /rank #/.test(src) && /Birnbaum/.test(src) && /of top-event FV/.test(src));
  check('gate tooltip declares the aggregation + event count', /Branch heat/.test(src) && /subtree event\(s\)/.test(src));
  check('legend states measure, gradient, provenance', /Importance heat — Fussell–Vesely/.test(src) && /linear-gradient/.test(src) && /cold branch/.test(src) && /hot channel/.test(src));

  console.log('\n[5] wiring');
  const idx = SITE('index.html');
  check('index.html loads importance_heat.js v2', /importance_heat\.js\?v=2\./.test(idx));
  check('toolbar injection next to Auto-allocate DAL', /btn-allocate-dal/.test(src) && /btn-importance-heat/.test(src));
  check('additive wraps (updateD3 + calculateAllProbabilities), marked', /_heatWrapped/.test(src) && (src.match(/_heatWrapped = true/g) || []).length === 2);
  // Inline CCF tag (v66.12) — replaces the floating SVG tag.
  check('floating SVG ccf-tag retired from fta_view', !/attr\('class', 'ccf-tag'\)/.test(fv));
  check('inline CCF tag is an IN-FLOW flex child (no absolute offsets), clickable → popover', /ccf-inline-tag/.test(fv) && /_ftaCcfPopover\(d\.data, event\)/.test(fv) && /flex', '0 0 14px'/.test(fv) && !/bottom', '44px'/.test(fv));
  check('tag appended at the stack bottom, under λ/P', /container\.append\('xhtml:div'\)\.attr\('class', 'ccf-inline-tag'\)/.test(fv));
  check('update pass drives the inline tag (show/hide + text)', /select\('\.ccf-inline-tag'\)/.test(fv) && /\(CCF: \$\{d\.data\.ccfGroup\}\)/.test(fv));
  check('autoSize measures the squeezed textarea (no hardcoded reserve)', /const boxH = textarea\.clientHeight \|\| descHeight/.test(misc) && !/- reserve;/.test(misc));

  console.log('\n[6] refusal honesty (HEAT-STALE lock)');
  // Baseline: the small tree computed above — real numbers present.
  check('baseline small-tree sweep succeeded (no refusal, hot root)', H._refusalReason() === null && H._shareFor(1) === 1);
  // Oversized page: flat OR over budget+1 events. The sweep must REFUSE with a
  // named, quantified reason — and every trace of the previous page's numbers
  // must be gone (that exact staleness is the bug this section locks out).
  const bigLeaves = [];
  for (let i = 0; i < H.SWEEP_BUDGET_EVENTS + 1; i++) bigLeaves.push(L(1000 + i, 1e-6));
  const bigRoot = { id: 999, type: 'gate', gateType: 'OR', children: bigLeaves };
  G.getActiveFTARoot = () => bigRoot;
  await H._recompute();
  check('oversized page refuses with a named reason', typeof H._refusalReason() === 'string' && /REFUSED/.test(H._refusalReason()));
  check('refusal is quantified (event count + budget in the message)', /20,001/.test(H._refusalReason()) && /20,000/.test(H._refusalReason()));
  check('refusal names the doctrine (not approximated, not stale)', /not approximated/.test(H._refusalReason()) && /stale/.test(H._refusalReason()));
  check('previous page\'s shares cleared — root of small tree now cold', H._shareFor(1) === 0);
  check('oversized root itself carries no share (nothing computed)', H._shareFor(999) === 0);
  // Engine failure path: a rejecting compute must surface as a refusal too.
  const _origAsync = G.computeImportanceAsync;
  G.computeImportanceAsync = () => Promise.reject(new Error('BDD node budget exceeded — engine refusal test'));
  G.getActiveFTARoot = () => root;
  await H._recompute();
  check('engine rejection surfaces as refusal with the engine message', typeof H._refusalReason() === 'string' && /engine declined/.test(H._refusalReason()) && /BDD node budget exceeded/.test(H._refusalReason()));
  check('engine rejection leaves no numbers behind', H._shareFor(1) === 0 && H._shareFor(2) === 0);
  G.computeImportanceAsync = _origAsync;
  // Recovery: back on the small page, a fresh sweep restores real numbers.
  await H._recompute();
  check('recovery — small page computes again after refusals', H._refusalReason() === null && H._shareFor(1) === 1 && H._shareFor(5) > 0);
  // Source-level locks: stale state cleared before compute; legend renders the
  // refusal branch; the catch is no longer silent.
  const src21 = SITE('importance_heat.js');
  check('recompute clears maps + FVmax + refusal up front', /_byLid = null; _shareById = null; _maxFv = 0; _refusal = null; _forRootId = null;/.test(src21));
  check('legend has an explicit refusal branch (unavailable, reason, no gradient)', /Importance heat — <span[^>]*>unavailable<\/span>/.test(src21) && /if \(_refusal\)/.test(src21));
  check('compute failures are surfaced, never swallowed', /catch\(e => \{/.test(src21) && /engine declined the importance sweep/.test(src21));
  check('stale-page guard: paint recomputes when the active root changed', /_forRootId !== null && String\(cur\.id\) !== _forRootId/.test(src21));
  check('toggle-on unpaints the previous page before computing', /_unpaint\(\);[\s\S]{0,120}_recompute\(\)\.then\(\(\) => \{ _paint\(\); _legend\(true\); \}\)/.test(src21));
  check('index.html loads importance_heat v2.1', /importance_heat\.js\?v=2\.1/.test(SITE('index.html')));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
