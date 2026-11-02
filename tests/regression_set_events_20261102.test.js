/* regression_set_events_20261102.test.js: allocation never writes into house or conditioning events.
 *
 * Found 1 Nov 2026 while testing the MEF round trip: top-down allocation wrote a probability budget (2e-9) into a house
 * event. Waqas, 2 Nov 2026, after the explanation (a house event is a condition switched on or off; a conditioning event
 * is the entered probability of the condition an INHIBIT gate needs): "ok lets get these done".
 * Checked on a real allocation tree: an INHIBIT gate with a conditioning event (0.1), an AND gate with a house event
 * (true), and an event repeated in two branches (so the exact close, mcsAwareRebalance, runs): after allocating, twice,
 * the conditioning event is still 0.1 and the house event still 1; the events beside them carry the budget (the
 * INHIBIT's basic event is its gate's budget divided by 0.1); the tree still closes on its target; a house event left
 * holding an old budget is flagged.
 * MUTATION PROOFS: SL_SET_MUTATE=alloc (allocation writes into them), =rebalance (the exact close scales them), =warn
 * (an old budget on a house event is not flagged) must fail.
 * Run: node tests/regression_set_events_20261102.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const MUT = process.env.SL_SET_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'alloc' && file === 'fta_quant_modules.js') return body.replace("    if (slIsSetEvent(node)) return;   // its value is the engineer's, never a budget\n", '').replace("        if (slIsSetEvent(c)) { const v = Number(c.probability); return (isFinite(v) && v >= 0 && v <= 1) ? v : 0; }   // held as set (2 Nov 2026)\n", '');
    if (MUT === 'rebalance' && file === 'helpers_modules.js') return body.split("        if (n.type !== 'gate' && !(typeof slIsSetEvent === 'function' && slIsSetEvent(n))) {").join("        if (n.type !== 'gate') {");
    if (MUT === 'warn' && file === 'helpers_modules.js') return body.replace("if (leaf && node.type === 'house' && !(Number(node.probability) === 0 || Number(node.probability) === 1)) out.push(", 'if (false) out.push(');
    return body;
}
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const done = () => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); };
    if (!pw) { console.log('  note  Playwright is not installed: the app checks did not run'); return done(); }
    console.log('in the app' + (MUT ? ' (MUTATION ' + MUT + ')' : ''));
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
        const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errs = []; pg.on('pageerror', e => errs.push(String(e && e.message || e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await sleep(3500);
        await pg.evaluate(() => { const gt = document.getElementById('sl-auth-gate'); if (gt) gt.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); });
        await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(3000);
        const r = await pg.evaluate(async () => {
            const A = ftaPages.find(p => p.id === 'pg-ac-fc01') || ftaPages.find(p => p && p.root && p.root.type === 'gate' && !p.verifies);
            const ev = (id, type, p, lid) => ({ id, logicalId: lid || id, displayId: id.toUpperCase(), type, name: id, probability: p, inputMode: 'probability', children: [] });
            const C = ev('se-c', 'conditioning', 0.1), H = ev('se-h', 'house', 1), X = ev('se-x', 'basic', 1e-3), Y = ev('se-y', 'basic', 1e-3);
            const R1 = ev('se-r1', 'basic', 1e-3, 'se-R'), R2 = ev('se-r2', 'basic', 1e-3, 'se-R'), Z = ev('se-z', 'basic', 1e-3);
            const H2 = ev('se-h2', 'house', 2e-9);
            const inh = { id: 'se-inh', displayId: 'G-SEI', type: 'gate', gateType: 'INHIBIT', name: 'In icing', children: [X, C] };
            A.root.children.push(inh,
                { id: 'se-and', displayId: 'G-SEA', type: 'gate', gateType: 'AND', name: 'Configured', children: [H, Y] },
                { id: 'se-or1', displayId: 'G-SEO1', type: 'gate', gateType: 'AND', name: 'Repeated 1', children: [R1, Z] },
                { id: 'se-or2', displayId: 'G-SEO2', type: 'gate', gateType: 'OR', name: 'Repeated 2', children: [R2, H2] });
            openFTAPageById(A.id); syncFtaConfigFromActivePage(); ftaConfig.mode = 'top-down'; A.mode = 'top-down';
            calculateAllProbabilities(); calculateAllProbabilities();
            const out = { C: C.probability, H: H.probability, X: X.probability, Y: Y.probability, gateInh: inh.probability, R: [R1.probability, R2.probability], H2: H2.probability };
            const target = A.root.probability, exact = SLTopBasis.exactTop(A.root);
            out.closes = (typeof exact === 'number' && exact <= target * (1 + 1e-6)) || !!A.root._exactCloseRefused;
            out.exact = exact; out.target = target;
            out.warnH2 = ftaNodeWarnings(H2, false).map(w => w.key);
            out.warnH = ftaNodeWarnings(H, false).map(w => w.key);
            return out;
        });
        check('the conditioning event keeps the 0.1 set on it', r.C === 0.1, JSON.stringify(r));
        check('the house event stays true (1)', r.H === 1, JSON.stringify(r));
        check('the events beside them carry the budget', r.X > 0 && r.X < 1 && r.Y > 0 && r.Y < 1, JSON.stringify(r));
        check('the INHIBIT basic event is its gate budget divided by the conditioning probability', r.gateInh > 0 && Math.abs(r.X * 0.1 - r.gateInh) <= 1e-6 * r.gateInh, r.X + ' x 0.1 vs ' + r.gateInh);
        check('a house event left holding an old budget keeps it (no silent change) and is flagged', r.H2 === 2e-9 && r.warnH2.includes('house-value') && !r.warnH.includes('house-value'), JSON.stringify([r.H2, r.warnH2, r.warnH]));
        check('the tree still closes on its target', r.closes === true, r.exact + ' vs ' + r.target);
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) { check('test crashed: ' + (e && e.stack || e), false); }
    finally { await browser.close(); srv.close(); }
    done();
})();
