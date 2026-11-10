/* regression_pssa_autopilot_20261110.test.js: the PSSA Autopilot v2.0. One Preliminary System Safety Assessment per system:
 * the front of the report for the system and one appendix per function, holding every failure condition of that function rated
 * Minor or above.
 *
 * v2.0 (Waqas, 10 Nov 2026, after v1): "same for PSSA, function not failure condtion, each appendix containing all its applicable
 * failure conditions" (no picking); the 1309 chart decides quantitative or qualitative, Minor is qualitative; "requirements can
 * be driven at multiple levels": systems and/or items here, per system with an override per function; ticked items, AutoReq's
 * item rows are taken, each traced to its system row; the front drawn on its own, fast.
 *
 * Waqas, 10 Nov 2026: "the PSSA one per system level cover page meat in the per failure condition report"; "the PSSA page is
 * already pretty trimmed down to be fair" (the Autopilot goes into the system's PSSA tab). Each appendix: what is evaluated,
 * the system FHA entry, what the aircraft hands down ("if two aircraft failure conditions set a budget, the stricter applies,
 * worked out"), no interdependence, no common resources, no CoFFE; the tree down to items (the system tree from the tool's
 * own renderer, chrome stripped), what it says, the numbers, item assurance levels, hidden failures and their checks
 * (candidate maintenance requirements), independence claims handed to the CMA Autopilot, the AutoReq requirements, the path
 * to compliance, the conclusion. Questions: whether to claim independence to set item assurance levels lower; check
 * intervals for hidden failures; the requirement level (the PASA's, which one system may override). No architecture or
 * budget-split questions.
 *
 * On the Aeolus HL-1 demo (the Electrical Power System, FC-EPS01), in the real app, with the production CSP:
 *   [S]  pins and headers (pssa_autopilot 2.0 after pasa_autopilot; fc_auto_trees 1.9 with shares()); the PSSA tab is named PSSA
 *   [A]  appendices: every function with a failure condition rated Minor or above, all its failure conditions in it; the
 *        Minor one (FC-EPS02) qualitative, with no tree; the register says the appendix and how
 *   [L]  levels: the PASA's systems tick shows, the system ticks systems and items, a function overrides; item rows taken from
 *        AutoReq only when items are ticked, each traced to the system row of its type once in the register
 *   [V]  speed: the front drawn on its own (the appendices listed), fast
 *   [H]  what the aircraft hands down: FC-26 and FC-05 (through G-7151, a transfer to the electrical tree) both set a budget,
 *        the stricter (1.7 x 10^-10 per flight hour) applies, worked out; a system tree reached by a transfer counts
 *   [O]  section order; no interdependence, common resources or CoFFE part; no mitigations part
 *   [Q]  the questions: independence for item levels, whether each input shows itself and how often a hidden one is checked,
 *        the level per type (the PASA's, overridable); nothing about architecture or budget splits
 *   [D]  "No" to independence reallocates that tree: every item at the function's level; "Yes" gives the tool's levels back
 *   [C]  a check interval writes the tree's own event (periodic, tau) and AutoReq then has a check requirement for it
 *   [T]  the real tree picture: the tool's shapes, IDs, P and rate lines and DAL badges; no chrome; numbered caption
 *   [R]  requirements with rationale and driven from; the path to compliance one row per requirement
 *   [W]  Word: the system's front, then the appendices
 *   [K]  dark mode contrast; no page errors
 * MUTATION PROOFS: SL_PSSA_MUTATE=loose | notransfer | interdep | noindep | nocheck | redraw | pathhand | word | dark | archq |
 * onefn | major | noqual | itemlvl | noparent | slow. Each one turns this red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_pssa_autopilot_20261110.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 900) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_PSSA_MUTATE || '';
const MUTS = {
    loose:      ['pssa_autopilot.js', "function applies(gr) { var h = handedDown(gr); return h.length ? h.reduce(function (m, x) { return x.rate < m.rate ? x : m; }, h[0]) : null; }", "function applies(gr) { var h = handedDown(gr); return h.length ? h.reduce(function (m, x) { return x.rate > m.rate ? x : m; }, h[0]) : null; }"],
    notransfer: ['fc_auto_trees.js', "            if (n.type === 'gate') return String(n.transferOutTo || (n.gateType === 'TRANSFER' ? n.linkedPageId : '') || '') === String(page.id);", "            if (n.type === 'gate') return false;"],
    interdep:   ['pssa_autopilot.js', "        b.push(H(3, 'The fault tree'));", "        b.push(H(3, 'How the systems feed ' + f)); b.push(P('From the interdependence table.'));\n        b.push(H(3, 'The fault tree'));"],
    noindep:    ['pssa_autopilot.js', "        reallocate(page, L().target(gr.gov.severity).dal);", "        void 0;"],
    nocheck:    ['pssa_autopilot.js', "        leaves(page).forEach(function (n) { if (lidOf(n) === lid) { n.repairModel = 'periodic'; n.tau = tau; } });", "        void 0;"],
    redraw:     ['pssa_autopilot.js', "var res = safe(function () { return K.figure(page.id + ':' + page.root.id,", "var res = { parts: [{ svg: '<svg width=\"10\" height=\"10\"></svg>', w: 10, h: 10, letter: 'A' }] }; void safe(function () { return K.figure(page.id + ':' + page.root.id,"],
    pathhand:   ['pssa_autopilot.js', "title: 'How each requirement for ' + f + ' will be closed', rows: reqEntries(rq).map(", "title: 'How each requirement for ' + f + ' will be closed', rows: reqEntries(rq).slice(0, 1).map("],
    word:       ['cca_report.js', "            rs.forEach(function (x, i) { b.push(H(1, x.title, { appx: appxLetter(i),", "            (fx ? [] : rs).forEach(function (x, i) { b.push(H(1, x.title, { appx: appxLetter(i),"],
    dark:       ['pasa_autopilot.js', ".paq-x{font-size:13px;line-height:1.45;margin:0 0 8px;color:var(--color-text-primary,#101216)}", ".paq-x{font-size:13px;line-height:1.45;margin:0 0 8px;color:#3a3d44}"],
    archq:      ['pssa_autopilot.js', "        leaves(page).forEach(function (n) {\n            var k = lidOf(n),", "        h += card('fc.' + f + '.split', Q({ id: 'fc.' + f + '.split', text: 'How should the budget be split between the channels?', options: [{ id: 'eq', label: 'Equally' }] }), false);\n        leaves(page).forEach(function (n) {\n            var k = lidOf(n),"],
    onefn:      ['pssa_autopilot.js', "        c.forEach(function (gr) { var k = fnKey(sy, gr); if (keys.indexOf(k) < 0) keys.push(k); });\n        return keys;", "        c.forEach(function (gr) { var k = fnKey(sy, gr); if (keys.indexOf(k) < 0) keys.push(k); });\n        return keys.slice(0, 0);"],
    major:      ['pssa_autopilot.js', "return gr && gr.fcId && l.rank(gr.gov.severity) >= l.SEV_RANK.Minor; }); }", "return gr && gr.fcId && l.rank(gr.gov.severity) >= l.SEV_RANK.Major; }); }"],
    noqual:     ['pssa_autopilot.js', "        var l = L(); if (l.rank(gr.gov.severity) < l.SEV_RANK.Major) return 'qual';", "        var l = L();"],
    itemlvl:    ['pssa_autopilot.js', "on: !lv.length || lv.indexOf(it ? 'item' : 'system') >= 0 };", "on: true };"],
    noparent:   ['pssa_autopilot.js', "if (c && p) c.parentReqId = S(p.internalId);", "void p;"],
    slow:       ['cca_report.js', "var blR = spec.appendices ? repDoc({ dark: dark, secs: secs, frontOnly: true })", "var blR = spec.appendices ? repDoc({ dark: dark, secs: secs, frontOnly: false })"]
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) { let s = fs.readFileSync(path.join(SITE, name), 'utf8'); const m = MUTS[MUT]; if (m && m[0] === name) { if (s.indexOf(m[1]) < 0) throw new Error('mutation site missing: ' + m[1]); s = s.replace(m[1], m[2]); } return s; }
const EM = String.fromCharCode(0x2014);
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
const lum = rgb => { const c = rgb.map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

(async function main() {
    console.log('\n[S] pins and headers');
    const HTML = src('index.html'), at = f => HTML.indexOf('src="' + f + '?v=');
    check('S1 pssa_autopilot.js 2.1 pinned after pasa_autopilot.js; header the same; fc_auto_trees.js 2.0 exports shares()', /pssa_autopilot\.js\?v=2\.1"/.test(HTML) && at('pssa_autopilot.js') > at('pasa_autopilot.js') && /SLPssaAuto v2\.1/.test(src('pssa_autopilot.js').slice(0, 200)) && /shares: shares/.test(src('fc_auto_trees.js')));
    check('S2 the system PSSA tab is named PSSA and holds the Autopilot (the old tiles hidden); no em dashes', /id="ws-pssa-tab-overview"[^>]*>PSSA</.test(HTML) && /<div id="ws-pssa-host" style="display:none">/.test(HTML) && ['pssa_autopilot.js', 'ssa_autopilot.js', 'asa_autopilot.js'].every(f => src(f).indexOf(EM) < 0) && fs.readFileSync(__filename, 'utf8').indexOf(EM) < 0);

    let pw = null; try { pw = require('playwright'); } catch (_) {}
    if (!pw) { console.log('  SKIP  Playwright is not installed here: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();   // eslint-disable-line no-eval
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.step': 'application/step' };
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
        let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
        const name = path.relative(SITE, f); if (MUTS[MUT] && MUTS[MUT][0] === name) b = Buffer.from(src(name));
        r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(b); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const browser = await pw.chromium.launch();
    const errs = [];
    try {
        const pg = await (await browser.newContext({ viewport: { width: 1900, height: 1200 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 300))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.addInitScript(() => { window.SL_VERIFY_SYNC_OFF = true; });
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(() => window.loadHL1Demo()); await tick(9000);
        await pg.evaluate(() => { openSystemWorkspace('sys-eps'); }); await tick(1200);
        await pg.evaluate(() => switchWorkspaceTab('pssa')); await tick(1500);

        const r = await within(pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const A = window.SLPssaAuto, U = A.ui, R = SLCcaReport.get('pssa'), RT = SLReqTrace, out = {};
            const host = () => document.getElementById('ccr-host-pssa');
            out.mounted = !!host() && A.sysNow() && A.sysNow().id === 'sys-eps';
            const qTitles = () => Array.from(host().querySelectorAll('[data-ccleft] .slap-q')).map(e => e.textContent.trim());
            let t0 = performance.now(); R.render(); out.msFront = performance.now() - t0;
            out.frontText = host().querySelector('[data-ccdoc]').innerText;
            out.frontQs = qTitles();
            out.addFc = host().querySelectorAll('[data-psq-addfc]').length;
            U.pick('pssa.scope', 'all'); U.pick('pssa.desc', 'project'); U.pick('pssa.method', 'std');
            const sy = A.sysNow(), gr = A.groupOf(sy, 'FC-EPS01');
            // ---- [A] appendices ------------------------------------------------------------------------------------------
            out.apps = A.appendices(sy); out.fn = A.fnKey(sy, gr);
            out.fnFcs = A.fnGroups(sy, out.fn).map(g => g.fcId + ':' + g.gov.severity + ':' + A.routeOf(g));
            out.register = (R.doc({ report: 'sys:sys-eps' }).find(b => b.k === 'table' && b.name === 'register') || {}).rows || [];
            // ---- [L] levels -----------------------------------------------------------------------------------------------
            RT.setLevels('prob', ['aircraft', 'system'], 'types'); RT.setLevels('dal', ['aircraft'], 'types');
            out.fromPasa = JSON.stringify(RT.pssaLevels('prob', 'sys-eps', null).levels) === '["system"]' && RT.pssaLevels('prob', 'sys-eps', null).from === 'pasa';
            const ctxL = { C: SLCcaReport.palette(), dark: false, forExport: false, key: 'pssa' };
            out.itemsOffBefore = A.reqsFor(sy, gr).filter(x => x.type === 'prob' && x.at === 'item').every(x => !x.on);
            U.level('prob', 'item');
            out.lvl = JSON.stringify(RT.pssaLevels('prob', 'sys-eps', null).levels) === '["system","item"]' && JSON.stringify(RT.pssaLevels('prob', 'sys-fcs', null).levels) === '["system"]';
            U.level('dal', 'item', out.fn); U.level('dal', 'system', out.fn);
            out.fnOverride = JSON.stringify(RT.pssaLevels('dal', 'sys-eps', out.fn).levels) === '["system","item"]' && RT.pssaLevels('dal', 'sys-eps', out.fn).from === 'function';
            U.levelReset('dal', out.fn); U.level('dal', 'system'); out.fnReset = RT.pssaLevels('dal', 'sys-eps', out.fn).from === 'system';
            out.itemsOn = A.reqsFor(sy, gr).filter(x => x.type === 'prob' && x.at === 'item').length >= 2 && A.reqsFor(sy, gr).filter(x => x.type === 'prob' && x.at === 'item').every(x => x.on && x.parent && x.parent.at === 'system');
            out.dalItemsOff = A.reqsFor(sy, gr).filter(x => x.type === 'dal' && x.at === 'item').every(x => !x.on);
            R.setTab('sys:sys-eps::fn:' + out.fn); await wait(800);
            t0 = performance.now(); R.render(); out.msFn = performance.now() - t0;
            out.fcQs = qTitles();
            out.hand = A.handedDown(gr).map(x => ({ from: x.from, rate: x.rate }));
            out.applies = A.applies(gr); out.treeTarget = SLFcTrees.treeFor(gr).targetP;
            const ctx = { C: SLCcaReport.palette(), dark: false, forExport: false, key: 'pssa' };
            const sec = A.section(sy, gr, ctx);
            out.heads = sec.filter(b => b.k === 'h' && b.level === 3).map(b => b.text); out.h2 = sec.filter(b => b.k === 'h' && b.level === 2).map(b => b.text);
            const g2 = A.groupOf(sy, 'FC-EPS02'); out.minorHeads = A.section(sy, g2, ctx).filter(b => b.k === 'h').map(b => b.text); out.minorFig = A.section(sy, g2, ctx).some(b => b.k === 'fig');
            out.fnHeads = A.fnSection(sy, out.fn, ctx).filter(b => b.k === 'h' && b.level === 2).map(b => b.text);
            const hand = sec.find(b => b.k === 'table' && b.name === 'hand-FC-EPS01'); out.handRows = hand ? hand.rows : [];
            // independence for item levels
            const page = SLFcTrees.treeFor(gr), lv = () => { const m = {}; (function w(n) { if (!n) return; if (n.displayId) m[n.displayId] = n.allocatedDAL; (n.children || []).forEach(w); })(page.root); return m; };
            out.dalBefore = lv();
            U.pick('fc.FC-EPS01.dal', 'no'); await wait(200); out.dalNo = lv();
            U.pick('fc.FC-EPS01.dal', 'yes'); await wait(200); out.dalYes = lv();
            // a hidden failure and its check
            const bat = (function f(n) { if (!n) return null; if (n.displayId === 'BE-7100') return n; for (const k of (n.children || [])) { const x = f(k); if (x) return x; } return null; })(page.root);
            const lid = String(bat.logicalId != null ? bat.logicalId : bat.id);
            U.pick('fc.FC-EPS01.hid.' + lid, 'hidden'); await wait(200);
            const inp = document.getElementById('psq-tau-FC-EPS01-' + lid); if (inp) inp.value = '600';
            U.check('FC-EPS01', lid, 'hours'); await wait(300);
            out.tau = { rm: bat.repairModel, tau: bat.tau };
            const AR = SLEnv.get('AutoReq'), mg = AR.generate(undefined, 'sys-sys-eps');
            out.intervalReq = mg.isNew.concat(mg.isUpdated.map(u => u.next)).concat(mg.unchanged.map(u => u.next)).some(c => /fta-interval/.test(c.reqSource.generator) && /600/.test(c.text + c.rat));
            const sec2 = A.section(sy, gr, ctx);
            const hidT = sec2.find(b => b.k === 'table' && b.name === 'hid-FC-EPS01'); out.hidRows = hidT ? hidT.rows : [];
            // the rest of the questions answered: nothing left; the AI may draft
            Array.from(host().querySelectorAll('[data-paq^="fc.FC-EPS01.hid."]')).forEach(() => {});
            (function walk(n) { if (!n) return; if (n.type !== 'gate') { const k = String(n.logicalId != null ? n.logicalId : n.id); if (k !== lid) U.pick('fc.FC-EPS01.hid.' + k, 'evident'); } (n.children || []).forEach(walk); })(page.root);
            await wait(200);
            out.left = A.fcLeft(sy, gr); out.aiPart = R.spec.aiReady('fn:' + out.fn);
            const g3 = A.groupOf(sy, 'FC-EPS03'), p3 = SLFcTrees.treeFor(g3);
            out.eps03 = { built: A.built(g3), left: A.fcLeft(sy, g3).length, open: A.openItems(sy, g3), text: A.section(sy, g3, ctx).filter(b => b.k === 'p').map(b => b.text).join(' ') };
            if (p3) { U.pick('fc.FC-EPS03.dal', 'yes'); (function walk(n) { if (!n) return; if (n.type !== 'gate') U.pick('fc.FC-EPS03.hid.' + String(n.logicalId != null ? n.logicalId : n.id), 'evident'); (n.children || []).forEach(walk); })(p3.root); }
            out.ai = R.spec.aiReady('fn:' + out.fn);
            // the picture, requirements, path
            R.render(); await wait(400);
            const pv = host().querySelector('[data-ccdoc]');
            out.svg = Array.from(pv.querySelectorAll('.ccr-fig svg')).map(s => s.outerHTML).join('');
            out.caps = Array.from(pv.querySelectorAll('.ccr-fig + .ccr-cap')).map(e => e.textContent);
            out.shape = getShapePath({ data: page.root });
            const rq = sec2.find(b => b.k === 'table' && b.name === 'req-FC-EPS01'), pth = sec2.find(b => b.k === 'table' && b.name === 'path-FC-EPS01');
            out.reqRows = rq ? rq.rows : []; out.pathRows = pth ? pth.rows : [];
            // into the register: the item rows traced to their system row
            U.acceptReqs(out.fn); await wait(300);
            const after = A.reqsFor(sy, gr).filter(x => x.on);
            out.accepted = after.map(x => ({ at: x.at, type: x.type, state: x.state, id: x.r.id, lvl: x.r.level, parent: x.r.parentReqId, pIid: x.parent ? String(x.parent.r.internalId) : null }));
            out.reqRowsAfter = ((A.section(sy, gr, ctx).find(b => b.k === 'table' && b.name === 'req-FC-EPS01')) || {}).rows || [];
            // Word
            R.setTab('sys:sys-eps'); await wait(300);
            const m = R.model({ report: 'sys:sys-eps' });
            out.wordHeads = m.blocks.filter(b => b.k === 'h').map(b => b.text); out.wordImgs = m.blocks.filter(b => b.k === 'img').length;
            out.docNo = R.docCtl ? null : null;
            return out;
        }), 150000, 'the PSSA run');

        console.log('\n[H] what the aircraft hands down');
        const rates = r.hand.map(x => x.rate);
        check('H1 FC-26 sets a budget, and FC-05 through G-7151 (a transfer to the electrical tree) sets another', r.hand.some(x => /FC-26/.test(x.from)) && r.hand.some(x => /G-7151/.test(x.from)), JSON.stringify(r.hand));
        // 11 Nov 2026 (fc_auto_trees.js v2.0): each aircraft tree's OWN share is listed (never a stored value), and the one that
        // applies is the strictest of them: the very number the tree's target is set to
        check('H2 the stricter applies, worked out: the smallest of the budgets listed, and it is the tree\'s own target (2.5 x 10^-10 per flight hour here)', r.applies && Math.abs(r.applies.rate - Math.min.apply(null, rates)) < 1e-24 && Math.abs(r.applies.rate - r.treeTarget) / r.treeTarget < 1e-6 && Math.abs(r.applies.rate - 2.5e-10) / 2.5e-10 < 0.01, JSON.stringify(r.applies) + ' target ' + r.treeTarget);
        check('H3 the report table lists each budget and the one that applies', r.handRows.length >= 3 && r.handRows[r.handRows.length - 1].From === 'Applies (the stricter)' && /2\.5 × 10/.test(r.handRows[r.handRows.length - 1].Budget), JSON.stringify(r.handRows));

        console.log('\n[A] the appendices');
        check('A1 one appendix per function with a failure condition rated Minor or above; FC-EPS01, 02 and 03 all in SF-20; no picking', JSON.stringify(r.apps) === '["SF-20"]' && r.fn === 'SF-20' && ['FC-EPS01:Catastrophic', 'FC-EPS02:Minor:qual', 'FC-EPS03:Hazardous'].every(x => r.fnFcs.some(y => y.indexOf(x) === 0)) && r.addFc === 0 && r.frontQs.indexOf('Which failure conditions get an appendix?') < 0, JSON.stringify(r.apps) + JSON.stringify(r.fnFcs));
        check('A2 the register gives the appendix, the function and how each is assessed', r.register.some(x => /^FC-EPS02/.test(x['Failure condition']) && x['Assessed in'] === 'Appendix A, qualitative') && r.register.some(x => /^FC-EPS01/.test(x['Failure condition']) && /^Appendix A, quantitative/.test(x['Assessed in'])) && r.register.every(x => /^SF-20/.test(x.Function)), JSON.stringify(r.register));
        check('A3 the Minor failure condition is qualitative: no tree, no numbers, no item levels', r.minorHeads.some(h => /FC-EPS02 .*\(qualitative\)$/.test(h)) && r.minorHeads.indexOf('The qualitative assessment') >= 0 && !r.minorHeads.some(h => /^(The fault tree|The numbers|Items and their assurance levels)$/.test(h)) && !r.minorFig, JSON.stringify(r.minorHeads));
        check('A4 the appendix starts with the function, then each failure condition with how it is assessed', r.fnHeads[0] === 'The function' && r.h2[0] === 'FC-EPS01 Loss of all generated electrical power (quantitative)', JSON.stringify(r.fnHeads));

        console.log('\n[L] levels');
        check('L1 the PASA\'s systems tick shows for the system; the system ticks systems and items together, another system keeps the PASA\'s', r.fromPasa && r.lvl);
        check('L2 a function overrides the system\'s levels and goes back to them when reset', r.fnOverride && r.fnReset);
        check('L3 item rows are taken only when items are ticked; each is traced to the system row of its type', r.itemsOffBefore && r.itemsOn && r.dalItemsOff);
        check('L4 into the register: the system row at L2, the item rows at L3 with parentReqId set to the system row', r.accepted.length >= 3 && r.accepted.every(x => x.state === 'in' && x.id) && r.accepted.every(x => x.at === 'item' || x.lvl === 'L2') && r.accepted.filter(x => x.at === 'item').length >= 2 && r.accepted.filter(x => x.at === 'item').every(x => x.lvl === 'L3' && (x.pIid == null || x.parent === x.pIid)) && r.accepted.filter(x => x.at === 'item' && x.type === 'prob').every(x => x.parent && x.parent === x.pIid), JSON.stringify(r.accepted.filter(x => !(x.state === 'in' && x.id && (x.at === 'item' ? x.lvl === 'L3' && (x.pIid == null || x.parent === x.pIid) : x.lvl === 'L2'))).slice(0, 4)));
        check('L5 the appendix lists each item row under its system row', r.reqRowsAfter.some(x => x['Written at'] === 'Item' && /^↳ REQ-/.test(x.ID)) && r.reqRowsAfter.some(x => x['Written at'] === 'System'), JSON.stringify(r.reqRowsAfter.map(x => x.ID + ' ' + x['Written at']).slice(0, 8)));

        console.log('\n[V] speed');
        check('V1 the front drawn on its own (the appendices listed, not drawn), under 1.5 s; an appendix under 1.5 s', /Appendices/.test(r.frontText) && !/A\.1 The function/.test(r.frontText) && r.msFront < 1500 && r.msFn < 1500, Math.round(r.msFront) + ' / ' + Math.round(r.msFn) + ' ms');

        console.log('\n[O] the order of an appendix');
        const H = r.heads.map(h => h.replace(/^[A-Z]+\.\d+\s+/, '')), ix = s => H.findIndex(h => h.indexOf(s) === 0);
        const order = ['What is being evaluated', 'The system FHA entry', 'What the aircraft hands down', 'The fault tree', 'What the tree says', 'The numbers', 'Items and their assurance levels', 'Hidden failures and their checks', 'Independence claims sent to the CMA', 'Requirements', 'Path to compliance'];
        check('O1 sections in order: evaluated, system FHA, handed down, the tree, what it says, numbers, items, hidden failures, CMA claims, requirements, path to compliance', order.every((s, i) => ix(s) >= 0 && (i === 0 || ix(s) > ix(order[i - 1]))), JSON.stringify(H));
        check('O2 no interdependence, common resources, CoFFE or mitigations part', !H.some(h => /How the systems feed|Resources the systems share|CoFFE|mitigation/i.test(h)));

        console.log('\n[Q] the questions');
        check('Q1 the front asks scope, the system, the method and where each type of requirement is written', ['What does this PSSA cover?', 'Is this the system the PSSA assesses?', 'Which method and numbers does the PSSA use?', 'Where is each type of requirement written in this system?'].every(q => r.frontQs.indexOf(q) >= 0), JSON.stringify(r.frontQs));
        check('Q2 an appendix asks independence for the item levels and, for each input, whether it shows itself; nothing about architecture or budget splits', r.fcQs.indexOf('Use independence to set the item assurance levels?') >= 0 && r.fcQs.some(q => /^Would BE-7100 .* show itself when it fails\?$/.test(q)) && !r.fcQs.some(q => /budget|split|architecture|protection/i.test(q)), JSON.stringify(r.fcQs));
        check('Q3 FC-EPS01 answered: nothing left for it; FC-EPS03\'s tree has not been created yet (its top only), so it asks nothing and says so', r.left.length === 0 && r.ai.ready && r.eps03.built === false && r.eps03.left === 0 && r.eps03.open.some(x => /has not been created yet/.test(x)) && /has not been created yet/.test(r.eps03.text), JSON.stringify(r.eps03));

        console.log('\n[D] item assurance levels');
        check('D1 the tool\'s levels to start with (G-7098 FDAL B, generators 2 to 4 IDAL C)', r.dalBefore['G-7098'] === 'B' && r.dalBefore['BE-7095'] === 'C', JSON.stringify(r.dalBefore));
        check('D2 "No" reallocates the tree with no independence claim: every item at A', Object.keys(r.dalNo).length > 0 && Object.values(r.dalNo).every(v => v === 'A'), JSON.stringify(r.dalNo));
        check('D3 "Yes" gives the tool\'s levels back', JSON.stringify(r.dalYes) === JSON.stringify(r.dalBefore), JSON.stringify(r.dalYes));

        console.log('\n[C] hidden failures and their checks');
        check('C1 a check every 600 hours writes the tree\'s own event (periodic, tau 600)', r.tau.rm === 'periodic' && Number(r.tau.tau) === 600, JSON.stringify(r.tau));
        check('C2 AutoReq then has the check requirement for it', r.intervalReq);
        check('C3 the report lists it as a candidate maintenance requirement', r.hidRows.some(x => /BE-7100/.test(x.Item) && /600/.test(x.Check) && /^Yes/.test(x['Candidate maintenance requirement'])), JSON.stringify(r.hidRows));

        console.log('\n[T] the real tree picture');
        check('T1 the tool\'s own rendering: its gate shape, the IDs, P and rate lines, DAL badges; no chrome', r.svg.indexOf(r.shape.slice(0, 40)) >= 0 && ['G-7101', 'G-7098', 'BE-7099', 'BE-7100'].every(id => r.svg.indexOf('>' + id + '<') >= 0) && /P \d\.\de-\d+/.test(r.svg) && /IDAL|FDAL/.test(r.svg) && !/foreignObject|fta-conn-handle|<select|<input/.test(r.svg));
        check('T2 numbered caption naming the failure condition', r.caps.length >= 1 && r.caps.some(c => /^Figure A\.\d+: FC-EPS01/.test(c)) && r.caps.every(c => /^Figure A\.\d+: FC-EPS0\d/.test(c)), JSON.stringify(r.caps));

        console.log('\n[R] requirements and the path to compliance');
        check('R1 requirements with their rationale and where each is driven from', r.reqRows.length >= 2 && r.reqRows.every(x => x.Rationale && x['Driven from']), JSON.stringify(r.reqRows.slice(0, 2)));
        check('R2 the path to compliance: one row per requirement, in the same order', r.pathRows.length === r.reqRows.length && r.pathRows.every((p, i) => p.Requirement.indexOf(r.reqRows[i].ID) === 0));

        console.log('\n[W] Word');
        check('W1 Word: the system\'s front, then Appendix A (the function) with its numbered parts and its tree pictures', r.wordHeads[0] === '1. Purpose and scope' && r.wordHeads.some(h => /^Appendix A: SF-20/.test(h)) && r.wordHeads.some(h => /^A\.1 The function/.test(h)) && r.wordHeads.some(h => /^A\.2\.1 What is being evaluated/.test(h)) && r.wordImgs >= 1, JSON.stringify(r.wordHeads.slice(0, 14)));

        console.log('\n[K] dark mode');
        const k = await within(pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            document.body.classList.add('theme-dark'); SLCcaReport.get('pssa').setTab('sys:sys-eps::fn:SF-20'); await wait(900);
            const h = document.getElementById('ccr-host-pssa'), rgb = s => (String(s).match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
            const bgOf = el => { while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return rgb(c); el = el.parentElement; } return [255, 255, 255]; };
            const pick = sel => Array.from(h.querySelectorAll(sel)).slice(0, 12).map(el => ({ fg: rgb(getComputedStyle(el).color), bg: bgOf(el) }));
            return { x: pick('[data-ccleft] .paq-x'), q: pick('[data-ccleft] .slap-q'), p: pick('[data-ccdoc] p') };
        }), 30000, 'dark mode');
        const worst = a => a.reduce((m, x) => Math.min(m, contrast(x.fg, x.bg)), 99);
        check('K1 dark mode: the questions and the report readable (contrast at least 4.5)', [k.x, k.q, k.p].every(a => a.length && worst(a) >= 4.5), [k.x, k.q, k.p].map(worst).map(v => v.toFixed(2)).join(' '));
        check('F1 the frame is mounted in the system\'s PSSA tab for the system on screen', r.mounted);
    } finally { await browser.close(); srv.close(); }
    check('Z no page errors', errs.length === 0, errs.join(' | '));
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
