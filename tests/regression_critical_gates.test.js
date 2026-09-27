#!/usr/bin/env node
/*
 * Regression — the critical AND-gate test that scopes the common mode analysis
 * (26 Sep 2026, OPEN_ITEMS Q7; ARP4761A Appendix M scoping).
 *
 *   C1  the two tests, on the REAL BDD engine (fta_engine.js): a gate whose loss
 *       of independence breaks the budget as OR is critical; one that breaks it
 *       only as certain is critical; one that breaks it neither way is not;
 *       the top-event gate taken as certain is P = 1; every AND-family gate is
 *       tested (AND, INHIBIT, PAND, SPARE), OR/VOTING/XOR gates are not, and a
 *       gate with one input is not
 *   C2  the objective: the strictest target among the linked failure conditions;
 *       a tree with no linked condition, or one whose severity has no
 *       quantitative target, is not tested; the real tree is never mutated
 *   C3  transfers are inlined (a gate on the destination page is tested against
 *       the source condition's budget), a missing destination is a P = 0 leaf,
 *       a transfer loop does not hang; leaves keep their CCF beta
 *   C4  review: a non-suggested CMA linking the gate key counts, a suggested one
 *       does not; findings name only critical, unreviewed gates; INV-58 runs
 *   C5  surfaces: the CMA panel lists critical gates first with "Needs review"
 *       and the review button, "show all" lists the rest; the Golden Thread
 *       stage is inserted before the Common cause stage by the wrapper and says
 *       CHECK when a critical gate is unreviewed; startReview ticks the gate's
 *       checkbox and names the claim; renderCMA is wrapped
 *   C6  wiring: loaded right after qual_arg.js, no eval, module exports
 * Run: node tests/regression_critical_gates.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('critical_gates.js'), ENGINE = read('fta_engine.js'), IDX = read('index.html');

const TARGET = { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: null };
let nid = 100;
const leaf = (p, extra) => Object.assign({ id: ++nid, type: 'basic', probability: p, name: 'E' + nid }, extra || {});
const gate = (gt, kids, extra) => Object.assign({ id: ++nid, type: 'gate', gateType: gt, children: kids, displayId: 'G-' + (nid), name: '' }, extra || {});

function load(model, extra) {
    const sb = Object.assign({ console, Math, JSON, Object, Array, String, Number, Date, Map, Set, isFinite, setTimeout: () => 0 }, model, extra || {});
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    sb.getSafetyTarget = sev => ({ prob: TARGET[sev] === undefined ? null : TARGET[sev], dal: 'A' });
    vm.createContext(sb);
    vm.runInContext(ENGINE, sb, { filename: 'fta_engine.js' });
    vm.runInContext(SRC, sb, { filename: 'critical_gates.js' });
    return sb;
}
const fc = (id, sev) => ({ internalId: id, fcId: 'FC-' + id, fcDesc: 'cond ' + id, severity: sev });

// ---- C1 the two tests ----------------------------------------------------------------
{
    const A = leaf(1e-5), B = leaf(1e-5);
    const gOnly = gate('AND', [A, B]);                                        // top: 1e-10 ok; as OR 2e-5 breaks
    const D = leaf(1e-7), gInner1 = gate('AND', [leaf(1e-3), leaf(1e-3)]), gOuter1 = gate('AND', [gInner1, D]);   // inner as OR 2e-10 ok; certain 1e-7 breaks
    const D2 = leaf(1e-10), gInner2 = gate('AND', [leaf(1e-3), leaf(1e-3)]), gOuter2 = gate('AND', [gInner2, D2]); // inner as OR 2e-13 ok; certain 1e-10 ok -> not critical
    const gInh = gate('INHIBIT', [leaf(1e-5), leaf(1e-5)]), gPand = gate('PAND', [leaf(1e-5), leaf(1e-5)]), gSpare = gate('SPARE', [leaf(1e-5), leaf(1e-5)]);
    const gOr = gate('OR', [leaf(1e-12), leaf(1e-12)]), gVote = gate('VOTING', [leaf(1e-5), leaf(1e-5), leaf(1e-5)], { votingK: 2 }), gOne = gate('AND', [leaf(1e-12)]);
    const top = gate('OR', [gOnly, gOuter1, gOuter2, gInh, gPand, gSpare, gOr, gVote, gOne]);
    const page = { id: 'p1', name: 'Tree one', root: top, linkedFhaIds: [1] };
    const sb = load({ ftaPages: [page], acFhaData: [fc(1, 'Catastrophic')], systemsData: [], cmaData: [] });
    const res = sb.SLCriticalGates.analyzePage(page);
    const by = id => res.gates.find(g => g.nodeId === id);
    check('C1: objective is the Catastrophic target', res.target === 1e-9);
    check('C1: baseline P(top) inside the objective', res.pTop != null && res.pTop <= 1e-9, String(res.pTop));
    check('C1: a gate that breaks the budget as OR is critical', by(gOnly.id) && by(gOnly.id).critical && by(gOnly.id).orBreaks, JSON.stringify(by(gOnly.id)));
    check('C1: a gate that breaks the budget only as certain is critical', by(gInner1.id) && by(gInner1.id).critical && !by(gInner1.id).orBreaks && by(gInner1.id).certainBreaks, JSON.stringify(by(gInner1.id)));
    check('C1: a gate that breaks it neither way is not critical', by(gInner2.id) && !by(gInner2.id).critical, JSON.stringify(by(gInner2.id)));
    check('C1: INHIBIT, PAND and SPARE are tested', [gInh, gPand, gSpare].every(g => by(g.id) && by(g.id).critical));
    check('C1: OR and VOTING gates are not tested', !by(gOr.id) && !by(gVote.id));
    check('C1: a one-input AND gate is not tested', !by(gOne.id));
    check('C1: the outer AND gates are critical too (they carry the inner ones)', by(gOuter1.id).critical && by(gOuter2.id).critical);
    // top gate as certain
    const topAnd = gate('AND', [leaf(1e-5), leaf(1e-5)]);
    const page2 = { id: 'p2', name: 'Top and', root: topAnd, linkedFhaIds: [1] };
    const sb2 = load({ ftaPages: [page2], acFhaData: [fc(1, 'Catastrophic')], systemsData: [], cmaData: [] });
    const r2 = sb2.SLCriticalGates.analyzePage(page2);
    check('C1: the top gate taken as certain is P = 1 and critical', r2.gates.length === 1 && r2.gates[0].pCertain === 1 && r2.gates[0].critical);
}

// ---- C2 the objective --------------------------------------------------------------------
{
    const g = gate('AND', [leaf(1e-4), leaf(1e-4)]);   // 1e-8: inside Hazardous 1e-7, outside Catastrophic 1e-9 only as OR
    const page = { id: 'p1', name: 'T', root: g, linkedFhaIds: [1, 2] };
    const sb = load({ ftaPages: [page], acFhaData: [fc(1, 'Hazardous')], systemsData: [{ id: 'S1', name: 'Sys', fha: [fc(2, 'Catastrophic')] }], cmaData: [] });
    const res = sb.SLCriticalGates.analyzePage(page);
    check('C2: the strictest target among the linked conditions governs (system row counts)', res.target === 1e-9 && res.fcs.length === 2, String(res.target));
    const before = JSON.stringify(page.root);
    sb.SLCriticalGates.analyzeAll();
    check('C2: the real tree is never mutated', JSON.stringify(page.root) === before && page.root.gateType === 'AND');
    const sb2 = load({ ftaPages: [{ id: 'p1', name: 'T', root: g, linkedFhaIds: [] }], acFhaData: [fc(1, 'Catastrophic')], systemsData: [], cmaData: [] });
    check('C2: a tree with no linked condition is not tested', sb2.SLCriticalGates.analyzePage(sb2.ftaPages[0]).target === null && sb2.SLCriticalGates.analyzeAll().length === 0);
    const sb3 = load({ ftaPages: [{ id: 'p1', name: 'T', root: g, linkedFhaIds: [1] }], acFhaData: [fc(1, 'Minor')], systemsData: [], cmaData: [] });
    check('C2: a severity with no quantitative target is not tested', sb3.SLCriticalGates.analyzePage(sb3.ftaPages[0]).target === null);
}

// ---- C3 transfers and CCF ----------------------------------------------------------------
{
    const inner = gate('AND', [leaf(1e-5), leaf(1e-5)]);
    const dest = { id: 'pd', name: 'Destination', root: inner, linkedFhaIds: [] };
    const xfer = gate('TRANSFER', [], { transferOutTo: 'pd' });
    const src = { id: 'ps', name: 'Source', root: gate('OR', [xfer, leaf(1e-12)]), linkedFhaIds: [1] };
    const sb = load({ ftaPages: [src, dest], acFhaData: [fc(1, 'Catastrophic')], systemsData: [], cmaData: [] });
    const res = sb.SLCriticalGates.analyzePage(src);
    const g = res.gates.find(x => x.nodeId === inner.id);
    check('C3: a gate reached through a transfer is tested against the source condition and keyed to its own page', g && g.critical && g.key === 'pd:' + inner.id, JSON.stringify(res.gates));
    const missing = { id: 'pm', name: 'Missing', root: gate('OR', [gate('TRANSFER', [], { transferOutTo: 'nope' }), gate('AND', [leaf(1e-5), leaf(1e-5)])]), linkedFhaIds: [1] };
    const sb2 = load({ ftaPages: [missing], acFhaData: [fc(1, 'Catastrophic')], systemsData: [], cmaData: [] });
    const r2 = sb2.SLCriticalGates.analyzePage(missing);
    check('C3: a missing transfer destination is a P = 0 leaf, the rest still tests', r2.gates.length === 1 && r2.pTop != null && r2.pTop < 1e-9);
    const loopA = { id: 'la', name: 'A', root: gate('OR', [gate('TRANSFER', [], { transferOutTo: 'lb' }), leaf(1e-12)]), linkedFhaIds: [1] };
    const loopB = { id: 'lb', name: 'B', root: gate('OR', [gate('TRANSFER', [], { transferOutTo: 'la' }), gate('AND', [leaf(1e-5), leaf(1e-5)])]), linkedFhaIds: [] };
    const sb3 = load({ ftaPages: [loopA, loopB], acFhaData: [fc(1, 'Catastrophic')], systemsData: [], cmaData: [] });
    let looped = null; try { looped = sb3.SLCriticalGates.analyzePage(loopA); } catch (e) { looped = null; }
    check('C3: a transfer loop terminates and still tests the gate it reaches', looped && looped.gates.length === 1);
    // CCF beta on the leaves survives the clone: with beta the AND is far more likely than independent
    const a = leaf(1e-4, { ccfGroup: 'g1', beta: 0.1 }), b = leaf(1e-4, { ccfGroup: 'g1', beta: 0.1 });
    const ccf = { id: 'pc', name: 'CCF', root: gate('AND', [a, b]), linkedFhaIds: [1] };
    const sb4 = load({ ftaPages: [ccf], acFhaData: [fc(1, 'Catastrophic')], systemsData: [], cmaData: [] });
    const r4 = sb4.SLCriticalGates.analyzePage(ccf);
    check('C3: leaves keep their CCF beta (P(top) carries the common-cause term)', r4.pTop > 1e-6 && r4.pTop < 1.1e-5, String(r4.pTop));
}

// ---- C4 review and findings -------------------------------------------------------------------
{
    const g1 = gate('AND', [leaf(1e-5), leaf(1e-5)]), g2 = gate('AND', [leaf(1e-5), leaf(1e-5)]), g3 = gate('AND', [leaf(1e-5), leaf(1e-5)]);
    const page = { id: 'p1', name: 'T', root: gate('OR', [g1, g2, g3]), linkedFhaIds: [1] };
    const cma = [
        { internalId: 1, cmaId: 'CMA-001', status: 'Open', linkedGateIds: ['p1:' + g1.id] },
        { internalId: 2, cmaId: 'CMA-002', status: 'Open', suggested: true, linkedGateIds: ['p1:' + g2.id] }
    ];
    const sb = load({ ftaPages: [page], acFhaData: [fc(1, 'Catastrophic')], systemsData: [], cmaData: cma });
    const S = sb.SLCriticalGates;
    check('C4: a logged CMA linking the gate counts as its review', S.reviewedBy('p1:' + g1.id).length === 1 && S.reviewedBy('p1:' + g1.id)[0].cmaId === 'CMA-001');
    check('C4: a suggested-only CMA does not', S.reviewedBy('p1:' + g2.id).length === 0);
    const f = S.findings();
    check('C4: findings name only the critical, unreviewed gates', f.length === 2 && f.every(x => x.key !== 'p1:' + g1.id) && /no common mode review/.test(f[0].text), JSON.stringify(f));
    const inv = S.INV.run();
    check('C4: INV-58 is advisory, counts critical gates and reports the unreviewed ones', S.INV.id === 'INV-58' && S.INV.sev === 'advisory' && inv.checked === 3 && inv.failCount === 2);
    let registered = null;
    const sb2 = load({ ftaPages: [page], acFhaData: [fc(1, 'Catastrophic')], systemsData: [], cmaData: cma, invRegister: x => { registered = x; } });
    check('C4: registers into the invariants sweep', registered && registered.id === 'INV-58');
}

// ---- C5 surfaces ------------------------------------------------------------------------------
{
    const g1 = gate('AND', [leaf(1e-5), leaf(1e-5)], { name: 'Dual hydraulics' });
    const g2 = gate('AND', [gate('AND', [leaf(1e-3), leaf(1e-3)]), leaf(1e-10)]);   // inner not critical
    const inner = g2.children[0];
    const page = { id: 'p1', name: 'Loss of braking', root: gate('OR', [g1, g2]), linkedFhaIds: [1] };
    // fake DOM: enough for renderPanel / startReview
    const els = {};
    const mk = (id, extra) => els[id] = Object.assign({ id, innerHTML: '', value: '', style: {}, children: [], scrollIntoView() {}, appendChild(c) { this.children.push(c); c.parentNode = this; }, insertBefore(c, ref) { this.children.splice(Math.max(0, this.children.indexOf(ref)), 0, c); c.parentNode = this; } }, extra || {});
    const view = mk('view-cma'); const wrap = mk('wrap'); const table = mk('cma-table'); wrap.appendChild(table); view.appendChild(wrap);
    const cb = { type: 'checkbox', value: 'p1:' + g1.id, checked: false };
    const list = mk('cma-linked-gates', { querySelectorAll: () => [cb] }); const claim = mk('cma-claim'); const subj = mk('cma-subject');
    const doc = { getElementById: id => els[id] || null, createElement: tag => mk('created-' + Math.random(), { tagName: tag }) };
    const sb = load({ ftaPages: [page], acFhaData: [fc(1, 'Catastrophic')], systemsData: [], cmaData: [], document: doc,
                      _gtStage: (t, b, s) => '<div style="border:1px solid var(--color-border-hair) STAGE ' + t + ' ' + s + '">' + b + '</div>',
                      _renderGoldenThread: fha => '<div class="gt-cols"><div style="border:1px solid var(--color-border-hair) STAGE Budget"></div><div style="border:1px solid var(--color-border-hair) STAGE"><span>Common cause</span>x</div></div>',
                      renderCMA: () => 'rendered' });
    const S = sb.SLCriticalGates;
    const html = S.panelHtml();
    check('C5: the CMA panel lists the critical gate with Needs review and the review button', /G-\d+/.test(html) && /Dual hydraulics/.test(html) && /Needs review/.test(html) && /startReview\('p1:' + g1.id + '/.test(html.replace(/&#39;/g, "'")) || (/Needs review/.test(html) && html.indexOf("startReview('p1:" + g1.id + "')") >= 0), html.slice(0, 400));
    check('C5: by default the non-critical gate is hidden', html.indexOf('G-' + inner.id) < 0);
    S.toggleAll(true);
    const html2 = S.panelHtml();
    check('C5: show all lists the non-critical gate as not required', html2.indexOf('G-' + inner.id) >= 0 && /not required/.test(html2));
    S.toggleAll(false);
    check('C5: the wrappers took hold', sb._renderGoldenThread._cgWrapped === true && sb.renderCMA._cgWrapped === true);
    const thread = sb._renderGoldenThread(sb.acFhaData[0]);
    const iStage = thread.indexOf('STAGE Critical gates warn'), iCC = thread.indexOf('Common cause');
    check('C5: the thread stage is inserted before Common cause and says CHECK for an unreviewed critical gate', iStage >= 0 && iCC > iStage, thread.slice(0, 300));
    check('C5: the thread stage names the gate and the two results', /G-\d+.*if OR.*if certain/.test(thread) && /no common mode review/.test(thread));
    check('C5: renderCMA still returns its result and draws the panel', sb.renderCMA() === 'rendered' && /Which independence claims carry the budget/.test(els['view-cma'].children[0].innerHTML || ''));
    S.startReview('p1:' + g1.id);
    check('C5: startReview ticks the gate and names the claim', cb.checked === true && /Dual hydraulics/.test(claim.value) && /FC-1/.test(claim.value), claim.value);
    // a reviewed critical gate: thread says OK
    sb.cmaData.push({ internalId: 9, cmaId: 'CMA-009', status: 'Open', linkedGateIds: ['p1:' + g1.id, 'p1:' + g2.id] });
    const t2 = sb._renderGoldenThread(sb.acFhaData[0]);
    check('C5: once every critical gate is reviewed the thread stage is OK', t2.indexOf('STAGE Critical gates ok') >= 0 && /reviewed by CMA-009/.test(t2));
}

// ---- C6 wiring -------------------------------------------------------------------------------------
check('C6: critical_gates.js loads right after qual_arg.js', /qual_arg\.js\?v=[\d.]+" defer><\/script>\s*(<!--[\s\S]*?-->\s*)?<script src="critical_gates\.js\?v=[\d.]+" defer><\/script>/.test(IDX));
check('C6: no eval in the module (the page CSP forbids it)', !/\beval\s*\(/.test(SRC));
check('C6: module exports the API', typeof require(path.join(__dirname, '..', 'site', 'critical_gates.js')).analyzePage === 'function');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
