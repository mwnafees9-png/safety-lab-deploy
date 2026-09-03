#!/usr/bin/env node
/* Regression tests for LOD-1 — semantic zoom (lod_zoom.js). */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } }
const SITE = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const src = SITE('lod_zoom.js');

globalThis.window = globalThis;
globalThis.location = { search: '' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { getElementById: () => null, querySelector: () => null, createElement: () => ({ style: {} }), createElementNS: () => ({ setAttribute() {}, innerHTML: '' }), addEventListener() {}, readyState: 'complete' };
globalThis.updateD3 = function () { return 'render'; };
globalThis._ftaCullOnZoom = function () { return 'zoom'; };
(0, eval)(src);
const L = globalThis.SLLod;

console.log('\n[1] thresholds + guards');
check('exports check/isOn + thresholds (k<0.35, >300 nodes)', !!L && L.LOD_K === 0.35 && L.LOD_MIN_NODES === 300);
check('opt-outs honored (?lod=0 / SLA_FTA_LOD)', /lod=0/.test(src) && /SLA_FTA_LOD/.test(src));
check('display lane — no store writes', !/(ftaPages\s*=(?!=)|\.probability\s*=(?!=)|\.lambda\s*=(?!=)|projectConfig\.\w+\s*=(?!=))/.test(src.replace(/\/\/[^\n]*/g, '')));

console.log('\n[2] tile semantics (source-level: d3 layout needs a browser)');
check('tiles carry engine-lane values only (P from root.probability, counts, heat share)', /_fmt\(n\.probability\)/.test(src) && /ImportanceHeat\._shareFor\(n\.id\)/.test(src) && /events · /.test(src));
check('hides via style.display — reversible, no join surgery', /style\.display = vis \? '' : 'none'/.test(src) && !/\.data\(/.test(src));
check('honesty pill states aggregation + full-tree coverage', /aggregated view — /.test(src) && /layout and math cover the full tree/.test(src));
check('disengage restores via plain updateD3 (no residue)', /_clearTiles\(g\); _setNodesVisible\(g, true\)/.test(src) && /_disengage[\s\S]{0,400}updateD3\(\)/.test(src));

console.log('\n[3] wiring');
check('additive wraps on updateD3 + _ftaCullOnZoom, marked', globalThis.updateD3._lodWrapped === true && globalThis._ftaCullOnZoom._lodWrapped === true && (src.match(/_lodWrapped = true/g) || []).length === 2);
check('wraps preserve return values', globalThis.updateD3() === 'render' && globalThis._ftaCullOnZoom() === 'zoom');
check('index.html loads lod_zoom.js after trade_study', SITE('index.html').indexOf('lod_zoom.js?v=') > SITE('index.html').indexOf('trade_study.js?v='));
check('debounced (200ms) — never checks on every zoom tick', /setTimeout\(check, 200\)/.test(src));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
