#!/usr/bin/env node
/*
 * Regression — hf_evidence.js v0.1 (SIM-1: HFA evidence ingest).
 *
 *   [1] refusals: unknown/non-HF target, bad kind/metric/value, missing n on
 *       trials (literature exempt), uncited source, bad date, no name.
 *   [2] the comparison lane: measured band above assumed → CONTRADICTS;
 *       at/below → SUPPORTS (conservative noted); no matching field →
 *       INFORMS; orphan detected.
 *   [3] no auto-validation: ingest never touches assumption state; the
 *       validation seed appears only for supported-and-uncontradicted and
 *       says the human validates in the register.
 *   [4] all-or-nothing import: one bad row refuses the whole paste with
 *       row-numbered errors; a clean paste lands; JSON arrays accepted.
 *   [5] INV-42 advisory: Validated+contradicted named; orphaned evidence
 *       named; clean stores silent.
 *   [6] wiring: index tag; writes confined to projectConfig.hfEvidence.
 *
 * Run:  node tests/regression_hf_evidence.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

globalThis.window = globalThis;
globalThis.projectConfig = {};
const ASMS = [
  { asmId: 'AS-9', type: 'hf', state: 'Validated', statement: 'Crew workload in go-around is slight', hf: { workloadBand: 'slight' } },
  { asmId: 'AS-10', type: 'hf', state: 'Proposed', statement: 'Recovery within 4 s', hf: {} },
  { asmId: 'AS-11', type: 'Design', state: 'Proposed', statement: 'Not an HF assumption' },
];
globalThis.asmAll = () => ASMS;
const _inv = [];
globalThis.invRegister = i => _inv.push(i);
globalThis.commitSaveChanges = () => {};
globalThis.showToast = () => {};
const H = require('../site/hf_evidence.js');
const GOOD = { asmId: 'AS-9', kind: 'sim-campaign', metric: 'workloadBand', value: 'slight', n: 12,
               source: 'K350 sim campaign #3, run log 2026-07-12, WP-HF-004', date: '2026-07-12', by: 'A. Analyst' };

console.log('\n[1] refusals');
check('unknown target refused', H.addEvidence(Object.assign({}, GOOD, { asmId: 'AS-404' })) === null);
check('non-HF assumption refused', H.addEvidence(Object.assign({}, GOOD, { asmId: 'AS-11' })) === null);
check('bad kind refused', H.addEvidence(Object.assign({}, GOOD, { kind: 'vibes' })) === null);
check('bad metric refused', H.addEvidence(Object.assign({}, GOOD, { metric: 'happiness' })) === null);
check('bad band value refused', H.addEvidence(Object.assign({}, GOOD, { value: 'extreme' })) === null);
check('errorRate > 1 refused', H.addEvidence(Object.assign({}, GOOD, { metric: 'errorRate', value: 1.4 })) === null);
check('trial without n refused (one anecdote is n=1 — say so)', H.addEvidence(Object.assign({}, GOOD, { n: null })) === null);
check('literature exempt from n but never from citation',
  H.addEvidence({ asmId: 'AS-10', kind: 'literature', metric: 'recoveryS', value: 3.2, source: 'Wickens 2008, table 4 (attention tunneling recovery)', date: '2026-07-01', by: 'A. Analyst' }) !== null &&
  H.addEvidence(Object.assign({}, GOOD, { source: 'trust me' })) === null);
check('bad date refused', H.addEvidence(Object.assign({}, GOOD, { date: 'July 12' })) === null);
check('nameless refused', H.addEvidence(Object.assign({}, GOOD, { by: '' })) === null);

console.log('\n[2] the comparison lane');
const e1 = H.addEvidence(GOOD);                                                          // slight vs slight → supports
const e2 = H.addEvidence(Object.assign({}, GOOD, { value: 'excessive', date: '2026-07-14' }));   // above → contradicts
const e3 = H.addEvidence(Object.assign({}, GOOD, { value: 'none', date: '2026-07-15' }));        // below → supports (conservative)
check('three records landed', e1 && e2 && e3 && projectConfig.hfEvidence.length === 4);
const roll9 = H.asmRollup('AS-9');
check('above the assumed band → CONTRADICTS with the optimism named',
  roll9.contradicts === 1 && /optimistic/.test(roll9.rows.find(x => x.v.verdict === 'contradicts').v.why));
check('at/below → SUPPORTS, conservative case noted',
  roll9.supports === 2 && roll9.rows.some(x => /conservative/.test(x.v.why)));
check('no matching field → INFORMS, waiting for its question',
  H.asmRollup('AS-10').informs === 1 && /waiting for its question/.test(H.asmRollup('AS-10').rows[0].v.why));

console.log('\n[3] no auto-validation');
check('assumption states untouched by ingest', ASMS[0].state === 'Validated' && ASMS[1].state === 'Proposed');
check('contradicted assumption gets NO validation seed', roll9.validationSeed === null);
const roll10 = H.asmRollup('AS-10');
check('informs-only gets no seed either (nothing supported yet)', roll10.validationSeed === null);
ASMS[1].hf.workloadBand = 'significant';   // the assumption gains its band — now the evidence has a field to speak to
const e4 = H.addEvidence({ asmId: 'AS-10', kind: 'flight-test', metric: 'workloadBand', value: 'slight', n: 4,
  source: 'FT-12 crew debrief workload card, sortie 2026-07-18', date: '2026-07-18', by: 'B. Pilot' });
check('supported-and-uncontradicted → seed that sends the human to the register',
  (() => { const r = H.asmRollup('AS-10'); return e4 && /Validate AS-10 IN THE REGISTER/.test(r.validationSeed) && /never validates by itself/.test(r.validationSeed); })());

console.log('\n[4] all-or-nothing import');
const before = projectConfig.hfEvidence.length;
let r = H.importRows('AS-9,workloadBand,significant,8,sim campaign 4 run log,2026-07-20\nAS-404,workloadBand,slight,8,some source text here,2026-07-20', { by: 'A. Analyst', kind: 'sim-campaign' });
check('one bad row refuses the WHOLE paste with row-numbered errors',
  r.ok === false && r.errors.length === 1 && /row 2/.test(r.errors[0]) && projectConfig.hfEvidence.length === before);
r = H.importRows('asmId,metric,value,n,source,date\nAS-9,workloadBand,significant,8,sim campaign 4 run log,2026-07-20', { by: 'A. Analyst', kind: 'sim-campaign' });
check('clean CSV lands (header line skipped)', r.ok === true && r.imported === 1 && projectConfig.hfEvidence.length === before + 1);
r = H.importRows(JSON.stringify([{ asmId: 'AS-9', kind: 'bench-trial', metric: 'taskTimeS', value: 2.1, n: 30, source: 'bench rig TR-9 log 2026-06', date: '2026-06-30', by: 'C. Eng' }]));
check('JSON array accepted', r.ok === true && r.imported === 1);

console.log('\n[5] INV-42');
const inv = _inv.find(i => i.id === 'INV-42');
check('registered as advisory', !!inv && inv.sev === 'advisory');
let res = inv.run();
check('Validated + contradicted → named (the credited lane stands on a disputed number)',
  res.fails.some(f => /AS-9 is Validated/.test(f) && /trials dispute/.test(f)));
check('Proposed + contradiction-free stays silent for AS-10', !res.fails.some(f => /AS-10/.test(f)));
ASMS.splice(1, 1);   // delete AS-10 → its evidence orphans
res = inv.run();
check('orphaned evidence named', res.fails.some(f => /AS-10 which no longer exists/.test(f)));

console.log('\n[6] wiring');
const src = S('hf_evidence.js');
check('index.html ships hf_evidence.js after hf_register_panel.js',
  (() => { const idx = S('index.html'); const a = idx.indexOf('hf_register_panel.js'); const b = idx.indexOf('hf_evidence.js?v=');
           return a >= 0 && b > a; })());
check('writes confined to projectConfig.hfEvidence',
  !/projectConfig\.(?!hfEvidence)\w+\s*=(?!=)/.test(src) && !/\ba\.state\s*=(?!=)/.test(src) && !/asm\.state\s*=(?!=)/.test(src));
check('the doctrine is stated: uncited evidence is rumor, ingest never validates',
  /uncited evidence is rumor/.test(src) && /never validates by itself|NO AUTO-VALIDATION/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
