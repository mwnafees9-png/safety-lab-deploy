/* regression_plan_autopilot_20261106.test.js: the Plan Autopilot (plan_autopilot.js v2.0) writes the SSPP, the Human
 * Factors Plan and the RAM Plan from questions, with the Sys Lab Planning Autopilot's layout.
 *
 * Waqas, 6 Nov 2026: "program planing in safety lab needs to have the same interface as sys lab planing auto-pilot,
 * questions to be in conjunction with DA assurance and the tool linkings"; the SSPP follows the ARP4754B Appendix B
 * example plan; "similar treatment for the HF plan and RAM plan too"; then, the same day:
 *   "why is this plan showing resulting numbers again" (plans carry no counts or status: those are status reports),
 *   "Will a PASA be performed not already done" (forward-looking questions),
 *   "failure conditions addressed by multiple systems can be addressed with interdependence analysis, MAC, and CoFFE",
 *   "we need to cover all different permutations",
 *   "rope in the cert basis directly into the program planning rather than a separate tab" (the plan's severity,
 *     probability and DAL table from the same engine the tool uses),
 *   "we are still missing the table of contents, table of tables, table of figures etc. cover page",
 *   and it was slow: 3.4 s per click.
 * 7 Nov 2026: "why are these not lined up" (the app-wide button style centred each answer card's contents, so the
 *   shorter the explanation the further the checkbox drifted right).
 * MUTATION PROOFS: SL_PLA_MUTATE=nogate (an answer applies at once), =nosign (a lane off without its signed entry),
 *   =statusleak (a count gets into the plan), =drift (the cards lose their own left alignment), =darkleak (the plan page
 *   keeps light figures in dark mode), =flat (follow-ups lose their indent), =noio (a plan loses its inputs and outputs) must fail.
 * 7 Nov 2026, later: "It looks so weird in dark mode" (a dark plan page), "show indentations when needed", "we need to define
 *   inputs and outputs of each assessment in all the plans both in diagrams and prose".
 * Run: node tests/regression_plan_autopilot_20261106.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1400) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_PLA_MUTATE || '';
function mutate(file, body) {
    if (file !== 'plan_autopilot.js') return body;
    if (MUT === 'nogate') return body.replace("s.answers[k] = val; s.who[k] = { by: who(), at: now() };", "s.answers[k] = val; s.who[k] = { by: who(), at: now() }; try { (q.set || []).forEach(function (st) { var af = st.after(val); if (af != null && af !== st.now()) st.apply(val, who(), BY[q.plan], q); }); } catch (_) {}");
    if (MUT === 'nosign') return body.replace("PP().setLane(id, on, on ? {} : { rationale: 'The ' + plan.title + ' says: ' + optLabel(q, v) + '.' + (why ? ' Reason: ' + why : ''), sig: by });", "PP().setLane(id, on, {});");
    if (MUT === 'drift') return body.replace('display:flex;justify-content:flex-start;gap:10px', 'display:flex;gap:10px').replace('.pla-ob{flex:1 1 auto;', '.pla-ob{');
    if (MUT === 'darkleak') return body.replace('C = isDark() ? DARK : LIGHT;', 'C = LIGHT;');
    if (MUT === 'flat') return body.replace("function put(q, d) { out.push({ q: q, depth: d });", "function put(q, d) { d = 0; out.push({ q: q, depth: d });");
    if (MUT === 'noio') return body.replace("var L = assessments().filter(function (a) { return a.plan === key; }); if (!L.length) return [];\n        var what", "var L = []; if (!L.length) return [];\n        var what");
    if (MUT === 'statusleak') return body.replace("var it = intro(key, sec); if (it) blocks.push(P(it));", "var it = intro(key, sec); if (it) blocks.push(P(it + ' (' + counts().afha + ' failure conditions so far.)'));");
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);

(async () => {
    console.log('regression_plan_autopilot_20261106' + (MUT ? ' [mutation ' + MUT + ']' : ''));
    const SRC = fs.readFileSync(path.join(SITE, 'plan_autopilot.js'), 'utf8');
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const NAV = fs.readFileSync(path.join(SITE, 'nav_areas.js'), 'utf8');
    const RW = fs.readFileSync(path.join(SITE, 'report_writer.js'), 'utf8');
    let okp = true; try { new Function(SRC); } catch (e) { okp = false; }
    check('plan_autopilot.js v2 parses; no eval of any kind (the CSP forbids it); the stores are read through SLEnv', okp && /VERSION = '2\.2'/.test(SRC) && !/new Function|\beval\(/.test(SRC) && /SLEnv/.test(SRC));
    check('the Plan Autopilot is first under Plan and basis; the certification basis page leaves the menu, its page stays', /items: \['snav-plan-auto', 'snav-arp-process'/.test(NAV) && /id="snav-plan-auto"/.test(HTML) && !/id="snav-defs"/.test(HTML) && /id="view-defs"/.test(HTML) && /id="view-plan-auto"/.test(HTML));
    check('it loads after the shared look, the objectives and the lanes; the pins moved', (() => { const i = s => HTML.indexOf(s); return i('plan_autopilot.js?v=2.2') > i('autopilot_ui.js?v=') && i('plan_autopilot.js?v=2.2') > i('objectives_matrix.js?v=') && i('plan_autopilot.js?v=2.2') > i('program_plan.js?v=') && /report_writer\.js\?v=1\.3/.test(HTML); })());
    check('the plan-auto tab is registered with switchTab', /const tabs = \['plan-auto', /.test(fs.readFileSync(path.join(SITE, 'support_modules.js'), 'utf8')));
    check('the Word writer takes a cover (document control, approvals, revision history) and figures in the run of the text, numbered with the rest', /model\.cover && model\.cover\.tables/.test(RW) && /b\.k === 'img'/.test(RW) && /idx\.figures\.push\(b\)/.test(RW));

    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:hl1');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } const ext = path.extname(f); let body = fs.readFileSync(f); if (ext === '.js') body = Buffer.from(mutate(path.basename(f), body.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[ext] || 'application/octet-stream' }, ext === '.html' ? { 'Content-Security-Policy': "script-src 'self' 'unsafe-inline'" } : {})); r.end(body); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
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
            const P = await until(() => window.PROGRAM_PLAN && window.appAMatrixRows && window.getSafetyTarget && window.SLPlanAuto, 20000);
            const pc = SLEnv.get('projectConfig'), txtOf = bl => bl.map(b => b.k === 'p' ? b.text : b.k === 'h' ? b.text : b.k === 'table' ? b.caption + ' ' + JSON.stringify(b.rows) : b.k === 'fig' ? b.caption + ' ' + b.svg.replace(/<[^>]+>/g, ' ') : '').join('\n');
            switchTab('plan-auto'); await wait(600);
            const v = document.getElementById('view-plan-auto');
            out.cards = { shown: v.style.display !== 'none', keys: [...v.querySelectorAll('[data-placard]')].map(x => x.dataset.placard).join(','), da: !!v.querySelector('[data-pla-da]'), docNo: P.docCtl('sspp').no };
            // speed: a click redraws in well under half a second (it took 3.4 s)
            const T = f => { const t = performance.now(); f(); return performance.now() - t; };
            const tOpen = T(() => P.ui.open('sspp')), tPick = [T(() => P.ui.pick('sspp.org', 'embedded')), T(() => P.ui.pick('sspp.org', 'central')), T(() => P.ui.pick('sspp.org', 'embedded'))].sort((a, b) => a - b)[1];
            out.speed = { open: Math.round(tOpen), pick: Math.round(tPick) };
            // the questions: forward-looking, real objectives and pages, options that cover the permutations
            const all = P.PLANS.reduce((a, p) => a.concat(p.qs), []), objIds = new Set(appAMatrixRows().map(o => o.id));
            out.q = { n: all.length, perPlan: P.PLANS.map(p => p.code + ':' + p.qs.length).join(' '),
                backward: all.filter(q => !/^basis\./.test(q.k) && (/^(Is|Are|Does|Do|Has|Have)\b/.test(q.text) || /\b(is|are) (done|performed)\b/.test(q.text) || !/\bwill\b/i.test(q.text))).map(q => q.k + ': ' + q.text),
                badDa: all.filter(q => q.da.some(id => !objIds.has(id))).map(q => q.k), badTool: all.filter(q => q.tools.some(t => !document.getElementById('view-' + t) && !document.querySelector('[onclick="switchTab(\'' + t + '\')"]'))).map(q => q.k + ':' + q.tools.join('/')),
                fewOpts: all.filter(q => q.opts.length < 2).map(q => q.k), checks: all.filter(q => q.type === 'checks').length, own: all.filter(q => q.opts.some(o => o[0] === 'own')).length, notPlanned: all.filter(q => q.opts.some(o => o[0] === 'none' && /Not planned/.test(o[1]))).length,
                pasa: P.QBY['sspp.pasa'].text, combined: P.QBY['sspp.combined'].opts.map(o => o[0]).join(',') };
            // the certification basis, first, with its follow-ups by basis
            const showsFor = reg => { P.answer('basis.reg', reg); P.forget(); return P.questions('sspp').filter(q => /^basis\./.test(q.k)).map(q => q.k.slice(6)).join(','); };
            out.basisQs = { first: P.BY.sspp.qs.findIndex(q => q.k === 'basis.reg') <= 3 && P.BY.sspp.secs[1] === 'Certification basis and safety objectives', p25: showsFor('Part 25'), p23: showsFor('Part 23'), p27: showsFor('Part 27'), vtol: showsFor('SC-VTOL'), p33: showsFor('Part 33'), p107: showsFor('Part 107') };
            // the plan's table comes from the same engine: Part 23 level 2, one piston engine, before and after applying
            P.answer('basis.reg', 'Part 23'); P.answer('basis.p23level', '2'); P.answer('basis.p23prop', 'recip-1'); P.answer('basis.p23dal', 'f3061'); P.forget();
            const planT = P.doc('sspp').find(b => b.k === 'table' && b.name === 'targets');
            const regBefore = pc.regulation, infoLines = P.wires('sspp').filter(x => x.info).length;
            const res0 = P.apply('sspp');
            const eng = ['Catastrophic', 'Hazardous', 'Major', 'Minor'].map(s => { const t = getSafetyTarget(s); return s + ':' + t.prob + ':' + t.dal; }).join('|');
            P.forget(); const planT2 = P.doc('sspp').find(b => b.k === 'table' && b.name === 'targets');
            const planStr = rows => rows.slice(0, 4).map(r => r.Classification + ':' + r['Function DAL']).join('|');
            out.basis = { before: regBefore, after: pc.regulation, cls: pc.part23Class, sel: (document.getElementById('proj-regulation') || {}).value, infoLines, errs: res0.errs, planBefore: planStr(planT.rows), planAfter: planStr(planT2.rows), engDal: eng.split('|').map(x => x.split(':')[0] + ':' + x.split(':')[2]).join('|'), probs: planT2.rows.slice(0, 4).map(r => r['Probability target']).join('|'), engProbs: eng, sevdefs: !!P.doc('sspp').find(b => b.k === 'table' && b.name === 'sevdefs') };
            P.answer('basis.reg', 'Part 25'); P.apply('sspp'); P.forget();
            out.basis.back = pc.regulation;
            // picks that do not work together
            P.answer('sspp.combined', ['mac', 'coffe']); const mm1 = P.mismatches('sspp').map(x => x.k);
            P.answer('sspp.combined', ['interdep', 'mac', 'coffe']); const mm2 = P.mismatches('sspp').map(x => x.k);
            P.answer('sspp.cma', 'none'); P.answer('sspp.dal', 'indep'); const mm3 = P.mismatches('sspp').map(x => x.k);
            P.answer('sspp.cma', 'yes'); const mm4 = P.mismatches('sspp').map(x => x.k);
            out.mm = { macNoInterdep: mm1.includes('sspp.combined'), fixed: !mm2.includes('sspp.combined'), dalNoCma: mm3.includes('sspp.dal'), cleared: !mm4.includes('sspp.dal'), slot: P.wires('sspp').find(x => /Failure conditions across systems/.test(x.what)).after };
            // our own way, and not planned with its reason
            P.answer('sspp.afha', 'own'); const gapOwn = !P.complete(P.QBY['sspp.afha']); P.setOwn('sspp.afha', 'The FHA will follow the company procedure SP-12, function by function.'); const ownIn = /company procedure SP-12/.test(txtOf(P.doc('sspp')));
            P.answer('sspp.pasa', 'none'); const gapWhy = !P.complete(P.QBY['sspp.pasa']); P.setWhy('sspp.pasa', 'the architecture is carried over from a certified aircraft'); const whyIn = /Reason: the architecture is carried over/.test(txtOf(P.doc('sspp')));
            out.own = { gapOwn, ownIn, gapWhy, whyIn, funnel: /Not planned: tailored out/.test(txtOf(P.doc('sspp').filter(b => b.k === 'fig'))) };
            P.answer('sspp.pasa', 'yes');
            // applying: an expected lane off with a signed entry naming the answer and reason; methods, slots and tools
            const zsaKept = (SLEnv.get('zsaData') || []).length;
            P.answer('sspp.zsa', 'none'); P.setWhy('sspp.zsa', 'no installation zones change on this program'); P.answer('sspp.pssa', ['fta', 'markov']); P.answer('sspp.rmtool', 'jama'); P.answer('sspp.indep', 'cma');
            const zsaStill = PROGRAM_PLAN.laneOn('zsa');
            if (pc.toolchain && pc.toolchain.rm) { pc.toolchain.rm.by = 'Someone'; pc.toolchain.rm.at = '2026-01-01'; }
            const res = P.apply('sspp'); const tail = PROGRAM_PLAN.tailoring().filter(t => t.laneId === 'zsa' && !t.cleared).pop();
            out.apply = { zsaStill, errs: res.errs, zsaOn: PROGRAM_PLAN.laneOn('zsa'), zsaKept: (SLEnv.get('zsaData') || []).length === zsaKept, tail: tail && tail.rationale, markov: PROGRAM_PLAN.laneOn('markov'), quant: pc.safetyProgramPlan.slots.quantification, combined: pc.safetyProgramPlan.slots.combinedEffects, indep: pc.safetyProgramPlan.slots.independence, rm: pc.toolchain && pc.toolchain.rm.tool, rmSig: pc.toolchain && pc.toolchain.rm.by, left: P.wires('sspp').filter(x => !x.same).length };
            P.answer('sspp.zsa', 'cad'); P.apply('sspp'); out.apply.back = PROGRAM_PLAN.laneOn('zsa');
            // a plan is a plan: no counts; adding work changes the status report, never the plan
            const snap = () => P.PLANS.map(p => txtOf(P.doc(p.key))).join('\n#\n'), rep = () => txtOf(P.statusDoc('sspp'));
            P.forget(); const p0 = snap(), r0 = rep();
            const fha = SLEnv.get('acFhaData'); fha.push(Object.assign({}, fha[0], { internalId: 999901, fcId: 'FC-T1', fcDesc: 'Test-only failure condition' }));
            const ft = SLEnv.get('ftaPages'); ft.push({ id: 'pla-test-tree', name: 'Test tree', root: { id: 'r', type: 'or', label: 'T', children: [] } });
            P.forget(); const p1 = snap(), r1 = rep();
            fha.pop(); ft.pop(); P.forget();
            out.status = { planSame: p0 === p1, reportMoved: r0 !== r1, noCounts: !/\b\d+ (aircraft |system )?failure conditions\b|\b\d+ fault trees\b|\b\d+ rows\b|DAL A\)|answered|\d+ of \d+/.test(p0), reportHas: /\d+ aircraft failure conditions/.test(r0) && /\d+ fault trees/.test(r0) };
            // the front matter: cover with document control, approvals and history; contents; lists; numbered captions with a lead each
            P.ui.open('sspp'); await wait(100);
            const pv = () => document.querySelector('[data-pladoc]'), bl = P.doc('sspp'), tbs = bl.filter(b => b.k === 'table'), fgs = bl.filter(b => b.k === 'fig'), hs = bl.filter(b => b.k === 'h');
            const leadOk = bl.every((b, i) => !(b.k === 'table' || b.k === 'fig') || (bl[i - 1] && bl[i - 1].k === 'p' && bl[i - 1].text.indexOf((b.k === 'table' ? 'Table ' : 'Figure ') + b.n) >= 0));
            out.front = { cover: !!pv().querySelector('[data-pla-cover]'), ctl: /Document control/.test(pv().textContent) && /Approvals/.test(pv().textContent) && /Revision history/.test(pv().textContent) && /HL1-SSPP-001/.test(pv().textContent),
                toc: pv().querySelectorAll('[data-pla-toc] .pla-tl a[href^="#pla-plan-h"]').length, heads: hs.length, lot: pv().querySelectorAll('[data-pla-lot]').length, tables: tbs.length, lof: pv().querySelectorAll('[data-pla-lof]').length, figs: fgs.length,
                seq: tbs.every((t, i) => t.n === i + 1) && fgs.every((f, i) => f.n === i + 1), leadOk, standard: ['through the development phases', 'beside the development process', 'levels are assigned', 'plans are made', 'Validation and verification', 'Configuration management', 'certification basis sets'].every(t => fgs.some(f => f.title.indexOf(t) >= 0)), proc: (tbs.find(t => t.name === 'processes') || { rows: [] }).rows.length };
            // revisions: one per issue; the same day replaces that day's
            const a1 = P.issue('sspp', 'First issue'), a2 = P.issue('sspp', 'First issue, corrected'); const d = P.docCtl('sspp');
            const sameDay = d.issues.length === 1 && a2.rev === 'A' && d.issues[0].note === 'First issue, corrected';
            d.issues[0].date = '2026-01-01'; const b1 = P.issue('sspp', 'Updated after review');
            out.rev = { sameDay, next: b1.rev === 'B' && d.issues.length === 2, cover: /Revision history[\s\S]*B[\s\S]*Updated after review/.test(P.fullHtml('sspp', 'plan')) };
            let roleRefused = false; try { P.setDoc('sspp', 'appr', 'Bob Smith'); } catch (e) { roleRefused = /roles/.test(e.message); }
            P.setDoc('sspp', 'appr', 'Chief safety engineer'); out.rev.roles = roleRefused && /Chief safety engineer/.test(P.fullHtml('sspp', 'plan'));
            // the status report view
            P.ui.view('status'); await wait(60); out.report = { view: pv().dataset.plakind === 'status', title: /System Safety Status Report/.test(pv().textContent), dalFig: !!P.statusDoc('sspp').find(b => b.k === 'fig' && /level their severity/.test(b.title)), objFig: !!P.statusDoc('sspp').find(b => b.k === 'fig' && /area by area/.test(b.title)) }; P.ui.view('plan');
            // the HF plan: no human factors work takes the HF Autopilot off the menu, and back
            P.ui.open('hfp'); await wait(60);
            P.ui.pick('hfp.need', 'none'); P.setWhy('hfp.need', 'the flight deck does not change'); P.apply('hfp'); await wait(150);
            const shownNav = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none' && !e.hasAttribute('data-pp-hidden'); };
            out.hf = { off: !PROGRAM_PLAN.laneOn('hfa'), navOff: !shownNav('snav-hfa-auto'), fewQs: P.questions('hfp').length <= 2 };
            P.ui.pick('hfp.need', 'full'); P.apply('hfp'); await wait(150);
            out.hf.on = PROGRAM_PLAN.laneOn('hfa'); out.hf.navOn = shownNav('snav-hfa-auto'); out.hf.steps = !!P.doc('hfp').find(b => b.k === 'fig' && /design cycle/.test(b.title));
            // RAM: targets and growth asked only for a full program
            const n0 = P.questions('ramp').length; P.answer('ramp.need', 'full'); P.forget(); out.ram = { n0, n1: P.questions('ramp').length };
            // every option of every question, alone, and every multi-pick question with all its options: the plan text reads
            const bad = [];
            for (const p of P.PLANS) for (const q of p.qs) {
                const saved = pc.planAuto.answers[q.k];
                const tries = q.opts.map(o => [o[0]]); if (q.type === 'checks') tries.push(q.opts.map(o => o[0]).filter(x => x !== 'none' && x !== 'none0'));
                for (const t of tries) { try { P.answer(q.k, t); P.forget(); const tx = txtOf(P.doc(p.key)); if (/undefined|NaN|\[object/.test(tx)) bad.push(q.k + '=' + t.join('+')); } catch (e) { bad.push(q.k + '=' + t.join('+') + ': ' + e.message); } }
                if (saved) P.answer(q.k, saved.split('|')); else P.answer(q.k, '');
            }
            out.perm = { bad: bad.slice(0, 8), n: bad.length };
            // v2.1: explanations on every choice; "Not planned" excludes the others; the jump; clickable diagrams; the
            // program's state on demand only; inputs, outputs and exchanges; the outputs to accept
            out.ex = { noIntro: all.filter(q => !(P.EX[q.k] && P.EX[q.k].q && P.EX[q.k].q.length >= 80)).map(q => q.k), noOpt: all.reduce((a, q) => a.concat(q.opts.filter(o => o[0] !== 'own' && !(P.EX[q.k] && P.EX[q.k].o && P.EX[q.k].o[o[0]])).map(o => q.k + ':' + o[0])), []), cards: 0, shownEx: false };
            P.ui.open('sspp'); await wait(60);
            out.ex.cards = document.querySelectorAll('[data-plaopt]').length; out.ex.shownEx = !!document.querySelector('[data-plaqbox="sspp.kind"] .pla-qx') && /Nothing is carried over/.test((document.querySelector('[data-plaopt="sspp.kind|new"]') || {}).textContent || '');
            // every answer card in every plan: the box sits at the same place on the left, the text fills the card
            out.align = { n: 0, offs: [], bad: [] };
            for (const pk of ['sspp', 'hfp', 'ramp']) { P.ui.open(pk); await wait(60);
                document.querySelectorAll('[data-plaopt]').forEach(b => { const mk = b.querySelector('.pla-mk'), ob = b.querySelector('.pla-ob'); if (!mk || !ob || !b.offsetWidth) return; const br = b.getBoundingClientRect(), off = Math.round(mk.getBoundingClientRect().left - br.left), gapR = Math.round(br.right - ob.getBoundingClientRect().right); out.align.n++; if (out.align.offs.indexOf(off) < 0) out.align.offs.push(off); if (off > 20 || gapR > 20) out.align.bad.push(b.dataset.plaopt + ' box@' + off + ' right gap ' + gapR); }); }
            P.ui.open('sspp'); await wait(60);
            // follow-ups indented under the question they follow from; everything else flush
            P.ui.open('sspp'); P.ui.pick('basis.reg', 'Part 23'); P.ui.pick('basis.p23prop', 'other'); await wait(80);
            const dep = k => { const e = document.querySelector('[data-plaqbox="' + k + '"]'); return e ? [+e.dataset.pladepth, Math.round(e.getBoundingClientRect().left)] : null; };
            out.indent = { reg: dep('basis.reg'), lvl: dep('basis.p23level'), man: dep('basis.p23manual'), spec: dep('basis.special'), kind: dep('sspp.kind') };
            // dark mode: a dark plan page with dark figures; Word and print stay light; no hatched fields
            document.body.classList.add('theme-dark'); await wait(150);
            const pvd = document.querySelector('[data-pladoc]'), thd = pvd.querySelector('.pla-dt th'), svgd = pvd.querySelector('.pla-fig svg');
            const lum = c => { const m = String(c).match(/\d+/g) || [255, 255, 255]; return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]); };
            out.dark = { bg: lum(getComputedStyle(pvd).backgroundColor), ink: lum(getComputedStyle(pvd).color), th: lum(getComputedStyle(thd).backgroundColor), thInk: lum(getComputedStyle(thd).color), h: lum(getComputedStyle(pvd.querySelector('h3')).color),
                figDark: !!svgd && /<rect width="100%" height="100%" fill="#15181E"/.test(svgd.outerHTML), wordLight: P.model('sspp', 'plan').blocks.filter(b => b.k === 'img').every(b => /<rect width="100%" height="100%" fill="#ffffff"/.test(b.svg)) && !/#15181E/.test(JSON.stringify(P.model('sspp', 'plan'))),
                printLight: !/#15181E/.test(P.fullHtml('sspp', 'plan')), sel: [...document.querySelectorAll('.pla-doc select')].every(x => getComputedStyle(x).backgroundRepeat === 'no-repeat') };
            document.body.classList.remove('theme-dark'); await wait(150);
            out.dark.backLight = /<rect width="100%" height="100%" fill="#ffffff"/.test(document.querySelector('[data-pladoc] .pla-fig svg').outerHTML);
            P.ui.pick('basis.reg', 'Part 25'); await wait(60);
            // inputs and outputs in every plan, in words and pictures, with the HF and RAM work switched on
            const keep = JSON.parse(JSON.stringify(pc.planAuto.answers));
            P.answer('hfp.need', 'full'); P.answer('hfp.crew', 'two'); P.answer('hfp.feed', 'events'); P.answer('ramp.need', 'full'); P.answer('ramp.alloc', 'yes'); P.answer('ramp.fracas', 'sl'); P.answer('ramp.msg3', 'msg3'); P.answer('sspp.combined', ['interdep', 'mac']); P.forget();
            const EXT = ['design', 'program', 'basis', 'verification', 'authority', 'aircraft maker', 'items', 'msg3', 'sources', 'all'], AS = P.assessments(), known = id => EXT.includes(id) || AS.some(a => a.id === id);
            out.io2 = {};
            for (const k of ['sspp', 'hfp', 'ramp']) {
                const L = AS.filter(a => a.plan === k), bl = P.doc(k), prose = bl.filter(b => b.io), figs = bl.filter(b => b.k === 'fig' && /^io\d/.test(b.name)), arrows = figs.reduce((t, f) => t + (f.svg.match(/data-io="(in|out)"/g) || []).length, 0);
                out.io2[k] = { n: L.length, empty: L.filter(a => !a.inputs.length || !a.outputs.length || !a.does).map(a => a.id), prose: prose.length, proseIds: prose.map(b => b.io).join() === L.map(a => a.id).join(), figs: figs.length, arrows, want: L.reduce((t, a) => t + a.inputs.length + a.outputs.length, 0),
                    unknown: L.reduce((acc, a) => acc.concat(a.inputs.filter(i => !known(i[1])).map(i => a.id + '<-' + i[1]), a.outputs.reduce((x, o) => x.concat(o.to.filter(t => !known(t)).map(t => a.id + '->' + t)), [])), []),
                    tables: ['io', 'exchanges'].every(n => bl.some(b => b.k === 'table' && b.name === n)), proseNamesInputs: prose.every((b, i) => L[i].inputs.every(x => b.text.toLowerCase().indexOf(x[0].toLowerCase().slice(0, 18)) >= 0)) };
            }
            const pssaIn = JSON.stringify((AS.find(a => a.id === 'pssa') || {}).inputs), ssaIn = JSON.stringify((AS.find(a => a.id === 'ssa') || {}).inputs);
            out.cross = { hfToPssa: /hf-credit/.test(pssaIn), hfToSsa: /hf-credit/.test(ssaIn), ramToPssa: /ram-pred/.test(pssaIn), fracasToSsa: /ram-fracas/.test(ssaIn), ccmrToMsg3: (AS.find(a => a.id === 'ccmr') || { outputs: [{ to: ['ram-msg3'] }] }).outputs[0].to.includes('ram-msg3'), hfNamed: /\(SSPP\)/.test(JSON.stringify(P.doc('hfp'))) };
            P.answer('hfp.need', 'none'); P.setWhy('hfp.need', 'no flight deck change'); P.forget();
            out.cross.hfGone = !P.assessments().some(a => a.plan === 'hfp') && !/hf-credit/.test(JSON.stringify(P.assessments().find(a => a.id === 'pssa').inputs));
            Object.keys(pc.planAuto.answers).forEach(k => { if (!(k in keep)) delete pc.planAuto.answers[k]; }); Object.assign(pc.planAuto.answers, keep); P.forget();
            P.ui.open('sspp'); await wait(60);
            P.answer('sspp.fmea', ['ffmea', 'fmes']); P.toggle('sspp.fmea', 'none'); const ex1 = pc.planAuto.answers['sspp.fmea']; P.toggle('sspp.fmea', 'ppfmea'); const ex2 = pc.planAuto.answers['sspp.fmea'];
            let ex3 = false; try { P.answer('sspp.fmea', ['none', 'ffmea']); } catch (e) { ex3 = /cannot be picked with other answers/.test(e.message); }
            out.excl = { ex1, ex2, ex3, noBad: !P.mismatches('sspp').some(m => m.k === 'sspp.fmea') };
            P.ui.pick('sspp.keep', 'company'); await wait(60);
            const pvj = document.querySelector('[data-pladoc]'), hit = pvj && pvj.querySelector('[data-plap="sspp.keep"]');
            out.jump = { flashed: !!hit && hit.classList.contains('pla-flash'), scrolled: pvj && pvj.scrollTop > 200, link: !!document.querySelector('[data-plaqbox="sspp.keep"] a[onclick*="ui.jump"]') };
            P.ui.node('pssa'); await wait(60);
            const np = document.querySelector('[data-pla-node="pssa"]');
            out.nodeClick = { panel: !!np, inputs: !!np && /Inputs it needs/.test(np.textContent) && /System failure conditions/.test(np.textContent), outputs: !!np && /Outputs it must produce/.test(np.textContent) && /Accepted when/.test(np.textContent), live: !!np && /Where it stands now: \d+ fault trees/.test(np.textContent), open: !!np && /Open Fault trees/.test(np.textContent), clickable: document.querySelectorAll('[data-pladoc] .pla-node[data-node]').length };
            P.ui.node(null);
            const badge = () => /<rect[^>]*fill="#101216"(\/>|><\/rect>)<text[^>]*>\d+ (aircraft failure conditions|fault trees)/.test(document.querySelector('[data-pladoc]').innerHTML);
            const lb0 = badge(); P.ui.live(); await wait(60); const lb1 = badge(); const wordModel = JSON.stringify(P.model('sspp', 'plan')); const printHtml = P.fullHtml('sspp', 'plan'); P.ui.live(); await wait(30);
            out.live = { off: !lb0, on: lb1, notInWord: !/\d+ fault trees|\d+ aircraft failure conditions/.test(wordModel), notInPrint: !/\d+ fault trees|\d+ aircraft failure conditions/.test(printHtml), after: !badge() };
            const d1 = P.doc('sspp'), io = d1.find(b => b.k === 'table' && b.name === 'io'), exch = d1.find(b => b.k === 'table' && b.name === 'exchanges'), outsT = d1.find(b => b.k === 'table' && b.name === 'outputs');
            const nodesKnown = P.exchanges().every(x => P.assessments().some(a => a.id === x.from));
            out.io = { io: io && io.rows.length, afhaIn: io && /aircraft functions \(Design and development\)/i.test(JSON.stringify(io.rows)), sppOut: io && /safety objectives/.test(JSON.stringify(io.rows.find(r => /Program Plan/.test(r.Assessment)) || {})), exch: exch && exch.rows.length, nodesKnown, outs: outsT && outsT.rows.length, blank: outsT && outsT.rows.every(r => r.Signature === '' && r.Date === ''), last: d1.filter(b => b.k === 'h').slice(-2).map(b => b.text).join(' | ') };
            P.answer('sspp.pasa', 'yes'); P.answer('sspp.combined', ['interdep', 'mac']); const withMac = P.outputsOf('sspp').some(o => o.id === 'mfs.mac'); P.answer('sspp.pasa', 'none'); P.setWhy('sspp.pasa', 'carried over'); const noPasa = !P.outputsOf('sspp').some(o => /^pasa\./.test(o.id)) && JSON.stringify(P.assessments().find(a => a.id === 'sfha').inputs).indexOf('"afha"') >= 0; P.answer('sspp.pasa', 'yes');
            out.io.follows = withMac && noPasa;
            // accepting an output; a change reopens it; the plan never changes
            const planBefore = txtOf(P.doc('sspp'));
            P.ui.accept('afha.fc'); await wait(30); const ac1 = P.acceptance('sspp').find(o => o.id === 'afha.fc').state;
            const fha2 = SLEnv.get('acFhaData'); fha2.push(Object.assign({}, fha2[0], { internalId: 999902, fcId: 'FC-T2', fcDesc: 'Another test-only failure condition' })); P.forget();
            const ac2 = P.acceptance('sspp').find(o => o.id === 'afha.fc').state; const inReport = /Reopened/.test(txtOf(P.statusDoc('sspp'))); fha2.pop(); P.forget();
            const ac3 = P.acceptance('sspp').find(o => o.id === 'afha.fc').state;
            out.accept = { a1: ac1, a2: ac2, a3: ac3, inReport, planSame: txtOf(P.doc('sspp')) === planBefore, box: !!document.querySelector('[data-pla-accept] [data-pla-out="afha.fc"]') };
            P.ui.unaccept('afha.fc');
            // the Word files: plan and report, with the figures in the text
            try { const lib = await _loadDocxLib(); const m = P.model('sspp', 'plan'); const imgs = m.blocks.filter(b => b.k === 'img'); for (const b of imgs) b.dataUrl = await SLFtaPrint.png({ svg: b.svg, w: b.w, h: b.h }, 2); const blob = await SLReportWriter.docx(m, lib); const blob2 = await SLReportWriter.docx(P.model('sspp', 'status'), lib); out.word = { plan: blob.size, imgs: imgs.length, cover: !!m.cover && m.cover.tables.length === 3, report: blob2.size }; } catch (e) { out.word = 'error ' + e.message; }
            out.saved = JSON.parse(JSON.stringify(pc.planAuto)).answers['sspp.pssa'];
            return out;
        }, demo.data), 300000, 'the Plan Autopilot');
        check('every answer card lines up: the box at the same spot on the left and the text filling the card, however short the explanation (7 Nov: "why are these not lined up")', r.align.n >= 100 && r.align.offs.length === 1 && !r.align.bad.length, JSON.stringify({ n: r.align.n, offs: r.align.offs, bad: r.align.bad.slice(0, 6) }));
        check('follow-up questions sit indented under the question they follow from, one step per level; the rest stay flush (7 Nov: "show indentations when needed")', r.indent.reg && r.indent.reg[0] === 0 && r.indent.lvl[0] === 1 && r.indent.man[0] === 2 && r.indent.spec[0] === 0 && r.indent.lvl[1] > r.indent.reg[1] && r.indent.man[1] > r.indent.lvl[1] && r.indent.spec[1] === r.indent.reg[1] && r.indent.kind[1] === r.indent.reg[1], JSON.stringify(r.indent));
        check('dark mode: a dark plan page (text, headings, table headers) with the figures drawn dark; Word and print stay light; the role fields are plain (7 Nov: "It looks so weird in dark mode")', r.dark.bg < 60 && r.dark.ink > 180 && r.dark.h > 180 && r.dark.th < 80 && r.dark.thInk > 180 && r.dark.figDark && r.dark.wordLight && r.dark.printLight && r.dark.sel && r.dark.backLight, JSON.stringify(r.dark));
        check('every assessment in all three plans has what it does, its inputs and its outputs, in words (one paragraph each) and in pictures (one arrow for every input and output), with the reference tables; nothing points nowhere', ['sspp', 'hfp', 'ramp'].every(k => { const x = r.io2[k]; return x.n >= (k === 'sspp' ? 12 : 4) && !x.empty.length && x.prose === x.n && x.proseIds && x.figs >= 1 && x.arrows === x.want && !x.unknown.length && x.tables && x.proseNamesInputs; }), JSON.stringify(r.io2));
        check('the plans feed each other: HF crew actions into the PSSAs and SSAs, RAM rates into the PSSAs, unexpected failures into the SSAs, CMRs into scheduled maintenance; work from another plan says which; no HF program takes it all out', Object.values(r.cross).every(Boolean), JSON.stringify(r.cross));
        check('the page: three plan cards (SSPP, HFP, RAMP), each with its document number', r.cards.shown && r.cards.keys === 'sspp,hfp,ramp' && r.cards.da && r.cards.docNo === 'HL1-SSPP-001', JSON.stringify(r.cards));
        check('fast: opening a plan and picking an answer each redraw in under half a second (3.4 s before)', r.speed.open < 500 && r.speed.pick < 500, JSON.stringify(r.speed));
        check('every question asks what the program will do (the plan comes first), and names real objectives and pages', !r.q.backward.length && !r.q.badDa.length && !r.q.badTool.length && !r.q.fewOpts.length && /^Will a preliminary aircraft safety assessment \(PASA\) be performed\?$/.test(r.q.pasa), JSON.stringify(r.q));
        check('the options cover the permutations: pick-several questions, our own way, not planned with a reason; interdependence, MAC and CoFFE for multi-system failure conditions', r.q.checks >= 15 && r.q.own >= 50 && r.q.notPlanned >= 8 && /^interdep,mac,coffe/.test(r.q.combined) && r.q.n >= 75, JSON.stringify(r.q));
        check('the certification basis is the second section of the SSPP; its follow-up questions follow the basis (Part 23 level, propulsion and DAL method; Part 27 class; SC-VTOL category; no flight duration for engines or drones)', r.basisQs.first && /p23level,p23prop,p23dal/.test(r.basisQs.p23) && /p27/.test(r.basisQs.p27) && !/p23/.test(r.basisQs.p27) && /scvtol/.test(r.basisQs.vtol) && /mission/.test(r.basisQs.p25) && !/mission/.test(r.basisQs.p33) && !/mission/.test(r.basisQs.p107), JSON.stringify(r.basisQs));
        check('the plan\'s classifications, targets and DALs come from the tool\'s own engine, before and after applying; the basis is shown before it applies and written to the same place the basis page writes', r.basis.before !== 'Part 23' && r.basis.after === 'Part 23' && r.basis.sel === 'Part 23' && !!r.basis.cls && r.basis.planBefore === r.basis.planAfter && r.basis.planAfter === r.basis.engDal && r.basis.infoLines >= 1 && !r.basis.errs.length && r.basis.sevdefs && r.basis.back === 'Part 25', JSON.stringify(r.basis));
        check('picks that do not work together are caught: MAC or CoFFE without the interdependence analysis; a lowered DAL with no CMA; and they clear when fixed', r.mm.macNoInterdep && r.mm.fixed && r.mm.dalNoCma && r.mm.cleared && /Hybrid/.test(r.mm.slot), JSON.stringify(r.mm));
        check('our own way is a gap until it is written, then goes into the plan; "not planned" needs its reason, which goes into the plan and the funnel diagram', r.own.gapOwn && r.own.ownIn && r.own.gapWhy && r.own.whyIn && r.own.funnel, JSON.stringify(r.own));
        check('applying: nothing set before Apply; ZSA out with a signed entry naming the answer and its reason, data kept; Markov in, the method slots and the requirements tool set (its old signature cleared); and back', r.apply.zsaStill && !r.apply.errs.length && !r.apply.zsaOn && r.apply.zsaKept && /System Safety Program Plan says: Not planned\. Reason: no installation zones change/.test(r.apply.tail || '') && r.apply.markov && r.apply.quant === 1 && r.apply.combined === 2 && r.apply.indep === 1 && r.apply.rm === 'jama' && !r.apply.rmSig && r.apply.left === 0 && r.apply.back, JSON.stringify(r.apply));
        check('a plan is a plan: no counts or status in any of the three; adding a failure condition and a fault tree changes the status report, never the plan', r.status.planSame && r.status.reportMoved && r.status.noCounts && r.status.reportHas, JSON.stringify(r.status));
        check('a cover with document control, approvals and revision history; a table of contents, list of tables and list of figures; numbered captions, each introduced before it appears; the process definitions; the standard-layout diagrams', r.front.cover && r.front.ctl && r.front.toc === r.front.heads && r.front.lot === r.front.tables && r.front.lof === r.front.figs && r.front.figs >= 8 && r.front.seq && r.front.leadOk && r.front.standard && r.front.proc >= 12, JSON.stringify(r.front));
        check('revisions: one per issue, a same-day issue replaces that day\'s; a later issue is the next letter and goes into the history; approvals by role only', r.rev.sameDay && r.rev.next && r.rev.cover && r.rev.roles, JSON.stringify(r.rev));
        check('the status report is its own document, with the counts and the charts the plan does not carry', r.report.view && r.report.title && r.report.dalFig && r.report.objFig, JSON.stringify(r.report));
        check('the HF plan: no human factors work (with its reason) takes the HF Autopilot off the menu, and a full program puts it back with the ten steps', r.hf.off && r.hf.navOff && r.hf.fewQs && r.hf.on && r.hf.navOn && r.hf.steps, JSON.stringify(r.hf));
        check('the RAM plan asks about targets, growth and life data only for a full reliability program', r.ram.n1 === r.ram.n0 + 3, JSON.stringify(r.ram));
        check('every option of every question, and every pick-several question with all its picks, writes plan text that reads (no "undefined")', r.perm.n === 0, JSON.stringify(r.perm));
        check('a proper explanation for every question and every answer, shown on the answer cards', !r.ex.noIntro.length && !r.ex.noOpt.length && r.ex.cards >= 150 && r.ex.shownEx, JSON.stringify(r.ex).slice(0, 600));
        check('"Not planned" excludes the other answers: picking it clears them, picking another clears it, and the two together are refused', r.excl.ex1 === 'none' && r.excl.ex2 === 'ppfmea' && r.excl.ex3 && r.excl.noBad, JSON.stringify(r.excl));
        check('picking an answer jumps the plan preview to the sentence it wrote and lights it up; each answered question links to it', r.jump.flashed && r.jump.scrolled && r.jump.link, JSON.stringify(r.jump));
        check('the diagrams are clickable: a box opens what that assessment needs and produces, where it stands, and its page', r.nodeClick.panel && r.nodeClick.inputs && r.nodeClick.outputs && r.nodeClick.live && r.nodeClick.open && r.nodeClick.clickable >= 20, JSON.stringify(r.nodeClick));
        check('where the program stands shows on the diagrams only when asked, and never in the Word file or the printout', r.live.off && r.live.on && r.live.notInWord && r.live.notInPrint && r.live.after, JSON.stringify(r.live));
        check('the inputs and outputs of each assessment and the data exchanged between them are defined, follow the answers (MAC trees; no PASA), and end in the outputs to accept with blank signature columns', r.io.io >= 8 && r.io.afhaIn && r.io.sppOut && r.io.exch >= 15 && r.io.nodesKnown && r.io.outs >= 10 && r.io.blank && /Outputs and acceptance/.test(r.io.last) && r.io.follows, JSON.stringify(r.io));
        check('an output is accepted in Safety Lab; a change to it reopens it (in the status report too); the plan never changes', r.accept.a1 === 'accepted' && r.accept.a2 === 'reopened' && r.accept.a3 === 'accepted' && r.accept.inReport && r.accept.planSame && r.accept.box, JSON.stringify(r.accept));
        check('the plan and its status report write to Word: the cover\'s three tables and the figures in the text', typeof r.word === 'object' && r.word.plan > 40000 && r.word.imgs >= 8 && r.word.cover && r.word.report > 8000, JSON.stringify(r.word));
        check('the answers are in the project data', r.saved === 'fta|markov', r.saved);
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } catch (e) { check('the app part ran', false, e.message); }
    finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
