/* regression_fta_latent_20261101.test.js: latent plus one (customer checklist item 41).
 *
 * Waqas, 1 Nov 2026 ("41 is correct"): for each latent event, list every single active failure that, with it, reaches
 * the top; check each pair against the latent-plus-one rule; on the thread, link it to the covering check interval
 * requirement, or show it as open.
 * Checked on a catastrophic tree: a latent event under an AND gate with one active event is found as a pair; with no
 * check interval it is open (judged for catastrophic, hazardous and major conditions, listed only for minor); with an interval and no requirement it is open; once AutoReq's check interval requirement
 * is accepted it is covered and judged against the objective (a pair over the objective "exceeds"); the warning pill
 * says so; the report table lists the pair; the Golden Thread shows the latent-plus-one card linked to the requirement,
 * or flagged open; two active events or a latent event on its own are not pairs.
 * MUTATION PROOFS: SL_LP1_MUTATE=pairs (the pair is never found), =cover (the requirement is never found), =thread
 * (no card on the thread) must fail.
 * Run: node tests/regression_fta_latent_20261101.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const MUT = process.env.SL_LP1_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'pairs' && file === 'fta_latent.js') return body.replace('if (la === lb) return;', 'return;');
    if (MUT === 'cover' && file === 'fta_latent.js') return body.replace("if (r.reqSource.generator === 'fta-interval' && sid.slice(-want.length) === want)", 'if (false)');
    if (MUT === 'thread' && file === 'fta_view_modules.js') return body.replace("if(typeof window !== 'undefined' && window.SLFtaLatent) linkedPages.forEach(", "if(false) linkedPages.forEach(");
    return body;
}
const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
check('index.html loads fta_latent.js after fta_paste.js', HTML.indexOf('fta_latent.js?v=1.0') > HTML.indexOf('fta_paste.js?v='));
check('the SSA templates carry the latent plus one table', (fs.readFileSync(path.join(SITE, 'reports.js'), 'utf8').match(/'\{\{latent_plus_one_table\}\}'/g) || []).length === 2 && /latent_plus_one_table: 'Latent plus one'/.test(fs.readFileSync(path.join(SITE, 'report_writer.js'), 'utf8')));
check('no em dash in what fta_latent.js says', !/—/.test(fs.readFileSync(path.join(SITE, 'fta_latent.js'), 'utf8').replace(/\/\/.*$/gm, '')));

(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const done = () => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); };
    if (!pw) { console.log('  note  Playwright is not installed: the app checks did not run'); return done(); }
    console.log('\nin the app' + (MUT ? ' (MUTATION ' + MUT + ')' : ''));
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
        const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errs = []; pg.on('pageerror', e => errs.push(String(e && e.message || e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await sleep(3500);
        await pg.evaluate(() => { const gt = document.getElementById('sl-auth-gate'); if (gt) gt.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); });
        await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(3000);
        const r = await pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const out = {};
            const linked = p => (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
            const cat = (acFhaData || []).filter(f => f.severity === 'Catastrophic').map(f => String(f.internalId));
            const A = ftaPages.find(p => p && p.root && p.root.type === 'gate' && !p.verifies && !p.integrated && linked(p).map(String).some(id => cat.includes(id)));
            out.tree = A && A.name; if (!A) return out;
            const L = { id: 'lp1-L', logicalId: 'lp1-L', displayId: 'BE-LAT', type: 'basic', name: 'Standby pump fails (hidden)', probability: 1e-3, inputMode: 'probability', latent: true, children: [] };
            const X = { id: 'lp1-X', logicalId: 'lp1-X', displayId: 'BE-ACT', type: 'basic', name: 'Main pump fails', probability: 1e-6, inputMode: 'probability', children: [] };
            const Y = { id: 'lp1-Y', logicalId: 'lp1-Y', displayId: 'BE-ACT2', type: 'basic', name: 'Second active', probability: 1e-6, inputMode: 'probability', children: [] };
            const Z = { id: 'lp1-Z', logicalId: 'lp1-Z', displayId: 'BE-ACT3', type: 'basic', name: 'Third active', probability: 1e-6, inputMode: 'probability', children: [] };
            A.root.children.push({ id: 'lp1-G', displayId: 'G-LP1', type: 'gate', gateType: 'AND', name: 'Both pumps lost', children: [L, X] });
            A.root.children.push({ id: 'lp1-H', displayId: 'G-LP2', type: 'gate', gateType: 'AND', name: 'Two active', children: [Y, Z] });
            openFTAPageById(A.id); syncFtaConfigFromActivePage(); ftaConfig.mode = 'bottom-up'; A.mode = 'bottom-up';
            const snap = () => { const res = SLFtaLatent.pairs(A); const mine = res.rows.filter(x => x.latentLid === 'lp1-L'); return { n: mine.length, actives: mine.map(x => x.active.id), status: mine.map(x => x.status), rate: mine[0] && mine[0].rate, objective: mine[0] && mine[0].objective, sev: res.condition && res.condition.severity, refused: res.refused, other: res.rows.filter(x => /lp1-[YZ]/.test(x.latent.id) || /lp1-[YZ]/.test(x.active.id)).length }; };
            calculateAllProbabilities(); await wait(100);
            out.noInterval = snap();
            out.warnNoInterval = ftaNodeWarnings(L, false).filter(w => /latent-plus-one/.test(w.key));
            // a check interval, no requirement yet
            delete L.latent; L.repairModel = 'periodic'; L.tau = 200;
            calculateAllProbabilities(); await wait(100);
            out.noReq = snap();
            // AutoReq writes the check interval requirement; accept it
            const scope = 'ac';
            const m = AutoReq.generate({ ftaEvent: true }, scope);
            const cand = (m.isNew || []).find(c => c.reqSource && /:fta-interval:lp1-L$/.test(String(c.reqSource.sourceId)));
            out.autoreq = !!cand;
            if (cand) AutoReq.applyMerge({ scope: m.scope, isNew: [cand], isUpdated: [], unchanged: [], orphaned: [] }, { acceptNew: true, acceptUpdates: false, acceptOrphanRemoval: false });
            calculateAllProbabilities(); await wait(100);
            out.covered = snap();
            out.warnCovered = ftaNodeWarnings(L, false).filter(w => /latent-plus-one/.test(w.key));
            out.cov = SLFtaLatent.coveringRequirement('lp1-L'); out.cov = out.cov ? { kind: out.cov.kind, id: out.cov.req.traceId || out.cov.req.id, stale: out.cov.stale } : null;
            // the thread
            const g = _gtvBuildGraph({});
            const lk = 'cca:lp1:lp1-L';
            const card = g.nodes.find(n => n.key === lk);
            out.thread = { card: !!card, flag: card && card.flag, fromTree: g.links.some(l => l.s === 'fta:' + A.id && l.t === lk), toReq: g.links.some(l => l.s === lk && /^req:/.test(l.t)) };
            // the report table
            out.table = SLFtaLatent.tableRows([A]).filter(row => /BE-LAT/.test(row['Latent event']));
            // over the objective: a pair far too likely
            L.probability = 0.5; X.probability = 0.5;
            calculateAllProbabilities(); await wait(100);
            out.exceeds = snap();
            // without the requirement the thread card is flagged open
            L.probability = 1e-3; X.probability = 1e-6;
            const store = acReqData; const ix = store.findIndex(q => q.reqSource && /:fta-interval:lp1-L$/.test(String(q.reqSource.sourceId)));
            if (ix >= 0) store.splice(ix, 1);
            calculateAllProbabilities(); await wait(100);
            const g2 = _gtvBuildGraph({}); const card2 = g2.nodes.find(n => n.key === lk);
            out.openCard = card2 ? [card2.flag, card2.flagReason] : null;
            // 2 Nov 2026 (Waqas): hazardous and major are judged too; minor is listed only
            const fcs = (acFhaData || []).filter(f => linked(A).map(String).includes(String(f.internalId))), keep = fcs.map(f => f.severity);
            const statusAt = sev => { fcs.forEach(f => { f.severity = sev; }); return SLFtaLatent.pairs(A).rows.filter(x => x.latentLid === 'lp1-L').map(x => x.status)[0]; };
            out.bySev = { Hazardous: statusAt('Hazardous'), Major: statusAt('Major'), Minor: statusAt('Minor') };
            fcs.forEach((f, i) => { f.severity = keep[i]; });
            return out;
        });
        check('hazardous and major conditions are judged too; minor is listed only', r.bySev && r.bySev.Hazardous === 'open-no-requirement' && r.bySev.Major === 'open-no-requirement' && r.bySev.Minor === 'not-judged', JSON.stringify(r.bySev));
        check('the test tree serves a catastrophic failure condition', !!r.tree && r.noInterval && r.noInterval.sev === 'Catastrophic', JSON.stringify(r).slice(0, 300));
        check('the latent event and its one active failure are found as a pair', r.noInterval.n === 1 && r.noInterval.actives[0] === 'lp1-X', JSON.stringify(r.noInterval));
        check('two active failures, or a latent event alone, are not pairs', r.noInterval.other === 0, JSON.stringify(r.noInterval));
        check('with no check interval the pair is open, and the pill says so', r.noInterval.status[0] === 'open-no-interval' && r.warnNoInterval.length === 1 && r.warnNoInterval[0].sev === 'warn' && /no check interval/.test(r.warnNoInterval[0].text) && /BE-ACT Main pump fails/.test(r.warnNoInterval[0].text), JSON.stringify(r.warnNoInterval));
        check('with an interval but no requirement it is still open', r.noReq.status[0] === 'open-no-requirement', JSON.stringify(r.noReq));
        check('AutoReq writes the check interval requirement for it', r.autoreq === true);
        check('once accepted, the requirement covers it and the pair is judged against the objective', r.covered.status[0] === 'meets' && r.cov && r.cov.kind === 'acReq' && !r.cov.stale && r.covered.rate > 0 && r.covered.objective > 0, JSON.stringify(r.covered) + ' ' + JSON.stringify(r.cov));
        check('the pill then reads covered, with the requirement', r.warnCovered.length === 1 && r.warnCovered[0].key === 'latent-plus-one-ok' && r.warnCovered[0].text.indexOf(r.cov && r.cov.id) !== -1, JSON.stringify(r.warnCovered));
        check('the Golden Thread card is linked from the tree and to the requirement', r.thread.card && !r.thread.flag && r.thread.fromTree && r.thread.toReq, JSON.stringify(r.thread));
        check('the report table lists the pair with its interval, requirement and status', r.table.length === 1 && /200 h/.test(r.table[0]['Check interval']) && /BE-ACT/.test(r.table[0]['Active failure']) && r.table[0]['Requirement'] !== 'none' && /Meets/.test(r.table[0]['Status']), JSON.stringify(r.table));
        check('a pair over the objective exceeds it', r.exceeds.status[0] === 'exceeds', JSON.stringify(r.exceeds));
        check('without its requirement the thread card is flagged open', r.openCard && r.openCard[0] === 'finding' && /no requirement covers/.test(r.openCard[1]), JSON.stringify(r.openCard));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) { check('test crashed: ' + (e && e.stack || e), false); }
    finally { await browser.close(); srv.close(); }
    done();
})();
