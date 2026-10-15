#!/usr/bin/env node
/* Regression (timebox 48, 14 Oct 2026): a refused or blank severity never reads as "no effect" on any surface, and the
 * non-monotone flag is printed in every PRA report and export. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const leaf = (id, s) => ({ id, type: 'basic', displayId: id, name: id, probability: 1e-5, identity: { kind: 'item', systemId: s } });
const box = (x0, x1, y0, y1, z0, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
function load(gate, withEngine) {
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, Float32Array, Promise, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {},
        systemsData: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], acFhaData: [{ internalId: 1, fcId: 'FC-001', fcDesc: 'x', severity: 'Catastrophic' }],
        ftaPages: [{ id: 'T1', name: 'Pitch tree', linkedFhaIds: [1], root: { id: 'G1', type: 'gate', gateType: gate, displayId: 'FC-001', name: 'x', children: [leaf('B0', 'A'), leaf('B1', 'B')] } }] };
    sb.window = sb; sb.globalThis = sb; sb.document = { getElementById: () => null, addEventListener: () => {} }; vm.createContext(sb);
    ['zonal_model.js'].concat(withEngine === false ? [] : ['fta_engine.js']).concat(['cad_zonal.js', 'pra_refs_data.js', 'pra_models.js', 'pra_panel.js']).forEach(f => vm.runInContext(read(f), sb));
    const C = sb.SLCadZonal, M = sb.SLPraModels, P = sb.SLPraPanel;
    const m = C.addCadModel({ fileName: 'a.step', sha256: 'a', revision: 'A', units: 'mm', parts: [{ pid: 'disc', name: 'HPT rotor disc', path: ['A'], bbox: box(-500, 500, -500, 500, -20, 20) }, { pid: 'pa', name: 'PA', path: ['A'], bbox: box(2990, 3010, -10, 10, -10, 10) }, { pid: 'pb', name: 'PB', path: ['A'], bbox: box(-10, 10, 2990, 3010, -10, 10) },
        { pid: 'tire', name: 'TIRE', path: ['A'], bbox: box(9400, 10600, -200, 200, -600, 600) }] }).model;
    C.confirmLink(m.id, 'pa', 'A', 'W'); C.confirmLink(m.id, 'pb', 'B', 'W');
    M.confirmRotor({ id: 'r1', label: 'r', cadId: m.id, pid: 'disc', center: [0, 0, 0], axis: [0, 0, 1], refDir: [1, 0, 0], rotation: 1, discRadius: 400, bladeLength: 100, bladedDiscMassKg: 30, rpm: 12000, fragmentAxialWidthMm: 0, confirms: { axialWidth: { by: 'W' } }, engine: 'E1', engineStages: 1 }, 'W', { at: 'x' });
    ['location', 'diameter', 'mass', 'rpm'].forEach(f => M.confirmRotorField('r1', f, 'W', true));
    return { sb, C, M, P, cadId: m.id };
}
// 1. the shared impact: engine missing gives notEvaluated (never a bare null worst) and the shared warning
{ const X = load('OR', false), im = X.C.impactOfEquipment(['A']); X.C.takeRefusals();
  check('impact without the fault tree engine: notEvaluated stated, the warning reads "Not evaluated: ..."', im.worst === null && /engine is not loaded/.test(im.notEvaluated) && /^<div data-not-evaluated[^>]*>Not evaluated: the fault tree engine is not loaded<\/div>$/.test(X.C.notEvaluatedHtml(im.notEvaluated)), JSON.stringify([im.worst, im.notEvaluated]));
  // 2. PRA: every call that met it is refused with "Not evaluated:"; the panel report, the export and the AI context all say so
  const rep = X.M.rotorReport('r1', 'oneThirdDisc'), sw = X.M.sweep('r1'), fv = X.M.functionRiskView(X.cadId);
  check('PRA rotor report, sweep and function view refused as "Not evaluated: ..." (no blank severity)', rep.refused && /^Not evaluated: /.test(rep.err) && sw.refused && fv.refused, JSON.stringify([rep.err, sw.err, fv.err]));
  X.P.state.flowReports = { oneThirdDisc: rep }; const html = X.P.exportReport('oneThirdDisc');
  check('PRA rotor export of a refused report shows the warning, no "none"', /data-not-evaluated/.test(html) && /Not evaluated: the fault tree engine is not loaded/.test(html) && !/Worst: none/.test(html), html.slice(-400));
  X.P.state.tReports = { 'extended|m1Large': rep }; X.sb.SLPraReport = { page: () => Promise.resolve({ html: 'x' }) };
  X.P.exportTireReport('extended|m1Large').then(e => check('PRA tire export of a refused report: a page that says Not evaluated', e && e.notEvaluated && /Not evaluated:/.test(e.html), JSON.stringify(e)));
  X.P.state.bReports = { nose: rep }; X.P.exportBirdReport('nose').then(e => check('PRA bird export of a refused report: a page that says Not evaluated', e && e.notEvaluated && /Not evaluated:/.test(e.html)));
  X.P.state.lReports = { '1A': rep }; const le = X.P.exportLightning('1A'); Promise.resolve(le).then(e => check('PRA lightning export of a refused report: a page that says Not evaluated', e && e.notEvaluated && /Not evaluated:/.test(e.html)));
  vm.runInContext(read('zonal_ai.js'), X.sb); const Z = X.sb.SLZonalAI;
  const PR = Z && (Z.praRiskResults || (Z._internal && Z._internal.praRiskResults)), ctx = PR ? PR({ praModels: X.M, cad: X.C }, { kind: 'rotorBurst', rotorId: 'r1', cadId: X.cadId }) : null, ctf = PR ? PR({ praModels: X.M, cad: X.C }, { kind: 'function', funcId: 'F1', cadId: X.cadId }) : null;
  check('AI context: refused rotor and function results are passed as "Not evaluated: ..." (no results used)', ctx && ctx.ok === false && /^Not evaluated: /.test(ctx.reason) && ctx.results.length === 0 && ctf && ctf.ok === false && /^Not evaluated: /.test(ctf.reason), JSON.stringify([ctx, ctf])); }
// 3. non-monotone flag: rotor hitting both XOR inputs; printed in the report and export
{ const X = load('XOR'), rep = X.M.rotorReport('r1', 'oneThirdDisc');
  X.P.state.flowReports = { oneThirdDisc: rep }; const html = X.P.exportReport('oneThirdDisc');
  check('non-monotone flag on the rotor report and printed in its export (tree named)', rep.ok && rep.nonMonotone && /non-monotone tree: worst case over subsets used/.test(html) && /data-pra-nonmono/.test(html) && /Pitch tree \(XOR FC-001\)/.test(html), JSON.stringify(rep.nonMonotone)); }
// 4. every report renderer and surface goes through the shared guards (source checks for the DOM-bound panels)
{ const PN = read('pra_panel.js'), CP = read('cad_page.js'), ZA = read('zonal_ai.js');
  check('panel: all four report renderers use notOk and print the non-monotone row; function view and tire run too', (PN.match(/if \(!R \|\| !R\.ok\) return notOk\(R\);/g) || []).length === 4 && (PN.match(/nmRow\(R, row\) \+ row\('Linked equipment'/g) || []).length === 4 && /if \(!r\.ok\) return notOk\(r\);/.test(PN) && /r && !r\.ok \? notOk\(r\)/.test(PN) && /return nmLine \+/.test(PN));
  check('panel: blank pass/fail, average and multiple fragments show "Not evaluated"', /if \(R\.meets == null\) return notEval\(/.test(PN) && /x\.meets == null \? notEval\(/.test(PN) && /airplaneAverage == null \? notEval\(/.test(PN) && /notEval\(R\.multiple\.err/.test(PN));
  check('zonal impact panel (CAD page): notEvaluated shown with the shared warning, non-monotone note printed', /if \(im\.notEvaluated\) \{/.test(CP) && /notEvaluatedHtml\(im\.notEvaluated\)/.test(CP) && /data-cad-nonmono/.test(CP));
  check('AI context: unassessed pass/fail reads "Not evaluated", fault tree logic flag passed', /meetsCriterion = m\.meets == null \? 'Not evaluated: '/.test(ZA) && (ZA.match(/faultTreeLogic/g) || []).length >= 4); }
setTimeout(() => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }, 50);
