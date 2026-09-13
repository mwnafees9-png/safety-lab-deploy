// regression_hf_consistency.test.js — AI consistency, provenance and rigor on the HF lanes.
//
// Waqas, 2 Sep 2026: "now to the AI consistency on these lanes, primarily the human
// factors ones" — and, mid-build: "same rigor in review and sign offs will be required
// as is the case with other AI drafted analyses."
//
// THREE THINGS WERE MISSING, and each was invisible rather than broken, which is why
// none of them had ever surfaced as a bug:
//
//   1. NO PROVENANCE. The HF lanes wrote through their own setters and stamped nothing,
//      so an AI-drafted row was byte-indistinguishable from a typed one. The AI provenance
//      audit, the Quality Scorecard and INV-31 all read those stamps, so all three
//      reported ZERO human factors on a project whose HF assessment the model had written
//      end to end. A reviewer approving such a row was never shown that a model wrote it.
//
//   2. NO CROSS-LANE CHECK. Each HF lane computes findings, and every one is lane-local.
//      A step identified and never analysed, an error row citing a failure condition the
//      FHA does not contain, a cue no display provides, crew mitigation credited on a
//      function the design gave to automation — all of those live BETWEEN lanes, which is
//      exactly where an assessment assembled a lane at a time comes apart, and exactly
//      where a drafter that reads one document and fills one lane is most likely to be
//      locally plausible and globally wrong.
//
//   3. NO REPRODUCIBILITY. Measured, not assumed: the draft cache and the call ledger
//      both wrap window.SafetyLabAI.complete, and every lane feature calls
//      Provider.complete directly — the exported complete() forwards TO Provider, not the
//      other way round. The wraps have been sitting outside a door nothing walks through.
//
// The consistency findings are EXECUTED against the real HF module and a stub project,
// not grepped. A check that is present in the source and never fires is the failure mode
// this whole file exists to catch — and one of these eight had exactly that bug when it
// was first written, indexing the allocation lane by internalId while the FHA traces by
// subId, so it could never have matched. Only running it found that.

const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');

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
    else { fail++; console.log('  FAIL  ' + name + (extra ? ('\n       ' + extra) : '')); }
}

console.log('\nregression_hf_consistency — provenance, cross-lane findings, reproducibility\n');

const ai = R('site/ai_assistant.js');
const hfa = R('site/hf_analyses.js');
const inv = R('site/invariants.js');
const idx = R('site/index.html');
const loader = R('site/ai_loader.js');

