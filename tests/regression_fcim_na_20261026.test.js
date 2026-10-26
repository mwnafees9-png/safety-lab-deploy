#!/usr/bin/env node
/*
 * Regression: an FCIM cell that does not apply is "N/A" with its reason, and the engine stops it at the FCIM (26 Oct 2026).
 *
 * RULING (Waqas, 26 Oct 2026, confirmed): "instead of leaving non-applicable failure conditions blank the AI should be
 *   populating them as N/A with the rationale why the AI did not consider those failure conditions. But our engine should
 *   read them as not applicable and NOT count them as failure conditions at all and not populate the thread or any other
 *   conditions from that point on; they are stopped right at the FCIM level." And: "the engineer can overrule N/A and ask
 *   ANEM (the AI assistant) to draft that failure condition or do it manually."
 * THE SHAPE: a cell's reason it does not apply is row.tlNa / plNa / mNa (a string); with it the cell holds no FC ID and
 *   no text. The AI returns a cell as text, or {"na": true, "rationale": "..."} (or "N/A: <reason>").
 * EXECUTED, the real files:
 *   [A] ai_assistant.js  the AI reply: N/A with a reason accepted, N/A with none refused, an empty cell refused (the one
 *                        rule from 26 Oct, ef2a6f9, still holds); the batch filter; an empty turn is retried; the writer
 *   [P] ai_assistant.js / ai_skills.js  the prompt and the skill ask for N/A with its rationale, never a blank
 *   [E] misc_fn_modules.js, fcim_na.js, fc_auto_trees.js, assurance_modules.js (AutoReq, Traceability), lane_trees.js
 *                        the engine: an N/A cell is no extracted condition (even with a stale FC ID on it), so no AFHA
 *                        row can be built on it, no tree, no requirement, no thread entry, no lane top event; marking a
 *                        cell that already had FHA rows asks, and "set aside" takes them out of every reader; Thread
 *                        Integrity (INV-68) flags a blank cell and never an N/A one
 *   [D] overrule and draft one cell; the engineer's own N/A needs a reason; every action goes through SLChangeAck
 *   [X] exports and imports carry "N/A: <reason>"; SysML does not export an N/A cell as a failure condition
 *   [O] an old project (no N/A fields) behaves exactly as before: on every demo project, the extracted failure
 *       conditions are identical to the pre-change algorithm
 *   [L] load order and cache keys
 * MUTATION PROOFS: SL_FCIMNA_MUTATE=stop | rule | noreason | parse | writer | prompt | skill | turn | mark | park | audit |
 *   auditna | reason | overrule | settle | asked | lane | export | import | inv31 | draftcell | fhana | nofcimfha | sysml
 *   each reverts one piece in a copy of its file: red.
 * Run: node tests/regression_fcim_na_20261026.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 700) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_FCIMNA_MUTATE || '';
const MUTS = {
    stop:      ['misc_fn_modules.js', "if (d.plId && !naPl) out.push(", "if (d.plId) out.push("],
    rule:      ['ai_assistant.js', "ok: function (x) { return _fcimCellsOf(x).every(function (v) { return v === 'condition' || v === 'na'; }); }", "ok: function (x) { return _fcimCellsOf(x).some(function (v) { return v === 'condition'; }); }"],
    noreason:  ['ai_assistant.js', "if (na) return why ? { na: why } : { naNoWhy: true };\n            return {};", "if (na) return { na: why || 'N/A' };\n            return {};"],
    parse:     ['ai_assistant.js', "if (m) { const why = m[1].trim(); return why ? { na: why } : { naNoWhy: true }; }", "if (false) { }"],
    writer:    ['ai_assistant.js', "if (s[c.k + 'Na'] && !_has(row[c.s + 'Desc'])) { row[c.s + 'Na'] = String(s[c.k + 'Na']).trim(); row[c.s + 'NaBy'] = 'ai'; row[c.s + 'NaAt'] = row.aiAt; }", ""],
    prompt:    ['ai_assistant.js', "'Fill ALL THREE levels on every row. A level with", "'Include only the levels that are credible (omit any that do not apply). A level with"],
    skill:     ['ai_skills.js', "\\nEVERY CELL IS ANSWERED (Waqas ruling, 26 Oct 2026)", "\\nEVERY CELL (Waqas ruling, 26 Oct 2026)"],
    turn:      ['ai_assistant.js', "pp.actions.some(function (x) { try { return !_actionMissing(x); } catch (_) { return true; } })", "pp.actions.length"],
    mark:      ['fcim_na.js', "        row[sl.id] = ''; row[sl.desc] = '';\n        row[s + 'Na'] = reason;", "        row[s + 'Na'] = reason;"],
    park:      ['fcim_na.js', "for (var j = took.length - 1; j >= 0; j--) fha.splice(took[j].at, 1);", ""],
    audit:     ['fcim_na.js', "if (st2 === 'blank') { out.blank.push(", "if (st2 === 'blank') { (void 0) && out.blank.push("],
    auditna:   ['fcim_na.js', "        if (why(row, s)) return 'na';\n", ""],
    reason:    ['fcim_na.js', "if (!reason) return { ok: false, error: 'A cell marked not applicable needs the reason it does not apply.' };", ""],
    overrule:  ['fcim_na.js', "fha.splice(Math.min(x.at || 0, fha.length), 0, x.row); n++;", "n++;"],
    settle:    ['fcim_na.js', "            _unpark(row, s, fha);\n            if (!_t(row[sl.id])", "            if (!_t(row[sl.id])"],
    asked:     ['fc_auto_trees.js', "(_setAside(a.key) ? 'its failure condition was marked", "(false ? 'its failure condition was marked"],
    lane:      ['lane_trees.js', "        if (naWhy) {", "        if (false) {"],
    export:    ['misc_fn_modules.js', "    if (_fcimIsNaCell(r, s)) return ['N/A', 'N/A: ' + String(r[s + 'Na']).trim()];\n", ""],
    import:    ['misc_fn_modules.js', "if (m && (!i || /^n\\/?a$/i.test(i))) {", "if (false) {"],
    inv31:     ['invariants.js', "_has(c.tlNa) || _has(c.plNa) || _has(c.mNa) || ", ""],
    draftcell: ['ai_assistant.js', "if (_fcimCellState(row, s) !== 'blank') { _toast('Not written: the ' + sl.label + ' cell of ' + row.subId + ' is no longer open.', 'warning'); return false; }", ""],
    fhana:     ['ai_assistant.js', "if (t(r[c[0] + 'Na']) && !t(r[c[0] + 'Desc'])) lines.push(", "if (false) lines.push("],
    nofcimfha: ['ai_assistant.js', "if (_fcimRowsNow.length) { _toast('The FCIM identifies no failure conditions yet", "if (false) { _toast('The FCIM identifies no failure conditions yet"],
    sysml:     ['sysml_model.js', "if (d.plId && !na('pl')) out.push(", "if (d.plId) out.push("]
};
const RAW = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function S(f) {
    let s = RAW(f);
    const m = MUTS[MUT];
    if (m && m[0] === f) { if (s.indexOf(m[1]) < 0) { console.log('  FAIL  the mutation ' + MUT + ' found nothing to change in ' + f); process.exit(1); } s = s.split(m[1]).join(m[2]); }
    return s;
}
if (MUT && !MUTS[MUT]) { console.log('  FAIL  unknown mutation ' + MUT); process.exit(1); }
const ai = S('ai_assistant.js');
const cut = (src, start, endMark, incl) => { const a = src.indexOf(start), b = src.indexOf(endMark, a + 1); return a >= 0 && b > a ? src.slice(a, b + (incl ? endMark.length : 0)) : ''; };

(async function main() {
// ===================================================================================================================
console.log('\n[A] the AI reply: N/A with its reason, never a blank');
const RULE = cut(ai, '    const _has = function (v) {', '\n    // F1c batch (30 Aug 2026)');
const R = { console, String, Object, Array, JSON, toasts: [] }; vm.createContext(R);
try { vm.runInContext('function _toast(m) { toasts.push(m); }\n' + RULE + '\nthis.missing = _actionMissing; this.rowMissing = _rowMissing; this.norm = _fcimNormAction; this.cellIn = _fcimCellIn; this.refuse = _refuseEmpty;', R); } catch (e) { check('the rule compiles', false, e.message); }
check('[A0] extracted the one rule and the cell reader', typeof R.missing === 'function' && typeof R.norm === 'function');
{
    const full = { op: 'add_fcim', subId: 'SF-1', totalLoss: 'Total loss of wheel braking', partialLoss: { na: true, rationale: 'The function has no partial state: it either works or it does not.' }, malfunction: 'Uncommanded wheel braking' };
    check('[A1] a row with a condition or {"na": true, "rationale"} in every cell may be written', R.missing(full) === '', R.missing(full));
    const noWhy = Object.assign({}, full, { partialLoss: { na: true } });
    check('[A2] N/A with no rationale is refused, and the words say which cell', /marked not applicable with no reason for partial loss/.test(R.missing(noWhy)), R.missing(noWhy));
    const blank = Object.assign({}, full, { partialLoss: '' });
    check('[A3] an empty cell is refused, never taken as N/A (the 26 Oct no-empty-rows rule holds)', /an FCIM row with no failure condition and no reason it does not apply for partial loss/.test(R.missing(blank)), R.missing(blank));
    const omitted = { op: 'add_fcim', subId: 'SF-1', totalLoss: 'Total loss of wheel braking' };
    check('[A4] omitted cells are empty cells: refused, both named', /for partial loss and malfunction/.test(R.missing(omitted)), R.missing(omitted));
    const allEmpty = { op: 'add_fcim', subId: 'SF-025', awareness: '', totalLoss: '', partialLoss: '', malfunction: '', partials: [''], malfunctions: [] };
    check('[A5] the fully empty row of the live Aeolus run is still refused', /an FCIM row with no failure condition/.test(R.missing(allEmpty)), R.missing(allEmpty));
    const txt = { op: 'add_fcim', subId: 'SF-1', totalLoss: 'Total loss of wheel braking', partialLoss: 'N/A: braking is applied fully or not at all', malfunction: 'not applicable - no erroneous mode exists' };
    check('[A6] "N/A: <reason>" text is read as N/A with that reason', R.missing(txt) === '' && R.norm(Object.assign({}, txt)).partialLossNa === 'braking is applied fully or not at all' && R.norm(Object.assign({}, txt)).malfunctionNa === 'no erroneous mode exists', JSON.stringify(R.norm(Object.assign({}, txt))));
    check('[A7] bare "N/A" text is an N/A with no reason: refused', /no reason for partial loss/.test(R.missing(Object.assign({}, full, { partialLoss: 'N/A' }))));
    check('[A8] a condition that merely starts with "Na" stays a condition ("Navigation data loss")', R.cellIn('Navigation data loss').text === 'Navigation data loss' && R.cellIn('NA').naNoWhy === true);
    const n = R.norm(Object.assign({}, full));
    check('[A9] one shape after reading: text cells as text, the N/A cell empty with its reason beside it', n.totalLoss === 'Total loss of wheel braking' && n.partialLoss === '' && n.partialLossNa === full.partialLoss.rationale && !('partialLossNa' in R.norm({ partialLoss: 'Partial loss of braking' })), JSON.stringify(n));
    const arr = { op: 'add_fcim', subId: 'SF-2', totalLoss: 'Total loss of yaw control', partials: [{ na: true, rationale: 'One actuator: no partial state' }], malfunctions: ['Erroneous yaw response', 'Uncommanded yaw'] };
    check('[A10] arrays: an N/A entry in partials[] is the cell\'s reason; malfunctions[] stay conditions', R.missing(arr) === '' && R.norm(Object.assign({}, arr, { partials: arr.partials.slice(), malfunctions: arr.malfunctions.slice() })).partialLossNa === 'One actuator: no partial state', R.missing(arr));
    const both = R.norm({ partialLoss: { na: true, rationale: 'x' }, partials: ['Partial loss of yaw control'] });
    check('[A11] a cell holding a condition is never also N/A (the condition stands)', !both.partialLossNa && both.partials[0] === 'Partial loss of yaw control');
    const stored = { tlId: 'SF-1-TL', tlDesc: 'Total loss of braking', plId: '', plDesc: '', plNa: 'No partial state', mId: 'SF-1-M', mDesc: 'Uncommanded braking' };
    check('[A12] a stored row (an AI edit of an existing row) reads its N/A cells too', R.rowMissing('fcim', stored) === '' && /partial loss/.test(R.rowMissing('fcim', Object.assign({}, stored, { plNa: '' }))));
}
{
    const a = ai.indexOf("        actions.forEach(function (_x) { if (_x && _x.op === 'add_fcim') _fcimNormAction(_x); });"), b = ai.indexOf('        const parsed = { reply: _replies.join', a);
    check('[A13] extracted the batch reply filter', a > 0 && b > a);
    const c = { console: { info() {} }, String, Object, Array, JSON }; vm.createContext(c);
    c.actions = [
        { op: 'add_fcim', subId: 'SF-1', totalLoss: 'Total loss of braking', partialLoss: { na: true, rationale: 'No partial state' }, malfunction: 'Uncommanded braking' },
        { op: 'add_fcim', subId: 'SF-2', totalLoss: 'Total loss of steering', partialLoss: '', malfunction: 'Erroneous steering' },
        { op: 'add_fcim', subId: 'SF-3', totalLoss: 'Total loss of lighting', partialLoss: { na: true }, malfunction: { na: true, rationale: 'Lights are on or off' } }];
    try { vm.runInContext('function _toast() {}\n' + RULE + '\n' + ai.slice(a, b) + '\nthis.n = _noCond; this.words = _emptyWords;', c); } catch (e) { check('[A13] the filter runs', false, e.message); }
    check('[A14] the panel gets the N/A row (normalized), not the blank-cell row nor the reasonless N/A row', c.n === 2 && c.actions.length === 1 && c.actions[0].subId === 'SF-1' && c.actions[0].partialLossNa === 'No partial state' && c.actions[0].partialLoss === '', JSON.stringify(c.actions));
    check('[A15] and says why the two were left out', /2 FCIM rows with no failure condition or reason it does not apply in every cell/.test(c.words || ''), c.words);
}
{
    const line = (ai.match(/\n(\s*const _emptyTurn = function \(a\) \{[^\n]*)/) || [])[1] || '';
    const c = { String, Object, Array, JSON }; vm.createContext(c);
    try { vm.runInContext('function _toast() {}\n' + RULE + '\n' + line + '\nthis.emptyTurn = _emptyTurn;', c); } catch (e) { check('[A16] the empty-turn test compiles', false, e.message); }
    const blankOnly = { parsed: { actions: [{ op: 'add_fcim', subId: 'SF-2', totalLoss: 'Total loss of steering' }] } };
    const good = { parsed: { actions: [{ op: 'add_fcim', subId: 'SF-1', totalLoss: 'Total loss of braking', partialLoss: { na: true, rationale: 'No partial state' }, malfunction: 'Uncommanded braking' }] } };
    check('[A16] a drafting turn whose every row leaves a cell empty is asked again, like an empty turn', typeof c.emptyTurn === 'function' && c.emptyTurn(blankOnly) === true && c.emptyTurn(good) === false && c.emptyTurn({ parsed: { actions: [] } }) === true);
}
// the writer (_applyFcimSuggestion) with the real _pushExtractedFCs
const MISC = S('misc_fn_modules.js');
const miscFn = name => cut(MISC, 'function ' + name + '(', '\n}\n', true);
const W = { console: { warn() {}, log() {}, info() {} }, String, Object, Array, JSON, Set, Map, Math, Date, Number, RegExp, toasts: [],
    acFcimData: [], acExtractedFCs: [], acFhaData: [], renders: 0 };
vm.createContext(W);
{
    const APPLY = cut(ai, '    function _fcimFcId(row, field, scanFcim, scanFha, ctxExtra) {', '\n    // =========================================================================\n    // 26 Oct 2026: DRAFT ONE FCIM CELL');
    const CELL = cut(ai, '    const _FCIM_SLOT = {', '\n    // =========================================================================\n    // FEATURE #50');
    const PARSE = cut(ai, '    function _parseItems(text, key) {', '        return items;\n    }', true);
    check('[A17] extracted the writer, the one-cell drafter and the reply reader', !!APPLY && !!CELL && !!PARSE);
    try {
        vm.runInContext(['var systemsData = [];',
            'function _toast(m) { toasts.push(m); } function _skillStampFor() { return "fcim.draft@v5#test"; } var _n = 0; function newRowId() { return "r" + (++_n); }',
            'function renderACFCIM() { renders++; } function scheduleAutosave() {} function _aiConsistencyAutoCheck() {} function _esc(s) { return String(s); }',
            'function rebuildExtractedFCsForAllSystems() { acExtractedFCs.length = 0; _pushExtractedFCs(acFcimData, acExtractedFCs); }',
            miscFn('_fcimIsNaCell'), miscFn('_pushExtractedFCs'), RULE, PARSE, APPLY, CELL,
            'this.apply = _applyFcimSuggestion; this.cellFromReply = _fcimCellFromReply; this.applyCell = _applyFcimCellDraft; this.cellMsg = _fcimCellDraftMsg; this.draftCell = draftFcimCell; this.locate = _fcimLocate;'].join('\n'), W);
    } catch (e) { check('[A17] the writer runs', false, e.message); }
    const ok = W.apply({ subId: 'SF-1', awareness: 'Aware', totalLoss: 'Total loss of wheel braking', partialLoss: { na: true, rationale: 'The function has no partial state: it either works or it does not.' }, malfunction: 'Uncommanded wheel braking', _model: 'm' });
    const row = W.acFcimData[0] || {};
    check('[A18] the N/A cell is written as its reason, by ANEM, with no FC ID and no text', ok === true && row.plNa === 'The function has no partial state: it either works or it does not.' && row.plNaBy === 'ai' && !row.plId && !row.plDesc && !!row.tlId && !!row.mId, JSON.stringify(row));
    check('[A19] it is not an extracted failure condition; the two real ones are', W.acExtractedFCs.length === 2 && W.acExtractedFCs.every(e => e.id === row.tlId || e.id === row.mId), JSON.stringify(W.acExtractedFCs));
    const before = W.acFcimData.length;
    const refused = W.apply({ subId: 'SF-2', awareness: 'Aware', totalLoss: 'Total loss of steering', partialLoss: '', malfunction: 'Erroneous steering' });
    check('[A20] a suggestion with an empty cell is not written, and says so', refused === false && W.acFcimData.length === before && /Not written: an FCIM row with no failure condition and no reason it does not apply for partial loss/.test(W.toasts.join('|')), W.toasts.join('|'));
}

// ===================================================================================================================
console.log('\n[P] the prompt and the skill ask for N/A with its rationale');
{
    const SP = cut(ai, '    function _fcimSystemPrompt(certBasis, systemName) {', '\n    // 4 Sep 2026 (Waqas): "the MAC drafter');
    const c = { String, Array }; vm.createContext(c);
    let txt = '';
    try { vm.runInContext('function _standardsPreamble() { return "PRE"; } var _ABSTAIN_RULE = "ABSTAIN";\n' + SP + '\nthis.t = _fcimSystemPrompt("Part 25", "");', c); txt = c.t; } catch (e) { check('[P1] the FCIM system prompt builds', false, e.message); }
    check('[P1] the FCIM prompt asks for every level, and N/A as {"na": true, "rationale": ...}', /Fill ALL THREE levels on every row/.test(txt) && /\{"na": true, "rationale": "<one short sentence, grounded in the function/.test(txt) && /An empty level, or an N\/A with no rationale, is refused/.test(txt));
    check('[P2] it no longer says to omit the levels that do not apply', !/omit any that do not apply/.test(txt));
    check('[P3] the JSON shape names the N/A form', /where each of totalLoss \/ partialLoss \/ malfunction is the condition text, or \{"na": true, "rationale": "<why it does not apply>"\}/.test(txt));
    check('[P4] cell N/A is told apart from the awareness N/A', /different thing from the "N\/A" awareness value/.test(txt));
    const specSrc = cut(ai, '    const _SPEC_FCIM = [', "].join('\\n');", true);
    let spec = '';
    try { const s = { }; vm.createContext(s); vm.runInContext(specSrc.replace('const _SPEC_FCIM', 'this._S'), s); spec = s._S; } catch (e) { check('[P5] _SPEC_FCIM evaluates', false, e.message); }
    const sk = { window: {}, console: { info() {} } }; vm.createContext(sk); vm.runInContext(S('ai_skills.js'), sk);
    const body = sk.window.SLABSkills && sk.window.SLABSkills.skills['fcim.draft'];
    check('[P5] the skill (unified engine) carries EVERY CELL IS ANSWERED, byte-identical to the inline copy, version 5 or later', !!body && /EVERY CELL IS ANSWERED \(Waqas ruling, 26 Oct 2026\)/.test(body.body) && body.body === spec && body.version >= 5, body && body.version);
    check('[P6] the batch directive and the chat catalog ask for it too', /Fill every cell: a failure condition, or \{"na": true, "rationale"/.test(ai) && /EVERY CELL IS ANSWERED: totalLoss \/ partialLoss \/ malfunction each hold a condition, or \{"na": true/.test(ai));
    const added = (spec.match(/EVERY CELL IS ANSWERED[^\n]*/) || [''])[0] + ' ' + (txt.match(/Fill ALL THREE levels[^\n]*/) || [''])[0];
    check('[P7] the new instructions carry no em dash', added.length > 40 && added.indexOf('—') < 0);
}

