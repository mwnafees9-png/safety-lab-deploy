#!/usr/bin/env node
/*
 * Regression — the design baseline stamp (27 Sep 2026, OPEN_ITEMS Q9).
 *
 *   H1  the record: no baseline until one is set; setCurrent mints DB-1 and edits
 *       its fields without minting; newBaseline moves the current one to history
 *       (superseded stamp) and mints the next id; ids never repeat; describe()
 *   H2  pages: every analysis page that has rows (AFHA, each system FHA, each fault
 *       tree, CMA, PRA, ZSA, aircraft and system requirements), none for empty stores
 *   H3  stamps: refused without a current baseline; a stamp names the current
 *       baseline, who and when; status current / older / unstamped; a new baseline
 *       turns every stamp to re-check; stampAll; INV-66 counts pages, fails on
 *       older, reports unstamped separately, and is silent with no baseline
 *   H4  Golden Thread: pages for a condition = its FHA page, its linked trees, the
 *       requirements page; the stage says re-check with a link, OK when all current,
 *       nothing with no baseline; inserted before Verification
 *   H5  surfaces: the panel goes above the analysis baselines table once and is
 *       replaced in place; it shows the current record, the mint form, the history
 *       and the page table; strips render on the six views with the right text and
 *       follow the active fault tree page; switchTab and renderBaselines are wrapped
 *   H6  wiring: loaded right after zonal_threats.js, no eval, module exports
 * Run: node tests/regression_design_baseline.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('design_baseline.js'), IDX = read('index.html');

function El(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.innerHTML = ''; this.style = {}; this.parentNode = null; this.cls = ''; }
El.prototype.querySelector = function (sel) { if (sel === '.header-with-export') return this.children.find(c => c.cls === 'header-with-export') || null; return null; };
El.prototype.insertBefore = function (n, ref) { const i = this.children.indexOf(ref); n.parentNode = this; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); return n; };
El.prototype.appendChild = function (n) { n.parentNode = this; this.children.push(n); return n; };
Object.defineProperty(El.prototype, 'firstChild', { get() { return this.children[0] || null; } });
Object.defineProperty(El.prototype, 'nextSibling', { get() { const p = this.parentNode; if (!p) return null; const i = p.children.indexOf(this); return p.children[i + 1] || null; } });
Object.defineProperty(El.prototype, 'firstElementChild', { get() { return this.children[0] || null; } });
Object.defineProperty(El.prototype, 'outerHTML', { set(h) { this._outer = h; } });
function makeDoc() {
    const byId = {};
    const created = tag => { const e = new El(tag); Object.defineProperty(e, 'id', { get() { return e._id; }, set(v) { e._id = v; byId[v] = e; } }); Object.defineProperty(e, 'innerHTML', { get() { return e._html || ''; }, set(h) { e._html = h; if (/^<div id="db-panel"/.test(h)) { const p = created('div'); p.id = 'db-panel'; p._html = h; e.children = [p]; p.parentNode = e; } } }); return e; };
    return { getElementById: id => byId[id] || null, createElement: created, el: (tag, id) => { const e = created(tag); if (id) e.id = id; return e; }, byId };
}
function load(model, extra) {
    const toasts = [];
    const sb = Object.assign({ console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, setTimeout: () => 0, setInterval: () => 0, showToast: (m, k) => toasts.push({ m, k }), _toasts: toasts, scheduleAutosave: () => { sb._saved = (sb._saved || 0) + 1; },
        _signoffReviewerName: () => 'W. Nafees', _gtStage: (t, b, s) => '<div style="border:1px solid var(--color-border-hair)" data-stage="' + t + '" data-status="' + s + '">' + b + '</div>' }, model, extra || {});
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    vm.createContext(sb); vm.runInContext(SRC, sb, { filename: 'design_baseline.js' }); return sb;
}
const fc = id => ({ internalId: id, fcId: 'FC-' + id, severity: 'Major' });
function world(extra) {
    return load(Object.assign({ projectConfig: {}, acFhaData: [fc(1), fc(2)], systemsData: [{ id: 'S1', name: 'Hydraulics', fha: [fc(5)], req: [{ internalId: 9 }] }, { id: 'S2', name: 'Empty', fha: [], req: [] }],
        ftaPages: [{ id: 'p1', name: 'Loss of control', linkedFhaIds: [1] }, { id: 'p2', name: 'Other', linkedFhaId: 5 }], cmaData: [{}], praData: [], zsaData: [{}], acReqData: [{ internalId: 1 }] }, extra || {}));
}

// ---- H1 the record ---------------------------------------------------------------------
{
    const sb = world(); const D = sb.SLDesignBaseline;
    check('H1: no baseline until one is set', D.current() === null && D.history().length === 0 && D.describe(null) === 'none');
    const c1 = D.setCurrent({ label: 'PDR release', dmu: 'DMU 12.3', date: '2026-09-20' });
    check('H1: setCurrent mints DB-1 with the fields, who and when', c1.id === 'DB-1' && c1.label === 'PDR release' && c1.dmu === 'DMU 12.3' && c1.setBy === 'W. Nafees' && /^\d{4}-/.test(c1.setAt) && sb._saved === 1);
    D.setCurrent({ note: 'first release' });
    check('H1: editing the current record does not mint a new baseline', D.current().id === 'DB-1' && D.current().note === 'first release' && D.current().label === 'PDR release' && D.history().length === 0);
    const c2 = D.newBaseline({ label: 'CDR release', dmu: 'DMU 14.0' });
    check('H1: newBaseline moves DB-1 to history with a superseded stamp and mints DB-2', c2.id === 'DB-2' && D.current().id === 'DB-2' && D.history().length === 1 && D.history()[0].id === 'DB-1' && /^\d{4}-/.test(D.history()[0].supersededAt) && D.get('DB-1').label === 'PDR release' && D.all().length === 2);
    sb.projectConfig.designBaseline.history.push({ id: 'DB-7', label: 'imported' });
    check('H1: ids never repeat (the next id is above the highest seen)', D.newBaseline({}).id === 'DB-8');
    check('H1: describe reads id, label and DMU', D.describe(D.get('DB-2')) === 'DB-2 CDR release (DMU 14.0)' && D.describe({ id: 'DB-9' }) === 'DB-9');
}

// ---- H2 pages ------------------------------------------------------------------------------
{
    const D = world().SLDesignBaseline;
    check('H2: every analysis page with rows is listed, empty stores are not', D.pages().map(p => p.key).join(',') === 'afha,sfha:S1,fta:p1,fta:p2,cma,zsa,reqs:ac,reqs:S1');
    check('H2: labels name the system and the tree', D.pages().find(p => p.key === 'sfha:S1').label === 'System FHA: Hydraulics' && D.pages().find(p => p.key === 'fta:p1').label === 'Fault tree: Loss of control');
    check('H2: an empty project has no pages', load({ projectConfig: {} }).SLDesignBaseline.pages().length === 0);
}

// ---- H3 stamps ----------------------------------------------------------------------------------
{
    const sb = world(); const D = sb.SLDesignBaseline;
    check('H3: a stamp is refused without a current baseline; status is unstamped; INV-66 is silent', D.setStamp('afha') === null && D.status('afha').kind === 'unstamped' && D.INV.run().checked === 0 && D.INV.run().failCount === 0);
    D.newBaseline({ label: 'PDR' });
    const s = D.setStamp('afha');
    check('H3: a stamp names the current baseline, who and when', s.baselineId === 'DB-1' && s.by === 'W. Nafees' && /^\d{4}-/.test(s.at) && D.stamp('afha') === s && D.status('afha').kind === 'current' && /analyzed against DB-1 \(current\)/.test(D.status('afha').text));
    let inv = D.INV.run();
    check('H3: INV-66 counts the pages, no failure while every stamp is current, unstamped reported separately', D.INV.id === 'INV-66' && D.INV.sev === 'advisory' && inv.checked === 8 && inv.failCount === 0 && inv.unstamped === 7, JSON.stringify(inv));
    D.newBaseline({ label: 'CDR' });
    check('H3: a new baseline turns the stamped page to re-check', D.status('afha').kind === 'older' && /analyzed against DB-1, the design is now at DB-2: re-check/.test(D.status('afha').text) && D.recheck().length === 1 && D.recheck()[0].page.key === 'afha');
    inv = D.INV.run();
    check('H3: INV-66 fails on the older stamp and names the page', inv.failCount === 1 && /^Aircraft FHA: analyzed against DB-1, the design is now at DB-2: re-check$/.test(inv.fails[0]));
    check('H3: stampAll states every page against the current baseline', D.stampAll() === 8 && D.recheck().length === 0 && D.unstamped().length === 0 && D.INV.run().failCount === 0);
    check('H3: an unknown key is refused', D.setStamp('') === null);
}

// ---- H4 Golden Thread -------------------------------------------------------------------------
{
    const sb = world(); const D = sb.SLDesignBaseline;
    const f1 = sb.acFhaData[0], f5 = sb.systemsData[0].fha[0];
    check('H4: no baseline, no stage', D.threadStage(f1) === '');
    D.newBaseline({ label: 'PDR', dmu: 'DMU 12' });
    check('H4: pages for an aircraft condition = its FHA page, its linked trees, the requirements page', D.pagesForFc(f1).map(p => p.key).join(',') === 'afha,fta:p1,reqs:ac' && D.pagesForFc(f5).map(p => p.key).join(',') === 'sfha:S1,fta:p2' && D.pagesForFc(null).length === 0);
    let st = D.threadStage(f1);
    check('H4: with nothing stated the stage is info and offers the stamp link', /data-status="info"/.test(st) && /not yet stated/.test(st) && /stampClick\('afha'\)/.test(st) && /Design is at DB-1 PDR \(DMU 12\)/.test(st) && /0 to re-check, 3 not yet stated/.test(st));
    D.stampAll(); D.newBaseline({ label: 'CDR' });
    st = D.threadStage(f1);
    check('H4: after the design moved the stage says re-check for each page', /data-status="warn"/.test(st) && (st.match(/re-check/g) || []).length >= 3 && /mark as analyzed against DB-2/.test(st));
    D.stampAll();
    check('H4: all current is OK', /data-status="ok"/.test(D.threadStage(f1)) && /3 analysis pages on this thread; 0 to re-check, 0 not yet stated/.test(D.threadStage(f1)));
    const orig = () => '<div style="border:1px solid var(--color-border-hair)"><span>Requirements</span></div><div style="border:1px solid var(--color-border-hair)"><span>Verification</span></div>';
    sb._renderGoldenThread = orig;
    check('H4: the thread wrapper installs once and inserts the stage before Verification', D._wrapThread() === true && D._wrapThread() === false && (function () { const out = sb._renderGoldenThread(f1); const i = out.indexOf('data-stage="Design baseline"'); return i > out.indexOf('>Requirements</span>') && i < out.indexOf('>Verification</span>'); })());
}

// ---- H5 surfaces ---------------------------------------------------------------------------------
{
    const sb = world(); const D = sb.SLDesignBaseline;
    const doc = makeDoc(); sb.document = doc;
    const view = doc.el('div', 'view-baselines'); const host = doc.el('div', 'baselines-host'); view.children.push(host); host.parentNode = view;
    check('H5: the panel goes above the analysis baselines table once', D.renderPanel() === true && view.children.length === 2 && view.children[0].id === 'db-panel' && view.children[1].id === 'baselines-host');
    let html = D.panelHtml();
    check('H5: with no baseline the panel says so and offers to set DB-1', /No design baseline set/.test(html) && /Set design baseline \(DB-1\)/.test(html) && !/re-check ·/.test(html));
    doc.el('input', 'db-new-label').value = 'PDR release'; doc.el('input', 'db-new-dmu').value = 'DMU 12.3'; doc.el('input', 'db-new-date').value = '2026-09-20'; doc.el('input', 'db-new-note').value = '';
    const b = D.newBaselineClick();
    check('H5: the mint form creates the baseline from its fields and toasts', b.id === 'DB-1' && b.label === 'PDR release' && b.dmu === 'DMU 12.3' && /DB-1 is current/.test(sb._toasts[0].m));
    check('H5: the panel is replaced in place on re-render', doc.byId['db-panel']._outer && /Baseline id/.test(doc.byId['db-panel']._outer) && /DB-1/.test(doc.byId['db-panel']._outer));
    html = D.panelHtml();
    check('H5: the panel shows the current record, the next id, the page table with state buttons and the state-all button', /db-cur-label/.test(html) && /New design baseline \(DB-2\)/.test(html) && /Aircraft FHA/.test(html) && (html.match(/analyzed against DB-1</g) || []).length >= 8 && /state all as analyzed against DB-1/.test(html) && /0 to re-check · 8 not stated/.test(html));
    D.setFieldClick('dmu', 'DMU 12.4');
    check('H5: editing a field of the current record keeps the id', D.current().dmu === 'DMU 12.4' && D.current().id === 'DB-1');
    D.stampAllClick(); D.newBaselineClick();
    html = D.panelHtml();
    check('H5: after the design moved the panel shows the history row and 8 to re-check', /<td class="u-mono">DB-1<\/td>/.test(html) && /8 to re-check · 0 not stated/.test(html) && (html.match(/● re-check/g) || []).length === 8);
    // strips
    ['ac-fha', 'fta', 'cma', 'pra', 'zsa', 'ac-req'].forEach(v => { const e = doc.el('div', 'view-' + v); const h = doc.el('div'); h.cls = 'header-with-export'; e.children.push(h); h.parentNode = e; const t = doc.el('table'); e.children.push(t); t.parentNode = e; });
    sb.activeFTAPageId = 'p1';
    check('H5: strips render on the six views, right after the header', D.renderStrips() === 6 && doc.byId['view-cma'].children[1].id === 'db-strip-cma' && /re-check/.test(doc.byId['db-strip-cma'].innerHTML) && /mark as analyzed against DB-2/.test(doc.byId['db-strip-afha'] ? '' : doc.byId['db-strip-ac-fha'].innerHTML));
    check('H5: the fault tree strip names the active page stamp', /re-check/.test(doc.byId['db-strip-fta'].innerHTML) && D.stripHtml('fta:p1').indexOf('re-check') >= 0 && D.stripHtml(null) === '');
    D.stampClick('fta:p1');
    check('H5: stamping from the strip re-renders it current', /● current/.test(doc.byId['db-strip-fta'].innerHTML) && /Stated: analyzed against DB-2/.test(sb._toasts[sb._toasts.length - 1].m));
    sb.activeFTAPageId = 'p2'; doc.byId['view-fta'].style.display = 'block'; D._tick();
    check('H5: the fault tree strip follows the active page', /re-check/.test(doc.byId['db-strip-fta'].innerHTML) && /DB-1, the design is now at DB-2/.test(doc.byId['db-strip-fta'].innerHTML));
    check('H5: the PRA view (no rows) still gets a strip that reads not yet stated', /not yet stated/.test(doc.byId['db-strip-pra'].innerHTML));
    const sb2 = load({ projectConfig: {}, acFhaData: [] }); sb2.document = makeDoc(); const v2 = sb2.document.el('div', 'view-cma'); v2.children.push(sb2.document.el('p')); v2.children[0].parentNode = v2;
    check('H5: with no baseline the strip says none set and links to the page', sb2.SLDesignBaseline.renderStrips() === 1 && /none set/.test(sb2.document.byId['db-strip-cma'].innerHTML) && /switchTab\('baselines'\)/.test(sb2.document.byId['db-strip-cma'].innerHTML));
    let tabs = []; sb.switchTab = t => { tabs.push(t); }; sb.renderBaselines = () => { tabs.push('rb'); };
    check('H5: switchTab and renderBaselines are wrapped once and still run', D._wrapSwitchTab() === true && D._wrapSwitchTab() === false && D._wrapBaselines() === true && D._wrapBaselines() === false && (sb.switchTab('cma'), sb.renderBaselines(), tabs.join() === 'cma,rb'));
}

// ---- H6 wiring ----------------------------------------------------------------------------------
{
    check('H6: design_baseline.js is loaded right after zonal_threats.js', /zonal_threats\.js\?v=[\d.]+" defer><\/script>\s*(<!--[^>]*-->\s*)?<script src="design_baseline\.js\?v=[\d.]+" defer><\/script>/.test(IDX));
    check('H6: no eval or Function constructor', !/\beval\s*\(/.test(SRC) && !/new Function\s*\(/.test(SRC));
    check('H6: module exports the API', /module\.exports = api/.test(SRC) && /root\.SLDesignBaseline = api/.test(SRC));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
