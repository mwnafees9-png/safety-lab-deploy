#!/usr/bin/env node
/*
 * Regression — the physical hazard as a FIRST-CLASS thread object
 * (Waqas's architecture ruling, 8 Aug 2026; SL-ARC-0001 §12 / §17.1 / §23):
 * "a CCA-found physical hazard is NOT a functional hazard — it should be a
 * thread object in its own right, carrying its own requirements, verification
 * and evidence." The twelfth node kind.
 *
 * Executed against the REAL phys_hazards.js + gt_integrity.js + rename_guard.js
 * loaded together in one vm sandbox — the joins under test are BETWEEN the
 * modules, so stubs would prove nothing.
 *
 * Run: node tests/regression_phys_hazards.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const ph = S('phys_hazards.js'), gti = S('gt_integrity.js'), rg = S('rename_guard.js'),
      gtt = S('gt_thread.js'), fv = S('fta_view_modules.js'), bindings = S('bindings_modules.js'), html = S('index.html');

function sandbox() {
  const sb = { console, Object, String, Array, JSON, Set, Map, Date, Math, Number, parseFloat, parseInt, isNaN,
    setTimeout: () => 0, clearTimeout: () => 0, setInterval: () => 0, clearInterval: () => 0, confirm: () => true };
  sb.window = sb; sb.globalThis = sb;
  sb.document = { readyState: 'complete', getElementById: () => null, querySelector: () => null,
    createElement: () => ({ style: {}, setAttribute: () => {}, addEventListener: () => {}, appendChild: () => {}, insertBefore: () => {}, classList: { toggle: () => {}, add: () => {}, remove: () => {} } }),
    addEventListener: () => {}, body: { appendChild: () => {} } };
  sb.projectConfig = {};
  sb.acFunctionsData = []; sb.acFhaData = []; sb.acFcimData = []; sb.acReqData = []; sb.acAssumptionsData = [];
  sb.systemsData = []; sb.zsaData = []; sb.praData = []; sb.cmaData = []; sb.itemsData = []; sb.ftaPages = [];
  sb.resourcesData = []; sb.routingData = [];
  sb._invs = []; sb.invRegister = d => sb._invs.push(d);
  sb._toasts = []; sb.showToast = m => sb._toasts.push(m);
  sb.scheduleAutosave = () => {}; sb.saveState = () => {};
  vm.createContext(sb);
  vm.runInContext(ph, sb);
  vm.runInContext(gti, sb);
  vm.runInContext(rg, sb);
  return sb;
}
const seedZone = sb => { sb.zsaData.push({ internalId: 21, zoneId: 'Z-100', desc: 'keel beam', interference: 'two hydraulic runs share the keel beam with the EWIS trunk', mitigation: 'segregation brackets', housedFunctions: ['SF-01'] }); };

// ---- [1] promotion — by reference, deduped ---------------------------------
console.log('\n[promote] a CCA finding becomes a thread object, by reference');
{
  const sb = sandbox();
  seedZone(sb);
  sb.praData.push({ internalId: 31, praId: 'PRA-RAT', threat: 'RAT burst', desc: 'blade release envelope', mitigation: '' });
  sb.cmaData.push({ internalId: 41, cmaId: 'CMA-KEEL', description: 'maintenance commonality on the keel run' });
  const a = sb.PHYS_HAZARDS.promote('zsa', 'Z-100', 'test');
  check('ZSA promotion creates the object with source {kind, ref} — never a copy of the row',
    !!a && a.phId === 'PH-1' && a.source.kind === 'zsa' && a.source.ref === 'Z-100' && /keel beam/.test(a.title + a.desc));
  check('dedupe: promoting the same finding again returns the existing object',
    sb.PHYS_HAZARDS.promote('zsa', 'Z-100') === a && sb.PHYS_HAZARDS.store().length === 1);
  const b = sb.PHYS_HAZARDS.promote('pra', 'PRA-RAT');
  const c = sb.PHYS_HAZARDS.promote('cma', 'CMA-KEEL');
  check('PRA and CMA promote too, with distinct minted ids', b.phId === 'PH-2' && c.phId === 'PH-3');
  check('an unknown source refuses with a toast, creates nothing',
    sb.PHYS_HAZARDS.promote('zsa', 'Z-999') === null && sb.PHYS_HAZARDS.store().length === 3);
}

// ---- [2] the requirement join — computed, two ways --------------------------
console.log('\n[reqs] linkedReqs: direct phId trace + the source artifact\'s own requirements');
{
  const sb = sandbox();
  seedZone(sb);
  const phz = sb.PHYS_HAZARDS.promote('zsa', 'Z-100');
  check('freshly promoted with no requirements → uncontrolled (empty join)', sb.PHYS_HAZARDS.linkedReqs(phz).length === 0);
  // the CCA generators' own requirement for this zone (traceId = zoneId)
  sb.acReqData.push({ internalId: 1, id: 'REQ-1', traceId: 'Z-100', verifStatus: 'Passed',
    reqSource: { generator: 'zsa-separation', sourceId: 'ac:zsa:Z-100' } });
  // an engineer's requirement tracing to the hazard DIRECTLY
  sb.acReqData.push({ internalId: 2, id: 'REQ-2', traceIds: ['PH-1'], verifStatus: 'Planned' });
  // noise — traces elsewhere
  sb.acReqData.push({ internalId: 3, id: 'REQ-3', traceId: 'FC-07' });
  const join = sb.PHYS_HAZARDS.linkedReqs(phz);
  check('both joins resolve — the generator requirement via the source, the direct phId trace',
    join.length === 2 && join.some(x => x.via !== 'direct' && x.req.id === 'REQ-1') && join.some(x => x.via === 'direct' && x.req.id === 'REQ-2'));
  const roll = sb.PHYS_HAZARDS.verifRollup(phz);
  check('verification rollup counts linked requirements and their passed subset', roll.total === 2 && roll.passed === 1);
}

// ---- [3] INV-48 — controlled, resolvable, evidenced -------------------------
console.log('\n[inv48] every physical hazard is controlled — executed');
{
  const sb = sandbox();
  seedZone(sb);
  const phz = sb.PHYS_HAZARDS.promote('zsa', 'Z-100');
  const inv = sb._invs.find(x => x.id === 'INV-48');
  check('INV-48 registered ADVISORY', !!inv && inv.sev === 'advisory');
  let r = inv.run();
  check('uncontrolled hazard is a finding', r.checked === 1 && r.fails.some(f => /physically uncontrolled/.test(f)));
  sb.acReqData.push({ internalId: 1, id: 'REQ-1', traceIds: ['PH-1'] });
  r = inv.run();
  check('a requirement tracing to it clears the finding', r.fails.length === 0);
  phz.status = 'closed';
  r = inv.run();
  check('closed without passed verification is a finding — closure is a claim, evidence is the argument',
    r.fails.some(f => /closed without a passed verification/.test(f)));
  phz.verification = { method: 'Inspection', status: 'Passed', evidence: 'RPT-1', by: 'QA' };
  r = inv.run();
  check('a passed verification record clears it', r.fails.length === 0);
  sb.zsaData.length = 0;   // the source dies
  r = inv.run();
  check('a deleted source is a finding — the hazard floats', r.fails.some(f => /no longer exists/.test(f)));
}

// ---- [4] gt_integrity — the sweep knows the twelfth node kind ---------------
console.log('\n[sweep] dangling source, orphan, and phId as a legitimate trace target');
{
  const sb = sandbox();
  seedZone(sb);
  const phz = sb.PHYS_HAZARDS.promote('zsa', 'Z-100');
  sb.acReqData.push({ internalId: 1, id: 'REQ-1', traceIds: ['PH-1'] });
  let r = sb.gtIntegrity();
  check('a requirement tracing to a live phId is NOT dangling (trace targets include physical hazards)',
    !r.dangling.some(x => x.ref === 'PH-1'));
  check('zone/PRA ids are legitimate trace targets too (the CCA generators write traceId = zoneId)', (function () {
    sb.acReqData.push({ internalId: 2, id: 'REQ-2', traceId: 'Z-100' });
    const rr = sb.gtIntegrity();
    return !rr.dangling.some(x => x.ref === 'Z-100');
  })());
  check('controlled hazard is no orphan', !r.orphans.some(x => x.where === 'Physical hazard'));
  sb.acReqData.length = 0;
  r = sb.gtIntegrity();
  check('uncontrolled hazard reads ORPHAN — visible, never invisible',
    r.orphans.some(x => x.where === 'Physical hazard' && x.ref === 'PH-1' && /physically uncontrolled/.test(x.detail)));
  sb.zsaData.length = 0;
  r = sb.gtIntegrity();
  check('deleted source reads DANGLING with the floats detail',
    r.dangling.some(x => /Physical hazard PH-1/.test(x.where) && /the hazard floats/.test(x.detail)));
  check('a requirement tracing to a DELETED phId still dangles', (function () {
    sb.acReqData.push({ internalId: 3, id: 'REQ-9', traceId: 'PH-99' });
    const rr = sb.gtIntegrity();
    return rr.dangling.some(x => x.ref === 'PH-99');
  })());
  check('stale sweep reads obsolete-marked hazards', (function () {
    phz.obsolete = true; phz.obsoleteReason = 'STALE — test';
    return sb.gtStaleSweep().some(x => x.where === 'Physical hazard' && x.ref === 'PH-1');
  })());
}

// ---- [5] rename_guard — identity carried, deletions cascade -----------------
console.log('\n[identity] zone renames reach the hazard; zone deletes mark it; phId is an owner kind');
{
  const sb = sandbox();
  seedZone(sb);
  const phz = sb.PHYS_HAZARDS.promote('zsa', 'Z-100');
  sb.acReqData.push({ internalId: 1, id: 'REQ-1', traceId: 'Z-100' });
  sb.rgBaseline();
  sb.zsaData[0].zoneId = 'Z-200';                    // the rename
  const renames = sb.rgScan();
  const zr = renames.find(x => x.kind === 'zoneId');
  check('zone rename detected with the hazard source AND the requirement trace among its refs',
    !!zr && zr.refs.some(s => /Physical hazard PH-1/.test(s.where)) && zr.refs.some(s => s.field === 'traceId'));
  sb.rgApply(zr);
  check('apply carries the hazard source ref and the requirement trace to the new id',
    phz.source.ref === 'Z-200' && sb.acReqData[0].traceId === 'Z-200');
  // ---- deletion → the ROW is marked (markObj), not the nested slot ----------
  sb.rgBaseline();
  sb.zsaData.length = 0;
  sb.rgScan();
  check('zone deleted → the physical hazard ROW carries the stale mark',
    phz.obsolete === true && /Zone ID Z-200 deleted/.test(phz.obsoleteReason));
  // ---- phId as owner kind ---------------------------------------------------
  const sb2 = sandbox();
  seedZone(sb2);
  const p2 = sb2.PHYS_HAZARDS.promote('zsa', 'Z-100');
  sb2.acReqData.push({ internalId: 1, id: 'REQ-1', traceIds: ['PH-1'] });
  sb2.rgBaseline();
  p2.phId = 'PH-KEEL';                               // the rename
  const rr = sb2.rgScan();
  const pr = rr.find(x => x.kind === 'phId');
  check('phId rename detected, requirement trace among the refs', !!pr && pr.from === 'PH-1' && pr.to === 'PH-KEEL' && pr.refs.length === 1);
  sb2.rgApply(pr);
  check('apply moves the requirement trace to the new hazard id', sb2.acReqData[0].traceIds[0] === 'PH-KEEL');
  check('deleting the hazard marks the tracing requirement stale', (function () {
    sb2.rgBaseline();
    sb2.projectConfig.physHazards.length = 0;
    sb2.rgScan();
    const q = sb2.acReqData[0];
    return Array.isArray(q.staleRefs) && q.staleRefs.some(s => s.ref === 'PH-KEEL');
  })());
}

// ---- [6] the thread graph — the twelfth node kind renders -------------------
console.log('\n[graph] _graphPass: source CCA → hazard → requirements → verification');
{
  const sb = sandbox();
  seedZone(sb);
  sb.PHYS_HAZARDS.promote('zsa', 'Z-100');
  sb.acReqData.push({ internalId: 1, id: 'REQ-1', traceIds: ['PH-1'], verifStatus: 'Planned' });
  const nodes = [], links = [];
  const addNode = (kind, id, label, sub, ref, flag, why) => { const k = kind + ':' + id; if (!nodes.some(n => n.key === k)) nodes.push({ key: k, kind, id, label, flag: flag || null, why: why || '' }); return k; };
  const addLink = (s, t) => links.push({ s, t });
  sb.PHYS_HAZARDS._graphPass(addNode, addLink, null);
  const phN = nodes.find(n => n.kind === 'ph');
  check('a ph node exists, labeled by phId + title', !!phN && /PH-1/.test(phN.label));
  check('linked from the CCA artifact that found it', links.some(l => /^cca:zsa:/.test(l.s) && l.t === phN.key));
  check('forward into its requirement and the requirement\'s verification',
    links.some(l => l.s === phN.key && /^req:/.test(l.t)) && links.some(l => /^req:/.test(l.s) && /^vv:/.test(l.t)));
  check('scoped view keeps it when the source zone houses the scoped function, drops it otherwise', (function () {
    const n2 = [], l2 = [];
    sb.PHYS_HAZARDS._graphPass((k, i, lb, su, rf, fl, wh) => { const kk = k + ':' + i; n2.push({ kind: k }); return kk; }, () => {}, 'SF-01');
    const kept = n2.some(n => n.kind === 'ph');
    const n3 = [];
    sb.PHYS_HAZARDS._graphPass((k, i) => { n3.push({ kind: k }); return k + ':' + i; }, () => {}, 'SF-99');
    return kept && !n3.some(n => n.kind === 'ph');
  })());
  check('a dangling source renders the hazard flagged stale', (function () {
    sb.zsaData.length = 0;
    const n4 = [];
    sb.PHYS_HAZARDS._graphPass((k, i, lb, su, rf, fl, wh) => { n4.push({ kind: k, flag: fl }); return k + ':' + i; }, () => {}, null);
    const p = n4.find(n => n.kind === 'ph');
    return p && p.flag === 'stale';
  })());
}

// ---- [7] wiring — floors + the render seams (§7.3: no literals) -------------
console.log('\n[wiring]');
{
  const m = html.match(/phys_hazards\.js\?v=([0-9.]+)/);
  check('index.html loads phys_hazards.js (≥1.0)', m && PIN.pinAtLeast(m[1], '1.0'));
  check('_gtvBuildGraph carries the guarded PHYS_HAZARDS._graphPass seam', /PHYS_HAZARDS\._graphPass/.test(fv) && /_graphPass === 'function'/.test(fv));
  check('the Sankey layer list carries ph between cca and ip', /'cca','ph','ip'/.test(bindings.replace(/\s+/g, '')));
  check('gt_thread renders ph in the cca column with its own accent',
    /k === 'ph' \? 'cca'/.test(gtt) && /ph: '#A8552E'/.test(gtt));
  const gm = html.match(/gt_integrity\.js\?v=([0-9.]+)/), rm = html.match(/rename_guard\.js\?v=([0-9.]+)/);
  check('gt_integrity ≥ 1.4 and rename_guard ≥ 1.6 (floors)',
    gm && parseFloat(gm[1]) >= 1.4 && rm && parseFloat(rm[1]) >= 1.6);
  check('the module owns no second reference enumerator — rename_guard keys phId/zone/PRA slots',
    /phId: \{/.test(rg) && /_phSourceRefs/.test(rg));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
