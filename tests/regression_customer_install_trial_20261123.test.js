/* regression_customer_install_trial_20261123.test.js: no personal trial clock on a customer install.
 *
 * Brief, 23 Nov 2026: "the old personal trial clock is running on customer installs". A customer's own-server desktop
 * showed "Trial, 1 day left", a Subscribe button and the EDU tier, while its signed enterprise license was valid. The
 * clock had been started by the local fallback sign-up (Files only on an older build could not build a backend client,
 * so the sign-up fell back to the hosted trial path) and it stayed on that computer.
 * Rules (misc_fn_modules.js slSignedLicenseRules(), helpers_modules.js, safety_lab.js, slab_license.js):
 *   1  isOnTrial / getTrialDaysRemaining / isInGrandfatherWindow say no where the signed license is the authority
 *   2  startTrial is a no-op there, and the fallback sign-up neither offers nor starts a trial or guesses a tier
 *   3  a stored trial clock is cleared when the license verdict comes in
 *   4  the trial banner and the pricing screen never render there; with no valid license only the license screen shows
 *   5  the rule holds before the asynchronous verdict exists (by mode), and the license screen follows every verdict
 * Checks:
 *   S  the rule in a sandbox: hosted demo no, self-hosted / Files only / desktop yes, any authoritative license yes
 *   A  browser, customer install (Files only, then desktop), valid enterprise license verified slowly (2.5 s, so the page
 *      runs before the verdict exists), a stored clock 9 days old, an
 *      early sign-up date: the effective tier is enterprise, no trial before or after the verdict, the clock is gone,
 *      startTrial writes nothing, a clock written later still does not count, no grandfather window, no banner, no
 *      pricing screen even when asked, the fallback sign-up sets no tier and no trial, and a later invalid verdict
 *      brings the license screen (not the pricing screen)
 *   B  browser, the hosted demo cloud, the same stored clock: unchanged (on trial, EDU, banner shows, startTrial writes,
 *      grandfather window in its dates, the pricing screen renders when asked)
 * MUTATION PROOFS (SL_CIT_MUTATE): clock, start, grand, clear, banner, pricing, signup, gatefollow, mode.
 *   Each one must turn this suite red.
 * Run: node tests/regression_customer_install_trial_20261123.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
const { webcrypto } = require('crypto');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_CIT_MUTATE || '';
const rd = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function mutate(file, body) {
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing in ' + file + ': ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'clock' && file === 'misc_fn_modules.js') rep("function getTrialDaysRemaining() {\n    if (slSignedLicenseRules()) return 0;", "function getTrialDaysRemaining() {");
    if (MUT === 'start' && file === 'misc_fn_modules.js') rep("if (slSignedLicenseRules()) return 0;   // no trial clock", "// no trial clock");
    if (MUT === 'grand' && file === 'misc_fn_modules.js') rep("function isInGrandfatherWindow() {\n    if (slSignedLicenseRules()) return false;", "function isInGrandfatherWindow() {");
    if (MUT === 'clear' && file === 'misc_fn_modules.js') { rep("window.addEventListener('slab-license-changed', _slClearTrialUnderLicense);", "0;"); rep("try { _slClearTrialUnderLicense(); } catch (_) {}", ""); rep("_slReady.then(_slClearTrialUnderLicense, function () {});", "0;"); }
    if (MUT === 'mode' && file === 'misc_fn_modules.js') rep("if (m === 'self-hosted' || m === 'browser-only' || m === 'desktop') return true;", "");
    if (MUT === 'banner' && file === 'safety_lab.js') rep("function _renderTrialOrGrandfatherBanner() {\n        if (_licenseRules()) { _clearHostedScreens(); return; }", "function _renderTrialOrGrandfatherBanner() {");
    if (MUT === 'pricing' && file === 'safety_lab.js') { rep("function _renderPaywallScreen() {\n        if (_licenseRules()) { _clearHostedScreens(); return; }", "function _renderPaywallScreen() {"); rep("if (_licenseRules()) { _clearHostedScreens(); return; }   // the license screen", "// the license screen"); }
    if (MUT === 'signup' && file === 'helpers_modules.js') rep("if (typeof slSignedLicenseRules === 'function' && slSignedLicenseRules()) {\n        // 23 Nov 2026: a customer install. The signed license decides the tier", "if (false) {\n        // 23 Nov 2026: a customer install. The signed license decides the tier");
    if (MUT === 'gatefollow' && file === 'slab_license.js') rep("W.addEventListener('slab-license-changed', function () { gateFor(W.SLLicense); });", "0;");
    return body;
}

// ---- S: the rule itself, run for real in a sandbox ------------------------------------------------------------------
{
    const src = mutate('misc_fn_modules.js', rd('misc_fn_modules.js'));
    const i = src.indexOf('function slSignedLicenseRules() {'), j = src.indexOf('function getTrialDaysRemaining() {');
    const rule = (w) => { const ctx = { window: w }; vm.runInNewContext(src.slice(i, j) + '\n;globalThis.__r = slSignedLicenseRules();', ctx); return ctx.__r; };
    const r = {
        hosted: rule({ SLConfig: { mode: 'hosted-demo' } }),
        hostedPlain: rule({}),
        hostedLicensed: rule({ SLConfig: { mode: 'hosted-demo' }, SLLicense: { authoritative: true, valid: true } }),
        own: rule({ SLConfig: { mode: 'self-hosted' } }),
        files: rule({ SLConfig: { mode: 'browser-only' } }),
        desk: rule({ SLConfig: { mode: 'desktop' } }),
    };
    check('S  the rule: the hosted demo keeps its trial; self-hosted, Files only and the desktop never have one (known from the mode, before any verdict); any authoritative license also rules', r.hosted === false && r.hostedPlain === false && r.hostedLicensed === true && r.own && r.files && r.desk, JSON.stringify(r));
    const html = rd('index.html');
    check('S  index.html pins: misc_fn_modules 67.03, helpers 3.76, safety_lab 65.82, slab_license 1.5', /misc_fn_modules\.js\?v=67\.03"/.test(html) && /helpers_modules\.js\?v=3\.76"/.test(html) && /safety_lab\.js\?v=65\.82"/.test(html) && /slab_license\.js\?v=1\.5"/.test(html));
}

// ---- the browser ---------------------------------------------------------------------------------------------------------
const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function makeKeyAndLicense() {
    const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await webcrypto.subtle.exportKey('jwk', kp.publicKey);
    const kid = 'test-' + Date.now(), now = Date.now();
    const payload = { v: 1, alg: 'ES256', issuer: 'safetylabaero', kid, id: 'SL-LIC-TEST-ENT', customer: 'Aeolus Test Co', tier: 'enterprise', seats: 10, features: [], bind: {}, issuedAt: new Date(now - 86400000).toISOString(), notBefore: new Date(now - 86400000).toISOString(), notAfter: new Date(now + 11 * 86400000).toISOString() };
    const head = b64u(Buffer.from(JSON.stringify(payload), 'utf8'));
    const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, Buffer.from(head, 'utf8'));
    return { key: { kid, alg: 'ES256', kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, blob: head + '.' + b64u(sig) };
}
const DAY = 86400000;
// what the customer's computer carried: a trial clock started 9 days ago (1 day left), a sign-up email and date
const seedClock = (started) => {
    try {
        if (sessionStorage.getItem('cit.seeded')) return; sessionStorage.setItem('cit.seeded', '1');
        localStorage.setItem('safetyLab.license.trialStartedAt', String(started));
        localStorage.setItem('safetyLab.license.trialTarget', 'pro-plus');
        localStorage.setItem('safetyLab.signup.email', 'engineer@example.com');
        localStorage.setItem('safetyLab.signup.signupDate', String(Date.parse('2026-05-01T00:00:00Z')));
    } catch (_) {}
};
// every answer the trial predicates give before the license verdict exists (the 22 Oct timing lesson)
const watchEarly = () => {
    window.__citEarly = [];
    try { const S = crypto.subtle, v = S.verify.bind(S); S.verify = async function () { await new Promise(r => setTimeout(r, 2500)); return v.apply(null, arguments); }; } catch (_) {}
    const t = setInterval(() => {
        try {
            if (window.SLLicense) { clearInterval(t); return; }
            if (typeof window.isOnTrial === 'function') window.__citEarly.push(window.isOnTrial() ? 'trial' : 'none');
        } catch (_) {}
    }, 2);
};
// the state the page shows, plus the answers it gives when asked directly
async function probe(page) {
    return page.evaluate(async () => {
        const out = {};
        const LS = k => localStorage.getItem(k);
        out.mode = window.SLConfig && window.SLConfig.mode;
        out.lic = window.SLLicense ? { valid: window.SLLicense.valid, auth: window.SLLicense.authoritative, tier: window.SLLicense.tier } : null;
        out.tier = getEffectiveTier();
        out.onTrial = isOnTrial(); out.days = getTrialDaysRemaining();
        out.clock = [LS('safetyLab.license.trialStartedAt'), LS('safetyLab.license.trialTarget')];
        out.early = (window.__citEarly || []).slice();
        out.banner = !!document.getElementById('sl-paywall-banner');
        out.pricing = !!document.getElementById('sl-paywall-screen');
        // a clock written later by any old path still must not count
        localStorage.setItem('safetyLab.license.trialStartedAt', String(Date.now() - 2 * 86400000));
        out.lateTrial = isOnTrial(); out.lateTier = getEffectiveTier();
        // the grandfather window, asked inside its dates (June 2026) with the early sign-up date
        const realNow = Date.now; Date.now = () => Date.parse('2026-06-05T00:00:00Z');
        try { out.grand = isInGrandfatherWindow(); } finally { Date.now = realNow; }
        endTrial();
        // startTrial on a fresh computer
        out.startRet = startTrial('pro-plus');
        out.startWrote = [LS('safetyLab.license.trialStartedAt'), LS('safetyLab.license.trialTarget')];
        // the banner and the pricing screen, asked for even if a trial predicate said yes
        const keep = { o: window.isOnTrial, d: window.getTrialDaysRemaining, p: window.isPaywalled };
        window.isOnTrial = () => true; window.getTrialDaysRemaining = () => 1; window.isPaywalled = () => false;
        try { window.SafetyLab._renderTrialBanner(); } catch (e) { out.bannerErr = String(e.message); }
        out.bannerAsked = !!document.getElementById('sl-paywall-banner');
        out.bannerText = (document.getElementById('sl-paywall-banner') || {}).textContent || '';
        window.isPaywalled = () => true;
        try { window.SafetyLab._renderPaywall(); } catch (e) { out.pricingErr = String(e.message); }
        out.pricingAsked = !!document.getElementById('sl-paywall-screen');
        ['sl-paywall-screen'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
        try { window.SafetyLab._recheckPaywall(); } catch (_) {}
        out.pricingRecheck = !!document.getElementById('sl-paywall-screen');
        window.isOnTrial = keep.o; window.getTrialDaysRemaining = keep.d; window.isPaywalled = keep.p;
        ['sl-paywall-screen', 'sl-paywall-banner'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
        endTrial();
        return out;
    });
}
async function fallbackSignup(page) {
    return page.evaluate(async () => {
        endTrial(); localStorage.removeItem('safetyLab.license.tier');
        const em = document.getElementById('signup-email'); em.value = 'engineer@example.com';
        try { onSignupEmailChange(); } catch (_) {}
        const picker = document.getElementById('signup-tier-picker');
        const offered = !!(picker && picker.style.display !== 'none' && picker.offsetParent !== null);
        const client = (typeof _initSupabaseClient === 'function') ? !!_initSupabaseClient() : null;
        try { await submitSignup(); } catch (e) { return { err: String(e.message) }; }
        return { client, offered, tierKey: localStorage.getItem('safetyLab.license.tier'), clock: localStorage.getItem('safetyLab.license.trialStartedAt'), tier: getEffectiveTier() };
    });
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
    const keyed = body => body.replace(/var PUBLIC_KEYS = \[[\s\S]*?\];/, 'var PUBLIC_KEYS = [' + JSON.stringify(lic.key) + '];');
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; const base = path.basename(f); if (f.endsWith('.js') && (MUT || base === 'slab_license.js')) { let t = mutate(base, b.toString('utf8')); if (base === 'slab_license.js') t = keyed(t); body = Buffer.from(t); } r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const URL0 = 'http://127.0.0.1:' + srv.address().port + '/index.html';
    const browser = await pw.chromium.launch();
    const started = Date.now() - 9 * DAY;
    try {
        // A: customer installs, a valid enterprise license
        for (const kind of ['files', 'desktop']) {
            const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
            await ctx.route(/supabase\.co/, r => r.abort());
            await ctx.addInitScript(([blob, desk]) => {
                window.__SLAB_LOCAL_ONLY__ = true; window.__SLAB_LICENSE__ = blob;
                if (desk) { window.__SLAB_DESKTOP__ = true; window.__SLAB_COMPUTER_ACCOUNT__ = Object.freeze({ name: 'Jordan Lee', user: 'jlee' }); }
                try { localStorage.setItem('safetyLab.localProfile', JSON.stringify({ name: 'Alex Morgan', at: '2026-11-23' })); localStorage.setItem('safetyLab.eula.acceptedVersion', 'SL-EULA-0004-A'); } catch (_) {}
            }, [lic.blob, kind === 'desktop']);
            await ctx.addInitScript(seedClock, started);
            await ctx.addInitScript(watchEarly);
            const page = await ctx.newPage();
            const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
            await page.goto(URL0);
            const ok = await within(page.waitForFunction(() => window.SLLicense && window.SLLicense.valid && window.SLLocalStart && window.SLLocalStart.state() === 'open' && typeof getEffectiveTier === 'function', null, { timeout: 60000 }).then(() => true), 65000, 'the app opening').catch(e => String(e.message));
            if (ok !== true) { check('A  ' + kind + ': the app opened with the license', false, ok + ' ' + JSON.stringify(await page.evaluate(() => ({ st: window.SLLocalStart && window.SLLocalStart.state(), lic: window.SLLicense }))).catch(() => '')); await ctx.close(); continue; }
            await page.waitForTimeout(1200);   // the page's own paywall check runs after load
            const r = await probe(page);
            const L = kind === 'files' ? 'A  Files only' : 'A  desktop  ';
            check(L + ': the effective tier is the license\'s (enterprise), not EDU', r.tier === 'enterprise' && r.lic && r.lic.tier === 'enterprise', JSON.stringify({ tier: r.tier, lic: r.lic, mode: r.mode }));
            check(L + ': no trial, before the license verdict existed (by mode) and after it', r.onTrial === false && r.days === 0 && r.early.length > 0 && r.early.every(x => x === 'none'), JSON.stringify({ onTrial: r.onTrial, days: r.days, early: Array.from(new Set(r.early)), n: r.early.length }));
            check(L + ': the stored trial clock was cleared when the verdict came in', r.clock[0] === null && r.clock[1] === null, JSON.stringify(r.clock));
            check(L + ': a trial clock written later still does not count', r.lateTrial === false && r.lateTier === 'enterprise', JSON.stringify({ lateTrial: r.lateTrial, lateTier: r.lateTier }));
            check(L + ': no grandfather window, even inside its dates with an early sign-up date', r.grand === false, JSON.stringify({ grand: r.grand }));
            check(L + ': startTrial is a no-op (returns 0, writes nothing)', r.startRet === 0 && r.startWrote[0] === null && r.startWrote[1] === null, JSON.stringify({ ret: r.startRet, wrote: r.startWrote }));
            check(L + ': no banner and no pricing screen after load', !r.banner && !r.pricing, JSON.stringify({ banner: r.banner, pricing: r.pricing }));
            check(L + ': the trial banner does not render even when a trial predicate says yes', !r.bannerAsked && !r.bannerErr, JSON.stringify({ bannerAsked: r.bannerAsked, text: r.bannerText, err: r.bannerErr }));
            check(L + ': the pricing screen does not render when asked, nor on a paywall re-check', !r.pricingAsked && !r.pricingRecheck && !r.pricingErr, JSON.stringify({ asked: r.pricingAsked, recheck: r.pricingRecheck, err: r.pricingErr }));
            if (kind === 'files') {
                const s = await fallbackSignup(page);
                check(L + ': the fallback sign-up (no backend client) offers no tier choice, sets no tier and starts no trial', s.client === false && s.offered === false && s.tierKey === null && s.clock === null && s.tier === 'enterprise', JSON.stringify(s));
            }
            // a later verdict that is not valid (expired, revoked): the license screen comes up, never the pricing screen
            const g = await page.evaluate(async () => {
                window.SLLicense = Object.assign({}, window.SLLicense, { valid: false, authoritative: true, reason: 'expired', tier: null });
                window.dispatchEvent(new Event('slab-license-changed'));
                try { window.SafetyLab._recheckPaywall(); } catch (_) {}
                await new Promise(r => setTimeout(r, 300));
                return { gate: !!document.getElementById('slab-license-gate'), pricing: !!document.getElementById('sl-paywall-screen'), banner: !!document.getElementById('sl-paywall-banner'), tier: getEffectiveTier() };
            });
            check(L + ': a later invalid verdict brings the license screen, not the pricing screen or a banner', g.gate && !g.pricing && !g.banner && g.tier === 'unpaid', JSON.stringify(g));
            check(L + ': no page errors on the way', errs.length === 0, errs.slice(0, 3).join(' | '));
            await ctx.close();
        }
        // B: the hosted demo cloud, the same stored clock: unchanged
        {
            const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
            await ctx.route(/supabase\.co/, r => r.abort());
            await ctx.addInitScript(seedClock, started);
            const page = await ctx.newPage();
            await page.goto(URL0);
            const ok = await within(page.waitForFunction(() => typeof getEffectiveTier === 'function' && window.SafetyLab && window.SafetyLab._renderTrialBanner && document.readyState === 'complete', null, { timeout: 60000 }).then(() => true), 65000, 'the hosted page').catch(e => String(e.message));
            if (ok !== true) check('B  the hosted page loaded', false, ok);
            else {
                await page.waitForTimeout(1200);
                const h = await page.evaluate(() => {
                    const out = { mode: window.SLConfig && window.SLConfig.mode, lic: !!(window.SLLicense && window.SLLicense.authoritative) };
                    out.onTrial = isOnTrial(); out.days = getTrialDaysRemaining(); out.tier = getEffectiveTier();
                    out.clock = localStorage.getItem('safetyLab.license.trialStartedAt');
                    document.querySelectorAll('#sl-paywall-banner').forEach(e => e.remove());
                    window.SafetyLab._renderTrialBanner();
                    out.banner = (document.getElementById('sl-paywall-banner') || {}).textContent || '';
                    const realNow = Date.now; Date.now = () => Date.parse('2026-06-05T00:00:00Z');
                    try { out.grand = isInGrandfatherWindow(); } finally { Date.now = realNow; }
                    endTrial(); out.startRet = startTrial('pro-plus'); out.startWrote = localStorage.getItem('safetyLab.license.trialTarget');
                    const keep = window.isPaywalled; window.isPaywalled = () => true;
                    window.SafetyLab._renderPaywall(); out.pricing = !!document.getElementById('sl-paywall-screen');
                    window.isPaywalled = keep;
                    return out;
                });
                check('B  hosted demo: the stored clock still counts (on trial, 1 day left, EDU) and is not cleared', h.mode === 'hosted-demo' && !h.lic && h.onTrial === true && h.days === 1 && h.tier === 'edu' && h.clock === String(started), JSON.stringify(h));
                check('B  hosted demo: the trial banner shows "Trial, 1 day left"', /Trial/.test(h.banner) && /1 day left/.test(h.banner), JSON.stringify({ banner: h.banner }));
                check('B  hosted demo: the grandfather window works in its dates; startTrial writes a 10-day clock; the pricing screen renders when paywalled', h.grand === true && h.startRet === 10 && h.startWrote === 'pro-plus' && h.pricing === true, JSON.stringify({ grand: h.grand, startRet: h.startRet, wrote: h.startWrote, pricing: h.pricing }));
            }
            await ctx.close();
        }
    } catch (e) { check('the browser part ran to the end', false, e && e.stack); }
    await browser.close(); srv.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
