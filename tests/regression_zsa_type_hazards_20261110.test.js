/* regression_zsa_type_hazards_20261110.test.js: each ZSA zone says what its kinds of equipment and materials bring.
 *
 * Waqas, 10 Nov 2026: "for the ZSA, we identify equipment in each zone their material type etc and we should be writing
 * up what each type of material/equipment brings forward hazard and what all that type of hazard can do to the safety of
 * the surrounding equipment and the aircraft itself." Confirmed ("yeah get it started please"): per zone, written from
 * the project, the wording a fixed library. Rebuild: zsa_type_hazards.js (SLZsaTypeHazards); zsa_autopilot.js 1.9 puts
 * its section in every zone and lets the engineer set what each unit is and what it is made of in the zone's Edit;
 * cad_viewer.js 2.9 keeps the STEP materials by part in the project when a model is opened.
 *   1  index.html: zsa_type_hazards.js 1.0 right before zsa_autopilot.js 1.9; cad_viewer.js 2.9
 *   2  the kind of a unit comes from its own name first (a FADEC on an engine is electronics, the ignition exciters are
 *      electrical power, the thrust reverser actuation is not the engine), never from its system's tag ahead of that
 *   3  materials map to the library (titanium, aluminum, carbon fiber, nickel alloy, plastics, seals); an unknown one says so
 *   4  the STEP materials are kept by part, materials only, and a second identical harvest writes nothing
 *   5  the wording: American English, no em dashes, every mechanism has its effect on the equipment around it
 *   6  browser, Aeolus HL-1, Z-NAC1: the section sits after the functions and before what one event loses, one table per
 *      kind with the four columns filled, the aircraft column naming a failure condition and its severity
 *   7  ...it carries only into the zones whose space touches it (Z-PYL1), never into every zone of the aircraft
 *   8  the zone's Edit has what each unit is and what it is made of; saving writes them to their own store, not the row,
 *      and the report then has the materials table (magnesium, titanium) and the newly typed unit
 *   9  the demo (Waqas: "demo's CAD model should come with materials and properties built in"): every part of the Aeolus HL-1
 *      model has a material and a description from the start, and a zone's materials table fills with nothing typed; a
 *      part of several materials counts each one
 * MUTATION PROOFS (SL_ZTH_MUTATE): sysfirst (the system's tag decides before the unit's name), allzones (a fire carries
 *   into every top zone), nofacts (what the engineer set is ignored), noaircraft (the aircraft column is left empty),
 *   nomaterials (no materials table), rowleak (the unit fields are written into the zone row), nodemomats (the demo model
 *   comes without its materials), firstonly (a part of several materials counts only one). Each must turn this red.
 * Run: node tests/regression_zsa_type_hazards_20261110.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_ZTH_MUTATE || '';
const rd = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function mutate(file, body) {
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing in ' + file + ': ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'sysfirst' && file === 'zsa_type_hazards.js') rep("    var t = nameKind(u.name);\n", "    if (s && s.equipType) return { type: s.equipType, from: 'the system' };\n    var t = nameKind(u.name);\n");
    if (MUT === 'allzones' && file === 'zsa_type_hazards.js') rep("if (bz && bo) { if (_touch(bz, bo)) nb.push(o.id); }", "if (true) { nb.push(o.id); }");
    if (MUT === 'nofacts' && file === 'zsa_type_hazards.js') rep("function facts(pid) { var f = _pc().zsaUnitFacts;", "function facts(pid) { return null; var f = _pc().zsaUnitFacts;");
    if (MUT === 'noaircraft' && file === 'zsa_type_hazards.js') rep("rows.push([h.name, STATE_WORD[h.state] || '', around.trim(), aircraftText(sysIds, into)]);", "rows.push([h.name, STATE_WORD[h.state] || '', around.trim(), '']);");
    if (MUT === 'nomaterials' && file === 'zsa_type_hazards.js') rep("    if (mk.length) {\n      var mrows", "    if (false) {\n      var mrows");
    if (MUT === 'nodemomats' && file === 'hl1_showcase.js') rep("pc.cadMaterials[sha] = m.mats; pc.cadProps[sha] = m.props;", "");
    if (MUT === 'firstonly' && file === 'zsa_type_hazards.js') rep("return out.length ? out : [materialClass(n)]; }", "return out.length ? out.slice(0, 1) : [materialClass(n)]; }");
    if (MUT === 'rowleak' && file === 'zsa_autopilot.js') rep("            if (/^unit\\.(kind|material)\\./.test(k)) return;\n", "");
    return body;
}
{
    const H = rd('index.html');
    check('1  zsa_type_hazards.js 1.0 right before zsa_autopilot.js 1.9; cad_viewer.js 2.9; headers say so', /zsa_type_hazards\.js\?v=1\.0" defer><\/script>\s*<script src="zsa_autopilot\.js\?v=1\.9"/.test(H) && H.indexOf('cad_viewer.js?v=2.9') > 0 && /SLZsaTypeHazards v1\.0/.test(rd('zsa_type_hazards.js').slice(0, 200)) && /SLZsaAuto v1\.9/.test(rd('zsa_autopilot.js').slice(0, 200)));
}
// ---- the module alone -------------------------------------------------------------------------------------------------
function loadModule(extra) {
    const w = Object.assign({ projectConfig: {}, systemsData: [] }, extra || {}); w.window = w;
    const ctx = { window: w, globalThis: w, console, module: undefined };
    vm.runInNewContext(rd('equipment_hazards.js'), Object.assign(ctx, { systemsData: w.systemsData }));
    vm.runInNewContext(mutate('zsa_type_hazards.js', rd('zsa_type_hazards.js')), ctx);
    return w;
}
{
    const sys = [{ id: 'sys-prp', name: 'Powerplant 1', equipType: 'rotating' }, { id: 'sys-hyd', name: 'Hydraulic System A' }];
    const w = loadModule({ systemsData: sys }), T = w.SLZsaTypeHazards;
    const k = (name, sysId) => { const r = T.unitType({ name, sysId, k: {} }); return r ? r.type : null; };
    const got = { fadec: k('FADEC, engine 1', 'sys-prp'), exc: k('Ignition exciters, engine 1', 'sys-prp'), trv: k('Thrust reverser actuation, engine 1', 'sys-prp'), oil: k('Oil tank, engine 1', 'sys-prp'), eng: k('Engine 1 (left outboard)', 'sys-prp'), acc: k('Brake accumulator', null), bogie: k('Main bogie, left aft', null), hact: k('Rudder actuator', 'sys-hyd'), plain: k('Bracket 7', 'sys-prp') };
    check('2  the kind comes from the unit\'s own name first; its system\'s tag only when the name and the CAD part say nothing', got.fadec === 'avionics' && got.exc === 'electrical_power' && got.trv === 'mechanical_control' && got.oil === 'oil' && got.eng === 'rotating' && got.acc === 'pressure_vessel' && got.bogie === 'wheel_brake' && got.hact === 'hydraulic' && got.plain === 'rotating', JSON.stringify(got));
    const m = n => T.materialClass(n).id;
    const mm = { ti: m('Ti-6Al-4V'), al: m('AL 7075-T6'), cf: m('IM7/8552 carbon'), ni: m('Inconel 718'), pk: m('PEEK'), vi: m('Viton seal'), mg: m('magnesium AZ91'), li: m('Li-ion cell'), un: m('unobtainium') };
    check('3  materials map to the library; one it does not know says so', mm.ti === 'titanium' && mm.al === 'aluminum' && mm.cf === 'cfrp' && mm.ni === 'steel' && mm.pk === 'polymer' && mm.vi === 'elastomer' && mm.mg === 'magnesium' && mm.li === 'lithium' && mm.un === 'other' && T.materialClass('unobtainium').unknown === true, JSON.stringify(mm));
    let saves = 0; w.scheduleAutosave = () => { saves++; };
    const attrs = { 'p1': { material: 'Ti-6Al-4V', description: 'x' }, 'p2': { description: 'no material' }, 'p3': { material: 'AL 6061' } };
    const n1 = T.harvestMaterials('sha-abc', attrs), s1 = saves, n2 = T.harvestMaterials('sha-abc', attrs);
    check('4  the STEP materials are kept by part, materials only, and an identical second harvest writes nothing', n1 === 2 && JSON.stringify(w.projectConfig.cadMaterials['sha-abc']) === JSON.stringify({ p1: 'Ti-6Al-4V', p3: 'AL 6061' }) && s1 === 1 && n2 === 2 && saves === 1, JSON.stringify({ n1, saves, m: w.projectConfig.cadMaterials }));
    const src = rd('zsa_type_hazards.js'), strings = (src.match(/'(?:[^'\\]|\\.)*'/g) || []).join(' ');
    check('5  the wording: American English, no em dashes, every mechanism has its effect on the equipment around it', src.indexOf('—') < 0 && !/aluminium|fibre|neighbour|colour/i.test(strings) && ['fire', 'heat', 'fluid', 'debris', 'pressure', 'mechanical', 'vibration', 'em', 'contamination', 'stored-energy'].every(x => T.AROUND[x] && T.AROUND[x].length > 40));
}

// ---- the browser: the Aeolus HL-1 demo ----------------------------------------------------------------------------------
const tick = ms => new Promise(r => setTimeout(r, ms));
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; ').replace(/; upgrade-insecure-requests/, ''); })();
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const pg = await (await browser.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
        const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(3000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); });
        for (let i = 0; i < 60 && !(await pg.evaluate(() => typeof window.loadHL1Demo === 'function')); i++) await tick(500);
        await pg.evaluate(() => window.loadHL1Demo());
        for (let i = 0; i < 60 && !(await pg.evaluate(() => !!(window.SLZsaAuto && SLZsaAuto.compute()))); i++) await tick(500);
        await tick(1500);
        const S = () => pg.evaluate(() => { SLZsaAuto.reset && SLZsaAuto.reset(); const s = SLZsaAuto.reportSections().find(x => x.code === 'Z-NAC1'); return s ? s.blocks : null; });
        const B = await S();
        const D9 = await pg.evaluate(() => { const res = SLZsaAuto.compute(), m = (projectConfig.cadModels || [])[0], mats = (projectConfig.cadMaterials || {})[m && m.sha256] || {}, props = (projectConfig.cadProps || {})[m && m.sha256] || {}; const parts = (SLCadZonal.partsOf ? SLCadZonal.partsOf(res.cadId) : m.parts) || []; return { parts: parts.length, mats: parts.filter(p => mats[p.pid]).length, props: parts.filter(p => props[p.pid] && props[p.pid].description).length }; });
        const hs = (B || []).map((b, i) => b.type === 'h' ? [i, b.text] : null).filter(Boolean);
        const iB = hs.findIndex(h => /equipment and materials in the zone bring/.test(h[1])), iF = hs.findIndex(h => /^Functions the equipment performs/.test(h[1])), iE = hs.findIndex(h => /^What one event in the zone loses/.test(h[1]));
        const sec = iB >= 0 ? B.slice(hs[iB][0], iB + 1 < hs.length ? hs[iB + 1][0] : undefined) : [];
        const tables = sec.filter(b => b.type === 'table' && /-kind-/.test(b.id));
        const kinds = tables.map(t => t.id.replace(/^.*-kind-/, '')).sort();
        const fourCols = tables.every(t => t.columns.length === 4 && t.rows.length && t.rows.every(r => r.length === 4 && r.every(c => String(c).trim().length > 0)));
        const air = tables.every(t => t.rows.every(r => /(Catastrophic|Hazardous|Major|Minor|No Safety Effect): FC-/.test(r[3])));
        check('6  Z-NAC1: the section sits after the functions and before what one event loses, one table per kind, four columns filled, the aircraft column naming a failure condition and its severity', iB > iF && iF >= 0 && iE > iB && ['avionics', 'electrical_power', 'fuel', 'oil', 'pneumatic_bleed', 'rotating', 'wiring'].every(k => kinds.indexOf(k) >= 0) && fourCols && air, JSON.stringify({ iF, iB, iE, kinds, fourCols, air, sample: tables[0] && tables[0].rows[0] }));
        const fire = tables.find(t => /-kind-fuel$/.test(t.id)), fr = fire && fire.rows.find(r => /Fire/.test(r[0]));
        check('7  ...a fire carries only into the zones whose space touches it (Z-PYL1), never into every zone of the aircraft', !!fr && /carry into Z-PYL1: nothing credited/.test(fr[2]) && !/Z-NAC2|Z-CREW|Z-NOSE/.test(fr[2]), fr && fr[2].slice(-200));
        const ed = await pg.evaluate(() => {
            const row = (typeof zsaData !== 'undefined' ? zsaData : []).find(r => r.zoneId === 'Z-NAC1');
            const F = SLZsaAuto.editFields(row ? row.internalId : null).fields, u = SLZsaAuto.compute().byCode['Z-NAC1'].units;
            const pick = re => u.find(x => re.test(x.name));
            const oil = pick(/Oil tank/), eng = pick(/^Engine 1/), det = pick(/fire detection/);
            const v = { zoneId: 'Z-NAC1' }; v['unit.material.' + oil.pid] = 'magnesium AZ91'; v['unit.material.' + eng.pid] = 'Ti-6Al-4V'; v['unit.kind.' + det.pid] = 'electrical_power';
            const r = SLZsaAuto.saveZone(v, row ? { internalId: row.internalId } : {});
            const row2 = zsaData.find(x => x.zoneId === 'Z-NAC1');
            return { fields: F.filter(f => /^unit\.(kind|material)\./.test(f.key)).length, units: u.length, ok: r.ok, facts: projectConfig.zsaUnitFacts && projectConfig.zsaUnitFacts[oil.pid], leak: Object.keys(row2 || {}).filter(k => /^unit\./.test(k)), det: det.name };
        });
        const B2 = await S(), all = (B2 || []).filter(b => b.type === 'table');
        const mt = all.find(t => /-materials$/.test(t.id)), ep = all.find(t => /-kind-electrical_power$/.test(t.id));
        check('8  the zone\'s Edit has what each unit is and is made of; saving writes its own store, not the row; the report then has the materials and the newly set kind', ed.fields === ed.units * 2 && ed.ok && ed.facts && ed.facts.material === 'magnesium AZ91' && ed.leak.length === 0 && !!mt && mt.rows.some(r => /^Magnesium alloy/.test(r[0]) && /Oil tank/.test(r[1])) && mt.rows.some(r => /^Titanium alloy/.test(r[0])) && !!ep && /fire detection/i.test(JSON.stringify(sec.concat(B2).filter(b => b.type === 'p' && /^Electrical power/.test(b.text)).map(b => b.text))), JSON.stringify({ ed, mt: mt && mt.rows.map(r => r[0]) }));
        const mt0 = sec.find(b => b.type === 'table' && /-materials$/.test(b.id)), noRec = sec.some(b => b.type === 'p' && /not on record/.test(b.text));
        const tr = mt0 && mt0.rows.filter(r => /Thrust reverser actuation/.test(r[1])).map(r => r[0].replace(/ \(.*$/, ''));
        check('9  the demo model has a material and a description for every part from the start; Z-NAC1\'s materials table fills with nothing typed, and a part of several materials counts each one', D9.parts > 2000 && D9.mats === D9.parts && D9.props === D9.parts && !!mt0 && !noRec && mt0.rows.some(r => /^Titanium alloy/.test(r[0])) && tr && tr.length >= 3, JSON.stringify({ D9, rows: mt0 && mt0.rows.map(r => r[0].slice(0, 40)), noRec, tr }));
        check('8  no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } catch (e) { check('the browser part ran to the end', false, e && e.stack); }
    await browser.close(); srv.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
