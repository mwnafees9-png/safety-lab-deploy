#!/usr/bin/env node
/*
 * regression_kebab_zoom.test.js — kebab menus land under their button under CSS zoom.
 * body carries zoom:0.9. toggleRowMenu positions the position:fixed row-action menu from
 * getBoundingClientRect() (visual px) but an inline left/top is re-scaled by the ancestor zoom,
 * so every kebab menu landed at 0.9x its target (~150px left at the right edge of a wide table —
 * the HF Review column, 1 Sep 2026). Fix: convert visual -> layout by dividing by the effective
 * zoom. Verifies the positioner is zoom-corrected and EXECUTES _cssZoomOf.
 * Run: node tests/regression_kebab_zoom.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const help = fs.readFileSync(path.join(__dirname, '..', 'site', 'helpers_modules.js'), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const fn = help.split('function toggleRowMenu')[1].split('\nfunction ')[0];
console.log('1. positioner is zoom-corrected');
check('_cssZoomOf defined', /function _cssZoomOf\(el\)/.test(help));
check('toggleRowMenu reads the effective zoom of the menu', /const z = _cssZoomOf\(menu\);/.test(fn));
check('menu size measured in visual px (offsetWidth * z)', /\(menu\.offsetWidth \|\| 180\) \* z/.test(fn) && /\(menu\.offsetHeight \|\| 150\) \* z/.test(fn));
check('final left/top divided by z (visual -> layout)', /menu\.style\.left = \(left \/ z\) \+ 'px'/.test(fn) && /menu\.style\.top = \(top \/ z\) \+ 'px'/.test(fn));
check('behaviour is byte-identical when no zoom is set (z === 1 path documented)', /z === 1 => byte-identical/.test(fn));

console.log('2. EXECUTED — _cssZoomOf multiplies ancestor zooms');
const src = (function () { const at = help.indexOf('function _cssZoomOf'); const o = help.indexOf('{', at); let d = 0; for (let i = o; i < help.length; i++) { if (help[i] === '{') d++; else if (help[i] === '}') { d--; if (!d) return help.slice(at, i + 1); } } return null; })();
const mk = (zoom, parent) => ({ nodeType: 1, _zoom: zoom, parentElement: parent || null });
const sb = { parseFloat, isNaN, getComputedStyle: el => ({ zoom: el._zoom }) };
vm.createContext(sb);
vm.runInContext(src + ';this.__z = _cssZoomOf;', sb);
check('no zoom anywhere => 1', sb.__z(mk('1', mk('normal'))) === 1);
check('body zoom 0.9 => 0.9', Math.abs(sb.__z(mk('1', mk('0.9'))) - 0.9) < 1e-9);
check('nested zooms multiply (0.9 * 0.5 = 0.45)', Math.abs(sb.__z(mk('0.5', mk('0.9'))) - 0.45) < 1e-9);
check('a non-numeric zoom is ignored', sb.__z(mk('normal', mk('auto'))) === 1);

console.log('\n' + (fail ? ('FAIL — ' + fail + ' failed, ' + pass + ' passed') : ('OK — all ' + pass + ' checks pass')));
process.exit(fail ? 1 : 0);
