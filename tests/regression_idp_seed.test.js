#!/usr/bin/env node
/*
 * Regression — MF&MS seeds from the Interdependence table (23 Aug 2026).
 *
 * Waqas's ruling: aircraft-level skeletons are a DETERMINISTIC SEED ("cannot
 * be forgotten"), while anything that edits an existing tree stays
 * draft-and-Accept. This suite pins the seed's whole lifecycle:
 *   · seeds exactly the multi-system, uncovered FCs — never single-system
 *     ones, never FCs a real MF&MS page already covers;
 *   · leaves carry the SYS_ externalSource links ASA pass 2 substitutes, and
 *     an untraced contributor is an honest UNDEVELOPED event;
 *   · re-runs are no-ops (stable id, no duplicates);
 *   · changed facts regenerate an UNTOUCHED seed but never rewrite a
 *     developed one (it flags stale instead);
 *   · a demoted FC removes its untouched seed and flags a developed one;
 *   · numbers are the user's: everything seeds at probability 0.
 * Run: node tests/regression_idp_seed.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

// ---- harness ----------------------------------------------------------------
global.internalIdCounter = 5000;
global.acFhaData = [
    { internalId: 101, fcId: 'FC-A01', fcDesc: 'Loss of aircraft-level thing' },   // multi-system
    { internalId: 102, fcId: 'FC-A02', fcDesc: 'Single-system thing' },            // single-system
    { internalId: 103, fcId: 'FC-A03', fcDesc: 'Covered thing' }                   // multi but covered by mac page
];
global.systemsData = [
    { id: 'sysA', name: 'Alpha System', fha: [
        { internalId: 2001, fcId: 'FC-SA1', fcDesc: 'Alpha contribution', acTrace: 101 },
        { internalId: 2002, fcId: 'FC-SA2', fcDesc: 'Unrelated', acTrace: 999 }] },
    { id: 'sysB', name: 'Bravo System', fha: [] },
    { id: 'sysC', name: 'Charlie System', fha: [] }
];
const CONTRIB = { 101: ['sysA', 'sysB'], 102: ['sysA'], 103: ['sysA', 'sysC'] };
global.idpContributors = fc => (CONTRIB[fc.internalId] || []).slice();
global.ftaPages = [
    { id: 'mac-pg-r1', name: 'MF&MS · FC-A03', root: { type: 'gate', children: [] }, linkedFhaId: 103 }
];

const IDP = require('../site/idp_seed_trees.js');
const src = S('idp_seed_trees.js');
const idx = S('index.html');

// ---- first sweep ------------------------------------------------------------
const r1 = IDP.run();
const seed = ftaPages.find(p => p.id === 'idp-pg-101');
check('seeds exactly the one multi-system, uncovered FC', r1.seeded === 1 && !!seed &&
    !ftaPages.find(p => p.id === 'idp-pg-102') && !ftaPages.find(p => p.id === 'idp-pg-103'),
    JSON.stringify(r1));
check('the seed is an aircraft-level top-down page linked to its FC',
    seed && seed.treeLevel === 'aircraft' && seed.mode === 'top-down' && seed.linkedFhaId === 101 &&
    seed.generatedFrom === 'interdep');
check('top event names the condition over an OR of contributors',
    seed && seed.root.type === 'gate' && seed.root.gateType === 'OR' &&
    seed.root.name.indexOf('FC-A01') === 0 && seed.root.children.length === 2);
const leafA = seed && seed.root.children.find(c => c.type === 'basic');
const leafB = seed && seed.root.children.find(c => c.type === 'undeveloped');
check('a traced contributor becomes a basic event carrying the SYS_ link ASA pass 2 substitutes',
    leafA && leafA.externalSource && leafA.externalSource.kind === 'fha' &&
    leafA.externalSource.targetId === 'SYS_2001' && leafA.name.indexOf('Alpha System') === 0);
check('an untraced contributor is an honest UNDEVELOPED event naming the gap',
    leafB && !leafB.externalSource && /Bravo System/.test(leafB.name) && /no system FC traced/.test(leafB.name));
check('numbers are the user\'s — every seeded probability is 0',
    seed && seed.root.probability === 0 && seed.root.children.every(c => c.probability === 0));

// ---- stability --------------------------------------------------------------
const r2 = IDP.run();
check('re-run with unchanged facts is a no-op (no duplicates, page kept)',
    r2.seeded === 0 && r2.regenerated === 0 && r2.kept === 1 &&
    ftaPages.filter(p => p.id === 'idp-pg-101').length === 1);

// ---- changed facts, untouched seed → regenerate -----------------------------
systemsData[1].fha.push({ internalId: 2010, fcId: 'FC-SB1', fcDesc: 'Bravo contribution', acTrace: 101 });
const r3 = IDP.run();
const seed3 = ftaPages.find(p => p.id === 'idp-pg-101');
check('changed facts regenerate an UNTOUCHED seed in place (Bravo link appears)',
    r3.regenerated === 1 && seed3.root.children.filter(c => c.type === 'basic').length === 2 &&
    seed3.root.children.some(c => c.externalSource && c.externalSource.targetId === 'SYS_2010') &&
    !seed3._idpStale);

// ---- changed facts, developed seed → stale flag, never rewritten ------------
seed3.root.children.push({ id: 9999, type: 'basic', name: 'Hand-built contribution', probability: 0, children: [] });
CONTRIB[101].push('sysC');
const r4 = IDP.run();
const seed4 = ftaPages.find(p => p.id === 'idp-pg-101');
check('a DEVELOPED seed is never rewritten — it flags stale with the reason',
    r4.stale === 1 && r4.regenerated === 0 && !!seed4._idpStale &&
    seed4.root.children.some(c => c.name === 'Hand-built contribution') &&
    !seed4.root.children.some(c => c.externalSource && String(c.externalSource.targetId).indexOf('sysC') >= 0));
CONTRIB[101].pop();

// ---- demotion ---------------------------------------------------------------
check('a demoted FC keeps a developed seed, flagged with the no-longer-multi reason', (() => {
    CONTRIB[101] = ['sysA'];
    IDP.run();
    const p = ftaPages.find(x => x.id === 'idp-pg-101');
    const ok = p && /no longer multi-system/.test(p._idpStale || '');
    CONTRIB[101] = ['sysA', 'sysB'];
    return ok;
})());
check('a demoted FC removes an UNTOUCHED seed entirely', (() => {
    // fresh scenario: seed FC 104 untouched, then demote it
    acFhaData.push({ internalId: 104, fcId: 'FC-A04', fcDesc: 'Transient condition' });
    CONTRIB[104] = ['sysA', 'sysB'];
    IDP.run();
    if (!ftaPages.find(p => p.id === 'idp-pg-104')) return false;
    CONTRIB[104] = ['sysA'];
    const r = IDP.run();
    return r.removed === 1 && !ftaPages.find(p => p.id === 'idp-pg-104');
})());
check('status() reports seeds and stale reasons', (() => {
    const st = IDP.status();
    return st.seeds >= 1 && Array.isArray(st.stale);
})());

// ---- source discipline ------------------------------------------------------
check('kill switch present (SL_IDP_SEED_OFF)', src.includes('SL_IDP_SEED_OFF'));
check('born modular — never seeds an FC a real MF&MS page covers (same match the triage uses)',
    src.includes("indexOf('mac-pg-') === 0") && src.includes('/MF&MS/.test'));
check('wired in index.html, cache-busted, after the helpers it reads at runtime',
    /idp_seed_trees\.js\?v=[\d.]+/.test(idx) &&
    idx.indexOf('idp_seed_trees.js') > idx.indexOf('helpers_modules.js'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
