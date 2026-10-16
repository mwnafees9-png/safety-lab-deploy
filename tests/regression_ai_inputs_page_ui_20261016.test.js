#!/usr/bin/env node
/*
 * Regression, browser: the AI Assistant page (site/ai_inputs_page.js) on the real app, 16 Oct 2026.
 *
 * Waqas (16 Oct 2026, confirmed): the AI Assistant is a page of its own. AI inputs are put in and managed there, the
 * assistant features and chat are reached there, every analysis page keeps its own AI buttons reading the same inputs,
 * and the inputs move between Safety Lab, Sys Lab and Cert Lab as one shared file. Through the screen:
 *   [A] the sidebar "AI Assistant" opens the page (not the floating menu): AI inputs, AI analyses and chat (every
 *       launcher action with its readiness), the pages that use the inputs, the AI settings below
 *   [B] upload: a two-page PDF (read by the app's PDF reader: [p.N] markers, pages 2, revision C), a text report and a
 *       Markdown note in one go; one acknowledgement for the set; the list shows name, type, characters, pages,
 *       revision, controlled, who added it and when
 *   [C] paste text as a source; mark a document controlled (acknowledged, and kept through a save, the bug this
 *       build fixes); search; remove: Cancel puts it back, Acknowledge removes it, and the dialog names the document
 *   [D] Export all: the downloaded file verifies (format, version, fingerprint) and carries the text exactly as stored
 *   [E] openAiInputs() and the launcher's "AI Inputs" entry open the page at its AI inputs section
 *   [F] a fresh project (another browser profile): Import a file, preview (all new), Import, acknowledged; same docs,
 *       revision and controlled flag; a damaged file is refused with a plain message and nothing changes; a file with a
 *       newer version of one document shows it as a different version, Replace keeps this project's id
 *   [G] the zonal AI review (SLZonalAI.gather) finds the imported report's passages, page and revision included
 * Screenshots to ../ai_page_shots/ when that folder exists.
 *
 * Run: node tests/regression_ai_inputs_page_ui_20261016.test.js   (SKIP when Playwright or Chromium is missing)
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const ROOT = path.resolve(__dirname, '..'), SITE = path.join(ROOT, 'site');
const SHOTS = path.resolve(ROOT, '..', 'ai_page_shots');
const X = require(path.join(SITE, 'ai_inputs_exchange.js'));
let pass = 0, fail = 0;
const J = x => JSON.stringify(x);
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' - ' + d : '')); } };

// A real two-page PDF (Helvetica text, one content stream per page), written by hand so the test needs no tools.
function makePdf(pages) {
    const esc = s => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const objs = [];
    const n = pages.length, kids = pages.map((_, i) => (4 + i * 2) + ' 0 R').join(' ');
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[2] = '<< /Type /Pages /Kids [' + kids + '] /Count ' + n + ' >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    pages.forEach((lines, i) => {
        const content = 'BT /F1 11 Tf 14 TL 60 760 Td ' + lines.map(l => '(' + esc(l) + ') Tj T*').join(' ') + ' ET';
        objs[4 + i * 2] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + (5 + i * 2) + ' 0 R >>';
        objs[5 + i * 2] = '<< /Length ' + Buffer.byteLength(content) + ' >>\nstream\n' + content + '\nendstream';
    });
    let out = '%PDF-1.4\n', offs = [];
    for (let k = 1; k < objs.length; k++) { offs[k] = Buffer.byteLength(out); out += k + ' 0 obj\n' + objs[k] + '\nendobj\n'; }
    const xref = Buffer.byteLength(out);
    out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n' + offs.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    return Buffer.from(out, 'latin1');
}
const PDF = makePdf([
    ['TR-2210 Bird Strike Test Report', 'Revision C', 'Nose fairing qualification, Vayu V-1.'],
    ['4 Results', 'Test 4: panel PN-NF-410 was impacted by a 4 lb bird at 250 KCAS (Vc).', 'No penetration of the panel. Result: PASS.', 'Test 5: panel PN-NF-411 was impacted by a 4 lb bird at 250 KCAS (Vc).', 'Penetration of the inner skin. Result: FAIL.']
]);
const TXT = 'SA-5020 Stress Analysis, Nose Fairing\nRevision D\n\n6.2 Bird strike margins\nPart PN-NF-411 bird strike case, ultimate load: margin of safety MS = -0.04 (negative, redesign required).\n';
const MD = '# Propulsion SDD notes\n\nThe FADEC has two channels, A and B, each on its own power feed.\n';

(async () => {
    let chromium;
    try { chromium = require('playwright').chromium; } catch (e) { try { chromium = require('/opt/npm-tools/node_modules/playwright').chromium; } catch (_) { console.log('  SKIP  playwright is not installed'); console.log('\n0 passed, 0 failed'); return; } }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.mjs': 'text/javascript' };
    const server = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
        const f = path.join(SITE, p);
        if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const URL0 = 'http://127.0.0.1:' + server.address().port + '/?ai=1';
    let browser;
    try { browser = await chromium.launch(); } catch (e) { console.log('  SKIP  no Chromium (' + String(e.message).split('\n')[0] + ')'); server.close(); console.log('\n0 passed, 0 failed'); return; }
    const shoot = async (page, name, full) => { if (fs.existsSync(SHOTS)) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!full }); };
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aip-'));
    const boot = async (ctx, projName) => {
        const page = await ctx.newPage();
        const errors = []; page.on('pageerror', e => errors.push(String(e)));
        await page.goto(URL0);
        await page.waitForFunction(() => window.SafetyLabSourceDocs && window.SLAiInputsPage && window.SLAiInputsExchange && window.SLZonalAI && typeof window.slLoadAI === 'function', null, { timeout: 60000 });
        await page.evaluate(async (projName) => {
            const ung = () => { document.querySelectorAll('[aria-label="Sign in to Safety Lab Aero"]').forEach(g => g.remove()); document.documentElement.classList.remove('sl-auth-gate-blocked');
                const t = document.getElementById('signup-modal-title'); if (t) { let o = t; while (o && o.parentElement && o.parentElement !== document.body) o = o.parentElement; if (o) o.style.display = 'none'; }
                ['sl-onramp'].forEach(id => { const o = document.getElementById(id); if (o) o.remove(); });
                document.querySelectorAll('.modal-overlay, .modal').forEach(o => { if (getComputedStyle(o).display !== 'none' && !o.classList.contains('sl-ack-overlay') && !o.classList.contains('sl-dialog-overlay') && !o.classList.contains('aip-imp-overlay')) o.style.display = 'none'; }); };
            window.__ung = ung; ung();
            await window.slLoadAI().catch(() => {});
            await new Promise(r => setTimeout(r, 1500)); ung();
            // a blank project, started the way New project starts one (a system change), then the
            // acknowledgement funnel settles on it: the baseline every later change is measured from
            try { SLChangeAck.system(() => { _createNewProjectBlank(); if (projName) projectName = projName; }); SLChangeAck.settle(); } catch (_) {}
            await new Promise(r => setTimeout(r, 2500)); ung();
            // the person working (the page stamps who added each document)
            try { localStorage.setItem('safetyLab.signup.name', 'W. Engineer'); } catch (_) {}
        }, projName || null);
        return { page, errors };
    };
    // answer the next acknowledgement dialog; returns its text
    const ack = async (page, answer) => {
        await page.waitForSelector('#sl-ack-overlay .sl-ack-keep', { timeout: 15000 });
        const txt = await page.$eval('#sl-ack-overlay', el => el.innerText);
        await page.click(answer === 'cancel' ? '#sl-ack-overlay .sl-ack-cancel' : '#sl-ack-overlay .sl-ack-keep');
        await page.waitForFunction(() => !document.getElementById('sl-ack-overlay'), null, { timeout: 15000 });
        await page.waitForTimeout(250);
        return txt;
    };
    const rows = page => page.$$eval('#aip-table tbody tr', trs => trs.map(tr => { const td = tr.querySelectorAll('td'); return { id: tr.getAttribute('data-id'), name: td[1].querySelector('.aip-name').textContent.replace('Controlled', ''), ctl: !!td[1].querySelector('.aip-ctl'), kind: td[2].textContent, chars: td[3].textContent, pages: td[4].textContent, rev: td[5].textContent, by: td[7].textContent, at: td[8].textContent }; })).catch(() => []);
    try {
        const ctxA = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
        const { page, errors } = await boot(ctxA, 'Vayu V-1 nose fairing');

        console.log('\n[A] the page opens from the sidebar');
        await page.evaluate(() => { const g = document.getElementById('asb-grp-admin'); if (g) g.open = true; });
        await page.click('#snav-ai');
        await page.waitForSelector('#aip-assist .aip-act', { timeout: 20000 });
        const A = await page.evaluate(() => ({
            shown: document.getElementById('view-ai').style.display !== 'none',
            launcher: !!document.getElementById('ai-launcher'),
            sections: ['aip-inputs', 'aip-assistant', 'aip-uses', 'aip-settings'].map(id => !!document.getElementById(id)),
            order: (() => { const ids = ['aip-inputs', 'aip-assistant', 'aip-uses', 'aip-settings'].map(id => document.getElementById(id)); return ids.every((e, i) => i === 0 || (ids[i - 1].compareDocumentPosition(e) & 4)); })(),
            acts: [...document.querySelectorAll('#aip-assist .aip-act-t')].map(e => e.textContent),
            launcherLabels: window.SafetyLabAI.launcherActions().map(a => a.label.replace(/&amp;/g, '&')).filter(l => l !== 'AI Inputs' && l !== 'AI Settings'),
            chips: document.querySelectorAll('#aip-assist .aip-chip').length,
            chat: !!document.getElementById('aip-chat'),
            uses: [...document.querySelectorAll('#aip-uses-ul li')].map(li => li.textContent),
            settings: !!document.getElementById('ai-settings-block') && document.getElementById('aip-settings').compareDocumentPosition(document.getElementById('ai-settings-block')) & 4
        }));
        check('the sidebar entry shows the AI Assistant page, not the floating menu', A.shown && !A.launcher);
        check('the page has its four sections, in order: AI inputs, AI analyses and chat, pages that use the inputs, AI settings', A.sections.every(Boolean) && A.order);
        check('every launcher action is on the page, in the launcher\'s order (' + A.acts.length + ')', J(A.acts) === J(A.launcherLabels), J(A.acts.slice(0, 3)));
        check('each analysis states its readiness', A.chips >= 30, A.chips);
        check('the ANEM chat is one click away', A.chat);
        check('the pages with AI buttons are listed by name (FHA, fault trees, ZSA, PRA, CMA, HF lanes, CAD Model)', A.uses.length >= 15 && A.uses.some(u => /^Fault/.test(u) || /fault tree/i.test(u)) && A.uses.some(u => /^CAD Model/.test(u)) && A.uses.some(u => /Zonal/i.test(u)), J(A.uses.slice(0, 6)));
        check('the AI settings are still on the page, below', !!A.settings);
        await shoot(page, '01_page_top');

        console.log('\n[B] upload');
        fs.writeFileSync(path.join(tmp, 'TR-2210 Bird Strike Test Report Rev C.pdf'), PDF);
        fs.writeFileSync(path.join(tmp, 'SA-5020 Stress Analysis Nose Fairing.txt'), TXT);
        fs.writeFileSync(path.join(tmp, 'Propulsion SDD notes.md'), MD);
        await page.setInputFiles('#aip-file', ['TR-2210 Bird Strike Test Report Rev C.pdf', 'SA-5020 Stress Analysis Nose Fairing.txt', 'Propulsion SDD notes.md'].map(f => path.join(tmp, f)));
        const ackUp = await ack(page, 'keep');
        check('one acknowledgement for the three files, naming each document', /Add 3 documents to the AI inputs/.test(ackUp) && /AI inputs/.test(ackUp) && /TR-2210 Bird Strike Test Report Rev C\.pdf/.test(ackUp) && /Propulsion SDD notes\.md/.test(ackUp), ackUp.slice(0, 1200));
        let R = await rows(page);
        const pdfRow = R.find(r => /\.pdf$/.test(r.name)) || {};
        check('three rows', R.length === 3, J(R));
        check('the PDF: type pdf, 2 pages, revision C (detected), added by W. Engineer, with a date', pdfRow.kind === 'pdf' && pdfRow.pages === '2' && pdfRow.rev === 'C' && pdfRow.by === 'W. Engineer' && /2026|\d{4}/.test(pdfRow.at), J(pdfRow));
        const pdfStored = await page.evaluate(() => SafetyLabSourceDocs.list().find(d => /\.pdf$/.test(d.name)));
        check('the PDF text is the app reader\'s, with [p.1] and [p.2] markers', /^\[p\.1\]/.test(pdfStored.text) && /\[p\.2\][\s\S]*PN-NF-411/.test(pdfStored.text), pdfStored.text.slice(0, 120));
        check('characters shown = stored text length', pdfRow.chars === pdfStored.text.length.toLocaleString('en-US') || pdfRow.chars.replace(/\D/g, '') === String(pdfStored.text.length));
        check('the text file: type txt, revision D, no pages; the note: type md', (R.find(r => /\.txt$/.test(r.name)) || {}).rev === 'D' && (R.find(r => /\.txt$/.test(r.name)) || {}).pages === '' && (R.find(r => /\.md$/.test(r.name)) || {}).kind === 'md');
        check('each stored doc carries its text hash', await page.evaluate(() => SafetyLabSourceDocs.list().every(d => d.sha256 === SLAiInputsExchange.sha256Hex(d.text))));
        await shoot(page, '02_inputs_list');

        console.log('\n[C] paste, controlled, search, remove');
        await page.fill('#aip-text-name', 'Hydraulic architecture note');
        await page.fill('#aip-text', 'The aircraft has two independent hydraulic systems, H1 and H2. Rev: 3');
        await page.click('#aip-text-add');
        const ackPaste = await ack(page, 'keep');
        R = await rows(page);
        const pasted = R.find(r => r.name === 'Hydraulic architecture note') || {};
        check('pasted text is a source: type text, revision 3', R.length === 4 && pasted.kind === 'text' && pasted.rev === '3' && /Hydraulic architecture note/.test(ackPaste), J(pasted));
        const sddId = (R.find(r => /\.md$/.test(r.name)) || {}).id;
        await page.check('input[data-ctrl="' + sddId + '"]');
        const ackCtl = await ack(page, 'keep');
        check('marking controlled asks, and says what changes', /controlled/i.test(ackCtl) && /Propulsion SDD notes\.md/.test(ackCtl), ackCtl.slice(0, 300));
        const ctlKept = await page.evaluate((id) => ({ live: SafetyLabSourceDocs.get(id).controlled === true, saved: (_slabSerializeSourceDocs().find(d => d.id === id) || {}).controlled === true, fence: !!(window.AiClient && AiClient.controlledRefusal && AiClient.controlledRefusal({})) }), sddId);
        check('the controlled flag is in the saved project (it was dropped on save before this build)', ctlKept.live && ctlKept.saved, J(ctlKept));
        check('and the controlled-data fence sees it', ctlKept.fence, J(ctlKept));
        R = await rows(page);
        check('the list marks it controlled', (R.find(r => r.id === sddId) || {}).ctl === true);
        await page.fill('#aip-q', 'pn-nf-411');
        R = await rows(page);
        check('search finds text inside the documents (PN-NF-411: the PDF and the stress analysis)', R.length === 2 && R.every(r => /TR-2210|SA-5020/.test(r.name)), J(R.map(r => r.name)));
        await page.fill('#aip-q', 'md');
        R = await rows(page);
        check('search finds by type', R.length >= 1 && R.some(r => r.kind === 'md'));
        await page.fill('#aip-q', '');
        const hydId = pasted.id;
        await page.click('button[data-rm="' + hydId + '"]');
        const ackRm = await ack(page, 'cancel');
        R = await rows(page);
        check('remove asks, naming the document; Cancel puts it back', /Remove "Hydraulic architecture note"/.test(ackRm) && /removed|Removed/.test(ackRm) && R.length === 4 && R.some(r => r.id === hydId), ackRm.slice(0, 200));
        await page.click('button[data-rm="' + hydId + '"]');
        await ack(page, 'keep');
        R = await rows(page);
        check('Acknowledge removes it', R.length === 3 && !R.some(r => r.id === hydId));
        await shoot(page, '03_after_edits');

        console.log('\n[D] export');
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#aip-export')]);
        const dlPath = path.join(tmp, dl.suggestedFilename());
        await dl.saveAs(dlPath);
        const fileText = fs.readFileSync(dlPath, 'utf8');
        const v = X.verify(fileText);
        check('the download is named after the project', dl.suggestedFilename() === 'Vayu V-1 nose fairing AI inputs.slai.json', dl.suggestedFilename());
        check('the exported file verifies with the shared format module (format, version, fingerprint)', v.ok, J(v));
        const live = await page.evaluate(() => SafetyLabSourceDocs.list().map(d => ({ id: d.id, name: d.name, text: d.text })));
        check('it holds the three documents, texts exactly as stored', v.ok && v.file.docs.length === 3 && v.file.docs.every((d, i) => d.id === live[i].id && d.text === live[i].text));
        check('source: safety-lab, the project name; controlled and who added it carried', v.ok && v.file.source.tool === 'safety-lab' && v.file.source.projectName === 'Vayu V-1 nose fairing' && v.file.docs.find(d => /\.md$/.test(d.name)).controlled === true && v.file.docs.every(d => d.addedBy === 'W. Engineer'));
        // export only the ticked ones
        await page.check('input[data-sel="' + pdfRow.id + '"]');
        const label = await page.textContent('#aip-export');
        const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#aip-export')]);
        const p2 = path.join(tmp, 'sel.json'); await dl2.saveAs(p2);
        const v2 = X.verify(fs.readFileSync(p2, 'utf8'));
        check('Export the ticked ones: only the PDF', /ticked/.test(label) && v2.ok && v2.file.docs.length === 1 && /\.pdf$/.test(v2.file.docs[0].name), label);
        await page.uncheck('input[data-sel="' + pdfRow.id + '"]');

        console.log('\n[E] openAiInputs() and the launcher entry open the page');
        await page.evaluate(() => switchTab('dashboard'));
        await page.evaluate(() => window.openAiInputs());
        await page.waitForTimeout(700);
        const E1 = await page.evaluate(() => ({ shown: document.getElementById('view-ai').style.display !== 'none', modal: !!document.getElementById('ai-inputs-modal'), top: document.getElementById('aip-inputs').getBoundingClientRect().top }));
        check('openAiInputs() shows the page at its AI inputs section, no modal', E1.shown && !E1.modal && E1.top > -5 && E1.top < 400, J(E1));
        await page.evaluate(() => switchTab('dashboard'));
        await page.evaluate(() => { const a = SafetyLabAI.launcherActions().find(x => x.label === 'AI Inputs'); return a.run(); });
        await page.waitForTimeout(500);
        check('the launcher\'s "AI Inputs" entry opens the page', await page.evaluate(() => document.getElementById('view-ai').style.display !== 'none' && !document.getElementById('ai-inputs-modal')));
        await page.evaluate(() => { const a = SafetyLabAI.launcherActions().find(x => x.label === 'AI Settings'); return a.run(); });
        await page.waitForTimeout(600);
        const E3 = await page.evaluate(() => { const t = document.getElementById('aip-settings').getBoundingClientRect().top; return { shown: document.getElementById('view-ai').style.display !== 'none', t, sy: window.scrollY, h: document.documentElement.scrollHeight, ih: innerHeight }; });
        check('the launcher\'s "AI Settings" entry opens the page at the settings', E3.shown && E3.t > -5 && E3.t < E3.ih - 40 && (E3.t < 400 || E3.sy + E3.ih >= E3.h - 2), J(E3));   // at the top, or as far as the page scrolls
        check('no page errors on the first project', errors.length === 0, J(errors.slice(0, 3)));

        console.log('\n[F] import into a fresh project');
        const ctxB = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
        const B = await boot(ctxB);
        const pb = B.page;
        await pb.evaluate(() => { const g = document.getElementById('asb-grp-admin'); if (g) g.open = true; });
        await pb.click('#snav-ai');
        await pb.waitForSelector('#aip-import');
        check('the fresh project starts with no AI inputs', (await pb.evaluate(() => SafetyLabSourceDocs.list().length)) === 0);
        // a damaged copy first: refused, nothing changes
        const bad = JSON.parse(fileText); bad.docs[0].text = bad.docs[0].text.replace('250 KCAS', '260 KCAS');
        fs.writeFileSync(path.join(tmp, 'damaged.slai.json'), JSON.stringify(bad));
        await pb.setInputFiles('#aip-import-file', path.join(tmp, 'damaged.slai.json'));
        await pb.waitForSelector('.sl-dialog-card', { timeout: 10000 });
        const badMsg = await pb.evaluate(() => [...document.querySelectorAll('.sl-dialog-card')].map(c => c.innerText).join(' | '));
        check('a damaged file is refused with a plain message', /damaged or was changed after it was exported/.test(badMsg) && /Nothing was imported/.test(badMsg), badMsg.slice(0, 200));
        await shoot(pb, '06_damaged_refused');
        await pb.evaluate(() => { const b = [...document.querySelectorAll('.sl-dialog-card button')].find(x => /OK/.test(x.textContent)); if (b) b.click(); });
        await pb.waitForTimeout(300);
        check('and nothing was imported', (await pb.evaluate(() => SafetyLabSourceDocs.list().length)) === 0);
        // the real file
        await pb.setInputFiles('#aip-import-file', dlPath);
        await pb.waitForSelector('#aip-import-dialog #aip-imp-ok', { timeout: 10000 });
        const prev = await pb.$eval('#aip-import-dialog', el => el.textContent);
        check('the preview lists three new documents from Safety Lab, project "Vayu V-1 nose fairing"', /New \(3\)/.test(prev) && /Safety Lab/.test(prev) && /Vayu V-1 nose fairing/.test(prev) && /nothing in it was changed/.test(prev), prev.slice(0, 300));
        await shoot(pb, '07_import_preview');
        await pb.click('#aip-imp-ok');
        const ackImp = await ack(pb, 'keep');
        check('the import is acknowledged, naming the documents', /Import AI inputs from/.test(ackImp) && /TR-2210/.test(ackImp), ackImp.slice(0, 1500));
        const got = await pb.evaluate(() => SafetyLabSourceDocs.list().map(d => ({ id: d.id, name: d.name, text: d.text, controlled: !!d.controlled, addedBy: d.addedBy, revision: d.revision || null })));
        check('the fresh project now has the same three documents, same ids, texts byte for byte', got.length === 3 && got.every((d, i) => d.id === live[i].id && d.text === live[i].text && d.name === live[i].name));
        check('controlled and who added it came along', got.find(d => /\.md$/.test(d.name)).controlled === true && got.every(d => d.addedBy === 'W. Engineer'));
        let RB = await rows(pb);
        check('the list shows them, the PDF with 2 pages and revision C', RB.length === 3 && RB.find(r => /\.pdf$/.test(r.name)).pages === '2' && RB.find(r => /\.pdf$/.test(r.name)).rev === 'C');
        await shoot(pb, '08_imported');
        // a newer version of the stress analysis, from Sys Lab: same id and name, different text
        const sx = X.build(got.map(d => Object.assign({}, d, { tables: [] })), { tool: 'sys-lab', projectName: 'Vayu V-1 (Sys Lab)' });
        const sIdx = sx.docs.findIndex(d => /SA-5020/.test(d.name));
        sx.docs[sIdx].text = sx.docs[sIdx].text.replace('Revision D', 'Revision E').replace('MS = -0.04 (negative, redesign required)', 'MS = +0.12 (positive after the doubler)');
        sx.docs[sIdx].sha256 = X.sha256Hex(sx.docs[sIdx].text); sx.docs[sIdx].revision = 'E';
        sx.fingerprint = X.fingerprintOf(sx.docs);
        fs.writeFileSync(path.join(tmp, 'syslab.slai.json'), X.serialize(sx));
        await pb.setInputFiles('#aip-import-file', path.join(tmp, 'syslab.slai.json'));
        await pb.waitForSelector('#aip-import-dialog #aip-imp-ok', { timeout: 10000 });
        const prev2 = await pb.$eval('#aip-import-dialog', el => el.textContent);
        check('a newer version shows as a different version of a document already here, with both revisions', /A different version of a document already here \(1\)/.test(prev2) && /revision E/.test(prev2) && /revision D/.test(prev2) && /Already here, identical \(2\)/.test(prev2) && /Sys Lab/.test(prev2), prev2.slice(0, 400));
        await shoot(pb, '09_conflict_preview');
        await pb.check('#aip-import-dialog input[value="replace"]');
        await pb.click('#aip-imp-ok');
        await ack(pb, 'keep');
        const after = await pb.evaluate(() => SafetyLabSourceDocs.list().map(d => ({ id: d.id, name: d.name, revision: d.revision || null, text: d.text })));
        const sa = after.find(d => /SA-5020/.test(d.name));
        check('Replace: still three documents, the stress analysis now revision E, same id', after.length === 3 && sa.revision === 'E' && /\+0\.12/.test(sa.text) && sa.id === live.find(d => /SA-5020/.test(d.name)).id, J(after.map(d => d.name + ' ' + d.revision)));

        console.log('\n[G] the zonal AI review still finds the documents');
        const G = await pb.evaluate(() => {
            const ctx = SLZonalAI.gather('damage.assumption', { volumeId: 'risk-bird-nose', part: { pid: 'p-nf411', name: 'Nose fairing panel RH', partNumber: 'PN-NF-411' } });
            return { n: ctx.passages.length, docs: [...new Set(ctx.passages.map(p => p.docName))], pdf: ctx.passages.filter(p => /TR-2210/.test(p.docName)).map(p => ({ page: p.page, rev: p.revision, t: p.text })), sa: ctx.passages.filter(p => /SA-5020/.test(p.docName)).map(p => p.revision) };
        });
        check('gather finds passages naming PN-NF-411 in the imported documents', G.n >= 2 && G.docs.some(d => /TR-2210/.test(d)) && G.docs.some(d => /SA-5020/.test(d)), J(G));
        check('the PDF passage keeps its page (2) and revision (C)', G.pdf.some(p => p.page === 2 && p.rev === 'C' && /PN-NF-411/.test(p.t)), J(G.pdf));
        check('the replaced stress analysis is cited at its new revision E', G.sa.length && G.sa.every(r => r === 'E'), J(G.sa));
        check('no page errors on the fresh project', B.errors.length === 0, J(B.errors.slice(0, 3)));
        await pb.evaluate(() => { document.getElementById('aip-assistant').scrollIntoView(); });
        await shoot(pb, '10_analyses');
        await pb.evaluate(() => { document.getElementById('aip-uses').scrollIntoView(); });
        await shoot(pb, '11_pages_that_use');
        await pb.evaluate(() => { document.body.classList.add('theme-dark'); document.getElementById('aip-inputs').scrollIntoView(); });
        await pb.waitForTimeout(300);
        await shoot(pb, '12_dark');
    } catch (e) {
        fail++; console.log('  FAIL  the run threw: ' + (e && e.stack || e));
    } finally {
        await browser.close(); server.close();
    }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
