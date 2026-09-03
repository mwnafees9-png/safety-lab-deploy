// regression_mel_fha_crosscheck.test.js — HF-2: MEL ↔ FHA credited-mitigation cross-check.
//
// THE HOLE THIS CLOSES. An FHA row classifies a failure condition for the aircraft as
// analysed. If a protection the tree under that row credits is an item the MMEL permits
// to be dispatched inoperative, the dispatched aircraft is not the aircraft we
// classified. VoePass 2283 departed with the airframe de-icing system on the MEL into an
// active severe-icing SIGMET, and no safety analysis had said "if de-icing is relieved,
// this condition re-classifies". That sentence is the product, and this file proves the
// engine produces it — by running the REAL check against isolated fixtures, never a
// reimplementation of it.
//
// The join is by shared id (MMEL beRef → basic event → trees → linkedFhaIds), never by
// string matching. An MMEL item whose beRef resolves to nothing is an ADVISORY naming
// the question, not a false positive. No MMEL data is a declared SKIP, never a silent
// pass. And the engine never re-classifies: the FHA rows are byte-compared before and
// after every run.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? ('\n       ' + extra) : '')); }
}
console.log('\nregression_mel_fha_crosscheck — the dispatched aircraft is not the aircraft we classified\n');

const src = R('site/mel_fha_crosscheck.js');
const ai = R('site/ai_assistant.js');
const inv = R('site/invariants.js');
const idx = R('site/index.html');

// ------------------------------------------------------------- doctrine
ok('the join is by id, and the file says so', /THE JOIN IS BY SHARED ID, NEVER BY STRING MATCHING/.test(src));
ok('the census that justified option 2 is recorded', /Censused 2 Sep 2026/.test(src) && /projectConfig\.mmel\.items\[\] carry `beRef`/.test(src));
ok('relievable is the MMEL lane\'s own verdict', /if \(it && it\.protection && it\.protection\.ok === false\) return false;/.test(src));
ok('the engine never re-classifies, and says so', /THE ENGINE NEVER RE-CLASSIFIES/.test(src));
ok('a skip is declared as a skip', /This is a skip, not a pass/.test(src));
ok('the accident is cited to CENIPA, not editorialised', /CENIPA final\s*\n\s*\/\/ report/.test(src) && !/would have prevented/i.test(src));
ok('registered into the invariant sweep, advisory severity', /id: 'INV-MEL-FHA', sev: 'advisory'/.test(src));
ok('the invariant runner passes the skip note through', /note: r\.note \|\| '', skipped: !!r\.skipped/.test(inv));
ok('the consistency findings read the module', /window\.MelFhaCrossCheck/.test(ai) && /MMEL relief contradicts a credited FHA classification/.test(ai));
ok('the hard gate treats it as a NAMED advisory, never a block', /SOFT\.mmel = \(SOFT\.mmel \|\| \[\]\)\.concat\(items\)/.test(ai) &&
    /MMEL relief vs credited FHA classification — engineer to disposition/.test(ai));
ok('the reason it does not block is recorded', /the gate must not make an engineering judgment for them/.test(ai));
ok('index loads the module after the MMEL module', idx.indexOf('mmel_module.js?v=') < idx.indexOf('mel_fha_crosscheck.js?v='));

