/* regression_type_codes_20261102.test.js: type codes, your own part types (type_codes.js v1.0, customer checklist item 29).
 *
 * Waqas, 2 Nov 2026: "go ahead on item 50, and 29 and 48", on the agreed mockup: one table of the program's own part types;
 * events of one type share its rate and model; change it there and every event follows; ANEM groups events into types and
 * never types a rate.
 * Checked in the app: the table refuses a bad code, a repeated code and a latent type with no interval; events take the
 * type's rate and model (exposure; latent = periodic with its interval); changing the type moves every event and the tree's
 * result; renaming a code keeps its events; a type in use cannot be removed; an event's source is its type's source, and a
 * type with no source shows "no source" on its events; the properties panel sets and clears a type code; ANEM (stubbed):
 * only events asked about and valid codes are kept; an existing code is given on Accept, a new one opens the table to take
 * its rate first.
 * MUTATION PROOFS: SL_TC_MUTATE=nofollow (events do not follow the type), =removeused (a type in use can be removed),
 *   =nosrc (events do not take the type's source), =anyevent (ANEM's unasked events are kept) must fail.
 * Run: node tests/regression_type_codes_20261102.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1400) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_TC_MUTATE || '';
function mutate(file, body) {
    if (file !== 'type_codes.js') return body;
    if (MUT === 'nofollow') return body.replace("_walk(function (n) { if (n.inputMode === 'typecode') apply(n); });", '');
    if (MUT === 'removeused') return body.replace("var n = used(code); if (n) return {", "var n = used(code); if (false) return {");
    if (MUT === 'nosrc') return body.replace("var t = get(n && n.typeCode); if (!t || !t.srcKind || !KINDS[t.srcKind]) return null;", 'return null;');
    if (MUT === 'anyevent') return body.replace("if (asked[id] && !seen[id] && _findNode(id))", 'if (!seen[id])');
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('the event properties offer "Type code" and the Fault Tree Data Actions open the table', /<option value="typecode">Type code \(your own part types\)<\/option>/.test(HTML) && /onclick="SLTypeCodes\.ui\.open\(\)">Type codes…<\/div>/.test(HTML));
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
            const R = {}, T = SLTypeCodes;
            projectConfig.typeCodes = [];
            // a tree with enough basic events, worked bottom up so the rates are the tree's inputs
            const leaves = p => { const o = []; (function w(n) { if (!n) return; if (n.type === 'basic' && n.eventClass !== 'dev-error') o.push(n); (n.children || []).forEach(w); })(p.root); return o; };
            const pages = ftaPages.filter(p => p && p.root && !p.integrated);
            const pg = pages.slice().sort((a, b) => leaves(b).length - leaves(a).length)[0];
            const seenIds = new Set(), ev = [];
            [pg].concat(pages.filter(p => p !== pg)).forEach(p => leaves(p).forEach(n => { if (!seenIds.has(String(n.id))) { seenIds.add(String(n.id)); ev.push(n); } }));
            const [A, B, C, D, E2, F, G] = ev;
            R.evCount = ev.length;
            openFTAPageById(pg.id); syncFtaConfigFromActivePage(); await wait(200);
            // the table's rules
            R.rules = {
                badCode: !T.upsert({ code: 'fcc 1', name: 'x', lambda: 1e-5 }).ok,
                noLatentInterval: !T.upsert({ code: 'MON', name: 'Command monitor', lambda: 1e-4, model: 'latent' }).ok
            };
            const a1 = T.upsert({ code: 'FCC', name: 'Flight control computer', lambda: 2.5e-5, model: 'exposure', srcKind: 'supplier', srcRef: 'RR-1' });
            const a2 = T.upsert({ code: 'MON', name: 'Command monitor', lambda: 1e-4, model: 'latent', interval: 3000 });
            R.rules.dup = !T.upsert({ code: 'FCC', name: 'again', lambda: 1e-5 }).ok;
            R.rules.ok = a1.ok && a2.ok;
            // events take the type's numbers
            T.assign(A, 'FCC'); T.assign(B, 'FCC'); T.assign(C, 'MON'); T.refresh();
            R.take = { A: [A.lambda, A.repairModel, A.inputMode], C: [C.lambda, C.repairModel, C.tau] };
            const top1 = SLTopBasis.exactTop(pg.root);
            T.upsert(Object.assign({}, T.get('FCC'), { lambda: 5e-5 }), 'FCC');
            const top2 = SLTopBasis.exactTop(pg.root);
            R.follow = { A: A.lambda, B: B.lambda, top1, top2 };
            T.upsert(Object.assign({}, T.get('FCC'), { code: 'FCC-A' }), 'FCC');
            R.rename = A.typeCode === 'FCC-A' && B.typeCode === 'FCC-A' && !T.get('FCC') && A.lambda === 5e-5;
            const rm = T.remove('FCC-A');
            T.upsert({ code: 'SPARE', name: 'Unused', lambda: 1e-6 });
            R.remove = { used: !rm.ok && /2 basic events use/.test(rm.why || ''), unused: T.remove('SPARE').ok && !T.get('SPARE'), still: !!T.get('FCC-A') };
            // the source
            const sa = SLRateSources.sourceOf(A);
            R.src = { a: sa, cMissing: SLRateSources.missing(C), cPill: ftaNodeWarnings(C, false).some(w => w.key === 'rate-source'), aNoPill: !ftaNodeWarnings(A, false).some(w => w.key === 'rate-source') };
            // the properties panel
            switchTab('fta'); activeFTAPageId = pg.id; renderFTASidebar(); updateD3(); await wait(400);
            selectNode(D); await wait(200);
            const mode = document.getElementById('config-input-mode');
            mode.value = 'typecode'; onInputModeChange(); await wait(50);
            const tcSel = document.getElementById('config-input-typecode');
            R.panel = { shown: document.getElementById('config-input-typecode-container').style.display !== 'none', offers: [...tcSel.options].map(o => o.value).join(',') };
            tcSel.value = 'MON'; updateNodeData(); await wait(50);
            R.panel.set = D.typeCode === 'MON' && D.lambda === 1e-4 && D.repairModel === 'periodic' && D.tau === 3000;
            const srcHost = document.getElementById('config-rate-source-container');
            selectNode(D); await wait(100);
            R.panel.srcLine = srcHost && /Type MON has no source yet/.test(srcHost.innerText);
            mode.value = 'lambda'; onInputModeChange(); await wait(50);
            R.panel.cleared = !D.typeCode && D.inputMode === 'lambda';
            try { closeNodeConfigModal(); } catch (_) {}
            // the table dialog
            T.ui.open(); await wait(50);
            const modal = document.getElementById('type-codes-modal');
            R.dialog = !!modal && /FCC-A/.test(modal.innerText) && /No source/.test(modal.innerText) && /Group events into types with ANEM/.test(modal.innerText);
            // ANEM, stubbed
            await window.slLoadAI(); await until(() => window.SafetyLabAI && window.SafetyLabAI.typeGroup, 20000);
            let sent = null;
            window.AiClient = { isConfigured: () => true, messages: async (req) => {
                const u = (req.messages || []).map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
                sent = u;
                return { content: [{ type: 'text', text: JSON.stringify({ groups: [
                    { code: 'MON', type: 'Command monitor', isNew: false, events: [String(E2.id)], why: 'Both are monitors.' },
                    { code: 'ACT-E', type: 'Electrohydraulic actuator', isNew: true, events: [String(F.id), String(G.id)], why: 'Same actuator.' },
                    { code: 'bad code', type: 'x', isNew: true, events: [String(F.id), String(G.id)] },
                    { code: 'NEW1', type: 'Lonely', isNew: true, events: [String(F.id)] },
                    { code: 'MON', type: 'x', isNew: false, events: ['987654321', String(A.id)] }
                ] }) }], model: 'test-model', stop_reason: 'end_turn' };
            } };
            await T.ui.group(); await wait(200);
            const P = T._pending();
            R.anem = { n: P.length, codes: P.map(g => g.code + ':' + g.events.length).join(','), noTyped: !!sent && sent.indexOf('"id":"' + A.id + '"') < 0 };
            const iOld = P.findIndex(g => g.code === 'MON'); T.ui.accept(iOld); await wait(50);
            R.anem.oldGiven = E2.typeCode === 'MON' && E2.lambda === 1e-4;
            const iNew = T._pending().findIndex(g => g.code === 'ACT-E'); T.ui.accept(iNew); await wait(50);
            const codeEl = document.getElementById('tc-code'), nameEl = document.getElementById('tc-name');
            R.anem.prefilled = codeEl && codeEl.value === 'ACT-E' && nameEl.value === 'Electrohydraulic actuator' && !F.typeCode;
            document.getElementById('tc-lambda').value = '1.1e-6'; document.getElementById('tc-srckind').value = 'field'; document.getElementById('tc-srcref').value = 'Fleet data 2025';
            T.ui.save(); await wait(50);
            R.anem.newGiven = F.typeCode === 'ACT-E' && G.typeCode === 'ACT-E' && F.lambda === 1.1e-6 && SLRateSources.sourceOf(G).kind === 'field';
            T.ui.close();
            return R;
        }, demo.data), 240000, 'the browser step');
        console.log('\n[T] the table');
        check('the table refuses a bad code, a repeated code and a latent type with no interval', r.rules.badCode && r.rules.noLatentInterval && r.rules.dup && r.rules.ok, JSON.stringify(r.rules));
        check('events take the type\'s rate and model (exposure; latent = periodic with its interval)', r.take.A[0] === 2.5e-5 && r.take.A[1] === 'unmaintained' && r.take.A[2] === 'typecode' && r.take.C[0] === 1e-4 && r.take.C[1] === 'periodic' && r.take.C[2] === 3000, JSON.stringify(r.take));
        check('changing the type moves every event of it, and the tree\'s result', r.follow.A === 5e-5 && r.follow.B === 5e-5 && r.follow.top2 > r.follow.top1, JSON.stringify(r.follow));
        check('renaming a code keeps its events', r.rename === true);
        check('a type in use cannot be removed; an unused one can', r.remove.used && r.remove.unused && r.remove.still, JSON.stringify(r.remove));
        console.log('\n[S] the source');
        check('an event\'s source is its type\'s source; a type with no source shows "no source" on its events', r.src.a && r.src.a.kind === 'supplier' && /Type FCC-A: RR-1/.test(r.src.a.ref) && r.src.cMissing && r.src.cPill && r.src.aNoPill, JSON.stringify(r.src));
        console.log('\n[P] the properties panel and the dialog');
        check('the panel sets a type code (rate and model from the type) and clears it again', r.panel.shown && /FCC-A/.test(r.panel.offers) && r.panel.set && r.panel.srcLine && r.panel.cleared, JSON.stringify(r.panel));
        check('the table dialog lists the types, says which have no source, and offers ANEM', r.dialog === true);
        console.log('\n[A] ANEM');
        check('only events asked about and valid codes are kept; events already typed are not sent', r.anem.n === 2 && r.anem.codes === 'MON:1,ACT-E:2' && r.anem.noTyped, JSON.stringify(r.anem));
        check('an existing code is given on Accept; a new one opens the table to take its rate first, then its events take it', r.anem.oldGiven && r.anem.prefilled && r.anem.newGiven, JSON.stringify(r.anem));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) {
        check('test crashed: ' + (e && e.stack || e), false);
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