// ===================================================================================================================
console.log('\n[E] the engine: N/A stops at the FCIM');
const G = globalThis;
G.window = G; G.SLEnv = { get: n => G[n] };
G.flightPhasesData = [{ phase: 'Taxi', duration: 10, durationUnit: 'min' }, { phase: 'Cruise', duration: 60, durationUnit: 'min' }, { phase: 'Landing', duration: 3, durationUnit: 'min' }];
G.acFunctionsData = [{ subId: 'F1', subName: 'Control pitch', subDef: 'Command aircraft pitch' }, { subId: 'F2', subName: 'Decelerate on ground', subDef: 'Stop the aircraft' }, { subId: 'F3', subName: 'Legacy function' }];
// F1: TL condition, PL not applicable, M condition. F2: TL condition, PL blank (not assessed), M not applicable. F3: an old row.
G.acFcimData = [
    { internalId: 501, subId: 'F1', awareness: 'Aware', tlId: 'F1-TL', tlDesc: 'Total loss of pitch control', plId: '', plDesc: '', plNa: 'Pitch authority is a single surface: it works or it does not.', plNaBy: 'ai', mId: 'F1-M', mDesc: 'Erroneous pitch response' },
    { internalId: 502, subId: 'F2', awareness: 'Aware', tlId: 'F2-TL', tlDesc: 'Total loss of deceleration', plId: '', plDesc: '', mId: '', mDesc: '', mNa: 'Braking is on or off; there is no erroneous mode.', mNaBy: 'engineer' },
    { internalId: 503, subId: 'F3', awareness: 'Both', tlId: 'F3-TL', tlDesc: 'Total loss of legacy function', plId: 'F3-PL', plDesc: 'Partial loss of legacy function', mId: '', mDesc: '' }];
