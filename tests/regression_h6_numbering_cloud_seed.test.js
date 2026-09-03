#!/usr/bin/env node
/*
 * Regression — H-6: numbering counters are restored AND seeded on the cloud path.
 *
 * THE DEFECT (observed live 31 Aug 2026 on project db0b5a9e). A cloud-loaded
 * project minted FC-001 while its existing rows started at FC-198.
 *
 * The register called this "counters not seeded". Reading the code, it is
 * bigger than that. Every snapshot ALREADY carries numberingScheme and
 * numberingStore — misc_fn_modules.js:1133 writes both on every save. The
 * localStorage restore path has always rehydrated them (helpers:1431,
 * _slInitNumberingFromProject). _restoreProjectSnapshot — the ONLY path
 * _loadCloudProject and _applyServerRestore use — read neither. So a cloud load
 * did not merely fail to seed: it KEPT THE OUTGOING PROJECT'S COUNTER STORE,
 * which is the same class of cross-project bleed as H-5, in the numbering layer.
 * A fresh tab kept a virgin store, which is where FC-001 came from.
 *
 * WHY THESE CHECKS EXECUTE RATHER THAN PIN. Same reason as regression_autosave_e1:
 * a source-shape pin proves the code still says what it said, and cannot notice
 * that what it says is wrong. Every check below runs the REAL
 * _restoreProjectSnapshot over a sandbox and asserts what the numbering layer
 * actually ends up holding.
 *
 * Run: node tests/regression_h6_numbering_cloud_seed.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const helpers = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
const misc    = fs.readFileSync(path.join(SITE, 'misc_fn_modules.js'), 'utf8');

// Brace-matched function extractor (shared idiom with regression_autosave_e1).
function fn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let depth = 0, started = false, inS = null, esc = false, line = false, blk = false;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { line = true; k++; continue; }
    if (c === '/' && n === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

const SRC_RESTORE = fn(helpers, '_restoreProjectSnapshot');
const SRC_INIT    = fn(helpers, '_slInitNumberingFromProject');
const SRC_SEED    = fn(helpers, '_slSeedNumberingFromExisting');
const SRC_MAXSEQ  = fn(helpers, '_slMaxTrailingSeq');

check('extracted the real _restoreProjectSnapshot', !!SRC_RESTORE);
check('extracted the real _slInitNumberingFromProject', !!SRC_INIT);
check('extracted the real _slSeedNumberingFromExisting', !!SRC_SEED);
check('extracted the real _slMaxTrailingSeq', !!SRC_MAXSEQ);
if (!SRC_RESTORE || !SRC_INIT || !SRC_SEED || !SRC_MAXSEQ) {
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(1);
}

// The save side is the reason this matters: it emits both fields on every save.
check('the WRITER emits numberingScheme + numberingStore on every save',
      /numberingScheme:\s*slNumberingScheme,\s*numberingStore:\s*slNumberingStore/.test(misc));

// ---------------------------------------------------------------------------
// A sandbox carrying a real-enough numbering engine. seedCounter records every
// call so we can assert the high-water mark the seeder computed, and newStore()
// returns a FRESH object each time so store identity is meaningful evidence.
// ---------------------------------------------------------------------------
function sandbox(pre) {
  const seeds = [];
  const DEFAULT_SCHEME = {
    _tag: 'DEFAULT',
    templates: { acFunction: { type: 'acFunction' }, subFunction: { type: 'subFunction' }, failureCond: { type: 'failureCond' } }
  };
  const ctx = {
    console: { warn() {}, log() {}, error() {} },
    seeds,
    slNumberingScheme: null,
    slNumberingStore: null,
    acFunctionsData: [], acFhaData: [], flightPhasesData: [], ftaPages: [],
    typeCounters: {}, ftaConfig: {}, projectConfig: {}, projectName: '',
    projectTemplates: {}, projectReportEdits: {}, autoReqTemplateOverrides: {},
  };
  ctx.window = ctx;
  ctx.SafetyLabNumbering = {
    DEFAULT_SCHEME,
    newStore: () => ({ seq: {}, map: {}, _tag: 'FRESH' }),
    seedCounter: (store, type, scope, opts, n) => { seeds.push({ store, type, n }); }
  };
  Object.assign(ctx, pre || {});
  vm.createContext(ctx);
  vm.runInContext(SRC_MAXSEQ + '\n' + SRC_SEED + '\n' + SRC_INIT + '\n' + SRC_RESTORE, ctx);
  return ctx;
}

const highWater = (ctx, type) => {
  const hits = ctx.seeds.filter(s => s.type === type);
  return hits.length ? hits[hits.length - 1].n : null;
};

// ---------------------------------------------------------------------------
// 1 — the reported symptom: a cloud project whose rows start at FC-198
// ---------------------------------------------------------------------------
console.log('[h6] 1 — counters seed above the ids already in the snapshot');
{
  const snap = {
    projectName: 'db0b5a9e',
    acFhaData: [{ fcId: 'FC-198' }, { fcId: 'FC-201' }, { fcId: 'FC-199' }],
    acFunctionsData: [{ funcId: 'AF-12', subId: 'SF-40' }],
    numberingStore: { seq: {}, map: {}, _tag: 'FROM-SNAPSHOT' }
  };
  const ctx = sandbox();
  let threw = null;
  try { vm.runInContext('_restoreProjectSnapshot(SNAP)', Object.assign(ctx, { SNAP: snap })); }
  catch (e) { threw = e; }
  check('_restoreProjectSnapshot ran without throwing', !threw, threw && threw.message);
  check('failureCond counter seeded to 201, not 0 — the FC-001 bug',
        highWater(ctx, 'failureCond') === 201, 'got ' + highWater(ctx, 'failureCond'));
  check('acFunction counter seeded to 12', highWater(ctx, 'acFunction') === 12, 'got ' + highWater(ctx, 'acFunction'));
  check('subFunction counter seeded to 40', highWater(ctx, 'subFunction') === 40, 'got ' + highWater(ctx, 'subFunction'));
  check('the snapshot OWN store is adopted, not a fresh one',
        ctx.slNumberingStore && ctx.slNumberingStore._tag === 'FROM-SNAPSHOT',
        'got ' + (ctx.slNumberingStore && ctx.slNumberingStore._tag));
  check('the seeder wrote into that same store object',
        ctx.seeds.length > 0 && ctx.seeds.every(s => s.store === ctx.slNumberingStore));
}

// ---------------------------------------------------------------------------
// 2 — cross-project bleed: the part the register did not name
// ---------------------------------------------------------------------------
console.log('[h6] 2 — switching projects does not inherit the outgoing store');
{
  const A = { projectName: 'A', acFhaData: [{ fcId: 'FC-900' }], acFunctionsData: [],
              numberingStore: { seq: {}, map: {}, _tag: 'STORE-A' } };
  const B = { projectName: 'B', acFhaData: [{ fcId: 'FC-7' }], acFunctionsData: [],
              numberingStore: { seq: {}, map: {}, _tag: 'STORE-B' } };
  const ctx = sandbox();
  vm.runInContext('_restoreProjectSnapshot(A)', Object.assign(ctx, { A }));
  check('project A adopts store A', ctx.slNumberingStore._tag === 'STORE-A');
  ctx.seeds.length = 0;
  vm.runInContext('_restoreProjectSnapshot(B)', Object.assign(ctx, { B }));
  check('project B adopts store B — A store does not survive the switch',
        ctx.slNumberingStore._tag === 'STORE-B', 'got ' + ctx.slNumberingStore._tag);
  check('and B counters reflect B rows (7), not A (900)',
        highWater(ctx, 'failureCond') === 7, 'got ' + highWater(ctx, 'failureCond'));
}

// ---------------------------------------------------------------------------
// 3 — a save that predates the store still cannot collide
// ---------------------------------------------------------------------------
console.log('[h6] 3 — legacy saves with no store fall back to a fresh one, still seeded');
{
  const legacy = { projectName: 'old', acFhaData: [{ fcId: 'FC-55' }], acFunctionsData: [] };
  const ctx = sandbox();
  vm.runInContext('_restoreProjectSnapshot(L)', Object.assign(ctx, { L: legacy }));
  check('a fresh store is minted when the snapshot has none',
        ctx.slNumberingStore && ctx.slNumberingStore._tag === 'FRESH');
  check('and it is STILL seeded above the existing ids (55)',
        highWater(ctx, 'failureCond') === 55, 'got ' + highWater(ctx, 'failureCond'));
  check('the scheme falls back to DEFAULT_SCHEME', ctx.slNumberingScheme && ctx.slNumberingScheme._tag === 'DEFAULT');
}

// ---------------------------------------------------------------------------
// 4 — ordering: the seed must read rows that are already assigned
// ---------------------------------------------------------------------------
console.log('[h6] 4 — the seed runs AFTER the row assignments, not before');
{
  // If the call were placed above `acFhaData = ...`, the seeder would read the
  // PREVIOUS project rows. Prove ordering by pre-loading the sandbox with a
  // decoy high-water mark that must NOT win.
  const ctx = sandbox({ acFhaData: [{ fcId: 'FC-9999' }] });
  const snap = { projectName: 'ordered', acFhaData: [{ fcId: 'FC-3' }], acFunctionsData: [] };
  vm.runInContext('_restoreProjectSnapshot(S)', Object.assign(ctx, { S: snap }));
  check('seeded from the INCOMING rows (3), not the resident decoy (9999)',
        highWater(ctx, 'failureCond') === 3, 'got ' + highWater(ctx, 'failureCond'));
}

// ---------------------------------------------------------------------------
// 5 — the numbering layer can never break a project load
// ---------------------------------------------------------------------------
console.log('[h6] 5 — a numbering failure does not take the load down with it');
{
  const ctx = sandbox();
  ctx.SafetyLabNumbering.seedCounter = () => { throw new Error('engine exploded'); };
  const snap = { projectName: 'resilient', acFhaData: [{ fcId: 'FC-1' }], acFunctionsData: [] };
  let threw = null;
  try { vm.runInContext('_restoreProjectSnapshot(S)', Object.assign(ctx, { S: snap })); }
  catch (e) { threw = e; }
  check('the restore still completes when the numbering engine throws', !threw, threw && threw.message);
  check('and the project rows landed anyway', ctx.projectName === 'resilient');
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
