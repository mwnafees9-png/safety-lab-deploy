#!/usr/bin/env node
/*
 * regression_severity_anchor.test.js — severity-anchoring consistency lever.
 * The same failure condition must classify to the same severity run to run. This block
 * feeds the project's ALREADY-assigned FC→severity classifications into every severity-
 * assigning feature and instructs the model to reproduce them unless the effect changed.
 * Verifies: gated to _SEVERITY_FEATURES; gathers from AFHA + SFHA; skips UNCLASSIFIED;
 * empty project => no block; carries the consistency instruction; wired into the context
 * assembler beside the rubric block; safe (never claims to override engine or human edit).
 * EXECUTES the real _severityAnchorBlock (extracted + stubbed).
 * Run: node tests/regression_severity_anchor.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

console.log('1. present, wired, safe');
check('_severityAnchorBlock defined', /function _severityAnchorBlock\(feature\)/.test(ai));
check('gated to the severity-assigning features', /if \(_SEVERITY_FEATURES\[feature\] !== 1\) return '';/.test(ai.split('function _severityAnchorBlock')[1].split('\n    }')[0]));
check('injected in the context assembler beside the rubric block', /const _sa = _severityAnchorBlock\(feature\);[\s\S]*?sys = sys \+ '\\n\\n' \+ _sa;/.test(ai));
check('carries the run-to-run consistency instruction', /SEVERITY ANCHORING/.test(ai) && /same severity/i.test(ai));
check('permits a justified deviation (not a blind copy)', /Deviate ONLY when the effect has materially changed/.test(ai));
check('states it never overrides the engine or a human edit', /never overrides the deterministic engine or a severity a human has set/.test(ai));

console.log('2. EXECUTED — extract and run the real function');
const fnSrc = (function () {
  const at = ai.indexOf('function _severityAnchorBlock');
  const open = ai.indexOf('{', at);
  let d = 0;
  for (let i = open; i < ai.length; i++) { if (ai[i] === '{') d++; else if (ai[i] === '}') { d--; if (!d) return ai.slice(at, i + 1); } }
  return null;
})();
check('function body extracted', !!fnSrc);

const sandbox = { snapshot: null, _SEVERITY_FEATURES: { 'fha.populate': 1, 'sfha.populate': 1 }, String, RegExp, Object, Array, console };
vm.createContext(sandbox);
vm.runInContext(fnSrc + '; this.__f = _severityAnchorBlock;', sandbox);
const run = (feature, snap) => { sandbox.snapshot = () => snap; return sandbox.__f(feature); };

const project = {
  acFhaData: [
    { fcDesc: 'Total loss of primary flight display', severity: 'Hazardous' },
    { fcDesc: 'Loss of one nav source', severity: 'Major' },
    { fcDesc: 'Nuisance advisory', severity: 'UNCLASSIFIED' }
  ],
  systemsData: [ { name: 'Electrical Power', fha: [ { fcDesc: 'Total loss of AC bus 1', severity: 'Catastrophic' } ] } ]
};

check('non-severity feature => empty block', run('chat.edit', project) === '');
const block = run('fha.populate', project);
check('severity feature => a block is produced', typeof block === 'string' && block.length > 0);
check('anchors the AFHA classifications', /Total loss of primary flight display/.test(block) && /Hazardous/.test(block) && /Loss of one nav source/.test(block) && /Major/.test(block));
check('anchors the SFHA classification with its system scope', /Total loss of AC bus 1/.test(block) && /Catastrophic/.test(block) && /Electrical Power/.test(block));
check('UNCLASSIFIED conditions are NOT anchored (mutation-sensitive)', block.indexOf('Nuisance advisory') === -1);
check('empty/unclassified project => no block (nothing to anchor, fresh draft)',
  run('fha.populate', { acFhaData: [{ fcDesc: 'x', severity: 'UNCLASSIFIED' }], systemsData: [] }) === '');

console.log('\n' + (fail ? ('FAIL — ' + fail + ' failed, ' + pass + ' passed') : ('OK — all ' + pass + ' checks pass')));
process.exit(fail ? 1 : 0);
