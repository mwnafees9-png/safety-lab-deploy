#!/usr/bin/env node
/*
 * Regression (8 Nov 2026): the ZSA report content and the ZSA Autopilot's questions to the Plan Autopilot standard
 * (site/zsa_autopilot.js v1.4, site/cca_models.js v1.05) on the shared report frame (site/cca_report.js), on the Aeolus
 * HL-1 demo with its CAD model.
 *
 * Waqas, 8 Nov 2026: "I want the PRA table gone, and each PRA presented in a report format listing out all the stuff
 * that is impacted, all equipment in the zone, all functions that equipment performs"; "PRA build and ZSA similar to the
 * planing autopilot, ability to see the reports etc."; confirmed: the ZSA table goes too, with an inline Edit per report
 * section and an "Add" button so no data entry is lost. Phase 1 (this suite): the content as pure data, the questions,
 * the edit and add writers, and the one switch that retires the table once the shared report frame is wired.
 * Pinned:
 *   [A]  versions and pins; one named switch, off by default; the "Zone models" panel obeys it; no eval; no dashes.
 *   [S]  one section per zone (every zone of the CAD model and every zone record the model does not have).
 *   [E]  what is in the zone: every unit and every run of the zone listed by name, grouped by system; routing paths.
 *   [F]  the functions that equipment performs, each with its name and owning system.
 *   [L]  what one event in the zone loses: direct and knock-on systems, the minimum configuration rules that break, every
 *        failure condition that trips with its name and severity, the same as the aircraft model (fsEvaluate).
 *   [D]  each finding with the decision made, every paragraph an answer wrote tagged with that question's id.
 *   [U]  follow-ups: asked only under the answer they follow from, counted while they apply, written in the report.
 *   [R]  particular risks reaching the zone named and pointed to the PRA report; elicited and computed severity
 *        reconciled in words, the same verdict as INV-18's zsaZoneModel.
 *   [W]  plain words: every id with its name, no live counts or status words, no em dashes.
 *   [O]  inputs and outputs; outputs carry the questions behind them and reopen when one of those answers changes.
 *   [X]  editFields and saveZone: the table's fields, written to zsaData with every field its readers use, no
 *        duplicates; a severity set by an engineer is kept; a walkthrough finding row is never taken over.
 *   [Q]  the question cards: a short intro, each answer says what it means and what it changes, cards left aligned,
 *        a follow-up indented under its parent, Next waits for it.
 *   [T]  the switch: the table, its form and the "Zone models" panel hidden, the Autopilot and INV-18 still working.
 *   [G]  phase 2, the frame: the ZSA page is the Autopilot on the left and the report on the right; one preview section
 *        per zone; an answer lights up its paragraph; figure boxes open their panel (counts only there, on request);
 *        accept and reopen; Word with contents and lists of tables and figures and no counts; dark mode readable; Edit
 *        and "Add a zone" through the page without duplicates; a particular risk opens the PRA report at its section;
 *        "Open the CAD Model page" still works.
 * MUTATION PROOFS: SL_ZSAR_MUTATE=nofollow | dupadd | walkover | noq | statusleak | noname | noknock | switchoff |
 *   sevkeep | flat | nomeans | noframe | nolossfig. Each must turn this suite red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_zsa_report_20261108.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http'), os = require('os'), cp = require('child_process');
function lum(rgb) { const m = String(rgb).match(/\d+(\.\d+)?/g); if (!m) return 0; const c = m.slice(0, 3).map((v) => { v = +v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 900) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_ZSAR_MUTATE || '';
const MUTS = {
  nofollow:   ['zsa_autopilot.js', "return o ? _arr(q.followups).filter(function (f) { return f.when.indexOf(o.id) >= 0; }) : [];", 'return [];'],
  dupadd:     ['zsa_autopilot.js', "if (dup) return { ok: false, err: 'Zone ' + dup.zoneId + ' already has its record. Edit that one instead.', existing: dup.internalId };", ''],
  walkover:   ['zsa_autopilot.js', "return r && r.zoneId === code && !r.zsaCheckpoint; }) || null; }", 'return r && r.zoneId === code; }) || null; }'],
  noq:        ['zsa_autopilot.js', "B.push(q ? { type: 'p', text: _clean(t), q: q } : { type: 'p', text: _clean(t) });", "B.push({ type: 'p', text: _clean(t) });"],
  statusleak: ['zsa_autopilot.js', "H('Findings and the decision made for each');", "H('Findings and the decision made for each'); P(act.filter(function (q) { return optionOf(q); }).length + ' of ' + act.length + ' answered');"],
  noname:     ['zsa_autopilot.js', "function _fcLabel(fcId) { var n = _fcName(fcId); return n ? fcId + ' ' + n : fcId; }", 'function _fcLabel(fcId) { return fcId; }'],
  noknock:    ['zsa_autopilot.js', "if (knock.length) {", 'if (false) {'],
  switchoff:  ['cca_models.js', "if (window.SLZsaAuto && window.SLZsaAuto.TABLE_RETIRED) { const old = document.getElementById('zsa-models-host'); if (old) old.innerHTML = ''; return; }", ''],
  sevkeep:    ['zsa_autopilot.js', "if (row.severityBy !== 'engineer') row.severity", 'row.severity'],
  flat:       ['zsa_autopilot.js', "'<div class=\"zsq-q' + (depth ? ' sub' : '')", "'<div class=\"zsq-q' + ''"],
  nomeans:    ['zsa_autopilot.js', "+ (op.means ? '<span class=\"zsq-om\">' + E(op.means) + '</span>' : '')", ''],
  noframe:    ['zsa_autopilot.js', "if (!root.SLCcaReport || typeof document === 'undefined') return false;", 'return false;'],
  nolossfig:  ['zsa_autopilot.js', "var lf = _lossFigure(sec, C0); if (lf) out.push(lf);", '']
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) { let s = fs.readFileSync(path.join(SITE, name), 'utf8'); const m = MUTS[MUT]; if (m && m[0] === name) { if (s.indexOf(m[1]) < 0) throw new Error('mutation site missing: ' + m[1]); s = s.split(m[1]).join(m[2]); } return s; }
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));

(async function main() {
  console.log('regression_zsa_report_20261108' + (MUT ? ' [mutation ' + MUT + ']' : ''));
  console.log('\n[A] versions, the switch, the source');
  const ZS = src('zsa_autopilot.js'), CM = src('cca_models.js'), IDX = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  check('A1 zsa_autopilot.js is v1.4 or later in its header, its VERSION and its pin (all three the same), after cca_report.js', (function () { var m = /SLZsaAuto v(1\.\d+)/.exec(ZS); return !!m && parseFloat(m[1]) >= 1.4 && ZS.indexOf("var VERSION = '" + m[1] + "'") >= 0 && IDX.indexOf('zsa_autopilot.js?v=' + m[1] + '"') >= 0; })() && IDX.indexOf('cca_report.js?v=') > 0 && IDX.indexOf('cca_report.js?v=') < IDX.indexOf('zsa_autopilot.js?v='));
  check('A2 cca_models.js is v1.05 in its header and its pin', /cca_models\.js \u2014 v1\.05/.test(CM) && /cca_models\.js\?v=1\.05"/.test(IDX));
  check('A3 one named switch, TABLE_RETIRED, on now that the report frame is wired', (ZS.match(/var TABLE_RETIRED = (true|false);/g) || []).length === 1 && /var TABLE_RETIRED = true;/.test(ZS));
  check('A4 the "Zone models" panel obeys the switch; zsaZoneModel stays exported for INV-18', /window\.SLZsaAuto && window\.SLZsaAuto\.TABLE_RETIRED/.test(CM) && /window\.zsaZoneModel = zsaZoneModel/.test(CM));
  check('A5 no eval of any kind (the production CSP forbids it), and no em or en dash anywhere in the module', !/new Function|\beval\(/.test(ZS) && !/[—–]/.test(ZS));
  {
    const ctx = { console, Math, JSON, Object, Array, String, Number, Date, setInterval: () => 0, clearInterval() {} };
    ctx.window = ctx; vm.createContext(ctx); ctx.projectConfig = {};
    vm.runInContext(src('autopilot_ui.js'), ctx); vm.runInContext(ZS, ctx);
    const A = ctx.SLZsaAuto;
    check('A6 the module exports the report content, its inputs and outputs, and the edit and add writers', ['reportSections', 'reportIO', 'reportOutputs', 'editFields', 'saveZone', 'applyTableSwitch', 'activeQuestions'].every((k) => typeof A[k] === 'function'));
    check('A7 with no CAD model and no zone record there is no section, and loading wrote nothing', A.reportSections().length === 0 && !('zsaAuto' in ctx.projectConfig));
  }

  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) { console.log('  SKIP  Playwright is not installed: the real app part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
  const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.step': 'application/step' };
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
    let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
    const name = path.relative(SITE, f); if (MUTS[MUT] && MUTS[MUT][0] === name) b = Buffer.from(src(name));
    const ext = path.extname(f);
    r.writeHead(200, Object.assign({ 'Content-Type': TYPES[ext] || 'application/octet-stream' }, ext === '.html' ? { 'Content-Security-Policy': "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:" } : {})); r.end(b); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await pw.chromium.launch();
  const errs = [];
  try {
    const pg = await (await browser.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
    pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); pg.on('dialog', (d) => d.dismiss().catch(() => {}));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(4000);
    await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
    await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
    for (let i = 0; i < 60 && !(await pg.evaluate(() => typeof window.loadHL1Demo === 'function')); i++) await tick(500);
    await pg.evaluate(() => window.loadHL1Demo());
    for (let i = 0; i < 60 && !(await pg.evaluate(() => !!(window.SLZsaAuto && SLZsaAuto.compute()))); i++) await tick(500);
    await tick(1500);

    // text of a section, and of every section (the report words, not the question ids)
    await pg.evaluate(() => {
      window.__txt = (s) => s.blocks.map((b) => b.type === 'p' || b.type === 'h' ? b.text : b.type === 'table' ? [b.title].concat(b.columns, [].concat(...b.rows)).join('\n') : b.type === 'list' ? b.items.map((i) => i.text).join('\n') : b.type === 'figure' ? b.title : '').join('\n');
      window.__tbl = (s, suffix) => s.blocks.find((b) => b.type === 'table' && b.id.endsWith('-' + suffix));
    });

    console.log('\n[S] one section per zone');
    const S = await pg.evaluate(() => { const t0 = performance.now(); SLZsaAuto.reset(); const secs = SLZsaAuto.reportSections(); const ms = performance.now() - t0; const res = SLZsaAuto.compute(); const want = [...new Set(res.zones.map((z) => z.code).concat(zsaData.filter((r) => r.zoneId && !r.zsaCheckpoint).map((r) => r.zoneId)))].sort(); return { ms, codes: secs.map((s) => s.code).sort(), want, ids: secs.map((s) => s.id), titles: secs.map((s) => s.title), inModel: secs.filter((s) => s.inModel).length, cad: res.zones.length, same: SLZsaAuto.reportSections() === secs }; });
    check('S1 every zone has its own section: the 25 of the CAD model (including the two wings with no record yet)', JSON.stringify(S.codes) === JSON.stringify(S.want) && S.codes.length === 25 && S.inModel === 25 && S.codes.includes('Z-LWING'), JSON.stringify(S));
    check('S2 each section has a unique anchor and a title that is the zone code with its name', new Set(S.ids).size === S.ids.length && S.titles.every((t) => /^Z-[A-Z0-9-]+ [A-Z]/.test(t)), JSON.stringify(S.titles.slice(0, 5)));
    check('S3 built once per change (memoized), in reasonable time', S.same && S.ms < 6000, S.ms + ' ms');

    console.log('\n[E] what is in the zone');
    const E1 = await pg.evaluate(() => { const res = SLZsaAuto.compute(), secs = SLZsaAuto.reportSections(); const miss = []; let units = 0, runs = 0;
      res.zones.forEach((z) => { const s = secs.find((x) => x.code === z.code), eq = __tbl(s, 'equip'), rn = __tbl(s, 'runs');
        z.units.forEach((u) => { units++; const cl = (t) => String(t).replace(/\s*[\u2014\u2013]\s*/g, ', '); if (!eq || !eq.rows.some((r) => r[1] === cl(u.name) && r[0] === cl(u.sysName || 'Not linked to a system'))) miss.push(z.code + ': ' + u.name); });
        z.runs.forEach((r) => { runs++; if (!rn || !rn.rows.some((x) => x[1] === r.run)) miss.push(z.code + ' run ' + r.run); }); });
      const m = secs.find((x) => x.code === 'Z-MLGW'), rt = __tbl(m, 'routing'), fig = m.blocks.find((b) => b.type === 'figure');
      return { miss, units, runs, cols: __tbl(m, 'equip').columns, rt: rt && rt.rows, fig: !!(fig && /^<svg/.test(fig.svg) && fig.title) };
    });
    check('E1 every unit the CAD model places in a zone is listed by name under its system (all zones)', E1.miss.length === 0 && E1.units > 250, E1.miss.slice(0, 6).join('; ') + ' of ' + E1.units);
    check('GE2 every harness, tube and duct run through a zone is listed', E1.runs > 50 && !E1.miss.some((x) => / run /.test(x)), E1.runs);
    check('E3 the equipment table reads System, Equipment, Designator, What it is', JSON.stringify(E1.cols) === JSON.stringify(['System', 'Equipment', 'Designator', 'What it is']));
    check('E4 the routing record\'s paths through the zone, with the equipment and functions they carry, by name', E1.rt && E1.rt.some((r) => /^RT-001 Brake hydraulic lines/.test(r[0]) && /LRU-LDG-02 Brake control unit A/.test(r[1]) && /SF-06 Decelerate on the ground/.test(r[2])), JSON.stringify(E1.rt));
    check('E5 each zone section carries its picture from the CAD model as a figure with a title', E1.fig);

    console.log('\n[F] the functions that equipment performs');
    const F1 = await pg.evaluate(() => { const secs = SLZsaAuto.reportSections(), m = secs.find((x) => x.code === 'Z-MLGW'), f = __tbl(m, 'functions'), sf = __tbl(m, 'sysfunctions');
      const allFn = secs.map((s) => __tbl(s, 'functions')).filter(Boolean); return { rows: f && f.rows, cols: f && f.columns, sf: sf && sf.rows, named: allFn.every((t) => t.rows.every((r) => /^SF-\d+ \S/.test(r[0]) && r[1])), n: allFn.length }; });
    check('F1 a zone\'s functions are listed with the function name and the owning system (SF-12 by the main bogie, Landing Gear & Braking)', F1.rows && F1.rows.some((r) => /^SF-12 Extend, retract and lock the landing gear$/.test(r[0]) && r[1] === 'Landing Gear & Braking' && /Main bogie assembly/.test(r[2])), JSON.stringify(F1.rows));
    check('F2 every function in every zone carries its name and an owner or says none is recorded', F1.named && F1.n >= 15, F1.n);
    check('F3 equipment not on the items list shows the functions of its system, by name', F1.sf && F1.sf.some((r) => r[0] === 'Wheel well overheat detection' && r[1] === 'Fire Protection' && /SF-23 Detect and suppress fire/.test(r[2])), JSON.stringify(F1.sf && F1.sf.slice(0, 3)));

    console.log('\n[L] what one event in the zone loses');
    const L1 = await pg.evaluate(() => { const secs = SLZsaAuto.reportSections(), bad = [];
      secs.forEach((s) => { const ev = fsEvaluate(['zone:' + s.code]), fc = __tbl(s, 'fcs'), mac = __tbl(s, 'mac');
        ev.trippedFcs.forEach((t) => { const row = fc && fc.rows.find((r) => r[0].indexOf(t.fcId + ' ') === 0); if (!row || row[1] !== t.severity) bad.push(s.code + ' ' + t.fcId); });
        if ((ev.breaches.length ? 1 : 0) !== (mac ? 1 : 0) || (mac && mac.rows.length !== ev.breaches.length)) bad.push(s.code + ' mac'); });
      const c = secs.find((x) => x.code === 'Z-CWB'), tx = __txt(c);
      return { bad, direct: /lost directly: Fuel System and Hydraulic Power System\./.test(tx), knock: /As a knock-on, these systems stop because they depend on what is lost: Propulsion \(4 × turbofan\), through Fuel System and Fuel feed/.test(tx), fc14: __tbl(c, 'fcs').rows.some((r) => r[0] === 'FC-14 Loss of fuel delivery to all engines' && r[1] === 'Catastrophic'), mac: __tbl(c, 'mac').rows[0], cadAlso: /The CAD model also places equipment of/.test(__txt(secs.find((x) => x.code === 'Z-MLGW'))) };
    });
    check('L1 the systems one event loses directly, named', L1.direct);
    check('L2 the knock-on systems, named with what they depend on', L1.knock);
    check('L3 every failure condition the aircraft model trips for the zone is listed with its name and severity (all zones)', L1.bad.length === 0 && L1.fc14, L1.bad.join('; '));
    check('L4 each broken minimum configuration rule says the function, the phases, what it needs, what is left and what it leads to', L1.mac && /^SF-11 Deliver fuel to four engines$/.test(L1.mac[0]) && L1.mac[1] === 'All flight phases' && /at least 1 of Fuel System/.test(L1.mac[2]) && L1.mac[3] === 'None of them' && /FC-14 Loss of fuel delivery to all engines \(Catastrophic\)/.test(L1.mac[4]), JSON.stringify(L1.mac));
    check('L5 equipment the CAD model places in the zone that the aircraft model does not count is said plainly', L1.cadAlso);

    console.log('\n[D] each finding with its decision');
    const D1 = await pg.evaluate(() => { const z = SLZsaAuto.compute().byCode['Z-MLGW']; const leak = z.questions.find((q) => q.rule === 'LEAK'); SLZsaAuto.answer(leak.id, 'shield');
      const secs = SLZsaAuto.reportSections(), bad = [];
      secs.forEach((s) => { s.qids.forEach((id) => { const n = s.blocks.filter((b) => b.type === 'p' && b.q === id).length; if (n !== 1) bad.push(s.code + ' ' + id + ' x' + n); }); });
      const m = secs.find((x) => x.code === 'Z-MLGW'), lp = m.blocks.find((b) => b.q === leak.id), other = m.blocks.find((b) => b.q && b.q !== leak.id);
      return { bad, lp: lp && lp.text, other: other && other.text, nq: secs.reduce((n, s) => n + s.qids.length, 0) };
    });
    check('D1 every question of every zone writes exactly one paragraph, tagged with its id so the frame can light it up', D1.bad.length === 0 && D1.nq > 60, D1.bad.slice(0, 5).join('; '));
    check('D2 an answered finding says the decision, what it means and what it records', /^Leak onto equipment: Could a hydraulic leak/.test(D1.lp || '') && /Decision: Yes, so a drip shield goes over it\. A shield over the unit catches/.test(D1.lp) && /Recorded in the zone record as: Drip shield over Wheel speed sensors/.test(D1.lp), D1.lp);
    check('D3 an open question reads "To be decided", never a status', /To be decided\.$/.test(D1.other || ''), D1.other);

    console.log('\n[U] follow-ups');
    const U1 = await pg.evaluate(() => { const res = SLZsaAuto.compute(); let z = null, q = null; res.zones.some((zz) => { q = zz.questions.find((x) => x.rule === 'LEAK' && x.followups && x.followups.length); if (q) z = zz; return !!q; });
      const f = q.followups[0], before = SLZsaAuto.activeQuestions(z).length, refused = SLZsaAuto.answer(f.id, 'qualified') === false;
      SLZsaAuto.answer(q.id, 'sealed'); const on = SLZsaAuto.activeQuestions(z).map((x) => x.id), st1 = SLZsaAuto.zoneStatus(z);
      SLZsaAuto.answer(f.id, 'planned'); const st2 = SLZsaAuto.zoneStatus(z); const sec = SLZsaAuto.reportSections().find((s) => s.code === z.code); const fp = sec.blocks.find((b) => b.q === f.id);
      const row = zsaData.find((r) => r.zoneId === z.code && !r.zsaCheckpoint), rowF = row.zsaFindings.some((x) => x.id === f.id && x.parent === q.id);
      SLZsaAuto.answer(q.id, 'shield'); const off = SLZsaAuto.activeQuestions(z).some((x) => x.id === f.id), sec2 = SLZsaAuto.reportSections().find((s) => s.code === z.code);
      return { zone: z.code, before, refused, onIdx: on.indexOf(f.id) - on.indexOf(q.id), st1, st2, fp: fp && fp.text, rowF, off, gone: !sec2.blocks.some((b) => b.q === f.id), intro: !!f.intro && f.options.every((o) => o.means && o.impact && o.status) };
    });
    check('U1 a follow-up cannot be answered before its parent carries the answer it follows from', U1.refused, JSON.stringify(U1));
    check('U2 once "the unit is sealed" is picked, its proof question follows right after it and counts', U1.onIdx === 1 && U1.st1.questions === U1.before + 1 && U1.st1.state === 'todo', JSON.stringify(U1));
    check('U3 "the test is still to come" keeps the finding open', U1.st2.open >= 1 && U1.st2.state !== 'ready' && U1.st2.state !== 'done', JSON.stringify(U1.st2));
    check('U4 the follow-up writes its own tagged paragraph and is kept in the zone row\'s findings under its parent', /^Proof behind that decision: What shows that/.test(U1.fp || '') && /Answer: Its fluid test is still to come\./.test(U1.fp) && U1.rowF, U1.fp);
    check('U5 when the parent answer changes, the follow-up stops counting and leaves the report', U1.off === false && U1.gone);
    check('U6 the follow-up has its intro, and each of its answers says what it means and what it changes', U1.intro);

    console.log('\n[R] particular risks and the reconcile');
    const R1 = await pg.evaluate(() => { const secs = SLZsaAuto.reportSections(), miss = [];
      praData.forEach((p) => (p.affectedZones || []).forEach((zc) => { const s = secs.find((x) => x.code === zc); if (!s) return; const li = s.blocks.filter((b) => b.type === 'list').flatMap((b) => b.items); if (!li.some((i) => i.ref && i.ref.report === 'pra' && i.ref.praId === p.praId && i.text.indexOf(p.praId + ' ' + p.threat) === 0)) miss.push(zc + ' ' + p.praId); }));
      const m = secs.find((x) => x.code === 'Z-MLGW'), tire = m.blocks.filter((b) => b.type === 'list').flatMap((b) => b.items).find((i) => i.ref && i.ref.praId === 'PRA-003');
      const disagree = []; secs.forEach((s) => { const row = zsaData.find((r) => r.zoneId === s.code && !r.zsaCheckpoint); if (!row) return; const zm = zsaZoneModel(s.code); const tx = __txt(s); const want = !zm.computedWorst ? /nothing to set against the record/ : zm.reconcile === 'agree' ? /The aircraft model gives the same/ : zm.reconcile === 'conservative' ? /The record is the stricter of the two/ : zm.reconcile === 'conflict' ? /needs review against the model/ : /the zone needs that classification/; if (!want.test(tx)) disagree.push(s.code + ' ' + zm.reconcile); });
      const norec = secs.find((x) => !zsaData.some((r) => r.zoneId === x.code && !r.zsaCheckpoint));
      return { miss, tire: tire && tire.text, vols: tire && tire.ref.volumeIds.length, disagree, lw: !!norec && /This zone has no record yet, so it carries no classification of its own\./.test(__txt(norec)), norec: norec && norec.code };
    });
    check('R1 every particular risk whose zones include a zone is named in that zone with its PRA id and points to the PRA report', R1.miss.length === 0, R1.miss.slice(0, 6).join('; '));
    check('R2 the risk areas the CAD model places in the zone are named, and the risk is not asked again here', /^PRA-003 Tire burst: .*main bogie left forward.* reach this zone in the CAD model\. Assessed in the PRA report, section PRA-003, not asked again here\.$/.test(R1.tire || '') && R1.vols === 4, R1.tire);
    check('R3 the elicited and computed severity are reconciled in words, with the same verdict as zsaZoneModel (INV-18), every zone', R1.disagree.length === 0, R1.disagree.join('; '));
    check('R4 a zone with no record yet says so', R1.lw, R1.norec);

    console.log('\n[W] plain words');
    const W1 = await pg.evaluate(() => { const secs = SLZsaAuto.reportSections(), all = secs.map(__txt).join('\n');
      const pats = [/\b\d+ of \d+\b/, /\b(not )?answered\b/i, /\bunanswered\b/i, /\bsigned\b/i, /\bready to sign\b/i, /(?<!SF-\d+ )\b(open|closed|mitigated)\b/i, /\b\d+ (questions?|findings?|zones?|units?|runs?|parts?|answers?)\b/i, /\band \d+ more\b/];
      const hits = pats.filter((p) => p.test(all)).map((p) => String(p) + ': ' + (all.match(p) || [])[0]);
      const fcBare = (all.match(/\bFC-[A-Z0-9]+(?:-[A-Z0-9]+)*(?![-A-Z0-9])(?! [A-Z])/g)   /* 10 Nov 2026: ids like FC-PRP1-01 are one id */ || []), sfBare = (all.match(/\bSF-\d+\b(?! [A-Z])/g) || []), sysIds = all.match(/\bsys-[a-z0-9-]+/g) || [];
      return { hits, dash: /[—–]/.test(all), fcBare: fcBare.slice(0, 5), sfBare: sfBare.slice(0, 5), sysIds: sysIds.slice(0, 5), len: all.length };
    });
    check('W1 the report text carries no live counts and no status words', W1.hits.length === 0, W1.hits.join(' | '));
    check('W2 every failure condition and function id carries its name, and no internal system id shows', !W1.fcBare.length && !W1.sfBare.length && !W1.sysIds.length, JSON.stringify(W1));
    check('W3 no em or en dash anywhere in the report text', !W1.dash);

    console.log('\n[O] inputs and outputs');
    const O1 = await pg.evaluate(() => { const io = SLZsaAuto.reportIO(), outs = SLZsaAuto.reportOutputs(), fp = (id) => SLZsaAuto.reportOutputs().find((o) => o.id === id).fingerprint;
      const z = SLZsaAuto.compute().byCode['Z-MLGW'], tog = z.questions.find((q) => q.rule === 'TOGETHER');
      const a0 = fp('zsa.cma'), s0 = fp('zsa.severity'); SLZsaAuto.answer(tog.id, 'wall'); const a1 = fp('zsa.cma'); SLZsaAuto.answer(tog.id, 'wall'); const a2 = fp('zsa.cma'); const s1 = fp('zsa.severity');
      return { inputs: io.inputs.map((i) => [i.id, i.what, i.from && i.from.name, i.from && i.from.tab]), outs: outs.map((o) => ({ id: o.id, what: o.what, to: o.to.map((t) => t && t.name), accept: o.accept, q: o.qids.length, fp: o.fingerprint })), cmaHasTog: outs.find((o) => o.id === 'zsa.cma').qids.includes(tog.id), a0, a1, a2, s0, s1, does: io.does };
    });
    check('O1 the inputs say what the ZSA needs and the page it comes from (CAD model, items, routing, FHA, MAC, cascade, PRA)', ['cad', 'items', 'routing', 'fha', 'mac', 'cea', 'pra'].every((k) => O1.inputs.some((i) => i[0] === k && i[1] && i[2] && i[3])) && !!O1.does, JSON.stringify(O1.inputs));
    check('O2 each output says what it is, who receives it and how it is accepted, with the questions behind it', O1.outs.length >= 5 && O1.outs.every((o) => o.what && o.to.length && o.to.every(Boolean) && o.accept && typeof o.fp === 'string') && O1.outs.find((o) => o.id === 'zsa.findings').q > 60 && O1.cmaHasTog, JSON.stringify(O1.outs));
    check('O3 a changed answer behind an output changes its fingerprint (it reopens); picking the same answer again does not', O1.a0 !== O1.a1 && O1.a1 === O1.a2, JSON.stringify([O1.a0, O1.a1, O1.a2]));
    check('O4 an output whose answers did not change keeps its fingerprint', O1.s0 === O1.s1);

    console.log('\n[X] edit and add without the table');
    const X1 = await pg.evaluate(() => { const row = zsaData.find((r) => r.zoneId === 'Z-MLGW' && !r.zsaCheckpoint), ef = SLZsaAuto.editFields(row), byK = {}; ef.fields.forEach((f) => { byK[f.key] = f; });
      const keys = ['zoneId', 'desc', 'equip', 'severity', 'interference', 'mitigation', 'housedFunctions', 'assumptionIds', 'assessedBy', 'assessMethod', 'assessedOn', 'findingStatus', 'adjacency.forwardOfEngines', 'adjacency.shieldedBy', 'adjacency.adjacentZones', 'adjacency.pressurized'];
      const add = SLZsaAuto.editFields(null);
      return { missing: keys.filter((k) => !byK[k]), ro: ['equip', 'interference', 'mitigation', 'zoneId'].every((k) => byK[k].readOnly && byK[k].why), rw: ['desc', 'severity', 'housedFunctions', 'assumptionIds'].every((k) => !byK[k].readOnly), sev: byK.severity.options.map((o) => o[0]), hf: byK.housedFunctions.options.some((o) => /^SF-12 Extend/.test(o[1])) && byK.housedFunctions.value.includes('SF-12'), addTitle: add.title, addRo: add.fields.some((f) => f.readOnly), labels: ef.fields.every((f) => f.label && !/[—–]/.test(f.label)) };
    });
    check('X1 Edit offers every field the ZSA table held, with its current value', X1.missing.length === 0 && X1.hf, X1.missing.join(', '));
    check('X2 for a zone in the CAD model, what the Autopilot writes is read-only and says why; the rest can be edited', X1.ro && X1.rw, JSON.stringify(X1));
    check('X3 "Add a zone" starts empty with every field editable', X1.addTitle === 'Add a zone' && !X1.addRo && X1.labels);
    const X2 = await pg.evaluate(() => { const n0 = zsaData.length;
      const r1 = SLZsaAuto.saveZone({ zoneId: 'Z-TEST', desc: 'Test bay', severity: 'Major', interference: 'Oil line over a connector', mitigation: 'Drip loop', housedFunctions: ['SF-12'], 'adjacency.adjacentZones': 'Z-MLGW, Z-BELLY', 'adjacency.pressurized': true });
      const r2 = SLZsaAuto.saveZone({ zoneId: ' z-test ', desc: 'again' }); const r3 = SLZsaAuto.saveZone({ zoneId: 'Z-MLGW', desc: 'again' });
      const id = r1.row && r1.row.internalId; const r4 = SLZsaAuto.saveZone({ desc: 'Test bay, aft', zoneId: 'Z-TEST' }, { internalId: id });
      const rows = zsaData.filter((r) => r.zoneId === 'Z-TEST'), row = rows[0];
      const fields = ['internalId', 'zoneId', 'desc', 'equip', 'severity', 'interference', 'mitigation', 'housedFunctions', 'assumptionIds', 'adjacency', 'assessedOn', 'findingStatus'];
      const sec = SLZsaAuto.reportSections().find((s) => s.code === 'Z-TEST');
      const r5 = SLZsaAuto.saveZone({ zoneId: 'Z-TEST', findingStatus: 'closed' }, { internalId: id });
      return { ok1: r1.ok, r2: r2.ok === false && /already has its record/.test(r2.err), r3: r3.ok === false, ok4: r4.ok, n: zsaData.length - n0, rows: rows.length, same: row && row.internalId === id, desc: row && row.desc, fieldsOk: fields.every((k) => row && row[k] !== undefined), adj: row && row.adjacency, hf: row && row.housedFunctions, status: row && row.findingStatus, sec: !!sec && !sec.inModel && /Oil line over a connector/.test(__txt(sec)), r5: r5.ok === false && /closed/.test(r5.err || '') };
    });
    check('X4 "Add a zone" writes one record with every field the readers use', X2.ok1 && X2.n === 1 && X2.rows === 1 && X2.fieldsOk && X2.status === 'open' && JSON.stringify(X2.hf) === '["SF-12"]' && X2.adj && X2.adj.pressurized === true && JSON.stringify(X2.adj.adjacentZones) === '["Z-MLGW","Z-BELLY"]', JSON.stringify(X2));
    check('X5 adding a zone that already has its record is refused, whatever the case or spaces (no duplicate)', X2.r2 && X2.r3, JSON.stringify(X2));
    check('X6 Edit changes the record in place (same id, still one record)', X2.ok4 && X2.same && X2.desc === 'Test bay, aft' && X2.rows === 1);
    check('X7 the new zone gets its own report section from its record', X2.sec);
    check('X8 closing a finding without its full record is refused, as the table refused it', X2.r5);
    const X3 = await pg.evaluate(() => { const row = zsaData.find((r) => r.zoneId === 'Z-MLGW' && !r.zsaCheckpoint), id = row.internalId, before = row.interference;
      const r = SLZsaAuto.saveZone({ severity: 'Hazardous', interference: 'typed over' }, { internalId: id });
      const z = SLZsaAuto.compute().byCode['Z-MLGW']; const q = z.questions.find((x) => x.rule === 'DRAIN'); SLZsaAuto.answer(q.id, 'drain');
      const s = SLZsaAuto.reportSections().find((x) => x.code === 'Z-MLGW');
      return { ok: r.ok, n: zsaData.filter((x) => x.zoneId === 'Z-MLGW' && !x.zsaCheckpoint).length, sev: row.severity, by: row.severityBy, kept: row.interference !== 'typed over' && /^Could a hydraulic leak/.test(row.interference), conflict: /classifies the worst outcome of losing this zone as Hazardous, but in the aircraft model one event here can cause FC-28 Structural failure resulting from unpaved-surface loads \(Catastrophic\), which is worse/.test(__txt(s)), inv: zsaZoneModel('Z-MLGW').reconcile };
    });
    check('X9 a severity the engineer sets in Edit is kept when the Autopilot writes the zone again', X3.ok && X3.n === 1 && X3.sev === 'Hazardous' && X3.by === 'engineer', JSON.stringify(X3));
    check('X10 a read-only field sent to saveZone is ignored (the Autopilot\'s words stay)', X3.kept);
    check('X11 the report then names the disagreement with the model, as INV-18 does', X3.conflict && X3.inv === 'conflict', JSON.stringify(X3));
    const X4 = await pg.evaluate(() => { const wk = { internalId: 990001, zoneId: 'Z-NLGW', zsaCheckpoint: 'cp-fluid', origin: 'walkthrough', desc: 'Walkthrough', interference: 'Steering line chafes the harness', mitigation: 'Clamp added', findingStatus: 'open' };
      zsaData.unshift(wk); SLZsaAuto.materialize('Z-NLGW');
      const main = zsaData.filter((r) => r.zoneId === 'Z-NLGW' && !r.zsaCheckpoint); const s = SLZsaAuto.reportSections().find((x) => x.code === 'Z-NLGW');
      return { wkKept: wk.interference === 'Steering line chafes the harness' && !wk.zsaFindings && wk.desc === 'Walkthrough', main: main.length, listed: s.blocks.some((b) => b.type === 'list' && b.items.some((i) => /^Walkthrough finding \(cp-fluid\): Steering line chafes the harness Mitigation: Clamp added$/.test(i.text))), dup: SLZsaAuto.saveZone({ zoneId: 'Z-NLGW' }).ok === false };
    });
    check('X12 a zonal walkthrough finding is never taken over as the zone\'s record, and the report lists it', X4.wkKept && X4.main === 1 && X4.listed, JSON.stringify(X4));
    check('X13 a walkthrough finding does not count as the zone\'s record for "Add", but the real record still blocks a duplicate', X4.dup);
    const X5 = await pg.evaluate(() => { const bad = zsaData.filter((r) => r.origin === 'zsa-autopilot' || r.zsaFindings).filter((r) => SLZsaRecord.missing(r).some((m) => m === 'status' || m === 'method')); return bad.map((r) => r.zoneId + ':' + r.findingStatus + ':' + r.assessMethod); });
    check('X14 the Autopilot writes the record fields in the record\'s own shape (open or closed, a method from the list)', X5.length === 0, X5.join('; '));

    console.log('\n[Q] the question cards');
    await pg.evaluate(() => switchTab('zsa')); await tick(1200);
    const Q0 = await pg.evaluate(() => { const z = SLZsaAuto.compute().byCode['Z-MLGW'], i = z.questions.findIndex((q) => q.rule === 'LEAK'); SLZsaAuto.ui.zone('Z-MLGW'); SLZsaAuto.ui.step(i + 1); const q = z.questions[i]; return { qid: q.id }; });
    await tick(300);
    const Q1 = await pg.evaluate(() => { const h = document.getElementById('zsa-auto-host'), c = h.querySelector('.zsq-q'), opts = [...h.querySelectorAll('.zsq-opt')];
      return { intro: !!(c && c.querySelector('.zsq-intro') && c.querySelector('.zsq-intro').textContent.length > 30), means: opts.length >= 3 && opts.every((o) => o.querySelector('.zsq-om') && /What this changes:/.test(o.textContent)), left: opts.every((o) => getComputedStyle(o).justifyContent === 'flex-start' && getComputedStyle(o).textAlign === 'left'), mk: opts.every((o) => o.firstElementChild && o.firstElementChild.classList.contains('zsq-mk')), sub: h.querySelectorAll('.zsq-q.sub').length, introColor: c ? getComputedStyle(c.querySelector('.zsq-intro')).color : '' };
    });
    check('Q1 the question opens with a short intro', Q1.intro, JSON.stringify(Q1));
    check('Q2 every answer card says what it means and what it changes before it is picked', Q1.means, JSON.stringify(Q1));
    check('Q3 the cards are left aligned with their marker first', Q1.left && Q1.mk, JSON.stringify(Q1));
    check('Q4 no follow-up shows where none applies', Q1.sub === 0);
    await pg.click('#zsa-auto-host .zsq-opt[data-slap-o="sealed"]'); await tick(300);
    const Q2 = await pg.evaluate(() => { const h = document.getElementById('zsa-auto-host'), sub = h.querySelector('.zsq-q.sub'), top = h.querySelector('.zsq-q:not(.sub)'); const next = [...h.querySelectorAll('.slap-nav .slap-btn.p')].pop();
      return { sub: !!sub, indent: sub ? sub.getBoundingClientRect().left - top.getBoundingClientRect().left : 0, line: sub ? getComputedStyle(sub, '::before').borderLeftStyle : '', after: sub ? !!(top.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING) : false, nextOff: !!(next && next.disabled), subOpts: sub ? sub.querySelectorAll('.zsq-opt .zsq-om').length : 0 };
    });
    check('Q5 picking "sealed" shows its follow-up indented under it, with a connector line', Q2.sub && Q2.indent >= 20 && Q2.line === 'solid' && Q2.after, JSON.stringify(Q2));
    check('Q6 Next waits until the follow-up is answered too', Q2.nextOff && Q2.subOpts >= 2, JSON.stringify(Q2));
    await pg.click('#zsa-auto-host .zsq-q.sub .zsq-opt[data-slap-o="qualified"]'); await tick(300);
    const Q3 = await pg.evaluate(() => { const next = [...document.querySelectorAll('#zsa-auto-host .slap-nav .slap-btn.p')].pop(); return { next: !!(next && !next.disabled), picked: !!document.querySelector('#zsa-auto-host .zsq-q.sub .zsq-opt.picked') }; });
    check('Q7 answering the follow-up enables Next', Q3.next && Q3.picked, JSON.stringify(Q3));
    const Q4 = await pg.evaluate((qid) => { const b = document.querySelector('#zsa-auto-host [data-zsq-jump="' + qid + '"]'); if (b) b.click(); const el = document.querySelector('#ccr-host-zsa [data-ccdoc] [data-ccq="' + qid + '"]'); return { btn: !!b, lit: !!(el && el.classList.contains('ccr-flash')) }; }, Q0.qid);
    check('Q8 "See where it goes" lights up what the answer wrote in the report', Q4.btn && Q4.lit, JSON.stringify(Q4));

    console.log('\n[T] the switch');
    const T1 = await pg.evaluate(() => { const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0; const v = document.getElementById('view-zsa');
      renderZsaModels(); const on = { table: vis(document.getElementById('zsa-table')), form: vis(document.getElementById('btn-submit-zsa')) || vis(v.querySelector(':scope > .collapsible-form-bar')), filter: vis(v.querySelector(':scope > .generic-filter-bar')), models: (document.getElementById('zsa-models-host') || { innerHTML: '' }).innerHTML.length, report: vis(document.getElementById('ccr-host-zsa')), body: !!document.getElementById('zsa-body') };
      SLZsaAuto.TABLE_RETIRED = false; SLZsaAuto.applyTableSwitch(); renderZsaModels();
      const off = { table: vis(document.getElementById('zsa-table')), models: (document.getElementById('zsa-models-host') || { innerHTML: '' }).innerHTML.length > 0 };
      SLZsaAuto.TABLE_RETIRED = true; SLZsaAuto.applyTableSwitch(); renderZsaModels();
      let inv = null; try { const r = invRun(); const x = (r.results || r || []).find ? (r.results || r).find((i) => i.id === 'INV-18') : null; inv = x ? (x.checked != null ? x.checked : true) : (typeof zsaZoneModel === 'function'); } catch (e) { inv = 'err ' + e; }
      return { on, off, inv, zm: typeof zsaZoneModel === 'function' && !!zsaZoneModel('Z-CWB'), back: !vis(document.getElementById('zsa-table')) };
    });
    check('T1 as shipped, the switch is on: the table, its form, its filter bar and the "Zone models" panel are gone; the report shows', !T1.on.table && !T1.on.form && !T1.on.filter && T1.on.models === 0 && T1.on.report && T1.on.body, JSON.stringify(T1.on));
    check('T2 the one switch brings the table and the panel back (and away again)', T1.off.table && T1.off.models && T1.back, JSON.stringify(T1));
    check('T3 zsaZoneModel and INV-18 keep working with the table retired', T1.zm && T1.inv !== null && !/^err/.test(String(T1.inv)), JSON.stringify(T1));

    console.log('\n[G] the ZSA page on the shared report frame');
    await pg.evaluate(() => { switchTab('dashboard'); }); await tick(300); await pg.evaluate(() => { switchTab('zsa'); }); await tick(1200);
    const G1 = await pg.evaluate(() => { SLCcaReport.get('zsa').setTab(null); const h = document.getElementById('ccr-host-zsa'), head = document.querySelector('#view-zsa > .header-with-export'); const secs = SLZsaAuto.reportSections().map((s) => s.code);
      return { host: !!h && head.nextElementSibling === h, left: !!document.querySelector('#ccr-host-zsa #zsa-auto-host [data-zsa-auto]'), rail: document.querySelectorAll('#zsa-auto-host [data-slap-rail]').length, prev: [...document.querySelectorAll('#ccr-host-zsa [data-cc-regrow]')].map((e) => e.getAttribute('data-cc-regrow')), opts: [...document.querySelectorAll('#ccr-host-zsa [data-cctabsel] option')].map((o) => o.value), secs, oneHost: document.querySelectorAll('#zsa-auto-host').length, edits: document.querySelectorAll('#ccr-host-zsa [data-cc-edit]').length, add: !!document.querySelector('#ccr-host-zsa [data-cc-add]') };
    });
    check('G1 the ZSA page is the Autopilot on the left and the ZSA report on the right, right under the heading', G1.host && G1.left && G1.rail === 25 && G1.oneHost === 1, JSON.stringify(G1));
    check('G2 one report per zone: the register lists every zone, the dropdown offers All zones then every zone, and "Add a zone" is at the top', JSON.stringify(G1.prev) === JSON.stringify(G1.secs) && JSON.stringify(G1.opts) === JSON.stringify([''].concat(G1.secs)) && G1.add, JSON.stringify(G1).slice(0, 300));
    const G2b = await pg.evaluate(async () => { SLCcaReport.get('zsa').setTab('Z-CWB'); await new Promise((r) => setTimeout(r, 300)); const pv = document.querySelector('#ccr-host-zsa [data-ccdoc]'); return { secs: [...pv.querySelectorAll('[data-ccsec]')].map((e) => e.getAttribute('data-ccsec')), edit: !!pv.querySelector('[data-cc-edit="Z-CWB"]'), no: (pv.querySelector('[data-cc-cover]') || { textContent: '' }).textContent, zone: SLZsaAuto.state.zone }; });
    check('G2b a zone picked in the dropdown is its own report: its cover and document number, only its section with its Edit, and its questions on the left', JSON.stringify(G2b.secs) === '["Z-CWB"]' && G2b.edit && /ZSA-Z-CWB/.test(G2b.no) && G2b.zone === 'Z-CWB', JSON.stringify(G2b).slice(0, 300));
    const G3 = await pg.evaluate(async () => { const z = SLZsaAuto.compute().byCode['Z-CWB'], q = z.questions.find((x) => x.rule === 'DRAIN'), i = z.questions.indexOf(q); SLZsaAuto.ui.zone('Z-CWB'); SLZsaAuto.ui.step(i + 1); await new Promise((r) => setTimeout(r, 200));
      document.querySelector('#zsa-auto-host .zsq-opt[data-slap-o="shroud"]').click(); await new Promise((r) => setTimeout(r, 120));
      const el = document.querySelector('#ccr-host-zsa [data-ccdoc] [data-ccq="' + q.id + '"]'); return { lit: !!(el && el.classList.contains('ccr-flash')), text: el && el.textContent, inSec: !!(el && el.closest('[data-ccsec="Z-CWB"]')) };
    });
    check('G3 clicking an answer card writes the report and lights up the paragraph it wrote, in its zone', G3.lit && G3.inSec && /Decision: The lines have a shroud that catches it/.test(G3.text || ''), JSON.stringify(G3));
    const G4 = await pg.evaluate(async () => { const box = document.querySelector('#ccr-host-zsa [data-ccdoc] [data-ccsec="Z-CWB"] [data-ccnode="fc:FC-14"]'); if (box) box.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 120));
      const p = document.querySelector('#ccr-host-zsa [data-cc-node="fc:FC-14"]'), t1 = p ? p.textContent : '';
      const io = document.querySelector('#ccr-host-zsa [data-ccdoc] [data-ccnode="in:cad"]'); if (io) io.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 120));
      const p2 = document.querySelector('#ccr-host-zsa [data-cc-node="in:cad"]'); const lb = p2 && p2.querySelector('[data-cc-live]'); if (lb) lb.click(); await new Promise((r) => setTimeout(r, 120));
      const lv = document.querySelector('#ccr-host-zsa [data-cc-nodelive]'); const sys = document.querySelector('#ccr-host-zsa [data-ccdoc] [data-ccsec="Z-CWB"] [data-ccnode="s:sys-fue"]');
      SLCcaReport.act('zsa', 'live'); SLCcaReport.act('zsa', 'node', null);
      return { box: !!box, t1, p2: !!p2, live: lv ? lv.textContent : '', sys: !!sys, docLive: /parts in the CAD model/.test(document.querySelector('#ccr-host-zsa [data-ccdoc]').textContent) };
    });
    check('G4 a box of the zone\'s "what one event takes out" figure opens its panel, named in words', G4.box && /FC-14 Loss of fuel delivery to all engines/.test(G4.t1) && /Severity: Catastrophic/.test(G4.t1) && G4.sys, JSON.stringify(G4));
    check('G5 a box of the inputs and outputs figure opens its panel; where the program stands shows only there, on request', G4.p2 && /\d+ parts in the CAD model/.test(G4.live) && !G4.docLive, JSON.stringify(G4));
    const G6 = await pg.evaluate(() => { const R = SLCcaReport.get('zsa'), st = (id) => R.acceptance().find((o) => o.id === id).state; const a0 = st('zsa.cma'); R.accept('zsa.cma'); const a1 = st('zsa.cma');
      const z = SLZsaAuto.compute().byCode['Z-MLGW'], q = z.questions.find((x) => x.rule === 'TOGETHER'); SLZsaAuto.ui.pick(q.id, q.options.find((o) => o.id !== (SLZsaAuto.activeQuestions(z).find((x) => x.id === q.id) && (projectConfig.zsaAuto.answers[q.id] || {}).pick)).id);
      const a2 = st('zsa.cma'), f2 = st('zsa.severity'); const row = document.querySelector('#ccr-host-zsa [data-cc-out="zsa.cma"]'); const outs = R.outputs().map((o) => [o.id, o.role, typeof o.fp]);
      return { a0, a1, a2, f2, pill: row ? row.textContent : '', rec: !!(((projectConfig.ccaReports.zsa.accepts || {})[R.tab()] || {})['zsa.cma'] && projectConfig.ccaReports.zsa.accepts[R.tab()]['zsa.cma'].by), outs, inDoc: /Reopened|Accepted by [A-Z][a-z]+ [A-Z]/.test(document.querySelector('#ccr-host-zsa [data-ccdoc]').textContent) };
    });
    check('G6 an output is accepted in Safety Lab with who; a changed answer behind it reopens it; the others stay as they were', G6.a1 === 'accepted' && G6.rec && G6.a2 === 'reopened' && /Reopened/.test(G6.pill) && G6.f2 === 'open' && !G6.inDoc && G6.outs.length === 6 && G6.outs.every((o) => o[1] && o[2] === 'function'), JSON.stringify(G6));
    const W = await pg.evaluate(async () => {
      const R = SLCcaReport.get('zsa'); R.setTab('Z-MLGW'); await new Promise((r) => setTimeout(r, 400)); const m = R.model({ report: 'Z-MLGW' }), lib = await _loadDocxLib();
      const imgs = m.blocks.filter((x) => x.k === 'img'); for (const x of imgs.slice(0, 4)) x.dataUrl = await SLFtaPrint.png({ svg: x.svg, w: x.w, h: x.h }, 1);
      const blob = await SLReportWriter.docx(m, lib), buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      const pv = document.querySelector('#ccr-host-zsa [data-ccdoc]'), bl = R.doc({ report: 'Z-MLGW' });
      const text = m.blocks.filter((x) => !(x.k === 'table' && x.name === 'outputs')).map((x) => x.k === 'table' ? JSON.stringify(x.rows) : (x.text || x.caption || '')).join('\n');
      return { b64: btoa(bin), size: blob.size, cover: m.cover.tables.map((t) => t.title).join(','), roles: m.cover.tables[1].rows.map((r) => r.Holder).join('|'), acts: m.blocks.filter((x) => x.k === 'act').length, imgs: imgs.length, imgLight: imgs.every((x) => /fill="#ffffff"/.test(x.svg)),
        toc: pv.querySelectorAll('[data-cc-toc] [data-cc-goto^="h"]').length, heads: bl.filter((x) => x.k === 'h').length, lot: pv.querySelectorAll('[data-cc-lot]').length, tables: bl.filter((x) => x.k === 'table').length, lof: pv.querySelectorAll('[data-cc-lof]').length, figs: bl.filter((x) => x.k === 'fig').length,
        counts: (text.match(/\b\d+ (units|questions|records|rows|sections|parts|zones|runs|findings)\b|\b(not )?answered\b|\bsigned\b|\b\d+ of \d+\b|(?<!SF-\d+ )\b(open|closed)\b/gi) || []).slice(0, 5), dash: /[\u2014\u2013]/.test(text) };
    });
    let docText = ''; try { const tmp = path.join(os.tmpdir(), 'zsa_report_' + process.pid + '.docx'); fs.writeFileSync(tmp, Buffer.from(W.b64, 'base64')); docText = cp.execFileSync('unzip', ['-p', tmp, 'word/document.xml'], { maxBuffer: 128 * 1024 * 1024 }).toString().replace(/<[^>]+>/g, ' '); fs.unlinkSync(tmp); } catch (e) { docText = 'unzip failed: ' + e.message; }
    check('G7 Word, one zone\'s own report: a cover (document control, approvals by role, revision history), contents, list of tables, list of figures', W.size > 30000 && W.cover === 'Document control,Approvals,Revision history' && /To be named \(by role\)/.test(W.roles) && /Contents/.test(docText) && /List of Tables/.test(docText) && /List of Figures/.test(docText) && /Zonal Safety Analysis/.test(docText) && /Z-MLGW Main landing gear bays/.test(docText), JSON.stringify({ size: W.size, cover: W.cover, doc: docText.slice(0, 160) }));
    check('G8 the open zone report\'s preview lists every heading in its contents and every table and figure in its lists (zone pictures and loss figures among them)', W.toc === W.heads && W.lot === W.tables && W.lof === W.figs && W.figs >= 1 && W.tables >= 5, JSON.stringify({ toc: W.toc, heads: W.heads, lot: W.lot, tables: W.tables, lof: W.lof, figs: W.figs }));
    check('G9 no counts or status words in the Word text, no dashes, page-only buttons left out, figures drawn light', !W.counts.length && !W.dash && W.acts === 0 && W.imgLight && !/Simulate one event/.test(docText), JSON.stringify(W.counts));
    const D = await pg.evaluate(async () => {
      document.body.classList.add('theme-dark'); await new Promise((r) => setTimeout(r, 300));
      const pv = document.querySelector('#ccr-host-zsa [data-ccdoc]'), cs = (el) => getComputedStyle(el);
      const p = pv.querySelector('[data-ccsec="Z-MLGW"] p'), th = pv.querySelector('[data-ccsec="Z-MLGW"] .ccr-dt th'), td = pv.querySelector('[data-ccsec="Z-MLGW"] .ccr-dt td'), h = pv.querySelector('h3'), fig = pv.querySelector('[data-ccsec="Z-MLGW"] .ccr-fig svg rect'), lq = document.querySelector('#zsa-auto-host .slap-title');
      const out = { bg: cs(pv).backgroundColor, p: cs(p).color, th: cs(th).color, thBg: cs(th).backgroundColor, td: cs(td).color, tdBg: cs(td).backgroundColor, h: cs(h).color, fig: fig ? fig.getAttribute('fill') : '' };
      document.body.classList.remove('theme-dark'); await new Promise((r) => setTimeout(r, 300));
      out.back = (document.querySelector('#ccr-host-zsa [data-ccdoc] [data-ccsec="Z-MLGW"] .ccr-fig svg rect') || {}).getAttribute('fill');
      return out;
    });
    const cP = contrast(D.p, D.bg), cTh = contrast(D.th, D.thBg), cTd = contrast(D.td, D.tdBg), cH = contrast(D.h, D.bg);
    check('G10 dark mode: a dark report with readable text, headings and table cells (contrast at least 4.5), zone pictures drawn dark', lum(D.bg) < 0.05 && cP >= 4.5 && cTh >= 4.5 && cTd >= 4.5 && cH >= 4.5 && D.fig === '#15181E' && D.back === '#ffffff', JSON.stringify({ D, cP, cTh, cTd, cH }));
    // Edit and Add through the page
    const n0 = await pg.evaluate(() => zsaData.length);
    await pg.evaluate(() => SLCcaReport.get('zsa').setTab('Z-NOSE')); await tick(400);
    await pg.click('#ccr-host-zsa [data-cc-edit="Z-NOSE"]'); await tick(200);
    const GE0 = await pg.evaluate(() => { const f = document.querySelector('#ccr-host-zsa [data-cc-form="Z-NOSE"]'); return { form: !!f, keys: f ? [...f.querySelectorAll('[data-ccf]')].map((e) => e.getAttribute('data-ccf')) : [] }; });
    await pg.fill('#ccr-host-zsa [data-cc-form="Z-NOSE"] [data-ccf="desc"]', 'Nose radome and forward avionics bay, frames 1 to 9');
    await pg.click('#ccr-host-zsa [data-cc-save="Z-NOSE"]'); await tick(300);
    const GE1 = await pg.evaluate(() => { const rows = zsaData.filter((r) => r.zoneId === 'Z-NOSE' && !r.zsaCheckpoint); const sec = document.querySelector('#ccr-host-zsa [data-ccsec="Z-NOSE"]'); return { n: rows.length, desc: rows[0].desc, form: !!document.querySelector('#ccr-host-zsa [data-cc-form]'), lit: !!(sec && sec.classList.contains('ccr-flash')) }; });
    check('G11 Edit on a zone opens the table\'s fields that are not written by the Autopilot, and saves in place', GE0.form && ['desc', 'severity', 'housedFunctions', 'assumptionIds', 'adjacency.shieldedBy'].every((k) => GE0.keys.includes(k)) && !GE0.keys.includes('interference') && GE1.n === 1 && /frames 1 to 9/.test(GE1.desc) && !GE1.form && GE1.lit, JSON.stringify({ GE0, GE1 }));
    await pg.click('#ccr-host-zsa [data-cc-add]'); await tick(200);
    await pg.fill('#ccr-host-zsa [data-cc-form="new"] [data-ccf="zoneId"]', 'Z-UI'); await pg.fill('#ccr-host-zsa [data-cc-form="new"] [data-ccf="desc"]', 'Added from the report');
    await pg.click('#ccr-host-zsa [data-cc-save="new"]'); await tick(300);
    await pg.click('#ccr-host-zsa [data-cc-add]'); await tick(200);
    await pg.fill('#ccr-host-zsa [data-cc-form="new"] [data-ccf="zoneId"]', 'z-ui'); await pg.click('#ccr-host-zsa [data-cc-save="new"]'); await tick(300);
    const GE2 = await pg.evaluate((n0) => { const err = document.querySelector('#ccr-host-zsa [data-cc-err]'); const r = { n: zsaData.length - n0, rows: zsaData.filter((x) => String(x.zoneId).toLowerCase() === 'z-ui').length, err: err ? err.textContent : '', sec: !!document.querySelector('#ccr-host-zsa [data-ccsec="Z-UI"]') }; SLCcaReport.act('zsa', 'cancel'); return r; }, n0);
    check('G12 "Add a zone" through the page writes one record and its section; the same zone again is refused in plain words', GE2.n === 1 && GE2.rows === 1 && GE2.sec && /Z-UI already has its record/.test(GE2.err), JSON.stringify(GE2));
    // a particular risk opens the PRA report at its section; the CAD model link still works
    await pg.evaluate(() => SLCcaReport.get('zsa').setTab('Z-MLGW')); await tick(400);
    await pg.evaluate(() => { const b = [...document.querySelectorAll('#ccr-host-zsa [data-ccsec="Z-MLGW"] [data-cc-act]')].find((x) => /Open PRA-003 in the PRA report/.test(x.textContent)); window.__praBtn = !!b; if (b) b.click(); });
    await tick(2500);
    const G13 = await pg.evaluate(() => { const v = document.getElementById('view-pra'), s = document.querySelector('#ccr-host-pra [data-ccsec="PRA-003"]'); return { btn: window.__praBtn, shown: v && v.style.display !== 'none', sec: !!s, lit: !!(s && s.classList.contains('ccr-flash')) }; });
    check('G13 "Open PRA-003 in the PRA report" opens the PRA page at that risk\'s section, lit up', G13.btn && G13.shown && G13.sec && G13.lit, JSON.stringify(G13));
    await pg.evaluate(() => switchTab('zsa')); await tick(800);
    await pg.click('#zsa-auto-host [data-slap-import="page"]'); await tick(600);
    const G14 = await pg.evaluate(() => { const v = document.getElementById('view-cad'); const r = !!v && v.style.display !== 'none'; switchTab('zsa'); return r; });
    check('G14 "Open the CAD Model page" still opens the CAD model', G14);

    console.log('\n[P] the page');
    const P0 = await pg.evaluate(() => { const got = []; const o = window.open; window.open = () => ({ document: { open() {}, write(h) { got.push(h); }, close() {} } }); try { SLZsaAuto.ui.report(); } finally { window.open = o; } const h = got[0] || ''; return { h2: (h.match(/<h2 id="zsa-zone-/g) || []).length, tagged: /data-zsa-q="/.test(h), dash: /[—–]/.test(h.replace(/<svg[\s\S]*?<\/svg>/g, '')) }; });
    check('P0 "Write the ZSA report" prints the same sections until the report frame draws them', P0.h2 >= 25 && P0.tagged && !P0.dash, JSON.stringify(P0));
    check('P1 no page errors', errs.length === 0, errs.join(' | '));
  } finally { await browser.close(); srv.close(); }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
