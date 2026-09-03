#!/usr/bin/env node
/*
 * Regression — the AI/ML learning-assurance lane (#8–#13, increment 1).
 *
 * This lane assures somebody else's ML constituent under ARP6983 / ED-324. It
 * is a different axis from every other AI file in the product, all of which are
 * OUR governed AI drafting for the engineer.
 *
 * Two things this suite defends above all:
 *
 *   1. PERSISTENCE IN ALL THREE SERIALISERS. On 31 Jul the STPA lane was found
 *      to exist in only one — _slabBuildProjectExport — so the entire lane was
 *      never pushed to the cloud and never autosaved, and both load paths turned
 *      the missing key into a silent empty reset. mlData must not repeat it.
 *
 *   2. THE HONEST LIMITS. The lane records and traces; it must never compute an
 *      accuracy, a loss or a representativeness score, and must never derive an
 *      assurance level from severity. A safety tool inventing those hands the
 *      engineer a number they cannot defend in a review.
 *
 * Run: node tests/regression_ml_assurance.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const ml    = S('ml_assurance.js');
const pp    = S('program_plan.js');
const bind  = S('bindings_modules.js');
const help  = S('helpers_modules.js');
const misc  = S('misc_fn_modules.js');
const dops  = S('data_ops_modules.js');
const sup   = S('support_modules.js');
const idx   = S('index.html');

function fnBody(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ---- the lane --------------------------------------------------------------
check('an ml group exists', /\{ id: 'ml',\s+label: 'AI\/ML learning assurance' \}/.test(pp));
check('the mlas lane is in the catalogue', /\{ id: 'mlas',\s+group: 'ml'/.test(pp));
check('the lane is opt-in', /id: 'mlas'[\s\S]{0,320}?optIn: true/.test(pp));
check('no certification basis turns it on by default', /id: 'mlas'[\s\S]{0,320}?expected: \[\]/.test(pp),
  'ARP6983 / ED-324 is not an accepted means of compliance — nothing should force this lane on');
check('the lane cites the standard', /ARP6983 \/ ED-324/.test(pp));

// ---- the view is registered where switchTab can HIDE it --------------------
check("'mlas' is in the switchTab registry", /'ipledger', 'mlas'/.test(sup),
  'a view missing from that array is a view switchTab cannot hide — it stacks onto every other lane');
check('index.html has the view container', /<div id="view-mlas"/.test(idx));
check('index.html has the nav entry', /id="snav-mlas"/.test(idx));
check('index.html loads the module', /src="ml_assurance\.js/.test(idx));
check('the module loads after program_plan.js',
  idx.indexOf('ml_assurance.js') > idx.indexOf('program_plan.js'));
check('the module renders on arrival', /tabId === 'mlas'/.test(ml));
check('the switchTab wrap is guarded against a double wrap', /_mlasWrapped/.test(ml));
check('the wrap preserves the STPA flag it may be chaining onto', /orig\._stpaWrapped/.test(ml),
  'clobbering it would silently re-wrap and double-render the STPA panel');

// ---- persistence: the stpaData lesson, applied ----------------------------
check('mlData is declared', /let mlData = \{ constituents: \[\]/.test(bind));
// Pinning the whole literal broke the moment the store grew a register, which
// is the wrong failure — assert the KEYS each new register needs instead, so
// this survives increment 3 and still catches a register that never lands.
['monitors', 'capture', 'captureEnabled'].forEach(k => {
  check('the declared store carries ' + k, new RegExp('let mlData = \\{[^;]*\\b' + k + '\\b').test(bind));
  check('a new project resets ' + k, new RegExp('mlData = \\{[^;]*\\b' + k + '\\b').test(misc));
  check('the primary load fallback carries ' + k, new RegExp('mlData = \\(data\\.mlData[^;]*\\b' + k + '\\b').test(dops));
  check('_mlDefault carries ' + k, new RegExp('_mlDefault\\(\\)[\\s\\S]{0,400}?\\b' + k + '\\b').test(ml));
});
// 20 Aug 2026 — see the same note in regression_stpa_persistence: a serialiser may
// satisfy this by naming the store, or by deriving from project_stores.js provided the
// store is in that list. Deriving is what makes the drift impossible.
const _psrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'site', 'project_stores.js'), 'utf8');
const _STORE_KEYS = [..._psrc.matchAll(/\{ key: '([A-Za-z_$][\w$]*)'/g)].map(m => m[1]);
check('project_stores.js declares mlData as a project store', _STORE_KEYS.includes('mlData'));
[['_slabBuildProjectExport', misc, 'the .slab / desktop export'],
 ['_buildProjectSnapshot',   help, 'the cloud push'],
 ['_snapshotProject',        help, 'the local autosave and dirty check']].forEach(([fn, src, what]) => {
  const b = code(fnBody(src, fn));
  check(fn + ' serialises mlData — ' + what,
    /\bmlData\b/.test(b) || (/\bSLStores\.snapshot\(\)/.test(b) && _STORE_KEYS.includes('mlData')),
    'one serialiser is not enough — that is exactly how the STPA lane went missing');
});
check('_restoreProjectSnapshot rehydrates mlData', /\bmlData\b/.test(code(fnBody(help, '_restoreProjectSnapshot'))));
check('the primary load path rehydrates mlData',
  /mlData = \(data\.mlData && Array\.isArray\(data\.mlData\.constituents\)\)/.test(dops));
check('a new project resets mlData', /mlData = \{ constituents: \[\]/.test(misc));

// ---- the honest limits -----------------------------------------------------
// These two checks must look at LOGIC, not prose. The honest-limit copy in the
// UI necessarily contains the words "accuracy" and "severity" — it is the text
// promising we do NOT use them. A naive word search would force us to delete
// the very disclaimer that makes the point, so strip string literals too.
const logic = s => code(s)
  .replace(/`(?:\\.|[^`\\])*`/g, '``')
  .replace(/'(?:\\.|[^'\\])*'/g, "''")
  .replace(/"(?:\\.|[^"\\])*"/g, '""');
const mlLogic = logic(ml);
check('no metric is computed anywhere in the lane',
  !/\b(accuracy|precision|recall|auc|f1)\s*[:=]/i.test(mlLogic) && !/computeScore|\bscore\s*=/i.test(mlLogic),
  'the lane records and traces; metrics belong to the ML toolchain');
check('the assurance level is never derived from severity',
  !/severity/i.test(mlLogic),
  'levels are DECLARED — deriving one would pre-empt the standard\'s own open question');
check('the disclaimer prose that names those words is still present',
  /No accuracy, loss or representativeness score is computed here/.test(ml) &&
  /never derived from severity/.test(ml),
  'the limits must be stated to the user, not just honoured in code');
check('the UI states what the lane will not do', /What this lane will not do/.test(ml));
check('the UI says the standard is not a means of compliance',
  /not by itself an accepted means of compliance/.test(ml));
check('test-set independence is stored as an assertion, not a calculation',
  /ENGINEER'S\n\s*\/\/ ASSERTION|independence from training is not asserted/.test(ml));

// ---- behaviour -------------------------------------------------------------
const ctx = { window: {}, document: undefined, console };
ctx.window.document = undefined;
vm.createContext(ctx);
vm.runInContext(ml.replace("if (typeof window === 'undefined') return;", ''), ctx, { filename: 'ml.js' });
const API = ctx.window.ML_ASSURANCE;
check('the module registers ML_ASSURANCE', !!API && typeof API.addConstituent === 'function');

if (API) {
  ctx.mlData = API._mlDefault();
  vm.runInContext('this.mlData = mlData;', ctx);
  // rebind the module's DATA() to our store
  ctx.mlData = API._mlDefault();
  const findingsOf = () => API.findings();

  check('an empty register still names the three missing datasets',
    findingsOf().filter(f => /No (training|validation|test) dataset/.test(f.text)).length === 3,
    JSON.stringify(findingsOf().map(f => f.text)));

  API.addOdd('Visibility', '800-10000', 'm', 'Cert basis approach minima');
  check('an ODD entry is minted with an ODD- id', ctx.mlData.odd.length === 1 && /^ODD-\d{3}$/.test(ctx.mlData.odd[0].id),
    JSON.stringify(ctx.mlData.odd[0] || null));
  API.addOdd('', '1-2', '', '');
  check('an ODD entry without a dimension is refused', ctx.mlData.odd.length === 1);
  API.addOdd('Rainfall', '', '', '');
  check('an ODD dimension without a range is refused', ctx.mlData.odd.length === 1,
    'a dimension with no range declares nothing');

  const oddId = ctx.mlData.odd[0].id;
  API.addConstituent('Runway detector', 'SF-07', 'AL2', oddId, '');
  check('a constituent is minted with an MLC- id', /^MLC-\d{3}$/.test(ctx.mlData.constituents[0].id));
  API.addConstituent('Bad level', 'SF-08', 'AL9', oddId, '');
  check('an unknown assurance level falls back to "not set"',
    ctx.mlData.constituents[1].level === 'not set');

  API.addDataset('Approach imagery', 'training', 'flight test 2026', oddId, 'covers the declared visibility band', false);
  API.addDataset('Held-out set', 'test', 'flight test 2026', oddId, 'same distribution', false);
  check('a test set without asserted independence is flagged',
    findingsOf().some(f => /independence from training is not asserted/.test(f.text)));
  API.addDataset('Bad role', 'holdout', 'x', oddId, 'y', true);
  check('an unknown dataset role is refused', ctx.mlData.datasets.length === 2);

  API.remove('odd', oddId);
  check('an ODD cited by a dataset or constituent cannot be removed',
    ctx.mlData.odd.length === 1, 'removing it would leave dangling references');
}

// ============================================================================
// #11 — in-service monitoring
// ============================================================================
check('the register is rendered as its own section', /4 · In-service monitoring/.test(ml));
check('the UI repeats that the tool does not classify drift',
  /does not classify drift/i.test(ml) && /verdict you reached/i.test(ml),
  'the verdict is the engineer\'s; the tool must not appear to be making it');
check('no divergence or drift metric is computed',
  !/\b(divergence|kl_?div|psi|drift_?score|wasserstein)\s*[:=(]/i.test(mlLogic),
  'a drift number invented at this layer would be indefensible');
check('the FRACAS link is a reference, not a copy',
  /fracasRef/.test(ml) && !/incidents\s*:\s*JSON\.parse|slice\(\)\s*;\s*\/\/ copy/.test(ml),
  'copying the incident would give two truths that drift apart');
check('fracasIncidents reads the case manager rather than storing its own',
  /projectConfig[\s\S]{0,80}?ram[\s\S]{0,40}?fieldRows/.test(fnBody(ml, 'fracasIncidents')));

// ============================================================================
// #12 — expert-correction capture
// ============================================================================
check('the capture panel is rendered as its own section', /5 · Expert-correction capture/.test(ml));
check('the UI states capture is off by default and per project',
  /off by default · per project/.test(ml));
check('the UI states nothing is transmitted',
  /is not transmitted anywhere/.test(ml) && /nothing in the product trains on it today/.test(ml),
  'the claim on screen has to match what the code does, which is store it in the project');
check('nothing in the lane transmits anything',
  !/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|\.from\s*\(\s*''/.test(mlLogic),
  'a capture register that phones home is the failure mode worth engineering against');
check('the export-controlled refusal is stated on screen, not just enforced',
  /flagged export-controlled/.test(ml) && /controlled technical data/.test(ml));
check('the checkbox is disabled when capture is not allowed',
  /capOK \? '' : ' disabled'/.test(ml));
check('records captured before the flag are still shown, not hidden',
  /captured before this project was flagged/.test(ml) && /still in the project file/.test(ml),
  'a project can be marked export-controlled AFTER corrections exist — making them vanish from the screen while they sit in the project file is the worse failure');

// ============================================================================
// behaviour — #11 and #12
// ============================================================================
if (API) {
  // ---- a fresh store, and a projectConfig the module can see ---------------
  ctx.mlData = API._mlDefault();
  vm.runInContext('var projectConfig = { isITARControlled: false, ram: { fieldRows: [] } };', ctx);

  API.addOdd('Visibility', '800-10000', 'm', 'approach minima');
  const odd2 = ctx.mlData.odd[0].id;
  API.addConstituent('Runway detector', 'SF-07', 'AL2', odd2, '');
  const mlc2 = ctx.mlData.constituents[0].id;

  check('a constituent with no observation is flagged advisory',
    API.findings().some(f => f.sev === 'advisory' && /No in-service observation/.test(f.text)));

  API.addMonitor('MLC-999', odd2, 'flight test', 'saw something', 'watch', '', '');
  check('an observation against an unknown constituent is refused', ctx.mlData.monitors.length === 0,
    'an observation that points at nothing is a finding about nothing');

  API.addMonitor(mlc2, odd2, 'flight test', '', 'watch', '', '');
  check('an observation with nothing observed is refused', ctx.mlData.monitors.length === 0);

  API.addMonitor(mlc2, odd2, 'flight test', 'missed threshold in haze', 'probably fine', '', '');
  check('an unknown verdict is refused', ctx.mlData.monitors.length === 0,
    'the verdict vocabulary is the whole point of the column');

  API.addMonitor(mlc2, odd2, 'flight test', 'missed threshold in haze', 'outside ODD', 'short', '');
  check('"outside ODD" without a real rationale is refused', ctx.mlData.monitors.length === 0,
    'it is a claim a reviewer will ask you to justify, not a tick');

  API.addMonitor(mlc2, odd2, 'flight test', 'missed threshold in haze', 'outside ODD',
                 'RVR 600 m, below the 800 m floor this constituent was declared valid within', '');
  check('a justified "outside ODD" observation is recorded',
    ctx.mlData.monitors.length === 1 && /^MON-\d{3}$/.test(ctx.mlData.monitors[0].id),
    JSON.stringify(ctx.mlData.monitors[0] || null));
  check('an unknown source falls back rather than being stored raw',
    (function () {
      API.addMonitor(mlc2, odd2, 'a hunch', 'noted', 'watch', '', '');
      return ctx.mlData.monitors[1] && ctx.mlData.monitors[1].source === 'operator report';
    })());
  check('an "outside ODD" observation opens a finding',
    API.findings().some(f => f.sev === 'open' && /does not currently hold/.test(f.text)));
  check('the advisory clears once the constituent is being watched',
    !API.findings().some(f => /No in-service observation/.test(f.text)));

  API.remove('constituents', mlc2);
  check('a constituent cited by an observation cannot be removed',
    ctx.mlData.constituents.length === 1);
  API.remove('odd', odd2);
  check('an ODD cited by an observation cannot be removed', ctx.mlData.odd.length === 1);

  // ---- #12 ----------------------------------------------------------------
  check('capture is off in a fresh store', ctx.mlData.captureEnabled === false,
    'nothing is captured until somebody deliberately turns it on for this project');
  check('recordCorrection is a silent no-op while capture is off',
    API.recordCorrection('fha-draft', 'a', 'b', 'Eng', '') === false && ctx.mlData.capture.length === 0);

  check('capture is allowed on an uncontrolled project', API.captureAllowed() === true);
  check('turning capture on works there', API.setCaptureEnabled(true) === true && ctx.mlData.captureEnabled === true);
  check('a real correction is recorded',
    API.recordCorrection('fha-draft', 'Loss of thrust', 'Loss of all thrust', 'W Nafees', 'scope') === true &&
    ctx.mlData.capture.length === 1 && /^CAP-\d{3}$/.test(ctx.mlData.capture[0].id));
  check('accepting a draft unchanged is not a correction',
    API.recordCorrection('fha-draft', 'same text', 'same text', 'W Nafees', '') === false &&
    ctx.mlData.capture.length === 1);
  check('an empty pair is not a correction',
    API.recordCorrection('fha-draft', '', '', 'W Nafees', '') === false && ctx.mlData.capture.length === 1);

  // ---- the export-control gate --------------------------------------------
  vm.runInContext('projectConfig.isITARControlled = true;', ctx);
  check('capture is not allowed on an export-controlled project', API.captureAllowed() === false);
  check('turning capture on is REFUSED on an export-controlled project',
    API.setCaptureEnabled(true) === false && ctx.mlData.captureEnabled === false,
    'corrections to controlled technical data are controlled technical data');
  const before = ctx.mlData.capture.length;
  check('recordCorrection captures nothing once the project is export-controlled',
    API.recordCorrection('fha-draft', 'x', 'y', 'W Nafees', '') === false &&
    ctx.mlData.capture.length === before);
  check('a correction captured before the flag is not deleted by the flag',
    ctx.mlData.capture.length === 1, 'suppressing it in the UI would hide data that is still in the project file');
  API.remove('capture', ctx.mlData.capture[0].id);
  check('a captured correction can be removed', ctx.mlData.capture.length === 0);
  vm.runInContext('projectConfig.isITARControlled = false;', ctx);
  check('the flag stays off after a refusal — it is not silently restored',
    ctx.mlData.captureEnabled === false);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
