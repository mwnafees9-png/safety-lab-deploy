#!/usr/bin/env node
/*
 * Regression — crew credit (27 Sep 2026, OPEN_ITEMS Q4 + Q5 + Q6; AC 25.1322-1 §7,
 * AC 25.1309-1B §5.3.5 / §5.4 / §6.3.3.2, §25.1322(b), §33.75(g), §35.15(g), CS-E 510,
 * CS-P 15 / CS-P 150).
 *
 *   D1  what counts as credit: an HF-typed assumption linked to the condition is a
 *       crew task (direction, crewmember, time, basis read from the HF lane); an FCIM
 *       aware/unaware pair whose aware half governs is awareness credit; alerts come
 *       from the crew alerting inventory by fcId; a non-HF assumption is not a task
 *   D2  Q5 findings: no alert class; no response time; time with no basis; alert with
 *       no modality; Advisory-only on a Cat/Haz recovery credit; crew action as the
 *       only defense (no AND gate on a linked tree, no non-HF safety requirement);
 *       each disappears when the record is complete; a Major condition is never
 *       "only defense"; a condition with no crew credit has no Q5 finding
 *   D3  Q4 findings: the standing CMA item unanswered / answered per scope (aircraft
 *       vs system); loss-of-annunciation row found by wording, missing otherwise, and
 *       only asked for Cat/Haz; a condition that relies on nothing has no Q4 finding
 *   D4  the two invariants count what they check and name the failures; findings
 *       filter by code list
 *   D5  Golden Thread: the "Crew credit" stage lists tasks, alerts, the CMA answer and
 *       the loss-of-annunciation row, says GAP / CHECK / OK, is inserted before the
 *       Verification stage, and is absent for a condition with no credit
 *   D6  FHA row badge: rows keyed by the FC ID cell get one badge with the finding
 *       count and the texts in the title; phase variants share it; rows are decorated
 *       once; the observer decorates rows the pager draws
 *   D7  Q6 anchors: Part 33 / CS-E → the three engine classes with the seven
 *       hazardous effects; Part 35 / CS-P → the two propeller classes; Part 25 → none;
 *       the note names Catastrophic as aircraft-level; the panel is inserted after the
 *       severity select and cleared when the basis changes
 *   D8  wiring: cma_walkthrough carries the standing item; the spine says CS-P 150
 *       (not CS-P 70) and cross-references CS-P 15; loaded right after req_basis.js;
 *       no eval; module exports
 * Run: node tests/regression_crew_credit.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('crew_credit.js'), IDX = read('index.html'), CMA = read('cma_walkthrough.js'), SPINE = read('cert_basis_spine.js'), CAT = read('catalogue_data.js');

// ---- tiny DOM ------------------------------------------------------------------------
function El(tag, attrs) { this.tagName = tag.toUpperCase(); this.attrs = Object.assign({}, attrs || {}); this.children = []; this.innerHTML = ''; this.textContent = ''; this.parentNode = null; }
El.prototype.getAttribute = function (k) { return this.attrs[k] == null ? null : this.attrs[k]; };
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.insertAdjacentHTML = function (_, h) { this.innerHTML += h; };
El.prototype.querySelectorAll = function (sel) { if (sel === 'tr') return this.children.filter(c => c.tagName === 'TR'); if (sel === 'td') return this.children.filter(c => c.tagName === 'TD'); return []; };
El.prototype.insertBefore = function (n, ref) { const i = this.children.indexOf(ref); n.parentNode = this; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); return n; };
function makeDoc() {
    const byId = {};
    const created = tag => { const e = new El(tag); Object.defineProperty(e, 'id', { get() { return e._id; }, set(v) { e._id = v; byId[v] = e; } }); return e; };
    return { getElementById: id => byId[id] || null, createElement: created,
             el: (tag, id, attrs) => { const e = new El(tag, attrs); if (id) { byId[id] = e; e.id = id; } return e; }, _byId: byId };
}
function fhaRow(fcId) { const tr = new El('tr'); for (let i = 0; i < 10; i++) tr.children.push(new El('td')); tr.children[2].textContent = fcId; return tr; }

function load(model, extra) {
    const sb = Object.assign({ console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, isNaN, isFinite, setTimeout: () => 0,
        _gtStage: (t, b, s) => '<div style="border:1px solid var(--color-border-hair)" data-stage="' + t + '" data-status="' + s + '">' + b + '</div>' }, model, extra || {});
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    vm.createContext(sb);
    vm.runInContext(SRC, sb, { filename: 'crew_credit.js' });
    return sb;
}
let nid = 1;
const fc = (id, sev, extra) => Object.assign({ internalId: 'f' + id, fcId: 'FC-' + id, fcDesc: 'Loss of function ' + id, severity: sev, subId: 'SF-' + id, assumptionIds: [] }, extra || {});
const hfAsm = (id, extra) => { const o = Object.assign({}, extra || {}); delete o.hf; return Object.assign({ asmId: id, type: 'Human factors', text: 'Crew does ' + id, state: 'Validated', hf: Object.assign({ direction: 'recovery', crewmember: 'PF', taskTimeS: 10, taskTimeBasis: 'simulator trial', responsePhase: 'Cruise' }, (extra && extra.hf) || {}) }, o); };
const alert = (id, fcs, extra) => Object.assign({ alertId: id, name: 'alert ' + id, priority: 'Warning', modality: 'aural', fcIds: fcs, notes: '' }, extra || {});
const leaf = p => ({ id: ++nid, type: 'basic', probability: p });
const gate = (gt, kids) => ({ id: ++nid, type: 'gate', gateType: gt, children: kids });
function project(o) {
    o = o || {};
    return { acFhaData: o.fhas || [], acAssumptionsData: o.asms || [], acReqData: o.reqs || [], acFcimData: o.fcim || [], systemsData: o.systems || [], ftaPages: o.pages || [],
             projectConfig: Object.assign({ regulation: 'Part 25', hf: { alerts: { rows: o.alerts || [] } }, cmaWalk: o.cmaWalk || {} }, o.pc || {}) };
}

// ---- D1 credit -----------------------------------------------------------------------
{
    const f1 = fc(1, 'Hazardous', { assumptionIds: ['H-1', 'D-1'] }), f2 = fc(2, 'Major');
    const asms = [hfAsm('H-1'), { asmId: 'D-1', type: 'Design', text: 'Design assumption' }];
    const fcim = [{ pairId: 'P1', pairGoverns: 'aware', awareness: 'Aware', tlId: 'FC-2' }, { pairId: 'P1', pairGoverns: 'aware', awareness: 'Unaware', tlId: 'FC-2' }, { pairId: 'P2', pairGoverns: 'unaware', tlId: 'FC-1' }];
    const sb = load(project({ fhas: [f1, f2], asms, fcim, alerts: [alert('ALR-001', 'FC-1, FC-9'), alert('ALR-002', 'FC-2', { priority: '' })] }));
    const CC = sb.SLCrewCredit; const st = CC.stores()[0];
    const t = CC.crewTasks(st, f1);
    check('D1: an HF assumption linked to the condition is a crew task, a design assumption is not', t.length === 1 && t[0].asmId === 'H-1' && t[0].direction === 'recovery' && t[0].crewmember === 'PF' && t[0].taskTimeS === 10 && t[0].basis === 'simulator trial');
    check('D1: isHfAsm reads the hf object, the hf type or a human-factors label', CC.isHfAsm({ hf: {} }) && CC.isHfAsm({ type: 'hf' }) && CC.isHfAsm({ type: 'Human factors' }) && !CC.isHfAsm({ type: 'Design' }));
    check('D1: an aware-governs FCIM pair citing the condition is awareness credit; an unaware-governs one is not', CC.fcimCredit(st, f2).length === 2 && CC.fcimCredit(st, f1).length === 0);
    check('D1: alerts come from the inventory by fcId, comma lists split, best priority wins', CC.alertsFor('FC-1').length === 1 && CC.alertsFor('FC-9').length === 1 && CC.alertsFor('FC-2')[0].priority === '' && CC.bestPriority([{ priority: 'Advisory' }, { priority: 'Caution' }]) === 'Caution' && CC.bestPriority([]) === '');
    const a1 = CC.assess(st, f1), a2 = CC.assess(st, f2);
    check('D1: reliesOnCrew and reliesOnAlert follow the credits', a1.reliesOnCrew && a1.reliesOnAlert && a2.reliesOnCrew && a2.reliesOnAlert && !CC.assess(st, fc(3, 'Major')).reliesOnCrew);
    check('D1: storeOf finds the store a condition lives in, null for a stranger', CC.storeOf(f1).scope === 'ac' && CC.storeOf(fc(9, 'Minor')) === null);
}

// ---- D2 Q5 findings ---------------------------------------------------------------------
{
    const codes = a => a.findings.map(f => f.code).sort().join(',');
    // complete record: Cat, recovery task with time+basis, Warning alert with modality, AND gate on a linked tree, CMA answered, loss-of-annunciation row
    const f1 = fc(1, 'Catastrophic', { assumptionIds: ['H-1'] });
    const loa = fc(2, 'Major', { fcDesc: 'Loss of the alert for FC-1' });
    const page = { id: 'p1', root: gate('AND', [leaf(1e-5), leaf(1e-5)]), linkedFhaIds: ['f1'] };
    const base = { fhas: [f1, loa], asms: [hfAsm('H-1')], alerts: [alert('ALR-001', 'FC-1')], pages: [page], cmaWalk: { aircraft: { disp: { 'al-common': 'mitigated' } } } };
    let sb = load(project(base)); let CC = sb.SLCrewCredit;
    check('D2: a complete record has no finding', codes(CC.assess(null, f1)) === '', codes(CC.assess(null, f1)));
    // no alert at all
    sb = load(project(Object.assign({}, base, { alerts: [] }))); CC = sb.SLCrewCredit;
    check('D2: no alert covering a crew-credited condition → no-alert-class (and no recognition finding on top)', codes(CC.assess(null, f1)) === 'no-alert-class', codes(CC.assess(null, f1)));
    // alert without class
    sb = load(project(Object.assign({}, base, { alerts: [alert('ALR-001', 'FC-1', { priority: '' })] }))); CC = sb.SLCrewCredit;
    check('D2: an alert with no class does not count as a class', codes(CC.assess(null, f1)) === 'no-alert-class');
    // no time / no basis
    sb = load(project(Object.assign({}, base, { asms: [hfAsm('H-1', { hf: { taskTimeS: null } })] }))); CC = sb.SLCrewCredit;
    check('D2: a credited task with no response time → no-response-time', codes(CC.assess(null, f1)) === 'no-response-time');
    sb = load(project(Object.assign({}, base, { asms: [hfAsm('H-1', { hf: { taskTimeBasis: '' } })] }))); CC = sb.SLCrewCredit;
    check('D2: a time with no basis → no-time-basis (a check, not a gap)', codes(CC.assess(null, f1)) === 'no-time-basis' && CC.assess(null, f1).findings[0].kind === 'warn');
    // no modality
    sb = load(project(Object.assign({}, base, { alerts: [alert('ALR-001', 'FC-1', { modality: '' })] }))); CC = sb.SLCrewCredit;
    check('D2: classed alerts with no modality → no-recognition', codes(CC.assess(null, f1)) === 'no-recognition');
    // advisory only
    sb = load(project(Object.assign({}, base, { alerts: [alert('ALR-001', 'FC-1', { priority: 'Advisory' })] }))); CC = sb.SLCrewCredit;
    check('D2: Cat/Haz recovery credit with only an Advisory → advisory-only', codes(CC.assess(null, f1)) === 'advisory-only');
    sb = load(project(Object.assign({}, base, { alerts: [alert('ALR-001', 'FC-1', { priority: 'Advisory' }), alert('ALR-002', 'FC-1', { priority: 'Caution' })] }))); CC = sb.SLCrewCredit;
    check('D2: a Caution beside the Advisory clears it', codes(CC.assess(null, f1)) === '');
    sb = load(project(Object.assign({}, base, { alerts: [alert('ALR-001', 'FC-1', { priority: 'Advisory' })], asms: [hfAsm('H-1', { hf: { direction: 'prevention' } })] }))); CC = sb.SLCrewCredit;
    check('D2: a prevention task is not held to the Warning rule', codes(CC.assess(null, f1)) === '');
    // only defense
    sb = load(project(Object.assign({}, base, { pages: [] }))); CC = sb.SLCrewCredit;
    check('D2: no AND gate and no design requirement → only-defense on a Cat condition', codes(CC.assess(null, f1)) === 'only-defense' && CC.assess(null, f1).onlyDefense === true);
    sb = load(project(Object.assign({}, base, { pages: [{ id: 'p1', root: gate('OR', [leaf(1e-5), leaf(1e-5)]), linkedFhaIds: ['f1'] }] }))); CC = sb.SLCrewCredit;
    check('D2: an OR-only tree is not redundancy', codes(CC.assess(null, f1)) === 'only-defense');
    sb = load(project(Object.assign({}, base, { pages: [], reqs: [{ internalId: 1, type: 'Safety', traceId: 'SF-1', text: 'x', rat: 'y' }] }))); CC = sb.SLCrewCredit;
    check('D2: a non-HF safety requirement traced to the condition is a defense', codes(CC.assess(null, f1)) === '');
    sb = load(project(Object.assign({}, base, { pages: [], reqs: [{ internalId: 1, type: 'Safety', traceId: 'SF-1', analysis: 'Human Factors' }, { internalId: 2, type: 'Safety', traceId: 'SF-1', reqSource: { generator: 'fcim-monitor' } }, { internalId: 3, type: 'Operational', traceId: 'SF-1' }, { internalId: 4, type: 'Safety', traceId: 'SF-1', deleted: true }] }))); CC = sb.SLCrewCredit;
    check('D2: HF, annunciation, operational and deleted requirements are not design defenses', codes(CC.assess(null, f1)) === 'only-defense');
    sb = load(project(Object.assign({}, base, { pages: [], reqs: [{ internalId: 1, type: 'Safety', reqSource: { generator: 'fha-prob', context: { fcId: 'FC-1' } } }] }))); CC = sb.SLCrewCredit;
    check('D2: a requirement traced through its source context counts', codes(CC.assess(null, f1)) === '');
    const fM = fc(1, 'Major', { assumptionIds: ['H-1'] });
    sb = load(project(Object.assign({}, base, { fhas: [fM], pages: [], alerts: [alert('ALR-001', 'FC-1', { priority: 'Advisory' })] }))); CC = sb.SLCrewCredit;
    check('D2: a Major condition is neither only-defense nor advisory-only, and needs no loss-of-annunciation row', codes(CC.assess(null, fM)) === '' && CC.assess(null, fM).onlyDefense === undefined);
    check('D2: a condition with no credit at all has no finding', codes(CC.assess(null, fc(7, 'Catastrophic'))) === '');
    // AND gate deep in a tree, one-input AND ignored
    const deep = { id: 'p', root: gate('OR', [leaf(1e-3), gate('OR', [gate('AND', [leaf(1e-3), leaf(1e-3)])])]), linkedFhaIds: ['f1'] };
    check('D2: hasAndGate finds an AND-family gate anywhere, ignores one-input gates', CC.hasAndGate(deep.root) && !CC.hasAndGate(gate('AND', [leaf(1)])) && CC.hasAndGate(gate('INHIBIT', [leaf(1), leaf(1)])) && !CC.hasAndGate(null));
}

// ---- D3 Q4 findings ---------------------------------------------------------------------
{
    const codes = a => a.findings.map(f => f.code).sort().join(',');
    const f1 = fc(1, 'Hazardous'), f3 = fc(3, 'Minor');
    let sb = load(project({ fhas: [f1, f3], alerts: [alert('ALR-001', 'FC-1, FC-3')] })); let CC = sb.SLCrewCredit;
    let a = CC.assess(null, f1);
    check('D3: an alert-reliant Haz condition with the CMA item unanswered and no loss-of-annunciation row has both Q4 findings and nothing from Q5', codes(a) === 'alert-cma-open,no-loss-of-annunciation-fc' && a.reliesOnAlert && !a.reliesOnCrew && a.alertCma === null);
    check('D3: a Minor condition asks only the CMA question', codes(CC.assess(null, f3)) === 'alert-cma-open');
    sb = load(project({ fhas: [f1], alerts: [alert('ALR-001', 'FC-1')], cmaWalk: { aircraft: { disp: { 'al-common': 'na' } } } })); CC = sb.SLCrewCredit;
    check('D3: N/A is an answer', codes(CC.assess(null, f1)) === 'no-loss-of-annunciation-fc' && CC.assess(null, f1).alertCma === 'na');
    sb = load(project({ fhas: [f1], alerts: [alert('ALR-001', 'FC-1')], cmaWalk: { 'sys-S1': { disp: { 'al-common': 'mitigated' } } } })); CC = sb.SLCrewCredit;
    check('D3: an answer in another scope does not count for the aircraft', codes(CC.assess(null, f1)) === 'alert-cma-open,no-loss-of-annunciation-fc');
    // system scope
    const s1 = { id: 'S1', name: 'Flight controls', fha: [fc(5, 'Catastrophic')], asm: [], req: [], fcim: [] };
    sb = load(project({ systems: [s1], alerts: [alert('ALR-005', 'FC-5')], cmaWalk: { 'sys-S1': { disp: { 'al-common': 'concern' } } } })); CC = sb.SLCrewCredit;
    a = CC.assess(null, s1.fha[0]);
    check('D3: a system condition reads its own CMA context', a.alertCma === 'concern' && codes(a) === 'no-loss-of-annunciation-fc' && CC.storeOf(s1.fha[0]).scope === 'sys-S1');
    // loss-of-annunciation wording
    const words = ['Loss of the FC-1 warning', 'Failure of annunciation of loss of thrust', 'Absence of the master caution', 'Alert not provided when the condition exists', 'Unannunciated loss of function', 'No warning on engine fire', 'Warning fails'];
    const bad = words.filter(w => !CC.lossOfAnnunciationRow({ scope: 'ac', fhas: [f1, fc(9, 'Major', { fcDesc: w })] }, f1));
    check('D3: loss-of-annunciation rows are found by their wording', bad.length === 0, bad.join(' | '));
    check('D3: an ordinary row, or the condition itself, is not a loss-of-annunciation row', !CC.lossOfAnnunciationRow({ fhas: [f1, fc(9, 'Major', { fcDesc: 'Loss of hydraulic pressure' })] }, f1) && !CC.lossOfAnnunciationRow({ fhas: [fc(1, 'Major', { fcDesc: 'Loss of warning' })] }, fc(1, 'Major', { fcDesc: 'Loss of warning' })));
    check('D3: a condition that relies on nothing has no Q4 finding', codes(load(project({ fhas: [f1] })).SLCrewCredit.assess(null, f1)) === '');
}

// ---- D4 invariants ---------------------------------------------------------------------
{
    const f1 = fc(1, 'Catastrophic', { assumptionIds: ['H-1'] }), f2 = fc(2, 'Major'), f3 = fc(3, 'Minor', { assumptionIds: ['H-2'] });
    const sb = load(project({ fhas: [f1, f2, f3], asms: [hfAsm('H-1', { hf: { taskTimeS: null } }), hfAsm('H-2')], alerts: [alert('ALR-001', 'FC-1'), alert('ALR-003', 'FC-3')] }));
    const CC = sb.SLCrewCredit;
    const a = CC.INV_ALERT.run(), c = CC.INV_CREW.run();
    check('D4: INV-61 counts the alert-reliant conditions and names the Q4 failures', CC.INV_ALERT.id === 'INV-61' && CC.INV_ALERT.sev === 'advisory' && a.checked === 2 && a.failCount === 3 && a.fails.every(t => /unanswered|loss of that annunciation/.test(t)), JSON.stringify(a));
    check('D4: INV-62 counts the crew-credited conditions and names the Q5 failures', CC.INV_CREW.id === 'INV-62' && CC.INV_CREW.sev === 'advisory' && c.checked === 2 && c.failCount === 2 && /FC-1: credited task H-1 has no assumed response time/.test(c.fails.join('|')) && /only defense/.test(c.fails.join('|')), JSON.stringify(c));
    check('D4: findings filter by code and carry the scope label', CC.findings(['only-defense']).length === 1 && /^Aircraft: FC-1/.test(CC.findings(['only-defense'])[0].text) && CC.findings().length === 5);
}

// ---- D5 Golden Thread ---------------------------------------------------------------------
{
    const f1 = fc(1, 'Catastrophic', { assumptionIds: ['H-1'] }), f2 = fc(2, 'Major');
    const sb = load(project({ fhas: [f1, f2], asms: [hfAsm('H-1')], alerts: [alert('ALR-001', 'FC-1', { priority: 'Caution', modality: 'visual' })] }));
    const CC = sb.SLCrewCredit;
    const st = CC.threadStage(f1);
    check('D5: the stage lists the task, the alert, the unanswered CMA question with a link, and the missing loss-of-annunciation row', /H-1<\/b> \(recovery, PF, 10 s\)/.test(st) && /ALR-001<\/b> Caution \/ visual/.test(st) && /unanswered/.test(st) && /openCma\('ac'\)/.test(st) && /none in the FHA/.test(st), st);
    check('D5: the stage says GAP when a gap finding exists', /data-status="gap"/.test(st) && /1 gap, 2 to check/.test(st));
    const sb2 = load(project({ fhas: [f1, fc(2, 'Major', { fcDesc: 'Loss of the FC-1 caution' })], asms: [hfAsm('H-1')], alerts: [alert('ALR-001', 'FC-1')], pages: [{ id: 'p', root: gate('AND', [leaf(1), leaf(1)]), linkedFhaIds: ['f1'] }], cmaWalk: { aircraft: { disp: { 'al-common': 'mitigated' } } } }));
    const ok = sb2.SLCrewCredit.threadStage(f1);
    check('D5: with everything on record the stage is OK and names the loss-of-annunciation row', /data-status="ok"/.test(ok) && /FC-2<\/b>/.test(ok) && /all on record/.test(ok), ok);
    check('D5: a condition with no credit adds no stage', CC.threadStage(f2) === '' && CC.threadStage(null) === '');
    const orig = () => '<div style="border:1px solid var(--color-border-hair)"><span>Requirements</span></div><div style="border:1px solid var(--color-border-hair)"><span>Verification</span></div>';
    sb._renderGoldenThread = orig;
    check('D5: the thread wrapper installs once', CC._wrapThread() === true && CC._wrapThread() === false);
    const out = sb._renderGoldenThread(f1);
    const iS = out.indexOf('data-stage="Crew credit"'), iV = out.indexOf('>Verification</span>'), iR = out.indexOf('>Requirements</span>');
    check('D5: the stage is inserted before Verification', iS > iR && iS < iV);
    check('D5: no credit leaves the thread untouched', sb._renderGoldenThread(f2) === orig());
}

// ---- D6 FHA badge -------------------------------------------------------------------------
{
    const f1 = fc(1, 'Catastrophic', { assumptionIds: ['H-1'] }), f1b = fc(1, 'Catastrophic', { internalId: 'f1b', assumptionIds: ['H-1'] }), f2 = fc(2, 'Major');
    const sb = load(project({ fhas: [f1, f1b, f2], asms: [hfAsm('H-1')], alerts: [] }), { setTimeout: f => { f(); return 0; } });
    const CC = sb.SLCrewCredit;
    const doc = makeDoc(); sb.document = doc;
    const cbs = {}; sb.MutationObserver = function (f) { this.observe = el => { cbs[el.id] = f; }; };
    const body = doc.el('tbody', 'ac-fha-body'); doc.el('tbody', 'sys-fha-body');
    body.children.push(fhaRow('FC-1'), fhaRow('FC-1'), fhaRow('FC-2'));
    check('D6: every row is decorated once', CC.decorateFhaTable('ac') === 3 && CC.decorateFhaTable('ac') === 0);
    const sev = i => body.children[i].children[6].innerHTML;
    check('D6: the crew-credited condition gets one badge with the count (two Q5 + two Q4 findings) and the texts, on both phase variants', /crew credit 4</.test(sev(0)) && /no alert with a class/.test(sev(0)) && /only defense/.test(sev(0)) && (sev(0).match(/data-cc-badge/g) || []).length === 1 && sev(1) === sev(0));
    check('D6: a condition with no finding gets no badge', sev(2) === '');
    check('D6: the two bodies are watched once', CC.watchTables() === true && CC.watchTables() === false);
    body.children.push(fhaRow('FC-1'));
    cbs['ac-fha-body']([]);
    check('D6: a row drawn by the pager is decorated on the next tick', body.children[3].getAttribute('data-cc') === '1' && /crew credit 4/.test(body.children[3].children[6].innerHTML));
    check('D6: badgeHtml is empty without findings', CC.badgeHtml({ findings: [] }) === '' && CC.badgeHtml(null) === '');
}

// ---- D7 anchors ------------------------------------------------------------------------------
{
    const sb = load(project({ pc: { regulation: 'Part 33' } }));
    const CC = sb.SLCrewCredit;
    check('D7: the basis family reads Part 33 / CS-E as engine, Part 35 / CS-P as propeller, others as none', CC.basisFamily('Part 33') === 'engine' && CC.basisFamily('CS-E') === 'engine' && CC.basisFamily('Part 35') === 'propeller' && CC.basisFamily('CS-P') === 'propeller' && CC.basisFamily('Part 25') === '' && CC.basisFamily() === 'engine');
    const e = CC.anchorsHtml('Part 33');
    check('D7: the engine panel names the three classes with clause and title and the seven hazardous effects', /Minor<\/b> = Minor engine effect, §33\.75\(g\)\(1\) \/ CS-E 510\(g\)\(1\)/.test(e) && /Major<\/b> = Major engine effect/.test(e) && /Hazardous<\/b> = Hazardous engine effects, §33\.75\(g\)\(2\) \/ CS-E 510\(g\)\(2\)/.test(e) && CC.ENGINE_ANCHORS.rows[2].items.length === 7 && /complete inability to shut the engine down/.test(e));
    check('D7: the engine note says Catastrophic is aircraft-level and cites AMC E 510 (3)(a)', /Catastrophic is an aircraft-level class/.test(e) && /AMC E 510 \(3\)\(a\)/.test(e));
    const p = CC.anchorsHtml('Part 35');
    check('D7: the propeller panel names CS-P 15 for the definitions and CS-P 150 for the analysis, with four and four effects', /CS-P 15/.test(p) && /CS-P 150/.test(p) && CC.PROP_ANCHORS.rows[0].items.length === 4 && CC.PROP_ANCHORS.rows[1].items.length === 4 && /no Major objective in §35\.15/.test(p) && !/CS-P 70/.test(p));
    check('D7: no EASA text is reproduced (clauses only), and Part 25 gets no panel', !/must be regarded/.test(e) && CC.anchorsHtml('Part 25') === '' && CC.anchorsHtml('SC-VTOL Enhanced') === '');
    const doc = makeDoc(); sb.document = doc;
    const wrap = doc.el('div', 'wrap'); const sel = doc.el('select', 'ac-fha-sev'); const after = doc.el('input', 'after'); wrap.children.push(sel, after); sel.parentNode = wrap; after.parentNode = wrap; sel.nextSibling = after;
    check('D7: the panel is inserted right after the severity select', CC.renderAnchors() === 1 && wrap.children[1].id === 'cc-anchors-ac-fha-sev' && /Severity anchors/.test(wrap.children[1].innerHTML));
    sb.projectConfig.regulation = 'Part 25';
    check('D7: changing the basis clears the panel', CC.renderAnchors() === 0 && wrap.children[1].innerHTML === '' && wrap.children.length === 3);
}

// ---- D8 wiring ---------------------------------------------------------------------------------
{
    check('D8: the CMA questionnaire carries the standing crew-alerting item', /\{ g: 'Crew alerting', items: \[ \['al-common', 'Alert can fail from the same cause as the malfunction it announces'\] \] \}/.test(CMA));
    check('D8: the spine says CS-P 150 for the propeller safety analysis, cross-references CS-P 15, and CS-P 70 is gone', /id: 'csp-150', fw: 'CS-P', ref: 'CS-P 150'/.test(SPINE) && /related: \['14 CFR §35\.15', 'CS-P 15'\]/.test(SPINE) && !/id: 'csp-70'/.test(SPINE) && !/'CS-P 70'\]/.test(SPINE) && /paragraph: 'CS-P 150'/.test(CAT) && !/paragraph: 'CS-P 70'/.test(CAT));
    check('D8: §35.15 no longer claims the Part 25 ladder', !/propeller failure-condition safety analysis on the Part 25 severity ladder/.test(SPINE) && /AMC P 150 \(3\)\(a\)/.test(SPINE));
    check('D8: crew_credit.js is loaded right after req_basis.js', /req_basis\.js\?v=[\d.]+" defer><\/script>\s*(<!--[^>]*-->\s*)?<script src="crew_credit\.js\?v=[\d.]+" defer><\/script>/.test(IDX));
    check('D8: no eval or Function constructor', !/\beval\s*\(/.test(SRC) && !/new Function\s*\(/.test(SRC));
    check('D8: module exports the API', /module\.exports = api/.test(SRC) && /root\.SLCrewCredit = api/.test(SRC));
    check('D8: the standing item id is shared with the questionnaire', load(project()).SLCrewCredit.ALERT_ITEM === 'al-common');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
