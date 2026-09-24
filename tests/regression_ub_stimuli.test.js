#!/usr/bin/env node
/*
 * Regression — integration stimuli looking for unintended behavior (23 Sep
 * 2026, standards gap G6; ARP4754B §4.6.4).
 *
 *   S1  suggestions come from the project's own model: basic events in trees
 *       for Catastrophic / Hazardous FCs (aircraft and system; not Major),
 *       consecutive flight phases, FCIM functions; accepted or turned-down
 *       suggestions stop appearing; nothing is added without accepting
 *   S2  findings (INV-56, read-only): no strategy, no rationale, no stimuli,
 *       pending suggestions, missing kind / stimulus / pass criteria, planned
 *       not run, run without date / observation / evidence / assessment,
 *       found without a problem report, a missing problem report; a complete
 *       set clears; a project with no work is not nagged
 *   S3  verification matrix rows: same columns as requirement rows, the
 *       conclusion says what happened; aircraft reports carry all, a system
 *       report its own; EXECUTED through the real reports.js builder
 *   S4  EXECUTED — the editor works on a draft: Cancel changes nothing, Save
 *       writes strategy, accepted and hand-added stimuli, and turned-down
 *       suggestions
 *   S5  export and wiring: CSV, Appendix A row A5-4, INV-56 registered, the
 *       Requirements Repository buttons, loaded after pa_audit.js, no eval
 * Run: node tests/regression_ub_stimuli.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('ub_stimuli.js');

function model() {
    return {
        acFhaData: [
            { internalId: 1, fcId: 'FC-01', fcDesc: 'Loss of pitch control', severity: 'Catastrophic' },
            { internalId: 2, fcId: 'FC-02', fcDesc: 'Loss of cabin lights', severity: 'Major' }
        ],
        systemsData: [{ id: 'S-FCS', name: 'Flight controls', fha: [{ internalId: 10, fcId: 'SFC-01', severity: 'Hazardous' }] }],
        ftaPages: [
            { id: 'p1', linkedFhaId: 1, root: { id: 1, type: 'gate', name: 'top', children: [{ id: 2, type: 'basic', name: 'Servo A jams', children: [] }, { id: 3, type: 'gate', children: [{ id: 4, type: 'basic', name: 'Sensor drift', logicalId: 'L-SD', children: [] }] }] } },
            { id: 'p2', linkedFhaId: 2, root: { id: 5, type: 'gate', children: [{ id: 6, type: 'basic', name: 'Bulb fails', children: [] }] } },
            { id: 'p3', linkedFhaIds: [10], root: { id: 7, type: 'basic', name: 'Actuator hydraulic leak', children: [] } }
        ],
        flightPhasesData: [{ phase: 'Takeoff' }, { phase: 'Climb' }, { phase: 'Cruise' }],
        acFcimData: [{ subId: 'F-PITCH', tlDesc: 'Pitch control' }, { subId: 'F-PITCH', tlDesc: 'dup' }, { subId: 'F-ROLL' }],
        projectConfig: { problemReports: [{ id: 'PR-001' }] }
    };
}
function load(extra, mod) {
    const sb = Object.assign({ console, Math, JSON, Object, Array, String, Number, Date, setTimeout: () => 0 }, mod || model(), extra || {});
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(SRC, sb, { filename: 'ub_stimuli.js' });
    return sb;
}
const kinds = f => f.map(x => x.kind);

// ---- S1 suggestions -----------------------------------------------------------------------
let M = load(), S = M.SLStimuli;
let sug = S.suggestions();
const src = sug.map(x => x.source);
check('S1: basic events under Catastrophic / Hazardous trees are failure-injection suggestions', src.includes('fta:2') && src.includes('fta:L-SD') && src.includes('fta:7') && sug.find(x => x.source === 'fta:2').kind === 'failure-injection', JSON.stringify(src));
check('S1: a Major tree gives no suggestion', !src.includes('fta:6'));
check('S1: a system tree targets its system', sug.find(x => x.source === 'fta:7').target === 'S-FCS' && sug.find(x => x.source === 'fta:2').target === 'aircraft');
check('S1: each flight phase change is a mode-transition suggestion', src.includes('phase:Takeoff>Climb') && src.includes('phase:Climb>Cruise') && sug.filter(x => x.kind === 'mode-transition').length === 2);
check('S1: each FCIM function once, as combined failures', sug.filter(x => x.kind === 'combined').map(x => x.source).join() === 'fcim:F-PITCH,fcim:F-ROLL');
check('S1: a function with several FCIM rows is described from its first row', /"Pitch control"/.test(sug.find(x => x.source === 'fcim:F-PITCH').text));
check('S1: every suggestion has pass criteria', sug.every(x => x.expected && x.text));
check('S1: suggesting adds nothing to the project', !(M.projectConfig.ubStimuli || []).length && !M.projectConfig.ubStrategy);
const st1 = S.accept(sug[0]); S.dismiss(sug[1]);
check('S1: accepted and turned-down suggestions stop appearing', S.suggestions().length === sug.length - 2 && st1.id === 'STIM-1' && st1.source === sug[0].source && st1.status === 'planned' && st1.unintended === 'open');

// ---- S2 findings --------------------------------------------------------------------------
M = load(); S = M.SLStimuli;
check('S2: the checks never write to the project', (S.findings(), S.summary(), S.INV.run(), S.verificationRows(null), S.exportCsv(), JSON.stringify(M.projectConfig) === JSON.stringify(model().projectConfig)), JSON.stringify(M.projectConfig));
let f = S.findings();
check('S2: an empty start flags no strategy, no stimuli, pending suggestions', kinds(f).join() === 'no-strategy,no-stimuli,suggestions', kinds(f).join());
check('S2: a project with no work is not nagged', load({}, { projectConfig: {} }).SLStimuli.findings().length === 0);
S.strategy().approach = 'Rig test with failure injection';
check('S2: a strategy with no rationale is flagged', kinds(S.findings()).includes('no-rationale') && !kinds(S.findings()).includes('no-strategy'));
S.strategy().rationale = 'Covers every Cat/Haz basic event and every phase change';
S.suggestions().forEach(x => S.dismiss(x));
const s = S.add({});
f = S.findings();
check('S2: a blank stimulus is flagged for kind, stimulus, pass criteria, and not run', ['no-kind', 'no-text', 'no-expected', 'not-run'].every(k => kinds(f).includes(k)) && !kinds(f).includes('suggestions'), kinds(f).join());
Object.assign(s, { kind: 'abnormal-input', text: 'Air data out of range', expected: 'Flagged invalid; no mode change' });
check('S2: a described stimulus that has not run is listed as planned', kinds(S.findings()).join() === 'not-run');
s.status = 'run';
f = S.findings();
check('S2: a run with nothing recorded is flagged for date, observed, evidence, assessment', kinds(f).join() === 'no-date,no-observed,no-evidence,not-assessed', kinds(f).join());
Object.assign(s, { runDate: '2026-09-20', observed: 'Autopilot disengaged with no alert', evidence: 'RIG-042', unintended: 'found' });
check('S2: unintended behavior found without a problem report is flagged', kinds(S.findings()).join() === 'found-no-pr');
s.prRef = 'PR-009';
check('S2: a problem report that does not exist is flagged', kinds(S.findings()).join() === 'pr-dangling');
s.prRef = 'PR-001';
check('S2: a complete set clears', S.findings().length === 0, JSON.stringify(S.findings()));
const sm = S.summary();
check('S2: the summary counts stimuli, runs and finds', sm.strategy && sm.stimuli === 1 && sm.run === 1 && sm.found === 1 && sm.problems === 0);

// ---- S3 verification matrix rows ----------------------------------------------------------
const s2 = S.add({ kind: 'failure-injection', target: 'S-FCS', text: 'Leak', expected: 'Alert only' });
let rows = S.verificationRows(null);
const COLS = ['Requirement', 'Associated function', 'Verification method(s) applied', 'Verification procedure & results reference(s)', 'Verification conclusion (pass/fail, coverage)'];
check('S3: rows use exactly the requirement columns', rows.every(r => JSON.stringify(Object.keys(r)) === JSON.stringify(COLS)));
check('S3: a found result names its problem report and what was seen', /Unintended behavior found: PR-001 \(Autopilot disengaged/.test(rows[0]['Verification conclusion (pass/fail, coverage)']) && rows[0]['Verification procedure & results reference(s)'] === 'RIG-042');
check('S3: a planned stimulus is pending; the target is named', rows[1]['Verification conclusion (pass/fail, coverage)'] === 'Pending (planned)' && rows[1]['Associated function'] === 'Flight controls');
s2.status = 'run'; s2.unintended = 'none'; s2.runDate = '2026-09-21';
check('S3: a clean run passes with its date', S.verificationRows(null)[1]['Verification conclusion (pass/fail, coverage)'] === 'Pass: no unintended behavior seen (2026-09-21)');
check('S3: an aircraft report carries all, a system report only its own', S.verificationRows(null).length === 2 && S.verificationRows('S-FCS').length === 1 && S.verificationRows('S-FCS')[0]['Requirement'].indexOf('STIM-2') >= 0);
// EXECUTED through the real builder in reports.js
const rep = read('reports.js');
const i0 = rep.indexOf('function _buildVerificationMatrix(reqSource, sys)');
const i1 = rep.indexOf('\n    }\n', i0) + 6;
check('S3: reports.js passes the report scope to the builder', /verification_matrix: _buildVerificationMatrix\(reqSource, sys\)/.test(rep));
const bsb = { SLStimuli: S }; vm.createContext(bsb);
vm.runInContext(rep.slice(i0, i1) + '\nthis.B = _buildVerificationMatrix;', bsb);
const acRows = bsb.B([{ id: 'REQ-1', text: 'x', verifMethod: 'Test', verifStatus: 'Passed' }], null);
const sysRows = bsb.B([], { id: 'S-FCS' });
check('S3 EXEC: the aircraft matrix is requirements then all stimuli', acRows.length === 3 && /^REQ-1/.test(acRows[0]['Requirement']) && /STIM-1/.test(acRows[1]['Requirement']) && JSON.stringify(Object.keys(acRows[2])) === JSON.stringify(Object.keys(acRows[0])));
check('S3 EXEC: a system matrix carries only that system\'s stimuli', sysRows.length === 1 && /STIM-2/.test(sysRows[0]['Requirement']));
const nsb = {}; vm.createContext(nsb); vm.runInContext(rep.slice(i0, i1) + '\nthis.B = _buildVerificationMatrix;', nsb);
check('S3 EXEC: without the module the matrix is unchanged', nsb.B([{ id: 'R' }], null).length === 1);

// ---- S4 EXEC editor on a draft ------------------------------------------------------------
function fakeOverlay(doc) {
    const typed = doc.typed;
    function fields(html, attr) {
        const out = [], re = new RegExp('<(input|select)([^>]*?)data-' + attr + '="([^"]+)"([^>]*)>', 'g'); let m;
        while ((m = re.exec(html))) {
            let v = '';
            if (m[1] === 'input') { const x = /value="([^"]*)"/.exec(m[2] + m[4]); v = x ? x[1] : ''; }
            else { const body = html.slice(re.lastIndex, html.indexOf('</select>', re.lastIndex)); const sel = /<option value="([^"]*)" selected/.exec(body) || /<option value="([^"]*)"/.exec(body); v = sel ? sel[1] : ''; }
            out.push({ k: m[3], v });
        }
        return out;
    }
    const el = (scope, f) => { const key = scope + '|' + f.k; return { value: key in typed ? typed[key] : f.v.replace(/&amp;/g, '&'), getAttribute: () => f.k }; };
    const ov = {
        innerHTML: '', style: {}, remove() { doc.__ov = null; },
        querySelectorAll(sel) { if (sel === '.ubs-strategy [data-p]') { const h = ov.innerHTML; const i = h.indexOf('ubs-strategy'); return fields(h.slice(i, h.indexOf('Suggested from the model', i)), 'p').map(f => el('strategy', f)); } return []; },
        querySelector(sel) {
            const id = /data-id="([^"]+)"/.exec(sel)[1]; const h = ov.innerHTML;
            const at = h.indexOf('class="ubs-card" data-id="' + id + '"'); if (at < 0) return null;
            const nx = h.indexOf('class="ubs-card"', at + 10); const seg = h.slice(at, nx < 0 ? h.length : nx);
            return { querySelectorAll: () => fields(seg, 'f').map(f => el(id, f)) };
        }
    };
    return ov;
}
const doc = { __ov: null, typed: {} };
doc.createElement = () => fakeOverlay(doc);
doc.body = { appendChild(o) { doc.__ov = o; } };
doc.getElementById = id => (id === 'ubs-overlay' ? doc.__ov : null);
const E = load({ document: doc, scheduleAutosave() { E.__saved = (E.__saved || 0) + 1; } });
E.SLStimuli.open();
check('S4 EXEC: the editor opens with the strategy and the suggestions', !!doc.__ov && /Why it is enough/.test(doc.__ov.innerHTML) && /Servo A jams/.test(doc.__ov.innerHTML));
E.SLStimuli._accept(0); E.SLStimuli._dismiss(0);
check('S4 EXEC: accepting and turning down change the draft, not the project', E.SLStimuli._draftFor().stimuli.length === 1 && E.SLStimuli._draftFor().dismissed.length === 1 && !(E.projectConfig.ubStimuli || []).length);
E.SLStimuli.close();
check('S4 EXEC: Cancel leaves the project exactly as it was', JSON.stringify(E.projectConfig) === JSON.stringify(model().projectConfig));
E.SLStimuli.open();
doc.typed['strategy|approach'] = 'Iron-bird rig';
doc.typed['strategy|rationale'] = 'All Cat/Haz events';
E.SLStimuli._accept(0);
E.SLStimuli._addManual();
Object.assign(doc.typed, { 'STIM-2|kind': 'boundary-timing', 'STIM-2|target': 'S-FCS', 'STIM-2|text': 'Bus at 110% load', 'STIM-2|expected': 'No frame drops', 'STIM-2|status': 'run', 'STIM-2|unintended': 'none' });
E.SLStimuli._dismiss(0);
E.SLStimuli._save();
const pc = E.projectConfig;
check('S4 EXEC: Save writes the strategy, the accepted and hand-added stimuli, and the turned-down suggestion', pc.ubStrategy.approach === 'Iron-bird rig' && pc.ubStrategy.rationale === 'All Cat/Haz events' && pc.ubStimuli.length === 2 &&
    pc.ubStimuli[0].source === 'fta:2' && pc.ubStimuli[1].kind === 'boundary-timing' && pc.ubStimuli[1].target === 'S-FCS' && pc.ubStimuli[1].status === 'run' && pc.ubDismissed.length === 1 && pc.ubCounter === 2 && E.__saved === 1 && !doc.__ov, JSON.stringify(pc));

// ---- S5 export and wiring -----------------------------------------------------------------
const csv = S.exportCsv().split('\n');
check('S5: the CSV carries the strategy, then one row per stimulus', csv.length === 4 && /^"Strategy","Rig test with failure injection"/.test(csv[0]) && /"STIM-1","Abnormal input","Aircraft"/.test(csv[2]) && /"Flight controls"/.test(csv[3]));
const regs = [];
load({ invRegister: i => regs.push(i.id) });
check('S5: INV-56 is registered as advisory', regs.includes('INV-56') && S.INV.sev === 'advisory');
const om = read('objectives_matrix.js');
check('S5: Appendix A row A5-4 reads the stimuli summary', /id: 'A5-4', grp: 'A-5 Verification'/.test(om) && /SLStimuli\.summary\(\)/.test(om));
const idx = read('index.html');
const repo = idx.slice(idx.indexOf('<div id="view-reqs-repo"'), idx.indexOf('<div id="view-trace"'));
check('S5: the Requirements Repository opens the stimuli and exports them', /onclick="SLStimuli\.open\(\)"/.test(repo) && /onclick="SLStimuli\.download\(\)"/.test(repo));
check('S5: ub_stimuli.js loads right after pa_audit.js, before reports.js', /pa_audit\.js\?v=[\d.]+" defer><\/script>\s*<script src="ub_stimuli\.js\?v=[\d.]+" defer><\/script>/.test(idx) && idx.indexOf('ub_stimuli.js') < idx.indexOf('src="reports.js'));
check('S5: no eval in the module (the page CSP forbids it)', !/\beval\s*\(/.test(SRC));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
