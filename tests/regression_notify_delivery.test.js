#!/usr/bin/env node
/*
 * Regression — the notification path, which was dead for three days (17 Sep 2026).
 *
 * WHAT HAPPENED. Every email the product sends — sign-in, signup, review, and the daily
 * licence-expiry warning — stopped working on 14 Sep and nobody knew until 17 Sep.
 *
 * public.notification_log has rows on every single day from 5 Sep to 14 Sep and then nothing.
 * The daily expiry cron reported SUCCEEDED on every run through 17 Sep. Every reply on record
 * in net._http_response was 401 {"error":"unauthorized"}.
 *
 * THE CAUSE was the 14 Sep hardening (S10) doing its job. The four notify-* functions had been
 * accepting any Bearer of 16+ characters — a real hole — and started requiring an exact match
 * against SUPABASE_SERVICE_ROLE_KEY. But the callers are database triggers, and the Dashboard's
 * supabase_functions.http_request() carries its headers as a STRING LITERAL inside the trigger
 * definition. The literal held a legacy service-role JWT that no longer equalled the key injected
 * into the function. The project refused itself, correctly, and had no idea.
 *
 * THE REASON IT WAS SILENT is the part worth keeping. net.http_post() queues a request and
 * returns an id at once. The cron statement therefore succeeds the instant it hands the request
 * over, and never sees the reply. Fourteen consecutive green runs, zero emails.
 *
 * Run: node tests/regression_notify_delivery.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const FNS = path.join(REPO, 'supabase', 'functions');
const NOTIFY = ['notify-expiry', 'notify-review', 'notify-signin', 'notify-signup'];

console.log('\n[functions] the check is still closed, and no longer depends on one key');
for (const f of NOTIFY) {
  const p = path.join(FNS, f, 'index.ts');
  const s = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  check(f + ': exists', !!s);
  if (!s) continue;
  check(f + ': accepts the purpose-built hook secret',
    /Deno\.env\.get\('NOTIFY_HOOK_SECRET'\)/.test(s),
    'tying notifications to the database master key is what broke them');
  check(f + ': still accepts the service-role key during the changeover',
    /_ctEq\(presented, SERVICE_ROLE_KEY\)/.test(s),
    'dropping this makes deploy order matter, and a wrong order means dead mail again');
  check(f + ': refuses when NEITHER is configured',
    /return okHook \|\| okSvc;/.test(s) && /HOOK_SECRET \? _ctEq/.test(s) && /SERVICE_ROLE_KEY \? _ctEq/.test(s),
    'an empty env var must never mean "let everyone in"');
  check(f + ': compares in constant time, both branches',
    /const okHook = /.test(s) && /const okSvc  = /.test(s) && !/return _ctEq\(presented, HOOK_SECRET\) \|\|/.test(s),
    'returning early on the first match leaks which secret was tried');
  check(f + ': the old any-16-chars check is gone',
    !/length\s*>=?\s*16/.test(s));
}

console.log('\n[gateway] the platform JWT check is off for the machine-called functions');
{
  const cp = path.join(REPO, 'supabase', 'config.toml');
  const c = fs.existsSync(cp) ? fs.readFileSync(cp, 'utf8') : '';
  check('config.toml exists', !!c, 'without it every deploy silently re-enables the gateway check');
  for (const f of NOTIFY) {
    check(f + ': platform JWT check is off',
      // [^\\[]* so the match cannot run past this section into the NEXT function's setting.
      // The first version could, and passed with this very function's gate turned back on.
      new RegExp('\\[functions\\.' + f + '\\][^\\[]*?verify_jwt = false').test(c),
      'the gateway rejects a non-JWT bearer before our own check runs, which forces the hook '
      + 'secret to be the service-role JWT again -- the exact coupling that caused the outage');
  }
  for (const f of ['notify-feedback', 'notify-invite']) {
    check(f + ': platform JWT check stays ON',
      !new RegExp('\\[functions\\.' + f + '\\]').test(c),
      'these are called by a signed-in user from the browser, not by a trigger');
  }
}

console.log('\n[migration] the credential is not in a trigger definition any more');
{
  const mp = path.join(REPO, 'supabase', 'migrations', '20260917a_notify_hook_secret_and_health.sql');
  const m = fs.existsSync(mp) ? fs.readFileSync(mp, 'utf8') : '';
  check('the migration exists', !!m);

  check('the secret is read from Vault at send time',
    /from vault\.decrypted_secrets where name = 'notify_hook_secret'/.test(m),
    'a literal baked into five trigger definitions is what drifted out of step');
  check('the Dashboard webhooks are replaced, not patched',
    /drop trigger if exists "notify-signin-trigger"\s+on auth\.users/.test(m) &&
    /create trigger "notify-signin-trigger"\s+after update on auth\.users/.test(m));
  check('all five callers are swapped',
    ['notify-signin-trigger', 'notify-signup', 'notify-review-assigned',
     'notify-review-comment', 'notify-review-status']
      .every(t => new RegExp('create trigger "' + t + '"').test(m)));

  check('the sender cannot raise',
    /exception when others then[\s\S]{0,400}?exception when others then\s*\n\s*null;/.test(m),
    'two of these triggers are on auth.users, which is written on every sign-in — a mail '
    + 'problem must never be able to block a login');
  check('the sign-in trigger only fires on an actual sign-in',
    /new\.last_sign_in_at is distinct from old\.last_sign_in_at/.test(m));

  check('the function name is recorded when the send happens',
    /into v_req;[\s\S]{0,200}?insert into private\.notify_outbox \(fn, request_id\)/.test(m),
    'the first draft recovered it afterward by joining pg_net\'s queue; pg_net deletes that row '
    + 'once sent, so every failure read "unknown"');
  check('the reply is filled in later by a sweep',
    /update private\.notify_outbox o[\s\S]{0,500}?from net\._http_response r/.test(m));
  check('a send with no reply is not left blank forever',
    /set outcome = 'no reply'[\s\S]{0,120}?queued_at < now\(\) - interval '1 hour'/.test(m));
  check('the sweep runs hourly, not daily',
    /cron\.schedule\('sweep-notify-health', '\d+ \* \* \* \*'/.test(m),
    'pg_net prunes its replies within hours, so a daily sweep would see almost nothing');

  check('the expiry cron no longer scrapes a trigger definition for its credential',
    !/regexp_match\(pg_get_triggerdef/.test(m) &&
    /cron\.schedule\('notify-expiry-daily', '0 8 \* \* \*'[\s\S]{0,120}?private\.notify_post\('notify-expiry'/.test(m),
    'the old command read the Bearer out of a trigger def, so removing the literal would have '
    + 'killed the expiry mail a second time');

  check('none of it is reachable by a signed-in user',
    /revoke all on function private\.notify_post\(text, text, text, jsonb, jsonb\) from public, anon, authenticated;/.test(m) &&
    /revoke all on table private\.notify_outbox from public, anon, authenticated;/.test(m));
}

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);
