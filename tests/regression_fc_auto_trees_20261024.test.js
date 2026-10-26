#!/usr/bin/env node
/*
 * Regression: the failure conditions that need a fault tree get one, the 1309 chart decides, and a system tree's
 * target comes down from the aircraft tree when that is stricter (24 Oct 2026).
 *
 * RULINGS (Waqas, 24 Oct 2026): "when you have the AFHA failure conditions all the top down trees must have their
 *   top gets pre-fed to the PASA trees (keeping the allocation you will have for the most conservative phase/s and
 *   the respective exposure time), once we have a SFHA those failure conditions get same treatment at the PSSA
 *   level, for SFHA top level allocations we need them to be linked to the aircraft level trees ideally their
 *   bottom events, if the system level failure condition has a more stringent allocation from the aircraft level
 *   then it needs to keep its allocation for the PSSA top gate from the aircraft otherwise it gets it from SFHA
 *   classification if that is more conservative"; "only major and above get a tree"; the chart decides; an
 *   unanswered chart gets a tree and is flagged ("a subtle red blinky thing over the skewer"), "only for the worst
 *   case severities not every single instance of that failure condition"; tied phases: "whichever gives us the
 *   most conservative one".
 * EXECUTED (Chromium, the real app on the HL-1 showcase with failure conditions added for the test):
 *   [R] the chart route of a row: below Major none; Major or worse unanswered; simple/redundant qualitative;
 *       similar to certified similarity; Hazardous not simple quantitative.
 *   [G] a failure condition is its rows by FC ID; its governing row is the worst (ties: the longest exposure).
 *   [T] trees: a Hazardous AFHA condition with its chart unanswered gets one PASA tree (governing row linked first,
 *       its top named for it), and only one; a Minor one and a chart-qualitative one get none; an SFHA condition
 *       traced to it gets its PSSA tree, and the PASA tree a bottom event linked to it; reclassified to Minor, the
 *       untouched tree goes, a developed one is asked about (Keep keeps it).
 *   [A] targets: the PSSA tree's target is the aircraft bottom event's allocation when that is stricter than its
 *       class target, said so (basis 'aircraft'); its class target when that is stricter.
 *   [E] exposure: two rows with the worst class: their phases add up (slGoverningPhases and the toolbar's exposure).
 *   [F] the flag: only the worst-severity row of an unanswered condition flags its row menu, and its menu starts
 *       with "Answer the 1309 chart"; answering the chart clears the flag; the route is shown in words.
 * MUTATION PROOFS: SL_FC_MUTATE=minor (Minor gets a tree: the Major floor and the chart's appraisal route both removed), =unanswered (an unanswered chart gets none),
 *   =stricter (the class target always wins), =worstonly (every row flags). Each turns this red.
 * Run: node tests/regression_fc_auto_trees_20261024.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 700) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_FC_MUTATE || '';
function mutate(file, body) {
    if (file !== 'fc_auto_trees.js') return body;
    // Minor is kept out twice (the Major floor, and the chart's own "design appraisal" for Minor): both go
    if (MUT === 'minor') return body.replace('var MAJOR = 3;', 'var MAJOR = 2;').replace("if (d.skip) return 'none';", "if (d.skip) return 'quant';");
    if (MUT === 'unanswered') return body.replace("(g.route === 'quant' || g.route === 'unanswered')", "(g.route === 'quant')");
    if (MUT === 'stricter') return body.replace('if (cls == null || best.rate < cls) { out.rate = best.rate; out.used = \'aircraft\'; }', '');
    if (MUT === 'worstonly') return body.replace('return !!g && g.gov === row;', 'return !!g;');
    // the v1.2 read: eval, which the app's CSP blocks (Radia, 26 Oct 2026: no trees made at all)
    if (MUT === 'eval') return body.replace("function _g(n) {", "function _g(n) { try { return (0, eval)('typeof ' + n + ' !== \"undefined\" ? ' + n + ' : null'); } catch (_) { return root[n]; }");
    return body;
}

// a step that never finishes (an unanswered question) is a failure, not a hang
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const at = f => HTML.indexOf('src="' + f);
    check('load order: fc_auto_trees.js after fc_tree_flow.js, assurance_modules.js and tree_homes.js', at('fc_auto_trees.js') > at('fc_tree_flow.js') && at('fc_auto_trees.js') > at('assurance_modules.js') && at('fc_auto_trees.js') > at('tree_homes.js') && at('fc_tree_flow.js') > 0);
    const css = fs.readFileSync(path.join(SITE, 'safety_lab.css'), 'utf8');
    check('the flag is a small pulsing dot on the row menu, still for people who ask for less motion', /\.row-actions:has\(\[data-needs-chart\]\) \.row-kebab::after \{[^}]*border-radius: 50%[^}]*animation: sl-needs-chart-pulse/.test(css) && /prefers-reduced-motion: reduce\) \{ \.row-actions:has\(\[data-needs-chart\]\) \.row-kebab::after \{ animation: none; \}/.test(css));
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:hl1');
    // the policy the server sends (worker.js CSP_POLICY), so the app runs here as it runs at a customer: no eval
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); if (!m) throw new Error('worker.js CSP_POLICY not found'); return eval('[' + m[1] + ']').join('; '); })();
    check('the test serves the server\'s CSP, and it forbids eval', /script-src [^;]*'self'/.test(CSP) && !/unsafe-eval/.test(CSP), CSP);
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.addInitScript(() => { try { localStorage.removeItem('sl-tree-home-v1'); } catch (_) {} window.SL_VERIFY_SYNC_OFF = true; window.SL_FC_TREES_OFF = true; });
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && window.SLFcTrees && window.SLTreeHomes && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        const r = await within(page.evaluate(async (data) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            _applyProjectData(data); await wait(1200);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            const R = {};
            const nid = () => internalIdCounter++;
            const phases = (flightPhasesData || []).map(p => p.phase).filter(Boolean);
            const P = (i) => phases[Math.min(i, phases.length - 1)];
            const row = (o) => Object.assign({ internalId: nid(), fcId: '', fcDesc: '', severity: 'Hazardous', phases: P(0), chartProps: {} }, o);
            // [R] the chart route
            R.route = {
                minor: SLFcTrees.route(row({ severity: 'Minor' })),
                majUn: SLFcTrees.route(row({ severity: 'Major' })),
                majSimple: SLFcTrees.route(row({ severity: 'Major', chartProps: { isSimple: true, isRedundant: false } })),
                sim: SLFcTrees.route(row({ severity: 'Hazardous', chartProps: { similarPrior: true } })),
                hazQuant: SLFcTrees.route(row({ severity: 'Hazardous', chartProps: { isSimpleConventional: false } })),
                catUn: SLFcTrees.route(row({ severity: 'Catastrophic' }))
            };
            // the test's failure conditions
            const a1 = row({ fcId: 'TST-01', fcDesc: 'Loss of test function', severity: 'Hazardous', phases: P(2) });
            const a1b = row({ fcId: 'TST-01', fcDesc: 'Loss of test function (other phases)', severity: 'Hazardous', phases: P(3) });
            const a1c = row({ fcId: 'TST-01', fcDesc: 'Loss of test function (taxi)', severity: 'Major', phases: P(0) });
            const a2 = row({ fcId: 'TST-02', fcDesc: 'Minor annoyance', severity: 'Minor' });
            const a3 = row({ fcId: 'TST-03', fcDesc: 'Qualitative one', severity: 'Major', chartProps: { isSimple: true, isRedundant: true } });
            acFhaData.push(a1, a1b, a1c, a2, a3);
            const sys = systemsData[0];
            const s1 = row({ fcId: 'TST-S1', fcDesc: 'System part of the test function', severity: 'Major', acTrace: 'TST-01', phases: P(2) });
            sys.fha = sys.fha || []; sys.fha.push(s1);
            // [G] the condition and its governing row
            const g = SLFcTrees.groups('ac').find(x => x.fcId === 'TST-01');
            const longer = (r1, r2) => getPhaseExposureRatio(r1.phases).exposedHours >= getPhaseExposureRatio(r2.phases).exposedHours ? r1 : r2;
            R.group = { rows: g.rows.length, govIsWorstLongest: g.gov === longer(a1, a1b), worst: g.worst.length, needs: g.needsTree, route: g.route };
            // [T] the sweep
            window.SL_FC_TREES_OFF = false;
            const sw1 = SLFcTrees.sweep({ noAsk: true, quiet: true });
            const sw2 = SLFcTrees.sweep({ noAsk: true, quiet: true });
            const treeOf = (rows, lvl) => ftaPages.filter(p => !p.verifies && p.treeLevel === lvl && (p.linkedFhaIds || []).map(String).some(id => rows.some(r => String(r.internalId) === id)));
            const t1 = treeOf([a1, a1b, a1c], 'aircraft');
            const ts = treeOf([s1], 'system');
            R.trees = {
                pasa: t1.length, pasaHome: t1[0] && SLTreeHomes.homeOf(t1[0]).home, govFirst: t1[0] && String(t1[0].linkedFhaIds[0]) === String(g.gov.internalId),
                top: t1[0] && t1[0].root.name, sysEvent: t1[0] && (t1[0].root.children || []).filter(c => c.externalSource && c.externalSource.targetId === 'SYS_' + s1.internalId).length,
                minor: treeOf([a2], 'aircraft').length, qual: treeOf([a3], 'aircraft').length,
                pssa: ts.length, pssaHome: ts[0] && SLTreeHomes.homeOf(ts[0]), sysId: String(sys.id),
                again: sw2.made.length + sw2.added
            };
            // [A] targets, after the allocation runs
            calculateAllProbabilities(); SLFcTrees.sweep({ noAsk: true, quiet: true }); calculateAllProbabilities();
            const leaf = (t1[0].root.children || []).find(c => c.externalSource && c.externalSource.targetId === 'SYS_' + s1.internalId);
            const cls = getSafetyTarget('Major').prob;
            const e = SLFcTrees.effectiveTarget(ts[0]);
            const acRate = getSafetyTarget('Hazardous').prob;   // the PASA tree's own target: its one system event gets all of it
            R.target = { acRate, acSide: e && e.aircraft && e.aircraft.rate, leafP: leaf && leaf.probability, cls, rate: e && e.rate, used: e && e.used, pageT: ts[0].targetP, basis: ts[0].targetBasis && ts[0].targetBasis.used };
            // the class target stricter: a much looser aircraft budget
            const keepT = t1[0].targetP; t1[0].targetManual = true; t1[0].targetP = 0.9;
            calculateAllProbabilities();
            const e2 = SLFcTrees.effectiveTarget(ts[0]);
            R.target2 = { leafP: leaf.probability, used: e2.used, rate: e2.rate, cls };
            t1[0].targetP = keepT; delete t1[0].targetManual; calculateAllProbabilities();
            // [E] exposure: the two Hazardous rows' phases add up
            R.exp = { phases: slGoverningPhases(t1[0]), want: [a1.phases, a1b.phases].filter((x, i, A) => A.indexOf(x) === i).join(', '),
                hours: getPhaseExposureRatio(slGoverningPhases(t1[0])).exposedHours, single: Math.max(getPhaseExposureRatio(a1.phases).exposedHours, getPhaseExposureRatio(a1b.phases).exposedHours) };
            activeFTAPageId = t1[0].id; syncFtaConfigFromActivePage(); ftaConfig.exposureSource = 'auto'; syncFTAExposureFromFHA();
            R.exp.toolbar = ftaConfig.exposureTime;
            // reclassified to Minor: the untouched tree goes; a developed one is asked about
            const tst3 = row({ fcId: 'TST-04', fcDesc: 'Will be reclassified', severity: 'Catastrophic' });
            const tst5 = row({ fcId: 'TST-05', fcDesc: 'Will be reclassified, developed', severity: 'Catastrophic' });
            acFhaData.push(tst3, tst5); scheduleAutosave();
            SLFcTrees.sweep({ noAsk: true, quiet: true });
            const t4 = treeOf([tst3], 'aircraft')[0], t5 = treeOf([tst5], 'aircraft')[0];
            t5.root.children.push({ id: nid(), logicalId: nid(), type: 'basic', name: 'An engineer added this', lambda: 1e-6, probability: 0, children: [] });
            tst3.severity = 'Minor'; tst5.severity = 'Minor'; scheduleAutosave();
            const sw3 = SLFcTrees.sweep({ noAsk: false, quiet: true });
            await wait(400);
            const dlg = (document.querySelector('#sl-dialog-overlay.show') || {}).innerText || '';
            const keep = [...document.querySelectorAll('#sl-dialog-overlay.show .sl-dialog-choice')].find(b => /^Keep it/.test(b.textContent)); if (keep) keep.click();
            await wait(400);
            R.gone = { untouchedGone: !ftaPages.some(p => p.id === t4.id), asked: /no longer needs|needed one/.test(dlg) && /Will be reclassified, developed/.test(dlg), keptStays: ftaPages.some(p => p.id === t5.id), kept: !!(t5.autoFcTree && t5.autoFcTree.kept), sw3gone: sw3.gone.length };
            window.SL_FC_TREES_OFF = true;
            // [F] the flag on the AFHA rows
            switchTab('ac-fha'); await wait(400);
            if (typeof renderACFHA === 'function') renderACFHA(); await wait(300);
            const trOf = (rw) => { const btn = [...document.querySelectorAll('#view-ac-fha [onclick*="editACFHA(\'' + rw.internalId + '\')"]')][0]; return btn ? btn.closest('tr') : null; };
            const flag = (rw) => { const tr = trOf(rw); if (!tr) return null; const k = tr.querySelector('.row-kebab'); const after = k ? getComputedStyle(k, '::after').content : ''; const first = tr.querySelector('.row-action-menu button'); const chip = tr.querySelector('.fha-route-chip'); return { dot: after !== 'none' && after !== '' && after !== 'normal', first: first && first.textContent, chip: chip && chip.textContent }; };
            R.flag = { gov: flag(g.gov), other: flag(g.gov === a1 ? a1b : a1), lowSev: flag(a1c), qual: flag(a3), minor: flag(a2) };
            g.gov.chartProps = { isSimpleConventional: false }; scheduleAutosave(); renderACFHA(); await wait(300);
            R.flag.answered = flag(g.gov);
            return R;
        }, demo.data), 150000, 'the browser step');
        console.log('\n[R] the chart route');
        check('[R] below Major: none; Major or Catastrophic unanswered: unanswered', r.route.minor === 'none' && r.route.majUn === 'unanswered' && r.route.catUn === 'unanswered', JSON.stringify(r.route));
        check('[R] simple and redundant: qualitative; similar to certified: similarity; Hazardous not simple: quantitative', r.route.majSimple === 'qual' && r.route.sim === 'similarity' && r.route.hazQuant === 'quant', JSON.stringify(r.route));
        console.log('\n[G] a failure condition');
        check('[G] its rows by FC ID; governing = the worst, ties the longest exposure; its worst rows; it needs a tree', r.group.rows === 3 && r.group.govIsWorstLongest && r.group.worst === 2 && r.group.needs && r.group.route === 'unanswered', JSON.stringify(r.group));
        console.log('\n[T] the trees');
        check('[T] a Hazardous condition, chart unanswered: one PASA tree, the governing row linked first, its top named for it', r.trees.pasa === 1 && r.trees.pasaHome === 'pasa' && r.trees.govFirst && /Loss of test function/.test(r.trees.top), JSON.stringify(r.trees));
        check('[T] a Minor condition and a chart-qualitative one: no tree', r.trees.minor === 0 && r.trees.qual === 0, JSON.stringify(r.trees));
        check('[T] the SFHA condition traced to it: its PSSA tree, in that system; and the PASA tree has a bottom event linked to it', r.trees.pssa === 1 && r.trees.pssaHome.home === 'pssa' && String(r.trees.pssaHome.systemId) === r.trees.sysId && r.trees.sysEvent === 1, JSON.stringify(r.trees));
        check('[T] a second sweep makes nothing more', r.trees.again === 0, JSON.stringify(r.trees));
        check('[T] reclassified to Minor: the untouched tree goes; the developed one is asked about, and Keep keeps it', r.gone.untouchedGone && r.gone.asked && r.gone.keptStays && r.gone.kept, JSON.stringify(r.gone));
        console.log('\n[A] targets');
        check('[A] the PSSA target is the aircraft bottom event\'s allocation when that is stricter, and says so', r.target.acSide > 0 && Math.abs(r.target.acSide / r.target.acRate - 1) < 0.01 && r.target.acSide < r.target.cls && r.target.used === 'aircraft' && r.target.rate === r.target.acSide && r.target.pageT === r.target.acSide && r.target.basis === 'aircraft', JSON.stringify(r.target));
        check('[A] the class target when that is stricter', r.target2.used === 'class' && r.target2.rate === r.target2.cls, JSON.stringify(r.target2));
        console.log('\n[E] exposure');
        check('[E] two rows with the worst class: their phases add up, and the toolbar uses it', r.exp.phases.split(', ').sort().join('|') === r.exp.want.split(', ').sort().join('|') && r.exp.hours >= r.exp.single && Math.abs(r.exp.toolbar - r.exp.hours) < 1e-9, JSON.stringify(r.exp));
        console.log('\n[F] the flag');
        check('[F] the governing row of an unanswered condition flags its menu, which starts with Answer the 1309 chart', r.flag.gov && r.flag.gov.dot && /Answer the 1309 chart/.test(r.flag.gov.first) && r.flag.gov.chip === 'Chart not answered', JSON.stringify(r.flag));
        check('[F] the other rows of that condition do not flag', r.flag.other && !r.flag.other.dot && r.flag.lowSev && !r.flag.lowSev.dot, JSON.stringify(r.flag));
        check('[F] the route in words: Qualitative; nothing below Major', r.flag.qual && r.flag.qual.chip === 'Qualitative' && !r.flag.qual.dot && r.flag.minor && !r.flag.minor.chip, JSON.stringify(r.flag));
        check('[F] answering the chart clears the flag', r.flag.answered && !r.flag.answered.dot && r.flag.answered.chip === 'Quantitative, tree needed', JSON.stringify(r.flag.answered));
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
