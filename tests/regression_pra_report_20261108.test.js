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
  noflash:  ['cca_report.js', 'ui0.flash = qid || null; ui0.msg = null; render();', 'ui0.flash = null; ui0.msg = null; render();'],
  noreopen: ['cca_report.js', "var st = !r ? 'open' : (r.fp === fp ? 'accepted' : 'reopened');", "var st = !r ? 'open' : 'accepted';"],
  counts:   ['pra_autopilot.js', "the analysis asks what it reaches and whether the aircraft can still fly and land safely.' },", "the analysis asks what it reaches and whether the aircraft can still fly and land safely. ' + _arr(_g('praData')).length + ' particular risks are recorded.' },"],
  noequip:  ['pra_autopilot.js', 'function equipmentOf(code) {', 'function equipmentOf(code) { return [];'],
  nofn:     ['pra_autopilot.js', 'function functionsOf(codes) {', 'function functionsOf(codes) { return [];'],
  darkleak: ['cca_report.js', 'C = dark ? DARK : LIGHT;', 'C = LIGHT;'],
  table:    ['index.html', '<div id="pra-legacy-ui" hidden style="display:none">', '<div id="pra-legacy-ui">'],
  nonames:  ['pra_autopilot.js', "function fcLabel(fcId) { var f = _fc(fcId); return f && f.fcDesc ? fcId + ' ' + f.fcDesc : fcId; }", 'function fcLabel(fcId) { return fcId; }'],
  // v1.5 / v2.4 (9 Nov 2026): every risk its own report, one dropdown, a register
  notabs:     ['pra_autopilot.js', "tabs: { allLabel: 'All risks (register)', noun: 'risk', nounTitle: 'Particular risk', pickLabel: 'Particular risk', registerTitle: 'Particular risk reports' },", ''],
  nodrop:     ['cca_report.js', "'<select id=\"ccr-sel-'", "'<span id=\"ccr-sel-'"],
  noreg:      ['cca_report.js', "+ rows.map(function (x) { return '<tr data-cc-regrow=", "+ [].map(function (x) { return '<tr data-cc-regrow="],
  shareddoc:  ['cca_report.js', "            if (REP) {\n                d = s0.docs[REP];", "            if (false) {\n                d = s0.docs[REP];"],
  sharedacc:  ['cca_report.js', "var s = store(); if (!REP) return s.accept;", "var s = store(); return s.accept;"],
  tabq:       ['pra_autopilot.js', "var L = tab ? res.risks.filter(function (r) { return secOf(r) === tab; })", "var L = tab ? res.risks"],
  noaddtab:   ['cca_report.js', "{ var rn = repOfSection(nid); setTab(rn ? rn.id : nid, { render: false }); }", "{ }"],
  noswitch:   ['cca_report.js', "if (rs0 && tab() !== rs0.id) {", "if (false) {"],
  noremember: ['cca_report.js', "var s = store(); if (id) s.tab = id; else delete s.tab;", "var s = store(); delete s.tab;"],
  wordrep:    ['cca_report.js', "var blR = doc({ forExport: true, report: REP });", "var blR = doc({ forExport: true });"]
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
  check('S7 the frame documents its tabs at the top (spec.tabs, tabLabel, the per-section question filter, tab() and setTab(), model({ only }))', /tabs\s+optional \(v1\.2\)/.test(CR.slice(0, 16000)) && ['tabLabel', 'filter(question, sectionId)', 'renderQuestions(R, sectionId)', 'setTab(id)', "{ only: sectionId }"].every((k) => CR.slice(0, 16000).indexOf(k) >= 0)   /* 10 Nov 2026: the header documents more (aiReady, comments) */);

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
        R.setTab(null); const secIds = [...document.querySelectorAll('#ccr-host-pra [data-cc-regrow]')].map((e) => e.getAttribute('data-cc-regrow'));
        const per = {};
        rows.forEach((r) => { const s = bl.filter((x) => x.sec === r.praId); per[r.praId] = { parts: s.filter((x) => x.k === 'part').map((x) => x.text), text: s.map((x) => x.k === 'table' ? x.caption + ' ' + JSON.stringify(x.rows) : (x.text || x.caption || x.label || '')).join('\n'), acts: s.filter((x) => x.k === 'act').map((x) => x.label), tables: s.filter((x) => x.k === 'table').map((x) => ({ name: x.name, rows: x.rows })) }; });
        const tbl = document.getElementById('pra-table');
        return { ms: Math.round(ms), shown: !!host && !!pv && host.offsetParent !== null, left: !!document.querySelector('#ccr-host-pra #pra-auto-host [data-pra-auto]'), tableVisible: !!(tbl && tbl.offsetParent), formVisible: !!(document.getElementById('pra-id') && document.getElementById('pra-id').offsetParent), models: !!document.getElementById('pra-models-host'),
          rows: rows.map((r) => r.praId), secIds, per, all: bl.map((x) => x.k === 'table' ? JSON.stringify(x.rows) : (x.text || '')).join('\n') };
      });
      check('A1 the PRA table, its form and the threat models panel are gone from the page; the Autopilot is on the left and the report on the right', A.shown && A.left && !A.tableVisible && !A.formVisible && !A.models, JSON.stringify({ shown: A.shown, left: A.left, t: A.tableVisible, f: A.formVisible, m: A.models }));
      check('A2 one report per particular risk (every PRA record, in order, none twice, in the register)', A.rows.length >= 15 && JSON.stringify(A.secIds) === JSON.stringify(A.rows.slice().sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))), A.secIds.join(',') + ' vs ' + A.rows.join(','));
      // 9 Nov 2026 (pra_autopilot 2.3, the whole story): the risk and its question, method, basis, calculations, the results, the choices, retention, the conclusion
      const parts7 = ['1. The risk and the question it answers', '2. Method', '3. Basis', '4. Calculations', '5. Results: what it reaches', '5.1 Zones it reaches', '5.2 Equipment in those zones', '5.3 Functions that equipment performs', '6. Results: what is lost', '7. The choices made', '8. Retention of catastrophic outcomes', '9. Summary of results', '10. Proposed mitigations', '11. Path to compliance', '12. Conclusion'];
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

      console.log('\n[T] every particular risk its own report, picked from one dropdown (9 Nov 2026)');
      const T1 = await pg.evaluate(() => {
        const h = document.getElementById('ccr-host-pra'), sel = h.querySelector('[data-cctabsel]'), opts = sel ? [...sel.options] : [];
        const ids = praData.filter((r) => r && r.praId).map((r) => r.praId).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
        const names = praData.filter((r) => r && r.praId).reduce((m, r) => (m[r.praId] = r.threat, m), {});
        const rows = [...h.querySelectorAll('[data-cc-regrow]')].map((r) => ({ id: r.getAttribute('data-cc-regrow'), no: r.children[0].textContent, open: !!r.querySelector('[data-cc-open]') }));
        return { sel: !!sel, tabRow: h.querySelectorAll('.ccr-tab').length, first: opts[0] && opts[0].text, firstVal: opts[0] && opts[0].value, vals: opts.slice(1).map((o) => o.value), labels: opts.slice(1).map((o) => o.text), ids, names, rows, cur: SLCcaReport.get('pra').tab(),
          cover: !!h.querySelector('[data-ccdoc] [data-cc-cover]'), wordAll: !!h.querySelector('[data-cc-wordall]'), word: !!h.querySelector('[data-cc-word]'), print: !!h.querySelector('[data-cc-print]'), docctl: !!h.querySelector('[data-cc-docctl]') };
      });
      check('T1 one dropdown, no row of tabs: "All risks (register)" first and picked, then every particular risk in PRA ID order', T1.sel && T1.tabRow === 0 && T1.first === 'All risks (register)' && T1.firstVal === '' && T1.cur === null && T1.ids.length >= 19 && JSON.stringify(T1.vals) === JSON.stringify(T1.ids), JSON.stringify({ first: T1.first, vals: T1.vals.slice(0, 4), tabRow: T1.tabRow }));
      check('T2 each choice reads the PRA ID and its full name (PRA-001 Uncontained engine rotor burst)', T1.labels[0] === 'PRA-001 Uncontained engine rotor burst' && T1.ids.every((id, i) => T1.labels[i] === id + ' ' + T1.names[id]), T1.labels.slice(0, 3).join(' | '));
      check('T3 All risks is a register, not one document: a row per risk with its own document number (HL1-PRA-001 ...) and an Open button; "Export every report to Word"; no cover, no single Word or Print', JSON.stringify(T1.rows.map((r) => r.id)) === JSON.stringify(T1.ids) && T1.rows.every((r) => /-PRA-\d{3}$/.test(r.no) && r.open) && T1.rows[2].no.slice(-7) === 'PRA-003' && T1.wordAll && !T1.word && !T1.print && !T1.cover && !T1.docctl, JSON.stringify(T1.rows.slice(0, 3)));
      await pg.selectOption('#ccr-host-pra [data-cctabsel]', 'PRA-003'); await tick(800);
      const T4 = await pg.evaluate(() => {
        const h = document.getElementById('ccr-host-pra'), pv = h.querySelector('[data-ccdoc]'), left = h.querySelector('#pra-auto-host'), cov = pv.querySelector('[data-cc-cover]');
        const others = SLPraAuto.compute().risks.filter((r) => SLPraAuto.secOf(r) !== 'PRA-003');
        const qboxes = [...left.querySelectorAll('[data-slap-q]')].map((e) => e.getAttribute('data-slap-q'));
        return { cover: cov ? cov.textContent : '', toc: !!pv.querySelector('[data-cc-toc]'), lot: pv.querySelectorAll('[data-cc-lot]').length, lof: pv.querySelectorAll('[data-cc-lof]').length, io: /Inputs and outputs/.test(pv.textContent), oa: /Outputs and acceptance/.test(pv.textContent),
          secs: [...pv.querySelectorAll('[data-ccsec]')].map((e) => e.getAttribute('data-ccsec')), word: !!h.querySelector('[data-cc-word]'), print: !!h.querySelector('[data-cc-print]'), docctl: !!h.querySelector('[data-cc-docctl]'), accept: !!h.querySelector('[data-cc-accept]'), add: !!h.querySelector('[data-cc-add]'),
          otherQ: qboxes.some((q) => others.some((r) => q.indexOf(r.key) === 0)) || /rotor burst/i.test(left.textContent), qN: qboxes.length, tire: /Tire burst/.test(left.textContent), sel: h.querySelector('[data-cctabsel]').value, figN: (pv.querySelector('.ccr-cap[data-cc-a^="f"]') || pv.querySelector('[data-cc-lof] a') || { textContent: '' }).textContent };
      });
      check('T4 picking PRA-003 opens its own report: a cover naming "PRA-003 Tire burst" with its own document number, contents, lists of tables and figures, inputs and outputs, only its section, outputs and acceptance', /PRA-003 Tire burst/.test(T4.cover) && /-PRA-003/.test(T4.cover) && !/-PRA-001/.test(T4.cover) && T4.toc && T4.lot > 0 && T4.lof > 0 && T4.io && T4.oa && JSON.stringify(T4.secs) === '["PRA-003"]', JSON.stringify(Object.assign({}, T4, { cover: T4.cover.slice(0, 200) })));
      check('T5 ...with its own Word and Print, its own document control and outputs to accept on the left, Add still there, and its figures numbered from 1', T4.word && T4.print && T4.docctl && T4.accept && T4.add && /^Figure 1: /.test(T4.figN), JSON.stringify({ word: T4.word, print: T4.print, docctl: T4.docctl, accept: T4.accept, fig: T4.figN }));
      check('T6 ...and only the tire burst on the left (no other risk named, no other risk\'s question)', T4.sel === 'PRA-003' && T4.tire && !T4.otherQ, JSON.stringify({ qN: T4.qN, otherQ: T4.otherQ }));
      const T7 = await pg.evaluate(() => {
        const R = SLCcaReport.get('pra');
        R.setDoc('status', 'In review'); const i1 = R.issue('First issue for review'); const d3 = R.docCtl(), r3 = R.rev();
        const d1 = R.withRep('PRA-001', () => ({ no: R.docCtl().no, st: R.docCtl().status, rev: R.rev() }));
        const out = R.acceptance()[0]; R.accept(out.id); const a3 = R.acceptance()[0].state, a1 = R.withRep('PRA-001', () => R.acceptance()[0].state);
        const m3 = R.model({ report: 'PRA-003' }), m1 = R.model({ report: 'PRA-001' });
        return { no3: d3.no, st3: d3.status, r3, i1: i1.rev, d1, a3, a1, t3: m3.titleLines.join(' | '), t1: m1.titleLines.join(' | '), h3: m3.headerText, secs3: m3.blocks.filter((b) => b.k === 'h' && b.level === 1).map((b) => b.text), store: Object.keys(projectConfig.ccaReports.pra.docs || {}).length };
      });
      check('T7 each report keeps its own document control: PRA-003 issued (revision A, in review) leaves PRA-001 a draft with its own number', /-PRA-003$/.test(T7.no3) && T7.st3 === 'In review' && T7.r3 === 'A' && /-PRA-001$/.test(T7.d1.no) && T7.d1.st === 'Draft' && T7.d1.rev === 'Draft', JSON.stringify(T7));
      check('T8 ...and its own acceptance: an output accepted on PRA-003 is still open on PRA-001', T7.a3 === 'accepted' && T7.a1 === 'open', JSON.stringify({ a3: T7.a3, a1: T7.a1 }));
      check('T9 the Word file of a report is that report alone: its title names the risk and its own number and revision, one level-1 heading for the risk among the front, inputs and outputs, and acceptance', /PRA-003 Tire burst/.test(T7.t3) && /-PRA-003 · Revision A · In review/.test(T7.t3) && /-PRA-001 · Revision Draft/.test(T7.t1) && T7.secs3.some((t) => /PRA-003 Tire burst/.test(t)) && !T7.secs3.some((t) => /PRA-001/.test(t)), JSON.stringify({ t3: T7.t3, t1: T7.t1, secs3: T7.secs3 }));
      const dlf = await pg.evaluate(async () => { const a0 = HTMLAnchorElement.prototype.click; let name = null; HTMLAnchorElement.prototype.click = function () { name = this.download; }; try { const b = await SLCcaReport.get('pra').word({ report: 'PRA-003' }); return { name, blob: !!b && b.size > 20000 }; } finally { HTMLAnchorElement.prototype.click = a0; } });
      check('T10 the Word button hands over that report\'s own file, named for its document number', !!dlf && dlf.blob && /^[A-Z0-9]+-PRA-003_Rev_A_/.test(dlf.name || ''), JSON.stringify(dlf));
      const T11 = await pg.evaluate(async () => { switchTab('dashboard'); await new Promise((r) => setTimeout(r, 200)); switchTab('pra'); await new Promise((r) => setTimeout(r, 900)); return { stored: projectConfig.ccaReports.pra.tab, cur: SLCcaReport.get('pra').tab(), sel: document.querySelector('#ccr-host-pra [data-cctabsel]').value }; });
      check('T11 the report picked is remembered in the project and comes back when the PRA page opens again', T11.stored === 'PRA-003' && T11.cur === 'PRA-003' && T11.sel === 'PRA-003', JSON.stringify(T11));
      const T12 = await pg.evaluate(async () => { SLCcaReport.get('pra').setTab(null); await new Promise((r) => setTimeout(r, 300)); const b = document.querySelector('#ccr-host-pra [data-cc-open="PRA-005"]'); if (b) b.click(); await new Promise((r) => setTimeout(r, 400)); return { btn: !!b, cur: SLCcaReport.get('pra').tab(), secs: [...document.querySelectorAll('#ccr-host-pra [data-ccdoc] [data-ccsec]')].map((e) => e.getAttribute('data-ccsec')) }; });
      check('T12 Open on a register row opens that risk\'s report', T12.btn && T12.cur === 'PRA-005' && JSON.stringify(T12.secs) === '["PRA-005"]', JSON.stringify(T12));
      const T13 = await pg.evaluate(() => { const L = SLCcaReport.get('pra').reports(); return { n: L.length, ids: praData.filter((r) => r && r.praId).length, all: typeof SLCcaReport.get('pra').wordAll === 'function', btn: true }; });
      check('T13 "Export every report to Word" writes one file per report (one report per particular risk)', T13.all && T13.n === T13.ids, JSON.stringify(T13));
      await pg.setViewportSize({ width: 390, height: 900 }); await pg.evaluate(() => { document.body.classList.remove('nav-sidebar'); }); await tick(500);
      const T14 = await pg.evaluate(() => { const v = document.getElementById('view-pra'), sel = document.querySelector('#ccr-host-pra [data-cctabsel]'); const r = sel.getBoundingClientRect(), vr = v.getBoundingClientRect(); return { sw: v.scrollWidth, cw: v.clientWidth, selRight: Math.round(r.right), viewRight: Math.round(vr.right) }; });
      await pg.setViewportSize({ width: 1500, height: 1100 }); await pg.evaluate(() => document.body.classList.add('nav-sidebar')); await tick(300);
      check('T14 390 px (a phone): the dropdown fits the page and adds no horizontal scroll', T14.selRight <= T14.viewRight + 1, JSON.stringify(T14));
      const T16 = await pg.evaluate(async () => { document.body.classList.add('theme-dark'); SLCcaReport.get('pra').render(); await new Promise((r) => setTimeout(r, 200)); const sel = document.querySelector('#ccr-host-pra [data-cctabsel]'), cs = getComputedStyle(sel); const out = { fg: cs.color, bg: cs.backgroundColor }; document.body.classList.remove('theme-dark'); SLCcaReport.get('pra').render(); return out; });
      check('T16 dark mode: the dropdown reads (contrast at least 4.5)', contrast(T16.fg, T16.bg) >= 4.5, JSON.stringify(T16));
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
      await pg.selectOption('#ccr-host-pra [data-cctabsel]', 'PRA-003'); await tick(600);
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
      check('F5 the figures of the open report are clickable throughout (inputs and outputs, and its losses)', F5 >= 8, F5);

      console.log('\n[O] outputs and acceptance');
      const O = await pg.evaluate(async () => {
        const R = SLCcaReport.get('pra'), st = (id) => R.acceptance().find((o) => o.id === id).state;
        const box = !!document.querySelector('#ccr-host-pra [data-cc-accept] [data-cc-out="pra.choices"]');
        document.querySelector('#ccr-host-pra [data-cc-acceptbtn="pra.choices"]').click(); await new Promise((r) => setTimeout(r, 100));
        const a1 = st('pra.choices'), rec = JSON.parse(JSON.stringify(((projectConfig.ccaReports.pra.accepts || {})[R.tab()] || {})['pra.choices'] || null));
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
        const R = SLCcaReport.get('pra'); R.setTab('PRA-003'); await new Promise((r) => setTimeout(r, 400)); const m = R.model({ report: 'PRA-003' }), lib = await _loadDocxLib();
        const imgs = m.blocks.filter((x) => x.k === 'img' && x.svg); for (const x of imgs.slice(0, 6)) x.dataUrl = await SLFtaPrint.png({ svg: x.svg, w: x.w, h: x.h }, 1);
        const blob = await SLReportWriter.docx(m, lib), buf = new Uint8Array(await blob.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        const pv = document.querySelector('#ccr-host-pra [data-ccdoc]'), bl = R.doc({ report: 'PRA-003' });
        const text = m.blocks.map((x) => x.k === 'table' ? JSON.stringify(x.rows) : (x.text || x.caption || '')).join('\n');
        return { b64: btoa(bin), size: blob.size, cover: m.cover.tables.map((t) => t.title).join(','), acts: m.blocks.filter((x) => x.k === 'act').length, imgs: imgs.length, imgLight: imgs.every((x) => /fill="#ffffff"/.test(x.svg)),
          toc: pv.querySelectorAll('[data-cc-toc] [data-cc-goto^="h"]').length, heads: bl.filter((x) => x.k === 'h').length, lot: pv.querySelectorAll('[data-cc-lot]').length, tables: bl.filter((x) => x.k === 'table').length, lof: pv.querySelectorAll('[data-cc-lof]').length, figs: bl.filter((x) => x.k === 'fig' || x.k === 'shot').length,
          leadOk: bl.every((x, i) => !(x.k === 'table' || x.k === 'fig' || x.k === 'shot') || (bl[i - 1] && bl[i - 1].k === 'p' && bl[i - 1].text.indexOf((x.k === 'table' ? 'Table ' : 'Figure ') + x.n) >= 0)),
          counts: (text.match(/\b\d+ (units|questions|records|rows|sections|parts|zones|particular risks)\b|\banswered\b|\bsigned\b|\d+ of \d+/g) || []).slice(0, 5), roles: m.cover.tables[1].rows.map((r) => r.Holder).join('|') };
      });
      let docText = ''; try { const tmp = path.join(os.tmpdir(), 'pra_report_' + process.pid + '.docx'); fs.writeFileSync(tmp, Buffer.from(W.b64, 'base64')); docText = cp.execFileSync('unzip', ['-p', tmp, 'word/document.xml'], { maxBuffer: 64 * 1024 * 1024 }).toString().replace(/<[^>]+>/g, ' '); fs.unlinkSync(tmp); } catch (e) { docText = 'unzip failed: ' + e.message; }
      check('W1 the Word file: cover (document control, approvals by role, revision history), contents, list of tables, list of figures', W.size > 30000 && W.cover === 'Document control,Approvals,Revision history' && /Contents/.test(docText) && /List of Tables/.test(docText) && /List of Figures/.test(docText) && /Particular Risk Assessment/.test(docText) && /To be named \(by role\)/.test(W.roles), JSON.stringify({ size: W.size, cover: W.cover, roles: W.roles, doc: docText.slice(0, 200) }));
      check('W2 the preview carries the same front matter: every heading in the contents, every table and figure in its list, numbered in order, each introduced before it appears', W.toc === W.heads && W.lot === W.tables && W.lof === W.figs && W.figs >= 3 && W.tables >= 8 && W.leadOk, JSON.stringify(Object.assign({}, W, { b64: undefined })).slice(0, 600));
      check('W3 no counts or status in the document text; page-only buttons (Simulate, Scenarios) are left out; the figures are drawn light', !W.counts.length && W.acts === 0 && W.imgLight && !/Simulate this risk/.test(docText), JSON.stringify(W.counts));

      console.log('\n[D] dark mode');
      const D = await pg.evaluate(async () => {
        const R = SLCcaReport.get('pra'); R.setTab('PRA-003'); await new Promise((r) => setTimeout(r, 300));
        document.body.classList.add('theme-dark'); R.render(); await new Promise((r) => setTimeout(r, 300));
        const pv = document.querySelector('#ccr-host-pra [data-ccdoc]'), cs = (el) => getComputedStyle(el);
        const p = pv.querySelector('[data-ccsec="PRA-003"] p'), th = pv.querySelector('.ccr-dt th'), td = pv.querySelector('.ccr-dt td'), h = pv.querySelector('h3'), svg = pv.querySelector('.ccr-fig svg rect'), sel = document.querySelector('#ccr-host-pra [data-cctabsel]'), ct = pv.querySelector('.ccr-ct2');
        const out = { bg: cs(pv).backgroundColor, p: cs(p).color, th: cs(th).color, thBg: cs(th).backgroundColor, td: cs(td).color, tdBg: cs(td).backgroundColor, h: cs(h).color, fig: svg ? svg.getAttribute('fill') : '', word: /fill="#ffffff"/.test((R.model({ report: 'PRA-003' }).blocks.find((x) => x.k === 'img' && x.svg) || {}).svg || ''),
          sel: cs(sel).color, selBg: cs(sel).backgroundColor, ct: ct ? cs(ct).color : '' };
        document.body.classList.remove('theme-dark'); R.render(); await new Promise((r) => setTimeout(r, 300));
        out.back = (document.querySelector('#ccr-host-pra [data-ccdoc] .ccr-fig svg rect') || {}).getAttribute('fill');
        const sel2 = document.querySelector('#ccr-host-pra [data-cctabsel]'); out.selL = cs(sel2).color; out.selLBg = cs(sel2).backgroundColor;
        R.setTab(null); await new Promise((r) => setTimeout(r, 200));
        return out;
      });
      const cP = contrast(D.p, D.bg), cTh = contrast(D.th, D.thBg), cTd = contrast(D.td, D.tdBg), cH = contrast(D.h, D.bg);
      check('D1 dark mode: a dark document with readable text, headings and table cells (contrast at least 4.5)', lum(D.bg) < 0.05 && cP >= 4.5 && cTh >= 4.5 && cTd >= 4.5 && cH >= 4.5, JSON.stringify({ D, cP, cTh, cTd, cH }));
      check('D2 the figures are drawn dark on the dark page, light in Word, and light again in light mode', D.fig === '#15181E' && D.word && D.back === '#ffffff', JSON.stringify(D));
      check('D3 the dropdown reads in both themes, and the report\'s own title on its cover reads on the dark page (contrast at least 4.5)', contrast(D.sel, D.selBg) >= 4.5 && contrast(D.selL, D.selLBg) >= 4.5 && contrast(D.ct, D.bg) >= 4.5, JSON.stringify(D));

      console.log('\n[E] Edit and Add');
      const n0 = await pg.evaluate(() => praData.length);
      await pg.evaluate(() => SLCcaReport.get('pra').setTab('PRA-002')); await tick(500);
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
        tab: SLCcaReport.get('pra').tab(), on: (function () { const sl = document.querySelector('#ccr-host-pra [data-cctabsel]'); return sl && sl.selectedOptions[0] ? sl.selectedOptions[0].text : ''; })(), last: ([...document.querySelectorAll('#ccr-host-pra [data-cctabsel] option')].pop() || {}).value, secs: document.querySelectorAll('#ccr-host-pra [data-ccdoc] [data-ccsec]').length, stored: projectConfig.ccaReports.pra.tab }), nid);
      check('E3 "Add a particular risk" writes one new record with the next ID, and its section appears, lit up', nid === 'PRA-020' && E2.n === n0 + 1 && E2.row && E2.row.threat === 'Ice shed from the wing onto the tail' && JSON.stringify(E2.row.affectedZones) === '["Z-EMP"]' && E2.sec && E2.lit, JSON.stringify(E2));
      check('T15 ...and opens the new risk\'s own report, last in PRA ID order in the dropdown, labeled with its ID and name, holding only its section', E2.tab === 'PRA-020' && E2.on === 'PRA-020 Ice shed from the wing onto the tail' && E2.last === 'PRA-020' && E2.secs === 1 && E2.stored === 'PRA-020', JSON.stringify(E2));
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
      await pg.evaluate(() => SLCcaReport.get('zsa').setTab('Z-MLGW')); await tick(800);
      const Z0 = await pg.evaluate(() => { const b = [...document.querySelectorAll('#ccr-host-zsa [data-ccdoc] [data-cc-act]')].find((x) => /^Open PRA-\d+ in the PRA report$/.test(x.textContent)); if (!b) return null; b.scrollIntoView({ block: 'center' }); return b.textContent.match(/PRA-\d+/)[0]; });
      if (Z0) { await pg.evaluate((id) => { [...document.querySelectorAll('#ccr-host-zsa [data-ccdoc] [data-cc-act]')].find((x) => x.textContent === 'Open ' + id + ' in the PRA report').click(); }, Z0); await tick(1500); }
      const Z1 = await pg.evaluate(() => { const pv = document.querySelector('#ccr-host-pra [data-ccdoc]'); return { shown: !!document.getElementById('view-pra') && document.getElementById('view-pra').style.display !== 'none', tab: SLCcaReport.get('pra').tab(), on: (document.querySelector('#ccr-host-pra [data-cctabsel]') || {}).value, secs: pv ? [...pv.querySelectorAll('[data-ccsec]')].map((e) => e.getAttribute('data-ccsec')) : [], lit: !!(pv && pv.querySelector('[data-ccsec].ccr-flash')) }; });
      check('Z1 the ZSA report\'s "Open PRA-xxx in the PRA report" opens the PRA page on that risk\'s own report, its section lit up', !!Z0 && Z1.shown && Z1.tab === Z0 && Z1.on === Z0 && JSON.stringify(Z1.secs) === JSON.stringify([Z0]) && Z1.lit, JSON.stringify({ Z0, Z1 }));
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
        const host = document.getElementById('ccr-host-ccrtabs'), labels = [...host.querySelectorAll('[data-cctabsel] option')].map((t) => t.text);
        const allQ = host.querySelectorAll('[data-ccqbox]').length;
        R.act('tab', 'Z-B'); await wait(100);
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
      check('K4 the reports are the frame\'s, for any analysis: dropdown labels from tabLabel, the frame\'s own questions filtered to the open report, an answer lights up in it, Add opens the new report, which has its own Word export', JSON.stringify(K4.labels) === '["All zones","Z-A Zone A","Z-B Zone B"]' && K4.allQ === 2 && JSON.stringify(K4.bQ) === '["q-Z-B"]' && JSON.stringify(K4.bSec) === '["Z-B"]' && K4.lit && K4.still === 'Z-B' && K4.added === 'Z-C' && K4.cQ === 1 && /Word/.test(K4.noun || '') && K4.store === 'Z-C', JSON.stringify(K4));
      check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } finally { await b.close(); srv.close(); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (mutation: ' + MUT + ')' : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
