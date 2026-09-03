// regression_hf_lane_drafters.test.js — the other half of every HF lane.
//
// Waqas, 2 Sep 2026, with an HF spec uploaded and all nine HF lanes still amber:
// "why are these not green with the human factors spec in?"
//
// The honest answer was that every HF entry was a RECOMMENDER — it reads the rows you
// have authored and proposes improvements to them — so on an empty lane "needs authored
// rows" was truthful about the capability and useless as an instruction. The document
// genuinely described task steps, alerts, controls and SA elements, and nothing in the
// product would read it into a lane. This file locks the half that was missing.
//
// THE THREE RULES IT ENFORCES, and why each is a test rather than a comment:
//
//   1. FORBIDDEN FIELDS ARE STRIPPED ON APPLY, not merely discouraged in the prompt.
//      A prompt is a request; an apply filter is a guarantee. Task time, its basis,
//      sensory channels, the Bedford rating, the credited-assumption link and the
//      dispositions are elicited, measured or decided by the engineer, and every one of
//      them feeds an arithmetic check or a severity claim downstream. A drafted value in
//      any of them is a fabricated measurement wearing the same typeface as a real one.
//
//   2. CLOSED VOCABULARIES DROP, THEY NEVER COERCE. The lane's own setter already
//      refuses an off-list value; quietly rewriting the model's word to the nearest legal
//      one would hide that it produced an illegal one, which is the single fact worth
//      knowing about that row.
//
//   3. DRAFT AND RECOMMEND GATE ON DIFFERENT INPUTS. A drafter needs a DOCUMENT; a
//      recommender needs ROWS. That is the whole reason there are two buttons per lane
//      rather than one, and if they ever share a readiness key the split has bought
//      nothing and the amber chip is lying again.
//
// The apply path is EXECUTED against a stub HF module, not grepped. A forbid list that
// is present in the source and unreachable at runtime is exactly the bug this file is
// for, and only running it can tell the difference.

const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');

// Version pins are DOTTED VERSIONS compared as a FLOOR, not equalities — parseFloat('1.10')
// is 1.1, so a decimal comparison fails on a correct bump and teaches people to edit the
// test instead of reading it.
function pinAtLeast(hay, file, floor) {
    const m = hay.match(new RegExp(file.replace(/\./g, '\\.') + '\\.js\\?v=([\\d.]+)'));
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
    else { fail++; console.log('  FAIL ' + name + (extra ? ('\n       ' + extra) : '')); }
}

console.log('\nregression_hf_lane_drafters — read the document, propose the rows\n');

const ai = R('site/ai_assistant.js');
const bar = R('site/lane_ai_bar.js');
const loader = R('site/ai_loader.js');
const idx = R('site/index.html');
const hfa = R('site/hf_analyses.js');

