#!/usr/bin/env node
/*
 * Regression: IGES import (19 Oct 2026).
 *
 * THE REQUIREMENT (Waqas, 19 Oct 2026): "make sure we can import CAD files from any CAD program", answered
 * "STEP for all, plus IGES": every CAD tool writes STEP, which Safety Lab already reads; IGES is added for the
 * tools and archives that only have it, with exact measurement, and the import screen tells people how to
 * export from each CAD tool.
 *
 * Safety Lab's own OpenCascade build (site/vendor/occt-fast, OCCT 7.8.1 unmodified) now links OCCT's IGES reader
 * (TKDEIGES, with TKBool which it needs); tools/occt/slcad_occt.cpp reads a file whose first record is an IGES
 * start record through IGESCAFControl_Reader (names, colors), everything else as STEP, as before.
 * IGES has no product structure, part numbers or user defined attributes, so it is read whole (no structure
 * streaming, no part-by-part sessions) and the smaller STEP-only reader is never a fallback for it.
 *
 * Fixtures (tests/fixtures/cad/iges, made with OpenCascade 7.8 by make_fixtures.py and make_fixtures_inch.py):
 *   two_parts_mm.igs         a pipe (r 10, 200 long on X) and a bracket (100 x 50 x 20 at x 300), trimmed
 *                            surfaces (the usual IGES output), mm, named PIPE-1 and BRACKET-2 with colors
 *   two_parts_inch_brep.igs  the same shapes as B-rep solids (MSBO, type 186), the file written in INCHES
 *
 *   A  the engine: built with the IGES reader, still under the size limit
 *   B  which files are IGES: the start record rule, line endings, fixed records, never a STEP file
 *   C  the global section: units, version, Hollerith text, other delimiters
 *   D  reading IGES: names, colors, units to mm, schema, no assembly structure claimed
 *   E  exact geometry from IGES: distance, area, volume, in mm whatever the file's unit
 *   F  the worker: IGES skips the structure reader and the part-by-part sessions, and has no STEP-only fallback
 *   G  the import screen: the picker lists IGES, the export guide covers the CAD tools
 *   H  STEP unchanged
 *   M  mutations
 *
 * Run: node tests/regression_cad_iges_20261019.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const near = (a, b, t) => Math.abs(a - b) <= t;
const IGD = path.join(__dirname, 'fixtures', 'cad', 'iges');
const rd = f => new Uint8Array(fs.readFileSync(path.join(IGD, f)));
const I = require(path.join(SITE, 'cad_import.js'));
globalThis.SLCadImport = I;
const B = require(path.join(SITE, 'cad_brep.js'));
const IMP = S('cad_import.js'), BR = S('cad_brep.js'), WK = S('cad_import_worker.js'), PG = S('cad_page.js'), VW = S('cad_viewer.js');
const CPP = fs.readFileSync(path.join(ROOT, 'tools', 'occt', 'slcad_occt.cpp'), 'utf8'), BSH = fs.readFileSync(path.join(ROOT, 'tools', 'occt', 'build_occt.sh'), 'utf8');
// modules from (possibly mutated) source
function impMod(src) { const m = { exports: {} }; vm.runInNewContext(src, { module: m, self: undefined, window: undefined, globalThis: {}, TextDecoder, TextEncoder, Uint8Array, console, Math, Date, JSON, Object, Array, String, Number, RegExp, Error, parseInt, parseFloat, isFinite, Promise, Map, Set, Float32Array, Float64Array, Uint32Array, Int32Array, ArrayBuffer }, { filename: 'cad_import.js' }); return m.exports; }
function brepWith(src, I2) { const g = { SLCadImport: I2 || I }; const m = { exports: {} }; vm.runInNewContext(src, { module: m, self: g, window: undefined, globalThis: g, console, Math, Date, JSON, Object, Array, String, Number, RegExp, Error, parseInt, parseFloat, isFinite, Promise, Map, Set, Float32Array, Float64Array, Uint32Array, Int32Array, Uint8Array, ArrayBuffer, TextDecoder, TextEncoder }, { filename: 'cad_brep.js' }); return m.exports; }

(async () => {
  const FM = await require(path.join(SITE, 'vendor', 'occt-fast', 'slcad_occt.js'))({ print: () => {}, printErr: () => {} });
  const MM = rd('two_parts_mm.igs'), IN = rd('two_parts_inch_brep.igs');
  const TOY = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'cad', 'toy_aircraft.step')));

  // ===================================================================== A
  console.log('[A] the engine reads IGES');
  {
    const w = fs.readFileSync(path.join(SITE, 'vendor', 'occt-fast', 'slcad_occt.wasm'));
    check('built with OCCT\'s IGES toolkit (TKDEIGES) and the toolkit it needs (TKBool)', /\bTKDEIGES\b/.test(BSH) && /\bTKBool\b/.test(BSH));
    check('the entry point reads IGES through IGESCAFControl_Reader with names and colors', /IGESCAFControl_Reader reader;/.test(CPP) && /reader\.SetColorMode\(true\); reader\.SetNameMode\(true\)/.test(CPP) && /IGESControl_Controller::Init\(\)/.test(CPP));
    check('both entry points (import and exact session) go through the one reader choice', (CPP.match(/readInto\(data, len, doc/g) || []).length === 2);
    check('still one wasm file under 16 MiB', w.length < 16 * 1024 * 1024, String(w.length));
    check('the build script works with CMake 4 and on macOS (cores, library folder)', /CMAKE_POLICY_VERSION_MINIMUM=3\.5/.test(BSH) && /sysctl -n hw\.ncpu/.test(BSH) && /find \. -name libTKernel\.a/.test(BSH));
    check('every entry point the site calls is exported', ['_sl_read', '_sl_read2', '_sl_load', '_sl_unload', '_sl_query', '_sl_pmi', '_sl_free'].every(f => typeof FM[f] === 'function'));
  }

  // ===================================================================== B
  console.log('\n[B] which files are IGES');
  {
    const lines = Buffer.from(MM).toString('latin1');
    check('both fixtures are IGES and not STEP', I.isIges(MM) && I.isIges(IN) && !I.isStep(MM) && !I.isStep(IN));
    check('a STEP file is not IGES', !I.isIges(TOY) && I.isStep(TOY) && I.cadFormat(TOY) === 'step' && I.cadFormat(MM) === 'iges');
    check('anything else is neither', I.cadFormat(new Uint8Array(Buffer.from('hello world'))) === null && I.cadFormat(new Uint8Array(Buffer.from('x'.repeat(200)))) === null);
    check('CRLF line endings are IGES', I.isIges(new Uint8Array(Buffer.from(lines.replace(/\n/g, '\r\n'), 'latin1'))));
    check('fixed 80 byte records with no line breaks are IGES', I.isIges(new Uint8Array(Buffer.from(lines.replace(/\r?\n/g, ''), 'latin1'))));
    const bad1 = lines.slice(0, 72) + 'G' + lines.slice(73), bad2 = lines.slice(0, 73) + 'AB00001' + lines.slice(80), bad3 = lines.slice(40);
    check('the start section letter must be in column 73', !I.isIges(new Uint8Array(Buffer.from(bad1, 'latin1'))));
    check('columns 74 to 80 must be a sequence number', !I.isIges(new Uint8Array(Buffer.from(bad2, 'latin1'))));
    check('a record shorter than 80 columns is not IGES', !I.isIges(new Uint8Array(Buffer.from(bad3, 'latin1'))));
    check('the page and the engine use the same rule (column 73, columns 74 to 80, fixed records)', /d\[72\] != 'S'/.test(CPP) && /for \(int i = 73; i < 80; i\+\+\)/.test(CPP) && /d\[152\] == 'S' \|\| d\[152\] == 'G'/.test(CPP) && /d\[152\] === 83 \|\| d\[152\] === 71/.test(IMP));
  }

  // ===================================================================== C
  console.log('\n[C] the global section');
  {
    const gm = I.igesGlobal(MM), gi = I.igesGlobal(IN);
    check('units: mm (flag 2) and inch (flag 1)', gm.unit === 'mm' && gi.unit === 'inch', gm.unit + ' ' + gi.unit);
    check('version 11 is IGES 5.3', gm.version === '5.3' && I.cadSchema(MM) === 'IGES 5.3');
    check('Hollerith text read whole (the file name, the system)', gm.fileName === 'Filename.iges' && gm.system === 'Open CASCADE 7.8', JSON.stringify(gm));
    const rec = (txt, letter) => txt.match(/.{1,72}/g).map((t, i) => t.padEnd(72) + letter + String(i + 1).padStart(7)).join('\n');
    const mk = g => new Uint8Array(Buffer.from(rec('a start record', 'S') + '\n' + rec(g, 'G') + '\n', 'latin1'));
    // other delimiters: '/' between parameters, '#' at the end; a name holding a comma; unit flag 3 with its name
    const odd = I.igesGlobal(mk('1H/,1H#/3HA,B/6Hpart.x/4HMINE/3Hv.1/32/38/6/308/15//1./3/2HFT/1/0.1/13H261019.120000/1E-07/100./2HWN/3HACM/11/0/13H261019.120000#'));
    check('other delimiters and a comma inside text', odd.product === 'A,B' && odd.fileName === 'part.x' && odd.system === 'MINE' && odd.version === '5.3', JSON.stringify(odd));
    check('unit flag 3 takes the unit\'s name', odd.unit === 'ft');
    const cm = I.igesGlobal(mk(',,3HABC,4Hx.ig,1Hs,1Hp,32,38,6,308,15,,1.,10,2HCM,1,0.1,13H261019.120000,1E-07,100.,1Hw,1Ha,11,0,13H261019.120000;'));
    check('every unit flag maps: 10 is cm', cm.unit === 'cm');
    check('a unit the file does not give is unknown, never assumed', I.igesGlobal(mk(',,;')).unit === 'unknown');
  }

  // ===================================================================== D / E
  console.log('\n[D] reading IGES  [E] exact geometry from IGES');
  let mmPids = null;
  {
    const prog = []; const r = B.convertFast(FM, MM, { keep: true, onProgress: (ph, f) => prog.push(ph) }), m = r.model;
    const names = m.parts.map(p => p.name);
    check('D: the parts keep their names from the file', names.join('|') === 'PIPE-1|BRACKET-2', names.join('|'));
    const col = mi => m.meshes[mi] && m.meshes[mi].color;
    const c0 = col(m.parts[0].meshes ? m.parts[0].meshes[0] : 0), c1 = col(m.parts[1].meshes ? m.parts[1].meshes[0] : 1);
    check('D: and their colors (red pipe, blue bracket)', c0 && c1 && c0[0] > 0.5 && c0[2] < 0.3 && c1[2] > 0.5 && c1[0] < 0.3, JSON.stringify([c0, c1]));
    check('D: the model says what it is: IGES 5.3 in mm, read by our build', m.schema === 'IGES 5.3' && m.sourceUnit === 'mm' && m.units === 'mm' && m.format === 'iges' && m.reader === 'occt-fast');
    check('D: no assembly structure is claimed', m.tree && m.tree.full === false && /IGES/.test(m.tree.why));
    check('D: progress is reported (scan, parse)', prog.includes('scan') && prog.includes('parse'));
    const bb = m.parts[0].bbox;
    check('D: the boxes are where the file put them (mm)', bb && near(bb.max[0], 200, 1e-3) && near(bb.min[1], -10, 1e-3));
    const s = r.session, ids = s.pids(); mmPids = ids.slice();
    const d = s.distance(ids[0], ids[1]);
    check('E: exact distance pipe to bracket is 100 mm (from the surfaces)', d.exact === true && near(d.distance, 100, 1e-6), JSON.stringify(d));
    const pa = s.properties(ids[0]), pb = s.properties(ids[1]);
    check('E: exact areas: pipe 2*pi*r*h + 2*pi*r^2, bracket 16000 mm2', near(pa.area, 2 * Math.PI * 10 * 200 + 2 * Math.PI * 100, 1e-6) && near(pb.area, 16000, 1e-6) && pa.exact && pb.exact);
    check('E: trimmed surfaces are faces, not invented solids (no volume claimed)', pa.kind === 'faces' && pa.volume == null);
    check('E: the session knows the file unit (mm)', s.fileUnitName === 'mm' && s.fileUnitMm === 1);
    const fi = s.faceInfo ? s.faceInfo(ids[0], 0) : null;
    check('E: face queries work on IGES surfaces', !fi || fi.exact !== false, JSON.stringify(fi).slice(0, 200));
    s.close();

    const r2 = B.convertFast(FM, IN, { keep: true }), m2 = r2.model, s2 = r2.session, j = s2.pids();
    check('E: an inch file comes in as mm (200 mm pipe, not 200 inches)', near(m2.parts[0].bbox.max[0], 200, 1e-6) && m2.sourceUnit === 'inch', JSON.stringify(m2.parts[0].bbox));
    const v = s2.properties(j[0]);
    check('E: B-rep solids from IGES have exact volumes (pi*r^2*h, within the file\'s 9 digits)', v.kind === 'solid' && Math.abs(v.volume / (Math.PI * 100 * 200) - 1) < 1e-8, String(v.volume));
    check('E: exact distance in mm from the inch file', near(s2.distance(j[0], j[1]).distance, 100, 1e-6));
    check('E: the session knows the file was in inches', s2.fileUnitName === 'inch' && s2.fileUnitMm === 25.4);
    check('E: unnamed IGES entities are still told apart', j.length === 2 && j[0] !== j[1], J2(j));
    s2.close();

    const s3 = B.openSessionFast(FM, MM);
    check('E: an exact session opened later names the parts the same', JSON.stringify(s3.pids()) === JSON.stringify(mmPids) && s3.fileUnitName === 'mm');
    s3.close();
  }

  // ===================================================================== F
  console.log('\n[F] the worker');
  {
    check('IGES is not given to the structure reader (STEP only)', /var fast = !iges && \(reader === 'auto' \|\| reader === 'structure'\) \? viaStructure\(bytes\) : null;/.test(WK));
    check('IGES has no STEP-only fallback: the real error is shown', /if \(reader === 'fast' \|\| iges\) throw e;/.test(WK));
    check('neither STEP nor IGES is refused before any reader runs', /if \(!iges && !SLCadImport\.isStep\(bytes\)\) throw new Error\(SLCadImport\.NOT_CAD\);/.test(WK));
    check('an IGES exact session is read whole, never part by part', /if \(!S \|\| SLCadImport\.isIges\(bytes\)\) return null;/.test(WK));
    let msg = ''; try { I.convertStep(MM, {}); } catch (e) { msg = e.message; }
    check('the smaller reader refuses IGES with a reason, before reading', /IGES files are read only by the full reader/.test(msg), msg);
    let msg2 = ''; try { B.convertFast(FM, new Uint8Array(Buffer.from('hello'))); } catch (e) { msg2 = e.message; }
    check('a file that is neither gets one plain message', msg2 === I.NOT_CAD && /STEP or IGES/.test(msg2));
  }

  // ===================================================================== G
  console.log('\n[G] the import screen');
  {
    check('the file picker lists IGES (import, reopen, exact geometry)', I.ACCEPT === '.stp,.step,.p21,.igs,.iges' && /inp\.accept = I\.ACCEPT/.test(PG) && (VW.match(/root\.SLCadImport\.ACCEPT/g) || []).length === 2 && !/accept = '\.stp,\.step,\.p21';/.test(PG + VW));
    check('the import button says STEP and IGES', /Import CAD \(STEP, IGES\)/.test(PG) && /STEP and IGES files are read on this computer/.test(PG));
    const tools = I.EXPORT_GUIDE.map(g => g.tool);
    check('the export guide covers the CAD tools people use', ['CATIA V5', '3DEXPERIENCE (CATIA)', 'Siemens NX', 'PTC Creo', 'SolidWorks', 'Autodesk Inventor', 'Autodesk Fusion', 'Solid Edge', 'Onshape', 'Any other tool'].every(t => tools.includes(t)), tools.join(', '));
    const h = I.exportGuideHtml();
    check('the guide says what IGES leaves out (assembly, route types)', /IGES carries the shapes, their names and colors only/.test(h) && /route types are set by hand/.test(h));
    check('the guide is on the CAD page', /exportGuideHtml\(\)/.test(PG) && /data-cad-export-guide/.test(h));
    check('no em dashes in the new text', !/—/.test(h + I.NOT_CAD));
    check('the reopen and exact geometry prompts no longer say STEP only', /Open the CAD file\.\.\./.test(VW) && /The CAD file is not kept in this browser/.test(VW));
  }

  // ===================================================================== H
  console.log('\n[H] STEP unchanged');
  {
    const r = B.convertFast(FM, TOY, { keep: false }).model;
    check('the toy aircraft reads as before (STEP, its parts, its part numbers, AP214)', r.format === 'step' && r.parts.length === 6 && r.schema === 'AP214' && r.parts.some(p => p.partNumber));
    check('a STEP surface model gets no color from the IGES rule (the STEP read is unchanged)', /if \(!rec\.hasColor && g_readIges\)/.test(CPP) && /g_readIges = isIges\(data, len\);/.test(CPP));
  }

  // ===================================================================== M
  console.log('\n[M] mutations');
  {
    const mut = async (name, src, from, to, broken) => {
      if (!src.includes(from)) { check('mutation anchor present: ' + name, false); return; }
      let caught; try { caught = await broken(src.replace(from, to)); } catch (e) { caught = true; }
      check('mutation caught: ' + name, caught);
    };
    await mut('column 73 not checked', IMP, 'if (d.length < 80 || d[72] !== 83) return false;', 'if (d.length < 80) return false;', s => impMod(s).isIges(new Uint8Array(Buffer.from(Buffer.from(MM).toString('latin1').slice(0, 72) + 'G' + Buffer.from(MM).toString('latin1').slice(73), 'latin1'))));
    await mut('the sequence number not checked', IMP, 'else if (d[i] !== 32) return false;', 'else if (false) return false;', s => impMod(s).isIges(new Uint8Array(Buffer.from(Buffer.from(MM).toString('latin1').slice(0, 73) + 'AB00001' + Buffer.from(MM).toString('latin1').slice(80), 'latin1'))));
    await mut('inch and mm swapped', IMP, "var IGES_UNITS = { 1: 'inch', 2: 'mm',", "var IGES_UNITS = { 2: 'inch', 1: 'mm',", s => impMod(s).igesGlobal(IN).unit !== 'inch');
    await mut('the unit read from the wrong parameter', IMP, 'var flag = parseInt(out[13], 10)', 'var flag = parseInt(out[12], 10)', s => impMod(s).igesGlobal(MM).unit !== 'mm');
    await mut('Hollerith text cut at a delimiter', IMP, 'if (m) { var n = +m[1]; i += m[0].length; v = g.substr(i, n); i += n; }', 'if (false) {}', s => impMod(s).igesGlobal(MM).fileName !== 'Filename.iges');
    await mut('a non default delimiter ignored', IMP, 'if (a.v) pd = a.v.charAt(0);', '', s => { const rec = (txt, l) => txt.match(/.{1,72}/g).map((t, i) => t.padEnd(72) + l + String(i + 1).padStart(7)).join('\n'); return impMod(s).igesGlobal(new Uint8Array(Buffer.from(rec('s', 'S') + '\n' + rec('1H/,1H#/3HA,B/6Hpart.x/4HMINE/3Hv.1/32/38/6/308/15//1./2/2HMM/1/0.1/13H261019.120000/1E-07/100./2HWN/3HACM/11/0/13H261019.120000#', 'G') + '\n', 'latin1'))).unit !== 'mm'; });
    await mut('IGES sent through the STEP text scan', BR, 'if (iges) { schema = I.cadSchema(u8); sourceUnit = I.cadLengthUnit(u8); }', 'if (false) {}', s => { try { brepWith(s).convertFast(FM, MM, { keep: false }); return false; } catch (e) { return true; } });
    await mut('IGES claimed to have the full structure', BR, "var tree = iges ? { full: false, why: 'IGES has no assembly structure' } : ", 'var tree = ', s => { const t = brepWith(s).convertFast(FM, MM, { keep: false }).model.tree; return !(t && /IGES/.test(t.why || '')); });
    await mut('the session not told the file unit', BR, "ss.setFileUnit(fileUnitOf(u8));", "ss.setFileUnit('mm');", s => { const ss = brepWith(s).openSessionFast(FM, IN); const u = ss.fileUnitName; ss.close(); return u !== 'inch'; });
    await mut('the worker sends IGES to the structure reader', WK, "var fast = !iges && (reader === 'auto'", "var fast = (reader === 'auto'", s => !/var fast = !iges && \(reader === 'auto' \|\| reader === 'structure'\)/.test(s));
    await mut('the worker falls back to the STEP-only reader for IGES', WK, "if (reader === 'fast' || iges) throw e;", "if (reader === 'fast') throw e;", s => !/\|\| iges\) throw e;/.test(s));
    await mut('the picker without IGES', IMP, "var ACCEPT = '.stp,.step,.p21,.igs,.iges';", "var ACCEPT = '.stp,.step,.p21';", s => !/\.igs/.test(impMod(s).ACCEPT));
    await mut('the smaller reader not told about IGES', IMP, "if (isIges(u8)) throw new Error('IGES files are read only by the full reader", "if (false) throw new Error('IGES files are read only by the full reader", s => { try { impMod(s).convertStep(MM, { ReadStepFile: () => ({ success: false }) }); return false; } catch (e) { return !/IGES files are read only/.test(e.message); } });
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
function J2(x) { return JSON.stringify(x); }
