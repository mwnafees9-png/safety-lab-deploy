// Browser proof for the CAD Model page (cad-A). Serves site/ with the production CSP on every
// response (worker script included), drives Chromium with Playwright, saves screenshots.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), url = require('url');
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const WT = process.env.PRA_WT ? path.resolve(process.env.PRA_WT) : path.join(__dirname, '..', '..');
const SITE = process.env.CAD_SITE || path.join(WT, 'site');
const SHOTS = process.env.CAD_SHOTS || path.join(require('os').tmpdir(), 'split-proof');
const FIX = path.join(WT, 'tests', 'fixtures', 'cad', 'one_product_three_bodies.step');
fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.txt': 'text/plain' };
let pass = 0, fail = 0;
const T0 = Date.now(); const ts = () => '[' + ((Date.now() - T0) / 1000).toFixed(1) + ' s] ';
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n + '  ' + ts()); } else { fail++; console.log('  FAIL  ' + n + (d ? ' -- ' + d : '') + '  ' + ts()); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // The CSP exactly as the production worker stamps it on the app shell.
  const mod = await import(url.pathToFileURL(path.join(WT, 'worker.js')).href);
  const r0 = await mod.default.fetch(new Request('https://safetylabaero.com/app/'), { ASSETS: { fetch: () => Promise.resolve(new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })) } }, { waitUntil() {} });
  const csp = r0.headers.get('content-security-policy').split('; ').filter(d => d !== 'upgrade-insecure-requests').join('; ');
  console.log('CSP: ' + csp);
  const rw = await mod.default.fetch(new Request('https://safetylabaero.com/app/cad_import_worker.js'), { ASSETS: { fetch: () => Promise.resolve(new Response('x', { status: 200, headers: { 'content-type': 'text/javascript' } })) } }, { waitUntil() {} });
  const wcsp = rw.headers.get('content-security-policy');
  console.log('worker CSP: ' + wcsp);
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]); const rel = u === '/' ? '/index.html' : u;
    const f = path.join(SITE, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    fs.readFile(f, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('nf'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Security-Policy': rel === '/cad_import_worker.js' ? wcsp : csp }); res.end(buf);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });

  const MOCK = () => { const fake = { vendorId: 0x256f, productId: 0xc635, productName: 'Fake SpaceMouse (test)', opened: false, open() { this.opened = true; return Promise.resolve(); }, oninputreport: null };
    const hid = { requestDevice: () => Promise.resolve([fake]), getDevices: () => Promise.resolve(window.__smGranted ? [fake] : []), addEventListener() {} };
    try { Object.defineProperty(Navigator.prototype, 'hid', { get: () => hid, configurable: true }); } catch (e) {}
    window.__fakeSM = fake; window.__smSend = (id, vals, n) => { const b = new Uint8Array(n || vals.length * 2); vals.forEach((x, i) => { const u = x & 0xffff; b[i * 2] = u & 0xff; b[i * 2 + 1] = u >> 8; }); if (fake.oninputreport) fake.oninputreport({ reportId: id, data: new DataView(b.buffer) }); }; };
  await ctx.addInitScript(MOCK);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const REP = SHOTS; const LOG = []; const tm = async (label, fn) => { const t = Date.now(); try { const r = await fn(); LOG.push([label, Date.now() - t, 'ok']); console.log('  STEP ' + label + ' ' + (Date.now() - t) + ' ms'); return r; } catch (e) { LOG.push([label, Date.now() - t, 'BROKE: ' + String(e.message).slice(0, 300)]); console.log('  BROKE ' + label + ': ' + String(e.message).slice(0, 600)); await page.screenshot({ path: path.join(SHOTS, 'broke_' + label.replace(/\W+/g, '_') + '.png') }).catch(() => {}); return null; } };
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.setDefaultTimeout(20000);
  await page.goto(base, { waitUntil: 'load' }); await sleep(2500);
  await page.evaluate(() => { try { return loadSampleProject(); } catch (e) { return String(e); } }); await sleep(1500);
  const clear = () => { let n = 0; document.querySelectorAll('body *').forEach(el => { if (el.closest('.scv')) return; const cs = getComputedStyle(el); if (cs.position === 'fixed' && el.offsetWidth > innerWidth * 0.6 && el.offsetHeight > innerHeight * 0.6) { el.style.display = 'none'; n++; } if (cs.filter && cs.filter !== 'none') el.style.filter = 'none'; }); return n; };
  await page.evaluate(() => { document.querySelectorAll('body > *').forEach(el => { if (el.querySelector && el.querySelector('#sl-auth-form')) el.style.display = 'none'; }); });
  await page.evaluate('(' + clear.toString() + ')()');
  await page.evaluate(() => switchTab('cad')); await sleep(500); await page.evaluate('(' + clear.toString() + ')()');
  await page.evaluate(() => { document.querySelectorAll('body > *').forEach(el => { if (el.querySelector && el.querySelector('#sl-auth-form')) el.style.display = 'none'; }); });

  // force the per-body path on this small file and make body 1 fail (test hooks of the importer)
  await page.evaluate(() => { const I = SLCadImport, orig = I.importStep; I.importStep = (f, o) => orig.call(I, f, Object.assign({}, o, { splitMinBytes: 0, testFailBody: 1 })); });
  const t0 = Date.now();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#cad-btn-step')]);
  await chooser.setFiles(FIX);
  await page.waitForFunction(() => window.SLCadPage && SLCadPage.state.lastImport && SLCadViewer.current() && SLCadViewer.current().order.length >= 3, null, { timeout: 60000 });
  const first = await page.evaluate(() => { const r = SLCadPage.state.lastImport; return { reader: r.model.reader, bodies: r.model.streaming && r.model.streaming.bodies, boxes: r.model.protos.length - (() => { const got = new Set(); r.stream.on(b => (b.protos || []).forEach(p => got.add(p.proto))); return got.size; })(), protos: r.model.protos.length }; });
  check('split chosen for one part with three bodies: reader structure-bodies, a box per body first', first.reader === 'structure-bodies' && first.bodies >= 3 && first.boxes >= 1, JSON.stringify(first));
  await page.waitForFunction(() => SLCadPage.state.lastImport.stream.done(), null, { timeout: 60000 }); await sleep(800);
  const after = await page.evaluate(() => { const r = SLCadPage.state.lastImport; return { total: r.model.protos.length, meshed: (() => { const got = new Set(); r.stream.on(b => (b.protos || []).forEach(p => got.add(p.proto))); return got.size; })(), nm: (r.model.notMeshed || []).map(q => q.name + ': ' + q.reason), msg: (document.querySelector('[data-not-meshed]') || {}).innerText || '' }; });
  check('every body but the forced-failing one meshed; that body is listed as not meshed with its reason and a Retry button, on the page', after.meshed === after.total - 1 && after.nm.length === 1 && /Not meshed:.*OpenCascade returned no shape/.test(after.msg) && await page.locator('[data-retry-mesh="0"]').count() === 1, JSON.stringify(after));
  await page.evaluate(() => document.querySelector('#cad-msg, [data-not-meshed]') && document.querySelector('[data-not-meshed]').scrollIntoView({ block: 'center' })); await page.screenshot({ path: path.join(SHOTS, 'split_01_not_meshed.png') });
  for (let i = 0; i < 4; i++) { if (await page.locator('#sl-ack-overlay.show').count()) { await page.locator('#sl-ack-overlay.show .sl-ack-keep').click().catch(() => {}); await sleep(600); } }
  console.log('    protos: ' + JSON.stringify(await page.evaluate(() => SLCadPage.state.lastImport.model.protos.map(p => p && p.index ? p.index.length : null))) + ' meshes ' + JSON.stringify(await page.evaluate(() => (SLCadPage.state.lastImport.model.meshes || []).map(m => [m.name, m.proto]))));
  await page.evaluate(() => cadRetryMesh(0)); await sleep(2500);
  const rt = await page.evaluate(() => { const r = SLCadPage.state.lastImport; return { meshed: (() => { const got = new Set(); r.stream.on(b => (b.protos || []).forEach(p => got.add(p.proto))); return got.size; })(), nm: (r.model.notMeshed || []).length }; });
  check('Retry reads the body again (the test hook fails only the first read): every body meshed, the list empty', rt.meshed === after.total && rt.nm === 0, JSON.stringify(rt));
  // exact measurement on each body, from that body's own file
  const ex = await page.evaluate(async () => { const v = SLCadViewer.current(); const out = []; for (const pid of v.order) { try { const p = await SLCadExact.properties(pid); out.push(Math.round(p.volume || (p.mass && p.mass.volume) || 0)); } catch (e) { out.push('ERR ' + e.message); } } return out; });
  const want = [1e6, 125000, Math.round(4 / 3 * Math.PI * 40 ** 3)];
  check('exact measurement per body: volumes of the cube, the small cube and the sphere', want.every(w => ex.some(x => typeof x === 'number' && Math.abs(x - w) / w < 0.01)), JSON.stringify(ex));
  console.log('errors: ' + JSON.stringify(errors.filter(e => !/favicon|ERR_|Failed to load/.test(e)).slice(0, 5)));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
