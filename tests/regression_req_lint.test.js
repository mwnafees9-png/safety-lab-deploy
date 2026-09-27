#!/usr/bin/env node
/*
 * Regression — the requirement wording check (27 Sep 2026, OPEN_ITEMS Q8).
 *
 *   E1  the check: one "shall" passes; none and two are flagged; each word list
 *       fires on its word (whole words only, any case, phrases across spaces);
 *       "is / are / was" is a statement of fact only when there is no "shall";
 *       an empty statement has no finding; "shall not" is one shall
 *   E2  stores: live rows only (deleted, archived, obsolete skipped), aircraft and
 *       system, references by id or REQ-internalId; INV-63 counts and names
 *   E3  table chip: one chip in the statement cell with the count and the texts,
 *       rows decorated once, clean rows get none, the observer covers the pager;
 *       the summary line above the table counts the statements needing a look and
 *       turns green when all pass
 *   E4  the form: EARS buttons and the live line are installed once under the
 *       statement field; the five templates carry our wording; an empty field
 *       takes the template, a filled one asks for a second click; typing refreshes
 *       the line; the line says when a statement reads clean
 *   E5  wiring: loaded right after crew_credit.js, no eval, module exports
 * Run: node tests/regression_req_lint.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('req_lint.js'), IDX = read('index.html');

function El(tag) { this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.innerHTML = ''; this.value = ''; this.style = {}; this.parentNode = null; this.listeners = {}; }
El.prototype.getAttribute = function (k) { return this.attrs[k] == null ? null : this.attrs[k]; };
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.insertAdjacentHTML = function (_, h) { this.innerHTML += h; };
El.prototype.querySelectorAll = function (sel) { if (sel === 'tr') return this.children.filter(c => c.tagName === 'TR'); if (sel === 'td') return this.children.filter(c => c.tagName === 'TD'); return []; };
El.prototype.insertBefore = function (n, ref) { const i = this.children.indexOf(ref); n.parentNode = this; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); return n; };
El.prototype.addEventListener = function (k, f) { this.listeners[k] = f; };
El.prototype.focus = function () {};
function makeDoc() {
    const byId = {};
    const created = tag => { const e = new El(tag); Object.defineProperty(e, 'id', { get() { return e._id; }, set(v) { e._id = v; byId[v] = e; } }); return e; };
    return { getElementById: id => byId[id] || null, createElement: created, el: (tag, id) => { const e = created(tag); if (id) e.id = id; return e; } };
}
function reqRow(iid) { const tr = new El('tr'); tr.attrs['data-iid'] = String(iid); for (let i = 0; i < 8; i++) tr.children.push(new El('td')); return tr; }
function load(model, extra) {
    const toasts = [];
    const sb = Object.assign({ console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, setTimeout: () => 0, showToast: m => toasts.push(m), _toasts: toasts }, model, extra || {});
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    vm.createContext(sb); vm.runInContext(SRC, sb, { filename: 'req_lint.js' }); return sb;
}
const req = (iid, text, extra) => Object.assign({ internalId: iid, type: 'Safety', text, rat: 'why' }, extra || {});

// ---- E1 the check --------------------------------------------------------------------
{
    const L = load({}).SLReqLint;
    const codes = t => L.lint(t).findings.map(f => f.code).sort().join(',');
    check('E1: one "shall" in an EARS sentence passes', codes('When the gear is down, the system shall annunciate the state.') === '' && L.ok('The pump shall deliver 3 bar.'));
    check('E1: no "shall" is flagged, with the statements of fact beside it', codes('The pump is capable of 3 bar.') === 'fact,no-shall,vague');
    check('E1: two "shall"s are flagged once', codes('The pump shall start and the valve shall open.') === 'many-shall' && L.lint('The pump shall start and the valve shall open.').shallCount === 2);
    check('E1: "shall not" is one shall', L.lint('The system shall not open the valve.').shallCount === 1 && codes('The system shall not open the valve.') === '');
    const words = { 'let-out': ['except', 'unless', 'although', 'not limited to'], hedge: ['usually', 'generally', 'often', 'normally'], possibility: ['may', 'might', 'should', 'ought'], vague: ['as appropriate', 'capable of'], pronoun: ['this', 'these'] };
    const bad = [];
    Object.keys(words).forEach(code => words[code].forEach(w => { const c = codes('The system shall act ' + w + ' now.'); if (c !== code) bad.push(w + '→' + c); }));
    check('E1: every listed word fires its own rule', bad.length === 0, bad.join(' '));
    check('E1: whole words only, any case', codes('The Mayday call shall be sent; the thistle shall not.') === 'many-shall' && codes('The system SHALL act, EXCEPT on ground.') === 'let-out' && codes('The system shall act, Not Limited To flight.') === 'let-out');
    check('E1: a phrase across a line break still counts', codes('The system shall be capable\nof 3 bar.') === 'vague');
    check('E1: "is" inside a shall sentence is not a statement of fact; "these" still is a pronoun', codes('While the aircraft is airborne, the system shall log these events.') === 'pronoun');
    check('E1: an empty or blank statement has no finding', codes('') === '' && codes('   ') === '' && codes(null) === '');
    check('E1: finding texts explain the fix', /split into one requirement per statement/.test(L.lint('a shall b shall c').findings[0].text) && /name the thing/.test(L.lint('The system shall do this.').findings[0].text) && /a requirement says shall/.test(L.lint('The system shall and may act.').findings[0].text));
}

// ---- E2 stores + INV ----------------------------------------------------------------
{
    const rows = [req(1, 'The system shall act.'), req(2, 'The system shall and may act.'), req(3, 'The system may act.', { deleted: true }), req(4, 'The system may act.', { status: 'archived' }), req(5, 'The system may act.', { reqSource: { obsolete: true } }), req(6, 'It is on.', { id: 'REQ-U-6' })];
    const sb = load({ acReqData: rows, systemsData: [{ id: 'S1', name: 'Sys', req: [req(9, 'The pump shall and should run.')] }], activeSystemId: 'S1' });
    const L = sb.SLReqLint;
    const f = L.findingsAll();
    check('E2: live rows only, both stores, referenced by id or REQ-internalId', f.map(x => x.ref).join(',') === 'REQ-2,REQ-U-6,REQ-9' && f[2].label === 'Sys');
    const inv = L.INV.run();
    check('E2: INV-63 is advisory, counts live rows and names the failures', L.INV.id === 'INV-63' && L.INV.sev === 'advisory' && inv.checked === 4 && inv.failCount === 3 && /^Aircraft REQ-2: possibility word "may"/.test(inv.fails[0]), JSON.stringify(inv));
    check('E2: storeFor resolves the active system', L.storeFor('sys').scope === 'sys-S1' && L.storeFor('ac').scope === 'ac' && L.storeFor('sys-ZZ') === null);
}

// ---- E3 table chip + summary -------------------------------------------------------
{
    const rows = [req(1, 'The system shall act.'), req(2, 'The system shall act, and may act, except on ground.'), req(3, 'It is on.')];
    const sb = load({ acReqData: rows, systemsData: [] }, { setTimeout: f => { f(); return 0; } });
    const L = sb.SLReqLint;
    const doc = makeDoc(); sb.document = doc;
    const cbs = {}; sb.MutationObserver = function (f) { this.observe = el => { cbs[el.id] = f; }; };
    const wrap = doc.el('div', 'wrap'); const table = doc.el('table', 'ac-req-table'); wrap.children.push(table); table.parentNode = wrap;
    const body = doc.el('tbody', 'ac-req-body'); doc.el('tbody', 'sys-req-body');
    rows.forEach(r => body.children.push(reqRow(r.internalId)));
    check('E3: every row is decorated once', L.decorateTable('ac') === 3 && L.decorateTable('ac') === 0);
    const st = i => body.children[i].children[4].innerHTML;
    check('E3: a clean row gets no chip', st(0) === '' && body.children[0].getAttribute('data-rl-n') === '0');
    check('E3: a row with findings gets one chip with the count and the texts', /wording 2</.test(st(1)) && /possibility word/.test(st(1)) && /let-out/.test(st(1)) && (st(1).match(/data-rl-chip/g) || []).length === 1 && /wording 2</.test(st(2)));
    check('E3: the summary line sits before the table and counts the statements needing a look', wrap.children[0].id === 'rl-summary-ac' && /2 of 3 statements need a look/.test(wrap.children[0].innerHTML) && /#9A6200/.test(wrap.children[0].innerHTML));
    rows[1].text = 'The system shall act.'; rows[2].text = 'The system shall be on.';
    L.renderSummary('ac');
    check('E3: with everything clean the summary turns green', /all 3 statements read as one testable "shall"/.test(wrap.children[0].innerHTML) && /#1D9E75/.test(wrap.children[0].innerHTML) && wrap.children.length === 2);
    check('E3: the two bodies are watched once', L.watchTables() === true && L.watchTables() === false);
    rows.push(req(4, 'The system shall or might act.')); body.children.push(reqRow(4));
    cbs['ac-req-body']([]);
    check('E3: a row drawn by the pager is decorated on the next tick', body.children[3].getAttribute('data-rl') === '1' && /wording 1</.test(body.children[3].children[4].innerHTML));
}

// ---- E4 the form -------------------------------------------------------------------------
{
    const sb = load({ acReqData: [], systemsData: [] });
    const L = sb.SLReqLint;
    const doc = makeDoc(); sb.document = doc;
    const box = doc.el('div', 'box'); const input = doc.el('input', 'ac-req-text'); const after = doc.el('label', 'after'); box.children.push(input, after); input.parentNode = box; after.parentNode = box; input.nextSibling = after;
    check('E4: the buttons and the live line install once, under the field, in that order', L.installField('ac-req') === true && L.installField('ac-req') === false && box.children.map(c => c.id).join(',') === 'ac-req-text,rl-ears-ac-req,rl-field-ac-req,after');
    const ears = doc.getElementById('rl-ears-ac-req').innerHTML;
    check('E4: the five EARS patterns are offered', ['Ubiquitous', 'While', 'When', 'Where', 'If, then'].every(l => ears.indexOf('>' + l + '<') >= 0) && (ears.match(/applyEars\('ac-req'/g) || []).length === 5);
    check('E4: the templates are our wording of the five patterns, each with one shall', L.EARS.every(t => L.lint(t.text).shallCount === 1) && L.EARS.map(t => t.id).join(',') === 'ubiquitous,while,when,where,if' && /^If <unwanted condition>, then the <system> shall <response>\.$/.test(L.EARS[4].text));
    check('E4: an empty field takes the template and the live line updates', L.applyEars('ac-req', 'when') === true && input.value === 'When <trigger>, the <system> shall <response>.' && doc.getElementById('rl-field-ac-req').innerHTML.length > 0);
    input.value = 'The system may act.';
    check('E4: a filled field is not overwritten on the first click, a toast explains, the second click replaces', L.applyEars('ac-req', 'while') === false && input.value === 'The system may act.' && /Click While again/.test(sb._toasts[0]) && L.applyEars('ac-req', 'while') === true && /^While <state>/.test(input.value));
    input.value = 'The system may act.'; input.listeners.input();
    check('E4: typing refreshes the live line with the findings', /possibility word &quot;may&quot;/.test(doc.getElementById('rl-field-ac-req').innerHTML));
    input.value = 'The system shall act.'; input.listeners.input();
    check('E4: a clean statement is told so; an empty one shows nothing', /Reads as one testable/.test(doc.getElementById('rl-field-ac-req').innerHTML) && (input.value = '', input.listeners.input(), doc.getElementById('rl-field-ac-req').innerHTML === ''));
    check('E4: an unknown pattern or a missing field is refused', L.applyEars('ac-req', 'nope') === false && L.applyEars('sys-req', 'when') === false);
}

// ---- E5 wiring ---------------------------------------------------------------------------
{
    check('E5: req_lint.js is loaded right after crew_credit.js', /crew_credit\.js\?v=[\d.]+" defer><\/script>\s*(<!--[^>]*-->\s*)?<script src="req_lint\.js\?v=[\d.]+" defer><\/script>/.test(IDX));
    check('E5: no eval or Function constructor', !/\beval\s*\(/.test(SRC) && !/new Function\s*\(/.test(SRC));
    check('E5: module exports the API', /module\.exports = api/.test(SRC) && /root\.SLReqLint = api/.test(SRC));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
