#!/usr/bin/env node
/*
 * Regression: a NEWER license next to install.sh replaces the server's license (24 Oct 2026).
 *
 * Found with Radia. install.sh only read a .lic placed next to it when the server had no license
 * yet, so a renewed license could only be loaded in each user's app. Now:
 *   1. no license on the server: the .lic next to the script is loaded;
 *   2. a newer one (issuedAt inside the signed payload): replaces it, and the old one is kept as
 *      license/server.lic.replaced-<time>, never deleted;
 *   3. an older or same-age different one: the server's license is kept, with a plain reason;
 *   4. the same license again: nothing changes and nothing is printed;
 *   5. the server's license has no readable issue time: the new one replaces it (kept beside it);
 *   6. several .lic files next to the script: the newest is the one used;
 *   7. a base64url payload whose length needs padding and uses - and _ still decodes.
 * The block is cut out of install.sh and run with bash in a temp folder, so this tests the
 * shipped code, not a copy. SL_INSTALL_SH points it at another copy (used for the mutation proof).
 *
 * Run: node tests/regression_installer_newer_license_20261024.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 400) + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const SRC = process.env.SL_INSTALL_SH || path.join(REPO, 'customer-install', 'selfhost', 'install.sh');
const text = fs.readFileSync(SRC, 'utf8');
const a = text.indexOf('mkdir -p license ai-proxy-data'), b = text.indexOf('[ -f license/server.lic ] && chmod 644 license/server.lic');
check('install.sh has the license block', a > 0 && b > a);
const BLOCK = text.slice(a, b);

const b64u = s => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const lic = (issuedAt, extra) => b64u(JSON.stringify(Object.assign({ customer: 'Test', seats: 3 }, issuedAt ? { issuedAt } : {}, extra || {}))) + '.' + b64u('sig-' + (issuedAt || 'none') + JSON.stringify(extra || {}));

function run(server, besides) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-lic-'));
  const here = path.join(dir, 'kit'), stack = path.join(dir, 'stack');
  fs.mkdirSync(here); fs.mkdirSync(stack);
  if (server != null) { fs.mkdirSync(path.join(stack, 'license')); fs.writeFileSync(path.join(stack, 'license', 'server.lic'), server); }
  for (const [n, c] of Object.entries(besides || {})) fs.writeFileSync(path.join(here, n), c);
  const script = '#!/usr/bin/env bash\nset -euo pipefail\nHERE=' + JSON.stringify(here) + '\ncd ' + JSON.stringify(stack) + '\n' + BLOCK + '\n';
  fs.writeFileSync(path.join(dir, 'b.sh'), script);
  const r = cp.spawnSync('bash', [path.join(dir, 'b.sh')], { encoding: 'utf8' });
  const ld = path.join(stack, 'license');
  const files = fs.existsSync(ld) ? fs.readdirSync(ld) : [];
  const cur = files.includes('server.lic') ? fs.readFileSync(path.join(ld, 'server.lic'), 'utf8') : null;
  const kept = files.filter(f => f.startsWith('server.lic.replaced-')).map(f => fs.readFileSync(path.join(ld, f), 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), cur, kept };
}

const OLD = lic('2026-09-01T10:00:00Z'), NEW = lic('2026-10-20T09:00:00Z', { seats: 5 }), NEWER = lic('2026-10-23T09:00:00Z', { seats: 7 });
const NOAT = lic(null, { legacy: true });

let r = run(null, { 'Radia.lic': NEW + '\n' });
check('1 no license on the server: the .lic next to the script is loaded', r.code === 0 && r.cur === NEW && /License: loaded Radia\.lic \(issued 2026-10-20T09:00:00Z\)/.test(r.out), r.out);

r = run(OLD, { 'Radia-renewed.lic': NEW + '\r\n' });
check('2 a newer license replaces the server\'s', r.code === 0 && r.cur === NEW && /replaced with Radia-renewed\.lic \(issued 2026-10-20T09:00:00Z\)/.test(r.out), r.out);
check('2 the replaced license is kept beside it, unchanged', r.kept.length === 1 && r.kept[0] === OLD, r.kept);

r = run(NEW, { 'old.lic': OLD });
check('3 an older license is not loaded over a newer one', r.code === 0 && r.cur === NEW && r.kept.length === 0, r.out);
check('3 it says why, in plain words', /kept the server's license \(issued 2026-10-20T09:00:00Z\)\. old\.lic next to this script was issued 2026-09-01T10:00:00Z, which is not newer/.test(r.out), r.out);

const SAMEAGE = lic('2026-10-20T09:00:00Z', { seats: 9 });
r = run(NEW, { 'same.lic': SAMEAGE });
check('3 a different license with the same issue time does not replace it', r.cur === NEW && r.kept.length === 0, r.out);

r = run(NEW, { 'Radia.lic': NEW + '\n' });
check('4 the same license again: nothing changes, nothing printed', r.code === 0 && r.cur === NEW && r.kept.length === 0 && !/License:/.test(r.out), r.out);

r = run(NOAT, { 'Radia.lic': NEW });
check('5 a server license with no readable issue time is replaced, and kept', r.cur === NEW && r.kept.length === 1 && r.kept[0] === NOAT, r.out);

const NOAT2 = lic(null, { legacy: 2 });
r = run(NOAT, { 'undated.lic': NOAT2 });
check('5 neither has a readable issue time: the one placed next to the script wins, the old one kept', r.cur === NOAT2 && r.kept.length === 1 && r.kept[0] === NOAT && /issued unknown/.test(r.out), r.out);

r = run(NEW, { 'x.lic': NOAT });
check('5 a .lic with no issue time never replaces a dated one', r.cur === NEW && r.kept.length === 0 && /issued at an unknown time, which is not newer/.test(r.out), r.out);

r = run(OLD, { 'a.lic': NEW, 'b.lic': NEWER, 'c.lic': OLD });
check('6 of several, the newest is used', r.cur === NEWER && r.kept.length === 1 && r.kept[0] === OLD && /replaced with b\.lic/.test(r.out), r.out);

r = run(OLD, { 'empty.lic': '' });
check('6 an empty .lic is ignored', r.code === 0 && r.cur === OLD && !/License:/.test(r.out), r.out);

// a payload with - and _ and a length that needs = padding; issuedAt is last, so a decoder that
// gives up on the unpadded tail (GNU base64 does) loses it
let pad = null;
for (let i = 0; i < 60 && !pad; i++) { const p = b64u(JSON.stringify({ n: '??>>~~' + 'x'.repeat(i), issuedAt: '2026-10-21T00:00:00Z' })); if (/[-_]/.test(p) && p.length % 4 === 3) pad = p + '.sig'; }
r = run(OLD, { 'p.lic': pad });
check('7 base64url with - _ and no padding decodes', !!pad && r.cur === pad && /issued 2026-10-21T00:00:00Z/.test(r.out), r.out);

r = run(null, {});
check('no .lic anywhere: nothing is created and nothing printed', r.code === 0 && r.cur === null && !/License:/.test(r.out), r.out);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
