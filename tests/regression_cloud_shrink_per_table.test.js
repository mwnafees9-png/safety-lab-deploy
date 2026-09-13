#!/usr/bin/env node
/*
 * Regression — the cloud shrink guard is PER TABLE (13 Sep 2026, R18).
 *
 * The 20 Aug guard refuses a cloud save when the whole project collapses below 20% of
 * what was last shipped. On 13 Sep a project with 18 functions and 32 FCIM rows lost all
 * 184 FHA rows to a sync race: 50 of 234 items = 21% — the guard passed and the empty FHA
 * table was written over the good one. Now any single table that drops from 10+ rows to
 * under a fifth of what we shipped is refused and NAMED, whatever the total says.
 *
 * Pinned on the real cloud_sync.js functions (extracted, run in a vm):
 *   G1  the 13 Sep numbers: total guard passes, per-table guard refuses acFhaData 184 -> 0
 *   G2  the floor: a table that never had 10 rows is not judged (9 -> 0 passes)
 *   G3  the ratio: 184 -> 40 (21.7%) passes, 184 -> 36 (19.6%) is refused
 *   G4  the baselines reset together on a rebase / identity drop
 *   G5  the refusal names the table in plain words
 *   G6  mutation: the per-table comparison disabled -> G1 goes red
 *
 * Run: node tests/regression_cloud_shrink_per_table.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'cloud_sync.js'), 'utf8');

function slice(src, startMarker, endMarker) { const a = src.indexOf(startMarker), b = src.indexOf(endMarker, a); if (a < 0 || b < 0) throw new Error('markers: ' + startMarker); return src.slice(a, b); }
function boot(src) {
  src = src || SRC;
  const part = slice(src, 'var _CONTENT_KEYS =', '    // ---- the push ---');
  const ctx = { console, Array, Object, String, Math, JSON };
  vm.createContext(ctx);
  vm.runInContext(part + '\n globalThis.api = { counts: _countsByTable, gut: _gutTable, wouldGut: _wouldGut, items: _contentItems, label: _tableLabel, setLast: function (byTable, items) { _lastPushedByTable = byTable; _lastPushedItems = items; }, drop: function () { _lastPushedByTable = null; _lastPushedItems = null; }, last: function () { return { byTable: _lastPushedByTable, items: _lastPushedItems }; } };', ctx);
  return ctx.api;
}
const snap = (fn, fcim, fha) => ({ acFunctionsData: new Array(fn).fill({}), acFcimData: new Array(fcim).fill({}), acFhaData: new Array(fha).fill({}) });

console.log('[G1] the 13 Sep numbers');
{
  const api = boot();
  const shipped = snap(18, 32, 184);
  api.setLast(api.counts(shipped), api.items(shipped));
  const after = snap(18, 32, 0);
  check('the total guard passes (50 of 234 = 21%) — this is how the wipe reached the cloud', api.wouldGut(after) === false);
  const g = api.gut(after);
  check('the per-table guard refuses: acFhaData 184 -> 0', !!g && g.key === 'acFhaData' && g.from === 184 && g.to === 0, JSON.stringify(g));
}
console.log('\n[G2] the floor');
{
  const api = boot();
  const shipped = snap(18, 32, 9); api.setLast(api.counts(shipped), api.items(shipped));
  check('a table that never reached 10 rows is not judged (9 -> 0 passes)', api.gut(snap(18, 32, 0)) === null);
}
console.log('\n[G3] the ratio');
{
  const api = boot();
  const shipped = snap(18, 32, 184); api.setLast(api.counts(shipped), api.items(shipped));
  check('184 -> 40 (21.7%) passes', api.gut(snap(18, 32, 40)) === null);
  const g = api.gut(snap(18, 32, 36));
  check('184 -> 36 (19.6%) is refused', !!g && g.to === 36);
  check('growth is never refused', api.gut(snap(18, 32, 400)) === null);
}
console.log('\n[G4] baselines reset together');
{
  const api = boot();
  const shipped = snap(18, 32, 184); api.setLast(api.counts(shipped), api.items(shipped));
  api.drop();
  check('after a rebase nothing is judged (a demo/sample load legitimately replaces everything)', api.gut(snap(1, 1, 0)) === null && api.last().byTable === null);
  check('the source resets both baselines on identity drop and on __slCloudSyncRebase', /_lastPushedItems = null; _lastPushedByTable = null;/.test(SRC) && /__slCloudSyncRebase = function \(\) \{ _lastPushedItems = null; _lastPushedByTable = null; \}/.test(SRC));
}
console.log('\n[G5] the refusal names the table');
{
  const api = boot();
  check('plain-language label for the FHA table', api.label('acFhaData') === 'aircraft FHA' && api.label('acReqData') === 'requirements');
  check('the push path refuses on either guard and the toast names the table', /var gutTable = _wouldGut\(snap\) \? null : _gutTable\(snap\);\s*if \(_wouldGut\(snap\) \|\| gutTable\)/.test(SRC) && /one table \(' \+ _tableLabel\(gutTable\.key\) \+ '\)/.test(SRC));
  check('a refused push never records new baselines (the write returns null before snapByTable is set)', SRC.indexOf('snapItems = _contentItems(snap); snapByTable = _countsByTable(snap);') > SRC.indexOf('if (_wouldGut(snap) || gutTable)'));
}
console.log('\n[G6] mutation');
{
  const mut = SRC.replace('if (was >= 10 && is < was * 0.2) return { key: k, from: was, to: is };', 'if (false) return { key: k, from: was, to: is };');
  check('mutation applied', mut !== SRC);
  const api = boot(mut); const shipped = snap(18, 32, 184); api.setLast(api.counts(shipped), api.items(shipped));
  check('G1 goes red under the mutation (the wipe passes again)', api.gut(snap(18, 32, 0)) === null);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
