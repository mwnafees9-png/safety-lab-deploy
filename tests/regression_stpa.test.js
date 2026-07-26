#!/usr/bin/env node
/*
 * Regression — STPA lane: engine (stpa_core v0.1) + walkthrough (stpa_panel
 * v0.1) + wiring + persistence + INV-18 registration.
 *   [1] engine refusals: dangling edge, duplicate id, empty, no actions.
 *   [2] INV-18: catches the unheard action, silent when feedback exists,
 *       carries the three honest exits (incl. the typed-assumption route).
 *   [3] UCA seeds: actions × 4, computed not stored; silent dismissal THROWS;
 *       assessed carries fcIds.
 *   [3b] STPA-0 / J3307 §7.3.1.2: assessment without context THROWS; the seed
 *        names all five parts; open seeds carry context=null honestly.
 *   [4] loss scenarios: unlinked causal factor flagged; unresolved asmId
 *       flagged; resolver populates live posture.
 *   [5] display-lane: engine calls leave the store byte-identical.
 *   [6] wiring: script tags in order, view div, nav item, tabs array entry,
 *       moat guard, single author adapter, INV-18 registered.
 *   [7] persistence: stpaData declared in bindings, in the export payload,
 *       restored on BOTH load paths, reset on new project.
 *   [8] STPA-BRIDGE: bridged/interaction/undeclared computed states; dangling
 *       refs refuse; pure interaction hazards first-class; panel chips + rollup.
 * Run: node tests/regression_stpa.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const throws = f => { try { f(); return false; } catch (_) { return true; } };
const E = require('../site/stpa_core.js');

// The GLA seed case — surfaces→crew feedback deliberately missing.
const GLA = {
    controllers: [{ id: 'crew', name: 'Crew', kind: 'human' }, { id: 'fcs', name: 'FCS', kind: 'automation' }],
    processes: [{ id: 'surf', name: 'GLA surfaces' }, { id: 'loads', name: 'Airframe loads' }],
    actions: [{ id: 'a1', from: 'fcs', to: 'surf', name: 'deflect' }, { id: 'a2', from: 'crew', to: 'fcs', name: 'engage / inhibit' }],
    feedbacks: [{ id: 'f1', from: 'loads', to: 'fcs', name: 'accel / rate sensing' }]
};

// ---- [1] engine refusals ------------------------------------------------------
check('valid GLA structure passes validate', E.validate(GLA).length === 0);
check('dangling edge refused', E.validate(Object.assign({}, GLA, { actions: GLA.actions.concat([{ id: 'ax', from: 'fcs', to: 'ghost', name: 'x' }]) })).length > 0);
check('duplicate node id refused', E.validate(Object.assign({}, GLA, { processes: GLA.processes.concat([{ id: 'crew', name: 'dup' }]) })).length > 0);
check('empty structure refused · zero actions refused',
  E.validate({}).length > 0 && E.validate(Object.assign({}, GLA, { actions: [] })).some(e => /no control actions/.test(e)));
check('inv18/ucaSeeds THROW on an invalid structure (refusal, not repair)',
  throws(() => E.inv18({})) && throws(() => E.ucaSeeds({}, {})));

// ---- [2] INV-18 ---------------------------------------------------------------
const r18 = E.inv18(GLA);
check('INV-18 fires on both unheard actions (surf and fcs never talk back)', r18.checked === 2 && r18.findings.length === 2);
check('finding names the open loop in plain language', r18.findings.every(f => /open-loop hope, not control/.test(f.detail)));
check('three exits, incl. the typed-assumption route, NO "mark as reviewed"',
  r18.findings.every(f => f.exits.length === 3 && f.exits.some(x => /typed assumption/.test(x)) && !f.exits.some(x => /mark as reviewed/i.test(x))));
const heard = Object.assign({}, GLA, { feedbacks: GLA.feedbacks.concat([
  { id: 'f2', from: 'surf', to: 'fcs', name: 'position' }, { id: 'f3', from: 'fcs', to: 'crew', name: 'status' }]) });
check('INV-18 silent when every action is heard', E.inv18(heard).findings.length === 0);

// ---- [3] UCA seeds ------------------------------------------------------------
check('seeds = actions × 4 guide phrases', E.ucaSeeds(GLA, {}).length === 8);
check('silent dismissal THROWS', throws(() => E.ucaSeeds(GLA, { 'a1:np': { status: 'dismissed' } })));
check('dismissal WITH rationale accepted', !throws(() => E.ucaSeeds(GLA, { 'a2:ss': { status: 'dismissed', rationale: 'latching discrete; no hazardous continuation' } })));

// ---- [3b] J3307 §7.3.1.2 — the five-part UCA (STPA-0) -------------------------
check('assessment WITHOUT context THROWS (§7.3.1.2 — same posture as silent dismissal)',
  throws(() => E.ucaSeeds(GLA, { 'a1:np': { status: 'assessed', hazard: 'unalleviated gust load' } })));
check('refusal names the clause and the actual-state rule',
  (() => { try { E.ucaSeeds(GLA, { 'a1:np': { status: 'assessed', hazard: 'x' } }); return false; }
           catch (e) { return /7\.3\.1\.2/.test(e.message) && /ACTUAL system state/.test(e.message) && /not a controller belief/.test(e.message); } })());
const disp = { 'a1:np': { status: 'assessed', hazard: 'unalleviated gust load', context: 'gust encounter with GLA sensors in fault reversion', fcIds: ['FC-034'],
  scenarios: [{ desc: 'gust during sensor-fault reversion', causalFactors: [{ factor: 'IMU latency', asmId: 'AS-041' }, { factor: 'maintenance re-rig error' }] }] } };
const seeds = E.ucaSeeds(GLA, disp);
const s5 = seeds.find(s => s.ucaId === 'UCA-a1:np');
check('assessed seed carries the context clause through', s5.context === 'gust encounter with GLA sensors in fault reversion');
check('seed.parts names ALL FIVE mandated parts — source, type, control action, context, hazard links',
  s5.parts && s5.parts.source === 'fcs' && s5.parts.type === 'not provided' && s5.parts.controlAction === 'deflect' &&
  s5.parts.context === 'gust encounter with GLA sensors in fault reversion' && s5.parts.hazardLinks[0] === 'FC-034');
check('assessed text renders five-part (source + phrase + action + context + links)',
  /^fcs: /.test(s5.text) && /not provided/.test(s5.text) && /deflect/.test(s5.text) && /while gust encounter/.test(s5.text) && /FC-034/.test(s5.text));
check('OPEN seeds carry parts.context = null — honestly incomplete, not defaulted',
  seeds.filter(s => s.status === 'open').every(s => s.parts && s.parts.context === null && s.context === null));
check('assessed seed carries status + fcIds through', seeds.find(s => s.ucaId === 'UCA-a1:np').status === 'assessed' && seeds.find(s => s.ucaId === 'UCA-a1:np').fcIds[0] === 'FC-034');
check('undisposed seeds stay honestly open', seeds.filter(s => s.status === 'open').length === 7);

// ---- [4] loss scenarios -------------------------------------------------------
const resolver = id => id === 'AS-041' ? { state: 'Validated', effective: 'credited posture' } : null;
const ls = E.lossScenarios(GLA, disp, resolver);
check('scenario built from the assessed UCA', ls.scenarios.length === 1 && ls.scenarios[0].ucaId === 'UCA-a1:np');
check('unlinked causal factor flagged (a hope, not a control)', ls.flags.some(f => /re-rig/.test(f) && /hope, not a control/.test(f)));
check('linked factor resolves LIVE posture', ls.scenarios[0].causalFactors.find(c => c.asmId === 'AS-041').posture.state === 'Validated');
const ls2 = E.lossScenarios(GLA, { 'a1:np': { status: 'assessed', context: 'any true hazardous state', scenarios: [{ desc: 'x', causalFactors: [{ factor: 'y', asmId: 'AS-999' }] }] } }, resolver);
check('citing an assumption NOT on the register is flagged', ls2.flags.some(f => /AS-999/.test(f)) && ls2.scenarios[0].causalFactors[0].posture === 'UNRESOLVED');

// ---- [5] display-lane ---------------------------------------------------------
const snap = JSON.stringify(GLA) + JSON.stringify(disp);
E.inv18(GLA); E.ucaSeeds(GLA, disp); E.lossScenarios(GLA, disp, resolver);
check('engine never mutates its inputs (byte-identical after full pass)', JSON.stringify(GLA) + JSON.stringify(disp) === snap);

// ---- [6] wiring ---------------------------------------------------------------
const idx = S('index.html'), panel = S('stpa_panel.js'), sup = S('support_modules.js');
check('index.html loads stpa_core then stpa_panel, cache-busted',
  /stpa_core\.js\?v=\d+\.\d/.test(idx) && /stpa_panel\.js\?v=\d+\.\d/.test(idx) && idx.indexOf('stpa_core.js') < idx.indexOf('stpa_panel.js'));
check('view-stpa div + snav-stpa nav item present', idx.indexOf('id="view-stpa"') >= 0 && idx.indexOf('id="snav-stpa"') >= 0);
check("switchTab tabs array gained 'stpa'", /const tabs = \[[^\]]*'stpa'/.test(sup));
check('moat guard on the switchTab wrap (_stpaWrapped)', /_stpaWrapped/.test(panel));
check('single author adapter — the only mutation sites live in _author', /const _author = \{/.test(panel) && !/^\s*stpaData\s*=/m.test(panel));
check('STPA open-loop check registered into the shared sweep as INV-32 ADVISORY (INV-18 belongs to zonal)',
  /id: 'INV-32', sev: 'advisory'/.test(panel) && !/id: 'INV-18'/.test(panel));
// id uniqueness across the whole site: nobody else registers INV-32
const _all = fs.readdirSync(path.join(__dirname, '..', 'site')).filter(f => f.endsWith('.js') && f !== 'stpa_panel.js');
check('INV-32 id is unique across every site module', _all.every(f => {
  try { return S(f).indexOf("id: 'INV-32'") === -1; } catch (_) { return true; } }));
check('seed case: GLA with the surface-status feedback DELIBERATELY missing', /DELIBERATELY omitted/.test(panel) && /INV-32 fires in the demo/.test(panel));
check('panel refuses forward steps on an invalid structure (refusal card)', /_refuseCard/.test(panel) && /Refusal over repair/.test(panel));
check('panel assess flow ASKS for the §7.3.1.2 context and refuses without it',
  /Context \(J3307 §7\.3\.1\.2, required\)/.test(panel) && /not what the controller believes/.test(panel) && /a UCA without its context clause is not a UCA/.test(panel));
check('derived constraints carry the context clause forward (single builder)', /s\.context \? ' when ' \+ s\.context/.test(panel));
check('legacy guard: pre-context assessed dispositions get the repair card (two exits), all three compute steps guarded',
  /_missingCtx/.test(panel) && /_ctxRepairCard/.test(panel) && panel.split('_ctxRepairCard(').length >= 5 && /fixContext/.test(panel));
check('constraints step drafts for real — the old next-increment honesty note is gone', /draftRequirement/.test(panel) && !/Drafting them into the requirements worksheet is the next/.test(panel));

// ---- [7] persistence ----------------------------------------------------------
const bind = S('bindings_modules.js'), misc = S('misc_fn_modules.js'), dops = S('data_ops_modules.js'), help = S('helpers_modules.js');
check('stpaData declared in bindings with full W1..W6 shape (spine + causes + structure + responsibilities + csState + sip)', /let stpaData = \{ cs: \{ controllers: \[\], processes: \[\], actions: \[\], feedbacks: \[\], others: \[\], precedence: \[\] \}, dispositions: \{\}, causeDismissals: \{\}, scopeFcIds: \[\], meta: \{ mission: '', scope: '', boundary: '', abstractionLevel: '' \}, losses: \[\], hazards: \[\], constraints: \[\], responsibilities: \[\], csState: 'initial', sip: \{\} \}/.test(bind));
check('stpaData in the project export payload', /flightPhasesData, stpaData, ftaPages/.test(misc));
check('stpaData restored on BOTH load paths (data_ops + helpers legacy)',
  /stpaData = \(data\.stpaData && data\.stpaData\.cs\) \? data\.stpaData/.test(dops) &&
  /stpaData = \(data\.stpaData && data\.stpaData\.cs\) \? data\.stpaData/.test(help));
check('stpaData reset on new project (full W1..W6 shape)', /stpaData = \{ cs: \{ controllers: \[\], processes: \[\], actions: \[\], feedbacks: \[\], others: \[\], precedence: \[\] \}, dispositions: \{\}, causeDismissals: \{\}, scopeFcIds: \[\], meta: \{ mission: '', scope: '', boundary: '', abstractionLevel: '' \}, losses: \[\], hazards: \[\], constraints: \[\], responsibilities: \[\], csState: 'initial', sip: \{\} \};/.test(misc));


// ---- [8] W1 — the J3307 spine -------------------------------------------------
const SPINE = { losses: [{ id: 'L-1', name: 'Loss of life or injury' }],
  hazards: [{ id: 'H-1', name: 'Load envelope violated', lossIds: ['L-1'], group: 'structural' },
            { id: 'H-2', name: 'Controlled flight into terrain', lossIds: ['L-1'] }],
  constraints: [{ id: 'SC-1', text: 'The system shall not exceed the load envelope', hazardIds: ['H-1'] }] };
check('valid spine passes spineValidate', E.spineValidate(SPINE).length === 0);
check('duplicate id across REGISTERS refused (one identity space)',
  E.spineValidate({ losses: [{ id: 'X-1', name: 'a' }], hazards: [{ id: 'X-1', name: 'b' }], constraints: [] }).length > 0);
check('dangling hazard→loss and constraint→hazard links refused',
  E.spineValidate({ losses: [], hazards: [{ id: 'H-1', name: 'h', lossIds: ['L-9'] }], constraints: [] }).length > 0 &&
  E.spineValidate({ losses: [], hazards: [], constraints: [{ id: 'SC-1', text: 't', hazardIds: ['H-9'] }] }).length > 0);
check('unnamed loss / hazard / textless constraint refused',
  E.spineValidate({ losses: [{ id: 'L-1', name: ' ' }], hazards: [], constraints: [] }).length > 0 &&
  E.spineValidate({ losses: [], hazards: [], constraints: [{ id: 'SC-1', text: '' }] }).length > 0);
check('spineTrace THROWS on an invalid spine (refusal, not repair)', throws(() => E.spineTrace({ losses: [{ id: 'A', name: 'x' }, { id: 'A', name: 'y' }], hazards: [], constraints: [] })));
const TR = E.spineTrace({ losses: [{ id: 'L-1', name: 'x' }], hazards: [{ id: 'H-1', name: 'y', lossIds: [] }], constraints: [{ id: 'SC-1', text: 'z', hazardIds: [] }] });
check('spineTrace reports all four gap kinds as ADVISORY findings',
  ['untraced-hazard', 'unlinked-constraint', 'uncovered-loss', 'unconstrained-hazard'].every(k => TR.findings.some(f => f.kind === k)));
check('fully-traced spine reports zero gaps… except the honestly-unconstrained H-2',
  E.spineTrace(SPINE).findings.length === 1 && E.spineTrace(SPINE).findings[0].kind === 'unconstrained-hazard' && E.spineTrace(SPINE).findings[0].id === 'H-2');
const RU = E.hazardRollup(SPINE);
check('hazardRollup: per-loss counts + groups (ungrouped collected honestly)',
  RU.perLoss[0].hazardIds.length === 2 && RU.perLoss[0].constraintCount === 1 &&
  RU.groups.length === 2 && RU.groups.some(g => g.group === null) && RU.groups.some(g => g.group === 'structural'));
const snapW1 = JSON.stringify(SPINE);
E.spineTrace(SPINE); E.hazardRollup(SPINE);
check('spine engines never mutate their inputs', JSON.stringify(SPINE) === snapW1);

// ---- [9] W1 — panel + approvals wiring ----------------------------------------
check('Step 1 authors the spine: meta rows + losses + hazards + constraints tables',
  /Mission statement/.test(panel) && /Boundary statement/.test(panel) && /addLossUi/.test(panel) && /addHazardUi/.test(panel) && /addConstraintUi/.test(panel));
check('stakeholder confirmation RIDES the standard approvals rail (kind stpaScope), refuses on blank statements',
  /kind: 'stpaScope', id: 'STPA-SCOPE'/.test(panel) && /confirming a blank is not confirmation/.test(panel));
check("assurance KIND_LABELS/ORDER gained 'stpaScope' — one sign-off system, not two",
  /stpaScope: 'STPA Scope'/.test(S('assurance_modules.js')) && /'sysAsm', 'stpaScope'\]/.test(S('assurance_modules.js')));
check('FHA import route: hazard CREATED FROM an FC with fromFcId, one per FC, lands UNTRACED honestly',
  /hazardFromFc/.test(panel) && /fromFcId === fcId/.test(panel) && /lands UNTRACED, honestly/.test(panel));
check('spine removals refuse while cited (no dangling links, panel-side)',
  /is cited by .* hazard\(s\)|cited by ' \+ cited\.length \+ ' hazard/.test(panel) && /cited\.length \+ ' constraint/.test(panel));
check('legacy backfill: DATA\(\) normalizes meta + spine arrays for pre-W1 projects',
  /if \(!stpaData\.meta\) stpaData\.meta = \{ mission: '', scope: '', boundary: '', abstractionLevel: '' \};/.test(panel) &&
  /\['losses', 'hazards', 'constraints'\]\.forEach/.test(panel));


// ---- [10] W2 — UCA → spine hazard retarget + persisted requirements -----------
const seedsW2 = E.ucaSeeds(GLA, { 'a1:np': { status: 'assessed', hazard: 'x', context: 'true hazardous state', hazardIds: ['H-1'] } }, SPINE);
const sW2 = seedsW2.find(x => x.ucaId === 'UCA-a1:np');
check('assessed UCA links to the SPINE register (hazardIds) and the five-part carries it',
  sW2.hazardIds[0] === 'H-1' && sW2.parts.hazardLinks[0] === 'H-1' && /H-1/.test(sW2.text));
check('a hazardId NOT on the register is REFUSED when the spine is passed',
  throws(() => E.ucaSeeds(GLA, { 'a1:np': { status: 'assessed', hazard: 'x', context: 'c', hazardIds: ['H-99'] } }, SPINE)));
check('legacy fcIds route still works (no spine hazardIds → FC links carry the five-part)',
  E.ucaSeeds(GLA, disp).find(x => x.ucaId === 'UCA-a1:np').parts.hazardLinks[0] === 'FC-034');
check('spine hazardIds take precedence over legacy fcIds in the rendered link',
  E.ucaSeeds(GLA, { 'a1:np': { status: 'assessed', hazard: 'x', context: 'c', hazardIds: ['H-1'], fcIds: ['FC-034'] } }, SPINE)
    .find(x => x.ucaId === 'UCA-a1:np').parts.hazardLinks.join(',') === 'H-1');
check('lossScenarios passes the spine through (dangling refusal propagates)',
  throws(() => E.lossScenarios(GLA, { 'a1:np': { status: 'assessed', context: 'c', hazardIds: ['H-99'], scenarios: [] } }, resolver, SPINE)));
check('panel: ONE constraint text builder feeds display, clipboard and worksheet',
  /_constraintText/.test(panel) && panel.split('_constraintText(').length >= 4 && !/linked FCs: ' \+ s\.fcIds/.test(panel));
check('panel: draft PERSISTS to acReqData with uca backlink, level Aircraft, type Safety, deduped',
  /r\.uca === seed\.ucaId/.test(panel) && /uca: seed\.ucaId, stpaDerived: true/.test(panel) &&
  /level: 'Aircraft', type: 'Safety'/.test(panel) && /draftAllSc/.test(panel));
check('panel: STALE marker when the UCA changed after drafting, with re-draft',
  /row\.text !== txt/.test(panel) && /re-draft/.test(panel));
check('panel: assess flow threads to the spine register and refuses ids not on it',
  /Thread it to the spine/.test(panel) && /Not on the spine register/.test(panel));
check('panel: rmHazard also refuses while a UCA disposition cites it',
  /citedU/.test(panel) && /UCA disposition\(s\)/.test(panel));
check('Step 5 honesty note updated — persistence is REAL now, not promised',
  /PERSISTS it to the requirements worksheet/.test(panel) && !/next\s+increment[^]*worksheet/.test(panel.split('stepConstraints')[1] || ''));

// ---- [11] W3 — Step 4 enumerated causal seeds ---------------------------------
check('the 4a enumeration is six causes (four controller-side, two feedback-side)',
  E.CAUSES_4A.length === 6 &&
  E.CAUSES_4A.filter(c => c.side === 'controller').length === 4 &&
  E.CAUSES_4A.filter(c => c.side === 'feedback').length === 2);
check('the 4b enumeration is ten causes (seven control-path, three process)',
  E.CAUSES_4B.length === 10 &&
  E.CAUSES_4B.filter(c => c.side === 'control-path').length === 7 &&
  E.CAUSES_4B.filter(c => c.side === 'process').length === 3);
const csDisp = { 'a1:np': { status: 'assessed', hazard: 'x', context: 'true hazardous state',
  scenarios: [{ desc: 'stale model from late feedback', cause: '4a:pm', causalFactors: [] },
              { desc: 'untagged free-form scenario', causalFactors: [] }] } };
const cs1 = E.causeSeeds(GLA, csDisp, {});
check('16 seeds per assessed UCA (6 × 4a + 10 × 4b), none for open/dismissed UCAs',
  cs1.length === 16 && cs1.every(x => x.ucaId === 'UCA-a1:np'));
check('coverage is COMPUTED from the tagged scenario — 4a:pm covered, everything else open',
  cs1.find(x => x.phase === '4a' && x.causeId === 'pm').status === 'covered' &&
  cs1.find(x => x.phase === '4a' && x.causeId === 'pm').scenarioCount === 1 &&
  cs1.filter(x => x.status === 'open').length === 15);
check('an untagged scenario covers NOTHING — free-form stays free-form',
  cs1.filter(x => x.status === 'covered').length === 1);
check('cause dismissal WITHOUT rationale THROWS (SHALL be evaluated)',
  throws(() => E.causeSeeds(GLA, csDisp, { 'a1:np:cf': {} })) &&
  throws(() => E.causeSeeds(GLA, csDisp, { 'a1:np:cf': { rationale: '  ' } })));
const cs2 = E.causeSeeds(GLA, csDisp, { 'a1:np:cp7': { rationale: 'single mechanical path, covered by the FTA basic event' },
                                        'a1:np:pm': { rationale: 'stale dismissal' } });
check('dismissal WITH rationale lands; COVERED wins over a stale dismissal',
  cs2.find(x => x.causeId === 'cp7').status === 'dismissed' &&
  /mechanical path/.test(cs2.find(x => x.causeId === 'cp7').rationale) &&
  cs2.find(x => x.causeId === 'pm').status === 'covered');
check('lossScenarios passes the cause tag through to computed scenarios',
  E.lossScenarios(GLA, csDisp, resolver).scenarios.find(x => x.cause === '4a:pm') != null &&
  E.lossScenarios(GLA, csDisp, resolver).scenarios.find(x => x.cause === null) != null);
const snapW3 = JSON.stringify(csDisp);
E.causeSeeds(GLA, csDisp, {});
check('causeSeeds never mutates its inputs', JSON.stringify(csDisp) === snapW3);
check('panel: per-UCA 4a/4b checklists with computed chips + dismiss/reopen, cause chip on scenarios',
  /_causeChecklist/.test(panel) && /dismissCause/.test(panel) && /reopenCause/.test(panel) &&
  /addScenario\(key, causeTag\)|addScenario: function \(key, causeTag\)/.test(panel));
check('panel: the latent context-drop bug in addScenario/addFactor is fixed (context + hazardIds preserved)',
  panel.split('context: disp.context').length >= 3);
check('causeDismissals persisted: bindings shape, reset, both load paths, panel backfill',
  /causeDismissals: \{\}/.test(S('bindings_modules.js')) && /causeDismissals: \{\}/.test(S('misc_fn_modules.js')) &&
  /causeDismissals: \{\}/.test(S('data_ops_modules.js')) && /causeDismissals: \{\}/.test(S('helpers_modules.js')) &&
  /if \(!stpaData\.causeDismissals\) stpaData\.causeDismissals = \{\};/.test(panel));


// ---- [12] W4 — the complete control structure ---------------------------------
const CS4 = { controllers: [{ id: 'crew', name: 'Crew', kind: 'human', authority: 1, desc: 'flight crew' },
                            { id: 'fcs', name: 'FCS', kind: 'automation', authority: 2, desc: 'control computer', processModel: ['sensed load'] }],
              processes: [{ id: 'surf', name: 'Surfaces', desc: 'GLA surfaces' }],
              actions: [{ id: 'a1', from: 'crew', to: 'surf', name: 'manual cmd' }, { id: 'a2', from: 'fcs', to: 'surf', name: 'auto cmd' }],
              feedbacks: [{ id: 'f1', from: 'surf', to: 'fcs', name: 'position' }],
              others: [{ id: 'o1', from: 'surf', to: 'crew', name: 'aural cue' }],
              precedence: [] };
check('others edges validate like the rest (dangling refused)',
  E.validate(CS4).length === 0 &&
  E.validate(Object.assign({}, CS4, { others: [{ id: 'ox', from: 'ghost', to: 'crew', name: 'x' }] })).length > 0);
check('an empty precedence rule is refused at validate (an empty rule decides nothing)',
  E.validate(Object.assign({}, CS4, { precedence: [{ processId: 'surf', rule: ' ' }] })).length > 0 &&
  E.validate(Object.assign({}, CS4, { precedence: [{ processId: 'ghost', rule: 'x' }] })).length > 0);
const LO = E.loopSummary(CS4);
check('loopSummary is the POSITIVE 2b-2 statement — names the closing feedback per loop',
  LO.length === 2 && LO.find(l => l.actionId === 'a2').closed === true &&
  LO.find(l => l.actionId === 'a2').feedbackNames[0] === 'position' &&
  LO.find(l => l.actionId === 'a1').closed === false);
const CF1 = E.conflictSites(CS4);
check('conflictSites finds the two-controller site; distinct authority ranks = tiebreak exists, no finding',
  CF1.sites.length === 1 && CF1.sites[0].targetId === 'surf' && CF1.sites[0].authorityRanked === true && CF1.findings.length === 0);
const CS4b = JSON.parse(JSON.stringify(CS4)); delete CS4b.controllers[0].authority;
check('same site WITHOUT ranks and WITHOUT a rule = the conflicting-command finding, standing',
  E.conflictSites(CS4b).findings.length === 1 && /two voices, no tiebreak/.test(E.conflictSites(CS4b).findings[0]));
CS4b.precedence = [{ processId: 'surf', rule: 'crew manual command overrides the GLA law within 100 ms' }];
check('a written precedence rule clears the finding', E.conflictSites(CS4b).findings.length === 0);
check('respTrace refuses dangling element/constraint links, reports unallocated controllers + untraced responsibilities',
  throws(() => E.respTrace([{ id: 'R-1', text: 't', elementId: 'ghost', constraintIds: [] }], CS4, SPINE)) &&
  throws(() => E.respTrace([{ id: 'R-1', text: 't', elementId: 'crew', constraintIds: ['SC-99'] }], CS4, SPINE)) &&
  (function () {
    const r = E.respTrace([{ id: 'R-1', text: 'hold the envelope', elementId: 'crew', constraintIds: [] }], CS4, SPINE);
    return r.findings.some(f => f.kind === 'no-responsibilities' && f.id === 'fcs') &&
           r.findings.some(f => f.kind === 'untraced-responsibility' && f.id === 'R-1');
  })());
const CO = E.csCompleteness(CS4);
check('csCompleteness: human mental-model gaps (all four named), missing process model, missing description',
  CO.findings.filter(f => f.kind === 'mental-model-gap' && f.id === 'crew').length === 4 &&
  CO.findings.some(f => f.kind === 'no-process-model' && f.id === 'crew') &&
  !CO.findings.some(f => f.kind === 'no-process-model' && f.id === 'fcs') &&
  !CO.findings.some(f => f.kind === 'no-description'));
check('the four mental models include the one usually missed (other controllers)',
  E.MENTAL_MODELS.length === 4 && E.MENTAL_MODELS.some(t => t.id === 'otherControllers'));
const snapW4 = JSON.stringify(CS4);
E.loopSummary(CS4); E.conflictSites(CS4); E.csCompleteness(CS4);
check('W4 engines never mutate their inputs', JSON.stringify(CS4) === snapW4);
check('panel: others table + detail editor + precedence authoring + responsibilities + finalize refusal',
  /Other inputs \/ outputs/.test(panel) && /editNode/.test(panel) && /editPrecedence/.test(panel) &&
  /addRespUi/.test(panel) && /setCsState/.test(panel) && /Not finalized — the structure still owes/.test(panel));
check('panel: authority-aware layout is hierarchical when ranks differ (semantic, not decorative)',
  /authority-aware layout/.test(panel) && /place\(top, 12\)/.test(panel) && /place\(rest, 96\)/.test(panel));
check('panel: rmNode guards others edges, precedence rules and responsibilities',
  /d\.cs\.others\)\.some/.test(panel.replace(/\n/g, ' ')) || /concat\(d\.cs\.feedbacks, d\.cs\.others\)/.test(panel));
check('seed case carries W4 detail (authority + desc + process model) without losing the INV-32 demo',
  /authority: 1/.test(panel) && /authority: 2/.test(panel) && /DELIBERATELY omitted/.test(panel));


// ---- [13] W5 — conformance + INV-37 + the thread ------------------------------
const EMPTY = E.conformance({}, {});
check('conformance walks EXACTLY the 27 Table 1 work products',
  EMPTY.total === 27 && EMPTY.deliverables.length === 27 &&
  ['1a-1','1a-2','1b-1','1b-2','1c-1','1c-2','2a-1','2b-1','2b-2','2c-1','2c-2','2d-1','2e-1','2f-1','2f-2','2f-3',
   '3a-1','3a-2','3b-1','3b-2','3b-3','4a-1','4a-2','4b-1','4b-2','4c-1','4c-2']
    .every(id => EMPTY.deliverables.some(x => x.id === id)));
check('an empty model is honestly MISSING nearly everywhere (grouping honestly N/A)',
  EMPTY.tally.missing >= 24 && EMPTY.deliverables.find(x => x.id === '1b-2').status === 'na');
const FULLDISP = {};
GLA.actions.forEach(a => ['np','ph','wt','ss'].forEach(g => {
  FULLDISP[a.id + ':' + g] = { status: 'dismissed', rationale: 'test dismissal — full sweep' }; }));
FULLDISP['a1:np'] = { status: 'assessed', hazard: 'x', context: 'true hazardous state', hazardIds: ['H-1'],
  scenarios: [{ desc: 's', cause: '4a:pm', causalFactors: [] }] };
const RICH = E.conformance(
  { cs: { controllers: [{ id: 'crew', name: 'Crew', kind: 'human', authority: 1, desc: 'd',
                          mentalModels: { environment: 'e', ownState: 'o', controlledProcess: 'c', otherControllers: 'x' } },
          { id: 'fcs', name: 'FCS', kind: 'automation', authority: 2, desc: 'd', processModel: ['belief'] }],
    processes: [{ id: 'surf', name: 'S', desc: 'd' }, { id: 'loads', name: 'L', desc: 'd' }],
    actions: GLA.actions, feedbacks: GLA.feedbacks, others: [{ id: 'o1', from: 'surf', to: 'crew', name: 'cue' }] },
    dispositions: FULLDISP, causeDismissals: {},
    spine: SPINE, responsibilities: [{ id: 'R-1', text: 't', elementId: 'crew', constraintIds: ['SC-1'] }],
    meta: { mission: 'm', scope: 's', boundary: 'b', abstractionLevel: 'system' }, csState: 'initial' },
  { scopeApproved: true, reqRows: [{ uca: 'UCA-a1:np', stpaTest: { state: 'critical' } }] });
const RGET = id => RICH.deliverables.find(x => x.id === id);
check('a populated model satisfies the Step 1 + Step 2 products it actually has',
  RGET('1a-1').status === 'satisfied' && RGET('1a-2').status === 'satisfied' && RGET('1c-2').status === 'satisfied' &&
  RGET('2a-1').status === 'satisfied' && RGET('2b-2').status === 'satisfied' && RGET('2c-2').status === 'satisfied' &&
  RGET('2f-1').status === 'satisfied' && RGET('2f-3').status === 'satisfied');
check('3a-1 satisfied when every seed is disposed; 3a-2/3b-1/3b-2 ride the assessed UCA',
  RGET('3a-1').status === 'satisfied' && RGET('3a-2').status === 'satisfied' &&
  RGET('3b-1').status === 'satisfied' && RGET('3b-2').status === 'satisfied' && RGET('3b-3').status === 'satisfied');
check('4a partial (1 of 6 causes covered), 4b missing scenarios named honestly',
  RGET('4a-1').status === 'partial' && RGET('4a-2').status === 'satisfied' &&
  RGET('4b-2').status === 'missing' && /class most analyses omit/.test(RGET('4b-2').evidence));
check('evidence strings are chaseable (counts + ids, not adjectives)',
  /1\/1 assessed UCAs/.test(RGET('3b-1').evidence) && /L-1/.test(RGET('1a-1').evidence));
check('panel: rail gained step 6 and the conformance card cites clause 9',
  /J3307 conformance/.test(panel) && /Math\.min\(6, n \| 0\)/.test(panel) && /clause 9, demonstrated/i.test(panel));
check('INV-37 registered HARD; INV-32 stays advisory by RECORDED decision',
  /id: 'INV-37', sev: 'hard'/.test(panel) && /INV-32 STAYS ADVISORY/.test(panel) &&
  /id: 'INV-32', sev: 'advisory'/.test(panel));
check('INV-37 is silent when nothing is authored, and names every dangling-link class',
  /if \(!anySpine && !anyDisp\) return \{ checked: 0, fails: \[\] \};/.test(panel) &&
  /traces to NO loss/.test(panel) && /links to NO spine hazard/.test(panel) && /outlived its reason/.test(panel));
check('INV-37 id is unique across every site module', _all.every(f => {
  try { return S(f).indexOf("id: 'INV-37'") === -1; } catch (_) { return true; } }));
const gtv = S('fta_view_modules.js'), gtt = S('gt_thread.js'), gti = S('gt_integrity.js');
check('golden thread: STPA column exists in ORDER/CNAME/ACCENT and the layer list',
  /'hf', 'stpa', 'fc'/.test(gtt) && /stpa: 'STPA'/.test(gtt) && /stpa: '#6D28D9'/.test(gtt) &&
  /'sys','stpa','fc'/.test(S('bindings_modules.js')));
check('graph builder anchors spine hazards to their source FC, flags untraced, rides drafted reqs',
  /STPA \(W5\): spine hazards/.test(gtv) && /h\.fromFcId === fha\.fcId/.test(gtv) &&
  /not yet traced to a loss/.test(gtv) && /r\.uca !== \('UCA-' \+ k\)/.test(gtv));
check('gt_integrity: STPA dangling (FC anchor, hazard cite, req backlink) + the abandoned-hazard orphan',
  /anchor FHA failure condition no longer exists/.test(gti) && /cited spine hazard no longer on the register/.test(gti) &&
  /STPA backlink no longer resolves/.test(gti) && /authored, then abandoned/.test(gti));
check('evidence package: STPA conformance RE-RUNS at build and renders as its own section',
  /9s\. STPA — J3307 clause-9 conformance, RE-RUN FRESH/.test(S('evidence_package.js')) &&
  /10s · STPA — J3307 conformance/.test(S('evidence_package.js')));


// ---- [14] W6 — Appendix C archetypes + optional SIP ---------------------------
check('the four archetype classes project EXACTLY onto the W3 cause machinery',
  E.ARCHETYPE_CLASSES.length === 4 &&
  E.ARCHETYPE_CLASSES.every(cl => (cl.phase === '4a' && ['controller', 'feedback'].indexOf(cl.side) >= 0) ||
                                  (cl.phase === '4b' && ['control-path', 'process'].indexOf(cl.side) >= 0)));
const AM = E.archetypeMatrix(GLA, { 'a1:np': { status: 'assessed', hazard: 'h', context: 'ctx',
  scenarios: [{ desc: 's', cause: '4a:pm' }] } }, {});
check('the matrix is 4 × 4 = 16 cells; per-cell cause counts follow the enumerations (4/2/7/3)',
  AM.cells.length === 16 &&
  AM.cells.find(c => c.typeId === 'np' && c.classId === 'ctl').causes === 4 &&
  AM.cells.find(c => c.typeId === 'np' && c.classId === 'fbk').causes === 2 &&
  AM.cells.find(c => c.typeId === 'np' && c.classId === 'cpx').causes === 7 &&
  AM.cells.find(c => c.typeId === 'np' && c.classId === 'prx').causes === 3);
check('coverage projects from tagged scenarios — a 4a:pm scenario covers ONE cause in np/ctl',
  AM.cells.find(c => c.typeId === 'np' && c.classId === 'ctl').covered === 1 &&
  AM.cells.find(c => c.typeId === 'np' && c.classId === 'fbk').covered === 0);
check('exit criterion is COMPUTED: open cells → not met; empty types honestly unpopulated',
  AM.exit === false && AM.openCells === 4 &&
  AM.cells.filter(c => c.typeId === 'ph').every(c => c.ucaCount === 0));
const dismissAll = {};
E.CAUSES_4A.concat(E.CAUSES_4B).forEach(c => { dismissAll['a1:np:' + c.id] = { rationale: 'test rationale for exit' }; });
check('exit criterion MET when every populated cell is fully disposed',
  E.archetypeMatrix(GLA, { 'a1:np': { status: 'assessed', hazard: 'h', context: 'ctx', scenarios: [] } }, dismissAll).exit === true);
check('SIP scaffold: 25 items (a–y), pointer only — NO Appendix D wording stored',
  E.SIP_ITEMS.length === 25 && E.SIP_ITEMS[0].id === 'a' && E.SIP_ITEMS[24].id === 'y' &&
  E.SIP_ITEMS.every(it => /§6\.4 \/ Appendix D, item/.test(it.ref)) &&
  !/shall/.test(JSON.stringify(E.SIP_ITEMS)));
check('sipSummary REFUSES a yes/partial/no with no note (a checkbox is not evidence); na needs none',
  throws(() => E.sipSummary({ a: { state: 'yes' } })) &&
  !throws(() => E.sipSummary({ a: { state: 'na' } })) &&
  E.sipSummary({ a: { state: 'yes', note: 'meets it via X' }, b: { state: 'na' } }).assessed === 2);
check('panel: archetype table + exit line + SIP grid marked NOT REQUIRED, wording never stored',
  /Scenario Archetype Table/.test(panel) && /EXIT CRITERIA MET/.test(panel) &&
  /NOT REQUIRED — J3307 NOTE 1/.test(panel) && /never stored/.test(panel) && /sipAssess/.test(panel));
check('evidence package carries the Appendix C exit + optional SIP summary',
  /archetypeMatrix\(sd\.cs/.test(S('evidence_package.js')) && /Appendix C exit/.test(S('evidence_package.js')) &&
  /SIP \(optional\)/.test(S('evidence_package.js')));


// ---- [15] R1+R2 — the last residues: 27/27 ------------------------------------
check('R1: 2a-1 is PARTIAL until the abstraction level is declared, satisfied with it',
  E.conformance({ meta: { mission: 'm', scope: 's', boundary: 'b' } }, {}).deliverables.find(x => x.id === '2a-1').status === 'partial' &&
  E.conformance({ meta: { scope: 's', boundary: 'b', abstractionLevel: 'subsystem' } }, {}).deliverables.find(x => x.id === '2a-1').status === 'satisfied' &&
  /UNDECLARED/.test(E.conformance({}, {}).deliverables.find(x => x.id === '2a-1').evidence));
check('R1: panel authors the level (three App E values, validated), shows it on the Step 2 header',
  /abstractionLevel/.test(panel) && /system \/ subsystem \/ component/.test(panel) && /level UNDECLARED/.test(panel));
check('R1: meta literal carries abstractionLevel in all four persistence sites + backfill',
  /abstractionLevel: ''/.test(bind) && /abstractionLevel: ''/.test(misc) &&
  /abstractionLevel: ''/.test(dops) && /abstractionLevel: ''/.test(help) &&
  /'mission', 'scope', 'boundary', 'abstractionLevel'/.test(panel));
const R2C = (rows) => E.conformance(
  { cs: GLA, dispositions: { 'a1:np': { status: 'assessed', hazard: 'x', context: 'c' } }, meta: {} },
  { reqRows: rows }).deliverables;
check('R2: 4c-1 counts test dispositions — undisposed rows hold it at partial',
  R2C([{ uca: 'UCA-a1:np' }]).find(x => x.id === '4c-1').status === 'partial' &&
  /0\/1 drafted rows test-disposed/.test(R2C([{ uca: 'UCA-a1:np' }]).find(x => x.id === '4c-1').evidence));
check('R2: critical counts; non-critical WITH rationale counts; bare non-critical is NAMED as a hole',
  /1\/1 drafted rows test-disposed/.test(R2C([{ uca: 'UCA-a1:np', stpaTest: { state: 'critical' } }]).find(x => x.id === '4c-1').evidence) &&
  /1\/1 drafted rows test-disposed/.test(R2C([{ uca: 'UCA-a1:np', stpaTest: { state: 'non-critical', rationale: 'covered by analysis X' } }]).find(x => x.id === '4c-1').evidence) &&
  /non-critical WITHOUT rationale — a bare non-critical is a hole/.test(R2C([{ uca: 'UCA-a1:np', stpaTest: { state: 'non-critical' } }]).find(x => x.id === '4c-1').evidence));
check('R2: 4c-2 rides the same dispositions (partial while tests incomplete)',
  R2C([{ uca: 'UCA-a1:np' }]).find(x => x.id === '4c-2').status !== 'satisfied');
check('R2: panel authors the disposition on the worksheet row — non-critical REFUSES an empty rationale',
  /setTestDisposition/.test(panel) && /testCritical/.test(panel) && /testNonCritical/.test(panel) &&
  /A bare non-critical is a hole/.test(panel) && /rationale on file/.test(panel) &&
  /if \(state === 'critical' && !row\.verifMethod\) row\.verifMethod = 'Test';/.test(panel));

// ---- [8] STPA-BRIDGE: the UCA ↔ FTA/FMEA seam --------------------------------
// cf. doi:10.1177/1748006X261465051 — bridged / interaction / undeclared are
// COMPUTED states; the declaration is the data; dangling refs REFUSE; a pure
// interaction hazard is first-class, never an orphan.
{
  const bDisp = {
    'a1:np': { status: 'assessed', hazard: 'loads exceedance', context: 'gust above design load with GLA armed',
               bridge: { declared: true, ftaRefs: ['G-77'], fmeaRefs: ['FM-3'] } },
    'a1:ph': { status: 'assessed', hazard: 'surface runaway', context: 'quiescent air, hard-over commanded',
               bridge: { declared: true, ftaRefs: [], fmeaRefs: [] } },
    'a2:np': { status: 'assessed', hazard: 'GLA unavailable', context: 'gust encounter, system disarmed' },
    'a2:ss': { status: 'dismissed', rationale: 'latching discrete' }
  };
  const bRes = { fta: ref => ref === 'G-77' ? { id: 42, displayId: 'G-77', name: 'Surface cmd loss' } : null,
                 fmea: ref => ref === 'FM-3' ? { internalId: 'FM-3', failureMode: 'servo hardover' } : null };
  const bm = E.bridgeMap(GLA, bDisp, bRes);
  check('BRIDGE: three computed states — bridged / interaction / undeclared',
    bm.rollup.assessed === 3 && bm.rollup.bridged === 1 && bm.rollup.interaction === 1 && bm.rollup.undeclared === 1);
  check('BRIDGE: bridged entry resolves both lanes and names them',
    (() => { const e0 = bm.entries.find(x => x.ucaId === 'UCA-a1:np');
      return e0.kind === 'bridged' && e0.ftaRefs[0].displayId === 'G-77' && e0.fmeaRefs[0].failureMode === 'servo hardover' &&
        /FTA G-77/.test(e0.statement) && /FMEA FM-3/.test(e0.statement) && /classical lane quantifies/.test(e0.statement); })());
  check('BRIDGE: pure interaction hazard is FIRST-CLASS with the affirmative claim + the citation',
    (() => { const e1 = bm.entries.find(x => x.ucaId === 'UCA-a1:ph');
      return e1.kind === 'interaction' && /PURE INTERACTION HAZARD/.test(e1.statement) &&
        /first-class/.test(e1.statement) && /10\.1177\/1748006X261465051/.test(e1.statement) &&
        !/orphan/.test(e1.statement); })());
  check('BRIDGE: undeclared is honest AND unfinished (named as such)',
    (() => { const e2 = bm.entries.find(x => x.ucaId === 'UCA-a2:np');
      return e2.kind === 'undeclared' && /honest/.test(e2.statement) && /unfinished/.test(e2.statement); })());
  check('BRIDGE: reverse index — FTA node knows its UCAs',
    Array.isArray(bm.byFta['42']) && bm.byFta['42'][0] === 'UCA-a1:np' && bm.byFmea['FM-3'][0] === 'UCA-a1:np');
  check('BRIDGE: dismissed UCAs carry no bridge entry',
    !bm.entries.some(x => x.ucaId === 'UCA-a2:ss'));
  check('BRIDGE: dangling FTA ref REFUSES (broken promise)',
    throws(() => E.bridgeMap(GLA, { 'a1:np': { status: 'assessed', hazard: 'h', context: 'c',
      bridge: { declared: true, ftaRefs: ['NOPE'], fmeaRefs: [] } } }, bRes)));
  check('BRIDGE: dangling FMEA ref REFUSES too',
    throws(() => E.bridgeMap(GLA, { 'a1:np': { status: 'assessed', hazard: 'h', context: 'c',
      bridge: { declared: true, ftaRefs: [], fmeaRefs: ['NOPE'] } } }, bRes)));
  check('BRIDGE: a bridge on a non-assessed disposition REFUSES (the bridge rides an assessment)',
    throws(() => E.bridgeMap(GLA, { 'a2:ss': { status: 'dismissed', rationale: 'r',
      bridge: { declared: true, ftaRefs: [], fmeaRefs: [] } } }, bRes)));
  check('BRIDGE: display-lane — bridgeMap leaves dispositions byte-identical',
    (() => { const snap = JSON.stringify(bDisp); E.bridgeMap(GLA, bDisp, bRes); return JSON.stringify(bDisp) === snap; })());
  // Panel wiring (source-level).
  check('BRIDGE panel: author adapter setBridge exists and refuses without an assessment',
    /setBridge: function \(key, ftaRefs, fmeaRefs\)/.test(panel) && /The bridge rides an assessment/.test(panel));
  check('BRIDGE panel: bridge action with the two-lane prompt flow + interaction declaration',
    /bridge: function \(key\)/.test(panel) && /PURE INTERACTION hazard/.test(panel) && /_bridgeResolvers\(\)/.test(panel));
  check('BRIDGE panel: refs validated against live stores BEFORE landing (dangling refused at the door)',
    /a dangling bridge is a broken promise/.test(panel));
  check('BRIDGE panel: per-row chip renders bridged refs, the interaction claim, and the undeclared prompt',
    /_bridgeChip/.test(panel) && /bridge: PURE INTERACTION — first-class, STPA-owned/.test(panel) &&
    /bridge: undeclared — counterpart on FTA\/FMEA, or pure interaction\?/.test(panel));
  check('BRIDGE panel: Step-3 card carries the computed rollup (and surfaces engine refusals)',
    /bm\.rollup\.bridged \+ ' bridged to the classical lanes/.test(panel) && /Bridge: REFUSED — /.test(panel));
  check('BRIDGE: engine exports bridgeMap in the API', typeof E.bridgeMap === 'function');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
