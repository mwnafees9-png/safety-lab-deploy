#!/usr/bin/env node
/*
 * Regression — the basis of a requirement (27 Sep 2026, OPEN_ITEMS Q1 + Q2 + Q3;
 * ARP4754B §5.3.1 rationale, ARP4761A App K/L/M vocabulary).
 *
 *   B1  source tags: every generator maps to FHA / PSSA / CMA / PRA / ZSA / HF; an
 *       authored sourceAnalysis wins over the generator; a promoted assumption's
 *       requirement inherits the assumption's tag; an assumption is tagged from its
 *       authored field, its HF type or its origin text; junk normalizes to ''
 *   B2  promote: one click builds a Safety requirement carrying the assumption's ID,
 *       its rationale, its credited posture and its tag, traced to the assumption's
 *       first failure condition, at L1 (aircraft) or L2 (system); the store gets the
 *       row, the assumption gets the back-link, a second click returns the existing
 *       row and writes nothing; reqsForAsm finds a row by source or by linkedAsmIds
 *       and ignores deleted rows
 *   B3  credit gap: credited + alive + not verified + no requirement is a gap; verified,
 *       dead, uncredited or held ones are not; INV-59 counts and names them
 *   B4  rationale: a Safety or generated requirement with an empty rationale is a gap,
 *       a Functional one is not, deleted and archived rows are skipped; INV-60; the
 *       form gate refuses a Safety requirement with no rationale and the wrapped
 *       submit never reaches the original, while a rationale or another class passes
 *   B5  Golden Thread: the "Requirement basis" stage names the requirement with no
 *       rationale and the credited assumption with nothing behind it, says CHECK, and
 *       the wrapper inserts it before the Verification stage; a condition with
 *       nothing traced adds no stage
 *   B6  reports: appendixRows groups by tag in vocabulary order with Untagged last and
 *       lists assumptions with their holding requirement; reports.js carries the Source
 *       column, the src_table, the appendix regex, the checkbox, the six core reports'
 *       allowedAppendices and both renderer branches
 *   B7  page decorations: an unheld assumption gets the promote button and the tag
 *       select, a held one shows its requirement, a gap shows the badge; a requirement
 *       row gets its tag pill and the no-rationale badge; renders are wrapped once
 *   B8  wiring: loaded right after critical_gates.js, the two form selects exist and
 *       are on the CRUD formIds, GEN_LABELS knows 'assumption', no eval, module exports
 * Run: node tests/regression_req_basis.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('req_basis.js'), IDX = read('index.html'), REPORTS = read('reports.js'), SL = read('safety_lab.js'), ASSUR = read('assurance_modules.js');

// ---- a very small DOM, enough for the decorations and the form gate ------------------
function El(tag, attrs) {
    this.tagName = tag.toUpperCase(); this.attrs = Object.assign({}, attrs || {}); this.children = []; this.innerHTML = ''; this.value = ''; this.style = {};
    this.textContent = ''; this.focused = false;
}
El.prototype.getAttribute = function (k) { return this.attrs[k] == null ? null : this.attrs[k]; };
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.insertAdjacentHTML = function (_, h) { this.innerHTML += h; };
El.prototype.scrollIntoView = function () {};
El.prototype.focus = function () { this.focused = true; };
El.prototype.querySelectorAll = function (sel) {
    if (sel === 'tr') return this.children.filter(c => c.tagName === 'TR');
    if (sel === 'td') return this.children.filter(c => c.tagName === 'TD');
    return [];
};
El.prototype.querySelector = function (sel) {
    if (sel === 'td strong') { for (const td of this.children) for (const c of td.children) if (c.tagName === 'STRONG') return c; return null; }
    return null;
};
function makeDoc() {
    const byId = {};
    const doc = {
        getElementById: id => byId[id] || null,
        querySelector: () => null,
        el: (tag, id, attrs) => { const e = new El(tag, attrs); if (id) { byId[id] = e; e.id = id; } return e; }
    };
    return doc;
}
function asmRow(doc, asmId) {
    const tr = new El('tr'); const td = new El('td'); const strong = new El('strong'); strong.textContent = asmId; td.children.push(strong); strong.parentNode = td; tr.children.push(td);
    return tr;
}
function reqRow(doc, iid) {
    const tr = new El('tr', { 'data-iid': String(iid) });
    for (let i = 0; i < 8; i++) tr.children.push(new El('td'));
    return tr;
}

function load(model, extra) {
    const toasts = [];
    const sb = Object.assign({ console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, isFinite, setTimeout: (f) => 0,
        showToast: (m, k) => toasts.push({ m, k }), _toasts: toasts, scheduleAutosave: () => { sb._saved = (sb._saved || 0) + 1; },
        newRowId: (() => { let n = 9000; return () => ++n; })(),
        _gtStage: (t, b, s) => '<div style="border:1px solid var(--color-border-hair)" data-stage="' + t + '" data-status="' + s + '">' + b + '</div>' }, model, extra || {});
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    vm.createContext(sb);
    vm.runInContext(SRC, sb, { filename: 'req_basis.js' });
    return sb;
}
const fc = (id, sev, extra) => Object.assign({ internalId: id, fcId: 'FC-' + id, fcDesc: 'cond ' + id, severity: sev, subId: 'SF-' + id, assumptionIds: [] }, extra || {});
const asm = (id, extra) => Object.assign({ asmId: id, origin: 'Design', text: 'Assumption ' + id + ' holds', state: 'Proposed', rationale: '' }, extra || {});
const req = (iid, extra) => Object.assign({ internalId: iid, type: 'Safety', text: 'The system shall ' + iid, rat: 'because ' + iid, traceId: '' }, extra || {});

// ---- B1 tags --------------------------------------------------------------------------
{
    const sb = load({ acReqData: [], acAssumptionsData: [asm('A-1', { origin: 'FHA workshop' })], acFhaData: [], systemsData: [] });
    const RB = sb.SLReqBasis;
    const want = { 'fha-prob': 'FHA', 'fha-dal': 'FHA', 'fta-event': 'PSSA', 'fta-interval': 'PSSA', 'fta-resource': 'PSSA', 'fta-resource-iface': 'PSSA', 'dalgebra': 'PSSA', 'dalgebra-default': 'PSSA',
                   'gate-indep-and': 'PSSA', 'gate-indep-dev': 'PSSA', 'gate-indep-phys': 'PSSA', 'gate-indep-ccf-lib': 'PSSA', 'gate-indep-ccf-group': 'PSSA', 'gate-indep-or': 'PSSA', 'gate-indep-cma': 'CMA',
                   'pra-zonal': 'PRA', 'pra-scenario': 'PRA', 'zsa-separation': 'ZSA', 'zsa-phys': 'ZSA', 'hf-op-action': 'HF', 'hf-op-timing': 'HF', 'hf-op-info': 'HF', 'iface-def': 'PSSA', 'fcim-monitor': 'PSSA', 'usoc-info': 'PSSA' };
    const bad = Object.keys(want).filter(g => RB.tagOfGenerator(g) !== want[g]);
    check('B1: every generator maps to one of the six tags', bad.length === 0, bad.join(','));
    check('B1: an unknown generator has no tag', RB.tagOfGenerator('reqif') === '' && RB.tagOfGenerator('') === '');
    const st = RB.storeFor('ac');
    check('B1: authored sourceAnalysis wins over the generator', RB.tagOfReq({ sourceAnalysis: 'ZSA', reqSource: { generator: 'fha-prob' } }, st) === 'ZSA');
    check('B1: an authored tag is normalized and junk is dropped', RB.normTag(' pra ') === 'PRA' && RB.normTag('SSA') === '' && RB.tagOfReq({ sourceAnalysis: 'nonsense' }, st) === '');
    check('B1: a promoted assumption inherits the assumption tag', RB.tagOfReq({ reqSource: { generator: 'assumption', sourceId: 'asm:A-1' } }, st) === 'FHA');
    check('B1: an assumption is tagged from its field, its HF type or its origin', RB.tagOfAsm({ sourceAnalysis: 'CMA', origin: 'FHA' }) === 'CMA' && RB.tagOfAsm({ type: 'Human factors' }) === 'HF' && RB.tagOfAsm({ origin: 'ZSA walkthrough' }) === 'ZSA' && RB.tagOfAsm({ origin: 'Design' }) === '');
    check('B1: a Human Factors analysis field tags HF; a manual row with nothing is untagged', RB.tagOfReq({ analysis: 'Human Factors' }, st) === 'HF' && RB.tagOfReq({ type: 'Safety' }, st) === '');
    check('B1: tagSource says authored or derived', RB.tagSource({ sourceAnalysis: 'FHA' }) === 'authored' && RB.tagSource({ reqSource: { generator: 'fha-prob' } }) === 'derived' && RB.tagSource({}) === '');
}

// ---- B2 promote -----------------------------------------------------------------------
{
    const a1 = asm('A-1', { origin: 'PRA', rationale: 'Bird mass per CS 25.631.', credited: 'no penetration below 8 lb', uncredited: 'penetration assumed', state: 'Validated' });
    const sys1 = { id: 'S1', name: 'Hydraulics', req: [], asm: [asm('A-9', { text: 'Pump is dissimilar' })], fha: [fc(50, 'Hazardous', { assumptionIds: ['A-9'] })] };
    const sb = load({ acReqData: [], acAssumptionsData: [a1], acFhaData: [fc(1, 'Catastrophic', { assumptionIds: ['A-1'] })], systemsData: [sys1], activeSystemId: 'S1' });
    const RB = sb.SLReqBasis;
    const built = RB.buildPromotion(a1, RB.storeFor('ac'));
    check('B2: the row is a Safety requirement at L1 carrying the statement', built.type === 'Safety' && built.level === 'L1' && built.text === a1.text);
    check('B2: the rationale carries the assumption ID, origin, rationale and both postures', /Promoted from assumption A-1 \(PRA\)/.test(built.rat) && built.rat.indexOf('Bird mass') >= 0 && built.rat.indexOf('Credited posture: no penetration') >= 0 && built.rat.indexOf('Uncredited posture: penetration') >= 0, built.rat);
    check('B2: the tag is inherited and the source names the assumption', built.sourceAnalysis === 'PRA' && built.reqSource.generator === 'assumption' && built.reqSource.sourceId === 'asm:A-1' && built.linkedAsmIds[0] === 'A-1');
    check('B2: traced to the first linked failure condition sub-function', built.traceId === 'SF-1');
    check('B2: derived, no verification yet', built.derivationType === 'derived' && built.verifStatus === '' && typeof built.reqSource.promotedAt === 'string');
    const r1 = RB.promote('ac', 'A-1');
    check('B2: promote writes the row into the aircraft store and back-links the assumption', r1 && r1.created && sb.acReqData.length === 1 && sb.acReqData[0] === r1.req && a1.requirementIds[0] === r1.req.internalId && sb._saved === 1);
    const r2 = RB.promote('ac', 'A-1');
    check('B2: a second click returns the existing row and writes nothing', r2 && !r2.created && r2.req === r1.req && sb.acReqData.length === 1 && sb._saved === 1);
    const r3 = RB.promote('sys', 'A-9');
    check('B2: a system assumption promotes into the active system store at L2', r3 && r3.created && sys1.req.length === 1 && r3.req.level === 'L2' && r3.req.traceId === 'SF-50' && r3.scope === 'sys-S1');
    check('B2: reqsForAsm finds the row by its source', RB.reqsForAsm('A-1').length === 1 && RB.reqsForAsm('A-9')[0].scope === 'sys-S1');
    sb.acReqData.push(req(77, { linkedAsmIds: ['A-1'] }));
    check('B2: reqsForAsm also finds a hand-linked row', RB.reqsForAsm('A-1').length === 2);
    sb.acReqData[1].deleted = true;
    check('B2: a deleted row does not hold the assumption', RB.reqsForAsm('A-1').length === 1);
    check('B2: promote of an unknown assumption or scope returns null', RB.promote('ac', 'NOPE') === null && RB.promote('sys-ZZ', 'A-1') === null);
    // promoteClick re-renders and toasts
    let rendered = [];
    sb.renderACReq = () => rendered.push('req'); sb.renderACAssumptions = () => rendered.push('asm');
    sb.acAssumptionsData.push(asm('A-2'));
    RB.promoteClick('ac', 'A-2');
    check('B2: promoteClick creates, re-renders both tables and says so', sb.acReqData.length === 3 && rendered.join(',') === 'req,asm' && sb._toasts.some(t => /created from assumption A-2/.test(t.m)));
    RB.promoteClick('ac', 'A-2');
    check('B2: promoteClick on a held assumption says which requirement holds it', sb._toasts.some(t => /already held by REQ-/.test(t.m)) && sb.acReqData.length === 3);
}

// ---- B3 credit gaps ---------------------------------------------------------------------
{
    const rows = [asm('G-1', { credited: 'yes', state: 'Proposed' }), asm('G-2', { credited: 'yes', state: 'Verified' }), asm('G-3', { credited: 'yes', state: 'Invalidated' }),
                  asm('G-4', { uncredited: 'only', state: 'Proposed' }), asm('G-5', { credited: 'yes', state: 'Validated' }), asm('G-6', { credited: '   ', state: 'Validated' })];
    const sb = load({ acReqData: [req(1, { reqSource: { generator: 'assumption', sourceId: 'asm:G-5' } })], acAssumptionsData: rows, acFhaData: [], systemsData: [] });
    const RB = sb.SLReqBasis;
    const gaps = RB.creditGaps().map(g => g.asmId);
    check('B3: credited, alive, not verified and unheld is the only gap', gaps.length === 1 && gaps[0] === 'G-1', gaps.join(','));
    check('B3: verified, dead, uncredited, held and blank-credited are not gaps', ['G-2', 'G-3', 'G-4', 'G-5', 'G-6'].every(id => gaps.indexOf(id) < 0));
    const s = RB.statusOfAsm(rows[4]);
    check('B3: status of a held assumption names its requirement', s.kind === 'req' && /REQ-1/.test(s.text) && RB.statusOfAsm(rows[1]).kind === 'verified' && RB.statusOfAsm(rows[0]).kind === 'gap' && RB.statusOfAsm(rows[3]).kind === 'none');
    const inv = RB.INV_CREDIT.run();
    check('B3: INV-59 is advisory, counts the credited live assumptions and names the gap', RB.INV_CREDIT.id === 'INV-59' && RB.INV_CREDIT.sev === 'advisory' && inv.checked === 3 && inv.failCount === 1 && /G-1 \[Proposed\] is credited/.test(inv.fails[0]), JSON.stringify(inv));
}

// ---- B4 rationale --------------------------------------------------------------------------
{
    const rows = [req(1, { rat: '' }), req(2, { type: 'Functional', rat: '' }), req(3, { type: 'Functional', rat: '', reqSource: { generator: 'fta-event', sourceId: 'x' } }),
                  req(4, { rat: '   ' }), req(5, { rat: '', deleted: true }), req(6, { rat: '', status: 'archived' }), req(7), req(8, { type: 'Performance', rat: '', analysis: 'Probabilistic' })];
    const sb = load({ acReqData: rows, acAssumptionsData: [], acFhaData: [], systemsData: [{ id: 'S1', name: 'Sys', req: [req(9, { rat: '' })], asm: [], fha: [] }] });
    const RB = sb.SLReqBasis;
    const g = RB.rationaleGaps().map(x => x.req.internalId);
    check('B4: Safety, generated and analysis-tagged rows with no rationale are gaps, across aircraft and system stores', g.join(',') === '1,3,4,8,9', g.join(','));
    check('B4: a Functional row, a deleted row, an archived row and a row with a rationale are not', [2, 5, 6, 7].every(i => g.indexOf(i) < 0));
    const inv = RB.INV_RAT.run();
    check('B4: INV-60 is advisory, counts safety-derived live rows and names the gaps', RB.INV_RAT.id === 'INV-60' && RB.INV_RAT.sev === 'advisory' && inv.checked === 6 && inv.failCount === 5 && /REQ-1 \(Safety\) has no rationale/.test(inv.fails[0]), JSON.stringify(inv));
    // the form gate
    const doc = makeDoc();
    const type = doc.el('select', 'ac-req-type'), rat = doc.el('input', 'ac-req-rat');
    sb.document = doc;
    let calls = 0;
    sb.submitACReq = function () { calls++; };
    check('B4: the submit wrapper installs once', RB._wrapSubmit('submitACReq', 'ac-req') === true && RB._wrapSubmit('submitACReq', 'ac-req') === false && sb.submitACReq._rbWrapped === true);
    type.value = 'Safety'; rat.value = '';
    sb.submitACReq();
    check('B4: a Safety requirement with no rationale is refused, the field is focused and the reason is shown', calls === 0 && rat.focused && sb._toasts.some(t => /needs a rationale/.test(t.m) && t.k === 'warning'));
    rat.value = 'because the FHA says so';
    sb.submitACReq();
    check('B4: with a rationale the original submit runs', calls === 1);
    type.value = 'Functional'; rat.value = '';
    sb.submitACReq();
    check('B4: another class passes without a rationale', calls === 2);
    const sb2 = load({ acReqData: [], acAssumptionsData: [], acFhaData: [], systemsData: [] });
    check('B4: without the form on the page the gate is open', sb2.SLReqBasis.formOk('ac-req') === true);
}

// ---- B5 Golden Thread --------------------------------------------------------------------------
{
    const f1 = fc(1, 'Catastrophic', { assumptionIds: ['A-1', 'A-2'] }), f2 = fc(2, 'Major');
    const rows = [req(1, { rat: '', traceId: 'SF-1' }), req(2, { traceId: 'SF-1' }), req(3, { rat: '', type: 'Functional', traceId: 'SF-1' }),
                  req(4, { rat: '', reqSource: { generator: 'fha-prob', sourceId: 'ac:fha:prob:1', context: { fcId: 'FC-1' } } }), req(5, { reqSource: { generator: 'assumption', sourceId: 'asm:A-2' } })];
    const asms = [asm('A-1', { credited: 'yes', state: 'Validated' }), asm('A-2', { credited: 'yes', state: 'Validated' })];
    const sb = load({ acReqData: rows, acAssumptionsData: asms, acFhaData: [f1, f2], systemsData: [] });
    const RB = sb.SLReqBasis;
    const traced = RB.reqsForFc(f1, RB.storeFor('ac')).map(r => r.internalId);
    check('B5: requirements are traced to the condition by sub-function, by source context and by source id', traced.join(',') === '1,2,3,4', traced.join(','));
    const st = RB.threadStage(f1);
    check('B5: the stage names the requirements without rationale and not the Functional one', /REQ-1/.test(st) && /REQ-4/.test(st) && !/REQ-2/.test(st) && !/REQ-3/.test(st), st);
    check('B5: the stage names the credited assumption with nothing behind it, with a promote link, and shows the held one', /A-1/.test(st) && /credited, nothing behind it/.test(st) && /promoteClick\('ac','A-1'\)/.test(st) && /A-2<\/b> · held by REQ-5/.test(st), st);
    check('B5: the stage says CHECK', /data-status="warn"/.test(st) && /3 safety requirements and 2 linked assumptions checked/.test(st), st);
    check('B5: a condition with nothing traced adds no stage', RB.threadStage(f2) === '' && RB.threadStage(null) === '');
    rows[0].rat = 'now explained'; rows[3].rat = 'explained'; asms[0].state = 'Verified';
    check('B5: with everything explained the stage is OK and still shows what holds the assumptions', /data-status="ok"/.test(RB.threadStage(f1)) && /held by REQ-5/.test(RB.threadStage(f1)) && !/no rationale/.test(RB.threadStage(f1)));
    f1.assumptionIds = [];
    check('B5: with nothing to report the stage says so', /Every safety requirement here carries a rationale/.test(RB.threadStage(f1)));
    f1.assumptionIds = ['A-1', 'A-2'];
    // wrapper placement
    const orig = (fha) => '<div style="border:1px solid var(--color-border-hair)"><span>Requirements</span></div><div style="border:1px solid var(--color-border-hair)"><span>Verification</span></div><div style="border:1px solid var(--color-border-hair)"><span>Assumptions</span></div>';
    sb._renderGoldenThread = orig;
    check('B5: the thread wrapper installs once', RB._wrapThread() === true && RB._wrapThread() === false);
    const out = sb._renderGoldenThread(f1, 'ac', null);
    const iStage = out.indexOf('data-stage="Requirement basis"'), iVer = out.indexOf('>Verification</span>'), iReq = out.indexOf('>Requirements</span>');
    check('B5: the stage is inserted between Requirements and Verification', iStage > iReq && iStage < iVer && out.indexOf('data-stage') === out.lastIndexOf('data-stage'), String([iReq, iStage, iVer]));
    check('B5: a condition with no stage leaves the thread untouched', sb._renderGoldenThread(f2, 'ac', null) === orig(f2));
}

// ---- B6 reports ---------------------------------------------------------------------------------
{
    const rows = [req(1, { reqSource: { generator: 'zsa-separation', sourceId: 'z' } }), req(2, { sourceAnalysis: 'FHA' }), req(3), req(4, { reqSource: { generator: 'assumption', sourceId: 'asm:A-1' } })];
    const asms = [asm('A-1', { origin: 'CMA', state: 'Validated' }), asm('A-2', { type: 'hf' })];
    const sb = load({ acReqData: rows, acAssumptionsData: asms, acFhaData: [], systemsData: [{ id: 'S1', name: 'Sys', req: [req(9, { sourceAnalysis: 'PRA' })], asm: [], fha: [] }] });
    const RB = sb.SLReqBasis;
    const g = RB.byTag('ac');
    check('B6: byTag groups by the six tags plus Untagged and honors scope', g.FHA.requirements.length === 1 && g.ZSA.requirements.length === 1 && g.CMA.requirements.length === 1 && g.CMA.assumptions.length === 1 && g.HF.assumptions.length === 1 && g[''].requirements.length === 1 && g.PRA.requirements.length === 0);
    check('B6: byTag with no scope sees every store', RB.byTag(null).PRA.requirements.length === 1 && RB.byTag(null).PRA.requirements[0].scope === 'Sys');
    const t = RB.appendixRows('ac');
    check('B6: appendix rows come in vocabulary order with Untagged last', t.map(r => r.Source).join(',') === 'FHA,CMA,CMA,ZSA,HF,Untagged', t.map(r => r.Source).join(','));
    const a1 = t.find(r => r.Kind === 'Assumption' && r.ID === 'A-1');
    check('B6: an assumption row carries its state and the requirement holding it, by ID', a1 && /Validated · held by REQ-4/.test(a1.Status) && Object.keys(a1).join(',') === 'Source,Kind,ID,Statement,Rationale,Status', JSON.stringify(a1));
    check('B6: reports.js puts the Source column on the requirements and assumptions tables', /'Source':\s+_srcTag\('req', r, sys\)/.test(REPORTS) && /'Source':\s+_srcTag\('asm', a, sys\)/.test(REPORTS));
    check('B6: reports.js builds src_table from req_basis and parses {{appendix:src}}', /src_table: _srcRows\(sys\)/.test(REPORTS) && /appendix:\(fta\|zsa\|pra\|cma\|src\)/.test(REPORTS) && (REPORTS.match(/'\{\{appendix:src\}\}',/g) || []).length === 8);
    check('B6: the six core reports allow the appendix and the modal offers it', ['AFHA', 'PASA', 'ASA', 'SFHA', 'PSSA', 'SSA'].every(k => new RegExp(k + ":\\s*\\{[^\\n]*'src'\\]").test(REPORTS)) && (REPORTS.match(/id="rpt-appx-src"/g) || []).length === 2 && (REPORTS.match(/\['fta','zsa','pra','cma','src'\].forEach/g) || []).length === 5);
    check('B6: both renderers draw the src table under a plain-language heading', /b\.name === 'src'/.test(REPORTS) && (REPORTS.match(/data\.src_table/g) || []).length >= 3 && /_appxTitle\(name\) \{ return name === 'src' \? 'Requirements and assumptions by source analysis'/.test(REPORTS) && (REPORTS.match(/_appxTitle\((b\.name|ap)\)/g) || []).length === 4);
}

// ---- B7 decorations ----------------------------------------------------------------------------
{
    const asms = [asm('A-1', { credited: 'yes', state: 'Proposed' }), asm('A-2', { state: 'Validated', sourceAnalysis: 'PRA' }), asm('A-3')];
    const rows = [req(1, { reqSource: { generator: 'assumption', sourceId: 'asm:A-2' } }), req(2, { rat: '', reqSource: { generator: 'fha-prob' } }), req(3, { type: 'Functional', rat: '' })];
    const sb = load({ acReqData: rows, acAssumptionsData: asms, acFhaData: [], systemsData: [] });
    const RB = sb.SLReqBasis;
    const doc = makeDoc(); sb.document = doc;
    const asmBody = doc.el('tbody', 'ac-asm-body'); asms.forEach(a => asmBody.children.push(asmRow(doc, a.asmId)));
    const reqBody = doc.el('tbody', 'ac-req-body'); rows.forEach(r => reqBody.children.push(reqRow(doc, r.internalId)));
    check('B7: every assumption row is decorated once', RB.decorateAsmTable('ac') === 3 && RB.decorateAsmTable('ac') === 0);
    const c = i => asmBody.children[i].children[0].innerHTML;
    check('B7: an unheld credited assumption gets the promote button and the GAP badge', /promoteClick\('ac','A-1'\)/.test(c(0)) && /● GAP/.test(c(0)) && /→ requirement/.test(c(0)), c(0));
    check('B7: a held assumption shows its requirement instead of the button', /→ REQ-1/.test(c(1)) && !/promoteClick/.test(c(1)) && !/GAP/.test(c(1)), c(1));
    check('B7: an uncredited assumption gets the button and no badge', /promoteClick\('ac','A-3'\)/.test(c(2)) && !/GAP/.test(c(2)));
    check('B7: every row gets the tag select with the current tag selected', [0, 1, 2].every(i => /setAsmTag\('ac','A-\d'/.test(c(i))) && /value="PRA" selected/.test(c(1)) && /<option value="" selected>/.test(c(0)));
    RB.setAsmTag('ac', 'A-3', 'zsa');
    check('B7: setAsmTag normalizes, writes and autosaves', asms[2].sourceAnalysis === 'ZSA' && sb._saved === 1);
    check('B7: every requirement row is decorated once', RB.decorateReqTable('ac') === 3 && RB.decorateReqTable('ac') === 0);
    const r = (i, j) => reqBody.children[i].children[j].innerHTML;
    check('B7: the tag pill sits by the Type cell and the row carries the tag', /data-rb-tag="PRA"/.test(r(0, 3)) && reqBody.children[0].getAttribute('data-rb-tag') === 'PRA' && /data-rb-tag="FHA"/.test(r(1, 3)) && r(2, 3) === '');
    check('B7: the no-rationale badge sits by the Rationale cell of the safety row only', /no rationale/.test(r(1, 5)) && !/no rationale/.test(r(0, 5)) && !/no rationale/.test(r(2, 5)));
    let n = 0; sb.renderACAssumptions = () => { n++; };
    check('B7: a render is wrapped once and still runs', RB._wrapRender('renderACAssumptions', () => {}) === true && RB._wrapRender('renderACAssumptions', () => {}) === false && (sb.renderACAssumptions(), n === 1));
}

// ---- B8 wiring ---------------------------------------------------------------------------------------
{
    check('B8: req_basis.js is loaded right after critical_gates.js', /critical_gates\.js\?v=[\d.]+" defer><\/script>\s*(<!--[^>]*-->\s*)?<script src="req_basis\.js\?v=[\d.]+" defer><\/script>/.test(IDX));
    check('B8: both requirement forms carry the source select with the six tags', ['ac-req-source', 'sys-req-source'].every(id => new RegExp('<select id="' + id + '">[^\\n]*<option>FHA</option><option>PSSA</option><option>CMA</option><option>PRA</option><option>ZSA</option><option>HF</option>').test(IDX)));
    check('B8: the selects are on the CRUD formIds', /sourceAnalysis: 'ac-req-source'/.test(SL) && /sourceAnalysis: 'sys-req-source'/.test(SL));
    check('B8: the generator label map knows the promoted requirement', /'assumption':\s+'Assumption → Promoted requirement/.test(ASSUR));
    check('B8: no eval or Function constructor', !/\beval\s*\(/.test(SRC) && !/new Function\s*\(/.test(SRC));
    check('B8: module exports the API', /module\.exports = api/.test(SRC) && /root\.SLReqBasis = api/.test(SRC));
    check('B8: the six tags are the vocabulary', load({}).SLReqBasis.TAGS.join(',') === 'FHA,PSSA,CMA,PRA,ZSA,HF');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
