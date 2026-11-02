/* regression_fta_loops_20261101.test.js: circular transfers give no number anywhere (customer checklist item 45).
 *
 * Waqas, 1 Nov 2026: "no number is the way to go". A transfer gate hands its branch to another tree; when trees hand on
 * to each other in a circle (A -> B -> A) no fault tree can be calculated around it. The engine used to stop at a tree
 * it had already visited, so where the circle was cut depended on the starting tree and the same system could show two
 * numbers. Now:
 *   [A] the engine refuses (getCutsets, the exact diagram on the page and in the engine copy, the worker flattening)
 *       with CircularTransferError, the circle named in order; a tree that does not reach the circle is untouched;
 *   [B] SLFtaLoops finds every circle (Tarjan), the trees that transfer into one, and stamps the nodes that depend on it
 *       (on an allocation tree, every budget, leaves included);
 *   [C] in the app: the canvas shows "No result: circular transfer", the transfer on the circle is drawn red, the warning
 *       pill names the path, the exact top is null, the cut set panel shows no number, the Golden Thread draws a red
 *       broken link with the path and the failure condition says no valid result, the budget ledger says so, AutoReq
 *       makes no requirement from a loop budget; breaking the circle brings the numbers back.
 * MUTATION PROOFS: SL_LOOP_MUTATE=engine (the engines do not refuse), =stamp (the calculation does not stamp),
 * =thread (no broken link on the Golden Thread) must fail.
 * Run: node tests/regression_fta_loops_20261101.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const MUT = process.env.SL_LOOP_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'engine' && (file === 'fta_engine.js' || file === 'fta_quant_modules.js')) return body.replace("        _refuseLoop(node);   // 1 Nov 2026", "        void 0;   // 1 Nov 2026").replace(/    if \(typeof _refuseLoop === 'function'\) _refuseLoop\(scopeRoot \|\| rootNode\);/g, '    void 0;');
    if (MUT === 'stamp' && file === 'fta_quant_modules.js') return body.replace("try { if (typeof window !== 'undefined' && window.SLFtaLoops) window.SLFtaLoops.stamp(); } catch (_) {}", '');
    if (MUT === 'thread' && file === 'fta_view_modules.js') return body.replace('if(L){ L.broken = true; L.why = why; }', '');
    return body;
}
const read = f => mutate(f, fs.readFileSync(path.join(SITE, f), 'utf8'));
const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
check('index.html loads fta_loops.js before fta_quant_modules.js, and the bumped engine pair', HTML.indexOf('fta_loops.js?v=1.0') > 0 && HTML.indexOf('fta_loops.js?v=') < HTML.indexOf('fta_quant_modules.js?v=') && /fta_engine\.js\?v=1\.13/.test(HTML) && /importScripts\('fta_engine\.js\?v=1\.13'\)/.test(fs.readFileSync(path.join(SITE, 'fta_worker.js'), 'utf8')));

// ---------------------------------------------------------------------------- [A] the engine
console.log('\n[A] the engine refuses a circle');
let nid = 1;
const be = (p) => ({ id: 'e' + (nid++), type: 'basic', probability: p, name: 'E', children: [] });
const g = (gt, kids) => ({ id: 'g' + (nid++), type: 'gate', gateType: gt, name: 'G', children: kids });
const T = (to) => ({ id: 't' + (nid++), type: 'gate', gateType: 'TRANSFER', transferOutTo: to, name: 'T', children: [] });
function pagesWithLoop() {
    nid = 1;
    return [
        { id: 'PA', name: 'Tree A', root: g('OR', [be(1e-5), T('PB')]) },
        { id: 'PB', name: 'Tree B', root: g('AND', [be(1e-3), T('PA')]) },
        { id: 'PC', name: 'Tree C', root: g('OR', [be(2e-6), be(3e-6)]) },
        { id: 'PD', name: 'Tree D', root: g('OR', [be(1e-6), T('PB')]) }
    ];
}
function ctxWith(files) {
    const p = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, parseInt, Date, Int32Array, Float64Array, Uint32Array, Uint8Array, Promise, Error, RangeError, TypeError,
        setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, performance: { now: () => Date.now() },
        document: { readyState: 'complete', addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }) },
        localStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: { userAgent: 'node' }, SEVERITY_RANK: {}, projectConfig: {}, acFhaData: [], systemsData: [], invRegister() {} };
    p.window = p; p.self = p; p.globalThis = p;
    vm.createContext(p);
    files.forEach(f => vm.runInContext(read(f), p, { filename: f }));
    return p;
}
{
    const P = ctxWith(['fta_engine.js', 'fta_quant_modules.js', 'engine_modules.js']);
    const pages = pagesWithLoop(); P.__pages = pages;
    vm.runInContext('var ftaPages = __pages;', P);
    const E = P.SLFTAEngine;
    const tryIt = fn => { try { const v = fn(); return { ok: true, v }; } catch (e) { return { ok: false, name: e && e.name, msg: e && e.message, loop: e && e.loop }; } };
    const cs = tryIt(() => P.getCutsets(pages[0].root));
    check('getCutsets refuses a tree on a circle, naming it in order', !cs.ok && cs.name === 'CircularTransferError' && /Tree A → Tree B → Tree A/.test(cs.msg), JSON.stringify(cs));
    const ex = tryIt(() => P.computeExactProbability(pages[0].root));
    check('the page\'s exact probability (fta_quant_modules) refuses it', !ex.ok && ex.name === 'CircularTransferError', JSON.stringify(ex));
    const exE = tryIt(() => E.computeExactProbability(pages[0].root));
    check('the engine copy of the exact probability refuses it too', !exE.ok && exE.name === 'CircularTransferError', JSON.stringify(exE));
    const lead = tryIt(() => P.computeExactProbability(pages[3].root));
    check('a tree that transfers INTO the circle has no result either', !lead.ok && lead.name === 'CircularTransferError', JSON.stringify(lead));
    const fl = tryIt(() => E.flattenTransfers(pages[0].root, pages));
    check('the worker never gets a tree cut open at the circle', !fl.ok && fl.name === 'CircularTransferError', JSON.stringify(fl));
    const c = tryIt(() => P.computeExactProbability(pages[2].root).prob);
    check('a tree that does not reach the circle still calculates (1 - (1-2e-6)(1-3e-6))', c.ok && Math.abs(c.v - (1 - (1 - 2e-6) * (1 - 3e-6))) < 1e-15, JSON.stringify(c));
    check('exactTopProbability (the cache every verdict reads) refuses and caches nothing', tryIt(() => P.exactTopProbability(pages[0].root)).ok === false && tryIt(() => P.exactTopProbability(pages[0].root)).ok === false);
}

// ---------------------------------------------------------------------------- [B] SLFtaLoops
console.log('\n[B] SLFtaLoops');
{
    const L = require(path.join(SITE, 'fta_loops.js'));
    const pages = pagesWithLoop();
    pages.push({ id: 'PS', name: 'Self', root: g('OR', [T('PS')]) });
    pages[0].mode = 'bottom-up'; pages[1].mode = 'bottom-up'; pages[3].mode = 'top-down';
    const a = L.stamp(pages);
    check('every circle is found once, read from the first tree in the project', a.loops.map(L.path).join(' | ') === 'Tree A → Tree B → Tree A | Self → Self', a.loops.map(L.path).join(' | '));
    check('trees on a circle and trees that transfer into one depend on it; the others do not', ['PA', 'PB', 'PD', 'PS'].every(id => a.tainted.has(id)) && !a.tainted.has('PC'));
    const tA = pages[0].root.children[1], tD = pages[3].root.children[1];
    check('a transfer ON the circle is marked inLoop, one leading into it is not', tA._circular && tA._circular.inLoop === true && tD._circular && tD._circular.inLoop === false);
    check('on a verification tree, the gate above the transfer has no result and the leaf keeps its own input', pages[0].root._circular && !pages[0].root.children[0]._circular);
    check('on an allocation tree that depends on a circle, every budget has no result, leaves included', pages[3].root._circular && pages[3].root.children[0]._circular && pages[3].root.children[0]._circular.budget === true);
    check('a tree that does not reach the circle is not stamped', !pages[2].root._circular && !pages[2].root.children[0]._circular);
    check('loopFor and the one sentence every screen uses', L.path(L.loopFor('PD', pages)) === 'Tree A → Tree B → Tree A' && /^No result: this depends on a circular transfer \(Tree A → Tree B → Tree A\)\. A fault tree cannot be calculated around a circle\. Break the circle and the results come back\.$/.test(L.message(L.loopFor('PA', pages))));
    pages[1].root.children.pop();   // break the circle
    const b = L.stamp(pages);
    check('breaking the circle clears every stamp', !b.tainted.has('PA') && !pages[0].root._circular && !tA._circular && !pages[3].root.children[0]._circular);
    check('no em dash in what fta_loops.js says', !/—/.test(fs.readFileSync(path.join(SITE, 'fta_loops.js'), 'utf8').replace(/\/\/.*$/gm, '')));
}

// ---------------------------------------------------------------------------- [C] in the app
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const done = () => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); };
    if (!pw) { console.log('  note  Playwright is not installed: [C] did not run'); return done(); }
    console.log('\n[C] in the app' + (MUT ? ' (MUTATION ' + MUT + ')' : ''));
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
        const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errs = []; pg.on('pageerror', e => errs.push(String(e && e.message || e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await sleep(3500);
        await pg.evaluate(() => { const gt = document.getElementById('sl-auth-gate'); if (gt) gt.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); });
        await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(3000);
        const r = await pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const out = {};
            const linked = p => (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
            const cands = ftaPages.filter(p => p && p.root && p.root.type === 'gate' && !p.verifies && linked(p).length && (acFhaData || []).some(f => linked(p).map(String).includes(String(f.internalId))));
            const A = cands[0], B = ftaPages.find(p => p && p.root && p.root.type === 'gate' && p !== A && !p.verifies);
            out.names = [A && A.name, B && B.name];
            const tAB = { id: 'loop-t-ab', displayId: 'TR-AB', type: 'gate', gateType: 'TRANSFER', transferOutTo: B.id, name: 'Goes to B', children: [] };
            const tBA = { id: 'loop-t-ba', displayId: 'TR-BA', type: 'gate', gateType: 'TRANSFER', transferOutTo: A.id, name: 'Back to A', children: [] };
            (A.root.children = A.root.children || []).push(tAB);
            (B.root.children = B.root.children || []).push(tBA);
            openFTAPageById(A.id); calculateAllProbabilities(); if (typeof updateD3 === 'function') updateD3(A.root);
            await wait(900);
            const first = ftaPages.indexOf(A) < ftaPages.indexOf(B) ? A : B, second = first === A ? B : A;   // a circle reads from the tree that comes first in the project
            const expected = first.name + ' \u2192 ' + second.name + ' \u2192 ' + first.name;
            out.expected = expected;
            const metric = id => { const el = Array.from(document.querySelectorAll('#fta-canvas .node, svg .node')).find(n => n.__data__ && n.__data__.data && n.__data__.data.id === id); return el ? { text: (el.querySelector('.inline-metrics') || {}).value, cls: el.getAttribute('class') } : null; };
            out.rootMetric = metric(A.root.id);
            out.transferMetric = metric('loop-t-ab');
            out.rootStamp = !!A.root._circular;
            out.warnT = ftaNodeWarnings(tAB, false);
            out.warnRoot = ftaNodeWarnings(A.root, true);
            out.exactTop = SLTopBasis.exactTop(A.root);
            // the cut set panel
            try { generateCutsetReport(); } catch (e) { out.cutErr = String(e && e.message); }
            await wait(1500);
            const sm = document.getElementById('cutset-summary'); out.cutSummary = sm ? sm.textContent : null;
            // the Golden Thread
            const fcId = linked(A).map(String).find(id => (acFhaData || []).some(f => String(f.internalId) === id));
            const graph = _gtvBuildGraph({});
            out.broken = graph.links.filter(l => l.broken).map(l => l.s + '>' + l.t + ' ' + l.why);
            const fcNode = graph.nodes.find(n => n.kind === 'fc' && n.ref && String(n.ref.id) === String(fcId));
            out.fcFlag = fcNode ? [fcNode.flag, fcNode.flagReason] : null;
            out.ftaFlag = (graph.nodes.find(n => n.kind === 'fta' && String(n.id) === String(A.id)) || {}).flag;
            try { const svg = (function () { if (!(window.GT_THREAD && typeof window.GT_THREAD.render === 'function')) return null; const host = document.createElement('div'); document.body.appendChild(host); window.GT_THREAD.render(host, graph); const h = host.innerHTML; host.remove(); return h; })(); out.svgBroken = svg ? (/data-gt-broken="1"/.test(svg) && /NO RESULT/.test(svg)) : 'no renderer'; } catch (e) { out.svgBroken = 'ERR ' + e.message; }
            // the budget ledger
            try { out.ledger = budgetLedgerRows().filter(x => x.allocPage && String(x.allocPage.id) === String(A.id)).map(x => [x.status, x.circular]); } catch (e) { out.ledger = 'ERR ' + e.message; }
            // AutoReq never makes a requirement from a budget that depends on the circle
            try { const m = AutoReq.generate({ ftaEvent: true }, 'ac'); const all = (m.isNew || []).concat((m.isUpdated || []).map(u => u.next)); const lids = new Set(); (function w(n) { if (!n) return; if (n.type !== 'gate') lids.add(String(n.logicalId != null ? n.logicalId : n.id)); (n.children || n._children || []).forEach(w); })(A.root); out.loopReqs = all.filter(c => c && c.reqSource && c.reqSource.generator === 'fta-event' && lids.has(String(c.reqSource.sourceId != null ? c.reqSource.sourceId : ''))).length; out.leafStamped = (function f(n) { if (!n) return true; if (n.type !== 'gate' && A.mode !== 'bottom-up') return !!n._circular; return (n.children || []).every(f); })(A.root); } catch (e) { out.loopReqs = 'ERR ' + e.message; }
            // break the circle: the numbers come back
            B.root.children = B.root.children.filter(c => c !== tBA);
            calculateAllProbabilities(); if (typeof updateD3 === 'function') updateD3(A.root); await wait(700);
            out.after = { metric: metric(A.root.id), stamp: !!A.root._circular, exact: SLTopBasis.exactTop(A.root), broken: _gtvBuildGraph({}).links.filter(l => l.broken).length };
            A.root.children = A.root.children.filter(c => c !== tAB);
            return out;
        });
        const E = r.expected;
        check('the top event of a tree on the circle shows "No result: circular transfer", in red', r.rootMetric && r.rootMetric.text === 'No result: circular transfer' && /fta-circular/.test(r.rootMetric.cls || ''), JSON.stringify(r.rootMetric) + ' ' + JSON.stringify(r.names));
        check('the transfer on the circle is drawn red', r.transferMetric && /fta-circular-in/.test(r.transferMetric.cls || ''), JSON.stringify(r.transferMetric));
        check('its warning names the whole circle', r.warnT.some(w => w.key === 'circular-transfer' && w.sev === 'warn' && w.text.indexOf(E) !== -1), JSON.stringify(r.warnT));
        check('the top event says why it has no number, and nothing else about its exact total', r.warnRoot.some(w => w.key === 'circular-result' && w.text.indexOf(E) !== -1) && !r.warnRoot.some(w => w.key === 'exact-refused'), JSON.stringify(r.warnRoot));
        check('no exact top, so no verdict anywhere', r.exactTop === null, String(r.exactTop));
        check('the cut set panel says no result, with the circle, and shows no number', r.cutSummary && /No result: circular transfer/.test(r.cutSummary) && r.cutSummary.indexOf(E) !== -1 && !/\d\.\d+E-\d/i.test(r.cutSummary), (r.cutSummary || '') + ' ' + (r.cutErr || ''));
        check('the Golden Thread draws the circle as a broken link with the path', r.broken.length >= 2 && r.broken.every(b => b.indexOf(E) !== -1), JSON.stringify(r.broken));
        check('the failure condition shows no valid result, and the tree is flagged', r.fcFlag && r.fcFlag[0] === 'circular' && /No valid result/.test(r.fcFlag[1]) && r.ftaFlag === 'circular', JSON.stringify(r.fcFlag) + ' ' + r.ftaFlag);
        check('the thread picture shows the broken link and NO RESULT', r.svgBroken === true, String(r.svgBroken));
        check('the budget ledger says no result: circular transfer', Array.isArray(r.ledger) && r.ledger.length > 0 && r.ledger.every(x => x[0] === 'no-result-circular' && x[1] === E), JSON.stringify(r.ledger));
        check('no requirement is made from a budget that depends on the circle', r.loopReqs === 0 && r.leafStamped === true, String(r.loopReqs) + ' ' + r.leafStamped);
        check('breaking the circle brings the numbers back', r.after.metric && /P=/.test(r.after.metric.text || '') && !r.after.stamp && typeof r.after.exact === 'number' && r.after.broken === 0, JSON.stringify(r.after));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) { check('test crashed: ' + (e && e.stack || e), false); }
    finally { await browser.close(); srv.close(); }
    done();
})();
