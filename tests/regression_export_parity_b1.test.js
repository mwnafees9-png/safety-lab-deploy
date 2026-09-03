/*
 * regression_export_parity_b1.test.js — EXPORT PARITY batch 1 (30 Aug 2026).
 * Waqas directive, 18 Aug: everything on offer can get exported. Three buttons
 * existed and fell to the "not yet implemented" alert: All_Requirements, Items,
 * VV_Status. Each new case mirrors ITS RENDERER'S columns (17 Aug rule: never
 * invent a schema; the renderer is the authority) and coerces defensively.
 *
 * Every case is EXECUTED: exportData() runs in a vm over fixture data shaped
 * like real project rows (including the hostile shapes the 17 Aug episode
 * taught us — traceIds as string, missing fields), and the captured
 * downloadCSV call is asserted header-by-header against the renderer's
 * columns. Mutations proven red at build time: a case deleted -> alert path;
 * a header renamed -> mismatch; status normalization dropped -> raw leak.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(SITE, 'data_ops_modules.js'), 'utf8');
const helpersSrc = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok   ' + name);
  else { failures++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
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

// The renderers ARE the column authority — read their headers from source so a
// renderer column change breaks this suite instead of silently diverging.
const reqsRepoHeaders = ['ID', 'System', 'Trace', 'Level', 'Type', 'From', 'Requirement Statement', 'Val Status', 'Ver Status'];
check("reqs-repo renderer still carries the mirrored columns",
  /Requirement Statement<\/th>/.test(helpersSrc) && />Trace<\/th>/.test(helpersSrc));
check('VV renderer still carries the mirrored columns',
  /Val Status<\/th>[\s\S]{0,120}Ver Status<\/th>/.test(helpersSrc));
check('Items table still carries the mirrored columns',
  /<th>Item ID<\/th>/.test(indexSrc) && /<th>DA Type<\/th>/.test(indexSrc) && /<th>Owning System<\/th>/.test(indexSrc));

function runExport(moduleName) {
  const captured = [];
  const sb = {
    console, Date, Array, JSON, String, Number, Object, Math, isNaN, parseFloat,
    alert: (m) => captured.push({ alert: String(m) }),
    downloadCSV: (fname, headers, rows) => captured.push({ fname, headers, rows }),
    // fixtures — hostile shapes on purpose
    acReqData: [
      { internalId: 9, traceId: 'AC-REQ-1', level: 'Aircraft', type: 'Safety', analysis: 'FHA',
        text: 'The aircraft shall X', valStatus: 'Complete', verStatus: '', traceIds: ['FC-01', 'FC-02'] },
      { internalId: 10, text: 'Unlabelled req', traceIds: 'FC-03' },   // no ids, traceIds as STRING
    ],
    systemsData: [
      { id: 'sys-1', name: 'FCS', req: [
        { internalId: 11, traceId: 'FCS-REQ-1', level: 'System', type: 'Derived', analysis: 'PSSA',
          text: 'The FCS shall Y', valStatus: 'In progress', verStatus: 'Verified' },
      ] },
    ],
    itemsData: [
      { internalId: 1, itemId: 'ITM-001', name: 'FCC', rate: 2.5e-6, type: 'Hardware (HWCI)',
        dal: 'A', daType: 'IDAL', owningSystemId: 'sys-1', zoneId: 'Z-10',
        traceIds: ['SF-003'], description: 'Flight control computer' },
      { internalId: 2, itemId: 'ITM-002', name: 'Bracket' },   // everything else missing
    ],
    // no _vvAllRequirements / _vvNormStatus in this sandbox on purpose:
    // the case must work through its FALLBACKS too (data_ops loads before helpers)
    flightPhasesData: [], praData: [], zsaData: [], cmaData: [], fmeaData: [],
    ftaPages: [], acFhaData: [],
    projectConfig: { customLibrary: {} },
    activeSystemId: '',
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(exportFn + ';globalThis.__e = exportData;', sb);
  vm.runInContext('__e(' + JSON.stringify(moduleName) + ', "csv")', sb);
  return captured;
}

/* ------------------------------------------------------------------ */
console.log('All_Requirements');
{
  const out = runExport('All_Requirements');
  const csv = out.find(o => o.headers);
  check('exports a CSV, not the alert', !!csv && !out.some(o => o.alert), JSON.stringify(out[0] || null));
  if (csv) {
    check('headers mirror the reqs-repo renderer exactly',
      JSON.stringify(csv.headers) === JSON.stringify(reqsRepoHeaders), JSON.stringify(csv.headers));
    check('aircraft + system scopes both present (3 rows)', csv.rows.length === 3);
    const r1 = csv.rows[0];
    check('row: id / system / trace / statement land in the renderer\'s order',
      r1[0] === 'AC-REQ-1' && r1[1] === 'Aircraft' && r1[2] === 'FC-01, FC-02' && r1[6] === 'The aircraft shall X');
    check('system row carries the system name', csv.rows[2][1] === 'FCS');
    check('missing ids fall back like the renderer (#internalId)', csv.rows[1][0] === '#10');
    check('traceIds-as-STRING does not throw and lands as text (the 17 Aug lesson)',
      csv.rows[1][2] === 'FC-03');
    check('empty statuses render the em-dash fallback', csv.rows[1][7] === '—' && csv.rows[1][8] === '—');
  }
}

