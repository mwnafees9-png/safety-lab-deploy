/* THE CHANGE-OVER QUESTION AND THE GUARD ON THE OLDER TREE BUILDERS (23 Nov 2026).
 * Waqas: "on modes I am good with the questions"; "Happy with the guard".
 *   1  a group built "two, one backs up the other" asks "Can the change-over to <standby> fail on its own?"; no other build does
 *   2  the tool never assumes the answer: until it is given the MAC cannot be sent; answering asks no switch-off question again
 *   3  yes: "not working" is two ways (both lost, or the unit in use lost with the change-over failing), in the words, the
 *      states table, the gate drawing and the PASA; the change-over is written onto the system; no: it goes away again
 *   4  sent: the rule carries the two ways (rule.apx.inside) and says them in words; changing the build drops the answer
 *   5  the guard: neither the MF&MS compile nor the lane trees build from a rule sent by the MAC Autopilot; "compile all" and
 *      "generate all" skip it and say so; each points to the failure condition's own tree; a page built from it before is
 *      kept and marked; restructure and graft refuse; a rule from today's MAC page still compiles
 *   6  no page errors
 * Mutations (SL_ACG_MUTATE): noask (the MAC can be sent with the change-over unanswered), noguard (the MF&MS compile builds
 * from an Autopilot rule), noinside (the PASA rule loses the two ways).
 */
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' (' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site'), MUT = process.env.SL_ACG_MUTATE || '';
const rd = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function mutate(file, body) {
    if (!MUT) return body;
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing: ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'noask' && file === 'apx_mac.js') rep("if (co0.length) out.push(", "if (false) out.push(");
    if (MUT === 'noguard' && file === 'helpers_modules.js') rep("    if (rule.apx) return { ok: false, apx: true, reason: macApxNote(rule) };", "");
    if (MUT === 'noinside' && file === 'apx_bridge.js') rep("if (w) inside[token(d, 'F', ms.sol.ds)] =", "if (false) inside[token(d, 'F', ms.sol.ds)] =");
    return body;
}
(async () => {
    const mac = rd('apx_mac.js');
    check('1 the files: the change-over helpers and the guard are there; no em dash in the new text', /function coOf\(g\)/.test(mac) && /function setCo\(/.test(mac) && /function macApxOwnTree\(rule\)/.test(rd('misc_fn_modules.js')) && /function apxNote\(rule\)/.test(rd('lane_trees.js')) && !/23 Nov 2026[^\n]*—/.test(mac + rd('misc_fn_modules.js') + rd('lane_trees.js') + rd('apx_bridge.js') + rd('apx_coffe.js')));
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
    const br = await pw.chromium.launch(), errs = [], tick = ms => new Promise(r => setTimeout(r, ms));
    try {
        const pg = await (await br.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e).slice(0, 300))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html?apx=1'); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(async () => { await loadSampleProject(); }); await tick(4000);
        const K = await pg.evaluate(async () => { const A = SLApxAuto, f = A.model.fcs().find(x => x.fcId === 'FC-07'); A._ui.fc = f.key; A.open('mac'); await new Promise(r => setTimeout(r, 1200)); return f.key; });
        // builds: the first system a backup pair, the others single units
        const b0 = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K), base = M.model.lossBase(f);
            base.forEach((c, i) => { const g = M.model.groupsOf(c.colId)[0]; M.act.setPattern(f, c.colId, g ? g.id : '', i === 0 ? 'backup' : 'single', 'hand', ''); });
            A._ui.step = 1; A.kit.draw();
            const ds = M.model.macCols(f), h = document.querySelector('#interdep-host');
            return { pats: ds.map(d => d.g.pattern), open: ds.map(d => d.coOpen), q: Array.from(h.querySelectorAll('.apx-co')).map(x => x.innerText.replace(/\s+/g, ' ')), openBox: h.querySelectorAll('.apx-co.open').length, btns: h.querySelectorAll('[data-apx-x^="co|"]').length, key: ds[0].colId + '|' + ds[0].gid, units: ds[0].units };
        }, K);
        check('1 a backup pair asks the change-over question, with Yes and No; the single units do not', b0.pats[0] === 'backup' && b0.q.length === 1 && /Can the change-over to Unit B \(standby\) fail on its own\?/.test(b0.q[0]) && b0.btns === 2 && b0.openBox === 1, b0);
        check('2 unanswered, it is open: the tool assumes nothing', b0.open[0] === true && b0.open.slice(1).every(x => x === false), b0.open);
        // answer every switch-off question: the aircraft cannot stop only when the backup pair is lost
        const q = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K);
            let n = 0; for (;;) { const s = M.model.solved(f); if (s.done) break; const c = SLApx.nextQuestion(s.cols, s.m1, { lo: 0, hi: 1, among: s.cases }); M.act.answer(f, c, c[0] === 'F'); if (++n > 200) break; }
            const s = M.model.solved(f); M.model.rules(s).forEach(x => M.act.setWhy(f, x.c, 'No braking left')); M.act.setEv(f, 'LPA-01');
            const sig0 = M.model.peek(K).sig, m10 = Object.keys(M.model.peek(K).m1).length, left0 = M.model.left(f), send0 = M.act.send(f, 'Test Engineer');
            return { sig0, m10, left0, send0, n };
        }, K);
        check('2 with everything else done, the MAC cannot be sent until the change-over is answered, and it says where', q.send0.ok === false && /change-over/.test(q.send0.why) && /How each system is built/.test(q.left0.join(' ')), q);
        // answer yes on the page, then name it
        await pg.click('#interdep-host [data-apx-x="co|' + b0.key + '|yes"]'); await tick(300);
        const y = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K), d0 = () => M.model.macCols(f)[0];
            const dflt = d0().co && d0().co.name;
            M.act.setCo(f, d0().colId, d0().gid, null, 'Shuttle valve');
            const d = d0(), s = M.model.solved(f), r = M.model.peek(K), sy = systemsData.find(x => String(x.id) === d.sysId);
            A._ui.step = 3; A.kit.draw(); const h = document.querySelector('#interdep-host').innerText;
            return { yes: d.co && d.co.yes, dflt, name: d.co && d.co.name, open: d.coOpen, by: !!d.g.co.by, sig: r.sig, m1: Object.keys(r.m1).length, done: s.done, words: M.model.unitWords(d, 'F'), ways: (M.model.coWays(d) || []).map(w => w.parts.join(' + ')),
                asm: (sy.assemblies || []).filter(a => a.kind === 'change-over').map(a => a.id + '|' + a.name + '|' + a.apx), gid: d.gid, stateRow: /Both lost \(Unit A \(in use\) and Unit B \(standby\)\), or Unit A \(in use\) lost with the shuttle valve failing/.test(h), ruleRow: /or Unit A \(in use\) with the shuttle valve failing/.test(h) };
        }, K);
        check('3 yes: recorded with who answered; the default name is "Change-over to" the standby; it can be renamed', y.yes === true && y.dflt === 'Change-over to Unit B (standby)' && y.name === 'Shuttle valve' && y.open === false && y.by, y);
        check('2 answering it sets no switch-off answer aside and asks nothing again', y.sig === q.sig0 && y.m1 === q.m10 && y.done === true, [y.sig === q.sig0, y.m1, q.m10, y.done]);
        check('3 "not working" is two ways, in words and as parts', /both \(Unit A \(in use\) and Unit B \(standby\)\), or Unit A \(in use\) with the shuttle valve failing$/.test(y.words) && y.ways.join(' | ') === 'Unit A (in use) lost + Unit B (standby) lost | Unit A (in use) lost + Shuttle valve fails', y);
        check('3 the rules table and the states table say both ways', y.ruleRow && y.stateRow, y);
        check('3 the change-over is written onto the system as its own assembly entry', y.asm.length === 1 && y.asm[0] === y.gid + '.co|Shuttle valve|true', y.asm);
        const g = await pg.evaluate((K) => { const M = SLApxMac, C = SLApxCof, f = SLApxAuto.model.fcOf(K), d = M.model.macCols(f)[0], d1 = M.model.macCols(f)[1]; const x = C.model.evInside(d, 'F'); return { has: /Unit A \(in use\) lost/.test(x) && /Shuttle valve fails/.test(x) && /Unit B \(standby\) lost/.test(x), ors: (x.match(/>OR</g) || []).length, ands: (x.match(/>AND</g) || []).length, other: C.model.evInside(d1, 'F'), partial: C.model.evInside(d, 'D') }; }, K);
        check('3 the gate drawing puts both ways under the loss: OR of (both lost) and (unit in use lost AND change-over fails); nothing under other losses', g.has && g.ors === 1 && g.ands === 2 && g.other === '' && g.partial === '', g);
        // send and read what went to the PASA
        const s = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K), r = M.act.send(f, 'Test Engineer'), rule = projectConfig.macModels.find(x => x.id === 'apx-mac-' + K);
            const ins = rule && rule.apx.inside || {}, k = Object.keys(ins)[0];
            const blocks = SLApxBridge.macBlocks ? SLApxBridge.macBlocks(f) : null;
            const all = JSON.stringify(SLApxBridge.pasa ? SLApxBridge.pasa(A.model.groupOf ? A.model.groupOf(f) : null) : null);
            return { ok: r.ok, why: r.why, k, ins: k ? ins[k] : null, words: rule ? macRuleWords(rule) : '', all: all || '' };
        }, K);
        check('4 sent: the rule carries the two ways with the change-over\'s name', s.ok === true && s.ins && s.ins.changeOver === 'Shuttle valve' && s.ins.ways.length === 2 && s.ins.ways[1].join('+') === 'Unit A (in use) lost+Shuttle valve fails', s);
        check('4 the rule in words says both ways', /Shuttle valve fails/.test(s.words) && /Unit B \(standby\) lost/.test(s.words), s.words);
        const pa = await pg.evaluate((K) => { const f = SLApxAuto.model.fcOf(K), g = (SLFcTrees.groups('ac') || []).find(x => x && x.gov && String(x.gov.internalId) === String(K)); let b = []; try { b = SLApxBridge.pasa(g) || []; } catch (e) { return { err: e.message }; } const t = JSON.stringify(b); return { build: /Can the change-over fail on its own/.test(t) && /Yes: Shuttle valve/.test(t), rule: /shuttle valve failing/.test(t) }; }, K);
        check('3 the PASA build table and MAC rules carry it', pa.build && pa.rule, pa);
        // no, then a build change
        const n2 = await pg.evaluate((K) => {
            const M = SLApxMac, f = SLApxAuto.model.fcOf(K), d = M.model.macCols(f)[0], sy = systemsData.find(x => String(x.id) === d.sysId);
            M.act.setCo(f, d.colId, d.gid, 'no', null); const dn = M.model.macCols(f)[0], wNo = M.model.unitWords(dn, 'F'), asmNo = (sy.assemblies || []).filter(a => a.kind === 'change-over').length, sentAfter = M.model.status(f).k;
            M.act.setPattern(f, d.colId, d.gid, 'shared', 'hand', ''); const ds = M.model.macCols(f)[0];
            const asked = M.act.setCo(f, ds.colId, ds.gid, 'yes', null);
            return { wNo, asmNo, sentAfter, dropped: ds.g.co === undefined, co: ds.co, asked };
        }, K);
        check('3 no: "not working" is both lost again and the change-over entry goes; a sent MAC shows as changed', /both \(Unit A \(in use\) and Unit B \(standby\)\)$/.test(n2.wNo) && n2.asmNo === 0 && n2.sentAfter === 'changed', n2);
        check('4 changing the build drops the answer, and a build that is not a backup is never asked', n2.dropped && n2.co === null && n2.asked === false, n2);

        // ---- 5: the guard ---------------------------------------------------------------------------------------------------
        const G = await pg.evaluate(async (K) => {
            const M = SLApxMac, f = SLApxAuto.model.fcOf(K), o = {};
            // put the backup build back, answer yes, send again so a sent Autopilot rule is in place
            const d = M.model.macCols(f)[0]; M.act.setPattern(f, d.colId, d.gid, 'backup', 'hand', ''); const d2 = M.model.macCols(f)[0]; M.act.setCo(f, d2.colId, d2.gid, 'yes', 'Shuttle valve');
            let n = 0; for (;;) { const s = M.model.solved(f); if (s.done) break; const c = SLApx.nextQuestion(s.cols, s.m1, { lo: 0, hi: 1, among: s.cases }); M.act.answer(f, c, c[0] === 'F'); if (++n > 200) break; }
            M.model.rules(M.model.solved(f)).forEach(x => M.act.setWhy(f, x.c, 'No braking left'));
            o.sent = M.act.send(f, 'Test Engineer').ok;
            const rule = projectConfig.macModels.find(x => x.id === 'apx-mac-' + K), id = rule.id;
            const pages0 = ftaPages.length;
            o.compile = macCompile(id); o.pagesAfterCompile = ftaPages.length - pages0; o.store = !!(projectConfig.macCompiled || {})[id];
            macCompileAll(); o.storeAll = !!(projectConfig.macCompiled || {})[id];
            o.mfmsStatus = macTreeStatus(rule);
            o.lane = SLLaneTrees.compile(id); const ca = SLLaneTrees.compileAll(); o.skipped = ca.skippedApx; o.laneStore = !!(projectConfig.laneCompiled || {})[id]; o.laneStatus = SLLaneTrees.status(id, 'tl');
            o.own = macApxOwnTree(rule); o.ownId = o.own ? o.own.id : null; o.ownFor = o.own ? (o.own.name || '') : '';
            // a page built here from the rule before the guard: kept and marked
            const old = { id: 'mac-pg-old-test', name: 'MF&MS old', type: 'top-down', root: { id: 999001, name: 'old', type: 'gate', gateType: 'OR', children: [] } };
            ftaPages.push(old); projectConfig.macCompiled = projectConfig.macCompiled || {}; projectConfig.macCompiled[id] = { fp: 'x', pageId: old.id, breach: [], verified: true };
            projectConfig.laneCompiled = projectConfig.laneCompiled || {}; projectConfig.laneCompiled[id] = { tl: { pageId: old.id, fp: 'x' } };
            o.oldStatus = [macTreeStatus(rule), SLLaneTrees.status(id, 'tl')];
            macCompileAll(); SLLaneTrees.compileAll(); o.oldKept = ftaPages.some(p => p.id === old.id) && projectConfig.macCompiled[id].pageId === old.id;
            try { await switchTab('mfms'); } catch (_) {} try { renderMfmsPanel(); } catch (_) {} try { SLLaneTrees.renderDesk(); } catch (_) {}
            const txt = (document.getElementById('mfms-host') || {}).innerText || '', desk = (document.getElementById('lane-trees-desk') || {}).innerText || '';
            o.panel = { note: txt.indexOf('Sent by the MAC Autopilot for FC-07') !== -1, before: /BUILT HERE BEFORE/.test(txt), deskNote: desk.indexOf('Sent by the MAC Autopilot for FC-07') !== -1, deskBefore: /BUILT HERE BEFORE/.test(desk), noCompileBtn: !Array.from(document.querySelectorAll('#mfms-host button')).some(b => /macCompile\('apx-mac-/.test(b.getAttribute('onclick') || '')) };
            // restructure and graft refuse
            let toasts = []; const st0 = window.showToast; window.showToast = (m) => toasts.push(m);
            await mfmsAiRestructure(id); coffeGraft(K, 'k'); window.showToast = st0; o.toasts = toasts;
            // a rule from today's MAC page still compiles
            const plain = { id: 'r-plain-test', level: 0, subId: rule.subId, phase: 'All phases', clauses: [{ min: 1, of: M.model.macCols(f).slice(1).map(x => x.sysId) }], substantiation: { kind: 'assumption' } };
            projectConfig.macModels.push(plain); o.plain = macCompile(plain.id).ok; projectConfig.macModels = projectConfig.macModels.filter(x => x.id !== plain.id);
            ftaPages = ftaPages.filter(p => p.id !== old.id && p.id !== 'mac-pg-' + plain.id); delete projectConfig.macCompiled[id]; delete projectConfig.laneCompiled[id];
            return o;
        }, K);
        check('5 the MF&MS compile refuses an Autopilot rule and builds nothing, pointing to the failure condition\'s own tree', G.sent && G.compile.ok === false && G.compile.apx === true && /Sent by the MAC Autopilot for FC-07\. Its fault tree is FC-07's own tree/.test(G.compile.reason) && G.pagesAfterCompile === 0 && !G.store && !G.storeAll && G.mfmsStatus === 'apx', G);
        check('5 the lane trees refuse it too; "generate all" skips it and counts it', G.lane.ok === false && G.lane.apx === true && G.skipped >= 1 && !G.laneStore && G.laneStatus === 'apx', G);
        check('5 a page built from it before is kept and marked, on both panels; no compile button is offered for it', G.oldStatus.join() === 'apx-old,apx-old' && G.oldKept && G.panel.note && G.panel.before && G.panel.deskNote && G.panel.deskBefore && G.panel.noCompileBtn, [G.oldStatus, G.oldKept, G.panel]);
        check('5 the AI restructure and the CoFFE graft refuse it and say why', G.toasts.length === 2 && G.toasts.every(t => /Sent by the MAC Autopilot for FC-07/.test(t)), G.toasts);
        check('5 a rule from today\'s MAC page still compiles', G.plain === true, G.plain);
        check('6 no page errors', errs.length === 0, errs.join(' | '));
        await pg.context().close();
    } catch (e) { check('browser run completed', false, e && e.stack ? e.stack : String(e)); }
    await br.close(); srv.close();
    done();
    function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  [mutation: ' + MUT + ']' : '')); process.exit(fail ? 1 : 0); }
})();
