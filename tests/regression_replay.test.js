#!/usr/bin/env node
/*
 * Regression tests for ASR-1 — deterministic replay verification
 * (replay_verify.js v1.1, card-based engine-lane semantics).
 *
 * Locks:
 *   [1] lane discipline: the ONLY write is the replay card
 *       (projectConfig.replayCard); checks re-run the engine and report.
 *   [2] card semantics on the REAL engine: stamp → seal → re-derive matches
 *       to 1e-12; tampered INPUTS in a sealed tree are caught and named;
 *       pre-ASR-1 snapshots (no card) degrade honestly, never fake-pass.
 *   [3] chain + surface: verifications journaled; card stamped BEFORE a
 *       revision cut; ⟲ Verify action on version-history rows; wiring.
 *
 * Run:  node tests/regression_replay.test.js
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
const src = SITE('replay_verify.js');

// ---- globals + real engine ----------------------------------------------------
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { getElementById: () => null, addEventListener() {}, readyState: 'complete' };
globalThis.showToast = () => {};
globalThis.TEMPLATE_SCHEMAS = {}; globalThis.renderFhaAsmLinksHtml = () => '';
globalThis._perfStats = {}; globalThis._cutsetWorker = null; globalThis._cutsetWorkerSeq = 0; globalThis._CUTSET_WORKER_MIN_NODES = 400;
globalThis.ftaConfig = { mode: 'bottom-up', apportion: 'equal', targetP: 1e-5, exposureTime: 1 };
globalThis.acFhaData = []; globalThis.systemsData = []; globalThis.projectConfig = {};
const jrnlCalls = [];
globalThis.jrnl = (kind, s) => jrnlCalls.push({ kind, s });

const L = (id, p) => ({ id, logicalId: 'L' + id, displayId: 'B' + id, name: 'e' + id, type: 'basic', probability: p, lambda: p, children: [] });
const mkRoot = () => ({ id: 1, type: 'gate', gateType: 'OR', children: [{ id: 2, type: 'gate', gateType: 'AND', children: [L(3, 1e-3), L(4, 2e-3)] }, L(5, 5e-4)] });
globalThis.ftaPages = [
  { id: 'pg1', name: 'verified page', mode: 'bottom-up', root: mkRoot() },
  { id: 'pg3', name: 'empty', root: null }
];

(0, eval)(['fta_engine.js', 'engine_modules.js', 'fta_quant_modules.js', 'misc_fn_modules.js', 'replay_verify.js'].map(SITE).join('\n;\n'));
const R = globalThis.SLReplay;

console.log('\n[1] lane discipline');
check('exports replaySnapshot/verifyRevision/verifyCurrent/stampReplayCard', !!R && typeof R.replaySnapshot === 'function' && typeof R.stampReplayCard === 'function');
const stripped = src.replace(/\/\/[^\n]*/g, '');
check('only write is the replay card', !/(ftaPages\s*=(?!=)|acFhaData\s*=(?!=))/.test(stripped) && /projectConfig\.replayCard = \{/.test(src));
check('reports, never resolves — mismatch carries recorded + recomputed', /recorded, recomputed, match/.test(src));

console.log('\n[2] card semantics (real arena engine)');
const card = R.stampReplayCard();
const truth = card['pg1'];
check('card stamped from live trees (engine-lane P per page, empty skipped)', typeof truth === 'number' && isFinite(truth) && !('pg3' in card));
const snapshot = JSON.parse(JSON.stringify({ ftaConfig: globalThis.ftaConfig, ftaPages: globalThis.ftaPages, projectConfig: globalThis.projectConfig }));
const r1 = R.replaySnapshot(snapshot);
check('sealed page re-derives and matches to 1e-12', r1.pass && r1.checked === 1 && r1.pages[0].match, JSON.stringify(r1.pages[0]));
check('live objects untouched (deep-copied)', globalThis.ftaPages[0].root.children[1].probability === 5e-4);
const bad = JSON.parse(JSON.stringify(snapshot));
bad.ftaPages[0].root.children[1].probability = 6e-4;   // tamper an INPUT in the sealed tree
const r2 = R.replaySnapshot(bad);
check('a tampered input is caught and NAMED', !r2.pass && r2.mismatches === 1 && r2.pages[0].match === false && typeof r2.pages[0].recomputed === 'number');
const noCard = JSON.parse(JSON.stringify(snapshot)); delete noCard.projectConfig.replayCard;
const r3 = R.replaySnapshot(noCard);
check('pre-ASR-1 snapshots degrade honestly (no fake pass)', r3.noCard && /no replay card/.test(r3.error));
check('graceful on malformed snapshots', R.replaySnapshot({}).error != null);

console.log('\n[3] chain + surface');
jrnlCalls.length = 0;
const vc = R.verifyCurrent();
check('verifyCurrent: trees computed twice on fresh arenas, bit-identical', vc.ok && vc.replay.checked === 1 && vc.replay.pages[0].recorded === vc.replay.pages[0].recomputed);
check('verification journaled', jrnlCalls.length === 1 && jrnlCalls[0].kind === 'replay-verify' && /bit-identical/.test(jrnlCalls[0].s));
check('revision cuts journaled via additive wrap', /createProjectRevision\._replayWrapped/.test(src) && /jrnl\('checkpoint'/.test(src));
check('card stamped BEFORE the cut (rides inside the snapshot)', /stampReplayCard\(\); \} catch \(_\) \{\}/.test(src));
const helpers = SITE('helpers_modules.js');
check('version-history rows carry the ⟲ Verify action', /_replayVerifyRevision\(/.test(helpers) && /Verify<\/button>/.test(helpers));
const idx = SITE('index.html');
check('wired: replay_verify v1.1 + helpers current', /replay_verify\.js\?v=1\.1/.test(idx) && /helpers_modules\.js\?v=2\./.test(idx));
check('tolerance pinned at 1e-12 relative', R.REL_TOL === 1e-12);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
