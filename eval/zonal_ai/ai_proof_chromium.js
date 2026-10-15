// Browser proof for the zonal / particular risk AI buttons and review dialog (p3-ai), stubbed AI. Serves site/ with the production CSP on every
// response (worker script included), drives Chromium with Playwright, saves screenshots.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), url = require('url');
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const WT = process.env.SL_WT || path.join(__dirname, '..', '..');
const SITE = process.env.CAD_SITE || path.join(WT, 'site');
const SHOTS = process.env.CAD_SHOTS || path.join(WT, '..', 'p3-shots');
const FIX = path.join(WT, 'tests', 'fixtures', 'cad', 'pra_aircraft.step');
fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.txt': 'text/plain' };
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' -- ' + d : '')); } };
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
  const page = await ctx.newPage();
  const errors = [], requests = [];
  const stepHead = fs.readFileSync(FIX).slice(0, 4000).toString('latin1');
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  ctx.on('request', rq => requests.push({ url: rq.url(), method: rq.method(), body: rq.postData() || '', t: Date.now() }));
  await page.goto(base, { waitUntil: 'load' });
  await sleep(2500);
  const bootErrors = errors.splice(0);
  console.log('boot errors (before the CAD page is touched): ' + bootErrors.length + (bootErrors.length ? '\n    ' + bootErrors.slice(0, 6).join('\n    ') : ''));
  await page.evaluate(() => { try { return loadSampleProject(); } catch (e) { return String(e); } });
  await page.evaluate(() => { window.SLZonalAI.ENABLED = true; });   // the AI gate is off by default; this proof exercises the AI buttons
  await sleep(1500);
  errors.splice(0);
  // The sign-in screen covers the app in a local run (no backend); set it aside for the proof.
  const gate = await page.evaluate(() => { let n = 0; document.querySelectorAll('body > *').forEach(el => { if (el.querySelector && el.querySelector('#sl-auth-form')) { el.style.display = 'none'; n++; } }); document.body.classList.forEach(c => { if (/auth|gate|locked/.test(c)) document.body.classList.remove(c); }); return n; });
  const clear = () => { let n = 0; document.querySelectorAll('body *').forEach(el => { if (el.closest('.scv')) return; const cs = getComputedStyle(el); if (cs.position === 'fixed' && el.offsetWidth > innerWidth * 0.6 && el.offsetHeight > innerHeight * 0.6) { el.style.display = 'none'; n++; } if (cs.filter && cs.filter !== 'none') el.style.filter = 'none'; }); return n; };
  console.log('sign-in overlays set aside: ' + gate + ' + ' + await page.evaluate('(' + clear.toString() + ')()'));
  page.__clear = clear;
  const tImport = Date.now();
  await page.evaluate(() => switchTab('cad'));
  await sleep(500);
  await page.evaluate('(' + clear.toString() + ')()');
  check('CAD Model tab shows in the ZSA tab bar', await page.locator('#view-cad .prove-tab.active', { hasText: 'CAD Model' }).count() === 1);
  check('the page and an empty viewer render', await page.locator('#cad-page .scv').count() === 1);
  await page.evaluate(() => { document.querySelectorAll('body > *').forEach(el => { if (el.querySelector && el.querySelector('#sl-auth-form')) el.style.display = 'none'; }); });
  


  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#cad-btn-step')]);
  await chooser.setFiles(FIX);
  await page.waitForFunction(() => window.SLCadViewer.current() && window.SLCadViewer.current().order.length >= 13, null, { timeout: 90000 });
  await sleep(800);
  const ack = async () => { for (let i = 0; i < 8; i++) { if (!(await page.locator('#sl-ack-overlay.show').count())) break; await page.locator('#sl-ack-overlay.show .sl-ack-keep').click({ timeout: 3000 }).catch(() => {}); await sleep(300); } };   // the overlay sweep runs once at load; repeating it walks the whole page and cost seconds per call
  const clk = async (sel) => { await ack(); try { await page.click(sel, { timeout: 4000 }); } catch (e) { await page.waitForSelector('#sl-ack-overlay.show', { timeout: 2500 }).catch(() => {}); await ack(); await page.evaluate('(' + clear.toString() + ')()'); await page.click(sel, { timeout: 8000 }); } };   // a late overlay (e.g. the common cause decision dialog) is set aside only when it blocks a click
  await ack();
  // Fixture records: two flight computers (AND gate, Catastrophic), a hydraulic line, links confirmed by name.
  const setup = await page.evaluate(() => {
    const sys = SLEnv.get('systemsData'), pages = SLEnv.get('ftaPages'), ac = SLEnv.get('acFhaData');
    sys.push({ id: 'PRA-FCC1', name: 'Flight control computer 1', functions: [{ funcId: 'F-PITCH', funcName: 'Pitch control' }] }, { id: 'PRA-FCC2', name: 'Flight control computer 2', functions: [{ funcId: 'F-PITCH', funcName: 'Pitch control' }] }, { id: 'PRA-HYDL', name: 'Left hydraulic line', functions: [{ funcId: 'F-BRAKE', funcName: 'Wheel braking' }] });
    ac.push({ internalId: 'pra-fc1', fcId: 'FC-PRA-1', fcDesc: 'Loss of pitch control', severity: 'Catastrophic' }, { internalId: 'pra-fc2', fcId: 'FC-PRA-2', fcDesc: 'Loss of left wheel braking', severity: 'Major' });
    const leaf = (id, s) => ({ id, type: 'basic', displayId: id, name: id, probability: 1e-5, identity: { kind: 'item', systemId: s } });
    pages.push({ id: 'PRA-T2', name: 'Loss of left wheel braking', linkedFhaIds: ['AC_pra-fc2'], root: { id: 'PRA-G2', type: 'gate', gateType: 'OR', displayId: 'FC-PRA-2', name: 'Loss of left wheel braking', children: [leaf('PRA-BE3', 'PRA-HYDL')] } }, { id: 'PRA-T1', name: 'Loss of pitch control', linkedFhaIds: ['AC_pra-fc1'], root: { id: 'PRA-G1', type: 'gate', gateType: 'AND', displayId: 'FC-PRA-1', name: 'Loss of pitch control', children: [leaf('PRA-BE1', 'PRA-FCC1'), leaf('PRA-BE2', 'PRA-FCC2')] } });
    const C = SLCadZonal, id = SLCadPage.state.cadId || C.latestCadId(), parts = C.partsOf(C.model(id));
    const pid = n => (parts.find(p => p.name === n) || {}).pid;
    [['FCC_1', 'PRA-FCC1'], ['FCC_2', 'PRA-FCC2'], ['HYD_LINE_L', 'PRA-HYDL']].forEach(([n, s]) => C.confirmLink(id, pid(n), s, 'Proof Engineer'));
    const pc = SLEnv.get('projectConfig'); pc.regulation = 'Part 25';
    return { id, n: parts.length, links: Object.keys(C.confirmed(id)).length };
  });
  check('fixture aircraft imported (13 parts) and three links confirmed', setup.n >= 13 && setup.links === 3, JSON.stringify(setup));
  await page.locator('#cad-by').fill('Proof Engineer');
  await page.evaluate(() => SLCadPage.renderPanels());
  await ack();
  const panel = async (name) => { await ack(); await page.evaluate(() => document.querySelector('#cad-pra').scrollIntoView({ block: 'start' })); await sleep(250); await page.locator('#cad-pra').screenshot({ path: path.join(SHOTS, name) }); };
  const view3d = async (name) => { await ack(); await page.evaluate(() => document.querySelector('#cad-viewer-host').scrollIntoView({ block: 'start' })); await sleep(600); await page.screenshot({ path: path.join(SHOTS, name) }); };

  // the acknowledgement dialog appears once the change settles (450 ms of quiet, longer under load): wait for it
  const ackWait = async () => { await page.waitForSelector('#sl-ack-overlay.show', { timeout: 15000 }).catch(() => {}); await ack(); await sleep(300); };
  const shot = async (sel, name) => { await sleep(250); await page.locator(sel).first().screenshot({ path: path.join(SHOTS, name) }); };
  // a confirmed rotor and its sweep, so the write-up has deterministic model results to cite
  await page.fill('#pra-r-0', '400'); await page.fill('#pra-b-0', '100');
  await clk('#cad-pra [data-pra-act="rotor-confirm"][data-i="0"]'); await ack();
  await clk('#cad-pra [data-pra-act="sweep"]'); await sleep(500); await ack();
  // THE STUB: the AI answer is fixed; it cites the first PRA model record it was given (valid),
  // a record that does not exist (fabricated) and names a missing source (gap). No network.
  const stubbed = await page.evaluate(() => {
    window.__aiCalls = [];
    const stub = function (o) {
      window.__aiCalls.push(o);
      const p = JSON.parse(o.messages[0].content);
      const pram = p.records.find(r => r.type === 'pram') || p.records[0];
      return Promise.resolve({ text: JSON.stringify({ statements: [
        { text: 'Deterministic model result on record: ' + pram.label + '.', kind: 'fact', sources: [{ type: pram.type, id: pram.id }] },
        { text: 'The shield contains a 99 kJ fragment.', kind: 'fact', sources: [{ type: 'pram', id: 'rotor:invented#x' }] },
        { text: 'No rotor shield test report is in the AI Inputs.', kind: 'gap', sources: [], missing: { type: 'report', where: 'Rotor shield containment test report at the design fragment energy' } }
      ] }) });
    };
    if (!window.SafetyLabAI) window.SafetyLabAI = {};
    window.SafetyLabAI.complete = stub;
    return typeof window.SLZonalAI === 'object';
  });
  check('SLZonalAI loaded on the page and the AI stubbed (no network)', stubbed);
  const reqBefore = requests.length;
  check('Rotor burst tab shows the AI risk write-up button for the confirmed rotor', await page.locator('#cad-pra [data-zai-lane="pra.writeup"]').count() >= 1);
  await clk('#cad-pra [data-zai-lane="pra.writeup"]');
  await page.waitForSelector('[data-zai-dialog]', { timeout: 15000 });
  const dlg = page.locator('[data-zai-overlay]');
  const call = await page.evaluate(() => window.__aiCalls[0] && window.__aiCalls[0].messages[0].content);
  check('the request carries no geometry or file identity', call && !/bbox|centroid|"center"|"axis"|pra_aircraft\.step/.test(call));
  check('review dialog: the valid statement listed unticked', await dlg.locator('[data-zai-pick="s1"]').count() === 1 && !(await dlg.locator('[data-zai-pick="s1"]').isChecked()));
  check('review dialog: the fabricated statement is not offered, it is listed as rejected: unsupported', await dlg.locator('[data-zai-pick="s2"]').count() === 0 && /Rejected: unsupported \(1\)/.test(await dlg.innerText()));
  check('review dialog: the gap names where it should come from', /Should come from: Rotor shield containment test report/.test(await dlg.innerText()));
  await shot('[data-zai-overlay] > div', 'ai_01_review_dialog.png');
  await dlg.locator('summary', { hasText: 'Rejected' }).click();
  check('the rejected list gives the reason', /does not exist in the project/.test(await dlg.innerText()));
  await shot('[data-zai-overlay] > div', 'ai_02_rejected_reason.png');
  await dlg.locator('[data-zai-pick="s1"]').check(); await dlg.locator('[data-zai-pick="s3"]').check();
  await dlg.locator('[data-zai-apply]').click();
  await page.waitForSelector('#sl-ack-overlay.show', { timeout: 8000 }).catch(() => {});
  check('Apply asks for acknowledgement first', await page.locator('#sl-ack-overlay.show').count() === 1);
  await page.locator('#sl-ack-overlay.show').screenshot({ path: path.join(SHOTS, 'ai_03_acknowledge.png') }).catch(() => {});
  await ack(); await sleep(400);
  const rid = await page.evaluate(() => SLPraModels.rotors()[0].id);
  const stored = await page.evaluate((r) => (SLEnv.get('projectConfig').praWriteups || {})[r] || [], rid);
  check('acknowledged: two entries stored with reviewer Proof Engineer, nothing from the fabricated one', stored.length === 2 && stored.every(n => n.acceptedBy === 'Proof Engineer') && !stored.some(n => /99 kJ/.test(n.text)), JSON.stringify(stored).slice(0, 300));
  const notesSel = '#cad-pra [data-zai-notes^="praWriteups|"]';
  check('the write-up shows in the Rotor burst tab with sources and reviewer', await page.locator(notesSel).count() === 1 && /Accepted by Proof Engineer/.test(await page.locator(notesSel).innerText()));
  await panel('ai_04_writeup_in_rotor_tab.png');
  await page.evaluate(() => { window.slPrompt = () => Promise.resolve('Engineer wording: the model result above is accepted for the PRA.'); });
  await page.locator(notesSel + ' [data-zai-note-edit$="|0"]').click(); await ackWait();
  check('edit through acknowledgement: new wording, editor named', /Engineer wording/.test(await page.locator(notesSel).innerText()) && /edited by Proof Engineer/.test(await page.locator(notesSel).innerText()));
  await page.locator(notesSel + ' [data-zai-note-del$="|1"]').click(); await ackWait();
  check('delete through acknowledgement: one entry left', await page.evaluate((r) => SLEnv.get('projectConfig').praWriteups[r].length, rid) === 1);
  await panel('ai_05_edited_and_deleted.png');
  // By function
  await clk('#cad-pra [data-pra-tab="func"]'); await sleep(400);
  check('By function shows the AI function summary button per function', await page.locator('#cad-pra [data-zai-lane="function.risk"]').count() >= 2);
  await clk('#cad-pra [data-pra-func="F-PITCH"] [data-zai-lane="function.risk"]');
  await page.waitForSelector('[data-zai-dialog]', { timeout: 15000 });
  await shot('[data-zai-overlay] > div', 'ai_06_function_dialog.png');
  await page.locator('[data-zai-overlay] [data-zai-pick="s1"]').check();
  await page.locator('[data-zai-overlay] [data-zai-apply]').click(); await ackWait();
  check('the function summary shows under F-PITCH', await page.locator('#cad-pra [data-pra-func="F-PITCH"] [data-zai-notes^="functionRiskNotes|"]').count() === 1);
  await panel('ai_07_function_summary.png');
  // Zonal page
  await page.evaluate(() => { const Z = window.ZONES; if (Z && !Z.all().length && Z.addZone) Z.addZone({ code: '100', name: 'Fuselage' }); switchTab('zonal'); }); await sleep(600); await ack();
  check('every zone on the zonal page carries the AI zonal draft button', await page.locator('#view-zonal [data-zai-lane="zonal.breakdown"]').count() >= 1 && await page.locator('#view-zonal [data-zai-lane="zonal.breakdown"]').count() === await page.evaluate(() => ZONES.all().length));
  await page.locator('#view-zonal [data-zai-lane="zonal.breakdown"]').first().click();
  await page.waitForSelector('[data-zai-dialog]', { timeout: 15000 });
  await shot('[data-zai-overlay] > div', 'ai_08_zonal_dialog.png');
  const zid = await page.evaluate(() => ZONES.all()[0].id), zsa0 = await page.evaluate(() => (SLEnv.get('zsaData') || []).length);
  check('zonal dialog: the valid statement offered, the fabricated one rejected, the gap named', await page.locator('[data-zai-overlay] [data-zai-pick="s1"]').count() === 1 && await page.locator('[data-zai-overlay] [data-zai-pick="s2"]').count() === 0 && /Rejected: unsupported \(1\)/.test(await page.locator('[data-zai-overlay]').innerText()) && /Should come from: Rotor shield/.test(await page.locator('[data-zai-overlay]').innerText()));
  await page.locator('[data-zai-overlay] [data-zai-pick="s1"]').check(); await page.locator('[data-zai-overlay] [data-zai-pick="s3"]').check();
  await page.locator('[data-zai-overlay] [data-zai-apply]').click(); await ackWait();
  const zrows = await page.evaluate((z) => (SLEnv.get('zsaData') || []).filter(r => r.aiDrafted && r.zoneId === z), zid);
  check('zonal apply after acknowledgement: two OPEN ZSA findings on the zone, reviewer named, assessor left for the engineer', await page.evaluate(() => (SLEnv.get('zsaData') || []).length) === zsa0 + 2 && zrows.length === 2 && zrows.every(r => r.findingStatus === 'open' && r.aiAcceptedBy === 'Proof Engineer' && !r.assessedBy), JSON.stringify(zrows).slice(0, 300));
  check('the zonal dialog closed after the acknowledgement', await page.locator('[data-zai-overlay]').count() === 0);
  await page.evaluate(() => document.querySelector('#view-zonal').scrollIntoView({ block: 'start' }));
  await page.locator('#view-zonal').screenshot({ path: path.join(SHOTS, 'ai_09_zonal_page.png') });
  // Precise: nothing to an AI endpoint and nothing carrying project content. Other calls are listed.
  // Known: crdt_gc.js lists the projects this account can open (GET /rest/v1/projects?select=id, ids
  // only, no project content) to tidy local copies; it is app housekeeping, not AI traffic.
  const after = requests.slice(reqBefore).filter(r => !r.url.startsWith(base));
  const AI = /api\.anthropic\.com|api\.voyageai\.com|api\.safetylabaero\.com\/(ai|v1\/messages|complete|chat)/i;
  const content = after.filter(r => r.body && /zsaData|praWriteups|praRotors|systemsData|ftaPages|Proof Engineer|FC-PRA/.test(r.body));
  after.forEach(r => console.log('    other request: ' + r.method + ' ' + r.url.slice(0, 120) + (r.body ? ' (body ' + r.body.length + ' bytes)' : '')));
  check('no AI request and no project content left the page during the stubbed AI proof (other calls listed above; the projects id list is crdt_gc housekeeping)', after.every(r => !AI.test(r.url)) && content.length === 0 && after.every(r => r.method === 'GET' || !r.body), after.map(r => r.method + ' ' + r.url).slice(0, 5).join(' | '));
  const nonBoot = errors.filter(e => !/favicon|net::ERR|Failed to load resource/.test(e));
  check('no page errors during the proof', nonBoot.length === 0, nonBoot.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
