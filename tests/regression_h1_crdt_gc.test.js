#!/usr/bin/env node
/*
 * Regression — H-1: the CRDT IndexedDB leak, and the rules that keep its
 * collector from becoming a data-loss defect.
 *
 * crdt_sync creates one IndexedDB database per project ever opened and never
 * removes any. ~360 of them were measured on Waqas's machine on 31 Aug 2026.
 *
 * Every one of those databases is an OFFLINE COPY OF SOMEONE'S WORK — that is
 * the entire point of the local persistence layer. So the collector's real
 * contract is not "free disk"; it is "never remove a doc that might be the only
 * copy". These checks run the REAL classify() over constructed worlds and
 * assert the verdict for each, including the fail-safe branches, because the
 * failure mode being guarded against is silent and permanent.
 *
 * Run: node tests/regression_h1_crdt_gc.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const SRC  = fs.readFileSync(path.join(SITE, 'crdt_gc.js'), 'utf8');
const SYNC = fs.readFileSync(path.join(SITE, 'crdt_sync.js'), 'utf8');
const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

// Load the real module.
const store = {};
const ctx = {
  console: { info() {}, warn() {}, error() {}, log() {} },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  location: { search: '' },
  indexedDB: undefined,
  addEventListener() {}, setTimeout() {}, Date, JSON, Promise, Object, Array, String, Math
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(SRC, ctx);
const GC = ctx.SafetyLabCRDTGC;
check('the module exports a public surface', !!GC && typeof GC.classify === 'function' && typeof GC.note === 'function');

const DAY = 86400000, NOW = 1788180000000;
const OLD = NOW - 60 * DAY, RECENT = NOW - 2 * DAY;
const docs = ids => ids.map(id => ({ db: 'slab-crdt-' + id, project: id }));
const verdict = (rows, id) => (rows.find(r => r.project === id) || {}).verdict;
const why     = (rows, id) => (rows.find(r => r.project === id) || {}).why;

// ---------------------------------------------------------------------------
console.log('[h1] 1 — the four conditions that must ALL hold before a doc is dropped');
{
  const accessible = { live: 1, idle: 1, dirty: 1, fresh: 1 };
  const ledger = {
    idle:   { t: OLD,    s: OLD + 1000 },   // server caught up, long untouched  -> drop
    dirty:  { t: OLD,    s: OLD - 1000 },   // server BEHIND the local doc       -> keep
    fresh:  { t: RECENT, s: RECENT + 10 },  // synced but recent                 -> keep
    live:   { t: OLD,    s: OLD + 1000 },   // would qualify, but it is open     -> keep
  };
  const rows = GC.classify(docs(['live', 'idle', 'dirty', 'fresh', 'gone']), accessible, ledger, 'live', NOW);

  check('a synced, long-untouched doc is dropped', verdict(rows, 'idle') === 'drop', why(rows, 'idle'));
  check('a doc with unconfirmed local edits is KEPT', verdict(rows, 'dirty') === 'keep', why(rows, 'dirty'));
  check('a recently touched doc is KEPT even though it is synced', verdict(rows, 'fresh') === 'keep', why(rows, 'fresh'));
  check('the project currently open is KEPT whatever else is true', verdict(rows, 'live') === 'keep', why(rows, 'live'));
  check('a doc for a project this account cannot reach is dropped', verdict(rows, 'gone') === 'drop', why(rows, 'gone'));
  // H-7 interaction: archiving a project removes it from this account's project
  // list, so "inaccessible" now also means "archived and restorable". A doc
  // touched recently must survive that, or archiving quietly discards offline work.
  {
    const recentGone = GC.classify(docs(['justarchived']), { other: 1 },
                                   { justarchived: { t: RECENT, s: RECENT + 5 } }, null, NOW);
    check('a RECENTLY touched doc whose project just became inaccessible is KEPT',
          verdict(recentGone, 'justarchived') === 'keep', why(recentGone, 'justarchived'));
    check('...and says it may be an archived project awaiting restore',
          /awaiting restore/.test(why(recentGone, 'justarchived')));
    const oldGone = GC.classify(docs(['longgone']), { other: 1 },
                                { longgone: { t: OLD, s: OLD + 5 } }, null, NOW);
    check('but one inaccessible for over the retention window is still dropped',
          verdict(oldGone, 'longgone') === 'drop', why(oldGone, 'longgone'));
  }
  check('...and it says WHY, so the console line is auditable', /never be pushed/.test(why(rows, 'gone')));
}

// ---------------------------------------------------------------------------
console.log('[h1] 2 — the fail-safes. These are the checks that matter.');
{
  const ledger = { a: { t: OLD, s: OLD + 1 }, b: { t: OLD, s: OLD + 1 } };

  // Rule 4: no project list -> classify NOTHING. Without this, a failed query
  // makes every project look inaccessible and the collector eats the machine.
  const blind = GC.classify(docs(['a', 'b']), null, ledger, null, NOW);
  check('project list unavailable -> nothing is dropped', blind.every(r => r.verdict === 'unknown'), JSON.stringify(blind.map(r => r.verdict)));
  check('...and it is reported as UNKNOWN, not silently as keep', blind.every(r => /unavailable/.test(r.why)));

  // An EMPTY list is the same hazard wearing a different hat, and is turned
  // into null upstream — pinned here at the boundary it protects.
  check('_accessibleProjects returns null for an empty result set, never {}',
        /Array\.isArray\(res\.data\)\s*\|\|\s*res\.data\.length === 0\)\s*return null|res\.data\.length === 0\) return null/.test(SRC));

  // A doc that predates the ledger has no evidence either way.
  const noLedger = GC.classify(docs(['old1']), { old1: 1 }, {}, null, NOW);
  check('a doc with no ledger entry is KEPT — absence of evidence is not evidence of a sync',
        verdict(noLedger, 'old1') === 'keep', why(noLedger, 'old1'));
  check('...and says so', /predates the ledger/.test(why(noLedger, 'old1')));
}

// ---------------------------------------------------------------------------
console.log('[h1] 3 — disarmed by default: a survey removes nothing');
{
  check('the collector is off unless explicitly armed', GC.armed() === false);
  check('arming is a deliberate flag, not a default', /SLA_CRDT_GC/.test(SRC) && /crdtgc=1/.test(SRC));
  check('deleteDatabase is only reachable past the armed gate',
        /if \(!s\.armed \|\| !drop\.length\) return s;[\s\S]{0,400}_delete\(/.test(SRC));
  check('a doc held open by another tab is skipped, never forced', /onblocked[\s\S]{0,60}res\(false\)/.test(SRC));
}

// ---------------------------------------------------------------------------
console.log('[h1] 4 — the ledger is actually written by crdt_sync');
{
  check('local updates mark `t`', /SafetyLabCRDTGC\.note\(_projId, 't'\)/.test(SYNC));
  check('a confirmed server upsert marks `s`', /SafetyLabCRDTGC\.note\(pid, 's'\)/.test(SYNC));
  check('an upsert that RESOLVED WITH AN ERROR does not mark `s` — supabase-js resolves on REST errors',
        /if \(res && res\.error\) return;/.test(SYNC));
  check('crdt_gc loads BEFORE crdt_sync, or the first update has no hook',
        HTML.indexOf('crdt_gc.js?v=') > 0 && HTML.indexOf('crdt_gc.js?v=') < HTML.indexOf('crdt_sync.js?v='));
}

// ---------------------------------------------------------------------------
console.log('[h1] 5 — note() records what it claims to');
{
  GC.note('proj-x', 't');
  const l = JSON.parse(store['safetyLab.crdt.docs.v1']);
  check('note() persists a timestamp under the project id', l['proj-x'] && typeof l['proj-x'].t === 'number');
  GC.note('proj-x', 's');
  const l2 = JSON.parse(store['safetyLab.crdt.docs.v1']);
  check('a second field merges rather than replacing the entry', l2['proj-x'].t && l2['proj-x'].s);
  GC.note('proj-x', 'nonsense');
  const l3 = JSON.parse(store['safetyLab.crdt.docs.v1']);
  check('an unknown field is ignored', Object.keys(l3['proj-x']).sort().join(',') === 's,t');
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
