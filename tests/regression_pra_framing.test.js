#!/usr/bin/env node
/*
 * Regression — PRA survivability framing (27 Sep 2026, OPEN_ITEMS Q11; ARP4761A App L).
 *
 *   F1  nature: every catalogue entry maps to proximity / trajectory / environmental /
 *       structural (none unclassified); a row is classified by its catalogue ref, then
 *       by the words in its threat name; the four groups render in the browser strip
 *       with click-through, and the row pill names the nature
 *   F2  minimization: a row whose scenario is classified Catastrophic (worst linked
 *       failure condition, the real pra_scenarios.js) and accepted or open owes an
 *       argument; one marked not acceptable does not; a Hazardous scenario does not;
 *       an N/A row does not; the argument on record turns the status ok; INV-64
 *       counts the rows that keep a Catastrophic scenario and names the gaps
 *   F3  the form: the framing paragraph is inserted after the page hint once; the
 *       minimization field goes under the mitigation field once; the gate refuses to
 *       log an edited row that keeps a Catastrophic scenario with an empty argument,
 *       lets a new row through, lets a filled argument through; the wrapped submit
 *       stores the argument on the edited row or the newly added row only, and a
 *       refused original save writes nothing; edit restores the argument into the field
 *   F4  the table: the nature pill sits by Threat Source, the badge by Mitigation
 *       (needed / minimized / none), rows decorated once, observer covers redraws;
 *       the catalogue browser wrapper adds the nature strip after the intro paragraph
 *   F5  wiring: loaded right after req_lint.js, no eval, module exports, the framing
 *       text says probability 1 and cites Appendix L
 * Run: node tests/regression_pra_framing.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('pra_framing.js'), SCN = read('pra_scenarios.js'), CAT = read('catalogue_data.js'), IDX = read('index.html');

function El(tag) { this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.innerHTML = ''; this.value = ''; this.style = {}; this.parentNode = null; this.focused = false; }
El.prototype.getAttribute = function (k) { return this.attrs[k] == null ? null : this.attrs[k]; };
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.insertAdjacentHTML = function (pos, h) { if (pos === 'afterend' && this.parentNode) { this.parentNode.afterHtml = (this.parentNode.afterHtml || '') + h; } else this.innerHTML += h; };
El.prototype.querySelectorAll = function (sel) { if (sel === 'tr') return this.children.filter(c => c.tagName === 'TR'); if (sel === 'td') return this.children.filter(c => c.tagName === 'TD'); return []; };
El.prototype.querySelector = function (sel) { if (sel === '.cfg-hint') return this.children.find(c => c.cls === 'cfg-hint') || null; if (sel === 'p') return this.children.find(c => c.tagName === 'P') || null; return null; };
El.prototype.insertBefore = function (n, ref) { const i = this.children.indexOf(ref); n.parentNode = this; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); return n; };
El.prototype.focus = function () { this.focused = true; };
function makeDoc() {
    const byId = {};
    const created = tag => { const e = new El(tag); Object.defineProperty(e, 'id', { get() { return e._id; }, set(v) { e._id = v; byId[v] = e; } }); return e; };
    return { getElementById: id => byId[id] || null, createElement: created, el: (tag, id) => { const e = created(tag); if (id) e.id = id; return e; } };
}
function praRow(iid) { const tr = new El('tr'); tr.attrs['data-iid'] = String(iid); for (let i = 0; i < 10; i++) tr.children.push(new El('td')); return tr; }
function load(model, extra) {
    const toasts = [];
    const sb = Object.assign({ console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, setTimeout: () => 0, showToast: (m, k) => toasts.push({ m, k }), _toasts: toasts, scheduleAutosave: () => {} }, model, extra || {});
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    vm.createContext(sb);
    vm.runInContext(CAT, sb, { filename: 'catalogue_data.js' });
    vm.runInContext(SCN, sb, { filename: 'pra_scenarios.js' });
    vm.runInContext(SRC, sb, { filename: 'pra_framing.js' });
    return sb;
}
const fc = (iid, sev) => ({ internalId: iid, fcId: 'FC-' + iid, severity: sev, subId: 'SF-1' });
const pra = (iid, extra) => Object.assign({ internalId: iid, praId: 'PRA-' + iid, threat: 'Rotorburst / Engine Non-Containment', affectedZones: ['Z1'], scenarios: [], minimization: '' }, extra || {});
const scn = (id, fcIds, acceptable) => ({ scnId: id, affected: ['SF-1'], fcIds, effect: 'x', acceptable, rationale: '' });
const base = () => ({ acFhaData: [fc(1, 'Catastrophic'), fc(2, 'Hazardous')], zsaData: [], praData: [], acFunctionsData: [], systemsData: [], acAssumptionsData: [], editStates: { pra: null } });

// ---- F1 nature -----------------------------------------------------------------------
{
    const sb = load(base()); const P = sb.SLPraFraming;
    const cat = vm.runInContext('PARTICULAR_RISK_CATALOGUE', sb);   // a top-level const: visible to later scripts, not a window property
    const g = P.grouped(cat);
    check('F1: every catalogue entry has a nature, none unclassified', cat.length >= 20 && g[''].length === 0 && g.proximity.length && g.trajectory.length && g.environmental.length && g.structural.length, JSON.stringify(Object.keys(g).map(k => k + ':' + g[k].length)));
    check('F1: the known ones land where the analysis puts them', P.natureOf('rotor-burst') === 'trajectory' && P.natureOf('engine-fire') === 'proximity' && P.natureOf('lightning') === 'environmental' && P.natureOf('rapid-decompression') === 'structural' && P.natureOf('bird-strike') === 'trajectory');
    check('F1: a row is classified by its catalogue ref first, then by the words in its threat', P.natureOf({ prCatalogueRef: 'hirf', threat: 'Rotorburst' }) === 'environmental' && P.natureOf({ threat: 'Tire Burst / Flailing Tread' }) === 'trajectory' && P.natureOf({ threat: 'Fuel leak onto hot duct' }) === 'proximity' && P.natureOf({ threat: 'Something else' }) === '');
    const strip = P.natureStripHtml(cat);
    check('F1: the browser strip shows the four groups with click-through to the catalogue entry', ['Proximity', 'Trajectory', 'Environmental', 'Structural'].every(l => strip.indexOf('<b>' + l + '</b>') >= 0) && /selectPRCatalogueEntry\('rotor-burst'\)/.test(strip) && !/Unclassified/.test(strip));
    check('F1: the row pill names the nature, none for an unknown threat', /data-pf-nature="trajectory"[^>]*>Trajectory</.test(P.naturePill(pra(1))) && P.naturePill({ threat: 'Something else' }) === '');
}

// ---- F2 minimization ------------------------------------------------------------------
{
    const m = base();
    const rows = [pra(1, { scenarios: [scn('S1', [1], 'yes')] }), pra(2, { scenarios: [scn('S1', [1], 'open')] }), pra(3, { scenarios: [scn('S1', [1], 'no')] }), pra(4, { scenarios: [scn('S1', [2], 'yes')] }),
                  pra(5, { scenarios: [scn('S1', [1], 'yes')], disposition: 'na' }), pra(6, { scenarios: [scn('S1', [1], 'yes'), scn('S2', [1], 'yes')], minimization: 'Runs routed outside the band; one run exposed.' }), pra(7)];
    m.praData = rows;
    const sb = load(m); const P = sb.SLPraFraming;
    const k = i => P.status(rows[i]).kind;
    check('F2: an accepted Catastrophic scenario with no argument is a gap; an open one too', k(0) === 'gap' && k(1) === 'gap' && /PRA-1: 1 Catastrophic scenario kept \(S1\) with no minimization argument/.test(P.status(rows[0]).text));
    check('F2: not acceptable (design change pending), Hazardous, N/A and no scenarios owe nothing', k(2) === 'none' && k(3) === 'none' && k(4) === 'na' && k(6) === 'none');
    check('F2: an argument on record is ok and counts the kept scenarios', k(5) === 'ok' && /2 Catastrophic scenarios/.test(P.status(rows[5]).text) && P.catScenarios(rows[5]).length === 2);
    const inv = P.INV.run();
    check('F2: INV-64 is advisory, counts the rows that keep a Catastrophic scenario and names the gaps', P.INV.id === 'INV-64' && P.INV.sev === 'advisory' && inv.checked === 3 && inv.failCount === 2 && /^PRA-1:/.test(inv.fails[0]) && /^PRA-2:/.test(inv.fails[1]), JSON.stringify(inv));
    check('F2: badges: needed / minimized / none', /minimization argument needed/.test(P.badgeHtml(rows[0])) && /data-pf-badge="ok"/.test(P.badgeHtml(rows[5])) && /Runs routed/.test(P.badgeHtml(rows[5])) && P.badgeHtml(rows[6]) === '' && P.badgeHtml(rows[3]) === '');
}

// ---- F3 the form ---------------------------------------------------------------------------
{
    const m = base();
    const rows = [pra(1, { scenarios: [scn('S1', [1], 'yes')] })];
    m.praData = rows;
    const sb = load(m); const P = sb.SLPraFraming;
    const doc = makeDoc(); sb.document = doc;
    const view = doc.el('div', 'view-pra'); const hint = doc.el('p'); hint.cls = 'cfg-hint'; const nextEl = doc.el('div', 'after-hint'); view.children.push(hint, nextEl); hint.parentNode = view; nextEl.parentNode = view; hint.nextSibling = nextEl;
    check('F3: the framing paragraph is inserted right after the page hint, once', P.installFraming() === true && P.installFraming() === false && view.children.length === 3 && (view.children[1].id === 'pf-framing') && /probability 1/.test(P.framingHtml()));
    const box = doc.el('div', 'box'); const mit = doc.el('input', 'pra-mitigation'); const tail = doc.el('div', 'tail'); box.children.push(mit, tail); mit.parentNode = box; tail.parentNode = box; mit.nextSibling = tail;
    check('F3: the minimization field goes under the mitigation field, once', P.installField() === true && P.installField() === false && box.children.map(c => c.id || c.tagName).join(',') === 'pra-mitigation,LABEL,pra-minimization,tail');
    const field = doc.getElementById('pra-minimization');
    // the gate
    sb.editStates.pra = 1; field.value = '';
    check('F3: editing a row that keeps a Catastrophic scenario with an empty argument is refused, the field focused, the reason shown', P.formOk() === false && field.focused && /keeps a Catastrophic scenario/.test(sb._toasts[0].m));
    field.value = 'Argument.';
    check('F3: a filled argument passes; a new row passes; a row without a Catastrophic scenario passes', P.formOk() === true && (sb.editStates.pra = null, field.value = '', P.formOk() === true) && (rows.push(pra(2)), sb.editStates.pra = 2, P.formOk() === true));
    // the wrapped submit
    let calls = 0;
    sb.submitPRA = function () { calls++; if (sb.editStates.pra == null && sb._addOnSubmit) sb.praData.push(pra(sb.praData.length + 1)); };
    check('F3: submit and edit wrap once', P._wrapSubmit() === true && P._wrapSubmit() === false && (sb.editPRA = function () {}, P._wrapEdit() === true && P._wrapEdit() === false));
    sb.editStates.pra = 1; field.value = 'Fragments cannot be contained; the runs are separated.';
    sb.submitPRA();
    check('F3: the argument is stored on the edited row and the field cleared', calls === 1 && rows[0].minimization === 'Fragments cannot be contained; the runs are separated.' && field.value === '' && P.status(rows[0]).kind === 'ok');
    sb.editStates.pra = null; field.value = 'new row argument'; sb._addOnSubmit = true;
    sb.submitPRA();
    check('F3: a new row gets the argument from the field', calls === 2 && rows[rows.length - 1].minimization === 'new row argument');
    sb._addOnSubmit = false; field.value = 'stray'; const lastBefore = rows[rows.length - 1].minimization;
    sb.submitPRA();
    check('F3: a refused original save writes nothing onto the last row', calls === 3 && rows[rows.length - 1].minimization === lastBefore);
    sb.editStates.pra = 1; field.value = '';
    sb.submitPRA();
    check('F3: the gate stops the original submit', calls === 3);
    sb.editPRA(1);
    check('F3: edit restores the argument into the field', field.value === 'Fragments cannot be contained; the runs are separated.');
}

// ---- F4 the table + browser ------------------------------------------------------------------
{
    const m = base();
    const rows = [pra(1, { scenarios: [scn('S1', [1], 'yes')] }), pra(2, { scenarios: [scn('S1', [1], 'yes')], minimization: 'ok' }), pra(3, { threat: 'Lightning Strike', prCatalogueRef: 'lightning' })];
    m.praData = rows;
    const sb = load(m, { setTimeout: f => { f(); return 0; } }); const P = sb.SLPraFraming;
    const doc = makeDoc(); sb.document = doc;
    let cb = null; sb.MutationObserver = function (f) { cb = f; this.observe = () => {}; };
    const body = doc.el('tbody', 'pra-body'); rows.forEach(r => body.children.push(praRow(r.internalId)));
    check('F4: rows decorated once', P.decorateTable() === 3 && P.decorateTable() === 0);
    const c = (i, j) => body.children[i].children[j].innerHTML;
    check('F4: the nature pill sits by Threat Source and the badge by Mitigation', /Trajectory/.test(c(0, 2)) && /minimization argument needed/.test(c(0, 8)) && /data-pf-badge="ok"/.test(c(1, 8)) && /Environmental/.test(c(2, 2)) && c(2, 8) === '');
    check('F4: the observer is installed once and decorates redrawn rows', P._observe() === true && P._observe() === false && (body.children.push(praRow(1)), cb([]), body.children[3].getAttribute('data-pf') === '1' && /Trajectory/.test(body.children[3].children[2].innerHTML)));
    // browser wrapper
    const ov = doc.el('div', '_prCatOverlay'); const p = doc.el('p'); ov.children.push(p); p.parentNode = ov;
    sb.openPRCatalogueBrowser = function () { sb._opened = (sb._opened || 0) + 1; };
    check('F4: the catalogue browser wrapper installs once and adds the nature strip after the intro paragraph', P._wrapBrowser() === true && P._wrapBrowser() === false && (sb.openPRCatalogueBrowser(), sb._opened === 1 && /data-pf-natures="1"/.test(ov.afterHtml || '') && /Trajectory/.test(ov.afterHtml)));
    let rendered = 0; sb.renderPRA = () => { rendered++; };
    check('F4: renderPRA is wrapped once and still runs', P._wrapRender() === true && P._wrapRender() === false && (sb.renderPRA(), rendered === 1));
}

// ---- F5 wiring -------------------------------------------------------------------------------------
{
    check('F5: pra_framing.js is loaded right after req_lint.js', /req_lint\.js\?v=[\d.]+" defer><\/script>\s*(<!--[^>]*-->\s*)?<script src="pra_framing\.js\?v=[\d.]+" defer><\/script>/.test(IDX));
    check('F5: no eval or Function constructor', !/\beval\s*\(/.test(SRC) && !/new Function\s*\(/.test(SRC));
    check('F5: module exports the API', /module\.exports = api/.test(SRC) && /root\.SLPraFraming = api/.test(SRC));
    const F = load(base()).SLPraFraming.FRAMING;
    check('F5: the framing says taken as certain, probability 1, survivability, and cites Appendix L', /taken as certain/.test(F) && /probability 1/.test(F) && /continued safe flight and landing survives/.test(F) && /ARP4761A Appendix L/.test(F) && !/probability times/.test(F));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
