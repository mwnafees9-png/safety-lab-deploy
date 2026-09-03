#!/usr/bin/env node
/*
 * Regression — demo_kit.js, the shared showcase authoring helpers (4 Aug 2026).
 *
 * slDemoMirror gives every allocation tree its verification mirror. Four demos
 * use it, so a defect here is a defect in all four at once — and the failure
 * mode that matters is silent: a mirror whose TRANSFER still points at the
 * ALLOCATION page measures the budget instead of the as-built figure, and reads
 * perfectly plausible while doing it. These checks EXECUTE the helper rather
 * than reading it.
 *
 * Run: node tests/regression_demo_kit.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
global.window = global;
const { slDemoMirror } = require(path.join(SITE, 'demo_kit.js'));

let _id = 1;
const nextId = () => _id++;
const be = (name, prob, opts) => Object.assign({ id: nextId(), name, type: 'basic', lambda: 0, probability: prob, children: [] }, opts || {});
const gate = (gt, name, kids) => ({ id: nextId(), name, type: 'gate', gateType: gt, probability: 0, children: kids });
const xfer = (linkedPageId, name) => ({ id: nextId(), name, type: 'gate', gateType: 'TRANSFER', linkedPageId, probability: 0, children: [] });

function fixture() {
    const pages = [];
    pages.push({ id: 'pg-sys', name: 'PSSA · System', treeLevel: 'system', systemId: 'sys-a', mode: 'top-down',
        linkedFhaIds: [11, 12], root: gate('AND', 'Both lanes lost', [be('Lane A', 2e-5), be('Lane B', 2e-5, { repairModel: 'periodic', tau: 500, markovModelId: 'mkv-1' })]) });
    pages.push({ id: 'pg-ac', name: 'PASA · Aircraft', treeLevel: 'aircraft', mode: 'top-down',
        linkedFhaIds: [21], root: gate('OR', 'Top', [xfer('pg-sys', 'via the system tree'), be('Direct cause', 1e-6)]) });
    return pages;
}

// ---- [1] the mirror exists and is bound correctly ---------------------------
console.log('\n[demo_kit] mirrors are bound to what they verify');
{
    const pages = fixture();
    const made = slDemoMirror(pages, { nextId });
    check('one mirror per allocation page, appended to the same array',
        made.length === 2 && pages.length === 4 && pages.filter(p => p.verifies).length === 2);
    check('every mirror is bottom-up and names the page it verifies',
        made.every(m => m.mode === 'bottom-up' && pages.some(p => p.id === m.verifies && !p.verifies)));
    check('the failure-condition linkage is IDENTICAL, not merely similar',
        made.every(m => {
            const a = pages.find(p => p.id === m.verifies);
            return JSON.stringify(m.linkedFhaIds) === JSON.stringify(a.linkedFhaIds);
        }),
        'a mirror linked elsewhere is measured against the wrong target and still looks right');
    check('tree level and owning system are carried across',
        made.find(m => m.verifies === 'pg-sys').systemId === 'sys-a' &&
        made.find(m => m.verifies === 'pg-ac').treeLevel === 'aircraft');
    check('mirroring is idempotent — a second call adds nothing',
        (() => { const before = pages.length; slDemoMirror(pages, { nextId }); return pages.length === before; })(),
        'mirrors are skipped as sources because they carry .verifies');
}

// ---- [2] THE failure mode: transfers must follow the mirror ------------------
console.log('\n[demo_kit] transfers are rewritten to the MIRRORED target');
{
    const pages = fixture();
    slDemoMirror(pages, { nextId });
    const m = pages.find(p => p.verifies === 'pg-ac');
    const t = m.root.children.find(c => c.gateType === 'TRANSFER');
    check('a TRANSFER inside a mirror points at the mirror of its target',
        t && t.linkedPageId === 'pg-sys-v',
        'left pointing at pg-sys, the verification tree would roll up the ALLOCATED budget and read as a plausible as-built figure');
    check('…and the allocation page it was cloned from is untouched',
        pages.find(p => p.id === 'pg-ac').root.children.find(c => c.gateType === 'TRANSFER').linkedPageId === 'pg-sys');
}

// ---- [3] quantities: scaled, and only the right ones ------------------------
console.log('\n[demo_kit] as-built quantities');
{
    const pages = fixture();
    slDemoMirror(pages, { nextId, factor: 0.5 });
    const m = pages.find(p => p.verifies === 'pg-sys');
    check('leaf probabilities are scaled by the declared factor',
        Math.abs(m.root.children[0].probability - 1e-5) < 1e-12);
    check('the factor is recorded on the page, so the number is not anonymous',
        m.asBuiltFactor === 0.5);
    check('repair model, τ and Markov linkage survive UNSCALED',
        m.root.children[1].repairModel === 'periodic' && m.root.children[1].tau === 500 &&
        m.root.children[1].markovModelId === 'mkv-1',
        'those describe the design and the maintenance programme, not the achieved figure — scaling them would move the inspection interval');
    check('gates carry no authored probability',
        m.root.probability === 0);
    check('a leaf authored at probability 1 is NOT scaled',
        (() => { const p2 = [{ id: 'pg-x', name: 'X', mode: 'top-down', linkedFhaIds: [1],
                    root: gate('AND', 'top', [be('No independent confirmation available', 1), be('Other', 1e-4)]) }];
                 slDemoMirror(p2, { nextId, factor: 0.8 });
                 const m = p2.find(x => x.verifies === 'pg-x');
                 return m.root.children[0].probability === 1 && Math.abs(m.root.children[1].probability - 8e-5) < 1e-12; })(),
        'a certainty is a statement that a provision does not exist — scaling it to 0.8 reads as "absent 80% of the time" and softens the finding the leaf was written to make');
    check('per-page factors override the default',
        (() => { const p2 = fixture(); slDemoMirror(p2, { nextId, factor: 0.9, factorFor: pg => pg.id === 'pg-ac' ? 0.25 : null });
                 return p2.find(x => x.verifies === 'pg-ac').asBuiltFactor === 0.25 &&
                        p2.find(x => x.verifies === 'pg-sys').asBuiltFactor === 0.9; })());
}

// ---- [4] ids and isolation --------------------------------------------------
console.log('\n[demo_kit] ids and isolation');
{
    const pages = fixture();
    const made = slDemoMirror(pages, { nextId });
    const ids = [];
    pages.forEach(p => (function w(n) { if (!n) return; ids.push(n.id); (n.children || []).forEach(w); })(p.root));
    check('every node id in the project is unique after mirroring',
        new Set(ids).size === ids.length, ids.length + ' nodes, ' + new Set(ids).size + ' distinct');
    check('mirrors are a deep copy — mutating one does not touch its source',
        (() => { const m = made[0]; m.root.children[0].probability = 0.5;
                 return pages.find(p => p.id === m.verifies).root.children[0].probability === 2e-5; })());
    check('displayIds are re-minted, never inherited',
        made.every(m => { let ok = true; (function w(n) { if (!n) return; if (!/^(G|BE)-\d+$/.test(n.displayId || '')) ok = false; (n.children || []).forEach(w); })(m.root); return ok; }));
    check('skip() keeps a page out of the mirror set',
        (() => { const p2 = fixture(); slDemoMirror(p2, { nextId, skip: pg => pg.id === 'pg-ac' });
                 return p2.filter(x => x.verifies).length === 1; })());
    check('a missing nextId is REFUSED, not defaulted',
        (() => { try { slDemoMirror(fixture(), {}); return false; } catch (e) { return /nextId/.test(e.message); } })(),
        'silently minting ids from a private counter is how two demos end up sharing node ids');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
