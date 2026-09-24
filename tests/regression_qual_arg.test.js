#!/usr/bin/env node
/*
 * Regression — the qualitative argument behind a qualitative-only call
 * (23 Sep 2026, standards proposal P1; ASTM F3230-21a Appendix X2).
 *
 *   Q1  which rows need an argument: exactly those the REAL decideAnalysisDepth
 *       (sliced from assurance_modules.js) puts on the qualitative path —
 *       "simple and conventional" Cat/Haz, "simple" / "redundant" Major, and
 *       uncharacterized Cat/Haz on Part 23 Class I/II; not the quantitative
 *       path, not similarity, not Minor; aircraft and system rows
 *   Q2  the checks (INV-57, read-only): no argument; unanswered conventional /
 *       simple; a "yes" with no basis; no likelihood argument or evidence;
 *       Cat/Haz common cause open, defeating, or unreferenced (not asked of
 *       Major); contradictions with the chart answer; "supported" for a Cat/Haz
 *       that is not both simple and conventional; "not supported" still on the
 *       path; unsigned; a complete argument clears
 *   Q3  the report line and column: says what was argued and how many points
 *       are open; flags a qualitative-only row with no argument; nothing for a
 *       row that needs none; the real reports.js row mapper carries the column
 *   Q4  EXECUTED — the editor works on a draft of the row's argument: Cancel
 *       changes nothing, Save writes to the row (aircraft and system), and the
 *       chart walkthrough's button opens the row it is showing
 *   Q5  export and wiring: CSV, INV-57 registered, the chart button and AFHA
 *       menu entry, loaded after ub_stimuli.js, no eval
 * Run: node tests/regression_qual_arg.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('qual_arg.js');
const ASR = read('assurance_modules.js');
const slice = (from, to) => { const i = ASR.indexOf(from), j = ASR.indexOf(to, i); if (i < 0 || j < 0) throw new Error('slice ' + from); return ASR.slice(i, j); };
const DEPTH_SRC = slice('function certBasisForChart()', '// Phase 53.13/14/18') + slice('function decideAnalysisDepth(fha, certBasis)', '// Phase 53.17');

function model() {
    return {
        acFhaData: [
            { internalId: 1, fcId: 'FC-BRK', fcDesc: 'Loss of all wheel braking', severity: 'Hazardous', chartProps: { isSimpleConventional: true } },
            { internalId: 2, fcId: 'FC-PITCH', fcDesc: 'Loss of pitch control', severity: 'Catastrophic', chartProps: { isSimpleConventional: false } },
            { internalId: 3, fcId: 'FC-LT', fcDesc: 'Loss of nav lights', severity: 'Major', chartProps: { isSimple: true } },
            { internalId: 4, fcId: 'FC-MIN', fcDesc: 'Cabin light out', severity: 'Minor', chartProps: {} },
            { internalId: 5, fcId: 'FC-SIM', fcDesc: 'Loss of fuel quantity', severity: 'Major', chartProps: { similarPrior: true } },
            { internalId: 6, fcId: 'FC-UNC', fcDesc: 'Loss of stall warning', severity: 'Hazardous', chartProps: {} }
        ],
        systemsData: [{ id: 'S-LG', name: 'Landing gear', fha: [{ internalId: 1, fcId: 'SFC-GEAR', severity: 'Major', chartProps: { isRedundant: true } }] }],
        projectConfig: { regulation: 'Part 25' }
    };
}
function load(extra, mod) {
    const sb = Object.assign({ console, Math, JSON, Object, Array, String, Number, Date, setTimeout: () => 0 }, mod || model(), extra || {});
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(DEPTH_SRC + '\nthis.AutoReq = { decideAnalysisDepth: decideAnalysisDepth };', sb, { filename: 'depth.js' });
    vm.runInContext(SRC, sb, { filename: 'qual_arg.js' });
    return sb;
}
const kinds = f => f.map(x => x.kind);
function full(over) {
    return Object.assign({
        conventional: 'yes', conventionalBasis: 'Same cable-and-drum brake as Model 100 family, 20 years in service',
        simple: 'yes', simpleHow: 'fmea', simpleBasis: 'FMEA-BRK-01',
        likelihood: 'Two independent brakes; either stops the aircraft', likelihoodEvidence: 'ANA-BRK-02',
        cca: { zonal: { done: 'yes', ref: 'ZSA-Z3' }, pra: { done: 'na', ref: 'no rotating machinery in the zone' }, cmm: { done: 'yes', ref: 'CMA-07' } },
        conclusion: 'supported', by: 'J. Engineer', date: '2026-09-23'
    }, over || {});
}

// ---- Q1 which rows need an argument --------------------------------------------------------
let M = load(), Q = M.SLQualArg;
const qual = Q.rows().filter(r => Q.isQualitative(r.fha)).map(r => r.fha.fcId);
check('Q1: Part 25 — simple-and-conventional Haz, simple Major and redundant system Major are qualitative-only', JSON.stringify(qual) === JSON.stringify(['FC-BRK', 'FC-LT', 'SFC-GEAR']), JSON.stringify(qual));
check('Q1: the quantitative path, similarity, Minor and an uncharacterized Part 25 Haz need no argument', ['FC-PITCH', 'FC-SIM', 'FC-MIN', 'FC-UNC'].every(id => !qual.includes(id)));
const M2 = load({}, Object.assign(model(), { projectConfig: { regulation: 'Part 23', part23Class: 'II' } }));
check('Q1: Part 23 Class II — an uncharacterized Haz goes qualitative by default, so it needs one too', M2.SLQualArg.rows().filter(r => M2.SLQualArg.isQualitative(r.fha)).map(r => r.fha.fcId).includes('FC-UNC'));
check('Q1: rows are found by id and where they live (aircraft id 1 and system id 1 are different rows)', Q.find(1, null).fha.fcId === 'FC-BRK' && Q.find(1, 'S-LG').fha.fcId === 'SFC-GEAR' && Q.find(1, 'nope') === null);

// ---- Q2 the checks -------------------------------------------------------------------------
M = load(); Q = M.SLQualArg;
check('Q2: the checks never write to the project', (Q.findings(), Q.INV.run(), Q.exportCsv(), Q.rows().forEach(r => Q.line(r.fha)), JSON.stringify(M.acFhaData) === JSON.stringify(model().acFhaData) && JSON.stringify(M.systemsData) === JSON.stringify(model().systemsData)));
let f = Q.findings();
check('Q2: each qualitative-only row with no argument is listed, with where it lives', f.length === 3 && f.every(x => x.kind === 'none') && /^SFC-GEAR \(Major, Landing gear\)/.test(f[2].text), JSON.stringify(f.map(x => x.text)));
const brk = M.acFhaData[0];
brk.qualArg = full();
check('Q2: a complete argument clears', Q.check(brk).length === 0, JSON.stringify(Q.check(brk)));
brk.qualArg = full({ conventional: '', simple: '' });
check('Q2: unanswered conventional and simple are flagged', kinds(Q.check(brk)).filter(k => k === 'incomplete').length === 2);
brk.qualArg = full({ conventionalBasis: ' ', simpleHow: '' });
check('Q2: a "yes" with no basis is flagged (conventional basis; simple method)', kinds(Q.check(brk)).filter(k => k === 'no-basis').length === 2);
brk.qualArg = full({ likelihood: '' });
check('Q2: no likelihood argument is flagged', kinds(Q.check(brk)).join() === 'no-likelihood');
brk.qualArg = full({ likelihoodEvidence: '' });
check('Q2: a likelihood argument with no evidence is flagged', kinds(Q.check(brk)).join() === 'no-likelihood-evidence');
brk.qualArg = full({ cca: { zonal: { done: '', ref: '' }, pra: { done: 'no', ref: 'fire zone' }, cmm: { done: 'yes', ref: '' } } });
check('Q2: Cat/Haz common cause — open, defeating, unreferenced are each flagged', kinds(Q.check(brk)).join() === 'cca-open,cca-defeats,cca-no-ref', kinds(Q.check(brk)).join());
const lt = M.acFhaData[2];
lt.qualArg = full({ cca: {} });
check('Q2: common cause is not asked of a Major condition', Q.check(lt).length === 0, JSON.stringify(Q.check(lt)));
brk.qualArg = full({ conventional: 'no', conclusion: 'supported' });
f = kinds(Q.check(brk));
check('Q2: the chart says "simple and conventional", the argument says not conventional — contradiction, twice over for a Haz "supported"', f.filter(k => k === 'contradiction').length === 2, f.join());
lt.qualArg = full({ simple: 'no', cca: {} });
check('Q2: the chart says "simple" for a Major, the argument says not', kinds(Q.check(lt)).join() === 'contradiction');
brk.qualArg = full({ conclusion: 'not-supported' });
check('Q2: "does not support" while still on the qualitative path is flagged', kinds(Q.check(brk)).join() === 'not-supported');
brk.qualArg = full({ conclusion: '' });
check('Q2: no conclusion is flagged', kinds(Q.check(brk)).join() === 'unsigned');
brk.qualArg = full({ by: '' });
check('Q2: a conclusion nobody signed is flagged', kinds(Q.check(brk)).join() === 'unsigned');
brk.qualArg = Object.assign(Q.blank(), { simple: 'no' });
check('Q2: one answer is enough to count as an argument (then the rest is flagged)', !kinds(Q.check(brk)).includes('none') && kinds(Q.check(brk)).includes('no-likelihood'));
brk.qualArg = Q.blank();
check('Q2: an all-blank argument counts as none', kinds(Q.check(brk)).join() === 'none');
const regs = [];
load({ invRegister: i => regs.push(i.id) });
check('Q2: INV-57 is registered as advisory and counts the rows it checked', regs.includes('INV-57') && Q.INV.sev === 'advisory' && Q.INV.run().checked === 3);

// ---- Q3 the report line and column ---------------------------------------------------------
brk.qualArg = full();
let ln = Q.line(brk);
check('Q3: the line says it supports qualitative-only, who signed, and what was argued', /^Supports qualitative-only \(J\. Engineer, 2026-09-23\): conventional: yes \(Same cable/.test(ln) && /simple: yes by fmea \(FMEA-BRK-01\)/.test(ln) && /likelihood: Two independent brakes/.test(ln) && /common cause: zonal yes \[ZSA-Z3\], pra na/.test(ln) && !/open point/.test(ln), ln);
brk.qualArg = full({ likelihoodEvidence: '' });
check('Q3: open points are counted', / · 1 open point\(s\)$/.test(Q.line(brk)));
delete lt.qualArg;
check('Q3: a qualitative-only row with no argument says so; a row that needs none says nothing', Q.line(M.acFhaData[2]) === 'Qualitative only: NO argument recorded' && Q.line(M.acFhaData[1]) === '');
const REP = read('reports.js');
const r0 = REP.indexOf('function _fcEvalToRows(evals)'), r1 = REP.indexOf('\n    }\n', r0) + 6;
const rsb = {}; vm.createContext(rsb); vm.runInContext(REP.slice(r0, r1) + '\nthis.R = _fcEvalToRows;', rsb);
const rrow = rsb.R([{ fcId: 'FC-BRK', qualArgument: 'Supports qualitative-only: …' }])[0];
check('Q3 EXEC: the real report row mapper carries the argument column', rrow['Qualitative Argument (F3230 X2)'] === 'Supports qualitative-only: …' && rsb.R([{ fcId: 'X' }])[0]['Qualitative Argument (F3230 X2)'] === '');
check('Q3: the per-FC evaluation fills it from the module, guarded', /qualArgument: _safeCall\(\(\) => \(typeof SLQualArg !== 'undefined' && fcRow\) \? SLQualArg\.line\(fcRow\) : '', ''\)/.test(REP));

// ---- Q4 EXEC editor on a draft -------------------------------------------------------------
function fakeOverlay(doc) {
    const typed = doc.typed;
    function fields(html, attr) {
        const out = [], re = new RegExp('<(input|select)([^>]*?)data-' + attr + '="([^"]+)"([^>]*)>', 'g'); let m;
        while ((m = re.exec(html))) {
            let v = '';
            if (m[1] === 'input') { const x = /value="([^"]*)"/.exec(m[2] + m[4]); v = x ? x[1] : ''; }
            else { const body = html.slice(re.lastIndex, html.indexOf('</select>', re.lastIndex)); const sel = /<option value="([^"]*)" selected/.exec(body); v = sel ? sel[1] : ''; }
            out.push({ k: m[3], v });
        }
        return out;
    }
    const ov = {
        innerHTML: '', style: {}, remove() { doc.__ov = null; },
        querySelectorAll(sel) { const attr = sel === '[data-a]' ? 'a' : sel === '[data-c]' ? 'c' : null; if (!attr) return []; return fields(ov.innerHTML, attr).map(f => ({ value: (f.k in typed) ? typed[f.k] : f.v.replace(/&amp;/g, '&'), getAttribute: () => f.k })); }
    };
    return ov;
}
const doc = { __ov: null, typed: {} };
doc.createElement = () => fakeOverlay(doc);
doc.body = { appendChild(o) { doc.__ov = o; } };
doc.getElementById = id => (id === 'qarg-overlay' ? doc.__ov : null);
const toasts = [];
const E = load({ document: doc, scheduleAutosave() { E.__saved = (E.__saved || 0) + 1; }, showToast: m => toasts.push(m) });
E.SLQualArg.open(1, null);
check('Q4 EXEC: the editor opens on the row, says it is on the qualitative path, and asks for common cause (Haz)', !!doc.__ov && /Loss of all wheel braking/.test(doc.__ov.innerHTML) && /on the qualitative-only path/.test(doc.__ov.innerHTML) && /4\. Common cause/.test(doc.__ov.innerHTML));
Object.assign(doc.typed, { conventional: 'yes', conventionalBasis: 'Model 100 brakes' });
E.SLQualArg.close();
check('Q4 EXEC: Cancel leaves the row exactly as it was', E.acFhaData[0].qualArg === undefined && !doc.__ov);
E.SLQualArg.open(1, null);
Object.assign(doc.typed, { conventional: 'yes', conventionalBasis: 'Model 100 brakes', simple: 'yes', simpleHow: 'test', simpleBasis: 'TR-9', likelihood: 'Dual', likelihoodEvidence: 'A-1',
    'zonal.done': 'yes', 'zonal.ref': 'Z1', 'pra.done': 'na', 'pra.ref': 'none', 'cmm.done': 'yes', 'cmm.ref': 'C1', conclusion: 'supported', by: 'W', date: '2026-09-23' });
E.SLQualArg._save();
const saved = E.acFhaData[0].qualArg;
check('Q4 EXEC: Save writes the argument onto the row, saves, and confirms', saved && saved.conventionalBasis === 'Model 100 brakes' && saved.simpleHow === 'test' && saved.cca.pra.done === 'na' && saved.cca.cmm.ref === 'C1' && E.__saved === 1 && /FC-BRK/.test(toasts.join()) && !doc.__ov, JSON.stringify(saved));
check('Q4 EXEC: the saved argument clears the row', E.SLQualArg.check(E.acFhaData[0]).length === 0);
doc.typed = { simple: 'yes', simpleHow: 'inspection', simpleBasis: 'INSP-2' };
E.SLQualArg.open(1, 'S-LG');
check('Q4 EXEC: a Major system row is not asked for common cause', /SFC-GEAR/.test(doc.__ov.innerHTML) && !/Common cause<\/div>/.test(doc.__ov.innerHTML));
E.SLQualArg._save();
check('Q4 EXEC: Save on a system row writes to that row, not the aircraft row with the same id', E.systemsData[0].fha[0].qualArg.simpleBasis === 'INSP-2' && E.acFhaData[0].qualArg.simpleBasis === 'TR-9');
doc.typed = {};
E._fhaChartActive = { internalId: 1, scope: 'sys', fha: E.systemsData[0].fha[0] };
E.sys = () => E.systemsData[0];
E.SLQualArg.openFromChart();
check('Q4 EXEC: the chart walkthrough button opens the row it is showing (system scope)', !!doc.__ov && /SFC-GEAR/.test(doc.__ov.innerHTML) && E.SLQualArg._draftFor().sysId === 'S-LG');
E.SLQualArg.close();

// ---- Q5 export and wiring ------------------------------------------------------------------
const csv = E.SLQualArg.exportCsv().split('\n');
check('Q5: the CSV lists every row that needs or has an argument', csv.length === 4 && /"FC","Where","Severity","Qualitative only\?"/.test(csv[0]) && /^"FC-BRK","Aircraft","Hazardous","yes","yes","Model 100 brakes"/.test(csv[1]) && /"FC-LT","Aircraft","Major","yes",""/.test(csv[2]) && /"SFC-GEAR","Landing gear"/.test(csv[3]), csv.join('\n'));
const IDX = read('index.html');
check('Q5: the chart walkthrough has the argument button next to its outcome', /id="fha-chart-outcome"[^\n]*<\/div>\s*<div[^>]*><button[^>]*onclick="SLQualArg\.openFromChart\(\)"/.test(IDX));
check('Q5: the AFHA menu exports the arguments', /onclick="SLQualArg\.download\(\)"/.test(IDX));
check('Q5: qual_arg.js loads right after ub_stimuli.js', /ub_stimuli\.js\?v=[\d.]+" defer><\/script>\s*<script src="qual_arg\.js\?v=[\d.]+" defer><\/script>/.test(IDX));
check('Q5: no eval in the module (the page CSP forbids it)', !/\beval\s*\(/.test(SRC));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
