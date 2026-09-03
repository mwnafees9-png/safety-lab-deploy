#!/usr/bin/env node
/*
 * regression_hf_review.test.js — review & commenting treatment on every HF lane.
 * HF lane rows are first-class Review comment targets (kind hf<Lane>, id = row id): a Review
 * column with the house 💬 trigger on every lane, HF kinds labelled in the Review core and the
 * thread header, and the hf.improve recommender able to file against THE ROW itself.
 * EXECUTES: the real Review core with an HF target; a real lane render showing the Review
 * cell; the real thread-subtitle resolver for HF kinds.
 * Run: node tests/regression_hf_review.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const hfa = R('hf_analyses.js'), asm = R('assurance_modules.js'), help = R('helpers_modules.js'), ai = R('ai_assistant.js');
const KINDS = ['hfAlloc','hfTid','hfTask','hfHea','hfAlerts','hfErgo','hfCd','hfSa','hfMfc'];

console.log('1. Review column on every lane (source-shape)');
check('review helpers defined (_revTh / _revTd, headless-safe)', /function _revTh\(\)/.test(hfa) && /function _revTd\(kind, id\)/.test(hfa) && /typeof reviewCellHtml === 'function'/.test(hfa));
// 2 Sep 2026 (table refactor) — the review cell is no longer written per lane. One
// generic table builder emits _revTd(cfg.kind, id) for every lane, and each lane
// declares its review kind in HF_SCHEMA. So the wiring is checked where it now lives:
// the kind must be declared in the schema, and the builder must emit the cell.
const schema = (hfa.match(/var HF_SCHEMA = \{[\s\S]*?\n    \};/) || [''])[0];
check('the generic table emits the review cell', /\(cfg\.kind \? _revTd\(cfg\.kind, id\) : ''\)/.test(hfa));
KINDS.forEach(k => check('row review cell wired for ' + k, new RegExp("kind: '" + k + "'").test(schema)));
// 2 Sep 2026 (table refactor) — one builder writes the head for every lane, so the
// header count is one emission plus one definition rather than nine. The keyed lanes'
// identities are declared in the schema: allocation rows carry the function's
// internalId as `key` and MFC rows the Appendix D function key, and the builder binds
// the review cell to cfg.idField.
check('the Review header is emitted by the one table builder', (hfa.match(/_revTh\(\)/g) || []).length === 2);
check('allocation rows key on the sub-function internalId', /return \{ key: f\.internalId, subId: f\.subId, subName: f\.subName,/.test(hfa) &&
    /alloc: \{\s*\n\s*title: 'allocation', store: 'alloc', idField: 'key', kind: 'hfAlloc'/.test(hfa));
check('MFC rows key on the Appendix D function key', /return \{ key: f\.key, label: f\.label, role: r\.role/.test(hfa) &&
    /mfc: \{\s*\n\s*title: 'workload function', store: 'mfc', idField: 'key', kind: 'hfMfc'/.test(hfa));

console.log('2. Review core + thread header know the HF kinds');
KINDS.forEach(k => check('KIND_LABELS has ' + k, new RegExp(k + ": 'HF ").test(asm)));
check('KIND_ORDER carries all nine HF kinds', KINDS.every(k => new RegExp("KIND_ORDER = \\[[^\\]]*'" + k + "'").test(asm)));
check('_reviewTargetSubtitle resolves hf* kinds through the HF store', /else if \(\/\^hf\[A-Z\]\/\.test\(String\(kind\)\)\)/.test(help) && /window\.HF_ANALYSES/.test(help.split('function _reviewTargetSubtitle')[1].split('\nfunction ')[0]));

console.log('3. recommender files against the lane row');
KINDS.forEach(k => check('_HF_IMPROVE_LANES carries kind ' + k, new RegExp("kind: '" + k + "'").test(ai)));
check('_hfImproveAnchors(cfg) builds row: anchors from the lane store', /function _hfImproveAnchors\(cfg\)/.test(ai) && /ref: 'row:' \+ id/.test(ai) && /target: \{ kind: cfg\.kind, id: String\(id\) \}/.test(ai));
check('prompt tells the model it may name the lane ROW (row:...)', /the lane ROW itself \("row:\.\.\."/.test(ai));
check('call site passes the lane cfg to the anchor builder', /_hfImproveAnchors\(cfg\)/.test(ai.split('async function recommendHfImprovements')[1] || ''));
check('after filing, the row 💬 badge refreshes in place', /_refreshCommentTriggersFor\(t\)/.test(ai.split('function _applyHfImprovement')[1].split('async function recommendHfImprovements')[0]));

console.log('4. EXECUTED — the real Review core accepts an HF row target');
{
  const sb = { reviewCommentsData: [], reviewCounter: 1, activeReviewerName: 'Tester', approvalRecordsData: [], SEVERITY_RANK: {}, DAL_RANK_MAP: {},
               setTimeout, clearTimeout, console, Date, Math, JSON, String, Array, Object, Set, Map, RegExp, Number, parseInt, parseFloat, isNaN, window: {}, document: undefined };
  vm.createContext(sb);
  let ok = false, Rv = null;
  try { vm.runInContext(asm + ';this.__R = Review;', sb); Rv = sb.__R; ok = !!Rv; } catch (e) { console.log('  (load error: ' + e.message + ')'); }
  check('Review core loads in the sandbox', ok);
  if (ok) {
    const t = { kind: 'hfSa', id: 'SA-001' };
    const c = Rv.addComment(t, 'terrain closure rate has no cue — add a TAWS aural');
    check('addComment stores an HF-row target', !!c && c.target.kind === 'hfSa' && c.target.id === 'SA-001');
    check('commentsForTarget finds it by kind+id', Rv.commentsForTarget(t).length === 1);
    check('openCountFor counts it (drives the 💬 badge)', Rv.openCountFor(t) === 1);
    check('a different row is isolated', Rv.commentsForTarget({ kind: 'hfSa', id: 'SA-002' }).length === 0);
    check('kindLabel is the human lane name', Rv.kindLabel('hfSa') === 'HF Situation Awareness' && Rv.kindLabel('hfMfc') === 'HF Minimum Flight Crew');
  }
}

console.log('5. EXECUTED — a rendered lane row carries the Review cell');
{
  const host = { innerHTML: '' };
  global.document = { getElementById: id => (id === 'hfa-cd-host' ? host : null) };
  global.reviewCellHtml = (k, id) => '<td class="review-col" data-k="' + k + '" data-id="' + id + '"></td>';
  global.projectConfig = { hf: { cd: { rows: [{ cdId: 'CD-001', item: 'PFD airspeed tape', kind: 'Display', consideration: '', supports: '', finding: '', status: 'Open', notes: '' }] } } };
  const API = require(path.join(SITE, 'hf_analyses.js'));
  API.renderCd();
  check('Review header rendered in the lane table', host.innerHTML.indexOf('<th class="review-col">Review</th>') >= 0);
  check('the row carries its review cell keyed hfCd / CD-001', /data-k="hfCd" data-id="CD-001"/.test(host.innerHTML));
}

console.log('6. EXECUTED — thread header names the HF row');
{
  const fnSrc = (function () {
    const at = help.indexOf('function _reviewTargetSubtitle'); const open = help.indexOf('{', at); let d = 0;
    for (let i = open; i < help.length; i++) { if (help[i] === '{') d++; else if (help[i] === '}') { d--; if (!d) return help.slice(at, i + 1); } }
    return null;
  })();
  const sb = { window: { HF_ANALYSES: { _read: k => (k === 'cd' ? { rows: [{ cdId: 'CD-001', item: 'PFD airspeed tape', consideration: '(a) information to perform the task' }] } : { rows: [] }), MFC_FUNCTIONS: [{ key: 'fpc', label: 'Flight path control' }] } },
               acFunctionsData: [], String, RegExp, Array, Object, console };
  vm.createContext(sb);
  let sub = '', subMfc = '';
  try { vm.runInContext(fnSrc + ';this.__s = _reviewTargetSubtitle;', sb); sub = sb.__s({ kind: 'hfCd', id: 'CD-001' }); subMfc = sb.__s({ kind: 'hfMfc', id: 'fpc' }); } catch (e) { console.log('  (subtitle error: ' + e.message + ')'); }
  check('hfCd thread header shows the row item + consideration', /CD-001/.test(sub) && /PFD airspeed tape/.test(sub) && /information to perform/.test(sub), sub);
  check('hfMfc thread header shows the Appendix D function label', /Flight path control/.test(subMfc), subMfc);
}

console.log('\n' + (fail ? ('FAIL — ' + fail + ' failed, ' + pass + ' passed') : ('OK — all ' + pass + ' checks pass')));
process.exit(fail ? 1 : 0);
