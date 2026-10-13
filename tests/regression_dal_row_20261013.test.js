#!/usr/bin/env node
/*
 * Regression: DAL allocation stays in the failure condition's row (13 Oct 2026, math fix 7).
 *
 * FOUND (math audit F7, B8): allocateDAL reduced every AND gate relative to its OWN incoming DAL, so
 *   nested AND gates compounded below the row ARP4761A App P allows. Under a Catastrophic (A) failure
 *   condition: AND(x, AND(y,z)) Option 1 gave z = E; Option 2 three deep gave D; AND(AND(x,y),
 *   AND(z,w)) Option 2 gave every member C (no member at B at all). And the default independence
 *   'claimed' REDUCED before any Common Mode Analysis had substantiated independence. VOTING k-of-n
 *   gates took no reduction at all.
 * FIX: the failure condition's starting DAL (cert basis) travels down every gate as the ROW
 *   (ARP4754B 5.2, ARP4761A App P Table P2 and P.5). For every failure set (minimal cut set of the
 *   independent members) the allocation must hold: at least one member at the start DAL, or at
 *   least two members one level below it, and nobody more than two levels below it (floor E). A
 *   gate already one level below keeps one member at that level. VOTING k-of-n reduces rigorously
 *   (Option 1: n-k+1 carriers; Option 2: n-k+2 uppers). No reduction is taken until independence
 *   is 'substantiated'; a claim holds the members and keeps the would-be DAL (_dalIfSubstantiated).
 *   The F3061 Table 1 path keeps its secondary floor. A Cert Lab compliance-basis hook
 *   (dalRowComplianceBasis, projectConfig.dalComplianceBasis) exists; no SC-VTOL Note A rule is
 *   hard-coded.
 * EXECUTED: the REAL allocateDAL (support_modules.js), dalDecrement/dalMax (helpers_modules.js),
 *   safety_targets.js and f3061_dal.js, the real propagateDalAllRoots / strictest smoothing
 *   (misc_fn_modules.js) and genDALgebra (assurance_modules.js). The answers are INDEPENDENT:
 *   minimal cut sets by brute-force enumeration of the tree's Boolean structure, the row rule
 *   checked on every cut set, closed-form Table P2 values, and the minimum k-of-n carrier counts by
 *   exhaustive search. MUTATION PROOF: the production allocator (base commit) is run through the
 *   same checker and must go red.
 * Run: node tests/regression_dal_row_20261013.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const fnText = (src, name) => {
    const at = src.indexOf('function ' + name + '(');
    if (at < 0) return null;
    const open = src.indexOf('{', src.indexOf(')', at)); let d = 0;
    for (let i = open; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) return src.slice(at, i + 1); } }
    return null;
};
const slice = (src, from, to, label) => {
    const a = src.indexOf(from), b = src.indexOf(to, a);
    if (a < 0 || b < 0) throw new Error('slice anchors missing: ' + label);
    return src.slice(a, b);
};

// ---- an allocator context (real code) -------------------------------------------------------
function mkCtx(supportSrc) {
    const c = { console, Math, JSON, String, Array, Object, Set, Map, Number, parseInt, isFinite };
    c.window = c; c.globalThis = c;
    vm.createContext(c);
    vm.runInContext(S('safety_targets.js').replace(/^const /gm, 'var '), c, { filename: 'safety_targets.js' });
    vm.runInContext(S('f3061_dal.js'), c, { filename: 'f3061_dal.js' });
    vm.runInContext('var projectConfig = { regulation: "Part 25" }; var ftaPages = [];', c);
    vm.runInContext(fnText(S('helpers_modules.js'), 'dalDecrement') + ';' + fnText(S('helpers_modules.js'), 'dalMax') + ';', c);
    const hook = fnText(supportSrc, 'dalRowComplianceBasis');
    vm.runInContext((hook ? hook + ';' : '') + fnText(supportSrc, 'allocateDAL') + ';', c, { filename: 'allocateDAL' });
    return c;
}
const NEW = mkCtx(S('support_modules.js'));
// Mutation proofs that do not depend on git history: the CURRENT source with the fix reverted in place.
//   MUT_ROW: each gate takes its OWN incoming DAL as the row start (the old per-gate reduction).
//   MUT_CLAIM: a bare claim applies the reduction (the old provisional default).
const _sup = S('support_modules.js');
const _rowLine = 'let below = 0;';
const _claimLine = "const applies = (indep === 'substantiated') || (!actual && indep === 'claimed');";
if (_sup.indexOf(_rowLine) < 0 || _sup.indexOf(_claimLine) < 0) throw new Error('mutation anchors missing in allocateDAL');
const MUT_ROW = mkCtx(_sup.replace(_rowLine, 'row = Object.assign({}, row, { start: propagateDal }); ' + _rowLine));
const MUT_CLAIM = mkCtx(_sup.replace(_claimLine, "const applies = (indep === 'substantiated') || (indep === 'claimed');"));
// The production allocator itself (base fd6e4de), when the history is available: an extra proof.
let BASE = null;
for (const rev of ['fd6e4de', '7e1a988']) {
    try {
        const baseSrc = cp.execSync('git show ' + rev + ':site/support_modules.js', { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).toString();
        BASE = mkCtx(baseSrc); break;
    } catch (_) { BASE = null; }
}

// ---- independent reference: tree structure, brute-force minimal cut sets, the row rule -------
const ORDER = ['A', 'B', 'C', 'D', 'E'];
const rank = d => ORDER.indexOf(d);
const minus = (d, k) => ORDER[Math.min(4, rank(d) + k)];
let nid = 1;
const leaf = (name) => ({ id: 'n' + (nid++), displayId: name || ('L' + nid), type: 'basic', children: [] });
const gate = (gt, kids, extra) => Object.assign({ id: 'g' + (nid++), displayId: 'G' + nid, type: 'gate', gateType: gt, children: kids }, extra || {});
const SUB = { dalIndependence: 'substantiated' };
function leavesOf(n, out) { out = out || []; if (n.type !== 'gate') out.push(n); else n.children.forEach(c => leavesOf(c, out)); return out; }
function evalTree(n, st) {
    if (n.type !== 'gate') return !!st.get(n);
    const v = n.children.map(c => evalTree(c, st)), t = v.filter(Boolean).length;
    if (n.gateType === 'AND' || n.gateType === 'INHIBIT') return t === v.length;
    if (n.gateType === 'OR') return t > 0;
    if (n.gateType === 'VOTING') return t >= Math.max(1, Math.min(n.votingK || 2, v.length));
    throw new Error('gate ' + n.gateType);
}
function bruteMCS(root) {
    const L = leavesOf(root), n = L.length, trues = [];
    for (let m = 0; m < (1 << n); m++) { const st = new Map(); L.forEach((l, i) => st.set(l, !!((m >> i) & 1))); if (evalTree(root, st)) trues.push(m); }
    const T = new Set(trues);
    return trues.filter(m => { for (let i = 0; i < n; i++) if (((m >> i) & 1) && T.has(m & ~(1 << i))) return false; return true; })
        .map(m => L.filter((_, i) => (m >> i) & 1));
}
// The Table P2 row (ARP4761A App P, P.5) on one failure set, start DAL X:
//   one member at X, or two members at X-1 (or better); nobody below X-2.
function rowOk(set, X, field) {
    const ds = set.map(l => l[field || 'allocatedDAL']);
    if (ds.some(d => rank(d) > rank(minus(X, 2)))) return false;
    return ds.filter(d => rank(d) <= rank(X)).length >= 1 || ds.filter(d => rank(d) <= rank(minus(X, 1))).length >= 2;
}
function alloc(C, root, top, ctx) { C.__r = root; C.__top = top; C.__ctx = ctx || null; vm.runInContext('allocateDAL(__r, __top, new Set(), null, __ctx)', C); }
const dals = (...ns) => ns.map(n => n.allocatedDAL).join('');

// ---- [1] the audit's cases, closed form (substantiated independence) -----------------------
console.log('\n[1] the audit cases, against Table P2 worked by hand');
{
    let x = leaf('x'), y = leaf('y'), z = leaf('z');
    let r = gate('AND', [x, gate('AND', [y, z], Object.assign({ dalOption: 'opt1' }, SUB))], Object.assign({ dalOption: 'opt1' }, SUB));
    alloc(NEW, r, 'A');
    check('Cat AND(x, AND(y,z)) Option 1 at both levels: x=A, y=C, z=C (was z=E)', dals(x, y, z) === 'ACC', dals(x, y, z));
    x = leaf(); y = leaf(); z = leaf(); const w = leaf();
    r = gate('AND', [x, gate('AND', [y, gate('AND', [z, w], SUB)], SUB)], SUB);
    alloc(NEW, r, 'A');
    check('Cat Option 2 three deep: x=B, y=B, z=C, w=C (was D, D): two members at B in the one failure set', dals(x, y, z, w) === 'BBCC', dals(x, y, z, w));
    const a = leaf(), b = leaf(), c = leaf(), d = leaf();
    r = gate('AND', [gate('AND', [a, b], SUB), gate('AND', [c, d], SUB)], SUB);
    alloc(NEW, r, 'A');
    check('Cat AND(AND(a,b), AND(c,d)) Option 2: a=B, b=C, c=B, d=C (was all C, nobody at B)', dals(a, b, c, d) === 'BCBC', dals(a, b, c, d));
    x = leaf(); y = leaf(); z = leaf();
    r = gate('AND', [x, gate('AND', [y, z], Object.assign({ dalOption: 'opt1' }, SUB))], Object.assign({ dalOption: 'opt1' }, SUB));
    alloc(NEW, r, 'B');
    check('Haz AND(x, AND(y,z)) Option 1: x=B, y=D, z=D (was z=E)', dals(x, y, z) === 'BDD', dals(x, y, z));
    x = leaf(); y = leaf();
    r = gate('AND', [x, y], Object.assign({ dalOption: 'opt1' }, SUB)); alloc(NEW, r, 'A');
    const o1 = dals(x, y);
    x = leaf(); y = leaf();
    r = gate('AND', [x, y], SUB); alloc(NEW, r, 'A');
    check('single level unchanged: Option 1 A/C, Option 2 B/B (Table P2 row A)', o1 === 'AC' && dals(x, y) === 'BB', o1 + ' ' + dals(x, y));
    x = leaf(); y = leaf();
    r = gate('OR', [x, gate('AND', [y, leaf()], SUB)]); alloc(NEW, r, 'A');
    check('an OR member keeps the start DAL (single-member column)', x.allocatedDAL === 'A' && y.allocatedDAL === 'B');
}

// ---- [2] fuzz: every failure set of every random tree stays in the row ----------------------
console.log('\n[2] random trees: every minimal cut set satisfies the row (brute force)');
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function randTree(R, depth, budget) {
    if (depth === 0 || budget.n <= 1 || R() < 0.25) { budget.n--; return leaf(); }
    const t = R(), m = 2 + Math.floor(R() * 2);
    const kids = []; for (let i = 0; i < m && budget.n > 0; i++) kids.push(randTree(R, depth - 1, budget));
    if (kids.length < 2) kids.push(leaf());
    const extra = Object.assign({ dalOption: R() < 0.5 ? 'opt1' : 'opt2' }, SUB);
    if (t < 0.5) return gate('AND', kids, extra);
    if (t < 0.75) return gate('OR', kids, extra);
    return gate('VOTING', kids, Object.assign(extra, { votingK: 2 + Math.floor(R() * Math.max(1, kids.length - 1)) }));
}
function fuzz(C, seed, trees, field) {
    const R = rnd(seed); let bad = 0, sets = 0, reducedTrees = 0; const ex = [];
    for (let t = 0; t < trees; t++) {
        const root = randTree(R, 4, { n: 11 }); const X = ORDER[Math.floor(R() * 3)];
        alloc(C, root, X);
        const L = leavesOf(root);
        if (L.some(l => l[field || 'allocatedDAL'] !== X)) reducedTrees++;
        bruteMCS(root).forEach(set => { sets++; if (!rowOk(set, X, field)) { bad++; if (ex.length < 2) ex.push(X + ':' + set.map(l => l[field || 'allocatedDAL']).join('')); } });
    }
    return { bad, sets, reducedTrees, ex };
}
const F = fuzz(NEW, 20261013, 300);
check('300 random AND/OR/VOTING trees (start A/B/C, Options mixed): 0 failure sets leave the row', F.bad === 0 && F.sets > 1000, F.bad + ' bad of ' + F.sets + ' ' + F.ex.join(' '));
check('...and the allocator still reduces (not a trivially conservative pass)', F.reducedTrees > 150, F.reducedTrees + ' of 300 trees reduced');
const M = fuzz(MUT_ROW, 20261013, 300);
check('MUTATION PROOF: with the row reverted (each gate reduces from its own DAL) the same checker goes red', M.bad > 0, M.bad + ' bad failure sets, e.g. ' + M.ex.join(' '));
if (BASE) {
    const B = fuzz(BASE, 20261013, 300);
    check('MUTATION PROOF: the production allocator (base fd6e4de) fails the same checker', B.bad > 0, B.bad + ' bad failure sets, e.g. ' + B.ex.join(' '));
} else console.log('  (production base not in this git history; the in-place mutation above is the proof)');

// ---- [3] VOTING k-of-n: the minimum carrier counts, by exhaustive search -------------------
console.log('\n[3] VOTING k-of-n against an exhaustive minimum');
function minCount(n, k, level) {
    // fewest members at `level` (others at X-2) such that every k-subset is in row A
    for (let c = 0; c <= n; c++) {
        const ds = Array.from({ length: n }, (_, i) => i < c ? level : 'C');
        let ok = true;
        for (let m = 0; m < (1 << n) && ok; m++) { let pc = 0; for (let i = 0; i < n; i++) if ((m >> i) & 1) pc++; if (pc !== k) continue;
            const set = ds.filter((_, i) => (m >> i) & 1).map(d => ({ allocatedDAL: d })); if (!rowOk(set, 'A')) ok = false; }
        if (ok) return c;
    }
    return n + 1;
}
[[2, 3], [2, 4], [3, 4], [3, 5], [4, 5]].forEach(([k, n]) => {
    const m1 = minCount(n, k, 'A'), m2 = minCount(n, k, 'B');
    let ks = Array.from({ length: n }, () => leaf());
    alloc(NEW, gate('VOTING', ks, Object.assign({ votingK: k, dalOption: 'opt1' }, SUB)), 'A');
    const got1 = ks.filter(l => l.allocatedDAL === 'A').length, rest1 = ks.filter(l => l.allocatedDAL === 'C').length;
    ks = Array.from({ length: n }, () => leaf());
    alloc(NEW, gate('VOTING', ks, Object.assign({ votingK: k }, SUB)), 'A');
    const got2 = ks.filter(l => l.allocatedDAL === 'B').length, rest2 = ks.filter(l => l.allocatedDAL === 'C').length;
    check(k + '-of-' + n + ': Option 1 gives exactly the minimum ' + m1 + ' at A and the rest at C; Option 2 the minimum ' + m2 + ' at B and the rest at C',
        got1 === m1 && got1 + rest1 === n && got2 === Math.min(n, m2) && got2 + rest2 === n, [got1, rest1, got2, rest2, m1, m2].join(','));
});
{
    const ks = [leaf(), leaf(), leaf()];
    alloc(NEW, gate('VOTING', ks, Object.assign({ votingK: 1 }, SUB)), 'A');
    check('1-of-3 VOTING is a single-failure gate: no reduction', dals(...ks) === 'AAA');
}

// ---- [4] no reduction before CMA substantiation; the would-be DAL is kept -------------------
console.log('\n[4] the default claim does not reduce; the would-be DAL is shown');
{
    const mk = (indep) => { const x = leaf(), y = leaf(), z = leaf(); const inner = gate('AND', [y, z], indep ? { dalIndependence: indep } : {});
        const g = gate('AND', [x, inner], Object.assign({ dalOption: 'opt1' }, indep ? { dalIndependence: indep } : {})); return { g, inner, x, y, z }; };
    const d = mk(null); alloc(NEW, d.g, 'A');
    const s = mk('substantiated'); alloc(NEW, s.g, 'A');
    check('default (no dalIndependence = claimed): every member holds A', dals(d.x, d.y, d.z) === 'AAA', dals(d.x, d.y, d.z));
    check('the would-be DALs equal the substantiated allocation (A, C, C)',
        [d.x, d.y, d.z].map(n => n._dalIfSubstantiated).join('') === dals(s.x, s.y, s.z) && dals(s.x, s.y, s.z) === 'ACC',
        [d.x, d.y, d.z].map(n => n._dalIfSubstantiated).join(''));
    check('the claimed gate is pending, not reduced, and raises its requirement with status claimed',
        d.g._dalPending === true && d.g._dalReduced === false && d.g._independenceReq && d.g._independenceReq.status === 'claimed' && d.g._independenceReq.reductionApplied === false);
    check('the substantiated gate is reduced and its requirement is substantiated',
        s.g._dalReduced === true && s.g._dalPending === false && s.g._independenceReq.status === 'substantiated' && s.g._independenceReq.reductionApplied === true);
    check('the pending member explains itself (basis pending, would-be recorded)', d.z._dalDerivation.basis === 'pending' && d.z._dalDerivation.wouldBe);
    const n = mk('none'); alloc(NEW, n.g, 'A');
    check("'none': no reduction and no would-be reduction either", dals(n.x, n.y, n.z) === 'AAA' && [n.x, n.y, n.z].every(v => v._dalIfSubstantiated === 'A') && !n.g._independenceReq);
    const j = mk('option-1'); alloc(NEW, j.g, 'A');
    check("a stray value ('option-1', the old demo data) is read as an unsubstantiated claim, never as a reduction", dals(j.x, j.y, j.z) === 'AAA' && j.g._dalPending === true);
    { const b = mk(null); alloc(MUT_CLAIM, b.g, 'A'); check('MUTATION PROOF: let a bare claim reduce again and the default no longer holds A/A/A (gives ' + dals(b.x, b.y, b.z) + ')', dals(b.x, b.y, b.z) !== 'AAA'); }
    if (BASE) { const b = mk(null); alloc(BASE, b.g, 'A'); check('MUTATION PROOF: the production default reduced before CMA (base gives ' + dals(b.x, b.y, b.z) + ')', dals(b.x, b.y, b.z) !== 'AAA'); }
}

// ---- [5] F3061 Table 1 path: nesting never goes below the secondary ------------------------
console.log('\n[5] Part 23 / F3061 Table 1 path with nesting');
{
    NEW.projectConfig = { regulation: 'Part 23', part23Class: 'IV' };
    const R = rnd(7); let bad = 0, sets = 0, red = 0;
    for (let t = 0; t < 150; t++) {
        const sev = ['Catastrophic', 'Hazardous', 'Major'][t % 3];
        const cell = NEW.SLF3061.cell('IV', sev), ctx = NEW.SLF3061.contextFor(sev, NEW.projectConfig);
        const root = randTree(R, 4, { n: 10 });
        alloc(NEW, root, cell.P, ctx);
        if (leavesOf(root).some(l => l.allocatedDAL !== cell.P)) red++;
        bruteMCS(root).forEach(set => { sets++;
            const ds = set.map(l => l.allocatedDAL);
            if (!(ds.some(d => d === cell.P) && ds.every(d => rank(d) <= rank(cell.S)))) bad++; });
    }
    check('150 random Part 23 IV trees: every failure set has a primary member and nobody below the secondary', bad === 0 && sets > 300 && red > 50, bad + ' bad of ' + sets + ', ' + red + ' reduced');
    NEW.projectConfig = { regulation: 'Part 25' };
}

// ---- [6] the Cert Lab compliance-basis hook: nothing hard-coded ----------------------------
console.log('\n[6] SC-VTOL Note A: a hook, not a rule');
{
    const run = (pc) => { NEW.projectConfig = pc; const x = leaf(), y = leaf(); alloc(NEW, gate('AND', [x, y], Object.assign({ dalOption: 'opt1' }, SUB)), 'B'); return [x, y]; };
    let [x, y] = run({ regulation: 'SC-VTOL', scvtolCategory: 'Basic 2' });
    check('SC-VTOL Basic 2 with no Cert Lab setting: ARP4754B as before (B / D), no hard-coded Note A', dals(x, y) === 'BD', dals(x, y));
    [x, y] = run({ regulation: 'SC-VTOL', scvtolCategory: 'Basic 2', dalComplianceBasis: { id: 'MOC SC-VTOL Table 1 Note A', architectureReduction: false } });
    check('a basis NOT confirmed in Cert Lab changes nothing', dals(x, y) === 'BD', dals(x, y));
    [x, y] = run({ regulation: 'SC-VTOL', scvtolCategory: 'Basic 2', dalComplianceBasis: { id: 'MOC SC-VTOL Table 1 Note A', confirmedInCertLab: true, architectureReduction: false } });
    check('a basis confirmed in Cert Lab with no architecture reduction: both held at B, cited', dals(x, y) === 'BB' && y._dalDerivation.basis === 'compliance-basis' && y._dalDerivation.complianceBasis === 'MOC SC-VTOL Table 1 Note A', dals(x, y));
    NEW.projectConfig = { regulation: 'Part 25' };
}

// ---- [7] strictest across failure conditions, through the real sweep and register ----------
console.log('\n[7] each member takes the strictest DAL across failure conditions');
{
    globalThis.window = globalThis;
    globalThis.SLEnv = { get: n => globalThis[n] };
    globalThis.DAL_ORDER = ORDER.slice();
    globalThis.SEVERITY_RANK = { 'No Safety Effect': 1, Negligible: 1, Minor: 2, Major: 3, Hazardous: 4, Catastrophic: 5 };
    (0, eval)(slice(S('helpers_modules.js'), 'function dalDecrement', '// Color for the canvas badge', 'helpers dal fns'));
    (0, eval)(slice(S('support_modules.js'), 'function clearAllAllocations', '// Component library for basic-event input mode', 'support allocator'));
    (0, eval)(slice(S('misc_fn_modules.js'), 'function propagateDalFromTrueRoot', 'function refreshFtaMissionProfileDropdown', 'misc dal sweep'));
    (0, eval)(slice(S('assurance_modules.js'), 'function hashStr', 'function walkAllPages', 'assurance fp'));
    (0, eval)(slice(S('assurance_modules.js'), 'function genDALgebra', '// ----- Generator 4', 'assurance genDALgebra'));
    globalThis.ftaConfig = {}; globalThis.cmaData = []; globalThis.projectConfig = { autoreqDalMode: 'explicit' };
    globalThis.getRootAncestorPage = p => p; globalThis.getRootAncestorPageOfActive = () => ftaPages[0];
    globalThis._resolveLinkedFha = id => id === 101 ? { severity: 'Catastrophic' } : id === 102 ? { severity: 'Hazardous' } : null;
    globalThis.getSafetyTarget = sev => sev === 'Catastrophic' ? { dal: 'A' } : { dal: 'B' };
    globalThis.walkPagesInScope = (scope, cb) => ftaPages.forEach(p => { (function w(n) { if (!n) return; cb(n, p); (n.children || []).forEach(w); })(p.root); });
    const mk = () => [
        { id: 'p1', name: 'PASA Cat', linkedFhaId: 101, root: { id: 1, type: 'gate', gateType: 'AND', dalOption: 'opt1', dalIndependence: 'substantiated', children: [
            { id: 11, logicalId: 'K', type: 'basic' }, { id: 12, logicalId: 'S', type: 'basic' }] } },
        { id: 'p2', name: 'PASA Haz', linkedFhaId: 102, root: { id: 2, type: 'gate', gateType: 'AND', dalOption: 'opt1', dalCarrierChildId: 22, children: [
            { id: 21, logicalId: 'Q', type: 'basic' }, { id: 22, logicalId: 'S', type: 'basic' }] } },
    ];
    globalThis.ftaPages = mk();
    propagateDalAllRoots();
    const rows = genDALgebra('ac');
    const sRow = rows.find(r => /:S$/.test(r.reqSource.sourceId));
    // S is C in the Cat tree (Option 1 non-carrier, substantiated) and B in the Haz tree (claim pending: held at B)
    check('shared member S: C under the Cat tree, B (held, pending) under the Haz tree; the register takes B',
        ftaPages[0].root.children[1].allocatedDAL === 'C' && ftaPages[1].root.children[1].allocatedDAL === 'B' && sRow && / B\.$/.test(sRow.text), sRow && sRow.text);
    const qRow = rows.find(r => /:Q$/.test(r.reqSource.sourceId));
    check('the pending member\'s register rationale says it is held and what it would be once CMA substantiates it',
        qRow && /not yet substantiated by Common Mode Analysis/.test(qRow.rat) && /would be IDAL D/.test(qRow.rat), qRow && qRow.rat);
    // strictest smoothing of the would-be DAL within one tree
    globalThis.ftaPages = [{ id: 'p3', name: 'T', root: { id: 3, type: 'gate', gateType: 'OR', children: [
        { id: 31, logicalId: 'R', type: 'basic' },
        { id: 32, type: 'gate', gateType: 'AND', dalOption: 'opt1', children: [{ id: 33, logicalId: 'U', type: 'basic' }, { id: 34, logicalId: 'R', type: 'basic' }] }] } }];
    clearAllAllocations();
    allocateDAL(ftaPages[0].root, 'A', new Set(), null, null);
    _propagateStrictestDALAcrossSharedEvents(ftaPages[0].root);
    const r1 = ftaPages[0].root.children[0], r2 = ftaPages[0].root.children[1].children[1];
    check('a shared event takes its strictest position for the would-be DAL too (R: A in the OR, would be C under the AND -> A)',
        r1.allocatedDAL === 'A' && r2.allocatedDAL === 'A' && r1._dalIfSubstantiated === 'A' && r2._dalIfSubstantiated === 'A');
}

// ---- [8] consumers and the user-facing explanation ------------------------------------------
console.log('\n[8] consumers read the new meaning');
{
    const inv = S('invariants.js'), ic = S('independence_claims.js'), fv = S('fta_view_modules.js'), hp = S('helpers_modules.js'), idx = S('index.html'), asr = S('assurance_modules.js');
    check('INV-05 calls a claimed gate a WITHHELD reduction, not a taken one', /DAL reduction withheld: independence is CLAIMED/.test(inv) && !/DAL reduction rests on CLAIMED/.test(inv));
    check('independence claims carry pending beside reduced, and read VOTING gates', /pending: !!n\._dalPending/.test(ic) && /n\.gateType === 'VOTING'/.test(ic));
    check('the AutoReq note says the reduction is withheld until CMA', /DAL reduction withheld: independence is claimed but not yet substantiated/.test(asr));
    check('the canvas badge shows the would-be DAL on hover (dashed while pending)', /_dalIfSubstantiated !== n\.allocatedDAL/.test(fv) && /once Common Mode Analysis substantiates/.test(fv) && /stroke-dasharray/.test(fv));
    check('the DAL panel opens on VOTING gates', /const isAndLike = dataNode\.gateType === 'AND' \|\| dataNode\.gateType === 'INHIBIT' \|\| dataNode\.gateType === 'VOTING'/.test(fv));
    const expl = slice(hp, 'function dalgebraOptionsTableHTML', "try { window.dalgebraOptionsTableHTML", 'explanation');
    check('the DALgebra explanation states the row rule in plain words', /sets the row and the whole tree stays in it/.test(expl) && /nobody goes more than two levels below it/.test(expl) && /however deep the tree/.test(expl) && /Nothing is reduced until Common Mode Analysis/.test(expl));
    check('the explanation has no em dash in the new text', !/sets the row[^<]*\u2014/.test(expl));
    check('the panel option says a claim takes no reduction yet', /Claimed, pending CMA \(no reduction yet\)/.test(idx));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
