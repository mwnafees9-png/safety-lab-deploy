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
    check('hf_autopilot.js loads after the shared Autopilot look; the pins moved', /autopilot_ui\.js\?v=1\.\d+" defer><\/script>[\s\S]{0,400}<script src="hf_autopilot\.js\?v=1\.0" defer>/.test(HTML) && /nav_areas\.js\?v=1\.7/.test(HTML) && /hf_analyses\.js\?v=1\.21/.test(HTML));
    const NAV = fs.readFileSync(path.join(SITE, 'nav_areas.js'), 'utf8');
    check('the HF tabs follow the design cycle, in plain words', /items: \['snav-hfa', 'snav-hfa-alloc', 'snav-hfa-tid', 'snav-hfa-task', 'snav-hfa-hea', 'snav-hfa-alerts', 'snav-hfa-cd', 'snav-hfa-sa', 'snav-hfa-ergo', 'snav-hfa-mfc'\]/.test(NAV) && /'snav-hfa-alloc': '1\. Who does what'/.test(NAV) && /'snav-hfa-mfc': '9\. Minimum crew'/.test(NAV));
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
            const A = await until(() => window.HF_ANALYSES && window.SLAutopilotUI && window.SLHfAuto, 20000);
            const pc = SLEnv.get('projectConfig'), hf = k => ((pc.hf && pc.hf[k] && pc.hf[k].rows) || []);
            switchTab('hfa'); await wait(800);
            const v = document.getElementById('view-hfa'), host = document.getElementById('hf-auto-host');
            out.page = { host: !!host && host.parentNode === v && !!host.querySelector('[data-hf-auto="1"]'), first: !!host && [...v.children].indexOf(host) <= 1 };
            const cov0 = A.coverage();
            out.stages = cov0.map(c => c.n + ' ' + c.phase + ' ' + c.title);
            out.cov0 = cov0.map(c => c.key + ':' + c.questions);
            // 1 who does what
            const fns = SLEnv.get('acFunctionsData');
            const q1 = A.compute().byKey.alloc.questions;
            q1.forEach((q, i) => A.answer(q.id, i % 3 === 0 ? 'crew' : (i % 3 === 1 ? 'automation' : 'shared')));
            out.alloc = { n: q1.length, rows: hf('alloc').length, crew: hf('alloc').filter(x => x.allocation === 'crew').length, why: hf('alloc').every(x => /HF Autopilot/.test(x.rationale)), refuse: A.answer(q1[0].id, 'nobody') === false };
            out.mfcCrewCount = HF_ANALYSES.mfcFindings().crewCount;
            // 2 crew procedures
            const q2 = A.compute().byKey.tid.questions;
            q2.forEach((q, i) => A.answer(q.id, q.id.startsWith('tidf') ? (i % 4 === 0 ? 'emergency' : 'nonnormal') : 'PF'));
            const fcQ = q2.find(q => q.id.startsWith('tidf'));
            const tidBefore = hf('tid').length;
            A.answer(fcQ.id, 'nonnormal'); A.answer(fcQ.id, 'emergency');
            out.tid = { n: q2.length, normal: q2.filter(q => q.id.startsWith('tidn')).length, fc: q2.filter(q => q.id.startsWith('tidf')).length, rows: hf('tid').length, sameAfterReanswer: hf('tid').length === tidBefore,
                emergencyRow: !!hf('tid').find(x => x.fcId && x.opsMode === 'Emergency'), fcLinked: hf('tid').filter(x => x.fcId).length };
            A.answer(fcQ.id, 'auto');
            out.tidDropped = hf('tid').length === tidBefore - 1 && !hf('tid').find(x => x.hfAutoKey === 'tid:f:' + fcQ.id.slice(5));
            A.answer(fcQ.id, 'nonnormal');
            // 3 how busy
            const q3 = A.compute().byKey.load.questions;
            const t0 = q3[0].task.taskId;
            out.loadRefuse = A.setLoad(t0, 'reactionS', -2) === false;
            A.setLoad(t0, 'reactionS', 2.5); A.setLoad(t0, 'execS', 4); A.setLoad(t0, 'basis', 'Measured in the simulator'); A.setLoad(t0, 'channel', 'VIS'); A.setLoad(t0, 'channel', 'PSY'); A.setLoad(t0, 'channel', 'VIS');
            const tr = hf('tasks').find(x => x.tidId === t0);
            out.load = { n: q3.length, row: !!tr, times: tr && tr.reactionS + '/' + tr.execS, resp: tr && HF_ANALYSES.taskResponseS(tr), basis: tr && tr.basis, channels: tr && tr.channels, done: A.compute().byKey.load.questions[0].done };
            const wl = A.workload(), svg = A.workloadSvg();
            out.workload = { phases: wl.length, some: wl.some(x => x.max != null), svg: /^<svg[^>]*xmlns=/.test(svg.svg) };
            out.png = (window.SLFtaPrint && SLFtaPrint.png) ? String(await SLFtaPrint.png(svg, 1).catch(() => '')).length : -1;
            // 4 errors
            const tq = A.compute().byKey.err.questions.find(q => q.task.fcId);
            const tid4 = tq.task.taskId;
            A.setErr(tid4, 'omission', 'v', 'yes'); A.setErr(tid4, 'omission', 'detect', 'xcheck'); A.setErr(tid4, 'omission', 'recover', 'procedure');
            A.setErr(tid4, 'timing', 'v', 'yes'); A.setErr(tid4, 'timing', 'detect', 'none'); A.setErr(tid4, 'timing', 'recover', 'none');
            ['commission', 'sequence', 'selection'].forEach(m => A.setErr(tid4, m, 'v', 'no'));
            const heaRows = () => hf('hea').filter(x => x.tidId === tid4);
            const e1 = heaRows().find(x => x.errorMode === 'omission');
            const s4 = A.compute().byKey.err, eq = s4.questions.find(q => q.task.taskId === tid4);
            out.err = { rows: heaRows().length, fcDefault: e1 && e1.fcIds === tq.task.fcId, detect: e1 && e1.detection, recover: e1 && e1.recovery, done: eq.done, open: A.stageStatus(s4).open };
            A.setErr(tid4, 'timing', 'v', 'no');
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
            const pq = A.compute().byKey.credit.questions.find(q => q.id === 'plan:' + newAsm.asmId);
            A.answer(pq.id, 'sim');
            const keep = asmList.find(a => /human/i.test(a.type) && a.asmId !== newAsm.asmId && a.valStrategy);
            const keepBefore = keep && keep.valStrategy; if (keep) A.answer('plan:' + keep.asmId, 'flight');
            out.plan = { newPlan: newAsm.valStrategy, kept: !keep || keep.valStrategy === keepBefore };
            // sign and reopen
            const s1 = A.compute().byKey.alloc;
            out.sign = { ready: A.stageStatus(s1).state, refuseUnready: A.sign('load') === false, ok: A.sign('alloc'), state: A.stageStatus(A.compute().byKey.alloc).state };
            A.answer(q1[1].id, 'crew');
            out.reopened = A.stageStatus(A.compute().byKey.alloc).state;
            // existing rows are answers
            A.answer(q1[0].id, 'crew');
            delete pc.hfAuto.answers[q1[0].id];
            out.adopted = A.compute().byKey.alloc.questions.find(q => q.id === q1[0].id).done;
            // the page renders every step without errors, and the report
            const kinds = [];
            for (const s of A.compute().stages) { A.ui.stage(s.key); for (let i = 0; i <= Math.min(2, s.questions.length); i++) { A.ui.step(i); kinds.push(!!document.querySelector('[data-hf-auto-body="1"] .slap-q, [data-hf-auto-body="1"] .slap-why')); } }
            out.render = kinds.every(Boolean) && kinds.length > 10;
            let doc = ''; const o = window.open; window.open = () => ({ document: { open() {}, write(h) { doc += h; }, close() {} } });
            A.report(); window.open = o;
            out.report = { cov: /Coverage of the design cycle/.test(doc), svg: /Busiest crew task in each flight phase/.test(doc), mfc: /Minimum flight crew:<\/b> 2 pilots/.test(doc), steps: (doc.match(/<h2>\d+\. /g) || []).length };
            return out;
        }, demo.data), 240000, 'the HF Autopilot');
        check('the Autopilot sits first on the HF page', r.page.host && r.page.first, JSON.stringify(r.page));
        check('ten steps in design-cycle order', JSON.stringify(r.stages) === JSON.stringify(['1 Concept Who does what', '2 Preliminary design Crew procedures', '3 Preliminary design How busy the crew is', '4 Preliminary design What the crew could get wrong', '5 Preliminary design How the crew is told', '6 Detailed design Controls and displays', '7 Detailed design Situation awareness', '8 Detailed design Reach and view', '9 Certification Minimum crew', '10 Certification Credit and evidence']), JSON.stringify(r.stages));
        check('built from the project: a question per function (23), per crew-effect failure condition (30), per flight phase, the minimum crew', /alloc:23/.test(r.cov0.join()) && /alert:30/.test(r.cov0.join()) && /sa:8/.test(r.cov0.join()) && /mfc:3/.test(r.cov0.join()), r.cov0.join(' '));
        check('who does what writes the allocation table, with a reason; a made-up answer is refused', r.alloc.rows === 23 && r.alloc.crew === 8 && r.alloc.why && r.alloc.refuse, JSON.stringify(r.alloc));
        check('the crew-heavy check now counts crew and shared functions (8 + 7)', r.mfcCrewCount === 15, r.mfcCrewCount);
        check('crew procedures: a normal task per crew function, a procedure per crew-effect failure condition, linked to it', r.tid.normal === 15 && r.tid.fc === 30 && r.tid.rows === 45 && r.tid.fcLinked === 30 && r.tid.emergencyRow, JSON.stringify(r.tid));
        check('a changed answer updates its row, never a second one', r.tid.sameAfterReanswer, JSON.stringify(r.tid));
        check('"the aircraft handles it" removes the procedure it wrote', r.tidDropped);
        check('task times are typed (a negative one refused) and land in the ledger with the task id, basis and channels', r.loadRefuse && r.load.row && r.load.times === '2.5/4' && r.load.resp === 6.5 && r.load.basis === 'Measured in the simulator' && r.load.channels === 'PSY' && r.load.done, JSON.stringify(r.load));
        check('the workload chart: one bar per flight phase, a standalone picture that renders', r.workload.phases === 8 && r.workload.some && r.workload.svg && r.png > 2000, JSON.stringify(r.workload) + ' png ' + r.png);
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
        check('the report: coverage of the design cycle, the workload chart, every step, the crew decision', r.report.cov && r.report.svg && r.report.mfc && r.report.steps >= 8, JSON.stringify(r.report));
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } catch (e) { check('the app part ran', false, e.message); }
    finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
