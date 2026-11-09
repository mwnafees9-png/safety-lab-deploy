#!/usr/bin/env node
/*
 * Regression (8 Nov 2026): report images are real screenshots of the 3D model, step 1 of 2: the capture service.
 *   Waqas: "I want the images in the reports to be relevant screenshots of the 3D-Model" (and the Autopilot asks the
 *   engineer which views go in: step 2, not here).
 * Pinned:
 *   [S] site/cad_shots.js v1.0 or later (window.SLCadShots: ready, views, capture); index.html loads it after the CAD viewer files.
 *   9 Nov 2026 (cad_shots 1.1, the asked-for change "1 image per cone ... different distinct colors"): a PRA subject's views start
 *       with one view per danger source (default: true, own color); the lit parts of a PRA picture are solid charcoal.
 *   [B] the real app on the Aeolus HL-1 demo with its 3D model (headless Chromium, software GL):
 *       B1 ready() once the model is loaded; every particular risk with a danger area gets the side, above and front
 *          views (and a close-up of the parts it hits when it hits any), in plain words, with what is lit; a PRA id
 *          that covers two risks (both engines) gives one set of views for both.
 *       B2 every CAD zone gets the zone from outside, from above (and its equipment close up when it has any).
 *       B3 captures: a rotor burst, a tire burst and a zone each give a PNG that is not blank (pixel spread), with the
 *          highlight blue of the lit parts and the danger red (or the zone green) in it, on a light background.
 *       B4 the cache: the same capture again is not drawn again; another size, or a new model revision, is.
 *       B5 the person's visible viewer keeps its camera, and stays the viewer the page knows.
 *       B6 dark mode: the screenshot keeps its light background (not inverted).
 *       B7 a project without a CAD model: ready() is false and views() is [] (the reports keep their drawn figures).
 * MUTATION PROOFS: SL_SHOTS_MUTATE=blank (nothing drawn) | hijack (draws on the visible viewer) | nohi (lit parts not
 *   highlighted) | nocache (every capture drawn again). Each turns this suite red.
 * Run: node tests/regression_cad_shots_20261108.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 600) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_SHOTS_MUTATE || '';
const MUTS = {
  blank:   ['cad_shots.js', '        v._render(performance.now());\n', '\n'],
  hijack:  ['cad_shots.js', 'return ensureLoaded(e); }).then(function (v) {', 'return visibleViewer() || ensureLoaded(e); }).then(function (v) {'],
  nohi:    ['cad_shots.js', '        v.select(_arr(view.lit.parts), false);\n', '        v.select([], false);\n'],
  nocache: ['cad_shots.js', '        if (_cache[key]) { _stats.hits++; return _cache[key]; }', '        if (false) { _stats.hits++; return _cache[key]; }']
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) {
  let b = fs.readFileSync(path.join(SITE, name), 'utf8');
  if (MUTS[MUT] && MUTS[MUT][0] === name) { if (b.indexOf(MUTS[MUT][1]) < 0) { console.error('mutation anchor not found: ' + MUT); process.exit(3); } b = b.replace(MUTS[MUT][1], MUTS[MUT][2]); }
  return b;
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('regression_cad_shots_20261108' + (MUT ? ' [mutation ' + MUT + ']' : ''));
  console.log('\n[S] static');
  const CS = src('cad_shots.js'), IDX = src('index.html');
  check('S1 cad_shots.js v1.0 or later defines SLCadShots with ready, views and capture', /cad_shots\.js, v1\.\d+/.test(CS) && /VERSION = '1\.\d+'/.test(CS) && (CS.match(/cad_shots\.js, v(1\.\d+)/) || [])[1] === (CS.match(/VERSION = '(1\.\d+)'/) || [])[1] && /root\.SLCadShots = api/.test(CS) && /ready: ready, views: views, capture: capture/.test(CS));
  const iV = IDX.indexOf('cad_viewer.js?v='), iP = IDX.indexOf('cad_viewer_panels.js?v='), iS = IDX.indexOf('<script src="cad_shots.js?v=' + (CS.match(/VERSION = '(1\.\d+)'/) || [])[1] + '" defer></script>');
  check('S2 index.html loads cad_shots.js at its own version once, after the CAD viewer files', iS > 0 && iS > iV && iS > iP && (IDX.match(/cad_shots\.js\?v=/g) || []).length === 1);
  check('S3 it draws in a hidden viewer of its own (never mount, which would make it the page\'s viewer) on a light background', /new root\.SLCadViewer\.Viewer\(host/.test(CS) && !/SLCadViewer\.mount\(/.test(CS) && /BG = '#FFFFFF'/.test(CS));

  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) { console.log('  SKIP  Playwright is not installed here; [B] needs the real app'); }
  else {
    console.log('\n[B] the real app');
    const http = require('http');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
      let b; try { if (fs.statSync(f).isDirectory()) throw 0; b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
      const name = path.relative(SITE, f).split(path.sep).join('/'); if (MUTS[MUT] && MUTS[MUT][0] === name) b = Buffer.from(src(name));
      r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const b = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }), errs = [];
    try {
      const pg = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
      pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); pg.on('dialog', (d) => d.dismiss().catch(() => {}));
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
      await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
      await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
      await pg.evaluate(() => window.loadHL1Demo()); await tick(9000);
      await pg.evaluate(() => switchTab('cad'));
      let shown = false;
      for (let i = 0; i < 60 && !shown; i++) { await tick(1000); shown = await pg.evaluate(() => { const v = window.SLCadPage && SLCadPage.state.viewer; return !!(v && v.scene3 && !v.$.overlay.classList.contains('scv-open')); }); }
      check('the demo\'s model is on the CAD page (the test\'s starting point)', shown);
      // the person turns the visible view to a camera of their own
      const cam0 = await pg.evaluate(() => { const v = SLCadPage.state.viewer; v.setView('left'); v._orbit(40, -25); return JSON.stringify(v.getCamera()); });
      await pg.addScriptTag({ content: `window.__shotStats = async function (dataUrl) {
          const img = new Image(); await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = dataUrl; });
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0, s = 0, s2 = 0, blue = 0, red = 0, green = 0, opaque = 0, dark = 0, colored = 0;
          for (let i = 0; i < d.length; i += 4) { const R = d[i], G = d[i + 1], B = d[i + 2], L = (R + G + B) / 3; n++; s += L; s2 += L * L; if (d[i + 3] === 255) opaque++;
            if (B > R + 60 && B > G + 25) blue++; if (R > G + 60 && R > B + 60) red++; if (G > R + 40 && G > B + 5) green++;
            const mx = Math.max(R, G, B), mn = Math.min(R, G, B); if (mx < 90 && mx - mn < 30) dark++; if (mx - mn > 60) colored++; }
          const m = s / n; return { w: c.width, h: c.height, std: Math.sqrt(Math.max(0, s2 / n - m * m)), mean: m, blue: blue / n, red: red / n, green: green / n, dark: dark / n, colored: colored / n, opaque: opaque / n, corner: [d[0], d[1], d[2], d[3]] };
        };` });

      const B1 = await pg.evaluate(() => {
        const S = window.SLCadShots, res = SLPraAuto.compute();
        const risks = res.risks.filter((r) => (r.shapes || []).length || (r.zones || []).length);
        const per = risks.map((r) => { const all = S.views({ kind: 'pra', riskKey: r.key }), v = all.filter((x) => !/^src:/.test(x.id)), src = all.filter((x) => /^src:/.test(x.id)); return { key: r.key, kind: r.kind, hits: r.hits.length, ids: v.map((x) => x.id), labels: v.map((x) => x.label), lit: v[0] ? { parts: v[0].lit.parts.length, vols: v[0].lit.volumes.length } : null, why: v.every((x) => x.why && x.why.length > 20), cam: v.every((x) => x.camera && x.camera.dir.length === 3 && x.camera.box && x.camera.box.min), nsrc: (r.sources || []).length, src: src.map((x) => ({ id: x.id, def: x.default === true, color: x.color, label: x.label })), first: all.slice(0, src.length).every((x) => /^src:/.test(x.id)) }; });
        const pra001 = S.views({ kind: 'pra', praId: 'PRA-001' }), rot = risks.filter((r) => r.praId === 'PRA-001');
        return { ready: S.ready(), n: risks.length, per, both: pra001.length > 0 && pra001.find((x) => x.id === 'side').lit.parts.length === new Set([].concat(...rot.map((r) => r.hits.map((u) => u.pid)))).size && rot.length >= 2, none: S.views({ kind: 'pra', riskKey: 'nope' }).length };
      });
      const okRisk = (p) => p.ids.slice(0, 3).join(',') === 'side,above,front' && (p.hits ? p.ids[3] === 'closeup' : p.ids.length === 3) && p.lit && p.lit.vols > 0 && p.lit.parts === p.hits && p.why && p.cam && p.labels[0] === 'Danger area, from the side' && p.first && p.src.length === p.nsrc && p.src.every((x) => x.def && /^#[0-9A-F]{6}$/i.test(x.color)) && new Set(p.src.map((x) => x.color)).size === p.src.length;
      check('B1 ready() with the model loaded; every particular risk with a danger area gets one picture per danger source first (v1.1: ticked by default, each in its own color), then side, above, front (and a close-up of the parts it hits), lit and explained', B1.ready && B1.n >= 5 && B1.per.every(okRisk), JSON.stringify(B1.per.filter((p) => !okRisk(p)).slice(0, 3)) + ' n=' + B1.n);
      check('B1b rotor bursts are drawn as burst bands (one per fragment type per disc); a PRA id covering both engines gives one set of views; an unknown risk gives none', B1.per.filter((p) => p.kind === 'ROTOR').every((p) => p.lit.vols >= 3) && B1.both && B1.none === 0, JSON.stringify({ both: B1.both, none: B1.none }));
      check('B1c the labels are plain words (no em dashes, no codes)', B1.per.every((p) => p.labels.concat(p.src.map((x) => x.label)).every((l) => /^[A-Z][a-z0-9' ,-]+$/.test(l) && !/—/.test(l))), JSON.stringify(B1.per[0].labels));

      const B2 = await pg.evaluate(() => {
        const S = window.SLCadShots, zones = ZONES.all().filter((z) => z && z.volume && z.volume.kind === 'box');
        const per = zones.map((z) => { const v = S.views({ kind: 'zsa', zone: z.code }); return { code: z.code, ids: v.map((x) => x.id), eq: v[0] ? v[0].lit.parts.length : -1, box: v[0] ? v[0].lit.volumes.length : 0 }; });
        return { n: zones.length, per, withEq: per.filter((p) => p.eq > 0).length };
      });
      const okZone = (p) => p.ids[0] === 'outside' && p.ids[1] === 'above' && (p.eq > 0 ? p.ids[2] === 'equipment' : p.ids.length === 2) && p.box === 1;
      check('B2 every CAD zone (47) gets the zone from outside, from above, and its equipment close up when it has any', B2.n === 47 && B2.per.every(okZone) && B2.withEq >= 20, JSON.stringify(B2.per.filter((p) => !okZone(p)).slice(0, 3)) + ' withEq=' + B2.withEq);

      const caps = await pg.evaluate(async () => {
        const S = window.SLCadShots, res = SLPraAuto.compute();
        const rotor = res.risks.find((r) => r.kind === 'ROTOR' && r.hits.length), tire = res.risks.find((r) => r.kind === 'TIRE' && r.hits.length);
        const zone = ZONES.all().find((z) => z && z.volume && S.views({ kind: 'zsa', zone: z.code }).length === 3);
        const out = {}, t = {};
        const go = async (name, subj, view) => { const t0 = performance.now(); const c = await S.capture(subj, view, { w: 800, h: 500 }); t[name] = Math.round(performance.now() - t0); out[name] = Object.assign({ w: c.w, h: c.h, at: !!c.at, rev: c.modelRev, label: c.label, thumb: /^data:image\/png;base64,/.test(c.thumb) }, await window.__shotStats(c.png)); };
        await go('rotorSide', { kind: 'pra', riskKey: rotor.key }, 'side');
        await go('rotorClose', { kind: 'pra', riskKey: rotor.key }, 'closeup');
        await go('tireSide', { kind: 'pra', riskKey: tire.key }, 'side');
        await go('zoneEq', { kind: 'zsa', zone: zone.code }, 'equipment');
        await go('zoneOut', { kind: 'zsa', zone: zone.code }, 'outside');
        window.__shots = {}; for (const [n, s, v] of [['rotor_side', { kind: 'pra', riskKey: rotor.key }, 'side'], ['rotor_above', { kind: 'pra', riskKey: rotor.key }, 'above'], ['rotor_closeup', { kind: 'pra', riskKey: rotor.key }, 'closeup'], ['tire_side', { kind: 'pra', riskKey: tire.key }, 'side'], ['zone_outside', { kind: 'zsa', zone: zone.code }, 'outside'], ['zone_equipment', { kind: 'zsa', zone: zone.code }, 'equipment']]) window.__shots[n] = (await S.capture(s, v, { w: 800, h: 500 })).png;
        return { out, t, zone: zone.code, rotor: rotor.key };
      });
      if (process.env.SL_SHOTS_OUT) { const sh = await pg.evaluate(() => window.__shots); fs.mkdirSync(process.env.SL_SHOTS_OUT, { recursive: true }); for (const k of Object.keys(sh)) fs.writeFileSync(path.join(process.env.SL_SHOTS_OUT, k + '.png'), Buffer.from(sh[k].split(',')[1], 'base64')); }
      console.log('        timings (ms, 800 x 500): ' + JSON.stringify(caps.t));
      const O = caps.out, nb = (s) => s && s.std > 12 && s.w === 800 && s.h === 500;
      check('B3 a rotor burst capture is a real picture (not blank) with the lit parts solid charcoal (v1.1) and the burst bands in the engine\'s color (red for the first)', nb(O.rotorSide) && O.rotorSide.dark > 0.002 && O.rotorSide.red > 0.002 && O.rotorSide.label === 'Danger area, from the side' && O.rotorSide.thumb && O.rotorSide.at, JSON.stringify(O.rotorSide));
      check('B3b the close-up of the parts a rotor burst hits shows them solid charcoal', nb(O.rotorClose) && O.rotorClose.dark > 0.01, JSON.stringify(O.rotorClose));
      check('B3c a tire burst capture shows the bogie volumes in their colors and the parts they hit solid charcoal', nb(O.tireSide) && O.tireSide.colored > 0.002 && O.tireSide.dark > 0.0005, JSON.stringify(O.tireSide));
      check('B3d a zone capture shows the zone box in green and its equipment in blue', nb(O.zoneEq) && O.zoneEq.blue > 0.01 && nb(O.zoneOut) && O.zoneOut.green > 0.002, JSON.stringify({ eq: O.zoneEq, out: O.zoneOut }));
      check('B3e light background: an opaque picture with a white corner', O.rotorSide.opaque === 1 && O.rotorSide.corner.slice(0, 3).every((x) => x >= 245), JSON.stringify(O.rotorSide.corner));

      const B4 = await pg.evaluate(async (rk) => {
        const S = window.SLCadShots, subj = { kind: 'pra', riskKey: rk };
        const n0 = S.stats().captures, a = await S.capture(subj, 'side', { w: 800, h: 500 }), n1 = S.stats().captures;
        const b2 = await S.capture(subj, 'side', { w: 640, h: 400 }), n2 = S.stats().captures;
        const e = SLCadZonal.model(SLCadZonal.latestCadId()), rev = e.revision; e.revision = String(rev || '1') + '-next';
        const c = await S.capture(subj, 'side', { w: 800, h: 500 }), n3 = S.stats().captures; e.revision = rev;
        return { same: n1 === n0, size: n2 === n1 + 1 && b2.w === 640, rev: n3 === n2 + 1 && c.modelRev !== a.modelRev };
      }, caps.rotor);
      check('B4 the cache: the same capture is not drawn again; another size and a new model revision are', B4.same && B4.size && B4.rev, JSON.stringify(B4));

      const B5 = await pg.evaluate((c0) => { const v = SLCadPage.state.viewer; return { cam: JSON.stringify(v.getCamera()) === c0, cur: SLCadViewer.current() === v, other: !!SLCadShots._hidden() && SLCadShots._hidden() !== v, sel: v.sel.size, xray: v.xray }; }, cam0);
      check('B5 the visible viewer keeps the person\'s camera and stays the page\'s viewer (the pictures came from a hidden one)', B5.cam && B5.cur && B5.other && B5.sel === 0 && !B5.xray, JSON.stringify(B5));

      const B6 = await pg.evaluate(async (code) => {
        SLCadShots.clearCache(); const a = await SLCadShots.capture({ kind: 'zsa', zone: code }, 'above', { w: 400, h: 260 }), sa = await window.__shotStats(a.png);
        document.documentElement.setAttribute('data-theme', 'dark'); document.body.classList.add('dark-mode');
        SLCadShots.clearCache(); const c = await SLCadShots.capture({ kind: 'zsa', zone: code }, 'above', { w: 400, h: 260 });
        const s = await window.__shotStats(c.png); document.documentElement.removeAttribute('data-theme'); document.body.classList.remove('dark-mode');
        return { light: sa, dark: s, same: a.png === c.png };
      }, caps.zone);
      check('B6 dark mode: the screenshot is the same light picture as in light mode (not inverted)', (B6.same || Math.abs(B6.dark.mean - B6.light.mean) < 1) && B6.dark.mean > 150, JSON.stringify({ same: B6.same, light: B6.light.mean, dark: B6.dark.mean }));

      const B7 = await pg.evaluate(async () => {
        window._applyProjectData({ projectName: 'Another aircraft', systemsData: [], acFhaData: [], projectConfig: {} });
        await new Promise((r) => setTimeout(r, 2500));
        let rej = false; try { await SLCadShots.capture({ kind: 'zsa', zone: 'Z1' }, 'outside', {}); } catch (_) { rej = true; }
        return { models: (projectConfig.cadModels || []).length, ready: SLCadShots.ready(), v: SLCadShots.views({ kind: 'pra', praId: 'PRA-001' }).length + SLCadShots.views({ kind: 'zsa', zone: 'Z1' }).length, rej };
      });
      check('B7 without a CAD model: ready() is false, views() is [] and capture refuses', B7.models === 0 && !B7.ready && B7.v === 0 && B7.rej, JSON.stringify(B7));
      check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } finally { await b.close(); srv.close(); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (mutation: ' + MUT + ')' : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
