#!/usr/bin/env node
/*
 * Regression (5 Oct 2026): a customer server addressed by IP address, and Docker installed by the script.
 *
 * WHY. Radia has no internal DNS name for the server; IT will give the VM a fixed IP. install.sh
 * made its certificate for a DNS name only (SAN DNS:<name>, root limited to DNS:<name>), so for an
 * IP the desktop app refused the connection. Proven live the same day on a full stack at
 * 192.0.2.2: both front-door checks 200, setup file with https://192.0.2.2 and the leaf pin, the
 * server answering a no-name connection with the IP certificate only because of default_sni
 * (without it: no certificate, 000), and a license signed to the IP accepted by the AI service
 * (200) while licenses for another IP or a DNS name were refused (403). This file keeps all of
 * that true without a stack: every part is EXECUTED, from the script's own text.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' :: ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const INSTALL = fs.readFileSync(path.join(ROOT, 'customer-install', 'selfhost', 'install.sh'), 'utf8');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'ipsrv-'));
const between = (a, b) => { const i = INSTALL.indexOf(a), j = INSTALL.indexOf(b, i + a.length); return i >= 0 && j > i ? INSTALL.slice(i, j) : ''; };
const bash = (script, env) => cp.spawnSync('bash', ['-c', script], { encoding: 'utf8', env: Object.assign({}, process.env, env || {}) });

(async () => {
  console.log('[1] name or IP address: what the script decides');
  const block = between('# ---------------------------------------------------------------- 1b. name or IP address', '# ---------------------------------------------------------------- 2. stack files');
  check('the script has its name-or-IP step', block.length > 200);
  const decide = (name) => { const r = bash('die(){ echo "STOP: $*"; exit 1; }\nSERVER_NAME=' + JSON.stringify(name) + '\n' + block + '\necho "KIND=$SERVER_KIND SAN=$SAN LIMIT=$NAME_LIMIT NAME=$SERVER_NAME"'); return (r.stdout + r.stderr).trim(); };
  check('an IPv4 address is an IP, with an IP certificate and a root limited to that one address',
    decide('10.20.30.40') === 'KIND=ip SAN=IP:10.20.30.40 LIMIT=IP:10.20.30.40/255.255.255.255 NAME=10.20.30.40', decide('10.20.30.40'));
  check('a name is a name, as before', decide('safetylab.radia.local') === 'KIND=dns SAN=DNS:safetylab.radia.local LIMIT=DNS:safetylab.radia.local NAME=safetylab.radia.local');
  check('spaces and capitals are cleaned up', /NAME=safetylab\.radia\.local$/.test(decide('  SafetyLab.Radia.local ')));
  for (const bad of ['256.1.1.1', '10.020.30.40', '127.0.0.1', '169.254.1.1', '0.0.0.0', '224.0.0.1', '255.255.255.255'])
    check('refused, with a sentence that says why: ' + bad, /^STOP: /.test(decide(bad)), decide(bad));
  for (const bad of ['localhost', 'a;rm -rf x', 'name with space', '-leading.example', 'fe80::1', 'x'.repeat(254)])
    check('refused: ' + bad.slice(0, 30), /^STOP: /.test(decide(bad)), decide(bad));

  console.log('[2] the certificate the script makes, made for real with openssl');
  const certBlock = between('  C=volumes/proxy/certs\n', '  cp "$C/root.crt" "$HERE/trust-this-on-every-user-computer.crt"');
  check('the certificate step is found in the script', /openssl req -x509/.test(certBlock) && /server\.ext/.test(certBlock));
  const mk = (name) => {
    const d = fs.mkdtempSync(path.join(T, 'cert-'));
    const r = bash('set -e\ncd ' + JSON.stringify(d) + '\nmkdir -p volumes/proxy/certs\ndie(){ echo "STOP: $*"; exit 1; }\nSERVER_NAME=' + JSON.stringify(name) + '\n' + block + '\nC=volumes/proxy/certs\n' + certBlock);
    return { d, r, C: path.join(d, 'volumes/proxy/certs') };
  };
  const ip = mk('192.0.2.2');
  const sanIp = bash('openssl x509 -in ' + ip.C + '/server.leaf.crt -noout -ext subjectAltName').stdout;
  check('the server certificate names the IP address (IP Address:192.0.2.2)', /IP Address:192\.0\.2\.2/.test(sanIp) && !/DNS:/.test(sanIp), sanIp + ip.r.stderr);
  const nc = bash('openssl x509 -in ' + ip.C + '/root.crt -noout -ext nameConstraints').stdout;
  check('the root may vouch for that one address and nothing else', /IP:192\.0\.2\.2\/255\.255\.255\.255/.test(nc), nc);
  check('the server certificate checks out against the root', /OK/.test(bash('openssl verify -CAfile ' + ip.C + '/root.crt ' + ip.C + '/server.leaf.crt').stdout));
  const pinBefore = bash('openssl x509 -in ' + ip.C + '/server.leaf.crt -outform DER | openssl dgst -sha256').stdout;
  // a re-run with the same address keeps the certificate (and so every user's setup file)
  bash('set -e\ncd ' + JSON.stringify(ip.d) + '\ndie(){ echo "STOP: $*"; exit 1; }\nSERVER_NAME=192.0.2.2\n' + block + '\nC=volumes/proxy/certs\n' + certBlock);
  check('a re-run with the same address keeps the same certificate', bash('openssl x509 -in ' + ip.C + '/server.leaf.crt -outform DER | openssl dgst -sha256').stdout === pinBefore);
  // IT reassigns the address before go-live: the old certificate must not survive
  const re = bash('set -e\ncd ' + JSON.stringify(ip.d) + '\ndie(){ echo "STOP: $*"; exit 1; }\nSERVER_NAME=192.0.2.77\n' + block + '\nC=volumes/proxy/certs\n' + certBlock);
  const sanNew = bash('openssl x509 -in ' + ip.C + '/server.leaf.crt -noout -ext subjectAltName').stdout;
  check('a changed address makes a new certificate, root and all', /IP Address:192\.0\.2\.77/.test(sanNew) && /IP:192\.0\.2\.77\//.test(bash('openssl x509 -in ' + ip.C + '/root.crt -noout -ext nameConstraints').stdout), sanNew + re.stdout + re.stderr);
  const dns = mk('safetylab.radia.local');
  check('a name still gets a DNS certificate', /DNS:safetylab\.radia\.local/.test(bash('openssl x509 -in ' + dns.C + '/server.leaf.crt -noout -ext subjectAltName').stdout));

  console.log('[3] the web server and the front-door check');
  const caddy = between('# A connection to an IP address carries no server name', '\n\n');
  const caddyFor = (kind, name) => bash('HERE=' + JSON.stringify(path.join(ROOT, 'customer-install', 'selfhost')) + '\nSERVER_KIND=' + kind + '\nSERVER_NAME=' + name + '\nTLS_LINE=x\n' + caddy.replace(/ > volumes\/proxy\/caddy\/Caddyfile/, '')).stdout;
  check('for an IP the web server answers a no-name connection with the IP certificate (default_sni)', /^\{\n    default_sni 192\.0\.2\.2\n\}/.test(caddyFor('ip', '192.0.2.2')));
  check('for a name, no default is added', !/default_sni/.test(caddyFor('dns', 'safetylab.radia.local')) && /\{\$PROXY_DOMAIN\}/.test(caddyFor('dns', 'safetylab.radia.local')));
  check('the front-door check reaches the server with --connect-to, which works for an IP (--resolve ignores IPs)', /--connect-to "\$SERVER_NAME:443:/.test(INSTALL) && !/--resolve/.test(INSTALL));
  check('the first question asks for a name OR an IP and says the IP must be fixed', /Server name or IP address: /.test(INSTALL) && /must be fixed/.test(INSTALL));

  console.log('[4] a license signed to the IP: the real signing tool, the app\'s verifier and the AI service\'s');
  const H = path.join(T, 'home'); fs.mkdirSync(H);
  const SIGN = path.join(ROOT, 'tools', 'license', 'sign.mjs');
  cp.spawnSync('node', [SIGN, 'keygen'], { env: Object.assign({}, process.env, { HOME: H }), encoding: 'utf8' });
  const pub = JSON.parse(fs.readFileSync(path.join(H, '.safetylab', 'license_signing_key.pub.jwk.json'), 'utf8'));
  const tpl = JSON.parse(cp.spawnSync('node', [SIGN, 'template'], { env: Object.assign({}, process.env, { HOME: H }), encoding: 'utf8' }).stdout);
  const lic = (backend) => { const p = Object.assign({}, tpl, { id: 'TEST-' + backend, customer: 'Test', bind: { domains: [], tenant: '', backend } }); const f = path.join(T, backend + '.json'); fs.writeFileSync(f, JSON.stringify(p)); const o = path.join(T, backend + '.lic'); cp.spawnSync('node', [SIGN, 'sign', f, '--out', o], { env: Object.assign({}, process.env, { HOME: H }) }); return fs.readFileSync(o, 'utf8').trim(); };
  const L = { mine: lic('192.0.2.2'), other: lic('192.0.2.99'), name: lic('safetylab.radia.local') };
  check('the throwaway key signed three test licenses', Object.values(L).every(x => /^[\w-]+\.[\w-]+$/.test(x)));
  // the app (web and desktop share this file)
  const ctx = { console, URL, TextEncoder, TextDecoder, atob: (s) => Buffer.from(s, 'base64').toString('binary'), crypto: globalThis.crypto, Date, JSON, Math, Uint8Array, ArrayBuffer, Promise, localStorage: { getItem: () => null, setItem() {} }, document: { addEventListener() {}, readyState: 'complete' } };
  ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'site', 'slab_license.js'), 'utf8'), ctx);
  const appHost = new URL('https://192.0.2.2').host;
  const app = (blob) => ctx.SLLicenseVerify(blob, { now: Date.now(), keys: [pub], subtle: globalThis.crypto.subtle, backendHost: appHost, email: '', tenant: '', maxSeen: 0 });
  const a1 = await app(L.mine), a2 = await app(L.other), a3 = await app(L.name);
  check('the app accepts a license signed to the IP it is pointed at', a1.valid === true, a1.reason);
  check('the app refuses a license for another IP', a2.valid === false && /different backend/.test(a2.reason), a2.reason);
  check('the app refuses a license for a name when it is pointed at an IP', a3.valid === false, a3.reason);
  // the AI service (kit copy; byte-identical to the proxy repo by the kit parity test)
  const W = fs.readFileSync(path.join(ROOT, 'customer-install', 'selfhost', 'ai-proxy', 'worker.js'), 'utf8');
  const fnSrc = (name) => { const i = W.indexOf('function ' + name); const head = W.lastIndexOf('\n', i); let d = 0, j = W.indexOf('{', i); for (; j < W.length; j++) { if (W[j] === '{') d++; else if (W[j] === '}' && --d === 0) break; } return W.slice(head + 1, j + 1); };
  const pctx = { crypto: globalThis.crypto, TextDecoder, TextEncoder, JSON, Date, Array, String, Uint8Array, atob: (s) => Buffer.from(s, 'base64').toString('binary') };
  vm.createContext(pctx);
  vm.runInContext([fnSrc('_b64urlBytes'), fnSrc('_offlineKeys'), fnSrc('verifyOfflineLicense'), 'this.v = verifyOfflineLicense;'].join('\n'), pctx);
  const env = { LICENSE_MODE: 'offline', LICENSE_PUBLIC_KEYS: JSON.stringify([pub]), LICENSE_BACKEND_HOST: '192.0.2.2' };
  const p1 = await pctx.v(env, L.mine), p2 = await pctx.v(env, L.other), p3 = await pctx.v(env, L.name);
  check('the AI service accepts a license signed to its own IP', !p1.error && p1.license, JSON.stringify(p1));
  check('the AI service refuses a license for another IP', p2.error === 'wrong_install');
  check('the AI service refuses a license for a name', p3.error === 'wrong_install');
  check('install.sh writes the IP as the AI service\'s own address', /LICENSE_BACKEND_HOST=\$SERVER_NAME/.test(INSTALL));

  console.log('[5] Docker on a fresh Ubuntu machine');
  check('Ubuntu 22.04 or later, not Windows (WSL), is the one place the script installs Docker',
    /_ubuntu_ok\(\)\( \[ "\$\(uname -s\)" = Linux \] && ! grep -qi microsoft \/proc\/version/.test(INSTALL) && /"\$\{ID:-\}" = ubuntu/.test(INSTALL) && /-ge 22/.test(INSTALL));
  check('it installs Ubuntu\'s own docker.io and docker-compose-v2 (no outside package source)', /apt-get install -y -q docker\.io docker-compose-v2 openssl/.test(INSTALL) && !/download\.docker\.com|get\.docker\.com/.test(INSTALL));
  check('it lets the installing user run Docker and carries on without a log-out', /usermod -aG docker/.test(INSTALL) && /exec sg docker -c "bash '\$HERE\/install\.sh'"/.test(INSTALL));
  check('anywhere else it stops with what to install', /Docker is not installed\. On Windows or Mac install Docker Desktop/.test(INSTALL));
  check('the Docker step comes before any question is asked', INSTALL.indexOf('apt-get install -y -q docker.io') < INSTALL.indexOf('read -r -p'));
  // the decision itself, executed with a fake os-release
  const ub = between('_ubuntu_ok()', '\n');
  const okOn = (osr) => { const f = path.join(T, 'os-release'); fs.writeFileSync(f, osr); const r = bash(ub.split('/etc/os-release').join(f).split('/proc/version').join(path.join(T, 'ver')) + '\n_ubuntu_ok && echo YES || echo NO'); return (r.stdout + r.stderr).trim(); };
  fs.writeFileSync(path.join(T, 'ver'), 'Linux version 6');
  if (process.platform === 'linux') {
    check('Ubuntu 24.04: install', okOn('ID=ubuntu\nVERSION_ID="24.04"\n') === 'YES');
    check('Ubuntu 20.04: do not (too old for the compose package)', okOn('ID=ubuntu\nVERSION_ID="20.04"\n') === 'NO');
    check('Debian: do not', okOn('ID=debian\nVERSION_ID="12"\n') === 'NO');
  } else {
    check('not on Linux: the decision is no (this machine is a ' + process.platform + ')', okOn('ID=ubuntu\nVERSION_ID="24.04"\n') === 'NO');
  }

  console.log('[6] the guide the customer follows says the same');
  const KIT = path.join(ROOT, 'customer-install');
  const cur = fs.readdirSync(KIT).filter(f => /^SL-DG-0001 .* v[\d.]+\.docx$/.test(f)).sort((a, b) => a.match(/v([\d.]+)\.docx$/)[1].localeCompare(b.match(/v([\d.]+)\.docx$/)[1], 'en', { numeric: true })).pop();
  const g = cp.spawnSync('unzip', ['-p', path.join(KIT, cur), 'word/document.xml'], { encoding: 'utf8' }).stdout.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&apos;/g, "'");
  check('current guide (' + cur.replace(/^.* v/, 'v') + ') lets the server be an IP and says it must be fixed', /Use the computer.s IP address instead/.test(g) && /must be fixed: ask IT to make it static or reserve it/.test(g));
  check('...asks for the server name or IP address in the install questions', /the server name or IP address from Part 1 step 4/.test(g));
  check('...says the script installs Docker on Ubuntu', /On Ubuntu skip this step and the next: the script installs Docker itself/.test(g));
  check('...names the downloads the install needs (Docker Hub)', /Docker Hub/.test(g));
  check('...recommends 16 GB of memory', /16 GB of memory/.test(g));

  fs.rmSync(T, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
