#!/usr/bin/env node
/*
 * Regression — the record behind each zonal-safety finding
 * (23 Sep 2026, standards gap G9; ARP4761A Q.14.4.6).
 *
 * Every ZSA finding (a zsaData row) now carries who assessed it, how, when, and
 * whether it is open or closed (zsa_record.js).
 *
 *   Z1  the rules: what counts as missing; closing needs the full record plus a
 *       mitigation; a bad date is refused; old rows are reported, never
 *       back-filled
 *   Z2  EXECUTED with the real makeCRUD + the real ZSA table config + the real
 *       submitZSA wrapper + the real assumption-link wrapper (all extracted from
 *       site/): a finding saves with its record; a blank status saves as open;
 *       closing without the record is refused and changes NOTHING (not the row,
 *       not another row's assumptions, not the form); editing a walkthrough
 *       finding keeps its checkpoint tag (it used to be lost)
 *   Z3  INV-51 (advisory): counts every incomplete record and every open
 *       finding; lists at most 20 of each
 *   Z4  wiring: form fields, table columns, walkthrough defaults, AI drafts
 *       start open, report + CSV export/import + spreadsheet import carry the
 *       record; the spreadsheet importer writes the ZSA table's own field names
 * Run: node tests/regression_zsa_record.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const extract = (src, name, prefix) => {
    const at = src.indexOf((prefix || 'function ') + name);
    if (at < 0) throw new Error('not found: ' + name);
    const open = src.indexOf('{', at); let d = 0;
    for (let i = open; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) return src.slice(at, i + 1); } }
    throw new Error('unbalanced: ' + name);
};

// ---- the module on its own -------------------------------------------------------------
let registered = null;
const mctx = { console, Math, JSON, String, Array, Object, Date, isNaN, setTimeout: () => 0, invRegister: inv => { registered = inv; } };
mctx.window = mctx; mctx.globalThis = mctx;
vm.createContext(mctx);
vm.runInContext(read('zsa_record.js'), mctx, { filename: 'zsa_record.js' });
const R = mctx.SLZsaRecord;

// ---- Z1 ---------------------------------------------------------------------------------
const full = { assessedBy: 'J. Ortiz', assessMethod: 'mockup', assessedOn: '2026-09-20', findingStatus: 'open', mitigation: 'Clamp relocated' };
check('Z1: a full record has nothing missing', R.missing(full).length === 0);
check('Z1: an old row (no record) is missing all four, in order', JSON.stringify(R.missing({ desc: 'x' })) === JSON.stringify(['assessor', 'method', 'date', 'status']));
check('Z1: an unknown method or an impossible date counts as missing', JSON.stringify(R.missing(Object.assign({}, full, { assessMethod: 'guess', assessedOn: '2026-13-45' }))) === JSON.stringify(['method', 'date']));
check('Z1: an open finding with a partial record may be saved', R.validate({ findingStatus: 'open', assessedBy: '' }) === null);
const closeNoRec = R.validate({ findingStatus: 'closed', mitigation: '' });
check('Z1: closing needs assessor, method, date and a mitigation — all named', /assessor, method, date, mitigation/.test(closeNoRec || ''), closeNoRec);
check('Z1: closing with the full record and a mitigation is allowed', R.validate(Object.assign({}, full, { findingStatus: 'closed' })) === null);
check('Z1: a malformed date is refused even on an open finding', /real date/.test(R.validate({ findingStatus: 'open', assessedOn: '20/09/2026' }) || ''));
const d0 = R.newFindingDefaults();
check('Z1: a new walkthrough finding starts open and dated today, with no invented assessor or method', d0.findingStatus === 'open' && /^\d{4}-\d{2}-\d{2}$/.test(d0.assessedOn) && d0.assessedBy === '' && d0.assessMethod === '');
check('Z1: import accepts our value or its label, any case; rejects anything else', R.methodFrom('Mock-up inspection') === 'mockup' && R.methodFrom('ANALYSIS') === 'analysis' && R.methodFrom('eyeballed') === '' && R.statusFrom('Closed') === 'closed' && R.statusFrom('done') === '');
check('Z1: cells escape user text', !/<script>/.test(R.recordCellHTML({ assessedBy: '<script>x</script>' })));

// ---- Z2 EXECUTED -----------------------------------------------------------------------
const SUP = read('support_modules.js'), SL = read('safety_lab.js');
function el(id, tag, value) { return { id, tagName: tag || 'INPUT', value: value || '', style: {}, innerText: '', options: [], querySelectorAll: () => [], appendChild() {} }; }
const IDS = ['zsa-zone-id', 'zsa-desc', 'zsa-equip', 'zsa-severity', 'zsa-interference', 'zsa-mitigation', 'zsa-assessed-by', 'zsa-assess-method', 'zsa-assessed-on', 'zsa-finding-status', 'btn-submit-zsa', 'btn-cancel-zsa'];
function makePage() {
    const els = {}; IDS.forEach(id => { els[id] = el(id, /method|status|severity/.test(id) ? 'SELECT' : 'INPUT'); });
    // the real <select> options, so the factory's orphan guard sees what the page has
    els['zsa-assess-method'].options = [{ value: '' }].concat(R.METHODS.map(m => ({ value: m.v })));
    els['zsa-finding-status'].options = [{ value: '' }, { value: 'open' }, { value: 'closed' }];
    els['zsa-severity'].options = [{ value: 'Major/Hazardous or Below' }, { value: 'Catastrophic' }];
    const alerts = [];
    const sb = { console, Math, JSON, Object, Array, String, Date, isNaN, Map, Set,
        document: { getElementById: id => els[id] || null, querySelectorAll: () => [], createElement: () => ({ dataset: {} }) },
        editStates: {}, formConfigs: {}, _CRUD_KEY_TO_KIND: {},
        slAlert: m => alerts.push(m), newRowId: (() => { let n = 100; return () => 'r' + (n++); })(), _slAutoNumber: (k, d) => d,
        _slCaptureAiEdit() {}, _crudSurgicalEnabled: () => false, setEditMode() {}, _threadInKebab: () => '', _sevPill: s => s, esc: s => String(s == null ? '' : s),
        _renderZsaHousedFunctionsCell: () => '', checkZSA_SpatialReq() {}, rowActionsHTML: () => '',
        _getZsaMultiSelectValues: () => ['F-1'], _readZsaAdjacencyHints: () => ({ pressurized: true }), populateZsaHousedFunctionsDropdown() {}, _clearZsaAdjacencyHints() {},
        populatePraAffectedZonesDropdown() {}, _getPraMultiSelectValues: () => [], renderPRA() {}, renderZSA() {}, scheduleAutosave() {},
        SLZsaRecord: R, zsaData: [], scrollTo() {}, _writeZsaAdjacencyHints() {} };
    sb.window = sb; sb.globalThis = sb;
    // cancelEdit clears the form like the real one does
    sb.cancelEdit = function (k) { sb.editStates[k] = null; (sb.formConfigs[k] ? sb.formConfigs[k].fields : []).forEach(id => { if (els[id]) els[id].value = ''; }); };
    vm.createContext(sb);
    const crudSrc = extract(SL, 'zsaCRUD = makeCRUD(', 'const ') + ')';
    const submitSrc = extract(SL, 'submitZSA = function(', 'window.');
    const editSrc = extract(SL, 'editZSA = function(', 'window.');
    vm.runInContext(extract(SUP, 'makeCRUD') + ';\n' + crudSrc + ';\nconst _origZsaSubmit = zsaCRUD.submit; const _origZsaEdit = zsaCRUD.edit;\n' + submitSrc + ';\n' + editSrc + ';\nglobalThis.__crud = zsaCRUD;', sb, { filename: 'zsa-extract' });
    // the assumption-link wrapper, as installed by safety_lab.js
    let asmSel = [];
    sb._read = () => asmSel.slice();
    vm.runInContext('(function(){ ' + extract(SL, '_wrapSubmit(') + '; _wrapSubmit("submitZSA", "zsa-assumptions", () => zsaData, "zsa", false); })();', sb, { filename: 'asm-wrap' });
    return { sb, els, alerts, setAsm: a => { asmSel = a; }, fill: v => Object.keys(v).forEach(k => { els[k].value = v[k]; }) };
}

let pg = makePage();
pg.setAsm(['ASM-1']);
pg.fill({ 'zsa-zone-id': 'Z-110', 'zsa-desc': 'Hyd line above connector', 'zsa-mitigation': 'Drip shield', 'zsa-assessed-by': 'J. Ortiz', 'zsa-assess-method': 'mockup', 'zsa-assessed-on': '2026-09-20', 'zsa-finding-status': '' });
pg.sb.submitZSA();
let row = pg.sb.zsaData[0];
check('Z2 EXEC: a finding saves with its record; a blank status saves as open', row && row.assessedBy === 'J. Ortiz' && row.assessMethod === 'mockup' && row.assessedOn === '2026-09-20' && row.findingStatus === 'open', JSON.stringify(row));
check('Z2 EXEC: housed functions, adjacency and assumptions ride along as before', row && row.housedFunctions[0] === 'F-1' && row.adjacency.pressurized === true && row.assumptionIds[0] === 'ASM-1');

// a second, walkthrough-born finding with a checkpoint tag
pg.sb.zsaData.push({ internalId: 'w1', zoneId: 'Z-120', zsaCheckpoint: 'drain', origin: 'walkthrough', desc: 'Drain path over bus', mitigation: '', findingStatus: 'open', assessedOn: '2026-09-21', assumptionIds: ['ASM-9'] });
// try to CLOSE a new finding with no record → refused, nothing changes
const before = JSON.stringify(pg.sb.zsaData);
pg.setAsm(['ASM-X']);
pg.fill({ 'zsa-zone-id': 'Z-130', 'zsa-desc': 'Chafe', 'zsa-mitigation': '', 'zsa-assessed-by': '', 'zsa-assess-method': '', 'zsa-assessed-on': '', 'zsa-finding-status': 'closed' });
pg.sb.submitZSA();
check('Z2 EXEC: closing without the record is refused with a message naming what is missing', pg.alerts.length === 1 && /Missing: assessor, method, date, mitigation/.test(pg.alerts[0]), pg.alerts.join(' | '));
check('Z2 EXEC: the refused save changes nothing — no row added, no other row\'s assumptions overwritten', JSON.stringify(pg.sb.zsaData) === before, 'store changed');
check('Z2 EXEC: the refused save leaves the form as the user left it', pg.els['zsa-zone-id'].value === 'Z-130' && pg.els['zsa-finding-status'].value === 'closed');

// edit the walkthrough finding through the form, closing it properly
pg.sb.cancelEdit('zsa');
pg.sb.editZSA('w1');
check('Z2 EXEC: editing loads the record into the form', pg.els['zsa-assessed-on'].value === '2026-09-21' && pg.els['zsa-finding-status'].value === 'open');
// a refused EDIT (closing with no assessor) must not touch the row or its assumptions
const w1Before = JSON.stringify(pg.sb.zsaData.find(r => r.internalId === 'w1'));
pg.setAsm(['ASM-X']);
pg.fill({ 'zsa-mitigation': 'Drain rerouted aft', 'zsa-assessed-by': '', 'zsa-assess-method': 'aircraft', 'zsa-finding-status': 'closed' });
pg.sb.submitZSA();
check('Z2 EXEC: a refused edit leaves that row — and its linked assumptions — exactly as they were', JSON.stringify(pg.sb.zsaData.find(r => r.internalId === 'w1')) === w1Before && pg.alerts.length === 2 && /Missing: assessor\./.test(pg.alerts[1]), pg.alerts[1]);
pg.setAsm(['ASM-9']);
pg.fill({ 'zsa-mitigation': 'Drain rerouted aft', 'zsa-assessed-by': 'K. Lee', 'zsa-assess-method': 'aircraft', 'zsa-finding-status': 'closed' });
pg.sb.submitZSA();
const w1 = pg.sb.zsaData.find(r => r.internalId === 'w1');
check('Z2 EXEC: a finding closes when its record is complete', w1 && w1.findingStatus === 'closed' && w1.assessedBy === 'K. Lee' && w1.assessMethod === 'aircraft', JSON.stringify(w1));
check('Z2 EXEC: editing through the form keeps the walkthrough checkpoint tag and origin (they used to be lost)', w1 && w1.zsaCheckpoint === 'drain' && w1.origin === 'walkthrough');
check('Z2 EXEC: the first finding was not touched by the edit', pg.sb.zsaData[0].assessedBy === 'J. Ortiz' && pg.sb.zsaData[0].assumptionIds[0] === 'ASM-1');

// ---- Z3 ---------------------------------------------------------------------------------
check('Z3: INV-51 registers as advisory', registered && registered.id === 'INV-51' && registered.sev === 'advisory');
mctx.zsaData = [];
for (let i = 0; i < 25; i++) mctx.zsaData.push({ zoneId: 'Z' + i, desc: 'old ' + i });                                       // incomplete
for (let i = 0; i < 23; i++) mctx.zsaData.push(Object.assign({ zoneId: 'O' + i, desc: 'open ' + i }, full));                   // complete, open
mctx.zsaData.push(Object.assign({ zoneId: 'C1', desc: 'done' }, full, { findingStatus: 'closed' }));                          // complete, closed
const res = registered.run();
check('Z3: INV-51 counts every incomplete record and every open finding', res.checked === 49 && res.failCount === 48, JSON.stringify({ c: res.checked, n: res.failCount }));
check('Z3: INV-51 lists at most 20 of each, naming what is missing', res.fails.length === 40 && /missing assessor, method, date, status/.test(res.fails[0]) && /still open/.test(res.fails[39]));
mctx.zsaData = [Object.assign({ zoneId: 'C1' }, full, { findingStatus: 'closed' })];
check('Z3: a project whose findings are all recorded and closed passes', registered.run().failCount === 0);

// ---- Z4 ---------------------------------------------------------------------------------
const IDX = read('index.html'), WT = read('zsa_walkthrough.js'), AI = read('ai_assistant.js'), REP = read('reports.js'), DO = read('data_ops_modules.js'), IM = read('importers.js');
check('Z4: the form has the four record fields and the table two new columns', ['zsa-assessed-by', 'zsa-assess-method', 'zsa-assessed-on', 'zsa-finding-status'].every(id => IDX.indexOf('id="' + id + '"') > 0) && /<th>Status<\/th><th>Assessed \(by · method · date\)<\/th>/.test(IDX));
check('Z4: the form\'s method options are exactly the module\'s', R.METHODS.every(m => IDX.indexOf('<option value="' + m.v + '">' + m.label.replace(/&/g, '&amp;') + '</option>') > 0 || IDX.indexOf('<option value="' + m.v + '">' + m.label + '</option>') > 0));
check('Z4: walkthrough findings (both kinds) start with the record defaults and show their status', (WT.match(/_recDefaults\(\)\)\);/g) || []).length === 2 && /statusCellHTML\(r\)/.test(WT));
check('Z4: an AI-drafted finding starts open with no assessor', /findingStatus: 'open',\s*\n\s*aiGenerated: true, aiFeature: 'zsa\.draft'/.test(AI.replace(/\/\/[^\n]*\n\s*/g, '')) || /findingStatus: 'open',[\s\S]{0,40}aiGenerated: true, aiFeature: 'zsa\.draft'/.test(AI));
check('Z4: report table and appendix carry status, assessor, method, date', (REP.match(/'Assessed By': z\.assessedBy/g) || []).length === 2 && (REP.match(/SLZsaRecord\.statusText\(z\)/g) || []).length === 2);
check('Z4: CSV export, CSV import and the table export carry the record', /'Status','Assessed By','Assessment Method','Assessed On'\]/.test(DO) && /assessedBy: getValue\(row, \['Assessed By'\]\)/.test(DO) && /'Status','Assessed \(by \/ method \/ date\)'\]/.test(DO));
const imZsa = IM.slice(IM.indexOf("} else if (kind === 'zsa') {"), IM.indexOf("} else if (kind === 'cma') {"));
check('Z4: the spreadsheet importer writes the ZSA table\'s own fields (zoneId, desc, interference …) plus the record', /zoneId:/.test(imZsa) && /desc:/.test(imZsa) && /interference:/.test(imZsa) && /assessMethod: _zr \? _zr\.methodFrom/.test(imZsa) && !/\bzone: String/.test(imZsa) && !/\bthreat: String/.test(imZsa));
check('Z4: the module is loaded by the page', /<script src="zsa_record\.js\?v=[\d.]+" defer><\/script>/.test(IDX));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
