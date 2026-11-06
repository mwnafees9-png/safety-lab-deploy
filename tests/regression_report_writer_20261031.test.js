/* regression_report_writer_20261031.test.js — one writer for every report (Radia checklist items 20, 22, 23, 24, 25).
 *
 * Agreed 31 Oct 2026: every Word and PDF report carries a contents page, a list of tables and a list of figures,
 * each entry linked; every table and figure is numbered with a caption; cross references in the prose resolve to
 * "Table N" / "Figure N" / "Section ..." and link; fault trees print on landscape sheets at 7.5 pt, never scaled
 * down, split at transfers and at branches that do not fit, with every event on some sheet; numbers in exponent
 * form follow the significant figures setting; on the next issue only the ticked sections update from the project,
 * the others are written exactly as issued (tables included); before generating, typed numbers that are no longer
 * a value in the project and references that point at nothing are listed, and generating then needs "Generate
 * anyway". The one-shot path (Reports.generate) uses the same writer.
 * MUTATION PROOFS: SL_RW_MUTATE=notoc (no contents), =scale (trees scaled to fit), =nokeep (unticked sections
 *   rebuilt from the project), =nocheck (no checks before generating), =nosig (significant figures ignored).
 * Run: node tests/regression_report_writer_20261031.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1500) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_RW_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'notoc' && file === 'report_writer.js') return body.replace("front.push(listHead('Contents'));", '').replace("hd(); front.forEach(en);", '').replace("head('Contents'); front.forEach(entry);", '');
    if (MUT === 'scale' && file === 'report_writer.js') return body.replace("doc.addImage(s.dataUrl, 'PNG', LM, LM + 20, s.w, s.h);", "doc.addImage(s.dataUrl, 'PNG', LM, LM + 20, s.w * 0.8, s.h * 0.8);").replace("transformation: { width: Math.round(s.w * 96 / 72), height: Math.round(s.h * 96 / 72) }", "transformation: { width: Math.round(s.w * 0.8 * 96 / 72), height: Math.round(s.h * 0.8 * 96 / 72) }");
    if (MUT === 'nokeep' && file === 'reports.js') return body.replace("const sec = sections[i], kept = keep[sec.id] || null;", "const sec = sections[i], kept = null;");
    if (MUT === 'nocheck' && file === 'reports.js') return body.replace("if (checks.length) { status.style.color", "if (false) { status.style.color");
    if (MUT === 'nosig' && file === 'report_writer.js') return body.replace("n = Number(n); if (!(n >= 1 && n <= 6)) return S(text);", "return S(text);");
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('fta_print.js and report_writer.js load right before reports.js', /fta_print\.js\?v=1\.\d+" defer><\/script>\s*<script src="report_writer\.js\?v=1\.\d+" defer><\/script>\s*(<!--[^>]*-->\s*<script src="(report_ai|markov_ai)\.js\?v=[\d.]+" defer><\/script>\s*)*<script src="reports\.js\?v=/.test(HTML));
    const REP = fs.readFileSync(path.join(SITE, 'reports.js'), 'utf8');
    check('no renderer keeps its own list of table tokens or draws the canvas picture of a tree any more', !/_renderFTAImagesV2|_renderFTAAppendixImages/.test(REP) && !/fta_summary_grid\|cma_grid\|coffe_table\|validation_matrix[^\n]*appendix:fta/.test(REP));
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:kestrel');
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.addInitScript(() => { try { localStorage.setItem('safetyLab.ai.enabled', '1'); } catch (_) {} window.SL_VERIFY_SYNC_OFF = true; window.SL_FC_TREES_OFF = true; window.SL_FC_LINK_OFF = true; window.SafetyLabAssumptionsGate = async () => true; });
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        const r = await within(page.evaluate(async (data) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            _applyProjectData(data); await wait(1500);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            ['welcome-modal', 'signup-modal'].forEach(id => { const o = document.getElementById(id); if (o) o.classList.remove('show'); });
            window.SafetyLabAssumptionsGate = async () => true;
            const R = {}, W = window.SLReportWriter, P = window.SLFtaPrint;
            const JZ = window.JSZip || (typeof _loadJSZip === 'function' ? await _loadJSZip() : null);
            const xmlOf = async (blob) => { const z = await JZ.loadAsync(await blob.arrayBuffer()); return z.file('word/document.xml').async('string'); };
            // capture files instead of downloading them
            const saved = [];
            if (typeof SaveFs !== 'undefined') SaveFs.saveBlob = async (b, n) => { saved.push({ b, n }); return { ok: true }; };
            else window.SaveFs = { saveBlob: async (b, n) => { saved.push({ b, n }); return { ok: true }; } };
            window._savePdf = async (d, n) => { saved.push({ pdf: d, n }); };

            // [T] the trees
            const pages = ftaPages.filter(p => p.root);
            // one deliberately wide tree: 14 inputs under one OR
            const wideRoot = { id: 'wide-r', displayId: 'G-W', type: 'gate', gateType: 'OR', name: 'Wide test tree top', children: Array.from({ length: 14 }, (_, i) => ({ id: 'wide-e' + i, displayId: 'E-W' + i, type: 'basic', name: 'Wide test event ' + i, inputMode: 'lambda', lambda: 1.23456e-5, children: [] })) };
            const wide = { id: 'wide-page', name: 'Wide test tree', root: wideRoot };
            const sheets = P.plan(pages.concat([wide]));
            const sizes = sheets.flatMap(s => (s.svg.match(/font-size="([\d.]+)"/g) || []).map(x => Number(x.replace(/\D+([\d.]+)\D*/, '$1'))));
            const cover = pages.concat([wide]).map(pg => { const want = new Set(); (function w(n) { if (!n) return; want.add(String(n.id)); if (!(n.gateType === 'TRANSFER' || n.transferOutTo)) (n.children || []).forEach(w); })(pg.root); const got = new Set(sheets.filter(s => s.pageId === pg.id).flatMap(s => s.ids)); return [...want].every(x => got.has(x)); });
            const transfers = sheets.filter(s => /Transfer: sheet \d+/.test(s.svg)).length;
            const tCount = pages.reduce((n, pg) => { let c = 0; (function w(x) { if (!x) return; if (x.gateType === 'TRANSFER' && pages.some(p => p.id === x.linkedPageId)) c++; (x.children || []).forEach(w); })(pg.root); return n + c; }, 0);
            const wideSheets = sheets.filter(s => s.pageId === 'wide-page');
            R.t = { sheets: sheets.length, minFs: Math.min(...sizes), fits: sheets.every(s => s.slots <= P.MAX_W && s.depth <= P.MAX_L), cover: cover.every(Boolean), transfers, tCount,
                    wide: wideSheets.length >= 3 && /Continued on sheet/.test(wideSheets[0].svg) && /From sheet/.test(wideSheets[1].svg) && /Inputs \d+ to 14/.test(wideSheets[1].caption) };
            const png = await P.png(sheets[0], 3); R.t.png = /^data:image\/png;base64,/.test(png) && png.length > 2000;

            // [W] the writer, Word
            const sys = systemsData.find(sy => ftaPages.some(p => String(p.systemId) === String(sy.id) && p.root));
            projectConfig.reportSigFigs = 2;
            const d = Reports.extractData('SSA', { systemId: sys.id });
            d.fha_table = (d.fha_table && d.fha_table.length ? d.fha_table : [{ 'FC ID': 'FC-T1' }]).map((row, i) => i === 0 ? Object.assign({}, row, { 'Test P': '1.23456E-7' }) : row);
            const md = Reports.DEFAULT_TEMPLATES.SSA.replace('## 2. Compliance to SFHA Objectives', '## 2. Compliance to SFHA Objectives\nThe conditions are in {{ref:fha_table}}; the first tree is {{ref:fta}}; see also {{ref:sec:3. Verified System Requirements}} and {{ref:nothing_here}}.');
            const secs = Reports.parseMarkdownToSections(md);
            const blob = await Reports.renderDocxFromSections('SSA', d, secs, {}, { appendices: { fta: true } });
            const x = await xmlOf(blob);
            const tocRefs = (x.match(/PAGEREF sl_[a-z0-9]+/g) || []);
            R.w = { contents: />Contents</.test(x), lot: />List of Tables</.test(x), lof: />List of Figures</.test(x), tocRefs: tocRefs.length,
                    captions: /Table 1: /.test(x) && /Figure 1: /.test(x), refTable: /w:anchor="sl_t\d+"[^>]*>(?:(?!<\/w:hyperlink>).)*Table \d+/.test(x), refFig: /Figure \d+<\/w:t>/.test(x),
                    refSec: /Section “3\. Verified System Requirements”/.test(x), missing: /reference not found: nothing_here/.test(x),
                    landscape: (x.match(/w:orient="landscape"/g) || []).length, natural: (x.match(/<wp:extent cx="9144000" cy="6353175"\/>/g) || []).length,
                    sig: /1\.2E-7/.test(x) && !/1\.23456E-7/.test(x), noTokens: !/\{\{[a-z_]+\}\}/.test(x.replace(/\{\{ref:[^}]+\}\}/g, '')) };
            const settings = await (async () => { const z = await JZ.loadAsync(await blob.arrayBuffer()); return z.file('word/settings.xml').async('string'); })();
            R.w.updateFields = /updateFields/.test(settings);
            // [W] the writer, PDF
            const { jsPDF } = await _loadJsPDF();
            const pdf = await Reports.renderPdfFromSections('SSA', d, secs, {}, { appendices: { fta: true } });
            const pdfOut = pdf.output();
            const anchors = pdf.__slAnchors || {};
            R.p = { front: pdf.__slFrontPages >= 1, anchors: Object.keys(anchors).length, links: (pdfOut.match(/\/Subtype \/Link/g) || []).length,
                    landscape: (pdfOut.match(/MediaBox \[0 0 792\.? 612\.?\]/g) || []).length, figOnLandscape: !!anchors.sl_f1 };
            // [1] the one-shot path uses the same writer
            const one = await Reports.generate({ reportType: 'SSA', format: 'docx', systemId: sys.id, appendices: { fta: true } }).catch(e => ({ err: e.message }));
            const oneFile = saved.find(s => s.b && /\.docx$/.test(s.n));
            R.one = { ok: !!(one && one.ok), toc: oneFile ? />Contents</.test(await xmlOf(oneFile.b)) : false };

            // [K] [N] the dialog: first issue, then only the ticked sections update; checks before generating
            delete (window.projectReportEdits || {})['__issued:SSA:' + sys.id];
            Object.keys(window.projectReportEdits.SSA || {}).forEach(k => delete window.projectReportEdits.SSA[k]);
            Reports.open('SSA', { systemId: sys.id });
            document.getElementById('rpt-type').value = 'SSA'; document.getElementById('rpt-type').onchange && document.getElementById('rpt-type').onchange();
            document.getElementById('rpt-system').value = sys.id;
            await Reports._continue(); await wait(200);
            R.k = { firstBar: /First issue of this report/.test((document.getElementById('rpt-issue-bar') || {}).textContent || '') };
            saved.length = 0;
            await Reports._submit(); { const t0 = Date.now(); while (!saved.length && Date.now() - t0 < 20000 && !(document.getElementById('rpt-checks') && document.getElementById('rpt-checks').style.display === 'block')) await wait(100); }
            R.k.firstSaved = saved.length === 1;
            const iss = (window.projectReportEdits || {})['__issued:SSA:' + sys.id];
            R.k.recorded = !!(iss && iss.sections && Object.keys(iss.sections).length > 3);
            // the project changes: a requirement's text
            const st0 = Reports._wsa.state ? null : null;
            const reqSec = Reports.parseMarkdownToSections(Reports.DEFAULT_TEMPLATES.SSA).find(s => /\{\{requirements_table\}\}/.test(s.prose));
            const oldRows = JSON.stringify(iss.sections[reqSec.id].tables.requirements_table || []);
            const rq = (sys.req || []).find(x => x && !x.deleted);
            if (rq) rq.text = 'CHANGED AFTER ISSUE: ' + rq.text;
            Reports.close(); Reports.open('SSA', { systemId: sys.id });
            document.getElementById('rpt-type').value = 'SSA'; document.getElementById('rpt-system').value = sys.id;
            await Reports._continue(); await wait(200);
            const bar = document.getElementById('rpt-issue-bar');
            const cb = document.querySelector('[data-rpt-update="' + reqSec.id + '"]');
            const changedPill = cb && cb.closest('div').querySelector('[data-rpt-changed]');
            const taReq = document.querySelector('textarea[data-section-id="' + reqSec.id + '"]');
            R.k.second = { bar: !!bar && /Last issued/.test(bar.textContent), unticked: !!cb && !cb.checked, changed: !!changedPill && changedPill.getAttribute('data-rpt-changed') === '1', readOnly: !!taReq && taReq.readOnly };
            // generate with the section kept: the old rows
            saved.length = 0;
            Reports._modalState.checksAck = true;
            await Reports._submit(); { const t0 = Date.now(); while (!saved.length && Date.now() - t0 < 20000 && !(document.getElementById('rpt-checks') && document.getElementById('rpt-checks').style.display === 'block')) await wait(100); }
            const keptXml = saved[0] && saved[0].b ? await xmlOf(saved[0].b) : '';
            R.k.keptOld = !!rq && !/CHANGED AFTER ISSUE/.test(keptXml) && keptXml.length > 1000;
            // tick it: the new rows
            Reports.close(); Reports.open('SSA', { systemId: sys.id });
            document.getElementById('rpt-type').value = 'SSA'; document.getElementById('rpt-system').value = sys.id;
            await Reports._continue(); await wait(200);
            const cb2 = document.querySelector('[data-rpt-update="' + reqSec.id + '"]'); cb2.checked = true; cb2.onchange();
            saved.length = 0; Reports._modalState.checksAck = true;
            await Reports._submit(); { const t0 = Date.now(); while (!saved.length && Date.now() - t0 < 20000 && !(document.getElementById('rpt-checks') && document.getElementById('rpt-checks').style.display === 'block')) await wait(100); }
            const newXml = saved[0] && saved[0].b ? await xmlOf(saved[0].b) : '';
            R.k.tickedNew = /CHANGED AFTER ISSUE/.test(newXml);
            R.k.oldRows = oldRows.length > 2;

            // [N] a typed number that is no longer in the project
            Reports.close(); Reports.open('SSA', { systemId: sys.id });
            document.getElementById('rpt-type').value = 'SSA'; document.getElementById('rpt-system').value = sys.id;
            await Reports._continue(); await wait(200);
            document.querySelectorAll('[data-rpt-update]').forEach(c => { c.checked = true; c.onchange && c.onchange(); });
            const purpose = document.querySelector('textarea[data-section-id]:not([readonly])');
            const tas = [...document.querySelectorAll('#rpt-section-editor textarea[data-section-id]')].filter(t => !t.readOnly);
            const ta1 = tas[1] || tas[0];
            ta1.value = ta1.value + '\nThe top event probability is 7.77E-11.'; ta1.dispatchEvent(new Event('input'));
            saved.length = 0;
            await Reports._submit(); { const t0 = Date.now(); while (!saved.length && Date.now() - t0 < 20000 && !(document.getElementById('rpt-checks') && document.getElementById('rpt-checks').style.display === 'block')) await wait(100); }
            const checksHost = document.getElementById('rpt-checks');
            R.n = { blocked: saved.length === 0, listed: !!checksHost && checksHost.style.display !== 'none' && /7\.77E-11/.test(checksHost.textContent), anyway: !!document.getElementById('rpt-generate-anyway') };
            document.getElementById('rpt-generate-anyway').click(); { const t0 = Date.now(); while (!saved.length && Date.now() - t0 < 20000) await wait(100); }
            R.n.after = saved.length === 1;
            // the reference menu inserts a working reference
            Reports.close(); Reports.open('SSA', { systemId: sys.id });
            document.getElementById('rpt-type').value = 'SSA'; document.getElementById('rpt-system').value = sys.id;
            await Reports._continue(); await wait(200);
            const cbR = document.querySelector('[data-rpt-update]'); if (cbR) { cbR.checked = true; cbR.onchange(); }
            const sel = document.querySelector('[data-rpt-insert-ref]');
            const opt = sel && [...sel.options].find(o => /\{\{ref:requirements_table\}\}/.test(o.value));
            if (opt) { const ta2 = document.querySelector('textarea[data-section-id="' + sel.getAttribute('data-rpt-insert-ref') + '"]'); ta2.selectionStart = ta2.selectionEnd = ta2.value.length; sel.value = opt.value; sel.onchange(); R.ref = { inserted: /\{\{ref:requirements_table\}\}/.test(ta2.value) }; }
            else R.ref = { inserted: false, opts: sel ? [...sel.options].map(o => o.value).slice(0, 6) : 'no menu' };
            Reports.close();
            // [A] the AI-draft layer reaches the same dialog state
            Reports._modalState = { reportType: 'SSA', probe: 1 };
            R.a = Reports._wsa.state() && Reports._wsa.state().probe === 1;
            Reports._modalState = null;
            return R;
        }, demo.data), 280000, 'the browser step');
        console.log('\n[T] the trees');
        check('[T] every text on every sheet is at least 7 pt, every sheet fits without scaling, every event is on a sheet', r.t.minFs >= 7 && r.t.fits && r.t.cover, JSON.stringify(r.t));
        check('[T] a transfer names the sheet its tree starts on; a gate too wide for a sheet continues on the next with its inputs named', r.t.transfers >= Math.min(1, r.t.tCount) && r.t.wide && r.t.png, JSON.stringify(r.t));
        console.log('\n[W] the writer');
        check('[W] Word: contents, list of tables and list of figures, each entry with its page field; Word updates them on open', r.w.contents && r.w.lot && r.w.lof && r.w.tocRefs > 5 && r.w.updateFields, JSON.stringify(r.w));
        check('[W] Word: numbered captions; references written as Table N / Figure N / Section and linked; a bad one shows', r.w.captions && r.w.refTable && r.w.refFig && r.w.refSec && r.w.missing, JSON.stringify(r.w));
        check('[W] Word: each tree sheet on a landscape page at natural size (10 in by 6.9 in, nothing scaled)', r.w.landscape >= 1 && r.w.natural === r.w.landscape, JSON.stringify(r.w));
        check('[W] Word: numbers follow the significant figures setting; no table token is left as text', r.w.sig && r.w.noTokens, JSON.stringify(r.w));
        check('[W] PDF: the same front lists with links, and the trees on landscape pages', r.p.front && r.p.anchors > 10 && r.p.links > 10 && r.p.landscape >= 1 && r.p.figOnLandscape, JSON.stringify(r.p));
        check('[1] the one-shot generate path writes the same report (contents included)', r.one.ok && r.one.toc, JSON.stringify(r.one));
        console.log('\n[K] update only the ticked sections');
        check('[K] the first issue builds every section and records what each said', r.k.firstBar && r.k.firstSaved && r.k.recorded, JSON.stringify(r.k));
        check('[K] next time each section is kept as issued unless ticked, and a changed one says so', r.k.second.bar && r.k.second.unticked && r.k.second.changed && r.k.second.readOnly, JSON.stringify(r.k));
        check('[K] a kept section is written exactly as issued, tables included; ticked, it takes the project as it is now', r.k.keptOld && r.k.tickedNew && r.k.oldRows, JSON.stringify(r.k));
        console.log('\n[N] checks before generating');
        check('[N] a typed number that is not a value in the project stops the generate and is listed; "Generate anyway" goes on', r.n.blocked && r.n.listed && r.n.anyway && r.n.after, JSON.stringify(r.n));
        check('[R] the Insert a reference menu puts a working reference in the prose', r.ref.inserted, JSON.stringify(r.ref));
        check('[A] the AI-draft layer and the dialog share one state', r.a === true, JSON.stringify(r.a));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) {
        check('test crashed: ' + (e && e.stack || e), false);
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
