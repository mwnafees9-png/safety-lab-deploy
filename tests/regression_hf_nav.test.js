// regression_hf_nav.test.js — every HF lane is known to the navigation, by construction.
//
// Waqas, 2 Sep 2026: "why is it when I select some of the stuff in the HF drop down it
// also opens aircraft level analyses". Two hand-maintained lists had drifted from the DOM:
//
//   1. switchTab's `tabs` registry (the views it can show/hide, remember, and mirror onto
//      the sidebar) carried hfa / hfa-task / hfa-ergo and none of the seven HF lanes added
//      after them. Their own module hid and showed them, so nothing stacked — but the
//      sidebar active state, last-tab memory and the workflow stepper all read the
//      registry and were blind to seven lanes.
//   2. _renderSidebarContext's auto-expand lists still placed the three original HF tabs
//      under PASA, from before Human Factors became its own top-level group — so picking
//      them expanded Aircraft-level + PASA (the symptom), while the seven newer ones were
//      listed nowhere and expanded nothing.
//
// The fix is the same shape both times this file has seen it: derive from the DOM /
// match by prefix rather than restate the list. This suite pins BOTH lists to the DOM so
// the next HF lane cannot be forgotten in either.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? ('\n       ' + extra) : '')); }
}
console.log('\nregression_hf_nav — the HF lanes are known to switchTab and the sidebar\n');

const idx = R('site/index.html');
const support = R('site/support_modules.js');
const helpers = R('site/helpers_modules.js');

// the DOM is the source of truth: every HF sidebar item, by id
const snav = [...idx.matchAll(/id="snav-(hfa[a-z-]*)"/g)].map(m => m[1]);
ok('the sidebar carries the HF lanes', snav.length >= 10, snav.join(','));
ok('HF is its own top-level sidebar group', /id="asb-grp-hf"/.test(idx));
ok('every HF sidebar item sits inside the HF group', (() => {
    const start = idx.indexOf('id="asb-grp-hf"');
    const end = idx.indexOf('</details>', idx.indexOf('id="snav-hfa-mfc"'));
    return snav.every(id => { const p = idx.indexOf('id="snav-' + id + '"'); return p > start && p < end; });
})());

// 1. switchTab's registry
const tabs = (support.match(/const tabs = \[([^\]]*)\];/) || ['', ''])[1];
const registered = [...tabs.matchAll(/'([^']+)'/g)].map(m => m[1]);
snav.forEach(id => ok('switchTab registers ' + id, registered.indexOf(id) >= 0));
ok('the omission is recorded where the list lives', /the seven HF sub-lanes added after hfa-task\/hfa-ergo were never\s*\n\s*\/\/ registered here/.test(support));

// 2. the sidebar auto-expand
ok('HF auto-expand is matched by PREFIX, not a hand list', /const inHf\s+= cur\.indexOf\('hfa'\) === 0;/.test(helpers));
ok('the HF group is what opens for an HF tab', /openIf\('asb-grp-hf', inHf\);/.test(helpers));
const inPasa = (helpers.match(/const inPasa = \[([^\]]*)\]/) || ['', ''])[1];
ok('no HF tab is listed under PASA any more', !/hfa/.test(inPasa), inPasa);
ok('the symptom and its cause are recorded', /also\s*\n\s*\/\/ opens aircraft level analyses/.test(helpers) && /a hand-maintained list drifting from\s*\n\s*\/\/ the DOM/.test(helpers));

// EXECUTED: the expand logic, lifted and run for every HF tab + an aircraft tab
(function behaviour() {
    const body = (helpers.match(/const openIf = \(gid, cond\)[\s\S]*?openIf\('asb-grp-hf', inHf\);/) || [''])[0];
    ok('expand logic lifted', body.length > 400);
    const run = cur => {
        const opened = {};
        const openIfStub = (gid, cond) => { if (cond) opened[gid] = true; };
        const src = body.replace(/const openIf = \(gid, cond\) => \{[^\n]*\n/, '');
        new Function('cur', 'openIf', src)(cur, openIfStub);
        return opened;
    };
    snav.forEach(id => {
        const o = run(id);
        ok(id + ' opens the HF group and NOT Aircraft-level', o['asb-grp-hf'] === true && !o['asb-grp-aircraft'] && !o['asb-grp-pasa'], JSON.stringify(o));
    });
    const ac = run('ac-fha');
    ok('an aircraft tab still opens Aircraft-level + AFHA and not HF', ac['asb-grp-aircraft'] && ac['asb-grp-afha'] && !ac['asb-grp-hf']);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
