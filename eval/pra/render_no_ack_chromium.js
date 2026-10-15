// Browser proof for the CAD Model page (cad-A). Serves site/ with the production CSP on every
// response (worker script included), drives Chromium with Playwright, saves screenshots.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), url = require('url');
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const WT = process.env.PRA_WT ? path.resolve(process.env.PRA_WT) : path.join(__dirname, '..', '..');
const SITE = process.env.CAD_SITE || path.join(WT, 'site');
const SHOTS = process.env.CAD_SHOTS || path.join(require('os').tmpdir(), 'render-ack');
const FIX = path.join(WT, 'tests', 'fixtures', 'cad', 'pra_aircraft.step');
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
  const t0 = Date.now();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#cad-btn-step')]);
  await chooser.setFiles(FIX);
  await page.waitForFunction(() => window.SLCadViewer.current() && window.SLCadViewer.current().order.length >= 1, null, { timeout: 900000 });
  const tView = Date.now() - t0; await sleep(1500);
  const info = await page.evaluate(() => { const C = SLCadZonal, id = SLCadPage.state.cadId || C.latestCadId(), m = C.model(id), parts = C.partsOf(m); const mn = [1e99, 1e99, 1e99], mx = [-1e99, -1e99, -1e99]; parts.forEach(p => { if (!p.bbox) return; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p.bbox.min[i]); mx[i] = Math.max(mx[i], p.bbox.max[i]); } });
    const v = SLCadViewer.current(); let tris = 0; try { v.scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.index) tris += o.geometry.index.count / 3; }); } catch (_) {}
    return { id, nParts: parts.length, names: parts.map(p => p.name).slice(0, 20), units: m.units || m.unit || (m.meta && m.meta.units) || null, keys: Object.keys(m).slice(0, 30), min: mn, max: mx, size: mx.map((x, i) => Math.round(x - mn[i])), tris, viewerOrder: v.order.length }; });
  console.log('IMPORT ' + path.basename(FIX) + ': first view ' + tView + ' ms; ' + JSON.stringify(info));
  await page.evaluate(() => document.querySelector('#cad-viewer-host').scrollIntoView({ block: 'start' })); await sleep(800);
  await page.screenshot({ path: path.join(SHOTS, process.env.TAG + '_import.png') });

  const cam = () => page.evaluate(() => { const v = SLCadViewer.current(); return { p: v.camera.position.toArray(), t: v.target.toArray() }; });
  const dist = c => Math.hypot(c.p[0] - c.t[0], c.p[1] - c.t[1], c.p[2] - c.t[2]);
  const hold = async (id, vals, n, ms) => { await page.evaluate(([i, v, k]) => window.__smSend(i, v, k), [id, vals, n]); await sleep(ms || 400); await page.evaluate(([i, k]) => window.__smSend(i, [0, 0, 0, 0, 0, 0].slice(0, k / 2), k), [id, n]); await sleep(150); };

  const ackOff = async () => { for (let i = 0; i < 8; i++) { await sleep(700); if (await page.locator('#sl-ack-overlay.show').count()) await page.locator('#sl-ack-overlay.show .sl-ack-keep').click().catch(() => {}); else if (i > 2) break; } };
  await ackOff();
  await page.locator('#cad-by').fill('Render Check'); await page.evaluate(() => SLCadPage.renderPanels()); await ackOff();
  await page.evaluate(() => document.querySelector('#cad-pra [data-pra-tab="bird"]').click()); await ackOff();
  await page.evaluate(() => document.querySelector('#cad-pra [data-pra-act="bflow-start"]').click()); await ackOff();
  const snap = () => page.evaluate(() => JSON.stringify(SLEnv.get('projectConfig').praBirds || null));
  for (const tab of ['bird', 'tire', 'rotor', 'light', 'generic']) {
    const before = await snap(); let shows = 0;
    await page.evaluate(t => { const b = document.querySelector('#cad-pra [data-pra-tab="' + t + '"]'); if (b) b.click(); for (let i = 0; i < 20; i++) SLPraPanel.render(); }, tab);
    for (let i = 0; i < 6; i++) { await sleep(400); if (await page.locator('#sl-ack-overlay.show').count()) { shows++; await page.locator('#sl-ack-overlay.show .sl-ack-keep').click().catch(() => {}); } }
    const after = await snap();
    check('rendering the ' + tab + ' panel 20 times writes nothing and raises no acknowledgement', shows === 0 && before === after, 'shows ' + shows + (before === after ? '' : ' (store changed)'));
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
