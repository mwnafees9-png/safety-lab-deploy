/* regression_hf_autopilot_20261106.test.js: the HF Autopilot walks the human factors work through the design cycle and
 * writes every answer into the HF tables (hf_autopilot.js v1.0; hf_analyses.js v1.21; nav_areas.js v1.7).
 *
 * Waqas, 6 Nov 2026: "how do we make our human factors assessments way more intuitive"; "make sure we have full end to
 * end coverage on a typical aircraft design cycle".
 * In the app (Aeolus HL-1 demo, served with the production CSP):
 *   - ten steps in design-cycle order (concept, preliminary design, detailed design, certification), built from the
 *     project: a question per aircraft function, per failure condition with a crew effect, per crew task, per flight
 *     phase, per flight deck control or display; the Autopilot sits first on the HF page; the HF tabs follow the cycle
 *   - each answer writes its HF table row, adopted by key (no duplicates on a changed answer); "not a crew task",
 *     "not credible", "no alert" remove the row they wrote; rows already in a table count as answers
 *   - task times are typed (a negative time is refused) and land in the task analysis ledger with the task's id; the
 *     workload chart renders; error rows carry how the crew notices, recovers and the failure condition fed
 *   - minimum crew writes the Appendix D assessment and a rationale; credit makes an HF assumption on the register;
 *     a validation plan is written only where the assumption has none
 *   - a step signs only when every question is answered, and a changed answer reopens it; the report carries the
 *     coverage table and the workload chart
 *   - the one-pilot crew-heavy check counts the lower-case allocations it stores (it never fired before)
 * MUTATION PROOFS: SL_HFA_MUTATE=dup (every answer adds a row), =nodrop (a removed answer keeps its row),
 *   =noreopen (a changed answer leaves the step signed) must fail.
 * Run: node tests/regression_hf_autopilot_20261106.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1200) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_HFA_MUTATE || '';
function mutate(file, body) {
    if (file !== 'hf_autopilot.js') return body;
    if (MUT === 'dup') return body.replace("var st = _lane(kind), row = _row(kind, key);", "var st = _lane(kind), row = null;");
    if (MUT === 'nodrop') return body.replace("function _drop(kind, key) {", "function _drop(kind, key) { return;");
    if (MUT === 'noreopen') return body.replace("if (stage && s.signed[stage]) delete s.signed[stage];", "");
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);

(async () => {
    console.log('regression_hf_autopilot_20261106' + (MUT ? ' [mutation ' + MUT + ']' : ''));
    const SRC = fs.readFileSync(path.join(SITE, 'hf_autopilot.js'), 'utf8');
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('no eval of any kind (the CSP forbids it); the stores are read through SLEnv', !/new Function|\beval\(/.test(SRC) && /SLEnv/.test(SRC));
    check('hf_autopilot.js v2 loads after the shared Autopilot look; the pins moved', /autopilot_ui\.js\?v=1\.\d+" defer><\/script>[\s\S]{0,400}<script src="hf_autopilot\.js\?v=2\.1" defer>/.test(HTML) && /nav_areas\.js\?v=(1\.(8|9|\d\d)|[2-9]\.\d+)/.test(HTML) && /hf_analyses\.js\?v=1\.21/.test(HTML) && /support_modules\.js\?v=66\.6[2-9]/.test(HTML));
    const NAV = fs.readFileSync(path.join(SITE, 'nav_areas.js'), 'utf8');
    check('the HF section is the Autopilot and the results; the old table pages leave the menu (their pages and data stay)', /items: \['snav-hfa-auto', 'snav-hfa-results'\]/.test(NAV) && /id="view-hfa-auto"/.test(HTML) && /id="view-hfa-results"/.test(HTML) && /id="view-hfa-tid"/.test(HTML) && !/id="snav-hfa-tid"/.test(HTML) && /const tabs = \[('plan-auto', )?'hfa-auto', 'hfa-results',/.test(fs.readFileSync(path.join(SITE, 'support_modules.js'), 'utf8')));
    check('the one-pilot crew-heavy check counts the stored lower-case allocations', /var a = String\(r\.allocation \|\| ''\)\.toLowerCase\(\); if \(a === 'crew' \|\| a === 'shared'\) crewCount\+\+; \}\); \} catch/.test(fs.readFileSync(path.join(SITE, 'hf_analyses.js'), 'utf8')));

    for (const f of ['hf_autopilot.js', 'hf_analyses.js', 'nav_areas.js']) { let okp = true; try { new Function(fs.readFileSync(path.join(SITE, f), 'utf8')); } catch (e) { okp = false; } check(f + ' parses', okp); }
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:hl1');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } const ext = path.extname(f); let body = fs.readFileSync(f); if (ext === '.js') body = Buffer.from(mutate(path.basename(f), body.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[ext] || 'application/octet-stream' }, ext === '.html' ? { 'Content-Security-Policy': "script-src 'self' 'unsafe-inline'" } : {})); r.end(body); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        page.on('dialog', d => d.dismiss().catch(() => {}));
        await page.addInitScript(() => { window.SL_VERIFY_SYNC_OFF = true; window.SL_FC_TREES_OFF = true; window.SL_FC_LINK_OFF = true; });
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        const r = await within(page.evaluate(async (data) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { const v = fn(); if (v) return v; } catch (_) {} await wait(60); } return null; };
            _applyProjectData(data); await wait(1500);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
            const out = {};
            const fnLabelOf = f => String(f.subName || f.funcName || f.subId || f.funcId).trim();
            const A = await until(() => window.HF_ANALYSES && window.SLAutopilotUI && window.SLHfAuto, 20000);
            const pc = SLEnv.get('projectConfig'), hf = k => ((pc.hf && pc.hf[k] && pc.hf[k].rows) || []);
            switchTab('hfa-auto'); await wait(800);
            const v = document.getElementById('view-hfa-auto'), host = document.getElementById('hf-auto-host');
            out.page = { host: !!host && host.parentNode === v && !!host.querySelector('[data-hf-auto="1"]'), first: true, shown: v.style.display !== 'none' };
            const cov0 = A.coverage();
            out.stages = cov0.map(c => c.n + ' ' + c.phase + ' ' + c.title);
            out.cov0 = cov0.map(c => c.key + ':' + c.questions);
            const PH = A.compute().byKey.sa.questions.map(q => q.phase);
            // 1 who does what, in every flight phase
            const q1 = A.compute().byKey.alloc.questions;
            q1.forEach((q, i) => {
                const fid = q.fn.internalId;
                if (i % 3 === 0) A.setAlloc(fid, '*', 'crew');
                else if (i % 3 === 1) { A.setAlloc(fid, '*', 'automation'); A.setAlloc(fid, 'Landing', 'crew'); }
                else { A.setAlloc(fid, '*', 'shared'); A.setAlloc(fid, 'Standing', 'na'); }
            });
            const f1 = q1[1].fn;
            out.alloc = { n: q1.length, phases: PH.length, rows: hf('alloc').length, mixed: JSON.stringify(A.allocMap(f1)), sum: (hf('alloc').find(x => String(x.key) === String(f1.internalId)) || {}).allocation,
                byPhase: !!(hf('alloc').find(x => String(x.key) === String(f1.internalId)) || {}).byPhase, why: hf('alloc').every(x => /HF Autopilot/.test(x.rationale)), refuse: A.setAlloc(f1.internalId, 'Cruise', 'nobody') === false && A.setAlloc(f1.internalId, 'Moon', 'crew') === false,
                done: A.compute().byKey.alloc.questions.every(q => q.done) };
            out.mfcCrewCount = HF_ANALYSES.mfcFindings().crewCount;
            // 2 which pilot, and the procedures; the tasks per phase are made by the tool
            const q2 = A.compute().byKey.tid.questions;
            q2.forEach((q, i) => A.answer(q.id, q.id.startsWith('tidf') ? (i % 4 === 0 ? 'emergency' : 'nonnormal') : (q.id === 'who:' + q1[0].fn.internalId ? 'PF' : (i % 2 ? 'PF' : 'Both'))));
            const normal = hf('tid').filter(x => x.opsMode === 'Normal');
            out.tid = { who: q2.filter(q => q.id.startsWith('who')).length, fc: q2.filter(q => q.id.startsWith('tidf')).length,
                f0tasks: normal.filter(x => x.fnId === String(q1[0].fn.internalId)).map(x => x.phase).join(','), f1tasks: normal.filter(x => x.fnId === String(f1.internalId)).map(x => x.phase).join(','),
                f2tasks: normal.filter(x => x.fnId === String(q1[2].fn.internalId)).length, emergencyRow: !!hf('tid').find(x => x.fcId && x.opsMode === 'Emergency'), fcLinked: hf('tid').filter(x => x.fcId).length };
            // a phase given back to the automation takes its task away
            const before = hf('tid').length;
            A.setAlloc(q1[0].fn.internalId, 'Cruise', 'automation');
            out.taskGone = hf('tid').length === before - 1 && !hf('tid').find(x => x.fnId === String(q1[0].fn.internalId) && x.phase === 'Cruise');
            A.setAlloc(q1[0].fn.internalId, 'Cruise', 'crew');
            out.taskBack = hf('tid').length === before;
            const fcQ = q2.find(q => q.id.startsWith('tidf'));
            const tidBefore = hf('tid').length;
            A.answer(fcQ.id, 'nonnormal'); A.answer(fcQ.id, 'emergency');
            out.tid.sameAfterReanswer = hf('tid').length === tidBefore;
            A.answer(fcQ.id, 'auto');
            out.tidDropped = hf('tid').length === tidBefore - 1 && !hf('tid').find(x => x.hfAutoKey === 'tid:f:' + fcQ.id.slice(5));
            A.answer(fcQ.id, 'nonnormal');
            // 3 how busy: every phase, every pilot; and every failure response
            const lp = A.compute().byKey.load.questions.filter(q => q.kind === 'loadphase');
            const take = lp.find(q => q.phase === 'Takeoff');
            out.loadRefuse = A.setPhase('Takeoff', 'window', '', -5) === false && A.setPhase('Takeoff', 'share', take.tasks[0].taskId, 140) === false;
            A.setPhase('Takeoff', 'window', '', 30);
            take.tasks.forEach((t, i) => A.setPhase('Takeoff', 'share', t.taskId, 10));
            A.setPhase('Takeoff', 'basis', '', 'Pilot assessment');
            const fp = SLEnv.get('flightPhasesData').find(p => p.phase === 'Takeoff');
            const wl = A.workload().find(x => x.phase === 'Takeoff');
            const pfN = take.tasks.filter(t => t.crew === 'PF' || t.crew === 'Both').length * 10, pmN = take.tasks.filter(t => t.crew === 'PM' || t.crew === 'Both').length * 10;
            out.phase = { tasks: take.tasks.length, window: fp && fp.windowS, pf: wl.PF.normal, pm: wl.PM.normal, wantPf: pfN, wantPm: pmN, done: A.compute().byKey.load.questions.find(q => q.id === 'loadp:Takeoff').done, ledger: hf('tasks').filter(x => x.phase === 'Takeoff' && x.shareP === '10' && x.basis === 'Pilot assessment').length };
            const pq = A.compute().byKey.load.questions.find(q => q.kind === 'proc' && /Takeoff/.test(q.task.phase));
            A.setLoad(pq.task.fcId, 'reactionS', 3); A.setLoad(pq.task.fcId, 'execS', 3); A.setLoad(pq.task.fcId, 'basis', 'Estimated by the engineer');
            const wl2 = A.workload().find(x => x.phase === 'Takeoff');
            out.proc = { refuse: A.setLoad(pq.task.fcId, 'reactionS', -1) === false, worstPf: wl2.PF.worst, wantTotal: pfN + 6 / 30 * 100, done: A.compute().byKey.load.questions.find(q => q.id === pq.id).done };
            const svg = A.workloadSvg();
            out.workload = { phases: A.workload().length, svg: /^<svg[^>]*xmlns=/.test(svg.svg), pilots: /Pilot workload|workload in each flight phase/.test(svg.svg) };
            out.png = (window.SLFtaPrint && SLFtaPrint.png) ? String(await SLFtaPrint.png(svg, 1).catch(() => '')).length : -1;
            // 4 errors: once per crew function and per failure response
            const s4q = A.compute().byKey.err.questions;
            out.errGroups = { fn: s4q.filter(q => q.id.startsWith('err:fn:')).length, fc: s4q.filter(q => q.id.startsWith('err:fc:')).length };
            const tq = s4q.find(q => q.task.fcId), gk = tq.task.key;
            A.setErr(gk, 'omission', 'v', 'yes'); A.setErr(gk, 'omission', 'detect', 'xcheck'); A.setErr(gk, 'omission', 'recover', 'procedure');
            A.setErr(gk, 'timing', 'v', 'yes'); A.setErr(gk, 'timing', 'detect', 'none'); A.setErr(gk, 'timing', 'recover', 'none');
            ['commission', 'sequence', 'selection'].forEach(m => A.setErr(gk, m, 'v', 'no'));
            const heaRows = () => hf('hea').filter(x => x.hfAutoKey && x.hfAutoKey.indexOf('err:' + gk + ':') === 0);
            const e1 = heaRows().find(x => x.errorMode === 'omission');
            const s4 = A.compute().byKey.err, eq = s4.questions.find(q => q.task.key === gk);
            out.err = { rows: heaRows().length, fcDefault: e1 && e1.fcIds === tq.task.fcId, detect: e1 && e1.detection, recover: e1 && e1.recovery, done: eq.done, open: A.stageStatus(s4).open };
            A.setErr(gk, 'timing', 'v', 'no');
            out.errDropped = heaRows().length === 1;
            // 5 alerts
            const fcA = A.compute().byKey.alert.questions[0].fc.fcId;
            A.setAlert(fcA, 'pick', 'warning'); A.setAlert(fcA, 'modality', 'visual'); A.setAlert(fcA, 'modality', 'aural');
            const al = hf('alerts').find(x => x.fcIds === fcA);
            out.alert = { row: !!al, prio: al && al.priority, mod: al && al.modality, done: A.compute().byKey.alert.questions[0].done, refuse: A.setAlert(fcA, 'pick', 'loud') === false };
            A.setAlert(fcA, 'pick', 'none'); out.alertDropped = !hf('alerts').find(x => x.fcIds === fcA);
            A.setAlert(fcA, 'pick', 'caution'); A.setAlert(fcA, 'modality', 'visual');
            // 6, 8 controls and displays, reach and view (the alert just made is a flight deck interface too)
            A.addInterface('Thrust levers');
            const ifs = A.interfaces();
            out.ifs = { n: ifs.length, thrust: ifs.some(x => x.name === 'Thrust levers'), alertIf: ifs.some(x => x.kind === 'Alerting'), dupRefused: A.addInterface('thrust levers') === false };
            const cdq = A.compute().byKey.cd.questions.find(q => q.item.name === 'Thrust levers');
            ['a', 'b', 'c'].forEach(id => A.setGrid(cdq.id, id, 'v', 'ok')); A.setGrid(cdq.id, 'd', 'v', 'gap');
            const cdNotDone = !A.compute().byKey.cd.questions.find(q => q.id === cdq.id).done;
            A.setGrid(cdq.id, 'd', 'note', 'No undo for a mis-set reverse thrust selection');
            const cdRows = hf('cd').filter(x => x.item === 'Thrust levers');
            out.cd = { rows: cdRows.length, closed: cdRows.filter(x => x.status === 'Closed').length, open: cdRows.filter(x => x.status === 'Open' && /No undo/.test(x.finding)).length, needsNote: cdNotDone, done: A.compute().byKey.cd.questions.find(q => q.id === cdq.id).done };
            const eqq = A.compute().byKey.ergo.questions.find(q => q.item.name === 'Thrust levers');
            A.setGrid(eqq.id, 'reach', 'v', 'ok'); A.setGrid(eqq.id, 'view', 'v', 'ok');
            out.ergo = hf('ergo').filter(x => x.item === 'Thrust levers').map(x => x.clause.slice(0, 15) + ':' + x.status);
            // 7 situation awareness
            const saq = A.compute().byKey.sa.questions[0];
            A.setGrid(saq.id, 'L1', 'v', 'ok'); A.setGrid(saq.id, 'L2', 'v', 'ok'); A.setGrid(saq.id, 'L3', 'v', 'gap'); A.setGrid(saq.id, 'L3', 'note', 'No trend vector for the cargo restraint tension');
            out.sa = { phase: saq.phase, rows: hf('sa').filter(x => x.phase === saq.phase).length, open: hf('sa').filter(x => x.phase === saq.phase && x.status === 'Open').length };
            // 9 minimum crew
            HF_ANALYSES.MFC_FUNCTIONS.forEach((f, i) => { A.setMfc('role', f.key, i % 2 ? 'PM' : 'PF'); A.setMfc('bedford', f.key, 3 + (i % 3)); });
            HF_ANALYSES.MFC_FACTORS.forEach((f, i) => A.setMfc('factor', i, i === 3 ? 'Needs attention' : 'Acceptable'));
            A.setMfc('factorNote', 3, 'Loading supervision on the ground');
            A.setMfc('crew', '', '2');
            const m = pc.hf.mfc;
            out.mfc = { fn: A.compute().byKey.mfc.questions.map(q => q.done).join(','), crew: m.conclusion.minCrew, rat: /Appendix D/.test(m.conclusion.rationale) && /1 workload factor needs attention/.test(m.conclusion.rationale), note: m.factors[3] };
            // 10 credit and evidence
            const cq = A.compute().byKey.credit.questions.find(q => q.id.startsWith('credit:'));
            const asmBefore = SLEnv.get('acAssumptionsData').length;
            A.answer(cq.id, 'yes');
            const asmList = SLEnv.get('acAssumptionsData'), newAsm = asmList[asmList.length - 1];
            const ctr = hf('tasks').find(x => x.tidId === cq.id.slice(7));
            out.credit = { added: asmList.length === asmBefore + 1, type: newAsm && newAsm.type, state: newAsm && newAsm.state, linked: !!ctr && ctr.asmId === newAsm.asmId };
            const planQ = A.compute().byKey.credit.questions.find(q => q.id === 'plan:' + newAsm.asmId);
            A.answer(planQ.id, 'sim');
            const keep = asmList.find(a => /human/i.test(a.type) && a.asmId !== newAsm.asmId && a.valStrategy);
            const keepBefore = keep && keep.valStrategy; if (keep) A.answer('plan:' + keep.asmId, 'flight');
            out.plan = { newPlan: newAsm.valStrategy, kept: !keep || keep.valStrategy === keepBefore };
            // sign and reopen
            const s1 = A.compute().byKey.alloc;
            out.sign = { ready: A.stageStatus(s1).state, refuseUnready: A.sign('load') === false, ok: A.sign('alloc'), state: A.stageStatus(A.compute().byKey.alloc).state };
            A.setAlloc(q1[1].fn.internalId, 'Taxi', 'crew');
            out.reopened = A.stageStatus(A.compute().byKey.alloc).state;
            // existing rows are answers
            delete pc.hfAuto.answers[q1[0].id];
            out.adopted = A.compute().byKey.alloc.questions.find(q => q.id === q1[0].id).done;
            // the page renders every step without errors, and the report
            const kinds = [];
            for (const s of A.compute().stages) { A.ui.stage(s.key); for (let i = 0; i <= Math.min(2, s.questions.length); i++) { A.ui.step(i); kinds.push(!!document.querySelector('[data-hf-auto-body="1"] .slap-q, [data-hf-auto-body="1"] .slap-why')); } }
            out.render = kinds.every(Boolean) && kinds.length > 10;
            switchTab('hfa-results'); await wait(600);
            const rv = document.getElementById('view-hfa-results'), T = A.results();
            out.results = { shown: rv.style.display !== 'none', cards: rv.querySelectorAll('.hfr-card').length, tabs: rv.querySelectorAll('.hfr-tab').length, tabOn: (rv.querySelector('.hfr-tab.on') || {}).textContent, tab2: (A.ui.resTab('workload'), rv.querySelectorAll('.hfr-card').length === 1 && !!rv.querySelector('#hfr-workload svg') && /Workload/.test((rv.querySelector('.hfr-tab.on') || {}).textContent)), purposes: T.every(t => t.q && t.purpose && t.purpose.length > 40), keys: T.map(t => t.key).join(','),
                allocRow: (T.find(t => t.key === 'alloc').rows.find(r => r[0] === fnLabelOf(f1)) || []).map(c => c && c.v != null ? c.v : c).join('|'),
                openTime: T.find(t => t.key === 'alerts').open, noInputs: !rv.querySelector('input, select, textarea'), oldOffMenu: !document.querySelector('#sl-areabar #snav-hfa-tid') && !document.querySelector('#sl-areabar #snav-hfa-hea') };
            let doc = ''; const o = window.open; window.open = () => ({ document: { open() {}, write(h) { doc += h; }, close() {} } });
            A.report(); window.open = o;
            out.report = { cov: /Coverage of the design cycle/.test(doc), svg: /workload in each flight phase/.test(doc), mfc: /Minimum flight crew: 2 pilots/.test(doc), steps: (doc.match(/<h2>\d+\. /g) || []).length };
            return out;
        }, demo.data), 240000, 'the HF Autopilot');
        check('the Autopilot has its own page', r.page.host && r.page.shown, JSON.stringify(r.page));
        check('ten steps in design-cycle order', JSON.stringify(r.stages) === JSON.stringify(['1 Concept Who does what', '2 Preliminary design Crew procedures', '3 Preliminary design How busy the crew is', '4 Preliminary design What the crew could get wrong', '5 Preliminary design How the crew is told', '6 Detailed design Controls and displays', '7 Detailed design Situation awareness', '8 Detailed design Reach and view', '9 Certification Minimum crew', '10 Certification Credit and evidence']), JSON.stringify(r.stages));
        check('built from the project: a phase grid per function (23), a screen per flight phase (8) and per failure response, a question per crew-effect failure condition (30)', /alloc:23/.test(r.cov0.join()) && /alert:30/.test(r.cov0.join()) && /sa:8/.test(r.cov0.join()) && /mfc:3/.test(r.cov0.join()) && /load:8/.test(r.cov0.join()), r.cov0.join(' '));
        check('who does what, phase by phase: the answer can differ by phase, the table keeps the phases and a summary, made-up answers and phases are refused', r.alloc.phases === 8 && r.alloc.rows === 23 && /"Landing":"crew"/.test(r.alloc.mixed) && /"Cruise":"automation"/.test(r.alloc.mixed) && r.alloc.sum === 'shared' && r.alloc.byPhase && r.alloc.why && r.alloc.refuse && r.alloc.done, JSON.stringify(r.alloc));
        check('the crew-heavy check counts every function the crew has a part in (all 23 here)', r.mfcCrewCount === 23, r.mfcCrewCount);
        check('the tool makes a crew task for each phase the crew has a part in: all 8, only Landing, the 7 shared phases', r.tid.f0tasks.split(',').length === 8 && r.tid.f1tasks === 'Landing' && r.tid.f2tasks === 7 && r.tid.who === 23 && r.tid.fc === 30 && r.tid.fcLinked === 30 && r.tid.emergencyRow, JSON.stringify(r.tid));
        check('a phase given back to the automation takes its task away, and back again', r.taskGone && r.taskBack);
        check('a changed answer updates its row, never a second one', r.tid.sameAfterReanswer, JSON.stringify(r.tid));
        check('"the aircraft handles it" removes the procedure it wrote', r.tidDropped);
        check('each phase: the response window lands on the flight phases table; each pilot\'s workload is the sum of the shares of the tasks they do (both-pilot tasks count for both); out-of-range values refused', r.loadRefuse && r.phase.window === '30' && r.phase.pf === r.phase.wantPf && r.phase.pm === r.phase.wantPm && r.phase.done && r.phase.ledger === r.phase.tasks, JSON.stringify(r.phase));
        check('a failure response: its time over the phase window comes on top of the pilot\'s workload', r.proc.refuse && r.proc.worstPf && Math.abs(r.proc.worstPf.total - r.proc.wantTotal) < 1e-6 && r.proc.done, JSON.stringify(r.proc));
        check('the workload chart: both pilots in every flight phase, a standalone picture that renders', r.workload.phases === 8 && r.workload.svg && r.workload.pilots && r.png > 2000, JSON.stringify(r.workload) + ' png ' + r.png);
        check('crew errors are asked once per crew function and per failure response, not per phase', r.errGroups.fn === 23 && r.errGroups.fc === 30, JSON.stringify(r.errGroups));
        check('crew errors: a row per credible error, with how it is noticed and put right and the failure condition (the task\'s own by default)', r.err.rows === 2 && r.err.fcDefault && r.err.detect === 'The other pilot catches it' && r.err.recover === 'A crew procedure' && r.err.done, JSON.stringify(r.err));
        check('an error nobody notices and nobody can put right stays open', r.err.open >= 1, JSON.stringify(r.err));
        check('"not credible" removes the error row', r.errDropped);
        check('alerts: level and how it reaches the crew, linked to the failure condition; "no alert" removes it', r.alert.row && r.alert.prio === 'Warning' && r.alert.mod === 'visual,aural' && r.alert.done && r.alert.refuse && r.alertDropped, JSON.stringify(r.alert));
        check('flight deck controls and displays: items, the alerts, and ones the engineer adds (once)', r.ifs.thrust && r.ifs.alertIf && r.ifs.dupRefused, JSON.stringify(r.ifs));
        check('controls and displays: the four 25.1302 questions; an open finding needs its words', r.cd.rows === 4 && r.cd.closed === 3 && r.cd.open === 1 && r.cd.needsNote && r.cd.done, JSON.stringify(r.cd));
        check('reach and view: the 25.777 and 25.1321 rows', JSON.stringify(r.ergo) === JSON.stringify(['14 CFR 25.777 (:Closed', '14 CFR 25.1321 :Closed']), JSON.stringify(r.ergo));
        check('situation awareness: three levels per flight phase, a gap stays open', r.sa.rows === 3 && r.sa.open === 1, JSON.stringify(r.sa));
        check('minimum crew: roles, Bedford, the ten factors and the crew, with a rationale written from them', r.mfc.fn === 'true,true,true' && r.mfc.crew === '2 pilots' && r.mfc.rat && r.mfc.note === 'Needs attention: Loading supervision on the ground', JSON.stringify(r.mfc));
        check('credit: the crew action becomes an HF assumption on the register (Proposed), linked to its task', r.credit.added && /human factors/i.test(r.credit.type) && r.credit.state === 'Proposed' && r.credit.linked, JSON.stringify(r.credit));
        check('a validation plan is written where there is none, and an existing one is kept', /Simulator campaign with line pilots/.test(r.plan.newPlan) && r.plan.kept, JSON.stringify(r.plan));
        check('a step signs only when every question is answered', r.sign.ready === 'ready' && r.sign.refuseUnready && r.sign.ok && r.sign.state === 'done', JSON.stringify(r.sign));
        check('a changed answer reopens a signed step', r.reopened === 'ready', r.reopened);
        check('a row already in a table counts as the answer', r.adopted);
        check('every step renders', r.render);
        // 6 Nov 2026 (Waqas: "HF results should be broken up in multiple tabs containing a table each"): 11 tabs, one table on screen
        check('the results page: a tab per question, one table on screen at a time with its purpose, nothing to type, the old tables off the menu', r.results.shown && r.results.cards === 1 && r.results.tabs === 11 && /Who does what/.test(r.results.tabOn) && r.results.tab2 && r.results.purposes && r.results.noInputs && r.results.oldOffMenu && /^alloc,pilots,workload,time,errors,alerts,cd,sa,ergo,mfc,credit$/.test(r.results.keys), JSON.stringify(r.results));
        check('the results show who does a function phase by phase, and count what is open', r.results.allocRow.split('|').slice(1).join(',') === 'Automation,Crew,Automation,Automation,Automation,Automation,Automation,Crew' && r.results.openTime >= 1, JSON.stringify(r.results));
        check('the report: coverage of the design cycle, the workload chart, every step, the crew decision', r.report.cov && r.report.svg && r.report.mfc && r.report.steps >= 8, JSON.stringify(r.report));
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } catch (e) { check('the app part ran', false, e.message); }
    finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