const fha = (id, fcId, sub, sev, ph, extra) => Object.assign({ internalId: id, subId: sub, fcId: fcId, fcDesc: fcId + ' text', severity: sev, phases: ph }, extra || {});
G.acFhaData = [fha(601, 'F1-TL', 'F1', 'Catastrophic', 'Cruise'), fha(602, 'F1-M', 'F1', 'Major', 'Cruise'), fha(603, 'F1-M', 'F1', 'Hazardous', 'Landing'), fha(604, 'F2-TL', 'F2', 'Catastrophic', 'Landing')];
G.acReqData = []; G.acAssumptionsData = []; G.acExtractedFCs = [];
G.systemsData = [];
G.resourcesData = []; G.itemsData = []; G.routingData = []; G.cmaData = []; G.zsaData = []; G.praData = []; G.fmeaData = [];
G.ftaPages = []; G.ftaConfig = {}; G.internalIdCounter = 9000;
G.projectConfig = { regulation: 'Part 25', macModels: [{ id: 'r1', subId: 'F1', clauses: [{ min: 1, of: ['sA'] }] }], interdep: { cells: {}, cra: {} }, coffe: { verdicts: {} } };
G._CKPT_SEV_RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1, 'No Safety Effect': 1 };
G._COFFE_STATES = ['total loss', 'malfunction']; G._coffeSelectedFc = null; G._idpSelectedFc = null;
G.commitSaveChanges = () => {}; G.scheduleAutosave = () => { G.__saves = (G.__saves || 0) + 1; }; G.__toasts = []; G.showToast = (m) => { G.__toasts.push(m); };
G._autosaveSuspended = false; G._autosaveLastWrite = 0; G._dirtySinceSave = false; G._autosaveDiskAvailable = false; G._autosaveLastDiskWrite = 0;
G.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
G.sys = () => null; G.renderSysFHA = () => {}; G.renderFhaPhaseGrid = () => {}; G._gtvSystemsForFc = () => [];
G.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, addEventListener() {} }), addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, body: { appendChild() {} }, documentElement: { classList: { add() {}, remove() {} } } };
let loaded = true;
try {
    (0, eval)(['safety_targets.js', 'fn_resolver.js', 'helpers_modules.js', 'misc_fn_modules.js', 'support_modules.js', 'assurance_modules.js', 'fcim_na.js', 'fc_auto_trees.js'].map(S).join('\n;\n') + '\n;globalThis.__TR = Traceability; globalThis.__AR = AutoReq;');
} catch (e) { loaded = false; check('[E0] the engine files load', false, e.stack); }
const NA = G.SLFcimNa, AutoReq = G.__AR, Traceability = G.__TR, FT = G.SLFcTrees;
// the loaded files declare the app's own toast, autosave and renderers; this harness has no page for them
G.showToast = (m) => { G.__toasts.push(m); }; G.scheduleAutosave = () => { G.__saves = (G.__saves || 0) + 1; };
['renderACFHA', 'renderSysFHA', 'renderACFCIM', 'renderSysFCIM'].forEach(n => { G[n] = () => {}; });
check('[E0] loaded: SLFcimNa, SLFcTrees, AutoReq, Traceability, _pushExtractedFCs', loaded && !!NA && !!FT && !!AutoReq && typeof G._pushExtractedFCs === 'function');
if (!loaded || !NA) { console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); }
G.rebuildExtractedFCsForAllSystems();
const ids = () => G.acExtractedFCs.map(e => e.id).sort().join(',');
check('[E1] the extracted failure conditions: the conditions only; no N/A cell (and the old row as before)', ids() === 'F1-M,F1-TL,F2-TL,F3-PL,F3-TL', ids());
G.acFcimData[0].plId = 'F1-PL';   // a stale FC ID left on an N/A cell
G.rebuildExtractedFCsForAllSystems();
check('[E2] THE STOP: an N/A cell is no failure condition even with an FC ID left on it (_pushExtractedFCs)', ids() === 'F1-M,F1-TL,F2-TL,F3-PL,F3-TL', ids());
G.acFcimData[0].plId = '';
check('[E3] the cell model reads three states, blank never read as N/A (rule 24)', NA.state(G.acFcimData[0], 'pl') === 'na' && NA.state(G.acFcimData[1], 'pl') === 'blank' && NA.state(G.acFcimData[1], 'm') === 'na' && NA.state(G.acFcimData[2], 'm') === 'blank' && NA.state(G.acFcimData[0], 'tl') === 'condition');
{
    const a = NA.audit();
    check('[E4] Thread Integrity (INV-68): the blank cells are flagged as not assessed yet', a.blank.length === 2 && a.blank.some(t => /F2 \(Aware\) partial loss: not assessed yet/.test(t)) && a.blank.some(t => /F3 \(Both\) malfunction: not assessed yet/.test(t)), JSON.stringify(a.blank));
    check('[E5] and the N/A cells are not flagged as missing (2 counted as not applicable)', a.na === 2 && !a.blank.concat(a.naNoReason, a.stillClassified).some(t => /F1 \(Aware\) partial loss|F2 \(Aware\) malfunction/.test(t)), JSON.stringify(a));
    const r = NA.INV.run();
    check('[E6] INV-68 is advisory and reports exactly those', NA.INV.id === 'INV-68' && NA.INV.sev === 'advisory' && r.checked === 9 && r.fails.length === 2 && r.blank === 2 && r.notApplicable === 2, JSON.stringify(r));
    G.acFcimData.push({ internalId: 504, subId: 'F9', tlId: '', tlDesc: 'N/A', plId: '', plDesc: 'Partial loss of x', mId: '', mDesc: 'Erroneous x' });
    check('[E7] "N/A" typed as a condition with no reason is flagged', NA.audit().naNoReason.length === 1);
    G.acFcimData.pop();
}
// downstream before marking: F1-M has two FHA rows (Major, Hazardous); its tree, its requirement, its thread entries
G.ftaPages.length = 0;
const sw1 = FT.sweep({ quiet: true, noAsk: true });
const treeFor = fcId => G.ftaPages.find(p => p.autoFcTree && p.autoFcTree.key === 'fc:' + fcId);
check('[E8] before: F1-M is a failure condition with a tree (fixture)', FT.groups('ac').some(g => g.fcId === 'F1-M') && !!treeFor('F1-M'), JSON.stringify(sw1));
const candStr = () => { const m = AutoReq.generate({ fha: true, dalgebra: true }, 'ac'); return JSON.stringify(m.isNew.concat(m.isUpdated.map(u => u.next), m.unchanged.map(u => u.next))); };
check('[E9] before: AutoReq has requirements built on F1-M (fixture)', /F1-M/.test(candStr()) || /\b60[23]\b/.test(candStr()));
const trBefore = Traceability.listAllArtifacts().filter(x => x.kind === 'acFha' && /F1-M/.test(x.label)).length;
check('[E10] before: F1-M is offered in the artifact pickers (fixture)', trBefore >= 1, trBefore);
// someone built on F1-M's tree
const t1m = treeFor('F1-M'); if (t1m) t1m.root.children.push({ id: 9999, type: 'basic', name: 'Elevator actuator jams', children: [] });
// the engineer marks F1's malfunction not applicable
const row1 = G.acFcimData[0];
const mk = NA.mark(row1, 'm', 'Pitch is a single command path: an erroneous command is the total loss here.', { by: 'engineer', fha: G.acFhaData });
check('[E11] mark: the cell is N/A, the condition it held is kept beside it, its 2 FHA rows are returned for the person to decide', mk.ok && NA.state(row1, 'm') === 'na' && row1.mNaPrevId === 'F1-M' && row1.mNaPrevDesc === 'Erroneous pitch response' && !row1.mId && !row1.mDesc && mk.downstream.length === 2 && row1.mNaBy === 'engineer', JSON.stringify(mk));
G.rebuildExtractedFCsForAllSystems();
check('[E12] F1-M is no longer an extracted failure condition (no new AFHA row can be built on it)', ids() === 'F1-TL,F2-TL,F3-PL,F3-TL', ids());
check('[E13] until the person decides, Thread Integrity lists the FHA rows still classifying it', NA.audit().stillClassified.some(t => /F1 \(Aware\) malfunction is marked not applicable, but 2 FHA rows still classify F1-M; set them aside or keep them/.test(t)), JSON.stringify(NA.audit().stillClassified));
// the person sets them aside
const parked = NA.park(row1, 'm', G.acFhaData);
G.SLDataChange = undefined;
check('[E14] set aside: both rows leave the FHA and are kept with the cell (nothing deleted)', parked === 2 && G.acFhaData.length === 2 && row1.mNaParked.length === 2 && row1.mNaParked.every(p => p.row.fcId === 'F1-M'), JSON.stringify(G.acFhaData.map(r => r.internalId)));
check('[E15] no FHA group, so no tree is needed for F1-M (fc_auto_trees)', !FT.groups('ac').some(g => g.fcId === 'F1-M'));
let asked = '';
G.slChoose = async (msg) => { asked = msg; return null; };
const sw2 = FT.sweep({ quiet: true });
await new Promise(r => setTimeout(r, 20));
check('[E16] its tree has work in it: it is asked about, in the words of the N/A, and kept until then (not deleted)', sw2.ask.indexOf(t1m && t1m.id) >= 0 && /its failure condition was marked not applicable in the FCIM/.test(asked) && G.ftaPages.indexOf(t1m) >= 0, asked);
check('[E17] no new tree for an N/A cell, on any sweep', !sw2.made.some(id => /F1-M/.test(id)) && !G.ftaPages.some(p => p !== t1m && p.autoFcTree && p.autoFcTree.key === 'fc:F1-M'));
check('[E18] AutoReq: no DAL and no requirement built on F1-M any more', !/F1-M/.test(candStr()) && !/"60[23]"|:60[23]\b/.test(candStr()));
check('[E19] pickers and counts: F1-M is not offered as a failure condition (Traceability)', Traceability.listAllArtifacts().filter(x => x.kind === 'acFha' && /F1-M/.test(x.label)).length === 0);
check('[E20] the audit is clean of it once set aside', !NA.audit().stillClassified.length);
// the lane-tree generator (CoFFE / MAC lanes)
let LT = null;
try { const m = { exports: {} }; new Function('module', 'window', S('lane_trees.js'))(m, G); LT = m.exports; } catch (e) { check('[E21] lane_trees loads', false, e.message); }
if (LT) {
    const b = LT.bindLane(G.projectConfig.macModels[0], 'mal'), bp = LT.bindLane(G.projectConfig.macModels[0], 'pl'), bt = LT.bindLane(G.projectConfig.macModels[0], 'tl');
    check('[E21] lane trees: the N/A malfunction and partial-loss lanes bind no condition, say why, and are not counted as gaps', !b.fc && b.na === true && /marks the malfunction of F1 not applicable/.test(b.finding) && !bp.fc && bp.na === true && !!bt.fc && bt.fc.fcId === 'F1-TL', JSON.stringify([b, bp]));
}
// overrule: the condition and its FHA rows come back
const ov = NA.overrule(row1, 'm', G.acFhaData);
G.rebuildExtractedFCsForAllSystems();
check('[D1] overrule: the condition the cell held comes back with its FHA rows, in place', ov.ok && ov.restored && ov.unparked === 2 && row1.mId === 'F1-M' && row1.mDesc === 'Erroneous pitch response' && !('mNa' in row1) && !('mNaParked' in row1) && G.acFhaData.map(r => r.internalId).join(',') === '601,602,603,604' && ids() === 'F1-M,F1-TL,F2-TL,F3-PL,F3-TL', JSON.stringify({ ov, ids: ids(), fha: G.acFhaData.map(r => r.internalId) }));
const ov2 = NA.overrule(G.acFcimData[1], 'm', G.acFhaData);
check('[D2] overrule of a cell that never held a condition: it opens blank, for the engineer or ANEM', ov2.ok && !ov2.restored && NA.state(G.acFcimData[1], 'm') === 'blank');
check('[D3] the engineer\'s own N/A needs a reason: refused without one', NA.mark(G.acFcimData[1], 'm', '   ', { fha: G.acFhaData }).ok === false && NA.state(G.acFcimData[1], 'm') === 'blank');
// keep: the rows stay as failure conditions, listed until decided
NA.mark(row1, 'm', 'reason', { fha: G.acFhaData }); NA.keep(row1, 'm');
check('[D4] keep: the rows stay, Thread Integrity lists them as kept by choice', G.acFhaData.length === 4 && NA.audit().stillClassified.some(t => /\(kept by choice\)/.test(t)));
NA.overrule(row1, 'm', G.acFhaData);
// a condition typed into an N/A cell by another path overrules it: settle
NA.mark(row1, 'm', 'reason', { fha: G.acFhaData }); NA.park(row1, 'm', G.acFhaData);
row1.mDesc = 'Uncommanded pitch motion';
const st = NA.settle(row1, G.acFhaData);
check('[D5] a condition written into an N/A cell stands: the rows come back, the cell takes its FC ID back, the reason goes', st.join() === 'm' && row1.mId === 'F1-M' && row1.mDesc === 'Uncommanded pitch motion' && !('mNa' in row1) && G.acFhaData.length === 4, JSON.stringify(row1));
// the interactive paths, through the change collection
{
    const labels = []; G.SLChangeAck = { batch: (label, fn) => { labels.push(label); return Promise.resolve(fn()); } };
    const answers = ['', 'There is no erroneous braking mode on this aircraft.'];
    G.slPrompt = async () => answers.shift();
    G.slChoose = async () => 'park';
    G.__toasts.length = 0;
    const res = await NA.markInteractive(502, 'm');
    check('[D6] mark from the page: a blank reason is refused and asked again; the cell is marked; it is one collected change', res && res.ok && G.acFcimData[1].mNa === 'There is no erroneous braking mode on this aircraft.' && /A reason is needed/.test(G.__toasts.join('|')) && labels.length === 1 && /F2 malfunction marked not applicable/.test(labels[0]), JSON.stringify({ res, labels, t: G.__toasts }));
    G.slPrompt = async () => null;
    const res2 = await NA.markInteractive(503, 'tl');
    check('[D7] canceling the reason changes nothing', res2.canceled === true && NA.state(G.acFcimData[2], 'tl') === 'condition' && labels.length === 1);
    G.slPrompt = async () => 'Not applicable for this test.';
    let askedMsg = ''; G.slChoose = async (m) => { askedMsg = m; return 'park'; };
    const res4 = await NA.markInteractive(501, 'tl');   // F1-TL has one FHA row: asked, set aside
    check('[D8] marking a cell that has FHA rows asks what to do with them, naming them', /Total loss of F1 is marked not applicable\. 1 FHA row classifies the failure condition it held \(F1-TL\)/.test(askedMsg), askedMsg);
    check('[D9] ...and in one change: "set aside" takes the FHA row of F1-TL out, kept with the cell', res4.ok && G.acFcimData[0].tlNaParked && G.acFcimData[0].tlNaParked.length === 1 && !G.acFhaData.some(r => r.fcId === 'F1-TL') && labels.length === 2, JSON.stringify(labels));
    const res5 = await NA.overruleInteractive(501, 'tl');
    check('[D10] overrule from the page: one collected change, the row is back', res5.ok && G.acFhaData.some(r => r.fcId === 'F1-TL') && labels.length === 3 && /not applicable withdrawn/.test(labels[2]));
    let drafted = null; G.slLoadAI = () => Promise.resolve(); G.SafetyLabAI = { draftFcimCell: (iid, s) => { drafted = [iid, s]; return Promise.resolve({ ok: true }); } };
    await NA.draftInteractive(502, 'pl');
    check('[D11] "draft with ANEM" loads the assistant and asks it for that one cell', drafted && drafted[0] === 502 && drafted[1] === 'pl');
}
// the page: the three cell states rendered (rule 11: render and inspect the markup)
{
    const r = { internalId: 777, subId: 'F7', tlId: 'F7-TL', tlDesc: 'Total loss of <x> & "y"', plId: '', plDesc: '', plNa: 'It has "no" partial <state> & works', plNaBy: 'ai', mId: '', mDesc: '' };
    G.acFcimData.push(r);
    const na = NA.cellHtml(r, 'pl', ''), cond = NA.cellHtml(r, 'tl', ''), blank = NA.cellHtml(r, 'm', '');
    check('[U1] an N/A cell shows "N/A" and its reason (inline and on hover), who marked it, and Overrule', />N\/A<\/span>/.test(na) && /It has &quot;no&quot; partial &lt;state&gt; &amp; works/.test(na) && /Marked by ANEM/.test(na) && /data-fcim-na="overrule" data-iid="777" data-slot="pl"/.test(na) && /title="Partial loss does not apply: It has &quot;no&quot;/.test(na), na);
    check('[U2] a condition cell shows it as before, escaped, with "not applicable"', /<strong>F7-TL<\/strong><br>Total loss of &lt;x&gt; &amp; &quot;y&quot;/.test(cond) && /data-fcim-na="mark"/.test(cond) && !/N\/A<\/span>/.test(cond), cond);
    check('[U3] a blank cell is shown blank (no "N/A", no "None"), with "draft with ANEM" and "not applicable"', !/N\/A|None/.test(blank.replace(/data-fcim-na="[^"]*"/g, '')) && /data-fcim-na="draft"/.test(blank) && /data-fcim-na="mark"/.test(blank), blank);
    const quotes = s => (s.match(/"/g) || []).length % 2 === 0;
    check('[U4] the markup is well formed: balanced quotes and button tags', [na, cond, blank].every(h => quotes(h) && (h.match(/<button/g) || []).length === (h.match(/<\/button>/g) || []).length));
    const rc = G._fcimRenderCells(r, '<b>act</b>');
    check('[U5] the FCIM table row renders the three cells through it', /data-fcim-na-cell="pl"/.test(rc) && /F7-TL/.test(rc) && (rc.match(/<td>/g) || []).length >= 6, rc.slice(0, 300));
    G.acFcimData.pop();
}
// exports and imports
{
    const r = { subId: 'F1', awareness: 'Aware', tlId: 'F1-TL', tlDesc: 'Total loss of pitch control', plId: '', plDesc: '', plNa: 'No partial state.', mId: '', mDesc: '' };
    const ex = G._fcimExportRow(r);
    check('[X1] CSV / report table: an N/A cell exports as "N/A" and "N/A: <reason>"; a blank stays blank', JSON.stringify(ex) === JSON.stringify(['F1', 'Aware', 'F1-TL', 'Total loss of pitch control', 'N/A', 'N/A: No partial state.', '', '']), JSON.stringify(ex));
    const back = G._fcimImportCells({ subId: 'F1', tlId: 'F1-TL', tlDesc: 'Total loss of pitch control', plId: 'N/A', plDesc: 'N/A: No partial state.', mId: '', mDesc: 'N/A' });
    check('[X2] reading it back: the N/A cell is N/A with its reason; "N/A" with no reason is a blank (not assessed)', back.plNa === 'No partial state.' && back.plId === '' && back.plDesc === '' && NA.state(back, 'm') === 'blank' && back.tlId === 'F1-TL', JSON.stringify(back));
    check('[X3] a condition that starts with "Na" is not mistaken for N/A on import', G._fcimImportCells({ tlId: 'X', tlDesc: 'Navigation loss' }).tlDesc === 'Navigation loss');
    const dops = S('data_ops_modules.js');
    check('[X4] the CSV export, the PDF/report tables and the CSV import (aircraft and system) all go through it', (dops.match(/_fcimExportRow : \(r => \[/g) || []).length === 4 && (dops.match(/_fcimImportCells : \(x => x\)\)\(/g) || []).length === 2);
    const imp = S('importers.js');
    check('[X5] the spreadsheet importer reads "N/A: <reason>" too, and extracts only conditions', /if \(typeof _fcimImportCells === 'function'\) _fcimImportCells\(rec\);/.test(imp) && /if \(rec\.plId\) acExtractedFCs\.push/.test(imp));
    let fcimFcs = null;
    try { const sm = S('sysml_model.js'); const src = cut(sm, '    function fcimFcs(rows) {', '        return out;\n    }', true); const c = {}; vm.createContext(c); vm.runInContext('function arr(v) { return Array.isArray(v) ? v : []; }\n' + src + '\nthis.f = fcimFcs;', c); fcimFcs = c.f; } catch (e) { check('[X6] sysml fcimFcs runs', false, e.message); }
    if (fcimFcs) { const out = fcimFcs([{ subId: 'F1', tlId: 'F1-TL', tlDesc: 'x', plId: 'F1-PL', plDesc: '', plNa: 'No partial state.', mId: 'F1-M', mDesc: 'y' }]).map(e => e.id).join(); check('[X6] SysML export: an N/A cell is not exported as a failure condition (even with a stale FC ID)', out === 'F1-TL,F1-M', out); }
}
// INV-31 (hard): an AI row whose cells are all N/A with reasons is not an empty row
{
    const inv = S('invariants.js');
    const line = (inv.match(/\n\s*(const _has = v => [^\n]*)/) || [])[1] + '\n' + (inv.match(/\n\s*(const fcimEmpty = c => [^\n]*)/) || [])[1];
    const c = {}; vm.createContext(c);
    try { vm.runInContext(line + '\nthis.e = fcimEmpty;', c); } catch (e) { check('[I1] INV-31 empty test runs', false, e.message); }
    check('[I1] INV-31: an AI row answered N/A in every cell is not "empty"; a truly empty one still is', c.e && c.e({ tlNa: 'a', plNa: 'b', mNa: 'c' }) === false && c.e({ tlDesc: '', plDesc: '' }) === true);
}

// ===================================================================================================================
console.log('\n[D] draft one cell with ANEM');
{
    const f2 = { internalId: 802, subId: 'F2', awareness: 'Aware', tlId: 'F2-TL', tlDesc: 'Total loss of deceleration', plId: '', plDesc: '', mId: '', mDesc: '', mNa: 'No erroneous mode.' };
    W.acFcimData.length = 0; W.acFcimData.push(f2); W.acFunctionsData = [{ subId: 'F2', subName: 'Decelerate on ground', subDef: 'Stop the aircraft' }];
    W.acExtractedFCs.length = 0;
    const msg = W.cellMsg(W.locate(802), 'pl', 'Part 25');
    check('[D12] the one-cell request names the cell, the function and the row as it stands', /Draft ONE cell only: the PARTIAL LOSS cell/.test(msg) && /name=Decelerate on ground \| definition=Stop the aircraft/.test(msg) && /malfunction not applicable: No erroneous mode\./.test(msg) && /\{"na": true, "rationale"/.test(msg), msg);
    const cond = W.cellFromReply('{ "rows": [ { "subId": "F2", "partialLoss": "Partial loss of deceleration" } ] }', 'F2', 'pl');
    const na = W.cellFromReply('{ "rows": [ { "subId": "F2", "partialLoss": { "na": true, "rationale": "Brakes act as one." } } ] }', 'F2', 'pl');
    const bad = W.cellFromReply('{ "rows": [ { "subId": "F2", "partialLoss": { "na": true } } ] }', 'F2', 'pl');
    const empty = W.cellFromReply('{ "rows": [ { "subId": "F2", "partialLoss": "" } ] }', 'F2', 'pl');
    check('[D13] the reply: a condition, or N/A with its reason; N/A with none and an empty cell are refused', cond.texts && cond.texts[0] === 'Partial loss of deceleration' && na.na === 'Brakes act as one.' && /no reason/.test(bad.missing) && /came back empty/.test(empty.missing), JSON.stringify([cond, na, bad, empty]));
    // the whole drafter, with the provider and the review panel stubbed
    let panel = null;
    vm.runInContext('var Provider = { available: function () { return true; }, complete: function () { return Promise.resolve({ text: \'{ "rows": [ { "subId": "F2", "partialLoss": "Partial loss of deceleration" } ] }\', model: "m1" }); }, notReadyMessage: function () { return ""; } }; var MODELS = { reason: "m1" }; function _certBasis() { return "Part 25"; } function _fcimSystemPrompt() { return "SYS"; } function _macRulesForSystemPrompt() { return ""; } function _makeReviewPanel(cfg) { this.__panel = cfg; }', W);
    const res = await W.draftCell(802, 'pl'); panel = W.__panel;
    check('[D14] draft: a review panel with the one cell; nothing written before Accept', res.ok && panel && panel.items.length === 1 && !f2.plDesc && /Partial loss of deceleration/.test(panel.cardHtml(panel.items[0])));
    const acc = panel.onAccept(panel.items[0]);
    check('[D15] accept: the cell holds the condition with an FC ID, and it becomes an extracted failure condition', acc === true && f2.plDesc === 'Partial loss of deceleration' && !!f2.plId && W.acExtractedFCs.some(e => e.id === f2.plId) && Array.isArray(f2.aiCellDrafts) && f2.aiCellDrafts[0].slot === 'pl', JSON.stringify(f2));
    const again = W.applyCell({ iid: 802, slot: 'pl', texts: ['Something else'] });
    check('[D16] a draft never overwrites a cell that is no longer open', again === false && f2.plDesc === 'Partial loss of deceleration');
    const notOpen = await W.draftCell(802, 'm');
    check('[D17] drafting is offered only on an open cell (an N/A cell is overruled first)', notOpen.ok === false && /not open: overrule its N\/A/.test(W.toasts.join('|')));
    f2.mNa = ''; const naAcc = W.applyCell({ iid: 802, slot: 'm', texts: [], na: 'Braking has no erroneous mode.' });
    check('[D18] accepting an N/A draft writes the reason, by ANEM, and no FC ID', naAcc === true && f2.mNa === 'Braking has no erroneous mode.' && f2.mNaBy === 'ai' && !f2.mId);
    check('[D19] the assistant exposes it to the page', /draftFcimCell: _captureGuard\('draftFcimCell', draftFcimCell\)/.test(ai));
}

// ===================================================================================================================
console.log('\n[F] the FHA drafters never bring an N/A cell back');
{
    const src = cut(ai, '    function _fhaNaClause(scope, funcs) {', '\n    // 5 Sep 2026 (lever 2)');
    const c = { String, Array, acFcimData: [{ subId: 'F1', tlDesc: 'x', plNa: 'No partial state.', plDesc: '' }, { subId: 'F2', mNa: 'n', mDesc: 'has text' }], systemsData: [] }; vm.createContext(c);
    try { vm.runInContext(src + '\nthis.f = _fhaNaClause;', c); } catch (e) { check('[F1] _fhaNaClause runs', false, e.message); }
    const t = c.f ? c.f({}, [{ subId: 'F1' }, { subId: 'F2' }]) : '';
    check('[F1] the per-function FHA path is told which cells are not applicable, and to draft nothing for them', /NOT APPLICABLE \(the FCIM marks these not applicable/.test(t) && /subId=F1 \| partial loss \| No partial state\./.test(t) && !/F2/.test(t), t);
    check('[F2] an FCIM with no condition at all is not "no FCIM": the per-function AFHA fallback stops', /if \(_fcimRowsNow\.length\) \{ _toast\('The FCIM identifies no failure conditions yet/.test(ai));
    check('[F3] the classic SFHA path appends it', /\+ _fhaNaClause\(scope, batch\)/.test(ai));
}

// ===================================================================================================================
console.log('\n[O] an old project behaves exactly as before');
{
    const D = require('./lib/demo_projects_all.js');
    const oldPush = (arr, out) => (arr || []).forEach(d => { if (!d) return; if (d.tlId) out.push(d.tlId); if (d.plId) out.push(d.plId); if (d.mId) out.push(d.mId); (d.combined || []).forEach(c => { if (c && c.cbId) out.push(c.cbId); }); (d.plExtra || []).forEach(e => { if (e && e.id) out.push(e.id); }); (d.mExtra || []).forEach(e => { if (e && e.id) out.push(e.id); }); });
    let projects = 0, same = 0, cells = 0, blank = 0, withFha = 0; const diffs = [];
    D.all().forEach(p => {
        if (p.error || !p.data) return; projects++;
        const scopes = [{ fcim: p.data.acFcimData || [], fha: p.data.acFhaData || [] }].concat((p.data.systemsData || []).map(s => ({ fcim: s.fcim || [], fha: s.fha || [] })));
        let ok = true;
        scopes.forEach(sc => {
            const a = [], b = []; oldPush(sc.fcim, a); G._pushExtractedFCs(sc.fcim, b);
            if (a.join('|') !== b.map(e => e.id).join('|')) { ok = false; diffs.push(p.key); }
            const fhaIds = new Set(sc.fha.map(r => String(r.fcId || '').trim()));
            sc.fcim.forEach(r => ['tl', 'pl', 'm'].forEach(s => { cells++; const st2 = NA.state(r, s); if (st2 === 'blank') blank++; if (st2 === 'condition' && fhaIds.has(String(r[s + 'Id'] || '').trim())) withFha++; }));
        });
        if (ok) same++;
    });
    check('[O1] every demo project: the extracted failure conditions are identical to the old algorithm (' + same + ' of ' + projects + ')', projects >= 6 && same === projects, diffs.join(','));
    console.log('        blast radius on the demo projects: ' + cells + ' FCIM cells, ' + blank + ' blank (INV-68 lists them as not assessed yet), ' + withFha + ' condition cells with FHA rows (marking one N/A asks about them), 0 N/A today');
    check('[O2] no demo project holds an N/A cell today (nothing changes until someone marks one)', cells > 0 && D.all().every(p => !p.data || JSON.stringify(p.data).indexOf('"tlNa"') < 0 && JSON.stringify(p.data).indexOf('"plNa"') < 0 && JSON.stringify(p.data).indexOf('"mNa"') < 0));
    const legacy = { internalId: 1, subId: 'L1', tlId: 'L1-TL', tlDesc: 'Total loss of x', plId: '', plDesc: '', mId: 'L1-M', mDesc: 'Erroneous x' };
    check('[O3] an old row reads as before: conditions are conditions, a blank is blank (not N/A)', NA.state(legacy, 'tl') === 'condition' && NA.state(legacy, 'pl') === 'blank' && JSON.stringify(G._fcimExportRow(legacy)) === JSON.stringify(['L1', undefined, 'L1-TL', 'Total loss of x', '', '', 'L1-M', 'Erroneous x']));
}

// ===================================================================================================================
console.log('\n[L] load order and cache keys');
{
    const html = RAW('index.html'), at = f => html.indexOf('src="' + f + '?v=');
    check('[L1] fcim_na.js loads after misc_fn_modules.js and safety_lab.js, before fcim_combined.js and fc_auto_trees.js', at('fcim_na.js') > at('misc_fn_modules.js') && at('fcim_na.js') > at('safety_lab.js') && at('fcim_na.js') < at('fcim_combined.js') && at('fcim_na.js') < at('fc_auto_trees.js') && at('misc_fn_modules.js') > 0);
    const PIN = require('./lib/pinfloor.js');
    const pin = (src, f) => (src.match(new RegExp(f.replace(/\./g, '\\.') + '\\?v=([0-9.]+)')) || [])[1] || '0';
    const floors = { 'fcim_na.js': '1.0', 'misc_fn_modules.js': '66.87', 'safety_lab.js': '65.70', 'data_ops_modules.js': '66.62', 'importers.js': '1.13', 'invariants.js': '1.8', 'lane_trees.js': '1.6', 'ai_skills.js': '2.17', 'fc_auto_trees.js': '1.5', 'helpers_modules.js': '3.41', 'sysml_model.js': '1.6', 'ai_loader.js': '8.81', 'change_ack.js': '3.3' };
    const bad = Object.keys(floors).filter(f => PIN.cmpVersion(pin(html, f), floors[f]) < 0);
    check('[L2] cache keys bumped (floors)', !bad.length, bad.join(','));
    check('[L3] ai_assistant.js pinned in ai_loader.js at 76.90 or later', PIN.cmpVersion(pin(RAW('ai_loader.js'), 'ai_assistant.js'), '76.90') >= 0);
    const ca = RAW('change_ack.js');
    check('[L5] the change review names the N/A fields in words ("partial loss: does not apply, because")', /FIELD\[s \+ 'Na'\] = w \+ ': does not apply, because'/.test(ca) && /\[\['tl', 'total loss'\], \['pl', 'partial loss'\], \['m', 'malfunction'\]\]/.test(ca));
    check('[L4] the user-facing words added carry no em dash', [RAW('fcim_na.js')].every(s => s.indexOf('—') < 0));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); process.exit(1); });
