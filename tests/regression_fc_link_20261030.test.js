#!/usr/bin/env node
/*
 * Regression: a fault tree is linked to its failure condition by the app, from the FHA, with no room for error; and ANEM
 * draws each condition its own tree (30 Oct 2026, rebuilt 31 Oct 2026: fc_link.js v2.0).
 *
 * RULINGS (Waqas): 30 Oct "we are linking the PL failure conditions, it keeps blanking out and not showing updated link
 *   or picking up the DAL plus when you draft using ANEM it drafts every single failure condition with the same fault";
 *   "his picker was populated with every single failure condition if quantitative analyses are not applicable no fault
 *   trees get prepopulated". 31 Oct "why are we not picking up the hazard assessment and doing the population
 *   automatically"; "they should be able to add trees if they want to, thats what the standalone section is for"; "they
 *   should be linked to the failure condition from the FHA automatically, there shouldnt be any room for errors".
 * EXECUTED (Chromium, the real app on the HL-1 showcase; a test function in one system with a total loss (two rows,
 *   Catastrophic and Hazardous), a partial loss (Major), a malfunction, conditions on other functions, a Minor one and a
 *   Major one the 1309 chart sends to qualitative):
 *   [P] the guided picker opens on the tree's own function and condition, and says the link comes from the FHA.
 *   [O] picking another condition on a PSSA tree (the guided picker, then the toolbar) opens THAT condition's own tree:
 *       no question, nothing relinked; each tree keeps its own target and DAL.
 *   [U] a hand-made tree at the PSSA level picking a condition that has its tree: that tree opens, no second tree.
 *   [N] a condition that takes no tree is greyed with its reason in both pickers on a PSSA tree, and refused with it.
 *   [S] a standalone tree links to any condition by a pick (the Minor and the qualitative ones too), for reference; the
 *       condition's own tree is untouched and stays its tree.
 *   [E] the link is worked out: an app-made tree whose link was broken (the old picker's PL pick, the old toolbar's
 *       front-of-list link) goes back to exactly its condition, name and top event included, without a question, with
 *       a change-log note; a stray pick on a hand-made tree is dropped; it also runs on its own when the project
 *       changes; no demo project is changed by it.
 *   [A] ANEM: each condition goes to the synthesis with its FCIM mode and its function's other conditions; a drafted
 *       tree fills the empty tree made for its condition; an identical tree for another condition is refused; a
 *       condition whose own tree has work in it gets no second tree; a condition that takes no tree gets none.
 * MUTATION PROOFS: SL_LINK_MUTATE=relink (a pick relinks the PSSA tree), =blank (the picker always blank), =noenforce
 *   (the worked-out link not enforced), =noguard (no identical-tree check), =nofill (always a second tree), =notree
 *   (no-tree conditions offered). Each turns this red.
 * Run: node tests/regression_fc_link_20261030.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_LINK_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'relink' && file === 'fc_link.js') return body.replace("var own = _openOwnTree(row);\n        if (own) return { action: 'opened', page: own };", "linkTo(page, row); return { action: 'linked', page: page };");
    if (MUT === 'blank' && file === 'fta_view_modules.js') return body.replace("if (_g) fcSel.value = String(_g.internalId);", "");
    if (MUT === 'noenforce' && file === 'fc_link.js') return body.replace("var t = T(), fixed = 0, dirty = false;", "var t = T(), fixed = 0, dirty = false; return 0;");
    if (MUT === 'noguard' && file === 'fc_link.js') return body.replace("if (!rootNode || !row || _size(rootNode) < 2) return null;", "return null;");
    if (MUT === 'nofill' && file === 'fc_link.js') return body.replace("var g = groupOf(row), t = T();\n        if (!g || !t) return null;", "var g = null, t = T();\n        if (!g || !t) return null;");
    if (MUT === 'notree' && file === 'fc_link.js') return body.replace("if (g.needsTree) return { needs: true, why: '' };", "return { needs: true, why: '' };");
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const at = f => HTML.indexOf('src="' + f);
    check('load order: fc_link.js right after fc_auto_trees.js', at('fc_link.js') > at('fc_auto_trees.js') && at('fc_auto_trees.js') > 0);
    const FL = fs.readFileSync(path.join(SITE, 'fc_link.js'), 'utf8');
    check('no question is asked anywhere in fc_link.js (no slChoose, no "Which tree is this for?")', !/slChoose|Which tree is this for/.test(FL));
    const H = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
    check('the toolbar no longer puts the new row in front of the old ones', !/page\.linkedFhaIds = \[fha\.internalId\]\.concat\(/.test(H));
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const all = require('./lib/demo_projects_all.js').all();
    const demo = all.find(d => d.key === 'showcase:hl1');
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.addInitScript(() => { try { localStorage.removeItem('sl-tree-home-v1'); localStorage.setItem('safetyLab.ai.enabled', '1'); } catch (_) {} window.SL_VERIFY_SYNC_OFF = true; window.SL_FC_TREES_OFF = true; window.SL_FC_LINK_OFF = true; });
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && window.SLFcTrees && window.SLFcLink && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        // [E] enforce changes nothing on a demo project (no false fixes)
        const demoFix = await within(page.evaluate(async (list) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const out = [];
            for (const d of list) { try { _applyProjectData(JSON.parse(JSON.stringify(d.data))); await wait(150); out.push({ key: d.key, fixed: SLFcLink.enforce() }); } catch (e) { out.push({ key: d.key, err: String(e && e.message || e) }); } }
            return out;
        }, all.map(d => ({ key: d.key, data: d.data }))), 240000, 'the demo projects');
        check('[E] the worked-out link changes nothing on any demo project (' + demoFix.length + ' projects)', demoFix.length > 0 && demoFix.every(x => x.fixed === 0), JSON.stringify(demoFix));
        const r = await within(page.evaluate(async (data) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 4000)) { try { const v = fn(); if (v) return v; } catch (_) {} await wait(60); } return null; };
            _applyProjectData(data); await wait(1200);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            ['welcome-modal', 'signup-modal'].forEach(id => { const o = document.getElementById(id); if (o) o.classList.remove('show'); });
            const R = {};
            const nid = () => internalIdCounter++;
            const phases = (flightPhasesData || []).map(p => p.phase).filter(Boolean);
            const P = (i) => phases[Math.min(i, phases.length - 1)];
            const sys = systemsData[0];
            sys.functions = sys.functions || []; sys.fcim = sys.fcim || []; sys.fha = sys.fha || [];
            sys.functions.push({ internalId: nid(), funcId: 'TF-01', funcName: 'Test function', traceIds: [] });
            sys.fcim.push({ internalId: nid(), subId: 'TF-01', awareness: 'Aware', tlId: 'TF-TL', tlDesc: 'Total loss of the test function', plId: 'TF-PL', plDesc: 'Partial loss of the test function', mId: 'TF-M', mDesc: 'Erroneous test function output' });
            const row = (o) => Object.assign({ internalId: nid(), subId: 'TF-01', fcId: '', fcDesc: '', severity: 'Hazardous', phases: P(2), chartProps: {}, effAc: 'Test effect' }, o);
            const tl1 = row({ fcId: 'TF-TL', fcDesc: 'Total loss of the test function', severity: 'Catastrophic', phases: P(2) });
            const tl2 = row({ fcId: 'TF-TL', fcDesc: 'Total loss of the test function (ground)', severity: 'Hazardous', phases: P(0) });
            const pl = row({ fcId: 'TF-PL', fcDesc: 'Partial loss of the test function', severity: 'Major' });
            const m = row({ fcId: 'TF-M', fcDesc: 'Erroneous test function output', severity: 'Hazardous' });
            const x = row({ fcId: 'TF-X', subId: 'TF-02', fcDesc: 'Loss of another test function', severity: 'Hazardous' });
            const y1 = row({ fcId: 'TF-Y', subId: 'TF-03', fcDesc: 'Nuisance of a third test function', severity: 'Minor' });
            const q = row({ fcId: 'TF-Q', fcDesc: 'Degraded test function, simple redundant design', severity: 'Major', chartProps: { isSimple: true, isRedundant: true } });
            const z1 = row({ fcId: 'TF-Z', subId: 'TF-04', fcDesc: 'Loss of a fourth test function', severity: 'Hazardous', phases: P(2) });
            sys.fha.push(tl1, tl2, pl, m, x, y1, q, z1);
            if (window.SLDataChange) SLDataChange.bump();
            window.SL_FC_TREES_OFF = false; SLFcTrees.sweep({ noAsk: true, quiet: true }); window.SL_FC_TREES_OFF = true;
            const ids = (p) => (p.linkedFhaIds || []).map(String);
            const auto = (rw) => ftaPages.find(p => p.autoFcTree && !p.verifies && ids(p).indexOf(String(rw.internalId)) >= 0);
            const tTL = auto(tl1), tPL = auto(pl), tM = auto(m), tZ = auto(z1), tX = auto(x);
            R.made = { tl: !!tTL, pl: !!tPL, m: !!tM, z: !!tZ, tlRows: tTL && ids(tTL).join(','), want: [tl1, tl2].map(r => String(r.internalId)).join(',') };
            const sel = (id) => document.getElementById(id);
            const dlg = () => !!document.querySelector('#sl-dialog-overlay.show');
            // 31 Oct 2026: the app asks "Update the top-event name?" when the link changes; answer it whenever it shows
            // (a fixed wait missed it on a loaded machine and the test waited forever)
            const settle = async (pr) => { let done = false; Promise.resolve(pr).then(() => { done = true; }, () => { done = true; }); const t0 = Date.now(); while (!done && Date.now() - t0 < 20000) { const o = document.querySelector('#sl-dialog-overlay.show'); const b = o && [...o.querySelectorAll('button')].find(x => /^Update$/.test(x.textContent.trim())); if (b) b.click(); await wait(100); } return done; };
            // [P]
            openFTAPageById(tTL.id); await wait(300); refreshSystemPickerRow(); await wait(100); updateFTAConfigUI();
            const lab = sel('fta-fha-link-cell') && sel('fta-fha-link-cell').querySelector('label');
            R.picker0 = { func: sel('fta-sys-func').value, fc: sel('fta-sys-fc').value, want: String(tl1.internalId), label: lab && lab.textContent };
            // [O] the guided picker: PL opens PL's tree
            const before = ids(tTL).join(',');
            sel('fta-sys-fc').value = String(pl.internalId); sel('fta-sys-fc').dispatchEvent(new Event('change'));
            await wait(500);
            calculateAllProbabilities(); propagateDalAllRoots();
            R.open = { asked: dlg(), active: activeFTAPageId === tPL.id, tlSame: ids(tTL).join(',') === before, tlName: tTL.name, tlDal: tTL.root.allocatedDAL, plDal: tPL.root.allocatedDAL, wantTl: getSafetyTarget('Catastrophic').dal, wantPl: getSafetyTarget('Major').dal, toolbar: sel('fta-fha-link').value, wantToolbar: 'SYS_' + pl.internalId };
            // [O] the toolbar on the PL tree: M opens M's tree
            updateFTAConfigUI(); sel('fta-fha-link').value = 'SYS_' + m.internalId; await settle(onFtaFhaLinkChange()); await wait(300);
            R.open.toolbarOpened = activeFTAPageId === tM.id; R.open.plSame = ids(tPL).join(',') === String(pl.internalId); R.open.asked2 = dlg();
            // [U] a hand-made PSSA tree picking Z: Z's own tree opens, no second tree for Z
            const hand = { id: 'hand-' + nid(), name: 'Hand PSSA tree', treeLevel: 'system', systemId: sys.id, mode: 'top-down', root: { id: nid(), logicalId: nid(), displayId: 'G-1', name: 'Something', type: 'gate', gateType: 'OR', probability: 0, children: [{ id: nid(), logicalId: nid(), type: 'basic', name: 'An event', probability: 0, children: [] }] } };
            ftaPages.push(hand); openFTAPageById(hand.id); await wait(300); updateFTAConfigUI();
            sel('fta-fha-link').value = 'SYS_' + z1.internalId; await settle(onFtaFhaLinkChange()); await wait(300);
            R.hand = { asked: dlg(), opened: activeFTAPageId === tZ.id, handUnlinked: !ids(hand).length, oneTreeForZ: ftaPages.filter(p => !p.verifies && (p.treeLevel === 'system') && ids(p).indexOf(String(z1.internalId)) >= 0).length };
            // [N] no-tree conditions on a PSSA tree: greyed, refused
            openFTAPageById(tTL.id); await wait(300); refreshSystemPickerRow(); await wait(100); updateFTAConfigUI();
            const qOpt = [...sel('fta-sys-fc').options].find(o => o.value === String(q.internalId));
            const tq = [...sel('fta-fha-link').options].find(o => o.value === 'SYS_' + q.internalId);
            const ty = [...sel('fta-fha-link').options].find(o => o.value === 'SYS_' + y1.internalId);
            R.none = { picker: qOpt ? { d: qOpt.disabled, t: qOpt.textContent } : null, toolbarQ: tq ? { d: tq.disabled, t: tq.textContent } : null, toolbarY: ty ? { d: ty.disabled, t: ty.textContent } : null };
            const res = SLFcLink.go(tTL, q);
            R.none.refused = res.action === 'refused' && /qualitative/.test(res.why) && /Standalone/.test(res.why); R.none.tlSame = ids(tTL).join(',') === before;
            // [S] a standalone tree: any condition, by a pick
            const sa = { id: 'sa-' + nid(), name: 'Side study', treeLevel: 'standalone', mode: 'top-down', root: { id: nid(), logicalId: nid(), displayId: 'G-9', name: 'Study', type: 'gate', gateType: 'OR', probability: 0, children: [{ id: nid(), logicalId: nid(), type: 'basic', name: 'Path A', probability: 0, children: [] }] } };
            ftaPages.push(sa); openFTAPageById(sa.id); await wait(300); updateFTAConfigUI();
            const sq = [...sel('fta-fha-link').options].find(o => o.value === 'SYS_' + q.internalId);
            R.sa = { qPickable: sq && !sq.disabled, label: (sel('fta-fha-link-cell').querySelector('label') || {}).textContent };
            sel('fta-fha-link').value = 'SYS_' + q.internalId; await settle(onFtaFhaLinkChange());
            R.sa.linkedQ = ids(sa).join(',') === String(q.internalId);
            sel('fta-fha-link').value = 'SYS_' + z1.internalId; await settle(onFtaFhaLinkChange());
            R.sa.linkedZ = ids(sa).indexOf(String(z1.internalId)) >= 0; R.sa.zOwnStill = SLFcLink.ownTree(z1) === tZ; R.sa.zTreeSame = ids(tZ).indexOf(String(z1.internalId)) >= 0;
            // [E] the link, worked out: break the TL tree the two old ways, and a stray pick on a hand tree
            tTL.linkedFhaIds = [pl.internalId]; tTL.linkedFhaId = pl.internalId; tTL.name = 'TF-PL — Partial loss of the test function'; tTL.root.name = 'Partial loss of the test function';
            tX.linkedFhaIds = [q.internalId, x.internalId]; tX.linkedFhaId = q.internalId;
            const hand2 = { id: 'hand2-' + nid(), name: 'Old picker tree', treeLevel: 'system', systemId: sys.id, mode: 'top-down', linkedFhaIds: [m.internalId], linkedFhaId: q.internalId, root: { id: nid(), logicalId: nid(), type: 'gate', gateType: 'OR', name: 'Old', probability: 0, children: [{ id: nid(), logicalId: nid(), type: 'basic', name: 'E', probability: 0, children: [] }] } };
            ftaPages.push(hand2);
            const jr = []; const oldJ = window.jrnl; window.jrnl = function (k, t) { jr.push(k + ': ' + t); if (typeof oldJ === 'function') try { oldJ.apply(this, arguments); } catch (_) {} };
            const n = SLFcLink.enforce();
            calculateAllProbabilities(); propagateDalAllRoots();
            R.enf = { n, asked: dlg(), tl: ids(tTL).join(','), wantTl: [tl1, tl2].map(r => String(r.internalId)).join(','), tlScalar: String(tTL.linkedFhaId), tlName: tTL.name, tlTop: tTL.root.name, tlDal: tTL.root.allocatedDAL, x: ids(tX).join(','), wantX: String(x.internalId), hand2Scalar: String(hand2.linkedFhaId), wantHand2: String(m.internalId), journal: jr.filter(l => /tree-link-fixed/.test(l)).length, again: SLFcLink.enforce() };
            // and on its own, when the project changes
            tTL.linkedFhaIds = [pl.internalId];
            window.SL_FC_LINK_OFF = false; scheduleAutosave();
            await until(() => ids(tTL).join(',') === R.enf.wantTl, 12000);
            R.enf.onItsOwn = ids(tTL).join(',') === R.enf.wantTl; window.SL_FC_LINK_OFF = true;
            window.jrnl = oldJ;
            // [A] ANEM
            await window.slLoadAI(); await until(() => window.SafetyLabAI && window.SafetyLabAI._treeLaneTest, 20000);
            const L = window.SafetyLabAI._treeLaneTest;
            const msg = L.synthUserMsg([{ fhaInternalId: pl.internalId, systemId: sys.id, fcId: 'TF-PL', fcDesc: pl.fcDesc, severity: pl.severity, scopeLabel: 'SFHA · ' + sys.name }]);
            R.ctx = { mode: /FCIM mode=partial loss/.test(msg), sibs: /TF-TL total loss/.test(msg) && /TF-M malfunction/.test(msg), rule: /never get the same tree/.test(msg) };
            const need0 = L.needing().map(f => f.fcId);
            R.ctx.mNeeds = need0.indexOf('TF-M') >= 0; R.ctx.qNot = need0.indexOf('TF-Q') < 0;
            const shape = (a, b) => ({ type: 'gate', gateType: 'AND', name: 'top', children: [{ type: 'event', name: a }, { type: 'event', name: b }] });
            const run = (fc, root) => { const res = L.runActions([{ op: 'add_fta_tree', scope: 'system', systemId: sys.id, fhaFcId: fc, topEvent: fc, kind: 'allocation', root }], 'test-model', '', 'chat.edit'); return (Array.isArray(res) ? res : (res && res.results) || [])[0] || {}; };
            const n0 = ftaPages.length;
            const r1 = run('TF-M', shape('Channel A output wrong', 'Monitor fails to detect it'));
            R.fill = { ok: !!r1.ok, s: r1.summary || r1.error, filled: (tM.root.children || []).map(c => c.name).join('|'), noNew: ftaPages.length === n0 };
            const r2 = run('TF-PL', shape('Channel A output wrong', 'Monitor fails to detect it'));
            R.same = { refused: !r2.ok, why: r2.error || '' };
            const r3 = run('TF-M', shape('Channel B lost', 'Channel C lost'));
            R.second = { refused: !r3.ok, why: r3.error || '', noNew: ftaPages.length === n0 };
            const r4 = run('TF-Q', shape('Path A degraded', 'Path B degraded'));
            R.noTree = { refused: !r4.ok, why: r4.error || '' };
            return R;
        }, demo.data), 200000, 'the browser step');
        check('setup: the app made each condition its tree (TL with both rows, worst first)', r.made.tl && r.made.pl && r.made.m && r.made.z && r.made.tlRows === r.made.want, JSON.stringify(r.made));
        console.log('\n[P] the picker');
        check('[P] the guided picker opens on the tree\'s own function and condition; the link control says it comes from the FHA', r.picker0.func === 'TF-01' && r.picker0.fc === r.picker0.want && /from the FHA/.test(r.picker0.label || ''), JSON.stringify(r.picker0));
        console.log('\n[O] picking another condition');
        check('[O] the guided picker opens PL\'s own tree, with no question; the TL tree is untouched', !r.open.asked && r.open.active && r.open.tlSame && /TF-TL/.test(r.open.tlName), JSON.stringify(r.open));
        check('[O] each tree keeps its own DAL (TL Catastrophic, PL Major), and the toolbar shows the tree on screen', r.open.tlDal === r.open.wantTl && r.open.plDal === r.open.wantPl && r.open.toolbar === r.open.wantToolbar, JSON.stringify(r.open));
        check('[O] the toolbar does the same: M opens M\'s own tree, the PL tree is untouched, no question', r.open.toolbarOpened && r.open.plSame && !r.open.asked2, JSON.stringify(r.open));
        console.log('\n[U] a hand-made tree at the PSSA level');
        check('[U] picking a condition that has its tree opens that tree; the hand-made one stays unlinked; one tree for the condition', !r.hand.asked && r.hand.opened && r.hand.handUnlinked && r.hand.oneTreeForZ === 1, JSON.stringify(r.hand));
        console.log('\n[N] conditions that take no tree');
        check('[N] greyed with the reason in the guided picker and the toolbar (qualitative; Minor)', r.none.picker && r.none.picker.d && /qualitative/.test(r.none.picker.t) && r.none.toolbarQ && r.none.toolbarQ.d && r.none.toolbarY && r.none.toolbarY.d && /Minor/.test(r.none.toolbarY.t), JSON.stringify(r.none));
        check('[N] picking one is refused with the reason and the way to study it (Standalone); nothing changes', r.none.refused && r.none.tlSame, JSON.stringify(r.none));
        console.log('\n[S] standalone');
        check('[S] on a standalone tree every condition is pickable, and the control says it is a link you choose', r.sa.qPickable && /Link to Hazard/.test(r.sa.label || ''), JSON.stringify(r.sa));
        check('[S] picking links it (the qualitative one, then Z); Z\'s own tree is untouched and stays its tree', r.sa.linkedQ && r.sa.linkedZ && r.sa.zOwnStill && r.sa.zTreeSame, JSON.stringify(r.sa));
        console.log('\n[E] the link, worked out');
        check('[E] an app-made tree broken by the old picker goes back to exactly its condition: rows, worst row, name, top event, DAL', r.enf.tl === r.enf.wantTl && r.enf.tlScalar === r.enf.wantTl.split(',')[0] && /TF-TL/.test(r.enf.tlName) && /Total loss/.test(r.enf.tlTop) && r.enf.tlDal === r.open.wantTl, JSON.stringify(r.enf));
        check('[E] one broken by the old toolbar loses the stray condition; a stray pick on a hand-made tree is dropped', r.enf.x === r.enf.wantX && r.enf.hand2Scalar === r.enf.wantHand2, JSON.stringify(r.enf));
        check('[E] without a question, each fix in the change log, and a second pass finds nothing', !r.enf.asked && r.enf.n === 3 && r.enf.journal === 3 && r.enf.again === 0, JSON.stringify(r.enf));
        check('[E] it runs on its own when the project changes', r.enf.onItsOwn, JSON.stringify(r.enf));
        console.log('\n[A] ANEM');
        check('[A] the synthesis gets the FCIM mode and the function\'s other conditions; a no-tree condition is not offered; an empty app-made tree is', r.ctx.mode && r.ctx.sibs && r.ctx.rule && r.ctx.mNeeds && r.ctx.qNot, JSON.stringify(r.ctx));
        check('[A] a drafted tree fills the empty tree made for its condition (no second tree)', r.fill.ok && /filled in/.test(r.fill.s) && /Channel A output wrong/.test(r.fill.filled) && r.fill.noNew, JSON.stringify(r.fill));
        check('[A] the same tree drafted for another condition is refused, naming the tree it copies', r.same.refused && /same as the tree for TF-M/.test(r.same.why), JSON.stringify(r.same));
        check('[A] a condition whose own tree has work in it gets no second tree', r.second.refused && /already has its tree/.test(r.second.why) && r.second.noNew, JSON.stringify(r.second));
        check('[A] a condition that takes no tree gets none', r.noTree.refused && /TF-Q/.test(r.noTree.why) && /qualitative/.test(r.noTree.why), JSON.stringify(r.noTree));
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
