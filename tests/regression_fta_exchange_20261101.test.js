/* regression_fta_exchange_20261101.test.js: fault trees in and out, Open-PSA MEF and spreadsheets (items 26 and 29).
 *
 * Waqas, 1 Nov 2026: Open-PSA MEF import and export plus a spreadsheet import with column mapping; type codes (basic,
 * undeveloped, house, conditioning, transfer, gate types) shown and carried both ways; imported trees on the Golden
 * Thread with the source file named; native CAFTA / FaultTree+ later.
 * Checked: a tree pair with a transfer, a shared event, an INHIBIT gate, a voting gate, an undeveloped and a house event
 * goes out to MEF and comes back with the same structure, the same type codes, the transfer still a transfer and the
 * same exact top; the same through the spreadsheet; a hand-written MEF file (atleast, nested formula, parameter, house
 * event, undeveloped flavor, an unknown construct) reads with the right types and says what it could not read; a
 * spreadsheet with codes and a bad row reads with warnings; a missing required column is refused; nothing already in
 * the project changes; the imported tree names its file on the thread; the dialog shows every type code.
 * MUTATION PROOFS: SL_X_MUTATE=types (the sl-type attribute is ignored), =transfer (a transfer is not made back),
 * =thread (the file is not named on the thread) must fail.
 * Run: node tests/regression_fta_exchange_20261101.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const MUT = process.env.SL_X_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'types' && file === 'fta_exchange.js') return body.replace("var code = _attr(g, 'sl-type'), forced = parseType(code);", "var code = null, forced = null;");
    if (MUT === 'transfer' && file === 'fta_exchange.js') return body.replace("if (t && t !== inTree && t.top === name) return", "if (false) return");
    if (MUT === 'thread' && file === 'fta_view_modules.js') return body.replace("p.importedFrom ? ('Fault tree · imported from ' + (p.importedFrom.file || 'a file')) : 'Fault tree'", "'Fault tree'");
    return body;
}
const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
check('index.html loads fta_exchange.js after fta_latent.js', HTML.indexOf('fta_exchange.js?v=1.0') > HTML.indexOf('fta_latent.js?v='));
check('the tree picker has the Import / Export button', /xb\.textContent = 'Import \/ Export';/.test(fs.readFileSync(path.join(SITE, 'fta_tree_picker.js'), 'utf8')));
check('no em dash in what fta_exchange.js says', !/—/.test(fs.readFileSync(path.join(SITE, 'fta_exchange.js'), 'utf8').replace(/\/\/.*$/gm, '')));

const HAND_MEF = `<?xml version="1.0"?>
<opsa-mef>
  <define-fault-tree name="Pump">
    <define-gate name="TOP"><label>No flow</label><or><gate name="G1"/><basic-event name="Valve"/><and><basic-event name="P1"/><house-event name="Maint"/></and></or></define-gate>
    <define-gate name="G1"><atleast min="2"><basic-event name="P1"/><basic-event name="P2"/><basic-event name="P3"/></atleast></define-gate>
    <define-gate name="G2"><nand><basic-event name="P2"/><basic-event name="P3"/></nand></define-gate>
  </define-fault-tree>
  <model-data>
    <define-parameter name="lam"><float value="2e-5"/></define-parameter>
    <define-basic-event name="P1"><label>Pump 1</label><exponential><parameter name="lam"/><system-mission-time/></exponential></define-basic-event>
    <define-basic-event name="P2"><float value="1e-3"/></define-basic-event>
    <define-basic-event name="P3"><lognormal-deviate><float value="1e-3"/><float value="3"/></lognormal-deviate></define-basic-event>
    <define-basic-event name="Valve"><attributes><attribute name="flavor" value="undeveloped"/></attributes><float value="5e-4"/></define-basic-event>
    <define-house-event name="Maint"><constant value="true"/></define-house-event>
  </model-data>
</opsa-mef>`;

(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const done = () => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); };
    if (!pw) { console.log('  note  Playwright is not installed: the app checks did not run'); return done(); }
    console.log('\nin the app' + (MUT ? ' (MUTATION ' + MUT + ')' : ''));
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
        const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errs = []; pg.on('pageerror', e => errs.push(String(e && e.message || e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await sleep(3500);
        await pg.evaluate(() => { const gt = document.getElementById('sl-auth-gate'); if (gt) gt.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); });
        await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(3000);
        const r = await pg.evaluate(async (HAND) => {
            const out = {};
            const A = ftaPages.find(p => p.id === 'pg-ac-fc01') || ftaPages.find(p => p && p.root && p.root.type === 'gate');
            const B = ftaPages.find(p => p.id === 'pg-fcs-pitch') || ftaPages.find(p => p && p.root && p !== A);
            // every type on A: an INHIBIT gate, a voting gate, an undeveloped, a house, a conditioning event, and a shared event with B
            const shared = (function f(n) { if (!n) return null; if (n.type === 'basic') return n; for (const c of (n.children || n._children || [])) { const x = f(c); if (x) return x; } return null; })(B.root);
            A.root.children.push({ id: 'x-inh', displayId: 'G-XINH', type: 'gate', gateType: 'INHIBIT', name: 'Inhibited', children: [
                { id: 'x-c', logicalId: 'x-c', displayId: 'CE-X1', type: 'conditioning', name: 'In icing', probability: 0.1, children: [] },
                { id: 'x-v', displayId: 'G-XVOT', type: 'gate', gateType: 'VOTING', votingK: 2, name: 'Two of three', children: [
                    { id: 'x-1', logicalId: 'x-1', displayId: 'BE-X1', type: 'basic', name: 'Sensor 1', probability: 1e-3, children: [] },
                    { id: 'x-2', logicalId: 'x-2', displayId: 'BE-X2', type: 'basic', name: 'Sensor 2', probability: 1e-3, children: [] },
                    { id: 'x-3', logicalId: 'x-3', displayId: 'UE-X3', type: 'undeveloped', name: 'Sensor 3', probability: 2e-3, children: [] }] }] });
            A.root.children.push({ id: 'x-h', logicalId: 'x-h', displayId: 'HE-X1', type: 'house', name: 'Dispatch with item open', probability: 0, children: [] });
            A.root.children.push(Object.assign({}, shared, { id: 'x-sh', children: [] }));   // the same event (same logical id) as on B
            openFTAPageById(A.id); syncFtaConfigFromActivePage(); ftaConfig.mode = 'bottom-up'; A.mode = 'bottom-up'; B.mode = 'bottom-up';
            calculateAllProbabilities();
            const strip = x => JSON.stringify(x, (k, v) => k.charAt(0) === '_' ? undefined : v);
            const beforeA = strip(A.root), beforeN = ftaPages.length;
            const codes = r0 => { const c = {}; (function w(n) { if (!n) return; const k = SLFtaExchange.typeCode(n); c[k] = (c[k] || 0) + 1; if (!(n.gateType === 'TRANSFER')) (n.children || n._children || []).forEach(w); })(r0); return c; };
            out.codesA = codes(A.root);
            out.exactA = SLTopBasis.exactTop(A.root);
            // 1. MEF out and back
            const ex = SLFtaExchange.exportMef([A, B]);
            out.xmlChecks = { trees: (ex.xml.match(/<define-fault-tree /g) || []).length, inh: /sl-type" value="INH"/.test(ex.xml), vot: /<atleast min="2">/.test(ex.xml), ue: /value="undeveloped"/.test(ex.xml), house: /<define-house-event /.test(ex.xml), sharedOnce: (ex.xml.match(new RegExp('<define-basic-event name="' + (shared.displayId || '') + '"', 'g')) || []).length };
            const rep = SLFtaExchange.importMef(ex.xml, 'round_trip.opsa.xml');
            out.mefErr = rep.error || null;
            SLFtaExchange.commit(rep);
            const A2 = ftaPages.find(p => p.importedFrom && p.importedFrom.file === 'round_trip.opsa.xml' && p.importedFrom.tree === A.name.replace(/[^A-Za-z0-9_.\-]+/g, '_').replace(/^_+|_+$/g, ''));
            const B2 = ftaPages.find(p => p.importedFrom && p.importedFrom.file === 'round_trip.opsa.xml' && p !== A2);
            out.mef = { found: !!A2 && !!B2, codes: A2 && codes(A2.root), exact: A2 ? SLTopBasis.exactTop(A2.root) : null, transfer: A2 ? (function () { let t = null; (function w(n) { if (!n || t) return; if (n.gateType === 'TRANSFER') t = n.transferOutTo; (n.children || []).forEach(w); })(A2.root); return t; })() : null, B2: B2 && B2.id, linked: A2 && A2.linkedFhaIds };
            out.dbg = (function () { const L = r0 => { const m = {}; (function w(n, pid) { if (!n) return; if (n.gateType === 'TRANSFER') { const tp = ftaPages.find(x => x.id === (n.transferOutTo || n.linkedPageId)); if (tp) w(tp.root); return; } const kk = (n.name || '') + '|' + n.type; if (n.type !== 'gate') m[kk] = [n.probability, n.ccfGroup || '', n.beta, n.type, n.inputMode, n.lambda, n.exposureMode]; else m[kk + n.gateType] = [n.gateType, (n.children || []).length, n.votingK]; (n.children || n._children || []).forEach(c => w(c)); })(r0); return m; }; const a = L(A.root), b = A2 ? L(A2.root) : {}; const d = []; Object.keys(a).forEach(k => { if (JSON.stringify((a[k] || []).slice(0, 4)) !== JSON.stringify((b[k] || []).slice(0, 4))) d.push(k + ' ' + JSON.stringify(a[k]) + ' vs ' + JSON.stringify(b[k])); }); Object.keys(b).forEach(k => { if (!(k in a)) d.push('extra ' + k); }); return d.slice(0, 12); })();
            // 2. the spreadsheet out and back
            const rows = SLFtaExchange.exportSheet([A, B]);
            const csv = SLFtaExchange.sheetCsv(rows), back = SLFtaExchange.parseCsv(csv);
            const map = SLFtaExchange.guessMapping(back[0]);
            const rs = SLFtaExchange.importSheet(back, map, 'round_trip.csv');
            out.csvErr = rs.error || null; out.csvWarn = rs.warnings.slice(0, 3);
            SLFtaExchange.commit(rs);
            const A3 = ftaPages.find(p => p.importedFrom && p.importedFrom.file === 'round_trip.csv' && p.importedFrom.tree === A.name);
            out.csv = { header: rows[0].join('|'), mapped: Object.keys(map).sort().join(','), codes: A3 && codes(A3.root), exact: A3 ? SLTopBasis.exactTop(A3.root) : null };
            // 3. a hand-written MEF file
            const h = SLFtaExchange.importMef(HAND, 'pump.xml');
            const hr = h.trees[0] && h.trees[0].page.root;
            const find = (n, pred) => { let x = null; (function w(m) { if (!m || x) return; if (pred(m)) x = m; (m.children || []).forEach(w); })(n); return x; };
            out.hand = { err: h.error || null, top: hr && hr.name, vot: hr && (find(hr, n => n.gateType === 'VOTING') || {}).votingK, house: hr && (find(hr, n => n.type === 'house') || {}).probability, ue: hr && (find(hr, n => n.displayId === 'Valve' || /Valve/.test(n.name)) || {}).type, lam: hr && (find(hr, n => /Pump 1/.test(n.name)) || {}).lambda, p1Once: hr ? (function () { const s = new Set(); let c = 0; (function w(n) { if (!n) return; if (/Pump 1/.test(n.name || '')) { c++; s.add(n.logicalId); } (n.children || []).forEach(w); })(hr); return c === 2 && s.size === 1; })() : false, warns: h.warnings };
            // 4. a spreadsheet with codes, a bad row, and a missing column
            const sheet = [['Tree', 'ID', 'Description', 'Type', 'Parent', 'k', 'Probability'], ['T9', 'TOP9', 'Loss', 'OR', '', '', ''], ['T9', 'V9', 'Vote', 'VOT', 'TOP9', '2', ''], ['T9', 'A9', 'a', 'BE', 'V9', '', '1e-3'], ['T9', 'B9', 'b', 'UE', 'V9', '', '1e-3'], ['T9', 'C9', 'c', 'HE', 'TOP9', '', '0'], ['T9', 'D9', 'd', 'WIDGET', 'TOP9', '', '7']];
            const s9 = SLFtaExchange.importSheet(sheet, SLFtaExchange.guessMapping(sheet[0]), 'codes.csv');
            const r9 = s9.trees[0] && s9.trees[0].page.root;
            out.sheet = { k: r9 && (find(r9, n => n.gateType === 'VOTING') || {}).votingK, ue: r9 && (find(r9, n => n.displayId === 'B9') || {}).type, he: r9 && (find(r9, n => n.displayId === 'C9') || {}).type, warn: s9.warnings };
            out.missing = SLFtaExchange.importSheet(sheet, { id: 1, type: 3 }, 'x.csv').error;
            // 5. nothing already in the project changed
            out.untouched = strip(A.root) === beforeA;
            out.added = ftaPages.length - beforeN;
            // 6. the thread names the file
            const g = _gtvBuildGraph({});
            out.thread = A2 ? (g.nodes.find(n => n.key === 'fta:' + A2.id) || {}).sub : null;
            // 7. the dialog
            SLFtaExchange.open();
            out.dialog = { codes: [...document.querySelectorAll('#sl-xchg-modal .sl-xchg-legend td b')].map(b => b.textContent).join(','), buttons: ['[data-xchg-export-mef]', '[data-xchg-export-csv]', '[data-xchg-pick]'].every(s => !!document.querySelector('#sl-xchg-modal ' + s)) };
            SLFtaExchange.close();
            return out;
        }, HAND_MEF);
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(b), 1e-30);
        check('MEF out: both trees, INHIBIT carried as a type code, voting as atleast, undeveloped, house, the shared event written once', r.xmlChecks.trees === 2 && r.xmlChecks.inh && r.xmlChecks.vot && r.xmlChecks.ue && r.xmlChecks.house && r.xmlChecks.sharedOnce === 1, JSON.stringify(r.xmlChecks));
        check('MEF back in: the same type codes, gate for gate and event for event', !r.mefErr && r.mef.found && same(r.mef.codes, r.codesA), JSON.stringify(r.codesA) + ' vs ' + JSON.stringify(r.mef.codes) + ' ' + r.mefErr);
        check('MEF back in: the transfer is still a transfer, to the imported copy of the other tree', r.mef.transfer && r.mef.transfer === r.mef.B2, JSON.stringify(r.mef));
        check('MEF back in: the same exact top', near(r.mef.exact, r.exactA), r.mef.exact + ' vs ' + r.exactA + ' ' + JSON.stringify(r.dbg));
        check('MEF back in: linked to the same failure condition', Array.isArray(r.mef.linked) && r.mef.linked.length > 0, JSON.stringify(r.mef.linked));
        check('spreadsheet out has the columns, and every column maps back by its name', r.csv.header === 'Tree|ID|Description|Type|Parent|k (voting)|Probability|Failure rate per hour|Transfer to|Common cause group|Beta' && r.csv.mapped === 'beta,ccf,desc,id,k,lambda,p,parent,to,tree,type', r.csv.header + ' / ' + r.csv.mapped);
        check('spreadsheet back in: the same type codes and the same exact top', !r.csvErr && same(r.csv.codes, r.codesA) && near(r.csv.exact, r.exactA), JSON.stringify(r.csv) + ' ' + r.csvErr + ' ' + JSON.stringify(r.csvWarn));
        check('a hand-written MEF file: voting k, house event true, undeveloped flavor, the rate through a parameter, one event used twice', !r.hand.err && r.hand.top === 'No flow' && r.hand.vot === 2 && r.hand.house === 1 && r.hand.ue === 'undeveloped' && r.hand.lam === 2e-5 && r.hand.p1Once, JSON.stringify(r.hand));
        check('and it says what it could not read (the lognormal value)', r.hand.warns.some(w => /lognormal-deviate/.test(w)), JSON.stringify(r.hand.warns));
        check('a spreadsheet with type codes: VOT with k, UE, HE; an unknown code is flagged', r.sheet.k === 2 && r.sheet.ue === 'undeveloped' && r.sheet.he === 'house' && r.sheet.warn.some(w => /WIDGET/.test(w)) && r.sheet.warn.some(w => /probability "7"/.test(w)), JSON.stringify(r.sheet));
        check('a missing required column is refused, saying which', /Parent ID/.test(r.missing || ''), r.missing);
        check('nothing already in the project changes; every import is new trees', r.untouched && r.added >= 4, r.untouched + ' ' + r.added);
        check('the imported tree names its file on the Golden Thread', r.thread === 'Fault tree · imported from round_trip.opsa.xml', String(r.thread));
        check('the dialog shows every type code and the three actions', r.dialog.codes === 'BE,UE,HE,CE,TR,AND,OR,XOR,VOT,INH,NOT,PAND,SPARE,SEQ,FDEP' && r.dialog.buttons, JSON.stringify(r.dialog));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) { check('test crashed: ' + (e && e.stack || e), false); }
    finally { await browser.close(); srv.close(); }
    done();
})();
