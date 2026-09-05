/*
 * regression_export_parity_b2b.test.js — EXPORT PARITY batch 2b (30 Aug 2026):
 * the last four no-path analyses. HF register, event trees, STPA UCAs, and
 * MMEL/MLAS now export CSV, each mirroring its renderer and inheriting its
 * engine's refusal discipline.
 *
 * Executed in vm with each engine FAKED at its window seam:
 *  - HF: both lanes + effective posture (credited only while Validated/Verified),
 *    hf rows carry the HFA task detail; untyped-only register alerts.
 *  - ETA: one row per outcome with sequence/prob/freq; an EtaExplosionError tree
 *    exports as REFUSED with the engine's message; a non-closing Σp emits the
 *    CHECK row.
 *  - STPA: ucaSeeds THROWING (silent dismissal, missing J3307 context) surfaces
 *    verbatim; seeds land with disposition, context, spine links.
 *  - MMEL: renderer columns, values preserved.
 *  - Buttons: all four panels carry the entity-quoted exportData onclick.
 *
 * Mutations proven red at build time: STPA refusal swallowed; ETA REFUSED row
 * dropped; HF effective-posture inverted; a panel button removed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(SITE, 'data_ops_modules.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

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
    zsaData: [], cmaData: [], fmeaData: [], ftaPages: [], acFhaData: [], activeSystemId: '',
    ftaConfig: {}, projectConfig: { customLibrary: {} },
  };
  Object.assign(sb, overrides);
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(exportFn + ';globalThis.__e = exportData;', sb);
  return { sb, captured };
}

/* ------------------------------------------------------------------ */
console.log('HF_Register');
{
  const { sb, captured } = sandbox({
    HF_ASSUMPTIONS: {
      asmAllTyped: () => [
        { asmId: 'A1', scope: 'Aircraft', text: 'Crew responds within 8 s', type: 'hf', typeLabel: 'Human factors',
          credited: '8 s response', uncredited: 'no crew credit', state: 'Validated',
          hf: { direction: 'annunciated', responsePhase: 'approach', crewmember: 'PF', taskTimeS: 8, taskTimeBasis: 'HIDH table' } },
        { asmId: 'A2', scope: 'FCS', text: 'Maintenance interval held', type: 'ops', typeLabel: 'Operational',
          credited: '600 FH interval', uncredited: 'none', state: 'Open', hf: null },
        { asmId: 'A3', scope: 'Aircraft', text: 'untyped note', type: null, credited: null, uncredited: null, state: 'Open', hf: null },
      ],
      isValidated: (st) => /validated|verified/i.test(String(st || '')),
    },
  });
  vm.runInContext('__e("HF_Register", "csv")', sb);
  const csv = captured.find(o => o.headers);
  check('exports a CSV', !!csv, JSON.stringify(captured[0] || null));
  if (csv) {
    check('headers carry both lanes + effective posture',
      JSON.stringify(csv.headers) === JSON.stringify(['Scope', 'Assumption', 'Type', 'Credited lane', 'Uncredited lane', 'Holds now', 'State', 'HFA detail']),
      JSON.stringify(csv.headers));
    check('untyped rows are excluded (register shows typed posture)', csv.rows.length === 2);
    check('Validated row holds the CREDITED lane', csv.rows[0][6] === 'Validated' && csv.rows[0][5] === 'credited');
    check('Open row falls to the conservative lane', csv.rows[1][5] === 'uncredited (conservative)');
    check('hf row carries the HFA task detail', /direction annunciated/.test(csv.rows[0][7]) && /task 8s \(HIDH table\)/.test(csv.rows[0][7]));
    check('non-hf row has empty detail', csv.rows[1][7] === '');
  }
}

/* ------------------------------------------------------------------ */
console.log('Event_Trees');
{
  const trees = [
    { id: 'ET-001', name: 'Loss of braking on landing', initiator: { desc: 'brake demand with system fault', freq: 1e-4 } },
    { id: 'ET-002', name: 'Monster tree' },
  ];
  const { sb, captured } = sandbox({
    etaStore: () => trees,
    etaEvaluate: (t) => {
      if (t.id === 'ET-002') { const e = new Error('This event tree has 20 barriers, which enumerates 2^20 outcomes — above budget.'); e.name = 'EtaExplosionError'; throw e; }
      return {
        freq: 1e-4, closed: false, sum: 0.97,
        outcomes: [
          { key: '0', seq: ['Spoilers hold'], prob: 0.97, freq: 9.7e-5, severity: 'Major', linkedFcId: 'FC-08', note: '' },
          { key: '1', seq: ['Spoilers FAILS'], prob: 0.03, freq: 3e-6, severity: '', linkedFcId: '', note: 'unassessed' },
        ],
      };
    },
  });
  vm.runInContext('__e("Event_Trees", "csv")', sb);
  const csv = captured.find(o => o.headers);
  check('exports a CSV', !!csv, JSON.stringify(captured[0] || null));
  if (csv) {
    check('outcome row: sequence, prob, freq, severity, FHA link',
      csv.rows[0][5] === 'Spoilers hold' && csv.rows[0][6] === '9.7000e-1' && csv.rows[0][7] === '9.7000e-5' &&
      csv.rows[0][8] === 'Major' && csv.rows[0][9] === 'FC-08', JSON.stringify(csv.rows[0]));
    check('non-closing Σp emits the CHECK row naming the sum',
      csv.rows.some(r => r[2] === 'CHECK' && r[6] === '0.970000'), JSON.stringify(csv.rows.map(r => r[2])));
    check('exploding tree exports as REFUSED with the ENGINE\'S message, no partial enumeration',
      csv.rows.some(r => r[0] === 'ET-002' && r[2] === 'REFUSED' && /2\^20/.test(r[9])) &&
      !csv.rows.some(r => r[0] === 'ET-002' && r[2] === 'OK'));
  }
}

