#!/usr/bin/env node
/*
 * Regression — unsafe system operating conditions (23 Sep 2026, standards gap
 * G5; ASTM F3061 §4.2.6 and Appendix X2).
 *
 *   U1  the shape: Major-or-less → Hazardous/Catastrophic, or Hazardous →
 *       Catastrophic; nothing else
 *   U2  candidates come from FCIM aware/unaware pairs whose "aware" row governs
 *       and whose unaware outcome has the shape; a pair governed by "unaware",
 *       an undecided pair, or one without the shape is not a candidate; a
 *       recorded one stops being a candidate
 *   U3  recording and findings (INV-54): undispositioned candidates; a USOC
 *       missing crew information / action / time / procedure / evidence;
 *       open and failed substantiation calls; "not a USOC" without a reason;
 *       a fully substantiated USOC clears
 *   U4  the requirement (F3061 §4.2.6): one shall — timely crew information so
 *       the action completes before escalation; rationale with detection, time,
 *       procedure, evidence and the three calls; verification by test when the
 *       evidence is a test; the fingerprint moves with every call
 *   U5  EXECUTED — the editor works on a draft: Cancel changes nothing, Save
 *       writes; a hand-added pair without the shape is refused
 *   U6  EXECUTED — the real AutoReq generate() picks it up in the crew-awareness
 *       family; wiring: generator registered, AFHA menu, CSV export, loaded
 * Run: node tests/regression_usoc.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('usoc.js');

function model() {
    return {
        acFhaData: [
            { internalId: 1, fcId: 'FC-FQI', fcDesc: 'Loss of fuel quantity indication', severity: 'Major' },
            { internalId: 2, fcId: 'FC-EXH', fcDesc: 'Fuel exhaustion', severity: 'Catastrophic' },
            { internalId: 3, fcId: 'FC-TRIM', fcDesc: 'Slow trim runaway', severity: 'Minor' },
            { internalId: 4, fcId: 'FC-TRIMX', fcDesc: 'Trim runaway to stop', severity: 'Major' },
            { internalId: 5, fcId: 'FC-ICE', fcDesc: 'Undetected icing', severity: 'Hazardous' },
            { internalId: 6, fcId: 'FC-ICEX', fcDesc: 'Loss of control in icing', severity: 'Catastrophic' }
        ],
        acFcimData: [
            { internalId: 'a', subId: 'F-FUEL', pairId: 'P1', pairGoverns: 'aware', awareness: 'Aware', tlId: 'FC-FQI' },
            { internalId: 'b', subId: 'F-FUEL', pairId: 'P1', pairGoverns: 'aware', awareness: 'Unaware', tlId: 'FC-EXH' },
            { internalId: 'c', subId: 'F-TRIM', pairId: 'P2', pairGoverns: 'aware', awareness: 'Aware', tlId: 'FC-TRIM' },
            { internalId: 'd', subId: 'F-TRIM', pairId: 'P2', pairGoverns: 'aware', awareness: 'Unaware', tlId: 'FC-TRIMX' },   // Minor → Major: not the shape
            { internalId: 'e', subId: 'F-ICE', pairId: 'P3', pairGoverns: 'unaware', awareness: 'Aware', tlId: 'FC-ICE' },
            { internalId: 'f', subId: 'F-ICE', pairId: 'P3', pairGoverns: 'unaware', awareness: 'Unaware', tlId: 'FC-ICEX' },  // unaware governs: no credit taken
            { internalId: 'g', subId: 'F-X', pairId: 'P4', pairGoverns: '', awareness: 'Aware', tlId: 'FC-ICE' },
            { internalId: 'h', subId: 'F-X', pairId: 'P4', pairGoverns: '', awareness: 'Unaware', tlId: 'FC-ICEX' }             // undecided
        ],
        projectConfig: {}
    };
}
function load(extra) {
    const sb = Object.assign({ console, Math, JSON, Object, Array, String, Date, setTimeout: () => 0 }, model(), extra || {});
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(SRC, sb, { filename: 'usoc.js' });
    return sb;
}

// ---- U1 ---------------------------------------------------------------------------------
let M = load(), U = M.SLUsoc;
check('U1: Major → Catastrophic, Minor → Hazardous, Hazardous → Catastrophic have the shape', U.isUsocShape('Major', 'Catastrophic') && U.isUsocShape('Minor', 'Hazardous') && U.isUsocShape('Hazardous', 'Catastrophic'));
check('U1: Minor → Major, Hazardous → Hazardous, Catastrophic → anything, downgrades do not', !U.isUsocShape('Minor', 'Major') && !U.isUsocShape('Hazardous', 'Hazardous') && !U.isUsocShape('Catastrophic', 'Catastrophic') && !U.isUsocShape('Major', 'Minor'));

// ---- U2 ---------------------------------------------------------------------------------
let c = U.candidates();
check('U2: only the aware-governed pair with the shape is a candidate (fuel: Major → Catastrophic)', c.length === 1 && c[0].fcIid === 1 && c[0].escFcIid === 2 && c[0].source === 'fcim-pair:P1', JSON.stringify(c));
const u1 = U.record(c[0], 'usoc');
check('U2: once recorded it is no longer a candidate', U.candidates().length === 0 && u1.id === 'USOC-1' && M.projectConfig.usocs.length === 1);

// ---- U3 ---------------------------------------------------------------------------------
M = load(); U = M.SLUsoc;
let f = U.findings();
check('U3: an undispositioned candidate is listed', f.length === 1 && f[0].kind === 'candidate' && /FC-FQI .* → FC-EXH/.test(f[0].text));
const u = U.record(U.candidates()[0], 'usoc');
f = U.findings();
check('U3: a new USOC lists what is missing and all three calls open', f.some(x => x.kind === 'incomplete' && /how the crew finds out, the crew action, the time available before escalation, procedure decision .*, evidence the cue is clear/.test(x.text)) && f.filter(x => x.kind === 'open').length === 3, JSON.stringify(f.map(x => x.text)));
Object.assign(u, { detection: 'alert', alertRef: '', crewAction: 'Land at nearest suitable airport', timeAvailable: '30 min', procedure: 'afm', procedureRef: '', clarity: 'flight-test', clarityRef: 'FT-114' });
check('U3: an alert with no name and a flight-manual procedure with no reference are still missing', U.missing(u).join('|') === 'which alert|the flight manual procedure reference');
u.alertRef = 'FUEL LOW caution'; u.procedureRef = 'AFM 3.12';
u.subst = { detect: 'yes', action: 'yes', inTime: 'no' };
f = U.findings();
check('U3: a "no" is listed as NOT substantiated — design change needed', f.length === 1 && f[0].kind === 'failed' && /achievable before escalation \(a design change is needed\)/.test(f[0].text));
u.subst.inTime = 'yes';
check('U3: complete and substantiated → no findings', U.findings().length === 0 && U.INV.run().failCount === 0);
const n = U.record({ fcIid: 3, escFcIid: 4, source: 'manual' }, 'not-usoc', '');
check('U3: "not a USOC" needs a reason', U.findings().some(x => x.kind === 'no-reason' && x.u === n));
n.reason = 'Trim runaway is Major at worst';
M.acFhaData[0].severity = 'Catastrophic';
check('U3: if the severities change so the shape no longer holds, it is flagged', U.findings().some(x => x.kind === 'shape'));
M.acFhaData[0].severity = 'Major';

// ---- U4 ---------------------------------------------------------------------------------
const fp = (...xs) => JSON.stringify(xs);
let reqs = U.requirements(fp, 'ac');
check('U4: one requirement per USOC (the ruled-out one yields none); aircraft scope only', reqs.length === 1 && U.requirements(fp, 'sys-S1').length === 0);
const r = reqs[0];
check('U4: one shall — timely crew information so the action completes before escalation',
    r.text === 'The flight crew shall be given timely information of FC-FQI "Loss of fuel quantity indication" so that "Land at nearest suitable airport" can be completed before it escalates to FC-EXH "Fuel exhaustion".' && (r.text.match(/shall/g) || []).length === 1, r.text);
check('U4: rationale carries detection (F3117), time, procedure, evidence and the three calls', /Major on its own, Catastrophic if the crew does not act/.test(r.rat) && /alert FUEL LOW caution per ASTM F3117/.test(r.rat) && /Time available: 30 min/.test(r.rat) && /flight manual procedure AFM 3\.12/.test(r.rat) && /Flight test \(FT-114\)/.test(r.rat) && /achievable before escalation: yes/.test(r.rat));
check('U4: verified by test when the evidence is a test; traced by USOC id; stable source id', r.verifMethod === 'Test' && r.traceId === 'USOC-1' && r.reqSource.sourceId === 'ac:usoc:USOC-1' && r.reqSource.generator === 'usoc-info');
const fp1 = r.reqSource.fingerprint; u.subst.action = 'open';
check('U4: the fingerprint moves when a call moves (so the change surfaces in review)', U.requirements(fp, 'ac')[0].reqSource.fingerprint !== fp1);

// ---- U5 EXEC: the editor works on a draft ------------------------------------------------
const els = {};
const ovl = { innerHTML: '', style: {}, remove() { doc.__ov = null; }, querySelector: () => null, querySelectorAll: () => [] };
const doc = { __ov: null, createElement: () => ovl, getElementById: id => (id === 'usoc-overlay' ? doc.__ov : (els[id] || null)), body: { appendChild: x => { doc.__ov = x; } } };
let toasts = [];
const E = load({ document: doc, scheduleAutosave() { E.__saved = (E.__saved || 0) + 1; }, showToast: m => toasts.push(m) });
E.SLUsoc.open();
check('U5 EXEC: the editor opens with the candidate listed', !!doc.__ov && /Record as USOC/.test(ovl.innerHTML) && /FC-FQI/.test(ovl.innerHTML));
E.SLUsoc._take(0, 'usoc');
check('U5 EXEC: recording in the editor changes the draft, not the project', E.SLUsoc._draftFor().usocs.length === 1 && !(E.projectConfig.usocs || []).length);
E.SLUsoc.close();
check('U5 EXEC: Cancel leaves the project exactly as it was', !(E.projectConfig.usocs || []).length && !E.projectConfig.usocCounter);
E.SLUsoc.open();
els['usoc-new-from'] = { value: '3' }; els['usoc-new-to'] = { value: '4' };
E.SLUsoc._addManual();
check('U5 EXEC: a hand-added pair without the shape is refused, with a reason', E.SLUsoc._draftFor().usocs.length === 0 && /Not a USOC shape/.test(toasts.join(' ')));
els['usoc-new-from'] = { value: '5' }; els['usoc-new-to'] = { value: '6' };
E.SLUsoc._addManual(); E.SLUsoc._take(0, 'not-usoc'); E.SLUsoc._save();
check('U5 EXEC: Save writes the draft (a manual USOC and a ruled-out candidate) and saves', E.projectConfig.usocs.length === 2 && E.projectConfig.usocs[0].source === 'manual' && E.projectConfig.usocs[1].disposition === 'not-usoc' && E.projectConfig.usocCounter === 2 && E.__saved === 1 && !doc.__ov);

// ---- U6 ---------------------------------------------------------------------------------
const ASR = read('assurance_modules.js'), SL = read('safety_lab.js'), IDX = read('index.html');
check('U6: the requirement joins the crew-awareness family in generate() and its scope filter', /if\(opts\.fcimMonitor && typeof SLUsoc !== 'undefined'\) candidates\.push\(\.\.\.SLUsoc\.requirements\(fp, scope\)\)/.test(ASR) && /\(g === 'fcim-monitor' \|\| g === 'usoc-info'\) && opts\.fcimMonitor/.test(ASR));
check('U6: registered in the template map, both label maps and the order', /'usoc-info':\s+\{ text: '\$\{text\}'/.test(ASR) && /'usoc-info':\s+'USOC → Timely crew information/.test(ASR) && /'usoc-info':\s+'Unsafe operating condition → Timely crew information requirement'/.test(SL) && /'zsa-phys', 'usoc-info'\s*\n\s*\];/.test(SL));
check('U6: on the AFHA menu (editor and CSV export); loaded by the page', /onclick="SLUsoc\.open\(\)"/.test(IDX) && /onclick="SLUsoc\.download\(\)"/.test(IDX) && /<script src="usoc\.js\?v=[\d.]+" defer><\/script>/.test(IDX));
const csv = E.SLUsoc.exportCsv().split('\n');
check('U6: the CSV lists every USOC with its evidence columns', csv.length === 3 && /"Detection acceptable","Action reasonable","Achievable in time"/.test(csv[0]) && /"not-usoc"/.test(csv[2]));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
