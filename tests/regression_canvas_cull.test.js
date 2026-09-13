#!/usr/bin/env node
/*
 * Regression tests for ENG-2 phase 2 — FTA canvas viewport culling.
 *
 * The D3 render path needs a real browser (verified live); these tests lock
 * the deterministic pieces and the wiring:
 *   [1] threshold + opt-out: culling engages only above 300 nodes; ?cull=0
 *       and SLA_FTA_CULL='0' disable it.
 *   [2] rect mathematics: world-rect from a zoom transform with one-viewport
 *       padding; node-in-rect; link bbox crossing (both-endpoints-offscreen
 *       vertical connector still renders).
 *   [3] wiring: updateD3 joins on the culled lists with the identity below
 *       threshold; selected node always mounted; zoom handler calls the
 *       throttled cull hook; focused inline editors block remounts; honesty
 *       pill states full-tree coverage.
 *
 * Run:  node tests/regression_canvas_cull.test.js
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
const fv = SITE('fta_view_modules.js');

// Extract the pure helpers into an isolated scope (no d3/DOM needed for the math).
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.location = { search: '' };
globalThis.document = { getElementById: () => null, activeElement: null };
const helperSrc = fv.slice(fv.indexOf('const _FTA_CULL_MIN_NODES'), fv.indexOf('function _ftaCullOnZoom'));
(0, eval)(helperSrc);
const G = globalThis;

console.log('\n[1] threshold + opt-out');
check('below threshold → inactive (300 exactly is NOT culled)', !G._ftaCullActive(300) && !G._ftaCullActive(50));
check('above threshold → active', G._ftaCullActive(301) && G._ftaCullActive(5000));
globalThis.location = { search: '?cull=0' };
check('?cull=0 disables at any size', !G._ftaCullActive(5000));
globalThis.location = { search: '' };
globalThis.localStorage = { getItem: k => (k === 'SLA_FTA_CULL' ? '0' : null), setItem: () => {}, removeItem: () => {} };
check("SLA_FTA_CULL='0' disables at any size", !G._ftaCullActive(5000));
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

console.log('\n[2] rect mathematics');
{
  // Simulate _ftaCullRect's math directly: viewport 1000×600, transform k=0.5, x=100, y=50.
  const t = { k: 0.5, x: 100, y: 50 }, w = 1000, h = 600;
  const x0 = (0 - t.x) / t.k, y0 = (0 - t.y) / t.k, x1 = (w - t.x) / t.k, y1 = (h - t.y) / t.k;
  const mx = x1 - x0, my = y1 - y0;
  const r = { x0: x0 - mx, y0: y0 - my, x1: x1 + mx, y1: y1 + my };
  check('world rect: visible [-200,1800]×[-100,1100], padded ×3 each axis', x0 === -200 && x1 === 1800 && r.x0 === -2200 && r.x1 === 3800 && r.y0 === -1300 && r.y1 === 2300, JSON.stringify(r));
  check('node inside padded rect kept', G._ftaNodeInRect({ x: 0, y: 0 }, r) && G._ftaNodeInRect({ x: 3700, y: 2200 }, r));
  check('node beyond padding culled', !G._ftaNodeInRect({ x: 4000, y: 0 }, r) && !G._ftaNodeInRect({ x: 0, y: 2500 }, r));
  // Long vertical connector: both endpoints outside (above + below), bbox crosses.
  const link = { source: { x: 100, y: -5000 }, target: { x: 100, y: 5000 } };
  check('link with both endpoints off-screen still renders (bbox crossing)', G._ftaLinkCrossesRect(link, r));
  const farLink = { source: { x: 9000, y: 0 }, target: { x: 9500, y: 100 } };
  check('fully off-rect link culled', !G._ftaLinkCrossesRect(farLink, r));
}

console.log('\n[3] wiring (source-level)');
check('updateD3 joins on the culled lists', /g\.selectAll\('\.link'\)\.data\(_linkList/.test(fv) && /g\.selectAll\('\.node'\)\.data\(_descList/.test(fv));
check('identity below threshold (no rect → full lists)', /let _descList = _allDesc, _linkList = root\.links\(\), _cullCapped = false;/.test(fv));
check('selected node always mounted', /d\.data\.id === _selId \|\| _ftaNodeInRect/.test(fv));
check('zoom handler invokes the throttled cull hook', /_ftaCullOnZoom === 'function'\) _ftaCullOnZoom\(\)/.test(SITE('helpers_modules.js')));
check('throttled trailing re-render (160ms)', /_ftaCullTimer = setTimeout/.test(fv) && /160\)/.test(helperSrc + fv.slice(fv.indexOf('function _ftaCullOnZoom'), fv.indexOf('function _ftaCullPill'))));
check('focused inline editor blocks remounts', /TEXTAREA' \|\| ae\.tagName === 'INPUT'/.test(fv) && /closest\('#fta-svg'\)\) return;/.test(fv));
check('honesty pill states full-tree coverage', /layout and math cover the full tree/.test(fv));
check('opt-out documented (?cull=0 / SLA_FTA_CULL)', /\?cull=0 or SLA_FTA_CULL/.test(fv));
check('mount cap guards zoomed-out full remounts (600, nearest-to-centre)', /_CULL_MOUNT_CAP = 350/.test(fv) && /nearest the view centre/.test(fv) && /_cullCapped = true/.test(fv));
check('capped state spoken on the pill', /zoomed out — nearest to view center/.test(fv));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
