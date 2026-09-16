#!/usr/bin/env node
/*
 * Regression — a project saved in one door opens in the other (16 Sep 2026).
 *
 * THE DEFECT. The web app has always saved `Safety_Lab_<name>.sl` and its Load input accepted
 * ".sl,.json". The desktop shell defaulted its Save dialog to `Untitled.slab` and filtered its
 * Open dialog on slab/json, with no All Files escape anywhere in main.js. Same JSON inside both
 * files. The consequence was symmetric and silent:
 *
 *   web save (.sl)   -> desktop Open dialog does not list it
 *   desktop save (.slab) -> the web file input will not select it
 *
 * Which cuts straight across the stated goal for these two doors: sign in once, same files, edit
 * in either, like Office. A Radia engineer on the desktop trying a file from the web demo hits
 * it on the first attempt.
 *
 * THE RULE THIS PINS. One name for the format -- .sl -- and BOTH sides open all three spellings,
 * so nothing anyone has already saved stops working. Plus an All Files escape on the desktop, so
 * a picker filter can never again be the thing that hides a user's own file.
 *
 * Run: node tests/regression_project_file_extension.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const DESK = path.join(REPO, '..', 'safety-lab-desktop');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');

const idx = read('site/index.html');
const helpers = read('site/helpers_modules.js');
const core = read('site/core_modules.js');
const deskMain = fs.existsSync(path.join(DESK, 'main.js')) ? fs.readFileSync(path.join(DESK, 'main.js'), 'utf8') : '';

console.log('\n[name] one extension for the project file');
check('the web saves .sl', /const fileName = 'Safety_Lab_' \+ _safeFileName\(projectName\) \+ '\.sl'/.test(helpers));
check('the desktop no longer defaults to .slab',
  !/defaultPath: target \|\| 'Untitled\.slab'/.test(deskMain),
  'the two doors disagreeing about the extension is the whole defect');
check('the desktop defaults to .sl', /defaultPath: target \|\| 'Untitled\.sl'/.test(deskMain));

console.log('\n[open] each door opens what the other one writes');
const webAccept = (idx.match(/id="load-file"[^>]*accept="([^"]+)"/) || [])[1] || '';
for (const ext of ['.sl', '.slab', '.json']) {
  check('the web Load input accepts ' + ext, webAccept.split(',').map(s => s.trim()).includes(ext), webAccept);
}
const openFilters = (deskMain.match(/title: 'Open Safety Lab project'[\s\S]{0,300}?filters: \[([\s\S]*?)\]\s*\}\)/) || [])[1] || '';
for (const ext of ['sl', 'slab', 'json']) {
  check("the desktop's Open dialog lists ." + ext, new RegExp("'" + ext + "'").test(openFilters), openFilters.slice(0, 120));
}
check('the desktop Open dialog has an All Files escape', /'\*'/.test(openFilters),
  'a filter must never be the only reason a user cannot see their own file');

console.log('\n[save] the desktop save dialog still offers both spellings');
const saveFilters = (deskMain.match(/title: 'Save Safety Lab project'[\s\S]{0,400}?filters: \[([\s\S]*?)\]\s*\}\)/) || [])[1] || '';
check("save offers .sl", /'sl'/.test(saveFilters));
check("save still offers .slab, so re-saving an older file keeps its name", /'slab'/.test(saveFilters));

console.log('\n[picker] the browser save picker knows both');
check('the file-picker type map has sl', /sl:\s*\{ description: 'Safety Lab project'/.test(core));
check('the file-picker type map has slab', /slab:\s*\{ description: 'Safety Lab project'/.test(core));

console.log('\n[cross-door] the concrete round trip, stated as the check',
  '');
{
  // web writes .sl -> desktop must open it; desktop writes .sl -> web must accept it.
  const webWrites = /\+ '\.sl'/.test(helpers) ? '.sl' : null;
  const deskOpens = ['sl', 'slab', 'json'].filter(e => new RegExp("'" + e + "'").test(openFilters)).map(e => '.' + e);
  const webAccepts = webAccept.split(',').map(s => s.trim());
  const deskWrites = /'Untitled\.sl'/.test(deskMain) ? '.sl' : (/'Untitled\.slab'/.test(deskMain) ? '.slab' : null);
  check('a file the web saves is listed by the desktop Open dialog',
    !!webWrites && deskOpens.includes(webWrites), 'web writes ' + webWrites + ', desktop opens ' + deskOpens.join(' '));
  check('a file the desktop saves is selectable in the web Load input',
    !!deskWrites && webAccepts.includes(deskWrites), 'desktop writes ' + deskWrites + ', web accepts ' + webAccepts.join(' '));
}

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);
