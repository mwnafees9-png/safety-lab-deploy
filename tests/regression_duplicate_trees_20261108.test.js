#!/usr/bin/env node
/*
 * Regression: one fault tree per failure condition, in any state; the duplicates already saved are cleaned up when a
 * project opens, keeping the real work (8 Nov 2026, live student data: fc_auto_trees.js v1.8, fta_dedupe.js v1.0).
 *
 * WHAT HAPPENED: a collaborator's screen built the 11 auto tree pages from their shells before the nodes arrived
 *   (crdt_sync.js _ftaRecompose: root null). treeFor skipped a page with no root, so the sweep made 11 new trees in one
 *   millisecond and make() suffixed each id (fc-auto-ac-FC-01-mw88sosh).
 * HOUSE RULES (Waqas): "no half ass fixes / measures", "we always go for the gold star implementation, we are not going
 *   to be a company with a tonne of bugs", "if anything needs rebuilding we do that now"; 30 Oct 2026: no duplicates
 *   anywhere, neither the AI nor the tool may create duplicate rows, analyses or trees.
 * Fixture: made-up project of the shape in the brief (11 AFHA failure conditions, one system with a traced SFHA one).
 * CHECKS:
 *   [R]  REPRODUCED ON THE BASE (pristine fc_auto_trees.js at 195ac9f, when /home/claude/sla is present): pages present,
 *        roots null, one sweep: copies with suffixed ids appear.
 *   [W]  fixed: the same sweep makes nothing and waits; the nodes arrive, the next sweep makes nothing either.
 *   [I]  treeFor finds the tree in any state: nodes pending, obsolete, a hand-made tree linked to the rows; a copy
 *        under review is never the tree.
 *   [M]  make() never suffixes: it returns the condition's tree, and adopts a page already holding the condition's id.
 *   [F]  fc_tree_flow.js Create fault tree returns the condition's tree while its nodes are pending.
 *   [C]  the cleanup: 11 untouched AC copies and the one-node PSSA stub retired to projectConfig.retiredDuplicateTrees
 *        (nothing deleted, journaled); the 24-event PSSA original is byte for byte as it was; a copy with an extra
 *        event has it merged under the original's top gate (mergedFrom) and is retired; a copy with a branch of its own
 *        stays, flagged duplicateOf + dupReview, labelled in the picker, left out of the sweep and the targets.
 *   [P]  everything that pointed at a retired copy points at the original: the open tree, a verification tree, a
 *        transfer gate, a requirement's page id.
 *   [D]  idempotent; pending pages wait; restore() brings a copy back as its own tree and takes its merged events out
 *        of the original; Merge into original / Keep as its own tree.
 * MUTATION PROOFS: SL_DUP_MUTATE=rootskip (treeFor skips a page with no root again), =suffix (make suffixes again),
 *   =keepall (every copy flagged for review, nothing retired), =nomerge (extra events not merged), =norepoint (nothing
 *   re-pointed). Each turns this red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_duplicate_trees_20261108.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const PRISTINE = '/home/claude/sla/site/fc_auto_trees.js';
const MUT = process.env.SL_DUP_MUTATE || '';
function mutate(file, body) {
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation anchor missing in ' + file + ': ' + a.slice(0, 60)); return body.replace(a, b); };
    if (file === 'fc_auto_trees.js') {
        if (MUT === 'rootskip') body = rep("if (!p || p.verifies || p.duplicateOf || (p.mode || 'top-down') !== 'top-down') return false;", "if (!p || !p.root || p.verifies || p.duplicateOf || (p.mode || 'top-down') !== 'top-down') return false;").replace("if (!t.root) { waiting++; return; }", '');
        if (MUT === 'suffix') body = rep('if (taken) return _adopt(taken, g);', "var page0 = null;").replace('page.autoFcTree.fp = shapeFp(rootN);', "while (_pages().some(function (p) { return p && p.id === page.id; })) page.id += '-' + Date.now().toString(36);\n        page.autoFcTree.fp = shapeFp(rootN);");
    }
    if (file === 'fta_dedupe.js') {
        if (MUT === 'keepall') body = rep("if (why) return { kind: 'review', extras: [], reason: why };", "if (true) return { kind: 'review', extras: [], reason: why || 'mutated' };");
        if (MUT === 'nomerge') body = rep("if (extras.length) return { kind: 'merge',", "if (false) return { kind: 'merge',");
        if (MUT === 'norepoint') body = rep('    function _repoint(from, to) {\n', '    function _repoint(from, to) { return;\n');
    }
    return body;
}

// ---- a sandbox per load: the project stores are its globals --------------------------------------------------------
function sandbox(files, data) {
    const ctx = Object.assign({ console, Date, JSON, Math, Set, Map, Object, Array, String, Number, RegExp, Promise, setTimeout: () => 0, clearTimeout: () => {}, internalIdCounter: 5000 }, data);
    ctx.window = ctx; ctx.globalThis = ctx;
    ctx.SLEnv = { get: n => ctx[n] };
    ctx.journal = []; ctx.jrnl = (k, m) => ctx.journal.push({ k, m });
    ctx.scheduleAutosave = () => {};
    vm.createContext(ctx);
    files.forEach(f => { const src = f.startsWith('/') ? f : path.join(SITE, f); vm.runInContext(mutate(path.basename(src), fs.readFileSync(src, 'utf8')), ctx, { filename: src }); });
    return ctx;
}
const clone = x => JSON.parse(JSON.stringify(x));

// ---- the fixture (made-up names and ids) -----------------------------------------------------------------------------
function fixture() {
    const acFhaData = [];
    for (let i = 1; i <= 11; i++) {
        const id = 'FC-' + String(i).padStart(2, '0');
        acFhaData.push({ internalId: 100 + i, fcId: id, fcDesc: 'Test aircraft condition ' + i, subId: 'AF' + i, severity: 'Hazardous', phases: 'Cruise' });
    }
    const systemsData = [{ id: 'sys-7', name: 'Test System', functions: [{ internalId: 701, funcId: 'F02', funcName: 'Process roll command' }],
        fcim: [], req: [],
        fha: [{ internalId: 801, fcId: 'FC02.1', fcDesc: 'Loss of test roll function', subId: 'F02', severity: 'Hazardous', acTrace: 'FC-01', phases: 'Cruise' }] }];
    return { acFhaData, systemsData, acFcimData: [], acExtractedFCs: [], acFunctionsData: [], acReqData: [], projectConfig: {}, ftaPages: [], activeFTAPageId: null };
}

(async function main() {
    // ===== [R] the cause, on the base ===============================================================================
    {
        const fx = fixture();
        const live = sandbox(['fc_auto_trees.js'], fx);
        const first = live.SLFcTrees.sweep({ quiet: true });
        check('[R] the fixture: one sweep makes the 12 trees (11 PASA, 1 PSSA)', first.made.length === 12, JSON.stringify(first.made));
        const shells = live.ftaPages.map(p => Object.assign(clone(p), { root: null }));
        if (fs.existsSync(PRISTINE) && !MUT) {
            const base = sandbox([PRISTINE], Object.assign(fixture(), { ftaPages: clone(shells) }));
            const r = base.SLFcTrees.sweep({ quiet: true });
            const suffixed = base.ftaPages.filter(p => /^fc-auto-.*-[a-z0-9]{6,}$/.test(p.id) && /-(FC-\d\d|FC02_1)-[a-z0-9]+$/.test(p.id));
            check('[R] REPRODUCED on the base: pages present with roots null, the sweep makes copies with suffixed ids', r.made.length === 12 && suffixed.length === 12 && base.ftaPages.length === 24, r.made.slice(0, 3).join(', '));
        } else console.log('  note  pristine base not present (or a mutation run): the base reproduction did not run');
        // ===== [W] fixed: waits =====
        const fixed = sandbox(['fc_auto_trees.js'], Object.assign(fixture(), { ftaPages: clone(shells) }));
        const r2 = fixed.SLFcTrees.sweep({ quiet: true });
        check('[W] fixed: roots null, the sweep makes nothing and waits on all 12 conditions', r2.made.length === 0 && r2.waiting === 12 && fixed.ftaPages.length === 12, JSON.stringify({ made: r2.made, waiting: r2.waiting, n: fixed.ftaPages.length }));
        check('[W] nothing is asked about or removed while the nodes are pending', r2.gone.length === 0 && r2.ask.length === 0);
        fixed.ftaPages.forEach((p, i) => { p.root = clone(live.ftaPages[i].root); });
        const r3 = fixed.SLFcTrees.sweep({ quiet: true });
        check('[W] the nodes arrive: the next sweep makes nothing, still 12 trees, no suffixed id', r3.made.length === 0 && fixed.ftaPages.length === 12 && !fixed.ftaPages.some(p => /-[a-z0-9]{8}$/.test(p.id) && !/FC/.test(p.id.slice(-8))));
    }

    // ===== [I] [M] [F] identity, make, Create fault tree =================================================================
    {
        const fx = fixture();
        const ctx = sandbox(['fc_auto_trees.js', 'fc_tree_flow.js'], fx);
        ctx.SLFcTrees.sweep({ quiet: true });
        const T = ctx.SLFcTrees, g1 = T.groups('ac').find(g => g.fcId === 'FC-01'), gs = T.groups(ctx.systemsData[0])[0];
        const own = T.treeFor(g1);
        own.root = null;
        check('[I] a tree with its nodes pending is still the tree', T.treeFor(g1) === own);
        own.obsolete = true;
        check('[I] an obsolete tree is still the tree', T.treeFor(g1) === own);
        const n0 = ctx.ftaPages.length;
        const m = T.makeTree(g1);
        check('[M] makeTree on a condition with a tree (nodes pending, obsolete) returns it, nothing new', m === own && ctx.ftaPages.length === n0);
        // a page already holding the condition's id, not linked and made by hand: adopted
        const g2 = T.groups('ac').find(g => g.fcId === 'FC-02'), t2 = T.treeFor(g2);
        ctx.ftaPages.splice(ctx.ftaPages.indexOf(t2), 1);
        ctx.ftaPages.push({ id: 'fc-auto-ac-FC-02', name: 'held id', treeLevel: 'standalone', mode: 'top-down', root: null });
        const a = T.makeTree(g2);
        check('[M] a page already holding the condition\'s id is adopted (never a suffixed second page)', a.id === 'fc-auto-ac-FC-02' && a.treeLevel === 'aircraft' && a.autoFcTree && a.autoFcTree.key === 'fc:FC-02' && ctx.ftaPages.filter(p => /^fc-auto-ac-FC-02/.test(p.id)).length === 1, JSON.stringify(ctx.ftaPages.filter(p => /FC-02/.test(p.id)).map(p => p.id)));
        // a hand-made tree linked to a condition's rows is its tree
        const g3 = T.groups('ac').find(g => g.fcId === 'FC-03'), t3 = T.treeFor(g3);
        ctx.ftaPages.splice(ctx.ftaPages.indexOf(t3), 1);
        const hand = { id: 'page-hand-1', name: 'My tree', treeLevel: 'aircraft', mode: 'top-down', linkedFhaIds: [g3.gov.internalId], root: { id: 1, type: 'gate', gateType: 'OR', children: [] } };
        ctx.ftaPages.push(hand);
        const r = T.sweep({ quiet: true });
        check('[I] a hand-made tree linked to the rows is the tree: the sweep makes none for it', T.treeFor(g3) === hand && r.made.indexOf('fc-auto-ac-FC-03') < 0);
        // a copy under review is never the tree
        const t4 = T.treeFor(T.groups('ac').find(g => g.fcId === 'FC-04'));
        ctx.ftaPages.push(Object.assign(clone(t4), { id: 'fc-auto-ac-FC-04-zz11yy22', duplicateOf: t4.id, dupReview: { reason: 'x', at: 'y' } }));
        check('[I] a copy flagged for review is never returned as the tree', T.treeFor(T.groups('ac').find(g => g.fcId === 'FC-04')) === t4);
        // Create fault tree (fc_tree_flow.js) while the PSSA tree's nodes are pending
        void gs;
        // fc_tree_flow.js keeps fcTreeCreate private (its window hook opens the canvas): the test exposes it from the source
        const src = fs.readFileSync(path.join(SITE, 'fc_tree_flow.js'), 'utf8');
        check('[F] fc_tree_flow.js finds the condition\'s tree in any state (no root skip, asks fc_auto_trees treeFor first)', /function _linkedTree\(fha\) \{[\s\S]{0,400}T\.treeFor\(g\)[\s\S]{0,300}if \(!p \|\| p\.verifies \|\| p\.duplicateOf\) return false;/.test(src) && !/function _linkedTree\(fha\) \{[\s\S]{0,700}!p\.root/.test(src));
        const ctxF = sandbox(['fc_auto_trees.js'], fixture());
        ctxF.SLFcTrees.sweep({ quiet: true });
        const flowSrc = mutate('fc_tree_flow.js', src).replace("window.fcFlowCreate = function", "window.__fcTreeCreate = fcTreeCreate; window.fcFlowCreate = function");
        vm.runInContext(flowSrc, ctxF);
        const pss = ctxF.SLFcTrees.treeFor(ctxF.SLFcTrees.groups(ctxF.systemsData[0])[0]); pss.root = null;
        const nF = ctxF.ftaPages.length;
        const got = ctxF.__fcTreeCreate('sys-7', 801);
        check('[F] Create fault tree on a condition whose tree has its nodes pending returns that tree, makes none', got === pss && ctxF.ftaPages.length === nF, got && got.id);
    }

    // ===== [C] [P] [D] the cleanup ===================================================================================
    {
        const fx = fixture();
        const ctx = sandbox(['fc_auto_trees.js', 'fta_dedupe.js'], fx);
        ctx.SLFcTrees.sweep({ quiet: true });
        const T = ctx.SLFcTrees;
        // the PSSA original: 24 events with probabilities, worked by hand
        const ps = ctx.ftaPages.find(p => p.id === 'fc-auto-sys-7-FC02_1');
        ps.root.children = [];
        for (let i = 1; i <= 24; i++) ps.root.children.push({ id: 9000 + i, logicalId: 9000 + i, type: 'basic', name: 'Test cause ' + i, probability: 1e-9 * i, inputMode: 'probability', children: [] });
        ps.root.prescribedRate = false;
        const psBefore = JSON.stringify(ps);
        // the copies a collaborator's screen made, one millisecond apart (the old make(): base id + time suffix)
        const sfx = 'mw88sosh';
        const copies = ctx.ftaPages.filter(p => /^fc-auto-ac-/.test(p.id)).map(p => {
            const c = clone(p); c.id = p.id + '-' + sfx; c.autoFcTree.at = '2026-11-08T21:00:00.000Z'; return c;
        });
        // the PSSA copy: a one-node stub
        const psCopy = Object.assign(clone(ps), { id: ps.id + '-' + sfx, root: { id: 9500, logicalId: 9500, type: 'gate', gateType: 'OR', name: ps.root.name, children: [] } });
        psCopy.autoFcTree = Object.assign({}, ps.autoFcTree, { at: '2026-11-08T21:00:00.000Z', fp: T.shapeFp(psCopy.root) });
        // FC-05's copy gets an extra event (merge); FC-06's copy a branch of its own (review)
        const c5 = copies.find(c => /FC-05-/.test(c.id)), c6 = copies.find(c => /FC-06-/.test(c.id));
        c5.root.children.push({ id: 9601, logicalId: 9601, type: 'basic', name: 'Extra test cause', probability: 0, children: [] });
        c6.root.children.push({ id: 9701, logicalId: 9701, type: 'gate', gateType: 'AND', name: 'Own branch', children: [{ id: 9702, logicalId: 9702, type: 'basic', name: 'Leaf A', children: [] }, { id: 9703, logicalId: 9703, type: 'basic', name: 'Leaf B', children: [] }] });
        copies.forEach(c => ctx.ftaPages.push(c));
        ctx.ftaPages.push(psCopy);
        // references to copies
        const c1 = copies.find(c => /FC-01-/.test(c.id)), c2 = copies.find(c => /FC-02-/.test(c.id));
        ctx.activeFTAPageId = c1.id;
        ctx.ftaPages.push({ id: 'ver-c2', name: 'Verification of copy', verifies: c2.id, mode: 'bottom-up', treeLevel: 'aircraft', root: { id: 9801, type: 'gate', gateType: 'OR', children: [] } });
        ctx.ftaPages.push({ id: 'page-int', name: 'Integrated', treeLevel: 'standalone', mode: 'top-down', root: { id: 9901, type: 'gate', gateType: 'OR', children: [{ id: 9902, type: 'transfer', name: 'To copy', linkedPageId: c1.id, children: [] }] } });
        ctx.acReqData.push({ internalId: 1, traceId: 'FC-01', reqSource: { sourceId: 'ac:fta:prob:x', context: { pageId: c1.id } } });
        const before = ctx.ftaPages.length;
        const r = ctx.SLFtaDedupe.run({ quiet: true });
        const retired = (ctx.projectConfig.retiredDuplicateTrees || []);
        check('[C] 12 duplicate groups found', r.groups === 12, JSON.stringify(r));
        check('[C] 9 untouched AC copies, the merged FC-05 copy and the PSSA stub retired (11), one left for review', r.retired.length === 11 && r.review.length === 1 && r.review[0] === c6.id, JSON.stringify({ retired: r.retired.length, review: r.review }));
        check('[C] retired copies are kept whole in projectConfig.retiredDuplicateTrees (page, duplicateOf, reason, at), not deleted', retired.length === 11 && retired.every(e => e.page && e.page.root && e.duplicateOf && e.reason && e.at) && retired.find(e => e.page.id === psCopy.id).duplicateOf === ps.id);
        check('[C] they left ftaPages', ctx.ftaPages.length === before - 11 && !ctx.ftaPages.some(p => r.retired.indexOf(p.id) >= 0));
        check('[C] the 24-event PSSA original is exactly as it was', JSON.stringify(ps) === psBefore && ctx.ftaPages.indexOf(ps) >= 0);
        const o5 = ctx.ftaPages.find(p => p.id === 'fc-auto-ac-FC-05');
        const merged = o5.root.children.filter(n => n.mergedFrom === c5.id);
        check('[C] the FC-05 copy\'s extra event is under the original\'s top gate, tagged mergedFrom, with a fresh id', merged.length === 1 && merged[0].name === 'Extra test cause' && merged[0].id !== 9601 && merged[0].mergedFromNode === 9601);
        check('[C] the copy with a branch of its own stays, flagged duplicateOf + dupReview with the reason', c6.duplicateOf === 'fc-auto-ac-FC-06' && c6.dupReview && /branch of its own/.test(c6.dupReview.reason) && ctx.ftaPages.indexOf(c6) >= 0, JSON.stringify(c6.dupReview));
        check('[C] the picker label says it in plain words', ctx.SLFtaDedupe.label(c6) === ' (Duplicate of ' + ctx.ftaPages.find(p => p.id === 'fc-auto-ac-FC-06').name + ': holds work the original lacks, review and merge)', ctx.SLFtaDedupe.label(c6));
        check('[C] every action journaled', ctx.journal.filter(j => j.k === 'tree-duplicate-retired').length === 11 && ctx.journal.filter(j => j.k === 'tree-duplicate-review').length === 1);
        check('[C] no em dash in anything the cleanup wrote', !/\u2014/.test(JSON.stringify(ctx.journal) + JSON.stringify(retired.map(e => e.reason)) + c6.dupReview.reason));
        // the sweep and the targets leave the copy under review alone
        c6.targetP = 'untouched';
        const s2 = T.sweep({ quiet: true });
        check('[C] the sweep makes nothing after the cleanup and leaves the copy under review out (no target written to it)', s2.made.length === 0 && c6.targetP === 'untouched' && !s2.gone.length);
        const tp = fs.readFileSync(path.join(SITE, 'fta_tree_picker.js'), 'utf8');
        check('[C] the tree picker shows the label and the Merge / Keep bar (fta_tree_picker.js v1.6)', /_dupLabel\(p\)\) \+ '<\/option>'/.test(tp) && /SLFtaDedupe\.decorate\(host, cur\)/.test(tp));
        const dd = fs.readFileSync(path.join(SITE, 'fta_dedupe.js'), 'utf8');
        check('[C] the bar offers Merge into original and Keep as its own tree', /Merge into original<\/button>/.test(dd) && /Keep as its own tree<\/button>/.test(dd));
        // [P] re-pointing
        check('[P] the open tree moved from the retired copy to the original', ctx.activeFTAPageId === 'fc-auto-ac-FC-01');
        check('[P] the copy\'s verification tree now verifies the original (it had none)', ctx.ftaPages.find(p => p.id === 'ver-c2').verifies === 'fc-auto-ac-FC-02');
        check('[P] a transfer gate pointing at the copy points at the original', ctx.ftaPages.find(p => p.id === 'page-int').root.children[0].linkedPageId === 'fc-auto-ac-FC-01');
        check('[P] a requirement holding the copy\'s page id holds the original\'s', ctx.acReqData[0].reqSource.context.pageId === 'fc-auto-ac-FC-01');
        // [D]
        const again = ctx.SLFtaDedupe.run({ quiet: true });
        check('[D] idempotent: a second run does nothing', again.retired.length === 0 && again.review.length === 0 && again.merged.length === 0 && (ctx.projectConfig.retiredDuplicateTrees || []).length === 11);
        const back = ctx.SLFtaDedupe.restore(c5.id);
        check('[D] restore() brings the copy back as its own tree (not an auto tree) and takes its merged event out of the original', back.ok && ctx.ftaPages.some(p => p.id === c5.id && !p.autoFcTree && p.autoFcTreeWas && p.dupKept) && !o5.root.children.some(n => n.mergedFrom === c5.id) && ctx.projectConfig.retiredDuplicateTrees.length === 10);
        const mg = ctx.SLFtaDedupe.mergeIntoOriginal(c6.id);
        const o6 = ctx.ftaPages.find(p => p.id === 'fc-auto-ac-FC-06');
        check('[D] Merge into original: the branch goes under the original\'s top gate, the copy is retired', mg.ok && o6.root.children.some(n => n.name === 'Own branch' && n.mergedFrom === c6.id && n.children.length === 2) && !ctx.ftaPages.some(p => p.id === c6.id));
        // pending: a group whose copy has no root waits
        const fx2 = fixture();
        const ctx2 = sandbox(['fc_auto_trees.js', 'fta_dedupe.js'], fx2);
        ctx2.SLFcTrees.sweep({ quiet: true });
        const o = ctx2.ftaPages.find(p => p.id === 'fc-auto-ac-FC-07');
        const pc = Object.assign(clone(o), { id: o.id + '-' + sfx, root: null });
        ctx2.ftaPages.push(pc);
        const rp = ctx2.SLFtaDedupe.run({ quiet: true });
        check('[D] a copy whose nodes have not arrived waits (pending), nothing done', rp.pending === 1 && rp.retired.length === 0 && ctx2.SLFtaDedupe.pending() && ctx2.ftaPages.indexOf(pc) >= 0);
        pc.root = clone(o.root);
        ctx2.SLFcTrees.tick();
        check('[D] the nodes arrive: the next tick cleans it up first', !ctx2.ftaPages.some(p => p.id === pc.id) && (ctx2.projectConfig.retiredDuplicateTrees || []).length === 1 && !ctx2.SLFtaDedupe.pending());
        // keep as its own tree
        const fx3 = fixture();
        const ctx3 = sandbox(['fc_auto_trees.js', 'fta_dedupe.js'], fx3);
        ctx3.SLFcTrees.sweep({ quiet: true });
        const o8 = ctx3.ftaPages.find(p => p.id === 'fc-auto-ac-FC-08');
        const k8 = Object.assign(clone(o8), { id: o8.id + '-' + sfx }); k8.root.children.push({ id: 1, type: 'gate', gateType: 'AND', name: 'Mine', children: [{ id: 2, type: 'basic', name: 'x', children: [] }] });
        ctx3.ftaPages.push(k8);
        ctx3.SLFtaDedupe.run({ quiet: true });
        ctx3.SLFtaDedupe.keepSeparate(k8.id);
        check('[D] Keep as its own tree: the flag goes, it is no longer an auto tree, the original stays the condition\'s tree', !k8.duplicateOf && !k8.dupReview && !k8.autoFcTree && k8.dupKept && ctx3.SLFcTrees.treeFor(ctx3.SLFcTrees.groups('ac').find(g => g.fcId === 'FC-08')) === o8);
        const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), at = f => html.indexOf('src="' + f);
        check('load order: fta_dedupe.js after fc_auto_trees.js, pinned', at('fta_dedupe.js?v=1.0') > at('fc_auto_trees.js?v=') && /fc_auto_trees\.js\?v=1\.(8|9)"/.test(html));   // 1.9 (10 Nov): transfers and comma traces
    }

    console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? ' (mutation ' + MUT + ')' : ''));
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); process.exit(1); });
