#!/usr/bin/env node
/*
 * Regression: layout invariants across EVERY panel (build 66.25).
 *
 * Waqas, 19 Aug 2026:
 *   "well you asked the question veere, lets audit all the panels and see what happens,
 *    and fix it"
 *
 * The question was mine, from the node-drawer post-mortem: what does this container do
 * when the content is twice as tall? Four separate complaints about that one drawer all
 * turned out to be a single kind of mistake — a container property that is correct at one
 * content size and wrong at another — and not one of them was reachable by a behavioural
 * test. So this suite does not test behaviour. It reads the markup and the stylesheet and
 * asserts the invariants directly, across index.html, safety_lab.css, and the HTML built
 * inside JS template literals (where most of this app's panels actually live).
 *
 * The first run found 36. This suite holds the line at the allowlist below.
 *
 * ---------------------------------------------------------------------------
 * IMPORTANT — the self-test in section [1] is not ceremony.
 *
 * Every check here is of the form "the scanner found nothing". A scanner that silently
 * stops working therefore reports PERFECT HEALTH. That is the same trap that bit us on
 * 19 Aug with the shared-strictest cap, where `allocateTopDown` guards a dependency with
 * `typeof` and an omitted dependency changed the answer instead of raising. So before
 * trusting a clean sweep, feed the scanner markup that is known to be broken in each of
 * the five ways and require it to complain about each one.
 * ---------------------------------------------------------------------------
 *
 * Run: node tests/regression_layout_invariants.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./lib/layout_scan.js');
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

/* ===========================================================================
 * ALLOWLIST — every entry needs a reason a reviewer can check, not just a name.
 * An entry here is a claim that the finding is a false positive, and the claim
 * has to be falsifiable.
 * =========================================================================== */
const ALLOW = [
  {
    code: 'CLIP',
    where: '.collapsible-form-content.open',
    why: 'The cap and the hidden overflow are both REQUIRED for the open animation ' +
         '(max-height 0 -> 2400px). They stop applying the moment it finishes: ' +
         'wrapFormCollapsible() adds .cfc-settled on transitionend, and ' +
         '.collapsible-form-content.open.cfc-settled sets max-height:none + ' +
         'overflow:visible. The scanner reads one rule at a time and cannot see a ' +
         'companion class applied by JS. Both halves are asserted in section [4] below, ' +
         'so this allowlist entry cannot outlive the fix it excuses.'
  }
];
function allowed(f) {
  return ALLOW.some(a => a.code === f.code && a.where === f.where);
}

/* ========================================================================= */
console.log('\n[1] SELF-TEST — the scanner still detects each defect it claims to');
{
  const css = `
    .selftest-row { display: flex; gap: 10px; }
    .selftest-wide { flex: 1 1 100%; }
    .selftest-shell { max-height: 400px; }
    .selftest-scroll { max-height: 200px; overflow-y: auto; }
    .selftest-host { overflow-y: auto; position: fixed; overscroll-behavior: contain; }
    .selftest-pin { position: absolute; top: 0; bottom: 0; }
    .selftest-col { display: flex; flex-direction: column; max-height: 500px; }
    .selftest-body { flex: 1; overflow-y: auto; }
  `;
  const idx = S.buildCssIndex(S.parseCss(css));
  const codes = html => new Set(S.scanHtmlSource(html, 'selftest', idx).map(f => f.code));

  check('NOWRAP_100 fires on a 100% child in a nowrap row',
    codes('<div class="selftest-row"><div class="selftest-wide">x</div></div>').has('NOWRAP_100'));
  check('NOWRAP_100 does NOT fire once the row wraps',
    !codes('<div class="selftest-row" style="flex-wrap:wrap"><div class="selftest-wide">x</div></div>').has('NOWRAP_100'));
  check('NOWRAP_100 does NOT fire once the row is a column',
    !codes('<div class="selftest-row" style="flex-direction:column"><div class="selftest-wide">x</div></div>').has('NOWRAP_100'));

  check('NOWRAP_CROWD fires on five flex cells in a nowrap row',
    codes('<div class="selftest-row">' + '<div style="flex:1">c</div>'.repeat(5) + '</div>').has('NOWRAP_CROWD'));
  check('NOWRAP_CROWD does NOT fire on four',
    !codes('<div class="selftest-row">' + '<div style="flex:1">c</div>'.repeat(4) + '</div>').has('NOWRAP_CROWD'));

  check('CLIP fires on a cap with no way out',
    codes('<div class="selftest-shell"><p>x</p></div>').has('CLIP'));
  check('CLIP does NOT fire when the cap delegates scrolling to a child',
    !codes('<div class="selftest-shell"><div class="selftest-scroll">x</div></div>').has('CLIP'));

  check('ABS_IN_SCROLL fires on top/bottom pinning inside a scroller',
    codes('<div class="selftest-scroll"><div class="selftest-pin"></div></div>').has('ABS_IN_SCROLL'));
  check('ABS_IN_SCROLL does NOT fire when a positioned ancestor intervenes',
    !codes('<div class="selftest-scroll"><div style="position:relative"><div class="selftest-pin"></div></div></div>').has('ABS_IN_SCROLL'));

  check('CHAIN fires on a bounded scroller with no overscroll-behavior',
    codes('<div class="selftest-scroll">x</div>').has('CHAIN'));
  check('CHAIN does NOT fire once overscroll-behavior is set',
    !codes('<div class="selftest-host">x</div>').has('CHAIN'));
  check('CHAIN sees an overscroll fix delivered through a [style*=…] rule',
    !new Set(S.scanHtmlSource('<div style="max-height:200px; overflow-y: auto;">x</div>', 'selftest',
      S.buildCssIndex(S.parseCss('[style*="overflow-y: auto"] { overscroll-behavior: contain; }')))
      .map(f => f.code)).has('CHAIN'));

  check('FLEX_MINH fires on a scroll pane in a capped flex column',
    codes('<div class="selftest-col"><div class="selftest-body">x</div></div>').has('FLEX_MINH'));
  check('FLEX_MINH does NOT fire once min-height:0 is set',
    !codes('<div class="selftest-col"><div class="selftest-body" style="min-height:0">x</div></div>').has('FLEX_MINH'));

  // Cascade fidelity — the specificity bug that produced a false ABS_IN_SCROLL on the
  // drawer handle: a weaker rule appearing LATER must not beat a stronger earlier one.
  const spec = S.buildCssIndex(S.parseCss(
    '#host .selftest-pin { position: fixed; } .selftest-pin { position: absolute; }'));
  check('a later weaker rule does not overwrite an earlier stronger one',
    S.styleFor({ cls: 'selftest-pin', id: null, inline: {}, styleRaw: '' }, spec).position === 'fixed');
  check('an inline style still beats every stylesheet rule',
    S.styleFor({ cls: 'selftest-pin', id: null, inline: { position: 'static' }, styleRaw: '' }, spec).position === 'static');
}

