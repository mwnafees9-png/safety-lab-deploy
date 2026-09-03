#!/usr/bin/env node
/*
 * Regression — ARP-EXP (G.11.1.3 exposure cases) + ARP-CRA (B.4.3.2 matrix).
 *   [1] EXP catalogue: four named cases with clause refs; override demands
 *       rationale by catalogue contract.
 *   [2] EXP derivation: Case C derives T from the dormancy interval and
 *       honestly refuses when none exists; Case D is one flight; no case →
 *       no number invented.
 *   [3] EXP consistency: Case A vs latent mode and vs partial-coverage
 *       monitor both flag ("two different stories"); Case C without latent
 *       mode flags; a consistent pairing passes.
 *   [4] EXP sweep: only Cat/Haz trees; basic events only; unnamed events
 *       carry the no-case issue.
 *   [5] EXP authoring: setCase writes node.g1113; override without
 *       rationale REFUSED; clearing removes it.
 *   [6] CRA structure: total-loss SEED per resource; consuming systems
 *       computed from consumedBy→traceIds; unimplemented sub-functions get
 *       an honest aircraft-level column; authored modes dedupe and the
 *       total-loss name is guarded.
 *   [7] CRA dispositions: assess needs an effect; dismissal needs
 *       rationale; reopen clears; rmMode refuses while cells stand.
 *   [8] CRA findings: ≥2 consumers under one IP claim → the independence
 *       finding; Cat/Haz FC fan-out surfaced even without a claim.
 *   [9] wiring: both modules registered in index.html with busters; both
 *       register their invariants (INV-38/INV-39) with unique ids; evidence
 *       package carries §9q/§9r + §10q/§10r.
 * Run: node tests/regression_exp_cra.test.js   (repo root or tests/)
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

// ---- shared stub world -------------------------------------------------------
global.projectConfig = {};
global.ftaConfig = { exposureTime: 2.5 };
global.resourcesData = [
    { internalId: 1, resId: 'RES-001', name: 'Essential Bus 1', providedBy: ['SF-EPS-1'], consumedBy: ['SF-FCS-1', 'SF-AVI-1'] },
    { internalId: 2, resId: 'RES-002', name: 'Hydraulic 2', providedBy: ['SF-HYD-1'], consumedBy: ['SF-ORPHAN'] }
];
global.systemsData = [
    { id: 'sys-pfc', name: 'Primary flight control', functions: [{ funcId: 'F1', traceIds: ['SF-FCS-1'] }],
      fha: [{ internalId: 9101, fcId: 'FC-PFC1' }] },
    { id: 'sys-avi', name: 'Avionics', functions: [{ funcId: 'F2', traceIds: ['SF-AVI-1'] }],
      fha: [{ internalId: 9102, fcId: 'FC-AVI1' }] }
];
global.acFhaData = [
    { internalId: 'f1', fcId: 'FC-01', subId: 'SF-FCS-1', severity: 'Catastrophic' },
    { internalId: 'f2', fcId: 'FC-05', subId: 'SF-OTHER', severity: 'Minor' }
];
// 23 Aug 2026 — the REAL ipLedger returns member OBJECTS ({lid,…}) whose lids
// are NODE logical ids, not system ids. The old stub returned bare system-id
// strings, which let a structurally-dead production check pass for weeks.
// Members now carry node lids that resolve to systems via externalSource
// SYS_ links — the same path the live trees use.
global.ipLedger = function () { return [{ key: 'IP-014 command independent of air data',
    members: [{ lid: 'BE-PFC' }, { lid: 'BE-AVI' }] }]; };
global.monitorSpecFor = function (lid) { return String(lid) === 'BE-COV' ? { coverage: 85 } : null; };
const BE = (lid, extra) => Object.assign({ type: 'event', logicalId: lid, name: 'evt-' + lid }, extra || {});
global.ftaPages = [
    { id: 'p1', name: 'FT-CAT', linkedFhaIds: ['f1'], root: { type: 'gate', children: [
        BE('BE-1', { exposureMode: 'latent', dormancyInterval: 800, g1113: { caseId: 'c' } }),
        BE('BE-2', {}),                                                            // unnamed
        BE('BE-COV', { g1113: { caseId: 'a' } }),                                  // annunciated + 85% monitor
        BE('BE-3', { exposureMode: 'latent', dormancyInterval: 100, g1113: { caseId: 'a' } }), // A but latent
        // 23 Aug 2026 — the IP-014 members, attributable to their systems the
        // way live trees are: through externalSource SYS_ links.
        BE('BE-PFC', { externalSource: { kind: 'fha', targetId: 'SYS_9101' } }),
        BE('BE-AVI', { externalSource: { kind: 'fha', targetId: 'SYS_9102' } })
    ] } },
    { id: 'p2', name: 'FT-MINOR', linkedFhaIds: ['f2'], root: { type: 'gate', children: [BE('BE-9', {})] } }
];

const EXP = require('../site/exposure_case.js');
const CRA = require('../site/cra_matrix.js');

// ---- [1] catalogue -----------------------------------------------------------
check('four named cases, each with a G.11.1.3 clause pointer',
    EXP.CASES.length === 4 && EXP.CASES.every(c => /G\.11\.1\.3/.test(c.clause)) &&
    EXP.CASES.some(c => c.id === 'ov' && /rationale/i.test(c.expects)));

// ---- [2] derivation ----------------------------------------------------------
check('Case C derives T from the dormancy interval, with its source named',
    (function () { const d = EXP.deriveT(BE('x', { exposureMode: 'latent', dormancyInterval: 800, g1113: { caseId: 'c' } }));
        return d.T === 800 && /dormancy interval/.test(d.source) && d.ok; })());
check('Case C WITHOUT an interval refuses the number — never invents one',
    (function () { const d = EXP.deriveT(BE('x', { g1113: { caseId: 'c' } })); return d.T === null && !d.ok; })());
check('Case D is one flight (global mission exposure)',
    EXP.deriveT(BE('x', { g1113: { caseId: 'd' } })).T === 2.5);
check('no case selected → no number, honestly',
    EXP.deriveT(BE('x', {})).T === null && /no case selected/.test(EXP.deriveT(BE('x', {})).source));

// ---- [3] consistency ---------------------------------------------------------
check('Case A vs LATENT mode flags — two different stories',
    !EXP.consistency(BE('x', { exposureMode: 'latent', g1113: { caseId: 'a' } })).ok);
check('Case A vs 85%-coverage monitor flags',
    (function () { const c = EXP.consistency(BE('BE-COV', { g1113: { caseId: 'a' } }));
        return !c.ok && /85% coverage/.test(c.issues.join(' ')); })());
check('Case C on a non-latent event flags; a correct C pairing passes',
    !EXP.consistency(BE('x', { g1113: { caseId: 'c' } })).ok &&
    EXP.consistency(BE('x', { exposureMode: 'latent', dormancyInterval: 800, g1113: { caseId: 'c' } })).ok);

// ---- [4] sweep ---------------------------------------------------------------
const rows = EXP.sweep();
check('sweep covers Cat/Haz trees only (Minor tree excluded), basic events only',
    // 23 Aug 2026 — 4 → 6: the harness gained BE-PFC/BE-AVI (the IP-014
    // members with SYS_ links) on the Cat tree for the CRA finding fix.
    rows.length === 6 && rows.every(r => r.page === 'FT-CAT'));
check('unnamed event carries the no-case issue; correct Case C event is consistent',
    rows.find(r => String(r.lid) === 'BE-2').consistent === false &&
    rows.find(r => String(r.lid) === 'BE-1').consistent === true);
check('the two contradictions both surface (A+latent, A+partial coverage)',
    rows.find(r => String(r.lid) === 'BE-3').issues.some(i => /LATENT mode/.test(i)) &&
    rows.find(r => String(r.lid) === 'BE-COV').issues.some(i => /85% coverage/.test(i)));

// ---- [5] authoring -----------------------------------------------------------
check('setCase writes node.g1113 on the tree node',
    EXP.setCase('p1', 'BE-2', 'd') === true && ftaPages[0].root.children[1].g1113.caseId === 'd');
check('override WITHOUT rationale is REFUSED; with rationale it lands',
    EXP.setCase('p1', 'BE-2', 'ov', '') === false &&
    EXP.setCase('p1', 'BE-2', 'ov', 'supplier tree basis, memo X') === true &&
    ftaPages[0].root.children[1].g1113.rationale === 'supplier tree basis, memo X');
check('clearing removes the selection',
    EXP.setCase('p1', 'BE-2', null) === true && !ftaPages[0].root.children[1].g1113);

// ---- [6] CRA structure -------------------------------------------------------
const cm = CRA.model();
check('total-loss SEED per resource (2 resources → 2 seed rows)',
    cm.rows.filter(x => x.seed).length === 2 && cm.rows.every(x => x.seed ? x.mode === 'total loss' : true));
check('consumers computed via consumedBy→traceIds→systems',
    (function () { const r = cm.rows.find(x => x.resId === 'RES-001');
        return r.cols.length === 2 && r.cols.every(c => c.kind === 'system'); })());
check('unimplemented sub-function gets the honest aircraft-level column',
    (function () { const r = cm.rows.find(x => x.resId === 'RES-002');
        return r.cols.length === 1 && r.cols[0].kind === 'sub' && /SF-ORPHAN/.test(r.cols[0].name); })());
check('feeds-FCs computed from the consuming sub-functions',
    cm.rows.find(x => x.resId === 'RES-001').fcs.some(f => f.fcId === 'FC-01'));
CRA.author.addMode('RES-001', 'total loss', '');
CRA.author.addMode('RES-001', 'degraded voltage', 'sag');
CRA.author.addMode('RES-001', 'Degraded Voltage', 'dup');
check('total-loss name guarded; authored modes dedupe case-insensitively',
    projectConfig.cra.modes.length === 1 && CRA.model().rows.length === 3);

// ---- [7] CRA dispositions ----------------------------------------------------
CRA.author.assess('RES-001|total loss|sys-pfc', '');
check('assess with no effect REFUSED', CRA.model().cellsDisposed === 0);
CRA.author.assess('RES-001|total loss|sys-pfc', 'channel A depowers; reversion to B');
CRA.author.dismiss('RES-001|total loss|sys-avi', '');
check('dismiss with no rationale REFUSED; assess landed', CRA.model().cellsDisposed === 1);
CRA.author.dismiss('RES-001|total loss|sys-avi', 'independent battery bus per EPS-A-12');
check('dismissal WITH rationale lands', CRA.model().cellsDisposed === 2);
CRA.author.rmMode('RES-001', 'degraded voltage');
check('rmMode allowed while its cells are clean', projectConfig.cra.modes.length === 0);
CRA.author.reopen('RES-001|total loss|sys-avi');
check('reopen clears the cell', CRA.model().cellsDisposed === 1);

// ---- [8] CRA findings --------------------------------------------------------
const fnd = CRA.findings();
check('≥2 consumers under one IP claim → the independence finding, naming the claim',
    fnd.some(f => f.principle && /IP-014/.test(f.principle) && /both legs/.test(f.detail)));
check('Cat/Haz FC fan-out surfaced even without a claim',
    fnd.some(f => !f.principle && /FC-01/.test(f.detail)));

// ---- [9] wiring --------------------------------------------------------------
const esrc = S('exposure_case.js'), csrc = S('cra_matrix.js'), idx = S('index.html'), ev = S('evidence_package.js');
check('both modules registered in index.html with version busters',
    /exposure_case\.js\?v=\d/.test(idx) && /cra_matrix\.js\?v=\d/.test(idx));
check('INV-38 and INV-39 registered, advisory, silent when unpopulated',
    /id: 'INV-38', sev: 'advisory'/.test(esrc) && /id: 'INV-39', sev: 'advisory'/.test(csrc) &&
    /return \{ checked: 0, fails: \[\] \}/.test(esrc) && /return \{ checked: 0, fails: \[\] \}/.test(csrc));
check('INV-38/39 ids unique across every site module', (function () {
    const files = fs.readdirSync(path.join(__dirname, '..', 'site')).filter(f => f.endsWith('.js'));
    return files.every(f => {
        if (f === 'exposure_case.js' || f === 'cra_matrix.js') return true;
        try { const t = S(f); return t.indexOf("id: 'INV-38'") === -1 && t.indexOf("id: 'INV-39'") === -1; } catch (_) { return true; }
    }); })());
check('evidence package: §9q/§9r builders + §10q/§10r sections, re-run at build',
    /9q\. G\.11\.1\.3 exposure cases/.test(ev) && /9r\. B\.4\.3\.2 Common Resource/.test(ev) &&
    /10q · G\.11\.1\.3 exposure cases/.test(ev) && /10r · Common Resource Analysis/.test(ev));
// 26 Aug 2026 — SUPERSEDED in part: CRA no longer mounts a NAV row (it is a
// CMA tab per the CCA consolidation; prove_tabs v1.5). Its VIEW still
// runtime-mounts — born-modular is about zero index surgery, and that half of
// the pin stands. exp still carries no row since the Fault-trees tabs (23 Aug).
check('both pages register born-modular (runtime view; no index surgery)',
    /_ensurePage/.test(esrc) && /_ensurePage/.test(csrc) &&
    /view-cra/.test(csrc) && !/a\.id = 'snav-cra'/.test(csrc));
check('the no-new-math doctrine is stated and honored (deriveT reads engine fields)',
    /NO NEW MATH/.test(esrc) && /_nodeExposureTime/.test(esrc));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
