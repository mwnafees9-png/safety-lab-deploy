#!/usr/bin/env node
/*
 * Regression: the Requirements exchange page draws every panel on it (22 Oct 2026).
 *
 * Found on a customer call: opening "Requirements exchange - Jama, Polarion, DOORS" drew only
 * the ReqIF part. The live Jama bridge (live_bridge.js) and the status-back box (status_back.js)
 * add themselves to this page by wrapping window.renderReqifPage, but reqif_import.js redrew the
 * page through its own local function, so the wrappers never ran and the Jama panel never
 * appeared. The earlier tests called window.renderReqifPage directly and passed.
 *
 * This test opens the page the way a person does (switchTab('reqif')), with the three real
 * modules loaded in the same order as index.html, and checks both panels are on the page; then
 * the same after "discard" on a ReqIF preview. It also pins the source rule: reqif_import.js
 * never calls its local renderReqifPage directly.
 *
 * Run: node tests/regression_reqif_page_panels_20261022.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');

// ---------------------------------------------------------------- a small DOM, enough for these pages
function makeDom() {
  const byId = new Map();
  function el(tag) {
    const e = {
      tagName: String(tag).toUpperCase(), id: '', style: {}, children: [], parentNode: null, _html: '',
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { (on ? this.add(c) : this.remove(c)); }, contains(c) { return this._s.has(c); } },
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); },
      get textContent() { return this._html; },
      set textContent(v) { this._html = String(v); },
      setAttribute(k, v) { if (k === 'id') { this.id = v; byId.set(v, this); } },
      appendChild(c) { return this.insertBefore(c, null); },
      insertBefore(c, ref) {
        c.parentNode = this;
        const i = ref ? this.children.indexOf(ref) : -1;
        if (i >= 0) this.children.splice(i, 0, c); else this.children.push(c);
        if (c.id) byId.set(c.id, c);
        return c;
      },
      querySelector(sel) {
        const m = /^#([\w-]+)$/.exec(sel); if (!m) return null;
        const f = byId.get(m[1]); let p = f; while (p) { if (p === this) return f; p = p.parentNode; } return null;
      },
      addEventListener() {}, removeEventListener() {},
    };
    let _id = '';
    Object.defineProperty(e, 'id', { get() { return _id; }, set(v) { _id = v; if (v) byId.set(v, e); } });
    return e;
  }
  const body = el('body');
  const view = el('div'); view.id = 'view-reqif'; body.appendChild(view);
  const host = el('div'); host.id = 'reqif-host'; view.appendChild(host);
  const nav = el('a'); nav.id = 'snav-reqif'; body.appendChild(nav);
  const document = {
    readyState: 'complete', body,
    getElementById: id => { const e = byId.get(id); if (!e) return null; let p = e; while (p) { if (p === body) return e; p = p.parentNode; } return null; },
    createElement: el, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  };
  return { document, view, host };
}

function load() {
  const dom = makeDom();
  const sandbox = {
    console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    document: dom.document, navigator: { userAgent: 'node' }, location: { href: 'app://local/index.html', protocol: 'app:' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    projectConfig: {}, acReqData: [], acFunctionsData: [], acFhaData: [], systemsData: [],
    showToast() {}, slAlert() {}, slConfirm: () => Promise.resolve(true), esc: s => String(s == null ? '' : s),
    commitSaveChanges() {}, scheduleAutosave() {},
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  let switched = [];
  sandbox.switchTab = function (t) { switched.push(t); };
  vm.createContext(sandbox);
  const errs = [];
  // same order as index.html
  ['site/func_tree.js', 'site/jama_tree.js', 'site/reqif_import.js', 'site/status_back.js', 'site/live_bridge.js'].forEach(f => {
    try { vm.runInContext(read(f), sandbox, { filename: f }); } catch (e) { errs.push(f + ': ' + e.message); }
  });
  return { sandbox, dom, errs, switched };
}

console.log('\n[reqif page] opening the page draws every panel on it');
{
  const { sandbox, dom, errs, switched } = load();
  check('the three modules load in index.html order without error', errs.length === 0, errs.join(' | '));
  check('the ReqIF module and both add-on modules wrapped the page renderer',
    sandbox.renderReqifPage && sandbox.renderReqifPage._lbWrapped === true);
  sandbox.switchTab('reqif');
  check('the original switchTab still ran', switched[0] === 'reqif');
  const d = dom.document;
  check('the ReqIF part is drawn', /Open \.reqif file/.test(dom.host.innerHTML));
  const bridge = d.getElementById('bridge-panel');
  check('the live Jama bridge panel is on the page', !!bridge, 'no #bridge-panel after switchTab(reqif)');
  check('it is the Jama bridge, with its Check Jama now button', !!bridge && /Live bridge, Jama/.test(bridge.innerHTML) && /Check Jama now/.test(bridge.innerHTML));
  const sb = d.getElementById('statusback-panel');
  check('the status-back box is on the page', !!sb && /Status-back/.test(sb.innerHTML));
  check('the bridge sits above the ReqIF part, on the same page',
    !!bridge && bridge.parentNode === dom.view && dom.view.children.indexOf(bridge) < dom.view.children.indexOf(dom.host));
  // a second visit redraws, never duplicates
  sandbox.switchTab('reqif');
  check('a second visit does not add a second bridge panel', dom.view.children.filter(c => c.id === 'bridge-panel').length === 1);
}

console.log('\n[reqif page] every other redraw keeps the panels');
{
  const { sandbox, dom } = load();
  sandbox.reqifDiscard();
  check('discarding a ReqIF preview redraws through the wrappers (bridge panel present)', !!dom.document.getElementById('bridge-panel'));
  check('and the status-back box', !!dom.document.getElementById('statusback-panel'));
}

console.log('\n[reqif page] source rule');
{
  const src = read('site/reqif_import.js');
  const body = src.replace(/function renderReqifPage\s*\(/, '').replace(/window\.renderReqifPage/g, '');
  const local = (body.match(/(^|[^.\w])renderReqifPage\s*\(\s*\)/g) || []).length;
  check('reqif_import.js never redraws through its local renderReqifPage (only via window.renderReqifPage)', local === 0, local + ' direct call(s)');
  const idx = read('site/index.html');
  check('index.html loads reqif_import.js v1.5 before status_back.js and live_bridge.js',
    /reqif_import\.js\?v=1\.5/.test(idx) && idx.indexOf('reqif_import.js') < idx.indexOf('status_back.js') && idx.indexOf('status_back.js') < idx.indexOf('live_bridge.js'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
