#!/usr/bin/env node
/*
 * Regression — picking a fault tree actually switches to it.
 * (26 Aug 2026, Waqas: "this drop downs give you the options but even if you
 * select a different tree it does not work".)
 *
 * THE BUG, one word wide. fta_tree_picker.js read and wrote
 * `window.activeFTAPageId`. The core declares `let activeFTAPageId` at the top
 * level of a classic script — that binding lives in the GLOBAL LEXICAL
 * environment, shared across scripts, and is NOT a property of window. So
 * `window.activeFTAPageId` was a different, unrelated variable, and:
 *   · the change handler set the decoy, leaving the real one untouched, so
 *     updateD3() re-rendered the page already open — selecting did nothing;
 *   · _sig() read the decoy (undefined), so the cached re-render signature never
 *     tracked which tree was open;
 *   · `cur` read the decoy, so the dropdown never marked the open tree selected.
 * Confirmed live before the fix: setting the select's value and dispatching
 * `change` left snapshot().activeFTAPageId unchanged.
 *
 * Every other assignment in the codebase uses the bare identifier — this file
 * was the only one that didn't. ai_assistant.js even carries the warning in a
 * comment on snapshot(): resolve these "by bare identifier (guarded), never
 * window[name]".
 *
 * Run: node tests/regression_fta_tree_picker_switch.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(SITE, 'fta_tree_picker.js'), 'utf8');
const code = src.replace(/^\s*\/\/.*$/gm, '');   // comments explain the bug; only live code is asserted

console.log('\n[picker] the decoy variable is gone from live code');
check('no window.activeFTAPageId anywhere in the picker',
  !/window\.activeFTAPageId/.test(code),
  'window.activeFTAPageId is a different variable from the core\'s lexical activeFTAPageId');
check('the accessors exist and are guarded',
  /function _activeId\(\)/.test(code) && /typeof activeFTAPageId !== 'undefined'/.test(code) &&
  /function _setActiveId\(id\)/.test(code),
  'a bare reference to an undeclared binding throws');
check('the setter writes the BARE identifier',
  /try \{ activeFTAPageId = id;/.test(code));
check('the setter verifies the write landed',
  /return _activeId\(\) === id;/.test(code),
  'assigning into a sealed or shadowed scope would fail silently otherwise');
check('a failed switch is reported, not swallowed',
  /if \(!_setActiveId\(id\)\)/.test(code) && /Could not switch fault tree/.test(code));
check('_sig() and the selected-option marker both read the real binding',
  /String\(_activeId\(\) \|\| ''\)/.test(code) && /var cur = _activeId\(\);/.test(code));

console.log('\n[picker] the handler, executed — with the REAL variable shape');
// Reproduce the core's shape: a lexical binding shared between scripts, plus a
// window object that does NOT carry it. Assigning `activeFTAPageId` inside the
// evaluated code must reach the outer binding, exactly as it does in the browser.
function runHandler(id, opts) {
  opts = opts || {};
  let activeFTAPageId = opts.start === undefined ? 'page-OLD' : opts.start;
  const calls = [];
  const win = {};   // deliberately WITHOUT activeFTAPageId — that is the point
  const body = `
    ${src.match(/function _activeId\(\)[\s\S]*?\n    \}/)[0]}
    ${src.match(/function _setActiveId\(id\)[\s\S]*?\n    \}/)[0]}
    const sel = { value: ID };
    // the change handler's body, transcribed from the source under test
    (function () {
      var id = sel.value;
      if (!id) return;
      try {
        if (!_setActiveId(id)) { calls.push('toast'); return; }
        calls.push('switched');
      } catch (_) { calls.push('threw'); }
    })();
    return { active: activeFTAPageId, calls: calls };
  `;
  // eslint-disable-next-line no-new-func
  const fn = new Function('ID', 'calls', 'window', `
    let activeFTAPageId = ${JSON.stringify(opts.start === undefined ? 'page-OLD' : opts.start)};
    ${body}
  `);
  return fn(id, calls, win);
}
{
  const r = runHandler('page-NEW');
  check('selecting a tree updates the real activeFTAPageId', r.active === 'page-NEW',
    'got ' + r.active + ' — this is the exact live failure');
  check('…and the handler reports a successful switch', r.calls.indexOf('switched') >= 0);
  const same = runHandler('page-OLD');
  check('re-selecting the open tree is a no-op, not an error',
    same.active === 'page-OLD' && same.calls.indexOf('toast') < 0);
}
{
  // the empty option ("— pick a fault tree —") must not blank the canvas
  const body = src.match(/sel\.addEventListener\('change', function \(\) \{[\s\S]*?\n            \}\);/);
  check('the empty option short-circuits before any state write',
    !!body && /var id = sel\.value;\s*\n\s*if \(!id\) return;/.test(body[0]),
    'picking the placeholder must not clear the active tree');
}

console.log('\n[picker] the switch still drives a re-render');
const handler = (src.match(/sel\.addEventListener\('change', function \(\) \{[\s\S]*?\n            \}\);/) || [''])[0];
['syncFtaConfigFromActivePage', 'refreshFTARequiredTarget', 'calculateAllProbabilities', 'renderFTASidebar', 'updateD3']
  .forEach(fnName => check('…' + fnName + ' is still called after the switch', handler.indexOf(fnName) >= 0,
    'switching state without repainting looks identical to the bug being fixed'));

console.log('\n[picker] layout — the button matches the select');
// 26 Aug 2026 (evening) — Waqas: "new fault tree button should be lined up and
// same size as the drop down bar". The select carried 6px padding while the
// button inherited the generic button's 8px 16px, so it sat ~4px taller and
// past the select's edges.
const css = fs.readFileSync(path.join(SITE, 'safety_lab.css'), 'utf8');
check('the row stretches its children to one height',
  /\.fta-tree-pick-host \{ display: flex; align-items: stretch;/.test(css),
  'align-items: center let the taller button float off the select\'s edges');
check('the select takes the remaining width',
  /#fta-tree-pick \{ flex: 1 1 auto;/.test(css) && !/#fta-tree-pick \{[^}]*max-width: 60%/.test(css));
check('the button matches the select\'s padding, font and radius',
  /#fta-tree-new \{ padding: 6px 14px; font-size: 13px; border-radius: var\(--r-sm, 6px\);/.test(css),
  'the generic 8px 16px button padding is what made it taller');
check('the label centers itself so stretching the row does not top-pin its text',
  /\.fta-tree-pick-host label \{[^}]*align-self: center;/.test(css));

// 26 Aug 2026 (batch 46) — the first attempt above measured WRONG live: host
// 43.3px, button 43.3px, select 31.3px. `align-items: stretch` stretches the
// MARGIN box, so a child's border box is row height minus its own vertical
// margins. The generic `input, select, textarea` rule gives every select a
// 12px margin-bottom; the button has none. 43.3 - 12 = 31.3, to the pixel.
// These two checks together are the fix: the generic margin still exists (so
// nothing else in the app moved), and this select opts out of it.
check('the generic select margin — the actual cause — is still there for everything else',
  /input, select, textarea \{[^}]*margin-bottom: var\(--s-3\);/.test(css),
  'if this rule ever goes away the check below stops meaning anything');
check('…and the picker select zeroes its own margin so stretch gives it the full row',
  /#fta-tree-pick \{[^}]*margin: 0;/.test(css),
  'without this the select is exactly 12px shorter than the button it sits beside');
check('the host keeps its bottom margin, so zeroing the select moves nothing below it',
  /\.fta-tree-pick-host \{[^}]*margin: 0 0 var\(--s-3, 12px\);/.test(css));
check('stylesheet pin bumped past the fix (safety_lab.css >= 65.56)', (() => {
  const m = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8').match(/safety_lab\.css\?v=([\d.]+)/);
  return m && parseFloat(m[1]) >= 65.56;
})());

console.log('\n[picker] cache pin');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
check('index.html pins fta_tree_picker.js >= 1.2', (() => {
  const m = idx.match(/fta_tree_picker\.js\?v=([\d.]+)/);
  return m && parseFloat(m[1]) >= 1.2;
})(), 'without a bump the browser serves the broken copy from cache');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
