#!/usr/bin/env node
/*
 * Build the missing FCIM for each demo project from the SFHA rows that already exist.
 *
 * WHY. Every demo system shipped with `fcim: []`, and extractedFCs is DERIVED from fcim
 * (rebuildExtractedFCsForAllSystems, misc_fn_modules.js:2618) and rebuilt destructively on
 * every demo open (data_ops_modules.js:1533). So all 131 system-FHA rows across the five demos
 * referenced failure conditions that existed nowhere, and hand-filling extractedFCs would have
 * been erased on load. The only durable fix is to author the matrix.
 *
 * WHAT IT INVENTS: nothing. Every fcId, description and severity below already exists in the
 * demo file, written by the engineer. This only decides WHICH COLUMN of the matrix each
 * existing condition sits in — total loss, partial loss, or malfunction — from the words the
 * condition already uses. Anything whose wording does not decide that on its own is listed at
 * the end for review rather than quietly assigned.
 *
 * Run from the repo root:  node gen_fcim.js          (report only)
 *                          node gen_fcim.js --write  (rewrite the demo files)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const WRITE = process.argv.includes('--write');
const SITE = 'site';

// ---------------------------------------------------------------- classification
// Ordered: the first rule whose words appear decides. "Undetected erroneous air-data output"
// is a malfunction, not a loss, so malfunction is tested before loss.
const RULES = [
  // "does not follow the commanded setting" and "indicated locked when it is not" are the
  // output disagreeing with the command and the indication disagreeing with the state. Both
  // are malfunctions by what the sentence says, not by interpretation.
  ['M', /(erroneous|undetected|misleading|incorrect|spurious|uncommanded|inadvertent|hardover|runaway|false|asymmetr|without indication|oscillat|mis-?compare|drift|does not follow|does not match|indicated \w+ when it is not)/i],
  ['P', /(partial|degraded|reduced|intermittent|delayed|slow|one of (?:two|three|four)|single (?:channel|lane|pump|generator|motor))/i],
  ['T', /(^loss\b|total loss|complete loss|^no |fails? to|unable to|in-flight shutdown|^shutdown|structural failure|collapse|unavailable|rupture|burst|depressuris|depressuriz|over-?pressure|jam|seiz)/i],
];
function classify(desc) {
  for (const [cls, re] of RULES) if (re.test(desc)) return cls;
  return '?';
}

// ---------------------------------------------------------------- parsing helpers
// The five demos do NOT share helpers — Halcyon uses SYS(...) with
// sysFha(fcId, subId, fcDesc, severity, phases, effAc); the others use mkSys(...) with
// sysFha(internalId, fcId, subId, desc, sev, acTrace, phases). Both are handled by name.
function blockAt(src, openIdx) {           // balanced-paren slice starting at the '(' index
  let depth = 0, i = openIdx, inStr = null;
  for (; i < src.length; i++) {
    const c = src[i], p = src[i - 1];
    if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return src.slice(openIdx);
}
function systemsIn(src) {                  // [{id, name, block}]
  const out = [];
  const re = /\b(mkSys|SYS)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const block = blockAt(src, m.index + m[0].length - 1);
    const ids = block.match(/^\(\s*'([^']+)'\s*,\s*'((?:[^'\\]|\\.)*)'/);
    if (ids) out.push({ id: ids[1], name: ids[2].replace(/\\'/g, "'"), block });
    re.lastIndex = m.index + 1;
  }
  return out;
}
const S = `'((?:[^'\\\\]|\\\\.)*)'`;
const RE_FHA_LONG  = new RegExp(`sysFha\\(\\s*\\d+\\s*,\\s*${S}\\s*,\\s*${S}\\s*,\\s*${S}\\s*,\\s*${S}`, 'g');
const RE_FHA_SHORT = new RegExp(`sysFha\\(\\s*${S}\\s*,\\s*${S}\\s*,\\s*${S}\\s*,\\s*${S}`, 'g');
const un = s => String(s || '').replace(/\\'/g, "'");

function rowsIn(block, shortForm) {
  const re = shortForm ? RE_FHA_SHORT : RE_FHA_LONG;
  re.lastIndex = 0;
  const out = [];
  let m;
  while ((m = re.exec(block))) {
    out.push({ fcId: un(m[1]), subId: un(m[2]), desc: un(m[3]), sev: un(m[4]) });
  }
  return out;
}

// ---------------------------------------------------------------- matrix assembly
// One FCIM row holds at most one condition per column. A sub-function with more conditions of
// the same kind than columns simply gets ANOTHER row — which the app already supports
// (_existingFor filters rows plural per subId, _pushExtractedFCs walks every row). That is why
// nothing here has to be forced into a column it does not belong in.
function matrixFor(rows) {
  const bySub = new Map();
  for (const r of rows) {
    if (!bySub.has(r.subId)) bySub.set(r.subId, []);
    bySub.get(r.subId).push(r);
  }
  const fcim = [], ambiguous = [];
  for (const [subId, rs] of bySub) {
    const open = [];                                  // rows being filled for this sub-function
    for (const r of rs) {
      let cls = classify(r.desc);
      if (cls === '?') { ambiguous.push({ subId, ...r }); cls = 'T'; }   // recorded, not hidden
      const key = cls === 'T' ? 'tl' : cls === 'P' ? 'pl' : 'm';
      let row = open.find(x => !x[key + 'Id']);
      if (!row) { row = { subId, awareness: '', rationale: '', tlId: '', tlDesc: '', plId: '', plDesc: '', mId: '', mDesc: '' }; open.push(row); }
      row[key + 'Id'] = r.fcId;
      row[key + 'Desc'] = r.desc;
    }
    fcim.push(...open);
  }
  return { fcim, ambiguous };
}

// ---------------------------------------------------------------- emit
const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
function emit(bySystem) {
  const lines = [];
  lines.push("        // ---- FCIM ---------------------------------------------------------------");
  lines.push("        // 16 Sep 2026. These systems shipped with an EMPTY matrix, so every SFHA row");
  lines.push("        // below pointed at a failure condition that existed nowhere: extractedFCs is");
  lines.push("        // derived from fcim and rebuilt on every load, so there was nothing to derive.");
  lines.push("        // Every id and description here is the one already written on the SFHA row it");
  lines.push("        // belongs to — this matrix states which column each of those conditions sits in.");
  lines.push("        const DEMO_FCIM = {");
  for (const [sysId, fcim] of bySystem) {
    if (!fcim.length) continue;
    lines.push('            ' + q(sysId) + ': [');
    for (const r of fcim) {
      const parts = ['subId: ' + q(r.subId)];
      if (r.tlId) parts.push('tlId: ' + q(r.tlId) + ', tlDesc: ' + q(r.tlDesc));
      if (r.plId) parts.push('plId: ' + q(r.plId) + ', plDesc: ' + q(r.plDesc));
      if (r.mId)  parts.push('mId: '  + q(r.mId)  + ', mDesc: '  + q(r.mDesc));
      lines.push('                { ' + parts.join(', ') + ' },');
    }
    lines.push('            ],');
  }
  lines.push("        };");
  lines.push("        systemsData.forEach(function (s) {");
  lines.push("            s.fcim = (DEMO_FCIM[s.id] || []).map(function (r, i) {");
  lines.push("                return Object.assign({ internalId: 90000 + i, awareness: '', rationale: '' }, r);");
  lines.push("            });");
  lines.push("        });");
  return lines.join('\n');
}

// ---------------------------------------------------------------- run
const files = fs.readdirSync(SITE).filter(n => /^demo_showcase_.*\.js$/.test(n)).sort();
let grandAmbiguous = [], grandRows = 0, grandFcim = 0;

for (const f of files) {
  const p = path.join(SITE, f);
  const src = fs.readFileSync(p, 'utf8');
  const shortForm = /const sysFha = \(fcId, subId/.test(src);
  const systems = systemsIn(src);
  const bySystem = new Map();
  let fileRows = 0, fileAmb = [];

  for (const sys of systems) {
    const rows = rowsIn(sys.block, shortForm);
    if (!rows.length) { bySystem.set(sys.id, []); continue; }
    fileRows += rows.length;
    const { fcim, ambiguous } = matrixFor(rows);
    bySystem.set(sys.id, fcim);
    fileAmb.push(...ambiguous.map(a => ({ file: f, sys: sys.id, ...a })));
    grandFcim += fcim.length;
  }
  grandRows += fileRows;
  grandAmbiguous.push(...fileAmb);

  console.log(`${f.padEnd(32)} systems ${String(systems.length).padStart(3)}  sfha rows ${String(fileRows).padStart(3)}  fcim rows ${String([...bySystem.values()].reduce((n, a) => n + a.length, 0)).padStart(3)}  needing review ${String(fileAmb.length).padStart(3)}`);

  if (WRITE) {
    // Insert right after the systemsData array literal closes.
    const marker = /const systemsData = \[/;
    const mi = src.search(marker);
    if (mi < 0) { console.log('   !! no systemsData literal — skipped'); continue; }
    const arrOpen = src.indexOf('[', mi);
    let depth = 0, end = arrOpen, inStr = null;
    for (let i = arrOpen; i < src.length; i++) {
      const c = src[i], pr = src[i - 1];
      if (inStr) { if (c === inStr && pr !== '\\') inStr = null; continue; }
      if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
      if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    let after = src.indexOf('\n', end);
    if (after < 0) after = end + 1;
    const out = src.slice(0, after + 1) + '\n' + emit(bySystem) + '\n' + src.slice(after + 1);
    fs.writeFileSync(p, out);
  }
}

console.log(`\ntotal: ${grandRows} SFHA rows -> ${grandFcim} FCIM rows`);
console.log(`conditions whose wording does not decide the column (placed in total loss, listed for review): ${grandAmbiguous.length}`);
for (const a of grandAmbiguous) {
  console.log(`  ${a.file.replace('demo_showcase_', '').replace('.js', '').padEnd(11)} ${a.sys.padEnd(10)} ${a.subId.padEnd(7)} ${a.fcId.padEnd(13)} ${a.desc}`);
}
if (WRITE) console.log('\nfiles rewritten.');
