/*
 * regression_fta_warn_pill_20261027.test.js
 *
 * 27 Oct 2026 (customer report). A customer's tree showed "Actual: P=..." half hidden behind the gate, and the
 * per flight hour value cut off ("≈2.00E-10/I"). Waqas: the line under a node shows both numbers on
 * one line, sized to fit; every other note sits behind a small warning pill at the bottom of the canvas
 * (only this tree's), a click highlights exactly the nodes it belongs to, and the node's
 * properties box shows the notes in full.
 *
 * [A] wiring and wording (pure)
 * [B] in the real app (Playwright + Chromium; skipped with a note where missing)
 *     B1 one line per node, fits, nothing drawn over or under it
 *     B2 the pill (small, in the canvas) lists this tree's warnings only
 *     B3 a click highlights exactly its nodes (collapsed branches open), a second click or the
 *        empty canvas clears it
 *     B4 the properties box says the same thing in full
 *     B5 the top event's exact total against its target
 *
 * Mutation: SL_FTAWARN_MUTATE=1 serves fta_view_modules.js without the pill's refresh: [B] goes red.
 * Run: node tests/regression_fta_warn_pill_20261027.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function fnSrc(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return null;
    let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
    return null;
}

// ================================================================================ [A]
console.log('\n[A] wiring and wording');
const H = read('helpers_modules.js'), V = read('fta_view_modules.js'), IDX = read('index.html'), W = read('fta_warn_pill.js'), CSS = read('safety_lab.css');
check('the node no longer draws the Actual line', !/class', 'node-actual-line'/.test(V) && !/select\('\.node-actual-line'\)/.test(V));
check('the node no longer draws the feasibility mark', !/class', 'node-feasibility-mark'/.test(V) && !/select\('\.node-feasibility-mark'\)/.test(V));
check('the number line is fitted after every value it shows', /this\.value = formatNodeMetrics\(d\);\n\s*_ftaFitMetricLine\(this\);/.test(V));
check('the fit never goes below 7px and measures the field\'s own font', /BASE = 11\.5, MIN = 7/.test(V) && /getComputedStyle\(el\)/.test(V) && /measureText\(text\)/.test(V));
check('every render refreshes the pill (and an empty page hides it)', /SLFtaWarn\.afterRender\(rootNode, _allDesc\)/.test(V) && /SLFtaWarn\.afterRender\(null, \[\]\)/.test(V));
check('selecting a node fills its warnings block', /SLFtaWarn\.fillPanel\(dataNode\)/.test(V));
check('index.html has the pill in the canvas\'s bottom row and the panel block', /<div class="canvas-floating-actions">\s*<!--[^\n]*-->\s*<div id="fta-warn-pill"/.test(IDX) && /id="config-node-warnings"/.test(IDX));
check('index.html loads fta_warn_pill.js after fta_view_modules.js', IDX.indexOf('fta_warn_pill.js?v=') > IDX.indexOf('fta_view_modules.js?v='));
check('the pill, the panel and formatNodeActualLine all word their notes through ftaNodeWarnings', /ftaNodeWarnings\(node, isRoot\)/.test(W) && /const w = ftaNodeWarnings\(node, isRoot\);/.test(H));
check('the highlight style exists', /\.node\.fta-warn-hit > path/.test(CSS) && /#fta-warn-pill \.fwp-row\.is-active/.test(CSS));
check('no em dash in what the pill or the notes say', !/—/.test(fnSrc(H, 'ftaNodeWarnings').replace(/\/\/.*$/gm, '')) && !/—/.test(W.replace(/\/\/.*$/gm, '')));

const ctx = { ftaConfig: { mode: 'top-down' }, getActiveFTARoot: () => null, Number, isFinite, Math, String };
vm.createContext(ctx);
vm.runInContext(fnSrc(H, 'ftaNodeWarnings') + '\n' + fnSrc(H, 'formatNodeActualLine'), ctx);
const NW = (n, r) => vm.runInContext('ftaNodeWarnings', ctx)(n, r);
const keys = (n, r) => NW(n, r).map(w => w.key).join(',');
check('a leaf held at the strictest allocation', keys({ type: 'basic', _sharedStrictest: { instances: 3, fromPageName: 'T2' } }) === 'shared-strictest' && /across 3 trees \(from T2\)/.test(NW({ type: 'basic', _sharedStrictest: { instances: 3, fromPageName: 'T2' } })[0].text));
check('a leaf stricter than achievable names both numbers', keys({ type: 'basic', _feasibilityViolation: { achievable: 1e-6, allocated: 1e-9, delta: 1000 } }) === 'feasibility' && /P=1\.00E-6.*P=1\.00E-9.*1000\.0 times/.test(NW({ type: 'basic', _feasibilityViolation: { achievable: 1e-6, allocated: 1e-9, delta: 1000 } })[0].text));
check('a gate with every note it has, not just the first', keys({ type: 'gate', gateType: 'PAND', _probCompromised: true, _dynStatic: { mode: 'bound', reason: 'x' } }) === 'independence,dyn-pand-bound');
check('the top event over its target is a warning with the numbers and the %', (() => { const w = NW({ type: 'gate', gateType: 'OR', probability: 6e-10, _bddActualProb: 6.6e-10 }, true); return w.length === 1 && w[0].key === 'actual-over' && w[0].sev === 'warn' && /P=6\.60E-10 against the target P=6\.00E-10 \(10% over\)/.test(w[0].text); })());
// 27 Oct 2026 (later): an allocation closes at or under its target; any real overshoot is a warning, rounding and margin are not
check('0.5% over the target is a warning too', NW({ type: 'gate', gateType: 'OR', probability: 6e-10, _bddActualProb: 6.03e-10 }, true).map(w => w.key).join() === 'actual-over');
check('rounding (one part in ten million) says nothing', NW({ type: 'gate', gateType: 'OR', probability: 6e-10, _bddActualProb: 6e-10 * (1 + 1e-7) }, true).length === 0);
check('under the target is margin and says nothing', NW({ type: 'gate', gateType: 'OR', probability: 6e-10, _bddActualProb: 3e-10 }, true).length === 0);
check('a refused exact close is a warning on the top event', NW({ type: 'gate', gateType: 'OR', probability: 6e-10, _exactCloseRefused: true }, true).map(w => w.key).join() === 'exact-refused');
check('a prescribed budget over its share is a warning on that gate', /3\.0 times the P=2\.00E-10/.test((NW({ type: 'gate', gateType: 'AND', _prescribedOverallocation: { apportioned: 2e-10, prescribed: 6e-10, excessRatio: 3 } }, false)[0] || {}).text || ''));
check('the exact total is only on the top event', NW({ type: 'gate', gateType: 'OR', probability: 6e-10, _bddActualProb: 9e-10 }, false).length === 0);
check('bottom-up trees have no target to compare', (() => { ctx.ftaConfig.mode = 'bottom-up'; const n = NW({ type: 'gate', gateType: 'OR', probability: 6e-10, _bddActualProb: 9e-10 }, true).length; ctx.ftaConfig.mode = 'top-down'; return n === 0; })());

// ================================================================================ [B]
let pw = null;
for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
if (!pw) { console.log('  note  Playwright is not installed on this machine: [B] did not run'); done(); }

const MUTATE = process.env.SL_FTAWARN_MUTATE === '1';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function serve() {
    return new Promise(res => {
        const srv = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(SITE, path.normalize(p));
            if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
            fs.readFile(f, (e, b) => {
                if (e) { r.writeHead(404); return r.end('not found'); }
                if (MUTATE && path.basename(f) === 'fta_view_modules.js') b = Buffer.from(String(b).replace("SLFtaWarn.afterRender(rootNode, _allDesc);", "void 0;"));
                r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b);
            });
        }).listen(0, '127.0.0.1', () => res(srv));
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let clickRow = null;   // set once the page is up: a real click event on the pill list row

(async () => {
    console.log('\n[B] in the real app' + (MUTATE ? ' (MUTATION: the pill is not refreshed)' : ''));
    const srv = await serve();
    let browser;
    try { browser = await pw.chromium.launch(); }
    catch (e) { console.log('  note  Chromium could not start here: [B] did not run'); srv.close(); done(); }
    try {
        const bctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const pg = await bctx.newPage();
        const errs = []; pg.on('pageerror', e => errs.push(String(e)));
        pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/'); await sleep(3500);
        await pg.evaluate(() => {
            const g = document.getElementById('sl-auth-gate'); if (g) g.remove();
            document.documentElement.classList.remove('sl-auth-gate-blocked');
            document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
        });
        await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(3000);
        clickRow = async key => {
            if (!(await pg.evaluate(() => SLFtaWarn.isOpen()))) { await pg.click('#fta-warn-pill .fwp-btn'); await sleep(150); }
            await pg.waitForSelector('#fta-warn-pill .fwp-row[data-key="' + key + '"]', { timeout: 10000 });
            await pg.evaluate(k => { const r = document.querySelector('#fta-warn-pill .fwp-row[data-key="' + k + '"]'); r.scrollIntoView({ block: 'nearest' }); r.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, key);
        };

        // Two top-down trees: A gets a leaf stricter than achievable (inside a collapsed branch) and
        // a customer-sized budget; B gets a strictest-allocation note that must NOT show on A.
        const setup = await pg.evaluate(async () => {
            const nLeaves = r => { let n = 0; (function w(x) { if (!x) return; const k = x.children || x._children; if (x.type !== 'gate') n++; if (k) k.forEach(w); })(r); return n; };
            const tops = ftaPages.filter(p => p && p.root && p.root.type === 'gate' && /^PASA/.test(p.name) && !/Verification/.test(p.name) && nLeaves(p.root) >= 2 && (p.root.children || []).some(c => c.type === 'gate'));
            const A = tops[0], B = tops[1];
            openFTAPageById(A.id); calculateAllProbabilities();
            const leaves = []; (function w(n) { if (!n) return; const k = n.children || n._children; if (n.type !== 'gate') leaves.push(n); if (k) k.forEach(w); })(A.root);
            const leaf = leaves[leaves.length - 1];
            // collapse the leaf's parent gate so the leaf is not drawn
            const parent = findParentNode(A.root, leaf.id);
            if (parent && parent !== A.root && parent.children) { parent._children = parent.children; parent.children = null; }
            const bLeaf = (function f(n) { if (!n) return null; if (n.type !== 'gate') return n; const k = n.children || n._children || []; for (const c of k) { const r = f(c); if (r) return r; } return null; })(B.root);
            // The engine recomputes on its own timers and rewrites these flags, so the notes this
            // test plants are put back after every recompute (the pill must follow whatever the
            // engine leaves on the nodes, which B5 checks with nothing planted).
            const plant = () => {
                leaf._feasibilityViolation = { achievable: 1e-6, allocated: 1e-9, delta: 1000 };
                bLeaf._sharedStrictest = { instances: 2, fromPageName: 'elsewhere' };
                if (!window.__fwsPlantTop) return;
                // The customer's numbers: a two-digit exponent on every node of A, the top 10% over its target
                (function w(n) { if (!n) return; n.probability = 6e-10; const k = n.children || n._children; if (k) k.forEach(w); })(A.root);
                A.root._bddActualProb = 6.6e-10;
            };
            window.__fwsPlantTop = true;
            window.__fwsOrigCalc = calculateAllProbabilities;
            calculateAllProbabilities = function () { const r = window.__fwsOrigCalc.apply(this, arguments); try { plant(); } catch (_) {} return r; };
            plant();
            updateD3(); fitToScreen();
            await new Promise(r => setTimeout(r, 900));
            return { A: A.id, B: B.id, leafId: leaf.id, collapsed: !!(parent && parent._children), bLeafId: bLeaf.id };
        });
        check('[setup] a flagged leaf sits inside a collapsed branch', setup.collapsed);

        // ---- B1
        const b1 = await pg.evaluate(() => {
            const out = { n: 0, wrap: 0, small: 0, clipped: 0, hits: [], texts: [], extra: 0, fs: [] };
            document.querySelectorAll('#fta-svg g.node').forEach(g => {
                const m = g.querySelector('.inline-metrics'); if (!m || !m.value) return;
                out.n++;
                const fs = parseFloat(getComputedStyle(m).fontSize); out.fs.push(fs);
                if (fs < 7) out.small++;
                if (m.scrollWidth > m.clientWidth + 1) out.clipped++;
                if (/\n/.test(m.value)) out.wrap++;
                out.texts.push(m.value);
                const mr = m.getBoundingClientRect();
                ['.dal-badge', '.node-input-mode-fo', '.voting-k-badge'].forEach(sel => {
                    const e = g.querySelector(sel); if (!e || getComputedStyle(e).display === 'none') return;
                    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
                    if (r.left < mr.right - 1 && r.right > mr.left + 1 && r.top < mr.bottom - 1 && r.bottom > mr.top + 1) out.hits.push(sel);
                });
            });
            out.extra = document.querySelectorAll('#fta-svg .node-actual-line, #fta-svg .node-feasibility-mark').length;
            return out;
        });
        check('B1 every drawn node shows its number line', b1.n >= 3, b1.n + ' nodes');
        check('B1 the line is "P=… · ≈…/FH" with both numbers in full', b1.texts.every(t => /^P=\d\.\d\dE-\d+ · ≈\d\.\d\dE-\d+\/FH$/.test(t)), b1.texts.slice(0, 2).join(' | '));
        check('B1 nothing is cut off (two-digit exponents included)', b1.clipped === 0, b1.clipped + ' clipped');
        check('B1 the font shrank to fit and stays readable (7px or more)', b1.small === 0 && b1.fs.every(f => f < 11.5), b1.fs.slice(0, 3).join('/'));
        check('B1 no badge or dropdown is drawn over the number line', b1.hits.length === 0, b1.hits.join(','));
        check('B1 no Actual line or feasibility mark is drawn on any node', b1.extra === 0);

        // ---- B2
        const b2 = await pg.evaluate(() => {
            const host = document.getElementById('fta-warn-pill'), btn = host.querySelector('.fwp-btn'), list = host.querySelector('.fwp-list');
            const c = document.getElementById('svg-wrap-container').getBoundingClientRect(), r = btn.getBoundingClientRect();
            const rows = [...host.querySelectorAll('.fwp-row')].map(e => e.getAttribute('data-key'));
            return { shown: getComputedStyle(host).display !== 'none', label: btn.textContent, w: r.width, h: r.height,
                     inside: r.left >= c.left && r.right <= c.right && r.bottom <= c.bottom && r.bottom >= c.bottom - 40,
                     listHidden: getComputedStyle(list).display === 'none', rows };
        });
        check('B2 the pill shows, inside the canvas at the bottom', b2.shown && b2.inside);
        check('B2 it is small (a pill, not a bar)', b2.w <= 120 && b2.h <= 34, Math.round(b2.w) + 'x' + Math.round(b2.h));
        check('B2 it counts the warnings: "\u26a0 2"', b2.label === '\u26a0 2', b2.label);
        check('B2 the list stays closed until the pill is clicked', b2.listHidden);
        await pg.click('#fta-warn-pill .fwp-btn'); await sleep(200);
        const b2o = await pg.evaluate(() => { const l = document.querySelector('#fta-warn-pill .fwp-list'); const r = l.getBoundingClientRect(), c = document.getElementById('svg-wrap-container').getBoundingClientRect(); return { open: getComputedStyle(l).display !== 'none', fits: r.top >= c.top && r.left >= c.left && r.right <= c.right }; });
        check('B2 a click opens the list, fully inside the canvas', b2o.open && b2o.fits, JSON.stringify(b2o));
        check('B2 it lists this tree\'s warnings', b2.rows.includes('feasibility') && b2.rows.includes('actual-over'), b2.rows.join(','));
        check('B2 and none from another tree', !b2.rows.includes('shared-strictest'), b2.rows.join(','));
        await pg.keyboard.press('Escape'); await sleep(100);
        check('B2 Esc closes the list', await pg.evaluate(() => !SLFtaWarn.isOpen() && getComputedStyle(document.querySelector('#fta-warn-pill .fwp-list')).display === 'none'));
        await pg.click('#fta-warn-pill .fwp-btn'); await sleep(100);
        await pg.mouse.click(5, 5); await sleep(100);
        check('B2 a click outside closes the list', await pg.evaluate(() => !SLFtaWarn.isOpen()));
        const b2b = await pg.evaluate(async (s) => { openFTAPageById(s.B); await new Promise(r => setTimeout(r, 400)); const rows = [...document.querySelectorAll('#fta-warn-pill .fwp-row')].map(r => r.getAttribute('data-key')); openFTAPageById(s.A); await new Promise(r => setTimeout(r, 400)); return rows; }, setup);
        check('B2 the other tree\'s pill lists its own and not this one\'s', b2b.includes('shared-strictest') && !b2b.includes('feasibility'), b2b.join(','));

        // ---- B3
        await clickRow('feasibility'); await sleep(800);
        const b3 = await pg.evaluate((s) => {
            const hit = [...document.querySelectorAll('#fta-svg g.node.fta-warn-hit')].map(g => d3.select(g).datum().data.id);
            const row = document.querySelector('#fta-warn-pill .fwp-row[data-key="feasibility"]');
            return { key: SLFtaWarn.activeKey(), hit, active: row && row.classList.contains('is-active'), want: s.leafId };
        }, setup);
        check('B3 the click highlights exactly the flagged node', b3.hit.length === 1 && b3.hit[0] === b3.want, JSON.stringify(b3.hit));
        check('B3 its branch was opened so it can be seen', b3.hit.length === 1);
        check('B3 the row shows it is the active one', b3.key === 'feasibility' && b3.active);
        const inView = await pg.evaluate(() => { const g = document.querySelector('#fta-svg g.node.fta-warn-hit'); if (!g) return false; const r = g.getBoundingClientRect(), c = document.getElementById('svg-wrap-container').getBoundingClientRect(); return r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom; });
        check('B3 the view moved so the node is on screen', inView);
        await clickRow('actual-over'); await sleep(500);
        const b3b = await pg.evaluate(() => ({ hit: [...document.querySelectorAll('#fta-svg g.node.fta-warn-hit')].map(g => d3.select(g).datum().data), root: getActiveFTARoot() }));
        check('B3 another row moves the highlight to its own nodes (the top event)', await pg.evaluate(() => { const h = [...document.querySelectorAll('#fta-svg g.node.fta-warn-hit')].map(g => d3.select(g).datum().data); return h.length === 1 && h[0] === getActiveFTARoot(); }));
        await pg.evaluate(() => { updateD3(); }); await sleep(300);
        check('B3 the highlight survives a re-render', await pg.evaluate(() => document.querySelectorAll('#fta-svg g.node.fta-warn-hit').length === 1));
        await clickRow('actual-over'); await sleep(300);
        check('B3 a second click clears it', await pg.evaluate(() => !SLFtaWarn.activeKey() && document.querySelectorAll('#fta-svg g.node.fta-warn-hit').length === 0));
        await clickRow('feasibility'); await sleep(600);
        // an empty spot of canvas: the svg itself is the topmost element there
        const box = await pg.evaluate(() => {
            const svgEl = document.getElementById('fta-svg'), c = svgEl.getBoundingClientRect();
            for (let y = c.top + 30; y < c.bottom - 30; y += 23) for (let x = c.left + 30; x < c.right - 30; x += 29) {
                if (document.elementFromPoint(x, y) === svgEl) { window.__fwsBg = true; return { x, y }; }
            }
            window.__fwsBg = false; return { x: 0, y: 0 };
        });
        await pg.mouse.click(box.x, box.y); await sleep(300);
        const bg = await pg.evaluate(() => window.__fwsBg);
        check('B3 a click on empty canvas clears it', bg && await pg.evaluate(() => !SLFtaWarn.activeKey() && document.querySelectorAll('#fta-svg g.node.fta-warn-hit').length === 0), bg ? '' : 'that spot was not empty canvas');

        // ---- B4
        const b4 = await pg.evaluate((s) => {
            const leaf = findNode(getActiveFTARoot(), s.leafId);
            openNodePropertiesModal(leaf);
            const h = document.getElementById('config-node-warnings');
            const a = { shown: getComputedStyle(h).display !== 'none', text: h.innerText };
            const root = getActiveFTARoot(); openNodePropertiesModal(root);
            const b = { shown: getComputedStyle(h).display !== 'none', text: h.innerText };
            const plain = (function f(n) { if (!n) return null; if (n !== root && n.id !== s.leafId && ftaNodeWarnings(n, false).length === 0) return n; const k = n.children || n._children || []; for (const c of k) { const r = f(c); if (r) return r; } return null; })(root);
            openNodePropertiesModal(plain);
            const c = { shown: getComputedStyle(h).display !== 'none' };
            closeNodeConfigModal && closeNodeConfigModal();
            return { a, b, c };
        }, setup);
        check('B4 the flagged leaf\'s box says it in full', b4.a.shown && /can achieve P=1\.00E-6.*budget is P=1\.00E-9/.test(b4.a.text), b4.a.text);
        check('B4 the top event\'s box shows Actual against the target', b4.b.shown && /Actual \(exact\): P=6\.60E-10 against the target P=6\.00E-10 \(10% over\)/.test(b4.b.text), b4.b.text);
        check('B4 a node with nothing to say shows no block', !b4.c.shown);

        // ---- B5 the real engine: the pill follows what calculateAllProbabilities leaves on the top event
        const b5 = await pg.evaluate(async () => {
            calculateAllProbabilities = window.__fwsOrigCalc; window.__fwsPlantTop = false;
            calculateAllProbabilities(); updateD3(); await new Promise(r => setTimeout(r, 300));
            const r = getActiveFTARoot();
            const want = SLFtaWarn.collect(r).map(g => g.key).sort().join(',');
            const got = [...document.querySelectorAll('#fta-warn-pill .fwp-row')].map(e => e.getAttribute('data-key')).sort().join(',');
            const shown = getComputedStyle(document.getElementById('fta-warn-pill')).display !== 'none';
            return { want, got, shown };
        });
        check('B5 after a real recompute the pill matches the tree exactly', b5.want === b5.got && b5.shown === !!b5.want, JSON.stringify(b5));
        check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    } catch (e) {
        check('[B] ran without throwing', false, String(e && e.stack || e).slice(0, 400));
    } finally {
        try { await browser.close(); } catch (_) {}
        srv.close();
        done();
    }
})();
