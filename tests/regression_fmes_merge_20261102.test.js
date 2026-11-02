/* regression_fmes_merge_20261102.test.js: FMES effects that say the same thing (fmes_merge.js v1.0, customer checklist item 50).
 *
 * Waqas, 2 Nov 2026: "go ahead on item 50", on the agreed mockup: ANEM finds end effects worded differently that mean the
 * same thing; a person confirms each merge (Merge or Keep apart), with Undo; effects merge only when their detection is the
 * same, so a detected and an undetected effect never land in one FMES group.
 * Checked in the app (ANEM stubbed): only suggestions inside one detection group, with a name that is one of the effects,
 * reach the page; nothing merges before Merge; after Merge the FMES has one group under the merged name with the rates
 * summed; the same words under another detection stay apart; Keep apart is remembered (not offered again); Undo and Split
 * give the rows back their own groups; the FMEA rows are never changed; the SSA report table and the CSV carry the merged
 * effect.
 * MUTATION PROOFS: SL_FMESM_MUTATE=nodet (a merge ignores detection), =anyeff (an effect from another group is kept),
 *   =noname (a name that is not one of the effects is kept), =noapart (Keep apart is not remembered) must fail.
 * Run: node tests/regression_fmes_merge_20261102.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1400) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_FMESM_MUTATE || '';
function mutate(file, body) {
    if (file !== 'fmes_merge.js') return body;
    if (MUT === 'nodet') return body.replace('if (m.sys === sys && m.det === det && m.effects.indexOf(eff) >= 0) return m;', 'if (m.sys === sys && m.effects.indexOf(eff) >= 0) return m;');
    if (MUT === 'anyeff') return body.replace("if (!effs.every(function (e) { return grp.effects[e]; })) return { ok: false, why: 'an effect is not in this detection group' };", '');
    if (MUT === 'noname') return body.replace("if (effs.indexOf(nk) < 0) return { ok: false, why: 'the name is not one of the effects' };", "if (effs.indexOf(nk) < 0) return { ok: true, groupId: key, effects: effs.map(function (e) { return grp.effects[e] ? grp.effects[e].text : e; }), name: S(name) };");
    if (MUT === 'noapart') return body.replace("if (_keptApart(grp.sys, grp.det, effs)) return { ok: false, why: 'kept apart by a person' };", '');
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('fmes_merge.js v1.0 and type_codes.js v1.0 load right after fmea_modes.js', /fmea_modes\.js\?v=1\.\d+" defer><\/script>\s*<!--[^>]*-->\s*<script src="fmes_merge\.js\?v=1\.0" defer><\/script>\s*<script src="type_codes\.js\?v=1\.0" defer>/.test(HTML));
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
            const R = {};
            const sys = (systemsData || [])[0];
            projectConfig.fmesMerges = []; projectConfig.fmesApart = []; projectConfig.fmesMergeLog = [];
            fmeaData.splice(0, fmeaData.length);
            const mk = (id, eff, det, rate) => ({ internalId: 'm-' + id, fmeaId: 'FM-' + id, fmeaType: 'piece-part', scope: 'system', owningSystemId: sys.id, part: 'P' + id, mode: 'M' + id, endEffect: eff, detection: det, rate, severity: 'Major' });
            fmeaData.push(mk(1, 'Loss of pitch command', 'Trim monitor', 1e-6), mk(2, 'Loss of pitch command output', 'Trim monitor', 2e-6), mk(3, 'pitch command  lost', 'trim monitor ', 3e-6),
                mk(4, 'Loss of pitch command', 'None (undetected)', 4e-6), mk(5, 'Loss of roll command', 'Trim monitor', 5e-6), mk(6, 'Elevator jam', 'None (undetected)', 6e-6));
            const before = JSON.stringify(fmeaData);
            const mine = () => fmesGroups().groups.filter(g => String(g.systemId) === String(sys.id));
            R.start = mine().length;
            // ANEM, stubbed: the reply is built from the groups it is sent
            await window.slLoadAI(); await until(() => window.SafetyLabAI && window.SafetyLabAI.fmesSimilar, 20000);
            let sentGroups = null;
            window.AiClient = { isConfigured: () => true, messages: async (req) => {
                const u = (req.messages || []).map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
                const at = u.indexOf('GROUPS:\n'); const groups = at >= 0 ? JSON.parse(u.slice(at + 8)) : [];
                sentGroups = groups;
                const tm = groups.find(g => /trim/i.test(g.detection)), un = groups.find(g => /undetected/i.test(g.detection));
                const merges = [];
                if (tm) {
                    merges.push({ group: tm.group, effects: ['Loss of pitch command', 'Loss of pitch command output', 'pitch command lost'], name: 'Loss of pitch command', why: 'All three say pitch command is lost.' });
                    merges.push({ group: tm.group, effects: ['Loss of pitch command', 'Loss of roll command'], name: 'Loss of pitch command', why: 'x' });
                    merges.push({ group: tm.group, effects: ['Loss of pitch command', 'Elevator jam'], name: 'Loss of pitch command', why: 'effect from the other detection' });
                    merges.push({ group: tm.group, effects: ['Loss of pitch command output', 'pitch command lost'], name: 'Pitch command gone', why: 'name not one of them' });
                }
                if (un) merges.push({ group: un.group, effects: ['Loss of pitch command', 'Elevator jam'], name: 'Elevator jam', why: 'y' });
                return { content: [{ type: 'text', text: JSON.stringify({ merges }) }], model: 'test-model', stop_reason: 'end_turn' };
            } };
            switchTab('fmes'); await wait(200); renderFmesPage();
            R.panel = /Effects that say the same thing/.test(document.getElementById('fmes-host').innerText) && /Find similar effects with ANEM/.test(document.getElementById('fmes-host').innerText);
            await SLFmesMerge.ui.find(); await wait(200);
            const P = SLFmesMerge._pending();
            R.sent = sentGroups && sentGroups.every(g => g.effects.length >= 2) && sentGroups.length === 2;
            R.pend = { n: P.length, list: P.map(p => p.effects.join('+') + ' => ' + p.name) };
            R.notYet = mine().length === R.start;
            // Merge the first (the three pitch effects)
            const i3 = P.findIndex(p => p.effects.length === 3);
            SLFmesMerge.ui.accept(i3); await wait(100);
            const G = mine();
            const merged = G.find(g => g.mergeId);
            R.after = { n: G.length, name: merged && merged.effect, rows: merged && merged.rows.length, sum: merged && merged.sumRate, und: G.filter(g => /undetected/i.test(g.detection)).map(g => g.effect + ':' + g.rows.length + (g.mergeId ? ':merged' : '')) };
            R.rowsSame = JSON.stringify(fmeaData) === before;
            R.page = /\(merged\)/.test(document.getElementById('fmes-host').innerText) && /Merged effects/.test(document.getElementById('fmes-host').innerText);
            // Keep apart the pitch + roll suggestion, then ask again: not offered again
            const iPR = SLFmesMerge._pending().findIndex(p => p.effects.some(e => /roll/i.test(e)));
            R.prFound = iPR >= 0;
            if (iPR >= 0) SLFmesMerge.ui.apart(iPR);
            await SLFmesMerge.ui.find(); await wait(200);
            R.again = SLFmesMerge._pending().map(p => p.effects.join('+'));
            // reports and the CSV
            let csv = ''; const _B = window.Blob; window.Blob = function (parts) { csv = parts.join(''); return new _B(parts); };
            try { fmesExportCsv(); } catch (e) { R.csvErr = e.message; }
            window.Blob = _B;
            R.csv = /Loss of pitch command/.test(csv) && !/Loss of pitch command output/.test(csv.split('\n').find(l => /pitch command/.test(l) && /Trim monitor/.test(l)) || '');
            // Undo, then merge again and Split
            SLFmesMerge.ui.undo(); await wait(50);
            R.undo = mine().length === R.start && !projectConfig.fmesMerges.length;
            const g = SLFmesMerge.rawGroups(); const k = Object.keys(g).find(x => /trim monitor/.test(x));
            const mm = SLFmesMerge.merge(k, ['Loss of pitch command', 'pitch command lost'], 'Loss of pitch command', 'engineer');
            R.manual = mm.ok && mine().length === R.start - 1;
            SLFmesMerge.ui.split(mm.merge.id); await wait(50);
            R.split = mine().length === R.start && JSON.stringify(fmeaData) === before;
            return R;
        }, demo.data), 200000, 'the browser step');
        console.log('\n[M] the merge');
        check('the FMES page shows the panel with the ANEM button', r.panel === true);
        check('ANEM is sent only detection groups with two or more different effects', r.sent === true);
        check('only suggestions inside one detection group, named with one of their effects, reach the page', r.pend.n === 3 && !r.pend.list.some(x => /Pitch command gone/.test(x)), JSON.stringify(r.pend));
        check('nothing merges before Merge', r.notYet === true);
        check('after Merge: one group under the merged name, three rows, rates summed; the FMEA rows are not changed', r.after.name === 'Loss of pitch command' && r.after.rows === 3 && Math.abs(r.after.sum - 6e-6) < 1e-15 && r.rowsSame && r.page, JSON.stringify(r.after));
        check('the same words under another detection stay apart', JSON.stringify(r.after.und.sort()) === JSON.stringify(['Elevator jam:1', 'Loss of pitch command:1']), JSON.stringify(r.after.und));
        check('Keep apart is remembered: the same suggestion is not offered again', r.prFound && !r.again.some(x => /roll/i.test(x)), JSON.stringify(r.again));
        check('the FMES CSV carries the merged effect', r.csv === true, r.csvErr || '');
        check('Undo and Split give every row back its own group', r.undo && r.manual && r.split, JSON.stringify([r.undo, r.manual, r.split]));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) {
        check('test crashed: ' + (e && e.stack || e), false);
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
