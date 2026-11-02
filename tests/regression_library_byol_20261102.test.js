/* regression_library_byol_20261102.test.js: licensed reliability data the customer loads (library_byol.js v1.0, item 46).
 *
 * Waqas, 2 Nov 2026: "yes lets get the rest done", on this scope: NPRD, EPRD and FMD become named licensed sources; the
 * library CSV carries environment, quality, record count, data date and a failure mode split; the part keeps all of it,
 * so the FMEA and the fault tree show where a number came from.
 * Checked:
 *   [U] the reader: both CSV shapes, percentages read as percentages, a bad split left out and named (never fixed), a bad
 *       record count named, licensed sources recognized, the imported split before the built-in one, the export cell
 *       loads back the same split.
 *   [A] in the app: Library import of an NPRD file and an FMD split file; the table shows the record detail; an NPRD rate
 *       is used as published (the project's environment factor is not applied on top); a basic event using the part
 *       names it as its source with the detail and the data date; the FMEA mode picker offers the imported split and
 *       the mode rate is the share x the event's rate; the library export carries the detail and loads back the same.
 * MUTATION PROOFS: SL_BYOL_MUTATE=fix (a split that does not add up is scaled to 1 instead of left out), =derate (the
 *   environment factor is applied to an NPRD rate), =builtin (the built-in split wins over the imported one), =nolib (the
 *   rate source reads the built-in library only) must fail.
 * Run: node tests/regression_library_byol_20261102.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1200) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_BYOL_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'fix' && file === 'library_byol.js') return body.replace("if (Math.abs(sum - 1) > TOL) return { ok: false, why: 'the shares add up to ' + (Math.round(sum * 1000) / 1000) + ', not 1' };", "if (Math.abs(sum - 1) > TOL) modes.forEach(function (m) { m.alphaFm = m.alphaFm / sum; });");
    if (MUT === 'derate' && file === 'helpers_modules.js') return body.replace("if (typeof SLLibraryByol !== 'undefined' && SLLibraryByol.asPublished(entry)) return entry.lambda;", '');
    if (MUT === 'builtin' && file === 'library_byol.js') return body.replace("if (e && Array.isArray(e.modes) && e.modes.length) return { modes: e.modes, from: 'imported', source: S(e.modes[0].source || e.source) };", '');
    if (MUT === 'nolib' && file === 'rate_sources.js') return body.replace("if (typeof getActiveLibrary === 'function') return getActiveLibrary(); ", '');
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);

// ---------------------------------------------------------------- [U] the reader, in Node
console.log('[U] the reader' + (MUT ? ' (MUTATION ' + MUT + ')' : ''));
(function unit() {
    const ctx = vm.createContext({ console });
    vm.runInContext(fs.readFileSync(path.join(SITE, 'reliability_data.js'), 'utf8') + '\n;globalThis.COMPONENT_LIBRARY = COMPONENT_LIBRARY; globalThis.FAILURE_MODE_DISTRIBUTIONS = FAILURE_MODE_DISTRIBUTIONS;', ctx);
    vm.runInContext('globalThis.projectConfig = { customLibrary: {} };', ctx);
    vm.runInContext(mutate('library_byol.js', fs.readFileSync(path.join(SITE, 'library_byol.js'), 'utf8')), ctx);
    const B = ctx.SLLibraryByol;
    const parts = 'Key,Name,Group,Lambda,Source,Environment,Quality,Records,Data_Date,Modes\n' +
        'nprd_relay_gf,"Relay, general purpose",Relays,2.1e-6,NPRD-2023,GF,Commercial,14,2019,"Contacts fail open=0.55; Contacts fail closed=0.30; Coil open=0.15"\n' +
        'nprd_valve_aif,Valve solenoid,Valves,8.0e-6,NPRD-2023,AIF,Military,6,2017,"Fails open=0.5; Fails closed=0.4"\n' +
        'eprd_cap,Capacitor ceramic,Capacitors,3.0e-9,EPRD-2014,GB,Commercial,two,2012,\n' +
        'bad_rate,Bad,X,-1,NPRD-2023,GF,,,,\n';
    const r = B.parse(parts);
    check('[U] a parts CSV keeps environment, quality, record count, data date and the split', r.kind === 'parts' && r.parts.nprd_relay_gf.env === 'GF' && r.parts.nprd_relay_gf.quality === 'Commercial' && r.parts.nprd_relay_gf.records === 14 && r.parts.nprd_relay_gf.dataDate === '2019' && r.parts.nprd_relay_gf.modes.length === 3 && r.parts.nprd_relay_gf.modes[0].source === 'NPRD-2023', JSON.stringify(r.parts.nprd_relay_gf));
    check('[U] a split that adds up to 0.9 is left out and named, never scaled; the part still loads', r.parts.nprd_valve_aif && !r.parts.nprd_valve_aif.modes && r.skipped.some(s => s.key === 'nprd_valve_aif' && /add up to 0\.9/.test(s.why)), JSON.stringify([r.parts.nprd_valve_aif, r.skipped]));
    check('[U] a record count that is not a whole number is named; a row with no usable rate is left out', r.parts.eprd_cap && r.parts.eprd_cap.records === undefined && r.skipped.some(s => s.key === 'eprd_cap' && /record count/.test(s.why)) && !r.parts.bad_rate && r.skipped.some(s => s.key === 'bad_rate'), JSON.stringify(r.skipped));
    const sp = B.parse('Key,Mode,Alpha,Source\nfaa_hyd_actuator,Jams,60,FMD-2016\nfaa_hyd_actuator,Leaks,40,FMD-2016\nnot_a_key,Open,1,FMD-2016\nnprd_relay_gf,Open,0.5,FMD-2016\nnprd_relay_gf,Open,0.5,FMD-2016\n');
    check('[U] an FMD split file: percentages read as percentages; a mode listed twice is left out and named', sp.kind === 'splits' && sp.splits.faa_hyd_actuator && sp.splits.faa_hyd_actuator[0].alphaFm === 0.6 && sp.splits.faa_hyd_actuator[0].source === 'FMD-2016' && !sp.splits.nprd_relay_gf && sp.skipped.some(s => s.key === 'nprd_relay_gf' && /twice/.test(s.why)), JSON.stringify(sp));
    const ap1 = B.apply(r), ap2 = B.apply(sp);
    check('[U] applying: a split for a key not in the library is named, never invented', ap2.skipped.some(s => s.key === 'not_a_key' && /no part/.test(s.why)) && !ctx.projectConfig.customLibrary.not_a_key, JSON.stringify(ap2));
    const s1 = B.splitFor('faa_hyd_actuator');
    check('[U] the imported split comes before the built-in one; the built-in values of the part are kept', s1 && s1.from === 'imported' && s1.modes[0].mode === 'Jams' && ctx.projectConfig.customLibrary.faa_hyd_actuator.lambda === ctx.COMPONENT_LIBRARY.faa_hyd_actuator.lambda, JSON.stringify(s1));
    const s2 = B.splitFor('faa_hyd_pump_eng');
    check('[U] a part with only a built-in split gets the built-in one; a part with none gets none', s2 && s2.from === 'built-in' && B.splitFor('eprd_cap') === null, JSON.stringify(s2));
    check('[U] NPRD, EPRD and FMD are the licensed family; MIL-HDBK-217F is not', B.family('NPRD-2023') === 'NPRD/EPRD' && B.family('EPRD-2014') === 'NPRD/EPRD' && B.family('FMD-2016') === 'NPRD/EPRD' && B.family('MIL-HDBK-217F') === null && B.asPublished(r.parts.nprd_relay_gf));
    const cell = B.modesCell(ctx.projectConfig.customLibrary.nprd_relay_gf);
    const back = B.checkSplit(B.parseModes(cell), 'NPRD-2023');
    check('[U] the export cell loads back the same split', back.ok && JSON.stringify(back.modes.map(m => [m.mode, m.alphaFm])) === JSON.stringify(ctx.projectConfig.customLibrary.nprd_relay_gf.modes.map(m => [m.mode, m.alphaFm])), cell);
    check('[U] the detail line says where the number came from', /NPRD-2023 · environment GF · quality Commercial · 14 records · data 2019 · 3 failure modes · used as published/.test(B.detail(ctx.projectConfig.customLibrary.nprd_relay_gf)), B.detail(ctx.projectConfig.customLibrary.nprd_relay_gf));
    void ap1;
})();

(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('library_byol.js v1.0 loads right after fta_conditions.js, before fmea_modes.js', /fta_conditions\.js\?v=1\.0" defer><\/script>\s*<!--[^>]*-->\s*<script src="library_byol\.js\?v=1\.0" defer><\/script>\s*<script src="fmea_modes\.js\?v=1\.0" defer>/.test(HTML));
    check('NPRD / EPRD / FMD is a licensed family in the Standard family list', /<option value="NPRD\/EPRD">/.test(HTML));
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:kestrel');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        page.on('dialog', d => d.dismiss().catch(() => {}));
        await page.addInitScript(() => { window.SL_VERIFY_SYNC_OFF = true; window.SL_FC_TREES_OFF = true; window.SL_FC_LINK_OFF = true; });
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        const r = await within(page.evaluate(async (data) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            _applyProjectData(data); await wait(1500);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            ['welcome-modal', 'signup-modal'].forEach(id => { const o = document.getElementById(id); if (o) o.classList.remove('show'); });
            const R = {};
            let alertText = '';
            const _sa = window.slAlert; window.slAlert = (t) => { alertText += String(t) + '\n'; return Promise.resolve(); };
            importComponentLibraryCSV('Key,Name,Group,Lambda,Source,Environment,Quality,Records,Data_Date,Modes\n' +
                'nprd_relay_gf,"Relay, general purpose",Relays,2.1e-6,NPRD-2023,GF,Commercial,14,2019,"Contacts fail open=0.55; Contacts fail closed=0.30; Coil open=0.15"\n' +
                'nprd_valve_aif,Valve solenoid,Valves,8.0e-6,NPRD-2023,AIF,Military,6,2017,"Fails open=0.5; Fails closed=0.4"\n');
            importComponentLibraryCSV('Key,Mode,Alpha,Source\nfaa_hyd_actuator,Jams,0.6,FMD-2016\nfaa_hyd_actuator,Leaks,0.4,FMD-2016\n');
            window.slAlert = _sa;
            R.alert = { text: alertText, named: /nprd_valve_aif: failure mode split left out: the shares add up to 0\.9/.test(alertText) && /1 failure mode split loaded/.test(alertText) };
            const lib = projectConfig.customLibrary;
            R.stored = !!(lib.nprd_relay_gf && lib.nprd_relay_gf.records === 14 && lib.nprd_relay_gf.modes && lib.faa_hyd_actuator && lib.faa_hyd_actuator.modes[0].mode === 'Jams');
            // the table shows the detail
            switchTab('library'); await wait(300);
            const lsearch = document.getElementById('lib-search'); if (lsearch) { lsearch.value = 'nprd_relay'; lsearch.dispatchEvent(new Event('input')); }
            try { _libFilterState.search = 'nprd_relay'; renderLibraryTable(); } catch (_) {}
            const tb = document.getElementById('lib-table-body');
            R.table = !!tb && /environment GF · quality Commercial · 14 records · data 2019 · 3 failure modes · used as published/.test(tb.innerText);
            try { _libFilterState.search = ''; renderLibraryTable(); } catch (_) {}
            // used as published: the project's environment factor is not applied to an NPRD rate
            projectConfig.libraryStandard = 'MIL-HDBK-217F';
            const envs = STANDARD_ENVIRONMENTS['MIL-HDBK-217F']; const harsh = Object.keys(envs).find(k => envs[k].piE > 2);
            projectConfig.libraryEnv = harsh;
            const effN = effectiveLambdaForLibraryEntry(lib.nprd_relay_gf), effM = effectiveLambdaForLibraryEntry(COMPONENT_LIBRARY.faa_hyd_pump_eng);
            R.pub = { effN, effM, harsh, piE: envs[harsh].piE, ok: effN === 2.1e-6 };
            projectConfig.libraryEnv = Object.keys(envs)[0];
            // a basic event using the part names it as its source
            const leaves = SLRateSources.rows().map(x => x.node);
            const ev = leaves[0];
            ev.inputMode = 'library'; ev.libraryKey = 'nprd_relay_gf'; delete ev.rateSource;
            ev.lambda = lambdaFromInputMode('library', 0, 'nprd_relay_gf', 1);
            const src = SLRateSources.sourceOf(ev);
            R.src = { src, ok: !!src && src.kind === 'library' && /NPRD-2023 · environment GF · quality Commercial · 14 records · data 2019/.test(src.ref) && src.date === '2019' && !SLRateSources.missing(ev) };
            // the FMEA mode picker offers the imported split, and the mode rate is share x the event's rate
            switchTab('fmea'); await wait(200);
            try { _applyFmeaModeUI('piece-part'); } catch (_) {}   // the form itself (the program scope gate is not what this checks)
            try { _populateFmeaParentLib(); } catch (_) {}
            const sel = document.getElementById('fmea-parent-lib');
            R.picker = { offered: !!sel && [...sel.options].some(o => o.value === 'nprd_relay_gf') && [...sel.options].some(o => o.value === 'faa_hyd_actuator') };
            sel.value = 'faa_hyd_actuator'; onFmeaParentLibChange();
            const menu = document.getElementById('fmea-mode-menu');
            R.picker.imported = /Your imported failure mode split/.test(menu.innerText) && /Jams/.test(menu.innerText) && /FMD-2016/.test(menu.innerText);
            sel.value = 'nprd_relay_gf'; onFmeaParentLibChange();
            applyFmeaModeMenuPick('nprd_relay_gf', 0);
            const rate = parseFloat(document.getElementById('fmea-rate').value);
            R.picker.rate = rate; R.picker.rateOk = Math.abs(rate - 0.55 * ev.lambda) <= 1e-15;
            const form = _readFmeaForm();
            R.picker.source = form.modeSource; R.picker.type = form.fmeaType;
            // the export carries the detail and loads back the same
            let csvOut = null; const _dl = window.downloadCSV; window.downloadCSV = (name, head, rows) => { csvOut = { head, rows }; };
            try { exportData('Library', 'csv'); } catch (e) { R.exportErr = e.message; }
            window.downloadCSV = _dl;
            const q = v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
            const row = csvOut && csvOut.rows.find(x => x[0] === 'nprd_relay_gf');
            R.export = { head: csvOut && csvOut.head, row };
            if (row) {
                const before = JSON.stringify(projectConfig.customLibrary.nprd_relay_gf);
                delete projectConfig.customLibrary.nprd_relay_gf;
                const text = csvOut.head.map(q).join(',') + '\n' + row.map(q).join(',') + '\n';
                window.slAlert = () => Promise.resolve();
                importComponentLibraryCSV(text);
                window.slAlert = _sa;
                R.export.same = JSON.stringify(projectConfig.customLibrary.nprd_relay_gf) === before;
                R.export.before = before; R.export.after = JSON.stringify(projectConfig.customLibrary.nprd_relay_gf);
            }
            return R;
        }, demo.data), 200000, 'the browser step');
        console.log('\n[A] in the app');
        check('[A] Library import loads both files and names the split it left out, with its reason', r.alert.named && r.stored, JSON.stringify(r.alert));
        check('[A] the library table shows environment, quality, records, data date and modes', r.table === true);
        check('[A] an NPRD rate is used as published: the harsh environment factor is not applied on top', r.pub.ok && r.pub.piE > 2, JSON.stringify(r.pub));
        check('[A] a basic event using the part names it as its source, with the detail and the data date', r.src.ok, JSON.stringify(r.src));
        check('[A] the FMEA picker offers the imported splits and says so', r.picker.offered && r.picker.imported, JSON.stringify(r.picker));
        check('[A] the mode rate is the share x the event\'s rate, and the row keeps the split\'s source', r.picker.rateOk && r.picker.source === 'NPRD-2023', JSON.stringify(r.picker));
        check('[A] the library export carries the detail and the split, and loads back exactly the same', r.export.head && r.export.head.indexOf('Modes') > 0 && r.export.head.indexOf('Records') > 0 && r.export.same === true, JSON.stringify(r.export));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) {
        check('test crashed: ' + (e && e.stack || e), false);
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
