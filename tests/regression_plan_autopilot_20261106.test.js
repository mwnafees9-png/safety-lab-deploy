/* regression_plan_autopilot_20261106.test.js: the Plan Autopilot writes the SSPP, the Human Factors Plan and the RAM Plan
 * from questions, with the Sys Lab Planning Autopilot's layout (plan_autopilot.js v1.0).
 *
 * Waqas, 6 Nov 2026: "program planing in safety lab needs to have the same interface as sys lab planing auto-pilot,
 * questions to be in conjunction with DA assurance and the tool linkings, there's a copy of ARP4754 B which has an
 * example of safety program plan I want our program planing to replicate that too"; "in planing I want similar
 * treatment for the HF plan and RAM plan too".
 * Checks:
 *   - the page: first under Plan and basis; three plan cards; a plan page with the questions grouped by the section
 *     each answer is written into, what it sets in Safety Lab (now and after), the objectives covered, the gaps, and the
 *     live preview
 *   - the SSPP's first five sections follow the order of the ARP4754B Appendix B example plan (scope, organization,
 *     responsibilities, the assessments and methods, common cause)
 *   - every question names objectives that exist on the Objectives matrix and pages that exist in the app
 *   - a made-up answer is refused; an answer sets nothing until the plan's settings are applied; applying turns lanes
 *     on and off (an expected lane holding work is turned off with a signed tailoring entry, its data kept), sets the
 *     method slots and the declared tools (the signature cleared)
 *   - the HF plan's "no human factors work" takes the HF Autopilot off the menu, and back
 *   - the plan text follows the answers; an unanswered question is "To be decided" and listed; the Word file writes
 * MUTATION PROOFS: SL_PLA_MUTATE=nogate (an answer applies at once) and =nosign (a lane off without its signed entry)
 *   must fail.
 * Run: node tests/regression_plan_autopilot_20261106.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1200) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_PLA_MUTATE || '';
function mutate(file, body) {
    if (file !== 'plan_autopilot.js') return body;
    if (MUT === 'nogate') return body.replace("s.answers[k] = val; s.who[k] = { by: who(), at: now() };", "s.answers[k] = val; s.who[k] = { by: who(), at: now() }; try { (q.set || []).forEach(function (st) { var af = st.after(val); if (af != null && af !== st.now()) st.apply(val, who(), BY[q.plan], q); }); } catch (_) {}");
    if (MUT === 'nosign') return body.replace("PP().setLane(id, on, on ? {} : { rationale: 'The ' + plan.title + ' says: ' + optLabel(q, v) + '.', sig: by });", "PP().setLane(id, on, {});");
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);

(async () => {
    console.log('regression_plan_autopilot_20261106' + (MUT ? ' [mutation ' + MUT + ']' : ''));
    const SRC = fs.readFileSync(path.join(SITE, 'plan_autopilot.js'), 'utf8');
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const NAV = fs.readFileSync(path.join(SITE, 'nav_areas.js'), 'utf8');
    let okp = true; try { new Function(SRC); } catch (e) { okp = false; }
    check('plan_autopilot.js parses; no eval of any kind (the CSP forbids it); the stores are read through SLEnv', okp && !/new Function|\beval\(/.test(SRC) && /SLEnv/.test(SRC));
    check('the Plan Autopilot is first under Plan and basis; its view and host are in the page', /items: \['snav-plan-auto', 'snav-defs'/.test(NAV) && /id="snav-plan-auto"/.test(HTML) && /id="view-plan-auto"/.test(HTML) && /id="plan-auto-host"/.test(HTML));
    check('it loads after the shared look, the objectives and the lanes', (() => { const i = s => HTML.indexOf(s); return i('plan_autopilot.js?v=1.0') > i('autopilot_ui.js?v=') && i('plan_autopilot.js?v=1.0') > i('objectives_matrix.js?v=') && i('plan_autopilot.js?v=1.0') > i('program_plan.js?v='); })());
    check('the plan-auto tab is registered with switchTab', /const tabs = \['plan-auto', /.test(fs.readFileSync(path.join(SITE, 'support_modules.js'), 'utf8')));

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
            const P = await until(() => window.PROGRAM_PLAN && window.appAMatrixRows && window.SLPlanAuto, 20000);
            const pc = SLEnv.get('projectConfig');
            switchTab('plan-auto'); await wait(700);
            const v = document.getElementById('view-plan-auto');
            out.cards = { shown: v.style.display !== 'none', n: v.querySelectorAll('[data-placard]').length, keys: [...v.querySelectorAll('[data-placard]')].map(x => x.dataset.placard).join(','), da: !!v.querySelector('[data-pla-da]'), menuFirst: (document.querySelector('#sl-areabar .sl-ab-tab, #sl-areabar button, #sl-areabar a') || {}).textContent };
            // the questions name real objectives and real pages
            const objIds = new Set(appAMatrixRows().map(o => o.id));
            const allQ = P.PLANS.reduce((a, p) => a.concat(p.qs), []);
            const badDa = allQ.filter(q => q.da.some(id => !objIds.has(id))).map(q => q.k);
            const badTool = allQ.filter(q => q.tools.some(t => !document.getElementById('view-' + t) && !document.querySelector('[onclick="switchTab(\'' + t + '\')"]'))).map(q => q.k + ':' + q.tools.join('/'));
            out.links = { badDa, badTool, withDa: allQ.filter(q => q.da.length).length, n: allQ.length, perPlan: P.PLANS.map(p => p.code + ':' + p.qs.length).join(' ') };
            out.ssppSecs = P.BY.sspp.secs.slice(0, 5).join(' | ');
            // the plan page
            P.ui.open('sspp'); await wait(300);
            out.page = { qs: v.querySelectorAll('[data-plaqbox]').length, secs: v.querySelectorAll('[data-plasec]').length, wires: !!v.querySelector('[data-pla-wires]'), dacov: !!v.querySelector('[data-pla-dacov]'), gaps: !!v.querySelector('[data-pla-gaps]'), prev: !!v.querySelector('[data-pladoc] h3'), tags: !!v.querySelector('.pla-t.da') && !!v.querySelector('.pla-t.tool') && !!v.querySelector('.pla-t.set') };
            // a made-up answer is refused
            let refused = false; try { P.answer('sspp.zsa', 'maybe'); } catch (e) { refused = /not one of the answers/.test(e.message); }
            let refusedTwo = false; try { P.answer('sspp.zsa', ['cad', 'list']); } catch (e) { refusedTwo = /Pick one/.test(e.message); }
            out.refuse = refused && refusedTwo;
            // nothing is set until applied
            const zsaBefore = (SLEnv.get('zsaData') || []).length, zsaOn0 = PROGRAM_PLAN.laneOn('zsa'), zsaExpected = PROGRAM_PLAN.isExpected('zsa');
            P.ui.pick('sspp.zsa', 'no'); P.ui.pick('sspp.pssa', 'markov'); P.ui.pick('sspp.rmtool', 'jama'); P.ui.pick('sspp.indep', 'cma');
            const w = P.wires('sspp'), wz = w.find(x => /Zonal/.test(x.what));
            out.gate = { zsaOn0, zsaExpected, zsaItems: PROGRAM_PLAN.laneData('zsa'), stillOn: PROGRAM_PLAN.laneOn('zsa'), wire: wz && (wz.now + '>' + wz.after), slot0: (pc.safetyProgramPlan.slots || {}).quantification, apply: P.status('sspp').apply,
                applyBtn: (v.querySelector('[data-pla-wires] button') || {}).textContent };
            const tc = pc.toolchain || {};
            if (tc.rm) { tc.rm.by = 'Someone'; tc.rm.at = '2026-01-01'; }
            const res = P.apply('sspp');
            const tail = PROGRAM_PLAN.tailoring().filter(t => t.laneId === 'zsa' && !t.cleared).pop();
            out.applied = { errs: res.errs, done: res.done.length, zsaOn: PROGRAM_PLAN.laneOn('zsa'), zsaKept: (SLEnv.get('zsaData') || []).length === zsaBefore, tail: tail && tail.rationale, sig: tail && tail.sig,
                markov: PROGRAM_PLAN.laneOn('markov'), slot: pc.safetyProgramPlan.slots.quantification, indepSlot: pc.safetyProgramPlan.slots.independence, ipledger: PROGRAM_PLAN.laneOn('ipledger'),
                rm: pc.toolchain && pc.toolchain.rm.tool, rmSig: pc.toolchain && pc.toolchain.rm.by, after: P.wires('sspp').filter(x => !x.same).length, menuZsa: (document.getElementById('snav-zsa') || {}).style ? getComputedStyle(document.getElementById('snav-zsa')).display : 'none' };
            // the zsa lane back on through the plan
            P.ui.pick('sspp.zsa', 'cad'); P.apply('sspp'); out.zsaBack = PROGRAM_PLAN.laneOn('zsa');
            // checks: several FMEAs
            P.ui.toggle('sspp.fmea', 'ffmea'); P.ui.toggle('sspp.fmea', 'fmes');
            out.checks = { v: pc.planAuto.answers['sspp.fmea'], txt: P.doc('sspp').some(b => b.k === 'p' && /functional FMEAs and a failure modes summary/.test(b.text)) };
            P.ui.toggle('sspp.fmea', 'ffmea'); out.checks.after = pc.planAuto.answers['sspp.fmea'];
            // the plan text follows the answers
            P.ui.pick('sspp.org', 'embedded');
            const d1 = P.doc('sspp'), hs = d1.filter(b => b.k === 'h').map(b => b.text);
            out.doc = { heads: hs.slice(0, 5).join(' | '), org: d1.some(b => b.k === 'p' && /system team does its own system assessments/.test(b.text)), tbd: d1.some(b => b.k === 'p' && /^To be decided: who owns this plan/.test(b.text)), gapsSec: hs.some(h => /To be decided/.test(h)), daTable: (d1.find(b => b.k === 'table' && /Development assurance objectives/.test(b.title)) || { rows: [] }).rows.length, preview: /system team does its own system assessments/.test((v.querySelector('[data-pladoc]') || {}).textContent || '') };
            P.ui.pick('sspp.org', 'central');
            out.doc.changed = P.doc('sspp').some(b => b.k === 'p' && /One aircraft safety group does the safety work/.test(b.text)) && !P.doc('sspp').some(b => b.k === 'p' && /system team does its own system assessments/.test(b.text));
            const cov = P.daCover('sspp'), a34 = cov.find(x => x.id === 'A3-4');
            out.da = { a34how: a34 && a34.how.join('; '), a34tools: a34 && a34.tools.join(','), none: cov.filter(x => !x.qs.length).length };
            // the HF plan takes the HF Autopilot off the menu, and back
            P.ui.open('hfp'); await wait(200);
            P.ui.pick('hfp.need', 'none'); P.apply('hfp'); await wait(200);
            const shownNav = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none' && !e.hasAttribute('data-pp-hidden'); };
            out.hf = { off: !PROGRAM_PLAN.laneOn('hfa'), navOff: !shownNav('snav-hfa-auto') };
            P.ui.pick('hfp.need', 'full'); P.apply('hfp'); await wait(200);
            out.hf.on = PROGRAM_PLAN.laneOn('hfa'); out.hf.navOn = shownNav('snav-hfa-auto');
            out.hf.steps = (P.doc('hfp').find(b => b.k === 'table' && /ten steps/.test(b.title)) || { rows: [] }).rows.length;
            // RAM: a question shown only when it applies
            const n0 = P.questions('ramp').length; P.answer('ramp.need', 'full'); const n1 = P.questions('ramp').length;
            out.ram = { n0, n1 };
            // the diagrams (Waqas: "I want development assurance choices and diagrams"): drawn from the answers
            const figs = k => P.doc(k).filter(b => b.k === 'fig');
            const orgA = figs('sspp').find(f => /organized/.test(f.title)).svg; P.ui.pick('sspp.org', 'supplier'); const orgB = figs('sspp').find(f => /organized/.test(f.title)).svg;
            const dalA = figs('sspp').find(f => /assigned/.test(f.title)).svg; P.ui.pick('sspp.dal', 'indep'); const dalB = figs('sspp').find(f => /assigned/.test(f.title)).svg;
            out.figs = { sspp: figs('sspp').length, hfp: figs('hfp').length, ramp: figs('ramp').length, standalone: ['sspp', 'hfp', 'ramp'].every(k => figs(k).every(f => /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/.test(f.svg) && !/<script/i.test(f.svg) && f.w > 0 && f.h > 0)),
                orgFollows: orgA !== orgB && /supplier/.test(orgB), dalFollows: (t => /lowered only where independence allows it, marked CMA pending/.test(t(dalB)) && !/marked CMA pending/.test(t(dalA)))(x => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')), preview: v.querySelectorAll('[data-pladoc] .pla-fig svg').length,
                lanes: /Left out of the program/.test(figs('sspp').find(f => /development phases/.test(f.title)).svg), methods: /PSSA[\s\S]*Methods: [^<]*Markov/.test(figs('sspp').find(f => /development phases/.test(f.title)).svg), model: figs('sspp').some(f => /beside the development process/.test(f.title) && /Zonal safety/.test(f.svg) && /Jama Connect/.test(f.svg)), standard: ['development phases', 'beside the development process', 'levels are assigned', 'plans are made', 'Validation and verification', 'Configuration management'].every(t => figs('sspp').some(f => f.title.indexOf(t) >= 0)) };
            out.da6 = ['sspp.levels', 'sspp.idal', 'sspp.transition', 'sspp.ccat', 'sspp.toolq', 'sspp.show'].every(k => P.QBY[k] && P.QBY[k].da.length && P.QBY[k].txt);
            // the Word file
            try { const lib = await _loadDocxLib(); const blob = await SLReportWriter.docx(P.model('sspp'), lib); out.word = blob.size; } catch (e) { out.word = 'error ' + e.message; }
            // the answers survive a save and a reload
            out.saved = JSON.parse(JSON.stringify(pc.planAuto)).answers['sspp.pssa'];
            return out;
        }, demo.data), 240000, 'the Plan Autopilot');
        check('the page: three plan cards (SSPP, HFP, RAMP) and the objectives summary', r.cards.shown && r.cards.n === 3 && r.cards.keys === 'sspp,hfp,ramp' && r.cards.da, JSON.stringify(r.cards));
        check('the SSPP follows the order of the ARP4754B Appendix B example plan', r.ssppSecs === 'Scope and purpose | How the safety program is organized | Safety responsibilities | The safety assessment process and its methods | Common cause analyses', r.ssppSecs);
        check('every question names objectives on the Objectives matrix and pages that exist; nearly all name an objective', !r.links.badDa.length && !r.links.badTool.length && r.links.withDa >= r.links.n - 3, JSON.stringify(r.links));
        check('a plan page: questions by section, what it sets (now and after), objectives covered, gaps, the live preview; tags for objectives, pages and settings', r.page.qs >= 25 && r.page.secs >= 7 && r.page.wires && r.page.dacov && r.page.gaps && r.page.prev && r.page.tags, JSON.stringify(r.page));
        check('a made-up answer, or two answers to a one-answer question, is refused', r.refuse);
        check('an answer sets nothing until applied: ZSA still in, shown as In to Out, the slot unchanged, the Apply button counts it', r.gate.zsaOn0 && r.gate.stillOn && r.gate.wire === 'In>Out' && r.gate.slot0 !== 1 && r.gate.apply >= 4 && /Apply [4-9]/.test(r.gate.applyBtn || ''), JSON.stringify(r.gate));
        check('applying: ZSA out with a signed tailoring entry naming the plan answer, its data kept, off the menu', !r.applied.errs.length && !r.applied.zsaOn && r.applied.zsaKept && (!r.gate.zsaExpected || !r.gate.zsaItems || /System Safety Program Plan says: No/.test(r.applied.tail || '')) && r.applied.menuZsa === 'none', JSON.stringify(r.applied) + ' ' + JSON.stringify(r.gate));
        check('applying: Markov lane in and the quantitative method slot set; independence by CMA worksheets takes the ledger out', r.applied.markov && r.applied.slot === 1 && r.applied.indepSlot === 1 && !r.applied.ipledger, JSON.stringify(r.applied));
        check('applying: the declared requirements tool is set and its old signature cleared; nothing left to apply', r.applied.rm === 'jama' && !r.applied.rmSig && r.applied.after === 0, JSON.stringify(r.applied));
        check('the lane comes back when the answer changes', r.zsaBack);
        check('several answers at once (the FMEAs), written into the plan', r.checks.v === 'ffmea|fmes' && r.checks.txt && r.checks.after === 'fmes', JSON.stringify(r.checks));
        check('the plan text follows the answers, in the preview too; unanswered is "To be decided", with a section listing them; the objectives table is filled', r.doc.org && r.doc.tbd && r.doc.gapsSec && r.doc.daTable >= 20 && r.doc.preview && r.doc.changed && /^1\. Scope and purpose \| 2\. How the safety program is organized/.test(r.doc.heads), JSON.stringify(r.doc));
        check('each objective says how the program meets it, from the answers, with the evidence pages', /No|Yes/.test(r.da.a34how || '') && /zsa/.test(r.da.a34tools || '') && /cma/.test(r.da.a34tools || ''), JSON.stringify(r.da));
        check('the HF plan: no human factors work takes the HF Autopilot off the menu, and a full program puts it back; the plan lists the ten HF steps', r.hf.off && r.hf.navOff && r.hf.on && r.hf.navOn && r.hf.steps === 10, JSON.stringify(r.hf));
        check('the RAM plan asks about targets and growth only for a full reliability program', r.ram.n1 === r.ram.n0 + 2, JSON.stringify(r.ram));
        check('the diagrams: nine in the SSPP, six of them in the layout of the ARP4761A and ARP4754B example figures (the funnel through the phases, the process model beside development, DAL assignment, planning, validation and verification, configuration management), three in the HF plan, two in the RAM plan; the methods in each box from the lanes; standalone pictures in the preview', r.figs.sspp === 9 && r.figs.standard && r.figs.methods && r.figs.model && r.figs.hfp === 3 && r.figs.ramp === 2 && r.figs.standalone && r.figs.preview >= 3 && r.figs.lanes, JSON.stringify(r.figs));
        check('the diagrams follow the answers: the organization chart and the DAL flow redraw when the answer changes', r.figs.orgFollows && r.figs.dalFollows, JSON.stringify(r.figs));
        check('the development assurance choices ARP4754B leaves to the program are asked, each tied to its objectives', r.da6);
        check('the plan writes to Word, with its diagrams', typeof r.word === 'number' && r.word > 8000, r.word);
        check('the answers are in the project data', r.saved === 'markov', r.saved);
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } catch (e) { check('the app part ran', false, e.message); }
    finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
