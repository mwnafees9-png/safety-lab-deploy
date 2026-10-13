#!/usr/bin/env node
/*
 * Regression: suspected common causes are detected LIVE and each one needs a recorded decision
 * (13 Oct 2026, fix 6 part B, Waqas's ruling).
 *
 * FOUND: autoDetectCommonModes only ran on a button ("Auto-detect from fault trees") and staged
 * SUGGESTED CMA rows that changed nothing until someone clicked Accept; nothing recorded who
 * dismissed what or why, and a tree edited after the scan was never looked at again.
 *
 * FIX: site/cma_live.js. Detection runs whenever the trees change (scheduleAutosave, the end of
 * _applyProjectData and _restoreProjectSnapshot), debounced. Every suspect (CCF group, shared
 * event or transferred branch under two inputs of an AND/voting gate, shared resource across
 * redundant branches) opens one blocking prompt; Accept creates the open CMA finding linked to the
 * coupled AND gates (allocateDAL then marks them compromised); Ignore needs a written reason. Every
 * decision lands in projectConfig.cmaDecisionLog with who, when, why, key and locations. A suspect
 * decided earlier asks again only when it reaches a new gate, page or member. Tests and scripted
 * builds record their decision through the automation path instead of a modal.
 *
 * EXECUTED: the REAL site/support_modules.js (allocateDAL, _cmaCompromisedIndex,
 * _sharedResourceCouplings, autoDetectCommonModes), the REAL site/cma_live.js, helper functions
 * cut verbatim out of site/helpers_modules.js, and for D10 the REAL site/crdt_sync.js with the
 * real bundled Yjs in two vm "tabs". Expected answers are written by hand from the tree shapes
 * (which gate couples what), never read back from the module.
 *   D1  detection: a CCF group; a shared event under two inputs of an AND (and NOT when it only
 *       repeats under an OR); the same page transferred into both inputs of an AND; a shared
 *       resource; the coupled gate keys are exactly the AND gates by construction
 *   D2  nothing decided: every suspect is pending; the prompt cannot be submitted incomplete;
 *       Ignore with an empty reason is refused
 *   D3  Accept: an open CMA finding, autoKey, linked to the coupled AND gate; allocateDAL marks
 *       that gate compromised and withdraws the reduction (children back at the top DAL);
 *       common cause is not added to the single-failure list
 *   D4  Ignore: the log entry carries who (signed-in identity), when, why, key, locations
 *   D5  re-ask rules: unchanged suspect does not ask; a new location asks (and says so); a new
 *       member asks; an accepted suspect whose finding was deleted asks again
 *   D6  old projects: a suggested row from the old button is undecided; an accepted old row
 *       covering its gates counts as decided
 *   D7  automation: window.__SL_CMA_AUTOMATION and withAutomation record decisions without a
 *       prompt; a showcase load is recorded by the showcase loader; a person's input after the
 *       load ends that
 *   D8  an undo that restores an older projectConfig of the SAME project gets this session's
 *       decision entries back (the record is never undone)
 *   D9  the button now runs the live check (old staging superseded); performance on a
 *       20,000-node project
 *   D10 two teammates deciding at the same time: both log entries survive the CRDT merge;
 *       mutation: without the PC_LOGS entry one is lost
 *   D11 mutation: needsDecision that ignores locations stops re-asking (D5 goes red)
 *
 * Run: node tests/regression_cma_live_decisions_20261013.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function fnText(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('missing ' + name);
    let d = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
    throw new Error('unbalanced ' + name);
}
const HELPERS = read('helpers_modules.js');
const LIVE = read('cma_live.js');

function boot(liveSrc) {
    const toasts = [];
    const ctx = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object, Array, String, Number, Date, isFinite, parseFloat, parseInt, Error, Promise,
        setTimeout: () => 0, clearTimeout() {}, showToast: (m, t) => toasts.push([m, t]) };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext('var ftaPages = []; var cmaData = []; var projectConfig = {}; var resourcesData = []; var acFunctionsData = []; var itemsData = []; var internalIdCounter = 1;', ctx);
    vm.runInContext((read('safety_targets.js').match(/const DAL_ORDER = \[[^\]]*\];/) || ['var DAL_ORDER = ["A","B","C","D","E"];'])[0], ctx);
    vm.runInContext([fnText(HELPERS, 'dalMax'), fnText(HELPERS, 'dalDecrement'), fnText(HELPERS, '_enumerateAllGates')].join('\n'), ctx);
    vm.runInContext(read('support_modules.js'), ctx, { filename: 'support_modules.js' });
    vm.runInContext(liveSrc || LIVE, ctx, { filename: 'cma_live.js' });
    ctx.__toasts = toasts;
    return ctx;
}
const run = (ctx, s) => vm.runInContext(s, ctx);
let _id = 1;
const be = (lid, extra) => Object.assign({ id: 'n' + (_id++), logicalId: lid, displayId: 'BE-' + lid, name: 'Event ' + lid, type: 'basic', probability: 1e-4, lambda: 1e-4, children: [] }, extra || {});
const gate = (gt, kids, extra) => Object.assign({ id: 'g' + (_id++), displayId: 'G' + _id, name: gt + ' gate', type: 'gate', gateType: gt, children: kids }, extra || {});

// A project with one of each suspect, hand-built so the coupled gates are known in advance.
function project() {
    _id = 1;
    const S1 = be('S'), S2 = be('S');                                   // shared sensor in both channels
    const chA = gate('OR', [S1, be('A1')]), chB = gate('OR', [S2, be('B1')]);
    const andShared = gate('AND', [chA, chB], { dalIndependence: 'substantiated' });
    const R1 = be('R'), R2 = be('R');                                   // repeated under an OR only: no redundancy defeated
    const orOnly = gate('OR', [gate('OR', [R1, be('X1')]), gate('OR', [R2, be('X2')])]);
    const C1 = be('C1', { ccfGroup: 'PUMPS', beta: 0.05 }), C2 = be('C2', { ccfGroup: 'PUMPS', beta: 0.05 });
    const andCcf = gate('AND', [C1, C2], { dalIndependence: 'substantiated' });
    const t1 = gate('TRANSFER', [], { transferOutTo: 'p-power', linkedPageId: 'p-power' }), t2 = gate('TRANSFER', [], { transferOutTo: 'p-power', linkedPageId: 'p-power' });
    const andXfer = gate('AND', [gate('OR', [t1, be('L1')]), gate('OR', [t2, be('L2')])], { dalIndependence: 'substantiated' });
    const top = gate('OR', [andShared, orOnly, andCcf, andXfer]);
    const power = { id: 'p-power', name: 'Loss of bus power', root: gate('OR', [be('PW1'), be('PW2')]) };
    const main = { id: 'p-main', name: 'Loss of control', root: top };
    return { pages: [main, power], refs: { andShared, andCcf, andXfer, chA, chB, orOnly, C1, C2, top } };
}
function load(ctx, P) { ctx.ftaPages = P.pages; run(ctx, 'ftaPages = globalThis.ftaPages; cmaData = []; projectConfig = {}; resourcesData = []; SLCmaLive._reset();'); }
const keyOf = (page, g) => page + ':' + g.id;

// ---------------------------------------------------------------- D1
console.log('\n[D1] live detection finds every kind of suspect, and only real ones');
{
    const ctx = boot(); const P = project(); load(ctx, P);
    const S = run(ctx, 'SLCmaLive.detectSuspects()');
    const byKey = {}; S.forEach(s => { byKey[s.key] = s; });
    check('D1 a CCF group is a suspect', !!byKey['ccf:PUMPS']);
    check('D1 the CCF group couples exactly its AND gate', byKey['ccf:PUMPS'] && JSON.stringify(byKey['ccf:PUMPS'].coupledGates) === JSON.stringify([keyOf('p-main', P.refs.andCcf)]), JSON.stringify(byKey['ccf:PUMPS'] && byKey['ccf:PUMPS'].coupledGates));
    check('D1 a shared event under two inputs of an AND is a suspect, coupling that AND only', byKey['shared:S'] && JSON.stringify(byKey['shared:S'].coupledGates) === JSON.stringify([keyOf('p-main', P.refs.andShared)]), JSON.stringify(byKey['shared:S']));
    check('D1 its locations are both channel gates', byKey['shared:S'] && JSON.stringify(byKey['shared:S'].locations) === JSON.stringify([keyOf('p-main', P.refs.chA), keyOf('p-main', P.refs.chB)].sort()));
    check('D1 an event repeated under OR gates only is NOT a suspect', !byKey['shared:R']);
    check('D1 the same page transferred into both inputs of an AND is a suspect', byKey['shared-page:p-power'] && JSON.stringify(byKey['shared-page:p-power'].coupledGates) === JSON.stringify([keyOf('p-main', P.refs.andXfer)]), JSON.stringify(byKey['shared-page:p-power']));
    // shared resource: two channels realize functions that consume one resource
    ctx.acFunctionsData = [{ subId: 'F1', subName: 'Pitch A' }, { subId: 'F2', subName: 'Pitch B' }];
    run(ctx, 'acFunctionsData = globalThis.acFunctionsData; resourcesData = [{ resId: "RES-1", name: "Hydraulic system 1", consumedBy: ["F1", "F2"] }];');
    const items = [{ internalId: 'IT1', traceIds: ['F1'] }, { internalId: 'IT2', traceIds: ['F2'] }];
    ctx.itemsData = items; run(ctx, 'itemsData = globalThis.itemsData;');
    P.refs.C1.realizedByItemId = 'IT1'; P.refs.C2.realizedByItemId = 'IT2';
    const S2 = run(ctx, 'SLCmaLive.detectSuspects()');
    const res = S2.find(s => s.kind === 'shared-resource');
    check('D1 a resource consumed by both inputs of an AND is a suspect at that gate', res && JSON.stringify(res.coupledGates) === JSON.stringify([keyOf('p-main', P.refs.andCcf)]) && /Hydraulic system 1/.test(res.subject), JSON.stringify(res));
}

// ---------------------------------------------------------------- D2
console.log('\n[D2] undecided suspects are pending and the prompt cannot be skipped');
{
    const ctx = boot(); const P = project(); load(ctx, P);
    const r = run(ctx, 'SLCmaLive.checkNow()');
    check('D2 every suspect is pending', r && r.pending.length === 3 && r.suspects.length === 3, r && r.pending.map(s => s.key).join(','));
    check('D2 submit refuses while any item is undecided', run(ctx, 'SLCmaLive.submitModal()') === false && run(ctx, 'SLCmaLive.pending().length') === 3);
    run(ctx, 'SLCmaLive.pending().forEach(function (s) { SLCmaLive.setChoice(s.key, "ignore", ""); })');
    check('D2 Ignore with an empty reason does not count as decided', run(ctx, 'SLCmaLive.submitModal()') === false);
    let threw = false; try { run(ctx, 'SLCmaLive.decide(SLCmaLive.pending()[0], "ignore", "   ")'); } catch (e) { threw = /reason/.test(e.message); }
    check('D2 decide() refuses Ignore without a written reason', threw);
    check('D2 nothing was logged by the refused attempts', run(ctx, '(projectConfig.cmaDecisionLog || []).length') === 0);
    run(ctx, 'checkNow = null; SLCmaLive.onModelChange("edit")');
    check('D2 a later change keeps them pending (the prompt comes back)', run(ctx, 'SLCmaLive.checkNow().pending.length') === 3);
}

// ---------------------------------------------------------------- D3 / D4
console.log('\n[D3-D4] Accept makes the open finding that compromises the gate; Ignore records why');
{
    const ctx = boot(); const P = project(); load(ctx, P);
    ctx.SLAvatar = { me: () => ({ name: 'Waqas N', email: 'waqas@example.com' }) };
    run(ctx, 'SLCmaLive.checkNow()');
    // Before: the substantiated AND gate reduces.
    run(ctx, 'allocateDAL(ftaPages[0].root, "A", new Set())');
    const before = { gate: !!P.refs.andShared._dalCompromised, kids: P.refs.andShared.children.map(c => c.allocatedDAL).join(',') };
    P.pages.forEach(p => (function strip(n) { if (!n) return; delete n.allocatedDAL; (n.children || []).forEach(strip); })(p.root));
    run(ctx, 'SLCmaLive.setChoice("shared:S", "accept", "")');
    run(ctx, 'SLCmaLive.setChoice("ccf:PUMPS", "ignore", "Dissimilar pumps from two suppliers, see CMA-012")');
    run(ctx, 'SLCmaLive.setChoice("shared-page:p-power", "accept", "Both lanes on one bus")');
    check('D3 the prompt submits once every item is decided', run(ctx, 'SLCmaLive.submitModal()') === true && run(ctx, 'SLCmaLive.pending().length') === 0);
    const row = run(ctx, 'cmaData.find(function (r) { return r.autoKey === "shared:S"; })');
    check('D3 Accept created an OPEN CMA finding (not a suggestion) with findings text', row && row.status === 'Open' && !row.suggested && String(row.findings).length > 20, JSON.stringify(row));
    check('D3 linked to the coupled AND gate', row && JSON.stringify(row.linkedGateIds) === JSON.stringify([keyOf('p-main', P.refs.andShared)]), row && JSON.stringify(row.linkedGateIds));
    run(ctx, 'allocateDAL(ftaPages[0].root, "A", new Set())');
    const after = { gate: !!P.refs.andShared._dalCompromised, kids: P.refs.andShared.children.map(c => c.allocatedDAL).join(',') };
    check('D3 before Accept the gate reduced (a member below A)', before.gate === false && /[B-E]/.test(before.kids), JSON.stringify(before));
    check('D3 after Accept allocateDAL marks the gate compromised and withdraws the reduction', after.gate === true && after.kids === 'A,A', JSON.stringify(after));
    check('D3 the ignored CCF gate keeps its reduction', !P.refs.andCcf._dalCompromised);
    check('D3 the compromised gate requires a common cause term (shared event: no CCF group on its members)', P.refs.andShared._probCompromised === true, String(P.refs.andShared._probCompromised));
    // Fix B: an AND gate left at the DEFAULT independence no longer reduces before CMA; Accept must
    // still drive it to compromised (the finding is what the gate's flags and requirement read).
    delete P.refs.andXfer.dalIndependence;
    P.pages.forEach(p => (function strip(n) { if (!n) return; delete n.allocatedDAL; (n.children || []).forEach(strip); })(p.root));
    run(ctx, 'allocateDAL(ftaPages[0].root, "A", new Set())');
    check('D3 default independence (fix B): the accepted coupling marks the gate compromised, members at the top DAL', P.refs.andXfer._dalCompromised === true && P.refs.andXfer.children.every(c => c.allocatedDAL === 'A'), JSON.stringify({ c: P.refs.andXfer._dalCompromised, k: P.refs.andXfer.children.map(c => c.allocatedDAL) }));
    // Single-failure list: the BDD-based list excludes common cause variables (real fta_engine.js).
    const E = (() => { const c = { console, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, Error }; c.window = c; vm.createContext(c); vm.runInContext(read('fta_engine.js'), c); return c.SLFTAEngine; })();
    const singles = E.singleFailureEvents(E.buildBDDFromFT(P.refs.andCcf));
    check('D3 common cause is not added to the single-failure list', singles.length === 0, JSON.stringify(singles));
    const log = run(ctx, 'projectConfig.cmaDecisionLog');
    const ign = log.find(e => e.key === 'ccf:PUMPS');
    check('D4 three entries, one per suspect', log.length === 3);
    check('D4 Ignore entry: who (signed-in name + email), when, why', ign && ign.decision === 'ignore' && ign.by.name === 'Waqas N' && ign.by.email === 'waqas@example.com' && !isNaN(Date.parse(ign.at)) && /Dissimilar pumps/.test(ign.reason), JSON.stringify(ign));
    check('D4 Ignore entry: the suspect key, its locations and members', ign && ign.locations.length === 1 && ign.locations[0] === keyOf('p-main', P.refs.andCcf) && JSON.stringify(ign.members) === '["C1","C2"]' && ign.via === 'prompt');
    const acc = log.find(e => e.key === 'shared:S');
    check('D4 Accept entry names the CMA finding it created', acc && acc.cmaId === row.cmaId && acc.cmaInternalId === row.internalId);
}

// ---------------------------------------------------------------- D5
console.log('\n[D5] a decided suspect asks again only when it reaches a new place');
function decidedProject() {
    const ctx = boot(); const P = project(); load(ctx, P);
    run(ctx, 'SLCmaLive.withAutomation({ actor: "test", decide: function (s) { return s.key === "shared:S" ? { decision: "accept" } : { decision: "ignore", reason: "reviewed" }; } }, function () {})');
    return { ctx, P };
}
{
    const { ctx, P } = decidedProject();
    check('D5 everything decided', run(ctx, 'SLCmaLive.checkNow().pending.length') === 0);
    P.refs.chA.name = 'renamed'; P.refs.chA.children.push(be('A9'));
    check('D5 an unchanged suspect does not ask again (other edits around it)', run(ctx, 'SLCmaLive.checkNow().pending.length') === 0);
    const newGate = gate('OR', [be('C1', { ccfGroup: 'PUMPS', beta: 0.05 }), be('Z')]);
    P.refs.top.children.push(newGate);
    const r = run(ctx, 'SLCmaLive.checkNow()');
    const p = r.pending.find(s => s.key === 'ccf:PUMPS');
    check('D5 an ignored group that reaches a NEW gate asks again', r.pending.length === 1 && !!p, r.pending.map(s => s.key).join(','));
    check('D5 and says why: new location, with the earlier decision', p && p.need.why === 'new-location' && p.need.prev && p.need.prev.reason === 'reviewed');
    run(ctx, 'SLCmaLive.decide(SLCmaLive.pending()[0], "ignore", "still dissimilar")');
    check('D5 decided again: quiet', run(ctx, 'SLCmaLive.checkNow().pending.length') === 0);
    P.refs.andCcf.children.push(be('C3', { ccfGroup: 'PUMPS', beta: 0.05 }));
    check('D5 a NEW member in the group asks again', run(ctx, 'SLCmaLive.checkNow().pending.map(function (s) { return s.key; }).join()') === 'ccf:PUMPS');
}
{
    // Same gates, same members, but a NEW AND gate now joins them: that is a new coupling.
    const { ctx, P } = decidedProject();
    const orA = gate('OR', [be('Q', { ccfGroup: 'VALVES', beta: 0.1 }), be('QA')]), orB = gate('OR', [be('Q2', { ccfGroup: 'VALVES', beta: 0.1 }), be('QB')]);
    P.refs.top.children.push(orA, orB);
    run(ctx, 'SLCmaLive.checkNow(); SLCmaLive.decide(SLCmaLive.pending()[0], "ignore", "never in the same redundancy")');
    check('D5 decided while the members sat under OR gates only', run(ctx, 'SLCmaLive.checkNow().pending.length') === 0);
    P.refs.top.children.splice(P.refs.top.children.indexOf(orA), 2, gate('AND', [orA, orB]));
    const r = run(ctx, 'SLCmaLive.checkNow()');
    check('D5 a NEW AND gate coupling the same members asks again', r.pending.length === 1 && r.pending[0].key === 'ccf:VALVES' && r.pending[0].need.why === 'new-location', JSON.stringify(r.pending.map(s => s.key)));
}
{
    const { ctx } = decidedProject();
    run(ctx, 'cmaData.splice(cmaData.findIndex(function (r) { return r.autoKey === "shared:S"; }), 1)');
    const r = run(ctx, 'SLCmaLive.checkNow()');
    check('D5 an accepted suspect whose CMA finding was deleted asks again', r.pending.length === 1 && r.pending[0].key === 'shared:S' && r.pending[0].need.why === 'finding-removed', JSON.stringify(r.pending.map(s => [s.key, s.need])));
}

// ---------------------------------------------------------------- D6
console.log('\n[D6] projects from the button era');
{
    const ctx = boot(); const P = project(); load(ctx, P);
    run(ctx, 'cmaData.push({ internalId: 1, cmaId: "CMA-001", autoKey: "ccf:PUMPS", suggested: true, status: "Open", findings: "auto", linkedGateIds: [' + JSON.stringify(keyOf('p-main', P.refs.andCcf)) + '] })');
    run(ctx, 'cmaData.push({ internalId: 2, cmaId: "CMA-002", autoKey: "shared:S", status: "Open", findings: "accepted long ago", linkedGateIds: ' + JSON.stringify([keyOf('p-main', P.refs.chA), keyOf('p-main', P.refs.chB)]) + ' })');
    const keys = run(ctx, 'SLCmaLive.checkNow().pending.map(function (s) { return s.key; }).sort().join()');
    check('D6 a suggested row is still undecided; an accepted old row covering its gates is decided', keys === 'ccf:PUMPS,shared-page:p-power', keys);
    run(ctx, 'SLCmaLive.decide(SLCmaLive.pending().find(function (s) { return s.key === "ccf:PUMPS"; }), "ignore", "reviewed")');
    check('D6 Ignore removes the stale suggested row, as Dismiss did', run(ctx, 'cmaData.filter(function (r) { return r.autoKey === "ccf:PUMPS"; }).length') === 0);
}

// ---------------------------------------------------------------- D7
console.log('\n[D7] automation and showcase loads record a decision without a prompt');
{
    const ctx = boot(); const P = project(); load(ctx, P);
    run(ctx, 'window.__SL_CMA_AUTOMATION = { actor: "Test harness", decide: function () { return { decision: "ignore", reason: "fixture" }; } }');
    const r = run(ctx, 'SLCmaLive.checkNow()');
    check('D7 window.__SL_CMA_AUTOMATION decides everything, nothing pending', r.pending.length === 0 && r.decidedByAutomation.length === 3);
    const e = run(ctx, 'projectConfig.cmaDecisionLog[0]');
    check('D7 recorded as automation, with the actor', e.via === 'automation' && e.by.name === 'Test harness' && e.reason === 'fixture');
}
{
    const ctx = boot(); const P = project(); load(ctx, P);
    run(ctx, 'window.__slDemoLoadedAt = Date.now()');
    const r = run(ctx, 'SLCmaLive.checkNow()');
    check('D7 a fresh showcase load is recorded by the showcase loader (Ignore, reason says unreviewed)', r.pending.length === 0 && r.decidedByAutomation.length === 3 && /Showcase/.test(r.decidedByAutomation[0].by.name) && /no engineer/.test(r.decidedByAutomation[0].reason));
    run(ctx, 'SLCmaLive.reconsider("ccf:PUMPS")');
    check('D7 Reconsider on the log puts it back in front of a person', run(ctx, 'SLCmaLive.pending().map(function (s) { return s.key; }).join()') === 'ccf:PUMPS');
}
{
    const ctx = boot(); const P = project(); load(ctx, P);
    run(ctx, 'window.__slDemoLoadedAt = Date.now() - 30000');
    check('D7 outside the showcase window a person is asked', run(ctx, 'SLCmaLive.checkNow().pending.length') === 3);
}

// ---------------------------------------------------------------- D8
console.log('\n[D8] an undo never erases the record of a decision');
{
    const ctx = boot(); const P = project(); load(ctx, P);
    run(ctx, 'SLCmaLive.checkNow(); SLCmaLive.decide(SLCmaLive.pending()[0], "ignore", "first")');
    const older = run(ctx, 'JSON.parse(JSON.stringify(projectConfig))');
    run(ctx, 'SLCmaLive.decide(SLCmaLive.pending()[1], "ignore", "second")');
    ctx.__older = older;
    run(ctx, 'projectConfig = globalThis.__older; SLCmaLive.onModelChange("load")');
    check('D8 the restored config lost the second entry', run(ctx, 'projectConfig.cmaDecisionLog.length') === 1);
    run(ctx, 'SLCmaLive.checkNow()');
    check('D8 the load puts this session\'s entry back', run(ctx, 'projectConfig.cmaDecisionLog.map(function (e) { return e.reason; }).join()') === 'first,second');
    ctx.__other = { cmaDecisionTag: 'another-project', cmaDecisionLog: [] };
    run(ctx, 'projectConfig = globalThis.__other; SLCmaLive.onModelChange("load"); SLCmaLive.checkNow()');
    check('D8 never into a different project', run(ctx, 'projectConfig.cmaDecisionLog.length') === 0);
}

// ---------------------------------------------------------------- D9
console.log('\n[D9] the button runs the live check; performance');
{
    const ctx = boot(); const P = project(); load(ctx, P);
    run(ctx, 'autoDetectCommonModes()');
    check('D9 the button runs the live check (suspects pending, no suggested rows staged)', run(ctx, 'SLCmaLive.pending().length') === 3 && run(ctx, 'cmaData.filter(function (r) { return r.suggested; }).length') === 0);
    // 20,000 nodes: 50 pages of 400, with repeats, groups and transfers.
    _id = 1;
    const pages = [];
    for (let p = 0; p < 50; p++) {
        const chans = [];
        for (let c = 0; c < 10; c++) {
            const leaves = [];
            for (let l = 0; l < 36; l++) leaves.push(be('P' + p + 'L' + c + '_' + l, (l === 0 ? { ccfGroup: 'G' + p, beta: 0.01 } : null)));
            leaves.push(be('SHARED' + p));
            chans.push(gate('OR', leaves));
        }
        if (p > 0) chans.push(gate('TRANSFER', [], { transferOutTo: 'pg' + (p - 1) }));
        pages.push({ id: 'pg' + p, name: 'Page ' + p, root: gate('AND', [gate('AND', chans.slice(0, 5)), gate('OR', chans.slice(5))]) });
    }
    let nodes = 0; pages.forEach(pg => (function w(n) { nodes++; (n.children || []).forEach(w); })(pg.root));
    ctx.ftaPages = pages; run(ctx, 'ftaPages = globalThis.ftaPages;');
    run(ctx, 'SLCmaLive.detectSuspects()');
    const t0 = process.hrtime.bigint();
    let found = 0; for (let i = 0; i < 5; i++) found = run(ctx, 'SLCmaLive.detectSuspects().length');
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 5;
    console.log('  info  detection over ' + nodes + ' nodes: ' + ms.toFixed(1) + ' ms per run, ' + found + ' suspects');
    check('D9 detection over ~20,000 nodes stays under 250 ms per run (debounced, so once per pause)', nodes >= 18000 && ms < 250, ms.toFixed(1) + ' ms');
    check('D9 and finds the 50 groups and 50 shared events', found === 100, String(found));
}

// ---------------------------------------------------------------- D10
console.log('\n[D10] two teammates deciding at once: both entries survive the CRDT merge');
const D10 = (async () => {
    const SRC = read('crdt_sync.js'), YJS = read(path.join('vendor', 'yjs.min.js'));
    const yc = { console, setTimeout, clearTimeout, Uint8Array, Map, Set, Promise, TextEncoder, TextDecoder, crypto: require('crypto').webcrypto };
    yc.window = yc; yc.globalThis = yc; vm.createContext(yc); vm.runInContext(YJS + ';globalThis.Y = Y;', yc);
    const Y = Object.assign({}, yc.Y, { IndexeddbPersistence: undefined });
    const _inPlace = (function () {
        const i = HELPERS.indexOf('function _isPlainObj('), j = HELPERS.indexOf('\n}', i) + 2;
        const k = HELPERS.indexOf('function _assignDeepInPlace('), l = HELPERS.indexOf('\n// Keyed rows', k);
        const c = {}; vm.createContext(c); vm.runInContext(HELPERS.slice(i, j) + '\n' + HELPERS.slice(k, l) + '\nglobalThis.__f = _assignDeepInPlace;', c);
        return c.__f;
    })();
    const clone = o => JSON.parse(JSON.stringify(o));
    const COLS = { acFunctionsData: [], acFhaData: [], acReqData: [], acAssumptionsData: [], praData: [], zsaData: [], cmaData: [], fmeaData: [], acFcimData: [], routingData: [], resourcesData: [], itemsData: [], flightPhasesData: [], systemsData: [], ftaPages: [], mlData: {}, stpaData: {}, typeCounters: {} };
    async function pair(src) {
        let rooms = {}, q = [], busy = false;
        const deliver = () => { if (busy) return; busy = true; try { while (q.length) q.shift()(); } finally { busy = false; } };
        const client = () => ({
            channel(name) { const ch = { handlers: {}, on(t, f, cb) { ch.handlers[f.event] = cb; return ch; }, subscribe(cb) { (rooms[name] = rooms[name] || []).push(ch); try { cb('SUBSCRIBED'); } catch (_) {} return ch; },
                send(m) { (rooms[name] || []).forEach(o => { if (o !== ch && o.handlers[m.event]) q.push(() => o.handlers[m.event](m)); }); deliver(); }, unsubscribe() {} }; return ch; },
            from() { return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }), upsert: () => Promise.resolve({}) }; }
        });
        function tab(pc) {
            const env = { timers: [], model: Object.assign(clone(COLS), { projectConfig: clone(pc) }) };
            const win = { Y, navigator: { onLine: true }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, console: { info() {}, warn() {}, error() {}, log() {} },
                getActiveCloudProjectId: () => 'proj-c', getActiveWorkspaceId: () => 'ws-1', isSupabaseSignedIn: () => true, getSupabaseClient: client,
                SLConfig: { mode: 'self-hosted', ownServer: true, fatal: null },
                __crdtCapture: () => clone(env.model),
                __crdtApply: (p) => { Object.keys(p).forEach(k => { if (k === 'projectConfig' && p[k] && typeof p[k] === 'object') { env.model.projectConfig = _inPlace(env.model.projectConfig, clone(p[k])); return; } if (Array.isArray(p[k]) || (p[k] && typeof p[k] === 'object' && !/^__/.test(k))) env.model[k] = clone(p[k]); }); },
                addEventListener() {}, projectConfig: {}, SL_CRDT_AUTHORITATIVE: true, _activeCloudDocVersion: 3 };
            win.window = win;
            const doc = { getElementById: () => null, createElement: () => ({ style: {}, set src(v) {}, appendChild() {} }), head: { appendChild() {} }, documentElement: { appendChild() {} }, body: { appendChild() {} }, visibilityState: 'visible' };
            const ctx = Object.assign(win, { document: doc, setTimeout: (f, ms) => { env.timers.push({ f }); return env.timers.length; }, clearTimeout: (id) => { if (env.timers[id - 1]) env.timers[id - 1].f = null; }, setInterval: () => 0,
                btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: b => Buffer.from(b, 'base64').toString('binary'), Date, JSON, Math, Uint8Array, Promise, Array, Object, String, Map, Set, crypto: require('crypto').webcrypto });
            vm.createContext(ctx); vm.runInContext(src, ctx);
            env.api = ctx.SafetyLabCRDT;
            env.flush = () => { env.timers.forEach(t => { if (t.f) { const f = t.f; t.f = null; f(); } }); };
            env.edit = (mut) => { mut(env.model.projectConfig); env.api.onLocalChange(); env.flush(); };
            env.silent = (mut) => mut(env.model.projectConfig);
            env.advance = (ms) => { const base = Date.now() + ms; class D extends Date { static now() { return base; } } ctx.Date = D; };
            env.api.refresh();
            return env;
        }
        const settle = () => new Promise(r => setImmediate(r));
        const pc0 = { regulation: 'Part 25', aiAuditLog: [], aiDraftLog: [], cmaDecisionLog: [] };
        const A = tab(pc0); await settle(); await settle(); A.flush();
        const B = tab(pc0); await settle(); await settle(); B.flush(); A.flush();
        A.advance(20000); B.advance(20000);      // past the adopt window, as the settings-sync suite does
        return { A, B };
    }
    async function scenario(src) {
        const { A, B } = await pair(src);
        const e = (id, who) => ({ id, key: 'ccf:PUMPS', decision: 'ignore', reason: 'by ' + who, by: { name: who, email: '' }, at: new Date().toISOString() });
        B.silent(pc => { pc.cmaDecisionLog.push(e('CMAD-b', 'Dan')); });
        A.edit(pc => { pc.cmaDecisionLog.push(e('CMAD-a', 'Waqas')); });
        B.flush(); A.flush(); B.flush(); A.flush();
        const ids = env => (env.model.projectConfig.cmaDecisionLog || []).map(x => x.id).sort().join(',');
        return { A: ids(A), B: ids(B) };
    }
    const good = await scenario(SRC);
    check('D10 both teammates\' decisions are in both tabs', good.A === 'CMAD-a,CMAD-b' && good.B === 'CMAD-a,CMAD-b', JSON.stringify(good));
    const mutated = SRC.replace(/\n    \/\/ 13 Oct 2026 \(fix 6\): the common cause decision log[\s\S]*?\n    cmaDecisionLog: \{[\s\S]*?\n    \}\n/, '\n');
    check('D10 mutation applied (log entry removed from PC_LOGS)', mutated !== SRC && !/cmaDecisionLog: \{/.test(mutated));
    const bad = await scenario(mutated.replace("},\n  };\n  function _isAic", "}\n  };\n  function _isAic"));
    check('D10 mutation: without the append-only merge a teammate\'s decision is lost', !(bad.A === 'CMAD-a,CMAD-b' && bad.B === 'CMAD-a,CMAD-b'), JSON.stringify(bad));
})();

// ---------------------------------------------------------------- D11
console.log('\n[D11] mutation: locations ignored in the re-ask rule');
{
    const mutated = LIVE.replace(/var covered = [^;]*;/, 'var covered = true;');
    check('D11 mutation applied', mutated !== LIVE);
    const ctx = boot(mutated); const P = project(); load(ctx, P);
    run(ctx, 'SLCmaLive.withAutomation({ actor: "t", decide: function () { return { decision: "ignore", reason: "r" }; } }, function () {})');
    P.refs.top.children.push(gate('OR', [be('C1', { ccfGroup: 'PUMPS', beta: 0.05 }), be('Z')]));
    check('D11 with locations ignored, the new location does NOT ask (D5 goes red)', run(ctx, 'SLCmaLive.checkNow().pending.length') === 0);
}

D10.then(() => {
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
}, e => { console.log('  FAIL  D10 harness crashed  -- ' + (e && e.stack)); process.exit(1); });
