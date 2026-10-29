/*
 * regression_alloc_beta_20261028.test.js
 *
 * 28 Oct 2026. Waqas: "once they confirm there is no independence that is when the beta factors apply". The agreed
 * rule, with his answer that "None, no claim" counts as compromised:
 *   - an AND gate whose independence is compromised (by hand or by a Common Mode Analysis finding) or "None, no claim":
 *     the common cause (beta) term of the members that meet there is part of the allocation; the budgets are closed
 *     so the exact total, common cause included, is at or under the target, and the gate says why;
 *   - claimed (the default) or substantiated: the term is left out of the allocation tree's total and budgets (no
 *     false "the tree adds up to more than its target");
 *   - verification and the pass/fail screens always count common cause;
 *   - "None, no claim" with no common cause group asks for one, as a compromised gate does.
 *
 * [A] wiring (pure)  [B] the real app (Playwright + Chromium; skipped with a note where missing)
 * MUTATE=<name> reverts one guard; each must turn the test red. Without MUTATE all of them are run.
 * Run: node tests/regression_alloc_beta_20261028.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 400) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUTATIONS = {
    view:    ['fta_quant_modules.js', "plan.excluded.forEach(x => x.members.forEach(n => { held.push([n, n.ccfGroup]); delete n.ccfGroup; }));", ''],
    none:    ['fta_quant_modules.js', "    if (raw === 'none') return 'none';\n", ''],
    close:   ['fta_quant_modules.js', "(_allocNeedsExactClose(rootPage.root) || _ccfPlan.counted.length > 0)", "(_allocNeedsExactClose(rootPage.root))"],
    restore: ['fta_quant_modules.js', "    finally { held.forEach(h => { h[0].ccfGroup = h[1]; }); }", "    finally { }"],
    flag:    ['support_modules.js', "        if (indep === 'compromised' || indep === 'none') {", "        if (indep === 'compromised') {"],
    cma:     ['fta_quant_modules.js', "        if (ids && ids.has(String(g.id))) return 'compromised';", '']
};
const MUT = process.env.MUTATE || '';
function read(f) {
    let s = fs.readFileSync(path.join(SITE, f), 'utf8');
    if (MUT) { const m = MUTATIONS[MUT]; if (!m) { console.error('unknown mutation ' + MUT); process.exit(3); }
        if (m[0] === f) { if (s.indexOf(m[1]) < 0) { console.error('mutation anchor not found: ' + MUT); process.exit(4); } s = s.split(m[1]).join(m[2]); } }
    return s;
}

console.log('\n[A] wiring' + (MUT ? '  (MUTATE=' + MUT + ')' : ''));
const Q = read('fta_quant_modules.js'), S = read('support_modules.js'), H = read('helpers_modules.js');
check('the allocation total uses the allocation view of common cause', /_withAllocCcfView\(r, \(\) => _slExactTopOrNull\(r\)\)/.test(Q));
check('the close runs in the allocation view', /_withAllocCcfView\(rootPage\.root, \(\) => \{/.test(Q) && /\}, _ccfPlan\);/.test(Q));
check('the pill shows where common cause was counted', /node\._ccfAlloc\.forEach/.test(H));

let pw = null;
for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function finish() {
    console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (MUTATE=' + MUT + ')' : ''));
    if (!MUT && !process.env.NOMUT) {
        console.log('\n[M] every guard, reverted, turns this test red');
        const cp = require('child_process');
        const browserOnly = ['view', 'close', 'restore', 'flag', 'none', 'cma'];
        for (const k of Object.keys(MUTATIONS)) {
            if (!pw && browserOnly.indexOf(k) >= 0) { console.log('  SKIP  mutation ' + k + ' (needs the browser checks)'); continue; }
            const r2 = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { MUTATE: k }), encoding: 'utf8', timeout: 300000 });
            check('mutation ' + k + ' goes red', r2.status === 1, (r2.stdout || '').split('\n').filter(l => /FAIL/.test(l)).slice(0, 2).join(' ') + (r2.stderr || '').slice(0, 200));
        }
        console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
    }
    process.exit(fail ? 1 : 0);
}
if (!pw) { console.log('  note  Playwright is not installed on this machine: [B] did not run'); finish(); }

function serve() {
    return new Promise(res => {
        const srv = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(SITE, path.normalize(p));
            if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
            fs.readFile(f, (e, b) => {
                if (e) { r.writeHead(404); return r.end('not found'); }
                if (MUT && MUTATIONS[MUT][0] === path.basename(f)) b = Buffer.from(read(path.basename(f)));
                r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b);
            });
        }).listen(0, '127.0.0.1', () => res(srv));
    });
}

(async () => {
    console.log('\n[B] the real app');
    const srv = await serve();
    let browser;
    try { browser = await pw.chromium.launch(); }
    catch (e) { console.log('  note  Chromium could not start here: [B] did not run'); srv.close(); finish(); }
    try {
        const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
        const errs = []; pg.on('pageerror', e => errs.push(String(e)));
        pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/'); await sleep(3500);
        await pg.evaluate(() => {
            const g = document.getElementById('sl-auth-gate'); if (g) g.remove();
            document.documentElement.classList.remove('sl-auth-gate-blocked');
            document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
        });
        await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(3000);
        const out = await pg.evaluate(async () => {
            const page = ftaPages.find(p => /^PASA · FC-07/.test(p.name) && !/Verification/.test(p.name));
            openFTAPageById(page.id); calculateAllProbabilities();
            const leaves = [], gates = []; (function w(n) { if (!n) return; const k = n.children || n._children; (n.type === 'gate' ? gates : leaves).push(n); if (k) k.forEach(w); })(page.root);
            const L0 = JSON.parse(JSON.stringify(Object.assign({}, leaves[0], { children: undefined }))), G0 = JSON.parse(JSON.stringify(Object.assign({}, gates[1] || gates[0], { children: undefined })));
            let nid = 910000;
            const strip = o => { Object.keys(o).forEach(k => { if (k[0] === '_' || /^(probability|lambda|allocatedDAL|externalSource|identity|realizedByItemId|sysmlRef|logicalId|ccfGroup|beta|gamma|delta|ccfModel|ccfGroupSize|dalIndependence|xOffset|yOffset|descBoxHeight|achievableLambda)$/.test(k)) delete o[k]; }); return o; };
            const L = (name, extra) => Object.assign(strip(JSON.parse(JSON.stringify(L0))), { id: ++nid, displayId: 'BE-' + nid, name, type: 'basic', logicalId: nid }, extra || {});
            const G = (gt, kids, extra) => Object.assign(strip(JSON.parse(JSON.stringify(G0))), { id: ++nid, displayId: 'G-' + nid, name: gt + ' ' + nid, type: 'gate', gateType: gt, children: kids }, extra || {});
            const cc = { ccfGroup: 'CCF-PUMP', beta: 0.05 };
            const realCma = window._cmaCompromisedIndex;
            const run = (name, mk, opts) => {
                opts = opts || {};
                const kids = mk(); page.root.children = kids; delete page.root._children;
                if (opts.cmaGate) window._cmaCompromisedIndex = () => ({ ids: new Set([String(opts.cmaGate())]), pairs: new Map() });
                else window._cmaCompromisedIndex = realCma;
                let err = null;
                try { calculateAllProbabilities(); if (typeof propagateDalFromTrueRoot === 'function') propagateDalFromTrueRoot(); } catch (e) { err = String(e).slice(0, 120); }
                window._cmaCompromisedIndex = realCma;
                const r = page.root, and = kids[0];
                const ls = []; (function w(n) { if (!n) return; const k = n.children || n._children; if (n.type !== 'gate') ls.push(n); if (k) k.forEach(w); })(and);
                let full = null; try { full = SLTopBasis.exactTop(r); } catch (_) {}
                const warnAnd = (typeof ftaNodeWarnings === 'function') ? ftaNodeWarnings(and, false) : [];
                const warnRoot = (typeof ftaNodeWarnings === 'function') ? ftaNodeWarnings(r, true) : [];
                return { name, err, mode: ftaConfig.mode, target: r.probability, actual: r._bddActualProb, full,
                    leafP: ls.map(n => n.probability), groupsKept: ls.filter(n => n.ccfGroup === 'CCF-PUMP').length,
                    note: (and._ccfAlloc || []).map(x => x.text), rootNotes: (r._ccfAllocAll || []).length,
                    warnAnd: warnAnd.map(x => x.key + ':' + x.title), warnRoot: warnRoot.map(x => x.key) };
            };
            const res = {};
            res.plain    = run('plain', () => [G('AND', [L('pump A'), L('pump B')])]);
            res.none     = run('none', () => [G('AND', [L('pump A', cc), L('pump B', cc)], { dalIndependence: 'none' })]);
            res.comp     = run('comp', () => [G('AND', [L('pump A', cc), L('pump B', cc)], { dalIndependence: 'compromised' })]);
            res.claimed  = run('claimed', () => [G('AND', [L('pump A', cc), L('pump B', cc)])]);
            res.subst    = run('subst', () => [G('AND', [L('pump A', cc), L('pump B', cc)], { dalIndependence: 'substantiated' })]);
            let cmaId = null;
            res.cma      = run('cma', () => { const g = G('AND', [L('pump A', cc), L('pump B', cc)]); cmaId = g.id; return [g]; }, { cmaGate: () => cmaId });
            res.underOr  = run('underOr', () => [G('OR', [G('AND', [L('pump A', cc), L('x')], { dalIndependence: 'none' }), G('AND', [L('pump B', cc), L('y')], { dalIndependence: 'none' })])]);
            res.noneBare = run('noneBare', () => [G('AND', [L('pump A'), L('pump B')], { dalIndependence: 'none' })]);
            return res;
        });
        const R = out;
        const ratio = c => (typeof c.actual === 'number' && c.target) ? c.actual / c.target : null;
        check('every case ran on a top-down tree without an error', Object.values(R).every(c => !c.err && c.mode === 'top-down'), JSON.stringify(Object.values(R).filter(c => c.err || c.mode !== 'top-down').map(c => c.name + ':' + c.err)));
        // counted: none, compromised, a CMA finding
        ['none', 'comp', 'cma'].forEach(k => {
            const c = R[k], st = k === 'none' ? 'no independence claim' : 'independence compromised';
            check(k + ': the total with common cause is at or under the target, closed tight', ratio(c) !== null && ratio(c) <= 1 + 1e-9 && ratio(c) >= 0.999, String(ratio(c)));
            check(k + ': the budgets are tighter than without common cause', c.leafP.length === 2 && R.plain.leafP.length === 2 && c.leafP.every((p, i) => p < R.plain.leafP[i] * 0.999), JSON.stringify([c.leafP, R.plain.leafP]));
            check(k + ': the gate says common cause was counted and why', c.note.length === 1 && c.note[0].indexOf(st) >= 0 && /beta 0\.05/.test(c.note[0]) && c.warnAnd.some(w => /^ccf-alloc-0:Common cause counted/.test(w)), JSON.stringify([c.note, c.warnAnd]));
            check(k + ': the pass/fail total agrees (common cause counted)', typeof c.full === 'number' && c.full <= c.target * (1 + 1e-6), String(c.full / c.target));
        });
        // not counted: claimed (default), substantiated, members meeting at an OR
        ['claimed', 'subst', 'underOr'].forEach(k => {
            const c = R[k];
            check(k + ': common cause is left out of the allocation total, no "over the target"', ratio(c) !== null && ratio(c) <= 1 + 1e-9 && !c.warnRoot.includes('actual-over'), String(ratio(c)) + ' ' + JSON.stringify(c.warnRoot));
            check(k + ': nothing on the gate about common cause counted', c.note.length === 0 && c.rootNotes === 0, JSON.stringify(c.note));
        });
        check('claimed: the budgets are the same as without common cause', R.claimed.leafP.every((p, i) => Math.abs(p / R.plain.leafP[i] - 1) < 1e-9), JSON.stringify([R.claimed.leafP, R.plain.leafP]));
        check('claimed: verification and pass/fail screens still count common cause (well over the allocation target)', typeof R.claimed.full === 'number' && R.claimed.full > R.claimed.target * 10, String(R.claimed.full / R.claimed.target));
        check('the members keep their common cause group after every run', ['none', 'comp', 'claimed', 'subst', 'cma', 'underOr'].every(k => R[k].groupsKept === 2), JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, c]) => [k, c.groupsKept]))));
        check('"None, no claim" with no common cause group asks for one', R.noneBare.warnAnd.some(w => /^independence:No independence claim/.test(w)), JSON.stringify(R.noneBare.warnAnd));
        check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    } catch (e) {
        check('[B] ran without throwing', false, String(e && e.stack || e).slice(0, 400));
    } finally {
        try { await browser.close(); } catch (_) {}
        srv.close(); finish();
    }
})();
