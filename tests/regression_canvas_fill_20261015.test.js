/*
 * Regression - 15 Oct 2026. Every diagram canvas fills the page area the way the fault tree does,
 * and every toolbox is a full-height strip down the left edge of its canvas.
 *
 * FOUND: the fault tree Toolbox (GATES / DYNAMIC GATES / EVENTS) was a floating box that stopped
 *   partway down the canvas, leaving empty canvas under it. The other diagrams were fixed-size boxes
 *   of different heights (bow-tie 640, event trees 620, STPA 620, cascading effects 600, RBD 540,
 *   Markov 420, the Markov phase view 380), the golden thread grew to whatever height the thread
 *   needed, and the CAD viewer had its own fixed 680.
 * FIX: one sizing rule in safety_lab.css ("Diagram canvases"): the token --sl-canvas-h is the
 *   drawing-area height, max(520px, 100vh - 220px), which is exactly the 680px the fault tree always
 *   had on a 900px window, and grows with the window. --sl-strip-w is the toolbox strip width.
 *   - Fault tree: #fta-svg takes --sl-canvas-h; #fta-toolbox carries the shared .sl-canvas-strip
 *     class (absolute, top 0 to bottom 0 of the canvas, scrolls inside itself).
 *   - SLDiagramEditor (diagram_editor.js v1.5): height: 'fill' sizes the body (toolbox | canvas |
 *     properties) to --sl-canvas-h; the toolbar and status bar sit outside it like the fault tree
 *     toolbar. Every diagram mounts with it (bow-tie, event trees, Markov and its phase view, RBD,
 *     cascading effects, STPA control structure). Full screen still takes the whole window.
 *   - Golden thread: #gt-sankey-host is a canvas of that height (.sl-canvas-fill) that pans and
 *     scrolls inside; Fit now fits the height as well as the width.
 *   - CAD viewer: height var(--sl-canvas-h).
 *   No diagram math, data or behaviour other than layout changed.
 * EXECUTED: [A] structural checks on the real site files, each with a mutation proof (a mutated copy
 *   of the source must fail the same check); [B] the real app in headless Chromium (HL-1 demo) at
 *   1440x900 and 1920x1080: for every diagram view the drawing area height equals the token, the
 *   canvas fills the width of its page area, and the toolbox strip runs from the canvas top to the
 *   canvas bottom; fault tree full screen and diagram editor full screen still fill the window; and
 *   a mutation proof that the measurement catches a floating toolbox and a fixed-height diagram.
 *   [B] prints SKIP when Playwright or Chromium is not available.
 *
 * Run: node tests/regression_canvas_fill_20261015.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');

let pass = 0, fail = 0; const skips = [];
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' - ' + d : '')); } };

// ------------------------------------------------------------------ [A] structural
const SRC = {
    css: read('safety_lab.css'), fta: read('fta_canvas_edit.js'), sde: read('diagram_editor.js'),
    idx: read('index.html'), sup: read('support_modules.js'), cad: read('cad_page.js'),
    callers: {}
};
const CALLER_FILES = fs.readdirSync(SITE).filter(f => /\.js$/.test(f) && f !== 'diagram_editor.js' && !/_data\.js$/.test(f));
CALLER_FILES.forEach(f => { const s = read(f); if (/SLDiagramEditor\.mount\(|_E\.mount\(/.test(s)) SRC.callers[f] = s; });

const RULES = {
    'the canvas height token is max(520px, 100vh - 220px) (680px on a 900px window) and the strip width token is set':
        s => /:root\s*\{[^}]*--sl-canvas-h:\s*max\(520px,\s*calc\(100vh - 220px\)\)/.test(s.css) && /--sl-strip-w:\s*150px/.test(s.css),
    'the shared strip rule runs the full height of the canvas (absolute, left 0, top 0, bottom 0)':
        s => { const m = s.css.match(/\.sl-canvas-strip\s*\{([^}]*)\}/); return !!m && /position:\s*absolute/.test(m[1]) && /left:\s*0/.test(m[1]) && /top:\s*0/.test(m[1]) && /bottom:\s*0/.test(m[1]) && /width:\s*var\(--sl-strip-w\)/.test(m[1]) && /overflow-y:\s*auto/.test(m[1]) && !/max-height/.test(m[1]); },
    'the fault tree canvas takes the token (no fixed 680px left)':
        s => /#fta-svg\s*\{\s*height:\s*var\(--sl-canvas-h\)\s*!important/.test(s.css) && !/#fta-svg\s*\{\s*height:\s*680px/.test(s.css),
    'fault tree full screen keeps its own window-height rule':
        s => /body\.fta-fullscreen #fta-svg \{ height: calc\(100vh - 80px\) !important; \}/.test(s.css),
    'the fault tree toolbox carries the shared strip class':
        s => /tb\.id = 'fta-toolbox';\s*tb\.className = 'sl-canvas-strip';/.test(s.fta),
    'the fault tree toolbox rule no longer floats it (no position, top, left, max-height, radius, shadow)':
        s => { const m = s.fta.match(/'#fta-toolbox\{([^}]*)\}'/); return !!m && !/position|top:|left:|max-height|border-radius|box-shadow|width:/.test(m[1]); },
    "the diagram editor has the 'fill' mode: class on the root, body sized to the token, full screen overrides it":
        s => /if \(this\.opts\.height === 'fill'\) root\.classList\.add\('sde-fill'\);/.test(s.sde) &&
             /\.sde\.sde-fill>\.sde-body\{flex:0 0 auto;height:var\(--sl-canvas-h,640px\)\}/.test(s.sde) &&
             /\.sde\.sde-fill\.sde-fullscreen>\.sde-body\{flex:1 1 0;height:auto\}/.test(s.sde),
    'the diagram editor toolbox strip uses the shared strip width':
        s => /'\.sde-toolbox\{width:var\(--sl-strip-w,150px\);/.test(s.sde),
    "every diagram editor mount in the app uses height: 'fill' (no fixed heights)":
        s => { const bad = []; let n = 0;
            Object.keys(s.callers).forEach(f => { const src = s.callers[f]; const re = /(?:SLDiagramEditor|_E)\.mount\(/g; let m;
                while ((m = re.exec(src))) { n++; const win = src.slice(m.index, m.index + 400); if (!/height: 'fill'/.test(win) || /height:\s*\d+/.test(win.slice(0, win.indexOf('fill') + 4))) bad.push(f + '@' + m.index); } });
            return n >= 7 && !bad.length; },
    'the golden thread host is a canvas of the shared height, and Fit fits its height too':
        s => /<div id="gt-sankey-host" class="sl-canvas-fill"/.test(s.idx) && /\.sl-canvas-fill\s*\{\s*height:\s*var\(--sl-canvas-h\)/.test(s.css) &&
             /function gtZoomFit\(\)\{[\s\S]{0,900}h\.clientHeight - 16[\s\S]{0,200}h\.scrollTop = 0;/.test(s.sup),
    'the CAD viewer takes the shared height':
        s => /SLCadViewer\.mount\(document\.getElementById\('cad-viewer-host'\), \{ height: 'var\(--sl-canvas-h\)'/.test(s.cad),
    // at least the key this change set (a later change to the same file bumps it again, 15 Oct 2026: cad_page.js 1.8)
    'every changed file has a bumped cache key in index.html':
        s => ['safety_lab.css?v=65.67', 'fta_canvas_edit.js?v=1.1', 'support_modules.js?v=66.45', 'diagram_editor.js?v=1.5', 'rbd_module.js?v=2.1', 'cea_graph.js?v=1.4', 'stpa_panel.js?v=1.47', 'cad_page.js?v=1.8', 'event_trees.js?v=2.1', 'bowtie.js?v=3.1', 'markov_diagram.js?v=1.1'].every(k => {
            const [f, v] = k.split('?v='), m = new RegExp('"' + f.replace(/\./g, '\\.') + '\\?v=([0-9.]+)"').exec(s.idx); if (!m) return false;
            const a = m[1].split('.').map(Number), b = v.split('.').map(Number);
            for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x > y; }
            return true; })
};
// one mutation per rule: the mutated copy must FAIL the same rule
const clone = s => Object.assign({}, s, { callers: Object.assign({}, s.callers) });
const MUT = {
    'the canvas height token is max(520px, 100vh - 220px) (680px on a 900px window) and the strip width token is set': s => { s.css = s.css.replace('max(520px, calc(100vh - 220px))', '680px'); },
    'the shared strip rule runs the full height of the canvas (absolute, left 0, top 0, bottom 0)': s => { s.css = s.css.replace(/(\.sl-canvas-strip\s*\{[^}]*?)bottom:\s*0;/, '$1max-height: calc(100% - 66px);'); },
    'the fault tree canvas takes the token (no fixed 680px left)': s => { s.css = s.css.replace('#fta-svg { height: var(--sl-canvas-h) !important;', '#fta-svg { height: 680px !important;'); },
    'fault tree full screen keeps its own window-height rule': s => { s.css = s.css.replace('body.fta-fullscreen #fta-svg { height: calc(100vh - 80px) !important; }', ''); },
    'the fault tree toolbox carries the shared strip class': s => { s.fta = s.fta.replace("tb.className = 'sl-canvas-strip';", ''); },
    'the fault tree toolbox rule no longer floats it (no position, top, left, max-height, radius, shadow)': s => { s.fta = s.fta.replace("'#fta-toolbox{padding:", "'#fta-toolbox{position:absolute;left:10px;top:10px;max-height:calc(100% - 66px);padding:"); },
    "the diagram editor has the 'fill' mode: class on the root, body sized to the token, full screen overrides it": s => { s.sde = s.sde.replace('.sde.sde-fill.sde-fullscreen>.sde-body{flex:1 1 0;height:auto}', ''); },
    'the diagram editor toolbox strip uses the shared strip width': s => { s.sde = s.sde.replace("'.sde-toolbox{width:var(--sl-strip-w,150px);", "'.sde-toolbox{width:150px;"); },
    "every diagram editor mount in the app uses height: 'fill' (no fixed heights)": s => { const f = Object.keys(s.callers).find(k => /markov_diagram/.test(k)); s.callers[f] = s.callers[f].replace("type: 'markov', height: 'fill', minimap", "type: 'markov', height: 420, minimap"); },
    'the golden thread host is a canvas of the shared height, and Fit fits its height too': s => { s.idx = s.idx.replace('<div id="gt-sankey-host" class="sl-canvas-fill"', '<div id="gt-sankey-host"'); },
    'the CAD viewer takes the shared height': s => { s.cad = s.cad.replace("{ height: 'var(--sl-canvas-h)'", '{ height: 680'); },
    'every changed file has a bumped cache key in index.html': s => { s.idx = s.idx.replace('diagram_editor.js?v=1.5"', 'diagram_editor.js?v=1.4"'); }
};
console.log('\n[A] structural (real site files), each with a mutation proof');
Object.keys(RULES).forEach(name => {
    let ok = false; try { ok = RULES[name](SRC); } catch (e) { ok = false; }
    check(name, ok);
    const m = clone(SRC); MUT[name](m);
    let caught = false; try { caught = !RULES[name](m); } catch (_) { caught = true; }
    check('  mutation is caught: ' + name, caught);
});
check('the diagram editor mount callers found are the six diagram modules (seven mounts)', ['bowtie.js', 'cea_graph.js', 'event_trees.js', 'markov_diagram.js', 'rbd_module.js', 'stpa_panel.js'].every(f => SRC.callers[f]), Object.keys(SRC.callers).join(','));

// ------------------------------------------------------------------ [B] headless Chromium
async function browserPhase() {
    let chromium;
    try { chromium = require('playwright').chromium; } catch (e) {
        try { chromium = require('/opt/npm-tools/node_modules/playwright').chromium; } catch (_) { skips.push('[B] playwright not installed'); console.log('  SKIP  playwright is not installed; browser checks not run'); return; }
    }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
    const server = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
        const f = path.join(SITE, p);
        if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    let browser;
    try { browser = await chromium.launch(); }
    catch (e) { skips.push('[B] no Chromium'); console.log('  SKIP  no Chromium available (' + String(e.message).split('\n')[0] + ')'); server.close(); return; }
    // view -> how to find its canvas, toolbox and drawing area
    const VIEWS = [
        { v: 'fta', root: '#svg-wrap-container', area: '#svg-wrap-container', strip: '#fta-toolbox' },
        { v: 'bowtie', root: '#view-bowtie .sde', area: '#view-bowtie .sde-body', strip: '#view-bowtie .sde-toolbox' },
        { v: 'eta', root: '#view-eta .sde', area: '#view-eta .sde-body', strip: '#view-eta .sde-toolbox' },
        { v: 'markov', root: '#view-markov .sde', area: '#view-markov .sde-body', strip: '#view-markov .sde-toolbox' },
        { v: 'ram-rbd', root: '#view-ram-rbd .sde', area: '#view-ram-rbd .sde-body', strip: '#view-ram-rbd .sde-toolbox' },
        { v: 'cea', root: '#view-cea .sde', area: '#view-cea .sde-body', strip: '#view-cea .sde-toolbox' },
        { v: 'stpa', root: '#view-stpa .sde', area: '#view-stpa .sde-body', strip: '#view-stpa .sde-toolbox' },
        { v: 'golden-thread', root: '#gt-sankey-host', area: '#gt-sankey-host', strip: null },
        { v: 'cad', root: '#view-cad .scv', area: '#view-cad .scv', strip: null }
    ];
    // the measurement, run in the page: returns { ok, why, ... }
    const MEASURE = (o) => {
        const q = s => document.querySelector(s);
        const root = q(o.root), area = q(o.area);
        if (!root || !area || !root.offsetParent) return { ok: false, why: 'not on the page' };
        const want = Math.max(520, window.innerHeight - 220);
        const ra = area.getBoundingClientRect(), rr = root.getBoundingClientRect();
        // the drawing area: inside the border for the fault tree / golden thread host, the body for the editor
        const areaH = (o.v === 'fta' || o.v === 'golden-thread') ? area.clientHeight : ra.height;
        const pr = root.parentElement.getBoundingClientRect(), pcs = getComputedStyle(root.parentElement);
        const parentContentW = pr.width - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight) - parseFloat(pcs.borderLeftWidth) - parseFloat(pcs.borderRightWidth);
        const out = { want, areaH: Math.round(areaH), w: Math.round(rr.width), pw: Math.round(parentContentW) };
        if (o.v === 'cad') out.areaH = Math.round(rr.height);   // the viewer's own height is the token
        if (Math.abs(out.areaH - want) > 2) return Object.assign(out, { ok: false, why: 'drawing area ' + out.areaH + ' px, expected ' + want });
        if (rr.width < parentContentW - 2) return Object.assign(out, { ok: false, why: 'canvas ' + out.w + ' px wide in a ' + out.pw + ' px page area' });
        if (o.strip) {
            const s = q(o.strip); if (!s || !s.offsetParent) return Object.assign(out, { ok: false, why: 'no toolbox' });
            const rs = s.getBoundingClientRect();
            const top = o.v === 'fta' ? ra.top + parseFloat(getComputedStyle(area).borderTopWidth) : ra.top;
            const bot = o.v === 'fta' ? ra.bottom - parseFloat(getComputedStyle(area).borderBottomWidth) : ra.bottom;
            out.strip = { top: Math.round(rs.top - top), bottom: Math.round(bot - rs.bottom), left: Math.round(rs.left - (o.v === 'fta' ? ra.left + parseFloat(getComputedStyle(area).borderLeftWidth) : ra.left)) };
            if (Math.abs(out.strip.top) > 1 || Math.abs(out.strip.bottom) > 1 || Math.abs(out.strip.left) > 1) return Object.assign(out, { ok: false, why: 'toolbox is not a full-height left strip ' + JSON.stringify(out.strip) });
        }
        return Object.assign(out, { ok: true });
    };
    try {
        for (const [W, H] of [[1440, 900], [1920, 1080]]) {
            console.log('\n[B] real app in Chromium at ' + W + 'x' + H + ' (HL-1 demo)');
            const page = await browser.newPage({ viewport: { width: W, height: H } });
            const errors = []; page.on('pageerror', e => errors.push(String(e)));
            await page.goto('http://127.0.0.1:' + server.address().port + '/');
            await page.waitForFunction(() => typeof window.loadHL1Demo === 'function' && window.SLDiagramEditor && window.SLFtaEdit, null, { timeout: 30000 });
            await page.evaluate(async () => {
                // the sign-in gate is not what this test is about: take it down (no credentials involved)
                const ung = () => { document.querySelectorAll('[aria-label="Sign in to Safety Lab Aero"]').forEach(g => g.remove()); document.documentElement.classList.remove('sl-auth-gate-blocked');
                    const t = document.getElementById('signup-modal-title'); if (t) { let o = t; while (o && o.parentElement && o.parentElement !== document.body) o = o.parentElement; if (o) o.style.display = 'none'; }
                    document.querySelectorAll('.modal-overlay, .modal').forEach(o => { if (getComputedStyle(o).display !== 'none' && !o.closest('.sde') && !o.classList.contains('sl-ack-overlay') && !o.classList.contains('sl-dialog-overlay')) o.style.display = 'none'; }); };
                window.__ung = ung; ung();
                await loadHL1Demo(); await new Promise(r => setTimeout(r, 1500)); ung();
                ['bowtie', 'eta', 'stpa', 'cea', 'markov', 'ram-reliability'].forEach(l => { try { PROGRAM_PLAN.setLane(l, true); } catch (e) {} });
                window._ramHasAccess = () => true;   // the RBD lane is Pro+; layout is what is under test here
            });
            for (const o of VIEWS) {
                await page.evaluate(v => { switchTab(v); window.__ung(); }, o.v);
                await page.waitForTimeout(900);
                if (o.v === 'stpa') { await page.evaluate(() => STPA_PANEL.go(2)); await page.waitForTimeout(500); }
                if (o.v === 'ram-rbd' && !(await page.evaluate(() => !!document.querySelector('#view-ram-rbd .sde')))) {
                    await page.evaluate(() => { const b = document.querySelector('[data-rbd-act="derive"]'); if (b) b.click(); }); await page.waitForTimeout(1000);
                    await page.evaluate(() => document.querySelectorAll('.sl-ack-overlay .sl-ack-keep').forEach(k => k.click())); await page.waitForTimeout(400);
                }
                if (o.v === 'golden-thread') { await page.evaluate(() => { const p = document.getElementById('gt-func-pick'); if (p && p.options.length > 1) { p.selectedIndex = 1; p.dispatchEvent(new Event('change')); } }); await page.waitForTimeout(500); }
                const r = await page.evaluate(MEASURE, o);
                check(o.v + ': drawing area = the shared canvas height, full width' + (o.strip ? ', toolbox a full-height left strip' : ''), r.ok, r.why + ' ' + JSON.stringify(r));
            }
            // golden thread Fit now fits the whole thread inside the canvas
            const fit = await page.evaluate(() => { switchTab('golden-thread'); const h = document.getElementById('gt-sankey-host'); gtZoomFit(); const s = h.querySelector('svg'); if (!s) return null; const r = s.getBoundingClientRect(); return { sh: r.height, hh: h.clientHeight, scale: parseFloat(h.dataset.gtScale || '1') }; });
            check('golden thread: Fit brings the whole thread inside the canvas height (or the 40% floor)', fit && (fit.sh <= fit.hh || Math.abs(fit.scale - 0.4) < 0.001), JSON.stringify(fit));
            // fault tree full screen: canvas fills the window, strip still full height
            const fs1 = await page.evaluate(async () => { switchTab('fta'); await new Promise(r => setTimeout(r, 300)); toggleFTAFullscreen(); await new Promise(r => setTimeout(r, 400));
                const c = document.getElementById('svg-wrap-container'), t = document.getElementById('fta-toolbox'), s = document.getElementById('fta-svg');
                const o = { svgH: Math.round(s.getBoundingClientRect().height), want: window.innerHeight - 80, tbH: Math.round(t.getBoundingClientRect().height), cH: c.clientHeight };
                toggleFTAFullscreen(); await new Promise(r => setTimeout(r, 300)); return o; });
            check('fault tree full screen: canvas is the window height less 80px and the strip still runs its full height', Math.abs(fs1.svgH - fs1.want) <= 2 && Math.abs(fs1.tbH - fs1.cH) <= 1, JSON.stringify(fs1));
            // diagram editor full screen: the body fills the window (fill mode does not cap it)
            const fs2 = await page.evaluate(async () => { switchTab('bowtie'); await new Promise(r => setTimeout(r, 600)); const ed = SLBowtieUI.editor(); ed.toggleFullscreen(true); await new Promise(r => setTimeout(r, 200));
                const root = ed.root.getBoundingClientRect(), body = ed.root.querySelector('.sde-body').getBoundingClientRect(), tb = ed.root.querySelector('.sde-toolbox').getBoundingClientRect();
                const o = { rootH: Math.round(root.height), winH: window.innerHeight, bodyH: Math.round(body.height), tbH: Math.round(tb.height), bodyBottom: Math.round(body.bottom), rootBottom: Math.round(root.bottom) };
                ed.toggleFullscreen(false); await new Promise(r => setTimeout(r, 200));
                o.after = Math.round(ed.root.querySelector('.sde-body').getBoundingClientRect().height); o.want = Math.max(520, window.innerHeight - 220); return o; });
            check('diagram editor full screen: the editor fills the window and its body takes all the room left', Math.abs(fs2.rootH - fs2.winH) <= 1 && fs2.bodyH > fs2.winH - 160 && fs2.tbH === fs2.bodyH, JSON.stringify(fs2));
            check('diagram editor leaving full screen: back to the shared canvas height', Math.abs(fs2.after - fs2.want) <= 2, JSON.stringify(fs2));
            // mutation proof for the measurement itself
            const mut = await page.evaluate(async (MEASURE_SRC) => {
                const MEASURE = eval('(' + MEASURE_SRC + ')');
                switchTab('fta'); await new Promise(r => setTimeout(r, 300));
                const st = document.createElement('style'); st.textContent = '#fta-toolbox{top:10px!important;bottom:auto!important;max-height:calc(100% - 66px)!important;height:auto!important}'; document.head.appendChild(st);
                await new Promise(r => setTimeout(r, 50));
                const a = MEASURE({ v: 'fta', root: '#svg-wrap-container', area: '#svg-wrap-container', strip: '#fta-toolbox' }); st.remove();
                switchTab('bowtie'); await new Promise(r => setTimeout(r, 600));
                const ed = SLBowtieUI.editor(); ed.root.classList.remove('sde-fill'); ed.root.style.height = '640px'; await new Promise(r => setTimeout(r, 50));
                const b = MEASURE({ v: 'bowtie', root: '#view-bowtie .sde', area: '#view-bowtie .sde-body', strip: '#view-bowtie .sde-toolbox' });
                ed.root.classList.add('sde-fill'); ed.root.style.height = '';
                return { floatingCaught: !a.ok, fixedCaught: !b.ok, a: a.why, b: b.why };
            }, MEASURE.toString());
            check('mutation: the measurement catches a floating toolbox that stops partway down', mut.floatingCaught, JSON.stringify(mut));
            check('mutation: the measurement catches a fixed 640px diagram', mut.fixedCaught, JSON.stringify(mut));
            check('no page errors while switching views', errors.length === 0, errors.slice(0, 3).join(' | '));
            await page.close();
        }
    } finally { await browser.close(); server.close(); }
}

browserPhase().catch(e => { fail++; console.log('  FAIL  browser phase threw - ' + (e && e.stack || e)); }).then(() => {
    console.log('\n' + pass + ' passed, ' + fail + ' failed' + (skips.length ? ', ' + skips.length + ' SKIPPED: ' + skips.join(' ') : ''));
    process.exitCode = fail ? 1 : 0;
});
