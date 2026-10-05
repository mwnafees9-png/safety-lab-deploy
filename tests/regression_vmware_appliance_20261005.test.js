#!/usr/bin/env node
/*
 * Regression (5 Oct 2026): the Safety Lab Aero VMware appliance (customer-install/appliance).
 *
 * WHAT IT IS. One .ova file IT imports into VMware: Ubuntu 24.04, Docker, the kit and every
 * container image, so the customer's server downloads nothing. On first start a console setup asks
 * four things (maintenance password, address, administrator, AI key) and runs install.sh offline.
 *
 * FOUND BY THE BOOT TEST (QEMU, no internet, VMware's PVSCSI disk and VMXNET3 network):
 *   - QEMU cannot boot the LSI Logic SAS controller it imitates; the appliance uses VMware's
 *     PVSCSI, which QEMU emulates faithfully, so the test drives the exact driver VMware will.
 *   - The setup script landed without permission to run (203/EXEC): permissions are now set in
 *     the image recipe, never inherited from how the files were copied.
 *   - The stack's own key generator (stack-src/utils/add-new-auth-keys.sh) pulls node:22-alpine
 *     at install time. Offline that failed. Every image any install script runs is now carried.
 * This file keeps those true and checks the parts that can run without a VM.
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' :: ' + d : '')); } };
const KIT = path.join(__dirname, '..', 'customer-install');
const A = path.join(KIT, 'appliance');
const R = (p) => fs.readFileSync(path.join(A, p), 'utf8');
const build = R('build-appliance.sh'), docker = R('Dockerfile'), ovf = R('appliance.ovf.template');
const setup = R('files/safetylab-setup'), menu = R('files/safetylab-menu'), unit = R('files/safetylab-setup.service');
const install = fs.readFileSync(path.join(KIT, 'selfhost', 'install.sh'), 'utf8');

console.log('[1] every image the install runs is inside the appliance');
check('the image list comes from Docker Compose itself, for the exact files install.sh layers',
  /docker compose --env-file \.env\.example -f docker-compose\.yml -f docker-compose\.caddy\.yml -f docker-compose\.safetylab\.yml config --images/.test(build));
const extra = (build.match(/echo (curlimages\/curl:[\w.]+|node:[\w.-]+)/g) || []).map(s => s.replace('echo ', ''));
// Every `docker run|pull <image>` and every hard-coded image in the scripts install.sh runs.
const scripts = ['selfhost/install.sh', 'selfhost/accounts.sh', 'selfhost/add-user.sh', 'selfhost/stack-src/utils/generate-keys.sh', 'selfhost/stack-src/utils/add-new-auth-keys.sh'];
const used = new Set();
for (const s of scripts) {
  const t = fs.readFileSync(path.join(KIT, s), 'utf8').replace(/^\s*#.*$/mg, '');
  for (const m of t.matchAll(/\b((?:[a-z0-9.-]+\/)?[a-z0-9._-]+(?:\/[a-z0-9._-]+)?:[a-zA-Z0-9._-]+)\b/g)) {
    const img = m[1];
    if (/^(node|curlimages\/curl|alpine|busybox)(:|\/)/.test(img) && !/\.sh$/.test(img)) used.add(img);
  }
}
check('the scripts\' own images were found (the scan works)', used.has('node:22-alpine') && used.has('curlimages/curl:8.10.1'), [...used].join(', '));
for (const img of used) check('carried in the appliance: ' + img, extra.includes(img), 'add it to the IMAGES line in build-appliance.sh');
check('install.sh is told it is offline, so it never tries to download', /SLAB_OFFLINE=1/.test(setup) && /SLAB_OFFLINE:-0\}" = 1 \]/.test(install));

console.log('[2] the image recipe');
check('scripts get their permissions in the recipe, not from how files were copied',
  /chmod 755 \/usr\/local\/sbin\/safetylab-setup \/usr\/local\/bin\/safetylab-menu \/opt\/safetylab\/customer-install\/selfhost\/\*\.sh \/opt\/safetylab\/customer-install\/db\/\*\.sh/.test(docker));
check('the recipe never touches resolv.conf or fstab (Docker holds them during a build)', !/resolv\.conf|\/etc\/fstab/.test(docker.replace(/^#.*$/mg, '')));
check('Docker from Ubuntu\'s own packages, VMware guest tools, SSH, the console dialogs', /docker\.io docker-compose-v2/.test(docker) && /open-vm-tools/.test(docker) && /openssh-server/.test(docker) && /whiptail/.test(docker));
check('the maintenance login starts locked; the setup sets its password', /passwd -l safetylab/.test(docker) && /chpasswd/.test(setup));
check('the disk boots by filesystem id, not by device name', /search --no-floppy --fs-uuid/.test(build) && /root=UUID=\$UUID/.test(build) && /UUID=%s \/ ext4/.test(build));
check('the build starts from a commit, like the zip', /git -C "\$REPO" archive "\$REF" customer-install/.test(build));
check('the .ova carries a checksum list', /SHA256\(%s\)= %s/.test(build) && /\.mf/.test(build));

console.log('[3] the VMware descriptor');
const filled = ovf.replace('__VMDK__', 'x.vmdk').replace('__VMDK_BYTES__', '1').replace('__DISK_GB__', '60').replace('__POPULATED__', '1').replace(/__VERSION__/g, 'abc');
check('every placeholder is filled by the build', !/__[A-Z_]+__/.test(filled) && ['__VMDK__', '__VMDK_BYTES__', '__DISK_GB__', '__POPULATED__', '__VERSION__'].every(p => build.includes(p)));
const xml = cp.spawnSync('python3', ['-c', 'import sys,xml.dom.minidom as m; m.parseString(sys.stdin.read()); print("ok")'], { input: filled, encoding: 'utf8' });
check('the descriptor is well-formed XML', xml.stdout.trim() === 'ok', xml.stderr);
check('VMware\'s PVSCSI disk controller (the one the boot test proved)', /<rasd:ResourceSubType>VirtualSCSI<\/rasd:ResourceSubType>/.test(ovf) && !/lsilogic<\/rasd/.test(ovf));
check('VMXNET3 network, 4 CPUs, 16 GB of memory, BIOS boot, Ubuntu 64-bit', /VmxNet3/.test(ovf) && /<rasd:VirtualQuantity>4<\/rasd:VirtualQuantity>/.test(ovf) && /<rasd:VirtualQuantity>16384<\/rasd:VirtualQuantity>/.test(ovf) && /key="firmware" vmw:value="bios"/.test(ovf) && /ubuntu64Guest/.test(ovf));

console.log('[4] the first-start setup');
check('it runs once, on the console, before the login prompt', /ConditionPathExists=!\/var\/lib\/safetylab\/setup-done/.test(unit) && /TTYPath=\/dev\/tty1/.test(unit) && /Before=getty@tty1\.service/.test(unit));
check('the AI key goes to install.sh in its environment, never into a file or the log',
  /ANTHROPIC_API_KEY="\$KEY"/.test(setup) && !/KEY.*>>\s*\$LOG|echo "\$KEY"|\$KEY.*answers\.env/.test(setup) && /unset KEY/.test(setup));
check('the administrator\'s temporary password is masked in the log, shown once on screen', setup.includes("sed 's/\\(password: *\\).*/\\1(shown on screen once)/'"));
check('the test answers file is deleted as soon as it is read', /\. \$BASE\/autosetup\.env; rm -f \$BASE\/autosetup\.env/.test(setup));
check('a fixed address is written for the adapter, with gateway and DNS', /addresses: \["\$A\/\$P"\]/.test(setup) && /via: "\$G"/.test(setup) && /netplan apply/.test(setup));
check('it says the address must never change', /The address must never change/.test(setup));
check('on success it shows where users get the setup file, and the certificate fingerprint to compare', /https:\/\/\$ADDR\/safetylab-setup/.test(setup) && /-fingerprint -sha256/.test(setup));
// the checks it makes on what IT types, executed
const fnsrc = (name) => (setup.match(new RegExp('^' + name + '\\(\\)\\{[^\\n]*\\}$', 'm')) || [''])[0];
const run = (fn, arg) => cp.spawnSync('bash', ['-c', fnsrc(fn) + '\n' + fn + ' ' + JSON.stringify(arg) + ' && echo Y || echo N'], { encoding: 'utf8' }).stdout.trim();
check('address check accepts 10.20.30.40', run('ipv4_ok', '10.20.30.40') === 'Y');
for (const bad of ['10.20.30', '256.1.1.1', '10.020.1.1', 'abc']) check('address check refuses ' + bad, run('ipv4_ok', bad) === 'N');
check('email check accepts a work address and refuses a bare name', run('email_ok', 'lenny@radia.com') === 'Y' && run('email_ok', 'lenny') === 'N');

