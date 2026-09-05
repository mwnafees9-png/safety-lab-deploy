/*
 * regression_export_parity_b2a.test.js — EXPORT PARITY batch 2a (30 Aug 2026):
 * the R&M lane. Reliability predictions (217F parts count) and Markov models
 * had NO export path at all. Both new cases mirror their renderer's COMPUTED
 * output and inherit the engines' refusal discipline — an export never invents
 * what the engine would not show.
 *
 * Executed in vm with a fake RAM_PREDICT / Markov solver capturing calls:
 *  - 217F: per-part rows + TOTAL row with MTBF/env/source; engine THROW surfaces
 *    the engine's message verbatim as the refusal; empty state alerts helpfully.
 *  - Markov: OK rows carry transient/steady/receipt at the project's T; an
 *    invalid model exports as REFUSED with the validator's errors, never a
 *    number; a phased model's §I.2.9 line lands in Notes.
 *  - Buttons: the Markov page carries the CSV button; the 217F toolbar shows
 *    it only when rows exist.
 *
 * Mutations proven red at build time: engine-refusal swallowed (export computes
 * anyway); REFUSED model exported with numbers; TOTAL row dropped; Markov
 * button removed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(SITE, 'data_ops_modules.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const rpSrc = fs.readFileSync(path.join(SITE, 'ram_predict.js'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok   ' + name);
  else { failures++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

function extractFn(source, name) {
  const at = source.indexOf('function ' + name + '(');
  if (at < 0) return null;
  const open = source.indexOf('{', at);
  let d = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') d++;
    else if (source[i] === '}') { d--; if (!d) return source.slice(at, i + 1); }
  }
  return null;
}
const exportFn = extractFn(src, 'exportData');
check('exportData extracted', !!exportFn);

function sandbox(overrides) {
  const captured = [];
  const sb = {
    console, Date, Array, JSON, String, Number, Object, Math, isNaN, parseFloat,
    alert: (m) => captured.push({ alert: String(m) }),
    downloadCSV: (fname, headers, rows) => captured.push({ fname, headers, rows }),
    acReqData: [], systemsData: [], itemsData: [], flightPhasesData: [], praData: [],
    zsaData: [], cmaData: [], fmeaData: [], ftaPages: [], acFhaData: [],
    activeSystemId: '',
    ftaConfig: { exposureTime: '2.5' },
    projectConfig: { customLibrary: {} },
  };
  Object.assign(sb, overrides);
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(exportFn + ';globalThis.__e = exportData;', sb);
  return { sb, captured };
}

/* ------------------------------------------------------------------ */
console.log('RM_Predictions (217F)');
{
  const predictResult = {
    env: 'AUF', envName: 'Airborne, Uninhabited Fighter',
    rows: [
      { name: 'Microcircuits, Digital', qty: 12, lambdaG: 0.075, quality: 'B-1', piQ: 2, contrib: 1.8, cite: 'Tbl A-1 p.A-4' },
      { name: 'Resistors, Film', qty: 40, lambdaG: 0.0012, quality: 'M', piQ: 1, contrib: 0.048, cite: 'Tbl A-6 p.A-9' },
    ],
    lambdaTotal: 1.848, mtbfHrs: 1e6 / 1.848, source: 'MIL-HDBK-217F Notice 2',
  };
  const { sb, captured } = sandbox({
    RAM_PREDICT: { predict: () => predictResult },
    projectConfig: { customLibrary: {}, ram: { predict: { env: 'AUF', rows: [{ cat: 'micro', qty: 12 }, { cat: 'res', qty: 40 }] } } },
  });
  vm.runInContext('__e("RM_Predictions", "csv")', sb);
  const csv = captured.find(o => o.headers);
  check('exports a CSV', !!csv && !captured.some(o => o.alert), JSON.stringify(captured[0] || null));
  if (csv) {
    check('headers mirror the computed output (category/N/λg/quality/πQ/contribution/citation)',
      JSON.stringify(csv.headers) === JSON.stringify(['Part category', 'N', 'λg (/10⁶h)', 'Quality', 'πQ', 'Contribution (/10⁶h)', 'Handbook citation']),
      JSON.stringify(csv.headers));
    check('per-part row carries the handbook citation',
      csv.rows[0][0] === 'Microcircuits, Digital' && csv.rows[0][6] === 'Tbl A-1 p.A-4');
    const total = csv.rows[csv.rows.length - 1];
    check('TOTAL row states λ_EQUIP, MTBF, environment and source — what the page states',
      total[0] === 'TOTAL λ_EQUIP' && total[5] === '1.8480' &&
      /MTBF 541,126 h/.test(total[6]) && /environment AUF/.test(total[6]) && /217F/.test(total[6]),
      JSON.stringify(total));
  }
  // engine refusal surfaces VERBATIM
  const r2 = sandbox({
    RAM_PREDICT: { predict: () => { throw new Error('RAM-PREDICT refused: no sourced λg for environment GM. No value, no guess.'); } },
    projectConfig: { customLibrary: {}, ram: { predict: { env: 'GM', rows: [{ cat: 'x', qty: 1 }] } } },
  });
  vm.runInContext('__e("RM_Predictions", "csv")', r2.sb);
  check('engine refusal surfaces verbatim, no CSV is written',
    r2.captured.some(o => o.alert && /No value, no guess/.test(o.alert)) && !r2.captured.some(o => o.headers));
  // empty state
  const r3 = sandbox({ RAM_PREDICT: { predict: () => ({}) }, projectConfig: { customLibrary: {}, ram: { predict: { env: 'AUF', rows: [] } } } });
  vm.runInContext('__e("RM_Predictions", "csv")', r3.sb);
  check('empty prediction alerts helpfully instead of exporting nothing',
    r3.captured.some(o => o.alert && /No parts/.test(o.alert)));
}

