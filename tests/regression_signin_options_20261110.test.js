/* regression_signin_options_20261110.test.js: the sign-in screen on a customer's own server.
 *
 * Waqas's brief, 10 Nov 2026: "The customer server sign-in screen shows hosted text ('Start a 10-day trial. No credit
 * card required', 'Sign in with Microsoft' when not set up). On a self-hosted install it should say accounts come from
 * the administrator, drop the trial wording, and show Microsoft sign-in only when that server has it configured."
 * Rebuild: signin_options.js (SLSignInOptions) decides what the screen offers and says; auth_gate.js and ms_sso.js read it.
 *   1  the rule: our hosted service keeps its switch, its trial wording and Create account
 *   2  the rule: a customer's own server offers no Create account and no trial wording, says accounts come from the
 *      administrator, and hides Microsoft sign-in until the server says it is turned on
 *   3  the rule: the server is asked once; it says on, off, or cannot be reached (then hidden)
 *   4  the code: auth_gate.js and ms_sso.js both follow SLSignInOptions; the wrong-password words come from it
 *   5  index.html: signin_options.js 1.0 loads right before local_start.js; auth_gate 62.80, ms_sso 1.2
 *   6  browser, own server without Microsoft sign-in: the screen as asked, no button, no trial words, no Create account
 *   7  browser, own server with Microsoft sign-in: the button appears once the server answers, what was typed is kept
 *   8  browser, own server: asking for Create account still shows Sign in
 *   9  browser, our hosted service: unchanged (Create account, trial words, the Microsoft button)
 * MUTATION PROOFS (SL_SIO_MUTATE): trustswitch (a customer server shows the button by the hosted switch), trialtext (a
 *   customer server gets the hosted words), signupopen (Create account offered on a customer server), noredraw (the
 *   screen is not redrawn when the server answers), msignores (ms_sso.js ignores SLSignInOptions). Each turns it red.
 * Run: node tests/regression_signin_options_20261110.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_SIO_MUTATE || '';
const rd = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function mutate(file, body) {
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing in ' + file + ': ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'trustswitch' && file === 'signin_options.js') rep("if (ownServer()) return _ms === true;", "");
    if (MUT === 'trialtext' && file === 'signin_options.js') rep("return ownServer() ? OWN_TEXT : HOSTED_TEXT;", "return HOSTED_TEXT;");
    if (MUT === 'signupopen' && file === 'signin_options.js') rep("function signup() { var c = cfg(); return !ownServer() && !(c && c.browserOnly); }", "function signup() { return true; }");
    if (MUT === 'noredraw' && file === 'auth_gate.js') rep("window.addEventListener('slab-signin-options', function () {", "window.addEventListener('slab-signin-options-never', function () {");
    if (MUT === 'msignores' && file === 'ms_sso.js') rep("return window.SLSignInOptions ? window.SLSignInOptions.microsoft() === true : window.SL_MS_SSO_ENABLED === true;", "return window.SL_MS_SSO_ENABLED === true;");
    return body;
}
const TRIAL = /trial|credit card/i;
function load(win) {
    const w = Object.assign({ dispatchEvent() {} }, win); w.window = w;
    const ctx = { window: w, globalThis: w, console, Promise, Event: function (t) { this.type = t; }, module: undefined };
    vm.runInNewContext(mutate('signin_options.js', rd('signin_options.js')), ctx);
    return w.SLSignInOptions;
}
(async function () {
    {
        const H = load({ SLConfig: { mode: 'hosted-demo', supabaseUrl: 'https://x.supabase.co' }, SL_MS_SSO_ENABLED: true });
        const H2 = load({ SLConfig: { mode: 'hosted-demo' }, SL_MS_SSO_ENABLED: false });
        check('1  our hosted service: the switch decides the Microsoft button, Create account is offered, the trial words stay', H.microsoft() === true && H2.microsoft() === false && H.signup() === true && TRIAL.test(H.text().signupSub) && !H.ownServer());
    }
    let fetched = 0;
    const own = answer => load({ SLConfig: { mode: 'self-hosted', supabaseUrl: 'https://db.example.test/', supabaseKey: 'k' }, SL_MS_SSO_ENABLED: true,
        fetch: async (u, o) => { fetched++; if (answer === 'down') throw new Error('offline'); if (!/^https:\/\/db\.example\.test\/auth\/v1\/settings$/.test(u) || o.headers.apikey !== 'k') return { ok: false }; return { ok: true, json: async () => ({ external: { azure: answer === 'on', email: true } }) }; } });
    {
        fetched = 0;
        const O = own('on');
        const before = O.microsoft();
        const T = O.text(), all = Object.values(T).join(' ');
        check('2  a customer server: no Create account, no trial words, accounts come from the administrator, no Microsoft button before the server answers', O.ownServer() && O.signup() === false && !TRIAL.test(all) && /administrator/.test(T.accountsFrom) && /administrator/.test(T.wrongPassword) && before === false, JSON.stringify({ before, T }));
        await O.probe(); await O.probe();
        const on = O.microsoft();
        const Off = own('off'); await Off.probe();
        const Dn = own('down'); await Dn.probe();
        check('3  the server is asked once (its public sign-in settings); on shows the button, off and unreachable hide it', on === true && Off.microsoft() === false && Dn.microsoft() === false && fetched === 3, JSON.stringify({ on, off: Off.microsoft(), down: Dn.microsoft(), fetched }));
        const F = load({ SLConfig: { mode: 'browser-only', browserOnly: true }, SL_MS_SSO_ENABLED: true });
        check('3  Files only: no Microsoft button and no Create account (it has no sign-in at all)', F.microsoft() === false && F.signup() === false);
    }
    {
        const ag = mutate('auth_gate.js', rd('auth_gate.js')), ms = mutate('ms_sso.js', rd('ms_sso.js'));
        const fp = ag.slice(ag.indexOf('function formPaneHTML() {'), ag.indexOf('// Inactivity timeout'));
        check('4  auth_gate.js takes the screen words, Create account and the Microsoft button from SLSignInOptions; ms_sso.js follows it too', /try \{ if \(!_opt\(\)\.microsoft\(\)\) return ''; \}/.test(ag) && !/Start a 10-day trial/.test(fp) && /T\.signupSub : T\.signinSub/.test(fp) && /\? _opt\(\)\.text\(\)\.wrongPassword/.test(ag) && /window\.SLSignInOptions\.microsoft\(\) === true/.test(ms));
        const HTML = rd('index.html');
        check('5  signin_options.js 1.0 loads right before local_start.js and auth_gate.js 62.80; ms_sso.js 1.2', /signin_options\.js\?v=1\.0" defer><\/script>\s*<script src="local_start\.js\?v=1\.0" defer><\/script>\s*<script src="auth_gate\.js\?v=62\.80"/.test(HTML) && HTML.indexOf('ms_sso.js?v=1.2') > 0);
    }

    // ---- the browser -----------------------------------------------------------------------------------------------------
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    let azure = false, settingsHits = 0, holdSettings = null;
    const srv = await new Promise(res => { const s = http.createServer((q, r) => {
        let p = decodeURIComponent(q.url.split('?')[0]);
        if (p.startsWith('/db/')) {   // the customer's own server
            r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('Access-Control-Allow-Headers', '*');
            if (q.method === 'OPTIONS') { r.writeHead(204); return r.end(); }
            if (p === '/db/auth/v1/settings') { settingsHits++; const send = () => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ external: { azure: azure, email: true }, disable_signup: true })); }; if (holdSettings) holdSettings.push(send); else send(); return; }
            r.writeHead(404, { 'Content-Type': 'application/json' }); return r.end('{}');
        }
        if (p.endsWith('/')) p += 'index.html';
        const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
        fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(body); });
    }).listen(0, '127.0.0.1', () => res(s)); });
    const ORIGIN = 'http://127.0.0.1:' + srv.address().port, URL0 = ORIGIN + '/index.html';
    const browser = await pw.chromium.launch();
    const gateState = page => page.evaluate(() => { const g = document.getElementById('sl-auth-gate'); return g ? { text: g.innerText, ms: !!g.querySelector('#sl-ms-sso'), tabs: !!g.querySelector('.sl-form-tabs'), create: /Create account/.test(g.innerText), from: !!g.querySelector('[data-sl-accounts-from]'), email: (g.querySelector('#sl-email') || {}).value || '' } : null; });
    const ownCtx = async () => { const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } }); await ctx.addInitScript(([o]) => { window.__SLAB_SUPABASE_URL__ = o + '/db'; window.__SLAB_SUPABASE_KEY__ = 'test-key'; window.__SLAB_AI_OFF__ = true; }, [ORIGIN]); return ctx; };
    try {
        {
            azure = false; settingsHits = 0;
            const ctx = await ownCtx(); const page = await ctx.newPage();
            await page.goto(URL0);
            await page.waitForFunction(() => document.querySelector('#sl-auth-gate #sl-email'), null, { timeout: 60000 });
            await page.waitForTimeout(1200);
            await page.evaluate(() => { const l = document.getElementById('slab-license-gate'); if (l) l.style.display = 'none'; });
            const g = await gateState(page);
            await page.screenshot({ path: path.join(process.env.SL_SHOT_DIR || require('os').tmpdir(), 'signin_own_server.png') }).catch(() => {});
            check('6  own server without Microsoft sign-in: accounts come from the administrator, no trial words, no Create account, no Microsoft button', g && g.from && /administrator/.test(g.text) && !TRIAL.test(g.text) && !g.create && !g.tabs && !g.ms && settingsHits >= 1, JSON.stringify(Object.assign({}, g, { text: g && g.text.slice(0, 400), settingsHits })));
            await page.evaluate(() => window.SafetyLab._authSetMode('signup'));
            const g2 = await gateState(page);
            check('8  asking for Create account on an own server still shows Sign in', g2 && !g2.create && /Sign in/.test(g2.text) && !TRIAL.test(g2.text), g2 && g2.text.slice(0, 300));
            await ctx.close();
        }
        {
            azure = true; holdSettings = [];
            const ctx = await ownCtx(); const page = await ctx.newPage();
            await page.goto(URL0);
            await page.waitForFunction(() => document.querySelector('#sl-auth-gate #sl-email'), null, { timeout: 60000 });
            const g0 = await gateState(page);
            await page.fill('#sl-auth-gate #sl-email', 'engineer@example.test');
            const waiting = holdSettings; holdSettings = null; waiting.forEach(f => f());
            const shown = await page.waitForFunction(() => !!document.querySelector('#sl-auth-gate #sl-ms-sso'), null, { timeout: 10000 }).then(() => true).catch(() => false);
            const g1 = await gateState(page);
            check('7  own server with Microsoft sign-in: the button appears once the server answers, and the email typed is kept', g0 && !g0.ms && shown && g1.email === 'engineer@example.test' && !TRIAL.test(g1.text), JSON.stringify({ before: g0 && g0.ms, shown, email: g1 && g1.email }));
            await ctx.close();
        }
        {
            const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
            await ctx.route(/supabase\.co/, r => r.abort());
            const page = await ctx.newPage();
            await page.goto(URL0);
            await page.waitForFunction(() => document.querySelector('#sl-auth-gate #sl-email'), null, { timeout: 60000 });
            const g = await gateState(page);
            await page.evaluate(() => window.SafetyLab._authSetMode('signup'));
            const s = await gateState(page);
            check('9  our hosted service is unchanged: Create account, the trial words, the Microsoft button', g && g.tabs && g.ms && !g.from && s && /10-day trial/.test(s.text), JSON.stringify({ tabs: g && g.tabs, ms: g && g.ms, from: g && g.from, trial: s && /10-day trial/.test(s.text) }));
            await ctx.close();
        }
    } catch (e) { check('the browser part ran to the end', false, e && e.stack); }
    await browser.close(); srv.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
