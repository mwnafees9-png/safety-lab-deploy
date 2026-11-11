/* regression_report_comments_20261110.test.js: Microsoft Office style live comments on every report, with Fix with AI.
 *
 * Waqas, 10 Nov 2026: "I want microsoft office style live commenting on every single report which the AI can ingest and
 * address"; "fix with AI option on the comments"; "make sure the comment box does not take up the more than half of the
 * report pane"; "once the comment bubble pops up the questionaire bubble should collapse". Rebuild: report_comments.js
 * (SLReportComments) on the report frame (cca_report.js 1.9: PRA, ZSA, CMA) and the plans (plan_autopilot.js 2.4);
 * assurance_modules.js keeps where a comment's words are (target.anchor); report_writer.js 1.4 writes open comments into
 * Word as margin comments.
 *   1  select words in a report, press Comment, type: the comment is filed on those words (and kept with them), the words
 *      are highlighted and the comment sits in the margin beside them
 *   2  the margin never takes more than half of the report pane, and the questions beside the report fold away while
 *      comments show; Show the questions brings them back
 *   3  reply and resolve: the thread hides once resolved, Show resolved brings it back, Reopen opens it again
 *   4  Fix with AI on words the tool works out: the AI only replies (what to change and where); nothing is rewritten, the
 *      thread stays open, and the AI was told it must not rewrite them
 *   5  Fix with AI on words in a written part: the AI proposes the part rewritten; it is not in the report until Accept;
 *      Accept writes it, replies who accepted, and resolves the thread
 *   6  the plans: a comment on a plan's "How this will be done" works the same way (the SSPP)
 *   7  Word: every open comment is a margin comment on its paragraph, with its replies
 *   8  live: a comment arriving from someone else (into the shared store) appears without a reload
 *   9  Waqas: "make sure images and captions in all reports are centered": in the report frame, the plans, Word and the PDF
 *   10 (11 Nov 2026) Waqas: "comments do not show in line with the selected phrase": with a real mouse, in a report
 *      scrolled well down, the box opens beside the words and stays there
 * MUTATION PROOFS (SL_RC_MUTATE): noanchor (the store drops where the words are), rewritegen (the AI's rewrite of words the
 *   tool works out is offered anyway), noresolve (Accept leaves the thread open), wide (the margin takes 600px), nofold
 *   (the questions stay open beside the comments), noword (no margin comments in Word), nolive (no redraw when a comment
 *   arrives), leftcap (captions back on the left), nodraftmark (the new box is placed before its words are marked),
 *   oldscroll (boxes placed against the report's frame, ignoring how far it is scrolled). Each one must turn this suite red.
 * Run: node tests/regression_report_comments_20261110.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_RC_MUTATE || '';
function mutate(file, body) {
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing in ' + file + ': ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'noanchor' && file === 'assurance_modules.js') rep("anchor: target.anchor || undefined", "anchor: undefined");
    if (MUT === 'noanchor' && file === 'report_comments.js') rep("if (c && anchor && !c.target.anchor) c.target.anchor = anchor;", "");
    if (MUT === 'rewritegen' && file === 'report_comments.js') rep("if (out.action === 'edit' && part && S(out.text).trim()) {", "if (out.action === 'edit' && S(out.text).trim()) { part = part || { label: 'the words' };");
    if (MUT === 'noresolve' && file === 'report_comments.js') rep("    resolve(rootId, 'Addressed: the AI\\'s rewrite accepted by ' + who() + '.');\n", "");
    if (MUT === 'wide' && file === 'report_comments.js') rep(".rc-on.rc-wide{padding-right:min(300px,45%)!important}'\n    + '.rc-rail{position:absolute;top:0;right:6px;width:calc(min(300px,45%) - 14px);", ".rc-on.rc-wide{padding-right:600px!important}'\n    + '.rc-rail{position:absolute;top:0;right:6px;width:600px;");
    if (MUT === 'nofold' && file === 'report_comments.js') rep("fold = any && !ui.showQs[doc];", "fold = false;");
    if (MUT === 'noword' && file === 'cca_report.js') rep("if (root.SLReportComments) { try { root.SLReportComments.annotate(m, key); } catch (_) {} }", "");
    if (MUT === 'leftcap' && file === 'cca_report.js') rep(".ccr-cap{font-weight:700;font-size:11.5px;margin:10px 0 4px;text-align:center}", ".ccr-cap{font-weight:700;font-size:11.5px;margin:10px 0 4px}");
    if (MUT === 'nolive' && file === 'report_comments.js') rep("if (!first && !ui.draft) redrawAll();", "");
    if (MUT === 'nodraftmark' && file === 'report_comments.js') rep("if (drafting) { var r0 = locate(pv, ui.draft.anchor, ui.draft.sec); if (r0) {", "if (false) { var r0 = locate(pv, ui.draft.anchor, ui.draft.sec); if (r0) {");
    if (MUT === 'oldscroll' && file === 'report_comments.js') rep("railTop = rail.getBoundingClientRect().top;", "railTop = pv.getBoundingClientRect().top;");
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
        const pg = await (await browser.newContext({ viewport: { width: 1600, height: 1100 } })).newPage();
        const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(3000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        for (let i = 0; i < 60 && !(await pg.evaluate(() => typeof window.loadHL1Demo === 'function' && !!window.SLReportComments)); i++) await tick(500);
        await pg.evaluate(() => window.loadHL1Demo());
        for (let i = 0; i < 60 && !(await pg.evaluate(() => !!(window.SLZsaAuto && SLZsaAuto.compute()))); i++) await tick(500);
        await tick(1500);
        await pg.evaluate(() => { window.__req = []; window.SafetyLabAI = window.SafetyLabAI || {}; window.SafetyLabAI.complete = async (req) => { window.__req.push(req); return { text: /PART A PERSON WRITES/.test(req.messages[0].content) ? '{"action":"edit","text":"Fit a stainless steel deflector between the hydraulic lines and the brake units.\\n\\nRoute the system B line outboard.","reply":"Named the deflector material."}' : '{"action":"edit","text":"REWRITTEN BY THE AI","reply":"This sentence is worked out from the CAD model: to change it, move the unit in the CAD model or correct its zone on the zone list."}' }; }; });
        await pg.evaluate(() => switchTab('zsa')); await tick(1000);
        await pg.evaluate(async () => { SLCcaReport.get('zsa').setTab('Z-MLGW'); await new Promise(r => setTimeout(r, 600)); SLCcaReport.get('zsa').authSave('Z-MLGW', 'mitigations', 'Fit a deflector between the hydraulic lines and the brake units.\n\nRoute the system B line outboard.', 'person'); SLCcaReport.get('zsa').render(); }); await tick(600);
        const HOST = '#ccr-host-zsa [data-ccdoc]';
        const selectIn = (host, sel, word) => pg.evaluate(([host, sel, word]) => { const pv = document.querySelector(host); const el = [...pv.querySelectorAll(sel)].find(e => e.textContent.includes(word)); if (!el) return 'no element'; el.scrollIntoView({ block: 'center' }); const tw = document.createTreeWalker(el, 4); let n; while ((n = tw.nextNode())) { const i = n.nodeValue.indexOf(word); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + word.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); pv.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); return 'ok'; } } return 'no text'; }, [host, sel, word]);
        const comment = async (host, sel, word, text) => { const s = await selectIn(host, sel, word); await tick(150); await pg.evaluate(() => { const b = document.querySelector('.rc-pop button'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }); await tick(250); await pg.fill('[data-rc-newtext]', text); await pg.click('[data-rc-act="post"]'); await tick(350); return s; };
        const s1 = await comment(HOST, 'p', 'placed in the zone from the CAD model', 'Which CAD revision is this from?');
        const C1 = await pg.evaluate((host) => { const pv = document.querySelector(host), t = SLReportComments.threads('zsa'), m = pv.querySelector('mark.rc-mark'), card = pv.querySelector('.rc-card'); const raw = reviewCommentsData.find(c => c.target && c.target.kind === 'report'); return { n: t.length, quote: t[0] && t[0].root.target.anchor && t[0].root.target.anchor.quote, sec: t[0] && SLReportComments.parseId(t[0].root.target.id).sec, kept: !!(raw && raw.target.anchor), mark: m && m.textContent, card: card && card.textContent.slice(0, 80), dy: m && card ? Math.abs(card.getBoundingClientRect().top - m.getBoundingClientRect().top) : null }; }, HOST);
        check('1  select words, Comment, type: filed on those words and kept with them, highlighted, in the margin beside them', s1 === 'ok' && C1.n === 1 && C1.quote === 'placed in the zone from the CAD model' && C1.sec === 'Z-MLGW' && C1.kept && C1.mark === C1.quote && /Which CAD revision/.test(C1.card || '') && C1.dy !== null && C1.dy < 60, JSON.stringify(C1));
        const L2 = await pg.evaluate((host) => { const pv = document.querySelector(host), rail = pv.querySelector('.rc-rail'), cols = pv.closest('.ccr-cols'), left = cols.querySelector('.ccr-left'); const q = document.querySelector('[data-rc-qs]'); return { pane: pv.getBoundingClientRect().width, rail: rail.getBoundingClientRect().width, leftShown: getComputedStyle(left).display !== 'none', btn: q && q.textContent }; }, HOST);
        await pg.click('[data-rc-qs]'); await tick(300);
        const L2b = await pg.evaluate((host) => { const pv = document.querySelector(host), left = pv.closest('.ccr-cols').querySelector('.ccr-left'), q = document.querySelector('[data-rc-qs]'); return { leftShown: getComputedStyle(left).display !== 'none', btn: q && q.textContent }; }, HOST);
        await pg.click('[data-rc-qs]'); await tick(300);
        check('2  the margin never takes more than half the report pane; the questions fold away while comments show, and come back on Show the questions', L2.rail > 150 && L2.rail <= 300 && L2.rail <= L2.pane / 2 && !L2.leftShown && L2.btn === 'Show the questions' && L2b.leftShown && L2b.btn === 'Hide the questions', JSON.stringify({ L2, L2b }));
        const id1 = await pg.evaluate(() => SLReportComments.threads('zsa')[0].root.commentId);
        await pg.fill('[data-rc-card="' + id1 + '"] [data-rc-replytext]', 'Revision B, from the latest export.');
        await pg.click('[data-rc-card="' + id1 + '"] [data-rc-act="reply"]'); await tick(300);
        await pg.click('[data-rc-card="' + id1 + '"] [data-rc-act="resolve"]'); await tick(300);
        const R3 = await pg.evaluate((host) => ({ open: SLReportComments.threads('zsa').length, all: SLReportComments.threads('zsa', { resolved: true }).length, cards: document.querySelectorAll(host + ' .rc-card').length, replies: SLReportComments.threads('zsa', { resolved: true })[0].replies.map(c => c.text) }), HOST);
        await pg.evaluate(() => SLReportComments.toggleResolved('zsa')); await tick(300);
        await pg.click('[data-rc-card="' + id1 + '"] [data-rc-act="reopen"]'); await tick(300);
        const R3b = await pg.evaluate(() => { SLReportComments.toggleResolved('zsa'); return SLReportComments.threads('zsa').length; });
        check('3  reply and resolve: resolved hides, Show resolved brings it back, Reopen opens it again', R3.open === 0 && R3.all === 1 && R3.cards === 0 && R3.replies[0] === 'Revision B, from the latest export.' && R3b === 1, JSON.stringify({ R3, R3b }));
        await pg.click('[data-rc-card="' + id1 + '"] [data-rc-act="fix"]'); await tick(800);
        const F4 = await pg.evaluate((id) => { const t = SLReportComments.threads('zsa', { resolved: true }).find(x => x.root.commentId === id), ai = t.replies.filter(c => c.aiGenerated), req = window.__req[0] || {}; return { ai: ai.map(c => c.text), fix: ai.some(c => c.aiFix), open: t.root.status, told: /must not rewrite them/.test(req.system || ''), feat: req.feature, inReport: document.body.innerText.indexOf('REWRITTEN BY THE AI') >= 0 }; }, id1);
        check('4  Fix with AI on words the tool works out: the AI only replies; nothing rewritten, the thread stays open, the AI told it must not rewrite them', F4.ai.length === 1 && /worked out from the CAD model/.test(F4.ai[0]) && !F4.fix && F4.open === 'open' && F4.told && F4.feat === 'report.comment.fix' && !F4.inReport, JSON.stringify(F4));
        await comment(HOST, 'p[data-cc-authp]', 'Fit a deflector', 'Say what the deflector is made of.');
        const id2 = await pg.evaluate(() => SLReportComments.threads('zsa').find(t => t.root.target.anchor.part).root.commentId);
        await pg.click('[data-rc-card="' + id2 + '"] [data-rc-act="fix"]'); await tick(800);
        const F5a = await pg.evaluate(() => ({ part: SLCcaReport.get('zsa').authored('Z-MLGW', 'mitigations').text, shown: !!document.querySelector('.rc-fix') }));
        await pg.click('[data-rc-card="' + id2 + '"] [data-rc-act="accept"]'); await tick(600);
        const F5 = await pg.evaluate((id) => { const r = SLCcaReport.get('zsa').authored('Z-MLGW', 'mitigations'), c = reviewCommentsData.find(x => x.commentId === id), reps = reviewCommentsData.filter(x => x.parentId === id); const sec = document.querySelector('#ccr-host-zsa [data-ccsec="Z-MLGW"]'); return { text: r.text, src: r.source, status: c.status, reps: reps.map(x => x.text), inDoc: sec && /stainless steel deflector/.test(sec.textContent) }; }, id2);
        check('5  Fix with AI on a written part: proposed, not in the report until Accept; Accept writes it, replies who accepted, resolves', !/stainless/.test(F5a.part) && F5a.shown && /stainless steel deflector/.test(F5.text) && F5.src === 'ai' && F5.status === 'resolved' && F5.reps.some(t => /^Accepted the AI/.test(t)) && F5.inDoc, JSON.stringify({ F5a, F5 }));
        // the plans
        await pg.evaluate(() => { switchTab('plan-auto'); }).catch(() => {});
        await pg.evaluate(() => { const P = SLPlanAuto; P.authSave('sspp', 'Scope and purpose', 'The program will keep the safety assessment in step with every design change.', 'person'); P.ui.open('sspp'); P.ui.view('plan'); }); await tick(600);
        await comment('[data-pladoc]', 'p[data-pla-authp]', 'in step with every design change', 'How often is this checked?');
        const P6 = await pg.evaluate(() => { const t = SLReportComments.threads('plan:sspp'); return { n: t.length, part: t[0] && t[0].root.target.anchor.part, sec: t[0] && SLReportComments.parseId(t[0].root.target.id).sec, mark: !!document.querySelector('[data-pladoc] mark.rc-mark'), card: !!document.querySelector('[data-pladoc] .rc-card'), fold: !!document.querySelector('.pla-cols.rc-qcollapsed') }; });
        check('6  the plans: a comment on the SSPP\'s "How this will be done" is filed on its part, highlighted, in the margin, the questions folded', P6.n === 1 && P6.part === 'plan|sspp|Scope and purpose' && P6.sec === 'Scope and purpose' && P6.mark && P6.card && P6.fold, JSON.stringify(P6));
        // Waqas: "office style live commenting not just on reports but Plans too": the plan's status report as well
        await pg.evaluate(() => SLPlanAuto.ui.view('status')); await tick(500);
        const sw = await pg.evaluate(() => { const p = [...document.querySelectorAll('[data-pladoc] p')].find(x => x.textContent.length > 40); return p ? p.textContent.trim().split(/\s+/).slice(0, 4).join(' ') : ''; });
        await comment('[data-pladoc]', 'p', sw, 'Is this up to date?');
        const P6b = await pg.evaluate(() => { const t = SLReportComments.threads('plan:sspp:status'); return { n: t.length, card: !!document.querySelector('[data-pladoc] .rc-card'), plan: SLReportComments.threads('plan:sspp').length }; });
        check('6  ...and the plan\'s status report takes comments too, as its own document', !!sw && P6b.n === 1 && P6b.card && P6b.plan === 1, JSON.stringify({ sw, P6b }));
        await pg.evaluate(() => SLPlanAuto.ui.view('plan')); await tick(300);
        const W7 = await pg.evaluate(async () => { let captured = null; const orig = SLReportWriter.docx; SLReportWriter.docx = async (m, lib) => { captured = m; return orig(m, lib); }; window.__noDl = true; const R = SLCcaReport.get('zsa'); R.setTab('Z-MLGW'); try { await SLCcaReport.act('zsa', 'word'); } catch (_) {} await new Promise(r => setTimeout(r, 2500)); SLReportWriter.docx = orig; if (!captured) return { none: true }; const blob = await orig(captured, await window._loadDocxLib()); const txt = await blob.text().catch(() => ''); return { comments: (captured.comments || []).map(c => c.lines.join(' | ')), marked: captured.blocks.filter(b => b.commentIds).map(b => b.text), size: blob.size }; });
        check('7  Word: every open comment is a margin comment on its paragraph, with its replies', !W7.none && W7.comments.length === 1 && /Which CAD revision/.test(W7.comments[0]) && /Revision B/.test(W7.comments[0]) && W7.marked.length === 1 && /placed in the zone from the CAD model/.test(W7.marked[0] || '') && W7.size > 1000, JSON.stringify(W7));
        // live: another person's comment lands in the shared store
        await pg.evaluate(() => { switchTab('zsa'); }); await tick(800);
        await pg.evaluate(async () => { SLCcaReport.get('zsa').setTab('Z-MLGW'); await new Promise(r => setTimeout(r, 400)); });
        await pg.evaluate(() => { reviewCommentsData.push({ commentId: 'remote-1', target: { kind: 'report', id: 'zsa§Z-MLGW', anchor: { quote: 'Route the system B line outboard', before: '', after: '', part: 'zsa|Z-MLGW|mitigations' } }, authorName: 'Second engineer', timestamp: Date.now(), text: 'Outboard of what?', status: 'open', parentId: null }); });
        await tick(2500);
        const L8 = await pg.evaluate(() => ({ card: !!document.querySelector('[data-rc-card="remote-1"]'), mark: !![...document.querySelectorAll('#ccr-host-zsa mark.rc-mark')].find(m => m.getAttribute('data-rc') === 'remote-1') }));
        check('8  live: a comment arriving from someone else appears in the margin without a reload', L8.card && L8.mark, JSON.stringify(L8));
        const C9 = await pg.evaluate(() => { const pv = document.querySelector('#ccr-host-zsa [data-ccdoc]'); const fig = pv.querySelector('.ccr-fig'), cap = pv.querySelector('.ccr-cap'), img = fig && fig.querySelector('svg,img'); const fr = fig && fig.getBoundingClientRect(), ir = img && img.getBoundingClientRect(); return { fig: fig && getComputedStyle(fig).textAlign, cap: cap && getComputedStyle(cap).textAlign, mid: fr && ir ? Math.abs((ir.left + ir.right) / 2 - (fr.left + fr.right) / 2) : null, wide: fr && ir ? ir.width < fr.width - 4 : false }; });
        const RW = fs.readFileSync(path.join(SITE, 'report_writer.js'), 'utf8'), PL = fs.readFileSync(path.join(SITE, 'plan_autopilot.js'), 'utf8');
        check('9  images and captions centered: the report frame (picture and caption), the plans, Word and the PDF', C9.fig === 'center' && C9.cap === 'center' && (C9.mid === null || C9.mid < 3) && /\.pla-cap\{[^}]*text-align:center/.test(PL) && /\.pla-fig\{[^}]*text-align:center/.test(PL) && /var caption = function \(anchor, text\) \{ return new D\.Paragraph\(\{ alignment: D\.AlignmentType\.CENTER/.test(RW) && /alignment: D\.AlignmentType\.CENTER, keepNext: true, children: \[new D\.ImageRun/.test(RW) && (RW.match(/doc\.text\(ln, W \/ 2, y, \{ align: 'center' \}\)/g) || []).length === 2, JSON.stringify(C9));
        // 10 (11 Nov 2026, Waqas: "comments do not show in line with the selected phrase"): a report scrolled well down,
        // words chosen with the real mouse, Comment pressed: the box is beside the words, and stays there once posted
        await pg.evaluate(async () => { switchTab('cma'); await new Promise(r => setTimeout(r, 2500)); });
        const bx = await pg.evaluate(() => {
            const pv = document.querySelector('#view-cma [data-rc-doc]'); if (!pv) return null;
            const tn = (function f(n) { if (n.nodeType === 3 && /assessment \(PASA\)/.test(n.textContent)) return n; for (const c of n.childNodes) { const x = f(c); if (x) return x; } return null; })(pv);
            if (!tn) return null;
            const i = tn.textContent.indexOf('assessment (PASA)'); tn.parentElement.scrollIntoView({ block: 'center' });
            const r = document.createRange(); r.setStart(tn, i); r.setEnd(tn, i + 17); const b = r.getBoundingClientRect();
            return { x1: b.left + 1, x2: b.right - 1, y: b.top + b.height / 2, scrolled: pv.scrollTop + window.scrollY };
        });
        let P10 = null;
        if (bx) {
            await pg.mouse.move(bx.x1, bx.y); await pg.mouse.down(); await pg.mouse.move(bx.x2, bx.y, { steps: 6 }); await pg.mouse.up(); await tick(400);
            const pop = await pg.evaluate(() => { const b = document.querySelector('.rc-pop button'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + 5, y: r.top + 5 }; });
            if (pop) { await pg.mouse.move(pop.x, pop.y); await pg.mouse.down(); await pg.mouse.up(); await tick(600); }
            const where = () => pg.evaluate(() => { const c = document.querySelector('#view-cma [data-rc-new], #view-cma .rc-card[data-rc-card]'), m = document.querySelector('#view-cma mark.rc-mark'); const vh = innerHeight; return (c && m) ? { card: Math.round(c.getBoundingClientRect().top), mark: Math.round(m.getBoundingClientRect().top), inView: m.getBoundingClientRect().top > 0 && m.getBoundingClientRect().bottom < vh, focus: document.activeElement && document.activeElement.tagName } : null; });
            const d1 = await where();
            await pg.keyboard.type('Say which revision.'); await pg.evaluate(() => SLReportComments.post()); await tick(600);
            const d2 = await where();
            P10 = { pop: !!pop, scrolled: bx.scrolled, draft: d1, posted: d2 };
        }
        check('10 a report scrolled down, words chosen with the mouse: the comment box opens in line with the words (within 6 px), the words stay in view with the box ready to type in, and it stays in line once posted', !!P10 && P10.pop && P10.scrolled > 300 && !!P10.draft && Math.abs(P10.draft.card - P10.draft.mark) <= 6 && P10.draft.inView && P10.draft.focus === 'TEXTAREA' && !!P10.posted && Math.abs(P10.posted.card - P10.posted.mark) <= 6, JSON.stringify(P10));
        check('8  no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } catch (e) { check('the browser part ran to the end', false, e && e.stack); }
    await browser.close(); srv.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
