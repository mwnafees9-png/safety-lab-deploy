#!/usr/bin/env node
/*
 * Regression (4 Nov 2026): the ZSA Autopilot (site/zsa_autopilot.js) and the PRA Autopilot (site/pra_autopilot.js),
 * with their shared look (site/autopilot_ui.js), on the Aeolus HL-1 demo with its CAD model.
 *
 * Waqas: "Put PRAs in the PRA, ZSAs in the ZSA ... make the inputs more intuitive like CMAs"; "think about it similarly
 * to how we built the planning auto pilot"; "the interface should be so intuitive my 10 year old daughter should be able
 * to do it". Pinned:
 *   [L]  load order: autopilot_ui.js after cad_zonal.js and zonal_model.js, before zsa_autopilot.js and pra_autopilot.js.
 *   [K]  what a part is (classify): a fuel computer is electronics, not a fuel source; a fuel valve is fuel; an engine
 *        is hot, a fuel valve "of engine 1" is not; lanes and copies are found (laneKey).
 *   [Z]  the real app: the ZSA is worked out for every top zone from the CAD model (units, runs, worst failure
 *        condition), only real choices are asked (LEAK, TOGETHER, HOT, DRAIN), each answer names what it changes;
 *        an answer writes the zone's row (adopted, never a second row; what it said before kept in zsaTyped); a design
 *        change leaves the finding open; signing needs every answer and no open finding; changing an answer reopens it;
 *        the page asks one question per screen, Next waits for an answer, and a click on an answer picks it.
 *   [P]  the real app: the PRA risks on the CAD model (each engine's rotor burst, tire burst, the fires, bird strike,
 *        lightning); the fragments question is asked once and changes what every engine reaches; lanes and lines one
 *        event reaches together are asked about, and a shared rotor answer counts for every engine; an answer writes the
 *        risk's PRA row (adopted by its PRA id, praTyped kept, zones and systems from the model).
 *   [R]  both reports are written.
 * MUTATION PROOFS: SL_AP_MUTATE=fuelcomputer | adopt | signopen | calc | alt | inputs | nextgate. Each turns this red.
 * Run: node tests/regression_autopilots_20261104.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 500) : '')); } };
const REPO = path.join(__dirname, '..'), SITE = path.join(REPO, 'site');
const MUT = process.env.SL_AP_MUTATE || '';
const MUTS = {
  fuelcomputer: ['zsa_autopilot.js', "if (!elec && (/fuel/.test(lname) || sys === 'sys-fue'))", "if ((/fuel/.test(lname) || sys === 'sys-fue'))"],
  adopt:        ['zsa_autopilot.js', 'var row = rows.find(function (r) { return r && r.zoneId === code; });', 'var row = null;'],
  signopen:     ['zsa_autopilot.js', "var state = answered < n ? 'todo' : (open ? 'open' : (signed ? 'done' : 'ready'));", "var state = answered < n ? 'todo' : (signed ? 'done' : 'ready');"],
  calc:         ['pra_autopilot.js', "calc = (r.calc && r.calc.groups[gk]) || null; if (!calc || calc.status === 'meets' || calc.status === 'clear') return; }", "calc = (r.calc && r.calc.groups[gk]) || { status: 'fails', models: {} }; }"],
  alt:          ['pra_autopilot.js', "var frags = FRAG.filter(function (f) { return !f.optional || !!(_peekStore().settings || {}).alternate; });", 'var frags = FRAG.filter(function (f) { return !f.optional; });'],
  inputs:       ['pra_autopilot.js', "        if (!(mass > 0)) return { ok: false, err: 'Enter the disc mass with its blades (kg), from the engine maker\\'s data.' };\n", ''],
  nextgate:     ['zsa_autopilot.js', "class=\"slap-btn p\" ' + (o ? '' : 'disabled') + ' onclick=\"SLZsaAuto.ui.step(", "class=\"slap-btn p\" ' + '' + ' onclick=\"SLZsaAuto.ui.step("]
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) { let s = fs.readFileSync(path.join(SITE, name), 'utf8'); const m = MUTS[MUT]; if (m && m[0] === name) { if (s.indexOf(m[1]) < 0) throw new Error('mutation site missing: ' + m[1]); s = s.replace(m[1], m[2]); } return s; }
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));

(async function main() {
  console.log('\n[L] load order');
  {
    const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), at = (f) => idx.indexOf('src="' + f + '?v=');
    check('autopilot_ui.js loads after zonal_model.js and cad_zonal.js', at('autopilot_ui.js') > at('cad_zonal.js') && at('cad_zonal.js') > at('zonal_model.js') && at('zonal_model.js') > 0);
    check('zsa_autopilot.js and pra_autopilot.js load after autopilot_ui.js (pra after zsa: it uses its rules)', at('zsa_autopilot.js') > at('autopilot_ui.js') && at('pra_autopilot.js') > at('zsa_autopilot.js'));
  }

  console.log('\n[K] what a part is');
  {
    const ctx = { console, Math, JSON, Object, Array, String, Number, setInterval: () => 0, clearInterval() {} };
    ctx.window = ctx; vm.createContext(ctx);
    ctx.projectConfig = {};
    vm.runInContext(src('autopilot_ui.js'), ctx); vm.runInContext(src('zsa_autopilot.js'), ctx); vm.runInContext(src('pra_autopilot.js'), ctx);
    check('loading the modules writes nothing into the project', !('zsaAuto' in ctx.projectConfig) && !('praAuto' in ctx.projectConfig));
    check('...and with no CAD model there is no analysis (the pages say what to do first), not a guess', ctx.SLZsaAuto.compute() === null && ctx.SLPraAuto.compute() === null);
    const A = ctx.SLZsaAuto, cl = (name, sys, path) => A.classify({ name, path: path || ['Aeolus HL-1', 'EQUIPMENT', 'x'] }, sys);
    check('a fuel quantity computer is electronics, not a fuel source', cl('Fuel quantity and management computer', 'sys-fue').fluid === null && cl('Fuel quantity and management computer', 'sys-fue').electronic === true);
    check('a fuel boost pump and a fuel valve are fuel', cl('Fuel boost pump, tank group 1', 'sys-fue').fluid === 'fuel' && cl('Low-pressure fuel shutoff valve, engine 1', 'sys-fue').fluid === 'fuel');
    check('an engine is hot; a fuel valve "of engine 1" is not', cl('Engine 1 (left outboard)', 'sys-prp1').hot === true && cl('Low-pressure fuel shutoff valve, engine 1', 'sys-fue').hot === false);
    check('a hydraulic reservoir and accumulator are hydraulic', cl('Reservoir, system A', 'sys-hyd-a').fluid === 'hydraulic' && cl('Accumulator, system A', 'sys-hyd-a').fluid === 'hydraulic');
    check('structure is structure; a routing stretch is a run of its kind', cl('Wing rib', null, ['Aeolus HL-1', 'STRUCTURE']).kind === 'structure' && cl('Tube D20 x 950', null, ['Aeolus HL-1', 'ROUTING', 'FUEL LINES', 'F-FEED1']).fluid === 'fuel');
    check('lanes: "lane A" and "lane B", "1" and "2", "left" and "right" have the same key', A.laneKey('Elevator actuation lane A') === A.laneKey('Elevator actuation lane B') && A.laneKey('Generator 1') === A.laneKey('Generator 2') && A.laneKey('Main bogie, left aft') === A.laneKey('Main bogie, right aft'));
    check('a name with no lane has no lane key', A.laneKey('Cargo floor') === null);
  }

  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) { console.log('  SKIP  Playwright is not installed here; [Z], [P] and [R] need the real app'); }
  else {
    const http = require('http');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.step': 'application/step' };
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
      let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
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

      console.log('\n[Z] the ZSA Autopilot');
      const Zs = await pg.evaluate(() => { const r = SLZsaAuto.compute(); if (!r) return null; return { zones: r.zones.length, codes: r.zones.map((z) => z.code), q: r.zones.reduce((n, z) => n + z.questions.length, 0), rules: [...new Set([].concat(...r.zones.map((z) => z.questions.map((q) => q.rule))))].sort(), units: r.zones.reduce((n, z) => n + z.units.length, 0), worst: r.byCode['Z-NOSE'] && r.byCode['Z-NOSE'].worst, fuelComputerLeak: r.zones.some((z) => z.questions.some((q) => /Fuel quantity and management computer/.test(q.text) && q.rule === 'LEAK')), everyOptionSays: r.zones.every((z) => z.questions.every((q) => q.options.length >= 2 && q.options.every((o) => o.impact && o.status))) }; });
      check('worked out for every top zone of the model (25), from its units', Zs && Zs.zones === 25 && Zs.units > 250, JSON.stringify(Zs && { zones: Zs.zones, units: Zs.units }));
      check('only the real choices are asked, of the four kinds', Zs && Zs.q > 20 && Zs.q < 120 && JSON.stringify(Zs.rules) === JSON.stringify(['DRAIN', 'HOT', 'LEAK', 'TOGETHER']), JSON.stringify(Zs && { q: Zs.q, rules: Zs.rules }));
      check('a zone\'s worst outcome comes from its systems\' FHA', Zs && Zs.worst && Zs.worst.severity === 'Catastrophic' && !!Zs.worst.fc, JSON.stringify(Zs && Zs.worst));
      check('a fuel computer is never asked about as a leak source', Zs && !Zs.fuelComputerLeak);
      check('every answer says what it changes and what it means for the finding', Zs && Zs.everyOptionSays);
      const rowsBefore = await pg.evaluate(() => zsaData.filter((r) => r.zoneId === 'Z-MLGW').length);
      const z1 = await pg.evaluate(() => { const z = SLZsaAuto.compute().byCode['Z-MLGW']; const leak = z.questions.find((q) => q.rule === 'LEAK'), drain = z.questions.find((q) => q.rule === 'DRAIN'); SLZsaAuto.answer(leak.id, 'shield'); const row = zsaData.find((r) => r.zoneId === 'Z-MLGW'); return { n: zsaData.filter((r) => r.zoneId === 'Z-MLGW').length, mit: row.mitigation, typed: row.zsaTyped && row.zsaTyped.equip, equip: row.equip, status: row.findingStatus, st: SLZsaAuto.zoneStatus(z), drainId: drain.id, leakId: leak.id }; });
      check('an answer writes the zone\'s row in place (still one row for Z-MLGW)', rowsBefore === 1 && z1.n === 1, rowsBefore + ' -> ' + z1.n);
      check('...with the mitigation the answer names, and the units from the CAD model', /Drip shield over/.test(z1.mit) && /LDG-BOGIE/.test(z1.equip), z1.mit + ' | ' + z1.equip);
      check('...what the row said before is kept (zsaTyped)', /Four main bogies/.test(z1.typed || ''), z1.typed);
      check('...and it is still open while a question waits', z1.status === 'Open' && z1.st.state === 'todo');
      const z2 = await pg.evaluate((ids) => { SLZsaAuto.compute().byCode['Z-MLGW'].questions.forEach((q) => { if (q.id !== ids.drainId && q.id !== ids.leakId) SLZsaAuto.answer(q.id, q.options.find((o) => o.status !== 'open').id); }); SLZsaAuto.answer(ids.drainId, 'pools'); const z = SLZsaAuto.compute().byCode['Z-MLGW']; const signedOpen = SLZsaAuto.sign('Z-MLGW'); return { st: SLZsaAuto.zoneStatus(z), signedOpen, row: zsaData.find((r) => r.zoneId === 'Z-MLGW').findingStatus }; }, z1);
      check('a design change leaves the finding open, and an open zone cannot be signed', z2.st.open === 1 && z2.st.state === 'open' && z2.signedOpen === false && z2.row === 'Open', JSON.stringify(z2));
      const z3 = await pg.evaluate((ids) => { SLZsaAuto.answer(ids.drainId, 'drain'); const ok = SLZsaAuto.sign('Z-MLGW'); const z = SLZsaAuto.compute().byCode['Z-MLGW']; const s1 = SLZsaAuto.zoneStatus(z); const row = zsaData.find((r) => r.zoneId === 'Z-MLGW'); const r1 = { status: row.findingStatus, by: row.assessedBy }; SLZsaAuto.answer(ids.leakId, 'move'); return { ok, s1, r1, s2: SLZsaAuto.zoneStatus(z), stored: projectConfig.zsaAuto.answers[ids.leakId] }; }, z1);
      check('every answer in and nothing open: the zone is signed and its row closed with who signed', z3.ok === true && z3.s1.state === 'done' && z3.r1.status === 'Closed' && !!z3.r1.by, JSON.stringify(z3));
      check('changing an answer reopens a signed zone', z3.s2.state === 'open' && !z3.s2.signed, JSON.stringify(z3.s2));
      check('the answer is kept in the project with who and when', z3.stored && z3.stored.pick === 'move' && !!z3.stored.by && !!z3.stored.at);
      // the page, by clicking
      await pg.evaluate(() => switchTab('zsa')); await tick(1500);
      const pageOk = await pg.evaluate(() => !!document.querySelector('#zsa-auto-host [data-zsa-auto]') && document.querySelectorAll('#zsa-auto-host [data-slap-rail]').length === 25);
      check('the ZSA page shows the Autopilot with every zone on the left', pageOk);
      await pg.click('#zsa-auto-host [data-slap-rail="Z-NOSE"]'); await tick(300);
      check('a zone opens on "what is in it", with the picture', await pg.evaluate(() => /What is in Z-NOSE/.test(document.querySelector('#zsa-auto-host').textContent) && document.querySelectorAll('#zsa-auto-host svg').length >= 2));
      await pg.click('#zsa-auto-host .slap-nav .slap-btn.p'); await tick(300);
      const q1 = await pg.evaluate(() => ({ qs: document.querySelectorAll('#zsa-auto-host .slap-q').length, opts: document.querySelectorAll('#zsa-auto-host .slap-opt').length, nextDisabled: (() => { const b = [...document.querySelectorAll('#zsa-auto-host .slap-nav .slap-btn.p')].pop(); return !!(b && b.disabled && getComputedStyle(b).opacity < 0.9); })() }));
      check('one question on the screen, its answers as big buttons, and Next waits for an answer (shown greyed)', q1.qs === 1 && q1.opts >= 2 && q1.nextDisabled, JSON.stringify(q1));
      await pg.click('#zsa-auto-host .slap-opt >> nth=0'); await tick(300);
      const q2 = await pg.evaluate(() => ({ picked: !!document.querySelector('#zsa-auto-host .slap-opt.picked'), next: (() => { const b = [...document.querySelectorAll('#zsa-auto-host .slap-nav .slap-btn.p')].pop(); return b && !b.disabled; })() }));
      check('a click on an answer picks it and Next becomes available', q2.picked && q2.next, JSON.stringify(q2));

      console.log('\n[P] the PRA Autopilot');
      const P1 = await pg.evaluate(() => { const r = SLPraAuto.compute(); return { keys: r.risks.map((k) => k.key), kinds: [...new Set(r.risks.map((k) => k.kind))].sort(), tireLines: r.risks.filter((k) => k.kind === 'TIRE').some((k) => k.questions.some((q) => q.rule === 'LINES' && /H-A-0\d/.test(q.text) && /H-B-0\d/.test(q.text))), says: r.risks.every((k) => k.questions.every((q) => q.options.every((o) => o.impact && o.status))), vouch: r.risks.some((k) => k.questions.some((q) => q.id === 'rotor:fragments' || q.options.some((o) => o.id === 'chance'))), r2: { ready: r.byKey['rotor-2'].inputsReady, q: r.byKey['rotor-2'].questions.length, st: SLPraAuto.riskStatus(r.byKey['rotor-2']) } }; });
      check('the risks on the model: four engine rotor bursts, tire burst, the fires, bird strike, lightning', ['rotor-1', 'rotor-2', 'rotor-3', 'rotor-4', 'bird', 'lightning'].every((k) => P1.keys.includes(k)) && JSON.stringify(P1.kinds) === JSON.stringify(['BIRD', 'FIRE', 'LIGHT', 'ROTOR', 'TIRE']), JSON.stringify(P1));
      check('no question asks the engineer to vouch for a number the tool can work out (no "which fragments", no "the chance is within")', !P1.vouch);
      check('a rotor burst starts with its disc numbers: nothing asked and nothing signed before they are in', P1.r2.ready === false && P1.r2.q === 0 && P1.r2.st.state === 'todo' && P1.r2.st.inputs === true, JSON.stringify(P1.r2));
      check('a tire burst that can cut both hydraulic lanes (A and B) is asked about', P1.tireLines);
      check('every PRA answer says what it changes', P1.says);
      // the inputs screen, by clicking: the numbers from the CAD model (and the demo's assumptions), then the calculation
      await pg.evaluate(() => switchTab('pra')); await tick(1200);
      await pg.click('#pra-auto-host [data-slap-rail="rotor-2"]'); await tick(400);
      const I = await pg.evaluate(() => ({ fields: [...document.querySelectorAll('#pra-auto-host [data-pra-in]')].map((e) => e.getAttribute('data-pra-in')), dia: (document.querySelector('[data-pra-in="0:dia"]') || {}).value, mass: (document.querySelector('[data-pra-in="0:mass"]') || {}).value, demo: /demo assumption/.test(document.querySelector('#pra-auto-host').textContent) }));
      check('the inputs screen shows each disc: position, diameter, blade length, fragment width, mass, redline, spin direction', ['0:cx', '0:dia', '0:blade', '0:width', '0:mass', '0:rpm', '0:rot', '1:dia'].every((f) => I.fields.includes(f)) && Number(I.dia) > 0, JSON.stringify(I));
      check('...the demo\'s mass and speed are filled and marked as demo assumptions', Number(I.mass) > 0 && I.demo, JSON.stringify(I));
      await pg.fill('[data-pra-in="0:mass"]', ''); await pg.click('#pra-auto-host [data-pra-save="rotor-2"]'); await tick(300);
      check('a missing mass is refused in plain words, and nothing is worked out', await pg.evaluate(() => /Enter the disc mass/.test(document.querySelector('#pra-auto-host').textContent) && !SLPraAuto.compute().byKey['rotor-2'].inputsReady));
      await pg.fill('[data-pra-in="0:mass"]', '450'); await pg.click('#pra-auto-host [data-pra-save="rotor-2"]'); await tick(600);
      const C1 = await pg.evaluate(() => { const r = SLPraAuto.compute().byKey['rotor-2']; const g = r.calc.groups; return { ready: r.inputsReady, rotors: r.calc.rotors, statuses: Object.keys(g).map((k) => g[k].status), withNumbers: Object.keys(g).every((k) => Object.keys(g[k].models).length >= 3 && Object.values(g[k].models).every((m) => typeof m.share === 'number')), asked: r.questions.map((q) => q.rule + ':' + (r.calc.groups['u:' + (q.marks || []).map(() => '').join('')] ? '' : '') + q.why.slice(0, 40)), askedFor: r.questions.length, failOrSmall: Object.keys(g).filter((k) => g[k].status === 'fails' || g[k].status === 'small').length, stored: (projectConfig.praRotors || []).filter((x) => /^ap-/.test(x.id)).length, confirmed: (projectConfig.praRotors || []).filter((x) => /^ap-/.test(x.id)).every((x) => x.confirmedBy && x.confirms && x.confirms.mass && x.confirms.rpm && x.confirms.axialWidth), page: /The AC 20-128A calculation/.test(document.querySelector('#pra-auto-host').textContent) }; });
      check('the numbers go into Safety Lab\'s rotor store, confirmed with who (the PRA panel sees the same rotors)', C1.stored >= 2 && C1.confirmed, JSON.stringify(C1));
      check('the AC 20-128A sweep runs for both discs, and every lane set gets its share per fragment type', C1.ready && C1.rotors.length === 2 && C1.rotors.every((x) => x.ok) && C1.statuses.length >= 3 && C1.withNumbers, JSON.stringify(C1));
      check('only lanes over the limit (or reached together by small pieces) are asked about; the rest are answered by the numbers', C1.askedFor === C1.failOrSmall && C1.statuses.some((x) => x === 'meets' || x === 'clear'), JSON.stringify(C1));
      check('the page shows the calculation, lane by lane', C1.page);
      const P4 = await pg.evaluate(() => { SLPraAuto.materialize('PRA-001'); const row = praData.find((r) => r.praId === 'PRA-001'); return { n: praData.filter((r) => r.praId === 'PRA-001').length, zones: row.affectedZones, typed: row.praTyped && row.praTyped.desc, mit: row.mitigation, sys: row.systems, desc: row.desc, calc: row.praCalc && row.praCalc['rotor-2'] }; });
      check('the PRA-001 row is adopted in place, with the numbers: one row, zones and systems from the model, the calculation lane by lane', P4.n === 1 && P4.zones.includes('Z-NAC2') && /Electrical Power System/.test(P4.sys) && /AC 20-128A, .*%/.test(P4.desc) && Array.isArray(P4.calc) && P4.calc.length >= 3, JSON.stringify(P4).slice(0, 400));
      check('...lanes within the limit are recorded as such, with no question', /Within AC 20-128A for /.test(P4.mit) || P4.calc.every((c) => c.status !== 'meets'), P4.mit);
      check('...what it said before is kept (praTyped)', /four rotor-burst planes/.test(P4.typed || ''), P4.typed);
      const A1 = await pg.evaluate(() => { const n0 = SLPraAuto.compute().byKey['rotor-2'].frags.length; SLPraAuto.ui.alternate(true); const r = SLPraAuto.compute().byKey['rotor-2']; const out = { n0, n1: r.frags.length, models: Object.values(r.calc.groups)[0] ? Object.keys(Object.values(r.calc.groups)[0].models) : [] }; SLPraAuto.ui.alternate(false); return out; });
      check('ticking the alternative model adds it to the calculation', A1.n1 === A1.n0 + 1 && A1.models.includes('alternate'), JSON.stringify(A1));

      console.log('\n[R] the reports');
      const R1 = await pg.evaluate(() => { window.__opened = []; SLZsaAuto.report(); SLPraAuto.report(); return window.__opened.map((h) => h.length + ':' + /Zonal Safety Analysis|Particular Risk Assessment/.exec(h)); });
      check('the ZSA and PRA reports are written', R1.length === 2 && /Zonal/.test(R1[0]) && /Particular/.test(R1[1]), JSON.stringify(R1));
      check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } finally { await b.close(); srv.close(); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (mutation: ' + MUT + ')' : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
