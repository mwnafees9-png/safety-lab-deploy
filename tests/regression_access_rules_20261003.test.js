#!/usr/bin/env node
/*
 * Regression — the 3 Oct 2026 access-rule fixes (security review of 2 Oct, batch 1).
 *
 * What was wrong, in one line each:
 *   - the four live channels (co-editing, locks, project presence, workspace presence) were
 *     PUBLIC: anyone with the publishable key and two ids could read and inject live edits;
 *   - two-factor was enforced only in the browser; the database never asked;
 *   - the password re-check before a sign-off or a lock replaced a two-factor session with a
 *     password-only one (signInWithPassword on the app's own session);
 *   - an editor could move a company project into their own Personal workspace;
 *   - a reviewer could move their assignment onto another review;
 *   - a sign-off sealed the signer's e-mail, role and assurance exactly as the browser sent them;
 *   - the chain checks reported totals across every customer.
 *
 * The database half is proven by customer-install/db/tests/access_rules/run_proof.sh against
 * a real Postgres (45 access checks + 27 channel checks, each rule mutation-proven on 3 Oct).
 * That needs psql, which the wall does not have, so this suite holds the wall's half:
 *   1. the four channels are opened as private, and a public one fails this suite;
 *   2. the only password re-check is SafetyLabMFA.reauthenticate, and it behaves:
 *      wrong password refused; no factor -> checked on the app session as before; factor ->
 *      checked on a separate throwaway sign-in (same account only) so the app session and
 *      its live channels are never dropped to password-only, then the second step; and after
 *      any second step the new token is handed to the live connection;
 *   3. the two migrations carry every rule, and the kit carries identical copies;
 *   4. if SLAB_PROOF_PG is set (e.g. "host=/tmp port=5433 user=postgres"), the SQL proof runs too.
 *
 * Run: node tests/regression_access_rules_20261003.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

(async function () {

// ---------------------------------------------------------------- 1. private channels
console.log('\n[channels] every live channel is opened as private');
const CHANNELS = [
  ['site/crdt_sync.js',       "'slab-crdt:'"],
  ['site/edit_locks.js',      "'slab-locks:'"],
  ['site/presence.js',        "'slab-presence:' + ws + ':' + proj"],
  ['site/helpers_modules.js', "'slab-presence:' + wsId"],
];
function channelIsPrivate(src, marker) {
  const i = src.indexOf('.channel(' + marker);
  if (i < 0) return null;
  const call = src.slice(i, src.indexOf(');', i) + 2);
  return /config:\s*\{\s*private:\s*true/.test(call);
}
for (const [f, marker] of CHANNELS) {
  const r = channelIsPrivate(read(f), marker);
  check(f + ' opens ' + marker + ' as private', r === true, r === null ? 'channel call not found' : 'config.private missing');
}
check('no other slab-* channel is opened anywhere in site/', (() => {
  const files = fs.readdirSync(path.join(REPO, 'site')).filter(f => f.endsWith('.js'));
  let n = 0; for (const f of files) n += (read('site/' + f).match(/\.channel\('slab-/g) || []).length;
  return n === CHANNELS.length;
})(), 'a new slab-* channel needs a rule in 20261003a and a line in this suite');
{
  const src = read('site/crdt_sync.js');
  const mutated = src.replace('{ config: { private: true, broadcast', '{ config: { broadcast');
  check('MUTATION: the co-editing channel made public again is caught', mutated !== src && channelIsPrivate(mutated, "'slab-crdt:'") === false);
}

// ---------------------------------------------------------------- 2. re-authentication
console.log('\n[re-auth] one password re-check, and it keeps a two-factor session two-factor');
const misc = read('site/misc_fn_modules.js'), helpers = read('site/helpers_modules.js');
check('the sign-off goes through SafetyLabMFA.reauthenticate', /async function submitSignoff[\s\S]{0,1600}SafetyLabMFA\.reauthenticate\(email, password\)/.test(misc));
check('the lock password gate goes through SafetyLabMFA.reauthenticate', /function _wsRequirePassword[\s\S]{0,6000}SafetyLabMFA\.reauthenticate\(u\.email, pw\)/.test(helpers));
check('a declined second step never leaves the sign-off screen open', /reason === 'second-step'\) closeSignoffModal\(\)/.test(misc));
{
  // Every signInWithPassword in site/ is either the sign-in screen itself, mfa.js, or the
  // no-mfa.js fallback right beside a reauthenticate call.
  const files = fs.readdirSync(path.join(REPO, 'site')).filter(f => f.endsWith('.js') && !f.startsWith('vendor'));
  const bad = [];
  for (const f of files) {
    const src = read('site/' + f); let i = -1;
    while ((i = src.indexOf('signInWithPassword(', i + 1)) >= 0) {
      const ctx = src.slice(Math.max(0, i - 400), i);
      if (f === 'auth_gate.js' || f === 'mfa.js' || /SafetyLabMFA\.reauthenticate/.test(ctx)) continue;
      bad.push(f + '@' + i);
    }
  }
  check('no other code re-checks a password on the app session', bad.length === 0, bad.join(', '));
}

function loadMFA(opts, source) {
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, value: '', style: {}, textContent: '', focus() {}, remove() {} });
  // app = the app's own session; chk = the throwaway sign-in used to check a password
  const calls = { signIn: 0, signOut: [], verify: 0, chkMade: 0, chkSignIn: 0, chkSignOut: [] };
  const ME = 'u-editor';
  const pwUser = (password) => password === 'right' ? ME : password === 'other' ? 'u-someone-else' : null;
  const client = {
    supabaseUrl: 'https://x.supabase.co', supabaseKey: 'pk',
    auth: {
      signInWithPassword: async ({ password }) => { calls.signIn++; const u = pwUser(password); return u ? { data: { user: { id: u } }, error: null } : { data: null, error: { message: 'Invalid login' } }; },
      signOut: async (o) => { calls.signOut.push(o || {}); return { error: null }; },
      getSession: async () => ({ data: { session: { user: { id: ME, email: 'e@co.test' } } } }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: opts.level || 'aal1', nextLevel: opts.level || 'aal1' }, error: null }),
        listFactors: async () => ({ data: { totp: opts.factors || [], all: opts.factors || [] }, error: null }),
        challengeAndVerify: async ({ code }) => { calls.verify++; return code === '123456' ? { data: {}, error: null } : { data: null, error: { message: 'bad' } }; }
      }
    }
  };
  const makeChk = (url, key, o) => { calls.chkMade++; calls.chkOpts = o; return { auth: {
    signInWithPassword: async ({ password }) => { calls.chkSignIn++; const u = pwUser(password); return u ? { data: { user: { id: u } }, error: null } : { data: null, error: { message: 'Invalid login' } }; },
    signOut: async (x) => { calls.chkSignOut.push(x || {}); return { error: null }; } } }; };
  const store = {};
  const win = { getSupabaseClient: () => client, showToast: () => {},
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } } };
  if (!opts.noCheckClient) win.supabase = { createClient: makeChk };
  const doc = { createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, remove() {}, set innerHTML(v) {} }),
                body: { appendChild() {} }, getElementById: el };
  const sandbox = { window: win, document: doc, localStorage: win.localStorage, console, setTimeout, clearTimeout, Promise, JSON, Date, String, Object, Array };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source || read('site/mfa.js'), sandbox, { filename: 'mfa.js' });
  return { mfa: win.SafetyLabMFA, els, calls };
}
const tick = () => new Promise(r => setTimeout(r, 20));
const VERIFIED = [{ factor_type: 'totp', status: 'verified', id: 'f1' }];
async function run(opts, password, step, source) {
  const t = loadMFA(opts, source);
  const p = t.mfa.reauthenticate('e@co.test', password);
  await tick();
  if (step === 'code' && t.els['mfa-ch-go']) { t.els['mfa-ch-code'].value = '123456'; await t.els['mfa-ch-go'].onclick.call(t.els['mfa-ch-go']); }
  if (step === 'cancel' && t.els['mfa-ch-cancel']) t.els['mfa-ch-cancel'].onclick();
  return { r: await p, calls: t.calls };
}
{
  const { r, calls } = await run({ factors: [] }, 'wrong');
  check('no factor, wrong password: refused, nothing else happens', r.ok === false && r.reason === 'password' && calls.signOut.length === 0);
}
{
  const { r, calls } = await run({ factors: [] }, 'right');
  check('no factor: the password is checked on the app session, as before (database records password_reauth)',
    r.ok === true && calls.signIn === 1 && calls.chkMade === 0 && calls.verify === 0 && calls.signOut.length === 0);
}
{
  const { r, calls } = await run({ factors: VERIFIED }, 'right', 'code');
  check('factor: password checked on a separate sign-in, the app session is never dropped to password-only',
    r.ok === true && calls.signIn === 0 && calls.chkSignIn === 1 && calls.verify === 1 && calls.signOut.length === 0);
  check('factor: the separate sign-in is signed out straight after, and never stored',
    calls.chkSignOut.length === 1 && calls.chkSignOut[0].scope === 'local' && calls.chkOpts.auth.persistSession === false && calls.chkOpts.auth.storageKey === 'slab-reauth-check');
}
{
  const { r, calls } = await run({ factors: VERIFIED }, 'wrong', 'code');
  check('factor, wrong password: refused, no second step, app session untouched', r.ok === false && r.reason === 'password' && calls.verify === 0 && calls.signIn === 0);
}
{
  const { r, calls } = await run({ factors: VERIFIED }, 'other', 'code');
  check('factor, a password for a different account: refused', r.ok === false && r.reason === 'password' && calls.verify === 0);
}
{
  const { r, calls } = await run({ factors: VERIFIED }, 'right', 'cancel');
  check('factor, second step declined: not signed, session left as it was (still two-factor)',
    r.ok === false && r.reason === 'second-step' && calls.signOut.length === 0 && calls.signIn === 0);
}
{
  const { r, calls } = await run({ factors: VERIFIED, noCheckClient: true }, 'right', 'code');
  check('fallback (no separate sign-in possible): password on the app session, then the second step', r.ok === true && calls.signIn === 1 && calls.verify === 1);
  const d = await run({ factors: VERIFIED, noCheckClient: true }, 'right', 'cancel');
  check('fallback, second step declined: signed out locally, never left on a password-only session',
    d.r.ok === false && d.r.reason === 'second-step' && d.calls.signOut.length === 1 && d.calls.signOut[0].scope === 'local');
}
{
  const src = read('site/mfa.js');
  const m1 = src.replace('cr = await chk.auth.signInWithPassword(', 'cr = await sb.auth.signInWithPassword(');
  check('mutation site 1 present', m1 !== src);
  const a = await run({ factors: VERIFIED }, 'right', 'code', m1);
  check('MUTATION: checking the password on the app session is caught (that is what closes the live channels)', a.calls.signIn === 1);
  const m2 = src.replace(' && me && cr.data.user.id === me', '');
  check('mutation site 2 present', m2 !== src);
  const b2 = await run({ factors: VERIFIED }, 'other', 'code', m2);
  check('MUTATION: without the same-account check another account\'s password gets through', b2.r.ok === true);
  const m3 = src.replace('if (!need) return { ok: true };', 'return { ok: true };');
  check('mutation site 3 present', m3 !== src);
  const c = await run({ factors: VERIFIED, noCheckClient: true }, 'right', 'code', m3);
  check('MUTATION: fallback without the second step lets a factor account through on the password alone', c.r.ok === true && c.calls.verify === 0);
}
{
  // supabase-js gives the live connection a new token on SIGNED_IN / TOKEN_REFRESHED only.
  // After the second step the app must hand it over itself (proven on the self-hosted stack:
  // without it a two-factor account's private channels are refused; with it they rejoin).
  check('after the second step the new token goes to the live connection',
    /event === 'MFA_CHALLENGE_VERIFIED' && session && session\.access_token\)[\s\S]{0,700}_supabaseClient\.realtime\.setAuth\(session\.access_token\)/.test(helpers));
}

// ---------------------------------------------------------------- 3. the migrations
console.log('\n[migrations] every rule is written down, and the customer kit carries the same files');
const A = read('supabase/migrations/20261003a_realtime_private_channels.sql');
const B = read('supabase/migrations/20261003b_access_rules_hardening.sql');
const norm = s => s.replace(/--[^\n]*/g, '').replace(/\s+/g, '');
check('kit 19 is the same file as 20261003a', norm(A) === norm(read('customer-install/db/19_realtime_private_channels.sql')));
check('kit 20 is the same file as 20261003b', norm(B) === norm(read('customer-install/db/20_access_rules_hardening.sql')));
check('channels: a receive policy and a send policy on realtime.messages', /create policy slab_channels_receive on realtime\.messages\s+for select/.test(A) && /create policy slab_channels_send on realtime\.messages\s+for insert/.test(A));
check('channels: editors send edits and locks, members receive', /p_sending and kind in \('slab-crdt', 'slab-locks'\)[\s\S]{0,80}can_edit_workspace/.test(A) && /is_workspace_member\(ws\)/.test(A));
check('channels: skipped cleanly on a Postgres without Realtime', /to_regclass\('realtime\.messages'\) is null/.test(A));
check('two-factor: the rule is "verified factor needs aal2", nothing more', /auth\.jwt\(\) ->> 'aal', ''\) = 'aal2'/.test(B) && /f\.status::text = 'verified'/.test(B));
check('two-factor: the membership helpers carry it', ['workspace_role', 'is_workspace_member', 'owns_workspace'].every(fn => new RegExp('function private\\.' + fn + '[\\s\\S]{0,400}mfa_satisfied\\(\\)').test(B)));
check('two-factor: the migration refuses to run if it cannot read the factor table', /perform 1 from auth\.mfa_factors limit 1;[\s\S]{0,120}raise exception/.test(B));
check('project move refused by a trigger', /create trigger sl_guard_project_workspace before update on public\.projects/.test(B));
check('review assignment cannot change review or person', /create trigger sl_guard_review_assignment before update on public\.review_assignments/.test(B));
check('sign-off identity set before the chain seals it (trigger name sorts first)', /create trigger trg_signoffs_a_identity before insert on public\.signoffs/.test(B) && 'trg_signoffs_a_identity' < 'trg_signoffs_chain');
check('sign-off assurance stays inside the column\'s allowed values', /then 'mfa'[\s\S]{0,200}then 'password_reauth'[\s\S]{0,40}else 'session'/.test(B));
check('apply.sh runs 19 and 20 in order', /18_verify_wrappers_match_inner 19_realtime_private_channels 20_access_rules_hardening;/.test(read('customer-install/db/apply.sh')));

// ---------------------------------------------------------------- 4. the SQL proof, when a Postgres is at hand
console.log('\n[proof] the database proof');
if (process.env.SLAB_PROOF_PG) {
  const env = Object.assign({}, process.env);
  for (const kv of process.env.SLAB_PROOF_PG.split(/\s+/)) { const [k, v] = kv.split('='); if (k === 'host') env.PGHOST = v; if (k === 'port') env.PGPORT = v; if (k === 'user') env.PGUSER = v; }
  for (const f of ['checks_access.txt', 'checks_realtime.txt']) {
    const r = cp.spawnSync('bash', [path.join(REPO, 'customer-install/db/tests/access_rules/run_proof.sh'), f], { env, encoding: 'utf8' });
    const last = (r.stdout || '').trim().split('\n').pop();
    check('SQL proof ' + f + ': ' + last, r.status === 0, (r.stdout || '') + (r.stderr || ''));
  }
} else {
  console.log('  SKIP  SLAB_PROOF_PG not set (the proof needs psql; see run_proof.sh)');
}

console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
