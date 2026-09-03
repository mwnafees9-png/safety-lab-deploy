#!/usr/bin/env node
/*
 * Regression — A7: common resource ≠ common cause (22 Aug 2026, ruled:
 * suppress + note).
 *   Structural sharing the MODEL declares (macsys:/macres: lids, MAC or lane
 *   provenance, resource identity) is never a CCF discovery: the similarity
 *   detector skips compiled-vs-compiled pairs, and a shared DECLARED-resource
 *   lid under an AND becomes an informational note that does NOT compromise
 *   the independence requirement. Authored twins, authored-vs-compiled mixes,
 *   and undeclared shared lids all keep today's behavior — the guard is for
 *   declared structure only, or the tool manufactures findings.
 * Run: node tests/regression_resource_not_ccf.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const slice = (src, from, to, label) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('slice anchors missing: ' + label);
  return src.slice(a, b);
};

globalThis.window = globalThis;
globalThis.SLEnv = { get: n => globalThis[n] };
globalThis.SEVERITY_RANK = { Minor: 2, Major: 3, Hazardous: 4, Catastrophic: 5 };

// ---- the whole similarity module loads (DOM touched only on call) ----------
new Function('window', S('ccf_similarity.js'))(globalThis);
// ---- the gate-independence generator family --------------------------------
const asr = S('assurance_modules.js');
(0, eval)(slice(asr, 'function hashStr', 'function walkAllPages', 'fp'));
(0, eval)(slice(asr, 'function _midSentence', 'function _governingFhaForPage', 'text helpers'));
(0, eval)(slice(asr, 'function isAndFamily', '// ----- Generator 5', 'gate independence'));
globalThis.pageTopSeverity = () => 'Catastrophic';
globalThis.findPathTo = () => null;
globalThis.cmaData = [];
const SEV_ORDER = SEVERITY_RANK; globalThis.SEV_ORDER = SEV_ORDER;

// ---- similarity: compiled pairs are not lookalike findings ------------------
const leaf = (id, lid, name, extra) => Object.assign({ id, logicalId: lid, type: 'basic', name, probability: 1e-6 }, extra || {});
const twinsGate = kids => ({ id: 'g', displayId: 'G', type: 'gate', gateType: 'AND', children: kids });
const pageWith = g => [{ id: 'p1', name: 'P1', root: g }];

globalThis.ftaPages = pageWith(twinsGate([
  leaf(1, 'macsys:sys-prl', 'Loss of thrust left propeller'),
  leaf(2, 'macsys:sys-prr', 'Loss of thrust right propeller') ]));
globalThis.projectConfig = {};
check('COMPILED vs COMPILED lookalikes are SKIPPED — the model already states the coupling',
  ccfPairs().length === 0, JSON.stringify(ccfPairs().map(p => p.key)));

globalThis.ftaPages = pageWith(twinsGate([
  leaf(1, 'a1', 'Hydraulic pump A fails'),
  leaf(2, 'a2', 'Hydraulic pump B fails') ]));
check('AUTHORED twins still flag (the classic copy-paste redundancy pair)', ccfPairs().length === 1);

globalThis.ftaPages = pageWith(twinsGate([
  leaf(1, 'macsys:sys-prl', 'Loss of thrust left propeller'),
  leaf(2, 'a9', 'Loss of thrust right propeller') ]));
check('an AUTHORED-vs-COMPILED mix still flags (an authored twin of a compiled event is a real question)',
  ccfPairs().length === 1);

globalThis.ftaPages = pageWith(twinsGate([
  leaf(1, 'r1', 'Bleed supply left', { identity: { kind: 'resource', resourceId: 'BLD', providerSystemId: 's' } }),
  leaf(2, 'r2', 'Bleed supply right', { identity: { kind: 'resource', resourceId: 'BLD', providerSystemId: 's' } }) ]));
check('two declared-RESOURCE identities are structural — skipped', ccfPairs().length === 0);

globalThis.ftaPages = pageWith(twinsGate([
  leaf(1, 'l1', 'Deceleration left lane', { _laneProv: { lane: 'tl' } }),
  leaf(2, 'l2', 'Deceleration right lane', { _laneProv: { lane: 'tl' } }) ]));
check('two lane-generated events are structural — skipped', ccfPairs().length === 0);
check('_ccfIsStructural exported for the desk/panels',
  typeof _ccfIsStructural === 'function' && _ccfIsStructural(leaf(9, 'macres:5:total loss', 'x')) === true
  && _ccfIsStructural(leaf(9, 'plain', 'x')) === false);

// ---- AND compromise: declared share = note, undeclared = warning ------------
const shared = lid => twinsGate([leaf(1, lid, 'Loss of supply'), leaf(2, lid, 'Loss of supply'), leaf(3, 'other', 'Other event')]);
let rs = checkANDCompromise(shared('macres:9:total loss'));
check('a shared DECLARED-resource lid is a STRUCTURAL note, not a common-mode warning',
  rs.length === 1 && rs[0].kind === 'shared-resource-structural' && rs[0].structural === true,
  JSON.stringify(rs));
check('…and the note says exactly what it is and who owns it',
  /structural sharing, modeled exactly/.test(rs[0].detail) && /Not a common-cause finding/.test(rs[0].detail) && /CRA and CMA lanes own/.test(rs[0].detail));
rs = checkANDCompromise(shared('authored-77'));
check('an UNDECLARED shared lid keeps the common-mode warning verbatim',
  rs.length === 1 && rs[0].kind === 'shared-logical-id' && !rs[0].structural && /same physical event used twice/.test(rs[0].detail));
const grpGate = twinsGate([leaf(1, 'x', 'A', { ccfGroup: 'G' }), leaf(2, 'y', 'B', { ccfGroup: 'G' })]);
check('declared CCF groups still surface (the guard is for structure, not for declared CCF)',
  checkANDCompromise(grpGate).some(r => r.kind === 'shared-ccf-group'));

// ---- the requirement flag: notes never compromise ---------------------------
globalThis.ftaPages = [{ id: 'p1', name: 'P1', treeLevel: 'system', root: shared('macres:9:total loss') }];
globalThis.walkPagesInScope = (scope, cb) => ftaPages.forEach(p => {
  (function w(n) { if (!n) return; cb(n, p); (n.children || []).forEach(w); })(p.root);
});
let out = genGateIndependence('ac');
let andReq = out.find(r => r.reqSource.generator === 'gate-indep-and');
check('the AND independence requirement is NOT compromised by a structural note',
  andReq && andReq.compromised === false && andReq.compromiseReasons.length === 1 && andReq.compromiseReasons[0].structural,
  andReq && JSON.stringify({ c: andReq.compromised, k: andReq.compromiseReasons.map(r => r.kind) }));
globalThis.ftaPages = [{ id: 'p1', name: 'P1', treeLevel: 'system', root: shared('authored-77') }];
out = genGateIndependence('ac');
andReq = out.find(r => r.reqSource.generator === 'gate-indep-and');
check('…while an undeclared shared lid still compromises it (regression guard)',
  andReq && andReq.compromised === true);

// ---- wiring -----------------------------------------------------------------
const idx = S('index.html');
check('pins: ccf_similarity ≥1.3 and assurance ≥1.26 (floors, rule 12)',
  parseFloat((idx.match(/ccf_similarity\.js\?v=([\d.]+)/) || [])[1]) >= 1.3 &&
  parseFloat((idx.match(/assurance_modules\.js\?v=([\d.]+)/) || [])[1]) >= 1.26);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
