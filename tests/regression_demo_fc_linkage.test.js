#!/usr/bin/env node
/*
 * Regression — every demo's system-FHA rows must point at failure conditions that exist
 * (16 Sep 2026).
 *
 * THE DEFECT. All five demo projects shipped with `fcim: []` in every system. `extractedFCs`
 * — the list the FHA's condition dropdown and every forward trace read — is DERIVED from
 * `fcim` by rebuildExtractedFCsForAllSystems (site/misc_fn_modules.js), and that rebuild is
 * DESTRUCTIVE and runs on every demo open (site/data_ops_modules.js, inside _applyProjectData,
 * which every demo loader calls). So all 131 system-FHA rows across the five demos referenced
 * failure conditions that existed nowhere, and the 9 Sep editor fix hid it rather than repaired
 * it. Anyone evaluating the product opens a demo first.
 *
 * Two things follow, and this suite pins both:
 *   1. Hand-filling `extractedFCs` in a demo is NOT a fix — the rebuild erases it. The matrix
 *      is the only thing that survives, so the check below derives the same way the app does
 *      and asserts against the derived list, never against an authored one.
 *   2. Every fcId used by an SFHA row has to be produced by that system's own matrix. Not a
 *      different system's: a condition is scoped to the system that owns it.
 *
 * Run: node tests/regression_demo_fc_linkage.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const SITE = path.join(REPO, 'site');

// Same balanced-paren scan the generator uses, so the test reads the files the way they are
// actually written rather than by a fragile line pattern.
function blockAt(src, openIdx) {
  let depth = 0, inStr = null;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i], p = src[i - 1];
    if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return src.slice(openIdx);
}
const S = `'((?:[^'\\\\]|\\\\.)*)'`;
const un = s => String(s || '').replace(/\\'/g, "'");

function systemsIn(src) {
  const out = []; const re = /\b(mkSys|SYS)\s*\(/g; let m;
  while ((m = re.exec(src))) {
    const block = blockAt(src, m.index + m[0].length - 1);
    const ids = block.match(new RegExp('^\\(\\s*' + S + '\\s*,'));
    if (ids) out.push({ id: un(ids[1]), block });
    re.lastIndex = m.index + 1;
  }
  return out;
}
function fhaRowsIn(block, shortForm) {
  const re = shortForm
    ? new RegExp(`sysFha\\(\\s*${S}\\s*,\\s*${S}\\s*,\\s*${S}\\s*,\\s*${S}`, 'g')
    : new RegExp(`sysFha\\(\\s*\\d+\\s*,\\s*${S}\\s*,\\s*${S}\\s*,\\s*${S}\\s*,\\s*${S}`, 'g');
  const out = []; let m;
  while ((m = re.exec(block))) out.push({ fcId: un(m[1]), subId: un(m[2]), desc: un(m[3]) });
  return out;
}

// The app's own derivation, transcribed from _pushExtractedFCs (site/misc_fn_modules.js):
// tlId / plId / mId, plus combined[], plExtra[], mExtra[].
function deriveExtractedFCs(fcimRows) {
  const out = [];
  for (const d of fcimRows || []) {
    if (!d) continue;
    if (d.tlId) out.push(d.tlId);
    if (d.plId) out.push(d.plId);
    if (d.mId) out.push(d.mId);
    (Array.isArray(d.combined) ? d.combined : []).forEach(c => { if (c && c.cbId) out.push(c.cbId); });
    (Array.isArray(d.plExtra) ? d.plExtra : []).forEach(e => { if (e && e.id) out.push(e.id); });
    (Array.isArray(d.mExtra) ? d.mExtra : []).forEach(e => { if (e && e.id) out.push(e.id); });
  }
  return out;
}

// DEMO_FCIM is a plain object literal in each demo file; evaluate just that literal.
function fcimMapOf(src) {
  const i = src.indexOf('const DEMO_FCIM = {');
  if (i < 0) return null;
  const open = src.indexOf('{', i);
  let depth = 0, inStr = null, end = open;
  for (let j = open; j < src.length; j++) {
    const c = src[j], p = src[j - 1];
    if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  // eslint-disable-next-line no-new-func
  return new Function('return ' + src.slice(open, end + 1))();
}

const files = fs.readdirSync(SITE).filter(n => /^demo_showcase_.*\.js$/.test(n)).sort();
check('there are demo showcase files to check', files.length === 5, String(files.length));

let totalRows = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(SITE, f), 'utf8');
  const shortForm = /const sysFha = \(fcId, subId/.test(src);
  const map = fcimMapOf(src);
  const label = f.replace('demo_showcase_', '').replace('.js', '');

  check(label + ': has an FCIM', !!map && Object.keys(map).length > 0,
    'without a matrix, extractedFCs derives to nothing and every SFHA row points at a condition that does not exist');
  if (!map) continue;

  let rows = 0, orphans = [], crossSystem = [];
  const everywhere = new Set();
  for (const ids of Object.values(map)) deriveExtractedFCs(ids).forEach(id => everywhere.add(id));

  for (const sys of systemsIn(src)) {
    const fha = fhaRowsIn(sys.block, shortForm);
    rows += fha.length;
    const mine = new Set(deriveExtractedFCs(map[sys.id]));
    for (const r of fha) {
      if (!mine.has(r.fcId)) (everywhere.has(r.fcId) ? crossSystem : orphans).push(sys.id + '/' + r.fcId);
    }
  }
  totalRows += rows;
  check(label + ': every SFHA row resolves through its own system matrix (' + rows + ' rows)',
    orphans.length === 0 && crossSystem.length === 0,
    orphans.length ? ('unresolved: ' + orphans.slice(0, 4).join(', ')) :
      ('resolves only in another system: ' + crossSystem.slice(0, 4).join(', ')));
}
check('all 131 system-FHA rows across the demos were checked', totalRows === 131, String(totalRows));

console.log('\n[shape] the fix must be the matrix, not a hand-filled extractedFCs');
for (const f of files) {
  const src = fs.readFileSync(path.join(SITE, f), 'utf8');
  const label = f.replace('demo_showcase_', '').replace('.js', '');
  check(label + ': does not hand-fill extractedFCs',
    !/extractedFCs:\s*\[\s*[^\]\s]/.test(src),
    'rebuildExtractedFCsForAllSystems wipes and re-derives it on every load, so anything authored there is lost');
}

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);
