#!/usr/bin/env node
/*
 * Regression: combined failure conditions get the same AI drafting interface as every other analysis, proposals come
 * only when asked, and nothing ungrounded is shown or written (30 Oct 2026; fc_variants.js v2.0, lane_ai_bar.js v1.5,
 * ai_assistant.js "Propose combined failure conditions").
 *
 * RULINGS (Waqas, 30 Oct 2026): "We need to have an AI drafting interface ... the combine failures table under the
 *   FHAs"; "do it the same way we have for all other analyses"; "There shouldn't be combo failures proposed initially
 *   till the user prompts"; "We do not guess"; "It should propose the combos to the user".
 * EXECUTED (Chromium, the real app on the HL-1 showcase; the AI service stubbed at window.AiClient, so the real
 *   Provider.complete, prompt assembly, parsing, checking and review panel all run):
 *   [B] the combined panel under the aircraft FHA carries the standard AI bar button, in its heading; so does each
 *       system's FHA panel, scoped to that system. Nothing is proposed before the button is pressed.
 *   [R] pressing it sends the combined-failure skill and the project facts; of six proposals, the three with a basis
 *       the project confirms are shown (a system that implements both, a resource both depend on, a source document
 *       sentence quoted verbatim), the three without are withheld and counted (an invented resource, the same set
 *       twice, two conditions of one function); a severity milder than the worst part is raised and says so.
 *   [A] Accept writes one combined row through the one writer: its parents, its checked basis, ANEM provenance, an FC
 *       ID that no other row has; the panel lists it with its basis. Asking again does not propose it again.
 *   [W] the writer refuses: milder than the worst part, a combination of a combination, an unknown condition, the
 *       same set twice.
 *   [S] a system's button proposes from that system's conditions only; accepting writes to that system's FHA.
 *   [C] the ANEM chat's add_combined_fc goes through the same check: an invented basis is refused with the reason.
 * MUTATION PROOFS: SL_COMBINE_MUTATE=nobasis (every cited basis believed), =nowhy (no reasoning needed), =dup (an existing combination not found),
 *   =mild (a milder severity allowed). Each turns this red.
 * Run: node tests/regression_fc_combine_20261030.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_COMBINE_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'nowhy' && file === 'ai_assistant.js') return body.replace("if (!String(raw.rationale || '').trim()) return { ok: false, why: 'no reasoning given for its severity' };", "");
    if (MUT === 'nowhy' && file === 'fc_variants.js') return body.replace("if (!String(opts.rationale || '').trim()) return", "if (false) return");
    if (MUT === 'nobasis' && file === 'ai_assistant.js') return body.replace("if (!kept.length) return { ok: false, why: 'no basis in the project'", "if (!kept.length) (raw.basis || []).forEach(function (b) { kept.push({ kind: b.kind, ref: b.ref, text: String(b.ref) }); }); if (!kept.length) return { ok: false, why: 'no basis in the project'");
    if (MUT === 'dup' && file === 'fc_variants.js') return body.replace("return combinedRows(scope).find(f => _sameSet((f.combinedOf || []).map(String), ids)) || null;", "return null;");
    if (MUT === 'mild' && file === 'fc_variants.js') return body.replace("if (_rank(sev) < _rank(worst.severity)) return { ok: false, why: 'a combination cannot be milder", "if (false) return { ok: false, why: 'a combination cannot be milder");
    if (MUT === 'mild' && file === 'ai_assistant.js') return body.replace("else if (_combineRank(sev) < _combineRank(worst.severity)) {", "else if (false) {");
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('fc_variants.js v2.2 and lane_ai_bar.js v1.6+ are the versions loaded', /fc_variants\.js\?v=2\.2/.test(HTML) && /lane_ai_bar\.js\?v=1\.([6-9]|\d\d)/.test(HTML));
    const skills = fs.readFileSync(path.join(SITE, 'ai_skills.js'), 'utf8');
    check('the combined-failure skill is registered (fha.combine, v1)', /'fha\.combine': "STANDARD GROUNDING/.test(skills) && /'fha\.combine': 1,/.test(skills) && /"fha\.combine": "fha\.combine"/.test(skills));
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:hl1');
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.addInitScript(() => { try { localStorage.setItem('safetyLab.ai.enabled', '1'); } catch (_) {} window.SL_VERIFY_SYNC_OFF = true; window.SL_FC_TREES_OFF = true; window.SL_FC_LINK_OFF = true; });
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && window.SLFcVariants && window.LANE_AI_BAR && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        const r = await within(page.evaluate(async (data) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { const v = fn(); if (v) return v; } catch (_) {} await wait(80); } return null; };
            _applyProjectData(data); await wait(1200);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            ['welcome-modal', 'signup-modal'].forEach(id => { const o = document.getElementById(id); if (o) o.classList.remove('show'); });
            const DOC = 'The flight control computers share the forward avionics bay cooling air, so loss of cooling degrades the yaw and roll channels together.';
            projectSourceDocs = [{ id: 'doc-test', name: 'Test SDD', text: 'Section 4. ' + DOC + ' End.' }];
            const R = {};
            await window.slLoadAI(); await until(() => window.SafetyLabAI && window.SafetyLabAI._combineTest, 20000);
            // the AI service, stubbed: the real Provider path runs, the reply is ours
            const sent = []; let reply = { combinations: [] };
            window.AiClient = { isConfigured: () => true, messages: async (req) => { sent.push(req); return { content: [{ type: 'text', text: JSON.stringify(reply) }], model: 'test-model', stop_reason: 'end_turn' }; } };
            // [B] the button, in the panel's heading; nothing proposed before it is pressed
            const nRows0 = acFhaData.length;
            switchTab('ac-fha'); await wait(1300);
            if (typeof renderACFHA === 'function') renderACFHA(); await wait(300);
            const btn = await until(() => document.querySelector('#fcv-panel [data-section-ai="fcv"]'));
            R.bar = { found: !!btn, text: btn && btn.textContent, enabled: btn && !btn.disabled, inHeading: !!(btn && btn.closest('.fcv-ai-slot')), notOnPageBar: !Array.from(document.querySelectorAll('#view-ac-fha > .slab-ai-bar [data-lane-ai]')).some(b => /combined/i.test(b.textContent)),
                nothingYet: !document.getElementById('ai-rev-panel-combine') && sent.length === 0 && acFhaData.length === nRows0 };
            // [R] press it
            reply = { combinations: [
                { parents: ['FC-01', 'FC-03'], fcDesc: 'Loss of pitch and roll control together', severity: 'Catastrophic', effAc: 'No attitude control', rationale: 'Both axes lost.', basis: [{ kind: 'system', ref: 'sys-fcs', why: 'one system implements both' }] },
                { parents: ['FC-03', 'FC-05'], fcDesc: 'Invented', severity: 'Catastrophic', basis: [{ kind: 'resource', ref: 'RES-99', why: 'made up' }] },
                { parents: ['FC-03', 'FC-01'], fcDesc: 'The same set again', severity: 'Catastrophic', basis: [{ kind: 'system', ref: 'sys-fcs', why: 'repeat' }] },
                { parents: ['FC-01', 'FC-04'], fcDesc: 'Loss of pitch and yaw control on 115 VAC loss', severity: 'Minor', effAc: 'Degraded control', rationale: 'Proposed too mild on purpose.', basis: [{ kind: 'resource', ref: 'RES-01', why: 'both depend on 115 VAC' }] },
                { parents: ['FC-01', 'FC-02'], fcDesc: 'One function twice', severity: 'Catastrophic', basis: [{ kind: 'system', ref: 'sys-fcs', why: 'same function' }] },
                { parents: ['FC-03', 'FC-04'], fcDesc: 'Roll and yaw channels degraded together by cooling loss', severity: 'Catastrophic', rationale: 'Roll and yaw lost together leave no lateral control.', basis: [{ kind: 'document', ref: DOC, why: 'stated in the SDD' }] },
                { parents: ['FC-01', 'FC-03', 'FC-04'], fcDesc: 'No reasoning given', severity: 'Catastrophic', basis: [{ kind: 'document', ref: DOC, why: 'stated in the SDD' }] }
            ] };
            btn.click();
            const panel = await until(() => document.getElementById('ai-rev-panel-combine'), 15000);
            const req = sent[0] || {};
            const sysTxt = String(req.system || '') + JSON.stringify(req.system || '');
            const userTxt = JSON.stringify(req.messages || []);
            R.run = { panel: !!panel, calls: sent.length, feature: req.feature, spec: /GROUND STRICTLY, NEVER GUESS/.test(sysTxt), facts: /FC-01/.test(userTxt) && /implementedBy/.test(userTxt) && /RES-01/.test(userTxt),
                cards: panel ? panel.querySelectorAll('.aifh-card').length : 0, text: panel ? panel.innerText : '' };
            R.run.withheld3 = /4 proposals were withheld/.test(R.run.text) && /no reasoning given/.test(R.run.text) && /RES-99|no basis/.test(R.run.text) && /proposed twice/.test(R.run.text) && /one function/.test(R.run.text);
            R.run.raised = /raised to Catastrophic/.test(R.run.text);
            R.run.basisShown = /all implemented by Flight Control System/.test(R.run.text) && /all depend on 115 VAC electrical power/.test(R.run.text) && /source document/.test(R.run.text);
            // [A] accept the first
            const card = panel && Array.from(panel.querySelectorAll('.aifh-card')).find(c => /Loss of pitch and roll control together/.test(c.textContent));
            const acc = card && Array.from(card.querySelectorAll('button')).find(b => /^Accept/.test(b.textContent.trim()));
            if (acc) acc.click();
            await wait(600);
            const made = acFhaData.filter(f => f && Array.isArray(f.combinedOf) && f.combinedOf.slice().sort().join('+') === 'FC-01+FC-03');
            const row = made[0] || {};
            R.acc = { clicked: !!acc, one: made.length === 1, basis: (row.combineBasis || []).map(b => b.kind + ':' + b.ref).join(','), ai: row.aiFeature === 'fha.combine' && row.aiGenerated === true, sev: row.severity, fcId: row.fcId,
                unique: acFhaData.filter(f => f && f.fcId === row.fcId).length === 1, listed: /Basis: all implemented by Flight Control System/.test((document.getElementById('fcv-panel') || {}).innerText || ''),
                why: row.severityRationale === 'Both axes lost.', whyShown: /Why Catastrophic: Both axes lost\./.test((document.getElementById('fcv-panel') || {}).innerText || ''),
                inTable: /Why this severity: Both axes lost\./.test((document.getElementById('ac-fha-table') || document.body).innerText || '') };
            // asking again: it is not proposed again
            const p2 = document.getElementById('ai-rev-panel-combine'); if (p2) p2.remove();
            reply = { combinations: [{ parents: ['FC-01', 'FC-03'], fcDesc: 'Again', severity: 'Catastrophic', basis: [{ kind: 'system', ref: 'sys-fcs', why: 'again' }] }] };
            renderACFHA(); await wait(300);
            const btn2 = await until(() => document.querySelector('#fcv-panel [data-section-ai="fcv"]'));
            if (btn2) btn2.click();
            await wait(1500);
            R.again = { noPanel: !document.getElementById('ai-rev-panel-combine'), still: acFhaData.filter(f => f && Array.isArray(f.combinedOf) && f.combinedOf.slice().sort().join('+') === 'FC-01+FC-03').length };
            // [W] the writer refuses
            const V = window.SLFcVariants;
            R.w = {
                milder: V.createCombined('ac', ['FC-05', 'FC-07'], { severity: 'Minor' }),
                nested: V.createCombined('ac', [row.fcId, 'FC-05'], {}),
                unknown: V.createCombined('ac', ['FC-01', 'FC-NOPE'], {}),
                dup: V.createCombined('ac', ['FC-03', 'FC-01'], {}),
                noWhy: V.createCombined('ac', ['FC-05', 'FC-07'], { severity: 'Catastrophic' }),
                blankWhy: V.createCombined('ac', ['FC-05', 'FC-07'], { severity: 'Catastrophic', rationale: '   ' })
            };
            Object.keys(R.w).forEach(k => { R.w[k] = { ok: R.w[k].ok, why: R.w[k].why }; });
            // [S] a system's panel and button
            openSystemWorkspace('sys-fcs'); switchWorkspaceTab('fha'); await wait(1300);
            if (typeof renderSysFHA === 'function') renderSysFHA(); await wait(300);
            const sbtn = await until(() => document.querySelector('#fcv-panel-sys [data-section-ai="fcv"]'));
            R.sys = { found: !!sbtn, title: sbtn && sbtn.title, enabled: sbtn && !sbtn.disabled };
            const sys = systemsData.find(s => s.id === 'sys-fcs');
            const sent0 = sent.length;
            reply = { combinations: [
                { parents: ['FC-FCS01', 'FC-FCS03'], fcDesc: 'FCS pitch and roll outputs lost together', severity: 'Catastrophic', rationale: 'Pitch and roll lost together leave no attitude control.', basis: [{ kind: 'resource', ref: 'RES-01', why: 'the FCS runs on 115 VAC' }] },
                { parents: ['FC-01', 'FC-03'], fcDesc: 'An aircraft-level pair', severity: 'Catastrophic', basis: [{ kind: 'resource', ref: 'RES-01', why: 'wrong level' }] }
            ] };
            if (sbtn) sbtn.click();
            const spanel = await until(() => document.getElementById('ai-rev-panel-combine'), 15000);
            const sreq = sent[sent0] || {};
            R.sys.level = /system Flight Control System/.test(JSON.stringify(sreq.messages || []));
            R.sys.noAcConds = !/"fcId":\s*"FC-01"/.test(JSON.stringify(sreq.messages || []));
            R.sys.cards = spanel ? spanel.querySelectorAll('.aifh-card').length : 0;
            R.sys.withheldWrongLevel = spanel ? /not in this FHA/.test(spanel.innerText) : false;
            const sacc = spanel && Array.from(spanel.querySelectorAll('.aifh-card button')).find(b => /^Accept/.test(b.textContent.trim()));
            if (sacc) sacc.click();
            await wait(600);
            const srow = (sys.fha || []).find(f => f && Array.isArray(f.combinedOf) && f.combinedOf.slice().sort().join('+') === 'FC-FCS01+FC-FCS03');
            R.sys.written = !!srow; R.sys.notInAc = !acFhaData.some(f => f && Array.isArray(f.combinedOf) && f.combinedOf.indexOf('FC-FCS01') >= 0);
            R.sys.listed = /FCS pitch and roll outputs lost together/.test((document.getElementById('fcv-panel-sys') || {}).innerText || '');
            // [C] the chat op, same check
            const L = window.SafetyLabAI._treeLaneTest;
            const res = L.runActions([{ op: 'add_combined_fc', scope: 'aircraft', parents: ['FC-05', 'FC-07'], fcDesc: 'Chat invented', severity: 'Catastrophic', basis: [{ kind: 'item', ref: 'LRU-NOPE', why: 'made up' }] }], 'test-model', '', 'chat.edit');
            const c0 = (Array.isArray(res) ? res : (res && res.results) || [])[0] || {};
            R.chat = { ok: !!c0.ok, err: c0.error || c0.summary || '' };
            return R;
        }, demo.data), 200000, 'the browser step');
        console.log('\n[B] the button');
        check('[B] the combined panel under the aircraft FHA has the standard AI button, in its heading, enabled', r.bar.found && r.bar.enabled && r.bar.inHeading && /Propose combined failure conditions/.test(r.bar.text), JSON.stringify(r.bar));
        check('[B] it is not on the page\'s own bar (it writes the panel), and nothing is proposed before it is pressed', r.bar.notOnPageBar && r.bar.nothingYet, JSON.stringify(r.bar));
        console.log('\n[R] pressing it');
        check('[R] one call, as fha.combine, carrying the skill and the project facts (conditions, implementing systems, resources)', r.run.calls === 1 && r.run.feature === 'fha.combine' && r.run.spec && r.run.facts, JSON.stringify({ calls: r.run.calls, feature: r.run.feature, spec: r.run.spec, facts: r.run.facts }));
        check('[R] the standard review panel shows the three proposals the project confirms', r.run.panel && r.run.cards === 3, r.run.cards + ' cards');
        check('[R] the four it cannot confirm are withheld and counted: an invented resource, the same set twice, one function twice, no reasoning for its severity', r.run.withheld3, r.run.text.slice(0, 900));
        check('[R] each basis is shown as checked: the system, the resource, the source document', r.run.basisShown, r.run.text.slice(0, 900));
        check('[R] a severity milder than the worst part is raised, and says so', r.run.raised, r.run.text.slice(0, 900));
        console.log('\n[A] Accept');
        check('[A] Accept writes one combined row with its checked basis and ANEM provenance, and a new FC ID', r.acc.clicked && r.acc.one && r.acc.basis === 'system:sys-fcs' && r.acc.ai && r.acc.sev === 'Catastrophic' && r.acc.fcId && r.acc.unique, JSON.stringify(r.acc));
        check('[A] the panel lists it with its basis', r.acc.listed, JSON.stringify(r.acc));
        check('[A] its reasoning is kept and shown: in the combined panel and in the FHA table', r.acc.why && r.acc.whyShown && r.acc.inTable, JSON.stringify(r.acc));
        check('[A] asking again does not propose it again (nothing to review, still one row)', r.again.noPanel && r.again.still === 1, JSON.stringify(r.again));
        console.log('\n[W] the writer');
        check('[W] refuses a combination with no reasoning, or a blank one', !r.w.noWhy.ok && /reasoning/.test(r.w.noWhy.why) && !r.w.blankWhy.ok && /reasoning/.test(r.w.blankWhy.why), JSON.stringify([r.w.noWhy, r.w.blankWhy]));
        check('[W] refuses a combination milder than its worst part', !r.w.milder.ok && /milder/.test(r.w.milder.why), JSON.stringify(r.w.milder));
        check('[W] refuses a combination of a combination, an unknown condition, the same set twice', !r.w.nested.ok && /itself a combination/.test(r.w.nested.why) && !r.w.unknown.ok && /FC-NOPE/.test(r.w.unknown.why) && !r.w.dup.ok && /already recorded/.test(r.w.dup.why), JSON.stringify(r.w));
        console.log('\n[S] a system');
        check('[S] each system\'s FHA has the panel and its own button, for that system only', r.sys.found && r.sys.enabled && /Flight Control System only/.test(r.sys.title || ''), JSON.stringify(r.sys));
        check('[S] it proposes from that system\'s conditions only, and withholds a pair from another level', r.sys.level && r.sys.noAcConds && r.sys.cards === 1 && r.sys.withheldWrongLevel, JSON.stringify(r.sys));
        check('[S] Accept writes to that system\'s FHA, not the aircraft\'s, and its panel lists it', r.sys.written && r.sys.notInAc && r.sys.listed, JSON.stringify(r.sys));
        console.log('\n[C] the chat');
        check('[C] the chat\'s add_combined_fc goes through the same check: an invented basis is refused with the reason', !r.chat.ok && /no basis in the project/.test(r.chat.err), JSON.stringify(r.chat));
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
