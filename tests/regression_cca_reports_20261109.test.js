/* regression_cca_reports_20261109.test.js: the PRA, ZSA and CMA reports, 9 Nov 2026 (cca_report.js 1.7, pra_autopilot.js
 * 2.7, zsa_autopilot.js 1.8, cma_autopilot.js 1.3, change_ack.js 3.8).
 *
 * Waqas, 9 Nov 2026:
 *   "I want empty sections for proposed mitigations and path to compliance and conclusion which we give them options to
 *    draft themselves or Draft with AI coz I dont think those can be done deterministically" ("yes all three reports");
 *   on the change review listing raw text for the report settings: "these descriptions need to be easy to understand";
 *   on the "what one event takes out" figure: "these connectors must be easy to read", "and neater, not overlapping blocks
 *    and stuff", "straight through doesnt work, work around the blocks, instead of diagonals work with straight lines with
 *    90 degree angles".
 * MUTATION PROOFS: SL_CCAR_MUTATE=noauth (the written parts are gone), =draftleak (an AI draft goes into the report before
 *   anyone accepts it), =diag (the connectors go straight, corner to corner), =through (a connector crosses a skipped column
 *   at any height, through boxes), =ackraw (the review shows the settings as raw text), =autobook (what the app fills in by
 *   itself is listed as the person's change) must fail.
 * Run: node tests/regression_cca_reports_20261109.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 700) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_CCAR_MUTATE || '';
const MUTS = {
  noauth:    ['cca_report.js', "        function authDefs() { return Array.isArray(spec.authored)", "        function authDefs() { return false && Array.isArray(spec.authored)"],
  draftleak: ['cca_report.js', "                else out.push({ k: 'p', text: 'Not written yet.' });", "                else out.push({ k: 'p', text: (r && r.draft && r.draft.text) || 'Not written yet.' });"],
  diag:      ['cca_report.js', "            var lx = laneX[a.c + '|s:' + e[0]], d = 'M' + xs + ',' + ys + ' H' + lx;", "            var lx = laneX[a.c + '|s:' + e[0]], d = 'M' + xs + ',' + ys + ' L' + xt + ',' + yt; if (0)"],
  through:   ['cca_report.js', "            if (!clash(want)) return want;", "            return want;"],
  ackraw:    ['change_ack.js', "            if (e.space === 'pc' && e.key === 'ccaReports') {", "            if (false) {"],
  autobook:  ['change_ack.js', "                    if (was == null && (f === 'no' || (f === 'status' && now === 'Draft'))) return;   // filled in by the app", ""]
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) {
  let b = fs.readFileSync(path.join(SITE, name), 'utf8');
  if (MUTS[MUT] && MUTS[MUT][0] === name) { if (b.indexOf(MUTS[MUT][1]) < 0) { console.error('mutation anchor not found: ' + MUT); process.exit(3); } b = b.replace(MUTS[MUT][1], MUTS[MUT][2]); }
  return b;
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  console.log('regression_cca_reports_20261109' + (MUT ? ' [mutation ' + MUT + ']' : ''));
  console.log('\n[S] static');
  const CR = src('cca_report.js'), PA = src('pra_autopilot.js'), ZA = src('zsa_autopilot.js'), CA = src('cma_autopilot.js'), AK = src('change_ack.js'), IDX = src('index.html');
  const ver = (t, rx) => ((rx.exec(t) || [])[1] || '');
  const pins = [['cca_report.js', CR, /SLCcaReport v(\d+\.\d+)/], ['pra_autopilot.js', PA, /SLPraAuto v(\d+\.\d+)/], ['zsa_autopilot.js', ZA, /SLZsaAuto v(\d+\.\d+)/], ['cma_autopilot.js', CA, /SLCmaAuto v(\d+\.\d+)/], ['change_ack.js', AK, /change_ack\.js - v(\d+\.\d+)/]];
  check('S1 each changed file: its header, its VERSION (where it has one) and its index.html pin agree', pins.every(([n, s, rx]) => { const v = ver(s.slice(0, 300), rx); return v && IDX.indexOf(n + '?v=' + v + '"') > 0 && (!/var VERSION = '/.test(s) || s.indexOf("var VERSION = '" + v + "'") >= 0); }), JSON.stringify(pins.map(([n, s, rx]) => [n, ver(s.slice(0, 300), rx)])));
  check('S2 the three reports declare the three written parts; the CMA writes them once per report', ['mitigations', 'compliance', 'conclusion'].every((id) => [PA, ZA, CA].every((s) => s.indexOf("{ id: '" + id + "'") >= 0)) && /authoredAt: 'report'/.test(CA) && /9\. Summary of results/.test(PA));
  check('S3 no em dashes in the new text', ['Proposed mitigations', 'Path to compliance', 'Not written yet', 'Draft with AI'].every((t) => { const i = CR.indexOf(t) >= 0 ? CR : PA; return true; }) && !/\u2014/.test((PA.match(/authored: \[[\s\S]*?\],/) || [''])[0] + (ZA.match(/authored: \[[\s\S]*?\],/) || [''])[0] + (CA.match(/authored: \[[\s\S]*?\],/) || [''])[0] + (CR.match(/function authHtml[\s\S]*?\n        \}/) || [''])[0]));
  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) { console.log('  SKIP  Playwright is not installed here; [B] needs the real app'); }
  else {
    console.log('\n[B] the real app on the Aeolus HL-1 demo');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
      let b; try { if (fs.statSync(f).isDirectory()) throw 0; b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
      const name = path.relative(SITE, f).split(path.sep).join('/'); if (MUTS[MUT] && MUTS[MUT][0] === name) b = Buffer.from(src(name));
      r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const b = await pw.chromium.launch(), errs = [];
    try {
      const pg = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
      pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); pg.on('dialog', (d) => d.dismiss().catch(() => {}));
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
      await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
      await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
      await pg.evaluate(() => window.loadHL1Demo()); await tick(9000);
      const before = await pg.evaluate(() => JSON.parse(JSON.stringify(projectConfig.ccaReports || {})));   // before any report page is drawn
      await pg.evaluate(() => switchTab('pra')); await tick(2500);
      await pg.evaluate(() => SLCcaReport.get('pra').setTab('PRA-003')); await tick(1500);
      console.log('\n[A] the written parts');
      const A1 = await pg.evaluate(() => { const pv = document.querySelector('#ccr-host-pra [data-ccdoc]'); const parts = [...pv.querySelectorAll('.ccr-part')].map((x) => x.textContent); return { tail: parts.slice(-4), boxes: [...pv.querySelectorAll('[data-cc-authbox]')].map((x) => x.getAttribute('data-cc-authbox')), btns: [...pv.querySelectorAll('[data-cc-authbox="PRA-003|conclusion"] [data-cc-auth]')].map((x) => x.textContent), empty: [...pv.querySelectorAll('[data-ccsec="PRA-003"] p')].filter((p) => p.textContent === 'Not written yet.').length }; });
      check('A1 each risk report ends with the summary of results, then "10. Proposed mitigations", "11. Path to compliance" and "12. Conclusion", each "Not written yet." with "Write it myself" and "Draft with AI"', JSON.stringify(A1.tail) === '["9. Summary of results","10. Proposed mitigations","11. Path to compliance","12. Conclusion"]' && JSON.stringify(A1.boxes) === '["PRA-003|mitigations","PRA-003|compliance","PRA-003|conclusion"]' && JSON.stringify(A1.btns) === '["Write it myself","Draft with AI"]' && A1.empty === 3, JSON.stringify(A1));
      // the app's own fill-ins (default document numbers, pictures ticked by default, the report open) are not the person's change
      const B0 = await pg.evaluate((bf) => { const R = window.SLRecords; const it = R.describe(R.diff(R.records({ projectConfig: { ccaReports: bf } }), R.records({ projectConfig: { ccaReports: JSON.parse(JSON.stringify(projectConfig.ccaReports)) } }))).filter((x) => x.key === 'ccaReports'); return it.map((x) => ({ book: x.book, label: x.label, fields: x.fields })); }, before);
      check('A2 opening reports and the app filling in its defaults is bookkeeping, never listed as the person\'s change', B0.length <= 1 && B0.every((x) => x.book), JSON.stringify(B0));
      await pg.click('[data-cc-authk="PRA-003|mitigations"][data-cc-auth="authedit"]'); await tick(300);
      await pg.fill('[data-cc-authtext="PRA-003|mitigations"]', 'Add a deflector plate inboard of each main bogie.\n\nMove the hydraulic system B line outboard of the burst volume.');
      await pg.click('[data-cc-authk="PRA-003|mitigations"][data-cc-auth="authsave"]'); await tick(400);
      const A3 = await pg.evaluate(() => { const sec = document.querySelector('#ccr-host-pra [data-ccsec="PRA-003"]'), ps = [...sec.querySelectorAll('p')].map((p) => p.textContent); const r = SLCcaReport.get('pra').authored('PRA-003', 'mitigations'); return { in: ps.indexOf('Add a deflector plate inboard of each main bogie.') >= 0 && ps.indexOf('Move the hydraulic system B line outboard of the burst volume.') >= 0, by: r && r.by, src: r && r.source, btn: [...document.querySelectorAll('[data-cc-authbox="PRA-003|mitigations"] [data-cc-auth]')].map((x) => x.textContent) }; });
      check('A3 "Write it myself": what is saved is in the report, paragraph by paragraph, recorded with who wrote it; the part now offers Edit and Redraft', A3.in && !!A3.by && A3.src === 'person' && JSON.stringify(A3.btn) === '["Edit","Redraft with AI"]', JSON.stringify(A3));
      await pg.evaluate(() => { window.SafetyLabAI = window.SafetyLabAI || {}; window.SafetyLabAI.complete = async (o) => { window.__aiReq = o; await new Promise((r) => setTimeout(r, 600)); return { text: 'One tire burst can take out wheel braking on one bogie. TBD\n\nThe risk stays open until the plate test is reported.', model: 'stub' }; }; window.__stops = 0; window.slabAiStop = () => { window.__stops++; }; });
      await pg.click('[data-cc-authk="PRA-003|conclusion"][data-cc-auth="authai"]'); await tick(150);
      const A4 = await pg.evaluate(() => { const st = document.querySelector('[data-cc-authbox="PRA-003|conclusion"] [data-cc-auth="authstop"]'); if (st) st.click(); return { stop: !!st, stops: window.__stops }; });
      check('A4 while the AI drafts, the part shows a Stop button that calls the one Stop', A4.stop && A4.stops === 1, JSON.stringify(A4));
      await tick(1200);
      const A5 = await pg.evaluate(() => { const box = document.querySelector('[data-cc-authdraft="PRA-003|conclusion"]'), sec = document.querySelector('#ccr-host-pra [data-ccsec="PRA-003"]'); const req = window.__aiReq || {}; return { draft: !!box, rests: box ? box.querySelector('.ccr-authwhy').textContent : '', flag: box && box.querySelector('.ccr-authflag') ? box.querySelector('.ccr-authflag').textContent : '', inDoc: /plate test is reported/.test([...sec.querySelectorAll('p')].map((p) => p.textContent).join(' ')), word: /plate test is reported/.test(SLCcaReport.get('pra').model({ report: 'PRA-003' }).blocks.map((x) => x.text || '').join(' ')), feat: req.feature, sys: /drafting the "Conclusion" section of a Particular Risk Assessment/.test(req.system || ''), grounded: /deflector plate/.test((req.messages || [{}])[0].content || '') && /Summary of results/.test((req.messages || [{}])[0].content || '') }; });
      check('A5 the AI draft is shown with what it rests on and what the checks flag, and is not in the report or its Word file until someone accepts it', A5.draft && /This report section as it stands/.test(A5.rests) && /TBD|placeholder|Check before accepting/i.test(A5.flag) && !A5.inDoc && !A5.word, JSON.stringify(A5));
      check('A6 the draft is grounded in the section itself: the report drafting skill, the section named, its results and the parts already written in the request', A5.feat === 'report.section.draft' && A5.sys && A5.grounded, JSON.stringify(A5));
      await pg.click('[data-cc-authk="PRA-003|conclusion"][data-cc-auth="authaccept"]'); await tick(400);
      const A7 = await pg.evaluate(() => { const R = SLCcaReport.get('pra'), r = R.authored('PRA-003', 'conclusion'); const m = R.model({ report: 'PRA-003' }), t = m.blocks.map((x) => x.text || '').join('\n'); R.setTab(null); const reg = [...document.querySelectorAll('#ccr-host-pra [data-cc-regrow="PRA-003"] td')].map((x) => x.textContent)[4]; return { src: r && r.source, draft: !!(r && r.draft), word: /plate test is reported/.test(t) && /deflector plate/.test(t), noAuth: !m.blocks.some((x) => x.k === 'auth'), reg }; });
      check('A7 Accept puts it in the report and the Word file (recorded as accepted from the AI); the register shows the written conclusion', A7.src === 'ai' && !A7.draft && A7.word && A7.noAuth && /plate test is reported/.test(A7.reg || ''), JSON.stringify(A7));
      const B1 = await pg.evaluate((bf) => { const R = window.SLRecords; const it = R.describe(R.diff(R.records({ projectConfig: { ccaReports: bf } }), R.records({ projectConfig: { ccaReports: JSON.parse(JSON.stringify(projectConfig.ccaReports)) } }))).filter((x) => x.key === 'ccaReports'); return it.map((x) => ({ area: x.area, label: x.label, book: x.book, fields: x.fields })); }, before);
      await pg.evaluate(() => { const R = SLCcaReport.get('pra'); R.setTab('PRA-003'); R.setDoc('status', 'In review'); R.issue('First issue'); });
      const B2 = await pg.evaluate((bf) => { const R = window.SLRecords; const it = R.describe(R.diff(R.records({ projectConfig: { ccaReports: bf } }), R.records({ projectConfig: { ccaReports: JSON.parse(JSON.stringify(projectConfig.ccaReports)) } }))).filter((x) => x.key === 'ccaReports'); return it.map((x) => ({ area: x.area, label: x.label, book: x.book, fields: x.fields })); }, before);
      const f2 = (B2[0] || { fields: [] }).fields, raw = JSON.stringify(B2).indexOf('{\\"doc\\"') >= 0 || /"now":"\{/.test(JSON.stringify(B2));
      check('A8 the change review says it in plain words, report by report: status Draft to In review, revision A issued, never the settings as raw text', B2.length === 1 && B2[0].area === 'Reports' && /PRA-003 report/.test(B2[0].label) && f2.some((f) => f.name === 'status' && f.was === 'Draft' && f.now === 'In review') && f2.some((f) => f.name === 'revision issued' && /revision A/.test(f.now)) && !raw && !B2[0].book, JSON.stringify(B2).slice(0, 600));
      check('A9 ...and no document number the app filled in is listed as a change', !f2.some((f) => f.name === 'document number'), JSON.stringify(f2));
      // ZSA and CMA
      await pg.evaluate(() => switchTab('zsa')); await tick(2000); await pg.evaluate(() => SLCcaReport.get('zsa').setTab('Z-MLGW')); await tick(1200);
      const Z = await pg.evaluate(() => [...document.querySelectorAll('#ccr-host-zsa [data-ccdoc] [data-cc-authbox]')].map((x) => x.getAttribute('data-cc-authbox')));
      check('A10 every zone report ends with the same three written parts', JSON.stringify(Z) === '["Z-MLGW|mitigations","Z-MLGW|compliance","Z-MLGW|conclusion"]', JSON.stringify(Z));
      await pg.evaluate(() => switchTab('cma')); await tick(2500);
      const CM = await pg.evaluate(() => { const pv = document.querySelector('#ccr-host-cma [data-ccdoc]'); return { boxes: [...pv.querySelectorAll('[data-cc-authbox]')].map((x) => x.getAttribute('data-cc-authbox')), heads: [...pv.querySelectorAll('h3')].map((x) => x.textContent.replace(/Edit$/, '').trim()).filter((t) => /Proposed mitigations|Path to compliance|Conclusion/.test(t)) }; });
      check('A11 each CMA report (aircraft level or a system) has the three written parts once, as its own numbered headings', JSON.stringify(CM.boxes) === '["aircraft|mitigations","aircraft|compliance","aircraft|conclusion"]' && CM.heads.length === 3 && CM.heads.every((h) => /^\d+\. /.test(h)), JSON.stringify(CM));
      console.log('\n[D] the "what one event takes out" diagrams');
      const geo = () => { const all = []; document.querySelectorAll('.ccr-fig svg').forEach((svg) => { if (!svg.querySelector('.ccr-edge')) return; const boxes = [...svg.querySelectorAll('.ccr-node rect')].map((r) => ({ x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') })); let through = 0, diag = 0, overlap = 0; const segs = [];
        svg.querySelectorAll('.ccr-edge').forEach((p) => { const t = (p.getAttribute('d') || '').match(/[MHVL][^MHVL]+/g) || []; let x = 0, y = 0; const pts = []; t.forEach((c) => { const v = c.slice(1).trim().split(/[ ,]+/).map(Number); if (c[0] === 'M' || c[0] === 'L') { x = v[0]; y = v[1]; } else if (c[0] === 'H') x = v[0]; else y = v[0]; pts.push([x, y]); }); for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]); });
        segs.forEach(([[x1, y1], [x2, y2]]) => { if (x1 !== x2 && y1 !== y2) diag++; boxes.forEach((bb) => { if (Math.max(x1, x2) > bb.x + 2 && Math.min(x1, x2) < bb.x + bb.w - 2 && Math.max(y1, y2) > bb.y + 2 && Math.min(y1, y2) < bb.y + bb.h - 2) through++; }); });
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], c = boxes[j]; if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) overlap++; }
        all.push({ edges: segs.length, through, diag, overlap }); }); return all; };
      const D = await pg.evaluate(async (g) => { const geoF = new Function('return (' + g + ')')(); const out = []; const R = SLCcaReport.get('pra'); for (const rp of R.reports()) { R.setTab(rp.id); await new Promise((r) => setTimeout(r, 60)); geoF().forEach((x) => out.push(Object.assign({ r: rp.id }, x))); } R.setTab(null); switchTab('zsa'); await new Promise((r) => setTimeout(r, 400)); const Z2 = SLCcaReport.get('zsa'); for (const rp of Z2.reports().slice(0, 12)) { Z2.setTab(rp.id); await new Promise((r) => setTimeout(r, 60)); geoF().forEach((x) => out.push(Object.assign({ r: rp.id }, x))); } return out; }, geo.toString()).catch((e) => [{ err: String(e) }]);
      check('D1 every PRA and ZSA loss diagram: connectors are straight lines with 90 degree turns (no diagonals), never through a box, and no box overlaps another', D.length >= 10 && D.every((x) => !x.err && x.diag === 0 && x.through === 0 && x.overlap === 0 && x.edges > 0), JSON.stringify(D.filter((x) => x.err || x.diag || x.through || x.overlap).slice(0, 5)) + ' n=' + D.length);
      const H = await pg.evaluate(async () => { switchTab('pra'); const R = SLCcaReport.get('pra'); R.setTab('PRA-001'); await new Promise((r) => setTimeout(r, 300)); const svg = [...document.querySelectorAll('#ccr-host-pra .ccr-fig svg')].find((s) => s.querySelector('.ccr-edge')); const n = [...svg.querySelectorAll('.ccr-node')].find((g) => /^s:/.test(g.getAttribute('data-ccnode'))); n.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await new Promise((r) => setTimeout(r, 350)); const id = n.getAttribute('data-ccnode'); const on = [...svg.querySelectorAll('.ccr-edge.on')].map((p) => p.getAttribute('data-e')); const off = [...svg.querySelectorAll('.ccr-edge:not(.on)')]; const opOff = off.length ? +getComputedStyle(off[0]).opacity : 0; return { hl: svg.classList.contains('ccr-hl'), on: on.length, mine: on.every((e) => e.split('|').indexOf(id) >= 0), opOff }; });
      check('D2 hovering a box lights only its own connectors; the rest fade', H.hl && H.on > 0 && H.mine && H.opOff < 0.5, JSON.stringify(H));
      check('D3 no page errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
    } finally { await b.close(); srv.close(); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
