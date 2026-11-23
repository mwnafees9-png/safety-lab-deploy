/* A FAILURE CONDITION WITH MORE THAN ONE CoFFE SOURCE (23 Nov 2026).
 * Waqas: "is there a world where we show it with a note and claim that there is a more conservative use of this"; agreed:
 * show every source, check their SUM (each is a different route, so the bigger one alone would leave the other out), name
 * the driver, and compare the sources where they share assembly groups; "ok lets get it done".
 *   1  claimed by two tables and no table of its own: its CoFFE points to both, and shows both sources
 *   2  the figure is the sum of the sources per flight (by hand), turned into a rate per flight hour; the driver is the larger
 *   3  where the sources share assembly groups, the cases with one or two failures and everything else working are compared;
 *      every case answered two ways is listed (checked against the two rules by hand)
 *   4  its own table is never shelved: it can start one, and a failure condition with its own table keeps it live, with the
 *      other sources shown on every step; its own table is a third source in the sum
 *   5  the PASA shows each source, the sum against the objective, the driver and the disagreements
 *   6  no page errors
 * Mutations (SL_SRC_MUTATE): maxonly (the larger source instead of the sum), nodis (no comparison), shelve (its own table
 * shelved when another claims it).
 */
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' (' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 1200) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site'), MUT = process.env.SL_SRC_MUTATE || '';
function mutate(file, body) {
    if (!MUT || file !== 'apx_coffe.js') return body;
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing: ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'maxonly') rep("var p = Math.min(1, withGate.reduce(function (a, x) { return a + x.mc.p; }, 0))", "var p = Math.min(1, withGate.reduce(function (a, x) { return Math.max(a, x.mc.p); }, 0))");
    if (MUT === 'nodis') rep("var src = sourcesFor(fc2, onlySent), out = [];\n        for (var a = 0;", "var src = [], out = [];\n        for (var a = 0;");
    if (MUT === 'shelve') rep("function ownStarted(fc) { var r = peek(fc.key); return !!(", "function ownStarted(fc) { var r = peek(fc.key); return false && !!(");
    return body;
}
(async () => {
    const cof = fs.readFileSync(path.join(SITE, 'apx_coffe.js'), 'utf8');
    check('0 the files: the sources, the sum and the comparison are there; no em dash in the new text', /function sourcesFor\(/.test(cof) && /function combined\(/.test(cof) && /function disagreements2\(/.test(cof) && !/23 Nov 2026[^\n]*—/.test(cof));
    let pw; try { pw = require('playwright'); } catch (_) { console.log('  SKIP  browser checks'); return done(); }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
    const srv = http.createServer((q, r) => {
        let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
        const f = path.join(SITE, path.normalize(p)); let b;
        try { if (fs.statSync(f).isDirectory()) throw 0; b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
        const base = path.basename(f); if (/\.js$/.test(base)) b = Buffer.from(mutate(base, b.toString('utf8')));
        r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(b);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const brw = await pw.chromium.launch(), errs = [], tick = ms => new Promise(r => setTimeout(r, ms));
    try {
        const pg = await (await brw.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e).slice(0, 300))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html?apx=1'); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(async () => { await loadSampleProject(); }); await tick(4000);
        // the same four system functions under three failure conditions: FC-07 and FC-B each claim FC-X as their middle outcome
        const R = await pg.evaluate(async () => {
            const A = SLApxAuto, M = SLApxMac, C = SLApxCof, o = {};
            const f7 = A.model.fcs().find(x => x.fcId === 'FC-07'), others = A.model.fcs().filter(x => x.key !== f7.key);
            const fB = others[0], fX = others[1], cols = A.model.picked(f7).map(c => c.colId);
            [fB, fX].forEach(f => cols.forEach(c => { if (!A.model.picked(f).some(x => x.colId === c)) A.act.tick(f, c, 'does'); }));
            // a build belongs to the column, so it is set once, on whichever failure condition meets it first
            [f7, fB, fX].forEach(f => M.model.macCols(A.model.fcOf(f.key)).filter(d => !d.set).forEach(d => M.act.setPattern(A.model.fcOf(f.key), d.colId, '', 'pairs', 'hand', '')));
            // the rules read the case by assembly group, not by position (FC-B may have groups of its own in front)
            const ds7 = C.model.solved(A.model.fcOf(f7.key)).ds, K = ds7.map(d => d.id);
            const mapOf = (f, c) => { const m = {}; C.model.solved(A.model.fcOf(f.key)).ds.forEach((d, i) => { m[d.id] = c[i]; }); return m; };
            const non = m => Object.keys(m).filter(x => m[x] && m[x] !== 'O').length, at = (m, i) => m[K[i]] || 'O';
            // FC-07: worst if the first is lost and something else; FC-X (middle) if the first is partly lost or three others are
            const r7 = m => (at(m, 0) === 'F' && non(m) >= 2) ? 2 : (at(m, 0) !== 'O' || non(m) >= 3) ? 1 : 0;
            // FC-B: worst if the four are totally lost; FC-X (middle) only if the first is totally lost or the second and third both are
            const rB = m => (K.every((_, i) => at(m, i) === 'F')) ? 2 : (at(m, 0) === 'F' || (at(m, 1) !== 'O' && at(m, 2) !== 'O')) ? 1 : 0;
            const build = (f, rule, name) => {
                const fc = () => A.model.fcOf(f.key);
                C.act.setOutcome(fc(), 1, 'Nothing happens'); C.act.addOutcome(fc()); C.act.setOutcome(fc(), 1, name);
                let n = 0; for (;;) { const s = C.model.solved(fc()), nq = C.model.next(s); if (!nq) break; if (nq.phase === 1) C.act.answer(fc(), 1, nq.c, rule(mapOf(f, nq.c)) === 2); else C.act.answer(fc(), 2, nq.c, rule(mapOf(f, nq.c))); if (++n > 900) break; }
                C.act.setOutDef(fc(), 0, 'the worst outcome'); C.act.setOutDef(fc(), 1, 'the middle outcome'); C.act.setOutFc(fc(), 1, fX.key);
                const s = C.model.solved(fc()); s.ds.forEach(d => d.states.filter(x => x !== 'O').forEach(st => C.act.setBudget(fc(), d.id + '|' + st, st === 'F' ? '2E-06' : '1E-03')));
                return C.model.solved(fc()).done;
            };
            o.done = [build(f7, r7, 'Middle outcome'), build(fB, rB, 'Middle outcome')];
            o.keys = { g0: K[0], f7: f7.key, fB: fB.key, fX: fX.key, idX: fX.fcId, idB: fB.fcId, sevX: fX.sev };
            // what FC-X's CoFFE shows with no table of its own
            A._ui.fc = fX.key; A.setAp('cof'); A._ui.step = 3; A.kit.draw(); await new Promise(r => setTimeout(r, 200));
            const h = document.querySelector('#interdep-host');
            o.page = { txt: h.innerText, btns: Array.from(h.querySelectorAll('[data-apx-x^="gofc|"]')).map(b => b.getAttribute('data-apx-x').split('|')[1]), own: !!h.querySelector('[data-apx-x="owntoo"]') };
            const fx = A.model.fcOf(fX.key), cmb = C.model.combined(fx, false);
            o.cmb = { n: cmb.n, p: cmb.p, rate: cmb.rate, hours: cmb.hours, parts: cmb.sources.map(x => x.mc && x.mc.p), labels: cmb.sources.map(x => x.label), driver: cmb.driver && cmb.driver.label, share: cmb.share, page: SLTopBasis.missionHours(SLApxMac.model.acTree(fx)).hours, ok: cmb.ok, target: cmb.target };
            // the comparison, by hand from the two rules: singles and pairs over the four shared groups, everything else working
            const dsB = C.model.solved(A.model.fcOf(fB.key)).ds, want = [];
            const sh = ds7.filter(d => dsB.some(e => e.id === d.id)), stOf = d => d.states.filter(x => x !== 'O' && dsB.find(e => e.id === d.id).states.indexOf(x) !== -1);
            const differ = m => (r7(m) >= 1) !== (rB(m) >= 1);
            sh.forEach((d, i) => { stOf(d).forEach(a => { if (differ({ [d.id]: a })) want.push(d.id + a); }); sh.slice(i + 1).forEach(e => stOf(d).forEach(a => stOf(e).forEach(b => { if (differ({ [d.id]: a, [e.id]: b })) want.push(d.id + a + e.id + b); }))); });
            o.want = want.length; o.dis = C.model.disagreements2(fx, false).map(x => x.what);
            o.disShown = /Finding: the sources disagree on \d+ case/.test(o.page.txt);
            return o;
        });
        const k = R.keys;
        check('1 claimed by two tables with no table of its own: its CoFFE points to both and offers a table of its own', R.done.every(Boolean) && R.page.btns.sort().join() === [k.f7, k.fB].sort().join() && R.page.own && /Those tables cover it/.test(R.page.txt), R.page.btns);
        check('1 ...and shows both sources', R.cmb.n === 2 && R.cmb.labels.every(l => /^the outcome "Middle outcome" of the CoFFE table for /.test(l)) && /The CoFFE sources of /.test(R.page.txt), R.cmb.labels);
        const sum = R.cmb.parts[0] + R.cmb.parts[1], rate = -Math.log1p(-sum) / R.cmb.page;
        check('2 the figure is the sum of the two sources per flight', R.cmb.parts.every(p => p > 0) && Math.abs(R.cmb.p - sum) / sum < 1e-12, R.cmb);
        check('2 turned into a rate per flight hour over its own flight time: -ln(1 - P) / t', Math.abs(R.cmb.rate - rate) / rate < 1e-12 && R.cmb.hours === R.cmb.page, [R.cmb.rate, rate]);
        check('2 the driver is the larger source, with its share', R.cmb.driver === R.cmb.labels[R.cmb.parts[0] >= R.cmb.parts[1] ? 0 : 1] && Math.abs(R.cmb.share - Math.max.apply(null, R.cmb.parts) / sum) < 1e-12 && /The driver is /.test(R.page.txt), R.cmb);
        check('3 every case answered two ways is found, as worked out by hand from the two rules (' + R.want + ')', R.want > 0 && R.dis.length === R.want && R.disShown, { want: R.want, got: R.dis });
        // ---- 4: a table of its own as well
        const O = await pg.evaluate(async (k) => {
            const A = SLApxAuto, C = SLApxCof, o = {}, fx = () => A.model.fcOf(k.fX);
            document.querySelector('#interdep-host [data-apx-x="owntoo"]').click(); await new Promise(r => setTimeout(r, 200));
            o.started = C.model.ownStarted(fx());
            C.act.setOutcome(fx(), 1, 'No overrun');
            const ids = C.model.solved(fx()).ds.map(d => d.id), rX = c => (c[ids.indexOf(k.g0)] === 'F') ? 1 : 0;   // its own: the first totally lost causes it
            let n = 0; for (;;) { const s = C.model.solved(fx()), nq = C.model.next(s); if (!nq) break; C.act.answer(fx(), 1, nq.c, rX(nq.c) === 1); if (++n > 900) break; }
            C.act.setOutDef(fx(), 0, 'its own definition'); const s = C.model.solved(fx()); s.ds.forEach(d => d.states.filter(x => x !== 'O').forEach(st => C.act.setBudget(fx(), d.id + '|' + st, '3E-06')));
            A._ui.step = 3; A.kit.draw(); const h = document.querySelector('#interdep-host');
            o.banner = /This failure condition has more than one CoFFE source/.test(h.innerText); o.live = !!h.querySelector('[data-apx-x^="a1|"], [data-apx-x="undo"]');
            const cmb = C.model.combined(fx(), false); o.n = cmb.n; o.own = cmb.sources.filter(x => x.own).length; o.p = cmb.p; o.parts = cmb.sources.map(x => x.mc && x.mc.p);
            // send the three CoFFEs, then the PASA of FC-X
            [k.f7, k.fB, k.fX].forEach(key => { const r = C.act.send(A.model.fcOf(key), 'Test Engineer'); o['sent' + key] = r.ok ? 'ok' : r.why; });
            const g = (SLFcTrees.groups('ac') || []).find(x => x && x.gov && String(x.gov.internalId) === String(k.fX)), px = SLApxBridge.pasa(g);
            o.pasa = JSON.stringify(px && px.cof || []);
            return o;
        }, k);
        check('4 it can start a table of its own; the page then keeps its own table live and shows the other sources on every step', O.started && O.banner && O.live, O);
        const sum3 = O.parts.reduce((a, b) => a + b, 0);
        check('4 its own table is a third source in the sum', O.n === 3 && O.own === 1 && Math.abs(O.p - sum3) / sum3 < 1e-12, O);
        check('5 all three send', ['sent' + k.f7, 'sent' + k.fB, 'sent' + k.fX].every(x => O[x] === 'ok'), O);
        check('5 the PASA for it: each source, the sum against the objective, the driver, and the disagreements', O.pasa.indexOf('The CoFFE sources of ' + k.idX) !== -1 && /has 3 CoFFE sources, added together: /.test(O.pasa) && /never lower than the true one/.test(O.pasa) && /The driver is /.test(O.pasa) && /Finding: the CoFFE sources of .* disagree on \d+ case/.test(O.pasa) && O.pasa.indexOf('is the outcome \\"Middle outcome\\" of the CoFFE table for FC-07') !== -1 && O.pasa.indexOf('is the outcome \\"Middle outcome\\" of the CoFFE table for ' + k.idB) !== -1, O.pasa.slice(0, 600));
        check('6 no page errors', errs.length === 0, errs.join(' | '));
        await pg.context().close();
    } catch (e) { check('browser run completed', false, e && e.stack ? e.stack : String(e)); }
    await brw.close(); srv.close();
    done();
    function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  [mutation: ' + MUT + ']' : '')); process.exit(fail ? 1 : 0); }
})();
