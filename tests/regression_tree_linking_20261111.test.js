/* regression_tree_linking_20261111.test.js: a system failure condition is ONE shared node, linked into aircraft trees by the
 * engineer; the tool builds no tree inputs; the math closes.
 *
 * Waqas, 11 Nov 2026, on a generated FC-01 tree (top 1e-9 over inputs of 1e-9, 1e-3 and 1e-5): "this math is incorrect"; "why
 * are we doing the linking here, rather than linking them in the fault tree module, where the rule already exists that each
 * node keep its most conservative instances allocation?"; "why are building the fault trees rather than just saying fault trees
 * have not been created yet? the shared node mechanism already exists too"; "we should ask the user if that failure condition's
 * fault tree ready to be linked or not in the auto pilot"; rebalancing "needs to be automatic and flagged for the engineer to
 * accept as rebalanced, or if they want to keep the tighter budget and accept the spare allowance".
 *
 * On the Aeolus HL-1 demo, in the real app, with the production CSP:
 *   [S]  pins and headers (fc_auto_trees 2.0, fta_quant_modules 66.38, event_reuse 1.5, budget_ledger 1.48, pasa 2.1, pssa 2.1)
 *   [G]  the tool builds no inputs: a generated tree is its top and the placeholder; an old generated tree with FHA-linked
 *        events goes back to its top on load (nobody built on it); where somebody built, the event becomes the shared node;
 *        tracing a system failure condition adds nothing to the tree
 *   [Q]  the Autopilot asks, per traced system failure condition, whether its tree is ready to be linked; Yes links it under
 *        the top as a shared node; Not yet takes it out and records the answer; an unbuilt tree reads "not created yet" with
 *        no picture and no numbers
 *   [M]  the math: three linked inputs under an OR gate each take a third of the budget over the flight and add up to the
 *        top (never the class number as the answer); a class tighter than the share still holds the input (a limit)
 *   [X]  one node, one number: linked into a second, looser tree, it is held at the strictest in both; the system tree's
 *        target is that strictest share, and "what the aircraft hands down" lists both
 *   [B]  rebalancing is automatic and flagged: the other input takes up the spare at once and the gate is marked
 *        'rebalanced'; keeping the tighter budgets (a reserve) puts it back to its own share; accepting keeps it
 *   [T]  transfers: two aircraft trees transferring to one system tree give its top ONE number whichever tree is open
 *   [U]  one unit: a tree nobody has open holds the same numbers as when it is open (budget over the flight)
 *   [R]  the reuse menu of the fault tree module offers the system failure conditions first; adopting one makes the event
 *        that shared node
 *   no page errors
 * MUTATION PROOFS: SL_LINK_MUTATE=autobuild | verbatim | nostrict | noxfer | perfh | noauto | noreserve | nomigrate | noask |
 * notcreated | twonodes. Each one turns this red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_tree_linking_20261111.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 900) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_LINK_MUTATE || '';
const MUTS = {
    autobuild: ['fc_auto_trees.js', "        added += migrate();", "        all.forEach(function (g) { if (g.scope === 'ac' && g.needsTree) { var t0 = treeFor(g); if (t0 && t0.root) _traced(g).forEach(function (sg) { if (!linked(t0, { sysId: sg.sys.id, fcId: sg.fcId })) { link(t0, { sysId: sg.sys.id, fcId: sg.fcId }); added++; } }); } });\n        added += migrate();"],
    verbatim:  ['fta_quant_modules.js', "                if (nat !== null && ceil < nat * 0.9999) return hard === null ? ceil : Math.min(hard, ceil);", "                return hard === null ? ceil : Math.min(hard, ceil);"],
    nostrict:  ['event_reuse.js', "                e.node._sharedStrictest = {\n                    rate: best.rate,", "                if (false) e.node._sharedStrictest = {\n                    rate: best.rate,"],
    noxfer:    ['event_reuse.js', "                if (FTk) lid = FTk;", "                if (n.type === 'gate') return;\n                if (FTk) lid = FTk;"],
    perfh:     ['fta_quant_modules.js', "allocateTopDown(p.root, (_b && _b.pFlight > 0) ? _b.pFlight : _t, ftaConfig.apportion, new Set());", "allocateTopDown(p.root, _t, ftaConfig.apportion, new Set());"],
    noauto:    ['fta_quant_modules.js', "        if (_a9Spare && !_a9Reserve && freeChildren.length > 0) {", "        if (_a9Spare && _a9Decision && _a9Decision.kind === 'absorb' && freeChildren.length > 0) {"],
    noreserve: ['fta_quant_modules.js', "        const _a9Reserve = !!(_a9Decision && _a9Decision.kind === 'reserve');", "        const _a9Reserve = false;"],
    nomigrate: ['fc_auto_trees.js', "        added += migrate();", "        added += 0;"],
    noask:     ['pasa_autopilot.js', "        if (isQuant(gr) && pg) linkCands(gr).forEach(function (c) {\n            var qid = 'fc.' + f + '.link.' + c.key;", "        if (false) linkCands(gr).forEach(function (c) {\n            var qid = 'fc.' + f + '.link.' + c.key;"],
    notcreated: ['pasa_autopilot.js', "        if (isQuant(gr) && !built(gr)) {\n            // v2.1: nothing built under the top is no analysis", "        if (false) {\n            // v2.1: nothing built under the top is no analysis"],
    twonodes:  ['fc_auto_trees.js', "        var e = fc ? L.find(function (x) { return String(x.sysId) === sysId && String(x.fcId || '') === fc; }) : null;", "        var e = null;"]
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) { let s = fs.readFileSync(path.join(SITE, name), 'utf8'); const m = MUTS[MUT]; if (m && m[0] === name) { if (s.indexOf(m[1]) < 0) throw new Error('mutation site missing: ' + m[1]); s = s.replace(m[1], m[2]); } return s; }
const EM = String.fromCharCode(0x2014);
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= Math.abs(b) * (tol || 1e-3);

(async function main() {
    console.log('\n[S] pins and headers');
    const HTML = src('index.html');
    check('S1 fc_auto_trees.js 2.0, fta_quant_modules.js 66.38, event_reuse.js 1.5, budget_ledger.js 1.48, pasa_autopilot.js 2.1, pssa_autopilot.js 2.1 pinned; headers the same', /fc_auto_trees\.js\?v=2\.0"/.test(HTML) && /fta_quant_modules\.js\?v=66\.38"/.test(HTML) && /event_reuse\.js\?v=1\.5"/.test(HTML) && /budget_ledger\.js\?v=1\.48"/.test(HTML) && /pasa_autopilot\.js\?v=2\.1"/.test(HTML) && /pssa_autopilot\.js\?v=2\.1"/.test(HTML) && /var VERSION = '2\.0';/.test(src('fc_auto_trees.js')) && /SLPasaAuto v2\.1/.test(src('pasa_autopilot.js').slice(0, 200)) && /SLPssaAuto v2\.1/.test(src('pssa_autopilot.js').slice(0, 200)));
    check('S2 no em dashes in this test or in fc_auto_trees.js\'s new section', fs.readFileSync(__filename, 'utf8').indexOf(EM) < 0 && (s => s.slice(s.indexOf('a system failure condition is one shared node (v2.0)'), s.indexOf('function make(g)')).indexOf(EM) < 0)(src('fc_auto_trees.js')));

    let pw = null; try { pw = require('playwright'); } catch (_) {}
    if (!pw) { console.log('  SKIP  Playwright is not installed here: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();   // eslint-disable-line no-eval
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.step': 'application/step' };
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
        let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
        const name = path.relative(SITE, f); if (MUTS[MUT] && MUTS[MUT][0] === name) b = Buffer.from(src(name));
        r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(b); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const browser = await pw.chromium.launch();
    const errs = [];
    try {
        const pg = await (await browser.newContext({ viewport: { width: 1900, height: 1200 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 300))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        // the MF&MS seed trees (idp_seed_trees.js) are switched off here: a seed made before the sweep is taken as the failure
        // condition's tree (treeFor: never a second one), and which comes first depends on how loaded the machine is
        await pg.addInitScript(() => { window.SL_VERIFY_SYNC_OFF = true; window.SL_IDP_SEED_OFF = true; });
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(() => window.loadHL1Demo()); await tick(9000);
        await pg.waitForFunction(() => { try { return SLEnv.get('acFhaData').length > 10 && SLEnv.get('ftaPages').length > 10 && !!window.SLFcTrees && !!window.SLPasaAuto; } catch (_) { return false; } }, null, { timeout: 120000 });   // a loaded machine: wait for the demo, never guess
        await pg.evaluate(() => switchTab('pasa')); await tick(1500);

        const r = await within(pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const A = window.SLPasaAuto, U = A.ui, R = SLCcaReport.get('pasa'), F = SLFcTrees, B = SLTopBasis, out = {};
            const P = () => SLEnv.get('ftaPages'), pageOf = id => P().find(p => p.id === id);
            const kidsOf = n => (n.children || []).map(c => ({ id: c.displayId, name: c.name, type: c.type, p: Number(c.probability), sn: c.sysNode || null, ext: !!c.externalSource, lid: c.logicalId, held: !!(c._sharedStrictest && !c._sharedStrictest.own) }));
            const orSum = n => 1 - (n.children || []).reduce((m, c) => m * (1 - (Number(c.probability) || 0)), 1);
            const open = async id => { switchTab('fta'); await wait(300); openFTAPageById(id); await wait(900); };
            const budget = p => B.perFlightBudget(p.targetP, p).pFlight;
            let nid = 997000; const ev = name => { const id = ++nid; return { id, logicalId: id, type: 'basic', name, probability: 0, children: [], displayId: 'BE-' + id, inputMode: 'probability' }; };
            SLDataChange.bump(); F.sweep({ quiet: true });   // the demo just loaded: read its rows afresh, then make the trees
            for (let i = 0; i < 20 && !pageOf('fc-auto-ac-FC-01'); i++) { await wait(500); SLDataChange.bump(); F.sweep({ quiet: true }); }
            const f1 = pageOf('fc-auto-ac-FC-01'), f12 = pageOf('fc-auto-ac-FC-12'), f3 = pageOf('fc-auto-ac-FC-03'), f4 = pageOf('fc-auto-ac-FC-04');
            // ---- [G] ---------------------------------------------------------------------------------------------------
            out.g1 = { fc01: kidsOf(f1.root), built: F.built(f1) };
            // an old project: a generated tree with an FHA-linked event nobody built on, and one somebody built on
            const fcsRow = systemsData.find(s => s.id === 'sys-fcs').fha.find(x => x.fcId === 'FC-FCS01');
            const old = () => { const e = ev('Flight Control System: old event'); e.externalSource = { kind: 'fha', targetId: 'SYS_' + fcsRow.internalId }; return e; };
            f3.root.children = [old()]; f3.autoFcTree.fp = F.shapeFp(f3.root);
            f4.root.children = [old(), ev('A cause the engineer built')];
            SLDataChange.bump(); F.sweep({ quiet: true });
            out.g2 = { pristine: kidsOf(f3.root), builtOn: kidsOf(f4.root) };
            f4.root.children = [ev('placeholder')]; f4.root.children[0].type = 'undeveloped'; f4.root.children[0].name = 'Decompose: causes of x'; SLDataChange.bump();
            // tracing adds nothing
            const fn = A.groupOf('FC-01').gov.subId; switchTab('pasa'); await wait(300); R.setTab('aircraft::fn:' + fn); await wait(600);
            const gr = A.groupOf('FC-01');
            U.pick('fc.FC-01.trace.sys-eps', 'tr:FC-EPS02'); U.pick('fc.FC-01.trace.sys-hyd-a', 'tr:FC-HYDA-01'); await wait(400); F.sweep({ quiet: true });
            out.g3 = { fc01: kidsOf(f1.root), built: A.built(gr) };
            // ---- [Q] ---------------------------------------------------------------------------------------------------
            const host = document.getElementById('ccr-host-pasa');
            out.q1 = { qs: Array.from(host.querySelectorAll('[data-ccleft] .slap-q')).map(e => e.textContent.trim()).filter(x => /ready to be linked into the FC-01 tree/.test(x)), left: A.fcLeft(gr).filter(x => /ready to be linked/.test(x)), cands: A.linkCands(gr).map(c => ({ key: c.key, fc: c.fcId, ans: c.answer })) };
            const ctx = { C: SLCcaReport.palette(), dark: false, forExport: false, key: 'pasa' };
            const sec0 = A.section(gr, ctx);
            out.q2 = { heads: sec0.filter(b => b.k === 'h' && b.level === 3).map(b => b.text), fig: sec0.some(b => b.k === 'fig'), text: sec0.filter(b => b.k === 'p').map(b => b.text).join(' '), open: A.openItems(gr) };
            A.linkCands(gr).forEach(c => U.pick('fc.FC-01.link.' + c.key, 'yes')); await wait(600);
            out.q3 = { cands: A.linkCands(gr).map(c => c.answer + ':' + c.via), fc01: kidsOf(f1.root), built: A.built(gr) };
            const sec1 = A.section(gr, ctx);
            out.q4 = { heads: sec1.filter(b => b.k === 'h' && b.level === 3).map(b => b.text), fig: sec1.some(b => b.k === 'fig'), link: (sec1.find(b => b.k === 'table' && b.name === 'link-FC-01') || {}).rows || [] };
            // ---- [M] ---------------------------------------------------------------------------------------------------
            await open('fc-auto-ac-FC-01');
            out.m1 = { kids: kidsOf(f1.root), sum: orSum(f1.root), budget: budget(f1), top: f1.root.probability, classMinor: getSafetyTarget('Minor').prob };
            // the allocator alone, on a gate that belongs to no tree: the exact case reported (three FHA-linked inputs whose classes
            // are Catastrophic, Minor and Major under an OR gate), and a class tighter than the share
            const rowOf = (sid, fc) => systemsData.find(s => s.id === sid).fha.find(x => x.fcId === fc);
            const linkEv = (sid, fc) => Object.assign(ev(fc), { externalSource: { kind: 'fha', targetId: 'SYS_' + rowOf(sid, fc).internalId } });
            const g1 = { id: ++nid, logicalId: nid, type: 'gate', gateType: 'OR', name: 'detached', probability: 0, children: [linkEv('sys-fcs', 'FC-FCS01'), linkEv('sys-eps', 'FC-EPS02'), linkEv('sys-hyd-a', 'FC-HYDA-01')] };
            allocateTopDown(g1, 3e-9, 'equal', new Set());
            const g2 = { id: ++nid, logicalId: nid, type: 'gate', gateType: 'OR', name: 'detached 2', probability: 0, children: [linkEv('sys-fcs', 'FC-FCS01'), ev('free a'), ev('free b')] };
            allocateTopDown(g2, 3e-5, 'equal', new Set());
            out.m3 = { g1: g1.children.map(c => c.probability), g2: g2.children.map(c => c.probability), g2state: g2._budgetMargin && g2._budgetMargin.state, cat: getSafetyTarget('Catastrophic').prob };
            // "Not yet" on one: out of the tree, the others take the budget
            const cEps = A.linkCands(gr).find(c => c.fcId === 'FC-EPS02');
            switchTab('pasa'); await wait(300); U.pick('fc.FC-01.link.' + cEps.key, 'no'); await wait(400); await open('fc-auto-ac-FC-01');
            out.q5 = { ans: A.linkCands(gr).find(c => c.fcId === 'FC-EPS02').answer, kids: kidsOf(f1.root), sum: orSum(f1.root), stored: JSON.parse(JSON.stringify(SLEnv.get('projectConfig').pasaAuto.fc['FC-01'].link)) };
            switchTab('pasa'); await wait(300); U.pick('fc.FC-01.link.' + cEps.key, 'yes'); await wait(400);
            // ---- [X] one node, one number --------------------------------------------------------------------------------
            F.link(f12, { sysId: 'sys-hyd-a', fcId: 'FC-HYDA-01' }); f12.root.children.push(ev('Alerting computer fails')); SLDataChange.bump();
            await open('fc-auto-ac-FC-01'); await open('fc-auto-ac-FC-12');
            const hyd1 = () => f1.root.children.find(c => c.sysNode && c.sysNode.sysId === 'sys-hyd-a'), hyd12 = () => f12.root.children.find(c => c.sysNode && c.sysNode.sysId === 'sys-hyd-a');
            out.x1 = { sameLid: String(hyd1().logicalId) === String(hyd12().logicalId), p1: hyd1().probability, p12: hyd12().probability, held12: !!(hyd12()._sharedStrictest && !hyd12()._sharedStrictest.own), reg: SLEnv.get('projectConfig').sysNodes.filter(x => x.sysId === 'sys-hyd-a' && x.fcId === 'FC-HYDA-01').length };
            // ---- [B] rebalancing: automatic and flagged ------------------------------------------------------------------
            const other = () => f12.root.children.find(c => c.name === 'Alerting computer fails');
            out.b1 = { other: other().probability, sum: orSum(f12.root), budget: budget(f12), state: f12.root._budgetMargin && (f12.root._budgetMargin || {}).state, ledger: budgetLedgerStats().rebalanced, open: A.openItems(A.groupOf('FC-12')).filter(x => /rebalanced by the tool/.test(x)).length };
            SLBudgetDecisions.record({ gateId: f12.root.id, pageId: f12.id, kind: 'reserve', by: 'Test engineer', sentence: 'keep the tighter budgets' });
            await open('fc-auto-ac-FC-12'); out.b2 = { other: other().probability, state: (f12.root._budgetMargin || {}).state, hyd: hyd12().probability };
            { const dd = SLBudgetDecisions.decisionFor(f12.root.id); if (dd) SLBudgetDecisions.revert(dd.id, 'Test engineer'); }
            SLBudgetDecisions.record({ gateId: f12.root.id, pageId: f12.id, kind: 'absorb', by: 'Test engineer', sentence: 'accepted' });
            await open('fc-auto-ac-FC-12'); out.b3 = { other: other().probability, state: (f12.root._budgetMargin || {}).state, sum: orSum(f12.root) };
            // the system tree's target is the strictest share; the PSSA lists both
            F.sweep({ quiet: true });
            const hy = P().find(p => p.systemId === 'sys-hyd-a' && !p.verifies), sh = F.shares(hy);
            out.x2 = { target: hy.targetP, shares: sh.map(s => ({ page: s.pageId, rate: s.rate, via: s.via })), used: F.effectiveTarget(hy).used, want: B.perFlightHour(hyd1().probability, f1).rate };
            // ---- [U] one unit: closed and open ----------------------------------------------------------------------------
            await open('fc-auto-ac-FC-12'); window._slSharedStrictestRound();
            const closed = kidsOf(f1.root).map(k => k.p); await open('fc-auto-ac-FC-01'); const opened = kidsOf(f1.root).map(k => k.p);
            out.u1 = { closed, opened };
            // ---- [T] transfers ---------------------------------------------------------------------------------------------
            const eps = pageOf('pg-eps-total');
            f3.root.children = [ev('FCS loss of roll'), Object.assign(ev('Total electrical loss'), { type: 'gate', gateType: 'TRANSFER', linkedPageId: eps.id, displayId: 'G-' + nid }), ev('Hydraulic power lost')]; delete f3.root.children[1].inputMode;
            SLDataChange.bump(); F.sweep({ quiet: true });
            const top = () => Number(eps.root.probability);
            await open('fc-auto-ac-FC-03'); const a = top(); await open('pg-ac-fc05'); const b = top(); await open('pg-eps-total'); const c = top(); await open('fc-auto-ac-FC-03'); const d = top();
            const stub3 = f3.root.children[1], stub5 = (function f(n) { if (!n) return null; if (n.linkedPageId === eps.id) return n; for (const k of (n.children || [])) { const x = f(k); if (x) return x; } return null; })(pageOf('pg-ac-fc05').root);
            out.t1dbg = { f3: kidsOf(f3.root).map(k => k.name + ' ' + k.p), f5: kidsOf(pageOf('pg-ac-fc05').root).map(k => k.name + ' ' + k.p + (k.held ? ' HELD' : '')), sh: F.shares(eps).map(s => s.pageId + ' ' + s.rate), m3: f3.root._budgetMargin };
            out.t1 = { tops: [a, b, c, d], stub3: stub3.probability, stub5: stub5.probability, target: eps.targetP, strict: Math.min.apply(null, F.shares(eps).map(s => s.rate)), cls: getSafetyTarget('Catastrophic').prob };
            // ---- [R] the reuse menu -----------------------------------------------------------------------------------------
            await open('fc-auto-ac-FC-04');
            const menu = SLEventReuse.consumableHere();
            out.r1 = { first: menu.slice(0, 3).map(m => ({ name: m.name, sn: !!m.sysNode, reason: m.reason })), n: menu.filter(m => m.sysNode).length };
            const target = ev('typed by the engineer'); f4.root.children.push(target);
            const pick = menu.find(m => m.sysNode); SLEventReuse.adopt(target, pick.lid, pick.name);
            out.r2 = { sn: target.sysNode, lid: String(target.logicalId) === String(pick.lid), ext: !!target.externalSource };
            return out;
        }), 240000, 'the linking run');

        console.log('\n[G] the tool builds no inputs');
        const ph = k => k.length === 1 && k[0].type === 'undeveloped' && /^Decompose: causes of /.test(k[0].name);
        check('G1 a generated tree is its top and the placeholder: FC-01 has no system event, and counts as not built', ph(r.g1.fc01) && r.g1.built === false, JSON.stringify(r.g1));
        check('G2 an old generated tree with an FHA-linked event nobody built on goes back to its top', ph(r.g2.pristine), JSON.stringify(r.g2.pristine));
        check('G3 where somebody built, the event stays and becomes the shared node (no FHA link left), beside what they built', r.g2.builtOn.length === 2 && r.g2.builtOn[0].sn && r.g2.builtOn[0].sn.sysId === 'sys-fcs' && r.g2.builtOn[0].sn.fcId === 'FC-FCS01' && !r.g2.builtOn[0].ext && r.g2.builtOn[1].name === 'A cause the engineer built', JSON.stringify(r.g2.builtOn));
        check('G4 tracing a system failure condition to FC-01 adds nothing to its tree', ph(r.g3.fc01) && r.g3.built === false, JSON.stringify(r.g3.fc01));

        console.log('\n[Q] the Autopilot asks');
        check('Q1 one question per traced system failure condition: is its fault tree ready to be linked into the FC-01 tree? (three, none answered)', r.q1.qs.length === 3 && r.q1.left.length === 3 && r.q1.cands.every(c => c.ans === null) && ['FC-FCS01', 'FC-EPS02', 'FC-HYDA-01'].every(f => r.q1.cands.some(c => c.fc === f)), JSON.stringify(r.q1));
        check('Q2 not built: the report says the fault tree has not been created yet, with no picture, no "What the tree says" and no numbers; an open item says so', /The fault tree for FC-01 has not been created yet/.test(r.q2.text) && !r.q2.fig && r.q2.heads.indexOf('What the tree says') < 0 && r.q2.heads.indexOf('The numbers') < 0 && r.q2.open.some(x => /has not been created yet/.test(x)), JSON.stringify(r.q2.heads));
        check('Q3 Yes links each as a shared node under the top; the tree is built', r.q3.cands.every(x => x === 'yes:node') && r.q3.fc01.length === 3 && r.q3.fc01.every(k => k.sn && !k.ext && k.type === 'basic') && r.q3.built === true, JSON.stringify(r.q3));
        check('Q4 the report then draws the tree and its numbers, and lists what is linked', r.q4.fig && r.q4.heads.indexOf('What the tree says') > 0 && r.q4.heads.indexOf('The numbers') > 0 && r.q4.link.length === 3 && r.q4.link.every(x => x['Linked into the FC-01 tree'] === 'Yes'), JSON.stringify(r.q4.link));
        check('Q5 Not yet takes it out of the tree and records the answer; the other two take the whole budget', r.q5.ans === 'no' && r.q5.kids.length === 2 && !r.q5.kids.some(k => k.sn.sysId === 'sys-eps') && Object.values(r.q5.stored).indexOf('no') >= 0 && near(r.q5.sum, r.m1.budget), JSON.stringify(r.q5));

        console.log('\n[M] the math');
        check('M1 three linked inputs under the OR gate add up to the top, which is the budget over the flight (3.0e-9 for a 1e-9 per flight hour objective on a 3 hour flight)', r.m1.kids.length === 3 && near(r.m1.sum, r.m1.budget) && near(r.m1.top, r.m1.budget) && near(r.m1.budget, 3e-9, 1e-2), JSON.stringify(r.m1));
        check('M2 the class number is never the answer: the Minor input is not at 1e-3 (its class), it is within the budget', r.m1.kids.every(k => k.p < r.m1.budget) && r.m1.classMinor === 1e-3);
        check('M3 the allocator alone, the case reported: three FHA-linked inputs (classes Catastrophic, Minor, Major) under an OR gate of 3e-9 each take a third (1e-9), never 1e-9, 1e-3 and 1e-5', r.m3.g1.every(v => near(v, 1 - Math.pow(1 - 3e-9, 1 / 3))), JSON.stringify(r.m3.g1));
        check('M4 a class tighter than the share still holds the input (a limit): the Catastrophic one stays at its class under a 3e-5 gate, and the two free inputs take up the rest (rebalanced)', near(r.m3.g2[0], r.m3.cat) && near(1 - r.m3.g2.reduce((m, v) => m * (1 - v), 1), 3e-5) && r.m3.g2state === 'rebalanced', JSON.stringify(r.m3));

        console.log('\n[X] one node, one number');
        check('X1 the same system failure condition in a second, looser tree is the same node (one registry entry, one ID) held at the strictest in both', r.x1.sameLid && r.x1.reg === 1 && near(r.x1.p12, r.x1.p1) && r.x1.held12, JSON.stringify(r.x1));
        const s01 = r.x2.shares.find(s => s.page === 'fc-auto-ac-FC-01'), s12 = r.x2.shares.find(s => s.page === 'fc-auto-ac-FC-12');
        check('X2 the system tree\'s target is that strictest share (per flight hour), from the aircraft; both aircraft trees are listed with their own shares', s01 && s12 && s01.via === 'node' && s12.rate > s01.rate * 100 && near(r.x2.target, s01.rate) && near(r.x2.target, r.x2.want) && r.x2.used === 'aircraft', JSON.stringify(r.x2));

        console.log('\n[B] rebalancing');
        check('B1 automatic and flagged: the other input takes up the spare at once, the gate uses its full budget and is marked rebalanced (the ledger and the PASA open items count it)', near(r.b1.sum, r.b1.budget) && r.b1.state === 'rebalanced' && r.b1.other > r.b1.budget * 0.99 && r.b1.ledger >= 1 && r.b1.open === 1, JSON.stringify(r.b1));
        check('B2 keep the tighter budgets: the other input goes back to its own share (half), the spare is a signed reserve, the held node does not move', r.b2.state === 'reserve' && near(r.b2.other, 1 - Math.pow(1 - r.b1.budget, 0.5)) && near(r.b2.hyd, r.x1.p1), JSON.stringify(r.b2));
        check('B3 accept the rebalance: the loosened budget stands, recorded as accepted', r.b3.state === 'absorbed-by-decision' && near(r.b3.sum, r.b1.budget) && near(r.b3.other, r.b1.other), JSON.stringify(r.b3));

        console.log('\n[U] one unit');
        check('U1 a tree nobody has open holds the same numbers as when it is open (its budget over the flight, not the per flight hour target)', r.u1.closed.length === 3 && r.u1.closed.every((v, i) => v > 0 && near(v, r.u1.opened[i])), JSON.stringify(r.u1));

        console.log('\n[T] transfers');
        check('T1 two aircraft trees transferring to the electrical tree: its top is ONE number whichever tree is open', r.t1.tops.every(v => v > 0 && near(v, r.t1.tops[0])), JSON.stringify(r.t1.tops) + JSON.stringify(r.t1dbg));
        check('T2 both transfers hold that number (the strictest share), and the tree\'s target is it per flight hour', near(r.t1.stub3, r.t1.stub5) && near(r.t1.stub3, r.t1.tops[0]) && near(r.t1.target, Math.min(r.t1.strict, r.t1.cls)), JSON.stringify(r.t1));

        console.log('\n[R] the reuse menu');
        check('R1 the fault tree module\'s reuse menu offers the system failure conditions first', r.r1.n >= 1 && r.r1.first[0].sn && /traced to this one|interdependence/.test(r.r1.first[0].reason), JSON.stringify(r.r1));
        check('R2 adopting one makes the event that shared node: its ID, what it stands for, no FHA link', r.r2.sn && r.r2.sn.sysId && r.r2.lid && !r.r2.ext, JSON.stringify(r.r2));
    } finally { await browser.close(); srv.close(); }
    check('Z no page errors', errs.length === 0, errs.join(' | '));
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
