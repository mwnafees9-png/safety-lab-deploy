/* regression_ssa_autopilot_20261110.test.js: the SSA Autopilot. One System Safety Assessment per system, in the system's SSA
 * tab: the front of the report and one appendix per function (the PSSA's), each holding every failure condition of that
 * function rated Minor or above.
 *
 * Waqas, 10 Nov 2026: "get it all done please, along with the ssa and asa"; "the SSAs stay locked till at least the first version
 * has been baselined for the respective PSSAs". Baselined (the proposal, used and stated): an issued revision with every output
 * accepted; once open the SSA stays open, and its numbers follow later PSSA revisions. The SSA holds the trees worked out again
 * with the real rates (the verification trees), the budget against the design, every requirement with its verification method,
 * evidence and status, and the path to compliance as the requirements being closed. The only questions: which evidence closes
 * each requirement, picked from what is already linked to it; a requirement already Passed is filled in.
 *
 * On the Aeolus HL-1 demo (the Electrical Power System), in the real app, with the production CSP:
 *   [S]  pins and headers (ssa_autopilot 1.0 after pssa_autopilot, asa_autopilot 1.0 after it), the SSA tab in the system
 *        pages, the left menu's SSA link opens it; no em dashes
 *   [K]  the lock: locked while the PSSA is not issued, and while its outputs are not all accepted (the page says which); open
 *        once baselined, Revision A recorded; stays open after the PSSA reopens or is revised
 *   [C]  the report: the PSSA's appendices; the budgets against the design from the budget ledger (the verification tree with
 *        the real rates against the PSSA tree's budget and the objective); each failure condition in order; a qualitative one
 *        with no tree; the verification tree drawn
 *   [Q]  the questions: only which evidence closes each requirement, offered from what is linked (its verification tree, the
 *        system FMEA); picking writes the register's evidence and Passed; "Not closed yet" reopens it; already Passed is filled in
 *   [O]  outputs accepted by role (roles only)
 *   [W]  Word: the front, then the appendix
 *   no page errors
 * MUTATION PROOFS: SL_SSA_MUTATE=nolock | relock | noaccept | budget | evidence | qual | onlyask. Each one turns this red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_ssa_autopilot_20261110.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 900) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_SSA_MUTATE || '';
const MUTS = {
    nolock:   ['ssa_autopilot.js', "        return { locked: true, pssa: b };\n    }", "        return { locked: false, pssa: b };\n    }"],
    relock:   ['ssa_autopilot.js', "        if (s0.opened[k]) return { locked: false, opened: s0.opened[k], pssa: null };\n", ""],
    noaccept: ['ssa_autopilot.js', "        out.ok = out.issued && acc.length > 0 && !out.open.length;", "        out.ok = out.issued;"],
    budget:   ['ssa_autopilot.js', "'With the real rates': v.row && v.row.achieved != null ? l.sci(v.row.achieved)", "'With the real rates': v.row && v.row.achieved != null ? l.sci(v.row.allocated)"],
    evidence: ['ssa_autopilot.js', "            r.verifEvidence = label; r.verifStatus = 'Passed';", "            r.verifStatus = 'Passed';"],
    qual:     ['ssa_autopilot.js', "    function isQuant(gr) { return P2() ? P2().isQuant(gr) : true; }", "    function isQuant(gr) { return true; }"],
    onlyask:  ['ssa_autopilot.js', "        var oth = reqMap(sy).other;\n        if (oth.length) { h += '<div class=\"paq-h\">Requirements not tied to one failure condition</div>';", "        h += card('ssa.scope', Q({ id: 'ssa.scope', text: 'What does this SSA cover?', options: [{ id: 'all', label: 'All of it' }] }), false);\n        var oth = reqMap(sy).other;\n        if (oth.length) { h += '<div class=\"paq-h\">Requirements not tied to one failure condition</div>';"]
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) { let s = fs.readFileSync(path.join(SITE, name), 'utf8'); const m = MUTS[MUT]; if (m && m[0] === name) { if (s.indexOf(m[1]) < 0) throw new Error('mutation site missing: ' + m[1]); s = s.replace(m[1], m[2]); } return s; }
const EM = String.fromCharCode(0x2014);
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);

(async function main() {
    console.log('\n[S] pins, headers, the SSA tab');
    const HTML = src('index.html'), at = f => HTML.indexOf('src="' + f + '?v=');
    check('S1 ssa_autopilot.js 1.1 after pssa_autopilot.js, asa_autopilot.js 1.1 after it; headers the same', /ssa_autopilot\.js\?v=1\.1"/.test(HTML) && /asa_autopilot\.js\?v=1\.1"/.test(HTML) && at('ssa_autopilot.js') > at('pssa_autopilot.js') && at('asa_autopilot.js') > at('ssa_autopilot.js') && /SLSsaAuto v1\.1/.test(src('ssa_autopilot.js').slice(0, 200)) && /SLAsaAuto v1\.1/.test(src('asa_autopilot.js').slice(0, 200)));
    check('S2 the system pages have an SSA view; switchWorkspaceTab knows it; the left menu\'s SSA link opens it', /<div id="ws-view-ssa" style="display: none;"><\/div>/.test(HTML) && /const tabs = \['func', 'fcim', 'fha', 'req', 'asm', 'fmea', 'pssa', 'ssa'\];/.test(src('helpers_modules.js')) && /'sl-nav-ssa-report':\s+\['SSA', function \(\) \{ _openWs\('ssa'\); \}/.test(src('nav_areas.js')) && /ssa: 'sl-nav-ssa-report'/.test(src('nav_areas.js')));
    check('S3 no em dashes in the SSA and ASA files or this test', ['ssa_autopilot.js', 'asa_autopilot.js'].every(f => src(f).indexOf(EM) < 0) && fs.readFileSync(__filename, 'utf8').indexOf(EM) < 0);

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
        await pg.evaluate(() => { openSystemWorkspace('sys-eps'); }); await tick(1000);

        const r = await within(pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const B = window.SLSsaAuto, P2 = window.SLPssaAuto, out = {};
            const view = () => document.getElementById('ws-view-ssa');
            // the left menu's SSA link opens the SSA tab
            const link = document.getElementById('sl-nav-ssa-report'); if (link) link.click(); await wait(1200);
            out.viaLink = view() && view().style.display !== 'none';
            if (!out.viaLink) { switchWorkspaceTab('ssa'); await wait(1200); }
            const sy = B.sysNow(), RP = SLCcaReport.get('pssa'), R = SLCcaReport.get('ssa');
            // ---- [K] the lock ---------------------------------------------------------------------------------------------
            const lockText = () => { const c = document.getElementById('ssa-lock-page'); return c && c.style.display !== 'none' ? c.innerText : ''; };
            const hostShown = () => { const h = document.getElementById('ccr-host-ssa'); return !!h && h.style.display !== 'none'; };
            out.k1 = { locked: B.lockOf(sy).locked, text: lockText(), host: hostShown() };
            RP.withRep('sys:sys-eps', () => RP.issue('First issue'));
            switchWorkspaceTab('pssa'); await wait(200); switchWorkspaceTab('ssa'); await wait(800);
            out.k2 = { locked: B.lockOf(sy).locked, text: lockText(), host: hostShown() };
            RP.withRep('sys:sys-eps', () => RP.acceptance().forEach(o => RP.accept(o.id)));
            switchWorkspaceTab('pssa'); await wait(200); switchWorkspaceTab('ssa'); await wait(1200);
            out.k3 = { locked: B.lockOf(sy).locked, opened: B.store().opened['sys-eps'], text: lockText(), host: hostShown() };
            // the PSSA reopens (an output unaccepted) and is revised: the SSA stays open, and follows the latest revision
            RP.withRep('sys:sys-eps', () => { RP.unaccept('concl'); });
            out.k4 = { locked: B.lockOf(sy).locked, pssaOk: B.baseline('pssa', 'sys:sys-eps').ok };
            // ---- [C] the report -------------------------------------------------------------------------------------------
            R.setTab('sys:sys-eps'); await wait(500); R.render(); await wait(300);
            out.frontQs = Array.from(document.querySelectorAll('#ccr-host-ssa [data-ccleft] .slap-q')).map(e => e.textContent.trim());
            const ctx = { C: SLCcaReport.palette(), dark: false, forExport: false, key: 'ssa' };
            const front = R.doc({ report: 'sys:sys-eps' });
            const bud = front.find(b => b.k === 'table' && b.name === 'budgets'); out.budRows = bud ? bud.rows : [];
            const gr = P2.groupOf(sy, 'FC-EPS01'), led = budgetLedgerRows().filter(x => x.systemId === 'sys-eps' && x.fcId === 'FC-EPS01');
            out.led = led.map(x => ({ a: x.allocated, h: x.achieved, o: x.objective, p: x.allocPage && x.allocPage.id }));
            out.treeId = SLFcTrees.treeFor(gr).id;
            out.sciAch = led.length ? SLPasaAuto.lib.sci(led.find(x => x.allocPage.id === out.treeId).achieved) : null;
            out.sciAll = led.length ? SLPasaAuto.lib.sci(led.find(x => x.allocPage.id === out.treeId).allocated) : null;
            out.apps = R.tabs().length ? P2.appendices(sy) : [];
            out.secIds = R.reports()[0].sections;
            const sec = B.fnSection(sy, 'SF-20', ctx);
            out.heads = sec.filter(b => b.k === 'h').map(b => ({ l: b.level, t: b.text }));
            R.setTab('sys:sys-eps::fn:SF-20'); await wait(800);
            const pv = document.querySelector('#ccr-host-ssa [data-ccdoc]');
            out.caps = pv ? Array.from(pv.querySelectorAll('.ccr-fig + .ccr-cap')).map(e => e.textContent) : [];
            // ---- [Q] the questions ----------------------------------------------------------------------------------------
            const left = document.querySelector('#ccr-host-ssa [data-ccleft]');
            out.qs = left ? Array.from(left.querySelectorAll('.slap-q')).map(e => e.textContent.trim()) : [];
            const rq = B.reqsOf(sy, gr);
            out.rq = rq.map(x => ({ iid: x.internalId, st: x.verifStatus }));
            // accept the PSSA's requirements so there is something open to close
            P2.ui.acceptReqs('SF-20'); await wait(300);
            const rq2 = B.reqsOf(sy, gr), open = rq2.find(x => x.verifStatus !== 'Passed');
            out.nOpen = rq2.filter(x => x.verifStatus !== 'Passed').length;
            out.ev = open ? B.evidenceFor(sy, open).map(e => e.id + '|' + e.label) : [];
            const ver = open ? B.evidenceFor(sy, open).find(e => /^ver:/.test(e.id)) : null;
            if (open && ver) { B.ui.pick('req.' + open.internalId, ver.id); await wait(200); }
            out.after = open ? { st: open.verifStatus, ev: open.verifEvidence, rec: B.store().close['sys-eps|' + open.internalId] } : null;
            const path1 = (B.fnSection(sy, 'SF-20', ctx).find(b => b.k === 'table' && b.name === 'path-FC-EPS01') || {}).rows || [];
            out.pathClosed = open ? (path1.find(x => x.Requirement.indexOf(open.id || ('REQ-' + open.internalId)) === 0) || {}).Closed : null;
            if (open) { B.ui.pick('req.' + open.internalId, 'open'); await wait(200); out.reopened = open.verifStatus; }
            const hand = rq.find(x => x.verifStatus === 'Passed');
            out.handQ = hand ? (document.querySelector('[data-paq="req.' + hand.internalId + '"]') || { innerText: '' }).innerText : '';
            out.leftAfter = B.fnLeft(sy, 'SF-20');
            out.aiFront = R.spec.aiReady('sys:sys-eps');
            out.outputs = B.outputs('sys:sys-eps').map(o => o.role); out.ROLES = SLCcaReport.get('ssa').ROLES;
            // ---- [W] Word -------------------------------------------------------------------------------------------------
            const m = R.model({ report: 'sys:sys-eps' }); out.wordHeads = m.blocks.filter(b => b.k === 'h').map(b => b.text);
            return out;
        }), 180000, 'the SSA run');

        console.log('\n[K] the lock');
        check('K1 the left menu\'s SSA link opens the system\'s SSA tab', r.viaLink);
        check('K2 locked while the PSSA is not issued: the page says so and the report is hidden', r.k1.locked && /opens once its PSSA is baselined/.test(r.k1.text) && /has not been issued yet/.test(r.k1.text) && !r.k1.host, JSON.stringify(r.k1));
        check('K3 issued but its outputs not all accepted: still locked, and the page names the outputs', r.k2.locked && /not accepted yet: each fault tree within the budget/.test(r.k2.text) && !/has not been issued/.test(r.k2.text) && !r.k2.host, JSON.stringify(r.k2));
        check('K4 baselined (Revision A, every output accepted): open, the revision recorded, the report shown', !r.k3.locked && r.k3.opened && r.k3.opened.rev === 'A' && !r.k3.text && r.k3.host, JSON.stringify(r.k3));
        check('K5 once open it stays open, even when the PSSA is reopened', !r.k4.locked && r.k4.pssaOk === false, JSON.stringify(r.k4));

        console.log('\n[C] the report');
        const row = r.budRows.find(x => /^FC-EPS01/.test(x['Failure condition']));
        check('C1 the budgets against the design come from the budget ledger: the verification tree with the real rates, against the PSSA tree\'s budget and the objective', row && row['With the real rates'] === r.sciAch + ' per flight hour' && row.Budget === r.sciAll + ' per flight hour' && row.Result === 'Within the budget' && row.Appendix === 'A', JSON.stringify(row) + ' ' + JSON.stringify(r.led));
        check('C2 the appendices are the PSSA\'s functions', JSON.stringify(r.secIds) === JSON.stringify(r.apps.map(x => 'fn:' + x)) && r.apps[0] === 'SF-20', JSON.stringify(r.secIds));
        const h3 = r.heads.filter(h => h.l === 3).map(h => h.t), first = h3.slice(0, 5);
        check('C3 each failure condition in order: what is verified, the tree worked out again, the budget against the design, its requirements and their verification, the path to compliance', JSON.stringify(first) === JSON.stringify(['What is being verified', 'The tree worked out again', 'The budget against the design', 'Requirements and their verification', 'Path to compliance']) && r.heads[0].t === 'The function', JSON.stringify(r.heads.slice(0, 8)));
        const i2 = r.heads.findIndex(h => /^FC-EPS02 /.test(h.t)), i3 = r.heads.findIndex(h => /^FC-EPS03 /.test(h.t));
        check('C4 the Minor failure condition is qualitative: shown by its requirements, no tree and no budget', i2 > 0 && /\(qualitative\)$/.test(r.heads[i2].t) && !r.heads.slice(i2, i3 > i2 ? i3 : undefined).some(h => /tree worked out again|budget against the design/.test(h.t)), JSON.stringify(r.heads.slice(i2, i2 + 4)));
        check('C5 the verification tree is drawn with its numbered caption', r.caps.some(c => /^Figure A\.\d+: FC-EPS01 .*verification tree with the real failure rates/.test(c)), JSON.stringify(r.caps));

        console.log('\n[Q] the questions');
        check('Q1 the only questions are which evidence closes each requirement (besides the generated cards)', r.qs.length > 0 && r.qs.every(q => /^Which evidence closes REQ-/.test(q) || /^The tree worked out again, the budget against the design$/.test(q)) && r.frontQs.length > 0 && r.frontQs.every(q => /^Which evidence closes REQ-/.test(q) || q === 'The PSSA this verifies'), JSON.stringify(r.qs) + ' front ' + JSON.stringify(r.frontQs));
        check('Q2 the evidence offered is what is linked: the verification tree and the system FMEA', r.ev.some(e => /^ver:/.test(e) && /verification tree/.test(e)) && r.ev.some(e => /^fmea\|The Electrical Power System FMEA/.test(e)), JSON.stringify(r.ev));
        check('Q3 picking it writes the register: the evidence named, Passed, by the engineer; the path to compliance shows it closed', r.after && r.after.st === 'Passed' && /^The verification tree /.test(r.after.ev) && r.after.rec && r.after.rec.by && r.pathClosed === 'Yes', JSON.stringify(r.after) + ' ' + r.pathClosed);
        check('Q4 "Not closed yet" reopens it', r.reopened === 'In Progress');
        check('Q5 a requirement already Passed is filled in from the register', /Already closed/.test(r.handQ), r.handQ.slice(0, 200));
        check('Q6 the AI waits while requirements are open, and says which', r.leftAfter.length >= 1 && r.leftAfter.every(x => /^Which evidence closes /.test(x)));

        console.log('\n[O] outputs');
        check('O1 every output is accepted by a role (never a person)', r.outputs.length === 3 && r.outputs.every(x => r.ROLES.indexOf(x) >= 0), JSON.stringify(r.outputs));

        console.log('\n[W] Word');
        check('W1 Word: the front (purpose, the PSSA it verifies, method, budgets), then Appendix A: SF-20 with its parts', r.wordHeads[0] === '1. Purpose and scope' && r.wordHeads.some(h => /The PSSA it verifies/.test(h)) && r.wordHeads.some(h => /Budgets against the design/.test(h)) && r.wordHeads.some(h => /^Appendix A: SF-20/.test(h)) && r.wordHeads.some(h => /^A\.2\.1 What is being verified/.test(h)), JSON.stringify(r.wordHeads.slice(0, 12)));
    } finally { await browser.close(); srv.close(); }
    check('Z no page errors', errs.length === 0, errs.join(' | '));
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
