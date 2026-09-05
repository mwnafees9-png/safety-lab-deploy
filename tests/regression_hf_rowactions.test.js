// regression_hf_rowactions.test.js — AFHA-style row actions + the Function
// Allocation data actions.
//
// Waqas, 2 Sep 2026: "make sure the tabs have CRUD and review capabilities, data
// actions, for everything that has already shipped and AFHA style actions."
//
// Two things ship here and this file pins both.
//
// 1. THE ROW KEBAB. Every HF lane carried a bare "remove" link. The worksheets
//    carry rowActionsHTML's kebab, and the difference is not cosmetic: mass_actions.js
//    identifies rows by parsing the delete handler out of the action cell, so a lane
//    without one can never take a batch action. The HF kebab emits the same wrapper,
//    the same trigger and the same ram-danger delete, and adds Duplicate and Traces.
//
// 2. FUNCTION ALLOCATION EXPORT/IMPORT — the one lane that had shipped with no data
//    actions at all. Its rows are keyed to the LIVE functions lane, so export walks
//    the functions (an unallocated line exports blank, because that gap is the whole
//    finding) and import MATCHES rather than appends, refusing by name any sub-function
//    that is not in the lane.

const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');

// Version pins are DOTTED VERSIONS, not decimals. parseFloat('1.10') is 1.1, which
// compares as OLDER than 1.9 — so a float comparison calls a freshly bumped module
// stale and fails the wall for no reason (hit 2 Sep 2026 when hf_analyses went 1.9 -> 1.10).
// Compare segment by segment, and compare a FLOOR: a version moves for any reason that
// touches the file, and a wall that fails on a routine bump teaches people to edit the
// test instead of reading it. The floor still catches the real error — a changed module
// shipped behind a stale pin.
function pinAtLeast(html, file, floor) {
    const m = html.match(new RegExp(file.replace(/\./g, '\\.') + '\\.js\\?v=([\\d.]+)'));
    if (!m) return false;
    const a = m[1].split('.').map(Number), b = String(floor).split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] || 0, y = b[i] || 0;
        if (x !== y) return x > y;
    }
    return true;
}

// Header version as a FLOOR, compared segment-wise. An equality pin (or an alternation
// of the two versions that happened to exist the day it was written) fails on a correct
// bump, which teaches people to edit the test instead of reading it — and 1.10 is not
// less than 1.9, however parseFloat feels about it.
function headerAtLeast(src, file, floor) {
    const m = src.match(new RegExp(file.replace(/\./g, '\\.') + '\\.js\\s+—\\s+v([\\d.]+)'));
    if (!m) return false;
    const a = m[1].split('.').map(Number), b = String(floor).split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] || 0, y = b[i] || 0;
        if (x !== y) return x > y;
    }
    return true;
}
let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra ? ('\n       ' + extra) : '')); }
}

console.log('\nregression_hf_rowactions — AFHA-style actions across the HF lanes\n');

const src = R('site/hf_analyses.js');
const ops = R('site/data_ops_modules.js');
const idx = R('site/index.html');

