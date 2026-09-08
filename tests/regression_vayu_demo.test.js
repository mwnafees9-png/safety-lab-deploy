#!/usr/bin/env node
/*
 * Regression — the Vayu V-1 eVTOL showcase must stay fictional, wired and deep.
 *
 * Authored to Aeolus (HL-1) depth PLUS a full Human Factors lane and a full RAM
 * lane, which is what Waqas asked for when the demo was built. This suite pins:
 *   - that the aircraft names NO real eVTOL programme (it is fictional);
 *   - that the module still builds through the real demo_kit mirror helper;
 *   - the depth invariants (never SHRINK below what it already demonstrates);
 *   - the deliberate programme-state findings that a future session must not
 *     read as defects and quietly "fix"; and
 *   - the HF and RAM lanes specifically, because those were the point of the ask.
 *
 * Run: node tests/regression_vayu_demo.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');

const demo   = S('demo_showcase_vayu.js');
const loader = S('vayu_showcase.js');
const picker = S('demo_picker.js');
const index  = S('index.html');

// ---- fictional aircraft -----------------------------------------------------
// The Vayu is invented. Nothing may name a real eVTOL programme or operator, in
// the source or in the rendered data — the demo sits publicly in front of every
// account, and a real name would turn a method demo into a claim about someone
// else's aircraft.
const FORBIDDEN = [
  'joby', 'archer', 'lilium', 'volocopter', 'ehang', 'supernal', 'hyundai',
  'wisk', 'beta technologies', 'vertical aerospace', 'eve air', 'midnight',
  'maker', 's-a1', 'vx4',
];
FORBIDDEN.forEach(w => {
  const hit = [['demo_showcase_vayu.js', demo], ['vayu_showcase.js', loader]]
    .filter(([, src]) => src.toLowerCase().indexOf(w) >= 0).map(([f]) => f);
  check('no reference to "' + w + '"', hit.length === 0, 'found in ' + hit.join(', '));
});

// ---- provenance vocabulary --------------------------------------------------
check('assumptions use the [SPEC] tag', demo.indexOf('[SPEC]') >= 0);
check('assumptions use the [PRELIM] tag', demo.indexOf('[PRELIM]') >= 0);
check('no assumption carries a source-attributed tag',
  demo.indexOf('[PUBLIC]') < 0 && demo.indexOf('[REPORTED]') < 0);

// ---- the module still builds ------------------------------------------------
// Refuses to run without demo_kit.js (no mirrors ⇒ an empty INV-03 denominator).
const ctx = { window: {}, console: { log() {}, warn() {}, error() {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(SITE, 'demo_kit.js'), 'utf8'), ctx, { filename: 'demo_kit.js' });
ctx.slDemoMirror = ctx.window.slDemoMirror;
vm.runInContext(demo, ctx, { filename: 'demo_showcase_vayu.js' });
const M = ctx.window.SL_SHOWCASE_VAYU;
check('the module registers window.SL_SHOWCASE_VAYU', !!M && typeof M.build === 'function');
check('the module exposes postLoad', !!M && typeof M.postLoad === 'function');

let d = null;
try { d = M.build(); } catch (e) { check('build() runs', false, e.message); }
if (d) {
  const n = o => Array.isArray(o) ? o.length : 0;
  check('build() runs', true);
  check('project name is the fictional aircraft',
    d.projectName === 'Vayu V-1 · eVTOL Air Taxi', 'got ' + d.projectName);
  check('certification basis is the powered-lift special-condition lane',
    d.projectConfig.regulation === 'part-23', d.projectConfig.regulation);
  // Depth — never SHRINK below what has been demonstrated.
  check('at least twenty aircraft sub-functions', n(d.acFunctionsData) >= 20, String(n(d.acFunctionsData)));
  check('thirty aircraft failure conditions', n(d.acFhaData) === 30, String(n(d.acFhaData)));
  check('at least fourteen systems, and never fewer', n(d.systemsData) >= 14, String(n(d.systemsData)));
  check('at least eighteen fault trees, and never fewer', n(d.ftaPages) >= 18, String(n(d.ftaPages)));
  check('every allocation tree has exactly one verification mirror',
    (() => { const alloc = d.ftaPages.filter(p => !p.verifies), mirr = d.ftaPages.filter(p => p.verifies);
             return alloc.length >= 14 && mirr.length === alloc.length &&
                    mirr.every(m => alloc.some(a => a.id === m.verifies)); })(),
    d.ftaPages.filter(p => !p.verifies).length + ' allocation / ' + d.ftaPages.filter(p => p.verifies).length + ' mirrors');
  check('node ids are unique across every tree (no duplicate mirror ids)',
    (() => { const ids = []; const w = nn => { if (!nn) return; ids.push(nn.id); (nn.children || []).forEach(w); };
             d.ftaPages.forEach(p => w(p.root)); return new Set(ids).size === ids.length; })());
  check('the CCA set never shrinks below what it has demonstrated',
    n(d.praData) >= 10 && n(d.zsaData) >= 14 && n(d.cmaData) >= 8,
    `${n(d.praData)}/${n(d.zsaData)}/${n(d.cmaData)}`);
  check('the CMA keeps at least one open finding',
    d.cmaData.some(r => r.status === 'Open'),
    'an all-green demo teaches nothing — CMA-003 is the pack-propagation independence finding');
  // Nothing identifying reaches the rendered project data either.
  const blob = JSON.stringify(d).toLowerCase();
  check('built project data names no real programme',
    FORBIDDEN.every(w => blob.indexOf(w) < 0));
}

// ---- wiring -----------------------------------------------------------------
check('index.html declares SL_SHOWCASE_VAYU_SRC', /SL_SHOWCASE_VAYU_SRC\s*=/.test(index));
check('index.html loads vayu_showcase.js', /src="vayu_showcase\.js/.test(index));
check('vayu_showcase.js loads before demo_picker.js',
  index.indexOf('vayu_showcase.js') >= 0 && index.indexOf('vayu_showcase.js') < index.indexOf('demo_picker.js'),
  'the picker filters on slVayuVisible, which the loader defines');
check('the loader exposes loadVayuDemo', /window\.loadVayuDemo\s*=/.test(loader));
check('the loader exposes the picker gate', /window\.slVayuVisible\s*=/.test(loader));
check('the demo is public', /VAYU_PUBLIC\s*=\s*true/.test(loader));

const entry = (picker.match(/\{[^{}]*id:\s*'vayu'[\s\S]*?\}/) || [''])[0];
check('the picker has a vayu entry', entry.length > 40);
check('the picker entry names the fictional aircraft', /Vayu V-1/.test(entry));
check('the picker entry points at the real loader', /loader:\s*'loadVayuDemo'/.test(entry));
check('the picker entry gates on the real predicate', /gate:\s*'slVayuVisible'/.test(entry));

if (d) {
  // ---- PROGRAMME STATE — deliberate, and NOT to be "fixed" ------------------
  console.log('\n[vayu] programme state — a live programme between design reviews');
  check('open review comments exist on artifacts that were already signed',
    (d.reviewCommentsData || []).filter(c => c.status === 'open').length >= 5);
  check('…and they INVALIDATE real approvals, across more than one artifact kind',
    (() => {
      const open = (d.reviewCommentsData || []).filter(c => c.status === 'open');
      const hit = (d.reviewApprovalsData || []).filter(a => open.some(c =>
        c.target.kind === a.kind && String(c.target.id) === String(a.id) &&
        (c.target.systemId || null) === (a.systemId || null)));
      return hit.length >= 4 && new Set(hit.map(a => a.kind)).size >= 3;
    })());
  check('…and at least one comment is RESOLVED, so the trail shows the way out',
    (d.reviewCommentsData || []).some(c => c.status === 'resolved' && c.resolvedBy));
  check('problem reports span several dispositions, and two are NOT properly signed',
    (() => {
      const prs = (d.projectConfig && d.projectConfig.problemReports) || [];
      if (prs.length < 4) return false;
      const badClose = prs.some(p => p.state === 'closed' && !((p.history || []).filter(h => h.state === 'closed').pop() || {}).by);
      const badDefer = prs.some(p => p.state === 'deferred' && !p.deferral);
      const goodClose = prs.some(p => p.state === 'closed' && ((p.history || []).filter(h => h.state === 'closed').pop() || {}).by);
      const goodDefer = prs.some(p => p.state === 'deferred' && p.deferral);
      return badClose && badDefer && goodClose && goodDefer;
    })(),
    'INV-09 fires on the unsigned pair; the signed pair makes it legible as a finding');
  check('a requirement is SUPERSEDED and still carried, with its audit trail intact',
    (d.acReqData || []).some(r => r.reqSource && r.reqSource.obsolete && r.reqSource.obsolete.supersededBy && r.reqSource.obsolete.reason));
  check('a failure condition is left stale by the FCIM redo',
    (d.acFhaData || []).some(f => f.obsolete));

  // ---- MBSA and the spatial model ------------------------------------------
  console.log('\n[vayu] the architecture the zonal and MBSA lanes read');
  check('the redundant members are modelled as the UNITS they are',
    ['sys-rot1','sys-rot2','sys-rot3','sys-rot4','sys-pk1','sys-pk2','sys-pk3']
      .every(id => (d.systemsData || []).some(x => x.id === id)),
    'a minimum-acceptable configuration is a statement about surviving MEMBERS');
  check('the MAC model states a real minimum over real members where redundancy exists',
    (() => { const m = (d.projectConfig.macModels || []);
      const lift = m.find(r => r.id === 'mac-lift'), energy = m.find(r => r.id === 'mac-energy');
      return lift && lift.clauses[0].min === 3 && lift.clauses[0].of.length === 4 &&
             energy && energy.clauses[0].min === 2 && energy.clauses[0].of.length === 3; })());
  check('every clause member is a live system id',
    (() => { const ids = new Set((d.systemsData || []).map(x => x.id));
      return (d.projectConfig.macModels || []).every(r => (r.clauses || []).every(c => (c.of || []).every(x => ids.has(x)))); })());
  check('some clauses are HONESTLY single-member, and some are unsubstantiated',
    (d.projectConfig.macModels || []).some(r => r.clauses.every(c => c.of.length === 1)) &&
    (d.projectConfig.macModels || []).some(r => r.substantiation && r.substantiation.kind !== 'sdd'));
  check('zonal residual risk is PARTLY dispositioned, with a signature, a basis and a fingerprint',
    (() => { const z = d.projectConfig.zonalAccepted || {}; const k = Object.keys(z);
      return k.length >= 2 && k.every(x => z[x].by && z[x].basis && z[x].fingerprint); })());

  // ---- CCA is FULL, not a sample -------------------------------------------
  console.log('\n[vayu] common cause analyses cover the aircraft');
  check('the ZSA covers every boom, both battery bays, the wings and the routing spine',
    (() => { const ids = (d.zsaData || []).map(z => z.zoneId);
      return ['Z-BOOM-FL','Z-BOOM-AR','Z-PACK-F','Z-PACK-A','Z-WING-L','Z-EWIS','Z-THM','Z-FCC'].every(z => ids.indexOf(z) >= 0); })());
  check('every zone row carries interference AND a mitigation, not just a name',
    (d.zsaData || []).every(z => z.zoneId && z.desc && z.equip && z.interference && z.mitigation));
  check('the PRA covers the eVTOL-specific risks',
    (() => { const t = (d.praData || []).map(p => String(p.threat || '').toLowerCase()).join(' | ');
      return ['thermal runaway', 'blade or hub liberation', 'high-voltage arc', 'icing', 'downwash', 'electromagnetic']
        .every(k => t.indexOf(k) >= 0); })());
  check('every particular risk names zones that exist',
    (() => { const z = new Set((d.zsaData || []).map(x => x.zoneId));
      return (d.praData || []).every(p => (p.affectedZones || []).every(x => z.has(x))); })());
  check('the CMA covers the rotor, pack, actuation and single-member independence claims',
    (() => { const subj = (d.cmaData || []).map(c => String(c.subject || '').toLowerCase()).join(' | ');
      return /rotor drive independence/.test(subj) && /pack independence/.test(subj) &&
             /actuation lane independence/.test(subj) && /single-member/.test(subj); })());
  check('the CMA board is NOT all green',
    (() => { const st = (d.cmaData || []).map(c => c.status);
      return st.filter(x => x === 'Open').length >= 3 && st.filter(x => /Mitigated/.test(x)).length >= 1 &&
             st.filter(x => /Closed/.test(x)).length >= 3; })());

  // ---- Markov: the lane that exists because a fault tree cannot -------------
  console.log('\n[vayu] a reconfigurable energy system, modelled as one');
  check('a Markov model is attached, with a failed state',
    (d.projectConfig.markovModels || []).length >= 1 &&
    d.projectConfig.markovModels[0].states.length >= 4 &&
    d.projectConfig.markovModels[0].states.some(x => x.isFailed));
  check('…and it has a RESTORATION path (the in-flight cross-tie reconfiguration)',
    (() => { const m = d.projectConfig.markovModels[0];
      const order = {}; m.states.forEach((x, i) => order[x.name] = i);
      const failed = new Set(m.states.filter(x => x.isFailed).map(x => x.name));
      return m.transitions.some(t => !failed.has(t.from) && order[t.to] < order[t.from]); })());

  // ---- event tree + bow-tie -------------------------------------------------
  console.log('\n[vayu] event tree — the lane and its invariants have something to read');
  {
    const t = (d.projectConfig.eventTrees || [])[0];
    check('an event tree exists, with an initiator frequency and ordered barriers',
      !!t && (t.initiator || {}).freq > 0 && (t.barriers || []).length >= 3);
    check('at least two barriers declare the fault tree that implements them',
      !!t && (t.barriers || []).filter(b => b.linkedPageId).length >= 2);
    check('a barrier carries a conditional probability for the already-failed case',
      !!t && (t.barriers || []).some(b => b.pCcf > 0));
    check('the two BMS trees share the LOGICAL id of the vent-gas detection event',
      (() => {
        const find = (pid, nm) => { const pg = d.ftaPages.find(x => x.id === pid); let r = null;
          (function w(nn) { if (!nn || r) return; if (nn.name === nm) r = nn; (nn.children || []).forEach(w); })(pg && pg.root); return r; };
        const a = find('pg-bms-undetected', 'Vent-gas sensing fails to annunciate the event');
        const b = find('pg-bms-propagation', 'Vent-gas detection unavailable at the pack');
        return a && b && a.logicalId != null && a.logicalId === b.logicalId;
      })(),
      'same physical event under two names — one logical id is the correct model, and it is what lets INV-28 report two barriers resting on one event');
    check('one outcome is assessed AGAINST the AFHA, so the dual-lane reconcile has a finding',
      (() => { if (!t) return false;
        return Object.keys(t.consequences || {}).some(k => {
          const c = t.consequences[k]; if (!c || !c.linkedFcId) return false;
          const f = (d.acFhaData || []).find(x => x.fcId === c.linkedFcId);
          return f && f.severity !== c.severity; }); })(),
      'INV-27 names a disagreement between the tree call and the hazard classification');
    check('…and at least one outcome AGREES, so the finding is legible as a finding',
      (() => { if (!t) return false;
        return Object.keys(t.consequences || {}).some(k => {
          const c = t.consequences[k]; if (!c || !c.linkedFcId) return false;
          const f = (d.acFhaData || []).find(x => x.fcId === c.linkedFcId);
          return f && f.severity === c.severity; }); })());
    check('a bow-tie joins the fault tree and the event tree with an untraced barrier for the lint',
      (() => { const bt = (d.projectConfig.bowties || [])[0];
        return bt && bt.ftaPageId && bt.etaId && (bt.barriers || []).some(b => b.trace && b.trace.kind === 'none'); })());
  }

  // ---- HUMAN FACTORS — the lane the ask specifically named ------------------
  console.log('\n[vayu] human factors lane populated in full');
  check('at least five assumptions carry a Human Factors payload',
    (d.acAssumptionsData || []).filter(a => a.type === 'Human Factors' && a.hf).length >= 5,
    (d.acAssumptionsData || []).filter(a => a.type === 'Human Factors').length + ' HF assumptions');
  check('every HF payload is complete (direction, phase, crew, task time, channels)',
    (d.acAssumptionsData || []).filter(a => a.type === 'Human Factors')
      .every(a => a.hf && a.hf.direction && a.hf.responsePhase && a.hf.crewmember &&
                  typeof a.hf.taskTimeS === 'number' && Array.isArray(a.hf.channels) && a.hf.channels.length));
  check('the HF lane covers both prevention and recovery tasks',
    (() => { const dirs = new Set((d.acAssumptionsData || []).filter(a => a.type === 'Human Factors').map(a => a.hf.direction));
      return dirs.has('prevention') && dirs.has('recovery'); })());

  // ---- RAM — the other lane the ask named -----------------------------------
  console.log('\n[vayu] reliability, availability, maintainability populated in full');
  check('the RAM programme carries at least ten maintenance tasks',
    ((d.projectConfig.ram || {}).tasks || []).length >= 10,
    String(((d.projectConfig.ram || {}).tasks || []).length));
  check('every RAM task has repair, logistics and admin times and an item reference',
    ((d.projectConfig.ram || {}).tasks || []).every(t =>
      typeof t.activeRepair === 'number' && typeof t.logistics === 'number' &&
      typeof t.admin === 'number' && t.itemId));
  check('RAM settings declare a fleet, annual hours and an availability target',
    (() => { const r = d.projectConfig.ramSettings || {};
      return r.annualFH > 0 && r.fleetSize > 0 && r.targetAvailability > 0 && r.targetAvailability <= 1; })());
  check('every RAM item reference resolves to a real LRU',
    (() => { const items = new Set((d.itemsData || []).map(i => i.itemId));
      return ((d.projectConfig.ram || {}).tasks || []).every(t => items.has(t.itemId)); })());
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
