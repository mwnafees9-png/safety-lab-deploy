#!/usr/bin/env node
/*
 * Regression — the controlled-data AI fences. (6 Sep 2026)
 *
 * Waqas's rule, stated 6 Sep: "I don't want their data on our cloud, at any point."
 * For the AI that means a controlled project's text may not transit Safety Lab's
 * proxy even on its way to Azure Gov. The only backends that may process
 * controlled data are the customer's own — Claude via their GovCloud, their Azure
 * Government, or an on-prem model — and none of those come through AiClient.
 *
 * Before tonight the guard lived in ONE lane (the chat lane, _controlledGuard),
 * let 'itar-cloud' through, and two callers (the report writer and the settings
 * connection test) bypassed it entirely by calling AiClient directly. The fence
 * now lives at the single point every cloud-bound request passes through:
 * AiClient.messages / AiClient.embed in core_modules.js.
 *
 * Also covered: the cross-device answer cache (ai_consistency) consults the
 * project-level answer, and the never-loaded feedback client is GONE, not fenced.
 *
 * Run: node tests/regression_controlled_ai_fences.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const core = S('core_modules.js'), ai = S('ai_assistant.js'), cons = S('ai_consistency.js'), idx = S('index.html'), loader = S('ai_loader.js');
const PIN = require('./lib/pinfloor.js');

const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function before(hay, a, b) { const i = hay.indexOf(a), j = hay.indexOf(b); return i >= 0 && j >= 0 && i < j; }
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

console.log('\n[ai fence] ONE fence at the choke point (core_modules.js)');
const refusal = fnBody(core, 'function controlledRefusal');
check('controlledRefusal exists in the AI client', refusal.length > 0);
check('it prefers the SHARED project-level check (SLControlled.blocksCloud)', /SLControlled/.test(refusal) && /blocksCloud/.test(refusal));
check('it falls back to the BARE identifier, never window.projectConfig',
      /typeof projectConfig !== 'undefined'/.test(refusal) && !/window\.projectConfig/.test(refusal));
check('it FAILS CLOSED when nothing can be read', (refusal.match(/could not be read/g) || []).length >= 2);
check('it also refuses when a controlled DOCUMENT is on file', /SafetyLabSourceDocs/.test(refusal) && /\.controlled/.test(refusal));
{
  const msgs = fnBody(core, 'async function messages');
  const emb = fnBody(core, 'async function embed');
  check('messages() consults the fence', /controlledRefusal\(\)/.test(msgs));
  check('messages() refuses BEFORE any fetch', before(msgs, 'controlledRefusal()', 'fetch('));
  check('messages() no longer routes controlled data via the proxy',
        !/AI calls require Pro\+/.test(msgs), 'the old rule FORCED controlled data through our cloud');
  check('embed() consults the fence', /controlledRefusal\(\)/.test(emb));
  check('embed() refuses BEFORE any fetch', before(emb, 'controlledRefusal()', 'fetch('));
  check('the fence is exported on AiClient', /controlledRefusal, controlledRefusalMessage/.test(strip(core)));
  check('the refusal names the three approved backends, not an internal mode name',
        /Claude \(GovCloud\), Azure Government, or on-prem/.test(fnBody(core, 'function controlledRefusalMessage')) && !/itar-cloud/.test(fnBody(core, 'function controlledRefusalMessage')));
}

// Execute the real decider under each condition.
{
  const src = core.slice(core.indexOf('function controlledRefusal('));
  const body = src.slice(0, src.indexOf('\n    function controlledRefusalMessage'));
  function run(setup) {
    const ctx = { console }; vm.createContext(ctx);
    setup(ctx);
    vm.runInContext(body + '\nglobalThis.__f = controlledRefusal;', ctx);
    return ctx.__f();
  }
  check('EXECUTED: shared check says blocked → refused',
        typeof run(c => { c.window = { SLControlled: { blocksCloud: () => 'this project is marked export-controlled' } }; }) === 'string');
  check('EXECUTED: shared check clear + no controlled docs → allowed',
        run(c => { c.window = { SLControlled: { blocksCloud: () => null }, SafetyLabSourceDocs: { list: () => [{ name: 'a', controlled: false }] } }; }) === null);
  check('EXECUTED: shared check clear but a controlled document on file → refused',
        /controlled document/.test(String(run(c => { c.window = { SLControlled: { blocksCloud: () => null }, SafetyLabSourceDocs: { list: () => [{ name: 'SDD', controlled: true }] } }; }))));
  check('EXECUTED: no shared check, bare projectConfig controlled → refused',
        typeof run(c => { c.window = {}; c.projectConfig = { isITARControlled: true }; }) === 'string');
  check('EXECUTED: no shared check, bare projectConfig clear → allowed',
        run(c => { c.window = {}; c.projectConfig = { isITARControlled: false }; }) === null);
  check('EXECUTED: nothing readable at all → refused (fail closed)',
        typeof run(c => { c.window = {}; }) === 'string');
}

console.log('\n[ai fence] the duplicate chat-lane guard is gone, its stamp survives');
check('_controlledGuard no longer exists', !/function _controlledGuard/.test(strip(ai)) && !/_controlledGuard\(\)/.test(strip(ai)));
{
  const anem = fnBody(ai, 'async function _anemRun');
  check('_anemRun no longer carries its own guard', anem.length > 0 && !/controlled/i.test(anem));
  const complete = fnBody(ai, 'async complete');
  check('the local branch stamps processedVia/processedAt for controlled documents',
        /processedVia = 'local'/.test(complete) && /processedAt/.test(complete));
}
{
  const route = fnBody(ai, 'route');
  check('route(): controlled data allowed on the LOCAL backend only (itar-cloud refused too)',
        /controlled && mode !== 'local'/.test(route) && !/controlled && mode === 'cloud'/.test(route),
        "'itar-cloud' is our proxy → Azure Gov; it still transits our cloud");
  check('route(): the reason names the approved backends', /Claude \(GovCloud\), Azure Government, or on-prem/.test(route));
}
check('no user-facing text still says "on-prem / ITAR backend" or "Azure-Gov (ITAR)"',
      !/on-prem \/ ITAR backend/.test(ai) && !/Azure-Gov \(ITAR\) backend/.test(ai));

console.log('\n[ai fence] the cross-device answer cache consults the project-level answer');
{
  const pc = fnBody(cons, 'function _projectControlled');
  check('_projectControlled exists', pc.length > 0);
  check('it uses the shared check first', /SLControlled/.test(pc) && /blocksCloud/.test(pc));
  check('it fails CLOSED (returns true when nothing is readable)', (pc.match(/return true/g) || []).length >= 2);
  const rc = fnBody(cons, 'function _reqControlled');
  check('_reqControlled consults it FIRST', before(rc, '_projectControlled()', 'data_classification'));
  const src = cons.slice(cons.indexOf('function _projectControlled('));
  const body = src.slice(0, src.indexOf('\n    function _reqControlled'));
  function run(setup) { const ctx = { console }; vm.createContext(ctx); setup(ctx); vm.runInContext(body + '\nglobalThis.__f = _projectControlled;', ctx); return ctx.__f(); }
  check('EXECUTED: blocked project → true', run(c => { c.window = { SLControlled: { blocksCloud: () => 'x' } }; }) === true);
  check('EXECUTED: clear project → false', run(c => { c.window = { SLControlled: { blocksCloud: () => null } }; }) === false);
  check('EXECUTED: nothing readable → true', run(c => { c.window = {}; }) === true);
}

console.log('\n[ai fence] dead code deleted, not fenced');
check('feedback_client_module.js is gone (it was never loaded by index.html)',
      !fs.existsSync(path.join(SITE, 'feedback_client_module.js')) && !/feedback_client_module/.test(idx));

console.log('\n[ai fence] pins');
check('core_modules >= 1.4', PIN.atLeast(idx, 'core_modules.js', '1.4'));
check('ai_loader >= 8.52', PIN.atLeast(idx, 'ai_loader.js', '8.52'));
check('ai_assistant >= 76.61 (loader)', PIN.atLeast(loader, 'ai_assistant.js', '76.61'));
check('ai_consistency >= 1.4 (loader)', PIN.atLeast(loader, 'ai_consistency.js', '1.4'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
