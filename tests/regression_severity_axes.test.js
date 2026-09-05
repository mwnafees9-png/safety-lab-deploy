#!/usr/bin/env node
/**
 * Regression — severity DERIVED from the three effect axes (3 Sep 2026).
 *
 * Waqas: "reduction in safety margins or reduction in functional capabilities —
 * none, slight, significant, large or hull loss — determine aircraft effect;
 * increase in crew workload — none, slight, significant, large or fatalities —
 * determine crew effect; pax effect is determined by slight inconvenience/none,
 * discomfort, minor injuries, severe injuries/few fatalities, multiple
 * fatalities." And: "I do not want to lose that context" — the effect sentences
 * stay; the levels classify.
 *
 * The suite EXECUTES severity_axes.js, then the extracted accept path with the
 * real module underneath it, so a level string that the model phrases loosely,
 * a class the model gets wrong, and a CSV round-trip are all proven, not argued.
 * Run: node tests/regression_severity_axes.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }
function loadAxes() {
  const ctx = { window: {}, console, setInterval: () => 0, clearInterval() {}, Math, String, Array, Object, Number };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(S('severity_axes.js'), ctx);
  return ctx.SLSeverityAxes;
}
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '('); if (i < 0) return null;
  let depth = 0, started = false, inS = null, esc2 = false, line = false, blk = false;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
    if (esc2) { esc2 = false; continue; }
    if (c === '\\') { esc2 = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { line = true; k++; continue; }
    if (c === '/' && n === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

// ---- 1. the module: closed vocabulary, worst axis, anchors ------------------
console.log('[1] severity_axes.js — the vocabulary and the derivation');
{
  const A = loadAxes();
  check('module loads without a DOM and exports derive/normLevel/levelsOf/effectsHtml/applyTerminal', !!(A && A.derive && A.normLevel && A.levelsOf && A.effectsHtml && A.applyTerminal));
  check('severity_axes >= 1.1 (floor, rule 12)', parseFloat(A._v) >= 1.1, A._v);
  check('the aircraft axis is exactly the five words Waqas gave', A.AXES.ac.levels.join('|') === 'none|slight|significant|large|hull loss');
  check('the crew axis is workload none…large then fatalities', A.AXES.crew.levels.join('|') === 'none|slight|significant|large|fatalities or incapacitation');
  check('the occupant axis is inconvenience…multiple fatalities', A.AXES.pax.levels.join('|') === 'none or slight inconvenience|discomfort|minor injuries|severe injuries or few fatalities|multiple fatalities');
  check('every axis step maps to a Table A6 anchor in the class order NSE→MIN→MAJ→HAZ→CAT',
    A.AXES.ac.anchors.join() === 'NSE-1,MIN-1,MAJ-1,HAZ-1,CAT-1' && A.AXES.crew.anchors.join() === 'NSE-1,MIN-2,MAJ-2,HAZ-2,CAT-1' && A.AXES.pax.anchors.join() === 'NSE-1,MIN-3,MAJ-3,HAZ-3,CAT-1');
  const d = A.derive({ effAcLevel: 'slight', effCrewLevel: 'significant', effPaxLevel: 'discomfort' });
  check('the class is the WORST axis (slight / significant / discomfort → Major, crew governs)', d && d.severity === 'Major' && d.governing.join() === 'crew' && d.anchor === 'MAJ-2', JSON.stringify(d));
  check('hull loss on the aircraft axis is Catastrophic whatever the others say', A.derive({ effAcLevel: 'hull loss', effCrewLevel: 'none', effPaxLevel: 'none' }).severity === 'Catastrophic');
  check('a tie names both governing axes', A.derive({ effAcLevel: 'large', effCrewLevel: 'large' }).governing.join() === 'ac,crew');
  check('no level set → null (the class stays the engineer\'s to type)', A.derive({}) === null && A.derive({ effAcLevel: 'banana' }) === null);
  check('one axis alone still derives (partial evidence is evidence)', A.derive({ effPaxLevel: 'minor injuries' }).severity === 'Major');
  // loose phrasing — accepted only when it names ONE level
  check('loose phrasing normalises: "Hull loss", "loss of the aircraft", "Severe injuries", "excessive"',
    A.normLevel('ac', 'Hull loss') === 'hull loss' && A.normLevel('ac', 'loss of the aircraft') === 'hull loss' && A.normLevel('pax', 'Severe injuries') === 'severe injuries or few fatalities' && A.normLevel('crew', 'excessive') === 'large');
  check('numbers 0–4 are accepted as level indices', A.normLevel('ac', 2) === 'significant' && A.normLevel('ac', '4') === 'hull loss');
  check('an off-list phrase is EMPTY, never a guess', A.normLevel('ac', 'moderate') === '' && A.normLevel('pax', 'bad') === '' && A.normLevel('crew', null) === '');
  check('the rationale names all three axes and the governing one', /Aircraft slight · Crew significant · Occupants discomfort → Major \(crew axis governs\)/.test(A.rationale({ effAcLevel: 'slight', effCrewLevel: 'significant', effPaxLevel: 'discomfort' })));
  const html = A.effectsHtml({ effAcLevel: 'large', effAc: 'Two of three channels lost <x>', effCrew: 'Manual reversion', effPax: 'None' });
  check('the Effects cell keeps the SENTENCE (the context) and adds the level chip', /sev-axis-chip[^>]*>large<\/span>Two of three channels lost &lt;x&gt;/.test(html) && /<strong>Crew:<\/strong> Manual reversion/.test(html));
  check('a row without levels renders exactly the old three lines', A.effectsHtml({ effAc: 'a', effCrew: 'b', effPax: 'c' }) === '<strong>AC:</strong> a<br><strong>Crew:</strong> b<br><strong>Pax:</strong> c');
}

// ---- 1b. THE TOP STEP IS JOINT (Waqas ruling, 3 Sep 2026) -------------------
// "if you're losing the aircraft, the effect for the other two should be
// automatically multiple fatalities, there is no further argument, with the
// assumption the situation is not recoverable with crew action" — and "you dont
// need human factors to play a part there". Both live defects are pinned here.
console.log('\n[1b] the catastrophic step is one joint end state');
{
  const A = loadAxes();
  check('all three axes carry the SAME anchor at the top step — CAT-1 (the table already said it)',
    A.AXES.ac.anchors[4] === 'CAT-1' && A.AXES.crew.anchors[4] === 'CAT-1' && A.AXES.pax.anchors[4] === 'CAT-1');
  // SF-002-M2, live 3 Sep: large / large / multiple fatalities — a survivable aircraft
  // and a working pilot beside six dead occupants. Two moments in one row.
  const m2 = A.applyTerminal({ effAcLevel: 'large', effCrewLevel: 'large', effPaxLevel: 'multiple fatalities' });
  check('SF-002-M2 shape: occupants at the top step carry the aircraft and crew there',
    m2.levels.effAcLevel === 'hull loss' && m2.levels.effCrewLevel === 'fatalities or incapacitation' && m2.changed.join() === 'ac,crew', JSON.stringify(m2.levels));
  // SF-005-M, live 3 Sep: hull loss / EMPTY / multiple fatalities — the model abstained
  // on the crew axis citing HF §9 open item 15, a workload question on an axis whose
  // top step is a fatality question.
  const m5 = A.applyTerminal({ effAcLevel: 'hull loss', effCrewLevel: '', effPaxLevel: 'multiple fatalities' });
  check('SF-005-M shape: an EMPTY crew axis beside hull loss is completed, not left blank',
    m5.levels.effCrewLevel === 'fatalities or incapacitation' && m5.changed.join() === 'crew');
  check('hull loss alone determines both other axes with no further input',
    (function () { const r = A.applyTerminal({ effAcLevel: 'hull loss' }); return r.levels.effCrewLevel === 'fatalities or incapacitation' && r.levels.effPaxLevel === 'multiple fatalities'; })());
  check('it runs in every direction — crew fatalities carry the aircraft and occupants',
    (function () { const r = A.applyTerminal({ effCrewLevel: 'fatalities or incapacitation' }); return r.levels.effAcLevel === 'hull loss' && r.levels.effPaxLevel === 'multiple fatalities'; })());
  check('BELOW the top step the axes stay independent — nothing is propagated',
    (function () { const r = A.applyTerminal({ effAcLevel: 'large', effCrewLevel: 'slight', effPaxLevel: 'discomfort' }); return r.changed.length === 0 && r.levels.effCrewLevel === 'slight'; })());
  check('an untouched row reports no determination and carries no assumption',
    A.applyTerminal({ effAcLevel: 'significant' }).assumption === '' && A.applyTerminal({}).changed.length === 0);
  check('the standing assumption is recorded whenever it fires, and names non-recoverability',
    /not recoverable by crew action/.test(m5.assumption) && /CAT-1/.test(m5.assumption));
  check('the note names which axes were set and why', /crew set to "fatalities or incapacitation"/.test(A.terminalNote(m5)) && /catastrophic step/.test(A.terminalNote(m5)));
  check('the rationale prints the COMPLETED levels, never "Crew —" beside a catastrophic class',
    /Crew fatalities or incapacitation/.test(A.rationale({ effAcLevel: 'hull loss', effCrewLevel: '', effPaxLevel: 'multiple fatalities' })));
  check('three governing axes reads as the joint state, not a list (rule 22)',
    /all three axes at the catastrophic step/.test(A.rationale({ effAcLevel: 'hull loss' })) && /crew axis governs/.test(A.rationale({ effAcLevel: 'slight', effCrewLevel: 'significant' })));
  check('derive() classifies the JOINT state — SF-002-M2 is Catastrophic on the aircraft axis, not on occupants alone',
    (function () { const d = A.derive({ effAcLevel: 'large', effCrewLevel: 'large', effPaxLevel: 'multiple fatalities' }); return d.severity === 'Catastrophic' && d.governing.join() === 'ac,crew,pax'; })(),
    JSON.stringify(A.derive({ effAcLevel: 'large', effCrewLevel: 'large', effPaxLevel: 'multiple fatalities' })));
  check('the occupant axis can no longer govern ALONE at the top step (the 5-of-5 defect bucket)',
    (function () { const d = A.derive({ effAcLevel: 'large', effPaxLevel: 'multiple fatalities' }); return d.governing.length === 3; })());
}

// ---- 1c. an abstention is not a level ---------------------------------------
// Waqas, on SF-005-M: "how is the crew surviving here with the aircraft lost and
// passengers dead?" — it was not. The crew axis was EMPTY and the cell printed the
// word "None", which reads as a stated level of none.
console.log('\n[1c] blank renders as blank, never as "None"');
{
  const A = loadAxes();
  const html = A.effectsHtml({ effAcLevel: 'significant', effAc: 'Margins reduced', effCrew: '', effPax: '' });
  check('an unstated axis reads "not stated", not "None"', /not stated/.test(html) && !/>None</.test(html), html.slice(0, 240));
  check('a stated sentence still renders verbatim', /Margins reduced/.test(html));
  check('a level with no sentence says so rather than inventing one',
    /level only — no effect stated/.test(A.effectsHtml({ effCrewLevel: 'slight' })));
}

// ---- 2. wiring -------------------------------------------------------------
console.log('\n[2] wiring — index.html, the two row builders, the forms');
{
  const idx = S('index.html'), h = S('helpers_modules.js'), sa = S('severity_axes.js');
  check('index.html loads severity_axes.js after helpers_modules.js', /helpers_modules\.js\?v=[\d.]+" defer><\/script>\s*<script src="cloud_writer\.js[^>]*><\/script>\s*<script src="severity_axes\.js\?v=/.test(idx));
  check('severity_axes pinned >= 1.1 (floor, rule 12)', parseFloat((idx.match(/severity_axes\.js\?v=([\d.]+)/) || [])[1]) >= 1.1);
  check('helpers ≥ 2.75 (floor)', parseFloat((idx.match(/helpers_modules\.js\?v=([\d.]+)/) || [])[1]) >= 2.75);
  check('BOTH FHA row builders render the effects cell through the axes module, with the old cell as fallback', (h.match(/SLSeverityAxes\.effectsHtml\(row\)/g) || []).length === 2 && (h.match(/<strong>AC:<\/strong> \$\{esc\(row\.effAc \|\| 'None'\)\}/g) || []).length === 2);
  check('pickers inject under the effect inputs of both forms (ac-fha / sys-fha) and drive the severity select', /_injectPickers\('ac-fha'\); _injectPickers\('sys-fha'\)/.test(sa) && /sev\.disabled = true/.test(sa));
  check('submit/edit are wrapped for both forms and the wrapper is registered with SLWrap', /_wireForm\('ac-fha', 'submitACFHA', 'editACFHA'\)/.test(sa) && /_wireForm\('sys-fha', 'submitSysFHA', 'editSysFHA'\)/.test(sa) && /SLWrap\.preserve\(orig, wrapped\)/.test(sa));
  check('the disabled select is re-enabled for the instant of submit (a disabled control does not submit)', /sev\.disabled = false; sev\.value = d\.severity/.test(sa));
  check('the form ids the module targets exist in index.html', /id="ac-fha-eff-ac"/.test(idx) && /id="sys-fha-eff-ac"/.test(idx) && /id="ac-fha-sev"/.test(idx) && /id="sys-fha-sev"/.test(idx));
}

// ---- 3. the drafter: every path carries the rule, the schema asks for it ---
console.log('\n[3] the drafter — fha.draft v5');
{
  const ai = S('ai_assistant.js'), sk = S('ai_skills.js');
  const spec = (ai.match(/const _SPEC_FHA = \[[\s\S]*?\]\.join/) || [''])[0];
  check('_SPEC_FHA carries the THREE EFFECT AXES rule (the shared body every path gets by construction)', /THREE EFFECT AXES, CLOSED VOCABULARY/.test(spec));
  check('the rule tells the model the product DERIVES the class from its levels', /the product recomputes it from your levels on accept/.test(spec));
  check('the rule sends the model to the human-factors record for the crew axis and to failures-to-catastrophe for the aircraft axis', /human-factors record for this condition/.test(spec) && /how many further failures until a catastrophic outcome/.test(spec));
  check('the rule keeps the sentences ("the levels classify, the sentences show the full picture")', /the levels classify, the sentences show the full picture/.test(spec));
  check('the registry body carries the same rule (byte-identity is regression_ai_skills\' job; presence is this one\'s)', /THREE EFFECT AXES, CLOSED VOCABULARY/.test(sk));
  check('fha.draft and sfha.draft registered at v5+ with a NOT YET MEASURED note', Number((sk.match(/'fha\.draft': (\d+)/) || [])[1]) >= 5 && Number((sk.match(/'sfha\.draft': (\d+)/) || [])[1]) >= 5 && /NOT YET MEASURED/.test(sk));
  check('v5 tells the model all three axes describe ONE credited outcome', /ONE CREDITED OUTCOME/.test(spec) && /two different moments and is WRONG/.test(spec) && /ONE CREDITED OUTCOME/.test(sk));
  check('v5 makes the top step joint and needs no HF evidence for it', /THE TOP STEP IS JOINT/.test(spec) && /DO NOT look for human-factors evidence/.test(spec) && /NEVER abstain on the crew or occupant axis/.test(spec) && /THE TOP STEP IS JOINT/.test(sk));
  check('v5 keeps the occupant axis downstream and off the driving seat', /DOWNSTREAM of the aircraft and crew effects and almost never the axis that drives the class/.test(spec));
  check('v5 states the converse — recoverable by crew action means it is NOT hull loss', /if crew action can arrest the condition, it is NOT hull loss/.test(spec));
  const schema = (ai.match(/Return STRICT JSON only — no prose, no markdown fences:',\s*'\{ "rows": \[[^\n]*/) || [''])[0];
  check('the panel JSON schema asks for effAcLevel / effCrewLevel / effPaxLevel and sevBasis', /"effAcLevel"/.test(schema) && /"effCrewLevel"/.test(schema) && /"effPaxLevel"/.test(schema) && /"sevBasis"/.test(schema));
  check('the chat add_fha action carries the three levels too', /add_fha \{[^}]*effAcLevel, effCrewLevel, effPaxLevel/.test(ai) && /effAcLevel: a\.effAcLevel, effCrewLevel: a\.effCrewLevel, effPaxLevel: a\.effPaxLevel/.test(ai));
  check('the batch path normalises the levels and now carries sevBasis (it dropped the anchor before)', /effAcLevel: _axisLevel\('ac', x\.effAcLevel\)/.test(ai) && /sevBasis: String\(x\.sevBasis \|\| ''\)\.trim\(\)/.test(ai));
  check('a declined level counts as an abstention on the review card and in the delta log', /_FHA_ASKED = \['effAc', 'effCrew', 'effPax', 'effAcLevel', 'effCrewLevel', 'effPaxLevel'/.test(ai) && /effAcLevel: 'Aircraft level'/.test(ai));
  check('the review card shows the levels and the class they derive, flagging a model class the levels overrule', /_axisLevelsHtml\(s\)/.test(ai) && /the levels govern/.test(ai));
}

