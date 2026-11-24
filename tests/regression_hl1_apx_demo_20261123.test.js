/* THE AEOLUS HL-1 DEMO WITH THE AUTOPILOTS DONE (23 Nov 2026).
 * Waqas: Radia wants "the aeolus demos fully populated with the autopilots"; "demo in all the builds need to upgraded with all
 * the latest information"; on the count of failures in the CoFFE summary: "Fix it".
 * 23 Nov 2026, later (Waqas: "lets fill those out in full, human factors, a full scale demo that any customer can use",
 * "please expand the size of the demo"): twenty-four systems and sixty failure conditions; the ten human factors steps and
 * the three program plans filled too.
 *   0  the files: demo/hl1_apx.js, hl1_hf.js and hl1_plans.js hold inputs only and are loaded by the demo; the kill switch; pins
 *   1  as every customer opens it (24 Nov 2026: the Autopilots are on for everyone, no address switch): all thirty failure conditions are answered and sent in all three Autopilots,
 *      signed by the demo's engineer on a fixed date, and carried to today's stores (MAC rules, CoFFE verdicts, interdependence)
 *   2  every table meets its objectives; no Catastrophic or Hazardous failure condition has a single-failure route; the only
 *      single failures are the two resource ones on Major failure conditions (FC-20 bleed air, FC-24 115 VAC)
 *   3  shared equipment carries one budget everywhere; the MAC and the CoFFE agree on every case; every system FHA line the
 *      Autopilots added is classified
 *   4  FC-06 has two CoFFE sources (its own table and FC-05's middle outcome), added together
 *   5  the count of failures: both units of a pair = 2, one unit = 1, one resource failure that takes out several groups = 1
 *   6  the PASA shows the Interdependence, MAC and CoFFE parts; the kill switch opens the demo without them
 *   8  the HF Autopilot: all ten steps answered and signed by the demo's human factors engineer on a fixed date; every task
 *      time is labeled as an assumption; no pilot over the 80 per cent line in any phase; every flight deck control and display
 *      asked the four 25.1302 questions and reach and view
 *   9  the three plans are Ready to issue, signed by the chief safety engineer
 *   7  no page errors
 * Mutations (SL_HL1_MUTATE): nofill (the demo does not fill), hfcache (the HF questions kept through a change of shape), colcount (failures counted as table columns), nodedupe (a broken
 * MAC rule listed once per combination in the zonal report).
 */
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' (' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 1500) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site'), MUT = process.env.SL_HL1_MUTATE || '';
function mutate(file, body) {
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing: ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'nofill' && file === 'hl1_showcase.js') rep("var fr = window[F[2]].fill();", "var fr = { ok: true, sent: 0, problems: [] };");
    if (MUT === 'hfcache' && file === 'hf_autopilot.js') rep("q.apply(pick); _shape(); _save(); return true;", "q.apply(pick); _save(); return true;");
    if (MUT === 'colcount' && file === 'apx_coffe.js') rep("var k = p.map.indexOf(st); return k > 0 ? k : 1;", "return 1;");
    if (MUT === 'nodedupe' && file === 'zsa_autopilot.js') rep("var brs = _arr(ev.breaches).filter(function (b, i, all) { return all.findIndex(function (x) { return x.ruleId === b.ruleId; }) === i; });", "var brs = _arr(ev.breaches);");
    return body;
}
(async () => {
    const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), plan = fs.readFileSync(path.join(SITE, 'demo', 'hl1_apx.js'), 'utf8'), ldr = fs.readFileSync(path.join(SITE, 'hl1_showcase.js'), 'utf8');
    check('0 demo/hl1_apx.js: the builds, the resource answers, the sixty failure conditions and the budgets, and fill(); no em dash', /const BUILDS = \{/.test(plan) && /const RES_BY_FN = \{/.test(plan) && (plan.match(/^        'FC-\d\d': \{ /gm) || []).length === 120 && /function fill\(\)/.test(plan) && !/—/.test(plan));
    const hf = fs.readFileSync(path.join(SITE, 'demo', 'hl1_hf.js'), 'utf8'), pl = fs.readFileSync(path.join(SITE, 'demo', 'hl1_plans.js'), 'utf8');
    check('0 demo/hl1_hf.js and demo/hl1_plans.js: the answers and fill(), the task times labeled as assumptions; no em dash', /const ALLOC = \{/.test(hf) && /Assumed pending simulator evidence/.test(hf) && /function fill\(\)/.test(hf) && /const ANSWERS = \{/.test(pl) && /function fill\(\)/.test(pl) && !/\u2014/.test(hf + pl));
    check('0 the demo loads the three after its engines run, plans first, behind a kill switch, each at its own cache key', /var APX_SRC = 'demo\/hl1_apx\.js\?v=\d+', HF_SRC = 'demo\/hl1_hf\.js\?v=\d+', PLANS_SRC = 'demo\/hl1_plans\.js\?v=\d+'/.test(ldr) && /if \(!window\.SL_HL1_APX_OFF\) \{\s*var fills = \[\['sl-hl1-plans', PLANS_SRC[^\n]*\['sl-hl1-apx', APX_SRC[^\n]*\['sl-hl1-hf', HF_SRC/.test(ldr) && ldr.indexOf("window.SL_SHOWCASE_HL1.postLoad()") < ldr.indexOf("var fills = "));
    check('0 pins: hl1_showcase 12, the demo 8, autopilot_ui 1.6, hf_autopilot 2.2, plan_autopilot 2.5, apx_autopilots 1.8, apx_coffe 1.8, apx_bridge 1.9, zsa_autopilot 1.11, pra_autopilot 2.11', ["demo_showcase_hl1.js?v=8'", 'autopilot_ui.js?v=1.6"', 'hf_autopilot.js?v=2.2"', 'plan_autopilot.js?v=2.5"', 'hl1_showcase.js?v=12"', 'apx_autopilots.js?v=1.8"', 'apx_coffe.js?v=1.8"', 'apx_bridge.js?v=1.9"', 'zsa_autopilot.js?v=1.11"', 'pra_autopilot.js?v=2.11"'].every(x => idx.indexOf(x) > 0));
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
    const openDemo = async (q, before) => {
        const pg = await (await brw.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e).slice(0, 300))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html' + q); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(async (b) => { if (b) window.SL_HL1_APX_OFF = true; await loadHL1Demo(); }, !!before); await tick(3000);
        return pg;
    };
    try {
        // ---- as every customer opens it (no ?apx in the address) -------------------------------------------------------------
        let pg = await openDemo('');
        const R = await pg.evaluate(() => {
            const A = SLApxAuto, M = SLApxMac, C = SLApxCof, pc = A.kit.pc(), o = {}, fcs = A.model.fcs();
            const sent = k => fcs.filter(f => { const r = pc.apx && pc.apx[k] && pc.apx[k][f.key]; return r && r.sent && r.sent.by === 'M. Chen' && r.sent.at === '2026-11-23T16:00:00.000Z'; }).length;
            o.on = A.enabled(); o.fill = window.__slHl1ApxFill; o.n = fcs.length; o.sent = [sent('idp'), sent('mac'), sent('cof')];
            o.rules = (pc.macModels || []).filter(r => r.apx).length; o.verdicts = Object.keys((pc.coffe && pc.coffe.verdicts) || {}).filter(k => pc.coffe.verdicts[k].apx).length;
            o.cells = Object.keys((pc.interdep && pc.interdep.cells) || {}).filter(k => pc.interdep.cells[k].apx).length;
            o.per = fcs.map(f0 => {
                const f = A.model.fcOf(f0.key), s = C.model.solved(f), mc = C.model.mathCheck(f, s), sr = C.model.shortest(f, s), P = C.model.pairs(f, s);
                return { id: f.fcId, sev: f.sev, ok: (!mc || mc.ok === true) && C.model.linkedChecks(f, s).every(l => l.mc && l.mc.ok === true), mcNull: !mc, order: sr ? sr.order : null, single: sr ? sr.single : null, singles: P ? (P.singles || []).map(r => r.parts[0]) : [], dis: C.model.disagreements(f, s).length, b: (C.model.peek(f.key) || {}).budgets || {} };
            });
            o.rows = []; SLStores.snapshot().systemsData.forEach(sy => (sy.fha || []).forEach(r => { if (r && r.apx) o.rows.push({ id: r.fcId, sev: r.severity || '' }); }));
            const srcOf = id => { const f = A.model.fcOf(fcs.find(x => x.fcId === id).key), cmb = C.model.combined(f, true); return { n: cmb.n, own: (cmb.sources || []).filter(x => x.own).length, p: cmb.p, parts: (cmb.sources || []).map(x => x.mc && x.mc.p), ok: cmb.ok }; };
            o.f6 = srcOf('FC-06'); o.f57 = srcOf('FC-57'); o.f59 = srcOf('FC-59');
            // the HF Autopilot and the plans
            const H = SLHfAuto, hs = pc.hfAuto || {}; o.hf = { cov: H.coverage().map(x => ({ n: x.n, state: x.state, by: x.signedBy })), signed: Object.keys(hs.signed || {}).map(k => hs.signed[k].by + '@' + hs.signed[k].at),
                wl: H.workload().map(w => [w.PF.normal, w.PF.worst ? w.PF.worst.total : 0, w.PM.normal, w.PM.worst ? w.PM.worst.total : 0]), basis: (window.SLEnv.get('projectConfig').hf || {}), ifs: H.interfaces().length, cdN: H.compute().byKey.cd.questions.length };
            const tasks = ((pc.hf && pc.hf.tasks && pc.hf.tasks.rows) || []).filter(t => t.hfAutoKey); o.hf.tasks = tasks.length; o.hf.unlabeled = tasks.filter(t => (t.reactionS || t.shareP) && !/^Assumed pending simulator evidence/.test(t.basis || '')).length;
            const P = SLPlanAuto; o.plans = P.PLANS.map(p => P.status(p.key).state); o.planWho = Array.from(new Set(Object.values((pc.planAuto || {}).who || {}).map(w => typeof w === 'string' ? w : (w && w.by) || '')));
            // the count of failures, on the demo's own tables
            const f1 = A.model.fcOf(fcs.find(f => f.fcId === 'FC-01').key), s1 = C.model.solved(f1), d0 = s1.ds[0], d1 = s1.ds[1];
            const cF = s1.ds.map((d, i) => i === 0 ? 'F' : 'O').join(''), cD = s1.ds.map((d, i) => i === 0 ? 'D' : 'O').join(''), cFF = s1.ds.map((d, i) => i < 2 ? 'F' : 'O').join('');
            o.count = { pairF: C.model.failuresIn(f1, s1, cF).n, pairD: C.model.failuresIn(f1, s1, cD).n, twoF: C.model.failuresIn(f1, s1, cFF).n, names: [d0.name, d1.name] };
            const f13 = A.model.fcOf(fcs.find(f => f.fcId === 'FC-13').key), s13 = C.model.solved(f13), tri = s13.ds.find(d => d.name === 'Probe heaters');
            o.count.triD = C.model.unitsFor(tri, 'D'); o.count.triF = C.model.unitsFor(tri, 'F');
            // one resource failure covering two groups: FC-08's reversers and spoilers both partly lost by hydraulic system A
            const f8 = A.model.fcOf(fcs.find(f => f.fcId === 'FC-08').key), s8 = C.model.solved(f8), c8 = s8.ds.map(d => d.name === 'Thrust reversers' || d.name === 'Ground spoilers' ? 'D' : 'O').join(''), x8 = C.model.failuresIn(f8, s8, c8);
            o.count.res = { n: x8.n, by: x8.by.length };
            // the zonal report: each broken rule once
            const secs = SLZsaAuto.reportSections(); o.zdup = [];
            secs.forEach(sx => { const t = sx.blocks.find(b => b.type === 'table' && /-mac$/.test(b.id)); if (!t) return; const keys = t.rows.map(r => r.join('|')); if (new Set(keys).size !== keys.length) o.zdup.push(sx.code); });
            return o;
        });
        check('1 opened as every customer opens it (the Autopilots on, no address switch), the demo fills: all sixty failure conditions, no problems', R.on === true && R.fill && R.fill.ok === true && R.fill.sent === 60 && R.n === 60, R.fill);
        check('1 all three Autopilots sent for every failure condition, signed by M. Chen on 23 Nov 2026', R.sent.every(n => n === 60), R.sent);
        check('1 carried to today\'s stores: sixty MAC rules, the CoFFE verdicts and the interdependence cells', R.rules === 60 && R.verdicts > 60 && R.cells > 1000, { rules: R.rules, verdicts: R.verdicts, cells: R.cells });
        const bad = R.per.filter(x => !x.ok);
        check('2 every table meets its objectives (its own gate and every linked outcome)', bad.length === 0, bad.map(x => x.id));
        const sp = R.per.filter(x => /Catastrophic|Hazardous/.test(x.sev) && (x.single || (x.order !== null && x.order < 2)));
        check('2 no Catastrophic or Hazardous failure condition has a single-failure route', sp.length === 0, sp.map(x => x.id + ':' + x.order));
        const singles = R.per.filter(x => x.singles.length).map(x => x.id + ':' + x.sev + ':' + x.singles.join('/'));
        const want = ['FC-20:Major:Engine bleed air total loss', 'FC-24:Major:115 VAC electrical power total loss', 'FC-37:Major:', 'FC-45:Minor:', 'FC-50:Major:', 'FC-51:Major:'];
        check('2 the only single failures are on Major and Minor failure conditions: two resource ones (bleed air, 115 VAC) and four one-unit functions (APU, water, terrain, collision avoidance)', singles.length === want.length && want.every((w, i) => singles[i].indexOf(w) === 0), singles);
        const byEv = {}; R.per.forEach(x => Object.keys(x.b).forEach(k => { (byEv[k] = byEv[k] || new Set()).add(x.b[k]); }));
        const split = Object.keys(byEv).filter(k => byEv[k].size > 1);
        check('3 shared equipment carries one budget in every table that uses it', Object.keys(byEv).length > 40 && split.length === 0, split);
        check('3 the MAC and the CoFFE agree on every case', R.per.every(x => x.dis === 0), R.per.filter(x => x.dis).map(x => x.id));
        check('3 every system FHA line the Autopilots added is classified', R.rows.length > 60 && R.rows.every(r => r.sev), R.rows.filter(r => !r.sev).slice(0, 5));
        const s6 = R.f6.parts.reduce((a, b) => a + b, 0);
        check('4 FC-06: its own table and FC-05\'s middle outcome, added together, within the objective', R.f6.n === 2 && R.f6.own === 1 && Math.abs(R.f6.p - s6) / s6 < 1e-12 && R.f6.ok === true, R.f6);
        check('4 FC-57 (two hydraulic systems, from FC-27) and FC-59 (all engine generators, from FC-26): two sources each, within the objective', [R.f57, R.f59].every(x => x.n === 2 && x.own === 1 && x.ok === true), [R.f57, R.f59]);
        check('8 the HF Autopilot: all ten steps answered and signed by R. Valdez on 23 Nov 2026', R.hf.cov.length === 10 && R.hf.cov.every(x => x.state === 'done' && x.by === 'R. Váldez') && R.hf.signed.length === 10 && R.hf.signed.every(x => x === 'R. Váldez@2026-11-23T16:30:00.000Z'), R.hf.cov);
        check('8 every task time and share is labeled as an assumption pending simulator evidence', R.hf.tasks > 100 && R.hf.unlabeled === 0, { tasks: R.hf.tasks, unlabeled: R.hf.unlabeled });
        check('8 no pilot over the 80 per cent line in any phase, normal or with the worst failure on top', R.hf.wl.length === 8 && R.hf.wl.every(w => w.every(v => v != null && v <= 80)), R.hf.wl);
        check('8 every flight deck control and display (and every alert) is asked the 25.1302 questions', R.hf.ifs > 100 && R.hf.cdN === R.hf.ifs, { ifs: R.hf.ifs, cd: R.hf.cdN });
        check('9 the three plans are Ready to issue, answered by J. Okafor', R.plans.join() === 'ready,ready,ready' && R.planWho.length === 1 && /J\. Okafor/.test(R.planWho[0]), { plans: R.plans, who: R.planWho });
        check('5 counted in failures: both ' + R.count.names[0] + ' = 2, either one = 1, both groups = 4', R.count.pairF === 2 && R.count.pairD === 1 && R.count.twoF === 4, R.count);
        check('5 two of three probe heaters = 2, all three = 3', R.count.triD === 2 && R.count.triF === 3, R.count);
        check('5 hydraulic system A partly losing both the reversers and the ground spoilers is one failure, named', R.count.res.n === 1 && R.count.res.by === 1, R.count.res);
        check('3 the zonal report lists each broken MAC rule once', R.zdup.length === 0, R.zdup);
        await pg.context().close();
        // ---- the PASA parts ---------------------------------------------------------------------------------
        pg = await openDemo('');
        const ON = await pg.evaluate(() => { const g = (SLFcTrees.groups('ac') || []).find(x => x && x.gov && x.gov.fcId === 'FC-01'), px = SLApxBridge.pasa(g); return { on: SLApxAuto.enabled(), idp: !!(px && px.idp), mac: !!(px && px.mac), cof: !!(px && px.cof), txt: JSON.stringify(px && px.cof || []).slice(0, 20000) }; });
        check('6 the PASA for FC-01 has the Interdependence, MAC and CoFFE parts, the shortest route counted in failures', ON.on && ON.idp && ON.mac && ON.cof && /Shortest route to [^.]*: 2 failures together/.test(ON.txt), ON.txt.slice(0, 400));
        await pg.context().close();
        pg = await openDemo('', true);
        const OFF = await pg.evaluate(() => { const pc = SLApxAuto.kit.pc(); return { fill: window.__slHl1ApxFill || null, rules: (pc.macModels || []).filter(r => r.apx).length }; });
        check('6 the kill switch opens the demo without the Autopilots', OFF.fill === null && OFF.rules === 0, OFF);
        await pg.context().close();
        check('7 no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) { check('browser run completed', false, e && e.stack ? e.stack : String(e)); }
    await brw.close(); srv.close();
    done();
    function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  [mutation: ' + MUT + ']' : '')); process.exit(fail ? 1 : 0); }
})();
