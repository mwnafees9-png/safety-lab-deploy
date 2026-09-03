#!/usr/bin/env node
/*
 * Regression tests for HF-1/HF-4 — typed assumptions + the HF lane (site/hf_assumptions.js).
 *
 * Locks:
 *   [1] display-lane discipline: READ-ONLY over live state — never writes stores.
 *   [2] the governing rule: effectivePosture() returns credited ONLY when the
 *       assumption is validated. PRODUCTION vocabulary (v0.4): Validated AND
 *       Verified both credit; Proposed/Open/Invalidated/Closed read uncredited.
 *   [3] production schema: reads `statement`, tolerates `text`; type stored as
 *       schema LABEL ('Human Factors') normalizes to id ('hf'); untyped legal;
 *       hf metadata normalizes (direction lowercased, comma-string lists split,
 *       numeric strings parsed).
 *   [4] HFA lane: HF-typed rows expose computed items per direction; non-HF
 *       expose nothing; validated closes the item; channels ride along.
 *   [5] INV-16: Cat/Haz rows resting on typed, postured, non-validated
 *       assumptions are caught; Validated / Verified / untyped / sub-Haz are not.
 *   [6] INV-17: per-crewmember, per-phase, declared co-activation vs the cited
 *       80% red line; silent when no phase declares a window.
 *   [7] production phases: phasesNormalized() maps { phase, windowS } rows to
 *       { id, name, windowS }; duration is NEVER read as a window; phase
 *       matching is case-insensitive.
 *   [8] wiring: index.html loads both modules, cache-busted, after the moat;
 *       schemas carry the typed columns; the phases table authors windowS.
 *
 * Run:  node tests/regression_hf_assumptions.test.js
 */
'use strict';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

// ---- stubbed stores (production schema: statement / states / label types) ----
global.acAssumptionsData = [
  { asmId: 'AS-014', statement: 'Crew configures crossfeed within 30 s', state: 'Open',
    type: 'Human Factors', credited: 'MAJ', uncredited: 'HAZ',
    hf: { direction: 'recovery', responsePhase: 'cruise', crewmember: 'PM', taskTimeS: 30, coActivation: ['always'] } },
  { asmId: 'AS-021', statement: 'Trim runaway assumed not recoverable', state: 'Open',
    type: 'Human Factors', credited: 'CAT', uncredited: 'CAT',
    hf: { direction: 'non-recovery', responsePhase: 'approach', crewmember: 'PF' } },
  { asmId: 'AS-024', statement: 'PM completes flap-fault reconfiguration within 40 s', state: 'Open',
    type: 'Human Factors', credited: 'MAJ', uncredited: 'HAZ',
    hf: { direction: 'recovery', responsePhase: 'approach', crewmember: 'PM', taskTimeS: 40, coActivation: ['S1'] } },
  { asmId: 'AS-025', statement: 'PM sheds bus loads within 35 s', state: 'Open',
    type: 'Human Factors', credited: 'MIN', uncredited: 'MAJ',
    hf: { direction: 'recovery', responsePhase: 'approach', crewmember: 'PM', taskTimeS: 35, coActivation: ['S1'] } },
  { asmId: 'AS-026', statement: 'PM executes lost-comms procedure within 20 s', state: 'Open',
    type: 'Human Factors', credited: 'MIN', uncredited: 'MAJ',
    hf: { direction: 'recovery', responsePhase: 'approach', crewmember: 'PM', taskTimeS: 20, coActivation: ['S1'] } },
  { asmId: 'AS-009', statement: 'Channels A/B independent', state: 'Validated',
    type: 'Design', credited: 'independent', uncredited: 'common-cause' },
  // v0.4 — production vocabulary + authored-through-the-panel shapes:
  { asmId: 'AS-030', statement: 'Verified beats Validated', state: 'Verified',
    type: 'Design', credited: 'independent', uncredited: 'common-cause' },
  { asmId: 'AS-031', statement: 'Proposed is conservative', state: 'Proposed',
    type: 'Design', credited: 'good', uncredited: 'bad' },
  { asmId: 'AS-032', statement: 'PF flies the missed approach within 25 s', state: 'Proposed',
    type: 'Human Factors', credited: 'MAJ', uncredited: 'HAZ',
    hf: { direction: 'Recovery', responsePhase: 'Approach', crewmember: 'PF', taskTimeS: '25',
          coActivation: 'always, S1', channels: 'visual, psychomotor' } },
  { asmId: 'AS-001', statement: 'Untyped legacy assumption', state: 'Open' }
];
global.systemsData = [
  { id: 'fuel', name: 'Fuel', asm: [
      { asmId: 'AS-101', statement: 'System-scope HF credit within 15 s', state: 'Validated',
        type: 'Human Factors', credited: 'MAJ', uncredited: 'HAZ',
        hf: { direction: 'recovery', responsePhase: 'approach', crewmember: 'PF', taskTimeS: 15, coActivation: ['always'] } }
    ],
    fha: [ { fcId: 'FC-201', severity: 'Hazardous', assumptionIds: ['AS-101'] } ] }
];
global.acFhaData = [
  { fcId: 'FC-034', severity: 'Hazardous',    assumptionIds: ['AS-014'] },
  { fcId: 'FC-041', severity: 'Catastrophic', assumptionIds: ['AS-021'] },
  { fcId: 'FC-063', severity: 'Hazardous',    assumptionIds: ['AS-024'] },
  { fcId: 'FC-090', severity: 'Minor',        assumptionIds: ['AS-026'] },
  { fcId: 'FC-117', severity: 'Catastrophic', assumptionIds: ['AS-009'] },
  { fcId: 'FC-118', severity: 'Catastrophic', assumptionIds: ['AS-001'] },
  { fcId: 'FC-119', severity: 'Catastrophic', assumptionIds: ['AS-030'] },
  { fcId: 'FC-120', severity: 'Hazardous',    assumptionIds: ['AS-031'] }
];
// PRODUCTION phase rows — { phase, duration, durationUnit, windowS? }. No ids.
global.flightPhasesData = [
  { phase: 'Cruise',   altFrom: '35000', duration: '4',  durationUnit: 'hours', windowS: '5400' },
  { phase: 'Approach', altFrom: '10000', duration: '10', durationUnit: 'mins',  windowS: 90 },
  { phase: 'Landing',  altFrom: '1000',  duration: '3',  durationUnit: 'mins' }
];

