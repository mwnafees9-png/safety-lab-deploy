#!/usr/bin/env node
/*
 * Regression: signed server updates, the license on the server, and database steps applied once
 * (6 Oct 2026). Proven end to end on a real stack on 6 Oct (tampered, wrong-key and junk files
 * refused with nothing changed; a genuine update applied in 25 s with users, seats, license and the
 * database files untouched; a re-run applies nothing; a pre-update server takes the key once).
 * This suite pins the rules that made those results, so they cannot quietly change.
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const R = path.join(__dirname, '..');
const rd = p => fs.readFileSync(path.join(R, p), 'utf8');
const upd = rd('customer-install/appliance/files/safetylab-update');
const menu = rd('customer-install/appliance/files/safetylab-menu');
const mk = rd('tools/server-update/make-server-update.sh');
const inst = rd('customer-install/selfhost/install.sh');
const docker = rd('customer-install/appliance/Dockerfile');

console.log('[1] the updater changes nothing until the file is proven to be ours');
const iVerify = upd.indexOf('openssl dgst -sha256 -verify'), iBackup = upd.indexOf('tar -czf "$B"'), iCopy = upd.indexOf('cd "$KITROOT" && tar -xf -');
check('the signature is checked before the backup and before any file is copied', iVerify > 0 && iVerify < iBackup && iBackup < iCopy);
check('a server that already has a key uses ITS key, never the one inside the file', /if \[ -s "\$KEY" \]; then USEKEY="\$KEY"; else USEKEY="\$W\/update-key\.pub\.pem"; BOOT=1; fi/.test(upd));
check('the key is installed only when the server has none', /\[ -s "\$KEY" \] \|\| install -m 644 "\$W\/update-key\.pub\.pem" "\$KEY"/.test(upd));
check('a failed signature stops with nothing changed', /-verify "\$USEKEY"[\s\S]{0,120}\|\| fail "The file's signature does not match/.test(upd));
console.log('[2] data and settings are never touched');
check('the backup leaves out the data (selfhost/stack)', /--exclude=customer-install\/selfhost\/stack customer-install/.test(upd));
check('ownership is handed over everywhere EXCEPT selfhost/stack (the database files)', /find "\$KITROOT" -path "\$KITROOT\/selfhost\/stack" -prune -o -exec chown safetylab:safetylab \{\} \+/.test(upd) && !/chown -R safetylab:safetylab "\$KITROOT"/.test(upd));
check('a failed copy puts the kit back from the backup', /\|\| \{ tar -xzf "\$B" -C \/opt\/safetylab/.test(upd));
check('the services are brought up by install.sh as the maintenance user, offline', /sudo -u safetylab env SLAB_OFFLINE=1 bash install\.sh/.test(upd));
console.log('[3] the update file is built from a commit and signed with the matching key');
check('refuses uncommitted kit changes', /git status --porcelain -- customer-install\)" \] \|\| stop/.test(mk));
check('refuses a private key that does not match the committed public key', /openssl ec -in "\$PRIV" -pubout[\s\S]{0,80}git show "\$REF:\$PUB"\)" \] \|\| stop/.test(mk));
check('verifies its own signature before writing the file', /openssl dgst -sha256 -verify[\s\S]{0,140}\|\| stop "the signature did not verify/.test(mk));
check('the update never carries the guide or anything outside customer-install', /git archive "\$REF" customer-install/.test(mk) && /rm -f "\$W"\/customer-install\/SL-DG-0001\*/.test(mk));
check('the public update key is committed, and is a public key only', (() => { const k = rd('customer-install/appliance/files/update-key.pub.pem'); return /BEGIN PUBLIC KEY/.test(k) && !/PRIVATE/.test(k); })());
check('the appliance carries the updater and the key', /COPY files\/safetylab-update \/usr\/local\/sbin\/safetylab-update/.test(docker) && /COPY files\/update-key\.pub\.pem \/opt\/safetylab\/update-key\.pub\.pem/.test(docker));
console.log('[4] database steps: every one exactly once');
check('steps are recorded in private.kit_migrations', /create table if not exists private\.kit_migrations/.test(inst));
check('servers built before the record count 00 to 21 as done, nothing after', /KIT_BASELINE="00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21"/.test(inst));
check('a failing step stops the run with nothing recorded for it', /OUT="\$\(PGX < "\$f" 2>&1\)" \|\| \{ printf '%s\\n' "\$OUT"; die "The database step \$b failed/.test(inst));
{ const iDie = inst.indexOf('die "The database step $b failed'), iRec = inst.indexOf(`values ('$b')" >/dev/null\n  NEW_STEPS=`);
  check('only after a step succeeds is it recorded', iDie > 0 && iRec > iDie, iDie + ' ' + iRec); }
console.log('[5] the license lives on the server');
check('the menu checks a license with the AI service\'s own verifier before saving it', /docker exec -i safetylab-ai-proxy node \/app\/license-check\.mjs/.test(menu) && menu.indexOf('license-check.mjs') < menu.indexOf('server.lic.new'));
check('...saves it in one step (no half-written file)', /> \$KIT\/stack\/license\/server\.lic\.new[\s\S]{0,80}mv -f \$KIT\/stack\/license\/server\.lic\.new \$KIT\/stack\/license\/server\.lic/.test(menu));
check('the setup file carries the server\'s license', /if \[ -s "\$STACK\/license\/server\.lic" \]; then LIC_FILE="\$STACK\/license\/server\.lic"/.test(inst));
check('the AI service sees the license read-only and keeps seats in its own folder', /- \.\/license:\/license:ro/.test(rd('customer-install/selfhost/docker-compose.safetylab.yml')) && /- \.\/ai-proxy-data:\/data/.test(rd('customer-install/selfhost/docker-compose.safetylab.yml')));
console.log('[6] the scripts parse');
for (const f of ['customer-install/appliance/files/safetylab-update', 'customer-install/appliance/files/safetylab-menu', 'tools/server-update/make-server-update.sh', 'tools/server-update/keygen.sh', 'customer-install/selfhost/install.sh'])
  check('bash -n ' + f, cp.spawnSync('bash', ['-n', path.join(R, f)]).status === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
