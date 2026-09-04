#!/usr/bin/env node
/**
 * Regression — F15 step 3: THE MAC DRAFTER (Waqas, 4 Sep 2026: "the thread should run
 * CoFFE interdependence and MAC"; fault trees are compiled from these, "no room to
 * hallucinate").
 *
 *   · skill mac.draft v1, feature mac.draft, lane SafetyLabAI.draftMac (capture-guarded);
 *   · op add_mac {subId, phase, clauses:[{min, of:[system function ids]}], sddRef, rationale}
 *     lands in projectConfig.macModels in the SAME shape macSaveDraft writes, as an
 *     assumption carrying the citation; members resolve by fid or by function name;
 *     unknown members are reported, never invented; the phase must be a mission-profile
 *     box; a signed rule is never overwritten; the model's own untouched rule is updated.
 * Run: node tests/regression_thread_mac.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const drv = fs.readFileSync(path.join(__dirname, '..', 'eval', 'golden_thread_driver.js'), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '('); if (i < 0) return null;
  let depth = 0, started = false, inS = null, esc = false, line = false, blk = false;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { line = true; k++; continue; }
    if (c === '/' && n === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('[1] the lane, the skill, the op');
{
  const sb = { window: {}, console: { info: function () {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(SITE, 'ai_skills.js'), 'utf8'), sb);
  const S = sb.window.SLABSkills;
  check('mac.draft is a registered skill at v2 (v2: arbitration from the document, never guessed)', S && S.skills['mac.draft'] && /^mac\.draft@v2#[0-9a-f]{8}$/.test(S.stampFor('mac.draft')));
  const body = S ? S.skills['mac.draft'].body : '';
  check('… the body asks for arbitration only where the document states it, and to omit it otherwise', /ARBITRATION \(4 Sep 2026, F16c\)/.test(body) && /OMIT arbitration entirely — never guess a scheme or a k/.test(body) && /arbitration\?:\{scheme:"voting"\|"none", k, of\?, ref\}/.test(body));
  check('the body counts CONFIGURATION ITEMS — the redundant copies — not different functions', /WHAT A CLAUSE COUNTS \(Waqas ruling, 4 Sep 2026\): a clause is "at least MIN of these CONFIGURATION ITEMS available"/.test(body) && /NOT a count of different functions/.test(body) && /how much control \/ configuration authority must remain available for continued safe flight and landing/.test(body));
  check('… shape matters: a symmetric / per-side minimum is one clause per group, never a flat count', /SHAPE MATTERS/.test(body) && /at least 1 of \[left engines\] AND at least 1 of \[right engines\]/.test(body) && /both engines lost on one side/.test(body));
  check('… the numbers come from the document; silence → conservative (min = all) and say so', /WHERE THE NUMBERS COME FROM: the document's redundancy, dispatch and performance statements/.test(body) && /every copy required, min = all/.test(body));
  check('… never a weaker clause than the document supports, never a duplicate, never an off-profile phase', /make a clause weaker than the document supports \(a lower minimum, or a flat count where the document says per side\)/.test(body) && /duplicate a rule the project already holds/.test(body) && /name a phase that is not in the project's mission profile/.test(body));
  check('draftMac is a public, capture-guarded entry point', /draftMac:\s+_captureGuard\('draftMac', draftMac\)/.test(ai));
  check('it refuses without aircraft functions and without system functions (no members)', /a MAC rule floors an aircraft function/.test(ai) && /MAC members are system functions/.test(ai));
  check('it only asks for sub-functions that have no rule yet', /subs\.filter\(function \(id\) \{ return !existing\.some\(function \(r\) \{ return String\(r\.subId\) === String\(id\); \}\); \}\)/.test(ai));
  check('the op spec teaches add_mac and says the rule is filed as an assumption until substantiated', /- add_mac \{subId, phase, clauses:\[\{min, of:\[configuration item ids\]\}\], sddRef, rationale, arbitration\?\}/.test(ai) && /REDUNDANT CONFIGURATION ITEMS available/.test(ai) && /omit it otherwise — never guess/.test(ai) && /Filed as an assumption carrying sddRef until the engineer substantiates it/.test(ai));
  check('the executor routes add_mac; the review card titles it', /case 'add_mac': \{ const r2 = _chatAddMac\(a, model\);/.test(ai) && /add_mac: 'MAC rule'/.test(ai));
  check('the project state given to the model lists existing MAC rules (update, do not repeat)', /mac:\s+\(\(typeof projectConfig !== 'undefined' && projectConfig && projectConfig\.macModels\) \|\| \[\]\)\.slice\(0, 60\)/.test(ai));
  check('the golden thread runs mac after systems and BEFORE the system FCIM / SFHA (aircraft level first, generic)', drv.indexOf("step: 'mac'") > drv.indexOf("step: 'systems'") && drv.indexOf("step: 'mac'") < drv.indexOf("step: 'sfcim'") && drv.indexOf("step: 'fcim'") < drv.indexOf("step: 'systems'"));
  // 4 Sep 2026 (Waqas): "total loss will be loss outside mac and partial within mac limits"
  const sbk = { window: {}, console: { info: function () {} } }; vm.createContext(sbk);
  vm.runInContext(fs.readFileSync(path.join(SITE, 'ai_skills.js'), 'utf8'), sbk);
  const fcimBody = sbk.window.SLABSkills.skills['fcim.draft'].body;
  check('fcim.draft is at v4: TOTAL LOSS / PARTIAL LOSS defined by the MAC, condition text plain (Waqas, 4 Sep evening)', /^fcim\.draft@v4#/.test(sbk.window.SLABSkills.stampFor('fcim.populate')) && /TOTAL LOSS AND PARTIAL LOSS ARE DEFINED BY THE MAC/.test(fcimBody) && /TOTAL LOSS = the loss takes the aircraft outside the MAC/.test(fcimBody) && /PARTIAL LOSS \(degraded\) = the loss stays within the MAC/.test(fcimBody) && !/TL MODELLING STYLES/.test(fcimBody) && /Never offer two styles or choose one yourself/.test(fcimBody));
  check('the condition TEXT is "Total loss of" / "Partial loss of"; "MAC" never appears in a condition; the MAC is stated in the FHA comments', /"Total loss of", "Partial loss of", "Erroneous", "Uncommanded", "Inadvertent", "Undetected"/.test(fcimBody) && /never write "MAC" into a condition/.test(fcimBody) && /the hazard analysis \(the FHA row's comments\) states it/.test(fcimBody) && /"Total loss of propulsive thrust" is RIGHT/.test(fcimBody) && !/outside MAC limits"/.test(fcimBody));
  check('at aircraft level: no copies, counts, channels, sides or system names; at system level the MAC detail is parsed out', /AT AIRCRAFT LEVEL: never copies, counts, channels, sides or system names/.test(fcimBody) && /AT SYSTEM LEVEL \(system FCIM \/ SFHA\) the MAC detail IS parsed out/.test(fcimBody));
  check('every accepted loss-form FHA row opens its comment with the MAC definition and the rule in plain words', /function _macCommentFor\(s, sysScoped\)/.test(ai) && /\+ _macCommentFor\(s, sysScoped\)/.test(ai) && /MAC — total loss: the loss takes the aircraft outside the minimum acceptable configuration/.test(ai) && /Rule: not yet defined for this function/.test(ai));
  check('the AIRCRAFT FCIM drafter is handed NO MAC rules; the SYSTEM FCIM and SFHA drafters are', !/_anemBatch\(_FEATURE_DIRECTIVE\.fcim \+ _macRulesForPrompt/.test(ai) && /function _macRulesForSystemPrompt\(systemId\)/.test(ai) && (ai.match(/\(scope\.systemId \? \('\\n' \+ _macRulesForSystemPrompt\(scope\.systemId\)\) : ''\)/g) || []).length === 2);
  check('system-scope entry points exist for the thread (populateSysFcim, populateSfha), capture-guarded', /populateSysFcim: _captureGuard\('populateSysFcim'/.test(ai) && /populateSfha: _captureGuard\('populateSfha'/.test(ai));
}

console.log('\n[2] executed — add_mac lands in the store\'s own shape');
{
  const ctx = { console, String, Array, Math, Date, Object, parseInt, JSON };
  ctx.projectConfig = { macModels: [] };
  ctx.snapshot = () => ({
    acFunctionsData: [{ subId: '1.1', subName: 'Provide pitch control' }, { subId: '2.3', subName: 'Provide wheel braking' }],
    systemsData: [
      { id: 'sys-fcs', name: 'Flight Control', functions: [{ funcId: 'FCS-F1', funcName: 'Command elevator channel A' }, { funcId: 'FCS-F2', funcName: 'Command elevator channel B' }] },
      { id: 'sys-brk', name: 'Wheel Brake', functions: [{ funcId: 'BRK-F1', funcName: 'Apply wheel brakes' }] },
    ],
  });
  ctx._validPhases = v => v.map(x => ({ 'landing': 'Landing', 'all phases': 'All phases' }[String(x).toLowerCase()])).filter(Boolean);
  vm.createContext(ctx);
  vm.runInContext(extractFn(ai, '_chatAddMac') + '\n', ctx);
  const r1 = vm.runInContext(`_chatAddMac({ subId: '1.1', phase: 'All phases', clauses: [{ min: 1, of: ['FCS-F1', 'fcs-f2'] }], sddRef: 'SDD §4.2', rationale: 'two channels, either suffices' }, 'claude-opus-4-8')`, ctx);
  const rules = ctx.projectConfig.macModels;
  check('a rule lands: subId, phase, one clause "1 of [FCS-F1, FCS-F2]" (fid resolved case-insensitively)', r1.ok && rules.length === 1 && rules[0].subId === '1.1' && rules[0].phase === 'All phases' && JSON.stringify(rules[0].clauses) === '[{"min":1,"of":["FCS-F1","FCS-F2"]}]', JSON.stringify(r1) + ' ' + JSON.stringify(rules));
  check('… as an ASSUMPTION carrying the SDD citation, signed by the model as "proposed, not yet substantiated"', rules[0].substantiation.kind === 'assumption' && rules[0].substantiation.ref === 'SDD §4.2' && /^AI \(claude-opus-4-8\) — proposed, not yet substantiated$/.test(rules[0].substantiation.by));
  check('… in macSaveDraft\'s shape (level 0, floor null, contributions [])', rules[0].level === 0 && rules[0].floor === null && Array.isArray(rules[0].contributions) && rules[0].aiGenerated === true && rules[0].aiRationale === 'two channels, either suffices');
  const r2 = vm.runInContext(`_chatAddMac({ subId: '2.3', phase: 'landing', clauses: [{ min: 3, of: ['Apply wheel brakes', 'Hydraulic pump X'] }] }, 'm')`, ctx);
  check('a member named by function NAME resolves; an unknown member is dropped and REPORTED, not invented', r2.ok && rules[1].clauses[0].of.join() === 'BRK-F1' && /1 member\(s\) not found: Hydraulic pump X/.test(r2.summary) && rules[1].aiUnknownMembers[0] === 'Hydraulic pump X', JSON.stringify(r2));
  check('min is clamped to the members that exist; the phase is written in the profile\'s spelling', rules[1].clauses[0].min === 1 && rules[1].phase === 'Landing');
  const r3 = vm.runInContext(`_chatAddMac({ subId: '2.3', phase: 'Hover', clauses: [{ min: 1, of: ['BRK-F1'] }] }, 'm')`, ctx);
  check('a phase that is not a mission-profile box is refused (the AI never adds a phase)', !r3.ok && /not in this project's mission profile/.test(r3.error), JSON.stringify(r3));
  const r4 = vm.runInContext(`_chatAddMac({ subId: '9.9', clauses: [{ min: 1, of: ['BRK-F1'] }] }, 'm')`, ctx);
  check('an unknown aircraft sub-function is refused', !r4.ok && /no aircraft sub-function 9\.9/.test(r4.error));
  const r5 = vm.runInContext(`_chatAddMac({ subId: '1.1', clauses: [{ min: 1, of: ['Nothing real'] }] }, 'm')`, ctx);
  check('a rule whose clauses name no known member is refused (no empty rule)', !r5.ok && /no clause names a known system function/.test(r5.error));
  ctx.snapshot = () => ({
    acFunctionsData: [{ subId: '1.1', subName: 'Provide pitch control' }, { subId: '2.3', subName: 'Provide wheel braking' }, { subId: '3.1', subName: 'Provide thrust' }],
    systemsData: [
      { id: 'sys-fcs', name: 'Flight Control', functions: [{ funcId: 'FCS-F1', funcName: 'Command elevator channel A' }, { funcId: 'FCS-F2', funcName: 'Command elevator channel B' }] },
      { id: 'sys-brk', name: 'Wheel Brake', functions: [{ funcId: 'BRK-F1', funcName: 'Apply wheel brakes' }] },
      { id: 'sys-eng1', name: 'Engine 1 (left outboard)', functions: [] }, { id: 'sys-eng2', name: 'Engine 2 (left inboard)', functions: [] }, { id: 'sys-eng3', name: 'Engine 3 (right inboard)', functions: [] }, { id: 'sys-eng4', name: 'Engine 4 (right outboard)', functions: [] },
    ],
    itemsData: [{ itemId: 'ITM-007', name: 'Brake control unit A' }, { itemId: 'ITM-008', name: 'Brake control unit B' }],
  });
  const r8 = vm.runInContext(`_chatAddMac({ subId: '3.1', phase: 'All phases', clauses: [{ min: 1, of: ['sys-eng1', 'Engine 2 (left inboard)'] }, { min: 1, of: ['sys-eng3', 'sys-eng4'] }], sddRef: 'SDD §3.1', rationale: 'two-engine minimum, symmetric' }, 'm')`, ctx);
  check('members may be SYSTEMS (four engines) — a symmetric minimum lands as one clause per side', r8.ok && JSON.stringify(rules[rules.length - 1].clauses) === '[{"min":1,"of":["sys-eng1","sys-eng2"]},{"min":1,"of":["sys-eng3","sys-eng4"]}]', JSON.stringify(r8) + JSON.stringify(rules[rules.length - 1].clauses));
  const r9 = vm.runInContext(`_chatAddMac({ subId: '2.3', phase: 'All phases', clauses: [{ min: 1, of: ['ITM-007', 'Brake control unit B'] }] }, 'm')`, ctx);
  check('members may be ITEMS (two brake control units), by id or by name', r9.ok && JSON.stringify(rules.find(r => r.subId === '2.3' && r.phase === 'All phases').clauses) === '[{"min":1,"of":["ITM-007","ITM-008"]}]', JSON.stringify(r9));
  const r6 = vm.runInContext(`_chatAddMac({ subId: '1.1', phase: 'All phases', clauses: [{ min: 2, of: ['FCS-F1', 'FCS-F2'] }], sddRef: 'SDD §4.3' }, 'm')`, ctx);
  check('the model\'s own untouched rule for the same sub-function + phase is UPDATED in place, keeping its id', r6.ok && /updated in place/.test(r6.summary) && rules.filter(r => r.subId === '1.1').length === 1 && rules[0].clauses[0].min === 2 && rules[0].substantiation.ref === 'SDD §4.3');
  vm.runInContext(`projectConfig.macModels[0].substantiation = { kind: 'sdd', ref: 'SDD-FCS-041', by: 'J. Okafor', at: 'x' }`, ctx);
  const r7 = vm.runInContext(`_chatAddMac({ subId: '1.1', phase: 'All phases', clauses: [{ min: 1, of: ['FCS-F1'] }] }, 'm')`, ctx);
  check('a rule the engineer has substantiated is NEVER overwritten', !r7.ok && /a signed rule already exists — not overwritten/.test(r7.error) && rules[0].clauses[0].min === 2);
  // run 3 (4 Sep) — a short name that is a whole-word fragment of exactly one project name resolves.
  vm.runInContext(`projectConfig.macModels = projectConfig.macModels.filter(r => r.subId !== '1.1')`, ctx);
  vm.runInContext(`snapshot = () => ({ acFunctionsData: [{ subId: '1.1', subName: 'Provide pitch control' }, { subId: '2.3', subName: 'Provide wheel braking' }], systemsData: [ { id: 'sys-fcs', name: 'Flight Control', functions: [{ funcId: 'FCS-F1', funcName: 'Command elevator channel A' }, { funcId: 'FCS-F2', funcName: 'Command elevator channel B' }] }, { id: 'sys-brk', name: 'Wheel Brake', functions: [{ funcId: 'BRK-F1', funcName: 'Apply wheel brakes' }] } ], itemsData: [ { internalId: 501, itemId: 'ITM-001', name: 'Flight control computer 1 (FCC 1)', owningSystemId: 'sys-fcs' }, { internalId: 502, itemId: 'ITM-002', name: 'Flight control computer 2 (FCC 2)', owningSystemId: 'sys-fcs' }, { internalId: 503, itemId: 'ITM-003', name: 'Hydraulic system A pump', owningSystemId: 'sys-brk' }, { internalId: 504, itemId: 'ITM-004', name: 'Hydraulic system A reservoir', owningSystemId: 'sys-brk' } ] })`, ctx);
  const f1 = vm.runInContext(`_chatAddMac({ subId: '1.1', phase: 'All phases', clauses: [{ min: 1, of: ['FCC 1', 'fcc 2', 'FCC 9', 'Hydraulic system A'] }] }, 'm')`, ctx);
  const rF = ctx.projectConfig.macModels.find(r => r.subId === '1.1');
  check('"FCC 1" / "fcc 2" resolve to the items whose names contain them as whole words; "FCC 9" is unknown; "Hydraulic system A" (two matches) stays unknown — reported, not guessed', f1.ok && rF.clauses[0].of.join() === 'ITM-001,ITM-002' && /2 member\(s\) not found: FCC 9, Hydraulic system A/.test(f1.summary), JSON.stringify(f1) + JSON.stringify(rF && rF.clauses));
  const f2 = vm.runInContext(`_chatAddMac({ subId: '2.3', phase: 'All phases', clauses: [{ min: 1, of: ['FCC'] }] }, 'm')`, ctx);
  check('a fragment inside a word ("FCC" in "FCC 1" and "FCC 2") is ambiguous → refused, no rule', !f2.ok && /no clause names a known system function/.test(f2.error), JSON.stringify(f2));
  // F16c — arbitration proposed from the document; malformed is dropped and reported, never coerced.
  const a8 = vm.runInContext(`_chatAddMac({ subId: '2.3', phase: 'All phases', clauses: [{ min: 1, of: ['BRK-F1'] }], sddRef: 'SDD §5.1', arbitration: { scheme: 'none', ref: 'SDD §5.1.2' } }, 'claude-opus-4-8')`, ctx);
  const rNone = ctx.projectConfig.macModels.find(r => r.subId === '2.3' && r.phase === 'All phases');
  check('arbitration "none" lands on the rule with its citation, marked AI-proposed', a8.ok && rNone && rNone.arbitration && rNone.arbitration.scheme === 'none' && rNone.arbitration.k === 1 && rNone.arbitration.of.join() === 'BRK-F1' && rNone.arbitration.ref === 'SDD §5.1.2' && rNone.arbitration.aiProposed === true && /arbitration: none/.test(a8.summary), JSON.stringify(a8) + ' ' + JSON.stringify(rNone && rNone.arbitration));
  vm.runInContext(`projectConfig.macModels = projectConfig.macModels.filter(r => r.subId !== '1.1')`, ctx);
  const a9 = vm.runInContext(`_chatAddMac({ subId: '1.1', phase: 'All phases', clauses: [{ min: 1, of: ['FCS-F1', 'FCS-F2'] }], sddRef: 'SDD §4.2', arbitration: { scheme: 'voting', k: 2, of: ['Command elevator channel A', 'fcs-f2'] } }, 'm')`, ctx);
  const rVote = ctx.projectConfig.macModels.find(r => r.subId === '1.1');
  check('voting k=2 over the two channels lands; of resolves by name and id and is limited to the rule\'s members', a9.ok && rVote.arbitration.scheme === 'voting' && rVote.arbitration.k === 2 && rVote.arbitration.of.join() === 'FCS-F1,FCS-F2' && /arbitration: voting k=2 of 2/.test(a9.summary), JSON.stringify(a9));
  vm.runInContext(`projectConfig.macModels = projectConfig.macModels.filter(r => r.subId !== '1.1')`, ctx);
  const a10 = vm.runInContext(`_chatAddMac({ subId: '1.1', phase: 'All phases', clauses: [{ min: 1, of: ['FCS-F1', 'FCS-F2'] }], arbitration: { scheme: 'voting', k: 3 } }, 'm')`, ctx);
  const rBad = ctx.projectConfig.macModels.find(r => r.subId === '1.1');
  check('voting with k beyond the member count is NOT recorded (no coercion) and the summary says why; the rule itself still lands', a10.ok && rBad && !rBad.arbitration && /arbitration not recorded \(scheme "voting", k=3 over 2/.test(a10.summary), JSON.stringify(a10));
  vm.runInContext(`projectConfig.macModels = projectConfig.macModels.filter(r => r.subId !== '1.1')`, ctx);
  const a11 = vm.runInContext(`_chatAddMac({ subId: '1.1', phase: 'All phases', clauses: [{ min: 1, of: ['FCS-F1', 'FCS-F2'] }] }, 'm')`, ctx);
  check('no arbitration given → none recorded, nothing guessed (the finding stays for the engineer)', a11.ok && !ctx.projectConfig.macModels.find(r => r.subId === '1.1').arbitration && !/arbitration/.test(a11.summary));
}

console.log('\n[2b] run 2 findings (4 Sep 2026) — copies as items, ids the model echoes, the classic panels on the seam');
{
  const sbk = { window: {}, console: { info: function () {} } }; vm.createContext(sbk);
  vm.runInContext(fs.readFileSync(path.join(SITE, 'ai_skills.js'), 'utf8'), sbk);
  const S = sbk.window.SLABSkills;
  check('arch.items is a registered skill: one add_item per redundant copy, named with its side / position, never merged', S.skills['arch.items'] && /One add_item per copy, named exactly as the document names it, with its side or position/.test(S.skills['arch.items'].body) && /"four turbofans" is four items/.test(S.skills['arch.items'].body));
  check('draftItems is a public, capture-guarded lane; the thread runs items right after systems and before mac', /draftItems:\s+_captureGuard\('draftItems', draftItems\)/.test(ai) && drv.indexOf("step: 'items'") > drv.indexOf("step: 'systems'") && drv.indexOf("step: 'items'") < drv.indexOf("step: 'mac'"));
  check('add_item resolves owningSystemId by NAME and never duplicates an item under the same system', /const sy = _chatSysByIdOrName\(a\.owningSystemId\); if \(sy\) a\.owningSystemId = sy\.id;/.test(ai) && /Item “' \+ a\.name \+ '” already exists/.test(ai));
  check('the MAC directive says: members are the ITEMS where they exist; never an internal _id', /use the configuration ITEMS listed under each system \(itemId\) wherever they exist/.test(ai) && /never echo an internal _id/.test(ai));
  check('the classic FHA panel (SFHA path) is on the capture seam', /if \(_capture\.armed\) \{\s+_captureFire\(\{ id: 'ai-fha-panel', feature: _fhaFeatureId/.test(ai));
  check('applyDraft applies the classic FCIM shape (system-scope FCIM) through _applyFcimSuggestion', /a\.subId !== undefined && a\.fcDesc === undefined && \(a\.totalLoss !== undefined \|\| a\.partialLoss !== undefined \|\| a\.malfunction !== undefined\)/.test(ai) && /const ok = _applyFcimSuggestion\(Object\.assign\(\{\}, a, \{ _model: a\._model \|\| model \}\)\);/.test(ai));
  // executed: an internalId echoed by the model resolves to the function / item
  const ctx = { console, String, Array, Math, Date, Object, parseInt, JSON };
  ctx.projectConfig = { macModels: [] };
  ctx.snapshot = () => ({ acFunctionsData: [{ subId: '1.1' }], systemsData: [{ id: 'sys-fcs', name: 'Flight Control', functions: [{ internalId: '1788502035487wj6w7', funcId: 'FCS-F1', funcName: 'Command elevator' }] }], itemsData: [{ internalId: 'i-77', itemId: 'ITM-001', name: 'FCC A' }, { internalId: 'i-78', itemId: 'ITM-002', name: 'FCC B' }] });
  ctx._validPhases = v => v;
  vm.createContext(ctx);
  vm.runInContext(extractFn(ai, '_chatAddMac') + '\n', ctx);
  const r = vm.runInContext(`_chatAddMac({ subId: '1.1', clauses: [{ min: 1, of: ['1788502035487wj6w7'] }, { min: 1, of: ['i-77', 'i-78'] }] }, 'm')`, ctx);
  check('an internal _id the model echoed resolves to the function (fid) or the item (itemId) — run 2 lost 11 of 28 rules to this', r.ok && JSON.stringify(ctx.projectConfig.macModels[0].clauses) === '[{"min":1,"of":["FCS-F1"]},{"min":1,"of":["ITM-001","ITM-002"]}]', JSON.stringify(r) + JSON.stringify(ctx.projectConfig.macModels[0] && ctx.projectConfig.macModels[0].clauses));
}

console.log('\n[2c] executed — the MAC definition rides the FHA comment');
{
  const ctx = { console, String, Array, Object, RegExp };
  ctx.projectConfig = { macModels: [ { subId: '1.1', phase: 'All phases', clauses: [{ min: 1, of: ['ITM-001', 'ITM-002'] }], substantiation: { kind: 'assumption', ref: 'SDD §4.2' } } ] };
  ctx.snapshot = () => ({ systemsData: [{ id: 'sys-fcs', name: 'Flight Control', functions: [{ funcId: 'FCS-F1', funcName: 'Command elevator', traceIds: ['1.1'] }] }], itemsData: [{ itemId: 'ITM-001', name: 'FCC A' }, { itemId: 'ITM-002', name: 'FCC B' }] });
  vm.createContext(ctx);
  vm.runInContext(extractFn(ai, '_macCommentFor') + '\n', ctx);
  const a = vm.runInContext(`_macCommentFor({ subId: '1.1', fcDesc: 'Total loss of pitch control' }, false)`, ctx);
  check('aircraft row, total loss: definition + the rule with members by NAME', /^MAC — total loss: the loss takes the aircraft outside the minimum acceptable configuration for this function\. Rule: at least 1 of \[FCC A, FCC B\] \(SDD §4\.2\)\. \| $/.test(a), a);
  const b = vm.runInContext(`_macCommentFor({ subId: '2.3', fcDesc: 'Partial loss of wheel braking' }, false)`, ctx);
  check('partial loss with no rule yet: definition + "not yet defined"', /^MAC — partial loss: degraded, but the minimum acceptable configuration for this function still holds\. Rule: not yet defined for this function/.test(b), b);
  const c = vm.runInContext(`_macCommentFor({ subId: 'FCS-F1', _systemId: 'sys-fcs', fcDesc: 'Total loss of elevator command' }, true)`, ctx);
  check('a SYSTEM row finds the rule through the aircraft function its system function serves', /Rule: at least 1 of \[FCC A, FCC B\]/.test(c), c);
  const d = vm.runInContext(`_macCommentFor({ subId: '1.1', fcDesc: 'Uncommanded pitch motion' }, false)`, ctx);
  check('a malfunction row carries no MAC note', d === '');
}

console.log('\n[3] executed — the MAC rules reach the FCIM drafter in plain words');
{
  const ctx = { console, String, Array, Object };
  ctx.projectConfig = { macModels: [ { subId: '1.1', phase: 'All phases', clauses: [{ min: 1, of: ['FCS-F1', 'FCS-F2'] }], substantiation: { kind: 'assumption', ref: 'SDD §4.2' } } ] };
  ctx.snapshot = () => ({ systemsData: [{ id: 'sys-fcs', name: 'Flight Control', functions: [{ funcId: 'FCS-F1', funcName: 'Command elevator channel A' }, { funcId: 'FCS-F2', funcName: 'Command elevator channel B' }] }] });
  vm.createContext(ctx);
  vm.runInContext(extractFn(ai, '_macRulesForPrompt') + '\n', ctx);
  const t = vm.runInContext(`_macRulesForPrompt(['1.1', '2.3'])`, ctx);
  check('a function with a rule: members by name, the minimum, the phase, the citation', /1\.1 \(All phases\): at least 1 of \[Flight Control · Command elevator channel A \(FCS-F1\); Flight Control · Command elevator channel B \(FCS-F2\)\] — SDD §4\.2/.test(t), t);
  check('… and TL/PL are defined against it in the same breath', /TOTAL LOSS = this rule breached; PARTIAL LOSS = degraded with this rule still held/.test(t));
  check('a function without a rule is named so the model says so and reads conservatively', /NO MAC RULE YET for: 2\.3 — say so in the rationale and use the conservative reading/.test(t));
  ctx.projectConfig.macModels = [];
  const t0 = vm.runInContext(`_macRulesForPrompt(['1.1'])`, ctx);
  check('no rules in the project at all: says so, conservative reading', /MAC RULES: none drafted yet for this project/.test(t0));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
