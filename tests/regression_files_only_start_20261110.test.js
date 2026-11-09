/* regression_files_only_start_20261110.test.js: a Files only install opens with no sign-in.
 *
 * Waqas's brief, 10 Nov 2026: "Files only desktop installs can't get past the sign-in screen." Wanted: "Files only
 * opens with no sign-in, on a valid license plus the accepted agreement. The user types a local profile name once, for
 * the audit trail. No backend client at all in that mode, and no fallback to our hosted address on any customer
 * install." Rebuild: local_start.js (SLLocalStart) owns how Files only opens; auth_gate.js hands over to it before it
 * asks for a backend client; safety_lab.js and labs_thread_config.js use slab_config.js's addresses exactly (empty in
 * Files only); _initSupabaseClient builds no client in Files only or with no address.
 *   1  the code: no hosted fallback when SLConfig is present (safety_lab.js, labs_thread_config.js, run for real)
 *   2  the code: _initSupabaseClient returns no client in Files only; auth_gate hands over before getSupabase()
 *   3  index.html: local_start.js loads right before auth_gate.js, the changed files' pins are bumped
 *   4  the name rule: empty, one letter, markup and over 80 letters are refused in plain words
 *   5  browser, Files only, valid license, first start: the agreement, then the name, then the app opens
 *   6  ...and the name is who did it (SLAutopilotUI.who) and is kept on this computer
 *   7  ...and no backend client was ever built and nothing went to any database address
 *   8  browser, the same install reloaded: it opens straight away, the name is not asked again
 *   9  browser, Files only with no license: the app does not open, the screen says why in plain words
 *   10 browser, the hosted demo cloud: the sign-in is unchanged (the local start stands aside)
 *   11 desktop, Files only: the name is the computer account's (Waqas: "we should be getting this information from their
 *      login details"), nothing is asked
 * MUTATION PROOFS (SL_FOS_MUTATE): fallback (safety_lab.js falls back to the hosted address), labsfallback (the same in
 *   labs_thread_config.js), noguard (_initSupabaseClient builds a client in Files only), nohandoff (auth_gate.js does
 *   not hand over), askagain (the name is asked on every start), noagree (the agreement is skipped), nolicense (the
 *   license is not checked), noaccount (the computer account's name is ignored). Each one must turn this suite red.
 * Run: node tests/regression_files_only_start_20261110.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
const { webcrypto } = require('crypto');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_FOS_MUTATE || '';
const rd = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function mutate(file, body) {
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing in ' + file + ': ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'fallback' && file === 'safety_lab.js') { rep("_slabCfg ? (_slabCfg.supabaseUrl || '') :", "(_slabCfg && _slabCfg.supabaseUrl) ||"); rep("_slabCfg ? (_slabCfg.supabaseKey || '') :", "(_slabCfg && _slabCfg.supabaseKey) ||"); }
    if (MUT === 'labsfallback' && file === 'labs_thread_config.js') { rep("window.SLConfig ? (window.SLConfig.supabaseUrl || '') :", "(window.SLConfig && window.SLConfig.supabaseUrl) ||"); }
    if (MUT === 'noguard' && file === 'helpers_modules.js') { rep("window.SLConfig && window.SLConfig.browserOnly) return null;", "false) return null;"); rep("if (!SUPABASE_PROJECT_URL || !SUPABASE_PUBLISHABLE_KEY) return null;", ""); }
    if (MUT === 'nohandoff' && file === 'auth_gate.js') { rep("if (window.SLConfig && window.SLConfig.browserOnly && !window.__SLAB_CONFIG_FATAL__) {", "if (false) {"); }
    if (MUT === 'askagain' && file === 'local_start.js') { rep("function profile() { try {", "function profile() { return null; try {"); }
    if (MUT === 'noagree' && file === 'local_start.js') { rep("if (!agreementAccepted()) { showAgreement(); return true; }", ""); }
    if (MUT === 'noaccount' && file === 'local_start.js') { rep("function profile() { var ca = computerAccount(); if (ca) return ca;", "function profile() {"); }
    if (MUT === 'nolicense' && file === 'local_start.js') { rep("if (!lic.valid) { showLicense(lic); return true; }", ""); }
    return body;
}

// ---- 1, 2: the code, run for real in a sandbox -----------------------------------------------------------------------
function backendConsts(slCfg, extra) {
    const src = mutate('safety_lab.js', rd('safety_lab.js'));
    const i = src.indexOf('const _slabBackendCfg'), j = src.indexOf("try { if (SUPABASE_PROJECT_URL &&");
    const w = Object.assign({ SLConfig: slCfg }, extra || {});
    const ctx = { window: w, console: { info() {} } };
    vm.runInNewContext(src.slice(i, j) + '\n;globalThis.__r = { url: SUPABASE_PROJECT_URL, key: SUPABASE_PUBLISHABLE_KEY };', ctx);
    return ctx.__r;
}
const HOSTED = 'fhrqkhdrwbfnizkepkch';
{
    const fo = backendConsts({ browserOnly: true, supabaseUrl: '', supabaseKey: '' });
    const own = backendConsts({ supabaseUrl: 'https://db.example.test/', supabaseKey: 'k1' });
    const none = backendConsts(null, {});
    check('1  safety_lab.js: Files only gets no database address (not the hosted one); an own server gets its own; only with no slab_config at all the hosted one', fo.url === '' && fo.key === '' && own.url === 'https://db.example.test' && own.key === 'k1' && none.url.indexOf(HOSTED) >= 0, JSON.stringify({ fo, own, none: none.url }));
    const w = { SLConfig: { browserOnly: true, supabaseUrl: '', supabaseKey: '' } };
    vm.runInNewContext(mutate('labs_thread_config.js', rd('labs_thread_config.js')), { window: w, console });
    check('1  labs_thread_config.js: Files only gets no database address either', w.LABS_THREAD_CONFIG && w.LABS_THREAD_CONFIG.url === '' && w.LABS_THREAD_CONFIG.anonKey === '', JSON.stringify(w.LABS_THREAD_CONFIG && { url: w.LABS_THREAD_CONFIG.url }));
}
{
    const h = mutate('helpers_modules.js', rd('helpers_modules.js'));
    const i = h.indexOf('function _initSupabaseClient() {');
    let depth = 0, j = h.indexOf('{', i);
    for (let k = j; k < h.length; k++) { if (h[k] === '{') depth++; else if (h[k] === '}') { depth--; if (!depth) { j = k + 1; break; } } }
    const run = (w, url, key) => { let made = 0; w.supabase = { createClient() { made++; return { auth: { onAuthStateChange() {} } }; } }; const ctx = { window: w, console: { warn() {}, error() {}, log() {} }, SUPABASE_PROJECT_URL: url, SUPABASE_PUBLISHABLE_KEY: key, _supabaseClient: null, _supabaseReady: false, _supabaseSession: null, _onSupabaseSignedIn() {}, _onSupabaseSignedOut() {} }; vm.runInNewContext(h.slice(i, j) + '\n;globalThis.__c = _initSupabaseClient();', ctx); return { made, client: ctx.__c }; };
    const a = run({ SLConfig: { browserOnly: true } }, 'https://db.example.test', 'k');
    const b = run({ SLConfig: { browserOnly: false } }, '', '');
    check('2  _initSupabaseClient builds no client in Files only, and none with no database address', a.made === 0 && !a.client && b.made === 0 && !b.client, JSON.stringify({ a: a.made, b: b.made }));
    const ag = mutate('auth_gate.js', rd('auth_gate.js'));
    const ii = ag.indexOf('async function init() {'), hand = ag.indexOf('window.SLLocalStart.run()', ii), sb = ag.indexOf('const sb = getSupabase();', ii);
    check('2  auth_gate.js hands a Files only install to the local start before it asks for a backend client', ii > 0 && hand > ii && sb > hand && /if \(window\.SLConfig && window\.SLConfig\.browserOnly && !window\.__SLAB_CONFIG_FATAL__\) \{/.test(ag.slice(ii, sb)));
}
// ---- 3: index.html -------------------------------------------------------------------------------------------------------
const HTML = rd('index.html');
{
    const at = s => HTML.indexOf(s);
    check('3  local_start.js 1.0 loads right before auth_gate.js 62.80; safety_lab 65.80, helpers 3.69, labs_thread_config 1.3', at('local_start.js?v=1.0') > 0 && /local_start\.js\?v=1\.0" defer><\/script>\s*<script src="auth_gate\.js\?v=62\.80"/.test(HTML) && at('safety_lab.js?v=65.80') > 0 && at('helpers_modules.js?v=3.69') > 0 && at('labs_thread_config.js?v=1.3') > 0);
}
// ---- 4: the name rule ----------------------------------------------------------------------------------------------------
{
    const store = {};
    const w = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }, SLConfig: { browserOnly: true } };
    const ctx = { window: w, globalThis: w, console, Promise, CustomEvent: function () {}, module: undefined };
    w.window = w;
    vm.runInNewContext(mutate('local_start.js', rd('local_start.js')), ctx);
    const L = w.SLLocalStart;
    const bad = ['', ' ', 'A', '<b>x</b>', 'x'.repeat(81)].map(n => L.setProfile(n));
    const good = L.setProfile('  Alex   Morgan ');
    check('4  the name rule refuses empty, one letter, markup and over 80 letters, each in plain words, and keeps a good name tidied', bad.every(r => !r.ok && r.why && !/\u2014/.test(r.why)) && good.ok && good.name === 'Alex Morgan' && JSON.parse(store[L.LS_PROFILE]).name === 'Alex Morgan', JSON.stringify(bad));
}

// ---- 5..10: the browser ------------------------------------------------------------------------------------------------
const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function makeKeyAndLicense() {
    const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await webcrypto.subtle.exportKey('jwk', kp.publicKey);
    const kid = 'test-' + Date.now();
    const now = Date.now();
    const payload = { v: 1, alg: 'ES256', issuer: 'safetylabaero', kid, id: 'SL-LIC-TEST-1', customer: 'Aeolus Test Co', tier: 'pro', seats: 5, features: [], bind: {}, issuedAt: new Date(now - 86400000).toISOString(), notBefore: new Date(now - 86400000).toISOString(), notAfter: new Date(now + 90 * 86400000).toISOString() };
    const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
    const head = b64u(bytes);   // the signature is over the payload's base64url text
    const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, Buffer.from(head, 'utf8'));
    return { key: { kid, alg: 'ES256', kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, blob: head + '.' + b64u(sig) };
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const lic = await makeKeyAndLicense();
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    // the test's own signing key stands in for Safety Lab's (the shipped verifier runs unchanged)
    const keyed = body => body.replace(/var PUBLIC_KEYS = \[[\s\S]*?\];/, 'var PUBLIC_KEYS = [' + JSON.stringify(lic.key) + '];');
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; const base = path.basename(f); if (f.endsWith('.js') && (MUT || base === 'slab_license.js')) { let t = mutate(base, b.toString('utf8')); if (base === 'slab_license.js') t = keyed(t); body = Buffer.from(t); } r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const URL0 = 'http://127.0.0.1:' + srv.address().port + '/index.html';
    const browser = await pw.chromium.launch();
    const watch = (page) => {
        const net = { db: [], made: 0 };
        page.on('request', q => { const u = q.url(); if (/supabase\.co|\/rest\/v1\/|\/auth\/v1\//.test(u)) net.db.push(u); });
        page.on('console', m => { const t = m.text(); if (/^\[fos\] createClient/.test(t)) net.made++; });
        return net;
    };
    const trapClient = () => {
        // count every backend client built, whoever builds it
        let real; Object.defineProperty(window, 'supabase', { configurable: true, get() { return real; }, set(v) { if (v && typeof v.createClient === 'function') { const c = v.createClient.bind(v); v.createClient = function () { console.log('[fos] createClient ' + arguments[0]); return c.apply(null, arguments); }; } real = v; } });
    };
    try {
        // 5..8: Files only, a valid license, a fresh computer
        {
            const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
            await ctx.addInitScript(([blob]) => { window.__SLAB_LOCAL_ONLY__ = true; window.__SLAB_LICENSE__ = blob; }, [lic.blob]);
            await ctx.addInitScript(trapClient);
            const page = await ctx.newPage();
            const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
            const net = watch(page);
            await page.goto(URL0);
            const step = await within(page.waitForFunction(() => window.SLLocalStart && window.SLLocalStart.state() === 'agreement' && document.getElementById('sll-agree-cb'), null, { timeout: 60000 }).then(() => 'agreement'), 65000, 'the agreement screen').catch(e => String(e.message));
            check('5  first start: the agreement comes first, on the local start screen (no sign-in form)', step === 'agreement' && !(await page.$('#sl-auth-gate:not(.sl-local)')), step + ' ' + JSON.stringify(await page.evaluate(() => ({ st: window.SLLocalStart && window.SLLocalStart.state(), lic: window.SLLicense && window.SLLicense.reason, eula: !!window.SL_EULA }))));
            if (step !== 'agreement') throw new Error('the first start did not reach the agreement');
            await page.check('#sll-agree-cb'); await page.click('#sll-agree-go');
            const nameStep = await page.waitForFunction(() => window.SLLocalStart.state() === 'name' && document.getElementById('sll-name'), null, { timeout: 15000 }).then(() => true).catch(() => false);
            await page.screenshot({ path: path.join(process.env.SL_SHOT_DIR || require('os').tmpdir(), 'files_only_name.png') }).catch(() => {});
            await page.fill('#sll-name', 'A'); await page.click('#sll-name-go');
            const err1 = await page.textContent('#sll-name-err').catch(() => '');
            await page.fill('#sll-name', 'Alex Morgan'); await page.click('#sll-name-go');
            const opened = await page.waitForFunction(() => window.SLLocalStart.state() === 'open' && !document.getElementById('sl-auth-gate') && !document.documentElement.classList.contains('sl-auth-gate-blocked'), null, { timeout: 15000 }).then(() => true).catch(() => false);
            check('5  ...then the name, a one-letter name is refused in plain words, and with a real name the app opens', nameStep && /at least two/i.test(err1 || '') && opened, JSON.stringify({ nameStep, err1, opened, state: await page.evaluate(() => window.SLLocalStart.state()) }));
            const who = await page.evaluate(() => ({ who: window.SLAutopilotUI && window.SLAutopilotUI.who(), kept: localStorage.getItem('safetyLab.localProfile'), u: window.__slUser }));
            check('6  ...and the name is who did it (SLAutopilotUI.who) and is kept on this computer', who.who === 'Alex Morgan' && /Alex Morgan/.test(who.kept || '') && who.u && who.u.local === true, JSON.stringify(who));
            await page.waitForTimeout(1500);
            const cli = await page.evaluate(() => ({ c: typeof window.getSupabaseClient === 'function' ? !!window.getSupabaseClient() : false, url: String(window.LABS_THREAD_CONFIG && window.LABS_THREAD_CONFIG.url) }));
            check('7  ...and no backend client was ever built and nothing went to any database address', net.made === 0 && net.db.length === 0 && !cli.c && cli.url === '', JSON.stringify({ made: net.made, db: net.db.slice(0, 3), cli }));
            await page.reload();
            const again = await page.waitForFunction(() => window.SLLocalStart && window.SLLocalStart.state() === 'open' && !document.getElementById('sl-auth-gate'), null, { timeout: 60000 }).then(() => true).catch(() => false);
            const st2 = await page.evaluate(() => ({ s: window.SLLocalStart.state(), who: window.SLAutopilotUI && window.SLAutopilotUI.who() }));
            check('8  the same install reloaded opens straight away, the name is not asked again', again && st2.who === 'Alex Morgan' && net.made === 0 && net.db.length === 0, JSON.stringify(st2));
            check('8  no page errors on the way', errs.length === 0, errs.slice(0, 3).join(' | '));
            await ctx.close();
        }
        // 9: Files only, no license
        {
            const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
            await ctx.addInitScript(() => { window.__SLAB_LOCAL_ONLY__ = true; try { localStorage.setItem('safetyLab.localProfile', JSON.stringify({ name: 'Alex Morgan', at: '2026-11-10' })); } catch (_) {} });
            await ctx.addInitScript(trapClient);
            const page = await ctx.newPage(); const net = watch(page);
            await page.goto(URL0);
            const st = await page.waitForFunction(() => window.SLLocalStart && window.SLLocalStart.state() === 'license', null, { timeout: 60000 }).then(() => true).catch(() => false);
            const r = await page.evaluate(() => ({ blocked: document.documentElement.classList.contains('sl-auth-gate-blocked'), why: (document.querySelector('[data-sll-reason]') || {}).textContent || '', gate: !!document.getElementById('slab-license-gate') }));
            check('9  no license: the app does not open, the screen says why in plain words, the license screen is there to load one', st && r.blocked && /No license has been loaded/.test(r.why) && r.gate && net.made === 0 && net.db.length === 0, JSON.stringify(r));
            await ctx.close();
        }
        // 11: the desktop: the name comes from the computer account, nothing is asked
        {
            const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
            await ctx.addInitScript(([blob]) => { window.__SLAB_LOCAL_ONLY__ = true; window.__SLAB_DESKTOP__ = true; window.__SLAB_LICENSE__ = blob; window.__SLAB_COMPUTER_ACCOUNT__ = Object.freeze({ name: 'Jordan Lee', user: 'jlee' }); }, [lic.blob]);
            await ctx.addInitScript(trapClient);
            const page = await ctx.newPage(); const net = watch(page);
            const seen = []; await page.exposeFunction('__fosStep', s => seen.push(s));
            await page.addInitScript(() => { const t = setInterval(() => { try { const s = window.SLLocalStart && window.SLLocalStart.state(); if (s) window.__fosStep(s); if (s === 'open') clearInterval(t); } catch (_) {} }, 20); });
            await page.goto(URL0);
            const open = await page.waitForFunction(() => window.SLLocalStart && window.SLLocalStart.state() === 'open' && !document.getElementById('sl-auth-gate'), null, { timeout: 60000 }).then(() => true).catch(() => false);
            const r = await page.evaluate(() => ({ who: window.SLAutopilotUI && window.SLAutopilotUI.who(), kept: localStorage.getItem('safetyLab.localProfile') }));
            check('11 the desktop: the name comes from the account the person logged in to the computer with, and nothing is asked', open && r.who === 'Jordan Lee' && !seen.includes('name') && !seen.includes('agreement') && r.kept === null && net.made === 0 && net.db.length === 0, JSON.stringify({ open, r, seen: Array.from(new Set(seen)) }));
            await ctx.close();
        }
        // 10: the hosted demo cloud keeps its sign-in
        {
            const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
            await ctx.route(/supabase\.co/, r => r.abort());
            const page = await ctx.newPage();
            await page.goto(URL0);
            const r = await page.waitForFunction(() => document.getElementById('sl-auth-gate'), null, { timeout: 60000 }).then(() => page.evaluate(() => ({ local: window.SLLocalStart && window.SLLocalStart.active(), cls: document.getElementById('sl-auth-gate').className, st: window.SLLocalStart && window.SLLocalStart.state() }))).catch(e => ({ err: String(e.message) }));
            check('10 the hosted demo cloud: the sign-in is unchanged, the local start stands aside', r.local === false && !/sl-local/.test(r.cls || '') && r.st === '', JSON.stringify(r));
            await ctx.close();
        }
    } catch (e) { check('the browser part ran to the end', false, e && e.stack); }
    await browser.close(); srv.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
