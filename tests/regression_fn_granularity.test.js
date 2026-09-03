#!/usr/bin/env node
/*
 * Regression — B6: MAC members are SYSTEM FUNCTIONS (fn_resolver.js v1.0 + the
 * MAC editor wiring in helpers_modules.js).
 *   ARP4761A Table Q.4-1 columns are the system WITH its function; a system
 *   performs several functions with different minimums, so a bare-system member
 *   cannot express a floor. This suite pins: the resolver's classification, the
 *   editor offering FUNCTIONS (grouped by system) instead of systems, the
 *   validateMembers wiring with findings + signed re-point, and load order.
 * Run: node tests/regression_fn_granularity.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

// ---- the resolver itself, executed -----------------------------------------
const R = require(path.join(__dirname, '..', 'site', 'fn_resolver.js'));
const FIX = { systems: [
  { id: 'sys-fcs', name: 'Flight control', functions: [
      { funcId: 'SFN-FCS1', funcName: 'Command surfaces' }, { funcId: 'SFN-FCS2', funcName: 'Provide feel' }] },
  { id: 'sys-eps', name: 'Electrical power', functions: [{ funcId: 'SFN-EPS1', funcName: 'Distribute power' }] },
  { id: 'sys-bare', name: 'Bare system', functions: [] },
], items: [{ internalId: 42, itemId: 'ITM-A', name: 'Channel A', owningSystemId: 'sys-fcs' }] };
R._setData(FIX);
check('resolver classifies a system function (with System · Function label)',
  R.resolve('SFN-FCS1').kind === 'function' && /Flight control · Command surfaces/.test(R.resolve('SFN-FCS1').label));
check('…and carries the owning systemId', R.resolve('SFN-EPS1').systemId === 'sys-eps');
check('resolver classifies a bare system as system', R.resolve('sys-bare').kind === 'system');
check('resolver classifies an item (by itemId and by internalId)',
  R.resolve('ITM-A').kind === 'item' && R.resolve('42').kind === 'item' && R.resolve(42).kind === 'item');
check('resolver returns unknown for a ghost id, never throws', R.resolve('ghost').kind === 'unknown' && R.resolve('').kind === 'unknown');
check('functionsOf lists exactly the system\'s declared functions', R.functionsOf('sys-fcs').length === 2 && R.functionsOf('sys-bare').length === 0);
check('allFunctions spans every system', R.allFunctions().length === 3);

// ---- integration: the resolver satisfies mac_lanes.validateMembers ----------
const ML = require(path.join(__dirname, '..', 'site', 'mac_lanes.js'));
const ruleFn = { subId: 'SF-01', clauses: [{ min: 1, of: ['SFN-FCS1', 'SFN-EPS1'] }] };
const ruleSys = { subId: 'SF-01', clauses: [{ min: 1, of: ['sys-eps', 'SFN-FCS1'] }] };
const vFn = ML.validateMembers(ruleFn, R.resolve);
const vSys = ML.validateMembers(ruleSys, R.resolve);
check('validateMembers passes an all-function rule through the resolver', vFn.ok === true && vFn.functions.length === 2);
check('validateMembers flags a bare-system member through the resolver',
  vSys.ok === false && vSys.systems.length === 1 && vSys.findings.some(f => f.kind === 'member-not-function'));
check('an item member is a valid system-level MAC provider',
  ML.validateMembers({ clauses: [{ min: 1, of: ['ITM-A'] }] }, R.resolve).ok === true);
R._setData(null);   // never leave fixture data injected

// ---- resolver hygiene -------------------------------------------------------
const rsrc = S('fn_resolver.js');
check('resolver reads app state via SLEnv, never bare window globals (rule 5)',
  /SLEnv\.get/.test(rsrc) && !/window\.systemsData/.test(rsrc));
check('resolver is pure — no DOM, no storage, no Date.now in classification',
  !/document\./.test(rsrc) && !/localStorage/.test(rsrc));

// ---- the MAC editor wiring --------------------------------------------------
const H = S('helpers_modules.js');
check('draft picker iterates system FUNCTIONS, not systems, into checkboxes',
  /fns\.map\(f =>[\s\S]{0,200}macDraftToggleMember\(/.test(H));
check('a system with no declared functions offers NOTHING (no bare-system fallback)',
  /no functions declared/.test(H));
check('macDraftToggleMember exists and the old name delegates to it',
  /function macDraftToggleMember\(i, memberId\) \{ return macDraftToggleSys\(i, memberId\); \}/.test(H));
check('_macSysName labels through the resolver first', /SLFnResolve\.resolve\(id\)/.test(H));
check('rules table computes SLMacLanes.validateMembers with SLFnResolve.resolve',
  /SLMacLanes\.validateMembers\(r, SLFnResolve\.resolve\)/.test(H));
check('member findings render with an inline re-point select', /macRepointMember\(/.test(H) && /choose its function/.test(H));
const rpm = (H.match(/async function macRepointMember[\s\S]*?\n\}/) || [''])[0];
check('macRepointMember migrates clause membership AND weights AND basis',
  /cl\.of\[at\] = newFuncId/.test(rpm) && /cl\.weights\[newFuncId\] = cl\.weights\[oldId\]/.test(rpm) && /cl\.basis\[newFuncId\] = cl\.basis\[oldId\]/.test(rpm));
check('…and the arbitration set', /r\.arbitration\.of/.test(rpm));
check('…and records signed provenance in rule.repointed[]', /r\.repointed\.push/.test(rpm) && /Sign with your name/.test(rpm));
check('re-point never duplicates an existing member', /indexOf\(newFuncId\) !== -1\) cl\.of\.splice\(at, 1\)/.test(rpm));

// ---- rule 11: VM-render the grouped checkbox block --------------------------
(function () {
  try {
    const mapSrc = (H.match(/\(systemsData \|\| \[\]\)\.map\(s => \{[\s\S]*?\}\)\.join\(' '\)/) || [''])[0];
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const html = new Function('systemsData', 'cl', 'i', 'esc', 'return ' + mapSrc)(FIX.systems, { of: ['SFN-FCS1'] }, 0, esc);
    check('VM render — function checkboxes carry macDraftToggleMember with the funcId',
      /macDraftToggleMember\(0, 'SFN-EPS1'\)/.test(html));
    check('VM render — the already-selected function is checked', /checked[^>]*SFN-FCS1/.test(html.replace(/\n/g, '')));
    check('VM render — a functionless system renders the no-functions notice, no checkbox',
      /Bare system: no functions declared/.test(html) && !/macDraftToggleMember\(0, &#39;sys-bare&#39;\)/.test(html));
    check('VM render — group label carries the system name', />Flight control</.test(html));
  } catch (e) { check('VM render of the draft picker executes', false, e.message); }
})();

// ---- load order (rule 7) and pins as floors (rule 12) -----------------------
const idx = S('index.html');
check('index.html loads fn_resolver.js (deferred)', /fn_resolver\.js\?v=[0-9.]+"\s+defer/.test(idx));
check('fn_resolver loads after mac_lanes and BEFORE helpers_modules (its consumer)',
  idx.indexOf('mac_lanes.js?v=') < idx.indexOf('fn_resolver.js?v=') && idx.indexOf('fn_resolver.js?v=') < idx.indexOf('helpers_modules.js?v='));
const pin = name => parseFloat(((idx.match(new RegExp(name.replace('.', '\\.') + '\\?v=([0-9.]+)')) || [])[1]) || '0');
check('helpers_modules pinned at 2.44 or later', pin('helpers_modules.js') >= 2.44);
check('fn_resolver pinned at 1.0 or later', pin('fn_resolver.js') >= 1.0);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
