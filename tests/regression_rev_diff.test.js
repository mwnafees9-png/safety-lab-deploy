#!/usr/bin/env node
/*
 * Regression tests for DIF-1 — the revision diff (rev_diff.js).
 * Locks: identity-matched diffing across every category; before/after values
 * named; display lane (no writes, no judgment); wiring.
 * Run:  node tests/regression_rev_diff.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const SITE = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const src = SITE('rev_diff.js');

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, addEventListener() {}, querySelector: () => ({ addEventListener() {} }), remove() {} }), body: { appendChild() {} }, addEventListener() {}, readyState: 'complete' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(0, eval)(src);
const D = globalThis.SLDiff;

const L = (id, p) => ({ id, logicalId: 'L' + id, displayId: 'B' + id, name: 'e' + id, type: 'basic', probability: p, lambda: p, children: [] });
const snapA = {
  ftaPages: [{ id: 'p1', name: 'tree one', root: { id: 1, type: 'gate', gateType: 'OR', children: [L(2, 1e-3), L(3, 2e-3)] } },
             { id: 'pGone', name: 'retired page', root: { id: 9, type: 'gate', children: [] } }],
  acFhaData: [{ id: 'FC-01', severity: 'Catastrophic', condition: 'loss of pitch' }],
  systemsData: [{ fha: [], req: [{ reqId: 'R-9', text: 'old text', dal: 'B' }], asm: [{ asmId: 'A-1', text: 'pump', state: 'Proposed' }] }],
  acReqData: [], acAssumptionsData: [],
  projectConfig: { replayCard: { pages: { p1: 5.0e-6 } } }
};
const snapB = JSON.parse(JSON.stringify(snapA));
snapB.ftaPages = snapB.ftaPages.filter(p => p.id !== 'pGone');                      // page removed
snapB.ftaPages.push({ id: 'pNew', name: 'new page', root: { id: 20, type: 'gate', children: [] } }); // page added
snapB.ftaPages[0].root.children[0].lambda = 5e-3;                                    // node field changed
snapB.ftaPages[0].root.children.push(L(4, 1e-4));                                    // node added
snapB.acFhaData[0].severity = 'Hazardous';                                           // FHA changed
snapB.systemsData[0].req[0].text = 'new text';                                       // REQ changed
snapB.systemsData[0].asm[0].state = 'Validated';                                     // ASM transition
snapB.projectConfig.replayCard.pages.p1 = 6.1e-6;                                    // engine delta

console.log('\n[1] identity-matched delta');
const d = D.compare(snapA, snapB);
check('pages: one removed, one added', d.pages.filter(x => x.kind === 'removed').length === 1 && d.pages.filter(x => x.kind === 'added').length === 1);
check('nodes: added + changed field with before → after', d.nodes.some(x => x.kind === 'added') && d.nodes.some(x => x.kind === 'changed' && /lambda: 1\.000e-3 → 5\.000e-3/.test(x.what)));
check('FHA severity change named', d.fha.some(x => /FC-01 severity: "Catastrophic" → "Hazardous"/.test(x.what)));
check('requirement text change named', d.req.some(x => /R-9 text/.test(x.what)));
check('assumption state transition named', d.asm.some(x => /A-1 state: "Proposed" → "Validated"/.test(x.what)));
check('engine P(top) delta from replay cards', d.replay.length === 1 && /5\.000e-6 → 6\.100e-6/.test(d.replay[0].what));
check('total counts everything', d.total === d.pages.length + d.nodes.length + d.fha.length + d.req.length + d.asm.length + d.replay.length && d.total >= 7);
check('identical snapshots → zero delta', D.compare(snapA, snapA).total === 0);

console.log('\n[2] lane discipline');
const stripped = src.replace(/\/\/[^\n]*/g, '');
check('never writes to stores', !/(ftaPages\s*=(?!=)|acFhaData\s*=(?!=)|projectConfig\.\w+\s*=(?!=))/.test(stripped));
check('names changes, recommends nothing', /judgment stays with/i.test(src) && !/should|recommend accepting/i.test(src.replace(/\/\/[^\n]*/g, '')));
check('category cap honest (full counts + export note)', /CAP/.test(src) && /more \(export for the full list\)/.test(src));

console.log('\n[3] wiring');
const idx = SITE('index.html');
check('index.html loads rev_diff.js', /rev_diff\.js\?v=1\./.test(idx));
check('Version History rows carry Δ Diff', /_revDiffOpen\(/.test(SITE('helpers_modules.js')) && /helpers_modules\.js\?v=[\d.]+/.test(idx));
check('endpoints tie back to verification (hashes + replay cards named in UI copy)', /canonical hashes and replay cards/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
