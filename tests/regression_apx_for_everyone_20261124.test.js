/* regression_apx_for_everyone_20261124.test.js: the Interdependence, MAC and CoFFE Autopilots are on for every customer.
 *
 * Waqas, 24 Nov 2026: "go ahead and get the new autopilots on the Radia build too please"; asked who sees them: "Every
 * customer"; asked whether the earlier pages stay reachable: "New pages only". His 15 Nov ruling stands: the
 * Autopilots ask, "the PASA only shows the results".
 *   S  the files: the team-only switch is retired (enabled() always true, the address not read), no "preview", "our
 *      team" or "Today's page" words left in the three Autopilots and the bridge, the menu has the entry, the pins
 *   A  opened as every customer opens it (the HL-1 demo, no address switch, a stored sl_apx left from the preview):
 *      the stored switch is cleared and ?apx=0 changes nothing; the Interdependence tab draws the Autopilot under its
 *      new name, with no switch back; the MAC and CoFFE tabs open their Autopilots, the earlier MAC page never shows;
 *      the menu entry opens the page
 *   P  the PASA: the entry bar names the three Autopilots (no "preview"); for a failure condition the interdependence
 *      question is a pointer to the Interdependence Autopilot (no table of its own to answer), the CoFFE cases a
 *      pointer to the CoFFE Autopilot (no case questions); the pointer opens that Autopilot at that failure condition;
 *      with the PASA's CoFFE answer "no" the appendix carries no CoFFE section and no CoFFE assumptions, with "yes" it
 *      carries what the CoFFE Autopilot sent
 *   K  what the PASA shows is kept until the project changes: asked twice it is the same; after a PASA-only answer it is
 *      the same; after a change to the project (a system renamed) it is worked out again and shows the new name
 *   C  a comment on a MAC rule opens the MAC Autopilot at the failure condition the rule stands for, where its comment
 *      button is
 *   Z  no page errors
 * MUTATION PROOFS (SL_AFE_MUTATE): switchback (the switch reads the stored flag again), bar (the switch back to the
 *   earlier page comes back), macold (the MAC tab opens the earlier MAC page), pasaasks (the PASA asks the interdependence
 *   table itself again), coffeno (the CoFFE Autopilot's tables show with the PASA's answer "no"), stale (what the PASA
 *   shows is kept through a project change), cmtjump (a MAC rule's comment opens the tab only). Each must turn this red.
 * Run: node tests/regression_apx_for_everyone_20261124.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' (' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site'), MUT = process.env.SL_AFE_MUTATE || '';
const rd = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function mutate(file, body) {
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing in ' + file + ': ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'switchback' && file === 'apx_autopilots.js') rep("function enabled() { return true; }", "function enabled() { var l = ls(); try { return !!(l && l.getItem(KEY) === '1'); } catch (_) { return false; } }");
    if (MUT === 'bar' && file === 'apx_autopilots.js') rep("var bar = '<div class=\"apx-bar\"><span style=\"font-size:12.5px\">Nothing reaches the PASA until you send it.</span></div>';", "var bar = '<div class=\"apx-bar\"><div class=\"apx-sw\"><button type=\"button\" class=\"on\" data-apx-view=\"new\">New Autopilot (preview)</button><button type=\"button\" data-apx-view=\"old\">Today\\'s page</button></div></div>';");
    if (MUT === 'macold' && file === 'apx_bridge.js') rep("if (tabId === 'mac' || tabId === 'coffe') { A.open(", "if (tabId === 'coffe') { A.open(");
    if (MUT === 'pasaasks' && file === 'pasa_autopilot.js') rep("        if (AXS) {\n            // 24 Nov 2026: the Interdependence Autopilot asks this", "        if (false) {\n            // 24 Nov 2026: the Interdependence Autopilot asks this");
    if (MUT === 'coffeno' && file === 'pasa_autopilot.js') rep("if (coffeOn() !== false && AX && AX.cof && AX.cof.length)", "if (AX && AX.cof && AX.cof.length)");
    if (MUT === 'stale' && file === 'apx_bridge.js') rep("if (sig !== _pasaMemo.sig) _pasaMemo.map = {};", "");
    if (MUT === 'cmtjump' && file === 'comment_kinds.js') rep("if (fc && A && A._ui) { A._ui.fc = S(fc.internalId); A.setAp('mac');", "if (false) { A._ui.fc = S(fc.internalId); A.setAp('mac');");
    return body;
}
(async () => {
    // ---- S: the files ---------------------------------------------------------------------------------------------------
    const idx = rd('index.html'), au = rd('apx_autopilots.js'), br0 = rd('apx_bridge.js'), mac = rd('apx_mac.js'), cof = rd('apx_coffe.js'), sup = rd('support_modules.js');
    check('S the switch is retired: enabled() is always true, the address is not read for it, on() and off() do nothing', /function enabled\(\) \{ return true; \}/.test(au) && /function on\(\) \{\}/.test(au) && /function off\(\) \{\}/.test(au) && !/\[\?&\]apx=/.test(au));
    const words = /\(preview\)|preview, our team|only our team|Only our team|Today\\'s page|today\\'s MAC page\.|data-apx-view|data-apx-macback/;
    check('S no "preview", "our team", "Today\'s page" or way back to the earlier pages in the three Autopilots and the bridge', [au, br0, mac, cof].every(t => !words.test(t)), [au, br0, mac, cof].map(t => (t.match(words) || [''])[0]));
    check('S the Interdependence tab is not sent to the PASA any more', !/_apxOn/.test(sup) && /if \(tabId === 'coffe' \|\| tabId === 'cockpit'\) \{ switchTab\('pasa'\); return; \}/.test(sup));
    check('S the menu: "Interdependence, MAC and CoFFE" right after the PASA Autopilot; the page is named for the three', /id="snav-apx" onclick="switchTab\('interdep'\)"/.test(idx) && idx.indexOf('id="snav-pasa"') < idx.indexOf('id="snav-apx"') && /<h3>Interdependence, MAC and CoFFE Autopilots<\/h3>/.test(idx));
    check('S pins: apx_autopilots 1.8, apx_mac 1.4, apx_coffe 1.8, apx_bridge 1.9, pasa_autopilot 2.7, support_modules 66.66, comment_kinds 1.2', ['apx_autopilots.js?v=1.8"', 'apx_mac.js?v=1.4"', 'apx_coffe.js?v=1.8"', 'apx_bridge.js?v=1.9"', 'pasa_autopilot.js?v=2.7"', 'support_modules.js?v=66.66"', 'comment_kinds.js?v=1.2"'].every(x => idx.indexOf(x) > 0));

    let pw = null; try { pw = require('playwright'); } catch (_) {}
    if (!pw) { console.log('  SKIP  Playwright is not installed: the browser part did not run'); return done(); }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.step': 'application/octet-stream' };
    const srv = http.createServer((q, r) => {
        let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
        const f = path.join(SITE, path.normalize(p)); let b;
        try { if (fs.statSync(f).isDirectory()) throw 0; b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
        const base = path.basename(f); if (MUT && /\.js$/.test(base)) b = Buffer.from(mutate(base, b.toString('utf8')));
        r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(b);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const brw = await pw.chromium.launch(), errs = [], tick = ms => new Promise(r => setTimeout(r, ms));
    try {
        const cx = await brw.newContext({ viewport: { width: 1500, height: 1000 } });
        // a computer that used the team preview: the stored switch is still there
        await cx.addInitScript(() => { try { if (!sessionStorage.getItem('afe.seed')) { sessionStorage.setItem('afe.seed', '1'); localStorage.setItem('sl_apx', '1'); } } catch (_) {} });
        const pg = await cx.newPage();
        pg.on('pageerror', e => errs.push(String(e).slice(0, 300))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html?apx=0'); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(() => window.loadHL1Demo()); await tick(9000);

        // ---- A: the pages ---------------------------------------------------------------------------------------------------
        const A = await pg.evaluate(async () => {
            const wait = ms => new Promise(r => setTimeout(r, ms)), vis = id => { const v = document.getElementById(id); return !!v && v.offsetParent !== null; }, X = window.SLApxAuto, o = {};
            o.on = X.enabled(); o.stored = localStorage.getItem('sl_apx');
            document.getElementById('snav-apx').click(); await wait(900);
            const h = document.getElementById('interdep-host');
            o.idp = { shown: vis('view-interdep') && !!h.querySelector('.apx'), head: (document.querySelector('#view-interdep h3') || {}).textContent, back: document.querySelectorAll('[data-apx-view],[data-apx-back],[data-apx-macback]').length, words: /Today's page|our team|\(preview\)/i.test(h.innerText) };
            switchTab('mac'); await wait(900); o.mac = { ap: X._ui.ap, auto: vis('view-interdep'), old: vis('view-mac') };
            switchTab('coffe'); await wait(900); o.cof = { ap: X._ui.ap, auto: vis('view-interdep'), pasa: vis('view-pasa') };
            return o;
        });
        check('A the stored switch from the preview is cleared, and ?apx=0 does not turn the Autopilots off', A.on === true && A.stored === null, A);
        check('A the menu entry opens the Interdependence Autopilot, named for the three, with no switch back and no preview words', A.idp.shown && A.idp.head === 'Interdependence, MAC and CoFFE Autopilots' && A.idp.back === 0 && !A.idp.words, A.idp);
        check('A the MAC tab opens the MAC Autopilot; the earlier MAC page never shows', A.mac.ap === 'mac' && A.mac.auto && !A.mac.old, A.mac);
        check('A the CoFFE tab opens the CoFFE Autopilot', A.cof.ap === 'cof' && A.cof.auto && !A.cof.pasa, A.cof);

        // ---- P: the PASA ------------------------------------------------------------------------------------------------------
        const P = await pg.evaluate(async () => {
            const wait = ms => new Promise(r => setTimeout(r, ms)), vis = id => { const v = document.getElementById(id); return !!v && v.offsetParent !== null; };
            const PA = window.SLPasaAuto, U = PA.ui, R = SLCcaReport.get('pasa'), o = {};
            switchTab('pasa'); await wait(1500);
            o.entry = Array.from(document.querySelectorAll('#view-pasa [data-apx-entry] b')).map(b => b.textContent);
            U.pick('pasa.coffe', 'yes'); await wait(200);
            const gr = PA.groupOf('FC-01'), fn = gr.gov.subId;
            R.setTab('aircraft::fn:' + fn); await wait(600); R.render(); await wait(300);
            const host = document.getElementById('ccr-host-pasa');
            o.idpPtr = !!host.querySelector('[data-paq="fc.FC-01.idp"] [data-paq-idpapx]');
            o.idpTable = !!host.querySelector('[data-paq-idp="FC-01"]');
            o.cofPtr = !!host.querySelector('[data-paq="fc.FC-01.coffe"] [data-paq-cofapx]');
            o.cofQs = host.querySelectorAll('[data-paq^="fc.FC-01.coffe."]').length;
            o.left = PA.fcLeft(gr).filter(t => /feed FC-01|CoFFE/.test(t));
            const ctx = { C: SLCcaReport.palette(), dark: false, forExport: false, key: 'pasa' };
            const heads = s => s.filter(b => b.k === 'h' && b.level === 3).map(b => b.text);
            const yes = PA.section(gr, ctx); o.yesHeads = heads(yes); o.yesCofT = yes.filter(b => b.k === 'table' && /^apx-q4[678]-FC-01$/.test(b.name)).length;
            o.yesAsmpCof = yes.filter(b => b.k === 'table' && /^apx-asmp-/.test(b.name)).reduce((n, t) => n + t.rows.filter(r => r.From === 'CoFFE Autopilot').length, 0);
            U.pick('pasa.coffe', 'no'); await wait(300);
            const no = PA.section(gr, ctx); o.noHeads = heads(no); o.noCofT = no.filter(b => b.k === 'table' && /^apx-q4[3-8]-/.test(b.name)).length;
            o.noAsmpCof = no.filter(b => b.k === 'table' && /^apx-asmp-/.test(b.name)).reduce((n, t) => n + t.rows.filter(r => r.From === 'CoFFE Autopilot').length, 0);
            U.pick('pasa.coffe', 'yes'); await wait(200); R.render(); await wait(300);
            // the pointer opens the Autopilot at that failure condition
            const btn = host.querySelector('[data-paq="fc.FC-01.idp"] button'); if (btn) btn.click(); await wait(900);
            o.opened = { auto: vis('view-interdep'), ap: SLApxAuto._ui.ap, fc: String(SLApxAuto._ui.fc), want: String(gr.gov.internalId) };
            return o;
        });
        check('P the PASA offers the three Autopilots, with no "preview" or "our team" words', P.entry.length === 1 && P.entry[0] === 'The Autopilots that feed this report:', P.entry);
        check('P the interdependence question is a pointer to the Interdependence Autopilot; the PASA has no table of its own to answer', P.idpPtr && !P.idpTable, P);
        check('P the CoFFE cases are a pointer to the CoFFE Autopilot; the PASA asks no case of its own', P.cofPtr && P.cofQs === 0, P);
        check('P the pointer opens the Interdependence Autopilot at that failure condition', P.opened.auto && P.opened.ap === 'idp' && P.opened.fc === P.opened.want, P.opened);
        check('P with the PASA\'s CoFFE answer "yes" the appendix carries what the CoFFE Autopilot sent, before the tree', P.yesHeads.indexOf('Combined functional failure effects (CoFFE)') >= 0 && P.yesCofT >= 2 && P.yesHeads.indexOf('Combined functional failure effects (CoFFE)') < P.yesHeads.indexOf('The fault tree'), [P.yesHeads, P.yesCofT]);
        check('P with "no" there is no CoFFE section, no CoFFE table and no CoFFE assumption', P.noHeads.indexOf('Combined functional failure effects (CoFFE)') < 0 && P.noCofT === 0 && P.noAsmpCof === 0 && P.yesAsmpCof >= 0, [P.noHeads, P.noCofT, P.noAsmpCof]);

        // ---- K: kept until the project changes -----------------------------------------------------------------------------
        const K = await pg.evaluate(async () => {
            const wait = ms => new Promise(r => setTimeout(r, ms)), B = window.SLApxBridge, PA = window.SLPasaAuto, o = {};
            if (typeof scheduleAutosave === 'function') scheduleAutosave(); await wait(400);   // what the earlier steps drew has settled
            const gr = PA.groupOf('FC-01'); B.pasa(gr); const a1 = B.pasa(gr), a2 = B.pasa(gr); o.same = a1 === a2 && !!a1;
            PA.ui.pick('pasa.scope', 'all'); await wait(300); o.afterPasa = B.pasa(gr) === a1;
            // a system the Interdependence Autopilot sent for FC-01, renamed in the architecture
            const txt = JSON.stringify(a1.idp || []); const sy = systemsData.find(s => s && s.name && txt.indexOf(s.name) >= 0); o.sys = sy ? sy.name : null;
            if (sy) { sy.name = sy.name + ' (renamed)'; if (typeof scheduleAutosave === 'function') scheduleAutosave(); await wait(300); const a3 = B.pasa(gr); o.renewed = a3 !== a1 && JSON.stringify(a3.idp || []).indexOf(sy.name) >= 0; sy.name = sy.name.replace(' (renamed)', ''); if (typeof scheduleAutosave === 'function') scheduleAutosave(); }
            return o;
        });
        check('K what the PASA shows for a failure condition is kept: asked twice, the same; after a PASA-only answer, the same', K.same && K.afterPasa, K);
        check('K after a change to the project (a system renamed) it is worked out again and shows the new name', !!K.sys && K.renewed === true, K);

        // ---- C: a MAC rule's comment --------------------------------------------------------------------------------------
        const C = await pg.evaluate(async () => {
            const wait = ms => new Promise(r => setTimeout(r, ms)), vis = id => { const v = document.getElementById(id); return !!v && v.offsetParent !== null; };
            const apxRules = (projectConfig.macModels || []).filter(r => r && r.apx), rule = apxRules[apxRules.length - 1] || projectConfig.macModels[0], fc = _macFcForRule(rule);   // a later failure condition, not the one the page opens on by itself
            switchTab('dashboard'); await wait(300); SLApxAuto._ui.fc = null;
            SLCommentKinds.jump({ kind: 'mac', id: String(rule.id) }); await wait(1200);
            return { auto: vis('view-interdep'), ap: SLApxAuto._ui.ap, fc: String(SLApxAuto._ui.fc), want: String(fc && fc.internalId), btn: !!document.querySelector('#interdep-host [data-comment-target="mac:' + rule.id + '"]') };
        });
        check('C a comment on a MAC rule opens the MAC Autopilot at the rule\'s failure condition, where the rule\'s comment button is', C.auto && C.ap === 'mac' && C.fc === C.want && C.btn, C);
        check('Z no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
        await cx.close();
    } catch (e) { check('the browser part ran to the end', false, e && e.stack ? e.stack : String(e)); }
    await brw.close(); srv.close();
    done();
})();
function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  [mutation: ' + MUT + ']' : '')); process.exit(fail ? 1 : 0); }
