#!/usr/bin/env node
/*
 * Regression — the audit log has a writer, and append-only means append-only (16 Sep 2026).
 *
 * SL-WP-0003 Data Security v3.0 section 17 is in a customer's hands. It says the audit log is
 * hash-chained and append-only, that append-only is "enforced at the database-privilege level
 * rather than by convention", and lists tamper-evident audit logging among the SOC 2 controls
 * "already operating". Against the running databases, three things were wrong:
 *
 *   1. Nothing ever wrote an entry. Both audit tables held ZERO rows. The table, the chain
 *      trigger, the immutability trigger and the read policies were all present and correct.
 *      The vault was built and locked and nothing was ever put in it.
 *   2. verify_signoff_chain was SECURITY INVOKER calling into schema private, which
 *      `authenticated` has no USAGE on, so the "re-verify on demand" button returned
 *      "permission denied for schema private" for every real user. It looked fine when
 *      verified as a privileged role; it has to be run as the role that calls it.
 *   3. TRUNCATE was still granted to anon and authenticated on signoffs, project_baselines
 *      and destruction_certificates, and on both audit tables in the customer bundle.
 *      TRUNCATE ignores row policies and does not fire row triggers, so neither RLS nor
 *      audit_immutable sees it. Demonstrated on the throwaway: as an ordinary `authenticated`
 *      role, `truncate public.audit_log` succeeded and left zero rows.
 *
 * This suite pins all three, in both the hosted migration and the customer bundle, and pins
 * the client call sites that make the writer actually fire. A writer nobody calls is the
 * defect this whole file exists to prevent recurring.
 *
 * Run: node tests/regression_audit_writers.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(REPO, p));

const MIG = 'supabase/migrations/20260916c_audit_writers_and_ledger_lockdown.sql';
const CUS = 'customer-install/db/09_audit_writers_and_ledger_lockdown.sql';

// The five ledgers the paper describes as append-only. Each one is a claim someone can check.
const LEDGERS = ['audit_log', 'workspace_audit', 'signoffs', 'project_baselines', 'destruction_certificates'];

console.log('\n[audit] the migration exists and is in the repo, not just in a chat');
check('hosted migration is in the repo', exists(MIG));
check('customer bundle file is in the repo', exists(CUS));
const sql = exists(MIG) ? read(MIG) : '';
const cus = exists(CUS) ? read(CUS) : '';

console.log('\n[audit] there is a writer for each audit table');
for (const s of [[MIG, sql], [CUS, cus]]) {
  check(s[0] + ': audit_workspace_event exists',
    /create or replace function public\.audit_workspace_event\(/.test(s[1]));
  check(s[0] + ': audit_ai_call exists',
    /create or replace function public\.audit_ai_call\(/.test(s[1]));
  check(s[0] + ': the workspace writer actually inserts into workspace_audit',
    /insert into public\.workspace_audit/.test(s[1]));
  check(s[0] + ': the AI writer actually inserts into audit_log',
    /insert into public\.audit_log/.test(s[1]));
}

console.log('\n[audit] the writers stamp the actor server side and require membership');
for (const s of [[MIG, sql], [CUS, cus]]) {
  check(s[0] + ': the workspace event row takes auth.uid(), not a caller-supplied id',
    /values \(p_workspace, auth\.uid\(\), left\(trim\(p_event\), 64\)/.test(s[1]),
    'a caller-supplied actor makes the log forgeable, which is the opposite of the point');
  check(s[0] + ': writing into a workspace you are not in is refused',
    /private\.workspace_role\(p_workspace\) is null then raise exception/.test(s[1]));
  check(s[0] + ': neither writer is callable by anon',
    (s[1].match(/from public, anon;/g) || []).length >= 4);
}

console.log('\n[audit] no prompt or response content can enter the log');
for (const s of [[MIG, sql], [CUS, cus]]) {
  const body = s[1];
  check(s[0] + ': audit_ai_call takes no content parameter',
    !/p_(prompt|response|content|text|body)\b/.test(body),
    "customer data never touches Safety Lab's cloud, not even as an audit record");
  check(s[0] + ': the reason is written down, not just implied',
    /CONTENT NEVER GOES IN/.test(body));
}

console.log('\n[audit] the on-demand verification works for the role that calls it');
for (const s of [[MIG, sql], [CUS, cus]]) {
  check(s[0] + ': private.verify_audit_chain exists',
    /create or replace function private\.verify_audit_chain\(\)/.test(s[1]));
  for (const fn of ['verify_audit_chain', 'verify_signoff_chain']) {
    const re = new RegExp('create or replace function public\\.' + fn + '\\(\\)[\\s\\S]{0,400}?security definer');
    check(s[0] + ': public.' + fn + ' is SECURITY DEFINER', re.test(s[1]),
      'INVOKER cannot reach schema private; authenticated has no USAGE on it');
  }
  check(s[0] + ': both verifiers are granted to authenticated',
    (s[1].match(/grant\s+execute on function public\.verify_\w+_chain\(\)\s+to authenticated/g) || []).length === 2);
}

console.log('\n[audit] pgcrypto is reachable from the definer functions');
// digest() lives in schema extensions on a Supabase project. A definer pinned to public,pg_temp
// cannot resolve it and the verifier errors at the first row.
check('the hash verifier can resolve digest()',
  /create or replace function private\.verify_audit_chain\(\)[\s\S]{0,300}?search_path to 'public', 'extensions', 'pg_temp'/.test(sql),
  "digest() is in schema extensions; a search_path of public,pg_temp cannot see it");

console.log('\n[audit] TRUNCATE is revoked on every append-only ledger');
for (const s of [[MIG, sql], [CUS, cus]]) {
  for (const t of LEDGERS) {
    const re = new RegExp('revoke[^;]*truncate[^;]*on public\\.' + t + '\\s+from[^;]*anon[^;]*authenticated', 'i');
    check(s[0] + ': truncate revoked on ' + t, re.test(s[1]),
      'TRUNCATE ignores RLS and fires no row trigger, so audit_immutable never sees it');
  }
}
for (const s of [[MIG, sql], [CUS, cus]]) {
  for (const verb of ['update', 'delete']) {
    check(s[0] + ': ' + verb + ' revoked alongside truncate on all five ledgers',
      (s[1].match(new RegExp('revoke[^;]*\\b' + verb + '\\b[^;]*on public\\.(' + LEDGERS.join('|') + ')', 'gi')) || []).length === LEDGERS.length);
  }
}

console.log('\n[audit] the customer bundle actually applies the file');
const apply = read('customer-install/db/apply.sh');
check('apply.sh runs 09_audit_writers_and_ledger_lockdown',
  /09_audit_writers_and_ledger_lockdown/.test(apply),
  'a file in the bundle directory that apply.sh skips is a file no customer ever runs');
check('it runs after the vault it depends on',
  apply.indexOf('08_user_secrets_vault') < apply.indexOf('09_audit_writers_and_ledger_lockdown'));

console.log('\n[audit] the client calls the writers — the defect was a writer nobody called');
const core = read('site/core_modules.js');
const hm = read('site/helpers_modules.js');
const mfm = read('site/misc_fn_modules.js');

check('SLAudit is defined once, in helpers_modules', /window\.SLAudit = \{/.test(hm));
check('SLAudit.workspace calls the workspace writer', /rpc\('audit_workspace_event'/.test(hm));
check('SLAudit.aiCall calls the AI writer', /rpc\('audit_ai_call'/.test(hm));
check('every AI call is logged — _logCall fires the server record',
  /function _logCall\([\s\S]{0,900}?window\.SLAudit\.aiCall\(\{/.test(core),
  'client-side telemetry only was the original state: the table stayed empty');
check('a baseline cut is recorded', /SLAudit\.workspace\('baseline\.cut'/.test(hm));
check('a review request is recorded', /SLAudit\.workspace\('review\.requested'/.test(mfm));
check('a review decision is recorded', /SLAudit\.workspace\('review\.decided'/.test(mfm));

console.log('\n[audit] audit writing never breaks the thing being audited');
// A failed audit insert must not fail the AI call, the baseline or the review. Every call site
// is wrapped, and the RPC promise has a rejection handler so it cannot surface as unhandled.
for (const [n, s, pat] of [
  ['core_modules', core, /try \{[\s\S]{0,600}?window\.SLAudit\.aiCall[\s\S]{0,600}?\} catch \(_\) \{\}/],
  ['helpers_modules', hm, /try \{ window\.SLAudit\.workspace\('baseline\.cut'[\s\S]{0,200}?\} catch \(_\) \{\}/],
  ['misc_fn_modules', mfm, /try \{ window\.SLAudit\.workspace\('review\.requested'[\s\S]{0,200}?\} catch \(_\) \{\}/],
]) check(n + ' call site is wrapped so a failed audit cannot break the operation', pat.test(s));
check('the RPC has a rejection handler', /\.then\(function \(\) \{\}, function \(\) \{\}\)/.test(hm));

console.log('\n[schedule] the chain is verified on a schedule, and the schedule leaves evidence');
const MIGD = 'supabase/migrations/20260916d_scheduled_chain_verification.sql';
const CUSD = 'customer-install/db/10_scheduled_chain_verification.sql';
check('hosted scheduled-verification migration is in the repo', exists(MIGD));
check('customer scheduled-verification file is in the repo', exists(CUSD));
const sqd = exists(MIGD) ? read(MIGD) : '';
const cud = exists(CUSD) ? read(CUSD) : '';

for (const s2 of [[MIGD, sqd], [CUSD, cud]]) {
  check(s2[0] + ': there is somewhere to record a verification',
    /create table if not exists public\.chain_verifications/.test(s2[1]),
    'a verification that leaves no record cannot be shown to a reviewer, which is the point');
  check(s2[0] + ': the runner records every run', /insert into public\.chain_verifications/.test(s2[1]));
  check(s2[0] + ': the runner covers both chains',
    /verify_audit_chain\(\)/.test(s2[1]) && /verify_signoff_chain\(\)/.test(s2[1]));
  check(s2[0] + ': a job is registered, not just a function written',
    /cron\.schedule\('verify-audit-chains-daily'/.test(s2[1]),
    'a runner nobody schedules is the same defect as a writer nobody calls');
  check(s2[0] + ': re-applying does not stack duplicate jobs',
    /cron\.unschedule\('verify-audit-chains-daily'\)/.test(s2[1]));
  check(s2[0] + ': the record is readable by a signed-in user',
    /create policy chain_verifications_read[\s\S]{0,120}?for select to authenticated/.test(s2[1]));
  check(s2[0] + ': the record cannot be rewritten by an application role',
    /revoke all on public\.chain_verifications from anon, authenticated/.test(s2[1]));
  check(s2[0] + ': the sequence is locked down too, not just the table',
    /revoke all on sequence public\.chain_verifications_id_seq/.test(s2[1]));
  check(s2[0] + ': the runner is not callable by an application role',
    /revoke execute on function private\.run_chain_verification\(text\) from public, anon, authenticated/.test(s2[1]));
}
check('the customer bundle does not assume pg_cron exists',
  /if exists \(select 1 from pg_extension where extname = 'pg_cron'\)/.test(cud),
  'a self-hosted Postgres may not have pg_cron; the file has to apply cleanly either way');
check('and says so loudly rather than skipping in silence',
  /raise warning 'pg_cron is not installed/.test(cud));
check('apply.sh runs the scheduled-verification file', /10_scheduled_chain_verification/.test(read('customer-install/db/apply.sh')));

console.log('\n[schedule] the break-glass path leaves a trail');
for (const s2 of [[MIGD, sqd], [CUSD, cud]]) {
  check(s2[0] + ': there is somewhere for a maintenance event to land',
    /create table if not exists private\.maintenance_events/.test(s2[1]));
  check(s2[0] + ': all three maintenance hatches record their use',
    (s2[1].match(/perform private\.record_maintenance\(/g) || []).length === 3,
    'audit, change journal and problem events each have a hatch; a silent one is the hole');
  check(s2[0] + ': the trail is not readable or writable by an application role',
    /revoke all on private\.maintenance_events from public, anon, authenticated/.test(s2[1]));
  check(s2[0] + ': the refusal path is unchanged',
    (s2[1].match(/using errcode = 'insufficient_privilege'/g) || []).length === 3);
  check(s2[0] + ': the recorder is definer, so the trail is written whoever reached for the hatch',
    /create or replace function private\.record_maintenance[\s\S]{0,200}?security definer/.test(s2[1]));
}

console.log('\n[audit] the trust page describes what is now true');
const trust = read('site/trust.html');
check('the audit claim no longer says only that activity "is recorded for accountability"',
  !/workspace and review activity is recorded for accountability\.<\/li>/.test(trust),
  'that line was true of the schema and false of the data for the life of the product');
check('the trust page names what is logged', /baseline/i.test(trust) && /sign-?off/i.test(trust));
check('the trust page says the verification is scheduled, matching the cron job',
  /scheduled job re-verifies/.test(trust));
check('the trust page discloses the break-glass path rather than implying there is none',
  /break-glass/.test(trust));

console.log('\n[audit] the pins moved, or browsers keep serving bundles with no writer');
const idx = read('site/index.html');
const pin = (n) => { const m = idx.match(new RegExp(n + '\\.js\\?v=([0-9.]+)')); return m && m[1]; };
check('core_modules pin is past the writerless build', pin('core_modules') !== '1.7', pin('core_modules'));
check('helpers_modules pin is past the writerless build', pin('helpers_modules') !== '3.6', pin('helpers_modules'));
check('misc_fn_modules pin is past the writerless build', pin('misc_fn_modules') !== '66.67', pin('misc_fn_modules'));

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);
