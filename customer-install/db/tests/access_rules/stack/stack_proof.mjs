// Real-stack proof (3 Oct 2026): the self-hosted Supabase stack from the customer kit, real GoTrue
// sessions (password, then TOTP to AAL2), real Realtime private channels, real PostgREST.
// Phases: base (kit 00-18 = today's production) -> apply 19 -> apply 20.
import { createClient } from '@supabase/supabase-js';
import { authenticator } from 'otplib';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const env = Object.fromEntries(fs.readFileSync((process.env.STACK_DIR || '/tmp/stack') + '/.env', 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const URL = 'http://localhost:8000', ANON = env.ANON_KEY;
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const sql = (q) => execFileSync('docker', ['exec', '-e', 'PGPASSWORD=' + env.POSTGRES_PASSWORD, 'supabase-db', 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, DOCKER_HOST: 'unix:///tmp/docker.sock' } }).trim();
const applyKit = (f) => execFileSync('docker', ['exec', '-e', 'PGPASSWORD=' + env.POSTGRES_PASSWORD, 'supabase-db', 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/kit/' + f], { encoding: 'utf8', env: { ...process.env, DOCKER_HOST: 'unix:///tmp/docker.sock' } });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// mk() is the app's client: since 3 Oct helpers_modules.js hands the token to the live connection after the second step.
const mkBare = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const mk = () => { const c = mkBare(); c.auth.onAuthStateChange((ev, s) => { if (ev === 'MFA_CHALLENGE_VERIFIED' && s && s.access_token) c.realtime.setAuth(s.access_token); }); return c; };

const PW = 'Sl-proof-pass-1';
const people = { O: 'owner@co.test', E: 'editor@co.test', V: 'viewer@co.test', X: 'outsider@else.test' };
const C = {}; const ID = {};
for (const [k, email] of Object.entries(people)) {
  C[k] = mk();
  let r = await C[k].auth.signUp({ email, password: PW });
  if (r.error && !/registered/i.test(r.error.message)) throw new Error('signup ' + email + ': ' + r.error.message);
  r = await C[k].auth.signInWithPassword({ email, password: PW });
  if (r.error) throw new Error('signin ' + email + ': ' + r.error.message);
  ID[k] = r.data.user.id;
}
const W = sql(`insert into public.workspaces(name, owner_id, is_personal) values ('Company', '${ID.O}', false) returning id`).split('\n')[0];
sql(`insert into public.workspace_members(workspace_id, user_id, role) values ('${W}','${ID.O}','owner'),('${W}','${ID.E}','editor'),('${W}','${ID.V}','viewer')`);
const P = sql(`insert into public.projects(workspace_id, name, created_by) values ('${W}','Freighter','${ID.O}') returning id`).split('\n')[0];
const topic = `slab-crdt:${W}:${P}`;

// join a channel, collect broadcasts; resolves with {status, got[], ch}
async function join(client, priv, name = topic) {
  const got = [];
  const ch = client.channel(name, { config: { private: priv, broadcast: { self: false } } });
  ch.on('broadcast', { event: 'yupdate' }, (m) => got.push(m.payload && m.payload.who));
  const status = await new Promise((res) => {
    const t = setTimeout(() => res('TIMEOUT'), 8000);
    ch.subscribe((s, err) => { if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') { clearTimeout(t); res(s + (err ? ' ' + (err.message || err) : '')); } });
  });
  return { status, got, ch };
}
async function send(j, who) { return j.ch.send({ type: 'broadcast', event: 'yupdate', payload: { who } }); }
async function leaveAll(...js) { for (const j of js) { try { await j.ch.unsubscribe(); } catch (_) {} } for (const k of Object.keys(C)) { try { C[k].removeAllChannels(); } catch (_) {} } await sleep(2500); }  // removeAllChannels closes the socket; a join before it has closed fails with "socket closed: 1005" (harness only, the app unsubscribes)

console.log('\n[phase A] kit 00-18, today\'s production: public channels');
{
  const o = await join(C.O, false), x = await join(C.X, false), e = await join(C.E, false);
  await sleep(800); await send(e, 'E');
  await sleep(1500);
  check('today: editor broadcast reaches the owner (co-editing works)', o.got.includes('E'), JSON.stringify(o.got));
  check('today: an OUTSIDER on the public channel also receives it (the hole)', x.got.includes('E'), JSON.stringify(x.got));
  const op = await join(C.O, true, topic);
  check('before 19: a private channel is refused (why 19 goes in before the app)', !/^SUBSCRIBED/.test(op.status), op.status);
  await leaveAll(o, x, e, op);
}

console.log('\n[phase B] apply 19: policies for private channels');
applyKit('19_realtime_private_channels.sql');
{
  const o = await join(C.O, false), e = await join(C.E, false);
  await sleep(800); await send(e, 'E'); await sleep(1500);
  check('after 19: an OLD client on public channels still co-edits (nothing breaks before the app ships)', o.got.includes('E'), JSON.stringify(o.got));
  await leaveAll(o, e);
}
{
  const o = await join(C.O, true), v = await join(C.V, true), e = await join(C.E, true), x = await join(C.X, true);
  check('private: owner joins', /^SUBSCRIBED/.test(o.status), o.status);
  check('private: editor joins', /^SUBSCRIBED/.test(e.status), e.status);
  check('private: viewer joins', /^SUBSCRIBED/.test(v.status), v.status);
  check('private: outsider is refused', !/^SUBSCRIBED/.test(x.status), x.status);
  await sleep(800); await send(e, 'E'); await sleep(300); await send(v, 'V'); await sleep(1500);
  check('private: editor broadcast reaches owner and viewer', o.got.includes('E') && v.got.includes('E'), JSON.stringify({ o: o.got, v: v.got }));
  check('private: viewer broadcast is NOT delivered (cannot inject edits)', !o.got.includes('V') && !e.got.includes('V'), JSON.stringify({ o: o.got, e: e.got }));
  check('private: outsider received nothing', x.got.length === 0, JSON.stringify(x.got));
  await leaveAll(o, v, e, x);
}

console.log('\n[phase C] editor turns two-factor on (real TOTP), then apply 20');
let secret, factorId;
{
  const en = await C.E.auth.mfa.enroll({ factorType: 'totp' });
  if (en.error) throw new Error('enroll: ' + en.error.message);
  secret = en.data.totp.secret; factorId = en.data.id;
  const v = await C.E.auth.mfa.challengeAndVerify({ factorId, code: authenticator.generate(secret) });
  check('TOTP factor verified on the real auth service', !v.error, v.error && v.error.message);
}
applyKit('20_access_rules_hardening.sql');
check('20 applied: the self-check could read auth.mfa_factors as the migration role', true);
{
  const n = await C.O.from('projects').select('id').eq('id', P);
  check('owner without a factor still reads the project at aal1', (n.data || []).length === 1, JSON.stringify(n.error));
  // the editor signs in again with the password only -> aal1
  const e1 = mk(); const s = await e1.auth.signInWithPassword({ email: people.E, password: PW });
  const aal = (await e1.auth.mfa.getAuthenticatorAssuranceLevel()).data;
  check('password-only session is aal1 with aal2 available', aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2', JSON.stringify(aal));
  const r1 = await e1.from('projects').select('id').eq('id', P);
  check('aal1 session of a two-factor account sees NO project (database enforced)', (r1.data || []).length === 0, JSON.stringify(r1));
  const own = await e1.from('users').select('id').eq('id', ID.E);
  check('aal1 session still reads its own account row (the tier check before the prompt)', (own.data || []).length === 1, JSON.stringify(own));
  const j1 = await join(e1, true);
  check('aal1 session cannot join the private co-editing channel', !/^SUBSCRIBED/.test(j1.status), j1.status);
  await leaveAll(j1);
  const v2 = await e1.auth.mfa.challengeAndVerify({ factorId, code: authenticator.generate(secret) });
  check('second step on the same session', !v2.error, v2.error && v2.error.message);
  const r2 = await e1.from('projects').select('id').eq('id', P);
  check('aal2 session sees the project again', (r2.data || []).length === 1, JSON.stringify(r2));
  const up = await e1.from('projects').update({ name: 'Freighter' }).eq('id', P).select('id');
  check('aal2 session saves', (up.data || []).length === 1, JSON.stringify(up));
  const j2 = await join(e1, true);
  check('aal2 session joins the private channel', /^SUBSCRIBED/.test(j2.status), j2.status);
  await leaveAll(j2);
  // the same without the 3 Oct hand-over: supabase-js leaves the password-only token on the connection
  const eb = mkBare(); await eb.auth.signInWithPassword({ email: people.E, password: PW });
  await eb.auth.mfa.challengeAndVerify({ factorId, code: authenticator.generate(secret) });
  const jb = await join(eb, true);
  check('WITHOUT the hand-over a two-factor account is refused the channel (why helpers_modules.js does it)', !/^SUBSCRIBED/.test(jb.status), jb.status);
  try { eb.removeAllChannels(); } catch (_) {}
  // the app's re-auth: password again on the SAME client (aal1), then the second step -> aal2
  await e1.auth.signInWithPassword({ email: people.E, password: PW });
  const r3 = await e1.from('projects').select('id').eq('id', P);
  check('a bare password re-check drops the session to aal1 (what the 3 Oct app no longer leaves in place)', (r3.data || []).length === 0);
  await e1.auth.mfa.challengeAndVerify({ factorId, code: authenticator.generate(secret) });
  const r4 = await e1.from('projects').select('id').eq('id', P);
  check('password + second step (SafetyLabMFA.reauthenticate) restores the session', (r4.data || []).length === 1);
  const mv = await e1.from('projects').update({ workspace_id: sql(`select id from public.workspaces where owner_id='${ID.E}' and is_personal`) }).eq('id', P).select('id');
  check('the editor cannot move the project into their own workspace', !!mv.error, JSON.stringify(mv));
  const rv = sql(`insert into public.reviews(project_id, title, status, requested_by) values ('${P}','PSSA','in_review','${ID.O}') returning id`).split('\n')[0];
  const so = await e1.from('signoffs').insert({ review_id: rv, project_id: P, baseline_sha256: 'abc', signer_user_id: ID.E, signer_email: 'owner@co.test', role_at_signing: 'approver', decision: 'approve', auth_assurance: 'password_reauth' }).select('signer_email, role_at_signing, auth_assurance');
  const row = (so.data || [])[0] || {};
  check('sign-off records the database\'s e-mail, role and assurance', row.signer_email === people.E && row.role_at_signing === 'reviewer' && row.auth_assurance === 'mfa', JSON.stringify(so));
  const vc = await e1.rpc('verify_signoff_chain');
  check('the Verify ledger call works and the chain is intact', !vc.error && vc.data && vc.data[0] && vc.data[0].ok === true, JSON.stringify(vc));
}

console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
