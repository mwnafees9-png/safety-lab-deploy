// tests/regression_invitations.test.js — the workspace invitation feature
// (31 Aug 2026). Waqas: "invite button is not working".
//
// It was not broken. inviteWorkspaceMember() inserted a row into
// public.invitations and stopped: no email function existed, the table was read
// NOWHERE in the codebase, and no redemption path existed. The button wrote a
// row into a table nothing consumed, under a success message that claimed the
// invitation was recorded and mentioned email "in the next update" — a dead
// feature reporting success.
//
// This file pins the four parts that now exist, and the security properties of
// the redemption RPC, because that function is SECURITY DEFINER and is
// therefore the entire boundary protecting workspace membership.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const PIN = require('./lib/pinfloor.js');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let checks = 0, fails = 0;
const check = (name, cond) => { checks++; if (!cond) { fails++; console.log('  FAIL  ' + name); } else console.log('  PASS  ' + name); };

test('workspace invitations — send, list, revoke, redeem', () => {
  const helpers = read('site/helpers_modules.js');
  const html    = read('site/index.html');
  const boot    = read('site/safety_lab.js');
  const misc    = read('site/misc_fn_modules.js');
  const mig     = read('supabase/migrations/20260831_invitation_accept_rpc.sql');

  console.log('[inv] 1 — the send path actually sends');
  check('invite calls the notify-invite edge function', /functions\.invoke\('notify-invite'/.test(helpers));
  check('it passes the invitation id, never the token', /invitation_id:\s*row\.id/.test(helpers));
  check('insert returns the id so the function can be called', /\.select\('id'\)\.single\(\)/.test(helpers));
  // The phrase survives ONLY in the comment that quotes it as history. Scoped to
  // non-comment lines so the check still bites if it is ever put back on screen.
  const liveCode = helpers.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  check('the OLD lie is gone from live code — no "ships in the next update"', !/ships in the next update/i.test(liveCode));
  check('...and it IS still recorded in a comment, as history', /ships in the next update/i.test(helpers));

  console.log('[inv] 2 — no silent returns: a dead click is what started this');
  const fn = helpers.slice(helpers.indexOf('async function inviteWorkspaceMember'), helpers.indexOf('async function _renderPendingInvitations'));

  console.log('[inv] 1b — parallel rows with a + to add more (Waqas, 31 Aug)');
  check('rows container exists', /id="ws-invite-rows"/.test(html));
  check('a + Add another control exists', /id="ws-invite-add"[\s\S]{0,120}\+ Add another/.test(html));
  check('wsAddInviteRow builds a row', /function wsAddInviteRow/.test(helpers) && /row\.className = 'ws-inv-row'/.test(helpers));
  check('each row carries its own role select', /class="ws-inv-role"/.test(helpers));
  check('each row can be removed', /ws-inv-del/.test(helpers));
  check('removing the last row re-seeds one — never a dead section', /if \(!host\.querySelector\('\.ws-inv-row'\)\) wsAddInviteRow\(\)/.test(helpers));
  check('the batch is sent in one click', /for \(const w of wanted\)/.test(fn));
  check('blank rows are skipped, not errors', /if \(!email\) continue;/.test(fn));
  check('duplicate addresses are caught', /Duplicate address/.test(fn));
  check('the section spans both grid columns — .modal-body is 1fr 1fr', /grid-column: 1 \/ -1/.test(html));
  check('email input has a REAL flex basis (basis 0 is what collapsed it to 20px)', /flex: 1 1 260px/.test(helpers));
  check('role select no longer claims the whole row', /flex: 0 0 auto; width: auto/.test(helpers));
  check('the collapse cause is written down at the site', /collapsed to 20px/.test(helpers));
  check('every guard reports instead of returning silently', !/if \(!client \|\| !emailEl \|\| !roleEl\) return;/.test(fn));
  check('missing workspace is explained', /No active workspace/.test(fn));
  check('not-signed-in is explained', /sign in first/i.test(fn));
  check('non-admin is explained', /owner or admin can invite/i.test(fn));
  check('mail failure is reported separately from invite creation', /Created but not emailed/i.test(fn));
  check('...and hands over the link rather than pretending', /\?invite=/.test(fn));
  check('button is disabled while in flight', /btn\.disabled = true/.test(fn) && /btn\.disabled = false/.test(fn));
  check('per-address outcome is reported, not one blanket message', /sent\.length/.test(fn) && /unmailed\.length/.test(fn) && /failed\.length/.test(fn));

  console.log('[inv] 3 — the invitee can actually get in');
  check('URL token is consumed on boot', /_consumeInviteFromUrl/.test(boot));
  check('token is STRIPPED from the address bar (it is a credential)', /searchParams\.delete\('invite'\)[\s\S]{0,120}history\.replaceState/.test(helpers));
  check('token parks until there is a session', /sessionStorage\.setItem\('safetyLab\.pendingInvite'/.test(helpers));
  check('redemption retried after sign-in', /_redeemPendingInvite/.test(helpers.slice(helpers.indexOf('function _onSupabaseSignedIn'))));
  check('redemption goes through the RPC, not a client-side join', /rpc\('accept_invitation'/.test(helpers));
  check('a wrong-account result KEEPS the token for a second attempt', /terminal\s*=\s*\[[^\]]*\]/.test(helpers) && !/'wrong_account'[^\]]*\]/.test(helpers.match(/terminal\s*=\s*\[[^\]]*\]/)[0]));
  check('every RPC status has a message', ['joined','already_member','wrong_account','expired','already_used'].every(s => helpers.includes("'" + s + "'")));

  console.log('[inv] 4 — admin can see and revoke what they sent');
  check('pending list container exists', /id="ws-pending-invites"/.test(html));
  check('rendered from the admin-gated RPC', /rpc\('pending_invitations'/.test(helpers));
  check('revoke is wired', /async function revokeInvitation/.test(helpers) && /window\.revokeInvitation/.test(boot));
  check('opening workspace settings renders it', /_renderPendingInvitations/.test(misc));

  console.log('[inv] 5 — RPC security properties (SECURITY DEFINER = this IS the boundary)');
  check('accept_invitation is SECURITY DEFINER', /create or replace function public\.accept_invitation[\s\S]*?security definer/.test(mig));
  check('search_path is pinned (the classic escalation footgun)', /security definer\s*\nset search_path to 'public'/.test(mig));
  check('EMAIL MUST MATCH THE CALLER — a leaked link is not access', /lower\(v_inv\.email\) <> v_email/.test(mig));
  check('expiry enforced server-side', /v_inv\.expires_at <= now\(\)/.test(mig));
  check('single use enforced server-side', /v_inv\.accepted_at is not null/.test(mig));
  check('role is read from the row, never from an argument', !/accept_invitation\(p_token text, p_role/.test(mig));
  check('role whitelisted again at redemption', /v_inv\.role not in \('admin','editor','reviewer','viewer'\)/.test(mig));
  check('NEVER downgrades an existing membership', /v_existing is not null/.test(mig) && /select 'already_member'::text, v_inv\.workspace_id, v_ws\.name, v_existing/.test(mig));
  check('anon cannot execute it', /revoke all on function public\.accept_invitation\(text\) from public/.test(mig));
  check('only authenticated may', /grant execute on function public\.accept_invitation\(text\) to authenticated/.test(mig));
  check('pending_invitations is admin-gated', /private\.can_admin_workspace\(p_workspace\)/.test(mig));
  check('pending_invitations NEVER returns the token', !/select i\.id, i\.email, i\.role, i\.created_at, i\.expires_at, i\.token/.test(mig)
        && /returns table \(id uuid, email text, role text, created_at timestamptz, expires_at timestamptz, expired boolean\)/.test(mig));

  console.log('[inv] 6 — cache pins moved (a stale bundle ships the dead button)');
  // SUPERSEDED 31 Aug 2026 (H-6): these were EXACT pins, so H-6's helpers bump
  // 2.60 -> 2.61 failed a check about invitations, which is a false alarm about
  // the wrong feature. Floors per rule 12: what this check must prove is that
  // index.html cannot still be serving a bundle from BEFORE the invite feature
  // landed, and a floor proves exactly that while letting the file move on.
  // Exact equality would have to be re-edited on every unrelated bump, and a
  // check that cries wolf is a check people start editing without reading.
  [['helpers_modules.js', '2.60'], ['misc_fn_modules.js', '66.47'], ['safety_lab.js', '65.49']].forEach(([f, floor]) =>
    check('index.html pins ' + f + ' >= ' + floor, PIN.atLeast(html, f, floor)));

  console.log(fails ? ('# FAILED — ' + fails + ' check(s)') : ('# ' + checks + ' passed, 0 failed'));
  assert.strictEqual(fails, 0);
});
