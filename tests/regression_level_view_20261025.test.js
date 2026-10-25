#!/usr/bin/env node
/*
 * Regression (browser): CMA, R&M and human factors at the level you are working on. 25 Oct 2026.
 *
 * WAQAS (24 Oct 2026): "CMA and R&M need to be at the system level too, maybe HFs too"; "ZSA and PRAs remain at
 * aircraft level"; "for aircraft level it shows just aircraft level and says to view systems analysis with links
 * where appropriate". The plan he confirmed (25 Oct 2026), point by point:
 *   [P] 1. a system's plan offers CMA, R&M and HF, never ZSA or PRA
 *   [N]    a system has its own Common cause, R&M and Human factors sections, each link gated by its own plan
 *   [C] 2. the CMA page shows the rows of the level picked; a new entry joins that level (no scope picker)
 *   [M] 3. R&M: reliability prediction (with the aircraft roll-up), maintainability, MSG-3 systems and MMEL
 *   [F] 4. HF: task identification, task analysis, human error analysis, crew alerting, controls and displays
 *   [A] 5. an aircraft page shows aircraft rows only, with a "View <system> analysis" link per system
 *   [R] 6. a row already tied to one system belongs to it; every other row stays at aircraft level; a stamped
 *          row never moves; on every showcase each row is at exactly one level and nothing is lost
 *
 * MUTATION PROOFS: SL_LV_MUTATE=view (the CMA worksheet ignores the level), =stamp (a new row is never stamped),
 * =tie (an unstamped row never follows its links), =plan (a system's plan offers ZSA and PRA), =gate (a system's
 * CMA / R&M / HF links ignore its plan), =head (the aircraft line lists no systems), =white (the links' text color
 * left to the app's button rule: white on white). Each must turn checks red.
 *
 * Run: node tests/regression_level_view_20261025.test.js   (Playwright + Chromium; NODE_PATH as for the others)
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 700) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_LV_MUTATE || '';

function mutate(file, body) {
    if (MUT === 'view' && file === 'safety_lab.js') return body.replace("view: (row) => !(window.SLLevelView) || window.SLLevelView.shows('cma', row),", '');
    if (MUT === 'stamp' && file === 'level_view.js') return body.replace('if (!row || typeof row !== \'object\') return row;\n        try { if (_memo.map) _memo.map.delete(row); } catch (_) {}', 'return row;');
    if (MUT === 'tie' && file === 'level_view.js') return body.replace('var s = _tie(kind, row);', 'var s = null;');
    if (MUT === 'plan' && file === 'program_plan.js') return body.replace('const AIRCRAFT_ONLY = { zsa: true, pra: true };', 'const AIRCRAFT_ONLY = {};');
    if (MUT === 'gate' && file === 'nav_areas.js') return body.replace("var off = sysScope && (!_sysLaneOn(K.lane) || (K.sub && !_sysLaneOn(K.sub)));", 'var off = false;');
    if (MUT === 'names' && file === 'nav_areas.js') return body.replace("{ key: 'afha', label: 'AFHA',", "{ key: 'afha', label: 'Hazards (AFHA)',").replace("{ key: 'sys', label: 'SFHA',", "{ key: 'sys', label: 'System workspace',");
    if (MUT === 'fmea' && file === 'nav_areas.js') return body.replace("items: ['sl-nav-trees-ssa', 'sl-nav-ssa-fmea', 'sl-nav-ssa-report']", "items: ['sl-nav-trees-ssa', 'sl-nav-ssa-report']");
    if (MUT === 'bar' && file === 'misc_fn_modules.js') return body.replace("const old = document.getElementById('sys-breadcrumb-host'); if (old) old.remove();\n    return;", "const ws0 = document.getElementById('view-sys-workspace'); if (ws0 && !document.getElementById('sys-breadcrumb-host')) { const b0 = document.createElement('div'); b0.id = 'sys-breadcrumb-host'; b0.textContent = 'Working in'; ws0.insertBefore(b0, ws0.firstChild); } return;");
    if (MUT === 'white' && file === 'level_view.js') return body.replace('background-image:none;color:var(--color-text-primary);', 'background-image:none;');
    if (MUT === 'dots' && file === 'fc_auto_trees.js') return body.replace('try { syncFlags(); } catch (_) {}', '');
    if (MUT === 'gates' && file === 'critical_gates.js') return body.replace('var all = analyzeAll().filter(_inLevel);', 'var all = analyzeAll();');
    if (MUT === 'cloud' && file === 'save_state.js') return body.replace(", exportKind: EXPORT_KIND[name] || 'export' })", ' })');
    if (MUT === 'head' && file === 'level_view.js') return body.replace('var list = all.filter(function (s) { return s.rows > 0; });', 'var list = [];');
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);

(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    // ---------------------------------------------------------------- [W] the wiring, from the source
    console.log('\n[W] the wiring');
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const at = f => HTML.indexOf('src="' + f);
    check('[W] level_view.js loads once, before nav_areas.js', (HTML.match(/src="level_view\.js\?v=/g) || []).length === 1 && at('level_view.js') > 0 && at('level_view.js') < at('nav_areas.js'));
    const pin = (f, maj, min) => { const m = new RegExp(f.replace('.', '\\.') + '\\?v=(\\d+)\\.(\\d+)"').exec(HTML); return !!m && (+m[1] > maj || (+m[1] === maj && +m[2] >= min)); };
    check('[W] the pages that changed load their new versions (floors)', pin('nav_areas.js', 1, 2) && pin('program_plan.js', 2, 7) && pin('hf_analyses.js', 1, 20) && pin('ram_modules.js', 1, 11) && pin('msg3_module.js', 1, 8) && pin('mmel_module.js', 1, 6) && pin('ram_predict.js', 0, 7) && pin('support_modules.js', 66, 50) && pin('safety_lab.js', 65, 69) && pin('bindings_modules.js', 1, 60) && pin('data_ops_modules.js', 66, 60));
    if (!pw) { console.log('  note  Playwright is not installed on this machine: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }

    const demos = require('./lib/demo_projects_all.js').all();
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
    async function open(data) {
        const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        page.on('dialog', d => d.dismiss().catch(() => {}));
        await page.addInitScript(() => { try { localStorage.removeItem('sl-tree-home-v1'); } catch (_) {} window.SL_VERIFY_SYNC_OFF = true; window.SL_FC_TREES_OFF = true; });
        await page.goto(url);
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && window.SLNavAreas && window.SLLevelView && window.SLTreeHomes && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        await page.evaluate(async ({ data }) => {
            _applyProjectData(data); await new Promise(f => setTimeout(f, 1200));
            const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            PROGRAM_PLAN.CATALOGUE.forEach(l => { try { PROGRAM_PLAN.setLane(l.id, true); } catch (_) {} });
            try { if (window.SLCmaLive) window.SLCmaLive.onModelChange = function () {}; } catch (_) {}
            // R&M is a Pro+ capability: the level is what is under test here, not the tier
            window._ramHasAccess = () => true; try { window.getEffectiveTier = () => 'pro-plus'; } catch (_) {}
            switchTab('dashboard');
        }, { data });
        await new Promise(r => setTimeout(r, 500));
        return { page, errs };
    }
    try {
        // ---------------------------------------------------------------- [R] the rule on every showcase
        console.log('\n[R] every row at exactly one level, on every showcase');
        {
            const { page, errs } = await open(demos[0].data);
            for (const d of demos) {
                const r = await within(page.evaluate((data) => {
                    _applyProjectData(data);
                    const LV = SLLevelView, out = { bad: [], counts: {} };
                    Object.keys(LV.KINDS).forEach(k => {
                        const all = LV.KINDS[k].rows();
                        const lv = [null].concat(systemsData.map(s => String(s.id)));
                        const n = lv.reduce((a, v) => a + LV.rowsIn(k, v).length, 0);
                        if (n !== all.length) out.bad.push(k + ': ' + n + ' of ' + all.length);
                        // a CMA row stamped for a system is that system's
                        if (k === 'cma') all.forEach(rw => { if (rw.scope === 'system' && rw.owningSystemId && systemsData.some(s => String(s.id) === String(rw.owningSystemId)) && String(LV.sysOf('cma', rw)) !== String(rw.owningSystemId)) out.bad.push('cma ' + rw.cmaId + ' not in its system'); });
                        out.counts[k] = lv.map(v => LV.rowsIn(k, v).length).join('/');
                    });
                    return out;
                }, d.data), 150000, 'the showcase step');
                check('[R] ' + d.key + ': every CMA, R&M and HF row is at exactly one level; a system-scoped CMA row is its system\'s', !r.bad.length, r.bad.slice(0, 4).join('; ') + ' ' + JSON.stringify(r.counts));
            }
            // the tie, on an unstamped row (made by hand here): a CMA row whose gates are all in one system's trees
            const t = await page.evaluate(() => {
                _applyProjectData(window.__lvData || null);
                return null;
            }).catch(() => null);
            check('[R] no page errors while reading the showcases', !errs.length, errs.slice(0, 3).join(' | '));
            await page.close();
        }

        // ---------------------------------------------------------------- the rest on one showcase
        const hl1 = demos.find(d => d.key === 'showcase:hl1') || demos[0];
        const { page, errs } = await open(hl1.data);
        const r = await within(page.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const LV = SLLevelView, R = {};
            const sys = systemsData.find(s => ftaPages.some(p => p.treeLevel === 'system' && String(p.systemId) === String(s.id) && !p.verifies && p.root)) || systemsData[0];
            const sid = String(sys.id), other = systemsData.find(s => String(s.id) !== sid);
            const set = (lane, on, id) => { try { PROGRAM_PLAN.setSystemLane(id || sid, lane, on, { rationale: 'tailored for the level view test', sig: 'test' }); } catch (e) { return e.message; } return ''; };
            ['cma', 'ram-reliability', 'ram-mx', 'ram-msg3', 'ram-mmel', 'hfa', 'hfa-tid', 'hfa-task', 'hfa-hea', 'hfa-alerts', 'hfa-cd'].forEach(l => set(l, true));

            // [P] the plan
            R.plan = { lanes: PROGRAM_PLAN.planLanes().map(l => l.id), zsa: PROGRAM_PLAN.systemLaneOn(sid, 'zsa'), pra: PROGRAM_PLAN.systemLaneOn(sid, 'pra'), routing: PROGRAM_PLAN.systemLaneOn(sid, 'routing'), cma: PROGRAM_PLAN.systemLaneOn(sid, 'cma') };
            PROGRAM_PLAN.openSystemPlanModal(sys.id); await wait(300);
            const md = document.getElementById('pp-plan-scroll'); R.plan.modal = md ? [...md.querySelectorAll('input[data-lane]')].map(x => x.getAttribute('data-lane')) : null;
            try { PROGRAM_PLAN.closeSystemPlanModal(); } catch (_) {}
            const ns = PROGRAM_PLAN.initSystemPlan('lv-test-sys', null); R.plan.fresh = ns ? Object.keys(ns.lanes) : null;
            try { delete PROGRAM_PLAN.systemPlans; } catch (_) {}

            // [N] the sections of a system
            const areas = () => [...document.querySelectorAll('#app-sidebar .asb-area')].filter(x => x.style.display !== 'none').map(x => x.getAttribute('data-area'));
            const linkOn = id => { const x = document.getElementById(id); return !!x && x.style.display !== 'none' && !x.classList.contains('sl-sys-lane-off'); };
            SLNavAreas.pickScope('aircraft'); await wait(500);
            R.nav = { ac: areas() };
            SLNavAreas.pickScope(sid); await wait(900);
            R.nav.sys = areas();
            R.nav.links = ['sl-nav-sys-cma', 'sl-nav-sys-hfa-hea', 'sl-nav-sys-hfa-cd'].map(linkOn);
            set('cma', false); set('hfa-hea', false); await wait(1900);
            R.nav.off = { areas: areas(), links: ['sl-nav-sys-cma', 'sl-nav-sys-hfa-hea', 'sl-nav-sys-hfa-cd'].map(linkOn) };
            set('cma', true); set('hfa-hea', true); await wait(1900);
            R.nav.back = ['sl-nav-sys-cma', 'sl-nav-sys-hfa-hea'].map(linkOn);

            // [C] CMA: rows of the level, the line at the top, a new entry joins the level
            const sysRow = { internalId: 'lv-c1', cmaId: 'CMA-LV-SYS', subject: 'System channels', claim: 'independent', modes: [], linkedGateIds: [], status: 'Open', scope: 'system', owningSystemId: sys.id };
            const acRow = { internalId: 'lv-c2', cmaId: 'CMA-LV-AC', subject: 'Cross-system', claim: 'independent', modes: [], linkedGateIds: [], status: 'Open', scope: 'aircraft', owningSystemId: '', level: 'aircraft' };
            // an unstamped row whose one gate is in this system's tree: it follows the tree
            const tree = ftaPages.find(p => p.treeLevel === 'system' && String(p.systemId) === sid && !p.verifies && p.root);
            let gate = null; (function w(n) { if (!n || gate) return; if (n.type === 'gate' || n.gateType) { gate = n; return; } (n.children || []).forEach(w); })(tree && tree.root);
            const tieRow = { internalId: 'lv-c3', cmaId: 'CMA-LV-TIE', subject: 'Tied by its gate', claim: '', modes: [], linkedGateIds: gate ? [tree.id + ':' + gate.id] : [], status: 'Open', scope: 'aircraft', owningSystemId: '' };
            cmaData.push(sysRow, acRow, tieRow); scheduleAutosave(); await wait(200);
            R.tie = { sys: LV.sysOf('cma', tieRow), stampedAc: LV.sysOf('cma', acRow), gate: !!gate };
            const ids = () => [...document.querySelectorAll('#cma-body tr')].map(tr => tr.innerText).join(' | ');
            SLNavAreas.goto('aircraft', 'cma'); await wait(700);
            const head = () => { const h = document.querySelector('#view-cma .sl-lv-head'); return h ? { level: h.getAttribute('data-lv-level'), text: h.innerText, go: [...h.querySelectorAll('[data-lv-go]')].map(b => b.getAttribute('data-lv-go')) } : null; };
            R.cmaAc = { head: head(), rows: ids(), scopeHidden: (() => { const e = document.getElementById('cma-scope'); const b = e && e.closest('div[style*="grid-template-columns"]'); return !!b && b.style.display === 'none'; })(),
                        chips: (() => { const c = document.querySelector('[data-cma-scope]'); return c ? getComputedStyle(c.parentNode).display : 'none'; })(), note: (document.getElementById('cma-level-note') || {}).textContent || '' };
            // the "View <system> analysis" link
            const go = document.querySelector('#view-cma .sl-lv-head [data-lv-go="' + sid + '"]'); if (go) go.click(); await wait(800);
            R.cmaSys = { scope: SLNavAreas.scope(), head: head(), rows: ids(), area: (document.querySelector('#app-sidebar .asb-area.snav-active') || {}).getAttribute ? document.querySelector('#app-sidebar .asb-area.snav-active').getAttribute('data-area') : null, note: (document.getElementById('cma-level-note') || {}).textContent || '' };
            // a new entry, made here, is this system's
            document.getElementById('cma-id').value = 'CMA-LV-NEW'; document.getElementById('cma-subject').value = 'made at the system level'; document.getElementById('cma-claim').value = 'x';
            submitCMA(); await wait(500);
            const made = cmaData.find(x => x.cmaId === 'CMA-LV-NEW');
            R.cmaNew = made ? { scope: made.scope, owner: String(made.owningSystemId), level: made.level, shown: ids().indexOf('CMA-LV-NEW') >= 0 } : null;
            const back = document.querySelector('#view-cma .sl-lv-head [data-lv-go="aircraft"]'); if (back) back.click(); await wait(700);
            R.cmaBack = { scope: SLNavAreas.scope(), rows: ids() };

            // [F] HF: human error analysis
            SLNavAreas.goto(sid, 'hfa-hea'); await wait(700);
            const n0 = (projectConfig.hf && projectConfig.hf.hea && projectConfig.hf.hea.rows.length) || 0;
            HF_ANALYSES.addHea(); await wait(300);
            const heaRows = projectConfig.hf.hea.rows, hNew = heaRows[heaRows.length - 1];
            R.hea = { added: heaRows.length === n0 + 1, level: hNew.level, owner: String(hNew.owningSystemId), shownSys: !!document.querySelector('#hfa-hea-host tr[data-hf-id="' + hNew.heaId + '"]'), head: (document.querySelector('#view-hfa-hea .sl-lv-head') || {}).innerText || '' };
            SLNavAreas.goto('aircraft', 'hfa-hea'); await wait(700);
            R.hea.shownAc = !!document.querySelector('#hfa-hea-host tr[data-hf-id="' + hNew.heaId + '"]');
            R.hea.acHead = (document.querySelector('#view-hfa-hea .sl-lv-head') || {}).innerText || '';
            HF_ANALYSES.addHea(); await wait(300);
            const hAc = projectConfig.hf.hea.rows[projectConfig.hf.hea.rows.length - 1];
            R.hea.acNew = { level: hAc.level, shown: !!document.querySelector('#hfa-hea-host tr[data-hf-id="' + hAc.heaId + '"]') };

            // [M] R&M: maintainability tasks and the parts-count prediction with the aircraft roll-up
            if (!projectConfig.ram) projectConfig.ram = {};
            if (!Array.isArray(projectConfig.ram.tasks)) projectConfig.ram.tasks = [];
            const tSys = LV.stamp('ramTask', { id: 'RAM-LV-S', name: 'LV system task', itemId: '', beRef: '', activeRepair: 1, logistics: 0, admin: 0, interval: 0 }, sid);
            const tAc = LV.stamp('ramTask', { id: 'RAM-LV-A', name: 'LV aircraft task', itemId: '', beRef: '', activeRepair: 1, logistics: 0, admin: 0, interval: 0 }, null);
            projectConfig.ram.tasks.push(tSys, tAc); scheduleAutosave();
            const ramHas = () => { const h = document.getElementById('ram-mx-host'); return h ? { s: h.innerText.indexOf('LV system task') >= 0, a: h.innerText.indexOf('LV aircraft task') >= 0, gated: /Pro\+|subscription|upgrade/i.test(h.innerText) && h.innerText.indexOf('Task ledger') < 0 } : null; };
            SLNavAreas.goto(sid, 'ram-mx'); await wait(700); R.mxSys = ramHas();
            SLNavAreas.goto('aircraft', 'ram-mx'); await wait(700); R.mxAc = ramHas();
            if (!projectConfig.ram.predict) projectConfig.ram.predict = { env: 'AIC', rows: [] };
            const db = window.RAM_PREDICT_DATA, cat = db && Object.keys(db.categories)[0];
            R.predict = { db: !!cat };
            if (cat) {
                projectConfig.ram.predict.rows = [LV.stamp('ramPredict', { cat, qty: 2, quality: db.categories[cat].defaultQuality }, null), LV.stamp('ramPredict', { cat, qty: 3, quality: db.categories[cat].defaultQuality }, sid)];
                scheduleAutosave();
                const ru = RAM_PREDICT.rollup();
                const one = RAM_PREDICT.predict([{ cat, qty: 1, quality: db.categories[cat].defaultQuality }], 'AIC').lambdaTotal;
                R.predict.rollup = ru ? { parts: ru.parts.length, total: ru.lambdaTotal, want: 5 * one } : null;
                SLNavAreas.goto(sid, 'ram-predict'); await wait(700);
                R.predict.sysRows = document.querySelectorAll('#ram-predict-host tbody tr').length;
                SLNavAreas.goto('aircraft', 'ram-predict'); await wait(700);
                R.predict.acRows = document.querySelectorAll('#ram-predict-host tbody tr').length;
                R.predict.acRollup = !!document.querySelector('#ram-predict-host .sl-rp-rollup');
            }
            // MSG-3 significant items and MMEL items, each at its level
            if (!projectConfig.msg3) projectConfig.msg3 = { msis: [], screened: [] };
            if (!Array.isArray(projectConfig.msg3.msis)) projectConfig.msg3.msis = [];
            projectConfig.msg3.msis.push(LV.stamp('msg3', { id: 'MSI-LV-S', name: 'LV system MSI', itemId: '', sel: { safety: true }, ffs: [] }, sid), LV.stamp('msg3', { id: 'MSI-LV-A', name: 'LV aircraft MSI', itemId: '', sel: { safety: true }, ffs: [] }, null));
            if (!projectConfig.mmel) projectConfig.mmel = { items: [], budgetShare: 0.1 };
            if (!Array.isArray(projectConfig.mmel.items)) projectConfig.mmel.items = [];
            projectConfig.mmel.items.push(LV.stamp('mmel', { id: 'MMEL-LV-S', title: 'LV system MMEL', ata: '', itemId: '', beRef: '', installed: 2, required: 1, category: 'C', catDays: 10, state: 'draft', history: [], protection: null, quant: null }, sid),
                                          LV.stamp('mmel', { id: 'MMEL-LV-A', title: 'LV aircraft MMEL', ata: '', itemId: '', beRef: '', installed: 2, required: 1, category: 'C', catDays: 10, state: 'draft', history: [], protection: null, quant: null }, null));
            scheduleAutosave();
            const txt = id => (document.getElementById(id) || {}).innerText || '';
            SLNavAreas.goto(sid, 'ram-msg3'); await wait(700); R.msg3 = { sys: [/LV system MSI/.test(txt('ram-msg3-host')), /LV aircraft MSI/.test(txt('ram-msg3-host'))] };
            SLNavAreas.goto('aircraft', 'ram-msg3'); await wait(700); R.msg3.ac = [/LV system MSI/.test(txt('ram-msg3-host')), /LV aircraft MSI/.test(txt('ram-msg3-host'))];
            SLNavAreas.goto(sid, 'mmel'); await wait(700); R.mmel = { sys: [/LV system MMEL/.test(txt('mmel-host')), /LV aircraft MMEL/.test(txt('mmel-host'))] };
            SLNavAreas.goto('aircraft', 'mmel'); await wait(700); R.mmel.ac = [/LV system MMEL/.test(txt('mmel-host')), /LV aircraft MMEL/.test(txt('mmel-host'))];
            // 25 Oct 2026, later: the section names, the system's FMEA in its SSA, no "Working in" bar, no AI/ML
            SLNavAreas.pickScope('aircraft'); await wait(500);
            const lbl = k => { const b = document.querySelector('#app-sidebar .asb-area[data-area="' + k + '"] .asb-lbl'); return b ? b.textContent : null; };
            R.names = { afha: lbl('afha'), sys: lbl('sys') };
            ['ffmea', 'ppfmea'].forEach(l => set(l, true));
            SLNavAreas.pickScope(sid); await wait(900);
            SLNavAreas.open('ssa'); await wait(900);
            const fl = document.getElementById('sl-nav-ssa-fmea');
            R.fmea = { inSsa: !!fl && !!fl.closest('#sl-areabar'), shown: !!fl && !fl.classList.contains('sl-sys-lane-off') };
            if (fl) { fl.click(); await wait(900); }
            const wsBtn = document.getElementById('ws-tab-fmea');
            R.fmea.open = { area: (document.querySelector('#app-sidebar .asb-area.snav-active') || { getAttribute: () => null }).getAttribute('data-area'), view: !!document.getElementById('ws-view-fmea') && document.getElementById('ws-view-fmea').offsetParent !== null, wsButton: wsBtn ? getComputedStyle(wsBtn).display : 'none' };
            const sfha = document.getElementById('sl-nav-sysws'); if (sfha) { sfha.click(); await wait(800); }
            R.bar = !!document.getElementById('sys-breadcrumb-host') || /Working in/.test((document.getElementById('view-sys-workspace') || {}).innerText || '');
            R.title = (document.getElementById('ws-sys-title') || {}).textContent || '';
            R.mlas = { link: !!document.getElementById('snav-mlas'), view: !!document.getElementById('view-mlas'), api: !!window.ML_ASSURANCE, lane: PROGRAM_PLAN.CATALOGUE.some(l => l.id === 'mlas'), data: typeof mlData !== 'undefined' };
            // 25 Oct 2026, found testing the live app: (1) the chart dot lost when the table was drawn too early,
            // (2) the system CMA page listing every system's gates, (3) the cloud save dialog speaking of an export
            // the harness's welcome and sign-up dialogs stay open (no one signs in here); the dots are only redrawn with no dialog open
            document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
            SLNavAreas.goto('aircraft', 'ac-fha'); await wait(900);
            const dotsWant = () => [...document.querySelectorAll('#ac-fha-body .fha-chart-trigger')].filter(b => { const m = /openFhaChartModal\('([^']*)'/.exec(b.getAttribute('onclick') || ''); const r = m && acFhaData.find(x => String(x.internalId) === m[1]); return r && SLFcTrees.needsChart(r); }).length;
            const dotsHave = () => document.querySelectorAll('#ac-fha-body [data-needs-chart]').length;
            R.dots = { want: dotsWant() };
            document.querySelectorAll('#ac-fha-body [data-needs-chart]').forEach(b => b.removeAttribute('data-needs-chart'));   // a table drawn before the flags were known
            R.dots.stripped = dotsHave();
            await wait(3300);
            R.dots.after = dotsHave();
            const gatePages = () => [...document.querySelectorAll('#critical-gates-panel tbody tr')].map(tr => (tr.children[1] || {}).textContent).filter(Boolean);
            const pageLevel = name => { const p = ftaPages.find(x => x.name === name); return p ? LV.sysOfPage(p) : 'missing'; };
            SLNavAreas.goto(sid, 'cma'); await wait(900);
            R.gates = { sys: [...new Set(gatePages().map(pageLevel))] };
            SLNavAreas.goto('aircraft', 'cma'); await wait(900);
            R.gates.ac = [...new Set(gatePages().map(pageLevel))];
            SLNavAreas.goto(sid, 'cma'); await wait(700);
            R.gates.form = [...document.querySelectorAll('#cma-linked-gates input[type="checkbox"]')].map(x => LV.sysOfPage(ftaPages.find(p => String(p.id) === x.value.split(':')[0]) || {}));
            // the cloud save's review dialog, as save_state.js opens it
            acFhaData[0].comments = 'LV dialog wording'; SLChangeAck._markInput(); scheduleAutosave(); await wait(900);
            R.cloudWrapped = !!(window.saveProjectToCloud && window.saveProjectToCloud._slExportGate);
            try { window.saveProjectToCloud(); } catch (_) {}   // the app's own Save to cloud, gated: with a change waiting, the review opens first
            await wait(700);
            R.cloudDlg = (document.getElementById('sl-ack-overlay') || {}).innerText || '';
            const kw = document.querySelector('#sl-ack-overlay [data-ack="working"], #sl-ack-overlay .sl-ack-working'); if (kw) kw.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            await wait(400);
            // [A] the aircraft line names every system planned for the kind, and no other level's rows show
            R.acLine = LV.systemsWith('cma').filter(s => s.rows > 0).map(s => s.id);
            // the links are readable (25 Oct 2026: the app's button rule had made them white on white) and only
            // systems with rows get one; the rest are counted
            SLNavAreas.goto('aircraft', 'hfa-hea'); await wait(700);
            const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
            SLNavAreas.goto('aircraft', 'cma'); await wait(700);
            const cmaLinks = [...document.querySelectorAll('#view-cma .sl-lv-go')];
            R.links = cmaLinks.map(b => { const c = getComputedStyle(b); return { text: b.textContent.trim(), gap: Math.abs(lum(c.color) - lum(c.backgroundColor)) }; });
            R.headText = (document.querySelector('#view-cma .sl-lv-head') || {}).innerText || '';
            R.withRows = LV.systemsWith('cma').filter(s => s.rows > 0).length; R.planned = LV.systemsWith('cma').length;
            R.sysCount = systemsData.length;
            return R;
        }), 240000, 'the level view step');

        check('[P] a system\'s plan offers no ZSA and no PRA (the list, the window, a new plan)', r.plan.lanes.indexOf('zsa') < 0 && r.plan.lanes.indexOf('pra') < 0 && r.plan.modal && r.plan.modal.indexOf('zsa') < 0 && r.plan.modal.indexOf('pra') < 0 && r.plan.modal.indexOf('routing') < 0 && r.plan.fresh && r.plan.fresh.indexOf('zsa') < 0, JSON.stringify(r.plan));
        check('[P] asked about ZSA, PRA or zone routing, a system says no; CMA it has', r.plan.zsa === false && r.plan.pra === false && r.plan.routing === false && r.plan.cma === true, JSON.stringify(r.plan));
        check('[P] the plan window still offers CMA, R&M and HF', r.plan.modal && ['cma', 'ram-mx', 'hfa', 'hfa-hea'].every(l => r.plan.modal.indexOf(l) >= 0), JSON.stringify(r.plan.modal));
        check('[N] the aircraft shows its own sections, never a system\'s', r.nav.ac.indexOf('cca') >= 0 && r.nav.ac.indexOf('hf') >= 0 && ['sys-cca', 'sys-ram', 'sys-hf'].every(a => r.nav.ac.indexOf(a) < 0), JSON.stringify(r.nav.ac));
        check('[N] a system shows its Common cause and Human factors sections and none of the aircraft\'s', ['sys-cca', 'sys-hf'].every(a => r.nav.sys.indexOf(a) >= 0) && ['cca', 'hf', 'ram'].every(a => r.nav.sys.indexOf(a) < 0) && r.nav.links.every(Boolean), JSON.stringify(r.nav));
        check('[N] its plan without CMA: the section goes; without human error analysis: that tab goes, the rest of HF stays', r.nav.off.areas.indexOf('sys-cca') < 0 && JSON.stringify(r.nav.off.links) === '[false,false,true]' && r.nav.off.areas.indexOf('sys-hf') >= 0, JSON.stringify(r.nav.off));
        check('[N] back in the plan, they come back', r.nav.back.every(Boolean), JSON.stringify(r.nav.back));
        check('[R] an unstamped CMA row whose gate is in one system\'s tree is that system\'s; a stamped aircraft row stays', r.tie.gate && String(r.tie.sys) === String(r.cmaSys.scope) && r.tie.stampedAc === null, JSON.stringify(r.tie));
        check('[A] the aircraft CMA page: aircraft rows only, the line names the level and links each system', r.cmaAc.head && r.cmaAc.head.level === 'aircraft' && r.cmaAc.head.go.length >= 1 && /CMA-LV-AC/.test(r.cmaAc.rows) && !/CMA-LV-SYS|CMA-LV-TIE/.test(r.cmaAc.rows), JSON.stringify(r.cmaAc));
        check('[C] the scope picker and the All / Aircraft / System chips are gone; the form says where a new entry goes', r.cmaAc.scopeHidden && r.cmaAc.chips === 'none' && /aircraft-level CMA/.test(r.cmaAc.note), JSON.stringify(r.cmaAc));
        check('[A] "View <system> analysis" opens that system\'s CMA: its section, its rows, a link back', r.cmaSys.head && r.cmaSys.head.level === r.cmaSys.scope && r.cmaSys.area === 'sys-cca' && /CMA-LV-SYS/.test(r.cmaSys.rows) && /CMA-LV-TIE/.test(r.cmaSys.rows) && !/CMA-LV-AC/.test(r.cmaSys.rows) && r.cmaSys.head.go.indexOf('aircraft') >= 0, JSON.stringify(r.cmaSys));
        check('[C] a new CMA entry made at the system level is that system\'s, and shows there', r.cmaNew && r.cmaNew.scope === 'system' && r.cmaNew.owner === r.cmaSys.scope && r.cmaNew.level === 'system' && r.cmaNew.shown, JSON.stringify(r.cmaNew));
        check('[A] back at the aircraft: the system\'s entries are not listed', r.cmaBack.scope === 'aircraft' && !/CMA-LV-NEW|CMA-LV-SYS/.test(r.cmaBack.rows) && /CMA-LV-AC/.test(r.cmaBack.rows), JSON.stringify(r.cmaBack));
        check('[F] human error analysis: a row added at the system level is the system\'s, shown there and not at the aircraft', r.hea.added && r.hea.level === 'system' && r.hea.owner === r.cmaSys.scope && r.hea.shownSys && !r.hea.shownAc, JSON.stringify(r.hea));
        check('[F] a row added at the aircraft level is the aircraft\'s; both pages carry the level line', r.hea.acNew.level === 'aircraft' && r.hea.acNew.shown && /Human error analysis/.test(r.hea.head) && /Aircraft level/.test(r.hea.acHead), JSON.stringify(r.hea));
        check('[M] maintainability: each level lists its own tasks', r.mxSys && r.mxAc && !r.mxSys.gated && r.mxSys.s && !r.mxSys.a && r.mxAc.a && !r.mxAc.s, JSON.stringify([r.mxSys, r.mxAc]));
        if (r.predict.db) {
            check('[M] the aircraft roll-up adds each level\'s own prediction (2 parts here + 3 in the system = 5)', r.predict.rollup && r.predict.rollup.parts === 2 && Math.abs(r.predict.rollup.total - r.predict.rollup.want) < 1e-9 * Math.max(1, r.predict.rollup.want), JSON.stringify(r.predict));
            check('[M] each level lists its own parts; the aircraft page shows the roll-up', r.predict.sysRows === 1 && r.predict.acRows === 1 && r.predict.acRollup, JSON.stringify(r.predict));
        } else check('[M] the parts-count data is staged (the prediction checks need it)', false);
        check('[M] MSG-3 systems analysis: each level lists its own significant items', JSON.stringify(r.msg3) === '{"sys":[true,false],"ac":[false,true]}', JSON.stringify(r.msg3));
        check('[M] MMEL: each level lists its own items', JSON.stringify(r.mmel) === '{"sys":[true,false],"ac":[false,true]}', JSON.stringify(r.mmel));
        check('[N] the aircraft\'s hazards section is called AFHA; a system\'s first section is its SFHA (no "workspace")', r.names.afha === 'AFHA' && r.names.sys === 'SFHA' && /SFHA/.test(r.title) && !/Workspace/i.test(r.title), JSON.stringify([r.names, r.title]));
        check('[N] a system\'s FMEA is a tab of its SSA, opens the FMEA there; the old workspace FMEA button is gone', r.fmea.inSsa && r.fmea.shown && r.fmea.open.area === 'ssa' && r.fmea.open.view && r.fmea.open.wsButton === 'none', JSON.stringify(r.fmea));
        check('[N] no "Working in" bar on a system\'s pages', r.bar === false);
        check('[N] AI/ML assurance is out: no link, no page, no lane, no module; the project\'s saved AI/ML records are still kept', !r.mlas.link && !r.mlas.view && !r.mlas.api && !r.mlas.lane && r.mlas.data, JSON.stringify(r.mlas));
        check('[F1] a FHA table drawn without its chart dots gets them back within a few seconds', r.dots.want >= 1 && r.dots.stripped === 0 && r.dots.after === r.dots.want, JSON.stringify(r.dots));
        check('[F2] a system\'s CMA page lists only its own trees\' AND gates; the aircraft\'s lists none of a system\'s', r.gates.sys.length >= 1 && r.gates.sys.every(x => x === r.cmaSys.scope) && r.gates.ac.every(x => x === null), JSON.stringify(r.gates));
        check('[F2] the linked-gates list of a new system CMA entry offers only that system\'s gates', r.gates.form.length >= 1 && r.gates.form.every(x => x === r.cmaSys.scope), JSON.stringify(r.gates.form.slice(0, 8)));
        check('[F3] the review before a cloud save speaks of saving to the cloud, never of an export', r.cloudWrapped && /saved to the cloud/.test(r.cloudDlg) && !/export/i.test(r.cloudDlg) && /Confirm all and save/.test(r.cloudDlg), r.cloudDlg.slice(0, 600));
        check('[A] the aircraft line links only the systems with rows of their own, and counts the rest', r.links.length === r.withRows && r.withRows >= 1 && (r.planned === r.withRows || new RegExp((r.planned - r.withRows) + ' more system').test(r.headText)), JSON.stringify([r.withRows, r.planned, r.headText]));
        check('[A] every "View <system> analysis" link is readable: it has its words, in a color far from its background', r.links.length >= 1 && r.links.every(l => /^View .+ analysis/.test(l.text) && l.gap > 100), JSON.stringify(r.links));
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
        await page.close();
    } finally {
        await browser.close(); srv.close();
    }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
