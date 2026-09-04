#!/usr/bin/env node
/**
 * Regression — F16a: THE INTERDEPENDENCE SWEEP LANDED NOTHING ON RUN 2 (4 Sep 2026).
 * 27 candidate functions per condition; maxTokens 1200; the reply was cut off mid-JSON; the parse
 * failed silently; 25 calls, 0 proposals, 0 failures reported.
 *   · the token budget is sized to the candidate count;
 *   · a cut-off reply is SALVAGED (complete cell entries kept) and REPORTED as a failure;
 *   · the toast and window.__idpSweepLast carry the reason; the harness keeps the log.
 * Run: node tests/regression_idp_sweep_truncation.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(SITE, 'interdep_ai.js'), 'utf8');
const drv = fs.readFileSync(path.join(__dirname, '..', 'eval', 'golden_thread_driver.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }

console.log('[1] source');
{
  check('the budget grows with the candidate count and is capped', /function _sweepBudget\(nCandidates\)/.test(src) && /maxTokens: _sweepBudget\(wk\.empty\.length\)/.test(src) && !/maxTokens: 1200/.test(src));
  check('a reply that is not JSON is a counted failure with a reason, and its complete cells are salvaged', /reply was not valid JSON/.test(src) && /complete cell\(s\) salvaged/.test(src) && /function _salvageCells\(text\)/.test(src));
  check('the why is capped at 20 words and the model is told the reply must fit', /at most 20 words/.test(src) && /Keep every why short: the reply must fit/.test(src));
  check('the toast names the first reason; the last sweep is exposed for the harness', /failures \+ ' failed — ' \+ reasons\[0\]/.test(src) && /window\.__idpSweepLast = \{ proposed: proposedN/.test(src));
  check('the harness keeps the sweep log', /sweepLog\.push\(window\.__idpSweepLast\)/.test(drv) && /sweepLog: sweepLog/.test(drv));
  check('pin bumped (interdep_ai 1.2)', /interdep_ai\.js\?v=1\.2/.test(idx));
}

console.log('\n[2] executed — a cut-off reply lands its complete cells and reports the cut');
{
  const store = { cells: {} }; const toasts = [];
  const cut = '{"cells":[\n{"colId":"fn:SF-030","contributes":true,"why":"Controls engine thrust; malfunction produces thrust loss."},\n{"colId":"fn:SF-031","contributes":false,"why":"Reverse thrust only on ground — no \\"coupling\\" in flight."},\n{"colId":"fn:SF-032","contributes":true,"why":"Anti-ice';
  let askedMax = 0;
  const ctx = {
    window: { SafetyLabAI: { complete: async (o) => { askedMax = o.maxTokens; return { text: cut, model: 'claude-opus-4-8' }; } } },
    showToast: (m) => toasts.push(m), console, JSON, String, Array, Object, Date, Math,
    idpColumns: () => [{ colId: 'fn:SF-030', sysId: 's1', funcId: 'SF-030', fnName: 'Control thrust' }, { colId: 'fn:SF-031', sysId: 's1', funcId: 'SF-031', fnName: 'Reverse thrust' }, { colId: 'fn:SF-032', sysId: 's2', funcId: 'SF-032', fnName: 'Anti-ice' }, { colId: 'sys:s1', legacy: true }],
    _idpCellRaw: (fc, colId) => store.cells[fc.internalId + '§' + colId] || { state: 'unreviewed' },
    _idpStore: () => store, _idpCellKey: (id, colId) => id + '§' + colId,
    acFhaData: [{ internalId: 7, fcId: 'SF-1-TL', fcDesc: 'Total loss of thrust', severity: 'Catastrophic', subId: '1.1' }],
    systemsData: [{ id: 's1', name: 'Propulsion', functions: [] }, { id: 's2', name: 'Ice protection', functions: [] }],
    commitSaveChanges: () => {}, renderInterdepPage: () => {},
  };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  vm.runInContext('window.idpAiSweep().then(() => { globalThis.__done = true; })', ctx);
  setTimeout(() => {
    const cells = store.cells; const last = ctx.window.__idpSweepLast;
    check('the budget asked for is sized to 3 candidates (600 + 110 × 3 = 930), not 1200', askedMax === 930, String(askedMax));
    check('the two complete cells landed as proposals (contributes / clear), the cut-off third did not', cells['7§fn:SF-030'] && cells['7§fn:SF-030'].state === 'proposed' && cells['7§fn:SF-030'].dir === 'contributes' && cells['7§fn:SF-031'].dir === 'clear' && !cells['7§fn:SF-032'], JSON.stringify(cells));
    check('an escaped quote inside a why survives the salvage', /"coupling"/.test(cells['7§fn:SF-031'].why));
    check('the cut is a reported failure with its reason', last && last.failures === 1 && /reply was not valid JSON \(cut off — 2 complete cell\(s\) salvaged\)/.test(last.reasons[0]), JSON.stringify(last));
    check('the toast says so', toasts.some(t => /2 proposal\(s\) landed \(1 call\(s\), 1 failed — SF-1-TL: reply was not valid JSON/.test(t)), toasts.join(' | '));
    const I = ctx.window.__idpSweepInternals;
    check('a clean reply still parses the normal way (no salvage)', I._parseJson('```json\n{"cells":[{"colId":"x","contributes":true,"why":"y"}],"assumptions":[]}\n```').cells.length === 1);
    check('the budget caps at 8000 for very wide tables', I._sweepBudget(200) === 8000 && I._sweepBudget(27) === 3570);
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  }, 80);
}
