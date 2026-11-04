#!/usr/bin/env node
/*
 * Regression (4 Nov 2026): the Aeolus HL-1 demo carries its CAD model (Waqas: "populate AEOLUS with true geometry CAD").
 *   [S]  the files: site/demo/aeolus_hl1.step is what tools/demo/hl1_cad/make_step.js writes (same bytes);
 *        site/demo/hl1_cad_data.js and hl1_cad_step.js carry that file's fingerprint; the data has the model, the 47
 *        zones with their boxes, the part links to the HL-1 systems and the risk volumes; build_demo_cad.js rebuilt into
 *        a folder of its own gives the same data (Safety Lab's own STEP reader and CAD engine made it).
 *   [B]  the real app: loading the demo adds the model, zones, links and volumes to the project; the CAD page draws the
 *        model from the bundled STEP with no file to pick (checked against the fingerprint); the real shapes stream in and
 *        the complete model is cached (4 Nov fix: a re-opened large model was cached and shown as boxes for good); the
 *        next visit draws from the cache without reading the bundled STEP again.
 * MUTATION PROOFS: SL_CD_MUTATE=bundle | stream | adddata. Each turns this red.
 * Run: node tests/regression_hl1_cad_demo_20261104.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { execFileSync } = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 500) : '')); } };
const REPO = path.join(__dirname, '..'), SITE = path.join(REPO, 'site'), TOOLS = path.join(REPO, 'tools', 'demo', 'hl1_cad');
const MUT = process.env.SL_CD_MUTATE || '';
const MUTS = {
  bundle:  ['cad_viewer.js', 'if (B && typeof B.text === \'function\' && !this._bundledTried) {', 'if (false) {'],
  stream:  ['cad_import.js', '            if (r.stream) {\n                _takeDetail(r);\n                r.stream.onEnd(function (ev) {', '            if (r.stream && false) {\n                _takeDetail(r);\n                r.stream.onEnd(function (ev) {'],
  adddata: ['hl1_showcase.js', '        try { _addCad(data); } catch (_) {}', '']
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) { let s = fs.readFileSync(path.join(SITE, name), 'utf8'); const m = MUTS[MUT]; if (m && m[0] === name) { if (s.indexOf(m[1]) < 0) throw new Error('mutation site missing: ' + m[1]); s = s.replace(m[1], m[2]); } return s; }
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const readGlobal = (file, name) => { const w = {}; new Function('window', fs.readFileSync(file, 'utf8'))(w); return w[name]; };

(async function main() {
  console.log('\n[S] the files');
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-cd-'));
  const stepFile = path.join(SITE, 'demo', 'aeolus_hl1.step'), stepBytes = fs.readFileSync(stepFile), stepSha = sha(stepBytes);
  let D = null, S = null;
  {
    const regen = path.join(TMP, 'aeolus_hl1.step');
    execFileSync(process.execPath, [path.join(TOOLS, 'make_step.js'), regen]);
    check('the bundled STEP is exactly what make_step.js writes', sha(fs.readFileSync(regen)) === stepSha);
    D = readGlobal(path.join(SITE, 'demo', 'hl1_cad_data.js'), 'SL_HL1_CAD');
    S = readGlobal(path.join(SITE, 'demo', 'hl1_cad_step.js'), 'SL_HL1_STEP');
    check('the demo data and the bundled STEP text carry that file\'s fingerprint', D && D.sha256 === stepSha && S && S.sha256 === stepSha && sha(Buffer.from(S.text, 'latin1')) === stepSha);
    const pc = (D && D.projectConfig) || {}, m = (pc.cadModels || [])[0] || {};
    check('the model is in the data with its parts (boxes, designators), and no geometry', m.sha256 === stepSha && (m.parts || []).length > 2000 && m.parts.every((p) => p.bbox && p.pid) && m.parts.some((p) => p.designator === 'LDG-BOGIE-LA') && !/"(position|index|normal)"\s*:\s*\[/.test(JSON.stringify(pc)));
    check('47 zones, each with its box', (pc.zones || []).length === 47 && pc.zones.every((z) => z.volume && z.volume.kind === 'box'));
    check('the parts are linked to the HL-1 systems (200 or more)', Object.keys(pc.cadLinks || {}).length >= 200);
    check('the 10 risk volumes, each tied to its PRA row', (pc.praVolumes || []).length === 10 && pc.praVolumes.every((v) => /^PRA-\d{3}$/.test(v.praId)));
    let same = false;
    try {
      execFileSync(process.execPath, [path.join(TOOLS, 'build_demo_cad.js'), stepFile], { env: Object.assign({}, process.env, { SL_HL1_CAD_OUT: TMP }), stdio: 'pipe', timeout: 240000 });
      same = fs.readFileSync(path.join(TMP, 'hl1_cad_data.js'), 'utf8') === fs.readFileSync(path.join(SITE, 'demo', 'hl1_cad_data.js'), 'utf8');
    } catch (e) { same = 'build failed: ' + String(e.stderr || e).slice(0, 300); }
    check('build_demo_cad.js rebuilt elsewhere gives the same data (made by Safety Lab\'s own code, deterministic)', same === true, same);
    const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('the cache keys moved with the change', /hl1_showcase\.js\?v=8"/.test(idx) && /cad_viewer\.js\?v=2\.8"/.test(idx) && /cad_import\.js\?v=2\.6"/.test(idx));
  }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}

  console.log('\n[B] the real app');
  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) console.log('  SKIP  Playwright is not installed here; [S] above proves the files');
  else {
    const http = require('http');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
    let stepServed = 0;
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
      let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
      const name = path.relative(SITE, f).split(path.sep).join('/'); if (name === 'demo/hl1_cad_step.js') stepServed++;
      if (MUTS[MUT] && MUTS[MUT][0] === name) b = Buffer.from(src(name));
      r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const URL = 'http://127.0.0.1:' + srv.address().port + '/index.html';
    const b = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
    const errs = [];
    try {
      const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
      const open = async () => {
        const pg = await ctx.newPage(); pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); pg.on('dialog', (d) => d.dismiss().catch(() => {}));
        await pg.goto(URL); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(() => window.loadHL1Demo()); await tick(9000);
        return pg;
      };
      let pg = await open();
      const P = await pg.evaluate(() => ({ models: (projectConfig.cadModels || []).map((m) => m.sha256), zones: (projectConfig.zones || []).filter((z) => z.volume).length, links: Object.keys(projectConfig.cadLinks || {}).length, vols: (projectConfig.praVolumes || []).length }));
      check('loading the demo adds the model, the zones with boxes, the links and the volumes to the project', P.models.length === 1 && P.models[0] === stepSha && P.zones === 47 && P.links >= 200 && P.vols === 10, JSON.stringify(P));
      await pg.evaluate(() => switchTab('cad'));
      let asked = false, shown = false;
      for (let i = 0; i < 40 && !shown; i++) {
        await tick(1000);
        const st = await pg.evaluate(() => { const v = window.SLCadPage && SLCadPage.state.viewer; const ov = v && v.$ && v.$.overlay ? v.$.overlay.textContent : ''; return { ov, has: !!(v && v.scene3) }; });
        if (/is not on this computer|Open the CAD file/.test(st.ov)) asked = true;
        if (st.has && !/Loading|Checking|Reading|Building/.test(st.ov) && i > 2) shown = true;
      }
      check('the CAD page draws the model with no file to pick', shown && !asked && stepServed >= 1, JSON.stringify({ shown, asked, stepServed }));
      let full = null;
      for (let i = 0; i < 30 && !(full && full.real); i++) {
        await tick(1500);
        full = await pg.evaluate((s) => SLCadImport.cacheGet(s).then((p) => { if (!p) return null; const protos = p.protos || []; const verts = protos.map((x) => (x && x.position ? x.position.length : 0)); return { n: protos.length, real: verts.filter((v) => v > 24 * 3).length }; }), stepSha);
      }
      check('the real shapes stream in and the complete model is cached (not every part a box)', full && full.n >= 300 && full.real >= 100, JSON.stringify(full));
      await pg.close();
      const before = stepServed;
      pg = await open();
      await pg.evaluate(() => switchTab('cad')); await tick(6000);
      const again = await pg.evaluate(() => { const v = SLCadPage.state.viewer; return { has: !!(v && v.scene3), ov: v && v.$ && v.$.overlay ? v.$.overlay.textContent.slice(0, 80) : '' }; });
      check('the next visit draws from this computer\'s cache, without reading the bundled STEP again', again.has && !/not on this computer/.test(again.ov) && stepServed === before, JSON.stringify(again) + ' served ' + before + ' -> ' + stepServed);
      check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } finally { await b.close(); srv.close(); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (mutation: ' + MUT + ')' : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
