#!/usr/bin/env node
/*
 * Regression — /api/upload key allowlist (worker.js).
 *
 * The upload route writes straight into the DOWNLOADS R2 bucket, which is
 * served publicly at updates.safetylabaero.com. The ONLY thing standing between
 * an upload token and arbitrary content at a safetylabaero.com subdomain is the
 * key regex. It was widened from `desktop/` to `desktop/|docs/` on 31 Jul so the
 * welcome deck could be hosted; this suite pins the widening to exactly that and
 * proves the traversal cases still bounce.
 *
 * Run: node tests/regression_upload_keyspace.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');

// Pull the live regex out of the Worker rather than restating it here, so this
// suite cannot drift into agreeing with a rule the Worker no longer applies.
const m = w.match(/if \(!(\/\^[^\n]*?\/)\.test\(key\)\) return j\(\{ error: 'key must be/);
check('the upload key rule is present and extractable', !!m,
  'no `if (!/.../.test(key))` guard found on the /api/upload route');
if (!m) { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exitCode = 1; return; }

const src = m[1];
const body = src.slice(1, src.lastIndexOf('/'));
const flags = src.slice(src.lastIndexOf('/') + 1);
const KEY = new RegExp(body, flags);

const ok = k => KEY.test(k);

// ---- accepted --------------------------------------------------------------
check('desktop/ release artifacts still upload', ok('desktop/SafetyLabAero-mac-arm64.dmg'));
check('desktop/ Windows artifact still uploads', ok('desktop/SafetyLabAero-win-x64.exe'));
check('docs/ is accepted (the welcome deck lives here)',
  ok('docs/Welcome-to-Safety-Lab-Aero.pptx'));
check('docs/ accepts the PDF companion', ok('docs/Welcome-to-Safety-Lab-Aero.pdf'));

// ---- rejected --------------------------------------------------------------
// Each of these would put attacker-chosen bytes on a safetylabaero.com origin.
check('bucket root is refused', !ok('evil.html'));
check('an unlisted prefix is refused', !ok('assets/evil.html'));
check('parent traversal out of desktop/ is refused', !ok('desktop/../evil.html'));
check('parent traversal out of docs/ is refused', !ok('docs/../evil.html'));
check('nested paths under docs/ are refused (flat namespace only)',
  !ok('docs/sub/dir/evil.html'));
check('a leading slash is refused', !ok('/docs/evil.html'));
check('an empty key is refused', !ok(''));
check('a bare prefix with no filename is refused', !ok('docs/'));
check('a prefix that merely starts with docs is refused', !ok('docsx/evil.html'));
check('a prefix that merely starts with desktop is refused', !ok('desktopx/evil.html'));
check('newline smuggling past the anchor is refused', !ok('docs/a.pptx\nevil.html'));
check('query/percent characters are refused', !ok('docs/a.pptx?x=1'));

// ---- the rule stays narrow -------------------------------------------------
// If someone widens this to `.*` the tests above still pass, so assert the shape.
check('the rule is still anchored at both ends',
  body.startsWith('^') && body.endsWith('$'), body);
check('the rule still names an explicit prefix set, not a wildcard',
  /desktop/.test(body) && /docs/.test(body) && !/^\^\.\*/.test(body), body);

// ---- the route is still token-gated ----------------------------------------
check('/api/upload still requires the UPLOAD_TOKEN secret',
  /env\.UPLOAD_TOKEN/.test(w) && /x-upload-token/.test(w) &&
  /token !== env\.UPLOAD_TOKEN\) return j\(\{ error: 'unauthorized' \}, 401\)/.test(w));
check('/api/upload still exposes no read, list or delete action',
  !/DOWNLOADS\.(get|list|delete|head)\b/.test(w));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
