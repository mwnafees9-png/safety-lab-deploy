#!/usr/bin/env node
/*
 * Regression — Part 23 SW/AEH DALs per ASTM F3061 §4.2.5
 * (23 Sep 2026, standards gap G4).
 *
 * F3061 §4.2.5 allows Table 1 OR the ARP4754 method. The app used to mix them
 * (Table 1 top, then ARP4754 reductions on it), which let a backup system drop
 * below what either method allows (DAL E behind a Level I Catastrophic).
 *
 *   F1  Table 1, all cells, restated here independently of the module
 *   F2  the method: Table 1 by default on Part 23; ARP4754 when chosen; not
 *       applicable to other bases
 *   F3  the target lookup: Part 23 top DAL follows the method; probability
 *       targets stay F3230 Table 5
 *   F4  EXECUTED — the real allocateDAL: on every Assessment Level and class,
 *       an independent AND gives the carrier the primary DAL and the others
 *       Table 1's secondary, whichever ARP option the gate was set to; nested
 *       gates never go below the secondary; Minor has no reduction and no
 *       independence requirement; OR and compromised gates hold the top DAL
 *   F5  EXECUTED — the ARP4754 method runs ARP4754 end to end (top A, Option 1
 *       others C); Part 25 is unchanged (the B18/B19 self-test values)
 *   F6  the old defect is gone: no backup below Table 1's secondary anywhere
 *   F7  wiring: both root callers pass the context; register rationale;
 *       reference table; project setting; module loaded
 * Run: node tests/regression_f3061_dal.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const extract = (src, name) => {
    const at = src.indexOf('function ' + name + '(');
    if (at < 0) throw new Error('not found: ' + name);
    const open = src.indexOf('{', src.indexOf(')', at)); let d = 0;
    for (let i = open; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) return src.slice(at, i + 1); } }
    throw new Error('unbalanced: ' + name);
};

const SUP = read('support_modules.js'), HELP = read('helpers_modules.js'), MISC = read('misc_fn_modules.js'), ASR = read('assurance_modules.js'), IDX = read('index.html');
const ctx = { console, Math, JSON, String, Array, Object, Set, Map };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(read('safety_targets.js').replace(/^const /gm, 'var '), ctx, { filename: 'safety_targets.js' });
vm.runInContext(read('f3061_dal.js'), ctx, { filename: 'f3061_dal.js' });
vm.runInContext('var projectConfig = { regulation: "Part 23", part23Class: "IV" }; var ftaPages = [];' +
    'function canonRegulation(r){ var k=String(r||"").toLowerCase().replace(/[^a-z0-9]/g,""); return k==="part23"?"Part 23":k==="part25"?"Part 25":r; }' +
    'function part27TargetKey(){ return "Part 27 III"; } function scvtolTargetKey(){ return "Part 25"; }' +
    extract(HELP, 'dalDecrement') + ';' + extract(HELP, 'dalMax') + ';' + extract(SUP, 'getSafetyTarget') + ';' + extract(SUP, 'allocateDAL') + ';', ctx, { filename: 'extract' });
const T = ctx.SLF3061;

// ---- F1 ---------------------------------------------------------------------------------
// F3061/F3061M-22b Table 1: [Minor P, Major P/S, Hazardous P/S, Catastrophic P/S]
const TABLE1 = { I: ['D', 'C/D', 'C/D', 'C/C'], II: ['D', 'C/D', 'C/C', 'C/C'], III: ['D', 'C/D', 'C/C', 'B/C'], IV: ['D', 'C/D', 'B/C', 'A/B'] };
const SEVS = ['Minor', 'Major', 'Hazardous', 'Catastrophic'];
let bad = [];
Object.keys(TABLE1).forEach(l => SEVS.forEach((s, i) => {
    const [P, S] = TABLE1[l][i].split('/'); const c = T.cell(l, s);
    if (!c || c.P !== P || (c.S || undefined) !== S) bad.push(l + ' ' + s);
}));
check('F1: Table 1 — all 16 cells (Minor has no secondary)', bad.length === 0, bad.join(', '));
check('F1: Negligible carries no SW/AEH DAL requirement (E) at every level', ['I', 'II', 'III', 'IV'].every(l => T.cell(l, 'Negligible').P === 'E' && !T.cell(l, 'Negligible').S));
check('F1: Table 1 primary column equals the DAL_TARGETS Part 23 rows', ['I', 'II', 'III', 'IV'].every(l => SEVS.every(s => ctx.DAL_TARGETS['Part 23 ' + l][s] === T.cell(l, s).P)));

// ---- F2 ---------------------------------------------------------------------------------
check('F2: Part 23 defaults to Table 1', T.method({ regulation: 'Part 23' }) === 'f3061' && T.method({ regulation: 'part-23' }) === 'f3061');
check('F2: Part 23 can choose ARP4754', T.method({ regulation: 'Part 23', part23DalMethod: 'arp4754' }) === 'arp4754');
check('F2: other bases are not touched', T.method({ regulation: 'Part 25' }) === null && T.method({ regulation: 'SC-VTOL' }) === null && T.contextFor('Catastrophic', { regulation: 'Part 25' }) === null);
check('F2: the ARP4754 method carries no Table 1 context', T.contextFor('Catastrophic', { regulation: 'Part 23', part23Class: 'I', part23DalMethod: 'arp4754' }) === null);

// ---- F3 ---------------------------------------------------------------------------------
const tgt = (cfg, sev) => { vm.runInContext('projectConfig = ' + JSON.stringify(cfg), ctx); return ctx.getSafetyTarget(sev); };
let g = tgt({ regulation: 'Part 23', part23Class: 'I' }, 'Catastrophic');
check('F3: Part 23 Level I on Table 1 — top DAL C, target 1e-6', g.dal === 'C' && g.prob === 1e-6 && g.dalMethod === 'f3061');
g = tgt({ regulation: 'Part 23', part23Class: 'I', part23DalMethod: 'arp4754' }, 'Catastrophic');
check('F3: Part 23 Level I on ARP4754 — top DAL A, probability target still F3230 Table 5 (1e-6)', g.dal === 'A' && g.prob === 1e-6 && g.dalMethod === 'arp4754');
g = tgt({ regulation: 'Part 25' }, 'Hazardous');
check('F3: Part 25 unchanged (Haz B, 1e-7, no method)', g.dal === 'B' && g.prob === 1e-7 && g.dalMethod === null);

// ---- F4 EXEC ----------------------------------------------------------------------------
let nid = 1;
const leaf = () => ({ id: 'n' + (nid++), type: 'basic', children: [] });
const gate = (gt, kids, extra) => Object.assign({ id: 'g' + (nid++), type: 'gate', gateType: gt, children: kids }, extra || {});
const alloc = (cfg, sev, root) => {
    vm.runInContext('projectConfig = ' + JSON.stringify(cfg), ctx);
    const top = ctx.getSafetyTarget(sev).dal;
    ctx.allocateDAL(root, top, new Set(), null, ctx.SLF3061.contextFor(sev, ctx.projectConfig));
    return top;
};
bad = [];
['I', 'II', 'III', 'IV'].forEach(l => ['Major', 'Hazardous', 'Catastrophic'].forEach(sev => ['opt1', 'opt2'].forEach(opt => {
    const a = leaf(), b = leaf(), c = leaf();
    const root = gate('AND', [a, b, c], { dalOption: opt, dalCarrierChildId: a.id });
    alloc({ regulation: 'Part 23', part23Class: l }, sev, root);
    const cell = T.cell(l, sev);
    if (a.allocatedDAL !== cell.P || b.allocatedDAL !== cell.S || c.allocatedDAL !== cell.S) bad.push(l + ' ' + sev + ' ' + opt + ': ' + [a, b, c].map(x => x.allocatedDAL).join('/') + ' want ' + cell.P + '/' + cell.S);
})));
check('F4 EXEC: every level and class, either ARP option setting — carrier gets the primary DAL, the others Table 1\'s secondary', bad.length === 0, bad.slice(0, 4).join('; '));

let x = leaf(), y = leaf(), carrier = leaf();
let inner = gate('AND', [x, y]);
let root = gate('AND', [carrier, inner], { dalCarrierChildId: carrier.id });
alloc({ regulation: 'Part 23', part23Class: 'IV' }, 'Catastrophic', root);
check('F4 EXEC: nested AND inside the secondary branch stays at the secondary DAL (IV Cat: A / B / B / B)', carrier.allocatedDAL === 'A' && inner.allocatedDAL === 'B' && x.allocatedDAL === 'B' && y.allocatedDAL === 'B', [carrier, inner, x, y].map(n => n.allocatedDAL).join('/'));
check('F4 EXEC: that nested gate is not marked reduced and raises no DAL independence requirement', inner._dalReduced === false && inner._independenceReq === null);
check('F4 EXEC: the top gate records the Table 1 derivation for each member', carrier._dalDerivation.basis === 'f3061' && carrier._dalDerivation.role === 'primary' && inner._dalDerivation.role === 'secondary' && inner._dalDerivation.level === 'IV');

x = leaf(); y = leaf(); root = gate('AND', [x, y]);
alloc({ regulation: 'Part 23', part23Class: 'III' }, 'Minor', root);
check('F4 EXEC: Minor has no secondary — no reduction, no independence requirement', x.allocatedDAL === 'D' && y.allocatedDAL === 'D' && root._dalReduced === false && root._independenceReq === null && y._dalDerivation.role === 'no-secondary');

x = leaf(); y = leaf(); root = gate('OR', [x, y]);
alloc({ regulation: 'Part 23', part23Class: 'II' }, 'Catastrophic', root);
check('F4 EXEC: an OR gate holds the top DAL on every member', x.allocatedDAL === 'C' && y.allocatedDAL === 'C');

x = leaf(); y = leaf(); root = gate('AND', [x, y], { dalIndependence: 'compromised' });
alloc({ regulation: 'Part 23', part23Class: 'IV' }, 'Catastrophic', root);
check('F4 EXEC: compromised independence reverts every member to the top DAL', x.allocatedDAL === 'A' && y.allocatedDAL === 'A');

x = leaf(); y = leaf(); root = gate('AND', [x, y], { dalIndependence: 'claimed' });
alloc({ regulation: 'Part 23', part23Class: 'I' }, 'Hazardous', root);
check('F4 EXEC: a reducing gate still raises its independence requirement (claimed)', root._dalReduced === true && root._independenceReq && root._independenceReq.status === 'claimed');

// ---- F5 EXEC ----------------------------------------------------------------------------
x = leaf(); y = leaf(); root = gate('AND', [x, y], { dalOption: 'opt1', dalCarrierChildId: x.id });
let top = alloc({ regulation: 'Part 23', part23Class: 'I', part23DalMethod: 'arp4754' }, 'Catastrophic', root);
check('F5 EXEC: ARP4754 method on a Level I Catastrophic — top A, Option 1 others C', top === 'A' && x.allocatedDAL === 'A' && y.allocatedDAL === 'C' && y._dalDerivation.basis === 'option1');
x = leaf(); y = leaf(); root = gate('AND', [x, y], { dalOption: 'opt2' });
alloc({ regulation: 'Part 23', part23Class: 'I', part23DalMethod: 'arp4754' }, 'Catastrophic', root);
check('F5 EXEC: ARP4754 method — Option 2 gives B / B', x.allocatedDAL === 'B' && y.allocatedDAL === 'B');
x = leaf(); y = leaf(); root = gate('AND', [x, y], { dalOption: 'opt1', dalCarrierChildId: x.id });
alloc({ regulation: 'Part 25' }, 'Catastrophic', root);
check('F5 EXEC: Part 25 unchanged — Option 1 A / C (self-test B19)', x.allocatedDAL === 'A' && y.allocatedDAL === 'C');
x = leaf(); y = leaf(); root = gate('AND', [x, y], { dalOption: 'opt2' });
alloc({ regulation: 'Part 25' }, 'Catastrophic', root);
check('F5 EXEC: Part 25 unchanged — Option 2 B / B (self-test B18)', x.allocatedDAL === 'B' && y.allocatedDAL === 'B');

// ---- F6 ---------------------------------------------------------------------------------
const ORDER = ['A', 'B', 'C', 'D', 'E'];
bad = [];
['I', 'II', 'III', 'IV'].forEach(l => ['Hazardous', 'Catastrophic'].forEach(sev => {
    const a = leaf(), b = leaf(), deep1 = leaf(), deep2 = leaf();
    const r = gate('AND', [a, gate('AND', [b, gate('AND', [deep1, deep2], { dalOption: 'opt1' })], { dalOption: 'opt1' })], { dalOption: 'opt1', dalCarrierChildId: a.id });
    alloc({ regulation: 'Part 23', part23Class: l }, sev, r);
    const S = T.cell(l, sev).S;
    [b, deep1, deep2].forEach(n => { if (ORDER.indexOf(n.allocatedDAL) > ORDER.indexOf(S)) bad.push(l + ' ' + sev + ' ' + n.allocatedDAL + '<' + S); });
}));
check('F6: three levels of Option 1 nesting never take a backup below Table 1\'s secondary (the old code reached E)', bad.length === 0, bad.join(', '));

// ---- F7 ---------------------------------------------------------------------------------
check('F7: the canvas allocation passes the failure condition\'s Table 1 context', /dalCtx = \(typeof SLF3061 !== 'undefined'\) \? SLF3061\.contextFor\(fha\.severity, projectConfig\)/.test(HELP) && /allocateDAL\(root, topDal, new Set\(\), undefined, dalCtx\)/.test(HELP));
check('F7: the all-trees sweep passes it for every root', /SLF3061\.contextFor\(fha\.severity, projectConfig\)/.test(MISC) && /allocateDAL\(j\.page\.root, j\.topDal, new Set\(\), cmaSet, j\.ctx\)/.test(MISC));
const allocSrc = extract(SUP, 'allocateDAL');
const recursive = (allocSrc.match(/allocateDAL\(/g) || []).length - 1, withCtx = (allocSrc.match(/allocateDAL\([^;]*, ctx\)/g) || []).length;
check('F7: every recursive call inside the allocator carries the context', recursive > 0 && recursive === withCtx - 1, recursive + ' calls, ' + (withCtx - 1) + ' with ctx');
check('F7: the requirement register explains a Table 1 allocation', /d\.basis === 'f3061'/.test(ASR) && /ASTM F3061 §4\.2\.5, Table 1/.test(ASR));
check('F7: the reference table shows Table 1 on a Part 23 Table 1 project', /SLF3061\.method\(projectConfig\) === 'f3061'/.test(HELP) && /Primary and secondary DALs &mdash; ASTM F3061 Table 1/.test(HELP));
check('F7: the project setting is wired both ways', /id="proj-part23-dal-method"/.test(IDX) && /projectConfig\.part23DalMethod = dalMethodSel\.value === 'arp4754'/.test(HELP) && /dalMethodSel\.value = projectConfig\.part23DalMethod === 'arp4754'/.test(SUP));
check('F7: the module is loaded by the page before first use', /<script src="f3061_dal\.js\?v=[\d.]+" defer><\/script>/.test(IDX));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