/* ========================================================================= */
console.log('\n[2] The scanner actually reached the codebase (a silent no-op reads as clean)');
const css = read('safety_lab.css');
const idx = S.buildCssIndex(S.parseCss(css));
const jsFiles = fs.readdirSync(SITE).filter(f => f.endsWith('.js'));
let flexRowsSeen = 0, scrollersSeen = 0;
function census(nodes) {
  nodes.forEach(n => {
    const d = S.styleFor(n, idx);
    if (d.display === 'flex' || d['display'] === 'inline-flex') flexRowsSeen++;
    if (S.isScrollY(d)) scrollersSeen++;
  });
}
{
  census(S.parseHtml(read('index.html'), 'index.html'));
  jsFiles.forEach(f => {
    const src = read(f);
    (src.match(/`(?:\\[\s\S]|[^`\\])*`/g) || []).forEach(lit => {
      if (lit.indexOf('<div') === -1) return;
      census(S.parseHtml(lit.slice(1, -1).replace(/\$\{[^{}]*\}/g, '_'), f));
    });
  });
  check('it parsed the whole site', jsFiles.length > 150, jsFiles.length + ' js files');
  check('it resolved a real population of flex rows', flexRowsSeen > 200, 'rows=' + flexRowsSeen);
  check('it resolved a real population of scroll containers', scrollersSeen > 30, 'scrollers=' + scrollersSeen);
  check('the CSS index is populated', Object.keys(idx.cls).length > 300, 'classes=' + Object.keys(idx.cls).length);
  check('the [style*=…] escape-hatch rules were indexed', idx.attr.length > 0, 'attr rules=' + idx.attr.length);
}

/* ========================================================================= */
console.log('\n[2b] DOCUMENT INTEGRITY — no <script> may be swallowed by a comment');
{
  /* 19 Aug 2026, live outage, self-inflicted. A line-based reorder of script tags in
     index.html moved the tags but left their `<!--` opening lines behind, so two
     dangling comment openings sat immediately above misc_fn_modules.js and
     safety_lab.js. Both tags were INSIDE an unterminated HTML comment: they never
     loaded, and every global they declare — esc, getActiveFTARoot, systemsData,
     acFunctionsData, SUPABASE_PROJECT_URL — vanished. Auth could not initialise, the
     dashboard cockpits were empty, and the console filled with 1000+ ReferenceErrors
     pointing at innocent files.

     The tags still returned 200 when fetched by hand, the files parsed, the byte sizes
     matched dist, and the whole wall was green. Nothing in 155 suites looked at whether
     a script tag was actually REACHABLE. It is cheap to check and it is checked now. */
  const rawHtml = read('index.html');
  const stripped = rawHtml.replace(/<!--[\s\S]*?-->/g, '');
  const srcOf = doc => (doc.match(/<script[^>]+src="([^"]+)"/g) || [])
    .map(t => (/src="([^"]+)"/.exec(t) || [])[1]);
  const all = srcOf(rawHtml), live = new Set(srcOf(stripped));
  const swallowed = all.filter(s => !live.has(s));
  check('every <script src> is outside every comment', swallowed.length === 0,
    swallowed.join(', '));
  check('HTML comment markers balance',
    (rawHtml.match(/<!--/g) || []).length === (rawHtml.match(/-->/g) || []).length,
    'open=' + (rawHtml.match(/<!--/g) || []).length + ' close=' + (rawHtml.match(/-->/g) || []).length);
  // The two that were actually lost, by name — a generic check can pass while the
  // load-bearing files are the ones missing.
  ['misc_fn_modules.js', 'safety_lab.js', 'helpers_modules.js', 'bindings_modules.js',
   'node_identity.js', 'node_identity_ui.js', 'mac_lanes.js'].forEach(f => {
    check('reachable: ' + f, srcOf(stripped).some(s => s.indexOf(f) === 0));
  });
}

console.log('\n[3] THE SWEEP — no panel in the app carries an unexcused finding');
{
  const all = [];
  all.push(...S.scanHtmlSource(read('index.html'), 'index.html', idx));
  all.push(...S.scanCssSource(css));
  jsFiles.forEach(f => { all.push(...S.scanJsSource(read(f), f, idx)); });

  const seen = new Set();
  const uniq = all.filter(f => {
    const k = f.code + '|' + f.origin + '|' + f.where;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  const live = uniq.filter(f => !allowed(f));

  ['NOWRAP_100', 'NOWRAP_CROWD', 'ABS_IN_SCROLL', 'CLIP', 'CHAIN', 'FLEX_MINH'].forEach(code => {
    const hits = live.filter(f => f.code === code);
    check('no unexcused ' + code, hits.length === 0,
      hits.slice(0, 6).map(h => h.origin + ':' + h.line + ' ' + h.where).join(' | ') +
      (hits.length > 6 ? ' (+' + (hits.length - 6) + ')' : ''));
  });

  // An allowlist entry that no longer corresponds to a real finding is dead weight and
  // hides the fact that the underlying fix changed shape. Require each one to still fire.
  ALLOW.forEach(a => {
    check('allowlist entry still describes a real finding: ' + a.where,
      uniq.some(f => f.code === a.code && f.where === a.where));
    check('...and carries a falsifiable reason', a.why && a.why.length > 120);
  });
}

/* ========================================================================= */
console.log('\n[4] The fixes themselves, asserted directly so a revert fails here');
{
  const helpers = read('helpers_modules.js');
  const html = read('index.html');

  check('bounded scrollers contain their overscroll',
    /\.cb-list,[\s\S]{0,400}\{\s*overscroll-behavior: contain;\s*\}/.test(css));
  check('inline-styled scrollers are caught by an attribute rule',
    /\[style\*="overflow-y: auto"\][\s\S]{0,400}overscroll-behavior: contain/.test(css));
  check('the three modal scroll panes can actually shrink (min-height:0)',
    /\.template-editor-body,\s*\.backref-body,\s*\.cmd-palette-results \{\s*min-height: 0;\s*\}/.test(css));
  check('workspace tab strips scroll sideways instead of squashing',
    /\.sys-workspace-nav \{[^}]*overflow-x: auto/.test(css) &&
    /\.sys-workspace-nav button \{[^}]*flex: 0 0 auto/.test(css) &&
    /\.sys-workspace-nav button \{[^}]*white-space: nowrap/.test(css));

  // The collapsible form — both halves, because the allowlist above leans on them.
  check('a settled collapsible form drops its cap and its clipping',
    /\.collapsible-form-content\.open\.cfc-settled \{[^}]*max-height: none/.test(css) &&
    /\.collapsible-form-content\.open\.cfc-settled \{[^}]*overflow: visible/.test(css));
  check('...and JS adds .cfc-settled when the open transition ends',
    /transitionend/.test(helpers) && /classList\.add\('cfc-settled'\)/.test(helpers));
  check('...and takes it back BEFORE closing, so the close still animates',
    /classList\.remove\('cfc-settled'\);\s*\n\s*void wrap\.offsetHeight;/.test(helpers));
  check('...and a form that starts open settles without waiting for a transition',
    /if \(opts\.openByDefault\) wrap\.classList\.add\('cfc-settled'\)/.test(helpers));
  check('the transitionend handler ignores other properties',
    /if \(e && e\.propertyName && e\.propertyName !== 'max-height'\) return;/.test(helpers));

  function pinAtLeast(doc, file, maj, min) {
    const m = new RegExp(file.replace('.', '\\.') + '\\?v=(\\d+)\\.(\\d+)').exec(doc);
    if (!m) return false;
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    return a > maj || (a === maj && b >= min);
  }
  check('safety_lab.css pin bumped', pinAtLeast(html, 'safety_lab.css', 65, 47));
  check('helpers_modules.js pin bumped', pinAtLeast(html, 'helpers_modules.js', 2, 37));
}

console.log('\n' + (fail === 0 ? 'ALL GREEN — ' + pass + ' checks' : 'RED — ' + fail + ' failed, ' + pass + ' passed'));
process.exit(fail === 0 ? 0 : 1);
