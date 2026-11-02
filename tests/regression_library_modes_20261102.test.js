/* regression_library_modes_20261102.test.js: failure modes for every part (library_byol.js v1.1, fmea_modes.js v1.1, the rest
 * of customer checklist item 48).
 *
 * Waqas, 2 Nov 2026: "go ahead on item 50, and 29 and 48", on the mockup: every library family gets a split from public data
 * first; for a part with none, ANEM names the modes only, and shares come from a source the engineer picks.
 * Checked in the app: a relay used in a tree gets the MIL-HDBK-338B split in the FMEA button, cited; the library offers ANEM
 * (stubbed) only the parts used in the trees with no modes; names with a digit are dropped; nothing is saved before Accept;
 * accepted names give FMEA rows with no share and no rate; ANEM's item FMEA uses those names and stores no share; shares
 * typed as percent with a source become a split (names cleared) and the rows' rates follow; shares without a source, or not
 * adding up, are refused; the Modes button and dialog show what a part has.
 * MUTATION PROOFS: SL_LM_MUTATE=digits (names with digits kept), =nosource (shares saved without a source),
 *   =namedrate (names-only rows get a rate) must fail.
 * Run: node tests/regression_library_modes_20261102.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1400) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_LM_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'digits' && file === 'library_byol.js') return body.replace("if (!m || m.length > 60 || /\\d/.test(m)) return;   // a mode name carries no number", 'if (!m || m.length > 60) return;');
    if (MUT === 'nosource' && file === 'library_byol.js') return body.replace("if (!source) return { ok: false, why: 'name the source the shares come from' };", '');
    if (MUT === 'namedrate' && file === 'fmea_modes.js') return body.replace('var a = named ? null : Number(m.alphaFm);', 'var a = named ? 0.5 : Number(m.alphaFm); named = false;');
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
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
            if (window.PROGRAM_PLAN) window.PROGRAM_PLAN.laneOn = () => true;
            const R = {}, B = SLLibraryByol;
            projectConfig.libraryModeNames = {};
            const sys = (systemsData || []).find(sy => SLFmeaModes.events(sy.id).length >= 3);
            const evs = SLFmeaModes.events(sys.id).map(e => e.node);
            // every basic event in every tree off the library, then: a relay (338B split), a part with no split (to be named)
            ftaPages.forEach(p => (function w(n) { if (!n) return; if (n.type === 'basic') { delete n.libraryKey; if (n.inputMode === 'library') n.inputMode = 'lambda'; } (n.children || []).forEach(w); })(p.root));
            const NOSPLIT = 'nasa_reaction_wheel';
            const setLib = (n, key) => { n.inputMode = 'library'; n.libraryKey = key; n.lambda = lambdaFromInputMode('library', 0, key, 1); };
            const [A, Bv] = evs; setLib(A, 'mil217_relay_mech'); setLib(Bv, NOSPLIT);
            fmeaData.splice(0, fmeaData.length, ...fmeaData.filter(rw => String(rw.owningSystemId) !== String(sys.id)));
            activeSystemId = sys.id;
            // the relay gets the 338B split
            const p1 = SLFmeaModes.plan(sys.id);
            const relayRows = p1.rows.filter(x => String(x.beId) === String(A.id));
            R.relay = { modes: relayRows.map(x => x.mode + ':' + x.alphaFm).join(','), src: relayRows.every(x => x.modeSource === 'MIL-HDBK-338B Table 7.8-1'), noSplitListed: p1.noSplit.some(e => e.node === Bv) };
            // the library offers ANEM only the parts used in the trees with no modes
            R.used = B.usedWithoutModes();
            switchTab('library'); await wait(300);
            const bar = document.getElementById('lib-modes-bar');
            R.bar = !!bar && /Name the modes with ANEM \(1\)/.test(bar.innerText);
            await window.slLoadAI(); await until(() => window.SafetyLabAI && window.SafetyLabAI.modesName, 20000);
            let sent = null;
            window.AiClient = { isConfigured: () => true, messages: async (req) => {
                sent = (req.messages || []).map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
                return { content: [{ type: 'text', text: JSON.stringify({ parts: [
                    { key: NOSPLIT, modes: ['Loss of torque', 'Bearing seizure', 'Speed sensor fails 2x', 'Loss of torque', 'Excessive vibration'], why: 'Typical wheel modes.' },
                    { key: 'mil217_relay_mech', modes: ['Open'], why: 'not asked' }
                ] }) }], model: 'test-model', stop_reason: 'end_turn' };
            } };
            await SLLibraryByol.ui.nameUsed(); await wait(200);
            const modal = document.getElementById('lib-modes-modal');
            R.anem = { sentOnly: !!sent && sent.indexOf(NOSPLIT) >= 0 && sent.indexOf('mil217_relay_mech') < 0, pending: JSON.stringify(B._pending[NOSPLIT] && B._pending[NOSPLIT].modes), notSaved: !B.namesFor(NOSPLIT), panel: !!modal && /Mode names from ANEM/.test(modal.innerText) };
            SLLibraryByol.ui.accept(NOSPLIT, true); await wait(50);
            const nm = B.namesFor(NOSPLIT);
            R.anem.saved = nm && nm.names.join('|');
            R.anem.by = nm && nm.by;
            // names-only rows: no share, no rate
            SLFmeaModes.add(sys.id);
            const bRows = fmeaData.filter(rw => String(rw.beId) === String(Bv.id));
            R.named = { n: bRows.length, noShare: bRows.every(x => x.alphaFm == null && !x.rate && !x.modeSource) };
            // ANEM's item FMEA uses the names and stores no share
            window.AiClient = { isConfigured: () => true, messages: async (req) => {
                const u = (req.messages || []).map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
                let ctx = null; try { ctx = JSON.parse(u); } catch (_) {}
                const comp = ctx && ctx.components ? ctx.components.find(c => c.ref === String(Bv.id)) : null;
                R.itemSent = comp && comp.modes;
                const rows = comp ? [{ ref: String(Bv.id), part: 'Wheel', mode: 'loss of torque', alphaFm: 0.7, localEffect: 'No torque', endEffect: 'Loss of yaw control authority', detection: 'Wheel speed monitor', severity: 'Major' }] : [];
                return { content: [{ type: 'text', text: JSON.stringify({ rows }) }], model: 'test-model', stop_reason: 'end_turn' };
            } };
            await SafetyLabAI.draftFmea({ systemId: sys.id }); await wait(300);
            const panel = await until(() => document.getElementById('ai-rev-panel-fmea'), 6000);
            if (panel) { const btn = panel.querySelector('.rv-accept-all'); if (btn) btn.click(); await wait(300); }
            const lt = fmeaData.find(rw => String(rw.beId) === String(Bv.id) && rw.mode === 'Loss of torque');
            R.item = { filled: !!lt && lt.endEffect === 'Loss of yaw control authority', noShare: !!lt && lt.alphaFm == null && !lt.rate };
            // shares with a source
            const refusedNoSrc = B.setShares(NOSPLIT, [{ mode: 'Loss of torque', alpha: 0.6 }, { mode: 'Bearing seizure', alpha: 0.3 }, { mode: 'Excessive vibration', alpha: 0.1 }], '');
            const refusedSum = B.setShares(NOSPLIT, [{ mode: 'Loss of torque', alpha: 0.6 }, { mode: 'Bearing seizure', alpha: 0.3 }], 'Supplier FMECA rev B');
            SLLibraryByol.ui.open(NOSPLIT); await wait(50);
            const rowsEls = document.querySelectorAll('#lib-sh-rows .lib-sh-mode'), aEls = document.querySelectorAll('#lib-sh-rows .lib-sh-alpha');
            const want = { 'Loss of torque': 60, 'Bearing seizure': 30, 'Excessive vibration': 10 };
            rowsEls.forEach((el, i) => { aEls[i].value = want[el.value] != null ? want[el.value] : ''; });
            document.getElementById('lib-sh-source').value = 'Supplier FMECA rev B';
            SLLibraryByol.ui.saveShares(NOSPLIT); await wait(50);
            const sp = B.splitFor(NOSPLIT);
            const ltAfter = fmeaData.find(rw => String(rw.beId) === String(Bv.id) && rw.mode === 'Loss of torque');
            R.shares = { rowsFollow: !!ltAfter && ltAfter.alphaFm === 0.6 && Math.abs(ltAfter.rate - 0.6 * B.partLambda(NOSPLIT)) < 1e-18 && ltAfter.modeSource === 'Supplier FMECA rev B', noSrc: !refusedNoSrc.ok, sum: !refusedSum.ok, split: sp && sp.modes.map(m => m.mode + ':' + m.alphaFm + ':' + m.source).join(','), namesGone: !B.namesFor(NOSPLIT), from: sp && sp.from };
            // the Modes button on the library row
            try { _libFilterState.search = 'reaction wheel'; renderLibraryTable(); } catch (_) {}
            R.cell = /3 modes/.test((document.getElementById('lib-table-body') || {}).innerText || '');
            SLLibraryByol.ui.close();
            return R;
        }, demo.data), 240000, 'the browser step');
        console.log('\n[L] the library');
        check('a relay used in a tree gets the MIL-HDBK-338B split in the FMEA button, cited', r.relay.modes === 'Fails to Trip:0.55,Spurious Trip:0.26,Short:0.19' && r.relay.src && r.relay.noSplitListed, JSON.stringify(r.relay));
        check('the library offers ANEM only the parts used in the trees with no modes', JSON.stringify(r.used) === JSON.stringify(['nasa_reaction_wheel']) && r.bar, JSON.stringify([r.used, r.bar]));
        check('ANEM is sent only those parts; names with a digit and repeats are dropped; nothing is saved before Accept', r.anem.sentOnly && r.anem.pending === JSON.stringify(['Loss of torque', 'Bearing seizure', 'Excessive vibration']) && r.anem.notSaved && r.anem.panel, JSON.stringify(r.anem));
        check('accepted names are kept, marked as ANEM\'s accepted by a person', r.anem.saved === 'Loss of torque|Bearing seizure|Excessive vibration' && r.anem.by === 'ANEM, accepted', JSON.stringify(r.anem));
        check('names give FMEA rows with no share and no rate', r.named.n === 3 && r.named.noShare, JSON.stringify(r.named));
        check('ANEM\'s item FMEA gets the names, fills the blank row, and stores no share', JSON.stringify(r.itemSent) === JSON.stringify(['Loss of torque', 'Bearing seizure', 'Excessive vibration']) && r.item.filled && r.item.noShare, JSON.stringify([r.itemSent, r.item]));
        check('shares need a source and must add up; typed as percent with a source they become a split, the names go, and the rows with no share take theirs', r.shares.noSrc && r.shares.sum && r.shares.split === 'Loss of torque:0.6:Supplier FMECA rev B,Bearing seizure:0.3:Supplier FMECA rev B,Excessive vibration:0.1:Supplier FMECA rev B' && r.shares.namesGone && r.shares.from === 'imported' && r.shares.rowsFollow, JSON.stringify(r.shares));
        check('the library row\'s Modes button says what the part has', r.cell === true);
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) {
        check('test crashed: ' + (e && e.stack || e), false);
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
