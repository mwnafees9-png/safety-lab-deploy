#!/usr/bin/env node
/*
 * Regression (browser): the Golden Thread's Human / AI / Engine badges. 25 Oct 2026.
 *
 * WAQAS: "ok why is it saying human on everything, AI generated or engine generated?" Found on the live Aeolus
 * run: every card said Human. The lookup read window.acFhaData and the like, which are `let` bindings and never
 * window properties, so it found nothing; and a generated requirement could never be Engine.
 *   [B1] a failure condition the AI drafted, not edited since: AI
 *   [B2] one an engineer edited: Human; one entered by hand: Human
 *   [B3] a requirement made by auto req: Engine
 *   [B4] a generated requirement an engineer rewrote: Human
 *   [B5] a function the AI drafted: AI
 *   [B6] the cards on screen carry those words
 * MUTATION PROOFS (SL_GT_MUTATE): window (read the stores off window again) turns B1, B3 and B5 red; engine (no
 * Engine for generated requirements) turns B3 red.
 * Run: node tests/regression_gt_provenance_20261025.test.js   (Playwright + Chromium)
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_GT_MUTATE || '';
const MUTS = {
    window: ["const g = { systemsData: _st('systemsData'), acFhaData: _st('acFhaData'), acReqData: _st('acReqData'), ftaPages: _st('ftaPages'), itemsData: _st('itemsData'), acFunctionsData: _st('acFunctionsData') };", "const g = (typeof window !== 'undefined') ? window : {};"],
    engine: ["if (rs && rs.generator && rs.generator !== 'reqif' && !rs.userOverridden && !_he(it)) return 'engine';", ''],
};
const mutate = (file, body) => { const m = MUTS[MUT]; return m && file === 'gt_thread.js' ? body.replace(m[0], m[1]) : body; };

(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed on this machine: the browser checks did not run'); process.exit(0); }
    if (MUT) { const src = fs.readFileSync(path.join(SITE, 'gt_thread.js'), 'utf8'); if (!MUTS[MUT] || mutate('gt_thread.js', src) === src) { console.log('  FAIL  the mutation ' + MUT + ' found nothing to change'); process.exit(1); } }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && /\.js$/.test(f)) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof loadSampleProject === 'function' && typeof AutoReq !== 'undefined' && window.GT_THREAD && typeof _gtvBuildGraph === 'function', null, { timeout: 60000 });
        await page.evaluate(async () => { const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); window.SL_VERIFY_SYNC_OFF = true; await loadSampleProject(); });
        await page.waitForTimeout(2000);
        const R = await page.evaluate(() => {
            const out = {};
            const fn = acFunctionsData.find(f => f && f.subId);
            out.sub = fn && fn.subId;
            if (!fn) return out;
            // three failure conditions of this function, written here so the test does not lean on the sample's
            const ph = flightPhasesData.map(x => x.phase).slice(0, 3).join(', ');
            const rows = ['Hazardous', 'Major', 'Major'].map((sev, i) => { const r = { internalId: 'gtp-' + i, subId: fn.subId, fcId: 'GTP-' + (i + 1), fcDesc: 'test condition ' + (i + 1), severity: sev, phases: ph, effAc: 'x', effCrew: 'x', effPax: 'x' }; acFhaData.push(r); return r; });
            fn.aiModel = 'test-model';
            rows.forEach(r => { delete r.aiModel; delete r.humanEdited; });
            const ai = rows[0], edited = rows[1], hand = rows[2];
            ai.aiModel = 'test-model';
            edited.aiModel = 'test-model'; edited.humanEdited = true;
            acReqData.length = 0;
            const m = AutoReq.generate({ fha: true }, 'ac');
            AutoReq.applyMerge(m, { acceptNew: true, acceptUpdates: true, acceptOrphanRemoval: false });
            const mine = acReqData.filter(r => r.reqSource && r.reqSource.context && /^GTP-/.test(r.reqSource.context.fcId || ''));
            const rewritten = mine[0]; if (rewritten) rewritten.reqSource.userOverridden = true;
            const g = _gtvBuildGraph({ functionSubId: fn.subId });
            const host = document.createElement('div'); document.body.appendChild(host);
            GT_THREAD.render(host, g);
            const provOfRef = (kind, id) => { const n = g.nodes.find(x => x.ref && x.ref.kind === kind && String(x.ref.id) === String(id)); return n ? n._prov : 'missing'; };
            out.ai = provOfRef('acFha', ai.internalId);
            out.edited = provOfRef('acFha', edited.internalId);
            out.hand = provOfRef('acFha', hand.internalId);
            out.reqs = mine.map(r => provOfRef('acReq', r.internalId));
            out.nReq = mine.length;
            out.func = (g.nodes.find(x => x.kind === 'func') || {})._prov;
            const txt = [...host.querySelectorAll('text')].map(t => t.textContent);
            out.words = { ai: txt.filter(t => t === 'AI').length, engine: txt.filter(t => t === 'Engine').length, human: txt.filter(t => t === 'Human').length };
            return out;
        });
        check('the sample has a function to hang three test failure conditions on', !!R.sub, JSON.stringify(R));
        check('[B1] a failure condition the AI drafted, not edited since: AI', R.ai === 'ai', R.ai);
        check('[B2] one an engineer edited: Human; one entered by hand: Human', R.edited === 'human' && R.hand === 'human', JSON.stringify([R.edited, R.hand]));
        check('[B3] the requirements made by auto req: Engine', R.nReq >= 2 && R.reqs.slice(1).every(p => p === 'engine'), JSON.stringify(R.reqs));
        check('[B4] a generated requirement an engineer rewrote: Human', R.reqs[0] === 'human', JSON.stringify(R.reqs));
        check('[B5] a function the AI drafted: AI', R.func === 'ai', R.func);
        check('[B6] the cards on screen carry AI, Engine and Human', R.words && R.words.ai >= 2 && R.words.engine >= 1 && R.words.human >= 2, JSON.stringify(R.words));
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
