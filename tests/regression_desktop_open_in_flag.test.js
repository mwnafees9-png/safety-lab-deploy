#!/usr/bin/env node
/*
 * Regression — the web offers "Open this project in the desktop app" (12 Sep 2026).
 *
 * WHY: helpers_modules._acctOpenInRow hides the web→desktop link until index.html sets
 * window.SL_DESKTOP_APP_READY = true. Desktop 0.16.0 (7 Sep) registers the safetylab://
 * handler and the flag was flipped that day — but index.html was never committed with it,
 * and a later revert of the file (git show HEAD:) silently removed it. The live site hid
 * the link for five days and nothing noticed. This suite makes the flag a guarded fact:
 * the inline flag must be present, set to true, sit BEFORE helpers_modules.js loads its
 * reader, and the reader must still key on that exact global.
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const idx = S('index.html'), helpers = S('helpers_modules.js');

console.log('\n[open-in-desktop] the web→desktop link is switched on');
const m = idx.match(/<script>\s*window\.SL_DESKTOP_APP_READY\s*=\s*(true|false)\s*;?\s*<\/script>/);
check('index.html sets window.SL_DESKTOP_APP_READY inline', !!m);
check('the flag is TRUE (desktop 0.16.0 registers safetylab://)', !!m && m[1] === 'true', m ? ('value ' + m[1]) : 'absent');
check('the flag is set exactly once', (idx.match(/window\.SL_DESKTOP_APP_READY\s*=/g) || []).length === 1);
const flagAt = idx.indexOf('window.SL_DESKTOP_APP_READY');
const readerAt = idx.indexOf('helpers_modules.js?v=');
check('the flag is set before helpers_modules.js is loaded', flagAt > 0 && readerAt > 0 && flagAt < readerAt, 'flag@' + flagAt + ' helpers@' + readerAt);
check('helpers_modules._acctOpenInRow still keys on window.SL_DESKTOP_APP_READY === true',
      /window\.SL_DESKTOP_APP_READY\s*!==\s*true/.test(helpers));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
