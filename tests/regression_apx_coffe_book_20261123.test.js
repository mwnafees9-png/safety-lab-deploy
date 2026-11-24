/* THE CoFFE AS THE BOOK DOES IT (ARP4761A B.4.3.1, B.4.3.2, Q.4.4.1 to Q.4.4.4.1; 23 Nov 2026).
 * Waqas, after the CoFFE section and its example were read through: "yes lets get this done now".
 *   1  a resource failure goes under an event only when the Interdependence answer says it does that to the function:
 *      total loss under the function's total loss, partial or total loss under its partial loss (Figure Q.4-1: ELEC_WBS under
 *      FF1.1, ELEC_GSS under FF2.2); "no effect" needs its reason; an unanswered effect blocks both Autopilots
 *   2  a loss of supply is one event per function (HYD_WBS, HYD_GSS); an erroneous resource is ONE shared event (AGS.MF under
 *      spoilers and reversers, not under brakes): the cut set table counts it once, the gate shows it shared
 *   3  a shared event that reaches the core and another branch is a single failure: listed once as one, the larger
 *      combinations it makes are dropped, and it is a finding
 *   4  budgets are per flight; the gate's probability per flight is turned into a rate per flight hour over the failure
 *      condition's own flight time and only then compared with the objective (by hand: -ln(1 - P) / t)
 *   5  a lesser outcome can be a failure condition of its own (case 27: brakes alone, low-speed overrun, Hazardous): it gets
 *      its own gate (this outcome or worse) and math on the same budgets; its CoFFE Autopilot points to this table; its PASA
 *      appendix shows its part; the line in the system FHA says which failure condition it is on its own
 *   6  each outcome says what it means; with the MAC state definitions and the "no effect" reasons they are the PASA
 *      assumptions, with permanent IDs
 *   7  the CMA list (Table Q.4-12): the combinations that do not rest on one resource, kept on send for the CMA
 *   8  no page errors
 * Mutations (SL_CB_MUTATE): perfh (budgets compared per flight hour without conversion), noshared (an erroneous resource is
 * one event per function), allfeeds (every fed resource under every event, as before), nosingle (a shared event's pair with
 * itself is kept as a pair).
 */
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' (' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 1200) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site'), MUT = process.env.SL_CB_MUTATE || '';
const rd = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function mutate(file, body) {
    if (!MUT || file !== 'apx_coffe.js') return body;
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing: ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'perfh') rep("ok: tg == null || !m ? null : m.pass", "ok: tg == null || !m ? null : p.p <= tg");
    if (MUT === 'noshared') rep("var sh = K.craShared(m);", "var sh = false;");
    if (MUT === 'allfeeds') rep("var hit = d.isM ? s0 === 'wrong' : st === 'F' ? s0 === 'total' : (s0 === 'partial' || s0 === 'total');", "var hit = !d.isM;");
    if (MUT === 'nosingle') rep("parts: p.a.code === p.b.code ? [p.a.code] : [p.a.code, p.b.code]", "parts: [p.a.code, p.b.code + ' ']");
    return body;
}
(async () => {
    const cof = rd('apx_coffe.js'), idp = rd('apx_autopilots.js'), br = rd('apx_bridge.js');
    check('0 the files: no em dash in the new text; the effects, the linked outcomes, the CMA list and the assumptions are there', !/23 Nov 2026[^\n]*—/.test(cof + idp + br) && /function resEvents\(/.test(cof) && /function linkedChecks\(/.test(cof) && /function cmaList\(/.test(cof) && /function craState\(/.test(idp) && /function assumptions\(fc\)/.test(br));
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
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(async () => { await loadSampleProject(); }); await tick(4000);
        const K = await pg.evaluate(async () => { const A = SLApxAuto, f = A.model.fcs().find(x => x.fcId === 'FC-07'); A._ui.fc = f.key; A.open('cof'); await new Promise(r => setTimeout(r, 1200)); return f.key; });

        // ---- the S18 shape: 4 systems as pairs; R1 behaves like hydraulic power, R2 like ground detection information -------
        const S = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, C = SLApxCof, f = () => A.model.fcOf(K), o = {};
            const [R1, R2] = A.model.resources().slice(0, 2), cols = A.model.picked(f());
            [R1, R2].forEach(r => { A.act.resTick(f(), r.key); cols.forEach(c => A.act.feed(f(), r.key, c.colId)); });
            A.act.mode(f(), R1.key, 'Total loss', true); A.act.mode(f(), R1.key, 'Partial loss', true); A.act.mode(f(), R2.key, 'Erroneous', true);
            const k = (r, m, c) => r.key + '|' + m + '|' + c.colId;
            cols.forEach((c, i) => {
                A.act.setCra(f(), k(R1, 'Total loss', c), i === 0 ? 'Total loss of this function' : 'Partial loss of this function');   // the book: loss of all pairs reads as at least partial for the others
                A.act.setCra(f(), k(R1, 'Partial loss', c), 'Partial loss of this function');
                A.act.setCra(f(), k(R2, 'Erroneous', c), i === 1 || i === 2 ? 'Partial loss of this function' : 'No effect');
            });
            o.openBeforeWhy = A.model.left(f()).join(' | ');
            cols.forEach((c, i) => { if (!(i === 1 || i === 2)) A.act.setCraWhy(f(), k(R2, 'Erroneous', c), 'It also uses wheel speed, developed independently'); });
            [R1, R2].forEach(r => A.model.resState(f(), r).modes.forEach(m => A.act.setCra(f(), r.key + '|' + m + '|', 'Degraded, failure condition not reached')));
            o.left = A.model.left(f());
            o.names = [R1.name, R2.name]; o.cols = cols.map(c => c.sysName);
            M.model.lossBase(f()).forEach(c => M.act.setPattern(f(), c.colId, '', 'pairs', 'hand', '')); M.act.setEv(f(), 'LPA-01');
            const truth = c => c[0] === 'F' && c.replace(/O/g, '').length >= 2;
            let n = 0; for (;;) { const s = M.model.solved(f()); if (s.done) break; const c = SLApx.nextQuestion(s.cols, s.m1, { lo: 0, hi: 1, among: s.cases }); M.act.answer(f(), c, truth(c)); if (++n > 500) break; }
            M.model.rules(M.model.solved(f())).forEach(x => M.act.setWhy(f(), x.c, 'Not enough stopping force left'));
            C.act.setOutcome(f(), 1, 'No overrun'); C.act.addOutcome(f()); C.act.setOutcome(f(), 1, 'Low-speed overrun');
            const lvl = c => truth(c) ? 2 : (c[0] !== 'O' || c.replace(/O/g, '').length >= 3) ? 1 : 0;
            n = 0; for (;;) { const s = C.model.solved(f()), nq = C.model.next(s); if (!nq) break; if (nq.phase === 1) C.act.answer(f(), 1, nq.c, lvl(nq.c) === 2); else C.act.answer(f(), 2, nq.c, lvl(nq.c)); if (++n > 900) break; }
            o.done = C.model.solved(f()).done;
            return o;
        }, K);
        check('1 "no effect" without its reason leaves the effect open', /resource failure/.test(S.openBeforeWhy), S.openBeforeWhy);
        check('1 with every effect and reason given, the Interdependence Autopilot has nothing left', S.left.length === 0 && S.done, S);
        const W = await pg.evaluate((K) => {
            const A = SLApxAuto, C = SLApxCof, f = A.model.fcOf(K), s = C.model.solved(f), g = C.model.gate(f, s);
            const w = e => C.model.ways(f, s, e).res.map(r => r.code + (r.shared ? '*' : ''));
            const P = C.model.pairs(f, s);
            A._ui.step = 6; A.kit.draw(); const tree = (document.querySelector('#interdep-host .apx-tree') || {}).innerText || '';
            return { shape: g.shape, core: w(g.core[0]), any: g.any.map(w), n: P.rows.length, rows: P.rows.map(r => r.parts.join(' + ')), same: P.rows.filter(r => r.same).length, singles: (P.singles || []).length, tree };
        }, K);
        const [R1, R2] = S.names;
        check('1 under the total loss of the core function: only the resource failure that totally loses it (no partial loss, no erroneous)', W.shape === 'core-any' && W.core.length === 1 && W.core[0].indexOf(R1 + ' total loss to ') === 0, W.core);
        check('1 under each partial loss: the partial and the total loss of supply for that function; the erroneous one only where it partially loses it', W.any.every(a => a.filter(x => x.indexOf(R1 + ' ') === 0).length === 2) && W.any[0].indexOf(R2 + ' erroneous*') !== -1 && W.any[1].indexOf(R2 + ' erroneous*') !== -1 && W.any[2].indexOf(R2 + ' erroneous*') === -1, W.any);
        // core ways: 1 resource + own = 2; others: 6 supply losses + 1 shared erroneous + 3 own = 10; 2 x 10 = 20 (the book: 3 x 10 = 30)
        check('2 the cut set table: every way of the core against every way of the others, the shared erroneous one counted once (2 x 10 = 20)', W.n === 20 && W.rows.filter(r => r.indexOf(R2 + ' erroneous') !== -1).length === 2, { n: W.n, rows: W.rows });
        check('2 the pairs resting on one resource are the supply losses of that resource (1 x 6)', W.same === 6, W.same);
        check('2 the gate drawing shows each event\'s ways, the erroneous one marked shared', W.tree.indexOf(R2 + ' erroneous') !== -1 && /shared/.test(W.tree) && W.tree.indexOf(R1 + ' total loss to') !== -1, W.tree.slice(0, 600));
        // ---- 3: a shared event that reaches the core too
        const SG = await pg.evaluate((K) => {
            const A = SLApxAuto, C = SLApxCof, f = A.model.fcOf(K), R2 = A.model.resources()[1], c0 = A.model.picked(f)[0], key = R2.key + '|Erroneous|' + c0.colId;
            A.act.setCraSt(f, key, 'total'); const s = C.model.solved(f), P = C.model.pairs(f, s);
            A._ui.step = 7; A.kit.draw(); const txt = document.querySelector('#interdep-host').innerText;
            const out = { n: P.rows.length, singles: (P.singles || []).map(r => r.parts.join('+')), withIt: P.rows.filter(r => r.parts.length > 1 && r.parts.some(x => x === R2.name + ' erroneous')).length, finding: /Finding: a single failure causes FC-07/.test(txt) };
            A.act.setCraSt(f, key, 'none'); return out;
        }, K);
        // 3 core ways x 10 = 30 pairs; 12 contain the shared event; 18 remain plus the single = 19
        check('3 a shared event that reaches the core and another branch is one failure: listed once, the larger ones it makes dropped (30 -> 19)', SG.n === 19 && SG.singles.length === 1 && SG.singles[0] === R2 + ' erroneous' && SG.withIt === 0, SG);
        check('3 ...and it is a finding on the page', SG.finding, SG);
        // ---- 4: budgets per flight, the rate per flight hour by hand
        const B = await pg.evaluate((K) => {
            const A = SLApxAuto, C = SLApxCof, f = A.model.fcOf(K), s = C.model.solved(f), g = C.model.gate(f, s);
            C.act.setBudget(f, g.core[0].col + '|' + g.core[0].st, '6E-05'); g.any.forEach(e => C.act.setBudget(f, e.col + '|' + e.st, '7E-04'));
            const mc = C.model.mathCheck(f, C.model.solved(f)), page = SLApxMac.model.acTree(f), hrs = SLTopBasis.missionHours(page).hours;
            return { p: mc.p, rate: mc.rate, ok: mc.ok, hours: hrs, mh: mc.hours, target: mc.target, sev: f.sev };
        }, K);
        const pHand = 6e-5 * (1 - Math.pow(1 - 7e-4, 3)), rHand = -Math.log1p(-pHand) / B.hours;
        check('4 the gate per flight: 6E-05 x (1 - (1 - 7E-04)^3)', Math.abs(B.p - pHand) / pHand < 1e-12, [B.p, pHand]);
        check('4 the rate per flight hour is -ln(1 - P) / t over the failure condition\'s own flight time', B.mh === B.hours && Math.abs(B.rate - rHand) / rHand < 1e-12, [B.rate, rHand, B.hours]);
        check('4 judged on the rate: ' + (B.hours > 1 ? 'a gate over the objective per flight passes when its rate per flight hour is under it' : 'the verdict follows the rate'), B.target != null && B.ok === (rHand <= B.target * (1 + 1e-6)) && (B.hours <= 1 || (pHand > B.target) === (B.p > B.target)), B);
        // ---- 5: a lesser outcome that is a failure condition of its own
        const L = await pg.evaluate(async (K) => {
            const A = SLApxAuto, C = SLApxCof, M = SLApxMac, f = () => A.model.fcOf(K), o = {};
            const other = A.model.fcs().filter(x => x.key !== K).sort((a, b) => (b.subId === f().subId) - (a.subId === f().subId))[0];
            o.left0 = C.model.left(f()).join(' | ');
            C.act.setOutFc(f(), 1, other.key); C.act.setOutDef(f(), 0, 'overrun above 30 knots'); C.act.setOutDef(f(), 1, 'overrun at 30 knots or less');
            const s = C.model.solved(f()), lk = C.model.linkedChecks(f(), s), g1 = lk[0].g;
            o.other = { fcId: other.fcId, sev: other.sev, key: other.key };
            o.g1 = g1 ? (g1.shape === 'core-any' ? 'core:' + g1.core.map(e => e.st).join() : g1.sets.map(x => x.map(e => e.st).join('')).join('|')) : null;
            o.events = C.model.budgetEvents(f(), s).map(x => x.k + '>' + x.fcs.join('/'));
            const c0 = s.ds[0]; C.act.setBudget(f(), c0.id + '|D', '1E-05');
            s.ds.slice(1).forEach(d => C.act.setBudget(f(), d.id + '|D', '1E-03'));
            const lk2 = C.model.linkedChecks(f(), C.model.solved(f()))[0]; o.mc = lk2.mc ? { p: lk2.mc.p, missing: lk2.mc.missing, ok: lk2.mc.ok, target: lk2.mc.target } : null;
            o.cov = C.model.coveredBy(other) ? C.model.coveredBy(other).fc.fcId : null;
            A._ui.fc = other.key; A._ui.step = 3; A.kit.draw(); o.redirect = /is the outcome "Low-speed overrun" of the CoFFE table for FC-07/.test(document.querySelector('#interdep-host').innerText) && !!document.querySelector('#interdep-host [data-apx-x^="gofc|"]');
            document.querySelector('#interdep-host [data-apx-x^="gofc|"]').click(); await new Promise(r => setTimeout(r, 300)); o.back = A._ui.fc === K;
            o.left1 = C.model.left(f()).join(' | ');
            return o;
        }, K);
        check('6 the CoFFE cannot be sent until each outcome says what it means and whether the lesser one is a failure condition of its own', /Say what "Loss of deceleration capability on landing" and "Low-speed overrun" means/.test(L.left0) && /is a failure condition of its own/.test(L.left0) && L.left1 === '', L);
        // low-speed overrun or worse: brakes partly lost alone (D O O O), or the other three all partly lost (O D D D)
        check('5 the linked outcome\'s gate is "this outcome or worse": the first function partly lost alone, or the other three together', L.g1 === 'D|DDD', L.g1);
        check('5 the budget list shows which failure condition each event serves', L.events.some(e => /\|D>/.test(e) && e.indexOf(L.other.fcId) !== -1), L.events);
        const p5 = 1e-5 + Math.pow(1e-3, 3) - 1e-5 * Math.pow(1e-3, 3);
        check('5 its math on the same budgets: P = 1E-05 + (1E-03)^3 - both (the exact sum)', L.mc && Math.abs(L.mc.p - p5) / p5 < 1e-12, L.mc);
        check('5 its CoFFE Autopilot points to this table, and the button goes there', L.cov === 'FC-07' && L.redirect && L.back, L);
        // ---- send all three, then the PASA
        const P = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, C = SLApxCof, f = () => A.model.fcOf(K), o = {};
            o.i = A.act.send(f(), 'Test Engineer'); o.m = M.act.send(f(), 'Test Engineer'); o.c = C.act.send(f(), 'Test Engineer');
            const grOf = key => (SLFcTrees.groups('ac') || []).find(x => x && x.gov && String(x.gov.internalId) === String(key));
            const me = SLApxBridge.pasa(grOf(K)), other = C.model.linkedOutcomes(f())[0].fc, them = SLApxBridge.pasa(grOf(other.key));
            const asm = me && me.asmp && me.asmp[0] ? me.asmp[0].rows : [];
            o.asm = asm.map(r => r.ID + ' ' + r.From + ': ' + r.Assumption);
            const again = SLApxBridge.pasa(grOf(K)).asmp[0].rows.map(r => r.ID); o.stable = again.join() === asm.map(r => r.ID).join();
            o.cof = JSON.stringify(me && me.cof || []); o.them = JSON.stringify(them && them.cof || []);
            o.cma = projectConfig.apx.cma && projectConfig.apx.cma[K]; o.cmaTable = /Multisystem and multifunction combinations for the CMA/.test(o.cof);
            const row = systemsData.reduce((a, sy) => a.concat(sy.fha || []), []).find(r => r && r.apx && /On its own/.test(JSON.stringify(r.apx)) && JSON.stringify(r.apx).indexOf('which is ' + other.fcId) !== -1);
            o.ownLine = !!row; o.otherId = other.fcId;
            return o;
        }, K);
        check('all three send', P.i.ok && P.m.ok && P.c.ok, [P.i, P.m, P.c]);
        check('6 the PASA assumptions: what each outcome means, what partly working means for each group, why the erroneous resource has no effect on the brakes; each with a PASA-ASMP ID', P.asm.some(a => /CoFFE Autopilot: Loss of deceleration capability on landing: overrun above 30 knots\./.test(a)) && P.asm.some(a => /MAC Autopilot: Partly working for .* means: /.test(a)) && P.asm.some(a => new RegExp('Interdependence Autopilot: ' + R2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' erroneous has no effect on .*: It also uses wheel speed, developed independently\\.').test(a)) && P.asm.every(a => /^PASA-ASMP-\d\d /.test(a)), P.asm);
        check('6 the IDs do not change when the PASA is drawn again', P.stable);
        check('5 the PASA: this appendix says the linked outcome is its own failure condition and gives its math; the other appendix shows its part of this table', P.cof.indexOf('The outcome \\"Low-speed overrun\\" is ' + P.otherId) !== -1 && P.them.indexOf(P.otherId + ' is the outcome \\"Low-speed overrun\\" of the CoFFE table for FC-07') !== -1, { cof: P.cof.slice(0, 300), them: P.them.slice(0, 400) });
        check('5 the system FHA line says which failure condition it is on its own (the book: see CoFFE line 27)', P.ownLine, P.otherId);
        check('7 the CMA list is in the PASA and kept for the CMA, with the principles it stands for', P.cmaTable && P.cma && P.cma.cases.length > 0 && P.cma.cases.every(c => c.length === 2) && P.cma.principles.length === 3 && P.cma.principles.every(x => /^PASA-INDEP-0\d$/.test(x.id)), P.cma);
        check('8 no page errors', errs.length === 0, errs.join(' | '));
        await pg.context().close();
    } catch (e) { check('browser run completed', false, e && e.stack ? e.stack : String(e)); }
    await brw.close(); srv.close();
    done();
    function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  [mutation: ' + MUT + ']' : '')); process.exit(fail ? 1 : 0); }
})();
