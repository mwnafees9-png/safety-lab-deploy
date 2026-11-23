/* regression_apx_coffe_bridge_20261115.test.js: the CoFFE Autopilot, and what the three Autopilots send to the PASA and
 * to the files that read today's stores (steps 4 and 5 of 5 of the new Autopilots).
 *
 * Waqas, 15 Nov 2026: "while you are at it understand the CoFFE analysis too please"; the tables are "exactly" those of
 * the ARP4761A contiguous example (Q.4-3 to Q.4-11); the Autopilots ask and "the PASA only shows the results"; they
 * "will be upgrading the current MAC/CoFFE and Interdependence interface and replacing them, so we have to absolutely
 * nail this"; weighted MAC rules: "Retire it, convert exactly"; "get steps 3 for and 5 done then we will test it out".
 * Rebuild: apx_coffe.js (SLApxCof 1.0), apx_bridge.js (SLApxBridge 1.0), pasa_autopilot.js 2.5, misc_fn_modules.js
 * (macBreachSetsChecked returns a sent rule's own sets; a sent rule stands for its one failure condition).
 *   1  wording; the CoFFE needs the builds from the MAC and the outcomes named before it asks anything
 *   2  the MAC's answer is outlined on a question; an answer against it is called out as a finding
 *   3  the full table (Q.4-6) has every case with a result, 27 a page, none cut; fewer questions than cases
 *   4  the summary (Q.4-7, Q.4-8): the smallest mixes for the failure condition, the most that can be lost for the
 *      best outcome; the shortest route; a wrong action that causes it alone is a single-failure finding
 *   5  the gate and its probability, exactly: core x (1 - product(1 - p)); a budget over 1 is refused; nothing is
 *      checked until every event has a budget
 *   6  the pairs (Q.4-9): every way of the core event against every way of the others; pairs on one resource are
 *      pulled out (Q.4-10)
 *   7  nothing reaches today's stores until an Autopilot is sent; sending writes them: every function asserted or
 *      cleared, one MAC rule carrying its exact sets, the singles and pairs as signed verdicts
 *   8  today's readers answer from it: macBreachSets, coffeComputed, idpContributors; the earlier MAC rule is kept on
 *      file, not deleted; a rule sent for one failure condition does not speak for another of the same function
 *   9  taking it back out restores today's stores exactly
 *  10  the PASA appendix shows the tables of the book as report tables; a change after sending is a finding there
 *  11  with the switch on the MAC and CoFFE tabs open the Autopilots; today's MAC page stays one click away; with the
 *      switch off the bridge does nothing
 *  13  (17 Nov 2026) the PSSA of a system shows its assemblies and the FHA lines the aircraft level added; one Autopilot
 *      can be taken back out on its own; the pages say "check"
 *  12  no page errors
 * MUTATION PROOFS (SL_APXC_MUTATE): takeall (taking one Autopilot out takes all three), guesssev (the PSSA shows a severity for a line nobody classified), ownwrong (a line's own effect is read from a case with other failures in it), nosug (the MAC's answer is not outlined), badmath (the gate probability is the plain
 *   product), cutrows (the full table drops cases), nofcfilter (a sent rule speaks for every condition of its function),
 *   nosets (today's reader ignores the sent sets), delold (the earlier rule is deleted, not kept), early (stores are
 *   written before sending), offruns (the bridge writes with the switch off). Each must turn this red.
 * Run: node tests/regression_apx_coffe_bridge_20261115.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_APXC_MUTATE || '';
const rd = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function mutate(file, body) {
    if (!MUT) return body;
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing in ' + file + ': ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'takeall' && file === 'apx_bridge.js') rep("var all = !which, ar = p.apx && p.apx.archive;", "var all = true, ar = p.apx && p.apx.archive;");
    if (MUT === 'guesssev' && file === 'apx_bridge.js') rep("Severity: 'Not classified yet' }; })", "Severity: 'Hazardous' }; })");
    if (MUT === 'ownwrong' && file === 'apx_coffe.js') rep("var c = sol.ds.map(function (d, j) { return j === i ? e.st : 'O'; }).join(''), lv = sol.lvl[c];", "var c = sol.ds.map(function (d, j) { return j === i ? e.st : 'F'; }).join(''), lv = sol.lvl[c];");
    if (MUT === 'nosug' && file === 'apx_coffe.js') rep("var m = macSays(fc, nq.c, sol), fco", "var m = null, fco");
    if (MUT === 'badmath' && file === 'apx_engine.js') rep("return { p: pc * (1 - q), core: pc, any: 1 - q };", "return { p: pc * g.any.reduce(function (a, e) { return a * P(e); }, 1), core: pc, any: 1 - q };");
    if (MUT === 'cutrows' && file === 'apx_bridge.js') rep("rows: sol.cases.map(function (c, i) { var row = { 'Case #'", "rows: sol.cases.slice(0, 60).map(function (c, i) { var row = { 'Case #'");
    if (MUT === 'nofcfilter' && file === 'misc_fn_modules.js') rep("r.subId === fc.subId && (!r.apx || String(r.apx.fcId) === String(fc.fcId))", "r.subId === fc.subId");
    if (MUT === 'nosets' && file === 'misc_fn_modules.js') rep("if (rule && rule.apx && Array.isArray(rule.apx.sets)) return", "if (false) return");
    if (MUT === 'delold' && file === 'apx_bridge.js') rep("archive().macModels.push({ rule: old, at: K.now(), by: r.sent.by, replacedBy: rule.id }); moved++;", "moved++;");
    if (MUT === 'early' && file === 'apx_bridge.js') rep("function sentRec(which, fc) { var p = pc(), r = p && p.apx && p.apx[which] && p.apx[which][fc.key]; return r && r.sent ? r : null; }", "function sentRec(which, fc) { var p = pc(), r = p && p.apx && p.apx[which] && p.apx[which][fc.key]; return r ? Object.assign({ sent: { by: 'x', at: 'x' } }, r) : null; }");
    if (MUT === 'early' && file === 'apx_autopilots.js') rep("function touched(fcKey) { var r = rec(fcKey);", "function touched(fcKey) { try { var f0 = fcOf(fcKey); if (f0 && root.SLApxBridge) root.SLApxBridge.project(f0, 'idp'); } catch (_) {} var r = rec(fcKey);");
    if (MUT === 'offruns' && file === 'apx_bridge.js') { rep("if (!A.enabled()) return { ok: false, why: 'The switch is off.' };", ""); rep("        if (!A.enabled()) return null;\n        var fc = fcOfGroup(gr); if (!fc) return null;", "        var fc = fcOfGroup(gr); if (!fc) return null;"); }
    return body;
}

(async () => {
    const cof = rd('apx_coffe.js'), brg = rd('apx_bridge.js');
    check('1 no em dashes, American English', [cof, brg].every(s => s.indexOf(String.fromCharCode(0x2014)) === -1 && !/\b(colour|behaviour|analysed|analysing|centre\b|organis|summaris|recognis|minimis|licence|labelled|cancelled)/i.test(s)));
    const bookNo = /Table\s+Q\.4|Figure\s+Q\.4|Table\s+B3|ARP4761A\s+(Table|Figure)|- \(PASA\)/;
    const strs = s => (s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').match(/'(?:[^'\\\n]|\\.)*'/g) || []).filter(x => bookNo.test(x));
    check('1 the table captions are plain names, and no string in the Autopilots or the bridge carries a table or figure number from the book', ['apx-cap">CoFFE table', 'apx-cap">CoFFE table summary', 'apx-cap">CoFFE table result: ', 'apx-cap">The gate under ', 'apx-cap">Potential failure combinations (fault tree cut sets)'].every(t => cof.indexOf(t) !== -1) && ['apx_autopilots.js', 'apx_mac.js', 'apx_coffe.js', 'apx_bridge.js'].every(f => strs(rd(f)).length === 0), ['apx_autopilots.js', 'apx_mac.js', 'apx_coffe.js', 'apx_bridge.js'].map(f => strs(rd(f)).slice(0, 2)));
    check('1 the result abbreviations are the book\'s: F failed, D degraded, O operational', /Failed \(total loss of function\)/.test(cof) && /Degraded \(partial loss of function\)/.test(cof) && /Operational \(no loss of function\)/.test(cof));

    let pw; try { pw = require('playwright'); } catch (_) { console.log('  SKIP  browser checks (playwright is not installed)'); return done(); }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
    const MUTF = ['apx_coffe.js', 'apx_bridge.js', 'apx_engine.js', 'misc_fn_modules.js', 'apx_autopilots.js'];
    const srv = http.createServer((q, r) => {
        let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
        const f = path.join(SITE, path.normalize(p)); let b;
        try { if (fs.statSync(f).isDirectory()) throw 0; b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
        const base = path.basename(f); if (MUTF.indexOf(base) !== -1) b = Buffer.from(mutate(base, b.toString('utf8')));
        r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(b);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const br = await pw.chromium.launch(), errs = [], tick = ms => new Promise(r => setTimeout(r, ms));
    try {
        const pg = await (await br.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e).slice(0, 300))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html?apx=1'); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(async () => { await loadSampleProject(); }); await tick(4000);
        const K = await pg.evaluate(async () => { const A = SLApxAuto, f = A.model.fcs().find(x => x.fcId === 'FC-07'); A._ui.fc = f.key; A.open('cof'); await new Promise(r => setTimeout(r, 1200)); return f.key; });
        const jump = async i => { await pg.selectOption('[data-apx-jump]', String(i)); await tick(400); };
        const snapFn = () => JSON.stringify({ i: projectConfig.interdep || null, m: projectConfig.macModels || null, c: projectConfig.coffe || null });
        const snap0 = await pg.evaluate(snapFn);

        // ---- 1: what it needs first -------------------------------------------------------------------------------------------
        await jump(3);
        const n1 = await pg.evaluate((K) => { const A = SLApxAuto, C = SLApxCof, f = A.model.fcOf(K); return { txt: document.querySelector('#interdep-host').innerText, ready: C.model.ready(f), left: C.model.left(f) }; }, K);
        check('1 without the builds the CoFFE sends the engineer to the MAC Autopilot', n1.ready === false && /Set the builds in the MAC Autopilot first/.test(n1.txt) && /MAC Autopilot/.test(n1.left[0] || ''), n1);
        // builds, the MAC, one wrong action that only matters with others and one that causes it alone
        const setup = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, C = SLApxCof, f = A.model.fcOf(K);
            // the engineer ticks two shared resources and says which functions each feeds (the tool ticks none: apx_autopilots.js 1.2)
            A.model.resources().slice(0, 2).forEach((r, k) => { A.act.resTick(f, r.key); A.model.picked(f).forEach((c, i) => { if (k === 0 || i < 2) A.act.feed(f, r.key, c.colId); }); });
            // 23 Nov 2026: each resource failure says what it does to each function it feeds (apx_autopilots.js 1.6)
            A.model.resources().slice(0, 2).forEach(r => { A.act.mode(f, r.key, 'Total loss', true); A.act.mode(f, r.key, 'Partial loss', true); A.model.picked(f).forEach(c => { if (A.model.resState(f, r).feeds[c.colId]) { A.act.setCraSt(f, r.key + '|Total loss|' + c.colId, 'total'); A.act.setCraSt(f, r.key + '|Partial loss|' + c.colId, 'partial'); } }); });
            M.model.lossBase(f).forEach(c => M.act.setPattern(f, c.colId, '', 'pairs', 'hand', '')); M.act.setEv(f, 'Landing performance analysis LPA-01');
            window.__truth = c => { const non = c.replace(/O/g, '').length; return c[0] === 'F' && non >= 2; };
            let n = 0; for (;;) { const s = M.model.solved(f); if (s.done) break; const c = SLApx.nextQuestion(s.cols, s.m1, { lo: 0, hi: 1, among: s.cases }); M.act.answer(f, c, window.__truth(c)); if (++n > 500) break; }
            let refused = ''; try { C.act.answer(f, 1, 'FFFF', true); } catch (e) { refused = e.message; }
            return { macQ: n, refused, named: C.model.named(f), out: C.model.outcomes(f) };
        }, K);
        check('1 no question before every outcome is named; the worst outcome is the failure condition itself', setup.named === false && /Name every outcome/.test(setup.refused) && setup.out[0] === 'Loss of deceleration capability on landing', setup);
        await jump(2);
        await pg.fill('#interdep-host input[data-apx-xc="out|1"]', 'No overrun'); await pg.dispatchEvent('#interdep-host input[data-apx-xc="out|1"]', 'change'); await tick(300);
        await pg.click('#interdep-host [data-apx-x="addout"]'); await tick(300);
        await pg.fill('#interdep-host input[data-apx-xc="out|1"]', 'Low-speed overrun'); await pg.dispatchEvent('#interdep-host input[data-apx-xc="out|1"]', 'change'); await tick(300);
        await pg.fill('#interdep-host input[data-apx-xc="resname"]', 'Stopping Capability Result'); await pg.dispatchEvent('#interdep-host input[data-apx-xc="resname"]', 'change'); await tick(200);
        const o = await pg.evaluate((K) => SLApxCof.model.outcomes(SLApxAuto.model.fcOf(K)), K);
        check('1 the outcomes are named on the page, worst first', o.join('|') === 'Loss of deceleration capability on landing|Low-speed overrun|No overrun', o);

        // ---- 2: the MAC's answer outlined ---------------------------------------------------------------------------------------
        await jump(3);
        const q = await pg.evaluate((K) => { const A = SLApxAuto, C = SLApxCof, f = A.model.fcOf(K), s = C.model.solved(f), nq = C.model.next(s), h = document.querySelector('#interdep-host'), sug = h.querySelector('.apx-btn.sug'); return { phase: nq.phase, c: nq.c, mac: C.model.macSays(f, nq.c, s), sug: sug ? sug.getAttribute('data-apx-x') : null, txt: h.innerText, cases: s.cases.length }; }, K);
        check('2 the question asks whether the mix causes the failure condition, and outlines what the MAC says', q.phase === 1 && /Does it cause loss of deceleration capability on landing\?/.test(q.txt) && q.sug === 'a1|' + q.c + '|' + (q.mac ? 1 : 0), q);
        const dis = await pg.evaluate((K) => { const A = SLApxAuto, C = SLApxCof, f = A.model.fcOf(K), s = C.model.solved(f), nq = C.model.next(s), m = C.model.macSays(f, nq.c, s); C.act.answer(f, 1, nq.c, !m); A.kit.draw(); const txt = document.querySelector('#interdep-host').innerText; const n = C.model.disagreements(f, C.model.solved(f)).length; C.act.undo(f); return { n, shown: /disagrees with the MAC\. That is a finding/.test(txt), after: Object.keys(C.model.peek(K).a1).length }; }, K);
        check('2 an answer against the MAC is called out as a finding; undo takes it back', dis.n === 1 && dis.shown && dis.after === 0, dis);

        // ---- 3: the full table ---------------------------------------------------------------------------------------------------
        const full = await pg.evaluate((K) => {
            const A = SLApxAuto, C = SLApxCof, f = A.model.fcOf(K); let n = 0;
            const lvl = c => { const non = c.replace(/O/g, '').length; return window.__truth(c) ? 2 : (c[0] !== 'O' || non >= 3) ? 1 : 0; };
            for (;;) { const s = C.model.solved(f), nq = C.model.next(s); if (!nq) break; if (nq.phase === 1) C.act.answer(f, 1, nq.c, lvl(nq.c) === 2); else C.act.answer(f, 2, nq.c, lvl(nq.c)); if (++n > 800) break; }
            const s = C.model.solved(f), wrong = s.cases.filter(c => s.lvl[c] !== lvl(c)).length; A.kit.draw();
            return { asked: n, cases: s.cases.length, done: s.done, wrong, fl: s.FL };
        }, K);
        check('3 every case gets its result with fewer questions than cases, and each matches the truth', full.done && full.cases === 81 && full.asked < full.cases && full.wrong === 0 && full.fl === 2, full);
        // 17 Nov 2026 (Waqas, on the severity of a line the tool adds: "the aircraft might have sufficient control authority with
        // thrust reverseers and flaps to mitigate it"): the line says what it does on its own, from the table; the severity stays blank
        const own = await pg.evaluate((K) => { const A = SLApxAuto, M = SLApxMac, C = SLApxCof, f = A.model.fcOf(K); M.act.ensureSysFcs(f); C.model.ownEffects(f); const s = C.model.solved(f), d0 = s.ds[0], r = M.model.sysFcRow(M.model.linkOf(f, d0.id + '|F')), r2 = M.model.sysFcRow(M.model.linkOf(f, s.ds[1].id + '|F')); return { eff: r && r.effAc, sev: r && r.severity, eff2: r2 && r2.effAc, case1: s.cases.indexOf('FOOO') + 1, case2: s.cases.indexOf('OFOO') + 1, fcSev: f.sev }; }, K);
        check('4 a system FHA line the tool added says what that failure does on its own, from the CoFFE table, and what it contributes to', new RegExp('^On its own, with the other systems working: low-speed overrun \\(CoFFE case ' + own.case1 + ' of FC-07\\)\\. Contributes to FC-07 \\(.*\\) together with: ').test(own.eff || '') && new RegExp('no overrun \\(CoFFE case ' + own.case2 + ' of FC-07\\)').test(own.eff2 || ''), own);
        check('4 ...and its severity is still blank: mitigated or not is the system engineer\'s call', own.sev === '' && own.fcSev === 'Hazardous', own);
        await jump(4);
        const t46 = await pg.evaluate(() => { const h = document.querySelector('#interdep-host'), t = h.querySelector('table.apx-arp'); return { cap: (h.querySelector('.apx-cap') || {}).innerText.replace(/\s+/g, ' '), rows: t.querySelectorAll('tr').length - 1, first: t.querySelectorAll('tr')[1].innerText.replace(/\s+/g, ' '), pager: (h.querySelector('.apx-pager b') || {}).innerText, head: t.querySelectorAll('tr')[0].innerText.replace(/\s+/g, ' ') }; });
        check('3 the CoFFE table on the page: the book\'s order (case 1 is all failed), 27 cases a page, the result column named', /^CoFFE table$/.test(t46.cap.trim()) && t46.rows === 27 && /^1 F F F F Loss of deceleration capability on landing/.test(t46.first) && t46.pager === 'Cases 1 to 27 of 81' && /STOPPING CAPABILITY RESULT/i.test(t46.head), t46);
        await pg.click('#interdep-host [data-apx-x="page|1"]'); await tick(300); await pg.click('#interdep-host [data-apx-x="page|1"]'); await tick(300);
        const t46c = await pg.evaluate(() => { const rows = document.querySelectorAll('#interdep-host table.apx-arp tr'); return { pager: document.querySelector('#interdep-host .apx-pager b').innerText, last: rows[27].innerText.replace(/\s+/g, ' ') }; });
        check('3 the last page ends at case 81, all operational, the best outcome: nothing is cut', t46c.pager === 'Cases 55 to 81 of 81' && /^81 O O O O No overrun/.test(t46c.last), t46c);

        // ---- 4: summary, shortest route ---------------------------------------------------------------------------------------------
        const sum = await pg.evaluate((K) => { const A = SLApxAuto, C = SLApxCof, f = A.model.fcOf(K), s = C.model.solved(f), rows = C.model.summary(f, s); return { top: rows.filter(r => r.level === 2).map(r => r.c), best: rows.filter(r => r.level === 0).map(r => r.c), sr: C.model.shortest(f, s), con: C.model.conclusions(f, rows.filter(r => r.level === 2), 2, s).filter(x => x && x.t).map(x => x.t) }; }, K);
        check('4 Table Q.4-8: the smallest mixes that cause the failure condition (F with one more degraded)', sum.top.join() === 'FDOO,FODO,FOOD', sum.top);
        check('4 the conclusion is written the book\'s way', sum.con.length === 1 && /^Total loss of .* in addition to partial loss of any .* or .* functions resulting in loss of deceleration capability on landing$/.test(sum.con[0]), sum.con);
        check('4 the best outcome shows the most that can be lost and still be fine', sum.best.length >= 1 && sum.best.every(c => c[0] === 'O'), sum.best);
        check('4 shortest route: two failures together, no single failure', sum.sr.order === 2 && sum.sr.single === false, sum.sr);
        const alone = await pg.evaluate((K) => { const A = SLApxAuto, M = SLApxMac, C = SLApxCof, f = A.model.fcOf(K), ml = M.model.malfList(f); M.act.setMalf(f, ml[2].colId, true, 'alone'); const s = C.model.solved(f), sr = C.model.shortest(f, s), stillDone = s.done; M.act.setMalf(f, ml[2].colId, false, 'alone'); return { sr, stillDone, sev: f.sev }; }, K);
        check('4 a wrong action that causes a Hazardous condition alone is a single-failure finding, and stays out of the table', alone.sr.order === 1 && alone.sr.single === true && alone.stillDone === true, alone);

        // ---- 5: the gate and its probability ------------------------------------------------------------------------------------------
        const g = await pg.evaluate((K) => {
            const A = SLApxAuto, C = SLApxCof, f = A.model.fcOf(K), s = C.model.solved(f), gt = C.model.gate(f, s), evs = C.model.gateEvents(gt);
            const m0 = C.model.mathCheck(f, s), bad = C.act.setBudget(f, evs[0].col + '|' + evs[0].st, 1.5);
            evs.forEach(e => C.act.setBudget(f, e.col + '|' + e.st, e.st === 'F' ? 1e-7 : 1e-3));
            const m1 = C.model.mathCheck(f, s); A.kit.draw();
            return { shape: gt.shape, core: gt.core.length, any: gt.any.length, m0, bad, p: m1.p, target: m1.target, ok: m1.ok, fmt: C.model.fmt(m1.p), ip: C.model.indepList(f, s).map(x => x.text) };
        }, K);
        check('5 the gate is the book\'s shape: the core event AND any one of the others', g.shape === 'core-any' && g.core === 1 && g.any === 3, g);
        check('5 nothing is checked until every event has a budget; a budget over 1 is refused', g.m0.missing === 4 && g.bad === false, g);
        check('5 the probability is exact: 1E-07 x (1 - 0.999^3) = 2.997E-10', Math.abs(g.p - 1e-7 * (1 - Math.pow(0.999, 3))) < 1e-22 && g.fmt === '2.997E-10' && g.target === 1e-7 && g.ok === true, g);
        check('5 one independence principle per combination, in the book\'s words', g.ip.length === 3 && g.ip.every(t => /^The complete loss of .* function and the partial loss of .* function do not result from a single failure or event$/.test(t)), g.ip);
        await jump(6);
        const fig = await pg.evaluate(() => { const h = document.querySelector('#interdep-host'), t = h.querySelector('.apx-tree'); return { cap: Array.from(h.querySelectorAll('.apx-cap')).map(c => c.innerText.replace(/\s+/g, ' '))[0], txt: t ? t.innerText : '', visible: !!t && t.offsetParent !== null && !t.querySelector('details:not([open])') && !t.closest('.sl-fold'), math: h.innerText }; });
        check('5 the gate is drawn open on the page: the failure condition, OR, its .CoFFE gate, AND', /^The gate under FC-07/.test(fig.cap) && fig.visible && /FC-07\.CoFFE/.test(fig.txt) && /\bOR\b/.test(fig.txt) && /\bAND\b/.test(fig.txt) && /Math check, FC-07:/.test(fig.math) && /2\.997E-10 per flight/.test(fig.math), fig.txt.slice(0, 300));

        // ---- 6: the pairs ----------------------------------------------------------------------------------------------------------------
        const pr = await pg.evaluate((K) => {
            const A = SLApxAuto, C = SLApxCof, f = A.model.fcOf(K), s = C.model.solved(f), P = C.model.pairs(f, s), gt = C.model.gate(f, s);
            const fed = d => A.model.resPicked(f).filter(r => A.model.resState(f, r).feeds[d.colId]);
            const f1 = 1 + fed(C.model.colById(s, gt.core[0].col)).length, f2set = {}; gt.any.forEach(e => { const d = C.model.colById(s, e.col); fed(d).forEach(r => { f2set[r.key + '|T>' + d.colId] = 1; f2set[r.key + '|P>' + d.colId] = 1; }); });
            const f2 = Object.keys(f2set).length + gt.any.length;
            return { shape: P.shape, n: P.rows.length, want: f1 * f2, same: P.rows.filter(x => x.same).length, numbered: P.rows.every((x, i) => x.n === i + 1) };
        }, K);
        check('6 Table Q.4-9 lists every way of the core event against every way of the others, numbered', pr.shape === 'pairs' && pr.n === pr.want && pr.n > 0 && pr.numbered, pr);
        await jump(7);
        const t9 = await pg.evaluate(() => Array.from(document.querySelectorAll('#interdep-host .apx-cap')).map(c => c.innerText.replace(/\s+/g, ' ')));
        check('6 pairs resting on one resource are pulled out as their own table, named after the resource', /^Potential failure combinations/.test(t9[0] || '') && pr.same > 0 && /^.+ common source failures/.test(t9[1] || '') && !t9.some(c => /Q\.4|\(PASA\)/.test(c)), { t9, same: pr.same });

        // ---- 7: nothing reaches today's stores until sent ----------------------------------------------------------------------------------
        const snap1 = await pg.evaluate(snapFn);
        check('7 answering all three Autopilots writes nothing into today\'s stores', snap1 === snap0, 'before ' + snap0.length + ' after ' + snap1.length);
        const sent = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, C = SLApxCof, f = () => A.model.fcOf(K), out = {};
            const old = M.model.oldRules(f()).map(r => r.id); out.oldRuleIds = old; out.oldSets = old.length ? macBreachSets((projectConfig.macModels || []).find(r => r.id === old[0])).length : 0;
            out.otherFc = (acFhaData || []).find(r => r.subId === f().subId && String(r.fcId) !== f().fcId) || null; out.otherFc = out.otherFc ? out.otherFc.fcId : null;
            A.model.resPicked(f()).forEach(r => { if (!A.model.resState(f(), r).modes.length) A.act.mode(f(), r.key, 'Total loss', true); });
            A.model.effectRows(f()).forEach(x => { const st = A.model.resState(f(), x.r); A.model.picked(f()).forEach(c => { if (st.feeds[c.colId]) A.act.setCra(f(), x.r.key + '|' + x.mode + '|' + c.colId, 'Function lost'); }); A.act.setCra(f(), x.r.key + '|' + x.mode + '|', 'The failure condition happens'); });
            A.model.effectRows(f()).forEach(x => { const st = A.model.resState(f(), x.r); A.model.picked(f()).forEach(c => { if (st.feeds[c.colId] && !A.model.craState(f(), x.r, x.mode, c.colId)) A.act.setCraSt(f(), x.r.key + '|' + x.mode + '|' + c.colId, x.mode === 'Partial loss' ? 'partial' : 'total'); }); }); out.idp = A.act.send(f(), 'Test Engineer');
            const s = M.model.solved(f()); M.model.rules(s).forEach(x => M.act.setWhy(f(), x.c, 'Not enough stopping force left'));
            const oc = C.model.outcomes(f()); for (let i = 0; i < oc.length - 1; i++) { C.act.setOutDef(f(), i, i === 0 ? 'overrun above 30 knots' : 'overrun at 30 knots or less'); if (i > 0) C.act.setOutFc(f(), i, 'none'); }
            out.mac = M.act.send(f(), 'Test Engineer'); out.cof = C.act.send(f(), 'Test Engineer');
            const cells = projectConfig.interdep.cells, mine = Object.keys(cells).filter(k => k.indexOf(K + '§') === 0);
            out.cells = { n: mine.length, asserted: mine.filter(k => cells[k].state === 'asserted').length, cleared: mine.filter(k => cells[k].state === 'cleared').length, by: mine.every(k => cells[k].by === 'Test Engineer' && cells[k].apx === true), cols: A.model.allCols().length, picked: A.model.picked(f()).length, locked: A.model.picked(f()).filter(c => A.model.cellOf(f(), c).src === 'data').length, derived: A.model.allCols().filter(c => A.kit.derived(f(), c)).length };
            const rule = (projectConfig.macModels || []).find(r => r.apx && r.apx.fcKey === K); out.rule = rule ? { id: rule.id, subId: rule.subId, sets: rule.apx.sets, read: macBreachSets(rule), clauses: rule.clauses.length, kind: rule.substantiation.kind, by: rule.substantiation.by } : null;
            out.want = M.model.breaking(M.model.solved(f())).map(c => c.split('').map((x, i) => x === 'O' ? null : (x === 'F' ? s.ds[i].funcId : 'deg:' + s.ds[i].sysId)).filter(Boolean).length);
            out.stillOld = (projectConfig.macModels || []).filter(r => old.indexOf(r.id) !== -1).length; out.archived = ((projectConfig.apx.archive || {}).macModels || []).map(x => x.rule.id);
            const V = projectConfig.coffe.verdicts, vk = Object.keys(V).filter(k => k.indexOf(K + '§') === 0 && V[k].apx); out.ver = { n: vk.length, yes: vk.filter(k => V[k].verdict === 'yes').map(k => k.split('§')[1]), by: vk.every(k => V[k].by === 'Test Engineer') };
            const cs = C.model.solved(f()); out.computed = cs.cases.filter(c => !/[^FDO]/.test(c)).map(c => { const parts = c.split('').map((x, i) => x === 'O' ? null : { sysId: cs.ds[i].sysId, state: x === 'F' ? 'total loss' : 'partial loss' }).filter(Boolean); if (!parts.length) return null; return (coffeComputed(f().row, { parts }) === 'yes') === (cs.lvl[c] === cs.FL); }).filter(x => x !== null);
            out.contrib = idpContributors(f().row).length;
            const allLost = { parts: cs.ds.map(d => ({ sysId: d.sysId, state: 'total loss' })) };
            out.mine = coffeComputed(f().row, allLost); out.other = coffeComputed({ internalId: -5, fcId: 'ANOTHER-CONDITION', subId: f().subId }, allLost);
            return out;
        }, K);
        check('7 all three are sent with one signature each', sent.idp.ok && sent.mac.ok && sent.cof.ok, sent);
        check('7 today\'s table: every function the project does not derive is asserted or cleared, signed', sent.cells.by && sent.cells.n === sent.cells.cols - sent.cells.derived && sent.cells.asserted === sent.cells.picked - sent.cells.locked && sent.cells.cleared === sent.cells.n - sent.cells.asserted && sent.cells.cleared > 0, sent.cells);
        check('7 one MAC rule for the failure condition, carrying its exact breach sets', sent.rule && sent.rule.id === 'apx-mac-' + K && sent.rule.sets.length === sent.want.length && sent.rule.by === 'Test Engineer' && sent.rule.kind === 'assumption', sent.rule);
        check('8 today\'s reader (macBreachSets) returns the sent sets as they are, partial losses included', JSON.stringify(sent.rule.read) === JSON.stringify(sent.rule.sets) && sent.rule.sets.some(s => s.some(t => /^deg:/.test(t))) && sent.rule.sets.every(s => s.some(t => !/^deg:/.test(t))), sent.rule.sets);
        check('8 the earlier rule of this function is kept on file, not deleted, and no longer read', sent.oldRuleIds.length >= 1 && sent.stillOld === 0 && sent.oldRuleIds.every(id => sent.archived.indexOf(id) !== -1), { old: sent.oldRuleIds, archived: sent.archived, still: sent.stillOld });
        check('7 the singles and pairs of whole-system failures are signed verdicts', sent.ver.n > 0 && sent.ver.by && sent.ver.yes.length > 0 && sent.ver.yes.every(k => k.split('∧').length === 2), sent.ver);
        check('8 today\'s computed lane (coffeComputed) agrees with the full table on every loss case', sent.computed.length === 80 && sent.computed.every(Boolean), sent.computed.filter(x => !x).length + ' disagree');
        check('8 today\'s contributors still answer', sent.contrib >= sent.cells.picked, sent.contrib);
        check('8 a rule sent for one failure condition answers for it, and does not speak for another condition of the same function', sent.mine === 'yes' && sent.other === null, { mine: sent.mine, other: sent.other });

        // ---- 10: the PASA ---------------------------------------------------------------------------------------------------------------------
        const pasa = await pg.evaluate((K) => {
            const A = SLApxAuto, B = SLApxBridge, f = A.model.fcOf(K), gr = SLFcTrees.groups('ac').find(g => String(g.gov.internalId) === K), ax = B.pasa(gr);
            const blocks = SLPasaAuto.fnSection(f.subId, {}), arr0 = Array.isArray(blocks) ? blocks : (blocks && blocks.blocks) || [];
            const tabs = arr0.filter(b => b && b.k === 'table' && /^apx-/.test(b.name || ''));
            const by = n => tabs.find(t => t.name === 'apx-' + n + '-FC-07');
            const q41 = by('q41'), q46 = by('q46'), q48 = by('q48'), q49 = by('q49'), mac = by('mac'), bud = by('bud');
            return { names: tabs.map(t => t.name.replace('-FC-07', '').replace(/^apx-/, '')), heads: arr0.filter(b => b && b.k === 'h').map(b => b.text), q41: q41 && { keys: Object.keys(q41.rows[0]), xs: Object.values(q41.rows[0]).filter(v => v === 'X').length, title: q41.title }, q46: q46 && { n: q46.rows.length, first: Object.values(q46.rows[0]).join(' '), last: Object.values(q46.rows[80]).join(' ') }, q48: q48 && q48.rows.length, q49: q49 && q49.rows.length, mac: mac && mac.rows.map(r => r.Why), bud: bud && bud.lead, picked: A.model.picked(f).length, ax: !!ax, titles: tabs.map(t => t.title) };
        }, K);
        check('10 the PASA appendix carries the tables of the book, in order', pasa.ax && ['q41', 'q42', 'b3', 'build', 'mac', 'links', 'q43', 'q44', 'q46', 'q47', 'q48', 'bud', 'ind', 'q49'].every((n, i, a) => pasa.names.indexOf(n) !== -1 && (i === 0 || pasa.names.indexOf(n) > pasa.names.indexOf(a[i - 1]))), pasa.names);
        check('10 Table Q.4-1 there: AC function, AC FC ID, AC FC description, then one X per ticked function and no other column', pasa.q41 && pasa.q41.keys.slice(0, 3).join('|') === 'AC Function|AC FC ID|AC FC Description' && pasa.q41.keys.length === 3 + pasa.picked && pasa.q41.xs === pasa.picked && /^Interdependence table for FC-07$/.test(pasa.q41.title), pasa.q41);
        check('10 no report table title carries a number from the book: the report numbers its own tables in sequence', pasa.titles.length >= 10 && !pasa.titles.some(t => /Q\.4|ARP4761A|Table B3|Figure/.test(t)), pasa.titles);
        check('10 Table Q.4-6 there has all 81 cases, first all failed, last all operational', pasa.q46 && pasa.q46.n === 81 && /^1 F F F F Loss of deceleration/.test(pasa.q46.first) && /^81 O O O O No overrun/.test(pasa.q46.last), pasa.q46);
        check('10 the result, the pairs, the MAC rules with their reasons and the budget math are there, per flight and then per flight hour', pasa.q48 === 3 && pasa.q49 === pr.n && pasa.mac.length > 0 && pasa.mac.every(w => /stopping force/.test(w)) && /= 2\.997E-10 per flight\. Over a [0-9.]+ h flight that is [0-9.]+E-10 per flight hour, within the 1\.0E-07 per flight hour objective/.test(pasa.bud || ''), { q48: pasa.q48, q49: pasa.q49, bud: pasa.bud });
        check('10 the appendix has its MAC and CoFFE parts', pasa.heads.some(h => /Minimum acceptable configuration \(MAC\)/.test(h)) && pasa.heads.some(h => /Combined functional failure effects \(CoFFE\)/.test(h)), pasa.heads);
        const chg = await pg.evaluate((K) => { const A = SLApxAuto, C = SLApxCof, B = SLApxBridge, f = A.model.fcOf(K), gr = SLFcTrees.groups('ac').find(g => String(g.gov.internalId) === K); C.act.setResultName(f, 'Stopping Result'); const ax = B.pasa(gr); const blocks = SLPasaAuto.fnSection(f.subId, {}), arr0 = Array.isArray(blocks) ? blocks : (blocks && blocks.blocks) || []; const fin = arr0.filter(b => b && b.k === 'p' && /changed after being sent/.test(b.text || '')).length; const st = C.model.status(f).k; C.act.send(f, 'Test Engineer'); return { changed: ax.changed, cof: ax.cof, fin, st }; }, K);
        check('10 a change after sending takes that part out of the appendix and is a finding there until it is sent again', chg.st === 'changed' && chg.changed.join() === 'CoFFE' && chg.cof === null && chg.fin === 1, chg);

        // ---- 13: 17 Nov 2026 (Waqas: "all three"): the system level reads what the aircraft level added; one part can be taken out ----
        const sysl = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, B = SLApxBridge, f = A.model.fcOf(K), c0 = M.model.lossBase(f)[0], sy = systemsData.find(x => String(x.id) === c0.sysId);
            const front = (B.pssa(sy) || {}).front || [], asm = front.find(b => /^apx-asm-/.test(b.name)), wait = front.find(b => /^apx-wait-/.test(b.name));
            const l = M.model.linkOf(f, M.model.macCols(f)[0].id + '|F'), para = B.pssaFc(sy, { fcId: l.fcId }) || [];
            let pssaFront = null; try { window.activeSystemId = sy.id; } catch (_) {}
            return { asm: asm && asm.rows.map(r => r.ID + '|' + r.Assembly + '|' + r.Build), wait: wait && wait.rows.map(r => r.Severity + '|' + r['Came from'] + '|' + (r['What the aircraft-level work says'] || '').slice(0, 30)), lead: wait && wait.lead, para: para.map(x => x.text), link: l.id, units: M.model.macCols(f)[0].g.units.map(u => u.id) };
        }, K);
        check('13 the PSSA of a system lists its assemblies as set at the aircraft level, under the same IDs', sysl.asm && sysl.asm.length === 2 && sysl.asm.every((r, i) => r.indexOf(sysl.units[i] + '|') === 0 && /Inboard and outboard pairs/.test(r)), sysl.asm);
        check('13 it lists the FHA lines the aircraft level added, not classified, with where each came from and what the aircraft-level work says', sysl.wait && sysl.wait.length >= 2 && sysl.wait.every(r => /^Not classified yet\|FC-07\|/.test(r)) && sysl.wait.some(r => /On its own, with the other/.test(r)) && /does not set their severity/.test(sysl.lead), sysl.wait);
        check('13 a system failure condition says which aircraft-level loss it is, its link, and the assemblies its fault tree starts from', sysl.para.length === 1 && sysl.para[0].indexOf('(link ' + sysl.link + ')') !== -1 && /FC-07 Loss of deceleration/.test(sysl.para[0]) && sysl.units.every(u => sysl.para[0].indexOf(u) !== -1), sysl.para);
        const pdoc = await pg.evaluate((K) => { const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K), sid = M.model.lossBase(f)[0].sysId; try { activeSystemId = sid; } catch (_) {} const d = SLCcaReport.get('pssa').doc({}); return { now: SLPssaAuto.sysNow() && SLPssaAuto.sysNow().id, sid, names: d.filter(b => b && b.k === 'table' && /^apx-/.test(b.name || '')).map(b => b.name) }; }, K);
        check('13 the PSSA report of that system (pssa_autopilot.js 2.4) carries both tables', pdoc.now === pdoc.sid && pdoc.names.join() === 'apx-asm-' + pdoc.sid + ',apx-wait-' + pdoc.sid, pdoc);
        const words = await pg.evaluate(async () => { const A = SLApxAuto, out = []; for (const ap of ['mac', 'cof']) { A.setAp(ap); for (let i = 1; i < 9; i++) { A._ui.step = i; A.kit.draw(); const h = document.querySelector('#interdep-host'); const t = h.innerText + ' ' + Array.from(h.querySelectorAll('[aria-label],[placeholder]')).map(e => (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('placeholder') || '')).join(' '); if (/\btick|untick/i.test(t)) out.push(ap + i); } } return out; });
        check('13 the MAC and CoFFE pages say "check", never "tick"', words.length === 0, words);
        const part = await pg.evaluate((K) => {
            const A = SLApxAuto, f = A.model.fcOf(K), old = ((projectConfig.apx.archive || {}).macModels || []).map(x => x.rule.id);
            const ver = () => Object.keys(projectConfig.coffe.verdicts).filter(k => k.indexOf(K + '§') === 0 && projectConfig.coffe.verdicts[k].apx).length, cells = () => Object.keys(projectConfig.interdep.cells).filter(k => k.indexOf(K + '§') === 0 && projectConfig.interdep.cells[k].apx).length;
            const v0 = ver(), c0 = cells(); A.setAp('mac'); A._ui.step = 8; A.kit.draw(); const btn = !!document.querySelector('#interdep-host [data-apx-take="mac|ask"]');
            const done = A.kit.doTakeOut(f, 'mac');
            const out = { btn, done, rule: (projectConfig.macModels || []).some(r => r.apx && r.apx.fcKey === K), back: old.every(id => (projectConfig.macModels || []).some(r => r.id === id)), old: old.length, v0, v1: ver(), c0, c1: cells(), st: SLApxMac.model.status(f).k, cof: SLApxCof.model.status(f).k };
            SLApxMac.act.send(f, 'Test Engineer');
            return out;
        }, K);
        check('13 one Autopilot can be taken back out on its own: the MAC rule goes, the earlier rule comes back, the CoFFE and Interdependence stay sent', part.btn && part.done && !part.rule && part.old >= 1 && part.back && part.v1 === part.v0 && part.v0 > 0 && part.c1 === part.c0 && part.st === 'started' && part.cof === 'sent', part);

        // ---- 11: the old screens ----------------------------------------------------------------------------------------------------------------
        const nav = await pg.evaluate(async () => {
            const A = SLApxAuto, wait = ms => new Promise(r => setTimeout(r, ms)), vis = id => { const v = document.getElementById(id); return !!v && v.offsetParent !== null; }, out = {};
            switchTab('pasa'); await wait(1500); out.entry = Array.from(document.querySelectorAll('#view-pasa [data-apx-open]')).map(b => b.innerText);
            out.left = !!document.querySelector('#view-pasa [data-paq-apx]') || 'not open';
            switchTab('mac'); await wait(1200); out.mac = { ap: A._ui.ap, auto: vis('view-interdep') && !!document.querySelector('#interdep-host .apx'), oldPage: vis('view-mac') };
            switchTab('coffe'); await wait(1200); out.cof = { ap: A._ui.ap, auto: vis('view-interdep') };
            A.setAp('mac'); A.kit.draw(); document.querySelector('#interdep-host [data-apx-view="old"]').click(); await wait(1500); out.old = { oldPage: vis('view-mac'), back: !!document.querySelector('#view-mac [data-apx-macback]') };
            const b = document.querySelector('#view-mac [data-apx-macnew]'); if (b) b.click(); await wait(1200); out.backTo = { ap: A._ui.ap, auto: vis('view-interdep') };
            return out;
        });
        check('11 the PASA page offers the three Autopilots', nav.entry.join('|') === 'Interdependence Autopilot|MAC Autopilot|CoFFE Autopilot', nav.entry);
        check('11 with the switch on, the MAC model tab opens the MAC Autopilot and the CoFFE tab the CoFFE Autopilot', nav.mac.ap === 'mac' && nav.mac.auto && !nav.mac.oldPage && nav.cof.ap === 'cof' && nav.cof.auto, nav);
        check('11 today\'s MAC page is one click away, with the way back', nav.old.oldPage && nav.old.back && nav.backTo.ap === 'mac' && nav.backTo.auto, nav);

        // ---- 9: taking it back out ----------------------------------------------------------------------------------------------------------------
        const un = await pg.evaluate(([K, s0]) => { const A = SLApxAuto, B = SLApxBridge, f = A.model.fcOf(K); B.unproject(f); const now = JSON.stringify({ i: projectConfig.interdep || null, m: projectConfig.macModels || null, c: projectConfig.coffe || null }); const a = JSON.parse(s0), b = JSON.parse(now); const ids = x => (x.m || []).map(r => r.id).sort().join(); const canon = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]])); return { same: now === s0, mac: ids(a) === ids(b), macRules: JSON.stringify((a.m || []).slice().sort((x, y) => x.id < y.id ? -1 : 1)) === JSON.stringify((b.m || []).slice().sort((x, y) => x.id < y.id ? -1 : 1)), cells: canon((a.i || {}).cells || {}) === canon((b.i || {}).cells || {}), ver: canon((a.c || {}).verdicts || {}) === canon((b.c || {}).verdicts || {}), cra: canon(((a.i || {}).cra) || {}) === canon(((b.i || {}).cra) || {}) }; }, [K, snap0]);
        check('9 taking it back out restores today\'s cells, common resource text, MAC rules (the earlier one back in) and verdicts exactly', un.mac && un.macRules && un.cells && un.ver && un.cra, un);

        // ---- 11: switch off -----------------------------------------------------------------------------------------------------------------------
        const off = await pg.evaluate(async (K) => {
            const A = SLApxAuto, B = SLApxBridge, f = A.model.fcOf(K), gr = SLFcTrees.groups('ac').find(g => String(g.gov.internalId) === K), wait = ms => new Promise(r => setTimeout(r, ms));
            const before = JSON.stringify({ i: projectConfig.interdep || null, m: projectConfig.macModels || null, c: projectConfig.coffe || null });
            A.off(); const out = { pasa: B.pasa(gr), p1: B.project(f, 'idp'), p2: B.project(f, 'mac'), p3: B.project(f, 'cof') };
            out.same = JSON.stringify({ i: projectConfig.interdep || null, m: projectConfig.macModels || null, c: projectConfig.coffe || null }) === before;
            switchTab('mac'); await wait(1200); const v = document.getElementById('view-mac'); out.macOld = !!v && v.offsetParent !== null;
            switchTab('pasa'); await wait(1200); out.entry = !!document.querySelector('#view-pasa [data-apx-entry]');
            A.on(); return out;
        }, K);
        check('11 with the switch off the bridge writes nothing and shows nothing; the MAC tab is today\'s page', off.pasa === null && off.same && off.macOld && !off.entry, off);
        check('12 no page errors', errs.length === 0, errs.join(' | '));
        await pg.context().close();
    } catch (e) { check('browser run completed', false, e && e.stack ? e.stack : String(e)); }
    await br.close(); srv.close();
    done();
    function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  [mutation: ' + MUT + ']' : '')); process.exit(fail ? 1 : 0); }
})();
