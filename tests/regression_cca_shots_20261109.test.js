/* regression_cca_shots_20261109.test.js: 3D model pictures in the PRA and ZSA reports, picked by the engineer
 * (cca_report.js 1.3 spec.shots, pra_autopilot.js 2.2, zsa_autopilot.js 1.5, on SLCadShots from cad_shots.js 1.0).
 * 9 Nov 2026 (cca_report 1.4, pra_autopilot 2.3, cad_shots 1.1), asked for: "1 image per cone like in the rotor burst PRA 1
 *   per engine and the cones be different distinct colors": the per-source pictures are ticked the first time a section
 *   is shown (kept in the picks), and the picker still lets the engineer untick them or add the other views.
 *
 * Waqas, 8 Nov 2026: "I want the images in the reports to be relevant screenshots of the 3D-Model", then, confirmed:
 *   the Autopilot asks the engineer which views go in (live thumbnails, only the ticked ones reach the report and Word).
 * MUTATION PROOFS: SL_SHOTPK_MUTATE=noblocks (ticked pictures never reach the report), =noword (the Word model drops
 *   them), =nosave (a tick is not kept in the project), =nopicker (the question is never drawn) must fail.
 * Run: node tests/regression_cca_shots_20261109.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_SHOTPK_MUTATE || '';
const MUTS = {
  noblocks: ['cca_report.js', "            var picks = shotPicks(id); if (!picks || !picks.length) return [];", "            var picks = null; if (!picks || !picks.length) return [];"],
  noword:   ['cca_report.js', "if (b.k === 'shot') return { k: 'img', caption: b.title, dataUrl: b.png, w: b.w, h: b.h, shot: true };", "if (b.k === 'shot') return { k: 'p', text: '' };"],
  nosave:   ['cca_report.js', "            s.shots[id] = a; save();", "            save();"],
  nopicker: ['cca_report.js', "var left = leftHtml(cur) + (shotSec ? shotPickerHtml(String(shotSec)) : '')", "var left = leftHtml(cur) + ''"]
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) {
  let b = fs.readFileSync(path.join(SITE, name), 'utf8');
  if (MUTS[MUT] && MUTS[MUT][0] === name) { if (b.indexOf(MUTS[MUT][1]) < 0) { console.error('mutation anchor not found: ' + MUT); process.exit(3); } b = b.replace(MUTS[MUT][1], MUTS[MUT][2]); }
  return b;
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  console.log('regression_cca_shots_20261109' + (MUT ? ' [mutation ' + MUT + ']' : ''));
  console.log('\n[S] static');
  const CR = src('cca_report.js'), PA = src('pra_autopilot.js'), ZA = src('zsa_autopilot.js'), IDX = src('index.html');
  const vOf = (t) => ((/VERSION = '(\d+\.\d+)'/.exec(t) || [])[1] || '0');
  const ge = (v, m) => { const a = v.split('.').map(Number), b = m.split('.').map(Number); return a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]); };
  check('S1 cca_report.js 1.3 or later, pra_autopilot.js 2.2 or later and zsa_autopilot.js 1.5 or later, each pinned at its own version in index.html', ge(vOf(CR), '1.3') && IDX.indexOf('cca_report.js?v=' + vOf(CR) + '"') > 0 && ge(vOf(PA), '2.2') && IDX.indexOf('pra_autopilot.js?v=' + vOf(PA) + '"') > 0 && ge(vOf(ZA), '1.5') && IDX.indexOf('zsa_autopilot.js?v=' + vOf(ZA) + '"') > 0);
  check('S2 the PRA and the ZSA give the frame their 3D subjects; no em dashes in the new text', /shots: function \(id\)/.test(PA) && /shots: function \(id\)/.test(ZA) && /shotsFocus/.test(ZA) && (CR.match(/Pictures for the report[\s\S]{0,2000}/) || [''])[0].indexOf('—') < 0);
  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) { console.log('  SKIP  Playwright is not installed here; [B] needs the real app'); }
  else {
    console.log('\n[B] the real app on the Aeolus HL-1 demo with its 3D model');
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
      await pg.evaluate(() => SLCcaReport.get('pra').setTab('PRA-001')); await tick(1500);
      const waitThumbs = async () => { for (let i = 0; i < 40; i++) { await tick(1000); const [n, t] = await pg.evaluate(() => [document.querySelectorAll('[data-ccshot-thumb]:not([data-pending])').length, document.querySelectorAll('[data-ccshot-thumb]').length]); if (t && n === t) return [n, t]; } return await pg.evaluate(() => [document.querySelectorAll('[data-ccshot-thumb]:not([data-pending])').length, document.querySelectorAll('[data-ccshot-thumb]').length]); };
      const q = await pg.evaluate(() => { const x = document.querySelector('[data-ccshots="PRA-001"]'); return x ? { text: x.querySelector('.ccr-qt').textContent, gap: x.classList.contains('gap') } : null; });
      check('B1 the PRA-001 tab asks "Pictures for the report"; the one picture per engine is ticked to start with (cca_report 1.4), so it is not marked unanswered', !!q && q.text === 'Pictures for the report' && !q.gap, JSON.stringify(q));
      const [nT, tT] = await waitThumbs();
      check('B2 every view offered for the rotor burst gets a live thumbnail from the 3D model (one per engine, then side, above, front, close-up)', tT >= 8 && nT === tT, nT + '/' + tT);
      const vids = await pg.evaluate(() => [...document.querySelectorAll('[data-ccshot]')].map((x) => x.getAttribute('data-ccshot')));
      const waitFigs = async (n) => { for (let i = 0; i < 40; i++) { await tick(1000); if (await pg.evaluate((n) => document.querySelectorAll('#ccr-host-pra [data-ccshotfig]').length === n && !document.querySelector('#ccr-host-pra [data-ccshot-pend]'), n)) return; } };
      await waitFigs(4);
      const figs0 = await pg.evaluate(() => [...document.querySelectorAll('#ccr-host-pra [data-ccshotfig]')].map((f) => ({ of: f.getAttribute('data-ccshotfig'), color: f.getAttribute('data-ccshotcolor'), src: (f.querySelector('img') || {}).src || '', cap: (f.nextElementSibling || {}).textContent || '' })));
      check('B3 untouched: the four per-engine pictures are in the report, ticked by default, every fragment type in its own color named in the caption', figs0.length === 4 && figs0.every((f, i) => f.of === 'PRA-001|src:rotor-' + (i + 1) + ':engine' && /^data:image\/png/.test(f.src) && f.src.length > 20000 && /^Figure \d+: Engine \d rotor burst/.test(f.cap)) && figs0.every((f) => /the one-third disc band in red, the intermediate piece band in blue and the small pieces band in teal/.test(f.cap)), JSON.stringify(figs0.map((f) => [f.of, f.color, f.src.length, f.cap.slice(0, 120)])));
      const kept0 = await pg.evaluate(() => JSON.stringify((projectConfig.ccaReports.pra.shots || {})['PRA-001'] || null));
      check('B3b the default ticks are written into the project picks (projectConfig.ccaReports.pra.shots) the first time the section is shown', kept0 === JSON.stringify(['src:rotor-1:engine', 'src:rotor-2:engine', 'src:rotor-3:engine', 'src:rotor-4:engine']), kept0);
      await pg.click('[data-ccshot="' + vids[0] + '"]'); await tick(300); await pg.click('[data-ccshot="' + vids[vids.length - 1] + '"]');
      await waitFigs(4);
      const figs = await pg.evaluate(() => [...document.querySelectorAll('#ccr-host-pra [data-ccshotfig]')].map((f) => ({ of: f.getAttribute('data-ccshotfig'), src: (f.querySelector('img') || {}).src || '', cap: (f.nextElementSibling || {}).textContent || '' })));
      check('B4 unticking engine 1 and ticking the close-up: the report holds engines 2 to 4 and the close-up as numbered figures with the real pictures', figs.length === 4 && figs.map((f) => f.of.split('|')[1]).join(',') === 'src:rotor-2:engine,src:rotor-3:engine,src:rotor-4:engine,closeup' && figs.every((f) => /^data:image\/png/.test(f.src) && f.src.length > 20000 && /^Figure \d+: /.test(f.cap)), JSON.stringify(figs.map((f) => [f.of, f.src.length, f.cap.slice(0, 100)])));
      const kept = await pg.evaluate(() => JSON.stringify((projectConfig.ccaReports.pra.shots || {})['PRA-001'] || null));
      check('B5 the ticks are kept in the project (projectConfig.ccaReports.pra.shots)', kept === JSON.stringify(['src:rotor-2:engine', 'src:rotor-3:engine', 'src:rotor-4:engine', vids[vids.length - 1].split('|')[1]]), kept);
      const wm = await pg.evaluate(async () => { const R = SLCcaReport.get('pra'); const m = R.model({ only: 'PRA-001' }); return m.blocks.filter((x) => x.k === 'img' && x.shot).map((x) => ({ cap: x.caption, n: (x.dataUrl || '').length })); });
      check('B6 the Word file carries the four pictures as images with their captions', wm.length === 4 && wm.every((x) => x.n > 20000 && x.cap), JSON.stringify(wm.map((x) => [x.n, x.cap.slice(0, 80)])));
      const full = await pg.evaluate(() => { const R = SLCcaReport.get('pra'); return R.model().blocks.filter((x) => x.k === 'img' && x.shot && /rotor burst/.test(x.caption)).length; });
      check('B7 the All risks document carries them too', full === 4, full);
      await pg.click('[data-ccshot="' + vids[vids.length - 1] + '"]'); await tick(800);
      check('B8 unticking takes the picture out of the report', await pg.evaluate(() => document.querySelectorAll('#ccr-host-pra [data-ccshotfig]').length === 3));
      await pg.click('[data-ccshot-none="PRA-001"]'); await tick(800);
      const none = await pg.evaluate(() => ({ figs: document.querySelectorAll('[data-ccshotfig]').length, kept: JSON.stringify(projectConfig.ccaReports.pra.shots['PRA-001']), gap: document.querySelector('[data-ccshots="PRA-001"]').classList.contains('gap') }));
      check('B9 "No pictures for this part" is remembered as a choice: no pictures, question answered', none.figs === 0 && none.kept === '[]' && !none.gap, JSON.stringify(none));
      const look = await pg.evaluate(() => { const c = document.querySelector('.ccr-shot'); c.focus(); const s = getComputedStyle(c); return { bgi: s.backgroundImage, mk: getComputedStyle(c.querySelector('.ccr-mk')).borderRadius }; });
      check('B10 a focused card keeps its own plain look (no app button gradient) and ticks are square boxes', look.bgi === 'none' && look.mk === '3px', JSON.stringify(look));
      // ZSA
      await pg.evaluate(() => switchTab('zsa')); await tick(2500);
      await pg.evaluate(() => SLZsaAuto.ui.zone('Z-MLGW')); await tick(1500);
      const [zn, zt] = await waitThumbs();
      check('B11 the ZSA asks the same question for the zone open beside its questions, with live thumbnails', zt >= 2 && zn === zt && await pg.evaluate(() => !!document.querySelector('[data-ccshots="Z-MLGW"]')), zn + '/' + zt);
      const zv = await pg.evaluate(() => [...document.querySelectorAll('[data-ccshot]')].map((x) => x.getAttribute('data-ccshot')));
      if (zv.length) await pg.click('[data-ccshot="' + zv[zv.length - 1] + '"]');
      for (let i = 0; i < 20; i++) { await tick(1000); if (await pg.evaluate(() => document.querySelector('[data-ccshotfig^="Z-MLGW|"]'))) break; }
      check('B12 a ticked zone picture lands in that zone\'s section of the ZSA report', await pg.evaluate(() => { const f = document.querySelector('[data-ccshotfig^="Z-MLGW|"]'); return !!f && /^data:image\/png/.test(f.querySelector('img').src); }));
      await pg.evaluate(() => document.body.classList.add('theme-dark')); await tick(1200);
      const dk = await pg.evaluate(() => { const c = document.querySelector('.ccr-shot'), s = getComputedStyle(c), lab = getComputedStyle(c.querySelector('.ccr-shotlab b')); const rgb = (x) => (x.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number); const L = (a) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(a[0]) + 0.7152 * f(a[1]) + 0.0722 * f(a[2]); }; const a = L(rgb(lab.color)), b2 = L(rgb(s.backgroundColor)); return (Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05); });
      check('B13 dark mode: the cards read (contrast at least 4.5)', dk >= 4.5, dk);
      check('B14 no page errors', errs.length === 0, JSON.stringify(errs));
    } finally { await b.close(); srv.close(); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
