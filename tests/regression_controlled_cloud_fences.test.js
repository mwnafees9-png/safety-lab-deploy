#!/usr/bin/env node
/*
 * Regression — the controlled-data cloud fences. (5 Sep 2026)
 *
 * The 5 Sep audit found FIVE ITAR fences and only one worked. crdt_sync and
 * presence were fixed earlier tonight (they read a window property that is
 * permanently undefined, so they answered "not controlled" for every project).
 * This suite covers the paths that had NO fence at all:
 *
 *   · manual Save to cloud      — deliberately left out of the 30 Aug autosave
 *                                 fence as "a deliberate user act"
 *   · Create Revision           — uploads the whole project, INCLUDING the full
 *                                 text of every source document, as a SIDE
 *                                 EFFECT of an action presented as document
 *                                 control; the user is never told
 *   · integrity notifications   — no check of any kind; the payload carries the
 *                                 project name and the system/node names behind
 *                                 every finding, which on a controlled programme
 *                                 can be the sensitive part
 *
 * THE FRAMING MATTERS AND IT IS WAQAS'S (5 Sep): "save to the user/customer
 * cloud, in our instance it will be our own cloud, for them its their server."
 * Saving a controlled project is not wrong in itself — sending it to a
 * destination not approved for controlled data is. Today there is exactly one
 * destination, the shared multi-tenant cloud, which he has ruled is "just for
 * trial and demos and for our internal use". So a controlled project has no
 * business there. When the customer-hosted build lands, the ONE shared function
 * is where "approved" gets answered and no call site changes.
 *
 * Run: node tests/regression_controlled_cloud_fences.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const helpers = S('helpers_modules.js'), notify = S('notify_agents.js'), idx = S('index.html');

// "A is before B" must FIRST require that A exists. indexOf returns -1 when it
// does not, and -1 is less than everything, so a DELETED fence reads as
// "correctly ordered". Caught by mutation: removing the Create Revision fence
// produced one failure instead of two. Same family as the checks that matched
// their own documentation earlier tonight — a check satisfied by the wrong
// evidence is not a check.
function before(hay, a, b) {
  const i = hay.indexOf(a), j = hay.indexOf(b);
  return i >= 0 && j >= 0 && i < j;
}

// Comments stripped before every check — learned three times in one session:
// a check for "must not do X" otherwise matches the comment saying it no
// longer does X, and fails against correct code.
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function fnBody(src, name) {
  const i = src.indexOf(name + '(');
  if (i < 0) return '';
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return strip(src.slice(i, j + 1)); }
  }
  return '';
}

console.log('\n[controlled] ONE shared answer, not five hand-copied ones');
const decider = fnBody(helpers, 'function _slCloudBlockedForControlled');
check('the shared decision function exists', decider.length > 0);
check('it reads the BARE identifier, not window.projectConfig',
      /typeof projectConfig !== 'undefined'/.test(decider) && !/window\.projectConfig/.test(decider),
      'the window property is permanently undefined — that is what killed two of the five fences');
check('it FAILS CLOSED when the configuration cannot be read',
      (decider.match(/could not be read/g) || []).length >= 2);
check('it returns a REASON, not a bare boolean',
      /return 'this project is marked export-controlled'/.test(decider),
      'the reason is what the user is shown and what the log records');
check('it is exposed for other modules to share',
      /window\.SLControlled/.test(strip(helpers)) && /blocksCloud/.test(strip(helpers)));

// Execute the real decider rather than asserting on its source.
{
  const fnSrc = helpers.slice(helpers.indexOf('function _slCloudBlockedForControlled'));
  const body = fnSrc.slice(0, fnSrc.indexOf('\n}') + 2);
  const ctx = { projectConfig: undefined, console };
  vm.createContext(ctx);
  vm.runInContext(body + '\nglobalThis.__f = _slCloudBlockedForControlled;', ctx);
  const f = ctx.__f;
  ctx.projectConfig = { isITARControlled: true };
  check('EXECUTED: a controlled project is blocked', typeof f({ projectConfig: { isITARControlled: true } }) === 'string');
  check('EXECUTED: an ordinary project is not blocked', f({ projectConfig: { isITARControlled: false } }) === null);
  check('EXECUTED: no configuration at all is blocked (fail closed)',
        typeof f({ projectConfig: null }) === 'string' || typeof f(null) === 'string');
}

console.log('\n[controlled] every unfenced path now consults it');
{
  const save = fnBody(helpers, 'async function saveProjectToCloud');
  check('manual Save consults the shared check', /_slCloudBlockedForControlled\(/.test(save));
  check('manual Save returns BEFORE reaching the writer',
        before(save, '_slCloudBlockedForControlled(', 'SLCloudWriter'),
        'checking after the write has started is not a fence');
  check('manual Save tells the user why', /_slControlledCloudNotice\(/.test(save));
}
{
  const rev = fnBody(helpers, 'async function createProjectRevision');
  check('Create Revision consults the shared check', /_slCloudBlockedForControlled\(/.test(rev));
  check('Create Revision refuses BEFORE it calls saveProjectToCloud',
        before(rev, '_slCloudBlockedForControlled(', 'saveProjectToCloud'),
        'its second statement uploads the whole project as a side effect of document control');
  check('Create Revision refuses outright — no confirmation path',
        !/confirm\(/.test(rev),
        'the user is never told it uploads, so a warning would move blame rather than inform');
}
{
  const send = fnBody(notify, 'function naSend');
  check('notifications consult the shared check', /SLControlled/.test(send) && /blocksCloud/.test(send));
  check('notifications have an inline fallback that FAILS CLOSED',
        /could not be read/.test(send) && /skipped: 'controlled'/.test(send));
  check('the check runs before the fetch', before(send, 'blocksCloud', 'fetch('));
}

console.log('\n[controlled] the module that owns the answer loads first');
{
  const h = idx.indexOf('helpers_modules.js'), n = idx.indexOf('notify_agents.js');
  check('helpers_modules loads before notify_agents', h > 0 && n > 0 && h < n,
        'otherwise window.SLControlled is undefined when notify_agents runs');
}
for (const [f, floor] of [['helpers_modules.js', 2.87], ['notify_agents.js', 1.4]]) {
  const m = new RegExp(f.replace('.', '\\.') + '\\?v=([0-9.]+)').exec(idx);
  check(f + ' pinned >= ' + floor, !!m && parseFloat(m[1]) >= floor, m ? m[1] : 'no pin');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
