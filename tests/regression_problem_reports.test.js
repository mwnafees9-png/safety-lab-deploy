#!/usr/bin/env node
/*
 * Regression — problem_reports.js: Problem Reports / OPRs (gap M9).
 * Executes the REAL module; the app's own prompt dialog is driven by a queue.
 *
 *   P1  raising: every field recorded, numbered PR-001…, signed history;
 *       a blank title or a blank signature raises nothing
 *   P2  lifecycle: open → analyzed → corrective-action → verified → closed,
 *       each advance signed and appended to the history; closed stays closed
 *       until reopened; an unsigned advance changes nothing
 *   P3  deferral is a signed act with a rationale; a deferred PR RESUMES FROM
 *       THE STATE IT WAS DEFERRED FROM (before 23 Sep 2026 it restarted at
 *       'analyzed'); an older deferral with no recorded state resumes from open
 *   P4  the SSA gate (E.4.d) is upgraded to a real check: open safety-related
 *       PRs block it; deferred (signed) and closed ones do not
 *   P5  FRACAS findings raise PRs idempotently; the golden-thread gaps line
 *       names open safety-related PRs
 * Run: node tests/regression_problem_reports.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'problem_reports.js'), 'utf8');

function load(opts) {
    opts = opts || {};
    const answers = [];
    let saves = 0;
    const sb = { console, Math, JSON, String, Array, Object, Set, Map, Date,
        document: { getElementById: () => null },
        projectConfig: {},
        CKPT_CHECKLISTS: { SSA: [{ id: 'prs', kind: 'planned', tag: 'planned', label: 'Problem reports addressed' }] },
        slPrompt: async () => (answers.length ? answers.shift() : null),
        showToast() {}, commitSaveChanges: () => { saves++; } };
    if (opts.fracas) sb.ramFieldRows = () => opts.fracas;
    if (opts.gaps) sb._gtvReportGaps = () => 'Base gaps.';
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(SRC, sb, { filename: 'problem_reports.js' });
    return { sb, say: (...a) => answers.push(...a), saves: () => saves, store: () => sb.projectConfig.problemReports || [] };
}

(async () => {
    // ---- P1 -----------------------------------------------------------------------------
    let T = load();
    T.say('Pitch trim runaway not annunciated', 'Observed in sim run 14', 'y', 'test', 'FC-PITCH', 'J. Ortiz');
    await T.sb.prAdd();
    let p = T.store()[0];
    check('P1: a raised PR records every field, open, numbered PR-001, signed', p && p.id === 'PR-001' && p.title === 'Pitch trim runaway not annunciated' && p.safetyRelated === true && p.source === 'test' && p.linked === 'FC-PITCH' && p.state === 'open' && p.raisedBy === 'J. Ortiz' && p.history.length === 1 && p.history[0].by === 'J. Ortiz', JSON.stringify(p));
    T.say('Not safety', '', 'n', 'review', '', 'K. Lee');
    await T.sb.prAdd();
    check('P1: the next one is PR-002, and "n" means not safety-related', T.store()[1].id === 'PR-002' && T.store()[1].safetyRelated === false);
    T.say('   ');
    await T.sb.prAdd();
    T.say('Title', 'd', 'y', 'test', '', '  ');
    await T.sb.prAdd();
    check('P1: a blank title or a blank signature raises nothing', T.store().length === 2);

    // ---- P2 -----------------------------------------------------------------------------
    const walk = ['analyzed', 'corrective-action', 'verified', 'closed'];
    for (const st of walk) { T.say('evidence for ' + st, 'A. Reviewer'); await T.sb.prAdvance('PR-001'); }
    p = T.store()[0];
    check('P2: advances open → analyzed → corrective-action → verified → closed, each signed in the history',
        p.state === 'closed' && JSON.stringify(p.history.map(h => h.state)) === JSON.stringify(['open'].concat(walk)) && p.history.slice(1).every(h => h.by === 'A. Reviewer'));
    check('P2: the last note is kept as the disposition', p.disposition === 'evidence for closed');
    await T.sb.prAdvance('PR-001');   // returns before asking anything
    check('P2: a closed PR does not advance further', T.store()[0].state === 'closed' && T.store()[0].history.length === 5);
    T.say('A. Reviewer'); await T.sb.prReopen('PR-001');
    check('P2: reopening is signed and returns it to open', T.store()[0].state === 'open' && T.store()[0].history.slice(-1)[0].note === 'reopened');
    T.say('note', ''); await T.sb.prAdvance('PR-001');
    check('P2: an unsigned advance changes nothing', T.store()[0].state === 'open');

    // ---- P3 -----------------------------------------------------------------------------
    T = load();
    T.say('Seal weep', '', 'y', 'test', '', 'J. Ortiz'); await T.sb.prAdd();
    for (const st of ['analyzed', 'corrective-action', 'verified']) { T.say('e', 'R'); await T.sb.prAdvance('PR-001'); }
    T.say(''); await T.sb.prDefer('PR-001');
    check('P3: a deferral with no rationale is refused', T.store()[0].state === 'verified');
    T.say('Within limits until the seal change at C-check', 'C-check 2027', 'Chief engineer'); await T.sb.prDefer('PR-001');
    p = T.store()[0];
    check('P3: deferral is signed, with rationale, review-by and the state it was deferred from', p.state === 'deferred' && p.deferral.by === 'Chief engineer' && p.deferral.until === 'C-check 2027' && p.deferral.fromState === 'verified' && /review by C-check 2027/.test(p.history.slice(-1)[0].note));
    T.say('resumed', 'R'); await T.sb.prAdvance('PR-001');
    check('P3: a deferred PR resumes from where it was deferred (verified → closed), not back at analyzed', T.store()[0].state === 'closed' && T.store()[0].deferral === null, T.store()[0].state);
    T = load();
    T.sb.projectConfig.problemReports = [{ id: 'PR-009', title: 'old', state: 'deferred', safetyRelated: true, history: [], deferral: { rationale: 'r', until: 'u', by: 'b', at: '2026-01-01' } }];
    T.say('n', 'R'); await T.sb.prAdvance('PR-009');
    check('P3: an older deferral with no recorded state resumes from open (→ analyzed), as before', T.store()[0].state === 'analyzed');

    // ---- P4 -----------------------------------------------------------------------------
    T = load();
    const gate = T.sb.CKPT_CHECKLISTS.SSA[0];
    check('P4: the SSA item is upgraded from planned to a real check', gate.kind === 'auto' && !('tag' in gate) && typeof gate.eval === 'function');
    check('P4: an empty register passes (nothing raised)', gate.eval().pass === true && /register empty/.test(gate.eval().detail));
    T.say('A', '', 'y', 'test', '', 'J'); await T.sb.prAdd();
    T.say('B', '', 'n', 'test', '', 'J'); await T.sb.prAdd();
    check('P4: an open safety-related PR blocks the gate', gate.eval().pass === false && /1 open safety-related/.test(gate.eval().detail));
    T.say('accepted for now', 'next baseline', 'Chief'); await T.sb.prDefer('PR-001');
    check('P4: a signed deferral unblocks it; an open non-safety PR never blocks', gate.eval().pass === true && T.sb.prStats().open === 1 && T.sb.prStats().deferred === 1);

    // ---- P5 -----------------------------------------------------------------------------
    const fr = [{ verdict: 'finding', f: { id: 'FR-1', beRef: 'BE-7' }, predicted: 5000, hit: { node: { displayId: 'BE-7' } } },
                { verdict: 'ok', f: { id: 'FR-2', beRef: 'BE-8' } }];
    T = load({ fracas: fr, gaps: true });
    check('P5: a dry run proposes one PR per FRACAS finding and writes nothing', T.sb.prFromFracas(false).length === 1 && T.store().length === 0);
    T.sb.prFromFracas(true);
    check('P5: applying raises it as safety-related, open, signed by the FRACAS lane', T.store().length === 1 && T.store()[0].fracasId === 'FR-1' && T.store()[0].safetyRelated && /FRACAS/.test(T.store()[0].raisedBy));
    check('P5: a second sweep raises nothing new (idempotent)', T.sb.prFromFracas(true).length === 0 && T.store().length === 1);
    check('P5: the golden-thread gaps line names open safety-related PRs', /Base gaps\. 1 open safety-related problem report/.test(T.sb._gtvReportGaps()));

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
