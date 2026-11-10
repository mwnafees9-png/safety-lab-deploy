#!/usr/bin/env node
/*
 * Regression: removing a SYSTEM function never flags an AIRCRAFT fault tree obsolete; the events linked to the removed
 * rows are marked instead, and aircraft trees flagged that way before are cleared on load (8 Nov 2026, live student
 * data: safety_lab.js installCascadeObsolescence, rename_guard.js v1.7, stale_revive.js v1.0 repairAircraftTrees).
 *
 * WHAT HAPPENED: _cascadeObsoleteForFunction step 4 walked ALL ftaPages and flagged a whole page when any node's
 *   externalSource pointed at a flagged FHA row. PASA trees carry bottom events linked to system FHA rows (SYS_<id>), so
 *   removing a system function flagged aircraft trees whose failure conditions still exist. rename_guard.js rgMarkStale
 *   had the same over-reach across scopes (a system's FC ID deleted marked another system's FCIM rows; and a key still
 *   owned in another scope stopped the marking where it belonged).
 * HOUSE RULES (Waqas): "no half ass fixes / measures", "we always go for the gold star implementation".
 * Fixture: made-up project (one aircraft condition FC-01 whose PASA tree has an event linked to system row FC02.1; a
 *   system with function F02, its FHA, FCIM, requirement and PSSA tree; a second system).
 * CHECKS:
 *   [R]  REPRODUCED ON THE BASE (pristine safety_lab.js, when /home/claude/sla is present): removing system function F02
 *        flags the aircraft PASA tree obsolete.
 *   [S]  fixed, system scope: that system's FCIM, FHA, requirement and PSSA tree are flagged (each with staleParent);
 *        the aircraft tree is not; its event linked to SYS_<row> carries a node-level stale mark (n.obsolete +
 *        obsoleteReason, read by gt_integrity.js); another system's tree is untouched.
 *   [A]  aircraft scope: removing aircraft function AF1 flags the aircraft rows and the aircraft tree linked to them; a
 *        system tree with an event linked to AC_<row> gets a node mark, not a page flag.
 *   [G]  rename_guard.js (the over-reach also REPRODUCED on the pristine base): deleting system A's FC02.1 marks only system A's FCIM row (system B's dangling reference is
 *        left alone); deleting system A's F02 while the aircraft also has an F02 still marks system A's rows and not
 *        the aircraft's; each mark records staleParent.
 *   [L]  load-time repair: an aircraft tree flagged "Parent function ... removed" by a system change, its aircraft
 *        condition still there, is cleared with page.obsoleteHistory and a journal entry; its event linked to the
 *        obsolete system row is marked instead; an aircraft tree flagged by a real aircraft removal keeps its flag.
 * MUTATION PROOFS: SL_CASCADE_MUTATE=allpages (every tree with a linked event flagged as a page again), =globalscope
 *   (rgMarkStale marks every scope again), =norepair (the load repair does nothing). Each turns this red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_cascade_scope_20261108.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const PRISTINE_SL = '/home/claude/sla/site/safety_lab.js';
const MUT = process.env.SL_CASCADE_MUTATE || '';
function mutate(file, body) {
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation anchor missing in ' + file + ': ' + a.slice(0, 60)); return body.replace(a, b); };
    if (file === 'cascade' && MUT === 'allpages') body = rep("if (linked && ownScope(page)) {", "if (linked || JSON.stringify(page.root || null).indexOf('\"targetId\":\"' + prefix) >= 0) {");
    if (file === 'rename_guard.js' && MUT === 'globalscope') body = rep('if (sc) refs = refs.filter(slot => !slot.sc || slot.sc === sc);', '').replace("if (sc ? (liveScoped[kind] && liveScoped[kind].has(sc + '|' + oldKey)) : (liveKeys[kind] && liveKeys[kind].has(oldKey))) return;", 'if (liveKeys[kind] && liveKeys[kind].has(oldKey)) return;');
    if (file === 'stale_revive.js' && MUT === 'norepair') body = rep("            if (!fromSystem || !_acFcExists(rows)) return;", '            return;');
    return body;
}
// the cascade lives in the monolith: its one IIFE is run on its own
function cascadeSrc(file) {
    const s = fs.readFileSync(file, 'utf8');
    const a = s.indexOf('(function installCascadeObsolescence() {'), b = s.indexOf('})();', a);
    if (a < 0 || b < 0) throw new Error('installCascadeObsolescence not found in ' + file);
    return s.slice(a, b + 5);
}
function sandbox(data) {
    const ctx = Object.assign({ console, Date, JSON, Math, Set, Map, Object, Array, String, Number, RegExp, Promise, setTimeout: () => 0, clearTimeout: () => {}, internalIdCounter: 5000 }, data);
    ctx.window = ctx; ctx.globalThis = ctx;
    ctx.SLEnv = { get: n => ctx[n] };
    ctx.journal = []; ctx.jrnl = (k, m) => ctx.journal.push({ k, m });
    ctx.toasts = []; ctx.showToast = m => ctx.toasts.push(m);
    ctx.scheduleAutosave = () => {};
    vm.createContext(ctx);
    return ctx;
}
const run = (ctx, file, src) => vm.runInContext(mutate(file, src), ctx, { filename: file });
function fixture() {
    return {
        acFunctionsData: [{ internalId: 11, subId: 'AF1', subName: 'Test aircraft function' }, { internalId: 12, subId: 'F02', subName: 'Aircraft test function with a shared id' }],
        acFcimData: [{ internalId: 21, subId: 'AF1', tlId: 'FC-01', tlDesc: 'Test aircraft condition', awareness: 'Aware' }],
        acFhaData: [{ internalId: 31, fcId: 'FC-01', fcDesc: 'Test aircraft condition', subId: 'AF1', severity: 'Hazardous' }, { internalId: 32, fcId: 'FC-09', fcDesc: 'Aircraft row on F02', subId: 'F02', severity: 'Major' }],
        acExtractedFCs: [{ fcId: 'FC-01' }], acReqData: [{ internalId: 41, traceId: 'AF1', reqSource: {} }],
        systemsData: [
            { id: 'sys-7', name: 'Test System', functions: [{ internalId: 71, funcId: 'F02', funcName: 'Process roll command' }],
              fcim: [{ internalId: 72, subId: 'F02', tlId: 'FC02.1', tlDesc: 'Loss of test roll function', awareness: 'Unaware' }],
              fha: [{ internalId: 73, fcId: 'FC02.1', fcDesc: 'Loss of test roll function', subId: 'F02', severity: 'Hazardous', acTrace: 'FC-01' }],
              req: [{ internalId: 74, traceId: 'F02', reqSource: {} }] },
            { id: 'sys-8', name: 'Other System', functions: [{ internalId: 81, funcId: 'F05', funcName: 'Other test function' }],
              fcim: [{ internalId: 82, subId: 'F05', tlId: 'FC02.1', tlDesc: 'dangling reference', awareness: 'Aware' }],
              fha: [{ internalId: 83, fcId: 'FC05.1', fcDesc: 'Other test condition', subId: 'F05', severity: 'Major' }], req: [] }
        ],
        ftaPages: [
            { id: 'fc-auto-ac-FC-01', name: 'PASA · FC-01 Test aircraft condition', treeLevel: 'aircraft', mode: 'top-down', linkedFhaIds: [31],
              root: { id: 1, type: 'gate', gateType: 'OR', name: 'Test aircraft condition', children: [{ id: 2, type: 'basic', name: 'Test System: Loss of test roll function', externalSource: { kind: 'fha', targetId: 'SYS_73' }, children: [] }] } },
            { id: 'fc-auto-sys-7-FC02_1', name: 'PSSA · FC02.1', treeLevel: 'system', systemId: 'sys-7', mode: 'top-down', linkedFhaIds: [73],
              root: { id: 3, type: 'gate', gateType: 'OR', name: 'Loss of test roll function', children: [{ id: 4, type: 'basic', name: 'Uses aircraft row', externalSource: { kind: 'fha', targetId: 'AC_31' }, children: [] }] } },
            { id: 'fc-auto-sys-8-FC05_1', name: 'PSSA · FC05.1', treeLevel: 'system', systemId: 'sys-8', mode: 'top-down', linkedFhaIds: [83],
              root: { id: 5, type: 'gate', gateType: 'OR', name: 'Other', children: [{ id: 6, type: 'basic', name: 'also linked', externalSource: { kind: 'fha', targetId: 'SYS_73' }, children: [] }] } }
        ],
        projectConfig: {}
    };
}
const find = (ctx, id) => ctx.ftaPages.find(p => p.id === id);

(function main() {
    // ===== [R] the cause, on the base =====
    if (fs.existsSync(PRISTINE_SL) && !MUT) {
        const b = sandbox(fixture());
        run(b, 'cascade', cascadeSrc(PRISTINE_SL));
        b._cascadeObsoleteForFunction(b.systemsData[0].functions[0], 'system', b.systemsData[0]);
        check('[R] REPRODUCED on the base: removing system function F02 flags the aircraft PASA tree obsolete', find(b, 'fc-auto-ac-FC-01').obsolete === true && /Parent function Process roll command removed/.test(find(b, 'fc-auto-ac-FC-01').obsoleteReason));
    } else console.log('  note  pristine base not present (or a mutation run): the base reproduction did not run');

    // ===== [S] system scope =====
    {
        const c = sandbox(fixture());
        run(c, 'cascade', cascadeSrc(path.join(SITE, 'safety_lab.js')));
        const s7 = c.systemsData[0];
        const counts = c._cascadeObsoleteForFunction(s7.functions[0], 'system', s7);
        const pasa = find(c, 'fc-auto-ac-FC-01'), pssa = find(c, 'fc-auto-sys-7-FC02_1'), other = find(c, 'fc-auto-sys-8-FC05_1');
        check('[S] the aircraft PASA tree is NOT flagged obsolete', !pasa.obsolete, JSON.stringify({ o: pasa.obsolete, r: pasa.obsoleteReason }));
        check('[S] its event linked to the system row carries a node-level stale mark with the reason', pasa.root.children[0].obsolete === true && /Linked FHA row SYS_73 obsolete: Parent function Process roll command removed/.test(pasa.root.children[0].obsoleteReason));
        check('[S] the system\'s own PSSA tree is flagged', pssa.obsolete === true);
        check('[S] the system\'s FCIM, FHA and requirement are flagged', s7.fcim[0].obsolete && s7.fha[0].obsolete && s7.req[0].reqSource.obsolete && s7.req[0].reqSource.orphan);
        const sp = s7.fcim[0].staleParent;
        check('[S] every mark records its parent (kind, scope, systemId, key, name)', sp && sp.kind === 'function' && sp.scope === 'system' && sp.systemId === 'sys-7' && sp.key === 'F02' && sp.name === 'Process roll command' && s7.fha[0].staleParent.key === 'F02' && s7.req[0].staleParent.key === 'F02' && pssa.staleParent.key === 'F02', JSON.stringify(sp));
        check('[S] another system\'s tree is not flagged as a page (its linked event is marked)', !other.obsolete && other.root.children[0].obsolete === true);
        check('[S] the aircraft rows are untouched', !c.acFhaData.some(r => r.obsolete) && !c.acFcimData.some(r => r.obsolete));
        check('[S] counts: 1 tree, 2 events', counts.fta === 1 && counts.nodes === 2, JSON.stringify(counts));
    }
    // ===== [A] aircraft scope =====
    {
        const c = sandbox(fixture());
        run(c, 'cascade', cascadeSrc(path.join(SITE, 'safety_lab.js')));
        c._cascadeObsoleteForFunction(c.acFunctionsData[0], 'aircraft', null);
        const pasa = find(c, 'fc-auto-ac-FC-01'), pssa = find(c, 'fc-auto-sys-7-FC02_1');
        check('[A] removing aircraft function AF1 flags the aircraft rows and the aircraft tree linked to them', c.acFhaData[0].obsolete && c.acFcimData[0].obsolete && pasa.obsolete && pasa.staleParent.scope === 'aircraft');
        check('[A] the system tree is not flagged as a page; its event linked to AC_31 is marked', !pssa.obsolete && pssa.root.children[0].obsolete === true);
    }
    // ===== [G] rename_guard.js scope =====
    if (fs.existsSync('/home/claude/sla/site/rename_guard.js') && !MUT) {
        const b = sandbox(fixture()); b.document = undefined;
        vm.runInContext(fs.readFileSync('/home/claude/sla/site/rename_guard.js', 'utf8'), b);
        b.rgBaseline(); b.systemsData[0].fha.splice(0, 1); b.rgScan();
        check('[R] REPRODUCED on the base: deleting system A\'s FC02.1 also marked system B\'s FCIM row', b.systemsData[1].fcim[0].obsolete === true);
    }
    {
        const c = sandbox(fixture());
        c.document = undefined;
        run(c, 'rename_guard.js', fs.readFileSync(path.join(SITE, 'rename_guard.js'), 'utf8'));
        c.rgBaseline();
        const s7 = c.systemsData[0], s8 = c.systemsData[1];
        s7.fha.splice(0, 1);      // system A's FC02.1 row deleted
        c.rgScan();
        check('[G] deleting system A\'s FC02.1 marks system A\'s FCIM row', s7.fcim[0].obsolete === true && /Failure condition ID FC02\.1 deleted/.test(s7.fcim[0].obsoleteReason));
        check('[G] system B\'s FCIM row naming FC02.1 is left alone (another scope)', !s8.fcim[0].obsolete);
        const sp = s7.fcim[0].staleParent;
        check('[G] the mark records its parent: the failure condition, its scope and its description', sp && sp.kind === 'fha' && sp.scope === 'system' && sp.systemId === 'sys-7' && sp.key === 'FC02.1' && sp.name === 'Loss of test roll function' && sp.field === 'tlId', JSON.stringify(sp));
        const c2 = sandbox(fixture());
        c2.document = undefined;
        run(c2, 'rename_guard.js', fs.readFileSync(path.join(SITE, 'rename_guard.js'), 'utf8'));
        c2.rgBaseline();
        c2.systemsData[0].functions.splice(0, 1);   // system A's F02 deleted; the aircraft still has an F02
        c2.rgScan();
        check('[G] deleting system A\'s F02 while the aircraft also owns an F02 still marks system A\'s rows', c2.systemsData[0].fha[0].obsolete === true && c2.systemsData[0].fcim[0].obsolete === true && c2.systemsData[0].req[0].reqSource.obsolete && c2.systemsData[0].req[0].staleParent.key === 'F02');
        check('[G] ...and not the aircraft\'s row on its own F02', !c2.acFhaData[1].obsolete);
    }
    // ===== [L] load-time repair =====
    {
        const fx = fixture();
        const reason = 'Parent function Process roll command removed';
        const pasa = fx.ftaPages[0];
        pasa.obsolete = true; pasa.obsoleteReason = reason; pasa.obsoletedAt = '2026-11-08T20:00:00.000Z';
        fx.systemsData[0].fha[0].obsolete = true; fx.systemsData[0].fha[0].obsoleteReason = reason;
        // an aircraft tree flagged by a real aircraft removal keeps its flag
        fx.acFhaData.push({ internalId: 33, fcId: 'FC-03', fcDesc: 'Gone aircraft condition', subId: 'AF3', severity: 'Hazardous', obsolete: true, obsoleteReason: 'Parent function AF3 removed' });
        fx.ftaPages.push({ id: 'fc-auto-ac-FC-03', name: 'PASA · FC-03', treeLevel: 'aircraft', mode: 'top-down', linkedFhaIds: [33], obsolete: true, obsoleteReason: 'Parent function AF3 removed', root: { id: 9, type: 'gate', gateType: 'OR', children: [] } });
        const c = sandbox(fx);
        run(c, 'stale_revive.js', fs.readFileSync(path.join(SITE, 'stale_revive.js'), 'utf8'));
        const r = c.SLStaleRevive.repairAircraftTrees();
        const p = find(c, 'fc-auto-ac-FC-01');
        check('[L] the aircraft tree flagged by the system change is cleared', !p.obsolete && !p.obsoleteReason && r.cleared.indexOf(p.id) >= 0, JSON.stringify(r));
        const h = (p.obsoleteHistory || [])[0];
        check('[L] the record is kept in page.obsoleteHistory with the reason, both dates and why', h && h.reason === reason && h.obsoletedAt === '2026-11-08T20:00:00.000Z' && h.clearedAt && h.why === 'aircraft failure condition still exists; a system change does not make an aircraft tree obsolete', JSON.stringify(h));
        check('[L] journaled', c.journal.some(j => j.k === 'tree-obsolete-cleared' && /PASA · FC-01/.test(j.m)));
        check('[L] its event linked to the obsolete system row is marked instead', p.root.children[0].obsolete === true && /Linked FHA row SYS_73 obsolete/.test(p.root.children[0].obsoleteReason) && r.nodes === 1);
        check('[L] an aircraft tree flagged by a real aircraft removal keeps its flag', find(c, 'fc-auto-ac-FC-03').obsolete === true);
        const again = c.SLStaleRevive.repairAircraftTrees();
        check('[L] idempotent', again.cleared.length === 0 && again.nodes === 0);
        check('[L] no em dash in the repair\'s words', !/\u2014/.test(JSON.stringify(p.obsoleteHistory) + JSON.stringify(c.journal)));
    }
    const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), at = f => html.indexOf('src="' + f);
    check('pins: safety_lab.js 65.81, rename_guard.js 1.7, stale_revive.js 1.1 after both', at('safety_lab.js?v=65.81') > 0 && at('rename_guard.js?v=1.7') > 0 && at('stale_revive.js?v=1.1') > at('rename_guard.js?v=1.7') && at('stale_revive.js?v=1.1') > at('fta_dedupe.js?v=1.1'));
    console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? ' (mutation ' + MUT + ')' : ''));
    process.exit(fail ? 1 : 0);
})();