// ---- 4. accept path, EXECUTED with the real module underneath ---------------
console.log('\n[4] accept — the class is derived, the model\'s class is recorded, the sentences survive');
{
  const ai = S('ai_assistant.js');
  // 3 Sep 2026 (evening) — accept now de-dups (_fhaUpsert + _fhaPhaseKeyOf) and sweeps the
  // AI ledger (_promoteLedgerForFha); real code, so it rides in rather than being stubbed.
  const src = [extractFn(ai, '_axisLevel'), extractFn(ai, '_axisDerive'), extractFn(ai, '_fhaPhaseKeyOf'), extractFn(ai, '_fhaUpsert'), extractFn(ai, '_promoteLedgerForFha'), 'var _fhaScope = null; var _fhaOneSeq = 0;', extractFn(ai, '_fhaScopeToken'), extractFn(ai, '_fhaScrapOld'), extractFn(ai, '_applyFhaSuggestion')].join('\n');
  check('extracted _axisLevel/_axisDerive/_applyFhaSuggestion', /function _axisLevel/.test(src) && /function _axisDerive/.test(src) && /function _applyFhaSuggestion/.test(src));
  let minted = 0;
  const ctx = {
    console, Date, Math, JSON, Array, String, Object, Number,
    newRowId: (() => { let n = 100; return () => ++n; })(),
    _validPhases: p => Array.isArray(p) ? p : [],
    _macCommentFor: () => '',   // 4 Sep 2026 (evening)
    _SEV_ANCHORS: { 'CAT-1': 'Catastrophic', 'HAZ-1': 'Hazardous', 'HAZ-2': 'Hazardous', 'HAZ-3': 'Hazardous', 'MAJ-1': 'Major', 'MAJ-2': 'Major', 'MAJ-3': 'Major', 'MIN-1': 'Minor', 'MIN-2': 'Minor', 'MIN-3': 'Minor', 'NSE-1': 'No Safety Effect' },
    _skillStampFor: () => 'fha.draft@v4#test',
    _slAutoNumber: (k, d) => { if (!d.fcId) d.fcId = 'FC-' + (++minted); return d; },
    _promoteDeclaredAssumptions: list => (list || []).map((a, i) => 'ASM-AC-00' + (i + 1)),
    acExtractedFCs: [], acFhaData: [], systemsData: [],
    renderACFHA() {}, renderACAssumptions() {}, renderSysFHA() {}, scheduleAutosave() {}, _aiConsistencyAutoCheck() {}, _toast() {},
    setInterval: () => 0, clearInterval() {}
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(S('severity_axes.js'), ctx);
  vm.runInContext(src + '; globalThis.__ap = _applyFhaSuggestion;', ctx);
  // a. levels set, model class WRONG → derived wins, disagreement recorded, sentences kept
  ctx.__ap({ subId: 'SF-1', fcDesc: 'Partial loss of pitch authority', phases: ['Cruise'], effAc: 'One of two channels lost; margins reduced', effCrew: 'Workload rises: manual trim', effPax: 'None',
             effAcLevel: 'Significant', effCrewLevel: 'slight', effPaxLevel: 'none', severity: 'Hazardous', sevBasis: 'HAZ-1', severityRationale: 'r', _model: 'm', _assumptions: [{ text: 'A1' }] });
  const r1 = ctx.acFhaData[0];
  check('the class is DERIVED from the levels (significant → Major), not the model\'s Hazardous', r1 && r1.severity === 'Major', r1 && r1.severity);
  check('the anchor is the governing axis\' Table A6 anchor (MAJ-1), the model\'s HAZ-1 is dropped', r1 && r1.sevBasis === 'MAJ-1');
  check('the levels ride on the row, normalised', r1 && r1.effAcLevel === 'significant' && r1.effCrewLevel === 'slight' && r1.effPaxLevel === 'none or slight inconvenience');   // pax "none" → the vocabulary's own phrase
  check('the effect SENTENCES survive untouched (the context Waqas will not lose)', r1 && r1.effAc === 'One of two channels lost; margins reduced' && r1.effCrew === 'Workload rises: manual trim');
  check('the disagreement is recorded in the comments, with the axis rationale', r1 && /Model proposed Hazardous; the class is derived from the levels/.test(r1.comments) && /Aircraft significant · Crew slight · Occupants none or slight inconvenience → Major \(aircraft axis governs\)/.test(r1.comments));
  check('the declared assumptions land in the row\'s assumptions column (Stage B)', r1 && Array.isArray(r1.assumptionIds) && r1.assumptionIds.join() === 'ASM-AC-001');
  // a2. the joint top step lands on accept, and is recorded
  ctx.__ap({ subId: 'SF-9', fcDesc: 'Uncommanded vertical lift thrust', phases: [], effAc: 'Excursion among buildings', effCrew: 'Pilot fights it', effPax: 'Six occupants exposed',
             effAcLevel: 'large', effCrewLevel: 'large', effPaxLevel: 'multiple fatalities', severity: 'Catastrophic', sevBasis: 'CAT-1', severityRationale: 'r', _model: 'm' });
  const rT = ctx.acFhaData[ctx.acFhaData.length - 1];
  check('accept completes the joint top step (large/large/multiple fatalities -> all three catastrophic)',
    rT && rT.effAcLevel === 'hull loss' && rT.effCrewLevel === 'fatalities or incapacitation' && rT.effPaxLevel === 'multiple fatalities', rT && [rT.effAcLevel, rT.effCrewLevel, rT.effPaxLevel].join(' / '));
  check('the determination is recorded in the comments with its assumption',
    rT && /Top step is joint/.test(rT.comments) && /not recoverable by crew action/.test(rT.comments));
  check('the effect SENTENCES are untouched by the determination', rT && rT.effAc === 'Excursion among buildings' && rT.effCrew === 'Pilot fights it');

  // b. no levels → the model's class + anchor pass through exactly as before (v3 behaviour)
  ctx.__ap({ subId: 'SF-2', fcDesc: 'x', phases: [], effAc: 'a', effCrew: 'b', effPax: 'c', severity: 'Minor', sevBasis: 'MIN-2', severityRationale: 'r', _model: 'm' });
  const r2 = ctx.acFhaData[ctx.acFhaData.length - 1];
  check('with no levels the model\'s class and anchor pass through (v3 behaviour intact)', r2 && r2.severity === 'Minor' && r2.sevBasis === 'MIN-2' && r2.effAcLevel === '' && !/derived from the levels/.test(r2.comments));
  // c. levels set, model abstained on severity → the levels still classify
  ctx.__ap({ subId: 'SF-3', fcDesc: 'y', phases: [], effAc: 'a', effCrew: 'b', effPax: 'c', effAcLevel: 'hull loss', severity: '', severityRationale: 'thin', _model: 'm' });
  const r3 = ctx.acFhaData[ctx.acFhaData.length - 1];
  check('an abstained class with a grounded level is classified from the level (hull loss → Catastrophic, CAT-1)', r3 && r3.severity === 'Catastrophic' && r3.sevBasis === 'CAT-1' && !/SEVERITY NOT DETERMINED/.test(r3.comments));
  check('and hull loss alone completed the other two axes on the stored row', r3 && r3.effCrewLevel === 'fatalities or incapacitation' && r3.effPaxLevel === 'multiple fatalities');
  // d. off-list level strings are dropped, never guessed
  ctx.__ap({ subId: 'SF-4', fcDesc: 'z', phases: [], effAc: 'a', effCrew: 'b', effPax: 'c', effAcLevel: 'moderate', effCrewLevel: 'huge', severity: '', severityRationale: 'thin', _model: 'm' });
  const r4 = ctx.acFhaData[ctx.acFhaData.length - 1];
  check('off-list levels are dropped and the row stays unclassified', r4 && r4.effAcLevel === '' && r4.effCrewLevel === '' && r4.severity === '' && /SEVERITY NOT DETERMINED/.test(r4.comments));
}

// ---- 5. CSV round trip -------------------------------------------------------
console.log('\n[5] CSV — the levels export and import on both FHAs');
{
  const d = S('data_ops_modules.js');
  check('AC and System FHA exports (download + report) carry Aircraft/Crew/Pax Level after the effects', (d.match(/'Effect on Pax','Aircraft Level','Crew Level','Pax Level','Severity'/g) || []).length === 4);
  check('the rows emit the level fields in the same positions', (d.match(/r\.effAcLevel \|\| '', r\.effCrewLevel \|\| '', r\.effPaxLevel \|\| ''/g) || []).length === 4);
  check('import reads the three columns through the closed vocabulary (off-list → empty)', (d.match(/effAcLevel: _axisLvl\('ac', getValue\(row, \['Aircraft Level'\]\)\)/g) || []).length === 2 && /function _axisLvl\(axis, v\)/.test(d));
  check('data_ops ≥ 66.36 (floor)', parseFloat((S('index.html').match(/data_ops_modules\.js\?v=([\d.]+)/) || [])[1]) >= 66.36);
}

// ---- 6. the scorer knows the axes --------------------------------------------
console.log('\n[6] eval — per-axis agreement is measurable before the campaign runs');
{
  const e2 = fs.readFileSync(path.join(__dirname, '..', 'eval', 'e2_score.mjs'), 'utf8');
  check('e2_score reports per-axis level agreement on both-set pairs', /axes\[ax\] = \{ set: \[setA, setB\], both, agree, agreement/.test(e2) && /invalidSeverities: \[\.\.\.badSev\(draws\[t1\]\), \.\.\.badSev\(draws\[t2\]\)\],\s*axes/.test(e2));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
