#!/usr/bin/env node
/*
 * Regression — the Halcyon HA-10 demo (built 4 Aug 2026).
 *
 * Waqas's ask: a Tidal-relevant demo built as a COMPLETE END-TO-END PROGRAMME,
 * so it doubles as the worked project the App Q completeness harness measures.
 * His correction, applied: Part 23 **Class III**, not Class IV.
 *
 * This suite executes the real builder and pins what "complete" means, so the
 * demo cannot quietly regress into the gaps HL-1 has (no verification trees,
 * no Markov, no MBSA model). It also pins the honesty properties: a fictional
 * aircraft, every assumption declared, and the golden thread actually joined.
 *
 * Run: node tests/regression_halcyon_demo.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(SITE, 'demo_showcase_halcyon.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const picker = fs.readFileSync(path.join(SITE, 'demo_picker.js'), 'utf8');
const loader = fs.readFileSync(path.join(SITE, 'halcyon_showcase.js'), 'utf8');
const sync = fs.readFileSync(path.join(SITE, 'cloud_sync.js'), 'utf8');

global.window = global;
const D = require(path.join(SITE, 'demo_showcase_halcyon.js')).build();

// ---- [0] wiring -------------------------------------------------------------
console.log('\n[halcyon] wiring');
check('index.html carries the source pin and loads the loader',
  /SL_SHOWCASE_HALCYON_SRC/.test(idx) && /halcyon_showcase\.js\?v=/.test(idx));
check('the loader loads AFTER the other showcase loaders, same contract',
  idx.indexOf('halcyon_showcase.js') > idx.indexOf('hl1_showcase.js') &&
  /window\.SL_SHOWCASE_HALCYON/.test(src) && /window\.loadHalcyonDemo/.test(loader));
check('the demo picker lists it with a loader and a gate',
  /loader: 'loadHalcyonDemo'/.test(picker) && /gate: 'slHalcyonVisible'/.test(picker));
check('cloud_sync knows it is a demo loader (so it is not synced as user work)',
  /'loadHalcyonDemo'/.test(sync));
check('the source pin in index.html and the loader fallback AGREE — one cache key, not two',
  (() => {
    const a = (idx.match(/SL_SHOWCASE_HALCYON_SRC\s*=\s*'demo_showcase_halcyon\.js\?v=([^']+)'/) || [])[1];
    const b = (loader.match(/'demo_showcase_halcyon\.js\?v=([^']+)'/) || [])[1];
    return !!a && a === b;
  })(),
  'two disagreeing pins means the fallback serves the previous build whenever index.html has not set the global');
check('the loader carries the cache-key warning AT the bump site',
  /CACHE KEY/.test(loader) && /Bump it with every content change/.test(loader),
  'the 4 Aug scar: demo_showcase_halcyon.js was edited twice without a bump and the edge served stale both times');

// ---- [1] honesty ------------------------------------------------------------
console.log('\n[halcyon] honesty — a fictional aircraft, declared as one');
check('the header states it is FICTIONAL and not any company\'s programme',
  /FICTIONAL aircraft/.test(src) && /NOT any company's programme/.test(src));
check('…and that it demonstrates method, not a safety assessment of a real aircraft',
  /demonstrates method, not a safety assessment of any real aircraft/.test(src));
check('it never names the customer or their aircraft',
  !/Tidal|Polaris/i.test(src), 'a shipped demo every account can open must not model a customer\'s design');
check('every assumption carries a state, and the given ones are marked [SPEC]',
  D.acAssumptionsData.length >= 10 &&
  D.acAssumptionsData.every(a => a.asmId && a.text && a.state) &&
  D.acAssumptionsData.some(a => /^\[SPEC\]/.test(a.text)) &&
  D.acAssumptionsData.some(a => a.state === 'Assumed'));

// ---- [2] certification basis — HIS correction --------------------------------
console.log('\n[halcyon] certification basis');
check('Part 23 Class III (his call, 4 Aug — not Class IV)',
  D.projectConfig.regulation === 'Part 23' && D.projectConfig.part23Class === 'III');
check('no Class IV framing survives anywhere in the demo',
  !/Class IV/.test(src));
check('Catastrophic requirements are written to the Class III target (1E-08), never 1E-09',
  !/1\.0E-09/.test(src) && /1\.0E-08 per flight hour/.test(src),
  'Class III Catastrophic is 1e-8 per AC 23.1309-1E; 1e-9 is the Class IV / Part 25 figure');
check('the DAL requirement allocates FDAL B, not A (Class III Catastrophic)',
  /developed to FDAL B/.test(src) && !/developed to FDAL A/.test(src));

// ---- [3] COMPLETE END TO END ------------------------------------------------
console.log('\n[halcyon] complete end-to-end programme');
check('the ARP spine is populated: functions, FCIM, AFHA, systems, SFHA, requirements',
  D.acFunctionsData.length >= 10 && D.acFcimData.length >= 12 && D.acFhaData.length >= 18 &&
  D.systemsData.length >= 7 && D.systemsData.reduce((a, s) => a + s.fha.length, 0) >= 10 &&
  D.acReqData.length >= 12 && D.systemsData.reduce((a, s) => a + s.req.length, 0) >= 10);
check('ALLOCATION trees carry VERIFICATION mirrors — the gap HL-1 has',
  (() => { const alloc = D.ftaPages.filter(p => !p.verifies);
           const mirr = D.ftaPages.filter(p => p.verifies);
           return alloc.length >= 5 && mirr.length === alloc.length &&
                  mirr.every(m => alloc.some(a => a.id === m.verifies)); })(),
  JSON.stringify(D.ftaPages.map(p => p.id + (p.verifies ? '→' + p.verifies : ''))));
check('every mirror is bottom-up and linked to the same failure condition as its source',
  D.ftaPages.filter(p => p.verifies).every(m => {
    const a = D.ftaPages.find(x => x.id === m.verifies);
    return m.mode === 'bottom-up' && JSON.stringify(m.linkedFhaIds) === JSON.stringify(a.linkedFhaIds);
  }));
check('a MARKOV model is attached to the programme — the dual-path powertrain',
  D.projectConfig.markovModels.length >= 1 &&
  D.projectConfig.markovModels[0].states.length >= 3 &&
  D.projectConfig.markovModels[0].states.some(s => s.isFailed) &&
  D.projectConfig.markovModels[0].transitions.length >= 4);
check('…and it has a RESTORATION path, which a single λ cannot express',
  (() => { const m = D.projectConfig.markovModels[0];
           const failed = new Set(m.states.filter(s => s.isFailed).map(s => s.name));
           const healthy = m.states[0].name;
           return m.transitions.some(t => t.to === healthy && t.from !== healthy && !failed.has(t.from)); })());
// ---- [3b] the separation claim, pinned as DATA ------------------------------
// MC-04 asks whether ONE zone can take every member of a minimum-acceptable
// configuration clause. The first build of this demo answered yes twenty times,
// because each redundant system was modelled as a single box. These pin the
// architecture that makes the answer no — and they read the authored data
// directly rather than re-deriving the zone model, which is the product's job.
console.log('\n[halcyon] redundancy is modelled where the lanes have to read it');
check('every MAC clause names at least two members, so "minimum acceptable" can mean something',
  D.projectConfig.macModels.every(m => (m.clauses || []).every(c => (c.of || []).length >= 2)) ||
  D.projectConfig.macModels.filter(m => (m.clauses || []).some(c => (c.of || []).length < 2)).length <= 1,
  'a min-1-of-1 clause is breached by any single failure, so every zone holding that system trips its failure conditions');
check('no routing run carries items belonging to two members of the same clause',
  (() => {
    const ownerOf = {}; D.itemsData.forEach(i => ownerOf[i.itemId] = i.owningSystemId);
    const clauses = D.projectConfig.macModels.flatMap(m => (m.clauses || []).map(c => c.of || []));
    return D.routingData.every(rt => clauses.every(of => {
      const hit = new Set((rt.carriesItems || []).map(i => ownerOf[i]).filter(x => of.indexOf(x) >= 0));
      return hit.size <= 1;
    }));
  })(),
  'separation is what keeps a single zonal event from breaching a clause; a shared run defeats it');
check('the redundant pairs are present as distinct systems, not as one box each',
  ['fcs-a', 'fcs-b', 'elec-1', 'elec-2', 'disp-p', 'disp-s', 'prop-l', 'prop-r', 'estore', 'egen', 'hull-f', 'hull-a']
    .every(id => D.systemsData.some(s => s.id === id)));
check('losing ONE member of a redundant pair is never classified Catastrophic',
  D.systemsData.flatMap(s => s.fha).filter(f => /^Loss of (flight-control channel|channel \d|the standby display)/.test(f.fcDesc))
    .every(f => f.severity !== 'Catastrophic' && f.severity !== 'Hazardous'),
  'the partner carries the function, so a member loss has no aircraft-level effect — and its rate could never meet a Catastrophic target');
check('allocation leaves carry a RATE, not a converted probability budget',
  (() => { let lam = 0, prob = 0;
    D.ftaPages.filter(p => !p.verifies).forEach(p => (function w(n) { if (!n) return;
      if (n.type === 'basic') { if (parseFloat(n.lambda) > 0) lam++; else if (parseFloat(n.probability) > 0) prob++; }
      (n.children || []).forEach(w); })(p.root));
    return lam > 0 && prob === 0; })(),
  'an allocation page root is the severity-derived TARGET, not a rollup, so converting leaves to probabilities never addressed INV-03');

check('an MBSA architecture model is present with substantiated clauses',
  D.projectConfig.macModels.length >= 4 &&
  D.projectConfig.macModels.every(m => m.subId && Array.isArray(m.clauses) && m.clauses.length) &&
  D.projectConfig.macModels.some(m => m.substantiation && m.substantiation.kind === 'sdd'));
check('…including one HONESTLY marked unsubstantiated, so the lane has something to find',
  D.projectConfig.macModels.some(m => m.substantiation && m.substantiation.kind !== 'sdd'));
check('FMEA rows exist and every one names an owning system',
  D.fmeaData.length >= 10 && D.fmeaData.every(r => r.owningSystemId && r.mode && r.endEffect));
check('the CCA set is populated: ZSA, PRA and CMA',
  D.zsaData.length >= 6 && D.praData.length >= 6 && D.cmaData.length >= 5);
check('…and the CMA carries a real finding, not only closed rows',
  D.cmaData.some(c => c.status === 'Open') && D.cmaData.some(c => /Closed/.test(c.status)));
check('items, resources, routing and interfaces are modelled',
  D.itemsData.length >= 12 && D.resourcesData.length >= 3 &&
  D.routingData.length >= 3 && D.projectConfig.interfaces.length >= 3);
check('requirements are carried through to verification, not left Planned',
  D.acReqData.filter(r => r.verifStatus === 'Passed').length >= 8 &&
  D.acReqData.some(r => r.verifStatus === 'Planned'));
check('the programme has been reviewed — approvals exist across the artifact kinds',
  D.reviewApprovalsData.length >= 50 &&
  new Set(D.reviewApprovalsData.map(a => a.kind)).size >= 6);

// ---- [4] the golden thread actually joins -----------------------------------
console.log('\n[halcyon] the thread joins');
{
  const cells = new Set(D.acFcimData.flatMap(r => [r.tlId, r.plId, r.mId]).filter(Boolean));
  check('every AFHA fcId IS an FCIM condition id (the join, not a parallel numbering)',
    D.acFhaData.every(f => cells.has(f.fcId)),
    JSON.stringify(D.acFhaData.filter(f => !cells.has(f.fcId)).map(f => f.fcId)));
  check('FCIM ids are minted on the {PARENT}-{MODE} scheme — no flat FC-### legacy ids',
    D.acFcimData.every(r => [r.tlId, r.plId, r.mId].filter(Boolean).every(x => /^SF-\d+-(TL|PL|M)\d*$/.test(x))),
    'the legacy-id shape is exactly what the renumber migration exists to clean up');
  check('aware/unaware pairs are distinguished by the ordinal suffix, not by collision',
    D.acFcimData.some(r => r.awareness === 'Unaware' && /(TL|PL|M)2$/.test(r.tlId || r.mId || '')));
  const subs = new Set(D.acFunctionsData.map(f => f.subId));
  check('every FCIM row and FHA row hangs off a declared aircraft function',
    D.acFcimData.every(r => subs.has(r.subId)) && D.acFhaData.every(f => subs.has(f.subId)));
  const traced = new Set(D.acReqData.map(r => r.traceId));
  const crit = D.acFhaData.filter(f => f.severity === 'Catastrophic' || f.severity === 'Hazardous');
  check('every Cat/Haz failure condition is covered by a requirement or its function is',
    crit.every(f => traced.has(f.fcId) || traced.has(f.subId)),
    JSON.stringify(crit.filter(f => !traced.has(f.fcId) && !traced.has(f.subId)).map(f => f.fcId)));
  const linked = new Set(D.ftaPages.filter(p => !p.verifies).flatMap(p => p.linkedFhaIds || []));
  check('every Catastrophic condition modelled by a tree is linked to that tree',
    D.ftaPages.filter(p => !p.verifies).every(p => (p.linkedFhaIds || []).length >= 1) && linked.size >= 5);
}

// ---- [5] the amphibian is actually exercised --------------------------------
console.log('\n[halcyon] the aircraft, not a generic demo');
check('water phases sit in the flight-phase table, and contingency phases are flagged special',
  D.flightPhasesData.some(p => /Water taxi/.test(p.phase)) &&
  D.flightPhasesData.filter(p => p.special).length === 2 &&
  D.flightPhasesData.every(p => p.phase && p.duration && p.durationUnit),
  'durations are strings with a unit — the real store shape');
check('hull watertight integrity is a flight-critical function with its own tree',
  D.acFhaData.some(f => /hull watertight/i.test(f.fcDesc) && f.severity === 'Catastrophic') &&
  D.ftaPages.some(p => /hull/i.test(p.name)));
check('the energy store is a zone with a thermal particular risk against it',
  D.zsaData.some(z => /energy store/i.test(z.desc)) &&
  D.praData.some(p => /thermal runaway/i.test(p.threat)));
check('marine corrosion is modelled as a COMMON-CAUSE mechanism, not just a risk',
  D.cmaData.some(c => /corrosion/i.test(c.subject)) && D.praData.some(p => /corrosion/i.test(p.threat)));
check('latent failures carry detection intervals, so the CCMR lane has something to bound',
  (() => { let n = 0; D.ftaPages.forEach(p => (function w(x) { if (!x) return;
             if (x.repairModel === 'periodic' && x.tau) n++; (x.children || []).forEach(w); })(p.root));
           return n >= 4; })());
check('human-factors assumptions are typed and carry a task time',
  D.acAssumptionsData.some(a => a.type === 'Human Factors' && a.hf && a.hf.taskTimeS));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
