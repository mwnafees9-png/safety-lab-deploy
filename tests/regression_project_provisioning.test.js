#!/usr/bin/env node
/*
 * Regression — provisioning a cloud project must be idempotent under concurrency.
 *
 * Creating the project row is a check-then-insert: _activeCloudProjectId is only
 * assigned once the insert round-trip resolves, so every caller arriving while
 * that request is in flight also reads null and inserts its own row.
 *
 * On 31 Jul 2026 a real user's FIRST session produced twelve copies of the K350
 * showcase, seven of them minted inside a 44 ms window. No human clicks that
 * fast, and no single serialised path is that fast either — it was concurrent
 * callers racing an unlocked insert. That user's workspace was junk on day one,
 * and the same thing would have happened to the pilot seats.
 *
 * This suite drives the real lock from helpers_modules.js against a fake client
 * with realistic latency, and asserts one row for N concurrent callers.
 *
 * Run: node tests/regression_project_provisioning.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const helpers = S('helpers_modules.js');
const sync    = S('cloud_sync.js');
const picker  = S('demo_picker.js');

// ---- the lock exists and every path uses it --------------------------------
check('helpers_modules.js defines the provisioning lock',
  /_cloudProjectCreateLock/.test(helpers) && /async function _ensureCloudProject/.test(helpers));
check('the lock is exported for cloud_sync', /window\._slEnsureCloudProject\s*=\s*_ensureCloudProject/.test(helpers));
check('saveProjectToCloud provisions through the lock',
  /projectId = await _ensureCloudProject\(/.test(helpers));
check('cloud_sync provisions through the lock',
  /await ensure\(client, ws, name, certBasis, uid\)/.test(sync));

// Exactly one inline insert into projects may remain — the one inside the lock.
const inlineInserts = (helpers + sync).match(/\.from\('projects'\)\s*\n?\s*\.insert\(/g) || [];
check('only the lock inserts into projects', inlineInserts.length === 1,
  inlineInserts.length + ' insert sites found; a second one reopens the race');

// ---- every demo loader detaches the cloud identity --------------------------
// A loader missing from the detach list provisions a row the moment its
// showcase is opened, because the applied demo looks like real dirty content.
const loaders = [...picker.matchAll(/loader:\s*'([^']+)'/g)].map(m => m[1]);
check('demo_picker exposes at least four demos', loaders.length >= 4, loaders.join(', '));
const detachList = (sync.match(/_DEMO_LOADERS\s*=\s*\[([^\]]*)\]/) || [, ''])[1];
loaders.forEach(l => check('cloud_sync detaches after ' + l, detachList.indexOf("'" + l + "'") >= 0,
  'add it to _DEMO_LOADERS or opening that demo mints a junk project'));

// ---- behavioural: N concurrent callers, one row ----------------------------
// Run the real _ensureCloudProject source against a fake Supabase client.
const src = (helpers.match(/let _cloudProjectCreateLock[\s\S]*?\n\}\n/) || [])[0];
check('the lock body was located for execution', !!src);

if (src) {
  let inserts = 0;
  const client = {
    from() {
      return {
        insert() {
          inserts++;
          return { select() { return { single() {
            // realistic round-trip: resolve on a later macrotask
            return new Promise(res => setTimeout(() => res({ data: { id: 'proj-' + inserts }, error: null }), 25));
          } }; } };
        },
      };
    },
  };
  const ctx = { _activeCloudProjectId: null, _activeCloudDocVersion: null, window: {}, setTimeout, console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'lock.js' });

  (async () => {
    // Twelve callers fired in the same tick — the shape that produced the incident.
    const ids = await Promise.all(
      Array.from({ length: 12 }, () => ctx._ensureCloudProject(client, 'ws', 'K350', 'part-23', 'u1')));
    check('twelve concurrent callers insert exactly one row', inserts === 1, inserts + ' rows inserted');
    check('every caller receives the same project id',
      new Set(ids).size === 1 && ids[0] === 'proj-1', JSON.stringify([...new Set(ids)]));
    check('the id is cached for later callers', ctx._activeCloudProjectId === 'proj-1');

    // A later, separate caller must not insert again.
    const again = await ctx._ensureCloudProject(client, 'ws', 'K350', 'part-23', 'u1');
    check('a subsequent caller reuses the cached row', inserts === 1 && again === 'proj-1');

    // After a failure the lock must clear so the next attempt can retry.
    ctx._activeCloudProjectId = null;
    let attempts = 0;
    const failing = { from() { return { insert() { attempts++; return { select() { return { single() {
      return new Promise(res => setTimeout(() => res({ data: null, error: new Error('network') }), 5));
    } }; } }; } }; } };
    await ctx._ensureCloudProject(failing, 'ws', 'n', 'b', 'u1').catch(() => {});
    await ctx._ensureCloudProject(failing, 'ws', 'n', 'b', 'u1').catch(() => {});
    check('a failed provision releases the lock for a retry', attempts === 2,
      attempts + ' attempts — the lock is stuck after an error');

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exitCode = fail ? 1 : 0;
  })();
} else {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = 1;
}
