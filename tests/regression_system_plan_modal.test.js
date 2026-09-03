#!/usr/bin/env node
/*
 * Regression — per-system analysis scope lives in the system's own modal, and
 * covers EVERY analysis.
 *
 * Two defects, one card (#15):
 *
 *   1. renderSystemPlans() printed a card per system on the Program Planning
 *      page — a chip grid plus a version-history accordion, for every system in
 *      the programme — and it is called on every route to that tab. That page is
 *      the AIRCRAFT plan; by ten systems it was mostly other systems' scope.
 *
 *   2. It only ever offered planLanes(), the top-level lanes. The nine sub-lanes
 *      (Bow-Tie, Routing, CCMR, FMES, Independence Ledger, Task Analysis,
 *      Ergonomics, LORA, SORA) were never selectable per system at all, so a
 *      system inherited them silently with no way to see or tailor them.
 *
 * And creating a system called initSystemPlan(id, null) — inheriting the
 * aircraft scope with no UI anywhere, so the decision was invisible.
 *
 * The modal is a new SURFACE on existing machinery: every write still goes
 * through setSystemLane(), so the revision history, diff, author and signed
 * tailoring opt-out are unchanged. This suite pins that it stays that way.
 *
 * Run: node tests/regression_system_plan_modal.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const pp   = S('program_plan.js');
const help = S('helpers_modules.js');
const idx  = S('index.html');

// ---- the modal exists and is exported --------------------------------------
check('openSystemPlanModal is defined', /function openSystemPlanModal\(sysId\)/.test(pp));
check('closeSystemPlanModal is defined', /function closeSystemPlanModal\(\)/.test(pp));
['openSystemPlanModal', 'closeSystemPlanModal', 'allPlanLanes'].forEach(fn =>
  check(fn + ' is on the public API', new RegExp('\\b' + fn + '\\b[,\\s]').test(pp.slice(pp.lastIndexOf('const API = {')))));

// ---- EVERY analysis, not just the top-level lanes --------------------------
check('the modal walks the whole CATALOGUE, not planLanes()',
  /function allPlanLanes\(\) \{ return CATALOGUE\.slice\(\); \}/.test(pp));
check('sub-lanes are rendered under their parent', /_childrenOf\(l\.id\)\.forEach/.test(pp));
check('a sub-lane is disabled when its parent is out of scope',
  /parentOff = l\.parent \? !systemLaneOn\(sysId, l\.parent\) : false/.test(pp),
  'offering a sub-lane whose parent is off promises what the gate will not honour');
// every sub-lane in the catalogue must have a parent that exists, or the nesting drops it
const subs = [...pp.matchAll(/\{ id: '([^']+)',[^}]*?parent: '([^']+)'/gs)].map(m => [m[1], m[2]]);
check('the catalogue has sub-lanes to render', subs.length >= 8, subs.length + ' found');
const ids = new Set([...pp.matchAll(/\{ id: '([^']+)',\s*group:/g)].map(m => m[1]));
check('every sub-lane parent resolves', subs.every(([, p]) => ids.has(p)),
  'an orphan sub-lane would vanish from the modal: ' + subs.filter(([, p]) => !ids.has(p)).map(x => x[0]).join(', '));

// ---- the machinery underneath is unchanged ---------------------------------
check('writes still go through setSystemLane', /_sysToggle\(sysId, laneId, \{ silent: true \}\)/.test(pp));
check('_sysToggle returns a promise so the modal re-renders after the write lands',
  /return Promise\.resolve\(ask\('Tailoring opt-out/.test(pp) && /return Promise\.resolve\(true\)/.test(pp));
check('the checkbox is reverted until the write lands',
  /cb\.checked = !want;/.test(pp),
  'a refused tailoring opt-out must not leave a ticked box behind');
check('the signed tailoring contract is intact',
  /rat\.length < 10 \|\| !sig/.test(pp) && /needs a rationale \(>=10 chars\) and a signature|needs a rationale \(≥10 chars\) and a signature/.test(pp));
// safety_lab.css carries a GLOBAL `label { text-transform: uppercase }`. The modal
// renders each lane as a <label>, so without a local opt-out every lane name and
// standard reference shipped in caps — found only by opening it in the live tool.
check('the modal opts out of the global uppercase label rule',
  /cursor:pointer; text-transform:none;/.test(pp),
  'lane names render in CAPS without this');
check('the per-system blurb no longer tells people to click chips',
  !/Click a chip to toggle/.test(pp),
  'the chips moved into the modal');

check('expected lanes are marked in the modal', /expected<\/span>/.test(pp));
check('version history is shown in the modal', /renderPlanHistory\(pl\)/.test(pp.slice(pp.indexOf('function openSystemPlanModal'))));

// ---- the Program Planning page got leaner ----------------------------------
// Slice renderSystemPlans by brace-matching. A naive slice to the next function
// would swallow the modal, which sits between them — and then this suite would
// happily report the page still inlines history that in fact moved.
function fnBody(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}
const spp = fnBody(pp, 'renderSystemPlans');
check('the SPP renderer body was located', spp.length > 200);
check('the SPP page no longer prints a chip grid per system',
  !/lanes\.map\(function \(l\) \{ return chip\(sys\.id, l\); \}\)/.test(spp),
  'that grid is what made the aircraft plan grow with every system');
check('the SPP page no longer inlines per-system version history',
  !/renderPlanHistory\(pl\)/.test(spp));
check('each system is one row with a Scope button', /openSystemPlanModal\(/.test(spp) && /Scope ›/.test(spp));
check('the row still states coverage and revision', /' of ' \+ total \+ ' analyses/.test(spp));

// ---- routes in ------------------------------------------------------------
check('the system workspace banner opens the modal, not a tab jump',
  /Edit scope ›/.test(pp) && !/switchTab\(\\?'spp\\?'\)[^]{0,80}Edit plan/.test(pp));
check('creating a system opens the scope modal',
  /PROGRAM_PLAN\.openSystemPlanModal\(newSys\.id\)/.test(help),
  'inheritance should be a decision the engineer sees, not a silent default');
check('creating a system still seeds the plan first',
  help.indexOf('initSystemPlan(newSys.id, null)') < help.indexOf('openSystemPlanModal(newSys.id)'));

// ---- cache busters ---------------------------------------------------------
// Assert the buster MOVED PAST the build that added the modal, not that it equals
// one exact value — pinning the literal is what made two other suites in this repo
// fail on unrelated edits tonight.
const ppVer   = PIN.pinOf(idx, 'program_plan.js');
const helpVer = PIN.pinOf(idx, 'helpers_modules.js');
check('program_plan.js buster is at or past the modal build', PIN.pinAtLeast(ppVer, '0.8'), 'found v=' + ppVer);
check('helpers_modules.js buster is at or past the modal build', PIN.pinAtLeast(helpVer, '2.14'), 'found v=' + helpVer);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