// ------------------------------------------------------------ the kebab
ok('module version at or past 1.9 (the release row actions shipped in)', headerAtLeast(src, 'hf_analyses', '1.9'));
ok('lane registry defines the seven row-bearing lanes', /var _HF_LANES = \{/.test(src) &&
    ['tid', 'tasks', 'hea', 'alerts', 'ergo', 'cd', 'sa'].every(l => new RegExp('\\n\\s+' + l + ':\\s+\\{ id:').test(src)));
ok('defines deleteRow', /function deleteRow\(lane, id\)/.test(src));
ok('defines duplicateRow', /function duplicateRow\(lane, id\)/.test(src));
ok('defines the action-cell builder', /function _hfActions\(lane, kind, id\)/.test(src));

ok('kebab uses the shared wrapper class', /'<div class="row-actions">'/.test(src));
ok('kebab uses the shared trigger + positioner', /class="row-kebab"[^']*onclick="toggleRowMenu\(event\)"/.test(src));
ok('kebab uses the shared menu container', /'<div class="row-action-menu" role="menu">'/.test(src));
ok('delete carries the shared danger class', /class="ram-danger"/.test(src));
ok('menu offers Duplicate', /⧉ Duplicate<\/button>/.test(src));
ok('menu offers Traces to \/ Used by', /⇋ Traces to \/ Used by<\/button>/.test(src));
// 2 Sep 2026 (table refactor) — Waqas: "instead of in table editing I want editing in a
// modal see how it was done in the FHAs, and we will need the same kebab here." Edit now
// LEADS the menu, as it does on every worksheet, because the cells are text and the modal
// is where editing happens. The earlier pin ("no Edit item — HF lanes edit in place") was
// right for the in-place design and is superseded here, not deleted silently.
ok('Edit leads the menu, opening the modal', /✎ Edit<\/button>/.test(src) && /HF_ANALYSES\.openHfEdit\(/.test(src));
ok('why Edit is now present is recorded', /EDIT IS NOW THE FIRST ITEM/.test(src));
ok('the modal exists and saves through the lane setters', /function openHfEdit\(lane, id\)/.test(src) && /function saveHfEdit\(\)/.test(src) &&
    /API\[cfg\.save\.fn\]\(idx, c\.k, v\)/.test(src));
ok('no lane builds an in-cell input any more', !/onchange="HF_ANALYSES\.set(Tid|Task|Hea|Alert|Ergo|Cd|Sa|Alloc)\(/.test(src));
ok('keyed lanes get Edit and Traces but nothing destructive', /\(fixed \? '' : '<button type="button" role="menuitem" class="ram-danger"/.test(src));

// the bare remove link is gone from every lane
ok('no lane still renders a bare remove link', !/remove<\/a>/.test(src));
// The action cell is emitted ONCE, by the generic table builder, for every lane in the
// schema — the seven hand-placed calls this pinned before are gone, and that is the
// point of the refactor. What is pinned now is that the builder emits it and that every
// lane declares the review kind the cell is built with.
ok('the generic table emits the action cell first', /'<td>' \+ _hfActions\(lane, cfg\.kind, id\) \+ '<\/td>'/.test(src));
const schemaSrc = (src.match(/var HF_SCHEMA = \{[\s\S]*?\n    \};/) || [''])[0];
[['tid', 'hfTid'], ['tasks', 'hfTask'], ['hea', 'hfHea'], ['alerts', 'hfAlerts'],
 ['ergo', 'hfErgo'], ['cd', 'hfCd'], ['sa', 'hfSa'], ['alloc', 'hfAlloc'], ['mfc', 'hfMfc']].forEach(([lane, kind]) => {
    ok(lane + ' lane declares review kind ' + kind + ' in the schema',
        new RegExp("\\n        " + lane + ": \\{[\\s\\S]*?kind: '" + kind + "'").test(schemaSrc));
});

// ---------------------------------------------------- delete-by-id doctrine
ok('delete is addressed by id, never by index', /var i = _laneIndexOf\(lane, id\)/.test(src));
ok('the id-not-index choice is reasoned in the comment', /a row survives a re-render and a\s*\/\/ position does not/.test(src));
ok('per-row confirm is suppressible for a batch', /window\.__hfBatchDelete/.test(src));
ok('the batch contract matches the worksheets', /Same contract as the worksheets/.test(src));
ok('duplicate refuses to carry the credited assumption', /if \('asmId' in copy\) copy\.asmId = '';/.test(src));
ok('the double-count reasoning is recorded', /quietly double-count it/.test(src));
ok('duplicate lands directly below its original', /st\.rows\.splice\(i \+ 1, 0, copy\)/.test(src));
ok('both actions exported on the API', /deleteRow: deleteRow, duplicateRow: duplicateRow, _HF_LANES: _HF_LANES/.test(src));

// ------------------------------------------- function allocation data actions
ok('alloc export case exists', /case 'HF_FunctionAllocation': \{/.test(ops));
ok('alloc export walks the live functions lane', /const fns = HX\._functions\(\);/.test(ops));
ok('alloc export emits every sub-function, allocated or not', /an unallocated row exporting/.test(ops));
ok('alloc export header', /\['Sub-function','Name','Allocated to','Rationale'\]/.test(ops));
ok('alloc import matches rather than appends', /HX\.setAllocBySubId\(sub, alloc, getValue\(row, \['Rationale'\]\)\)/.test(ops));
ok('alloc is deliberately kept out of the generic rows store', /HF_FunctionAllocation is deliberately absent/.test(ops));
ok('unmatched sub-functions are collected', /_allocMisses\.push\(sub\)/.test(ops));
ok('unmatched sub-functions are named to the user, not swallowed', /were refused rather than orphaned/.test(ops));
ok('alloc import re-renders the lane', /HX\.renderAlloc === 'function'\) HX\.renderAlloc\(\)/.test(ops));
ok('setAllocBySubId is exported', /setAllocBySubId: setAllocBySubId/.test(src));
ok('setAllocBySubId refuses an unknown sub-function', /if \(!fn\) return false;/.test(src));
ok('alloc lane renders an Import button', /triggerCSVImport\(\\'HF_FunctionAllocation\\'\)/.test(src));
ok('alloc lane renders an Export button', /exportData\(\\'HF_FunctionAllocation\\', \\'csv\\'\)/.test(src));

ok('index: hf_analyses cache-bust bumped', pinAtLeast(idx, 'hf_analyses', '1.8'));
ok('index: data_ops cache-bust bumped', pinAtLeast(idx, 'data_ops_modules', '66.31'));

// --------------------------------------------------------------- behaviour
(function behaviour() {
    global.window = undefined; global.document = undefined;
    global.projectConfig = { hf: {} };
    global.scheduleAutosave = function () {};
    let API;
    try {
        delete require.cache[require.resolve(path.join(SITE, 'site/hf_analyses.js'))];
        API = require(path.join(SITE, 'site/hf_analyses.js'));
    } catch (e) { ok('module loads headless', false, e.message); return; }
    ok('module loads headless', typeof API.duplicateRow === 'function' && typeof API.deleteRow === 'function');

    API.addCd(); API.addCd();
    API.setCd(0, 'item', 'Visor lock indicator');
    API.setCd(0, 'consideration', '(c) predictable & unambiguous behavior');
    ok('two evaluations authored', API._read('cd').rows.length === 2);

    ok('duplicate reports success', API.duplicateRow('cd', 'CD-001') === true);
    let rows = API._read('cd').rows;
    ok('the copy lands directly below its original', rows.length === 3 && rows[1].cdId === 'CD-003');
    ok('the copy carries the original content', rows[1].item === 'Visor lock indicator');
    ok('the copy carries the original consideration', rows[1].consideration === '(c) predictable & unambiguous behavior');
    ok('the copy gets a fresh id', rows[0].cdId === 'CD-001' && rows[1].cdId !== 'CD-001');

    ok('delete by id reports success', API.deleteRow('cd', 'CD-003') === true);
    ok('the row is gone', API._read('cd').rows.map(r => r.cdId).join(',') === 'CD-001,CD-002');
    ok('deleting an unknown id is refused, not thrown', API.deleteRow('cd', 'CD-999') === false);
    ok('an unknown lane is refused', API.duplicateRow('not-a-lane', 'X') === false);

    // the credit must not be duplicated — one task, one assumption
    API.addTask();
    API._read('tasks').rows[0].asmId = 'ASM-AC-001';
    API.duplicateRow('tasks', 'TASK-001');
    const t = API._read('tasks').rows;
    ok('the original keeps its credited assumption', t[0].asmId === 'ASM-AC-001');
    ok('the duplicate does NOT inherit the credit', t[1].asmId === '');

    // allocation import path, with no functions lane loaded
    ok('setAllocBySubId refuses when the functions lane has no match', API.setAllocBySubId('SF-NOPE', 'crew', 'x') === false);
    global.acFunctionsData = [{ internalId: 'acfn-1', subId: 'SF-PITCH', subName: 'Pitch Control' }];
    ok('setAllocBySubId matches a real sub-function', API.setAllocBySubId('SF-PITCH', 'crew', 'flown manually') === true);
    const a = API._read('alloc').rows.find(r => r.subId === 'SF-PITCH');
    ok('the allocation lands on the keyed row', !!a && a.allocation === 'crew');
    ok('the rationale lands with it', !!a && a.rationale === 'flown manually');
    ok('an off-vocabulary allocation is refused by the existing guard',
        (API.setAllocBySubId('SF-PITCH', 'telepathy', ''), API._read('alloc').rows.find(r => r.subId === 'SF-PITCH').allocation === 'crew'));
})();


// ============================================================================
// REVIEW PARITY — comment + approve + sign on every HF lane.
//
// Waqas, 2 Sep 2026, with a screenshot of the AFHA review kebab: "there is a
// comment approve and sign action in the AFHA we need those for the HFAs too".
//
// The HF cell was ALREADY calling reviewCellHtml — it just rendered the 💬 alone,
// because _approvalControlHtml gates on APPROVABLE_KINDS and not one hf* kind was
// in it. One set membership was the whole bug. Everything behind it — the approval
// record, the tamper-evident sign-off chain, the void-on-open-comment rule — is
// keyed on {kind, id, systemId} and was generic from the start.
//
// The one piece that was NOT generic: _artifactRow, which backs the ⚠ "changed
// since sign-off" marker. It resolved rows by `.id` out of the worksheet stores.
// HF rows live under projectConfig.hf.<store>.rows and key on the lane's own id
// field, so a signed HF row could be edited and never raise the stale flag. That
// is the failure mode worth a test: a sign-off that silently stops meaning
// anything is worse than no sign-off.
// ============================================================================
console.log('\nreview parity — approve + sign across the HF lanes\n');

const bind = R('site/bindings_modules.js');
const helpers2 = R('site/helpers_modules.js');
const misc = R('site/misc_fn_modules.js');

const HF_KINDS = ['hfAlloc', 'hfTid', 'hfTask', 'hfHea', 'hfAlerts', 'hfErgo', 'hfCd', 'hfSa', 'hfMfc'];
const APV = (bind.match(/const APPROVABLE_KINDS = new Set\(\[[\s\S]*?\]\);/) || [''])[0];
ok('APPROVABLE_KINDS block found', APV.length > 0);
HF_KINDS.forEach(k => ok(k + ' is approvable', APV.indexOf("'" + k + "'") >= 0));
ok('the AFHA kinds are untouched', ["'acFha'", "'sysFha'", "'acReq'", "'fmea'"].every(k => APV.indexOf(k) >= 0));
ok('assumptions stay excluded — they have their own lifecycle state', APV.indexOf("'acAsm'") < 0);
ok('the change records why it was one line', /_approvalControlHtml gates on THIS set/.test(bind));

ok('the review cell renders comment + approval together', /'<span class="review-cell-group"[^']*' \+ cmt \+ apv \+ '/.test(misc));
ok('approval control carries the sign-off button', /openSignoffPanel\(/.test(misc + bind));
ok('approval control carries the stale marker', /isStaleSinceSignoff/.test(misc + bind));
ok('a green dot marks approved rows on the closed kebab', /position:absolute; top:1px; right:1px[\s\S]*?background:#1D9E75/.test(misc));

// the stale-marker resolver
ok('_artifactRow resolves hf* kinds', /if \(\/\^hf\[A-Z\]\/\.test\(String\(kind\)\)\)/.test(helpers2));
ok('_artifactRow maps all nine HF lanes to store + id field',
    HF_KINDS.every(k => new RegExp(k + ": \\['").test(helpers2)));
ok('_artifactRow reads projectConfig.hf, not a parallel store', /projectConfig\.hf\[M\[0\]\]/.test(helpers2));
ok('_artifactRow keys on the lane id field, not \.id', /String\(r\[M\[1\]\]\) === String\(id\)/.test(helpers2));
ok('the silent-stale failure mode is named in the comment', /must raise the same/.test(helpers2));
ok('helpers cache-bust bumped for the resolver', pinAtLeast(idx, 'helpers_modules', '2.67'));
ok('bindings cache-bust bumped for the approvable set', pinAtLeast(idx, 'bindings_modules', '1.32'));

// EXECUTED — the resolver has to actually find an HF row, or the stale flag is dead code
(function staleResolver() {
    const vm = require('vm');
    const ctx = {
        projectConfig: { hf: { cd: { rows: [{ cdId: 'CD-007', item: 'Visor lock indicator', status: 'Open' }] },
                               tid: { rows: [{ taskId: 'TSK-004', taskName: 'Confirm both lock indications' }] } } },
        console
    };
    // Lift just the two functions under test out of helpers, so the test exercises the
    // real source rather than a restatement of it.
    const fnSrc = (helpers2.match(/function _artifactRow\(kind, id, systemId\)[\s\S]*?\n\}/) || [''])[0];
    ok('_artifactRow source lifted for execution', fnSrc.length > 100);
    try {
        vm.createContext(ctx);
        vm.runInContext(fnSrc + '\n;globalThis.__row = _artifactRow;', ctx);
        const row = ctx.__row('hfCd', 'CD-007', null);
        ok('resolves a real HF row by its lane id', !!row && row.item === 'Visor lock indicator');
        const row2 = ctx.__row('hfTid', 'TSK-004', null);
        ok('resolves across lanes', !!row2 && row2.taskName === 'Confirm both lock indications');
        ok('an unknown id resolves to null, not a throw', ctx.__row('hfCd', 'CD-999', null) === null);
        ok('an unknown hf kind resolves to null', ctx.__row('hfNope', 'X', null) === null);
        ok('a non-HF kind falls through without hf handling', ctx.__row('acFha', '1', null) === null);
    } catch (e) {
        ok('_artifactRow executes headless', false, e.message);
    }
})();

// Traceability registration — the panel must name the lane, and must not pretend
// to have referrers it cannot compute yet.
const trc = R('site/assurance_modules.js');
ok('Traceability labels every HF lane', HF_KINDS.every(k => new RegExp(k + ":\\s*'HF ").test(trc)));
ok('Traceability maps every HF lane to its tab', HF_KINDS.every(k => new RegExp(k + ":\\s*'hfa-").test(trc)));
ok('the empty referrer resolver is declared, not hidden', /panel opens honestly empty rather than\s*\n\s*\/\/ pretending/.test(trc));
ok('assurance cache-bust bumped', pinAtLeast(idx, 'assurance_modules', '1.30'));

// ============================================================================
// TWO BUGS FOUND IN PROD, 2 Sep 2026, by approving an HF row and watching what
// the screen did — neither would have shown up in a source read.
//
// BUG 1 — the green dot has NEVER drawn, on any lane. reviewCellHtml called
//   Review.isApproved(kind, internalId, sysId) positionally. Review.isApproved
//   takes ONE argument, a target object (arity 1), so the guard was false for
//   every row ever rendered. _approvalControlHtml, ten lines below it, had the
//   object form right the whole time — which is why approve worked and only the
//   at-a-glance marker was dead.
//
// BUG 2 — approving an HF row wrote the record and left the checkbox on ☐.
//   toggleApproval re-renders the owning table from a per-kind map that had no
//   hf* entries. The data was correct and the screen said nothing happened,
//   which a user reads as a broken button, not as a rendering gap.
// ============================================================================
console.log('\nprod findings — approval rendering\n');

const misc2 = R('site/misc_fn_modules.js');
const bind2 = R('site/bindings_modules.js');

ok('green dot calls isApproved with a TARGET OBJECT', /Review\.isApproved\(\{ kind: kind, id: internalId, systemId: sysId \}\)/.test(misc2));
ok('the positional call is gone', !/Review\.isApproved\(kind, internalId, sysId\)/.test(misc2));
ok('the arity mistake is recorded so it is not reintroduced', /takes ONE argument, a target object \(arity 1\)/.test(misc2));
ok('how it was found is recorded', /Found by approving an HF row in prod/.test(misc2));

ok('toggleApproval re-renders HF lanes', /const HF_RENDER = \{ hfAlloc: 'renderAlloc'/.test(bind2));
ok('all nine lanes have a render entry',
    ['hfAlloc', 'hfTid', 'hfTask', 'hfHea', 'hfAlerts', 'hfErgo', 'hfCd', 'hfSa', 'hfMfc']
      .every(k => new RegExp(k + ": 'render").test(bind2)));
ok('the HF re-render routes through the module API', /HX\[HF_RENDER\[kind\]\]\(\)/.test(bind2));
ok('a wildcard was rejected on purpose', /rather than a wildcard, so an unmapped kind/.test(bind2));
ok('the user-visible symptom is named, not just the cause', /reads as a\s*\n\s*\/\/ broken button/.test(bind2));
ok('misc_fn cache-bust bumped', pinAtLeast(idx, 'misc_fn_modules', '66.50'));
ok('bindings cache-bust bumped again for the re-render', pinAtLeast(idx, 'bindings_modules', '1.32'));

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
