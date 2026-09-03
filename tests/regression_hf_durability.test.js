// regression_hf_durability.test.js — a project whose authored work is HF survives a refresh.
//
// Waqas, 2 Sep 2026: "I refreshed the project after previous deploy and it lost the data,
// that shouldn't be happening we should be able to refresh where we left off."
//
// ROOT CAUSE, censused not guessed. `_autosaveHasContent(parsed)` — the predicate
// checkAutosaveRecovery() gates on with `if (!_autosaveHasContent(parsed)) return false`
// — looked only at four TOP-LEVEL stores: acFhaData, acReqData, ftaPages, systemsData.
// The nine HF lanes store under projectConfig.hf.<lane>.rows. So a project whose authored
// work was HF (179 drafted rows, in his case) was judged EMPTY: the payload held the data
// (projectConfig IS snapshotted and restored), but recovery declared it nothing and bailed
// without rehydrating, and the blank in-memory state then autosaved over the good payload.
// The storage was never the problem; the emptiness test was blind to where HF lives.
//
// THE FIX IS MONOTONICALLY SAFE. Widening the predicate can only make recovery RUN and the
// empty-overwrite refusal FIRE in more cases, never fewer — it cannot cause a wipe. This
// suite proves (1) the four historical top-level cases are unchanged, (2) an HF-only
// project — and a RAM/MMEL/Markov-only project — now counts as content, and (3) a genuinely
// blank project still counts as empty so the guard against clobbering a good copy with a
// blank one is intact. Executed against the REAL predicate, not a reimplementation.
//
// SCOPE, stated honestly: this fixes the LOCAL autosave/recovery path, which is what the
// refresh hit. cloud_sync.js has the same blind spot in _hasRealContent / _contentItems,
// and _contentItems is documented as mirroring a Supabase function (public.sl_doc_items);
// that server twin is not readable from here, so the cloud path is flagged for a decision
// rather than half-changed. See the handoff note.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const helpersSrc = fs.readFileSync(path.join(ROOT, 'site/helpers_modules.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? ('\n       ' + extra) : '')); }
}
console.log('\nregression_hf_durability — refresh where we left off, for HF-authored projects\n');

// lift the two functions the fix touches, into a sandbox, and RUN them
function lift(name) {
    const m = helpersSrc.match(new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}'));
    if (!m) throw new Error('could not lift ' + name);
    return m[0];
}
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(lift('_projectConfigHasAuthoredContent') + '\n' + lift('_autosaveHasContent'), ctx);
const has = doc => vm.runInContext('_autosaveHasContent(' + JSON.stringify(doc) + ')', ctx);

// ---- the historical top-level cases are unchanged --------------------------
ok('an FHA-bearing project still counts as content', has({ acFhaData: [{ id: 1 }] }) === true);
ok('an acReq-bearing project still counts', has({ acReqData: [{ id: 1 }] }) === true);
ok('a rooted fault tree still counts', has({ ftaPages: [{ root: { id: 'g' } }] }) === true);
ok('a system still counts', has({ systemsData: [{ id: 's1' }] }) === true);
ok('a genuinely blank project still counts as EMPTY', has({ projectName: 'Untitled Project', acFhaData: [], acReqData: [], ftaPages: [{ root: null }], systemsData: [] }) === false);
ok('null / undefined never throws and is empty', has(null) === false && has(undefined) === false);

// ---- the bug: HF-only projects, lane by lane -------------------------------
const hfOnly = lane => ({ projectName: 'Aeolus', acFhaData: [], acReqData: [], ftaPages: [{ root: null }], systemsData: [],
    projectConfig: { hf: { [lane]: { rows: [{ id: 'X-1' }] } } } });
['tid', 'alloc', 'tasks', 'hea', 'alerts', 'ergo', 'cd', 'sa', 'mfc'].forEach(lane => {
    ok('an HF-only project (' + lane + ' has rows) now counts as content', has(hfOnly(lane)) === true);
});
ok('the 179-row shape he actually had (Task Identification populated) counts',
    has({ projectConfig: { hf: { tid: { rows: new Array(44).fill(0).map((_, i) => ({ taskId: 'TSK-' + i })) } } } }) === true);
ok('an MFC determination with no lane rows still counts (the six functions are fixed by the rule)',
    has({ projectConfig: { hf: { mfc: { rows: [], conclusion: { minCrew: '2', rationale: 'x' } } } } }) === true);
ok('empty HF lanes do NOT count — no rows is still empty',
    has({ projectConfig: { hf: { tid: { rows: [] }, cd: { rows: [] } } } }) === false);

// ---- the rest of the nested-authored class ---------------------------------
ok('a RAM-prediction-only project counts', has({ projectConfig: { ram: { predict: { rows: [{ cat: 'diode' }] } } } }) === true);
ok('a RAM-FRACAS-only project counts', has({ projectConfig: { ram: { field: [{ id: 'FRC-1' }] } } }) === true);
ok('an MMEL-only project counts', has({ projectConfig: { mmel: { items: [{ id: 'MMEL-1' }] } } }) === true);
ok('a Markov-only project counts', has({ projectConfig: { markovModels: [{ id: 'M1', states: [] }] } }) === true);
ok('a projectConfig with only settings (no authored lanes) is still empty',
    has({ projectConfig: { piQ: 1, piE: 1, markovModels: [], interfaces: [], customLibrary: {} } }) === false);

// ---- the wiring, so the fix is actually in the shipped recovery gate -------
ok('the fix is documented at the predicate with the report verbatim', /refreshed the project after previous\s*\n\/\/ deploy and it lost the data/.test(helpersSrc));
ok('the monotonic-safety argument is recorded', /MONOTONICALLY SAFE for data/.test(helpersSrc));
ok('_autosaveHasContent now consults the nested probe', /_projectConfigHasAuthoredContent\(parsed\.projectConfig\)/.test(helpersSrc));
ok('the nested probe walks all nine HF lanes', (() => {
    const b = (helpersSrc.match(/function _projectConfigHasAuthoredContent[\s\S]*?\n\}/) || [''])[0];
    return ['tid', 'alloc', 'tasks', 'hea', 'alerts', 'ergo', 'cd', 'sa', 'mfc'].every(l => b.indexOf("'" + l + "'") >= 0);
})());
ok('checkAutosaveRecovery still gates on the predicate (fix is on the path that bailed)', (() => {
    const dops = fs.readFileSync(path.join(ROOT, 'site/data_ops_modules.js'), 'utf8');
    return /if \(!_autosaveHasContent\(parsed\)\) return false;/.test(dops);
})());

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