/* ------------------------------------------------------------------ */
console.log('STPA_UCAs');
{
  const seeds = [
    { ucaId: 'UCA-CA1:np', controller: 'FADEC', action: 'reduce thrust', phrase: 'not provided', status: 'assessed',
      context: 'asymmetric reverser deploy in flight', hazardIds: ['H-2'], fcIds: [], rationale: null,
      text: 'FADEC: “reduce thrust” not provided while asymmetric reverser deploy in flight [→ H-2] (FADEC → engine)' },
    { ucaId: 'UCA-CA1:ph', controller: 'FADEC', action: 'reduce thrust', phrase: 'provided causes hazard', status: 'open',
      context: null, hazardIds: [], fcIds: ['FC-05'], rationale: null, text: '“reduce thrust” provided causes hazard (FADEC → engine)' },
  ];
  const mk = (uc) => sandbox({
    STPA: { ucaSeeds: uc },
    stpaData: { cs: { actions: [{ id: 'CA1', name: 'reduce thrust', from: 'FADEC', to: 'engine' }] }, dispositions: {}, hazards: [{ id: 'H-2' }] },
  });
  const ok = mk(() => seeds);
  vm.runInContext('__e("STPA_UCAs", "csv")', ok.sb);
  const csv = ok.captured.find(o => o.headers);
  check('exports a CSV', !!csv, JSON.stringify(ok.captured[0] || null));
  if (csv) {
    check('UCA row: id / controller / phrase / status / J3307 context / spine link',
      csv.rows[0][0] === 'UCA-CA1:np' && csv.rows[0][1] === 'FADEC' && csv.rows[0][3] === 'not provided' &&
      csv.rows[0][4] === 'assessed' && /asymmetric reverser/.test(csv.rows[0][5]) && csv.rows[0][6] === 'H-2',
      JSON.stringify(csv.rows[0]));
    check('open seed exports with empty context, legacy FC link preserved',
      csv.rows[1][4] === 'open' && csv.rows[1][5] === '' && csv.rows[1][7] === 'FC-05');
  }
  const refused = mk(() => { throw new Error('stpa: UCA CA1:np dismissed WITHOUT rationale — a silent dismissal is a hole, not a disposition'); });
  vm.runInContext('__e("STPA_UCAs", "csv")', refused.sb);
  check('engine refusal surfaces VERBATIM, no CSV laundered out',
    refused.captured.some(o => o.alert && /silent dismissal is a hole/.test(o.alert)) && !refused.captured.some(o => o.headers));
}

/* ------------------------------------------------------------------ */
console.log('MMEL_MLAS');
{
  const { sb, captured } = sandbox({
    projectConfig: { customLibrary: {}, mmel: { budgetShare: 0.1, items: [
      { id: 'M-01', title: 'Anti-skid channel B', ata: '32', installed: 2, required: 1, category: 'C', catDays: 10,
        protection: 'protection retained via channel A', quant: '1.2e-6 /FH dispatched', mProc: 'M-32-01', oProc: '', state: 'approved' },
    ] } },
  });
  vm.runInContext('__e("MMEL_MLAS", "csv")', sb);
  const csv = captured.find(o => o.headers);
  check('exports a CSV with the renderer\'s columns', !!csv &&
    JSON.stringify(csv.headers) === JSON.stringify(['Item', 'Equipment', 'ATA', 'Installed', 'Required', 'Category', 'TLD max (days)', 'Protection check', 'Quantitative (dispatched)', '(m) procedure', '(o) procedure', 'State']),
    csv && JSON.stringify(csv.headers));
  if (csv) check('row values preserved incl. numeric installed/required and TLD days',
    csv.rows[0][0] === 'M-01' && csv.rows[0][3] === '2' && csv.rows[0][4] === '1' && csv.rows[0][6] === '10' && csv.rows[0][11] === 'approved');
}

/* ------------------------------------------------------------------ */
console.log('buttons + pins');
const hfPanel = fs.readFileSync(path.join(SITE, 'hf_register_panel.js'), 'utf8');
const etaSrc = fs.readFileSync(path.join(SITE, 'event_trees.js'), 'utf8');
const stpaSrc = fs.readFileSync(path.join(SITE, 'stpa_panel.js'), 'utf8');
const mmelSrc = fs.readFileSync(path.join(SITE, 'mmel_module.js'), 'utf8');
check('HF panel carries the export button', /exportData\(&quot;HF_Register&quot;/.test(hfPanel));
check('ETA panel carries the export button', /exportData\(&quot;Event_Trees&quot;/.test(etaSrc));
check('STPA panel carries the export button', /exportData\(&quot;STPA_UCAs&quot;/.test(stpaSrc));
check('MMEL panel carries the export button', /exportData\(&quot;MMEL_MLAS&quot;/.test(mmelSrc));
function pin(s2, re) { const m = s2.match(re); return m ? parseFloat(m[1]) : -1; }
check('data_ops pin floor >= 66.21', pin(indexSrc, /data_ops_modules\.js\?v=([\d.]+)/) >= 66.21);
check('four panel pins bumped (mmel>=1.1 eta>=1.5 hf>=0.8 stpa>=1.3)',
  pin(indexSrc, /mmel_module\.js\?v=([\d.]+)/) >= 1.1 && pin(indexSrc, /event_trees\.js\?v=([\d.]+)/) >= 1.5 &&
  pin(indexSrc, /hf_register_panel\.js\?v=([\d.]+)/) >= 0.8 && pin(indexSrc, /stpa_panel\.js\?v=([\d.]+)/) >= 1.3);

console.log(failures ? ('FAILED — ' + failures + ' check(s)') : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