// ------------------------------------------------------------------ registry
ok('the drafter registry exists', /var _HF_DRAFT_LANES = \{/.test(ai));
ok('the drafter is a graded feature, not an ungrounded writer', /'hf\.draftlane': 1/.test(ai));
ok('the drafter has its own closed citation list', /var _HF_DRAFT_BASES = \[/.test(ai));
ok('and that list is wired into the basis clause', /f === 'hf\.draftlane'\) \{ try \{ return _HF_DRAFT_BASES;/.test(ai));
ok('why the drafter bases differ from the recommender bases is recorded',
    /a drafter cites the DOCUMENT it read plus the standard whose vocabulary it used/.test(ai));
ok('the busy indicator names the drafter', /'hf\.draftlane': 'drafting HF lane rows from your documents'/.test(ai));
ok('draftHfLane is exported on the public API', /draftHfLane: draftHfLane,/.test(ai));

const draftLanesSrc = (ai.match(/var _HF_DRAFT_LANES = \{[\s\S]*?\n    \};/) || [''])[0];
const improveSrc    = (ai.match(/var _HF_IMPROVE_LANES = \{[\s\S]*?\n    \};/) || [''])[0];
ok('registry source lifted', draftLanesSrc.length > 1000 && improveSrc.length > 500);

const draftKeys   = [...draftLanesSrc.matchAll(/^        (\w+): \{/gm)].map(m => m[1]);
const improveKeys = [...improveSrc.matchAll(/^        (\w+):\s+\{/gm)].map(m => m[1]);
ok('nine lanes have a drafter', draftKeys.length === 9, draftKeys.join(','));
ok('every recommender lane also has a drafter — no half-served lane',
    improveKeys.every(k => draftKeys.indexOf(k) >= 0), improveKeys.join(',') + ' vs ' + draftKeys.join(','));
ok('and no drafter serves a lane the recommender does not know',
    draftKeys.every(k => improveKeys.indexOf(k) >= 0));

// --------------------------------------------------- the forbid lists, per lane
// These are the values the ENGINEER supplies. Each is named here so that removing one
// from the source is a failing test rather than a silent widening of what the model
// may assert.
const FORBID = {
    task: ['reactionS', 'execS', 'timeS', 'basis', 'channels'],   // measured (reaction from the norms, execution from the simulator); they feed the phase-workload red line — 3 Sep 2026
    hea:  ['asmId'],                        // the credit link is the engineer's promotion
    ergo: ['status'], cd: ['status'], sa: ['status'],   // disposition is a decision, not a reading
    mfc:  ['bedford', 'minCrew']            // a rated workload score and a §25.1523 determination
};
Object.keys(FORBID).forEach(lane => {
    const block = (draftLanesSrc.match(new RegExp('\\n        ' + lane + ': \\{[\\s\\S]*?\\n        \\}')) || [''])[0];
    FORBID[lane].forEach(f => {
        ok('lane ' + lane + ' forbids ' + f, new RegExp("forbid: \\[[^\\]]*'" + f + "'").test(block));
    });
    FORBID[lane].forEach(f => {
        ok('lane ' + lane + ' does not also OFFER ' + f + ' as draftable',
            !new RegExp("fields: \\[[^\\]]*'" + f + "'").test(block));
    });
});
ok('the guarantee is stated where it is enforced, not only in the prompt',
    /a prompt is a request and an apply filter is a guarantee/.test(ai));
ok('the forbid filter runs inside the field loop', /if \(\(cfg\.forbid \|\| \[\]\)\.indexOf\(f\) >= 0\) return;/.test(ai));

// ------------------------------------------------------- closed vocabularies
// Each drafter vocabulary must be the LANE'S OWN list. A drafter that offers a value the
// lane will refuse produces rows that silently lose a field on accept.
function laneList(name) {
    const m = hfa.match(new RegExp('var ' + name + ' = \\[[\\s\\S]*?\\];'));
    return m ? [...m[0].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
}
const pairs = [
    ['cd', 'kind', laneList('CD_KINDS')],
    ['cd', 'consideration', laneList('CD_CONSIDERATIONS')],
    ['sa', 'level', laneList('SA_LEVELS')],
    ['alerts', 'priority', laneList('ALERT_PRIORITIES')],
    ['alerts', 'modality', laneList('ALERT_MODALITIES')],
    ['hea', 'errorMode', laneList('ERROR_MODES')],
    ['alloc', 'allocation', laneList('ALLOCATIONS')]
];
pairs.forEach(([lane, field, want]) => {
    ok('lane ' + lane + '.' + field + ' vocabulary read from the lane itself',
        want.length > 0 && want.every(v => draftLanesSrc.indexOf("'" + v.replace(/'/g, "\\'") + "'") >= 0),
        want.join(' | '));
});
ok('an off-vocabulary value is dropped, never coerced',
    /if \(cfg\.vocab && cfg\.vocab\[f\] && cfg\.vocab\[f\]\.indexOf\(String\(v\)\) < 0\) return;/.test(ai));
ok('why coercion would be worse than dropping is recorded',
    /rewriting the model's word would hide that it produced one/.test(ai));

// ------------------------------------------------------------------ grounding
ok('the prompt demands the documents, not plausibility', /GROUND STRICTLY IN THE DOCUMENTS/.test(ai));
ok('every row must cite where it came from', /CITE WHERE IT CAME FROM/.test(ai));
ok('a document that marks its own gaps is carried through, not filled',
    /carry that marker into the row rather than filling the hole with a plausible value/.test(ai));
ok('an uncited row is shown flagged rather than hidden', /no citation — this row names no source section/.test(ai));
ok('the drafter refuses to run with no source document', /No source documents yet — add one in AI Inputs/.test(ai));
ok('every lane records where its cite lands', draftKeys.every(k => new RegExp('citeField').test(draftLanesSrc)));
ok('the lane with no free-text column files provenance as a review comment instead',
    /function _hfDraftCiteComment\(cfg, rowId, x\)/.test(ai) && /citeField: null,/.test(ai));
ok('and that choice is explained rather than left as a special case',
    /squeezed into a field that means something else/.test(ai));

// ----------------------------------------------------------------- the gate
ok('drafters gate on a DOCUMENT', /if \(String\(r\)\.indexOf\('hfdraft:'\) === 0\) \{/.test(ai));
ok('the missing input names the fix, not just the lack',
    /a source document describing this lane — add one in AI Inputs/.test(ai));
ok('the keyed allocation lane also needs its key set', /if \(dl === 'alloc'\) return funcsN \? ok : no\('aircraft sub-functions to allocate'\);/.test(ai));
ok('recommenders still gate on ROWS', /return rows\?ok:no\('authored rows in this lane'\);/.test(ai));
ok('each drafter states its own input in the AI Inputs guide', /var _HF_DRAFT_NEEDS = \{/.test(ai));
const needsKeys = [...((ai.match(/var _HF_DRAFT_NEEDS = \{[\s\S]*?\n    \};/) || [''])[0]).matchAll(/^        (\w+):/gm)].map(m => m[1]);
ok('one input statement per lane, none missing', needsKeys.length === 9 && draftKeys.every(k => needsKeys.indexOf(k) >= 0),
    needsKeys.join(','));

// -------------------------------------------------------------- the lane bar
ok('the in-lane bar strips the drafter suffix to find the lane',
    /\/\^HF — \(\.\+\?\)\(\?: · draft from documents\)\?\$\//.test(bar));
ok('both entries render in the lane, not just the last one seen',
    /both labels are kept as separate keys, so both render/.test(bar));
ok('lane bar version bumped', /lane_ai_bar\.js — v1\.2/.test(bar));
ok('index pins the bumped lane bar', pinAtLeast(idx, 'lane_ai_bar', '1.2'));
ok('ai_loader pins the bumped assistant', pinAtLeast(loader, 'ai_assistant', '76.22'));

// ============================================================== EXECUTED
// The apply path, run against a stub HF module. Everything above could pass on a
// drafter that is wired to nothing; this section is what proves the filters fire.
(function behaviour() {
    const applySrc = (ai.match(/function _applyHfDraftRow\(cfg, x\)[\s\S]*?\n    \}/) || [''])[0];
    ok('apply path lifted for execution', applySrc.length > 800);

    // A stub lane module: add() appends a blank row, set() writes one field, and both
    // record what they were asked to do so the test can assert on refusals as well as
    // writes. setAllocBySubId and setMfcFn mirror the real keyed-lane contract: an id the
    // project does not carry returns false rather than appending an orphan.
    const stub = `
        var _calls = [];
        var _store = { tasks: { rows: [] }, hea: { rows: [] }, cd: { rows: [] }, mfc: { rows: [] } };
        var HA = {
            _read: function (k) { return _store[k]; },
            addTask: function () { _store.tasks.rows.push({ taskId: 'TASK-001' }); },
            setTask: function (i, f, v) { _calls.push(['setTask', f, v]); _store.tasks.rows[i][f] = v; },
            addHea: function () { _store.hea.rows.push({ heaId: 'HEA-001' }); },
            setHea: function (i, f, v) { _calls.push(['setHea', f, v]); _store.hea.rows[i][f] = v; },
            addCd: function () { _store.cd.rows.push({ cdId: 'CD-001' }); },
            setCd: function (i, f, v) { _calls.push(['setCd', f, v]); _store.cd.rows[i][f] = v; },
            MFC_FUNCTIONS: [{ key: 'flightPath', label: 'Flight path control' }],
            setMfcFn: function (k, f, v) { _calls.push(['setMfcFn', k, f, v]); },
            setAllocBySubId: function (id, a, r) { _calls.push(['alloc', id, a, r]); return id === 'SF-1'; }
        };
        var window = { HF_ANALYSES: HA };
        var Review = null;
        function _toast() {}
    `;
    let run;
    try {
        run = new Function(stub + draftLanesSrc + applySrc +
            '; return { apply: _applyHfDraftRow, lanes: _HF_DRAFT_LANES, store: _store, calls: _calls };')();
    } catch (e) { ok('apply path builds', false, e.message); return; }
    ok('apply path builds', typeof run.apply === 'function');

    // ---- 1. forbidden fields never reach the store -----------------------
    run.apply(run.lanes.task, { phase: 'Approach', crewmember: 'PF', task: 'Configure flaps',
                                timeS: '4.5', basis: 'sim', channels: 'visual+manual', cite: '§A.5.3' });
    const taskRow = run.store.tasks.rows[0];
    ok('a drafted task lands its grounded fields', taskRow.task === 'Configure flaps' && taskRow.phase === 'Approach');
    ok('a drafted task TIME is stripped on apply', taskRow.timeS === undefined, JSON.stringify(taskRow));
    ok('a drafted time BASIS is stripped on apply', taskRow.basis === undefined);
    ok('drafted sensory CHANNELS are stripped on apply', taskRow.channels === undefined);
    ok('the cite lands in the lane provenance column', /§A\.5\.3/.test(String(taskRow.notes || '')));

    run.apply(run.lanes.hea, { task: 'Close visor', errorMode: 'omission', effect: 'Visor unlatched',
                               detection: 'ECAM', recovery: 'Re-cycle', asmId: 'ASM-9', cite: '§B.2' });
    const heaRow = run.store.hea.rows[0];
    ok('a drafted error mode lands', heaRow.errorMode === 'omission' && heaRow.task === 'Close visor');
    ok('the credited-assumption link is NOT drafted', heaRow.asmId === undefined, JSON.stringify(heaRow));

    run.apply(run.lanes.cd, { item: 'Gear lever', kind: 'Control', supports: 'Extend gear',
                              consideration: '(b) usable by the qualified crew', finding: 'Reach OK', status: 'Closed' });
    const cdRow = run.store.cd.rows[0];
    ok('a drafted controls & displays row lands', cdRow.item === 'Gear lever' && cdRow.kind === 'Control');
    ok('the DISPOSITION is not drafted — rows land Open', cdRow.status === undefined, JSON.stringify(cdRow));

    // ---- 2. closed vocabularies drop rather than coerce -------------------
    run.apply(run.lanes.cd, { item: 'Autobrake selector', kind: 'Knob',
                              consideration: '(z) invented consideration', finding: 'Detented' });
    const cd2 = run.store.cd.rows[1];
    ok('an off-vocabulary kind is dropped, not coerced to the nearest legal value', cd2.kind === undefined, JSON.stringify(cd2));
    ok('an off-vocabulary §25.1302 consideration is dropped', cd2.consideration === undefined);
    ok('the rest of the row still lands — one bad field does not lose the row', cd2.item === 'Autobrake selector' && cd2.finding === 'Detented');
    ok('nothing off-vocabulary was ever offered to the lane setter',
        !run.calls.some(c => c[0] === 'setCd' && (c[2] === 'Knob' || /invented/.test(String(c[2])))));

    run.apply(run.lanes.hea, { task: 'Arm spoilers', errorMode: 'forgetfulness', effect: 'No lift dump' });
    ok('an off-taxonomy THERP error mode is dropped', run.store.hea.rows[1].errorMode === undefined);

    // ---- 3. keyed lanes match, never append -------------------------------
    ok('an allocation naming a live sub-function is written',
        run.apply(run.lanes.alloc, { subId: 'SF-1', allocation: 'crew', rationale: 'Pilot judgement', cite: '§4.1' }) === true);
    ok('an allocation naming a sub-function that does not exist is REFUSED, not appended',
        run.apply(run.lanes.alloc, { subId: 'SF-NOPE', allocation: 'crew', rationale: 'invented' }) === false);
    ok('an off-vocabulary allocation is refused outright',
        run.apply(run.lanes.alloc, { subId: 'SF-1', allocation: 'the autopilot maybe' }) === false);
    ok('the accepted allocation carried its cite into the rationale',
        run.calls.some(c => c[0] === 'alloc' && /§4\.1/.test(String(c[3]))));

    ok('an Appendix D function the rule defines is written',
        run.apply(run.lanes.mfc, { key: 'flightPath', role: 'PF', note: 'Per POH', cite: '§C.1' }) === true);
    ok('an invented Appendix D key is refused — the six are fixed by the rule',
        run.apply(run.lanes.mfc, { key: 'vibesManagement', role: 'PM' }) === false);
    ok('no Bedford rating is ever written', !run.calls.some(c => c[0] === 'setMfcFn' && c[2] === 'bedford'));

    // ---- 4. a payload of nothing but forbidden fields is not a row --------
    const rowsBefore = run.store.tasks.rows.length;
    const drafted = { timeS: '9', basis: 'guess', channels: 'visual' };
    const anyDraftable = run.lanes.task.fields.some(f => run.lanes.task.forbid.indexOf(f) < 0 && String(drafted[f] || '').trim());
    ok('a payload of only forbidden fields is filtered out before the panel, not turned into an empty row',
        anyDraftable === false && run.store.tasks.rows.length === rowsBefore);
})();


// ---- 2 Sep 2026 — CREW TERMS DEFINED, PHASE + CREW DOWNSELECTS (Waqas: "either, both, PM
// and all that need to be defined somewhere, and that should be a downselect rather than
// free text so the AI cannot use different terms"). Executed where it can be.
(function () {
    const hf = R('site/hf_analyses.js');
    const defsSrc = (hf.match(/var TID_CREW_DEFS = \{[\s\S]*?\n    \};/) || [''])[0];
    ok('crew definitions exist in ONE place (hf_analyses TID_CREW_DEFS)', defsSrc.length > 100);
    const terms = ['PF', 'PM', 'Either', 'Both', 'Ground crew'];
    ok('every crew term carries a definition', terms.every(t => new RegExp("'" + t + "':\\s*'[^']{12,}'").test(defsSrc)), defsSrc.slice(0, 120));
    ok('PF/PM are defined as Pilot Flying / Pilot Monitoring, Both as requiring both pilots',
        /Pilot Flying/.test(defsSrc) && /Pilot Monitoring/.test(defsSrc) && /'Both':\s*'both pilots are required/.test(defsSrc));
    ok('definitions are exported for the drafter to read', /TID_CREW_DEFS: TID_CREW_DEFS/.test(hf));
    ok('TID schema: phase is a downselect bound to the project phases, crew carries defs + legend',
        /\{ k: 'phase',\s+label: 'Phases',\s+optsFn: 'projectPhases', multi: true/.test(hf) && /\{ k: 'crew',\s+label: 'Crew',\s+opts: 'TID_CREW', optsDefs: 'TID_CREW_DEFS', legend: TID_CREW_LEGEND/.test(hf));   // 3 Sep: phases are a SET
    ok('Task Analysis schema: phase downselect + crewmember bound to the SAME crew vocabulary',
        /\{ k: 'phase',\s+label: 'Phases', optsFn: 'projectPhases', multi: true/.test(hf) && /\{ k: 'crewmember', label: 'Crew',\s+opts: 'TID_CREW', optsDefs: 'TID_CREW_DEFS'/.test(hf));
    ok('the modal renders each option with its definition', /label: \(_defs && _defs\[v\]\) \? \(v \+ ' — ' \+ _defs\[v\]\) : v/.test(hf));
    ok('the column header carries the legend as a tooltip', /c\.legend \? ' title="' \+ esc\(c\.legend\)/.test(hf));

    // the drafter: tid + task lanes declare defs + the dynamic phase vocabulary; the prompt renders them
    ok('tid lane declares crew defs + project-phase vocabulary', /defs: \{ crew: 'TID_CREW_DEFS' \}, dynVocab: \{ phase: 'projectPhases' \}/.test(draftLanesSrc));
    ok('task lane now has a CLOSED crewmember vocabulary (was free text) + project-phase vocabulary',
        /vocab: \{ crewmember: \['PF', 'PM', 'Either', 'Both', 'Ground crew'\] \}/.test(draftLanesSrc) && /defs: \{ crewmember: 'TID_CREW_DEFS' \}, dynVocab: \{ phase: 'projectPhases' \}/.test(draftLanesSrc));
    ok('the lane stamp hashes defs + dynVocab (a methodology change changes the stamp)', /cfg\.defs \|\| null, cfg\.dynVocab \|\| null\]\);/.test(ai));
    const promptSrc = (ai.match(/function _hfDraftSystemPrompt\(cfg\)[\s\S]*?\n    \}/) || [''])[0];
    ok('the prompt renders definitions next to the vocabulary ("where PF = …")', /' — where ' \+ cfg\.vocab\[f\]\.map/.test(promptSrc));
    ok("the prompt renders THIS PROJECT'S flight phases as a closed SET (one or more, comma-separated)", /ONE OR MORE of THIS PROJECT\\'S flight phases, comma-separated/.test(promptSrc));

    // EXECUTED: an off-list phase is DROPPED at accept (dynamic vocabulary, verbatim or nothing)
    const applySrc = (ai.match(/function _applyHfDraftRow\(cfg, x\)[\s\S]*?\n    \}/) || [''])[0];
    const stub2 = `
        var _calls = []; var _store = { tasks: { rows: [] } };
        var HA = { _read: function (k) { return _store[k]; }, addTask: function () { _store.tasks.rows.push({ taskId: 'TASK-001' }); },
                   setTask: function (i, f, v) { _store.tasks.rows[i][f] = v; } };
        var window = { HF_ANALYSES: HA }; var Review = null; function _toast() {}
        function _projectPhaseNames() { return ['Taxi', 'Take-off', 'Approach', 'All phases']; }
    `;
    let run2 = null;
    try { run2 = new Function(stub2 + draftLanesSrc + applySrc + '; return { apply: _applyHfDraftRow, lanes: _HF_DRAFT_LANES, store: _store };')(); } catch (e) { ok('apply path builds with a phase list', false, e.message); }
    if (run2) {
        run2.apply(run2.lanes.task, { phase: 'Approach', crewmember: 'PF', task: 'Configure flaps', cite: 'x' });
        run2.apply(run2.lanes.task, { phase: 'approach', crewmember: 'Captain', task: 'Set flaps 15', cite: 'x' });
        run2.apply(run2.lanes.task, { phase: 'Standing', crewmember: 'Both', task: 'Power-up', cite: 'x' });
        run2.apply(run2.lanes.task, { phase: 'Taxi, Take-off, Cruise', crewmember: 'PM', task: 'Monitor', cite: 'x' });
        const r = run2.store.tasks.rows;
        ok('EXECUTED: an in-list phase + in-vocab crew land verbatim', r[0].phase === 'Approach' && r[0].crewmember === 'PF');
        ok('EXECUTED: a case-variant phase ("approach") is DROPPED, never coerced', r[1].phase === undefined, JSON.stringify(r[1]));
        ok('EXECUTED: a free-text crew term ("Captain") is DROPPED — the closed vocabulary bites on Task Analysis now', r[1].crewmember === undefined, JSON.stringify(r[1]));
        ok('EXECUTED: a phase not in THIS project ("Standing") is dropped while the row still lands', r[2].phase === undefined && r[2].task === 'Power-up' && r[2].crewmember === 'Both');
        ok('EXECUTED: a SET of phases keeps the in-list members verbatim and drops the off-list one ("Cruise" is not in this project)', r[3].phase === 'Taxi, Take-off', JSON.stringify(r[3]));
    }
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
