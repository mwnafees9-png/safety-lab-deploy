#!/usr/bin/env node
/*
 * Regression — the Atomic lint (closed 2 Aug 2026).
 *
 * _SPEC_REQ has always demanded "each requirement is ATOMIC (one
 * characteristic), uses a SINGLE shall" — and then told the model its text is
 * "additionally linted deterministically". For every other syntax rule that
 * was true (imperative present, placeholder markers, the vague list,
 * verification method or quantification, trace resolution). For atomicity it
 * was a bluff: nothing checked it. This suite pins the lint that makes the
 * sentence honest.
 *
 * DESIGN DECISIONS PINNED HERE:
 *  · Imperatives are counted OUTSIDE quoted spans. The §5.3.1.4 operational
 *    generator quotes the credited action statement verbatim (its own rule),
 *    and a "shall" inside the quotation belongs to the quoted procedure.
 *  · "shall not" is ONE imperative, not two.
 *  · RESOLVED 2 Aug 2026 (decision slate #6): the CCMR monitoring-interval
 *    texts used to append "The monitoring function shall satisfy: …" — two
 *    imperatives, one row, a KNOWN TRUE FINDING this suite pinned. Waqas ruled
 *    "split into two linked requirements"; the fta-interval generator now
 *    emits the monitor attribute set as a SECOND, cross-traced atomic
 *    requirement (sourceId `…:fta-interval-monitor:<lid>`, context.pairsWith
 *    back to the interval req, generator key unchanged so the orphan sweep's
 *    exact-match branch still covers it). Section [3] pins the split.
 *
 * Run: node tests/regression_atomicity_lint.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const vv = fs.readFileSync(path.join(SITE, 'vv_validation.js'), 'utf8');
const am = fs.readFileSync(path.join(SITE, 'assurance_modules.js'), 'utf8');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');

// ---- [1] the lint exists and rides the same array as the rest ---------------
console.log('\n[atomic] presence');
check('an atomic lint is registered in LINTS', /id: 'atomic', label: 'Atomic'/.test(vv));
check('_SPEC_REQ still states the rule the lint enforces',
  /ATOMIC \(one characteristic\)/.test(ai) && /SINGLE "shall"/.test(ai));
check('the matrix renders columns FROM the array, so no column count to miscount',
  /LINTS\.map\(l => '<th/.test(vv),
  'HANDOFF §7.3 — assert the invariant (data-driven render), never a literal count');

// ---- [2] executed, same harness as regression_deterministic_split -----------
console.log('\n[atomic] the lint, executed');
const sb = { console, Array, String, RegExp }; vm.createContext(sb);
const lints = (vv.match(/const LINTS = \[[\s\S]*?\n    \];/) || [''])[0];
const vague = (vv.match(/const _VAGUE = \[[\s\S]*?\];/) || [''])[0];
const ph = (vv.match(/const _PLACEHOLDER = [^\n]+/) || [''])[0];
vm.runInContext('function _tracedFcs(){ return []; }\n' + vague + '\n' + ph + '\n' + lints +
    '\n;globalThis.L = {}; LINTS.forEach(l => L[l.id] = l);', sb);
const atomic = sb.L.atomic;
check('the lint was extracted and runs', !!atomic && typeof atomic.run === 'function');
const run = t => atomic.run({ text: t });

check('one shall passes', run('The FCS shall annunciate loss of pitch trim within 1 s.').pass === true);
check('"shall not" is ONE imperative', run('A single zonal event within zone Z1 shall not compromise more than one of FN-1, FN-2.').pass === true);
check('two shalls FAIL', run('The pump shall start within 2 s and the valve shall close within 5 s.').pass === false);
check('shall + must FAIL together', run('The system shall detect the failure. The crew must be alerted.').pass === false);
check('the failure detail counts the imperatives and says what to do',
  /2 imperative statements[\s\S]*split into one per characteristic/.test(run('It shall X. It shall Y.').detail));
check('a quoted "shall" is the procedure\'s, not the requirement\'s',
  run('The flight crew shall perform the recovery task credited by ASM-3: "the pilot shall reduce thrust and extend speedbrakes."').pass === true,
  'the §5.3.1.4 generator quotes the credited action VERBATIM — failing it would punish that rule');
check('curly-quoted spans are stripped too',
  run('The flight crew shall perform the task: “the pilot shall reduce thrust.”').pass === true);
check('no imperative at all still passes here (Stated owns that failure)',
  run('Loss of all hydraulic pressure.').pass === true,
  'two lints failing one defect double-counts it on the matrix');
check('empty text does not throw', (() => { try { return atomic.run({}).pass === true; } catch (_) { return false; } })());

// ---- [3] the deterministic generators, judged by their own lint -------------
// Template texts lifted from assurance_modules.js and instantiated the way the
// generators instantiate them. The point: which engine emissions pass their own
// syntax rule is a RECORDED state, not folklore.
console.log('\n[atomic] engine emissions, judged');
check('FDAL allocation passes', run('The pitch trim function shall be developed to FDAL A.').pass === true);
check('functional-independence passes', run('SYS-1 and SYS-2 shall be functionally independent.').pass === true);
check('interface requirement passes',
  run('The interface from SYS-1 → SYS-2 carrying 429 data shall be defined in ICD-7, with the source of every input, the destination of every output, and the behaviour of the signals fully described.').pass === true);
check('PRA zonal-retention passes',
  run('If the particular risk "rotor burst" occurs within zone(s) Z100, the aircraft shall retain FN-1, FN-2.').pass === true,
  'the quoted threat name is stripped as a quote — and carries no imperative anyway');
check('sensory-channel operational requirement passes',
  run('The information the flight crew requires to perform the task credited by ASM-3 shall be presented via the visual and aural channels during Approach.').pass === true,
  '"and" joins objects of ONE characteristic; the lint keys on imperative count, not conjunctions');
// The CCMR split (decision slate #6, 2 Aug 2026) — see the header. The old
// combined text is kept as a NEGATIVE control: it proves the lint still
// catches the defect the split resolved.
check('negative control: the OLD combined CCMR text still FAILS atomic',
  run('The fuel pump shall be tested for undetected failure at intervals not exceeding 500 hours. The monitoring function shall satisfy: coverage ≥ 0.95; cycle ≤ 60 s.').pass === false,
  'if this passes, the lint regressed — the split would be pointless');
check('SPLIT half 1: the bare interval text passes atomic',
  run('The fuel pump shall be tested for undetected failure at intervals not exceeding 500 hours.').pass === true);
check('SPLIT half 2: the standalone monitoring-function text passes atomic',
  run('The monitoring function for the fuel pump shall satisfy: coverage ≥ 0.95; cycle ≤ 60 s.').pass === true);
check('the generator no longer concatenates the monitor clause onto the interval text',
  !/\+ mClause/.test(am) && !/The monitoring function shall satisfy: ' \+/.test(am));
check('the generator emits the monitor set as its own requirement text',
  /The monitoring function for \$\{subjName\} shall satisfy: \$\{mAttrs\.join\(/.test(am));
check('the monitor requirement carries its own sourceId and a pairsWith cross-trace',
  /fta-interval-monitor:\$\{lid\}/.test(am) && /pairsWith: `\$\{scopeKey\}:fta-interval:\$\{lid\}`/.test(am));
check('the monitor requirement keeps generator \'fta-interval\' so the orphan sweep covers it',
  /generator: 'fta-interval',\s*\n\s*sourceId: `\$\{scopeKey\}:fta-interval-monitor:/.test(am) &&
  // A3 supersession (22 Aug 2026): the sweep branch grew the fta-resource /
  // fta-resource-iface keys — WITH orphan coverage, which is exactly what this
  // check demands of any new key.
  /\(g === 'fta-event' \|\| g === 'fta-interval' \|\| g === 'fta-resource' \|\| g === 'fta-resource-iface'\) && opts\.ftaEvent/.test(am),
  'the sweep branch is an EXACT match on the generator key — a new key would never be swept (HANDOFF §3.1 trap)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
