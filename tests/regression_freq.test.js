#!/usr/bin/env node
/*
 * Regression — fta_freq.js v1.0 (ARP-G12 failure frequency).
 *
 * Loads the REAL BDD engine (engine_modules.js), the REAL quant lane
 * (fta_quant_modules.js) and the REAL fta_freq.js in ONE shared eval scope
 * (the c1_polish harness pattern), then locks the math to closed forms:
 *   [1] 2-event AND:  w = q₂·λ₁(1−q₁) + q₁·λ₂(1−q₂)      (IB₁=q₂, IB₂=q₁)
 *   [2] 2-event OR:   w = (1−q₂)·λ₁(1−q₁) + (1−q₁)·λ₂(1−q₂)
 *   [3] per-model w:  repairable λμ/(λ+μ) · periodic λ(1−q̄) · both exact
 *   [4] honest classes: enabler (P-only, w=0 but still conditions IB) ·
 *       supplier (typed w + basis carried; missing basis called out) ·
 *       markov-refused (loud flag, never a guessed rate) ·
 *       CCF group rows → stated LOWER BOUND
 *   [5] plumbing: N/flight = w·T, shares sum to 1 and sort desc, refusals
 *       are named, sweep() walks ftaPages with FHA severity, page wiring.
 *   [6] LANE DISCIPLINE: frequency computes on VERIFICATION trees only
 *       (p.verifies || mode 'bottom-up' — the house test). Top-down
 *       allocation trees carry probability budgets with λ stripped by
 *       design; they are listed with a NAMED skip (pointing at the
 *       verification mirror when one exists), never computed as a wall of
 *       w=0 "enablers".
 *
 * Run:  node tests/regression_freq.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const approx = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-12);
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

// ---- shared-scope load (c1_polish pattern) ----------------------------------
globalThis.window = globalThis;
globalThis.esc = s => String(s);
globalThis.ftaConfig = { exposureTime: 2.5 };          // T for N/flight
globalThis.ftaPages = [];
globalThis.acFhaData = [];
globalThis.systemsData = [];
globalThis.flightPhasesData = [];
globalThis.getAllSysFha = () => [];
(0, eval)(['engine_modules.js', 'fta_quant_modules.js', 'fta_freq.js']
  .map(f => S(f)).join('\n;\n'));
const F = globalThis.FTA_FREQ;
check('FTA_FREQ API exported (computeFrequency + sweep + render)',
  F && typeof F.computeFrequency === 'function' && typeof F.sweep === 'function' && typeof F.render === 'function');

// helper: basic event
let _id = 100;
const BE = o => Object.assign({ id: ++_id, type: 'basic', children: [] }, o);
const GATE = (t, kids) => ({ id: ++_id, type: 'gate', gateType: t, children: kids });

// ---- [1] 2-event AND closed form --------------------------------------------
console.log('\n[1] 2-event AND — w = q₂·λ₁(1−q₁) + q₁·λ₂(1−q₂)');
const q1 = 1e-3, l1 = 2e-4, q2 = 5e-4, l2 = 7e-5;
const rAnd = F.computeFrequency(GATE('AND', [
  BE({ name: 'A', probability: q1, lambda: l1 }),
  BE({ name: 'B', probability: q2, lambda: l2 })]));
check('ok + Q(top) = q₁q₂ exact', rAnd.ok && approx(rAnd.pTop, q1 * q2));
const wAndExpect = q2 * l1 * (1 - q1) + q1 * l2 * (1 - q2);
check('w(top) matches the closed form to 1e-15', approx(rAnd.wTop, wAndExpect, 1e-15), 'got ' + rAnd.wTop + ' want ' + wAndExpect);
check('exact Birnbaums surfaced per row (IB₁=q₂, IB₂=q₁)',
  rAnd.rows.some(r => r.name === 'A' && approx(r.IB, q2)) && rAnd.rows.some(r => r.name === 'B' && approx(r.IB, q1)));
check('both rows classed initiator with the λ(1−q) receipt',
  rAnd.rows.every(r => r.cls === 'initiator' && /λ\(1−q\)/.test(r.note)));
check('N per flight = w·T (T from ftaConfig, here 2.5 FH)', approx(rAnd.nPerFlight, rAnd.wTop * 2.5, 1e-18) && rAnd.T === 2.5);

// ---- [2] 2-event OR closed form ---------------------------------------------
console.log('\n[2] 2-event OR — w = (1−q₂)·λ₁(1−q₁) + (1−q₁)·λ₂(1−q₂)');
const rOr = F.computeFrequency(GATE('OR', [
  BE({ name: 'A', probability: q1, lambda: l1 }),
  BE({ name: 'B', probability: q2, lambda: l2 })]));
const wOrExpect = (1 - q2) * l1 * (1 - q1) + (1 - q1) * l2 * (1 - q2);
check('ok + Q(top) = q₁+q₂−q₁q₂ exact', rOr.ok && approx(rOr.pTop, q1 + q2 - q1 * q2));
check('w(top) matches the closed form to 1e-15', approx(rOr.wTop, wOrExpect, 1e-15), 'got ' + rOr.wTop + ' want ' + wOrExpect);
check('shares sum to 1 and rows sort by contribution desc',
  approx(rOr.rows.reduce((s, r) => s + r.share, 0), 1, 1e-12) &&
  rOr.rows.every((r, i) => i === 0 || rOr.rows[i - 1].contrib >= r.contrib));

// ---- [3] per-model w ---------------------------------------------------------
console.log('\n[3] repair models — the SAME per-model w the engine\'s own q lane implies');
const lam = 4e-3, mu = 0.2, qr = 1e-2;
const rRep = F.computeFrequency(GATE('OR', [
  BE({ name: 'R', probability: qr, lambda: lam, repairModel: 'continuous', mu: mu }),
  BE({ name: 'P', probability: qr, lambda: lam, repairModel: 'periodic' })]));
const rowR = rRep.rows.find(r => r.name === 'R'), rowP = rRep.rows.find(r => r.name === 'P');
check('continuous repair: cls repairable, w = λμ/(λ+μ) exact',
  rowR.cls === 'repairable' && approx(rowR.w, lam * mu / (lam + mu), 1e-18) && /λμ\/\(λ\+μ\)/.test(rowR.note));
check('periodic inspection: cls periodic, w = λ(1−q̄) with q̄ from the engine map',
  rowP.cls === 'periodic' && approx(rowP.w, lam * (1 - qr), 1e-18) && /q̄/.test(rowP.note));

// ---- [4] honest classes ------------------------------------------------------
console.log('\n[4] enabler / supplier / markov-refused / CCF lower bound');
const qe = 0.3;
const rEn = F.computeFrequency(GATE('AND', [
  BE({ name: 'INIT', probability: q1, lambda: l1 }),
  BE({ name: 'EN', probability: qe })]));                       // no λ → enabler
const rowEn = rEn.rows.find(r => r.name === 'EN');
check('P-only event → enabler: w = 0, named, counted',
  rowEn.cls === 'enabler' && rowEn.w === 0 && /enabler/.test(rowEn.note) && rEn.flags.enablers === 1);
check('…but it still CONDITIONS the initiator (w_top = q_EN·λ(1−q))',
  approx(rEn.wTop, qe * l1 * (1 - q1), 1e-15), 'got ' + rEn.wTop);

const wSup = 3.3e-6;
const rSup = F.computeFrequency(GATE('OR', [
  BE({ name: 'SUP', probability: q1, supplierW: wSup, supplierWBasis: 'Supplier FTA rev C, §4.2' }),
  BE({ name: 'SUP2', probability: q2, supplierW: wSup })]));
const rowS = rSup.rows.find(r => r.name === 'SUP'), rowS2 = rSup.rows.find(r => r.name === 'SUP2');
check('supplier frequency enters typed, basis carried in the receipt',
  rowS.cls === 'supplier' && rowS.w === wSup && /rev C/.test(rowS.note) && rSup.flags.suppliers === 2);
check('missing basis is CALLED OUT, never silently accepted', /NO BASIS CITED/.test(rowS2.note));

const rMk = F.computeFrequency(GATE('OR', [
  BE({ name: 'MK', probability: q1, lambda: l1, markovModelId: 'm1' }),
  BE({ name: 'B', probability: q2, lambda: l2 })]));
const rowM = rMk.rows.find(r => r.name === 'MK');
check('Markov-attached event REFUSED loudly (w=0 + flag), not guessed',
  rowM.cls === 'markov-refused' && rowM.w === 0 && /REFUSED/.test(rowM.note) && rMk.flags.markovRefused === 1);
check('the other event still contributes (refusal is per-event, not per-tree)',
  approx(rMk.wTop, (1 - q1) * l2 * (1 - q2), 1e-15));

const rCcf = F.computeFrequency(GATE('AND', [
  BE({ name: 'C1', probability: qr, lambda: lam, ccfGroup: 'G1', beta: 0.1 }),
  BE({ name: 'C2', probability: qr, lambda: lam, ccfGroup: 'G1', beta: 0.1 })]));
check('CCF group rows present and classed, figure flagged LOWER BOUND',
  rCcf.ok && rCcf.lowerBound === true && rCcf.flags.ccfGroups >= 1 &&
  rCcf.rows.some(r => r.cls === 'ccf-group' && /LOWER BOUND/.test(r.note)));

// ---- [5] refusals + sweep + wiring ------------------------------------------
console.log('\n[5] refusals, sweep, page wiring');
check('empty tree → named refusal, never a zero', F.computeFrequency(null).ok === false && /empty tree/.test(F.computeFrequency(null).reason));
globalThis.acFhaData = [{ internalId: 'FC9', fcId: 'FC-009', severity: 'Catastrophic' }];
globalThis.ftaPages = [
  { id: 'p1', name: 'Cat tree (verif)', mode: 'bottom-up', linkedFhaIds: ['FC9'], root: GATE('OR', [BE({ name: 'X', probability: q1, lambda: l1 })]) },
  { id: 'p2', name: 'empty page', root: null }];
const sw = F.sweep();
check('sweep walks ftaPages (null roots skipped) and carries FHA severity',
  sw.length === 1 && sw[0].pageId === 'p1' && sw[0].severity === 'Catastrophic' && sw[0].res.ok && sw[0].res.wTop > 0);

// ---- [6] lane discipline: allocation vs verification trees ------------------
console.log('\n[6] allocation trees are SKIPPED BY NAME, never computed as enabler walls');
globalThis.ftaPages = [
  // allocation tree WITH a verification mirror
  { id: 'a1', name: 'PASA · Loss of pitch', mode: 'top-down',
    root: GATE('OR', [BE({ name: 'budget', probability: q1 })]) },
  { id: 'v1', name: 'Pitch verification tree', verifies: 'a1',
    root: GATE('OR', [BE({ name: 'X', probability: q1, lambda: l1 })]) },
  // allocation tree with NO mirror yet (default mode = top-down, the house default)
  { id: 'a2', name: 'PASA · Erroneous thrust',
    root: GATE('OR', [BE({ name: 'budget2', probability: q2 })]) }];
const sw2 = F.sweep();
const rA1 = sw2.find(t => t.pageId === 'a1'), rV1 = sw2.find(t => t.pageId === 'v1'), rA2 = sw2.find(t => t.pageId === 'a2');
check('allocation tree listed but NOT computed — named skip, allocation flag set',
  rA1 && rA1.res.ok === false && rA1.res.allocation === true && rA1.verification === false &&
  /top-down allocation/.test(rA1.res.reason) && /allocator strips λ by design/.test(rA1.res.reason));
check('the skip POINTS AT the verification mirror by name', /see Pitch verification tree/.test(rA1.res.reason));
check('no mirror yet → the skip says so instead of inventing one', rA2 && rA2.res.allocation === true && /no verification mirror yet/.test(rA2.res.reason));
check('mirror page (p.verifies) IS computed — same house test as helpers',
  rV1 && rV1.verification === true && rV1.res.ok && approx(rV1.res.wTop, l1 * (1 - q1) * 1, 1e-15));
check('a bare page defaults to top-down (the house default) — never silently computed', rA2.verification === false);

const src = S('fta_freq.js');
check('render distinguishes ALLOCATION (quiet) from REFUSED (loud)',
  /ALLOCATION — no frequency lane/.test(src) && /REFUSED/.test(src));
check('born-modular page: view-freq + snav-freq + wrapped switchTab, zero index surgery',
  /view-freq/.test(src) && /snav-freq/.test(src) && /_freqWrapped/.test(src) && /switchTab\('freq'\)/.test(src));
check('module never writes a store (display-lane discipline)',
  !/ftaPages\s*=[^=]|acFhaData\s*=[^=]|\.push\(/.test(src.replace(/out\.push|rows\.push/g, '')));
check('index.html loads fta_freq.js', /fta_freq\.js\?v=/.test(S('index.html')));
check('the w formulae stated in the header match what ships',
  /w_top = Σ_i {2}IB_i · w_i/.test(src) && /λ·μ\/\(λ\+μ\)/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
