#!/usr/bin/env node
/*
 * Regression: the STPA control structure, drawn and edited by hand (13 Oct 2026, hand-build round).
 *
 * FOUND. Step 2 of the STPA walkthrough drew the control structure as a fixed 680 by 300 picture:
 *   tables only, no zoom, pan, full screen or undo. The STPA Handbook's actuators and sensors, and
 *   the process model and control algorithm inside each controller, were missing; controllers and
 *   processes had no link to the architecture model. The "Other inputs / outputs" add button read
 *   the FEEDBACK row's inputs (prefix 'ef'), so it could only ever add a copy of a feedback.
 * FIX. site/stpa_panel.js v1.1 mounts the one diagram editor core (SLDiagramEditor) in the Handbook
 *   notation: controller (algorithm and process model drawn inside, edited in the properties
 *   panel), controlled process, actuator, sensor, external element; control action, feedback,
 *   other input or output, disturbance, actuates, measured by. The adapter (csModel / csApply)
 *   reads and writes stpaData.cs itself, so the tables and the diagram are two views of one store;
 *   positions live in stpaData.diagram.layout. csGuard applies the tables' refusals (UCA decisions,
 *   responsibilities, precedence) to diagram changes. stpa_core.js v1.2 resolves a control action
 *   through its actuator and a feedback through its sensor (targetsOf / sourcesOf), so INV-32,
 *   loopSummary, conflictSites and the UCA seeds reason about the real loop; a structure without
 *   actuators or sensors gives byte-identical results. sysml_model.js v1.1 exports / imports the
 *   new symbols with the SafetyLab library; every element carries sysmlRef (model link).
 * EXECUTED. [1] old vs new engine on every structure without actuators: identical output (the
 *   pre-change engine is read from git). [2] actuator / sensor loops against hand-derived answers,
 *   plus a mutation (the old loop test) that goes red. [3] the store <-> diagram mapping: lossless
 *   round trip, provenance kept, old data never written by a read, guards, ids; mutations red.
 *   [4] the tables' "other" add reads its own row. [5] SysML v2 export / import of the new symbols.
 *   [6] real Chromium on the K350 showcase: draw from blank with the mouse (toolbox drag, port
 *   drag, chooser), edit the control algorithm, undo / redo, tables in sync, INV-32 arrow appears
 *   and clears, model link, full screen, AI draft shown then edited, guarded delete, old project
 *   data opens unchanged.
 * Run: node tests/regression_stpa_control_structure_20261013b.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' - ' + String(d).slice(0, 1600) : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const clone = o => JSON.parse(JSON.stringify(o));
const loadEngine = src => { const m = { exports: {} }; new Function('module', 'window', src)(m, undefined); return m.exports; };
const E = loadEngine(S('stpa_core.js'));

// ---------------------------------------------------------------------------------------------
console.log('\n[1] old structures: the v1.2 engine answers exactly as the engine before this change');
let OLD = null;
// The pre-change engine is kept as a fixture (it was read from a working-copy commit that does not exist in the main repo).
try { OLD = loadEngine(fs.readFileSync(path.join(__dirname, 'fixtures', 'stpa_core_pre_20261013.js'), 'utf8')); } catch (_) {}
const GLA = {
    controllers: [{ id: 'crew', name: 'Crew', kind: 'human', authority: 1 }, { id: 'fcs', name: 'FCS', kind: 'automation', authority: 2, processModel: ['load'] }],
    processes: [{ id: 'surf', name: 'GLA surfaces' }, { id: 'loads', name: 'Airframe loads' }],
    actions: [{ id: 'a1', from: 'fcs', to: 'surf', name: 'deflect' }, { id: 'a2', from: 'crew', to: 'fcs', name: 'engage / inhibit' }],
    feedbacks: [{ id: 'f1', from: 'loads', to: 'fcs', name: 'accel / rate sensing' }], others: [], precedence: []
};
function randomCs(seed) {
    let x = seed; const rnd = n => { x = (x * 1103515245 + 12345) % 2147483648; return x % n; };
    const nc = 1 + rnd(4), np = 1 + rnd(4);
    const cs = { controllers: [], processes: [], actions: [], feedbacks: [], others: [], precedence: [] };
    for (let i = 0; i < nc; i++) cs.controllers.push({ id: 'c' + i, name: 'C' + i, kind: ['human', 'automation', 'organization'][rnd(3)], authority: rnd(3) ? 1 + rnd(3) : undefined, desc: rnd(2) ? 'd' : '' });
    for (let i = 0; i < np; i++) cs.processes.push({ id: 'p' + i, name: 'P' + i, desc: rnd(2) ? 'd' : '' });
    const nodes = cs.controllers.concat(cs.processes).map(n => n.id);
    for (let i = 0; i < 1 + rnd(6); i++) cs.actions.push({ id: 'a' + i, from: 'c' + rnd(nc), to: nodes[rnd(nodes.length)], name: 'act' + i });
    for (let i = 0; i < rnd(6); i++) cs.feedbacks.push({ id: 'f' + i, from: nodes[rnd(nodes.length)], to: 'c' + rnd(nc), name: 'fb' + i });
    for (let i = 0; i < rnd(3); i++) cs.others.push({ id: 'o' + i, from: nodes[rnd(nodes.length)], to: nodes[rnd(nodes.length)], name: 'o' + i });
    return cs;
}
if (!OLD) check('the pre-change engine (commit ef0f140) is readable from tests/fixtures', false, 'fixture missing');
else {
    const run = (Eng, cs) => {
        const out = {};
        const t = (k, f) => { try { out[k] = f(); } catch (e) { out[k] = 'THROWS ' + e.message; } };
        const disp = { 'a1:np': { status: 'assessed', context: 'gust', hazardIds: [] }, 'a0:ph': { status: 'dismissed', rationale: 'no' } };
        t('validate', () => Eng.validate(cs)); t('inv18', () => Eng.inv18(cs)); t('seeds', () => Eng.ucaSeeds(cs, disp));
        t('loops', () => Eng.loopSummary(cs)); t('conflicts', () => Eng.conflictSites(cs)); t('complete', () => Eng.csCompleteness(cs));
        t('causes', () => Eng.causeSeeds(cs, disp, {})); t('arch', () => Eng.archetypeMatrix(cs, disp, {}));
        t('conf', () => Eng.conformance({ cs: Object.assign({ others: [] }, cs), dispositions: disp, spine: { losses: [], hazards: [], constraints: [] } }, {}));
        return JSON.stringify(out);
    };
    let same = 0, diff = null;
    const cases = [GLA].concat(Array.from({ length: 300 }, (_, i) => randomCs(i + 7)));
    cases.forEach((cs, i) => { if (run(OLD, clone(cs)) === run(E, clone(cs))) same++; else if (!diff) diff = i; });
    check('301 structures without actuators or sensors (GLA + 300 random): identical validate, INV-32, UCA seeds, loops, conflict sites, completeness, causes, archetypes and conformance', same === cases.length, 'first difference at case ' + diff);
}

// ---------------------------------------------------------------------------------------------
console.log('\n[2] actuators and sensors close the loop (hand-derived answers)');
// The Handbook's generic loop: controller -> actuator -> process -> sensor -> controller.
const LOOP = {
    controllers: [{ id: 'fcc', name: 'Flight control computer', kind: 'automation' }],
    processes: [{ id: 'elev', name: 'Elevator' }],
    actuators: [{ id: 'srv', name: 'Elevator servo' }], sensors: [{ id: 'rvdt', name: 'Position sensor' }], externals: [{ id: 'atm', name: 'Atmosphere' }],
    actions: [{ id: 'cmd', from: 'fcc', to: 'srv', name: 'position command' }],
    feedbacks: [{ id: 'pos', from: 'rvdt', to: 'fcc', name: 'measured position' }],
    actuations: [{ id: 'u1', from: 'srv', to: 'elev' }], measurements: [{ id: 'm1', from: 'elev', to: 'rvdt' }],
    others: [{ id: 'g', from: 'atm', to: 'elev', name: 'gust', type: 'disturbance' }], precedence: []
};
check('the Handbook loop validates (actuator, sensor, external element and their links are known nodes and edges)', E.validate(LOOP).length === 0, E.validate(LOOP).join('; '));
check('targetsOf: the command lands on the elevator, through the servo', JSON.stringify(E.targetsOf(LOOP, LOOP.actions[0])) === '["elev"]');
check('sourcesOf: the feedback reports on the elevator, through the position sensor', JSON.stringify(E.sourcesOf(LOOP, LOOP.feedbacks[0])) === '["elev"]');
check('INV-32: the loop through actuator and sensor is closed (no finding)', E.inv18(LOOP).findings.length === 0);
check('loopSummary names the closing feedback', E.loopSummary(LOOP)[0].closed && E.loopSummary(LOOP)[0].feedbackIds[0] === 'pos');
const open1 = clone(LOOP); open1.measurements = [];
check('remove the measurement: the sensor measures nothing, the loop is open (1 finding)', E.inv18(open1).findings.length === 1 && E.inv18(open1).findings[0].actionId === 'cmd');
const open2 = clone(LOOP); open2.actuations = [];
check('remove the actuation: the servo acts on nothing, the finding says so', E.inv18(open2).findings.length === 1 && /acts on nothing/.test(E.inv18(open2).findings[0].detail));
const seeds = E.ucaSeeds(LOOP, {});
check('UCA seeds: 4 per control action, the process is the elevator and the text shows the path', seeds.length === 4 && seeds.every(s => s.process === 'elev') && /fcc → srv → elev/.test(seeds[0].text), seeds[0] && seeds[0].text);
const two = clone(LOOP); two.controllers.push({ id: 'pilot', name: 'Pilot', kind: 'human' }); two.actuators.push({ id: 'cable', name: 'Cable run' });
two.actions.push({ id: 'stick', from: 'pilot', to: 'cable', name: 'stick input' }); two.actuations.push({ id: 'u2', from: 'cable', to: 'elev' });
const cf = E.conflictSites(two);
check('conflictSites: two controllers reaching the elevator through two actuators is a conflict site on the elevator', cf.sites.length === 1 && cf.sites[0].targetId === 'elev' && cf.sites[0].controllers.sort().join() === 'fcc,pilot', JSON.stringify(cf.sites));
const bad = clone(LOOP); bad.actuations.push({ id: 'u9', from: 'elev', to: 'fcc' }); bad.measurements.push({ id: 'm9', from: 'fcc', to: 'elev' });
const be = E.validate(bad);
check('validate refuses an actuation that does not start at an actuator and a measurement that does not end at a sensor', be.some(x => /actuation u9: starts at "elev", which is not an actuator/.test(x)) && be.some(x => /measurement m9: ends at "elev", which is not a sensor/.test(x)), be.join('; '));
check('csCompleteness asks for descriptions of every element, actuators and sensors included', E.csCompleteness(LOOP).findings.filter(f => f.kind === 'no-description').map(f => f.id).sort().join() === 'atm,elev,fcc,rvdt,srv');
{   // mutation M1: put back the old "same pair" loop test; the Handbook loop must go red
    const src = S('stpa_core.js').replace('const heard = (cs.feedbacks || []).some(f => _closes(cs, a, f));', 'const heard = (cs.feedbacks || []).some(f => f.from === a.to && f.to === a.from);');
    const M = loadEngine(src);
    check('mutation M1 (the old pair test): the closed Handbook loop is wrongly reported open, so the check above would go red', M.inv18(LOOP).findings.length === 1);
}

// ---------------------------------------------------------------------------------------------
console.log('\n[3] the store <-> diagram mapping (stpa_panel.js, pure)');
function loadPanel(stpaData, src) {
    const ctx = { console, Math, JSON, Object, Array, String, Number, Set, Map, Promise, setTimeout: () => 0, isNaN, isFinite, parseInt };
    ctx.window = ctx; ctx.STPA = E; ctx.stpaData = stpaData;
    vm.createContext(ctx);
    vm.runInContext(src || S('stpa_panel.js'), ctx, { filename: 'stpa_panel.js' });
    return ctx;
}
const seedData = () => ({ cs: clone(GLA), dispositions: { 'a1:np': { status: 'assessed', context: 'gust above VMO', hazardIds: [] } }, causeDismissals: {}, scopeFcIds: [], meta: { mission: '', scope: '', boundary: '', abstractionLevel: '' },
    losses: [], hazards: [], constraints: [], responsibilities: [{ id: 'R-1', text: 'Keep loads in the envelope', elementId: 'fcs', constraintIds: [] }], csState: 'initial', sip: {} });
const d0 = seedData();
d0.cs.controllers[1].aiGenerated = true; d0.cs.controllers[1].aiFeature = 'stpa.draft'; d0.cs.actions[0].aiModel = 'm';
const P0 = loadPanel(d0), CS = P0.STPA_PANEL._cs;
const before = JSON.stringify(d0);
const m0 = CS.csModel(d0);
check('reading the diagram model writes nothing (an old project opens unchanged)', JSON.stringify(d0) === before);
check('every controller and process is a shape with a stable prefixed id; every action and feedback a connector', m0.elements.map(e => e.id).join() === 'ctl:crew,ctl:fcs,proc:surf,proc:loads' && m0.connectors.map(c => c.id).join() === 'ca:a1,ca:a2,fb:f1');
const y = id => m0.elements.find(e => e.id === id).y;
check('the default layout follows authority: rank 1 above rank 2 above the processes', y('ctl:crew') < y('ctl:fcs') && y('ctl:fcs') < y('proc:surf') && y('proc:surf') === y('proc:loads'));
check('the controller shape carries its process model and kind for the drawing', m0.elements[1].props.processModel === 'load' && m0.elements[1].props.ctlKind === 'automation' && m0.elements[1].props.authority === 2);
const d1 = clone(d0); CS.csApply(d1, clone(m0));
const strip = d => { const x = clone(d); delete x.diagram; return x; };
check('round trip: applying the unchanged model leaves every row exactly as it was (provenance kept), and only adds the positions', JSON.stringify(strip(d1)) === JSON.stringify(d0) && Object.keys(d1.diagram.layout).length === 4, JSON.stringify(strip(d1)).slice(0, 300));
check('round trip is stable: model -> store -> model gives the same model', JSON.stringify(CS.csModel(d1)) === JSON.stringify(m0));
// edit like a person would: rename, an algorithm, a new actuator with its link, a sensor and its feedback
const m1 = clone(m0);
m1.elements[1].label = 'FCS (GLA)'; m1.elements[1].props.controlAlgorithm = 'Deflect against sensed load'; m1.elements[1].props.processModel = 'load\nsurface position';
m1.elements.push({ id: 'act:A1', kind: 'actuator', x: 0, y: 500, w: 170, h: 54, label: 'Surface servo', props: { desc: 'EHSA' }, sysmlRef: 'item:7' });
m1.elements.push({ id: 'sen:S1', kind: 'sensor', x: 300, y: 500, w: 170, h: 54, label: 'Accelerometer', props: { desc: '' } });
m1.connectors.push({ id: 'ca:CA1', kind: 'action', from: 'ctl:fcs', to: 'act:A1', label: 'servo command', props: {} });
m1.connectors.push({ id: 'actu:AC1', kind: 'actuation', from: 'act:A1', to: 'proc:surf', label: '', props: {} });
m1.connectors.push({ id: 'meas:M1', kind: 'measurement', from: 'proc:loads', to: 'sen:S1', label: '', props: {} });
m1.connectors.push({ id: 'dist:D1', kind: 'disturbance', from: 'proc:loads', to: 'proc:surf', label: 'flutter', props: {} });
const d2 = clone(d1); CS.csApply(d2, m1);
const fcs = d2.cs.controllers.find(c => c.id === 'fcs');
check('rename and algorithm and process model land on the controller row, its AI provenance is kept', fcs.name === 'FCS (GLA)' && fcs.controlAlgorithm === 'Deflect against sensed load' && fcs.processModel.join('|') === 'load|surface position' && fcs.aiGenerated === true && fcs.aiFeature === 'stpa.draft');
check('a drawn actuator becomes an actuators row with its id, description and model link', JSON.stringify(d2.cs.actuators) === JSON.stringify([{ id: 'A1', name: 'Surface servo', desc: 'EHSA', sysmlRef: 'item:7' }]), JSON.stringify(d2.cs.actuators));
check('a drawn sensor becomes a sensors row (empty description not stored)', JSON.stringify(d2.cs.sensors) === JSON.stringify([{ id: 'S1', name: 'Accelerometer' }]));
check('the new action lands in actions by its plain id; the actuation and measurement in their own lists', d2.cs.actions.map(a => a.id).join() === 'a1,a2,CA1' && d2.cs.actuations[0].from === 'A1' && d2.cs.actuations[0].to === 'surf' && d2.cs.measurements[0].to === 'S1' && !('name' in d2.cs.actuations[0]));
check('a disturbance is an "others" row typed disturbance', d2.cs.others.length === 1 && d2.cs.others[0].type === 'disturbance' && d2.cs.others[0].name === 'flutter');
check('the action row keeps its AI model stamp after the edit', d2.cs.actions[0].aiModel === 'm');
check('the engine reads the drawn structure: the new servo command reaches the surfaces', JSON.stringify(E.targetsOf(d2.cs, d2.cs.actions[2])) === '["surf"]' && E.validate(d2.cs).length === 0);
check('lists the person never used are not created (no empty externals list)', !('externals' in d2.cs));
check('model -> store -> model again is stable after the edit', JSON.stringify(CS.csModel(d2).connectors.map(c => c.id)) === JSON.stringify(['ca:a1', 'ca:a2', 'ca:CA1', 'fb:f1', 'dist:D1', 'actu:AC1', 'meas:M1']));
// guards
const del = id => ({ ops: [{ t: id.indexOf('ca:') === 0 ? 'cn' : 'el', id: id, before: (m0.elements.concat(m0.connectors)).find(x => x.id === id), after: null }] });
check('guard: deleting control action a1 (a UCA decision on record) is refused with a plain reason', /unsafe control action decision/.test(CS.csGuard(d0, del('ca:a1')) || ''));
check('guard: deleting a2 (no decisions) is allowed', CS.csGuard(d0, del('ca:a2')) === null);
check('guard: deleting the FCS (it holds responsibility R-1) is refused', /holds responsibilities/.test(CS.csGuard(d0, del('ctl:fcs')) || ''));
const retype = { ops: [{ t: 'cn', id: 'ca:a1', before: m0.connectors[0], after: Object.assign({}, m0.connectors[0], { kind: 'other' }) }] };
check('guard: turning action a1 into another kind of link is refused too (its decisions would be orphaned)', /decision/.test(CS.csGuard(d0, retype) || ''));
check('new ids follow the house scheme and never reuse an id that still has UCA decisions',
    CS.newId('element', 'controller', { model: m0 }) === 'ctl:C1' && CS.newId('connector', 'action', { model: { elements: [], connectors: [{ id: 'ca:CA1', props: {} }] } }) === 'ca:CA2');
{
    const d3 = seedData(); d3.dispositions['CA1:np'] = { status: 'dismissed', rationale: 'x' };
    const P3 = loadPanel(d3);
    check('... an orphan decision key CA1 blocks the id CA1', P3.STPA_PANEL._cs.newId('connector', 'action', { model: { elements: [], connectors: [] } }) === 'ca:CA2');
}
{   // mutation M2: a csApply that rebuilds rows from scratch loses the AI provenance
    const src = S('stpa_panel.js').replace("const row = i >= 0 ? Object.assign({}, pool.splice(i, 1)[0]) : { id: sid };\n                row.id = (i >= 0) ? row.id : sid;", "pool.splice(i, 1); const row = { id: sid };");
    const Pm = loadPanel(clone(d0), src), dm = clone(d0);
    Pm.STPA_PANEL._cs.csApply(dm, Pm.STPA_PANEL._cs.csModel(dm));
    check('mutation M2 (rows rebuilt from scratch): the provenance check goes red', src !== S('stpa_panel.js') && dm.cs.controllers[1].aiGenerated !== true);
}
{   // mutation M3: a guard that allows everything
    const src = S('stpa_panel.js').replace("if (n) return 'Control action", "if (false) return 'Control action");
    const Pm = loadPanel(clone(d0), src);
    check('mutation M3 (no guard): deleting a1 would be allowed, so the guard check goes red', src !== S('stpa_panel.js') && Pm.STPA_PANEL._cs.csGuard(d0, del('ca:a1')) === null);
}
{   // duplicate ids (invalid, refused by the engine) stay visible and round-trip without a rename
    const dd = seedData(); dd.cs.processes.push({ id: 'surf', name: 'Second surf' });
    const Pd = loadPanel(dd), md = Pd.STPA_PANEL._cs.csModel(dd);
    const dd2 = clone(dd); Pd.STPA_PANEL._cs.csApply(dd2, md);
    check('a duplicate id (engine refuses it) is drawn twice and written back without being renamed', md.elements.filter(e => e.kind === 'process').length === 3 && dd2.cs.processes.map(p => p.id).join() === 'surf,loads,surf');
}

// ---------------------------------------------------------------------------------------------
console.log('\n[4] the tables are the same store');
const panelSrc = S('stpa_panel.js');
check('"Other inputs / outputs" + add reads its own row (stpa-eo-*), not the feedback row', /other: 'eo'/.test(panelSrc) && !/const p = kind === 'action' \? 'ea' : 'ef';/.test(panelSrc));
check('tables exist for actuators, sensors, external elements, actuates and measured by', /'actuator', 'sensor', 'external'\]\.map/.test(panelSrc) && /Actuates \(actuator/.test(panelSrc) && /Measured by \(element/.test(panelSrc));
check('the static 680 by 300 picture is only the fallback when the editor core is missing', /if \(!window\.SLDiagramEditor\) \{ slot\.innerHTML = diagram\(\); return; \}/.test(panelSrc) && /'<div id="stpa-cs-slot"><\/div>'/.test(panelSrc));
check('every diagram write goes through the single author adapter', /applyDiagram: function \(model\)/.test(panelSrc) && /save: function \(model, change\) \{ _author\.applyDiagram\(model, change\); \}/.test(panelSrc));
const idx = S('index.html');
check('index.html loads the bumped versions (stpa_core 1.3, stpa_panel 1.45, stpa_report 1.3, diagram_editor 1.2, sysml_model 1.2)', /stpa_core\.js\?v=1\.3"/.test(idx) && /stpa_panel\.js\?v=1\.4[567]"/.test(idx) && /stpa_report\.js\?v=1\.3"/.test(idx) && /diagram_editor\.js\?v=1\.[2345]"/.test(idx) && /sysml_model\.js\?v=1\.[234]"/.test(idx));   // 13 Oct 2026: 1.3 after the merge with fix3-M (RBD / Markov); stpa_panel 1.47 and diagram_editor 1.5: 15 Oct 2026, height: 'fill'
{   // the report lists the new elements
    const rp = S('stpa_report.js');
    check('the STPA report table lists actuators, sensors, external elements, actuates and measured by', /\['actuators', 'Actuator'\]/.test(rp) && /\['measurements', 'Measured by'\]/.test(rp));
}

// ---------------------------------------------------------------------------------------------
console.log('\n[5] SysML v2: the new symbols export and come back');
{
    const ctx = { console, TextEncoder, TextDecoder, Uint8Array }; vm.createContext(ctx);
    vm.runInContext(S('sysml_model.js'), ctx, { filename: 'sysml_model.js' });
    const C = ctx.SLSysML.core;
    const P = { projectName: 'STPA loop', acFunctionsData: [], acFcimData: [], acFhaData: [], acReqData: [], acAssumptionsData: [], systemsData: [{ id: 'sys-fcs', name: 'Flight controls', functions: [] }], praData: [], zsaData: [], cmaData: [], routingData: [], resourcesData: [], fmeaData: [], itemsData: [],
        stpaData: Object.assign(seedData(), { cs: Object.assign(clone(LOOP), { controllers: [{ id: 'fcc', name: 'Flight control computer', kind: 'automation', controlAlgorithm: 'PID on position error', sysmlRef: 'sys:sys-fcs' }] }), dispositions: {}, responsibilities: [] }),
        ftaPages: [], activeFTAPageId: null, internalIdCounter: 1, projectConfig: { interfaces: [], markovModels: [], sysml: { ns: '11111111-2222-4333-8444-555555555555' } } };
    const out = C.exportText(P, { at: '2026-10-13' }), t = out.text;
    check('the export declares the actuator, sensor and external element with the library types', /part srv\b[^;{]*: SafetyLab::Actuator/.test(t.replace(/'/g, '')) || (/SafetyLab::Actuator/.test(t) && /SafetyLab::Sensor/.test(t) && /SafetyLab::ExternalElement/.test(t)), t.slice(0, 200));
    check('actuates and measured by are connections of the library types, the disturbance an OtherLink typed disturbance', /SafetyLab::Actuation/.test(t) && /SafetyLab::Measurement/.test(t) && /linkType = "disturbance"/.test(t));
    check('the control algorithm and the model link (About) are in the file', /controlAlgorithm = "PID on position error"/.test(t) && /About/.test(t));
    check('the library defines Actuator, Sensor, ExternalElement, Actuation, Measurement, Controller.controlAlgorithm and OtherLink.linkType',
        ['part def Actuator', 'part def Sensor', 'part def ExternalElement', 'connection def Actuation', 'connection def Measurement', 'attribute controlAlgorithm', 'attribute linkType'].every(x => C.LIBRARY_TEXT.indexOf(x) >= 0) && C.LIBRARY_TEXT === S('sysml_safety_lib.sysml'));
    const E2 = { projectName: 'x', acFunctionsData: [], acFcimData: [], acFhaData: [], acReqData: [], acAssumptionsData: [], systemsData: [], praData: [], zsaData: [], cmaData: [], routingData: [], resourcesData: [], fmeaData: [], itemsData: [], stpaData: null, ftaPages: [], activeFTAPageId: null, internalIdCounter: 1, projectConfig: { interfaces: [], markovModels: [] } };
    const plan = C.planImport(E2, [{ name: 'loop.sysml', text: t }]);
    C.applyImport(E2, plan, { newId: () => 'n' + Math.random() });
    const cs2 = E2.stpaData && E2.stpaData.cs;
    check('import into an empty project brings back the actuator, sensor, external element and both links', cs2 && cs2.actuators.length === 1 && cs2.sensors.length === 1 && cs2.externals.length === 1 && cs2.actuations[0].from === 'srv' && cs2.actuations[0].to === 'elev' && cs2.measurements[0].to === 'rvdt', JSON.stringify(cs2 && { a: cs2.actuators, s: cs2.sensors, u: cs2.actuations, m: cs2.measurements }));
    check('... and the disturbance type and the control algorithm', cs2 && cs2.others[0].type === 'disturbance' && cs2.controllers[0].controlAlgorithm === 'PID on position error');
    check('... and the engine reads the imported loop as closed', cs2 && E.inv18(cs2).findings.length === 0);
    const plan2 = C.planImport(E2, [{ name: 'loop.sysml', text: t }]);
    check('a second import of the same file adds and changes nothing (an unnamed link is not renamed to its id)', plan2.adds.length === 0 && plan2.changes.length === 0, JSON.stringify(plan2.changes.slice(0, 3)));
}

// ---------------------------------------------------------------------------------------------
// [6] real Chromium on the app
let chromium = null;
try { chromium = require('playwright').chromium; } catch (_) { try { chromium = require('/opt/npm-tools/node_modules/playwright').chromium; } catch (_) {} }
function serve() {
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.sysml': 'text/plain' };
    return http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
        const f = path.join(SITE, p);
        if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
    });
}
(async () => {
    console.log('\n[6] in the browser: drawing the control structure by hand on the K350 showcase');
    if (!chromium) { console.log('  SKIP  playwright is not installed; browser checks not run'); return finish(); }
    const server = serve(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    let browser;
    try { browser = await chromium.launch(); } catch (e) { console.log('  SKIP  no Chromium (' + String(e.message).split('\n')[0] + ')'); server.close(); return finish(); }
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto('http://127.0.0.1:' + server.address().port + '/');
        await page.waitForFunction(() => typeof window.loadSampleProject === 'function' && window.SLDiagramEditor && window.STPA_PANEL, null, { timeout: 30000 });
        await page.waitForTimeout(1500);
        const E2 = (fn, a) => page.evaluate(fn, a);
        // test harness only: the sign-in gate and welcome dialogs are not what is under test
        await E2(async () => {
            window.__ung = () => {
                document.querySelectorAll('#sl-auth-gate').forEach(g => g.remove()); document.documentElement.classList.remove('sl-auth-gate-blocked');
                document.querySelectorAll('.modal-overlay, .modal').forEach(o => { if (getComputedStyle(o).display !== 'none' && !o.closest('.sde') && !o.classList.contains('sl-sysml-modal')) o.style.display = 'none'; });
            };
            window.slConfirm = async () => true;
            // the showcase's fault trees raise common cause suspects (cma_live.js); its automation hook answers them for the harness
            window.__SL_CMA_AUTOMATION = { actor: 'Test harness', decide: function () { return { decision: 'ignore', reason: 'Not under test here (STPA control structure checks).' }; } };
            __ung(); await loadSampleProject(); await new Promise(r => setTimeout(r, 700)); __ung();
            try { PROGRAM_PLAN.setLane('stpa', true); } catch (_) {}
        });
        const stpaBefore = await E2(() => JSON.stringify(stpaData));
        await E2(async () => { switchTab('stpa'); await new Promise(r => setTimeout(r, 200)); STPA_PANEL.go(2); await new Promise(r => setTimeout(r, 300)); __ung(); document.getElementById('stpa-cs-slot').scrollIntoView(); });
        check('browser: Step 2 shows the diagram editor with the STPA toolbox (5 shapes, 6 connectors)', await E2(() => !!document.querySelector('#stpa-cs-slot .sde[data-diagram="stpa-cs"]') && document.querySelectorAll('#stpa-cs-slot .sde-tool[data-tool="el"]').length === 5 && document.querySelectorAll('#stpa-cs-slot .sde-tool[data-tool="cn"]').length === 6));
        check('browser: opening the old project (empty STPA) wrote nothing', await E2(() => JSON.stringify(stpaData)) === stpaBefore);
        const ed = () => E2(() => SLDiagramEditor.instances().find(e => e.type === 'stpa-cs').model());
        // every change asks for acknowledgement (change_ack.js); keep it, the way a person would
        let acks = 0;
        // 16 Oct 2026 (change_ack.js v2.0): a change is COLLECTED, not asked about at once. The helper reaches the
        // decision point itself (the one dialog, opened early as the top bar does) and answers Confirm all, or
        // Discard all for 'cancel' (what Acknowledge and Cancel change were)
        const ack = async (which) => {
            let clicked = false;
            for (let i = 0; i < 60; i++) {
                await page.waitForTimeout(100);
                const b = page.locator(which === 'cancel' ? '#sl-ack-overlay .sl-ack-discard' : '#sl-ack-overlay .sl-ack-keep');
                if (await b.count() && await b.first().isVisible()) { await page.waitForTimeout(200); await b.first().click({ force: true }); acks++; clicked = true; await page.waitForTimeout(200); continue; }
                const st = await E2(() => ({ n: window.SLChangeAck ? SLChangeAck.count() : 0, open: !!(window.SLChangeAck && SLChangeAck.status().open) }));
                if (st.n > 0 && !st.open) { await E2(() => { SLChangeAck.ask({ reason: 'early' }); }); continue; }
                const busy = await E2(() => !!(window.SLChangeAck && SLChangeAck.pendingUser()));
                if (!busy && (clicked || i > 8)) break;
            }
            return clicked;
        };
        const canvas = await page.locator('#stpa-cs-slot .sde-canvas').boundingBox();
        const dragTool = async (kind, x, y) => {
            const b = await page.locator('#stpa-cs-slot .sde-tool[data-kind="' + kind + '"]').boundingBox();
            await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
            await page.mouse.move(b.x + 60, b.y + 10, { steps: 4 }); await page.mouse.move(x, y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(120);
        };
        await dragTool('controller', canvas.x + 300, canvas.y + 120); await ack();
        await dragTool('process', canvas.x + 300, canvas.y + 400); await ack();
        let m = await ed();
        check('browser: a controller and a controlled process dragged from the toolbox exist on the canvas', m.elements.map(e => e.kind).join() === 'controller,process', JSON.stringify(m.elements.map(e => e.id)));
        check('browser: ... and they are rows of stpaData.cs at once (tables in sync)', await E2(() => stpaData.cs.controllers.length === 1 && stpaData.cs.processes.length === 1 && stpaData.cs.controllers[0].id === 'C1' && stpaData.cs.processes[0].id === 'P1'));
        await page.waitForTimeout(150);
        check('browser: the controller table row shows C1 after the drop', await E2(() => /C1/.test(document.getElementById('view-stpa').innerText) && !!document.querySelector('#stpa-cs-slot .sde')));
        // connect by dragging the controller's bottom port onto the process; the chooser asks which kind
        const scr = async id => E2(id => { const e = SLDiagramEditor.instances().find(x => x.type === 'stpa-cs'); const el = e.model().elements.find(x => x.id === id); const v = e.getView(); const r = e.$.canvas.getBoundingClientRect(); return { x: r.left + v.x + (el.x + el.w / 2) * v.k, y: r.top + v.y + (el.y + el.h / 2) * v.k, bottom: r.top + v.y + (el.y + el.h) * v.k, top: r.top + v.y + el.y * v.k }; }, id);
        const c1 = await scr('ctl:C1'), p1 = await scr('proc:P1');
        await page.mouse.click(c1.x, c1.y); await page.waitForTimeout(100);
        const port = await page.locator('#stpa-cs-slot .sde-port[data-el="ctl:C1"][data-port="s"]').boundingBox();
        await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2); await page.mouse.down();
        await page.mouse.move(p1.x, p1.y - 10, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(150);
        const menu = await E2(() => Array.from(document.querySelectorAll('#stpa-cs-slot .sde-menu button')).map(b => b.textContent));
        check('browser: dragging a dot from the controller onto the process offers the legal kinds (control action, other input or output)', menu.indexOf('Control action') >= 0 && menu.indexOf('Other input or output') >= 0 && menu.indexOf('Feedback') < 0, menu.join('|'));
        await page.locator('#stpa-cs-slot .sde-menu button', { hasText: 'Control action' }).click(); await page.waitForTimeout(150); await ack();
        check('browser: every hand edit so far was acknowledged once (change acknowledgement)', acks === 3, acks);
        check('browser: the control action is an actions row (CA1, C1 to P1)', await E2(() => JSON.stringify(stpaData.cs.actions.map(a => [a.id, a.from, a.to, a.name])) === JSON.stringify([['CA1', 'C1', 'P1', 'command']])));
        await page.waitForTimeout(150);
        check('browser: INV-32 draws the missing feedback as a dashed red arrow', await E2(() => document.querySelectorAll('#stpa-cs-slot .stpa-cs-miss').length === 1));
        // the feedback, through the Feedback tool (click start, click end)
        await page.locator('#stpa-cs-slot .sde-tool[data-kind="feedback"]').click();
        const p1b = await scr('proc:P1'), c1b = await scr('ctl:C1');
        await page.mouse.click(p1b.x + 40, p1b.y); await page.mouse.click(c1b.x + 60, c1b.y); await page.waitForTimeout(250); await ack();
        check('browser: a feedback drawn with the toolbox tool closes the loop; the red arrow is gone', await E2(() => stpaData.cs.feedbacks.length === 1 && stpaData.cs.feedbacks[0].from === 'P1' && document.querySelectorAll('#stpa-cs-slot .stpa-cs-miss').length === 0));
        // the control algorithm in the properties panel
        const c1c = await scr('ctl:C1');
        await page.locator('#stpa-cs-slot .sde-canvas').focus(); await page.keyboard.press('Escape');   // the connector tool stays armed until Esc
        check('browser: Esc puts the connector tool down', await E2(() => !SLDiagramEditor.instances().find(x => x.type === 'stpa-cs').armed));
        await page.mouse.click(c1c.x, c1c.top + 8); await page.waitForTimeout(150);
        const ta = page.locator('#stpa-cs-slot .sde-props textarea[data-key="props.controlAlgorithm"]');
        check('browser: the properties panel of a controller has Control algorithm and Process model fields', await ta.count() === 1 && await page.locator('#stpa-cs-slot .sde-props textarea[data-key="props.processModel"]').count() === 1);
        await ta.fill('Command the surface when the load exceeds the limit'); await ta.blur(); await page.waitForTimeout(250); await ack();
        check('browser: the control algorithm is stored on the controller row and drawn inside the box', await E2(() => stpaData.cs.controllers[0].controlAlgorithm === 'Command the surface when the load exceeds the limit' && /Command the surface/.test(document.querySelector('#stpa-cs-slot .sde-el[data-id="ctl:C1"]').textContent)));
        // undo / redo with the keyboard
        await page.locator('#stpa-cs-slot .sde-canvas').focus();
        await page.keyboard.press('Control+z'); await page.waitForTimeout(250); await ack();
        check('browser: Ctrl+Z takes the algorithm back out of the store', await E2(() => !stpaData.cs.controllers[0].controlAlgorithm));
        await page.locator('#stpa-cs-slot .sde-canvas').focus();
        await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(250); await ack();
        // Cancel in the acknowledgement puts the project back, and the diagram with it
        await dragTool('external', canvas.x + 650, canvas.y + 150); await ack('cancel'); await page.waitForTimeout(300);
        check('browser: Cancel change on a drawn element takes it out of the store and off the diagram', await E2(() => !(stpaData.cs.externals || []).length && !SLDiagramEditor.instances().find(x => x.type === 'stpa-cs').model().elements.some(e => e.kind === 'external')));
        check('browser: Ctrl+Shift+Z puts it back', await E2(() => stpaData.cs.controllers[0].controlAlgorithm === 'Command the surface when the load exceeds the limit'));
        // a UCA decision makes the action undeletable from the diagram (same rule as the table)
        await E2(() => { stpaData.dispositions['CA1:np'] = { status: 'dismissed', rationale: 'test' }; });
        const n0 = await E2(() => stpaData.cs.actions.length);
        await E2(() => { const e = SLDiagramEditor.instances().find(x => x.type === 'stpa-cs'); e.select(['ca:CA1']); return e.deleteSelection(); });
        await page.waitForTimeout(200);
        check('browser: deleting a control action with a UCA decision on record is refused; the action stays', await E2(() => stpaData.cs.actions.length) === n0);
        await E2(() => { delete stpaData.dispositions['CA1:np']; }); await ack();   // a direct data set-up is still a change the funnel may ask about
        // model link through the SLSysML picker
        await E2(() => { const e = SLDiagramEditor.instances().find(x => x.type === 'stpa-cs'); e.select(['proc:P1']); });
        await page.locator('#stpa-cs-slot .sde-props [data-pact="link"]').click();
        await page.waitForSelector('.sl-sysml-modal .sl-sysml-opt', { timeout: 5000 });
        const firstRef = await E2(() => document.querySelector('.sl-sysml-modal .sl-sysml-opt').getAttribute('data-ref'));
        await page.waitForTimeout(300); await page.locator('.sl-sysml-modal .sl-sysml-opt').first().click({ force: true }); await page.waitForTimeout(400); await ack();
        check('browser: "Link to model element" opens the model picker and stores the string ref on the process row', await E2(r => stpaData.cs.processes[0].sysmlRef === r, firstRef) && /^(sys|item|res|iface|zone|afn|fn|sfn):/.test(firstRef), firstRef);
        check('browser: the tables show the same link', await E2(r => { const lbl = SLSysML.refLabel(r); return document.getElementById('view-stpa').innerText.indexOf(lbl) >= 0; }, firstRef));
        // actuator and sensor by API through the same change path, then the engine sees the loop
        await E2(async () => {
            const e = SLDiagramEditor.instances().find(x => x.type === 'stpa-cs');
            const a = await e.place('actuator', 100, 300); const s = await e.place('sensor', 500, 300);
            await e.connect('ctl:C1', a, 'action'); await e.connect(a, 'proc:P1', 'actuation'); await e.connect('proc:P1', s, 'measurement'); await e.connect(s, 'ctl:C1', 'feedback');
        });
        await page.waitForTimeout(250); await ack();
        check('browser: actuator, sensor, actuates and measured by are stored and the new loop is closed (no INV-32)', await E2(() => stpaData.cs.actuators.length === 1 && stpaData.cs.sensors.length === 1 && stpaData.cs.actuations.length === 1 && stpaData.cs.measurements.length === 1 && STPA.inv18(stpaData.cs).findings.length === 0));
        // full screen
        await ack();
        await page.locator('#stpa-cs-slot .sde-btn[data-act="fullscreen"]').click(); await page.waitForTimeout(150);
        const fs1 = await E2(() => { const r = document.querySelector('#stpa-cs-slot .sde').getBoundingClientRect(); return r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2; });
        await page.keyboard.press('Escape'); await page.waitForTimeout(150);
        await page.keyboard.press('Escape'); await page.waitForTimeout(150);   // the first Esc clears the selection, the next one leaves full screen
        check('browser: Full screen fills the window and Esc leaves it', fs1 && await E2(() => !document.querySelector('#stpa-cs-slot .sde').classList.contains('sde-fullscreen')));
        // an analysis saved before this build (no positions, no actuators) opens unchanged and is drawn by authority
        const legacy = await E2(async () => {
            stpaData.cs = { controllers: [{ id: 'crew', name: 'Crew', kind: 'human', authority: 1, desc: 'Flight crew' }, { id: 'fcs', name: 'FCS', kind: 'automation', authority: 2, processModel: ['sensed load'] }],
                processes: [{ id: 'surf', name: 'Surfaces' }], actions: [{ id: 'a1', from: 'fcs', to: 'surf', name: 'deflect' }, { id: 'a2', from: 'crew', to: 'fcs', name: 'engage' }],
                feedbacks: [{ id: 'f1', from: 'surf', to: 'fcs', name: 'position' }], others: [], precedence: [] };
            delete stpaData.diagram; stpaData.responsibilities = []; stpaData.dispositions = {};
            const before = JSON.stringify(stpaData);
            STPA_PANEL.render(); await new Promise(r => setTimeout(r, 300));
            const m = SLDiagramEditor.instances().find(x => x.type === 'stpa-cs').model();
            const y = id => m.elements.find(e => e.id === id).y;
            return { same: JSON.stringify(stpaData) === before, n: m.elements.length, order: y('ctl:crew') < y('ctl:fcs') && y('ctl:fcs') < y('proc:surf'), miss: document.querySelectorAll('#stpa-cs-slot .stpa-cs-miss').length };
        });
        await ack();
        check('browser: an analysis saved before this build opens unchanged (nothing written), drawn by authority, INV-32 still red for the unheard crew command', legacy.same && legacy.n === 3 && legacy.order && legacy.miss === 1, JSON.stringify(legacy));
        // AI draft (the apply shortcut) on an empty analysis: shown, then edited by hand
        await E2(async () => {
            stpaData.cs = { controllers: [], processes: [], actions: [], feedbacks: [], others: [], precedence: [] }; stpaData.losses = []; stpaData.hazards = []; stpaData.constraints = []; stpaData.diagram = undefined; stpaData.responsibilities = [];
            const r = STPA_AI_APPLY.apply(stpaData, { losses: [{ text: 'Loss of the aircraft' }], hazards: [{ text: 'Structural overload', lossRefs: [1] }], constraints: [],
                controllers: [{ name: 'Pilot' }, { name: 'Autopilot' }], processes: [{ name: 'Aircraft' }], actions: [{ name: 'pitch', from: 1, to: 1 }, { name: 'trim', from: 2, to: 1 }], feedbacks: [{ name: 'attitude', from: 1, to: 1 }] }, { model: 'test' });
            if (!r.ok) throw new Error(r.reason);
            STPA_PANEL.render(); await new Promise(r => setTimeout(r, 300));
        });
        m = await ed();
        check('browser: an AI-drafted structure appears on the diagram, laid out, nothing written for the layout', m.elements.length === 3 && m.connectors.length === 3 && await E2(() => !stpaData.diagram));
        await ack();
        await E2(() => { const e = SLDiagramEditor.instances().find(x => x.type === 'stpa-cs'); return e.rename('ctl:C2', 'Autopilot (AP)'); }); await page.waitForTimeout(150); await ack();
        check('browser: ... and it is editable by hand; the AI provenance on the row stays', await E2(() => { const c = stpaData.cs.controllers.find(x => x.id === 'C2'); return c.name === 'Autopilot (AP)' && c.aiGenerated === true && c.aiFeature === 'stpa.draft'; }));
        check('browser: INV-32 on the AI draft (the autopilot hears nothing back) draws in red', await E2(() => document.querySelectorAll('#stpa-cs-slot .stpa-cs-miss').length === 1));
        check('browser: the whole-diagram picture (toSvg, for reports) carries the INV-32 arrow too (core decorate hook)', await E2(() => /no feedback \(INV-32\)/.test(SLDiagramEditor.instances().find(x => x.type === 'stpa-cs').toSvg())));
        check('browser: the UCA CSV export still runs on the drawn structure', await E2(() => { let ok = false; const o = window.downloadCSV; window.downloadCSV = function (n, h, rows) { ok = Array.isArray(rows) && rows.length >= 8; }; try { exportData('STPA_UCAs', 'csv'); } catch (_) {} window.downloadCSV = o; return ok; }));
        check('browser: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
        await page.close();
    } catch (e) { check('browser run', false, String(e && e.message || e).replace(/\u001b\[[0-9;]*m/g, '').slice(0, 1500)); }
    await browser.close(); server.close();
    finish();
})();
function finish() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
