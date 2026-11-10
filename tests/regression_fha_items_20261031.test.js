/* regression_fha_items_20261031.test.js — Radia checklist items 3 and 5 on the FHA.
 *
 * Item 3: each combined failure condition is checked against the conditions it is made of (every part still there, no
 * part itself a combination, more than one function, at least as severe as its worst part, each part's class as it was
 * when the combination was assessed, the reasoning recorded), shown on its row in the combined panel.
 * Item 5: every classified row says why it is that class, No Safety Effect included. A row without a reason says so,
 * with "Draft with ANEM"; a line above the table counts them with one button for all; ANEM's draft waits on the row for
 * Accept, Edit or Discard, and ANEM never changes a class (a row whose effects read as another class gets a note).
 * Agreed 31 Oct 2026; items 4 and 19 dropped (the FHA is implementation agnostic).
 * MUTATION PROOFS: SL_FHAI_MUTATE=nocheck (the parts not checked), =keepclass (a reason naming another class taken as is),
 *   =nobar (no count line).
 * Run: node tests/regression_fha_items_20261031.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1200) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_FHAI_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'nocheck' && file === 'fc_variants.js') return body.replace("const gone = parts.filter(p => !p.row).map(p => p.id);", "const gone = [];");
    if (MUT === 'keepclass' && file === 'ai_assistant.js') return body.replace("if (dis || (reason && other.length && !new RegExp('\\\\b' + f.class + '\\\\b', 'i').test(reason))) {", "if (false) {");
    if (MUT === 'nobar' && file === 'helpers_modules.js') return body.replace("try { _fhaReasonBar('ac', 'ac-fha-body'); } catch (_) {}", "");
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const iCK = HTML.indexOf('comment_kinds.js?v=1.'), iAs = HTML.indexOf('assurance_modules.js?v=');
    check('fc_variants.js v2.2 is loaded', /fc_variants\.js\?v=2\.2/.test(HTML));
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
            const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { const v = fn(); if (v) return v; } catch (_) {} await wait(60); } return null; };
            _applyProjectData(data); await wait(1500);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            ['welcome-modal', 'signup-modal'].forEach(id => { const o = document.getElementById(id); if (o) o.classList.remove('show'); });
            const R = {}, V = window.SLFcVariants;
            const rk = { Catastrophic: 5, Hazardous: 4, Major: 3 };
            const cand = acFhaData.filter(f => f && f.fcId && !(f.combinedOf && f.combinedOf.length) && rk[f.severity] >= 3);
            const a = cand[0], b = cand.find(f => f.subId !== a.subId && f.fcId !== a.fcId);
            const res = V.createCombined('ac', [a.fcId, b.fcId], { severity: 'Catastrophic', fcDesc: 'Test combination', rationale: 'Both lost together leaves no backup.' });
            switchTab('ac-fha'); await wait(1200); try { renderACFHA(); } catch (_) {} await wait(400);
            const row = res.row;
            const chk = () => { const el = document.querySelector('#fcv-panel [data-fcv-check="' + row.fcId + '"]'); return el ? el.innerText : ''; };
            R.c = { made: res.ok, shown: chk(), checks: V.checkCombined(row, 'ac').map(c => (c.ok ? 'ok' : 'NO') + ': ' + c.text) };
            R.c.ok = /checked against its parts/.test(R.c.shown) && new RegExp(a.fcId).test(R.c.shown) && new RegExp(b.fcId).test(R.c.shown);
            const oldSev = b.severity; b.severity = b.severity === 'Major' ? 'Hazardous' : 'Major'; try { renderACFHA(); } catch (_) {} await wait(200);
            R.c.stale = /was .* now .*re-assess/.test(chk());
            b.severity = oldSev;
            const bi = acFhaData.indexOf(b); acFhaData.splice(bi, 1); try { renderACFHA(); } catch (_) {} await wait(200);
            R.c.gone = /no longer in this FHA/.test(chk()) && V.combinedIssues('ac').hard.some(t => /no longer in this FHA/.test(t));
            acFhaData.splice(bi, 0, b); try { renderACFHA(); } catch (_) {} await wait(200);
            // [5] rows without a reason (one No Safety Effect)
            const rows = acFhaData.filter(f => f && f.fcId && f.severity && !(f.combinedOf && f.combinedOf.length)).slice(0, 3);
            rows.forEach(f => { f.severityRationale = ''; });
            rows[2].severity = 'No Safety Effect';
            try { renderACFHA(); } catch (_) {} await wait(300);
            const k0 = 'ac:' + rows[0].internalId, k1 = 'ac:' + rows[1].internalId, k2 = 'ac:' + rows[2].internalId;
            const bar = document.getElementById('fha-reason-bar-ac');
            R.f = { missing: !!document.querySelector('[data-fha-reason-missing="' + k0 + '"]') && !!document.querySelector('[data-fha-reason-missing="' + k2 + '"]'), bar: !!bar && /no reason/.test(bar.innerText), barCount: bar ? parseInt(bar.innerText, 10) : 0, wantAtLeast: 3 };
            await window.slLoadAI(); await until(() => window.SafetyLabAI && window.SafetyLabAI.fhaReasonDraft, 20000);
            const sent = [];
            const other = rows[1].severity === 'Major' ? 'Catastrophic' : 'Major';
            window.AiClient = { isConfigured: () => true, messages: async (req) => { sent.push(req); return { content: [{ type: 'text', text: JSON.stringify({ reasons: [
                { key: k0, reason: 'The aircraft effect in the phases listed meets the ' + rows[0].severity + ' definition.' },
                { key: k1, reason: 'The crew effect reads as ' + other + '.' },
                { key: k2, reason: 'No effect on capability, safety margins, crew workload or occupants in any phase.' },
                { key: 'ac:nope', reason: 'x' } ] }) }], model: 'test-model', stop_reason: 'end_turn' }; } };
            const sev1 = rows[1].severity;
            await fhaReasonDraft([k0, k1, k2]); await wait(400);
            const D = window.SLFhaReasonDrafts;
            R.f.drafts = Object.keys(D).filter(k => [k0, k1, k2].indexOf(k) >= 0).length;
            R.f.noteOn1 = !!(D[k1] && /Check the class/.test(D[k1].note || ''));
            R.f.classSame = rows[1].severity === sev1;
            R.f.notWritten = !rows[0].severityRationale;
            R.f.draftShown = !!document.querySelector('[data-fha-reason-draft="' + k0 + '"]');
            R.f.sentKeys = /ac:/.test(JSON.stringify(sent[0] && sent[0].messages));
            fhaReasonAccept(k0); fhaReasonDiscard(k1);
            window.slPrompt = async (m, d) => d + ' (edited)';
            await fhaReasonEdit(k2);
            R.f.accepted = /meets the/.test(rows[0].severityRationale || '');
            R.f.discarded = !rows[1].severityRationale && !D[k1];
            R.f.edited = /\(edited\)$/.test(rows[2].severityRationale || '') && rows[2].severity === 'No Safety Effect';
            try { renderACFHA(); } catch (_) {} await wait(300);
            R.f.whyShown = !!Array.from(document.querySelectorAll('#ac-fha-body .fha-why')).find(e => /Why this severity:.*meets the/.test(e.innerText));
            return R;
        }, demo.data), 200000, 'the browser step');
        console.log('\n[3] combined conditions checked against their parts');
        check('[3] the row shows its parts with their classes and "checked against its parts"', r.c.made && r.c.ok, JSON.stringify(r.c));
        check('[3] a part whose class changed since the combination was assessed is flagged', r.c.stale, JSON.stringify(r.c));
        check('[3] a part no longer in the FHA is flagged on the row and counted as a failed check', r.c.gone, JSON.stringify(r.c));
        console.log('\n[5] the reason for each class');
        check('[5] a classified row with no reason says so (No Safety Effect too), and the line above the table counts them', r.f.missing && r.f.bar && r.f.barCount >= r.f.wantAtLeast, JSON.stringify(r.f));
        check('[5] ANEM drafts a reason per row asked for; an unknown key is ignored; nothing written until Accept', r.f.drafts === 3 && r.f.notWritten && r.f.draftShown && r.f.sentKeys, JSON.stringify(r.f));
        check('[5] a reason that reads as another class becomes a note to check the class; the class is not changed', r.f.noteOn1 && r.f.classSame, JSON.stringify(r.f));
        check('[5] Accept writes the reason, Discard drops it, Edit writes the edited text (No Safety Effect stays)', r.f.accepted && r.f.discarded && r.f.edited && r.f.whyShown, JSON.stringify(r.f));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) {
        check('test crashed: ' + (e && e.stack || e), false);
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
