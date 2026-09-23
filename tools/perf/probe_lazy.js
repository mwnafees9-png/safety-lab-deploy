// Kept from the 23 Sep 2026 lazy-render session. Usage: CHROME_PATH=<chromium> node tools/perf/probe_lazy.js <repo root> [scale]. Serves site/ locally, loads the sample project, prints JSON.
// Timing probe for lazy_render: how much rendering does an edit on one tab cost the others?
// Usage: node probe_lazy.js <siteRoot>   (siteRoot holds site/, tools/, worker.js)
const path = require('path'), fs = require('fs'), http = require('http');
const ROOT = path.resolve(process.argv[2]);
const { launch, Cdp, evaluate, freePort, sleep } = require(path.join(ROOT, 'tools/smoke/cdp.js'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
function serve(dir) {
    return http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/' || p === '/app' || p === '/app/') p = '/index.html';
        const f = path.join(dir, p); if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
    });
}
(async () => {
    const port = await freePort(); const server = serve(path.join(ROOT, 'site')); await new Promise(r => server.listen(port, '127.0.0.1', r));
    const browser = await launch(); const cdp = await Cdp.connect(browser.wsUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Runtime.enable', {}, sessionId); await cdp.send('Page.enable', {}, sessionId);
    const loaded = new Promise(res => cdp.on(m => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') res(); }));
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' }, sessionId); await Promise.race([loaded, sleep(20000)]); await sleep(2500);
    const out = await evaluate(cdp, sessionId, `(async () => {
        const r = {};
        r.lazyOff = !!window.SL_LAZY_OFF;
        const s0 = (window.SLLazy ? SLLazy.stats() : null);
        await loadSampleProject();
        r.afterLoad = window.SLLazy ? SLLazy.stats() : null;
        r.tab = window._slCurrentTab;
        // the fan-out an edit causes, measured on the dashboard (nothing gated is on screen)
        switchTab('dashboard'); await new Promise(r => setTimeout(r, 300));
        const fns = ['updateD3','renderFTASidebar','renderACFHA','renderSysFHA','renderMacPage','renderInterdepPage','renderCoffePanel','renderMfmsPanel','renderMarkovModels','renderACAssumptions','renderFlightPhases','renderItems','renderSystemDirectory'];
        const t0 = performance.now();
        for (let i = 0; i < 20; i++) for (const f of fns) { try { window[f](); } catch (e) {} }
        r.ms_20_edits_dashboard = Math.round(performance.now() - t0);
        r.statsAfterBurst = window.SLLazy ? SLLazy.stats() : null;
        // now arrive on the FHA and FTA tabs: the pending work runs
        const t1 = performance.now(); switchTab('ac-fha'); await new Promise(r => setTimeout(r, 50)); r.ms_arrive_fha = Math.round(performance.now() - t1);
        r.fhaRows = document.querySelectorAll('#ac-fha-body tr').length;
        const t2 = performance.now(); switchTab('fta'); await new Promise(r => setTimeout(r, 50)); r.ms_arrive_fta = Math.round(performance.now() - t2);
        r.ftaNodes = document.querySelectorAll('#fta-svg g.node').length;
        r.statsEnd = window.SLLazy ? SLLazy.stats() : null;
        r.pending = window.SLLazy ? SLLazy.pending() : null;
        return JSON.stringify(r);
    })()`);
    console.log(out);
    try { browser.kill(); } catch (_) {} server.close(); process.exit(0);
})().catch(e => { console.error('probe failed', e); process.exit(1); });
