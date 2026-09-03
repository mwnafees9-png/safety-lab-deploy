#!/usr/bin/env node
/*
 * Regression — SORA 2.5 engine (sora_core v0.1).
 *   [1] iGRC: exact cells against the verified Main Body Table 2; the column
 *       binds on BOTH dimension and speed (speed pushes right); grey cells
 *       and beyond-bounds inputs refuse to Certified; density required.
 *   [2] mitigations: exact credits; invalid credit levels refused; the M1
 *       column-floor rule; overall never below 1.
 *   [3] SAIL: exact Table 7 rows; GRC>7 refuses; ARC validated; arcInitial()
 *       now COMPUTES (v0.3) from the AEC table, single-source confidence.
 *   [4] adjacent area: 3 min at max speed, clamped [5, 35] km.
 *   [5] OSO register: all 17 from the VERIFIED Annex E data (#99/#100);
 *       robustness matrix resolves per SAIL with citations; None carries the
 *       Table-14 road home; OSO#24 Low printed N/A; containment() now
 *       COMPUTES Table 8 (1m UA class, two-source verified, v0.3) and still
 *       REFUSES Tables 9-13.
 *   [6] spine discipline: citations ride every result; engine never mutates
 *       inputs; micro-UAS shortcut deliberately absent (conservative).
 *   [7] wiring: index.html ships sora_core.js inert (tag, no nav/tab), and
 *       the specific-sora basis exists in the wizard bases.
 * Run: node tests/regression_sora.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
globalThis.window = globalThis;
require('../site/sora_annex_e_data.js');   // #100 — the engine reads window.SORA_ANNEX_E
const E = require('../site/sora_core.js');

// ---- [1] iGRC -----------------------------------------------------------------
check('controlled ground area row: 1/1/2/3/3 across the columns',
  E.igrc({ dimM: 1, speedMps: 25, controlledGroundArea: true }).igrc === 1 &&
  E.igrc({ dimM: 3, speedMps: 35, controlledGroundArea: true }).igrc === 1 &&
  E.igrc({ dimM: 8, speedMps: 75, controlledGroundArea: true }).igrc === 2 &&
  E.igrc({ dimM: 20, speedMps: 120, controlledGroundArea: true }).igrc === 3 &&
  E.igrc({ dimM: 40, speedMps: 200, controlledGroundArea: true }).igrc === 3);
check('sparse rural (<5 ppl/km²): 2/3/4/5/6', [1, 3, 8, 20, 40].map((d, i) =>
  E.igrc({ dimM: d, speedMps: [25, 35, 75, 120, 200][i], density: 4 }).igrc).join(',') === '2,3,4,5,6');
check('suburban (<5,000): 3 m class → 6', E.igrc({ dimM: 3, speedMps: 30, density: 3000 }).igrc === 6);
check('dense urban (<50,000): 40 m class → 10', E.igrc({ dimM: 38, speedMps: 180, density: 30000 }).igrc === 10);
check('>50,000 with 1 m class → 7; with 3 m class → 8',
  E.igrc({ dimM: 0.9, speedMps: 20, density: 60000 }).igrc === 7 &&
  E.igrc({ dimM: 2.5, speedMps: 30, density: 60000 }).igrc === 8);
check('SPEED pushes the column right (1 m airframe at 60 m/s reads the 8 m/75 column)',
  E.igrc({ dimM: 1, speedMps: 60, density: 4 }).igrc === 4 &&
  E.igrc({ dimM: 1, speedMps: 60, density: 4 }).column.dimM === 8);
check('grey cell refuses to Certified (>50,000 × 8 m class)',
  throws(() => E.igrc({ dimM: 8, speedMps: 70, density: 60000 }), /Certified/));
check('beyond 40 m / 200 m/s refuses to Certified',
  throws(() => E.igrc({ dimM: 45, speedMps: 100, density: 10 }), /Certified/) &&
  throws(() => E.igrc({ dimM: 5, speedMps: 250, density: 10 }), /Certified/));
check('density required unless controlled ground area declared',
  throws(() => E.igrc({ dimM: 3, speedMps: 30 }), /density/));
check('boundary honesty: density exactly 5 lands in <50, not <5',
  E.igrc({ dimM: 1, speedMps: 25, density: 5 }).igrc === 3);

// ---- [2] mitigations ----------------------------------------------------------
const base = E.igrc({ dimM: 3, speedMps: 35, density: 3000 });   // iGRC 6, floor 1
check('M1(A) medium + M2 high: 6 → 4 → 2', E.finalGrc(base, { m1a: 'medium', m2: 'high' }).finalGrc === 2);
check('M1(C) only has LOW (-1); asking for medium refuses',
  E.finalGrc(base, { m1c: 'low' }).finalGrc === 5 &&
  throws(() => E.finalGrc(base, { m1c: 'medium' }), /no "medium"/));
check('M1(B) low refused (its credits start at medium)', throws(() => E.finalGrc(base, { m1b: 'low' })));
check('M1 column-floor rule: stacked M1 credits cannot dip below the controlled-area value',
  (() => { const r = E.finalGrc(E.igrc({ dimM: 1, speedMps: 25, density: 4 }), { m1a: 'medium', m1b: 'high' });
           return r.finalGrc === 1 && r.m1Floored === true && /column floor/.test(r.floorNote); })());
check('overall floor: never below 1', E.finalGrc(E.igrc({ dimM: 1, speedMps: 25, controlledGroundArea: true }), { m2: 'high' }).finalGrc === 1);
check('no mitigations = iGRC unchanged', E.finalGrc(base, {}).finalGrc === 6);

// ---- [3] SAIL -----------------------------------------------------------------
check('Table 7 row ≤2: I/II/IV/VI', ['a', 'b', 'c', 'd'].map(a => E.sail(2, a).sail).join(',') === 'I,II,IV,VI');
check('Table 7 row 4: III/III/IV/VI', ['a', 'b', 'c', 'd'].map(a => E.sail(4, a).sail).join(',') === 'III,III,IV,VI');
check('Table 7 row 7: VI everywhere', ['a', 'b', 'c', 'd'].every(a => E.sail(7, a).sail === 'VI'));
check('GRC 1 uses the ≤2 row; ARC-B string forms accepted', E.sail(1, 'ARC-b').sail === 'II');
check('GRC > 7 refuses to Certified', throws(() => E.sail(8, 'a'), /Certified/));
check('unknown ARC refused with the declare-it road home', throws(() => E.sail(3, 'e'), /DECLARE|declare/i));
check('arcInitial() computes from the AEC table (v0.3, single-sourced)', E.arcInitial({ altitude: 'below500', controlled: false, urban: false }).arc === 'ARC-b');
check('arcInitial() flags its own confidence tier honestly', E.arcInitial({ atypical: true }).confidence === 'single-source');
check('arcInitial() covers all 12 AEC rows against Annex C Table 1',
  E.arcInitial({ airportEnv: true, airspaceClassBCD: true }).aec === 1 &&
  E.arcInitial({ altitude: 'above500', tmz: true }).aec === 2 &&
  E.arcInitial({ altitude: 'above500', controlled: true }).aec === 3 &&
  E.arcInitial({ altitude: 'above500', controlled: false, urban: true }).aec === 4 &&
  E.arcInitial({ altitude: 'above500', controlled: false, urban: false }).aec === 5 &&
  E.arcInitial({ airportEnv: true, airspaceClassBCD: false }).aec === 6 &&
  E.arcInitial({ altitude: 'below500', tmz: true }).aec === 7 &&
  E.arcInitial({ altitude: 'below500', controlled: true }).aec === 8 &&
  E.arcInitial({ altitude: 'below500', controlled: false, urban: true }).aec === 9 &&
  E.arcInitial({ altitude: 'below500', controlled: false, urban: false }).aec === 10 &&
  E.arcInitial({ altitude: 'aboveFL600' }).aec === 11 &&
  E.arcInitial({ atypical: true }).aec === 12);
check('arcInitial() still refuses without enough to bind the decision tree', throws(() => E.arcInitial(), /altitude required|input required/));

// ---- [4] adjacent area --------------------------------------------------------
check('3 min at 50 m/s = 9 km', Math.abs(E.adjacentAreaKm(50).km - 9) < 1e-9);
check('slow platform clamps UP to 5 km', E.adjacentAreaKm(10).km === 5);
check('fast platform clamps DOWN to 35 km', E.adjacentAreaKm(300).km === 35);

// ---- [5] OSO register honesty -------------------------------------------------
const osos = E.osoList();
check('all SEVENTEEN OSOs enumerated from the verified Annex E data (#99/#100)',
  osos.enumerated === 17 && osos.complete === true && /Annex E/.test(osos.basis));
check('the consolidated set carries the lineage ids including the anomaly rows',
  ['OSO#01', 'OSO#04', 'OSO#05', 'OSO#13', 'OSO#24'].every(id => osos.osos.some(o => o.id === id)));
const r4 = E.osoRobustness(4);
check('robustness matrix RESOLVES per SAIL (IV spot cells: #01 High, #02 Medium, #04 Low)',
  r4.objectives.find(o => o.id === 'OSO#01').robustness === 'High' &&
  r4.objectives.find(o => o.id === 'OSO#02').robustness === 'Medium' &&
  r4.objectives.find(o => o.id === 'OSO#04').robustness === 'Low');
const r1 = E.osoRobustness('I');
check('below the lowest listed column → None, with the Main-Body-Table-14 road home',
  r1.objectives.find(o => o.id === 'OSO#01').robustness === 'None' &&
  /Table 14/.test(r1.objectives.find(o => o.id === 'OSO#01').criteriaNote));
check('OSO#24 Low is structurally unavailable (printed N/A) and the row says so',
  r1.objectives.find(o => o.id === 'OSO#24').lowUnavailable === true);
check('every objective carries its Annex E citation with page (criteria prose never stored)',
  r4.objectives.every(o => /Annex E/.test(o.cite) && o.page > 0));
check('osoRobustness refuses without a SAIL', throws(() => E.osoRobustness(), /SAIL required/));
check('containment() computes Table 8 (1m UA class, two-source verified)',
  E.containment({ dimM: 1, speedMps: 25, sail: 'I', assemblies: 'gt400k', shelteringApplicable: true }).robustness === 'High' &&
  E.containment({ dimM: 1, speedMps: 25, sail: 'III', assemblies: '40kto400k', shelteringApplicable: true }).robustness === 'Low' &&
  E.containment({ dimM: 1, speedMps: 25, sail: 'VI', assemblies: 'lt40k', shelteringApplicable: true }).robustness === 'Low');
check('containment() flags Table 8 as two-source confidence', E.containment({ dimM: 1, speedMps: 25, sail: 'I', assemblies: 'gt400k', shelteringApplicable: true }).confidence === 'two-source');
check('containment() still REFUSES Tables 9-13 (UA classes above 1m/25m/s)',
  throws(() => E.containment({ dimM: 3, speedMps: 35, sail: 'I', assemblies: 'gt400k', shelteringApplicable: true }), /Tables 9-13|NOT yet sourced/));
check('containment() refuses without the sheltering-applicable declaration', throws(() => E.containment({ dimM: 1, speedMps: 25, sail: 'I', assemblies: 'gt400k' }), /sheltering/i));

// ---- [6] spine discipline -----------------------------------------------------
check('citations ride every computed result',
  /2019\/947/.test(E.igrc({ dimM: 1, speedMps: 20, density: 3 }).basis) &&
  /Table 5/.test(E.finalGrc(base, {}).basis) && /Table 7/.test(E.sail(3, 'a').basis) &&
  /min 5 km/.test(E.adjacentAreaKm(50).basis));
check('micro-UAS shortcut deliberately absent — conservative note present',
  /shortcut NOT applied/.test(E.igrc({ dimM: 0.2, speedMps: 15, density: 400 }).note) &&
  E.igrc({ dimM: 0.2, speedMps: 15, density: 400 }).igrc === 4);
const frozen = { dimM: 3, speedMps: 35, density: 3000 };
const snap = JSON.stringify(frozen);
E.igrc(frozen); check('engine never mutates its inputs', JSON.stringify(frozen) === snap);
const src = S('sora_core.js');
check('no AI, no Date, no random in the deterministic core', !/fetch\(|anthropic|Date\.now|Math\.random/i.test(src));

// ---- [7] wiring ---------------------------------------------------------------
const idx = S('index.html');
check('index.html ships sora_core.js cache-busted with the Annex E data loaded FIRST',
  /sora_core\.js\?v=\d+\.\d/.test(idx) &&
  idx.indexOf('sora_annex_e_data.js') !== -1 && idx.indexOf('sora_annex_e_data.js') < idx.indexOf('sora_core.js?v='));
// 23 Aug 2026 — SUPERSEDED half of this pin: the Prove group moved to the
// horizontal strip, so the nav entry is a render-gated strip pill declared in
// bindings (_WF_STEPS, gateLane 'sora'), not an index.html row. The view stays.
// 23 Aug 2026 (3) — the strip retired the same day; SORA now lives as a
// basis-gated TAB in the Prove area (prove_tabs.js), same render-time rule.
check('the SORA Thread page is wired (Prove tab + view — the inert era ended with #103)',
  idx.indexOf('id="snav-sora-thread"') === -1 && idx.indexOf('view-sora-thread') !== -1 &&
  fs.readFileSync(path.join(__dirname, '..', 'site', 'prove_tabs.js'), 'utf8').indexOf("gateLane: 'sora'") !== -1);
check('the cert-basis spine + router ship (the #101 grounding chain)',
  idx.indexOf('cert_basis_spine.js?v=') !== -1 && idx.indexOf('cert_basis_router.js?v=') !== -1);
check('specific-sora basis present in the wizard bases', /specific-sora/.test(S('bindings_modules.js')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
