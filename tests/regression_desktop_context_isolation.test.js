#!/usr/bin/env node
/*
 * Regression — the desktop app window runs with contextIsolation ON (17 Sep 2026).
 *
 * WHAT WAS WRONG. The app window ran with contextIsolation:false, which means the preload and
 * the page share one world: anything running in the page can reach the preload's scope. The
 * recorded reason was that the bundle is ~230 classic scripts sharing window globals. That
 * reason was wrong, and it kept the setting off for months. contextIsolation separates the
 * PRELOAD from the page. It does not separate the page's own scripts from each other, so those
 * 230 files still share one window and not one of them had to change.
 *
 * WHY IT MATTERED MORE BY THE TIME IT WAS FIXED. On 16 Sep the preload gained the OS-keychain
 * writer and the ALM connector bridge. With isolation off, those sat in the same world as every
 * script on the page. The credential itself was never readable — there is no accessor that
 * returns one — but the boundary belonged there regardless.
 *
 * THE ONE THING THAT GENUINELY HAD TO MOVE. window.__slabAuthCallback was defined in the preload
 * and reached into the page for getSupabaseClient(). That direction is what isolation forbids.
 * It now lives in the page (site/auth_gate.js), and main.js still calls it through
 * webContents.executeJavaScript, which runs in the page's own world and is unaffected.
 *
 * Run: node tests/regression_desktop_context_isolation.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const DESK = path.join(REPO, '..', 'safety-lab-desktop');
const readDesk = p => fs.readFileSync(path.join(DESK, p), 'utf8');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');

const main = readDesk('main.js');
const pre = readDesk('preload-app.js');
const gate = read('site/auth_gate.js');

console.log('\n[isolation] every window in the shell is isolated');
{
  // Strip comments first. main.js deliberately keeps the OLD note explaining why the setting
  // used to be off, and that note contains the words "contextIsolation:false". Counting raw
  // text finds it and calls it a live window. It also means an "is anything still false?"
  // check can pass by an accident of spacing, which is how the first version of this test
  // passed while being wrong.
  const code = main.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const flags = code.match(/contextIsolation:\s*(true|false)/g) || [];
  check('there are three browser windows configured', flags.length === 3, flags.join(' '));
  check('every one of them is isolated',
    flags.length > 0 && flags.every(f => /true/.test(f)), flags.join(' '));
  check('the comment explaining the old setting is not mistaken for a live one',
    /contextIsolation:false/.test(main) && !/contextIsolation:false/.test(code));
  check('nodeIntegration stays off everywhere', !/nodeIntegration:\s*true/.test(code));
}

console.log('\n[preload] it hands things over, it does not reach in');
check('the preload uses contextBridge', /contextBridge\.exposeInMainWorld/.test(pre));
{
  // Strip comments first: the file explains the old behavior in prose, and prose is not code.
  const code = pre.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  check('no assignment onto the page window survives in code',
    !/(^|[^.\w])window\.[A-Za-z_$][\w$]*\s*=/.test(code),
    'that is the thing isolation exists to stop');
  check('the preload does not call into the page',
    !/window\.getSupabaseClient\s*\(/.test(code),
    'reaching into the page for its Supabase client was the one real blocker');
  check('the SSO handler is no longer defined here', !/__slabAuthCallback\s*=/.test(code));
}

console.log('\n[handover] everything the page needs still crosses');
{
  const rules = require(path.join(DESK, 'shell_rules.js'));
  // The richest configuration, so every optional key is present.
  const o = rules.overridesFor(
    { backend: 'own', backendUrl: 'https://db.example.com', backendKey: 'k',
      ai: 'own', aiEndpoint: 'https://ai.example.com/v1/ai', webAppUrl: 'https://app.example.com' },
    'LICENCE-BLOB', '9.9.9');
  const keys = Object.keys(o);
  // Name them rather than count them: __SLAB_LOCAL_ONLY__ only appears on a files-only install,
  // so no single configuration produces every key and a count is the wrong assertion.
  for (const k of ['__SLAB_DESKTOP__', '__SLAB_LICENSE__', '__SLAB_SUPABASE_URL__', '__SLAB_SUPABASE_KEY__',
                   '__SLAB_AI_ENDPOINT__', '__SLAB_WEB_APP_URL__', 'slabDesktop']) {
    check('overridesFor still produces ' + k, keys.includes(k), keys.join(' '));
  }
  {
    const filesOnly = Object.keys(rules.overridesFor({ backend: 'files', ai: 'off' }, '', '1.0.0'));
    check('and __SLAB_LOCAL_ONLY__ on a files-only install', filesOnly.includes('__SLAB_LOCAL_ONLY__'), filesOnly.join(' '));
  }
  check('the preload exposes every key it produces, by name',
    /Object\.keys\(o\)\.forEach\([\s\S]{0,200}?exposeInMainWorld\(k, o\[k\]\)/.test(pre),
    'exposing them under a namespace would mean changing every reader in site/');

  // contextBridge refuses anything it cannot clone. Catch that here rather than at boot,
  // because a key that fails to cross leaves the app with no configuration at all.
  const bad = [];
  const walk = (v, p) => {
    if (v === null) return;
    const t = typeof v;
    if (t === 'function' || t === 'symbol') { bad.push(p + ' is a ' + t); return; }
    if (t === 'object') Object.keys(v).forEach(k => walk(v[k], p + '.' + k));
  };
  keys.forEach(k => walk(o[k], k));
  check('every exposed value is cloneable across the bridge', bad.length === 0, bad.join(', '));
}
check('the keychain writer still crosses', /exposeInMainWorld\('slabSecrets'/.test(pre));
check('the connector bridge still crosses', /exposeInMainWorld\('slabBridge'/.test(pre));
check('still no accessor that returns a secret',
  !/getSecret|revealSecret|readSecret/.test(pre),
  'write and ask, never read — that rule does not change because the boundary moved');

console.log('\n[sso] the page owns the return, and the shell still reaches it');
check('auth_gate defines the handler', /window\.__slabAuthCallback = async function \(url\)/.test(gate));
check('it uses the page\'s own client', /const sb = getSupabase\(\);/.test(gate));
check('the shell still calls it through executeJavaScript',
  /executeJavaScript\('\(window\.__slabAuthCallback \?/.test(main),
  'executeJavaScript runs in the page world, so isolation does not affect this call');
check('both halves of the SSO return are kept',
  /exchangeCodeForSession/.test(gate) && /setSession/.test(gate));

console.log('\n[reason] the wrong reason is recorded, so it does not come back');
check('main.js says why the old reason was wrong',
  /That reason was wrong/.test(main) && /does not separate the page's own scripts/.test(main));

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);
