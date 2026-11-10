/* regression_pasa_autopilot_20261110.test.js: the PASA Autopilot v2.0. One Preliminary Aircraft Safety Assessment for the
 * aircraft: the front of the report and one appendix per aircraft function, holding every failure condition of that function
 * rated Minor or above.
 *
 * v2.0 (Waqas, 10 Nov 2026, after v1): "instead of each failure condition getting an appendix we should go with each function
 * getting an appendix too", "each appendix containing all its applicable failure conditions" (no picking); "I need every failure
 * condition major and above we have the charting AFHA can determine where we need qualitative vs quantitative assessments, even
 * minor ones need qualitative assessment"; "requirements can be driven at multiple levels, why are we only allowing them to
 * select one"; "at the aircraft level the options should only be aircraft, and/or systems" (a systems tick flows the
 * requirement into each feeding system's register, traced to its parent); "the performance is very slow" (the front is drawn on
 * its own, each appendix when opened).
 *
 * Waqas, 10 Nov 2026 (the brief, the mockups and the rulings after them): "Drop downs to select failure conditions for the PASA
 * one report for the aircraft with each failure condition feeding in as an appendix (aircraft level cover page then meat in
 * the appendices)"; "we need to ask them questions to fill out the front of the reports too"; "appendices for Major and above,
 * and the worst case scenario for each condition for which the fault tree was generated"; each appendix in order: what is
 * being evaluated, the AFHA entry, interdependence, common resources, CoFFE only if chosen, the fault tree as the tool draws
 * it (the integrated tree, chrome stripped), what the tree says, the numbers, the AutoReq requirements (the mitigations: no
 * mitigations box), the path to compliance generated from them, the conclusion. "PASA interdependence cant be pre-fed if we
 * are not using AI, the user will have to use an interdependence table"; "existing work should auto populate, new work should
 * be hand checked or AI drafted with architectural inputs"; "shared resources will be treated the same way". Requirement level
 * asked once per requirement type (aircraft, system or item), override per failure condition. Do not ask about architecture,
 * protections or budget splits. Every requirement shows its rationale in plain words and where it is driven from; tool-note
 * rationales rewritten; imported rows with none say "Rationale missing". The old PASA page and its tab row go; the MAC model,
 * MF&MS and CEA sit beside the fault trees. The "if certain" number (11 per flight hour) fixed: Waqas agreed the second test
 * becomes "one shared cause takes out all the gate's inputs at once", judged against the stricter of the class objective and
 * the budget handed down.
 *
 * On the Aeolus HL-1 demo, in the real app, with the production CSP:
 *   [S]  pins and headers (pasa_autopilot 2.0 after cma_claims; cca_report 2.1; critical_gates 1.5; req_trace 1.1 after
 *        req_basis; fc_auto_trees 1.9; cma_claims 1.2); the old PASA tab row is gone from the page; no em dashes in the new
 *        files; no tool-note phrase left in AutoReq's rationales
 *   [F]  the front: its questions (scope, the aircraft, the method, CoFFE, the levels of each of the eight requirement types,
 *        aircraft and/or systems); no failure condition picking; nothing about architecture, protections or budget splits; the
 *        appendices are the functions with a governing row rated Minor or above; the register says where each one is assessed
 *        and how (quantitatively or qualitatively), No Safety Effect in the register only
 *   [Q]  a Minor failure condition is assessed qualitatively: no tree, no numbers
 *   [L]  levels: several per type (aircraft and systems), one function may override them, and never none
 *   [V]  speed: the front is drawn without the appendices (a list of them instead), fast; an appendix fast too
 *   [O]  section order in an appendix, interdependence and common resources before the tree; CoFFE only when chosen; no
 *        mitigations part
 *   [I]  interdependence: existing work filled in and named (Propulsion from the architecture), the rest answered by hand;
 *        Fuel feeds FC-05 with nothing traced: a finding and a question; tracing it writes the SFHA trace once (no duplicate);
 *        the tree carrying a system the table does not show is flagged
 *   [T]  the real tree picture: the tool's own gate and event shapes, IDs and numbers, the integrated tree (system branches
 *        drawn in), no editing chrome, numbered captions
 *   [N]  numbers from SLTopBasis: the top event per flight hour; the gates the budget rests on with both tests, the shared-cause
 *        number a real rate (never "11", never 34.5 / flight time)
 *   [R]  requirements: each with its rationale and where it is driven from; the path to compliance one row per requirement, in
 *        the same order; no promise listed twice; putting them in the register gives each a requirement ID; ticked systems,
 *        each is flowed down to every system that feeds the failure condition, in that system's register, traced to its parent
 *   [W]  Word: the front, then the appendices in order, the tree pictures, no preview-only boxes
 *   [K]  dark mode: the questions and the report readable (contrast at least 4.5)
 *   [M]  the AI drafts the conclusion only once the questions are answered
 *   no page errors
 * MUTATION PROOFS: SL_PASA_MUTATE=redraw | coffe | mitig | pathhand | archq | nolevel | numbers | order | shared | dupreq |
 * word | dark | duptrace | toolnote | norat | oldnav | onefn | major | noqual | onelevel | noflow | noparent | slow. Each one turns
 * this red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_pasa_autopilot_20261110.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 900) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_PASA_MUTATE || '';
const MUTS = {
    redraw:   ['pasa_autopilot.js', "var res = safe(function () { return K.figure(full.id + ':' + full.root.id,", "var res = { parts: [{ svg: '<svg width=\"200\" height=\"80\"><rect width=\"200\" height=\"80\"/></svg>', w: 200, h: 80, letter: 'A' }] }; void safe(function () { return K.figure(full.id + ':' + full.root.id,"],
    coffe:    ['pasa_autopilot.js', "        if (coffeOn()) {\n            b.push(H(3, 'Combined functional failure effects (CoFFE)'));", "        if (true) {\n            b.push(H(3, 'Combined functional failure effects (CoFFE)'));"],
    mitig:    ['pasa_autopilot.js', "        b.push(H(3, 'Path to compliance'));", "        b.push(H(3, 'Proposed mitigations')); b.push(P('Not written yet.'));\n        b.push(H(3, 'Path to compliance'));"],
    pathhand: ['pasa_autopilot.js', "function pathRows(gr, rq) { return reqEntries(rq).map(", "function pathRows(gr, rq) { return reqEntries(rq).slice(0, 1).map("],
    archq:    ['pasa_autopilot.js', "        var co = coffeOn();\n", "        h += card('pasa.prot', Q({ id: 'pasa.prot', text: 'Which protections does the architecture have, and how is the budget split?', options: [{ id: 'a', label: 'Redundant channels' }] }), false);\n        var co = coffeOn();\n"],
    nolevel:  ['pasa_autopilot.js', "            h += card('pasa.lvl', lv + '</tbody></table>',", "            void card('pasa.lvl', lv + '</tbody></table>',"],
    numbers:  ['pasa_autopilot.js', "{ Quantity: 'Top event', Value: tf.rate != null ? sci(tf.rate) + ' per flight hour'", "{ Quantity: 'Top event', Value: tf.rate != null ? sci(tf.pTop) + ' per flight hour'"],
    order:    ['pasa_autopilot.js', "        b.push(H(3, 'How the systems feed ' + f));", "        b.push(H(3, 'The fault tree')); b.push(H(3, 'How the systems feed ' + f));"],
    shared:   ['critical_gates.js', "if (pk != null && (best == null || pk < best.p)) best = { p: pk, k: k };", "if (pk != null) best = { p: 1, k: k };"],
    dupreq:   ['pasa_autopilot.js', "return !trees.length || trees.some(function (e) { return e.tab.split(':')[1] === pid; }); })", "return true; })"],
    word:     ['cca_report.js', "            rs.forEach(function (x, i) { b.push(H(1, x.title, { appx: appxLetter(i),", "            (fx ? [] : rs).forEach(function (x, i) { b.push(H(1, x.title, { appx: appxLetter(i),"],
    dark:     ['pasa_autopilot.js', ".paq-x{font-size:13px;line-height:1.45;margin:0 0 8px;color:var(--color-text-primary,#101216)}", ".paq-x{font-size:13px;line-height:1.45;margin:0 0 8px;color:#3a3d44}"],
    duptrace: ['pasa_autopilot.js', "var l = traceList(r.acTrace); if (l.indexOf(gr.fcId) < 0 && !l.some(", "var l = traceList(r.acTrace); if (true || !l.some("],
    toolnote: ['assurance_modules.js', "rat: `The fault tree for ${page.name} gives this event this share of the failure condition's budget;", "rat: `Allocated from the fault tree on page ${page.name}. The fault tree gives this event this share of the failure condition's budget;"],
    norat:    ['req_basis.js', "if (_blank(r.rat) && cells.length > 5) cells[5].insertAdjacentHTML('afterbegin', '<span class=\"rt-miss\" data-rt-miss=\"rationale\" title=\"Every requirement needs a rationale\">Rationale missing</span>');", "if (false) void 0;"],
    onefn:    ['pasa_autopilot.js', "return fnGroups(f.id).length > 0; }).map(function (f) { return f.id; }); }", "return fnGroups(f.id).length > 0; }).map(function (f) { return f.id; }).slice(0, 1); }"],
    major:    ['pasa_autopilot.js', "function applicable(gr) { return !!(gr && gr.fcId && rank(gr.gov.severity) >= SEV_RANK.Minor); }", "function applicable(gr) { return !!(gr && gr.fcId && rank(gr.gov.severity) >= SEV_RANK.Major); }"],
    noqual:   ['pasa_autopilot.js', "        if (rank(gr.gov.severity) < SEV_RANK.Major) return 'qual';\n", ""],
    onelevel: ['req_trace.js', "var next = cur.indexOf(level) >= 0 ? cur.filter(function (x) { return x !== level; }) : cur.concat([level]);", "var next = cur.indexOf(level) >= 0 ? cur.filter(function (x) { return x !== level; }) : [level];"],
    noflow:   ['pasa_autopilot.js', "flows: lv.indexOf('system') >= 0 ? flowsFor(gr, x.cand) : [] };", "flows: [] };"],
    noparent: ['pasa_autopilot.js', "                c.parentReqId = parent ? S(parent.internalId) : '';", "                c.parentReqId = '';"],
    slow:     ['cca_report.js', "var blR = spec.appendices ? repDoc({ dark: dark, secs: secs, frontOnly: true })", "var blR = spec.appendices ? repDoc({ dark: dark, secs: secs, frontOnly: false })"],
    oldnav:   ['index.html', '            <div class="header-with-export">\n                <h3>PASA: Preliminary Aircraft Safety Assessment</h3>\n            </div>\n        </div>', '            <div class="header-with-export">\n                <h3>PASA: Preliminary Aircraft Safety Assessment</h3>\n            </div>\n            <div class="sys-workspace-nav" id="pasa-subnav"><button id="pasa-tab-cockpit">Cockpit</button><button id="pasa-tab-interdep">Interdependence &amp; Common Resources</button></div>\n        </div>']
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) { let s = fs.readFileSync(path.join(SITE, name), 'utf8'); const m = MUTS[MUT]; if (m && m[0] === name) { if (s.indexOf(m[1]) < 0) throw new Error('mutation site missing: ' + m[1]); s = s.replace(m[1], m[2]); } return s; }
const EM = String.fromCharCode(0x2014);
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
const lum = rgb => { const c = rgb.map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

(async function main() {
    console.log('\n[S] pins, headers, the old PASA page gone, no em dashes, no tool notes');
    const HTML = src('index.html'), at = f => HTML.indexOf('src="' + f + '?v=');
    check('S1 pasa_autopilot.js 2.2 (after cma_claims.js 1.2 and assurance_modules.js), cca_report.js 2.1, critical_gates.js 1.5, req_trace.js 1.1 after req_basis.js 1.3, fc_auto_trees.js 2.1 pinned; headers the same',
        /pasa_autopilot\.js\?v=2\.2"/.test(HTML) && /cca_report\.js\?v=2\.1"/.test(HTML) && /critical_gates\.js\?v=1\.5"/.test(HTML) && /req_trace\.js\?v=1\.1"/.test(HTML) && /req_basis\.js\?v=1\.3"/.test(HTML) && /fc_auto_trees\.js\?v=2\.1"/.test(HTML) && /cma_claims\.js\?v=1\.2"/.test(HTML)
        && at('pasa_autopilot.js') > at('cma_claims.js') && at('pasa_autopilot.js') > at('assurance_modules.js') && at('req_trace.js') > at('req_basis.js')
        && /SLPasaAuto v2\.2/.test(src('pasa_autopilot.js').slice(0, 200)) && /SLCcaReport v2\.1/.test(src('cca_report.js').slice(0, 200)) && /v1\.5/.test(src('critical_gates.js').slice(0, 300)) && /SLReqTrace v1\.1/.test(src('req_trace.js').slice(0, 300)));
    check('S2 the old PASA page is gone: no cockpit, no PASA tab row (Interdependence, MAC Model, MF&MS, CoFFE, Aircraft Requirements, CEA); MF&MS has its own page', HTML.indexOf('id="pasa-subnav"') < 0 && HTML.indexOf('id="ckpt-page-pasa"') < 0 && HTML.indexOf('id="pasa-tab-cockpit"') < 0 && HTML.indexOf('id="view-mfms"') > 0);
    check('S3 no em dashes in the files this change wrote', ['pasa_autopilot.js', 'pssa_autopilot.js', 'ssa_autopilot.js', 'asa_autopilot.js', 'req_trace.js', 'cca_report.js', 'critical_gates.js'].every(f => src(f).indexOf(EM) < 0) && fs.readFileSync(__filename, 'utf8').indexOf(EM) < 0);
    const NOTES = ['Allocated from the fault tree on page', 'fha-prob preview only', 'CCMR pair-trace', '(INV-35)', '(INV-36)', 'INV-46', 'Allocator flag', 'event-allocation normalization', 'cert-basis form', 'Component library ref:', 'page top hazard', 'CCMR CONFLICT', 'Interval↔rate equivalence receipt', 'ONE provider requirement', 'Derived by AND-family gate', 'Derived by OR-family gate', 'reproduced verbatim'];
    // the rationale text AutoReq writes (rat: and the ...Rat pieces it is built from), not the code comments
    const AM = src('assurance_modules.js').split('\n').filter(l => !/^\s*\/\//.test(l) && /(\brat\s*:|Rat\s*\+?=|^\s*\?\s*`|^\s*:\s*`|^\s*\(gov\.accepted)/.test(l)).join('\n');
    check('S4 no AutoReq rationale reads like a tool note (page names, source keys, invariant numbers, "preview only")', AM.length > 2000 && NOTES.every(n => AM.indexOf(n) < 0), NOTES.filter(n => AM.indexOf(n) >= 0).join(' | '));

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
        await pg.addInitScript(() => { window.SL_VERIFY_SYNC_OFF = true; });
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(() => window.loadHL1Demo()); await tick(9000);
        await pg.evaluate(() => switchTab('pasa')); await tick(1500);

        const r = await within(pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const A = window.SLPasaAuto, U = A.ui, R = SLCcaReport.get('pasa'), RT = SLReqTrace, out = {};
            const host = () => document.getElementById('ccr-host-pasa');
            out.mounted = !!host() && !!host().querySelector('[data-cctabs] select');
            // ---- [V] the front is drawn on its own, fast ------------------------------------------------------------------
            let t0 = performance.now(); R.render(); out.msFront = performance.now() - t0;
            out.frontText = host().querySelector('[data-ccdoc]').innerText;
            out.appxList = !!host().querySelector('[data-ccdoc]') && /Appendices/.test(out.frontText);
            // ---- [F] the front --------------------------------------------------------------------------------------------
            const qTitles = () => Array.from(host().querySelectorAll('[data-ccleft] .slap-q')).map(e => e.textContent.trim());
            out.frontQs = qTitles();
            out.levelRows = host().querySelectorAll('[data-paq="pasa.lvl"] [data-paq-lvl]').length;
            out.levelLabels = Array.from(host().querySelectorAll('[data-paq="pasa.lvl"] [data-paq-lvl]')).map(b => b.textContent.replace('✓ ', '').trim()).filter((x, i, a) => a.indexOf(x) === i);
            out.addFc = host().querySelectorAll('[data-paq-addfc]').length;
            const groups = SLFcTrees.groups('ac'), rank = { 'No Safety Effect': 0, Minor: 1, Major: 2, Hazardous: 3, Catastrophic: 4 };
            out.cand = A.candidates().map(g => g.fcId);
            out.candRule = groups.every(g => (A.candidates().indexOf(g) >= 0) === (rank[g.gov.severity] >= 1));
            out.apps = A.appendices();
            out.appsRule = JSON.stringify(out.apps) === JSON.stringify(A.functions().map(f => f.id).filter(id => groups.some(g => rank[g.gov.severity] >= 1 && String(g.gov.subId) === id)));
            out.fnOf05 = A.groupOf('FC-05').gov.subId; out.fnOf26 = A.groupOf('FC-26').gov.subId;
            // the demo has no Minor aircraft failure condition: one with a single row is rated Minor for this run
            const one = groups.find(g => g.rows.length === 1 && g.gov.severity === 'Major' && g.fcId !== 'FC-05');
            if (one && !groups.some(g => g.gov.severity === 'Minor')) { one.gov.severity = 'Minor'; SLDataChange.bump(); }
            const minor = A.candidates().find(g => g.gov.severity === 'Minor'); out.minor = minor ? { fc: minor.fcId, fn: String(minor.gov.subId), route: A.routeOf(minor) } : null;
            const nse = groups.find(g => g.gov.severity === 'No Safety Effect'); out.nse = nse ? nse.fcId : null;
            U.pick('pasa.scope', 'all'); U.pick('pasa.desc', 'project'); U.pick('pasa.method', 'std'); U.pick('pasa.coffe', 'no');
            out.aiFrontBefore = R.spec.aiReady('aircraft');
            // ---- [L] levels: several per type, a function override, never none ------------------------------------------
            RT.TYPES.forEach(t => U.level(t.id, 'aircraft')); U.level('prob', 'system'); U.level('spf', 'system'); await wait(200);
            out.levelSet = RT.TYPES.every(t => RT.pasaLevels(t.id, null).levels.indexOf('aircraft') >= 0) && JSON.stringify(RT.pasaLevels('prob', null).levels) === '["aircraft","system"]';
            U.level('ind', 'system', out.fnOf05);
            out.override = JSON.stringify(RT.pasaLevels('ind', out.fnOf05).levels) === '["aircraft","system"]' && RT.pasaLevels('ind', out.fnOf05).from === 'function' && JSON.stringify(RT.pasaLevels('ind', 'none').levels) === '["aircraft"]';
            U.levelReset('ind', out.fnOf05); out.reset = RT.pasaLevels('ind', out.fnOf05).from === 'report';
            let refused = false; try { RT.toggleLevel('crew', 'aircraft', 'types'); } catch (e) { refused = /at least one level/i.test(e.message); } out.neverNone = refused && JSON.stringify(RT.pasaLevels('crew', null).levels) === '["aircraft"]';
            RT.setLevels('hid', ['item'], 'types'); out.noItemAtAircraft = RT.pasaLevels('hid', null).levels.indexOf('item') < 0; RT.setLevels('hid', ['aircraft'], 'types');
            const frontModel = R.doc({ report: 'aircraft' });
            out.register = (frontModel.find(b => b.k === 'table' && b.name === 'register') || {}).rows || [];
            // ---- [I] interdependence ---------------------------------------------------------------------------------------
            const fn = out.fnOf05;
            R.setTab('aircraft::fn:' + fn); await wait(600);
            t0 = performance.now(); R.render(); out.msFn = performance.now() - t0;
            const gr = A.groupOf('FC-05');
            out.fnFcs = A.fnGroups(fn).map(g => g.fcId);
            out.idpRowsBefore = A.idpRows(gr).map(x => ({ s: x.sysId, st: x.state }));
            out.leftQsFc = qTitles();
            out.untraced = A.untraced(gr).map(u => u.row.sysId);
            out.treeNotInTable = A.treeNotInTable(gr).map(t => t.sysId);
            out.fuelQ = !!host().querySelector('[data-paq="fc.FC-05.trace.sys-fue"]');
            out.fuelFinding = /Finding: Fuel System feeds FC-05, but none of its failure conditions is traced to it/.test(host().querySelector('[data-ccdoc]').innerText);
            U.idpNone('FC-05'); await wait(200);
            U.pick('fc.FC-05.trace.sys-fue', 'tr:FC-FUE01'); U.pick('fc.FC-05.trace.sys-fue', 'tr:FC-FUE01'); await wait(200);
            const fue = systemsData.find(s => s.id === 'sys-fue').fha.filter(f => f.fcId === 'FC-FUE01');
            out.traceOnce = fue.every(f => String(f.acTrace).split(',').map(x => x.trim()).filter(x => x === 'FC-05').length === 1);
            const answerAll = id => { const g = A.groupOf(id); U.idpNone(id); A.untraced(g).forEach(u => { const k = 'fc.' + id + '.trace.' + u.row.sysId; const ta = 'paq-ta-' + (k + '.why').replace(/[^A-Za-z0-9_-]/g, '_'); const t = document.createElement('textarea'); t.id = ta; t.value = 'Its own supply'; document.body.appendChild(t); U.text(k + '.why', ta); t.remove(); }); A.resources(g).forEach(rr => U.pick('fc.' + id + '.res.' + rr.key, 'zsa')); A.linkCands(g).forEach(c => { if (!c.answer) U.pick('fc.' + id + '.link.' + c.key, 'no'); }); };
            A.resources(gr).forEach(rr => U.pick('fc.FC-05.res.' + rr.key, 'new'));
            // v2.1 (11 Nov 2026): the traced system trees are linked in by the engineer; Propulsion is already in by its transfer
            out.linkQ = A.linkCands(gr).map(c => c.fcId + ':' + c.answer + ':' + c.via);
            A.linkCands(gr).forEach(c => { if (!c.answer) U.pick('fc.FC-05.link.' + c.key, 'no'); });
            out.fcLeft = A.fcLeft(gr); out.aiPart = R.spec.aiReady('fn:' + fn);
            A.fnGroups(fn).forEach(g => { if (g.fcId !== 'FC-05') answerAll(g.fcId); });
            out.ai = R.spec.aiReady('fn:' + fn);
            await wait(300);
            // ---- [O] order, [T] tree, [N] numbers, [R] requirements --------------------------------------------------------------
            const ctx = { C: SLCcaReport.palette(), dark: false, forExport: false, key: 'pasa' };
            const sec = A.section(gr, ctx), heads = sec.filter(b => b.k === 'h').map(b => ({ l: b.level, t: b.text }));
            out.heads = heads.filter(h => h.l === 3).map(h => h.t); out.h2 = heads.filter(h => h.l === 2).map(h => h.t);
            out.fnHeads = A.fnSection(fn, ctx).filter(b => b.k === 'h' && b.level === 2).map(b => b.text);
            const pv = host().querySelector('[data-ccdoc]');
            out.figSvgs = Array.from(pv.querySelectorAll('.ccr-fig svg')).map(s => s.outerHTML);
            out.figCaps = Array.from(pv.querySelectorAll('.ccr-fig + .ccr-cap')).map(e => e.textContent);
            const page = SLFcTrees.treeFor(gr);
            out.shapeOf = getShapePath({ data: page.root });
            out.intIds = (() => { const ids = []; const tmp = { id: 't', integrated: { sourcePageId: page.id } }; SLFtaIntegrated.build(tmp); (function w(n) { if (!n) return; if (n.displayId) ids.push(n.displayId); (n.children || []).forEach(w); })(tmp.root); return ids; })();
            const tf = A.treeFacts(gr), B = SLTopBasis;
            out.rateTB = B.perFlightHour(B.exactTop(page.root), page).rate; out.rateRep = tf.rate;
            const num = sec.find(b => b.k === 'table' && b.name === 'num-FC-05'); out.numRows = num ? num.rows : [];
            const cgT = sec.find(b => b.k === 'table' && b.name === 'cg-FC-05'); out.cgRows = cgT ? cgT.rows : [];
            const res = SLCriticalGates.analyzePage(page); out.cg = res.gates.map(g => ({ id: g.displayId, p: g.pShared, rate: g.rateShared, every: g.sharedEveryFlight, crit: g.critical, from: g.sharedFrom }));
            const rq = sec.find(b => b.k === 'table' && b.name === 'req-FC-05'), pth = sec.find(b => b.k === 'table' && b.name === 'path-FC-05');
            out.reqRows = rq ? rq.rows : []; out.pathRows = pth ? pth.rows : [];
            out.coffeHead = out.heads.some(h => /CoFFE/.test(h));
            U.pick('pasa.coffe', 'yes'); await wait(200);
            out.headsCoffe = A.section(gr, ctx).filter(b => b.k === 'h' && b.level === 3).map(b => b.text);
            U.pick('pasa.coffe', 'no'); await wait(200);
            // ---- [Q] a Minor failure condition: qualitative, no tree ---------------------------------------------------------------
            if (minor) { const qs = A.section(minor, ctx); out.minorHeads = qs.filter(b => b.k === 'h').map(b => b.text); out.minorFig = qs.some(b => b.k === 'fig'); }
            // put the requirements in the register: IDs, rationale, driven from; flowed down to each system that feeds it
            const before = acReqData.length, sysBefore = {}; systemsData.forEach(s => { sysBefore[s.id] = (s.req || []).length; });
            U.acceptReqs(fn); await wait(400);
            const added = acReqData.slice(before);
            out.added = added.map(x => ({ id: x.id, rat: x.rat, df: RT.drivenText(x), lvl: x.level }));
            out.idsUnique = new Set(acReqData.map(x => x.id).filter(Boolean)).size === acReqData.filter(x => x.id).length;
            const flows = []; systemsData.forEach(s => (s.req || []).slice(sysBefore[s.id]).forEach(x => flows.push({ sys: s.id, id: x.id, gen: x.reqSource && x.reqSource.generator, fc: x.reqSource && x.reqSource.context && x.reqSource.context.fcId, parent: x.parentReqId, type: RT.typeOf(x), df: RT.drivenText(x), lvl: x.level, text: x.text })));
            out.flows = flows; out.acIids = acReqData.map(x => String(x.internalId));
            out.feeders = A.idpRows(gr).filter(x => x.state === 'feeds').map(x => x.sysId);
            const nAc = acReqData.length, nSys = systemsData.reduce((n, s) => n + (s.req || []).length, 0);
            U.acceptReqs(fn); await wait(200); out.noDupAccept = acReqData.length === nAc && systemsData.reduce((n, s) => n + (s.req || []).length, 0) === nSys;
            out.reqRowsAfter = (A.section(gr, ctx).find(b => b.k === 'table' && b.name === 'req-FC-05') || {}).rows || [];
            // ---- [W] Word ---------------------------------------------------------------------------------------------------
            R.setTab('aircraft'); await wait(400);
            const m = R.model({ report: 'aircraft' });
            out.wordHeads = m.blocks.filter(b => b.k === 'h').map(b => b.text);
            out.wordImgs = m.blocks.filter(b => b.k === 'img').length;
            out.wordJson = JSON.stringify(m.blocks).slice(0, 400000);
            out.appTitles = A.appendices().map(id => { const f = A.functions().find(x => x.id === id); return id + (f && f.name ? ' ' + f.name : ''); });
            // ---- [M] the AI drafts only once answered ---------------------------------------------------------------------------
            out.aiFront = R.spec.aiReady('aircraft');
            acReqData.push({ internalId: 'imp-1', id: 'JAMA-77', text: 'The aircraft shall be imported.', rat: '', level: 'Imported', type: 'Safety', reqSource: { generator: 'reqif', foreignId: 'JAMA-77' } });
            switchTab('ac-req'); await wait(300); renderACReq(); await wait(500);
            out.missingShown = Array.from(document.querySelectorAll('#ac-req-body [data-rt-miss="rationale"]')).length > 0;
            out.drivenShown = Array.from(document.querySelectorAll('#ac-req-body [data-rt-df]')).some(e => /Driven from/.test(e.textContent));
            acReqData.pop(); switchTab('pasa'); await wait(800);
            switchTab('mac'); await wait(400); out.beside = !!document.querySelector('#view-mac > [data-pasa-beside]') && document.getElementById('view-mac').style.display !== 'none';
            switchTab('interdep'); await wait(400); out.interdepToPasa = document.getElementById('view-pasa').style.display !== 'none';
            return out;
        }), 180000, 'the PASA run');

        console.log('\n[F] the front');
        check('F1 the PASA page is the Autopilot: the frame is mounted with its Part dropdown', r.mounted);
        check('F2 the front asks scope, the aircraft, the method, CoFFE and the levels of each requirement type (8 types, each Aircraft and Systems), and no failure condition picking', ['What does this PASA cover?', 'Is this the aircraft the PASA assesses?', 'Which method and numbers does the PASA use?', 'Do a combined functional failure effects (CoFFE) analysis?', 'At what levels is each type of requirement written?'].every(q => r.frontQs.indexOf(q) >= 0) && r.frontQs.indexOf('Which failure conditions get an appendix?') < 0 && r.addFc === 0 && r.levelRows === 16 && JSON.stringify(r.levelLabels) === '["Aircraft","Systems"]', JSON.stringify(r.frontQs) + ' rows ' + r.levelRows + ' ' + JSON.stringify(r.levelLabels));
        check('F3 no question about architecture, protections or budget splits', !r.frontQs.concat(r.leftQsFc).some(q => /protection|budget split|split the budget|architecture/i.test(q)), JSON.stringify(r.frontQs.concat(r.leftQsFc)));
        check('F4 every governing row rated Minor or above is in, with or without a tree; the appendices are the functions holding them, in the AFHA order', r.candRule && r.cand.length > 10 && r.appsRule && r.apps.length > 3, JSON.stringify({ cand: r.cand.length, apps: r.apps }));
        check('F5 one function holds all its failure conditions: FC-05 sits in its function\'s appendix with the others of that function', r.fnFcs.indexOf('FC-05') >= 0 && r.fnFcs.length >= 2, JSON.stringify(r.fnFcs));
        check('F6 the register says the appendix and how for each one (quantitatively or qualitatively); No Safety Effect is in the register only', r.register.some(x => /^FC-05/.test(x['Failure condition']) && /^Appendix [A-Z]+, quantitatively/.test(x['Assessed in'])) && r.register.every(x => /^Appendix [A-Z]+, (quantitatively|qualitatively)|^No appendix: no safety effect$/.test(x['Assessed in'])) && (!r.nse || r.register.some(x => x['Failure condition'].indexOf(r.nse) === 0 && /^No appendix/.test(x['Assessed in']))) && r.register.every(x => x.Function !== undefined), JSON.stringify(r.register.slice(0, 4)));

        console.log('\n[Q] qualitative where the chart or the severity says so');
        check('Q1 a Minor failure condition is in its function\'s appendix, assessed qualitatively: no fault tree, no numbers, a qualitative assessment', r.minor && r.minor.route === 'qual' && r.apps.indexOf(r.minor.fn) >= 0 && r.minorHeads.some(h => /\(qualitative\)$/.test(h)) && r.minorHeads.indexOf('The qualitative assessment') >= 0 && r.minorHeads.indexOf('The fault tree') < 0 && r.minorHeads.indexOf('The numbers') < 0 && !r.minorFig, JSON.stringify(r.minor) + ' ' + JSON.stringify(r.minorHeads));

        console.log('\n[L] levels');
        check('L1 several levels per type: aircraft and systems together', r.levelSet);
        check('L2 a function overrides them, and goes back to the report\'s when reset', r.override && r.reset);
        check('L3 never none (the last tick cannot be taken off), and no item level at the aircraft', r.neverNone && r.noItemAtAircraft);

        console.log('\n[V] speed');
        check('V1 the front is drawn on its own: the appendices listed, not drawn; under 1.5 s on the demo', r.appxList && !/\bA\.1 The function\b/.test(r.frontText) && r.msFront < 1500, Math.round(r.msFront) + ' ms');
        check('V2 an appendix is drawn under 1.5 s', r.msFn < 1500, Math.round(r.msFn) + ' ms');

        console.log('\n[O] the order of an appendix');
        const H = r.heads;
        const ix = s => H.findIndex(h => h.indexOf(s) === 0);
        const order = ['What is being evaluated', 'The AFHA entry', 'How the systems feed', 'Resources the systems share', 'The fault tree', 'What the tree says', 'The numbers', 'Requirements', 'Path to compliance'];
        check('O1 each failure condition in order: evaluated, AFHA entry, interdependence, common resources, the tree, what it says, the numbers, requirements, path to compliance; the function first', order.every((s, i) => ix(s) >= 0 && (i === 0 || ix(s) > ix(order[i - 1]))) && H.filter(h => h === 'The fault tree').length === 1 && r.fnHeads[0] === 'The function' && r.h2[0] === 'FC-05 Total loss of thrust on all four engines (quantitative)', JSON.stringify(H) + JSON.stringify(r.h2));
        check('O2 interdependence and common resources come before the tree', ix('How the systems feed') < ix('The fault tree') && ix('Resources the systems share') < ix('The fault tree'));
        check('O3 CoFFE only when chosen: none when not, and when chosen it sits after common resources and before the tree', !r.coffeHead && (() => { const h = r.headsCoffe; const c = h.findIndex(x => /CoFFE/.test(x)); return c > h.findIndex(x => /^Resources the systems share/.test(x)) && c < h.findIndex(x => x === 'The fault tree'); })(), JSON.stringify(r.headsCoffe));
        check('O4 no mitigations part: the requirements are the mitigations', !r.heads.some(h => /mitigation/i.test(h)) && !r.wordHeads.some(h => /mitigation/i.test(h)));

        console.log('\n[I] interdependence and common resources');
        check('I1 existing work is filled in and named: Propulsion feeds FC-05 from the architecture; the other rows wait for an answer', r.idpRowsBefore.some(x => x.s === 'sys-prp' && x.st === 'feeds') && r.idpRowsBefore.some(x => x.st === 'open'), JSON.stringify(r.idpRowsBefore));
        check('I2 Fuel feeds FC-05 with nothing traced: a finding in the report and a question (trace one, or say why not)', r.untraced.indexOf('sys-fue') >= 0 && r.fuelQ && r.fuelFinding);
        check('I3 tracing writes the SFHA trace once, however many times it is answered (no duplicate)', r.traceOnce);
        check('I4 the tree carrying a system the table does not show is flagged (Electrical Power System through G-7151)', r.treeNotInTable.indexOf('sys-eps') >= 0);
        check('I5 FC-05 answered: nothing left for it, but the AI waits for the other failure conditions of the function; ready once they are answered too', r.fcLeft.length === 0 && r.aiPart.ready === false && r.aiPart.left.length > 0 && r.ai.ready, JSON.stringify(r.fcLeft) + JSON.stringify(r.ai.left.slice(0, 3)));

        check('I6 linking is asked, never done by the tool: Propulsion is in the FC-05 tree already (by its transfer), the traced Fuel System one waits for the engineer\'s answer', r.linkQ.some(x => /^FC-PRP\d+:yes:transfer$/.test(x)) && r.linkQ.some(x => /^FC-FUE01:null:null$/.test(x)), JSON.stringify(r.linkQ));

        console.log('\n[T] the real tree picture');
        const allSvg = r.figSvgs.join('');
        check('T1 the picture is the tool\'s own rendering: its gate shape, the IDs of the integrated tree (system branches drawn in), P and rate lines', r.figSvgs.length >= 1 && allSvg.indexOf(r.shapeOf.slice(0, 40)) >= 0 && r.intIds.filter(id => allSvg.indexOf('>' + id + '<') >= 0).length >= Math.min(r.intIds.length, 8) && /P \d\.\de-\d+/.test(allSvg) && allSvg.indexOf('λ') >= 0, 'ids ' + r.intIds.length + ' shape ' + r.shapeOf.slice(0, 30));
        check('T2 no editing chrome in the picture: no handles, no inputs or dropdowns, no grid', !/fta-conn-handle|foreignObject|<select|<input|grid/i.test(allSvg));
        check('T3 each picture has a numbered caption naming its failure condition', r.figCaps.length === r.figSvgs.length && r.figCaps.some(c => /^Figure [A-Z]+\.\d+: FC-05/.test(c)) && r.figCaps.every(c => /^Figure [A-Z]+\.\d+: FC-\d+/.test(c)), JSON.stringify(r.figCaps));

        console.log('\n[N] the numbers');
        const top = r.numRows.find(x => x.Quantity === 'Top event');
        const sup = v => { const e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e); return m.toFixed(1) + ' × 10' + String(e).split('').map(c => ({ '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' })[c]).join(''); };
        check('N1 the top event per flight hour is SLTopBasis\' own (exactTop, then perFlightHour on the tree)', top && Math.abs(r.rateRep - r.rateTB) / r.rateTB < 1e-9 && top.Value === sup(r.rateTB) + ' per flight hour', JSON.stringify(top) + ' ' + r.rateTB);
        const g86 = r.cg.find(g => g.id === 'G-7086');
        check('N2 the shared-cause test: the gate fails as often as its least likely input, a real rate (never "every flight" for G-7086, never 11.5 or 34.5 / flight time)', g86 && !g86.every && g86.rate > 1e-5 && g86.rate < 0.01 && Math.abs(g86.rate - 11.48) > 1 && /Engine 1/.test(g86.from), JSON.stringify(g86));
        check('N3 the gates table shows both tests in words, per flight hour', r.cgRows.length >= 3 && r.cgRows.every(x => /per flight hour|every flight/.test(x['If one shared cause took out all its inputs']) && /per flight hour|every flight/.test(x['If its inputs were not independent'])) && !r.cgRows.some(x => /\b11\b/.test(x['If one shared cause took out all its inputs'])), JSON.stringify(r.cgRows));

        console.log('\n[R] requirements and the path to compliance');
        const acRows = r.reqRows.filter(x => x['Written at'] === 'Aircraft'), sysRows = r.reqRows.filter(x => x['Written at'] === 'System');
        check('R1 every requirement shows its rationale in plain words and where it is driven from (FC-05 named)', r.reqRows.length >= 3 && r.reqRows.every(x => x.Rationale && x.Rationale !== 'Rationale missing' && /FC-05/.test(x['Driven from'])), JSON.stringify(r.reqRows.slice(0, 2)));
        check('R2 the path to compliance is generated from the requirements: one row per requirement, in the same order', r.pathRows.length === r.reqRows.length && r.pathRows.every((p, i) => p.Requirement.indexOf(r.reqRows[i].ID) === 0), JSON.stringify(r.pathRows.map(p => p.Requirement.slice(0, 20))));
        check('R3 no promise listed twice at the aircraft ("no single failure" once for FC-05)', acRows.filter(x => /^No single failure/.test(x.Requirement)).length === 1 && new Set(r.reqRows.map(x => x.Requirement)).size === r.reqRows.length, JSON.stringify(r.reqRows.map(x => x.Requirement.slice(0, 50))));
        check('R4 put in the register: each has a requirement ID (REQ-AC-), its rationale, where it is driven from and its level; IDs unique; accepting again adds nothing anywhere', r.added.length >= 3 && r.added.every(x => /^REQ-AC-\d{3}$/.test(x.id) && x.rat && /FC-05|FC-06|FC-30/.test(x.df) && x.lvl === 'L1') && r.idsUnique && r.noDupAccept, JSON.stringify(r.added.slice(0, 3)));
        check('R5 an imported requirement with no rationale says "Rationale missing"; rows show where they are driven from', r.missingShown && r.drivenShown);
        const f05 = r.flows.filter(x => x.fc === 'FC-05');
        check('R6 ticked systems: the probability and no single failure requirements are flowed down into each system that feeds FC-05, in its register, written at the system (L2), traced to the aircraft requirement (parentReqId) and driven from it', r.feeders.length >= 2 && r.feeders.every(s => f05.some(x => x.sys === s && x.type === 'prob') && f05.some(x => x.sys === s && x.type === 'spf')) && f05.every(x => x.gen === 'flow-down' && x.lvl === 'L2' && r.acIids.indexOf(String(x.parent)) >= 0 && /REQ-AC-\d{3}/.test(x.df) && /FC-05/.test(x.df)) && !f05.some(x => x.type === 'ind'), JSON.stringify(f05.slice(0, 3)) + ' feeders ' + JSON.stringify(r.feeders));
        check('R7 the appendix lists each flowed-down row under its aircraft requirement, with its system, and the probability one carries the system tree\'s budget', sysRows.length >= 2 && sysRows.every(x => /^↳ /.test(x.ID)) && r.reqRowsAfter.filter(x => x['Written at'] === 'System').every(x => /^↳ REQ-/.test(x.ID)) && f05.some(x => x.type === 'prob' && /shall not exceed \d\.\de-\d+ per flight hour/.test(x.text)), JSON.stringify(sysRows.slice(0, 2).map(x => x.ID)));

        console.log('\n[W] Word');
        const wh = r.wordHeads, wa = wh.findIndex(h => h.indexOf('Appendix A: ' + r.appTitles[0]) === 0), wl = wh.findIndex(h => h.indexOf(': ' + r.appTitles[r.appTitles.length - 1]) > 0 && /^Appendix /.test(h));
        check('W1 Word: the front (purpose, method, the failure conditions, what the appendices found, conclusion), then every appendix in order, each starting with the function', wh[0] === '1. Purpose and scope' && wh.some(h => /What the appendices found/.test(h)) && wh.some(h => /\d\. Conclusion$/.test(h)) && wa > 0 && wl > wa && wh[wa + 1] === 'A.1 The function' && wh.filter(h => /^Appendix [A-Z]+: /.test(h)).length === r.appTitles.length, JSON.stringify(wh.slice(0, 14)));
        check('W2 Word carries the tree pictures and no preview-only boxes (no answer cards, no buttons)', r.wordImgs >= 2 && r.wordJson.indexOf('Write it myself') < 0 && r.wordJson.indexOf('slap-opt') < 0);

        console.log('\n[M] the AI drafts the conclusion only once the questions are answered');
        check('M1 the front: not ready while appendix questions are open, the list says which', r.aiFrontBefore.ready === false && r.aiFront.left.every(x => /appendix/.test(x)), JSON.stringify(r.aiFrontBefore.left.slice(0, 3)) + ' / ' + JSON.stringify(r.aiFront.left.slice(0, 3)));

        console.log('\n[P] the pages beside the fault trees');
        check('P1 the MAC model is its own page with the bar that joins it to the fault trees, MF&MS, cascading effects and resources; the old interdependence page opens the PASA', r.beside && r.interdepToPasa);

        console.log('\n[K] dark mode');
        const k = await within(pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            document.body.classList.add('theme-dark'); SLCcaReport.get('pasa').setTab('aircraft::fn:' + SLPasaAuto.groupOf('FC-05').gov.subId); await wait(900);
            const h = document.getElementById('ccr-host-pasa'), rgb = s => (String(s).match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
            const bgOf = el => { while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return rgb(c); el = el.parentElement; } return [255, 255, 255]; };
            const pick = sel => Array.from(h.querySelectorAll(sel)).slice(0, 12).map(el => ({ fg: rgb(getComputedStyle(el).color), bg: bgOf(el) }));
            return { x: pick('[data-ccleft] .paq-x'), q: pick('[data-ccleft] .slap-q'), td: pick('[data-ccleft] .paq-t td'), p: pick('[data-ccdoc] p') };
        }), 30000, 'dark mode');
        const worst = a => a.reduce((m, x) => Math.min(m, contrast(x.fg, x.bg)), 99);
        check('K1 dark mode: the questions, the interdependence table and the report text readable (contrast at least 4.5)', [k.x, k.q, k.td, k.p].every(a => a.length && worst(a) >= 4.5), [k.x, k.q, k.td, k.p].map(worst).map(v => v.toFixed(2)).join(' '));
    } finally { await browser.close(); srv.close(); }
    check('Z no page errors', errs.length === 0, errs.join(' | '));
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