// ============================================================== EXECUTED
(function behaviour() {
    // ---- a fixture: two trees, three FHA rows, three MMEL items ---------------
    // Tree T1 classifies FC-01 (Catastrophic) and contains BE-DEICE.
    // Tree T2 classifies FC-02 (Major) and contains BE-PUMP.
    // MMEL-001 relieves BE-DEICE (analysed, protection ok)   -> finding on FC-01
    // MMEL-002 relieves BE-PUMP  (protection REJECTED)       -> no finding
    // MMEL-003 references BE-GHOST (in no tree)              -> advisory, not a finding
    const be = (id, lid) => ({ id: id, logicalId: lid, type: 'basic', displayId: id, children: [] });
    const gate = (id, kids) => ({ id: id, type: 'gate', gateType: 'AND', children: kids });
    global.ftaPages = [
        { id: 'T1', name: 'Loss of ice protection', linkedFhaIds: ['1001'], root: gate('g1', [be('BE-DEICE', 'L-DEICE'), be('BE-DET', 'L-DET')]) },
        { id: 'T2', name: 'Loss of hydraulic pump', linkedFhaIds: ['1002'], root: gate('g2', [be('BE-PUMP', 'L-PUMP'), be('BE-PUMP2', 'L-PUMP2')]) }
    ];
    global.acFhaData = [
        { internalId: 1001, fcId: 'FC-01', fcDesc: 'Loss of airframe ice protection in icing', severity: 'Catastrophic' },
        { internalId: 1002, fcId: 'FC-02', fcDesc: 'Loss of one hydraulic pump', severity: 'Major' },
        { internalId: 1003, fcId: 'FC-03', fcDesc: 'Unrelated', severity: 'Minor' }
    ];
    global.systemsData = [];
    global.projectConfig = { mmel: { items: [
        { id: 'MMEL-001', title: 'Airframe de-icing system', beRef: 'BE-DEICE', category: 'C', catDays: 10, state: 'analyzed', protection: { ok: true, minOrder: 2 } },
        { id: 'MMEL-002', title: 'Hydraulic pump 1', beRef: 'BE-PUMP', category: 'B', catDays: 3, state: 'analyzed', protection: { ok: false, verdict: 'order-1 — NO DISPATCH' } },
        { id: 'MMEL-003', title: 'Ghost item', beRef: 'BE-GHOST', category: 'D', catDays: 120, state: 'draft' }
    ] } };
    // the house resolver, as the module finds it
    global._fmesFindBe = function (want) {
        want = String(want);
        for (const p of global.ftaPages) {
            let hit = null;
            (function walk(n) { if (hit || !n) return; if (String(n.id) === want || String(n.logicalId) === want || String(n.displayId || '') === want) { hit = n; return; } (n.children || []).forEach(walk); })(p.root);
            if (hit) return { node: hit, page: p };
        }
        return null;
    };
    global.window = { invRegister: function () { return true; } };
    const before = JSON.stringify(global.acFhaData);

    let M;
    try { delete require.cache[require.resolve(path.join(ROOT, 'site/mel_fha_crosscheck.js'))]; M = require(path.join(ROOT, 'site/mel_fha_crosscheck.js')); }
    catch (e) { ok('module loads headless', false, e.message); return; }
    ok('module loads headless', !!M && typeof M.run === 'function');

    const r = M.run();
    ok('the check ran (not skipped)', r && r.skipped === false && r.checked === 3);

    // 1. relievable + linked -> finding, with the relief reference in the text
    const f1 = r.findings.filter(f => f.fcId === 'FC-01');
    ok('1. a credited protection on the MMEL raises a finding on the FHA row it classifies', f1.length === 1, JSON.stringify(r.findings.map(f => f.fcId)));
    ok('   the finding names the MMEL item, the basic event and the relief category', f1[0] && /MMEL-001/.test(f1[0].text) && /BE-DEICE/.test(f1[0].text) && /Category C \(10 days\)/.test(f1[0].text));
    ok('   the finding states the consequence in the FHA\'s terms', f1[0] && /Classification Catastrophic is not valid for the relieved configuration/.test(f1[0].text));
    ok('   the finding carries the tree it came through', f1[0] && f1[0].tree === 'Loss of ice protection');

    // 2. non-relievable (protection rejected) -> no finding
    ok('2. an item the MMEL lane REJECTS raises no FHA finding', !r.findings.some(f => f.fcId === 'FC-02'));
    ok('   and an FHA row no tree links to is never mentioned', !r.findings.some(f => f.fcId === 'FC-03'));

    // 4. unlinked -> advisory, not a false positive
    ok('4. an item whose basic event is in no tree lands in the ADVISORY list', r.advisory.length === 1 && r.advisory[0].mmelId === 'MMEL-003');
    ok('   and the advisory names the question rather than guessing an answer', /Which credited protections does relieving this item touch\?/.test(r.advisory[0].text));
    ok('   the unlinked item produced no finding', !r.findings.some(f => f.mmelId === 'MMEL-003'));

    // 5. never mutates
    ok('5. the FHA rows are byte-identical after the run', JSON.stringify(global.acFhaData) === before);
    ok('   the MMEL items are untouched too', global.projectConfig.mmel.items[0].protection.ok === true && !('crossCheck' in global.projectConfig.mmel.items[0]));

    // 3. no MMEL data -> declared skip
    global.projectConfig = { mmel: { items: [] } };
    const s = M.run();
    ok('3. no MMEL items -> the check SKIPS and says so', s.skipped === true && s.checked === 0 && /did not run/.test(s.note) && /not a pass/.test(s.note));
    ok('   a skip carries no findings and no advisories', s.findings.length === 0 && s.advisory.length === 0);
    global.projectConfig = undefined;
    const s2 = M.run();
    ok('   no projectConfig at all is also a declared skip, never a throw', s2.skipped === true);

    // the invariant adapter shape
    global.projectConfig = { mmel: { items: [{ id: 'MMEL-001', title: 'Airframe de-icing system', beRef: 'BE-DEICE', category: 'C', catDays: 10, protection: { ok: true } }] } };
    let reg = null;
    global.window = { invRegister: function (i) { reg = i; return true; } };
    delete require.cache[require.resolve(path.join(ROOT, 'site/mel_fha_crosscheck.js'))];
    require(path.join(ROOT, 'site/mel_fha_crosscheck.js'));
    ok('registers INV-MEL-FHA as advisory', reg && reg.id === 'INV-MEL-FHA' && reg.sev === 'advisory');
    const ir = reg.run();
    ok('the invariant reports the finding as a fail line and carries the note', ir.fails.length === 1 && /FC-01/.test(ir.fails[0]) && typeof ir.note === 'string');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
