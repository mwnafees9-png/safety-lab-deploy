#!/usr/bin/env node
/*
 * Regression: the self-hosted install kit, 3 Oct 2026 (security review of 2 Oct, batch 3).
 *
 * What was wrong, one line each:
 *   - stack/.env (database password, JWT secret, service key) and answers.env were readable by
 *     every user of the server;
 *   - the AI service accepted ANY valid Safety Lab licence (another customer's, a trial bound to
 *     the demo cloud): it never checked which server the licence was issued for;
 *   - the root certificate the install makes could vouch for any site name, so anyone who trusted
 *     it by hand (for the dashboard) trusted every certificate a leaked root key could sign;
 *   - apply.sh put the database password on every psql command line, readable with ps.
 *
 * The AI-service rule itself is executed and mutation-proven in the proxy repo
 * (safety-lab-proxy-deploy/test/offline.test.mjs); here the kit's copy must be that same file.
 * The certificate constraint was proven with openssl on 3 Oct 2026: a leaf for the server name
 * verifies, a leaf for any other name fails with "permitted subtree violation".
 *
 * Run: node tests/regression_selfhost_kit_hardening_20261003.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const inst = read('customer-install/selfhost/install.sh');
const tmpl = read('customer-install/selfhost/ai-proxy.env.template');
const kitWorker = read('customer-install/selfhost/ai-proxy/worker.js');

console.log('\n[files] the secrets on the server are owner-only');
check('stack/.env is chmod 600 on every run, after the settings are written', /setenv STUDIO_DEFAULT_PROJECT[^\n]*\n[\s\S]{0,300}\nchmod 600 \.env\n/.test(inst));
check('answers.env is chmod 600 when written', /> "\$ANSWERS"\n\s*chmod 600 "\$ANSWERS"/.test(inst));
check('ai-proxy.env stays chmod 600 after its server name is updated', /LICENSE_BACKEND_HOST=\$SERVER_NAME" >> ai-proxy\.env\nfi\nchmod 600 ai-proxy\.env/.test(inst));

console.log('\n[licence] the AI service knows which server it belongs to');
check('the template names the server', /^LICENSE_BACKEND_HOST=__SERVER__$/m.test(tmpl));
check('install.sh writes or updates it on every run (old installs included)', /grep -q '\^LICENSE_BACKEND_HOST=' ai-proxy\.env/.test(inst) && /s\|\^LICENSE_BACKEND_HOST=\.\*\|LICENSE_BACKEND_HOST=\$SERVER_NAME\|/.test(inst));
check('the kit\'s AI service carries the bind check', /if \(bound && bound !== mine\) return \{ error: "wrong_install" \};/.test(kitWorker) && /license_not_for_this_server/.test(kitWorker));
const proxyRepo = path.join(REPO, '..', 'safety-lab-proxy-deploy', 'worker.js');
if (fs.existsSync(proxyRepo)) check('the kit\'s AI service is byte-for-byte the proxy repo\'s', fs.readFileSync(proxyRepo, 'utf8') === kitWorker);
else console.log('  SKIP  proxy repo not next to this one');

console.log('\n[certificate] the install\'s own root can only vouch for this server');
check('root is name-constrained to the server name', /-addext "nameConstraints=critical,permitted;DNS:\$SERVER_NAME"/.test(inst));
check('root cannot make further authorities (pathlen:0)', /basicConstraints=critical,CA:TRUE,pathlen:0/.test(inst));
check('the setup-file comment says the server certificate is pinned, not the root', /fingerprint of the server certificate\s*\n# this install made/.test(inst) && !/fingerprint of the root this install/.test(inst));

console.log('\n[apply.sh] the database password never reaches a command line');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-apply-'));
  fs.writeFileSync(path.join(dir, 'psql'), '#!/bin/bash\necho "ARGS=[$*] PW=[$PGPASSWORD]"\n'); fs.chmodSync(path.join(dir, 'psql'), 0o755);
  const run = (script, env, args) => cp.spawnSync('bash', [script].concat(args || []), { encoding: 'utf8', env: Object.assign({}, process.env, { PATH: dir + ':' + process.env.PATH }, env) });
  const apply = path.join(REPO, 'customer-install/db/apply.sh');
  const url = 'postgresql://postgres:p%40ss:w0rd@db.acme.test:5432/postgres?sslmode=require';
  const r = run(apply, { DATABASE_URL: url });
  const lines = (r.stdout || '').split('\n').filter(l => l.startsWith('ARGS='));
  check('every psql call ran (21 files)', lines.length === 21, String(lines.length));
  check('no psql command line carries the password', lines.length > 0 && lines.every(l => !/p%40ss|p@ss|w0rd\]? /.test(l.split(' PW=')[0])));
  check('psql gets it, decoded, in PGPASSWORD', lines.length > 0 && lines.every(l => l.endsWith('PW=[p@ss:w0rd]')));
  check('the address psql sees keeps user, host, port, database and options', lines.length > 0 && lines[0].indexOf('postgresql://postgres@db.acme.test:5432/postgres?sslmode=require') >= 0);
  const r2 = run(apply, {}, ['postgres://u@h/db']);
  check('an address with no password still works as given', (r2.stdout || '').indexOf('ARGS=[postgres://u@h/db') >= 0);
  // MUTATION: without the rewrite, the password is back on the command line.
  const src = fs.readFileSync(apply, 'utf8');
  const mut = src.replace(/if \[\[ "\$DB_URL" =~ \$re \]\]; then[\s\S]*?\nfi\n/, '');
  check('mutation site present', mut !== src);
  const mf = path.join(dir, 'apply_mut.sh'); fs.writeFileSync(mf, mut.replace('HERE="$(cd "$(dirname "$0")" && pwd)"', 'HERE="' + path.dirname(apply) + '"'));
  const r3 = run(mf, { DATABASE_URL: url });
  check('MUTATION: without the rewrite the password is on the psql command line', /ARGS=\[postgresql:\/\/postgres:p%40ss:w0rd@/.test(r3.stdout || ''));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