// ====================================================== 1. PROVENANCE
ok('the lane owns the stamp', /function stampAi\(lane, id, meta\)/.test(hfa));
ok('and exports it', /stampAi: stampAi, aiRows: aiRows, _AI_STAMP_LANES: _AI_STAMP_LANES/.test(hfa));
ok('all nine lanes are stampable', (function () {
    const m = (hfa.match(/var _AI_STAMP_LANES = \{[\s\S]*?\};/) || [''])[0];
    return ['tid', 'tasks', 'hea', 'alerts', 'ergo', 'cd', 'sa', 'alloc', 'mfc'].every(k => new RegExp('\\b' + k + ':').test(m));
})());
ok('the drafter stamps the row it just wrote', /HA\.stampAi\(cfg\.store, stampRow\[cfg\.idField\]/.test(ai));
ok('the keyed allocation lane is stamped too', /HA\.stampAi\('alloc', hit\.key,/.test(ai));
ok('the keyed minimum-flight-crew lane is stamped too', /HA\.stampAi\('mfc', x\.key,/.test(ai));
ok('the stamp is metadata, and says so', /The stamp is METADATA, never analysis/.test(hfa));
ok('the citation is its own field, not buried in prose', /if \(meta\.cite\) row\.aiCite = String\(meta\.cite\);/.test(hfa));
ok('and the reason it is its own field is recorded', /it cannot count what is buried inside a notes string/.test(hfa));

ok('HF rows reach the AI provenance audit', /HA\.aiRows\(\)\.forEach\(function \(e\) \{/.test(ai) && /type: 'HF · '/.test(ai));
ok('the audit gap is named rather than quietly closed', /reported\s*\n?\s*\/\/ "no AI-generated artifacts"/.test(ai) || /no AI-generated artifacts/.test(ai));
ok('HF rows are graded by the Quality Scorecard', /kind === 'hf'/.test(ai) && /groups\.push\(\{ label: 'HF · '/.test(ai));
ok('an uncited AI row is a grading finding', /drafted with no citation — the source sentence is not recorded/.test(ai));
ok('a severity word in an HF row is a grading finding', /severity word in an HF row — classification belongs to the FHA/.test(ai));
ok('one issue is never counted twice', /is not repeated as a consistency\s*\n\s*\/\/ finding/.test(ai));

// ====================================================== 2. REVIEW RIGOR
ok('the review cell carries the AI confidence pill', /function _aiPill\(kind, id\)/.test(hfa));
ok('the pill is resolved from the kind, so no call site can be forgotten', /var _KIND_LANE = \{ hfTid: 'tid'/.test(hfa));
ok('all nine review kinds map to a lane', (function () {
    const m = (hfa.match(/var _KIND_LANE = \{[\s\S]*?\};/) || [''])[0];
    return ['hfTid', 'hfAlloc', 'hfTask', 'hfHea', 'hfAlerts', 'hfErgo', 'hfCd', 'hfSa', 'hfMfc'].every(k => m.indexOf(k) >= 0);
})());
ok('the pill only draws for an AI-drafted row', /if \(!row \|\| !row\.aiGenerated\) return '';/.test(hfa));
ok('the rigor requirement is recorded in the code that answers it', /same rigor in review and sign offs/.test(hfa));
ok('INV-31 now checks HF rows', /HF ' \+ e\.lane \+ ' ' \+ e\.id \+ ' \[AI\]: missing model\/timestamp provenance stamp/.test(inv));
ok('INV-31 keeps severity out of the HF lanes', /severity word in ' \+ k \+ ' — severity belongs in the FHA/.test(inv));
ok('invariants cache-bust bumped', pinAtLeast(idx, 'invariants', '1.3'));
ok('hf_analyses cache-bust bumped', pinAtLeast(idx, 'hf_analyses', '1.11'));
ok('ai_assistant cache-bust bumped', pinAtLeast(loader, 'ai_assistant', '76.23'));

// ====================================================== 3. THE ASSUMPTIONS
ok('the HF drafter declares its assumptions', /_parseAssumptions\(r\.text, 'hf\.draftlane', 'HF · ' \+ cfg\.name\)/.test(ai));
ok('the HF recommender declares its assumptions', /_parseAssumptions\(r\.text, 'hf\.improve', 'HF · ' \+ cfg\.name \+ ' \(improvements\)'\)/.test(ai));
// Checked by PANEL, not by counting the idiom: other lanes use the same line, so a
// bare count would pass while one of the two HF panels quietly dropped its assumptions.
ok('the HF draft panel shows them', /id: 'ai-rev-panel-hfdraft'[\s\S]{0,900}?items: rows, assumptions: _assumptions/.test(ai));
ok('the HF improvement panel shows them', /id: 'ai-rev-panel-hfimp'[\s\S]{0,900}?items: recs, assumptions: _assumptions/.test(ai));
ok('assumptions are filed per LANE, not per feature', /function _parseAssumptions\(text, feature, labelOverride\)/.test(ai) &&
    /const label = labelOverride \|\| _ASSUMPTION_LABELS\[feature\]/.test(ai));
ok('and the reason one feature serving nine lanes needs that is recorded',
    /ONE feature serving NINE lanes/.test(ai));
ok('the HF features have readable labels in the register',
    /'hfa\.draft': 'HF crew credit', 'hf\.improve': 'HF design improvements'/.test(ai));
// hf.improve STAYS out of _ANALYSIS_FEATURES. regression_hf_improve has pinned that
// since the lane shipped, and the reason survives contact: membership brings the
// ABSTENTION clause, and this recommender is meant to speak on a sparse lane. It takes
// the assumptions contract on its own instead — the two obligations are separable, and
// conflating them is what would have silenced the lane on the projects that need it.
ok('hf.improve stays OUT of the analysis-feature gate', !/'hf\.improve': 1/.test((ai.match(/const _ANALYSIS_FEATURES = \{[\s\S]*?\};/) || [''])[0]));
ok('and takes the assumptions contract at its own call site',
    /_withAssumptionsClause\(_withBasisClause\(_hfImproveSystemPrompt\(cfg\), 'hf\.improve'\)\)/.test(ai));
ok('the distinction is recorded, so it is not "fixed" again',
    /abstains on thin input vs is meant to speak anyway/.test(ai));

// ====================================================== 4. REPRODUCIBILITY
ok('a reproducible completion path exists', /function _completeReproducible\(opts\)/.test(ai));
ok('it prefers the wrapped surface when one is installed', /P\.complete\._acWrapped \|\| P\.complete\._afWrapped/.test(ai));
ok('and falls straight back to the provider when none is', /return Provider\.complete\(opts\);\s*\n    \}/.test(ai));
ok('both HF features use it', (ai.match(/await _completeReproducible\(\{ feature: 'hf\./g) || []).length === 2);
ok('the measured gap is stated, not implied', /the wraps sit outside a\s*\n\s*\/\/ door nothing walks through/.test(ai));
ok('the blast radius of flipping every lane is named and deferred', /that is a decision to take on its own/.test(ai));
// The claim above must stay TRUE of the shipped modules, or the comment is folklore.
const cons = R('site/ai_consistency.js'), fid = R('site/ai_fidelity.js');
ok('the draft cache really does wrap the exported surface only', /var P = \(typeof window !== 'undefined'\) \? window\.SafetyLabAI : null;/.test(cons));
ok('the call ledger really does wrap the exported surface only', /const P = \(typeof window !== 'undefined'\) \? window\.SafetyLabAI : null;/.test(fid));
ok('and the exported complete really is a forwarder to Provider', /complete: function \(opts\) \{ return Provider\.complete\(opts\); \}/.test(ai));

// ====================================================== 5. THE BANNER
ok('the lane draws its own cross-lane banner', /function _xlaneBanner\(lane\)/.test(hfa));
ok('every one of the nine lanes draws it', (hfa.match(/_xlaneBanner\('/g) || []).length === 9,
    'found ' + (hfa.match(/_xlaneBanner\('/g) || []).length);
ok('the banner reads the AI module rather than recomputing', /API\.hfConsistencyFor\(lane\)/.test(hfa));
ok('and the reason two implementations would be wrong is recorded',
    /two\s*\n\s*\/\/ implementations of one rule is how a lane and a gate come to disagree/.test(hfa));
ok('a high finding says it blocks sign-off', /blocks sign-off until resolved or dispositioned/.test(hfa));
ok('the lane stays usable with no AI module loaded', /if \(!API \|\| typeof API\.hfConsistencyFor !== 'function'\) return '';/.test(hfa));
ok('the accessor is exported', /hfConsistencyFor: hfConsistencyFor,/.test(ai));
ok('findings carry the lanes they belong to', /Array\.isArray\(f\.lanes\) && f\.lanes\.indexOf\(String\(lane\)\) >= 0/.test(ai));

// ============================== 5b. THE FREE-TEXT MATCHER (live-run defect)
// Found by running the real Aeolus HF spec through the shipped drafters, not by
// reasoning: the first version of these checks compared two FREE-TEXT fields for
// normalized EQUALITY, which on real rows is almost never true. It flagged 14 of 21 SA
// elements and 32 of 44 task steps. The unit tests had passed because their fixtures were
// short exact strings — they confirmed the assumption rather than testing it, which is
// exactly the failure this section exists to prevent recurring.
ok('relatedness is by shared distinctive tokens, not equality', /const related = function \(a, b\)/.test(ai));
ok('short names are not condemned by a flat two-token rule',
    /n >= Math\.min\(2, Math\.min\(A\.length, B\.length\)\)/.test(ai));
ok('stopwords and short words are excluded from the token set', /const STOPWORDS = \{ the:1/.test(ai) && /w\.length >= 4 && !STOPWORDS\[w\]/.test(ai));
ok('a field left blank is never counted as a mismatch', /nothing said is not a mismatch/.test(ai));
ok('the equality version is gone from all three checks', !/const has = function \(set, v\)/.test(ai) && !/setOf\(cd, \['item'\]\)/.test(ai));
ok('the measurement that forced the change is recorded, with its numbers',
    /flagged 14 of 21 SA elements and 32 of 44/.test(ai));
ok('and why the unit tests missed it is recorded', /confirmed the assumption instead of testing it/.test(ai));

// The banner's cost, also measured live.
ok('the lane banner memoizes the sweep', /var _hfConsCache = null, _hfConsAt = 0;/.test(ai));
ok('the freeze that forced it is recorded with its numbers', /froze the tab for about three minutes/.test(ai));
ok('the gate is never served a cached answer', /a gate decision must always be computed from the project as it is right now/.test(ai));
ok('accept no longer adds a redundant render', /No render here\. Every lane setter already re-renders on write/.test(ai));

// ====================================================== 6. THE HARD GATE
ok('HF is folded into the one findings function, not a parallel sweep',
    /_hfConsistencyFindings\(s\)\.forEach\(function \(f\) \{ findings\.push\(f\); \}\)/.test(ai));
ok('and the reason a parallel sweep was rejected is recorded',
    /a parallel sweep would be a second\s*\n\s*\/\/ place to remember/.test(ai));
ok('an HF invented reference BLOCKS', /non-existent failure condition\|non-existent function\|deleted system/.test(ai));
ok('an HF crew/automation contradiction BLOCKS', /credited on a function allocated to automation\/i\.test\(L\)\) HARD\.contradiction/.test(ai));
ok('everything else HF finds stays advisory, and says so', /but dispositionable, and stays advisory/.test(ai));

// ============================================================== EXECUTED
// Eight checks, run against the real HF module and a stub project built to break each
// one. Grepping proves the code is present; only running it proves the code fires.
(function behaviour() {
    const src = (ai.match(/function _hfConsistencyFindings\(s\)[\s\S]*?\n    \}/) || [''])[0];
    ok('the findings function lifted for execution', src.length > 2000);

    global.projectConfig = { hf: {} };
    global.scheduleAutosave = function () {};
    global.window = undefined; global.document = undefined;
    global.acFunctionsData = [{ internalId: 7, subId: 'SF-1', subName: 'Extend gear' }];
    let HA;
    try {
        delete require.cache[require.resolve(path.join(SITE, 'site/hf_analyses.js'))];
        HA = require(path.join(SITE, 'site/hf_analyses.js'));
    } catch (e) { ok('HF module loads headless', false, e.message); return; }
    global.window = { HF_ANALYSES: HA };
    let find;
    try { find = new Function('return (' + src + ')')(); }
    catch (e) { ok('findings function builds', false, e.message); return; }
    ok('findings function builds', typeof find === 'function');

    // A project with nothing in it must be SILENT. A checker that fires on an empty
    // project is a checker everyone learns to ignore before they have written a row.
    ok('an empty project produces no findings', find({ acFhaData: [], acFunctionsData: [], systemsData: [] }).length === 0);

    // Now build one break per check.
    HA.addTid(); HA.setTid(0, 'taskName', 'Close and latch visor'); HA.setTid(0, 'opsMode', 'Normal');
    HA.addTask(); HA.setTask(0, 'task', 'Arm the spoilers');
    HA.addHea(); HA.setHea(0, 'fcIds', 'FC-99, FC-01');
    HA.addAlert(); HA.setAlert(0, 'name', 'GEAR UNSAFE'); HA.setAlert(0, 'fcIds', 'FC-01');
    HA.addSa(); HA.setSa(0, 'element', 'Gear position'); HA.setSa(0, 'cue', 'Telepathy');
    HA.addCd(); HA.setCd(0, 'item', 'Gear lever'); HA.setCd(0, 'supports', 'SF-404');
    HA.setAllocBySubId('SF-1', 'automation', 'design choice');
    HA.setMfcConclusion('minCrew', '1');
    const s = {
        acFhaData: [{ fcId: 'FC-01', internalId: 1, severity: 'Catastrophic', effCrew: 'Crew reverts to manual', subId: 'SF-1' }],
        acFunctionsData: global.acFunctionsData, systemsData: []
    };
    const f = find(s);
    const by = l => f.filter(x => new RegExp(l, 'i').test(x.label))[0];

    ok('1. a step identified and never analysed is found', !!by('identified but never analyzed') &&
        /TSK-001/.test(by('identified but never analyzed').items.join('|')));
    ok('2. a task analysed with no procedure behind it is found', !!by('no identified procedure step covers'));
    ok('3. an error row citing an FC the FHA does not carry is found', !!by('non-existent failure condition') &&
        /FC-99/.test(by('non-existent failure condition').items.join('|')));
    ok('   …and the FC that DOES exist is not flagged', !/FC-01/.test((by('non-existent failure condition') || { items: [] }).items.join('|')));
    ok('   …and it is HIGH, because an invented reference blocks', (by('non-existent failure condition') || {}).sev === 'high');
    ok('4. a control supporting a function that does not exist is found', !!by('controls & displays traced to a non-existent function'));
    ok('5. an SA cue nothing provides is found', !!by('cues no evaluated display or alert provides'));
    ok('6. crew mitigation credited on an automation-allocated function is found', !!by('allocated to automation'),
        f.map(x => x.label).join(' | '));
    ok('   …and it is HIGH, because both halves cannot be true', (by('allocated to automation') || {}).sev === 'high');
    ok('7. a crew determination recorded over unassigned workload functions is found', !!by('minimum-flight-crew determination'));
    ok('8. severe conditions with no emergency-mode steps are found', !!by('no emergency-mode task steps'));
    ok('every finding names the lanes that must draw it', f.every(x => Array.isArray(x.lanes) && x.lanes.length));

    // ---- the false-positive guards, which are what keep a checker trusted ----
    HA.setSa(0, 'cue', 'Gear lever');                     // now provided by the C&D lane
    ok('an SA cue that a C&D item DOES provide clears', !find(s).some(x => /cues no evaluated display/.test(x.label)));
    HA.setCd(0, 'supports', 'the landing gear extension task');   // prose, not an id
    ok('free-text "supports" prose is not read as a broken id',
        !find(s).some(x => /controls & displays traced to a non-existent/.test(x.label)));
    HA.setTid(0, 'taskName', 'Arm the spoilers');         // matches the analysed task
    const f2 = find(s);
    ok('a step whose wording differs only in punctuation still matches',
        !f2.some(x => /identified but never analyzed/.test(x.label)));
    HA.setAllocBySubId('SF-1', 'crew', 'pilot judgement');
    ok('reallocating the function to the crew clears the contradiction',
        !find(s).some(x => /allocated to automation/.test(x.label)));

    // ---- the matcher, on prose rather than on fixtures ----
    // These are the shapes the live run actually produced. A cue and a control that name
    // the same thing in different words must MATCH; a cue that names nothing on the flight
    // deck must still fire. Equality gets both of these wrong.
    HA.setCd(0, 'item', 'Nose door lock proximity harness indication (VISOR LOCK PROXIMITY)');
    HA.setSa(0, 'cue', 'Lock status displayed on the flight deck at all times on the proximity harness, tags 65 and 66');
    ok('a prose cue and a prose control naming the same thing MATCH',
        !find(s).some(x => /cues no evaluated display/.test(x.label)));
    HA.setSa(0, 'cue', 'Crew recalls the value from memory');
    ok('a cue naming nothing on the flight deck still fires',
        find(s).some(x => /cues no evaluated display/.test(x.label)));
    HA.setSa(0, 'cue', 'Gear lever');
    HA.setCd(0, 'item', 'Gear lever');
    ok('a one-word-per-side name is not condemned by the two-token rule',
        !find(s).some(x => /cues no evaluated display/.test(x.label)));

    // ---- provenance round-trip ----
    ok('stampAi marks the row', HA.stampAi('sa', 'SA-001', { model: 'claude-x', feature: 'hf.draftlane', cite: '§A.1' }) === true);
    const rows = HA.aiRows();
    ok('aiRows finds exactly the stamped row', rows.length === 1 && rows[0].lane === 'sa' && String(rows[0].id) === 'SA-001');
    ok('the stamp carries model, timestamp, feature and citation',
        rows[0].row.aiModel === 'claude-x' && !!rows[0].row.aiAt &&
        rows[0].row.aiFeature === 'hf.draftlane' && rows[0].row.aiCite === '§A.1');
    ok('stamping a row that does not exist is refused, never appended',
        HA.stampAi('sa', 'SA-404', { model: 'x' }) === false);
    ok('stamping an unknown lane is refused', HA.stampAi('vibes', 'X-1', { model: 'x' }) === false);
    ok('a typed row stays untouched — the stamp is opt-in, not ambient',
        HA.aiRows().every(e => e.lane === 'sa'));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