const snapshotBefore = JSON.stringify({ a: global.acAssumptionsData, s: global.systemsData, f: global.acFhaData, p: global.flightPhasesData });
const HF = require('../site/hf_assumptions.js');

// ---- [3] production schema + normalization -----------------------------------
const all = HF.asmAllTyped();
check('inventory spans aircraft + system scopes', all.length === 11);
check('reads statement into text', all.find(a => a.asmId === 'AS-014').text.indexOf('crossfeed') !== -1);
check('label type normalizes to id', all.find(a => a.asmId === 'AS-014').type === 'hf'
  && all.find(a => a.asmId === 'AS-009').type === 'dz');
check('untyped assumption survives with type:null', all.find(a => a.asmId === 'AS-001').type === null);
check('type pack has 9 disciplines incl. hardware/DO-254',
  HF.ASM_TYPES.length === 9 && HF.ASM_TYPES.some(t => t.id === 'hw' && /DO-254/.test(t.verifies)));
const a32 = all.find(a => a.asmId === 'AS-032');
check('hf normalization: direction lowercases, numeric string parses',
  a32.hf.direction === 'recovery' && a32.hf.taskTimeS === 25);
check('hf normalization: comma-string lists split (coActivation + channels)',
  a32.hf.coActivation.length === 2 && a32.hf.coActivation[0] === 'always' &&
  a32.hf.channels.length === 2 && a32.hf.channels[1] === 'psychomotor');
check('channel pack is the 5 HIDH lanes',
  Array.isArray(HF.HF_CHANNELS) && HF.HF_CHANNELS.length === 5 && HF.HF_CHANNELS.includes('psychomotor'));

// ---- [2] the governing rule ---------------------------------------------------
check('Open reads the uncredited lane', HF.effectivePosture(all.find(a => a.asmId === 'AS-014')) === 'HAZ');
check('Validated reads the credited lane', HF.effectivePosture(all.find(a => a.asmId === 'AS-009')) === 'independent');
check('Verified ALSO reads the credited lane (production vocabulary)',
  HF.effectivePosture(all.find(a => a.asmId === 'AS-030')) === 'independent' && HF.isValidated('Verified'));
check('Proposed reads the uncredited lane',
  HF.effectivePosture(all.find(a => a.asmId === 'AS-031')) === 'bad' && !HF.isValidated('Proposed'));

// ---- [4] HFA lane -------------------------------------------------------------
const items = HF.hfaItems();
check('every HF-typed assumption spawns exactly one HFA item',
  items.length === all.filter(a => a.type === 'hf').length);
check('recovery → task-analysis; non-recovery → pessimism challenge',
  /task analysis/.test(items.find(i => i.asmId === 'AS-014').method) &&
  /Challenge pessimism/.test(items.find(i => i.asmId === 'AS-021').work));
check('Validated closes its HFA item; Open stays open',
  items.find(i => i.asmId === 'AS-101').closed === true &&
  items.find(i => i.asmId === 'AS-014').closed === false);
check('non-HF types spawn nothing', !items.find(i => i.asmId === 'AS-009'));
check('items carry the channel tags', items.find(i => i.asmId === 'AS-032').channels.includes('visual'));

