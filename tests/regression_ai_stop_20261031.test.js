/* regression_ai_stop_20261031.test.js — Stop for every AI run, and the indicator names what is running.
 *
 * Waqas, 31 Oct 2026: "we need to give user an interface to be able to stop an AI run too". Agreed: a Stop on the "AI
 * working" indicator, and the AI bar button pressed turns into Stop while its run goes; Stop calls off every request
 * still waiting (the fetch is aborted, so nothing more is billed); what already came back opens for review with
 * "Stopped by you: N of M parts came back"; nothing is left spinning and the next run starts clean. Also: the indicator
 * names the analysis running (the CMA said "a good failure-condition row is worth the wait").
 *   [R] the real request path: Stop aborts every request in flight, no further request goes out for that run, and the
 *       caller gets one plain "Stopped by you." that is never retried
 *   [B] a several-part run (the comment engine, 3 parts): Stop on the indicator ends it with nothing drafted and says so
 *   [P] some parts back, then Stop: those rows open for review and the panel says how many parts came back
 *   [U] the AI bar button reads Stop while its run goes, pressing it stops the run, and it reads as before afterwards
 *   [C] the next run after a Stop goes out and comes back as usual
 *   [L] the indicator names the CMA, and no line names failure-condition rows
 * MUTATION PROOFS: SL_STOP_MUTATE=noabort (Stop aborts nothing), =retry (a stopped turn is retried), =nohalt (later
 *   requests of a stopped run still go out).
 * Run: node tests/regression_ai_stop_20261031.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1200) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_STOP_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'noabort' && file === 'core_modules.js') return body.replace("_halt.ctrls.forEach(function (c) { try { c.abort(); } catch (_) {} });", "");
    if (MUT === 'retry' && file === 'ai_assistant.js') return body.replace("if (e && e.stoppedByUser) { _userStopped = true; break; }", "if (false) {}").replace("if (e.stoppedByUser) return true;", "");
    if (MUT === 'retry' && file === 'core_modules.js') return body.replace("if (e.stoppedByUser) return true;\n", "").replace("const e = new Error('Stopped by you.'); e.stoppedByUser = true; e.permanent = true; return e;", "const e = new Error('Stopped by you.'); e.stoppedByUser = true; return e;");
    if (MUT === 'nohalt' && file === 'core_modules.js') return body.replace("if (_halt.on) throw _stoppedError();", "");
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const iCK = HTML.indexOf('comment_kinds.js?v=1.0'), iAs = HTML.indexOf('assurance_modules.js?v=');
    check('core_modules.js v1.16+, helpers 3.52+ and lane_ai_bar.js v1.6+ are loaded', /core_modules\.js\?v=1\.1[6-9]/.test(HTML) && (m => !!m && (+m[1] > 3 || (+m[1] === 3 && +m[2] >= 52)))(HTML.match(/helpers_modules\.js\?v=(\d+)\.(\d+)/)) && /lane_ai_bar\.js\?v=1\.([6-9]|\d\d)/.test(HTML));
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:kestrel');
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.addInitScript(() => { try { localStorage.setItem('safetyLab.ai.enabled', '1'); } catch (_) {} window.SL_VERIFY_SYNC_OFF = true; window.SL_FC_TREES_OFF = true; window.SL_FC_LINK_OFF = true; });
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        const r = await within(page.evaluate(async (data) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { const v = fn(); if (v) return v; } catch (_) {} await wait(50); } return null; };
            _applyProjectData(data); await wait(1200);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            ['welcome-modal', 'signup-modal'].forEach(id => { const o = document.getElementById(id); if (o) o.classList.remove('show'); });
            const R = {};
            // [R] the real request path, its network stubbed: requests wait until answered or aborted
            const AC = window.AiClient;
            // a browser-only install with a key in this tab: the real request path, nothing else stubbed but the network
            const SS = window.SecretStore; SS.door = () => 'session'; SS.has = k => k === 'anthropic_key'; SS.get = k => (k === 'anthropic_key' ? 'sk-ant-test' : '');
            AC.isConfigured = () => true;
            const net = { sent: 0, aborted: 0, pending: [] };
            const realFetch = window.fetch;
            window.fetch = function (url, init) {
                if (!/anthropic|\/v1\/messages/.test(String(url))) return realFetch.apply(this, arguments);
                net.sent++;
                return new Promise(function (res, rej) {
                    const sig = init && init.signal;
                    const job = { res: res, body: init && init.body };
                    net.pending.push(job);
                    if (sig) sig.addEventListener('abort', function () { net.aborted++; const i = net.pending.indexOf(job); if (i >= 0) net.pending.splice(i, 1); const e = new Error('The operation was aborted.'); e.name = 'AbortError'; rej(e); });
                });
            };
            const answer = (job, text) => job.res(new Response(JSON.stringify({ content: [{ type: 'text', text: text }], usage: { input_tokens: 10, output_tokens: 10 }, model: 'claude-test', stop_reason: 'end_turn' }), { status: 200, headers: { 'content-type': 'application/json' } }));
            const errs = [];
            const p1 = AC.messages({ system: 's', messages: [{ role: 'user', content: 'a' }], feature: 'ai.test' }).catch(e => { errs.push(e); });
            const p2 = AC.messages({ system: 's', messages: [{ role: 'user', content: 'b' }], feature: 'ai.test' }).catch(e => { errs.push(e); });
            await until(() => net.sent >= 2, 4000);
            const sentBefore = net.sent;
            const n = AC.stop();
            await Promise.all([p1, p2]);
            let refused = null; try { await AC.messages({ system: 's', messages: [{ role: 'user', content: 'c' }], feature: 'ai.test' }); } catch (e) { refused = e; }
            R.r = { sentBefore, stopCount: n, aborted: net.aborted, errs: errs.map(e => e && e.message + '|' + !!e.stoppedByUser), permanent: errs.every(e => AC.isPermanentError(e)), laterRefused: !!(refused && refused.stoppedByUser), sentAfter: net.sent };
            await wait(100);
            R.r.clearedAfter = !AC.stopping();
            // [B] the comment engine, 12 comments in 3 parts, the indicator's Stop pressed
            await window.slLoadAI(); await until(() => window.SafetyLabAI && window.SafetyLabAI.addressComments, 20000);
            const fha = acFhaData.filter(f => f && f.fcId).slice(0, 12);
            const ids = fha.map((f, i) => Review.addComment({ kind: 'acFha', id: f.internalId }, 'Please check row ' + (i + 1) + '.').commentId);
            net.sent = 0; net.aborted = 0; net.pending.length = 0;
            const toasts = []; const oldToast = window.showToast; window.showToast = function (m, k) { toasts.push(String(m) + '|' + k); if (oldToast) return oldToast.apply(this, arguments); };
            const pr = window.SafetyLabAI.addressComments({ commentIds: ids });
            await until(() => net.sent >= 3, 15000);
            const ind = document.querySelector('.ai-busy-toast'), btn = ind && ind.querySelector('.ai-busy-stop');
            R.b = { indicator: !!ind, stopBtn: !!btn, sentBefore: net.sent };
            if (btn) btn.click();
            await pr; await wait(1200);
            R.b.aborted = net.aborted; R.b.sentAfter = net.sent; R.b.noPanel = !document.getElementById('ai-rev-anem-batch');
            R.b.said = toasts.some(t => /Stopped by you: 0 of 3 parts came back/.test(t) && /Nothing was drafted/.test(t) && /\|info$/.test(t));
            R.b.noError = !toasts.some(t => /AI error|failed|warning$/.test(t));
            R.b.gone = !document.querySelector('.ai-busy-toast') && !AC.stopping();
            // [P] the first part answered, then Stop
            net.sent = 0; net.aborted = 0; net.pending.length = 0; toasts.length = 0;
            const pr2 = window.SafetyLabAI.addressComments({ commentIds: ids });
            await until(() => net.pending.length >= 3, 15000);
            if (net.pending.length < 3) { R.diag = { sent: net.sent, pending: net.pending.length, stopping: AC.stopping(), inFlight: AC.inFlight(), toasts: toasts.slice(-3), busy: !!document.querySelector('.ai-busy-toast') }; return R; }
            const job0 = net.pending.shift();
            const firstIds = ids.slice(0, 4);
            answer(job0, JSON.stringify({ reply: 'ok', actions: firstIds.map(id => ({ op: 'reply_comment', commentId: id, text: 'Checked: the row is right.' })) }));
            await wait(600);
            document.querySelector('.ai-busy-toast .ai-busy-stop').click();
            await pr2; await wait(1200);
            const pan = document.getElementById('ai-rev-anem-batch');
            const ptxt = pan ? pan.innerText : '';
            R.p = { panel: !!pan, cards: pan ? pan.querySelectorAll('.aifh-card[data-k]').length : 0, said: /Stopped by you: 1 of 3 parts came back/.test(ptxt), aborted: net.aborted, text: ptxt.slice(0, 600) };
            if (pan) pan.remove();
            // [U] + [L] the CMA button on its page (no AND gates: one request)
            ftaPages.forEach(p => (function w(n) { if (!n) return; if (n.type === 'gate') n.gateType = 'OR'; (n.children || []).forEach(w); })(p.root));
            projectSourceDocs = [{ id: 'doc-t', name: 'SDD', text: 'Systems A and B share a wing-root run.' }];
            switchTab('cma'); await wait(900);
            try { window.LANE_AI_BAR && LANE_AI_BAR.mount && LANE_AI_BAR.mount('cma'); } catch (_) {}
            const cmaBtn = await until(() => Array.from(document.querySelectorAll('#view-cma .slab-ai-btn')).find(b => /Common Mode/i.test(b.textContent) && !b.disabled), 5000);
            net.sent = 0; net.aborted = 0; net.pending.length = 0;
            const orig = cmaBtn ? cmaBtn.textContent : '';
            if (cmaBtn) cmaBtn.click();
            await until(() => net.sent >= 1, 15000);
            await until(() => cmaBtn && cmaBtn.getAttribute('data-ai-running') === '1', 3000);
            const label = (document.querySelector('.ai-busy-toast .ai-busy-quip') || {}).textContent || '';
            R.u = { found: !!cmaBtn, reads: cmaBtn ? cmaBtn.textContent : '', label: label };
            if (cmaBtn) cmaBtn.click();   // Stop
            await until(() => !document.querySelector('.ai-busy-toast'), 6000); await wait(1400);
            R.u.aborted = net.aborted; R.u.back = cmaBtn ? cmaBtn.textContent === orig && cmaBtn.getAttribute('data-ai-running') !== '1' : false;
            R.l = { noFcQuip: true, label: label };
            // [C] the next run goes out and comes back
            net.sent = 0; net.aborted = 0; net.pending.length = 0;
            cmaBtn.click();
            await until(() => net.pending.length >= 1, 15000);
            const j = net.pending.shift();
            if (j) answer(j, JSON.stringify({ reply: 'ok', actions: [{ op: 'add_cma', subject: 'Wing-root run', principle: 'A and B independent', claim: 'Shared run', findings: 'Check', mitigation: 'Separate', status: 'Open', confidence: 'medium', source: { doc: 'SDD', quote: 'Systems A and B share a wing-root run' } }] }));
            const pan2 = await until(() => document.getElementById('ai-rev-anem-batch'), 15000);
            R.c = { panel: !!pan2, cards: pan2 ? pan2.querySelectorAll('.aifh-card[data-k]').length : 0 };
            window.fetch = realFetch; window.showToast = oldToast;
            return R;
        }, demo.data), 200000, 'the browser step');
        if (r.diag) console.log('DIAG ' + JSON.stringify(r.diag) + ' B=' + JSON.stringify(r.b));
        console.log('\n[R] the request path');
        check('[R] Stop aborts every request in flight; each caller gets one plain "Stopped by you."', r.r.stopCount === 2 && r.r.aborted === 2 && r.r.errs.length === 2 && r.r.errs.every(x => x === 'Stopped by you.|true'), JSON.stringify(r.r));
        check('[R] it is never retried, and a later request of the stopped run does not go out', r.r.permanent && r.r.laterRefused && r.r.sentAfter === r.r.sentBefore, JSON.stringify(r.r));
        check('[R] once everything has wound down, the next run starts clean', r.r.clearedAfter, JSON.stringify(r.r));
        console.log('\n[B] a several-part run, stopped');
        check('[B] the indicator shows a Stop button while the run goes', r.b.indicator && r.b.stopBtn, JSON.stringify(r.b));
        check('[B] Stop calls off every waiting part and no further part goes out', r.b.aborted === r.b.sentBefore && r.b.sentAfter === r.b.sentBefore, JSON.stringify(r.b));
        check('[B] it says "Stopped by you: 0 of 3 parts came back ... Nothing was drafted", as information, not an error; no panel', r.b.said && r.b.noError && r.b.noPanel, JSON.stringify(r.b));
        check('[B] nothing is left spinning', r.b.gone, JSON.stringify(r.b));
        console.log('\n[P] part of the run back, then Stop');
        check('[P] the part that came back opens for review, and the panel says 1 of 3 parts came back', r.p.panel && r.p.cards === 4 && r.p.said && r.p.aborted === 2, JSON.stringify(r.p));
        console.log('\n[U] the AI bar button');
        check('[U] the button pressed reads Stop while its run goes', r.u.found && /Stop/.test(r.u.reads), JSON.stringify(r.u));
        check('[U] pressing it stops the run, and the button reads as before', r.u.aborted >= 1 && r.u.back, JSON.stringify(r.u));
        console.log('\n[L] what the indicator says');
        check('[L] the indicator names the CMA', /drafting the CMA/.test(r.l.label), JSON.stringify(r.l));
        console.log('\n[C] the next run');
        check('[C] after a Stop, the next run goes out and its rows open for review', r.c.panel && r.c.cards === 1, JSON.stringify(r.c));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) {
        check('test crashed: ' + (e && e.stack || e), false);
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
