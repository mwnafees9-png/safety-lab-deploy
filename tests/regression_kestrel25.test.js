#!/usr/bin/env node
/*
 * Regression — Kestrel RJ Part 25 transport showcase (demo_showcase_kestrel25.js).
 *   [1] build() produces a Part 25 project (regulation, 1E-9 target) with the full
 *       closed loop: FHA, requirements, systems, FTA, items, RAM, MAC, human factors.
 *   [2] internal consistency: every BE→item, FTA→FHA, MAC/interface→system ref resolves.
 *   [3] the marquee loss-of-pitch tree is an AND of two independent lanes at DAL A.
 *   [4] wiring: index.html registers the src + loader and the menu entry; the loader
 *       exposes window.loadKestrelRj and routes through the shared _applyProjectData.
 * Run: node tests/regression_kestrel25.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

// ---- load the showcase in a stubbed window ------------------------------------
global.window = global.window || {};
require('../site/demo_showcase_kestrel25.js');
const SC = global.window.SL_SHOWCASE_KESTREL25;
check('installs window.SL_SHOWCASE_KESTREL25 with build + postLoad',
  SC && typeof SC.build === 'function' && typeof SC.postLoad === 'function');

const d = SC.build();

// ---- [1] Part 25 project shape ------------------------------------------------
check('project is the Kestrel RJ Part 25 transport showcase',
  d.projectName === 'Kestrel RJ · Part 25 Transport Showcase' && d.projectConfig.regulation === 'Part 25');
check('catastrophic target is 1E-9/fh (AC 25.1309-1A)', d.ftaConfig.targetP === 1e-9);
check('the full closed loop is populated',
  d.acFhaData.length >= 8 && d.acReqData.length >= 8 && d.systemsData.length === 6 &&
  d.ftaPages.length >= 4 && d.itemsData.length >= 10);
check('reliability (RAM) is present', d.projectConfig.ram && d.projectConfig.ram.tasks.length >= 5 && !!d.projectConfig.ramSettings);
check('MAC / MBSA models are present', Array.isArray(d.projectConfig.macModels) && d.projectConfig.macModels.length >= 2);
check('human-factors assumptions are on the thread', d.acAssumptionsData.filter(a => a.type === 'Human Factors').length >= 2);
check('a catastrophic loss-of-pitch condition exists', d.acFhaData.some(f => f.fcId === 'FC-01' && f.severity === 'Catastrophic'));

// ---- requirements capability (enriched to show off) ---------------------------
check('a rich aircraft-level requirement set is authored', d.acReqData.length >= 16);
check('a DERIVED requirement (auto-derived from the tree budget) is present',
  d.acReqData.some(r => r.type === 'Derived' && /2E-5/.test(r.text)));
check('requirements span the full type range',
  new Set(d.acReqData.map(r => r.type)).size >= 7);
check('requirements carry verification method + status',
  d.acReqData.every(r => r.verifMethod && r.verifStatus) &&
  d.acReqData.some(r => r.verifStatus === 'Passed') && d.acReqData.some(r => r.verifStatus === 'Pending'));
check('independent requirement-validation attestations are recorded',
  d.projectConfig.reqVal && Object.values(d.projectConfig.reqVal).filter(v => v.independent).length >= 4);
check('a qualification/installation requirement traces the CCA particular risks',
  d.acReqData.some(r => r.type === 'Qualification') && d.acReqData.some(r => r.type === 'Installation'));

// ---- postLoad exercises the full analysis suite live --------------------------
const pl = S('demo_showcase_kestrel25.js');
check('postLoad drives Auto-Req from every analysis (FHA/FTA/DAL/gate/PRA/ZSA)',
  /AutoReq\.generate\(/.test(pl) && /ftaEvent:\s*true/.test(pl) && /gateIndependence:\s*true/.test(pl));
check('postLoad runs auto DAL allocation and MCS-aware auto-rebalance to 1E-9',
  /allocateDAL\(/.test(pl) && /mcsAwareRebalance\([^)]*1e-9\)/.test(pl));
check('postLoad runs MAC compile, quantification and the reliability derivations',
  /macCompileAll\(/.test(pl) && /calculateAllProbabilities\(/.test(pl) && /deriveMaintTasks\(/.test(pl) && /deriveAlloc\(/.test(pl));

// ---- [2] internal consistency -------------------------------------------------
const items = new Set(d.itemsData.map(i => i.itemId));
const sys = new Set(d.systemsData.map(s => s.id));
const allFha = new Set([...d.acFhaData.map(f => f.internalId), ...d.systemsData.flatMap(s => (s.fha || []).map(f => f.internalId))]);
let beErr = 0, fhaErr = 0, sysErr = 0, dupErr = 0; const seen = new Set();
const walk = n => { if (!n) return; if (seen.has(n.id)) dupErr++; seen.add(n.id); if (n.realizedByItemId && !items.has(n.realizedByItemId)) beErr++; (n.children || []).forEach(walk); };
d.ftaPages.forEach(p => { walk(p.root); (p.linkedFhaIds || []).forEach(f => { if (!allFha.has(f)) fhaErr++; }); });
(d.projectConfig.ram.tasks || []).forEach(t => { if (t.itemId && !items.has(t.itemId)) beErr++; });
(d.projectConfig.macModels || []).forEach(m => {
  (m.clauses || []).forEach(c => (c.of || []).forEach(s => { if (!sys.has(s)) sysErr++; }));
  (m.flows || []).forEach(f => [f.from, f.to].forEach(s => { if (!sys.has(s)) sysErr++; }));
});
(d.projectConfig.interfaces || []).forEach(i => [i.fromSystemId, i.toSystemId].forEach(s => { if (!sys.has(s)) sysErr++; }));
check('every fault-tree basic event resolves to a real LRU/item', beErr === 0, beErr + ' bad refs');
check('every FTA→FHA link resolves (aircraft + system)', fhaErr === 0, fhaErr + ' bad links');
check('every MAC / interface system reference resolves', sysErr === 0, sysErr + ' bad refs');
check('no duplicate node ids across the fault trees', dupErr === 0, dupErr + ' dupes');

// ---- [3] the marquee tree -----------------------------------------------------
const pitch = d.ftaPages.find(p => p.id === 'pg-rj-pitch');
check('loss-of-pitch is an AND of two independent lanes at DAL A',
  pitch && pitch.root.gateType === 'AND' && pitch.root.allocatedDAL === 'A' &&
  pitch.root.dalIndependence === 'option-1' && (pitch.root.children || []).length === 2);
check('the deterministic core carries no AI/date/random',
  !/fetch\(|anthropic\.|Date\.now|Math\.random/i.test(S('demo_showcase_kestrel25.js')));

// ---- [4] wiring ---------------------------------------------------------------
const idx = S('index.html');
// The menu entry moved OUT of index.html into demo_picker.js (one chooser routing
// to every showcase loader) — so pinning a literal `loadKestrelRj()` call site in
// index.html asserted an architecture that was deliberately replaced. What must
// stay true: index.html registers the data src + the loader + the picker, and the
// picker routes to this loader. Follow the invariant, not the old call site.
check('index.html registers the Kestrel src + loader + the demo picker',
  /SL_SHOWCASE_KESTREL25_SRC\s*=\s*'demo_showcase_kestrel25\.js\?v=/.test(idx) &&
  /kestrel_showcase\.js\?v=/.test(idx) && /demo_picker\.js\?v=/.test(idx));
// RETIRED from the picker 4 Aug 2026 (Waqas's "retire the weakest"): Part 25 is
// HL-1's position at far greater depth, and the name collided with the Part 23
// K350 Kestrel in the same list. The demo is NOT deleted — this suite keeps
// running so the builder cannot rot while it is out of the line-up, and the
// assertion flips from "the picker offers it" to "the picker no longer offers it,
// and everything needed to restore it is still here".
check('the demo picker no longer OFFERS Kestrel RJ, and says why where the entry was',
  !/loader:\s*'loadKestrelRj'/.test(S('demo_picker.js')) &&
  /RETIRED 4 Aug 2026/.test(S('demo_picker.js')) &&
  /window\.openDemoPicker\s*=/.test(S('demo_picker.js')));
const ld = S('kestrel_showcase.js');
check('the loader exposes loadKestrelRj and routes through _applyProjectData',
  /window\.loadKestrelRj\s*=/.test(ld) && /_applyProjectData/.test(ld) && /SL_SHOWCASE_KESTREL25\.postLoad/.test(ld));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
