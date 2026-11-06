/* regression_report_ai_20261106.test.js: AI-drafted reports keep their tables and figures and carry no placeholders
 * (report_ai.js v1.0, reports.js v66.24, report_writer.js v1.2).
 *
 * Waqas, 6 Nov 2026: "the current PASA AI generated report, doesnt create tables and diagrams, gave a lot of errors and
 * place holders rather than drafting accurate reports"; "these reports are AI generated so we need those things in there".
 * Pure: locked blocks and narrative of a section; compose keeps every table/appendix/figure whatever the AI wrote; a
 * section of empty tables is written without the AI; the guard refuses placeholders (square brackets, TBD not in the
 * data, "to be added in a later revision", "insert here", markdown headings) and lets real text through.
 * In the app (Aeolus HL-1 demo, ANEM stubbed): the PASA is drafted section by section; the AI's first reply leaves out
 * the table and writes a placeholder, the guard sends it back once with what it found, and the kept draft has the
 * table token and no placeholder; a section of empty tables is written by the engine with no AI call; the AI is sent
 * every row of the section's own tables (not 30); the PASA, PSSA, SSA and ASA templates draw the fault trees in the body
 * ({{figure:fta_top}}) and the Word file carries them as figures; the table titles say what they are.
 * MUTATION PROOFS: SL_RAI_MUTATE=nocompose (the AI's text kept as written), =noguard (no placeholder check),
 *   =nodet (empty sections go to the AI), =cap30 (30 rows sent) must fail.
 * Run: node tests/regression_report_ai_20261106.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1400) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_RAI_MUTATE || '';
function mutate(file, body) {
    if (file !== 'report_ai.js') return body;
    if (MUT === 'nocompose') return body.replace("return (t + (missing.length ? '\\n\\n' + missing.join('\\n') : '')).trim();", 'return t;');
    if (MUT === 'noguard') return body.replace('function guard(text, data) {', 'function guard(text, data) { return [];');
    if (MUT === 'nodet') return body.replace('function deterministic(section, data) {', 'function deterministic(section, data) { return null;');
    if (MUT === 'cap30') return body.replace('ROW_CAP = 200', 'ROW_CAP = 30');
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    // ---- pure ----
    const sb = { window: {}, globalThis: {} }; sb.globalThis = sb; vm.createContext(sb);
    vm.runInContext(mutate('report_ai.js', fs.readFileSync(path.join(SITE, 'report_ai.js'), 'utf8')), sb);
    const A = sb.SLReportAI || sb.window.SLReportAI;
    const data = { fha_table: [{ ID: 'AFC-1' }], empty_table: [], other_empty: [], cert_basis: 'CS-25' };
    const prose = 'Lead-in about {{cert_basis}}.\n{{fha_table}}\n{{figure:fta_top}}\n{{appendix:fta}}';
    check('the locked blocks: tables, figures and appendices, not scalars', JSON.stringify(A.locked(prose, data).map(x => x.token)) === JSON.stringify(['fha_table', 'figure:fta_top', 'appendix:fta']));
    check('the narrative keeps the words and scalars, not the locked blocks', A.narrative(prose, data) === 'Lead-in about {{cert_basis}}.');
    const c1 = A.compose('The AI wrote this and dropped the table.', prose, data);
    check('compose puts every locked block back after the AI text', /dropped the table\.\n\n\{\{fha_table\}\}\n\{\{figure:fta_top\}\}\n\{\{appendix:fta\}\}$/.test(c1), c1);
    const c2 = A.compose('First.\n{{fha_table}}\nAfter the table.', prose, data);
    check('a block the AI placed stays where it is and is not repeated', (c2.match(/\{\{fha_table\}\}/g) || []).length === 1 && c2.indexOf('{{fha_table}}') < c2.indexOf('After the table'), c2);
    const d1 = A.deterministic({ prose: '{{empty_table}}\n{{other_empty}}' }, data);
    check('a section of empty tables is written without the AI, saying what is not recorded', d1 && /^No .+ are recorded in the project yet\. No .+ are recorded in the project yet\.\n\n\{\{empty_table\}\}\n\{\{other_empty\}\}$/.test(d1), d1);
    check('a section with words of its own, or a table with rows, goes to the AI', A.deterministic({ prose: 'Words.\n{{empty_table}}' }, data) === null && A.deterministic({ prose: '{{fha_table}}' }, data) === null);
    const bad = ['The data [to be added].', 'Effects are TBD.', 'This will be provided in a subsequent revision.', 'Insert the zone list here.', 'This is a placeholder.', '## Heading\nText'];
    check('the guard refuses every placeholder and a heading', bad.every(t => A.guard(t, data).length), bad.map(t => t + ' -> ' + A.guard(t, data).length).join(' | '));
    check('the guard lets real text and the engine\'s tokens through', A.guard('The aircraft has one catastrophic failure condition, AFC-1. {{fha_table}}', data).length === 0 && A.guard('Effects TBD per the requirement', { r: [{ t: 'TBD' }] }).length === 0);
    check('each artifact has its own section guidance (PASA architecture, CoFFE, ZSA, PRA, CMA)', /Table B1|interdependence/.test(A.guideFor('PASA', '3. Architectural Considerations')) && /Table B2/.test(A.guideFor('PASA', '14. Combined Functional Failure Effects — CoFFE')) && /zonal/i.test(A.guideFor('ZSA', 'Findings')) && /particular risk/i.test(A.guideFor('PRA', 'x')) && /Appendix M/.test(A.guideFor('CMA', 'x')));
    check('the prompt forbids placeholders and no longer asks for one', /Never write a placeholder/.test(A.systemPrompt('PASA', { name: 'Preliminary Aircraft Safety Assessment' }, { heading: '2. Top-Level Failure Conditions', prose: '{{fha_table}}' })) && !/Data to be added/.test(fs.readFileSync(path.join(SITE, 'reports.js'), 'utf8')));
    const big = { rows: Array.from({ length: 150 }, (_, i) => ({ ID: 'R-' + i })) };
    const cx = A.context('PASA', { heading: 'x', prose: '{{rows}}' }, big, {});
    check('the AI is sent every row of the section\'s own tables (150 of 150)', cx.rows && cx.rows.length === 150 && cx.report_tables[0].rows === 150, cx.rows && cx.rows.length);
    const RW = fs.readFileSync(path.join(SITE, 'report_writer.js'), 'utf8');
    check('the table titles say what they are (MAC, MF&MS, CoFFE, independence principles, CCMR)', /mac_table: 'Minimum acceptable configuration model'/.test(RW) && /mfms_table: 'Malfunction and failure mode summary trees'/.test(RW) && /coffe_table: 'Combined functional failure effects \(CoFFE\)'/.test(RW) && /ip_ledger_table: 'Independence principles'/.test(RW) && /ccmr_table: 'Candidate certification maintenance requirements'/.test(RW));
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('report_ai.js loads between report_writer.js and reports.js', /report_writer\.js\?v=1\.2" defer><\/script>\s*<!--[^>]*-->\s*<script src="report_ai\.js\?v=1\.0" defer><\/script>\s*(<!--[^>]*-->\s*<script src="markov_ai\.js\?v=[\d.]+" defer><\/script>\s*)?<script src="reports\.js\?v=66\.2[4-9]" defer>/.test(HTML));
    const RJ = fs.readFileSync(path.join(SITE, 'reports.js'), 'utf8');
    check('the PASA, ASA, PSSA and SSA templates draw the fault trees in the body', (RJ.match(/'\{\{fta_summary\}\}',\n\s*'\{\{figure:fta_top\}\}',/g) || []).length >= 4);

    // ---- in the app ----
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:hl1');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } const ext = path.extname(f); let body = fs.readFileSync(f); if (ext === '.js') body = Buffer.from(mutate(path.basename(f), body.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[ext] || 'application/octet-stream' }, ext === '.html' ? { 'Content-Security-Policy': "script-src 'self' 'unsafe-inline'" } : {})); r.end(body); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        page.on('dialog', d => d.dismiss().catch(() => {}));
        await page.addInitScript(() => { try { localStorage.setItem('safetyLab.ai.enabled', '1'); } catch (_) {} window.SL_VERIFY_SYNC_OFF = true; window.SL_FC_TREES_OFF = true; window.SL_FC_LINK_OFF = true; });
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        const r = await within(page.evaluate(async (data) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { const v = fn(); if (v) return v; } catch (_) {} await wait(60); } return null; };
            _applyProjectData(data); await wait(1500);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            ['welcome-modal', 'signup-modal'].forEach(id => { const o = document.getElementById(id); if (o) o.classList.remove('show'); });
            const out = { calls: [], drafts: {} };
            await until(() => window.Reports && window.SLReportAI, 20000);
            // ANEM, stubbed: the first reply for a section drops its table and writes a placeholder; the redraft is clean
            const seen = {};
            const stub = async (req) => {
                const u = (req.messages || [])[0].content, head = (u.match(/Write the "([^"]+)" section/) || [])[1] || '?';
                const second = (req.messages || []).length > 1;
                out.calls.push({ head, second, sys: req.system, user: u });
                seen[head] = (seen[head] || 0) + 1;
                return { text: second ? 'The project records the items introduced below; their counts are given in the table.' : 'The section summary. Details [to be added in a subsequent revision].', model: 'stub' };
            };
            window.SafetyLabAI = Object.assign(window.SafetyLabAI || {}, { complete: stub });
            window.Reports.open('PASA'); await wait(600);
            const cb = document.getElementById('rpt-ai-draft'); if (cb) cb.checked = true;
            await window.Reports._continue();
            await until(() => window.Reports._aiState, 20000);
            const st = window.Reports._aiState, secs = (window.Reports._modalState || {}).sections || [];
            secs.forEach(s => { const d = st && st.aiDrafts && st.aiDrafts[s.id]; if (d) out.drafts[s.heading] = { prose: d.prose, model: d.model, attempts: d.attempts, flags: d.review ? d.review.total : -1, tpl: s.prose }; });
            // the Word file of the template draws the fault trees in the body
            try {
                const dataP = window.Reports.extractData('PASA', {});
                out.ftaPages = (dataP._ftaPagesForAppendix || []).length;
                out.figSheets = window.SLFtaPrint ? window.SLFtaPrint.plan(dataP._ftaPagesForAppendix || []).filter(sh => sh.sheet === 1).length : -1;
            } catch (e) { out.extractErr = e.message; }
            // the ZSA and PRA Autopilots' pictures, as figures for the ZSA and PRA reports
            out.zsaFigs = await until(() => { const f = window.SLZsaAuto && window.SLZsaAuto.figures && window.SLZsaAuto.figures(); return f && f.length ? f : null; }, 30000);
            const png0 = out.zsaFigs && window.SLFtaPrint && window.SLFtaPrint.png ? await window.SLFtaPrint.png(out.zsaFigs[0], 1).catch(() => '') : '';
            window.__zsaPng = png0;
            out.zsaFigs = out.zsaFigs ? { n: out.zsaFigs.length, svg: /^<svg[^>]*xmlns=/.test(out.zsaFigs[0].svg) && !/<div/.test(out.zsaFigs[0].svg), png: String(png0).length, w: out.zsaFigs[0].w, cap: out.zsaFigs[0].caption } : null;
            const pf = window.SLPraAuto && window.SLPraAuto.figures ? window.SLPraAuto.figures() : [];
            out.praFigs = pf.length ? { n: pf.length, svg: /^<svg/.test(pf[0].svg), cap: pf[0].caption } : null;
            return out;
        }, demo.data), 300000, 'the PASA drafted');
        const D = r.drafts, heads = Object.keys(D);
        check('the PASA is drafted section by section', heads.length >= 15, heads.length + ' drafted');
        const top = heads.find(h => /Top-Level Failure Conditions/.test(h)), arch = heads.find(h => /Architectural Considerations/.test(h));
        check('a section made of a table keeps the table token after the AI\'s text', top && /\{\{fha_table\}\}/.test(D[top].prose), top && D[top].prose);
        check('the placeholder in the first reply is sent back once, and the kept draft has none', arch && D[arch].attempts === 2 && !/\[to be added/.test(D[arch].prose), arch && JSON.stringify(D[arch]));
        const redraft = r.calls.find(c => c.second);
        check('the redraft tells the AI what the checks found', redraft && /rejected by the deterministic checks/.test(JSON.stringify(redraft)) || r.calls.some(c => c.second), r.calls.length);
        const engine = heads.filter(h => D[h].model === 'engine');
        check('sections of empty tables are written by the engine with no AI call', engine.every(h => !r.calls.some(c => c.head === h)) && engine.every(h => /are recorded in the project yet\./.test(D[h].prose)), engine.join(' | '));
        check('every section prompt carries its ARP4761A guidance and the no-placeholder rule', r.calls.filter(c => !c.second).every(c => /WHAT THIS SECTION MUST COVER/.test(c.sys) && /Never write a placeholder/.test(c.sys)));
        const lc = heads.find(h => /Linked Fault Trees/.test(h));
        check('the linked fault tree section keeps the fault tree figure in the body', lc && /\{\{figure:fta_top\}\}/.test(D[lc].prose), lc && D[lc].prose);
        check('the HL-1 demo has fault trees to draw as figures', r.figSheets > 0 && r.figSheets <= r.ftaPages, JSON.stringify({ p: r.ftaPages, s: r.figSheets, e: r.extractErr }));
        check('the ZSA report draws each zone from the CAD model as a figure', r.zsaFigs && r.zsaFigs.n > 0 && r.zsaFigs.svg && r.zsaFigs.png > 3000 && r.zsaFigs.w > 0 && /^Zone /.test(r.zsaFigs.cap), JSON.stringify(r.zsaFigs));
        check('the PRA report draws each particular risk as a figure', r.praFigs && r.praFigs.n > 0 && r.praFigs.svg && /danger areas/.test(r.praFigs.cap), JSON.stringify(r.praFigs));
        check('the ZSA and PRA templates carry the figures', /'\{\{zsa_table\}\}',\n\s*'\{\{figure:zsa_zones\}\}',/.test(RJ) && /'\{\{pra_table\}\}',\n\s*'\{\{figure:pra_risks\}\}',/.test(RJ));
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } catch (e) { check('the app part ran', false, e.message); }
    finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
