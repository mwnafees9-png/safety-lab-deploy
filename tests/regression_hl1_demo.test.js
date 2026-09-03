#!/usr/bin/env node
/*
 * Regression — the HL-1 showcase must stay de-identified and wired.
 *
 * This demo began life modelled on a named third party's real programme and was
 * later reworked into a fictional aircraft so it could sit publicly alongside
 * K350, Kestrel RJ and Barracuda. A blanket find-and-replace did most of that
 * work, which is exactly the kind of change that half-survives: one lowercase
 * mention in a comment, one press citation in an assumption, and the demo is
 * back to annotating someone else's aircraft with our guesses in front of every
 * account that signs up.
 *
 * It also pins the wiring (picker entry, loader, index.html script tags) and the
 * checkpoint status vocabulary, both of which have silently drifted before.
 *
 * Run: node tests/regression_hl1_demo.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');

const demo   = S('demo_showcase_hl1.js');
const loader = S('hl1_showcase.js');
const picker = S('demo_picker.js');
const index  = S('index.html');

// ---- de-identification ------------------------------------------------------
// The aircraft is fictional. Nothing may name the programme it was reworked
// from, and no assumption may cite a press source, because there is no longer a
// real thing for a citation to point at.
const FORBIDDEN = [
  'windrunner', 'wind runner', 'magnaghi', 'flightglobal', 'ieee spectrum',
  'aerotime', 'aviation week', 'born to engineer',
];
FORBIDDEN.forEach(w => {
  const hit = [['demo_showcase_hl1.js', demo], ['hl1_showcase.js', loader], ['demo_picker.js', picker]]
    .filter(([, src]) => src.toLowerCase().indexOf(w) >= 0).map(([f]) => f);
  check('no reference to "' + w + '"', hit.length === 0, 'found in ' + hit.join(', '));
});
// 'radia' but not radiated / radial / radian / radiation.
[['demo_showcase_hl1.js', demo], ['hl1_showcase.js', loader], ['demo_picker.js', picker], ['index.html', index]]
  .forEach(([f, src]) => check('no operator name in ' + f, !/radia(?!t|n|l)/i.test(src)));

// The old filenames must be gone, not merely unreferenced — a stale copy still
// served from R2 would re-expose the identified version.
['demo_showcase_windrunner.js', 'windrunner_showcase.js'].forEach(f =>
  check('the pre-rename file ' + f + ' is deleted', !fs.existsSync(path.join(SITE, f))));

// ---- provenance vocabulary --------------------------------------------------
// The point of the demo is the split between what the specification gave us and
// what we invented. [PUBLIC]/[REPORTED] were the old, source-attributed tags.
check('assumptions use the [SPEC] tag', demo.indexOf('[SPEC]') >= 0);
check('assumptions use the [PRELIM] tag', demo.indexOf('[PRELIM]') >= 0);
check('no assumption still carries a source-attributed tag',
  demo.indexOf('[PUBLIC]') < 0 && demo.indexOf('[REPORTED]') < 0);

// ---- the module still builds ------------------------------------------------
// The builder REFUSES to run without demo_kit.js (no verification mirrors ⇒ an
// empty INV-03 denominator, which reads exactly like a pass). So the sandbox has
// to carry the same helpers the browser does — loading the real file, not a stub,
// because a stub would let a broken helper through this suite untouched.
const ctx = { window: {}, console: { log() {}, warn() {}, error() {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'site', 'demo_kit.js'), 'utf8'), ctx, { filename: 'demo_kit.js' });
ctx.slDemoMirror = ctx.window.slDemoMirror;
vm.runInContext(demo, ctx, { filename: 'demo_showcase_hl1.js' });
const M = ctx.window.SL_SHOWCASE_HL1;
check('the module registers window.SL_SHOWCASE_HL1', !!M && typeof M.build === 'function');
check('the module exposes postLoad', !!M && typeof M.postLoad === 'function');

let d = null;
try { d = M.build(); } catch (e) { check('build() runs', false, e.message); }
if (d) {
  const n = o => Array.isArray(o) ? o.length : 0;
  check('build() runs', true);
  check('project name is the fictional aircraft',
    d.projectName === 'Aeolus HL-1 · Outsized Freighter', 'got ' + d.projectName);
  check('certification basis is Part 25', d.projectConfig.regulation === 'part-25');
  // Depth: these are the numbers that make it a worked example rather than a stub.
  check('23 aircraft sub-functions', n(d.acFunctionsData) === 23, String(n(d.acFunctionsData)));
  check('30 aircraft failure conditions', n(d.acFhaData) === 30, String(n(d.acFhaData)));
  // §7.3, again: these were `=== 14` and `=== 18` and broke the moment the
  // propulsion and hydraulic units were modelled and the mirrors landed. Assert
  // the invariant — the demo must not SHRINK, and every allocation tree must be
  // mirrored — not a count that legitimate work moves.
  check('at least fourteen systems, and never fewer', n(d.systemsData) >= 14, String(n(d.systemsData)));
  check('at least eighteen fault trees, and never fewer', n(d.ftaPages) >= 18, String(n(d.ftaPages)));
  check('every allocation tree has exactly one verification mirror',
    (() => { const alloc = d.ftaPages.filter(p => !p.verifies), mirr = d.ftaPages.filter(p => p.verifies);
             return alloc.length >= 18 && mirr.length === alloc.length &&
                    mirr.every(m => alloc.some(a => a.id === m.verifies)); })(),
    d.ftaPages.filter(p => !p.verifies).length + ' allocation / ' + d.ftaPages.filter(p => p.verifies).length + ' mirrors');
  // §7.3 for the third time in this suite today: these were `=== 12 / 15 / 8` and
  // broke the moment the CCA set was completed. The invariant is that the demo's
  // coverage never SHRINKS — the specific coverage claims live in the [hl1] CCA
  // section below, where they are asserted by content rather than by count.
  check('the CCA set never shrinks below what it has already demonstrated',
    n(d.praData) >= 12 && n(d.zsaData) >= 15 && n(d.cmaData) >= 8,
    `${n(d.praData)}/${n(d.zsaData)}/${n(d.cmaData)}`);
  check('the CMA keeps at least one open finding',
    d.cmaData.some(r => r.status === 'Open'),
    'an all-green demo teaches nothing — CMA-006 is the independence finding');
  // Nothing identifying may reach the rendered project data either.
  const blob = JSON.stringify(d);
  check('built project data is clean',
    !/windrunner|magnaghi|flightglobal|ieee spectrum|aerotime|born to engineer|radia(?!t|n|l)/i.test(blob));
}

// ---- wiring -----------------------------------------------------------------
check('index.html declares SL_SHOWCASE_HL1_SRC', /SL_SHOWCASE_HL1_SRC\s*=/.test(index));
check('index.html loads hl1_showcase.js', /src="hl1_showcase\.js/.test(index));
check('the loader exposes loadHL1Demo', /window\.loadHL1Demo\s*=/.test(loader));
check('the loader exposes the picker gate', /window\.slHL1Visible\s*=/.test(loader));
check('the demo is public', /HL1_PUBLIC\s*=\s*true/.test(loader),
  'flipping this to false hides it from the picker for everyone but staff');

const entry = (picker.match(/\{[^{}]*id:\s*'hl1'[\s\S]*?\}/) || [''])[0];
check('the picker has an hl1 entry', entry.length > 40);
check('the picker entry names the fictional aircraft', /Aeolus HL-1/.test(entry));
check('the picker entry points at the real loader', /loader:\s*'loadHL1Demo'/.test(entry));
check('the picker entry gates on the real predicate', /gate:\s*'slHL1Visible'/.test(entry));

// ---- checkpoint status vocabulary -------------------------------------------
// The dashboard tile and the card badge must agree. They were 'handed off'.
const bindings = S('bindings_modules.js'), misc = S('misc_fn_modules.js');
check("the 'handed-off' status renders as Baselined",
  /'handed-off':\s*'Baselined'/.test(bindings));
check('the dashboard tile reads baselined',
  /handed \+ ' baselined'/.test(misc), 'the Assessments tile still says handed off');
check('the status key itself is unchanged',
  /'handed-off'/.test(bindings) && /handed-off/.test(S('helpers_modules.js')),
  'the stored status value must stay handed-off — only the label changed');

// ---- PROGRAMME STATE — deliberate, and NOT to be "fixed" ---------------------
// Waqas, 4 Aug: "I want to show compromised, stale and obsolete requirements and
// states, it sells better than showing full compliance", and, asked how visible
// to make them: unlabelled, with the thread and traces doing the flagging. So the
// demo data carries NO note saying these are demonstration cases — which means
// this suite is the only thing standing between them and a future session that
// reads one as a defect and quietly closes it. Each check says what it protects.
console.log('\n[hl1] programme state — a live programme between design reviews');
check('open review comments exist on artifacts that were already signed',
  (d.reviewCommentsData || []).filter(c => c.status === 'open').length >= 5,
  'with no open concerns every approval reads valid, and the board is green in a way no real programme ever is');
check('…and they INVALIDATE real approvals, across more than one artifact kind',
  (() => {
    const open = (d.reviewCommentsData || []).filter(c => c.status === 'open');
    const hit = (d.reviewApprovalsData || []).filter(a => open.some(c =>
      c.target.kind === a.kind && String(c.target.id) === String(a.id) &&
      (c.target.systemId || null) === (a.systemId || null)));
    return hit.length >= 5 && new Set(hit.map(a => a.kind)).size >= 4;
  })(),
  'an approval is invalidated by ANY open comment on the same target — a comment that matches no approval demonstrates nothing');
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
  'INV-09 fires on the unsigned pair; the signed pair is what makes the unsigned pair legible as a finding rather than as a missing field');
check('a requirement is SUPERSEDED and still carried, with its audit trail intact',
  (d.acReqData || []).some(r => r.reqSource && r.reqSource.obsolete && r.reqSource.obsolete.supersededBy && r.reqSource.obsolete.reason),
  'the superseded row stays in the register — deleting it would erase the trace that makes the staleness visible');
check('a failure condition is left stale by the FCIM redo',
  (d.acFhaData || []).some(f => f.obsolete));

// ---- MBSA and the spatial model ---------------------------------------------
console.log('\n[hl1] the architecture the zonal and MBSA lanes read');
check('the redundant installations are modelled as the UNITS they are',
  ['sys-prp1','sys-prp2','sys-prp3','sys-prp4','sys-hyd-a','sys-hyd-b','sys-hyd-c']
    .every(id => (d.systemsData || []).some(x => x.id === id)),
  'a minimum-acceptable configuration is a statement about surviving MEMBERS; an installation is one member and can never express four engines');
check('the MAC model states a real minimum over real members where the redundancy exists',
  (() => { const m = (d.projectConfig.macModels || []);
    const thrust = m.find(r => r.id === 'mac-thrust'), hyd = m.find(r => r.id === 'mac-hyd');
    return thrust && thrust.clauses[0].min === 2 && thrust.clauses[0].of.length === 4 &&
           hyd && hyd.clauses[0].min === 2 && hyd.clauses[0].of.length === 3; })());
check('every clause member is a live system id',
  (() => { const ids = new Set((d.systemsData || []).map(x => x.id));
    return (d.projectConfig.macModels || []).every(r => (r.clauses || []).every(c => (c.of || []).every(x => ids.has(x)))); })());
check('some clauses are HONESTLY single-member, and some are unsubstantiated',
  (d.projectConfig.macModels || []).some(r => r.clauses.every(c => c.of.length === 1)) &&
  (d.projectConfig.macModels || []).some(r => r.substantiation && r.substantiation.kind !== 'sdd'),
  'those functions have no system-level redundancy here — writing the clause is what lets the spatial model say so, and omitting it would have left the same aircraft looking better');
check('zonal residual risk is PARTLY dispositioned, with a signature, a basis and a fingerprint',
  (() => { const z = d.projectConfig.zonalAccepted || {}; const k = Object.keys(z);
    return k.length >= 3 && k.every(x => z[x].by && z[x].basis && z[x].fingerprint); })(),
  'the fingerprint is what makes the acceptance perishable — change the zone content and the signature reopens instead of silently continuing to cover something it was never granted against');
check('…and NOT fully dispositioned — the open ones are the state of a live ZSA',
  (() => { const z = d.projectConfig.zonalAccepted || {}; return Object.keys(z).length < 10; })());

// ---- the CCA set is FULL, not a sample --------------------------------------
console.log('\n[hl1] common cause analyses cover the aircraft, not the interesting parts of it');
check('the ZSA covers every zone that carries flight-critical content or an energy source',
  (() => { const ids = (d.zsaData || []).map(z => z.zoneId);
    return ids.length >= 22 && ['Z-PYL1','Z-PYL4','Z-APU','Z-BELLY','Z-TCONE','Z-CREW'].every(z => ids.indexOf(z) >= 0); })(),
  (d.zsaData || []).length + ' zones — pylons, APU bay, belly fairing and tail cone were the gaps, and a zonal analysis that skips them is a survey of the zones somebody already worried about');
check('every zone row carries interference AND a mitigation, not just a name',
  (d.zsaData || []).every(z => z.zoneId && z.desc && z.equip && z.interference && z.mitigation));
check('the PRA covers the ARP4761A App L.1.3 risks the catalogue now offers',
  (() => { const t = (d.praData || []).map(p => String(p.threat || '').toLowerCase()).join(' | ');
    return (d.praData || []).length >= 18 &&
      ['fuel', 'thermal runaway', 'ram air turbine', 'duct rupture', 'flange', 'chemical container', 'bulkhead']
        .every(k => t.indexOf(k) >= 0); })(),
  (d.praData || []).length + ' entries');
check('every particular risk names zones that exist',
  (() => { const z = new Set((d.zsaData || []).map(x => x.zoneId));
    return (d.praData || []).every(p => (p.affectedZones || []).every(x => z.has(x))); })(),
  'a threat pointed at a zone that is not in the ZSA is assessed against nothing');
check('the CMA has a row for every KIND of independence claim the MAC model makes',
  (() => { const subj = (d.cmaData || []).map(c => String(c.subject || '').toLowerCase()).join(' | ');
    return (d.cmaData || []).length >= 12 &&
      /min 2 of 4|powerplant unit independence/.test(subj) &&
      /min 2 of 3|hydraulic system independence/.test(subj) &&
      /single-member/.test(subj); })(),
  'the single-member clauses are the ones that most need a CMA row — a clause naming one system is a claim that nothing else is needed');
check('the CMA board is NOT all green',
  (() => { const st = (d.cmaData || []).map(c => c.status);
    return st.filter(x => x === 'Open').length >= 4 && st.filter(x => /Mitigated/.test(x)).length >= 1 &&
           st.filter(x => /Closed/.test(x)).length >= 3; })(),
  'an all-closed common-mode analysis is the least believable artifact a demo can carry');

// ---- Markov: the lane that exists because a fault tree cannot ---------------
console.log('\n[hl1] a repairable system, modelled as one');
check('a Markov model is attached to the programme',
  (d.projectConfig.markovModels || []).length >= 1 &&
  d.projectConfig.markovModels[0].states.length >= 4 &&
  d.projectConfig.markovModels[0].states.some(x => x.isFailed));
check('…and it has a RESTORATION path, which is the only reason to use the lane',
  (() => { const m = d.projectConfig.markovModels[0];
    const order = {}; m.states.forEach((x, i) => order[x.name] = i);
    const failed = new Set(m.states.filter(x => x.isFailed).map(x => x.name));
    return m.transitions.some(t => !failed.has(t.from) && order[t.to] < order[t.from]); })(),
  'a chain that only degrades is an OR gate with extra steps — the in-flight GCU reset and the APU start are transitions back');

// ---- the mitigative half of the bow tie -------------------------------------
// Built and exercised against the DEPLOYED build before being authored here:
// 16 outcomes, path probabilities summing to 1, roll-up worst Catastrophic at
// 3.84e-11/FH, and both event-tree invariants firing on real content. Without a
// tree in ANY demo, INV-27 and INV-28 run with a zero denominator everywhere —
// which is not a pass, it is a check with nothing to check.
console.log('\n[hl1] event tree — the lane and its two invariants have something to read');
{
  const t = (d.projectConfig.eventTrees || [])[0];
  check('an event tree exists, with an initiator frequency and ordered barriers',
    !!t && (t.initiator || {}).freq > 0 && (t.barriers || []).length >= 3);
  check('at least two barriers declare the fault tree that implements them',
    !!t && (t.barriers || []).filter(b => b.linkedPageId).length >= 2,
    'the coupling detector reads the LINKED pages — an unlinked barrier is invisible to it');
  check('a barrier carries a conditional probability for the already-failed case',
    !!t && (t.barriers || []).some(b => b.pCcf > 0),
    'without pCcf the product rule silently assumes independence across the whole path');
  check('the two nose-door trees share the LOGICAL id of the lock event',
    (() => {
      const find = (pid, nm) => { const pg = d.ftaPages.find(x => x.id === pid); let r = null;
        (function w(n) { if (!n || r) return; if (n.name === nm) r = n; (n.children || []).forEach(w); })(pg && pg.root); return r; };
      const a = find('pg-nzd-open', 'Lock mechanism fails or is not engaged');
      const b = find('pg-nzd-indication', 'Lock not fully engaged');
      return a && b && a.logicalId != null && a.logicalId === b.logicalId;
    })(),
    'same physical event under two names — giving it one logical id is the correct model, and it is what lets INV-28 report that two barriers rest on one event');
  check('one outcome is assessed AGAINST the AFHA, so the dual-lane reconcile has a finding',
    (() => { if (!t) return false;
      const conflicting = Object.keys(t.consequences || {}).some(k => {
        const c = t.consequences[k]; if (!c || !c.linkedFcId) return false;
        const f = (d.acFhaData || []).find(x => x.fcId === c.linkedFcId);
        return f && f.severity !== c.severity; });
      return conflicting; })(),
    'INV-27 exists to name a disagreement between the tree call and the hazard classification — with every outcome agreeing it never speaks');
  check('…and at least one outcome AGREES, so the finding is legible as a finding',
    (() => { if (!t) return false;
      return Object.keys(t.consequences || {}).some(k => {
        const c = t.consequences[k]; if (!c || !c.linkedFcId) return false;
        const f = (d.acFhaData || []).find(x => x.fcId === c.linkedFcId);
        return f && f.severity === c.severity; }); })());
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