/* ------------------------------------------------------------------ */
console.log('Markov_Models');
{
  const models = [
    { name: 'Hydraulic pair', states: [], transitions: [] },
    { name: 'Broken model' },
    { name: 'Phased gen', phasePlan: { enabled: true } },
  ];
  const { sb, captured } = sandbox({
    projectConfig: { customLibrary: {}, markovModels: models },
    validateMarkovModel: (m) => (m.name === 'Broken model'
      ? { ok: false, errors: ['row sums nonzero', 'no failed state'] }
      : { ok: true, warnings: (m.name === 'Hydraulic pair' ? ['absorbing state unreachable'] : []) }),
    solveMarkovTransient: (m, t) => ({ ok: true, pFailed: 3.2e-5 * t, receipt: { method: 'uniformization', Lambda: 1.4e-3, terms: 18, tol: '1e-12' } }),
    solveMarkovModel: (m) => ({ ok: true, pFailed: 4.1e-4 }),
    solveMarkovPhased: (m) => ({ ok: true, pFailed: 7.7e-5, legs: [1, 2], missionHours: 2.5, excluded: [] }),
  });
  vm.runInContext('__e("Markov_Models", "csv")', sb);
  const csv = captured.find(o => o.headers);
  check('exports a CSV', !!csv, JSON.stringify(captured[0] || null));
  if (csv) {
    check('headers mirror the mission-time table (+Status/T/Notes)',
      JSON.stringify(csv.headers) === JSON.stringify(['Model', 'Status', 'T (FH)', 'P(failed at T)', 'P(failed, steady)', 'Method', 'Λ', 'Receipt', 'Notes']),
      JSON.stringify(csv.headers));
    const ok = csv.rows[0];
    check("OK row: transient at the PROJECT'S T (2.5 FH), steady, receipt",
      ok[1] === 'OK' && ok[2] === '2.5' && ok[3] === '8.0000e-5' && ok[4] === '4.1000e-4' &&
      ok[5] === 'uniformization' && /18 terms/.test(ok[7]), JSON.stringify(ok));
    check('warnings land in Notes', /absorbing state unreachable/.test(ok[8]));
    const refused = csv.rows[1];
    check('invalid model exports as REFUSED with the validator errors — NEVER a number',
      refused[1] === 'REFUSED' && /row sums nonzero/.test(refused[8]) && refused[3] === '' && refused[4] === '',
      JSON.stringify(refused));
    check('phased model carries the §I.2.9 line in Notes',
      /phased \(§I\.2\.9\): 7\.7000e-5 over 2 phases \/ 2\.50 FH/.test(csv.rows[2][8]), csv.rows[2][8]);
  }
  const r2 = sandbox({ projectConfig: { customLibrary: {}, markovModels: [] } });
  vm.runInContext('__e("Markov_Models", "csv")', r2.sb);
  check('no models alerts helpfully', r2.captured.some(o => o.alert && /No Markov models/.test(o.alert)));
}

/* ------------------------------------------------------------------ */
console.log('buttons + pins');
check('Markov page carries the CSV export button',
  /exportData\('Markov_Models', 'csv'\)/.test(indexSrc));
check('217F toolbar shows Export CSV only when rows exist',
  /st\.rows\.length \? '<button onclick="exportData\(\\'RM_Predictions\\', \\'csv\\'\)"/.test(rpSrc));
function pin(s2, re) { const m = s2.match(re); return m ? parseFloat(m[1]) : -1; }
check('data_ops pin floor >= 66.20', pin(indexSrc, /data_ops_modules\.js\?v=([\d.]+)/) >= 66.20);
check('ram_predict pin floor >= 0.4', pin(indexSrc, /ram_predict\.js\?v=([\d.]+)/) >= 0.4);

console.log(failures ? ('FAILED — ' + failures + ' check(s)') : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
