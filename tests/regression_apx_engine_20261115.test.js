#!/usr/bin/env node
/*
 * Regression: the math under the Interdependence, MAC and CoFFE Autopilots (site/apx_engine.js, SLApx), 15 Nov 2026.
 *
 * Waqas: the tables must be "exactly" those of the ARP4761A contiguous example (Appendix Q); these Autopilots replace
 * today's MAC, CoFFE and Interdependence screens, "so we have to absolutely nail this"; aircraft-level MAC rules are
 * named combinations of assemblies, never "k of n"; an uneven loss is its own question; "math must stay at the highest
 * standard possible". This suite holds the engine to the book and to its own order.
 *
 *   A  the book's CoFFE table (Table Q.4-6): the 81 cases come out in the book's order; its results are monotone in
 *      the engine's order; asking only what the engine cannot work out, with the book answering, reproduces all 81
 *      results exactly, in far fewer than 81 questions
 *   B  the summary and result (Tables Q.4-7, Q.4-8): the three high-speed overrun rows are the book's, exactly; the
 *      low-speed overrun rows are the 8 smallest mixes the book's own table gives (the book lists 2 of them); the
 *      no overrun rows are the 7 largest mixes
 *   C  the fault tree gate (Figure Q.4-1): total loss of wheel brake AND (partial loss of spoiler OR reverser OR
 *      flap); its probability with the book's budgets is exact (1.0E-07 x (1 - 0.999^3))
 *   D  the common resource pairs (Tables Q.4-9, Q.4-10, Q.4-11): 30 pairs in the book's order; the hydraulic pairs are
 *      cases 4 to 6 and the electrical pairs cases 11 to 13
 *   E  sides: "one side lost" is never compared with "both lost"; mirror images answer each other; a mirror image
 *      answered differently is refused; the roll control example gives one named rule and its mirror image
 *   F  the order and its guards: a contradicting answer is refused; a filled-in case names the answer it came from;
 *      a table over the cap is refused with its size, never sampled; a malfunction is comparable with nothing but
 *      operational
 *   G  property (seeded): for random column sets and random monotone truths, questions plus inference always
 *      reproduce the truth exactly, and never ask a case the answers already settle
 *   H  hygiene: no em dash, no eval, pure (no document, no localStorage)
 *
 * Run: node tests/regression_apx_engine_20261115.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '  -- ' + String(d).slice(0, 300) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const SRC = fs.readFileSync(path.join(SITE, 'apx_engine.js'), 'utf8');
const X = require(path.join(SITE, 'apx_engine.js'));

// ---- the book (ARP4761A Appendix Q, Table Q.4-6): wheel brake, ground spoiler, thrust reverser, flap ----
const BOOK_COLS = X.columns([
    { id: 'wbs', states: ['F', 'D', 'O'], units: ['inboard pair', 'outboard pair'] },
    { id: 'gss', states: ['F', 'D', 'O'], units: ['inboard pair', 'outboard pair'] },
    { id: 'trs', states: ['F', 'D', 'O'], units: ['LH', 'RH'] },
    { id: 'fls', states: ['F', 'D', 'O'], units: ['inboard pair', 'outboard pair'] }]);
const HIGH = new Set(); for (let i = 1; i <= 26; i++) HIGH.add(i);
const LOW = new Set([27, 28, 29, 30, 31, 32, 33, 34, 35, 37, 38, 39, 40, 41, 43, 46, 47, 49]);
const BOOK = {};   // case -> 2 high-speed overrun, 1 low-speed overrun, 0 no overrun
const ORDER = X.cases(BOOK_COLS);
ORDER.forEach((c, i) => { BOOK[c] = HIGH.has(i + 1) ? 2 : LOW.has(i + 1) ? 1 : 0; });

console.log('A  the book CoFFE table');
check('81 cases', ORDER.length === 81, ORDER.length);
check('book order: case 1 FFFF, case 2 FFFD, case 27 FOOO, case 28 DFFF, case 81 OOOO',
    ORDER[0] === 'FFFF' && ORDER[1] === 'FFFD' && ORDER[26] === 'FOOO' && ORDER[27] === 'DFFF' && ORDER[80] === 'OOOO', [ORDER[0], ORDER[1], ORDER[26], ORDER[27], ORDER[80]].join());
let mono = true;
ORDER.forEach(a => ORDER.forEach(b => { if (X.le(a, b, BOOK_COLS) && BOOK[a] > BOOK[b]) mono = false; }));
check('the book results are monotone in the engine order', mono);

// ask-and-infer, the book answering: phase 1 (the failure condition or not), phase 2 (which lesser outcome)
function runTwoPhase(cols, truth, topLevel, mirror) {
    const a1 = {}, a2 = {}; let q1 = 0, q2 = 0, reAsk = 0;
    for (;;) { const c = X.nextQuestion(cols, a1, { lo: 0, hi: 1 }); if (!c) break; if (c in a1) reAsk++; X.answer(a1, c, truth[c] === topLevel ? 1 : 0, cols, { lo: 0, hi: 1, mirror }); q1++; if (q1 > 5000) break; }
    const s1 = X.solve(cols, a1, { lo: 0, hi: 1 });
    const rest = Object.keys(s1.by).filter(c => s1.by[c].level === 0);
    if (topLevel > 1) for (;;) { const c = X.nextQuestion(cols, a2, { lo: 0, hi: topLevel - 1, among: rest }); if (!c) break; X.answer(a2, c, truth[c], cols, { lo: 0, hi: topLevel - 1, mirror }); q2++; if (q2 > 5000) break; }
    const s2 = X.solve(cols, a2, { lo: 0, hi: topLevel - 1, among: rest });
    const got = {};
    Object.keys(s1.by).forEach(c => { got[c] = s1.by[c].level === 1 ? topLevel : (topLevel > 1 ? s2.by[c].level : 0); });
    return { got, q1, q2, s1, s2, reAsk };
}
const R = runTwoPhase(BOOK_COLS, BOOK, 2, false);
check('all 81 results reproduced exactly', ORDER.every(c => R.got[c] === BOOK[c]), ORDER.filter(c => R.got[c] !== BOOK[c]).join());
check('far fewer than 81 questions (' + R.q1 + ' + ' + R.q2 + ')', R.q1 + R.q2 <= 45 && R.q1 <= 20, R.q1 + '+' + R.q2);
check('every filled-in case names an answered case it came from',
    Object.keys(R.s1.by).every(c => R.s1.by[c].src === 'you' || (R.s1.by[c].src === 'logic' && typeof R.s1.by[c].from === 'string' && R.s1.by[c].from.length === 4)));

console.log('B  summary and result');
const SUM = X.summary(BOOK_COLS, BOOK, 2);
const of = L => SUM.filter(r => r.level === L).map(r => r.c);
check('high-speed overrun rows are the book rows: F D O O, F O D O, F O O D', of(2).join() === 'FDOO,FODO,FOOD', of(2).join());
check('low-speed overrun: the 8 smallest mixes', of(1).slice().sort().join() === ['FOOO', 'DFDO', 'DFOD', 'DDFO', 'DDDD', 'DDOF', 'DOFD', 'DODF'].sort().join(), of(1).join());
check('the book\'s two low-speed rows are among them', of(1).indexOf('FOOO') !== -1 && of(1).indexOf('DDDD') !== -1);
check('no overrun: the 7 largest mixes', of(0).slice().sort().join() === ['DFOO', 'DDDO', 'DDOD', 'DOFO', 'DODD', 'DOOF', 'OFFF'].sort().join(), of(0).join());
check('the book\'s "D O O O" row is covered by a larger no-overrun mix', of(0).some(c => X.le('DOOO', c, BOOK_COLS)));

console.log('C  the fault tree gate');
const G = X.gate(of(2), BOOK_COLS);
check('gate shape: one core and one of the others', G.shape === 'core-any' && G.core.length === 1 && G.core[0].col === 'wbs' && G.core[0].st === 'F', JSON.stringify(G));
check('the others: partial loss of spoiler, reverser, flap', G.any.map(e => e.col + e.st).join() === 'gssD,trsD,flsD', JSON.stringify(G.any));
const PR = X.gateProbability(G, { 'wbs|F': 1e-7, 'gss|D': 1e-3, 'trs|D': 1e-3, 'fls|D': 1e-3 });
const exact = 1e-7 * (1 - 0.999 * 0.999 * 0.999);
check('gate probability exact (2.997e-10)', Math.abs(PR.p - exact) < 1e-24 && PR.p < 1e-9, PR.p);
const G2 = X.gate(['FFO', 'OFF'], X.columns([{ id: 'a', states: ['F', 'O'] }, { id: 'b', states: ['F', 'O'] }, { id: 'c', states: ['F', 'O'] }]));
const P2 = X.gateProbability(G2, { 'a|F': 0.1, 'b|F': 0.2, 'c|F': 0.3 });
check('a core with one extra each still reads as core and others (b AND (a OR c))', G2.shape === 'core-any' && Math.abs(P2.p - 0.2 * (1 - 0.9 * 0.7)) < 1e-15, JSON.stringify(G2) + P2.p);
const G3 = X.gate(['FFOO', 'OOFF'], X.columns(['a', 'b', 'c', 'd'].map(id => ({ id, states: ['F', 'O'] }))));
const P3 = X.gateProbability(G3, { 'a|F': 0.1, 'b|F': 0.2, 'c|F': 0.3, 'd|F': 0.4 });
check('no shared core: OR of ANDs, by exact inclusion-exclusion', G3.shape === 'or-of-and' && Math.abs(P3.p - (0.02 + 0.12 - 0.02 * 0.12)) < 1e-15, P3.p);

console.log('D  common resource pairs');
const CODE = { wbs: 'WBS', gss: 'GSS', trs: 'TRS', fls: 'FLS' };
const FEEDS = { hyd: ['wbs', 'gss', 'trs', 'fls'], elec: ['wbs', 'gss', 'trs', 'fls'], gdi: ['gss', 'trs'] };
const events = e => ({
    own: CODE[e.col] + (e.st === 'F' ? '.TL' : '.PL'),
    res: ['hyd', 'elec', 'gdi'].filter(r => FEEDS[r].indexOf(e.col) !== -1).map(r => ({ id: r, code: r === 'gdi' ? 'AGS.MF' : (r === 'hyd' ? 'HYD_' : 'ELEC_') + CODE[e.col] }))
});
const PAIRS = X.resourcePairs(G, events, { failure2Order: ['elec', 'hyd', 'gdi'] });
check('30 pairs', PAIRS && PAIRS.length === 30, PAIRS && PAIRS.length);
const row = n => PAIRS[n - 1].a.code + ' ' + PAIRS[n - 1].b.code;
check('book rows 1, 4, 7, 8, 10', row(1) === 'HYD_WBS ELEC_GSS' && row(4) === 'HYD_WBS HYD_GSS' && row(7) === 'HYD_WBS AGS.MF' && row(8) === 'HYD_WBS GSS.PL' && row(10) === 'HYD_WBS FLS.PL', [row(1), row(4), row(7), row(8), row(10)].join(' / '));
check('book rows 11, 13, 17, 21, 27, 30', row(11) === 'ELEC_WBS ELEC_GSS' && row(13) === 'ELEC_WBS ELEC_FLS' && row(17) === 'ELEC_WBS AGS.MF' && row(21) === 'WBS.TL ELEC_GSS' && row(27) === 'WBS.TL AGS.MF' && row(30) === 'WBS.TL FLS.PL', [row(11), row(13), row(17), row(21), row(27), row(30)].join(' / '));
check('hydraulic common source pairs: cases 4, 5, 6 (Table Q.4-10)', PAIRS.filter(p => p.same === 'hyd').map(p => p.n).join() === '4,5,6');
check('electrical common source pairs: cases 11, 12, 13 (Table Q.4-11)', PAIRS.filter(p => p.same === 'elec').map(p => p.n).join() === '11,12,13');
check('a gate without one core event gives no pair table (never a made-up one)', X.resourcePairs(G3, events) === null);

console.log('E  sides and mirror');
const ROLL = X.columns([{ id: 'ail', states: ['F', 'A', 'B', 'O'], units: ['LH aileron', 'RH aileron'] }, { id: 'spl', states: ['F', 'A', 'B', 'O'], units: ['LH roll spoilers', 'RH roll spoilers'] }]);
check('one side lost is never compared with both lost', !X.le('AO', 'FO', ROLL) && !X.le('FO', 'AO', ROLL) && !X.le('AO', 'BO', ROLL) && X.le('OO', 'AO', ROLL) && X.le('OO', 'FO', ROLL));
const SIDED_D = X.columns([{ id: 'trs', states: ['F', 'D', 'O'], sided: true }]);
check('a left and right pair counted as "one side": still never compared with both lost', !X.le('D', 'F', SIDED_D) && X.le('O', 'D', SIDED_D));
check('a counted assembly: one lost is no worse than both lost', X.le('D', 'F', X.columns([{ id: 'w', states: ['F', 'D', 'O'] }])));
check('mirror image swaps sides on every sided column', X.mirror('AB', ROLL) === 'BA' && X.mirror('FA', ROLL) === 'FB' && X.mirror('OO', ROLL) === 'OO');
const lost = (x, side) => x === 'F' || x === (side === 'L' ? 'A' : 'B');
const ROLL_TRUTH = {}; X.cases(ROLL).forEach(c => { ROLL_TRUTH[c] = ((lost(c[0], 'L') && lost(c[1], 'L')) || (lost(c[0], 'R') && lost(c[1], 'R'))) ? 1 : 0; });
const RR = runTwoPhase(ROLL, ROLL_TRUTH, 1, true);
check('roll example: 16 mixes reproduced, in fewer than 16 questions (' + RR.q1 + ')', X.cases(ROLL).every(c => RR.got[c] === ROLL_TRUTH[c]) && RR.q1 < 16, RR.q1);
const RULES = X.rules(X.minimal(X.cases(ROLL).filter(c => ROLL_TRUTH[c] === 1), ROLL), ROLL, { mirror: true });
check('roll example: one named rule (LH aileron + LH roll spoilers) and its mirror image', RULES.length === 1 && RULES[0].c === 'AA' && RULES[0].mirror === 'BB', JSON.stringify(RULES));
const BOOK_RULES = X.rules(X.minimal(ORDER.filter(c => BOOK[c] === 2), BOOK_COLS), BOOK_COLS, {});
check('book example: three named rules', BOOK_RULES.map(r => r.c).join() === 'FDOO,FODO,FOOD', JSON.stringify(BOOK_RULES));
let refused = false; const am = {}; X.answer(am, 'AO', 1, ROLL, { mirror: false });
try { X.answer(am, 'AO', 0, ROLL, { mirror: true }); } catch (_) { refused = true; }
check('changing a given answer to its opposite is refused', refused);
let refusedM = false; const am2 = { AO: 1, BO: 0 };
try { X.answer(am2, 'AO', 1, ROLL, { mirror: true }); } catch (e) { refusedM = /mirror/i.test(e.message); }
check('a mirror image answered differently is refused, in words', refusedM);

console.log('F  order and guards');
let contra = false; const ac = {}; X.answer(ac, 'FDOO', 0, BOOK_COLS, {});
try { X.answer(ac, 'DDOO', 1, BOOK_COLS, {}); } catch (_) { contra = true; }
check('an answer that breaks the order is refused (a lesser mix cannot be worse than a safe bigger one)', contra);
const sf = X.solve(BOOK_COLS, { FDOO: 1 }, { lo: 0, hi: 1 });
check('a filled-in case names the answer it came from', sf.by.FFFF.src === 'logic' && sf.by.FFFF.from === 'FDOO' && sf.by.OOOO.level === null);
const MAL = X.columns([{ id: 'w', states: ['F', 'D', 'O'] }, { id: 'p', states: ['M', 'O'] }]);
check('a malfunction is comparable only with operational', X.le('OO', 'OM', MAL) && !X.le('OM', 'FO', MAL) && X.le('DO', 'FM', MAL) && !X.le('DM', 'FO', MAL));
let capped = ''; try { X.cases(X.columns(Array.from({ length: 10 }, (_, i) => ({ id: 'c' + i, states: ['F', 'D', 'O'] })))); } catch (e) { capped = e.message; }
check('a table over the cap is refused with its size, never sampled', /59049/.test(capped) && /nothing is sampled/.test(capped), capped);
let bad = 0; [[{ id: 'x', states: ['F'] }], [{ id: 'x', states: ['A', 'O'] }], [{ id: 'x', states: ['D', 'A', 'B', 'O'] }], [{ id: 'x', states: ['Q', 'O'] }]].forEach(cs => { try { X.columns(cs); } catch (_) { bad++; } });
check('a column the order cannot carry is refused (no operational state, one side only, mixed partials, unknown state)', bad === 4, bad);

console.log('G  property: questions plus inference reproduce any monotone truth');
let seed = 20261115; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const KINDS = [['F', 'D', 'O'], ['F', 'A', 'B', 'O'], ['F', 'O'], ['M', 'O'], ['F', 'D', 'O']];
let trials = 0, exactAll = true, neverReAsk = true, maxQ = 0, monoAll = true;
for (let t = 0; t < 120; t++) {
    const n = 2 + Math.floor(rnd() * 3);
    const cols = X.columns(Array.from({ length: n }, (_, i) => { const st = KINDS[Math.floor(rnd() * KINDS.length)]; return { id: 'c' + i, states: st, sided: st.length === 3 && rnd() < 0.3 }; }));
    const all = X.cases(cols), top = 1 + Math.floor(rnd() * 2);
    // a random monotone truth: a random level per case, then lifted so that worse is never better
    const truth = {}; all.forEach(c => { truth[c] = Math.floor(rnd() * (top + 1)); });
    let changed = true; while (changed) { changed = false; all.forEach(a => all.forEach(b => { if (X.le(a, b, cols) && truth[a] > truth[b]) { truth[b] = truth[a]; changed = true; } })); }
    all.forEach(a => all.forEach(b => { if (X.le(a, b, cols) && truth[a] > truth[b]) monoAll = false; }));
    const r = runTwoPhase(cols, truth, top, false);
    if (!all.every(c => r.got[c] === truth[c])) exactAll = false;
    if (r.reAsk) neverReAsk = false;
    maxQ = Math.max(maxQ, r.q1 / all.length, r.q2 / all.length); trials++;
}
check(trials + ' random truths are monotone as built', monoAll);
check('every one reproduced exactly', exactAll);
check('no settled case is ever asked again, and each round never asks more questions than there are cases', neverReAsk && maxQ <= 1, maxQ);

console.log('H  hygiene');
check('no em dash', SRC.indexOf(String.fromCharCode(0x2014)) === -1);
check('no eval, no Function constructor', !/\beval\s*\(/.test(SRC) && !/new\s+Function\s*\(/.test(SRC));
check('pure: no document, no localStorage', !/\bdocument\./.test(SRC) && !/localStorage/.test(SRC));
check('version exported', X.VERSION === '1.0');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
