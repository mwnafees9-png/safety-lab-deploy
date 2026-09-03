#!/usr/bin/env node
/*
 * Regression — the CCMR pair-trace batch (Waqas's rulings, recorded in
 * HANDOFF §1b "CCMR τ vs the NTE bound"):
 *
 *  · 3 Aug: the not-to-exceed bound belongs to a probabilistic SAFETY
 *    requirement (fha-prob, ORIGINAL wording — NO new requirement text; a
 *    dwell-time imperative has no testability); τ is a MAINTAINABILITY
 *    requirement (fta-interval). The maintainability req IMPLEMENTS/VERIFIES
 *    the safety req — cross-traced both ways like the monitor split
 *    (context + rationale + fingerprint; generator keys untouched so the
 *    orphan sweep coverage is unchanged). τ > NTE = a trace-level conflict
 *    between the two rows, never a rewrite of either number.
 *  · 4 Aug (this build's three calls): INV-46 gating severity = ADVISORY;
 *    preview-only governing fha-prob = TRACE ANYWAY + name the gap, register
 *    state in the fingerprint so acceptance self-heals the caveat; App I
 *    §I.3.3.2 interval↔rate equivalence receipt FOLDED IN (rationale-only,
 *    fires when the event also appears in a Markov model).
 *
 * Everything is EXECUTED against the real extracted generator code, with
 * stores seeded through a `let` prelude in the vm's global lexical scope —
 * NOT sandbox properties — per the 3 Aug bare-identifier lesson (a11).
 *
 * Run: node tests/regression_ccmr_pairtrace.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const am = fs.readFileSync(path.join(SITE, 'assurance_modules.js'), 'utf8');
const help = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

// ---- [1] source wiring ------------------------------------------------------
console.log('\n[pairtrace] source wiring');
check('the latent sweep rows carry lid (mirror-survivor join) and verifies (allocation-page pointer)',
  /lid: \(n\.logicalId != null \? n\.logicalId : n\.id\),\s*\n\s*verifies: page\.verifies \|\| null,/.test(help));
check('the generator\'s sweep lookup is MIRROR-AWARE (NTE lives on the verification tree)',
  /r\.pageId !== page\.id && r\.verifies !== page\.id/.test(am) &&
  /r\.lid != null && r\.lid === lid/.test(am));
check('both fta-interval branches carry the governing cross-trace in context',
  (am.match(/governedBy: gov\.sourceId/g) || []).length >= 1 &&
  (am.match(/Object\.assign\(\{ repairModel: '(periodic|monitored)'[^}]*\}, govCtx \|\| \{\}\)/g) || []).length === 2);
check('the monitor split is untouched: pairsWith + its own sourceId survive',
  /pairsWith: `\$\{scopeKey\}:fta-interval:\$\{lid\}`/.test(am) &&
  /fta-interval-monitor:\$\{lid\}/.test(am));
check('NO new requirement text: the three text templates are byte-identical to the pre-batch forms',
  am.includes('shall be tested for undetected failure at intervals not exceeding ${node.tau} hours.') &&
  am.includes('shall provide continuous failure monitoring achieving a mean repair rate of at least ${(+node.mu).toExponential(2)} per hour.') &&
  am.includes('shall not exceed ${pFc.toExponential(2)} per flight.'),
  'the 3 Aug refinement: the safety requirement keeps its ORIGINAL probabilistic wording; τ stays authored');
check('the App I receipt cites §I.3.3.2 by clause number AND title, no SAE prose',
  am.includes('ARP4761A App I §I.3.3.2, "The Relationship Between TSF and Periodic Inspection/Repair Times"') &&
  !/could be scheduled and transition/.test(am),
  'SAE copyright posture: clause numbers + titles only');
const pinOf = re => parseFloat((idx.match(re) || [])[1]);
check('index.html floors: helpers ≥ 2.26, assurance ≥ 1.18 (floors from birth — §7.3)',
  pinOf(/helpers_modules\.js\?v=([0-9.]+)/) >= 2.26 && pinOf(/assurance_modules\.js\?v=([0-9.]+)/) >= 1.18);

// ---- harness ---------------------------------------------------------------
// Extract the real code; seed stores via a `let` PRELUDE in the global lexical
// scope (bare identifiers, off-window) — the browser's actual scoping.
const X = re => { const m = am.match(re); if (!m) throw new Error('extraction failed: ' + re); return m[0]; };
const srcGovFha  = X(/function _governingFhaForPage\(page\)\{[\s\S]*?\n    \}/);
const srcGovAcc  = X(/function _govSafetyAccepted\(gov\)\{[\s\S]*?\n    \}/);
const srcFtaGen  = X(/function genFTAEvents\(scopeKey\)\{[\s\S]*?\n        return out;\n    \}/);
const srcFhaGen  = X(/function genFHA\(fhaArr, scopeKey\)\{[\s\S]*?\n        return out;\n    \}/);
const srcGroup   = X(/function _groupFhaByFcId\(fhaArr\) \{[\s\S]*?\n    \}/);
const srcCanon   = X(/function _canonicalizeFhaGroup\(members\) \{[\s\S]*?\n    \}/);
const srcMid     = X(/function _midSentence\(s\) \{[\s\S]*?\n    \}/);
const srcInv46   = X(/\/\/ -+ INV-46[\s\S]*?\}\)\(25\);\s*\n    \}/);
const srcScopeKey = X(/function _pageScopeKey\(page\)\{[\s\S]*?\n    \}/);
const srcInScope  = X(/function pageInScope\(page, scope\)\{[^\n]*\}/);
const srcWalkScope= X(/function walkPagesInScope\(scope, cb\)\{[\s\S]*?\n    \}/);
// 20 Aug 2026 — same breakage as regression_req_bucketing: genFTAEvents moved to the
// node-level walk when A2 shipped (66.36) and this harness no longer supplied what it
// calls, so the suite threw on load and ship.sh counted it as a pass for a day.
const srcXfer      = X(/function _transferTargetPage\(node\)\{[\s\S]*?\n    \}/);
const srcOwnerCtx  = X(/function _ownerCtx\(page\)\{[\s\S]*?\n    \}/);
const srcSysExists = X(/function _systemExists\(sysId\)\{[\s\S]*?\n    \}/);
const srcNodeScope = X(/function _nodeScopeKey\(node, page, ctx\)\{[\s\S]*?\n    \}/);
const srcAllocPgs  = X(/function _allocationPages\(\)\{[\s\S]*?\n    \}/);
const srcWalkNodes = X(/function walkNodesInScope\(scope, cb\)\{[\s\S]*?\n    \}/);

function world(opts) {
  opts = opts || {};
  const invHolder = {};
  const sb = {
    console, JSON, Math, Date, Set, Map, Array, Object, String, Number, isFinite, parseFloat, setTimeout,
    window: Object.assign({ invRegister: d => { invHolder.def = d; } }, opts.windowExtras || {}),
    __fixSweep: opts.sweep || [],
    __fixTarget: opts.target || { prob: 1e-9, dal: 'A', scope: 'AC 25.1309-1B §17(d)' },
    __out: {}, __inv: invHolder
  };
  vm.createContext(sb);
  const prelude = `
    let ftaPages = ${JSON.stringify(opts.pages || [])};
    let acFhaData = ${JSON.stringify(opts.acFha || [])};
    let systemsData = ${JSON.stringify(opts.systems || [])};
    let acFunctionsData = [];
    let acReqData = ${JSON.stringify(opts.acReq || [])};
    const SEVERITY_RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1, 'No Effect': 0 };
    const SEV_ORDER = SEVERITY_RANK;
    function walkAllPages(cb){ ftaPages.forEach(page => { (function w(n){ if(!n) return; cb(n, page); (n.children || n._children || []).forEach(w); })(page.root); }); }
    // Phase 66.27 — genFTAEvents/genFHA now walk pages FILTERED BY SCOPE. These are the
    // REAL implementations, extracted from assurance_modules.js below rather than stubbed,
    // so a change to the attribution rule shows up here instead of being masked by a
    // convenient local copy (the 18 Aug lesson: a stubbed dependency changes the answer
    // instead of raising).
    function getPhaseExposureRatio(){ return { ratio: 1, exposedHours: 0, totalHours: 6.33, matchedPhases: [] }; }
    function getSafetyTarget(){ return __fixTarget; }
    function getNormalizedSafetyTarget(){ return Object.assign({ matchedPhases: [], exposureRatio: 1, exposedHours: 0, totalHours: 6.33, phaseActiveProb: null, missionProb: null }, __fixTarget); }
    function storeForScope(scope){ if (scope === 'ac') return acReqData; const s = systemsData.find(x => 'sys-' + x.id === scope); return s ? s.req : null; }
    function ccmrLatentSweep(){ return __fixSweep; }
    function certBasisForChart(){ return { regulation: 'Part 25', acRef: 'AC 25.1309-1B', part23Class: '' }; }
    function decideAnalysisDepth(){ return { mode: 'qual-quant', clause: '17(d)' }; }
    function findLinkedSysFhaForAcFc(){ return null; }
    function findAcFhaForSysFc(){ return null; }
    function moreRestrictiveSev(a){ return a; }
    function _missionHoursForNormalization(){ return 6.33; }
    ${opts.markov ? 'function getMarkovModel(id){ return __fixMarkov[id] || null; }\nfunction getEffectiveLambda(){ return ' + (opts.lambda || 0) + '; }' : ''}
    const fp = (...a) => a.map(x => JSON.stringify(x)).join('|');
  `;
  if (opts.markov) sb.__fixMarkov = opts.markov;
  vm.runInContext(prelude + '\n' + srcScopeKey + '\n' + srcInScope + '\n' + srcWalkScope +
    '\n' + srcXfer + '\n' + srcOwnerCtx + '\n' + srcSysExists + '\n' + srcNodeScope +
    '\n' + srcAllocPgs + '\n' + srcWalkNodes +
    '\n' + srcMid + '\n' + srcGroup + '\n' + srcCanon + '\n' + srcGovFha + '\n' + srcGovAcc + '\n' + srcFtaGen + '\n' + srcFhaGen +
    '\n;__out.fta = () => genFTAEvents("ac"); __out.fha = () => genFHA(acFhaData, "ac");' +
    (opts.inv ? '\n' + srcInv46 : ''), sb);
  return sb;
}

const FHA_ROW = { internalId: 11, fcId: 'SF-77-TL', fcDesc: 'Total loss of pitch control', severity: 'Catastrophic', phases: '' };
const PAGES = tail => [
  { id: 'pg-a', name: 'Pitch tree', linkedFhaIds: [11],
    root: Object.assign({ id: 1, logicalId: 501, type: 'basic', name: 'FCC pitch lane latent fault', displayId: 'BE-1', probability: '1e-5' }, tail) },
  { id: 'pg-v', name: 'Pitch tree (Verification)', verifies: 'pg-a', linkedFhaIds: [11],
    root: { id: 2, logicalId: 501, type: 'basic', name: 'FCC pitch lane latent fault', displayId: 'BE-1', probability: '0' } }
];
// Allocation row FIRST — proves the lookup prefers the mirror row that carries the bound.
const SWEEP = [
  { pageId: 'pg-a', verifies: null,   lid: 501, event: 'BE-1', nte: null, exceeds: false, severity: 'Catastrophic', lambda: 0,    interval: 500, detection: 'periodic test', fcId: 'SF-77-TL', system: 'Aircraft', note: 'allocation tree — bounded at verification', verification: false },
  { pageId: 'pg-v', verifies: 'pg-a', lid: 501, event: 'BE-1', nte: 320,  exceeds: true,  severity: 'Catastrophic', lambda: 2e-5, interval: 500, detection: 'periodic test', fcId: 'SF-77-TL', system: 'Aircraft', note: '', verification: true }
];
const ACCEPTED = [{ internalId: 900, reqSource: { sourceId: 'ac:fha:prob:11', generator: 'fha-prob', fingerprint: 'x' } }];
const intervalOf = out => out.find(r => r.reqSource.sourceId === 'ac:fta-interval:501');

// ---- [2] forward trace, accepted pair (world A) -----------------------------
console.log('\n[pairtrace] forward trace — governing safety req ACCEPTED');
const A = world({ pages: PAGES({ repairModel: 'periodic', tau: 500 }), acFha: [FHA_ROW], acReq: ACCEPTED, sweep: SWEEP });
const aOut = A.__out.fta(); const aInt = intervalOf(aOut);
check('the periodic interval requirement is emitted with its original single-shall text',
  !!aInt && aInt.text === 'FCC pitch lane latent fault shall be tested for undetected failure at intervals not exceeding 500 hours.', aInt && aInt.text);
check('context carries the cross-trace: governedBy = the derived fha-prob sourceId',
  aInt.reqSource.context.governedBy === 'ac:fha:prob:11' &&
  aInt.reqSource.context.governingFcId === 'SF-77-TL' &&
  aInt.reqSource.context.governingSeverity === 'Catastrophic');
check('the rationale names the governing safety requirement, both-ways style',
  aInt.rat.includes('Implements and verifies the governing probabilistic safety requirement for SF-77-TL (Catastrophic) — ac:fha:prob:11'));
check('ACCEPTED pair: no preview caveat, context.governingAccepted true',
  aInt.reqSource.context.governingAccepted === true && !aInt.rat.includes('not yet in the register'));
check('the CCMR CONFLICT rationale fires from the MIRROR row (allocation row alone has no bound)',
  aInt.rat.includes('CCMR CONFLICT') && aInt.rat.includes('320'),
  'before this build the lookup only saw the allocation page\'s own row, whose nte is always null');
check('the fingerprint carries the governing link and register state',
  aInt.reqSource.fingerprint.includes('ac:fha:prob:11') && aInt.reqSource.fingerprint.includes('gov-accepted'));

// ---- [3] preview-only governing req (world B — the 4 Aug behavior call) ----
console.log('\n[pairtrace] forward trace — governing safety req PREVIEW-ONLY (HL-1 today: 0 of 30 accepted)');
const B = world({ pages: PAGES({ repairModel: 'periodic', tau: 500 }), acFha: [FHA_ROW], acReq: [], sweep: SWEEP });
const bInt = intervalOf(B.__out.fta());
check('the trace is STILL emitted against the derived sourceId (the FHA row is the anchor)',
  bInt.reqSource.context.governedBy === 'ac:fha:prob:11');
check('…and the rationale names the gap and the remedy',
  bInt.rat.includes('not yet in the register (fha-prob preview only)') &&
  bInt.rat.includes('run AutoReq with the FHA generator'));
check('register state rides the fingerprint: accepting the safety req re-flags the pair (self-heal)',
  bInt.reqSource.fingerprint.includes('gov-preview') &&
  bInt.reqSource.fingerprint !== aInt.reqSource.fingerprint);

// ---- [4] monitored branch + unlinked page ----------------------------------
console.log('\n[pairtrace] monitored branch + unlinked page');
const C = world({ pages: PAGES({ repairModel: 'monitored', mu: 2e-3 }), acFha: [FHA_ROW], acReq: ACCEPTED, sweep: [] });
const cInt = intervalOf(C.__out.fta());
check('the monitored-repair requirement carries the same cross-trace',
  !!cInt && cInt.reqSource.context.governedBy === 'ac:fha:prob:11' &&
  cInt.rat.includes('Implements and verifies the governing probabilistic safety requirement') &&
  cInt.reqSource.fingerprint.includes('gov-accepted'));
const E = world({ pages: [{ id: 'pg-x', name: 'Unlinked', root: { id: 3, logicalId: 601, type: 'basic', name: 'Orphan latent', probability: '1e-5', repairModel: 'periodic', tau: 400 } }], acFha: [FHA_ROW], acReq: [], sweep: [] });
const eInt = E.__out.fta().find(r => r.reqSource.sourceId === 'ac:fta-interval:601');
check('a page with NO linked FHA emits the interval req with no phantom trace',
  !!eInt && eInt.reqSource.context.governedBy === undefined && !eInt.rat.includes('governing probabilistic safety requirement'));

// ---- [5] App I §I.3.3.2 receipt (fold-in ruled 4 Aug) -----------------------
console.log('\n[pairtrace] App I §I.3.3.2 interval↔rate equivalence receipt');
const MKV = { 'mkv-1': { id: 'mkv-1', name: 'Pitch FCC pair', states: [{ name: 'Working', isFailed: false }, { name: 'Failed', isFailed: true }], transitions: [{ from: 'Working', to: 'Failed', rate: 1e-4 }, { from: 'Failed', to: 'Working', rate: 2e-3 }] } };
const D = world({ pages: PAGES({ repairModel: 'periodic', tau: 500, markovModelId: 'mkv-1' }), acFha: [FHA_ROW], acReq: ACCEPTED, sweep: [], markov: MKV, lambda: 1e-4 });
const dInt = intervalOf(D.__out.fta());
// Independent math: T_TSF = τ/(1 − e^(−λτ)) − 1/λ  (λ=1e-4, τ=500 → ≈252 h), μ_eq = 1/T_TSF.
const tsf = 500 / (1 - Math.exp(-1e-4 * 500)) - 1 / 1e-4;
check('the receipt appears with the EXACT dwell (not the τ/2 shortcut) — independently recomputed here',
  dInt.rat.includes('§I.3.3.2') && dInt.rat.includes((+tsf).toPrecision(3) + ' h') && Math.abs(tsf - 252.08) < 0.1,
  'rat: ' + dInt.rat.slice(dInt.rat.indexOf('Interval↔rate')));
check('…and the equivalent continuous repair rate μ_eq = 1/T_TSF (§I.3.3.3 form)',
  dInt.rat.includes((1 / tsf).toExponential(2) + '/h'));
check('…and names the model\'s actual repair transition so the two lanes reconcile',
  dInt.rat.includes('Markov model "Pitch FCC pair"') && dInt.rat.includes('Failed→Working @ 2.00e-3/h') &&
  dInt.rat.includes('must tell one story'));
check('the receipt rides the fingerprint (model edits re-stale the pair)',
  dInt.reqSource.fingerprint.includes('appI') && dInt.reqSource.fingerprint.includes('mkv-1'));
check('no Markov link → no receipt (world A is receipt-free)', !aInt.rat.includes('§I.3.3.2'));
const D2 = world({ pages: PAGES({ repairModel: 'periodic', tau: 500, markovModelId: 'mkv-2' }), acFha: [FHA_ROW], acReq: [], sweep: [],
  markov: { 'mkv-2': { id: 'mkv-2', name: 'No-repair model', states: [{ name: 'Up', isFailed: false }, { name: 'Down', isFailed: true }], transitions: [{ from: 'Up', to: 'Down', rate: 1e-4 }] } }, lambda: 1e-4 });
check('a model with NO repair transition gets told to add one at μ_eq, not silently passed',
  intervalOf(D2.__out.fta()).rat.includes('declares no repair transition out of a failed state'));

// ---- [6] reverse trace on the safety requirement ---------------------------
console.log('\n[pairtrace] reverse trace — fha-prob names its implementing maintenance reqs');
const F = world({ pages: PAGES({ repairModel: 'periodic', tau: 500 }), acFha: [FHA_ROW], acReq: [], sweep: [] });
const fProb = F.__out.fha().find(r => r.reqSource && r.reqSource.generator === 'fha-prob');
check('the safety requirement text is UNTOUCHED — original probabilistic form, one shall',
  !!fProb && /^The probability of total loss of pitch control shall not exceed \S+ per flight\.$/.test(fProb.text), fProb && fProb.text);
check('context.implementedBy lists the interval sourceId; rationale cross-refs it + INV-46',
  JSON.stringify(fProb.reqSource.context.implementedBy) === '["ac:fta-interval:501"]' &&
  fProb.rat.includes('Implemented and verified by the repair-credit maintenance requirement(s) ac:fta-interval:501') &&
  fProb.rat.includes('INV-46'));
check('…and the pair tokens ride the fingerprint', fProb.reqSource.fingerprint.includes('"impl"'));
const G = world({ pages: [], acFha: [FHA_ROW], acReq: [], sweep: [] });
const gProb = G.__out.fha().find(r => r.reqSource && r.reqSource.generator === 'fha-prob');
check('NO repair-credit events → empty implementedBy, no rationale line, and — the churn pin — a fingerprint IDENTICAL to the pre-batch form',
  gProb.reqSource.context.implementedBy.length === 0 && !gProb.rat.includes('Implemented and verified') &&
  !gProb.reqSource.fingerprint.includes('"impl"'),
  'projects without repair models (every current demo) must see ZERO fha-prob re-stale churn from this batch');

// ---- [7] INV-46, executed (advisory — his 4 Aug call) ----------------------
console.log('\n[pairtrace] INV-46 trace-level conflict, executed');
const I = world({ pages: PAGES({ repairModel: 'periodic', tau: 500 }), acFha: [FHA_ROW], acReq: [], sweep: SWEEP.concat([
  { pageId: 'pg-v', verifies: 'pg-a', lid: 502, event: 'BE-2', nte: 900, exceeds: false, severity: 'Hazardous', lambda: 1e-5, interval: 400, detection: 'periodic test', fcId: 'SF-78-PL', system: 'Aircraft', note: '', verification: true }
]), inv: true });
const inv = I.__inv.def;
check('registers as INV-46, ADVISORY (ruling: the CCMR page + rationale already shout; nothing blocks)',
  !!inv && inv.id === 'INV-46' && inv.sev === 'advisory');
const r1 = inv.run();
check('checked = rows with a computed bound; the exceedance and ONLY it fails',
  r1.checked === 2 && r1.fails.length === 1, JSON.stringify(r1));
check('the finding is a PAIR-STATE report: both rows named, both preview gaps called out',
  r1.fails[0].includes('BE-1') && r1.fails[0].includes('exceeds the CCMR not-to-exceed bound 320') &&
  r1.fails[0].includes('maintainability requirement not yet in the register') &&
  r1.fails[0].includes('derived only — fha-prob preview (ac:fha:prob:11)'));
check('…and closes with the never-rewrite doctrine', r1.fails[0].includes('never rewrite the safety target'));
const I2 = world({ pages: PAGES({ repairModel: 'periodic', tau: 500 }), acFha: [FHA_ROW],
  acReq: ACCEPTED.concat([{ internalId: 901, reqSource: { sourceId: 'ac:fta-interval:501', generator: 'fta-interval', fingerprint: 'y' } }]),
  sweep: SWEEP, inv: true });
const r2 = I2.__inv.def.run();
check('with BOTH rows accepted the finding names them as in-register (a true row-pair conflict)',
  r2.fails.length === 1 && r2.fails[0].includes('ac:fta-interval:501 in the register') &&
  r2.fails[0].includes('ac:fha:prob:11 in the register'));
const I3 = world({ pages: [], acFha: [], acReq: [], sweep: [], inv: true });
check('an empty world checks 0 and fails 0 — no phantom findings', (() => { const r = I3.__inv.def.run(); return r.checked === 0 && r.fails.length === 0; })());
check('registration retries because assurance_modules loads BEFORE invariants.js',
  /regInv46\(tries - 1\)/.test(am) && /\}\)\(25\);/.test(srcInv46));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
