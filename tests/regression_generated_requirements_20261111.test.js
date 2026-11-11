#!/usr/bin/env node
/*
 * Regression: requirements are generated, never typed from a blank box, in the CMA, the PASA and the PSSAs; and after an
 * answer the report goes to the text it wrote while the question answered stays put (11 Nov 2026: cma_autopilot.js 1.7,
 * pasa_autopilot.js 2.3, pssa_autopilot.js 2.3, cca_report.js 2.2).
 *
 * Waqas, 11 Nov 2026: on the CMA's "Raise a requirement" (an empty "The design shall ..." box): "this should be linked to
 *   our auto-req generator"; "the PASA must have the auto req generator in there too similar, it just makes it more fun
 *   experience for the user"; "and I mean PSSAs too"; "generate requirement for this fuction/failure condition". And:
 *   "when you respond to a question in any report or plan, it should automatically take you to that text that was just
 *   added not just jump around".
 * CHECKS (the real app, HL-1 demo; skipped where Playwright is not installed):
 *   [C] CMA: a concern's "Raise a requirement" shows the requirement the tool wrote from the category, the gates and
 *       their inputs, marked as written by the tool; the same inputs give the same words; another category gives
 *       other words; Save files it as the concern's requirement, which AutoReq then generates (generator cma-concern).
 *   [P] PASA: each failure condition has "Generate the requirements for <FC>"; pressing it puts that failure condition's
 *       AutoReq requirements in the registers, says how many, and the button gives way to "all generated"; the function
 *       has its own Generate button.
 *   [S] PSSA: the same, into the system requirements.
 *   [J] after an answer whose text carries another question's id, the report still goes to that subject's text; a
 *       question answered in a long list stays where it was on screen.
 *   [X] pins and headers.
 * MUTATION PROOFS (SL_GENREQ_MUTATE): nodraft, samewords, nogenpasa, nogenpssa, nonear, noanchor. Each turns this red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_generated_requirements_20261111.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.join(__dirname, '..'), SITE = path.join(REPO, 'site');
const MUT = process.env.SL_GENREQ_MUTATE || '';
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 700) : '')); } };
const tick = ms => new Promise(r => setTimeout(r, ms));
function src(file) {
    let s = fs.readFileSync(path.join(SITE, file), 'utf8');
    const rep = (a, b) => { if (s.indexOf(a) < 0) throw new Error('mutation anchor missing in ' + file + ': ' + a.slice(0, 70)); s = s.replace(a, b); };
    if (file === 'cma_autopilot.js') {
        if (MUT === 'nodraft') rep('draft: { text: reqDraft(r, cc) }, fields:', 'draft: {}, fields:');
        if (MUT === 'samewords') rep("var m = /^questionnaire (.+)$/.exec(S(cc.from)), cat = m ? catPlain(m[1]).name : '';", "var m = null, cat = 'a category';");
    }
    if (file === 'pasa_autopilot.js' && MUT === 'nogenpasa') rep("leftFc(gr) + genCard(fnId, gr) + '</div>'", "leftFc(gr) + '</div>'");
    if (file === 'pssa_autopilot.js' && MUT === 'nogenpssa') rep("leftFc(sy, gr) + genCard(sy, key, gr) + '</div>'", "leftFc(sy, gr) + '</div>'");
    if (file === 'cca_report.js') {
        if (MUT === 'nonear') rep("if (!els.length && !/^sec:/.test(target)) {", "if (false) {");
        if (MUT === 'noanchor') rep("var a = _anchor; if (!a || Date.now() - a.at > 2500 || typeof document === 'undefined') return;", 'return;');
    }
    return s;
}

(async function main() {
    const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('[X] pins: cma_autopilot.js 1.7, pasa_autopilot.js 2.3, pssa_autopilot.js 2.3, cca_report.js 2.2; headers the same', ['cma_autopilot.js?v=1.7"', 'pasa_autopilot.js?v=2.3"', 'pssa_autopilot.js?v=2.3"', 'cca_report.js?v=2.2"'].every(x => html.indexOf(x) > 0) && /SLCmaAuto v1\.7/.test(fs.readFileSync(path.join(SITE, 'cma_autopilot.js'), 'utf8').slice(0, 200)) && /SLCcaReport v2\.2/.test(fs.readFileSync(path.join(SITE, 'cca_report.js'), 'utf8').slice(0, 200)));
    const EM = String.fromCharCode(0x2014);
    check('[X] no em dash in this test', fs.readFileSync(__filename, 'utf8').indexOf(EM) < 0);

    let pw = null; try { pw = require('playwright'); } catch (_) {}
    if (!pw) { console.log('  SKIP  Playwright is not installed here: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.step': 'application/step' };
    const CSP = (() => { const w = fs.readFileSync(path.join(REPO, 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();   // eslint-disable-line no-eval
    const MUTFILES = ['cma_autopilot.js', 'pasa_autopilot.js', 'pssa_autopilot.js', 'cca_report.js'];
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); } const name = path.basename(f); if (MUT && MUTFILES.indexOf(name) >= 0) { try { b = Buffer.from(src(name)); } catch (e) { console.log('  FAIL  ' + e.message); fail++; } } r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(b); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const browser = await pw.chromium.launch(), errs = [];
    try {
        const pg = await (await browser.newContext({ viewport: { width: 1800, height: 1100 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 200))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.addInitScript(() => { window.SL_VERIFY_SYNC_OFF = true; });
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await pg.waitForFunction(() => typeof window.loadHL1Demo === 'function' && !!window.SLCmaAuto && !!window.SLPasaAuto && !!window.SLPssaAuto && !!window.SLCcaReport, null, { timeout: 90000 });
        await tick(2500);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(() => window.loadHL1Demo());
        await pg.waitForFunction(() => Array.isArray(ftaPages) && ftaPages.length > 50 && Array.isArray(cmaData) && cmaData.length > 3, null, { timeout: 60000 });
        await tick(7000);
        await pg.evaluate(() => { window.__toasts = []; const st = window.showToast; window.showToast = function (m) { window.__toasts.push(String(m)); return typeof st === 'function' ? st.apply(this, arguments) : undefined; }; });

        // ===== [J] first, on untouched data: the report goes to the text; the question stays put ==========================
        const J1 = await pg.evaluate(async () => {
            switchTab('pasa'); await new Promise(r => setTimeout(r, 2000));
            SLCcaReport.act('pasa', 'tab', 'aircraft::fn:SF-01'); await new Promise(r => setTimeout(r, 900));
            const vis = e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0;
            const btn = Array.from(document.querySelectorAll('[onclick]')).find(e => /SLPasaAuto\.ui\.pick\("fc\.FC-01\.trace\.[^"]+","tr:/.test(e.getAttribute('onclick') || '') && vis(e) && !/(^| )on( |$)/.test(e.className));
            if (!btn) return { none: true };
            btn.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 200));
            const pv0 = Array.from(document.querySelectorAll('[data-ccdoc]')).find(vis), s0 = pv0.scrollTop, qid = /pick\("([^"]+)"/.exec(btn.getAttribute('onclick'))[1];
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); btn.click(); await new Promise(r => setTimeout(r, 1300));
            const pv = Array.from(document.querySelectorAll('[data-ccdoc]')).find(vis), pb = pv.getBoundingClientRect();
            const own = pv.querySelectorAll('[data-ccq="' + qid + '"]').length;
            const near = Array.from(pv.querySelectorAll('[data-ccq]')).filter(e => String(e.getAttribute('data-ccq')).indexOf('fc.FC-01.') === 0).map(e => e.getBoundingClientRect().top);
            return { qid: qid, s0: s0, s1: pv.scrollTop, own: own, inPane: near.some(t => t >= pb.top - 2 && t < pb.top + 200), n: near.length };
        });
        check('[J] PASA, an answer whose text carries another question\'s id (a system traced to FC-01): the report still moves to the FC-01 text about it (within the top of the report pane)', !J1.none && J1.own === 0 && J1.s1 > J1.s0 + 100 && J1.inPane, J1);
        const J2 = await pg.evaluate(async () => {
            switchTab('pasa'); await new Promise(r => setTimeout(r, 1500));
            SLCcaReport.act('pasa', 'tab', 'aircraft'); await new Promise(r => setTimeout(r, 900));
            const vis = e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0;
            const all = Array.from(document.querySelectorAll('[onclick]')).filter(e => /SLPasaAuto\.ui\.pick\("pasa\./.test(e.getAttribute('onclick') || '') && vis(e) && !/(^| )on( |$)/.test(e.className));
            const btn = all[Math.min(all.length - 1, 3)]; if (!btn) return { n: 0 };
            btn.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 200));
            const oc = btn.getAttribute('onclick'), y0 = btn.getBoundingClientRect().top;
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            // what is above the question grows by 300 px while the answer is taken (a follow-up question appearing, a
            // notice): put there by hand so the check does not depend on which demo question happens to grow the list
            const host = document.getElementById('ccr-host-pasa'), sp = document.createElement('div'); sp.style.height = '300px'; host.parentNode.insertBefore(sp, host);
            btn.click(); await new Promise(r => setTimeout(r, 1300));
            const same = Array.from(document.querySelectorAll('[onclick]')).find(e => e.getAttribute('onclick') === oc && vis(e));
            const y1 = same ? same.getBoundingClientRect().top : null;
            sp.remove();
            return { n: all.length, worst: { oc: oc.slice(0, 50), y0: Math.round(y0), y1: y1 == null ? null : Math.round(y1) } };
        });
        check('[J] a question answered while the page above it grows by 300 px: the option pressed is still where it was on screen (within 6 px)', J2.n > 0 && !!J2.worst && J2.worst.y1 != null && Math.abs(J2.worst.y1 - J2.worst.y0) <= 6, J2);

        // ===== [C] the CMA writes the requirement =======================================================================
        const C = await pg.evaluate(async () => {
            switchTab('cma'); await new Promise(r => setTimeout(r, 2200));
            const A = window.SLCmaAuto, vis = e => e.getBoundingClientRect().width > 0;
            const cat = A.questions().filter(q => /^cma\/(?!new~)[^/]+\/cat\//.test(q.id) && !q.picked.length);
            const q1 = cat[0], iid = q1.id.split('/')[1], q2 = cat.find(q => q.id.split('/')[1] === iid && q.id !== q1.id);
            A.answer(q1.id, 'concern', { why: 'Both lanes are fed from the same source.' }); A.answer(q2.id, 'concern', { why: 'One team wrote both.' });
            const cq = A.questions().filter(q => q.id.indexOf('cma/' + iid + '/concern/') === 0 && /^questionnaire /.test(String((cmaData.find(c => String(c.internalId) === iid).flow.concerns.find(x => x.id === q.id.split('/').pop()) || {}).from)));
            const a = cq[cq.length - 2], b = cq[cq.length - 1];
            const again = A.questions().find(q => q.id === a.id);
            const out = { iid: iid, a: a.draft && a.draft.text, b: b.draft && b.draft.text, again: again.draft && again.draft.text, intro: a.intro };
            A.ui.select(isNaN(+iid) ? iid : +iid); await new Promise(r => setTimeout(r, 900));
            const card = Array.from(document.querySelectorAll('[onclick]')).find(e => (e.getAttribute('onclick') || '').indexOf("pick('" + a.id + "','req'") >= 0);
            if (card) card.click(); await new Promise(r => setTimeout(r, 900));
            const box = document.querySelector('[data-cmq-fields="' + a.id + '"] textarea[data-cmq-field="text"]');
            out.box = box ? { value: box.value, drafted: box.getAttribute('data-cmq-drafted'), note: (document.querySelector('[data-cmq-fields="' + a.id + '"] [data-cmq-draftnote]') || {}).textContent || '' } : null;
            const save = document.querySelector('[data-cmq-save="' + a.id + '"]'); if (save) save.click(); await new Promise(r => setTimeout(r, 1000));
            const row = cmaData.find(c => String(c.internalId) === iid), cc = row.flow.concerns.find(x => x.id === a.id.split('/').pop());
            out.saved = { raise: !!cc.raise, status: cc.status, reqText: cc.reqText };
            const gen = [];
            try { ['ac'].concat(systemsData.map(s => 'sys-' + s.id)).forEach(sc => { const m = AutoReq.generate(undefined, sc); [].concat(m.isNew || [], (m.isUpdated || []).map(u => u.next), (m.unchanged || []).map(u => u.next)).forEach(c => { if (c && c.reqSource && c.reqSource.generator === 'cma-concern') gen.push(c.text); }); }); } catch (e) { out.genErr = String(e.message); }
            out.gen = gen;
            return out;
        });
        check('[C] a concern\'s requirement is written by the tool: it names the category, the inputs and the gates, and says "shall"', !!C.a && /\bshall\b/.test(C.a) && /common mode category "/.test(C.a) && /the inputs of G-\d+/.test(C.a) && /more than one of these at once: "/.test(C.a), C.a);
        check('[C] the same inputs give the same words, and another category gives other words', C.a === C.again && !!C.b && C.a !== C.b, { a: C.a, b: C.b });
        check('[C] on screen, Raise a requirement opens with that requirement in the box, marked as written by the tool (no empty box)', !!C.box && C.box.value === C.a && C.box.drafted === '1' && /Written by the tool/.test(C.box.note), C.box);
        check('[C] Save files it as the concern\'s requirement, and AutoReq generates it (generator cma-concern) word for word', C.saved.raise === true && C.saved.reqText === C.a && C.gen.indexOf(C.a) >= 0, { saved: C.saved, gen: C.gen.length, err: C.genErr });

        // ===== [P] [S] Generate in the PASA and a PSSA =====================================================================
        const gen = (v) => pg.evaluate(async (v) => {
            const key = v === 'pasa' ? 'pasa' : 'pssa', vis = e => e.getBoundingClientRect().width > 0;
            if (v !== 'pasa') { try { openSystemWorkspace(systemsData[0].id); } catch (e) {} switchWorkspaceTab('pssa'); } else switchTab('pasa');
            await new Promise(r => setTimeout(r, 2000));
            const sel = Array.from(document.querySelectorAll('select')).find(s => (s.getAttribute('onchange') || '').indexOf('"' + key + '"') >= 0 && (s.getAttribute('onchange') || '').indexOf("'tab'") >= 0 && vis(s));
            const tabs = sel ? Array.from(sel.options).map(o => o.value).filter(x => /::fn:/.test(x)) : [];
            const count = () => (acReqData || []).filter(r => r && !r.deleted).length + systemsData.reduce((a, s) => a + (s.req || []).filter(r => r && !r.deleted).length, 0);
            for (const t of tabs) {
                SLCcaReport.act(key, 'tab', t); await new Promise(r => setTimeout(r, 700));
                const btn = Array.from(document.querySelectorAll('[data-paq-genreq],[data-psq-genreq]')).find(vis);
                if (!btn) continue;
                const fc = btn.getAttribute('data-paq-genreq') || btn.getAttribute('data-psq-genreq'), n0 = count(), label = btn.textContent, fnBtn = Array.from(document.querySelectorAll('[data-paq-acceptreq],[data-psq-acceptreq]')).find(vis);
                const waiting = +((btn.closest('[data-paq]').textContent.match(/AutoReq has (\d+) requirement/) || [])[1] || 0);
                btn.scrollIntoView({ block: 'center' }); btn.click(); await new Promise(r => setTimeout(r, 1500));
                const card = document.querySelector('[data-paq="fc.' + fc + '.req"]');
                return { tab: t, fc: fc, label: label, fnLabel: fnBtn ? fnBtn.textContent : '', waiting: waiting, added: count() - n0, after: card ? card.textContent : '', still: !!document.querySelector('[data-paq-genreq="' + fc + '"],[data-psq-genreq="' + fc + '"]'), toast: window.__toasts.slice(-1)[0] || '' };
            }
            return { none: true, tabs: tabs.length };
        }, v);
        const P = await gen('pasa');
        check('[P] PASA: a failure condition has "Generate the requirements for ' + (P.fc || '?') + '", and its function has a Generate button too', !P.none && P.label === 'Generate the requirements for ' + P.fc && /^Generate the requirements for /.test(P.fnLabel) && P.waiting > 0, P);
        check('[P] pressing it puts that failure condition\'s requirements in the registers (' + P.added + ' rows), says how many, and the button gives way to "generated and in the registers"', !P.none && P.added > 0 && P.added >= P.waiting && !P.still && /generated and in the registers/.test(P.after) && new RegExp('^' + P.waiting + ' requirements? generated for ' + P.fc).test(P.toast), P);
        const S2 = await gen('pssa');
        check('[S] PSSA: the same for a system failure condition, into the system requirements', !S2.none && S2.label === 'Generate the requirements for ' + S2.fc && /^Generate the requirements for /.test(S2.fnLabel) && S2.added > 0 && !S2.still && /generated and in the system requirements/.test(S2.after) && /generated for /.test(S2.toast), S2);
        check('no page errors', errs.length === 0, errs.slice(0, 3));
    } catch (e) { check('the browser part ran to the end', false, e && e.stack); }
    await browser.close(); srv.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
