#!/usr/bin/env node
/*
 * Regression, browser: the exchange with Sys Lab on the real app (site/zonal_exchange.js), 15 Oct 2026.
 *
 * On the Vayu V-1 demo (a real Safety Lab demo project: 19 systems, 14 ZSA zones, 10 PRA rows, PSSA fault trees),
 * an engineer's zonal set-up is scripted the way the CAD page does it: the zone list (CSV rows, the Vayu ZSA zone
 * codes with boxes), a CAD model of the installation (parts named as the CAD tool would), equipment links confirmed
 * by name, containment applied, two particular-risk volumes (lift rotor 1 burst, forward battery bay thermal
 * runaway), and basic events declared against the equipment that realizes them (node identity, as the Node
 * identity panel records it). Then, through the screen:
 *   [A] the CAD Model page shows the Sys Lab exchange panel under Particular risks; Export zones and risks for Sys
 *       Lab downloads a file that verifies (fingerprint) and holds the Vayu zone tree, parts and risk results
 *   [B] the same picture is in the project export (.slproj, zonal-exchange.json), and the reader ignores it
 *   [C] the Zonal Model page has the same export button
 *   [D] the Impact panel of a risk volume says Sys Lab functions are not known yet (nothing imported)
 *   [E] when tests/fixtures/zonal_exchange/vayu-syslab-physical.json exists (written by Sys Lab's browser test from
 *       this file): Import Sys Lab physical architecture, the acknowledgement asked, Accept all exact matches, and
 *       the Impact panel of the rotor burst names the Sys Lab functions it reaches
 * Writes tests/fixtures/zonal_exchange/vayu-safetylab-zonal.json (the realistic fixture Sys Lab's tests read) and
 * screenshots to ../zones_shots/ when that folder exists.
 *
 * Run: node tests/regression_zonal_exchange_ui_20261015.test.js   (SKIP when Playwright or Chromium is missing)
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..'), SITE = path.join(ROOT, 'site'), FIX = path.join(__dirname, 'fixtures', 'zonal_exchange');
const SHOTS = path.resolve(ROOT, '..', 'zones_shots');
let pass = 0, fail = 0;
const J = x => JSON.stringify(x);
const sb_codes15 = S => S.codes === 15 && S.dup === 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' - ' + d : '')); } };

// The engineer's set-up, run in the page (plain data, no AI).
const SETUP = () => {
    const C = window.SLCadZonal, box = (x0, x1, y0, y1, z0, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
    // the zone list, as a CSV from the CAD tool: the Vayu ZSA zone codes, in aircraft axes (mm, x aft, y right, z up)
    const z = (code, name, parentCode, b) => ({ code, name, parentCode, xMin: b.min[0], yMin: b.min[1], zMin: b.min[2], xMax: b.max[0], yMax: b.max[1], zMax: b.max[2] });
    const rows = [
        z('Z-FUS', 'Fuselage', '', box(0, 8000, -1000, 1000, -800, 1250)),
        z('Z-NOSE', 'Nose bay', 'Z-FUS', box(0, 1500, -1000, 1000, -800, 1250)),
        z('Z-FCC', 'Avionics bay, flight control computers', 'Z-FUS', box(1500, 2200, -1000, 1000, -800, 0)),
        z('Z-CAB', 'Cabin and flight deck', 'Z-FUS', box(1500, 5000, -1000, 1000, 0, 1000)),
        z('Z-EWIS', 'High-voltage and signal routing spine', 'Z-FUS', box(1500, 7500, -200, 200, 1000, 1250)),
        z('Z-PACK-F', 'Forward battery bay', 'Z-FUS', box(2200, 3600, -1000, 1000, -800, 0)),
        z('Z-PACK-A', 'Aft battery bay', 'Z-FUS', box(3600, 5000, -1000, 1000, -800, 0)),
        z('Z-THM', 'Thermal management bay', 'Z-FUS', box(5000, 6500, -1000, 1000, -800, 1000)),
        z('Z-LDG', 'Landing gear bay', 'Z-FUS', box(6500, 8000, -1000, 1000, -800, 1000)),
        z('Z-WING-L', 'Left wing and booms', '', box(800, 7200, -6000, -1000, 700, 1500)),
        z('Z-BOOM-FL', 'Forward-left rotor boom', 'Z-WING-L', box(800, 2500, -3400, -2600, 900, 1500)),
        z('Z-BOOM-AL', 'Aft-left rotor boom', 'Z-WING-L', box(5500, 7200, -3400, -2600, 900, 1500)),
        z('Z-WING-R', 'Right wing and booms', '', box(800, 7200, 1000, 6000, 700, 1500)),
        z('Z-BOOM-FR', 'Forward-right rotor boom', 'Z-WING-R', box(800, 2500, 2600, 3400, 900, 1500)),
        z('Z-BOOM-AR', 'Aft-right rotor boom', 'Z-WING-R', box(5500, 7200, 2600, 3400, 900, 1500))
    ];
    const imp = C.importZoneList(rows);
    const P = (pid, name, b, x) => Object.assign({ pid, name, partNumber: null, path: ['V-1', name], bbox: b }, x || {});
    const parts = [
        P('p-adc1', 'Air data computer 1', box(300, 500, -300, -100, 200, 400), { partNumber: 'ADC-7701' }),
        P('p-adc2', 'Air data computer 2', box(300, 500, 100, 300, 200, 400), { partNumber: 'ADC-7701' }),
        P('p-fcc-a', 'FCC lane A', box(1600, 1700, -600, -400, -600, -400), { partNumber: 'FCC-3100' }),
        P('p-fcc-b', 'FCC lane B', box(1750, 1850, -100, 100, -600, -400), { partNumber: 'FCC-3100' }),
        P('p-fcc-c', 'FCC lane C', box(1900, 2000, 400, 600, -600, -400), { partNumber: 'FCC-3100' }),
        P('p-pfd', 'Primary flight display', box(1600, 1750, -300, 300, 600, 800)),
        P('p-seat', 'Crew seat', box(2000, 2500, -400, 0, 0, 900)),
        P('p-pk1', 'Battery pack 1', box(2300, 3500, -900, -350, -700, -100), { partNumber: 'BP-90' }),
        P('p-pk2', 'Battery pack 2', box(2300, 3500, -300, 300, -700, -100), { partNumber: 'BP-90' }),
        P('p-pk3', 'Battery pack 3', box(2300, 3500, 350, 900, -700, -100), { partNumber: 'BP-90' }),
        P('p-pk4', 'Battery pack 4', box(3700, 4900, -900, -350, -700, -100), { partNumber: 'BP-90' }),
        P('p-bms', 'Battery management controller', box(2250, 2350, -100, 100, -780, -720)),
        P('p-pdu', 'HV distribution unit', box(3500, 3700, -100, 100, -500, -300)),
        P('p-harness', 'HV harness spine', box(1600, 7400, -100, 100, 1050, 1200)),
        P('p-thm', 'Coolant pump and heat exchanger', box(5200, 5800, -400, 400, -600, 200)),
        P('p-gear', 'Main gear leg', box(6800, 7400, -600, 600, -800, 0)),
        P('p-mca1', 'Motor controller group 1', box(1300, 1500, -3100, -2900, 950, 1050)),
        P('p-mca2', 'Motor controller group 2', box(1300, 1500, 2900, 3100, 950, 1050)),
        P('p-mca3', 'Motor controller group 3', box(6200, 6400, -3100, -2900, 950, 1050)),
        P('p-mot1', 'Lift rotor 1 motor', box(1000, 1200, -3100, -2900, 1100, 1300)),
        P('p-mot2', 'Lift rotor 2 motor', box(1000, 1200, 2900, 3100, 1100, 1300)),
        P('p-mot3', 'Lift rotor 3 motor', box(6800, 7000, -3100, -2900, 1100, 1300)),
        P('p-mot4', 'Lift rotor 4 motor', box(6800, 7000, 2900, 3100, 1100, 1300)),
        P('p-rot1-disc', 'Lift rotor 1 hub and blades', box(600, 1600, -3500, -2500, 1300, 1350)),
        P('p-eha-a', 'Pitch actuator EHA lane A', box(6000, 6200, -2000, -1800, 800, 1000)),
        P('p-eha-b', 'Pitch actuator EHA lane B', box(6000, 6200, 1800, 2000, 800, 1000)),
        P('p-ips-l', 'Leading edge heater mat left', box(3000, 3100, -5500, -1500, 1100, 1200))
    ];
    const m = C.addCadModel({ fileName: 'vayu_v1_installation.step', sha256: 'vayu-v1-rev-c', revision: 'C', units: 'mm', parts }).model;
    // equipment links: each confirmed by the engineer (the CAD page's Confirm), one installed copy at a time
    const L = { 'p-adc1': 'sys-avi', 'p-adc2': 'sys-avi', 'p-pfd': 'sys-avi', 'p-fcc-a': 'sys-fcc', 'p-fcc-b': 'sys-fcc', 'p-fcc-c': 'sys-fcc', 'p-seat': 'sys-occ', 'p-pk1': 'sys-pk1', 'p-pk2': 'sys-pk2', 'p-pk3': 'sys-pk3', 'p-bms': 'sys-bms', 'p-pdu': 'sys-eps',
        'p-harness': 'sys-ews', 'p-thm': 'sys-thm', 'p-gear': 'sys-ldg', 'p-mca1': 'sys-mca', 'p-mca2': 'sys-mca', 'p-mca3': 'sys-mca', 'p-mot1': 'sys-rot1', 'p-mot2': 'sys-rot2', 'p-mot3': 'sys-rot3', 'p-mot4': 'sys-rot4', 'p-eha-a': 'sys-fcs', 'p-eha-b': 'sys-fcs', 'p-ips-l': 'sys-ips' };
    Object.keys(L).sort().forEach(pid => C.confirmLink(m.id, pid, L[pid], 'W. Engineer', { at: '2026-10-15T08:00:00Z' }));
    const placed = C.applyContainment(m.id, { apply: true, by: 'W. Engineer' });
    // particular risks: lift rotor 1 burst (fragments in the rotor plane, AC 20-128A intermediate band) and a thermal
    // runaway in the forward battery bay
    C.addRiskVolume({ id: 'prv-rot1-burst', kind: 'rotorBurst', label: 'Lift rotor 1 hub or blade liberation', source: 'manual', praId: 'PRA-002', shape: { kind: 'disk-sector', center: [1100, -3000, 1325], axis: [0, 0, 1], range: 4500, fragment: 'intermediate' } });
    C.addRiskVolume({ id: 'prv-pack-f-fire', kind: 'fire', label: 'Forward battery bay thermal runaway', source: 'manual', praId: 'PRA-001', shape: { kind: 'box', min: [2200, -1000, -800], max: [3600, 1000, 0] } });
    // basic events declared against the equipment that realizes them (the Node identity panel's record)
    const rule = [[/Rotor (\d) (motor|controller)/, mm => ({ kind: 'item', systemId: 'sys-rot' + mm[1] })], [/Rotor \d high-voltage feed/, () => ({ kind: 'resource', providerSystemId: 'sys-ews' })],
        [/Computing lane|erroneous command|Command\/monitor/, () => ({ kind: 'item', systemId: 'sys-fcc' })], [/Controller group/, () => ({ kind: 'item', systemId: 'sys-mca' })],
        [/Battery pack (\d)/, mm => ({ kind: 'item', systemId: 'sys-pk' + mm[1] })], [/Cross-tie contactor/, () => ({ kind: 'item', systemId: 'sys-eps' })], [/State-of-charge|Miscompare/, () => ({ kind: 'item', systemId: 'sys-bms' })],
        [/Pitch actuation/, () => ({ kind: 'item', systemId: 'sys-fcs' })], [/inertial|air-data|Voting monitor/, () => ({ kind: 'item', systemId: 'sys-avi' })], [/Cooling loop/, () => ({ kind: 'item', systemId: 'sys-thm' })],
        [/thermal runaway|Vent-gas|Pack enclosure|Per-module/, () => ({ kind: 'item', systemId: 'sys-bms' })], [/Brake channel|Parking/, () => ({ kind: 'item', systemId: 'sys-ldg' })]];
    let tagged = 0;
    ftaPages.forEach(pg => (function w(n) { if (!n) return; if (n.type !== 'gate') { for (const [re, f] of rule) { const mm = re.exec(n.name || ''); if (mm) { n.identity = f(mm); tagged++; break; } } return; } (n.children || n._children || []).forEach(w); })(pg.root));
    try { scheduleAutosave(); } catch (_) {}
    return { codes: C && window.ZONES ? ['Z-FUS','Z-NOSE','Z-FCC','Z-CAB','Z-EWIS','Z-PACK-F','Z-PACK-A','Z-THM','Z-LDG','Z-WING-L','Z-BOOM-FL','Z-BOOM-AL','Z-WING-R','Z-BOOM-FR','Z-BOOM-AR'].filter(c => { const z = window.ZONES.byCode(c); return z && z.volume; }).length : 0, dup: window.ZONES && window.ZONES.duplicateCodes ? window.ZONES.duplicateCodes().length : -1, cadId: m.id, created: imp.created.length, updated: imp.updated.length, unchanged: imp.unchanged.length, issues: imp.issues, placed: placed.assign.length, conflictSys: placed.conflicts.map(c => c.sysId).sort(), tagged };
};

(async () => {
    let chromium;
    try { chromium = require('playwright').chromium; } catch (e) { try { chromium = require('/opt/npm-tools/node_modules/playwright').chromium; } catch (_) { console.log('  SKIP  playwright is not installed'); console.log('\n0 passed, 0 failed'); return; } }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm' };
    const server = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
        const f = path.join(SITE, p);
        if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    let browser;
    try { browser = await chromium.launch(); } catch (e) { console.log('  SKIP  no Chromium (' + String(e.message).split('\n')[0] + ')'); server.close(); console.log('\n0 passed, 0 failed'); return; }
    const shoot = async (page, name) => { if (fs.existsSync(SHOTS)) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); };
    try {
        const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
        const page = await ctx.newPage();
        const errors = []; page.on('pageerror', e => errors.push(String(e)));
        await page.goto('http://127.0.0.1:' + server.address().port + '/');
        await page.waitForFunction(() => typeof window.loadVayuDemo === 'function' && window.SLCadZonal && window.SLZonalExchange && window.SLPraModels, null, { timeout: 60000 });
        await page.evaluate(async () => {
            const ung = () => { document.querySelectorAll('[aria-label="Sign in to Safety Lab Aero"]').forEach(g => g.remove()); document.documentElement.classList.remove('sl-auth-gate-blocked');
                const t = document.getElementById('signup-modal-title'); if (t) { let o = t; while (o && o.parentElement && o.parentElement !== document.body) o = o.parentElement; if (o) o.style.display = 'none'; }
                document.querySelectorAll('.modal-overlay, .modal').forEach(o => { if (getComputedStyle(o).display !== 'none' && !o.closest('.sde') && !o.classList.contains('sl-ack-overlay') && !o.classList.contains('sl-dialog-overlay')) o.style.display = 'none'; }); };
            window.__ung = ung; ung();
            await loadVayuDemo(); await new Promise(r => setTimeout(r, 1500)); ung();
        });
        const S = await page.evaluate(SETUP);
        check('setup: the 15 zones of the list are in the register (one zone per code, 19 Oct 2026: the Vayu ZSA rows already name most of them, so the list gives those their boxes rather than a second zone), single-zone equipment placed, the three systems spread over zones reported as such (not placed), basic events declared', S.created + S.updated + S.unchanged === 15 && sb_codes15(S) && !S.issues.length && S.placed >= 15 && J(S.conflictSys) === J(['sys-avi', 'sys-fcs', 'sys-mca']) && S.tagged >= 30, JSON.stringify(S));
        // keep the change acknowledgement out of the way of the scripted set-up
        await page.evaluate(() => document.querySelectorAll('.sl-ack-overlay .sl-ack-keep').forEach(k => k.click()));

        console.log('\n[A] the CAD Model page: panel and export');
        await page.evaluate(() => { switchTab('cad'); window.__ung(); });
        await page.waitForTimeout(2500);
        await page.evaluate(() => { window.__ung(); if (window.SLCadPage && SLCadPage.state) SLCadPage.state.cadId = SLCadZonal.latestCadId(); try { window.SLZonalExchange.renderPanel(); } catch (e) {} });
        await page.waitForSelector('#cad-syslab', { timeout: 20000 });
        const panel = await page.evaluate(() => { const el = document.getElementById('cad-syslab'), pra = document.getElementById('cad-pra'); return { text: el.innerText, after: !!(pra && pra.nextSibling === el), color: getComputedStyle(el).color }; });
        check('the Sys Lab exchange panel sits right under Particular risks', panel.after && /Sys Lab exchange/.test(panel.text) && /No Sys Lab file imported yet/.test(panel.text), JSON.stringify(panel).slice(0, 300));
        const rgb = (panel.color.match(/\d+/g) || []).map(Number);
        check('its text is near black (no gray text)', rgb.length >= 3 && Math.max(rgb[0], rgb[1], rgb[2]) <= 40, panel.color);
        await page.evaluate(() => document.getElementById('cad-syslab').scrollIntoView());
        await shoot(page, 'sl_01_cad_page_exchange_panel');
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#cad-syslab [data-zx-act="export"]')]);
        const tmp = path.join(require('os').tmpdir(), 'vayu-zonal-' + process.pid + '.json'); await dl.saveAs(tmp);
        const pic = JSON.parse(fs.readFileSync(tmp, 'utf8'));
        check('the download is named for the project and is a safetylab-zonal file', /\.safetylab-zonal\.json$/.test(dl.suggestedFilename()) && pic.format === 'safetylab-zonal' && pic.version === 1, dl.suggestedFilename());
        const verified = await page.evaluate(p => window.SLZonalExchange.checkPicture(p), pic);
        check('it verifies by its fingerprint', verified === null, verified);
        const zcodes = pic.zones.map(z => z.code);
        check('the Vayu zone tree with parents', ['Z-NOSE', 'Z-FCC', 'Z-CAB', 'Z-EWIS', 'Z-PACK-F', 'Z-BOOM-FL', 'Z-WING-L'].every(c => zcodes.includes(c)) && pic.zones.find(z => z.code === 'Z-BOOM-FL').parentCode === 'Z-WING-L');
        const rot = pic.risks.find(r => r.id === 'prv-rot1-burst'), fire = pic.risks.find(r => r.id === 'prv-pack-f-fire');
        check('lift rotor 1 burst: fragments in the rotor plane cut the HV harness spine and the left heater mat (the motor under the hub is outside the band); through the fault trees, Catastrophic', rot && J(rot.equipment) === J(['sys-ews', 'sys-ips']) && rot.worst === 'Catastrophic' && rot.conditions.some(c => c.fcId === 'FC-DEP01'), JSON.stringify(rot && { e: rot.equipment, w: rot.worst, c: rot.conditions.map(c => c.fcId) }));
        check('the forward bay thermal runaway reaches the three packs and the battery management controller, with the PRA mitigation', fire && ['sys-pk1', 'sys-pk2', 'sys-pk3', 'sys-bms'].every(s => fire.equipment.includes(s)) && !!fire.mitigation, JSON.stringify(fire && { e: fire.equipment, m: fire.mitigation }));
        check('containment: the HV distribution unit straddles the battery bays', (pic.parts.find(p => p.pid === 'p-pdu') || {}).straddles !== undefined);
        check('Safety Lab says what is missing (equipment without a CAD part)', pic.gaps.some(g => /no confirmed CAD part/.test(g)));
        fs.mkdirSync(FIX, { recursive: true });
        const fixed = Object.assign({}, pic, { exportedAt: '2026-10-15T12:00:00.000Z' });
        fs.writeFileSync(path.join(FIX, 'vayu-safetylab-zonal.json'), JSON.stringify(fixed) + '\n');

        console.log('\n[B] the project export carries it');
        const bundle = await page.evaluate(async () => {
            const u8 = await _bundleToZip(_snapshotProject(), _bundleZonalExtra());
            const files = await _zipParse(u8), back = await _bundleFromZip(u8);
            const x = files['zonal-exchange.json'] ? JSON.parse(files['zonal-exchange.json']) : null;
            return { has: !!x, ok: x ? window.SLZonalExchange.checkPicture(x) : 'missing', zones: x ? x.zones.length : 0, readBack: Object.keys(back).filter(k => /zonal/i.test(k)) };
        });
        check('the .slproj holds zonal-exchange.json, verified, and the reader takes nothing from it', bundle.has && bundle.ok === null && bundle.zones === 15 && bundle.readBack.length === 0, JSON.stringify(bundle));

        console.log('\n[C] the Zonal Model page has the export too');
        await page.evaluate(() => { switchTab('zonal'); window.__ung(); }); await page.waitForTimeout(800);
        const zbtn = await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Export zones and risks for Sys Lab/.test(b.textContent) && b.offsetParent));
        check('Zonal Model page: Export zones and risks for Sys Lab', zbtn);
        await shoot(page, 'sl_02_zonal_model_export_button');

        console.log('\n[D] Impact of a risk volume before any Sys Lab import');
        await page.evaluate(() => { switchTab('cad'); window.__ung(); }); await page.waitForTimeout(1500);
        const imp0 = await page.evaluate(() => { SLCadPage.state.focus = { volumeId: 'prv-rot1-burst' }; SLCadPage.renderPanels(); return document.getElementById('cad-impact').innerText; });   // what clicking the volume in the viewer does
        check('the Impact panel says the Sys Lab functions are not known yet', /Sys Lab functions: not known yet/.test(imp0), imp0.slice(0, 400));

        const phys = path.join(FIX, 'vayu-syslab-physical.json');
        console.log('\n[E] Import the physical architecture Sys Lab exported for Vayu');
        if (!fs.existsSync(phys)) { console.log('  SKIP  ' + phys + ' not there yet (written by Sys Lab\'s zones_ui.py from vayu-safetylab-zonal.json)'); }
        else {
            await page.evaluate(() => { const n = document.getElementById('cad-by'); if (n) { n.value = 'W. Engineer'; n.dispatchEvent(new Event('input')); } });
            const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#cad-syslab [data-zx-act="import"]')]);
            await fc.setFiles(phys);
            await page.waitForTimeout(1200);
            const asked = await page.evaluate(() => { const o = document.querySelector('.sl-ack-overlay'); const t = o ? o.innerText : ''; document.querySelectorAll('.sl-ack-overlay .sl-ack-keep').forEach(k => k.click()); return t; });
            await page.waitForTimeout(800);
            const st1 = await page.evaluate(() => { const r = projectConfig.sysLabPhysical; return r ? { n: r.elements.length, by: r.by, fns: r.functions.length } : null; });
            check('imported: elements and functions stored, with who', st1 && st1.n > 5 && st1.by === 'W. Engineer' && st1.fns > 5, JSON.stringify(st1) + ' ' + asked.slice(0, 200));
            const mm = await page.evaluate(() => SLZonalExchange.matchSysLab());
            check('Sys Lab\'s mappings come back as exact matches to accept', mm.exact.length >= 5 && mm.linked.length === 0, JSON.stringify({ e: mm.exact.length, c: mm.candidates.length, u: mm.unmatched.length }));
            await shoot(page, 'sl_03_syslab_import_mapping_review');
            await page.click('#cad-syslab [data-zx-act="accept-exact"]'); await page.waitForTimeout(800);
            await page.evaluate(() => document.querySelectorAll('.sl-ack-overlay .sl-ack-keep').forEach(k => k.click())); await page.waitForTimeout(600);
            const mm2 = await page.evaluate(() => SLZonalExchange.matchSysLab());
            check('Accept all: every exact match mapped', mm2.exact.length === 0 && mm2.linked.length === mm.exact.length, JSON.stringify({ l: mm2.linked.length }));
            const imp1 = await page.evaluate(() => { SLCadPage.state.focus = { volumeId: 'prv-rot1-burst' }; SLCadPage.renderPanels(); return document.getElementById('cad-impact').innerText; });
            check('the rotor burst Impact names the Sys Lab functions it reaches', /Sys Lab functions reached: [1-9]/.test(imp1), imp1.slice(0, 600));
            await page.evaluate(() => document.getElementById('cad-impact').scrollIntoView()); await shoot(page, 'sl_04_impact_with_syslab_functions');
            await page.evaluate(() => document.getElementById('cad-syslab').scrollIntoView()); await shoot(page, 'sl_05_exchange_panel_mapped');
            const vt = await page.evaluate(() => document.querySelector('[data-zx-vols]') ? document.querySelector('[data-zx-vols]').innerText : '');
            check('the panel lists, per risk, the Sys Lab functions reached', /Lift rotor 1 hub or blade liberation/.test(vt), vt.slice(0, 300));
        }
        check('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
    } finally { await browser.close(); server.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); });
