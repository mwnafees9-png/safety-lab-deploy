#!/usr/bin/env node
/*
 * Regression — DFT-WARM (task #155): the SPARE gate models warm-standby
 * dormancy and imperfect switching, not just the cold/perfect ideal.
 *
 *   [1] BACK-COMPAT, the whole point: α = 0 and p = 1 reproduce the pre-DFT-WARM
 *       engine BIT-FOR-BIT. Legacy numbers are pinned as literals below. An
 *       engine change that quietly moves every existing tree's figure is not an
 *       improvement, it is a recall.
 *   [2] the physics, against closed forms rather than against itself:
 *         2-unit standby, dormancy α, switch p:
 *           R(t) = e^(−λt) · [ 1 + (p/α)(1 − e^(−λαt)) ]      (α > 0)
 *           R(t) = e^(−λt) · ( 1 + p·λt )                     (α → 0)
 *         3-unit cold, perfect switch:
 *           R(t) = e^(−λt) · ( 1 + λt + (λt)²/2 )
 *       and the two ends of the α range must land on the models they degenerate
 *       to: α = 0 is cold standby, α = 1 is active parallel, 1 − (1 − e^(−λt))².
 *       Same anchors rbd_mc.js is held to — one physics, two engines.
 *   [3] monotonicity: a warmer spare is never safer; a worse switch is never
 *       safer. Direction is checked separately from magnitude because a sign
 *       error passes a loose tolerance.
 *   [4] p = 0 collapses the gate to its primary alone — redundancy behind a
 *       switch that never works is not redundancy.
 *   [5] determinism survives: the switch coins come off the same seeded
 *       mulberry32, so same seed ⇒ same figure (MC-SEED is not weakened).
 *   [6] clamping: junk, negatives and out-of-range values fall back to the
 *       SAFE default (cold / perfect), never to an accidental credit.
 *   [7] receipts: the result object and the result card both say which spare
 *       model produced the number.
 *   [8] the wiring exists — engine work nobody can reach from the UI is dead
 *       code that reads as a shipped feature.
 * Run: node tests/regression_dft_warm.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const src = S('fta_quant_modules.js');
globalThis.esc = s => String(s);
globalThis.ftaConfig = { exposureTime: 1 };
globalThis.ftaPages = [];
globalThis.window = globalThis;
(0, eval)(['fta_engine.js', 'engine_modules.js', 'fta_quant_modules.js'].map(S).join('\n;\n'));
const sim = globalThis.simulateDFT;
check('real simulateDFT loaded', typeof sim === 'function');

const L = (id, lambda) => ({ id, logicalId: 'L' + id, type: 'basic', lambda, children: [] });
const G = (id, gateType, children, extra) => Object.assign({ id, type: 'gate', gateType, children }, extra || {});
const SPARE = (extra) => G(1, 'SPARE', [L(2, 0.5), L(3, 0.5)], extra);

// ---- [1] back-compat: the legacy cold/perfect numbers, pinned ------------------
// Captured from the pre-DFT-WARM engine. These are not "about right" values —
// they are the exact doubles the old code produced, and they must not move.
const LEGACY = {
  'spare2/7': 0.08665, 'spare2/42': 0.08795, 'spare2/99': 0.0919,
  'spare3/7': 0.0077,  'spare3/42': 0.0073,  'spare3/99': 0.00845,
  'mixed/7':  0.08475, 'mixed/42':  0.08645, 'mixed/99': 0.0868,
  'nested/7': 0.0212,  'nested/42': 0.0201,  'nested/99': 0.0217,
};
const legacyTrees = {
  spare2: () => G(1, 'SPARE', [L(2, 0.5), L(3, 0.5)]),
  spare3: () => G(1, 'SPARE', [L(2, 0.4), L(3, 0.4), L(4, 0.4)]),
  mixed:  () => G(1, 'OR', [G(2, 'SPARE', [L(3, 0.3), L(4, 0.3)]), L(5, 0.05)]),
  nested: () => G(1, 'AND', [G(2, 'SPARE', [L(3, 0.6), L(4, 0.6)]), G(5, 'PAND', [L(6, 0.9), L(7, 0.9)])]),
};
let legacyOk = true, legacyDetail = '';
for (const name of Object.keys(legacyTrees)) {
  for (const seed of [7, 42, 99]) {
    const got = sim(legacyTrees[name](), 1, 20000, seed).p;
    const want = LEGACY[name + '/' + seed];
    if (got !== want) { legacyOk = false; legacyDetail += ` ${name}/${seed}: got ${got} want ${want};`; }
  }
}
check('α=0, p=1 reproduces the pre-DFT-WARM engine BIT-FOR-BIT (12 pinned figures)', legacyOk, legacyDetail);

// Explicitly writing the defaults must be indistinguishable from omitting them —
// otherwise every tree re-saved from the new UI would silently drift.
check('explicit defaults (α=0, p=1) === absent properties',
  sim(SPARE({ spareWarmK: 0, spareSwitchP: 1 }), 1, 20000, 7).p === sim(SPARE(), 1, 20000, 7).p);

// ---- [2] the physics, against closed forms -------------------------------------
const lam = 0.5, T = 1, N = 400000;
const R2 = (a, p) => a > 0
  ? Math.exp(-lam * T) * (1 + (p / a) * (1 - Math.exp(-lam * a * T)))
  : Math.exp(-lam * T) * (1 + p * lam * T);
let anchorsOk = true, anchorDetail = '';
for (const [a, p] of [[0, 1], [0, 0.8], [0, 0.5], [0.3, 1], [1, 1], [1, 0.9], [0.5, 0.75], [0.1, 0.95]]) {
  const r = sim(SPARE({ spareWarmK: a, spareSwitchP: p }), T, N, 7);
  const exact = 1 - R2(a, p);
  const sigma = Math.abs(r.p - exact) / r.stderr;
  if (!(sigma < 3)) { anchorsOk = false; anchorDetail += ` α=${a},p=${p}: mc ${r.p.toFixed(6)} vs exact ${exact.toFixed(6)} (${sigma.toFixed(1)}σ);`; }
}
check('2-unit standby matches R(t)=e^(−λt)[1+(p/α)(1−e^(−λαt))] across 8 (α,p) pairs, all <3σ', anchorsOk, anchorDetail);

{
  const r = sim(G(1, 'SPARE', [L(2, lam), L(3, lam), L(4, lam)]), T, N, 7);
  const x = lam * T, exact = 1 - Math.exp(-x) * (1 + x + x * x / 2);
  check('3-unit cold standby matches R(t)=e^(−λt)(1+λt+(λt)²/2)', Math.abs(r.p - exact) / r.stderr < 3,
    'mc ' + r.p.toFixed(6) + ' vs ' + exact.toFixed(6));
}
{
  // α = 1 is not a warm spare at all — it is active parallel, and must land there.
  const r = sim(SPARE({ spareWarmK: 1, spareSwitchP: 1 }), T, N, 7);
  const exact = Math.pow(1 - Math.exp(-lam * T), 2);
  check('α=1 (hot) degenerates to active parallel, 1−(1−e^(−λt))²', Math.abs(r.p - exact) / r.stderr < 3,
    'mc ' + r.p.toFixed(6) + ' vs ' + exact.toFixed(6));
}

// ---- [3] monotonicity — direction, checked apart from magnitude ----------------
const byWarm = [0, 0.25, 0.5, 0.75, 1].map(a => sim(SPARE({ spareWarmK: a }), T, N, 7).p);
check('P(top) rises monotonically with dormancy α (a warmer spare is never safer)',
  byWarm.every((v, i) => i === 0 || v > byWarm[i - 1]), byWarm.map(v => v.toFixed(5)).join(' → '));
const bySwitch = [1, 0.9, 0.75, 0.5, 0.25].map(p => sim(SPARE({ spareSwitchP: p }), T, N, 7).p);
check('P(top) rises monotonically as switch reliability falls (a worse switch is never safer)',
  bySwitch.every((v, i) => i === 0 || v > bySwitch[i - 1]), bySwitch.map(v => v.toFixed(5)).join(' → '));

// ---- [4] p = 0 — redundancy behind a switch that never works -------------------
{
  const r = sim(SPARE({ spareSwitchP: 0 }), T, N, 7);
  const exact = 1 - Math.exp(-lam * T); // the primary, alone
  check('p=0 collapses the gate to its primary alone (1−e^(−λt))', Math.abs(r.p - exact) / r.stderr < 3,
    'mc ' + r.p.toFixed(6) + ' vs ' + exact.toFixed(6));
}

// ---- [5] determinism survives the new random draws ----------------------------
const warmTree = () => SPARE({ spareWarmK: 0.4, spareSwitchP: 0.85 });
const w1 = sim(warmTree(), 1, 20000, 7), w2 = sim(warmTree(), 1, 20000, 7), w3 = sim(warmTree(), 1, 20000, 8);
check('warm + imperfect: same seed ⇒ identical p (bit-for-bit)', w1.p === w2.p && w1.p > 0, 'a=' + w1.p + ' b=' + w2.p);
check('warm + imperfect: different seed ⇒ different p (the coins are real)', w1.p !== w3.p);
check('warm + imperfect: seed still echoed', w1.seed === 7 && w3.seed === 8);
check('switch coins come off the seeded PRNG, not Math.random',
  /switchCoins/.test(src) && src.split('\n').filter(l => l.indexOf('Math.random') >= 0).every(l => /^\s*\/\//.test(l)));

// ---- [6] clamping: junk falls back to the SAFE default -------------------------
const ref = sim(SPARE(), 1, 20000, 7).p;
for (const junk of [{ spareWarmK: -1 }, { spareWarmK: NaN }, { spareWarmK: 'warm' }, { spareWarmK: null },
                    { spareSwitchP: 2 }, { spareSwitchP: NaN }, { spareSwitchP: 'yes' }, { spareSwitchP: null }]) {
  const k = Object.keys(junk)[0];
  check('junk ' + k + '=' + String(junk[k]) + ' falls back to the cold/perfect default',
    sim(SPARE(junk), 1, 20000, 7).p === ref);
}

// ---- [7] receipts --------------------------------------------------------------
{
  // NOTE: every node here needs its own id. The collection walk dedups on
  // node.id (that is how repeated events and shared subtrees are counted once),
  // so reusing the SPARE() helper's id 1 for a child of an id-1 root would make
  // the child invisible to the walk — and the receipt would read 0 for reasons
  // that have nothing to do with the spare model.
  const r = sim(G(20, 'OR', [
    G(21, 'SPARE', [L(22, 0.5), L(23, 0.5)], { spareWarmK: 0.4 }),
    G(9, 'SPARE', [L(10, 0.5), L(11, 0.5)], { spareSwitchP: 0.8 }),
  ]), 1, 20000, 7);
  check('result counts warm spare gates', r.warmSpares === 1, 'got ' + r.warmSpares);
  check('result counts imperfect switches', r.imperfectSwitches === 1, 'got ' + r.imperfectSwitches);
}
{
  const r = sim(SPARE(), 1, 20000, 7);
  check('a plain cold/perfect tree reports zero of each (nothing to disclose)',
    r.warmSpares === 0 && r.imperfectSwitches === 0);
}
check('empty root refusal still carries the receipt fields',
  (() => { const r = sim(null, 1, 100, 5); return r.seed === 5 && r.warmSpares === 0 && r.imperfectSwitches === 0; })());
check('DFT result card discloses the spare model in force',
  /warm spare gate\(s\)/.test(src) && /imperfect switch\(es\)/.test(src) && /\$\{spareNote\}/.test(src));

// ---- [8] the wiring exists ------------------------------------------------------
const idx = S('index.html');
check('index.html: dormancy + switch inputs exist inside a SPARE-only container',
  /id="config-spare-container"/.test(idx) && /id="config-spare-warmk"/.test(idx) && /id="config-spare-switchp"/.test(idx));
check('index.html: the gate-type menu no longer calls SPARE cold-only',
  !/SPARE — Cold spare/.test(idx) && /SPARE — Spare \(cold \/ warm\)/.test(idx));
check('index.html: fta_quant cache buster bumped past 66.9 (the DFT-WARM build)',
  (() => { const m = idx.match(/fta_quant_modules\.js\?v=66\.(\d+)/); return !!m && parseInt(m[1], 10) >= 10; })());
check('selectNode populates the spare panel and hides it for other gate types',
  /config-spare-container/.test(S('fta_view_modules.js')) && /config-spare-warmk/.test(S('fta_view_modules.js')));
check('updateNodeData writes both fields back, clamped to [0,1]',
  /spareWarmK = isFinite\(wk\) \? Math\.min\(1, Math\.max\(0, wk\)\)/.test(S('support_modules.js')) &&
  /spareSwitchP = isFinite\(sp\) \? Math\.min\(1, Math\.max\(0, sp\)\)/.test(S('support_modules.js')));
check('changeNodeType seeds the cold/perfect defaults and toggles the panel',
  /val === 'SPARE'/.test(S('safety_lab.js')) && /config-spare-container/.test(S('safety_lab.js')));
check('transfer-out carries the spare model with the gate',
  /spareWarmK: sourceGate\.spareWarmK/.test(S('support_modules.js')));
check('repeated-event sync covers the spare model (one physical arrangement, one α)',
  /'spareWarmK', 'spareSwitchP'/.test(S('bindings_modules.js')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
