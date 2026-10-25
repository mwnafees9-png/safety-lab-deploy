#!/usr/bin/env node
/*
 * Regression (browser): an FHA probability requirement names only the phases of its most severe classification.
 * 25 Oct 2026.
 *
 * WAQAS: "why are we listing every single phase of flight, auto req should just be picking the most conservative
 * phases and generating requirements against those". Agreed rule:
 *   [P1] one requirement per failure condition, its number from the most severe classification, naming only the
 *        phases at that severity (was: every phase any of its rows listed)
 *   [P2] the milder phases are named in the rationale with their classification, covered by the stricter objective
 *   [P3] when the most severe classification holds in every phase of the flight phase table: "in any phase of flight"
 *   [P4] two rows at the same most severe classification: both their phases are named
 *   [P5] a change to a milder row still brings the requirement back for review (it is part of its source)
 * MUTATION PROOFS (SL_PH_MUTATE): union (every row's phases again) turns P1 red; milder (the rationale drops them)
 * turns P2 red; any (no "any phase") turns P3 red; fp (milder rows not in the source fingerprint) turns P5 red.
 * Run: node tests/regression_req_governing_phases_20261025.test.js   (Playwright + Chromium)
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_PH_MUTATE || '';
const MUTS = {
    union: ['if (m && m.severity === canonical.severity) _ph(m)', 'if (m) _ph(m)'],
    milder: ['Phase: ${phaseLabel}.${milderRat}', 'Phase: ${phaseLabel}.'],
    any: ['const everyPhase = govPhases.length > 0', 'const everyPhase = false && govPhases.length > 0'],
    fp: ["milder.map(m => m.phase + ':' + m.severity).sort(), everyPhase ? 'every' : '',", "everyPhase ? 'every' : '',"],
};
const mutate = (file, body) => { const m = MUTS[MUT]; return m && file === 'assurance_modules.js' ? body.replace(m[0], m[1]) : body; };

(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed on this machine: the browser checks did not run'); process.exit(0); }
    if (MUT) { const src = fs.readFileSync(path.join(SITE, 'assurance_modules.js'), 'utf8'); if (!MUTS[MUT] || mutate('assurance_modules.js', src) === src) { console.log('  FAIL  the mutation ' + MUT + ' found nothing to change'); process.exit(1); } }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && /\.js$/.test(f)) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof loadSampleProject === 'function' && typeof AutoReq !== 'undefined', null, { timeout: 60000 });
        await page.evaluate(async () => { const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); window.SL_VERIFY_SYNC_OFF = true; await loadSampleProject(); });
        await page.waitForTimeout(2000);
        const R = await page.evaluate(() => {
            const out = {};
            const phases = flightPhasesData.map(p => p.phase);
            out.phases = phases;
            const sub = (acFunctionsData[0] || {}).subId || 'SF-01';
            acFhaData.length = 0; acReqData.length = 0;
            let n = 0;
            const row = (fcId, desc, severity, ph) => acFhaData.push({ internalId: 'tst-' + (++n), subId: sub, fcId, fcDesc: desc, severity, phases: ph.join(', '), effAc: 'x', effCrew: 'x', effPax: 'x' });
            const [P0, P1, P2, P3, P4] = phases;   // five different phases from the project's table
            row('TST-1', 'loss of test function one', 'Catastrophic', [P2, P4]);
            row('TST-1', 'loss of test function one', 'Major', [P1, P3]);
            row('TST-1', 'loss of test function one', 'Minor', [P0]);
            row('TST-2', 'loss of test function two', 'Hazardous', phases);
            row('TST-3', 'loss of test function three', 'Major', [P1]);
            row('TST-3', 'loss of test function three', 'Major', [P3]);
            out.P = { P0, P1, P2, P3, P4 };
            const gen = () => AutoReq.generate({ fha: true }, 'ac');
            const m1 = gen();
            const prob = m1.isNew.filter(c => c.reqSource.generator === 'fha-prob');
            const by = id => prob.find(c => c.reqSource.context.fcId === id) || {};
            out.t1 = { text: by('TST-1').text, rat: by('TST-1').rat || by('TST-1').rationale, prob: by('TST-1').reqSource && by('TST-1').reqSource.context.prob, cat: getSafetyTarget('Catastrophic').prob };
            out.t2 = by('TST-2').text; out.t3 = by('TST-3').text;
            out.count = prob.length;
            AutoReq.applyMerge(m1, { acceptNew: true, acceptUpdates: true, acceptOrphanRemoval: false });
            out.quiet = gen().isUpdated.length;
            acFhaData.find(r => r.fcId === 'TST-1' && r.severity === 'Minor').phases = [P0, P4 === P0 ? P1 : phases[5] || P1].join(', ');
            const m3 = gen();
            out.updated = m3.isUpdated.map(u => u.next.reqSource.context.fcId);
            return out;
        });
        const { P } = R;
        const has = (s, x) => String(s || '').indexOf(x) >= 0;
        check('the project has five or more flight phases to test with', R.phases.length >= 6, JSON.stringify(R.phases));
        check('[P1] the requirement names only the phases of the most severe classification, with its number', R.t1.text === 'The probability of loss of test function one during ' + P.P2 + ' and ' + P.P4 + ' shall not exceed ' + R.t1.text.split('shall not exceed ')[1] && !has(R.t1.text, P.P0) && !has(R.t1.text, P.P1 + ' ') && R.t1.prob === R.t1.cat, JSON.stringify(R.t1));
        check('[P1] one requirement per failure condition', R.count === 3, R.count);
        check('[P2] the milder phases are named in the rationale with their classification', has(R.t1.rat, 'Milder in ') && has(R.t1.rat, P.P1 + ' (Major)') && has(R.t1.rat, P.P3 + ' (Major)') && has(R.t1.rat, P.P0 + ' (Minor)') && has(R.t1.rat, 'covered by this objective'), R.t1.rat);
        check('[P3] the most severe classification in every phase: "in any phase of flight"', R.t2 === 'The probability of loss of test function two in any phase of flight shall not exceed ' + String(R.t2).split('shall not exceed ')[1], R.t2);
        check('[P4] two rows at the most severe classification: both their phases named', R.t3 === 'The probability of loss of test function three during ' + P.P1 + ' and ' + P.P3 + ' shall not exceed ' + String(R.t3).split('shall not exceed ')[1], R.t3);
        check('[P5] nothing changed: nothing comes back for review', R.quiet === 0, R.quiet);
        check('[P5] a milder row changed: its requirement comes back for review', R.updated.indexOf('TST-1') >= 0, JSON.stringify(R.updated));
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
