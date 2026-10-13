#!/usr/bin/env node
/*
 * Regression: CAD import and the 3D viewer's pure parts (13 Oct 2026, cad-A).
 *
 * THE REQUIREMENT (Waqas): a view-only 3D viewer for the aircraft, fed by neutral STEP from any
 * CAD tool. CAD files are export controlled: the file never leaves the customer's machine, the
 * geometry is cached locally (IndexedDB 'sl-cad' / 'meshes', key sha256) and never goes into
 * projectConfig (which syncs to the cloud). Only metadata goes into the project:
 *   projectConfig.cadModels = [{ id:'cad-<n>', fileName, sha256, revision, importedAt, units:'mm',
 *     parts:[{ pid, name, partNumber|null, path:[...], bbox:{min,max}, centroid }] }]
 *
 * This runs the REAL OpenCascade WASM (vendor/occt, occt-import-js 0.0.23) on a committed toy
 * aircraft (tests/fixtures/cad/toy_aircraft.step) through SLCadImport.convertStep, the same
 * function the worker calls, with no worker shell in between.
 *
 *   C1  vendored libraries: OpenCascade files byte-identical to the 0.0.23 release (LGPL: kept
 *       unmodified, separate, with their licenses); three.js r186 with its MIT license; no eval
 *   C2  the fixture's product structure: assemblies, part names, part numbers from the STEP
 *       PRODUCT entity, two placements of one part, bbox, centroid, AP214, mm
 *   C3  pids are the same on a second run, unique, and built from path + occurrence
 *   C4  units: the same file declared in meters comes out 1000 times larger, in mm
 *   C5  project metadata is exactly the contract and carries no geometry
 *   C6  the import split: meshes go to the cache, metadata to the project, never the reverse
 *   C7  display simplification brings a heavy part under its triangle budget
 *   C8  zone list rows {code,name,parentCode,xMin..zMax}, units, refusals; handed to SLCadZonal
 *   C9  STEP strings and products
 *   C10 viewer pure helpers: tree, standard views, PRA shapes, part to part distance
 *   C11 no network, no eval, wiring (load order, the CAD Model tab, the only writer of cadModels)
 *
 * Run: node tests/regression_cad_import_20261013.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const I = require(path.join(SITE, 'cad_import.js'));
const V = require(path.join(SITE, 'cad_viewer.js'));
const FIX = path.join(__dirname, 'fixtures', 'cad', 'toy_aircraft.step');

(async () => {
  // ---------------------------------------------------------------- C1
  console.log('[C1] vendored libraries');
  {
    const O = path.join(SITE, 'vendor', 'occt');
    const PIN = {
      'occt-import-js.js': '3fb44ce11d00611f9b3f3c5775d520ebab48930c1f08279b7b1316f05f0d3379',
      'occt-import-js.wasm': '33391fc9d94ea5c869a6718488bf0a9a464222bac9bdc764dfe1690cef281952',
      'license.occt-import-js.txt': '7ffe1954587c77dfba1cf8eb9b2ea743671fa6e63f9e7a2f258119d42e14eefe',
      'license.occt.txt': '090f8eb6ba63e72887c1f89b009fb1656cfda02d83b6e9805b20468520a5d77f'
    };
    Object.keys(PIN).forEach(f => {
      const p = path.join(O, f);
      check('occt ' + f + ' is the unmodified 0.0.23 release file', fs.existsSync(p) && sha(fs.readFileSync(p)) === PIN[f]);
    });
    check('the wasm fits the 25 MiB per-file asset limit', fs.statSync(path.join(O, 'occt-import-js.wasm')).size < 25 * 1024 * 1024);
    check('occt license names the LGPL', /LESSER GENERAL PUBLIC LICENSE/i.test(fs.readFileSync(path.join(O, 'license.occt-import-js.txt'), 'utf8')));
    const T = fs.readFileSync(path.join(SITE, 'vendor', 'three', 'three.min.js'), 'utf8');
    check('three.js is r186 (0.186.1) and says so in its header', /^\/\*! three\.js 0\.186\.1 \(r186\)/.test(T) && /REVISION="186"|REVISION = "186"|"186"/.test(T));
    check('three.js MIT license travels with it', /MIT License/.test(fs.readFileSync(path.join(SITE, 'vendor', 'three', 'LICENSE'), 'utf8')));
    check('three.js build uses no eval or Function constructor (the CSP forbids both)', !/\beval\(|new Function\(/.test(T));
    check('three.js build is a classic script exposing THREE (no ES module syntax)', /^\/\*![^]*?\*\/\s*var THREE=/.test(T) && !/^\s*(import|export)\s/m.test(T));
    const VL = fs.readFileSync(path.join(ROOT, 'vendor-libs.sh'), 'utf8');
    check('vendor-libs.sh reproduces both at the pinned versions', /three@0\.186\.1/.test(VL) && /occt-import-js@0\.0\.23/.test(VL) && /occt-import-js\.wasm/.test(VL));
  }

  // ---------------------------------------------------------------- C2 / C3
  const occt = await require(path.join(SITE, 'vendor', 'occt', 'occt-import-js.js'))();
  const bytes = fs.readFileSync(FIX);
  const m1 = I.convertStep(new Uint8Array(bytes), occt);
  const m2 = I.convertStep(new Uint8Array(bytes), occt);
  const byName = n => m1.parts.filter(p => p.name === n);
  console.log('\n[C2] the toy aircraft\'s product structure');
  {
    check('six part occurrences', m1.parts.length === 6, m1.parts.length);
    check('AP214, millimeters', m1.schema === 'AP214' && m1.units === 'mm' && m1.sourceUnit === 'mm', m1.schema + ' ' + m1.sourceUnit);
    const fus = byName('Fuselage')[0];
    check('Fuselage sits directly under Toy Aircraft', fus && JSON.stringify(fus.path) === '["Toy Aircraft"]');
    check('Fuselage part number from the PRODUCT entity', fus && fus.partNumber === 'SLA-FUS-010');
    check('Fuselage bbox 0..10000 along X, radius 1000', fus && near(fus.bbox.min[0], 0, 1) && near(fus.bbox.max[0], 10000, 1) && near(fus.bbox.max[1], 1000, 5) && near(fus.bbox.min[2], -1000, 5));
    check('Fuselage centroid on its axis at mid length', fus && near(fus.centroid[0], 5000, 5) && near(fus.centroid[1], 0, 5) && near(fus.centroid[2], 0, 5));
    const eng = byName('Engine Nacelle');
    check('two engines: one part, two placements, both under Propulsion', eng.length === 2 && eng.every(e => JSON.stringify(e.path) === '["Toy Aircraft","Propulsion"]'));
    check('engines carry the same part number', eng.every(e => e.partNumber === 'SLA-ENG-110'));
    check('engines are mirror placements (Y = -2500 and +2500)', eng.length === 2 && near(eng[0].centroid[1], -2500, 5) && near(eng[1].centroid[1], 2500, 5));
    const fcc = byName('Flight Control Computer');
    check('two redundant boxes under Avionics, 400 x 300 x 200', fcc.length === 2 && fcc.every(f => JSON.stringify(f.path) === '["Toy Aircraft","Avionics"]' && near(f.bbox.max[0] - f.bbox.min[0], 400, 0.01) && near(f.bbox.max[1] - f.bbox.min[1], 300, 0.01) && near(f.bbox.max[2] - f.bbox.min[2], 200, 0.01)));
    const har = byName('Harness W1')[0];
    check('harness present with its part number', har && har.partNumber === 'SLA-W1-300');
    check('designators read from the STEP instance names: ENGINE_L / ENGINE_R, FCC_A / FCC_B', eng[0].designator === 'ENGINE_L' && eng[1].designator === 'ENGINE_R' && fcc[0].designator === 'FCC_A' && fcc[1].designator === 'FCC_B');
    check('ENGINE_L is the copy on the left (Y = -2500): instance order matches the parts', near(eng[0].centroid[1], -2500, 5));
    check('an instance name that only repeats the product name is not a designator (FUSELAGE, HARNESS_W1)', !fus.designator && !har.designator && m1.stats.designators === 4);
    check('default copy names and counters are not designators', I.designatorFrom('Bracket.2', 'Bracket') === null && I.designatorFrom('NAUO12', 'X') === null && I.designatorFrom('7', 'X') === null && I.designatorFrom('', 'X') === null && I.designatorFrom('FCC-1', 'Flight Control Computer') === 'FCC-1');
    {
      // Never guessed when the STEP list and OpenCascade disagree on how many copies there are.
      const fake = { root: { name: 'A', meshes: [0, 1], children: [] }, meshes: [0, 1].map(() => ({ name: 'P', attributes: { position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0] } }, index: { array: [0, 1, 2] } })) };
      const ok = I.buildModel(fake, { instances: { 'A\u0002P': ['L-PUMP', 'R-PUMP'] } }), bad = I.buildModel(fake, { instances: { 'A\u0002P': ['L-PUMP'] } });
      check('instance names apply only when the counts agree', ok.parts.map(p => p.designator).join() === 'L-PUMP,R-PUMP' && bad.parts.every(p => !p.designator));
    }
    check('every part has a mesh with geometry', m1.meshes.length === 6 && m1.meshes.every(x => x.position instanceof Float32Array && x.index instanceof Uint32Array && x.index.length >= 3));
    check('meshes own exactly-sized buffers (safe to transfer out of the worker)', m1.meshes.every(x => x.position.byteOffset === 0 && x.position.buffer.byteLength === x.position.byteLength && x.index.buffer.byteLength === x.index.byteLength));
  }
  console.log('\n[C3] stable part ids');
  {
    check('the same pids, in the same order, on a second run', JSON.stringify(m1.parts.map(p => p.pid)) === JSON.stringify(m2.parts.map(p => p.pid)));
    check('the same bboxes on a second run', JSON.stringify(m1.parts.map(p => p.bbox)) === JSON.stringify(m2.parts.map(p => p.bbox)));
    check('pids are unique', new Set(m1.parts.map(p => p.pid)).size === m1.parts.length);
    check('pid = path + name + occurrence', m1.parts.some(p => p.pid === 'p:Toy Aircraft/Propulsion/Engine Nacelle#1') && m1.parts.some(p => p.pid === 'p:Toy Aircraft/Propulsion/Engine Nacelle#2'));
    check('a slash in a name cannot fake a path segment', I.makePid(['A/B'], 'C', 1) !== I.makePid(['A', 'B'], 'C', 1));
  }

  // ---------------------------------------------------------------- C4
  console.log('\n[C4] units are normalized to mm');
  {
    const txt = bytes.toString('latin1').replace(/SI_UNIT\(\.MILLI\.,\.METRE\.\)/g, 'SI_UNIT($,.METRE.)');
    const mM = I.convertStep(new Uint8Array(Buffer.from(txt, 'latin1')), occt);
    const fM = mM.parts.find(p => p.name === 'Fuselage'), f1 = m1.parts.find(p => p.name === 'Fuselage');
    check('the file now says meters', mM.sourceUnit === 'm', mM.sourceUnit);
    check('a 10000 m fuselage comes out as 10,000,000 mm', fM && near(fM.bbox.max[0], f1.bbox.max[0] * 1000, 1000));
    check('...and the project still records mm', I.projectEntry(mM, {}).units === 'mm');
  }

  // ---------------------------------------------------------------- C5
  console.log('\n[C5] project metadata is the contract and nothing else');
  const info = { id: 'cad-1', fileName: 'toy_aircraft.step', sha256: sha(bytes), revision: 1, importedAt: '2026-10-13T00:00:00.000Z' };
  const entry = I.projectEntry(m1, info);
  {
    check('entry keys are exactly the contract', JSON.stringify(Object.keys(entry)) === JSON.stringify(['id', 'fileName', 'sha256', 'revision', 'importedAt', 'units', 'parts']));
    const keysOk = p => { const k = Object.keys(p); return JSON.stringify(k.filter(x => x !== 'designator')) === JSON.stringify(['pid', 'name', 'partNumber', 'path', 'bbox', 'centroid']) && (k.indexOf('designator') < 0 || (k[k.length - 1] === 'designator' && typeof p.designator === 'string')); };
    check('part keys are exactly the contract (plus the optional designator)', entry.parts.every(keysOk));
    check('bbox is {min:[x,y,z],max:[x,y,z]}, centroid [x,y,z]', entry.parts.every(p => p.bbox.min.length === 3 && p.bbox.max.length === 3 && p.centroid.length === 3));
    check('no geometry in the entry', !I.containsGeometry(entry));
    const js = JSON.stringify(entry);
    check('small: under 400 bytes a part', js.length < 400 * entry.parts.length, js.length);
    check('no typed arrays survive JSON either', !/position|normal|index"|meshes/.test(js));
    // The detector must see geometry when it is there (rule 19: prove a probe can see a positive).
    check('detector sees a typed array', I.containsGeometry({ a: { b: new Float32Array(9) } }));
    check('detector sees a mesh-shaped key', I.containsGeometry({ parts: [{ meshes: [] }] }));
    check('detector sees a long numeric array', I.containsGeometry({ v: [1, 2, 3, 4, 5, 6] }));
    check('detector leaves a coordinate alone', !I.containsGeometry({ c: [1, 2, 3] }));
    const leaky = { parts: m1.parts.map(p => Object.assign({}, p, { position: new Float32Array(3) })) };
    check('extra fields on a part (geometry) are dropped by the whitelist', !I.containsGeometry(I.projectEntry(leaky, info)));
  }

  // ---------------------------------------------------------------- C6
  console.log('\n[C6] the import split: meshes to the local cache, metadata to the project through the engine');
  {
    const g = globalThis;
    const pc = g.projectConfig = { zones: [] }, store = {};
    // Founder ruling: a link is to one installed copy. Both computers share part number SLA-FCC-210;
    // only their designators (the STEP instance names FCC_A / FCC_B) link by themselves.
    g.systemsData = [{ id: 'sys-fcc-a', name: 'Flight control computer A', partNumber: 'SLA-FCC-210', designator: 'FCC_A' }, { id: 'sys-fcc-b', name: 'Flight control computer B', partNumber: 'SLA-FCC-210', designator: 'FCC_B' }, { id: 'sys-w1', name: 'Harness W1', partNumber: 'SLA-W1-300' }];
    require(path.join(SITE, 'zonal_model.js'));
    const E = require(path.join(SITE, 'cad_zonal.js'));
    check('the engine is loaded for this block (SLCadZonal.addCadModel)', g.SLCadZonal === E && typeof E.addCadModel === 'function');
    const cache = { put: (k, v) => { store[k] = v; return Promise.resolve(); } };
    const r = await I.finalizeImport({ sha256: info.sha256, model: m1 }, { fileName: 'toy_aircraft.step', cache, by: 'Test Engineer' });
    check('cache got the meshes under the sha256', store[info.sha256] && store[info.sha256].meshes.length === 6 && store[info.sha256].meshes[0].position instanceof Float32Array);
    check('cache record says mm', store[info.sha256] && store[info.sha256].units === 'mm');
    check('project got cad-1, revision 1, written by the engine', pc.cadModels.length === 1 && pc.cadModels[0].id === 'cad-1' && pc.cadModels[0].revision === '1' && r.entry === pc.cadModels[0] && pc.cadSeq === 1);
    check('the stored model is exactly the contract', JSON.stringify(Object.keys(pc.cadModels[0])) === JSON.stringify(['id', 'fileName', 'sha256', 'revision', 'importedAt', 'units', 'parts']) && pc.cadModels[0].parts.every(p => { const k = Object.keys(p).filter(x => x !== 'designator'); return JSON.stringify(k) === JSON.stringify(['pid', 'name', 'partNumber', 'path', 'bbox', 'centroid']); }));
    check('projectConfig carries no geometry', !I.containsGeometry(pc) && !/"position"|"index"|"normal"|"meshes"/.test(JSON.stringify(pc)));
    check('a first import has no revision review', r.revision === null);
    // The two FCC boxes match the equipment exactly by part number; accept them.
    const mt = E.matchEquipment('cad-1');
    check('engine links the two FCC boxes by designator, each to its own computer', JSON.stringify(mt.exact.map(x => x.sysId + ':' + x.on).sort()) === JSON.stringify(['sys-fcc-a:designator', 'sys-fcc-b:designator']));
    check('the harness, matched only by part number, waits as a candidate', mt.candidates.some(c => /Harness/.test(c.pid) && JSON.stringify(c.sysIds) === '["sys-w1"]') && !mt.exact.some(x => x.sysId === 'sys-w1'));
    E.applyExactLinks('cad-1', 'Test Engineer');
    // Revision 2 drops the harness.
    const m3 = { parts: m2.parts.filter(p => p.name !== 'Harness W1'), meshes: m2.meshes.filter(x => !/Harness/.test(x.pid)) };
    const r2 = await I.finalizeImport({ sha256: 'sha-rev2', model: m3 }, { fileName: 'toy_aircraft.step', cache, by: 'Test Engineer' });
    check('re-import of the same file: cad-2, revision 2', pc.cadModels.length === 2 && pc.cadModels[1].id === 'cad-2' && pc.cadModels[1].revision === '2');
    check('the confirmed links carry to the new revision', r2.revision && r2.revision.carried.carried.length === 2 && Object.keys(E.confirmed('cad-2')).length === 2);
    check('the difference names the removed harness', r2.revision && r2.revision.diff.removed.length === 1 && /Harness/.test(r2.revision.diff.removed[0]));
    check('a review is recorded for the engineer', Array.isArray(pc.cadReviews) && pc.cadReviews.length === 1 && pc.cadReviews[0].fromCadId === 'cad-1' && pc.cadReviews[0].toCadId === 'cad-2' && pc.cadReviews[0].by === 'Test Engineer');
    await I.finalizeImport({ sha256: 'x', model: m2 }, { fileName: 'other.step', cache });
    check('another file starts at revision 1', pc.cadModels[2].revision === '1' && pc.cadModels[2].id === 'cad-3');
    check('getModel / latestModel read the project', I.getModel('cad-2', pc) === pc.cadModels[1] && I.latestModel(pc) === pc.cadModels[2]);
    const leaky = { parts: m1.parts.map(p => Object.assign({}, p, { position: new Float32Array(3) })) };
    check('geometry on a part never reaches the engine (whitelist)', (() => { const e = I.addToProject(leaky, { fileName: 'leak.step' }); return !I.containsGeometry(e) && !I.containsGeometry(pc); })());
    delete g.SLCadZonal;
    let threw = ''; try { I.addToProject(m1, { fileName: 'y' }); } catch (e) { threw = e.message; }
    check('without the engine nothing is written (one path only)', /engine/.test(threw) && pc.cadModels.length === 4);
    g.SLCadZonal = E;
  }

  // ---------------------------------------------------------------- C7
  console.log('\n[C7] display simplification');
  {
    const N = 120, pos = [], idx = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const u = i / N * Math.PI, v = j / N * 2 * Math.PI; pos.push(500 * Math.sin(u) * Math.cos(v), 500 * Math.sin(u) * Math.sin(v), 500 * Math.cos(u)); }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const a = i * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const P = new Float32Array(pos), X = new Uint32Array(idx);
    const d = I.decimate(P, X, 3000);
    check('a ' + X.length / 3 + '-triangle part comes under a 3000 budget', d.decimated && d.index.length / 3 <= 3000 && d.index.length / 3 > 300, d.index.length / 3);
    const b0 = I.bboxOf(P), b1 = I.bboxOf(d.position);
    check('its size is kept to within a few percent', [0, 1, 2].every(k => near(b1.max[k] - b1.min[k], b0.max[k] - b0.min[k], 0.08 * (b0.max[k] - b0.min[k]))));
    check('every index is in range', Array.from(d.index).every(v => v < d.position.length / 3));
    check('a part under budget is untouched', I.decimate(P, X, 1e9).decimated === false);
    const fake = { root: { name: 'A', meshes: [0], children: [] }, meshes: [{ name: 'Ball', attributes: { position: { array: pos } }, index: { array: idx } }] };
    const bm = I.buildModel(fake, { maxTrianglesPerPart: 3000 });
    check('buildModel applies the budget and counts it', bm.stats.decimatedParts === 1 && bm.meshes[0].index.length / 3 <= 3000 && bm.meshes[0].normal === null);
  }

  // ---------------------------------------------------------------- C8
  console.log('\n[C8] zone lists');
  {
    const rows = [
      ['Zone', 'Name', 'Parent', 'X min', 'Y min', 'Z min', 'X max', 'Y max', 'Z max', 'Unit'],
      ['100', 'Fuselage', '', 0, -1000, -1000, 10000, 1000, 1000, 'mm'],
      ['110', 'Avionics bay', '100', 1500, -600, -800, 2600, 600, -300, ''],
      ['200', 'Left wing', '', 0, 0, 0, 10, 10, 10, 'in'],
      ['300', 'No box', '', '', '', '', '', '', '', '']
    ];
    const r = I.parseZoneRows(rows);
    check('four zones, no errors', r.rows.length === 4 && r.errors.length === 0, JSON.stringify(r.errors));
    check('row shape is {code,name,parentCode,xMin,yMin,zMin,xMax,yMax,zMax}', JSON.stringify(Object.keys(r.rows[0])) === JSON.stringify(['code', 'name', 'parentCode', 'xMin', 'yMin', 'zMin', 'xMax', 'yMax', 'zMax']));
    check('parent code read, empty parent is null', r.rows[1].parentCode === '100' && r.rows[0].parentCode === null);
    check('inches converted to mm', r.rows[2].xMax === 254);
    check('a zone without a box keeps null coordinates', r.rows[3].xMin === null && r.rows[3].zMax === null);
    const bad = I.parseZoneRows([['code', 'xmin', 'ymin', 'zmin', 'xmax', 'ymax', 'zmax', 'parent'], ['A', 5, 0, 0, 1, 1, 1, ''], ['B', 0, 0, '', 1, 1, 1, ''], ['C', 'x', 0, 0, 1, 1, 1, ''], ['C', 0, 0, 0, 1, 1, 1, ''], ['D', 0, 0, 0, 1, 1, 1, 'Q']]);
    check('min larger than max refused', bad.errors.some(e => /A\): xMin is larger than xMax/.test(e)));
    check('a partial box refused', bad.errors.some(e => /B\): give all six/.test(e)));
    check('a non-number refused', bad.errors.some(e => /C\): a coordinate is not a number/.test(e)));
    check('an unknown parent reported', bad.errors.some(e => /parent Q is not in the list/.test(e)));
    check('no code column is a clear error', /No zone code column/.test(I.parseZoneRows([['foo', 'bar'], [1, 2]]).errors[0]));
    check('object rows (sheet_to_json default) work too', I.parseZoneRows([{ Code: '1', Name: 'n' }]).rows[0].code === '1');
    check('unit in a header bracket sets the default', I.parseZoneRows([['Code', 'Xmin (m)', 'Ymin', 'Zmin', 'Xmax', 'Ymax', 'Zmax'], ['1', 1, 0, 0, 2, 1, 1]]).rows[0].xMin === 1000);
    const g = (typeof globalThis !== 'undefined') ? globalThis : global;
    const keepE = g.SLCadZonal; delete g.SLCadZonal;
    check('no engine: handZones says so, adds nothing', I.handZones(r.rows).ok === false);
    let got = null; g.SLCadZonal = { importZoneList: rows2 => { got = rows2; return { added: rows2.length }; } };
    const hz = I.handZones(r.rows);
    check('with the engine: rows handed to SLCadZonal.importZoneList', hz.ok && got === r.rows && hz.result.added === 4);
    g.SLCadZonal = keepE;
  }

  // ---------------------------------------------------------------- C9
  console.log('\n[C9] STEP strings and products');
  {
    check("'' is a quote", I.decodeStepString("O''Hare") === "O'Hare");
    check('\\X2\\ is UTF-16', I.decodeStepString('\\X2\\00E9\\X0\\t\\X2\\00E9\\X0\\') === 'été');
    const pr = I.parseStepProducts("#1 = PRODUCT('PN-1','Pump','',(#2));\n#3 = PRODUCT_DEFINITION('design','',#4,#5);\n#6=PRODUCT ( 'PN-2' , 'Valve' ,'',(#2));");
    check('PRODUCT entities read, PRODUCT_DEFINITION ignored', pr.length === 2 && pr[0].id === 'PN-1' && pr[1].name === 'Valve');
    const ix = I.productIndex([{ id: 'A1', name: 'Bolt' }, { id: 'A2', name: 'Bolt' }, { id: 'B', name: 'Nut' }]);
    check('one name with two part numbers is ambiguous, not guessed', ix.Bolt === undefined && ix.Nut === 'B');
    check('schemas recognized', I.stepSchema("FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF'));") === 'AP242' && I.stepSchema("FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));") === 'AP203');
    let threw = false; try { I.convertStep(new Uint8Array(Buffer.from('hello')), occt); } catch (e) { threw = /not a STEP file/.test(e.message); }
    check('a non-STEP file is refused before OpenCascade sees it', threw);
  }

  console.log('\n[C9b] a worker that cannot start is reported, never waited on forever');
  {
    // Found 13 Oct 2026 in the desktop harness: a worker refused by the window's policy raised no
    // error event, and the import sat on "Starting the STEP reader" for good.
    const g = globalThis, keep = g.Worker;
    g.Worker = function Silent() { this.postMessage = () => {}; this.terminate = () => { this.terminated = true; }; };
    const t0 = Date.now();
    const r1 = await Promise.race([I.runWorker(new ArrayBuffer(8), { startMs: 60 }).promise.then(() => null, e => e), new Promise(r => setTimeout(() => r({ code: 'hung', message: 'still waiting after 3 s' }), 3000))]);
    check('a silent worker is reported after the start window, with a worker-blocked code', r1 && r1.code === 'worker-blocked' && /did not start/.test(r1.message) && Date.now() - t0 < 2000, r1 && r1.code);
    g.Worker = function Refused() { throw new Error('Refused to create a worker'); };
    const r2 = await I.runWorker(new ArrayBuffer(8), {}).promise.then(() => null, e => e);
    check('a worker refused outright is reported at once', r2 && r2.code === 'worker-blocked' && /could not start/.test(r2.message));
    let started = null;
    g.Worker = function Quick() { const self = this; this.terminate = () => {}; this.postMessage = () => { setTimeout(() => { self.onmessage({ data: { type: 'progress', phase: 'hash', frac: 0 } }); setTimeout(() => self.onmessage({ data: { type: 'result', sha256: 'x', model: { parts: [] } } }), 120); }, 5); }; started = this; };
    const r3 = await I.runWorker(new ArrayBuffer(8), { startMs: 60 }).promise.then(v => v, e => e);
    check('a worker that answers in time is not cut off by the start window, however long it then works', r3 && r3.sha256 === 'x');
    if (keep) g.Worker = keep; else delete g.Worker;
  }

  // ---------------------------------------------------------------- C10
  console.log('\n[C10] viewer pure helpers');
  {
    const Pp = V._pure;
    const tr = Pp.buildTree(entry.parts);
    const top = tr.root.children[0];
    check('tree root is Toy Aircraft holding all six parts', top && top.label === 'Toy Aircraft' && top.pids.length === 6);
    const prop = tr.byKey['/Toy Aircraft/Propulsion'];
    check('Propulsion holds both engines, each named by its designator', prop && prop.children.map(c => c.label).join('|') === 'Engine Nacelle (ENGINE_L)|Engine Nacelle (ENGINE_R)');
    check('a single occurrence carries no number', top.children.some(c => c.label === 'Fuselage'));
    check('copies without designators are numbered (1), (2)', Pp.buildTree([{ pid: 'a', name: 'V', path: ['X'] }, { pid: 'b', name: 'V', path: ['X'] }]).byKey['/X'].children.map(c => c.label).join('|') === 'V (1)|V (2)');
    check('ancestorsOf gives the rows to expand', JSON.stringify(Pp.ancestorsOf('p:Toy Aircraft/Avionics/Flight Control Computer#2', entry.parts)) === '["/Toy Aircraft","/Toy Aircraft/Avionics"]');
    const box = { min: [0, -1000, -1000], max: [10000, 1000, 1000] };
    const fv = Pp.standardView('front', box, 45, 1.5);
    check('Front looks from the nose (-X) at the center', fv.position[0] < 0 && near(fv.position[1], 0, 1e-6) && JSON.stringify(fv.target) === '[5000,0,0]');
    check('Top looks down from +Z', Pp.standardView('top', box, 45, 1).position[2] > 1000);
    {
      // Every corner of the box must project inside the view from the fitted distance, and the fit
      // must be tighter than a bounding sphere for a long fuselage.
      const fov = 45, asp = 1.6, dir = [-0.6, -0.6, 0.53]; const L = Math.hypot(...dir); const u = dir.map(x => x / L);
      const d = Pp.fitBoxDistance(box, u, fov, asp);
      const c = [5000, 0, 0], cam = c.map((x, i) => x + u[i] * d), f = u.map(x => -x);
      const up = [0, 0, 1], r0 = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]], rl = Math.hypot(...r0), r = r0.map(x => x / rl);
      const uu = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      const tv = Math.tan(fov * Math.PI / 360), th = tv * asp; let inside = true, tightest = 0;
      for (let i = 0; i < 8; i++) { const p = [i & 1 ? box.max[0] : box.min[0], i & 2 ? box.max[1] : box.min[1], i & 4 ? box.max[2] : box.min[2]]; const v = p.map((x, k) => x - cam[k]); const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2]; const sx = Math.abs(v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / (z * th), sy = Math.abs(v[0] * uu[0] + v[1] * uu[1] + v[2] * uu[2]) / (z * tv); if (sx > 1 + 1e-9 || sy > 1 + 1e-9) inside = false; tightest = Math.max(tightest, sx, sy); }
      check('fit: every corner of the box is in view', inside);
      check('fit: and the box fills most of the view (not a loose sphere fit)', tightest > 0.85, tightest);
    }
    const cone = Pp.volumeSpec({ kind: 'cone', apex: [1, 2, 3], axis: [0, 0, 2], halfAngleDeg: 30, length: 300 });
    check('cone: apex at origin of the profile, base radius L tan(a), unit axis', cone.ok && near(cone.baseRadius, 300 * Math.tan(Math.PI / 6), 1e-9) && JSON.stringify(cone.axis) === '[0,0,1]' && JSON.stringify(cone.points[0]) === '[0,0]');
    {
      // The viewer draws a risk volume exactly as the engine (cad_zonal.js inShape) counts it.
      const E = require(path.join(SITE, 'cad_zonal.js'));
      const sh = { kind: 'disk-sector', center: [0, 0, 0], axis: [1, 0, 0], radius: 1000, spreadDeg: 15 };
      const ds = Pp.volumeSpec(sh);
      const maxR = Math.max(...ds.points.map(p => Math.hypot(p[0], p[1])));
      const maxEl = Math.max(...ds.points.filter(p => p[0] > 0).map(p => Math.atan2(Math.abs(p[1]), p[0]) * 180 / Math.PI));
      check('disk-sector: drawn to the reach the engine uses (radius), spread +/-15 degrees about the rotor plane', ds.ok && near(maxR, 1000, 1e-9) && near(maxEl, 15, 1e-9) && ds.reach === 1000);
      check('engine agrees: inside at 999 mm in the plane, outside at 1001 mm, outside at 16 degrees', E.inShape(sh, [0, 999, 0]) && !E.inShape(sh, [0, 1001, 0]) && !E.inShape(sh, [Math.sin(16 * Math.PI / 180) * 500, Math.cos(16 * Math.PI / 180) * 500, 0]) && E.inShape(sh, [Math.sin(14 * Math.PI / 180) * 500, Math.cos(14 * Math.PI / 180) * 500, 0]));
      check('engine range and contract radius mean the same reach', E.inShape(Object.assign({}, sh, { radius: undefined, range: 1000 }), [0, 999, 0]) === E.inShape(sh, [0, 999, 0]) && Pp.volumeSpec(Object.assign({}, sh, { radius: undefined, range: 1000 })).reach === 1000);
      const dflt = Pp.volumeSpec({ kind: 'disk-sector', center: [0, 0, 0], axis: [0, 0, 1], fragment: 'small' }, { reach: 5000 });
      check('no spread given: the fragment model default (small = 15 degrees), as the engine; no reach: drawn to the model size', dflt.ok && dflt.spreadDeg === E.spreadOf({ fragment: 'small' }) && dflt.spreadDeg === 15 && dflt.reach === 5000 && dflt.bounded === false);
      { const keep = globalThis.SLCadZonal; delete globalThis.SLCadZonal;
        const same = ['oneThirdDisc', 'intermediate', 'small', undefined].every(fr => Pp.volumeSpec({ kind: 'disk-sector', center: [0, 0, 0], axis: [0, 0, 1], radius: 1, fragment: fr }).spreadDeg === E.spreadOf({ fragment: fr }));
        globalThis.SLCadZonal = keep;
        check('without the engine loaded, the viewer\'s own fragment defaults equal the engine\'s', same); }
      const sec = Pp.volumeSpec({ kind: 'disk-sector', center: [0, 0, 0], axis: [0, 0, 1], radius: 10, spreadDeg: 5, fromDeg: 0, toDeg: 90, refDir: [1, 0, 0] });
      check('a sector (fromDeg..toDeg from refDir) is drawn as that quarter only', sec.ok && near(sec.phiLength, Math.PI / 2, 1e-12) && JSON.stringify(sec.basis.z) === '[1,0,0]' && JSON.stringify(sec.basis.x) === '[0,1,0]' && E.inShape({ kind: 'disk-sector', center: [0, 0, 0], axis: [0, 0, 1], radius: 10, spreadDeg: 5, fromDeg: 0, toDeg: 90, refDir: [1, 0, 0] }, [1, 5, 0]));
    }
    check('sphere and box accepted', Pp.volumeSpec({ kind: 'sphere', center: [0, 0, 0], radius: 5 }).ok && Pp.volumeSpec({ kind: 'box', min: [1, 1, 1], max: [0, 0, 0] }).min[0] === 0);
    check('incomplete shapes refused, not drawn wrong', !Pp.volumeSpec({ kind: 'cone', apex: [0, 0, 0], axis: [0, 0, 0], halfAngleDeg: 30, length: 1 }).ok && !Pp.volumeSpec({ kind: 'sphere', center: [0, 0], radius: 1 }).ok && !Pp.volumeSpec({ kind: 'disk-sector', center: [0, 0, 0], axis: [1, 0, 0], radius: 1, spreadDeg: 95 }).ok && !Pp.volumeSpec({ kind: 'disk-sector', center: [0, 0, 0], axis: [1, 0, 0] }).ok && !Pp.volumeSpec({ kind: 'blob' }).ok);
    const fa = m1.meshes[3].position, fb = m1.meshes[4].position;   // the two FCC boxes
    const cp = Pp.closestVertexPair(fa, fb);
    let brute = Infinity; for (let i = 0; i < fa.length; i += 3) for (let j = 0; j < fb.length; j += 3) brute = Math.min(brute, Math.hypot(fa[i] - fb[j], fa[i + 1] - fb[j + 1], fa[i + 2] - fb[j + 2]));
    check('part to part: the sweep equals brute force', cp && near(cp.distance, brute, 1e-6), cp && cp.distance + ' vs ' + brute);
    {
      // Scattered clouds, offset along X so the sweep's early stop is exercised.
      let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      const cloud = (n, ox) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = ox + rnd() * 500; a[i * 3 + 1] = rnd() * 500; a[i * 3 + 2] = rnd() * 500; } return a; };
      let ok = true;
      for (let k = 0; k < 6; k++) {
        const A = cloud(300, 0), B = cloud(300, 350 + k * 40);
        let bf = Infinity; for (let i = 0; i < A.length; i += 3) for (let j = 0; j < B.length; j += 3) bf = Math.min(bf, Math.hypot(A[i] - B[j], A[i + 1] - B[j + 1], A[i + 2] - B[j + 2]));
        const got = Pp.closestVertexPair(A, B);
        if (!got || !near(got.distance, bf, 1e-6)) ok = false;
      }
      check('part to part: the sweep equals brute force on scattered clouds', ok);
    }
    check('part to part: the two FCC boxes are 300 mm apart', cp && near(cp.distance, 300, 0.01));
    check('zone colors are stable and differ', Pp.zoneColor('110') === Pp.zoneColor('110') && Pp.zoneColor('110') !== Pp.zoneColor('120') && /^#[0-9a-f]{6}$/.test(Pp.zoneColor('110')));
  }

  // ---------------------------------------------------------------- C11
  console.log('\n[C11] no network, no eval, wiring');
  {
    const FILES = ['cad_import.js', 'cad_import_worker.js', 'cad_viewer.js', 'cad_page.js'];
    FILES.forEach(f => {
      const src = S(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
      check(f + ': no network call (fetch, XMLHttpRequest, WebSocket, sendBeacon, EventSource)', !/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(src));
      check(f + ': no eval or Function constructor', !/\beval\s*\(|new Function\s*\(/.test(src));
    });
    const W = S('cad_import_worker.js');
    check('worker loads OpenCascade from vendor/occt as its own file', /importScripts\(SLCadImport\.OCCT_DIR \+ 'occt-import-js\.js'\)/.test(W) && I.OCCT_DIR === 'vendor/occt/');
    check('worker fingerprints the file and refuses a mismatch before parsing', W.indexOf('expectSha') >= 0 && W.indexOf("code: 'mismatch'") < W.indexOf('convertStep'));
    check('worker runs the same convertStep this test runs', /SLCadImport\.convertStep\(bytes, oc, opts\)/.test(W));
    check('worker transfers mesh buffers instead of copying', /postMessage\(\{ type: 'result'[^)]*\}, transfer\)/.test(W));
    check('cache is IndexedDB sl-cad / meshes', I.DB_NAME === 'sl-cad' && I.DB_STORE === 'meshes');
    const writers = ['cad_import.js', 'cad_viewer.js', 'cad_page.js'].filter(f => /cadModels\s*(=(?!=)|\.push|\.splice)/.test(S(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')));
    check('the CAD UI never writes projectConfig.cadModels itself; the engine is the one writer', writers.length === 0 && /E\.addCadModel\(entry\)/.test(S('cad_import.js')) && /pc\.cadModels\.push\(m\)/.test(S('cad_zonal.js')), writers.join(','));
    check('viewer and page never write zones or PRA volumes', !/(projectConfig|_pc\(\)|\bpc)\.(zones|praVolumes)\s*=(?!=)|(zones|praVolumes|_zones\(\)|_vols\(\))\.(push|splice)\(/.test(S('cad_viewer.js') + S('cad_page.js')));
    check('viewer reads geometry only from the local cache or a re-opened local file', /I\.cacheGet\(entry\.sha256\)/.test(S('cad_viewer.js')) && /I\.reopen\(file, entry/.test(S('cad_viewer.js')));
    const IDX = S('index.html');
    check('load order: zonal_ui.js, cad_import.js, cad_viewer.js, cad_page.js', /zonal_ui\.js\?v=[\d.]+" defer><\/script>\s*(<!--[^>]*-->\s*)?<script src="cad_import\.js\?v=[\d.]+" defer><\/script>\s*<script src="cad_viewer\.js\?v=[\d.]+" defer><\/script>\s*<script src="cad_page\.js\?v=[\d.]+" defer><\/script>/.test(IDX));
    check('the worker is not a page script', !/<script src="cad_import_worker\.js/.test(IDX));
    const PT = require(path.join(SITE, 'prove_tabs.js'));
    const zsa = PT.AREAS.find(a => a.label === 'ZSA').tabs.map(x => x.t);
    check('CAD Model is a ZSA tab, right after Zonal Model', zsa.indexOf('cad') === zsa.indexOf('zonal') + 1);
    check("the page mounts its own 'view-cad'", S('cad_page.js').indexOf("v.id = 'view-cad'") >= 0);
    check('viewer API names as agreed', ['mount', 'loadModel', 'highlightZone', 'highlightParts', 'highlightVolume', 'onSelect', 'dispose'].every(k => typeof V[k] === 'function'));
    {
      const PG = S('cad_page.js'), E = require(path.join(SITE, 'cad_zonal.js'));
      const used = ['matchEquipment', 'applyExactLinks', 'confirmLink', 'rejectLink', 'unlink', 'containment', 'applyContainment', 'independenceFlags', 'zoneImpact', 'riskImpact', 'partsInVolume', 'riskVolume', 'openReviews', 'closeReviewItem', 'model'];
      check('the page calls the engine\'s real functions, and every one exists', used.every(f => new RegExp('E\\.' + f + '\\(').test(PG) && typeof E[f] === 'function'), used.filter(f => !new RegExp('E\\.' + f + '\\(').test(PG) || typeof E[f] !== 'function').join(','));
      check('no guessed engine names are left in the page', !/zonesForPart|impactOfVolume|containingZones|volumeImpact|_call\(/.test(PG));
      check('nothing is linked or placed without a name: links and placement go through _needWho', /var by = _needWho\(\); if \(!by\) return;[\s\S]*E\.confirmLink/.test(PG) && /function _place\(\)[\s\S]{0,120}_needWho\(\)/.test(PG) && /applyContainment\(state\.cadId, \{ apply: true, by: by \}\)/.test(PG));
      check('each link button does one thing: Confirm / Accept link that part to that equipment, Reject rejects that pair', /act === 'confirm'\) r = E\.confirmLink\(state\.cadId, pid, sid, by/.test(PG) && /act === 'reject'\) r = E\.rejectLink\(state\.cadId, pid, sid, by\)/.test(PG) && /act === 'accept-all'\) r = E\.applyExactLinks\(state\.cadId, by\)/.test(PG));
      check('the placement preview never writes (applyContainment without apply)', /var plan = E\.applyContainment\(state\.cadId\);/.test(PG));
      check('a new revision is diffed and put up for review', /E\.diffRevision\(prev\.id, entry\.id\)/.test(S('cad_import.js')) && /E\.markForReview\(diff, by\)/.test(S('cad_import.js')));
      check('a ZSA row\'s zone opens the CAD page on that zone', /getElementById\('zsa-body'\)/.test(PG) && /showZone\(b\.getAttribute\('data-cad-show-zone'\)\)/.test(PG) && /v\.highlightZone\(z\)/.test(PG));
      check('the Equipment links panel states the rule: one installed copy, never a part number', /never to a part number/.test(PG) && /designator matches to accept/.test(PG) && /suggestions to confirm/.test(PG));
      check('severity goes through the app\'s one severity renderer', /window\.sevPillHtml\(s\)/.test(PG));
    }
    check('page feature-detects SLCadZonal and degrades', /function _engine\(\)/.test(S('cad_page.js')) && /The zonal engine is not available in this build/.test(S('cad_page.js')));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  suite threw: ' + (e && e.stack || e)); process.exit(1); });
