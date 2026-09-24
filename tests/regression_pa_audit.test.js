#!/usr/bin/env node
/*
 * Regression — process assurance audits (23 Sep 2026, standards gap G7;
 * ARP4754B §5.7 and Appendix E.7).
 *
 *   P1  sampling is repeatable: same seed + same records = same sample; a new
 *       seed picks differently; "full" takes everything; "risk" always takes
 *       every Catastrophic / Hazardous item; the size is the stated percent,
 *       rounded up, never zero while there are records
 *   P2  each process area samples the right records (FCs incl. system FHAs,
 *       requirements, requirements with a verification method, problem
 *       reports); planning areas have no list
 *   P3  findings (INV-55): no PA owner; no audits; a non-independent plan or
 *       auditor at DAL A/B (not at C); an audit missing auditor / date / area;
 *       records to sample but none drawn; the records changed under the seed;
 *       "does not conform" with no finding; "conforms" with an open finding;
 *       a finding with no action; an action with no owner / due date, overdue,
 *       or pointing at no finding; closed with no evidence; a missing problem
 *       report; a complete audit clears
 *   P4  closing an item needs evidence
 *   P5  EXECUTED — the editor works on a draft: Cancel changes nothing, Save
 *       writes the plan, audits, sample and items
 *   P6  export and wiring: CSV, Appendix A row A7-4, INV-55 registered, the
 *       page button, loaded after usoc.js
 * Run: node tests/regression_pa_audit.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('pa_audit.js');

function model() {
    const reqs = [];
    for (let i = 1; i <= 20; i++) reqs.push({ internalId: 100 + i, id: 'REQ-' + String(i).padStart(3, '0'), traceId: i <= 3 ? 'FC-01' : 'FC-02', verifMethod: i % 2 ? 'Test' : '' });
    return {
        acFhaData: [
            { internalId: 1, fcId: 'FC-01', fcDesc: 'Loss of pitch control', severity: 'Catastrophic', dal: 'A' },
            { internalId: 2, fcId: 'FC-02', fcDesc: 'Nuisance caution', severity: 'Minor', dal: 'D' }
        ],
        acReqData: reqs,
        systemsData: [{ id: 'S1', fha: [{ internalId: 3, fcId: 'SFC-01', severity: 'Major' }], req: [{ internalId: 200, id: 'SREQ-001', traceId: 'SFC-01', verifMethod: 'Analysis' }] }],
        projectConfig: { problemReports: [{ id: 'PR-001', safetyRelated: true }, { id: 'PR-002', safetyRelated: false }] }
    };
}
function load(extra, mod) {
    const sb = Object.assign({ console, Math, JSON, Object, Array, String, Number, Date, setTimeout: () => 0 }, mod || model(), extra || {});
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(SRC, sb, { filename: 'pa_audit.js' });
    sb.SLPaAudit._clock = () => new Date('2026-09-23T12:00:00Z');
    return sb;
}
const kinds = f => f.map(x => x.kind);

// ---- P1 sampling --------------------------------------------------------------------------
let M = load(), P = M.SLPaAudit;
const pop = P.population('4754B-5.3');
const s1 = P.drawSample(pop, 'random', 25, 12345), s2 = P.drawSample(pop, 'random', 25, 12345), s3 = P.drawSample(pop, 'random', 25, 999);
check('P1: 25% of 21 requirements is 6 (rounded up)', s1.length === 6, JSON.stringify(s1));
check('P1: the sample is listed in record order', JSON.stringify(s1) === JSON.stringify(s1.slice().sort()));
check('P1: same seed and same records draw the same sample', JSON.stringify(s1) === JSON.stringify(s2));
check('P1: a different seed draws a different sample', JSON.stringify(s1) !== JSON.stringify(s3));
check('P1: the order the records are stored in does not change the sample', JSON.stringify(P.drawSample(pop.slice().reverse(), 'random', 25, 12345)) === JSON.stringify(s1));
check('P1: "full" takes every record', P.drawSample(pop, 'full', 5, 1).length === 21);
const risk = P.drawSample(pop, 'risk', 5, 7);
check('P1: "risk" always takes every Catastrophic / Hazardous-linked record', ['REQ-001', 'REQ-002', 'REQ-003'].every(r => risk.includes(r)), JSON.stringify(risk));
check('P1: a tiny percent still samples at least one record; no records, no sample', P.drawSample(pop, 'random', 1, 3).length === 1 && P.drawSample([], 'random', 50, 3).length === 0);

// ---- P2 populations -----------------------------------------------------------------------
check('P2: safety assessment samples aircraft and system FCs', JSON.stringify(P.population('4754B-5.1').map(p => p.ref)) === JSON.stringify(['FC-01', 'FC-02', 'SFC-01']));
check('P2: requirements capture samples aircraft and system requirements', pop.length === 21 && pop.some(p => p.ref === 'SREQ-001'));
check('P2: verification samples only requirements with a verification method', P.population('4754B-5.5').length === 11);
check('P2: configuration management samples problem reports (safety-related count as risk)', P.population('4754B-5.6').length === 2 && P.population('4754B-5.6')[0].severity === 'Hazardous');
check('P2: planning has no record list', P.population('4754B-3').length === 0 && P.population('nope').length === 0);
check('P2: the highest DAL is read from the FHA', P.highestDal() === 'A');

// ---- P3 findings --------------------------------------------------------------------------
M = load(); P = M.SLPaAudit;
let f = P.findings();
check('P3: an empty project with work flags no owner and no audits', kinds(f).join() === 'plan,none', kinds(f).join());
const Mr = load(); Mr.SLPaAudit.findings(); Mr.SLPaAudit.summary(); Mr.SLPaAudit.INV.run();
check('P3: the checks never write to the project', JSON.stringify(Mr.projectConfig) === JSON.stringify(model().projectConfig), JSON.stringify(Mr.projectConfig));
check('P3: a project with no work is not nagged', load({}, { acFhaData: [], acReqData: [], systemsData: [], projectConfig: {} }).SLPaAudit.findings().length === 0);
P.plan().owner = 'Q. Assurance'; P.plan().independent = 'no';
check('P3: a non-independent PA plan at DAL A is flagged', kinds(P.findings()).includes('plan-indep'));
P.plan().independent = 'yes';
let a = P.addAudit({});
f = P.findings();
check('P3: a new audit is PAA-1, dated today, and inherits plan independence', a.id === 'PAA-1' && a.date === '2026-09-23' && a.independent === 'yes');
check('P3: an audit missing its auditor and area is flagged', f.some(x => x.kind === 'incomplete' && /the auditor, the process area/.test(x.text)), JSON.stringify(f));
a.auditor = 'R. Checker'; a.area = '4754B-5.3';
check('P3: records to sample but none drawn is flagged', kinds(P.findings()).includes('no-sample'));
P.sample(a, 4242);
check('P3: once drawn, the sample and its seed are kept', a.sample.length === 3 && a.seed === 4242 && a.population === 21 && !kinds(P.findings()).includes('no-sample'));
a.independent = 'no';
check('P3: a non-independent auditor at DAL A is flagged', kinds(P.findings()).includes('indep'));
const Mc = load({}, Object.assign(model(), { acFhaData: [{ internalId: 1, fcId: 'FC-01', severity: 'Major', dal: 'C' }] }));
const ac = Mc.SLPaAudit.addAudit({ auditor: 'x', area: '4754B-3', independent: 'no' });
check('P3: at DAL C a non-independent auditor is not flagged', !kinds(Mc.SLPaAudit.findings()).includes('indep') && ac);
a.independent = 'yes';
M.acReqData.push({ internalId: 999, id: 'REQ-000', traceId: 'FC-02', verifMethod: '' });
check('P3: records changing under the seed is flagged (sample no longer reproducible)', kinds(P.findings()).includes('sample-drift'));
M.acReqData.pop();
check('P3: and clears when the records match again', !kinds(P.findings()).includes('sample-drift'));
a.conclusion = 'nonconforms';
check('P3: "does not conform" with no finding is flagged', kinds(P.findings()).includes('nc-no-finding'));
const fd = P.addItem(a, 'finding', { text: 'Derived requirements not fed back to safety', prRef: 'PR-009' });
f = P.findings();
check('P3: a finding with no action item is flagged', kinds(f).includes('finding-no-action') && !kinds(f).includes('nc-no-finding'));
check('P3: a finding linked to a problem report that does not exist is flagged', kinds(f).includes('pr-dangling'));
fd.prRef = 'PR-001';
const act = P.addItem(a, 'action', { text: 'Add feedback step to the requirements process', forId: fd.id });
f = P.findings();
check('P3: item ids run within the audit (PAA-1.1, PAA-1.2)', fd.id === 'PAA-1.1' && act.id === 'PAA-1.2');
check('P3: an action with no owner and no due date is flagged', kinds(f).includes('action-owner') && kinds(f).includes('action-due') && !kinds(f).includes('finding-no-action'));
act.owner = 'Systems lead'; act.due = '2026-09-01';
check('P3: an open action past its due date is overdue', kinds(P.findings()).includes('overdue'));
act.due = '2026-10-15';
check('P3: not overdue before its due date', !kinds(P.findings()).includes('overdue'));
act.status = 'closed'; act.due = '2026-09-01';
check('P3: a closed action is never overdue', !kinds(P.findings()).includes('overdue'));
act.status = 'open'; act.due = '2026-10-15';
const fd2 = P.addItem(a, 'finding', { text: 'Second finding' });
check('P3: an action covers only the finding it names (the second finding still has none)', P.findings().some(x => x.kind === 'finding-no-action' && x.text.indexOf(fd2.id) === 0));
a.items.splice(a.items.indexOf(fd2), 1);
const stray = P.addItem(a, 'action', { text: 'x', owner: 'y', due: '2026-12-01', forId: 'PAA-7.1' });
check('P3: an action pointing at no finding in this audit is flagged', kinds(P.findings()).includes('action-dangling'));
a.items.splice(a.items.indexOf(stray), 1);
a.conclusion = 'conforms';
check('P3: "conforms" while a finding is open is flagged', kinds(P.findings()).includes('conforms-open'));
act.status = 'closed';
check('P3: an item closed with no evidence is flagged', kinds(P.findings()).includes('closed-no-evidence'));
act.status = 'open';

// ---- P4 closing needs evidence ------------------------------------------------------------
check('P4: closing without evidence is refused', P.closeItem(act, '  ') === false && act.status === 'open');
check('P4: closing with evidence records it and the time', P.closeItem(act, 'Process rev C, section 4') && act.status === 'closed' && act.closedAt === '2026-09-23T12:00:00.000Z');
P.closeItem(fd, 'Verified by re-audit of REQ-004');
f = P.findings();
check('P3: a complete audit (owner, independent auditor, sample, finding closed by an action) clears', f.length === 0, JSON.stringify(f));
const sm = P.summary();
check('P5: the summary counts audits, areas, findings and open actions', sm.audits === 1 && sm.areasCovered === 1 && sm.areasTotal === 9 && sm.findings === 1 && sm.openFindings === 0 && sm.openActions === 0 && sm.problems === 0, JSON.stringify(sm));

// ---- P5 EXEC editor on a draft ------------------------------------------------------------
// A small stand-in for the DOM: it reads the rendered fields back out of the HTML,
// with test-set values layered on top (as if typed).
function fakeOverlay(doc) {
    const typed = doc.typed;
    function fields(html, attr) {
        const out = [], re = new RegExp('<(input|select)([^>]*?)data-' + attr + '="([^"]+)"([^>]*)>', 'g'); let m;
        while ((m = re.exec(html))) {
            let v = '';
            if (m[1] === 'input') { const vm2 = /value="([^"]*)"/.exec(m[2] + m[4]); v = vm2 ? vm2[1] : ''; }
            else { const body = html.slice(re.lastIndex, html.indexOf('</select>', re.lastIndex)); const sel = /<option value="([^"]*)" selected/.exec(body) || /<option value="([^"]*)"/.exec(body); v = sel ? sel[1] : ''; }
            out.push({ k: m[3], v });
        }
        return out;
    }
    function el(scope, f, attr) { const key = scope + '|' + f.k; return { value: key in typed ? typed[key] : f.v.replace(/&amp;/g, '&'), getAttribute: () => f.k }; }
    function segments(html, cls) { const out = {}; const re = new RegExp('class="' + cls + '" data-id="([^"]+)"', 'g'); let m, marks = []; while ((m = re.exec(html))) marks.push({ id: m[1], at: m.index }); marks.forEach((x, i) => { out[x.id] = html.slice(x.at, i + 1 < marks.length ? marks[i + 1].at : html.length); }); return out; }
    const ov = {
        innerHTML: '', style: {}, remove() { doc.__ov = null; },
        querySelectorAll(sel) { if (sel === '.paa-plan [data-p]') { const h = ov.innerHTML; const i = h.indexOf('paa-plan'); return fields(h.slice(i, h.indexOf('Audits', i)), 'p').map(f => el('plan', f)); } return []; },
        querySelector(sel) {
            const id = /data-id="([^"]+)"/.exec(sel)[1];
            const cards = segments(ov.innerHTML, 'paa-card'); const card = cards[id]; if (!card) return null;
            const head = card.split('class="paa-item"')[0];
            return {
                querySelectorAll: () => fields(head, 'f').map(f => el(id, f)),
                querySelector(s2) { const iid = /data-id="([^"]+)"/.exec(s2)[1]; const seg = segments(card, 'paa-item')[iid]; return seg ? { querySelectorAll: () => fields(seg, 'i').map(f => el(iid, f)) } : null; }
            };
        }
    };
    return ov;
}
const doc = { __ov: null, typed: {} };
doc.createElement = () => (doc.__made = fakeOverlay(doc));
doc.body = { appendChild(o) { doc.__ov = o; } };
doc.getElementById = id => (id === 'paa-overlay' ? doc.__ov : null);
const E = load({ document: doc, scheduleAutosave() { E.__saved = (E.__saved || 0) + 1; } });
E.SLPaAudit.open();
check('P5 EXEC: the editor opens with the plan and no audits', !!doc.__ov && /PA owner/.test(doc.__ov.innerHTML) && /None yet/.test(doc.__ov.innerHTML));
E.SLPaAudit._addAudit();
check('P5 EXEC: adding an audit changes the draft, not the project', E.SLPaAudit._draftFor().audits.length === 1 && !(E.projectConfig.paAudits || []).length);
E.SLPaAudit.close();
check('P5 EXEC: Cancel leaves the project exactly as it was', !(E.projectConfig.paAudits || []).length && !E.projectConfig.paCounter && !E.projectConfig.paPlan);
E.SLPaAudit.open();
doc.typed['plan|owner'] = 'Q. Assurance';
E.SLPaAudit._addAudit();
Object.assign(doc.typed, { 'PAA-1|auditor': 'R. Checker', 'PAA-1|area': '4754B-5.5', 'PAA-1|independent': 'yes', 'PAA-1|samplePct': '20' });
E.SLPaAudit._draw('PAA-1');
const d = E.SLPaAudit._draftFor().audits[0];
check('P5 EXEC: typed fields are collected before drawing; the sample comes from the chosen area', d.auditor === 'R. Checker' && d.area === '4754B-5.5' && d.samplePct === 20 && d.sample.length === 3 && d.population === 11, JSON.stringify(d));
check('P5 EXEC: the drawn sample shows in the editor with its seed', new RegExp('seed ' + d.seed).test(doc.__ov.innerHTML));
E.SLPaAudit._addItem('PAA-1', 'finding');
E.SLPaAudit._addItem('PAA-1', 'action');
Object.assign(doc.typed, { 'PAA-1.1|text': 'Two tests have no procedure ref', 'PAA-1.2|text': 'Add refs', 'PAA-1.2|forId': 'PAA-1.1', 'PAA-1.2|owner': 'V&V lead', 'PAA-1.2|due': '2026-10-01' });
E.SLPaAudit._save();
const saved = E.projectConfig.paAudits;
check('P5 EXEC: Save writes the plan, the audit, its sample and its items, and saves', E.projectConfig.paPlan.owner === 'Q. Assurance' && saved.length === 1 && saved[0].sample.length === 3 && saved[0].items.length === 2 &&
    saved[0].items[1].forId === 'PAA-1.1' && saved[0].items[1].owner === 'V&V lead' && E.projectConfig.paCounter === 1 && E.__saved === 1 && !doc.__ov, JSON.stringify(E.projectConfig));
check('P5 EXEC: the saved sample redraws exactly from its seed', JSON.stringify(E.SLPaAudit.redraw(saved[0])) === JSON.stringify(saved[0].sample));

// ---- P6 export and wiring -----------------------------------------------------------------
const csv = P.exportCsv().split('\n');
check('P6: the CSV has one row per item with the audit alongside', csv.length === 3 && /"Audit","Date","Auditor"/.test(csv[0]) && /"PAA-1.1","finding"/.test(csv[1]) && /"seed"|4242/.test(csv[1]));
const regs = [];
load({ invRegister: i => regs.push(i.id) });
check('P6: INV-55 is registered as advisory', regs.includes('INV-55') && P.INV.sev === 'advisory');
const om = read('objectives_matrix.js');
check('P6: Appendix A row A7-4 reads the audit summary', /id: 'A7-4', grp: 'A-7 Process assurance'/.test(om) && /SLPaAudit\.summary\(\)/.test(om));
const idx = read('index.html');
check('P6: the Appendix A page opens the audits and exports them', /onclick="SLPaAudit\.open\(\)"/.test(idx) && /onclick="SLPaAudit\.download\(\)"/.test(idx));
check('P6: pa_audit.js loads right after usoc.js', /usoc\.js\?v=[\d.]+" defer><\/script>\s*<script src="pa_audit\.js\?v=[\d.]+" defer><\/script>/.test(idx));
check('P6: no eval in the module (the page CSP forbids it)', !/\beval\s*\(/.test(SRC));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
