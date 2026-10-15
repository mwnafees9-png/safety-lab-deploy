// Browser proof for the CAD Model page (cad-A). Serves site/ with the production CSP on every
// response (worker script included), drives Chromium with Playwright, saves screenshots.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), url = require('url');
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const WT = process.env.PRA_WT ? path.resolve(process.env.PRA_WT) : path.join(__dirname, '..', '..');
const SITE = process.env.CAD_SITE || path.join(WT, 'site');
const SHOTS = process.env.CAD_SHOTS || path.join(require('os').tmpdir(), 'sm-proof');
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
  await sleep(1500); for (let i = 0; i < 3; i++) { if (await page.locator('#sl-ack-overlay.show').count()) { await page.locator('#sl-ack-overlay.show .sl-ack-keep').click().catch(() => {}); await sleep(600); } }
  await page.evaluate(() => SLCadViewer.current().openMenu('navigate')); await sleep(300);
  const st0 = await page.locator('[data-sm-status]').innerText();
  check('Navigate menu: SpaceMouse status shown, not connected before the user connects', /SpaceMouse not connected/.test(st0), st0);
  await page.screenshot({ path: path.join(SHOTS, 'sm_01_menu.png') });
  await page.click('[data-act="sm-connect"]'); await sleep(400);
  const st1 = await page.locator('[data-sm-status]').innerText();
  check('Connect SpaceMouse (user gesture): the device opens and the status names it', /SpaceMouse connected: Fake SpaceMouse/.test(st1) && await page.evaluate(() => window.__fakeSM.opened), st1);
  await page.keyboard.press('Escape').catch(() => {});
  let c0 = await cam(); await hold(1, [0, 0, 0, 0, 0, 350], 12);   // new combined format, twist
  let c1 = await cam();
  check('twist (combined 12-byte report): the camera orbits, distance to the target kept', c0.p.join() !== c1.p.join() && Math.abs(dist(c1) - dist(c0)) / dist(c0) < 0.01, JSON.stringify([c0, c1]));
  c0 = c1; await hold(1, [350, 0, 0], 6);   // old split format, translation report: cap right
  c1 = await cam();
  check('pan (old split format, report 1 translation): camera and target move together', c0.t.join() !== c1.t.join() && Math.abs(dist(c1) - dist(c0)) / dist(c0) < 0.01, JSON.stringify([c0, c1]));
  c0 = c1; await hold(1, [0, 350, 0], 6); c1 = await cam();
  check('push (zoom): the camera moves closer to the target', dist(c1) < dist(c0) * 0.95, dist(c0) + ' -> ' + dist(c1));
  c0 = c1; await hold(2, [350, 0, 0], 6); c1 = await cam();
  check('tilt (old split format, report 2 rotation): the camera orbits', c0.p.join() !== c1.p.join());
  await page.evaluate(() => { window.__smSend(3, [1], 2); window.__smSend(3, [0], 2); }); await sleep(300); const c2 = await cam();
  check('left button: Fit all (the view changes back to fit the model)', c2.p.join() !== c1.p.join());
  await page.evaluate(() => SLCadViewer.current()._setMode('fly')); c0 = await cam(); await hold(1, [0, 0, 0, 0, 0, 350], 12); c1 = await cam();
  check('Fly mode: SpaceMouse input is ignored (the keyboard and mouse own the camera)', c0.p.join() === c1.p.join());
  await page.evaluate(() => SLCadViewer.current()._setMode('orbit'));
  await page.evaluate(() => document.querySelector('#cad-viewer-host').scrollIntoView({ block: 'start' })); await page.screenshot({ path: path.join(SHOTS, 'sm_02_after_motion.png') });
  // exported report viewer: the same module inlined
  const html = await page.evaluate(() => { const RP = SLPraReport, P2 = RP.collectParts(SLCadViewer.current(), [], {}); return RP.page({ title: 'SpaceMouse test', heading: 'SpaceMouse test export', intro: 'Test export.', typesTitle: 'None', png: '', tableHtml: '', parts: P2.parts, volumes: [RP.meshVolume([0, 0, 0, 1000, 0, 0, 0, 1000, 0], [0, 1, 2], 'v', 'Test region', '#c92a2a', true, null, {})], axis: [1, 0, 0], triangles: P2.triangles, xray: false }).then(r => typeof r === 'string' ? r : r.html); });
  const EXP = path.join(SHOTS, 'sm_export_test.html'); fs.writeFileSync(EXP, html);
  check('export: the SpaceMouse module is inlined (no network), button and status present', /var SLSpaceMouse = \(function factory/.test(html) && /id="v3d-sm"/.test(html) && !/<script[^>]+src=/i.test(html));
  const pp = await ctx.newPage(); pp.on('pageerror', e => console.log('EXPERR ' + e.message)); pp.on('console', m => { if (m.type() === 'error') console.log('EXPCON ' + m.text().slice(0, 200)); }); await pp.goto('file://' + EXP, { waitUntil: 'load' }); await sleep(800);
  await pp.click('#v3d-sm'); await sleep(300);
  const es = await pp.locator('#v3d-sm-status').innerText();
  const e0 = await pp.evaluate(() => window.__rbViewer.camera.position.toArray());
  await pp.evaluate(() => window.__smSend(1, [0, 0, 0, 0, 0, 350], 12)); await sleep(400); await pp.evaluate(() => window.__smSend(1, [0, 0, 0, 0, 0, 0], 12)); await sleep(150);
  const e1 = await pp.evaluate(() => window.__rbViewer.camera.position.toArray());
  await pp.evaluate(() => window.__smSend(1, [0, 350, 0, 0, 0, 0], 12)); await sleep(400); await pp.evaluate(() => window.__smSend(1, [0, 0, 0, 0, 0, 0], 12)); await sleep(150);
  const e2 = await pp.evaluate(() => window.__rbViewer.camera.position.toArray());
  await pp.evaluate(() => { window.__smSend(3, [1], 2); window.__smSend(3, [0], 2); }); await sleep(200); const e3 = await pp.evaluate(() => window.__rbViewer.camera.position.toArray());
  check('exported report: connect, twist turns the view, push zooms, left button fits', /SpaceMouse connected/.test(es) && e0.join() !== e1.join() && e1.join() !== e2.join() && e3.join() !== e2.join(), es + ' ' + JSON.stringify([e0, e1, e2, e3]));
  await pp.screenshot({ path: path.join(SHOTS, 'sm_03_export.png') }); await pp.close();
  // no WebHID: the note instead of the connect item
  const np = await browser.newContext().then(c => c.newPage()); await np.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, 'hid', { get: () => undefined, configurable: true }); } catch (e) {} });
  await np.goto('file://' + EXP, { waitUntil: 'load' }); await sleep(600);
  check('without WebHID (Safari / Firefox): the export hides the button and says what is needed', await np.evaluate(() => getComputedStyle(document.getElementById('v3d-sm')).display === 'none' && /needs Chrome, Edge or the desktop app/.test(document.getElementById('v3d-sm-status').textContent)));
  console.log('errors: ' + JSON.stringify(errors.filter(e => !/favicon|ERR_|Failed to load/.test(e)).slice(0, 5)));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
