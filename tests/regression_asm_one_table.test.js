#!/usr/bin/env node
/**
 * Regression — ONE ASSUMPTIONS TABLE (Waqas, 4 Sep 2026).
 *
 *   "why do we have three tables stacked? arent they all communicating the same
 *    info" … "one table is sufficient".
 *
 * The Assumptions page carried the same records three times: the working log,
 * a self-mounted "program assumption register" (what rests on each assumption)
 * and a self-mounted "typed assumptions" panel (type, credited ⇄ uncredited).
 * Now: the log is the page. It carries Type, Credited ⇄ uncredited (with the
 * lane that holds now), Linked conditions, Rests on, State, Validation. The two
 * extra tables no longer mount on the assumptions views; their data feeds the
 * columns. The golden-thread roster card renders only when it has events.
 * Run: node tests/regression_asm_one_table.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const helpers = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
const support = fs.readFileSync(path.join(SITE, 'support_modules.js'), 'utf8');
const moat = fs.readFileSync(path.join(SITE, 'assumption_moat.js'), 'utf8');
const hfr = fs.readFileSync(path.join(SITE, 'hf_register_panel.js'), 'utf8');
const bridge = fs.readFileSync(path.join(SITE, 'thread_bridge.js'), 'utf8');
const index = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '('); if (i < 0) return null;
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

console.log('[1] the page has ONE table per scope, and it carries every column');
{
  const hdr = '<th>Assumption ID</th><th>Origin</th><th>Assumption Statement</th><th>Type</th><th>Credited ⇄ uncredited</th><th>Linked Failure Conditions</th><th>Rests on</th><th>State</th><th>Validation / Verification Artifacts</th>';
  check('aircraft AND system assumption tables carry the merged header', index.split(hdr).length - 1 === 2, String(index.split(hdr).length - 1));
  check('the program-register table no longer self-mounts (no host div, no renderer)', !/asm-register-host/.test(moat) && !/function renderAsmRegister\(/.test(moat));
  check('… but the where-used map is exposed for the log', /window\.SafetyLabAsmMoat = \{ whereUsed: asmWhereUsed/.test(moat));
  check('the typed panel no longer mounts on the assumptions tabs (HF page only)', !/tabId === 'ac-asm' \|\| String\(tabId\)\.indexOf\('asm'\)/.test(hfr) && /tabId === 'hfa'/.test(hfr));
  check('the roster card mounts at the END of the view and stays empty with no events', /view\.appendChild\(card\)/.test(bridge) && /if \(!recent\.length\) \{ card\.innerHTML = ''; return; \}/.test(bridge) && !/getElementById\('asm-register-host'\)/.test(bridge));
  check('the roster card re-renders off the LOG render (its old cue is gone)', /setTimeout\(renderThreadCard, 0\); \} catch \(_\) \{\}   \/\/ 4 Sep 2026/.test(bridge));
  check('both logs compute where-used ONCE per render and pass it to every row', /const _wu = _asmMoatUses\(\);/.test(helpers) && /const _wu = \(typeof _asmMoatUses === 'function'\) \? _asmMoatUses\(\)/.test(support));
  check('both row templates carry Type · Posture · Linked · Rests on · State', /_asmTypeCell\(row, 'updateACAsmText'\)\}<\/td><td>\$\{_asmPostureCell\(row, 'updateACAsmText'\)\}<\/td><td>\$\{renderLinkedFHAsHtml\(row\.asmId\)\}<\/td><td>\$\{_asmRestsOnCell\(row\.asmId, row\.state, _wu\)\}/.test(helpers)
    && /_asmTypeCell\(row, 'updateSysAsmText'\)\}<\/td><td>\$\{_asmPostureCell\(row, 'updateSysAsmText'\)\}<\/td><td>\$\{renderLinkedFHAsHtml\(row\.asmId\)\}<\/td><td>\$\{_asmRestsOnCell\(row\.asmId, row\.state, _wu\)\}/.test(support));
  check('a type or posture edit autosaves and re-renders (holds-now and credit findings move)', /if \(field === 'type' \|\| field === 'credited' \|\| field === 'uncredited'\)/.test(helpers) && /if \(field === 'type' \|\| field === 'credited' \|\| field === 'uncredited'\)/.test(support));
  check('the findings (MAC gaps, unvalidated credit) render under the log, not in a table of their own', /_asmRenderFindings\('ac-asm-table'\)/.test(helpers) && /_asmRenderFindings\('sys-asm-table'\)/.test(support));
}

console.log('\n[2] executed — the cells say the right thing');
{
  const ctx = { console, String, Array, Map, window: {}, HF_ASSUMPTIONS: { ASM_TYPES: [{ id: 'hf', label: 'Human factors' }, { id: 'dz', label: 'Design' }], isValidated: s => s === 'Validated' || s === 'Verified' } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext('function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}\n'
    + extractFn(helpers, '_asmRestsOnCell') + '\n' + extractFn(helpers, '_asmTypeCell') + '\n' + extractFn(helpers, '_asmPostureCell') + '\n', ctx);
  const wu = { map: new Map([['ASM-AC-1', [{ detail: 'AC FC SF-001-TL [Catastrophic]' }, { detail: 'MAC rule R1' }]]]), gaps: [] };
  const a = vm.runInContext('_asmRestsOnCell("ASM-AC-1", "Proposed", wu)', Object.assign(ctx, { wu }));
  check('Rests on: count and the named dependants', /<span class="u-mono" style="font-weight:700;">2<\/span> — AC FC SF-001-TL \[Catastrophic\] · MAC rule R1/.test(a), a);
  const b = vm.runInContext('_asmRestsOnCell("ASM-AC-1", "Invalidated", wu)', ctx);
  check('Rests on: an Invalidated assumption something still depends on reads BROKEN', /2 BROKEN/.test(b), b);
  const c = vm.runInContext('_asmRestsOnCell("ASM-AC-9", "Proposed", wu)', ctx);
  check('Rests on: nothing depends on it → says so, amber', /nothing rests on it/.test(c) && /#B7791F/.test(c), c);
  const t = vm.runInContext('_asmTypeCell({ asmId: "ASM-AC-1", type: "Design" }, "updateACAsmText")', ctx);
  check('Type: a select of the HF types with the current one selected, writing through the app\'s own update path', /<option value="Design" selected>Design<\/option>/.test(t) && /onchange="updateACAsmText\('ASM-AC-1', 'type', this\.value\)"/.test(t), t);
  const p1 = vm.runInContext('_asmPostureCell({ asmId: "ASM-AC-1", state: "Proposed", credited: "crew lands within 30 s", uncredited: "no crew action" }, "updateACAsmText")', ctx);
  check('Posture: while NOT validated the uncredited lane holds', /holds now: no crew action/.test(p1) && /#8E2A2A;" title="The lane the analysis reads/.test(p1), p1);
  const p2 = vm.runInContext('_asmPostureCell({ asmId: "ASM-AC-1", state: "Validated", credited: "crew lands within 30 s", uncredited: "no crew action" }, "updateACAsmText")', ctx);
  check('Posture: once Validated the credited lane holds', /holds now: crew lands within 30 s/.test(p2) && /#1D9E75;" title="The lane the analysis reads/.test(p2), p2);
  const p3 = vm.runInContext('_asmPostureCell({ asmId: "ASM-AC-2", state: "Proposed" }, "updateACAsmText")', ctx);
  check('Posture: an untyped assumption shows the two inputs and no "holds now" line', !/holds now/.test(p3) && /placeholder="credited posture"/.test(p3) && /placeholder="conservative posture"/.test(p3), p3);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
