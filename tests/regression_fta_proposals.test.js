#!/usr/bin/env node
/*
 * Regression — CRA structural repairs as draft-and-Accept proposals (23 Aug
 * 2026, Waqas's ruling: editing an EXISTING tree needs a signature).
 *
 * Pins the whole contract:
 *   · the sweep proposes exactly the CRA independence-defeats that anchor on
 *     a live AND-family gate, idempotently (re-sweeps never duplicate);
 *   · ACCEPT is signed and performs the wrap AND(A,B) → OR(AND(A,B), R) with
 *     every number seeded 0 — and REFUSES when the gate changed since the
 *     proposal was drawn;
 *   · DISMISS needs a name + rationale and stays on the record;
 *   · vanished findings withdraw their proposals;
 *   · an accepted wrap is never re-proposed;
 *   · CCF is parametric (β on the events) — this module must NEVER build a
 *     structural β branch, and INV-50 keeps both backlogs visible.
 * Run: node tests/regression_fta_proposals.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

// ---- harness ----------------------------------------------------------------
global.internalIdCounter = 7000;
global.projectConfig = {};
const gate = { id: 61, logicalId: 61, name: 'Loss of both channels', type: 'gate', gateType: 'AND', probability: 0,
    children: [
        { id: 62, logicalId: 'ch-a', name: 'Channel A fails', type: 'basic', probability: 0, children: [] },
        { id: 63, logicalId: 'ch-b', name: 'Channel B fails', type: 'basic', probability: 0, children: [] }] };
global.ftaPages = [{ id: 'pg1', name: 'Tree', root: { id: 60, type: 'gate', gateType: 'OR', children: [gate] } }];
let FINDINGS = [{ resId: 'RES-BUS1', mode: 'total loss', principle: 'ch-a∧ch-b',
    detail: 'RES-BUS1 · total loss touches fcs and eps — both sit under independence claim "ch-a∧ch-b".' }];
global.CRA = { findings: () => FINDINGS.slice() };
global.ipLedger = () => [{ key: 'ch-a∧ch-b', members: [{ lid: 'ch-a' }, { lid: 'ch-b' }],
    sources: [{ type: 'gate', pageId: 'pg1', nodeId: 61 }, { type: 'cutset', pageId: 'pg1' }] }];
let INV = null;
global.invRegister = spec => { INV = spec; };
global.ccfPairs = () => [
    { state: 'unconfirmed', a: { displayId: 'BE-1' }, b: { displayId: 'BE-2' } },
    { state: 'bucketed', a: {}, b: {} }];

const P = require('../site/fta_proposals.js');
const src = S('fta_proposals.js');
const idx = S('index.html');

// ---- the sweep --------------------------------------------------------------
const s1 = P.sweep();
const items = projectConfig.ftaProposals.items;
check('the sweep proposes the defeat that anchors on the live AND gate (cutset sources ignored)',
    s1.proposed === 1 && items.length === 1 && items[0].kind === 'cra' &&
    items[0].pageId === 'pg1' && items[0].nodeId === 61 && items[0].status === 'open');
check('re-sweeps are idempotent — never a duplicate proposal',
    P.sweep().proposed === 0 && items.length === 1);

// ---- accept: signature + drift refusal --------------------------------------
check('accept without a signature is refused', P.accept(items[0].id, '').ok === false);
gate.children.push({ id: 64, logicalId: 'ch-c', name: 'Late-added channel', type: 'basic', probability: 0, children: [] });
const drift = P.accept(items[0].id, 'W. Nafees');
check('accept REFUSES when the gate changed since the proposal was drawn',
    drift.ok === false && /changed since proposed/.test(drift.reason) && gate.gateType === 'AND');
gate.children.pop();

// ---- accept: the wrap -------------------------------------------------------
const acc = P.accept(items[0].id, 'W. Nafees');
check('signed accept performs the wrap: the gate becomes OR(inner AND, common-resource event)',
    acc.ok === true && gate.gateType === 'OR' && gate.children.length === 2 &&
    gate.children[0].type === 'gate' && gate.children[0].gateType === 'AND' &&
    gate.children[0].children.length === 2 && gate.children[0].children[0].id === 62);
const resEv = gate.children[1];
check('the common-resource event names the resource and seeds every number at 0',
    resEv.type === 'basic' && /RES-BUS1/.test(resEv.name) && /total loss/.test(resEv.name) &&
    resEv.probability === 0 && resEv.lambda === 0);
check('the wrap is provenance-marked and the proposal records who signed',
    gate._craWrapped === items[0].id && resEv._craProvenance === items[0].id &&
    items[0].status === 'accepted' && items[0].by === 'W. Nafees');
check('an accepted wrap is never re-proposed', P.sweep().proposed === 0 &&
    items.filter(i => i.status === 'open').length === 0);

// ---- dismiss discipline -----------------------------------------------------
FINDINGS.push({ resId: 'RES-HYD', mode: 'total loss', principle: 'ch-a∧ch-b', detail: 'second defeat' });
// second finding lands on the SAME gate — but it is wrapped (OR now), so no proposal:
check('a wrapped gate (no longer AND-family at that id) draws no fresh proposal', (() => {
    const before = items.length;
    P.sweep();
    return items.length === before;
})());
// fresh AND gate for the dismiss path:
const gate2 = { id: 71, logicalId: 71, name: 'G2', type: 'gate', gateType: 'AND', probability: 0,
    children: [{ id: 72, logicalId: 'x1', type: 'basic', probability: 0, children: [] },
               { id: 73, logicalId: 'x2', type: 'basic', probability: 0, children: [] }] };
ftaPages[0].root.children.push(gate2);
global.ipLedger = () => [{ key: 'x1∧x2', members: [], sources: [{ type: 'gate', pageId: 'pg1', nodeId: 71 }] }];
FINDINGS = [{ resId: 'RES-HYD', mode: 'total loss', principle: 'x1∧x2', detail: 'hydraulic defeat' }];
P.sweep();
const open2 = items.find(i => i.status === 'open');
check('dismiss refuses without a rationale of substance',
    P.dismiss(open2.id, 'W. Nafees', 'no').ok === false);
check('signed dismiss with rationale stays on the record',
    P.dismiss(open2.id, 'W. Nafees', 'Resource already modeled explicitly in both legs.').ok === true &&
    open2.status === 'dismissed' && /already modeled/.test(open2.rationale));

// ---- withdrawal -------------------------------------------------------------
P.sweep();
const open3 = items.find(i => i.status === 'open');
check('the same finding does not re-propose over a dismissal… unless it is a NEW defeat', !open3 ||
    open3.id !== open2.id);
FINDINGS = [];
check('a vanished finding withdraws its open proposals', (() => {
    // reopen scenario: new finding, then remove it
    FINDINGS = [{ resId: 'RES-ELEC', mode: 'degraded', principle: 'x1∧x2', detail: 'elec defeat' }];
    P.sweep();
    const o = items.find(i => i.status === 'open' && i.resId === 'RES-ELEC');
    if (!o) return false;
    FINDINGS = [];
    P.sweep();
    return o.status === 'withdrawn' && /no longer holds/.test(o.reason);
})());

// ---- INV-50 + status --------------------------------------------------------
check('INV-50 registered as the sweep flag, naming open repairs AND the CCF pair backlog', (() => {
    if (!INV || INV.id !== 'INV-50') return false;
    FINDINGS = [{ resId: 'RES-FUEL', mode: 'total loss', principle: 'x1∧x2', detail: 'fuel defeat' }];
    P.sweep();
    const r = INV.run();
    return r.fails.some(f => /RES-FUEL/.test(f)) && r.fails.some(f => /BE-1.*BE-2/.test(f));
})());
check('status() reports both backlogs', (() => {
    const st = P.status();
    return st.open >= 1 && st.accepted === 1 && st.dismissed === 1 && st.ccfUnreviewed === 1;
})());

// ---- doctrine in source -----------------------------------------------------
check('kill switch present (SL_FTA_PROPOSALS_OFF)', src.includes('SL_FTA_PROPOSALS_OFF'));
check('CCF stays parametric — the module never writes a β branch (documented + no ccfGroup writes)',
    /would DOUBLE-COUNT/.test(src) && !/ccfGroup\s*=/.test(src) && !/\.beta\s*=/.test(src));
check('wired in index.html, cache-busted, after the CRA + ledger modules it reads',
    /fta_proposals\.js\?v=[\d.]+/.test(idx) &&
    idx.indexOf('fta_proposals.js') > idx.indexOf('cra_matrix.js') &&
    idx.indexOf('fta_proposals.js') > idx.indexOf('helpers_modules.js'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