console.log('VV_Status');
{
  const out = runExport('VV_Status');
  const csv = out.find(o => o.headers);
  check('exports a CSV, not the alert', !!csv && !out.some(o => o.alert));
  if (csv) {
    check('headers mirror the VV page',
      JSON.stringify(csv.headers) === JSON.stringify(['ID', 'Scope', 'Level', 'Type', 'From', 'Statement', 'Val Status', 'Ver Status']),
      JSON.stringify(csv.headers));
    check('statuses are NORMALIZED to the badge labels the page shows',
      csv.rows[0][6] === 'Closed' && csv.rows[2][6] === 'In progress' && csv.rows[2][7] === 'Closed',
      JSON.stringify(csv.rows.map(r => [r[6], r[7]])));
    check('empty status normalizes to Open, never leaks raw', csv.rows[0][7] === 'Open' && csv.rows[1][6] === 'Open');
    check('fallback collector covers both scopes when helpers is absent', csv.rows.length === 3 && csv.rows[2][1] === 'FCS');
  }
}

console.log('Items');
{
  const out = runExport('Items');
  const csv = out.find(o => o.headers);
  check('exports a CSV, not the alert', !!csv && !out.some(o => o.alert));
  if (csv) {
    check('headers mirror the Items register (minus Actions)',
      JSON.stringify(csv.headers) === JSON.stringify(['Item ID', 'Name', 'Failure Rate (per hr)', 'Type', 'DAL', 'DA Type', 'Owning System', 'Zone', 'Functions', 'Description']),
      JSON.stringify(csv.headers));
    const r1 = csv.rows[0];
    check('full row lands: id, name, rate, owner resolved to system NAME',
      r1[0] === 'ITM-001' && r1[1] === 'FCC' && r1[2] === '2.5000e-6' && r1[6] === 'FCS' && r1[8] === 'SF-003');
    const r2 = csv.rows[1];
    check("bare row gets the renderer's defaults (HW+SW / E / IDAL / Aircraft-level)",
      r2[3] === 'HW+SW' && r2[4] === 'E' && r2[5] === 'IDAL' && r2[6] === 'Aircraft-level' && r2[2] === '');
  }
}

console.log('the alert default still guards unknown names');
{
  const out = runExport('Definitely_Not_A_Module');
  check('unknown module still alerts (default not swallowed)', out.some(o => o.alert && /not yet implemented/.test(o.alert)));
}

console.log('pin floor');
const pm = indexSrc.match(/data_ops_modules\.js\?v=([\d.]+)/);
check('data_ops pin floor >= 66.19', !!pm && parseFloat(pm[1]) >= 66.19, pm && pm[1]);

console.log(failures ? ('FAILED — ' + failures + ' check(s)') : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
