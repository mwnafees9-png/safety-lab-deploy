#!/usr/bin/env node
/*
 * Regression (9 Nov 2026): the PRA report tells the whole story (pra_autopilot.js 2.3, cca_report.js 1.4, cad_shots.js 1.1).
 *
 * Waqas, 9 Nov 2026: "I want the PRA reports to explain their methods their basis, the math, where we have multiple impact
 * zones, we should have 1 image per cone like in the rotor burst PRA 1 per engine and the cones be different distinct
 * colors, show the calculations, tell the whole story please"; "yeah needs to look clean and legible".
 * Pinned:
 *   [S] static: versions and pins (file header = VERSION = index.html), the script order (cad_page.js, pra_panel.js,
 *       zonal_exchange.js, cad_shots.js), no em dashes and no British spellings in the new report text.
 *   [A] the real app, Aeolus HL-1 demo with its 3D model, disc numbers entered for every engine:
 *       A1 every PRA section reads: the risk and its question, Method, Basis (a table with the rule, its paragraph and the
 *          pass criterion), Calculations, Results, the choices, retention, Conclusion.
 *       A2 the method says how the danger area is built and how a part is judged reached, for its kind of risk.
 *       A3 rotor burst: one calculations part per engine (4.1 to 4.4) with the disc numbers, the burst bands and the hazard
 *          ratio of each set of lanes against the one-in-twenty and one-in-forty limits, and one worked example per engine.
 *       A4 the hazard ratios in the report are the ones the PRA panel's release angle sweep gives (SLPraModels.sweep, worked
 *          again here from its intervals): no second source of truth.
 *       A5 one 3D picture per danger source, ticked by default: four engines, four pictures for PRA-001, each in its own
 *          color (its pixels are its color, not another engine's), captioned with the source and its color; four bogies,
 *          four pictures for PRA-003.
 *       A6 a risk with no geometric model says the assessment is qualitative and why.
 *       A7 Word: the PRA-001 export carries the method, the basis, the formulas, the hazard ratio tables, the worked
 *          examples and the four pictures (as images in the .docx).
 *       A8 the report prose has no live counts or status words, no em dashes, American spelling.
 * MUTATION PROOFS: SL_PRA_STORY_MUTATE=nomethod | nobasis | ratio | noworked | onecolor | nosrc | nodefault | noword.
 *   Each turns this suite red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_pra_story_20261109.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 900) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_PRA_STORY_MUTATE || '';
const MUTS = {
  nomethod:  ['pra_autopilot.js', "        b = b.concat(methodBlocks(row, rs));\n", "\n"],
  nobasis:   ['pra_autopilot.js', "rows: basisRows(row, rs), lead:", "rows: [], lead:"],
  ratio:     ['pra_autopilot.js', "{ deg += iv.width; ivs.push([iv.from, iv.to]); }", "{ deg += iv.width / 2; ivs.push([iv.from, iv.to]); }"],
  noworked:  ['pra_autopilot.js', "                b.push(P(rotorWorked(r, discName), 'inputs:' + r.key));\n", "\n"],
  onecolor:  ['cad_shots.js', "var c = PALETTE[out.length % PALETTE.length];", "var c = PALETTE[0];"],
  nosrc:     ['cad_shots.js', "var out = srcs.map(function (x) { return sourceView(x, MB, unitBox); });", "var out = [];"],
  nodefault: ['cca_report.js', "var d = shotViews(id).filter(function (v) { return v && v.default; }).map(function (v) { return v.id; });", "var d = [];"],
  noword:    ['cca_report.js', "if (b.k === 'shot') return { k: 'img', caption: b.title, dataUrl: b.png, w: b.w, h: b.h, shot: true };", "if (b.k === 'shot') return { k: 'p', text: '' };"]
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) {
  let b = fs.readFileSync(path.join(SITE, name), 'utf8');
  if (MUTS[MUT] && MUTS[MUT][0] === name) { if (b.indexOf(MUTS[MUT][1]) < 0) { console.error('mutation anchor not found: ' + MUT); process.exit(3); } b = b.replace(MUTS[MUT][1], MUTS[MUT][2]); }
  return b;
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const BRIT = /\b(colour|colours|metre|metres|centre|centres|behaviour|analyse|analysed|modelling|labelled|grey|favour|defence|licence|organise|organised|utilise|tyre|tyres|aluminium|programme)\b/i;

(async () => {
  console.log('regression_pra_story_20261109' + (MUT ? ' [mutation ' + MUT + ']' : ''));
  console.log('\n[S] static');
  const PA = src('pra_autopilot.js'), CR = src('cca_report.js'), CS = src('cad_shots.js'), IDX = src('index.html');
  const ver = (s, rx) => ((s.match(rx) || [])[1]);
  const pins = [['pra_autopilot.js', PA, /SLPraAuto v(\d+\.\d+)/], ['cca_report.js', CR, /SLCcaReport v(\d+\.\d+)/], ['cad_shots.js', CS, /cad_shots\.js, v(\d+\.\d+)/]];
  check('S1 pra_autopilot 2.3, cca_report 1.4, cad_shots 1.1: file header, VERSION and index.html pin agree', pins.every(([n, s, rx]) => { const v = ver(s, rx); return v && ver(s, /VERSION = '(\d+\.\d+)'/) === v && IDX.indexOf('<script src="' + n + '?v=' + v + '" defer></script>') > 0; }) && ver(PA, /VERSION = '(\d+\.\d+)'/) === '2.3' && ver(CR, /VERSION = '(\d+\.\d+)'/) === '1.4' && ver(CS, /VERSION = '(\d+\.\d+)'/) === '1.1', JSON.stringify(pins.map(([n, s, rx]) => [n, ver(s, rx), ver(s, /VERSION = '(\d+\.\d+)'/)])));
  const io = (n) => IDX.indexOf('<script src="' + n + '?v=');
  check('S2 script order kept: cad_page.js, then pra_panel.js, then zonal_exchange.js, then cad_shots.js', io('cad_page.js') > 0 && io('cad_page.js') < io('pra_panel.js') && io('pra_panel.js') < io('zonal_exchange.js') && io('zonal_exchange.js') < io('cad_shots.js'));
  const story = PA.slice(PA.indexOf('// ==== v2.3'), PA.indexOf('function section(row, ctx)'));
  check('S3 the new report text has no em dashes and no British spellings', story.length > 10000 && story.indexOf('—') < 0 && !BRIT.test(story) && CS.indexOf('—') < 0 && !BRIT.test(CS.replace(/HIGHLIGHT|colorblind/g, '')), (story.match(BRIT) || [])[0]);

  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) { console.log('  SKIP  Playwright is not installed here; [A] needs the real app'); }
  else {
    console.log('\n[A] the real app on the Aeolus HL-1 demo with its 3D model');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
      let b; try { if (fs.statSync(f).isDirectory()) throw 0; b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
      const name = path.relative(SITE, f).split(path.sep).join('/'); if (MUTS[MUT] && MUTS[MUT][0] === name) b = Buffer.from(src(name));
      r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const b = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }), errs = [];
    try {
      const pg = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
      pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); pg.on('dialog', (d) => d.dismiss().catch(() => {}));
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
      await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
      await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
      await pg.evaluate(() => window.loadHL1Demo()); await tick(9000);
      await pg.evaluate(() => switchTab('cad'));
      for (let i = 0; i < 60; i++) { await tick(1000); if (await pg.evaluate(() => { const v = window.SLCadPage && SLCadPage.state.viewer; return !!(v && v.scene3); })) break; }
      await pg.evaluate(() => switchTab('pra')); await tick(2500);
      // the disc numbers for every engine, as the engineer enters them on the inputs screen (the CAD values, checked)
      await pg.evaluate(() => { const res = SLPraAuto.compute(); res.risks.filter((r) => r.kind === 'ROTOR').forEach((r) => r.discs.forEach((d) => SLPraAuto.saveRotor(d, Object.assign({}, SLPraAuto.prefill(d), { engine: r.engine }), 'Test engineer'))); SLPraAuto.reset(); SLCcaReport.get('pra').render(); });
      await tick(800);

      const A = await pg.evaluate(() => {
        const R = SLCcaReport.get('pra'), bl = R.doc(), rows = praData.filter((r) => r && r.praId), per = {};
        rows.forEach((r) => { const s = bl.filter((x) => x.sec === r.praId); per[r.praId] = { parts: s.filter((x) => x.k === 'part').map((x) => x.text), ps: s.filter((x) => x.k === 'p').map((x) => x.text), tables: s.filter((x) => x.k === 'table').map((x) => ({ name: x.name, title: x.title, rows: x.rows })) }; });
        return { rows: rows.map((r) => r.praId), per };
      });
      const want = ['1. The risk and the question it answers', '2. Method', '3. Basis', '4. Calculations', '5. Results: what it reaches', '6. Results: what is lost', '7. The choices made', '8. Retention of catastrophic outcomes', '9. Conclusion'];
      const topParts = (id) => A.per[id].parts.filter((t) => /^\d\. /.test(t));
      check('A1 every section reads in story order: the risk and its question, Method, Basis, Calculations, Results, the choices, retention, Conclusion', A.rows.length >= 15 && A.rows.every((id) => JSON.stringify(topParts(id)) === JSON.stringify(want) && A.per[id].ps.some((t) => /^\*\*The question\.\*\* /.test(t))), A.rows.filter((id) => JSON.stringify(topParts(id)) !== JSON.stringify(want)).map((id) => id + ':' + topParts(id).join('|')).join(' ; '));
      const basisOk = (id) => { const t = A.per[id].tables.find((x) => /^basis-/.test(x.name)); return t && t.rows.length >= 2 && t.rows.every((r) => r.Step && r['Rule or guidance'] && r['Pass criterion']); };
      check('A1b every section has its basis table: each step with its rule or guidance and the pass criterion', A.rows.every(basisOk), A.rows.filter((id) => !basisOk(id)).join(','));
      const has = (id, rx) => A.per[id].ps.some((t) => rx.test(t));
      check('A2 the method says how the danger area is built and how a part is judged reached, by kind (rotor: discs, spread, range, spin; tire: bogie volumes; bird: forward-facing surfaces; lightning: attachment zones)', A.rows.every((id) => has(id, /^\*\*How the danger area is built\.\*\*/) && has(id, /^\*\*How a part is judged to be reached\.\*\*/)) && has('PRA-001', /spread angle/) && has('PRA-001', /direction of spin/) && has('PRA-001', /27 points/) && has('PRA-003', /bogie/) && has('PRA-006', /forward-facing surfaces/) && has('PRA-007', /attachment zones/));
      const b1 = A.per['PRA-001'].tables.find((x) => /^basis-/.test(x.name)) || { rows: [] };
      check('A2b the rotor burst basis gives the one-in-twenty and one-in-forty criteria with their paragraphs, in our words', b1.rows.some((r) => /10c\(3\)\(i\)/.test(r['Rule or guidance']) && /1 in 20/.test(r['Pass criterion'])) && b1.rows.some((r) => /10c\(3\)\(ii\)/.test(r['Rule or guidance']) && /1 in 40/.test(r['Pass criterion'])) && b1.rows.some((r) => /25\.903\(d\)\(1\)/.test(r['Rule or guidance'])), JSON.stringify(b1.rows).slice(0, 500));
      const p1 = A.per['PRA-001'], engParts = p1.parts.filter((t) => /^4\.\d Engine \d rotor burst$/.test(t));
      const engTables = [1, 2, 3, 4].map((e) => ({ e, discs: p1.tables.find((t) => t.name === 'discs-rotor-' + e), bands: p1.tables.find((t) => t.name === 'bands-rotor-' + e), calc: p1.tables.find((t) => t.name === 'calc-rotor-' + e), worked: p1.ps.find((t) => new RegExp('^\\*\\*Worked example \\(engine ' + e + '[,)]').test(t)) }));
      check('A3 rotor burst: one calculations part per engine (4.1 to 4.4), each with the disc numbers, the burst bands, the hazard ratio of each set of lanes against its limit, and one worked example', engParts.length === 4 && engTables.every((x) => x.discs && x.discs.rows.some((r) => /^Center of the disc/.test(r.Quantity)) && x.discs.rows.some((r) => /^Spin direction/.test(r.Quantity)) && x.bands && x.bands.rows.length >= 3 && x.bands.rows.every((r) => /^±\d+° \(/.test(r['Spread (rule)']) && /wide$/.test(r.Band)) && x.calc && x.calc.rows.length >= 1 && Object.keys(x.calc.rows[0]).some((k) => /limit 1 in 20/.test(k)) && Object.keys(x.calc.rows[0]).some((k) => /limit 1 in 40/.test(k)) && x.worked), JSON.stringify(engTables.map((x) => ({ e: x.e, d: !!x.discs, b: !!x.bands, c: !!x.calc, w: !!x.worked }))) + ' parts=' + engParts.join('|'));
      check('A3b each worked example works the hazard ratio in symbols against its limit (H = deg / 360°, the 1 in 20 or 1 in 40 limit, within or over)', engTables.every((x) => x.worked && (/H = [\d.]+° \/ 360° = [\d.]+ \(/.test(x.worked) && /(1 in 20|1 in 40|para 10c\(5\))/.test(x.worked) && /(within the limit|over the limit|design precautions)/.test(x.worked) || /every hazard ratio is 0%/.test(x.worked))), engTables.map((x) => (x.worked || '').slice(0, 300)).join(' || '));

      // A4: the numbers in the report equal the sweep of the PRA panel (worked again here from its intervals)
      const A4 = await pg.evaluate(() => {
        const share = (x) => { if (!(x > 0)) return '0%'; const p = x * 100; return (p < 0.1 ? p.toFixed(3) : p < 1 ? p.toFixed(2) : p.toFixed(1)) + '%'; };
        const R = SLCcaReport.get('pra'), bl = R.doc({ only: 'PRA-001' }), res = SLPraAuto.compute(), out = [], bad = [];
        res.risks.filter((r) => r.kind === 'ROTOR').forEach((r) => {
          const t = bl.find((x) => x.k === 'table' && x.name === 'calc-' + r.key); if (!t) { bad.push(r.key + ': no table'); return; }
          const only = {}; r.groups.forEach((g) => g.members.forEach((m) => m.forEach((p) => { only[String(p)] = 1; })));
          const models = r.frags.map((f) => f.id), sw = r.discs.map((d) => SLPraModels.sweep(SLPraAuto.rotorId(d), { models, only }));
          r.groups.forEach((g) => {
            const row = t.rows.find((x) => x['Lanes of one job'] === g.names.join(', ')); if (!row) { bad.push(r.key + ': no row ' + g.names.join(', ')); return; }
            const cols = Object.keys(row).slice(1, 1 + models.length);
            models.forEach((mk, i) => {
              let best = 0; sw.forEach((s) => { const m = s && s.ok && s.models.find((x) => x.model === mk); if (!m) return; let deg = 0; (m.intervals || []).forEach((iv) => { const set = {}; (iv.pids || []).forEach((p) => { set[String(p)] = 1; }); if (g.members.every((mem) => mem.some((p) => set[String(p)]))) deg += iv.width; }); best = Math.max(best, deg / 360); });
              const cell = String(row[cols[i]]), ok = cell.indexOf(share(best)) === 0; out.push({ k: r.key, g: g.names.join(', '), mk, want: share(best), cell }); if (!ok) bad.push(r.key + ' ' + mk + ' ' + g.names.join(', ') + ': report ' + cell + ' vs sweep ' + share(best));
            });
          });
        });
        return { n: out.length, nonzero: out.filter((x) => x.want !== '0%').length, bad, sample: out.filter((x) => x.want !== '0%').slice(0, 3) };
      });
      check('A4 every hazard ratio in the report equals the share of release angles the PRA panel\'s sweep gives for that set of lanes (worst disc), none worked out a second way', A4.n >= 12 && A4.nonzero >= 3 && A4.bad.length === 0, JSON.stringify(A4).slice(0, 700));

      // A5: the pictures
      await pg.addScriptTag({ content: `window.__hueStats = async function (dataUrl, palette) {
          const img = new Image(); await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = dataUrl; });
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data, hue = (R, G, B) => { const mx = Math.max(R, G, B), mn = Math.min(R, G, B), df = mx - mn; if (!df) return 0; let h = mx === R ? ((G - B) / df) % 6 : mx === G ? (B - R) / df + 2 : (R - G) / df + 4; h *= 60; return h < 0 ? h + 360 : h; };
          const ph = palette.map((hx) => { const n = parseInt(hx.slice(1), 16); return hue(n >> 16 & 255, n >> 8 & 255, n & 255); }), cnt = palette.map(() => 0); let n = 0;
          for (let i = 0; i < d.length; i += 4) { const R = d[i], G = d[i + 1], B = d[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B); n++; if (mx - mn < 40) continue; const h = hue(R, G, B); let bi = 0, bd = 999; ph.forEach((p, j) => { const dd = Math.min(Math.abs(h - p), 360 - Math.abs(h - p)); if (dd < bd) { bd = dd; bi = j; } }); if (bd < 14) cnt[bi]++; }
          return { n, frac: cnt.map((x) => x / n) };
        };` });
      const shotsOf = async (id, n) => {
        await pg.evaluate((id) => SLCcaReport.get('pra').setTab(id), id); await tick(1500);
        for (let i = 0; i < 120; i++) { await tick(1000); if (await pg.evaluate((n) => document.querySelectorAll('#ccr-host-pra [data-ccshotfig]').length >= n && !document.querySelector('#ccr-host-pra [data-ccshot-pend]'), n)) break; }
        return pg.evaluate(async (id) => {
          const pal = SLCadShots.PALETTE.slice(0, 4).map((c) => c.hex);
          const figs = [...document.querySelectorAll('#ccr-host-pra [data-ccshotfig]')];
          const out = []; for (const f of figs) { const src = f.querySelector('img').src, color = f.getAttribute('data-ccshotcolor'); out.push({ of: f.getAttribute('data-ccshotfig'), color, cap: (f.nextElementSibling || {}).textContent || '', len: src.length, st: await window.__hueStats(src, pal), own: pal.indexOf(color) }); }
          return { figs: out, kept: JSON.stringify(((projectConfig.ccaReports.pra || {}).shots || {})[id] || null), pal };
        }, id);
      };
      const S1 = await shotsOf('PRA-001', 4);
      const colorOk = (f) => f.own >= 0 && f.st.frac[f.own] > 0.003 && f.st.frac.every((x, j) => j === f.own || x < f.st.frac[f.own] / 4);
      check('A5 PRA-001: one picture per engine (four), ticked by default and kept in the project picks', S1.figs.length === 4 && S1.figs.every((f, i) => f.of === 'PRA-001|src:rotor-' + (i + 1) + ':engine' && f.len > 20000) && S1.kept === JSON.stringify([1, 2, 3, 4].map((e) => 'src:rotor-' + e + ':engine')), JSON.stringify({ figs: S1.figs.map((f) => f.of), kept: S1.kept }));
      check('A5b ...each engine in a different color, and its picture\'s colored pixels are its own color (not another engine\'s)', new Set(S1.figs.map((f) => f.color)).size === 4 && S1.figs.every(colorOk), JSON.stringify(S1.figs.map((f) => ({ of: f.of, color: f.color, frac: f.st.frac.map((x) => +x.toFixed(4)) }))));
      check('A5c ...captioned with the engine and its color name', S1.figs.every((f, i) => new RegExp('^Figure \\d+: Engine ' + (i + 1) + ' rotor burst, seen from above \\(nose to the left\\): its burst bands in ' + ['red', 'blue', 'teal', 'purple'][i] + ' ').test(f.cap)), S1.figs.map((f) => f.cap.slice(0, 120)).join(' | '));
      const S3 = await shotsOf('PRA-003', 4);
      check('A5d PRA-003 tire burst: one picture per bogie (four), each in its own color, captioned with the bogie and its color', S3.figs.length === 4 && new Set(S3.figs.map((f) => f.color)).size === 4 && S3.figs.every(colorOk) && S3.figs.every((f) => /^Figure \d+: Tire burst, main bogie (left|right) (forward|aft): its danger volume in (red|blue|teal|purple) /.test(f.cap)), JSON.stringify(S3.figs.map((f) => ({ of: f.of, cap: f.cap.slice(0, 90), frac: f.st.frac.map((x) => +x.toFixed(4)) }))));
      const noGeo = A.rows.filter((id) => A.per[id].ps.some((t) => /^\*\*No danger area is computed for this risk\.\*\*/.test(t)));
      check('A6 a risk with no geometric model says the assessment is qualitative and why', noGeo.length >= 3 && noGeo.every((id) => A.per[id].ps.some((t) => /qualitative/.test(t))), noGeo.join(','));

      // A7: Word
      const W = await pg.evaluate(async () => {
        await SLCcaReport.get('pra').setTab('PRA-001');
        const R = SLCcaReport.get('pra'), m = R.model({ only: 'PRA-001' }), lib = await _loadDocxLib();
        for (const x of m.blocks.filter((x) => x.k === 'img' && x.svg)) x.dataUrl = await SLFtaPrint.png({ svg: x.svg, w: x.w, h: x.h }, 1);
        const blob = await SLReportWriter.docx(m, lib), buf = new Uint8Array(await blob.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        return { b64: btoa(bin), titles: m.blocks.filter((x) => x.k === 'table').map((x) => x.title), shots: m.blocks.filter((x) => x.k === 'img' && x.shot).map((x) => x.caption) };
      });
      let docT = '', media = 0; try { const tmp = path.join(os.tmpdir(), 'pra_story_' + process.pid + '.docx'); fs.writeFileSync(tmp, Buffer.from(W.b64, 'base64')); docT = cp.execFileSync('unzip', ['-p', tmp, 'word/document.xml'], { maxBuffer: 64 * 1024 * 1024 }).toString().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); media = cp.execFileSync('unzip', ['-l', tmp]).toString().split('\n').filter((l) => /word\/media\/.*\.png/.test(l)).length; fs.unlinkSync(tmp); } catch (e) { docT = 'unzip failed: ' + e.message; }
      check('A7 Word (PRA-001): the method, the basis table, the formulas, the disc numbers, bands and hazard ratio tables of each engine and the worked examples', /How the danger area is built/.test(docT) && /Pass criterion/.test(docT) && /1 in 20/.test(docT) && /The formulas the rotor burst calculations use/.test(docT) && [1, 2, 3, 4].every((e) => W.titles.indexOf('Engine ' + e + ': the hazard ratio for each set of lanes of one job') >= 0 && W.titles.indexOf('Engine ' + e + ': the disc numbers') >= 0 && W.titles.indexOf('Engine ' + e + ': the burst bands') >= 0) && /Worked example \(engine 1/.test(docT) && /Hazard ratio H = /.test(docT), JSON.stringify({ titles: W.titles.slice(0, 12), doc: docT.slice(0, 200) }));
      check('A7b ...and the four per-engine pictures as images in the file', W.shots.length >= 4 && [1, 2, 3, 4].every((e) => W.shots.some((c) => c.indexOf('Engine ' + e + ' rotor burst') === 0)) && media >= 4, JSON.stringify({ shots: W.shots.map((c) => c.slice(0, 60)), media }));

      // A8: house rules on the prose
      const prose = A.rows.map((id) => A.per[id].ps.join('\n')).join('\n');
      const counts = (prose.match(/\b\d+ (questions|records|rows|sections|particular risks)\b|\banswered\b|\bsigned\b|\b\d+ of \d+ (answered|done|signed)/g) || []);
      const cells = A.rows.map((id) => JSON.stringify(A.per[id].tables.map((t) => [t.title, t.rows]))).join('\n');
      check('A8 the report prose has no live counts or status words, no em dashes (prose or tables, system names included), American spelling', counts.length === 0 && prose.indexOf('—') < 0 && cells.indexOf('—') < 0 && !BRIT.test(prose), JSON.stringify({ counts: counts.slice(0, 5), brit: (prose.match(BRIT) || [])[0], dashInTables: (cells.match(/.{40}—.{20}/) || [])[0] }));
      check('A9 no page errors', errs.length === 0, JSON.stringify(errs));
    } finally { await b.close(); srv.close(); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (mutation: ' + MUT + ')' : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
