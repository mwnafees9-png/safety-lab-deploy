// CAD panels: no list is cut (13 Nov 2026). node tests/regression_cad_lists_20261113.test.js [siteDir]
// The clash results, the revision compare lists and a selection's part numbers show every entry, 50 to a page,
// with Previous and Next and "51 to 100 of 120"; a clash picked on page 2 keeps its own number; a new check starts on
// page 1. The duplicate ID messages (CAD zonal, model check MC-07) name every shared ID in plain words.
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = process.argv[2] || path.join(__dirname, '..', 'site');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 300) : '')); } };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function Viewer() {}
const root = { SLCadViewer: { Viewer, _pure: { esc, fmtMm: x => (+x).toFixed(1) + ' mm', unionBox: () => null } }, console };
vm.runInNewContext(fs.readFileSync(path.join(SITE, 'cad_viewer_panels.js'), 'utf8'), { window: root, globalThis: root, console, document: undefined });
const pane = () => ({ innerHTML: '', querySelector: () => null, querySelectorAll: () => [] });
const make = () => { const v = new Viewer(); v.$ = { pane: pane() }; v.order = ['p1']; v.metaBy = {}; v.sel = new Set(); v.opts = {}; v._exactReady = () => false; v._renderPane = function () { this._renderOtherPane(this.tab); }; return v; };
const click = (v, val) => v._otherPaneClick({ target: { getAttribute: k => k === 'data-scv-pg' ? val : null, hasAttribute: () => false, closest: () => null, matches: () => false } });
const ids = h => [...h.matchAll(/data-clash="(\d+)"/g)].map(m => +m[1]);

// clashes: 120 results
const v = make(); v.tab = 'clash';
const results = Array.from({ length: 120 }, (_, i) => ({ kind: 'clearance', pidA: 'A' + i, pidB: 'B' + i, distance: i }));
v._clash = { tol: 0, touch: 0.01, scope: 'all', setA: [], setB: [], job: { progress: 1, results } };
v._paneClash(); let h = v.$.pane.innerHTML;
check('clashes: page 1 shows the first 50 and says so', ids(h).length === 50 && ids(h)[0] === 0 && ids(h)[49] === 49 && /1 to 50 of 120/.test(h), ids(h).length);
check('clashes: no "more; narrow the check" anywhere', !/more; narrow/.test(h));
click(v, 'clash|1'); h = v.$.pane.innerHTML;
check('clashes: Next shows 51 to 100, each keeping its own number', ids(h)[0] === 50 && ids(h).length === 50 && /51 to 100 of 120/.test(h));
click(v, 'clash|2'); h = v.$.pane.innerHTML;
check('clashes: the last page holds the last 20; Next is off there', ids(h).length === 20 && ids(h)[19] === 119 && /data-scv-pg="clash\|3" disabled/.test(h));
v._clash.sel = 75; v._paneClash(); h = v.$.pane.innerHTML;
check('clashes: a clash picked elsewhere (number 76) opens on its page', ids(h).includes(75) && /51 to 100/.test(h));
v._clash.job = { progress: 1, results: results.slice(0, 60) }; v._clash.sel = null; v._paneClash(); h = v.$.pane.innerHTML;
check('clashes: a new check starts again on page 1', ids(h)[0] === 0 && /1 to 50 of 60/.test(h));
v._clash.job = { progress: 1, results: results.slice(0, 10) }; v._paneClash(); h = v.$.pane.innerHTML;
check('clashes: ten results, no pager', ids(h).length === 10 && !/scv-pager/.test(h));

// a selection's part numbers: 75 distinct
const w = make(); w.tab = 'props'; w.order = ['x']; w.sel = new Set(Array.from({ length: 75 }, (_, i) => 'q' + i)); w.metaBy = Object.fromEntries([...w.sel].map((p, i) => [p, { partNumber: 'PN-' + String(i).padStart(3, '0') }]));
w._paneProps(); h = w.$.pane.innerHTML;
check('part numbers: 50 on page 1 of 75 (was the first 30, silently)', (h.match(/PN-\d{3}/g) || []).length === 50 && /1 to 50 of 75/.test(h));
click(w, 'pns|1'); h = w.$.pane.innerHTML;
check('part numbers: page 2 holds the other 25, PN-074 among them', (h.match(/PN-\d{3}/g) || []).length === 25 && /PN-074/.test(h));

// the duplicate ID messages
const z = fs.readFileSync(path.join(SITE, 'cad_zonal.js'), 'utf8');
check('CAD zonal: every shared ID is named, in plain words', /dupIds\.join\(', '\)/.test(z) && !/dupIds\.slice\(0, 5\)/.test(z) && /Give each its own ID; until then this tree gets no zonal result/.test(z));
const mcp = path.join(SITE, 'model_checks.js');
if (fs.existsSync(mcp)) { const m = fs.readFileSync(mcp, 'utf8'); check('model check MC-07: every shared ID is named, in plain words', /d\.join\(', '\)/.test(m) && !/d\.slice\(0, 10\)/.test(m) && /Give each its own ID\./.test(m)); }
const pn = fs.readFileSync(path.join(SITE, 'cad_viewer_panels.js'), 'utf8');
check('compare lists: no silent cut at 500', !/list\.slice\(0, 500\)/.test(pn) && /'cmp:' \+ k/.test(pn));
console.log((fail ? 'FAILED' : 'ALL PASS') + ': ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
