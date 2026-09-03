#!/usr/bin/env node
/*
 * Regression — INVARIANT REGISTRY INTEGRITY (found live 20 Jul 2026).
 *
 * The blood-earned lesson says invariant ids are a SHARED NAMESPACE. Two
 * separate live bugs proved the existing guards weren't enough:
 *   • INV-28 was registered by BOTH event_trees.js and mod_impact.js with
 *     different checks — invRegister replaces by id, so the mod-drift check
 *     was silently overwritten and never ran.
 *   • hf_assumptions.js registered INV-16 and INV-17 with `kind:`/`title:`
 *     instead of `sev:`/`name:` — the validator rejected them, so two HF
 *     invariants (incl. the workload check the Phases UI advertises) never
 *     registered at all.
 *
 * Uniqueness-of-registered-ids does NOT catch either: a silent overwrite
 * leaves a clean unique survivor set, and a rejected registration just isn't
 * there. The correct guard is at the CALL SITE, static:
 *   [1] every invRegister call uses `sev:` (hard|advisory), never `kind:`.
 *   [2] every invRegister call uses `name:`, never `title:` (invRun reads name).
 *   [3] no id is registered by more than one call site (true collision test).
 *   [4] the id space is contiguous-ish and MC-* ids are distinct from INV-*.
 * Every invRegister call must LAND — that is the invariant this suite protects.
 * Run: node tests/regression_invariant_registry.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const files = fs.readdirSync(SITE).filter(f => f.endsWith('.js'));

// Collect EVERY invariant definition — both the built-in INVARIANTS array in
// invariants.js AND every module's invRegister() call. Uniformly: each
// `id: 'INV-nn'` / `id: 'MC-nn'` occurrence is one definition; read the window
// after it for the sibling fields. This is what makes the collision check
// complete — a module colliding with a BUILT-IN (exactly the INV-28/17 case)
// is only visible if built-ins are in the same set.
const defs = [];
files.forEach(f => {
    const src = fs.readFileSync(path.join(SITE, f), 'utf8');
    const re = /id:\s*'((?:INV|MC)-\d+)'/g;
    let m;
    while ((m = re.exec(src))) {
        const id = m[1];
        const head = src.slice(m.index, m.index + 260);   // id + its sibling fields, before run:
        const clip = head.indexOf('run:') >= 0 ? head.slice(0, head.indexOf('run:')) : head;
        defs.push({
            file: f, id,
            hasSev: /\bsev:\s*'(hard|advisory)'/.test(clip),
            hasKind: /\bkind:\s*'/.test(clip),
            hasName: /\bname:\s*'/.test(clip),
            hasTitle: /\btitle:\s*'/.test(clip)
        });
    }
});
const calls = defs;   // (name kept for the checks below)

check('found the full invariant registry (built-ins + module contributions, ≥ 35 defs)', defs.length >= 35, defs.length + ' defs');

// [1] sev, never kind
const kindOffenders = calls.filter(c => c.hasKind || !c.hasSev);
check('[1] every invRegister uses sev:(hard|advisory), never kind: (the HF INV-16/17 bug)',
    kindOffenders.length === 0, kindOffenders.map(c => c.file + ':' + c.id).join(', '));

// [2] name, never title
const titleOffenders = calls.filter(c => c.hasTitle || !c.hasName);
check('[2] every invRegister uses name:, never title: (invRun reads name)',
    titleOffenders.length === 0, titleOffenders.map(c => c.file + ':' + c.id).join(', '));

// [3] no id registered by two call sites (the true collision test — CALL SITES, not survivors)
const byId = {};
calls.forEach(c => { (byId[c.id] = byId[c.id] || []).push(c.file); });
const collisions = Object.entries(byId).filter(([id, fs2]) => fs2.length > 1);
check('[3] no invariant id registered by two modules (INV-28 collision class)',
    collisions.length === 0, collisions.map(([id, fs2]) => id + ' in {' + fs2.join(', ') + '}').join(' · '));

// [4] the three fixed ids are present and correctly placed
const ids = new Set(calls.map(c => c.id));
check('[4a] INV-34 present (was the overwritten mod-drift INV-28)', ids.has('INV-34'));
check('[4b] INV-35 + INV-36 present (were the rejected HF INV-16/17)', ids.has('INV-35') && ids.has('INV-36'));
check('[4c] the phases UI advertises the LIVE workload id (INV-36, not the dead INV-17)',
    /Feeds INV-36 workload saturation/.test(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8')));

// [5] MC-* moat checks present in the same integrity net
const mcIds = [...new Set(defs.filter(d => d.id.startsWith('MC-')).map(d => d.id))];
check('[5] MC-* moat-check ids present (≥ 5) and swept by the same guards', mcIds.length >= 5, mcIds.join(','));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
