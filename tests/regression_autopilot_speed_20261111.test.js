#!/usr/bin/env node
/*
 * Regression: the autopilot pages open fast, with the same results (11 Nov 2026: fta_engine.js 1.14 and
 * engine_modules.js 1.4, cad_zonal.js 1.5, cma_autopilot.js 1.6, pra_autopilot.js 2.9).
 *
 * WHAT HAPPENED (Waqas: "I need the performance to improve on all the autopilots"). Measured in the real app on the
 *   HL-1 demo: the ZSA page took 9 to 10 seconds to open, every time; CMA about 1 second; PRA about 0.7. Causes:
 *   (1) the fault tree engine's reset() allocated all eight of its tables again (2 MB) on every call;
 *   (2) the zonal evaluation built every fault tree again for every piece of equipment it was asked about;
 *   (3) the CMA Autopilot worked a claim's questions out again for every single question it looked up;
 *   (4) the PRA Autopilot wrote out every risk's whole story to show one.
 *   Not changed: the CAD pictures in a ZSA or PRA part. They dominate a part switch in this test browser, which draws
 *   3D in software; that cannot be judged here.
 * RULE (Waqas, 11 Nov 2026): "going forward math must stay at the highest standard possible no matter what happens".
 *   Every change here is plumbing: the same engine calls on the same data. This suite proves the results are the same.
 * CHECKS:
 *   [E] the engine: reset() allocates nothing once warm; every tree's structure function is identical to the one a
 *       brand-new engine builds; a tree big enough to grow the tables, then a small one again, still identical; the
 *       page copy (engine_modules.js) carries the same reset.
 *   [S] source: the CMA questions are kept for the turn; a PRA section's blocks are written when first read; pins; the worker loads the same engine version as the page.
 *   [Z] (browser, HL-1 demo) the whole ZSA report is identical with the tree memo off and on; with it on each fault
 *       tree is built at most once; after a tree is edited the result follows the edit (never a stale tree); the ZSA
 *       page opens without rebuilding the trees.
 * MUTATION PROOFS (SL_SPEED_MUTATE): realloc, nomemo, stale, eagerpra, nocmamemo. Each turns this red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_autopilot_speed_20261111.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http');
const REPO = path.join(__dirname, '..'), SITE = path.join(REPO, 'site');
const MUT = process.env.SL_SPEED_MUTATE || '';
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600) : '')); } };
function src(file) {
    let s = fs.readFileSync(path.join(SITE, file), 'utf8');
    const rep = (a, b) => { if (s.indexOf(a) < 0) throw new Error('mutation anchor missing in ' + file + ': ' + a.slice(0, 70)); s = s.replace(a, b); };
    if (MUT === 'realloc' && (file === 'fta_engine.js' || file === 'engine_modules.js')) { rep('if (uCap === _CAP0 && uVal) { uVal.fill(0); uCount = 0; } else {', 'if (false) {} else {'); rep('if (cCap === _CAP0 && cVal) { cVal.fill(0); cCount = 0; } else {', 'if (false) {} else {'); }
    if (file === 'cad_zonal.js') {
        if (MUT === 'nomemo') rep("if (gen == null || root.SL_ZONAL_TREE_MEMO_OFF || typeof Map !== 'function') return _treeBuild(E, pg);", 'if (true) return _treeBuild(E, pg);');
        if (MUT === 'stale') rep('if (_treeMemo.gen !== gen || !_treeMemo.by) _treeMemo', 'if (!_treeMemo.by) _treeMemo');
    }
    if (file === 'pra_autopilot.js' && MUT === 'eagerpra') rep('get blocks() { if (!made) made = _sectionFull(row, ctx).blocks; return made; } };', 'blocks: _sectionFull(row, ctx).blocks };');
    if (file === 'cma_autopilot.js' && MUT === 'nocmamemo') rep("return memo('qf:' + S(r.internalId), function () { return _questionsFor(r); });", 'return _questionsFor(r);');
    return s;
}

// ---- [E] the engine, in a sandbox that counts table allocations ----------------------------------------------------
function engine() {
    const count = { n: 0 };
    class CountedInt32 extends Int32Array { constructor(a) { super(a); if (typeof a === 'number' && a >= 65536) count.n++; } }
    const ctx = { console, Math, JSON, Set, Map, Object, Array, String, Number, Error, Symbol, Int32Array: CountedInt32, Float64Array, Uint8Array, Uint32Array, performance: { now: () => 0 }, setTimeout, clearTimeout };
    ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx; ctx.root = ctx;
    vm.createContext(ctx);
    vm.runInContext(src('fta_engine.js') + '\n;try { globalThis.SLFTAEngine = SLFTAEngine; } catch (_) {}', ctx, { filename: 'fta_engine.js' });
    return { E: ctx.SLFTAEngine, count: count };
}
let nid = 1;
const ev = (lid) => ({ id: nid++, logicalId: lid, type: 'basic', name: 'E' + lid, probability: 1e-3 });
const gate = (t, kids, extra) => Object.assign({ id: nid++, logicalId: nid, type: 'gate', gateType: t, name: 'G', children: kids }, extra || {});
function trees() {
    nid = 1;
    const out = [];
    out.push(gate('OR', [ev(1), ev(2), ev(3)]));
    out.push(gate('AND', [gate('OR', [ev(1), ev(2)]), gate('OR', [ev(2), ev(3)]), ev(4)]));
    out.push(gate('OR', [gate('AND', [ev(1), ev(5)]), gate('AND', [ev(5), ev(6)]), gate('AND', [ev(1), ev(6)])]));   // 2 of 3, written out
    const wide = []; for (let i = 10; i < 34; i++) wide.push(gate('AND', [ev(i), ev(i + 100)])); out.push(gate('OR', wide));
    const deep = (d) => d === 0 ? ev(200 + nid) : gate(d % 2 ? 'AND' : 'OR', [deep(d - 1), ev(300 + d), deep(d - 1)]); out.push(deep(5));
    return out;
}
// a structure function written out: stable ids by first visit, so two engines can be compared
function sig(E, root) {
    const b = E.buildBDDFromFT(root); if (!b || !b.bdd) return 'none';
    const ids = new Map(), rows = [];
    (function w(n) { if (n.isTerminal) return n.id === 1 ? 'T' : 'F'; if (ids.has(n)) return ids.get(n); const k = ids.size; ids.set(n, k); const lo = w(n.low), hi = w(n.high); rows[k] = n.varIdx + ':' + lo + ':' + hi; return k; })(b.bdd);
    return rows.join(',') + '|vars=' + b.lidToVar.size + '|min=' + E.minOrder(b.bdd, new Set());
}
// a tree whose diagram outgrows the starting tables: an OR of ANDs over interleaved events is the classic bad order
function big() { nid = 5000; const k = []; for (let i = 0; i < 15; i++) k.push(gate('AND', [ev(1000 + i), ev(2000 + (i * 7) % 15)])); const a = gate('OR', k); const k2 = []; for (let i = 0; i < 15; i++) k2.push(gate('OR', [ev(2000 + i), ev(1000 + (i * 4) % 15)])); return gate('OR', [a, gate('AND', k2)]); }

(async function main() {
    try {
        const one = engine(), T = trees();
        const fresh = T.map(t => sig(engine().E, t));              // each tree in a brand-new engine
        const first = T.map(t => sig(one.E, t));
        const before = one.count.n;
        let same = true; for (let r = 0; r < 60; r++) T.forEach((t, i) => { if (sig(one.E, t) !== fresh[i]) same = false; });
        check('[E] 300 builds in one engine: every structure function is identical to the one a brand-new engine builds', same && first.every((x, i) => x === fresh[i]) && fresh.every(x => x.length > 10), fresh.map(x => x.length));
        check('[E] and none of those builds allocated a table again (the tables are cleared in place)', one.count.n === before, { before: before, after: one.count.n });
        const B = big(), bigFresh = sig(engine().E, B), bigHere = sig(one.E, B), grew = one.count.n > before;
        const afterBig = T.map(t => sig(one.E, t));
        check('[E] a tree that outgrows the starting tables is the same too, and the small trees after it are still identical', bigHere === bigFresh && afterBig.every((x, i) => x === fresh[i]), { grew: grew, len: bigHere.length });
        const em = src('engine_modules.js'), fe = src('fta_engine.js'), body = s => (/function reset\(\) \{[\s\S]*?\n    \}/.exec(s) || [''])[0];
        check('[E] the page copy of the kernel (engine_modules.js) carries the same reset, word for word', body(em).length > 100 && body(em) === body(fe) && (MUT === 'realloc' || /uVal\.fill\(0\)/.test(body(fe))));
    } catch (e) { check('[E] ran', false, e && e.stack); }

    // ---- [S] source and pins --------------------------------------------------------------------------------------
    const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('[S] the CMA Autopilot keeps a claim\'s questions for the turn (the same memo the full list uses)', /function questionsFor\(r\) \{\s*if \(!r \|\| r\.internalId == null\) return _questionsFor\(r\);\s*return memo\('qf:' \+ S\(r\.internalId\)/.test(src('cma_autopilot.js')));
    check('[S] a PRA section\'s blocks are written when first read, not when the page opens', /get blocks\(\) \{ if \(!made\) made = _sectionFull\(row, ctx\)\.blocks; return made; \}/.test(src('pra_autopilot.js')));
    const pageV = (/fta_engine\.js\?v=([\d.]+)"/.exec(html) || [])[1], workerV = (/importScripts\('fta_engine\.js\?v=([\d.]+)'\)/.exec(fs.readFileSync(path.join(SITE, 'fta_worker.js'), 'utf8')) || [])[1];
    check('[S] pins: fta_engine.js 1.14 on the page and in the worker, engine_modules.js 1.4, cad_zonal.js 1.9, pra_autopilot.js 2.9, cma_autopilot.js 1.6', pageV === '1.14' && workerV === '1.14' && ['engine_modules.js?v=1.4"', 'cad_zonal.js?v=1.9"', 'pra_autopilot.js?v=2.9"', 'cma_autopilot.js?v=1.6"'].every(x => html.indexOf(x) > 0), { pageV, workerV });
    const spawn = ['misc_fn_modules.js', 'tree_warm.js'].map(f => (/new Worker\('fta_worker\.js\?v=([\d.]+)'\)/.exec(fs.readFileSync(path.join(SITE, f), 'utf8')) || [])[1]);
    check('[S] both places that start the worker ask for the same new worker version', spawn[0] === '1.12' && spawn[1] === '1.12', spawn);

    // ---- [Z] the real app on the HL-1 demo --------------------------------------------------------------------------
    let pw = null; try { pw = require('playwright'); } catch (_) {}
    if (!pw) { console.log('  SKIP  Playwright is not installed here: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.step': 'application/step' };
    const CSP = (() => { const w = fs.readFileSync(path.join(REPO, 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();   // eslint-disable-line no-eval
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); } const name = path.basename(f); if (MUT && /\.js$/.test(name) && ['fta_engine.js', 'engine_modules.js', 'cad_zonal.js', 'pra_autopilot.js', 'cma_autopilot.js'].indexOf(name) >= 0) b = Buffer.from(src(name)); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(b); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const browser = await pw.chromium.launch(), errs = [];
    try {
        const pg = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 200))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.addInitScript(() => { window.SL_VERIFY_SYNC_OFF = true; });
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await pg.waitForFunction(() => typeof window.loadHL1Demo === 'function' && !!window.SLZsaAuto && !!window.SLCadZonal && !!window.SLFTAEngine, null, { timeout: 90000 });
        await new Promise(r => setTimeout(r, 2500));
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.evaluate(() => window.loadHL1Demo());
        await pg.waitForFunction(() => Array.isArray(ftaPages) && ftaPages.length > 50 && Array.isArray(zsaData) && zsaData.length > 5, null, { timeout: 60000 });
        await new Promise(r => setTimeout(r, 6000));
        const z = await pg.evaluate(async () => {
            const A = window.SLZsaAuto, E = window.SLFTAEngine;
            let builds = 0; const b0 = E.buildBDDFromFT; E.buildBDDFromFT = function () { builds++; return b0.apply(this, arguments); };
            const grab = () => { A.reset(); builds = 0; const s = JSON.stringify(A.reportSections()); return { s: s, builds: builds }; };
            window.SL_ZONAL_TREE_MEMO_OFF = true; const off = grab();
            window.SL_ZONAL_TREE_MEMO_OFF = false; SLDataChange.bump && SLDataChange.bump(); const on = grab(); const again = grab();
            // an edit: the first AND gate of a tree the zonal evaluation reaches becomes an OR gate
            let edited = null;
            for (const p of ftaPages) { let hit = null; (function w(n) { if (!n || hit) return; if (n.type === 'gate' && n.gateType === 'AND' && (n.children || []).length > 1) { hit = n; return; } (n.children || []).forEach(w); })(p.root); if (hit) { const before = JSON.stringify(SLCadZonal.evaluate(systemsData.map(s => s.id))); hit.gateType = 'OR'; scheduleAutosave(); edited = { page: p.id, gate: hit.displayId || hit.id }; break; } }
            const onE = grab(); window.SL_ZONAL_TREE_MEMO_OFF = true; const offE = grab(); window.SL_ZONAL_TREE_MEMO_OFF = false;
            // every AND gate turned OR, to be sure the edit reaches a tree the zones depend on
            let turned = 0; ftaPages.forEach(p => (function w(n) { if (!n) return; if (n.type === 'gate' && n.gateType === 'AND') { n.gateType = 'OR'; turned++; } (n.children || []).forEach(w); })(p.root)); scheduleAutosave();
            const onAll = grab(); window.SL_ZONAL_TREE_MEMO_OFF = true; const offAll = grab(); window.SL_ZONAL_TREE_MEMO_OFF = false;
            // the evaluation itself, asked about every piece of equipment an event is tagged with: before and after a
            // change that must move its numbers (every OR gate becomes an AND gate: more failures are needed)
            // (the demo ties no event to equipment, so a few are tied here: one event in each of the first trees)
            let tagged = 0; ftaPages.forEach(p => { if (tagged >= 12) return; let done = false; (function w(n) { if (!n || done) return; if (n.type !== 'gate' && n.type !== 'transfer') { n.equipmentId = 'EQ-TEST'; if (!n.identity) n.identity = { kind: 'item', systemId: 'EQ-TEST' }; done = true; tagged++; return; } (n.children || []).forEach(w); })(p.root); }); scheduleAutosave();
            const EI = SLCadZonal.eventIndex(), eq = {}; Object.keys(EI.byLid).forEach(l => Object.keys(EI.byLid[l].sysIds).forEach(x => { eq[x] = 1; }));
            const ask = () => JSON.stringify(SLCadZonal.evaluate(Object.keys(eq)).trees.map(t => [t.pageId, t.reached, t.alreadyTrue, t.additional]));
            const ev0 = ask();
            let flipped = 0; ftaPages.forEach(p => (function w(n) { if (!n) return; if (n.type === 'gate' && n.gateType === 'OR') { n.gateType = 'AND'; flipped++; } (n.children || []).forEach(w); })(p.root)); scheduleAutosave();
            const evOn = ask(); window.SL_ZONAL_TREE_MEMO_OFF = true; const evOff = ask(); window.SL_ZONAL_TREE_MEMO_OFF = false;
            E.buildBDDFromFT = b0;
            return { pages: ftaPages.length, bytes: off.s.length, same: off.s === on.s && on.s === again.s, offBuilds: off.builds, onBuilds: on.builds, againBuilds: again.builds, edited: edited, editSame: onE.s === offE.s, turned: turned, allSame: onAll.s === offAll.s, allBuilds: onAll.builds, equipment: Object.keys(eq).length, flipped: flipped, evTrees: JSON.parse(ev0).length, evMoved: evOn !== ev0, evSame: evOn === evOff };
        });
        check('[Z] the whole ZSA report (' + Math.round(z.bytes / 1024) + ' KB on the demo) is identical with the tree memo off and on', z.same && z.bytes > 100000, { bytes: z.bytes });
        check('[Z] with the memo each fault tree is built at most once (' + z.onBuilds + ' builds for ' + z.pages + ' trees; ' + z.offBuilds + ' without it), and none again on the next read', z.onBuilds > 0 && z.onBuilds <= z.pages && z.againBuilds === 0 && z.offBuilds > z.pages * 3, z);
        check('[Z] after a gate is edited the result is the one worked out afresh, never a stale tree', !!z.edited && z.editSame, z.edited);
        check('[Z] after every AND gate becomes an OR gate (' + z.turned + ' gates): the report equals the one worked out afresh, and the trees were built again', z.turned > 5 && z.allSame && z.allBuilds > 0, { turned: z.turned, same: z.allSame, builds: z.allBuilds });
        check('[Z] the evaluation itself (' + z.evTrees + ' trees reached from ' + z.equipment + ' pieces of equipment): after ' + z.flipped + ' gates change its numbers move, and they are the ones worked out afresh', z.evTrees > 0 && z.flipped > 5 && z.evMoved && z.evSame, { trees: z.evTrees, moved: z.evMoved, same: z.evSame });
        const open = await pg.evaluate(async () => { const E = window.SLFTAEngine; let builds = 0; const b0 = E.buildBDDFromFT; E.buildBDDFromFT = function () { builds++; return b0.apply(this, arguments); }; const t0 = performance.now(); switchTab('zsa'); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const ms = Math.round(performance.now() - t0); E.buildBDDFromFT = b0; return { ms: ms, builds: builds, pages: ftaPages.length, shown: !!document.querySelector('#view-zsa') }; });
        console.log('  info  the ZSA page opened in ' + open.ms + ' ms here (' + open.builds + ' tree builds)');
        check('[Z] opening the ZSA page builds each fault tree at most once', open.shown && open.builds <= open.pages, open);
        const pra = await pg.evaluate(async () => { switchTab('pra'); await new Promise(r => setTimeout(r, 1500)); const sel = Array.from(document.querySelectorAll('select')).find(s => (s.getAttribute('onchange') || '').indexOf('"pra"') >= 0 && s.getBoundingClientRect().width > 0); const first = sel ? sel.options[sel.options.length - 1].value : null; if (first) { SLCcaReport.act('pra', 'tab', first); } await new Promise(r => setTimeout(r, 800)); const v = document.getElementById('view-pra'); return { tabs: sel ? sel.options.length : 0, text: v ? v.textContent.length : 0, has: v ? /The risk and the question it answers/.test(v.textContent) : false }; });
        check('[Z] the PRA page still shows a risk\'s whole story when its part is picked', pra.tabs > 3 && pra.has, pra);
        check('[Z] no page errors', errs.length === 0, errs.slice(0, 3));
    } catch (e) { check('[Z] ran to the end', false, e && e.stack); }
    await browser.close(); srv.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
