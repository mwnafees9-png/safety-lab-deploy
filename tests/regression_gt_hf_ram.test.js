#!/usr/bin/env node
/*
 * Regression — Golden Thread right column: Human Factors + RAM linkage (9 Sep 2026).
 *
 * _gtHFSection(fha) and _gtRAMSection(fha) build the two new right-column sections of the
 * hazard thread. They must: match HF human-error / crew-alert rows to THIS failure condition by
 * fcId (comma list), surface the function allocation, flag crew-error-without-allocation, filter
 * the RAM chains to this FC and count their gaps, and NEVER throw into the render (fail-soft).
 *
 * The two functions are extracted from fta_view_modules.js by brace-matching and executed in a vm
 * with stubbed esc/_gtStage/_gtChip so the checks assert real behavior. Mutation at the end must
 * go red by exit code.
 *
 * Run: node tests/regression_gt_hf_ram.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'fta_view_modules.js'), 'utf8');

function extract(name, src) {
  const sig = 'function ' + name + '(';
  const i = src.indexOf(sig); if (i < 0) throw new Error('not found: ' + name);
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { k++; break; } } }
  return src.slice(i, k);
}

function ctx(over) {
  const c = {
    console, String, Array, Object, JSON, Math, Boolean,
    esc: (s) => String(s == null ? '' : s),
    _gtChip: (t, k) => '[chip:' + t + ':' + k + ']',
    _gtStage: (title, body, status) => JSON.stringify({ title, body, status }),
    projectConfig: over.projectConfig || {},
  };
  c.window = over.window || {};
  return vm.createContext(c);
}
function run(fnSrc, callSrc, over) {
  const c = ctx(over);
  vm.runInContext(fnSrc + '\n;globalThis.__out = ' + callSrc + ';', c);
  return c.__out;
}

const HF = extract('_gtHFSection', SRC);
const RAM = extract('_gtRAMSection', SRC);

console.log('[gt-hf] human-error + alerts match by fcId; allocation shown');
{
  const pc = { hf: {
    alloc:  { rows: [{ subId: 'SF-04', allocation: 'shared', rationale: 'crew monitors autothrottle' }] },
    hea:    { rows: [{ heaId: 'HEA-001', task: 'restart engine', errorMode: 'omission', detection: 'EICAS', recovery: 'checklist', fcIds: 'FC-PRP01, FC-PRP02' },
                     { heaId: 'HEA-009', task: 'irrelevant', errorMode: 'commission', detection: '', recovery: '', fcIds: 'FC-OTHER' }] },
    alerts: { rows: [{ alertId: 'ALR-002', name: 'ENG FAIL', priority: 'Warning', modality: 'aural', fcIds: 'FC-PRP01' }] }
  } };
  const out = run(HF, "_gtHFSection({fcId:'FC-PRP01', subId:'SF-04'})", { projectConfig: pc });
  const st = JSON.parse(out.html);
  check('title is Human factors', st.title === 'Human factors');
  check('shows the allocation (shared)', /allocation <strong>shared/.test(st.body), st.body);
  check('includes the matching human-error row HEA-001', st.body.indexOf('HEA-001') >= 0);
  check('excludes the non-matching row HEA-009 (FC-OTHER)', st.body.indexOf('HEA-009') < 0);
  check('includes the matching crew alert ALR-002', st.body.indexOf('ALR-002') >= 0);
  check('no warns when allocation present + detection/recovery filled', out.warns === 0, 'warns=' + out.warns);
}

console.log('[gt-hf] crew-error-without-allocation + missing detection/recovery -> warns');
{
  const pc = { hf: {
    alloc:  { rows: [] },   // no allocation for SF-04
    hea:    { rows: [{ heaId: 'HEA-001', task: 't', errorMode: 'omission', detection: '', recovery: '', fcIds: 'FC-PRP01' }] },
    alerts: { rows: [] }
  } };
  const out = run(HF, "_gtHFSection({fcId:'FC-PRP01', subId:'SF-04'})", { projectConfig: pc });
  check('crew error but no allocation -> at least one warn + allocate chip', out.warns >= 1 && JSON.parse(out.html).body.indexOf('[chip:allocate:warn]') >= 0, JSON.stringify(out));
  check('missing detection/recovery adds a warn chip', JSON.parse(out.html).body.indexOf('no detection/recovery') >= 0);
}

console.log('[gt-hf] nothing linked -> graceful, no warns');
{
  const out = run(HF, "_gtHFSection({fcId:'FC-NONE', subId:'SF-99'})", { projectConfig: { hf: {} } });
  check('empty HF -> "No human-factors analysis linked" + 0 warns', /No human-factors analysis/.test(JSON.parse(out.html).body) && out.warns === 0);
}

console.log('[gt-ram] filters chains to this FC and counts gaps');
{
  const win = { ramTraceRows: () => ([
    { ref: 'BE-12', item: { itemId: 'LRU-3', name: 'FADEC' }, tasks: [{ id: 't1', name: 'BIT check', interval: 500 }], field: [{}], mmel: [{ category: 'C' }], msg3: [], gaps: [], fcs: [{ fcId: 'FC-PRP01' }] },
    { ref: 'BE-99', item: null, tasks: [], field: [], mmel: [], msg3: [], gaps: ['no maintenance task'], fcs: [{ fcId: 'FC-PRP01' }] },
    { ref: 'BE-XX', item: null, tasks: [], field: [], mmel: [], msg3: [], gaps: [], fcs: [{ fcId: 'FC-OTHER' }] }
  ]) };
  const out = run(RAM, "_gtRAMSection({fcId:'FC-PRP01'})", { window: win });
  const st = JSON.parse(out.html);
  check('title is Reliability & maintainability', /Reliability/.test(st.title));
  check('includes FC-PRP01 chain BE-12 + its item', st.body.indexOf('BE-12') >= 0 && st.body.indexOf('LRU-3') >= 0);
  check('excludes the FC-OTHER chain BE-XX', st.body.indexOf('BE-XX') < 0);
  check('a chain with gaps produces a warn', out.warns === 1, 'warns=' + out.warns);
}

console.log('[gt-ram] fail-soft: resolver throws / absent -> unavailable, no throw');
{
  let threw = false, out = null;
  try { out = run(RAM, "_gtRAMSection({fcId:'FC-PRP01'})", { window: { ramTraceRows: () => { throw new Error('boom'); } } }); }
  catch (_) { threw = true; }
  check('resolver throwing never throws out of the section', threw === false);
  check('degrades to "unavailable"', out && /unavailable/.test(JSON.parse(out.html).body));
  const out2 = run(RAM, "_gtRAMSection({fcId:'FC-PRP01'})", { window: {} });
  check('no resolver -> "No reliability / maintainability chain"', /No reliability/.test(JSON.parse(out2.html).body) && out2.warns === 0);
}

// -------------------------------------------------------------- MUTATION GUARD
console.log('[gt] mutation guard (RAM fcId filter must actually filter)');
{
  const mutated = RAM.replace("return String(f.fcId) === fcId;", "return true;");
  const win = { ramTraceRows: () => ([{ ref: 'BE-XX', item: null, tasks: [], field: [], mmel: [], msg3: [], gaps: [], fcs: [{ fcId: 'FC-OTHER' }] }]) };
  const out = run(mutated, "_gtRAMSection({fcId:'FC-PRP01'})", { window: win });
  const leaked = JSON.parse(out.html).body.indexOf('BE-XX') >= 0;
  check('MUTATION (drop fcId filter) would leak another FC\'s chain -> guarded here', leaked === true);
}

console.log('\n[gt-hf-ram] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
