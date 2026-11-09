#!/usr/bin/env node
/*
 * Regression (8 Nov 2026): the PRA page is the PRA Autopilot and the PRA report (site/pra_autopilot.js v2.0) on the
 * shared report frame of the PRA, ZSA and CMA Autopilots (site/cca_report.js v1.0, SLCcaReport).
 *
 * Waqas, 8 Nov 2026: "I want the PRA table gone, and each PRA presented in a report format listing out all the stuff
 * that is impacted, all equipment in the zone, all functions that equipment performs"; "PRA build and ZSA similar to the
 * planing autopilot, ability to see the reports etc. can we do something similar for CMA"; confirmed: the tables go,
 * with an inline Edit per report section plus an "Add" button so no data entry is lost.
 * Pinned:
 *   [S] static: the frame parses, carries its API at the top, no eval; load order and pins; the table and form are kept
 *       in the page hidden; the "Dynamic threat models" panel is no longer drawn (praDynamicModel stays); no em dashes.
 *   [A] the real app, Aeolus HL-1 demo with its CAD model: the table is gone; one section per particular risk; every
 *       section has the eight parts (the risk with source, standard and mitigation; zones by name; equipment housed and
 *       routed, by system; functions with the owning system; what is lost, direct and knock-on, failure conditions with
 *       names and severity, MAC rules; the choices; retention in words; Simulate); IDs carry names.
 *   [Q] an answer card click lights up the paragraph it wrote; "See where it goes" does the same.
 *   [F] a figure box opens the panel with its inputs, outputs and acceptance; "Show where the program stands" shows
 *       live counts in the panel only.
 *   [O] outputs: accept, then a change reopens it.
 *   [W] Word: cover, contents, lists of tables and figures, numbered captions; no counts or status in the text.
 *   [D] dark mode: a dark, readable document (contrast at least 4.5); Word and print stay light.
 *   [E] Edit and Add write praData with no duplicate rows; an Edit on a row the Autopilot writes survives its next write.
 *   [K] the frame's own question cards, Edit and Add, numbering and acceptance on a test analysis (the ZSA and CMA path).
 *   [T] v1.2 / v2.1, Waqas, confirmed: "I want all PRAs on their individual tab with their auto pilot and report preview".
 *       One tab per particular risk (ID and short name, PRA ID order, "All risks" first); a risk's tab holds only its
 *       Autopilot questions and only its section (short header, figures, node panel, Edit, "Export this risk to Word");
 *       All risks holds the whole document with Word and Print; Add opens the new tab; the ZSA's "Open PRA-xxx in the PRA
 *       report" opens that tab; the tab is remembered per project; no horizontal page scroll at 390 and 1440 px; the
 *       tabs read in dark mode; the frame's tabs are generic (a test analysis with its own question cards, filtered).
 * MUTATION PROOFS: SL_PRA_REPORT_MUTATE=dup | noflash | noreopen | counts | noequip | nofn | darkleak | table | nonames
 *   | notabs | tabreport | tabq | qfilter | noaddtab | noswitch | noremember | wide | darktab | wordsec | nokeep.
 *   Each turns this suite red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_pra_report_20261108.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 700) : '')); } };
const REPO = path.join(__dirname, '..'), SITE = path.join(REPO, 'site');
const MUT = process.env.SL_PRA_REPORT_MUTATE || '';
const MUTS = {
  dup:      ['pra_autopilot.js', "if (dupT) return { ok: false, err: dupT.praId + ' already covers ' + dupT.threat + '. Edit that one instead.' };", ''],
  noflash:  ['cca_report.js', 'function answered(qid) { ui0.flash = qid || null;', 'function answered(qid) { ui0.flash = null;'],
  noreopen: ['cca_report.js', "var st = !r ? 'open' : (r.fp === fp ? 'accepted' : 'reopened');", "var st = !r ? 'open' : 'accepted';"],
  counts:   ['pra_autopilot.js', "the analysis asks what it reaches and whether the aircraft can still fly and land safely.' },", "the analysis asks what it reaches and whether the aircraft can still fly and land safely. ' + _arr(_g('praData')).length + ' particular risks are recorded.' },"],
  noequip:  ['pra_autopilot.js', 'function equipmentOf(code) {', 'function equipmentOf(code) { return [];'],
  nofn:     ['pra_autopilot.js', 'function functionsOf(codes) {', 'function functionsOf(codes) { return [];'],
  darkleak: ['cca_report.js', 'C = dark ? DARK : LIGHT;', 'C = LIGHT;'],
  table:    ['index.html', '<div id="pra-legacy-ui" hidden style="display:none">', '<div id="pra-legacy-ui">'],
  nonames:  ['pra_autopilot.js', "function fcLabel(fcId) { var f = _fc(fcId); return f && f.fcDesc ? fcId + ' ' + f.fcDesc : fcId; }", 'function fcLabel(fcId) { return fcId; }'],
  // v1.2 / v2.1: the tabs
  notabs:     ['pra_autopilot.js', "tabs: { allLabel: 'All risks', noun: 'risk' },", ''],
  tabreport:  ['cca_report.js', "bodyHtml(doc({ dark: dark, only: cur, secs: secs }), true)", "bodyHtml(doc({ dark: dark, secs: secs }), true)"],
  tabq:       ['pra_autopilot.js', "var L = tab ? res.risks.filter(function (r) { return secOf(r) === tab; }) : res.risks;", "var L = res.risks;"],
  qfilter:    ['cca_report.js', "function (q, id) { return q.sec === id; }", "function (q, id) { return true; }"],
  noaddtab:   ['cca_report.js', "(wasAdd || (a && storedTab() === a && nid !== a))", "((a && storedTab() === a && nid !== a))"],
  noswitch:   ['cca_report.js', "if (tabsOn() && /^sec:/.test(target) && !(o && o.stay)) {", "if (false) {"],
  noremember: ['cca_report.js', "var s = store(); if (id) s.tab = id; else delete s.tab;", "var s = store(); delete s.tab;"],
  wide:       ['cca_report.js', "@media (max-width:1100px){.ccr-cols{grid-template-columns:minmax(0,1fr)}}.ccr-left,.ccr-right{min-width:0;max-width:100%}", "@media (max-width:1100px){.ccr-cols{grid-template-columns:1fr}}"],
  darktab:    ['cca_report.js', "body.theme-dark .ccr-tab{background:#1B1F26;border-color:#3A404A;color:#E8EAED}", ""],
  wordsec:    ['cca_report.js', "var bl = doc({ forExport: true, only: only })", "var bl = doc({ forExport: true })"],
  nokeep:     ['cca_report.js', "if (Math.abs(tb.clientWidth - w0) < 1) return; w0 = tb.clientWidth; keep(); setTimeout(keep, 60); setTimeout(keep, 250);", "return;"]
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) {
  let b = fs.readFileSync(path.join(SITE, name), 'utf8');
  if (MUTS[MUT] && MUTS[MUT][0] === name) { if (b.indexOf(MUTS[MUT][1]) < 0) { console.error('mutation anchor not found: ' + MUT); process.exit(3); } b = b.replace(MUTS[MUT][1], MUTS[MUT][2]); }
  return b;
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
function lum(rgb) { const m = String(rgb).match(/\d+(\.\d+)?/g); if (!m) return 0; const c = m.slice(0, 3).map((v) => { v = +v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

(async () => {
  console.log('regression_pra_report_20261108' + (MUT ? ' [mutation ' + MUT + ']' : ''));
  console.log('\n[S] static');
  const CR = src('cca_report.js'), PA = src('pra_autopilot.js'), IDX = src('index.html'), CM = src('cca_models.js');
  let okp = true; try { new Function(CR); new Function(PA); } catch (e) { okp = false; }
  check('S1 cca_report.js v1.2 or later (1.1: table rows carry their question; 1.2: tabs) and pra_autopilot.js v2.1 or later (risk tabs) parse, header and VERSION the same; no eval of any kind (the CSP forbids it); stores read through SLEnv', okp && (function () { var a = /SLCcaReport v(1\.(\d+))/.exec(CR.slice(0, 200)), b = /SLPraAuto v(2\.(\d+))/.exec(PA.slice(0, 200)); return !!a && !!b && +a[2] >= 2 && +b[2] >= 1 && CR.indexOf("VERSION = '" + a[1] + "'") >= 0 && PA.indexOf("VERSION = '" + b[1] + "'") >= 0; })() && !/new Function|\beval\(/.test(CR + PA) && /SLEnv/.test(CR));
  check('S2 the frame documents its API at the top (define, get, palette, nodeG; sections, questions or renderQuestions, edit, io, outputs, live, node)', /THE API/.test(CR.slice(0, 12000)) && ['SLCcaReport.define(spec)', 'SLCcaReport.get(key)', 'SLCcaReport.palette()', 'SLCcaReport.nodeG(', 'sections(ctx)', 'renderQuestions(R)', 'questions()', 'edit ', 'io ', 'outputs()', 'live(nodeId)', 'node(nodeId)'].every((k) => CR.slice(0, 12000).indexOf(k) >= 0));
  const iUI = IDX.indexOf('autopilot_ui.js?v='), iCR = IDX.search(/cca_report\.js\?v=1\.([2-9])"/), iPA = IDX.search(/pra_autopilot\.js\?v=2\.([1-9])"/), iZA = IDX.indexOf('zsa_autopilot.js?v=');
  check('S3 load order: autopilot_ui.js, then cca_report.js v1.2 or later, then the analysis modules; pins moved (pra_autopilot 2.1 or later, cca_models 1.04 or later: 1.05 with the ZSA)', iUI > 0 && iCR > iUI && iPA > iCR && iZA > iCR && /cca_models\.js\?v=1\.0[4-9]/.test(IDX));
  const legacy = /<div id="pra-legacy-ui" hidden style="display:none">[\s\S]*?<table id="pra-table">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div id="view-zsa"/.test(IDX);
  check('S4 the old PRA form and table stay in the page for the code that reads them, hidden', legacy);
  const rpm = (CM.match(/function renderPraModels\(\) \{[\s\S]*?\n    \}/) || [''])[0];
  check('S5 the "Dynamic threat models" panel is no longer drawn on the PRA page; praDynamicModel stays exported and gives direct and knock-on systems', rpm && !/innerHTML|appendChild/.test(rpm) && /remove\(\)/.test(rpm) && !/tabId === 'pra'\) setTimeout\(renderPraModels/.test(CM) && /window\.praDynamicModel = praDynamicModel/.test(CM) && /directSystems:/.test(CM) && /knockOn:/.test(CM));
  check('S6 no em dashes in the frame or the PRA module', CR.indexOf('—') < 0 && PA.indexOf('—') < 0);
  check('S7 the frame documents its tabs at the top (spec.tabs, tabLabel, the per-section question filter, tab() and setTab(), model({ only }))', /tabs\s+optional \(v1\.2\)/.test(CR.slice(0, 12000)) && ['tabLabel', 'filter(question, sectionId)', 'renderQuestions(R, sectionId)', 'setTab(id)', "{ only: sectionId }"].every((k) => CR.slice(0, 12000).indexOf(k) >= 0));

  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) { console.log('  SKIP  Playwright is not installed here; the app part needs the real app'); }
  else {
    const http = require('http');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.step': 'application/step' };
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
      let b; try { if (fs.statSync(f).isDirectory()) throw 0; b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
      const name = path.relative(SITE, f); if (MUTS[MUT] && MUTS[MUT][0] === name) b = Buffer.from(src(name));
      r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const b = await pw.chromium.launch();
    const errs = [];
    try {
      const pg = await (await b.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
      pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); pg.on('dialog', (d) => d.dismiss().catch(() => {}));
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
      await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
      await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
      await pg.evaluate(() => window.loadHL1Demo()); await tick(9000);
      await pg.evaluate(() => { window.__opened = []; window.open = function () { const d = { open() {}, write(h) { window.__opened.push(h); }, close() {} }; return { document: d }; }; });
      await pg.evaluate(() => switchTab('pra')); await tick(1800);

      console.log('\n[A] the report');
      const A = await pg.evaluate(() => {
        const R = SLCcaReport.get('pra'), host = document.getElementById('ccr-host-pra'), pv = host && host.querySelector('[data-ccdoc]');
        const t0 = performance.now(); R.render(); const ms = performance.now() - t0;
        const bl = R.doc(), rows = praData.filter((r) => r && r.praId);
        const secIds = [...document.querySelectorAll('#ccr-host-pra [data-ccsec]')].map((e) => e.getAttribute('data-ccsec'));
        const per = {};
        rows.forEach((r) => { const s = bl.filter((x) => x.sec === r.praId); per[r.praId] = { parts: s.filter((x) => x.k === 'part').map((x) => x.text), text: s.map((x) => x.k === 'table' ? x.caption + ' ' + JSON.stringify(x.rows) : (x.text || x.caption || x.label || '')).join('\n'), acts: s.filter((x) => x.k === 'act').map((x) => x.label), tables: s.filter((x) => x.k === 'table').map((x) => ({ name: x.name, rows: x.rows })) }; });
        const tbl = document.getElementById('pra-table');
        return { ms: Math.round(ms), shown: !!host && !!pv && host.offsetParent !== null, left: !!document.querySelector('#ccr-host-pra #pra-auto-host [data-pra-auto]'), tableVisible: !!(tbl && tbl.offsetParent), formVisible: !!(document.getElementById('pra-id') && document.getElementById('pra-id').offsetParent), models: !!document.getElementById('pra-models-host'),
          rows: rows.map((r) => r.praId), secIds, per, all: bl.map((x) => x.k === 'table' ? JSON.stringify(x.rows) : (x.text || '')).join('\n') };
      });
      check('A1 the PRA table, its form and the threat models panel are gone from the page; the Autopilot is on the left and the report on the right', A.shown && A.left && !A.tableVisible && !A.formVisible && !A.models, JSON.stringify({ shown: A.shown, left: A.left, t: A.tableVisible, f: A.formVisible, m: A.models }));
      check('A2 one section per particular risk (every PRA record, in order, none twice)', A.rows.length >= 15 && JSON.stringify(A.secIds) === JSON.stringify(A.rows.slice().sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))), A.secIds.join(',') + ' vs ' + A.rows.join(','));
      // 9 Nov 2026 (pra_autopilot 2.3, the whole story): the risk and its question, method, basis, calculations, the results, the choices, retention, the conclusion
      const parts7 = ['1. The risk and the question it answers', '2. Method', '3. Basis', '4. Calculations', '5. Results: what it reaches', '5.1 Zones it reaches', '5.2 Equipment in those zones', '5.3 Functions that equipment performs', '6. Results: what is lost', '7. The choices made', '8. Retention of catastrophic outcomes', '9. Conclusion'];
      const top = (id) => A.per[id].parts.filter((t) => !/^4\.\d+ /.test(t));   // the per-source headings 4.1, 4.2 ... sit inside the calculations
      check('A3 every section has all its parts, and Simulate', A.rows.every((id) => JSON.stringify(top(id)) === JSON.stringify(parts7) && A.per[id].acts.some((l) => /Simulate/.test(l))), A.rows.filter((id) => JSON.stringify(top(id)) !== JSON.stringify(parts7)).join(','));
      const t3 = A.per['PRA-003'];
      check('A4 the risk: what it is, where it comes from, the standard it is assessed against and its mitigation (PRA-003 tire burst)', /\*\*What it is\.\*\* Tire burst/.test(t3.text) && /\*\*Where it comes from\.\*\* \S+/.test(t3.text) && /25\.734/.test(t3.text) && /\*\*Mitigation\.\*\* Line separation/.test(t3.text), t3.text.slice(0, 600));
      check('A5 the standard follows the kind of risk (rotor burst: AC 20-128A; bird: 25.571; lightning: 25.581)', /AC 20-128A/.test(A.per['PRA-001'].text) && /25\.571/.test(A.per['PRA-006'].text) && /25\.581/.test(A.per['PRA-007'].text));
      check('A6 the zones it reaches, by code and name', /Z-MLGW Main landing gear bays\./.test(t3.text));
      const eq3 = (t3.tables.find((t) => /^eq-/.test(t.name)) || { rows: [] }).rows;
      check('A7 equipment housed in the zone from the CAD model, by system (the bogies under Landing Gear, the pumps under Hydraulic System A and B)', eq3.some((r) => r.System === 'Landing Gear & Braking' && /Main bogie, left aft \(LDG-BOGIE-LA\)/.test(r['Housed in the zone'])) && eq3.some((r) => r.System === 'Hydraulic System A' && /HYDA-EMP/.test(r['Housed in the zone'])) && eq3.some((r) => r.System === 'Hydraulic System B'), JSON.stringify(eq3).slice(0, 600));
      check('A8 ...and everything routed through it: the CAD runs and the routing records with what they carry', eq3.some((r) => /hydraulic line H-A-01/.test(r['Routed through it'])) && eq3.some((r) => /RT-001 Brake hydraulic lines A\/B \(carries LRU-LDG-02 Brake control unit A/.test(r['Routed through it'])), JSON.stringify(eq3).slice(0, 600));
      const fn3 = (t3.tables.find((t) => /^fn-/.test(t.name)) || { rows: [] }).rows;
      check('A9 the functions that equipment performs, by name, with the owning system and what performs it', fn3.some((r) => /^SF-07 Steer on the ground$/.test(r.Function) && r['Owning system'] === 'Landing Gear & Braking' && /LDG-BOGIE/.test(r['Performed by'])) && fn3.some((r) => /^SF-23 /.test(r.Function) && r['Owning system'] === 'Fire Protection'), JSON.stringify(fn3).slice(0, 600));
      check('A10 what is lost: systems lost directly and as a knock-on, in words', /\*\*Systems lost directly\.\*\* Landing Gear & Braking/.test(t3.text) && /\*\*Systems lost as a knock-on\.\*\* /.test(t3.text));
      const fc3 = (t3.tables.find((t) => /^fc-/.test(t.name)) || { rows: [] }).rows;
      check('A11 the failure conditions that trip, with their names and severity', fc3.some((r) => /^FC-28 Structural failure/.test(r['Failure condition']) && r.Severity === 'Catastrophic') && fc3.some((r) => /^FC-15 Landing gear fails/.test(r['Failure condition']) && r.Severity === 'Hazardous'), JSON.stringify(fc3));
      check('A12 the MAC rules that break, in words (the function, when, what it needs, what is left)', /MAC\) rules that break\.\*\* SF-12 Extend, retract and lock the landing gear in Approach, Landing needs at least 1 of Landing Gear & Braking \(none left\)/.test(t3.text), (t3.text.match(/MAC\) rules[^\n]*/) || [''])[0]);
      check('A13 the choices: every set of lanes one event reaches together, with its answer or "Not decided yet"', /Not decided yet: One tire burst could (reach|cut)/.test(t3.text));
      check('A14 retention: each catastrophic outcome with its disposition in plain words', /FC-28 Structural failure resulting from unpaved-surface loads: (carried|open|reopened)/.test(t3.text) && A.rows.every((id) => /No catastrophic outcome is reached|: (carried|open|reopened)/.test(A.per[id].text)));
      const fcNoName = (A.all.match(/\bFC-[A-Z]*\d+\b(?! [A-Z])/g) || []), sfNoName = (A.all.match(/\bSF-\d+\b(?! [A-Z])/g) || []);
      check('A15 every failure condition and function ID in the report carries its name', fcNoName.length === 0 && sfNoName.length === 0, fcNoName.slice(0, 5).concat(sfNoName.slice(0, 5)).join(','));
      check('A16 the rotor burst section carries the disc numbers state (not run yet) and a picture of each of the four engines (from the 3D model, or the drawn danger area where it cannot be drawn)', /Not decided yet: the disc numbers for engine 1/.test(A.per['PRA-001'].text) && [1, 2, 3, 4].every((e) => new RegExp('Engine ' + e + ' rotor burst: the danger area|Engine ' + e + ' rotor burst, seen from above|Drawing the picture "Engine ' + e + '"').test(A.per['PRA-001'].text)), A.per['PRA-001'].text.slice(0, 300));
      check('A17 the whole report redraws in well under two seconds', A.ms < 2000, A.ms + ' ms');

      console.log('\n[T] one tab per particular risk');
      const T1 = await pg.evaluate(() => {
        const R = SLCcaReport.get('pra'), bar = document.querySelector('#ccr-host-pra [data-cctabs]'), tabs = bar ? [...bar.querySelectorAll('[role="tab"]')] : [];
        const ids = praData.filter((r) => r && r.praId).map((r) => r.praId).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
        return { role: bar && bar.getAttribute('role'), first: tabs[0] && tabs[0].textContent, firstOn: tabs[0] && tabs[0].getAttribute('aria-selected'), tabIds: tabs.slice(1).map((t) => t.getAttribute('data-cctab')), ids,
          labels: tabs.slice(1).map((t) => t.textContent), names: praData.filter((r) => r && r.praId).reduce((m, r) => (m[r.praId] = r.threat, m), {}), cur: R.tab(), api: R.tabs().length };
      });
      check('T1 a row of tabs across the top: "All risks" first and open, then one tab per particular risk in PRA ID order', T1.role === 'tablist' && T1.first === 'All risks' && T1.firstOn === 'true' && T1.cur === null && T1.ids.length >= 19 && JSON.stringify(T1.tabIds) === JSON.stringify(T1.ids) && T1.api === T1.ids.length, JSON.stringify(T1).slice(0, 500));
      check('T2 each tab is labeled with the PRA ID and its short name (PRA-001 Uncontained engine rotor burst)', T1.labels[0] === 'PRA-001Uncontained engine rotor burst' && T1.ids.every((id, i) => T1.labels[i] === id + T1.names[id]), T1.labels.slice(0, 3).join(' | '));
      const T3 = await pg.evaluate(() => {
        const h = document.getElementById('ccr-host-pra'), pv = h.querySelector('[data-ccdoc]'), txt = pv.textContent;
        return { cover: !!pv.querySelector('[data-cc-cover]'), toc: !!pv.querySelector('[data-cc-toc]'), lot: pv.querySelectorAll('[data-cc-lot]').length, lof: pv.querySelectorAll('[data-cc-lof]').length, ctl: /Document control/.test(txt), io: /Inputs and outputs/.test(txt), oa: /Outputs and acceptance/.test(txt),
          secs: pv.querySelectorAll('[data-ccsec]').length, word: !!h.querySelector('[data-cc-word]'), print: !!h.querySelector('[data-cc-print]'), wordsec: !!h.querySelector('[data-cc-wordsec]'), accept: !!h.querySelector('[data-cc-accept]'), docctl: !!h.querySelector('[data-cc-docctl]'), rail: h.querySelectorAll('#pra-auto-host [data-slap-rail]').length };
      });
      check('T3 All risks is the full PRA document (cover, document control, contents, lists of tables and figures, inputs and outputs, every risk section, outputs and acceptance) with Word and Print; the outputs to accept and document control sit on its left with the overview of every risk', T3.cover && T3.toc && T3.lot > 10 && T3.lof > 10 && T3.ctl && T3.io && T3.oa && T3.secs === T1.ids.length && T3.word && T3.print && !T3.wordsec && T3.accept && T3.docctl && T3.rail >= 9, JSON.stringify(T3));
      await pg.click('#ccr-host-pra [data-cctab="PRA-003"]'); await tick(600);
      const T4 = await pg.evaluate(() => {
        const h = document.getElementById('ccr-host-pra'), pv = h.querySelector('[data-ccdoc]'), left = h.querySelector('#pra-auto-host'), on = h.querySelector('.ccr-tab.on');
        const tire = SLPraAuto.compute().risks.find((r) => r.kind === 'TIRE'), others = SLPraAuto.compute().risks.filter((r) => SLPraAuto.secOf(r) !== 'PRA-003');
        const qboxes = [...left.querySelectorAll('[data-slap-q]')].map((e) => e.getAttribute('data-slap-q'));
        return { on: on && on.getAttribute('data-cctab'), sel: on && on.getAttribute('aria-selected'), cur: SLCcaReport.get('pra').tab(), secs: [...pv.querySelectorAll('[data-ccsec]')].map((e) => e.getAttribute('data-ccsec')), cover: !!pv.querySelector('[data-cc-cover],[data-cc-toc]'),
          head: (pv.querySelector('[data-cc-tabhead]') || {}).textContent || '', h: (pv.querySelector('[data-ccsec="PRA-003"] h3') || {}).textContent || '', edit: !!pv.querySelector('[data-cc-edit="PRA-003"]'), figs: pv.querySelectorAll('.ccr-fig [data-ccnode]').length,
          parts: [...pv.querySelectorAll('.ccr-part')].map((e) => e.textContent), word: !!h.querySelector('[data-cc-word]'), print: !!h.querySelector('[data-cc-print]'), wordsec: (h.querySelector('[data-cc-wordsec]') || {}).textContent || '', accept: !!h.querySelector('[data-cc-accept]'), docctl: !!h.querySelector('[data-cc-docctl]'),
          leftTab: left.querySelector('[data-pra-tab]') && left.querySelector('[data-pra-tab]').getAttribute('data-pra-tab'), rail: left.querySelectorAll('[data-slap-rail]').length, leftText: left.textContent, tireTitle: tire.title, otherTitles: others.map((r) => r.title), add: !!h.querySelector('[data-cc-add]'),
          caps: [...pv.querySelectorAll('.ccr-cap')].map((e) => e.textContent).slice(0, 3), otherQ: others.some((r) => r.questions.some((q) => qboxes.indexOf(q.id) >= 0)) };
      });
      check('T4 the PRA-003 tab opens: only its section on the right, with its own short header (the document, its number and revision) and the risk title, its Edit and its figures; no cover or contents', T4.on === 'PRA-003' && T4.sel === 'true' && T4.cur === 'PRA-003' && JSON.stringify(T4.secs) === '["PRA-003"]' && !T4.cover && /^Particular Risk Assessment · \S+-PRA-001 Rev /.test(T4.head) && /^1\. PRA-003 Tire burst/.test(T4.h) && T4.edit && T4.figs >= 4 && T4.parts.length === 12, JSON.stringify(T4).slice(0, 700));
      check('T5 ...its tables and figures are numbered on their own (Figure 1, Table 1); Word and Print give way to "Export this risk to Word"; Add stays', /^(Figure|Table) 1: /.test(T4.caps[0] || '') && !T4.word && !T4.print && T4.wordsec === 'Export this risk to Word' && T4.add && !T4.accept && !T4.docctl, JSON.stringify({ caps: T4.caps, w: T4.word, p: T4.print, ws: T4.wordsec, a: T4.accept, d: T4.docctl }));
      check('T6 ...and only the tire burst questions on the left (no other risk named, no other risk\'s question)', T4.leftTab === 'PRA-003' && T4.rail === 0 && T4.leftText.indexOf(T4.tireTitle) >= 0 && !T4.otherTitles.some((t) => T4.leftText.indexOf(t) >= 0) && !T4.otherQ, JSON.stringify({ lt: T4.leftTab, rail: T4.rail, l: T4.leftText.slice(0, 300) }));
      await pg.click('#ccr-host-pra [data-cctab="PRA-001"]'); await tick(600);
      const T7 = await pg.evaluate(() => { const left = document.querySelector('#pra-auto-host'); return { rail: [...left.querySelectorAll('[data-slap-rail]')].map((e) => e.getAttribute('data-slap-rail')), want: SLPraAuto.compute().risks.filter((r) => r.praId === 'PRA-001').map((r) => r.key), secs: [...document.querySelectorAll('#ccr-host-pra [data-ccdoc] [data-ccsec]')].map((e) => e.getAttribute('data-ccsec')) }; });
      await pg.click('#ccr-host-pra [data-cctab="PRA-004"]'); await tick(600);
      const T8 = await pg.evaluate(() => { const left = document.querySelector('#pra-auto-host'); return { noq: !!left.querySelector('[data-pra-noq]'), q: left.querySelectorAll('[data-slap-q],[data-slap-rail]').length, secs: [...document.querySelectorAll('#ccr-host-pra [data-ccdoc] [data-ccsec]')].map((e) => e.getAttribute('data-ccsec')) }; });
      check('T7 the rotor burst tab holds the four engines the CAD model works out under PRA-001, and nothing else; a risk not worked out on the model (PRA-004) says there is nothing to ask and keeps its report', JSON.stringify(T7.rail) === JSON.stringify(T7.want) && T7.want.length === 4 && JSON.stringify(T7.secs) === '["PRA-001"]' && T8.noq && T8.q === 0 && JSON.stringify(T8.secs) === '["PRA-004"]', JSON.stringify({ T7, T8 }));
      await pg.click('#ccr-host-pra [data-cctab="PRA-003"]'); await tick(500);
      await pg.evaluate(() => { const n = document.querySelector('#ccr-host-pra [data-ccdoc] [data-ccnode^="fc:FC-28"]'); n.scrollIntoView({ block: 'center' }); });
      await pg.click('#ccr-host-pra [data-ccdoc] [data-ccnode="fc:FC-28"]'); await tick(300);
      const T9 = await pg.evaluate(() => { const p = document.querySelector('#ccr-host-pra [data-cc-node="fc:FC-28"]'); const r = { panel: p ? p.textContent : '' }; const c = p && [...p.querySelectorAll('button')].find((b) => b.textContent === 'Close'); if (c) c.click(); return r; });
      check('T8 a figure box in the risk tab opens its node panel there', /FC-28 Structural failure/.test(T9.panel) && /accepted zonal disposition/.test(T9.panel), T9.panel.slice(0, 200));
      const T10 = await pg.evaluate(async () => {
        const R = SLCcaReport.get('pra'), m = R.model({ only: 'PRA-003' }), lib = await _loadDocxLib();
        const imgs = m.blocks.filter((x) => x.k === 'img'); for (const x of imgs) if (x.svg) x.dataUrl = await SLFtaPrint.png({ svg: x.svg, w: x.w, h: x.h }, 1);
        const blob = await SLReportWriter.docx(m, lib), buf = new Uint8Array(await blob.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        const heads = m.blocks.filter((x) => x.k === 'h').map((x) => x.text), text = m.blocks.map((x) => x.k === 'table' ? JSON.stringify(x.rows) : (x.text || x.caption || '')).join('\n');
        const bl = R.doc({ only: 'PRA-003' }), leadOk = bl.every((x, i) => !(x.k === 'table' || x.k === 'fig') || (bl[i - 1] && bl[i - 1].k === 'p' && bl[i - 1].text.indexOf((x.k === 'table' ? 'Table ' : 'Figure ') + x.n) >= 0));
        return { b64: btoa(bin), heads, sec: (m.cover.tables[0].rows.find((r) => r.Item === 'Section') || {}).Entry, lines: m.titleLines, header: m.headerText, other: /PRA-001 Uncontained|PRA-006 Bird/.test(text), acts: m.blocks.filter((x) => x.k === 'act').length, imgs: imgs.length, leadOk, n1: (bl.find((x) => x.k === 'table') || {}).n };
      });
      let docT = ''; try { const tmp = path.join(os.tmpdir(), 'pra_tab_' + process.pid + '.docx'); fs.writeFileSync(tmp, Buffer.from(T10.b64, 'base64')); docT = cp.execFileSync('unzip', ['-p', tmp, 'word/document.xml'], { maxBuffer: 64 * 1024 * 1024 }).toString().replace(/<[^>]+>/g, ' '); fs.unlinkSync(tmp); } catch (e) { docT = 'unzip failed: ' + e.message; }
      check('T9 "Export this risk to Word" writes that risk alone: its cover names the section, one heading for the risk, its tables and figures numbered from 1 and introduced first, no other risk, no page-only buttons', T10.heads[0] === '1. PRA-003 Tire burst' && T10.heads.length === 1 && /^PRA-003 Tire burst \(one section of the full document\)$/.test(T10.sec || '') && T10.lines.indexOf('PRA-003 Tire burst') >= 0 && /· PRA-003$/.test(T10.header) && !T10.other && T10.acts === 0 && T10.imgs >= 2 && T10.leadOk && T10.n1 === 1 && /Tire burst/.test(docT) && /Contents/.test(docT) && !/Uncontained engine rotor burst/.test(docT), JSON.stringify({ heads: T10.heads.slice(0, 3), sec: T10.sec, lines: T10.lines, header: T10.header, other: T10.other, n1: T10.n1, doc: docT.slice(0, 120) }));
      // the file the button hands over is caught where the page hands it to the browser (no reliance on download timing)
      await pg.evaluate(() => { window.__dl = []; const c0 = HTMLAnchorElement.prototype.click; window.__dlC0 = c0; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push({ name: this.download, blob: /^blob:/.test(this.href) }); return; } return c0.apply(this, arguments); }; });
      await pg.evaluate(() => document.querySelector('#ccr-host-pra [data-cc-wordsec]').click());
      // an export with changes waiting asks to confirm them first (change_ack.js, house rule for every Export button): confirm, as a person would
      const dl0 = Date.now(); let dlf = null, asked = false; for (let i = 0; i < 360 && !dlf; i++) { await tick(250); const st = await pg.evaluate(() => { const ok = document.querySelector('#sl-ack-overlay [data-ack="confirm"]'); if (ok) ok.click(); return { dl: window.__dl[0] || null, asked: !!ok }; }); dlf = st.dl; asked = asked || st.asked; } const dlMs = Date.now() - dl0;
      const dlMsg = await pg.evaluate(() => { HTMLAnchorElement.prototype.click = window.__dlC0; return JSON.stringify(SLCcaReport.get('pra').state.msg); });
      check('T10 the button hands over the risk\'s Word file, named for the risk', !!dlf && dlf.blob && /PRA-003\.docx$/.test(dlf.name), JSON.stringify(dlf) + ' ' + dlMsg + ' after ' + dlMs + ' ms; asked to confirm changes first: ' + asked);
      const T11 = await pg.evaluate(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms)), R = SLCcaReport.get('pra');
        const stored = projectConfig.ccaReports.pra.tab, json = JSON.parse(JSON.stringify(projectConfig)).ccaReports.pra.tab;
        switchTab('zsa'); await wait(500); switchTab('pra'); await wait(700);
        const back = R.tab(), on = (document.querySelector('#ccr-host-pra .ccr-tab.on') || {}).getAttribute('data-cctab');
        projectConfig.ccaReports.pra.tab = 'PRA-999'; R.render(); const stale = R.tab(), staleOn = (document.querySelector('#ccr-host-pra .ccr-tab.on') || {}).getAttribute('data-cctab');
        projectConfig.ccaReports.pra.tab = 'PRA-003'; R.render();
        return { stored, json, back, on, stale, staleOn, after: projectConfig.ccaReports.pra.tab };
      });
      check('T11 the tab picked is remembered in the project (projectConfig.ccaReports.pra.tab, kept in the saved project) and comes back when the PRA page is opened again; a tab whose risk is gone falls back to All risks', T11.stored === 'PRA-003' && T11.json === 'PRA-003' && T11.back === 'PRA-003' && T11.on === 'PRA-003' && T11.stale === null && T11.staleOn === '' && T11.after === 'PRA-003', JSON.stringify(T11));
      const T12 = await pg.evaluate(() => { const b = document.querySelector('#ccr-host-pra .ccr-tab.on'); b.focus(); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); const a1 = SLCcaReport.get('pra').tab(), f1 = document.activeElement && document.activeElement.getAttribute('data-cctab');
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); const a2 = SLCcaReport.get('pra').tab(); return { a1, f1, a2 }; });
      check('T12 the tabs work from the keyboard (arrow keys move to the next tab and keep focus, Home goes to All risks)', T12.a1 === 'PRA-004' && T12.f1 === 'PRA-004' && T12.a2 === null, JSON.stringify(T12));
      const wid = async (w, tabId) => {
        await pg.setViewportSize({ width: w, height: 900 }); await tick(400);
        return pg.evaluate(async ({ tabId, w }) => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms)); SLCcaReport.get('pra').setTab(tabId); await wait(300);
          const de = document.documentElement;
          // the app's own chrome is set apart: it keeps its desktop side menu at any width, and its top bar's menus already ran wider than a phone screen before the PRA page changed
          const shell = [...document.querySelectorAll('.nav-bar')]; const old = shell.map((e) => e.style.display), side = document.body.classList.contains('nav-sidebar'); shell.forEach((e) => { e.style.display = 'none'; }); document.body.classList.remove('nav-sidebar'); await wait(150);
          SLCcaReport.get('pra').render(); await wait(150);
          const bar = document.querySelector('#ccr-host-pra [data-cctabs]'), host = document.getElementById('ccr-host-pra'), on = bar.querySelector('.ccr-tab.on');
          const sw = de.scrollWidth, cw = de.clientWidth, br = bar.getBoundingClientRect(), hr = host.getBoundingClientRect(), onr = on.getBoundingClientRect();
          const rows = new Set([...bar.querySelectorAll('.ccr-tab')].map((t) => Math.round(t.getBoundingClientRect().top))).size;
          const r = { sw, cw, barRight: Math.round(br.right), hostRight: Math.round(hr.right), barScroll: bar.scrollWidth > bar.clientWidth + 1, rows, onVisible: onr.left >= br.left - 1 && onr.right <= br.right + 1, hostOver: host.scrollWidth > host.clientWidth + 1, wrap: getComputedStyle(bar).flexWrap };
          shell.forEach((e, i) => { e.style.display = old[i]; }); if (side) document.body.classList.add('nav-sidebar'); await wait(150);
          const full = { sw: de.scrollWidth, cw: de.clientWidth }; r.full = full;
          return r;
        }, { tabId, w });
      };
      const N1 = await wid(1440, null), N2 = await wid(1440, 'PRA-016'), P1w = await wid(390, null), P2w = await wid(390, 'PRA-016');
      await pg.setViewportSize({ width: 1500, height: 1100 }); await tick(300);
      check('T13 1440 px: no horizontal page scroll on All risks or a risk tab; the tabs wrap onto rows inside the page', N1.full.sw <= N1.full.cw && N2.full.sw <= N2.full.cw && N1.rows >= 2 && !N1.barScroll && N1.wrap === 'wrap' && N1.barRight <= 1440 && !N1.hostOver && !N2.hostOver, JSON.stringify({ N1, N2 }));
      check('T14 390 px (a phone): the PRA page adds no horizontal page scroll on All risks or a risk tab; the tabs are one row that scrolls on its own, with the open tab scrolled into view', P1w.sw <= P1w.cw && P2w.sw <= P2w.cw && P1w.cw === 390 && P1w.barRight <= 390 && P1w.hostRight <= 390 && !P1w.hostOver && !P2w.hostOver && P1w.rows === 1 && P1w.barScroll && P2w.onVisible && P2w.wrap === 'nowrap', JSON.stringify({ P1w, P2w }));
      // a window that narrows while a risk tab is open keeps the open tab in view (the row turns from wrapped to scrolling)
      await pg.evaluate(() => { document.body.classList.remove('nav-sidebar'); SLCcaReport.get('pra').setTab('PRA-016'); }); await tick(300);
      await pg.setViewportSize({ width: 390, height: 900 }); await tick(600);
      const T16 = await pg.evaluate(() => { const bar = document.querySelector('#ccr-host-pra [data-cctabs]'), on = bar.querySelector('.ccr-tab.on'), br = bar.getBoundingClientRect(), r = on.getBoundingClientRect(); return { scroll: bar.scrollLeft, vis: r.left >= br.left - 1 && r.right <= br.right + 1 }; });
      await pg.evaluate(() => document.body.classList.add('nav-sidebar')); await pg.setViewportSize({ width: 1500, height: 1100 }); await tick(300);
      check('T16 when the window narrows on a risk tab, the open tab stays in view in its scrolling row', T16.vis && T16.scroll > 0, JSON.stringify(T16));
      await pg.evaluate(() => SLCcaReport.get('pra').setTab(null)); await tick(400);

      console.log('\n[Q] answers light up what they wrote');
      const tireKey = await pg.evaluate(() => SLPraAuto.compute().risks.find((r) => r.kind === 'TIRE').key);
      await pg.click('#pra-auto-host [data-slap-rail="' + tireKey + '"]'); await tick(500);
      const Q0 = await pg.evaluate(() => { const pv = document.querySelector('#ccr-host-pra [data-ccdoc]'), s = pv.querySelector('[data-ccsec="PRA-003"]'); return { flashed: !!(s && s.classList.contains('ccr-flash')), tab: SLCcaReport.get('pra').tab(), secs: pv.querySelectorAll('[data-ccsec]').length, left: !!document.querySelector('#pra-auto-host [data-pra-tab="PRA-003"]') }; });
      check('Q1 opening a risk on the All risks overview opens its tab (PRA-003) with its section lit up and its questions on the left', Q0.flashed && Q0.tab === 'PRA-003' && Q0.secs === 1 && Q0.left, JSON.stringify(Q0));
      await pg.click('#pra-auto-host .slap-nav .slap-btn.p'); await tick(500);
      const qid = await pg.evaluate(() => document.querySelector('#pra-auto-host .slap-opt').getAttribute('data-slap-q'));
      await pg.click('#pra-auto-host .slap-opt >> nth=0'); await tick(600);
      const Q1 = await pg.evaluate((qid) => { const pv = document.querySelector('#ccr-host-pra [data-ccdoc]'), p = pv.querySelector('[data-ccq="' + CSS.escape(qid) + '"]'); return { lit: !!(p && p.classList.contains('ccr-flash')), text: p ? p.textContent : '', inView: p ? (p.offsetTop - pv.scrollTop) >= 0 && (p.offsetTop - pv.scrollTop) < pv.clientHeight : false }; }, qid);
      check('Q2 a click on an answer card writes the choice into the report and lights up that paragraph, in view', Q1.lit && /Chosen: /.test(Q1.text) && Q1.inView, JSON.stringify(Q1));
      await pg.evaluate(() => { const pv = document.querySelector('#ccr-host-pra [data-ccdoc]'); pv.scrollTop = 0; pv.querySelectorAll('.ccr-flash').forEach((e) => e.classList.remove('ccr-flash')); });
      await pg.click('#pra-auto-host [data-pra-see]'); await tick(300);
      const Q2 = await pg.evaluate((qid) => { const pv = document.querySelector('#ccr-host-pra [data-ccdoc]'), p = pv.querySelector('[data-ccq="' + CSS.escape(qid) + '"]'); return { lit: !!(p && p.classList.contains('ccr-flash')), top: pv.scrollTop }; }, qid);
      check('Q3 "See where it goes" scrolls to it and lights it up again', Q2.lit && Q2.top > 200, JSON.stringify(Q2));
      const Q3 = await pg.evaluate((qid) => { const row = praData.filter((r) => r.praId === 'PRA-003'); return { n: row.length, f: row[0] && (row[0].praFindings || []).some((f) => f.id === qid && f.pick) }; }, qid);
      check('Q4 ...and the PRA-003 record is written in place (one row, with the finding)', Q3.n === 1 && Q3.f, JSON.stringify(Q3));

      console.log('\n[F] the figures');
      await pg.click('#ccr-host-pra [data-cctab=""]'); await tick(500);
      await pg.evaluate(() => { const n = document.querySelector('#ccr-host-pra [data-ccnode="in:cad"]'); n.scrollIntoView({ block: 'center' }); });
      await pg.click('#ccr-host-pra [data-ccnode="in:cad"]'); await tick(300);
      const F1 = await pg.evaluate(() => { const p = document.querySelector('#ccr-host-pra [data-cc-node="in:cad"]'); return { panel: !!p, text: p ? p.textContent : '', open: !!(p && /Open the page/.test(p.textContent)), live0: !!document.querySelector('[data-cc-nodelive]') }; });
      check('F1 a box of the inputs and outputs figure opens its panel (where it comes from, a button to its page); no counts until asked', F1.panel && /CAD Model page/.test(F1.text) && F1.open && !F1.live0, JSON.stringify(F1).slice(0, 300));
      await pg.click('#ccr-host-pra [data-cc-live]'); await tick(300);
      const F2 = await pg.evaluate(() => { const l = document.querySelector('#ccr-host-pra [data-cc-nodelive]'); return { live: l ? l.textContent : '', inDoc: /\d+ parts, \d+ linked/.test(document.querySelector('#ccr-host-pra [data-ccdoc]').textContent) }; });
      check('F2 "Show where the program stands" shows live counts in the panel only, never in the report', /\d+ parts, \d+ linked to systems/.test(F2.live) && !F2.inDoc, JSON.stringify(F2));
      await pg.evaluate(() => { const n = document.querySelector('#ccr-host-pra [data-ccnode="out:pra.retention"]'); n.scrollIntoView({ block: 'center' }); });
      await pg.click('#ccr-host-pra [data-ccnode="out:pra.retention"]'); await tick(300);
      const F3 = await pg.evaluate(() => { const p = document.querySelector('#ccr-host-pra [data-cc-node="out:pra.retention"]'); return p ? p.textContent : ''; });
      check('F3 an output box shows who uses it, how it is accepted and where its acceptance stands', /Goes to the zonal safety analysis/.test(F3) && /Accepted when:/.test(F3) && /Acceptance:/.test(F3), F3.slice(0, 300));
      await pg.evaluate(() => { const n = document.querySelector('#ccr-host-pra [data-ccnode="fc:FC-28"]'); n.scrollIntoView({ block: 'center' }); });
      await pg.click('#ccr-host-pra [data-ccnode="fc:FC-28"]'); await tick(300);
      const F4 = await pg.evaluate(() => { const p = document.querySelector('#ccr-host-pra [data-cc-node="fc:FC-28"]'); return p ? p.textContent : ''; });
      check('F4 a box of a risk\'s "what it takes out" figure opens its panel (the failure condition, its severity, what retention needs)', /FC-28 Structural failure/.test(F4) && /Catastrophic/.test(F4) && /accepted zonal disposition/.test(F4), F4.slice(0, 300));
      const F5 = await pg.evaluate(() => document.querySelectorAll('#ccr-host-pra [data-ccdoc] [data-ccnode]').length);
      check('F5 the figures are clickable throughout (inputs and outputs, and every risk\'s losses)', F5 >= 60, F5);

      console.log('\n[O] outputs and acceptance');
      const O = await pg.evaluate(async () => {
        const R = SLCcaReport.get('pra'), st = (id) => R.acceptance().find((o) => o.id === id).state;
        const box = !!document.querySelector('#ccr-host-pra [data-cc-accept] [data-cc-out="pra.choices"]');
        document.querySelector('#ccr-host-pra [data-cc-acceptbtn="pra.choices"]').click(); await new Promise((r) => setTimeout(r, 100));
        const a1 = st('pra.choices'), rec = JSON.parse(JSON.stringify(projectConfig.ccaReports.pra.accept['pra.choices'] || null));
        const r = SLPraAuto.compute().risks.find((k) => k.questions.length && k.kind !== 'ROTOR'), q = r.questions[r.questions.length - 1];
        SLPraAuto.ui.pick(q.id, q.options[0].id); const a2 = st('pra.choices');
        const pill = /Reopened/.test(document.querySelector('#ccr-host-pra [data-cc-out="pra.choices"]').textContent);
        const docT = document.querySelector('#ccr-host-pra [data-ccdoc]').textContent, inDoc = /Reopened/.test(docT) || (!!rec && docT.indexOf('accepted by ' + rec.by) >= 0) || /\bopen, not yet accepted\b/.test(docT);
        R.unaccept('pra.choices');
        return { box, a1, a2, pill, inDoc, rec: !!(rec && rec.by && rec.at && rec.fp) };
      });
      check('O1 an output is accepted in Safety Lab with who, when and what it was', O.box && O.a1 === 'accepted' && O.rec, JSON.stringify(O));
      check('O2 a change behind it reopens it (and the report text never says so)', O.a2 === 'reopened' && O.pill && !O.inDoc, JSON.stringify(O));

      console.log('\n[W] Word');
      const W = await pg.evaluate(async () => {
        const R = SLCcaReport.get('pra'), m = R.model(), lib = await _loadDocxLib();
        const imgs = m.blocks.filter((x) => x.k === 'img' && x.svg); for (const x of imgs.slice(0, 6)) x.dataUrl = await SLFtaPrint.png({ svg: x.svg, w: x.w, h: x.h }, 1);
        const blob = await SLReportWriter.docx(m, lib), buf = new Uint8Array(await blob.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        const pv = document.querySelector('#ccr-host-pra [data-ccdoc]'), bl = R.doc();
        const text = m.blocks.map((x) => x.k === 'table' ? JSON.stringify(x.rows) : (x.text || x.caption || '')).join('\n');
        return { b64: btoa(bin), size: blob.size, cover: m.cover.tables.map((t) => t.title).join(','), acts: m.blocks.filter((x) => x.k === 'act').length, imgs: imgs.length, imgLight: imgs.every((x) => /fill="#ffffff"/.test(x.svg)),
          toc: pv.querySelectorAll('[data-cc-toc] [data-cc-goto^="h"]').length, heads: bl.filter((x) => x.k === 'h').length, lot: pv.querySelectorAll('[data-cc-lot]').length, tables: bl.filter((x) => x.k === 'table').length, lof: pv.querySelectorAll('[data-cc-lof]').length, figs: bl.filter((x) => x.k === 'fig' || x.k === 'shot').length,
          leadOk: bl.every((x, i) => !(x.k === 'table' || x.k === 'fig' || x.k === 'shot') || (bl[i - 1] && bl[i - 1].k === 'p' && bl[i - 1].text.indexOf((x.k === 'table' ? 'Table ' : 'Figure ') + x.n) >= 0)),
          counts: (text.match(/\b\d+ (units|questions|records|rows|sections|parts|zones|particular risks)\b|\banswered\b|\bsigned\b|\d+ of \d+/g) || []).slice(0, 5), roles: m.cover.tables[1].rows.map((r) => r.Holder).join('|') };
      });
      let docText = ''; try { const tmp = path.join(os.tmpdir(), 'pra_report_' + process.pid + '.docx'); fs.writeFileSync(tmp, Buffer.from(W.b64, 'base64')); docText = cp.execFileSync('unzip', ['-p', tmp, 'word/document.xml'], { maxBuffer: 64 * 1024 * 1024 }).toString().replace(/<[^>]+>/g, ' '); fs.unlinkSync(tmp); } catch (e) { docText = 'unzip failed: ' + e.message; }
      check('W1 the Word file: cover (document control, approvals by role, revision history), contents, list of tables, list of figures', W.size > 30000 && W.cover === 'Document control,Approvals,Revision history' && /Contents/.test(docText) && /List of Tables/.test(docText) && /List of Figures/.test(docText) && /Particular Risk Assessment/.test(docText) && /To be named \(by role\)/.test(W.roles), JSON.stringify({ size: W.size, cover: W.cover, roles: W.roles, doc: docText.slice(0, 200) }));
      check('W2 the preview carries the same front matter: every heading in the contents, every table and figure in its list, numbered in order, each introduced before it appears', W.toc === W.heads && W.lot === W.tables && W.lof === W.figs && W.figs >= 20 && W.tables >= 40 && W.leadOk, JSON.stringify(Object.assign({}, W, { b64: undefined })).slice(0, 600));
      check('W3 no counts or status in the document text; page-only buttons (Simulate, Scenarios) are left out; the figures are drawn light', !W.counts.length && W.acts === 0 && W.imgLight && !/Simulate this risk/.test(docText), JSON.stringify(W.counts));

      console.log('\n[D] dark mode');
      const D = await pg.evaluate(async () => {
        document.body.classList.add('theme-dark'); await new Promise((r) => setTimeout(r, 300));
        const pv = document.querySelector('#ccr-host-pra [data-ccdoc]'), cs = (el) => getComputedStyle(el);
        const p = pv.querySelector('[data-ccsec="PRA-003"] p'), th = pv.querySelector('.ccr-dt th'), td = pv.querySelector('.ccr-dt td'), h = pv.querySelector('h3'), svg = pv.querySelector('.ccr-fig svg rect');
        const out = { bg: cs(pv).backgroundColor, p: cs(p).color, th: cs(th).color, thBg: cs(th).backgroundColor, td: cs(td).color, tdBg: cs(td).backgroundColor, h: cs(h).color, fig: svg ? svg.getAttribute('fill') : '', word: /fill="#ffffff"/.test((SLCcaReport.get('pra').model().blocks.find((x) => x.k === 'img') || {}).svg || '') };
        document.body.classList.remove('theme-dark'); await new Promise((r) => setTimeout(r, 300));
        out.back = (document.querySelector('#ccr-host-pra [data-ccdoc] .ccr-fig svg rect') || {}).getAttribute('fill');
        document.body.classList.add('theme-dark'); SLCcaReport.get('pra').setTab('PRA-003'); await new Promise((r) => setTimeout(r, 300));
        const offT = document.querySelector('#ccr-host-pra .ccr-tab:not(.on):not(.all)'), onT = document.querySelector('#ccr-host-pra .ccr-tab.on'), pv2 = document.querySelector('#ccr-host-pra [data-ccdoc]'), hd = pv2.querySelector('[data-cc-tabhead]'), h2 = pv2.querySelector('h3');
        out.tab = { off: cs(offT).color, offBg: cs(offT).backgroundColor, on: cs(onT).color, onBg: cs(onT).backgroundColor, id: cs(offT.querySelector('.ccr-tabid')).color, pv: cs(pv2).backgroundColor, hd: cs(hd).color, h: cs(h2).color, fig: (pv2.querySelector('.ccr-fig svg rect') || {}).getAttribute('fill') };
        document.body.classList.remove('theme-dark'); await new Promise((r) => setTimeout(r, 300));
        const offL = document.querySelector('#ccr-host-pra .ccr-tab:not(.on)'), onL = document.querySelector('#ccr-host-pra .ccr-tab.on');
        out.tabL = { off: cs(offL).color, offBg: cs(offL).backgroundColor, on: cs(onL).color, onBg: cs(onL).backgroundColor };
        SLCcaReport.get('pra').setTab(null); await new Promise((r) => setTimeout(r, 200));
        return out;
      });
      const cP = contrast(D.p, D.bg), cTh = contrast(D.th, D.thBg), cTd = contrast(D.td, D.tdBg), cH = contrast(D.h, D.bg);
      check('D1 dark mode: a dark document with readable text, headings and table cells (contrast at least 4.5)', lum(D.bg) < 0.05 && cP >= 4.5 && cTh >= 4.5 && cTd >= 4.5 && cH >= 4.5, JSON.stringify({ D, cP, cTh, cTd, cH }));
      check('D2 the figures are drawn dark on the dark page, light in Word, and light again in light mode', D.fig === '#15181E' && D.word && D.back === '#ffffff', JSON.stringify(D));
      const tb = D.tab, tl = D.tabL;
      check('D3 dark mode: the tabs are dark with readable labels (open and not open, contrast at least 4.5), and a risk tab is a dark, readable document with dark figures; light mode tabs read too', lum(tb.offBg) < 0.05 && contrast(tb.off, tb.offBg) >= 4.5 && contrast(tb.id, tb.offBg) >= 4.5 && contrast(tb.on, tb.onBg) >= 4.5 && lum(tb.pv) < 0.05 && contrast(tb.hd, tb.pv) >= 4.5 && contrast(tb.h, tb.pv) >= 4.5 && tb.fig === '#15181E' && contrast(tl.off, tl.offBg) >= 4.5 && contrast(tl.on, tl.onBg) >= 4.5 && lum(tl.offBg) > 0.8, JSON.stringify({ tb, tl }));

      console.log('\n[E] Edit and Add');
      const n0 = await pg.evaluate(() => praData.length);
      await pg.evaluate(() => { const b = document.querySelector('#ccr-host-pra [data-cc-edit="PRA-002"]'); b.scrollIntoView({ block: 'center' }); });
      await pg.click('#ccr-host-pra [data-cc-edit="PRA-002"]'); await tick(300);
      const E0 = await pg.evaluate(() => { const f = document.querySelector('#ccr-host-pra [data-cc-form="PRA-002"]'); return f ? [...f.querySelectorAll('[data-ccf]')].map((e) => e.getAttribute('data-ccf')) : []; });
      check('E1 Edit opens the fields the table held (ID, threat, source, standard, zones, CSFL, mitigation, minimization, notes, assumptions)', ['praId', 'threat', 'desc', 'standard', 'affectedZones', 'csfl', 'mitigation', 'minimization', 'systems'].every((k) => E0.includes(k)), E0.join(','));
      await pg.fill('#ccr-host-pra [data-cc-form="PRA-002"] [data-ccf="mitigation"]', 'Debris deflectors on each intake; strip specification limits loose stones');
      await pg.click('#ccr-host-pra [data-cc-save="PRA-002"]'); await tick(400);
      const E1 = await pg.evaluate(() => ({ n: praData.length, rows: praData.filter((r) => r.praId === 'PRA-002').length, mit: praData.find((r) => r.praId === 'PRA-002').mitigation, inDoc: /Debris deflectors on each intake/.test(document.querySelector('#ccr-host-pra [data-ccsec="PRA-002"]').textContent), form: !!document.querySelector('#ccr-host-pra [data-cc-form]'), lit: document.querySelector('#ccr-host-pra [data-ccsec="PRA-002"]').classList.contains('ccr-flash') }));
      check('E2 saving writes the record in place (no new row) and the report shows it, lit up', E1.n === n0 && E1.rows === 1 && /Debris deflectors on each intake/.test(E1.mit) && E1.inDoc && !E1.form && E1.lit, JSON.stringify(E1));
      await pg.click('#ccr-host-pra [data-cc-add]'); await tick(300);
      const nid = await pg.evaluate(() => document.querySelector('#ccr-host-pra [data-cc-form="new"] [data-ccf="praId"]').value);
      await pg.fill('#ccr-host-pra [data-cc-form="new"] [data-ccf="threat"]', 'Ice shed from the wing onto the tail');
      await pg.fill('#ccr-host-pra [data-cc-form="new"] [data-ccf="desc"]', 'Ice that builds on the wing leading edge breaks off and strikes the tailplane.');
      await pg.check('#ccr-host-pra [data-cc-form="new"] [data-ccf="affectedZones"] input[value="Z-EMP"]');
      await pg.click('#ccr-host-pra [data-cc-save="new"]'); await tick(500);
      const E2 = await pg.evaluate((nid) => ({ n: praData.length, row: JSON.parse(JSON.stringify(praData.find((r) => r.praId === nid) || null)), sec: !!document.querySelector('#ccr-host-pra [data-ccsec="' + nid + '"]'), lit: (document.querySelector('#ccr-host-pra [data-ccsec="' + nid + '"]') || { classList: { contains: () => false } }).classList.contains('ccr-flash'),
        tab: SLCcaReport.get('pra').tab(), on: (document.querySelector('#ccr-host-pra .ccr-tab.on') || {}).textContent, last: ([...document.querySelectorAll('#ccr-host-pra .ccr-tab')].pop() || {}).getAttribute('data-cctab'), secs: document.querySelectorAll('#ccr-host-pra [data-ccdoc] [data-ccsec]').length, stored: projectConfig.ccaReports.pra.tab }), nid);
      check('E3 "Add a particular risk" writes one new record with the next ID, and its section appears, lit up', nid === 'PRA-020' && E2.n === n0 + 1 && E2.row && E2.row.threat === 'Ice shed from the wing onto the tail' && JSON.stringify(E2.row.affectedZones) === '["Z-EMP"]' && E2.sec && E2.lit, JSON.stringify(E2));
      check('T15 ...and opens the new risk\'s own tab, last in PRA ID order, labeled with its ID and name, holding only its section', E2.tab === 'PRA-020' && E2.on === 'PRA-020Ice shed from the wing onto the tail' && E2.last === 'PRA-020' && E2.secs === 1 && E2.stored === 'PRA-020', JSON.stringify(E2));
      await pg.click('#ccr-host-pra [data-cc-add]'); await tick(300);
      await pg.fill('#ccr-host-pra [data-cc-form="new"] [data-ccf="threat"]', 'ice shed from the wing onto the tail');
      await pg.click('#ccr-host-pra [data-cc-save="new"]'); await tick(300);
      const E3 = await pg.evaluate(() => ({ n: praData.length, err: (document.querySelector('#ccr-host-pra [data-cc-err]') || {}).textContent || '', open: !!document.querySelector('#ccr-host-pra [data-cc-form="new"]') }));
      if (!E3.open) { await pg.click('#ccr-host-pra [data-cc-add]'); await tick(300); }
      await pg.fill('#ccr-host-pra [data-cc-form="new"] [data-ccf="threat"]', 'A different threat');
      await pg.fill('#ccr-host-pra [data-cc-form="new"] [data-ccf="praId"]', 'PRA-003');
      await pg.click('#ccr-host-pra [data-cc-save="new"]'); await tick(300);
      const E4 = await pg.evaluate(() => ({ n: praData.length, err: (document.querySelector('#ccr-host-pra [data-cc-err]') || {}).textContent || '' }));
      check('E4 no duplicates: the same threat again, or an ID already in use, is refused in plain words and nothing is written', E3.n === n0 + 1 && /PRA-020 already covers/.test(E3.err) && E4.n === n0 + 1 && /PRA-003 is already a particular risk/.test(E4.err), JSON.stringify({ E3, E4 }));
      await pg.click('#ccr-host-pra [data-cc-form="new"] .slap-btn:not(.p)'); await tick(200);
      const E5 = await pg.evaluate(() => {
        const r = SLPraAuto.saveRisk('PRA-003', { praId: 'PRA-003', threat: 'Tire burst', desc: 'Our own words on the tire burst.', mitigation: 'Brake lines A and B run on opposite sides of the bay', affectedZones: ['Z-MLGW'], csfl: '', systems: '', standard: '' });
        const t = SLPraAuto.compute().risks.find((k) => k.kind === 'TIRE'), q = t.questions[0]; SLPraAuto.ui.pick(q.id, q.options[1].id);
        const row = praData.find((x) => x.praId === 'PRA-003');
        const sec = SLCcaReport.get('pra').doc().filter((x) => x.sec === 'PRA-003').map((x) => x.text || '').join('\n');
        return { ok: r.ok, own: !!row.praOwn, mit: row.mitigation, desc: row.desc, rows: praData.filter((x) => x.praId === 'PRA-003').length, sec: /Our own words on the tire burst/.test(sec) && /\*\*Mitigation\.\*\* Brake lines A and B run on opposite sides/.test(sec) };
      });
      check('E5 an Edit on a record the Autopilot writes is kept and survives its next answer (still one row)', E5.ok && E5.own && /^Brake lines A and B run on opposite sides/.test(E5.mit) && /^Our own words on the tire burst/.test(E5.desc) && E5.rows === 1 && E5.sec, JSON.stringify(E5).slice(0, 400));
      const P1 = await pg.evaluate(() => { window.__opened = []; SLPraAuto.report(); return window.__opened.map((h) => h.length + ':' + /Particular Risk Assessment/.test(h) + ':' + /Simulate this risk/.test(h)); });
      check('P1 the printable report is the same document, without the page-only buttons', P1.length === 1 && /:true:false$/.test(P1[0]), JSON.stringify(P1));
      console.log('\n[K] the frame with its own question cards (the way a ZSA or CMA builder can use it)');
      const K = await pg.evaluate(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const v = document.createElement('div'); v.id = 'view-ccrtest'; v.style.display = 'none'; v.innerHTML = '<div class="header-with-export"><h3>Test analysis</h3></div>'; document.querySelector('#view-pra').parentNode.appendChild(v);
        const data = { answers: {}, rows: [{ id: 'S1', name: 'First subject', note: '' }] }, seen = [];
        const R = SLCcaReport.define({ key: 'ccrtest', viewId: 'view-ccrtest', title: 'Test Analysis', code: 'TST', sectionsTitle: 'The subjects',
          questions: () => [{ id: 'q1', sec: 'S1', text: 'Is it protected?', intro: 'One plain question.', options: [{ id: 'y', label: 'Yes', means: 'It is shielded.', changes: 'Writes the shield.' }, { id: 'n', label: 'No', means: 'Nothing protects it.', changes: 'Leaves it open.' }], picked: data.answers.q1 || null },
            { id: 'q2', sec: 'S1', depth: 1, text: 'Which shield?', options: [{ id: 'a', label: 'Kevlar' }, { id: 'b', label: 'Steel' }], picked: data.answers.q2 || null }],
          answer: (q, o) => { data.answers[q] = o; seen.push(q + '=' + o); },
          sections: (ctx) => data.rows.map((r) => ({ id: r.id, title: r.id + ' ' + r.name, blocks: [{ k: 'p', text: data.answers.q1 ? 'Protected: ' + data.answers.q1 + '.' : 'Not decided yet: is it protected?', q: 'q1' }, { k: 'part', text: 'Notes' }, { k: 'p', text: r.note || 'None.' }, { k: 'table', name: 't-' + r.id, title: 'Facts about ' + r.id, rows: [{ Fact: 'Name', Value: r.name }], lead: '{N} lists the facts.' }] })),
          edit: { addLabel: 'Add a subject', fields: (id) => { const r = data.rows.find((x) => x.id === id) || { id: '', name: '', note: '' }; return [{ key: 'id', label: 'ID', type: 'text', value: r.id }, { key: 'name', label: 'Name', type: 'text', value: r.name }, { key: 'tags', label: 'Tags', type: 'checks', value: [], options: [['a', 'A'], ['b', 'B']] }]; },
            save: (id, vals) => { if (!vals.name) return { ok: false, err: 'Name it.' }; if (!id && data.rows.some((x) => x.id === vals.id)) return { ok: false, err: vals.id + ' is already there.' }; let r = data.rows.find((x) => x.id === id); if (!r) { r = { id: vals.id }; data.rows.push(r); } r.name = vals.name; r.note = (vals.tags || []).join(','); return { ok: true, id: r.id }; } },
          io: { does: 'Checks the subjects', inputs: [{ id: 'a', what: 'Input A', from: 'page A', tab: 'pra' }], outputs: [{ id: 'o1', what: 'Output one', to: 'page B', tab: 'pra', accept: 'When it is right', role: 'Chief engineer', fp: () => JSON.stringify(data.answers) }] } });
        switchTab('pra'); v.style.display = ''; await wait(300);
        const host = document.getElementById('ccr-host-ccrtest');
        const cards = host.querySelectorAll('.ccr-opt').length, sub = host.querySelector('[data-ccqbox="q2"]').style.marginLeft, aligned = getComputedStyle(host.querySelector('.ccr-opt')).justifyContent;
        host.querySelector('[data-ccopt="q1|y"]').click(); await wait(100);
        const p = host.querySelector('[data-ccdoc] [data-ccq="q1"]');
        const r1 = { seen: seen.join(','), lit: !!(p && p.classList.contains('ccr-flash')), text: p && p.textContent, on: host.querySelector('[data-ccopt="q1|y"]').classList.contains('on') };
        host.querySelector('[data-cc-edit="S1"]').click(); await wait(50);
        host.querySelector('[data-cc-form="S1"] [data-ccf="name"]').value = 'Renamed'; host.querySelector('[data-cc-form="S1"] [data-ccchecks] input[value="b"]').checked = true;
        host.querySelector('[data-cc-save="S1"]').click(); await wait(50);
        host.querySelector('[data-cc-add]').click(); await wait(50);
        host.querySelector('[data-cc-form="new"] [data-ccf="id"]').value = 'S1'; host.querySelector('[data-cc-form="new"] [data-ccf="name"]').value = 'Again';
        host.querySelector('[data-cc-save="new"]').click(); await wait(50);
        const err = (host.querySelector('[data-cc-err]') || {}).textContent || '';
        const acc0 = R.acceptance()[0].state; R.accept('o1'); const acc1 = R.acceptance()[0].state; data.answers.q2 = 'a'; const acc2 = R.acceptance()[0].state;
        const blocks = R.doc(), m = R.model();
        v.remove();
        return { cards, sub, aligned, r1, renamed: data.rows[0].name, tags: data.rows[0].note, rows: data.rows.length, err, acc0, acc1, acc2, heads: blocks.filter((x) => x.k === 'h').map((x) => x.text).join('|'), cap: (blocks.find((x) => x.k === 'table' && x.name === 't-S1') || {}).caption, wordParts: m.blocks.filter((x) => x.k === 'p' && /^\*\*Notes\*\*$/.test(x.text)).length, store: !!(projectConfig.ccaReports && projectConfig.ccaReports.ccrtest && projectConfig.ccaReports.ccrtest.accept.o1) };
      });
      check('K1 the frame draws question cards (left aligned, what each means and changes, follow-ups indented) and a click answers, writes and lights up the paragraph', K.cards === 4 && K.sub === '26px' && K.aligned === 'flex-start' && K.r1.seen === 'q1=y' && K.r1.lit && /Protected: y/.test(K.r1.text) && K.r1.on, JSON.stringify(K));
      check('K2 its Edit reads text and tick fields and saves through the module; its Add refuses what the module refuses, in its words', K.renamed === 'Renamed' && K.tags === 'b' && K.rows === 1 && /S1 is already there/.test(K.err), JSON.stringify(K));
      check('K3 numbered headings and captions, Word bold small headings, accept and reopen kept in projectConfig.ccaReports[key]', /^1\. Inputs and outputs\|2\. The subjects\|2\.1 S1 Renamed\|3\. Outputs and acceptance$/.test(K.heads) && /^Table \d+: Facts about S1$/.test(K.cap) && K.wordParts === 1 && K.acc0 === 'open' && K.acc1 === 'accepted' && K.acc2 === 'reopened' && K.store, JSON.stringify(K));
      console.log('\n[Z] the ZSA link opens the risk tab');
      await pg.evaluate(() => { SLCcaReport.get('pra').setTab(null); switchTab('zsa'); }); await tick(1500);
      const Z0 = await pg.evaluate(() => { const b = [...document.querySelectorAll('#ccr-host-zsa [data-ccdoc] [data-cc-act]')].find((x) => /^Open PRA-\d+ in the PRA report$/.test(x.textContent)); if (!b) return null; b.scrollIntoView({ block: 'center' }); return b.textContent.match(/PRA-\d+/)[0]; });
      if (Z0) { await pg.evaluate((id) => { [...document.querySelectorAll('#ccr-host-zsa [data-ccdoc] [data-cc-act]')].find((x) => x.textContent === 'Open ' + id + ' in the PRA report').click(); }, Z0); await tick(1500); }
      const Z1 = await pg.evaluate(() => { const pv = document.querySelector('#ccr-host-pra [data-ccdoc]'); return { shown: !!document.getElementById('view-pra') && document.getElementById('view-pra').style.display !== 'none', tab: SLCcaReport.get('pra').tab(), on: (document.querySelector('#ccr-host-pra .ccr-tab.on') || {}).getAttribute('data-cctab'), secs: pv ? [...pv.querySelectorAll('[data-ccsec]')].map((e) => e.getAttribute('data-ccsec')) : [], lit: !!(pv && pv.querySelector('[data-ccsec].ccr-flash')) }; });
      check('Z1 the ZSA report\'s "Open PRA-xxx in the PRA report" opens the PRA page on that risk\'s tab, its section lit up', !!Z0 && Z1.shown && Z1.tab === Z0 && Z1.on === Z0 && JSON.stringify(Z1.secs) === JSON.stringify([Z0]) && Z1.lit, JSON.stringify({ Z0, Z1 }));
      const Z2 = await pg.evaluate(() => { SLCcaReport.get('pra').setTab(null); const ok = SLCcaReport.get('pra').flash('sec:PRA-011'); return { ok, tab: SLCcaReport.get('pra').tab() }; });
      check('Z2 any link that opens a PRA section (flash \'sec:<id>\') opens its tab', Z2.ok && Z2.tab === 'PRA-011', JSON.stringify(Z2));

      console.log('\n[K4] the tabs are generic (a test analysis with the frame\'s own question cards)');
      const K4 = await pg.evaluate(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const v = document.createElement('div'); v.id = 'view-ccrtabs'; v.style.display = 'none'; v.innerHTML = '<div class="header-with-export"><h3>Tabs test</h3></div>'; document.querySelector('#view-pra').parentNode.appendChild(v);
        const ans = {}, rows = [{ id: 'Z-A', name: 'Zone A' }, { id: 'Z-B', name: 'Zone B' }];
        const qs = () => rows.map((r) => ({ id: 'q-' + r.id, sec: r.id, text: 'Is ' + r.name + ' drained?', options: [{ id: 'y', label: 'Yes' }, { id: 'n', label: 'No' }], picked: ans['q-' + r.id] || null }));
        const R = SLCcaReport.define({ key: 'ccrtabs', viewId: 'view-ccrtabs', title: 'Tabs Test', code: 'TT', sectionsTitle: 'The zones', tabs: { allLabel: 'All zones', noun: 'zone' }, questions: qs, answer: (q, o) => { ans[q] = o; },
          sections: () => rows.map((r) => ({ id: r.id, title: r.id + ' ' + r.name, tabLabel: { id: r.id, name: r.name }, blocks: [{ k: 'p', text: ans['q-' + r.id] ? 'Drained: ' + ans['q-' + r.id] + '.' : 'Not decided yet: drained?', q: 'q-' + r.id }] })),
          edit: { addLabel: 'Add a zone', fields: () => [{ key: 'id', label: 'ID', type: 'text', value: '' }, { key: 'name', label: 'Name', type: 'text', value: '' }], save: (id, vals) => { if (!id) { rows.push({ id: vals.id, name: vals.name }); return { ok: true, id: vals.id }; } return { ok: true, id }; } } });
        v.style.display = ''; await wait(300);
        const host = document.getElementById('ccr-host-ccrtabs'), labels = [...host.querySelectorAll('.ccr-tab')].map((t) => t.textContent);
        const allQ = host.querySelectorAll('[data-ccqbox]').length;
        host.querySelector('[data-cctab="Z-B"]').click(); await wait(100);
        const bQ = [...host.querySelectorAll('[data-ccqbox]')].map((e) => e.getAttribute('data-ccqbox')), bSec = [...host.querySelectorAll('[data-ccdoc] [data-ccsec]')].map((e) => e.getAttribute('data-ccsec'));
        host.querySelector('[data-ccopt="q-Z-B|y"]').click(); await wait(100);
        const lit = !!host.querySelector('[data-ccdoc] [data-ccq="q-Z-B"].ccr-flash'), still = R.tab();
        host.querySelector('[data-cc-add]').click(); await wait(50);
        host.querySelector('[data-cc-form="new"] [data-ccf="id"]').value = 'Z-C'; host.querySelector('[data-cc-form="new"] [data-ccf="name"]').value = 'Zone C';
        host.querySelector('[data-cc-save="new"]').click(); await wait(100);
        const added = R.tab(), cQ = host.querySelectorAll('[data-ccqbox]').length, noun = (host.querySelector('[data-cc-wordsec]') || {}).textContent;
        const zsaTabs = document.querySelectorAll('#ccr-host-zsa [data-cctabs], #ccr-host-cma [data-cctabs]').length;
        v.remove();
        return { labels, allQ, bQ, bSec, lit, still, added, cQ, noun, zsaTabs, store: projectConfig.ccaReports.ccrtabs && projectConfig.ccaReports.ccrtabs.tab };
      });
      check('K4 the tabs are the frame\'s, for any analysis: labels from tabLabel, the frame\'s own questions filtered to the open section, an answer lights up in its tab, Add opens the new tab, the noun names the export; the ZSA and CMA pages keep no tabs', JSON.stringify(K4.labels) === '["All zones","Z-AZone A","Z-BZone B"]' && K4.allQ === 2 && JSON.stringify(K4.bQ) === '["q-Z-B"]' && JSON.stringify(K4.bSec) === '["Z-B"]' && K4.lit && K4.still === 'Z-B' && K4.added === 'Z-C' && K4.cQ === 1 && K4.noun === 'Export this zone to Word' && K4.zsaTabs === 0 && K4.store === 'Z-C', JSON.stringify(K4));
      check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } finally { await b.close(); srv.close(); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (mutation: ' + MUT + ')' : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
