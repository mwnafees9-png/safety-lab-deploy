#!/usr/bin/env node
/*
 * Regression, browser: the zonal safety analysis on the ZSA page (site/zsa_engine_ui.js), 19 Oct 2026, build 7.
 * Confirmed (Waqas, 19 Oct 2026): Safety Lab owns the ZSA; Sys Lab sends its routes and measured clearances.
 *
 * On the real app with the Aeolus HL-1 project (tests/fixtures/zonal_exchange/aeolus-safetylab.json) and Sys Lab's
 * physical architecture file, version 3, imported (aeolus-syslab-physical.json):
 *   [A] the ZSA page shows the analysis under its heading: the totals the engine computes, what is missing, and by
 *       default only the zones with open violations
 *   [B] a zone opens to what is in it and its findings (the wing box: both aileron hydraulic channels too close)
 *   [C] a person dispositions: accept needs a reason and goes on record with the name; mitigate needs a requirement
 *       in the project; undo takes it away; the record lives in the project
 *   [D] "Update the ZSA table" writes one row per zone with anything in it, and rows typed by people stay
 * Screenshots to ../zones_shots/ when that folder exists.
 * Run: node tests/regression_zsa_page_ui_20261019.test.js   (SKIP when Playwright or Chromium is missing)
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..'), SITE = path.join(ROOT, 'site'), FIX = path.join(__dirname, 'fixtures', 'zonal_exchange');
const SHOTS = path.resolve(ROOT, '..', 'zones_shots');
let pass = 0, fail = 0;
const J = x => JSON.stringify(x);
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' - ' + String(d).slice(0, 500) : '')); } };

(async () => {
    let chromium;
    try { chromium = require('playwright').chromium; } catch (e) { try { chromium = require('/opt/npm-tools/node_modules/playwright').chromium; } catch (_) { console.log('  SKIP  playwright is not installed'); console.log('\n0 passed, 0 failed'); return; } }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm' };
    const server = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
        const f = path.join(SITE, p);
        if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    let browser;
    try { browser = await chromium.launch(); } catch (e) { console.log('  SKIP  no Chromium (' + String(e.message).split('\n')[0] + ')'); server.close(); console.log('\n0 passed, 0 failed'); return; }
    const shoot = async (page, name) => { if (fs.existsSync(SHOTS)) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); };
    const SL = JSON.parse(fs.readFileSync(path.join(FIX, 'aeolus-safetylab.json'), 'utf8'));
    const PH = JSON.parse(fs.readFileSync(path.join(FIX, 'aeolus-syslab-physical.json'), 'utf8'));
    try {
        const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
        const page = await ctx.newPage();
        const errors = []; page.on('pageerror', e => errors.push(String(e)));
        await page.goto('http://127.0.0.1:' + server.address().port + '/');
        await page.waitForFunction(() => typeof window._applyProjectData === 'function' && window.SLZsaEngine && window.SLZsaPage && window.SLZonalExchange, null, { timeout: 60000 });
        const keep = () => page.evaluate(() => document.querySelectorAll('.sl-ack-overlay .sl-ack-keep').forEach(k => k.click()));
        await page.evaluate(async ([sl, ph]) => {
            const ung = () => { document.querySelectorAll('[aria-label="Sign in to Safety Lab Aero"]').forEach(g => g.remove()); document.documentElement.classList.remove('sl-auth-gate-blocked');
                const t = document.getElementById('signup-modal-title'); if (t) { let o = t; while (o && o.parentElement && o.parentElement !== document.body) o = o.parentElement; if (o) o.style.display = 'none'; }
                document.querySelectorAll('.modal-overlay, .modal').forEach(o => { if (getComputedStyle(o).display !== 'none' && !o.closest('.sde') && !o.classList.contains('sl-ack-overlay') && !o.classList.contains('sl-dialog-overlay')) o.style.display = 'none'; }); };
            window.__ung = ung; ung();
            _applyProjectData(sl); await new Promise(r => setTimeout(r, 1200)); ung();
            const r = SLZonalExchange.readSysLab(ph, 'aeolus-syslab-physical.json'); if (!r.ok) throw new Error(r.err);
            window.__imp = SLZonalExchange.importSysLab(r.data, 'Mei Lin Tan', { at: '2026-10-19T12:00:00Z' });
        }, [SL, PH]);
        await page.waitForTimeout(800); await keep(); await page.waitForTimeout(600);
        const imported = await page.evaluate(() => { const p = projectConfig.sysLabPhysical; return p && p.routing ? p.routing.routes.length : 0; });
        check('setup: Aeolus loaded and Sys Lab\'s routes imported (48)', imported === 48, imported);
        await page.evaluate(() => { window.__typed = zsaData.filter(x => x.origin !== 'zsa-engine').length; });

        console.log('\n[A] the analysis on the ZSA page');
        await page.evaluate(() => { switchTab('zsa'); window.__ung(); });
        await page.waitForTimeout(800); await keep();   // the import waits in the change acknowledgement: Confirm all, then the page opens
        try { await page.waitForSelector('#zsa-analysis .zsae-panel', { timeout: 30000 }); }
        catch (e) { console.log('  debug', await page.evaluate(() => JSON.stringify({ host: !!document.getElementById('zsa-analysis'), html: (document.getElementById('zsa-analysis') || {}).innerHTML, view: (document.getElementById('view-zsa') || {}).style.display, wrapped: !!switchTab._zsaeWrapped, visible: [...document.querySelectorAll('[id^="view-"]')].filter(v => v.offsetParent !== null).map(v => v.id), sw: String(switchTab).slice(0, 300) })).catch(x => String(x))); throw e; }
        const A = await page.evaluate(() => {
            const host = document.getElementById('zsa-analysis'), head = document.querySelector('#view-zsa .header-with-export'), res = SLZsaEngine.compute();
            const shown = [...host.querySelectorAll('[data-zsae-zone]')].map(d => d.getAttribute('data-zsae-zone'));
            const withOpenV = res.zones.filter(z => z.findings.some(id => { const f = res.findings.find(x => x.id === id); return f.severity === 'violation' && f.status === 'open'; })).map(z => z.zoneId);
            return { text: host.innerText, under: head && head.nextSibling === host, s: res.summary, gaps: res.gaps.length, shown, withOpenV, color: getComputedStyle(host.querySelector('.zsae-text') || host).color };
        });
        check('it sits right under the ZSA heading', A.under);
        check('it says the totals the engine computes', new RegExp(A.s.zones + ' zones, ' + A.s.findings + ' findings: ' + A.s.violations + ' violations, ' + A.s.advisories + ' advisories').test(A.text), A.text.slice(0, 300));
        check('it says what the analysis is missing (the untyped run, the undeclared redundancy)', /What the analysis is missing/.test(A.text) && /W-RT-005 has no type/.test(A.text) && /no redundancy declared/.test(A.text));
        check('by default only the zones with open violations are listed', A.shown.length > 0 && J(A.shown.slice().sort()) === J(A.withOpenV.slice().sort()), J({ shown: A.shown.length, want: A.withOpenV.length }));
        await shoot(page, 'sl_zsa_01_analysis_panel');

        console.log('\n[B] a zone opens');
        const cwbId = await page.evaluate(() => (ZONES.resolve('Z-CWB') || {}).id);
        await page.click('#zsa-analysis [data-zsae-zone="' + cwbId + '"] > summary');
        await page.waitForTimeout(300);
        const B = await page.evaluate(id => { const d = document.querySelector('#zsa-analysis [data-zsae-zone="' + id + '"]'); return { open: d.open, text: d.innerText, n: d.querySelectorAll('[data-zsae-finding]').length }; }, cwbId);
        check('the wing box opens to what is in it and the worst event if it is all lost', B.open && /route H-A-01/.test(B.text) && /Everything here lost at once/.test(B.text), B.text.slice(0, 300));
        check('and its findings: both aileron hydraulic channels too close (seeded finding 1)', /H-A-01/.test(B.text) && /SFN-FCS2/.test(B.text) && B.n > 0);
        await page.evaluate(id => document.querySelector('#zsa-analysis [data-zsae-zone="' + id + '"]').scrollIntoView(), cwbId);
        await shoot(page, 'sl_zsa_02_wing_box_open');

        console.log('\n[C] dispositions');
        const FID = 'ZSA:channels-close:SFN-FCS2:H-A-01|H-B-01';
        const has = await page.evaluate(id => !!document.querySelector('#zsa-analysis [data-zsae-finding="' + CSS.escape(id) + '"]'), FID);
        check('the channel finding is on the page with its buttons', has);
        // the answers a person types into the app's own prompts
        const answer = list => page.evaluate(l => { window.__answers = l.slice(); window.slPrompt = async () => window.__answers.length ? window.__answers.shift() : null; }, list);
        const click = (act, id) => page.click('#zsa-analysis [data-zsae-finding="' + id.replace(/"/g, '\\"') + '"] [data-zsae-act="' + act + '"]');
        await page.fill('#zsae-by', 'Mei Lin Tan');
        await answer(['ok']); await click('accept', FID); await page.waitForTimeout(1500);
        const c0 = await page.evaluate(id => (projectConfig.zsaDispositions || {})[id] || null, FID);
        check('accept with no real reason is refused (nothing recorded)', c0 === null, J(c0));
        await page.selectOption('#zsae-filter', 'all'); await page.waitForTimeout(1200);   // a dispositioned finding is no longer open: show everything
        await answer(['The two lines are in separate bays of the wing box; see the installation drawing.']); await click('accept', FID); await page.waitForTimeout(1500);
        const c1 = await page.evaluate(id => ({ d: (projectConfig.zsaDispositions || {})[id], t: (document.querySelector('#zsa-analysis [data-zsae-finding="' + CSS.escape(id) + '"]') || {}).innerText || '' }), FID);
        check('accepted: on record with the name and the reason, and the page says so', c1.d && c1.d.state === 'accepted' && c1.d.by === 'Mei Lin Tan' && /Accepted/.test(c1.t) && /Mei Lin Tan/.test(c1.t), J(c1).slice(0, 400));
        await click('undo', FID); await page.waitForTimeout(1500);
        const c2 = await page.evaluate(id => (projectConfig.zsaDispositions || {})[id] || null, FID);
        check('undo takes it away', c2 === null);
        await answer(['REQ-NOT-HERE', '']); await click('mitigate', FID); await page.waitForTimeout(1500);
        const c3 = await page.evaluate(id => (projectConfig.zsaDispositions || {})[id] || null, FID);
        check('mitigate with a requirement that is not in the project is refused', c3 === null);
        const rq = await page.evaluate(() => { const r = acReqData.find(x => x && x.id); return r ? r.id : ''; });
        await answer([rq, 'Separation requirement on the aileron hydraulic runs']); await click('mitigate', FID); await page.waitForTimeout(1500);
        const c4 = await page.evaluate(id => ({ d: (projectConfig.zsaDispositions || {})[id], t: (document.querySelector('#zsa-analysis [data-zsae-finding="' + CSS.escape(id) + '"]') || {}).innerText || '' }), FID);
        check('mitigated by a requirement in the project: on record, and the page names it and whether it is verified', rq && c4.d && c4.d.state === 'mitigated' && c4.d.requirementId === rq && new RegExp('Mitigated by ' + rq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(c4.t) && /verified/.test(c4.t), J(c4).slice(0, 400));
        await shoot(page, 'sl_zsa_03_disposition');

        console.log('\n[D] the ZSA table');
        await page.evaluate(() => { SLZsaPage.state.filter = 'open-violations'; SLZsaPage.render(); });
        await page.click('#zsa-analysis [data-zsae-act="materialize"]'); await page.waitForTimeout(2000);
        const D = await page.evaluate(() => {
            const res = SLZsaEngine.compute(), want = res.zones.filter(z => z.equipment.length || z.elements.length || z.routes.length).length;
            const rows = zsaData.filter(x => x.origin === 'zsa-engine');
            return { rows: rows.length, want, typed: zsaData.filter(x => x.origin !== 'zsa-engine').length, typed0: window.__typed, body: document.getElementById('zsa-body').innerText, cwb: rows.find(x => x.zoneId === 'Z-CWB') };
        });
        check('one row per zone with anything in it', D.rows === D.want && D.rows > 20, J({ rows: D.rows, want: D.want }));
        check('rows typed by people are untouched', D.typed === D.typed0, J({ typed: D.typed, before: D.typed0 }));
        check('the table on the page shows them (the wing box row, Catastrophic, with the disposition)', /Z-CWB/.test(D.body) && D.cwb && D.cwb.severity === 'Catastrophic' && /mitigated by/.test(D.cwb.mitigation), J(D.cwb && { s: D.cwb.severity, m: D.cwb.mitigation }).slice(0, 300));
        await page.click('#zsa-analysis [data-zsae-act="materialize"]'); await page.waitForTimeout(2000);
        const D2 = await page.evaluate(() => zsaData.filter(x => x.origin === 'zsa-engine').length);
        check('written again: no rows added', D2 === D.rows);
        await page.evaluate(() => document.getElementById('zsa-table').scrollIntoView()); await shoot(page, 'sl_zsa_04_table');
        check('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
    } finally { await browser.close(); server.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); });
