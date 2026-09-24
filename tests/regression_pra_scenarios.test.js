#!/usr/bin/env node
/*
 * Regression — particular-risk scenarios and the requirement cascade
 * (23 Sep 2026, standards gap G3; ARP4761A Appendix L, Q.15.2.7.2).
 *
 *   R1  derived facts: functions exposed through the risk's zones; the systems
 *       owning them (allocation); the failure conditions they trace to
 *       (through subIds[] too); classification = worst linked severity;
 *       interrelation = other applicable risks sharing a zone or a function
 *   R2  editing: scenarios numbered S1, S2… (never reused after a removal);
 *       assumption impacts set and cleared
 *   R3  findings (INV-53): no scenario, no failure condition and no reason,
 *       undecided, NOT acceptable, assumption without impact; N/A risks skipped
 *   R4  the cascade: one requirement per scenario — one "shall", the linked
 *       failure conditions; rationale with origin, effect, classification,
 *       acceptability, allocation, interrelation, assumptions and their impact;
 *       stable source id; the fingerprint moves when the decision moves
 *   R5  EXECUTED — the real genPRA: a risk with scenarios yields its scenario
 *       requirements, a risk without keeps its single zonal one, a risk ruled
 *       N/A yields none
 *   R6  EXECUTED — the real makeCRUD: editing a PRA through its form keeps its
 *       scenarios, zones, library link, disposition and origin; editing an
 *       auto-requirement keeps its reqSource (both used to be dropped)
 *   R7  EXECUTED — the editor works on a draft: Cancel leaves the row untouched,
 *       Save writes it
 *   R8  wiring: generator registered everywhere pra-zonal is; PRA table column;
 *       report column; PRA import writes the table's own fields; loaded
 * Run: node tests/regression_pra_scenarios.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('pra_scenarios.js');
const extract = (src, name, prefix) => { const at = src.indexOf((prefix || 'function ') + name); if (at < 0) throw new Error('no ' + name); const open = src.indexOf('{', at); let d = 0; for (let i = open; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) return src.slice(at, i + 1); } } };

function model() {
    return {
        zsaData: [{ zoneId: 'Z-110', housedFunctions: ['F-HYD', 'F-PITCH'] }, { zoneId: 'Z-120', housedFunctions: ['F-BRAKE'] }, { zoneId: 'Z-200', housedFunctions: ['F-NAV'] }],
        acFunctionsData: [{ subId: 'F-HYD', subName: 'Provide hydraulic power' }, { subId: 'F-PITCH', subName: 'Control pitch' }],
        acFhaData: [
            { internalId: 1, fcId: 'FC-PITCH', fcDesc: 'Loss of pitch control', severity: 'Catastrophic', subId: 'F-PITCH' },
            { internalId: 2, fcId: 'FC-HYD', fcDesc: 'Loss of hydraulic power', severity: 'Hazardous', subIds: ['F-X', 'F-HYD'] },
            { internalId: 3, fcId: 'FC-NAV', fcDesc: 'Loss of nav', severity: 'Major', subId: 'F-NAV' }
        ],
        systemsData: [{ id: 'S1', name: 'Hydraulics', functions: [{ traceIds: ['F-HYD'] }] }, { id: 'S2', name: 'Flight controls', functions: [{ traceId: 'F-PITCH' }] }],
        acAssumptionsData: [{ internalId: 'a1', asmId: 'ASM-7', text: 'Shield covers the 15° cone' }],
        praData: [
            { internalId: 'p1', praId: 'PRA-1', threat: 'Rotorburst', affectedZones: ['Z-120', 'Z-110'], mitigation: 'Kevlar shield', assumptionIds: ['a1'] },
            { internalId: 'p2', praId: 'PRA-2', threat: 'Tire burst', affectedZones: ['Z-120'] },
            { internalId: 'p3', praId: 'PRA-3', threat: 'Bird strike', affectedZones: ['Z-110'], disposition: 'na', naReason: 'no exposure' },
            { internalId: 'p4', praId: 'PRA-4', threat: 'Hail', affectedZones: ['Z-200'] }
        ]
    };
}
function load(extra) {
    const sb = Object.assign({ console, Math, JSON, Object, Array, String, Date, setTimeout: () => 0 }, model(), extra || {});
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(SRC, sb, { filename: 'pra_scenarios.js' });
    return sb;
}

// ---- R1 ---------------------------------------------------------------------------------
let M = load();
let P = M.SLPraScenarios, p1 = M.praData[0];
check('R1: functions exposed through the zones (sorted, unique)', JSON.stringify(P.exposed(p1)) === '["F-BRAKE","F-HYD","F-PITCH"]');
check('R1: allocation — the systems owning those functions', JSON.stringify(P.ownersOf(['F-HYD', 'F-PITCH']).map(s => s.id)) === '["S1","S2"]');
check('R1: failure conditions traced to the functions, through subId and subIds[]', JSON.stringify(P.fcsFor(['F-HYD', 'F-PITCH']).map(f => f.fcId).sort()) === '["FC-HYD","FC-PITCH"]');
check('R1: classification is the worst linked severity', P.classification({ fcIds: [2, 1] }) === 'Catastrophic' && P.classification({ fcIds: [3] }) === 'Major' && P.classification({ fcIds: [] }) === null);
const s1 = P.add(p1);
check('R1: interrelation — other APPLICABLE risks sharing a zone (PRA-2 shares Z-120; PRA-3 is N/A; PRA-4 shares nothing)', JSON.stringify(P.interrelated(p1, s1)) === '["PRA-2"]');
M.praData[3].scenarios = [{ scnId: 'S1', affected: ['F-PITCH'] }];
check('R1: …or sharing a function hit in a scenario (PRA-4 hits F-PITCH)', JSON.stringify(P.interrelated(p1, s1)) === '["PRA-2","PRA-4"]');
const view = Object.create(p1); view.scenarios = [s1];
check('R1: the editor\'s draft copy of a risk never lists that risk as interrelated with itself', P.interrelated(view, s1).indexOf('PRA-1') === -1 && JSON.stringify(P.interrelated(view, s1)) === '["PRA-2","PRA-4"]');

// ---- R2 ---------------------------------------------------------------------------------
check('R2: a new scenario starts with the exposed functions, nothing linked, undecided', s1.scnId === 'S1' && s1.affected.length === 3 && s1.fcIds.length === 0 && s1.acceptable === 'open');
const s2 = P.add(p1); P.remove(p1, 'S1'); const s3 = P.add(p1);
check('R2: ids are never reused after a removal (S2 remains, next is S3)', s2.scnId === 'S2' && s3.scnId === 'S3' && JSON.stringify(p1.scenarios.map(s => s.scnId)) === '["S2","S3"]');
P.setImpact(p1, 'a1', ' Shield inadequate → FC-PITCH exposed ');
check('R2: an assumption impact is stored trimmed', p1.assumptionImpacts.a1 === 'Shield inadequate → FC-PITCH exposed');
P.setImpact(p1, 'a1', '');
check('R2: clearing it removes it', !('a1' in p1.assumptionImpacts));

// ---- R3 ---------------------------------------------------------------------------------
M = load(); P = M.SLPraScenarios; p1 = M.praData[0];
let f = P.findings();
check('R3: an applicable risk reaching zones with no scenario is a finding; N/A risks are not', f.some(x => x.kind === 'no-scenario' && x.row.praId === 'PRA-1') && !f.some(x => x.row.praId === 'PRA-3'));
const a = P.add(p1), b = P.add(p1);
a.fcIds = [1]; a.acceptable = 'no';
b.fcIds = []; b.rationale = '';
f = P.findings([p1]);
check('R3: NOT acceptable is listed with its classification', f.some(x => x.kind === 'unacceptable' && /S1 — NOT acceptable \(Catastrophic\)/.test(x.text)));
check('R3: no failure condition and no reason is listed; undecided is listed', f.some(x => x.kind === 'no-fc' && x.scn === b) && f.some(x => x.kind === 'open' && x.scn === b));
check('R3: an assumption with no impact is listed by its id', f.some(x => x.kind === 'no-impact' && /ASM-7/.test(x.text)));
a.acceptable = 'yes'; b.rationale = 'Brakes spared: Z-120 shielded'; b.acceptable = 'yes'; P.setImpact(p1, 'a1', 'cone widens → S1 recurs');
check('R3: decided, linked (or explained) and impact stated → no findings', P.findings([p1]).length === 0);
check('R3: INV-53 counts across the project', P.INV.run().checked === 3 && P.INV.run().failCount === P.findings().length);

// ---- R4 ---------------------------------------------------------------------------------
const fp = (...xs) => JSON.stringify(xs);
let reqs = P.requirements(p1, fp, 'ac');
check('R4: one requirement per scenario, with a traced id and a stable source id', reqs.length === 2 && reqs[0].traceId === 'PRA-1.S1' && reqs[0].reqSource.sourceId === 'ac:pra:PRA-1:S1' && reqs[0].reqSource.generator === 'pra-scenario');
check('R4: with failure conditions linked, the one "shall" names them', /\(scenario S1\), it shall not result in FC-PITCH "Loss of pitch control"\./.test(reqs[0].text) && (reqs[0].text.match(/shall/g) || []).length === 1, reqs[0].text);
check('R4: with none linked, it keeps the functions hit', /the aircraft shall retain F-BRAKE, F-HYD, F-PITCH\./.test(reqs[1].text), reqs[1].text);
const rat = reqs[0].rat;
check('R4: rationale carries origin, effect, classification, acceptability, allocation, interrelation, mitigation and assumption impact',
    /Origin: PRA PRA-1, scenario S1/.test(rat) && /Aircraft effect: not stated/.test(rat) && /FC-PITCH \(Catastrophic\); classification Catastrophic/.test(rat) && /Acceptability: acceptable/.test(rat) &&
    /Allocated to: Hydraulics, Flight controls/.test(rat) && /Interrelated with: PRA-2/.test(rat) && /Mitigation: Kevlar shield/.test(rat) && /ASM-7 \(if wrong: cone widens → S1 recurs\)/.test(rat), rat);
const fp1 = reqs[0].reqSource.fingerprint;
a.acceptable = 'no';
check('R4: the fingerprint moves when the decision moves (so the change surfaces in review)', P.requirements(p1, fp, 'ac')[0].reqSource.fingerprint !== fp1);

// ---- R5 EXEC: the real genPRA ------------------------------------------------------------
const ASR = read('assurance_modules.js');
M.__fp = fp;
vm.runInContext('var fp = __fp; ' + extract(ASR, 'genPRA') + '; globalThis.__genPRA = genPRA;', M);
const gen = M.__genPRA('ac');
check('R5 EXEC: a risk with scenarios yields its scenario requirements (PRA-1: 2)', gen.filter(r => r.reqSource.generator === 'pra-scenario').length === 2 && gen.filter(r => /^ac:pra:PRA-1/.test(r.reqSource.sourceId)).every(r => r.reqSource.generator === 'pra-scenario'));
check('R5 EXEC: a risk without keeps its single zonal requirement (PRA-2, PRA-4); N/A yields none (PRA-3)',
    gen.filter(r => r.reqSource.generator === 'pra-zonal').map(r => r.traceId).sort().join() === 'PRA-2,PRA-4' && !gen.some(r => /PRA-3/.test(r.reqSource.sourceId)));
check('R5 EXEC: nothing else in the generator changed for zonal requirements', /If the particular risk "Tire burst" occurs within zone\(s\) Z-120, the aircraft shall retain F-BRAKE\./.test(gen.find(r => r.traceId === 'PRA-2').text));

// ---- R6 EXEC: form saves keep what the form does not show --------------------------------
const SUP = read('support_modules.js');
const els = { 'pra-threat': { value: '', tagName: 'INPUT', options: [], querySelectorAll: () => [] }, 'r-text': { value: '', tagName: 'INPUT', options: [], querySelectorAll: () => [] } };
const cs = { console, Math, JSON, Object, Array, String, Date, Set, document: { getElementById: id => els[id] || null, querySelectorAll: () => [] },
    editStates: {}, formConfigs: {}, _CRUD_KEY_TO_KIND: {}, slAlert() {}, newRowId: () => 'n1', _slAutoNumber: (k, d) => d, _slCaptureAiEdit() {},
    _crudSurgicalEnabled: () => false, cancelEdit() {}, setEditMode() {}, scrollTo() {} };
cs.window = cs; vm.createContext(cs);
cs.__pra = [{ internalId: 'c1', praId: 'PRA-9', threat: 'Tire burst', praLibId: 'tire', origin: 'pra-canvas', disposition: 'applies', zones: ['Z1'], affectedZones: ['Z1'], scenarios: [{ scnId: 'S1' }], assumptionImpacts: { a1: 'x' } }];
cs.__req = [{ internalId: 'q1', text: 'The X shall Y.', reqSource: { generator: 'pra-zonal', sourceId: 'ac:pra:PRA-9' }, history: [{ at: 1 }] }];
vm.runInContext(extract(SUP, 'makeCRUD') + '; globalThis.__p = makeCRUD({ key: "pra", store: () => __pra, formIds: { threat: "pra-threat" }, submitBtn: "b", cancelBtn: "c", defaultText: "L", tableBody: "none" });' +
    'globalThis.__q = makeCRUD({ key: "acReq", store: () => __req, formIds: { text: "r-text" }, submitBtn: "b", cancelBtn: "c", defaultText: "L", tableBody: "none" });', cs);
cs.editStates.pra = 'c1'; els['pra-threat'].value = 'Tire burst / flailing tread'; cs.__p.submit();
const e1 = cs.__pra[0];
check('R6 EXEC: a PRA edited through its form keeps scenarios, zones, library link, disposition, origin and impacts',
    e1.threat === 'Tire burst / flailing tread' && e1.scenarios && e1.scenarios[0].scnId === 'S1' && e1.zones[0] === 'Z1' && e1.praLibId === 'tire' && e1.disposition === 'applies' && e1.origin === 'pra-canvas' && e1.assumptionImpacts.a1 === 'x', JSON.stringify(e1));
cs.editStates.acReq = 'q1'; els['r-text'].value = 'The X shall Y.'; cs.__q.submit();
check('R6 EXEC: an auto-requirement saved without a text change keeps its reqSource and history (no duplicate on regeneration)', cs.__req[0].reqSource && cs.__req[0].reqSource.generator === 'pra-zonal' && cs.__req[0].history.length === 1);
cs.editStates.pra = 'c1'; els['pra-threat'].value = ''; cs.__p.submit();
check('R6 EXEC: a field the form DOES show is still saved even when emptied', cs.__pra[0].threat === '');

// ---- R7 EXEC: the editor works on a draft ------------------------------------------------
const ovl = { innerHTML: '', style: {}, remove() { doc.__ov = null; }, querySelector: () => null, querySelectorAll: () => [] };
const doc = { __ov: null, createElement: () => ovl, getElementById: id => (id === 'pra-scn-overlay' ? doc.__ov : null), body: { appendChild: (x) => { doc.__ov = x; } } };
const E = load({ document: doc, scheduleAutosave() { E.__saved = (E.__saved || 0) + 1; }, renderPRA() {} });
const er = E.praData[1];
E.SLPraScenarios.open('p2');
check('R7 EXEC: opening shows the editor', !!doc.__ov && /Tire burst/.test(ovl.innerHTML));
E.SLPraScenarios._add('p2');
check('R7 EXEC: Add changes the draft, not the row', E.SLPraScenarios._draftFor().scenarios.length === 1 && !er.scenarios);
E.SLPraScenarios.close();
check('R7 EXEC: Cancel leaves the row exactly as it was', !er.scenarios && !er.assumptionImpacts && !doc.__ov);
E.SLPraScenarios.open('p2'); E.SLPraScenarios._add('p2'); E.SLPraScenarios._saveModal('p2');
check('R7 EXEC: Save writes the scenarios back and saves the project', er.scenarios && er.scenarios.length === 1 && er.scenarios[0].scnId === 'S1' && E.__saved === 1 && !doc.__ov);

// ---- R8 ---------------------------------------------------------------------------------
const SL = read('safety_lab.js'), IDX = read('index.html'), IM = read('importers.js'), REP = read('reports.js');
check('R8: the generator is registered everywhere pra-zonal is (template, scope filter, both label maps, order)',
    /'pra-scenario':\s+\{ text: '\$\{text\}'/.test(ASR) && /\(g === 'pra-zonal' \|\| g === 'pra-scenario'\) && opts\.praZonal/.test(ASR) && /'pra-scenario':\s+'PRA scenario → Traced protection requirement'/.test(ASR) &&
    /'pra-scenario':\s+'PRA scenario → Traced protection requirement'/.test(SL) && /'pra-zonal', 'pra-scenario', 'zsa-separation'/.test(SL));
check('R8: the PRA table has a Scenarios column', /<th>Mitigation Strategy<\/th><th>Scenarios<\/th>/.test(IDX) && /SLPraScenarios\.cellHtml\(row\)/.test(SL));
check('R8: the report lists each scenario with its failure condition and decision', /'Scenarios': \(function \(\)/.test(REP) && /'NOT acceptable'/.test(REP));
const imPra = IM.slice(IM.indexOf("} else if (kind === 'pra') {"), IM.indexOf("} else if (kind === 'zsa') {"));
check('R8: the PRA import writes the table\'s own fields (desc, systems, csfl) — not "description"', /desc: String\(r\.desc/.test(imPra) && /systems: String\(r\.systems/.test(imPra) && /csfl: String\(r\.csfl/.test(imPra) && !/description:/.test(imPra));
check('R8: the module is loaded by the page', /<script src="pra_scenarios\.js\?v=[\d.]+" defer><\/script>/.test(IDX));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
