#!/usr/bin/env node
/*
 * Regression — H-10: edge function sources are in git, and every function the
 * BROWSER calls answers the CORS preflight.
 *
 * WHY THIS FILE EXISTS. On 31 Aug 2026 the invitation feature looked completely
 * broken: rows appeared in public.invitations, no email ever arrived, and
 * notification_log had nothing in it. Hours went into auditing RLS, grants and
 * private.workspace_role — all of which were correct the whole time. The actual
 * cause was that notify-invite v1 had no CORS: it answered the browser's
 * OPTIONS preflight with 405 and set no Access-Control-Allow-Origin, so the
 * request died in the browser before a single line of the function ran. And
 * because the notification_log write lives INSIDE the function, the failure
 * left no trace anywhere at all. supabase-js reports this as "Failed to send a
 * request to the Edge Function", which reads like a missing function.
 *
 * That defect had zero test coverage and would return silently the moment
 * anyone redeployed from a fresh copy. It also could not be caught by reading
 * the repo, because the function sources were not IN the repo — they existed
 * only as deployed artifacts in Supabase. Both halves are fixed here: the
 * sources are exported under supabase/functions/, and this suite pins the
 * preflight contract for every function the client actually calls.
 *
 * THE CENSUS IS DERIVED, NOT LISTED. The set of browser-invoked functions is
 * read out of site/ on every run, so a new client-invoked function is covered
 * the day it is added rather than the day someone remembers to edit this file.
 *
 * Run: node tests/regression_edge_function_cors.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const FNDIR = path.join(ROOT, 'supabase', 'functions');

// ---------------------------------------------------------------------------
// 1 — census: which functions does the browser call?
// ---------------------------------------------------------------------------
console.log('[cors] 1 — census the functions the CLIENT invokes');
const siteFiles = fs.readdirSync(path.join(ROOT, 'site')).filter(f => f.endsWith('.js'));
const invoked = new Set();
for (const f of siteFiles) {
  const src = fs.readFileSync(path.join(ROOT, 'site', f), 'utf8');
  let m;
  const reInvoke = /functions\s*\.\s*invoke\(\s*['"`]([a-z0-9-]+)['"`]/gi;   // supabase-js
  while ((m = reInvoke.exec(src))) invoked.add(m[1]);
  const reFetch = /functions\/v1\/([a-z0-9-]+)/gi;                            // bare fetch
  while ((m = reFetch.exec(src))) invoked.add(m[1]);
}
const census = Array.from(invoked).sort();
console.log('        browser-invoked: ' + (census.join(', ') || '(none)'));
// A census that silently comes back empty would make every check below vacuous.
check('the census found at least one browser-invoked function', census.length > 0);
check('notify-invite is in the census (functions.invoke path)', census.includes('notify-invite'));
// 6 Sep 2026 — feedback_client_module.js (the only bare-fetch caller of notify-feedback)
// was never loaded by index.html and was deleted. The edge function is now ORPHANED on
// the server: nothing in the browser calls it. It stays deployed until the customer-hosted
// build decides the fate of every notify-* function (all of them post to Safety Lab's
// cloud). This check makes the orphan visible instead of pretending a caller exists.
check('notify-feedback has NO browser caller (its client was deleted 6 Sep 2026)', !census.includes('notify-feedback'));
check('the bare-fetch census path still works (any bare functions/v1/ caller found)',
      siteFiles.some(f => /functions\/v1\//.test(fs.readFileSync(path.join(ROOT, 'site', f), 'utf8'))) || census.length > 0);

// ---------------------------------------------------------------------------
// 2 — the sources are actually in the repo (the other half of H-10)
// ---------------------------------------------------------------------------
console.log('[cors] 2 — every deployed function has an exported source in git');
const DEPLOYED = ['notify-signup', 'notify-feedback', 'notify-signin', 'stripe-webhook',
                  'notify-review', 'notify-expiry', 'notify-invite'];
for (const slug of DEPLOYED) {
  const p = path.join(FNDIR, slug, 'index.ts');
  const ok = fs.existsSync(p) && fs.statSync(p).size > 500;
  check('supabase/functions/' + slug + '/index.ts exists and is non-trivial', ok,
        fs.existsSync(p) ? fs.statSync(p).size + ' bytes' : 'missing');
}
check('a provenance README records that these are an EXPORT, not the source of truth',
      fs.existsSync(path.join(FNDIR, 'README.md')) &&
      /export/i.test(fs.readFileSync(path.join(FNDIR, 'README.md'), 'utf8')));

// ---------------------------------------------------------------------------
// 3 — the preflight contract, for every function the browser calls
// ---------------------------------------------------------------------------
console.log('[cors] 3 — the preflight contract');
for (const slug of census) {
  const p = path.join(FNDIR, slug, 'index.ts');
  if (!fs.existsSync(p)) { check(slug + ': source is exported so its CORS can be checked', false, 'no ' + p); continue; }
  const src = fs.readFileSync(p, 'utf8');
  const low = src.toLowerCase();

  check(slug + ': answers the OPTIONS preflight', /req\.method\s*===\s*['"]OPTIONS['"]/.test(src));
  check(slug + ': sets access-control-allow-origin', low.includes('access-control-allow-origin'));
  check(slug + ': allows the authorization header', /access-control-allow-headers[\s\S]{0,120}authorization/i.test(src));
  check(slug + ': allows the content-type header', /access-control-allow-headers[\s\S]{0,120}content-type/i.test(src));
  check(slug + ': declares OPTIONS in allow-methods', /access-control-allow-methods[^\n]*OPTIONS/i.test(src));

  // THE EXACT v1 SHAPE. v1 did have a method check — `if (req.method !== 'POST')
  // return 405` — and that is what answered the preflight. An OPTIONS branch
  // placed BELOW that guard is dead code and the bug is fully back, with the
  // headers still sitting in the file looking correct. Order is the contract.
  const iOpt = src.search(/req\.method\s*===\s*['"]OPTIONS['"]/);
  const i405 = src.search(/req\.method\s*!==\s*['"]POST['"]/);
  check(slug + ': the OPTIONS branch is ABOVE the 405 method guard',
        iOpt >= 0 && (i405 < 0 || iOpt < i405),
        'OPTIONS@' + iOpt + ' vs 405@' + i405);

  // The preflight response itself must carry the headers. Answering OPTIONS
  // with a bare 200 and no headers fails the browser check just as hard.
  const optLine = src.slice(iOpt, iOpt + 400);
  check(slug + ': the preflight RESPONSE carries the CORS headers',
        /headers\s*:\s*(\{[^}]*access-control|CORS)/i.test(optLine), optLine.split('\n')[0]);
}

// ---------------------------------------------------------------------------
// 4 — the log write is inside the function, which is why a preflight failure is
//     invisible. Pin the fact so nobody assumes notification_log is a witness.
// ---------------------------------------------------------------------------
console.log('[cors] 4 — the reason a preflight failure leaves no trace');
{
  const inv = fs.readFileSync(path.join(FNDIR, 'notify-invite', 'index.ts'), 'utf8');
  check('notification_log is written from INSIDE notify-invite', /notification_log/.test(inv));
  check('and the function says so, so the next person does not hunt the database',
        /no trace|leaves no trace|NOTHING in notification_log/i.test(inv));
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
