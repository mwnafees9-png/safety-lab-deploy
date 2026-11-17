/* regression_apx_interdependence_20261115.test.js: the Interdependence Autopilot (step 2 of 5 of the new Autopilots).
 *
 * Waqas, 15 Nov 2026: the Autopilot asks the questions and the PASA only shows the results; "only shows the parts of the
 * table that are relevant to the failure condition and carries them over to the PASA, systems not applicable dont get
 * shown"; the tables are "exactly" ARP4761A Tables Q.4-1, Q.4-2 and B3; a system the project says feeds the failure
 * condition is "Block until the link is fixed"; one signature "Once, when sending"; "FYI this will be upgrading the
 * current MAC/CoFFE and Interdependence interface and replacing them, so we have to absolutely nail this"; it is tested
 * on the live site behind a switch only our team sees, saving in its own place.
 * Rebuild: apx_autopilots.js (SLApxAuto 1.0) on apx_engine.js; support_modules.js lets the Interdependence tab open when
 * the switch is on.
 *   1  index.html: apx_engine.js, then apx_autopilots.js, both before pasa_autopilot.js
 *   2  wording: American English, no em dashes, "AC" for aircraft (never "AP"), black table headers
 *   3  switch off: the Interdependence tab still lands on the PASA and no Autopilot is drawn; nothing is written
 *   4  switch on (K350 demo): the Autopilot draws, today's header text is hidden, the tables are not folded away
 *   5  FC-07: what the project's data says is ticked and locked; unticking it is refused with the reason, and it stays
 *   6  ticking a function adds exactly that column to Table Q.4-1; unticking removes it; unticked ones are never shown
 *   7  (v1.2) the step ASKS for each system and its function and whether it is a resource system; a resource system is a
 *      row of Table Q.4-2 and never a column of Table Q.4-1; no resource and no feed is ticked by the tool
 *   7  a new function is created in its system once (a second identical name ticks the same one); a new system with its
 *      function lands in the architecture; a new resource lands in the resources and in Table Q.4-2
 *   8  sending needs a name and a finished table; once sent, every shown answer carries the name and the date
 *   9  a change after sending says so ("changed since it was sent") until it is sent again
 *  10  today's interdependence tables are not touched until it is sent; once sent they carry it (apx_bridge.js); the
 *      switch back shows today's page
 *  12  (v1.4) "check" for "tick"; the AI proposes systems, functions and resources from a document, a person accepts;
 *      resources are Assumed until compared with the architecture document; what was sent can be taken back out
 *  11  no page errors
 * MUTATION PROOFS (SL_APXI_MUTATE): autoadd (the AI's proposals are added by themselves), noassumed (a hand-added resource is not Assumed), noask (taking out does not ask first), notrace (a ticked function is not traced up to the aircraft function), rescol (a resource provider is a column again), preticked (the tool ticks a resource from the register), nokind (a system is added without asking its kind), offline (a field sits off the line of its label and button), nolock (a project-fed system can be unticked), leak (every function is shown in the
 *   table), nosign (sending with no name), unfinished (sending an unfinished table), noswitch (the Autopilot shows with
 *   the switch off), nostamp (answers are sent without the name), oldwrite (today's table is written to). Each must
 *   turn this red.
 * Run: node tests/regression_apx_interdependence_20261115.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_APXI_MUTATE || '';
const rd = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function mutate(file, body) {
    if (file !== 'apx_autopilots.js' || !MUT) return body;
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing: ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'offline') rep("        + '.apx input,.apx select,.apx textarea{margin:0}'\n", '');
    if (MUT === 'autoadd') rep("                save();\n                return { n: items.length };", "                save(); items.slice().forEach(function (it0) { acceptProposal(fc, it0.id); });\n                return { n: items.length };");
    if (MUT === 'noassumed') rep("(b.basis && b.basis.src === 'doc') ? 'backed' : 'assumed'; }", "(b.basis && b.basis.src === 'doc') ? 'backed' : 'backed'; }");
    if (MUT === 'noask') rep("if (tk[1] === 'ask') ui.takeAsk = tk[0]; else {", "if (tk[1] === 'ask') { doTakeOut(fc, tk[0]); } else {");
    if (MUT === 'notrace') rep("if (role !== 'fails') traceUp(fc, col.funcId); }", '}');
    if (MUT === 'rescol') rep("if (d && d.kind === 'resource') d = null;", '');
    if (MUT === 'preticked') rep("return { on: !!(me && me.on === true), fromData: false,", "return { on: me && typeof me.on === 'boolean' ? me.on : hint.length > 0, fromData: false,");
    if (MUT === 'nokind') rep("            if (!kind) { toast('Say whether it '", "            if (!kind) kind = 'fn'; if (false) { toast('Say whether it '");
    if (MUT === 'nolock') rep("if (c.on && c.locked) { ui.blocked = colId; return; }", "");
    if (MUT === 'leak') rep("function picked(fc) { return allCols().filter(function (c) { return cellOf(fc, c).on; }); }", "function picked(fc) { return allCols(); }");
    if (MUT === 'nosign') rep("if (!name) return { ok: false, why: 'Type your name to sign before sending.' };", "");
    if (MUT === 'unfinished') rep("var l = left(fc); if (l.length) return { ok: false, why: l[0] };", "");
    if (MUT === 'noswitch') rep("function enabled() { var l = ls(); try { return !!(l && l.getItem(KEY) === '1'); } catch (_) { return false; } }", "function enabled() { return true; }");
    if (MUT === 'nostamp') rep("src: x.src, by: name, at: at };", "src: x.src };");
    if (MUT === 'oldwrite') rep("        touched(fc.key);\n    }\n    function setRole", "        try { var p0 = pc(); p0.interdep = p0.interdep || {}; p0.interdep.cells = p0.interdep.cells || {}; p0.interdep.cells[fc.key + '\\u00A7' + colId] = { state: 'asserted' }; } catch (_) {}\n        touched(fc.key);\n    }\n    function setRole");
    return body;
}

(async () => {
    // ---- 1, 2: the files ------------------------------------------------------------------------------------------------
    const idx = rd('index.html'), src = rd('apx_autopilots.js');
    const iE = idx.indexOf('src="apx_engine.js'), iA = idx.indexOf('src="apx_autopilots.js'), iP = idx.indexOf('src="pasa_autopilot.js');
    check('1 index.html loads the engine, then the Autopilots, then the PASA Autopilot', iE > 0 && iA > iE && iP > iA, [iE, iA, iP].join(','));
    check('2 no em dashes in the Autopilot', src.indexOf(String.fromCharCode(0x2014)) === -1);
    check('2 American English', !/\b(colour|behaviour|analysed|analysing|centre|organis|summaris|recognis|minimis|licence|labelled|cancelled)\b/i.test(src));
    check('2 the abbreviation is AC Aircraft, never AP', src.indexOf("['AC', 'Aircraft']") !== -1 && !/\['AP',/.test(src) && !/>AP (Function|FC|Systems)/.test(src));
    check('2 the switch is read from one place', (src.match(/getItem\(KEY\)/g) || []).length === 1);

    // ---- the browser ----------------------------------------------------------------------------------------------------
    let pw; try { pw = require('playwright'); } catch (_) { console.log('  SKIP  browser checks (playwright is not installed)'); done(); return; }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
    const srv = http.createServer((q, r) => {
        let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
        const f = path.join(SITE, path.normalize(p)); let b;
        try { if (fs.statSync(f).isDirectory()) throw 0; b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
        const base = path.basename(f); if (base === 'apx_autopilots.js') b = Buffer.from(mutate(base, b.toString('utf8')));
        r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(b);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const URL0 = 'http://127.0.0.1:' + srv.address().port + '/index.html';
    const br = await pw.chromium.launch(), errs = [], tick = ms => new Promise(r => setTimeout(r, ms));
    async function boot(q) {
        const pg = await (await br.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e).slice(0, 300))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto(URL0 + q); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(async () => { await loadSampleProject(); }); await tick(4000);
        return pg;
    }
    try {
        // ---- 3: switch off -----------------------------------------------------------------------------------------------
        let pg = await boot('?apx=0');
        const off = await pg.evaluate(async () => {
            switchTab('interdep'); await new Promise(r => setTimeout(r, 1200));
            const v = document.getElementById('view-interdep'), shown = v && getComputedStyle(v).display !== 'none' && v.offsetParent !== null;
            return { enabled: window.SLApxAuto.enabled(), apx: !!document.querySelector('#interdep-host .apx'), shown: !!shown, entry: !!document.querySelector('[data-apx-entry]'), store: !!(typeof projectConfig !== 'undefined' && projectConfig && projectConfig.apx) };
        });
        check('3 switch off: the Autopilot is not enabled', off.enabled === false);
        check('3 switch off: the Interdependence tab does not open and no Autopilot is drawn', !off.apx && !off.shown && !off.entry, JSON.stringify(off));
        check('3 switch off: nothing is written into the project', off.store === false);
        await pg.context().close();

        // ---- 4: switch on ------------------------------------------------------------------------------------------------
        pg = await boot('?apx=1');
        const on = await pg.evaluate(async () => {
            switchTab('interdep'); await new Promise(r => setTimeout(r, 1500));
            const A = window.SLApxAuto, v = document.getElementById('view-interdep');
            const p = v.querySelector(':scope > p');
            return { enabled: A.enabled(), apx: !!document.querySelector('#interdep-host .apx'), shown: v.offsetParent !== null, oldText: p ? getComputedStyle(p).display : 'none', fcs: A.model.fcs().length, cols: A.model.allCols().length, k: (A.model.fcs().find(f => f.fcId === 'FC-07') || {}).key };
        });
        check('4 switch on: the Autopilot draws on the Interdependence tab', on.enabled && on.apx && on.shown, JSON.stringify(on));
        check('4 it reads the demo: failure conditions and system functions', on.fcs >= 5 && on.cols >= 10, on.fcs + ' / ' + on.cols);
        check("4 today's header text is hidden while the Autopilot shows", on.oldText === 'none', on.oldText);
        check('4 the demo has FC-07', !!on.k);
        const K = on.k;
        await pg.selectOption('[data-apx-fc]', K); await tick(300);
        await pg.selectOption('[data-apx-jump]', '1'); await tick(600);
        const vis = await pg.evaluate(() => {
            const t = document.querySelector('#interdep-host table.apx-arp'), a = document.querySelector('#interdep-host .apx-abbr');
            const open = el => { if (!el || el.offsetParent === null) return false; for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) if (!d.open) return false; return el.getBoundingClientRect().height > 0; };
            const th = t && t.querySelector('th'), cs = th && getComputedStyle(th);
            return { table: open(t), abbr: open(a), folded: !!(t && t.closest('.sl-fold')), bg: cs && cs.backgroundColor, fg: cs && cs.color, abbrText: a ? a.innerText.replace(/\s+/g, ' ') : '' };
        });
        check('4 the table and its abbreviations are open, not folded away', vis.table && vis.abbr && !vis.folded, JSON.stringify(vis));
        const dark = c => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c || ''); return m && (+m[1] + +m[2] + +m[3]) < 120; }, light = c => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c || ''); return m && (+m[1] + +m[2] + +m[3]) > 660; };
        check('2 table headers are black with white text', dark(vis.bg) && light(vis.fg), vis.bg + ' / ' + vis.fg);
        check('2 the abbreviations list says AC Aircraft and FC Failure Condition', /AC Aircraft/.test(vis.abbrText) && /FC Failure Condition/.test(vis.abbrText), vis.abbrText);

        // 16 Nov 2026 (Waqas, on the New function row: "these need to be lined up"): a label, its field and its button sit on one line
        const lined = await pg.evaluate(() => { document.querySelectorAll('#interdep-host details').forEach(d => { d.open = true; }); return Array.from(document.querySelectorAll('#interdep-host .apx-add')).map(row => { const mid = Array.from(row.children).map(c => { const b = c.getBoundingClientRect(); return (b.top + b.bottom) / 2; }); return Math.max.apply(null, mid) - Math.min.apply(null, mid); }); });
        check('4 in every "New function" and "New system" row the label, the field and the button are lined up', lined.length >= 2 && lined.every(d => d <= 1), JSON.stringify(lined.slice(0, 12)));
        // ---- 5: locked by the project's own data ---------------------------------------------------------------------------
        const before = await pg.evaluate(() => JSON.stringify((typeof projectConfig !== 'undefined' && projectConfig && projectConfig.interdep) || null));
        const lock = await pg.evaluate((K) => {
            const A = window.SLApxAuto, f = A.model.fcOf(K), p = A.model.picked(f);
            return { n: p.length, locked: p.filter(c => { const x = A.model.cellOf(f, c); return x.locked && x.src === 'data'; }).map(c => c.colId), free: A.model.allCols().filter(c => !A.model.cellOf(f, c).on).map(c => c.colId) };
        }, K);
        check('5 the project data ticks the systems that feed FC-07', lock.locked.length >= 2 && lock.locked.length === lock.n, JSON.stringify(lock).slice(0, 300));
        const L0 = lock.locked[0];
        await pg.click('[data-apx-tick="' + L0 + '"]'); await tick(400);
        const blk = await pg.evaluate(([K, L0]) => {
            const A = window.SLApxAuto, f = A.model.fcOf(K), n = document.querySelector('#interdep-host .apx-note.bad');
            return { on: A.model.cellOf(f, A.model.allCols().find(c => c.colId === L0)).on, note: n ? n.innerText : '' };
        }, [K, L0]);
        check('5 unticking a project-fed system is refused and it stays ticked', blk.on === true);
        check('5 the refusal says why and what to fix', /Can't uncheck/.test(blk.note) && /Fix that link first/.test(blk.note), blk.note);

        // ---- 6: tick, untick, only what is ticked is shown ------------------------------------------------------------------
        const heads = () => pg.evaluate(() => { const t = document.querySelector('#interdep-host table.apx-arp'); return t ? Array.from(t.querySelectorAll('tr:nth-child(2) th')).slice(3).map(th => th.innerText.replace(/\s+/g, ' ')) : []; });
        const h0 = await heads();
        check('6 Table Q.4-1 has one column per ticked function and no other', h0.length === lock.n, h0.length + ' vs ' + lock.n);
        const F0 = lock.free[0], F0id = F0.replace(/^fn:/, '');
        await pg.evaluate((F0) => { const b = document.querySelector('[data-apx-tick="' + F0 + '"]'); const d = b.closest('details'); if (d) d.open = true; }, F0);
        await pg.click('[data-apx-tick="' + F0 + '"]'); await tick(400);
        const h1 = await heads();
        check('6 ticking a function adds exactly its column', h1.length === h0.length + 1 && h1.some(t => t.indexOf(F0id) !== -1), JSON.stringify(h1).slice(0, 300));
        // 17 Nov 2026 (Waqas: "linked directly to the system level analyses"): a function that does the job is traced up to the aircraft function
        const tr1 = await pg.evaluate(([K, id]) => { const A = window.SLApxAuto, f = A.model.fcOf(K), x = A.kit.fnRow(id); return { has: (x.traceIds || []).indexOf(f.subId) !== -1, sub: f.subId, why: A.model.cellOf(f, A.model.allCols().find(c => c.funcId === id)).src }; }, [K, F0id]);
        check('6 ...and traces that system function up to the aircraft function, where the system level reads it', tr1.has === true && !!tr1.sub && tr1.why === 'data', JSON.stringify(tr1));
        const xs = await pg.evaluate(() => Array.from(document.querySelectorAll('#interdep-host table.apx-arp tr:nth-child(3) td')).slice(3).map(td => td.innerText.trim()));
        check('6 every shown column carries the X of the book', xs.length === h1.length && xs.every(x => x === 'X'), xs.join(''));
        await pg.click('[data-apx-tick="' + F0 + '"]'); await tick(400);
        const h2 = await heads();
        check('6 unticking removes the column again', h2.length === h0.length && !h2.some(t => t.indexOf(F0id) !== -1));
        const tr2 = await pg.evaluate(([K, id]) => { const A = window.SLApxAuto, f = A.model.fcOf(K), x = A.kit.fnRow(id); return (x.traceIds || []).indexOf(f.subId) !== -1; }, [K, F0id]);
        check('6 ...and takes off the trace the Autopilot made (a trace made elsewhere stays blocked)', tr2 === false);

        // ---- 7: creating what is missing -------------------------------------------------------------------------------------
        const sys0 = await pg.evaluate(() => String(systemsData[0].id));
        const nFn = () => pg.evaluate(() => systemsData.reduce((n, s) => n + (s.functions || []).length, 0));
        const n0 = await nFn();
        await pg.evaluate((s) => { const d = document.querySelector('details[data-apx-sys="' + s + '"]'); if (d) d.open = true; }, sys0);
        await pg.fill('[data-apx-newfn="' + sys0 + '"]', 'Dump lift on the ground'); await pg.click('[data-apx-addfn^="' + sys0 + '|"]'); await tick(500);
        const n1 = await nFn();
        const made = await pg.evaluate(([K, s]) => { const A = window.SLApxAuto, f = A.model.fcOf(K), sy = systemsData.find(x => String(x.id) === s), r = (sy.functions || []).find(x => x.funcName === 'Dump lift on the ground'); const ids = systemsData.reduce((a, x) => a.concat((x.functions || []).map(y => y.funcId)), []); return { id: r && r.funcId, uniq: r && ids.filter(i => i === r.funcId).length === 1, on: !!(r && A.model.picked(f).some(c => c.funcId === r.funcId)) }; }, [K, sys0]);
        check('7 a new function is created in its system with its own ID and ticked', n1 === n0 + 1 && !!made.id && made.uniq && made.on, JSON.stringify(made));
        await pg.evaluate((s) => { const d = document.querySelector('details[data-apx-sys="' + s + '"]'); if (d) d.open = true; }, sys0);
        await pg.fill('[data-apx-newfn="' + sys0 + '"]', 'Dump lift on the ground'); await pg.click('[data-apx-addfn^="' + sys0 + '|"]'); await tick(500);
        check('7 the same name again does not make a second function', (await nFn()) === n1);
        const s0n = await pg.evaluate(() => systemsData.length);
        // 16 Nov 2026 (Waqas: "ask them to add systems, and their functions as part of the PASA"; "ask them if the system is a resource system")
        const ask = await pg.evaluate((K) => { const A = window.SLApxAuto, f = A.model.fcOf(K), h = document.querySelector('#interdep-host'), askEl = h.querySelector('.apx-ask'), firstList = h.querySelector('details.apx-fold'); return { askFirst: !!askEl && (!firstList || !!(askEl.compareDocumentPosition(firstList) & 4)), q: (h.querySelector('.apx-askq') || {}).innerText, txt: h.innerText, resCols: A.model.picked(f).filter(c => { const sy = systemsData.find(x => String(x.id) === c.sysId); return sy && sy.role === 'resource'; }).length, resSys: systemsData.filter(x => x.role === 'resource').map(x => x.name), listed: Array.from(h.querySelectorAll('details.apx-fold > summary')).map(x => x.innerText) }; }, K);
        check('7 the step asks for a system and its function first, and whether it is a resource system', ask.askFirst && /Add a system and its function/.test(ask.q) && /Is it a resource system\?/.test(ask.txt), JSON.stringify({ a: ask.askFirst, q: ask.q }));
        check('7 a resource system is never a column of Table Q.4-1, and is not offered as one', ask.resSys.length >= 1 && ask.resCols === 0 && ask.resSys.every(n => !ask.listed.some(t => t.indexOf(n) === 0)) && /Resource systems are not listed here/.test(ask.txt), JSON.stringify({ res: ask.resSys, cols: ask.resCols }));
        // the project's data saying "this function provides a resource used for the aircraft function" no longer makes it a column
        const rk = await pg.evaluate((K) => { const A = window.SLApxAuto, f = A.model.fcOf(K), c = A.model.allCols().find(x => !A.model.cellOf(f, x).on), real = window._idpDerivedFn; window._idpDerivedFn = function (fc, funcId) { return String(funcId) === c.funcId ? { kind: 'resource', why: 'provides a resource consumed for this function' } : real(fc, funcId); }; const seen = A.kit.derived(f, c), x = A.model.cellOf(f, c); window._idpDerivedFn = real; return { seen: seen && seen.kind, on: x.on, locked: x.locked }; }, K);
        check('7 a function the data only knows as a resource provider is not ticked and not locked as a column', rk.seen === 'resource' && rk.on === false && rk.locked === false, JSON.stringify(rk));
        await pg.fill('[data-apx-newsys="name"]', 'Lift Dump System'); await pg.fill('[data-apx-newsys="fn"]', 'Spoil lift after touchdown'); await pg.click('[data-apx-addsys]'); await tick(500);
        const noKind = await pg.evaluate(() => ({ n: systemsData.length, kept: document.querySelector('[data-apx-newsys="name"]').value }));
        check('7 nothing is added until the engineer says which kind of system it is; what was typed is kept', noKind.n === s0n && noKind.kept === 'Lift Dump System', JSON.stringify(noKind));
        await pg.click('[data-apx-kind$="|fn"]'); await tick(300); await pg.click('[data-apx-addsys]'); await tick(600);
        const sysMade = await pg.evaluate((K) => { const A = window.SLApxAuto, f = A.model.fcOf(K), s = systemsData.find(x => x.name === 'Lift Dump System'); return { n: systemsData.length, has: !!s, fn: s && (s.functions || []).map(x => x.funcName).join('|'), on: A.model.picked(f).some(c => c.sysName === 'Lift Dump System') }; }, K);
        check('7 a new system with its function lands in the architecture and is ticked', sysMade.n === s0n + 1 && sysMade.has && sysMade.fn === 'Spoil lift after touchdown' && sysMade.on, JSON.stringify(sysMade));
        await pg.selectOption('[data-apx-jump]', '3'); await tick(500);
        const r0 = await pg.evaluate(() => resourcesData.length);
        const res0 = await pg.evaluate((K) => { const A = window.SLApxAuto, f = A.model.fcOf(K); return { picked: A.model.resPicked(f).length, hint: /resource register says/.test(document.querySelector('#interdep-host').innerText), n: A.model.resources().length }; }, K);
        check('7 no shared resource is ticked by the tool; what the register says is a hint in words', res0.picked === 0 && res0.n > 0 && res0.hint, JSON.stringify(res0));
        // a resource system added from the systems step: its function supplies a resource; it is a row here, not a column there
        await pg.selectOption('[data-apx-jump]', '1'); await tick(400);
        const colsBefore = await pg.evaluate((K) => window.SLApxAuto.model.picked(window.SLApxAuto.model.fcOf(K)).length, K);
        await pg.fill('[data-apx-newsys="name"]', 'Brake Hydraulic Supply System'); await pg.fill('[data-apx-newsys="fn"]', 'Supply brake hydraulic pressure'); await pg.click('[data-apx-kind$="|res"]'); await tick(300);
        await pg.fill('[data-apx-newsys="res"]', 'Brake Hydraulic System B'); await pg.click('[data-apx-addsys]'); await tick(600);
        const rs = await pg.evaluate((K) => { const A = window.SLApxAuto, f = A.model.fcOf(K), sy = systemsData.find(x => x.name === 'Brake Hydraulic Supply System'), r = resourcesData.find(x => x.name === 'Brake Hydraulic System B'); return { role: sy && sy.role, fn: sy && sy.functions.map(x => x.funcName).join('|'), cols: A.model.picked(f).length, prov: r && (r.providedBy || []).map(String).indexOf(String(sy.id)) !== -1, provFn: r && r.providedByFn === sy.functions[0].funcId, on: A.model.resPicked(f).some(x => x.name === 'Brake Hydraulic System B'), feeds: r ? Object.values(A.model.resState(f, A.model.resources().find(x => x.name === 'Brake Hydraulic System B')).feeds).filter(Boolean).length : -1 }; }, K);
        check('7 a system added as a resource system: the architecture has it as a resource system with its function', rs.role === 'resource' && rs.fn === 'Supply brake hydraulic pressure', JSON.stringify(rs));
        check('7 ...it adds no column to Table Q.4-1; what it supplies is a ticked resource, provided by that system and function', rs.cols === colsBefore && rs.prov && rs.provFn && rs.on, JSON.stringify(rs));
        check('7 ...and which function it feeds is left for the engineer: nothing is filled in', rs.feeds === 0, JSON.stringify(rs));
        await pg.selectOption('[data-apx-jump]', '3'); await tick(400);
        await pg.fill('[data-apx-newres="name"]', 'Weight on Wheels Signal'); await pg.fill('[data-apx-newres="sys"]', 'Avionics & Display'); await pg.fill('[data-apx-newres="fn"]', 'Detect weight on wheels'); await pg.click('[data-apx-addres]'); await tick(500);
        const prov = await pg.evaluate(() => { const sy = systemsData.find(x => x.name === 'Avionics & Display'), r = resourcesData.find(x => x.name === 'Weight on Wheels Signal'), f = sy.functions.find(x => x.funcName === 'Detect weight on wheels'); return { role: sy.role, fn: !!f, prov: (r.providedBy || []).map(String).indexOf(String(sy.id)) !== -1, provFn: !!f && r.providedByFn === f.funcId, th: Array.from(document.querySelectorAll('#interdep-host table.apx-arp th.l')).map(x => x.innerText.replace(/\s+/g, ' ')).join(' | ') }; });
        check('7 a resource is added with who provides it: an existing function system becomes "both", its function is created, and Table Q.4-2 names the provider', prov.role === 'both' && prov.fn && prov.prov && prov.provFn && /weight on wheels signal.*avionics & display: detect weight on wheels/i.test(prov.th), JSON.stringify(prov));
        const resMade = await pg.evaluate((K) => { const A = window.SLApxAuto, f = A.model.fcOf(K); const t = document.querySelector('#interdep-host table.apx-arp'); return { n: resourcesData.length, on: A.model.resPicked(f).some(r => r.name === 'Weight on Wheels Signal'), inTable: !!t && /weight on wheels signal/i.test(t.innerText), cap: (document.querySelector('#interdep-host .apx-cap') || {}).innerText || '' }; }, K);
        check('7 a new resource lands in the resources, ticked, and in Table Q.4-2', resMade.n === r0 + 2 && resMade.on && resMade.inTable && /Table Q\.4-2/.test(resMade.cap), JSON.stringify(resMade));

        // ---- 8: sending ------------------------------------------------------------------------------------------------------
        const s1 = await pg.evaluate((K) => { const A = window.SLApxAuto, f = A.model.fcOf(K); return { noName: A.act.send(f, '  '), unfinished: A.act.send(f, 'Test Engineer'), left: A.model.left(f) }; }, K);
        check('8 sending without a name is refused', s1.noName.ok === false && /name/i.test(s1.noName.why || ''), JSON.stringify(s1.noName));
        check('8 sending an unfinished table is refused with what is left', s1.left.length > 0 && s1.unfinished.ok === false && !!s1.unfinished.why, JSON.stringify(s1).slice(0, 400));
        const mid = await pg.evaluate(() => JSON.stringify((typeof projectConfig !== 'undefined' && projectConfig && projectConfig.interdep) || null));
        check("10 until it is sent, today's interdependence tables are not touched", mid === before, 'before ' + before.length + ' chars, now ' + mid.length);
        const s2 = await pg.evaluate((K) => {
            const A = window.SLApxAuto, f = () => A.model.fcOf(K);
            A.model.resPicked(f()).forEach(r => { if (!A.model.resState(f(), r).modes.length) A.act.mode(f(), r.key, 'Total loss', true); });
            A.model.effectRows(f()).forEach(x => { const st = A.model.resState(f(), x.r); A.model.picked(f()).forEach(c => { if (st.feeds[c.colId] && !A.model.craText(f(), x.r, x.mode, c.colId)) A.act.setCra(f(), x.r.key + '|' + x.mode + '|' + c.colId, 'Function lost'); }); if (!A.model.craText(f(), x.r, x.mode, '')) A.act.setCra(f(), x.r.key + '|' + x.mode + '|', 'The failure condition happens'); });
            const left = A.model.left(f()), res = A.act.send(f(), 'Test Engineer'), rec = projectConfig.apx.idp[K], cols = A.model.picked(f());
            return { left, res, status: A.model.status(f()), n: cols.length, stamped: cols.filter(c => rec.cols[c.colId] && rec.cols[c.colId].by === 'Test Engineer' && rec.cols[c.colId].at).length, sent: rec.sent };
        }, K);
        check('8 a finished table is sent with one signature', s2.left.length === 0 && s2.res.ok === true && s2.status.k === 'sent' && s2.sent && s2.sent.by === 'Test Engineer', JSON.stringify(s2).slice(0, 400));
        check('8 the name and date are recorded on every shown answer', s2.n > 0 && s2.stamped === s2.n, s2.stamped + ' of ' + s2.n);
        await pg.selectOption('[data-apx-jump]', '6'); await tick(500);
        const fin = await pg.evaluate(() => { const h = document.querySelector('#interdep-host'); return { caps: Array.from(h.querySelectorAll('.apx-cap')).map(c => c.innerText.replace(/\s+/g, ' ')), txt: h.innerText }; });
        check('8 the last step shows the three tables of the book', fin.caps.length === 3 && /Q\.4-1/.test(fin.caps[0]) && /Q\.4-2/.test(fin.caps[1]) && /Table B3/.test(fin.caps[2]), fin.caps.join(' | '));
        check('8 it says who signed', /Sent to the PASA\./.test(fin.txt) && /Test Engineer/.test(fin.txt));

        // ---- 9: a change after sending -----------------------------------------------------------------------------------------
        const ch = await pg.evaluate(([K, F0]) => { const A = window.SLApxAuto, f = A.model.fcOf(K); A.act.tick(f, F0, 'does'); return A.model.status(A.model.fcOf(K)).k; }, [K, F0]);
        check('9 a change after sending is called out until it is sent again', ch === 'changed', ch);

        // ---- 10: today's tables are left alone ---------------------------------------------------------------------------------
        const proj = await pg.evaluate((K) => { const A = window.SLApxAuto, f = A.model.fcOf(K), cells = (projectConfig.interdep || {}).cells || {}, mine = Object.keys(cells).filter(k => k.indexOf(K + '\u00A7') === 0 && cells[k].apx); return { br: !!window.SLApxBridge, n: mine.length, asserted: mine.filter(k => cells[k].state === 'asserted').length, cleared: mine.filter(k => cells[k].state === 'cleared').length, by: mine.every(k => cells[k].by === 'Test Engineer'), cols: A.model.allCols().length, contrib: idpContributors(f.row).map(String), ticked: A.model.picked(f).map(c => c.sysId).filter((x, i, a) => a.indexOf(x) === i) }; }, K);
        check("10 once sent, today's table carries it for the files that read it: every ticked system is a contributor there (by its trace or an assertion), the rest are cleared, signed", proj.br && proj.cleared > 0 && proj.by && proj.n <= proj.cols && proj.ticked.every(x => proj.contrib.indexOf(x) !== -1), JSON.stringify(proj));
        // ---- 12: 17 Nov 2026 (Waqas: "all three, and instead of saying tick it, we should be saying check it") -----------------
        const words = await pg.evaluate(async () => { const A = window.SLApxAuto, out = []; for (let i = 0; i < 7; i++) { A._ui.step = i; A.kit.draw(); document.querySelectorAll('#interdep-host details').forEach(d => { d.open = true; }); const h = document.querySelector('#interdep-host'); const t = h.innerText + ' ' + Array.from(h.querySelectorAll('[aria-label],[placeholder],[title]')).map(e => (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('placeholder') || '') + ' ' + (e.getAttribute('title') || '')).join(' '); out.push({ tick: /\btick|untick/i.test(t), check: /\bcheck/i.test(t) }); } return out; });
        check('12 the page says "check", never "tick", on every step', words.every(w => !w.tick) && words.filter(w => w.check).length >= 4, JSON.stringify(words));
        // the AI reads a design document and proposes; nothing is added until a person accepts
        const ai = await pg.evaluate(async (K) => {
            const A = window.SLApxAuto, f = () => A.model.fcOf(K), out = {};
            window.slLoadAI = async () => {}; let seen = null;
            window.SafetyLabSourceDocs = { list: () => [{ name: 'K350 Architecture Description Rev C', text: 'The ground spoilers dump lift after touchdown. Hydraulic System B powers the ground spoilers.' }] };
            window.SafetyLabAI = { complete: async (o) => { seen = o; return { model: 'test-model', text: JSON.stringify({ systems: [{ system: 'Ground Spoiler System', function: 'Dump lift after touchdown', kind: 'does', quote: 'The ground spoilers dump lift after touchdown.', where: 'section 4.2' }, { system: 'No Function Given', kind: 'does' }, { system: 'Bad Kind', function: 'x', kind: 'maybe' }], resources: [{ resource: 'Hydraulic System B', providedBySystem: 'Hydraulic Power System', providedByFunction: 'Supply hydraulic pressure, system B', feeds: [{ system: 'Ground Spoiler System', function: 'Dump lift after touchdown' }, { system: 'Not A Column' }], quote: 'Hydraulic System B powers the ground spoilers.', where: 'section 6.1' }] }) }; } };
            const n0 = systemsData.length, c0 = A.model.picked(f()).length, r0 = resourcesData.length;
            const doc = window.SafetyLabSourceDocs.list()[0]; const r = await A.act.propose(f(), 'doc', doc); out.r = r;
            out.mid = { sys: systemsData.length - n0, cols: A.model.picked(f()).length - c0, res: resourcesData.length - r0, items: A.model.proposals(f()).items.map(x => x.t + ':' + (x.t === 'res' ? x.resource : x.system)) };
            A._ui.step = 1; A.kit.draw(); out.shown = /AI proposes/.test(document.querySelector('#interdep-host').innerText) && !!document.querySelector('#interdep-host [data-apx-pacc]');
            const sysItem = A.model.proposals(f()).items.find(x => x.t === 'sys'), resItem = A.model.proposals(f()).items.find(x => x.t === 'res');
            out.a1 = A.act.acceptProposal(f(), sysItem.id);
            const col = A.model.picked(f()).find(c => c.sysName === 'Ground Spoiler System'); out.col = col && { fn: col.fnName, basis: (projectConfig.apx.idp[K].basis || {})[col.colId], traced: (A.kit.fnRow(col.funcId).traceIds || []).indexOf(f().subId) !== -1 };
            out.a2 = A.act.acceptProposal(f(), resItem.id);
            const res = A.model.resources().find(x => x.name === 'Hydraulic System B'), st = res && A.model.resState(f(), res); out.res = res && { on: st.on, feeds: Object.keys(st.feeds).filter(k => st.feeds[k]), want: col && col.colId, prov: A.kit.providerText(res), basis: A.model.resBasis(f(), res).basis };
            out.left = A.model.proposals(f()).items.length; out.feature = seen && seen.feature; out.temp = seen && seen.temperature; out.never = seen && /never guess/.test(seen.system);
            return out;
        }, K);
        check('12 the AI is asked to use only the text, never to guess, at temperature 0; a proposal with no function or an unknown kind is dropped', ai.feature === 'apx.idp.propose' && ai.temp === 0 && ai.never && ai.mid.items.join() === 'sys:Ground Spoiler System,res:Hydraulic System B', JSON.stringify(ai.mid));
        check('12 its proposals are shown and nothing is added until a person accepts', ai.r.n === 2 && ai.shown && ai.mid.sys === 0 && ai.mid.cols === 0 && ai.mid.res === 0, JSON.stringify(ai.mid));
        check('12 accepting a system adds it with its function, as a column, traced up, and records the document and the words it rests on', ai.a1.ok && ai.col && ai.col.fn === 'Dump lift after touchdown' && ai.col.traced && ai.col.basis && ai.col.basis.src === 'doc' && /Architecture Description Rev C/.test(ai.col.basis.doc) && /dump lift/.test(ai.col.basis.quote), JSON.stringify(ai.col));
        check('12 accepting a resource checks it, with its provider, and fills in only the feeds the document names that are columns here', ai.a2.ok && ai.res && ai.res.on && ai.res.feeds.join() === ai.res.want && /Hydraulic Power System: supply hydraulic pressure, system b/i.test(ai.res.prov) && ai.left === 0, JSON.stringify(ai.res));
        // the resources are Assumed until read from, or compared with, the architecture document
        const rst = await pg.evaluate((K) => { const A = window.SLApxAuto, f = () => A.model.fcOf(K), out = {}, rs = A.model.resPicked(f()); out.n = rs.length; out.s0 = A.model.resStatus(f()); const hand = rs.filter(r => !(A.model.resBasis(f(), r).basis && A.model.resBasis(f(), r).basis.src === 'doc')); out.hand = hand.length; hand.forEach(r => A.act.setCompare(f(), r.key, 'same', 'Architecture Description 6.1')); out.s1 = A.model.resStatus(f()).k; A.act.setCompare(f(), hand[0].key, 'differs', 'Architecture Description 6.1'); out.s2 = A.model.resStatus(f()).k; A.act.setCompare(f(), hand[0].key, 'same', 'Architecture Description 6.1'); A._ui.step = 3; A.kit.draw(); out.txt = document.querySelector('#interdep-host').innerText; return out; }, K);
        check('12 a resource added by hand is Assumed until it is compared with the architecture document; one read from the document is not', rst.hand >= 1 && rst.hand < rst.n && rst.s0.k === 'assumed' && new RegExp('Assumed: ' + rst.hand + ' of ' + rst.n + ' ').test(rst.s0.t), JSON.stringify(rst.s0));
        check('12 compared and matching: Backed by the architecture document; a difference shows as Different', rst.s1 === 'backed' && rst.s2 === 'differs' && /Resources: Backed by the architecture document/.test(rst.txt), JSON.stringify({ s1: rst.s1, s2: rst.s2 }));
        // what was sent can be taken back out, from the page
        const tk = await pg.evaluate(async (K) => {
            const A = window.SLApxAuto, f = () => A.model.fcOf(K), out = {}, wait = ms => new Promise(r => setTimeout(r, ms));
            A.model.resPicked(f()).forEach(r => { if (!A.model.resState(f(), r).modes.length) A.act.mode(f(), r.key, 'Total loss', true); });
            A.model.effectRows(f()).forEach(x => { const st = A.model.resState(f(), x.r); A.model.picked(f()).forEach(c => { if (st.feeds[c.colId] && !A.model.craText(f(), x.r, x.mode, c.colId)) A.act.setCra(f(), x.r.key + '|' + x.mode + '|' + c.colId, 'Function lost'); }); if (!A.model.craText(f(), x.r, x.mode, '')) A.act.setCra(f(), x.r.key + '|' + x.mode + '|', 'The failure condition happens'); });
            out.send = A.act.send(f(), 'Test Engineer'); out.sentAs = projectConfig.apx.idp[K].sent;
            const mine = () => Object.keys(projectConfig.interdep.cells).filter(k => k.indexOf(K + '§') === 0 && projectConfig.interdep.cells[k].apx).length;
            out.before = mine(); A._ui.step = 6; A.kit.draw();
            const b1 = document.querySelector('#interdep-host [data-apx-take$="|ask"]'); out.btn = !!b1; b1.click(); await wait(200);
            out.asks = !!document.querySelector('#interdep-host [data-apx-takeask]'); out.still = mine();
            document.querySelector('#interdep-host [data-apx-take$="|yes"]').click(); await wait(300);
            out.after = mine(); out.status = A.model.status(f()).k; out.kept = A.model.picked(f()).length; out.tookOut = !!projectConfig.apx.idp[K].tookOut;
            return out;
        }, K);
        check('12 the resource status is sent with the Autopilot', tk.send.ok && tk.sentAs.resStatus === 'backed', JSON.stringify(tk.sentAs));
        check('12 once sent, the page offers to take it back out, and asks before doing it', tk.btn && tk.asks && tk.still === tk.before && tk.before > 0, JSON.stringify(tk));
        check('12 taking it out removes what was sent from today\'s table; the answers here stay', tk.after === 0 && tk.status === 'started' && tk.kept > 0 && tk.tookOut, JSON.stringify(tk));
        await pg.evaluate(() => { window.SLApxAuto._ui.step = 6; window.SLApxAuto.kit.draw(); });
        await pg.click('[data-apx-view="old"]'); await tick(1200);
        const old = await pg.evaluate(() => { const v = document.getElementById('view-interdep'), p = v.querySelector(':scope > p'); return { cls: v.classList.contains('apx-on'), p: p ? getComputedStyle(p).display : '', sw: !!document.querySelector('#interdep-host [data-apx-view="new"]'), body: document.querySelector('#interdep-host').innerText.length }; });
        check("10 the switch back shows today's page, with the way back to the Autopilot", !old.cls && old.p !== 'none' && old.sw && old.body > 200, JSON.stringify(old));
        check('11 no page errors', errs.length === 0, errs.join(' | '));
        await pg.context().close();
    } catch (e) { check('browser run completed', false, e && e.stack ? e.stack : e); }
    await br.close(); srv.close();
    done();
    function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  [mutation: ' + MUT + ']' : '')); process.exit(fail ? 1 : 0); }
})();
