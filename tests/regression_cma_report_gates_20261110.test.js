/* regression_cma_report_gates_20261110.test.js: every critical gate written into the CMA report, with the real fault tree
 * around it and the common mode analysis written in advance; the "if certain" number fixed; report text the full width of
 * the page in every report.
 *
 * Waqas, 9 Nov 2026, on the CMA page: "why is this table there and not in the report, why are we not showing them images of
 * the fault trees we are talking about and why have we not pre-written the qualitative analyses for them?"; on the report
 * text: "we also need to fix how we are not using the full width of the page for the text", for "all the reports". On
 * grouping: "Grouped. One CMA per independence claim, listing every gate that relies on it, and each gate keeps its own
 * section and fault tree picture pointing to the shared review. Same claim means exactly the same set of items or systems
 * claimed independent: a gate relying on a subset or a different set gets its own CMA."
 *
 * On the Aeolus HL-1 demo, in the real app, with the production CSP:
 *   [S]  pins and headers: critical_gates 1.4, cma_claims 1.1 (before cma_autopilot), helpers_modules 3.68, cma_autopilot 1.4, cca_report 1.8,
 *        plan_autopilot 2.3; no em dashes in what changed; the 78ch and 980px text caps gone
 *   [N]  (10 Nov late, critical_gates 1.5) the second test is "one shared cause takes out all the inputs": a real rate (the gate at
 *        its least likely input), "every flight" only when it is, never 34.5 / flight time. Before (1.4): the "if certain" number: a gate taken as certain that makes the failure condition certain reads "every flight", never
 *        a rate (no 34.5 / flight time anywhere); other values convert as before (G-7098: -ln(1 - P) / 3 h); the words say it
 *   [P]  the standalone panel is gone from the CMA page; SLCriticalGates and its API stay
 *   [G]  every critical gate has its section in the right report (aircraft or its system), under its failure condition by ID
 *        and name with the severity in words; gates claiming exactly the same items share one claim, a subset gets its own
 *   [F]  each gate's section shows its fault tree as the tool's canvas draws it (Waqas, 10 Nov 2026: "why are we showing
 *        them like these instead of the actual fault trees from the tool?"): the canvas's gate and event symbols, its ID and
 *        probability line, its DAL badges; the gate outlined, its inputs outlined dashed; up to 40 nodes (and 6 columns, the
 *        printed trees' limit) one picture, a bigger tree in parts ("over 40 nodes be cut down, cropped and shown as multiple
 *        images"), each cut naming the part it continues in; numbered and in the list of figures; boxes open the node panel
 *   [A]  every common mode category in each claim: answered from the project data with its source, or waiting for the
 *        engineer in the "Write it myself" / "Draft with AI" box; same inputs, same answers
 *   [W]  the engineer's part: nothing written until saved or accepted; an AI draft (stubbed) writes nothing; accepting makes
 *        the one CMA record with the data's answers and concerns in it, named "AI draft accepted by the engineer"
 *   [D]  no duplicate CMA rows: one record per claim however many times it is answered; every gate in one record only
 *   [M]  full width: in the PRA, ZSA and CMA reports and the Plan Autopilot (SSPP, HF, RAM) a paragraph is as wide as the
 *        table under it
 *   [X]  Word: contents, list of figures, the tree pictures, no preview-only boxes, no counts
 *   [K]  dark mode: the report and its tree pictures readable (contrast at least 4.5)
 *   no page errors
 * MUTATION PROOFS: SL_CMAG_MUTATE=certain | panel | group | nofig | nomark | notool | nosplit | noauto | aiwrites | dup | width |
 * html2word.
 * Each one turns this red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_cma_report_gates_20261110.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 900) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_CMAG_MUTATE || '';
const MUTS = {
    certain:   ['critical_gates.js', "if (pk != null && (best == null || pk < best.p)) best = { p: pk, k: k };", "if (pk != null) best = { p: 1, k: k };"],
    panel:     ['critical_gates.js', "var old = d.getElementById('critical-gates-panel'); if (old && old.parentNode) old.parentNode.removeChild(old);\n        return;", "return _renderPanelV13();"],
    group:     ['cma_claims.js', "function claimKey(key) { var ins = inputs(key);", "function claimKey(key) { return 'gate:' + S(key); var ins = inputs(key);"],
    nofig:     ['cma_autopilot.js', "treeFigure(r, x, gid, opts).forEach(function (fig) { blocks.push(fig); });", "void 0;"],
    nomark:    ['cma_claims.js', "isInput = inputs.indexOf(n) >= 0,", "isInput = false,"],
    notool:    ['cma_claims.js', "'<path d=\"' + E(shape({ data: n })) + '\"", "'<path d=\"M -20,-20 h 40 v 40 h -40 Z\""],
    nosplit:   ['cma_claims.js', "var MAX_NODES = 40, MAX_COLS = 6,", "var MAX_NODES = 1e9, MAX_COLS = 1e9,"],
    noauto:    ['cma_claims.js', "    function evidence(keys) {\n", "    function evidence(keys) { return {};\n"],
    aiwrites:  ['cma_autopilot.js', "        m0[c.key][grp] = { lines: lines, at: now(), model: (res && res.model) || '', flags: flags };", "        answerMany(r, lines, 'ai'); m0[c.key][grp] = { lines: lines, at: now(), model: (res && res.model) || '', flags: flags };"],
    dup:       ['cma_autopilot.js', "        var row = c.real ? c.row : null, was = c.row.internalId;", "        var row = null, was = c.row.internalId;"],
    width:     ['cca_report.js', ".ccr .ccr-prev p{margin:0 0 7px;max-width:none}", ".ccr .ccr-prev p{margin:0 0 7px;max-width:78ch}"],
    html2word: ['cca_report.js', "return bl.filter(function (b) { return b.k !== 'act' && b.k !== 'auth' && b.k !== 'html' && !b.pend; })", "return bl.filter(function (b) { return b.k !== 'act' && b.k !== 'auth' && !b.pend; })"]
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) { let s = fs.readFileSync(path.join(SITE, name), 'utf8'); const m = MUTS[MUT]; if (m && m[0] === name) { if (s.indexOf(m[1]) < 0) throw new Error('mutation site missing: ' + m[1]); s = s.replace(m[1], m[2]); } return s; }
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
const lum = hex => { const h = hex.replace('#', ''); const c = [0, 2, 4].map(i => parseInt(h.length === 3 ? h[i / 2] + h[i / 2] : h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

(async function main() {
    console.log('\n[S] pins, headers, no em dashes, no text caps');
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), at = f => HTML.indexOf('src="' + f + '?v=');
    const R = n => fs.readFileSync(path.join(SITE, n), 'utf8');
    check('S1 critical_gates.js 1.5, cma_claims.js 1.2, helpers_modules.js 3.68 or later, cma_autopilot.js 1.5 or later, cca_report.js 2.1, plan_autopilot.js 2.4 pinned (10 Nov late: the shared cause test, whole trees drawn for the PASA and PSSA, appendices), headers the same', /critical_gates\.js\?v=1\.5"/.test(HTML) && /cma_claims\.js\?v=1\.2"/.test(HTML) && (m => !!m && +m[1] >= 68)(HTML.match(/helpers_modules\.js\?v=3\.(\d+)"/)) && /cma_autopilot\.js\?v=1\.[5-9]"/.test(HTML) && /cca_report\.js\?v=2\.1"/.test(HTML) && /plan_autopilot\.js\?v=2\.4"/.test(HTML)
        && /critical_gates\.js v1\.4/.test(R('critical_gates.js').slice(0, 4000)) && /v1\.5, Waqas agreed/.test(R('critical_gates.js').slice(0, 300)) && /SLCmaClaims v1\.2/.test(R('cma_claims.js').slice(0, 200)) && /SLCmaAuto v1\.[5-9]/.test(R('cma_autopilot.js').slice(0, 200)) && /SLCcaReport v2\.1/.test(R('cca_report.js').slice(0, 200)) && /v2\.4/.test(R('plan_autopilot.js').slice(0, 400)));
    check('S2 cma_claims.js loads after critical_gates.js and cma_flow.js and before cma_autopilot.js', at('cma_claims.js') > at('critical_gates.js') && at('cma_claims.js') > at('cma_flow.js') && at('cma_claims.js') < at('cma_autopilot.js') && at('critical_gates.js') > 0);
    check('S3 no em dashes in the files this change wrote', ['critical_gates.js', 'cma_claims.js', 'cma_autopilot.js', 'cca_report.js'].every(f => R(f).indexOf('\u2014') < 0) && fs.readFileSync(__filename, 'utf8').indexOf('\u2014') < 0);
    check('S4 the report text caps are gone (78ch paragraphs, 980px leads)', R('cca_report.js').indexOf('max-width:78ch') < 0 && !/\.ccr-lead\{[^}]*max-width:980px/.test(R('cca_report.js')) && !/\.pla-lead\{[^}]*max-width:980px/.test(R('plan_autopilot.js')));

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
        const pg = await (await browser.newContext({ viewport: { width: 2000, height: 1200 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 300))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.addInitScript(() => { window.SL_VERIFY_SYNC_OFF = true; });
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(() => window.loadHL1Demo()); await tick(9000);

        const r = await within(pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const A = window.SLCmaAuto, K = window.SLCmaClaims, CG = window.SLCriticalGates, out = {};
            const live = () => cmaData.filter(c => c && !c.suggested);
            // ---- [N] the numbers ----------------------------------------------------------------------------------------
            const all = CG.analyzeAll(), crit = [];
            all.forEach(res => res.gates.forEach(g => { if (g.critical) crit.push({ res, g }); }));
            const hours = all[0] && all[0].missionHours;
            const fake = 34.538776394910684 / hours;
            out.n = {
                count: crit.length,
                // 10 Nov 2026 (late, v1.5): the second test is "one shared cause takes out all the inputs" (Waqas agreed); the
                // gate then fails as often as its least likely input, so the number is a real rate
                noFake: crit.every(x => x.g.rateShared == null || Math.abs(x.g.rateShared - fake) / fake > 1e-6),
                everyIsNull: crit.filter(x => x.g.pShared >= 1 - 1e-9).every(x => x.g.sharedEveryFlight === true && x.g.rateShared === null && x.g.sharedBreaks === true),
                manyReal: crit.filter(x => x.g.rateShared != null && x.g.rateShared < 1).length,
                g7098: (() => { const x = crit.find(c => c.g.displayId === 'G-7098' && c.res.pageId === 'pg-eps-total'); return x ? { p: x.g.pShared, rate: x.g.rateShared, want: -Math.log1p(-x.g.pShared) / hours, from: x.g.sharedFrom } : null; })(),
                words: (() => { const x = crit.find(c => c.g.displayId === 'G-7086'); const w = CG.explain(x.g, x.res); return w && w.text; })(),
                wordsRate: (() => { const x = crit.find(c => c.g.displayId === 'G-7098'); const w = CG.explain(x.g, x.res); return w && w.text; })(),
                thread: (() => { const f = acFhaData.find(z => z && /FC-05/.test(z.fcId || '')); return f ? CG.threadStage(f) : ''; })()
            };
            // ---- [P] the panel -------------------------------------------------------------------------------------------
            switchTab('cma'); await wait(2500);
            try { renderCMA(); } catch (_) {} await wait(600);
            out.p = { panel: !!document.getElementById('critical-gates-panel'), text: /Which independence claims carry the budget/.test(document.getElementById('view-cma').innerText), api: ['analyzeAll', 'startReview', 'threadStage', 'findings', 'reviewedBy', 'panelHtml'].every(k => typeof CG[k] === 'function') && CG.INV && CG.INV.id === 'INV-58' };
            // ---- [G] every critical gate in its report, grouped -------------------------------------------------------------
            const Rf = SLCcaReport.get('cma'), reps = Rf.reports();
            const secs = A.reportSections(), gates = K.gates();
            const claimOf = key => A.claimList().find(c => c.gates.indexOf(key) >= 0);
            const levelOfKey = key => { const pid = key.slice(0, key.lastIndexOf(':')); const p = ftaPages.find(x => x.id === pid); return p && p.treeLevel === 'system' && p.systemId ? 'sys:' + p.systemId : 'aircraft'; };
            out.g = { gates: gates.length, miss: [], wrongRep: [], noFc: [], noHead: [] };
            gates.forEach(gt => {
                const c = claimOf(gt.key); if (!c) { out.g.miss.push(gt.key); return; }
                const sid = A.anchorOf(c.row), sec = secs.find(s => s.id === sid); if (!sec) { out.g.miss.push(gt.key); return; }
                const rep = reps.find(x => x.sections.indexOf(sid) >= 0), lv = c.gates.map(levelOfKey), want = lv.every(l => l === lv[0]) ? lv[0] : 'aircraft';
                if (!rep || rep.id !== want) out.g.wrongRep.push(gt.key + ' in ' + (rep && rep.id) + ' want ' + want);
                const fc = gt.fcs[0], parts = sec.blocks.filter(b => b.type === 'part').map(b => b.text);
                if (!fc || !parts.some(t => t.indexOf(fc.id) === 0 && (!fc.name || t.indexOf(fc.name) > 0) && /\((Catastrophic|Hazardous|Major|Minor|No safety effect)\)$/.test(t))) out.g.noFc.push(gt.key + ' ' + (fc && fc.id));
                if (!parts.some(t => t.indexOf(gt.displayId + ' ') === 0)) out.g.noHead.push(gt.key);
            });
            const cl = k => (claimOf(k) || {}).key;
            out.g.sameClaim = cl('pg-fcs-pitch:7068') && cl('pg-fcs-pitch:7068') === cl('pg-fcs-pitch-v:7309');
            out.g.subsetOwn = cl('pg-prp-allout:7086') && cl('pg-prp-sameside:7089') && cl('pg-prp-allout:7086') !== cl('pg-prp-sameside:7089') && cl('pg-prp-sameside:7089') !== cl('pg-prp-sameside:7092');
            out.g.testsInWords = secs.filter(s => s.virtual).every(s => s.blocks.some(b => /^The budget tests? for /.test(b.text || '') && /per flight hour/.test(b.text) && !/as OR: exceeds|as certain/.test(b.text)));
            out.g.everyFlightWords = secs.some(s => s.blocks.some(b => /one shared cause took out all of its inputs at once/.test(b.text || '')));   // 10 Nov late: the shared cause test in words
            // ---- [F] the tree pictures ---------------------------------------------------------------------------------------
            out.f = { bad: [] };
            gates.forEach(gt => {
                const c = claimOf(gt.key); if (!c) return; const sec = secs.find(s => s.id === A.anchorOf(c.row)); if (!sec) return;
                const figs0 = sec.blocks.filter(b => b.type === 'figure' && b.gateKey === gt.key);
                const ins = K.inputs(gt.key).map(n => String(n.node.id));
                if (!figs0.length) { out.f.bad.push(gt.key + ' no figure'); return; }
                const svgAll = figs0.map(f => f.svg).join('');
                const gateMarks = (svgAll.match(/data-cmt-mark="gate"/g) || []).length;
                const inputIds = [...new Set([].concat(...figs0.map(f => f.nodes.filter(n => n.kind === 'input').map(n => n.nodeId))))];
                const pageOf = gt.key.slice(0, gt.key.lastIndexOf(':')), pg0 = ftaPages.find(p => p.id === pageOf);
                const all = []; (function w(n) { all.push(n); (n.children || n._children || []).forEach(w); })(pg0.root);
                const drawn = new Set([].concat(...figs0.map(f => f.nodes.map(n => n.nodeId))));
                const toolLook = all.every(n => svgAll.indexOf(getShapePath({ data: n })) >= 0) && all.filter(n => n.displayId).every(n => svgAll.indexOf('>' + n.displayId + '<') >= 0) && /P=\d/.test(svgAll) && all.filter(n => n.allocatedDAL).every(n => svgAll.indexOf(dalPrefixForNode(n) + ' ' + n.allocatedDAL) >= 0);
                if (figs0.some(f => f.svg.indexOf('data-cmt-gate="' + gt.key + '"') < 0) || gateMarks < 1 || figs0.filter(f => f.hasGate).length !== 1 || inputIds.length !== ins.length || !ins.every(i => inputIds.indexOf(i) >= 0)
                    || !all.every(n => drawn.has(String(n.id))) || !toolLook || !figs0.every(f => f.nodes.every(n => n.label && n.accept))) out.f.bad.push(gt.key + ' gate' + gateMarks + ' inputs' + inputIds.length + '/' + ins.length + ' drawn' + drawn.size + '/' + all.length + ' look' + toolLook);
                // the size rule: at most 40 nodes and 6 columns a picture; a bigger tree comes in parts that each say where they continue
                const fg = K.figure(gt.key);
                if (fg.parts.some(p => p.count > 40) || (fg.parts.length > 1 && !(figs0.every((f, i) => new RegExp(', part ' + String.fromCharCode(65 + i) + '$').test(f.caption)) && /Continues in part B/.test(figs0[0].svg)))) out.f.bad.push(gt.key + ' parts');
                if (gt.key === 'pg-prp-allout:7086') out.f.split = fg.parts.length > 1 && fg.total === 13 && figs0.length === fg.parts.length;
                if (gt.key === 'pg-fcs-pitch:7068') out.f.whole = fg.parts.length === 1 && figs0.length === 1;
            });
            const rep0 = reps.find(x => x.id === 'sys:sys-prp');
            Rf.setTab('sys:sys-prp'); await wait(1500);
            const docB = Rf.doc({ report: 'sys:sys-prp' }), figs = docB.filter(b => b.k === 'fig');
            out.f.numbered = figs.length >= 2 && figs.every((f, i) => f.n === i + 1 || f.n > 0) && figs.some(f => /fault tree "PSSA · Loss of thrust on all four powerplants" around G-7086, part A$/.test(f.caption || ''));
            const html = Rf.fullHtml({ report: 'sys:sys-prp' });
            out.f.lof = (html.match(/data-cc-lof="1"/g) || []).length >= figs.length && /The fault tree &quot;PSSA · Loss of thrust on all four powerplants&quot; around G-7086/.test(html.slice(0, html.indexOf('data-cc-toc') + 20000));
            const box = document.querySelector('#ccr-host-cma [data-ccnode*="-g-pg-prp-allout-7086-n7086"]');
            out.f.domFig = !!box;
            if (box) { box.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(500); out.f.panel = /critical AND gate/.test((document.querySelector('#ccr-host-cma .ccr-np, #ccr-host-cma [data-cc-panel], .ccr-panel') || {}).innerText || document.getElementById('ccr-host-cma').innerText); }
            // ---- [A] the categories ---------------------------------------------------------------------------------------------
            const cats = A.categoriesPlain();
            const SOURCES = /^(Fault tree|Items|CAD model zones|Particular risk assessment|Routing)(, (Fault tree|Items|CAD model zones|Particular risk assessment|Routing))*$/;
            out.a = { bad: [], anyAuto: 0, srcBad: [] };
            secs.filter(s => s.virtual).forEach(s => {
                const t = s.blocks.find(b => /-modes-t$/.test(b.id)), jb = s.blocks.find(b => b.type === 'html');
                const open = t.rows.filter(rw => rw.cells[2] === 'Not answered yet').map((rw, i) => rw.q.split('/').pop());
                if (t.rows.length !== cats.length) out.a.bad.push(s.id + ' rows ' + t.rows.length);
                if (open.length && (!jb || open.some(c => jb.cats.indexOf(c) < 0))) out.a.bad.push(s.id + ' open not in the box');
                t.rows.forEach(rw => { if (rw.cells[2] !== 'Not answered yet') { out.a.anyAuto++; if (!SOURCES.test(rw.cells[4])) out.a.srcBad.push(rw.cells[4]); if (!/(fault tree|item list|CAD model|particular risk|Routing)/i.test(rw.cells[3])) out.a.srcBad.push('why: ' + rw.cells[3].slice(0, 80)); } });
            });
            const k1 = 'pg-prp-allout:7086', e1 = JSON.stringify(K.evidence([k1])); K.forget(); const e2 = JSON.stringify(K.evidence([k1]));
            out.a.same = e1 === e2 && e1.length > 20;
            out.a.engines = (() => { const e = K.evidence([k1]); return { mfr: e['mf-mfr'] && e['mf-mfr'].a, part: e['im-part'] && e['im-part'].a, sw: e['dv-sw'] && e['dv-sw'].a }; })();
            out.a.elev = (() => { const e = K.evidence(['pg-fcs-pitch:7068']); return { mfr: e['mf-mfr'] && e['mf-mfr'].a, bay: e['im-bay'] && e['im-bay'].a }; })();
            // ---- [W] the engineer's part: nothing written before acceptance -----------------------------------------------------------
            const vc = A.claimList().find(c => !c.real && c.gates.indexOf('pg-prp-sameside:7089') >= 0);
            const n0 = live().length, snap0 = JSON.stringify(cmaData);
            window.SafetyLabAI = { complete: async req => ({ text: 'mt-staff | Concern | One crew may service both engines on the left side in one visit.\nop-staff | No | Shutdown drills act on one engine at a time.\nxx-bad | No | ignored', model: 'stub' }) };
            const sid0 = A.anchorOf(vc.row);
            out.w = { boxBefore: !!document.querySelector('[data-cmj-box]') };
            const d = await A.ui.judgeAi(vc.row.internalId, 'all'); await wait(300);
            out.w.draft = d && d.lines.length === 2;
            out.w.nothingWritten = live().length === n0 && JSON.stringify(cmaData) === snap0;
            const sAfterDraft = A.reportSections().find(s => s.id === sid0);
            out.w.notInTable = sAfterDraft && sAfterDraft.blocks.find(b => /-modes-t$/.test(b.id)).rows.find(rw => /mt-staff$/.test(rw.q)).cells[2] === 'Not answered yet';
            Rf.setTab('sys:sys-prp'); await wait(800);
            out.w.draftShown = !!document.querySelector('[data-cmj-draft]');
            const acc = A.ui.judgeAccept(vc.row.internalId, 'all'); await wait(300);
            const row = cmaData.find(c => c.internalId === acc.row);
            out.w.accepted = acc.ok && live().length === n0 + 1 && !!row && row.flow.answers['mt-staff'] && row.flow.answers['mt-staff'].src === 'ai' && row.flow.answers['op-staff'].a === 'no';
            out.w.autoIn = row && Object.keys(row.flow.answers).filter(k => row.flow.answers[k].auto).length >= 3 && row.flow.concerns.some(c => c.from === 'project data');
            out.w.gatesIn = row && ['pg-prp-sameside:7089', 'pg-prp-sameside-v:7330'].every(k => row.linkedGateIds.indexOf(k) >= 0);
            const s2 = A.reportSections().find(s => s.cma === row.internalId);
            out.w.named = s2 && s2.blocks.find(b => /-modes-t$/.test(b.id)).rows.find(rw => /mt-staff$/.test(rw.q)).cells[4] === 'AI draft accepted by the engineer';
            // write it myself, on the page
            const vc2 = A.claimList().find(c => !c.real && c.gates.indexOf('pg-prp-sameside:7092') >= 0);
            const n1 = live().length;
            A.ui.judgeWrite(vc2.row.internalId, 'all'); await wait(400);
            const boxEl = [...document.querySelectorAll('[data-cmj-box]')].find(b => b.querySelector('[data-cmj-cat="mt-loc"]'));
            out.w.form = !!boxEl;
            out.w.unsaved = live().length === n1;
            if (boxEl) {
                const cat = boxEl.querySelector('[data-cmj-cat="mt-loc"]'); cat.querySelector('input[value="no"]').checked = true; cat.querySelector('[data-cmj-why]').value = 'The right pair is worked on from separate stands.';
                A.ui.judgeSave(vc2.row.internalId, 'all', boxEl.querySelector('[data-cmj="judgeSave"]')); await wait(400);
            }
            const row2 = live().find(c => (c.linkedGateIds || []).indexOf('pg-prp-sameside:7092') >= 0);
            out.w.saved = live().length === n1 + 1 && row2 && row2.flow.answers['mt-loc'] && row2.flow.answers['mt-loc'].a === 'no' && !row2.flow.answers['mt-loc'].src;
            // ---- [D] no duplicates -----------------------------------------------------------------------------------------------------
            const n2 = live().length;
            A.answer('cma/' + row.internalId + '/cat/op-proc', 'no', { why: 'One card per engine.' });
            A.answer('cma/' + row.internalId + '/cat/mt-proc', 'na', { why: 'x' });
            const vc3 = A.claimList().find(c => !c.real);
            const m1 = A.materialize(vc3.row), m2 = A.materialize(vc3.row), m3 = A.materialize(m1);
            out.d = { oneEach: live().length === n2 + 1 && m1 === m2 && m2 === m3 };
            const seen = {}; let dup = 0; live().forEach(c => (c.linkedGateIds || []).forEach(k => { if (seen[k]) dup++; seen[k] = 1; }));
            out.d.noGateTwice = dup === 0;
            out.d.claimsOnce = (() => { const keys = A.claimList().map(c => c.key); return new Set(keys).size === keys.length; })();
            // ---- [X] Word ----------------------------------------------------------------------------------------------------------------
            const m = Rf.model({ report: 'sys:sys-prp' });
            const texts = m.blocks.filter(b => b.text).map(b => b.text);
            out.x = { imgs: m.blocks.filter(b => b.k === 'img' && /^The fault tree ".+" around G-/.test(b.caption || '')).length, html: m.blocks.some(b => b.k === 'html' || /data-cmj/.test(JSON.stringify(b)) || (b.k === 'p' && !(typeof b.text === 'string' && b.text.trim()))),
                counts: texts.filter(t => /\b\d+ (of|out of) \d+\b|\b\d+ (gates|categories|concerns|claims|answers)\b/.test(t)).slice(0, 3), dashes: JSON.stringify(m).indexOf('\u2014') >= 0,
                toc: /data-cc-toc="1"/.test(html) && /List of figures/.test(html) };
            return out;
        }), 240000, 'the CMA report checks');

        console.log('\n[N] the shared cause number (was "if certain")');
        check('N1 no critical gate reports the meaningless 34.5 / flight time (11.5 per flight hour on the demo)', r.n.noFake && r.n.count > 20, r.n.count);
        check('N2 the shared cause test gives real rates (the gate at its least likely input); "every flight" only when it is, with no rate', r.n.everyIsNull && r.n.manyReal > 20, r.n.manyReal);
        check('N3 G-7098 under one shared cause = -ln(1 - P) / 3 h with P worked out from its least likely input (generator 1)', r.n.g7098 && r.n.g7098.p < 1e-3 && Math.abs(r.n.g7098.rate - r.n.g7098.want) / r.n.g7098.want < 1e-9 && r.n.g7098.rate > 1e-9 && r.n.g7098.rate < 1e-6 && /BE-7094/.test(r.n.g7098.from), JSON.stringify(r.n.g7098));
        check('N4 the test said in words: one shared cause, the gate at its least likely input, a rate in powers of ten', /one shared cause took out all of its inputs at once/.test(r.n.words) && /per flight hour/.test(r.n.words) && /10⁻/.test(r.n.wordsRate) && !/e[+-]\d/.test(r.n.words + r.n.wordsRate), r.n.words);
        check('N5 the Golden Thread stage shows the shared cause number, never 1.10e+1', /if one shared cause/.test(r.n.thread) && !/1\.1\d?e\+1/.test(r.n.thread), r.n.thread.slice(0, 300));
        console.log('\n[P] the panel');
        check('P1 the standalone critical gates panel is gone from the CMA page', !r.p.panel && !r.p.text);
        check('P2 SLCriticalGates keeps its API (analyzeAll, startReview, threadStage, INV-58, panelHtml)', r.p.api);
        console.log('\n[G] every critical gate in its report');
        check('G1 every critical gate has a section', r.g.gates > 20 && !r.g.miss.length, r.g.miss.join(', '));
        check('G2 in the right report: the system whose trees hold the claim, else the aircraft level', !r.g.wrongRep.length, r.g.wrongRep.join('; '));
        check('G3 under its failure condition by ID and name, the severity in words', !r.g.noFc.length, r.g.noFc.join(', '));
        check('G4 each gate has its own heading', !r.g.noHead.length, r.g.noHead.join(', '));
        check('G5 gates claiming exactly the same items share one claim (G-7068 and its verification copy G-7309)', r.g.sameClaim);
        check('G6 a subset gets its own claim (all four engines, the left pair, the right pair)', r.g.subsetOwn);
        check('G7 the budget tests in words, no shorthand ("as OR: exceeds")', r.g.testsInWords && r.g.everyFlightWords);
        console.log('\n[F] the fault tree pictures');
        check('F1 each gate shows its whole fault tree as the tool draws it (the canvas symbols, IDs, P line and DAL badges), the gate outlined, each input marked, every box with what it is and how it is accepted; at most 40 nodes and 6 columns a picture', !r.f.bad.length, r.f.bad.slice(0, 6).join('; '));
        check('F1b a tree within the limit is one picture (G-7068); a wider one comes in parts, each cut naming the part it continues in (G-7086)', r.f.whole && r.f.split);
        check('F2 the figures are numbered and captioned', r.f.numbered);
        check('F3 they are in the list of figures', r.f.lof);
        check('F4 on the page, and a box opens the node panel', r.f.domFig && r.f.panel);
        console.log('\n[A] every common mode category');
        check('A1 every category in every claim: answered from the data, or in the engineer\'s box', !r.a.bad.length, r.a.bad.join('; '));
        check('A2 every answer from the data names its source', r.a.anyAuto > 30 && !r.a.srcBad.length, r.a.srcBad.slice(0, 4).join(' | '));
        check('A3 same inputs, same answers', r.a.same);
        check('A4 the data\'s answers make sense on the demo: engines one design (Concern), rotor burst reaches them (Concern), no software (Does not apply); elevator lanes from different suppliers (No), neighboring zones (Concern)', r.a.engines.mfr === 'concern' && r.a.engines.part === 'concern' && r.a.engines.sw === 'na' && r.a.elev.mfr === 'no' && r.a.elev.bay === 'concern', JSON.stringify([r.a.engines, r.a.elev]));
        console.log('\n[W] the engineer\'s part');
        check('W1 the "Write it myself" / "Draft with AI" box is on the page', r.w.boxBefore);
        check('W2 an AI draft writes nothing: no CMA row, no answer, not in the table; it is shown to accept', r.w.draft && r.w.nothingWritten && r.w.notInTable && r.w.draftShown);
        check('W3 accepting makes the one CMA record with every gate of the claim, the draft\'s answers marked as AI accepted', r.w.accepted && r.w.gatesIn && r.w.named);
        check('W4 the record carries the data\'s answers (marked with their source) and its concerns', r.w.autoIn);
        check('W5 "Write it myself": nothing written until Save; saved answers are the engineer\'s', r.w.form && r.w.unsaved && r.w.saved);
        console.log('\n[D] no duplicates');
        check('D1 one record per claim, however many times it is answered or made', r.d.oneEach);
        check('D2 every gate in one record only; every claim once', r.d.noGateTwice && r.d.claimsOnce);
        console.log('\n[X] Word');
        check('X1 the tree pictures go to Word, the preview-only boxes do not', r.x.imgs >= 2 && !r.x.html, r.x.imgs);
        check('X2 contents and list of figures; no counts; no em dashes', r.x.toc && !r.x.counts.length && !r.x.dashes, r.x.counts.join(' | '));

        // ---- [M] full width in every report ------------------------------------------------------------------------------------
        const widths = await within(pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const meas = root => { if (!root) return null; const ps = [...root.querySelectorAll('p')].filter(p => p.offsetParent && p.textContent.length > 100); const ts = [...root.querySelectorAll('table')].filter(t => t.offsetParent); if (!ps.length || !ts.length) return null; return { p: Math.max(...ps.map(p => p.getBoundingClientRect().width)), t: Math.max(...ts.map(t => t.getBoundingClientRect().width)) }; };
            const out = {};
            for (const k of ['pra', 'zsa', 'cma']) { switchTab(k); await wait(4000); out[k] = meas(document.querySelector('#ccr-host-' + k + ' .ccr-prev')); }
            switchTab('plan-auto'); await wait(1500);
            for (const k of SLPlanAuto.PLANS.map(p => p.key)) { SLPlanAuto.ui.open(k); await wait(1500); out['plan ' + k] = meas(document.querySelector('#view-plan-auto .pla-prev')); }
            return out;
        }), 90000, 'widths');
        console.log('\n[M] full width');
        const keys = Object.keys(widths);
        check('M1 in the PRA, ZSA and CMA reports and every Plan Autopilot document a paragraph is as wide as the table under it', keys.length >= 6 && keys.every(k => widths[k] && Math.abs(widths[k].p - widths[k].t) <= 2 && widths[k].p > 700), JSON.stringify(widths));

        // ---- [K] dark mode -----------------------------------------------------------------------------------------------------
        const dark = await within(pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            document.body.classList.add('theme-dark'); switchTab('cma'); await wait(1500);
            const Rf = SLCcaReport.get('cma'); Rf.setTab('sys:sys-prp'); await wait(2000);
            const rgb = s => { const m = /(\d+), (\d+), (\d+)/.exec(s); return m ? '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('') : null; };
            const bgOf = el => { while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return rgb(c); el = el.parentElement; } return '#ffffff'; };
            const p = [...document.querySelectorAll('#ccr-host-cma .ccr-prev p')].find(x => x.offsetParent);
            const svg = document.querySelector('#ccr-host-cma svg[data-cmt-gate]');
            const paper = svg ? svg.querySelector('rect').getAttribute('fill') : null;
            // each label against what is behind it: the nearest filled box drawn before it in its own group, else the page
            const behind = t => { let e = t.previousElementSibling; while (e) { if (e.tagName === 'rect' && e.getAttribute('fill') && e.getAttribute('fill') !== 'none') return e.getAttribute('fill'); e = e.previousElementSibling; } return paper; };
            const fills = svg ? [...new Set([...svg.querySelectorAll('text')].map(t => t.getAttribute('fill') + '|' + behind(t)))] : [];
            const rects = [];
            const out = { p: p && [rgb(getComputedStyle(p).color), bgOf(p)], paper, fills, rects };
            document.body.classList.remove('theme-dark'); return out;
        }), 60000, 'dark');
        console.log('\n[K] dark mode');
        const okP = dark.p && dark.p[0] && contrast(dark.p[0], dark.p[1]) >= 4.5;
        const okSvg = dark.paper && lum(dark.paper) < 0.1 && dark.fills.length && dark.fills.every(f => { const [a, b] = f.split('|'); return contrast(a, b) >= 4.5; });
        check('K1 the dark report text reads at 4.5 or better', okP, JSON.stringify(dark.p));
        check('K2 the dark tree pictures: every label against its box and the page at 4.5 or better', okSvg, JSON.stringify(dark));

        console.log('\n[E] page errors');
        check('E1 no page errors', !errs.length, errs.join(' | '));
    } catch (e) { check('the run finished', false, e && e.stack); }
    finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
