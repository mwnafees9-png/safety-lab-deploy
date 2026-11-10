/* regression_report_ai_gate_20261110.test.js: an optional AI draft on every report, only once its questions are answered.
 *
 * Waqas, 10 Nov 2026: "optional AI draft on top of every report"; "AI doesnt draft till people have answered the
 * questions. No I mean the SSPP HFP and RAMP". Rebuild: cca_report.js 1.9 asks each report (spec.aiReady) whether the
 * questions for a part are all answered before the AI may draft it, and says which are left; the ZSA, PRA and CMA say so
 * per zone, risk and report. plan_autopilot.js 2.4 gives every section of the SSPP, HF plan and RAM plan a part "How this
 * will be done", written by the engineer or drafted with the AI once the section's questions are answered, and in the plan
 * only when a person accepts it (never in the plan as an AI draft, never in Word as a control).
 *   1  plans: a section with questions left refuses the AI and says which questions are left
 *   2  plans: the preview shows the part with "Draft with AI" switched off and the questions still to answer
 *   3  plans: once the section's questions are answered the AI drafts it; the draft is not in the plan until accepted
 *   4  plans: accepted, it is in the plan under its own heading and in the Word model, and the control never is
 *   5  the ZSA: a zone with questions left refuses the AI, its report shows the switched-off button and what is left (said
 *      once per zone, on its first part)
 *   6  the ZSA: answered, the AI drafts the zone's part
 *   7  the PRA and the CMA: a risk and a report with questions left refuse the AI and name what is left
 * MUTATION PROOFS (SL_RAG_MUTATE): nogate (the report frame lets the AI draft with questions left), plannogate (a plan
 *   section lets the AI draft with questions left), autoaccept (a plan draft goes straight into the plan), wordleak (the
 *   control reaches the Word model once the preview has been drawn). Each one must turn this suite red.
 * Run: node tests/regression_report_ai_gate_20261110.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_RAG_MUTATE || '';
function mutate(file, body) {
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing in ' + file + ': ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'nogate' && file === 'cca_report.js') rep("if (typeof spec.aiReady !== 'function') return { ready: true, left: [] };", "return { ready: true, left: [] };");
    if (MUT === 'plannogate' && file === 'plan_autopilot.js') rep("function authLeft(key, sec) { return questions(key)", "function authLeft(key, sec) { return []; return questions(key)");
    if (MUT === 'autoaccept' && file === 'plan_autopilot.js') rep("cur.draft = { text: text, model: (res && res.model) || '', at: now(), flags: flags };", "cur.text = text; cur.draft = { text: text, model: (res && res.model) || '', at: now(), flags: flags };");
    if (MUT === 'wordleak' && file === 'plan_autopilot.js') { rep("blocks: bl.filter(function (b) { return b.k !== 'auth'; }).map(", "blocks: bl.map("); rep("} finally { _previewing = false; LIVE = false;", "} finally { LIVE = false;"); }
    return body;
}
const tick = ms => new Promise(r => setTimeout(r, ms));
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; ').replace(/; upgrade-insecure-requests/, ''); })();
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const pg = await (await browser.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
        const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(3000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        for (let i = 0; i < 60 && !(await pg.evaluate(() => typeof window.loadHL1Demo === 'function' && !!window.SLPlanAuto)); i++) await tick(500);
        await pg.evaluate(() => window.loadHL1Demo());
        for (let i = 0; i < 60 && !(await pg.evaluate(() => !!(window.SLZsaAuto && SLZsaAuto.compute()))); i++) await tick(500);
        await tick(1500);
        // the AI, stubbed: answers with plain paragraphs and records what it was asked
        await pg.evaluate(() => { window.__aiCalls = []; window.SafetyLabAI = window.SafetyLabAI || {}; window.SafetyLabAI.complete = async (req) => { window.__aiCalls.push(req); return { text: 'The program will carry out this part as the answers set out, by the roles named, in the order given.\n\nEach output is checked against its criteria before it counts.', model: 'stub' }; }; });

        // ---- plans ----
        const SEC = 'How the safety program is organized';
        const P1 = await pg.evaluate(async (sec) => {
            const P = SLPlanAuto; const left = P.authLeft('sspp', sec); let err = '';
            if (!left.length) { P.questions('sspp').filter(q => q.sec === sec).forEach(q => { const s = projectConfig.planAuto.answers; delete s[q.k]; }); }
            const left2 = P.authLeft('sspp', sec);
            try { await P.authAi('sspp', sec); } catch (e) { err = e.message; }
            return { left: left2, err, calls: window.__aiCalls.length };
        }, SEC);
        check('1  plans: a section with questions left refuses the AI and says which questions are left', P1.left.length > 0 && /Answer the questions in this section first/.test(P1.err) && P1.err.indexOf(P1.left[0]) >= 0 && P1.calls === 0, JSON.stringify(P1));
        await pg.evaluate(() => { switchTab('plan-auto'); }).catch(() => {});
        await pg.evaluate(() => { SLPlanAuto.ui.open('sspp'); SLPlanAuto.ui.view('plan'); }); await tick(500);
        const P2 = await pg.evaluate((sec) => { const box = document.querySelector('[data-pla-authbox="sspp|' + sec + '"]'); if (!box) return { box: false }; const b = box.querySelector('[data-pla-auth="ai"]'); const n = box.querySelector('[data-pla-aiwait]'); return { box: true, disabled: !!(b && b.disabled), wait: n ? n.textContent : '' }; }, SEC);
        check('2  plans: the preview shows the part with "Draft with AI" switched off and the questions still to answer', P2.box && P2.disabled && /once its questions are answered/.test(P2.wait), JSON.stringify(P2));
        const P3 = await pg.evaluate(async (sec) => {
            const P = SLPlanAuto;
            P.questions('sspp').filter(q => q.sec === sec).forEach(q => { const o = (q.opts || []).find(x => x[0] !== 'own' && x[0] !== 'none' && x[0] !== 'none0') || q.opts[0]; P.answer(q.k, o[0]); });
            // follow-ups the answers opened, answered the same way
            for (let i = 0; i < 3; i++) P.questions('sspp').filter(q => q.sec === sec && !P.complete(q)).forEach(q => { const o = (q.opts || []).find(x => x[0] !== 'own' && x[0] !== 'none' && x[0] !== 'none0') || q.opts[0]; P.answer(q.k, o[0]); });
            const left = P.authLeft('sspp', sec); let d = null, err = '';
            try { d = await P.authAi('sspp', sec); } catch (e) { err = e.message; }
            const inDoc = P.doc('sspp').some(b => b.k === 'p' && /carry out this part as the answers set out/.test(b.text));
            return { left, ok: !!d, err, inDoc, calls: window.__aiCalls.length, sys: window.__aiCalls[0] ? String(window.__aiCalls[0].system).slice(0, 80) : '' };
        }, SEC);
        check('3  plans: answered, the AI drafts the section; the draft is not in the plan until accepted', P3.left.length === 0 && P3.ok && !P3.inDoc && P3.calls === 1, JSON.stringify(P3));
        await pg.evaluate(() => SLPlanAuto.render()); await tick(300);
        await pg.click('[data-pla-authbox="sspp|' + SEC + '"] [data-pla-auth="accept"]').catch(() => {});
        await tick(300);
        const P4 = await pg.evaluate((sec) => {
            const P = SLPlanAuto, d = P.doc('sspp'), i = d.findIndex(b => b.k === 'h' && b.level === 2 && b.text === P.AUTH_TITLE), m = P.model('sspp');
            return { head: i >= 0, para: i >= 0 && d[i + 1] && /carry out this part/.test(d[i + 1].text), auth: P.authOf('sspp', sec), word: m.blocks.some(b => b.k === 'p' && /carry out this part/.test(b.text)), ctl: m.blocks.some(b => b.k === 'auth'), html: !!document.querySelector('.pla-prev h4.pla-dh2') };
        }, SEC);
        check('4  plans: accepted, it is in the plan under its own heading and in the Word model, and the control never is', P4.head && P4.para && P4.auth && P4.auth.source === 'ai' && !P4.auth.draft && P4.word && !P4.ctl && P4.html, JSON.stringify(P4));

        // ---- the ZSA ----
        const Z1 = await pg.evaluate(async () => {
            const res = SLZsaAuto.compute(), z = res.zones.find(x => SLZsaAuto.activeQuestions(x).some(q => !SLZsaAuto.zoneStatus(x).signed) && SLZsaAuto.activeQuestions(x).length);
            const R = SLCcaReport.get('zsa'); let err = '';
            try { await R.authAi(z.code, 'conclusion'); } catch (e) { err = e.message; }
            return { code: z.code, n: SLZsaAuto.activeQuestions(z).length, err, calls: window.__aiCalls.length };
        });
        await pg.evaluate(() => switchTab('zsa')); await tick(800);
        await pg.evaluate(async (code) => { SLCcaReport.get('zsa').setTab(code); await new Promise(r => setTimeout(r, 500)); }, Z1.code); await tick(500);
        const Z1h = await pg.evaluate((code) => { const box = document.querySelector('[data-cc-authbox="' + code + '|conclusion"]'); if (!box) return { box: false }; return { box: true, off: !!box.querySelector('[data-cc-auth="authai-wait"][disabled]'), on: !!box.querySelector('[data-cc-auth="authai"]'), wait: (document.querySelector('[data-cc-aiwait="' + code + '|mitigations"]') || {}).textContent || '', once: document.querySelectorAll('#ccr-host-zsa [data-cc-aiwait^="' + code + '|"]').length }; }, Z1.code);
        check('5  the ZSA: a zone with questions left refuses the AI; its report shows the switched-off button and what is left', /Answer the questions for this part first/.test(Z1.err) && Z1.calls === 1 && Z1h.box && Z1h.off && !Z1h.on && /Still to answer/.test(Z1h.wait) && Z1h.once === 1, JSON.stringify({ Z1, Z1h }));
        const Z2 = await pg.evaluate(async (code) => {
            const z = () => SLZsaAuto.compute().byCode[code];
            for (let i = 0; i < 4; i++) SLZsaAuto.activeQuestions(z()).forEach(q => { if (!SLZsaAuto.zoneStatus(z())) return; const a = q.options[0]; try { SLZsaAuto.answer(q.id, a.id); } catch (_) {} });
            const st = SLZsaAuto.zoneStatus(z()); let d = null, err = '';
            try { d = await SLCcaReport.get('zsa').authAi(code, 'conclusion'); } catch (e) { err = e.message; }
            return { st, ok: !!d, err, calls: window.__aiCalls.length };
        }, Z1.code);
        check('6  the ZSA: answered, the AI drafts the zone\'s part', Z2.st.answered === Z2.st.questions && Z2.ok && Z2.calls === 2, JSON.stringify(Z2));

        // ---- the PRA and the CMA ----
        const PC = await pg.evaluate(async () => {
            const out = {};
            const res = SLPraAuto.compute(), r = res && res.risks.find(x => x.questions.some(q => !(projectConfig.praAuto && projectConfig.praAuto.answers && projectConfig.praAuto.answers[q.id])) || (x.kind === 'ROTOR' && !x.inputsReady));
            if (r) { const sid = r.praId && (typeof praData !== 'undefined') && praData.some(p => p.praId === r.praId) ? r.praId : 'ap:' + r.key; try { await SLCcaReport.get('pra').authAi(sid, 'conclusion'); out.pra = 'drafted'; } catch (e) { out.pra = e.message; } }
            try { await SLCcaReport.get('cma').authAi('aircraft', 'conclusion'); out.cma = 'drafted'; } catch (e) { out.cma = e.message; }
            out.calls = window.__aiCalls.length;
            return out;
        });
        check('7  the PRA and the CMA: a risk and a report with questions left refuse the AI and name what is left', /Answer the questions for this part first, then the AI can draft it\. Still to answer: \S/.test(PC.pra || '') && /Answer the questions for this part first, then the AI can draft it\. Still to answer: \S/.test(PC.cma || '') && PC.calls === 2, JSON.stringify(PC));
        check('7  no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } catch (e) { check('the browser part ran to the end', false, e && e.stack); }
    await browser.close(); srv.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
