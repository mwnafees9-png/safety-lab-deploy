#!/usr/bin/env node
/*
 * Regression — L1: an SFHA row belongs to a SYSTEM FUNCTION.
 *   The workbook form has written funcIds into row.subId since the pairing
 *   guard; row.sysFuncId is now recorded explicitly on save. Seed-era rows
 *   keyed to an aircraft sub-function surface an amber re-key control in the
 *   workbook (suggested from the system-FCIM join), signed, with provenance on
 *   the row — and the A10 interdependence derivation honours the key through
 *   _sysFhaFuncKey in both directions (function-level vs coarse).
 *   Loads the REAL fn_resolver + helpers_modules and executes the flows.
 * Run: node tests/regression_sfha_rekey.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

globalThis.window = globalThis;
globalThis.SLEnv = { get: n => globalThis[n] };
globalThis.projectConfig = {};
globalThis.acFhaData = [{ internalId: 7101, subId: 'SF-01', fcId: 'FC-AC01', severity: 'Catastrophic' }];
globalThis.acFunctionsData = [{ subId: 'SF-01', subName: 'Control pitch' }];
globalThis.systemsData = [
  { id: 'sys-fcs', name: 'Flight control',
    functions: [{ funcId: 'SFN-FCS1', funcName: 'Command surfaces', traceIds: [] }, { funcId: 'SFN-FCS2', funcName: 'Provide feel', traceIds: [] }],
    extractedFCs: [{ id: 'FC-FCS01', subId: 'SFN-FCS1' }],
    fha: [
      { internalId: 1, subId: 'SF-01', fcId: 'FC-FCS01', fcDesc: 'Loss of pitch output', severity: 'Catastrophic', acTrace: 'FC-AC01' },  // LEGACY key
      { internalId: 2, subId: 'SFN-FCS2', fcId: 'FC-FCS02', fcDesc: 'Erroneous feel', severity: 'Hazardous', acTrace: '' },              // FORM-written key
      { internalId: 3, subId: 'SF-01', sysFuncId: 'SFN-FCS1', fcId: 'FC-FCS03', fcDesc: 'Explicitly keyed', severity: 'Major', acTrace: '' },
    ] },
];
globalThis.resourcesData = [];
globalThis.itemsData = [];
globalThis.flightPhasesData = [];
globalThis.routingData = [];
globalThis.ftaPages = [];
globalThis.commitSaveChanges = () => {};
globalThis._autosaveSuspended = false;
globalThis._autosaveLastWrite = 0;
globalThis._dirtySinceSave = false;
globalThis._autosaveDiskAvailable = false;
globalThis._autosaveLastDiskWrite = 0;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.scheduleAutosave = () => {};
const toasts = [];
globalThis.showToast = m => toasts.push(String(m));
globalThis.renderSysFHA = () => {};
// the eval'd REAL renderSysFHA shadows the stub above; sys() (defined in
// safety_lab.js, not eval'd) returning null makes it early-return safely.
globalThis.sys = () => null;
globalThis.renderFhaPhaseGrid = () => {};
globalThis.renderInterdepPage = () => {};
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} }), addEventListener: () => {}, querySelectorAll: () => [], body: { appendChild: () => {} } };

(0, eval)(['fn_resolver.js', 'helpers_modules.js', 'misc_fn_modules.js'].map(f => S(f)).join('\n;\n'));
const G = globalThis;
const SYS = systemsData[0];
check('machinery loaded', typeof G._sysFhaFuncKey === 'function' && typeof G.sysFhaRekey === 'function' && typeof G._sysFhaFcimSuggestion === 'function');

// ---- the key resolution, executed -------------------------------------------
check('explicit sysFuncId wins', G._sysFhaFuncKey(SYS, SYS.fha[2]) === 'SFN-FCS1');
check('a form-written funcId in subId IS the key', G._sysFhaFuncKey(SYS, SYS.fha[1]) === 'SFN-FCS2');
check('a legacy aircraft sub-function id is NOT a key', G._sysFhaFuncKey(SYS, SYS.fha[0]) === null);
check('the FCIM join suggests the owning function for a legacy row', G._sysFhaFcimSuggestion(SYS, SYS.fha[0]) === 'SFN-FCS1');
check('no suggestion when the FCIM has no row for the FC', G._sysFhaFcimSuggestion(SYS, SYS.fha[1]) === null);

// ---- display ----------------------------------------------------------------
check('display resolves an aircraft sub-function (unchanged)', G._fhaSubFunctionDisplay('SF-01') === 'Control pitch');
check('display resolves a SYSTEM function to its name (no raw SFN- ids in the workbook)',
  G._fhaSubFunctionDisplay('SFN-FCS2') === 'Provide feel');

// ---- A10 integration: the derivation honours the key both ways --------------
check('a keyed row (via subId convention) is NOT a coarse system-level fact',
  (() => { const d = G._idpDerivedSysOnly(acFhaData[0], 'sys-fcs'); return !(d && d.kind === 'sfha' && SYS.fha[0].sysFuncId); })());
check('the legacy row (unkeyed) IS the coarse sfha fact today',
  (G._idpDerivedSysOnly(acFhaData[0], 'sys-fcs') || {}).kind === 'sfha');
check('after keying, the same trace derives on the FUNCTION column',
  (() => { SYS.fha[0].sysFuncId = 'SFN-FCS1';
           const fn = G._idpDerivedFn(acFhaData[0], 'SFN-FCS1');
           const coarse = G._idpDerivedSysOnly(acFhaData[0], 'sys-fcs');
           delete SYS.fha[0].sysFuncId;
           return fn && fn.kind === 'sfha' && !coarse; })());

// ---- the signed re-key flow, executed ---------------------------------------
(async () => {
  globalThis._signoffReviewerName = () => 'W. Nafees';
  globalThis.slPrompt = async () => 'W. Nafees';
  await G.sysFhaRekey('sys-fcs', 1, 'SFN-FCS1');
  const row = SYS.fha[0];
  check('re-key sets subId AND sysFuncId to the function', row.subId === 'SFN-FCS1' && row.sysFuncId === 'SFN-FCS1');
  check('re-key records signed provenance with the old key', row.rekeyed && row.rekeyed.from === 'SF-01' && row.rekeyed.by === 'W. Nafees');
  check('the aircraft trace is untouched', row.acTrace === 'FC-AC01');
  check('the row now resolves as keyed', G._sysFhaFuncKey(SYS, row) === 'SFN-FCS1');
  check('…and the coarse sfha fact is gone (refined onto the function)',
    !G._idpDerivedSysOnly(acFhaData[0], 'sys-fcs') && (G._idpDerivedFn(acFhaData[0], 'SFN-FCS1') || {}).kind === 'sfha');

  // blank signature = no change
  row.subId = 'SF-01'; delete row.sysFuncId; delete row.rekeyed;
  globalThis.slPrompt = async () => '';
  await G.sysFhaRekey('sys-fcs', 1, 'SFN-FCS1');
  check('blank signature changes nothing', row.subId === 'SF-01' && !row.sysFuncId && !row.rekeyed);

  // ---- workbook + submit statics --------------------------------------------
  const H = S('helpers_modules.js');
  check('workbook renders the re-key control on legacy-keyed rows',
    /keyed to aircraft sub-function/.test(H) && /sysFhaRekey\('\$\{esc\(sys\(\)\.id\)\}/.test(H));
  check('the FCIM suggestion is labelled in the select', /\(FCIM match\)/.test(H));
  check('the form submit records sysFuncId explicitly',
    /sysFuncId: document\.getElementById\('sys-fha-subfunc'\)\.value/.test(H));
  check('the sfha derivation goes through _sysFhaFuncKey in BOTH directions',
    (H.match(/_sysFhaFuncKey\((own\.system|sys), f\)/g) || []).length === 2);
  // ---- golden thread: the SYSTEM lane names the function --------------------
  // EXECUTED against the real _gtvBuildGraph (extracted region), on the exact
  // shape the live bug hid in: _gtvSystemsForFc returns shallow {id,name}
  // objects, so the AC-path lookup must resolve the FULL system record.
  const GT = S('fta_view_modules.js');
  check('golden thread resolves funcId-keyed SFHA rows in the function lane',
    /f\.subId === subId \|\| f\.funcId === subId/.test(GT));
  const ga = GT.indexOf('function _gtvSystemsForFc');
  const gb = GT.indexOf('function _gtvLayout');
  check('gtv region extracts cleanly', ga > 0 && gb > ga);
  const gtFactory = new Function(
    'systemsData', 'acFhaData', 'acFunctionsData', 'zsaData', 'praData', 'fmeaData',
    'cmaData', 'ftaPages', 'acReqData', 'stpaData', '_sysFhaFuncKey',
    GT.slice(ga, gb) + '\n return _gtvBuildGraph;');
  const gtBuild = (systems, acFha) => gtFactory(systems, acFha,
    [{ subId: 'SF-01', subName: 'Control pitch' }], [], [], [], [], [], [], [], G._sysFhaFuncKey)({});
  // Live-bug repro: legacy-only SFHA rows; the function names itself only via
  // the aircraft-row traceIds fallback — which the bug starved of .functions.
  const gtG = gtBuild(
    [{ id: 'gt-fcs', name: 'Flight control',
       functions: [{ funcId: 'SFN-GT1', funcName: 'Command surfaces', traceIds: ['SF-01'] }],
       fha: [{ internalId: 21, subId: 'SF-01', fcId: 'FC-GT01', severity: 'Catastrophic', acTrace: 'FC-AC01' }] }],
    [{ internalId: 7201, subId: 'SF-01', fcId: 'FC-AC01', severity: 'Catastrophic' }]);
  const gtSys = gtG.nodes.find(n => n.kind === 'sys' && n.id === 'gt-fcs');
  check('AC rows subtitle the SYSTEM node with the tracing function (the live gtFnSubtitled:0 bug)',
    !!gtSys && gtSys.sub === 'Fn · Command surfaces', JSON.stringify(gtSys && gtSys.sub));
  // The SYS-domain path: a row keyed to a function of a system whose functions
  // trace nothing — only _sysFhaFuncKey can name it.
  const gtG2 = gtBuild(
    [{ id: 'gt-hyd', name: 'Hydraulics',
       functions: [{ funcId: 'SFN-GT2', funcName: 'Provide pressure', traceIds: [] }],
       fha: [{ internalId: 22, subId: 'SFN-GT2', fcId: 'FC-GT02', severity: 'Hazardous' }] }], []);
  const gtSys2 = gtG2.nodes.find(n => n.kind === 'sys' && n.id === 'gt-hyd');
  check('SYS rows subtitle their own node via the row function key',
    !!gtSys2 && gtSys2.sub === 'Fn · Provide pressure', JSON.stringify(gtSys2 && gtSys2.sub));
  check('…and a generic System subtitle upgrades in place when the function is learned',
    /nn\.sub === 'System' \|\| !nn\.sub/.test(GT));
  check('…guarded — the thread never hard-depends on the helper', /typeof _sysFhaFuncKey === 'function'/.test(GT));

  const idx = S('index.html');
  check('helpers pinned at 2.46 or later',
    parseFloat((idx.match(/helpers_modules\.js\?v=([0-9.]+)/) || [])[1] || '0') >= 2.46);
  check('fta_view pinned at 66.32 or later (gt full-system fix)',
    parseFloat((idx.match(/fta_view_modules\.js\?v=([0-9.]+)/) || [])[1] || '0') >= 66.32);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
