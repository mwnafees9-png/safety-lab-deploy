#!/usr/bin/env node
/*
 * Regression — the legacy-id renumber migration (slate ruling #12, built
 * 4 Aug 2026): folded into the demo overhaul, CROSS-REFERENCES FIRST,
 * PREVIEW-THEN-APPLY.
 *
 * The design claim this suite defends: the migration owns NO reference
 * mechanism. rename_guard already knows where every id is referenced, and
 * rgApply already re-enumerates at apply time. A second enumerator here would
 * be §8 at the worst possible moment — two mechanisms disagreeing about what
 * points at an id, while a migration rewrites the project. So the migration
 * PLANS, and calls rename_guard to write (rgRenameOwner for the owner's own
 * id, rgApply for the references).
 *
 * Everything is EXECUTED against the REAL rename_guard, loaded the way the
 * browser loads it (classic script into a shared global scope).
 *
 * Run: node tests/regression_renumber_migration.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const rgSrc = fs.readFileSync(path.join(SITE, 'rename_guard.js'), 'utf8');
const mgSrc = fs.readFileSync(path.join(SITE, 'renumber_migration.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

// ---- [0] wiring + the no-second-mechanism pin ------------------------------
console.log('\n[renumber] wiring + doctrine');
const pinOf = re => parseFloat((idx.match(re) || [])[1]);
check('index.html floors rename_guard ≥ 1.5 and renumber_migration ≥ 1.1 (the pin IS the cache key — v1.1 was served stale under an unbumped v1.0)',
  pinOf(/rename_guard\.js\?v=([0-9.]+)/) >= 1.5 && pinOf(/renumber_migration\.js\?v=([0-9.]+)/) >= 1.1);
check('…and loads the migration AFTER rename_guard, whose writers it composes',
  idx.indexOf('renumber_migration.js?v=') > idx.indexOf('rename_guard.js?v='));
const mgCode = mgSrc.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
// The precise invariant. The module DOES read the FCIM and the FHA — that is
// how a PLAN is built (which cells exist, which fcIds nothing accounts for).
// What it must never do is enumerate WHERE AN ID IS REFERENCED: the stores
// below are exactly where references live, rename_guard owns them, and a
// second enumerator disagreeing with the first while a migration rewrites the
// project is §8 at the worst possible moment.
const REF_STORES = ['acReqData', 'ftaPages', 'zsaData', 'praData', 'itemsData', 'cmaData'];
check('reference enumeration is delegated to rename_guard, never re-implemented',
  /_rgKinds/.test(mgCode) && /def\.refs\(/.test(mgCode) &&
  REF_STORES.every(s => !new RegExp('(^|[^.\\w])' + s + '\\b').test(mgCode)) &&
  !/slots\.push\(/.test(mgCode),
  'reads a reference-bearing store or builds its own slots: ' +
  REF_STORES.filter(s => new RegExp('(^|[^.\\w])' + s + '\\b').test(mgCode)).join(', '));
check('…while the PLAN sources it does read are only the FCIM, the FHA and the system list',
  /acFcimData/.test(mgCode) && /acFhaData/.test(mgCode),
  'the plan needs to know which cells exist and which fcIds nothing accounts for');
check('the only writes are rename_guard calls',
  /window\.rgRenameOwner\(/.test(mgCode) && /window\.rgApply\(/.test(mgCode) &&
  !/\.obj\[[^\]]*\]\s*=/.test(mgCode), 'the migration must never poke a store directly');

// ---- load the REAL rename_guard + migration --------------------------------
globalThis.window = globalThis;
globalThis.scheduleAutosave = () => {};
globalThis.showToast = () => {};
globalThis.projectConfig = {};
function seed() {
  globalThis.acFunctionsData = [{ internalId: 1, subId: 'SF-01', subName: 'Pitch' }];
  globalThis.acFhaData = [
    { internalId: 10, fcId: 'FC-30', fcDesc: 'legacy id row', subId: 'SF-01', severity: 'Major' },
    { internalId: 11, fcId: 'SF-01-TL', fcDesc: 'already scheme', subId: 'SF-01', severity: 'Catastrophic' }
  ];
  globalThis.acReqData = [{ internalId: 20, traceId: 'FC-30', text: 'r' }];
  globalThis.systemsData = [];
  globalThis.zsaData = []; globalThis.praData = []; globalThis.itemsData = [];
  globalThis.ftaPages = [];
  globalThis.cmaData = [];
  globalThis.projectConfig = {};
}
seed();
(0, eval)(rgSrc + '\n;\n' + mgSrc);
const M = globalThis.RENUMBER;
check('both modules loaded and expose their APIs',
  typeof M.renumberPreview === 'function' && typeof M.renumberApply === 'function' &&
  typeof globalThis.rgRenameOwner === 'function' && typeof globalThis.rgApply === 'function');

// ---- [1] preview is a pure read --------------------------------------------
console.log('\n[renumber] preview');
{
  const before = JSON.stringify([acFhaData, acReqData, acFunctionsData]);
  const r = M.renumberPreview('fcId', { 'FC-30': 'SF-04-M' });
  check('a valid plan previews as applicable', r.ok && r.totals.applicable === 1 && r.safeToApply === true, JSON.stringify(r.totals));
  check('…counting the references that would move, and naming WHERE they live',
    r.entries[0].refs >= 1 && Object.keys(r.entries[0].byWhere).length >= 1, JSON.stringify(r.entries[0]));
  check('preview MUTATES NOTHING', JSON.stringify([acFhaData, acReqData, acFunctionsData]) === before);
  check('an unknown kind refuses by name, listing what it does know',
    (() => { const x = M.renumberPreview('nope', {}); return !x.ok && /unknown identifier kind/.test(x.reason) && /fcId/.test(x.reason); })());
  const noop = M.renumberPreview('fcId', { 'FC-30': 'FC-30' });
  check('a no-op is reported as a no-op, not applied', noop.totals.noops === 1 && noop.totals.applicable === 0);
  const ghost = M.renumberPreview('fcId', { 'FC-999': 'X-1' });
  check('a plan naming an id nothing owns is flagged unknown-owner',
    ghost.totals.unknown === 1 && /no .* with this id exists/.test(ghost.entries[0].note));
}

// ---- [2] collisions and cycles ---------------------------------------------
console.log('\n[renumber] collisions and cycles');
{
  const c = M.renumberPreview('fcId', { 'FC-30': 'SF-01-TL' });
  check('renaming onto an id already in use is a COLLISION, and not safe to apply',
    c.totals.collisions === 1 && c.safeToApply === false && /already in use/.test(c.entries[0].note));
  const dup = M.renumberPreview('fcId', { 'FC-30': 'NEW-1', 'SF-01-TL': 'NEW-1' });
  check('two ids mapping onto one target is a COLLISION on both rows',
    dup.totals.collisions === 2 && dup.safeToApply === false);
  const swap = M.renumberPreview('fcId', { 'FC-30': 'SF-01-TL', 'SF-01-TL': 'FC-30' });
  check('a straight SWAP is detected as a cycle, not silently half-applied',
    swap.totals.cycles === 2 && swap.safeToApply === false, JSON.stringify(swap.totals));
  check('…and the text preview says how to resolve it',
    /stage through a temporary id/.test(M.renumberPreviewText('fcId', { 'FC-30': 'SF-01-TL', 'SF-01-TL': 'FC-30' })));
  // A chain A→B where B→C is legal, and ORDER must put B→C first.
  seed();
  acFhaData.push({ internalId: 12, fcId: 'MID', fcDesc: 'chain middle', subId: 'SF-01', severity: 'Minor' });
  const chain = M.renumberPreview('fcId', { 'FC-30': 'MID', 'MID': 'END' });
  check('a CHAIN is safe, and ordered so a rename never lands on a live id',
    chain.safeToApply === true && chain.order.indexOf('MID') < chain.order.indexOf('FC-30'),
    JSON.stringify(chain.order));
}

// ---- [3] apply, executed through rename_guard -------------------------------
console.log('\n[renumber] apply');
{
  seed();
  const res = M.renumberApply('fcId', { 'FC-30': 'SF-04-M' });
  check('apply reports success with counts', res.ok && res.applied === 1 && res.refsUpdated >= 1, JSON.stringify(res.steps));
  check('the OWNER now carries the new id — the half rgApply alone never did',
    acFhaData.find(f => f.internalId === 10).fcId === 'SF-04-M');
  check('and every REFERENCE followed it',
    acReqData[0].traceId === 'SF-04-M' && !JSON.stringify([acFhaData, acReqData]).includes('FC-30'));
  check('the migration is logged on the project for audit',
    (projectConfig.renumberLog || []).length === 1 && projectConfig.renumberLog[0].applied === 1 &&
    projectConfig.renumberLog[0].ids[0] === 'FC-30→SF-04-M');
  check('rename_guard also logged the reference rewrite (its own audit trail is intact)',
    (projectConfig.renameLog || []).length === 1);
}

// ---- [4] refusal is WHOLE, not partial -------------------------------------
console.log('\n[renumber] an unsafe plan is refused whole');
{
  seed();
  const before = JSON.stringify([acFhaData, acReqData]);
  const res = M.renumberApply('fcId', { 'FC-30': 'SF-04-M', 'SF-01-TL': 'SF-04-M' });
  check('a plan with a collision is REFUSED', !res.ok && /not safe to apply/.test(res.reason));
  check('…and NOTHING was written — not even the safe row',
    JSON.stringify([acFhaData, acReqData]) === before,
    'a half-renumbered project is a state nobody designed');
  check('…while still returning the full preview so the user can fix it', !!res.preview && res.preview.totals.collisions === 2);
  const dry = M.renumberApply('fcId', { 'FC-30': 'SF-04-M' }, { dryRun: true });
  check('dryRun walks a SAFE plan and still writes nothing',
    dry.ok && dry.dryRun === true && dry.applied === 0 &&
    acFhaData.find(f => f.internalId === 10).fcId === 'FC-30');
}

// ---- [5] rgRenameOwner's own guards ----------------------------------------
console.log('\n[renumber] rgRenameOwner (rename_guard v1.5)');
{
  seed();
  check('refuses to rename onto an id already in use (no silent merge)',
    (() => { const r = rgRenameOwner('fcId', 'FC-30', 'SF-01-TL'); return !r.ok && /already in use/.test(r.reason); })());
  check('refuses when no owner carries the id',
    (() => { const r = rgRenameOwner('fcId', 'NOPE', 'X'); return !r.ok && /carries the id/.test(r.reason); })());
  check('refuses on an unknown kind', !rgRenameOwner('bogus', 'a', 'b').ok);
  check('structural ids (tree pages) are declared unrenameable rather than half-supported',
    (() => { globalThis.ftaPages = [{ id: 'pg1', name: 'p', root: null }];
             const r = rgRenameOwner('pageId', 'pg1', 'pg2');
             globalThis.ftaPages = [];
             return !r.ok && /structural|not renameable/i.test(r.reason); })());
  check('a good rename writes exactly one field',
    (() => { seed(); const r = rgRenameOwner('fcId', 'FC-30', 'ZZ-1');
             return r.ok && acFhaData.find(f => f.internalId === 10).fcId === 'ZZ-1' &&
                    acReqData[0].traceId === 'FC-30'; })(),
    'the owner write and the reference rewrite are separate steps by design');
}

// ---- [6] other kinds ride the same path ------------------------------------
console.log('\n[renumber] the migration is kind-generic');
{
  seed();
  globalThis.zsaData = [{ internalId: 40, zoneId: 'Z1', housedFunctions: ['SF-01'] }];
  globalThis.praData = [{ internalId: 50, praId: 'PR-1', affectedZones: ['Z1'] }];
  const r = M.renumberApply('zoneId', { 'Z1': 'ZONE-100' });
  check('a zone renumber renames the owner and follows its references',
    r.ok && zsaData[0].zoneId === 'ZONE-100' && praData[0].affectedZones[0] === 'ZONE-100', JSON.stringify(r.steps));
  const kinds = Object.keys(globalThis._rgKinds);
  check('every kind rename_guard knows is previewable',
    kinds.every(k => M.renumberPreview(k, {}).ok), JSON.stringify(kinds));
}

// ---- [7] the PLAN GENERATOR (engine-derived, not hand-rolled) --------------
// Live-proven on HL-1: a hand-rolled "<subId>-TL for every row" plan produced
// 13 collisions, because failure conditions share sub-functions. The generator
// must ask the project's numbering engine for each target so the {PARENT}-{MODE}
// scheme AND its ordinal collision guard (TL → TL2) do the work.
console.log('\n[renumber] plan generator');
{
  seed();
  // A minimal stand-in for the numbering engine, wired the way the real one is
  // called: fill a BLANK field from PARENT/MODE, and consult existsFn to walk
  // the ordinal suffix. The generator must USE this, never bypass it.
  let engineCalls = 0;
  globalThis._slFillField = function (kind, field, data, ctx, existsFn) {
    engineCalls++;
    let mode = String(ctx.MODE), cand = ctx.PARENT + '-' + mode, n = 2;
    while (typeof existsFn === 'function' && existsFn(cand) && n < 50) { cand = ctx.PARENT + '-' + mode.replace(/\d+$/, '') + n; n++; }
    data[field] = cand;
  };
  globalThis.acFcimData = [
    { internalId: 60, subId: 'SF-01', tlId: 'FC-01', tlDesc: 'total loss', plId: 'SF01-PL', plDesc: 'partial', mId: 'FC-02', mDesc: 'malfunction' },
    { internalId: 61, subId: 'SF-01', awareness: 'Unaware', tlId: 'FC-03', tlDesc: 'total loss undetected' },
    { internalId: 62, subId: 'SF-02', tlId: 'FC-04', tlDesc: 'other function' }
  ];
  globalThis.acFhaData = [
    { internalId: 70, fcId: 'FC-01', subId: 'SF-01', severity: 'Catastrophic' },
    { internalId: 71, fcId: 'SF01-PL', subId: 'SF-01', severity: 'Major' },
    { internalId: 72, fcId: 'FC-02', subId: 'SF-01', severity: 'Hazardous' },
    { internalId: 73, fcId: 'FC-03', subId: 'SF-01', severity: 'Catastrophic' },
    { internalId: 74, fcId: 'FC-04', subId: 'SF-02', severity: 'Major' },
    { internalId: 75, fcId: 'ORPHAN-9', subId: 'SF-09', severity: 'Minor' }
  ];
  globalThis.acReqData = [{ internalId: 80, traceId: 'FC-03', text: 'r' }];
  const plan = M.renumberPlanFromScheme();
  check('the generator ASKS THE ENGINE for every target (never mints its own)',
    plan.ok && engineCalls === 5, 'engine calls: ' + engineCalls);
  check('each cell maps to {PARENT}-{MODE}',
    plan.mapping['FC-01'] === 'SF-01-TL' && plan.mapping['SF01-PL'] === 'SF-01-PL' && plan.mapping['FC-02'] === 'SF-01-M',
    JSON.stringify(plan.mapping));
  check('a SECOND row on the same sub-function takes the ordinal suffix, not a collision',
    plan.mapping['FC-03'] === 'SF-01-TL2', JSON.stringify(plan.mapping));
  check('a different sub-function numbers independently', plan.mapping['FC-04'] === 'SF-02-TL');
  check('an FHA fcId no FCIM cell accounts for is NAMED, never silently dropped',
    plan.unmapped.length === 1 && plan.unmapped[0] === 'ORPHAN-9');
  check('the generator writes nothing — the FCIM still holds its original ids',
    acFcimData[0].tlId === 'FC-01' && acFcimData[1].tlId === 'FC-03');
  // THE POINT OF THE WHOLE EXERCISE:
  const pre = M.renumberPreview('fcId', plan.mapping);
  check('the ENGINE-DERIVED plan previews with ZERO collisions (the hand-rolled one had 13)',
    pre.ok && pre.totals.collisions === 0 && pre.safeToApply === true, JSON.stringify(pre.totals));
  check('…and renumberPlanPreview does generate-then-preview in one call',
    (() => { const c = M.renumberPlanPreview(); return c.ok && c.totals.collisions === 0 && !!c.plan; })());
  // applied end to end
  const res = M.renumberApply('fcId', plan.mapping);
  check('applying the generated plan renames owners AND carries the FCIM cells with them',
    res.ok && res.failed === 0 &&
    acFhaData.find(f => f.internalId === 70).fcId === 'SF-01-TL' &&
    acFcimData[0].tlId === 'SF-01-TL' && acFcimData[1].tlId === 'SF-01-TL2',
    JSON.stringify(res.steps));
  check('…and a requirement trace followed too', acReqData[0].traceId === 'SF-01-TL2');
  check('no legacy id survives anywhere in the stores',
    !JSON.stringify([acFhaData, acFcimData, acReqData]).match(/FC-0[1-4]|SF01-PL/));
  check('the generator REFUSES when the numbering engine is absent, rather than inventing a scheme',
    (() => { const keep = globalThis._slFillField; delete globalThis._slFillField;
             const r = M.renumberPlanFromScheme(); globalThis._slFillField = keep;
             return !r.ok && /numbering engine/.test(r.reason); })());
  check('cell multiplicity is COUNTED and reported, not quietly skipped',
    (() => { acFcimData[0].plExtra = [{ desc: 'x' }, { desc: 'y' }];
             const p2 = M.renumberPlanFromScheme();
             return p2.extras === 2 && /NOT included/.test(p2.note); })(),
    'an extra condition silently skipped would keep a legacy id forever');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
