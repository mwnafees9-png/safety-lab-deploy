/* regression_rate_sources_20261031.test.js — every failure rate names its source (rate_sources.js v1.0, Radia item 16).
 *
 * Agreed 31 Oct 2026 (mockup "Where each failure rate comes from"): a Source for each basic event (supplier guarantee,
 * field data, calculated, library entry, engineering judgment) with its reference and date; a library-set event cites
 * its entry by itself; a rate with no source shows on the canvas warning pill and in the SSA table; a table of every
 * event that exports; ANEM only finds a matching library entry, never types a rate, and a match applies only on Accept
 * ("Cite it" keeps the typed rate, "Use" sets the event from the library).
 * MUTATION PROOFS: SL_RS_MUTATE=nowarn (no warning), =anykey (ANEM's unknown library keys kept), =notable (the table token not rendered as a table), =nolib (a library
 *   event not counted as sourced).
 * Run: node tests/regression_rate_sources_20261031.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1200) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_RS_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'notable' && file === 'reports.js') return body.split('|rate_sources_table|appendix:fta').join('|appendix:fta');
    if (MUT === 'nowarn' && file === 'helpers_modules.js') return body.replace("if (leaf && window.SLRateSources && window.SLRateSources.missing(node)) out.push(", "if (false) out.push(");
    if (MUT === 'anykey' && file === 'ai_assistant.js') return body.replace("if (!want[nid] || !lib[key]) return;", "if (!want[nid]) return;");
    if (MUT === 'nolib' && file === 'rate_sources.js') return body.replace("if (n.inputMode === 'library' && n.libraryKey && _lib()[n.libraryKey]) { var e = _lib()[n.libraryKey]; var dt", "if (false) { var e = {}; var dt");   // 2 Nov 2026: the line now builds the record detail (item 46)
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const iCK = HTML.indexOf('comment_kinds.js?v=1.0'), iAs = HTML.indexOf('assurance_modules.js?v=');
    check('rate_sources.js v1.3 loads (2 Nov 2026: the active library, so an imported part counts as a library source, item 46; a type code event takes its type\'s source, item 29)', /rate_sources\.js\?v=1\.3/.test(HTML));
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
            const R = {}, RS = window.SLRateSources;
            const rows = RS.rows();
            const leaves = rows.map(x => x.node);
            const ev = leaves.find(n => n.inputMode !== 'library');
            ev.inputMode = 'lambda'; ev.lambda = 3e-5; delete ev.rateSource;
            const lev = leaves.find(n => n !== ev);
            lev.inputMode = 'library'; lev.libraryKey = Object.keys(COMPONENT_LIBRARY)[0]; delete lev.rateSource;
            R.w = { missing: RS.missing(ev), warn: ftaNodeWarnings(ev, false).some(w => w.key === 'rate-source'), libSourced: !RS.missing(lev) && RS.sourceOf(lev).kind === 'library' };
            // the panel
            const pg = ftaPages.find(p => { let hit = false; (function w(n) { if (!n || hit) return; if (n === ev) hit = true; (n.children || []).forEach(w); })(p.root); return hit; });
            switchTab('fta'); activeFTAPageId = pg.id; renderFTASidebar(); updateD3(); await wait(500);
            selectNode(ev); await wait(200);
            const host = document.getElementById('config-rate-source-container');
            R.p = { shown: host && host.style.display !== 'none', select: !!document.getElementById('config-rate-source-kind') };
            document.getElementById('config-rate-source-kind').value = 'supplier';
            document.getElementById('config-rate-source-ref').value = 'RR-2291 rev C';
            document.getElementById('config-rate-source-date').value = '2026-09-01';
            SLRateSources.ui.fromPanel();
            R.p.saved = ev.rateSource && ev.rateSource.kind === 'supplier' && ev.rateSource.ref === 'RR-2291 rev C' && ev.rateSource.date === '2026-09-01';
            R.p.cleared = !RS.missing(ev) && !ftaNodeWarnings(ev, false).some(w => w.key === 'rate-source');
            try { closeNodeConfigModal(); } catch (_) {}
            // the table
            const ev2 = leaves.find(n => n !== ev && n !== lev);
            ev2.inputMode = 'lambda'; ev2.lambda = 5e-6; delete ev2.rateSource;
            R.t = { btn: !!document.getElementById('rate-sources-btn') };
            RS.open(); await wait(100);
            const modal = document.getElementById('rate-sources-modal');
            R.t.rows = modal ? modal.querySelectorAll('tr[data-rs-node]').length : 0; R.t.want = RS.rows().length;
            R.t.noSource = modal ? /No source/.test(modal.innerText) : false;
            const csv = RS.csv();
            R.t.csv = /^Basic event,ID,Tree,Rate or probability,Source,Reference,Date/.test(csv) && /Supplier guarantee/.test(csv) && /RR-2291 rev C/.test(csv);
            // the SSA table
            const sys = (systemsData || []).find(sy => (ftaPages || []).some(p => String(p.systemId) === String(sy.id)));
            let ssaOk = 'no system tree';
            try { const d = Reports.extractData('SSA', { systemId: sys && sys.id }); ssaOk = Array.isArray(d.rate_sources_table) && d.rate_sources_table.every(x => x['Source']) ; R.t.ssaRows = (d.rate_sources_table || []).length; } catch (e) { ssaOk = 'ERR ' + e.message; }
            R.t.ssa = ssaOk;
            // the table actually renders in the Word report (the token is a table, not text left in the prose)
            try {
                const secs = Reports.parseMarkdownToSections(Reports.DEFAULT_TEMPLATES.SSA);
                const d2 = Reports.extractData('SSA', { systemId: sys && sys.id });
                const blob = await Reports.renderDocxFromSections('SSA', d2, secs, {}, {});
                const JZ = window.JSZip || (typeof _loadJSZip === 'function' ? await _loadJSZip() : null);
                const z = await JZ.loadAsync(await blob.arrayBuffer()); const xml = await z.file('word/document.xml').async('string');
                R.t.docx = { noToken: !/rate_sources_table/.test(xml), header: /Failure Rate Sources/.test(xml) && /<w:t[^>]*>Basic event<\/w:t>/.test(xml) };
            } catch (e) { R.t.docx = 'ERR ' + e.message; }
            // ANEM matches
            await window.slLoadAI(); await until(() => window.SafetyLabAI && window.SafetyLabAI.rateMatch, 20000);
            const key = Object.keys(COMPONENT_LIBRARY).find(k => /motor/i.test(COMPONENT_LIBRARY[k].name)) || Object.keys(COMPONENT_LIBRARY)[3];
            window.AiClient = { isConfigured: () => true, messages: async () => ({ content: [{ type: 'text', text: JSON.stringify({ matches: [
                { nodeId: String(ev2.id), libraryKey: key, why: 'Both name the same part type.' },
                { nodeId: String(ev2.id), libraryKey: 'made_up_key', why: 'x' },
                { nodeId: '999999999', libraryKey: key, why: 'not asked' } ] }) }], model: 'test-model', stop_reason: 'end_turn' }) };
            await SLRateSources.ui.findMatches(); await wait(300);
            const m = RS._matches[String(ev2.id)];
            R.a = { one: !!m && m.libraryKey === key && Object.keys(RS._matches).length === 1, notApplied: !ev2.rateSource && ev2.inputMode === 'lambda', shown: /ANEM match/.test(document.getElementById('rate-sources-modal').innerText) };
            SLRateSources.ui.cite(String(ev2.id));
            R.a.cited = ev2.rateSource && ev2.rateSource.kind === 'library' && ev2.rateSource.cited && ev2.lambda === 5e-6;
            RS._matches[String(ev.id)] = { libraryKey: key, why: 'x' };
            SLRateSources.ui.useLibrary(String(ev.id));
            R.a.used = ev.inputMode === 'library' && ev.libraryKey === key && RS.sourceOf(ev).kind === 'library';
            SLRateSources.ui.close();
            return R;
        }, demo.data), 200000, 'the browser step');
        console.log('\n[W] the source and the warning');
        check('[W] a typed rate with no source is missing and shows on the warning pill; a library event cites its entry', r.w.missing && r.w.warn && r.w.libSourced, JSON.stringify(r.w));
        console.log('\n[P] the properties panel');
        check('[P] the Source row shows for the selected event and saves kind, reference and date; the warning clears', r.p.shown && r.p.select && r.p.saved && r.p.cleared, JSON.stringify(r.p));
        console.log('\n[T] the table and the report');
        check('[T] the table lists every basic event once, shows "No source", and exports', r.t.btn && r.t.rows === r.t.want && r.t.rows > 3 && r.t.noSource && r.t.csv, JSON.stringify(r.t));
        check('[T] the SSA carries the table of failure rate sources, and it renders as a table in the Word report', r.t.ssa === true && r.t.docx && r.t.docx.noToken && r.t.docx.header, JSON.stringify(r.t));
        console.log('\n[A] ANEM');
        check('[A] only a match for an event asked about, to an entry in the library, is kept; nothing applied yet', r.a.one && r.a.notApplied && r.a.shown, JSON.stringify(r.a));
        check('[A] "Cite it" keeps the typed rate and cites the entry; "Use" sets the event from the library', r.a.cited && r.a.used, JSON.stringify(r.a));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) {
        check('test crashed: ' + (e && e.stack || e), false);
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