console.log('[5] the maintenance menu');
check('it is the safetylab user\'s login shell, listed as a real shell', /-s \/usr\/local\/bin\/safetylab-menu/.test(docker) && /\/etc\/shells/.test(docker));
check('scp and commands over SSH still work (non-interactive runs bash)', /exec \/bin\/bash "\$@"/.test(menu));
check('Add a person runs add-user.sh', /\.\/add-user\.sh "\$E"/.test(menu));

console.log('[6] the setup file is downloadable from the server');
const caddy = fs.readFileSync(path.join(KIT, 'selfhost', 'Caddyfile.template'), 'utf8');
const comp = fs.readFileSync(path.join(KIT, 'selfhost', 'docker-compose.safetylab.yml'), 'utf8');
check('the web server offers it at /safetylab-setup, as a download, before the dashboard\'s password check',
  caddy.indexOf('handle /safetylab-setup') > -1 && caddy.indexOf('handle /safetylab-setup') < caddy.indexOf('basic_auth') && /Content-Disposition "attachment/.test(caddy));
check('...from a read-only folder the install fills', /\.\/volumes\/proxy\/setup:\/srv\/safetylab:ro/.test(comp) && /cp "\$SETUP" "\$STACK\/volumes\/proxy\/setup\/setup\.safetylab-setup"/.test(install));
check('...made by the installing user before Docker could make it as root', install.indexOf('mkdir -p volumes/proxy/setup') > -1 && install.indexOf('mkdir -p volumes/proxy/setup') < install.indexOf('docker compose up'));

console.log('[6b] a slow first start is retried, nothing else is');
{ const st = fs.readFileSync(path.join(__dirname, '..', 'customer-install', 'appliance', 'files', 'safetylab-setup'), 'utf8');
  check('setup retries install.sh up to three times', /for TRY in 1 2 3; do/.test(st));
  check('...only when a service was slow to come up, any other stop is final', /grep -q 'A service did not come up' \|\| break/.test(st)); }

console.log('[7] the guide tells IT how');
const KITD = path.join(__dirname, '..', 'customer-install');
const cur = fs.readdirSync(KITD).filter(f => /^SL-DG-0001 .* v[\d.]+\.docx$/.test(f)).sort((a, b) => a.match(/v([\d.]+)\.docx$/)[1].localeCompare(b.match(/v([\d.]+)\.docx$/)[1], 'en', { numeric: true })).pop();
const g = cp.spawnSync('unzip', ['-p', path.join(KITD, cur), 'word/document.xml'], { encoding: 'utf8' }).stdout.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
check('the current guide has section 4.6, the VMware appliance', /4\.6 The VMware appliance: import one file/.test(g));
check('...import with Deploy OVF Template, four questions, the setup file address', /Deploy OVF Template/.test(g) && /Answer four questions:/.test(g) && /\/safetylab-setup/.test(g));
check('...and the contents page lists it', (g.match(/4\.6 The VMware appliance: import one file/g) || []).length === 2);

console.log('[8] the customer kit zip leaves the appliance recipe out');
{ const ps = fs.readFileSync(path.join(__dirname, '..', 'package-customer-install.sh'), 'utf8');
  check('package-customer-install.sh deletes customer-install/appliance from the zip', /zip -q -d "\$ZIP" 'customer-install\/appliance\/\*'/.test(ps));
  check('...and refuses to finish if any of it is still there', /grep '\^customer-install\/appliance' \|\| true\)" \] \|\| \{ rm -f "\$ZIP"; stop/.test(ps));
  // Build the real zip and look inside: the first version passed the text checks and still shipped the recipe.
  const out = fs.mkdtempSync(path.join(require('os').tmpdir(), 'slpkg-'));
  const r = cp.spawnSync('bash', [path.join(__dirname, '..', 'package-customer-install.sh')], { cwd: path.join(__dirname, '..'), encoding: 'utf8', env: Object.assign({}, process.env, { SLAB_PACKAGE_OUT: out, SLAB_PACKAGE_ALLOW_DIRTY: '1' }) });
  const z = fs.readdirSync(out).filter(f => f.endsWith('.zip'))[0];
  const names = z ? cp.spawnSync('unzip', ['-Z1', path.join(out, z)], { encoding: 'utf8' }).stdout : '';
  check('the built kit zip really has no appliance files', r.status === 0 && !!z && !/customer-install\/appliance/.test(names) && /SL-DG-0001 /.test(names), (r.stderr || '').slice(-300));
  fs.rmSync(out, { recursive: true, force: true }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
