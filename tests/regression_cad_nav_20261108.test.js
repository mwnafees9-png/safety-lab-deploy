#!/usr/bin/env node
/*
 * Regression (8 Nov 2026): the CAD Model page leaves the ZSA pill group for a row of its own in the left menu, under
 * Define (Plan and basis) next to Flight Phases; the pages that used it (ZSA, Zonal Model, Routing, Physical Hazards,
 * PRA, MSG-3 zonal) carry a small "Open the CAD model" link.
 * Pinned:
 *   [S] prove_tabs.js v1.9: no CAD pill in the ZSA area, the area carries the link; index.html: snav-cad right after
 *       snav-phases in the Define group; nav_areas.js v1.7: snav-cad in Plan and basis after snav-phases, and the CAD
 *       page no longer lights the ZSA link; msg3_zonal.js and the PRA page carry the link; pins moved.
 *   [B] the real app: the CAD page opens from its menu row and lights Plan and basis with CAD Model; the ZSA bar shows no
 *       CAD pill and its link opens the CAD page; the PRA page and the MSG-3 zonal window carry the link.
 * MUTATION PROOFS: SL_CADNAV_MUTATE=pill (the CAD pill back under ZSA) | norow (no menu row) | nolink (no link on the
 *   ZSA bar). Each turns this suite red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_cad_nav_20261108.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 500) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_CADNAV_MUTATE || '';
const MUTS = {
  pill:   ['prove_tabs.js', "            { t: 'zonal',   k: 'Zonal Model' },\n", "            { t: 'zonal',   k: 'Zonal Model' },\n            { t: 'cad',     k: 'CAD Model' },\n"],
  norow:  ['index.html', `<a class="asb-item sub" id="snav-cad" onclick="switchTab('cad')" role="button" tabindex="0"><span class="asb-lbl">CAD Model</span></a>`, ''],
  nolink: ['prove_tabs.js', "{ label: 'ZSA', cadLink: true, tabs: [", "{ label: 'ZSA', tabs: ["]
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) {
  let b = fs.readFileSync(path.join(SITE, name), 'utf8');
  if (MUTS[MUT] && MUTS[MUT][0] === name) { if (b.indexOf(MUTS[MUT][1]) < 0) { console.error('mutation anchor not found: ' + MUT); process.exit(3); } b = b.replace(MUTS[MUT][1], MUTS[MUT][2]); }
  return b;
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('regression_cad_nav_20261108' + (MUT ? ' [mutation ' + MUT + ']' : ''));
  console.log('\n[S] static');
  const PT = src('prove_tabs.js'), IDX = src('index.html'), NAV = src('nav_areas.js'), M3 = src('msg3_zonal.js'), PA = src('pra_autopilot.js'), UI = src('autopilot_ui.js');
  const m = { exports: {} }; new Function('module', 'window', PT)(m, undefined); const AREAS = m.exports.AREAS;
  const zsa = AREAS.find((a) => a.label === 'ZSA');
  check('S1 prove_tabs.js v1.9: the ZSA area has no CAD Model pill (Zonal Model, ZSA, Routing, Physical Hazards) and carries the CAD link', /prove_tabs\.js, v1\.9/.test(PT) && zsa && zsa.tabs.map((x) => x.t).join(',') === 'zonal,zsa,routing,phys' && zsa.cadLink === true && !AREAS.some((a) => a.tabs.some((x) => x.t === 'cad')), zsa && zsa.tabs.map((x) => x.t).join(','));
  check('S2 the bar draws the link at its end, opening the CAD page', /area\.cadLink \? '<a [^']*data-cad-link="1"[^']*onclick="switchTab\(\\'cad\\'\)">Open the CAD model/.test(PT));
  const grp = (IDX.match(/<details class="asb-grp" id="asb-grp-ac">[\s\S]*?<\/details>/) || [''])[0];
  check('S3 index.html: CAD Model is a row of its own in the Define group, right after Flight Phases', /id="snav-phases"[^\n]*\n(\s*<!--[^\n]*-->\n)?\s*<a class="asb-item sub" id="snav-cad" onclick="switchTab\('cad'\)"[^>]*><span class="asb-lbl">CAD Model<\/span><\/a>/.test(grp) && (IDX.match(/id="snav-cad"/g) || []).length === 1);
  check('S4 nav_areas.js v1.7 or later: CAD Model in Plan and basis after Flight Phases; the CAD page no longer lights the ZSA link', parseFloat((/VERSION = '([0-9.]+)'/.exec(NAV) || [])[1]) >= 1.7 && /items: \['snav-plan-auto', 'snav-arp-process', 'snav-spp', 'snav-phases', 'snav-cad'\]/.test(NAV) && !/\bcad: 'snav-zsa'/.test(NAV) && /'snav-cad': 'CAD Model'/.test(NAV));
  check('S5 the MSG-3 zonal window and the PRA page carry the link (the PRA page through the Autopilot buttons)', /data-cad-link="1"[^\n]*switchTab\(\\'cad\\'\)/.test(M3) && /U\(\)\.importButtons\(true\)/.test(PA) && /data-slap-import="page" onclick="SLAutopilotUI\.openCad\(\)">Open the CAD Model page/.test(UI));
  check('S6 pins moved: prove_tabs 1.9, nav_areas 2.1 or later, msg3_zonal 1.22', /prove_tabs\.js\?v=1\.9"/.test(IDX) && parseFloat((/nav_areas\.js\?v=([0-9.]+)"/.exec(IDX) || [])[1]) >= 2.1 && /msg3_zonal\.js\?v=1\.22"/.test(IDX));

  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) { console.log('  SKIP  Playwright is not installed here; [B] needs the real app'); }
  else {
    console.log('\n[B] the real app');
    const http = require('http');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
      let b; try { if (fs.statSync(f).isDirectory()) throw 0; b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
      const name = path.relative(SITE, f); if (MUTS[MUT] && MUTS[MUT][0] === name) b = Buffer.from(src(name));
      r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const b = await pw.chromium.launch(), errs = [];
    try {
      const pg = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
      pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); pg.on('dialog', (d) => d.dismiss().catch(() => {}));
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
      await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
      await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
      const B1 = await pg.evaluate(async () => {
        const row = document.getElementById('snav-cad'); if (!row) return { row: false };
        row.click(); await new Promise((r) => setTimeout(r, 900));
        const v = document.getElementById('view-cad'), bar = document.getElementById('sl-areabar');
        return { row: true, shown: !!v && v.style.display !== 'none', area: window.SLNavAreas && SLNavAreas.areaOf('cad'), lit: !!(bar && bar.querySelector('#snav-cad.sl-ab-on, #snav-cad.snav-active, .sl-ab-on#snav-cad')), barText: bar ? bar.textContent : '' };
      });
      check('B1 the menu row opens the CAD Model page, under Plan and basis with CAD Model lit', B1.row && B1.shown && B1.area === 'plan' && /CAD Model/.test(B1.barText), JSON.stringify(B1));
      const B2 = await pg.evaluate(async () => {
        switchTab('zsa'); await new Promise((r) => setTimeout(r, 700));
        const bar = document.querySelector('#view-zsa > .prove-tabbar');
        const pills = bar ? [...bar.querySelectorAll('[data-prove-tab]')].map((x) => x.getAttribute('data-prove-tab')) : [];
        const link = bar && bar.querySelector('[data-cad-link]');
        if (link) link.click(); await new Promise((r) => setTimeout(r, 700));
        const v = document.getElementById('view-cad');
        return { pills, link: !!link, opened: !!v && v.style.display !== 'none' };
      });
      check('B2 the ZSA bar has no CAD pill, and its "Open the CAD model" link opens the CAD page', B2.pills.length >= 3 && B2.pills.indexOf('cad') < 0 && B2.link && B2.opened, JSON.stringify(B2));
      const B3 = await pg.evaluate(async () => {
        const out = {};
        for (const t of ['zonal', 'phys']) { switchTab(t); await new Promise((r) => setTimeout(r, 500)); const bar = document.querySelector('#view-' + t + ' > .prove-tabbar'); out[t] = !!(bar && bar.querySelector('[data-cad-link]')); }
        if (typeof window.msg3Zonal === 'function') { window.msg3Zonal(); out.msg3 = !!document.querySelector('#m3z-modal [data-cad-link]'); if (window._m3CloseModal) window._m3CloseModal(); }
        switchTab('pra'); await new Promise((r) => setTimeout(r, 900));
        out.pra = !!document.querySelector('#view-pra [data-slap-import="page"]');
        return out;
      });
      check('B3 the Zonal Model and Physical Hazards bars, the MSG-3 zonal window and the PRA page carry the link', B3.zonal && B3.phys && B3.msg3 && B3.pra, JSON.stringify(B3));
      check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } finally { await b.close(); srv.close(); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (mutation: ' + MUT + ')' : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