// ---- [5] INV-16 ---------------------------------------------------------------
const r16 = HF.inv16();
const failIds = r16.fails.map(f => f.asmId);
check('INV-16 catches Cat/Haz resting on non-validated postured assumptions',
  failIds.includes('AS-014') && failIds.includes('AS-021') && failIds.includes('AS-024'));
check('INV-16 catches Proposed (production open state)', failIds.includes('AS-031'));
check('finding reports the effective (uncredited) posture',
  r16.fails.find(f => f.asmId === 'AS-014').holds === 'HAZ');
check('Validated AND Verified clean · untyped not INV-16 business · sub-Haz out of scope',
  !failIds.includes('AS-009') && !failIds.includes('AS-030') &&
  !failIds.includes('AS-001') && !failIds.includes('AS-026'));

// ---- [7] production phases ----------------------------------------------------
const phz = HF.phasesNormalized();
check('production rows normalize: id from phase name, windowS parsed from string',
  phz.length === 3 && phz[0].id === 'Cruise' && phz[0].windowS === 5400 && phz[1].windowS === 90);
check('a phase without an authored window gets windowS 0 — duration is NEVER a window',
  phz[2].id === 'Landing' && phz[2].windowS === 0);

// ---- [6] INV-17 ---------------------------------------------------------------
const r17 = HF.inv17();
const s1 = r17.findings.find(f => f.phase === 'Approach' && f.crewmember === 'PM' && f.scenario === 'S1');
check('PM saturates in approach under declared co-activation S1 (95s/90s)',
  s1 && s1.demandS === 95 && s1.windowS === 90 && s1.utilization > 1.0);
check('red line is the cited HIDH 80% constant',
  HF.TIME_OCCUPANCY_RED_LINE === 0.80 && /Parks & Boucek/.test(s1.basis));
check('phase matching is case-insensitive; cruise stays clean (30s/5400s)',
  r17.checked >= 6 && !r17.findings.find(f => String(f.phase).toLowerCase() === 'cruise'));
check('per-crewmember: PF does not saturate under S1',
  !r17.findings.find(f => f.phase === 'Approach' && f.crewmember === 'PF' && f.scenario === 'S1'));
check('three honest exits, no "mark as reviewed"',
  s1.exits.length === 3 && !s1.exits.some(e => /review/.test(e)));
(function () {  // silent without phase windows (production before authoring)
  const saved = global.flightPhasesData;
  global.flightPhasesData = [{ phase: 'Approach', duration: '10', durationUnit: 'mins' }];
  const quiet = HF.inv17();
  check('INV-17 is silent when no phase declares a window', quiet.findings.length === 0);
  global.flightPhasesData = saved;
})();

// ---- [1] display-lane discipline ----------------------------------------------
check('module never wrote the stores (byte-identical)',
  snapshotBefore === JSON.stringify({ a: global.acAssumptionsData, s: global.systemsData, f: global.acFhaData, p: global.flightPhasesData }));

// ---- [8] wiring ----------------------------------------------------------------
const fs = require('fs'), path = require('path');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
const iMoat = indexHtml.indexOf('assumption_moat.js');
const iHf = indexHtml.indexOf('hf_assumptions.js?v=');
const iPanel = indexHtml.indexOf('hf_register_panel.js?v=');
check('index.html loads hf_assumptions cache-busted after the moat', iMoat !== -1 && iHf > iMoat);
check('index.html loads hf_register_panel after hf_assumptions', iPanel > iHf);
const cfg = fs.readFileSync(path.join(__dirname, '..', 'site', 'config_data.js'), 'utf8');
check('both assumption schemas carry type + credited + uncredited columns',
  (cfg.match(/id: 'type',\s*label: 'Type'/g) || []).length === 2 &&
  (cfg.match(/id: 'credited'/g) || []).length === 2 &&
  (cfg.match(/id: 'uncredited'/g) || []).length === 2);
check('schema type options match the type-pack labels',
  HF.ASM_TYPES.every(t => cfg.includes("'" + t.label + "'")));
const helpers = fs.readFileSync(path.join(__dirname, '..', 'site', 'helpers_modules.js'), 'utf8');
check('the phases table authors windowS (input wired to updatePhase)',
  helpers.indexOf("updatePhase(${idx}, 'windowS', this.value)") !== -1);
check('index.html phases header carries the HF window column with its INV-17 note',
  indexHtml.includes('HF window (s)') && /never read as a response window/.test(indexHtml));
check('both production state selects offer Invalidated',
  /value="Invalidated"/.test(helpers) &&
  /value="Invalidated"/.test(fs.readFileSync(path.join(__dirname, '..', 'site', 'support_modules.js'), 'utf8')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
