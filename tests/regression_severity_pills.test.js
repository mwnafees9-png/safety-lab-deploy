#!/usr/bin/env node
/*
 * Regression — severity pills (11 Sep 2026, Waqas: "make the colors more distinct,
 * bright red, bright orange, bright yellow, bright green" … "across all analyses
 * where severities are being used" … "no half ass fixes").
 *   ONE renderer (sevPillHtml in helpers_modules.js) draws every severity as a
 *   solid bright pill with black text; the FHA workbooks add the "drives DAL X"
 *   caption. No renderer may fall back to a bare severity string or its own
 *   hex colour. Tokens live in BOTH theme blocks of safety_lab.css.
 * Run: node tests/regression_severity_pills.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const css = S('safety_lab.css'), helpers = S('helpers_modules.js');

console.log('[sev-pills] tokens');
for (const k of ['cat', 'haz', 'maj', 'min', 'neg']) {
  const re = new RegExp('--sev-' + k + '-fill:', 'g');
  check('--sev-' + k + '-fill declared in both theme blocks', (css.match(re) || []).length === 2);
}
check('fills (soft): CAT red / HAZ orange / MAJ yellow / MIN pale yellow / NSE green', /--sev-cat-fill: #F2928C/.test(css) && /--sev-haz-fill: #F5B878/.test(css) && /--sev-maj-fill: #F2DB74/.test(css) && /--sev-min-fill: #F8ECB0/.test(css) && /--sev-neg-fill: #A6DFB4/.test(css));
check('effect-axis level chips use the same fills (levels 0..4 = NSE..CAT)', /\.sev-axis-chip\[data-level="4"\] \{ background: var\(--sev-cat-fill\)/.test(css) && /data-level="' \+ i \+ '"/.test(S('severity_axes.js')) && !/#8E2A2A/.test(S('severity_axes.js')));
check('tables carry the 2px ink container border', /^table \{[^}]*border: 2px solid var\(--color-border-strong\)/m.test(css));
check('pill text is black on every fill', (css.match(/--sev-pill-text: #0B0B0D/g) || []).length === 2 && /\.sev-pill,[^{]*\{[^}]*color: var\(--sev-pill-text\) !important/.test(css));
check('td.cell-* is a plain cell (no tinted background)', /td\[class\^="cell-"\][^{]*\{ background: transparent !important/.test(css));
check('legacy severity stamps/tints are gone', !/box-shadow: inset 0 0 0 1\.5px currentColor/.test(css) && !/\.cell-Major \{ background: rgba\(255, 204, 0/.test(css));

console.log('[sev-pills] renderer');
const m = helpers.match(/function sevPillHtml\(sev, opts\) \{[\s\S]*?\n\}\nwindow\.sevPillHtml = sevPillHtml;/);
check('sevPillHtml defined and exported from helpers_modules.js', !!m);
if (m) {
  const sandbox = { window: {}, getSafetyTarget: sev => ({ Catastrophic: { dal: 'A' }, Hazardous: { dal: 'B' }, Major: { dal: 'C' }, Minor: { dal: 'D' }, Negligible: { dal: 'E' } })[sev] || null };
  vm.createContext(sandbox);
  vm.runInContext(m[0], sandbox);
  const f = sandbox.window.sevPillHtml;
  check('Catastrophic → red pill', /class="sev-pill sev-cat"/.test(f('Catastrophic')) && /Catastrophic</.test(f('Catastrophic')));
  check('Hazardous / Major / Minor → their pills', /sev-haz/.test(f('Hazardous')) && /sev-maj/.test(f('Major')) && /sev-min/.test(f('Minor')));
  check('Negligible renders as "No Safety Effect"', /sev-neg/.test(f('Negligible')) && /No Safety Effect/.test(f('Negligible')) && !/Negligible/.test(f('Negligible')));
  check('FHA caption: drives DAL from the cert basis', /drives <b>DAL A<\/b>/.test(f('Catastrophic', { dal: true })) && /drives <b>DAL C<\/b>/.test(f('Major', { dal: true })));
  check('FHA caption: No Safety Effect drives no DAL', /no DAL driven/.test(f('Negligible', { dal: true })));
  check('no caption without opts.dal', !/sev-dal/.test(f('Catastrophic')));
  check('unknown/empty severity is safe', f('') === '' && /sev-pill/.test(f('Weird')) && !/sev-weird/.test(f('Weird')));
  check('escapes its input', !/<img/.test(f('<img>')));
}

console.log('[sev-pills] every renderer uses it');
check('AC FHA + SFHA rows: pill with DAL caption', (helpers.match(/\$\{sevPillHtml\(row\.severity, \{ dal: true \}\)\}/g) || []).length === 2);
check('helpers: DAL reference + system-function tables + resource chip + CCMR stamp', /sevPillHtml\(sev\)/.test(helpers) && /sevPillHtml\(sf\.severity\)/.test(helpers) && /sevPillHtml\(tf\.severity\)/.test(helpers) && /if \(sev\) return sevPillHtml\(sev\);/.test(helpers) && /'<td>' \+ sevPillHtml\(r\.severity\) \+ '<\/td>'/.test(helpers));
for (const [f, needle] of [
  ['asa_triage.js', '_sevPill(r.severity)'], ['budget_ledger.js', '_sevPill(r.severity)'], ['fc_tree_flow.js', '_sevPill(f.severity)'],
  ['data_ops_modules.js', '_sevPill(sev)'], ['cca_models.js', '_sevPill(s)'], ['ffs_module.js', '_sevPill(f.severity)'],
  ['ram_trace.js', '_sevPill(f.severity)'], ['bindings_modules.js', '_sevPill(sev)'], ['event_trees.js', '_sevPill(sev)'],
  ['exposure_case.js', '_sevPill(r.severity)'], ['fta_freq.js', '_sevPill(t.severity)'],
  ['stpa_panel.js', '_sevPill(f.severity)'], ['bowtie.js', '_sevPill(fc.severity)'], ['fta_view_modules.js', '_sevPill(fha.severity)'],
  ['model_checks.js', '_sevPill(r.severity)'], ['fc_variants.js', '_sevPill(f.severity)'], ['hf_severity_badge.js', '_sevPill(hfw.severity)'],
  ['fault_sim.js', '_sevPill(fc.severity)'], ['misc_fn_modules.js', '_sevPill(fr.fha.severity)'], ['safety_lab.js', "_sevPill('Catastrophic')"],
]) check(f + ' renders severities through the shared pill', S(f).includes(needle) && /var _sevPill = function \(s, o\) \{ return \(typeof sevPillHtml === 'function'\)/.test(S(f)));
const bare = [];
for (const f of ['helpers_modules.js', 'asa_triage.js', 'budget_ledger.js', 'fc_tree_flow.js', 'data_ops_modules.js', 'cca_models.js', 'ffs_module.js', 'ram_trace.js', 'bindings_modules.js']) {
  if (/class="cell-[^"]*"[^>]*>' \+ _?esc\([a-z]+\.severity/.test(S(f)) || /class="cell-\$\{esc\(row\.severity\)\}"[^>]*>\$\{esc\(row\.severity\)\}/.test(S(f))) bare.push(f);
}
check('no renderer prints a bare severity string inside a cell-* cell', bare.length === 0, bare.join(', '));
const hexes = [];
for (const f of ['exposure_case.js', 'fault_sim.js', 'fta_freq.js', 'event_trees.js', 'helpers_modules.js', 'misc_fn_modules.js']) {
  // a line that names a severity CLASS and picks its own hex colour for it
  S(f).split('\n').forEach((line, i) => { if (/'(Catastrophic|Hazardous|Major|Minor)'\s*\?\s*'#[0-9a-f]{6}'/i.test(line) || /'(Catastrophic|Hazardous)':\s*'#[0-9a-f]{6}'/i.test(line) && !/SEV_COLORS/.test(S(f).split('\n')[i - 2] || '')) hexes.push(f + ':' + (i + 1)); });
}
check('no renderer picks its own hex colour for a severity class', hexes.length === 0, hexes.join(', '));
check('AI cards use the shared text-safe severity hues', /Catastrophic: 'var\(--sev-cat-fg/.test(S('ai_assistant.js')));
check('severity legend chips say No Safety Effect', !/cell-Negligible">Negligible</.test(S('index.html')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
