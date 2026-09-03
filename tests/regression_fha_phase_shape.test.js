#!/usr/bin/env node
/*
 * Regression — one vocabulary for row.phases, and ids that match however stored.
 * (28 Aug 2026, Waqas: "the edit button in the FHAs does not work, fault tree
 * node selection or event selection does not work for AI generated fault trees"
 * — plus a third find of the same investigation: DELETE was equally dead on
 * numeric-id rows, unreported because nobody deletes seeded rows.)
 *
 * ONE ROOT CAUSE, THREE SYMPTOMS, all reproduced live on the deployed build:
 *
 *   row.phases had two storage shapes. The form writes a COMMA STRING
 *   (getCheckedValues().join(', ')); _applyFhaSuggestion wrote the ARRAY that
 *   _validPhases returns. Every reader assumed the string:
 *     · setCheckedValues → TypeError mid-populate → "Edit does nothing" on all
 *       63 AI rows on Aeolus (measured: editACFHA on an AI row threw
 *       "commaString.split is not a function");
 *     · getPhaseExposureRatio / the phase-list reader → the SAME TypeError
 *       thrown inside the node-click path (openNodePropertiesModal → selectNode
 *       → exposure refresh) on any AI tree whose page linked an AI FHA row —
 *       selectedNodeData was set but the drawer never opened. Reproduced on the
 *       Untitled project's "Complete loss of forward thrust" tree: click landed,
 *       error "fha.phases.split is not a function", drawerVisible false.
 *
 *   INDEPENDENT SECOND DEFECT, same button: rowActionsHTML always emits the id
 *   QUOTED (editACFHA('1001')), and the editors matched with strict ===. Seeded
 *   demo rows store NUMBERS, so Edit AND Delete were silent no-ops on every
 *   numeric-id row (measured live: editACFHA('1001') left the form untouched
 *   while editACFHA('17878600568042x560') found its row).
 *
 * THE FIX, three layers, each pinned here BEHAVIOURALLY (extracted and executed,
 * never source-shape-pinned — the lesson this same file family learned twice):
 *   1. write side  — _applyFhaSuggestion joins at birth: phases is a string.
 *   2. stored data — migrateFhaPhaseShape() heals array rows on load (AC + SFHA).
 *   3. readers     — setCheckedValues + both phase readers tolerate the array
 *                    (String([..]) comma-joins); id matching coerces String()
 *                    on both sides across the edit/delete family.
 *
 * Run: node tests/regression_fha_phase_shape.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const helpers = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
const dataOps = fs.readFileSync(path.join(SITE, 'data_ops_modules.js'), 'utf8');
const slab = fs.readFileSync(path.join(SITE, 'safety_lab.js'), 'utf8');
const quant = fs.readFileSync(path.join(SITE, 'fta_quant_modules.js'), 'utf8');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const bindings = fs.readFileSync(path.join(SITE, 'bindings_modules.js'), 'utf8');
const loader = fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

function fn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
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

console.log('\n[write] an AI-accepted FHA row is born speaking the string vocabulary');
{
  const body = fn(ai, '_applyFhaSuggestion');
  check('_applyFhaSuggestion is extractable', !!body);
  // execute just the phases expression with the real _validPhases
  const vp = fn(ai, '_validPhases');
  check('_validPhases is extractable', !!vp);
  if (body && vp) {
    const m = body.match(/phases:\s*([^\n]+?),\s*(?:\/\/|\n)/);
    check('the phases assignment exists', !!m);
    if (m) {
      const vocabFn = fn(ai, '_projectPhaseNames') || 'function _projectPhaseNames(){ return ["Takeoff","Cruise"]; }';
      const ctx = vm.createContext({ flightPhasesData: [{ phase: 'Takeoff' }, { phase: 'Cruise' }], s: { phases: ['Takeoff', 'Cruise'] } });
      vm.runInContext(vocabFn + '\n' + vp, ctx);
      const val = vm.runInContext('(' + m[1] + ')', ctx);
      check('the stored value is a STRING, not an array', typeof val === 'string',
        'got ' + (Array.isArray(val) ? 'array' : typeof val) + ' — the array shape is what broke Edit and node selection');
      check('…joined with ", " like the form writes', val === 'Takeoff, Cruise', 'got "' + val + '"');
    }
  }
}

console.log('\n[migrate] stored array rows heal on load — AC and SFHA both');
{
  const body = fn(dataOps, 'migrateFhaPhaseShape');
  check('migrateFhaPhaseShape exists', !!body);
  check('…and runs with the other FHA migrations', /migrateFhaPhaseShape\(\);/.test(fn(dataOps, 'migrateAllFHAAssumptions') || ''));
  if (body) {
    const ctx = vm.createContext({
      acFhaData: [{ internalId: 1, phases: ['Takeoff', 'Landing'] }, { internalId: 2, phases: 'Cruise' }, null],
      systemsData: [{ fha: [{ internalId: 3, phases: ['Climb', '', 'Descent'] }] }, { fha: null }]
    });
    vm.runInContext(body + '\nmigrateFhaPhaseShape();', ctx);
    check('an AC array row becomes the comma string', ctx.acFhaData[0].phases === 'Takeoff, Landing');
    check('a string row passes through untouched — idempotent', ctx.acFhaData[1].phases === 'Cruise');
    check('an SFHA array row heals too, empties dropped', ctx.systemsData[0].fha[0].phases === 'Climb, Descent');
    check('null rows and systems without fha do not throw', true);
  }
}

console.log('\n[readers] the three throwing readers, executed with the ARRAY shape');
{
  const body = fn(helpers, 'setCheckedValues');
  const boxes = [{ value: 'Takeoff', checked: false }, { value: 'Cruise', checked: false }];
  const ctx = vm.createContext({ document: { querySelectorAll: () => boxes } });
  vm.runInContext(body, ctx);
  check('setCheckedValues survives an array and checks the right boxes', (() => {
    try { vm.runInContext('setCheckedValues("x", ["Takeoff"])', ctx); return boxes[0].checked === true && boxes[1].checked === false; }
    catch (e) { return false; }
  })(), 'this exact TypeError is what aborted the Edit populate');
  check('…still works on the comma string', (() => {
    boxes.forEach(b => b.checked = false);
    try { vm.runInContext('setCheckedValues("x", "Cruise")', ctx); return boxes[1].checked === true; } catch (_) { return false; }
  })());
  check('…and an empty array is a no-op, not a crash', (() => {
    try { vm.runInContext('setCheckedValues("x", [])', ctx); return true; } catch (_) { return false; }
  })());
}
{
  // the two phase readers: the fix is String(fha.phases) — prove the coercion behaves
  check('safety_lab phase reader coerces (String(fha.phases).split)', /return String\(fha\.phases\)\.split\(','\)/.test(slab),
    'this reader threw inside the node-click path and killed the drawer');
  check('fta_quant exposure reader coerces the same way', /const phases = String\(fha\.phases\)\.split\(','\)/.test(quant));
  check('the coercion itself round-trips an array', String(['A', 'B']).split(',').map(s => s.trim()).join('|') === 'A|B');
}

console.log('\n[ids] the edit/delete family matches ids however they are stored');
{
  const body = fn(helpers, 'editACFHA');
  check('editACFHA finds a NUMERIC row from the quoted onclick id', (() => {
    const i = (body || '').indexOf('acFhaData.find(');
    if (i < 0) return false;
    const j = body.indexOf('); if (!item)', i);
    if (j < 0) return false;
    const pred = vm.runInContext('(' + body.slice(i + 'acFhaData.find('.length, j) + ')',
      vm.createContext({ iId: '1001', String }));
    return pred({ internalId: 1001 }) === true && pred({ internalId: 999 }) === false;
  })(), 'editACFHA("1001") vs internalId 1001 — the exact live failure on the seeded rows');
  const strictLeft = [helpers, slab, bindings].map(s =>
    ((s.match(/internalId [!=]== iId/g) || []).length) +
    ((s.match(/internalId [!=]== editStates\./g) || []).length)).reduce((a, b) => a + b, 0);
  check('no strict internalId comparison survives — the open half OR the save half', strictLeft === 0,
    strictLeft + ' left — the save-half sites (=== editStates.acFha) were the FOURTH symptom: ' +
    'an edit that opened could still silently fail to write back on a numeric-id row');
  check('the save-after-edit path coerces on both scopes',
    /String\(i\.internalId\) === String\(editStates\.acFha\)/.test(helpers) &&
    /String\(i\.internalId\) === String\(editStates\.sysFha\)/.test(helpers));
}

console.log('\n[census] the WHOLE class is dead, not just the reported members');
{
  // 28 Aug 2026 (evening) — after the first fix shipped, "the chart button is
  // there, the modal doesnt pop up": openFhaChartModal had the identical strict
  // === but called its parameter `internalId`, so the iId-shaped grep missed it.
  // On Aeolus the only rows classified enough to SHOW a chart button are the
  // seeded numeric ones, so every visible chart button was dead. A sweep that
  // enumerates symptoms loses to a census that forbids the pattern: ZERO strict
  // .internalId comparisons may exist anywhere in served JS, coerced or not at
  // the DOM boundary alike — String(a) === String(b) is id-equality-preserving
  // (numbers still match numbers) so the blanket rule costs nothing.
  const files = fs.readdirSync(SITE).filter(f => f.endsWith('.js'));
  const offenders = [];
  files.forEach(f => {
    const src = fs.readFileSync(path.join(SITE, f), 'utf8');
    src.split('\n').forEach((line, i) => {
      if (!/\.internalId [!=]==/.test(line)) return;
      const st = line.trim();
      if (st.startsWith('//') || st.startsWith('*')) return;
      // a line is clean when every strict comparison on it is String()-wrapped
      const bare = line.replace(/String\([^)]*\.internalId\)\s*[!=]==\s*String\([^)]*\)/g, '');
      if (/\.internalId [!=]==/.test(bare)) offenders.push(f + ':' + (i + 1));
    });
  });
  check('ZERO uncoerced strict .internalId comparisons across every served JS file',
    offenders.length === 0,
    offenders.slice(0, 6).join(', ') + (offenders.length > 6 ? ' +' + (offenders.length - 6) + ' more' : '') +
    ' — each is a silent dead control on numeric-id rows');
  // the reported symptom, executed: openFhaChartModal's find with the quoted onclick id
  const chart = fn(bindings, 'openFhaChartModal') || (() => {
    const i = bindings.indexOf('window.openFhaChartModal = function');
    if (i < 0) return null;
    let d = 0, s = false;
    for (let k = bindings.indexOf('{', i); k < bindings.length; k++) {
      if (bindings[k] === '{') { d++; s = true; }
      else if (bindings[k] === '}') { d--; if (s && d === 0) return bindings.slice(i, k + 1); }
    }
    return null;
  })();
  check('openFhaChartModal is extractable', !!chart);
  check('…and its find matches a NUMERIC row from the quoted onclick id', (() => {
    if (!chart) return false;
    const i = chart.indexOf('acFhaData.find(');
    const j = chart.indexOf(');', i);
    if (i < 0 || j < 0) return false;
    const pred = vm.runInContext('(' + chart.slice(i + 'acFhaData.find('.length, j) + ')',
      vm.createContext({ internalId: '1001', String }));
    return pred({ internalId: 1001 }) === true;
  })(), 'openFhaChartModal("1001","ac") vs internalId 1001 — the dead chart button, live-measured');
  check('deleteACFHA coerces too — delete was the unreported third symptom',
    /acFhaData\.filter\(x => String\(x\.internalId\) !== String\(iId\)\)/.test(helpers));
}

console.log('\n[pins] it actually loads');
{
  const pin = (f, floor) => { const m = idx.match(new RegExp(f.replace('.', '\\.') + '\\?v=([\\d.]+)')); return m && parseFloat(m[1]) >= floor; };
  check('helpers_modules.js >= 2.53', pin('helpers_modules.js', 2.54));
  check('data_ops_modules.js >= 66.18', pin('data_ops_modules.js', 66.18));
  check('safety_lab.js >= 65.44', pin('safety_lab.js', 65.45));
  check('fta_quant_modules.js >= 66.15', pin('fta_quant_modules.js', 66.16));
  check('bindings_modules.js >= 1.27', pin('bindings_modules.js', 1.28));
  check('ai_loader.js >= 5.7 in index.html (the pin behind the pin)', pin('ai_loader.js', 5.8));
  check('ai_assistant.js >= 73.5 in the loader', (() => {
    const m = loader.match(/ai_assistant\.js\?v=([\d.]+)/); return m && parseFloat(m[1]) >= 73.6;
  })());
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
