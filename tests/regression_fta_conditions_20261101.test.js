/* regression_fta_conditions_20261101.test.js: event tree conditions and dispatch cases (customer items 37 and 43).
 *
 * Waqas, 1 Nov 2026 ("i agree with your item 6 proposal, these item need to show on the thread too"): each event tree
 * branch sets its events to happened or did not happen, and the fault trees under it are calculated with those settings;
 * named dispatch cases (an MMEL item inoperative) use the same mechanism and never overwrite real values; on the thread,
 * sequences link to their trees, and dispatch cases link to the MMEL item and trees.
 * Hand-checked numbers: two headings whose fault trees share an event S (q = 0.1): F1 = OR(S, A), F2 = OR(S, B), with
 * a = 0.2, b = 0.3. P(F1) = 0.28, P(F2) = 0.37, P(F1 and F2) = q + (1 - q) a b = 0.154. From the trees the four sequences
 * are 0.154, 0.126, 0.216, 0.504 (the product rule would say 0.1036 for both failing). With heading 1's failure branch
 * setting A to happened, heading 2 is calculated given that: 0.28 x 0.37 = 0.1036 and 0.28 x 0.63 = 0.1764.
 * MUTATION PROOFS: SL_COND_MUTATE=cond (each heading taken on its own, not given the ones before), =sets (branch
 * settings ignored), =copy (the calculation writes into the real tree) must fail.
 * Run: node tests/regression_fta_conditions_20261101.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const MUT = process.env.SL_COND_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'cond' && file === 'event_trees.js') return body.replace('const den = parts.length ? C.conjunction(parts, sets) : { p: 1 };', 'const den = { p: 1 };').replace('const num = C.conjunction(parts.concat([part]), sets);', 'const num = C.conjunction([part], sets);');
    if (MUT === 'sets' && file === 'event_trees.js') return body.replace('function _branchSets(h, bid) { const s = h && h.sets && h.sets[bid]; return Array.isArray(s) ? s : []; }', 'function _branchSets() { return []; }');
    if (MUT === 'copy' && file === 'fta_conditions.js') return body.replace("if (E && typeof E.flattenTransfers === 'function') return E.flattenTransfers(root, _pages()).root;", 'return root;');
    return body;
}
const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
check('index.html loads fta_conditions.js after fta_exchange.js', HTML.indexOf('fta_conditions.js?v=1.0') > HTML.indexOf('fta_exchange.js?v='));
check('the Golden Thread has EVENT TREE and DISPATCH columns', /const SAFE_COLS = \['func', 'sys', 'stpa', 'fc', 'eta', 'fta', 'disp', 'cca', 'req', 'vv'\];/.test(fs.readFileSync(path.join(SITE, 'gt_thread.js'), 'utf8')));
check('the MMEL check no longer forces the event on the real tree', !/n\.probability = 1; n\.lambda = 0;/.test(fs.readFileSync(path.join(SITE, 'mmel_module.js'), 'utf8')));
check('no em dash in what fta_conditions.js says', !/—/.test(fs.readFileSync(path.join(SITE, 'fta_conditions.js'), 'utf8').replace(/\/\/.*$/gm, '')));

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
        const r = await pg.evaluate(async () => {
            const out = {};
            const fc = (acFhaData || []).find(f => f && f.fcId);
            const ev = (id, p, lid) => ({ id, logicalId: lid || id, displayId: id.toUpperCase(), type: 'basic', name: 'Event ' + id, probability: p, inputMode: 'probability', children: [] });
            const P1 = { id: 'cond-p1', name: 'Cond tree 1', mode: 'bottom-up', treeLevel: 'standalone', linkedFhaIds: [fc.internalId], linkedFhaId: fc.internalId, root: { id: 'c1-top', displayId: 'G-C1', type: 'gate', gateType: 'OR', name: 'Heading 1 fails', children: [ev('c-s1', 0.1, 'c-S'), ev('c-a', 0.2)] } };
            const P2 = { id: 'cond-p2', name: 'Cond tree 2', mode: 'bottom-up', treeLevel: 'standalone', root: { id: 'c2-top', displayId: 'G-C2', type: 'gate', gateType: 'OR', name: 'Heading 2 fails', children: [ev('c-s2', 0.1, 'c-S'), ev('c-b', 0.3)] } };
            ftaPages.push(P1, P2);
            const cr = etaCreateBlank('Cond test'); const id = cr.id;
            etaAddBarrier(id, 'Heading 1', 0.5); etaAddBarrier(id, 'Heading 2', 0.5);
            const T = etaStore().find(x => x.id === id); T.initiator.freq = 1e-3;
            const seqs = e => { const m = {}; e.outcomes.forEach(o => { m[o.path] = o.noResult ? 'NR' : Math.round(o.prob * 1e6) / 1e6; }); return m; };
            out.elicited = seqs(etaEvaluate(T));
            T.barriers[0].linkedPageId = P1.id; T.barriers[1].linkedPageId = P2.id;
            out.notOnYet = seqs(etaEvaluate(T));
            etaSetFromTrees(id, true);
            const e1 = etaEvaluate(T); out.fromTrees = seqs(e1); out.closed1 = e1.closed; out.ft = e1.outcomes.every(o => o.fromTrees != null);
            out.coupling = etaCoupling(T).map(c => c.modeled);
            // heading 1 failure sets A to happened
            etaSetBranchEvent(id, 0, 'F', 'c-a', 1);
            const e2 = etaEvaluate(T); out.withSet = seqs(e2); out.closed2 = e2.closed;
            out.stored = [P1.root.children[1].probability, P1.root.children[0].probability, P2.root.children[0].probability];
            // a sequence that ends in the failure condition, for the thread
            const ffKey = e1.outcomes.find(o => o.path === '11').key;
            etaAssess(id, ffKey, fc.severity || 'Major', fc.fcId, '', 'Test');
            // the UI
            try { switchTab('eta'); } catch (_) {}
            await new Promise(f => setTimeout(f, 300));
            try { if (window.SLTreeHomes) SLTreeHomes.stamp(T); SLEtaUI.select(id); } catch (_) {}
            await new Promise(f => setTimeout(f, 600));
            out.uiDbg = { side: (document.getElementById('eta-side') || {}).innerHTML ? document.getElementById('eta-side').innerHTML.slice(0, 200) : 'none', vis: !!(document.getElementById('eta-side') && document.getElementById('eta-side').offsetParent), sel: (function () { try { return SLTreeHomes && SLTreeHomes.inLevel ? SLTreeHomes.inLevel('eta', T) : 'n/a'; } catch (e) { return e.message; } })() };
            out.ui = { switch: !!document.querySelector('[data-eta-fromtrees]'), checked: !!(document.querySelector('[data-eta-fromtrees]') || {}).checked, setsBtn: !!document.querySelector('[data-eta-sets="0"]') };
            if (out.ui.setsBtn) { etaBranchSetsUi(id, 0); out.ui.modal = [...document.querySelectorAll('#sl-eta-sets-modal [data-eta-branch]')].map(b => b.getAttribute('data-eta-branch')).join(','); const m = document.getElementById('sl-eta-sets-modal'); if (m) m.remove(); }
            // a circle under a heading: no result, no number
            P2.root.children.push({ id: 'c-loop', displayId: 'TR-CL', type: 'gate', gateType: 'TRANSFER', transferOutTo: P2.id, name: 'loop', children: [] });
            calculateAllProbabilities();
            const e3 = etaEvaluate(T); out.circle = { nr: e3.outcomes.filter(o => o.noResult).length, closed: e3.closed };
            P2.root.children = P2.root.children.filter(c => c.id !== 'c-loop'); calculateAllProbabilities();
            // dispatch case: S happened (an MMEL item inoperative)
            projectConfig.mmel = projectConfig.mmel || { items: [], budgetShare: 0.1 };
            projectConfig.mmel.items.push({ id: 'MMEL-T1', title: 'Shared pump', beRef: 'C-S1', installed: 2, required: 1, category: 'C', catDays: 10, state: 'draft', history: [] });
            const ac = SLFtaConditions.addCase('Shared pump inoperative', 'MMEL-T1');
            out.caseSets = ac.case.sets;
            const evc = SLFtaConditions.evaluateCase(ac.case);
            out.caseRows = evc.rows.map(x => [x.page.id, Math.round((x.base || 0) * 1e6) / 1e6, x.dispatched]);
            out.storedAfterCase = P1.root.children[0].probability;
            // the MMEL check through the same mechanism
            let q = null; try { q = _mmelQuantitative('C-S1'); } catch (e) { q = { error: e.message }; }
            out.mmel = q && { dispatched: q.dispatched, error: q.error || null };
            out.storedAfterMmel = P1.root.children[0].probability;
            // the thread
            const g = _gtvBuildGraph({});
            const sk = 'eta:' + id + ':' + ffKey;
            out.thread = { seq: !!g.nodes.find(n => n.key === sk), seqFc: g.links.some(l => l.t === sk && /^fc:/.test(l.s)), seqT1: g.links.some(l => l.s === sk && l.t === 'fta:' + P1.id), seqT2: g.links.some(l => l.s === sk && l.t === 'fta:' + P2.id), cas: !!g.nodes.find(n => n.key === 'disp:' + ac.case.id), casTree: g.links.some(l => l.s === 'fta:' + P1.id && l.t === 'disp:' + ac.case.id), casMmel: g.links.some(l => l.s === 'disp:' + ac.case.id && l.t === 'mmel:MMEL-T1') };
            const host = document.createElement('div'); document.body.appendChild(host);
            try { GT_THREAD.render(host, g); out.svg = /EVENT TREE/.test(host.innerHTML) && /DISPATCH/.test(host.innerHTML); } catch (e) { out.svg = 'ERR ' + e.message; }
            host.remove();
            // the MMEL page section
            window._ramHasAccess = () => true;   // the MMEL page is a Pro+ page
            try { switchTab('mmel'); } catch (_) {}
            try { renderMmelPage(); } catch (_) {}
            await new Promise(f => setTimeout(f, 300));
            out.mmelDbg = ((document.getElementById('mmel-host') || {}).innerHTML || 'none').slice(0, 200);
            out.mmelPage = { section: !!document.querySelector('[data-dc-section]'), row: !!document.querySelector('[data-dc-row="' + ac.case.id + '"]') };
            return out;
        });
        const near = (a, b) => Math.abs(a - b) < 1e-6;
        check('entered numbers: the product rule, unchanged (0.25 each)', ['00', '01', '10', '11'].every(k => r.elicited[k] === 0.25), JSON.stringify(r.elicited));
        check('linking alone changes nothing until the switch is on', JSON.stringify(r.notOnYet) === JSON.stringify(r.elicited), JSON.stringify(r.notOnYet));
        check('from the fault trees, given the headings before: 0.504, 0.216, 0.126, 0.154 (shared event counted once)', near(r.fromTrees['00'], 0.504) && near(r.fromTrees['01'], 0.216) && near(r.fromTrees['10'], 0.126) && near(r.fromTrees['11'], 0.154) && r.ft, JSON.stringify(r.fromTrees));
        check('the sequences still sum to one', r.closed1 === true && r.closed2 === true);
        check('the shared event is in the arithmetic, so the coupling counts as modeled', r.coupling.length === 1 && r.coupling[0] === true, JSON.stringify(r.coupling));
        check('heading 1 failure setting A to happened: 0.1036 and 0.1764 on its branch, the other branch unchanged', near(r.withSet['11'], 0.1036) && near(r.withSet['10'], 0.1764) && near(r.withSet['00'], 0.504) && near(r.withSet['01'], 0.216), JSON.stringify(r.withSet));
        check('the values stored on the trees are never changed', JSON.stringify(r.stored) === JSON.stringify([0.2, 0.1, 0.1]) && r.storedAfterCase === 0.1 && r.storedAfterMmel === 0.1, JSON.stringify([r.stored, r.storedAfterCase, r.storedAfterMmel]));
        check('the event tree page shows the switch (on) and the branch settings button, one row per branch', r.ui.switch && r.ui.checked && r.ui.setsBtn && r.ui.modal === 'S,F', JSON.stringify(r.ui) + JSON.stringify(r.uiDbg));
        check('a circular transfer under a heading: no result on the sequences, no closed sum', r.circle.nr > 0 && r.circle.closed === false, JSON.stringify(r.circle));
        check('a dispatch case for an MMEL item starts with its event set to happened', r.caseSets.length === 1 && r.caseSets[0].lid === 'c-S' && r.caseSets[0].state === 1, JSON.stringify(r.caseSets));
        check('the case reaches both trees: now 0.28 and 0.37, in the case 1 and 1', r.caseRows.length === 2 && r.caseRows.every(x => x[2] === 1) && r.caseRows.some(x => near(x[1], 0.28)) && r.caseRows.some(x => near(x[1], 0.37)), JSON.stringify(r.caseRows));
        check('the MMEL check uses the same calculation', r.mmel && r.mmel.dispatched === 1 && !r.mmel.error, JSON.stringify(r.mmel));
        check('on the thread: the sequence, linked to its failure condition and to both trees under it', r.thread.seq && r.thread.seqFc && r.thread.seqT1 && r.thread.seqT2, JSON.stringify(r.thread));
        check('on the thread: the dispatch case, linked to the tree it reaches and to its MMEL item', r.thread.cas && r.thread.casTree && r.thread.casMmel, JSON.stringify(r.thread));
        check('the thread picture has the two new columns', r.svg === true, String(r.svg));
        check('the MMEL page lists the dispatch case', r.mmelPage.section && r.mmelPage.row, JSON.stringify(r.mmelPage) + r.mmelDbg);
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) { check('test crashed: ' + (e && e.stack || e), false); }
    finally { await browser.close(); srv.close(); }
    done();
})();
