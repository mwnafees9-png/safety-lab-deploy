#!/usr/bin/env node
/*
 * Regression — sse_export.js: the safety-significant events list for
 * in-service monitoring (gap M14). Executes the REAL module on a model with
 * one of each source.
 *
 *   S1  severe aircraft FCs are listed with the certified target and, where a
 *       tree is linked, the rate the argument achieved — found through
 *       linkedFhaIds[], the legacy linkedFhaId, and the 'AC_' form alike
 *       (before 23 Sep 2026 only a verbatim legacy match worked, so the argued
 *       rate was blank for most trees); Major/Minor FCs are not listed; a
 *       traced system FC is not duplicated, an untraced one is listed
 *   S2  CCMR latents, MMEL items (rejected ones left out), operational or
 *       still-open assumptions, and FRACAS findings each become rows
 *   S3  CSV: header, one line per row, quotes escaped
 *   S4  the ASA checklist item: passes when every severe FC is on the list,
 *       and passes (nothing to watch) when there are no severe FCs — it used
 *       to fail forever then
 * Run: node tests/regression_sse_export.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('sse_export.js'), HELP = read('helpers_modules.js');
const extract = (src, name) => { const at = src.indexOf('function ' + name + '('); const open = src.indexOf('{', at); let d = 0; for (let i = open; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) return src.slice(at, i + 1); } } };

function load(g) {
    const sb = Object.assign({ console, Math, JSON, String, Array, Object, Set, Map, Number, isFinite,
        document: { getElementById: () => null }, CKPT_CHECKLISTS: { ASA: [] },
        getSafetyTarget: sev => ({ prob: { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5 }[sev] || null }),
        ftaConfig: { exposureTime: 1 }, systemsData: [], acAssumptionsData: [], ftaPages: [], projectConfig: {} }, g);
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(extract(HELP, '_resolveLinkedFha') + '; function getAllSysFha(){ return []; }', sb, { filename: 'resolver' });
    vm.runInContext(SRC, sb, { filename: 'sse_export.js' });
    return sb;
}

const acFha = [
    { internalId: 11, fcId: 'FC-A', fcDesc: 'Loss of pitch', severity: 'Catastrophic' },
    { internalId: 12, fcId: 'FC-B', fcDesc: 'Loss of braking', severity: 'Hazardous' },
    { internalId: 13, fcId: 'FC-C', fcDesc: 'Loss of nav', severity: 'Catastrophic' },
    { internalId: 14, fcId: 'FC-D', fcDesc: 'Minor thing', severity: 'Major' }
];
const pages = [
    { id: 'p1', root: { probability: 2e-10 }, linkedFhaIds: [11] },          // newer multi-link list
    { id: 'p2', root: { probability: 3e-8 }, linkedFhaId: 'AC_12' },         // legacy field, AC_ form
    { id: 'p3', root: { probability: 4e-10 }, linkedFhaId: 13 },             // legacy field, bare
    { id: 'p4', root: { probability: 9e-3 }, linkedFhaId: 11, verifies: 'p1' },   // a verification mirror — never the argued rate
];
const S = load({
    acFhaData: acFha, ftaPages: pages,
    systemsData: [{ id: 'S1', name: 'Hydraulics', fha: [{ fcId: 'SF-1', severity: 'Hazardous', acTrace: 12 }, { fcId: 'SF-2', fcDesc: 'Untraced', severity: 'Catastrophic' }], asm: [{ asmId: 'ASM-S1', text: 'Pump duty cycle', state: 'Validated', valStrategy: 'fleet data' }] }],
    ccmrLatentSweep: () => [{ event: 'BE-9', name: 'Valve stuck', fcId: 'FC-A', interval: 600, nte: 800.4, lambda: 1e-6, system: 'Hydraulics' }],
    projectConfig: { mmel: { items: [{ id: 'MMEL-1', item: 'Pack 2', category: 'C', tldMaxFH: 120.4 }, { id: 'MMEL-2', item: 'Pack 1', state: 'rejected' }] } },
    acAssumptionsData: [{ asmId: 'ASM-1', text: 'Crew responds in 3 s', state: 'proposed' }, { asmId: 'ASM-2', text: 'Closed, not ops', state: 'Validated', valStrategy: 'analysis' }],
    ramFieldRows: () => [{ verdict: 'finding', f: { beRef: 'BE-4', id: 'FR-1' }, predicted: 8000, point: 3100.2, hit: { node: { name: 'Fuel pump' } } }, { verdict: 'ok', f: { beRef: 'BE-5' } }]
});
const rows = S.sseRows();
const row = id => rows.find(r => r.id === id);

// ---- S1 ---------------------------------------------------------------------------------
check('S1: Catastrophic and Hazardous aircraft FCs are listed with the certified target', /certified ≤ 1\.00e-9\/FH/.test(row('FC-A').expectation) && /certified ≤ 1\.00e-7\/FH/.test(row('FC-B').expectation));
check('S1: the argued rate is found through linkedFhaIds[] (FC-A)', /argued 2\.00e-10\/FH/.test(row('FC-A').expectation), row('FC-A').expectation);
check('S1: …through the legacy field in the AC_ form (FC-B)', /argued 3\.00e-8\/FH/.test(row('FC-B').expectation), row('FC-B').expectation);
check('S1: …and through the legacy field bare (FC-C)', /argued 4\.00e-10\/FH/.test(row('FC-C').expectation), row('FC-C').expectation);
check('S1: a verification mirror is never taken as the argued rate', !/9\.00e-3/.test(row('FC-A').expectation));
check('S1: a Major FC is not on the list', !row('FC-D'));
check('S1: a system FC traced to an aircraft FC is not duplicated; an untraced severe one is listed', !row('SF-1') && row('SF-2') && /untraced/.test(row('SF-2').expectation));

// ---- S2 ---------------------------------------------------------------------------------
check('S2: a CCMR latent carries its inspection interval, NTE and assumed rate', row('BE-9') && row('BE-9').kind === 'latent' && /interval 600 FH, NTE 800 FH/.test(row('BE-9').monitor) && /1\.00e-6/.test(row('BE-9').expectation));
check('S2: MMEL items carry their TLD budget; rejected ones are left out', row('MMEL-1') && /TLD budget 120 FH/.test(row('MMEL-1').expectation) && !row('MMEL-2'));
check('S2: open and operationally-validated assumptions are listed; a validated non-ops one is not',
    row('ASM-1') && /still open/.test(row('ASM-1').monitor) && row('ASM-S1') && /operationally validated/.test(row('ASM-S1').monitor) && !row('ASM-2'));
check('S2: a FRACAS finding is listed with prediction vs observation; an ok one is not', row('BE-4') && /predicted 8000 h · observed 3100 h/.test(row('BE-4').expectation) && !row('BE-5'));

// ---- S3 ---------------------------------------------------------------------------------
const csv = S.sseCsv().split('\n');
check('S3: the CSV has the header and one line per row', csv[0] === '"Kind","ID","Event","What to monitor","Expectation staked by the safety case","Source"' && csv.length === rows.length + 1);
const Q = load({ acFhaData: [{ internalId: 1, fcId: 'FC-Q', fcDesc: 'Says "hello", then fails', severity: 'Hazardous' }] });
check('S3: quotes inside a field are doubled', /"Says ""hello"", then fails"/.test(Q.sseCsv()));

// ---- S4 ---------------------------------------------------------------------------------
const item = S.CKPT_CHECKLISTS.ASA.find(i => i.id === 'sse');
check('S4: the ASA item passes when every severe FC is on the list', item && item.eval().pass === true && /condition\(s\) on the watch list/.test(item.eval().detail));
const N = load({ acFhaData: [{ internalId: 1, fcId: 'FC-M', severity: 'Major' }] });
const nItem = N.CKPT_CHECKLISTS.ASA.find(i => i.id === 'sse');
check('S4: with no severe FCs it passes — nothing to watch is not a failure', nItem.eval().pass === true && /no Catastrophic or Hazardous/.test(nItem.eval().detail));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
