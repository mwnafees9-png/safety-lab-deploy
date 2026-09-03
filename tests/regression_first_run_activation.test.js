#!/usr/bin/env node
/*
 * Regression — a brand-new account must be offered a worked example.
 *
 * On 31 Jul 2026, 30 of 38 accounts had never created a single project. Every
 * account that did engage loaded a demo first. The demo is the activation
 * event, and two defects were suppressing it:
 *
 *   1. initNewProjectState() always seeds ftaPages with ONE page whose root is
 *      null. Both the on-ramp checklist and the guided tour counted PAGES, so a
 *      completely empty project reported a fault tree. The new user's Getting
 *      Started card opened reading 1/5 with "Build a fault tree" already ticked,
 *      and clicking the tour warned them it would "REPLACE the data currently in
 *      this session" — data they had not created.
 *
 *   2. The only automatic worked-example offer (the welcome modal) is painted at
 *      z-index 2000 while the auth gate sits at 2147483600, so on a genuinely
 *      new account it renders underneath the gate, then the EULA and signup
 *      modals stack on top. The richer openDemoPicker() was reachable only from
 *      a dropdown menu item.
 *
 * Run: node tests/regression_first_run_activation.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const app   = S('safety_lab.js');
const tour  = S('onboarding_tour.js');
const first = S('first_run.js');
const index = S('index.html');
const misc  = S('misc_fn_modules.js');

// ---- the seed that caused it still exists, so the guards must stay ---------
check('initNewProjectState still seeds one rootless fault-tree page',
  /ftaPages = \[\{ id: 'page-' \+ Date\.now\(\), name: 'Untitled Fault Tree', root: null \}\]/.test(misc),
  'if this changed, re-read the predicates below — they exist because of it');

// ---- 1. predicates must count TREES, not pages ----------------------------
check('the on-ramp counts trees, not pages', /_treeCount\(\) > 0/.test(app));
check('_treeCount requires a root', /_treeCount[\s\S]{0,400}?\[i\]\.root/.test(app));
check('the on-ramp no longer counts ftaPages length for step 4',
  !/tab: 'fta', done: function \(\) \{ return _len\(typeof ftaPages/.test(app));
check('the guided tour counts trees, not pages',
  /trees\(\) > 0/.test(tour) && /filter\(p => p && p\.root\)/.test(tour));
check('the tour no longer counts ftaPages length',
  !/\|\| len\(typeof ftaPages !== 'undefined' && ftaPages\) > 0/.test(tour));

// ---- 2. the first-run offer ------------------------------------------------
check('first_run.js is wired into index.html', /src="first_run\.js/.test(index));
check('first_run.js loads after demo_picker.js',
  index.indexOf('first_run.js') > index.indexOf('demo_picker.js'),
  'it calls openDemoPicker; loading first would rely entirely on the poll');
check('the offer is gated on a persistent flag', /safetyLab\.firstRun\.v1/.test(first));
check('the offer waits for the auth gate', /getElementById\('sl-auth-gate'\)/.test(first));
check('the offer waits for the EULA', /getElementById\('sl-eula-overlay'\)/.test(first));
check('the offer has a kill switch', /SL_FIRST_RUN_OFFER/.test(first));
check('the chooser is also injected into the on-ramp', /sl-demo-launch/.test(first));

// ---- behavioural: the emptiness predicate ---------------------------------
const src = (first.match(/function _isEmpty\(\)[\s\S]*?\n    \}/) || [])[0];
check('the _isEmpty body was located', !!src);

if (src) {
  const run = (globals) => {
    const ctx = Object.assign({ console }, globals);
    vm.createContext(ctx);
    vm.runInContext(src + '\n_isEmpty();', ctx, { filename: 'isEmpty.js' });
    return vm.runInContext('_isEmpty()', ctx);
  };
  const fresh = { acFunctionsData: [], acFhaData: [], systemsData: [], acReqData: [], itemsData: [],
                  ftaPages: [{ id: 'page-1', name: 'Untitled Fault Tree', root: null }],
                  projectName: 'Untitled Project' };

  check('a freshly-initialised project counts as empty', run(fresh) === true,
    'this is the exact state initNewProjectState leaves behind — if false, the offer never fires');
  check('a project with a real tree is not empty',
    run(Object.assign({}, fresh, { ftaPages: [{ id: 'p', root: { id: 1, name: 'Top' } }] })) === false);
  check('a project with functions is not empty',
    run(Object.assign({}, fresh, { acFunctionsData: [{ id: 1 }] })) === false);
  check('a project with failure conditions is not empty',
    run(Object.assign({}, fresh, { acFhaData: [{ id: 1 }] })) === false);
  check('a renamed project is not empty',
    run(Object.assign({}, fresh, { projectName: 'Sylla 2.0' })) === false,
    'a named project is somebody\'s work even if the arrays are still empty');
  check('a loaded showcase is not empty',
    run(Object.assign({}, fresh, { projectName: 'K350 Kestrel · Program Showcase', systemsData: [{ id: 1 }] })) === false);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
