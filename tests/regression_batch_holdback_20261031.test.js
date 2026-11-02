/* regression_batch_holdback_20261031.test.js — a draft hands back only what a draft can apply (ANEM drafting, all lanes).
 *
 * Waqas, 31 Oct 2026, live Aeolus CMA: the draft came back as one "start another CMA draft" action, shown as a row with
 * Accept, counted as "passed the checker", then "Applied 0 of 1 BLOCKED"; the card printed its confidence twice; a reason
 * named "state.ftaPages"; and with every tree still the empty one the app made, ANEM stopped instead of working from the
 * SDD. Agreed: hold back what cannot apply (one plain reason, never a row), one honest count, no double lines, plain
 * words, and a CMA with no AND gates drafts from the documents' independence claims, each row saying it is not tied to a
 * gate yet.
 *   [H] a nested draft, an unknown action and another lane's row are held back; the CMA row stays
 *   [P] the panel shows one card, says what was held back, prints confidence once, and names no store
 *   [N] all held back: the no-rows panel says so in words
 *   [G] no AND gates: the steer goes to ANEM, and an accepted row says it is not tied to a gate yet
 * MUTATION PROOFS: SL_HB_MUTATE=nohold (nothing held back), =twice (confidence printed twice again), =noplain (store names shown).
 * Run: node tests/regression_batch_holdback_20261031.test.js
 *
 * (harness shared with regression_comments_everywhere_20261031.test.js)
 * regression_comments_everywhere_20261031.test.js — review comments on every assessment, and ANEM able to make the
 * change wherever it can comment (comment_kinds.js v1.0).
 *
 * Waqas, 30 Oct 2026: "is our AI capable of addressing comments in the app for every single assessment" ... "lets get
 * it all done". Agreed list: comments on fault trees (a node or a whole tree), CCMR, MAC, CoFFE, resources, R&M
 * (Markov, RBD, ETA, FRACAS, MSG-3) and the crew credit; ANEM edits for assumptions, STPA scope, the HF lanes and every
 * new kind; source documents stay reply-only (the customer's controlled text).
 *
 *   [K] every new kind is registered with the review store and the traces panel, and the summary lists it
 *   [U] each surface shows the comment button for its own row: the tree, a node, a CCMR row, a MAC rule, a CoFFE case,
 *       a resource, a Markov model, an RBD, an event tree, a FRACAS record, an MSG-3 item and failure, the crew credit
 *   [T] a comment on each is named in words in the review panel and the jump lands on it
 *   [A] ANEM sees the rows (no cutoff) and where each comment sits; it changes text fields on every new table, and is
 *       refused a number, a status, a signature, an unknown field, a value outside a list; a CoFFE answer stays a
 *       proposal until signed; a MAC rule change keeps its id and comes back unsigned; delete only where allowed
 *   [E] the comment engine tells ANEM each comment's row in the terms it edits by
 * MUTATION PROOFS: SL_CK_MUTATE=nobutton (no comment buttons), =anystring (any field ANEM names is written),
 *   =coffeverdict (ANEM's CoFFE answer goes straight into the signed verdicts), =nokinds (the kinds are not registered).
 * Run: node tests/regression_comments_everywhere_20261031.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1200) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_HB_MUTATE || '';
function mutate(file, body) {
    if (file !== 'ai_assistant.js') return body;
    if (MUT === 'nohold') return body.replace("const _held = (typeof _batchHoldBack === 'function') ? _batchHoldBack(actions, cfg.analysis) : [];", "const _held = [];");
    if (MUT === 'twice') return body.replace("             ;   // 31 Oct 2026: the review panel adds the confidence and source lines once", "             + _confidenceBadge(a);   //");
    if (MUT === 'noplain') return body.replace("    function _plainWords(t) {\n        return String(t == null ? '' : t)", "    function _plainWords(t) {\n        return String(t == null ? '' : t); return String(t == null ? '' : t)");
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const iCK = HTML.indexOf('comment_kinds.js?v=1.0'), iAs = HTML.indexOf('assurance_modules.js?v=');
    check('ai_assistant.js has the hold-back rule for every drafting lane', /function _batchHoldBack\(/.test(fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8')));
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:kestrel');
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.addInitScript(() => { try { localStorage.setItem('safetyLab.ai.enabled', '1'); } catch (_) {} window.SL_VERIFY_SYNC_OFF = true; window.SL_FC_TREES_OFF = true; window.SL_FC_LINK_OFF = true; });
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        const r = await within(page.evaluate(async (data) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { const v = fn(); if (v) return v; } catch (_) {} await wait(80); } return null; };
            _applyProjectData(data); await wait(1200);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            ['welcome-modal', 'signup-modal'].forEach(id => { const o = document.getElementById(id); if (o) o.classList.remove('show'); });
            const R = {};
            await window.slLoadAI(); await until(() => window.SafetyLabAI && window.SafetyLabAI._batchTest, 20000);
            const B = window.SafetyLabAI._batchTest;
            // [H]
            const acts = [{ op: 'draft', analysis: 'cma', scope: 'aircraft' }, { op: 'add_cma', subject: 'Wing-root run', claim: 'Systems A and B share the wing-root run' }, { op: 'teleport' }, { op: 'add_pra', threat: 'Rotor burst' }];
            const held = B.holdBack(acts, 'cma.draft');
            R.h = { left: acts.map(a => a.op).join(','), held: held.map(h => h.op + ':' + h.why) };
            const acts2 = [{ op: 'add_pra', threat: 'x' }, { op: 'link', fromTable: 'fta' }];
            R.h.otherLane = B.holdBack(acts2, 'arch.decompose').length === 0 && acts2.length === 2;
            // no AND gate anywhere: every gate made an OR
            ftaPages.forEach(p => (function w(n) { if (!n) return; if (n.type === 'gate') n.gateType = 'OR'; (n.children || []).forEach(w); })(p.root));
            projectSourceDocs = [{ id: 'doc-t', name: 'Aeolus SDD', text: 'Section 3. Systems A and B sharing a wing-root run is a claim about independence. The two hydraulic systems are segregated left and right.' }];
            const sent = []; let reply = {};
            window.AiClient = { isConfigured: () => true, messages: async (req) => { sent.push(req); return { content: [{ type: 'text', text: JSON.stringify(reply) }], model: 'test-model', stop_reason: 'end_turn' }; } };
            // [P]
            reply = { reply: 'Drafted from the SDD.', actions: [
                { op: 'draft', analysis: 'cma', scope: 'aircraft', confidence: 'medium', source: { doc: 'Aeolus SDD', quote: 'Systems A and B sharing a wing-root run is a claim about independence' } },
                { op: 'add_cma', subject: 'Shared wing-root run, systems A and B', principle: 'Systems A and B fail independently', claim: 'A and B share the wing-root run', findings: 'Check segregation', mitigation: 'Separate the runs', status: 'Open', confidence: 'medium', source: { doc: 'Aeolus SDD', quote: 'Systems A and B sharing a wing-root run is a claim about independence' } }
            ], assumptions: [{ text: 'The trees are undeveloped', type: 'architecture', rationale: 'Every page in state.ftaPages has only an OR top event over one undeveloped node.' }] };
            const p0 = document.getElementById('ai-rev-anem-batch'); if (p0) p0.remove();
            const nCma = cmaData.length;
            window.SafetyLabAI.draftCma();
            const panel = await until(() => document.getElementById('ai-rev-anem-batch'), 20000);
            await wait(400);
            const txt = panel ? panel.innerText : '';
            const um = JSON.stringify((sent[0] || {}).messages || []);
            R.p = { panel: !!panel, cards: panel ? panel.querySelectorAll('.aifh-card[data-k]').length : 0, noDraftCard: !/Analysis:\s*cma/.test(txt) && !/a draft is started from the chat/.test(txt),
                    heldSaid: /held back and is not shown: it asked to start another draft/.test(txt), confOnce: (txt.match(/AI confidence:/g) || []).length === 1,
                    plain: /in the fault trees has only/.test(txt) && !/state\.ftaPages|ftaPages/.test(txt), steer: /NO AND GATE EXISTS/.test(um), text: txt.slice(0, 1500) };
            // [G] accept the row
            const acc = panel && Array.from(panel.querySelectorAll('.aifh-card[data-k] button')).find(b => /^Accept/.test(b.textContent.trim()));
            if (acc) acc.click(); await wait(800);
            const row = cmaData.length > nCma ? cmaData[cmaData.length - 1] : null;
            R.g = { added: !!row, note: !!(row && /^Not tied to a fault-tree gate yet/.test(row.findings || '') && row.aiGateNote) };
            // [N] everything held back
            const p1 = document.getElementById('ai-rev-anem-batch'); if (p1) p1.remove();
            sent.length = 0;
            reply = { reply: '', actions: [{ op: 'draft', analysis: 'cma', scope: 'aircraft' }] };
            window.SafetyLabAI.draftCma();
            await until(() => sent.length, 15000); await wait(1200);
            const all = Array.from(document.querySelectorAll('div')).filter(d => /ANEM returned no common mode analysis rows/.test(d.innerText || ''));
            R.n = { said: all.length > 0, noCard: !document.querySelector('#ai-rev-anem-batch .aifh-card[data-k]') };
            return R;
        }, demo.data), 200000, 'the browser step');
        console.log('\n[H] held back');
        check('[H] a nested draft, an unknown action and another lane\'s row are held back; the CMA row stays', r.h.left === 'add_cma' && r.h.held.length === 3 && /start another draft/.test(r.h.held[0]) && /not something the app can apply/.test(r.h.held[1]) && /not a common mode analysis row/.test(r.h.held[2]), JSON.stringify(r.h));
        check('[H] a lane with no fixed kind keeps what the app knows', r.h.otherLane, JSON.stringify(r.h));
        console.log('\n[P] the panel');
        check('[P] one card (the CMA row), no draft card', r.p.panel && r.p.cards === 1 && r.p.noDraftCard, JSON.stringify(r.p));
        check('[P] it says what was held back, in words', r.p.heldSaid, r.p.text);
        check('[P] the confidence line is printed once', r.p.confOnce, r.p.text);
        check('[P] a reason that named "state.ftaPages" reads "the fault trees"', r.p.plain, r.p.text);
        console.log('\n[G] no AND gates');
        check('[G] with no AND gate anywhere, ANEM is told to work from the documents\' independence claims', r.p.steer);
        check('[G] the accepted row says it is not tied to a fault-tree gate yet', r.g.added && r.g.note, JSON.stringify(r.g));
        console.log('\n[N] nothing left');
        check('[N] when everything is held back, the panel says ANEM returned no rows, and why; no card', r.n.said && r.n.noCard, JSON.stringify(r.n));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) {
        check('test crashed: ' + (e && e.stack || e), false);
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
