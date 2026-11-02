/* regression_fmea_modes_20261102.test.js: failure modes per part type (fmea_modes.js v1.0 and the item FMEA draft, item 48),
 * and the FMES grouping rule (item 50, already built: locked here).
 *
 * Waqas, 2 Nov 2026: "yes lets get the rest done", on this scope: a new "Add modes from the library" button fills each
 * basic event's modes and rates straight from the split, imported first, built-in second, no duplicates, the engineer adds
 * the effects; ANEM drafts every row linked to its basic event, uses the split's mode names where a split exists, names
 * the modes only where none does, and never outputs a number. Item 50: the FMES merges two rows only when both the end
 * effect and the detection match.
 * Checked:
 *   [L] the library button: one row per split mode, linked to the event and the part, share and rate from the split
 *       (rate = share x the part's rate as the tree sees it), the source named; the imported split used before the
 *       built-in one; a second press adds nothing; the bar says how many events have no split.
 *   [F] the FMES: same end effect and same detection merge (rates summed); same effect, other detection, stay apart.
 *   [N] ANEM (the model stubbed): every system on the linked engine (no unified route); a mode off the split is left out;
 *       a numbers ANEM sends (alphaFm) are ignored, the share and rate are the split's; a row for a mode the library button
 *       already made fills that row in place (no second row); a part with no split gets ANEM's mode with no share and no
 *       rate; a row for an event not asked about is dropped; the components sent carry the split's mode names and no rate.
 *   [S] the skill: fmea.item v2 says mode names, never numbers; the item prompt asks for no alphaFm.
 * MUTATION PROOFS: SL_FM_MUTATE=dupes (the button plans modes already in the FMEA), =aialpha (ANEM's alphaFm is kept),
 *   =offlist (a mode off the split is kept), =fmesdet (the FMES groups by end effect only) must fail.
 * Run: node tests/regression_fmea_modes_20261102.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1400) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_FM_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'dupes' && file === 'fmea_modes.js') return body.replace("if (clash(n, m.mode)) { already++; return; }", '');
    if (MUT === 'aialpha' && file === 'ai_assistant.js') return body.replace("delete x.alphaFm;   // never ANEM's: the split's, on Accept", '').replace("if (_itemSplitMode) {\n                    row.alphaFm = Number(_itemSplitMode.alphaFm);", "if (x.alphaFm != null) { row.alphaFm = Number(x.alphaFm); } if (false) {");
    if (MUT === 'offlist' && file === 'ai_assistant.js') return body.replace("if (be._split && !be._split.modes.some(function (m) { return _modeKey(m.mode) === mk; })) { offList++; return false; }", '').replace("if (!_itemSplitMode) { _toast('Not added: \"' + _md + '\" is not one of the failure modes in the library split for this part.', 'warning'); return false; }", '');
    if (MUT === 'fmesdet' && file === 'misc_fn_modules.js') return body.replace("const key = sysKey + '§' + eff + '§' + det;", "const key = sysKey + '§' + eff;");
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    // [S] the words, read from the files
    const AI = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8'), SK = fs.readFileSync(path.join(SITE, 'ai_skills.js'), 'utf8');
    console.log('[S] the skill');
    check('[S] fmea.item is v2 and its body says mode names, never numbers (the same words inline and in the registry)', /'fmea\.item': 2,/.test(SK) && SK.indexOf('MODE NAMES, NEVER NUMBERS: when a component lists modes') > 0 && AI.indexOf("'MODE NAMES, NEVER NUMBERS: when a component lists modes") > 0);
    check('[S] the item prompt asks for no alphaFm and no number at all', AI.indexOf('Output no numbers at all: no share of a failure rate, no failure rate and no probability.') > 0 && AI.indexOf('"mode":"...", "alphaFm":0.35') < 0);
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:kestrel');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        page.on('dialog', d => d.dismiss().catch(() => {}));
        await page.addInitScript(() => { try { localStorage.setItem('safetyLab.ai.enabled', '1'); } catch (_) {} window.SL_VERIFY_SYNC_OFF = true; window.SL_FC_TREES_OFF = true; window.SL_FC_LINK_OFF = true; });
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        const r = await within(page.evaluate(async (data) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { const v = fn(); if (v) return v; } catch (_) {} await wait(60); } return null; };
            _applyProjectData(data); await wait(1500);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            ['welcome-modal', 'signup-modal'].forEach(id => { const o = document.getElementById(id); if (o) o.classList.remove('show'); });
            if (window.PROGRAM_PLAN) window.PROGRAM_PLAN.laneOn = () => true;   // the lanes are not what this checks
            const R = {};
            const _sa = window.slAlert; window.slAlert = () => Promise.resolve();
            importComponentLibraryCSV('Key,Name,Group,Lambda,Source,Environment,Quality,Records,Data_Date,Modes\nnprd_relay_gf,"Relay, general purpose",Relays,2.1e-6,NPRD-2023,GF,Commercial,14,2019,"Contacts fail open=0.55; Contacts fail closed=0.30; Coil open=0.15"\n');
            importComponentLibraryCSV('Key,Mode,Alpha,Source\nfaa_hyd_pump_eng,Seizes,0.7,FMD-2016\nfaa_hyd_pump_eng,Leaks,0.3,FMD-2016\n');
            window.slAlert = _sa;
            // a system with at least four basic events
            const sys = (systemsData || []).find(sy => SLFmeaModes.events(sy.id).length >= 4);
            const evs = SLFmeaModes.events(sys.id).map(e => e.node);
            fmeaData.splice(0, fmeaData.length, ...fmeaData.filter(rw => String(rw.owningSystemId) !== String(sys.id)));
            const setLib = (n, key) => { n.inputMode = 'library'; n.libraryKey = key; n.lambda = lambdaFromInputMode('library', 0, key, 1); };
            const [A, Bv, C, D] = evs;
            setLib(A, 'faa_hyd_actuator');     // built-in split, 4 modes
            setLib(Bv, 'nprd_relay_gf');       // imported split, 3 modes
            setLib(C, 'faa_hyd_pump_eng');     // imported split (FMD) over the built-in one, 2 modes
            D.inputMode = 'lambda'; D.lambda = 4e-6; delete D.libraryKey;   // no split
            evs.slice(4).forEach(n => { delete n.libraryKey; if (n.inputMode === 'library') n.inputMode = 'lambda'; });
            activeSystemId = sys.id;
            switchTab('fmea'); await wait(200);
            try { _applyFmeaModeUI('piece-part'); } catch (_) {}
            renderFMEA(); await wait(100);
            const bar = document.getElementById('fmea-lib-modes-host');
            R.bar = { shown: bar.style.display !== 'none', text: bar.innerText, btn: /Add modes from the library/.test(bar.innerText) };
            SLFmeaModes.ui.add(); await wait(100);
            const mine = () => fmeaData.filter(rw => String(rw.owningSystemId) === String(sys.id));
            const rows = mine();
            const of = n => rows.filter(rw => String(rw.beId) === String(n.id));
            const lamA = SLLibraryByol.partLambda('faa_hyd_actuator'), lamC = SLLibraryByol.partLambda('faa_hyd_pump_eng');
            R.L = {
                n: rows.length, a: of(A).length, b: of(Bv).length, c: of(C).length, d: of(D).length,
                rateA: of(A).every(rw => Math.abs(rw.rate - rw.alphaFm * lamA) <= 1e-18 && rw.parentLibKey === 'faa_hyd_actuator' && rw.modeSource === 'DOT-FAA-CT-83-49'),
                cImported: of(C).map(rw => rw.mode).sort().join('|') === 'Leaks|Seizes' && of(C).every(rw => rw.modeSource === 'FMD-2016' && Math.abs(rw.rate - rw.alphaFm * lamC) <= 1e-18),
                bSource: of(Bv).every(rw => rw.modeSource === 'NPRD-2023'),
                ids: new Set(rows.map(rw => rw.fmeaId)).size === rows.length && rows.every(rw => /^FMEA-PP-\d{3,}$/.test(rw.fmeaId)),
                blank: rows.every(rw => !rw.endEffect && !rw.detection && !rw.severity),
                filed: rows.every(rw => rw.scope === 'system' && rw.fmeaType === 'piece-part')
            };
            R.L.again = SLFmeaModes.add(sys.id);
            R.L.after = mine().length;
            R.L.shownInTable = /of the part, DOT-FAA-CT-83-49/.test(document.getElementById('fmea-body').innerText);
            // [F] the FMES: item 50
            const a = of(A);
            a[0].endEffect = 'Loss of pitch trim'; a[0].detection = 'Trim monitor';
            a[1].endEffect = 'loss of pitch  trim'; a[1].detection = 'trim monitor';
            a[2].endEffect = 'Loss of pitch trim'; a[2].detection = 'Crew observation';
            const G = fmesGroups().groups.filter(g => String(g.systemId) === String(sys.id));
            const merged = G.find(g => g.rows.length === 2), apart = G.find(g => g.rows.includes(a[2]));
            R.F = { groups: G.length, merged: !!merged && merged.rows.includes(a[0]) && merged.rows.includes(a[1]) && Math.abs(merged.sumRate - (a[0].rate + a[1].rate)) <= 1e-18, apart: !!apart && apart.rows.length === 1 && apart !== merged };
            // [N] ANEM, the model stubbed
            await window.slLoadAI(); await until(() => window.SafetyLabAI && window.SafetyLabAI.draftFmea, 20000);
            let sent = null, calls = 0;
            const modesA = (FAILURE_MODE_DISTRIBUTIONS.faa_hyd_actuator || []).map(m => m.mode);
            window.AiClient = { isConfigured: () => true, messages: async (req) => {
                calls++;
                const u = (req.messages || []).map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
                let ctx = null; try { ctx = JSON.parse(u); } catch (_) {}
                if (ctx && ctx.system === sys.name) sent = ctx;
                const rowsOut = ctx && ctx.system === sys.name ? [
                    // A: the 4th mode had no row with effects; modes 0..2 have effects now (filled above) -> only the last is asked for
                    { ref: String(A.id), part: 'x', mode: String(modesA[3]).toUpperCase(), alphaFm: 0.9, localEffect: 'Slow drift', nextEffect: 'Trim offset', endEffect: 'Minor trim change', detection: 'Trim monitor', severity: 'Minor', confidence: 'high' },
                    { ref: String(A.id), part: 'x', mode: 'Explodes', alphaFm: 0.1, localEffect: 'x', endEffect: 'x', detection: 'x', severity: 'Minor' },
                    // B: an imported split, one mode
                    { ref: String(Bv.id), part: 'Relay', mode: 'Coil open', alphaFm: 0.5, localEffect: 'Relay does not pull in', endEffect: 'Pump does not start', detection: 'Pump status light', severity: 'Major', confidence: 'medium' },
                    { ref: String(Bv.id), part: 'Relay', mode: 'Coil open', alphaFm: 0.5, localEffect: 'again', endEffect: 'again', detection: 'again', severity: 'Major' },
                    // D: no split, ANEM names the mode
                    { ref: String(D.id), part: 'Sensor', mode: 'Output stuck high', alphaFm: 0.4, localEffect: 'Reads high', endEffect: 'Spurious caution', detection: 'Cross-check', severity: 'Minor', confidence: 'low' },
                    // not asked about
                    { ref: '987654321', part: 'Ghost', mode: 'Open', localEffect: 'x', endEffect: 'x', detection: 'x', severity: 'Minor' }
                ] : [];
                return { content: [{ type: 'text', text: JSON.stringify({ rows: rowsOut }) }], model: 'test-model', stop_reason: 'end_turn' };
            } };
            const before = mine().length;
            await SafetyLabAI.draftFmea(); await wait(400);
            const panel = await until(() => document.getElementById('ai-rev-panel-fmea'), 8000);
            R.N = { calls, panel: !!panel, cards: panel ? panel.querySelectorAll('.aifh-card').length : 0, noUnifiedTitle: panel ? !/review$/.test(panel.querySelector('h3').innerText) : false };
            const sentA = sent && sent.components.find(c => c.ref === String(A.id)), sentD = sent && sent.components.find(c => c.ref === String(D.id));
            R.N.sent = { aModes: sentA && sentA.modes, dModes: sentD && sentD.modes, noRate: !!sent && sent.components.every(c => c.predictedLambda === undefined) };
            if (panel) { const btn = panel.querySelector('.rv-accept-all'); if (btn) btn.click(); await wait(500); }
            const after = mine();
            const aRows = after.filter(rw => String(rw.beId) === String(A.id)), bRows = after.filter(rw => String(rw.beId) === String(Bv.id)), dRows = after.filter(rw => String(rw.beId) === String(D.id));
            const coil = bRows.filter(rw => rw.mode === 'Coil open');
            const last = aRows.find(rw => rw.mode === modesA[3]);
            R.N.res = {
                added: after.length - before,
                noExplodes: !aRows.some(rw => /explodes/i.test(rw.mode)),
                aCount: aRows.length, lastFilled: !!last && last.endEffect === 'Minor trim change' && last.alphaFm === FAILURE_MODE_DISTRIBUTIONS.faa_hyd_actuator[3].alphaFm && !!last.aiFilled,
                coil: coil.length, coilFilled: coil.length === 1 && coil[0].endEffect === 'Pump does not start' && coil[0].alphaFm === 0.15 && Math.abs(coil[0].rate - 0.15 * SLLibraryByol.partLambda('nprd_relay_gf')) <= 1e-18,
                d: dRows.map(rw => ({ mode: rw.mode, alpha: rw.alphaFm, rate: rw.rate, ai: rw.aiGenerated })),
                ghost: !after.some(rw => rw.part === 'Ghost')
            };
            return R;
        }, demo.data), 240000, 'the browser step');
        console.log('\n[L] the library button');
        check('[L] the bar shows on the piece-part FMEA and names the events with no split', r.bar.shown && r.bar.btn && /no split/.test(r.bar.text), JSON.stringify(r.bar));
        check('[L] one row per split mode, linked, filed under the system, effects left blank', r.L.a === 4 && r.L.b === 3 && r.L.c === 2 && r.L.d === 0 && r.L.n === 9 && r.L.filed && r.L.blank && r.L.ids, JSON.stringify(r.L));
        check('[L] share and rate from the split (rate = share x the part\'s rate), the source named, shown in the table', r.L.rateA && r.L.bSource && r.L.shownInTable, JSON.stringify(r.L));
        check('[L] the imported split is used before the built-in one', r.L.cImported, JSON.stringify(r.L));
        check('[L] a second press adds nothing (no duplicates)', r.L.again.added === 0 && r.L.again.already === 9 && r.L.after === 9, JSON.stringify(r.L));
        console.log('\n[F] the FMES (item 50)');
        check('[F] same end effect AND same detection merge, rates summed; the same effect with another detection stays apart', r.F.merged && r.F.apart, JSON.stringify(r.F));
        console.log('\n[N] ANEM');
        check('[N] the normal button drafts every system on the linked engine, in one review', r.N.calls >= 1 && r.N.panel && r.N.noUnifiedTitle, JSON.stringify(r.N));
        check('[N] the components sent carry the split\'s mode names, none for a part with no split, and no rate', JSON.stringify(r.N.sent.aModes || []).length > 2 && r.N.sent.dModes === undefined && r.N.sent.noRate, JSON.stringify(r.N.sent));
        check('[N] a mode off the split is left out; a row for an event not asked about is dropped', r.N.res.noExplodes && r.N.res.ghost, JSON.stringify(r.N.res));
        check('[N] a mode the button made is filled in place, never a second row; share and rate are the split\'s, not ANEM\'s 0.9 / 0.5', r.N.res.aCount === 4 && r.N.res.lastFilled && r.N.res.coil === 1 && r.N.res.coilFilled, JSON.stringify(r.N.res));
        check('[N] a part with no split gets ANEM\'s mode name with no share and no rate', r.N.res.d.length === 1 && r.N.res.d[0].mode === 'Output stuck high' && r.N.res.d[0].alpha == null && !r.N.res.d[0].rate && r.N.res.d[0].ai === true, JSON.stringify(r.N.res));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) {
        check('test crashed: ' + (e && e.stack || e), false);
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
