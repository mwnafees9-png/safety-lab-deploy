#!/usr/bin/env node
/*
 * Regression — the desktop connector never made a request, and kept the password in the clear
 * (16 Sep 2026).
 *
 * TWO defects, one cause: live_bridge.js was written for a desktop that fetches Jama directly
 * from the page. Its own header said so. It never could.
 *
 *   1. THE DESKTOP BRIDGE COULD NOT MAKE A SINGLE REQUEST. shell_rules.allowedHosts() admits
 *      ONLY the configured backend host and the AI endpoint host, and main.js cancels everything
 *      else in the app partition through webRequest.onBeforeRequest. A Jama host is in that set
 *      under NONE of the three backend configurations — not 'safetylab', not 'own', and
 *      certainly not 'files', where nothing at all is allowed. The connector panel shipped in
 *      the desktop bundle (app/index.html loads live_bridge.js and jama_bridge.js), was
 *      fillable, and every check it ever ran was cancelled before it left.
 *   2. THE CREDENTIAL SAT IN localStorage IN PLAINTEXT. The 5 Sep audit listed "Jama
 *      username+password in plaintext localStorage" as a HIGH finding. On the desktop there is
 *      no database vault to move it to, so it goes into the OS keychain via Electron's
 *      safeStorage, and the request moves into the main process so the page never holds it.
 *
 * The fix must NOT be "add the tool's host to the egress allowlist". That would let ~230 classic
 * scripts running with contextIsolation:false reach an arbitrary external host, which is the
 * fence's whole purpose. The main process is outside the renderer's session, so moving the call
 * there fixes the bridge without widening the fence by one host. A later "simplification" that
 * puts the tool host back in allowedHosts is the regression to catch.
 *
 * Run: node tests/regression_desktop_bridge_credential.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const DESK = path.join(REPO, '..', 'safety-lab-desktop');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const readDesk = (p) => fs.readFileSync(path.join(DESK, p), 'utf8');
const deskExists = (p) => fs.existsSync(path.join(DESK, p));

const web = read('site/live_bridge.js');

console.log('\n[fence] the egress fence is NOT the thing that got loosened');
{
  const rules = require(path.join(DESK, 'shell_rules.js'));
  const CFGS = [
    { backend: 'safetylab', ai: 'safetylab' },
    { backend: 'own', backendUrl: 'https://db.customer.com', ai: 'own', aiEndpoint: 'https://ai.customer.com/v1/ai' },
    { backend: 'files', ai: 'off' }
  ];
  for (const cfg of CFGS) {
    check('a tool host stays refused on backend=' + cfg.backend,
      rules.egressAllowed('https://customer.jamacloud.com/rest/latest/abstractitems', cfg) === false,
      'the renderer must not gain reach to an arbitrary external host');
  }
  check('the backend host is still allowed (the fence still works at all)',
    rules.egressAllowed('https://db.customer.com/rest/v1/x', CFGS[1]) === true);
  check('allowedHosts still derives only from backend + AI settings',
    !/jama|bridge|connector|alm/i.test(String(rules.allowedHosts)),
    'adding the tool host here is the tempting wrong fix');
}

console.log('\n[desktop] the request is made by the main process');
check('secrets.js exists', deskExists('secrets.js'));
check('bridge_main.js exists', deskExists('bridge_main.js'));
const sec = deskExists('secrets.js') ? readDesk('secrets.js') : '';
const bm = deskExists('bridge_main.js') ? readDesk('bridge_main.js') : '';
const main = readDesk('main.js');
const pre = readDesk('preload-app.js');

check('main.js registers the bridge channel', /ipcMain\.handle\('slab:bridgeGet'/.test(main));
// 17 Sep 2026: assert the NAME the page ends up with, not how it got there. This originally
// read /window\.slabBridge\s*=/, which pinned the delivery mechanism -- so when the window
// gained contextIsolation and the preload moved to contextBridge, a correct change turned this
// red. What matters is that the page can reach slabBridge, by either route.
const exposes = (name) =>
  new RegExp('window\\.' + name + '\\s*=').test(pre) ||
  new RegExp("exposeInMainWorld\\('" + name + "'").test(pre);
check('the preload exposes it to the page', exposes('slabBridge'));
check('the web bridge calls it on desktop', /window\.slabBridge\.get\(targetUrl\)/.test(web));
check('the web bridge no longer fetches the tool directly',
  !/_isDesktop\(\) \? targetUrl :/.test(web),
  'that branch is what the egress fence cancelled every time');
check('a desktop app too old to have the channel is told, not failed silently',
  /cannot reach the connector[\s\S]{0,120}?Update the app/.test(web));

console.log('\n[desktop] the credential is never readable from the page');
check('there is no getSecret channel at all',
  !/ipcMain\.handle\(\s*'slab:(getSecret|revealSecret|readSecret)'/.test(main) &&
  !/invoke\(\s*'slab:(getSecret|revealSecret|readSecret)'/.test(pre),
  'the page must not be able to ask for a value, not even its own');
check('reveal() is not exported over IPC', !/ipcMain\.handle\([^)]*reveal/i.test(main));
check('the preload exposes save/status/remove only',
  exposes('slabSecrets') &&
  /save:\s*function/.test(pre) && /status:\s*function/.test(pre) && /remove:\s*function/.test(pre) &&
  !/get:\s*function[^}]*getSecret/.test(pre));
check('status returns kind, meta and a date — never a value',
  /return \{ kind: kind, meta: e\.meta \|\| \{\}, updatedAt: e\.updatedAt \|\| null \};/.test(sec));
check('the value is encrypted with the OS keychain', /safeStorage\.encryptString/.test(sec));
check('no keychain means no save, rather than a silent plaintext write',
  /if \(!available\(\)\)[\s\S]{0,200}?throw new Error/.test(sec),
  'a credential store that quietly stops encrypting is worse than one that refuses');
check('the stored file is owner-only', /chmodSync\(p, 0o600\)/.test(sec));

console.log('\n[desktop] the page stops keeping the credential, and cleans up the old copy');
check('config save strips the credential on desktop',
  /if \(_isDesktop\(\)\) \{ delete o\.user; delete o\.token; \}/.test(web));
check('an existing plaintext credential is migrated into the keychain',
  /_migrateStoredCredential/.test(web) && /window\.slabSecrets\.save\('jama'/.test(web));
check('...and the plaintext copy is removed once it is safely stored',
  /if \(!r \|\| !r\.ok\) return;[\s\S]{0,160}?delete raw\.user; delete raw\.token;[\s\S]{0,120}?localStorage\.setItem/.test(web),
  'deleting before the save succeeds would lose the credential');
check('saving fails CLOSED when the keychain refuses',
  /if \(!r \|\| !r\.ok\) \{[\s\S]{0,220}?return;\s*\/\/ fail CLOSED/.test(web));

console.log('\n[desktop] the main-process fetch is not an open proxy');
for (const [name, re] of [
  ['https only', /u\.protocol !== 'https:'/],
  ['no IP literals, localhost, .local or .internal', /isIp \|\| host === 'localhost'[\s\S]{0,80}?\.internal/],
  ['port 443 only', /u\.port && u\.port !== '443'/],
  ['ALM REST paths only', /indexOf\('\/rest\/'\) === -1/],
  ['GET only', /method: 'GET'/],
  ['redirects refused, so the auth header cannot follow off-host', /redirect: 'error'/],
  ['a timeout, so a hung tool cannot wedge the app', /AbortSignal\.timeout/],
]) check('bridge_main enforces: ' + name, re.test(bm));

check('the target host must match the SAVED connector, not one the page supplies',
  /const meta = secrets\.metaFor\('jama'\);[\s\S]{0,200}?targetProblem\(rawUrl, meta && meta\.baseHost\)/.test(bm),
  'reading the allowed host from the request would let the renderer point it anywhere');
check('a fetch failure does not echo the exception, which can carry the auth header',
  /Never echo the exception verbatim/.test(bm) && !/String\(e[\s\S]{0,20}?\)/.test(bm.slice(bm.indexOf('catch (e)'), bm.indexOf('catch (e)') + 300)));

console.log('\n[pins] the bundle moved, or the old broken build keeps being served');
{
  const idx = read('site/index.html');
  const m = idx.match(/live_bridge\.js\?v=([0-9.]+)/);
  check('live_bridge pin is past the broken build', m && m[1] !== '1.0', m && m[1]);
}

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);
