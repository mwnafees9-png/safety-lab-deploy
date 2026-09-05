/*
 * regression_signed_out_posture.test.js — 30 Aug 2026.
 * Found during the F1c live-verify: a signed-out tab surfaced
 * "permission denied for function is_workspace_member" RAW in the
 * cloud-projects panel (server grants for authenticated users verified
 * intact via SQL — the error is simply what anon gets from RLS helpers).
 * Signed-out is a STATE, not an error: cloud surfaces short-circuit to a
 * sign-in prompt instead of fetching, and RLS-family errors that still
 * reach a catch are translated before a user sees them.
 *
 * Mutations proven red at build time: translator returns raw text; a
 * surface interpolates e.message again; the signed-out short-circuit
 * dropped; the sign-in button removed from the prompt.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok   ' + name);
  else { failures++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

function extractFn(source, name) {
  const at = source.indexOf('function ' + name + '(');
  if (at < 0) return null;
  const open = source.indexOf('{', at);
  let d = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') d++;
    else if (source[i] === '}') { d--; if (!d) return source.slice(at, i + 1); }
  }
  return null;
}

/* ------------------------------------------------------------------ */
console.log('1. the translator (executed both signed-out and signed-in)');

const soFn = extractFn(src, '_cloudSignedOut');
const errFn = extractFn(src, '_cloudErrText');
const htmlFn = extractFn(src, '_signedOutCloudHtml');
check('all three helpers extracted', !!soFn && !!errFn && !!htmlFn);

if (soFn && errFn && htmlFn) {
  function sandbox(signedIn) {
    const sb = { console, String, RegExp, esc: (x) => String(x) };
    sb._supabaseSession = signedIn ? { user: { id: 'u1' } } : null;
    vm.createContext(sb);
    vm.runInContext(soFn + errFn + htmlFn +
      ';globalThis.__so = _cloudSignedOut; globalThis.__t = _cloudErrText; globalThis.__h = _signedOutCloudHtml;', sb);
    return sb;
  }
  const out = sandbox(false), inn = sandbox(true);
  const RLS = { message: 'permission denied for function is_workspace_member' };

  check('signed-out detection', vm.runInContext('__so()', out) === true &&
    vm.runInContext('__so()', inn) === false);
  const t1 = vm.runInContext('__t(' + JSON.stringify(RLS) + ')', out);
  check('signed out + RLS error -> plain-language state, raw string GONE',
    /signed out/i.test(t1) && /saved locally/i.test(t1) && !/is_workspace_member/.test(t1), t1);
  const t2 = vm.runInContext('__t(' + JSON.stringify(RLS) + ')', inn);
  check('signed IN + RLS error -> a real problem, said without the raw string',
    /permissions refused/i.test(t2) && !/is_workspace_member/.test(t2), t2);
  check('row-level security phrasing translates too',
    /signed out/i.test(vm.runInContext('__t({ message: "new row violates row-level security policy" })', out)));
  const t3 = vm.runInContext('__t({ message: "fetch failed: network down" })', out);
  check('non-RLS errors pass through untouched', t3 === 'fetch failed: network down', t3);
  const h = vm.runInContext('__h("see your cloud projects")', out);
  check('signed-out prompt carries a Sign in button wired to the existing auth flow',
    /Sign in<\/button>/.test(h) && /connectWorkspace\(\)/.test(h) && /openSignupModal\(\)/.test(h));
  check('prompt says work is safe locally', /saved locally/i.test(h));
}

/* ------------------------------------------------------------------ */
console.log('2. the surfaces (no raw e.message on any cloud panel path)');

check('cloud projects modal short-circuits to the prompt before fetching',
  /if \(_cloudSignedOut\(\)\) \{   \/\/ signed-out is a state, not a fetch error/.test(src) &&
  /_signedOutCloudHtml\('see your cloud projects'\)/.test(src));
check('version history short-circuits the same way',
  /_signedOutCloudHtml\('see version history'\)/.test(src));
check('saveProjectToCloud gates on signed-out, not just client presence',
  /if \(!client \|\| _cloudSignedOut\(\)\) \{/.test(src));
check('cloud-projects list catch renders the TRANSLATED text',
  /Failed to load: ' \+ esc\(_cloudErrText\(e\)\)/.test(src));
check('version-history catch renders the TRANSLATED text',
  /Failed to load history: ' \+ esc\(_cloudErrText\(e\)\)/.test(src));
check('cloud-save toast renders the TRANSLATED text',
  // 3 Sep 2026: the writer returns { reason: 'error', error } and the caller translates it
  /'Cloud save failed: ' \+ _cloudErrText\(r\.error\)/.test(src));
check('no cloud panel path interpolates raw e.message any more',
  !/Failed to load: ' \+ esc\(e\.message/.test(src) && !/Failed to load history: ' \+ esc\(e\.message/.test(src) &&
  !/'Cloud save failed: ' \+ \(e\.message/.test(src));

/* ------------------------------------------------------------------ */
console.log('3. pin (floor)');
const pm = indexSrc.match(/helpers_modules\.js\?v=([\d.]+)/);
check('helpers_modules pin floor >= 2.56', !!pm && parseFloat(pm[1]) >= 2.56, pm && pm[1]);

console.log(failures ? ('FAILED — ' + failures + ' check(s)') : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
