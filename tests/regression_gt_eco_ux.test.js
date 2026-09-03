#!/usr/bin/env node
/*
 * Regression — golden-thread ecosystem panel UX (fta_view_modules.js _gtvShowEco).
 *   The panel must be movable (drag handle → floating, scrollable card, dockable)
 *   so a long thread never clips, and every pill that maps to a real item must be
 *   double-clickable to navigate to it (reusing _gtvNavigateTo).
 * Run: node tests/regression_gt_eco_ux.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const v = S('fta_view_modules.js');
// Isolate the _gtvShowEco function body by BRACE MATCHING, not a fixed char
// budget. The old `start + 6500` window silently fell short once the body grew
// to 8439 chars (30 Jul): the click / Enter / draggable checks landed outside
// the window and read as failures while the shipped code was correct. A window
// that can go stale is a test that lies — match the braces instead.
function fnBody(src, decl) {
    const start = src.indexOf(decl);
    if (start < 0) return '';
    const open = src.indexOf('{', start);
    if (open < 0) return '';
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    return '';   // unbalanced — extraction failed, and the guard below says so
}
const eco = fnBody(v, 'function _gtvShowEco');

// Guard the extractor itself: if isolation ever breaks, fail loudly here rather
// than letting every check below quietly pass or quietly fail for the wrong reason.
check('_gtvShowEco body isolated cleanly (extraction guard)',
  eco.length > 1000 && eco.trim().endsWith('}') && !/function _gtvNavigateTo|function _gtvEcoMakeDraggable/.test(eco),
  'body len ' + eco.length);

check('panel has a drag handle', /id="gt-eco-drag"/.test(eco) && /cursor:move/.test(eco));
check('panel has a close button', /id="gt-eco-close"/.test(eco));
check('pills carry a navigation key when they map to a real item',
  /data-navkey="/.test(eco) && /const nav = !!m\.ref && m\.kind !== 'vv'/.test(eco));
check('single-click a pill navigates via _gtvNavigateTo',
  /addEventListener\('click', go\)/.test(eco) && /_gtvNavigateTo\(m\)/.test(eco));
check('keyboard Enter also opens the pill (a11y)', /e\.key === 'Enter'/.test(eco));
check('tip tells the user to click a pill', /click any pill/i.test(eco) && !/double-click any pill/i.test(eco));
check('calls the draggable helper', /_gtvEcoMakeDraggable\(eco\)/.test(eco));

check('draggable helper floats the card into the viewport and makes it scrollable',
  /function _gtvEcoMakeDraggable/.test(v) && /eco\.style\.position = 'fixed'/.test(v) && /eco\.style\.overflow = 'auto'/.test(v) && /eco\.style\.top = '92px'/.test(v));
check('close button clears content and returns the div to flow',
  /gt-eco-close/.test(v) && /eco\.innerHTML = ''/.test(v));
check('document drag listeners are attached once (no leak per render)',
  /_gtvEcoMakeDraggable\._wired/.test(v));
check('_gtvNavigateTo exists as the navigation resolver', /function _gtvNavigateTo/.test(S('helpers_modules.js')));

const idx = S('index.html');
check('fta_view_modules.js version bumped (≥66.19 — the lock floats forward)', (function () {
  const m = idx.match(/fta_view_modules\.js\?v=66\.(\d+)/); return !!m && parseInt(m[1], 10) >= 19; })());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
