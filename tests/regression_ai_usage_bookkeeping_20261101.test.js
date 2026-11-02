/* regression_ai_usage_bookkeeping_20261101.test.js — the AI usage counter is never a change to confirm.
 *
 * Found live 1 Nov 2026: the November rollover of the monthly AI usage counter (projectConfig.aiTokenUsage) showed in
 * the top bar as "2 changes to confirm", beside the person's own change. The counter is the app's bookkeeping:
 * resetting it for a new month, or adding a call's usage to it, is never listed, never undone by Discard, and the saved
 * project always carries it as it is now (change_ack.js v3.7: one of the settings the app keeps for itself, BOOK_PC).
 * MUTATION PROOFS: SL_AIU_MUTATE=user (the counter tracked like a person's change), =rollback (Discard takes the
 * counter back) must fail.
 * Run: node tests/regression_ai_usage_bookkeeping_20261101.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 800) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_AIU_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'user' && file === 'change_ack.js') return body.replace("cmaDecisionLog: 1, aiTokenUsage: 1 };", "cmaDecisionLog: 1 };");
    if (MUT === 'rollback' && file === 'change_ack.js') return body.replace("if (_pc1) _pc1.aiTokenUsage = _P(_usage);", "");
    return body;
}
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('change_ack.js v3.7 loads', /change_ack\.js\?v=3\.7/.test(HTML));
    if (!pw) { console.log('  note  Playwright is not installed'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        const errs = []; pg.on('pageerror', e => errs.push(String(e && e.message || e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await new Promise(r => setTimeout(r, 3500));
        await pg.evaluate(() => { try { if (window.SLCmaLive) window.SLCmaLive.onModelChange = function () {}; } catch (_) {} const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); });
        await pg.evaluate(async () => { await loadSampleProject(); });
        await new Promise(r => setTimeout(r, 2600));
        const r = await pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const CA = window.SLChangeAck;
            const settle = async () => { for (let i = 0; i < 40 && CA.status().open; i++) await wait(100); await wait(900); };
            await settle();
            const c0 = CA.count();
            // last month's counter, as a project saved in October carries it
            CA.system(() => { projectConfig.aiTokenUsage = { month: '2026-10', used: 2921904.4645, allowance: 2000000 }; });
            await settle();
            const c1 = CA.count();
            // as it happened live: the read that rolls the month over lands inside a change the person is making
            CA._markInput();
            acFhaData[0].comments = 'edited by the person ' + Date.now();
            const u = AiClient.getTokenUsage();
            scheduleAutosave(); await settle();
            const c2 = CA.count();
            const lines = (CA.lines ? CA.lines() : []).map(l => l.label);
            // the accepted project written while the change waits carries this month's counter
            let saved = null;
            try { const acc = CA.acceptedSnapshot ? CA.acceptedSnapshot() : null; const obj = acc ? (typeof acc === 'string' ? JSON.parse(acc) : acc) : null; saved = obj && obj.projectConfig ? obj.projectConfig.aiTokenUsage : 'no snapshot'; } catch (e) { saved = 'ERR ' + e.message; }
            // Discard all: the person's change goes, the counter stays
            let afterDiscard = null;
            try { CA._setTestAnswer('discard'); CA.ask ? await CA.ask() : null; await settle(); CA._setTestAnswer(null); afterDiscard = { month: projectConfig.aiTokenUsage.month, count: CA.count(), comment: acFhaData[0].comments }; } catch (e) { afterDiscard = 'ERR ' + e.message; }
            return { c0, c1, c2, rolled: u.month !== '2026-10' && u.used === 0, lines, saved, afterDiscard };
        });
        check('the monthly rollover happens', r.rolled, JSON.stringify(r));
        check('the person\'s own change is listed, the rollover is not', r.c2 === r.c1 + 1 && !r.lines.some(l => /token/i.test(l)), JSON.stringify(r));
        check('Discard takes back the person\'s change and leaves the counter as it is now', r.afterDiscard && r.afterDiscard.count === 0 && r.afterDiscard.month !== '2026-10' && !/edited by the person/.test(r.afterDiscard.comment || ''), JSON.stringify(r.afterDiscard));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) { check('test crashed: ' + (e && e.stack || e), false); }
    finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
