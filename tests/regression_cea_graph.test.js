#!/usr/bin/env node
/*
 * Regression — cea_graph.js: Cascading Effects Analysis (gap M2 / A11).
 * Executes the REAL module in a sandbox on a small model:
 *
 *   C1  the graph: systems + resources as nodes; provides / feeds / interface
 *       edges; function-level consumption resolves to the owning system;
 *       interface direction (a_to_b default, b_to_a, bidirectional)
 *   C2  cascades: shortest hops and a readable path; cycles terminate; the
 *       8-hop limit holds; an unknown source cascades to nothing
 *   C3  reconciliation vs the interdependence table: contributes →
 *       corroborated; never reviewed → 'unreviewed'; manually cleared →
 *       'conflict' (listed first); FCs linked through subIds[] are found
 *       (they were missed before 23 Sep 2026: only subId was read)
 *   C4  the PASA checklist item: passes with no paths, fails on findings,
 *       registered once
 * Run: node tests/regression_cea_graph.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'cea_graph.js'), 'utf8');

function load(model) {
    const cells = model.cells || {};
    const sb = Object.assign({ console, Math, JSON, String, Array, Object, Set, Map,
        document: { getElementById: () => null },
        CKPT_CHECKLISTS: { PASA: [] },
        idpCell: (fc, sysId) => cells[fc.fcId + '|' + sysId] || { state: 'unreviewed' } }, model.globals);
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(SRC, sb, { filename: 'cea_graph.js' });
    return sb;
}

// S1 provides RES-HYD, consumed by S2 (directly) and by S3 via function sub F-3;
// S2 --interface--> S4 ; S4 <--> S5 (bidirectional) ; S6 --b_to_a--> S5
const systems = [
    { id: 'S1', name: 'Hydraulics', functions: [{ traceIds: ['F-1'] }] },
    { id: 'S2', name: 'Flight controls', functions: [{ traceIds: ['F-2'] }] },
    { id: 'S3', name: 'Brakes', functions: [{ traceId: 'F-3' }] },
    { id: 'S4', name: 'Avionics', functions: [{ traceIds: ['F-4'] }] },
    { id: 'S5', name: 'Displays', functions: [] },
    { id: 'S6', name: 'Power', functions: [] }
];
const resources = [{ resId: 'RES-HYD', name: 'Hydraulic pressure', providedBy: ['S1'], consumedBySystems: ['S2'], consumedBy: ['F-3'] }];
const interfaces = [
    { fromSystemId: 'S2', toSystemId: 'S4', medium: 'ARINC 429' },
    { fromSystemId: 'S4', toSystemId: 'S5', direction: 'bidirectional' },
    { fromSystemId: 'S5', toSystemId: 'S6', direction: 'b_to_a' }
];
const acFha = [
    { internalId: 1, fcId: 'FC-PITCH', severity: 'Catastrophic', subId: 'F-2' },
    { internalId: 2, fcId: 'FC-BRAKE', severity: 'Hazardous', subIds: ['F-9', 'F-3'] },   // linked via subIds[] only
    { internalId: 3, fcId: 'FC-NAV', severity: 'Major', subIds: ['F-4'] }
];
const M = load({
    globals: { systemsData: systems, resourcesData: resources, projectConfig: { interfaces }, acFhaData: acFha },
    cells: { 'FC-PITCH|S1': { state: 'contributes' }, 'FC-NAV|S1': { state: 'cleared', by: 'J. Ortiz' } }
});

// ---- C1 ---------------------------------------------------------------------------------
const g = M.ceaGraph();
const has = (from, to, kind) => g.edges.some(e => e.from === from && e.to === to && e.kind === kind);
check('C1: systems and resources are nodes', g.nodes.size === 7 && g.nodes.get('res:RES-HYD').kind === 'resource');
check('C1: provider → resource → consumer edges', has('S1', 'res:RES-HYD', 'provides') && has('res:RES-HYD', 'S2', 'feeds'));
check('C1: function-level consumption lands on the system that owns the function', has('res:RES-HYD', 'S3', 'feeds'));
check('C1: interface directions — default a→b, bidirectional both ways, b_to_a reversed only',
    has('S2', 'S4', 'interface') && !has('S4', 'S2', 'interface') && has('S4', 'S5', 'interface') && has('S5', 'S4', 'interface') && has('S6', 'S5', 'interface') && !has('S5', 'S6', 'interface'));

// ---- C2 ---------------------------------------------------------------------------------
const c = M.ceaCascade('S1', g);
const byId = id => c.find(r => r.id === id);
check('C2: Hydraulics failure reaches the resource (1 hop), flight controls and brakes (2), avionics (3), displays (4)',
    byId('res:RES-HYD').hops === 1 && byId('S2').hops === 2 && byId('S3').hops === 2 && byId('S4').hops === 3 && byId('S5').hops === 4, JSON.stringify(c.map(r => r.id + ':' + r.hops)));
check('C2: power is not reached (its interface points the other way)', !byId('S6'));
check('C2: the path reads source → … → target', /Hydraulics —provides\(RES-HYD\)→ Hydraulic pressure ; Hydraulic pressure —feeds\(RES-HYD\)→ Flight controls ; Flight controls —interface\(ARINC 429\)→ Avionics/.test(byId('S4').path), byId('S4').path);
check('C2: the source itself is not listed, and the S4⇄S5 cycle terminates', !byId('S1') && c.length === 5);
check('C2: an unknown source cascades to nothing', M.ceaCascade('NOPE', g).length === 0);
const chain = []; for (let i = 0; i < 12; i++) chain.push({ id: 'C' + i, name: 'C' + i, functions: [] });
const chainIfaces = []; for (let i = 0; i < 11; i++) chainIfaces.push({ fromSystemId: 'C' + i, toSystemId: 'C' + (i + 1) });
const L = load({ globals: { systemsData: chain, resourcesData: [], projectConfig: { interfaces: chainIfaces }, acFhaData: [] } });
const lc = L.ceaCascade('C0');
check('C2: cascades stop at 8 hops', lc.length === 8 && Math.max.apply(null, lc.map(r => r.hops)) === 8);

// ---- C3 ---------------------------------------------------------------------------------
const f = M.ceaFindings();
const find = (fc, src) => f.rows.find(r => r.fc === fc && r.sourceId === src);
check('C3: a cascade backed by a contributing cell is corroborated, not a finding', !find('FC-PITCH', 'S1') && f.corroborated >= 1);
check('C3: a cascade to an FC linked only through subIds[] is found (brakes)', !!find('FC-BRAKE', 'S1') && find('FC-BRAKE', 'S1').kind === 'unreviewed');
check('C3: a cascade that contradicts a cleared cell is a conflict, naming who cleared it', !!find('FC-NAV', 'S1') && find('FC-NAV', 'S1').kind === 'conflict' && /J\. Ortiz/.test(find('FC-NAV', 'S1').detail));
check('C3: conflicts are listed before unreviewed paths', f.rows[0].kind === 'conflict');
check('C3: every row carries severity, path and hop count', f.rows.every(r => r.severity && r.via && r.hops >= 1));
const noIdp = load({ globals: { systemsData: systems, resourcesData: resources, projectConfig: { interfaces }, acFhaData: acFha } });
noIdp.idpCell = undefined;
check('C3: without the interdependence table there is nothing to reconcile (no crash)', noIdp.ceaFindings().pairs === 0);

// ---- C4 ---------------------------------------------------------------------------------
const items = M.CKPT_CHECKLISTS.PASA.filter(i => i.id === 'cea');
check('C4: the PASA checklist item is registered once', items.length === 1 && items[0].kind === 'auto');
const ev = items[0].eval();
check('C4: it fails while findings are open, and says how many of each', ev.pass === false && /1 conflict\(s\)/.test(ev.detail) && /unreviewed path/.test(ev.detail), ev.detail);
const E = load({ globals: { systemsData: [{ id: 'X', name: 'X', functions: [] }], resourcesData: [], projectConfig: {}, acFhaData: [] } });
check('C4: it passes when the model has no dependency paths', E.CKPT_CHECKLISTS.PASA[0].eval().pass === true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
