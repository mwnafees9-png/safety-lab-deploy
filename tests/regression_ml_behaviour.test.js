#!/usr/bin/env node
/*
 * Regression — learned-vs-learning + safety-continuum on the ML-assurance
 * register (2 Aug 2026, closes two FAA AI roadmap gaps logged the same day).
 *
 * THE PRINCIPLES THIS PINS:
 *  · The FAA roadmap DISTINGUISHES the assurance methodology for learned
 *    (static) and learning (adapts in service) implementations. A register
 *    that cannot say which one it holds cannot choose a methodology — so an
 *    undeclared behaviour is an OPEN finding, never a silent 'learned'
 *    default (the A7/A8 silent-default disease, kept out on purpose).
 *  · The continuum position (EASA Concept Paper L1A–L3B — a PUBLISHED
 *    taxonomy, cited, not a vocabulary invented here) scales what the
 *    register demands: higher tiers make an undeclared level or ODD OPEN.
 *  · For a LEARNING constituent, in-service monitoring is the assurance
 *    case, not housekeeping: no observation is OPEN (a static constituent
 *    keeps the old advisory), and one condition yields ONE finding, not two.
 *  · Everything is DECLARED, never derived — the module's standing doctrine,
 *    unchanged.
 *
 * The module returns early without a window, so it is executed in a vm
 * sandbox that has one — the same reason require() alone would test nothing.
 *
 * Run: node tests/regression_ml_behaviour.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(SITE, 'ml_assurance.js'), 'utf8');

// ---- boot the module in a window-bearing sandbox ----------------------------
const sb = { console, Date, JSON, Math, Array, Object, String, Number, Boolean, RegExp, Set, setTimeout };
sb.window = sb; sb.globalThis = sb;
sb.mlData = { constituents: [], odd: [], datasets: [], monitors: [], capture: [], captureEnabled: false, counter: 1 };
sb.projectConfig = {};
vm.createContext(sb);
vm.runInContext(src, sb);
const API = sb.ML_ASSURANCE;

console.log('\n[mlb] vocabulary and doctrine');
check('module booted and exports the two vocabularies',
  !!API && Array.isArray(API.BEHAVIOURS) && Array.isArray(API.CONTINUUM));
check('behaviours: not declared / learned / learning — nothing else',
  API.BEHAVIOURS.length === 3 && API.BEHAVIOURS[0] === 'not declared' &&
  /learned \(static\)/.test(API.BEHAVIOURS[1]) && /learning \(adapts in service\)/.test(API.BEHAVIOURS[2]));
check('continuum tiers are the EASA Concept Paper labels, cited as such',
  API.CONTINUUM.length === 7 && /L1A/.test(API.CONTINUUM[1]) && /L3B — non-supervised autonomy/.test(API.CONTINUUM[6]) &&
  /EASA AI Concept Paper/.test(src));
check('nothing derives behaviour or continuum from anything',
  !/behaviour\s*=\s*c\.level|behaviour\s*=\s*sev|continuum\s*=\s*deriv/i.test(src),
  'declared, never derived — the module doctrine extends to the new fields');
check('an unrecognised value lands on NOT DECLARED, not on the convenient answer',
  /BEHAVIOURS\.indexOf\(behaviour\) > 0 \? behaviour : BEHAVIOURS\[0\]/.test(src) &&
  /CONTINUUM\.indexOf\(continuum\) > 0 \? continuum : CONTINUUM\[0\]/.test(src),
  'a silent learned default would be A7-2 all over again');

// ---- executed: the findings scale -------------------------------------------
console.log('\n[mlb] findings, executed');
const f = () => API.findings();
const texts = arr => arr.map(x => x.sev + ':' + x.text).join(' | ');

// v0.1 row (no new fields at all) — the migration IS the render default.
sb.mlData.constituents.push({ id: 'MLC-001', name: 'Legacy row', implementsFn: 'SF-1', level: 'AL3', oddId: 'ODD-001' });
sb.mlData.odd.push({ id: 'ODD-001', dimension: 'Visibility', range: '800-10000', units: 'm', rationale: 'r' });
let out = f();
check('a v0.1 row (no fields) raises the undeclared-behaviour OPEN finding',
  out.some(x => x.sev === 'open' && x.id === 'MLC-001' && /Learned vs learning not declared/.test(x.text)));
check('…and the undeclared-continuum ADVISORY',
  out.some(x => x.sev === 'advisory' && x.id === 'MLC-001' && /Continuum position not declared/.test(x.text)));

// learned + declared tier: base posture, old advisory drift finding survives.
sb.mlData.constituents.length = 0;
API.addConstituent('Static detector', 'SF-2', 'AL2', 'ODD-001', '', API.BEHAVIOURS[1], API.CONTINUUM[1]);
out = f();
check('a declared LEARNED constituent at L1A raises neither behaviour nor continuum findings',
  !out.some(x => /not declared/.test(x.text) && x.id === sb.mlData.constituents[0].id));
check('…and keeps the ADVISORY no-monitoring finding (drift watch is housekeeping for static)',
  out.some(x => x.sev === 'advisory' && /No in-service observation/.test(x.text)));

// learning without monitors: OPEN, and exactly one finding for the condition.
sb.mlData.constituents.length = 0;
API.addConstituent('Adaptive tuner', 'SF-3', 'AL2', 'ODD-001', '', API.BEHAVIOURS[2], API.CONTINUUM[3]);
out = f();
const mlcId = sb.mlData.constituents[0].id;
const monitorFindings = out.filter(x => x.id === mlcId && /observation/.test(x.text));
check('a LEARNING constituent with no observation raises OPEN — the adaptation is the assurance case',
  monitorFindings.length === 1 && monitorFindings[0].sev === 'open');
check('one condition, ONE finding — the advisory does not double it', monitorFindings.length === 1, texts(out));
API.addMonitor(mlcId, 'ODD-001', 'flight test', 'Behaviour within envelope on 3 sorties', 'watch', '', '');
check('recording an observation clears it', !f().some(x => x.id === mlcId && /observation/.test(x.text)));

// autonomy-tier learning without a strategy note: OPEN.
sb.mlData.constituents.length = 0; sb.mlData.monitors.length = 0;
API.addConstituent('Autonomous lander', 'SF-4', 'AL1', 'ODD-001', '', API.BEHAVIOURS[2], API.CONTINUUM[5]);
API.addMonitor(sb.mlData.constituents[0].id, 'ODD-001', 'simulation', 'obs', 'watch', '', '');
out = f();
check('LEARNING at an autonomy tier with no strategy note is OPEN — the roadmap\'s furthest-from-ready combination',
  out.some(x => x.sev === 'open' && /learning-assurance strategy/.test(x.text)));
sb.mlData.constituents[0].note = 'Strategy: frozen in revenue service; adaptation only in supervised trials, re-declared per cycle.';
check('a recorded strategy note clears it', !f().some(x => /learning-assurance strategy/.test(x.text)));

// continuum scaling: high tier turns missing level/ODD into OPEN.
sb.mlData.constituents.length = 0; sb.mlData.monitors.length = 0;
API.addConstituent('Collab assistant', 'SF-5', 'not set', '', '', API.BEHAVIOURS[1], API.CONTINUUM[4]);
out = f();
check('L2B with no assurance level raises the scaled OPEN finding',
  out.some(x => x.sev === 'open' && /L2B/.test(x.text) && /no assurance level/.test(x.text)));
check('L2B with no ODD raises the scaled OPEN finding',
  out.some(x => x.sev === 'open' && /L2B/.test(x.text) && /no ODD/.test(x.text)));
sb.mlData.constituents.length = 0;
API.addConstituent('Low-tier aid', 'SF-6', 'not set', '', '', API.BEHAVIOURS[1], API.CONTINUUM[1]);
out = f();
check('the same gaps at L1A raise only the BASE findings, not the scaled ones',
  !out.some(x => /L1A/.test(x.text)) && out.some(x => /No assurance level declared/.test(x.text)),
  'scaling means the tier changes the demand — not that every tier shouts equally');

// ---- surfaces ---------------------------------------------------------------
console.log('\n[mlb] surfaces');
check('the constituent table gained Behaviour and Continuum columns',
  /'ID', 'Constituent', 'Implements', 'Level', 'Behavior', 'Continuum', 'ODD'/.test(src));
check('the form offers both selects with the principle in their tooltips',
  /mlas-c-beh/.test(src) && /mlas-c-cont/.test(src) && /DIFFERENT assurance methodologies/.test(src));
check('_addC passes both through', /_v\('mlas-c-beh'\), _v\('mlas-c-cont'\)/.test(src));
check('index.html pin bumped past the previous build',
  (function () { const m = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8').match(/ml_assurance\.js\?v=(\d+(?:\.\d+)?)/); return !!m && PIN.pinAtLeast(m[1], '0.3'); })());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
