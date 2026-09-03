#!/usr/bin/env node
/*
 * Regression — F1 quick fix: meta.project must carry the REAL project name.
 *
 * The bug: _repeatabilitySnapshot() (ai_assistant.js) and the sentinel body
 * (notify_agents.js) both read projectConfig.projectName || projectConfig.name
 * — keys that no code path ever sets. The project's name lives in the
 * standalone global `projectName` (bindings_modules.js), the same source
 * cloud_sync.js and helpers_modules.js read. Result: every repeatability
 * export shipped with meta.project === '' on first production use.
 *
 * Promises under test:
 *   P1  ai_assistant.js meta.project evaluates to the global projectName.
 *   P2  It does so even when projectConfig exists WITHOUT name keys (the
 *       exact production shape) — kills a revert to the old expression.
 *   P3  Missing/blank global degrades to '' (ai) / 'Untitled project' (na),
 *       never a throw.
 *   P4  notify_agents.js body.project evaluates to the global projectName.
 *
 * Executed against the REAL shipped expressions, extracted verbatim from the
 * two files and run in a vm sandbox — never a re-implementation.
 *
 * Run: node tests/regression_f1_meta_project.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');

// Pull the exact shipped right-hand expression for a `project:` property line.
function extractExpr(src, file) {
    const m = src.match(/^\s*project:\s*(.+?),?\s*(?:\/\/.*)?$/m);
    if (!m) throw new Error('project: line not found in ' + file);
    return m[1].replace(/,\s*$/, '');
}
function evalIn(expr, ctxVars) {
    const ctx = vm.createContext(Object.assign({}, ctxVars));
    return vm.runInContext('(' + expr + ')', ctx);
}

const aiExpr = extractExpr(read('ai_assistant.js'), 'ai_assistant.js');
const naExpr = extractExpr(read('notify_agents.js'), 'notify_agents.js');

// P1 — the global is the source of truth
check('P1 ai: global projectName wins',
    evalIn(aiExpr, { projectName: 'Aeolus X9' }) === 'Aeolus X9');

// P2 — the production shape that produced the empty export: projectConfig
// present, no projectName/name keys, global set. The OLD expression returns
// '' here; the fix must return the name. This is the mutation-killer.
check('P2 ai: projectConfig without name keys cannot mask the global',
    evalIn(aiExpr, { projectName: 'Aeolus X9', projectConfig: { regulation: 'Part 25', markovModels: [] } }) === 'Aeolus X9');

// P3 — degraded shapes never throw, land on documented fallbacks
check('P3a ai: no globals at all -> empty string', evalIn(aiExpr, {}) === '');
check('P3b ai: whitespace-only name -> empty string', evalIn(aiExpr, { projectName: '   ' }) === '');
check('P3c na: no globals -> Untitled project', evalIn(naExpr, {}) === 'Untitled project');

// P4 — sentinel body carries the same real name
check('P4 na: global projectName wins',
    evalIn(naExpr, { projectName: 'Halcyon HX-1', projectConfig: {} }) === 'Halcyon HX-1');

// P5 — neither file still consults the phantom keys on this line
check('P5 phantom keys gone from both project lines',
    !/projectConfig\.projectName/.test(aiExpr) && !/projectConfig\.projectName/.test(naExpr));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
