/* regression_asa_autopilot_20261110.test.js: the ASA Autopilot. One Aircraft Safety Assessment on the ASA page: the front of the
 * report and one appendix per aircraft function (the PASA's), each holding every failure condition of that function rated
 * Minor or above.
 *
 * Waqas, 10 Nov 2026: "ASA stays locked till all SSAs and PASA has been baselined". Baselined, as for the SSA: an issued revision
 * with every output accepted. All SSAs (used and stated): the SSA of every system with a failure condition rated Minor or above.
 * Once open it stays open. The ASA holds every aircraft failure condition sorted (closed by an SSA, needs aircraft-level work,
 * open: asa_triage.js), the trees spanning several systems worked out again with the systems' measured numbers (asaMeasuredRun),
 * the common causes, assurance, and a compliance summary accepted by role. The questions: which evidence closes each aircraft
 * requirement, and whether the aircraft-level work for each failure condition that needs it is done. The old checklist is hidden.
 *
 * On the Aeolus HL-1 demo, in the real app, with the production CSP:
 *   [K]  the lock: locked with the PASA and every SSA named; still locked with the PASA baselined alone; a system with no failure
 *        condition rated Minor or above is not waited for; open once all are baselined; stays open
 *   [C]  the report: every aircraft failure condition sorted on the front, as asa_triage sorts it; FC-05 needs aircraft-level
 *        work (Propulsion and Fuel feed it), its MF&MS tree worked out again with the measured numbers (the same run as
 *        asaMeasuredRun); its gates and their common mode analyses; the systems that feed it with their SSA revision
 *   [Q]  the aircraft-level question for FC-05, and the evidence for its requirement offered from the SSAs that close it;
 *        picking writes the register's evidence and Passed
 *   [O]  the compliance summary: outputs accepted by role
 *   [H]  the old ASA checklist is hidden
 *   no page errors
 * MUTATION PROOFS: SL_ASA_MUTATE=nolock | pasaonly | relock | allsys | acl | measured | oldlist. Each one turns this red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_asa_autopilot_20261110.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 900) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_ASA_MUTATE || '';
const MUTS = {
    nolock:   ['asa_autopilot.js', "        return { locked: true, pasa: pa, ssa: ss };", "        return { locked: false, pasa: pa, ssa: ss };"],
    pasaonly: ['asa_autopilot.js', "        if (pa.ok && ss.every(function (x) { return x.b.ok; })) {", "        if (pa.ok) {"],
    relock:   ['asa_autopilot.js', "        if (s0.opened) return { locked: false, opened: s0.opened };\n", ""],
    allsys:   ['asa_autopilot.js', "    function needsSsa(sy) { var P2 = root.SLPssaAuto; return !!(P2 && P2.candidates(sy).length); }", "    function needsSsa(sy) { return true; }"],
    acl:      ['asa_autopilot.js', "    function aclOk(gr) { var t = triOf(gr), a = astore().acl[gr.fcId]; return !t || t.cls !== 'aircraft-level' || !!(a && a.ok); }", "    function aclOk(gr) { return true; }"],
    measured: ['asa_autopilot.js', "Measured: x.measuredPerFH != null ? l.sci(x.measuredPerFH)", "Measured: x.measuredPerFH != null ? l.sci(x.budgetPerFH)"],
    oldlist:  ['asa_autopilot.js', "st.textContent = '#view-asa > #ckpt-page-asa{display:none!important}#view-asa > p{display:none}';", "st.textContent = '';"]
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) { let s = fs.readFileSync(path.join(SITE, name), 'utf8'); const m = MUTS[MUT]; if (m && m[0] === name) { if (s.indexOf(m[1]) < 0) throw new Error('mutation site missing: ' + m[1]); s = s.replace(m[1], m[2]); } return s; }
const EM = String.fromCharCode(0x2014);
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);

(async function main() {
    console.log('\n[S] pins and the page');
    const HTML = src('index.html');
    check('S1 asa_autopilot.js 1.1 pinned after ssa_autopilot.js; the ASA page heading has no em dash; this test has none', /asa_autopilot\.js\?v=1\.1"/.test(HTML) && HTML.indexOf('src="asa_autopilot.js') > HTML.indexOf('src="ssa_autopilot.js') && /<h3>ASA: Aircraft Safety Assessment<\/h3>/.test(HTML) && src('asa_autopilot.js').indexOf(EM) < 0 && fs.readFileSync(__filename, 'utf8').indexOf(EM) < 0);

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
        await pg.evaluate(() => switchTab('asa')); await tick(1500);

        const r = await within(pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const X = window.SLAsaAuto, A = window.SLPasaAuto, B = window.SLSsaAuto, P2 = window.SLPssaAuto, out = {};
            const reshow = async () => { switchTab('pasa'); await wait(200); switchTab('asa'); await wait(1000); };
            const lockText = () => { const c = document.getElementById('asa-lock-page'); return c ? c.innerText : ''; };
            const hostShown = () => { const h = document.getElementById('ccr-host-asa'); return !!h && h.style.display !== 'none'; };
            const bl = (key, rep) => { const R = SLCcaReport.get(key); R.withRep(rep, () => { R.issue('First issue'); R.acceptance().forEach(o => R.accept(o.id)); }); };
            // a system with no failure condition: nothing to wait for
            systemsData.push({ id: 'sys-empty', name: 'Cabin lighting', functions: [], fha: [], req: [], fcim: [], extractedFCs: [], asm: [] }); SLDataChange.bump();
            out.ckpt = getComputedStyle(document.getElementById('ckpt-page-asa')).display;
            // ---- [K] the lock ----------------------------------------------------------------------------------------------
            out.k1 = { locked: X.lockOf().locked, text: lockText(), host: hostShown() };
            bl('pasa', 'aircraft'); await reshow();
            out.k2 = { locked: X.lockOf().locked, text: lockText(), host: hostShown() };
            const need = systemsData.filter(s => P2.candidates(s).length);
            out.need = need.length; out.nSys = systemsData.length;
            need.forEach(s => { bl('pssa', 'sys:' + s.id); B.lockOf(s); bl('ssa', 'sys:' + s.id); });
            await reshow();
            out.k3 = { locked: X.lockOf().locked, opened: X.store().opened, text: lockText(), host: hostShown() };
            SLCcaReport.get('pasa').withRep('aircraft', () => SLCcaReport.get('pasa').unaccept('concl'));
            out.k4 = X.lockOf().locked;
            // ---- [C] the report ---------------------------------------------------------------------------------------------
            const R = SLCcaReport.get('asa'); R.setTab('aircraft'); await wait(500);
            const front = R.doc({ report: 'aircraft' });
            out.tri = ((front.find(b => b.k === 'table' && b.name === 'triage') || {}).rows) || [];
            out.nCand = A.candidates().length;
            out.triRaw = asaTriage().filter(t => A.candidates().some(g => g.fcId === t.fcId)).map(t => t.fcId + ':' + t.cls);
            const gr = A.groupOf('FC-05'), ctx = { C: SLCcaReport.palette(), dark: false, forExport: false, key: 'asa' };
            out.fn = String(gr.gov.subId);
            const sec = X.fnSection(out.fn, ctx);
            out.heads = sec.filter(b => b.k === 'h').map(b => ({ l: b.level, t: b.text }));
            const run = sec.find(b => b.k === 'table' && b.name === 'run-FC-05'); out.runRows = run ? run.rows : [];
            const sysT = sec.find(b => b.k === 'table' && b.name === 'sys-FC-05'); out.sysRows = sysT ? sysT.rows : [];
            out.paras = sec.filter(b => b.k === 'p').map(b => b.text).join(' ');
            const mf = (asaTriage().find(t => t.fcId === 'FC-05') || { mfms: [] }).mfms[0];
            out.mf = mf ? { name: mf.name, run: asaMeasuredRun(mf.id) } : null;
            // ---- [Q] the questions ------------------------------------------------------------------------------------------
            R.setTab('aircraft::fn:' + out.fn); await wait(800);
            const left = document.querySelector('#ccr-host-asa [data-ccleft]');
            out.qs = left ? Array.from(left.querySelectorAll('.slap-q')).map(e => e.textContent.trim()) : [];
            out.aclBefore = X.aclOk(gr); X.ui.pick('fc.FC-05.acl', 'yes'); out.aclAfter = X.aclOk(gr);
            const rq = X.reqsOf(gr); out.rqIds = rq.map(x => x.id);
            const req = rq[0]; out.ev = req ? X.evidenceFor(req).map(e => e.id + '|' + e.label) : [];
            if (req) { req.verifStatus = 'Pending'; const e = X.evidenceFor(req).find(x => /^ssa:sys-prp/.test(x.id)); if (e) X.ui.pick('req.' + req.internalId, e.id); out.after = { st: req.verifStatus, ev: req.verifEvidence }; }
            out.outputs = X.outputs().map(o => o.role); out.ROLES = R.ROLES;
            out.lockSys = need.map(s => s.id);
            return out;
        }), 240000, 'the ASA run');

        console.log('\n[K] the lock');
        check('K1 locked at first: the page names the PASA and the SSA of each system; the report is hidden', r.k1.locked && /The PASA has not been issued yet/.test(r.k1.text) && /The SSA of the Electrical Power System: not issued yet/.test(r.k1.text) && !r.k1.host, r.k1.text.slice(0, 300));
        check('K2 the PASA baselined alone: still locked, now naming only the SSAs', r.k2.locked && !/The PASA/.test(r.k2.text) && /The SSA of the /.test(r.k2.text) && !r.k2.host, r.k2.text.slice(0, 300));
        check('K3 a system with no failure condition rated Minor or above is not waited for', r.need === r.nSys - 1 && r.lockSys.indexOf('sys-empty') < 0 && !/Cabin lighting/.test(r.k1.text + r.k2.text));
        check('K4 every SSA and the PASA baselined: open, with the revisions recorded, the report shown', !r.k3.locked && r.k3.opened && r.k3.opened.pasa === 'A' && r.k3.opened.ssa['sys-eps'] === 'A' && !r.k3.text && r.k3.host, JSON.stringify(r.k3).slice(0, 300));
        check('K5 once open it stays open, even when the PASA is reopened', r.k4 === false);

        console.log('\n[C] the report');
        check('C1 every aircraft failure condition rated Minor or above is sorted on the front, as asa_triage sorts it', r.tri.length === r.nCand && r.triRaw.every(x => { const [fc, cls] = x.split(':'); const row = r.tri.find(t => t['Failure condition'].indexOf(fc + ' ') === 0); return row && row['How it is closed'] === ({ 'closed-by-ssa': 'Closed by an SSA', 'aircraft-level': 'Needs aircraft-level work', open: 'Open' })[cls]; }), JSON.stringify(r.tri.slice(0, 3)));
        const f05 = r.tri.find(t => /^FC-05 /.test(t['Failure condition']));
        check('C2 FC-05 needs aircraft-level work, and says why in plain words (the systems that feed it)', f05 && f05['How it is closed'] === 'Needs aircraft-level work' && /Propulsion/.test(f05.Why) && /Fuel System/.test(f05.Why) && f05.Why.indexOf(String.fromCharCode(0x2014)) < 0, JSON.stringify(f05));
        const h3 = r.heads.filter(h => h.l === 3).map(h => h.t).slice(0, 6);
        check('C3 each failure condition: how it is closed, the trees with the measured numbers, common causes, assurance, its requirements, the path to compliance', JSON.stringify(h3) === JSON.stringify(['How it is closed', 'The trees with the measured numbers', 'Common causes', 'Assurance', 'Aircraft requirements and their verification', 'Path to compliance']), JSON.stringify(h3));
        const mrow = r.mf ? r.runRows.find(x => x.Tree.indexOf('MF&MS') === 0) : null;
        const sci = v => { const e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e); return m.toFixed(1) + ' × 10' + String(e).split('').map(c => ({ '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' })[c]).join(''); };
        check('C4 the MF&MS tree of FC-05 worked out again with the systems\' measured numbers: the same run as asaMeasuredRun, against the objective', mrow && r.mf.run && mrow.Measured === sci(r.mf.run.measuredPerFH) + ' per flight hour' && mrow.Budget === (r.mf.run.budgetPerFH ? sci(r.mf.run.budgetPerFH) + ' per flight hour' : 'Not worked out (no rates on its own events)') && /^(Every event|Some events)/.test(mrow['Measured numbers used']) && /objective/.test(mrow.Result), JSON.stringify(mrow) + ' ' + JSON.stringify(r.mf && { m: r.mf.run.measuredPerFH, b: r.mf.run.budgetPerFH }));
        check('C5 its gates and their common mode analyses are named; the systems that feed it are listed with their SSA revision', /Gate G-7086 .* carries the budget/.test(r.paras) && r.sysRows.length >= 2 && r.sysRows.every(x => x.SSA === 'Revision A'), JSON.stringify(r.sysRows));

        console.log('\n[Q] the questions');
        check('Q1 the aircraft-level question for FC-05 and the evidence questions for its requirements, nothing else', r.qs.indexOf('Is the aircraft-level work for FC-05 done?') >= 0 && r.qs.every(q => /^Is the aircraft-level work for FC-\d+ done\?$|^Which evidence closes REQ-/.test(q)), JSON.stringify(r.qs));
        check('Q2 answering it accepts the aircraft-level work', r.aclBefore === false && r.aclAfter === true);
        check('Q3 the evidence for FC-05\'s requirement is offered from what closes it: the SSAs of Propulsion and Fuel (with their revision), the measured run', r.ev.some(e => /^ssa:sys-prp\|The SSA of the Propulsion .*Revision A$/.test(e)) && r.ev.some(e => /^ssa:sys-fue\|/.test(e)) && r.ev.some(e => /^run:/.test(e)), JSON.stringify(r.ev));
        check('Q4 picking writes the register: the evidence named and Passed', r.after && r.after.st === 'Passed' && /^The SSA of the Propulsion/.test(r.after.ev), JSON.stringify(r.after));

        console.log('\n[O] the compliance summary');
        check('O1 every output is accepted by a role', r.outputs.length === 5 && r.outputs.every(x => r.ROLES.indexOf(x) >= 0), JSON.stringify(r.outputs));
        console.log('\n[H] the old checklist');
        check('H1 the old ASA checkpoint list is hidden behind the Autopilot', r.ckpt === 'none', r.ckpt);
    } finally { await browser.close(); srv.close(); }
    check('Z no page errors', errs.length === 0, errs.join(' | '));
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
