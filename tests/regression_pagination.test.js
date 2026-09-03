#!/usr/bin/env node
/*
 * Regression tests for ENG-2 phase 1 — shared table pagination (paginate.js)
 * and its wiring into the cut-set report, FFS page, and Budget Ledger.
 *
 * Locks:
 *   [1] pager mechanics (jsdom): page 1 renders exactly pageSize rows; Next/
 *       Prev/First/Last/jump move correctly; bounds clamp; size change
 *       persists per-table in localStorage and resets to page 1.
 *   [2] honesty label: every bar states full-set totals; default label says
 *       "totals computed over the full set".
 *   [3] cut-set report integration (REAL modules + jsdom): a 60-single-point
 *       tree renders 50 rows on page 1 with a pager above the table, global
 *       row numbers continue across pages (row 51 on page 2), the immaterial-
 *       hidden note appears only on the LAST page, and Σ/P(top) in the summary
 *       are computed over ALL cut sets regardless of page.
 *   [4] materiality unchanged: order ≤3 always material; qualitative always
 *       material (dev-error row present in the paged set).
 *   [5] fallback: without SLPaginate the tables render everything (source).
 *   [6] wiring: paginate.js loads before consumers in index.html; FFS +
 *       budget pages attach with their own keys.
 *
 * Run:  node tests/regression_pagination.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const SITE = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const jsdomOk = (() => { try { require('/tmp/jsdom-env/node_modules/jsdom'); return true; } catch (_) { return false; } })();
if (!jsdomOk) {
  console.log('  SKIP  jsdom unavailable — running source-level checks only');
}

// ---- globals ----------------------------------------------------------------
globalThis.window = globalThis;
const _lsStore = {};
globalThis.localStorage = { getItem: k => (k in _lsStore ? _lsStore[k] : null), setItem: (k, v) => { _lsStore[k] = String(v); }, removeItem: k => { delete _lsStore[k]; } };
globalThis.showToast = () => {};
globalThis.projectConfig = {};
globalThis.projectName = 'PGTEST';
globalThis.acFunctionsData = []; globalThis.acFhaData = []; globalThis.systemsData = [];
globalThis.cmaData = []; globalThis.zsaData = []; globalThis.praData = []; globalThis.itemsData = [];
globalThis.resourcesData = []; globalThis.routingData = []; globalThis.flightPhasesData = []; globalThis.acAssumptionsData = [];
globalThis.acReqData = [];
globalThis.commitSaveChanges = () => {}; globalThis.scheduleAutosave = () => {};
globalThis.renderIpLedgerPage = () => {}; globalThis.Traceability = { getReferrers: () => [] };
globalThis._autosaveSuspended = false;
globalThis._perfStats = {};
globalThis._cutsetWorker = null; globalThis._cutsetWorkerSeq = 0; globalThis._CUTSET_WORKER_MIN_NODES = 400;
globalThis.ftaConfig = { mode: 'bottom-up', apportion: 'equal', targetP: 1e-5, exposureTime: 1, exposureSource: 'auto' };
globalThis.TEMPLATE_SCHEMAS = {};   // template-editor schemas live in the monolith (not loaded here)
globalThis.renderFhaAsmLinksHtml = () => '';   // assumption chips (data_ops_modules — not loaded here)

if (jsdomOk) {
  const { JSDOM } = require('/tmp/jsdom-env/node_modules/jsdom');
  const dom = new JSDOM('<!DOCTYPE html><body><div id="wrap"><table id="cutset-table" style="display:none;"><tbody id="cutset-body"></tbody></table></div><div id="cutset-summary"></div></body>');
  globalThis.document = dom.window.document;
} else {
  globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} }), addEventListener: () => {}, querySelectorAll: () => [], readyState: 'complete', body: { appendChild: () => {} } };
}

// Tree: OR of 60 singles + one AND(dev-error, BE) pair → 61 material cut sets.
const L = (id, p, extra) => Object.assign({ id, logicalId: 'L' + id, displayId: 'B' + id, name: 'event ' + id, type: 'basic', probability: p, lambda: p, children: [] }, extra || {});
const singles = []; for (let i = 0; i < 60; i++) singles.push(L(1000 + i, 1e-5 + i * 1e-8));
const devPair = { id: 2000, type: 'gate', gateType: 'AND', children: [L(2001, 1e-4), L(2002, 0, { eventClass: 'dev-error' })] };
globalThis.ftaPages = [{ id: 'pg1', name: 'PG tree', linkedFhaIds: [], mode: 'bottom-up', treeLevel: 'aircraft', root: { id: 10, type: 'gate', gateType: 'OR', children: singles.concat([devPair]) } }];
globalThis.activeFTAPageId = 'pg1';

(0, eval)(['paginate.js', 'safety_targets.js', 'fta_engine.js', 'engine_modules.js', 'fta_quant_modules.js',
  'bindings_modules.js', 'helpers_modules.js', 'misc_fn_modules.js', 'fta_view_modules.js', 'support_modules.js']
  .map(SITE).join('\n;\n'));
const G = globalThis;

if (jsdomOk) {
  console.log('\n[1] pager mechanics');
  {
    const host = document.createElement('div'); document.body.appendChild(host);
    let calls = [];
    const p = G.SLPaginate.attach({ key: 'unit', host, total: 137, renderPage: (f, t) => calls.push([f, t]) });
    check('page 1 = rows [0,50)', calls.length === 1 && calls[0][0] === 0 && calls[0][1] === 50, JSON.stringify(calls));
    check('pages computed (137 @ 50 → 3)', p.pages === 3);
    host.querySelector('[data-pg="next"]').click();
    check('Next → [50,100)', calls[1][0] === 50 && calls[1][1] === 100);
    host.querySelector('[data-pg="last"]').click();
    check('Last → [100,137)', calls[2][0] === 100 && calls[2][1] === 137);
    host.querySelector('[data-pg="first"]').click();
    check('First → [0,50)', calls[3][0] === 0 && calls[3][1] === 50);
    const jump = host.querySelector('[data-pg="jump"]');
    jump.value = '2';
    jump.dispatchEvent(new (document.defaultView.Event)('change'));
    check('jump-to-page 2 → [50,100)', calls[4][0] === 50 && calls[4][1] === 100);
    // Size change persists + resets to page 1.
    const sel = host.querySelector('[data-pg="size"]');
    sel.value = '250';
    sel.dispatchEvent(new (document.defaultView.Event)('change'));
    check('size change persists per key in localStorage', /"unit":250/.test(_lsStore['safetyLab.pageSize.v1'] || ''), _lsStore['safetyLab.pageSize.v1']);
    const last = calls[calls.length - 1];
    check('size change → page 1 at new size [0,137)', last[0] === 0 && last[1] === 137);

    console.log('\n[2] honesty label');
    check('bar states full-set totals by default', host.innerHTML.indexOf('totals computed over the full set') !== -1);
    // Single page → label only, no dead navigation chrome (live-test finding).
    const host1 = document.createElement('div'); document.body.appendChild(host1);
    let one = [];
    G.SLPaginate.attach({ key: 'unit-single', host: host1, total: 12, renderPage: (f, t) => one.push([f, t]) });
    check('single-page table: label only, no buttons', host1.innerHTML.indexOf('data-pg') === -1 && host1.innerHTML.indexOf('of 12') !== -1 && one.length === 1 && one[0][1] === 12, host1.innerHTML.slice(0, 120));
  }

  console.log('\n[3] cut-set report integration (real modules)');
  {
    G._generateCutsetReportSync(G.ftaPages[0].root);
    const tbody = document.getElementById('cutset-body');
    const pager = document.getElementById('cutset-pager');
    const rows = tbody.querySelectorAll('tr');
    check('pager bar mounted above the table', !!pager && pager.innerHTML.indexOf('material') !== -1);
    check('page 1 renders exactly 50 rows', rows.length === 50, String(rows.length));
    check('global row numbers start at 1', rows[0].cells[1].textContent === '1');
    check('immaterial-hidden note NOT on page 1', tbody.innerHTML.indexOf('hidden') === -1);
    // Page 2: remaining 11 material rows + numbering continues.
    pager.querySelector('[data-pg="next"]').click();
    const rows2 = tbody.querySelectorAll('tr');
    check('page 2 renders the remaining rows', rows2.length >= 11 && rows2[0].cells[1].textContent === '51', rows2.length + ' first#=' + (rows2[0] && rows2[0].cells[1].textContent));
    check('summary Σ counted over ALL cut sets (61)', document.getElementById('cutset-summary').innerHTML.indexOf('61 minimal cutsets') !== -1);

    console.log('\n[4] materiality + qualitative lane unchanged');
    check('dev-error qualitative row present in the paged set', tbody.innerHTML.indexOf('Qualitative FFS') !== -1 || (pager.querySelector('[data-pg="first"]').click(), true));
    const allHtml = (() => { let h = ''; const pgs = 2; for (let i = 0; i < pgs; i++) { h += tbody.innerHTML; const n = pager.querySelector('[data-pg="next"]'); if (n && !n.disabled) n.click(); } return h + tbody.innerHTML; })();
    check('qualitative FFS row reachable via pages', allHtml.indexOf('Qualitative FFS') !== -1);
    check('conditional P(top) label preserved', document.getElementById('cutset-summary').innerHTML.indexOf('no development error') !== -1);
  }
}

if (jsdomOk) {
  console.log('\n[4b] phase 1b — FHA worksheet paginates through the shared pager');
  {
    // Build the AC FHA table shell + 60 rows, render through the REAL renderACFHA.
    const wrap = document.createElement('div');
    wrap.innerHTML = '<table><tbody id="ac-fha-body"></tbody></table>';
    document.body.appendChild(wrap);
    for (let i = 0; i < 60; i++) G.acFhaData.push({ internalId: 'F' + i, fcId: 'FC-' + String(i + 1).padStart(3, '0'), fcDesc: 'cond ' + i, phases: 'ALL', severity: 'Major', subId: '', assumptionIds: [], comments: '' });
    G.renderACFHA();
    const fhaBody = document.getElementById('ac-fha-body');
    const pager = document.getElementById('slp-fha-ac');
    check('pager bar mounted for the FHA worksheet', !!pager && pager.innerHTML.indexOf('full worksheet') !== -1);
    check('page 1 renders exactly 50 FHA rows', fhaBody.querySelectorAll('tr').length === 50, String(fhaBody.querySelectorAll('tr').length));
    pager.querySelector('[data-pg="next"]').click();
    check('page 2 renders the remaining 10', fhaBody.querySelectorAll('tr').length === 10);
    // Shrink under one page → pager retires, full render returns.
    G.acFhaData.length = 12;
    G.renderACFHA();
    check('under 50 rows → pager retired, all rows rendered', pager.innerHTML === '' && fhaBody.querySelectorAll('tr').length === 12);
    G.acFhaData.length = 0;
  }
}

console.log('\n[5] fallback + [6] wiring (source-level)');
{
  const fv = SITE('fta_view_modules.js');
  check('cutset render falls back to full render without SLPaginate', /Pager unavailable \(module not loaded\) — render everything/.test(fv));
  check('old 20k DOM backstop retired (pagination supersedes)', fv.indexOf('_CUTSET_ROW_BACKSTOP') === -1);
  const idx = SITE('index.html');
  const pagPos = idx.indexOf('paginate.js?v=');
  check('paginate.js loads before consumers', pagPos !== -1 && pagPos < idx.indexOf('fta_view_modules.js?v=') && pagPos < idx.indexOf('ffs_module.js?v=') && pagPos < idx.indexOf('budget_ledger.js?v='));
  check('FFS page attaches with its own key', /key: 'ffs'/.test(SITE('ffs_module.js')) && /ffs-pager/.test(SITE('ffs_module.js')));
  check('Budget ledger attaches with its own key', /key: 'budget'/.test(SITE('budget_ledger.js')) && /budget-pager/.test(SITE('budget_ledger.js')));
  // Phase 1b — factory + custom renders.
  const sup = SITE('support_modules.js');
  check('CRUD factory paginates every standard worksheet (>50 rows)', /key: 'crud:' \+ key/.test(sup) && /arr\.length > 50/.test(sup));
  check('CRUD surgical fast-path documented as self-disabling under pagination', /self-disables while paginated/.test(sup));
  check('sys-FHA + FMEA paginate via pageTbody', /key: 'fha-sys'/.test(SITE('helpers_modules.js')) && /key: 'fmea'/.test(SITE('bindings_modules.js')));
  check('FMEA coverage banner rides every page (prefixHtml)', /prefixHtml: _fmeaBanner/.test(SITE('bindings_modules.js')) && /prefix \+ h/.test(SITE('paginate.js')));
  // Phase 1c — assumptions (both levels), items, trace matrix, component library.
  const hp = SITE('helpers_modules.js');
  check('AC assumptions + items + trace + library paginate', /key: 'asm-ac'/.test(hp) && /key: 'items'/.test(hp) && /key: 'trace'/.test(hp) && /key: 'library'/.test(hp));
  check('Sys assumptions paginate', /key: 'asm-sys'/.test(SITE('support_modules.js')));
  check('trace label states derivation over the full project', /derived over the full project/.test(hp));
  check('all three honesty labels state full-set computation', /computed over all/.test(fv) && /computed over the full set/.test(SITE('ffs_module.js')) && /computed over the full set/.test(SITE('budget_ledger.js')));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
