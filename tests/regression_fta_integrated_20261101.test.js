/* regression_fta_integrated_20261101.test.js: integrated trees (customer checklist item 42).
 *
 * Waqas, 1 Nov 2026: "we should allow the user to create an integrated tree which is a read only tree". The engineer picks
 * a top event and names it; the app follows every transfer and builds the whole tree in one piece. It is read only,
 * rebuilds itself when a source changes, has its own results, goes into reports, and sits on the Golden Thread linked
 * to its failure condition and to every tree it is built from. It is never built through a circular transfer.
 * Checked: the dialog builds it; its exact top equals the source's (same events, each counted once); every edit is
 * refused and an edit that slips through is rebuilt away; a source change reaches it on the next calculation and an
 * unchanged project never rebuilds it; it sits under its source in the sidebar with its badge; it is on the thread; it
 * prints; it adds no requirement and no cross-tree "strictest" mark; a circle gives it no result and breaking the
 * circle brings it back.
 * MUTATION PROOFS: SL_INT_MUTATE=refresh (the calculation does not rebuild it), =guard (edits are not refused),
 * =exclude (the cross-tree strictest pass counts it as another tree), =autoreq (AutoReq walks it) must fail.
 * Run: node tests/regression_fta_integrated_20261101.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const MUT = process.env.SL_INT_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'refresh' && file === 'fta_quant_modules.js') return body.replace("try { if (typeof window !== 'undefined' && window.SLFtaIntegrated) window.SLFtaIntegrated.refresh(); } catch (_) {}", '');
    if (MUT === 'guard' && file === 'fta_integrated.js') return body.replace('function _wrapGlobals() {', 'function _wrapGlobals() { return;');
    if (MUT === 'autoreq' && file === 'assurance_modules.js') return body.replace("return !(page && page.integrated) && _pageScopeKey(page) === scope;", "return _pageScopeKey(page) === scope;").replace("filter(p => p && !p.verifies && !p.integrated);", "filter(p => p && !p.verifies);").replace("            if (page && page.integrated) return;", "");
    if (MUT === 'exclude' && file === 'event_reuse.js') return body.replace(".filter(function (p) { return !(p && p.integrated && p.integrated.sourcePageId != null); })", '');
    return body;
}
const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
check('index.html loads fta_integrated.js after fta_loops.js and before fta_quant_modules.js', HTML.indexOf('fta_integrated.js?v=1.0') > HTML.indexOf('fta_loops.js?v=') && HTML.indexOf('fta_integrated.js?v=') < HTML.indexOf('fta_quant_modules.js?v='));
check('the tree picker has the "+ Integrated Tree" button beside + New (fta_tree_picker.js v1.4)', /fta_tree_picker\.js\?v=1\.\d+/.test(HTML) && /ib\.textContent = '\+ Integrated Tree';/.test(fs.readFileSync(path.join(SITE, 'fta_tree_picker.js'), 'utf8')));
check('no em dash in what fta_integrated.js says', !/—/.test(fs.readFileSync(path.join(SITE, 'fta_integrated.js'), 'utf8').replace(/\/\/.*$/gm, '')));

(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const done = () => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); };
    if (!pw) { console.log('  note  Playwright is not installed: the app checks did not run'); return done(); }
    console.log('\nin the app' + (MUT ? ' (MUTATION ' + MUT + ')' : ''));
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
        await pg.evaluate(() => { try { switchTab('fta'); } catch (_) {} }); await sleep(800);
        // a source tree A that transfers into B (two transfers into B: B's events must still be counted once)
        const setup = await pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const linked = p => (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
            const A = ftaPages.find(p => p && p.root && p.root.type === 'gate' && !p.verifies && linked(p).length && (acFhaData || []).some(f => linked(p).map(String).includes(String(f.internalId))));
            const B = ftaPages.find(p => p && p.root && p.root.type === 'gate' && p !== A && !p.verifies && (p.root.children || []).length);
            A.root.children.push({ id: 'int-t1', displayId: 'TR-I1', type: 'gate', gateType: 'TRANSFER', transferOutTo: B.id, name: 'To B', children: [] });
            A.root.children.push({ id: 'int-t2', displayId: 'TR-I2', type: 'gate', gateType: 'TRANSFER', transferOutTo: B.id, name: 'To B again', children: [] });
            openFTAPageById(A.id); calculateAllProbabilities(); await wait(400);
            const strictBefore = (function () { let n = 0; ftaPages.forEach(p => (function w(x) { if (!x) return; if (x._sharedStrictest) n++; (x.children || x._children || []).forEach(w); })(p.root)); return n; })();
            const reqsBefore = (function () { try { const m = AutoReq.generate({ ftaEvent: true }, 'ac'); return (m.isNew || []).length + (m.isUpdated || []).length + (m.unchanged ? m.unchanged.length : 0); } catch (e) { return 'ERR ' + e.message; } })();
            let toB = 0; (function w(n) { if (!n) return; if ((n.gateType === 'TRANSFER' || n.transferOutTo) && String(n.transferOutTo || n.linkedPageId) === String(B.id)) toB++; (n.children || n._children || []).forEach(w); })(A.root);
            return { A: A.id, B: B.id, An: A.name, Bn: B.name, pages: ftaPages.length, strictBefore, reqsBefore, toB };
        });
        // the dialog
        await pg.evaluate(() => SLFtaIntegrated.open()); await sleep(200);
        const dlg = await pg.evaluate((s) => { const sel = document.querySelector('#sl-int-modal [data-int-src]'); return { open: !!document.getElementById('sl-int-modal'), hasA: !!sel && [...sel.options].some(o => o.value === String(s.A)), suggested: (document.querySelector('#sl-int-modal [data-int-name]') || {}).value }; }, setup);
        check('the dialog opens, offers the tree with transfers and suggests a name', dlg.open && dlg.hasA && /\(integrated\)$/.test(dlg.suggested || ''), JSON.stringify(dlg));
        await pg.selectOption('#sl-int-modal [data-int-src]', String(setup.A));
        await pg.fill('#sl-int-modal [data-int-name]', 'Whole tree, integrated');
        await pg.click('#sl-int-modal [data-int-build]'); await sleep(1200);
        const r = await pg.evaluate(async (s) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const out = {};
            const ip = ftaPages.find(p => p && p.integrated && p.name === 'Whole tree, integrated');
            out.made = !!ip; if (!ip) return out;
            out.active = activeFTAPageId === ip.id;
            out.sources = ip.integrated.sources;
            const A = ftaPages.find(p => p.id === s.A), B = ftaPages.find(p => p.id === s.B);
            let leaves = 0, transfers = 0, bLids = new Set(), bCopies = 0;
            const bLeafIds = new Set(); (function w(n) { if (!n) return; if (n.type !== 'gate') bLeafIds.add(String(n.logicalId != null ? n.logicalId : n.id)); (n.children || n._children || []).forEach(w); })(B.root);
            (function w(n) { if (!n) return; if (n.gateType === 'TRANSFER' || n.transferOutTo) transfers++; if (n.type !== 'gate') { leaves++; const l = String(n.logicalId); if (bLeafIds.has(l)) { bCopies++; bLids.add(l); } } (n.children || []).forEach(w); })(ip.root);
            out.shape = { leaves, transfers, bCopies, bDistinct: bLids.size, bLeaves: bLeafIds.size };
            out.exactInt = SLTopBasis.exactTop(ip.root); out.exactSrc = SLTopBasis.exactTop(A.root);
            out.banner = (document.getElementById('sl-int-banner') || {}).textContent || '';
            out.locked = document.body.classList.contains('sl-fta-integrated') && getComputedStyle(document.querySelector('.fta-toolbar')).display === 'none';
            // edits are refused
            const before = JSON.stringify(ip.root, (k, v) => k.charAt(0) === '_' ? undefined : v);
            const leaf = (function f(n) { if (!n) return null; if (n.type !== 'gate') return n; for (const c of (n.children || [])) { const x = f(c); if (x) return x; } return null; })(ip.root);
            selectNode(leaf); await wait(100);
            try { deleteSelectedNode(); } catch (_) {}
            try { addTopEvent(); } catch (_) {}
            calculateAllProbabilities(); await wait(100);
            out.afterRefused = JSON.stringify(ip.root, (k, v) => k.charAt(0) === '_' ? undefined : v) === before;
            // an edit that slips past the locks is rebuilt away
            const leaf2 = (function f(n) { if (!n) return null; if (n.type !== 'gate') return n; for (const c of (n.children || [])) { const x = f(c); if (x) return x; } return null; })(ip.root);
            leaf2.name = 'HACKED'; leaf2.probability = 0.5;
            calculateAllProbabilities(); await wait(100);
            out.slipped = JSON.stringify(ip.root).indexOf('HACKED') === -1;
            // unchanged: never rebuilt
            out.idle = [SLFtaIntegrated.refresh(), SLFtaIntegrated.refresh()];
            calculateAllProbabilities(); out.idle.push(SLFtaIntegrated.refresh());
            // a source change reaches it
            const bLeaf = (function f(n) { if (!n) return null; if (n.type !== 'gate') return n; for (const c of (n.children || n._children || [])) { const x = f(c); if (x) return x; } return null; })(B.root);
            const lid = String(bLeaf.logicalId != null ? bLeaf.logicalId : bLeaf.id);
            bLeaf.probability = 3.3e-3; bLeaf.name = 'Changed on B';
            calculateAllProbabilities(); await wait(100);
            const copies = []; (function w(n) { if (!n) return; if (n.type !== 'gate' && String(n.logicalId) === lid) copies.push([n.name, n.probability]); (n.children || []).forEach(w); })(ip.root);
            out.followed = copies; out.bNow = bLeaf.probability; out.exactInt2 = SLTopBasis.exactTop(ip.root); out.exactSrc2 = SLTopBasis.exactTop(A.root);
            // the tree picker
            try { if (window.SL_FTA_PICKER) window.SL_FTA_PICKER.render(true); } catch (_) {}
            await wait(300);
            const opts = [...document.querySelectorAll('#fta-tree-pick option')].map(o => o.textContent);
            out.sidebar = opts.filter(t => /Whole tree, integrated/.test(t));
            out.sbDebug = { n: opts.length, button: !!document.getElementById('fta-tree-integrated') };
            // thread
            const g = _gtvBuildGraph({});
            const ik = 'fta:' + ip.id;
            out.thread = { node: !!g.nodes.find(n => n.key === ik && /Integrated/.test(n.sub)), fromFc: g.links.some(l => l.t === ik && /^fc:/.test(l.s)), fromSources: ip.integrated.sources.every(sid => g.links.some(l => l.s === 'fta:' + sid && l.t === ik)) };
            // print
            try { const plan = SLFtaPrint.plan([ip]); out.print = plan && plan.length > 0 && plan.every(sh => /<svg/.test(sh.svg || '')); } catch (e) { out.print = 'ERR ' + e.message; }
            // nothing generated or counted twice
            openFTAPageById(s.A); calculateAllProbabilities(); await wait(200);   // the strictest pass runs on an allocation tree's calculation
            out.strictAfter = (function () { let n = 0; ftaPages.forEach(p => (function w(x) { if (!x) return; if (x._sharedStrictest) n++; (x.children || x._children || []).forEach(w); })(p.root)); return n; })();
            out.reqFromInt = (function () { try { let hits = 0, n = 0; ['ac'].concat((systemsData || []).map(x => x.id)).forEach(sc => { const m = AutoReq.generate({ fha: true, ftaEvent: true, dalgebra: true, gateIndependence: true }, sc); const all = (m.isNew || []).concat((m.isUpdated || []).map(u => u.next)).concat(m.unchanged || []); n += all.length; all.forEach(x => { if (JSON.stringify(x).indexOf(ip.id) !== -1) hits++; }); }); return { hits, n }; } catch (e) { return 'ERR ' + e.message; } })();
            out.reqsAfter = (function () { try { const m = AutoReq.generate({ ftaEvent: true }, 'ac'); return (m.isNew || []).length + (m.isUpdated || []).length + (m.unchanged ? m.unchanged.length : 0); } catch (e) { return 'ERR ' + e.message; } })();
            openFTAPageById(ip.id); calculateAllProbabilities(); await wait(200);
            // a circle: no result; broken: back
            B.root.children.push({ id: 'int-back', displayId: 'TR-BK', type: 'gate', gateType: 'TRANSFER', transferOutTo: A.id, name: 'Back to A', children: [] });
            calculateAllProbabilities(); if (typeof updateD3 === 'function') updateD3(); await wait(500);
            out.circle = { blocked: ip.integrated.blocked || null, exact: SLTopBasis.exactTop(ip.root), banner: (document.getElementById('sl-int-banner') || {}).textContent || '', metric: formatNodeMetrics({ data: ip.root }) };
            B.root.children = B.root.children.filter(c => c.id !== 'int-back');
            calculateAllProbabilities(); await wait(200);
            out.unblocked = { blocked: ip.integrated.blocked || null, exact: SLTopBasis.exactTop(ip.root) };
            return out;
        }, setup);
        check('Build makes the integrated tree and opens it', r.made && r.active, JSON.stringify(r).slice(0, 300));
        check('it is built from the source and every tree it transfers into', Array.isArray(r.sources) && r.sources[0] === String(setup.A) && r.sources.includes(String(setup.B)), JSON.stringify(r.sources));
        check('it has no transfer left in it; a tree transferred to several times is in place every time, its events still one each', r.shape && r.shape.transfers === 0 && setup.toB >= 2 && r.shape.bCopies === setup.toB * r.shape.bLeaves && r.shape.bDistinct === r.shape.bLeaves, JSON.stringify(r.shape) + ' toB ' + setup.toB);
        check('its own result equals the source\'s exact top (each event counted once)', typeof r.exactInt === 'number' && typeof r.exactSrc === 'number' && Math.abs(r.exactInt - r.exactSrc) <= 1e-12 * Math.max(1, r.exactSrc) + 1e-18, r.exactInt + ' vs ' + r.exactSrc);
        check('the banner says it is read only and names the trees; the edit toolbar is hidden', /Integrated, read only/.test(r.banner) && r.banner.indexOf(setup.Bn) !== -1 && r.locked, r.banner + ' ' + r.locked);
        check('delete and add are refused on it', r.afterRefused === true);
        check('an edit that slips past the locks is rebuilt away', r.slipped === true);
        check('an unchanged project never rebuilds it', Array.isArray(r.idle) && r.idle.every(x => x === 0), JSON.stringify(r.idle));
        check('a change on a source reaches every copy on the next calculation', r.followed && r.followed.length === setup.toB && r.followed.every(c => c[0] === 'Changed on B' && c[1] === r.followed[0][1]) && r.bNow === r.followed[0][1], JSON.stringify(r.followed));
        check('and its result still equals the source\'s', typeof r.exactInt2 === 'number' && Math.abs(r.exactInt2 - r.exactSrc2) <= 1e-12 * Math.max(1, r.exactSrc2) + 1e-18 && r.exactInt2 !== r.exactInt, r.exactInt2 + ' vs ' + r.exactSrc2);
        check('the tree picker lists it as integrated, read only, and has the button', r.sidebar && r.sidebar.length === 1 && /\(integrated, read only\)/.test(r.sidebar[0]) && r.sbDebug.button, JSON.stringify(r.sidebar) + ' ' + JSON.stringify(r.sbDebug));
        check('on the Golden Thread: linked to the failure condition and to every tree it is built from', r.thread && r.thread.node && r.thread.fromFc && r.thread.fromSources, JSON.stringify(r.thread));
        check('it prints for the report appendix', r.print === true, String(r.print));
        check('no requirement comes from it (AutoReq, every scope)', r.reqFromInt && r.reqFromInt.hits === 0 && r.reqFromInt.n > 0, JSON.stringify(r.reqFromInt));
        check('it is never counted as another tree by the strictest pass', r.strictAfter === setup.strictBefore, setup.strictBefore + ' -> ' + r.strictAfter);
        check('a circular transfer: no result, said on the tree and in the banner', r.circle && r.circle.blocked && r.circle.exact === null && /No result: circular transfer/.test(r.circle.banner) && r.circle.metric === 'No result: circular transfer', JSON.stringify(r.circle));
        check('breaking the circle brings it back', r.unblocked && !r.unblocked.blocked && typeof r.unblocked.exact === 'number', JSON.stringify(r.unblocked));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) { check('test crashed: ' + (e && e.stack || e), false); }
    finally { await browser.close(); srv.close(); }
    done();
})();
