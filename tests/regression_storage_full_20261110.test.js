/* regression_storage_full_20261110.test.js: a full browser storage never stops a sign-in or an autosave.
 *
 * Waqas's brief, 10 Nov 2026: "Sign-in fails with 'exceeded the quota' when browser storage is full. The sign-in token
 * write must never fail (free caches first, recover and retry), and no raw setItem error may reach the user. Move large
 * data to IndexedDB with a one-time migration that loses nothing: autosaves (safetyLab.autosave.v1 and
 * safetyLab.autosave.lastgood.v1), slab.r4.export, slab.golden.run1.backup, slab.campaign.v1, slab.r4.fha.draft, the
 * _ev items, and the local co-editing docs. localStorage keeps only small settings. A test fills storage to the limit
 * and proves sign-in and autosave still work."
 * Rebuild: local_store.js (SLLocalStore); helpers_modules.js keeps the project in IndexedDB only and gives the backend
 * client SLLocalStore.authStorage for its token; auth_gate.js never shows a raw storage error; tab_guard.js reads the
 * newer autosave from IndexedDB.
 *   1  index.html: local_store.js 1.0 loads right after slab_config.js; helpers 3.70, tab_guard 1.4, auth_gate 62.80
 *   2  the first load moves every large item out of localStorage, byte for byte, and keeps the small settings
 *   3  ...the migration is marked done, and a moved autosave becomes the current IndexedDB copy when there is none
 *   4  an older localStorage autosave never replaces a newer IndexedDB one, and is still kept as it was
 *   5  storage filled to the limit: the sign-in token is kept and read back (AI cache freed, large items moved)
 *   6  storage filled to the limit with nothing that can move: the token is still kept, and read back after a reload
 *   7  the real sign-in with storage full: it signs in, the token is stored, no error is shown
 *   8  a storage error during sign-in is shown in plain words, never the raw "exceeded the quota"
 *   9  autosave with storage full: the project is saved to IndexedDB and the save reports success
 *   10 an autosave puts no project in localStorage (only the small meta)
 * MUTATION PROOFS (SL_LSF_MUTATE): nomigrate (nothing moves), lossy (the moved copy is not kept), clobber (an older
 *   autosave replaces a newer one), nofallback (the token is lost when storage stays full), noauthstore (the backend
 *   client keeps its token in plain localStorage), rawerror (the raw storage error reaches the person), mirror (the
 *   whole project is written to localStorage again). Each one must turn this suite red.
 * Run: node tests/regression_storage_full_20261110.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_LSF_MUTATE || '';
function mutate(file, body) {
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing in ' + file + ': ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'nomigrate' && file === 'local_store.js') rep("var big = keys().filter(isBig);", "var big = [];");
    if (MUT === 'lossy' && file === 'local_store.js') { rep("await idbSet(MOVED + k, v);\n    var back = await idbGet(MOVED + k);\n    if (back !== v) return false;", ""); rep("if (!have || metaTs(lsMeta) > metaTs(haveMeta)) {", "if (false) {"); }
    if (MUT === 'clobber' && file === 'local_store.js') rep("if (!have || metaTs(lsMeta) > metaTs(haveMeta)) {", "if (true) {");
    if (MUT === 'nofallback' && file === 'local_store.js') { rep("_mem[k] = v;                                                // the token", "// the token"); rep("try { if (idbOk()) await idbSet(AUTH_IDB + k, v); } catch (_) {}   // still full", "// still full"); }
    if (MUT === 'noauthstore' && file === 'helpers_modules.js') rep("storage: (window.SLLocalStore && window.SLLocalStore.authStorage) || undefined,", "");
    if (MUT === 'rawerror' && file === 'auth_gate.js') rep("if ((window.SLLocalStore && window.SLLocalStore.isQuota(err)) || /quota/i.test(msg)) {", "if (false) {");
    if (MUT === 'mirror' && file === 'helpers_modules.js') rep("if (!idbAvail) lsOk = _lsSet(AUTOSAVE_KEY, payload);", "lsOk = _lsSet(AUTOSAVE_KEY, payload);");
    return body;
}
{
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('1  local_store.js 1.0 loads right after slab_config.js; helpers 3.70, tab_guard 1.4, auth_gate 62.80', /slab_config\.js\?v=1\.5" defer><\/script>\s*<!--[^>]*-->\s*<script src="local_store\.js\?v=1\.0" defer>/.test(HTML) && HTML.indexOf('helpers_modules.js?v=3.70') > 0 && HTML.indexOf('tab_guard.js?v=1.4') > 0 && HTML.indexOf('auth_gate.js?v=62.80') > 0);
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:kestrel');
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const URL0 = 'http://127.0.0.1:' + srv.address().port + '/index.html';
    const browser = await pw.chromium.launch();
    // the hosted demo's database, answered here: a password sign-in returns a session with a large token
    const fakeDb = async (ctx, log) => ctx.route(/fhrqkhdrwbfnizkepkch\.supabase\.co/, async (route) => {
        const u = route.request().url(); log.push(u);
        if (/\/auth\/v1\/token\?grant_type=password/.test(u)) {
            const now = Math.floor(Date.now() / 1000);
            const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'engineer@example.test', app_metadata: {}, user_metadata: { full_name: 'Test Engineer', pad: 'x'.repeat(20000) }, created_at: new Date().toISOString() };
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'a.' + 'b'.repeat(4000) + '.c', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r' + Date.now(), user }) });
        }
        if (/\/auth\/v1\/user/.test(u)) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"no"}' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const boot = async (page) => { await page.goto(URL0); await page.waitForFunction(() => window.SLLocalStore && typeof _applyProjectData === 'function' && typeof SLDB !== 'undefined', null, { timeout: 60000 }); };
    // fill localStorage to the limit; movable says whether the filler is a large item that can move out
    const FILL = (o) => {
        const chunk = 'z'.repeat(256 * 1024); let i = 0, n = 0;
        if (o.caches) { try { for (let c = 0; c < 6; c++) { localStorage.setItem('slai.cache.t' + c, chunk.slice(0, 64 * 1024)); } } catch (_) {} }
        if (o.movable) { try { localStorage.setItem('slab.r4.export', chunk + chunk + chunk + chunk); } catch (_) {} }
        let size = chunk.length;
        for (;;) { try { localStorage.setItem('filler.' + (i++), chunk.slice(0, size)); n++; } catch (_) { size = Math.floor(size / 2); if (size < 16) break; } }
        let full = false; try { localStorage.setItem('probe', 'x'.repeat(64)); localStorage.removeItem('probe'); } catch (_) { full = true; }
        return { n, full };
    };
    try {
        // 2..4: the migration
        {
            const ctx = await browser.newContext(); const log = []; await fakeDb(ctx, log);
            const seed = { auto: JSON.stringify(Object.assign({ marker: 'ls-autosave' }, demo.data)), good: JSON.stringify({ marker: 'lastgood', rows: [1, 2, 3] }), exp: 'E'.repeat(300000), gold: '{"golden":"' + 'g'.repeat(1000) + '"}', camp: '{"runs":[{"tag":"a"}]}', draft: '{"draft":1}', ev1: 'ev-one', ev2: 'ev-two', crdt: 'crdt-doc' };
            await ctx.addInitScript((S) => {
                if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
                localStorage.setItem('safetyLab.autosave.v1', S.auto); localStorage.setItem('safetyLab.autosave.meta.v1', JSON.stringify({ ts: Date.now() - 1000, size: S.auto.length }));
                localStorage.setItem('safetyLab.autosave.lastgood.v1', S.good); localStorage.setItem('safetyLab.autosave.lastgood.meta.v1', JSON.stringify({ ts: Date.now() - 5000 }));
                localStorage.setItem('slab.r4.export', S.exp); localStorage.setItem('slab.golden.run1.backup', S.gold); localStorage.setItem('slab.campaign.v1', S.camp); localStorage.setItem('slab.r4.fha.draft', S.draft);
                localStorage.setItem('hf_run3_ev', S.ev1); localStorage.setItem('fha_ev.2', S.ev2); localStorage.setItem('slab-crdt-p1', S.crdt);
                localStorage.setItem('safetyLab.theme', 'light'); localStorage.setItem('safetyLab.ai.enabled', '1');
            }, seed);
            const page = await ctx.newPage();
            await boot(page);
            await page.waitForFunction(() => !!localStorage.getItem('safetyLab.store.migrated.v1'), null, { timeout: 20000 }).catch(() => {});
            const r = await page.evaluate(async (S) => {
                const L = window.SLLocalStore, g = k => L._idbGet(k);
                const big = ['safetyLab.autosave.v1', 'safetyLab.autosave.lastgood.v1', 'slab.r4.export', 'slab.golden.run1.backup', 'slab.campaign.v1', 'slab.r4.fha.draft', 'hf_run3_ev', 'fha_ev.2', 'slab-crdt-p1'];
                const want = [S.auto, S.good, S.exp, S.gold, S.camp, S.draft, S.ev1, S.ev2, S.crdt];
                const inLs = big.filter(k => localStorage.getItem(k) != null);
                const same = []; for (let i = 0; i < big.length; i++) same.push((await g(L.MOVED + big[i])) === want[i]);
                return { inLs, same, theme: localStorage.getItem('safetyLab.theme'), ai: localStorage.getItem('safetyLab.ai.enabled'), done: !!localStorage.getItem(L.LS_DONE), primary: (await g('safetyLab.autosave.v1')) === S.auto, lgPrimary: (await g('safetyLab.autosave.lastgood.v1')) === S.good };
            }, seed);
            const r3 = await page.evaluate(async (S) => {
                _autosaveSuspended = true;   // the app's own autosave stays out of the way of this check
                const L = window.SLLocalStore;
                await SLDB.del('safetyLab.autosave.v1'); await SLDB.del('safetyLab.autosave.meta.v1');
                localStorage.setItem('safetyLab.autosave.v1', S.auto); localStorage.setItem('safetyLab.autosave.meta.v1', JSON.stringify({ ts: Date.now() - 1000 }));
                await L.migrate();
                return { primary: (await L._idbGet('safetyLab.autosave.v1')) === S.auto, meta: !!(await L._idbGet('safetyLab.autosave.meta.v1')), inLs: localStorage.getItem('safetyLab.autosave.v1') };
            }, seed);
            r.primary = r3.primary && r3.meta && r3.inLs === null;
            check('2  the first load moves every large item out of localStorage, byte for byte, and keeps the small settings', r.inLs.length === 0 && r.same.every(Boolean) && r.theme === 'light' && r.ai === '1', JSON.stringify(r));
            check('3  ...the migration is marked done, and a moved autosave becomes the current IndexedDB copy when there is none', r.primary && r.done, JSON.stringify(r));
            const r4 = await page.evaluate(async () => {
                const L = window.SLLocalStore; _autosaveSuspended = true;
                await SLDB.set('safetyLab.autosave.v1', '{"marker":"idb-newer"}'); await SLDB.set('safetyLab.autosave.meta.v1', { ts: Date.now() });
                localStorage.setItem('safetyLab.autosave.v1', '{"marker":"ls-older"}'); localStorage.setItem('safetyLab.autosave.meta.v1', JSON.stringify({ ts: Date.now() - 3600e3 }));
                const out = await L.migrate();
                return { primary: await L._idbGet('safetyLab.autosave.v1'), kept: await L._idbGet(L.MOVED + 'safetyLab.autosave.v1'), inLs: localStorage.getItem('safetyLab.autosave.v1'), moved: out.moved };
            });
            check('4  an older localStorage autosave never replaces a newer IndexedDB one, and is still kept as it was', r4.primary === '{"marker":"idb-newer"}' && r4.kept === '{"marker":"ls-older"}' && r4.inLs === null, JSON.stringify(r4));
            await ctx.close();
        }
        // 5, 7, 9, 10: storage full with large items that can move
        {
            const ctx = await browser.newContext(); const log = []; await fakeDb(ctx, log);
            const page = await ctx.newPage();
            const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
            await boot(page);
            await page.waitForFunction(() => document.querySelector('#sl-auth-gate #sl-email'), null, { timeout: 60000 });
            const f = await page.evaluate(FILL, { movable: true });
            const r5 = await page.evaluate(async () => {
                const A = window.SLLocalStore.authStorage, tok = JSON.stringify({ access_token: 'x'.repeat(30000) });
                let threw = null; try { await A.setItem('sb-test-auth-token', tok); } catch (e) { threw = String(e && e.message); }
                const back = await A.getItem('sb-test-auth-token');
                return { threw, back: back === tok, inLs: localStorage.getItem('sb-test-auth-token') === tok, cache: Object.keys(localStorage).filter(k => k.indexOf('slai.cache.') === 0).length, exp: localStorage.getItem('slab.r4.export') != null };
            });
            check('5  storage filled to the limit with a large item: it moves to IndexedDB and the sign-in token is kept and read back', f.full && !r5.threw && r5.back && r5.inLs && !r5.exp, JSON.stringify({ f, r5 }));
            await page.evaluate(() => { Object.keys(localStorage).filter(k => /^filler\./.test(k)).forEach(k => localStorage.removeItem(k)); });
            const f5 = await page.evaluate(FILL, { caches: true });
            const r5b = await page.evaluate(async () => { const A = window.SLLocalStore.authStorage, tok = JSON.stringify({ access_token: 'y'.repeat(30000) }); await A.setItem('sb-test2-auth-token', tok); return { back: (await A.getItem('sb-test2-auth-token')) === tok, inLs: localStorage.getItem('sb-test2-auth-token') === tok, cache: Object.keys(localStorage).filter(k => k.indexOf('slai.cache.') === 0).length }; });
            check('5  storage filled to the limit with the AI answer cache: the cache is freed first and the token goes in', f5.full && r5b.back && r5b.inLs && r5b.cache === 0, JSON.stringify({ f5, r5b }));
            // refill, then the real sign-in through the screen
            const f2 = await page.evaluate(FILL, { caches: true });
            await page.fill('#sl-auth-gate #sl-email', 'engineer@example.test'); await page.fill('#sl-auth-gate #sl-password', 'Correct-Horse-9');
            await page.click('#sl-auth-gate #sl-submit');
            const r7 = await within(page.waitForFunction(() => { const m = document.querySelector('#sl-auth-gate #sl-msg'); return (m && /show/.test(m.className) && m.textContent) || (!document.getElementById('sl-auth-gate') && 'lifted'); }, null, { timeout: 20000 }).then(h => h.jsonValue()), 25000, 'the sign-in result').catch(e => 'none: ' + e.message);
            const st = await page.evaluate(async () => { const k = Object.keys(localStorage).find(x => /^sb-.*-auth-token$/.test(x)); const A = window.SLLocalStore.authStorage; const v = await A.getItem('sb-fhrqkhdrwbfnizkepkch-auth-token'); return { stored: !!v && /engineer@example\.test/.test(v), lsKey: k || null, session: !!(window._supabaseSession && window._supabaseSession.user) }; });
            check('7  the real sign-in with storage full: it signs in, the token is stored, no error is shown', f2.full && (r7 === 'lifted' || /Signed in/.test(r7)) && st.stored && !/quota|setItem|exceeded/i.test(r7), JSON.stringify({ f2, r7, st, tokenCalls: log.filter(u => /token/.test(u)).length }));
            // 9, 10: autosave with storage full
            const r9 = await page.evaluate(async (data) => {
                const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
                _applyProjectData(data); await new Promise(r => setTimeout(r, 800));
                const before = localStorage.getItem('safetyLab.autosave.v1');
                const ok = _writeAutosave();
                const idbOk = window.__slAutosaveIdb ? await window.__slAutosaveIdb : null;
                let stored = await SLDB.get('safetyLab.autosave.v1'); if (typeof _maybeDecompress === 'function') stored = await _maybeDecompress(stored);
                let has = false; try { has = _autosaveHasContent(JSON.parse(stored)); } catch (_) {}
                return { ok, idbOk, has, lsPayload: localStorage.getItem('safetyLab.autosave.v1'), before, lsMeta: !!localStorage.getItem('safetyLab.autosave.meta.v1') };
            }, demo.data);
            check('9  autosave with storage full: the project is saved to IndexedDB and the save reports success', r9.ok === true && r9.idbOk === true && r9.has, JSON.stringify(Object.assign({}, r9, { lsPayload: r9.lsPayload && r9.lsPayload.length })));
            const r10 = await page.evaluate(async () => { localStorage.clear(); const ok = _writeAutosave(); if (window.__slAutosaveIdb) await window.__slAutosaveIdb; return { ok, payload: localStorage.getItem('safetyLab.autosave.v1'), meta: !!localStorage.getItem('safetyLab.autosave.meta.v1') }; });
            check('10 an autosave puts no project in localStorage (only the small meta)', r10.ok === true && r10.payload === null && r10.meta, JSON.stringify({ ok: r10.ok, payload: r10.payload && r10.payload.length, meta: r10.meta }));
            check('9  no page errors on the way', errs.filter(e => !/Failed to fetch|NetworkError/i.test(e)).length === 0, errs.slice(0, 3).join(' | '));
            await ctx.close();
        }
        // 6, 8: storage full with nothing that can move
        {
            const ctx = await browser.newContext(); const log = []; await fakeDb(ctx, log);
            const page = await ctx.newPage();
            await boot(page);
            await page.waitForFunction(() => document.querySelector('#sl-auth-gate #sl-email'), null, { timeout: 60000 });
            const f = await page.evaluate(FILL, {});
            const tok = JSON.stringify({ access_token: 'q'.repeat(30000) });
            const r6 = await page.evaluate(async (tok) => { const A = window.SLLocalStore.authStorage; let threw = null; try { await A.setItem('sb-test-auth-token', tok); } catch (e) { threw = String(e && e.message); } return { threw, back: (await A.getItem('sb-test-auth-token')) === tok, inLs: localStorage.getItem('sb-test-auth-token') != null }; }, tok);
            await page.reload(); await page.waitForFunction(() => window.SLLocalStore, null, { timeout: 60000 });
            const after = await page.evaluate(async (tok) => (await window.SLLocalStore.authStorage.getItem('sb-test-auth-token')) === tok, tok);
            check('6  storage full with nothing that can move: the token is still kept, and read back after a reload', f.full && !r6.threw && r6.back && !r6.inLs && after, JSON.stringify({ f, r6, after }));
            // 8: the sign-in's own storage write fails with the raw quota error
            await page.waitForFunction(() => document.querySelector('#sl-auth-gate #sl-email'), null, { timeout: 60000 });
            await page.evaluate(() => { const c = window.getSupabaseClient(); c.auth.signInWithPassword = async () => { const e = new Error("Failed to execute 'setItem' on 'Storage': Setting the value of 'sb-auth-token' exceeded the quota."); e.name = 'QuotaExceededError'; return { data: null, error: e }; }; });
            await page.fill('#sl-auth-gate #sl-email', 'engineer@example.test'); await page.fill('#sl-auth-gate #sl-password', 'Correct-Horse-9');
            await page.click('#sl-auth-gate #sl-submit');
            const m = await page.waitForFunction(() => { const x = document.querySelector('#sl-auth-gate #sl-msg'); return x && /show/.test(x.className) && x.textContent; }, null, { timeout: 15000 }).then(h => h.jsonValue()).catch(() => '');
            check('8  a storage error during sign-in is shown in plain words, never the raw "exceeded the quota"', m && /storage for Safety Lab Aero is full/.test(m) && !/quota|setItem|exceeded/i.test(m), m);
            await ctx.close();
        }
    } catch (e) { check('the browser part ran to the end', false, e && e.stack); }
    await browser.close(); srv.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
