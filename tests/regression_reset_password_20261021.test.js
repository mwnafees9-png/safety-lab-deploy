#!/usr/bin/env node
/*
 * Regression: a forgotten password on a customer's own server (21 Oct 2026).
 *
 * Waqas: "create the reset kit for ubuntu". With no mail server the sign-in service cannot send a
 * reset link, and the temporary password install.sh and add-user.sh print is shown once, so a lost
 * password had no way back. reset-password.sh gives an existing account a new temporary password
 * (the same generator and the same rule as add-user.sh) and signs that account out everywhere.
 *
 * These checks run the real scripts against a stand-in for docker that records its command line
 * and environment and answers like the database and the sign-in service.
 *
 * Run: node tests/regression_reset_password_20261021.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const REPO = path.join(__dirname, '..'), KIT = path.join(REPO, 'customer-install/selfhost');
const R = f => fs.readFileSync(path.join(KIT, f), 'utf8');
const UID = '3f2b6a10-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

console.log('\n[kit] the reset is in the kit, documented, and on the appliance menu');
check('reset-password.sh is in the kit and executable', fs.existsSync(path.join(KIT, 'reset-password.sh')) && (fs.statSync(path.join(KIT, 'reset-password.sh')).mode & 0o111) !== 0);
check('the README tells the administrator how', /\.\/reset-password\.sh person@yourcompany\.com/.test(R('README.md')));
const menu = fs.readFileSync(path.join(REPO, 'customer-install/appliance/files/safetylab-menu'), 'utf8');
check('the appliance menu offers it, and asks before it acts', /reset "Reset a forgotten password"/.test(menu) && /--yesno "Give \$E a new temporary password\?/.test(menu) && /\.\/reset-password\.sh "\$E"/.test(menu));
check('no em dashes in what was added', [R('reset-password.sh'), R('accounts.sh').slice(R('accounts.sh').indexOf('password reset')), fs.readFileSync(__filename, 'utf8')].every(t => t.indexOf(String.fromCharCode(0x2014)) < 0));

console.log('\n[run] the real script against a stand-in server');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-reset-'));
fs.writeFileSync(path.join(dir, 'docker'), [
  '#!/bin/bash',
  'echo "ARGV: $*" >> "$SLAB_LOG"',
  'if [ "$1" = "compose" ]; then',
  '  SQL="${@: -1}"; echo "SQL: $SQL" >> "$SLAB_LOG"',
  '  [ "${SLAB_DB_DOWN:-0}" = 1 ] && exit 1',
  '  if [[ "$SQL" == select* ]]; then [[ "$SQL" == *nobody@* ]] || echo "' + UID + '"; fi',
  '  if [[ "$SQL" == delete* && "${SLAB_DELETE_FAILS:-0}" = 1 ]]; then exit 1; fi',
  '  exit 0',
  'fi',
  'echo "ENVKEY: ${SLAB_SERVICE_KEY:0:6} BODY: $SLAB_BODY" >> "$SLAB_LOG"',
  'echo "CALL: $*" | grep -o "PUT[^ ]*\\|/admin/users/[^ \\"]*" | head -2 >> "$SLAB_LOG"',
  'if [ "${SLAB_AUTH_REFUSES:-0}" = 1 ]; then printf \'{"msg":"nope"}\\n500\'; else printf \'{"id":"' + UID + '"}\\n200\'; fi',
  ''].join('\n'));
fs.chmodSync(path.join(dir, 'docker'), 0o755);
fs.mkdirSync(path.join(dir, 'stack')); fs.writeFileSync(path.join(dir, 'stack/.env'), 'SERVICE_ROLE_KEY=SECRETKEYVALUE123\n');
for (const f of ['accounts.sh', 'reset-password.sh']) fs.copyFileSync(path.join(KIT, f), path.join(dir, f));
const log = path.join(dir, 'log.txt');
const run = (email, extra) => { try { fs.unlinkSync(log); } catch (_) {} const r = cp.spawnSync('bash', [path.join(dir, 'reset-password.sh'), email], { encoding: 'utf8', env: Object.assign({}, process.env, { PATH: dir + ':' + process.env.PATH, SLAB_LOG: log }, extra || {}) }); r.log = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''; return r; };

const r1 = run('brian.ciocca@radia.com');
const pw = ((r1.stdout || '').match(/Temporary password:\s+(\S+)/) || [])[1] || '';
check('an existing account gets a new temporary password, printed once', r1.status === 0 && pw.length >= 16, (r1.stdout || '') + (r1.stderr || ''));
check('the password meets the app\'s sign-up rule', /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw));
check('two resets never give the same password', (() => { const p2 = ((run('brian.ciocca@radia.com').stdout || '').match(/Temporary password:\s+(\S+)/) || [])[1]; return p2 && p2 !== pw; })());
check('the account is found by its address, in any letter case', /lower\(email\) = lower\('brian\.ciocca@radia\.com'\) and deleted_at is null/.test(r1.log));
check('the new password is set on THAT account, through the sign-in service', /\/admin\/users\/3f2b6a10-1c2d-4e5f-8a9b-0c1d2e3f4a5b/.test(r1.log) && /BODY: \{"password":"/.test(r1.log));
check('the account is signed out everywhere (refresh tokens and sessions)', /delete from auth\.refresh_tokens where user_id = '3f2b6a10-1c2d-4e5f-8a9b-0c1d2e3f4a5b'; delete from auth\.sessions where user_id = '3f2b6a10/.test(r1.log));
check('sign-out happens only after the password is set', r1.log.indexOf('BODY: {"password"') < r1.log.indexOf('delete from auth.refresh_tokens'));
const argv = r1.log.split('\n').filter(l => l.startsWith('ARGV:')).join('\n');
check('neither the service key nor the new password is on any command line', argv.length > 0 && argv.indexOf('SECRETKEYVALUE123') < 0 && argv.indexOf(pw) < 0);
check('the message says what happened and what to do next', /old password no longer works/.test(r1.stdout) && /signed out everywhere/.test(r1.stdout) && /Account, Change password/.test(r1.stdout));

const r2 = run('nobody@radia.com');
check('no such account: says so, points to add-user.sh, sets nothing', r2.status !== 0 && /There is no account for nobody@radia\.com/.test(r2.stdout) && /add-user\.sh/.test(r2.stdout) && !/BODY:/.test(r2.log));
const r3 = run("x'; drop table auth.users; --@a.com");
check('not an email address: refused before any call (nothing reaches the database)', r3.status !== 0 && r3.log === '');
const r4 = run('brian.ciocca@radia.com', { SLAB_DB_DOWN: '1' });
check('database not running: says so, prints no password', r4.status !== 0 && /Could not reach the database/.test(r4.stderr) && !/Temporary password/.test(r4.stdout));
const r5 = run('brian.ciocca@radia.com', { SLAB_AUTH_REFUSES: '1' });
check('sign-in service refuses: says so, prints no password, signs nobody out', r5.status !== 0 && /refused the new password \(HTTP 500\)/.test(r5.stderr) && !/Temporary password/.test(r5.stdout) && !/delete from/.test(r5.log));
const r6 = run('brian.ciocca@radia.com', { SLAB_DELETE_FAILS: '1' });
check('sign-out fails after the change: the new password is still given, with a warning', r6.status === 0 && /Temporary password:/.test(r6.stdout) && /signing brian\.ciocca@radia\.com out of other computers failed/.test(r6.stderr));
const r7 = cp.spawnSync('bash', [path.join(dir, 'reset-password.sh')], { encoding: 'utf8' });
check('no address given: shows how to use it', r7.status !== 0 && /Usage: \.\/reset-password\.sh/.test(r7.stdout));
try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
