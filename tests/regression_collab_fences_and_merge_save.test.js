#!/usr/bin/env node
/*
 * Regression — the collaboration layer: two dead ITAR fences, and a merged
 * change that was never saved. (5 Sep 2026, build 2 groundwork.)
 *
 * These three defects share one root and it is worth stating once: this codebase
 * loads ~247 CLASSIC scripts, so a top-level `let` lives in the global LEXICAL
 * environment and is NOT a property of `window`. `window.projectConfig` is
 * therefore permanently `undefined`. sl_env.js exists precisely for this.
 *
 * (1) + (2) THE FENCES THAT NEVER FIRED. crdt_sync.js and presence.js both asked
 *     `window.projectConfig && window.projectConfig.isITARControlled` and both
 *     therefore answered FALSE FOR EVERY PROJECT — while crdt_sync's own header
 *     promised it "NEVER runs for ITAR-controlled projects". Collaborative sync
 *     and presence have been running on ITAR projects. Both now read through
 *     SLEnv, without eval (the production CSP blocks eval — that is what hollowed
 *     out lock_seal.js), and both FAIL CLOSED: if the accessor is unavailable the
 *     answer is "treat it as controlled". Fail-open is defensible for an outage
 *     and indefensible for a controlled-data fence.
 *
 * (3) THE MERGE THAT WAS NEVER SAVED. __crdtApply suspends autosave across the
 *     mutation — correct, a write mid-merge could persist a half-applied state —
 *     but nothing scheduled one afterwards. A teammate's change lived only in
 *     this tab's memory until the local user happened to edit something of their
 *     own. Close the tab first and the merge was gone, silently. Rule 26 exists
 *     because data was lost once; this is the same class through another door.
 *
 * Run: node tests/regression_collab_fences_and_merge_save.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const crdt = S('crdt_sync.js'), presence = S('presence.js'), helpers = S('helpers_modules.js'), idx = S('index.html');

// Pull a function's body out by name, WITH COMMENTS STRIPPED.
//
// Stripping is the whole point and it was learned the hard way — three times in
// one session. A check like "this function must not read window.projectConfig"
// matches the comment EXPLAINING that it no longer reads window.projectConfig.
// The same shape bit regression_workspace_membership's policyBody() (it matched
// the broken policy quoted in a migration header) and the crdt_sync header check
// (it matched its own quotation of the wording it replaced). A probe that reads
// the defect it is hunting for, and calls that the current state, is worse than
// no probe: it fails on correct code, and a green run of it proves nothing.
//
// Comments are removed FIRST; every check below therefore runs on executable
// text only, and the explanatory comments in the source can say whatever they
// need to without breaking a test.
function fnBody(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}') {
      depth--;
      if (started && depth === 0) {
        return src.slice(i, j + 1)
                  .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
                  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');  // line comments (not '://')
      }
    }
  }
  return '';
}

console.log('\n[fence] the ITAR fences read app state the one supported way');
for (const [label, src] of [['crdt_sync', crdt], ['presence', presence]]) {
  const b = fnBody(src, '_itar');
  check(label + ': _itar() no longer reads window.projectConfig',
        b.length > 0 && !/window\.projectConfig/.test(b),
        'a top-level let is not a property of window — this returned false for EVERY project');
  check(label + ': it reads through SLEnv instead',
        /SLEnv/.test(b) && /get\('projectConfig'\)/.test(b));
  check(label + ': it does NOT use eval to get there',
        !/eval/.test(b),
        'the production CSP blocks eval — that is what hollowed out lock_seal.js');
  check(label + ': it falls back to the BARE identifier, not window',
        /typeof projectConfig !== 'undefined'/.test(b),
        'these are classic scripts in one global lexical scope — the bare name IS the real variable, which is why the window read was always undefined');
  check(label + ': the accessor is tried BEFORE the bare identifier',
        b.indexOf("E.get('projectConfig')") >= 0 &&
        b.indexOf("E.get('projectConfig')") < b.indexOf("typeof projectConfig !== 'undefined'"),
        'SLEnv is the supported path; the bare read is the fallback');
  check(label + ': it FAILS CLOSED when neither is reachable',
        (b.match(/return true;/g) || []).length >= 2,
        'unknown must mean "treat it as controlled", never "carry on"');
  check(label + ': and still answers true for a genuinely ITAR project',
        /isITARControlled/.test(b));
}

console.log('\n[fence] the header no longer contradicts the code');
// NOTE, and it is the second time tonight: the first version of this check
// failed against a CORRECT file, because the corrected header QUOTED the old
// wording it was replacing and the check matched its own quotation. The same
// shape bit regression_workspace_membership's policyBody(), which matched the
// broken policy quoted in a migration comment. A probe that reads the defect it
// is hunting for, and calls that the current state, is worse than no probe. The
// header now describes the old claim instead of reproducing it verbatim.
check('crdt_sync does not claim to be dormant by default',
      !/inert by default/.test(crdt),
      'flagOn() returns true unless something explicitly disables it');
check('it states the real posture, and that the intended one is still open',
      /DEFAULT ON/.test(crdt) && /O-7/.test(crdt));
{
  // The claim in the header must match the function, whichever way it is set.
  const b = fnBody(crdt, 'flagOn');
  const defaultOn = /return true;\s*\}\s*catch/.test(b) || /\breturn true;/.test(b.split('\n').slice(-4).join('\n'));
  check('the header and flagOn() agree', defaultOn === /DEFAULT ON/.test(crdt),
        'a file that argues with itself is how the dead fence survived for weeks');
}

console.log('\n[merge] a change merged from a teammate is actually saved');
{
  const b = fnBody(helpers, '__crdtApply');
  check('__crdtApply still suspends autosave across the mutation',
        /_autosaveSuspended = true/.test(b),
        'suspending is correct — a write mid-merge could persist a half-applied state');
  check('it restores the previous flag in a finally',
        /finally \{ _autosaveSuspended = prev; \}/.test(b));
  check('and it now schedules a save AFTER the merge',
        /scheduleAutosave\(\)/.test(b),
        'without this a teammate edit lived only in memory until the local user typed something');
  const fin = b.indexOf('finally { _autosaveSuspended = prev; }');
  const sched = b.indexOf('scheduleAutosave()');
  check('the save is scheduled OUTSIDE the suspended region, not inside it',
        fin >= 0 && sched > fin,
        'inside the region the write is exactly what _autosaveSuspended suppresses');
  check('it does not fire when we were already inside a suspended region',
        /if \(!prev\)/.test(b),
        'a project load owns its own save; firing here would fight it');
}

console.log('\n[pins] the changed modules are re-pinned so browsers fetch them');
for (const [f, floor] of [['crdt_sync.js', 1.7], ['presence.js', 1.1], ['helpers_modules.js', 2.86]]) {
  const m = new RegExp(f.replace('.', '\\.') + '\\?v=([0-9.]+)').exec(idx);
  check(f + ' pinned >= ' + floor, !!m && parseFloat(m[1]) >= floor, m ? m[1] : 'no pin found');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
