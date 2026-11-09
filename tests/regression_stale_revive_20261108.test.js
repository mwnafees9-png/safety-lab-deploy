#!/usr/bin/env node
/*
 * Regression: a row marked stale because its function or failure condition was removed is relinked when that comes
 * back, automatically when it is the same thing, by asking when it is not (8 Nov 2026, live student data:
 * stale_revive.js v1.0; both markers record staleParent: safety_lab.js cascade, rename_guard.js v1.7).
 *
 * WHAT HAPPENED: the function cascade ("Parent function <name> removed") and rgMarkStale ("STALE <em dash> <label> <key>
 *   deleted", reqSource.obsolete/orphan, staleRefs) set stale flags and nothing ever cleared them: putting the function
 *   or the failure condition back left every row it owned crossed out, the aware/unaware choice locked.
 * HOUSE RULES (Waqas): "no half ass fixes / measures", "we always go for the gold star implementation"; never relink
 *   silently.
 * Fixture: made-up project; the marks are made by the real markers (the cascade IIFE from safety_lab.js and
 *   rename_guard.js) and, for marks from before 8 Nov 2026, written in the old shape with no staleParent.
 * CHECKS:
 *   [R]  REPRODUCED ON THE BASE: with the pristine markers, the function back and the FC ID back, nothing clears (there
 *        is no revive at all: the marks stay).
 *   [N]  names: equal ignoring case/spacing/punctuation, or word overlap (Jaccard) at least 0.6, is the same thing;
 *        "Process roll command" against "Aircraft roll state" is not.
 *   [Q]  an FCIM row flagged because F02 "Process roll command" was removed; F02 comes back as "Aircraft roll state":
 *        asked (naming both), never relinked silently; one question for the three rows F02 owned; "Keep it marked" is
 *        remembered and not asked again; Relink clears with history. The same for an old mark with no staleParent.
 *   [A]  an FCIM row flagged "STALE <em dash> Failure condition ID FC04.1 deleted" (old mark, row's own description);
 *        FC04.1 comes back with the same description: relinked automatically, obsolete gone (the aware/unaware choice
 *        editable again), obsoleteHistory entry {reason, obsoletedAt, clearedAt, why: 'Failure condition FC04.1 came
 *        back'}, journaled.
 *   [T]  the other tables: an FHA row (function cascade) and a requirement (rgMarkStale, orphan cleared) relink the
 *        same way; a staleRefs entry on a zone is removed when its function comes back; a fault tree event follows its
 *        returning failure condition to the new row.
 *   [W]  wiring: runs on load (wraps _applyProjectData after fta_dedupe.js) and after data changes (debounced on
 *        scheduleAutosave, only when SLDataChange moved); no em dash in new words.
 * MUTATION PROOFS: SL_REVIVE_MUTATE=silent (a doubtful return relinks without asking), =noparent (rgMarkStale stops
 *   recording staleParent), =nohistory (no obsoleteHistory kept), =loose (similarity threshold 0.1). Each turns this red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_stale_revive_20261108.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_REVIVE_MUTATE || '';
const EM = '\u2014';
function mutate(file, body) {
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation anchor missing in ' + file + ': ' + a.slice(0, 60)); return body.replace(a, b); };
    if (file === 'stale_revive.js') {
        if (MUT === 'silent') body = rep('            if (_declined(m, sig)) return;', '            _relink(m, sp, why, live); out.relinked++; return;');
        if (MUT === 'nohistory') body = rep('        _history(o, h);\n', '\n');
        if (MUT === 'loose') body = rep('var SIMILAR = 0.6;', 'var SIMILAR = 0.1;');
    }
    if (file === 'rename_guard.js' && MUT === 'noparent') body = rep('tgt.staleParent = Object.assign({}, parent, { field: slot.field });', '').replace('o.staleParent = Object.assign({}, parent);', '');
    return body;
}
function cascadeSrc(file) { const s = fs.readFileSync(file, 'utf8'); const a = s.indexOf('(function installCascadeObsolescence() {'), b = s.indexOf('})();', a); return s.slice(a, b + 5); }
function sandbox(data, answers) {
    const ctx = Object.assign({ console, Date, JSON, Math, Set, Map, Object, Array, String, Number, RegExp, Promise, setTimeout: () => 0, clearTimeout: () => {}, internalIdCounter: 5000 }, data);
    ctx.window = ctx; ctx.globalThis = ctx; ctx.document = undefined;
    ctx.SLEnv = { get: n => ctx[n] };
    ctx.journal = []; ctx.jrnl = (k, m) => ctx.journal.push({ k, m });
    ctx.toasts = []; ctx.showToast = m => ctx.toasts.push(m);
    ctx.asked = []; ctx.answers = answers || [];
    ctx.slChoose = async (msg, choices, opts) => { ctx.asked.push({ msg, choices: choices.map(c => c.label), title: opts && opts.title }); return ctx.answers.length ? ctx.answers.shift() : null; };
    ctx.scheduleAutosave = () => {};
    vm.createContext(ctx);
    return ctx;
}
const load = (ctx, file, src) => vm.runInContext(mutate(file, src != null ? src : fs.readFileSync(path.join(SITE, file), 'utf8')), ctx, { filename: file });
const tick = () => new Promise(r => setImmediate(r));
function fixture() {
    return {
        acFunctionsData: [], acFcimData: [], acFhaData: [], acReqData: [], acExtractedFCs: [], zsaData: [], praData: [], itemsData: [],
        systemsData: [{ id: 'sys-7', name: 'Test System',
            functions: [{ internalId: 71, funcId: 'F02', funcName: 'Process roll command' }, { internalId: 75, funcId: 'F05', funcName: 'Provide test yaw damping' }],
            fcim: [{ internalId: 72, subId: 'F02', tlId: 'FC02.1', tlDesc: 'Loss of test roll', awareness: 'Unaware' },
                   { internalId: 76, subId: 'F02', tlId: 'FC02.2', tlDesc: 'Erroneous test roll', awareness: 'Aware' },
                   { internalId: 77, subId: 'F03', tlId: 'FC04.1', tlDesc: 'Loss of test pitch trim', awareness: 'Aware' }],
            fha: [{ internalId: 73, fcId: 'FC02.1', fcDesc: 'Loss of test roll', subId: 'F02', severity: 'Hazardous' },
                  { internalId: 78, fcId: 'FC05.1', fcDesc: 'Loss of test yaw damping', subId: 'F05', severity: 'Major' },
                  { internalId: 79, fcId: 'FC04.1', fcDesc: 'Loss of test pitch trim', subId: 'F03', severity: 'Major' }],
            req: [{ internalId: 80, traceId: 'FC04.1', reqSource: {} }] }],
        ftaPages: [{ id: 'fc-auto-ac-FC-01', name: 'PASA', treeLevel: 'aircraft', mode: 'top-down', linkedFhaIds: [], root: { id: 1, type: 'gate', gateType: 'OR', children: [{ id: 2, type: 'basic', name: 'pitch trim event', externalSource: { kind: 'fha', targetId: 'SYS_79' }, children: [] }] } }],
        projectConfig: {}
    };
}

(async function main() {
    // ===== [N] names =====
    {
        const c = sandbox(fixture()); load(c, 'stale_revive.js');
        const R = c.SLStaleRevive;
        check('[N] the threshold is 0.6 (Jaccard similarity of the meaningful words)', R.SIMILAR === 0.6 || MUT === 'loose');
        check('[N] "Process roll command" vs "Aircraft roll state": not the same (0.2)', !R.sameThing('Process roll command', 'Aircraft roll state') && Math.abs(R.similarity('Process roll command', 'Aircraft roll state') - 0.2) < 1e-9);
        check('[N] case, spacing and punctuation do not matter', R.sameThing('Loss of test pitch trim', '  loss of TEST pitch-trim. '));
        check('[N] a strong overlap is the same ("Loss of roll control" vs "Total loss of roll control": 0.75)', R.sameThing('Loss of roll control', 'Total loss of roll control'));
        check('[N] an unknown old name is never "the same"', !R.sameThing('', 'Anything'));
    }

    // ===== [R] base: nothing clears =====
    if (fs.existsSync('/home/claude/sla/site/safety_lab.js') && !MUT) {
        const b = sandbox(fixture());
        vm.runInContext(cascadeSrc('/home/claude/sla/site/safety_lab.js'), b);
        const s = b.systemsData[0], f = s.functions[1];
        b._cascadeObsoleteForFunction(f, 'system', s); s.functions.splice(1, 1); s.functions.push(Object.assign({}, f));
        check('[R] REPRODUCED on the base: the function is back with the same name and its FHA row stays obsolete (no revive exists)', s.fha[1].obsolete === true && !s.fha[1].staleParent && !fs.existsSync('/home/claude/sla/site/stale_revive.js'));
    }

    // ===== [Q] a doubtful return asks =====
    {
        const c = sandbox(fixture(), ['keep']);
        load(c, 'cascade', cascadeSrc(path.join(SITE, 'safety_lab.js'))); load(c, 'stale_revive.js');
        const s = c.systemsData[0];
        c._cascadeObsoleteForFunction(s.functions[0], 'system', s);
        s.functions.splice(0, 1);
        check('[Q] the cascade flagged the F02 rows with staleParent "Process roll command"', s.fcim[0].obsolete && s.fcim[0].staleParent.name === 'Process roll command' && s.fcim[1].obsolete && s.fha[0].obsolete);
        const w = c.SLStaleRevive.revive({ noAsk: true });
        check('[Q] while F02 is gone nothing changes (waiting)', w.relinked === 0 && w.asked === 0 && w.waiting >= 3);
        s.functions.push({ internalId: 90, funcId: 'F02', funcName: 'Aircraft roll state' });
        const r = c.SLStaleRevive.revive();
        await tick(); await tick();
        check('[Q] F02 back as "Aircraft roll state": nothing relinked silently', r.relinked === 0 && s.fcim[0].obsolete && s.fcim[1].obsolete && s.fha[0].obsolete);
        check('[Q] ONE question for the three rows F02 owned, naming the old and the new', r.asked === 1 && r.questions[0].rows === 3 && c.asked.length === 1 && /F02 is back, but it was "Process roll command" and it is now "Aircraft roll state"/.test(c.asked[0].msg), JSON.stringify(c.asked));
        check('[Q] the choices are Relink / Keep it marked', !!c.asked[0] && JSON.stringify(c.asked[0].choices) === JSON.stringify(['Relink', 'Keep it marked']));
        check('[Q] "Keep it marked" is remembered on each row', !!(s.fcim[0].staleKeepMarked && Object.keys(s.fcim[0].staleKeepMarked).length === 1));
        const r2 = c.SLStaleRevive.revive(); await tick();
        check('[Q] ...and not asked again', r2.asked === 0 && c.asked.length === 1 && s.fcim[0].obsolete);
        // Relink on a fresh project, and an OLD mark (no staleParent) asks the same way
        const c2 = sandbox(fixture(), ['relink']);
        load(c2, 'stale_revive.js');
        const s2 = c2.systemsData[0];
        s2.fcim[0].obsolete = true; s2.fcim[0].obsoleteReason = 'Parent function Process roll command removed'; s2.fcim[0].obsoletedAt = '2026-11-01T10:00:00.000Z';
        s2.functions[0].funcName = 'Aircraft roll state';
        const r3 = c2.SLStaleRevive.revive(); await tick(); await tick();
        check('[Q] an old mark with no staleParent: parent read from its reason and subId, asked naming both', r3.asked === 1 && !!c2.asked[0] && /it was "Process roll command" and it is now "Aircraft roll state"/.test(c2.asked[0].msg));
        check('[Q] Relink clears it, keeps the history and says who decided', !s2.fcim[0].obsolete && s2.fcim[0].subId === 'F02' && s2.fcim[0].obsoleteHistory && /relinked by the person/.test(s2.fcim[0].obsoleteHistory[0].why) && s2.fcim[0].obsoleteHistory[0].obsoletedAt === '2026-11-01T10:00:00.000Z');
    }

    // ===== [A] an exact return relinks automatically =====
    {
        const c = sandbox(fixture());
        load(c, 'stale_revive.js');
        const s = c.systemsData[0], row = s.fcim[2];
        // an old rgMarkStale mark: no staleParent; the row's own tlDesc is the parent as it was
        row.obsolete = true; row.obsoleteReason = 'STALE ' + EM + ' Failure condition ID FC04.1 deleted'; row.obsoletedAt = '2026-11-02T09:00:00.000Z';
        const fha = s.fha.splice(2, 1)[0];
        const w = c.SLStaleRevive.revive({ noAsk: true });
        check('[A] while FC04.1 is gone the row stays marked', row.obsolete === true && w.relinked === 0);
        s.fha.push(Object.assign({}, fha, { internalId: 99 }));   // FC04.1 back, same description, a new row
        const r = c.SLStaleRevive.revive();
        check('[A] FC04.1 back with the same description: relinked automatically, no question', r.relinked >= 1 && r.asked === 0 && c.asked.length === 0);
        check('[A] the row is no longer obsolete (the aware/unaware choice is editable again), its FC link kept', !row.obsolete && !row.obsoleteReason && row.tlId === 'FC04.1' && row.awareness === 'Aware');
        const h = (row.obsoleteHistory || [])[0];
        check('[A] history kept: {reason, obsoletedAt, clearedAt, why: "Failure condition FC04.1 came back"}', h && h.reason === 'STALE ' + EM + ' Failure condition ID FC04.1 deleted' && h.obsoletedAt === '2026-11-02T09:00:00.000Z' && h.clearedAt && h.why === 'Failure condition FC04.1 came back', JSON.stringify(h));
        check('[A] journaled as a change', c.journal.some(j => j.k === 'stale-relinked' && /FC04\.1 came back/.test(j.m)));
    }

    // ===== [T] the other tables, marks made by the real markers =====
    {
        const c = sandbox(fixture());
        load(c, 'cascade', cascadeSrc(path.join(SITE, 'safety_lab.js')));
        load(c, 'rename_guard.js');
        load(c, 'stale_revive.js');
        const s = c.systemsData[0];
        // FHA row: function F05 removed by the cascade, back as "Provide test yaw damping." (same, punctuation)
        c._cascadeObsoleteForFunction(s.functions[1], 'system', s);
        const f5 = s.functions.splice(1, 1)[0];
        // requirement + FCIM: FC04.1 deleted, caught by rgScan (rgMarkStale)
        c.zsaData.push({ internalId: 1, zoneId: 'Z1', housedFunctions: ['F05'] });
        c.rgBaseline();
        const fc4 = s.fha.splice(2, 1)[0];
        c.rgScan();
        check('[T] rgMarkStale marked the requirement with staleParent (name kept)', s.req[0].reqSource.obsolete && s.req[0].reqSource.orphan && s.req[0].staleParent && s.req[0].staleParent.key === 'FC04.1' && s.req[0].staleParent.name === 'Loss of test pitch trim', JSON.stringify(s.req[0]));
        // the PASA event linked to the FC04.1 row: marked by the aircraft repair vocabulary (node mark)
        const ev = c.ftaPages[0].root.children[0];
        ev.obsolete = true; ev.obsoleteReason = 'Linked FHA row SYS_79 removed'; ev.staleParent = { kind: 'fha', scope: 'system', systemId: 'sys-7', key: 'FC04.1', name: 'Loss of test pitch trim', at: 'x' };
        // a zone's staleRefs entry for F05 (project-wide list)
        c.zsaData[0].staleRefs = [{ kind: 'subId', ref: 'F05', field: 'housedFunctions', reason: 'STALE ' + EM + ' Function ID F05 deleted', at: 'x', staleParent: { kind: 'function', rgKind: 'subId', scope: null, systemId: null, key: 'F05', name: 'Provide test yaw damping', at: 'x' } }];
        s.functions.push(Object.assign({}, f5, { funcName: 'Provide test yaw damping.' }));
        s.fha.push(Object.assign({}, fc4, { internalId: 120 }));
        const r = c.SLStaleRevive.revive();
        check('[T] FHA row (function cascade) relinked when F05 came back the same', !s.fha[1].obsolete && s.fha[1].obsoleteHistory && s.fha[1].obsoleteHistory[0].why === 'Function F05 came back');
        check('[T] requirement (rgMarkStale) relinked: obsolete and orphan cleared, history kept', !s.req[0].reqSource.obsolete && !s.req[0].reqSource.orphan && s.req[0].obsoleteHistory && s.req[0].obsoleteHistory[0].why === 'Failure condition FC04.1 came back');
        check('[T] FCIM row marked by rgMarkStale relinked too', !s.fcim[2].obsolete);
        check('[T] the zone\'s staleRefs entry is removed, history on the zone', !c.zsaData[0].staleRefs && c.zsaData[0].obsoleteHistory && c.zsaData[0].obsoleteHistory[0].ref === 'F05');
        check('[T] the fault tree event is relinked and its link follows the new row (SYS_120)', !ev.obsolete && ev.externalSource.targetId === 'SYS_120' && !!ev.obsoleteHistory && ev.obsoleteHistory[0].linkWas === 'SYS_79');
        check('[T] nothing asked (every return was the same thing)', r.asked === 0 && c.asked.length === 0, JSON.stringify(r.questions));
    }

    // ===== [W] wiring =====
    {
        const src = fs.readFileSync(path.join(SITE, 'stale_revive.js'), 'utf8');
        check('[W] runs on load: wraps _applyProjectData (aircraft repair, then revive)', /root\._applyProjectData = wrapped/.test(src) && /function _onLoad\(\) \{ try \{ repairAircraftTrees\(\);[\s\S]{0,200}revive\(/.test(src));
        check('[W] runs after data changes: debounced on scheduleAutosave, only when SLDataChange moved', /root\.scheduleAutosave = wrapped/.test(src) && /gen === _seen\) return;/.test(src));
        check('[W] no literal em dash in the new module (the old reason is matched through \\u2014)', !/\u2014/.test(src) && !/\u2014/.test(fs.readFileSync(path.join(SITE, 'fta_dedupe.js'), 'utf8')));
        // in a page: the load hook runs the repair and the revive right after the project is applied
        const c = sandbox(fixture()); c.document = {}; c.addEventListener = () => {};
        c._applyProjectData = function () { const s = c.systemsData[0]; s.fcim[2].obsolete = true; s.fcim[2].obsoleteReason = 'STALE ' + EM + ' Failure condition ID FC04.1 deleted'; };
        load(c, 'stale_revive.js');
        c._applyProjectData({});
        check('[W] in a page, applying a project runs the revive: a mark whose parent is there is relinked at once', c._applyProjectData._srWrapped === true && !c.systemsData[0].fcim[2].obsolete && (c.systemsData[0].fcim[2].obsoleteHistory || []).length === 1);
    }

    console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? ' (mutation ' + MUT + ')' : ''));
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); process.exit(1); });
